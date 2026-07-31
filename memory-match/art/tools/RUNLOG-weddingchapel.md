# Wedding Chapel run log

**DONE 2026-07-31.** 9-item hall (hall 19 by data, "17 halls" by count) closing
the levels-92-100 gap at the tail of the 100-level `cleaningxl` journey, after
Writer's Study..Sweet Shop were renumbered down by 3 to close the middle
52-54 gap earlier the same day. Same pipeline as Game Room / Sweet Shop
(RUNLOG-gameroom.md / RUNLOG-sweetshop.md): one backdrop generated, 9
white-plate items generated separately, 9 scene-layer edits paint each into
the untouched backdrop, `extract_layer.py` diffs each edit against the base
to produce the full-canvas layer + tight behind-board crop,
`check_hall_layers.py` verifies order-independence, `add_halls_19.py` wires
`collections.json`/`.js`.

Layer workspace `zynga` `6d9da2da-be2f-4189-80f9-54148e55a3ef`, session
`da9ab1ee-a395-4354-8058-b019384f0f30`. **23 forge runs, ~180 CU**: 1 backdrop
+ 9 white-plate items (batch 2) + 9 first-pass scene edits (batch 2) + 4 redo
edits (batch 2) to fix two placement collisions — no generation failures/
timeouts this run.

## Concept

Theme: love/wedding. A small intimate wedding chapel — whitewashed lattice
arches, a round stained-glass rose window, a petal-strewn aisle, blush-pink
and cream palette. Backdrop generated first try, no redo needed — it came
back with more usable furniture (a round altar table, a small stool, a
padded window-seat bench, a wall niche, two pew benches, and an aisle floor)
than the 9 surfaces briefed, all comfortably under the 60%-height ceiling.

## Items → surfaces → levels (final, after fixes below)

| level | item | key | surface actually used |
|---|---|---|---|
| 92 | Wedding Rings | `weddingrings` | its own small pink ring box, on the aisle floor at centre (the model did not use the "front-left cushion" language literally — see Honest compromises) |
| 93 | Bridal Bouquet | `bridalbouquet` | padded window-seat bench under the rose window |
| 94 | Veil & Tiara | `veiltiara` | bare step floor between the altar table and the stool |
| 95 | Unity Candle | `unitycandle` | round pedestal altar table |
| 96 | Guest Book | `guestbook` | top step/floor beside the small right-side pew (see redo history) |
| 97 | Champagne Flutes | `champagneflutes` | wooden bench nearest the camera, front-left corner |
| 98 | Wedding Cake | `weddingcake` | small square wooden stool on the step |
| 99 | Petal Confetti Basket | `confettibasket` | aisle floor beside the small right-side pew (moved here from centre — see redo history) |
| 100 | Wedding Bells | `weddingbells` | small arched wall niche, right side |

A pre-existing mauve velvet floor cushion in the backdrop (visible in every
screenshot, front-left corner) was never actually used by any item — it was
mistaken during planning for the ring cushion's resting surface, but the
`weddingrings` white-plate item already came with its own small pink ring
box as part of the generated object, and the edit placed that combo at
centre floor instead. Cosmetic only; not a defect, just an unclaimed prop in
the room.

## White-plate item picks (batch_size 2, picked variant)

All 9 came back clean on the first pass — `pick_variant.py` reported every
variant in the healthy 0.5-0.83 border-connected-background band with no
edge-touch, so selection was by eye only.

| key | picked | reasoning |
|---|:--:|---|
| `weddingrings` | a | more polished gold gradient/shading |
| `bridalbouquet` | a | pure-white (255) border, tighter round silhouette |
| `veiltiara` | b | pastel gemstone tiara reads more premium/on-palette |
| `unitycandle` | b | candle has a visible base flare, grounds better once placed |
| `guestbook` | b | gold pen nib visible, clearer ribbon-through-spine read |
| `champagneflutes` | b | more symmetric, ribbon bridges both stems cleanly |
| `weddingcake` | b | front-on symmetric, roses read as blush-pink not pink+yellow |
| `confettibasket` | a | cleaner, petals contained rather than spilling over rim |
| `weddingbells` | a | gold tone matches rings/candle better than b's mustard-orange |

## Scene edits

