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

const BOOSTERS = [
  { id:'peek',      icon:'👁',  desc:'Reveal one card by tapping it',                               needsTap:true  },
  { id:'random3',   icon:'🎲',  desc:'Reveal 3 random face-down cards',                             needsTap:false },
  { id:'cross',     icon:'✚',  desc:'Reveal cards in a cross around the card you tap',              needsTap:true  },
  { id:'row',       icon:'↔',  desc:'Reveal the entire row of the card you tap',                    needsTap:true  },
  { id:'col',       icon:'↕',  desc:'Reveal the entire column of the card you tap',                 needsTap:true  },
  { id:'neighbor',  icon:'🔗',  desc:'Reveal same-color neighbors around the last revealed card',   needsTap:false },
  { id:'colorpick', icon:'🎨',  desc:'Choose a color and reveal 3 cards of that color',             needsTap:false },
  { id:'shield',    icon:'🛡',  desc:'Next 2 wrong-color reveals won\'t break your combo',          needsTap:false },
  { id:'joker',     icon:'🃏',  desc:'Tap a card — it acts as your last-played card (copies its color or special)',  needsTap:true  },
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
  ['home-screen','level-select','overlay-fail','overlay-win','pre-level','color-picker','settings-panel','tutorial-overlay']
    .forEach(id => document.getElementById(id).classList.remove('active'));
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
  MAX_TURNS = lvl.turns; TARGET = lvl.target;
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
  closeAllOverlays();
  preLevelSelections = [];

  // Title
  document.getElementById('pre-level-title').textContent = `Level ${LEVELS[currentLevelIndex].id} — Prepare`;

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
  document.getElementById('banner-level').textContent = `Level ${LEVELS[currentLevelIndex].id}`;
  const pct = getStreakRevealPct();
  const streakText = progress.winStreak > 0
    ? `🔥 ${progress.winStreak} (${Math.round(pct * 100)}% reveal)`
    : '';
  document.getElementById('banner-streak').textContent = streakText;
  document.getElementById('banner-dots').innerHTML = LEVELS.map((_, i) => {
    const cls = i < currentLevelIndex ? 'dot done' : i === currentLevelIndex ? 'dot current' : 'dot';
    return `<div class="${cls}"></div>`;
  }).join('');
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
      SFX.mismatch(); shakeBoard();
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
  stopChainTimer();
  board = Array.from({ length: TOTAL }, (_, i) => createCard(i));

  // Place pre-selected special cards at random positions
  if (preplacedSpecials && preplacedSpecials.length > 0) {
    const available = board.map((_, i) => i);
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

  // Place locked cards at fixed positions from level config
  const lvl = LEVELS[currentLevelIndex];
  if (lvl.locked && lvl.locked.length > 0) {
    lvl.locked.forEach(([r, c]) => {
      const idx = r * COLS + c;
      if (idx >= 0 && idx < TOTAL && board[idx] && !board[idx].special) {
        board[idx].locked = true;
      }
    });
  }

  targetEl.textContent = TARGET;
  renderBoard(); initBoosters(); scoreEl.textContent = 0; turnsEl.textContent = turns; updateChainIndicator(); updateStatusBadge(); updateRecallButton(); updateRecallBar();

  // Booster tutorial: highlight bar and show hint on first level with boosters
  if (!progress.boosterTutorialDone && BOOSTERS.some(b => boosterCounts[b.id] > 0)) {
    progress.boosterTutorialDone = true;
    saveProgress();
    setTimeout(() => {
      boosterBar.classList.add('highlight');
      showTutorialHint('You have Power-Ups! Tap one below to use it 👇');
      setTimeout(() => boosterBar.classList.remove('highlight'), 4600);
    }, 800);
  }

  // Apply winstreak effect (only if enabled for this level)
  if (isWinStreakActive()) {
    const streakShields = getStreakShields();
    if (streakShields > 0) { shieldCharges = streakShields; updateStatusBadge(); updateChainIndicator(); }
  }

  // Tutorial: show overlay on level 1 if not completed; otherwise reveal normally
  if (isTutorialLevel()) {
    showTutorialOverlay();
  } else {
    revealEntireBoard();
  }
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
// LEVEL REWARDS
// ============================================================
const DEFAULT_LEVEL_REWARDS = [
  { afterLevel: 1, boosterId: 'peek', qty: 3 },
];

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
  { combo: 4,   specialId: 'cross' },
  { combo: 5,   specialId: 'ring' },
  { combo: '6+', specialId: 'diamond' },
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
  return `<div class="card${lockedCls}" data-index="${i}"><div class="card-face card-back"></div><div class="card-face card-front ${card.color}"><img src="blocks/block_${card.color}_1.png" alt="${card.color}"></div></div>`;
}

function renderBoard() {
  boardEl.innerHTML = '';
  board.forEach(card => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.innerHTML = buildCardHTML(card);
    boardEl.appendChild(cell);
  });
}

