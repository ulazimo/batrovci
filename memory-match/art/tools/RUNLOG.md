# Scene-layer generation run log — 2026-07-29 (CONVERSION COMPLETE)

All 25 layers generated, verified and wired; `collections.js`/`.json` now carry
`kind: 'layer'` for all five interior halls. Kept as the reproducibility record —
Layer file_ids and inference ids below let any single edit be redone without
re-uploading. The durable findings live in `../SCENE-LAYERS-PLAN.md` and the tool
docstrings; this file is safe to delete once you no longer want the run history.

**33 forge runs, 264 CU.** Redos: attic trunk + rockinghorse, kitchen
kettle/jamjars/cat, musicroom cello x3, workshop kite x4 / toolbox x2 / toytrain.

## Verified Layer parameters (supersede SCENE-LAYERS-PLAN.md § "Layer AI parameters")

- model **`71f83b71-7918-4258-9e79-02d4f69f2b0d` — Gemini 3 Pro Image Edit**.
  The plan's `520f3a09…` "Gemini 3 Pro Image" is **text-to-image only**
  (`session_modes: ["create"]`, no `guidance_file_types`) and cannot edit at all.
- guidance: backdrop as `init` **+ the existing 512px item PNG as
  `editing_reference`**. The second reference is mandatory — with `init` alone the
  diff's primary blob was global drift, not the object, in 2 of 4 test runs.
- `width: 1152, height: 2048` (2x the 576x1024 backdrops, same 9:16), `batch_size: 2`.
- Local upload: `request_file_upload_url` (file_size_bytes must be the EXACT
  `wc -c`) then `layer_upload.sh`, which sends the required
  `x-goog-content-length-range: 0,<size>`.
- Prompt = object_line + CONFINE + INTEGRATE + PRESERVE (see `scene_edits.json`).

## What the plan gets wrong

- Halls are at **levels 15–39**, not 34–58. Commit `bc2a31d` sacked Childhood /
  instruments / animals / coral and renumbered. All five halls are therefore fully
  reachable in the 40-level journey — the plan's "only Attic and part of Kitchen are
  reachable" and CLAUDE.md §3's hall list are both stale.
- The attic's three-legged stool is at **x≈62 (right of centre)**, not x=33 "left of
  centre". Confirmed by the grid and by the shipped slot's `left: 62`.
- The premise "every pixel the model did not touch is still literally the backdrop"
  is **false** — the model re-decodes the whole frame. `spill` lands at 5.3–6.4 on a
  clean edit, so the plan's `spill > 6 = REDO` gate is a false-positive machine.
  Judge by the audit's panel 5 and by `check_hall_layers.py` instead.
- `keep%`/`spill`/`margin` do **not** catch a layer repainting another slot's
  furniture. `check_hall_layers.py` (new) does, via pairwise mask overlap.

## Two more things the plan/tooling got wrong, both now fixed

- **Layer files were 3.2MB each** (80MB for 25). `extract_layer.py` kept RGB across
  the whole canvas and emitted at the *edit's* resolution. Now emits at the
  backdrop's resolution and flattens RGB beyond `BLEED_PX` past the alpha edge:
  **43–179KB each**, same order as a backdrop, with the no-fringe guarantee intact.
- **Mask overlap alone is not a defect.** The kitchen's jam jars and cat share 24.5%
  of a mask and composite *identically* either way, because the shared patch is
  untouched counter that both copied faithfully. `check_hall_layers.py` now decides
  on **order-independence** — composite each pair both ways and measure the
  disagreement inside the intersection — with a `MIN_INTER_PX` floor so two masks
  merely abutting (pie/kettle share a 400px, 10px-tall band and score 40 there from
  their own edge pixels) doesn't read as a conflict.

## Picks — all 25 LANDED in art/<hall>/scene/ and wired

| hall | item | pick | note |
|---|---|---|---|
| attic | rockinghorse | redo ca2654f8 | b occluded the crate → order-dependent vs globe (25.4); redone standing clear of it |
| attic | globe | a | b relocated the crate (61% repaint) — reject |
| attic | teddybear | b | |
| attic | oillamp | a | |
| attic | trunk | **trunk2-b** | first pair repainted the stool AND nook (28.8% share / 11.5 disagreement); the CONFINE clause fixed it |
| kitchen | kettle | **kettle2-b** | first pair's mask ran up the window; redo is compact |
| kitchen | pie | a | |
| kitchen | mixingbowl | a | |
| kitchen | jamjars | **jamjars2-b** | |
| kitchen | cat | **cat2-b** | 24.5% share with jamjars is benign — disagreement 5.5 |
| greenhouse | all five | a | **collision-free first try** — first hall fired with CONFINE |
| musicroom | gramophone, metronome, accordion | a | |
| musicroom | cello | redo-2 a | mask lapped the sideboard (gramophone) and pouf (metronome) — 3 tries |
| musicroom | sheetmusic | b | |
| workshop | tinrobot, jackinthebox | a | |
| workshop | toytrain | redo-1 a | original mask spanned 67% of frame for a one-plank-wide object |
| workshop | kite | redo-4 a | floor band is contested: toytrain left, kite centre, toolbox right |
| workshop | toolbox | redo-2 a | |

