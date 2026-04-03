// ============================================================
// PROGRESSION LOADING
// ============================================================
// Capture original defaults before any progression swap
const LEVELS_DEFAULT = LEVELS;
const PROGRESSION_UNLOCK_DEFAULTS = { ...PROGRESSION_UNLOCK_LEVELS };
const REWARDS_DEFAULT = DEFAULT_LEVEL_REWARDS;

function applyProgression(style) {
  const PRESETS = {
    default: { levels: LEVELS_DEFAULT,  progression: PROGRESSION_UNLOCK_DEFAULTS, rewards: REWARDS_DEFAULT },
    short:   { levels: LEVELS_SHORT, progression: PROGRESSION_SHORT,         rewards: PROGRESSION_SHORT.levelRewards },
    long:    { levels: LEVELS_LONG,  progression: PROGRESSION_LONG,          rewards: PROGRESSION_LONG.levelRewards },
  };
  const preset = PRESETS[style];
  if (!preset) return;

  LEVELS = preset.levels;
  PROGRESSION_UNLOCK_LEVELS = {
    winStreakStartLevel: preset.progression.winStreakStartLevel || 1,
    deploySpecialsStartLevel: preset.progression.deploySpecialsStartLevel || 1,
    recallStartLevel: preset.progression.recallStartLevel || 1,
    sweepRevealStartLevel: preset.progression.sweepRevealStartLevel || 1,
  };
  DEFAULT_LEVEL_REWARDS = preset.rewards || [];
}

// Save current journey's progress into progress.journeys[style]
function saveJourneySnapshot() {
  if (!progress.progressionStyle) return;
  if (!progress.journeys) progress.journeys = {};
  progress.journeys[progress.progressionStyle] = {
    highestUnlocked: progress.highestUnlocked,
    stars: Array.isArray(progress.stars) ? [...progress.stars] : [],
    winStreak: progress.winStreak,
    coins: progress.coins || 0,
    lives: progress.lives ?? 5,
    boosterCounts: { ...boosterCounts },
    specialInventory: progress.specialInventory ? { ...progress.specialInventory } : {},
    seenSpecials: progress.seenSpecials ? [...progress.seenSpecials] : [],
    seenBoosters: progress.seenBoosters ? [...progress.seenBoosters] : [],
    seenFeatures: progress.seenFeatures ? [...progress.seenFeatures] : [],
  };
}

// Restore a journey's progress from snapshot, or start fresh
function restoreJourneySnapshot(style) {
  const snap = progress.journeys?.[style];
  if (snap) {
    progress.highestUnlocked = snap.highestUnlocked || 0;
    progress.stars = Array.isArray(snap.stars) ? [...snap.stars] : new Array(LEVELS.length).fill(0);
    progress.winStreak = snap.winStreak || 0;
    progress.coins = snap.coins || 0;
    progress.lives = snap.lives ?? 5;
    Object.keys(boosterCounts).forEach(k => boosterCounts[k] = 0);
    if (snap.boosterCounts) Object.assign(boosterCounts, snap.boosterCounts);
    if (snap.specialInventory) progress.specialInventory = { ...snap.specialInventory };
    progress.seenSpecials = snap.seenSpecials ? [...snap.seenSpecials] : [];
    progress.seenBoosters = snap.seenBoosters ? [...snap.seenBoosters] : [];
    progress.seenFeatures = snap.seenFeatures ? [...snap.seenFeatures] : [];
  } else {
    // Fresh journey
    progress.highestUnlocked = 0;
    progress.stars = new Array(LEVELS.length).fill(0);
    progress.winStreak = 0;
    progress.coins = 0;
    progress.lives = 5;
    progress.seenSpecials = [];
    progress.seenBoosters = [];
    progress.seenFeatures = [];
    Object.keys(boosterCounts).forEach(k => boosterCounts[k] = 0);
  }
  // Ensure stars array matches LEVELS length
  const oldStars = Array.isArray(progress.stars) ? progress.stars : [];
  progress.stars = new Array(LEVELS.length).fill(0);
  oldStars.forEach((s, i) => { if (i < progress.stars.length) progress.stars[i] = s; });
  delete progress.levelRewards;
  delete progress.comboMapping;
}

function loadProgression(style) {
  document.getElementById('progression-picker').classList.remove('active');

  // Save current journey before switching
  saveJourneySnapshot();
  saveProgress();

  applyProgression(style);
  progress.progressionStyle = style;
  restoreJourneySnapshot(style);

  saveBoosterCounts();
  saveProgress();
  currentLevelIndex = Math.max(0, Math.min(progress.highestUnlocked, LEVELS.length - 1));
  showLevelSelect();
}

function resetJourneyProgress() {
  if (!confirm('Reset all progress for this journey? This cannot be undone.')) return;
  progress.highestUnlocked = 0;
  progress.stars = new Array(LEVELS.length).fill(0);
  progress.winStreak = 0;
  progress.coins = 0;
  delete progress.levelRewards;
  delete progress.comboMapping;
  Object.keys(boosterCounts).forEach(k => boosterCounts[k] = 0);
  // Clear saved snapshot too
  if (progress.journeys?.[progress.progressionStyle]) {
    delete progress.journeys[progress.progressionStyle];
  }
  saveBoosterCounts();
  saveProgress();
  currentLevelIndex = 0;
  showLevelSelect();
}

function playFromHome() {
  document.getElementById('home-screen').classList.remove('active');
  if (progress.progressionStyle) {
    showLevelSelect();
  } else {
    document.getElementById('progression-picker').classList.add('active');
  }
}

// ============================================================
// GAME STATE
// ============================================================
let COLS, ROWS, TOTAL, ACTIVE_COLORS, MAX_TURNS, TARGET;
let currentLevelIndex = progress.highestUnlocked;

let board = [], score = 0, turns = 0;
let chainColor = null, chainColors = new Set(), chainCards = [], specialsUsed = [], lastSelectedIdx = -1;
let turnActive = false, inputLocked = false;
let shieldCharges = 0, echoCharges = 0, spotlightMode = false, activeBooster = null;
let lastRevealedCards = []; // indices of most recently revealed cards (for recall)

// Nudge system
let consecutiveFailedCombos = 0;
let nudgeIdleTimer = null;
let activeNudge = null; // 'booster' | 'recall' | null

function showNudge(type) {
  if (activeNudge) dismissNudge();
  activeNudge = type;
  if (type === 'booster') {
    const bar = document.getElementById('booster-bar');
    bar.classList.add('nudge');
    let hand = bar.querySelector('.nudge-hand');
    if (!hand) { hand = document.createElement('span'); hand.className = 'nudge-hand'; hand.textContent = '👇'; bar.appendChild(hand); }
  } else if (type === 'recall') {
    const wrap = document.querySelector('.recall-wrap');
    const btn = document.getElementById('recall-btn');
    if (wrap && btn && !btn.classList.contains('disabled')) {
      wrap.classList.add('nudge');
      btn.classList.add('nudge');
      let hand = wrap.querySelector('.nudge-hand');
      if (!hand) { hand = document.createElement('span'); hand.className = 'nudge-hand'; hand.textContent = '👇'; wrap.appendChild(hand); }
    }
  }
}

function dismissNudge() {
  if (!activeNudge) return;
  activeNudge = null;
  const bar = document.getElementById('booster-bar');
  bar.classList.remove('nudge');
  const barHand = bar.querySelector('.nudge-hand');
  if (barHand) barHand.remove();
  const wrap = document.querySelector('.recall-wrap');
  if (wrap) {
    wrap.classList.remove('nudge');
    const wrapHand = wrap.querySelector('.nudge-hand');
    if (wrapHand) wrapHand.remove();
  }
  const btn = document.getElementById('recall-btn');
  if (btn) btn.classList.remove('nudge');
}

function hasAnyBoosters() {
  return BOOSTERS.some(b => boosterCounts[b.id] > 0);
}

function clearNudgeTimer() {
  if (nudgeIdleTimer) { clearTimeout(nudgeIdleTimer); nudgeIdleTimer = null; }
}

function startNudgeIdleTimer() {
  clearNudgeTimer();
  if (!turnActive || inputLocked) return;
  nudgeIdleTimer = setTimeout(() => {
    if (!turnActive || inputLocked) return;
    const chainLen = chainCards.length + specialsUsed.length;

    // Recall nudge: combo active + recall has matching cards
    if (chainLen >= 1 && chainColor && lastRevealedCards.length > 0) {
      const activeColors = getRule('coloredBombs') ? [...chainColors] : [chainColor];
      const hasMatch = lastRevealedCards.some(i =>
        i >= 0 && board[i] && !board[i].special && !board[i].flipped && !board[i].locked && activeColors.includes(board[i].color)
      );
      const btn = document.getElementById('recall-btn');
      if (hasMatch && btn && !btn.classList.contains('disabled')) {
        showNudge('recall');
        return;
      }
    }

    // Power-up nudge: sitting on combo 1 or 2 for 5s (only if player has power-ups)
    if (chainLen >= 1 && chainLen <= 2 && hasAnyBoosters()) {
      showNudge('booster');
    }
  }, 5000);
}

// ============================================================
// LEVEL GOALS SYSTEM
// ============================================================
let levelGoals = null;

// Normalize row/col coverage targets: supports both uniform number and per-index array
// e.g. { timesEachRow: 2 } → [2,2,2,2,2,2]  or  { rows: [1,2,1,1,2,1] } → [1,2,1,1,2,1]
function getRowTargets(g) { return g.rows || Array(ROWS).fill(g.timesEachRow || 1); }
function getColTargets(g) { return g.cols || Array(COLS).fill(g.timesEachCol || 1); }

function initLevelGoals() {
  const lvl = LEVELS[currentLevelIndex];
  const defs = lvl.goals ? [...lvl.goals] : [{ type: 'score', target: lvl.target }];
  const progress = {};

  defs.forEach(g => {
    switch (g.type) {
      case 'colorCollect':
        progress.colorCollect = {};
        Object.keys(g.requirements).forEach(c => progress.colorCollect[c] = 0);
        break;
      case 'specificCombos':
        progress.specificCombos = { count: 0 };
        break;
      case 'markedCards':
        progress.markedCards = { collected: 0, currentMarked: new Set() };
        // Place initial marked cards on random non-special non-locked positions
        const avail = board.map((c, i) => i).filter(i => board[i] && !board[i].special && !board[i].locked);
        const shuffled = avail.sort(() => Math.random() - 0.5);
        for (let k = 0; k < Math.min(g.onBoardCount, shuffled.length); k++) {
          board[shuffled[k]].marked = true;
          progress.markedCards.currentMarked.add(shuffled[k]);
        }
        break;
      case 'orderedCards':
        progress.orderedCards = { nextRequired: 1 };
        if (g.positions) {
          g.positions.forEach(([r, c], idx) => {
            const bi = r * COLS + c;
            if (bi >= 0 && bi < TOTAL && board[bi] && !board[bi].special) {
              board[bi].ordered = idx + 1;
            }
          });
        }
        break;
      case 'colorAvoid':
        progress.colorAvoid = { flips: 0 };
        break;
      case 'rowCoverage':
        progress.rowCoverage = Array(ROWS).fill(0);
        break;
      case 'colCoverage':
        progress.colCoverage = Array(COLS).fill(0);
        break;
      case 'breakLocks':
        progress.breakLocks = { total: board.filter(c => c && c.locked).length, broken: 0 };
        break;
    }
  });
  levelGoals = { definitions: defs, progress };
}

