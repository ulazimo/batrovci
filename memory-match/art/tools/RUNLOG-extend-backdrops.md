# Run log — extending hall backdrops below the Play button

**Date:** 2026-07-31 · **Tool:** `art/tools/extend_backdrops.py` · **Status:** **DONE.**
All **16** layer halls extended and applied with Ivan's generated floor art (15 in the
first pass, plus Wedding Chapel once it landed upstream). Every hall's lowest item now
sits at 73.9–74.0% of screen height, clear of the Play button at 78.1%. 97 scene layers
padded. Shipping weight +1.4 MB.

## The problem

The Play button moved up. `#room-bottom` (Play + streak meter + hall dots) now
occupies **78.1% → 100%** of `#room-scene`, and the hall backdrops are full-bleed
`object-fit: cover; object-position: center bottom`. Items painted near the bottom of
a 576×1024 picture therefore land behind the button.

Measured, per hall, as the lowest solid pixel across its scene layers:

| worst offenders | | still under the line |
|---|---|---|
| attic `rockinghorse` | 99.7% | library `bookstack` 86.6% |
| greenhouse `wateringcan` | 99.7% | sunroom `croquetset` 86.6% |
| sewingroom `yarnbasket` | 99.5% | workshop `toytrain` 84.9% |
| study `magnifyingglass` | 96.8% | musicroom `accordion` 83.7% |
| kitchen `cat` | 96.6% | curiosityshop `mapscroll` 81.2% |
| sweetshop `cottoncandy` | 93.1% | nursery `plushbunny` 79.5% |
| gameroom `rubikscube` | 92.7% | winecellar `cellarlantern` 78.8% |
| | | artstudio `easel` 78.3% |

All 15 layer halls are affected. The `study` case is the reported one: three of its
seven items sit in the band, and `magnifyingglass` (84.6–97.2%) is entirely hidden.

`bedroom` is not in this list — it uses `placed` slots and was already fixed by hand
by extending its backdrop and re-tuning `left`/`bottom`/`h`. The tool skips
placed-slot halls deliberately: rewriting slot geometry is a judgement call.

## The fix, and why the layers are free

Add a band of floor to the **bottom** of the picture. A phone scene (0.4457) is
proportionally narrower than the 0.5625 art, so the picture fills the scene's height
— making it taller pushes everything already in frame further up the screen.

The `kind: 'layer'` slots come along for nothing. A layer is a full canvas with the
item baked at its final position, drawn with the same box and the same cover rules as
the backdrop (`.spot-layer .spot-instrument`, `syncBackdropBox`). Pad each
`<hall>/scene/*.png` with the same E transparent rows and every item stays pixel-glued
to the furniture it stands on. **`collections.json` does not change at all** — a layer
slot ignores `left`/`bottom`/`h`.

Chosen extensions (per-hall, each just enough to put the lowest item at 74% of screen,
which leaves ~4% of visible floor under it):

| hall | +px | new size | hall | +px | new size |
|---|---|---|---|---|---|
| attic | 334 | 576×1358 | library | 176 | 576×1200 |
| greenhouse | 334 | 576×1358 | sunroom | 176 | 576×1200 |
| sewingroom | 332 | 576×1356 | workshop | 152 | 576×1176 |
| study | 304 | 576×1328 | musicroom | 136 | 576×1160 |
| kitchen | 302 | 576×1326 | curiosityshop | 100 | 576×1124 |
| sweetshop | 264 | 576×1288 | nursery | 76 | 576×1100 |
| gameroom | 260 | 576×1284 | winecellar | 68 | 576×1092 |
| | | | artstudio | 60 | 576×1084 |

Per-hall rather than one uniform extension: uniform (+334 everywhere) would shrink the
shallow halls ~25% for nothing and leave artstudio's lowest item at 57% with a lot of
dead floor. The cost is that halls render at slightly different zoom.

## The mistake worth remembering

The first version of this tool reported that **8 of the 15 halls needed no generated
art at all** — that their new band was 0.0% visible on both phone and tablet — and on
that basis their bands were filled by stretching the existing floor. That was wrong.

