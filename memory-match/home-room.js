// ============================================================
// HOME HALLS — the home screen is a series of "halls", each collecting 5 items
// as the matching 5 levels are cleared:
//   Hall 0 — Music Hall  (levels 1–5)  → instruments on pedestals
//   Hall 1 — Green Pasture (levels 6–10) → animals on the grass
// (More halls can be appended; each covers the next block of 5 levels.)
//
// A hall's item j maps to global level index (hallIndex*5 + j). An item is
// "revealed" once that level is completed (progress.stars[levelIndex] > 0), and
// animates in the first time it's shown after the win (tracked in
// progress.seenInstruments, keyed by global level index).
//
// Flow after a win: you always return to the Hall (no "next level" shortcut) so
// you SEE what you just unlocked appear. When you finish the last level of a
// hall, the hall reveals that final item and then SLIDES to the next hall.
//
// Loaded after endgame.js, before boot.js. Shares one global namespace.
// ============================================================

const MAIN_JOURNEY = 'cleaningxl';
const HALL_SIZE = 5;   // levels (and items) per hall

// Each hall: assetDir (folder holding its <img>.svg art), theme (drives the
// background + whether items sit on pedestals), and 5 item spots.
//   left/bottom — spot anchor as % of the scene box
//   h           — art height in cqh (1% of scene height)
//   pw          — pedestal width in cqw (music theme only)
const HALLS = [
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

const TOTAL_HALL_ITEMS = HALLS.length * HALL_SIZE;

function assetSrc(hall, imgKey) { return `${hall.assetDir}/${imgKey}.svg`; }

// The next level the player will play (0-based, clamped to the journey length).
function nextPlayableIndex() {
  const n = (typeof LEVELS !== 'undefined') ? LEVELS.length : 0;
  return Math.max(0, Math.min(progress.highestUnlocked || 0, n - 1));
}

// Hall that contains the next level to play (clamped to the last defined hall).
function currentHallIndex() {
  return Math.max(0, Math.min(Math.floor(nextPlayableIndex() / HALL_SIZE), HALLS.length - 1));
}

// Lowest hall holding an unlocked-but-not-yet-animated item, or -1 if none.
function pendingRevealHall() {
  if (!Array.isArray(progress.seenInstruments)) progress.seenInstruments = [];
  for (let L = 0; L < TOTAL_HALL_ITEMS; L++) {
    if ((progress.stars?.[L] || 0) > 0 && !progress.seenInstruments.includes(L)) {
      return Math.floor(L / HALL_SIZE);
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

  buildLevelJumper();
  document.body.classList.add('on-home');
  document.getElementById('home-screen').classList.add('active');

  const nextHall   = currentHallIndex();
  const revealHall = pendingRevealHall();

  if (revealHall >= 0 && revealHall !== nextHall) {
    // Finished the last level of a hall: reveal that item HERE first, then slide
    // to the hall of the next level so the player sees what they unlocked.
    renderHall(revealHall, { reveal: true });
    setTimeout(() => renderHall(nextHall, { reveal: true, slide: true }), 1800);
  } else {
    // Same-hall reveal (or nothing new). Slide in if this hall is new to us.
    const firstTimeHall = (progress.seenHall == null) || nextHall > progress.seenHall;
    renderHall(nextHall, { reveal: true, slide: firstTimeHall && nextHall > 0 });
  }
}

function renderHall(hallIdx, opts = {}) {
  const hall = HALLS[hallIdx];
  if (!hall) return;
  if (!Array.isArray(progress.seenInstruments)) progress.seenInstruments = [];

  const scene = document.getElementById('room-scene');
  if (scene) {
    scene.classList.remove('theme-music', 'theme-pasture');
    scene.classList.add('theme-' + hall.theme);
  }
  const titleEl = document.getElementById('room-title');
  if (titleEl) titleEl.textContent = hall.name;

  const wrap = document.getElementById('room-pedestals');
  if (!wrap) return;
  wrap.innerHTML = '';

  hall.items.forEach((item, j) => {
    const levelIdx = hallIdx * HALL_SIZE + j;
    const revealed = (progress.stars?.[levelIdx] || 0) > 0;
    const isNew = revealed && opts.reveal && !progress.seenInstruments.includes(levelIdx);

    const spot = document.createElement('div');
    spot.className = 'room-spot ' + (revealed ? 'revealed' : 'empty') + (isNew ? ' new' : '');
    spot.style.left = item.left + '%';
    spot.style.bottom = item.bottom + '%';
    if (item.pw) spot.style.setProperty('--pw', item.pw + 'cqw');

    let inner = '';
    if (revealed) {
      inner += `<div class="spot-glow"></div>`;
      inner += `<div class="spot-notes"><span>♪</span><span>♫</span><span>♪</span></div>`;
      inner += `<img class="spot-instrument" src="${assetSrc(hall, item.img)}" alt="${item.name}" draggable="false" style="height:${item.h}cqh">`;
    } else {
      inner += `<div class="spot-instrument spot-locked" style="height:${item.h}cqh"><span>?</span></div>`;
    }
    // Music items stand on wooden pedestals; pasture items sit on the grass.
    inner += hall.theme === 'pasture' ? `<div class="spot-shadow"></div>` : `<div class="spot-pedestal"></div>`;
    spot.innerHTML = inner;
    wrap.appendChild(spot);

    if (isNew) progress.seenInstruments.push(levelIdx);
  });

  // Remember the furthest hall we've shown (drives the first-time slide-in).
  if (progress.seenHall == null || hallIdx > progress.seenHall) progress.seenHall = hallIdx;
  if (typeof saveProgress === 'function') saveProgress();

  if (opts.slide && scene) {
    scene.classList.remove('slide-in');
    void scene.offsetWidth;        // reflow so the animation restarts
    scene.classList.add('slide-in');
    setTimeout(() => scene.classList.remove('slide-in'), 750);
  }
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