function updateGoalProgress(matched, combo) {
  if (!levelGoals) return;
  levelGoals.definitions.forEach(g => {
    switch (g.type) {
      case 'colorCollect':
        matched.forEach(idx => {
          let col = board[idx]?.color;
          // Wild/rainbow cards count as the chain color
          if (!col && board[idx]?.special && getSpecialType(board[idx].special)?.isWild) col = chainColor;
          if (col && g.requirements[col] !== undefined) {
            levelGoals.progress.colorCollect[col] = (levelGoals.progress.colorCollect[col] || 0) + 1;
          }
        });
        break;
      case 'specificCombos':
        if (combo >= g.minLength) levelGoals.progress.specificCombos.count++;
        break;
      case 'markedCards':
        matched.forEach(idx => {
          if (board[idx]?.marked) {
            levelGoals.progress.markedCards.collected++;
            levelGoals.progress.markedCards.currentMarked.delete(idx);
            board[idx].marked = false;
          }
        });
        break;
      case 'orderedCards': {
        const orderedInChain = matched.filter(idx => board[idx]?.ordered).sort((a, b) => board[a].ordered - board[b].ordered);
        let next = levelGoals.progress.orderedCards.nextRequired;
        orderedInChain.forEach(idx => {
          if (board[idx].ordered === next) { next++; board[idx].ordered = null; }
        });
        levelGoals.progress.orderedCards.nextRequired = next;
        break;
      }
      case 'rowCoverage': {
        const rows = new Set();
        matched.forEach(idx => rows.add(toRC(idx).r));
        rows.forEach(r => levelGoals.progress.rowCoverage[r]++);
        break;
      }
      case 'colCoverage': {
        const cols = new Set();
        matched.forEach(idx => cols.add(toRC(idx).c));
        cols.forEach(c => levelGoals.progress.colCoverage[c]++);
        break;
      }
    }
  });
  updateGoalHUD();
}

function trackColorAvoidFlip(color) {
  if (!levelGoals) return;
  const g = levelGoals.definitions.find(d => d.type === 'colorAvoid');
  if (g && g.color === color) {
    levelGoals.progress.colorAvoid.flips++;
    updateGoalHUD();
    if (levelGoals.progress.colorAvoid.flips >= g.maxFlips) {
      // Immediate fail — let the current card flip animation finish first
      stopChainTimer();
      inputLocked = true;
      setTimeout(() => levelFailed(), 600);
    }
  }
}

function spawnMarkedCards() {
  if (!levelGoals) return;
  const g = levelGoals.definitions.find(d => d.type === 'markedCards');
  if (!g) return;
  const mp = levelGoals.progress.markedCards;
  while (mp.currentMarked.size < g.onBoardCount && mp.collected + mp.currentMarked.size < g.totalToCollect) {
    const avail = board.map((c, i) => i).filter(i =>
      board[i] && !board[i].special && !board[i].locked && !board[i].marked && !board[i].flipped
    );
    if (!avail.length) break;
    const idx = avail[Math.floor(Math.random() * avail.length)];
    board[idx].marked = true;
    mp.currentMarked.add(idx);
    replaceCell(idx);
  }
}

function checkAllGoalsMet() {
  if (!levelGoals) return score >= TARGET;
  return levelGoals.definitions.every(g => {
    switch (g.type) {
      case 'score':         return score >= g.target;
      case 'colorCollect':  return Object.entries(g.requirements).every(([c, n]) => (levelGoals.progress.colorCollect[c] || 0) >= n);
      case 'specificCombos': return levelGoals.progress.specificCombos.count >= g.count;
      case 'markedCards':   return levelGoals.progress.markedCards.collected >= g.totalToCollect;
      case 'orderedCards':  return levelGoals.progress.orderedCards.nextRequired > g.count;
      case 'colorAvoid':    return levelGoals.progress.colorAvoid.flips < g.maxFlips;
      case 'rowCoverage':   { const t = getRowTargets(g); return levelGoals.progress.rowCoverage.every((c, i) => c >= t[i]); }
      case 'colCoverage':   { const t = getColTargets(g); return levelGoals.progress.colCoverage.every((c, i) => c >= t[i]); }
      case 'breakLocks':   return levelGoals.progress.breakLocks.broken >= levelGoals.progress.breakLocks.total;
      default: return true;
    }
  });
}

function colorSwatch(c) {
  const hex = { red:'#e74c3c', green:'#2ecc71', blue:'#3498db', yellow:'#f1c40f' }[c] || '#fff';
  return `<span class="color-swatch" style="background:${hex}"></span>`;
}
function capColor(c) { return c.charAt(0).toUpperCase() + c.slice(1); }

function goalIcon(type) {
  return { score:'🎯', colorCollect:'🎨', specificCombos:'🔗', markedCards:'⭐',
           orderedCards:'🔢', colorAvoid:'🚫', rowCoverage:'↔', colCoverage:'↕',
           breakLocks:'🔓' }[type] || '📋';
}

function goalDescription(g) {
  switch (g.type) {
    case 'score':         return `Reach a score of ${g.target}`;
    case 'colorCollect':  return 'Collect ' + Object.entries(g.requirements).map(([c, n]) => `${n} ${colorSwatch(c)}`).join(' and ');
    case 'specificCombos': return `Make ${g.count} combo${g.count>1?'s':''} of ${g.minLength}+ cards`;
    case 'markedCards':   return `Collect ${g.totalToCollect} marked ⭐ cards`;
    case 'orderedCards':  return `Collect ${g.count} numbered cards in order`;
    case 'colorAvoid':    return `Don't open ${g.maxFlips} ${colorSwatch(g.color)} cards (${g.maxFlips} lives)`;
    case 'rowCoverage':   { const t = getRowTargets(g); const u = [...new Set(t)]; return u.length === 1 ? `Use every row ${u[0]} time${u[0]>1?'s':''}` : `Use rows (${t.join(',')} times)`; }
    case 'colCoverage':   { const t = getColTargets(g); const u = [...new Set(t)]; return u.length === 1 ? `Use every column ${u[0]} time${u[0]>1?'s':''}` : `Use cols (${t.join(',')} times)`; }
    case 'breakLocks':   return `Break all ${g.locked ? g.locked.length : ''} locked tiles`;
    default: return '';
  }
}

function getGoalDisplay(g) {
  const p = levelGoals.progress;
  switch (g.type) {
    case 'score':
      return { icon:'🎯', label:'Score', current: score, target: g.target, done: score >= g.target };
    case 'colorCollect': {
      const entries = Object.entries(g.requirements);
      const allDone = entries.every(([c, n]) => (p.colorCollect[c] || 0) >= n);
      const label = entries.map(([c, n]) => {
        const have = p.colorCollect[c] || 0;
        const met = have >= n;
        return `<span class="goal-color-item${met ? ' done' : ''}">${have}/${n} ${colorSwatch(c)}</span>`;
      }).join(' ');
      return { icon:'🎨', label, current: 0, target: 0, done: allDone, customLabel: true };
    }
    case 'specificCombos':
      return { icon:'🔗', label:`${g.minLength}+ combos`, current: p.specificCombos.count, target: g.count, done: p.specificCombos.count >= g.count };
    case 'markedCards':
      return { icon:'⭐', label:'Marked', current: p.markedCards.collected, target: g.totalToCollect, done: p.markedCards.collected >= g.totalToCollect };
    case 'orderedCards':
      return { icon:'🔢', label:'In order', current: p.orderedCards.nextRequired - 1, target: g.count, done: p.orderedCards.nextRequired > g.count };
    case 'colorAvoid': {
      const left = g.maxFlips - p.colorAvoid.flips;
      return { icon:'🚫', label:`Avoid ${colorSwatch(g.color)}`, current: left, target: g.maxFlips, done: left > 0, livesOnly: true };
    }
    case 'rowCoverage': {
      const t = getRowTargets(g);
      const done = p.rowCoverage.filter((c, i) => c >= t[i]).length;
      return { icon:'↔', label:'Rows', current: done, target: ROWS, done: done >= ROWS };
    }
    case 'colCoverage': {
      const t = getColTargets(g);
      const done = p.colCoverage.filter((c, i) => c >= t[i]).length;
      return { icon:'↕', label:'Cols', current: done, target: COLS, done: done >= COLS };
    }
    case 'breakLocks':
      return { icon:'🔓', label:'Locks', current: p.breakLocks.broken, target: p.breakLocks.total, done: p.breakLocks.broken >= p.breakLocks.total };
    default: return { icon:'📋', label:'', current: 0, target: 0, done: true };
  }
}

function updateGoalHUD() {
  const el = document.getElementById('goal-hud');
  if (!el) return;
  if (!levelGoals) { el.style.display = 'none'; return; }
  const nonScore = levelGoals.definitions.filter(g => g.type !== 'score');
  if (nonScore.length === 0) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  const pills = levelGoals.definitions.map(g => {
    const d = getGoalDisplay(g);
    const countHtml = d.customLabel ? '' : `<span class="goal-count">${d.livesOnly ? d.current : d.current + '/' + d.target}</span>`;
    return `<div class="goal-pill ${d.done ? 'goal-done' : ''}">
      <span class="goal-icon">${d.icon}</span>
      <span class="goal-text">${d.label}</span>
      ${countHtml}
    </div>`;
  }).join('');
  el.innerHTML = `<div class="goal-hud-title">Goals</div><div class="goal-items">${pills}</div>`;
  updateCoverageIndicators();
}

function renderCoverageIndicators() {
  const colEl = document.getElementById('col-indicators');
  const rowEl = document.getElementById('row-indicators');
  if (!colEl || !rowEl) return;
  const hasCol = levelGoals?.definitions.some(g => g.type === 'colCoverage');
  const hasRow = levelGoals?.definitions.some(g => g.type === 'rowCoverage');

  if (hasCol) {
    colEl.classList.add('active');
    colEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    // Offset for row indicators if both active
    if (hasRow) colEl.style.marginLeft = '19px';
    else colEl.style.marginLeft = '';
    colEl.innerHTML = Array.from({ length: COLS }, (_, c) => `<div class="cov-ind" data-col="${c}">C${c + 1}</div>`).join('');
  } else {
    colEl.classList.remove('active');
    colEl.innerHTML = '';
  }

  if (hasRow) {
    rowEl.classList.add('active');
    rowEl.innerHTML = Array.from({ length: ROWS }, (_, r) => `<div class="cov-ind" data-row="${r}">R${r + 1}</div>`).join('');
  } else {
    rowEl.classList.remove('active');
    rowEl.innerHTML = '';
  }
}

function updateCoverageIndicators() {
  if (!levelGoals) return;
  const p = levelGoals.progress;

  const rowGoal = levelGoals.definitions.find(g => g.type === 'rowCoverage');
  if (rowGoal) {
    const targets = getRowTargets(rowGoal);
    document.querySelectorAll('#row-indicators .cov-ind').forEach(el => {
      const r = parseInt(el.dataset.row);
      const count = p.rowCoverage[r] || 0;
      const needed = targets[r];
      el.classList.toggle('done', count >= needed);
      el.textContent = count >= needed ? '✓' : `${count}/${needed}`;
    });
  }

  const colGoal = levelGoals.definitions.find(g => g.type === 'colCoverage');
  if (colGoal) {
    const targets = getColTargets(colGoal);
    document.querySelectorAll('#col-indicators .cov-ind').forEach(el => {
      const c = parseInt(el.dataset.col);
      const count = p.colCoverage[c] || 0;
      const needed = targets[c];
      el.classList.toggle('done', count >= needed);
      el.textContent = count >= needed ? '✓' : `${count}/${needed}`;
    });
  }
}

const BOOSTERS = [
  { id:'peek',      icon:'👁',  name:'Peek',        desc:'Reveal one card by tapping it. Long-press any card for a quick peek!', needsTap:true  },
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
// DOM REFS
// ============================================================
const boardEl          = document.getElementById('board');
const boardContainerEl = document.getElementById('board-container');
const scoreEl          = document.getElementById('score-value');
const turnsEl          = document.getElementById('turns-value');
const targetEl         = document.getElementById('target-value');
const chainEl          = document.getElementById('chain-indicator');
const boosterBar       = document.getElementById('booster-bar');
const tooltipEl        = document.getElementById('tooltip');
const statusBadge      = document.getElementById('status-badge');
const colorPickerEl    = document.getElementById('color-picker');

// ============================================================
// SOUND (Web Audio API — programmatic tones, no files)
// ============================================================
const SFX = (() => {
  let ctx = null;
  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, type, vol, dur, delay = 0) {
    try {
      const c = ac(), o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type; o.frequency.value = freq;
      const t = c.currentTime + delay;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    } catch(e) {}
  }
  return {
    flip()     { tone(880, 'sine',     0.07, 0.07); },
    match()    { tone(660, 'sine',     0.09, 0.11); tone(990, 'sine', 0.06, 0.11, 0.05); },
    mismatch() { tone(160, 'sawtooth', 0.13, 0.24); },
    combo(n)   { [523,659,784,1047,1319].slice(0, Math.min(n-2, 5)).forEach((f,i) => tone(f,'triangle',0.14,0.22,i*0.09)); },
    win()      { [523,659,784,1047].forEach((f,i) => tone(f,'triangle',0.16,0.40,i*0.10)); },
    fail()     { [380,300,220].forEach((f,i) => tone(f,'sawtooth',0.12,0.30,i*0.13)); },
    booster()  { tone(1200,'sine',0.09,0.12); tone(1600,'sine',0.06,0.10,0.08); },
    special()  { tone(440,'triangle',0.10,0.20); },
  };
})();

