// ============================================================
// BOARD — card model, render, board UI, chain indicators, peek
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

// ============================================================
// CARD HELPERS
// ============================================================
function randomColor() { return ACTIVE_COLORS[Math.floor(Math.random() * ACTIVE_COLORS.length)]; }
function createCard(i) { return { color: randomColor(), flipped: false, special: null, index: i, locked: false }; }

// Build a color assignment for `n` cards where every color used appears at least
// 3 times — so a clear-all (no-refill) board is always fully clearable with perfect
// play (any count >=3 decomposes into chains of 3+; counts of 1 or 2 can never clear).
function generateClearableColors(n, colors) {
  const m = Math.max(1, Math.min(colors.length, Math.floor(n / 3)));
  const counts = new Array(m).fill(Math.floor(n / m));
  const rem = n - counts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < rem; i++) counts[i]++;
  const arr = [];
  for (let i = 0; i < m; i++) for (let k = 0; k < counts[i]; k++) arr.push(colors[i]);
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// Cleaning journey: build the refill deck as `count` colors spread evenly across all
// active colors, then shuffled. Drawn one-per-cleared-slot in placeNewCards.
function buildDeck(count, colors) {
  const d = [];
  for (let i = 0; i < count; i++) d.push(colors[i % colors.length]);
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

// Assign board colours so every color-lock's required colour is COLLECTABLE from the free
// (never-locked) cells — otherwise a lock could never be opened. The required colours are
// placed into free cells FIRST (rounded up to a full 3-chain each so they can actually be
// collected), then the rest of the board (leftover free cells + ice/color-lock cells) is
// filled with a clearable spread. Called from startGame whenever there are color locks (and
// reused for the normal clear-board re-roll when there are none). Reads iceCellArea /
// colorLockCellArea (which startGame has already populated) to know which cells are locked.
function assignBoardColorsForLocks() {
  const lvl = LEVELS[currentLevelIndex];
  const fillable = board.map((c, i) => (c && !c.special) ? i : -1).filter(i => i >= 0);
  if (!fillable.length) return;
  const isLocked = i => iceCellArea.has(i) || colorLockCellArea.has(i);
  const freeCells = fillable.filter(i => !isLocked(i));
  const lockedCells = fillable.filter(isLocked);
  const clearBoard = !!(lvl && lvl.clearBoard);

  // How many of each colour must sit in the free cells for its lock(s) to open. Rounded up to
  // a multiple of 3 (and ≥3) so the free cards can be collected via normal 3+ chains.
  const placeNeed = {};
  colorLockAreas.forEach(a => {
    if (!a.color || a.count <= 0) return;
    const req = Math.max(3, Math.ceil(a.count / 3) * 3);
    placeNeed[a.color] = Math.max(placeNeed[a.color] || 0, req);
  });
  const totalNeed = Object.values(placeNeed).reduce((s, v) => s + v, 0);
  if (totalNeed > freeCells.length) {
    console.warn(`[color-lock] Level ${lvl && lvl.id}: needs ${totalNeed} free cards to guarantee every lock opens, but only ${freeCells.length} free cells exist — some locks may be hard or impossible to open.`);
  }

  // Base colour multiset for the whole board (clearable spread for clear-board levels).
  const pool = clearBoard ? generateClearableColors(fillable.length, ACTIVE_COLORS) : fillable.map(() => randomColor());
  const avail = {}; ACTIVE_COLORS.forEach(c => avail[c] = 0);
  pool.forEach(c => { avail[c] = (avail[c] || 0) + 1; });

  // Make sure the pool actually contains placeNeed[X] of each X — convert spare cards from the
  // most abundant colour (never dropping a colour below its own requirement).
  Object.keys(placeNeed).forEach(color => {
    while ((avail[color] || 0) < placeNeed[color]) {
      let donor = null, best = 0;
      ACTIVE_COLORS.forEach(c => {
        if (c === color) return;
        if (avail[c] - 1 >= (placeNeed[c] || 0) && avail[c] > best) { donor = c; best = avail[c]; }
      });
      if (!donor) break; // can't satisfy without breaking another requirement
      avail[donor]--; avail[color] = (avail[color] || 0) + 1;
    }
  });

  const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const takeAny = () => { for (const c of shuffle([...ACTIVE_COLORS])) if (avail[c] > 0) { avail[c]--; return c; } return ACTIVE_COLORS[0]; };

  // Place the required colours into free cells first, then fill the rest.
  const reqQueue = shuffle(Object.keys(placeNeed).flatMap(c => Array(placeNeed[c]).fill(c)));
  const assign = {};
  let qi = 0;
  shuffle([...freeCells]).forEach(idx => {
    while (qi < reqQueue.length) {
      const c = reqQueue[qi++];
      if (avail[c] > 0) { avail[c]--; assign[idx] = c; return; }
    }
    assign[idx] = takeAny();
  });
  lockedCells.forEach(idx => { assign[idx] = takeAny(); });
  fillable.forEach(idx => { if (assign[idx] != null) board[idx].color = assign[idx]; });
}

// Show progress in the header (Cleaning levels reuse the "Target" slot). The Cleaning
// journey has a finite refill deck → show how many refills remain. Cleaning XL has no
// deck (the deck is baked into a bigger board) → show how many cards are left to clear.
function updateDeckHUD() {
  const lvl = LEVELS[currentLevelIndex];
  if (!lvl?.clearBoard) return;
  const lbl = document.getElementById('target-label');
  if (lvl.deck) {
    if (lbl) lbl.textContent = 'Deck';
    if (targetEl) targetEl.textContent = deck.length;
  } else {
    if (lbl) lbl.textContent = 'Left';
    if (targetEl) targetEl.textContent = board.filter(c => c && !c.special).length;
  }
}

// ============================================================
// COLLECTION — a "graveyard" stack of tiles cleared/bombed this level.
// Shown top-left on Cleaning levels; toggled by the `collectionTray` rule.
// ============================================================
let collectionStack = [];
function collectionEnabled() { return !!LEVELS[currentLevelIndex]?.clearBoard && getRule('collectionTray'); }
function initCollection() { collectionStack = []; updateCollectionVisibility(); renderCollection(); }
function updateCollectionVisibility() {
  const el = document.getElementById('stat-collection');
  if (el) el.style.display = collectionEnabled() ? 'block' : 'none';
}
function addToCollection(color) {
  if (!collectionEnabled() || !color) return;
  collectionStack.push(color);
  renderCollection(true);
}
function renderCollection(pop) {
  const wrap = document.getElementById('collection-stack');
  if (!wrap) return;
  const recent = collectionStack.slice(-4); // show the last few on the pile
  const tiles = recent.map((c, i) => `<span class="collection-tile" style="background:${cssColor(c)};--i:${i}"></span>`).join('');
  wrap.innerHTML = `<span class="collection-pile">${tiles}</span><span class="collection-count">${collectionStack.length}</span>`;
  if (pop) { const top = wrap.querySelector('.collection-tile:last-of-type'); if (top) top.classList.add('just-collected'); }
}

function createLockedCard(i) { return { color: randomColor(), flipped: false, special: null, index: i, locked: true }; }
function createSpecialCard(i, type, bombColor) { SFX.pop(); return { color: null, flipped: false, special: type, index: i, bombColor: bombColor || null }; }
function isBombType(type) { return ['cross','ring','diamond'].includes(type); }
function toRC(i) { return { r: Math.floor(i / COLS), c: i % COLS }; }
function toIndex(r, c) { return (r < 0 || r >= ROWS || c < 0 || c >= COLS) ? -1 : r * COLS + c; }

function getRevealPattern(type, index) {
  const spec = getSpecialType(type);
  if (!spec || !spec.offsets) return [];
  const { r, c } = toRC(index);
  let targets = spec.offsets.map(([dr,dc]) => toIndex(r+dr, c+dc)).filter(i => i >= 0);
  // For peek, randomly pick revealCount from the targets
  if (spec.revealCount && targets.length > spec.revealCount) {
    for (let i = targets.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [targets[i],targets[j]]=[targets[j],targets[i]]; }
    targets = targets.slice(0, spec.revealCount);
  }
  return targets;
}

function specialIcon(t) { const s = getSpecialType(t); return s ? s.icon : '?'; }
function specialCSS(t)  { return 'special-' + t; }

// Break one lock layer on a locked tile — used by adjacent-combo clears AND bomb blasts.
// Decrements lockCount, ticks the breakLocks goal, updates the counter badge, and fully
// unlocks (honouring revealOnUnlock) when the last layer breaks. Returns true if it unlocked.
function breakLockLayer(idx) {
  const card = board[idx];
  // Ice / color-locks are `locked` internally but must NOT be broken by adjacent combos or
  // bombs — they only clear via their own collection condition. Skip them here.
  if (!card || !card.locked || card.iced || card.colorLocked) return false;
  card.lockCount = (card.lockCount || 1) - 1;
  if (levelGoals?.progress?.breakLocks) levelGoals.progress.breakLocks.broken++;
  const el = getCardEl(idx);
  // Layers remain → stay locked, tick the counter down with a crack.
  if (card.lockCount > 0) {
    if (el) {
      const lc = el.querySelector('.lock-count');
      if (lc) lc.textContent = card.lockCount;
      el.classList.add('lock-crack');
      el.addEventListener('animationend', () => el.classList.remove('lock-crack'), {once:true});
    }
    return false;
  }
  // Final layer broken → fully unlock.
  card.locked = false;
  if (el) {
    const lc = el.querySelector('.lock-count');
    if (lc) lc.remove();
    el.classList.remove('locked');
    el.classList.add('unlocking');
    el.addEventListener('animationend', () => el.classList.remove('unlocking'), {once:true});
    el.style.pointerEvents = '';
    // Reveal on unlock setting
    if (getRule('revealOnUnlock')) {
      card.flipped = true;
      el.classList.add('flipped', 'reveal-flash');
      el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true});
      setTimeout(() => { card.flipped = false; el.classList.remove('flipped'); }, 1500);
    }
  }
  return true;
}

