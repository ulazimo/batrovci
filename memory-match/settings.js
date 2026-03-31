// ============================================================
// GAMEPLAY RULES — toggleable behaviors that change core mechanics
// Add new rules here; they auto-appear in the settings panel
// ============================================================
const GAMEPLAY_RULES = [
  { id: 'instantSpecialReveal', name: 'Instant Special Reveal', icon: '⚡',
    desc: 'Special cards reveal surrounding cards immediately on click instead of at end of turn',
    default: false },
  { id: 'hiddenNewCards', name: 'Hidden New Cards', icon: '🂠',
    desc: 'New cards that replace combos arrive face-down instead of briefly revealed',
    default: false },
  { id: 'chainPulse', name: 'Chain Pulse', icon: '💓',
    desc: 'Flipped cards pulse in size during a combo chain — intensity increases with chain length',
    default: true },
  { id: 'chainTimer', name: 'Chain Timer', icon: '⏱',
    desc: 'A countdown timer starts at chain length 3 — if it expires, the chain breaks',
    default: true },
  { id: 'revealOnUnlock', name: 'Reveal on Unlock', icon: '🔓',
    desc: 'When a locked card is unlocked, briefly reveal its color',
    default: false },
  { id: 'sweepReveal', name: 'Perfect Sweep Reveal', icon: '🧹',
    desc: 'A perfect sweep briefly reveals the entire board before hiding it again',
    default: true },
  { id: 'coloredBombs', name: 'Colored Bombs', icon: '🎨',
    desc: 'Bombs inherit the color of the combo that created them. Using a bomb opens a parallel chain of that color — match either color to continue. If all board colors have active chains, auto-reveal all cards for a 500pt bonus!',
    default: false },
];

function getRule(id) {
  const rule = GAMEPLAY_RULES.find(r => r.id === id);
  if (progress.gameplayRules[id] === undefined) progress.gameplayRules[id] = rule ? rule.default : false;
  return progress.gameplayRules[id];
}

const DEFAULT_CHAIN_TIMER = 10; // seconds
function getChainTimerDuration() {
  return progress.chainTimerDuration || DEFAULT_CHAIN_TIMER;
}

function toggleRule(id) {
  progress.gameplayRules[id] = !getRule(id);
  document.getElementById('rule-toggle-' + id).classList.toggle('on', progress.gameplayRules[id]);
  document.getElementById('rule-row-' + id).classList.toggle('disabled', !progress.gameplayRules[id]);
  saveProgress();
}

// ============================================================
// COMBO MAPPING UI
// ============================================================
function renderComboMapping() {
  const container = document.getElementById('combo-map-container');
  if (!container) return;
  container.innerHTML = '';
  const map = getComboMapping();

  map.forEach((entry, idx) => {
    const row = document.createElement('div');
    row.className = 'combo-map-row';
    const comboLabel = typeof entry.combo === 'string' ? `Combo ${entry.combo}` : `Combo ${entry.combo}`;
    const optionsHTML = SPECIAL_TYPES.map(s =>
      `<option value="${s.id}" ${s.id===entry.specialId?'selected':''}>${s.icon} ${s.name} — ${s.desc}</option>`
    ).join('');
    row.innerHTML = `
      <span class="combo-map-label">${comboLabel}</span>
      <span class="combo-map-arrow">\u2192</span>
      <select class="combo-map-select" onchange="updateComboMap(${idx},this.value)">${optionsHTML}</select>
      ${map.length > 1 ? `<button class="combo-map-remove" onclick="removeComboMap(${idx})">\u2715</button>` : ''}
    `;
    container.appendChild(row);
  });

  const addBtn = document.createElement('div');
  addBtn.className = 'combo-map-add';
  addBtn.textContent = '+ Add Combo Rule';
  addBtn.onclick = addComboMapRule;
  container.appendChild(addBtn);
}

function updateComboMap(idx, specialId) {
  const map = getComboMapping();
  map[idx].specialId = specialId;
  setComboMapping(map);
}

function removeComboMap(idx) {
  const map = getComboMapping();
  map.splice(idx, 1);
  setComboMapping(map);
  renderComboMapping();
}

function addComboMapRule() {
  const map = getComboMapping();
  // Find the next combo number not yet mapped
  const usedNums = map.map(m => typeof m.combo === 'number' ? m.combo : parseInt(m.combo));
  let next = 4;
  while (usedNums.includes(next)) next++;
  // If all exact numbers are taken, suggest a range
  const isRange = next > 10;
  map.push({ combo: isRange ? `${next}+` : next, specialId: SPECIAL_TYPES[0].id });
  setComboMapping(map);
  renderComboMapping();
}

