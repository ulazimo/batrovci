#!/usr/bin/env python3
"""Turn Layer AI output into game-ready sprites.

The models render on a flat white (or black, for additive particles) field, so
this keys that field out, trims to the content, and writes a transparent PNG.

Two things matter for quality:

  * The alpha ramp is soft, not a hard threshold. A hard cut leaves a white
    fringe on every curved edge, which on pale ice looks like a halo.
  * Colour is unpremultiplied at the edges. Anti-aliased pixels on white are a
    blend of subject and white; keeping them as-is leaves them washed out, so
    the recovered colour is divided back out by the alpha.

Usage:
    python3 art/prepare.py key       <in.png> <out.png> [--bg white|black] [--tol 18]
    python3 art/prepare.py keycolor  <in.png> <out.png> [--tol 26]
    python3 art/prepare.py grid      <in.png> <out-prefix> <cols> <rows>
    python3 art/prepare.py turntable <in.png> <out.png> <cols> <rows> [--cell 300]
    python3 art/prepare.py tile      <in.png> <out.png> [--size 256]
"""
import sys
from PIL import Image
import numpy as np


def key_out(path, out, bg='white', tol=18, feather=26):
    """Remove a flat background and trim to content."""
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im).astype(np.float32)
    rgb = a[..., :3]

    if bg == 'white':
        # Distance from white, per pixel, using the brightest channel gap.
        dist = 255.0 - rgb.min(axis=-1)
    else:
        # Additive art on black: luminance IS the alpha.
        dist = rgb.max(axis=-1)

    # Soft ramp: fully transparent below tol, fully opaque above tol+feather.
    alpha = np.clip((dist - tol) / float(feather), 0.0, 1.0)

    if bg == 'white':
        # Un-blend from white so edge pixels are not washed out:
        #   observed = subject*alpha + 255*(1-alpha)
        safe = np.maximum(alpha, 1e-3)[..., None]
        rgb = np.clip((rgb - 255.0 * (1.0 - safe)) / safe, 0, 255)

    out_arr = np.concatenate([rgb, (alpha * 255.0)[..., None]], axis=-1)
    res = Image.fromarray(out_arr.astype(np.uint8), 'RGBA')

    bbox = res.getbbox()
    if bbox:
        res = res.crop(bbox)
    res.save(out)
    print(f'{out}  {res.width}x{res.height}')


def key_color(path, out, tol=26, feather=22):
    """Key out whatever flat colour the corners are, not just white or black.

    Used for the assets rendered on mid-grey — the UI kit and the logo — where a
    white key would eat the highlights and a black key would eat the shadows.
    """
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im).astype(np.float32)
    rgb = a[..., :3]
    h, w = rgb.shape[:2]

    # Sample all four corners and take the median, so one stray corner sprite
    # does not skew the key colour.
    p = 6
    corners = np.stack([
        rgb[:p, :p].reshape(-1, 3), rgb[:p, -p:].reshape(-1, 3),
        rgb[-p:, :p].reshape(-1, 3), rgb[-p:, -p:].reshape(-1, 3),
    ])
    bgc = np.median(corners.reshape(-1, 3), axis=0)

    dist = np.linalg.norm(rgb - bgc[None, None, :], axis=-1)
    alpha = np.clip((dist - tol) / float(feather), 0.0, 1.0)

    safe = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip((rgb - bgc[None, None, :] * (1.0 - safe)) / safe, 0, 255)

    out_arr = np.concatenate([rgb, (alpha * 255.0)[..., None]], axis=-1)
    res = Image.fromarray(out_arr.astype(np.uint8), 'RGBA')
    bbox = res.getbbox()
    if bbox:
        res = res.crop(bbox)
    res.save(out)
    print(f'{out}  {res.width}x{res.height}  key rgb{tuple(int(v) for v in bgc)}')


def split_grid(path, prefix, cols, rows):
    """Cut an N×M contact sheet into individual keyed sprites."""
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    cw, ch = w // cols, h // rows
    n = 0
    for r in range(rows):
        for c in range(cols):
            cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            tmp = f'{prefix}_tmp.png'
            cell.save(tmp)
            key_out(tmp, f'{prefix}_{n}.png')
            n += 1
    import os
    os.remove(f'{prefix}_tmp.png')


