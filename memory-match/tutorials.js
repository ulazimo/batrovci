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


// ============================================================
// TUTORIAL / FTUE ENGINE  (curated, data-driven)
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
//
// A tutorial is an ordered list of STEPS. Two kinds:
//   { type:'info',    text, highlight?, onEnter? }   → dark overlay + bubble + "Next"
//   { type:'tapCard', card, text, hand?, advanceOnResolve?, nextDelay?, onEnter? }
//                                                    → spotlight one card, gate input to it
// The engine rides the real game mechanics: it only GATES which card is tappable
// (tutorialAllowsCard), forces the chain-3 danger targets (tutorialForcedDanger),
// and listens for turn resolution (tutorialOnTurnResolved). It never fakes a flip.
// ============================================================

// ---- Engine state ----
let tutRunning = false;         // a level tutorial script is currently running
let tutScript = null;           // the active step array
let tutIndex = -1;              // current step index
let tutAllowedCard = null;      // the only board index tappable right now (null = none)
let tutAwaitingResolve = false; // waiting for finishTurn before advancing
let tutForcedDangerTargets = null; // indices applyChainColorHint must mark (tutorial override)
let ftueLevelPending = false;   // Play was tapped for the FTUE → start the script once the board is ready
let homeSpotlightActive = false;
let _spot = null;               // current spotlight params, kept for re-layout on resize

// ---- "Seen" flags: ALL tutorials record completion under progress.tutorialsSeen,
// keyed by id, so "Reset Progress" clears the whole object and every guided tutorial
// (this one and any future one) replays without touching the reset code. ----
function hasSeenTutorial(id) { return !!(progress.tutorialsSeen && progress.tutorialsSeen[id]); }
function markTutorialSeen(id) { (progress.tutorialsSeen || (progress.tutorialsSeen = {}))[id] = true; saveProgress(); }
function resetTutorialFlags() { progress.tutorialsSeen = {}; }

// ---- Gates / predicates read by the engine files ----
function shouldRunFtue() { return !hasSeenTutorial('ftue') && currentLevelIndex === 0; }
function isTutorialActive() { return tutRunning; }
function tutorialAllowsCard(index) { return !tutRunning || tutAllowedCard === index; }
function tutorialForcedDanger() { return tutRunning ? tutForcedDangerTargets : null; }
function setForcedDanger(indices) { tutForcedDangerTargets = indices ? [...indices] : null; }

// ---- HOME: spotlight the Play button ----
function maybeStartHomeFTUE() {
  if (!shouldRunFtue()) return;
  const up = document.getElementById('username-prompt');
  if (up && up.classList.contains('active')) return;   // wait until the username prompt is done
  const hs = document.getElementById('home-screen');
  if (!hs || !hs.classList.contains('active')) return; // only from the home screen
  startHomeSpotlight();
}

function startHomeSpotlight() {
  if (homeSpotlightActive) return;
  const btn = document.querySelector('.room-play-btn');
  if (!btn) return;
  homeSpotlightActive = true;
  showSpotlight({ target: btn, text: 'Welcome! 👋 Tap <b>PLAY</b> to start your first level.', hand: true });
}

// Called from playFromHome the instant Play is tapped during the FTUE.
function endHomeSpotlight() {
  if (!homeSpotlightActive) return;
  homeSpotlightActive = false;
  hideSpotlight();
}

// Play → skip the pre-level prep screen and drop straight into the guided board.
function beginFtueLevel() {
  ftueLevelPending = true;
  initLevelConfig();
  startGame();
}

// ---- LEVEL: the guided script starts once the opening board reveal finishes ----
function tutorialOnBoardReady() {
  if (!ftueLevelPending) return;
  ftueLevelPending = false;
  startLevelTutorial(LEVEL1_FTUE_STEPS);
}

function startLevelTutorial(steps) {
  tutRunning = true;
  tutScript = steps;
  tutIndex = -1;
  tutAllowedCard = null;
  tutAwaitingResolve = false;
  tutForcedDangerTargets = null;
  advanceTutorial();
}

function advanceTutorial() {
  tutIndex++;
  renderTutorialStep();
}

function renderTutorialStep() {
  const step = tutScript && tutScript[tutIndex];
  if (!step) { endTutorial(); return; }
  if (step.onEnter) step.onEnter();
  if (step.type === 'info') {
    tutAllowedCard = null;
    const target = step.highlight ? resolveHighlight(step.highlight) : null;
    showSpotlight({ target, text: step.text, hand: false, showNext: true });
  } else if (step.type === 'tapCard') {
    tutAllowedCard = step.card;
    const el = (typeof getCardEl === 'function') ? getCardEl(step.card) : null;
    // Cut the hole around the WHOLE board so the other cards stay lit (only the
    // surrounding UI dims); the ring + hand pick out the one card to tap.
    showSpotlight({ target: el, holeTarget: boardEl, text: step.text || '', hand: step.hand !== false });
  }
}

