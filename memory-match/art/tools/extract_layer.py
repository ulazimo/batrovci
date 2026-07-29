#!/usr/bin/env python3
"""Extract a hall item as a full-scene tableau layer by diffing an edit against
the untouched backdrop.

The pipeline this belongs to (see ../SCENE-LAYERS-PLAN.md):

    backdrop.jpeg  --Layer image-edit-->  edited.png   ("add the teddy bear
                                                         sitting on the stool")
    backdrop.jpeg + edited.png  --this script-->  scene/teddybear.png
                                                  + teddybear.png (tight crop)

Because the **base is never regenerated**, the item's layer is just "the pixels
that changed", so compositing it back over the backdrop reproduces the edit
inside the mask — including the contact shadow, the occlusion and the room's
light spilling onto the object. That is the whole point: the item was painted
*into* the picture, not pasted on top of it, and yet it still detaches so an
unearned item is absent.

Note the edit is NOT the backdrop plus an object: an editing model re-decodes the
whole frame, so every pixel comes back a few levels off. Only what the mask keeps
is used and the rest of the backdrop is untouched, which is why `spill` sits
around 5-6 even on a perfectly clean edit and is not by itself a reject.

    python3 extract_layer.py --base ../backdrops/cozy-attic.jpeg \\
        --outdir ../attic/scene --tight-outdir ../attic --audit \\
        raw/attic/teddybear.png raw/attic/globe.png

Each input's basename is the item key. Outputs, per item:

  <outdir>/<key>.png        full canvas, RGBA, item at its baked position
                            -> COLLECTIONS.items[key].layer, slot kind 'layer'
  <tight-outdir>/<key>.png  cropped tight to the subject, long side 512
                            -> COLLECTIONS.items[key].file (behind-board reveal)
  <key>.audit.png           5-up QA sheet, written next to the layer

**Always look at the audit sheet.** The two numbers that decide whether an edit is
usable are printed per item and drawn on the sheet:

  keep%     how much of the frame the layer claims. A plausible item is ~0.5-8%.
            30%+ means the model repainted the room and the "layer" is now half
            the scene — redo that edit with a more surgical prompt.
  spill     mean abs difference OUTSIDE the kept mask. This is edit we are
            throwing away: global colour drift, a re-rendered window, resampling.
            With an editing model that re-decodes the frame this is ~5-6 for a
            good edit, so treat it as context, not a gate. What it cannot see at
            all is a layer repainting ANOTHER slot's furniture — for that run
            check_hall_layers.py over the finished hall.

Why each step exists:

1. Both images are blurred slightly before diffing. Layer returns a re-encoded
   PNG/JPEG, so identical regions still differ by a few levels; without the blur
   the mask is pepper noise along every high-contrast edge in the room.
2. The threshold is derived from the image's own noise floor (median + k*MAD),
   not a constant. A dark attic and a blown-out kitchen window have very
   different floors.
3. The primary blob is the one with the most diff ENERGY ABOVE THE NOISE FLOOR
   (area * mean excess over `thresh`), NOT the largest by area.

   This matters because an editing model re-decodes the whole frame — the base is
   *not* handed back pixel-identical, whatever the prompt asks for. A faint drift
   region tracing every edge in the room easily out-areas a compact added object,
   and selecting by area then returns a layer containing the drift and not the
   item: silently, with a plausible-looking keep%. Measured on Gemini 3 Pro Image
   Edit that happened in 2 of 4 test edits (spill ~7, keep 4.6%, no object).

   Weighting by excess collapses the ambiguity: drift sits just above `thresh` so
   its excess is ~0, while a real object is far above it. Blobs under
   MIN_AREA_FRAC are barred from winning so a sharp speck cannot. Kept alongside
   the primary are blobs within LINK_PX of it — that picks up a cast shadow that
   does not touch the object. Dropped blobs are reported with their bboxes so a
   real second change is not silently discarded, and `margin` (primary energy /
   runner-up energy) is flagged when it is thin, which is the cue to look hard at
   panel 5 rather than trusting the numbers.
4. Holes are filled: an item pixel that happens to match the backdrop behind it
   (a cream bowl against a cream cabinet) must stay part of the item, or the
   layer gets see-through freckles.
5. Alpha is feathered ~1.2px. RGB is preserved out to BLEED_PX past the alpha
   edge — comfortably beyond the feather's reach — so no fringe can appear.
   Beyond that it is flattened: these are full-canvas RGBA files served to a
   browser, and carrying the whole room under a zero alpha cost ~3.2MB each
   (80MB across 25 layers) for pixels that can never be seen.
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import (
    binary_closing,
    binary_dilation,
    binary_fill_holes,
    distance_transform_edt,
    gaussian_filter,
    label,
)

DIFF_BLUR = 1.0        # step 1
THRESH_K = 6.0         # step 2 — multiples of MAD above the median
MIN_THRESH = 14.0      # absolute floor, 0-255
CLOSE_PX = 3           # step 3 — gap closing before labelling
MIN_AREA_FRAC = 2e-4   # blobs smaller than this fraction of frame are noise
LINK_PX = 28           # step 3 — keep blobs this close to the primary one
FEATHER_SIGMA = 1.2    # step 5
BLEED_PX = 6           # RGB kept this far past the alpha edge; see the layer output
TIGHT_LONG_SIDE = 512
# board-bg.js draws the behind-board reveal at up to 0.9 * board height — several
# hundred device px. An item occupying ~12% of a 1024-tall edit crops to ~130px,
# which visibly blurs there. Warn rather than ship soft board art; see
# ../SCENE-LAYERS-PLAN.md "Board art resolution".
MIN_TIGHT_LONG_SIDE = 400
ALPHA_EPS = 0.02


def extract_one(base_rgb, edited_path, key, args):
    """Return (layer RGBA Image, tight RGBA Image, stats dict, audit Image)."""
    bh, bw, _ = base_rgb.shape
    ed_img = Image.open(edited_path).convert("RGB")
    ew, eh = ed_img.size
    aspect_delta = abs(ew / eh - bw / bh)

    # The mask is computed at the BASE resolution — upscaling the base to meet a
    # larger edit would blur its edges and manufacture diff along every one.
    ed_small = np.asarray(
        ed_img if (ew, eh) == (bw, bh) else ed_img.resize((bw, bh), Image.LANCZOS)
    ).astype(np.float32)

    # --- 1. blur both, then per-pixel channel-max difference -----------------
    a = gaussian_filter(base_rgb, (DIFF_BLUR, DIFF_BLUR, 0))
    b = gaussian_filter(ed_small, (DIFF_BLUR, DIFF_BLUR, 0))
    d = np.abs(a - b).max(axis=2)

    # --- 2. threshold from the image's own noise floor ----------------------
    med = float(np.median(d))
    mad = float(np.median(np.abs(d - med))) or 1.0
    thresh = max(MIN_THRESH, med + THRESH_K * mad) if args.thresh is None else args.thresh
    mask = d > thresh

    # --- 3. keep the primary blob and anything hugging it -------------------
    if CLOSE_PX:
        mask = binary_closing(mask, iterations=CLOSE_PX)
    lab, n = label(mask)
    dropped = []
    if n == 0:
        raise ValueError("no change detected — is this the same image as the base?")
    areas = np.bincount(lab.ravel(), minlength=n + 1).astype(np.int64)
    areas[0] = 0
    # Diff energy above the noise floor, per blob — see step 3 in the module
    # docstring for why raw area is the wrong ranking against a re-decoded frame.
    energy = np.bincount(lab.ravel(),
                         weights=np.clip(d - thresh, 0.0, None).ravel(),
                         minlength=n + 1)
    energy[0] = 0.0
    min_area = max(16, int(MIN_AREA_FRAC * bw * bh))
    cand = energy.copy()
    cand[areas < min_area] = 0.0          # a sharp speck must not win
    primary = int(cand.argmax()) if cand.max() > 0.0 else int(areas.argmax())
    ranked = np.sort(cand)[::-1]
    margin = (float(ranked[0] / ranked[1])
              if ranked.size > 1 and ranked[1] > 0.0 else float("inf"))
    keep = lab == primary
    near = binary_dilation(keep, iterations=args.link_px)
    for lb in range(1, n + 1):
        if lb == primary:
            continue
        m = lab == lb
        if areas[lb] < min_area:
            continue
        if (m & near).any():
            keep |= m
        else:
            ys, xs = np.where(m)
            dropped.append((int(areas[lb]), int(xs.min()), int(ys.min()),
                            int(xs.max()) + 1, int(ys.max()) + 1))

    # --- 4. an item pixel matching the backdrop is still an item pixel ------
    keep = binary_fill_holes(keep)

    # --- 5. feather alpha; keep RGB everywhere ------------------------------
    alpha = np.clip(gaussian_filter(keep.astype(np.float32), FEATHER_SIGMA), 0.0, 1.0)
    alpha[keep] = 1.0

    keep_frac = float(keep.mean())
    spill = float(d[~keep].mean()) if (~keep).any() else 0.0
    # How faithfully the layer-over-backdrop reproduces the edit, inside the mask.
    inside = float(d[keep].mean()) if keep.any() else 0.0

    # --- output the layer at the BASE's resolution --------------------------
    # The hall draws the layer cover-cropped into the same box as the backdrop, so
    # anything beyond the backdrop's own resolution is wasted bytes — and these are
    # full-canvas RGBA files shipped over the web. Emitting a 2x edit gave 3.2MB per
    # layer (80MB for 25) against ~80KB for a backdrop. --layer-at-edit opts out.
    out_w, out_h = ((ew, eh) if (args.layer_at_edit and ew * eh > bw * bh)
                    else (bw, bh))
    ed_full = np.asarray(
        ed_img if (ew, eh) == (out_w, out_h)
        else ed_img.resize((out_w, out_h), Image.LANCZOS)
    ).astype(np.float32)
    a_full = (
        alpha if (out_w, out_h) == (bw, bh)
        else np.asarray(
            Image.fromarray((alpha * 255).astype(np.uint8), "L")
            .resize((out_w, out_h), Image.LANCZOS)
        ).astype(np.float32) / 255.0
    )
    # Keep real RGB only where it can ever be seen — inside the mask plus a bleed
    # wider than the feather — and flatten the rest. Storing the whole room in RGB
    # under a zero alpha is invisible but costs most of the file: a detailed image
    # does not compress, a flat one nearly vanishes. BLEED_PX comfortably exceeds
    # FEATHER_SIGMA's reach, so no pixel with alpha > 0 loses its colour and the
    # "no fringe" guarantee is unchanged.
    seen = binary_dilation(a_full > ALPHA_EPS, iterations=BLEED_PX)
    ed_full = np.where(seen[..., None], ed_full, 0.0)
    layer = Image.fromarray(
        np.dstack([ed_full, a_full * 255.0]).astype(np.uint8), "RGBA"
    )

    # --- the tight crop for the behind-board reveal -------------------------
    ys, xs = np.where(a_full > ALPHA_EPS)
    tight = layer.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    # Bleed colour outward so the feathered edge cannot reveal the room it came
    # from once the crop is drawn over the board's own background.
    t = np.asarray(tight).astype(np.float32)
    solid = t[..., 3] > 250
    if solid.any() and not solid.all():
        iy, ix = distance_transform_edt(~solid, return_indices=True, return_distances=False)
        t[..., :3] = np.where(solid[..., None], t[..., :3], t[iy, ix][..., :3])
        tight = Image.fromarray(t.astype(np.uint8), "RGBA")
    scale = TIGHT_LONG_SIDE / max(tight.size)
    if scale < 1.0:
        tight = tight.resize(
            (max(1, round(tight.size[0] * scale)), max(1, round(tight.size[1] * scale))),
            Image.LANCZOS,
        )

    stats = {
        "key": key, "thresh": thresh, "keep_frac": keep_frac, "spill": spill,
        "inside": inside, "dropped": dropped, "layer_size": (out_w, out_h),
        "tight_size": tight.size, "aspect_delta": aspect_delta, "margin": margin,
        "bbox": (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1),
    }
    audit = audit_sheet(base_rgb, ed_small, d, thresh, keep, alpha, stats) if args.audit else None
    return layer, tight, stats, audit


def audit_sheet(base_rgb, ed_small, d, thresh, keep, alpha, stats):
    """base | edit | diff | mask over base | layer recomposited over base."""
    h, w, _ = base_rgb.shape
    panels = [base_rgb, ed_small]

    dv = np.clip(d / max(thresh * 2.0, 1.0), 0, 1)
    panels.append(np.dstack([dv, dv, dv]) * 255.0)

    over = base_rgb * 0.35 + np.array([255.0, 0.0, 255.0]) * 0.65
    panels.append(np.where(keep[..., None], over, base_rgb))

    al = alpha[..., None]
    panels.append(ed_small * al + base_rgb * (1.0 - al))

    scale = 320 / w
    tw, th = int(w * scale), int(h * scale)
    sheet = Image.new("RGB", (tw * len(panels), th), (18, 18, 24))
    for i, p in enumerate(panels):
        sheet.paste(
            Image.fromarray(np.clip(p, 0, 255).astype(np.uint8), "RGB").resize(
                (tw, th), Image.LANCZOS
            ),
            (i * tw, 0),
        )
    return sheet


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+", help="edited scenes; basename = item key")
    ap.add_argument("--base", required=True, help="the untouched hall backdrop")
    ap.add_argument("--outdir", required=True, help="where full-canvas layers go")
    ap.add_argument("--tight-outdir", help="where tight board crops go (optional)")
    ap.add_argument("--audit", action="store_true", help="write <key>.audit.png")
    ap.add_argument("--thresh", type=float, help="override the auto threshold")
    ap.add_argument("--link-px", type=int, default=LINK_PX)
    ap.add_argument("--layer-at-edit", action="store_true",
                    help="emit the layer at the edit's resolution instead of the "
                         "backdrop's (bigger files, no visible gain in the hall)")
    args = ap.parse_args()

    base_rgb = np.asarray(Image.open(args.base).convert("RGB")).astype(np.float32)
    os.makedirs(args.outdir, exist_ok=True)
    if args.tight_outdir:
        os.makedirs(args.tight_outdir, exist_ok=True)

    rc = 0
    for path in args.inputs:
        key = os.path.splitext(os.path.basename(path))[0]
        try:
            layer, tight, st, audit = extract_one(base_rgb, path, key, args)
        except Exception as e:
            print("%-14s ERROR %s" % (key, e), file=sys.stderr)
            rc = 1
            continue

        layer.save(os.path.join(args.outdir, key + ".png"))
        if args.tight_outdir:
            tight.save(os.path.join(args.tight_outdir, key + ".png"))
        if audit:
            audit.save(os.path.join(args.outdir, key + ".audit.png"))

        flags = []
        if st["keep_frac"] > 0.30:
            flags.append("keep%% %.0f — model repainted the room, REDO" % (st["keep_frac"] * 100))
        elif st["keep_frac"] < 0.002:
            flags.append("keep%% %.2f — nothing meaningful changed" % (st["keep_frac"] * 100))
        if st["spill"] > 6.0:
            flags.append("spill %.1f — edit drifted globally, REDO" % st["spill"])
        if st["margin"] < 2.0:
            flags.append("margin %.1fx — primary blob barely beat the runner-up, so "
                         "it may be drift rather than the object: CHECK panel 5"
                         % st["margin"])
        if st["aspect_delta"] > 0.005:
            flags.append("aspect differs from base by %.3f — layer will crop wrong"
                         % st["aspect_delta"])
        if args.tight_outdir and max(st["tight_size"]) < MIN_TIGHT_LONG_SIDE:
            flags.append("tight crop only %dpx — too soft for the board reveal, "
                         "needs a higher-res source" % max(st["tight_size"]))
        print(
            "%-14s t=%.1f keep=%.2f%% spill=%.2f m=%s layer=%dx%d tight=%dx%d%s"
            % (key, st["thresh"], st["keep_frac"] * 100, st["spill"],
               "inf" if st["margin"] == float("inf") else "%.1fx" % st["margin"],
               *st["layer_size"], *st["tight_size"],
               "  <-- " + "; ".join(flags) if flags else "")
        )
        for area, x0, y0, x1, y1 in st["dropped"]:
            print("                 dropped blob %dpx at (%d,%d)-(%d,%d)"
                  % (area, x0, y0, x1, y1))
        if flags:
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())
