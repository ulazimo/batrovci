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

// ============================================================
// BOOSTERS
// ============================================================
function initBoosters() {
  boosterBar.innerHTML = '';
  BOOSTERS.forEach(b => {
    const s = getBoosterSetting(b.id);
    if (!s.enabled) { boosterCounts[b.id] = 0; return; }
    // Use persisted count if available, otherwise fall back to settings qty
    if (progress.boosterCounts[b.id] !== undefined) {
      boosterCounts[b.id] = progress.boosterCounts[b.id];
    } else {
      boosterCounts[b.id] = s.qty;
    }
    // Enforce per-booster inventory cap (bombs are capped low)
    boosterCounts[b.id] = Math.min(boosterCounts[b.id], getBoosterMax(b.id));
    const btn = document.createElement('div');
    btn.className = 'booster-btn'; btn.dataset.booster = b.id;
    btn.innerHTML = `<span>${b.icon}</span><span class="badge">${boosterCounts[b.id]}</span>`;
    btn.addEventListener('click', () => activateBooster(b.id));
    let pt = null;
    btn.addEventListener('pointerdown', () => { pt = setTimeout(() => { showTooltip(b, btn); pt='shown'; }, 400); });
    btn.addEventListener('pointerup',    () => { if(pt!=='shown') clearTimeout(pt); hideTooltip(); });
    btn.addEventListener('pointerleave', () => { if(pt!=='shown') clearTimeout(pt); hideTooltip(); });
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
  SFX.booster();
  clearBombPlacement(); // clear glow if switching from another bomb
  // Bomb power-ups (Baby Bomb / BIG Bomb): enter placement mode like Bank-It "Place Bomb"
  if (b.bomb) {
    activeBooster = id;
    boardEl.classList.add('bomb-placement');
    if (b.bomb === 'ring') boardEl.classList.add('bomb-place-big'); // BIG Bomb → distinct colour
    showTutorialHint(`Tap a card to drop the ${b.name} — it destroys the cards around it!`);
    updateBoosterUI(); updateChainIndicator(); return;
  }
  if (b.needsTap) { activeBooster = id; updateBoosterUI(); updateChainIndicator(); return; }
  consumeBooster(id);
  if (id === 'random3')   executeRandom3();
  else if (id === 'neighbor')  executeNeighbor();
  else if (id === 'colorpick') executeColorPick();
  else if (id === 'shield') { shieldCharges += 2; updateStatusBadge(); updateChainIndicator(); updateBoosterUI(); }
}

// ============================================================
// CHAIN REWARDS — completing a chain grants a power-up (no board special)
//   chain 3-4 → Peek, 5-6 → Baby Bomb, 7+ → BIG Bomb (highest tier only)
// ============================================================
function getChainRewardBooster(comboLen) {
  if (comboLen >= 7) return 'bigbomb';
  if (comboLen >= 5) return 'babybomb';
  if (comboLen >= 3) return 'peek';
  return null;
}

function grantChainReward(comboLen) {
  const id = getChainRewardBooster(comboLen);
  if (!id) return;
  const max = getBoosterMax(id);
  const before = boosterCounts[id] || 0;
  boosterCounts[id] = Math.min(max, before + 1);
  saveBoosterCounts();
  updateBoosterUI();
  // Silent reward — just pulse the earned power-up's button (no top text notification)
  if (boosterCounts[id] > before) flashBoosterButton(id);
}

function flashBoosterButton(id) {
  const btn = boosterBar.querySelector(`.booster-btn[data-booster="${id}"]`);
  if (!btn) return;
  btn.classList.add('reward-flash');
  btn.addEventListener('animationend', () => btn.classList.remove('reward-flash'), { once: true });
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
      if (chainLen === 3) startChainTimer();
      else if (chainLen > 3) resetChainTimer();
      inputLocked = false;
      resumeChainTimer();
      updateBoosterUI();
      updateChainIndicator();
      // Check if all cards of chain color are found
      const activeColors = getRule('coloredBombs') ? [...chainColors] : [chainColor];
      const remaining = board.filter(c => c && !c.special && !c.flipped && activeColors.includes(c.color));
      if (remaining.length === 0 && chainLen >= getMinCombo()) {
        stopChainTimer();
        inputLocked = true;
        if (isSweepRevealActive()) {
          setTimeout(() => endTurn(false, true), 600);
        } else {
          showBoardBanner('sweep', '🎯 ALL COLORS FOUND!', 'Great memory! Special card incoming...');
          setTimeout(() => hideBoardBanner(() => endTurn(false, false)), 1200);
        }
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
  const fd = board.filter(c=>c&&!c.flipped&&!c.special).map(c=>c.index).sort(()=>Math.random()-.5);
  boosterReveal(fd.slice(0,3));
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
      if (chainLen === 3) startChainTimer();
      else if (chainLen > 3) resetChainTimer();
      inputLocked = false;
      resumeChainTimer();
      updateBoosterUI();
      updateChainIndicator();
      // Check if all cards of chain color are found
      const activeColors = getRule('coloredBombs') ? [...chainColors] : [chainColor];
      const remaining = board.filter(c => c && !c.special && !c.flipped && activeColors.includes(c.color));
      if (remaining.length === 0 && chainLen >= getMinCombo()) {
        stopChainTimer();
        inputLocked = true;
        if (isSweepRevealActive()) {
          setTimeout(() => endTurn(false, true), 600);
        } else {
          showBoardBanner('sweep', '🎯 ALL COLORS FOUND!', 'Great memory! Special card incoming...');
          setTimeout(() => hideBoardBanner(() => endTurn(false, false)), 1200);
        }
      }
    }, picks.length * 80 + 200);
  } else {
    boosterReveal(picks);
  }
}
