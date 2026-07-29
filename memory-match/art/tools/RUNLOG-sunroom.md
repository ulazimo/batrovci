# Sunroom hall run log

Built 2026-07-29 following `SCENE-LAYERS-PLAN.md` / `RUNLOG-HALLS-9-11.md`'s recipe.
One of five sibling halls (Sunroom, Writer's Study, Nursery, Wine Cellar, Curiosity
Shop) built in parallel by separate agents sharing the same scratchpad — only
`art/backdrops/sunroom.jpeg`, `art/sunroom/*.png` and `art/sunroom/scene/*.png` were
touched. `collections.js`/`.json` and `wire_scene_layers.py`/`add_halls_9_11.py` were
**not** touched — out of scope per the brief, a separate wiring step runs after all
five hall-agents finish.

Model `520f3a09-b843-47f4-9d4c-5b24ae3bb7bb` (Gemini 3 Pro Image) for the backdrop
and the 6 white-plate items; model `71f83b71-7918-4258-9e79-02d4f69f2b0d` (Gemini 3
Pro Image Edit) for the 6 scene-layer edits, `init`=backdrop + `editing_reference`=
item PNG, 1152×2048, `batch_size: 2`. Session `cb3527e7-e6c9-4061-85f0-8efcf82f1ff1`.

**7 forge runs total: 1 backdrop + 6 items (batch 2) + 6 edits (batch 2) + 1 sundial
redo (batch 2) = 15 runs, ~120 CU.** All edits succeeded first-fire; the only redo
was the sundial's height, which did not actually improve (see below).

## What shipped

| item | level slot | pick | extract thresh | redo? |
|---|---|---|---|---|
| teaset | side table top | edit variant a | 22 | no |
| birdcage | windowsill (far left) | edit variant a | **40** | thresh only (auto/22 linked to a window-mullion drift line + a stray blob near the side table, causing a real teaset collision — see below) |
| parasol | rug, leaning on armchair leg | edit variant b | 26 | no |
| croquetset | rug, right of armchair | edit variant a | 26 | thresh only (auto/14 linked a floor-seam drift line reaching to x=99.7%) |
| sundial | stone pedestal top | edit variant a (first pass) | 22 | **yes, redo fired — no improvement, first pass kept** |
| gardenhat | rattan stool seat | edit variant a | 22 | no |

Item picks were all "variant a" except parasol ("variant b" — cleaner separation
from the side table). Backdrop was `batch_size: 1` (single fire, no pick needed) and
came back on-brief first try: bright glass sunroom, wicker armchair with floral
cushion, side table, stool, stone pedestal, hanging empty basket, all bare.

## Measured surfaces (grid_overlay.py, % of picture height from bottom)

