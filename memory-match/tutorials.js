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
let tutCurrentId = null;        // seen-flag id of the running tutorial
let tutAllowedCard = null;      // the only board index tappable right now (null = none)
let tutAllowedBooster = null;   // the only power-up usable right now (null = none)
let tutBombTarget = null;       // a guided bomb may only drop on this index (null = any)
let tutAwaitingResolve = false; // waiting for finishTurn before advancing
let tutForcedDangerTargets = null; // indices applyChainColorHint must mark (tutorial override)
let tutForcedReveal = null;     // indices random3 / +1-color must reveal (tutorial override)
let tutSuppressAutoResolve = false; // block colour-clear auto-resolve so a scripted chain waits for the guided bank
let tutAllowRecall = false;     // the Recall (🔄) button is tappable only while a useRecall step is active
let tutPending = null;          // {id, steps} to start once the opening board reveal finishes
let tutHoldForWin = false;      // a useBomb step wants to hold the level-win until its closing box
let tutDeferredWin = null;      // levelWon's finish callback, run after the closing box is dismissed
let homeSpotlightActive = false;
let _spot = null;               // current spotlight params, kept for re-layout on resize

// ---- "Seen" flags: ALL tutorials record completion under progress.tutorialsSeen,
// keyed by id, so "Reset Progress" clears the whole object and every guided tutorial
// (this one and any future one) replays without touching the reset code. ----
function hasSeenTutorial(id) { return !!(progress.tutorialsSeen && progress.tutorialsSeen[id]); }
function markTutorialSeen(id) { (progress.tutorialsSeen || (progress.tutorialsSeen = {}))[id] = true; saveProgress(); }
function resetTutorialFlags() { progress.tutorialsSeen = {}; }

// ---- Registry: one entry per level INDEX → {id, steps}. tutorialForLevel returns the
// entry when that level has a tutorial the player hasn't seen. (LEVEL_TUTORIALS is
// declared with the scripts near the bottom of this file.) ----
function tutorialForLevel(idx) {
  // Hall Walkthrough drives this page in an iframe with ?mmSandbox=1 to step
  // through halls; scripted tutorials (incl. the home FTUE spotlight, which
  // is derived from this) would only get in the way there. Real play never
  // sets mmSandbox, so this never affects the actual game.
  if (typeof isMmSandbox === 'function' && isMmSandbox()) return null;
  const e = (typeof LEVEL_TUTORIALS !== 'undefined') ? LEVEL_TUTORIALS[idx] : null;
  return (e && !hasSeenTutorial(e.id)) ? e : null;
}
function currentTutStep() { return tutScript ? tutScript[tutIndex] : null; }

// ---- Gates / predicates read by the engine files ----
function isTutorialActive() { return tutRunning; }
function tutorialAllowsCard(index) { return !tutRunning || tutAllowedCard === index; }
function tutorialAllowsBooster(id) { return !tutRunning || tutAllowedBooster === id; }
function tutorialAllowsBombDrop(idx) { return !tutRunning || tutBombTarget == null || tutBombTarget === idx; }
function tutorialAllowsLongPress(i) { const s = currentTutStep(); return !tutRunning || !!(s && s.type === 'longPressPeek' && s.card === i); }
function tutorialForcedDanger() { return tutRunning ? tutForcedDangerTargets : null; }
function setForcedDanger(indices) { tutForcedDangerTargets = indices ? [...indices] : null; }
function tutorialForcedReveal() { return tutRunning ? tutForcedReveal : null; }
function setForcedReveal(indices) { tutForcedReveal = indices ? [...indices] : null; }
// Colour-clear auto-resolve (tryAutoResolveColor) fires the instant every card of the chain
// colour is open — which would collect a scripted 2-chain before the guided "tap a mismatch to
// bank" step. A tutorial can suppress it so the player performs the bank themselves.
function tutorialSuppressAutoResolve() { return tutRunning && tutSuppressAutoResolve; }
function setSuppressAutoResolve(v) { tutSuppressAutoResolve = !!v; }
// Recall gate: while a tutorial runs, the Recall button only works during a `useRecall` step.
function tutorialAllowsRecall() { return !tutRunning || tutAllowRecall; }
// Force the level-start Win Streak reveal to show at least N cards for a tutorial that teaches
// off it (Level 16's Recall). Read by revealEntireBoard from the PENDING entry (it runs before
// the script starts); a real streak that reveals more still wins (Math.max in the caller).
function tutorialForcedStreakRevealCount() { return (tutPending && tutPending.forceStreakReveal) || 0; }
// Ensure the player can afford a tutorial's scripted Recall spends (top up only if short).
function tutorialEnsureCoins(min) {
  if ((progress.coins || 0) < min) { progress.coins = min; saveProgress(); if (typeof updateCoinDisplay === 'function') updateCoinDisplay(); }
}
// Level-win hold: a useBomb step with holdForWin lets levelWon pause its finish so the
// player sees the reward, then the tutorial's closing box shows before returning home.
function tutorialHoldForWin() { return tutRunning && tutHoldForWin; }
function tutorialDeferWin(finishCb) {
  tutDeferredWin = finishCb;
  tutHoldForWin = false; // consumed
  // The reward is flying into the tray right now — let it land, THEN show the closing box.
  setTimeout(() => { if (tutRunning) advanceTutorial(); }, 1100);
}
// Gift power-up charge(s) into the tray mid-level (uncapped — also used to teach over-cap).
function tutorialGift(id, n) {
  boosterCounts[id] = (boosterCounts[id] || 0) + (n || 1);
  if (typeof saveBoosterCounts === 'function') saveBoosterCounts();
  if (typeof updateBoosterUI === 'function') updateBoosterUI();
}
function boosterButtonEl(id) { return boosterBar ? boosterBar.querySelector(`.booster-btn[data-booster="${id}"]`) : null; }

