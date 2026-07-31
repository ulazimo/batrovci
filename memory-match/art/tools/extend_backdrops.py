#!/usr/bin/env python3
"""Extend a hall backdrop downwards so its items clear the home-screen UI.

WHY THIS EXISTS
---------------
`#room-scene` is full-bleed (`inset: 0`) and the backdrop is drawn
`object-fit: cover; object-position: center bottom`. The Play button, streak
meter and hall dots live in `#room-bottom`, which measures **78.1% -> 100%** of
the scene — so anything painted in the bottom ~22% of a hall picture is behind
the home-screen UI.

Mind the shape of that UI, which is easy to get wrong: `#room-bottom` is NOT an
opaque bar. Its background is a scrim, `linear-gradient(0deg, rgba(10,6,24,.9),
rgba(10,6,24,0))` — fully transparent at its TOP edge, 90% dark only at the
screen's bottom — and the only solid things inside it are the Play button
(x 32.3%-67.7%) and the streak bar (x 22.6%-77.4%). So an item under the button
is genuinely hidden, but floor added at the bottom of the picture still shows in
the gutters either side of it. That is why every extended hall wants real
generated floor, and why `--fill-missing`'s stretch is a placeholder only.

Half the interior halls have items painted right down at the picture's bottom
edge (attic rockinghorse 99.7%, greenhouse watering can 99.7%, sewing-room yarn
basket 99.5%), i.e. squarely behind the Play button. Cropping the scene to sit
above the UI was rejected — full-bleed art looks much better — so the fix is to
make the *picture taller at the bottom*: add a band of extra floor. Because the
backdrop fills the scene's height (phone scenes are proportionally narrower than
the 0.5625 art), everything that was in the original frame then renders higher up
the screen, above the button.

WHY THE LAYERS COME ALONG FOR FREE
----------------------------------
A `kind: 'layer'` slot is a full 576x1024 canvas with the item already at its
final position, drawn with the *same* box and the *same* cover rules as the
backdrop (see `.spot-layer .spot-instrument` in style.css, and `syncBackdropBox`
in home-room.js). So padding E transparent rows onto the bottom of every
`<hall>/scene/*.png` — exactly the E rows of floor added to the backdrop — keeps
each item pixel-aligned with the furniture it stands on. Nothing needs
repositioning or rescaling, and `collections.json` does not change at all: a
layer slot ignores `left`/`bottom`/`h`.

The `bedroom` hall is different (`placed` slots, hand-tuned left/bottom/h) and is
already fixed by hand. This script skips placed-slot halls; it would have to
rewrite their slot geometry, which is a judgement call, not arithmetic.

THE THREE PHASES
----------------
    prep     measure each hall, decide E, and write an upscaled backdrop with a
             white band at the bottom for an image model to fill in
    preview  fake the new band by stretching the backdrop's bottom rows, then
             render the result — so the framing decision (how much to extend,
             per-hall vs uniform) can be made before spending any generations
    apply    take the model's returned picture, keep only its new band, splice it
             under the pixel-exact original, and pad the scene layers to match
    verify   re-composite each hall as the phone actually renders it, with the
             real UI drawn on top — gradient scrim plus the two solid widgets at
             their measured x spans — so whatever is legible in the render is
             legible in the game

`apply` deliberately **composites** rather than trusting the returned file
wholesale: an editing model re-decodes the whole frame, so its copy of the room
sits a few levels off the original. The scene layers were pixel-diffed against
the original backdrop, so any drift up there would show as a halo around every
item. Keeping the original rows byte-for-byte and taking only the new band
(with a short feathered seam) makes that impossible.

USAGE
-----
    # 1. measure + emit generation inputs for every layer hall
    python3 art/tools/extend_backdrops.py prep

    #    ...or just some, and/or with one extension for all halls
    python3 art/tools/extend_backdrops.py prep --halls attic,study --uniform

    # 2. run art/extend/<hall>/to_generate.png through an image model using
    #    art/extend/<hall>/PROMPT.txt, save the result as
    #    art/extend/<hall>/generated.png   (.jpg/.jpeg/.webp also accepted)

    # 3. splice it in and pad the layers
    python3 art/tools/extend_backdrops.py apply

    # 4. eyeball the result against the UI band
    python3 art/tools/extend_backdrops.py verify --open

Everything overwritten is backed up first (`art/backdrops/_orig/`,
`art/<hall>/scene/_orig/`) and `apply` refuses to run twice on the same hall
unless you pass `--redo`, which restores from those backups before working. So
`apply --fill-missing` now to fix the framing, then `apply --redo` per hall as
its generated art lands, is a safe order to work in.
"""

import argparse
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))   # memory-match/

COLLECTIONS = os.path.join(ROOT, "collections.json")
EXTEND_DIR = os.path.join(ROOT, "art", "extend")
MANIFEST = os.path.join(EXTEND_DIR, "manifest.json")
AUDIT_DIR = os.path.join(EXTEND_DIR, "_audit")

# ---------------------------------------------------------------- tuning knobs

# Top of `#room-bottom` as a fraction of scene height, measured in the dev
# harness on the phone frame (Play row 79.8%-87.6%, streak 89%-95.3%, dots
# 96.7%). This is the line an ITEM must clear — below it an item can fall behind
# the Play button. It is NOT a line below which art is hidden; see
# band_on_screen. #room-bottom is a fixed 181px tall, so it is a smaller
# fraction on a taller scene (80% on the iPad frame) — the phone's 78.1% is the
# stricter of the two, which is why it is the one used.
UI_TOP = 0.781

# Where we want the LOWEST item's bottom edge to land. Below UI_TOP with a
# margin, so an item reads as standing on floor rather than growing out of the
# button. 0.74 leaves ~4% of visible floor under the lowest piece.
TARGET_BOTTOM = 0.74

