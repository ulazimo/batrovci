// ============================================================
// LIVES REGENERATION
// The only way to gain lives back: run out, and a 5-minute countdown
// refills all of them at once. While it runs, both lives pills (the level
// banner's and the hall's) swap their heart+count for the countdown in white
// text, and the hall's Play button is disabled — with no lives there is
// nothing to spend on a level.
//
// The deadline is stored as an absolute timestamp (`progress.livesRefillAt`)
// rather than a remaining-seconds counter, so it keeps ticking while the tab
// is closed instead of pausing with it.
// All files share one global namespace — do not redeclare a name.
// ============================================================

const MAX_LIVES = 5;
const LIVES_REFILL_MS = 5 * 60 * 1000;

let _livesTicker = null;

// Milliseconds left on the refill countdown, or 0 when none is running.
function livesRefillRemaining() {
  const at = progress.livesRefillAt;
  if (!at) return 0;
  return Math.max(0, at - Date.now());
}

// mm:ss for the pill.
function formatLivesCountdown(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ':' + String(s).padStart(2, '0');
}

// Start the countdown the moment lives hit 0. Idempotent: an already-running
// timer is never restarted, so repeated fails can't extend the wait.
function startLivesRefillTimer() {
  if (progress.livesRefillAt) return;
  progress.livesRefillAt = Date.now() + LIVES_REFILL_MS;
  if (typeof saveJourneySnapshot === 'function') saveJourneySnapshot();
  saveProgress();
  scheduleLivesTick();
}

// Hand back a full set of lives and clear the countdown.
function completeLivesRefill() {
  progress.lives = MAX_LIVES;
  delete progress.livesRefillAt;
  if (typeof saveJourneySnapshot === 'function') saveJourneySnapshot();
  saveProgress();
}

// Reconcile stored state with the wall clock: expire a finished countdown, and
// start one for a save that ran out of lives before this feature existed (or
// had its timer lost). Safe to call as often as needed.
function syncLivesRefill() {
  if (progress.livesRefillAt && livesRefillRemaining() <= 0) {
    completeLivesRefill();
    return;
  }
  if ((progress.lives ?? MAX_LIVES) <= 0 && !progress.livesRefillAt) {
    startLivesRefillTimer();
  }
}

// One shared 1s interval drives every lives pill; it only exists while a
// countdown is actually running.
function scheduleLivesTick() {
  if (_livesTicker) return;
  _livesTicker = setInterval(() => {
    syncLivesRefill();
    renderLives();
    // Refill landed — nothing left to tick.
    if (!progress.livesRefillAt) {
      clearInterval(_livesTicker);
      _livesTicker = null;
    }
  }, 1000);
}

// Paint one `.lives-pill`: either heart + count, or the white countdown.
function renderLivesPill(countEl) {
  if (!countEl) return;
  const pill = countEl.closest('.lives-pill');
  const remaining = livesRefillRemaining();
  if (remaining > 0) {
    countEl.textContent = formatLivesCountdown(remaining);
    if (pill) pill.classList.add('refilling');
  } else {
    countEl.textContent = progress.lives ?? MAX_LIVES;
    if (pill) pill.classList.remove('refilling');
  }
}

// Refresh every lives readout plus the hall's Play button. This is the single
// entry point callers need after changing `progress.lives`.
function renderLives() {
  syncLivesRefill();
  renderLivesPill(document.getElementById('lives-count'));
  renderLivesPill(document.getElementById('room-lives'));
  updatePlayButtonLock();
  if (progress.livesRefillAt) scheduleLivesTick();
}

// No lives → no Play. Uses `disabled` so the CSS and the click are blocked by
// the same flag. A finished journey keeps Play locked for good, so a refill
// can't hand the button back.
function updatePlayButtonLock() {
  const btn = document.querySelector('.room-play-btn');
  if (!btn) return;
  const done = (typeof journeyComplete === 'function') && journeyComplete();
  btn.disabled = done || (progress.lives ?? MAX_LIVES) <= 0;
}
