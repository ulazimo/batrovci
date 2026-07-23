// ============================================================
// BOOSTERS — inventory power-ups
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

const BOOSTERS = [
  { id:'peek',      icon:'👁',  name:'Peek',        desc:'Reveal one card by tapping it. Long-press any card for a quick peek!', needsTap:true  },
  { id:'babybomb',  icon:'💣',  name:'Baby Bomb',   desc:'Place on the board to destroy that card and its 4 neighbours',  needsTap:true, bomb:'cross', max:3, startQty:0 },
  { id:'bigbomb',   icon:'💥',  name:'BIG Bomb',    desc:'Place on the board to destroy a whole 3×3 block of cards',      needsTap:true, bomb:'ring',  max:1, startQty:0 },
  { id:'random3',   icon:'🎲',  name:'Random 3',    desc:'Reveal 3 random face-down cards',                             needsTap:false },
  { id:'cross',     icon:'✚',  name:'Cross Reveal', desc:'Reveal cards in a cross around the card you tap',              needsTap:true  },
  { id:'row',       icon:'↔',  name:'Row Reveal',   desc:'Reveal the entire row of the card you tap',                    needsTap:true  },
  { id:'col',       icon:'↕',  name:'Col Reveal',   desc:'Reveal the entire column of the card you tap',                 needsTap:true  },
  { id:'neighbor',  icon:'🔗',  name:'Neighbor',     desc:'Reveal same-color neighbors around the last revealed card',   needsTap:false },
  { id:'colorpick', icon:'🎨',  name:'Color Pick',   desc:'Choose a color and reveal 3 cards of that color',             needsTap:false },
  { id:'shield',    icon:'🛡',  name:'Shield',       desc:'Next 2 wrong-color reveals won\'t break your combo',          needsTap:false },
  { id:'joker',     icon:'🃏',  name:'Joker',        desc:'Tap a card — it acts as your last-played card (copies its color or special)',  needsTap:true  },
];
let boosterCounts = {};

// Tray tiles, in display order: Peek · Random 3 · Baby Bomb · BIG Bomb.
// Recall lives in its own bar above the chain (not in the tray). Hidden boosters
// still keep their inventory counts — see initBoosters.
const VISIBLE_BOOSTERS = ['peek', 'random3', 'babybomb', 'bigbomb'];

// ============================================================
// BOOSTERS
// ============================================================
function initBoosters() {
  boosterBar.innerHTML = '';
  // Count bookkeeping for ALL boosters (hidden ones keep their inventory).
  BOOSTERS.forEach(b => {
    const s = getBoosterSetting(b.id);
    if (!s.enabled) { boosterCounts[b.id] = 0; return; }
    boosterCounts[b.id] = (progress.boosterCounts[b.id] !== undefined) ? progress.boosterCounts[b.id] : s.qty;
    // Enforce per-booster inventory cap (bombs are capped low)
    boosterCounts[b.id] = Math.min(boosterCounts[b.id], getBoosterMax(b.id));
  });
  // Render only the tray boosters, in VISIBLE_BOOSTERS order.
  VISIBLE_BOOSTERS.forEach(id => {
    const b = BOOSTERS.find(x => x.id === id);
    if (!b || !getBoosterSetting(b.id).enabled) return;
    const btn = document.createElement('div');
    btn.className = 'booster-btn'; btn.dataset.booster = b.id;
    btn.innerHTML = `<span>${b.icon}</span><span class="badge">${boosterCounts[b.id]}</span>`;
    btn.addEventListener('click', () => activateBooster(b.id));
    // Bomb power-ups are drag-to-place: press the button and drag the blast
    // silhouette onto the board (see bomb-aim.js). activateBooster no-ops for them.
    if (b.bomb) {
      btn.style.touchAction = 'none';
      btn.addEventListener('pointerdown', (e) => startBombBoosterDrag(b, e));
    } else {
      // Hold-to-preview tooltip — skipped for bombs (drag would fight the tooltip).
      let pt = null;
      btn.addEventListener('pointerdown', () => { pt = setTimeout(() => { showTooltip(b, btn); pt='shown'; }, 400); });
      btn.addEventListener('pointerup',    () => { if(pt!=='shown') clearTimeout(pt); hideTooltip(); });
      btn.addEventListener('pointerleave', () => { if(pt!=='shown') clearTimeout(pt); hideTooltip(); });
    }
    boosterBar.appendChild(btn);
  });
}