function renderLevelRewards() {
  const container = document.getElementById('level-rewards-container');
  if (!container) return;
  container.innerHTML = '';
  const rewards = getLevelRewards();

  rewards.forEach((entry, idx) => {
    const type = entry.type || 'booster';
    const itemId = type === 'special' ? (entry.specialId || SPECIAL_TYPES[0].id) : (entry.boosterId || BOOSTERS[0].id);

    const boosterOpts = BOOSTERS.map(b =>
      `<option value="${b.id}" ${type==='booster' && b.id===itemId?'selected':''}>${b.icon} ${b.name || b.id}</option>`
    ).join('');
    const specialOpts = SPECIAL_TYPES.map(s =>
      `<option value="${s.id}" ${type==='special' && s.id===itemId?'selected':''}>${s.icon} ${s.name}</option>`
    ).join('');

    const row = document.createElement('div');
    row.className = 'combo-map-row';
    row.innerHTML = `
      <span class="combo-map-label">After</span>
      <select class="combo-map-select" onchange="updateLevelReward(${idx},'level',this.value)">
        ${LEVELS.map(l => `<option value="${l.id}" ${l.id===entry.afterLevel?'selected':''}>Lv ${l.id}</option>`).join('')}
      </select>
      <span class="combo-map-arrow">→</span>
      <select class="combo-map-select" style="width:auto;min-width:70px;" onchange="updateLevelReward(${idx},'type',this.value)">
        <option value="booster" ${type==='booster'?'selected':''}>Power-Up</option>
        <option value="special" ${type==='special'?'selected':''}>Special Card</option>
      </select>
      <select class="combo-map-select" id="reward-item-${idx}" onchange="updateLevelReward(${idx},'item',this.value)">
        ${type === 'special' ? specialOpts : boosterOpts}
      </select>
      <span class="combo-map-label" style="min-width:auto;">×</span>
      <div class="qty-control">
        <button class="qty-btn" onclick="updateLevelReward(${idx},'qty',-1)">−</button>
        <span class="qty-value" id="reward-qty-${idx}">${entry.qty}</span>
        <button class="qty-btn" onclick="updateLevelReward(${idx},'qty',1)">+</button>
      </div>
      ${rewards.length > 1 ? `<button class="combo-map-remove" onclick="removeLevelReward(${idx})">✕</button>` : ''}
    `;
    container.appendChild(row);
  });

  const addBtn = document.createElement('div');
  addBtn.className = 'combo-map-add';
  addBtn.textContent = '+ Add Level Reward';
  addBtn.onclick = addLevelReward;
  container.appendChild(addBtn);
}

function updateLevelReward(idx, field, value) {
  const rewards = getLevelRewards();
  if (field === 'level') rewards[idx].afterLevel = parseInt(value);
  else if (field === 'type') {
    rewards[idx].type = value;
    // Reset item to first of the new type
    if (value === 'special') { rewards[idx].specialId = SPECIAL_TYPES[0].id; delete rewards[idx].boosterId; }
    else { rewards[idx].boosterId = BOOSTERS[0].id; delete rewards[idx].specialId; }
    setLevelRewards(rewards);
    renderLevelRewards();
    return;
  } else if (field === 'item') {
    if ((rewards[idx].type || 'booster') === 'special') rewards[idx].specialId = value;
    else rewards[idx].boosterId = value;
  } else if (field === 'qty') {
    rewards[idx].qty = Math.max(1, Math.min(9, rewards[idx].qty + parseInt(value)));
    const el = document.getElementById('reward-qty-' + idx);
    if (el) el.textContent = rewards[idx].qty;
  }
  setLevelRewards(rewards);
}

function removeLevelReward(idx) {
  const rewards = getLevelRewards();
  rewards.splice(idx, 1);
  setLevelRewards(rewards);
  renderLevelRewards();
}

function addLevelReward() {
  const rewards = getLevelRewards();
  rewards.push({ afterLevel: 1, type: 'booster', boosterId: 'peek', qty: 1 });
  setLevelRewards(rewards);
  renderLevelRewards();
}

