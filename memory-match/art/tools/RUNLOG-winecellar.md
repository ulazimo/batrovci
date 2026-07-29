# Wine Cellar run log

**DONE 2026-07-29.** Backdrop + 7 items generated, keyed, painted into the scene as
tableau layers via the halls-9-11 recipe (`SCENE-LAYERS-PLAN.md`). Not wired into
`collections.json`/`.js` — that is a separate step for after all 5 sibling
hall-agents finish (per task scope). Level numbers are therefore unassigned.

## What shipped

| item | surface | pick | extract thresh | redo? |
|---|---|---|---|---|
| cheesewheel | tasting table, left end | a | 45 | no |
| corkscrew | tasting table, right end | b | 45 | no |
| winebottles | oak barrel top, left end | a (3rd firing) | 26 | **2 redos** — see below |
| decanter | oak barrel top, right end | b (3rd firing) | 26 (then hand-pruned) | **2 redos** — see below |
| grapebasket | flagstone floor, left-of-centre | b (2nd firing) | 45 | **1 redo** — moved off collision with lantern |
| cellarlantern | flagstone floor, centre | a (2nd firing) | 26 then 45 | **1 redo** — first firing painted over part of the barrel |
| oldledger | stone alcove ledge | a | 26 | no (thresh bump only, no re-firing) |

Measured surfaces (grid_overlay.py, % of picture height from bottom):

| surface | x-range | height |
|---|:--:|:--:|
| oak barrel, flat top | 51–83 | ~50 |
| tasting table, top | 3–36 | ~49 |
| stone alcove ledge | 55–85 | ~58 (only ~2 of headroom under the 60 ceiling — the tightest surface shipped in any hall so far) |
| flagstone floor, foreground | full width | 0–20 |

## Backdrop

Only one workable alcove ledge came back (not two), so the brief's fallback
applied: `grapebasket` was moved to the floor instead of doubling up on the ledge,
and `oldledger` took the ledge alone. The ledge's own surface sits at ~58% of
picture height — 2% of headroom under the 60% ceiling, tighter than any surface in
halls 1–11 (previous worst was the music room / workshop at 52%, ~8 of headroom).

## Threshold notes

`--thresh` auto (14) was wrong for every item here — same "dim cellar + lantern
glow" story as the library and sewing room in `RUNLOG-HALLS-9-11.md`. 26 was the
first useful value; several items still carried a spurious **vertical sliver of
the archway pillar edge** as a separate, `--link-px`-connected blob even at 26
(the pillar's drift sits close enough to the barrel/ledge/floor objects to link
up). Raising to **45** dropped the pillar cleanly for most items. `oldledger` and
`decanter` needed a threshold *below* 45 to keep their own full silhouette (45 lost
part of the object itself — a pale glass decanter against a pale stone backdrop is
a low-contrast pair, similar to the "pale object vs pale wall" failure mode noted
for the artstudio's easel); `decanter` was extracted at 26 and then hand-pruned by
keeping only the larger of its two connected alpha components (see script inline
in this session — not checked in as a tool, just a 6-line connected-components
filter over the existing `extract_layer.py` output).

## Real collisions found — this hall needed more rework than 9–11

`check_hall_layers.py` flagged three pairs on the first pass, all genuine (not
just shadow-overlap the way the kitchen's jam-jars/cat pair was tolerated):

1. **cheesewheel ↔ corkscrew** (share 72.1%, disagreement 63.0) — both on the same
   small tasting table. Fixed by the thresh 45 pass alone (no re-firing): tighter
   masks dropped the shared low-contrast tabletop shading and left only the two
   opaque objects, which don't actually overlap. Down to 1.6% share (a legitimate
   shared-shadow touch, not a defect).
2. **cellarlantern ↔ grapebasket** (share 64.4%, disagreement 62.4) — both placed
   on the same foreground floor patch; the model centred each of them independently
   rather than respecting the left/right split in the prompt. Fixed by re-firing
   both with a **hard, mutually exclusive percent-of-width boundary named in both
   prompts** ("must stay entirely within X–Y%, leave everything past Z% completely
   bare, reserved for a different object") instead of a soft "positioned to the
   left/right" instruction — the soft version was tried first (this hall's first
   redo round) and still produced a spatial overlap.
3. **decanter ↔ winebottles** (share up to 91.5% before fixes) — both on the same
   small round barrel top. This is the one collision this hall did **not** fully
   resolve:
   - The model reliably **centres a single object on a round surface** regardless
     of "push to the left/right" phrasing. Two rounds of increasingly explicit
     prompts (percent windows, then a clock-face metaphor: "9-to-11-o'clock" /
     "1-to-3-o'clock") were needed before the two objects actually landed on
     opposite sides.
   - Even after that, the two objects sit close enough on the small lid that their
     masks still share ~43% (disagreement 47.9) — `check_hall_layers.py` still
     flags it as a COLLISION.
   - **Checked what it actually looks like stacked both ways** (not just the
     metric): composited **winebottles first, decanter second** reads cleanly —
     the two objects sit side by side with a natural gap, decanter's stopper just
     grazing the crate's corner. Composited the other way round (**decanter
     first, winebottles second**) produces a visible torn-looking seam where the
     crate's front-right corner cuts across the decanter's base.
   - **Compromise, called out per the task's honesty requirement**: whoever wires
     this hall into `collections.json` should give **winebottles the earlier
     slot/level and decanter the later one**, so decanter composites last. This
     hall is therefore **not** fully order-independent the way halls 1–11 are — a
     narrow, deliberate exception, not an oversight.