boardEl.addEventListener('click', e => {
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
    // Reset any inline scale
    boardEl.querySelectorAll('.card.flipped:not(.special) .card-front').forEach(el => {
      el.style.scale = '';
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
  const t = performance.now();
  // Shared sine wave — all cards read the same phase
  const phase = (t % tensionSpeed) / tensionSpeed;
  const s = 1 + tensionScale * Math.sin(phase * Math.PI * 2);
  boardEl.querySelectorAll('#board[data-tension] .card.flipped:not(.special):not(.exploding) .card-front').forEach(el => {
    el.style.scale = s;
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

function updateChainIndicator() {
  updateChainTension();
  updateComboSpawnIndicator();
  updateChainFaces();
  if (!turnActive) {
    chainEl.innerHTML = spotlightMode
      ? '🔦 Tap a face-down card to reveal it'
      : activeBooster
      ? `Select a card for ${BOOSTERS.find(b => b.id === activeBooster).icon}`
      : 'Tap a card to begin';
    return;
  }
  const nc = chainCards.filter(i => !board[i].special).length;
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
    [...chainColors].forEach(color => {
      const colorCards = chainCards.filter(i => !board[i].special && board[i].color === color);
      if (colorCards.length === 0) return;
      const dots = colorCards.map(() =>
        `<span class="chain-dot" style="background:${cssColor(color)}"></span>`).join('');
      lines += `<div class="chain-color-row">${dots} <span style="color:${cssColor(color)}">(${colorCards.length})</span></div>`;
    });
    chainEl.innerHTML = `Chain: ${lines}<div class="chain-color-row">${sDots} <span>(${nc}${sc>0?'+'+sc+'⚡':''}${extra})</span></div>`;
  } else {
    const nDots = chainCards.filter(i => !board[i].special).map(i =>
      `<span class="chain-dot" style="background:${cssColor(board[i].color || chainColor)}"></span>`).join('');
    const sDots = specialsUsed.map(() =>
      `<span class="chain-dot" style="background:#fff;border:2px solid #999"></span>`).join('');
    chainEl.innerHTML = `Chain: ${nDots}${sDots} <span>(${nc}${sc>0?'+'+sc+'⚡':''}${extra})</span>`;
  }
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
      // Check perfect sweep
      const activeColors = getRule('coloredBombs') ? [...chainColors] : [chainColor];
      const remaining = board.filter(c => c && !c.special && !c.flipped && activeColors.includes(c.color));
      if (remaining.length === 0 && chainLen >= 3) {
        stopChainTimer();
        inputLocked = true;
        setTimeout(() => endTurn(false, true), 600);
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
  const fd = board.filter(c=>!c.flipped&&!c.special).map(c=>c.index).sort(()=>Math.random()-.5);
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
  const m = board.filter(c=>!c.flipped&&!c.special&&c.color===color&&!c.locked).map(c=>c.index).sort(()=>Math.random()-.5);
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
      // Check perfect sweep
      const activeColors = getRule('coloredBombs') ? [...chainColors] : [chainColor];
      const remaining = board.filter(c => c && !c.special && !c.flipped && activeColors.includes(c.color));
      if (remaining.length === 0 && chainLen >= 3) {
        stopChainTimer();
        inputLocked = true;
        setTimeout(() => endTurn(false, true), 600);
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
  const el = getCardEl(index); el.classList.add('flipped');
  // Remove tint hint when card is flipped
  if (el.classList.contains('tinted')) { el.classList.remove('tinted'); el.style.removeProperty('--tint-color'); }
  SFX.flip();

  if (!turnActive) { turnActive=true; chainColor=card.color; chainColors=new Set([card.color]); chainCards=[index]; specialsUsed=[]; lastSelectedIdx=index; updateChainIndicator(); advanceTutorial('firstFlip'); return; }
  if (chainColor === null) { chainColor=card.color; chainColors=new Set([card.color]); chainCards.push(index); lastSelectedIdx=index; updateChainIndicator(); return; }
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
    // Check if all cards of ALL active chain colors have been found (perfect sweep)
    const activeColors = getRule('coloredBombs') ? [...chainColors] : [chainColor];
    const remaining = board.filter(c => c && !c.special && !c.flipped && activeColors.includes(c.color));
    if (remaining.length === 0 && chainLen >= 3) {
      stopChainTimer();
      inputLocked = true;
      setTimeout(() => endTurn(true, true), 300);
    }
    // Check all-colors-active bonus
    if (getRule('coloredBombs') && chainColors.size >= ACTIVE_COLORS.length) {
      checkAllColorsBonus();
    }
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

  SFX.mismatch(); shakeBoard();
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

  if (combo >= 3) {
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
          if (allRevealed.length > 0) {
            setTimeout(() => {
              allRevealed.forEach(idx => { const c = board[idx]; if (c && !c.special && c.flipped) { c.flipped = false; const el = getCardEl(idx); if (el) el.classList.remove('flipped'); } });
              doFinish();
            }, 2200);
          } else doFinish();
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
    if (idx===skip) return;
    board[idx]=createCard(idx); replaceCell(idx); nc.push(idx);
    const el=getCardEl(idx);
    if (el) { el.classList.add('dropping'); el.addEventListener('animationend',()=>el.classList.remove('dropping'),{once:true}); }
  });
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
function showSweepBanner() {
  let banner = boardContainerEl.querySelector('.sweep-banner');
  if (banner) banner.remove();
  banner = document.createElement('div');
  banner.className = 'sweep-banner';
  banner.innerHTML = '<div class="sweep-title">🧹 PERFECT SWEEP!</div><div class="sweep-sub">Revealing the board...</div>';
  boardContainerEl.appendChild(banner);
}

function hideSweepBanner(cb) {
  const banner = boardContainerEl.querySelector('.sweep-banner');
  if (!banner) { cb(); return; }
  banner.classList.add('hiding');
  banner.addEventListener('animationend', () => { banner.remove(); cb(); }, { once: true });
}

function sweepRevealBoard(cb) {
  const targets = [];
  board.forEach((c, i) => { if (c && !c.special && !c.flipped && !c.locked) targets.push(i); });
  if (!targets.length) { cb(); return; }
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
  updateChainIndicator(); updateBoosterUI(); updateRecallButton();
  if (score >= TARGET) levelWon();
  else if (turns <= 0) levelFailed();
}

function levelWon() {
  const remaining = turns / MAX_TURNS;
  const newStars = remaining >= 2/3 ? 3 : remaining >= 1/3 ? 2 : 1;
  if (newStars > (progress.stars[currentLevelIndex]||0)) progress.stars[currentLevelIndex] = newStars;
  if (currentLevelIndex+1 > progress.highestUnlocked && currentLevelIndex+1 < LEVELS.length)
    progress.highestUnlocked = currentLevelIndex+1;
  if (isWinStreakActive()) progress.winStreak++;
  saveProgress();
  updateBanner();

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

  // Show rewards
  const rewardsEl = document.getElementById('win-rewards');
  if (granted.length > 0) {
    const rewardText = granted.map(r => {
      if ((r.type || 'booster') === 'special') {
        const s = SPECIAL_TYPES.find(x => x.id === r.specialId);
        return `+${r.qty} ${s ? s.icon : ''} ${s ? s.name : r.specialId}`;
      }
      const b = BOOSTERS.find(x => x.id === r.boosterId);
      return `+${r.qty} ${b ? b.icon : ''} ${b ? (b.name || b.id) : r.boosterId}`;
    }).join('  •  ');
    rewardsEl.textContent = rewardText;
    rewardsEl.style.display = '';
  } else {
    rewardsEl.style.display = 'none';
  }

  document.getElementById('next-level-btn').style.display = currentLevelIndex >= LEVELS.length-1 ? 'none' : '';
  document.getElementById('overlay-win').classList.add('active');
  SFX.win();
  launchConfetti();
}

function levelFailed() {
  const hadStreak = progress.winStreak;
  _failSavedStreak = hadStreak;   // stash so keepStreak() can restore it
  progress.winStreak = 0;
  saveProgress();
  updateBanner();

  document.getElementById('fail-sub').textContent = `Score: ${score} / ${TARGET}`;

  // Show keep-streak option if player had a streak and scored enough to pay
  const keepBtn = document.getElementById('keep-streak-btn');
  const streakInfo = document.getElementById('fail-streak-info');
  if (hadStreak > 0) {
    streakInfo.textContent = `You lost your 🔥 ${hadStreak} win streak!`;
    if (score >= KEEP_STREAK_COST) {
      keepBtn.style.display = '';
      document.getElementById('keep-streak-cost').textContent = KEEP_STREAK_COST;
    } else {
      keepBtn.style.display = 'none';
    }
  } else {
    streakInfo.textContent = '';
    keepBtn.style.display = 'none';
  }

  document.getElementById('overlay-fail').classList.add('active');
  SFX.fail();
  shakeBoard();
}

let _failSavedStreak = 0;
function keepStreak() {
  progress.winStreak = _failSavedStreak;
  saveProgress();
  updateBanner();
  document.getElementById('keep-streak-btn').style.display = 'none';
  document.getElementById('fail-streak-info').textContent = `🔥 Streak restored to ${progress.winStreak}!`;
  document.getElementById('fail-streak-info').style.color = '#2ecc71';
  setTimeout(() => { document.getElementById('fail-streak-info').style.color = '#f39c12'; }, 2000);
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
    const indices = board.map((_, i) => i).filter(i => !board[i].locked && !board[i].special);
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
      if (!streakIndices.has(i)) return;
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
// BOOT — show home screen
// ============================================================
document.getElementById('home-screen').classList.add('active');
