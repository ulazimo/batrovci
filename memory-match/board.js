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

function buildCardHTML(card) {
  const i = card.index;
  const lockedCls = card.locked ? ' locked' : '';
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
  return `<div class="card${lockedCls}${markedCls}${orderedCls}" data-index="${i}">${orderedNum}<div class="card-face card-back"></div><div class="card-face card-front ${card.color}"><img src="blocks/block_${card.color}_1.png" alt="${card.color}"></div>${markedBadge}</div>`;
}

function renderBoard() {
  boardEl.innerHTML = '';
  board.forEach(card => {
    const cell = document.createElement('div');
    if (card === null) {
      cell.className = 'cell disabled-cell';
    } else {
      cell.className = 'cell';
      cell.innerHTML = buildCardHTML(card);
    }
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
  if (board[i] === null) { cell.className = 'cell cleared-cell'; cell.innerHTML = ''; return; }
  cell.innerHTML = buildCardHTML(board[i]);
}

function updateStatusBadge() {
  let h = '';
  if (shieldCharges > 0) h += `<div class="status-pill shield">🛡 ${shieldCharges}</div>`;
  if (echoCharges   > 0) h += `<div class="status-pill echo">🔔 ${echoCharges}</div>`;
  if (spotlightMode)     h += `<div class="status-pill spotlight">🔦 Tap a card</div>`;
  statusBadge.innerHTML = h;
}

function cssColor(c) { return { red:'#e74c3c', green:'#2ecc71', blue:'#3498db', yellow:'#f1c40f' }[c] || '#fff'; }

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
const CHAIN_REWARD_POS = 5;   // Baby Bomb reward at track position 5
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

  // Booster / spotlight targeting takes over the bar with a prompt.
  if (spotlightMode) {
    chainEl.className = 'chain-bar chain-prompt';
    chainEl.innerHTML = '🔦 Tap a face-down card to reveal it';
    _chainLastLen = 0;
    return;
  }
  if (activeBooster) {
    chainEl.className = 'chain-bar chain-prompt';
    chainEl.innerHTML = `Select a card for ${BOOSTERS.find(b => b.id === activeBooster).icon}`;
    _chainLastLen = 0;
    return;
  }
  chainEl.className = 'chain-bar';

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

  let slots = '';
  for (let p = 1; p <= nSlots; p++) {
    const rewardCls = p === CHAIN_REWARD_POS ? ' reward' : '';
    const reward = p === CHAIN_REWARD_POS ? '<span class="chain-slot-reward">💣</span>' : '';
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
  const lineX = (CHAIN_MIN_LINE_POS - 1) * CHAIN_STEP + 34;
  let markers = `<span class="chain-min-line" style="left:${lineX}px"></span>`;
  if (limitPos > 0) {
    const limitCol = cssColor(chainColor); // bracket matches the color being collected
    markers += `<span class="chain-limit" style="left:${(limitPos - 1) * CHAIN_STEP}px;` +
               `border-color:${limitCol};filter:drop-shadow(0 0 3px ${limitCol})"></span>`;
  }

  chainEl.innerHTML =
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