function saveBoosterCounts() {
  BOOSTERS.forEach(b => { progress.boosterCounts[b.id] = boosterCounts[b.id] || 0; });
  saveProgress();
}

function hasBooster(id) {
  return getRule('unlimitedPowerUps') || (boosterCounts[id] > 0);
}
function consumeBooster(id) {
  if (!getRule('unlimitedPowerUps')) boosterCounts[id]--;
  saveBoosterCounts();
}

function updateBoosterUI() {
  boosterBar.querySelectorAll('.booster-btn').forEach(btn => {
    const id = btn.dataset.booster;
    if (!id) return; // recall tile — managed by updateRecallButton()
    btn.querySelector('.badge').textContent = boosterCounts[id];
    btn.classList.toggle('disabled', !hasBooster(id) || inputLocked);
    btn.classList.toggle('active', activeBooster === id);
  });
}

function showTooltip(b, btn) {
  tooltipEl.textContent = b.desc; tooltipEl.classList.add('visible');
  const r = btn.getBoundingClientRect();
  tooltipEl.style.left = Math.max(8, Math.min(window.innerWidth-230, r.left+r.width/2-110))+'px';
  tooltipEl.style.top  = (r.top - 60) + 'px';
}
function hideTooltip() { tooltipEl.classList.remove('visible'); }

function activateBooster(id) {
  if (inputLocked || !hasBooster(id)) return;
  dismissNudge(); clearNudgeTimer();
  const b = BOOSTERS.find(x => x.id === id);
  // Toggle off (also clears any bomb-placement glow)
  if (activeBooster === id) {
    activeBooster = null;
    clearBombPlacement();
    updateBoosterUI(); updateChainIndicator(); return;
  }
  // Bomb power-ups (Baby Bomb / BIG Bomb) are handled by drag-to-place
  // (pointerdown → startBombBoosterDrag). Ignore plain clicks here.
  if (b.bomb) return;
  SFX.booster();
  if (b.needsTap) { activeBooster = id; updateBoosterUI(); updateChainIndicator(); return; }
  consumeBooster(id);
  if (id === 'random3')   executeRandom3();
  else if (id === 'neighbor')  executeNeighbor();
  else if (id === 'colorpick') executeColorPick();
  else if (id === 'shield') { shieldCharges += 2; updateStatusBadge(); updateChainIndicator(); updateBoosterUI(); }
}

// ============================================================
// CHAIN REWARDS — completing a chain grants a power-up (no board special)
//   chain 3-4 → wrong-color ✕ hint (instant, mid-chain — see applyChainColorHint),
//   chain 5-6 → Baby Bomb, 7+ → BIG Bomb (granted at end of turn).
// By default only the highest tier is awarded; the `cumulativeChainRewards` rule
// awards every tier the chain passed (e.g. a 7+ chain grants Baby Bomb AND BIG Bomb).
// Tiers are listed ascending by `min` so the last qualifying one is the highest.
// ============================================================
const CHAIN_REWARD_TIERS = [
  { min: 5, id: 'babybomb' },
  { min: 7, id: 'bigbomb' },
];

// Every reward tier the chain qualified for (cumulative rule) or just the highest.
function getChainRewardBoosters(comboLen) {
  const qualifying = CHAIN_REWARD_TIERS.filter(t => comboLen >= t.min).map(t => t.id);
  if (getRule('cumulativeChainRewards')) return qualifying;
  return qualifying.length ? [qualifying[qualifying.length - 1]] : [];
}