// Break one lock layer for EACH collected card orthogonally adjacent to a locked tile.
// A locked tile next to 3 cleared cards loses 3 layers (extra hits past 0 are no-ops).
// Shared by combo clears (turn.js) and bomb blasts (bank.js).
function breakAdjacentLocks(collectedIndices) {
  collectedIndices.forEach(idx => {
    const { r, c } = toRC(idx);
    [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr, dc]) => {
      const adj = toIndex(r + dr, c + dc);
      if (adj >= 0 && board[adj] && board[adj].locked) breakLockLayer(adj);
    });
  });
}

// Physical cards still on the board, counting a stacked tile as all its hidden layers.
function countBoardCards() {
  return board.reduce((s, c) => s + (c && !c.special ? (c.stack > 1 ? c.stack : 1) : 0), 0);
}

function buildCardHTML(card) {
  const i = card.index;
  // Iced / color-locked cards are `locked` internally (so every interaction guard skips them)
  // but must NOT show the 🔒 lock visual — their overlay conveys the frozen/locked state.
  const lockedCls = (card.locked && !card.iced && !card.colorLocked) ? ' locked' : '';
  if (card.special) {
    const bombStyle = card.bombColor ? ` style="--bomb-color:${cssColor(card.bombColor)}"` : '';
    const bombCls = card.bombColor ? ' bomb-colored' : '';
    const imgPath = specialBadgeImage(card.special);
    const iconHTML = imgPath
      ? `<img class="special-icon-img" src="${imgPath}" alt="${card.special}">`
      : `<span class="special-icon">${specialIcon(card.special)}</span>`;
    return `<div class="card special${bombCls}" data-index="${i}"${bombStyle}><div class="card-face card-back"></div><div class="card-face card-front ${specialCSS(card.special)}">${iconHTML}</div></div>`;
  }
  const markedCls = card.marked ? ' marked' : '';
  const orderedCls = card.ordered ? ' ordered' : '';
  const markedBadge = card.marked ? '<span class="marked-badge">⭐</span>' : '';
  const orderedNum = card.ordered ? `<span class="ordered-number">${card.ordered}</span>` : '';
  // Multi-lock counter: how many more breaks are needed (only shown when >1). Not for ice/color-lock.
  const lockBadge = (card.locked && !card.iced && !card.colorLocked && card.lockCount > 1) ? `<span class="lock-count">${card.lockCount}</span>` : '';
  // NOTE: stacked-tile visuals (count badge + "more below" hint) live on the .cell, not the
  // .card — the card flips (rotateY) when revealed, which would flip/hide them. See decorateStack.
  return `<div class="card${lockedCls}${markedCls}${orderedCls}" data-index="${i}">${orderedNum}<div class="card-face card-back"></div><div class="card-face card-front ${card.color}"><img src="blocks/block_${card.color}_1.png" alt="${card.color}"></div>${markedBadge}${lockBadge}</div>`;
}

