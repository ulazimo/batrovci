// ============================================================
// BOMB AIM — drag-to-place for Baby Bomb (cross) & BIG Bomb (ring)
// Replaces the old tap-then-tap placement. The player presses a bomb
// button and drags onto the board in ONE gesture; a live silhouette of
// the blast shape snaps to the tile under the pointer, so it's obvious
// what will be destroyed before releasing. Drag-only — a plain tap that
// never reaches a valid tile just cancels (no tap-to-place mode).
//
// Works for both the booster-bar bombs and the Bank-It "Place Bomb".
// Shared state & DOM refs live in state.js (loaded first). All files
// share one global namespace — do not redeclare a name.
// ============================================================

// Active aim session, or null when idle.
//   { type:'cross'|'ring', source:{kind:'booster',id}|{kind:'bank'},
//     name, index:-1, pressing }
let bombAim = null;
let bombAimGhostEl = null;
let bombAimSwallowClick = false;

function isBombAiming() { return !!bombAim; }

// The board's own click handler calls this so the synthetic click that
// follows a drop doesn't also fire onCardClick.
function consumeBombClickSwallow() {
  if (bombAimSwallowClick) { bombAimSwallowClick = false; return true; }
  return false;
}
function markBombClickSwallow() {
  bombAimSwallowClick = true;
  setTimeout(() => { bombAimSwallowClick = false; }, 500);
}

function isValidBombCenter(idx) {
  return idx >= 0 && board[idx] && !board[idx].special && !board[idx].locked;
}

// ---- entry points -------------------------------------------------

// pointerdown on a bomb booster button
function startBombBoosterDrag(b, e) {
  if (e) e.preventDefault();
  if (inputLocked || turns <= 0) return;
  if (isBombAiming()) endBombAim(); // clear any stray session
  if (!hasBooster(b.id)) return;
  startBombAim({ type: b.bomb, source: { kind: 'booster', id: b.id }, name: b.name, startEvent: e });
}

// pointerdown on the Bank-It button while a Baby Bomb is ready
function startBankBombDrag(e) {
  if (e) e.preventDefault();
  if (inputLocked || turns <= 0) return;
  if (isBombAiming()) endBombAim();
  startBombAim({ type: 'cross', source: { kind: 'bank' }, name: 'Baby Bomb', startEvent: e });
}

function startBombAim({ type, source, name, startEvent }) {
  if (bombAim) endBombAim();
  bombAim = { type, source, name, index: -1, pressing: true };
  dismissNudge(); clearNudgeTimer(); hideTooltip();
  document.body.classList.add('bomb-aiming');
  boardEl.classList.add('bomb-aim-active');
  boardEl.classList.toggle('bomb-aim-big', type === 'ring');
  markAimButton(source, true);
  createBombGhost(type);
  if (SFX && SFX.booster) SFX.booster();
  showTutorialHint(`Drag onto the board — release to drop the ${name}`);

  document.addEventListener('pointermove',   onBombAimPointerMove, true);
  document.addEventListener('pointerup',     onBombAimPointerUp,   true);
  document.addEventListener('pointercancel', onBombAimPointerUp,   true);

  if (startEvent) { moveGhost(startEvent.clientX, startEvent.clientY); }
}

function endBombAim() {
  if (!bombAim) return;
  document.removeEventListener('pointermove',   onBombAimPointerMove, true);
  document.removeEventListener('pointerup',     onBombAimPointerUp,   true);
  document.removeEventListener('pointercancel', onBombAimPointerUp,   true);
  markAimButton(bombAim.source, false);
  clearBombSilhouette();
  removeBombGhost();
  document.body.classList.remove('bomb-aiming');
  boardEl.classList.remove('bomb-aim-active', 'bomb-aim-big');
  bombAim = null;
}
function cancelBombAim() { endBombAim(); }

// ---- pointer handling --------------------------------------------