# The reference device: the narrowest scene aspect we care about, because a
# narrow scene is the worst case (see cover_geometry). 0.4457 is the 393x852
# dev frame's #room-scene; a 20:9 Android is 0.45, an iPhone 14 Pro without
# safe-area padding is 0.4613. Wider scenes crop the top instead and push items
# even higher, so designing for the narrowest is safe everywhere.
REF_SCENE_ASPECT = 0.4457

# A wide reference, only used to report how exposed the new floor band is there.
# 0.6868 is the dev harness's iPad frame, measured. A wide scene magnifies the
# picture (cover_geometry's wide regime), so it exposes far more of the band —
# library's +176px band covers 21% of an iPad screen versus 15% of a phone's.
TABLET_ASPECT = 0.6868

# An item's alpha bottom is noisy: a pixel-diffed layer carries a faint halo of
# re-decode drift right to the canvas edge. Count a row as part of the item only
# once it has real coverage.
SOLID_ALPHA = 140
SOLID_MIN_PX = 6

# Generation happens at SCALE x the shipping size — 576px wide is too small for
# a model to invent convincing floor grain, and downscaling its output back to
# 576 only sharpens it.
SCALE = 2

# Rows of crossfade at the splice seam (in shipping pixels). The model matches
# tone well but not perfectly; a short feather hides the step without smearing
# the floor's perspective lines.
SEAM_BLEND = 10

# Rows of overlap used to tone-match the band. The returned image contains the
# original room as well as the new band, so the rows just above the cut exist in
# BOTH pictures — which makes them a free calibration target. Every hall came
# back with the floor structure continuing correctly but the whole picture a few
# levels darker or flatter (musicroom -32, winecellar -29 mean at the seam), and
# since `apply` pastes the pristine rows back, that shift would land as a visible
# step exactly at the join. Comparing the two versions of this strip gives the
# per-channel gain that cancels it.
TONE_MATCH_ROWS = 24
TONE_GAIN_CLAMP = (0.5, 2.0)   # a wilder correction means something else is wrong

JPEG_QUALITY = 92

# What each room's floor actually is, read off the bottom third of its backdrop.
# A generic "continue the floor" prompt invites the model to invent a different
# material at the seam; naming the surface is what keeps the join invisible.
SURFACES = {
    "attic":         "pale blue-grey painted wooden floorboards, with the warm "
                     "pool of sunlight falling across them",
    "greenhouse":    "pale grey pebble-gravel ground with weathered whitewashed "
                     "wooden duckboard slats laid over it",
    "sewingroom":    "warm honey-toned wooden floorboards, and the edge of the "
                     "braided oval rug",
    "study":         "dark walnut herringbone parquet, and the large pale "
                     "cream-and-mauve patterned oriental rug",
    "kitchen":       "warm terracotta square tile floor with pale grout lines",
    "gameroom":      "reddish-brown herringbone parquet, and the patterned "
                     "oriental rug laid over it",
    "sweetshop":     "black-and-cream checkerboard tile floor",
    "musicroom":     "polished wooden floorboards",
    "workshop":      "warm wooden plank floor",
    "library":       "dark wooden floorboards and the edge of the rug",
    "artstudio":     "pale whitewashed wooden floorboards flecked with paint",
    "nursery":       "soft pale wooden floor and the edge of the round rug",
    "winecellar":    "worn stone flagstone floor",
    "sunroom":       "pale terracotta tile floor",
    "curiosityshop": "dark polished wooden floorboards and the edge of the rug",
    "weddingchapel": "pale warm wooden floorboards, the cream ivory aisle runner "
                     "down the middle, and the wooden pew ends either side",
}
DEFAULT_SURFACE = "floor"

# Per-hall exceptions to the blanket "add no new objects" rule. Needed when a
# scatter IS the floor: the chapel's aisle is strewn with rose petals, and a
# prompt that forbids new objects makes them stop dead at the seam.
PROMPT_EXTRA = {
    "weddingchapel":
        "- EXCEPTION to the no-new-objects rule: keep scattering the same small\n"
        "  pink rose petals across the new floor at the same sparse density and\n"
        "  the same size falloff, since they are part of the floor here. Still no\n"
        "  furniture, no bouquets, no new props.",
}

PROMPT_TEMPLATE = """\
Extend this image downwards to fill the blank white band at the bottom.

Continue the existing {surface} straight towards the viewer, in the same
one-point perspective — the floorboard / tile / rug lines already in the picture
must carry on at the same converging angles, with the same colour, grain,
lighting falloff and shadow direction.

Rules:
- Fill ONLY the white band. Do not alter a single pixel of the room above it.
- Add NO new objects: no furniture, no rugs, no props, no clutter, no pattern
  motifs, no text. Empty {short} only.
- If something in the picture is cut off by the old bottom edge (a rug, a table
  leg, a shadow), continue it naturally into the band.
- Keep the same illustration style: soft 3D-render look, warm ambient light,
  gentle vignette towards the bottom corners.
- Output the full image at the same dimensions, seamless at the join.
"""


# ------------------------------------------------------------------- geometry

def cover_geometry(img_aspect, scene_aspect):
    """Where a `cover; center bottom` picture lands, as fractions of the scene.

    Returns (scale_h, crop_top) where `scale_h` is the rendered picture height
    in units of scene height, and `crop_top` is how much of the picture's height
    is cut off the top. A point at fraction `p` of the picture's height sits at
    screen fraction `(p - crop_top) * scale_h ... ` — see `to_screen`.

    Two regimes, and the narrow one is why this script is needed:
      scene narrower than art -> height fills, sides crop. A point keeps its
          fraction: picture-bottom == screen-bottom, so an item at 99% of the
          art is at 99% of the screen, i.e. under the Play button.
      scene wider than art -> width fills, the top overflows and is cropped.
          The picture is magnified, so the band of floor below an item covers
          MORE screen and the item rides higher. Strictly better for us.
    """
    if scene_aspect <= img_aspect:          # crop sides, height fills exactly
        return 1.0, 0.0
    over = scene_aspect / img_aspect        # rendered height / scene height
    return over, (over - 1.0) / over        # fraction of the picture lost off the top


