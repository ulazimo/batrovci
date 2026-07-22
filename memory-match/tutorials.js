// ============================================================
// TUTORIALS, feature popups & level select grid
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

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
  const descEl = document.getElementById('special-tut-desc');
  if (item.descHTML) descEl.innerHTML = item.descHTML;
  else descEl.textContent = item.desc;
  const tutBox = document.querySelector('.special-tutorial-box');
  if (tutBox) tutBox.style.borderColor = item.accentColor || '';
  document.getElementById('special-tut-name').style.color = item.accentColor || '';
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
  const cards = getStreakRevealCount();
  document.getElementById('ls-streak').textContent = streak > 0
    ? `🔥 Win Streak: ${streak} (👁 ${cards} card${cards !== 1 ? 's' : ''} revealed)`
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