// ============================================================
// JUICE HELPERS
// ============================================================
function shakeBoard() {
  boardContainerEl.classList.remove('board-shake');
  void boardContainerEl.offsetWidth; // reflow to restart animation
  boardContainerEl.classList.add('board-shake');
  boardContainerEl.addEventListener('animationend', () => boardContainerEl.classList.remove('board-shake'), { once: true });
}

function spawnParticles(indices, color) {
  const hex = { red:'#e74c3c', green:'#2ecc71', blue:'#3498db', yellow:'#f1c40f' }[color] || '#fff';
  indices.slice(0, 5).forEach(idx => {
    const cell = boardEl.children[idx]; if (!cell) return;
    const r = cell.getBoundingClientRect();
    for (let i = 0; i < 9; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.cssText = `left:${r.left+r.width/2}px;top:${r.top+r.height/2}px;background:${i%3===0?'#fff':hex};--dx:${(Math.random()-.5)*110}px;--dy:${(Math.random()-.5)*110}px;animation-duration:${.4+Math.random()*.25}s`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 700);
    }
  });
}

function launchConfetti() {
  const colors = ['#D01012','#FFD700','#006CB7','#237841','#ff6b6b','#f0c040','#4fc3f7'];
  for (let i = 0; i < 70; i++) {
    setTimeout(() => {
      const c = document.createElement('div');
      c.className = 'confetto';
      const size = 4 + Math.random() * 7;
      c.style.cssText = `left:${Math.random()*100}%;width:${size}px;height:${size}px;background:${colors[i%colors.length]};border-radius:${Math.random()>.5?'50%':'2px'};animation-duration:${.9+Math.random()*.9}s`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 2200);
    }, i * 22);
  }
}

let _scoreDisplayed = 0;
function animateScore(to) {
  const from = _scoreDisplayed;
  if (from === to) return;
  const dur = Math.min(500, Math.abs(to - from) * 1.5);
  const start = performance.now();
  (function tick(now) {
    const t = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    _scoreDisplayed = Math.round(from + (to - from) * e);
    scoreEl.textContent = _scoreDisplayed;
    if (t < 1) requestAnimationFrame(tick);
  })(start);
}

// ============================================================
// OVERLAY HELPERS
// ============================================================
function closeAllOverlays() {
  ['home-screen','level-select','overlay-fail','overlay-win','pre-level','color-picker','settings-panel','tutorial-overlay','progression-picker','special-tutorial']
    .forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });
  document.getElementById('next-level-btn').style.display = '';
}

// ============================================================
// TUTORIAL
// ============================================================
const TUTORIAL_STEPS = [
  { trigger: 'boardRevealed', msg: 'Tap a card to reveal its color!' },
  { trigger: 'firstFlip',     msg: 'Now find another card with the same color!' },
  { trigger: 'firstMatch',    msg: 'Same color — combo chain! Keep going!' },
  { trigger: 'chainOf3',      msg: 'Chain of 3+ banks the combo for points!' },
  { trigger: 'mismatch',      msg: 'Wrong color — turn ends. Try again!' },
  { trigger: 'comboReward',   msg: 'Combos of 4+ create special cards! 🎉' },
];
let tutorialStep = 0;
let tutorialActive = false;
let tutorialHintTimer = null;
const tutorialHintEl = document.getElementById('tutorial-hint');

function isTutorialLevel() { return currentLevelIndex === 0 && !progress.tutorialComplete; }

function startTutorial() {
  tutorialStep = 0;
  tutorialActive = true;
}

function showTutorialHint(msg) {
  if (tutorialHintTimer) clearTimeout(tutorialHintTimer);
  tutorialHintEl.textContent = msg;
  tutorialHintEl.classList.remove('hiding');
  tutorialHintEl.classList.add('visible');
  tutorialHintTimer = setTimeout(() => {
    tutorialHintEl.classList.add('hiding');
    setTimeout(() => { tutorialHintEl.classList.remove('visible', 'hiding'); }, 600);
  }, 3500);
}

function advanceTutorial(trigger) {
  if (!tutorialActive || tutorialStep >= TUTORIAL_STEPS.length) return;
  if (TUTORIAL_STEPS[tutorialStep].trigger !== trigger) return;
  showTutorialHint(TUTORIAL_STEPS[tutorialStep].msg);
  tutorialStep++;
  if (tutorialStep >= TUTORIAL_STEPS.length) {
    tutorialActive = false;
    progress.tutorialComplete = true;
    saveProgress();
  }
}

// ============================================================
// SPECIAL CARD TUTORIALS — show popup first time each type appears
// ============================================================
let itemTutorialQueue = []; // { icon, name, desc, id, markAs }
let itemTutorialShowing = false;

const FEATURE_TUTORIALS = [
  { id: 'recall',        icon: '🔄', name: 'Recall',
    desc: 'Tap the Recall button to re-reveal the last shown cards. Useful when you forget where colors are!',
    check: () => isRecallActive() },
  { id: 'deploySpecials', icon: '🎴', name: 'Deploy Special Cards',
    desc: 'You can now place special cards on the board before starting a level. Choose wisely from your inventory!',
    check: () => isDeploySpecialsActive() },
  { id: 'sweepReveal',   icon: '🧹', name: 'Perfect Sweep',
    desc: 'Match ALL cards of one color in a single chain to trigger a Perfect Sweep — the entire board is reshuffled and revealed!',
    check: () => isSweepRevealActive() },
  { id: 'winStreak',     icon: '🔥', name: 'Win Streak',
    desc: 'Win consecutive levels to build a streak! Higher streaks reveal more of the board at the start of each level.',
    check: () => isWinStreakActive() },
  // bankButton tutorial is triggered manually from updateBankButton(), not here
];

function checkFeatureTutorials(callback) {
  if (!progress.seenFeatures) progress.seenFeatures = [];
  const newFeatures = FEATURE_TUTORIALS.filter(f => f.check() && !progress.seenFeatures.includes(f.id));
  if (newFeatures.length === 0) { callback?.(); return; }
  newFeatures.forEach(f => {
    itemTutorialQueue.push({ id: 'feature_' + f.id, icon: f.icon, name: f.name, desc: f.desc, markAs: f.id });
  });
  // Set callback to run after all tutorials are dismissed
  featureTutorialCallback = callback || null;
  showNextItemTutorial();
}

let featureTutorialCallback = null;

function checkFeatureTutorialsAtStart() {
  if (!progress.seenFeatures) progress.seenFeatures = [];
  // Show all feature tutorials except deploySpecials (shown at pre-level)
  FEATURE_TUTORIALS.forEach(f => {
    if (f.id !== 'deploySpecials' && f.check() && !progress.seenFeatures.includes(f.id)) {
      if (!itemTutorialQueue.some(q => q.id === 'feature_' + f.id)) {
        itemTutorialQueue.push({ id: 'feature_' + f.id, icon: f.icon, name: f.name, desc: f.desc, markAs: f.id });
      }
    }
  });
  if (itemTutorialQueue.length > 0 && !itemTutorialShowing) showNextItemTutorial();
}

function checkSpecialTutorials() {
  if (!progress.seenSpecials) progress.seenSpecials = [];
  board.forEach(card => {
    if (card && card.special && !progress.seenSpecials.includes(card.special)) {
      const spec = getSpecialType(card.special);
      if (spec && !itemTutorialQueue.some(q => q.id === card.special)) {
        itemTutorialQueue.push({ type:'special', id: card.special, icon: spec.icon, name: spec.name, desc: spec.desc });
      }
    }
  });
  if (itemTutorialQueue.length > 0 && !itemTutorialShowing) showNextItemTutorial();
}

function checkBoosterTutorials() {
  if (!progress.seenBoosters) progress.seenBoosters = [];
  BOOSTERS.forEach(b => {
    if (boosterCounts[b.id] > 0 && !progress.seenBoosters.includes(b.id)) {
      if (!itemTutorialQueue.some(q => q.id === 'booster_' + b.id)) {
        itemTutorialQueue.push({ type:'booster', id: 'booster_' + b.id, icon: b.icon, name: b.name, desc: b.desc });
      }
    }
  });
  if (itemTutorialQueue.length > 0 && !itemTutorialShowing) showNextItemTutorial();
}

function showNextItemTutorial() {
  if (itemTutorialQueue.length === 0) {
    itemTutorialShowing = false;
    return;
  }
  itemTutorialShowing = true;
  inputLocked = true;
  const item = itemTutorialQueue.shift();

  document.getElementById('special-tut-icon').textContent = item.icon;
  document.getElementById('special-tut-name').textContent = item.name;
  document.getElementById('special-tut-desc').textContent = item.desc;
  document.getElementById('special-tutorial').classList.add('active');

  // Mark as seen based on type
  if (item.markAs) {
    if (!progress.seenFeatures) progress.seenFeatures = [];
    if (!progress.seenFeatures.includes(item.markAs)) progress.seenFeatures.push(item.markAs);
  } else if (item.id.startsWith('booster_')) {
    if (!progress.seenBoosters) progress.seenBoosters = [];
    progress.seenBoosters.push(item.id.replace('booster_', ''));
  } else {
    if (!progress.seenSpecials) progress.seenSpecials = [];
    progress.seenSpecials.push(item.id);
  }
  saveProgress();
}

function resetTutorials() {
  progress.seenSpecials = [];
  progress.seenBoosters = [];
  progress.seenFeatures = [];
  progress.tutorialComplete = false;
  progress.boosterTutorialDone = false;
  saveJourneySnapshot();
  saveProgress();
  alert('Tutorials reset! They will appear again on the next level.');
}

function dismissSpecialTutorial() {
  document.getElementById('special-tutorial').classList.remove('active');
  if (itemTutorialQueue.length > 0) {
    setTimeout(showNextItemTutorial, 300);
  } else {
    itemTutorialShowing = false;
    inputLocked = false;
    if (featureTutorialCallback) {
      const cb = featureTutorialCallback;
      featureTutorialCallback = null;
      cb();
    }
  }
}

function showTutorialOverlay() {
  document.getElementById('tutorial-overlay').classList.add('active');
}

function closeTutorialOverlay() {
  document.getElementById('tutorial-overlay').classList.remove('active');
  startTutorial();
  revealEntireBoard();
}

function showLevelSelect() {
  closeAllOverlays();
  buildLevelGrid();
  document.getElementById('level-select').classList.add('active');
  const streak = progress.winStreak;
  const pct = getStreakRevealPct();
  document.getElementById('ls-streak').textContent = streak > 0
    ? `🔥 Win Streak: ${streak} (${Math.round(pct * 100)}% board reveal)`
    : '';
}

function buildLevelGrid() {
  const grid = document.getElementById('level-grid');
  grid.innerHTML = '';
  LEVELS.forEach((lvl, i) => {
    const stars     = progress.stars[i] || 0;
    const isUnlocked = i <= progress.highestUnlocked;
    const isCurrent  = i === currentLevelIndex;
    const isCompleted = stars > 0;
    const btn = document.createElement('div');
    btn.className = 'lvl-btn ' + (
      !isUnlocked ? 'locked' :
      isCompleted ? 'completed' :
      isCurrent   ? 'current' : 'unlocked'
    );
    btn.innerHTML = `
      <span class="lvl-num">${isUnlocked ? lvl.id : '🔒'}</span>
      <span class="lvl-stars">${isCompleted ? '★'.repeat(stars)+'☆'.repeat(3-stars) : ''}</span>
    `;
    if (isUnlocked) btn.addEventListener('click', () => { currentLevelIndex = i; showPreLevel(); });
    grid.appendChild(btn);
  });
}