def to_screen(p, img_aspect, scene_aspect):
    """Picture-height fraction `p` -> scene-height fraction (0 = top of screen)."""
    scale_h, crop_top = cover_geometry(img_aspect, scene_aspect)
    return (p - crop_top) * scale_h


def band_on_screen(h0, h1, width, scene_aspect):
    """(top, height) of the NEW floor band on screen, as scene-height fractions.

    NOTE, because an earlier version of this script got it wrong and shipped a
    visible smear: `#room-bottom` is NOT an opaque block. Its background is
    `linear-gradient(0deg, rgba(10,6,24,.9), rgba(10,6,24,0))` — a scrim that is
    fully TRANSPARENT at its top edge and only 90% dark at the very bottom — and
    the only solid things in it are the Play button (x 32%-68%) and the streak
    bar (x 23%-77%). So the band is plainly visible in the gutters either side of
    the button, and merely dimmed in the middle.

    Conclusion: there is no such thing as an invisible band. Every extended hall
    wants real generated floor; a stretch is a placeholder, not a result. This
    function reports how much invented floor each hall's generation has to sell.
    """
    top = to_screen(h0 / h1, width / h1, scene_aspect)
    return top, max(0.0, 1.0 - top)


def solve_extension(h0, item_bottom_frac, target, width, scene_aspect):
    """Smallest extension E (px) that puts `item_bottom_frac` at/above `target`.

    Solved by search rather than algebra because the aspect crosses the
    scene_aspect boundary as E grows, switching `cover_geometry`'s regime.
    """
    lo, hi = 0, int(h0 * 2)
    while lo < hi:
        mid = (lo + hi) // 2
        h1 = h0 + mid
        p = (item_bottom_frac * h0) / h1
        if to_screen(p, width / h1, scene_aspect) <= target:
            hi = mid
        else:
            lo = mid + 1
    return int(np.ceil(lo / 2.0) * 2)       # keep it even; halves cleanly at SCALE


# ---------------------------------------------------------------- collections

def load_halls(only=None):
    with open(COLLECTIONS) as fh:
        data = json.load(fh)
    halls = []
    for hall in data["halls"]:
        layers = [s for s in hall.get("slots", []) if s.get("kind") == "layer"]
        if not layers:
            continue                        # placed-slot hall (bedroom): hand-tuned, skip
        if only and hall["id"] not in only:
            continue
        paths = []
        for slot in layers:
            rel = data["items"].get(slot["item"], {}).get("layer")
            if rel and os.path.exists(os.path.join(ROOT, rel)):
                paths.append((slot["item"], os.path.join(ROOT, rel)))
        halls.append({
            "id": hall["id"],
            "name": hall.get("name", hall["id"]),
            "backdrop": os.path.join(ROOT, hall["backdrop"]),
            "layers": paths,
        })
    if only:
        missing = set(only) - {h["id"] for h in halls}
        if missing:
            sys.exit("no layer hall(s) named: %s" % ", ".join(sorted(missing)))
    return halls


def is_applied(m):
    """Has this manifest entry already been spliced into the live backdrop?

    Decided from the file on disk, not a flag, so it stays true after a stash,
    a checkout or a pull rather than drifting out of sync with reality.
    """
    p = os.path.join(ROOT, m["backdrop"])
    try:
        return Image.open(p).size[1] == m["h1"]
    except OSError:
        return False


def lowest_item(hall, pristine=False):
    """(fraction, item_id) of the lowest solid pixel across the hall's layers.

    `pristine` reads the `_orig/` backups, i.e. the un-extended art — which is
    what `prep` and `preview` must measure, so they stay idempotent once `apply`
    has already padded the live files.
    """
    worst, who = 0.0, None
    for item, path in hall["layers"]:
        if pristine:
            path = original_of(path)
        alpha = np.asarray(Image.open(path).convert("RGBA").split()[3])
        rows = (alpha >= SOLID_ALPHA).sum(axis=1)
        hit = np.nonzero(rows >= SOLID_MIN_PX)[0]
        frac = (hit[-1] + 1) / alpha.shape[0] if len(hit) else 0.0
        if frac > worst:
            worst, who = frac, item
    return worst, who


# --------------------------------------------------------------------- backups

def backup(path):
    """Copy `path` into a sibling `_orig/` once, and return the backup's path."""
    d = os.path.join(os.path.dirname(path), "_orig")
    os.makedirs(d, exist_ok=True)
    dst = os.path.join(d, os.path.basename(path))
    if not os.path.exists(dst):
        shutil.copy2(path, dst)
    return dst


def restore(path):
    src = os.path.join(os.path.dirname(path), "_orig", os.path.basename(path))
    if os.path.exists(src):
        shutil.copy2(src, path)
        return True
    return False


def original_of(path):
    """The pristine image for `path` — the backup if one exists, else the file."""
    src = os.path.join(os.path.dirname(path), "_orig", os.path.basename(path))
    return src if os.path.exists(src) else path


# ------------------------------------------------------------------ phase: prep

