// ============================================================
// REMOTE CONTENT — over-the-air levels for the cleaningxl journey.
// Loads just before boot.js; shares the global namespace (no module).
//
// WHAT IT DOES
//   Lets you update Cleaning XL levels WITHOUT an app-store release. The level
//   bundle is a static JSON on Firebase Hosting; this file fetches it, validates
//   it, caches the last-good copy in localStorage, and applies it to the exact
//   globals applyProgression() already reads — LEVELS_CLEANINGXL,
//   PROGRESSION_CLEANING_XL, COLLECTIONS.boardArt.cleaningxl.
//
// MODEL — cache-first, apply-next-launch:
//   • boot: apply the best copy we already have (cached > bundled) BEFORE
//     applyProgression runs, so returning players get last-good remote content
//     instantly, offline included.
//   • boot: fire a background fetch. On success it only writes the cache — it
//     never hot-swaps the level you're playing. The new content is applied on
//     the NEXT launch. First-ever launch shows bundled levels, then remote.
//
// SAFETY
//   • JSON only — never eval remote code (also the App Store data-vs-code line).
//   • Validated before it's ever applied; any failure falls back to bundled.
//   • APPEND / RETUNE ONLY. stars / seenInstruments / seenHall are keyed by level
//     INDEX, so a remote update may retune existing levels or append new ones —
//     never reorder or insert mid-list, or existing saves repoint. (See CLAUDE.md
//     §10 persistence + the mm-remote-content memo.)
//
// RELEASE STEP (do this whenever you cut a native build):
//   Set BUNDLED_CONTENT_VERSION below to the contentVersion the bundled
//   levels_cleaningxl.js was assembled from. It gates out a STALE cache: a cached
//   bundle is used only if it is strictly newer than what's baked into this build,
//   so a fresh app update is never overridden by an old cache.
// ============================================================

const REMOTE_CONTENT_URL = 'https://prototyping-nordeus.web.app/cleaningxl-content.json';
const REMOTE_CONTENT_KEY = 'mm_remote_content';   // localStorage: last-good bundle (stringified)
const CONTENT_API = 1;                            // this build's content-API level (see minApi)
const BUNDLED_CONTENT_VERSION = 2;                // contentVersion baked into this build — bump per release
const REMOTE_FETCH_TIMEOUT_MS = 8000;

// A dev override, mirroring analytics-sheet.js's endpoint override:
//   localStorage.setItem('mm_remote_content_url', 'https://…/cleaningxl-content.json')
function getRemoteContentUrl() {
  try {
    const o = localStorage.getItem('mm_remote_content_url');
    if (o) return o;
  } catch (e) {}
  return REMOTE_CONTENT_URL;
}

// Structural validation — reject anything we don't fully trust before it can
// touch live globals. Deliberately strict: a malformed payload must fall back.
function isValidContentBundle(b) {
  if (!b || typeof b !== 'object') return false;
  if (typeof b.contentVersion !== 'number') return false;
  const minApi = typeof b.minApi === 'number' ? b.minApi : 1;
  if (minApi > CONTENT_API) return false;                 // payload needs a newer app than this
  const c = b.cleaningxl;
  if (!c || typeof c !== 'object') return false;
  if (!Array.isArray(c.levels) || c.levels.length === 0) return false;
  // Every level must look like a level: numeric id + a goals array.
  if (!c.levels.every(l => l && typeof l.id === 'number' && Array.isArray(l.goals))) return false;
  return true;
}

// Overwrite the globals applyProgression() reads. The very next applyProgression
// (at boot, and on every return to home) copies these into the live engine.
function applyContentBundle(b) {
  const c = b.cleaningxl;
  LEVELS_CLEANINGXL = c.levels;
  if (c.progression && typeof c.progression === 'object') PROGRESSION_CLEANING_XL = c.progression;
  if (c.boardArt && typeof c.boardArt === 'object' && typeof COLLECTIONS === 'object' && COLLECTIONS) {
    if (!COLLECTIONS.boardArt) COLLECTIONS.boardArt = {};
    COLLECTIONS.boardArt.cleaningxl = c.boardArt;
  }
}

function readCachedBundle() {
  try {
    const raw = localStorage.getItem(REMOTE_CONTENT_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw);
    return isValidContentBundle(b) ? b : null;
  } catch (e) { return null; }
}

// Called at boot BEFORE applyProgression. Applies the cached bundle only if it is
// strictly newer than what's bundled into this build; otherwise the bundled
// levels_cleaningxl.js stands. No-ops safely if there's no valid cache.
function applyBestContentAtBoot() {
  try {
    const cached = readCachedBundle();
    if (cached && cached.contentVersion > BUNDLED_CONTENT_VERSION) {
      applyContentBundle(cached);
      console.info('[content-remote] applied cached content v' + cached.contentVersion);
    }
  } catch (e) {
    console.warn('[content-remote] apply-at-boot failed, using bundled levels', e);
  }
}

// Fire-and-forget background refresh. Writes the cache only; never disturbs the
// running level. Picked up on the next launch.
async function refreshRemoteContent() {
  let controller, timer;
  try {
    controller = new AbortController();
    timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);
    const res = await fetch(getRemoteContentUrl(), { cache: 'no-store', signal: controller.signal });
    if (!res.ok) return;
    const b = await res.json();
    if (!isValidContentBundle(b)) { console.warn('[content-remote] remote payload invalid, ignored'); return; }

    // Only cache something strictly newer than both the build and any current cache.
    const cached = readCachedBundle();
    const floor = Math.max(BUNDLED_CONTENT_VERSION, cached ? cached.contentVersion : 0);
    if (b.contentVersion <= floor) return;

    localStorage.setItem(REMOTE_CONTENT_KEY, JSON.stringify(b));
    console.info('[content-remote] cached content v' + b.contentVersion + ' — applies next launch');
  } catch (e) {
    // Offline / blocked / timeout — keep whatever we have. This is the normal
    // offline path, so warn quietly.
    console.warn('[content-remote] refresh skipped:', e && e.name ? e.name : e);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
