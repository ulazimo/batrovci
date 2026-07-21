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

// Show the remaining deck count in the header (Cleaning levels reuse the "Target" slot).
function updateDeckHUD() {
  if (!LEVELS[currentLevelIndex]?.clearBoard) return;
  const lbl = document.getElementById('target-label');
  if (lbl) lbl.textContent = 'Deck';
  if (targetEl) targetEl.textContent = deck.length;
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
  // Remove any existing indicator and badge
  document.querySelectorAll('.combo-spawn-indicator').forEach(el => el.classList.remove('combo-spawn-indicator'));
  document.querySelectorAll('.combo-spawn-badge').forEach(el => el.remove());
  if (!turnActive) return;
  const combo = chainCards.length + specialsUsed.length;
  // Find the minimum combo that produces a special
  const map = getComboMapping();
  const minCombo = Math.min(...map.map(m => typeof m.combo === 'number' ? m.combo : parseInt(m.combo)));
  if (combo < minCombo) return;
  // Check that this combo length actually yields a special
  const specialId = getSpecialForCombo(combo);
  if (!specialId) return;
  // The spawn position is the last selected card (matching endTurn logic)
  if (lastSelectedIdx < 0) return;
  const spawnIdx = lastSelectedIdx;
  const el = getCardEl(spawnIdx);
  if (el) {
    el.classList.add('combo-spawn-indicator');
    // Add icon badge in top-right corner
    const badge = document.createElement('span');
    badge.className = 'combo-spawn-badge';
    const imgPath = specialBadgeImage(specialId);
    if (imgPath) {
      badge.style.backgroundImage = `url('${imgPath}')`;
    } else {
      badge.textContent = specialIcon(specialId);
    }
    const front = el.querySelector('.card-front');
    (front || el).appendChild(badge);
  }
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

function updateChainIndicator() {
  updateChainTension();
  updateComboSpawnIndicator();
  updateChainFaces();
  updateSweepCountdown();
  updateBankButton();
  if (!turnActive) {
    chainEl.innerHTML = spotlightMode
      ? '🔦 Tap a face-down card to reveal it'
      : activeBooster
      ? `Select a card for ${BOOSTERS.find(b => b.id === activeBooster).icon}`
      : 'Tap a card to begin';
    return;
  }
  const isWild = (i) => board[i]?.special && getSpecialType(board[i].special)?.isWild;
  const nc = chainCards.filter(i => !board[i].special || isWild(i)).length;
  const sc = specialsUsed.length;
  let extra = '';
  if (shieldCharges > 0) extra += ' 🛡' + shieldCharges;

  // Group chain dots by color, one line per color
  if (getRule('coloredBombs') && chainColors.size > 1) {
    const sDots = specialsUsed.map(i => {
      const bc = board[i]?.bombColor;
      return `<span class="chain-dot" style="background:${bc ? cssColor(bc) : '#fff'};border:2px solid ${bc ? cssColor(bc) : '#999'}">⚡</span>`;
    }).join('');
    let lines = '';
    // Wild cards shown as rainbow dots
    const wildCards = chainCards.filter(i => isWild(i));
    const wildDots = wildCards.map(() =>
      `<span class="chain-dot" style="background:conic-gradient(#e74c3c,#f1c40f,#2ecc71,#3498db,#e74c3c);border:1px solid #fff"></span>`).join('');
    [...chainColors].forEach(color => {
      const colorCards = chainCards.filter(i => !board[i].special && board[i].color === color);
      if (colorCards.length === 0) return;
      const dots = colorCards.map(() =>
        `<span class="chain-dot" style="background:${cssColor(color)}"></span>`).join('');
      lines += `<div class="chain-color-row">${dots} <span style="color:${cssColor(color)}">(${colorCards.length})</span></div>`;
    });
    chainEl.innerHTML = `Chain: ${lines}${wildDots?`<div class="chain-color-row">${wildDots}</div>`:''}<div class="chain-color-row">${sDots} <span>(${nc}${sc>0?'+'+sc+'⚡':''}${extra})</span></div>`;
  } else {
    const nDots = chainCards.filter(i => !board[i].special || isWild(i)).map(i =>
      isWild(i)
        ? `<span class="chain-dot" style="background:conic-gradient(#e74c3c,#f1c40f,#2ecc71,#3498db,#e74c3c);border:1px solid #fff"></span>`
        : `<span class="chain-dot" style="background:${cssColor(board[i].color || chainColor)}"></span>`
    ).join('');
    const sDots = specialsUsed.map(() =>
      `<span class="chain-dot" style="background:#fff;border:2px solid #999"></span>`).join('');
    chainEl.innerHTML = `Chain: ${nDots}${sDots} <span>(${nc}${sc>0?'+'+sc+'⚡':''}${extra})</span>`;
  }
}
