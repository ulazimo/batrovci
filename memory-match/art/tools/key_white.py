#!/usr/bin/env python3
"""Key Layer AI's white-background item renders to tight transparent PNGs.

Layer's `remove_background: true` is silently ignored in the zynga workspace (no
BiRefNet v2), so every item render arrives as RGB on near-white. This does the
keying locally.

    python3 key_white.py raw/*.png --outdir ../attic
    python3 key_white.py raw/kettle.png --outdir ../kitchen --check

`--check` also writes `<name>.check.png`, the result composited over a MAGENTA
checkerboard. Always eyeball that, never the bare PNG on a white page — a white
halo is invisible against white.

Why each step exists (skip one and it shows):

1. The background colour is read from the border and everything is measured as a
   *distance from it*, not against an absolute cutoff. Layer's "white" lands
   anywhere from 243 to 255, and a hardcoded 244 threshold silently keys nothing
   on a 243 background. The tell for that failure is "subject = 99% of frame",
   which this script checks for and warns about.
2. Only the near-white component *connected to the border* is treated as
   background. Connectivity is the whole point: it protects white **inside** the
   subject (a cream mixing bowl, the white of an enamel trivet).
3. Enclosed near-white holes (backdrop seen between a toolbox's tools) are
   recovered by a second pass. An enclosed blob is background only if it is as
   flat as real backdrop: mean within MEAN_TOL of the border colour and
   per-channel std <= STD_TOL. Lit subject white is never that flat.
4. The background is dilated ~2px to swallow the anti-aliased ring. Without
   this a white fringe survives.
5. Alpha is feathered ~0.7px and subject colour is bled outward into the
   transparent pixels, so the soft edge cannot reveal white underneath.
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import (
    binary_dilation,
    distance_transform_edt,
    gaussian_filter,
    label,
)

# Distance from the border colour still counted as "might be background".
# Generous on purpose — flatness and connectivity do the real discriminating.
NEAR_TOL = 14
# An enclosed blob is backdrop only if it is this flat (see step 3).
MEAN_TOL = 3.0
STD_TOL = 2.5
BG_DILATE_PX = 2
FEATHER_SIGMA = 0.7
LONG_SIDE = 512


def key_one(path, outdir, check=False, long_side=LONG_SIDE):
    name = os.path.splitext(os.path.basename(path))[0]
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    h, w, _ = rgb.shape

    # --- 1. background colour from the border, and a distance-based mask ------
    border_px = np.concatenate(
        [rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]]
    )
    bg_col = np.median(border_px, axis=0)
    dist = np.abs(rgb - bg_col).max(axis=2)
    near = dist <= NEAR_TOL

    # --- 2. keep only the near-white region connected to the border ----------
    lab, n = label(near)
    border_labels = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    border_labels.discard(0)
    bg = np.isin(lab, list(border_labels))

    # --- 3. enclosed holes that are as flat as real backdrop ----------------
    holes = 0
    for lb in range(1, n + 1):
        if lb in border_labels:
            continue
        m = lab == lb
        px = rgb[m]
        if px.shape[0] < 4:
            continue
        if (
            np.abs(px.mean(axis=0) - bg_col).max() <= MEAN_TOL
            and px.std(axis=0).max() <= STD_TOL
        ):
            bg |= m
            holes += 1

    subject_frac = 1.0 - bg.mean()
    warn = ""
    if subject_frac > 0.95:
        warn = "  !! subject = %.0f%% of frame — keying almost certainly FAILED" % (
            subject_frac * 100
        )
    elif subject_frac < 0.02:
        warn = "  !! subject = %.1f%% of frame — keyed away the object?" % (
            subject_frac * 100
        )

    # --- 4. swallow the anti-aliased ring ------------------------------------
    if BG_DILATE_PX:
        bg = binary_dilation(bg, iterations=BG_DILATE_PX)
    subj = ~bg
    if not subj.any():
        print("%-16s SKIPPED — nothing left after keying" % name, file=sys.stderr)
        return None

    # --- 5. feather alpha, and bleed subject colour outward ------------------
    alpha = gaussian_filter(subj.astype(np.float32), FEATHER_SIGMA)
    alpha = np.clip(alpha, 0.0, 1.0)
    alpha[subj] = np.maximum(alpha[subj], 1.0)

    # Nearest-subject-pixel colour for every non-subject pixel, so the feathered
    # edge blends toward the object rather than toward white.
    iy, ix = distance_transform_edt(bg, return_indices=True, return_distances=False)
    bled = rgb[iy, ix]
    out_rgb = np.where(subj[..., None], rgb, bled)

    rgba = np.dstack([out_rgb, alpha * 255.0]).astype(np.uint8)

    # --- crop tight to the alpha bbox, then scale the long side --------------
    ys, xs = np.where(alpha > 0.02)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    img = Image.fromarray(rgba[y0:y1, x0:x1], "RGBA")
    if long_side:
        sw, sh = img.size
        scale = long_side / max(sw, sh)
        if scale < 1.0:
            img = img.resize(
                (max(1, round(sw * scale)), max(1, round(sh * scale))),
                Image.LANCZOS,
            )

    os.makedirs(outdir, exist_ok=True)
    dest = os.path.join(outdir, name + ".png")
    img.save(dest)

    if check:
        img_check = checkerboard(img)
        img_check.save(os.path.join(outdir, name + ".check.png"))

    print(
        "%-16s bg=%s holes=%d  %dx%d -> %dx%d%s"
        % (
            name,
            "(%d,%d,%d)" % tuple(int(c) for c in bg_col),
            holes,
            w,
            h,
            img.size[0],
            img.size[1],
            warn,
        )
    )
    return dest, img.size


def checkerboard(img, square=16):
    """Composite over a magenta checkerboard — halos are invisible on white."""
    w, h = img.size
    yy, xx = np.mgrid[0:h, 0:w]
    odd = ((yy // square) + (xx // square)) % 2
    base = np.where(
        odd[..., None] == 0,
        np.array([255, 0, 255], np.uint8),
        np.array([40, 40, 40], np.uint8),
    ).astype(np.float32)
    a = np.asarray(img).astype(np.float32)
    al = a[..., 3:4] / 255.0
    comp = a[..., :3] * al + base * (1.0 - al)
    return Image.fromarray(comp.astype(np.uint8), "RGB")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--check", action="store_true", help="also write .check.png")
    ap.add_argument("--long-side", type=int, default=LONG_SIDE)
    args = ap.parse_args()

    for p in args.inputs:
        try:
            key_one(p, args.outdir, check=args.check, long_side=args.long_side)
        except Exception as e:  # keep going through a batch
            print("%-16s ERROR %s" % (os.path.basename(p), e), file=sys.stderr)


if __name__ == "__main__":
    main()
