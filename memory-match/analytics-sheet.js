// ============================================================
// USERNAME + GOOGLE-SHEET ANALYTICS
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
//
// Loads with the data/config layer (after settings.js) — it only DEFINES
// functions/consts and reads no shared engine state at load time, so its
// position is convention, not a hard dependency. Callers all run later:
//   • boot.js            → maybeAskUsername()  (once-per-device prompt)
//   • level.js startGame → resetMatchStats()   (new match: clear counters)
//   • boosters.js        → recordPowerUpUse()   (each power-up consumed)
//   • endgame.js         → logLevelResult()     (win / fail → send a row)
// ============================================================

// ------------------------------------------------------------
// Where match results are POSTed. This must be the deployment URL of a
// Google Apps Script Web App bound to the target spreadsheet (see
// analytics-apps-script.gs for the script + step-by-step deploy notes).
// Leave it blank to disable sending (the game plays fine with no endpoint).
// A runtime override can be set from the console without editing this file:
//   localStorage.setItem('mm_analytics_endpoint', 'https://script.google.com/…/exec')
// ------------------------------------------------------------
const ANALYTICS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbz2zc7M8FjFWvqfjS5Wy68bB-UBL3PgmgUXdAd4KJdnboFoTqVEEKev8sAOhn24i1YhvQ/exec';

function getAnalyticsEndpoint() {
  try {
    const override = localStorage.getItem('mm_analytics_endpoint');
    if (override) return override;
  } catch (e) {}
  return ANALYTICS_ENDPOINT || '';
}

// ------------------------------------------------------------
// USERNAME — asked once per device, stored in its own localStorage key so it
// survives a progress reset (it identifies the device/player, not the run).
// ------------------------------------------------------------
const MM_USERNAME_KEY = 'mm_username';

function getUsername() {
  try { return (localStorage.getItem(MM_USERNAME_KEY) || '').trim(); }
  catch (e) { return ''; }
}
function setUsername(name) {
  try { localStorage.setItem(MM_USERNAME_KEY, name); } catch (e) {}
}

// Show the welcome prompt the first time only. Called from boot() after the
// home screen is up, so it sits on top of the hall.
function maybeAskUsername() {
  if (getUsername()) return;
  const el = document.getElementById('username-prompt');
  if (!el) return;
  el.classList.add('active');
  const input = document.getElementById('username-input');
  if (input) { input.value = ''; setTimeout(() => { try { input.focus(); } catch (e) {} }, 150); }
}

function submitUsername() {
  const input = document.getElementById('username-input');
  const name = ((input && input.value) || '').trim().slice(0, 24);
  if (!name) {
    if (input) { input.classList.remove('input-shake'); void input.offsetWidth; input.classList.add('input-shake'); input.focus(); }
    return;
  }
  setUsername(name);
  const el = document.getElementById('username-prompt');
  if (el) el.classList.remove('active');
}

// ------------------------------------------------------------
// PER-MATCH TRACKING — reset at the start of every match (startGame), then
// accumulated as the player spends power-ups, and read once at win/fail.
// ------------------------------------------------------------
let matchPowerUps = {};     // power-up id → times used this match
let matchStartTurns = 0;    // the turn budget the match began with (+5 per coin-continue)
let matchTurnsTaken = 0;    // ACTUAL turns/chains the player resolved (every endTurn)
let matchTurnsRefunded = 0; // of those, how many a colour clear gave back (the "+1 Turn")

function resetMatchStats() {
  matchPowerUps = {};
  matchStartTurns = (typeof MAX_TURNS === 'number') ? MAX_TURNS : 0;
  matchTurnsTaken = 0;
  matchTurnsRefunded = 0;
}

// One choke-point for "a power-up was used". `id` is a booster id, 'recall',
// or 'card:<specialType>' for a deployed special card.
function recordPowerUpUse(id) {
  if (!id) return;
  matchPowerUps[id] = (matchPowerUps[id] || 0) + 1;
}

// Called once per resolved turn (from endTurn). Counts the turn the player
// actually TOOK — independent of the budget, which a colour clear refunds. So
// `turnsTaken` stays accurate even when `turnsStart − turnsEnd` doesn't move.
function recordTurnResolved(colorCleared) {
  matchTurnsTaken++;
  if (colorCleared) matchTurnsRefunded++;
}

// Human-readable label for a tracked power-up id.
function powerUpLabel(id) {
  if (id === 'recall') return 'Recall';
  if (id.indexOf('card:') === 0) {
    const type = id.slice(5);
    const s = (typeof SPECIAL_TYPES !== 'undefined') ? SPECIAL_TYPES.find(x => x.id === type) : null;
    return (s ? s.name : type) + ' (card)';
  }
  const b = (typeof BOOSTERS !== 'undefined') ? BOOSTERS.find(x => x.id === id) : null;
  return b ? (b.name || b.id) : id;
}

// "Peek×2, Recall×1" — a compact, sheet-friendly breakdown (empty string = none).
function formatPowerUps() {
  return Object.keys(matchPowerUps)
    .map(id => `${powerUpLabel(id)}×${matchPowerUps[id]}`)
    .join(', ');
}
function totalPowerUps() {
  return Object.keys(matchPowerUps).reduce((sum, id) => sum + matchPowerUps[id], 0);
}

// ------------------------------------------------------------
// SEND — POST a match result to the Google Sheet endpoint. Fire-and-forget:
// beacon first (survives the tab closing), fetch/no-cors as a fallback. We
// never read the response — an Apps Script Web App returns no CORS headers.
// ------------------------------------------------------------
function sendAnalytics(payload) {
  const url = getAnalyticsEndpoint();
  if (!url) return; // not configured — silently skip
  let body;
  try { body = JSON.stringify(payload); } catch (e) { return; }
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
      if (navigator.sendBeacon(url, blob)) return;
    }
  } catch (e) {}
  try {
    fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body,
    });
  } catch (e) {}
}

// Build + send one row. `outcome` is 'complete' or 'fail'. Called from
// levelWon() / levelFailed() in endgame.js.
function logLevelResult(outcome) {
  const lvl = (typeof LEVELS !== 'undefined' && LEVELS[currentLevelIndex]) ? LEVELS[currentLevelIndex] : null;
  const turnsEnd = (typeof turns === 'number') ? turns : 0;
  const start = matchStartTurns || (typeof MAX_TURNS === 'number' ? MAX_TURNS : 0);
  const payload = {
    timestamp:     new Date().toISOString(),
    username:      getUsername() || 'anonymous',
    outcome:       outcome,
    journey:       (typeof progress !== 'undefined' && progress.progressionStyle) || '',
    level:         lvl ? lvl.id : (currentLevelIndex + 1),
    levelIndex:    currentLevelIndex,
    turnsStart:    start,
    turnsEnd:      turnsEnd,
    // Actual turns the player took. NOT start−end: a colour clear refunds its turn
    // (the green "+1"), so the budget can barely move while many turns are played.
    // Reconciles as: turnsTaken = (turnsStart − turnsEnd) + turnsRefunded.
    turnsTaken:    matchTurnsTaken,
    turnsRefunded: matchTurnsRefunded,
    score:         (typeof score === 'number') ? score : 0,
    stars:         (outcome === 'complete' && typeof progress !== 'undefined' && progress.stars) ? (progress.stars[currentLevelIndex] || 0) : 0,
    powerUps:      formatPowerUps(),
    powerUpsTotal: totalPowerUps(),
  };
  sendAnalytics(payload);
}
