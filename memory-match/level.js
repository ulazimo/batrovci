// ============================================================
// LEVEL LIFECYCLE — init, pre-level prep, game start
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

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
        const cards = getStreakRevealCount();
        streakEl.textContent = `🔥 Win Streak: ${streak} — 👁 ${cards} card${cards !== 1 ? 's' : ''} revealed`;
      } else {
        const shields = getStreakShields();
        streakEl.textContent = `🔥 Win Streak: ${streak} — 🛡 ${shields} shield${shields !== 1 ? 's' : ''}`;
      }
    } else {
      streakEl.textContent = 'No win streak active';
    }
    const cards = getWinStreakCards();
    const ladder = [];
    for (let lvl = 0; lvl < cards.length; lvl++) {
      const active = streak >= lvl;
      const value = effect === 'reveal' ? `👁${cards[lvl]}` : `🛡${lvl}`;
      ladder.push(`<span style="color:${active ? '#f0c040' : '#555'}">` +
        `${lvl === 0 ? 'No streak' : '🔥' + lvl}: ${value}</span>`);
    }
    breakdownEl.innerHTML = ladder.join(' &nbsp;→&nbsp; ');
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
  const comboMap = getComboMapping();
  const orderedSpecs = comboMap
    .map(m => SPECIAL_TYPES.find(s => s.id === m.specialId))
    .filter(Boolean)
    .filter(spec => (progress.specialInventory[spec.id] || 0) > 0);
  // Nothing owned to deploy (bombs are power-ups now) — hide the whole section
  if (orderedSpecs.length === 0) {
    if (sectionTitle) sectionTitle.style.display = 'none';
    grid.style.display = 'none';
    document.getElementById('pre-level').classList.add('active');
    return;
  }
  if (sectionTitle) sectionTitle.style.display = '';
  grid.style.display = '';
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
// GAME START
// ============================================================
function startGame(preplacedSpecials) {
  closeAllOverlays();
  score = 0; turns = MAX_TURNS; _scoreDisplayed = 0;
  chainColor = null; chainColors = new Set(); chainCards = []; specialsUsed = []; lastSelectedIdx = -1;
  turnActive = false; inputLocked = false;
  shieldCharges = 0; echoCharges = 0; spotlightMode = false; activeBooster = null;
  lastRevealedCards = [];
  remnantHintShown = false;
  bankProgress = 0; bankBombPlacement = false; clearBombPlacement();
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

  // Cleaning levels: re-roll board colors for an even spread, and build the finite
  // refill deck that draws into cleared slots until it runs out.
  deck = [];
  if (lvl.clearBoard) {
    const fillable = board.map((c, i) => (c && !c.special) ? i : -1).filter(i => i >= 0);
    const colors = generateClearableColors(fillable.length, ACTIVE_COLORS);
    fillable.forEach((idx, k) => { board[idx].color = colors[k]; });
    deck = buildDeck(lvl.deck || 0, ACTIVE_COLORS);
  }

  targetEl.textContent = TARGET > 0 ? TARGET : '—';
  const tLabel = document.getElementById('target-label');
  if (tLabel) tLabel.textContent = lvl.clearBoard ? 'Deck' : 'Target';
  initLevelGoals();
  updateDeckHUD();
  renderBoard(); renderCoverageIndicators(); initBoosters(); initBankButton(); updateBankProgress(); initCollection(); scoreEl.textContent = 0; turnsEl.textContent = turns; turnsEl.classList.remove('danger','danger-pulse'); updateChainIndicator(); updateStatusBadge(); updateRecallButton(); updateRecallBar(); updateGoalHUD();
  fitBoard(); // re-fit now that goal HUD / coverage indicators are in place (renderBoard's own call ran before them)

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
  const showTutorialsAfterReveal = () => {
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
  };
  showGoalIntroBanner(() => {
    if (isTutorialLevel()) {
      showTutorialOverlay();
      showTutorialsAfterReveal();
    } else {
      revealEntireBoard(showTutorialsAfterReveal);
    }
  });
}

function retryLevel() { showPreLevel(); }

function startTestLevel() {
  // Temporarily inject a test level at the end and play it
  const testLevel = { id: 999, cols: 8, rows: 8, colorCount: 4, turns: 99, goals: [{ type: 'score', target: 1000000 }] };
  const testIdx = LEVELS.length;
  LEVELS.push(testLevel);
  // Ensure stars array covers it
  if (progress.stars.length <= testIdx) progress.stars.push(0);
  currentLevelIndex = testIdx;
  closeAllOverlays();
  startLevel();
}

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