// ---- HOME: spotlight the Play button (first-launch FTUE only) ----
function shouldRunFtue() { return currentLevelIndex === 0 && !!tutorialForLevel(0); }
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

// ---- HOME: step-driven tutorials that run on the home screen (not tied to a
// level board). These reuse the same step engine as level tutorials — an `info`
// step only needs its `highlight` selector, no board. showHome() schedules a
// check after its arrival animations (coin fly / item reveal) settle. ----
let _homeTutTimer = null;
function scheduleHomeTutorialCheck() {
  clearTimeout(_homeTutTimer);
  _homeTutTimer = setTimeout(maybeStartHomeWinstreakTutorial, 1700);
}

// First time the player lands on home with the Win Streak just unlocked (next
// level's id === the journey's winStreakStartLevel), explain the meter. Gated by
// its own seen-flag so it shows exactly once.
function maybeStartHomeWinstreakTutorial() {
  if (typeof isMmSandbox === 'function' && isMmSandbox()) return;
  if (tutRunning || homeSpotlightActive) return;
  if (hasSeenTutorial('winstreakHome')) return;
  if (typeof isWinStreakActive !== 'function' || !isWinStreakActive()) return;
  if (LEVELS[currentLevelIndex]?.id !== getWinStreakStartLevel()) return;
  const hs = document.getElementById('home-screen');
  if (!hs || !hs.classList.contains('active')) return;
  const bar = document.getElementById('home-streak');
  if (!bar || bar.style.visibility === 'hidden') return;
  startLevelTutorial({ id: 'winstreakHome', steps: WINSTREAK_HOME_STEPS });
}

// Play → skip the pre-level prep screen and drop straight into the guided board.
function beginTutorialLevel(entry) {
  tutPending = entry;
  initLevelConfig();
  startGame();
}

// ---- LEVEL: the guided script starts once the opening board reveal finishes ----
function tutorialOnBoardReady() {
  if (!tutPending) return;
  const e = tutPending; tutPending = null;
  startLevelTutorial(e);
}

function startLevelTutorial(entry) {
  tutRunning = true;
  tutScript = entry.steps;
  tutCurrentId = entry.id;
  tutIndex = -1;
  tutAllowedCard = null; tutAllowedBooster = null; tutBombTarget = null;
  tutAwaitingResolve = false; tutForcedDangerTargets = null; tutForcedReveal = null;
  tutHoldForWin = false; tutDeferredWin = null; tutSuppressAutoResolve = false; tutAllowRecall = false;
  advanceTutorial();
}

function advanceTutorial() {
  tutIndex++;
  renderTutorialStep();
}

function renderTutorialStep() {
  const step = tutScript && tutScript[tutIndex];
  if (!step) { endTutorial(); return; }
  // Clear all per-step allowances; the step re-arms exactly what it needs.
  tutAllowedCard = null; tutAllowedBooster = null; tutBombTarget = null; tutForcedReveal = null; tutAllowRecall = false;
  if (step.onEnter) step.onEnter();
  if (step.type === 'info') {
    if (Array.isArray(step.highlight)) {
      // Ring a CLUSTER of tiles (one box round their union); keep the whole board lit.
      showSpotlight({ focusTiles: step.highlight, holeTarget: boardEl, text: step.text, hand: false, showNext: true });
    } else {
      const target = step.highlight ? resolveHighlight(step.highlight) : null;
      showSpotlight({ target, text: step.text, hand: false, showNext: true });
    }
  } else if (step.type === 'tapCard' || step.type === 'longPressPeek') {
    // Cut the hole around the WHOLE board so the other cards stay lit (only the
    // surrounding UI dims); the ring + hand pick out the one card to tap/hold.
    tutAllowedCard = step.card;
    showSpotlight({ target: getCardEl(step.card), holeTarget: boardEl, text: step.text || '', hand: step.hand !== false });
  } else if (step.type === 'useBooster' || step.type === 'useBomb') {
    // Spotlight the power-up button; gate the tray to just this one.
    tutAllowedBooster = step.booster;
    if (step.type === 'useBomb') tutBombTarget = step.target;
    showSpotlight({ target: boosterButtonEl(step.booster), text: step.text || '', hand: true });
  } else if (step.type === 'revealBoard') {
    // Demo the Win Streak effect: drop the overlay so the board is fully lit, flash
    // EVERY eligible card face-up, hold, hide, then advance. (Skippable via a tap.)
    hideSpotlight();
    tutorialFlashWholeBoard(step.holdMs, () => { if (tutRunning) advanceTutorial(); });
  } else if (step.type === 'useRecall') {
    // Spotlight the Recall (🔄) button and gate input to it; advancing is driven by
    // tutorialOnRecallUsed once the re-reveal plays.
    tutAllowRecall = true;
    if (typeof updateRecallButton === 'function') updateRecallButton();
    showSpotlight({ target: document.getElementById('recall-btn'), text: step.text || '', hand: true });
  }
}

