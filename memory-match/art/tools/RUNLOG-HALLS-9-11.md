# Halls 9–11 run log — Cosy Library / Artist's Studio / Sewing Room

**DONE 2026-07-29.** Art generated, 15 layers extracted, all three halls pass
`check_hall_layers.py`, wired into `collections.json`/`.js` by
`add_halls_9_11.py`, verified in the real game. Levels **40–54**.

**None of the three reveals anything yet.** They were wired when `cleaningxl` ran
to 41 levels, and the level rebuild landing in the same push cut it back to **35**,
so Toy Workshop now shows only its first slot and halls 9–11 show nothing. Verified
that this degrades gracefully rather than breaking: `slotLevelIndex` returns −1, the
spot is absent, the hall renders, nothing throws. `boardArt` 36–41 are orphaned and
deliberately left in place — inert, and correct again the moment those levels exist.
Re-run `add_halls_9_11.py` after authoring levels 42+ to fill in the rest.

Follows the recipe verified in `RUNLOG.md` (halls 4–8), not the stale one in
`NEW-HALLS-PLAN.md`. Kept as the reproducibility record: the file_ids and
inference ids below let any single edit be redone without re-uploading anything.

**21 forge runs, 168 CU** (15 first-pass + 6 redos). One run died on
`Workflow Timeout` and cost nothing.

## What shipped

| hall | item | level | pick | extract thresh |
|---|---|---|---|---|
| library | readinglamp | 40 | b | 26 |
| library | bookstack | 41 | **redo-a** (first run timed out) | 26 |
| library | inkwell | 42 | a | 26 |
| library | hourglass | 43 | b | 26 |
| library | telescope | 44 | **redo-b** | 26 |
| artstudio | palette | 45 | a | auto (14) |
| artstudio | paintpots | 46 | **redo-b** | auto (14) |
| artstudio | brushjar | 47 | **redo3-a** (3rd firing) | 26 |
| artstudio | claybust | 48 | a | **34** |
| artstudio | easel | 49 | a | auto (14) |
| sewingroom | yarnbasket | 50 | a | 26 |
| sewingroom | sewingmachine | 51 | a | 26 |
| sewingroom | pincushion | 52 | a | 26 |
| sewingroom | threadspools | 53 | **redo-a** | 26 |
| sewingroom | quiltstack | 54 | a | 26 |

Layers are 19–120KB each. Every prompt that had to be re-fired carries a `_v1` /
`_v2` note in `scene_edits.json` saying what it said before and why it moved —
read those before touching a line.

## The thresholds are per hall, and they matter more here than in halls 4–8

`--thresh` auto-lands at 14. That is right for the **artstudio** (margins 17–107×
at auto) but wrong for the other two: both the library (godrays + a hazy window
wall) and the sewing room (a lace curtain and a blown-out window) carry a
low-energy drift region big enough to beat the object. At auto, library margins
were 1.2–2.5× with tight crops running the full 512px canvas height — the drift,
not the item. At **26** the same edits give clean objects and 14–223× margins.
Two items needed their own value:

- **claybust at 34.** At 26 its mask still swallowed the paint-splattered stool's
  legs, which made it collide with the brushjar (share 23.6%, disagreement 51.8).
  At 34 the legs drop out and the pair goes to 0.0% overlap. The bust's contact
  shadow on the seat survives — checked at 3× native, no seam, despite this being
  the hall's worst `edge` figure (67.7).
- Nothing needed a value below 26 except the artstudio.

## Collisions found and how each was actually fixed

`check_hall_layers.py` earned its keep again: the library passed first try (0.0%
overlap on all ten pairs) and the sewing room passed once threadspools moved, but
the artstudio needed three rounds.

1. **easel ↔ brushjar** (25.7%, 49.4) and **easel ↔ paintpots** (15.6%, 80.8).
   The trestle table runs the full width in the foreground and everything stands
   on it, so the easel — the biggest object — fought both neighbours. Raising the
   threshold did nothing: the easel's mask *is* the easel (37–64%), not a shadow
   halo. Moving the pots into the compartment's right half killed the second
   collision. Moving the brushjar killed the first.
2. **Re-firing the easel left (32–52%) made things worse, not better.** Both
   variants came back with a **hole punched through the canvas** — the blank
   canvas matched the pale wall behind it closely enough that the diff never saw
   it, and `extract_layer.py`'s hole-fill did not close it because the gap reaches
   the mask boundary. keep% jumped to 10–11%. The original easel was kept. If you
   ever need to move it, expect this: a large flat pale object against a large
   flat pale wall is the one shape this pipeline cannot detach reliably.
3. **brushjar ↔ claybust** appeared only after the brushjar moved to the table's
   far left (both then claimed the stool region). Fixed by the claybust threshold
   above, not by another firing.

## The crop, and where this pass still loses

All 15 objects top out at **≤57%** of picture height (target: under 60), so
nothing is at risk from the iPad's top trim. Horizontally, twelve of fifteen sit
inside the iPhone frame's visible 10.4–89.6% band. Three do not:

| layer | object x | alpha outside the phone's band |
|---|---|---|
| sewingroom/quiltstack | 0.3–30% | 28% (left) |
| library/telescope | 4.7–23% | 11% (left) |
| artstudio/palette | 58–95% | 11% (right) |

All three are **surface-bound, not prompt-bound**: the wicker stool is at x 3–30%,
the library's window bench at x 0–29%, and the artstudio's table right end runs to
the frame. The telescope was re-fired once for this (the first pair sat on the
upright *cushion*, reached 90% of picture height and was worse); the quilts were
re-fired onto the shelf unit's lower compartment and came back x 71–96%, i.e. the
same defect mirrored, because that compartment runs off the right edge. Reverted.
The shipped halls do the same thing — `attic/globe` is clipped harder than any of
these — and in the frame it reads as framing rather than damage. **Do not re-fire
these three expecting a win; the room's furniture is the constraint.**

