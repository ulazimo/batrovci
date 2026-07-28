# Plan — 5 new interior-room halls (halls 7–11)

> **EXECUTED 2026-07-28.** All 5 backdrops and 25 items are generated, keyed, and
> wired; `collections.json`/`.js` carry 11 halls / 55 items / `boardArt` 1–54.
> Two things did not survive contact with reality — read
> **"What actually happened"** at the bottom before reusing this recipe. The
> headline: **do not paste the style clause verbatim into the item prompts.**

Authored 2026-07-28. Blocked on a session restart so the **Layer** MCP server's tools
attach (they only load at session start). Everything needed to execute is below.

Read alongside `memory-match/CLAUDE.md` §3 (Backgrounds / collectibles) — the slot
geometry and `syncBackdropBox()` notes there are load-bearing.

---

## Decisions made by the user

1. **Levels 30–54.** The 5 halls are wired against cleaningxl levels 30–54 even though
   the journey only has 40 levels. Halls 9–11 (Greenhouse from level 41, Music Room,
   Workshop) are unreachable until the journey is extended — accepted, art first.
   → **Shipped at 34–58, not 30–54.** A Bedroom hall took 30–33 while this ran; see
   "What actually happened" § 4.
2. **Varied room types** — Attic, Kitchen, Greenhouse, Music Room, Workshop.
3. **`floatPx: 0` on the 5 new halls only.** Items must sit pinned on their painted
   surfaces. Coral Reef / Sunny Shore / Snow Day keep their 5px bob unchanged.

## Open flag to raise before wiring

- Levels **38, 39, 40** already carry `boardArt` (`piano`, `drum`, `violin`). Those
  entries get **overwritten** by Kitchen 38/39 and Greenhouse 40. They were reused
  instruments, not a hall, so nothing else references them.
- Hall 10 is a **"Music Room"** sitting in a game that already has a **"Music Hall"**
  (CSS theme, levels 5–9). Item sets are deliberately disjoint (no piano/violin/drum/
  guitar/sax/trumpet) but the two names are close. Rename if it reads badly in-game.
- Appending halls at the **end** of `COLLECTIONS.halls` does not shift existing
  `seenHall` / `seenInstruments` indices, so **no `PROGRESS_VERSION` bump is needed**.

---

## Layer AI parameters

- Server `https://mcp.app.layer.ai/mcp`, workspace **zynga**
  `6d9da2da-be2f-4189-80f9-54148e55a3ef`.
- Model **Gemini 3 Pro Image** `520f3a09-b843-47f4-9d4c-5b24ae3bb7bb`. 4 CU/image,
  ~30–90s. Takes no reference image — the style has to live in the prompt.
- Backdrops: aspect **9:16 (1152×2048)**, `batch_size: 1`.
- Items: aspect **1:1 (1024×1024)**, `batch_size: 2` (pick the better of the two —
  the variants differ usefully).
- `remove_background: true` is **silently ignored**. Key off white locally.
- Async: `execute_forge` → poll `get_forge_run`. Fire all runs in parallel; balance is
  ~7.9M CU so cost is a non-issue. One run in a batch sometimes straggles to ~5 min —
  poll again rather than re-running.

**30 runs total: 5 backdrops + 25 items.**

---

## THE STYLE CLAUSE — backdrops only ⚠️

> ⚠️ **Corrected in execution.** This clause is right for the **5 backdrops** and
> wrong for the **25 items** — its godrays and dust motes get painted onto the
> white plate, where no white key can separate them from the subject. Use the
> item-specific clause in "What actually happened" § 1 instead. The instruction to
> paste it into "every one of the 30 prompts" below is the error; it is left intact
> so the correction has something to point at.

> Soft stylized 3D render in the art direction of a premium casual mobile puzzle game
> (Royal Match / Gardenscapes): chunky rounded forms with generous bevels, matte
> hand-painted surfaces, no harsh outlines, warm hazy volumetric light with visible
> godrays, tiny floating bokeh dust motes catching the light, gentle depth-of-field
> falloff, saturated yet soft pastel palette, cheerful and inviting, no text, no logos,
> no watermarks, no people.

Repeating this clause **identically** is what keeps a set consistent — it is doing the
job a reference image would. Do not paraphrase it between prompts.

---

## Backdrops (5) — 9:16, ship as 576×1024

Every backdrop prompt = the style clause + the room description + this tail:

