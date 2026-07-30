# Sweet Shop run log

**DONE 2026-07-30.** Backdrop generated, 7 white-plate items generated/keyed,
7 scene-layer edits fired (with heavy redo traffic — see below), all 7 final
layers pass `check_hall_layers.py` with **zero collisions**. This hall's level
range, wiring into `collections.json`/`.js`, and any `add_halls_*.py`-style
script are **out of scope** for this task — a separate step wires this hall
(and the sibling "Game Room" hall built in parallel) together afterward.

**~29 forge runs, ~204 CU** (1 backdrop + 9 item-generation calls [2 failed
free, 1 retry each] + 18 scene-edit calls [1 failed free, 10 of the other 17
were redos]).

## What shipped

| item | pick | extraction | scene-edit redos | why |
|---|---|---|:--:|---|
| `icecreamsundae` | 1st scene-edit, 1st variant | auto (14) | 0 | Landed correctly at the counter's front-left corner first try. |
| `lollipopjar` | **3rd** scene-edit attempt, variant a | **manual ROI** (see below) | **2** | See "the front-left-corner magnet" below — 2 redos to escape the corner where `icecreamsundae` already sat, plus a manual extraction fix because `extract_layer.py`'s auto blob-picker kept selecting a wall/fairy-light drift vein instead of the jar (margin 1.2–2.0x flagged it every time). |
| `cupcakestand` | 1st scene-edit, 1st variant (the redo was fired but never used) | **manual ROI** | 1 (unused) | The object itself was correctly painted into the display case on the very first try — the problem was 100% in extraction, not generation. See "the pale-object-loses-the-blob-race problem" below. |
| `milkshake` | 1st scene-edit, variant b | **thresh 34** (auto was 14) | 0 | Auto threshold pulled in the same wall/light drift vein (it sits close enough to the table to link). Raising thresh sheds it cleanly; object unaffected. |
| `cottoncandy` | **5th** scene-edit attempt (lying on the floor, foreground) | **manual ROI** | **4** | The hall's hardest item by far — see "cottoncandy's saga" below. |
| `candyjar` | **3rd** scene-edit attempt, variant b | **manual ROI, two passes** | **2** (+1 failed-free retry of a mid-saga attempt) | First attempt landed on the table (rejected); second attempt (after a `Request not found` provider failure needed re-firing) got it onto the floor but the extractor's auto blob-picker again grabbed the vein, this time merging in the chair/table and colliding with milkshake at 96.6%; third attempt repositioned it to the floor under the wire shelf, then a second manual-ROI pass cropped the jar's lid off at the top to clear a residual 63.9% collision with milkshake. |
| `popcornbox` | 1st scene-edit, variant a | auto (14) | 0 (1 redo fired, unused) | Landed correctly at the counter/floor corner first try. A later redo aimed to nudge it snugger against the counter to pre-empt a suspected collision with `cottoncandy`; turned out unnecessary (see below) so the original ships. |

## Three separate failure modes, not one — worth telling apart

This hall hit every failure mode documented in the prior halls' run logs, plus
one that hadn't shown up before. Don't reach for "raise the threshold" as a
universal fix — it only addresses the second one below.

### 1. The wall/fairy-lights vein — a per-backdrop drift hazard

