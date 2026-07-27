// ============================================================
// BOARD BACKGROUND — optional low-poly instrument art that lives BEHIND the
// board. Closed white "?" tiles cover it; the art is revealed through the
// board background — i.e. the gaps between tiles and any broken/cleared/empty
// cell. A white "?" tile never shows art; only the purple/blue board bg does.
//
// Driven by the #bg-switcher (Off + 4 render options), mirroring #device-switcher:
//   Option 1 — sharp grayed art revealed on broken cells (+ gaps). Emerges as you clear.
//   Option 2 — same as 1 but blurred (no per-cell highlight).
//   Option 3 — blurred art everywhere + a sharp per-cell reveal on broken cells
//              (the sharp-over-blur reads as a highlight).
//   Option 4 — art only in the GAPS between tiles (empty cells stay covered).
// The behind-grid image layer is used by all options; the sharp per-cell reveal
// is gated to option 3; the opaque empty-cell cover (option 4) lives in CSS.
// Shared globals live in state.js.
//
// DATA: the art registry and the per-level placement both live in
// collections.js (`COLLECTIONS.items` / `COLLECTIONS.boardArt`), which the same
// file also feeds to the home halls — so a level's reveal and its home-screen
// item can't drift apart. Edit via the level-editor, not here.
// ============================================================

// Current render option: 0 = off, 1/2/3/4 = modes. Persisted like the device pick.
// Defaults to 3 (blur + reveal + highlight) so the level's collectible is visible
// behind the tiles during play and progressively revealed as cards clear. NOTE:
// levelWon() gates its whole art-win path on `bgOption > 0`, so a 0 default would
// silently skip the un-blur celebration for every new player.
let bgOption = (function () {
  try {
    const saved = localStorage.getItem('mm_bg_option');
    return saved == null ? 3 : (parseInt(saved, 10) || 0);
  } catch (e) { return 3; }
})();

// Win highlight: briefly un-blur + glow the level's revealed art (called from
// levelWon, and cleared again by startGame). Toggling `.board-win-reveal` on
// #board drives the CSS. Callers guard with `typeof`, so if this goes missing the
// celebration silently stops happening rather than throwing — don't remove it.
function flashBoardArtWin(on) {
  const el = document.getElementById('board');
  if (el) el.classList.toggle('board-win-reveal', !!on);
}

function currentLevelBackground() {
  const style = (typeof progress !== 'undefined' && progress.progressionStyle) || 'cleaningxl';
  const lvl = (typeof LEVELS !== 'undefined') ? LEVELS[currentLevelIndex] : null;
  const id = lvl && lvl.id;
  const byStyle = COLLECTIONS.boardArt[style];
  return (byStyle && byStyle[id]) || null;
}

function setBgOption(n) {
  bgOption = n;
  try { localStorage.setItem('mm_bg_option', n); } catch (e) {}
  document.querySelectorAll('#bg-switcher .bg-btn').forEach(b =>
    b.classList.toggle('active', +b.dataset.bg === n));
  applyBoardBackground(true);
}

// Compute the art's pixel box within the board, preserving aspect and clamping
// so it never overflows the board.
function bgArtBox(place, BW, BH) {
  const item = COLLECTIONS.items[place.item];
  if (!item) return null;
  let h = place.h * BH;
  let w = h * (item.view.w / item.view.h);   // preserve the SVG's viewBox aspect
  const maxW = 0.98 * BW, maxH = 0.98 * BH;
  if (w > maxW) { const s = maxW / w; w *= s; h *= s; }
  if (h > maxH) { const s = maxH / h; w *= s; h *= s; }
  return { item, w, h, left: place.cx * BW - w / 2, top: place.cy * BH - h / 2 };
}

// (Re)build the background for the current board. Called from fitBoard (render/
// resize) and replaceCell (as tiles break). `force` rebuilds the behind-grid
// image layer even if unchanged; otherwise a signature guard avoids reloading
// the <img> (which would flicker) when only cells changed.
function applyBoardBackground(force) {
  if (!boardEl || !COLS || !ROWS) return;

  // The behind-grid image layer (absolute, z-index 0; cells sit above at z 1).
  // MUST be the LAST child: lots of code addresses cells by boardEl.children[i]
  // == board index i, so the layer can't occupy an early index or it shifts them.
  let bg = boardEl.querySelector('#board-bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.id = 'board-bg';
  }
  boardEl.appendChild(bg); // keep it last even if it already existed

  const place = currentLevelBackground();
  const BW = boardEl.clientWidth, BH = boardEl.clientHeight;
  const box = (place && BW > 0 && BH > 0) ? bgArtBox(place, BW, BH) : null;

  // Signature: rebuild the behind-grid <img> only when option/level/size change.
  const sig = box ? `${bgOption}|${place.item}|${Math.round(BW)}x${Math.round(BH)}` : '';
  if (force || bg.dataset.sig !== sig) {
    bg.dataset.sig = sig;
    bg.innerHTML = '';
    boardEl.classList.remove('bg-opt-1', 'bg-opt-2', 'bg-opt-3', 'bg-opt-4');
    if (box && bgOption) {
      boardEl.classList.add('bg-opt-' + bgOption);
      const img = document.createElement('img');
      img.src = box.item.file;
      img.className = 'board-bg-img';
      img.draggable = false;
      img.style.cssText = `left:${box.left}px;top:${box.top}px;width:${box.w}px;height:${box.h}px`;
      bg.appendChild(img);
    }
  }

  // Per-cell sharp reveal (option 3 only): paint each EMPTY cell (cleared/disabled)
  // with its slice of the art so broken cells read sharper than the blurred gaps.
  // Always reset cell backgrounds first so switching options leaves no residue.
  const cell = box ? (BW - BOARD_GAP * (COLS - 1)) / COLS : 0;
  boardEl.querySelectorAll('.cell').forEach((cellEl, i) => {
    const empty = cellEl.classList.contains('cleared-cell') || cellEl.classList.contains('disabled-cell');
    if (box && bgOption === 3 && empty) {
      const r = Math.floor(i / COLS), c = i % COLS;
      const cl = c * (cell + BOARD_GAP), ct = r * (cell + BOARD_GAP);
      cellEl.style.backgroundImage    = `url("${box.item.file}")`;
      cellEl.style.backgroundSize     = `${box.w}px ${box.h}px`;
      cellEl.style.backgroundPosition = `${box.left - cl}px ${box.top - ct}px`;
      cellEl.style.backgroundRepeat   = 'no-repeat';
    } else if (cellEl.style.backgroundImage) {
      cellEl.style.backgroundImage = '';
      cellEl.style.backgroundSize = '';
      cellEl.style.backgroundPosition = '';
      cellEl.style.backgroundRepeat = '';
    }
  });
}

// Reflect the persisted option on the switcher buttons once the DOM is ready.
setBgOption(bgOption);