def solid_bbox(im, thresh=24):
    """Bounding box of pixels that are actually opaque enough to see.

    PIL's getbbox() counts any non-zero alpha, and the soft key deliberately
    leaves a wide feathered halo of alpha 1–20. Using getbbox() directly makes
    every frame's box balloon to nearly the whole cell, which then defeats any
    attempt to align frames to each other.
    """
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > thresh)
    if len(xs) == 0:
        return None
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def turntable(path, out, cols, rows, tol=14, feather=26, cell_w=None):
    """Turn a grid of rotation frames into one horizontal sprite strip.

    Frame alignment is the whole game here. The generator does not place the
    subject identically in every grid cell, so each frame is registered to its
    OWN content: horizontally centred, and bottom-aligned on the contact shadow.
    Bottom alignment rather than centre because the rock sits on ice — the contact
    point is the thing that must not move, or the rock appears to bob as the
    animation steps through frames.
    """
    src = Image.open(path).convert('RGBA')
    W, H = src.size
    cw, ch = W // cols, H // rows

    frames = []
    for r in range(rows):
        for c in range(cols):
            cell = src.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            a = np.asarray(cell).astype(np.float32)
            rgb = a[..., :3]
            dist = 255.0 - rgb.min(axis=-1)
            alpha = np.clip((dist - tol) / float(feather), 0.0, 1.0)
            safe = np.maximum(alpha, 1e-3)[..., None]
            rgb = np.clip((rgb - 255.0 * (1.0 - safe)) / safe, 0, 255)
            arr = np.concatenate([rgb, (alpha * 255.0)[..., None]], axis=-1)
            keyed = Image.fromarray(arr.astype(np.uint8), 'RGBA')
            box = solid_bbox(keyed)
            if box:
                frames.append(keyed.crop(box))

    if not frames:
        raise SystemExit('no content found in any frame')

    fw = max(f.width for f in frames)
    fh = max(f.height for f in frames)
    pad = 6                                   # breathing room so nothing clips
    fw += pad * 2
    fh += pad

    strip = Image.new('RGBA', (fw * len(frames), fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        x = i * fw + (fw - f.width) // 2      # centred horizontally
        y = fh - f.height                     # bottom-aligned on the contact point
        strip.paste(f, (x, y))

    if cell_w:
        scale = cell_w / fw
        strip = strip.resize((cell_w * len(frames), max(1, int(round(fh * scale)))), Image.LANCZOS)
        fw, fh = cell_w, strip.height

    strip.save(out)
    print(f'{out}  {strip.width}x{strip.height}  {len(frames)} frames of {fw}x{fh}')


def make_tile(path, out, size=256):
    """Square-crop the centre and downscale — for the tileable ice texture."""
    im = Image.open(path).convert('RGB')
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    im = im.resize((size, size), Image.LANCZOS)
    im.save(out)
    print(f'{out}  {size}x{size}')


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'key':
        args = sys.argv[2:]
        bg = 'white'
        tol = 18
        if '--bg' in args:
            i = args.index('--bg'); bg = args[i + 1]; del args[i:i + 2]
        if '--tol' in args:
            i = args.index('--tol'); tol = int(args[i + 1]); del args[i:i + 2]
        key_out(args[0], args[1], bg=bg, tol=tol)
    elif cmd == 'keycolor':
        args = sys.argv[2:]
        tol = 26
        if '--tol' in args:
            i = args.index('--tol'); tol = int(args[i + 1]); del args[i:i + 2]
        key_color(args[0], args[1], tol=tol)
    elif cmd == 'grid':
        split_grid(sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]))
    elif cmd == 'turntable':
        args = sys.argv[2:]
        cell_w = None
        if '--cell' in args:
            i = args.index('--cell'); cell_w = int(args[i + 1]); del args[i:i + 2]
        turntable(args[0], args[1], int(args[2]), int(args[3]), cell_w=cell_w)
    elif cmd == 'tile':
        args = sys.argv[2:]
        size = 256
        if '--size' in args:
            i = args.index('--size'); size = int(args[i + 1]); del args[i:i + 2]
        make_tile(args[0], args[1], size)
    else:
        print(__doc__)
        sys.exit(1)