// Stacked tiles re-seeded during the current collect (by flyCardsToGoal). The underneath
// card is shown the instant the top starts flying, so the slot never blinks empty; placeNewCards
// then skips these. Cleared each turn in finishTurn.
let stackReseededSlots = new Set();

// Reveal the next card of a stacked tile in-place, carrying the decremented count. Called from
// flyCardsToGoal right after the top card's fly-clone is captured, so it appears immediately
// (face-down, no drop animation). Returns true if `idx` was a stack. Fully depleted tiles
// (stack would drop to <2) still get a fresh card here — the badge/hint just vanish.
function reseedStackTile(idx) {
  const c = board[idx];
  if (!c || !(c.stack > 1)) return false;
  const next = createCard(idx);
  next.stack = c.stack - 1;
  board[idx] = next;
  replaceCell(idx);
  stackReseededSlots.add(idx);
  // Juice: the top card just flew off — pop the new count and let the pile settle.
  const cell = boardEl.children[idx];
  if (cell) {
    const badge = cell.querySelector('.stack-count');
    if (badge) { badge.classList.add('stack-pop'); badge.addEventListener('animationend', () => badge.classList.remove('stack-pop'), {once:true}); }
    const cardEl = cell.querySelector('.card');
    if (cardEl) { cell.classList.add('stack-settle'); cardEl.addEventListener('animationend', () => cell.classList.remove('stack-settle'), {once:true}); }
  }
  return true;
}

// Stacked-tile decoration on the CELL (not the flipping card): a square count badge in the
// top-right + the offset "sheets" hint (via .cell.stacked in CSS). Idempotent — safe to call
// on every render/replace; removes the decoration when the tile is no longer a stack.
function decorateStack(cell, card) {
  cell.classList.remove('stacked');
  const old = cell.querySelector('.stack-count');
  if (old) old.remove();
  if (card && card.stack > 1) {
    cell.classList.add('stacked');
    const badge = document.createElement('span');
    badge.className = 'stack-count';
    badge.textContent = card.stack;
    cell.appendChild(badge);
  }
}

