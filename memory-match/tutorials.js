// ============================================================
// LEVEL SELECT GRID
// (Former tutorial/popup code lived here — removed for a clean-slate
// tutorial rebuild. Shared state & DOM refs live in state.js, loaded
// first via <script>; boot.js loads last. All files share one global
// namespace — do not redeclare a name.)
// ============================================================

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
  // Forward-only progression: the ONLY playable level is the next one
  // (i === highestUnlocked). Completed levels show their stars but can't be
  // replayed; later levels stay locked. (Devs jump anywhere via #level-jumper.)
  const nextIdx = progress.highestUnlocked || 0;
  LEVELS.forEach((lvl, i) => {
    const stars     = progress.stars[i] || 0;
    const isCompleted = stars > 0;
    const isNext    = i === nextIdx;
    const isLocked  = i > nextIdx;
    const btn = document.createElement('div');
    btn.className = 'lvl-btn ' + (
      isLocked    ? 'locked' :
      isNext      ? 'current' :
      isCompleted ? 'completed' : 'unlocked'
    );
    btn.innerHTML = `
      <span class="lvl-num">${isLocked ? '🔒' : lvl.id}</span>
      <span class="lvl-stars">${isCompleted ? '★'.repeat(stars)+'☆'.repeat(3-stars) : ''}</span>
    `;
    // Only the next level is playable — no going backwards.
    if (isNext) btn.addEventListener('click', () => { currentLevelIndex = i; showPreLevel(); });
    grid.appendChild(btn);
  });
}
