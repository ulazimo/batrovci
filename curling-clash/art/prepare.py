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
    python3 art/prepare.py iconsheet <in.png> <out.png> <cols> <rows> [--cell 256]
    python3 art/prepare.py turntable <in.png> <out.png> <cols> <rows> [--cell 300]
    python3 art/prepare.py accent    <body.png> <out.png> '#rrggbb'
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


def drop_specks(im, thresh=40, keep=0.06):
    """Erase everything not connected to the main blob.

    A generated icon carries a soft drop shadow, and where that shadow crosses a
    cell boundary it lands in the NEXT cell as a stray fleck. The fleck is
    invisible, but it is inside the bounding box, so it shifts and shrinks the
    icon when the cell is re-laid. Components smaller than `keep` of the largest
    are removed.

    Labelling runs on a 4x-downsampled mask: no scipy here, and full resolution
    in a Python BFS is far too slow for what is a cleanup pass.
    """
    a = np.asarray(im)[..., 3]
    m = (a > thresh)
    if not m.any():
        return im

    step = 4
    small = m[::step, ::step]
    h, w = small.shape
    lab = np.zeros((h, w), np.int32)
    sizes = [0]
    for sy in range(h):
        for sx in range(w):
            if not small[sy, sx] or lab[sy, sx]:
                continue
            n = len(sizes)
            stack = [(sy, sx)]
            lab[sy, sx] = n
            count = 0
            while stack:
                y, x = stack.pop()
                count += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and small[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        stack.append((ny, nx))
            sizes.append(count)

    biggest = max(sizes)
    doomed = {i for i, s in enumerate(sizes) if i and s < biggest * keep}
    if not doomed:
        return im

    kill_small = np.isin(lab, list(doomed))
    kill = np.repeat(np.repeat(kill_small, step, axis=0), step, axis=1)[:m.shape[0], :m.shape[1]]
    if kill.shape != m.shape:                       # ragged tail from the stride
        pad_y = m.shape[0] - kill.shape[0]
        pad_x = m.shape[1] - kill.shape[1]
        kill = np.pad(kill, ((0, pad_y), (0, pad_x)))

    arr = np.asarray(im).copy()
    arr[kill, 3] = 0
    return Image.fromarray(arr, 'RGBA')


def gutter_splits(mask, n, axis):
    """Cut lines for an n-way split, placed in the emptiest gap near each third.

    An even split is wrong: the generator does not respect its own grid, and a
    boundary drawn through the top of a flame drags that flame's tip into the
    cell above, where it becomes a stray fleck AND inflates that cell's bounding
    box (so its icon gets scaled down to compensate). Searching for the actual
    gutter puts the cut through empty pixels instead.
    """
    profile = mask.sum(axis=1 - axis).astype(np.int64)
    span = mask.shape[axis]
    cuts = [0]
    for k in range(1, n):
        centre = round(k * span / n)
        win = max(2, round(span / (3 * n)))
        lo, hi = max(1, centre - win), min(span - 1, centre + win)
        cuts.append(lo + int(np.argmin(profile[lo:hi])))
    cuts.append(span)
    return cuts


def icon_sheet(path, out, cols, rows, cell=256, pad=14, tol=26, feather=22):
    """Re-lay an AI-generated icon contact sheet onto an exact uniform grid.

    The generator honours "a 4x3 grid" loosely: icons drift within their cell and
    come out at different sizes. `effectIcon()` slices the sheet by plain
    arithmetic, so the sheet has to be exact — which means finding each icon's
    real bounds and re-placing it, rather than trusting where it landed.

    Each icon is keyed off the flat background, cropped to its solid bounds,
    scaled to fit the padded cell preserving aspect, and centred. Uniform scaling
    per-icon (not one global scale) is deliberate: these are UI badges shown at
    the same size everywhere, so a snowflake and an anvil should read as equally
    large, whatever their source dimensions were.
    """
    src = Image.open(path).convert('RGBA')

    sheet = Image.new('RGBA', (cell * cols, cell * rows), (0, 0, 0, 0))
    inner = cell - pad * 2
    placed = 0

    # One key colour for the whole sheet, sampled from the full image's corners —
    # a per-cell sample would drift where an icon overhangs into the corner.
    a = np.asarray(src).astype(np.float32)[..., :3]
    p = 8
    bgc = np.median(np.stack([
        a[:p, :p].reshape(-1, 3), a[:p, -p:].reshape(-1, 3),
        a[-p:, :p].reshape(-1, 3), a[-p:, -p:].reshape(-1, 3),
    ]).reshape(-1, 3), axis=0)

    # Gutters are found against the same alpha rule the crop later uses. Judging
    # them on raw colour distance instead lets the faint shadow tail — visible to
    # solid_bbox but not to the gutter search — bridge two cells, and then the
    # crop swells to the full cell width.
    dist_full = np.linalg.norm(a - bgc[None, None, :], axis=-1)
    full = np.clip((dist_full - tol) / float(feather), 0, 1) * 255.0 > 40
    ycut = gutter_splits(full, rows, 0)
    xcut = gutter_splits(full, cols, 1)

    for r in range(rows):
        for c in range(cols):
            rgb = a[ycut[r]:ycut[r + 1], xcut[c]:xcut[c + 1]]
            dist = np.linalg.norm(rgb - bgc[None, None, :], axis=-1)
            alpha = np.clip((dist - tol) / float(feather), 0.0, 1.0)
            safe = np.maximum(alpha, 1e-3)[..., None]
            un = np.clip((rgb - bgc[None, None, :] * (1.0 - safe)) / safe, 0, 255)
            arr = np.concatenate([un, (alpha * 255.0)[..., None]], axis=-1)
            icon = drop_specks(Image.fromarray(arr.astype(np.uint8), 'RGBA'))

            box = solid_bbox(icon, thresh=40)
            if not box:
                print(f'  cell {r},{c}: EMPTY')
                continue
            icon = icon.crop(box)

            s = min(inner / icon.width, inner / icon.height)
            icon = icon.resize((max(1, round(icon.width * s)),
                                max(1, round(icon.height * s))), Image.LANCZOS)
            x = c * cell + (cell - icon.width) // 2
            y = r * cell + (cell - icon.height) // 2
            sheet.paste(icon, (x, y))
            placed += 1

    sheet.save(out)
    print(f'{out}  {sheet.width}x{sheet.height}  {placed}/{cols * rows} icons, '
          f'{cell}px cells, key rgb{tuple(int(v) for v in bgc)}')
    print(f'  gutters  x={xcut}  y={ycut}')


def accent_band(path, out, hexcolor, core=7.0, glow=22.0, gain=0.92):
    """Lay a glowing type-coloured line along the top edge of the rock's band.

    The three special-rock bodies are the BASIC body with an accent line, not
    separate renders. That is deliberate. The generator will happily draw four
    handsome stones, but never four stones with the same silhouette — and on the
    ice, where an Offense rock sits next to a Basic one, a silhouette that shifts
    between rock types reads as a bug. Deriving them from one file makes the
    stones provably identical and the accent provably the game's own TYPE_COLORS.

    The edge is found rather than authored: the pale running band is a bright
    ellipse across a dark body, so its top edge is the strongest downward
    brightness step in the middle of the rock. Speckled granite makes the
    per-column estimate noisy, so a quadratic is fitted through the estimates
    with outlier rejection — the edge is an ellipse arc, and three refits shake
    off the columns where a light fleck won the argmax.
    """
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im).astype(np.float32)
    al, lum = a[..., 3], a[..., :3].mean(axis=-1)
    H, W = lum.shape

    def box(arr, k, axis):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (k // 2, k // 2)
        c = np.cumsum(np.pad(arr, pad, mode='edge'), axis=axis)
        s0, s1 = [slice(None)] * 2, [slice(None)] * 2
        s0[axis], s1[axis] = slice(k, None), slice(0, -k)
        return (c[tuple(s0)] - c[tuple(s1)]) / k

    smooth = box(box(lum, 21, 0), 31, 1)

    xs, ys = [], []
    for x in range(W):
        col = np.where(al[:, x] > 200)[0]
        if len(col) < 40:
            continue
        y0, y1 = col.min(), col.max()
        lo, hi = y0 + int(0.35 * (y1 - y0)), y0 + int(0.80 * (y1 - y0))
        if hi - lo < 4:
            continue
        xs.append(x)
        ys.append(lo + int(np.argmax(np.diff(smooth[lo:hi, x]))))
    if len(xs) < 32:
        raise SystemExit('could not find the band edge')

    xs, ys = np.array(xs, float), np.array(ys, float)
    keep = np.ones(len(xs), bool)
    for _ in range(3):
        coef = np.polyfit(xs[keep], ys[keep], 2)
        resid = np.abs(np.polyval(coef, xs) - ys)
        keep = resid < max(2.0, 1.6 * np.median(resid))
    edge = np.polyval(coef, np.arange(W))

    # Width matters more than finesse: on the ice a rock is about 39 px wide, so
    # a hairline at this 550 px source scales to a fifth of a pixel and vanishes.
    # The band is sized to survive that reduction and still read as one colour.
    rgb = np.array([int(hexcolor[i:i + 2], 16) for i in (1, 3, 5)], float)
    dy = np.arange(H)[:, None] - edge[None, :]
    hot = np.exp(-(dy / core) ** 2)
    halo = np.exp(-(dy / glow) ** 2)
    inten = np.clip(hot + 0.55 * halo, 0, 1) * gain * (al / 255.0)   # never spills outside

    m = inten[..., None]
    tint = rgb[None, None, :] * 0.86 + 255.0 * 0.14
    lit = a[..., :3] * (1 - m) + tint * m
    lit += (hot * (al / 255.0))[..., None] * (rgb[None, None, :] / 255.0) * 90.0   # emissive core
    res = np.concatenate([np.clip(lit, 0, 255), al[..., None]], axis=-1)
    Image.fromarray(res.astype(np.uint8), 'RGBA').save(out)
    print(f'{out}  {W}x{H}  accent {hexcolor}, edge y {edge.min():.0f}-{edge.max():.0f}, '
          f'{int(keep.sum())}/{len(xs)} columns fitted')


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
    elif cmd == 'iconsheet':
        args = sys.argv[2:]
        cell = 256
        if '--cell' in args:
            i = args.index('--cell'); cell = int(args[i + 1]); del args[i:i + 2]
        icon_sheet(args[0], args[1], int(args[2]), int(args[3]), cell=cell)
    elif cmd == 'accent':
        accent_band(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == 'tile':
        args = sys.argv[2:]
        size = 256
        if '--size' in args:
            i = args.index('--size'); size = int(args[i + 1]); del args[i:i + 2]
        make_tile(args[0], args[1], size)
    else:
        print(__doc__)
        sys.exit(1)