| surface | x | height |
|---|:--:|:--:|
| rattan side table, top | 3–33 | ~32 |
| tall windowsill (left segment) | 2–18 | ~38 |
| rattan stool, seat | 75–95 | ~27 |
| stone pedestal, top | 58–80 | ~50 |
| rug foreground (chair's left leg) | 20–35 | ~13 |
| rug foreground (right of chair) | 62–80 | ~12 |
| armchair's woven backrest (ceiling landmark) | 30–70 | ~57 |

No natural window crossbar existed near the 60% line (checked — the window is one
continuous pane up to an ~80% arch spring), so every ceiling clause in the object
lines references **the top of the armchair's woven backrest (~57%)** instead, which
is visible across most of the frame and reliably under 60%.

## The birdcage/parasol collision — real, and how it was fixed

First `check_hall_layers.py` pass (all six at their first-choice thresholds) reported
one genuine collision:

```
birdcage      parasol       share  25.2%  disagreement  67.3  <-- COLLISION
```

The birdcage layer's alpha bbox was `y 182–789` — a birdcage cannot be 60% of the
picture tall. Its mask had linked in two faint vertical window-mullion drift lines
running up to the top of frame **and** a spiky secondary blob down near the side
table/parasol region, via `--link-px` connectivity through low-energy drift. Neither
`thresh 22` nor `26/30/34` fully separated it — only **`thresh 40`** dropped both the
mullion lines and the stray blob, leaving a clean 164×202 birdcage-shaped mask.
Re-ran `check_hall_layers.py`: 0.0% overlap with everything except a 3.5% (harmless,
no-disagreement) share with teaset. Final: **no collisions, every pair composites
identically in either unlock order.**

`croquetset` had the same drift-link symptom in miniature (a thin floor-seam line
reaching to x=99.7%, no other slot touched); `thresh 26` (vs. the auto 14) cleaned it
to a tight 258×98 mask with no functional change to the object itself.

## The sundial's height — known, accepted deviation

The sundial's painted top sits at **63.5%** of picture height — over the 60% budget
by 3.5 points. Its pedestal surface itself measures ~50%, and the sundial (tilted
dial + brass disc) is compact but still carries its own height above that. Fired one
redo explicitly capping it ("no taller than two-fifths of the pedestal's own height...
must stay well below 55%"); **both variants came back if anything taller (63.5% and
68.7%)** — the model preserved the reference PNG's proportions over the new height
instruction, the same failure mode `RUNLOG-HALLS-9-11.md` documented for the
artstudio's easel ("the model's mask *is* the object; raising a constraint did
nothing"). Kept the original (63.5%) rather than spend a third firing chasing it.
Practical impact: on the iPad crop (~62% visible) only the last ~1.5% of the dial's
very tip is at risk of clipping — the pedestal, base and most of the dial face stay
comfortably in frame. Not re-fired again per the same doc's guidance not to burn
redos against a proportion the model won't move.

## The crop — measured against the phone-safe x 10.4–89.6% band

| layer | object x-range | top height | note |
|---|:--:|:--:|---|
| teaset | 0.2–34.5% | 38.7% | left edge: table sits at the room's back-left corner, same as birdcage below |
| birdcage | 0.3–28.8% | 54.9% | surface-bound — the windowsill this hall's brief calls for is at the far left wall |
| parasol | 25.7–68.2% | 38.8% | fully inside the safe band |
| croquetset | 51.2–96.0% | 22.4% | right edge: the rug's right-hand clear patch runs to the frame edge |
| sundial | 57.6–75.3% | **63.5%** | inside the x-band; top exceeds the 60% ceiling (see above) |
| gardenhat | 68.8–96.7% | 41.4% | surface-bound — the rattan stool sits at the room's back-right corner |

Four of six touch or cross the trimmed edge (teaset/birdcage on the left, croquetset/
gardenhat on the right) — all four are **surface-bound, not prompt-bound**: the side
table and windowsill genuinely sit at x 2–33% and the stool at x 75–95%, mirroring
exactly the pattern `RUNLOG-HALLS-9-11.md` found in the sewing room (its wicker stool
sits at x 3–30%, so anything on it loses its outer edge on a phone). This is the
room's furniture, not a prompt failure — consistent with that log's advice, this was
not re-fired chasing a surface that doesn't exist elsewhere in the room.

## check_hall_layers.py — final result

```
overlap matrix (% of the smaller mask shared):
                 teaset birdcage  parasol croquets  sundial gardenha
teaset                -     3.5?     0.8      0.0      0.0      0.0
birdcage           3.5?        -     0.0      0.0      0.0      0.0
parasol            0.8      0.0         -    12.2!     0.0      0.0
croquetset         0.0      0.0     12.2!        -     0.0      0.0
sundial            0.0      0.0      0.0      0.0         -     0.0
gardenhat          0.0      0.0      0.0      0.0      0.0         -

no collisions — every pair composites the same in either order
```

The two `!`-flagged shares (teaset/birdcage 3.5%, parasol/croquetset 12.2%) are mere
spatial adjacency with zero disagreement — the same "touching, not conflicting"
pattern as the kitchen's jam-jars/cat pair in the original recipe doc, not defects.

## Files written

- `art/backdrops/sunroom.jpeg` — 576×1024 RGB backdrop.
- `art/sunroom/{teaset,birdcage,parasol,croquetset,sundial,gardenhat}.png` — 512px-long-side
  keyed white-plate item crops (RGBA), for the behind-board reveal (`item.file`).
- `art/sunroom/scene/{...}.png` — 576×1024 RGBA full-scene tableau layers (`item.layer`),
  aspect 0.5625 exactly matching the backdrop.
- This file.

Not written: any `collections.*`, any `wire_*`/`add_halls_*` script run, any other
hall's files.