// Flash every flippable card face-up together, hold, then hide — the same flash-and-hide
// the win-streak pre-reveal uses (vfx.js revealEntireBoard), but for the WHOLE board.
// Used by the Level 11 tutorial to show "what a Level 10 Win Streak can do".
function tutorialFlashWholeBoard(holdMs, cb) {
  const list = board.map((_, i) => i).filter(i => board[i] && !board[i].locked && !board[i].special);
  if (!list.length) { if (cb) cb(); return; }
  inputLocked = true;
  const staggerMs = 45;
  const steps = list.map((idx, i) => ({ delay: i * staggerMs, fn: () => {
    const c = board[idx]; if (!c) return;
    c.flipped = true;
    const el = getCardEl(idx); if (el) el.classList.add('flipped');
  } }));
  runSkippableReveal(steps, holdMs || 2600, () => {
    list.forEach(idx => {
      const c = board[idx]; if (!c) return;
      c.flipped = false;
      const el = getCardEl(idx); if (el) el.classList.remove('flipped');
    });
    inputLocked = false;
    if (cb) cb();
  });
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

// ---- Power-up step hooks (called from boosters.js / bomb-aim.js / board.js) ----

// A booster button was activated. For a needsTap booster (peek) with a target card,
// move the spotlight onto that card; for an immediate booster (random3/+1-color), the
// reveal plays and we advance after a beat.
function tutorialOnBoosterActivated(id) {
  if (!tutRunning) return;
  const step = currentTutStep();
  if (!step || step.type !== 'useBooster' || step.booster !== id) return;
  if (step.card != null) {
    tutAllowedCard = step.card;
    showSpotlight({ target: getCardEl(step.card), holeTarget: boardEl, text: step.cardText || '', hand: true });
  } else {
    // immediate booster (random3 / +1-color): light the whole board so the reveal is visible.
    showSpotlight({ target: null, holeTarget: boardEl, text: '', hand: false });
    setTimeout(advanceTutorial, step.nextDelay || 900);
  }
}

// The Recall button was tapped during a useRecall step (recallCards has spent the coins and
// flipped the remembered cards up). Light the whole board so the re-reveal is visible, then
// advance once it has played and hidden (recall's hold is ~1800ms).
function tutorialOnRecallUsed() {
  if (!tutRunning) return;
  const step = currentTutStep();
  if (!step || step.type !== 'useRecall') return;
  tutAllowRecall = false; // consume
  showSpotlight({ target: null, holeTarget: boardEl, text: '', hand: false });
  setTimeout(() => { if (tutRunning) advanceTutorial(); }, step.nextDelay || 2100);
}

// A needsTap booster finished on its target card (executeBoosterTap → executePeek…).
function tutorialOnBoosterUsed(id, index) {
  if (!tutRunning) return;
  const step = currentTutStep();
  if (!step || step.type !== 'useBooster' || step.booster !== id) return;
  hideSpotCue();
  setTimeout(advanceTutorial, step.nextDelay || 800);
}

// Long-press peek fired on a card.
function tutorialOnLongPressPeek(index) {
  if (!tutRunning) return;
  const step = currentTutStep();
  if (!step || step.type !== 'longPressPeek' || step.card !== index) return;
  tutAllowedCard = null;
  hideSpotCue();
  setTimeout(advanceTutorial, step.nextDelay || 800);
}

// A bomb drag started → switch a useBomb step's spotlight from the button to the target tile.
function tutorialOnBombAimStart() {
  if (!tutRunning) return;
  const step = currentTutStep();
  if (!step || step.type !== 'useBomb') return;
  showSpotlight({ target: getCardEl(step.target), holeTarget: boardEl, text: step.dropText || '', hand: true });
}

// The bomb was dropped (on the gated target).
function tutorialOnBombPlaced(idx) {
  if (!tutRunning) return;
  const step = currentTutStep();
  if (!step || step.type !== 'useBomb') return;
  tutBombTarget = null; tutAllowedBooster = null;
  hideSpotlight();
  // If this bomb wins the level, don't advance on a timer — let levelWon() hold the win
  // and drive the closing box (via tutorialDeferWin) once the reward has flown in.
  if (step.holdForWin) { tutHoldForWin = true; return; }
  setTimeout(advanceTutorial, step.nextDelay || 900);
}

// The bomb drag was cancelled (released off-target) → re-arm the button spotlight to retry.
function tutorialOnBombAimCancel() {
  if (!tutRunning) return;
  const step = currentTutStep();
  if (!step || step.type !== 'useBomb') return;
  showSpotlight({ target: boosterButtonEl(step.booster), text: step.text || '', hand: true });
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
  tutAllowedCard = null; tutAllowedBooster = null; tutBombTarget = null;
  tutAwaitingResolve = false; tutForcedDangerTargets = null; tutForcedReveal = null;
  tutHoldForWin = false; tutSuppressAutoResolve = false; tutAllowRecall = false;
  hideSpotlight();
  if (tutCurrentId && !hasSeenTutorial(tutCurrentId)) markTutorialSeen(tutCurrentId);
  tutCurrentId = null;
  // If a win was held for a closing box, run its finish now (SFX/confetti → home).
  const finish = tutDeferredWin; tutDeferredWin = null;
  if (finish) finish();
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
  // The board can still be settling when a step first renders — fitBoard rescaling a tall
  // board, a booster-tray reflow from an onEnter gift, or late-loading badge art all move a
  // highlighted tile AFTER this initial layout. layoutSpotlight only re-runs on window resize,
  // which none of those fire, so re-run it a couple of beats later. Guarded so a superseded
  // spotlight never fights the current one.
  setTimeout(() => { if (_spot === params) layoutSpotlight(); }, 80);
  setTimeout(() => { if (_spot === params) layoutSpotlight(); }, 260);
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

// Combined bounding box of several board tiles — one ring can then wrap a cluster (e.g. the
// four stack tiles 5/6/9/10). Recomputed on every layout so it tracks a settling board.
function unionTileRect(indices) {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity, any = false;
  indices.forEach(i => {
    const el = getCardEl(i);
    if (!el) return;
    const rc = el.getBoundingClientRect();
    if (!rc.width) return;
    any = true;
    l = Math.min(l, rc.left); t = Math.min(t, rc.top);
    r = Math.max(r, rc.right); b = Math.max(b, rc.bottom);
  });
  return any ? { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t } : null;
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
  // FOCUS can be a single element (_spot.target) OR a set of board tiles (_spot.focusTiles):
  // several tiles get ONE ring around their combined bounding box (e.g. the 2×2 stack block).
  const focus = _spot.target;
  const focusRect = _spot.focusTiles ? unionTileRect(_spot.focusTiles)
    : (focus && focus.getBoundingClientRect) ? focus.getBoundingClientRect() : null;

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
// fitBoard() sizes #board to fit the viewport AFTER a step can already be on screen (a tall
// board animates to its fitted size), which fires no window resize — so a ring on a board tile
// would sit at the tile's pre-settle position. Re-layout the active spotlight whenever the
// board's box changes, so it tracks the tile to rest. (Cheap; only acts while a spotlight is up.)
if (typeof ResizeObserver !== 'undefined' && typeof boardEl !== 'undefined' && boardEl) {
  new ResizeObserver(() => { if (_spot) layoutSpotlight(); }).observe(boardEl);
}

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
  { type: 'tapCard', card: 6, onEnter: () => setForcedDanger([5, 8, 9]) },
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

// ============================================================
// LEVEL 2 — teaches Peek + Baby Bomb.
// Authored board (index:color):
//   B G R R / G R G R / G G B B / G G B R
//   red=2,3,5,7,15  green=1,4,6,8,9,12,13  blue=0,10,11,14
// Peek came from the level-1 reward (peek×3); step 1 tops it up if short.
// ============================================================
const LEVEL2_STEPS = [
  { type: 'info', text: "🎁 Let's use the Power-Up you just received — Peek!", highlight: '.booster-btn[data-booster="peek"]',
    onEnter: () => { const have = boosterCounts.peek || 0; if (have < 2) tutorialGift('peek', 2 - have); } },
  { type: 'tapCard', card: 15 },
  { type: 'tapCard', card: 5 },   // red chain: 15, 5
  { type: 'info', text: '👀 Now let\'s use Peek to check the next card, but keep our Chain safe.' },
  { type: 'useBooster', booster: 'peek', card: 1, cardText: 'Tap this card to peek it.' },
  { type: 'info', text: 'It was Green, but we kept our Red chain — it didn\'t fail!' },
  { type: 'info', text: '🤏 Let\'s try once more — you can quickly use Peek by holding on a card!' },
  { type: 'longPressPeek', card: 7, text: 'Press and hold this card.', onEnter: () => setForcedDanger([4, 8, 12]) },
  { type: 'info', text: 'Red was added to our chain! ⚠️', highlight: '#board' },
  { type: 'tapCard', card: 13, advanceOnResolve: true },   // mismatch banks red 15,5,7
  // Green chain of 5 → Baby Bomb reward
  { type: 'tapCard', card: 1 },
  { type: 'tapCard', card: 4 },
  { type: 'tapCard', card: 8 , onEnter: () => setForcedDanger([0, 10, 11]) },
  { type: 'tapCard', card: 12 },
  { type: 'tapCard', card: 13 },
  { type: 'tapCard', card: 0, advanceOnResolve: true },    // mismatch banks 5 greens → 💣
  { type: 'info', text: '💣 We got a Small Bomb!' },
  { type: 'useBomb', booster: 'babybomb', target: 10,
    text: 'Let\'s drop it on the remaining cards to collect them! Press and drag the 💣.',
    dropText: 'Drop it right here!' },
  { type: 'info', text: 'If you make a bigger chain, you can get a bigger BOMB! 💥' },
  { type: 'tapCard', card: 2 },
  { type: 'tapCard', card: 3, advanceOnResolve: true },    // last reds → colour clear
  { type: 'info', text: '✨ When only one card of a color remains, you can just collect it — no match needed!' },
  { type: 'tapCard', card: 0, advanceOnResolve: true },    // last blue → lone collect → win
];

// ============================================================
// LEVEL 4 — teaches Random3.
// Authored board (4×5): green pinned at 6,8,14,16,17 (colorCount 3, colorCounts green:7 → 2
// more greens auto-placed elsewhere). The chain uses 5 greens: 6 + (8,14) + (16,17) = Chain 5
// → Baby Bomb. Cards 15 & 2 must stay NON-green so they flash without joining — step 1
// re-colors them if the auto-fill made them green (safety). Random3s are forced onto the
// exact scripted cards. Tutorial ENDS mid-level ("Go try your luck") with the chain active.
// ============================================================
const LEVEL4_STEPS = [
  { type: 'useBooster', booster: 'random3', text: '🎲 Tap Random3 to reveal a few cards!',
    onEnter: () => {
      const r = boosterCounts.random3 || 0; if (r < 3) tutorialGift('random3', 3 - r);
      [15, 2].forEach(i => { if (board[i] && board[i].color === 'green') board[i].color = 'blue'; });
    } },
  { type: 'info', text: 'See — you can reveal a few random Cards! But there\'s more… 🔎' },
  { type: 'tapCard', card: 6 },
  { type: 'info', text: '🍀 Now, let\'s try our luck at finding more Green Cards!' },
  { type: 'useBooster', booster: 'random3', nextDelay: 1600, onEnter: () => setForcedReveal([8, 14, 15]) },
  { type: 'info', text: 'See — we got to Chain 3! 🔗', highlight: '#chain-indicator' },
  { type: 'info', text: 'Once more! 🎲' },
  { type: 'useBooster', booster: 'random3', nextDelay: 1600, onEnter: () => setForcedReveal([2, 16, 17]) },
  { type: 'info', text: '💣 You will now get a small Bomb! Go try your luck!' },
];

// ============================================================
// LEVEL 6 — teaches using a Bomb to EXTEND a chain (bombChainStay).
// Board (5×10, rest disabled): top Green cross 2,6,7,8,12 (center 7); Red row 20-24;
// Green row 25-29; bottom Red cross 37,41,42,43,47 (center 42). colorCount 2 (red/green).
// A Baby Bomb's cross blast lands exactly on each cross.
// Flow: chain the green row → tap 42 (red) to bank → Baby Bomb → bomb the green cross
// (no chain, just collects) → gift a bomb → chain the red row → bomb the red cross WITH
// the chain active → the red cross joins the chain (10 reds) → colour-clear → Big Bomb + win.
// ============================================================
const LEVEL6_STEPS = [
  { type: 'tapCard', card: 25 },
  { type: 'tapCard', card: 26 },
  { type: 'tapCard', card: 27, onEnter: () => setForcedDanger([37, 41, 43]) },
  { type: 'tapCard', card: 28 },
  { type: 'tapCard', card: 29 },
  { type: 'tapCard', card: 42, advanceOnResolve: true },   // red mismatch → banks 5 greens → Baby Bomb
  { type: 'useBomb', booster: 'babybomb', target: 7, text: 'Drop your 💣 on the green cross!', dropText: 'Right here!' },
  { type: 'info', text: 'Good job! But you can use your Bomb to extend your chain and reap bigger Rewards! 💥',
    onEnter: () => tutorialGift('babybomb', 1) },
  { type: 'tapCard', card: 20 },
  { type: 'tapCard', card: 21 },
  { type: 'tapCard', card: 22 },
  { type: 'tapCard', card: 23 },
  { type: 'tapCard', card: 24 },
  { type: 'info', text: "Now, let's extend your chain! 🔗" },
  { type: 'useBomb', booster: 'babybomb', target: 42, dropText: 'Drop it on the red cross!', holdForWin: true },
  { type: 'info', text: 'And now you are rewarded with the Big Bomb! 💥💣' },
];

// ============================================================
// LEVEL 7 — teaches the Big Bomb (incl. exceeding its 1-slot cap).
// Board 5×5: reds pinned 0,1,2,3,4,5,9 (the 7-chain) + 12 (the Big Bomb target);
// colorCounts red:8. Card 7 is unauthored → a non-red mismatch. The player already
// holds a Big Bomb (from Level 6; step 1 tops up to 1 as a safety). The 7-chain earns
// another Big Bomb but it's capped at 1 — so the tutorial GIFTS the over-cap one (→ 2/1,
// "this one's on me"). Then the Big Bomb's 3×3 blast on card 12 collects 9 cards. Ends
// mid-level (like Level 4) — the player finishes the remaining cards.
// ============================================================
const LEVEL7_STEPS = [
  { type: 'tapCard', card: 5, onEnter: () => { if ((boosterCounts.bigbomb || 0) < 1) tutorialGift('bigbomb', 1); } },
  { type: 'tapCard', card: 0 },
  { type: 'tapCard', card: 1 },
  { type: 'tapCard', card: 2 },
  { type: 'tapCard', card: 3 },
  { type: 'tapCard', card: 4 },
  { type: 'tapCard', card: 9 },
  { type: 'tapCard', card: 7, advanceOnResolve: true },   // non-red mismatch → banks the 7-chain → Big Bomb (capped)
  { type: 'info', text: "Whoops, seems you already have a Big Bomb! You can only hold one. This one's on me. 😉",
    onEnter: () => tutorialGift('bigbomb', 1) },           // exceed the cap → 2/1
  { type: 'useBomb', booster: 'bigbomb', target: 12, text: "Now, let's drop it on the board!", dropText: 'Drop it here!' },
  { type: 'info', text: 'It will collect even more cards than the Small Bomb! 💥' },
];

// ============================================================
// LEVEL 10 — teaches +1 Color.
// Board 5×5: 10 blues pinned (1,3,5,9,15,19,20,21,23,24), colorCounts blue:10. Tap card 20
// (blue) to start a blue chain, then press +1 Color 9× — each reveals one hidden blue that
// joins the chain (→ chain of 10). The 9th press opens the last blue → colour-clear (climax
// + a bonus Big Bomb from the 10-chain). +1 Color naturally reveals the chain color, so no
// forcing is needed. Step 1 gifts a batch of +1 Color ("a bunch of Power-Ups"). Ends
// mid-level (blues cleared, other colors remain — player continues).
// ============================================================
const LEVEL10_STEPS = [
  { type: 'info', text: "Hey, I gave you a bunch of Power-Ups — let's see how to use them! 🎁",
    onEnter: () => { const have = boosterCounts.pluscolor || 0; if (have < 10) tutorialGift('pluscolor', 10 - have); } },
  { type: 'tapCard', card: 20 },
  { type: 'useBooster', booster: 'pluscolor', text: 'Now, to find more Blue colors! Tap +1 Color! 🔵', nextDelay: 850 },
  { type: 'useBooster', booster: 'pluscolor', text: 'Again! ⚡', nextDelay: 850 },
  { type: 'useBooster', booster: 'pluscolor', text: 'Nice — keep going! 😎', nextDelay: 850 },
  { type: 'useBooster', booster: 'pluscolor', text: 'Whoa, look at that chain grow! 🤩', nextDelay: 850 },
  { type: 'useBooster', booster: 'pluscolor', text: 'Amazing! 🔥', nextDelay: 850 },
  { type: 'useBooster', booster: 'pluscolor', text: 'Unstoppable! 💙', nextDelay: 850 },
  { type: 'useBooster', booster: 'pluscolor', text: 'Incredible! 🌟', nextDelay: 850 },
  { type: 'useBooster', booster: 'pluscolor', text: 'Almost there! ✨', nextDelay: 850 },
  { type: 'useBooster', booster: 'pluscolor', text: 'One more! 🎉', nextDelay: 2800 },
  { type: 'info', text: 'See how easy it can be! 🙌' },
];

// ============================================================
// WIN STREAK — a HOME-screen tutorial (id `winstreakHome`), shown the first time
// the player returns home after clearing Level 10 (Win Streak unlocks at Level 11).
// It highlights the win-streak meter and explains the level-start reveal. Then,
// entering Level 11, LEVEL11_STEPS demos the effect on the board.
// ============================================================
const WINSTREAK_HOME_STEPS = [
  { type: 'info', highlight: '#home-streak',
    text: "🔥 You unlocked the Win Streak! At the start of every Match, cards get revealed based on your Win Streak." },
  { type: 'info', highlight: '#home-streak',
    text: 'The higher your streak, the more cards you\'ll see — so do your best to keep it! 🏆' },
];

// ============================================================
// LEVEL 11 — demo the Win Streak reveal. Even though the streak is still at 0,
// the tutorial flashes the WHOLE board face-up once ("what a Level 10 streak can
// do"), then hands the level back to the player. Winning it naturally ticks the
// streak to 1 (isWinStreakActive() is true from Level 11 → endgame.js increments).
// ============================================================
const LEVEL11_STEPS = [
  { type: 'info', text: "You are at Streak 0, let me show you what a Level 10 Win Streak can do! 👀" },
  { type: 'revealBoard', holdMs: 3200 },
  { type: 'info', text: 'Memorize what you can — now clear the board! 💪' },
];

// ============================================================
// LEVEL 15 — teaches Back-of-card effects. The authored 5×7 board pins two GREEN
// cards carrying a `column` back-effect at (3,0)=15 and (3,4)=19, each sitting in a
// full RED column (col 0 = 0,5,10,15,20,25,30; col 4 = 4,9,14,19,24,29,34).
// Flow: explain → tap green 15 (its whole column lights white = the impact preview)
// → explain the white highlight → tap green 19 → tap a Red card to BANK the 2-green
// chain, which collects both greens and fires BOTH column reveals. Auto colour-clear
// is suppressed (only 2 greens exist, so it would otherwise snap shut on green 19)
// so the player performs the bank. Ends mid-level; the rest plays out normally.
// ============================================================
const LEVEL15_STEPS = [
  { type: 'info', highlight: 15,
    text: "Cards with Effects on their Back reveal a pattern of cards on the Board when you collect them! 🎴",
    onEnter: () => setSuppressAutoResolve(true) },
  { type: 'tapCard', card: 15 },
  { type: 'info', highlight: '#board',
    text: 'The white highlight shows which cards will be revealed when this chain is collected! ✨' },
  { type: 'tapCard', card: 19 },
  { type: 'tapCard', card: 20},
];

// ============================================================
// LEVEL 16 — teaches the Recall (🔄) power-up (unlocks at Level 16 = recallStartLevel).
// Two parts. PART 1: the level-start Win Streak reveal is force-shown (≥6 cards via the
// entry's forceStreakReveal, so there's always something to recall even at streak 0), then
// the player Recalls those cards. PART 2: they collect a Back-effect card (the center STAR
// at idx 12), whose 12-cell reveal flashes+hides, then Recall re-shows that pattern.
// Colours for the part-2 chain are forced in step 5's onEnter (card 1 & the star 12 → green,
// mismatch 3 → red; all outside the star pattern {2,6,7,8,10,11,13,14,16,17,18,22}) and the
// front faces re-skinned in place. Auto colour-clear is suppressed so the 2-green chain waits
// for the guided red bank. Recall costs 10 coins each use — step 1 tops the player up if short.
// The part-2 bank uses advanceOnResolve so PART 2 only starts AFTER the star reveal has hidden.
// ============================================================
const LEVEL16_STEPS = [
  // ---- PART 1: Recall the Win Streak reveal ----
  { type: 'info', highlight: '#recall-btn',
    text: 'You just received a new Power-Up — Recall! It helps you remember cards that were previously opened. 🔄',
    onEnter: () => tutorialEnsureCoins(20) },
  { type: 'info', highlight: '#recall-btn', text: 'But at a cost — just 10 coins! 🪙' },
  { type: 'useRecall', text: 'Tap Recall to see the Win Streak cards again!' },
  { type: 'info', text: 'It can help you at the start of the match to Recall the cards from the Win Streak reveal! ✨' },
  // ---- PART 2: Recall a Back-effect reveal ----
  { type: 'info', highlight: 12, text: "Now let's collect a card with a Back Effect again! ✴️",
    onEnter: () => {
      setSuppressAutoResolve(true);
      [[1, 'green'], [12, 'green'], [3, 'red']].forEach(([i, col]) => {
        if (!board[i]) return;
        board[i].color = col;
        const front = getCardEl(i) && getCardEl(i).querySelector('.card-front');
        if (front) { front.className = 'card-face card-front ' + col; front.innerHTML = `<img src="blocks/block_${col}_1.png" alt="${col}">`; }
      });
    } },
  { type: 'tapCard', card: 12 },
  { type: 'tapCard', card: 1 },
  { type: 'tapCard', card: 3, text: 'Now tap a card to collect the chain!', advanceOnResolve: true },
  { type: 'info', text: 'It can also reveal all of the cards that were revealed from the previous turn! 👀' },
  { type: 'useRecall', text: 'Tap Recall to see them again!' },
];

// ============================================================
// LEVEL 25 — teaches breaking LOCKS. The authored 5×5 has a locked center column:
// idx 7 (1,2, yellow), idx 12 (2,2, red), idx 17 (3,2, blue), each shown face-up under
// a 🔒 (revealLockedCards is on). idx 11 (2,1) is an authored red directly LEFT of the
// locked red 12. Step 1 forces idx 13 (2,3, RIGHT of 12) → red too and a bank card
// idx 10 (2,0) → green, so the two flanking reds (11, 13) chain around the lock. Banking
// the chain collects 11 & 13; breakAdjacentLocks then chips the lock between them (idx 12
// → unlocks). Auto colour-clear is suppressed so the player performs the bank. Only lock 12
// breaks here (locks 7 & 17 remain for normal play). Ends mid-level.
// ============================================================
const LEVEL25_STEPS = [
  { type: 'info', highlight: 12, text: "Let's break the locks of these tiles! 🔒",
    onEnter: () => {
      setSuppressAutoResolve(true);
      [[11, 'red'], [13, 'red'], [10, 'green']].forEach(([i, col]) => {
        if (!board[i]) return;
        board[i].color = col;
        const front = getCardEl(i) && getCardEl(i).querySelector('.card-front');
        if (front) { front.className = 'card-face card-front ' + col; front.innerHTML = `<img src="blocks/block_${col}_1.png" alt="${col}">`; }
      });
    } },
  { type: 'tapCard', card: 11 },
  { type: 'tapCard', card: 13 },
  { type: 'tapCard', card: 10, text: 'Now tap a card to collect the chain!', advanceOnResolve: true },
  { type: 'info', text: 'Whenever you collect a card next to a Locked tile, it breaks a lock! 🔓' },
];

// ============================================================
// LEVEL 28 — teaches using a BOMB to destroy locks you can't reach. The authored
// 5×9 board isolates a locked RED CROSS at the bottom (center idx32 (6,2); arms 27,
// 31, 33, 37) surrounded entirely by disabled cells — so no adjacent card can ever be
// collected to break them (unlike Level 25). A Baby Bomb's cross blast dropped on the
// center hits all 5 cross tiles at once → breakAdjacentLocks…no, detonateBombAt's
// `blastLocks` breaks one layer on every locked tile in the blast → all 5 unlock.
// Step 1 gifts a Baby Bomb if the player has none. useBomb targets idx32 (locked tiles
// are valid bomb drops). It's a "lock-only" blast (holds the unlocked reds face-up ~2s),
// so the closing step's nextDelay waits for that. Ends mid-level.
// ============================================================
const LEVEL28_STEPS = [
  { type: 'info', highlight: 32,
    text: "You can't get to these locked tiles, but you can use a bomb to destroy the Locks! 💣",
    onEnter: () => { if ((boosterCounts.babybomb || 0) < 1) tutorialGift('babybomb', 1); } },
  { type: 'useBomb', booster: 'babybomb', target: 32, nextDelay: 2400,
    text: 'Drag your Bomb onto the center of the cross! 💣', dropText: 'Drop it here!' },
  { type: 'info', text: 'The locks are destroyed — now you can collect those cards! 💥' },
];

// ============================================================
// LEVEL 36 — introduces MULTI-LOCKS. Authored 5×5 with four multi-locks on the edges:
// idx2 (0,2) & idx22 (4,2) need 2 breaks; idx10 (2,0) & idx14 (2,4) need 3. Each shows a
// counter badge under the 🔒. Per the spec this is a single heads-up popup (the player
// already learned lock-breaking at L25 and breaking-by-bomb at L28); it just points out a
// multi-lock (idx2, counter "2") and that it takes more than one break. Ends immediately.
// ============================================================
const LEVEL36_STEPS = [
  { type: 'info', highlight: 2,
    text: "These are just like the normal Locks, but you have to break them more than once! 🔒" },
];

// ============================================================
// LEVEL 36... (above)
// LEVEL 43 — introduces STACKS. Authored 4×4 with four 2-card stacks in the center 2×2 —
// exactly idx 5,6,9,10 (each has a red card `beneath`). Two heads-up popups; both ring the
// whole 2×2 cluster via the multi-tile highlight (`highlight: [5,6,9,10]` → one box round
// their union). No guided action per the spec — the stacks visibly show an offset "sheets"
// look + a count badge, and the player collects each twice in normal play. Ends immediately.
// ============================================================
const LEVEL43_STEPS = [
  { type: 'info', highlight: [5, 6, 9, 10], text: "There are more cards underneath these cards! 🃏" },
  { type: 'info', highlight: [5, 6, 9, 10], text: "You need to collect them from the stack to clear the Level." },
];

// ============================================================
// LEVEL 51 — introduces the ELEVATOR. Authored 5×5 with a center 3×3 elevator area
// (idx 6,7,8,11,12,13,16,17,18; refills:1). Elevator cells don't refill per-card — the
// whole area stays empty until fully cleared, then one fresh batch emerges. Single
// heads-up popup ringing the whole 3×3 area (multi-tile highlight). Ends immediately.
// ============================================================
const LEVEL51_STEPS = [
  { type: 'info', highlight: [6, 7, 8, 11, 12, 13, 16, 17, 18],
    text: "You need to clear all of the Cards from the Elevator area for it to bring you new ones! ⬆️" },
];

// ---- Registry: level INDEX → tutorial. (index = level id − 1 in cleaningxl.) ----
const LEVEL_TUTORIALS = {
  0:  { id: 'ftue',    steps: LEVEL1_FTUE_STEPS },
  1:  { id: 'level2',  steps: LEVEL2_STEPS },
  3:  { id: 'level4',  steps: LEVEL4_STEPS },
  5:  { id: 'level6',  steps: LEVEL6_STEPS },
  6:  { id: 'level7',  steps: LEVEL7_STEPS },
  9:  { id: 'level10', steps: LEVEL10_STEPS },
  10: { id: 'level11', steps: LEVEL11_STEPS },
  14: { id: 'level15', steps: LEVEL15_STEPS },
  15: { id: 'level16', steps: LEVEL16_STEPS, forceStreakReveal: 6 },
  24: { id: 'level25', steps: LEVEL25_STEPS },
  27: { id: 'level28', steps: LEVEL28_STEPS },
  35: { id: 'level36', steps: LEVEL36_STEPS },
  42: { id: 'level43', steps: LEVEL43_STEPS },
  50: { id: 'level51', steps: LEVEL51_STEPS },
};