Two prompt lessons worth keeping:

- A percent-of-width window works, but **bracket it from both sides**. "at its far
  LEFT end … between 13% and 27%" was read as *far left*: x 0–25%. Adding "no part
  of it may reach left of 20%" landed it at 16–38%.
- Naming a **landmark** for a height ceiling beats a number ("below the top edge of
  the closed cabinet doors", "below the hem of the lace curtain"). Every tall item
  that used one came in under its ceiling first try.

## Reusable Layer file_ids — do NOT re-upload

backdrops (v2): library `59d670a5-c39e-48cc-9e34-64f607704393`, artstudio
`9da8c1bd-d7a1-4346-b35c-8c213edc821b`, sewingroom
`0d0b15d5-62c3-4779-8178-d8b73d9946eb`

items: readinglamp `b37b78ce-faea-4b40-a340-756c0329c855`, bookstack
`c61ec2b3-a4f4-49fb-84f9-b78bfb245f36`, inkwell
`7ac1020a-4465-4571-9443-eb7023843afb`, hourglass
`4183ed6d-3557-4dbf-8f46-bfce740afde9`, telescope
`5c400e89-877d-4d21-a2ab-a0b298e75098`, palette
`8328e4b4-42d3-4056-8073-2d7873c5c90e`, paintpots
`b9aa65f6-c2cb-4b98-b543-3e1bfd750041`, brushjar
`940bebd8-7a67-4520-815e-04b0e6cd5200`, claybust
`9453b946-964e-4907-8971-464fe477a9eb`, easel
`1be21c3d-6a3b-4a61-87c5-8ff47ac210cc`, yarnbasket
`2116bbb5-ee06-44c9-b753-653fadb99d7b`, sewingmachine
`a58f517b-5568-410e-a60a-5fb599cf20bc`, pincushion
`eee00b48-a588-4b40-be73-dc687bbf3e3d`, threadspools
`1d56b0d1-c278-4b4e-8684-ca6f668da153`, quiltstack
`24e44dd8-5854-4a09-9043-2f7d6e7df37e`

**Upload gotcha, cost 3 attempts:** in zsh, `$path` is bound to `$PATH`, so
`while read ... path` **wipes PATH** and every command in the loop dies with
"command not found". Name the loop variable anything else.

## Inference ids

first pass — library: readinglamp `c08d995e-eabb-4802-956f-358c9a33fb27`,
bookstack `d4060900-d609-4312-a82d-fafbcbf79dc4` (**FAILED, Workflow Timeout**),
inkwell `8aa2d48f-06c7-4beb-a73d-553f1fb98543`, hourglass
`03dff225-c785-4815-99de-7de813cf2f61`, telescope
`668b7e16-658f-4d87-b4d6-97d4723cd575`

first pass — artstudio: palette `3a64ad91-6069-4e13-94fa-981b0929d3d8`, paintpots
`ea2c5d55-4272-4d62-a55d-e9d75862e500`, brushjar
`cfe3d50b-d90f-424e-be05-8fc42b4ce4e5`, claybust
`7b936c21-6f20-4645-a433-44e229752f85`, easel
`c2f94cee-b5a6-4a4d-bff6-0e15a7896a73`

first pass — sewingroom: yarnbasket `59d2a0c2-3f1b-4857-b8ce-2ab557a051ac`,
sewingmachine `bd43a14c-c10b-4509-9bcc-a5919f3c2778`, pincushion
`b3bd408d-64cb-45ef-b177-0ff94fa8f225`, threadspools
`69610db3-8dcb-43c1-bb5a-454d8421cca0`, quiltstack
`ebdcaf34-6728-4d85-8014-446377ddd194`

redos: bookstack-2 `b276982e-8a6c-4724-8090-b84a09e1aac3` (**shipped**),
telescope-2 `18e827a3-ebe2-436c-8483-e492993518e0` (**shipped**),
threadspools-2 `cae83459-c314-4f55-87ff-21901412c192` (**shipped**),
brushjar-2 `8836c276-a0dd-4b28-9b5b-77466f47652c` (overshot left),
paintpots-2 `38dbabcd-e085-4f17-82c3-7f29fa6cdf7c` (**shipped**),
easel-2 `ee2b5e32-bfdd-46ab-9669-38f9b07d2109` (holed canvas — rejected),
brushjar-3 `c5d72407-f764-4431-8ccd-8585ed865073` (**shipped**),
quiltstack-2 `a975fa7a-70dd-48e0-b023-e161a9e664a3` (clipped right — rejected)

## Verified in-game

`http://localhost:3458/memory-match/index.html`, with `slotLevelIndex` temporarily
stubbed so all five slots of each hall draw at once (levels 42–54 do not exist, so
they would otherwise never reveal). All three halls: 5 `spot-layer` spots, every
`<img>` loaded at 576×1024, **0 pedestals, 0 shadows, `animationName: none`** (no
bob). `boardArt` for levels 40 and 41 loads its 512px PNG behind the board.
Only console errors are the usual Firebase referer blocks.

Note the **dev device-switcher still cannot test the crop** — it rescales the phone
frame with CSS `zoom`, so `#room-pedestals` reports 100% visible at every preset.
The numbers in "The crop" above come from measuring each layer's alpha against the
10.4/89.6% band directly, which is the only reliable way.
