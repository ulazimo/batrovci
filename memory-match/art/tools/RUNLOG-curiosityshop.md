# Curiosity Shop run log

**DONE 2026-07-29.** Backdrop + 7 items generated, keyed, painted in as scene
layers, extracted, and verified collision-free with `check_hall_layers.py`
(21/21 pairs clean, zero real collisions). Not wired into `collections.*` —
that's a separate step after all 5 sibling halls land.

## Deviation from the brief — the back-wall shelf ledge is unusable

The brief called for a "mid-height open shelf ledge" to hold `mantelclock` and
`stampalbum`. `grid_overlay.py` + pixel sampling on the actual generated
backdrop put every open shelf compartment on the back unit at **62–82%** of
picture height — already past the 60% iPad-crop ceiling before an object's own
height is even added, unlike the brief's assumption. This mirrors the
Kitchen/Workshop precedent (their too-high shelves went unused too), so I
dropped the shelf entirely rather than fight the ceiling rule, per
`SCENE-LAYERS-PLAN.md`'s explicit instruction to trust measurement over the
brief.

Final surface assignment (all measured on the shipped 576×1024 backdrop):

| surface | x-range | height | holds |
|---|:--:|:--:|---|
| display counter top, left end | 18–38% | ~50% | `pocketwatch` |
| display counter top, middle | 38–74% | ~48–53% | `antiquekey` (lying flat) |
| display counter top, far left (narrow gap before pocketwatch) | 16–28% | ~53–61% | `mantelclock` (see saga below) |
| display counter top, right end | 67–99% | ~47% | `trinketbox` |
| step-stool, upper tread | 55–97% | ~41% | `compass` |
| bare floorboards, corner near small display cabinet | 0.5–42% | ~19–51%* | `mapscroll` (standing on end) |
| small corner display cabinet's own glass top | 3–30% | ~50–58% | `stampalbum` (no hook existed for `antiquekey`, so it went on the main counter instead per the brief's own fallback clause) |

\* mapscroll's measured bbox is inflated by harmless shared-background overlap
with `stampalbum` (0.6%, order-independent) — not a real collision.

## What shipped

| item | thresh used | redo? | top-height% | x-range |
|---|:--:|---|:--:|---|
| `pocketwatch` | auto (14) | no | 57.8% | 28.8–50.0% |
| `trinketbox` | **34** | no (thresh only) | 58.6% | 69.1–99.3% (surface-bound, off phone-safe band) |
| `antiquekey` | auto (14) | **1** redo (see below) | 53.2% | 37.7–73.6% |
| `compass` | **34** | no (thresh only) | 41.4% | 56.9–97.4% (surface-bound) |
| `mapscroll` | auto (14) | **1** redo (see below) | 51.0% | 0.5–41.8% (surface-bound) |
| `stampalbum` | auto (14) | **4** redos (see below) | 57.8% | 2.8–29.7% (surface-bound) |
| `mantelclock` | **28** | **6** redos (see below) | 60.9% (borderline, 0.9pt over) | 23.1–51.9% |

**23 forge runs total** (1 backdrop + 7 first-pass items + 1 item redo
[trinketbox timed out, cost nothing] + 14 scene-edit redos), ~180 CU.

## The floor's very strong positional prior — the hall's real story

Every floor-anchored item defaulted to the **same** patch of floor (roughly
x5–45%, near the small corner cabinet) regardless of explicit percent-of-width
windows, negative constraints ("do not place left of 38%"), or even numeric
keep-out zones. This happened for `mapscroll`, `stampalbum`, and initially
`mantelclock` — three separate edits, three different explicit instructions,
same landing spot. Percent-of-width language that works reliably for **named,
concrete surfaces** (counter, stool) did essentially nothing for "bare
floorboards," which reads to the model as an undifferentiated, spatially
generic surface.

**What worked:** anchoring to a second concrete landmark, not a percentage.
`mapscroll` succeeded once told to stand "in the corner where the small corner
cabinet meets the floor." `stampalbum` failed three times with floor-relative
percentages/negations and only succeeded on attempt 4, once retargeted at a
completely different *object* — "on top of the small corner cabinet's own
glass top" — rather than the floor at all.

**`mantelclock`'s saga (6 redos):**
1–2. Floor, percentage-only → landed in the shared corner spot, collided with
   `mapscroll`/`stampalbum` (real disagreement, not harmless overlap).
3. Moved to the step-stool's **lower tread** (a concrete second landmark) →
   visually perfect, but `check_hall_layers` caught a **collision with
   `compass`** on the tread above (98%+ shared, disagreement ~49) despite an
   explicit "do not touch the upper tread" clause.