// ============================================================
// WIN STREAK CONFIG — add/remove levels here to expand
// Each entry: { streak, revealPct, shields }
// ============================================================
const WIN_STREAK_LEVELS = [
  { streak: 0, revealPct: 0,    shields: 0 },
  { streak: 1, revealPct: 0.1,  shields: 1 },
  { streak: 2, revealPct: 0.25, shields: 2 },
  { streak: 3, revealPct: 0.50, shields: 3 },
  { streak: 4, revealPct: 0.75, shields: 4 },
  { streak: 5, revealPct: 1.0,  shields: 5 },
];
const KEEP_STREAK_COST = 100;

// Winstreak effect types
const STREAK_EFFECTS = [
  { id: 'reveal', name: 'Reveal', icon: '👁', desc: 'Reveal a % of the board at level start' },
  { id: 'shield', name: 'Shield', icon: '🛡', desc: 'Start with shields that protect your combo' },
];

function getStreakEffect() { return progress.streakEffect || 'reveal'; }
function setStreakEffect(id) { progress.streakEffect = id; saveProgress(); }

function getWinStreakStartLevel() { return progress.winStreakStartLevel || 1; }
function setWinStreakStartLevel(lvl) { progress.winStreakStartLevel = lvl; saveProgress(); }
function adjustWinStreakStartLevel(delta) {
  const cur = getWinStreakStartLevel();
  const newVal = Math.max(1, Math.min(LEVELS.length, cur + delta));
  setWinStreakStartLevel(newVal);
  document.getElementById('ws-start-level').textContent = newVal;
}
function isWinStreakActive() {
  return LEVELS[currentLevelIndex].id >= getWinStreakStartLevel();
}

function getDeploySpecialsStartLevel() { return progress.deploySpecialsStartLevel || 1; }
function setDeploySpecialsStartLevel(lvl) { progress.deploySpecialsStartLevel = lvl; saveProgress(); }
function adjustDeploySpecialsStartLevel(delta) {
  const cur = getDeploySpecialsStartLevel();
  const newVal = Math.max(1, Math.min(LEVELS.length, cur + delta));
  setDeploySpecialsStartLevel(newVal);
  document.getElementById('deploy-specials-start-level').textContent = newVal;
}
function isDeploySpecialsActive() {
  return LEVELS[currentLevelIndex].id >= getDeploySpecialsStartLevel();
}

function getSweepRevealStartLevel() { return progress.sweepRevealStartLevel || 1; }
function setSweepRevealStartLevel(lvl) { progress.sweepRevealStartLevel = lvl; saveProgress(); }
function adjustSweepRevealStartLevel(delta) {
  const cur = getSweepRevealStartLevel();
  const newVal = Math.max(1, Math.min(LEVELS.length, cur + delta));
  setSweepRevealStartLevel(newVal);
  document.getElementById('sweep-reveal-start-level').textContent = newVal;
}
function isSweepRevealActive() {
  return getRule('sweepReveal') && LEVELS[currentLevelIndex].id >= getSweepRevealStartLevel();
}

function getRecallStartLevel() { return progress.recallStartLevel ?? 1; }
function setRecallStartLevel(lvl) { progress.recallStartLevel = lvl; saveProgress(); }
function adjustRecallStartLevel(delta) {
  const newVal = Math.max(1, Math.min(LEVELS.length, getRecallStartLevel() + delta));
  setRecallStartLevel(newVal);
  const el = document.getElementById('recall-start-level');
  if (el) el.textContent = newVal;
  updateRecallBar();
}
function isRecallActive() {
  return LEVELS[currentLevelIndex].id >= getRecallStartLevel();
}
function updateRecallBar() {
  const bar = document.getElementById('recall-bar');
  if (bar) bar.style.display = isRecallActive() ? '' : 'none';
}

function getStreakRevealPct() {
  if (getStreakEffect() !== 'reveal') return 0;
  let pct = 0;
  for (const lvl of WIN_STREAK_LEVELS) {
    if (progress.winStreak >= lvl.streak) pct = lvl.revealPct;
  }
  return pct;
}

function getStreakShields() {
  if (getStreakEffect() !== 'shield') return 0;
  let shields = 0;
  for (const lvl of WIN_STREAK_LEVELS) {
    if (progress.winStreak >= lvl.streak) shields = lvl.shields;
  }
  return shields;
}

function getStreakLevel() {
  let level = 0;
  for (let i = WIN_STREAK_LEVELS.length - 1; i >= 0; i--) {
    if (progress.winStreak >= WIN_STREAK_LEVELS[i].streak) { level = i; break; }
  }
  return level;
}

