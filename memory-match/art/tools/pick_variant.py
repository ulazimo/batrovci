#!/usr/bin/env python3
"""Quick a/b picker for white-plate item variants (see layer-ai-white-keying memo).

Prints, per file: border-connected background fraction (clean ~0.55-0.83, a
wedge-ridden plate drops to ~0.34) and whether the subject mask touches a frame
edge. Both cheap, both blind to subject fidelity -- eyeball the images too.

    python3 pick_variant.py raw/weddingchapel_plate/weddingrings_a.png raw/weddingchapel_plate/weddingrings_b.png
"""
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, label

NEAR_TOL = 14


def analyze(path):
    im = Image.open(path).convert("RGB")
    rgb = np.asarray(im).astype(np.float32)
    h, w = rgb.shape[:2]
    border = np.concatenate([rgb[0, :], rgb[-1, :], rgb[:, 0], rgb[:, -1]])
    bg_col = np.median(border, axis=0)
    dist = np.linalg.norm(rgb - bg_col, axis=-1)
    near = dist < NEAR_TOL
    lbl, n = label(near)
    border_labels = set(lbl[0, :]) | set(lbl[-1, :]) | set(lbl[:, 0]) | set(lbl[:, -1])
    border_labels.discard(0)
    bg = np.isin(lbl, list(border_labels))
    bg_frac = bg.mean()
    subject = ~bg
    edge_touch = subject[0, :].any() or subject[-1, :].any() or subject[:, 0].any() or subject[:, -1].any()
    return bg_frac, edge_touch, tuple(int(c) for c in bg_col)


for p in sys.argv[1:]:
    bg_frac, edge_touch, bg_col = analyze(p)
    flag = "" if (0.5 <= bg_frac <= 0.9 and not edge_touch) else "  <-- check"
    print("%-60s bg_frac=%.3f edge_touch=%s bg=%s%s" % (p, bg_frac, edge_touch, bg_col, flag))
