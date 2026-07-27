# Adding a hall (Collections tab)

Open `level-editor/` over HTTP (not `file://`) and pick **Collections**.
It reads `../collections.json`; **Save** writes both that and its `.js` twin.

1. **📂 Grant folder** → choose the `memory-match` folder. Once per session;
   **💾 Save** stays disabled until you do. (Chrome/Edge. Otherwise use
   **⬇ Download** and move both files in yourself.)
2. **+ Add Hall**, then on the right set **Name** and **Backdrop**
   (e.g. `backdrops/my-hall.png`). Leave **CSS theme** as *(none)*.
3. Set the art **Folder** on the left (e.g. `my-hall`), then drop the element
   PNGs on the drop zone. Sizes are read from the file — never typed. With
   folder access granted the files are copied in for you.
4. **+ Slot** per item. Set **Item**, **Level id**, and **Kind**:
   - **placed item** — tight-cropped art you position. Drag it in the preview,
     or type Left / Bottom / Height.
   - **full-scene layer** — art that is a whole canvas with the piece already in
     place. Nothing to position; stacking a hall's layers rebuilds the full
     scene. Needs a `layer` file on the item (see `../childhood/README.md`).
5. **Board Art** — click *use "item"* per level so clearing that level reveals
   the same piece it awards.
6. Check **Validator** is green, then **💾 Save** and reload the game.

## Two things that actually bite

- **Backdrop aspect.** Author near **0.57 w/h** and keep important scenery in the
  lower two thirds. The backdrop is bottom-anchored `cover`, so wide screens crop
  from the top — the hatched band in the preview shows how much, and the
  iPhone / Galaxy / iPad buttons let you check before you commit.
- **Level ids are the join.** A slot's `levelId` is what ties a hall item to its
  board-art reveal and to saved progress. Halls should cover consecutive ids;
  changing them on a shipped hall invalidates existing saves, because
  `progress.seenInstruments` is keyed by level *index*.

Schema and runtime notes: `../CLAUDE.md` §3 "Backgrounds / collectibles".