`#room-bottom` is **not an opaque bar**. Its background is
`linear-gradient(0deg, rgba(10,6,24,.9), rgba(10,6,24,0))` — a scrim that is fully
**transparent at its top edge** and only 90% dark at the very bottom of the screen —
and the only solid things in it are the Play button (**x 32.3%–67.7%**) and the streak
bar (**x 22.6%–77.4%**). So art added at the bottom of the picture is merely dimmed in
the middle and plainly visible in the gutters either side of the button.

It was caught by rendering `library` on the iPad frame in the dev harness: the stretch
band's seam and a repeated arc of the rug were clearly legible below the real rug. The
8 halls were reverted from their `_orig/` backups.

Two consequences, both now baked into the tool:

- **Every extended hall needs real generated floor.** `band_on_screen` reports how much
  invented floor each generation has to sell — **5.5%–25.8% of a phone screen, 7.2%–39.8%
  of a tablet's**. `--fill-missing` still exists but is labelled a placeholder.
- **`verify` draws the UI honestly** — the gradient scrim as an actual gradient, plus
  the two solid widgets at their measured x spans. A solid red block is what hid the
  defect; now whatever is legible in the audit render is legible in the game.

Note `UI_TOP = 0.781` is still the right line for *items*, because an item can be
anywhere in x and must clear the button wherever it is. `#room-bottom` is a fixed 181px,
so it is a smaller fraction of a taller scene (80.0% on the iPad frame) — the phone's
78.1% is the stricter of the two and is the one used.

## How to finish the job

```bash
python3 art/tools/extend_backdrops.py prep          # already run; writes art/extend/
```

For each of the 15 halls, run `art/extend/<hall>/to_generate.png` (the backdrop at 2×
with a white band at the bottom) through an image model using that folder's
`PROMPT.txt` — which names that room's actual floor material, since a generic "continue
the floor" invites the model to change material at the seam. `mask.png` is there for
inpainting APIs (**white = repaint**; invert if yours wants the opposite). Save each
result as `art/extend/<hall>/generated.png`, then:

```bash
python3 art/tools/extend_backdrops.py apply
python3 art/tools/extend_backdrops.py verify --open
```

`apply` **keeps the original rows byte-for-byte** and splices in only the new band
(with a 10-row feathered seam). This is not paranoia: the scene layers were pixel-diffed
against the original backdrop, so drift in a model's re-decode of the room above the
seam would show as a halo around every item. It also pads every scene layer by the same
E. Originals go to `art/backdrops/_orig/` and `art/<hall>/scene/_orig/`; `--redo`
restores from them first, so halls can be redone one at a time as art lands.

## What the returned art needed — the tone step

All 15 came back at the right aspect (within 0.2%) and with the floor structure
continuing correctly, so no hall had to be re-fired. But they came back at ~1024px tall
(so 434–544 wide, *below* the 576 shipping width — a 1.06–1.33× upscale of the band,
which is fine for low-frequency floor) and, more importantly, **every one was a few
levels darker than the original**. `check` caught it as a high `seam` score: musicroom
31.5, winecellar 28.5, curiosityshop 25.1, library 15.2, study 13.1.

Since `apply` pastes the pristine rows back, that shift would have landed as a
brightness step exactly at the join. The fix is `tone_match_band`, and it is free:
**the returned image contains the original room as well as the new band, so the rows
just above the cut exist in both pictures** and their ratio *is* the exposure error.
Applied as a per-channel multiplicative gain to the band only — multiplicative because
it is exposure, uniform over the band so the model's own vignette survives. Gains
applied:

| hall | gain R/G/B | hall | gain R/G/B |
|---|---|---|---|
| curiosityshop | 1.48 / 1.55 / 1.59 | library | 1.13 / 1.25 / 1.25 |
| musicroom | 1.31 / 1.39 / 1.46 | kitchen | 1.04 / 1.08 / 1.10 |
| winecellar | 1.31 / 1.36 / 1.38 | the other 9 | ≤1.07 |

The three halls needing ≥1.3 were checked in the running game afterwards and show no
step. `--no-tone-match` disables it.

One cosmetic thing accepted rather than fixed: `library`'s original has pale
wall/skirting strips at the extreme left and right of its bottom rows, and the returned
band runs floorboards edge-to-edge instead of continuing them. They sit at roughly
x 0–4% and 96–100%, which the phone's side crop removes entirely — confirmed invisible
on the iPhone frame.

