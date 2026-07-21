// ============================================================
// BOOT — restore progression & show home. Loads LAST.
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

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
