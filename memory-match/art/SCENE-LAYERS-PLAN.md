# Interior-room halls → scene layers

Authored 2026-07-28. Converts the five interior-room halls (Cozy Attic, Grandma's
Kitchen, Victorian Greenhouse, Music Room, Toy Workshop) from **placed items** to
**full-scene tableau layers**, so each collectible is painted *into* the room —
correct light, correct occlusion, a real contact shadow — and then detached again
so an unearned item is simply absent.

Supersedes the item half of `NEW-HALLS-PLAN.md`. The 5 **backdrops stay exactly as
they are** and are never regenerated; that file's backdrop recipe still stands.

Read alongside `memory-match/CLAUDE.md` §3 (Backgrounds / collectibles).

---

## Why the old approach looked wrong

Each item was rendered alone on a white plate, keyed, then anchored by
`left`/`bottom`/`h`. Nothing tied the render to the room, so the shipped halls
show the tell: the teddy bear floats a few px above the stool seat, the pie and
jam jars hover in front of the counter rather than resting on it, no item casts a
shadow onto the surface it stands on, and the scales disagree (the kettle
out-masses the cat). `shadow: true` adds a generic ellipse, which is not the same
thing as light.

## The approach

`kind: 'layer'` already exists and already ships — **Childhood** and **Bedroom**
use it, so this needs **no engine change**. A layer slot's art is a full canvas at
the backdrop's aspect with the piece at its final position, drawn cover-cropped
over the backdrop by `slotArt()`; `left`/`bottom`/`h` are unused.

```
backdrop.jpeg ──┬─ Layer image-edit "add the teddy bear on the stool" → edited.png
                │                                                          │
                └─ extract_layer.py (base, edited) ────────────────────────┘
                              └→ art/attic/scene/teddybear.png   item.layer  (new)
                                 art/attic/teddybear.png         item.file   (kept)
```

**The base is an input, never an output.** "The item" is exactly "the pixels that
changed", so compositing the layer back over the backdrop reproduces the edit
inside the mask, shadow included. This is the pixel-diff placement idea from the
original collections-editor decisions, finally used for what it is good at.

⚠️ **Corrected 2026-07-29.** This section used to claim every untouched pixel comes
back "literally the backdrop" and the recomposite is bit-for-bit. It is not: an
editing model re-decodes the whole frame, so *every* pixel returns a few levels
off. Only the masked pixels are used and the rest of the backdrop is never
touched, so the result is still exact where it counts — but it means `spill` sits
at **5–7.6 on a perfectly good edit** (it scales with how detailed the room is:
~4.5 in the kitchen, ~6 in the attic, ~7.5 in the greenhouse). The `spill > 6 =
REDO` gate below is therefore a false-positive machine; judge by the audit sheet's
panel 5 and by `check_hall_layers.py`.

Consequences worth knowing:
- All 25 edits take the **same untouched backdrop** as input, so the layers are
  **independent**: any subset composites correctly, in any unlock order. Never
  chain edit-on-top-of-edit or item 3 will carry items 1 and 2 inside it.
- Placement stops being tunable. There is no `left`/`bottom`/`h` to nudge — if the
  model puts it in the wrong place, you redo the edit. That is the trade.
- An unearned item shows the true empty room, because the backdrop is unchanged.

---

## Layer AI parameters

- Server `https://mcp.app.layer.ai/mcp` (the **direct** URL, not the Sage
  gateway), workspace **zynga** `6d9da2da-be2f-4189-80f9-54148e55a3ef`.
- Model **Gemini 3 Pro Image Edit** `71f83b71-7918-4258-9e79-02d4f69f2b0d`.
- ✅ **Verified 2026-07-29: the forge accepts input images, and this works.**
  The originally-planned `520f3a09…` "Gemini 3 Pro Image" is **text-to-image
  only** — `session_modes: ["create"]`, no `guidance_file_types` — so
  `NEW-HALLS-PLAN.md`'s "takes no reference image" was true *of that model*. The
  `…Edit` sibling above is the one to use: same family, same 4 CU/generation,
  `guidance_file_types: ["init", "editing_reference"]`.
- Pass **two** guidance files: the backdrop as `init` **and the existing 512px
  item PNG as `editing_reference`**. This is the "best of both" the Board-art
  section hoped for, and it turned out to be **mandatory, not a bonus** — with
  `init` alone the diff's primary blob was global drift rather than the object in
  2 of 4 test runs, yielding a layer with no object in it and a healthy-looking
  `keep%`. It also holds the hall render on-design with the board art.
