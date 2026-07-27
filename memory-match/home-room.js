// ============================================================
// HOME HALLS — the home screen is a series of "halls", each collecting its
// items as the matching levels are cleared:
//   Hall 0 — Childhood     (levels 1–4)  → a composed jump-rope scene
//   Hall 1 — Music Hall    (levels 5–9)  → instruments on pedestals
//   Hall 2 — Green Pasture (levels 10–14) → animals on the grass
// (More halls can be appended.) Halls are NOT a fixed size any more: each hall
// covers exactly `items.length` levels, and levels map to halls consecutively
// (hall 0 = the first `size0` levels, hall 1 = the next `size1`, …). Use
// hallStart(i)/hallForLevel(L) instead of a fixed HALL_SIZE.
//
// A hall's item j maps to global level index (hallStart(hallIndex) + j). An item
// is "revealed" once that level is completed (progress.stars[levelIndex] > 0),
// and animates in the first time it's shown after the win (tracked in
// progress.seenInstruments, keyed by global level index).
//
// Flow after a win: you always return to the Hall (no "next level" shortcut) so
// you SEE what you just unlocked appear. When you finish the last level of a
// hall, the hall reveals that final item and then SLIDES to the next hall.
//
// Loaded after endgame.js, before boot.js. Shares one global namespace.
// ============================================================

const MAIN_JOURNEY = 'cleaningxl';

// DATA: halls, their item slots and the art registry all live in collections.js
// (`COLLECTIONS`), shared with board-bg.js so a level's board reveal and its
// home-screen item stay one edit. Authored via the level-editor's Collections
// tab. Each slot carries:
//   item        — key into COLLECTIONS.items ({ name, file, view, layer? })
//   levelId     — the level whose completion reveals it
//   kind        — 'layer' for a full-scene tableau piece (position baked into the
//                 art, drawn to fill the picture box); omitted for a placed item
//   left/bottom — spot anchor as % of the PICTURE box (placed items only)
//   h           — art height in cqh (placed items only)
//   pw          — pedestal width in cqw (CSS-theme pedestal halls only)
// A hall gets its background from `backdrop` (an image; hides #room-bg) or
// `theme` (a hand-authored .theme-<id> CSS preset in COLLECTIONS.themes).
const HALLS      = COLLECTIONS.halls;
const HALL_ITEMS = COLLECTIONS.items;


// Variable hall sizes: each hall covers exactly slots.length consecutive levels.
const TOTAL_HALL_ITEMS = HALLS.reduce((n, h) => n + (h.slots || []).length, 0);

// Resolve a slot to its global level index. progress.stars and
// progress.seenInstruments are both keyed by INDEX, while slots name their level
// by id — so this is the one place the two spaces meet. -1 when the active
// journey has no level with that id.
function slotLevelIndex(slot) {
  if (typeof LEVELS === 'undefined') return -1;
  return LEVELS.findIndex(l => l.id === slot.levelId);
}

// Global level index of a hall's first item.
function hallStart(idx) {
  const h = HALLS[idx];
  if (!h || !(h.slots || []).length) return 0;
  const idxs = h.slots.map(slotLevelIndex).filter(i => i >= 0);
  return idxs.length ? Math.min(...idxs) : 0;
}
// Which hall contains global level index L (clamped to the last hall we're past).
function hallForLevel(L) {
  const owner = HALLS.findIndex(h => (h.slots || []).some(s => slotLevelIndex(s) === L));
  if (owner >= 0) return owner;
  let last = 0;
  HALLS.forEach((h, i) => {
    const passed = (h.slots || []).length &&
      h.slots.every(s => { const li = slotLevelIndex(s); return li >= 0 && li < L; });
    if (passed) last = i;
  });
  return last;
}

// Reveal choreography on landing home after a win:
//   1. the existing scene (background + already-collected items) shows for
//      REVEAL_APPEAR_DELAY with the new item still absent,
//   2. the new item then animates in over the reveal duration,
//   3. once it lands we linger STAGE_STAY_MS on the finished scene before the
//      hall-complete celebration / next-room transition (if any).
const REVEAL_APPEAR_DELAY = 300;   // #1 — old scene (no new item yet) holds this long
const REVEAL_ANIM_MS      = 900;   // matches the CSS roomReveal duration (music/pasture)
const STAGE_STAY_MS       = 1000;  // #3 — linger on the finished scene before celebrating
// The childhood scene piece fades in over this long (matches CSS childhoodReveal).
const CHILDHOOD_REVEAL_ANIM_MS = 700;

