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
//   • boot.js            → logLogin()          (every launch → a Logins row)
//   • level.js startGame → resetMatchStats()   (new match: clear counters + start clock)
//   • boosters.js        → recordPowerUpUse()   (each power-up consumed)
//   • endgame.js         → logLevelResult()     (win / fail → send a row)
//   • shop.js            → logShopPurchase()    (each shop buy → a Purchases row)
//   • endgame/home       → setPlayerState()     (tracks where the player came from)
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
// CONSENT — the ToS / Privacy Policy accept gate. Must fire on first launch
// BEFORE any personal data is collected (the username prompt + analytics), so
// it wraps those first-run prompts: nothing runs until the player taps Accept.
// Stored in its own localStorage key (survives a progress reset, like username).
// ------------------------------------------------------------
const MM_CONSENT_KEY = 'mm_consent_accepted';
let consentOnAccept = null;   // callback to run once the player accepts

function hasConsent() {
  try { return localStorage.getItem(MM_CONSENT_KEY) === '1'; }
  catch (e) { return false; }
}

// Show the consent gate if it hasn't been accepted, then run `onDone`. If it was
// already accepted (or the overlay is missing), run `onDone` immediately.
function maybeAskConsent(onDone) {
  if (hasConsent()) { if (typeof onDone === 'function') onDone(); return; }
  const el = document.getElementById('consent-prompt');
  if (!el) { if (typeof onDone === 'function') onDone(); return; }
  consentOnAccept = (typeof onDone === 'function') ? onDone : null;
  el.classList.add('active');
}

function acceptConsent() {
  try { localStorage.setItem(MM_CONSENT_KEY, '1'); } catch (e) {}
  const el = document.getElementById('consent-prompt');
  if (el) el.classList.remove('active');
  const cb = consentOnAccept;
  consentOnAccept = null;
  if (typeof cb === 'function') cb();
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
  if (typeof maybeStartHomeFTUE === 'function') maybeStartHomeFTUE(); // kick off the FTUE now the prompt is gone
}

// ------------------------------------------------------------
// PER-MATCH TRACKING — reset at the start of every match (startGame), then
// accumulated as the player spends power-ups, and read once at win/fail.
// ------------------------------------------------------------
let matchPowerUps = {};     // power-up id → times used this match
let matchStartTurns = 0;    // the turn budget the match began with (+5 per coin-continue)
let matchTurnsTaken = 0;    // ACTUAL turns/chains the player resolved (every endTurn)
let matchTurnsRefunded = 0; // of those, how many a colour clear gave back (the "+1 Turn")
let matchStartedAt = 0;     // ms timestamp of the moment Play was pressed (startGame)

function resetMatchStats() {
  matchPowerUps = {};
  matchStartTurns = (typeof MAX_TURNS === 'number') ? MAX_TURNS : 0;
  matchTurnsTaken = 0;
  matchTurnsRefunded = 0;
  matchStartedAt = Date.now();
}

// Wall-clock seconds from pressing Play until the win/fail is declared. A
// coin-continue (+5 Turns) resumes the SAME match, so the clock keeps running —
// the duration covers the whole attempt, matching turnsStart's +5 behaviour.
function matchDurationSeconds() {
  if (!matchStartedAt) return 0;
  return Math.round((Date.now() - matchStartedAt) / 1000);
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

// ------------------------------------------------------------
// FIREBASE ANALYTICS — the SAME match-result row, sent as a custom GA4 event
// ('level_result') so it lands in Firebase/GA4 next to the auto-collected
// retention + playtime events (see the memory-match-firebase-analytics notes).
// Two output paths, picked per fire (mirrors haptics.js / notifications.js):
//   • NATIVE — the Capacitor @capacitor-firebase/analytics plugin
//              (window.Capacitor.Plugins.FirebaseAnalytics.logEvent) — what ships.
//   • WEB    — gtag('event', …) via the GA4 tag already loaded in index.html.
// Fire-and-forget; never throws into the caller. GA4 caps string param values at
// 100 chars and allows only string/number/boolean, so each value is coerced.
// ------------------------------------------------------------
const FIREBASE_LEVEL_EVENT = 'level_result';

function firebaseAnalyticsPlugin() {
  try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FirebaseAnalytics) || null; }
  catch (e) { return null; }
}

function fbParamValue(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  return String(v == null ? '' : v).slice(0, 100);
}

function logFirebaseEvent(name, params) {
  const clean = {};
  Object.keys(params || {}).forEach(k => { clean[k] = fbParamValue(params[k]); });
  const FA = firebaseAnalyticsPlugin();
  if (FA && FA.logEvent) {
    try { FA.logEvent({ name, params: clean }); } catch (e) {}
  }
  try { if (typeof gtag === 'function') gtag('event', name, clean); } catch (e) {}
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
    // Seconds from pressing Play to this win/fail (includes any coin-continue).
    durationSec:   matchDurationSeconds(),
  };
  sendAnalytics(payload);
  logFirebaseEvent(FIREBASE_LEVEL_EVENT, payload);
}