// Highest single reward tier for a combo (null if none) — kept for callers that
// only need the top reward.
function getChainRewardBooster(comboLen) {
  const ids = getChainRewardBoosters(comboLen);
  return ids.length ? ids[ids.length - 1] : null;
}

function grantChainReward(comboLen) {
  const ids = getChainRewardBoosters(comboLen);
  if (!ids.length) return;
  const flashed = [];
  ids.forEach(id => {
    const max = getBoosterMax(id);
    const before = boosterCounts[id] || 0;
    boosterCounts[id] = Math.min(max, before + 1);
    if (boosterCounts[id] > before) flashed.push(id);
  });
  saveBoosterCounts();
  updateBoosterUI();
  // Silent reward — just pulse each earned power-up's button (no top text notification)
  flashed.forEach(flashBoosterButton);
}

function flashBoosterButton(id) {
  const btn = boosterBar.querySelector(`.booster-btn[data-booster="${id}"]`);
  if (!btn) return;
  btn.classList.add('reward-flash');
  btn.addEventListener('animationend', () => btn.classList.remove('reward-flash'), { once: true });
}

// ============================================================
// CHAIN-3 WRONG-COLOR HINT — instant reward for reaching a chain of 3.
// Marks up to getChainHintCount() random face-down cards that DON'T match the
// active chain color with an ✕, so the player knows which cards to avoid.
// ============================================================
function applyChainColorHint() {
  const count = getChainHintCount();
  if (count <= 0) return;
  if (boardEl.querySelector('.card.wrong-color-hint')) return; // already shown this chain
  // Active chain color(s): with colored bombs a chain can track several colors.
  const colors = getRule('coloredBombs') ? [...chainColors] : (chainColor ? [chainColor] : []);
  if (colors.length === 0) return; // pure-wild chain with no color yet — nothing to compare
  // Candidates: face-down, normal, unlocked cards whose color isn't in the chain.
  const candidates = [];
  board.forEach((c, i) => {
    if (c && !c.special && !c.flipped && !c.locked && !colors.includes(c.color)) candidates.push(i);
  });
  // Fisher-Yates shuffle, then take the first `count`.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  candidates.slice(0, count).forEach(markWrongColorHint);
}

function markWrongColorHint(i) {
  const el = getCardEl(i);
  if (!el || el.classList.contains('wrong-color-hint')) return;
  el.classList.add('wrong-color-hint'); // drives the ember glow on .card-back (see style.css)
}

// Board indices currently carrying the chain-3 danger ✕ hint.
function getChainHintIndices() {
  return [...boardEl.querySelectorAll('.card.wrong-color-hint')].map(el => parseInt(el.dataset.index, 10));
}

function clearChainColorHints() {
  boardEl.querySelectorAll('.card.wrong-color-hint').forEach(el => el.classList.remove('wrong-color-hint'));
}

// When the Chain Danger Reveal rule is on, briefly flip up the danger-marked tiles
// once the chain has ended, so the player learns what colors they were. Called from
// finishTurn only when the turn resolves and the level continues.
function revealChainDangerCards() {
  const targets = pendingDangerReveal;
  pendingDangerReveal = [];
  if (!targets.length) return;
  boosterReveal(targets); // flip up + flash, then auto-hide (re-filters stale/removed tiles)
}

// Detonate a bomb power-up at `index`: destroy (collect) that card and its pattern.
function detonateBoosterBomb(index) {
  const id = activeBooster;
  const b = BOOSTERS.find(x => x.id === id);
  if (!b || !b.bomb) return;
  const card = board[index];
  if (!card || card.special || card.locked) return; // must land on a normal card
  consumeBooster(id);
  activeBooster = null;
  clearBombPlacement();
  updateBoosterUI();
  detonateBombAt(index, b.bomb);
}