// ============================================================
// LEVEL INIT
// ============================================================
function initLevelConfig() {
  // Reset win streak, inventory and power-ups when starting from level 1 (fresh run)
  if (currentLevelIndex === 0) {
    progress.winStreak = 0;
    progress.tutorialComplete = false;
    progress.boosterTutorialDone = false;
    SPECIAL_TYPES.forEach(s => { progress.specialInventory[s.id] = 0; });
    BOOSTERS.forEach(b => {
      if (progress.boosterSettings[b.id]) progress.boosterSettings[b.id].qty = 0;
      progress.boosterCounts[b.id] = 0;
    });
    saveProgress();
  }
  const lvl = LEVELS[currentLevelIndex];
  COLS = lvl.cols; ROWS = lvl.rows; TOTAL = COLS * ROWS;
  ACTIVE_COLORS = ALL_COLORS.slice(0, lvl.colorCount);
  MAX_TURNS = lvl.turns;
  const scoreGoal = lvl.goals?.find(g => g.type === 'score');
  TARGET = scoreGoal ? scoreGoal.target : (lvl.target || 0);
  boardEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
  boardEl.style.gridTemplateRows    = `repeat(${ROWS}, 1fr)`;
  updateBanner();
}

function startLevel() {
  initLevelConfig();
  startGame();
}

// ============================================================
// PRE-LEVEL PREPARATION
// ============================================================
let preLevelSelections = [];

function showPreLevel() {
  initLevelConfig();

  // Deploy Specials tutorial shows before pre-level screen (user needs to understand the UI)
  if (!progress.seenFeatures) progress.seenFeatures = [];
  const deployFeature = FEATURE_TUTORIALS.find(f => f.id === 'deploySpecials' && f.check() && !progress.seenFeatures.includes(f.id));
  if (deployFeature) {
    itemTutorialQueue.push({ id: 'feature_' + deployFeature.id, icon: deployFeature.icon, name: deployFeature.name, desc: deployFeature.desc, markAs: deployFeature.id });
    featureTutorialCallback = () => showPreLevelUI();
    showNextItemTutorial();
    return;
  }
  showPreLevelUI();
}

function showPreLevelUI() {
  closeAllOverlays();
  preLevelSelections = [];

  // Title
  document.getElementById('pre-level-title').textContent = `Level ${LEVELS[currentLevelIndex].id} — Prepare`;

  // Board grid preview
  const lvl = LEVELS[currentLevelIndex];
  const previewEl = document.getElementById('pre-level-board-preview');
  if (previewEl) {
    const lockedSet   = new Set((lvl.locked   || []).map(([r, c]) => `${r},${c}`));
    const disabledSet = new Set((lvl.disabled || []).map(([r, c]) => `${r},${c}`));
    let html = `<div class="pre-level-mini-grid" style="grid-template-columns:repeat(${lvl.cols},1fr);grid-template-rows:repeat(${lvl.rows},1fr)">`;
    for (let r = 0; r < lvl.rows; r++) {
      for (let c = 0; c < lvl.cols; c++) {
        const key = `${r},${c}`;
        let cls = 'pre-level-mini-cell';
        if (disabledSet.has(key))    cls += ' disabled';
        else if (lockedSet.has(key)) cls += ' locked';
        html += `<div class="${cls}"></div>`;
      }
    }
    html += '</div>';
    previewEl.innerHTML = html;
  }

  // Level rewards preview
  const rewardsEl = document.getElementById('pre-level-rewards');
  if (rewardsEl) {
    const rewards = getLevelRewards().filter(r => r.afterLevel === lvl.id);
    if (rewards.length > 0) {
      rewardsEl.style.display = '';
      rewardsEl.innerHTML = '<div style="width:100%;text-align:center;font-size:11px;font-weight:700;color:#f0c040;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Rewards</div>' +
        rewards.map(r => {
          if ((r.type || 'booster') === 'special') {
            const s = SPECIAL_TYPES.find(x => x.id === r.specialId);
            return `<span class="pre-level-reward-pill"><span class="reward-icon">${s ? s.icon : '?'}</span> +${r.qty} ${s ? s.name : r.specialId}</span>`;
          }
          const b = BOOSTERS.find(x => x.id === r.boosterId);
          return `<span class="pre-level-reward-pill"><span class="reward-icon">${b ? b.icon : '?'}</span> +${r.qty} ${b ? (b.name || b.id) : r.boosterId}</span>`;
        }).join('');
    } else {
      rewardsEl.style.display = 'none';
    }
  }

  // Win streak info — only show if winstreak is active for this level
  const streakEl = document.getElementById('pre-level-streak');
  const breakdownEl = document.getElementById('pre-level-streak-breakdown');
  if (isWinStreakActive()) {
    const streak = progress.winStreak;
    const effect = getStreakEffect();
    if (streak > 0) {
      if (effect === 'reveal') {
        const pct = getStreakRevealPct();
        streakEl.textContent = `🔥 Win Streak: ${streak} — 👁 ${Math.round(pct * 100)}% board reveal`;
      } else {
        const shields = getStreakShields();
        streakEl.textContent = `🔥 Win Streak: ${streak} — 🛡 ${shields} shield${shields !== 1 ? 's' : ''}`;
      }
    } else {
      streakEl.textContent = 'No win streak active';
    }
    breakdownEl.innerHTML = WIN_STREAK_LEVELS.map(lvl => {
      const active = streak >= lvl.streak;
      const value = effect === 'reveal'
        ? `${Math.round(lvl.revealPct * 100)}%`
        : `🛡${lvl.shields}`;
      return `<span style="color:${active ? '#f0c040' : '#555'}">` +
        `${lvl.streak === 0 ? 'No streak' : '🔥' + lvl.streak}: ${value}</span>`;
    }).join(' &nbsp;→&nbsp; ');
  } else {
    streakEl.textContent = '';
    breakdownEl.innerHTML = '';
  }

  // Level goals display — pill style
  const goalInfoEl = document.getElementById('pre-level-goals');
  const lvlGoals = LEVELS[currentLevelIndex].goals;
  if (goalInfoEl) {
    if (lvlGoals && lvlGoals.length > 0) {
      goalInfoEl.style.display = '';
      goalInfoEl.innerHTML = '<div class="pre-level-goal-title">Goals</div>' +
        '<div class="pre-level-goal-pills">' +
        lvlGoals.map(g => `<span class="pre-level-goal-pill"><span class="goal-pill-icon">${goalIcon(g.type)}</span> ${goalDescription(g)}</span>`).join('') +
        '</div>';
    } else {
      goalInfoEl.style.display = 'none';
    }
  }

  // Special card grid — only show if deploy specials is unlocked for this level
  const grid = document.getElementById('pre-level-grid');
  grid.innerHTML = '';
  const sectionTitle = document.getElementById('pre-level-section-title');
  if (!isDeploySpecialsActive()) {
    if (sectionTitle) sectionTitle.style.display = 'none';
    grid.style.display = 'none';
    document.getElementById('pre-level').classList.add('active');
    return;
  }
  if (sectionTitle) sectionTitle.style.display = '';
  grid.style.display = '';
  const comboMap = getComboMapping();
  const orderedSpecs = comboMap
    .map(m => SPECIAL_TYPES.find(s => s.id === m.specialId))
    .filter(Boolean);
  orderedSpecs.forEach(spec => {
    const stock = progress.specialInventory[spec.id] || 0;
    const card = document.createElement('div');
    card.className = 'pre-level-card' + (stock <= 0 ? ' disabled' : '');
    card.dataset.specId = spec.id;
    card.innerHTML = `
      <span class="plc-icon">${spec.icon}</span>
      <span class="plc-name">${spec.name}</span>
      <span class="plc-stock">×${stock}</span>
    `;
    card.title = spec.desc;
    if (stock > 0) {
      card.addEventListener('click', () => togglePreLevelCard(spec.id, card));
    }
    grid.appendChild(card);
  });

  document.getElementById('pre-level').classList.add('active');
}

function togglePreLevelCard(specId, el) {
  const idx = preLevelSelections.indexOf(specId);
  if (idx >= 0) {
    preLevelSelections.splice(idx, 1);
    el.classList.remove('selected');
  } else {
    const stock = progress.specialInventory[specId] || 0;
    const alreadySelected = preLevelSelections.filter(s => s === specId).length;
    if (alreadySelected >= stock) return; // can't exceed inventory
    preLevelSelections.push(specId);
    el.classList.add('selected');
  }
}

function confirmPreLevel() {
  // Deduct inventory
  preLevelSelections.forEach(specId => {
    progress.specialInventory[specId] = Math.max(0, (progress.specialInventory[specId] || 0) - 1);
  });
  saveProgress();
  closeAllOverlays();
  startGame(preLevelSelections);
}

function updateBanner() {
  const levelEl = document.getElementById('banner-level');
  if (levelEl) levelEl.textContent = `Level ${LEVELS[currentLevelIndex].id}`;
  updateCoinDisplay();
  updateLivesDisplay();
}

function updateCoinDisplay() {
  const el = document.getElementById('coin-count');
  if (el) el.textContent = progress.coins || 0;
}

function updateLivesDisplay() {
  const el = document.getElementById('lives-count');
  if (el) el.textContent = progress.lives ?? 5;
}

// ============================================================
// CHAIN TIMER
// ============================================================
let chainTimerRAF = null;
let chainTimerStart = 0;
let chainTimerDuration = 0;
let chainTimerElapsed = 0;  // accumulated elapsed time (for pause/resume)
let chainTimerPaused = false;
const timerWrapEl = document.getElementById('chain-timer-wrap');
const timerBarEl  = document.getElementById('chain-timer-bar');

function startChainTimer() {
  if (!getRule('chainTimer')) return;
  chainTimerDuration = getChainTimerDuration() * 1000;
  chainTimerElapsed = 0;
  chainTimerPaused = false;
  chainTimerStart = performance.now();
  timerWrapEl.classList.add('active');
  timerWrapEl.classList.remove('urgent');
  if (chainTimerRAF) cancelAnimationFrame(chainTimerRAF);
  chainTimerTick();
}

function resetChainTimer() {
  if (!getRule('chainTimer')) return;
  chainTimerElapsed = 0;
  chainTimerPaused = false;
  chainTimerStart = performance.now();
  timerWrapEl.classList.remove('urgent');
}

function pauseChainTimer() {
  if (!chainTimerRAF || chainTimerPaused) return;
  chainTimerPaused = true;
  chainTimerElapsed += performance.now() - chainTimerStart;
  cancelAnimationFrame(chainTimerRAF);
  chainTimerRAF = null;
}

function resumeChainTimer() {
  if (!chainTimerPaused) return;
  chainTimerPaused = false;
  chainTimerStart = performance.now();
  chainTimerTick();
}

function stopChainTimer() {
  if (chainTimerRAF) { cancelAnimationFrame(chainTimerRAF); chainTimerRAF = null; }
  chainTimerPaused = false;
  chainTimerElapsed = 0;
  timerWrapEl.classList.remove('active', 'urgent');
  timerBarEl.style.transform = 'scaleX(1)';
}

function chainTimerTick() {
  const totalElapsed = chainTimerElapsed + (performance.now() - chainTimerStart);
  const remaining = Math.max(0, 1 - totalElapsed / chainTimerDuration);
  timerBarEl.style.transform = `scaleX(${remaining})`;
  if (remaining < 0.25) timerWrapEl.classList.add('urgent');
  else timerWrapEl.classList.remove('urgent');

  if (remaining <= 0) {
    stopChainTimer();
    if (turnActive && !inputLocked) {
      const comboLen = chainCards.length + specialsUsed.length;
      if (comboLen < 3) { SFX.mismatch(); shakeBoard(); }
      inputLocked = true;
      setTimeout(() => endTurn(false), 500);
    }
    return;
  }
  chainTimerRAF = requestAnimationFrame(chainTimerTick);
}