// Which hall is currently on screen (may differ from currentHallIndex while the
// player swipes to browse earlier halls). Home button always resets it.
let viewedHall = 0;
// Pending timers so a re-render / navigation cancels an in-flight reveal, slide
// or completion celebration.
let _revealTimer = null, _slideTimer = null, _celebrateTimer = null;

// A slot's art: `layer` (full-scene tableau canvas) when it has one and the slot
// asks for it, else the tight `file` used for the behind-board reveal too.
function slotArt(slot) {
  const it = HALL_ITEMS[slot.item];
  if (!it) return null;
  return { item: it, src: (slot.kind === 'layer' && it.layer) ? it.layer : it.file };
}

// The next level the player will play (0-based, clamped to the journey length).
function nextPlayableIndex() {
  const n = (typeof LEVELS !== 'undefined') ? LEVELS.length : 0;
  return Math.max(0, Math.min(progress.highestUnlocked || 0, n - 1));
}

// Hall that contains the next level to play (clamped to the last defined hall).
function currentHallIndex() {
  return hallForLevel(nextPlayableIndex());
}

// Lowest hall holding an unlocked-but-not-yet-animated item, or -1 if none.
function pendingRevealHall() {
  if (!Array.isArray(progress.seenInstruments)) progress.seenInstruments = [];
  for (let L = 0; L < TOTAL_HALL_ITEMS; L++) {
    if ((progress.stars?.[L] || 0) > 0 && !progress.seenInstruments.includes(L)) {
      return hallForLevel(L);
    }
  }
  return -1;
}

// ============================================================
// SHOW / RENDER
// ============================================================
function showHome() {
  // Make sure the main journey is loaded (players never see the journey picker).
  if (!progress.progressionStyle) {
    if (typeof applyProgression === 'function') applyProgression(MAIN_JOURNEY);
    progress.progressionStyle = MAIN_JOURNEY;
    if (typeof restoreJourneySnapshot === 'function') restoreJourneySnapshot(MAIN_JOURNEY);
  }
  if (typeof closeAllOverlays === 'function') closeAllOverlays();
  currentLevelIndex = nextPlayableIndex();

  // HUD + Play label
  const livesEl = document.getElementById('room-lives');
  const coinsEl = document.getElementById('room-coins');
  if (livesEl) livesEl.textContent = progress.lives ?? 5;
  if (coinsEl) coinsEl.textContent = progress.coins || 0;
  const lvlEl = document.getElementById('room-play-level');
  if (lvlEl) lvlEl.textContent = 'LEVEL ' + (LEVELS[currentLevelIndex]?.id ?? (currentLevelIndex + 1));

  renderHomeStreak();
  renderHomeReward();

  buildLevelJumper();
  initHallSwipe();
  document.body.classList.add('on-home');
  document.getElementById('home-screen').classList.add('active');

  // Home always lands on the last unlocked stage (#4).
  const nextHall   = currentHallIndex();
  const revealHall = pendingRevealHall();

  clearTimeout(_slideTimer);
  clearTimeout(_celebrateTimer);
  if (revealHall >= 0 && revealHall !== nextHall) {
    // Finished the LAST level of a hall: show that stage and let its final item
    // appear (after REVEAL_APPEAR_DELAY). Once it lands, CELEBRATE the completed
    // scene and WAIT — the player must acknowledge (tap Continue or swipe) to
    // move on; we no longer auto-slide to the next hall.
    viewedHall = revealHall;
    renderHall(revealHall, { reveal: true });
    const animMs = HALLS[revealHall].theme === 'childhood' ? CHILDHOOD_REVEAL_ANIM_MS : REVEAL_ANIM_MS;
    _celebrateTimer = setTimeout(() => celebrateHallComplete(revealHall, nextHall),
      REVEAL_APPEAR_DELAY + animMs + STAGE_STAY_MS);
  } else {
    // Same-hall reveal (or nothing new). Slide in if we're arriving on a hall
    // deeper than we've shown before.
    const firstTimeHall = (progress.seenHall == null) || nextHall > progress.seenHall;
    viewedHall = nextHall;
    renderHall(nextHall, { reveal: true, slideDir: (firstTimeHall && nextHall > 0) ? 1 : 0 });
  }
  updateHallNav();
}