function executePeek(index) {
  const card = board[index];
  if (!card || card.flipped || card.special || card.locked) { updateBoosterUI(); return; }
  inputLocked = true;
  pauseChainTimer();
  card.flipped = true;
  const el = getCardEl(index);
  if (el) { el.classList.add('flipped', 'reveal-flash'); el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true}); }
  SFX.cardFlip();

  // Check if it matches active chain color
  const matchesChain = turnActive && (card.color === chainColor || (getRule('coloredBombs') && chainColors.has(card.color)));

  if (matchesChain) {
    // Auto-add to chain with celebration
    setTimeout(() => {
      if (!chainCards.includes(index)) { chainCards.push(index); lastSelectedIdx = index; SFX.shepard(chainCards.length + specialsUsed.length - 1); }
      SFX.match();
      spawnParticles([index], card.color);
      const chainLen = chainCards.length + specialsUsed.length;
      if (chainLen === 3) { startChainTimer(); applyChainColorHint(); }
      else if (chainLen > 3) resetChainTimer();
      inputLocked = false;
      resumeChainTimer();
      updateBoosterUI();
      updateChainIndicator();
      // Check if all cards of chain color are found
      const activeColors = getRule('coloredBombs') ? [...chainColors] : [chainColor];
      const remaining = board.filter(c => c && !c.special && !c.flipped && activeColors.includes(c.color));
      if (chainColor !== null && remaining.length === 0) {
        // Colour clear — endTurn shows the "<COLOUR> Cleared" banner, refunds the turn,
        // and (when the Perfect Sweep Reveal rule is on) flashes the board.
        stopChainTimer();
        inputLocked = true;
        setTimeout(() => endTurn(false, false), 600);
      }
    }, 400);
  } else {
    // Normal peek — flash then hide
    setTimeout(() => {
      card.flipped = false;
      if (el) el.classList.remove('flipped');
      inputLocked = false;
      resumeChainTimer();
      updateBoosterUI();
      updateChainIndicator();
    }, 1500);
  }
}

function executeBoosterTap(id, index) {
  consumeBooster(id); activeBooster = null;
  const { r, c } = toRC(index);
  if (id === 'peek') { executePeek(index); return; }
  else if (id === 'joker') { executeJoker(index); return; }
  else if (id === 'cross') {
    const t = [[-1,0],[1,0],[0,-1],[0,1]].map(([dr,dc]) => toIndex(r+dr,c+dc)).filter(i=>i>=0);
    t.push(index); boosterReveal(t);
  } else if (id === 'row') {
    const t = []; for(let cc=0;cc<COLS;cc++) t.push(toIndex(r,cc)); boosterReveal(t);
  } else if (id === 'col') {
    const t = []; for(let rr=0;rr<ROWS;rr++) t.push(toIndex(rr,c)); boosterReveal(t);
  }
  updateBoosterUI();
}

function executeJoker(index) {
  const card = board[index];
  if (!card || card.flipped || card.locked) { updateBoosterUI(); return; }

  // Nothing to copy yet — refund the charge
  if (lastSelectedIdx < 0) {
    boosterCounts['joker']++;
    saveBoosterCounts();
    updateBoosterUI();
    return;
  }

  const srcCard = board[lastSelectedIdx];
  const el = getCardEl(index);

  if (srcCard && srcCard.special) {
    // Transform this card into a copy of the source special card
    card.special = srcCard.special;
    card.bombColor = srcCard.bombColor || null;
    // Rebuild the card's DOM to look like a special card
    if (el) {
      el.classList.add('special');
      el.classList.remove('locked');
      if (card.bombColor) { el.classList.add('bomb-colored'); el.style.setProperty('--bomb-color', cssColor(card.bombColor)); }
      const front = el.querySelector('.card-front');
      if (front) {
        ALL_COLORS.forEach(cl => front.classList.remove(cl));
        front.className = `card-face card-front ${specialCSS(card.special)}`;
        front.innerHTML = `<span class="special-icon">${specialIcon(card.special)}</span>`;
      }
    }
  } else if (srcCard && srcCard.color) {
    // Copy the color of the source normal card
    card.color = srcCard.color;
    if (el) {
      const front = el.querySelector('.card-front');
      if (front) { ALL_COLORS.forEach(cl => front.classList.remove(cl)); front.classList.add(card.color); const img = front.querySelector('img'); if (img) img.src = `blocks/block_${card.color}_1.png`; }
    }
  } else {
    // Nothing useful to copy — refund
    boosterCounts['joker']++;
    saveBoosterCounts();
    updateBoosterUI();
    return;
  }

  updateBoosterUI();
  // Now process the tap as if the player normally clicked this card
  onCardClick(index);
}