- `width: 1152, height: 2048` — 2x the 576×1024 backdrops at the same 9:16. The
  extractor then emits the layer at the *backdrop's* size; see Extraction.
- Local files need `request_file_upload_url` (the `upload_file` tool only takes a
  public URL) followed by `art/tools/layer_upload.sh`. `file_size_bytes` must be
  the exact `wc -c`, because the signed URL requires
  `x-goog-content-length-range: 0,<that number>`.
- `batch_size: 2` and pick — for an edit the variants differ in placement and
  shadow quality, which is exactly what you want to choose between. Budget ~2
  redos per hall; see the CONFINE clause below, which cuts that to ~0.
- Async: `execute_forge` → poll `get_forge_run`. Fire a hall's 5 in parallel.
- MCP tools attach **at session start only**. If Layer's tools are missing,
  restart the session; authorizing mid-session does not attach them.

---

## The three shared clauses — paste verbatim

Style does **not** need describing: it is in the input image. Describing it again
fights the reference. What does need saying, every single time, is *don't touch
anything else* — an editing model's default is to re-render the frame, and a
re-rendered room makes the diff useless.

**PRESERVE clause** (every one of the 25 prompts, verbatim):

> Return the input image completely unchanged except for the one object described
> above and the shadow it casts. Do not redraw, recolour, relight, restyle,
> sharpen, crop or reframe anything else — every existing pixel of the room, its
> walls, its floor, its furniture, its window light and its framing detail must
> survive untouched. Do not add any other object, prop, clutter, ornament, text or
> watermark. Keep the exact input resolution and framing.

**CONFINE clause** (every one of the 25 prompts, verbatim — added 2026-07-29):

> Keep the new object clear of every other piece of furniture in the room: it must
> not overlap, cover, extend behind, or alter anything except the single surface it
> rests on, and no existing furniture or fitting may be moved, resized, recoloured
> or redrawn.

PRESERVE already demands the furniture "survive untouched" and the model still
moved things: the attic's steamer trunk arrived carrying its own rewritten copy of
the stool the teddy bear sits on and the nook holding the oil lamp, and a globe
variant relocated the crate. Both passed `keep%`/`spill`/`margin` — only
`check_hall_layers.py` caught them. Naming the non-overlap requirement explicitly
is what fixed it: the two halls fired without CONFINE needed **4 redos between
them**, the first hall fired with it needed **none**. When a redo is still needed,
name the specific neighbouring furniture as off-limits.

**INTEGRATE clause** (every one of the 25 prompts, verbatim):

> The object must read as having been painted as part of the original scene, not
> pasted on: match the room's existing art direction, palette and light direction
> exactly, let the room's light fall across it with the same warmth and softness,
> and ground it with a soft contact shadow on the surface it rests on. It must sit
> physically ON that surface with its base in believable contact — not floating
> above it, not clipping into it.

---

## The 25 edits

Every prompt = **the object line below** + CONFINE + INTEGRATE + PRESERVE.
(Machine-readable copies of all of it live in `art/tools/scene_edits.json`.)

Scale is always pinned to something visible in the plate, because "small" means
nothing to the model and a wrong scale is the second most common reject.

**Keep every object's top inside the bottom 60% of the frame.** The hall scene box
is `flex: 1`, so a tablet aspect crops the *top* of the picture away while
`syncBackdropBox()` anchors the bottom. The visible fraction of the picture is
exactly `backdropAspect / sceneAspect`, so at 0.5625 a phone (scene ≈ 0.65) shows
~87% and an iPad (scene ≈ 0.91) shows only **~62%**. This is the same constraint
CLAUDE.md §3 states as "slot tops under ~62%"; for a layer it applies to where the
object is *painted*, and there is no `bottom`/`h` to pull it down afterwards — a
too-high object means regenerating. 60% leaves a small margin.

The Toy Workshop's cubby shelf and the pegboard are above that line, which is why
its items go on the bench and the floor. Same for the attic's roof beams, the
kitchen's hanging pans and the greenhouse's hanging baskets — framing detail, not
surfaces. **Grandma's Kitchen's right-wall shelf is above it too**, which is why
its jam jars moved to the counter; the shipped placed-item version never used that
shelf either, it just left them floating in mid-air instead.

Every height below was measured with:

```bash
python3 grid_overlay.py ../backdrops/*.jpeg --outdir /tmp/grids
```

