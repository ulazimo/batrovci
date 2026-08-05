// ============================================================
// BOOT — canvas setup, the frame loop, screen switching
// ============================================================

let canvas, ctx;
let viewW = 0, viewH = 0;   // CSS pixels of the canvas
let dpr = 1;

// Screens are plain divs; only one carries .active at a time.
const SCREENS = ['home-screen', 'game-screen'];
let currentScreen = 'home-screen';

function showScreen(id) {
  currentScreen = id;
  for (const s of SCREENS) {
    const el = document.getElementById(s);
    if (el) el.classList.toggle('active', s === id);
  }
  // The canvas has no size while its screen is display:none, so re-measure on
  // the way in. Synchronously first — layout is already valid once the class is
  // set, and anything that reads viewH (the Focus House button, the camera)
  // must not see zero. The rAF is a second pass for safe-area settling.
  if (id === 'game-screen') {
    resizeCanvas();
    requestAnimationFrame(resizeCanvas);
  }
}

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);   // cap DPR — 3x costs a lot for no visible gain
  viewW = rect.width;
  viewH = rect.height;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (typeof onViewResize === 'function') onViewResize();
}

// ---- Frame loop ----
// Physics runs on a fixed step so a shot is reproducible regardless of frame
// rate; rendering happens once per frame with whatever the sim ended on.
const FIXED_DT = 1 / 120;
const MAX_CATCHUP = 0.25;   // never simulate more than a quarter second in one frame
let accumulator = 0;
let lastTime = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (!lastTime) { lastTime = now; return; }

  let elapsed = (now - lastTime) / 1000;
  lastTime = now;
  if (elapsed > MAX_CATCHUP) elapsed = MAX_CATCHUP;   // tab was backgrounded

  accumulator += elapsed;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < 40) {
    stepSimulation(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps >= 40) accumulator = 0;   // bail out rather than spiral

  renderFrame(elapsed);
}

// Advance every system that needs a fixed timestep.
function stepSimulation(dt) {
  if (currentScreen !== 'game-screen') return;
  if (typeof stepDelivery  === 'function') stepDelivery(dt);
  if (typeof stepBrushing  === 'function') stepBrushing(dt);
  if (typeof stepPhysics   === 'function') stepPhysics(dt);
  if (typeof stepMatchFlow === 'function') stepMatchFlow(dt);
}

// Draw one frame. dt here is real elapsed time, for animation easing only.
function renderFrame(dt) {
  if (!ctx || !viewW) return;

  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, viewW, viewH);

  if (currentScreen !== 'game-screen') return;

  if (typeof stepCamera === 'function') stepCamera(dt);
  if (typeof updateProjection === 'function') updateProjection();

  if (typeof drawSheet   === 'function') drawSheet(ctx);
  if (typeof drawRocks   === 'function') drawRocks(ctx);
  if (typeof drawShotUI  === 'function') drawShotUI(ctx);
  if (typeof drawBrushes === 'function') drawBrushes(ctx);
  if (typeof drawVfx     === 'function') drawVfx(ctx, dt);
  if (typeof drawScoringOverlay === 'function') drawScoringOverlay(ctx);
}

// ---- Init ----
function init() {
  canvas = document.getElementById('sheet-canvas');
  ctx = canvas.getContext('2d');

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 120));

  if (typeof initHome     === 'function') initHome();
  if (typeof initHud      === 'function') initHud();
  if (typeof initShot     === 'function') initShot();
  if (typeof initBrushing === 'function') initBrushing();
  if (typeof initMatch    === 'function') initMatch();

  // Top-down debug toggle — the ground truth for verifying geometry.
  const tdBtn = document.getElementById('btn-topdown');
  if (tdBtn) {
    tdBtn.addEventListener('click', () => {
      const on = toggleTopDown();
      tdBtn.classList.toggle('on', on);
      document.getElementById('game-screen').classList.toggle('topdown', on);
    });
  }

  showScreen('home-screen');
  resizeCanvas();
  requestAnimationFrame(frame);
}

// Anything laid out in CSS pixels has to be re-placed when the view changes.
function onViewResize() {
  updateProjection();
  if (typeof positionFocusButton === 'function') positionFocusButton();
}

// Re-derive anything that depends on a tuning value changing live.
function onTuningChanged(key) {
  if (key.startsWith('proj') || key.startsWith('cam')) {
    updateProjection();
    if (typeof positionFocusButton === 'function') positionFocusButton();
  }
  if (key === 'rockRadiusScale' && typeof onRockSizeChanged === 'function') onRockSizeChanged();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
