// ============================================================
// CHAIN TIMER — optional countdown
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

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