which draws a labelled % grid and the magenta 60% ceiling on each plate. Re-run it
rather than guessing — three of these prompts were wrong on the first pass and the
grid is what caught them.

### `attic` — Cozy Attic (`backdrops/cozy-attic.jpeg`, levels 15–19)

Surfaces, measured off the plate as **% of picture height from the bottom** —
add the object's own height and keep the total under 60:

| surface | x | height |
|---|:--:|:--:|
| low wooden crate, lid | 7 | 41 |
| three-legged stool, seat | **62** | 41 |
| shelf nook in the right knee wall, floor | 88 | 35 (opening top 56) |
| bare floorboards, foreground | 20 / 78 | 12 |

| level | item | object line |
|:--:|---|---|
| 15 | `rockinghorse` | Add a small wooden rocking horse standing on the bare floorboards in the lower left foreground, in front of the wooden crate, turned three-quarters toward the viewer. It stands about as tall as the crate beside it, and its curved rockers rest flat on the boards. |
| 16 | `globe` | Add a small antique globe on a brass stand sitting on top of the low wooden crate at far left, centred on the crate's lid. It is about two-thirds as wide as the crate's lid. |
| 17 | `teddybear` | Add a plush honey-brown teddy bear sitting on the seat of the three-legged stool right of centre, facing the viewer, slumped comfortably. It is roughly as tall as the stool's seat is wide, and its bottom and paws settle into contact with the seat. |
| 18 | `oillamp` | Add a brass oil lamp with a clear glass chimney standing inside the open shelf nook in the right knee wall, resting on the nook's floor. It is about two-thirds the height of the nook opening, comfortably inside it, and its warm glow spills onto the nook's back and side walls. |
| 19 | `trunk` | Add an old leather-and-brass steamer trunk, lid closed, sitting on the bare floorboards at right, angled three-quarters toward the viewer. It is about as tall as the wooden crate at far left. |

### `kitchen` — Grandma's Kitchen (`backdrops/kitchen.jpeg`, levels 20–24)

Surfaces, measured (% of picture height from the bottom):

| surface | x | height |
|---|:--:|:--:|
| round wooden stool, seat | 10 | 24 |
| butcher-block island counter, top | 5–62 | 42 |
| enamel trivet on that counter | 46 | 43 |
| right-hand counter run, top | 85 | 42 |
| terracotta floor, right | 78 | 10 |
| ~~open wooden shelf, right wall~~ | 80 | **56 — unusable**, an object on it tops 62+ |

| level | item | object line |
|:--:|---|---|
| 20 | `kettle` | Add a polished copper kettle standing on the round wooden stool at far left, centred on the seat. It is about two-thirds the width of the seat — small enough that the seat reads clearly around it. |
| 21 | `pie` | Add a golden latticed apple pie in a ceramic dish resting on the butcher-block counter, left of centre, near the front edge of the counter with its base flat on the wood. It is about as wide as the enamel trivet. |
| 22 | `mixingbowl` | Add a duck-egg-blue ceramic mixing bowl with a wooden spoon resting in it, standing on the bare enamel trivet at the centre of the butcher-block counter, seated squarely on the trivet. It is about as wide as the trivet. |
| 23 | `jamjars` | Add three small jars of jam with gingham-covered lids standing in a row on the bare wooden counter running along the right-hand wall, their bases on the counter top. Each jar is about a third as tall as the cabinet doors below the counter are wide. |
| 24 | `cat` | Add a ginger tabby cat curled up asleep on the terracotta floor tiles at right, in front of the cabinets, its body flattening slightly where it meets the floor. It spans about three floor tiles. |

### `greenhouse` — Victorian Greenhouse (`backdrops/greenhouse.jpeg`, levels 25–29)

Surfaces, measured (% of picture height from the bottom):

| surface | x | height |
|---|:--:|:--:|
| upturned wooden crate, on gravel | 15 | 8 (crate ~20 tall) |
| potting bench, left arm | 15 | 36 |
| bench top across the middle, under the window | 50 | 41 |
| white wire shelf, right glazing bar | 87 | 52 — flat items only |
| bare gravel, right | 80 | 12 |