def phase_prep(args):
    halls = load_halls(args.halls)
    rows = []
    for hall in halls:
        base = Image.open(original_of(hall["backdrop"])).convert("RGB")
        w, h0 = base.size
        frac, who = lowest_item(hall, pristine=True)
        need = solve_extension(h0, frac, args.target, w, args.scene_aspect)
        rows.append({"hall": hall, "w": w, "h0": h0, "frac": frac,
                     "who": who, "need": need})

    if args.uniform:
        # One extension for every hall, so all halls render at the same zoom.
        # Costs the shallow halls some magnification; buys visual consistency.
        big = max(r["need"] / r["h0"] for r in rows)
        for r in rows:
            r["need"] = int(np.ceil(r["h0"] * big / 2.0) * 2)

    os.makedirs(EXTEND_DIR, exist_ok=True)
    # MERGE into any existing manifest rather than replacing it. `apply --redo`
    # and `verify` read per-hall geometry from here, so a `prep --halls one-hall`
    # that dropped the other entries would strand every already-applied hall with
    # no way to redo it. (It did exactly that once, when Wedding Chapel arrived.)
    manifest = {"halls": {}}
    if os.path.exists(MANIFEST):
        try:
            with open(MANIFEST) as fh:
                manifest = json.load(fh)
            manifest.setdefault("halls", {})
        except (ValueError, OSError):
            manifest = {"halls": {}}
    manifest.update({"target": args.target, "scene_aspect": args.scene_aspect,
                     "ui_top": UI_TOP, "scale": args.scale,
                     "uniform": args.uniform})

    print("%-15s %-16s %6s %7s  %-11s %8s %13s" %
          ("hall", "lowest item", "at", "extend", "new size", "lands at",
           "new floor seen"))
    print("%-15s %-16s %6s %7s  %-11s %8s %6s %6s" %
          ("", "", "", "", "", "", "phone", "tablet"))
    print("-" * 88)
    for r in rows:
        hall, w, h0, e = r["hall"], r["w"], r["h0"], r["need"]
        h1 = h0 + e
        landed = to_screen(r["frac"] * h0 / h1, w / h1, args.scene_aspect)
        out = os.path.join(EXTEND_DIR, hall["id"])
        os.makedirs(out, exist_ok=True)

        if e > 0:
            base = Image.open(original_of(hall["backdrop"])).convert("RGB")
            s = args.scale
            canvas = Image.new("RGB", (w * s, h1 * s), (255, 255, 255))
            canvas.paste(base.resize((w * s, h0 * s), Image.LANCZOS), (0, 0))
            canvas.save(os.path.join(out, "to_generate.png"))

            # Inpaint mask in the common convention: WHITE = repaint, BLACK =
            # keep. Some APIs want it inverted; flip it there, not here.
            mask = Image.new("L", (w * s, h1 * s), 255)
            mask.paste(0, (0, 0, w * s, h0 * s))
            mask.save(os.path.join(out, "mask.png"))

            surface = args.surface or SURFACES.get(hall["id"], DEFAULT_SURFACE)
            short = "gravel" if "gravel" in surface else (
                "tile" if "tile" in surface else "floor")
            text = PROMPT_TEMPLATE.format(surface=surface, short=short)
            extra = PROMPT_EXTRA.get(hall["id"])
            if extra:
                text += extra + "\n"
            with open(os.path.join(out, "PROMPT.txt"), "w") as fh:
                fh.write(text)
        else:
            for name in ("to_generate.png", "mask.png", "PROMPT.txt"):
                p = os.path.join(out, name)
                if os.path.exists(p):
                    os.remove(p)

        seen_phone = band_on_screen(h0, h1, w, args.scene_aspect)[1] if e else 0.0
        seen_tablet = band_on_screen(h0, h1, w, TABLET_ASPECT)[1] if e else 0.0
        manifest["halls"][hall["id"]] = {
            "backdrop": os.path.relpath(hall["backdrop"], ROOT),
            "w": w, "h0": h0, "extend": e, "h1": h1,
            "gen_size": [w * args.scale, h1 * args.scale],
            "lowest_item": r["who"], "lowest_item_frac": round(r["frac"], 4),
            "lands_at": round(landed, 4),
            "band_seen_phone": round(seen_phone, 4),
            "band_seen_tablet": round(seen_tablet, 4),
            "layers": [os.path.relpath(p, ROOT) for _, p in hall["layers"]],
        }
        print("%-15s %-16s %5.1f%% %6dpx  %4dx%-6d %7.1f%% %5.1f%% %6.1f%%%s" %
              (hall["id"], r["who"] or "-", r["frac"] * 100, e, w, h1,
               landed * 100, seen_phone * 100, seen_tablet * 100,
               "   (already clear)" if e == 0 else ""))

    # Only the halls this run touched need art now — the manifest may also carry
    # halls applied on an earlier run, which must not be listed as outstanding.
    touched = [r["hall"]["id"] for r in rows if r["need"] > 0]
    gen = [h for h in touched if not is_applied(manifest["halls"][h])]
    manifest["needs_art"] = sorted(
        h for h, mm in manifest["halls"].items()
        if mm["extend"] > 0 and not is_applied(mm))
    with open(MANIFEST, "w") as fh:
        json.dump(manifest, fh, indent=1)

    print("\nPlay button starts at %.1f%%; target for the lowest item is %.1f%%."
          % (UI_TOP * 100, args.target * 100))
    print("The two right-hand columns are how much INVENTED floor each hall's\n"
          "generation has to sell. #room-bottom is a fade-to-transparent scrim,\n"
          "not an opaque bar, and the Play button only spans x 32%-68% — so the\n"
          "band always shows in the gutters beside it. Every hall needs real art.")
    print("wrote %s" % os.path.relpath(MANIFEST, ROOT))
    if gen:
        print("\nGENERATE all %d — for each, run art/extend/<hall>/to_generate.png\n"
              "through an image model with that folder's PROMPT.txt and save the\n"
              "result as art/extend/<hall>/generated.png, then run `apply`:\n    %s"
              % (len(gen), ", ".join(gen)))
    write_readme(manifest)