// ============================================================
// PERSISTENCE
// ============================================================
function loadProgress() {
  try { return JSON.parse(localStorage.getItem('mm_progress') || '{}'); }
  catch(e) { return {}; }
}
function saveProgress() {
  try { localStorage.setItem('mm_progress', JSON.stringify(progress)); } catch(e) {}
}

let progress = loadProgress();
if (!progress.highestUnlocked) progress.highestUnlocked = 0;
if (!progress.stars) progress.stars = [];
if (!progress.winStreak) progress.winStreak = 0;
if (!progress.gameplayRules) progress.gameplayRules = {};
if (!progress.boosterCounts) progress.boosterCounts = {};
if (progress.tutorialComplete === undefined) progress.tutorialComplete = false;
if (progress.boosterTutorialDone === undefined) progress.boosterTutorialDone = false;
if (!progress.specialInventory) {
  progress.specialInventory = {};
  // Defer actual init until SPECIAL_TYPES is defined (see initInventoryDefaults)
}

function initInventoryDefaults() {
  SPECIAL_TYPES.forEach(s => {
    if (progress.specialInventory[s.id] === undefined) progress.specialInventory[s.id] = 0;
  });
  saveProgress();
}

// ============================================================
// POWER-UP SETTINGS
// ============================================================
const DEFAULT_BOOSTER_QTY = 3;
const MAX_BOOSTER_QTY = 9;

if (!progress.boosterSettings) progress.boosterSettings = {};

function getBoosterSetting(id) {
  if (!progress.boosterSettings[id]) progress.boosterSettings[id] = { enabled: true, qty: DEFAULT_BOOSTER_QTY };
  return progress.boosterSettings[id];
}

let settingsReturnTo = null; // tracks where to go back: 'level-select' or 'game'