// The "collected" contents of a spot: glow, (music) notes, and the art image.
// Ornaments are per-hall for image backdrops (a photographic scene rarely wants
// floating ♪) and per-theme for the hand-authored CSS halls.
function revealedInnerHTML(hall, slot) {
  const art = slotArt(slot);
  if (!art) return '';
  const theme = COLLECTIONS.themes[hall.theme] || {};
  const isLayer = slot.kind === 'layer';
  const showGlow  = isLayer ? false : (hall.backdrop ? !!hall.glow  : theme.glow !== false);
  const showNotes = isLayer ? false : (hall.backdrop ? !!hall.notes : !!theme.notes);
  // A layer's position is baked into its canvas, so it fills the picture box
  // instead of being sized/anchored like a placed item.
  const style = isLayer ? 'width:100%;height:100%' : `height:${slot.h}cqh`;
  return (showGlow ? `<div class="spot-glow"></div>` : '') +
    (showNotes ? `<div class="spot-notes"><span>♪</span><span>♫</span><span>♪</span></div>` : '') +
    `<img class="spot-instrument" src="${art.src}" alt="${art.item.name}" draggable="false" style="${style}">`;
}

// Size the spot layer to the backdrop's RENDERED rect. The backdrop uses
// `object-fit: cover`, so on a wider device the picture is cropped — anchoring
// spots to the scene box would slide every item off the scenery it was placed
// against (an iPad crops ~59% of a portrait backdrop's height). Matching the
// cover geometry keeps a slot's left/bottom/h relative to the PICTURE, so items
// stay glued to painted pedestals — and keeps a composed tableau layer pixel-
// aligned with the background it was sliced from. The layer also becomes the
// container-query container, so `cqh`/`cqw` art sizes scale with the picture
// rather than the scene. No-op for CSS-theme halls, which span the whole scene.
function syncBackdropBox() {
  const scene = document.getElementById('room-scene');
  const img   = document.getElementById('room-backdrop');
  const wrap  = document.getElementById('room-pedestals');
  if (!scene || !img || !wrap) return;

  if (!scene.classList.contains('has-backdrop') || !img.naturalWidth) {
    wrap.style.left = wrap.style.top = wrap.style.width = wrap.style.height = '';
    wrap.style.right = wrap.style.bottom = '';
    return;
  }
  const sw = scene.clientWidth, sh = scene.clientHeight;
  if (!sw || !sh) return;
  const natAspect = img.naturalWidth / img.naturalHeight;
  let w, h;
  if (sw / sh > natAspect) { w = sw; h = sw / natAspect; }   // wider box → crop top
  else                     { h = sh; w = sh * natAspect; }   // taller box → crop sides
  // Mirrors `object-position: center bottom`.
  wrap.style.left   = ((sw - w) / 2) + 'px';
  wrap.style.top    = (sh - h) + 'px';
  wrap.style.width  = w + 'px';
  wrap.style.height = h + 'px';
  wrap.style.right  = 'auto';
  wrap.style.bottom = 'auto';
}

// Re-anchor on any scene resize. A ResizeObserver (not a window `resize`
// listener) because the #device-switcher rescales the phone frame purely in CSS,
// which never fires a window resize.
if (typeof ResizeObserver !== 'undefined') {
  const sceneForObs = document.getElementById('room-scene');
  if (sceneForObs) new ResizeObserver(syncBackdropBox).observe(sceneForObs);
} else {
  window.addEventListener('resize', syncBackdropBox);
}

