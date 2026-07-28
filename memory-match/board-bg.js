// ============================================================
// BOARD BACKGROUND — optional low-poly instrument art that lives BEHIND the
// board. Closed white "?" tiles cover it; the art is revealed through the
// board background — i.e. the gaps between tiles and any broken/cleared/empty
// cell. A white "?" tile never shows art; only the purple/blue board bg does.
//
// One render mode ("option 2"): the whole piece sits BLURRED behind the grid and
// stays blurred everywhere — a cleared cell just goes transparent so the blurred
// image shows through it, so the collectible is legible while you play but never
// sharpens as you clear. (An earlier "option 3" painted a sharp per-cell slice to
// crisp-up cleared cells; that mode was dropped — see git history / the removed
// five-way dev switcher if you want it back.) The blur + empty-cell transparency
// live in CSS; this file just builds/places the behind-grid image. Shared globals
// live in state.js.
//
// DATA: the art registry and the per-level placement both live in
// collections.js (`COLLECTIONS.items` / `COLLECTIONS.boardArt`), which the same
// file also feeds to the home halls — so a level's reveal and its home-screen
// item can't drift apart. Edit via the level-editor, not here.
// ============================================================

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

  // Signature: rebuild the behind-grid <img> only when the level/size change.
  const sig = box ? `${place.item}|${Math.round(BW)}x${Math.round(BH)}` : '';
  if (force || bg.dataset.sig !== sig) {
    bg.dataset.sig = sig;
    bg.innerHTML = '';
    boardEl.classList.toggle('board-has-art', !!box);
    if (box) {
      const img = document.createElement('img');
      img.src = box.item.file;
      img.className = 'board-bg-img';
      img.draggable = false;
      img.style.cssText = `left:${box.left}px;top:${box.top}px;width:${box.w}px;height:${box.h}px`;
      bg.appendChild(img);
    }
  }

  // The art stays BLURRED everywhere — a cleared cell just goes transparent (CSS,
  // .board-has-art) so the single blurred #board-bg image shows through it; it
  // never sharpens as you clear. (The old "option 3" painted a sharp per-cell
  // slice here; that mode was dropped — always-blurred is "option 2".) Any stale
  // per-cell slice from an older build is cleared so a refill leaves no residue.
  boardEl.querySelectorAll('.cell').forEach((cellEl) => {
    if (cellEl.style.backgroundImage) {
      cellEl.style.backgroundImage = '';
      cellEl.style.backgroundSize = '';
      cellEl.style.backgroundPosition = '';
      cellEl.style.backgroundRepeat = '';
    }
  });
}