// Elevator decoration on the CELL (not the flipping card). Each elevator AREA is drawn as
// one continuous region: a shared tint bridges the gaps between same-area neighbours, and a
// border is drawn only on the area's outer edges (edge-detection against same-area cells).
// A centered "⬆N" badge shows that area's remaining batch refills while a slot is empty;
// with no refills left an empty slot reads as depleted. Idempotent.
const ELEV_DIRS = [['top', -1, 0], ['right', 0, 1], ['bottom', 1, 0], ['left', 0, -1]];
function decorateElevator(cell, i) {
  const oldFill = cell.querySelector('.elevator-fill');
  if (oldFill) oldFill.remove();
  const old = cell.querySelector('.elevator-badge');
  if (old) old.remove();
  cell.classList.remove('elevator-cell', 'elevator-depleted',
    'elev-edge-top', 'elev-edge-right', 'elev-edge-bottom', 'elev-edge-left',
    'elev-join-top', 'elev-join-right', 'elev-join-bottom', 'elev-join-left');
  const area = elevatorCellArea.get(i);
  // No area, or the area is spent (no refills left) → show nothing: the elevator visual
  // disappears once it can no longer produce cards.
  if (!area || area.refillsLeft <= 0) return;
  cell.classList.add('elevator-cell');
  const { r, c } = toRC(i);
  ELEV_DIRS.forEach(([name, dr, dc]) => {
    const j = toIndex(r + dr, c + dc);
    const sameArea = j >= 0 && elevatorCellArea.get(j) === area;
    cell.classList.add(sameArea ? 'elev-join-' + name : 'elev-edge-' + name);
  });
  // The region tint/border lives on a child div behind the card (avoids clashing with a
  // stacked tile's ::before/::after sheets).
  const fill = document.createElement('div');
  fill.className = 'elevator-fill';
  cell.insertBefore(fill, cell.firstChild);
  // While a slot is empty, show that area's remaining refill count.
  if (board[i] === null) {
    const badge = document.createElement('span');
    badge.className = 'elevator-badge';
    badge.textContent = `⬆${area.refillsLeft}`;
    cell.appendChild(badge);
  }
}

// Ice decoration on the CELL: a semi-transparent frost overlay drawn OVER the card (so the
// frozen card shows through), rendered as one continuous region per area (edge-detection like
// the elevator) with a "❄ N" badge on the area's top-left cell showing how many more cards
// must be collected to melt it. Idempotent.
function decorateIce(cell, i) {
  const oldFill = cell.querySelector('.ice-fill'); if (oldFill) oldFill.remove();
  cell.classList.remove('ice-cell',
    'ice-edge-top', 'ice-edge-right', 'ice-edge-bottom', 'ice-edge-left',
    'ice-join-top', 'ice-join-right', 'ice-join-bottom', 'ice-join-left');
  const area = iceCellArea.get(i);
  if (!area) return;
  cell.classList.add('ice-cell');
  const { r, c } = toRC(i);
  ELEV_DIRS.forEach(([name, dr, dc]) => {
    const j = toIndex(r + dr, c + dc);
    const sameArea = j >= 0 && iceCellArea.get(j) === area;
    cell.classList.add(sameArea ? 'ice-join-' + name : 'ice-edge-' + name);
  });
  const fill = document.createElement('div');
  fill.className = 'ice-fill';
  cell.appendChild(fill); // ON TOP of the card (see z-index in CSS)
}

// One melt-countdown badge per ice area, floated at the pixel centroid of its cells so it
// sits in the MIDDLE of the area. Appended to #board AFTER the cells (so cell indexing is
// unaffected) — rebuilt on layout changes (fitBoard) and whenever the count changes.
function renderIceBadges() {
  boardEl.querySelectorAll(':scope > .ice-badge').forEach(b => b.remove());
  if (!iceAreas.length) return;
  iceAreas.forEach(area => {
    if (area.broken) return;
    let sx = 0, sy = 0, n = 0;
    area.cells.forEach(i => {
      const cell = boardEl.children[i];
      if (!cell) return;
      sx += cell.offsetLeft + cell.offsetWidth / 2;
      sy += cell.offsetTop + cell.offsetHeight / 2;
      n++;
    });
    if (!n) return;
    const badge = document.createElement('span');
    badge.className = 'ice-badge';
    badge.textContent = `❄ ${Math.max(0, area.threshold - cardsCollectedTotal)}`;
    badge.style.left = (sx / n) + 'px';
    badge.style.top = (sy / n) + 'px';
    boardEl.appendChild(badge);
  });
}

// Record a batch of collected card colours: bumps the total (ice) and per-colour counts
// (color locks), then re-checks both for anything that should now clear.
function registerCollected(colors) {
  if (!colors || !colors.length) return;
  cardsCollectedTotal += colors.length;
  colors.forEach(c => { if (c) cardsCollectedByColor[c] = (cardsCollectedByColor[c] || 0) + 1; });
  checkIceBreaks();
  checkColorLockBreaks();
}

// Break any unbroken ice area whose threshold has been met; refresh the countdown badge on
// the rest. Safe to call any time the collected count changes.
function checkIceBreaks() {
  iceAreas.forEach(area => {
    if (area.broken) return;
    if (cardsCollectedTotal >= area.threshold) breakIceArea(area);
  });
  renderIceBadges(); // refresh remaining counts + drop any melted area's badge
}

// Melt an ice area: shatter VFX, then unfreeze its cards (interactable again) and drop the overlay.
function breakIceArea(area) {
  if (area.broken) return;
  area.broken = true;
  const cells = [...area.cells];
  SFX.boom();
  if (typeof spawnIceShards === 'function') spawnIceShards(cells);
  cells.forEach(i => { const f = boardEl.children[i]?.querySelector('.ice-fill'); if (f) f.classList.add('ice-breaking'); });
  setTimeout(() => {
    cells.forEach(i => {
      iceCellArea.delete(i);
      if (board[i]) { board[i].iced = false; board[i].locked = false; }
      replaceCell(i);
    });
    updateChainIndicator();
  }, 320);
}

