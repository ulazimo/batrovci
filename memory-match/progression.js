// ============================================================
// PROGRESSION & JOURNEYS — load/save/restore, playFromHome
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

function applyProgression(style) {
  const PRESETS = {
    default:  { levels: LEVELS_DEFAULT,  progression: PROGRESSION_UNLOCK_DEFAULTS, rewards: REWARDS_DEFAULT },
    short:    { levels: LEVELS_SHORT,    progression: PROGRESSION_SHORT,           rewards: PROGRESSION_SHORT.levelRewards },
    cleaning: { levels: LEVELS_CLEANING, progression: PROGRESSION_CLEANING,        rewards: PROGRESSION_CLEANING.levelRewards },
    cleaningxl: { levels: LEVELS_CLEANINGXL, progression: PROGRESSION_CLEANING_XL, rewards: PROGRESSION_CLEANING_XL.levelRewards },
    long:     { levels: LEVELS_LONG,     progression: PROGRESSION_LONG,            rewards: PROGRESSION_LONG.levelRewards },
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

  // Reflect the active journey on <body> for journey-specific styling (e.g. cleaning hides score/goals).
  if (document.body) {
    document.body.classList.remove('journey-default', 'journey-short', 'journey-cleaning', 'journey-cleaningxl', 'journey-long');
    document.body.classList.add('journey-' + style);
  }
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
  progress.lives = 5;
  delete progress.levelRewards;
  delete progress.comboMapping;
  Object.keys(boosterCounts).forEach(k => boosterCounts[k] = 0);
  // Clear saved snapshot too
  if (progress.journeys?.[progress.progressionStyle]) {
    delete progress.journeys[progress.progressionStyle];
  }
  saveBoosterCounts();
  saveProgress();
  updateCoinDisplay();
  updateLivesDisplay();
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