function showSettings(returnTo) {
  settingsReturnTo = returnTo;
  const list = document.getElementById('settings-list');
  list.innerHTML = '';

  // Gameplay rules section
  if (GAMEPLAY_RULES.length > 0) {
    const header = document.createElement('div');
    header.style.cssText = 'font-size:13px;font-weight:700;color:#f0c040;margin:8px 0 4px;text-transform:uppercase;letter-spacing:1px;';
    header.textContent = 'Gameplay';
    list.appendChild(header);

    GAMEPLAY_RULES.forEach(r => {
      const enabled = getRule(r.id);
      const row = document.createElement('div');
      row.className = 'setting-row' + (enabled ? '' : ' disabled');
      row.id = 'rule-row-' + r.id;
      row.innerHTML = `
        <span class="setting-icon">${r.icon}</span>
        <div class="setting-info">
          <div class="setting-name">${r.name}</div>
          <div class="setting-desc">${r.desc}</div>
        </div>
        <div class="setting-controls">
          <button class="setting-toggle ${enabled?'on':''}" id="rule-toggle-${r.id}" onclick="toggleRule('${r.id}')"></button>
        </div>
      `;
      list.appendChild(row);
    });

    // Chain Timer duration control (only shown when chainTimer is enabled)
    if (getRule('chainTimer')) {
      const timerRow = document.createElement('div');
      timerRow.className = 'setting-row';
      timerRow.innerHTML = `
        <span class="setting-icon">⏱</span>
        <div class="setting-info">
          <div class="setting-name">Timer Duration</div>
          <div class="setting-desc">Seconds before chain expires (starts at chain length 3)</div>
        </div>
        <div class="setting-controls">
          <div class="qty-control">
            <button class="qty-btn" onclick="adjustChainTimer(-1)">−</button>
            <span class="qty-value" id="chain-timer-val">${getChainTimerDuration()}s</span>
            <button class="qty-btn" onclick="adjustChainTimer(1)">+</button>
          </div>
        </div>
      `;
      list.appendChild(timerRow);
    }

    // Winstreak Effect section
    const wsHeader = document.createElement('div');
    wsHeader.style.cssText = 'font-size:13px;font-weight:700;color:#f0c040;margin:12px 0 4px;text-transform:uppercase;letter-spacing:1px;';
    wsHeader.textContent = 'Winstreak Effect';
    list.appendChild(wsHeader);

    // Winstreak start level
    const wsStartRow = document.createElement('div');
    wsStartRow.className = 'setting-row';
    wsStartRow.innerHTML = `
      <span class="setting-icon">🔥</span>
      <div class="setting-info">
        <div class="setting-name">Enabled from Level</div>
        <div class="setting-desc">Winstreak only activates from this level onwards</div>
      </div>
      <div class="setting-controls">
        <div class="qty-control">
          <button class="qty-btn" onclick="adjustWinStreakStartLevel(-1)">−</button>
          <span class="qty-value" id="ws-start-level">${getWinStreakStartLevel()}</span>
          <button class="qty-btn" onclick="adjustWinStreakStartLevel(1)">+</button>
        </div>
      </div>
    `;
    list.appendChild(wsStartRow);

    const currentEffect = getStreakEffect();
    STREAK_EFFECTS.forEach(eff => {
      const active = currentEffect === eff.id;
      const row = document.createElement('div');
      row.className = 'setting-row' + (active ? '' : ' disabled');
      row.style.cursor = 'pointer';
      row.innerHTML = `
        <span class="setting-icon">${eff.icon}</span>
        <div class="setting-info">
          <div class="setting-name">${eff.name}</div>
          <div class="setting-desc">${eff.desc}</div>
        </div>
        <div class="setting-controls">
          <div class="setting-toggle ${active ? 'on' : ''}" style="pointer-events:none;"></div>
        </div>
      `;
      row.addEventListener('click', () => { setStreakEffect(eff.id); showSettings(settingsReturnTo); });
      list.appendChild(row);
    });

    // Deploy Special Cards start level
    const dsStartRow = document.createElement('div');
    dsStartRow.className = 'setting-row';
    dsStartRow.innerHTML = `
      <span class="setting-icon">🎴</span>
      <div class="setting-info">
        <div class="setting-name">Deploy Specials from Level</div>
        <div class="setting-desc">Special card deployment unlocks at this level</div>
      </div>
      <div class="setting-controls">
        <div class="qty-control">
          <button class="qty-btn" onclick="adjustDeploySpecialsStartLevel(-1)">−</button>
          <span class="qty-value" id="deploy-specials-start-level">${getDeploySpecialsStartLevel()}</span>
          <button class="qty-btn" onclick="adjustDeploySpecialsStartLevel(1)">+</button>
        </div>
      </div>
    `;
    list.appendChild(dsStartRow);

    // Recall start level
    const recallStartRow = document.createElement('div');
    recallStartRow.className = 'setting-row';
    recallStartRow.innerHTML = `
      <span class="setting-icon">🔄</span>
      <div class="setting-info">
        <div class="setting-name">Recall from Level</div>
        <div class="setting-desc">Recall button appears from this level onwards</div>
      </div>
      <div class="setting-controls">
        <div class="qty-control">
          <button class="qty-btn" onclick="adjustRecallStartLevel(-1)">−</button>
          <span class="qty-value" id="recall-start-level">${getRecallStartLevel()}</span>
          <button class="qty-btn" onclick="adjustRecallStartLevel(1)">+</button>
        </div>
      </div>
    `;
    list.appendChild(recallStartRow);

    // Sweep Reveal start level
    const srStartRow = document.createElement('div');
    srStartRow.className = 'setting-row';
    srStartRow.innerHTML = `
      <span class="setting-icon">🧹</span>
      <div class="setting-info">
        <div class="setting-name">Sweep Reveal from Level</div>
        <div class="setting-desc">Perfect sweep board reveal unlocks at this level</div>
      </div>
      <div class="setting-controls">
        <div class="qty-control">
          <button class="qty-btn" onclick="adjustSweepRevealStartLevel(-1)">−</button>
          <span class="qty-value" id="sweep-reveal-start-level">${getSweepRevealStartLevel()}</span>
          <button class="qty-btn" onclick="adjustSweepRevealStartLevel(1)">+</button>
        </div>
      </div>
    `;
    list.appendChild(srStartRow);

    // Combo → Special mapping section
    const comboHeader = document.createElement('div');
    comboHeader.style.cssText = 'font-size:13px;font-weight:700;color:#f0c040;margin:12px 0 4px;text-transform:uppercase;letter-spacing:1px;';
    comboHeader.textContent = 'Combo \u2192 Special Card';
    list.appendChild(comboHeader);

    const comboContainer = document.createElement('div');
    comboContainer.id = 'combo-map-container';
    list.appendChild(comboContainer);
    renderComboMapping();

    // Level Rewards section
    const rewardsHeader = document.createElement('div');
    rewardsHeader.style.cssText = 'font-size:13px;font-weight:700;color:#f0c040;margin:12px 0 4px;text-transform:uppercase;letter-spacing:1px;';
    rewardsHeader.textContent = 'Level Rewards';
    list.appendChild(rewardsHeader);
    const rewardsContainer = document.createElement('div');
    rewardsContainer.id = 'level-rewards-container';
    list.appendChild(rewardsContainer);
    renderLevelRewards();

    const divider = document.createElement('div');
    divider.style.cssText = 'font-size:13px;font-weight:700;color:#f0c040;margin:12px 0 4px;text-transform:uppercase;letter-spacing:1px;';
    divider.textContent = 'Power-Ups';
    list.appendChild(divider);
  }

  BOOSTERS.forEach(b => {
    const s = getBoosterSetting(b.id);
    const row = document.createElement('div');
    row.className = 'setting-row' + (s.enabled ? '' : ' disabled');
    row.id = 'setting-row-' + b.id;
    row.innerHTML = `
      <span class="setting-icon">${b.icon}</span>
      <div class="setting-info">
        <div class="setting-name">${b.id.charAt(0).toUpperCase()+b.id.slice(1)}</div>
        <div class="setting-desc">${b.desc}</div>
      </div>
      <div class="setting-controls">
        <div class="qty-control">
          <button class="qty-btn" onclick="adjustQty('${b.id}',-1)">−</button>
          <span class="qty-value" id="qty-${b.id}">${boosterCounts[b.id] !== undefined ? boosterCounts[b.id] : s.qty}</span>
          <button class="qty-btn" onclick="adjustQty('${b.id}',1)">+</button>
        </div>
        <button class="setting-toggle ${s.enabled?'on':''}" id="toggle-${b.id}" onclick="toggleBoosterSetting('${b.id}')"></button>
      </div>
    `;
    list.appendChild(row);
  });
  // Special Card Inventory section
  const invHeader = document.createElement('div');
  invHeader.style.cssText = 'font-size:13px;font-weight:700;color:#f0c040;margin:12px 0 4px;text-transform:uppercase;letter-spacing:1px;';
  invHeader.textContent = 'Special Card Inventory';
  list.appendChild(invHeader);

  SPECIAL_TYPES.forEach(spec => {
    const qty = progress.specialInventory[spec.id] || 0;
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.innerHTML = `
      <span class="setting-icon">${spec.icon}</span>
      <div class="setting-info">
        <div class="setting-name">${spec.name}</div>
        <div class="setting-desc">${spec.desc}</div>
      </div>
      <div class="setting-controls">
        <div class="qty-control">
          <button class="qty-btn" onclick="adjustInventory('${spec.id}',-1)">−</button>
          <span class="qty-value" id="inv-qty-${spec.id}">${qty}</span>
          <button class="qty-btn" onclick="adjustInventory('${spec.id}',1)">+</button>
        </div>
      </div>
    `;
    list.appendChild(row);
  });

  closeAllOverlays();
  document.getElementById('settings-panel').classList.add('active');
}