Object line + CONFINE + INTEGRATE + PRESERVE (verbatim clauses from
`../SCENE-LAYERS-PLAN.md`) for each item, `batch_size: 2`, 1152x2048, `init`
= the shipped 576x1024 backdrop, `editing_reference` = the picked keyed
item PNG. 7 of 9 items landed correctly on the first pass. Two needed
rework:

- **`guestbook` was aimed at "the wooden pew bench at the right side" and
  landed on the front-left bench instead**, in both first-pass variants —
  that bench is the most visually prominent one, and the model preferred it
  over the smaller, more distant right-side pew regardless of the "right
  side" wording. Two redos: the first (explicitly naming the front-left
  bench and window-seat bench as off-limits) landed the book on the SAME
  wrong bench again. The second (bracketing the right pew's position with
  percentages — "75-95% across, 70-85% down" — and describing it by its
  visible curved armrest and its position "below the arched wall niche")
  moved the book off that bench entirely onto the adjacent step floor
  instead — not literally on the small pew, but clearly its own separate,
  correctly-shadowed spot, so accepted.
- **`confettibasket` needed two redos for a genuine placement collision, not
  a wrong-surface error.** It was briefed for "the aisle floor at front
  centre," which put it a few hundred pixels from where `weddingrings`
  independently landed (`weddingrings` was briefed for "front left" but the
  model centred it instead — see above), producing a real ~58-79% mask
  overlap with 57-70 disagreement in `check_hall_layers.py` (a true
  COLLISION, not shared-background noise). Redo 1 (move right of centre)
  wasn't enough separation once the rings' actual centre position was
  understood from the generated image. Redo 2 (place it beside the small
  right-side pew instead, explicitly naming the rings' box at centre as
  off-limits) fully separated the two — final overlap 2.5% (noise).
  Redo 2's variant B also hallucinated a second, unrequested small pink box
  near the altar table — an artifact of describing the (invisible-to-the-
  edit) rings' box in the prompt for context. Variant A didn't have this
  defect and was used instead. Lesson for the next hall: don't describe a
  neighbouring item's appearance in a redo prompt if it can be avoided —
  name its *location* only.

## Extraction thresholds

The rose window and its light beam across the aisle is this backdrop's
Writer's Study/Game Room-style drift hazard: **6 of 9 items needed
`--thresh` above the 14 default**, all in the 20-30 range, or
`extract_layer.py` picked the window's own re-decode drift as the primary
blob instead of the actual object (confirmed via the audit sheet — panel 5
showed the empty backdrop, item missing entirely, not just an oversized
mask):

| item | thresh | why |
|---|:--:|---|
| `weddingrings` | 14 (auto) | not window-adjacent, no issue |
| `champagneflutes` | 14 (auto) | not window-adjacent, no issue |
| `bridalbouquet` | **26** | sits directly under the window; auto(14)'s mask swallowed the whole lower window pane, causing a false 53% overlap with `unitycandle` on the mask level (not a real collision — see below) |
| `veiltiara` | **28** | auto(14)/16 mask followed the floor light-beam all the way down the aisle, producing false ~87-90% overlaps with `confettibasket`/`weddingrings`; at 28 the mask tightens to just the veil+tiara, at the cost of losing the lowest few centimetres of trailing veil fabric (too low-contrast against the pale floor to survive the higher threshold) |
| `unitycandle` | **20** | auto(14) picked pure window drift, object completely absent from the composited result |
| `guestbook` | **20** | same failure as unitycandle, different corner of the window's glow |
| `weddingcake` | **20** | same failure |
| `weddingbells` | **20** | same failure (this item is IN the wall niche closest to the window) |
| `confettibasket` | **20** | not the window this time — the same aisle light-beam that affected veiltiara |

Two items — `bridalbouquet` and `veiltiara` — had oversized masks that
looked fine in their own single-item audit (`panel 5` showed the object
composited correctly) but were only caught as **false positive collisions**
by `check_hall_layers.py`'s pairwise order-independence test, exactly the
failure mode the tool exists for (see `memory-match-scene-layers` memory /
`SCENE-LAYERS-PLAN.md`). Raising their thresholds shrank the masks without
changing what's visible in the final composite.

## Collisions