| level | item | object line |
|:--:|---|---|
| 25 | `wateringcan` | Add a weathered galvanised watering can standing on the gravel at far left, just in front of the upturned wooden crate, its base settled into the gravel. It is about as tall as the crate. |
| 26 | `orchid` | Add a white moth orchid in a terracotta pot standing on the left arm of the slatted potting bench, its pot base flat on the slats. The pot is about as wide as one bench slat, and the whole plant including the arching flower spike is about twice the pot's height. |
| 27 | `claypots` | Add a small stack of three terracotta plant pots resting on the bare bench top across the middle of the frame, under the window, sitting squarely on the slats. The stack is about a third of the bench top's depth in width. |
| 28 | `trowelgloves` | Add a hand trowel and a pair of folded canvas gardening gloves lying flat on the white wire shelf on the right glazing bar, draped over the wire so the shelf reads through them. Together they fill about two-thirds of the shelf. |
| 29 | `cloche` | Add a bell-shaped glass cloche standing on the gravel at right, with a small seedling visible inside it, its rim settled into the gravel. It is about as tall as the watering can. |

### `musicroom` — Music Room (`backdrops/music-room.jpeg`, levels 30–34)

Surfaces, measured (% of picture height from the bottom). This is the tightest
room — the sideboard top is at 52, leaving only ~6 of headroom, and the **top edge
of the green wainscot panelling sits almost exactly on the 60 line**, which makes
it the perfect thing to tell the model not to cross:

| surface | x | height |
|---|:--:|:--:|
| blue-grey velvet pouf, top | 17 | 45 |
| leather sideboard, top | 5–52 | 52 (only ~6 of headroom) |
| wall-mounted console shelf, top | 82 | 45 |
| patterned rug / parquet floor | 35 / 70 | 10–14 |
| *green wainscot rail — the ceiling* | — | *60* |

| level | item | object line |
|:--:|---|---|
| 30 | `gramophone` | Add a brass-horned gramophone in a wooden case standing on top of the low leather sideboard along the left wall, its case flat on the sideboard's top surface. Keep it compact: the very top of its brass horn must stay below the top edge of the green wainscot panelling on the wall behind it. |
| 31 | `cello` | Add a warm-varnished cello resting upright on the patterned rug, leaning back against the front of the leather sideboard just right of the pouf, its endpin in contact with the rug. It reaches about to the top of the sideboard. |
| 32 | `metronome` | Add a small pyramid-shaped wooden metronome standing on the blue-grey velvet pouf at left, its base pressing a slight dimple into the velvet. It is about half the pouf's width. |
| 33 | `sheetmusic` | Add a loose sheaf of open sheet music lying on the wall-mounted wooden console shelf at right, its pages resting on the shelf and one corner overhanging the front edge. It covers about two-thirds of the shelf. |
| 34 | `accordion` | Add a red button accordion resting on the herringbone parquet floor at right, standing on its base and angled three-quarters toward the viewer. It is about as tall as the console shelf above is deep, times three. |

### `workshop` — Toy Workshop (`backdrops/workshop.jpeg`, levels 35–39)

Surfaces, measured (% of picture height from the bottom):

| surface | x | height |
|---|:--:|:--:|
| workbench, top | 0–75 | 52 (only ~6 of headroom) |
| metal vice on the bench, jaw top | 30 | 52 (the vice is ~8 tall — a usable ruler) |
| plank floor, foreground | 15–90 | 8–14 |
| ~~cubby shelf, right wall~~ | 82 | **68 — unusable** |
| ~~pegboard~~ | 32 | **57–78 — wall decoration, not a surface** |

The bench is a *low-headroom* surface: anything standing on it must be squat, and
anything leaning against it must stop below its top edge. Three items go on the
floor for this reason, which is also where toys belong.

| level | item | object line |
|:--:|---|---|
| 35 | `toytrain` | Add a small painted wooden toy locomotive standing on the plank floor in the lower left foreground, in front of the sawhorse, turned three-quarters toward the viewer, its wheels touching the planks. It is about as wide as one floor plank. |
| 36 | `tinrobot` | Add a squat boxy retro wind-up tin robot standing on the workbench top, left of centre, its feet flat on the bench. It is small — no taller than the metal vice mounted on the bench beside it. |
| 37 | `kite` | Add a red diamond paper kite with a ribbon tail propped against the front edge of the workbench right of centre, its lower corner resting on the plank floor and its face angled toward the viewer. Its top corner must stay below the level of the workbench top, not rise above it. |
| 38 | `jackinthebox` | Add an open jack-in-the-box — a painted wooden cube with a grinning spring puppet leaning out of it — standing on the workbench top right of centre, the cube flat on the bench. The cube is about as wide as the vice beside it. |
| 39 | `toolbox` | Add a red metal toolbox with a wooden handle sitting on the plank floor at right, angled three-quarters toward the viewer. It is about as wide as two floor planks. |