> Vertical portrait composition, bottom-heavy: the floor and the furniture surfaces
> occupy the lower two-thirds, with framing detail hanging across the very top edge of
> the frame. The room is completely EMPTY — every shelf, table and floor spot is bare,
> with nothing whatsoever standing on it. No objects, no props, no clutter, no
> ornaments. Bare surfaces only.

The "completely EMPTY" sentence is non-negotiable — without it the model populates the
scene and the generated items then collide with painted-in ones.

**Because items must sit pinned on painted surfaces, each backdrop prompt enumerates
its five bare surfaces at explicit positions.** That is what makes drag-to-place
trivial and lets the item read as belonging there.

### 1. `attic` — Cozy Attic
Room: a warm wooden attic under a pitched roof, exposed rough-hewn beams, a round
porthole window in the far gable pouring a dusty sunbeam across the floorboards, faded
floral wallpaper on one knee wall, wide worn floorboards.
Five bare surfaces: a **low wooden crate at far left on the floor**; a **bare
floorboard patch left of centre in the sunbeam**; a **squat three-legged stool at
centre**; an **empty open-fronted shelf nook in the right knee wall at mid height**;
a **bare floorboard patch at right**.
Top framing: cobwebbed roof beams and a hanging bare bulb on a cord across the top edge.

### 2. `kitchen` — Grandma's Kitchen
Room: a cosy cottage kitchen at golden morning hour, cream tongue-and-groove
cabinetry, pale mint tiled splashback, a big window over the sink flooding warm light,
terracotta floor tiles, a scrubbed butcher-block counter running across the room.
Five bare surfaces: an **empty round wooden stool at far left on the floor**; a
**bare stretch of butcher-block counter left of centre**; a **bare enamel trivet at
centre of the counter**; a **bare open shelf on the right wall at mid height**; a
**bare terracotta floor patch at right in front of the cabinets**.
Top framing: a rail of hanging copper pans and a swag of gingham valance across the top edge.

### 3. `greenhouse` — Victorian Greenhouse
Room: the inside of a small Victorian glasshouse, white-painted iron glazing bars,
misted panes with sunlight blooming through, a long weathered potting bench, gravel
floor, lush ferns and trailing vines banked along the back wall in soft focus.
Five bare surfaces: an **upturned empty crate on the gravel at far left**; a **bare
stretch of potting bench left of centre**; a **bare slatted bench top at centre**; an
**empty wire shelf on the right glazing bar at mid height**; a **bare gravel patch at
right**.
Top framing: trailing ivy and hanging baskets of foliage across the very top edge.

### 4. `musicroom` — Music Room
Room: a warm parlour music room at dusk, deep teal wainscot panelling, a worn
persian rug over herringbone parquet, heavy velvet curtains half-drawn on a tall
window with amber lamplight spilling in, a low sideboard along the back wall.
Five bare surfaces: a **bare rug patch at far left**; a **bare stretch of sideboard
top left of centre**; a **bare velvet-topped ottoman at centre**; a **bare wall shelf
at right at mid height**; a **bare parquet patch at right**.
Top framing: a curtain valance and the lower crystals of a chandelier across the top edge.

### 5. `workshop` — Toy Workshop
Room: a snug toymaker's workshop, sawdust-dusted plank floor, a sturdy workbench with
a vice running across the room, a pegboard of hanging hand tools on the back wall in
soft focus, warm bulb string lights, curls of wood shaving on the floor.
Five bare surfaces: a **bare floor patch at far left beside a sawhorse**; a **bare
stretch of workbench left of centre**; a **bare workbench top at centre**; an **empty
cubby shelf on the right wall at mid height**; a **bare floor patch at right**.
Top framing: a string of warm bulbs and hanging tool silhouettes across the top edge.

---

## Items (25) — 1:1 1024×1024, `batch_size: 2`

Every item prompt = the style clause + the object description + this tail:

> A single isolated object, centred, filling the frame, on a pure flat pure-white
> background. Three-quarter view, lit to match a warm interior. No cast shadow on the
> background, no ground plane, no surface beneath it, no backdrop scenery, nothing else
> in frame.

Item art must read as **belonging on its painted surface**, so keep scale plausible and
the base flat — a rounded or floating base will not sit convincingly once pinned.

