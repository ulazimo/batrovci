# Writer's Study run log

**DONE 2026-07-29.** Backdrop generated, 7 white-plate items generated/keyed, 7
scene-layer edits fired (with 5 redos — see below), all 7 layers pass
`check_hall_layers.py` with zero collisions. This hall's level range, wiring into
`collections.json`/`.js`, and `add_halls_*.py` run are **out of scope** for this
task — a separate step wires all 5 sibling halls (Nursery, Wine Cellar, Sunroom,
Curiosity Shop, Writer's Study) together afterward.

Session workspace `zynga` `6d9da2da-be2f-4189-80f9-54148e55a3ef`, Layer session id
`94930714-c275-45de-805d-56a8d3fa82d7`. **~30 forge runs, ~232 CU** (8 first-pass +
0 backdrop redos + 5 item redos + 5 scene-edit redos... see full accounting below).

## What shipped

| item | pick | extract thresh | redo? why |
|---|---|---|---|
| `typewriter` | redo2-a (tighter left anchor) | 26 | **2 redos** — first pass's layer merged with the window/curtain drift into one blob (a continuous godray gradient bridges the window to the desk); thresh 14 kept the merge, thresh 26 disconnects it. Also had to pull the object further left (10–28%) after the first redo's version collided with `letterbundle`. |
| `letterbundle` | redo(final)-a | 26 | **4 redos**, the hardest item in the hall. The model has a strong positional bias toward one specific desk spot (~x28–50%) regardless of "far right end" / percent-bracket instructions — 3 separate attempts to push it right on the desk all landed back in/near the typewriter's footprint (up to 100% mask overlap once typewriter also tightened left). Abandoned the desk for this item; moved it to the rug's extreme lower-left corner instead (still "a bare surface" per the brief's floor patch, matching the Toy Workshop precedent of multiple items sharing one broad floor surface at different x positions). First rug attempt collided 55.9% with `magnifyingglass`; final version pulled it into the corner (x3–20% target) and it came out clean. |
| `fountainpen` | a | 26 | 1 redo of the *extraction* only (not the generation) — thresh 14 merged with a thin cord/chain-shaped drift fragment near the shelf, which also touched `candlestick`'s mask (spurious 60% "overlap" that was actually two unrelated merges sharing one artifact). Thresh 26 sheds it cleanly. |
| `deskclock` | a | **40, `--link-px 12`** | Generation was fine on both variants; the *extraction* completely missed the object at every threshold up to 26 — the primary diff blob was the window/curtain, and the actual clock (small, dim cubby) was in the "dropped blob" list. Not until thresh 40 did the clock's higher-contrast edges beat the window's soft gradient. `--link-px 12` cleaned up a disconnected handle fragment. |
| `candlestick` | a (from the original picks, not redone) | 40 | 1 redo of the *extraction* — same shared cord/chain artifact as fountainpen; thresh 40 (needed higher than fountainpen's 26 to fully clear it) gives a clean isolated candlestick. |
| `paperweight` | redo-a | **60** | **1 redo of the generation** — first pass painted it sitting on the desk's wood surface below the sill instead of the raised stone sill ledge itself; redo explicit about "raised stone windowsill ledge... ABOVE and BEHIND the desk" fixed placement. Then needed thresh 60 (much higher than most) to shed a very persistent merge with the window/curtain — at 14/26/40 the mask still ran up to ~80% of picture height into the curtain. |
| `magnifyingglass` | b | 14 (default) | No redo. Clean first try. |

## The window is this backdrop's drift hazard — expect high thresholds nearby

Same phenomenon as the library's "hazy window wall" in `RUNLOG-HALLS-9-11.md`, but
worse here: the arched window's godrays/curtain form a continuous gradient that
directly touches the rolltop desk (typewriter, letterbundle), the windowsill
(paperweight, trivially — it's painted right on the sill), and apparently reaches
all the way to the shelf/cabinet area on the far wall (deskclock, and a thin
cord-shaped fragment that separately contaminated fountainpen and candlestick).
**Every single one of the 7 items needed a threshold above the 14 default**, which
is a higher hit rate than any prior hall. `--thresh 26` was the median fix; two
items (`deskclock`, `paperweight`) needed 40 and 60 respectively. When an
extraction's tight-crop looks implausibly tall/wide relative to the object, or a
`keep%`/`margin` combination looks too healthy for how small the object should be,
composite the layer over a magenta checkerboard and *look* — the printed metrics
alone did not reliably flag either failure mode here (the window-as-primary-blob
case actually reported a healthy 8.1x margin for `paperweight` at thresh 14,
because "healthy margin" only means one blob dominates the others, not that the
blob is the right one).

## `letterbundle`'s placement fight — a new failure mode worth naming

Halls 9–11 documented the "percent-of-width window read as one-sided" failure and
the "surface itself runs off-frame" failure. This hall adds a third: **the model
has an opinionated default spot on a surface and will return to it across
re-fires even when explicitly told not to**, seemingly because that spot (front,
centre-left of the desk, closest to the window light) reads as the most natural
place to put "a small object on a desk." Bracketing the *rejected* zone
("no part may come closer to the left edge than 44%/50%") did not overturn it —
each of 3 attempts landed within a few percent of the same place, and the final
attempt (aimed at 52–65%) landed at nearly the *same coordinates* as the by-then
already-generated `typewriter`, producing a 100% mask-overlap (letterbundle's
entire silhouette sat inside typewriter's). The fix was not a better prompt for
that surface — it was picking a **different surface** entirely. Two lessons:
- If a second or third redo on the same surface keeps landing in roughly the same
  place, stop iterating on wording and move the object elsewhere; the model's
  positional prior can outweigh explicit percent brackets.
- Always pixel-check candidate placements against *already-committed* layers with
  a real alpha-mask AND against any other in-flight candidate, not just against
  the brief's intended zones — bounding-box math undersells how close two organic
  silhouettes actually sit (see the 43% and 100% overlap figures above, both of
  which looked like plausible "different corners of the desk" placements before
  measuring).

## Order-independence — clean on the real run

`check_hall_layers.py` result: **zero collisions**, every pairwise overlap 0.0%
except `typewriter`↔`paperweight` at 0.6% (both sit near the desk/sill boundary;
negligible, well under the ~2% "worth a look" bar). No redo needed once the
`letterbundle` relocation was in.

## The crop, honestly

| layer | object x-range | painted top% | alpha outside phone's 15–85% band |
|---|:--:|:--:|:--:|
| `typewriter` | 11.6–44.3 | 46.5 | 3.4% (marginal, left edge) |
| `letterbundle` | 1.4–24.7 | 14.7 | **63.6%** (left) |
| `fountainpen` | 68.9–87.0 | 32.4 | 6.1% (marginal, right edge) |
| `deskclock` | 82.1–91.1 | 46.1 | **71.2%** (right) |
| `candlestick` | 83.2–99.0 | 29.3 | **95.8%** (right) |
| `paperweight` | 9.9–25.5 | 57.8 | 24.5% (left) |
| `magnifyingglass` | 36.8–64.9 | 15.3 | 0.0% |

All 7 top out well under the 60% ceiling (worst is `paperweight` at 57.8%, and
that's a small object on a high sill, not close to being clipped by an iPad crop).

Three items are heavily edge-hugging, and it is **surface-bound, exactly like
halls 9–11's telescope/quiltstack/palette**: this backdrop's windowsill runs from
x≈4–31% (against the left wall), and both the round side table and the shelf
cubby on the right wall run to x≈80–98% (the far wall's built-in unit continues
past the frame). Any object placed on those three surfaces inherits their
edge-hugging; there is no repositioning-within-the-surface that fixes it, since
the surfaces themselves are the constraint, not the prompt. Per the
halls-9-11 precedent, this reads as framing rather than damage in the actual
phone-frame crop, and re-firing would not change it — the object would just move
to wherever else on the same edge-bound surface, mirroring the defect.

`letterbundle`'s 63.6% figure is different in kind: it is **not** surface-bound
(the rug spans a broad, mostly-central x-range) — it's the result of the
collision-avoidance fix above. Placing it anywhere more central on the rug put it
back in `magnifyingglass`'s territory. The corner placement is a deliberate
trade-off (zero collision, but heavy left-edge clipping) rather than an
unavoidable one; if a future pass wants to improve this, the fix is a different
final resting spot for one of the two rug items (e.g. moving `magnifyingglass`
further right/lower first, then re-fitting `letterbundle` into whatever's left),
not a further redo of `letterbundle` alone.

## Reusable Layer file_ids — do NOT re-upload

backdrop: `213b98ce-48fd-406e-b9fa-45553d97ecf5`

items (512px keyed PNGs, uploaded as `editing_reference`): typewriter
`e55eea77-912d-4649-aef5-28f786eaf4d6`, letterbundle
`23dd6d9d-a3b3-4a36-b9af-cc79bb4fe830`, fountainpen
`73a0e14d-4ff3-4cee-b1e3-e3e4514b4dea`, deskclock
`e1be49fc-1df3-4a2c-910f-8572e199446d`, candlestick
`c79deda7-f8c0-4a50-83de-4026e4b175a3`, paperweight
`3b4903bf-58c7-4888-ad2e-79d7aa909129`, magnifyingglass
`0b0076e3-7a68-40ca-90ba-401491b5b01b`

## Inference ids

**Backdrop**: `23000534-6ddd-4252-97dc-238f43d34a73`

**White-plate items (first/only pass, picks noted)**: typewriter
`f88ba9eb-5a3f-4ae6-b80d-5c37f6cd0a37` (a), letterbundle
`29be0026-b370-4022-a919-26e9cf1f4c45` (a), fountainpen
`4c3b0be7-fd90-4155-83b0-d7ffbf7f4806` (b), deskclock
`f72818c7-945c-4a45-8501-bf54c47c7f79` (a), candlestick
`396b74db-0668-4ba9-bace-3272248944bf` (b), paperweight
`f4cd9d14-1f2f-45df-ad6e-754ebfac2428` (b), magnifyingglass
`8649886d-0678-4438-ac32-774366cb498b` (a)

**Scene edits — first pass**: typewriter `1de3e227-0303-40e7-a150-5a723abe9d03`
(rejected — collided with later letterbundle attempts), letterbundle
`29304389-7cb4-4b7e-94c3-98c972f1098f` (rejected — wrong position, too far left),
fountainpen `883e207d-66ad-4a35-bf47-a1c8f9ec4aa7` (**shipped**, a), deskclock
`a5fb590a-4dc0-4c58-9e1a-418cfd058ee6` (**shipped**, a), candlestick
`5e10fb59-97f0-4f89-86cf-badfe2a6e94e` (**shipped**, a), paperweight
`199a06ed-b96f-41a6-b1df-c2019f1f7eff` (rejected — wrong surface, on desk not
sill), magnifyingglass `c5002ea0-1046-4a6b-917a-861101b06d0c` (**shipped**, b)

**Redos**: paperweight-2 `ffa5fa52-0703-4609-96d5-3b1e651503a2` (**shipped**, a —
fixed onto the sill), letterbundle-2 `1d3b602f-be21-448b-8522-2d048cd27e79`
(rejected — still desk-centred), typewriter-2 `60fa6260-0c37-4cbb-99d9-ad58e316fe3a`
(**shipped**, a — tighter left anchor), letterbundle-3
`588d42d4-fd15-4336-bf3f-a64e494ded26` (rejected — still desk-centred, 100% mask
overlap with typewriter-2), letterbundle-rug
`785004d6-e5c5-4964-8bd8-2acd938920f0` (rejected — moved to rug but collided 55.9%
with magnifyingglass), letterbundle-final
`4b63d865-fbfd-4b62-a808-a4fbc65c6108` (**shipped**, a — corner of rug, clean)

## Verify

Ran `check_hall_layers.py --montage` (see body above) — clean, 0 collisions.
Not yet verified in the live game (out of scope: no level range assigned yet,
`collections.json`/`.js` untouched per instructions — a separate wiring step
handles all 5 new halls together).