// ============================================================
// GAME START
// ============================================================
function startGame(preplacedSpecials) {
  closeAllOverlays();
  score = 0; turns = MAX_TURNS; _scoreDisplayed = 0;
  chainColor = null; chainColors = new Set(); chainCards = []; specialsUsed = []; lastSelectedIdx = -1;
  turnActive = false; inputLocked = false;
  shieldCharges = 0; echoCharges = 0; spotlightMode = false; activeBooster = null;
  lastRevealedCards = [];
  consecutiveFailedCombos = 0; clearNudgeTimer(); dismissNudge();
  stopChainTimer();
  board = Array.from({ length: TOTAL }, (_, i) => createCard(i));

  // Disable cells — set to null so no card is placed there
  const lvlData = LEVELS[currentLevelIndex];
  const disabledPositions = lvlData.disabled || [];
  disabledPositions.forEach(([r, c]) => {
    const idx = r * COLS + c;
    if (idx >= 0 && idx < TOTAL) board[idx] = null;
  });

  // Place pre-selected special cards at random positions
  if (preplacedSpecials && preplacedSpecials.length > 0) {
    const available = board.map((_, i) => i).filter(i => board[i] !== null);
    // Shuffle available positions
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    preplacedSpecials.forEach((specId, idx) => {
      if (idx < available.length) {
        const pos = available[idx];
        board[pos] = createSpecialCard(pos, specId);
      }
    });
  }

  // Place locked cards from breakLocks goal (or legacy lvl.locked)
  const lvl = LEVELS[currentLevelIndex];
  const lockGoal = lvl.goals?.find(g => g.type === 'breakLocks');
  const lockedPositions = lockGoal?.locked || lvl.locked || [];
  if (lockedPositions.length > 0) {
    lockedPositions.forEach(([r, c]) => {
      const idx = r * COLS + c;
      if (idx >= 0 && idx < TOTAL && board[idx] && !board[idx].special) {
        board[idx].locked = true;
      }
    });
  }

  targetEl.textContent = TARGET > 0 ? TARGET : '—';
  initLevelGoals();
  renderBoard(); renderCoverageIndicators(); initBoosters(); initBankButton(); scoreEl.textContent = 0; turnsEl.textContent = turns; updateChainIndicator(); updateStatusBadge(); updateRecallButton(); updateRecallBar(); updateGoalHUD();

  // Booster hint flag — will be shown after all popups are done
  const pendingBoosterHint = !progress.boosterTutorialDone && BOOSTERS.some(b => boosterCounts[b.id] > 0);
  if (pendingBoosterHint) {
    progress.boosterTutorialDone = true;
    saveProgress();
  }

  // Apply winstreak effect (only if enabled for this level)
  if (isWinStreakActive()) {
    const streakShields = getStreakShields();
    if (streakShields > 0) { shieldCharges = streakShields; updateStatusBadge(); updateChainIndicator(); }
  }

  // Show goal intro banner, then proceed with tutorials and board reveal
  showGoalIntroBanner(() => {
    if (isTutorialLevel()) {
      showTutorialOverlay();
    } else {
      revealEntireBoard();
    }
    // Show tutorials for new features, boosters, and specials with a delay
    setTimeout(() => {
      checkFeatureTutorialsAtStart(); checkBoosterTutorials(); checkSpecialTutorials();
      // Show booster bar hint after all popups close
      if (pendingBoosterHint) {
        const waitAndShow = () => {
          if (itemTutorialShowing) { setTimeout(waitAndShow, 300); return; }
          setTimeout(() => {
            boosterBar.classList.add('highlight');
            showTutorialHint('You have Power-Ups! Tap one below to use it 👇');
            setTimeout(() => boosterBar.classList.remove('highlight'), 4600);
          }, 400);
        };
        waitAndShow();
      }
    }, 500);
  });
}

function retryLevel() { showPreLevel(); }

function nextLevel() {
  if (currentLevelIndex < LEVELS.length - 1) {
    currentLevelIndex++;
    showPreLevel();
  } else {
    document.getElementById('win-title').textContent = '🏆 All Done!';
    document.getElementById('win-stars').textContent = '🌟🌟🌟';
    document.getElementById('win-score').textContent = 'You completed all 10 levels!';
    document.getElementById('win-streak').textContent = '';
    document.getElementById('next-level-btn').style.display = 'none';
    document.getElementById('overlay-win').classList.add('active');
  }
}

// ============================================================
// SPECIAL CARD TYPES — all available special abilities
// Add new types here; they auto-appear in combo mapping UI
// ============================================================
const SPECIAL_TYPES = [
  { id: 'peek',      icon: '👁', name: 'Peek',      desc: 'Flash 2-3 nearby cards for 1.5s then hide',        power: 'low',    needsTap: false,
    offsets: [[-1,0],[1,0],[0,-1],[0,1]], revealCount: 3, temporary: true },
  { id: 'tint',      icon: '🎯', name: 'Tint',      desc: 'Add color hints to 3-4 nearby face-down cards',    power: 'low',    needsTap: false,
    offsets: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]], tintCount: 4, temporary: false },
  { id: 'spotlight', icon: '🔦', name: 'Spotlight', desc: 'Tap any face-down card to permanently reveal it',  power: 'medium', needsTap: true },
  { id: 'echo',      icon: '🔔', name: 'Echo',      desc: 'Next flipped card stays visible for 1 extra turn', power: 'medium', needsTap: false },
  { id: 'cross',     icon: '💣',  name: 'Baby Bomb',     desc: 'Reveal 4 adjacent cards',                          power: 'high',   needsTap: false,
    offsets: [[-1,0],[1,0],[0,-1],[0,1]] },
  { id: 'ring',      icon: '💥',  name: 'BIG Bomb',      desc: 'Reveal 8 surrounding cards',                       power: 'high',   needsTap: false,
    offsets: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]] },
  { id: 'diamond',   icon: '☢︎',  name: 'Nuke!',   desc: 'Reveal 12 cards in extended cross',                power: 'high',   needsTap: false,
    offsets: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1],[-2,0],[2,0],[0,-2],[0,2]] },
  { id: 'wild',      icon: '🌈', name: 'Wild',      desc: 'Matches any color — acts as a wildcard in combos', power: 'medium', needsTap: false, isWild: true },
];

function getSpecialType(id) { return SPECIAL_TYPES.find(s => s.id === id); }
initInventoryDefaults();

// ============================================================
// COMBO → SPECIAL MAPPING
// ============================================================
// ============================================================
// LEVEL REWARDS — DEFAULT_LEVEL_REWARDS loaded from progression_default.js
// ============================================================

function getLevelRewards() {
  return progress.levelRewards || DEFAULT_LEVEL_REWARDS;
}

function setLevelRewards(rewards) {
  progress.levelRewards = rewards;
  saveProgress();
}

function grantLevelRewards(levelId) {
  const rewards = getLevelRewards().filter(r => r.afterLevel === levelId);
  if (rewards.length === 0) return [];
  rewards.forEach(r => {
    if ((r.type || 'booster') === 'special') {
      progress.specialInventory[r.specialId] = (progress.specialInventory[r.specialId] || 0) + r.qty;
    } else {
      boosterCounts[r.boosterId] = (boosterCounts[r.boosterId] || 0) + r.qty;
    }
  });
  saveBoosterCounts();
  saveProgress();
  return rewards;
}

// ============================================================
// COMBO MAPPING
// ============================================================
const DEFAULT_COMBO_MAP = [
  { combo: 4,   specialId: 'wild' },
  { combo: 5,   specialId: 'cross' },
  { combo: '6+', specialId: 'ring' },
];

function getComboMapping() {
  return progress.comboMapping || DEFAULT_COMBO_MAP;
}

function setComboMapping(map) {
  progress.comboMapping = map;
  saveProgress();
}

function getSpecialForCombo(comboLen) {
  const map = getComboMapping();
  // Check exact matches first, then find highest N+ rule that applies
  let exact = map.find(m => typeof m.combo === 'number' && m.combo === comboLen);
  if (exact) return exact.specialId;
  // Find all range rules (e.g. '6+') where comboLen qualifies
  let bestRange = null;
  map.forEach(m => {
    if (typeof m.combo === 'string' && m.combo.endsWith('+')) {
      const min = parseInt(m.combo);
      if (comboLen >= min) {
        if (!bestRange || min > parseInt(bestRange.combo)) bestRange = m;
      }
    }
  });
  return bestRange ? bestRange.specialId : null;
}

// ============================================================
// CARD HELPERS
// ============================================================
function randomColor() { return ACTIVE_COLORS[Math.floor(Math.random() * ACTIVE_COLORS.length)]; }
function createCard(i) { return { color: randomColor(), flipped: false, special: null, index: i, locked: false }; }
function createLockedCard(i) { return { color: randomColor(), flipped: false, special: null, index: i, locked: true }; }
function createSpecialCard(i, type, bombColor) { return { color: null, flipped: false, special: type, index: i, bombColor: bombColor || null }; }
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
    return `<div class="card special${bombCls}" data-index="${i}"${bombStyle}><div class="card-face card-back"></div><div class="card-face card-front ${specialCSS(card.special)}"><span class="special-icon">${specialIcon(card.special)}</span></div></div>`;
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
      cell.innerHTML = '<img src="blocks/disabled.png" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:4px;opacity:.5">';
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

boardEl.addEventListener('pointerdown', e => {
  longPressTriggered = false;
  if (!getRule('longPressPeek')) return;
  const el = e.target.closest('.card');
  if (!el) return;
  const i = parseInt(el.dataset.index, 10);
  if (isNaN(i)) return;
  longPressTimer = setTimeout(() => {
    longPressTriggered = true;
    if (inputLocked || !board[i] || board[i].flipped || board[i].special || board[i].locked) return;
    if (!boosterCounts['peek'] || boosterCounts['peek'] <= 0) return;
    boosterCounts['peek']--;
    saveBoosterCounts();
    executePeek(i);
    updateBoosterUI();
  }, 500);
});

boardEl.addEventListener('pointerup', () => {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
});

