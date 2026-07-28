# Childhood hall assets

The Childhood hall is the one **full-scene tableau** hall: a jump-rope scene that
assembles piece-by-piece as levels 1–4 are won. Nothing here is referenced by an
engine file — every path is data in `../../collections.js` (+ its `.json` twin),
authored through the level-editor's Collections tab.

Each piece exists **twice**, because it is used in two places:

| file | `scene/` twin | what it is | level |
|------|---------------|------------|:-----:|
| `child1.png`   | `scene/child1.png`   | 1st child (left rope-turner)         | 1 |
| `child2.png`   | `scene/child2.png`   | 2nd child (right rope-turner)        | 2 |
| `jumprope.png` | `scene/jumprope.png` | the jump rope arcing between them    | 3 |
| `boy.png`      | `scene/boy.png`      | 3rd child, the jumping boy (centre)  | 4 |

- The **root** PNG is the item's `file` — trimmed tight to the subject. It is the
  art revealed **behind the board** (`board-bg.js`), which scales it by
  `item.view` (its pixel size, read from the file by the editor — never typed).
- The **`scene/`** PNG is the item's `layer` — a *full 480×720 canvas* with the
  piece already at its final position. Childhood's slots are `kind: 'layer'`, so
  the hall draws this one cover-cropped to fill the picture box
  (`home-room.js` → `slotArt()`), and stacking all four reproduces `final.png`.
  **There is no `left`/`bottom`/`h` to tune** — position is baked into the canvas.
  That only lines up because the layers share the backdrop's aspect ratio and the
  same cover geometry, which `syncBackdropBox()` guarantees.

Also here:
- `background.jpeg` — the hall `backdrop` (the garden plate, no figures).
- `final.png` — the composed reference scene. **Authoring aid only**, not shipped
  to the game; nothing in `collections.js` points at it.

Adding or replacing a piece:
- **Transparent PNGs.** The root crop tight to the subject; the `scene/` twin the
  full canvas at the backdrop's aspect, with the piece where it belongs.
- The two rope-turners face inward, the rope spans between them, the boy is centred.
- Register it in the Collections tab (drop the file on the item registry, then set
  the slot's Kind to *full-scene layer*) rather than hand-editing `collections.js` —
  the file is generated and hand-edits get overwritten.

Schema and the `layer` vs placed-item distinction: `../../CLAUDE.md` §3.