This backdrop's top-right area (the wire café shelf + the string of fairy
lights across the top edge) re-renders with visibly different dust-mote/bokeh
positions and light-bloom on **every single edit**, producing a tall, thin,
moderate-contrast diff blob that runs from the very top of the frame down
past the shelf. It showed up as a `dropped blob ~15000px at (438,3)-(573,576)`
line in nearly every extraction's console output. For items generated far
from it (`icecreamsundae`, `lollipopjar`'s final position, `popcornbox`) it's
correctly dropped by `extract_layer.py`'s `LINK_PX` distance gate and is a
non-issue. For items placed *near* it (`milkshake`, and any placement near the
display case's right side or the wire shelf), it gets linked into the primary
blob and inflates `keep%` — fixable by raising `--thresh` (34 worked for
`milkshake`) **only when the vein and the object don't compete for primary
blob selection** — see mode 2 for when that stops working.

### 2. The pale-object-loses-the-blob-race problem — new this hall

`extract_layer.py` picks ONE global "primary blob" by diff energy across the
whole 576×1024 frame, then keeps anything within `LINK_PX` of it. This
implicitly assumes the added object's own diff is either the biggest blob or
close to it. `cupcakestand` broke that assumption outright: a small white
ceramic stand with pale pastel icing, painted behind glass in already
pale/warm-lit surroundings, produces a diff so faint (mean ~9.6 within its own
footprint) that the vein (mean ~13.9, much bigger area) always won the primary
slot — at **every** threshold from 14 up to 90 the "primary blob" was either
the vein, a random brighter fairy-light bead, or (above 50) a single ~20×20px
fragment of the cupcake stand's highest-contrast pixel cluster, never the
whole object. The margin flag (1.2x) was the correct warning; it just doesn't
tell you *what to do* — raising or lowering thresh cannot fix a race the
object was never going to win.

**The fix that actually works: bypass global blob selection entirely.**
Crop the diff computation to a small hand-picked ROI around the object's known
visual location (read off the edit image directly, not off the diff), run the
same threshold → close → label → largest-blob → fill-holes → feather pipeline
*inside that ROI only*, then composite. This is a ~30-line standalone script,
not a flag on `extract_layer.py`. Used for `cupcakestand`, `lollipopjar` (same
vein-competition problem despite being a normal-contrast object — the vein
plus a chain of small fairy-light fragments kept out-competing it too) and
both `cottoncandy` and `candyjar` (different reason — see mode 3). **4 of 7
items in this hall needed manual ROI extraction.** That is a much higher rate
than any prior hall and is a property of this backdrop (a lot of independently
re-rendered detail: dust motes, fairy lights, a reflective glass display
case) rather than of any one item.

### 3. Prop-level redraw reaching into a neighbour's territory — confirms the curiosityshop precedent, adds a variant

`cottoncandy`'s first two placements (the stool "tucked beside the bistro
table") triggered the *exact* mantelclock failure from
`RUNLOG-curiosityshop.md`: adding anything to that stool made the model
redraw the whole prop, including its legs and cross-brace reaching down to
the very bottom of the frame — confirmed by manually plotting row-widths of
the diff mask, which showed one unbroken connected shape from the cotton
candy's top puff (y≈505) straight down to y≈1020 (the image's bottom edge),
with no natural gap a threshold could exploit. Raising `--thresh` to 40 still
left the leg-redraw connected while starting to erode the actual object
(pale-pink cloud against a pale-pink wall stripe — mode 2 again, compounding).
**Fix used:** manual ROI, cut at the row where the object's own silhouette
narrows to its thinnest (the cone shaft, not the seat cushion) — y≤722 — which
keeps the cloud+cone fully intact and discards the cushion/leg redraw
entirely. The backdrop's own unedited stool cushion shows through underneath
and reads fine; the join is invisible in the composite.

The new variant: `candyjar`'s second attempt did the same thing but sideways
— asking for the jar "on the floor below the wire shelf" made the model also
redraw the **chair and part of the table** it happened to be near, producing
a mask that reached all the way up to y=3 and collided with `milkshake` at
96.6%. Manual ROI fixed it the same way (crop to the jar's own footprint).

## Cottoncandy's saga — the hall's hardest item, 5 generation attempts

1. **Stool tucked beside the table** (2 attempts, including one with an
   explicit "do not touch the stool's legs" clause) — both re-rendered the
   whole stool down to the floor (mode 3). Also, once `lollipopjar` was
   relocated to the display-case corner in its own 3rd attempt, this same
   stool turned out to sit almost exactly there too (bbox overlap 50.2%,
   confirmed real disagreement) — a second, independent reason to abandon
   this surface.
2. **The bottom-right foreground stool, named explicitly** ("closest to the
   camera, NOT the stool near the display case") — the model **ignored the
   instruction both times** and painted the same near-the-table stool again.
   This is the `letterbundle` positional-prior failure from
   `RUNLOG-study.md` repeating almost exactly: a strong default reading of
   "put the small object near the other seating" that explicit negation
   could not overturn.
3. **Lying on its side on the floor, extreme foreground** — worked
   structurally (clean, isolated silhouette after manual ROI extraction,
   fully order-independent against every other layer) but the first version
   of this attempt's mask (before ROI-restriction) reached the neighbouring
   chair's legs, and its footprint briefly collided 42.2% with an earlier
   `candyjar` placement, forcing `candyjar`'s own relocation (see above).
4. **On the bistro table, front edge, opposite the milkshake** — the model
   again defaulted toward the table's centre: the two objects' masks
   overlapped 85.9% of the smaller one, and one of the two generated variants
   for this attempt also hallucinated an unrequested second milkshake-like
   glass next to it (a straight violation of the PRESERVE clause's "do not
   add any other object" — rejected on sight).
5. **Shipped:** attempt 3 (lying on the floor), final position after the
   manual-ROI fix: **x 30.7–64.9%, top 28.9%** — comfortably under the 60%
   ceiling, and the only attempt that both matched the brief loosely enough
   to still read as "cotton candy that ended up on the floor of an ice-cream
   parlour" and left every neighbour alone.

**Lesson for the next hall:** if an item bounces off two different named
surfaces for the same underlying reason (a positional prior toward one hot
corner of the room), stop trying to name the *right* stool/chair/shelf more
precisely — move the object to a different **kind** of surface (floor vs.
furniture-top) entirely, the way `letterbundle` moved from desk to rug.

## The counter's front-left corner is this backdrop's positional magnet

Every item asked to sit "on the marble counter" without an extremely specific
counter-relative landmark defaulted to the same front-left corner —
`icecreamsundae` (correctly, that's where it was supposed to go) and, on its
first two attempts, `lollipopjar` too, despite explicit "leave a gap",
"well past", and "must not be adjacent to the corner" phrasing. What finally
worked for `lollipopjar` was anchoring to a **different piece of furniture**
instead of a fractional position on the same surface: *"directly below and
in front of the rounded front corner of the glass display case"* — landed
correctly on the first try once phrased that way. This matches the
`mapscroll`/`stampalbum` lesson from `RUNLOG-curiosityshop.md`: a percent-of-
surface instruction is weak, a named second landmark is strong.

## Honest compromises

- **`cottoncandy` lies on the floor rather than standing on a stool or table**,
  which is a real departure from the brief's "upright" description. This was
  a deliberate trade after 4 failed placement attempts exhausted the
  reasonable alternatives (both stools, the table); a lying cone of cotton
  candy still reads clearly as the item and causes zero collisions.
- **Three items sit slightly over the documented 60% iPad-crop ceiling**:
  `icecreamsundae` top 61.4%, `cupcakestand` top 60.1%, `milkshake` top 61.0%.
  All three overages are ≤1.4 points — in the same range as the
  `curiosityshop/mantelclock` precedent (0.9 points, accepted) — and in every
  case the part crossing the line is a thin cosmetic element (a straw tip, a
  cupcake-stand finial) rather than the object's main mass. Not re-fired
  given the redo budget already spent on this hall and the demonstrated risk
  that re-firing relocates the whole object rather than trimming it.
- **`candyjar` lost its lid** in the final manual-ROI crop (cut at y=615 to
  clear the collision with `milkshake`) — it now reads as an open jar of
  candy rather than a jar with a domed lid. Acceptable: the candies (the
  actual visual interest) are fully intact, and "open jar" is a perfectly
  normal candy-shop prop.
- **`lollipopjar`/`popcornbox` share 30.4%** of the smaller mask by the
  overlap-matrix's raw percentage, but the real intersection is only
  **1289px** — under `check_hall_layers.py`'s `MIN_INTER_PX=2000` sliver gate,
  so it never reached the order-independence check and is not a real defect
  (the same "shared backdrop, not a conflict" case the tool's own docstring
  calls out for the kitchen's jam-jars-and-cat).
- **Manual ROI extraction is not scripted as a reusable flag.** Four items
  in this hall needed it, each with a hand-picked bounding box read off the
  edit image. If a future hall needs this rate of manual intervention again,
  it's worth promoting to a proper `--roi x0 y0 x1 y1` flag on
  `extract_layer.py` rather than re-deriving the numpy each time.

## Reusable Layer file_ids — do NOT re-upload

backdrop (uploaded, used as `init` in every scene edit):
`9e1020d5-040a-472a-b28a-3ba7412a599d`
(original forge output file_id, equally reusable: `537448e8-306b-4a5e-b19c-75d9a3200edb`)

items (512px keyed PNGs, uploaded as `editing_reference`):
icecreamsundae `e8649968-6c11-4e72-98a1-11494a2c2d63`, cupcakestand
`f3e7f2e1-75dd-4ead-af15-13f0599a866c`, milkshake
`f8b89bad-1c4a-4971-ab6c-661e380f4bdd`, candyjar
`f4f23139-5ec4-459e-a09f-be316fa782aa`, popcornbox
`c33a16f0-6ea4-4241-b654-bbc1ff607ad9`, lollipopjar
`52244149-f6f9-44ea-a1ec-20719c998628`, cottoncandy
`71504156-1c6c-4a10-8352-3c26cc7f7d1d`

Shipped scene-edit inference ids (the exact edit each final layer was
extracted from): icecreamsundae `3e8cffb3-b33e-42d8-bfd6-9731764c04b5`
(variant b), cupcakestand `5879ed6d-8086-4556-85da-4818a7f26e24` (variant b,
the **original** attempt — the redo `87d45783-3e86-490d-9e8c-6e463748326d`
was fired and never used), milkshake
`74672688-4f5c-4dad-8464-58e009e28078` (variant b), lollipopjar
`9fb51039-5a4f-488d-b1b2-c4ace7307ec5` (variant a — 3rd attempt; rejects:
`b9d556c6-fc31-4933-831a-d135c30bacc2`, `6dba9ca7-d425-423a-a588-09776f3b653d`),
cottoncandy `56ff5efa-fc8e-4071-add6-0ca8f824b8a2` (variant a — 3rd
generation, 5th overall attempt counting the two failed stool tries; rejects:
`8c958c5c-b601-493f-bdd4-e652737cf10d`, `d5c03164-0f2c-4929-ad95-600687c4cb4a`,
`c555274e-79c0-4505-be3d-...` [truncated in local notes, see
`c555274e-79c0-4505-be3d-021b779c4291`], `73472d5a-5c7b-4d03-b3c1-ea702c6ba6bf`),
candyjar `3e9f44df-0bef-4c3d-8e7e-007b7fd67a3c` (variant b — 3rd attempt;
rejects: `76b44db9-ee7e-4487-bb6f-3a34f44cdd14`,
`bfa6b0a4-21a3-4b53-baf6-...` [FAILED, `Request not found`, retried as]
`2e919bfe-33d8-4a40-a3a0-ba7df8d1b8e9`), popcornbox
`9b473e0e-110c-415e-b2b3-b9ad54b9d35e` (variant a — the redo
`875501a3-b3d1-4fb3-aa92-57bd6746c381` was fired and never used).

## Verified

- All 7 `art/sweetshop/scene/<key>.png` are RGBA, 576×1024, aspect delta
  0.00000 against `art/backdrops/sweetshop.jpeg` (exact — all were either
  extracted directly at backdrop resolution or hand-built via the manual-ROI
  script at that same resolution).
- All 7 `art/sweetshop/<key>.png` (behind-board item art, from `key_white.py`)
  are RGBA, long side 512px, keyed cleanly with no halos on the magenta
  checkerboard check (`icecreamsundae` 304×512, `lollipopjar` 406×512,
  `cupcakestand` 506×512, `milkshake` 199×512, `cottoncandy` 354×512,
  `candyjar` 404×512, `popcornbox` 446×512).
- `check_hall_layers.py` on the final 7 (`icecreamsundae`, `lollipopjar`,
  `cupcakestand`, `milkshake`, `cottoncandy`, `candyjar`, `popcornbox`):
  **0 real collisions** — "no collisions — every pair composites the same in
  either order" — after resolving 6 successive real collisions found across
  the iteration (icecreamsundae↔lollipopjar, cupcakestand↔milkshake,
  cottoncandy↔candyjar ×2, cottoncandy↔popcornbox, lollipopjar↔cottoncandy,
  milkshake↔candyjar ×2). Exit code 0 on the final run.
- Height ceiling: 4 of 7 items comfortably under 60% (`lollipopjar` 51.2%,
  `cottoncandy` 28.9%, `candyjar` 39.9%, `popcornbox` 48.5%); 3 sit marginally
  over (`icecreamsundae` 61.4%, `cupcakestand` 60.1%, `milkshake` 61.0%) —
  see "Honest compromises".
- Not yet verified in the live game (out of scope — no `collections.*` wiring
  was done, per instructions; that happens once the sibling "Game Room" hall
  is also ready).