function renderHall(hallIdx, opts = {}) {
  const hall = HALLS[hallIdx];
  if (!hall) return;
  if (!Array.isArray(progress.seenInstruments)) progress.seenInstruments = [];

  // A fresh render cancels any in-flight reveal from a previous render.
  clearTimeout(_revealTimer);

  // Backdrop: an image hall points at a file and hides the procedural scenery;
  // a CSS-theme hall keeps #room-bg and just swaps the .theme-<id> class.
  const scene = document.getElementById('room-scene');
  if (scene) {
    Object.keys(COLLECTIONS.themes || {}).forEach(t => scene.classList.remove('theme-' + t));
    if (hall.theme) scene.classList.add('theme-' + hall.theme);
    scene.classList.toggle('has-backdrop', !!hall.backdrop);
  }
  const backdropEl = document.getElementById('room-backdrop');
  if (backdropEl) {
    if (hall.backdrop) {
      backdropEl.src = hall.backdrop;
      if (backdropEl.complete && backdropEl.naturalWidth) syncBackdropBox();
      else backdropEl.onload = syncBackdropBox;
    } else { backdropEl.removeAttribute('src'); backdropEl.onload = null; }
    syncBackdropBox();
  }
  const titleEl = document.getElementById('room-title');
  if (titleEl) titleEl.textContent = hall.name;

  const wrap = document.getElementById('room-pedestals');
  if (!wrap) return;
  wrap.innerHTML = '';

  const pending = [];   // items to reveal after the delay
  const theme = COLLECTIONS.themes[hall.theme] || {};
  (hall.slots || []).forEach(slot => {
    if (!HALL_ITEMS[slot.item]) return;          // slot names art that isn't registered
    const levelIdx = slotLevelIndex(slot);
    const revealed = levelIdx >= 0 && (progress.stars?.[levelIdx] || 0) > 0;
    const isNew = revealed && opts.reveal && !progress.seenInstruments.includes(levelIdx);
    const isLayer = slot.kind === 'layer';

    const spot = document.createElement('div');
    spot.className = 'room-spot ' + (revealed ? 'revealed' : 'empty') + (isLayer ? ' spot-layer' : '');
    if (!isLayer) {
      spot.style.left = slot.left + '%';
      spot.style.bottom = slot.bottom + '%';
      if (slot.pw) spot.style.setProperty('--pw', slot.pw + 'cqw');
    }

    // Image backdrops have their pedestals painted in, so a slot adds only an
    // optional ground shadow; CSS-theme halls draw a pedestal or a shadow per
    // their theme. A composed tableau layer has no base at all.
    const base = isLayer ? ''
               : hall.backdrop ? (hall.shadow ? `<div class="spot-shadow"></div>` : '')
               : theme.pedestals ? `<div class="spot-pedestal"></div>` : `<div class="spot-shadow"></div>`;
    if (isNew) {
      // Show ONLY the empty base now; the art is injected after the delay so the
      // player always sees it pop in (never already there). #1/#2.
      spot.innerHTML = base;
      pending.push({ spot, hall, slot, levelIdx });
    } else if (revealed) {
      spot.innerHTML = revealedInnerHTML(hall, slot) + base;
    } else if (isLayer) {
      spot.innerHTML = '';                        // an uncollected tableau piece is simply absent
    } else {
      spot.innerHTML = `<div class="spot-instrument spot-locked" style="height:${slot.h}cqh"><span>?</span></div>` + base;
    }
    wrap.appendChild(spot);
  });

  if (pending.length) {
    _revealTimer = setTimeout(() => {
      pending.forEach(p => {
        if (!p.spot.isConnected) return;          // hall changed before the reveal — skip
        p.spot.classList.add('new');
        p.spot.insertAdjacentHTML('afterbegin', revealedInnerHTML(p.hall, p.slot));
        if (!progress.seenInstruments.includes(p.levelIdx)) progress.seenInstruments.push(p.levelIdx);
      });
      if (typeof saveProgress === 'function') saveProgress();
    }, REVEAL_APPEAR_DELAY);
  }

  // Remember the furthest hall we've shown (drives the first-time slide-in).
  if (progress.seenHall == null || hallIdx > progress.seenHall) progress.seenHall = hallIdx;
  if (typeof saveProgress === 'function') saveProgress();

  // slideDir: 1 = new hall enters from the right (forward), -1 = from the left (back).
  const dir = opts.slideDir || (opts.slide ? 1 : 0);
  if (dir && scene) {
    const cls = dir < 0 ? 'slide-in-rev' : 'slide-in';
    scene.classList.remove('slide-in', 'slide-in-rev');
    void scene.offsetWidth;        // reflow so the animation restarts
    scene.classList.add(cls);
    setTimeout(() => scene.classList.remove(cls), 650);
  }
}