// ── Color Lock rendering + unlock (Ice-style, keyed to a specific colour) ─────────────
function hexToRgba(hex, a) {
  let h = (hex || '#888888').replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Overlay tinted by the required colour, drawn OVER the cards as one continuous region.
function decorateColorLock(cell, i) {
  const oldFill = cell.querySelector('.color-lock-fill'); if (oldFill) oldFill.remove();
  cell.classList.remove('cl-cell',
    'cl-edge-top', 'cl-edge-right', 'cl-edge-bottom', 'cl-edge-left',
    'cl-join-top', 'cl-join-right', 'cl-join-bottom', 'cl-join-left');
  const area = colorLockCellArea.get(i);
  if (!area) return;
  cell.classList.add('cl-cell');
  const { r, c } = toRC(i);
  ELEV_DIRS.forEach(([name, dr, dc]) => {
    const j = toIndex(r + dr, c + dc);
    const sameArea = j >= 0 && colorLockCellArea.get(j) === area;
    cell.classList.add(sameArea ? 'cl-join-' + name : 'cl-edge-' + name);
  });
  const hex = COLOR_HEX[area.color] || '#888888';
  const fill = document.createElement('div');
  fill.className = 'color-lock-fill';
  fill.style.background = `linear-gradient(135deg, ${hexToRgba(hex, .52)}, ${hexToRgba(hex, .34)})`;
  fill.style.borderColor = hexToRgba(hex, .95);
  cell.appendChild(fill);
}

// One badge per color-lock area, floated at the centroid: a swatch of the required colour +
// how many more of that colour must be collected to unlock.
function renderColorLockBadges() {
  boardEl.querySelectorAll(':scope > .color-lock-badge').forEach(b => b.remove());
  if (!colorLockAreas.length) return;
  colorLockAreas.forEach(area => {
    if (area.broken) return;
    let sx = 0, sy = 0, n = 0;
    area.cells.forEach(i => {
      const cell = boardEl.children[i];
      if (!cell) return;
      sx += cell.offsetLeft + cell.offsetWidth / 2;
      sy += cell.offsetTop + cell.offsetHeight / 2;
      n++;
    });
    if (!n) return;
    const remaining = Math.max(0, area.count - (cardsCollectedByColor[area.color] || 0));
    const badge = document.createElement('span');
    badge.className = 'color-lock-badge';
    badge.innerHTML = `<span class="cl-swatch" style="background:${COLOR_HEX[area.color] || '#888'}"></span>${remaining}`;
    badge.style.left = (sx / n) + 'px';
    badge.style.top = (sy / n) + 'px';
    boardEl.appendChild(badge);
  });
}

function checkColorLockBreaks() {
  colorLockAreas.forEach(area => {
    if (area.broken) return;
    if ((cardsCollectedByColor[area.color] || 0) >= area.count) breakColorLockArea(area);
  });
  renderColorLockBadges();
}

// Unlock a color-lock area: a coloured burst, then unfreeze its cards and drop the overlay.
function breakColorLockArea(area) {
  if (area.broken) return;
  area.broken = true;
  const cells = [...area.cells];
  SFX.boom();
  if (typeof spawnParticles === 'function') spawnParticles(cells, area.color);
  cells.forEach(i => { const f = boardEl.children[i]?.querySelector('.color-lock-fill'); if (f) f.classList.add('cl-breaking'); });
  setTimeout(() => {
    cells.forEach(i => {
      colorLockCellArea.delete(i);
      if (board[i]) { board[i].colorLocked = false; board[i].locked = false; }
      replaceCell(i);
    });
    updateChainIndicator();
  }, 320);
}

function renderBoard() {
  boardEl.innerHTML = '';
  board.forEach((card, i) => {
    const cell = document.createElement('div');
    if (card === null) {
      cell.className = 'cell disabled-cell';
    } else {
      cell.className = 'cell';
      cell.innerHTML = buildCardHTML(card);
      decorateStack(cell, card);
    }
    decorateElevator(cell, i);
    decorateIce(cell, i);
    decorateColorLock(cell, i);
    boardEl.appendChild(cell);
  });
  fitBoard();
}

// Scale the board so the full grid (any number of rows) fits inside the space
// #board-container is given, keeping cells square. Without this a tall board
// (e.g. 4×6) sizes itself purely from its square cells and grows past the frame,
// pushing the power-up bar off screen.
const BOARD_GAP = 8; // must match the `gap` on #board in style.css
function fitBoard() {
  if (!COLS || !ROWS || !boardEl || !boardContainerEl) return;
  const cs = getComputedStyle(boardContainerEl);
  let availW = boardContainerEl.clientWidth  - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  let availH = boardContainerEl.clientHeight - parseFloat(cs.paddingTop)  - parseFloat(cs.paddingBottom);

  // Coverage-goal indicators sit above / beside the board and eat into the space.
  const colInd = document.getElementById('col-indicators');
  if (colInd && colInd.classList.contains('active')) {
    const m = getComputedStyle(colInd);
    availH -= colInd.offsetHeight + parseFloat(m.marginTop) + parseFloat(m.marginBottom);
  }
  const rowInd = document.getElementById('row-indicators');
  if (rowInd && rowInd.classList.contains('active')) {
    const m = getComputedStyle(rowInd);
    availW -= rowInd.offsetWidth + parseFloat(m.marginLeft) + parseFloat(m.marginRight);
  }
  if (availW <= 0 || availH <= 0) return;

  const cell = Math.min(
    (availW - BOARD_GAP * (COLS - 1)) / COLS,
    (availH - BOARD_GAP * (ROWS - 1)) / ROWS
  );
  if (!(cell > 0)) return;
  boardEl.style.flex = '0 0 auto';
  boardEl.style.maxWidth = 'none';
  boardEl.style.width  = Math.floor(cell * COLS + BOARD_GAP * (COLS - 1)) + 'px';
  boardEl.style.height = Math.floor(cell * ROWS + BOARD_GAP * (ROWS - 1)) + 'px';

  // Recompute the optional instrument background now that the board's pixel box
  // (and each cell's position) is known.
  if (typeof applyBoardBackground === 'function') applyBoardBackground();
  // Reposition ice-area + color-lock badges to the (now-known) cell centroids.
  if (typeof renderIceBadges === 'function') renderIceBadges();
  if (typeof renderColorLockBadges === 'function') renderColorLockBadges();
}

// Refit whenever the container's box changes: device-switcher, orientation,
// window resize, or HUD height changes. Setting the board's own size never
// changes the container's (flex:1 + min-height:0), so this can't loop.
if (typeof ResizeObserver !== 'undefined' && boardContainerEl) {
  new ResizeObserver(() => fitBoard()).observe(boardContainerEl);
}

// Long-press peek
let longPressTimer = null;
let longPressTriggered = false;
let peekProgressEl = null;
let peekShowTimer = null;

function showPeekProgress(cardEl) {
  removePeekProgress();
  const overlay = document.createElement('div');
  overlay.className = 'peek-progress-overlay';
  overlay.innerHTML = `<svg class="peek-ring" viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" /></svg><span class="peek-progress-icon">👁</span>`;
  cardEl.appendChild(overlay);
  peekProgressEl = overlay;
  // Delay showing the ring so normal taps don't flash it
  peekShowTimer = setTimeout(() => {
    if (!peekProgressEl) return;
    peekProgressEl.offsetWidth;
    peekProgressEl.classList.add('active');
  }, 200);
}

function removePeekProgress() {
  if (peekShowTimer) { clearTimeout(peekShowTimer); peekShowTimer = null; }
  if (peekProgressEl) { peekProgressEl.remove(); peekProgressEl = null; }
}

boardEl.addEventListener('pointerdown', e => {
  longPressTriggered = false;
  if (isBombAiming()) return; // bomb drag-to-place owns board input
  if (!getRule('longPressPeek')) return;
  const el = e.target.closest('.card');
  if (!el) return;
  const i = parseInt(el.dataset.index, 10);
  if (isNaN(i)) return;
  // Only show progress if the peek would be valid
  if (!inputLocked && board[i] && !board[i].flipped && !board[i].special && !board[i].locked
      && boosterCounts['peek'] && boosterCounts['peek'] > 0) {
    showPeekProgress(el);
  }
  longPressTimer = setTimeout(() => {
    longPressTriggered = true;
    removePeekProgress();
    if (inputLocked || !board[i] || board[i].flipped || board[i].special || board[i].locked) return;
    if (!hasBooster('peek')) return;
    consumeBooster('peek');
    executePeek(i);
    updateBoosterUI();
  }, 700);
});

boardEl.addEventListener('pointerup', () => {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  removePeekProgress();
});

boardEl.addEventListener('pointerleave', () => {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  removePeekProgress();
});

boardEl.addEventListener('click', e => {
  if (longPressTriggered) { longPressTriggered = false; return; }
  // Swallow the click that trails a bomb drop / while aiming.
  if (isBombAiming() || consumeBombClickSwallow()) return;
  const el = e.target.closest('.card');
  if (!el) return;
  const i = parseInt(el.dataset.index, 10);
  if (!isNaN(i)) onCardClick(i);
});

function getCardEl(i) { return boardEl.querySelector(`.card[data-index="${i}"]`); }
function updateUI()   { scoreEl.textContent = score; turnsEl.textContent = turns; }
function replaceCell(i) {
  const cell = boardEl.children[i];
  if (!cell) return;
  if (board[i] === null) {
    cell.className = 'cell cleared-cell'; cell.innerHTML = '';
    // A cell just broke — refresh the instrument reveal (cheap; skips the
    // behind-grid image rebuild unless something actually changed).
    if (typeof applyBoardBackground === 'function') applyBoardBackground();
    decorateElevator(cell, i);
    decorateIce(cell, i);
    decorateColorLock(cell, i);
    return;
  }
  // A slot that was empty (elevator/clear-board) becomes clickable again once a card lands
  // in it — drop the empty-cell classes whose pointer-events:none would block taps.
  cell.classList.remove('cleared-cell', 'disabled-cell');
  cell.innerHTML = buildCardHTML(board[i]);
  decorateStack(cell, board[i]);
  decorateElevator(cell, i);
  decorateIce(cell, i);
  decorateColorLock(cell, i);
}

function updateStatusBadge() {
  let h = '';
  if (shieldCharges > 0) h += `<div class="status-pill shield">🛡 ${shieldCharges}</div>`;
  if (echoCharges   > 0) h += `<div class="status-pill echo">🔔 ${echoCharges}</div>`;
  if (spotlightMode)     h += `<div class="status-pill spotlight">🔦 Tap a card</div>`;
  statusBadge.innerHTML = h;
}

function cssColor(c) { return COLOR_HEX[c] || '#fff'; }

let tensionRAF = null;
let tensionScale = 0;
let tensionSpeed = 0;

function updateChainTension() {
  const chainLen = chainCards.length + specialsUsed.length;
  if (!turnActive || chainLen < 3 || !getRule('chainPulse')) {
    boardEl.removeAttribute('data-tension');
    if (tensionRAF) { cancelAnimationFrame(tensionRAF); tensionRAF = null; }
    // Reset any inline scale on all cards
    boardEl.querySelectorAll('.card-front').forEach(el => {
      if (el.style.scale) el.style.scale = '';
    });
    return;
  }
  const level = Math.min(chainLen - 2, 8);
  // Scale amplitude: 0.01 at level 1 → 0.06 at level 8
  tensionScale = 0.01 + (level - 1) * 0.007;
  // Period in ms: 1000 at level 1 → 200 at level 8
  tensionSpeed = Math.max(1000 - (level - 1) * 115, 200);
  boardEl.setAttribute('data-tension', level);
  if (!tensionRAF) tensionPulseLoop();
}

function tensionPulseLoop() {
  // Self-terminate if turn ended or input locked (end-of-turn animations)
  if (!turnActive || inputLocked) {
    boardEl.removeAttribute('data-tension');
    boardEl.querySelectorAll('.card-front').forEach(el => { if (el.style.scale) el.style.scale = ''; });
    tensionRAF = null;
    return;
  }
  const t = performance.now();
  const phase = (t % tensionSpeed) / tensionSpeed;
  const s = 1 + tensionScale * Math.sin(phase * Math.PI * 2);
  // Only pulse cards actually in the chain, clear scale on everything else
  const chainSet = new Set(chainCards);
  boardEl.querySelectorAll('.card-front').forEach(el => {
    const card = el.closest('.card');
    if (!card) return;
    const idx = parseInt(card.dataset.index, 10);
    if (chainSet.has(idx) && board[idx] && !board[idx].special && board[idx].flipped) {
      el.style.scale = s;
    } else if (el.style.scale) {
      el.style.scale = '';
    }
  });
  tensionRAF = requestAnimationFrame(tensionPulseLoop);
}

function updateComboSpawnIndicator() {
  // Clear any indicator/badge left on cards (badge display disabled — no spawn icon on opened cards)
  document.querySelectorAll('.combo-spawn-indicator').forEach(el => el.classList.remove('combo-spawn-indicator'));
  document.querySelectorAll('.combo-spawn-badge').forEach(el => el.remove());
}

function checkAllColorsBonus() {
  if (!getRule('coloredBombs') || chainColors.size < ACTIVE_COLORS.length) return;
  // All colors active! Reveal all face-down cards, add bonus, trigger end
  stopChainTimer();
  inputLocked = true;
  const ALL_COLORS_BONUS = 500;
  score += ALL_COLORS_BONUS;
  // Reveal all non-special, non-flipped cards
  board.forEach((c, i) => {
    if (c && !c.special && !c.flipped && !c.locked) {
      c.flipped = true;
      chainCards.push(i);
      SFX.shepard(chainCards.length + specialsUsed.length - 1);
      const el = getCardEl(i);
      if (el) el.classList.add('flipped');
    }
  });
  animateScore(score);
  showScorePopup(ALL_COLORS_BONUS, chainCards, '🌈 ALL COLORS! +500');
  SFX.win(); launchConfetti();
  setTimeout(() => endTurn(true, false), 1500);
}

function getChainFaceSuffix(colorCount) {
  if (colorCount <= 1) return '1';
  if (colorCount === 2) return '5';
  if (colorCount === 3) return '2';
  if (colorCount === 4) return '3';
  return '6'; // 5+
}

function updateChainFaces(mismatchIdx) {
  // Count cards per color in the chain (excluding specials)
  const colorCounts = {};
  chainCards.forEach(i => {
    const card = board[i];
    if (card && !card.special && card.color) {
      colorCounts[card.color] = (colorCounts[card.color] || 0) + 1;
    }
  });

  // Update images for all chain cards
  chainCards.forEach(i => {
    const card = board[i];
    if (!card || card.special || !card.color) return;
    const el = getCardEl(i);
    if (!el) return;
    const img = el.querySelector('.card-front img');
    if (!img) return;

    const count = colorCounts[card.color] || 1;
    const totalChainLen = chainCards.filter(j => board[j] && !board[j].special).length;
    let suffix;
    if (i === mismatchIdx && totalChainLen > 2) {
      suffix = '4';
    } else if (i === mismatchIdx) {
      suffix = '1';
    } else {
      suffix = getChainFaceSuffix(count);
    }
    img.src = `blocks/block_${card.color}_${suffix}.png`;
  });
}

function updateSweepCountdown() {
  const el = document.getElementById('sweep-countdown');
  if (!el) return;
  if (!turnActive || !chainColor || !isSweepRevealActive()) { el.classList.remove('active','urgent'); el.textContent = ''; return; }
  const activeColors = getRule('coloredBombs') ? [...chainColors] : [chainColor];
  const remaining = board.filter(c => c && !c.special && !c.flipped && activeColors.includes(c.color)).length;
  if (remaining >= 1 && remaining <= 3) {
    el.classList.add('active');
    el.classList.toggle('urgent', remaining === 1);
    if (remaining === 1) el.textContent = '🧹 1 card away from PERFECT SWEEP!';
    else el.textContent = `🧹 ${remaining} cards away from Perfect Sweep!`;
  } else {
    el.classList.remove('active','urgent'); el.textContent = '';
  }
}

// Sliding-window chain bar geometry
const CHAIN_STEP = 38;        // slot width (30) + gap (8)
const CHAIN_MIN_LINE_POS = 2; // green line between track positions 2 & 3 (Match-2 minimum)

// Which chain positions show a reward icon — derived from CHAIN_REWARD_TIERS so the
// markers stay in sync with the actual rewards (change a tier's `min` and the chain
// marker moves automatically). Returns { position: iconString }.
function chainRewardMarkers() {
  const map = {};
  if (typeof CHAIN_REWARD_TIERS !== 'undefined') {
    CHAIN_REWARD_TIERS.forEach(tier => {
      const b = (typeof BOOSTERS !== 'undefined') ? BOOSTERS.find(x => x.id === tier.id) : null;
      if (b) map[tier.min] = b.icon;
    });
  }
  return map;
}
let _chainLastLen = 0;        // last rendered chain length (drives the pop-then-slide)

// How many positions have scrolled off the left for a chain of `len`.
// Cards 1-3 sit in a static 5-wide window; from the 4th on, the newest card
// settles into visible slot 3 (window = last 3 opened + 2 upcoming).
function chainOffsetFor(len) { return Math.max(0, len - 3); }

function updateChainIndicator() {
  updateChainTension();
  updateComboSpawnIndicator();
  updateChainFaces();
  updateSweepCountdown();
  updateBankButton();

  // Booster / spotlight targeting: keep the chain bar at its full size (so the
  // board never reflows/rescales) — just dim the chain and float a prompt above it.
  let promptText = null;
  if (spotlightMode) promptText = '🔦 Tap a face-down card to reveal it';
  else if (activeBooster) promptText = `Select a card for ${BOOSTERS.find(b => b.id === activeBooster).icon}`;
  chainEl.className = promptText ? 'chain-bar dimmed' : 'chain-bar';

  const isWild = (i) => board[i]?.special && getSpecialType(board[i].special)?.isWild;

  // Ordered list of filled slots: normal/wild chain cards first, then specials used.
  const filled = [];
  chainCards.forEach(i => {
    if (board[i].special && !isWild(i)) return;
    filled.push(isWild(i) ? { wild: true } : { color: board[i].color || chainColor });
  });
  specialsUsed.forEach(() => filled.push({ special: true }));
  const len = filled.length;

  const newOffset = chainOffsetFor(len);
  const nSlots = newOffset + 5; // always render enough to fill the 5-wide window

  // Red limit "]" = total cards of the active chain color currently on the board.
  let limitPos = 0;
  if (turnActive && chainColor) {
    limitPos = board.filter(c => c && !c.special && !c.locked && c.color === chainColor).length;
  }

  const rewardMarkers = chainRewardMarkers();
  let slots = '';
  for (let p = 1; p <= nSlots; p++) {
    const rewardIcon = rewardMarkers[p];
    const rewardCls = rewardIcon ? ' reward' : '';
    const reward = rewardIcon ? `<span class="chain-slot-reward">${rewardIcon}</span>` : '';
    if (p <= len) {
      const f = filled[p - 1];
      const style = f.wild
        ? 'background:conic-gradient(#e74c3c,#f1c40f,#2ecc71,#3498db,#e74c3c)'
        : f.special ? 'background:#fff' : `background:${cssColor(f.color)}`;
      const justAdded = (p === len && len > _chainLastLen) ? ' just-added' : '';
      slots += `<span class="chain-slot filled${rewardCls}${justAdded}" style="${style}">${reward}</span>`;
    } else {
      slots += `<span class="chain-slot empty${rewardCls}">${reward}</span>`;
    }
  }

  // Markers ride inside the track (absolutely positioned) so they slide with it.
  // lineX is the exact centre of the gap between slots CHAIN_MIN_LINE_POS and +1;
  // the line itself is centred on it (translateX(-50%) in CSS). It grays out until
  // the chain reaches the Match-2 minimum, then turns green.
  const lineX = (CHAIN_MIN_LINE_POS - 1) * CHAIN_STEP + 34;
  const lineReached = len >= CHAIN_MIN_LINE_POS ? ' reached' : '';
  let markers = `<span class="chain-min-line${lineReached}" style="left:${lineX}px"></span>`;
  if (limitPos > 0) {
    const limitCol = cssColor(chainColor); // bracket matches the color being collected
    markers += `<span class="chain-limit" style="left:${(limitPos - 1) * CHAIN_STEP}px;` +
               `border-color:${limitCol};filter:drop-shadow(0 0 3px ${limitCol})"></span>`;
  }

  chainEl.innerHTML =
    (promptText ? `<div class="chain-prompt-banner">${promptText}</div>` : '') +
    `<span class="chain-label">Chain</span>` +
    `<div class="chain-slots"><div class="chain-track">${slots}${markers}</div></div>`;

  // Slide animation: start at the previous offset (newest pops in at slot 4),
  // then transition to the new offset (slides left so it settles at slot 3).
  const track = chainEl.querySelector('.chain-track');
  const startOffset = (len > _chainLastLen && len >= 4) ? Math.max(0, len - 4) : newOffset;
  track.style.transition = 'none';
  track.style.transform = `translateX(${-startOffset * CHAIN_STEP}px)`;
  void track.offsetWidth; // force reflow so the next transform animates
  track.style.transition = 'transform .35s cubic-bezier(.22,.61,.36,1)';
  track.style.transform = `translateX(${-newOffset * CHAIN_STEP}px)`;

  _chainLastLen = len;
}