| hall | key | object prompt fragment |
|---|---|---|
| attic | `rockinghorse` | a small wooden rocking horse, dappled grey with a yarn mane and red painted saddle, curved rockers |
| attic | `globe` | an antique desk globe on a brass meridian and turned wooden base, softly faded ochre and teal continents |
| attic | `teddybear` | a well-loved honey-brown teddy bear sitting upright, one ear patched with gingham fabric, stitched smile |
| attic | `oillamp` | a brass oil lamp with a bulbous clear glass chimney and a warm glowing wick |
| attic | `trunk` | a small domed steamer trunk in oxblood leather with brass corner caps and two buckled straps, lid closed |
| kitchen | `kettle` | a plump copper stovetop kettle with a wooden handle and a small whistle spout |
| kitchen | `pie` | a golden latticed apple pie in a fluted ceramic dish, a wisp of steam rising |
| kitchen | `mixingbowl` | a duck-egg-blue ceramic mixing bowl with a wooden spoon resting in soft cream batter |
| kitchen | `jamjars` | three small glass jam jars with gingham lids and paper labels, filled with red, amber and purple preserve, clustered together |
| kitchen | `cat` | a plump ginger tabby cat curled asleep in a tight circle, tail tucked over its nose |
| greenhouse | `wateringcan` | a tall galvanised watering can with a long brass spout and a rounded carry handle |
| greenhouse | `orchid` | a white moth orchid with three open blooms and a single arching stem, in a glazed cream pot |
| greenhouse | `claypots` | a short stack of four nested terracotta plant pots, the top one tilted, chalky and weathered |
| greenhouse | `trowelgloves` | a wooden-handled garden trowel resting on a folded pair of floral canvas gardening gloves |
| greenhouse | `cloche` | a bell-shaped glass cloche with a brass finial knob, a small green fern curling inside |
| musicroom | `gramophone` | a gramophone with a broad flared brass horn and a walnut base, tone arm resting on the record |
| musicroom | `cello` | a cello standing upright on its endpin, glossy warm amber varnish, bow tucked against the strings |
| musicroom | `metronome` | a pyramid-shaped walnut mechanical metronome, pendulum swung slightly off centre, brass weight |
| musicroom | `sheetmusic` | a loose stack of cream sheet-music pages, gently curled at the corners, the top sheet showing soft indistinct staves and notes |
| musicroom | `accordion` | a small red button accordion, bellows half-drawn, mother-of-pearl buttons and chrome grille |
| workshop | `toytrain` | a chunky wooden toy locomotive in red and green with black wheels and a stubby yellow funnel |
| workshop | `tinrobot` | a boxy retro tin wind-up robot in teal and cream, riveted panels, a brass key in its side, antenna on top |
| workshop | `kite` | a diamond kite in cheerful red and yellow panels with a knotted rag tail, wooden spars, lying at a slight angle |
| workshop | `jackinthebox` | a painted wooden jack-in-the-box, lid sprung open, a grinning harlequin puppet on a coiled spring |
| workshop | `toolbox` | an open wooden carpenter's toolbox with a dowel handle, a saw and two chisels standing in it |

---

## Tooling (already written and tested — `art/tools/`)

Both scripts exist and were verified on 2026-07-28, before any art was generated.

- **`tools/key_white.py`** — the white-keying pipeline. Verified by compositing the
  shipped `snowman` / `bucketspade` / `sled` PNGs back onto flat white at 255, 249 and
  **243** and re-keying: all three recovered cleanly, holes detected, no halo on the
  magenta checkerboard, and the snowman's white body survived (the connectivity pass).
  It reads the background colour from the border and measures *distance from it* rather
  than using an absolute cutoff, which is what makes the 243 case work.
  `python3 key_white.py raw/*.png --outdir ../attic --check`
- **`tools/wire_halls.py`** — registers all 25 items, the 5 halls (`floatPx: 0`) and
  `boardArt` for its level range, writing both twins byte-identically. Verified in a sandbox copy:
  preflight refuses to write when art is missing, output is idempotent, the existing 6
  halls / items / themes are bit-identical afterwards, no duplicate `levelId`, the range
  fully covered, and the generated `.js` evals as a classic script.
  `python3 wire_halls.py --dry-run` then `python3 wire_halls.py`

`wire_halls.py` validates slot **edges**, not widths — `left` is a centre, so a wide
item at `left=88` runs off the picture. It prints each slot's `[l..r]` span and warns on
OFF-FRAME and on same-plane overlap. Expect warnings on the seeds; fix them in the
editor rather than by hand-editing the JSON.

## Post-processing