## Wedding Chapel — added mid-flight, and the bug it exposed

Wedding Chapel (`78b8069`, levels 92–100, 9 items) landed upstream *after* the first 15
were done, and arrived un-extended: `champagneflutes` at **91.8%**, squarely behind the
Play button. Extended +248px → 576×1272, tone gain ×1.07/1.08/1.08.

Two things were needed that the first pass hadn't:

- **A per-hall prompt exception (`PROMPT_EXTRA`).** The blanket "add NO new objects" rule
  is right for a plain floor but wrong here: the chapel's aisle is strewn with rose
  petals, so forbidding new objects would have made them stop dead at the seam. The
  chapel's prompt carries an explicit exception to keep scattering the same petals at the
  same density and size falloff. It worked — the returned band continues the petals, the
  pew leg, the runner's trim line and the floorboards.
- **`prep --halls <one>` was destructive.** It rewrote the manifest from scratch, so
  prepping the chapel alone **dropped the other 15 entries** — the geometry `apply --redo`
  and `verify` depend on, stranding every already-applied hall with no way to redo it.
  Now `prep` merges into an existing manifest, and "already applied" is derived from the
  file on disk (`is_applied`) rather than a stored flag, so it stays correct across a
  stash, checkout or pull. `needs_art` lists only halls not yet applied.

**Adding a hall from now on:** finish with
`extend_backdrops.py prep --halls <new-hall>`, generate its band, `apply`. A new hall is
authored against a 576×1024 canvas and so always lands in the occluded band.

## Validated

- **Alignment is exact, and provably so.** For all 16 halls / **97 layers**: every scene layer's rows
  above the seam are **byte-identical** to its `_orig/` backup, and every padded row is
  **pure transparent** (max alpha 0). Each layer's size matches its hall's backdrop
  exactly. So no item can shift, drift or float — each sits on the very same furniture
  pixels it did before. The backdrops' room region differs only by JPEG re-encode noise
  (mean 0.36–0.71 per channel).
- `verify` reports **CLEAR for all 16**; lowest items land at 73.9–74.0%.
- Checked in the running game: `study` and `library` and `attic` and `curiosityshop` on
  the iPhone frame, `study` on the iPad frame. The reported defect is gone — the study's
  magnifying glass now sits on its books on the rug, fully visible above Play. The
  attic's rocking horse rests on the boards with its contact shadow intact and the new
  floor continuing below it. No seam is discernible in any of them.
- The audit renderer's cover math was checked against the real browser: the `study`
  render lines up with a device screenshot (typewriter, desk clock, book on chair all in
  the same places).
- The level-editor was grepped for hardcoded 576/1024/0.5625 — it has none, so the
  Collections tab and Hall Walkthrough handle the new sizes.
- All 17 halls swept in the browser after rebasing onto the 8 upstream commits
  (`fbd3415..d2ec4b4`): every hall renders, **0 JS errors**, every backdrop's
  `naturalHeight` matches its manifest entry. Note a **stale browser cache** can serve an
  old `collections.js` and show only 16 halls — hard-reload before concluding anything.
- The iOS notch fix (`3fc1797`) was checked for geometry impact: it moved `#room-top`
  padding only, so `#room-bottom` is still at **78.1%** and `UI_TOP` still holds.
- `art/extend/`, every `_orig/` and `__pycache__/` are gitignored (repo-root
  `.gitignore`): ~49MB of regenerable scratch, and git history is the real backup.

## Not addressed

- **`bedroom`** (placed slots) — already hand-fixed, and out of scope for the tool.
- The **top** of the picture. A taller picture on a wide scene crops from the top
  (`cover_geometry`'s wide regime): attic loses ~6% of its ceiling on a phone, more on a
  tablet. That is ceiling, so it was accepted rather than solved.
- `art/tools/wire_halls.py` asserts `BACKDROP_ASPECT = 1024/576` and will reject an
  extended backdrop. It is already flagged "do NOT run" in `CLAUDE.md`, but if it is ever
  revived it needs the assert relaxed to per-hall.