function onBombAimPointerMove(e) {
  if (!bombAim || !bombAim.pressing) return;
  moveGhost(e.clientX, e.clientY);
  const idx = bombTileFromPoint(e.clientX, e.clientY);
  bombAim.index = idx;
  renderBombSilhouette(idx);
}

// Drag-only: releasing on a valid tile drops the bomb; anything else
// (off-board, invalid tile, plain tap, cancel) just aborts the aim.
function onBombAimPointerUp(e) {
  if (!bombAim || !bombAim.pressing) return;
  bombAim.pressing = false;

  if (e.type === 'pointercancel') { cancelBombAim(); return; }

  // Resolve the drop tile from where the pointer was actually released.
  const idx = bombTileFromPoint(e.clientX, e.clientY);
  if (boardEl.contains(e.target) || idx >= 0) markBombClickSwallow();

  if (isValidBombCenter(idx)) { commitBombAim(idx); return; }
  cancelBombAim();
}

function commitBombAim(idx) {
  const source = bombAim.source;
  if (source.kind === 'booster') {
    const b = BOOSTERS.find(x => x.id === source.id);
    if (!b || !hasBooster(source.id)) { cancelBombAim(); return; }
    consumeBooster(source.id);
    endBombAim();
    updateBoosterUI();
    detonateBombAt(idx, b.bomb);
  } else if (source.kind === 'bank') {
    bankProgress = 0;
    bankBombPlacement = false;
    endBombAim();
    updateBankProgress();
    detonateBombAt(idx, 'cross');
  } else {
    endBombAim();
  }
}

// ---- geometry & silhouette ---------------------------------------

// Snap a screen point to the nearest live board tile (index), or -1 if
// the point is well outside the board.
function bombTileFromPoint(x, y) {
  const rect = boardEl.getBoundingClientRect();
  const pad = 36;
  if (x < rect.left - pad || x > rect.right + pad || y < rect.top - pad || y > rect.bottom + pad) return -1;
  let best = -1, bestD = Infinity;
  const kids = boardEl.children;
  for (let i = 0; i < kids.length; i++) {
    if (!board[i]) continue; // skip disabled / cleared slots
    const r = kids[i].getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function clearBombSilhouette() {
  boardEl.querySelectorAll('.bomb-aim-cell, .bomb-aim-center, .bomb-aim-invalid')
    .forEach(el => el.classList.remove('bomb-aim-cell', 'bomb-aim-center', 'bomb-aim-invalid'));
}

function renderBombSilhouette(idx) {
  clearBombSilhouette();
  if (idx < 0 || !bombAim) return;
  const valid = isValidBombCenter(idx);
  const cells = [idx, ...getRevealPattern(bombAim.type, idx)];
  [...new Set(cells)]
    .filter(i => i >= 0 && board[i] !== null && boardEl.children[i])
    .forEach(i => {
      const cell = boardEl.children[i];
      cell.classList.add('bomb-aim-cell');
      if (i === idx) {
        cell.classList.add('bomb-aim-center');
        if (!valid) cell.classList.add('bomb-aim-invalid');
      }
    });
}

// ---- button highlight & drag ghost -------------------------------

function markAimButton(source, on) {
  let btn = null;
  if (source.kind === 'booster') btn = boosterBar.querySelector(`.booster-btn[data-booster="${source.id}"]`);
  else if (source.kind === 'bank') btn = document.getElementById('bank-btn');
  if (btn) btn.classList.toggle('aiming', on);
}

function createBombGhost(type) {
  removeBombGhost();
  const g = document.createElement('div');
  g.className = 'bomb-drag-ghost';
  g.textContent = type === 'ring' ? '💥' : '💣';
  document.body.appendChild(g);
  bombAimGhostEl = g;
}
function moveGhost(x, y) {
  if (!bombAimGhostEl) return;
  bombAimGhostEl.style.left = x + 'px';
  bombAimGhostEl.style.top = (y - 46) + 'px';
  bombAimGhostEl.classList.add('visible');
}
function removeBombGhost() { if (bombAimGhostEl) { bombAimGhostEl.remove(); bombAimGhostEl = null; } }
