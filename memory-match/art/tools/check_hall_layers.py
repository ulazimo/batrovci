#!/usr/bin/env python3
"""Verify a hall's scene layers stack correctly, before wiring them.

extract_layer.py judges each layer ALONE (keep%, spill, margin). That is not
enough, because a hall's layers are composited together in unlock order and must
be mutually independent. Two defects only show up when you look at the set:

  COLLISION  Two layers' masks overlap AND disagree about the shared pixels, so
             which one unlocks last changes the picture. This is how the attic's
             steamer trunk was caught carrying its own rewritten copy of the
             three-legged stool the teddy bear sits on and the wall nook holding
             the oil lamp: alone it scored keep=8.6% spill=5.4 m=59x, all clean.
             Mere overlap is NOT a defect — the kitchen's jam jars and cat share
             24.7% of a mask and composite identically either way, because the
             shared patch is untouched counter both of them copied faithfully.
             Only the disagreement number decides.

  DRIFT-SEAM Outside its mask a layer contributes nothing, so the backdrop shows
             through. That is fine on its own, but an editing model re-decodes the
             whole frame, so the kept pixels sit a few levels off the backdrop
             they are pasted onto. Reported as `edge` — the mean base-vs-edit
             difference in a thin ring just inside the mask boundary.

Usage:

    python3 check_hall_layers.py --base ../backdrops/cozy-attic.jpeg \\
        --montage /tmp/attic.png ../attic/scene/*.png

Prints an overlap matrix (percentage of the SMALLER mask that is shared) and
writes a montage: each layer over the backdrop, then all of them stacked, which
is the picture the player actually sees with everything unlocked.

Overlap over ~2% of the smaller mask is worth looking at; over ~10% is a defect —
redo the later item with the earlier item's surface named as off-limits.
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_erosion

OVERLAP_WARN = 2.0
OVERLAP_FAIL = 10.0
ORDER_FAIL = 10.0     # mean channel-max disagreement that counts as a real collision
MIN_INTER_PX = 2000   # below this the "intersection" is a sliver where two masks merely
                      # abut — the kitchen's pie and kettle touch along a 400px, 10px-tall
                      # band at the counter's front edge and score 40+ there purely from
                      # each object's own edge pixels. A genuine shared-region conflict is
                      # far larger (the attic's trunk vs oil lamp was ~6000px).
EDGE_RING_PX = 3


def load(path, size):
    im = Image.open(path).convert("RGBA")
    if im.size != size:
        im = im.resize(size, Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    return a[..., :3], a[..., 3] / 255.0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("layers", nargs="+")
    ap.add_argument("--base", required=True)
    ap.add_argument("--montage")
    args = ap.parse_args()

    bim = Image.open(args.base).convert("RGB")
    W, H = bim.size
    base = np.asarray(bim).astype(np.float32)

    names, masks, rgbs = [], [], []
    for p in args.layers:
        if p.endswith(".audit.png"):
            continue
        rgb, al = load(p, (W, H))
        names.append(os.path.splitext(os.path.basename(p))[0])
        masks.append(al > 0.5)
        rgbs.append((rgb, al))

    if not names:
        print("no layers given", file=sys.stderr)
        return 1

    print("%-14s %7s %7s  %s" % ("layer", "keep%", "edge", "notes"))
    for n, m, (rgb, al) in zip(names, masks, rgbs):
        ring = m & ~binary_erosion(m, iterations=EDGE_RING_PX)
        edge = (np.abs(rgb - base).max(axis=2)[ring].mean() if ring.any() else 0.0)
        print("%-14s %6.2f%% %7.1f" % (n, m.mean() * 100, edge))

    print("\noverlap matrix (%% of the smaller mask shared):")
    rc = 0
    print("%-14s%s" % ("", "".join("%9s" % n[:8] for n in names)))
    for i, a in enumerate(masks):
        row = []
        for j, b in enumerate(masks):
            if i == j:
                row.append("%9s" % "-")
                continue
            inter = (a & b).sum()
            small = min(a.sum(), b.sum()) or 1
            pct = 100.0 * inter / small
            mark = "!" if pct >= OVERLAP_FAIL else ("?" if pct >= OVERLAP_WARN else " ")
            if pct >= OVERLAP_FAIL:
                rc = 1
            row.append("%8.1f%s" % (pct, mark))
        print("%-14s%s" % (names[i][:14], "".join(row)))

    # Overlap alone does NOT prove a defect. Two layers routinely share a patch of
    # untouched room that both masks happened to swallow, and there they hold
    # near-identical copies of the same pixels, so which one lands on top is
    # invisible. The kitchen's jam jars and cat overlap 24.7% and composite
    # identically either way. What actually breaks the hall is a layer whose copy
    # of the shared region DISAGREES — the steamer trunk carrying its own
    # rewritten stool, which erases the teddy bear's perch when it unlocks.
    #
    # So the real test is order-independence: composite each pair both ways and
    # compare inside the intersection. Any-subset-in-any-order is precisely the
    # property SCENE-LAYERS-PLAN.md claims for these layers, and this measures it.
    print("\norder-independence (mean disagreement inside each pair's intersection):")
    rc = 0
    clean = True
    for i in range(len(masks)):
        for j in range(i + 1, len(masks)):
            inter = masks[i] & masks[j]
            if inter.sum() < MIN_INTER_PX:
                continue
            ri, ai = rgbs[i]
            rj, aj = rgbs[j]
            ai3, aj3 = ai[..., None], aj[..., None]
            ij = rj * aj3 + (ri * ai3 + base * (1 - ai3)) * (1 - aj3)
            ji = ri * ai3 + (rj * aj3 + base * (1 - aj3)) * (1 - ai3)
            dis = np.abs(ij - ji).max(axis=2)[inter].mean()
            share = 100.0 * inter.sum() / (min(masks[i].sum(), masks[j].sum()) or 1)
            if dis >= ORDER_FAIL:
                rc = 1
                clean = False
                print("  %-13s %-13s share %5.1f%%  disagreement %5.1f  <-- COLLISION, "
                      "redo the later item" % (names[i], names[j], share, dis))
            elif share >= OVERLAP_WARN:
                print("  %-13s %-13s share %5.1f%%  disagreement %5.1f  ok (shared "
                      "region matches)" % (names[i], names[j], share, dis))
    if clean:
        print("  no collisions — every pair composites the same in either order")

    if args.montage:
        cols = len(names) + 1
        panels = []
        for n, (rgb, al) in zip(names, rgbs):
            panels.append((n, rgb * al[..., None] + base * (1 - al[..., None])))
        acc = base.copy()
        for rgb, al in rgbs:                       # unlock order = argument order
            acc = rgb * al[..., None] + acc * (1 - al[..., None])
        panels.append(("ALL STACKED", acc))
        pw = 340
        ph = int(H * pw / W)
        LBL = 20
        sheet = Image.new("RGB", (pw * cols, ph + LBL), (18, 18, 24))
        dr = ImageDraw.Draw(sheet)
        for i, (n, img) in enumerate(panels):
            dr.text((i * pw + 6, 4), n, fill=(255, 220, 120))
            sheet.paste(
                Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")
                .resize((pw, ph), Image.LANCZOS), (i * pw, LBL))
        sheet.save(args.montage)
        print("\nwrote %s" % args.montage)
    return rc


if __name__ == "__main__":
    sys.exit(main())