boardEl.addEventListener('pointerleave', () => {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
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
function replaceCell(i) { boardEl.children[i].innerHTML = buildCardHTML(board[i]); }

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
    const icon = specialIcon(specialId);
    const badge = document.createElement('span');
    badge.className = 'combo-spawn-badge';
    badge.textContent = icon;
    el.appendChild(badge);
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

// ============================================================
// BANK IT BUTTON
// ============================================================
let _bankHoldTimer = null;
const BANK_HOLD_MS = 800;

function initBankButton() {
  const bar = document.getElementById('bank-bar');
  const btn = document.getElementById('bank-btn');
  if (!bar || !btn) return;
  if (!getRule('bankButton')) { bar.style.display = 'none'; return; }
  bar.style.display = '';
  btn.classList.add('disabled');
  btn.classList.remove('holding', 'banked');

  // Remove old listeners by replacing node
  const fresh = btn.cloneNode(true);
  btn.replaceWith(fresh);

  fresh.addEventListener('pointerdown', (e) => {
    if (fresh.classList.contains('disabled')) return;
    e.preventDefault();
    fresh.classList.add('holding');
    _bankHoldTimer = setTimeout(() => {
      fresh.classList.remove('holding');
      fresh.classList.add('banked');
      fresh.addEventListener('animationend', () => fresh.classList.remove('banked'), { once: true });
      bankChain();
    }, BANK_HOLD_MS);
  });

  const cancelHold = () => {
    if (_bankHoldTimer) { clearTimeout(_bankHoldTimer); _bankHoldTimer = null; }
    fresh.classList.remove('holding');
  };
  fresh.addEventListener('pointerup', cancelHold);
  fresh.addEventListener('pointerleave', cancelHold);
  fresh.addEventListener('pointercancel', cancelHold);
}

function updateBankButton() {
  const btn = document.getElementById('bank-btn');
  if (!btn || !getRule('bankButton')) return;
  const comboLen = chainCards.length + specialsUsed.length;
  const canBank = turnActive && !inputLocked && comboLen >= 3;
  const wasDisabled = btn.classList.contains('disabled');
  btn.classList.toggle('disabled', !canBank);
  if (!canBank) {
    btn.classList.remove('holding');
    if (_bankHoldTimer) { clearTimeout(_bankHoldTimer); _bankHoldTimer = null; }
  }
  // Show tutorial the first time the button becomes enabled
  if (canBank && wasDisabled) {
    if (!progress.seenFeatures) progress.seenFeatures = [];
    if (!progress.seenFeatures.includes('bankButton')) {
      itemTutorialQueue.push({
        id: 'feature_bankButton', icon: '💰', name: 'Bank It',
        desc: 'Hold the Bank It button to lock in your combo! Or test your memory and keep building bigger chains to earn Special cards that help on future turns.',
        markAs: 'bankButton'
      });
      if (!itemTutorialShowing) showNextItemTutorial();
    }
  }
}

function bankChain() {
  if (!turnActive || inputLocked) return;
  const comboLen = chainCards.length + specialsUsed.length;
  if (comboLen < 3) return;
  inputLocked = true;
  endTurn(true);
}

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

function updateBoosterUI() {
  boosterBar.querySelectorAll('.booster-btn').forEach(btn => {
    const id = btn.dataset.booster;
    btn.querySelector('.badge').textContent = boosterCounts[id];
    btn.classList.toggle('disabled', boosterCounts[id] <= 0 || inputLocked);
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
  if (inputLocked || boosterCounts[id] <= 0) return;
  dismissNudge(); clearNudgeTimer();
  if (activeBooster === id) { activeBooster = null; updateBoosterUI(); updateChainIndicator(); return; }
  const b = BOOSTERS.find(x => x.id === id);
  SFX.booster();
  if (b.needsTap) { activeBooster = id; updateBoosterUI(); updateChainIndicator(); return; }
  boosterCounts[id]--;
  saveBoosterCounts();
  if (id === 'random3')   executeRandom3();
  else if (id === 'neighbor')  executeNeighbor();
  else if (id === 'colorpick') executeColorPick();
  else if (id === 'shield') { shieldCharges += 2; updateStatusBadge(); updateChainIndicator(); updateBoosterUI(); }
}

function executePeek(index) {
  const card = board[index];
  if (!card || card.flipped || card.special || card.locked) { updateBoosterUI(); return; }
  inputLocked = true;
  pauseChainTimer();
  card.flipped = true;
  const el = getCardEl(index);
  if (el) { el.classList.add('flipped', 'reveal-flash'); el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true}); }

  // Check if it matches active chain color
  const matchesChain = turnActive && (card.color === chainColor || (getRule('coloredBombs') && chainColors.has(card.color)));

  if (matchesChain) {
    // Auto-add to chain with celebration
    setTimeout(() => {
      if (!chainCards.includes(index)) { chainCards.push(index); lastSelectedIdx = index; }
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
      if (remaining.length === 0 && chainLen >= 3) {
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
  boosterCounts[id]--; activeBooster = null; saveBoosterCounts();
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
        if (!chainCards.includes(idx)) { chainCards.push(idx); lastSelectedIdx = idx; }
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
      if (remaining.length === 0 && chainLen >= 3) {
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

// ============================================================
// CARD CLICK
// ============================================================
function onCardClick(index) {
  if (inputLocked) return;
  const card = board[index];
  if (!card || turns <= 0) return;

  // Nudge: dismiss on any action, restart idle timer
  dismissNudge();
  clearNudgeTimer();

  if (activeBooster) { if (card.special) return; executeBoosterTap(activeBooster, index); return; }

  // Spotlight mode: next tap on a face-down card permanently reveals it
  if (spotlightMode && !card.special && !card.flipped && !card.locked) {
    spotlightMode = false;
    card.flipped = true;
    const cel = getCardEl(index);
    if (cel) { cel.classList.add('flipped', 'reveal-flash'); cel.addEventListener('animationend', () => cel.classList.remove('reveal-flash'), {once:true}); }
    SFX.match();
    inputLocked = false;
    updateBoosterUI();
    updateChainIndicator();
    return;
  }

  if (card.special) {
    const spec = getSpecialType(card.special);
    if (!spec) return;

    // Wild card: acts as a color wildcard in combos
    if (spec.isWild) {
      SFX.match();
      getCardEl(index).classList.add('used');
      if (!turnActive) {
        turnActive = true; chainColor = null; chainColors = new Set(); chainCards = [index]; specialsUsed = [];
      } else {
        chainCards.push(index);
      }
      lastSelectedIdx = index;
      const chainLen = chainCards.length + specialsUsed.length;
      if (chainLen === 3) startChainTimer();
      else if (chainLen > 3) resetChainTimer();
      updateChainIndicator();
      return;
    }

    // Mark special as used and register in turn
    function markUsed() {
      SFX.special();
      getCardEl(index).classList.add('used');
      if (!turnActive) { turnActive = true; chainColor = null; chainColors = new Set(); chainCards = []; specialsUsed = [index]; lastSelectedIdx = index; }
      else if (!specialsUsed.includes(index)) { specialsUsed.push(index); lastSelectedIdx = index; }
      // Colored bombs: add bomb's color as a parallel chain color
      if (getRule('coloredBombs') && card.bombColor && isBombType(card.special)) {
        chainColors.add(card.bombColor);
      }
      const chainLen = chainCards.length + specialsUsed.length;
      if (chainLen === 3) startChainTimer();
      else if (chainLen > 3) resetChainTimer();
      updateChainIndicator();
    }

    // Instant mode OR special types that always activate immediately
    const alwaysInstant = ['peek', 'tint', 'spotlight', 'echo'];
    if (getRule('instantSpecialReveal') || alwaysInstant.includes(card.special)) {
      markUsed();

      if (card.special === 'echo') {
        // Echo: next flipped card stays visible 1 extra turn
        echoCharges++;
        inputLocked = false;
        updateBoosterUI();
        return;
      }

      if (card.special === 'spotlight') {
        // Spotlight: enter tap mode
        spotlightMode = true;
        updateBoosterUI();
        return;
      }

      if (card.special === 'tint') {
        // Tint: add color hints to nearby face-down cards
        const targets = getRevealPattern(card.special, index)
          .filter(i => board[i] && !board[i].special && !board[i].flipped && !board[i].locked);
        const tintTargets = targets.slice(0, spec.tintCount || 4);
        spawnParticles([index], chainColor || 'blue');
        tintTargets.forEach((idx, ti) => {
          setTimeout(() => {
            const cel = getCardEl(idx);
            if (cel && !board[idx].flipped && !board[idx].locked) {
              const color = board[idx].color;
              const colorMap = { red:'#e74c3c', green:'#2ecc71', blue:'#3498db', yellow:'#f1c40f' };
              cel.classList.add('tinted');
              cel.style.setProperty('--tint-color', colorMap[color] || '#5b9bd5');
            }
          }, ti * 60);
        });
        inputLocked = false;
        updateBoosterUI();
        return;
      }

      // Peek and cross/ring/diamond: reveal targets
      inputLocked = true;
      pauseChainTimer();
      const targets = getRevealPattern(card.special, index)
        .filter(i => board[i] && !board[i].special && !board[i].flipped && !board[i].locked);
      spawnParticles([index], chainColor || 'red');

      targets.forEach((idx, ti) => {
        setTimeout(() => {
          board[idx].flipped = true;
          const cel = getCardEl(idx);
          if (cel) { cel.classList.add('flipped', 'reveal-flash'); cel.addEventListener('animationend', () => cel.classList.remove('reveal-flash'), {once:true}); }
        }, 100 + ti * 70);
      });

      // Colored bombs: find revealed cards that match the bomb's color — they join the chain
      const bombAutoChain = (getRule('coloredBombs') && card.bombColor && isBombType(card.special))
        ? targets.filter(idx => board[idx].color === card.bombColor)
        : [];

      // All instant reveals are temporary flashes — peek is shorter
      const hideDelay = 100 + Math.max(targets.length, 1) * 70 + (spec.temporary ? 1500 : 2000);
      setTimeout(() => {
        targets.forEach(idx => {
          // Keep bomb-color matched cards face-up — they're part of the chain now
          if (bombAutoChain.includes(idx)) return;
          board[idx].flipped = false; const cel = getCardEl(idx); if (cel) cel.classList.remove('flipped');
        });
        // Auto-add bomb-color cards to chain
        if (bombAutoChain.length > 0) {
          bombAutoChain.forEach(idx => { if (!chainCards.includes(idx)) chainCards.push(idx); });
          const chainLen = chainCards.length + specialsUsed.length;
          if (chainLen === 3) startChainTimer();
          else if (chainLen > 3) resetChainTimer();
          // Check all-colors bonus
          if (chainColors.size >= ACTIVE_COLORS.length) { checkAllColorsBonus(); return; }
        }
        inputLocked = false;
        resumeChainTimer();
        updateBoosterUI();
        updateChainIndicator();
      }, hideDelay);
      return;
    }

    // Default mode: mark special as used, reveal at end of turn
    markUsed();
    return;
  }

  if (card.flipped || card.locked) return;

  card.flipped = true;
  trackColorAvoidFlip(card.color);
  const el = getCardEl(index); el.classList.add('flipped');
  // Remove tint hint when card is flipped
  if (el.classList.contains('tinted')) { el.classList.remove('tinted'); el.style.removeProperty('--tint-color'); }
  SFX.flip();

  if (!turnActive) { turnActive=true; chainColor=card.color; chainColors=new Set([card.color]); chainCards=[index]; specialsUsed=[]; lastSelectedIdx=index; updateChainIndicator(); advanceTutorial('firstFlip'); startNudgeIdleTimer(); return; }
  if (chainColor === null) { chainColor=card.color; chainColors=new Set([card.color]); chainCards.push(index); lastSelectedIdx=index; updateChainIndicator(); startNudgeIdleTimer(); return; }
  // Match: primary chain color OR any parallel chain color (colored bombs)
  const colorMatch = card.color === chainColor || (getRule('coloredBombs') && chainColors.has(card.color));
  if (colorMatch) {
    SFX.match(); chainCards.push(index); lastSelectedIdx=index;
    // If this is a parallel color and no primary was set yet, adopt it
    if (chainColor === null) { chainColor = card.color; chainColors.add(card.color); }
    const chainLen = chainCards.length + specialsUsed.length;
    if (chainLen === 2) advanceTutorial('firstMatch');
    if (chainLen === 3) { startChainTimer(); advanceTutorial('chainOf3'); }
    else if (chainLen > 3) resetChainTimer();
    updateChainIndicator();
    // Check if all cards of ALL active chain colors have been found
    const activeColors = getRule('coloredBombs') ? [...chainColors] : [chainColor];
    const remaining = board.filter(c => c && !c.special && !c.flipped && activeColors.includes(c.color));
    if (remaining.length === 0 && chainLen >= 3) {
      stopChainTimer();
      inputLocked = true;
      if (isSweepRevealActive()) {
        setTimeout(() => endTurn(true, true), 300);
      } else {
        // Show "all color found" banner, then resolve normally with special card spawn
        showBoardBanner('sweep', '🎯 ALL COLORS FOUND!', 'Great memory! Special card incoming...');
        setTimeout(() => {
          hideBoardBanner(() => endTurn(true, false));
        }, 1200);
      }
    }
    // Check all-colors-active bonus
    if (getRule('coloredBombs') && chainColors.size >= ACTIVE_COLORS.length) {
      checkAllColorsBonus();
    }
    startNudgeIdleTimer();
    return;
  }

  if (shieldCharges > 0) {
    shieldCharges--; updateStatusBadge();
    // Let player see the wrong color, then flip back, then show shield break
    setTimeout(() => {
      card.flipped = false; el.classList.remove('flipped');
      // After card is hidden, play shield break effect
      setTimeout(() => {
        const breakIcon = document.createElement('span');
        breakIcon.className = 'shield-break-icon';
        breakIcon.textContent = '🛡';
        el.style.position = 'relative';
        el.appendChild(breakIcon);
        setTimeout(() => breakIcon.remove(), 1200);
        // Floating "-1 🛡" text above the card
        const rect = el.getBoundingClientRect();
        const floater = document.createElement('div');
        floater.className = 'shield-float-text';
        floater.textContent = '-1 🛡';
        floater.style.left = `${rect.left + rect.width / 2 - 20}px`;
        floater.style.top = `${rect.top - 5}px`;
        document.body.appendChild(floater);
        setTimeout(() => floater.remove(), 1400);
      }, 300);
    }, 600);
    updateChainIndicator(); return;
  }

  const comboLen = chainCards.length + specialsUsed.length;
  if (comboLen < 3) { SFX.mismatch(); shakeBoard(); }
  advanceTutorial('mismatch');
  chainCards.push(index); inputLocked = true;
  updateChainFaces(index);
  setTimeout(() => endTurn(false), 500);
}

// ============================================================
// END TURN
// ============================================================
function endTurn(manual, perfectSweep) {
  stopChainTimer();
  // Kill chain tension immediately — turn is resolving, no more pulsing
  boardEl.removeAttribute('data-tension');
  if (tensionRAF) { cancelAnimationFrame(tensionRAF); tensionRAF = null; }
  boardEl.querySelectorAll('.card-front').forEach(el => { if (el.style.scale) el.style.scale = ''; });
  inputLocked = true; turns--;
  shieldCharges = 0; spotlightMode = false;
  scoreEl.textContent = _scoreDisplayed; turnsEl.textContent = turns; updateStatusBadge();

  // Capture the chain as recallable before cards flip back
  const chainNormal = chainCards.filter(i => board[i] && !board[i].special);
  if (chainNormal.length > 0) lastRevealedCards = [...chainNormal];

  const isWildCard = (i) => board[i].special && getSpecialType(board[i].special)?.isWild;
  const normalCards = chainCards.filter(i => !board[i].special || isWildCard(i));
  const mismatchIdx = manual ? -1 : (normalCards.length>0 && !isWildCard(normalCards[normalCards.length-1]) ? normalCards[normalCards.length-1] : -1);

  let matched;
  const isColorMatch = (color) => color === chainColor || (getRule('coloredBombs') && chainColors.has(color));
  if (manual) matched = normalCards;
  else if (mismatchIdx >= 0 && !isColorMatch(board[mismatchIdx].color))
    matched = normalCards.slice(0,-1);
  else matched = normalCards;

  const combo = matched.length + specialsUsed.length;
  let specialActivated = matched.length>=2 && specialsUsed.length>0;
  let pts=0, toRemove=[], newST=null, newSP=-1;
  const PERFECT_SWEEP_BONUS = 0;

  // Track failed combos for nudge system
  if (combo >= 3) { consecutiveFailedCombos = 0; }
  else { consecutiveFailedCombos++; if (consecutiveFailedCombos >= 3) setTimeout(() => { if (consecutiveFailedCombos >= 3 && !activeNudge && hasAnyBoosters()) showNudge('booster'); }, 2000); }

  if (combo >= 3) {
    updateGoalProgress(matched, combo);
    toRemove = [...matched];
    if (combo===3) pts=100; else if (combo===4) pts=150; else pts=combo*50;
    if (perfectSweep) pts += PERFECT_SWEEP_BONUS;
    if (!perfectSweep) newST = getSpecialForCombo(combo);
    if (newST) { newSP = lastSelectedIdx >= 0 ? lastSelectedIdx : (matched.length>0 ? matched[matched.length-1] : -1); advanceTutorial('comboReward'); }
    if (newSP>=0) toRemove = toRemove.filter(i=>i!==newSP);
  }
  if (specialActivated) toRemove.push(...specialsUsed);

  const toFlip = [];
  normalCards.forEach(idx => { if (!toRemove.includes(idx) && idx!==newSP) toFlip.push(idx); });
  // Echo: keep the first card(s) visible instead of flipping back
  const echoProtected = new Set();
  if (echoCharges > 0 && toFlip.length > 0) {
    const keep = Math.min(echoCharges, toFlip.length);
    for (let i = 0; i < keep; i++) echoProtected.add(toFlip[i]);
    echoCharges -= keep;
  }
  toFlip.forEach(idx => {
    if (echoProtected.has(idx)) return; // echo keeps this card visible
    const el = getCardEl(idx);
    if (el) {
      if (!manual && idx===mismatchIdx) { el.classList.add('wrong'); el.addEventListener('animationend', ()=>el.classList.remove('wrong'), {once:true}); }
      setTimeout(() => { el.classList.remove('flipped'); board[idx].flipped=false; const img=el.querySelector('.card-front img'); if(img) img.src=`blocks/block_${board[idx].color}_1.png`; }, 300);
    }
  });

  if (!specialActivated) specialsUsed.forEach(idx => { const el=getCardEl(idx); if(el) el.classList.remove('used'); });

  let revealTargets = [];
  if (specialActivated && !getRule('instantSpecialReveal')) {
    specialsUsed.forEach(sIdx => { const sc=board[sIdx]; if(sc&&sc.special) revealTargets.push(...getRevealPattern(sc.special,sIdx)); });
    const flippingBack = new Set(toFlip.filter(i => !echoProtected.has(i)));
    revealTargets = [...new Set(revealTargets)].filter(i=>!toRemove.includes(i)&&i!==newSP&&!board[i].special&&!board[i].locked&&(!board[i].flipped||flippingBack.has(i)));
  }

  if (toRemove.length>0 || newSP>=0 || revealTargets.length>0) {
    score += pts; animateScore(score); turnsEl.textContent = turns;
    if (pts>0) {
      showScorePopup(pts, matched.length>0 ? matched : specialsUsed, perfectSweep ? '🧹 PERFECT SWEEP!' : null);
      SFX.combo(combo);
      spawnParticles(matched.length>0 ? matched : specialsUsed, chainColor);
      if (perfectSweep) { SFX.win(); launchConfetti(); }
    }
    // Unlock cards orthogonally adjacent to removed combo cards (include newSP — it's consumed too)
    const unlocked = new Set();
    const unlockSources = newSP >= 0 ? [...toRemove, newSP] : toRemove;
    unlockSources.forEach(idx => {
      const {r, c} = toRC(idx);
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => {
        const adj = toIndex(r+dr, c+dc);
        if (adj >= 0 && board[adj] && board[adj].locked) unlocked.add(adj);
      });
    });
    unlocked.forEach(idx => {
      board[idx].locked = false;
      if (levelGoals?.progress?.breakLocks) levelGoals.progress.breakLocks.broken++;
      const el = getCardEl(idx);
      if (el) {
        el.classList.remove('locked');
        el.classList.add('unlocking');
        el.addEventListener('animationend', () => el.classList.remove('unlocking'), {once:true});
        el.style.pointerEvents = '';
        // Reveal on unlock setting
        if (getRule('revealOnUnlock')) {
          board[idx].flipped = true;
          el.classList.add('flipped', 'reveal-flash');
          el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true});
          setTimeout(() => { board[idx].flipped = false; el.classList.remove('flipped'); }, 1500);
        }
      }
    });

    // Check if all goals are met — if so, skip animations and finish immediately
    if (checkAllGoalsMet()) {
      // Brief delay for score popup / particles to show, then win
      toRemove.forEach(idx => { const el=getCardEl(idx); if(el) el.classList.add('exploding'); });
      setTimeout(() => finishTurn(), 800);
      return;
    }

    toRemove.forEach(idx => { const el=getCardEl(idx); if(el) el.classList.add('exploding'); });
    setTimeout(() => {
      if (newSP>=0) { const bColor = (getRule('coloredBombs') && isBombType(newST)) ? chainColor : null; board[newSP]=createSpecialCard(newSP,newST,bColor); replaceCell(newSP); }
      // Step 1: Reveal bomb targets (stay face-up, no auto-hide)
      if (revealTargets.length > 0) {
        revealCardsNoHide(revealTargets);
      }
      // Step 2: After bomb reveal animation, drop in new cards
      const bombRevealTime = revealTargets.length > 0 ? 300 : 0;
      const willSweepReveal = perfectSweep && isSweepRevealActive();
      setTimeout(() => {
        const nc = placeNewCards(toRemove, newSP);
        const showNewCards = nc.length > 0 && !getRule('hiddenNewCards') && !willSweepReveal;
        const dropDelay = nc.length > 0 ? 450 : 0;

        // Show sweep banner in parallel with new cards dropping
        if (willSweepReveal) showSweepBanner();

        setTimeout(() => {
          // Reveal new cards (no auto-hide) — skip if sweep reveal is coming
          if (showNewCards) revealCardsNoHide(nc);
          // Hide everything together after 2.2s
          const allRevealed = [...revealTargets, ...(showNewCards ? nc : [])];
          if (allRevealed.length > 0) lastRevealedCards = allRevealed;
          const doFinish = () => willSweepReveal ? setTimeout(() => hideSweepBanner(() => sweepRevealBoard(finishTurn)), 1200) : finishTurn();
          const doFinishWithTutorial = () => { checkSpecialTutorials(); if (!itemTutorialShowing) doFinish(); else { const wait = setInterval(() => { if (!itemTutorialShowing) { clearInterval(wait); doFinish(); } }, 200); } };
          if (allRevealed.length > 0) {
            setTimeout(() => {
              allRevealed.forEach(idx => { const c = board[idx]; if (c && !c.special && c.flipped) { c.flipped = false; const el = getCardEl(idx); if (el) el.classList.remove('flipped'); } });
              doFinishWithTutorial();
            }, 2200);
          } else doFinishWithTutorial();
        }, dropDelay);
      }, bombRevealTime);
    }, 500);
  } else if (perfectSweep && isSweepRevealActive()) {
    showSweepBanner();
    setTimeout(() => hideSweepBanner(() => sweepRevealBoard(finishTurn)), 1600);
  } else setTimeout(finishTurn, 400);
}

// Place new cards on the board (with drop animation) but don't reveal them yet
function placeNewCards(toRemove, skip) {
  const nc = [];
  toRemove.forEach(idx => {
    if (idx===skip || board[idx]===null) return;
    board[idx]=createCard(idx); replaceCell(idx); nc.push(idx);
    const el=getCardEl(idx);
    if (el) { el.classList.add('dropping'); el.addEventListener('animationend',()=>el.classList.remove('dropping'),{once:true}); }
  });
  spawnMarkedCards();
  return nc;
}

// Legacy wrapper for any remaining callers
function addNewCards(toRemove, skip, cb) {
  const nc = placeNewCards(toRemove, skip);
  if (nc.length > 0 && !getRule('hiddenNewCards')) {
    doSimultaneousReveal(nc, cb);
  } else if (nc.length > 0) {
    setTimeout(cb, 450);
  } else cb();
}

// Reveal cards face-up without auto-hiding (caller is responsible for hiding)
function revealCardsNoHide(targets) {
  targets.forEach(rIdx => {
    const c = board[rIdx];
    if (c && !c.special && !c.flipped) {
      c.flipped = true;
      const el = getCardEl(rIdx);
      if (el) { el.classList.add('flipped', 'reveal-flash'); el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true}); }
    }
  });
}

// Reveal all targets at the same time, hide after 2s, then callback
function doSimultaneousReveal(targets, cb) {
  targets.forEach(rIdx => {
    const c = board[rIdx];
    if (c && !c.special && !c.flipped) {
      c.flipped = true;
      const el = getCardEl(rIdx);
      if (el) { el.classList.add('flipped', 'reveal-flash'); el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true}); }
    }
  });
  setTimeout(() => {
    targets.forEach(rIdx => { const c = board[rIdx]; if (c && !c.special && c.flipped) { c.flipped = false; const el = getCardEl(rIdx); if (el) el.classList.remove('flipped'); } });
    cb();
  }, 2200);
}

// ============================================================
// PERFECT SWEEP BOARD REVEAL
// ============================================================
function showBoardBanner(type, title, sub) {
  inputLocked = true;
  let banner = boardContainerEl.querySelector('.board-banner');
  if (banner) banner.remove();
  banner = document.createElement('div');
  banner.className = `board-banner ${type}`;
  banner.innerHTML = `<div class="banner-title">${title}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`;
  boardContainerEl.appendChild(banner);
}

function hideBoardBanner(cb) {
  const banner = boardContainerEl.querySelector('.board-banner');
  if (!banner) { inputLocked = false; cb?.(); return; }
  banner.classList.add('hiding');
  banner.addEventListener('animationend', () => { banner.remove(); inputLocked = false; cb?.(); }, { once: true });
}

function showGoalIntroBanner(cb) {
  if (!levelGoals) { cb?.(); return; }
  const defs = levelGoals.definitions;
  if (defs.length === 0) { cb?.(); return; }

  // Build goal pills HTML with full descriptions
  const pills = defs.map(g => {
    const d = getGoalDisplay(g);
    const desc = goalDescription(g);
    return `<div class="banner-goal-pill"><span>${d.icon}</span><span>${desc}</span></div>`;
  }).join('');

  let banner = boardContainerEl.querySelector('.board-banner');
  if (banner) banner.remove();
  banner = document.createElement('div');
  banner.className = 'board-banner goal-intro';
  banner.innerHTML = `<div class="banner-title">Level ${LEVELS[currentLevelIndex].id}</div><div class="banner-goals">${pills}</div>`;
  boardContainerEl.appendChild(banner);

  // Hold then dismiss
  setTimeout(() => {
    banner.classList.add('hiding');
    banner.addEventListener('animationend', () => { banner.remove(); cb?.(); }, { once: true });
  }, 1800);
}

function showSweepBanner() { showBoardBanner('sweep', '🧹 PERFECT SWEEP!', 'Revealing the NEW board...'); }
function hideSweepBanner(cb) { hideBoardBanner(cb); }

function sweepRevealBoard(cb) {
  const targets = [];
  board.forEach((c, i) => { if (c && !c.special && !c.flipped && !c.locked) targets.push(i); });
  if (!targets.length) { cb(); return; }

  // Regenerate colors and update DOM
  targets.forEach(idx => {
    board[idx].color = randomColor();
    replaceCell(idx);
  });

  lastRevealedCards = targets;
  const stagger = 30;
  targets.forEach((idx, i) => {
    setTimeout(() => {
      board[idx].flipped = true;
      const el = getCardEl(idx);
      if (el) { el.classList.add('flipped', 'reveal-flash'); el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true}); }
    }, i * stagger);
  });
  const holdMs = Math.min(1500 + targets.length * 80, 3000);
  setTimeout(() => {
    targets.forEach(idx => {
      const c = board[idx];
      if (c && c.flipped && !c.special) { c.flipped = false; const el = getCardEl(idx); if (el) el.classList.remove('flipped'); }
    });
    cb();
  }, targets.length * stagger + holdMs);
}

