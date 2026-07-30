# Game Room run log

**DONE 2026-07-30.** Backdrop generated, 8 white-plate items generated/keyed, 8
scene-layer edits fired (0 generation redos needed — every first-pass edit
placement was accepted), all 8 layers extracted and pass `check_hall_layers.py`
with **zero real collisions** (28/28 pairs order-independent). Not wired into
`collections.json`/`collections.js` — that is a separate step, done once the
sibling "Sweet Shop" hall's art also lands. Nothing under `art/gameroom/`,
`art/backdrops/gameroom.jpeg`, or this file touches the data layer.

Layer workspace `zynga` `6d9da2da-be2f-4189-80f9-54148e55a3ef`, session
`75aea347-b9e1-4bd3-9b51-3a5460b002cb`. **27 forge runs, ~204 CU**: 1 backdrop +
1 backdrop redo-that-wasn't-needed (none — backdrop was one-shot) + 8 first-pass
items + 3 item timeouts re-fired (chessset, yoyo, rubikscube — `Workflow
Activity Error` / `Local Activity timed out`, all cost 0 CU) + 8 scene edits
(batch_size 2 each, both variants always usable) + 6 extraction-threshold
retries (no re-generation, just re-running `extract_layer.py --thresh`).

## What shipped

| item | extract thresh | redo? | why |
|---|:--:|---|---|
| `chessset` | 26 | thresh only | auto(14) tight crop 186x112 included window-mullion drift bleeding off the table edge; 26 tightens to the chess set itself (181x72), margin 2.2x→7.4x |
| `dicetower` | 26 | thresh only | same drift pattern near the ottoman; 26 gives a clean tower silhouette (118x123), margin jumps to 11.6x |
| `cardsdeck` | 26 | thresh only | auto's low margin (1.9x) meant a nearby drift blob was competing; 26 isolates the fanned cards on the window seat cleanly (margin 8.2x) |
| `jigsawbox` | 20 | thresh only | auto(14) merged the box with the bookshelf's own re-lit back panel (tight 164x267, way oversized); 20 isolates just the box+lid+pieces (127x76) |
| `dominoes` | 26 | thresh only | **the interesting one** — auto(14) mask sprawled across a third of the rug (tight 241x361) while still, confusingly, compositing the domino tin correctly (the tin was inside a single connected blob that also swallowed unrelated rug texture). 26 drops the rug entirely and leaves just the tin (129x82, margin 16.8x) |
| `marbleset` | 30 | thresh only | classic multi-tier-prop redraw (see below) — adding the jar caused the whole two-tier step-stool to re-render at every threshold up to 50. Accepted at 30 (best margin, 25.8x) since only one item touches this stool and the redrawn stool is visually indistinguishable from the original (checked side-by-side, see below) |
| `yoyo` | 20, `--link-px 3` | thresh + link-px | see "yoyo's window-adjacency fight" below — the ball has strong contrast (bright in the diff heatmap) but sits right next to the bay window's mullions, whose own re-decode drift has comparable energy and was bridging into the ball's mask via the default 28px link radius. Tightening `--link-px` to 3 with thresh 20 isolates just the ball (55x56); the trailing string/coil (which had dangled off the sill onto the wall below in the edit) drops out along with it — an acceptable trade, since it also means the shipped layer keeps the object confined to the sill rather than spilling onto the wall |
| `rubikscube` | 26 | thresh only | auto(14) had a healthy margin (13.8x) but an oversized tight crop (255x346) from a soft contact-shadow gradient on the rug; 26 tightens to 186x178 without losing the shadow, margin improves to 27.2x |

**Zero scene-edit regenerations were needed** — every first-pass `a`/`b` variant
for every item was usable, and all fights in this hall were resolved at the
extraction stage (`--thresh`, `--link-px`), not by re-prompting Layer. This is
the opposite experience from Writer's Study/Curiosity Shop, where placement
itself had to be re-fired repeatedly; here the room's bay window made
*extraction* the hard part instead.