function toggleBoosterSetting(id) {
  const s = getBoosterSetting(id);
  s.enabled = !s.enabled;
  document.getElementById('toggle-' + id).classList.toggle('on', s.enabled);
  document.getElementById('setting-row-' + id).classList.toggle('disabled', !s.enabled);
  saveProgress();
}

function adjustQty(id, delta) {
  const s = getBoosterSetting(id);
  if (!s.enabled) return;
  const current = boosterCounts[id] !== undefined ? boosterCounts[id] : s.qty;
  const newVal = Math.max(0, Math.min(MAX_BOOSTER_QTY, current + delta));
  boosterCounts[id] = newVal;
  s.qty = newVal;
  progress.boosterCounts[id] = newVal;
  document.getElementById('qty-' + id).textContent = newVal;
  saveProgress();
  updateBoosterUI();
}

function adjustChainTimer(delta) {
  const current = getChainTimerDuration();
  progress.chainTimerDuration = Math.max(3, Math.min(30, current + delta));
  document.getElementById('chain-timer-val').textContent = progress.chainTimerDuration + 's';
  saveProgress();
}

function adjustInventory(specId, delta) {
  const current = progress.specialInventory[specId] || 0;
  progress.specialInventory[specId] = Math.max(0, Math.min(99, current + delta));
  document.getElementById('inv-qty-' + specId).textContent = progress.specialInventory[specId];
  saveProgress();
}

function closeSettings() {
  document.getElementById('settings-panel').classList.remove('active');
  if (settingsReturnTo === 'level-select') showLevelSelect();
  // 'game' — just close the overlay, game continues
}
