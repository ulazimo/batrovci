# Childhood hall assets

Drop the sliced PNGs from the reference scene here. Filenames are referenced by
`home-room.js` (Childhood hall) and `board-bg.js` (`BG_INSTRUMENTS`) — keep them
exact:

| file           | what it is                         | reveal order | level |
|----------------|------------------------------------|:------------:|:-----:|
| `child1.png`   | 1st child (left rope-turner)       | 1            | 1     |
| `child2.png`   | 2nd child (right rope-turner)      | 2            | 2     |
| `jumprope.png` | the jump rope arcing between them  | 3            | 3     |
| `boy.png`      | 3rd child, the jumping boy (center)| 4            | 4     |

Notes:
- **Transparent background PNGs**, trimmed tight to the subject (no extra padding),
  so the composed tableau and the behind-board reveal line up.
- The two rope-turners should face inward; the rope should be sized to span
  between them; the boy sits centered.
- After adding the real slices, adjust the per-item `left/bottom/h` in
  `home-room.js` (the `childhood` hall) to make the scene line up, and the
  `aspect` (natural width/height) in `board-bg.js` `BG_INSTRUMENTS` for each.