musicroom + workshop were extracted with **`--thresh 26`** (auto lands at 14–16).
At auto, every layer's mask swallowed a shared low-energy drift region — the music
room's gold curtain, the workshop's pale pool of floor light — and that shared
region is what made the layers order-dependent. Raising the threshold drops the
drift and keeps the object; verified against `toolbox2-a` that the **contact shadow
survives** (what is lost is thin tendrils tracking the plank seams). No prompt
wording suppressed it. Consequence: their `edge` figures are higher (41–65 vs
25–37) by construction, with no visible seam in-game.

Kitchen and greenhouse: "no collisions, every pair composites the same in either
order". CONFINE is what makes that happen — the two halls fired without it (attic,
kitchen) needed 4 redos between them; greenhouse with it needed none.

## Inference IDs

attic: rockinghorse 6a39ed8b-5dc0-4f75-8166-643cfb13055b, globe
78ebc21e-7b84-4181-9be9-2097a837ae78, teddybear 4659b9c6-2d77-41a8-87e8-85115dc325d8,
oillamp ba21cfa5-a8f6-46aa-9f1b-6aedad92b0da, trunk a4334517-f784-4a55-84d7-34dbf34b68ff,
**trunk redo aeb33779-6a5a-4a6c-b0b3-71a8f4cca801**

kitchen: kettle 1054fdfc-beb3-4221-8488-c21fd41596ae, pie
4cceb237-a0b6-4202-87fd-994750363ae7, mixingbowl e10aac23-afd3-4b10-9f4a-cb719f2fab53,
jamjars 991ac2ad-c6d1-4638-8d85-670d9f98a0cf, cat 3264b55a-1577-4176-bd59-274b77e4d1a0

greenhouse: wateringcan 1d955284-bf19-4b77-9bf3-a5b4ad7b9ca4, orchid
d0e4cd65-de92-4a0e-a417-c37f612d74fb, claypots 3d2b389f-984f-431e-9d92-fe46f623ab99,
trowelgloves 1d1d3754-d895-49db-ac36-f7755f43e44f, cloche ac2dc0a1-ee8a-4d7f-a3d7-1e503dada9d6

## Uploaded file_ids (reusable, no need to re-upload)

backdrops: cozy-attic 9edbbf62-e513-4ccf-9309-38b378019805, kitchen
d4505616-c536-4fcc-850d-f2949570c7a4, greenhouse 379e510a-f906-43ed-88b4-f022173b8203,
music-room 4bacd316-1ae8-4e4f-aca9-713788ebec35, workshop e209bbe1-30ea-4765-9e34-33ed3b3f7e6a

items: rockinghorse 4b693abf-9ae0-4d59-bbff-23eff646d0a2, globe
78cc26e9-fa86-45a8-9369-708b20e758ce, teddybear c4f14735-dbd9-468e-aff9-60047be06032,
oillamp d346ba4e-50a6-42ba-8593-0394d595301d, trunk 2c4c59a5-ec9c-4447-9058-e6f5fcf875cf,
kettle 9c95b6b3-bf2b-430c-935e-a881cb6e542e, pie d241356d-6f06-4461-bd81-4722d5ced822,
mixingbowl c117e8df-d621-4bbd-8142-9a56addfc5ae, jamjars ff92ff51-aed3-4919-a1c5-419d623dd572,
cat 8894622f-167a-440c-b351-ee5844e24aa8, wateringcan 2ce86ad8-69a0-443e-ace0-d59c0da718ab,
orchid 275a1fe9-183b-4940-97e7-5aa3daf3e1a9, claypots 06ffd19c-2302-4bbd-ad96-618771cd270a,
trowelgloves 45c4ab32-5b83-4ca6-8d65-6bcd609d17a4, cloche 0d608087-f53f-436e-a4ac-c8e73290dea5

musicroom + workshop item PNGs were uploaded by the second pass; their ids are in
that run's history rather than here (re-upload is cheap if a redo is needed).

## Verified in-game (not via the editor preview)

The level-editor's Collections preview needs a **granted folder** to resolve art, so
its `#room-backdrop` src stays null over plain HTTP — it cannot verify the art. Use
the real game instead (`http://localhost:3458/memory-match/index.html`, set
`progress.stars` in the console and call `renderHall(i)`). All five halls: 5 slots,
all `spot-layer`, all images loaded, 0 pedestals/shadows, `animationName: none`
(no bob). Only console errors are Firebase referer blocks, unrelated.

**The dev device-switcher cannot test the crop** — it rescales the phone frame purely
in CSS, so all four presets report the same visible fraction. Measured by resizing
the real viewport instead: worst vertical case **75% visible** (highest real object
is workshop/jackinthebox at 70.8%, so nothing clips), and the iPhone frame trims
**~10.4% off each side**, which does clip `attic/globe` (object at x≈5–20%). That
horizontal safe zone is a gap the plan never mentions; see CLAUDE.md §3.

## Remaining known issue

`attic/globe` is cut off on the narrow (iPhone) frame. Pre-existing exposure — the
shipped placed-item slot was also `left: 10` — but no longer nudgeable, so fixing it
means re-firing the globe further from the edge, or moving it to another surface.
