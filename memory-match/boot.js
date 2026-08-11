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
  // Default to the main journey (the Music Hall campaign). Players never see the
  // journey picker; devs can still switch journeys from Settings.
  if (!progress.progressionStyle) progress.progressionStyle = MAIN_JOURNEY;
  // Over-the-air levels: apply the best cached remote bundle (only if newer than
  // this build) BEFORE the engine reads LEVELS_CLEANINGXL. Falls back to bundled.
  if (typeof applyBestContentAtBoot === 'function') applyBestContentAtBoot();
  applyProgression(progress.progressionStyle);
  restoreJourneySnapshot(progress.progressionStyle);

  // Ensure stars is a proper array matching LEVELS length
  const oldStars = Array.isArray(progress.stars) ? progress.stars : [];
  progress.stars = new Array(LEVELS.length).fill(0);
  oldStars.forEach((s, i) => { if (i < progress.stars.length) progress.stars[i] = s; });
  // Clamp currentLevelIndex
  if (typeof progress.highestUnlocked !== 'number') progress.highestUnlocked = 0;
  currentLevelIndex = Math.min(progress.highestUnlocked, LEVELS.length - 1);
  currentLevelIndex = Math.max(0, currentLevelIndex);

  // Dev affordances live outside the phone frame (desktop only). Test mode gates
  // every in-frame dev button, so apply it before the first screen renders.
  applyTestMode();
  buildTestModePanel();
  buildLevelJumper();
  showHome();   // renders the lives pill (and its refill countdown) via renderLives()

  // Background OTA content refresh — writes the localStorage cache only; the new
  // bundle is applied on the next launch, never mid-session. Fire-and-forget.
  if (typeof refreshRemoteContent === 'function') refreshRemoteContent();

  // First launch → the ToS / Privacy consent gate MUST come first, before any
  // personal data is collected. Only once the player accepts do we ask for a
  // username and start the FTUE (both sit over the hall).
  const startFirstRunPrompts = () => {
    // First launch on this device → ask for a username (once). Sits over the hall.
    if (typeof maybeAskUsername === 'function') maybeAskUsername();
    // FTUE: spotlight Play on the home screen (no-op if the username prompt is up —
    // submitUsername re-triggers it once the prompt closes).
    if (typeof maybeStartHomeFTUE === 'function') maybeStartHomeFTUE();
  };
  if (typeof maybeAskConsent === 'function') maybeAskConsent(startFirstRunPrompts);
  else startFirstRunPrompts();
})();