def write_readme(manifest):
    with open(os.path.join(EXTEND_DIR, "README.md"), "w") as fh:
        fh.write(
            "# Backdrop extension work folder\n\n"
            "Generated by `art/tools/extend_backdrops.py prep`. Everything here is\n"
            "scratch — safe to delete once `apply` has run and you like the result.\n\n"
            "## Per hall\n\n"
            "| file | what |\n|---|---|\n"
            "| `to_generate.png` | the current backdrop, upscaled %dx, with a white band at the bottom to fill |\n"
            "| `mask.png` | inpaint mask — **white = repaint**, black = keep (invert if your API wants the opposite) |\n"
            "| `PROMPT.txt` | ready-to-paste prompt |\n"
            "| `generated.png` | **you put this here** — the model's output |\n\n"
            "`.jpg`, `.jpeg` and `.webp` are accepted in place of `generated.png`.\n\n"
            "## Then\n\n"
            "```bash\npython3 art/tools/extend_backdrops.py apply\n"
            "python3 art/tools/extend_backdrops.py verify --open\n```\n\n"
            "`apply` keeps the original room rows pixel-exact and splices in only the\n"
            "new band, so the scene layers stay aligned. It also pads every\n"
            "`art/<hall>/scene/*.png` by the same amount. Originals are backed up to\n"
            "`art/backdrops/_orig/` and `art/<hall>/scene/_orig/`; re-run with `--redo`\n"
            "to start over from those.\n\n"
            "## Geometry\n\n"
            "See `manifest.json`. `lands_at` is where each hall's lowest item bottom\n"
            "ends up, as a fraction of screen height, on a %.4f-aspect scene. The home\n"
            "UI covers %.1f%%-100%%.\n" % (manifest["scale"], manifest["scene_aspect"],
                                           manifest["ui_top"] * 100))


# ----------------------------------------------------------------- phase: check

def phase_check(args):
    """Judge each returned image BEFORE splicing it in.

    Three things can go wrong with a returned band, and only the third is
    visible in a thumbnail:

      RECOMPOSED  The model rebuilt the room instead of only filling the band, so
                  its floor no longer lines up with the pristine rows `apply`
                  pastes back. `room` is the mean channel difference over the
                  original region; a re-decode alone scores single digits.
      SEAM        Even with the room intact, the model may have redrawn the floor
                  right ABOVE the join (blending into its own work). `seam` is the
                  same difference measured over the last 24 rows before the cut —
                  the strip the new band actually has to meet. This is the number
                  that predicts a visible step.
      EMPTY       The band came back still white/blank, or flat.

    Writes a seam close-up per hall: original above the line, returned band
    below, at 3x, so a step or a perspective break is obvious.
    """
    if not os.path.exists(MANIFEST):
        sys.exit("no manifest — run `prep` first")
    with open(MANIFEST) as fh:
        manifest = json.load(fh)
    out_dir = os.path.join(EXTEND_DIR, "_seams")
    os.makedirs(out_dir, exist_ok=True)

    ids = args.halls or list(manifest["halls"])
    print("%-15s %-19s %-11s %6s %6s %6s  %s" %
          ("hall", "file", "returned", "room", "seam", "bandSD", "verdict"))
    print("-" * 92)
    worst = []
    for hall_id in ids:
        m = manifest["halls"].get(hall_id)
        if not m or m["extend"] == 0:
            continue
        gen = find_generated(hall_id)
        if gen is None:
            print("%-15s %s" % (hall_id, "-- no image"))
            continue
        if isinstance(gen, list):
            print("%-15s !! %d candidates: %s" %
                  (hall_id, len(gen), ", ".join(os.path.basename(g) for g in gen)))
            continue

        w, h0, h1 = m["w"], m["h0"], m["h1"]
        im = Image.open(gen).convert("RGB")
        gw, gh = im.size
        got, want = gw / gh, w / h1
        r = np.asarray(im.resize((w, h1), Image.LANCZOS), dtype=np.float32)
        base_img = Image.open(original_of(os.path.join(ROOT, m["backdrop"]))).convert("RGB")
        b = np.asarray(base_img.resize((w, h0), Image.LANCZOS), dtype=np.float32)

        room = float(np.abs(r[:h0] - b).mean())
        seam = float(np.abs(r[h0 - 24:h0] - b[h0 - 24:]).mean())
        band = r[h0:]
        flags = []
        if abs(got - want) / want > args.aspect_tol:
            flags.append("ASPECT %.4f vs %.4f" % (got, want))
        if band.mean() > 245 or band.std() < 3:
            flags.append("BAND EMPTY")
        if room > args.room_tol:
            flags.append("RECOMPOSED?")
        if seam > args.seam_tol:
            flags.append("SEAM %.0f" % seam)
        verdict = "ok" if not flags else " + ".join(flags)
        if flags:
            worst.append(hall_id)
        print("%-15s %-19s %-11s %6.1f %6.1f %6.1f  %s" %
              (hall_id, os.path.basename(gen), "%dx%d" % (gw, gh),
               room, seam, float(band.std()), verdict))

        # Seam close-up: pristine rows above, returned band below, 3x.
        ctx = 60
        strip = Image.new("RGB", (w, ctx + min(ctx, h1 - h0)))
        strip.paste(base_img.resize((w, h0), Image.LANCZOS).crop((0, h0 - ctx, w, h0)), (0, 0))
        strip.paste(Image.fromarray(r[h0:h0 + ctx].astype(np.uint8)), (0, ctx))
        strip = strip.resize((strip.width * 3, strip.height * 3), Image.NEAREST)
        d = ImageDraw.Draw(strip)
        d.line([0, ctx * 3, strip.width, ctx * 3], fill=(255, 0, 200), width=2)
        d.text((4, 4), "%s  above = original, below = returned" % hall_id,
               fill=(255, 255, 0))
        strip.save(os.path.join(out_dir, hall_id + ".png"))

    print("\nseam close-ups: %s" % os.path.relpath(out_dir, ROOT))
    print("`room` is drift over the untouched room: single digits = a plain "
          "re-decode,\nwhich `apply` discards anyway by pasting the original rows "
          "back verbatim.\n`seam` is the strip the new band must meet — that is "
          "the one that shows.")
    if worst:
        print("\nworth eyeballing before/after apply: %s" % ", ".join(worst))
    if args.open:
        os.system("open %s" % out_dir)