## This backdrop's drift hazard: the bay window, again

Every one of the 8 items needed a threshold above the 14 default — a 100% hit
rate, matching (and slightly exceeding) Writer's Study's "every single item
needed thresh>14" result in `RUNLOG-study.md`. The cause is the same: a bright
window (here, a two-pane bay window plus a second narrow window, both letting
in strong warm light) creates a continuous re-decode gradient across nearly a
third of the frame, and Gemini 3 Pro Image Edit's whole-frame re-encode makes
that gradient register as "changed" at `extract_layer.py`'s default noise
floor. `--thresh 26` was the median fix here too, exactly as in Writer's Study.

Two specific failure shapes worth naming for the next hall with a bright
window:

- **A connected blob can swallow real object + drift + be `keep%`-plausible
  and still composite correctly by accident** (`dominoes` at auto thresh). The
  printed numbers looked bad (tight 241x361, oversized) but panel 5 of the
  audit still showed the domino tin in the right place, because the *actual*
  tin pixels were part of the oversized blob along with a lot of harmless rug
  texture. Do not trust "panel 5 looks right" alone when `keep%`/tight-size
  look implausible for the object's real-world scale — check the panel 4 mask
  shape directly and compare it to what the object should look like.
- **A small object beside a window can lose a `margin` tie-break to the
  window's own mullion drift** (`yoyo`). The object itself was clearly the
  brightest single blob in the diff heatmap (confirmed by cropping panel 3
  directly), but morphological closing/dilation (`CLOSE_PX`, default
  `--link-px 28`) bridged it into the window frame's vertical drift lines,
  which have comparable total energy once summed along their length. Lowering
  `--link-px` to a few pixels (rather than raising `--thresh`, which just
  deleted the object faster than the drift) separated them.

## The multi-tier-prop redraw, again — marbleset/step-stool

Confirms the `RUNLOG-curiosityshop.md` mantelclock lesson: adding one object to
a two-tier step-stool causes the model to re-render the **whole stool**, not
just the tread the object sits on, regardless of threshold (tested 14 through
50 — the stool never fully detaches from the jar). Unlike the curiosityshop
case, this was **not** a collision, because only `marbleset` touches this stool
— no second item was asked to share it (the brief already avoided that). The
practical question was only "is the redrawn stool visually different enough
from the original to leave a seam when this layer unlocks over the backdrop's
own stool," and side-by-side crops of panel 1 (base) vs panel 5 (recomposited)
at 5x zoom show the stool at identical shape, colour and shading — the same
"spill sits at 5-7.6 on a perfectly good edit" phenomenon documented in
`SCENE-LAYERS-PLAN.md`, not a visible defect. Shipped as-is at thresh 30 (best
margin among 14-50: 25.8x).

## Collisions

**None.** `check_hall_layers.py` flagged two pairs above the 2% "worth a look"
overlap threshold — `chessset`↔`dicetower` at 10.4% share and `dicetower`↔
`marbleset` at 7.6% share (all three sit close together around the
table/ottoman/stool cluster) — but the order-independence pass (the actual
test) found **0 disagreement** on every pair: composited in either order, the
shared pixels are identical, meaning the overlap is harmless shared backdrop
(untouched table/rug pixels both masks happened to include), the same "jam
jars and cat" case `SCENE-LAYERS-PLAN.md` documents as not a defect. No item
needed relocation.

## Honest compromises