// ============================================================
// WIN-STREAK METER (above Play) — one bar per streak level, filled up to the
// current streak, plus an orange circle showing the level-start boost (cards
// revealed, or shields if the streak effect is set to Shield).
// ============================================================
function renderHomeStreak() {
  const wrap = document.getElementById('home-streak');
  if (!wrap) return;

  // Hide the whole meter until the win-streak feature is unlocked in the
  // journey (next level's id has reached the journey's winStreakStartLevel).
  const unlocked = (typeof isWinStreakActive === 'function') ? isWinStreakActive() : true;
  wrap.style.display = unlocked ? '' : 'none';
  if (!unlocked) return;

  const barsEl = document.getElementById('home-streak-bars');
  if (!barsEl) return;
  const maxLevels = (typeof getWinStreakMaxLevels === 'function') ? getWinStreakMaxLevels() : 10;
  const streak    = (typeof getStreakLevel === 'function') ? getStreakLevel() : (progress.winStreak || 0);

  let html = '';
  for (let i = 1; i <= maxLevels; i++) {
    html += `<span class="hs-bar${i <= streak ? ' filled' : ''}"></span>`;
  }
  barsEl.innerHTML = html;

  // Orange circle: the boost you'll start the next level with at this streak.
  const effect = (typeof getStreakEffect === 'function') ? getStreakEffect() : 'reveal';
  const shield = effect === 'shield';
  const count  = shield
    ? (typeof getStreakShields === 'function' ? getStreakShields() : 0)
    : (typeof getStreakRevealCount === 'function' ? getStreakRevealCount() : 0);

  const numEl   = document.getElementById('home-streak-num');
  const glyphEl = document.getElementById('home-streak-glyph');
  const circle  = document.getElementById('home-streak-circle');
  if (numEl)   numEl.textContent = count;
  if (glyphEl) glyphEl.textContent = shield ? '🛡' : '👁';
  if (circle)  circle.title = shield
    ? `${count} shield${count !== 1 ? 's' : ''} at level start`
    : `${count} card${count !== 1 ? 's' : ''} revealed at level start`;
}

// ============================================================
// NEXT-LEVEL REWARD (beside Play) — the booster/special you earn for beating
// the level you're about to play.
// ============================================================
function renderHomeReward() {
  const el = document.getElementById('home-next-reward');
  if (!el) return;
  const lvl = LEVELS[currentLevelIndex];
  const rewards = (typeof getLevelRewards === 'function' && lvl)
    ? getLevelRewards().filter(r => r.afterLevel === lvl.id)
    : [];
  if (!rewards.length) { el.style.display = 'none'; el.innerHTML = ''; return; }

  el.style.display = '';
  el.innerHTML = '<div class="hnr-title">Reward</div>' +
    '<div class="hnr-items">' +
    rewards.map(r => {
      let icon = '?', name = '';
      if ((r.type || 'booster') === 'special') {
        const s = SPECIAL_TYPES.find(x => x.id === r.specialId);
        icon = s ? s.icon : '?'; name = s ? s.name : r.specialId;
      } else {
        const b = BOOSTERS.find(x => x.id === r.boosterId);
        icon = b ? b.icon : '?'; name = b ? (b.name || b.id) : r.boosterId;
      }
      return `<span class="hnr-pill" title="${name}"><span class="hnr-icon">${icon}</span>` +
             `<span class="hnr-qty">×${r.qty}</span></span>`;
    }).join('') +
    '</div>';
}

// ============================================================
// HALL-COMPLETE CELEBRATION — when the final piece of a hall lands, throw
// confetti and show a "Continue" prompt. We DON'T auto-advance; the player
// lingers on the finished scene and moves on only when they acknowledge it
// (tap Continue, or swipe/arrow to the next hall).
// ============================================================
function dismissHallComplete() {
  const el = document.getElementById('room-hall-complete');
  if (el) el.remove();
}

function celebrateHallComplete(completedHall, nextHall) {
  const scene = document.getElementById('room-scene');
  if (!scene || viewedHall !== completedHall) return;   // navigated away meanwhile
  if (typeof launchConfetti === 'function') launchConfetti();

  dismissHallComplete();
  const prompt = document.createElement('div');
  prompt.id = 'room-hall-complete';
  const name = HALLS[completedHall]?.name || '';
  prompt.innerHTML =
    `<div class="rhc-title"><span>✨</span>${name} complete!<span>✨</span></div>` +
    `<button class="rhc-btn" type="button">Continue →</button>`;
  scene.appendChild(prompt);
  // Fire the entrance animation on the next frame.
  requestAnimationFrame(() => prompt.classList.add('show'));
  prompt.querySelector('.rhc-btn').addEventListener('click', () => {
    dismissHallComplete();
    gotoHall(nextHall, 1);
  });
}