# ----------------------------------------------------------------- phase: apply

INPUT_NAMES = {"to_generate.png", "mask.png"}     # what `prep` itself wrote


def find_generated(hall_id):
    """The model's returned picture in `art/extend/<hall>/`.

    `generated.png` is the documented name, but in practice whatever the image
    tool saved lands here — `sewingroom.png`, or `artgallery.png` for the art
    studio. So: any image in the folder that `prep` did not put there. Returns
    None if there is nothing, or a list if there is more than one (ambiguous, and
    guessing would silently pick the wrong art).
    """
    d = os.path.join(EXTEND_DIR, hall_id)
    if not os.path.isdir(d):
        return None
    found = [os.path.join(d, f) for f in sorted(os.listdir(d))
             if f not in INPUT_NAMES
             and f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))]
    if not found:
        return None
    return found[0] if len(found) == 1 else found


def phase_apply(args):
    if not os.path.exists(MANIFEST):
        sys.exit("no manifest — run `prep` first")
    with open(MANIFEST) as fh:
        manifest = json.load(fh)

    ids = args.halls or list(manifest["halls"])
    done, skipped = [], []
    for hall_id in ids:
        m = manifest["halls"].get(hall_id)
        if not m:
            print("!! %s: not in the manifest, skipping" % hall_id)
            continue
        if m["extend"] == 0:
            skipped.append("%s (needs no extension)" % hall_id)
            continue

        backdrop = os.path.join(ROOT, m["backdrop"])
        already = Image.open(backdrop).size[1] != m["h0"]
        if already and not args.redo:
            skipped.append("%s (already applied — pass --redo to redo)" % hall_id)
            continue

        w, h0, h1, e = m["w"], m["h0"], m["h1"], m["extend"]

        # Validate the input BEFORE restoring anything. Doing it the other way
        # round meant a `--redo` over a batch silently reverted any hall whose
        # file was bad, leaving it un-extended with only a skip line to say so.
        gen = find_generated(hall_id)
        how = "generated"
        if isinstance(gen, list):
            skipped.append("%s (%d candidate images — leave exactly one: %s)"
                           % (hall_id, len(gen),
                              ", ".join(os.path.basename(g) for g in gen)))
            continue
        if gen:
            new = Image.open(gen).convert("RGB")
            want = w / h1
            got = new.size[0] / new.size[1]
            if abs(got - want) / want > args.aspect_tol and not args.force:
                skipped.append("%s (generated aspect %.4f, want %.4f — crop it or "
                               "pass --force; left as-is)" % (hall_id, got, want))
                continue
        elif args.fill_missing:
            new = None      # built from the pristine backdrop below
            seen = max(m.get("band_seen_phone", 1), m.get("band_seen_tablet", 1))
            how = "STRETCHED placeholder — %.1f%% of screen shows it" % (seen * 100)
        else:
            skipped.append("%s (no generated.png yet)" % hall_id)
            continue

        if already:
            restore(backdrop)
            for rel in m["layers"]:
                restore(os.path.join(ROOT, rel))

        base = Image.open(original_of(backdrop)).convert("RGB")
        if base.size != (w, h0):
            base = base.resize((w, h0), Image.LANCZOS)
        if new is None:
            new, _, _ = compose_hall({"backdrop": backdrop, "layers": []},
                                     pad=e, fake_band=True)
            new = new.convert("RGB")
        if new.size != (w, h1):
            new = new.resize((w, h1), Image.LANCZOS)

        # Cancel the model's exposure shift before splicing, or the join lands as
        # a brightness step (every hall came back a few levels dark).
        if args.tone_match and gen:
            padded_base = Image.new("RGB", (w, h1))
            padded_base.paste(base, (0, 0))
            new, gain = tone_match_band(new, padded_base, h0)
            if max(abs(gain - 1.0)) > 0.01:
                how += " tone x%.2f/%.2f/%.2f" % tuple(gain)

        # Splice: original rows verbatim, new band below, feathered seam.
        out = new.copy()
        out.paste(base, (0, 0))
        if SEAM_BLEND > 0:
            top = np.asarray(base.crop((0, h0 - SEAM_BLEND, w, h0)), dtype=np.float32)
            bot = np.asarray(new.crop((0, h0 - SEAM_BLEND, w, h0)), dtype=np.float32)
            t = np.linspace(0, 1, SEAM_BLEND, dtype=np.float32)[:, None, None]
            band = (top * (1 - t) + bot * t).round().clip(0, 255).astype(np.uint8)
            out.paste(Image.fromarray(band), (0, h0 - SEAM_BLEND))

        backup(backdrop)
        save_image(out, backdrop)

        # Pad every layer with E transparent rows — the item does not move
        # relative to the room, so nothing else changes.
        for rel in m["layers"]:
            path = os.path.join(ROOT, rel)
            layer = Image.open(original_of(path)).convert("RGBA")
            if layer.size != (w, h0):
                layer = layer.resize((w, h0), Image.LANCZOS)
            padded = Image.new("RGBA", (w, h1), (0, 0, 0, 0))
            padded.paste(layer, (0, 0))
            backup(path)
            padded.save(path)

        done.append("%s  %dx%d -> %dx%d  +%dpx floor %s, %d layers padded" %
                    (hall_id, w, h0, w, h1, e, how, len(m["layers"])))

    for line in done:
        print("OK  %s" % line)
    for line in skipped:
        print("--  %s" % line)
    if done:
        print("\nNow run:  python3 art/tools/extend_backdrops.py verify --open")


