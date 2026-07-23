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
// ============================================================

// Instrument art. aspect = viewBox width / height (used to size the art without
// stretching it).
const BG_INSTRUMENTS = {
  guitar:    { file: 'instruments/guitar.svg',    aspect: 220 / 520 },
  saxophone: { file: 'instruments/saxophone.svg', aspect: 300 / 520 },
  trumpet:   { file: 'instruments/trumpet.svg',   aspect: 520 / 300 },
  drum:      { file: 'instruments/drum.svg',      aspect: 460 / 380 },
  violin:    { file: 'instruments/violin.svg',    aspect: 200 / 520 },
  piano:     { file: 'instruments/piano.svg',     aspect: 520 / 420 },
};

// One instrument per level: journey style → level id → placement.
// Placement: { img, cx, cy, h } — cx/cy = centre as a fraction of the board
// (0..1), h = art height as a fraction of board height (clamped to fit the
// width). Set for the first 3 and last 3 XL levels (small 4×6 and large boards).
const LEVEL_BACKGROUNDS = {
  cleaningxl: {
    1:  { img: 'guitar',    cx: 0.5, cy: 0.5, h: 0.96 },
    2:  { img: 'saxophone', cx: 0.5, cy: 0.5, h: 0.94 },
    3:  { img: 'trumpet',   cx: 0.5, cy: 0.5, h: 0.9  },
    38: { img: 'piano',     cx: 0.5, cy: 0.5, h: 0.9  },
    39: { img: 'drum',      cx: 0.5, cy: 0.5, h: 0.9  },
    40: { img: 'violin',    cx: 0.5, cy: 0.5, h: 0.96 },
  },
};

// Current render option: 0 = off, 1/2/3 = modes. Persisted like the device pick.
let bgOption = (function () {
  try { return parseInt(localStorage.getItem('mm_bg_option'), 10) || 0; } catch (e) { return 0; }
})();

function currentLevelBackground() {
  const style = (typeof progress !== 'undefined' && progress.progressionStyle) || 'cleaningxl';
  const lvl = (typeof LEVELS !== 'undefined') ? LEVELS[currentLevelIndex] : null;
  const id = lvl && lvl.id;
  return (LEVEL_BACKGROUNDS[style] && LEVEL_BACKGROUNDS[style][id]) || null;
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
  const inst = BG_INSTRUMENTS[place.img];
  if (!inst) return null;
  let h = place.h * BH;
  let w = h * inst.aspect;
  const maxW = 0.98 * BW, maxH = 0.98 * BH;
  if (w > maxW) { const s = maxW / w; w *= s; h *= s; }
  if (h > maxH) { const s = maxH / h; w *= s; h *= s; }
  return { inst, w, h, left: place.cx * BW - w / 2, top: place.cy * BH - h / 2 };
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
  const sig = box ? `${bgOption}|${place.img}|${Math.round(BW)}x${Math.round(BH)}` : '';
  if (force || bg.dataset.sig !== sig) {
    bg.dataset.sig = sig;
    bg.innerHTML = '';
    boardEl.classList.remove('bg-opt-1', 'bg-opt-2', 'bg-opt-3', 'bg-opt-4');
    if (box && bgOption) {
      boardEl.classList.add('bg-opt-' + bgOption);
      const img = document.createElement('img');
      img.src = box.inst.file;
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
      cellEl.style.backgroundImage    = `url("${box.inst.file}")`;
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