1. **Key the item PNGs off white locally** — Layer cannot do it. Full recipe (border-
   connected component, enclosed-hole second pass, 2px background dilation, 0.7px
   feather with colour bleed) is in the `layer-ai-white-keying` memory. Check the
   actual corner pixel value before setting the threshold; verify on a **magenta
   checkerboard**, never on white.
2. Crop tight to the alpha bbox, scale the long side to **512** to match `art/shore/`
   and `art/snow/`.
3. Backdrops → **576×1024** (aspect 0.5625), save as `.jpeg` into `art/backdrops/`
   as `cozy-attic.jpeg`, `kitchen.jpeg`, `greenhouse.jpeg`, `music-room.jpeg`,
   `workshop.jpeg`.
4. Items → `art/attic/`, `art/kitchen/`, `art/greenhouse/`, `art/musicroom/`,
   `art/workshop/`, named by the key above.

---

## Data wiring (`collections.json` + `collections.js`)

Both files must be written **byte-identically to what the Collections editor would
produce**: the `.js` twin is a 4-line header + `COLLECTIONS = ` +
`JSON.stringify(COLL, null, 2)`.

Register each item in `COLLECTIONS.items` as
`{ name, file: 'art/<hall>/<key>.png', view: { w, h } }` where `view` is the **actual
pixel size** of the keyed PNG.

Append 5 halls to `COLLECTIONS.halls`, each:

```js
{ id, name, backdrop: 'art/backdrops/<file>.jpeg',
  shadow: true, glow: false, notes: false,
  floatPx: 0,                       // <- the user's "no bob" requirement
  slots: [ { item, levelId, left, bottom, h }, … ] }
```

Level ranges **as shipped**: attic **34–38**, kitchen **39–43**, greenhouse
**44–48**, musicroom **49–53**, workshop **54–58** (the plan's 30–54 shifted +4 for
the Bedroom hall — § 4 below). The `first` level per hall lives in `wire_halls.py`.

Also add `COLLECTIONS.boardArt.cleaningxl` entries for the same levels (**34–58** as
shipped), mirroring the
existing shape `{ item, cx: 0.5, cy: 0.5, h: 0.86–0.96 }`. This **overwrites 38/39/40**
(see the flag at the top).

### Slot geometry — compute, don't guess

- `left` = the item's horizontal **centre** (% of the picture box).
- `bottom` = the item's **base** (`.spot-shadow` is out of flow on backdrop halls, so
  this is genuinely where the art's base sits).
- `h` = height as % of the **picture** box.
- On-screen width % = `h × (1024/576) × (imgW/imgH)`. Easy to overshoot — compute it
  before choosing `h`.

Because each backdrop was prompted with five surfaces at **far left / left-of-centre /
centre / right shelf at mid height / right**, the starting `left` values are roughly
`14 / 33 / 50 / 78 / 88`, with the mid-height shelf slot getting a much larger `bottom`
than its neighbours. Nudge from there in the editor.

### Verify

Open `level-editor/` → **Collections** tab and check placement in the preview at
**both iPhone and iPad** — iPad crops ~38% off the top of a 0.5625 backdrop, so a slot
placed high can vanish. Then play it: the same art appears behind the board
(`board-bg.js`) and as the hall trophy (`home-room.js`).

---

## What actually happened (execution notes, 2026-07-28)

Layer session `9540cf09-6b68-412d-8ed7-b748cc8ad356` (workspace `zynga`), 52 forge
runs, ~420 CU. Two parts of the plan above were wrong.

### 1. The style clause cannot go into the item prompts (the big one)

The clause mandates *"warm hazy volumetric light with visible godrays, tiny floating
bokeh dust motes catching the light"*. On a **backdrop** that is exactly right. On an
**item** it is self-defeating: the model paints cream light shafts and motes onto the
"pure flat pure-white background", and a white key cannot tell a cream godray from a
cream subject. All 25 first-round items keyed into an object plus **large opaque
wedges of leftover background** — nothing like the tight silhouettes in `art/snow/`.