function boosterReveal(indices) {
  const targets = indices.filter(i => i>=0 && board[i] && !board[i].special && !board[i].flipped && !board[i].locked);
  if (!targets.length) { inputLocked = false; updateBoosterUI(); return; }
  inputLocked = true;
  pauseChainTimer();
  targets.forEach((idx, i) => {
    setTimeout(() => {
      board[idx].flipped = true;
      const el = getCardEl(idx);
      if (el) { el.classList.add('flipped','reveal-flash'); el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true}); }
      SFX.cardFlip();
    }, i * 80);
  });
  setTimeout(() => {
    targets.forEach(idx => { board[idx].flipped = false; const el = getCardEl(idx); if(el) el.classList.remove('flipped'); });
    inputLocked = false; resumeChainTimer(); updateBoosterUI(); updateChainIndicator();
  }, targets.length * 80 + 1500);
}

function executeRandom3() {
  const fd = board.filter(c=>c&&!c.flipped&&!c.special&&!c.locked).map(c=>c.index).sort(()=>Math.random()-.5);
  const picks = fd.slice(0,3);
  if (!picks.length) { inputLocked = false; updateBoosterUI(); return; }

  const matches = idx => turnActive && (board[idx].color === chainColor || (getRule('coloredBombs') && chainColors.has(board[idx].color)));
  const nonMatching = picks.filter(idx => !matches(idx));

  // No chain active or nothing matches — behave like a plain reveal
  if (picks.every(idx => !matches(idx))) { boosterReveal(picks); return; }

  inputLocked = true;
  pauseChainTimer();

  // Flip all picked cards with a staggered flash; matching ones join the chain
  picks.forEach((idx, i) => {
    setTimeout(() => {
      board[idx].flipped = true;
      const el = getCardEl(idx);
      if (el) { el.classList.add('flipped','reveal-flash'); el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true}); }
      SFX.cardFlip();
      if (matches(idx) && !chainCards.includes(idx)) {
        chainCards.push(idx); lastSelectedIdx = idx; SFX.shepard(chainCards.length + specialsUsed.length - 1);
        SFX.match();
        spawnParticles([idx], board[idx].color);
      }
    }, i * 80);
  });

  // After the reveal: hide non-matching cards, resolve chain state
  setTimeout(() => {
    nonMatching.forEach(idx => { board[idx].flipped = false; const el = getCardEl(idx); if (el) el.classList.remove('flipped'); });
    const chainLen = chainCards.length + specialsUsed.length;
    if (chainLen === 3) { startChainTimer(); applyChainColorHint(); }
    else if (chainLen > 3) resetChainTimer();
    inputLocked = false;
    resumeChainTimer();
    updateBoosterUI();
    updateChainIndicator();
    // Check if all cards of chain color are found
    const activeColors = getRule('coloredBombs') ? [...chainColors] : [chainColor];
    const remaining = board.filter(c => c && !c.special && !c.flipped && activeColors.includes(c.color));
    if (chainColor !== null && remaining.length === 0) {
      // Colour clear — endTurn shows the "<COLOUR> Cleared" banner, refunds the turn,
      // and (when the Perfect Sweep Reveal rule is on) flashes the board.
      stopChainTimer();
      inputLocked = true;
      setTimeout(() => endTurn(false, false), 600);
    }
  }, picks.length * 80 + 1500);
}
function executeNeighbor() {
  const last = [...chainCards].reverse().find(i=>!board[i].special);
  if (last===undefined) { updateBoosterUI(); return; }
  const card = board[last]; const {r,c} = toRC(last);
  const t = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
    .map(([dr,dc])=>toIndex(r+dr,c+dc))
    .filter(i=>i>=0&&board[i]&&!board[i].special&&!board[i].flipped&&!board[i].locked&&board[i].color===card.color);
  if (!t.length) { updateBoosterUI(); return; }
  boosterReveal(t);
}
function executeColorPick() {
  // Only show colors present on the current level
  const choices = colorPickerEl.querySelectorAll('.color-choice');
  choices.forEach(el => {
    const color = (el.className.match(/cc-(\w+)/) || [])[1];
    el.style.display = color && ACTIVE_COLORS.includes(color) ? '' : 'none';
  });
  colorPickerEl.classList.add('active'); inputLocked = true;
}
function pickColor(color) {
  colorPickerEl.classList.remove('active');
  if (!color) { inputLocked = false; boosterCounts['colorpick']++; saveBoosterCounts(); updateBoosterUI(); return; }
  const m = board.filter(c=>c&&!c.flipped&&!c.special&&c.color===color&&!c.locked).map(c=>c.index).sort(()=>Math.random()-.5);
  const picks = m.slice(0, 3);

  // No face-down cards of that color — refund and notify
  if (picks.length === 0) {
    boosterCounts['colorpick']++;
    saveBoosterCounts();
    inputLocked = false;
    updateBoosterUI();
    const prev = chainEl.innerHTML;
    chainEl.innerHTML = `<span style="color:#e74c3c">No hidden ${color} cards found — refunded 🎨</span>`;
    setTimeout(() => { chainEl.innerHTML = prev; }, 1800);
    return;
  }

  // If chain is active and picked color matches a chain color, add to chain
  const colorMatchesChain = turnActive && (color === chainColor || (getRule('coloredBombs') && chainColors.has(color)));
  if (colorMatchesChain && picks.length > 0) {
    inputLocked = true;
    pauseChainTimer();
    picks.forEach((idx, i) => {
      setTimeout(() => {
        board[idx].flipped = true;
        const el = getCardEl(idx);
        if (el) { el.classList.add('flipped', 'reveal-flash'); el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true}); }
        SFX.cardFlip();
        if (!chainCards.includes(idx)) { chainCards.push(idx); lastSelectedIdx = idx; SFX.shepard(chainCards.length + specialsUsed.length - 1); }
      }, i * 80);
    });
    setTimeout(() => {
      const chainLen = chainCards.length + specialsUsed.length;
      if (chainLen === 3) { startChainTimer(); applyChainColorHint(); }
      else if (chainLen > 3) resetChainTimer();
      inputLocked = false;
      resumeChainTimer();
      updateBoosterUI();
      updateChainIndicator();
      // Check if all cards of chain color are found
      const activeColors = getRule('coloredBombs') ? [...chainColors] : [chainColor];
      const remaining = board.filter(c => c && !c.special && !c.flipped && activeColors.includes(c.color));
      if (chainColor !== null && remaining.length === 0) {
        // Colour clear — endTurn shows the "<COLOUR> Cleared" banner, refunds the turn,
        // and (when the Perfect Sweep Reveal rule is on) flashes the board.
        stopChainTimer();
        inputLocked = true;
        setTimeout(() => endTurn(false, false), 600);
      }
    }, picks.length * 80 + 200);
  } else {
    boosterReveal(picks);
  }
}