---

## Extraction

```bash
cd memory-match/art/tools
python3 extract_layer.py --base ../backdrops/cozy-attic.jpeg \
    --outdir ../attic/scene --audit \
    raw/attic/*.png            # each basename is the item key
```

**No `--tight-outdir`** — see below. The existing `art/<hall>/<key>.png` files stay
exactly as they are.

### Board art resolution — decided

An item occupies ~8–13% of the frame height, so cropping it out of the scene gives
only **~130px** at 576×1024, or **~265px** from a 1152×2048 edit. But
`board-bg.js` draws the behind-board reveal at up to `0.9 × board height` —
several hundred device px — and the shipped items are **512px**. A crop straight
out of the scene is visibly soft there. `extract_layer.py` flags any tight crop
under 400px for this reason.

**Decision (user, 2026-07-28): keep the existing 512px keyed item PNGs.** Layers
drive the hall only; `item.file` and `item.view` are untouched, so board art stays
sharp and no extra runs are needed. The accepted cost is that a hall's object and
its behind-board object are **two renders of the same idea** — a knowing exception
to CLAUDE.md §3's "a level's reveal and its home-screen item can't drift apart",
which is about the *dataset* binding them, and that still holds.

Two things follow, and they matter:

- **Write each object line to describe the existing item PNG**, not a fresh idea —
  "a plush honey-brown teddy bear" because `attic/teddybear.png` is a plush
  honey-brown teddy bear. The prompts below are already written this way. Open the
  existing PNG before prompting; the closer the two renders, the less the drift
  reads as a bug.
- **If the forge accepts more than one input image, pass the item PNG as a second
  reference** alongside the backdrop ("paint the object from the second image into
  the first"). That collapses the drift to near zero at no extra cost and is worth
  checking for when the schema is inspected. It would make this the best of both
  options rather than a trade.

**Look at every `<key>.audit.png`** — 5 panels: base | edit | diff | mask over
base | layer recomposited over base. Panel 5 must be indistinguishable from panel
2, and the mask in panel 4 must cover the object *and its shadow* and nothing
else. The two printed numbers gate it:

| number | good | means |
|---|---|---|
| `keep%` | 0.5–8 | share of frame the layer claims. 30%+ = the model repainted the room → redo. |
| `spill` | < 2 | mean difference *outside* the mask, i.e. edit being discarded. > 6 = global drift → redo. |

`dropped blob` lines list changes far from the object that were discarded. A
shadow fragment being dropped means raising `--link-px`; a whole second object
means the prompt leaked and the edit is a reject.

## Wiring

```bash
python3 wire_scene_layers.py --dry-run
python3 wire_scene_layers.py
```

Points each item at its `layer`, sets every slot to `kind: 'layer'`, drops the now
meaningless `left`/`bottom`/`h`, and refreshes `view` from the new tight crop. It
preflights that every layer matches its backdrop's aspect — a mismatch there is
the one failure that silently mis-registers every item in the hall.

**Do not run `wire_halls.py` afterwards.** It rewrites these halls as placed items
from seed geometry and would undo the conversion; it is a bootstrap tool.

## Verify

1. `python3 -m http.server 8000`, then the level-editor's Collections tab preview,
   at **both** iPhone and iPad — the iPad crop is what punishes an object painted
   too high.
2. In-game: the halls sit at levels 34–58 and the journey is 40 levels, so only
   Attic and part of Kitchen are reachable. Use the settings/default-settings
   button to grant progress rather than playing to 43.
3. Reveal animation: layer slots fade in via `@keyframes childhoodReveal` and
   never bob. Confirm a freshly-won item pops in rather than being already there.

## On completion, update

- `CLAUDE.md` §3 — the bullet listing the five halls as "image backdrops with
  placed items and the only ones carrying `floatPx: 0`" becomes wrong; they become
  layer halls, and `shadow`/`glow`/`floatPx` go inert. The `kind: 'layer'` bullet
  should name them alongside Childhood.
- `art/NEW-HALLS-PLAN.md` — mark the item half superseded by this file.
- The `interior-room-halls-shipped` memory — its "placement is good but not
  pixel-perfect (`greenhouse/claypots` floats, `greenhouse/orchid` is small)" open
  item is resolved by this work, not by nudging.