def tone_match_band(new, base, h0, rows=TONE_MATCH_ROWS):
    """Rescale `new`'s band so it joins `base`'s floor without a brightness step.

    Both pictures contain the strip of floor just above the cut, so the ratio of
    their means there is exactly the exposure shift the model introduced. Applied
    as a per-channel multiplicative gain to the band only — multiplicative, not
    additive, because it is an exposure difference, and uniform over the band so
    whatever vignette the model painted into it survives.

    Returns (image, gain) with gain (1,1,1) when there is nothing to correct.
    """
    a = np.asarray(new, dtype=np.float32)
    b = np.asarray(base, dtype=np.float32)
    top = max(0, h0 - rows)
    ref = b[top:h0].reshape(-1, 3).mean(axis=0)
    got = a[top:h0].reshape(-1, 3).mean(axis=0)
    gain = np.where(got > 1.0, ref / np.maximum(got, 1e-6), 1.0)
    gain = np.clip(gain, *TONE_GAIN_CLAMP)
    a[h0:] = np.clip(a[h0:] * gain, 0, 255)
    return Image.fromarray(a.astype(np.uint8)), gain


def save_image(img, path):
    if path.lower().endswith((".jpg", ".jpeg")):
        img.save(path, quality=JPEG_QUALITY, subsampling=0)
    else:
        img.save(path)


# ------------------------------------------------------ phase: verify / preview