// ============================================================
// RECALL — re-reveal the last shown cards
// ============================================================
function recallCards() {
  dismissNudge(); clearNudgeTimer();
  if (inputLocked || !lastRevealedCards.length) return;
  const targets = lastRevealedCards.filter(i => i >= 0 && board[i] && !board[i].special && !board[i].flipped && !board[i].locked);
  if (!targets.length) return;
  SFX.booster();
  inputLocked = true;
  targets.forEach(idx => {
    board[idx].flipped = true;
    const el = getCardEl(idx);
    if (el) { el.classList.add('flipped', 'reveal-flash'); el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true}); }
  });
  setTimeout(() => {
    targets.forEach(idx => { board[idx].flipped = false; const el = getCardEl(idx); if (el) el.classList.remove('flipped'); });
    inputLocked = false; updateBoosterUI(); updateChainIndicator(); updateRecallButton();
  }, 1800);
}

function updateRecallButton() {
  const btn = document.getElementById('recall-btn');
  if (!btn) return;
  const hasCards = lastRevealedCards.some(i => i >= 0 && board[i] && !board[i].special && !board[i].flipped && !board[i].locked);
  btn.classList.toggle('disabled', !hasCards || inputLocked);
}

// ============================================================
// FINISH TURN
// ============================================================
function finishTurn() {
  chainColor=null; chainColors=new Set(); chainCards=[]; specialsUsed=[];
  turnActive=false; inputLocked=false; activeBooster=null;
  clearNudgeTimer();
  updateChainIndicator(); updateBoosterUI(); updateRecallButton(); updateGoalHUD();
  if (checkAllGoalsMet()) levelWon();
  else if (turns <= 0) levelFailed();
}

