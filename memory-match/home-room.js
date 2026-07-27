// ============================================================
// HOME HALLS — the home screen is a series of "halls", each collecting 5 items
// as the matching 5 levels are cleared:
//   Hall 0 — Music Hall  (levels 1–5)  → instruments on pedestals
//   Hall 1 — Green Pasture (levels 6–10) → animals on the grass
// (More halls can be appended; each covers the next block of 5 levels.)
//
// Each slot names its level outright (`levelId`); an item is "revealed" once
// that level is completed (progress.stars[levelIndex] > 0), and animates in the
// first time it's shown after the win (tracked in progress.seenInstruments,
// keyed by global level index — so slotLevelIndex() resolves id → index).
//
// Flow after a win: you always return to the Hall (no "next level" shortcut) so
// you SEE what you just unlocked appear. When you finish the last level of a
// hall, the hall reveals that final item and then SLIDES to the next hall.
//
// Loaded after endgame.js, before boot.js. Shares one global namespace.
//
// DATA: halls, their item slots and the art registry all live in collections.js
// (`COLLECTIONS`), shared with board-bg.js so a level's board reveal and its
// home-screen item stay one edit. Each slot carries:
//   item        — key into COLLECTIONS.items ({ name, file, view })
//   levelId     — the level whose completion reveals it
//   left/bottom — spot anchor as % of the scene box
//   h           — art height in cqh (1% of scene height)
//   pw          — pedestal width in cqw (pedestal themes only)
// A hall gets its background one of two ways:
//   backdrop: 'backdrops/x.png'  — an image; #room-bg's procedural scenery is
//     hidden. Pedestals/props are painted into the art, so slots add nothing but
//     an optional ground shadow (hall.shadow). This is what the editor authors.
//   theme: 'music'               — a hand-authored CSS preset (.theme-<id> in
//     style.css) declared in COLLECTIONS.themes, where `pedestals` picks
//     .spot-pedestal vs .spot-shadow. The two original halls still use this.
// Edit via the level-editor, not here.
// ============================================================

const MAIN_JOURNEY = 'cleaningxl';

const HALLS      = COLLECTIONS.halls;
const HALL_ITEMS = COLLECTIONS.items;

// Resolve a slot to its global level index — progress.stars and
// progress.seenInstruments are both keyed by index, not level id. -1 when the
// active journey has no level with that id.
function slotLevelIndex(slot) {
  if (typeof LEVELS === 'undefined') return -1;
  return LEVELS.findIndex(l => l.id === slot.levelId);
}

// The next level the player will play (0-based, clamped to the journey length).
function nextPlayableIndex() {
  const n = (typeof LEVELS !== 'undefined') ? LEVELS.length : 0;
  return Math.max(0, Math.min(progress.highestUnlocked || 0, n - 1));
}

// Hall that owns the next level to play. Levels past the last authored hall
// (11+ today) stay on the last hall the player has fully cleared past.
function currentHallIndex() {
  const idx = nextPlayableIndex();
  const owner = HALLS.findIndex(h => h.slots.some(s => slotLevelIndex(s) === idx));
  if (owner >= 0) return owner;
  let last = 0;
  HALLS.forEach((h, i) => {
    const passed = h.slots.every(s => { const li = slotLevelIndex(s); return li >= 0 && li < idx; });
    if (passed) last = i;
  });
  return last;
}

// Lowest hall holding an unlocked-but-not-yet-animated item, or -1 if none.
function pendingRevealHall() {
  if (!Array.isArray(progress.seenInstruments)) progress.seenInstruments = [];
  for (let h = 0; h < HALLS.length; h++) {
    for (const slot of HALLS[h].slots) {
      const li = slotLevelIndex(slot);
      if (li >= 0 && (progress.stars?.[li] || 0) > 0 && !progress.seenInstruments.includes(li)) return h;
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

// Size the spot layer to the backdrop's RENDERED rect. The backdrop uses
// `object-fit: cover`, so on a wider device the picture is cropped — anchoring
// spots to the scene box would slide every item off the scenery it was placed
// against (an iPad crops ~59% of a portrait backdrop's height). Matching the
// cover geometry keeps a slot's left/bottom/h relative to the PICTURE, so items
// stay glued to painted pedestals on every device. The layer also becomes the
// container-query container, so the `cqh`/`cqw` art sizes scale with the picture
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

  const theme = COLLECTIONS.themes[hall.theme] || {};

  // Backdrop: an image hall points at a file and hides the procedural scenery;
  // a CSS-theme hall keeps #room-bg and just swaps the .theme-<id> class.
  const scene = document.getElementById('room-scene');
  if (scene) {
    Object.keys(COLLECTIONS.themes).forEach(t => scene.classList.remove('theme-' + t));
    if (hall.theme) scene.classList.add('theme-' + hall.theme);
    scene.classList.toggle('has-backdrop', !!hall.backdrop);
  }
  const backdropEl = document.getElementById('room-backdrop');
  if (backdropEl) {
    if (hall.backdrop) {
      backdropEl.src = hall.backdrop;
      // Slots are authored against the picture, so re-anchor once it has
      // intrinsic dimensions (and again on every resize — see the listener).
      if (backdropEl.complete && backdropEl.naturalWidth) syncBackdropBox();
      else backdropEl.onload = syncBackdropBox;
    } else {
      backdropEl.removeAttribute('src');
      backdropEl.onload = null;
    }
    syncBackdropBox();
  }
  const titleEl = document.getElementById('room-title');
  if (titleEl) titleEl.textContent = hall.name;

  const wrap = document.getElementById('room-pedestals');
  if (!wrap) return;
  wrap.innerHTML = '';

  hall.slots.forEach(slot => {
    const item = HALL_ITEMS[slot.item];
    if (!item) return;                       // slot names art that isn't registered
    const levelIdx = slotLevelIndex(slot);
    const revealed = levelIdx >= 0 && (progress.stars?.[levelIdx] || 0) > 0;
    const isNew = revealed && opts.reveal && !progress.seenInstruments.includes(levelIdx);

    const spot = document.createElement('div');
    spot.className = 'room-spot ' + (revealed ? 'revealed' : 'empty') + (isNew ? ' new' : '');
    spot.style.left = slot.left + '%';
    spot.style.bottom = slot.bottom + '%';
    if (slot.pw) spot.style.setProperty('--pw', slot.pw + 'cqw');

    // Ornaments are per-hall for image backdrops (a photographic scene rarely
    // wants floating ♪), and per-theme for the hand-authored CSS halls.
    const showGlow  = hall.backdrop ? !!hall.glow  : theme.glow !== false;
    const showNotes = hall.backdrop ? !!hall.notes : !!theme.notes;

    let inner = '';
    if (revealed) {
      if (showGlow)  inner += `<div class="spot-glow"></div>`;
      if (showNotes) inner += `<div class="spot-notes"><span>♪</span><span>♫</span><span>♪</span></div>`;
      inner += `<img class="spot-instrument" src="${item.file}" alt="${item.name}" draggable="false" style="height:${slot.h}cqh">`;
    } else {
      inner += `<div class="spot-instrument spot-locked" style="height:${slot.h}cqh"><span>?</span></div>`;
    }
    // Image backdrops have their pedestals/scenery painted in, so a slot only
    // adds a ground shadow if the hall asks for one. CSS-theme halls still draw
    // a pedestal or a shadow per their theme.
    if (hall.backdrop) {
      if (hall.shadow) inner += `<div class="spot-shadow"></div>`;
    } else {
      inner += theme.pedestals ? `<div class="spot-pedestal"></div>` : `<div class="spot-shadow"></div>`;
    }
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