- **Four items sit outside the phone-safe x 15–85% band**, all surface-bound
  exactly like every prior hall's precedent (the furniture's own position on
  the backdrop is the constraint, not the prompt):
  - `cardsdeck` (79.5–99.7%): the bay window seat itself sits against the
    frame's right edge in this backdrop.
  - `rubikscube` (0.2–32.3%): deliberately anchored to the gaming table's near
    leg per the brief, which sits left-of-centre; the cube plus its cast
    shadow on the rug extends further left than the leg alone.
  - `dominoes` (7.6–29.9%): the round brass side table sits at the frame's far
    left.
  - `jigsawbox` (11.1–33.0%): only marginally outside (9.1% of its alpha), the
    bookshelf's lowest usable compartment is itself left-of-frame.
  Per the halls 9–11 / Writer's Study / Curiosity Shop precedent, these read as
  framing on the iPhone crop rather than damage, and re-firing would not
  change them — the object would just move to wherever else on the same
  edge-bound surface.
- **The bookshelf has only one usable compartment.** Measured on the shipped
  backdrop (`grid_overlay.py` + fine pixel crops, not the brief's assumption):
  the built-in unit's shelf dividers sit at roughly 53/58/61/64/69/75% of
  picture height from the bottom, so only the **lowest** compartment (floor
  53%, own ceiling 58% — the shelf board directly above it) clears the 60%
  ceiling with margin; the next one up has its opening top at 61%, already
  over. This mirrors the Kitchen/Workshop/Curiosity-Shop shelf precedent
  exactly — matches the brief's plan (it only ever asked for one shelf item,
  `jigsawbox`), so no compromise was actually needed here, but it's worth
  recording that the other five-ish compartments in this unit are dead weight
  for any future item in this hall.
- **`yoyo` shipped without its trailing string.** The edit painted a nice
  loosely-coiled string that dangled off the front edge of the sill onto the
  wall below — charming, but it meant the object was no longer confined to a
  single surface (a soft CONFINE violation) and it was also the reason
  extraction kept tying against the window's drift. The threshold/link-px
  combination that cleanly isolates the ball also drops the string. Net
  effect: the shipped layer is a plain yo-yo resting on the sill, no coiled
  string — arguably *more* correct against CONFINE than the source edit was.
- All other 7 items: no compromises. Every one is fully within the 60% top
  ceiling (worst is `cardsdeck` at 57.8%, `jigsawbox` at 56.5%) and reads
  clean in the `ALL STACKED` montage panel.

## Reusable Layer file_ids — do NOT re-upload

backdrop (uploaded 576×1024 jpeg, used as `init` guidance for every edit):
`96070981-ccb9-4fae-a977-3c7c08584baf`
(original 1152×2048 generation output, if regenerating at full res:
`3b9b39fc-7bac-4adb-bdc7-0b92aca426dc`)

items (512px keyed PNGs, uploaded as `editing_reference`): chessset
`9e03e81a-0187-495a-a95f-844d0893b479`, dicetower
`3ac5f0c1-b7ea-4758-a1dd-9e6606dd6a34`, cardsdeck
`d4da4361-8fe0-4fbf-bf3a-94f2eb839580`, jigsawbox
`84f347d1-8b67-4a6b-a862-b09f26b67441`, dominoes
`c6e8ec56-a81e-4257-8f03-b8c430b7e9b5`, marbleset
`fcd06136-3342-4d04-bce1-8f91ed2dcf7a`, yoyo
`c0e93743-8113-43ea-98be-273b1e27b609`, rubikscube
`faed7763-a4a7-4508-bac9-e5b8295e8c99`

## Inference ids (for provenance / redoing a single step)

**Backdrop**: `e1f9fbab-6df1-4721-8e48-5a0555b6bdde` (output file
`3b9b39fc-7bac-4adb-bdc7-0b92aca426dc`)