// Called from onCardClick the moment a *permitted* scripted card is tapped
// (before the flip is processed). Sets up how the step advances.
function tutorialOnCardTap(index) {
  if (!tutRunning) return;
  const step = tutScript[tutIndex];
  if (!step || step.type !== 'tapCard' || step.card !== index) return;
  tutAllowedCard = null; // consume — no double taps until the next step arms one
  if (step.advanceOnResolve) {
    // Turn-ending tap: drop the overlay so the resolve animation plays unobstructed,
    // then the finishTurn hook advances us.
    tutAwaitingResolve = true;
    hideSpotlight();
  } else {
    // Chain-building tap: keep the backdrop, just retire the "tap here" cue, then slide
    // the spotlight to the next card after a beat so the flip reads.
    hideSpotCue();
    setTimeout(advanceTutorial, step.nextDelay || 320);
  }
}

// Called at the end of finishTurn (every resolved turn) and from levelWon.
function tutorialOnTurnResolved() {
  if (!tutRunning || !tutAwaitingResolve) return;
  tutAwaitingResolve = false;
  advanceTutorial();
}

function endTutorial() {
  tutRunning = false;
  tutScript = null;
  tutIndex = -1;
  tutAllowedCard = null;
  tutAwaitingResolve = false;
  tutForcedDangerTargets = null;
  hideSpotlight();
  if (!hasSeenTutorial('ftue')) markTutorialSeen('ftue');
}

// Dev helper: replay every tutorial from scratch (call from console, then reload).
function resetTutorial() {
  resetTutorialFlags();
  saveProgress();
}

// ============================================================
// SPOTLIGHT OVERLAY — one dark backdrop with a rectangular hole (clip-path),
// a highlight ring, a bouncing hand, and a speech bubble. Everything outside
// the hole is dimmed AND blocks input; the hole passes clicks through.
// ============================================================
function ensureFtueLayer() {
  let layer = document.getElementById('ftue-layer');
  if (layer) return layer;
  layer = document.createElement('div');
  layer.id = 'ftue-layer';
  layer.innerHTML = `
    <div id="ftue-backdrop"></div>
    <div id="ftue-ring"></div>
    <div id="ftue-hand">👆</div>
    <div id="ftue-bubble"><div id="ftue-bubble-text"></div><button id="ftue-next" type="button">Got it →</button></div>`;
  document.body.appendChild(layer);
  // Tapping the dimmed area advances info steps (never card steps).
  layer.querySelector('#ftue-backdrop').addEventListener('click', () => {
    const step = tutScript && tutScript[tutIndex];
    if (homeSpotlightActive) return;                 // home: only Play advances
    if (step && step.type === 'info') advanceTutorial();
  });
  layer.querySelector('#ftue-next').addEventListener('click', (e) => {
    e.stopPropagation();
    const step = tutScript && tutScript[tutIndex];
    if (step && step.type === 'info') advanceTutorial();
  });
  return layer;
}

function showSpotlight(params) {
  _spot = params;
  const layer = ensureFtueLayer();
  layer.style.display = 'block';
  const bubble = layer.querySelector('#ftue-bubble');
  const hasText = !!(params.text && params.text.trim());
  bubble.style.display = hasText ? 'block' : 'none'; // plain tap steps show only the ring + hand
  layer.querySelector('#ftue-bubble-text').innerHTML = params.text || '';
  layer.querySelector('#ftue-next').style.display = params.showNext ? 'inline-block' : 'none';
  layoutSpotlight();
  if (hasText) { bubble.classList.remove('ftue-pop'); void bubble.offsetWidth; bubble.classList.add('ftue-pop'); }
}

// Retire just the "tap here" cue (hand + bubble + ring) but keep the backdrop hole
// steady while a just-flipped card animates, before the next step slides in.
function hideSpotCue() {
  const layer = document.getElementById('ftue-layer');
  if (!layer) return;
  layer.querySelector('#ftue-hand').style.display = 'none';
  layer.querySelector('#ftue-bubble').style.display = 'none';
}

function hideSpotlight() {
  _spot = null;
  const layer = document.getElementById('ftue-layer');
  if (layer) layer.style.display = 'none';
}

function resolveHighlight(sel) {
  if (typeof sel === 'number') return (typeof getCardEl === 'function') ? getCardEl(sel) : null;
  return document.querySelector(sel);
}

