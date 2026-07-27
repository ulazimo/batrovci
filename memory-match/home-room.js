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

// Each hall: assetDir (folder holding its art), ext (asset file extension,
// default 'svg'), theme (drives the background + whether items sit on
// pedestals), and its item spots. The hall covers exactly items.length levels.
//   left/bottom — spot anchor as % of the scene box
//   h           — art height in cqh (1% of scene height)
//   pw          — pedestal width in cqw (music theme only)
const HALLS = [
  {
    // Childhood — a single composed tableau (two rope-turners, the rope, then
    // the jumping boy) that assembles piece-by-piece across levels 1–4. The
    // spot positions form the scene, so they are NOT independent pedestals.
    // Composed tableau matching childhood/final.png. Each item is a FULL-SCENE
    // layer (childhood/scene/*.png, a 480×720 canvas with the piece already at
    // its final position) drawn with the SAME cover-crop as the background, so
    // the pieces stay pixel-aligned to the scenery on every device and stacking
    // all four reproduces final.png exactly. left/bottom/h are unused here (the
    // position is baked into each layer). Reveal order builds the scene:
    // rope-turner → rope-turner → rope → the jumping boy (drawn last, on top).
    id: 'childhood', name: 'Childhood', theme: 'childhood', assetDir: 'childhood/scene', ext: 'png',
    items: [
      { img: 'child1',   name: 'Friend',     left: 50, bottom: 0, h: 100 },
      { img: 'child2',   name: 'Friend',     left: 50, bottom: 0, h: 100 },
      { img: 'jumprope', name: 'Jump Rope',  left: 50, bottom: 0, h: 100 },
      { img: 'boy',      name: 'The Jumper', left: 50, bottom: 0, h: 100 },
    ],
  },
  {
    id: 'music', name: 'Music Hall', theme: 'music', assetDir: 'instruments',
    items: [
      { img: 'guitar',    name: 'Guitar',    left: 50, bottom: 30, h: 46, pw: 26 },
      { img: 'saxophone', name: 'Saxophone', left: 19, bottom: 30, h: 33, pw: 20 },
      { img: 'trumpet',   name: 'Trumpet',   left: 81, bottom: 33, h: 17, pw: 22 },
      { img: 'drum',      name: 'Drum',      left: 32, bottom: 6,  h: 18, pw: 24 },
      { img: 'violin',    name: 'Violin',    left: 70, bottom: 5,  h: 40, pw: 18 },
    ],
  },
  {
    id: 'pasture', name: 'Green Pasture', theme: 'pasture', assetDir: 'animals',
    items: [
      { img: 'deer',   name: 'Deer',   left: 52, bottom: 30, h: 36 },
      { img: 'fox',    name: 'Fox',    left: 19, bottom: 16, h: 21 },
      { img: 'owl',    name: 'Owl',    left: 83, bottom: 33, h: 20 },
      { img: 'rabbit', name: 'Rabbit', left: 33, bottom: 5,  h: 19 },
      { img: 'bird',   name: 'Bird',   left: 71, bottom: 7,  h: 15 },
    ],
  },
];

// Variable hall sizes: each hall covers exactly items.length consecutive levels.
const TOTAL_HALL_ITEMS = HALLS.reduce((n, h) => n + h.items.length, 0);

// Global level index of a hall's first item (sum of earlier halls' sizes).
function hallStart(idx) {
  let s = 0;
  for (let i = 0; i < idx && i < HALLS.length; i++) s += HALLS[i].items.length;
  return s;
}
// Which hall contains global level index L (clamped to the last hall).
function hallForLevel(L) {
  let start = 0;
  for (let i = 0; i < HALLS.length; i++) {
    if (L < start + HALLS[i].items.length) return i;
    start += HALLS[i].items.length;
  }
  return HALLS.length - 1;
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

function assetSrc(hall, imgKey) { return `${hall.assetDir}/${imgKey}.${hall.ext || 'svg'}`; }

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
function revealedInnerHTML(hall, item) {
  const notes = hall.theme === 'music' ? `<div class="spot-notes"><span>♪</span><span>♫</span><span>♪</span></div>` : '';
  return `<div class="spot-glow"></div>${notes}` +
    `<img class="spot-instrument" src="${assetSrc(hall, item.img)}" alt="${item.name}" draggable="false" style="height:${item.h}cqh">`;
}

function renderHall(hallIdx, opts = {}) {
  const hall = HALLS[hallIdx];
  if (!hall) return;
  if (!Array.isArray(progress.seenInstruments)) progress.seenInstruments = [];

  // A fresh render cancels any in-flight reveal from a previous render.
  clearTimeout(_revealTimer);

  const scene = document.getElementById('room-scene');
  if (scene) {
    scene.classList.remove('theme-music', 'theme-pasture', 'theme-childhood');
    scene.classList.add('theme-' + hall.theme);
  }
  const titleEl = document.getElementById('room-title');
  if (titleEl) titleEl.textContent = hall.name;

  const wrap = document.getElementById('room-pedestals');
  if (!wrap) return;
  wrap.innerHTML = '';

  const pending = [];   // items to reveal after the delay
  const hallOffset = hallStart(hallIdx);
  hall.items.forEach((item, j) => {
    const levelIdx = hallOffset + j;
    const revealed = (progress.stars?.[levelIdx] || 0) > 0;
    const isNew = revealed && opts.reveal && !progress.seenInstruments.includes(levelIdx);

    const spot = document.createElement('div');
    spot.className = 'room-spot ' + (revealed ? 'revealed' : 'empty');
    spot.style.left = item.left + '%';
    spot.style.bottom = item.bottom + '%';
    if (item.pw) spot.style.setProperty('--pw', item.pw + 'cqw');

    // Music sits on a wooden pedestal; the pasture animals get a ground shadow;
    // the childhood tableau is a composed scene, so its pieces have no base.
    const base = hall.theme === 'music'   ? `<div class="spot-pedestal"></div>`
               : hall.theme === 'pasture' ? `<div class="spot-shadow"></div>`
               : ``;
    if (isNew) {
      // Show ONLY the empty pedestal now; the art is injected after the delay so
      // the player always sees it pop in (never already there). #1/#2.
      spot.innerHTML = base;
      pending.push({ spot, hall, item, levelIdx });
    } else if (revealed) {
      spot.innerHTML = revealedInnerHTML(hall, item) + base;
    } else {
      spot.innerHTML = `<div class="spot-instrument spot-locked" style="height:${item.h}cqh"><span>?</span></div>` + base;
    }
    wrap.appendChild(spot);
  });

  if (pending.length) {
    _revealTimer = setTimeout(() => {
      pending.forEach(p => {
        if (!p.spot.isConnected) return;          // hall changed before the reveal — skip
        p.spot.classList.add('new');
        p.spot.insertAdjacentHTML('afterbegin', revealedInnerHTML(p.hall, p.item));
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