4. Re-fired the lower-tread version again with an even more explicit
   pixel-for-pixel clause → same collision, ~98% share. **Root cause found by
   inspecting `compass`'s own audit mask**: adding *anything* to this
   two-tier stool prop makes the edit re-render the **whole prop** as one
   unit (both treads), regardless of which tread is named — the same failure
   mode as the Artist's Studio easel/pale-wall case, just for a shared prop
   instead of a pale flat object. Raising `mantelclock`'s own `--thresh` from
   14 up to 60 could not separate the clock from this bleed without also
   erasing the clock body itself (both are similar contrast against the dark
   wood) — confirmed this is a real prop-level redraw, not noise.
5. Moved to the counter, "just behind the pocket watch" → **new** collision,
   because "near X" in a prompt is meaningless to an edit that never sees
   X (each edit starts from the plain, empty backdrop) — it just landed
   directly on top of where `pocketwatch` had actually been painted in its
   own separate edit.
6. Moved to the counter's **far-left, narrow, numerically-bounded gap**
   (16–28%, between the corner cabinet and the pocket watch) with an explicit
   width cap → landed correctly, and **raising extraction `--thresh` from 14
   to 28** (a value where the clock body is still fully intact but the
   incidental relight-halo around it drops below the noise floor) removed
   the last residual collision with `pocketwatch`. Confirmed clean against
   all 6 other layers.

**Lesson for the next hall carrying a multi-tier prop (step-stool, ladder,
shelf-with-drawers, etc.): don't put two different items on two different
tiers of the same prop.** Naming the untouched tier explicitly does not
prevent the model from re-rendering it, and no extraction threshold can
separate the two once that happens — the fix has to be "don't share the prop,"
not "ask more clearly." Threshold-tuning *does* work for a chunky object whose
own contact-shadow/halo bleeds onto an *adjacent, unrelated* surface (compass's
own bleed once isolated, and `mantelclock`'s and `trinketbox`'s halos on the
counter) — that is the Artist's Studio `claybust` precedent repeating almost
exactly, and the fix is the same: raise `--thresh` until the halo drops out
while watching the audit sheet to confirm the object itself survives.

## Honest compromises

- **`mantelclock` tops out at 60.9%**, 0.9 points over the documented 60%
  ceiling, after 6 redo rounds exhausted every safe alternative in this
  backdrop (stool tread 2 → whole-prop redraw; floor → shared corner
  collision; counter center/right → occupied). The overage is one clock
  finial-ball's height; on a phone crop (~87% visible) it is nowhere near the
  trim line, and even on the iPad crop (~62% visible) it clears by a hair.
  Not re-fired again given the redo budget already spent and the demonstrated
  lack of a cleaner slot.
- **Four items sit outside the phone-safe x 15–85% band**: `trinketbox`
  (69–99%), `compass` (57–97%), `mapscroll` (0.5–42%), `stampalbum` (3–30%).
  All four are **surface-bound**: the counter's right end, the stool (itself
  at x55–97%), and the far-left corner (cabinet + adjoining floor) all
  genuinely sit at the frame's edges in this backdrop, exactly like the
  Sewing Room's wicker stool / Library's window bench in the halls 9–11 run.
  Per that precedent, do not re-fire these expecting a win — the furniture,
  not the prompt, sets the constraint.
- **`antiquekey`/`pocketwatch` and `antiquekey`/`trinketbox` share 29.5%/6.8%
  of the smaller mask** on the counter, and `mantelclock` shares 36%/10.2%
  with `pocketwatch`/`antiquekey` — all four confirmed **order-independent**
  (0 disagreement flagged), i.e. harmless shared-backdrop pixels, the same
  "jam jars and cat" case the original SCENE-LAYERS-PLAN.md calls out as not
  a defect.

## Reusable Layer file_ids

backdrop: `48f32bad-b6d9-45e4-8a16-1786719d50ab`

items (512px keyed PNGs, uploaded once, reused across all edit attempts):
pocketwatch `7d67af58-334c-49e6-b450-1011a50d2885`, trinketbox
`7ee43fd5-0dd2-44a2-9c50-2eb68d758978`, antiquekey
`5dcabb04-f9d9-4a31-bf2d-815e7c03eed9`, compass
`14c83421-9068-41bb-a805-29c2a18596a2`, mapscroll
`c7597eb2-800d-45fa-a88f-e1c7c86448db`, stampalbum
`5b0a1411-50e4-4b5b-a047-cac671d50a7b`, mantelclock
`af9fa9c3-e842-436d-b358-bc0c7f74dfed`

## Verified

- All 7 `art/curiosityshop/scene/<key>.png` are RGBA, 576×1024, aspect delta
  0.0000 against the backdrop.
- All 7 `art/curiosityshop/<key>.png` (behind-board item art) are RGBA.
- `check_hall_layers.py` on the shipped 7: **0 real collisions** (21/21 pairs
  order-independent).
- Not yet verified in the live game (out of scope — no `collections.*` wiring
  was done, per instructions).