function levelWon() {
  const remaining = turns / MAX_TURNS;
  const newStars = remaining >= 2/3 ? 3 : remaining >= 1/3 ? 2 : 1;
  if (newStars > (progress.stars[currentLevelIndex]||0)) progress.stars[currentLevelIndex] = newStars;
  if (currentLevelIndex+1 > progress.highestUnlocked && currentLevelIndex+1 < LEVELS.length)
    progress.highestUnlocked = currentLevelIndex+1;
  if (isWinStreakActive()) progress.winStreak++;
  const coinsEarned = Math.floor(Math.random() * 5) + 8; // 8-12
  progress.coins = (progress.coins || 0) + coinsEarned;
  updateCoinDisplay();
  saveJourneySnapshot();
  saveProgress();
  updateBanner();

  // Show win banner over the board, then open overlay
  showBoardBanner('win', '🎉 LEVEL COMPLETE!', `Score: ${score} · +${coinsEarned} <img src="icons/coin_icon.png" class="coin-icon" alt="coins">`);
  setTimeout(() => hideBoardBanner(() => showWinOverlay()), 1800);
  SFX.win();
  launchConfetti();
}

function showWinOverlay() {

  // Grant level rewards
  const granted = grantLevelRewards(LEVELS[currentLevelIndex].id);

  const stars = progress.stars[currentLevelIndex];
  document.getElementById('win-title').textContent = `Level ${LEVELS[currentLevelIndex].id} Complete!`;
  document.getElementById('win-stars').textContent = '★'.repeat(stars)+'☆'.repeat(3-stars);
  document.getElementById('win-score').textContent  = `Score: ${score}  •  ${turns} turn${turns!==1?'s':''} remaining`;
  const nextPct = getStreakRevealPct();
  const streakMsg = progress.winStreak > 0
    ? `🔥 Win Streak: ${progress.winStreak} — ${Math.round(nextPct * 100)}% board reveal next game`
    : '';
  document.getElementById('win-streak').textContent = streakMsg;

  // Show rewards as pills
  const rewardsEl = document.getElementById('win-rewards');
  if (granted.length > 0) {
    rewardsEl.innerHTML = '<div style="width:100%;text-align:center;font-size:11px;font-weight:700;color:#f0c040;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Rewards</div>' +
      granted.map(r => {
        if ((r.type || 'booster') === 'special') {
          const s = SPECIAL_TYPES.find(x => x.id === r.specialId);
          return `<span class="pre-level-reward-pill"><span class="reward-icon">${s ? s.icon : '?'}</span> +${r.qty} ${s ? s.name : r.specialId}</span>`;
        }
        const b = BOOSTERS.find(x => x.id === r.boosterId);
        return `<span class="pre-level-reward-pill"><span class="reward-icon">${b ? b.icon : '?'}</span> +${r.qty} ${b ? (b.name || b.id) : r.boosterId}</span>`;
      }).join('');
    rewardsEl.style.display = '';
  } else {
    rewardsEl.style.display = 'none';
  }

  document.getElementById('next-level-btn').style.display = currentLevelIndex >= LEVELS.length-1 ? 'none' : '';
  document.getElementById('overlay-win').classList.add('active');
}

function levelFailed() {
  const hadStreak = progress.winStreak;
  _failSavedStreak = hadStreak;   // stash so keepStreak() can restore it
  progress.winStreak = 0;
  progress.lives = Math.max(0, (progress.lives ?? 5) - 1);
  saveJourneySnapshot();
  saveProgress();
  updateBanner();

  // Show fail banner over the board, then open overlay
  showBoardBanner('fail', '💔 LEVEL FAILED', `Score: ${score} / ${TARGET}`);
  SFX.fail();
  shakeBoard();
  setTimeout(() => hideBoardBanner(() => showFailOverlay(hadStreak)), 1800);
}

function showFailOverlay(hadStreak) {
  document.getElementById('fail-sub').textContent = `Score: ${score} / ${TARGET}`;

  const streakInfo = document.getElementById('fail-streak-info');
  if (hadStreak > 0) {
    streakInfo.textContent = `You lost your 🔥 ${hadStreak} win streak!`;
  } else {
    streakInfo.textContent = '';
  }

  // Show continue option — disabled if player can't afford it
  const continueBtn = document.getElementById('keep-streak-btn');
  const canAfford = (progress.coins || 0) >= KEEP_STREAK_COST;
  document.getElementById('keep-streak-cost').textContent = KEEP_STREAK_COST;
  continueBtn.disabled = !canAfford;
  continueBtn.style.opacity = canAfford ? '1' : '0.4';
  continueBtn.style.cursor = canAfford ? 'pointer' : 'not-allowed';

  document.getElementById('overlay-fail').classList.add('active');
}

let _failSavedStreak = 0;
function continueLevelWithCoins() {
  progress.coins = (progress.coins || 0) - KEEP_STREAK_COST;
  // Restore life that was lost on fail
  progress.lives = Math.min(5, (progress.lives ?? 0) + 1);
  updateCoinDisplay();
  updateLivesDisplay();
  saveJourneySnapshot();
  saveProgress();

  // Restore streak that was lost
  progress.winStreak = _failSavedStreak;
  saveProgress();

  // Close fail overlay and resume the game with 5 extra turns
  document.getElementById('overlay-fail').classList.remove('active');
  turns += 5;
  inputLocked = false;
  turnsEl.textContent = turns;
  updateBanner();
  updateChainIndicator();
  updateBoosterUI();
  updateGoalHUD();
}

// ============================================================
// SCORE POPUP
// ============================================================
function showScorePopup(pts, indices, extraMsg) {
  const mid = indices[Math.floor(indices.length/2)];
  const cell = boardEl.children[mid]; if(!cell) return;
  const rect = cell.getBoundingClientRect();
  const p = document.createElement('div'); p.className='score-popup';
  p.textContent = `+${pts}`;
  p.style.left = `${rect.left+rect.width/2-30}px`;
  p.style.top  = `${rect.top}px`;
  document.body.appendChild(p); setTimeout(()=>p.remove(), 1000);
  if (extraMsg) {
    const m = document.createElement('div'); m.className='score-popup';
    m.textContent = extraMsg;
    m.style.left = `${rect.left+rect.width/2-60}px`;
    m.style.top  = `${rect.top - 30}px`;
    m.style.fontSize = '18px'; m.style.color = '#f0c040'; m.style.width = '140px'; m.style.textAlign = 'center';
    document.body.appendChild(m); setTimeout(()=>m.remove(), 1500);
  }
}

// ============================================================
// INITIAL BOARD REVEAL — streak determines how much is shown
// ============================================================
function revealEntireBoard() {
  inputLocked = true;
  const pct = isWinStreakActive() ? getStreakRevealPct() : 0;
  const revealMs  = Math.min(1500 + progress.winStreak * 250, 3500);
  const staggerMs = 50;

  // Decide which cards get the streak pre-reveal (stay face-up permanently)
  const streakIndices = new Set();
  if (pct > 0) {
    const indices = board.map((_, i) => i).filter(i => board[i] && !board[i].locked && !board[i].special);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const count = Math.min(Math.ceil(TOTAL * pct), TOTAL);
    indices.slice(0, count).forEach(idx => streakIndices.add(idx));
  }

  // Briefly flash only streak-awarded cards, then hide them
  if (streakIndices.size > 0) {
    lastRevealedCards = [...streakIndices];
    board.forEach((c, i) => {
      if (!c || !streakIndices.has(i)) return;
      c.flipped = true;
      const el = getCardEl(i);
      if (el) setTimeout(() => {
        el.classList.add('flipped');
        setTimeout(() => { el.classList.remove('flipped'); c.flipped = false; }, revealMs);
      }, i * staggerMs);
    });
  }

  const unlockDelay = streakIndices.size > 0 ? TOTAL * staggerMs + revealMs + 200 : 200;
  setTimeout(() => {
    inputLocked = false; updateBoosterUI(); updateRecallButton();
    advanceTutorial('boardRevealed');
  }, unlockDelay);
}

// ============================================================
// BOOT — LEVELS already loaded via levels_default.js script tag
// ============================================================
(function boot() {
  // Restore saved progression style and its journey snapshot
  if (progress.progressionStyle) {
    applyProgression(progress.progressionStyle);
    restoreJourneySnapshot(progress.progressionStyle);
  }
  // Ensure stars is a proper array matching LEVELS length
  const oldStars = Array.isArray(progress.stars) ? progress.stars : [];
  progress.stars = new Array(LEVELS.length).fill(0);
  oldStars.forEach((s, i) => { if (i < progress.stars.length) progress.stars[i] = s; });
  // Clamp currentLevelIndex
  if (typeof progress.highestUnlocked !== 'number') progress.highestUnlocked = 0;
  currentLevelIndex = Math.min(progress.highestUnlocked, LEVELS.length - 1);
  currentLevelIndex = Math.max(0, currentLevelIndex);
  document.getElementById('home-screen').classList.add('active');
})();