// ------------------------------------------------------------
// SHOP PURCHASES — logged to their OWN sheet tab ('Purchases'), so match results
// and purchases don't fight over one column layout. The Apps Script routes on
// payload.sheet (see analytics-apps-script.gs).
//
// `playerState` answers "what was the player doing right before they bought?" —
// set at each screen transition by setPlayerState(), read here.
// ------------------------------------------------------------
let playerState = 'boot';   // boot | home | prelevel | in-level | level-complete | level-failed

function setPlayerState(state) {
  if (state) playerState = state;
}

// One row per confirmed purchase. Called from buyBooster() AFTER the affordability
// check but BEFORE coins are deducted, so `coinsBefore` is the pre-buy balance.
function logShopPurchase(id, qty, cost, coinsBefore) {
  const lvl = (typeof LEVELS !== 'undefined' && LEVELS[currentLevelIndex]) ? LEVELS[currentLevelIndex] : null;
  sendAnalytics({
    sheet:        'Purchases',
    timestamp:    new Date().toISOString(),
    username:     getUsername() || 'anonymous',
    journey:      (typeof progress !== 'undefined' && progress.progressionStyle) || '',
    // The level the player is ON (the next one they'd play), not one they finished.
    level:        lvl ? lvl.id : (currentLevelIndex + 1),
    levelIndex:   currentLevelIndex,
    previousState: playerState,
    item:         id,
    itemName:     powerUpLabel(id),
    quantity:     qty,
    cost:         cost,
    coinsBefore:  coinsBefore,
    coinsAfter:   coinsBefore - cost,
  });
}

// ------------------------------------------------------------
// LOGINS — one row per app launch, logged to its own 'Logins' tab (the Apps
// Script routes on payload.sheet and auto-creates the tab + columns). Fired from
// boot.js on every launch, but only AFTER the consent gate — it collects a
// device fingerprint. The first launch on a device is the REGISTRATION row
// (is_registration = true, when mm_user_id is minted); every launch after is a
// login. Every field is best-effort: anything the platform can't provide (most
// device_* fields on the web) is sent blank/null and the sheet shows it empty.
// ------------------------------------------------------------
const MM_USER_ID_KEY = 'mm_user_id';

// A random id, preferring the crypto UUID; falls back for insecure contexts.
function genUserId() {
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// Stable per-device id. Returns { id, isNew } — isNew is true only the first time
// (the launch we mint it), which is what flags a row as a registration.
function getOrCreateUserId() {
  try {
    const existing = localStorage.getItem(MM_USER_ID_KEY);
    if (existing) return { id: existing, isNew: false };
    const id = genUserId();
    localStorage.setItem(MM_USER_ID_KEY, id);
    return { id: id, isNew: true };
  } catch (e) {
    // No storage (private mode): can't persist, so treat every launch as fresh.
    return { id: genUserId(), isNew: true };
  }
}

function getTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; }
  catch (e) { return ''; }
}

// Best-effort ISO-3166 country from the browser locale region (e.g. en-US → US).
// No external lookup — approximate, and can disagree with the real location.
function deriveCountry() {
  try {
    const loc = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    if (loc && typeof Intl !== 'undefined' && Intl.Locale) {
      try { const r = new Intl.Locale(loc).region; if (r) return r; } catch (e) {}
    }
    const m = /[-_]([A-Za-z]{2})\b/.exec(loc);
    if (m) return m[1].toUpperCase();
  } catch (e) {}
  return '';
}

// Phone / Tablet / PC — UA + touch + screen-size heuristic.
function deviceType() {
  try {
    const ua = navigator.userAgent || '';
    const iPadDesktop = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    if (/iPad/.test(ua) || iPadDesktop) return 'Tablet';
    if (/Android/.test(ua) && !/Mobile/.test(ua)) return 'Tablet';   // Android tablets drop "Mobile"
    if (/Mobile|iPhone|iPod/.test(ua) || /Android/.test(ua)) return 'Phone';
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const minDim = Math.min((screen && screen.width) || 0, (screen && screen.height) || 0);
    if (isTouch && minDim >= 600) return 'Tablet';
    if (isTouch && minDim > 0) return 'Phone';
    return 'PC';
  } catch (e) { return ''; }
}

// Android / iOS from the UA (native overrides this via the Device plugin below).
function buildPlatformWeb() {
  try {
    const ua = navigator.userAgent || '';
    if (/Android/.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iOS';
  } catch (e) {}
  return '';
}

// WiFi / Mobile Data from the Network Information API (often empty on desktop;
// the native Network plugin below is the reliable source on device).
function connectionTypeWeb() {
  try {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c && c.type) {
      if (c.type === 'wifi' || c.type === 'ethernet') return 'WiFi';
      if (c.type === 'cellular') return 'Mobile Data';
    }
  } catch (e) {}
  return '';
}