**Zero after fixes.** `check_hall_layers.py` initially flagged real
collisions between `champagneflutes`/`confettibasket` (32.6% share, 58.9
disagreement) and `confettibasket`/`weddingrings` (73.6-79.1% share, 57-70
disagreement) plus a threshold-driven false positive between
`bridalbouquet`/`unitycandle` (mask overlap only, 0 disagreement once
re-checked — not a real defect). Final check: **9/9 items, 0 collisions,
"every pair composites the same in either order."**

## Honest compromises

- **`weddingrings`, `champagneflutes`, `veiltiara` and `guestbook` didn't
  land on the exact named surface from the brief** — the model substituted
  a plausible nearby spot (centre floor instead of front-left cushion; the
  actual frontmost bench instead of "front left" ambiguity; a step-floor gap
  instead of literally on the small right pew). None of these read as
  broken in the final montage — every item is grounded with a real contact
  shadow and nothing overlaps — but don't trust the brief's stated surface
  without checking the shipped result if you need to reason about exact
  placement later.
- **`veiltiara` ships with its lowest few centimetres of trailing veil
  fabric cropped**, a direct trade against the higher extraction threshold
  needed to sever it from the floor light-beam. Same class of compromise as
  the Game Room `yoyo`'s missing string.
- **All 9 tight behind-board crops are small** (87-184px long side, versus
  Game Room/Sweet Shop's ~420-512px) because these are deliberately petite
  worn/held props (rings, bells, a tiara) rather than furniture-scale
  objects — `extract_layer.py`'s "too soft for the board reveal" warning
  fired on every one. This is a consequence of the theme's object choices,
  not an extraction defect; accepted rather than redoing the whole set with
  larger, less-plausible prop scale.

## Reusable Layer file_ids — do NOT re-upload

backdrop (uploaded 576x1024 jpeg, used as `init` for every edit):
`a0fb8174-94c4-4980-be64-d95d7f3a269c`
(original 1152x2048 generation output: file_id `0a25c68a-6f63-46f4-b7a0-d3f948943fd6`)

items (512px keyed PNGs, uploaded as `editing_reference`): weddingrings
`53ce280a-8ea1-4e65-bc75-d5e76b17b76a`, bridalbouquet
`fcf0f809-fb41-4e78-bcb2-d43103ab4503`, veiltiara
`c9bc7db1-c4da-4f91-89de-cd362db44029`, unitycandle
`98fb4f9b-2210-4733-86ef-34ad22db7594`, guestbook
`fe65f418-ee3a-4178-864a-feefe26de7dc`, champagneflutes
`c994f47e-9ae6-412b-8382-1171928a3e65`, weddingcake
`407cdffc-40b3-4ba7-aee5-df33c462acec`, confettibasket
`cdbd605a-7ad2-49c7-a243-23032982356a`, weddingbells
`9c99ecb2-0288-4f68-86c1-a41827345d53`

## Verified

- All 9 `art/weddingchapel/scene/<key>.png` are RGBA, 576x1024, aspect delta
  0.00000 against the backdrop.
- All 9 `art/weddingchapel/<key>.png` (behind-board tight item art) are RGBA.
- `check_hall_layers.py --base ../backdrops/weddingchapel.jpeg` on the
  shipped 9: **0 collisions** — every pair composites identically in either
  unlock order.
- Visual montage (`check_hall_layers.py --montage`) of all 9 stacked
  together inspected — reads as one coherent, fully populated chapel, no
  object overlapping another, no floating items.
- `add_halls_19.py --dry-run` then the real run: preflight passed (no
  duplicate levelIds, no aspect mismatch, no missing files), wrote
  `collections.json`/`.js`. Post-wire audit (Node script, not the level
  editor UI): 17 halls, 100 hall slots, 0 duplicate levelIds, 0 levels
  without a hall slot, 0 hall slots without boardArt, `.js`/`.json` twins
  byte-identical. The `cleaningxl` journey's 100 levels now have **zero
  gaps** in hall/boardArt coverage for the first time.
- **Not yet verified in the live game / Hall Walkthrough tab** — no browser
  session was available this run. A later check should confirm the iPad
  crop (~62% visible) doesn't clip any item (predicted clean: worst
  measured top in this hall is well under that line based on the montage)
  and that the Hall Walkthrough tab lists Wedding Chapel last, after Sweet
  Shop, matching its 92-100 level range.