**White-plate items (picked variant in bold)**: chessset — first attempt
`23038336-420f-40dc-992b-d55b7ad43ab3` (FAILED, timeout, $0), redo
`eb2394e0-06c6-403f-86be-9573cf144ad3` (**a** = `be7f0635-2970-4f4a-93d4-abff85ca1336`);
dicetower `32cb5f39-dc31-491d-83eb-27e517c1cdf0` (**a** = `752e5992-6211-4cac-a939-c95b5d57bf44`);
cardsdeck `94806b44-6e05-4777-a268-db71c735f97c` (**b** = `2fd1c9d8-9aff-4933-9842-ecacc279f6a8`);
jigsawbox `8d818ed1-e2c8-486d-9fdf-e0c91dfea286` (**a** = `e6e3ccd1-1d5c-4047-adc4-a432c8df3a50`);
dominoes `e0c04a29-08f7-4d72-b588-b24e990836ee` (**a** = `a66942c5-4b9c-4fc2-851e-4fb32ce7c758`);
marbleset `57adbd99-d40a-462a-9b42-3f6865ba5e9e` (**a** = `4a49bbf4-8a17-4495-8ebc-5b35ccd7128f`);
yoyo — first attempt `50a52e53-8ed5-4068-a028-439e77140cac` (FAILED, timeout, $0),
redo `eed419a1-dd78-4f4a-916f-f0726cb0754c` (**a** = `1d3c27e8-3ff3-43cc-8f77-0e683a8b1725`);
rubikscube — first attempt `00ccef79-7ba0-4428-b897-c41547ca7e21` (FAILED,
`Request not found`, $0), redo `266f3f02-a295-41a2-bfdf-42231edbd436`
(**b** = `9dd872d5-fa1d-4204-b2e8-c1579d5a9903`)

**Scene edits (all first-pass, picked variant in bold — no regenerations)**:
chessset `ab3d7a03-9de3-47b9-a2bf-bb1e000b2f03` (**a** = `f5996954-e7e2-453f-9c40-94b176cbbcb2`);
dicetower `47afe032-909e-44cd-a596-6baa8b6ee4d0` (**b** = `56beb830-c2ec-4665-b5dd-8d6e06850425`);
cardsdeck `3e2860cf-8c13-4474-94fb-e5f322920e95` (**b** = `d60da257-bc8c-4afb-9710-11993b37d003`);
jigsawbox `7a01f392-7f57-4a11-9553-dc97b2497a50` (**b** = `86dc0c84-9109-4759-abc7-2ef110d4561b`);
dominoes `f455f295-a3d2-4ea4-b38c-84711fd91aa5` (**a** = `2f1307b0-0c40-444b-bbc1-d0a7ffab471e`);
marbleset `5e02eb20-9bc9-4f36-b9aa-50ddd051c7c7` (**a** = `7d6c5b1f-b3f7-4dea-84dd-4e42588d2171`);
yoyo `e1a9a8b2-2524-4d1f-b4e4-00cd9d5ef703` (**a** = `7a30c040-1df4-4029-aec2-ce59bfc61537`);
rubikscube `36b45934-4615-4565-9437-f9aad161949b` (**a** = `e3594c15-85ad-477a-99ec-55a6df38ac86`)

## Verified

- All 8 `art/gameroom/scene/<key>.png` are RGBA, 576×1024, aspect delta 0.00000
  against the backdrop.
- All 8 `art/gameroom/<key>.png` (behind-board tight item art, 512px long
  side) are RGBA.
- `check_hall_layers.py --base ../backdrops/gameroom.jpeg` on the shipped 8:
  **0 real collisions** — order-independence check passes on all 28 pairs
  (two pairs share >2% of the smaller mask but 0.0 disagreement, i.e. harmless
  shared backdrop, not a defect).
- Visual montage (`check_hall_layers.py --montage`) of all 8 stacked together
  inspected — reads as one coherent, populated game room with no object
  overlapping another, no floating items, no visible seams.
- Not yet verified in the live game — out of scope, no `collections.*` wiring
  was done per instructions. A later wiring step should place this hall's 8
  slots per the x-ranges/heights recorded in "Honest compromises" above and
  confirm the iPad crop (~62% visible) does not clip any item, which the
  numbers above already predict it won't (worst top is 57.8%).
