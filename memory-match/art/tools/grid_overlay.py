#!/usr/bin/env python3
"""Overlay a percentage grid on a hall backdrop, to measure painted surfaces.

    python3 grid_overlay.py ../backdrops/*.jpeg --outdir /tmp/grids

Horizontal lines are labelled in **% of picture height from the BOTTOM**, which is
the convention everything else uses: `bottom` in a placed slot, and the height a
scene layer's object may be painted at. Vertical lines are % of width from the
left, matching `left`.

The **magenta line is the iPad crop ceiling**. The hall scene box is `flex: 1` and
the backdrop is `object-fit: cover` anchored bottom, so the visible fraction of the
picture is exactly `backdropAspect / sceneAspect` (see `syncBackdropBox()` in
home-room.js). At the standard 0.5625 backdrop that is ~87% on a phone but only
~62% on an iPad — so anything whose top crosses ~60% is cut off on a tablet.

For a placed item that ceiling applies to `bottom + h`, and it can be fixed by
nudging in the editor. For a `kind: 'layer'` item it applies to where the object
was *painted*, and the only fix is regenerating the art — so measure first. See
../SCENE-LAYERS-PLAN.md.
"""

import argparse
import os

from PIL import Image, ImageDraw

CEILING_PCT = 60
GRID = (0, 255, 255, 140)
GRID_FAINT = (0, 255, 255, 70)
CEILING = (255, 0, 255, 255)


def annotate(path, outdir, ceiling):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    d = ImageDraw.Draw(im, "RGBA")
    for pct in range(10, 101, 10):
        y = h - int(pct / 100 * h)
        hit = pct == ceiling
        d.line([(0, y), (w, y)], fill=CEILING if hit else GRID, width=3 if hit else 1)
        d.text((6, y + 2), str(pct), fill=CEILING if hit else GRID)
    if ceiling % 10:
        y = h - int(ceiling / 100 * h)
        d.line([(0, y), (w, y)], fill=CEILING, width=3)
        d.text((6, y + 2), str(ceiling), fill=CEILING)
    for pct in range(10, 100, 10):
        x = int(pct / 100 * w)
        d.line([(x, 0), (x, h)], fill=GRID_FAINT, width=1)
        d.text((x + 2, h - 16), str(pct), fill=GRID_FAINT)

    os.makedirs(outdir, exist_ok=True)
    name = os.path.splitext(os.path.basename(path))[0] + ".grid.png"
    dest = os.path.join(outdir, name)
    im.save(dest)
    print("%-24s %dx%d aspect %.4f -> %s" % (os.path.basename(path), w, h, w / h, dest))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("--outdir", required=True)
    ap.add_argument("--ceiling", type=int, default=CEILING_PCT,
                    help="percent from bottom to draw in magenta (default: %(default)s)")
    args = ap.parse_args()
    for p in args.inputs:
        annotate(p, args.outdir, args.ceiling)


if __name__ == "__main__":
    main()