// OS + version parsed from the UA (native overrides via Device.getInfo().osVersion).
function osVersionFromUA() {
  try {
    const ua = navigator.userAgent || '';
    let m;
    if ((m = /Android\s+([\d.]+)/.exec(ua))) return 'Android ' + m[1];
    if ((m = /(?:iPhone|iPad|iPod).*?OS\s+([\d_]+)/.exec(ua))) return 'iOS ' + m[1].replace(/_/g, '.');
    if ((m = /Windows NT\s+([\d.]+)/.exec(ua))) return 'Windows NT ' + m[1];
    if ((m = /Mac OS X\s+([\d_]+)/.exec(ua))) return 'macOS ' + m[1].replace(/_/g, '.');
    if (/CrOS/.test(ua)) return 'ChromeOS';
    if (/Linux/.test(ua)) return 'Linux';
  } catch (e) {}
  return '';
}

// Unmasked WebGL renderer string — the closest thing the web exposes to a GPU name.
function deviceGPU() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) { const r = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); if (r) return String(r); }
    const r2 = gl.getParameter(gl.RENDERER);
    return r2 ? String(r2) : '';
  } catch (e) { return ''; }
}

// Coarse low/mid/high tier from the memory + core-count hints (both approximate).
function deviceTier() {
  const mem = navigator.deviceMemory || 0;
  const cores = navigator.hardwareConcurrency || 0;
  if (!mem && !cores) return '';
  if ((mem && mem <= 2) || (cores && cores <= 2)) return 'low';
  if (mem >= 8 || cores >= 8) return 'high';
  return 'mid';
}

// Gather the device fingerprint. Sync browser heuristics first, then let the
// native Capacitor plugins (Device / App / Network) overwrite what they know
// better. Returns keys in the requested column order.
async function collectDeviceInfo() {
  const dpr = window.devicePixelRatio || 1;
  const sw = (screen && screen.width) || window.innerWidth || 0;
  const sh = (screen && screen.height) || window.innerHeight || 0;
  const memMb = (typeof navigator.deviceMemory === 'number') ? Math.round(navigator.deviceMemory * 1024) : null;

  const d = {
    device_type:             deviceType(),
    build_platform:          buildPlatformWeb(),
    country:                 deriveCountry(),
    network_connection_type: connectionTypeWeb(),
    application_version:     '',
    timezone:                getTimezone(),
    os_version:              osVersionFromUA(),
    device_manufacturer:     '',            // native only (Device plugin)
    device_model:            '',            // native only (Device plugin)
    device_cpu_type:         '',            // not exposed to the web or the Device plugin
    device_gpu_name:         deviceGPU(),
    device_memory_size_mb:   memMb,
    device_tier:             deviceTier(),
    screen_width_px:         Math.round(sw * dpr) || null,
    screen_height_px:        Math.round(sh * dpr) || null,
    screen_dpi:              Math.round(96 * dpr) || null,
  };

  const plugins = (window.Capacitor && window.Capacitor.Plugins) || null;
  if (plugins) {
    if (plugins.Device && typeof plugins.Device.getInfo === 'function') {
      try {
        const di = await plugins.Device.getInfo();
        if (di) {
          if (di.manufacturer) d.device_manufacturer = di.manufacturer;
          if (di.model) d.device_model = di.model;
          if (di.osVersion) d.os_version = di.osVersion;
          if (di.platform === 'ios') d.build_platform = 'iOS';
          else if (di.platform === 'android') d.build_platform = 'Android';
        }
      } catch (e) {}
    }
    if (plugins.App && typeof plugins.App.getInfo === 'function') {
      try { const ai = await plugins.App.getInfo(); if (ai && ai.version) d.application_version = ai.version; }
      catch (e) {}
    }
    if (plugins.Network && typeof plugins.Network.getStatus === 'function') {
      try {
        const ns = await plugins.Network.getStatus();
        if (ns && ns.connectionType === 'wifi') d.network_connection_type = 'WiFi';
        else if (ns && ns.connectionType === 'cellular') d.network_connection_type = 'Mobile Data';
      } catch (e) {}
    }
  }
  return d;
}

// Build + send one Logins row. Fire-and-forget; called from boot() once per launch.
async function logLogin() {
  const uid = getOrCreateUserId();
  let device;
  try { device = await collectDeviceInfo(); } catch (e) { device = {}; }
  const payload = Object.assign({
    sheet:           'Logins',
    timestamp:       new Date().toISOString(),
    username:        getUsername() || '',
    user_id:         uid.id,
    is_registration: !!uid.isNew,
  }, device);
  sendAnalytics(payload);
}