## Ceiling check — three items exceed the nominal 60% line

Measured object-top height (connected-component top, not bbox-including-drift):

| layer | painted top % | note |
|---|:--:|---|
| cellarlantern | 39.6 | fine |
| cheesewheel | 57.7 | fine |
| corkscrew | 54.0 | fine |
| grapebasket | 43.2 | fine |
| **decanter** | **63.9** | over 60, ~2% over the ~61.8% iPad-visible line — the very top of the stopper |
| **winebottles** | **64.3** | over 60, ~2.5% over iPad-visible — the tallest bottle's neck/cork |
| **oldledger** | **66.4** | over 60, ~4.6% over iPad-visible — the quill's feather tip |

All three overshoots are because their surfaces sit unusually high (barrel top
~50%, ledge ~58% — the ledge is the tightest surface shipped in any hall) and each
object still needs real height to read. Re-firing risked reopening the collisions
just fixed, so — matching the precedent in `RUNLOG-HALLS-9-11.md` ("do not re-fire
these three expecting a win; the room's furniture is the constraint") — these were
left as is rather than burning more redos. On an iPad crop, only the very tip of
each object (cork, bottle-neck, quill-feather) is at risk; the object's identity
(book, crate, decanter) survives.

## Phone-safe x-band (10.4–89.6%)

| layer | object x | outside band |
|---|---|---|
| cheesewheel | 10.8–32.5 | ~4% left (table hugs the left wall, same story as sewingroom's stool) |
| corkscrew | 12.5–30.4 | ~2.5% left |
| decanter | 72.2–89.4 | ~4.4% right |
| winebottles | 50.0–87.2 | ~2.2% right |
| grapebasket | 0.2–31.1 | ~14.8% left (a thin vine/leaf tip only — the basket's body sits at x≈5–30) |
| cellarlantern | 37.5–65.8 | none |
| oldledger | 61.5–83.2 | none |

All surface-bound (the table and floor patches themselves hug the left edge, same
as prior halls), not prompt-bound.

## Reusable Layer file_ids

backdrop `ad9e42e7-57e4-4511-b1d2-c317cea42a17`

items (512px white-plate PNGs, uploaded once, reused across all firings):
winebottles `4eb2df48-96e4-4ba7-97a1-7426c22ce903`, decanter
`1a832eba-4009-4653-9c0a-ce4bafe80d3b`, cheesewheel
`be39fb97-1bba-4655-a931-5afbb9e49e64`, corkscrew
`863b2b40-a03c-43eb-98c6-ace94213ccd0`, grapebasket
`5f8d1425-fd10-4bb5-801b-8abfc0b316fd`, cellarlantern
`97f7a123-1149-4c7b-b6b3-c95d3b409647`, oldledger
`4e51201e-8778-43f1-af92-1003e68ed1e2`

## Gotcha repeated from prior runs

`layer_upload.sh <url> ...` must be called with the signed URL **single-quoted**.
Double-quoting it in zsh/bash lets the shell try to expand `$X-Goog-...` as
variables, silently mangling the URL and producing a confusing "no such file"
error that looks like a path problem but isn't.