function layoutSpotlight() {
  const layer = document.getElementById('ftue-layer');
  if (!layer || !_spot) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const backdrop = layer.querySelector('#ftue-backdrop');
  const ring = layer.querySelector('#ftue-ring');
  const hand = layer.querySelector('#ftue-hand');
  const bubble = layer.querySelector('#ftue-bubble');
  const hasText = bubble.style.display !== 'none';

  // The HOLE (dims + blocks everything outside it) can be a different element than
  // the FOCUS (ring/hand/bubble). For a card tap the hole is the whole board — so the
  // board stays lit — while the ring picks out the single card.
  const holeEl = _spot.holeTarget || _spot.target;
  const holeRect = (holeEl && holeEl.getBoundingClientRect) ? holeEl.getBoundingClientRect() : null;
  const focus = _spot.target;
  const focusRect = (focus && focus.getBoundingClientRect) ? focus.getBoundingClientRect() : null;

  if (holeRect && holeRect.width > 0) {
    const hp = 8;
    const x1 = Math.max(0, holeRect.left - hp), y1 = Math.max(0, holeRect.top - hp);
    const x2 = Math.min(vw, holeRect.right + hp), y2 = Math.min(vh, holeRect.bottom + hp);
    backdrop.style.clipPath =
      `polygon(0px 0px, 0px ${vh}px, ${x1}px ${vh}px, ${x1}px ${y1}px, ${x2}px ${y1}px, ` +
      `${x2}px ${y2}px, ${x1}px ${y2}px, ${x1}px ${vh}px, ${vw}px ${vh}px, ${vw}px 0px)`;
  } else {
    backdrop.style.clipPath = 'none';
  }

  if (focusRect && focusRect.width > 0) {
    const p = 6;
    const rx1 = Math.max(0, focusRect.left - p), ry1 = Math.max(0, focusRect.top - p);
    const rx2 = Math.min(vw, focusRect.right + p), ry2 = Math.min(vh, focusRect.bottom + p);
    ring.style.display = 'block';
    ring.style.left = rx1 + 'px'; ring.style.top = ry1 + 'px';
    ring.style.width = (rx2 - rx1) + 'px'; ring.style.height = (ry2 - ry1) + 'px';

    const cx = (focusRect.left + focusRect.right) / 2;
    const below = (vh - focusRect.bottom) > 150;
    if (_spot.hand) {
      hand.style.display = 'block';
      hand.textContent = below ? '👆' : '👇';
      hand.style.left = (cx - 18) + 'px';
      hand.style.top = (below ? focusRect.bottom + 4 : focusRect.top - 46) + 'px';
    } else hand.style.display = 'none';

    if (hasText) {
      const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
      const bubbleBelow = (vh - focusRect.bottom) > (bh + 90);
      bubble.style.top = (bubbleBelow ? focusRect.bottom + (_spot.hand ? 46 : 16)
                                      : focusRect.top - bh - (_spot.hand ? 46 : 16)) + 'px';
      bubble.style.left = Math.max(10, Math.min(vw - bw - 10, cx - bw / 2)) + 'px';
    }
  } else {
    ring.style.display = 'none';
    hand.style.display = 'none';
    if (hasText) {
      const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
      bubble.style.left = Math.max(10, (vw - bw) / 2) + 'px';
      bubble.style.top = Math.max(20, vh * 0.32 - bh / 2) + 'px';
    }
  }
}

window.addEventListener('resize', () => { if (_spot) layoutSpotlight(); });

// ============================================================
// LEVEL 1 — First-Time User Experience script.
// Runs on the authored board:
//   R R B B / B G R R / B G G B / B G G B   (red=0,1,6,7  green=5,9,10,13,14  blue=rest)
// advanceOnResolve marks the tap that ENDS a turn (mismatch or colour-clear); every
// other tap just builds the chain. Danger is forced onto 4,5,8 at the chain-of-3.
// ============================================================
const LEVEL1_FTUE_STEPS = [
  { type: 'info',    text: "🧠 It's about playing a memory game and making matches. Let's show you how!" },
  { type: 'tapCard', card: 0 },
  { type: 'tapCard', card: 1 },
  { type: 'info',    text: 'There are more than 2 of each color! 🎨 Let\'s find 2 more.' },
  { type: 'tapCard', card: 6, onEnter: () => setForcedDanger([4, 5, 8]) },
  { type: 'info',    text: 'By creating longer combos, you\'ll get more rewards 🎁 that help you beat the levels.', highlight: '#chain-indicator' },
  { type: 'info',    text: '⚠️ The Danger cards don\'t contain your color. Let\'s try to guess where the next and final Red card is.', highlight: '#board' },
  { type: 'tapCard', card: 7, advanceOnResolve: true },
  { type: 'info',    text: '👀 I will always show you what\'s under the Danger cards. You just have to Chain 3 cards!' },
  { type: 'tapCard', card: 5 },
  { type: 'tapCard', card: 9 },
  { type: 'tapCard', card: 4, advanceOnResolve: true },
  { type: 'info',    text: 'Whenever you Chain at least 2 Cards, they will be collected. ✅' },
  { type: 'tapCard', card: 12 },
  { type: 'tapCard', card: 13, advanceOnResolve: true },
  { type: 'info',    text: 'We did not manage to make a Chain 😔' },
  { type: 'tapCard', card: 12 },
  { type: 'tapCard', card: 4 },
  { type: 'tapCard', card: 10, advanceOnResolve: true },
  { type: 'tapCard', card: 11 },
  { type: 'tapCard', card: 8 },
  { type: 'tapCard', card: 14, advanceOnResolve: true },
  { type: 'info',    text: 'Oh, now I think we can connect 3 Green Cards if we try to remember! 🟢', highlight: '#board' },
  { type: 'tapCard', card: 13 },
  { type: 'tapCard', card: 14 },
  { type: 'tapCard', card: 10, advanceOnResolve: true },
  { type: 'tapCard', card: 2 },
  { type: 'tapCard', card: 3 },
  { type: 'tapCard', card: 15, advanceOnResolve: true },
];