// ============================================================
// HALL NAVIGATION — swipe / arrows to browse unlocked halls (#4).
// The furthest browsable hall is currentHallIndex (the last unlocked stage);
// future halls stay hidden until reached.
// ============================================================
function gotoHall(idx, dir) {
  clearTimeout(_slideTimer);       // a manual navigation cancels any pending auto-slide
  clearTimeout(_celebrateTimer);   // ...and any pending completion celebration
  dismissHallComplete();
  const max = currentHallIndex();
  idx = Math.max(0, Math.min(idx, max));
  const slideDir = dir || (idx > viewedHall ? 1 : idx < viewedHall ? -1 : 0);
  viewedHall = idx;
  renderHall(idx, { slideDir });
  updateHallNav();
}

// Relative move from a swipe or arrow tap (delta = +1 next, -1 previous).
function swipeHall(delta) {
  const max = currentHallIndex();
  const target = viewedHall + delta;
  if (target < 0 || target > max) return;
  gotoHall(target, delta > 0 ? 1 : -1);
}

// Page dots + side arrows reflect which halls are browsable.
function updateHallNav() {
  const max = currentHallIndex();
  const dots = document.getElementById('room-dots');
  if (dots) {
    if (max <= 0) { dots.innerHTML = ''; }
    else {
      let h = '';
      for (let i = 0; i <= max; i++) h += `<span class="room-dot${i === viewedHall ? ' active' : ''}"></span>`;
      dots.innerHTML = h;
    }
  }
  const left = document.querySelector('.room-nav.left');
  const right = document.querySelector('.room-nav.right');
  if (left)  left.classList.toggle('show', viewedHall > 0);
  if (right) right.classList.toggle('show', viewedHall < max);
}

let _hallSwipeInit = false;
function initHallSwipe() {
  if (_hallSwipeInit) return;
  const scene = document.getElementById('room-scene');
  if (!scene) return;
  _hallSwipeInit = true;
  let startX = null, startY = null;
  scene.addEventListener('pointerdown', e => { startX = e.clientX; startY = e.clientY; });
  scene.addEventListener('pointerup', e => {
    if (startX == null) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    startX = startY = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) swipeHall(dx < 0 ? 1 : -1);
  });
  scene.addEventListener('pointercancel', () => { startX = startY = null; });
}

// ============================================================
// PLAY — from the hall, jump straight into the next level.
// ============================================================
function playFromHome() {
  document.body.classList.remove('on-home');
  document.getElementById('home-screen').classList.remove('active');
  if (!progress.progressionStyle) {
    if (typeof applyProgression === 'function') applyProgression(MAIN_JOURNEY);
    progress.progressionStyle = MAIN_JOURNEY;
    if (typeof restoreJourneySnapshot === 'function') restoreJourneySnapshot(MAIN_JOURNEY);
  }
  currentLevelIndex = nextPlayableIndex();
  showPreLevel();
}

// ============================================================
// DEV LEVEL JUMPER — panel OUTSIDE the phone frame (right side, desktop only,
// like #bg-switcher). Jumps to ANY level; the in-phone map stays forward-only.
// ============================================================
function buildLevelJumper() {
  let panel = document.getElementById('level-jumper');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'level-jumper';
    document.body.appendChild(panel);
  }
  const n = (typeof LEVELS !== 'undefined') ? LEVELS.length : 0;
  let html = '<span class="lj-label">Level Jump<small>dev · any level</small></span><div class="lj-grid">';
  for (let i = 0; i < n; i++) {
    const done = (progress.stars?.[i] || 0) > 0;
    const isNext = i === (progress.highestUnlocked || 0);
    html += `<button class="lj-btn${done ? ' done' : ''}${isNext ? ' next' : ''}" onclick="jumpToLevel(${i})">${LEVELS[i]?.id ?? i + 1}</button>`;
  }
  html += '</div>';
  panel.innerHTML = html;
}

function jumpToLevel(i) {
  document.body.classList.remove('on-home');
  const n = (typeof LEVELS !== 'undefined') ? LEVELS.length : 0;
  currentLevelIndex = Math.max(0, Math.min(i, n - 1));
  if ((progress.highestUnlocked || 0) < currentLevelIndex) progress.highestUnlocked = currentLevelIndex;
  if (typeof showPreLevel === 'function') showPreLevel();
}