def compose_hall(hall, pad=0, fake_band=False):
    """Backdrop with every layer stacked, optionally padded by `pad` rows.

    `fake_band` fills the pad with a perspective-ish stretch of the backdrop's
    own bottom rows instead of leaving it blank — a stand-in for the art a model
    will produce, good enough to judge framing.
    """
    base = Image.open(original_of(hall["backdrop"])).convert("RGBA")
    w, h0 = base.size
    for _, path in hall["layers"]:
        layer = Image.open(original_of(path)).convert("RGBA")
        if layer.size != (w, h0):
            layer = layer.resize((w, h0), Image.LANCZOS)
        base = Image.alpha_composite(base, layer)
    if pad <= 0:
        return base, w, h0

    out = Image.new("RGBA", (w, h0 + pad), (0, 0, 0, 255))
    out.paste(base, (0, 0))
    if fake_band:
        # Stretch the last SRC rows down over the band. A receding floor's grain
        # coarsens towards the viewer anyway, so a vertical stretch reads as
        # roughly-right perspective at preview size.
        src = max(8, min(h0 // 6, pad))
        strip = base.crop((0, h0 - src, w, h0)).resize((w, pad), Image.BICUBIC)
        out.paste(strip, (0, h0))
    return out, w, h0 + pad


def render_phone(img, sa, out_h=900):
    """Apply the browser's `cover; center bottom` crop to a scene-shaped canvas."""
    w, h = img.size
    out_w = int(round(out_h * sa))
    scale_h, _ = cover_geometry(w / h, sa)
    rh = int(round(out_h * scale_h))
    rw = int(round(rh * w / h))
    shot = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 255))
    shot.paste(img.resize((rw, rh), Image.LANCZOS), ((out_w - rw) // 2, out_h - rh))
    return shot


def draw_ui_overlay(shot, landed, who, label, band_top=None):
    """Paint the measured home-screen UI over a phone render, plus the item line.

    Drawn to match reality, because a solid red block here is what hid the fact
    that the art shows through: #room-bottom is a gradient scrim (transparent at
    its top, 90% dark at the screen's bottom) and only the Play button and streak
    bar are solid, each spanning part of the width. Whatever is still legible in
    this render is legible in the game.
    """
    out_w, out_h = shot.size
    d = ImageDraw.Draw(shot, "RGBA")
    # The scrim, as an actual gradient.
    top = int(out_h * UI_TOP)
    for y0 in range(top, out_h):
        a = int(230 * (y0 - top) / max(1, out_h - top))
        d.line([0, y0, out_w, y0], fill=(10, 6, 24, a))
    # The two solid widgets, at their measured x spans.
    d.rectangle([int(out_w * .323), int(out_h * .798),
                 int(out_w * .677), int(out_h * .876)], fill=(245, 166, 35, 255))
    d.rectangle([int(out_w * .226), int(out_h * .890),
                 int(out_w * .774), int(out_h * .953)], fill=(30, 20, 45, 235))
    if band_top is not None:
        yb = int(out_h * band_top)
        d.line([0, yb, out_w, yb], fill=(90, 170, 255, 255), width=2)
        d.text((6, min(out_h - 14, yb + 3)), "new floor starts here (%.1f%%)"
               % (band_top * 100), fill=(90, 170, 255, 255))
    y = int(out_h * landed)
    ok = "CLEAR" if landed <= UI_TOP else "OCCLUDED"
    tint = (60, 255, 90, 255) if landed <= UI_TOP else (255, 80, 80, 255)
    d.line([0, y, out_w, y], fill=tint, width=3)
    d.text((6, max(0, y - 16)), "%s bottom %.1f%%  %s" % (who, landed * 100, ok), fill=tint)
    d.text((6, 6), label, fill=(255, 255, 255, 255))
    return ok


def audit_render(hall, pad, sa, dst, fake_band=False, note=""):
    img, w, h = compose_hall(hall, pad, fake_band)
    frac, who = lowest_item(hall, pristine=True)
    landed = to_screen(frac * (h - pad) / h, w / h, sa)
    shot = render_phone(img, sa)
    btop = band_on_screen(h - pad, h, w, sa)[0] if pad else None
    ok = draw_ui_overlay(shot, landed, who,
                         "%s  %dx%d  scene %.4f%s" % (hall["id"], w, h, sa, note),
                         band_top=btop)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shot.convert("RGB").save(dst)
    return who, landed, ok


def phase_verify(args):
    """Render each hall as the phone shows it, with the UI band drawn over.

    This is the only check that answers the actual question — "is the item above
    the Play button?" — because it applies the same cover crop the browser does
    and then paints the measured UI rectangle on top. Run it on the LIVE files,
    so it reports the state the game is actually in.
    """
    for hall in load_halls(args.halls):
        # Compose from live files, not backups: this is a check on shipped state.
        live = Image.open(hall["backdrop"]).convert("RGBA")
        w, h = live.size
        for _, path in hall["layers"]:
            layer = Image.open(path).convert("RGBA")
            if layer.size != live.size:
                layer = layer.resize(live.size, Image.LANCZOS)
            live = Image.alpha_composite(live, layer)
        frac, who = lowest_item(hall)
        landed = to_screen(frac, w / h, args.scene_aspect)
        h0 = Image.open(original_of(hall["backdrop"])).size[1]
        shot = render_phone(live, args.scene_aspect)
        btop = (band_on_screen(h0, h, w, args.scene_aspect)[0]
                if h != h0 else None)
        ok = draw_ui_overlay(shot, landed, who, "%s  %dx%d  scene %.4f"
                             % (hall["id"], w, h, args.scene_aspect),
                             band_top=btop)
        dst = os.path.join(AUDIT_DIR, hall["id"] + ".png")
        os.makedirs(AUDIT_DIR, exist_ok=True)
        shot.convert("RGB").save(dst)
        print("%-15s lowest %-16s at %5.1f%%  %-9s %s" %
              (hall["id"], who or "-", landed * 100, ok, os.path.relpath(dst, ROOT)))
    if args.open:
        os.system("open %s" % AUDIT_DIR)



def phase_preview(args):
    """Fake the new band and render the result, for the framing decision."""
    if not os.path.exists(MANIFEST):
        sys.exit("no manifest — run `prep` first")
    with open(MANIFEST) as fh:
        manifest = json.load(fh)
    out_dir = os.path.join(EXTEND_DIR, "_preview")
    for hall in load_halls(args.halls):
        m = manifest["halls"].get(hall["id"])
        if not m:
            continue
        pad = m["extend"]
        dst = os.path.join(out_dir, hall["id"] + ".png")
        who, landed, ok = audit_render(hall, pad, args.scene_aspect, dst,
                                       fake_band=True, note="  +%dpx (faked)" % pad)
        print("%-15s +%-6dpx  lowest %-16s -> %5.1f%%  %-9s %s" %
              (hall["id"], pad, who or "-", landed * 100, ok,
               os.path.relpath(dst, ROOT)))
    print("\nBands are a stretch of the existing floor, NOT final art — judge the\n"
          "framing and zoom only. Re-run `prep` with a different --target or\n"
          "--uniform and preview again until the framing is right.")
    if args.open:
        os.system("open %s" % out_dir)


# ------------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser(
        description=__doc__.split("\n")[0],
        formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="phase", required=True)

    def common(p):
        p.add_argument("--halls", type=lambda s: [x.strip() for x in s.split(",") if x.strip()],
                       help="comma-separated hall ids (default: every layer hall)")
        p.add_argument("--scene-aspect", type=float, default=REF_SCENE_ASPECT,
                       help="reference #room-scene aspect (default %(default)s)")

    p = sub.add_parser("prep", help="measure halls and emit generation inputs")
    common(p)
    p.add_argument("--target", type=float, default=TARGET_BOTTOM,
                   help="screen fraction the lowest item's bottom should reach "
                        "(default %%(default)s; UI starts at %.3f)" % UI_TOP)
    p.add_argument("--uniform", action="store_true",
                   help="give every hall the same proportional extension, so all "
                        "halls render at the same zoom")
    p.add_argument("--scale", type=int, default=SCALE,
                   help="upscale factor for the generation input (default %(default)s)")
    p.add_argument("--surface", help="override the per-hall floor description "
                                     "baked into SURFACES, for the prompt")
    p.set_defaults(func=phase_prep)

    p = sub.add_parser("preview", help="render with a faked band, to judge framing")
    common(p)
    p.add_argument("--open", action="store_true", help="open the preview folder")
    p.set_defaults(func=phase_preview)

    p = sub.add_parser("check", help="judge returned images before splicing them in")
    common(p)
    p.add_argument("--aspect-tol", type=float, default=0.015)
    p.add_argument("--room-tol", type=float, default=12.0,
                   help="mean drift over the original room that reads as a "
                        "recomposition rather than a re-decode (default %(default)s)")
    p.add_argument("--seam-tol", type=float, default=12.0,
                   help="mean difference in the 24 rows above the cut that risks a "
                        "visible step (default %(default)s)")
    p.add_argument("--open", action="store_true", help="open the seam close-ups")
    p.set_defaults(func=phase_check)

    p = sub.add_parser("apply", help="splice generated bands in and pad layers")
    common(p)
    p.add_argument("--redo", action="store_true",
                   help="restore from _orig/ backups first, then re-apply")
    p.add_argument("--force", action="store_true",
                   help="accept a generated image whose aspect is off")
    p.add_argument("--aspect-tol", type=float, default=0.015,
                   help="allowed relative aspect error (default %(default)s)")
    p.add_argument("--no-tone-match", dest="tone_match", action="store_false",
                   help="skip the per-channel gain that cancels the model's "
                        "exposure shift across the seam")
    p.add_argument("--fill-missing", action="store_true",
                   help="PLACEHOLDER ONLY: for halls with no generated.png, "
                        "stretch the existing floor into the band. It is visible "
                        "in the gutters beside the Play button, so use this to fix "
                        "the framing now and regenerate later with --redo")
    p.set_defaults(func=phase_apply)

    p = sub.add_parser("verify", help="render each hall with the UI band over it")
    common(p)
    p.add_argument("--open", action="store_true", help="open the audit folder")
    p.set_defaults(func=phase_verify)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