Raising `NEAR_TOL` is not the fix: the wedges are border-connected *and* touch the
subject, so a looser tolerance floods into cream objects (the sheet music, the mixing
bowl's batter) and eats them.

The fix was to regenerate all 25 with the light/mote phrases replaced by **"soft even
lighting with gentle warm highlights"**, plus an explicit background denial list.
Result: border colour went to a flat 255 on 20 of 25 (was 230–255), border spread
0.8–1.5 (was 2–22), and every silhouette came out clean.

**Item style clause — use this, not the one above:**

> Soft stylized 3D render in the art direction of a premium casual mobile puzzle game
> (Royal Match / Gardenscapes): chunky rounded forms with generous bevels, matte
> hand-painted surfaces, no harsh outlines, soft even lighting with gentle warm
> highlights, saturated yet soft pastel palette, cheerful and inviting, no text, no
> logos, no watermarks, no people.

**Item tail — use this, not the one above:**

> A single isolated object, centred, large in frame but fully visible with a small
> even margin of blank background on all four sides so no part is cropped, on a pure
> flat uniform pure-white background, completely blank and featureless. Three-quarter
> view, lit to match a warm interior. No cast shadow on the background, no ground
> plane, no surface beneath it, no backdrop scenery, no light shafts, no godrays, no
> sunbeams, no dust motes, no sparkles, no glow, no vignette, no gradient, no texture
> in the background — the background must be perfectly flat white. Nothing else in
> frame.

Note `"filling the frame"` (the original wording) makes the model run objects off the
edge — 9 of the first 25 were clipped. The margin clause above fixes it. Set-level
consistency is unharmed: the form/material/palette half of the clause is what was
doing that work, and it is still there verbatim. **The backdrops keep the original
clause in full** — godrays are wanted there, and those 5 came out right first time.

Picking between the `batch_size: 2` variants is largely mechanical and worth
scripting: measure (a) the border-connected background fraction — a clean plate is
0.55–0.83, a wedge-ridden one drops to 0.34 — and (b) whether the subject mask
touches a frame edge. Then apply judgement only on subject fidelity, which is where
the metrics are blind: they preferred a *bound booklet* over the loose stack of pages
the `sheetmusic` slot actually calls for.

### 2. The SEED slot geometry puts items in mid-air

`wire_halls.py`'s `SEED` assumes every room painted its five surfaces at the same
`left`/`bottom`. They did not — each backdrop put them somewhere different, and the
two bench/counter seeds (`bottom` 29/30) left items floating in every hall. The
attic's stool landed at **62%**, not the seeded 50%; the music room's ottoman at
**18%**, not 50%.

Reading the real positions is quick: render the backdrop at 576×1024 with a
percentage grid overlaid, read off each surface, then verify by compositing the items
at their slot geometry (`left` = centre, `bottom` = base, `h` = % of picture box) and
looking at it. Two passes got all 25 grounded. The final numbers are in
`collections.json`; `wire_halls.py` still writes the seeds, so **re-running it
reverts the placement.**

### 3. The tablet ceiling is real — and it overrides the painted art

`bottom + h` must stay under **~62%**. See the note now in `CLAUDE.md` §3. This cost
the Toy Workshop its nicest slot: the painted cubby shelf sits at `bottom: 60`, so
the jack-in-the-box's top reached 70% and vanished on a tablet crop. It went on the
floor and the cubby is simply left empty.

### Still open

- Placement is good, not pixel-perfect. `greenhouse/claypots` reads slightly
  floating (the angled bench plank makes a gap illusion) and `greenhouse/orchid` is
  small. Nudge in `level-editor/` → Collections if it bothers you.
- Levels 41–54 are unreachable until the journey grows past 40; halls 9–11 are art
  waiting for levels.
- `boardArt` 38/39/40 overwritten as flagged (was `piano`/`drum`/`violin`).
- No `PROGRESS_VERSION` bump: the 5 halls append, so no `seenHall` /
  `seenInstruments` index shifted. Verified the pre-existing 6 halls, 30 items and
  themes are byte-identical.

### 4. A Bedroom hall took levels 30–33 mid-flight

`collections.*` is generated, so parallel work on it collides. While these 25 items
were rendering, a **Bedroom** hall (levels 30–33, Childhood-style tableau layers) was
pushed to `main` — landing exactly where Cozy Attic was headed.

A `levelId` may live in **one** hall only: `slotLevelIndex` maps id → index and
`boardArt` holds one item per level, so a shared level reveals in two halls with
ambiguous board art. Resolved by shifting these five halls **+4 to 34–58** and
leaving Bedroom on 30–33, since it is reachable inside the 40-level journey and these
mostly are not.

Merging a generated file by hand is a good way to lose someone's work. What worked:
reset `collections.json`/`.js` to the incoming version wholesale, then re-run
`wire_halls.py` (idempotent — it drops these five halls and re-appends) followed by
the geometry pass. Then diff against the incoming version to prove every pre-existing
hall, item and theme is byte-identical and no `levelId` is claimed twice.
