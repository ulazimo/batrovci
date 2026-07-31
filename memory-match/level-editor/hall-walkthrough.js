// ============================================================
// HALL WALKTHROUGH — step through every hall and reveal it item by item.
//
// WHY THIS DRIVES THE REAL GAME AND NOT preview.html
// The Collections tab's preview is a deliberate *mirror* of the hall renderer:
// it re-implements the cover math and spot layout so you can drag a slot around
// while authoring. That makes it the wrong tool for checking how unlocking
// behaves, because the things that decide whether an item shows up at all live
// in the game and are not mirrored:
//   • `progress.stars[levelIdx] > 0`      — the reveal condition itself
//   • `progress.seenInstruments`          — first-time pop-in vs already there
//   • `progress.seenHall`                 — first-visit slide-in
//   • `slotLevelIndex()` returning -1     — a slot whose level does not exist
//   • `celebrateHallComplete()`           — the finished-hall banner
// So this tab loads `../index.html` in an iframe and drives the actual engine
// through those same entry points. Same origin, so we can reach straight into
// the frame; nothing here re-implements game behaviour, it only pokes it.
//
// WHAT IT WRITES
// Revealing an item means writing `progress.stars`. The frame is loaded with
// `?mmSandbox=1`, which `mmProgressKey()` in settings.js reads to store under
// `mm_progress_sandbox` instead of the player's real `mm_progress` — so this tool
// can reveal/hide/reset any hall freely and it never touches (or needs to back up)
// a real playthrough. It doesn't matter how many levels the real player has
// cleared; the sandbox starts and stays independent of that.
// ============================================================

const WT_FRAME_SRC = '../index.html?mmSandbox=1';

let wtHallIdx = 0;
let wtSimulate = false;          // treat slots whose level does not exist as revealable
let wtShowJumper = false;        // the game's own dev level-jumper is off by default here
const wtArtCache = new Map();    // art src -> measured {x0,x1,top} in % of the picture

// The pop-in is delayed by REVEAL_APPEAR_DELAY (300ms) and then animates; wait
// past both before re-reading state, or the list still shows the pre-reveal flags.
const WT_SETTLE_MS = 1100;

function wtEl(id) { return document.getElementById(id); }
function wtFrame() { return wtEl('wt-frame'); }
function wtWin() {
  const f = wtFrame();
  const w = f && f.contentWindow;
  // `renderHall` is the last thing we need that boot.js has run by; if it is
  // missing the frame is still loading (or failed) and every caller must bail.
  return (w && typeof w.renderHall === 'function' && w.COLLECTIONS) ? w : null;
}

// `progress` is `let progress = loadProgress()` in settings.js. A top-level
// `let` in a classic script is a LEXICAL global — it is not a property of
// `window` — so `frame.contentWindow.progress` is undefined even though the game
// uses it everywhere. (`COLLECTIONS`, `LEVELS` and every `function` declaration
// ARE on window, which is why only this one needs a bridge.) One eval inside the
// frame exposes it by reference, so mutating what we get back mutates the game's
// own object; we never rebind it.
function wtProg(win) {
  if (!win.__wt) win.eval('window.__wt = { get progress() { return progress; } };');
  return win.__wt.progress;
}

function wtStatus(msg, bad) {
  const el = wtEl('wt-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'wt-status' + (bad ? ' bad' : '');
}

// Persist the way the GAME persists. `saveProgress()` alone is not enough: boot()
// calls `restoreJourneySnapshot(style)` unconditionally, which replaces
// `progress.stars` with `progress.journeys[style].stars` — so a reveal written only
// to the top level silently vanishes on "Reload game" (and would make this tool
// disagree with what the player would actually see). `saveJourneySnapshot()` copies
// stars into the per-journey record first, which is exactly what applyProgression
// does. `seenInstruments` is deliberately NOT in that snapshot (CLAUDE.md §10), so
// saveProgress covers it.
function wtCommit(win) {
  if (typeof win.saveJourneySnapshot === 'function') win.saveJourneySnapshot();
  win.saveProgress();
}

// ------------------------------------------------------------
// SLOT STATE — read through the game's own resolver so this cannot drift.
// ------------------------------------------------------------
// A slot whose `levelId` has no level in the live journey resolves to -1 and can
// never be revealed by stars. That is correct game behaviour (art authored ahead
// of the levels stays invisible), but it makes three halls look broken in here,
// so "simulate" maps those slots onto synthetic indices past the real ones.
// Synthetic indices are only ever used as `progress.stars` keys for rendering —
// they are not playable levels, which is why the UI says so out loud.
function wtSyntheticIndex(win, slot) { return win.LEVELS.length + slot.levelId; }

function wtSlotState(win, slot) {
  // Always ask the UNPATCHED resolver what the game would really do. Reading the
  // patched one (see wtApplySimulation) makes every simulated slot look real, so
  // the UI stops distinguishing "this unlocks in the game" from "we are faking it".
  const resolve = win.__wtOrigSlotLevelIndex || win.slotLevelIndex;
  const real = resolve(slot);
  const idx = real >= 0 ? real : (wtSimulate ? wtSyntheticIndex(win, slot) : -1);
  const stars = idx >= 0 ? (wtProg(win).stars?.[idx] || 0) : 0;

  // The OTHER half of "unlocking an asset": the same piece is supposed to be the
  // art revealed behind the board while you clear that level. Hall slot and
  // boardArt entry are separate data, keyed by the same level id, so they drift —
  // and the failure is silent (you clear the level, the hall item appears, and the
  // board had nothing behind it). Only meaningful for a level that exists.
  const journey = wtProg(win).progressionStyle;
  const board = (win.COLLECTIONS.boardArt || {})[journey] || {};
  const entry = board[String(slot.levelId)];

  return {
    idx, real,
    simulated: real < 0 && idx >= 0,
    missing: real < 0,
    revealed: idx >= 0 && stars > 0,
    seen: idx >= 0 && Array.isArray(wtProg(win).seenInstruments)
          && wtProg(win).seenInstruments.includes(idx),
    noBoardArt: real >= 0 && !entry,
    boardArtItem: entry && entry.item !== slot.item ? entry.item : null,
  };
}

function wtApplySimulation(win) {
  // Patch the resolver in the frame, keeping the original so the toggle is
  // reversible without a reload.
  if (!win.__wtOrigSlotLevelIndex) win.__wtOrigSlotLevelIndex = win.slotLevelIndex;
  const orig = win.__wtOrigSlotLevelIndex;
  win.slotLevelIndex = wtSimulate
    ? function (slot) { const i = orig(slot); return i >= 0 ? i : wtSyntheticIndex(win, slot); }
    : orig;
}

// The game's own dev level-jumper (`#level-jumper`, built by buildLevelJumper() in
// home-room.js) is desktop-only chrome next to the phone frame — not part of what
// this tab is for, so it is hidden by default. `buildLevelJumper()` reuses the same
// node on every render rather than recreating it, so setting its inline style once
// per frame load is durable across hall changes; only a frame reload needs it
// re-applied, which the load handler does.
function wtSetJumperVisible(win, show) {
  const panel = win.document.getElementById('level-jumper');
  if (panel) panel.style.display = show ? '' : 'none';
}

// Three more bits of the real game's own chrome that don't belong in this tab,
// hidden the same way as the jumper above (poke the loaded frame's DOM, never
// touch the game's source itself — none of this should change the real game).
// All three are put up by `boot()`, which has finished by the time the iframe's
// `load` event fires, so doing this once per frame load is enough: nothing in
// this tab re-runs `boot()` or `showHome()`, and `renderHall()` touches none of
// them.
//   • `#test-mode-panel` — drawn on desktop widths whatever the test-mode state
//     is (it IS the master switch), so it sits next to the phone frame in here
//     for no reason; this tab has its own controls.
//   • the Play button's "JOURNEY IS COMPLETED!" state — `showHome()` sets it at
//     boot from whatever the sandbox save already holds, and revealing items in
//     here writes `progress.stars`, so once you have walked the last hall every
//     later load renders the finished-journey button. Nothing to do with hall
//     art, so it is put back to the plain PLAY look.
//   • `#username-prompt` — `maybeAskUsername()` covers the hall on any device
//     that has never set `mm_username`, which is exactly the reviewer's browser.
//     Dismissed WITHOUT `submitUsername()` on purpose: that key is NOT sandboxed
//     (only `progress` is, via `?mmSandbox=1`), so answering it in here would
//     name the real player. Skipping it also leaves the home FTUE stopped —
//     `boot()` already declined to start it while the prompt was up, and only
//     `submitUsername()` would kick it off — so the hall stays unobstructed.
function wtHideGameChrome(win) {
  const panel = win.document.getElementById('test-mode-panel');
  if (panel) panel.style.display = 'none';

  const playBtn = win.document.querySelector('.room-play-btn');
  const labelEl = win.document.querySelector('.room-play-label');
  const lvlEl = win.document.getElementById('room-play-level');
  if (playBtn) playBtn.classList.remove('done');
  if (labelEl) labelEl.textContent = 'PLAY';
  if (lvlEl) lvlEl.style.display = '';

  const nameEl = win.document.getElementById('username-prompt');
  if (nameEl) nameEl.classList.remove('active');
}

// ------------------------------------------------------------
// ART MEASUREMENT — the defect you cannot see by eye.
// ------------------------------------------------------------
// A `kind: 'layer'` object is baked into its canvas at a fixed position, and the
// backdrop is bottom-anchored `cover`, so a narrow screen trims the sides and a
// wide one trims the top. An object painted in the trimmed band is clipped and
// the only fix is regenerating the art. Scanning the layer's alpha gives its
// real extent, which is then checked against the crop the CURRENT device preset
// actually applies. (Feather/shadow tails are ignored below WT_ALPHA_FLOOR so a
// soft shadow reaching the frame edge does not read as a clipped object.)
const WT_ALPHA_FLOOR = 40;
const WT_SCAN_W = 288;             // half a backdrop's width is plenty for a bbox

function wtMeasureArt(src) {
  if (wtArtCache.has(src)) return Promise.resolve(wtArtCache.get(src));
  const p = new Promise(resolve => {
    const im = new Image();
    im.onload = () => {
      const w = WT_SCAN_W, h = Math.max(1, Math.round(WT_SCAN_W * im.naturalHeight / im.naturalWidth));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(im, 0, 0, w, h);
      let data;
      try { data = ctx.getImageData(0, 0, w, h).data; }
      catch (e) { resolve(null); return; }          // tainted canvas: skip silently
      let x0 = w, x1 = -1, yTop = h;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] < WT_ALPHA_FLOOR) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < yTop) yTop = y;
        }
      }
      const out = x1 < 0 ? null : {
        x0: x0 / w * 100, x1: (x1 + 1) / w * 100, top: (h - yTop) / h * 100,
      };
      wtArtCache.set(src, out);
      resolve(out);
    };
    im.onerror = () => { wtArtCache.set(src, null); resolve(null); };
    im.src = src;
  });
  return p;
}

// The crop the frame is applying right now, read from what syncBackdropBox()
// computed rather than re-deriving it — the cover rect it writes inline IS the
// picture, and comparing that to the scene box gives the real trim. (Measuring
// getBoundingClientRect instead gives nonsense, because the phone bezel is
// scaled: that mistake is what produced the false "the device switcher cannot
// test the crop" note in art/tools/RUNLOG.md.)
function wtCrop() {
  const win = wtWin();
  if (!win) return null;
  const scene = win.document.getElementById('room-scene');
  const wrap = win.document.getElementById('room-pedestals');
  if (!scene || !wrap) return null;
  const cw = parseFloat(wrap.style.width), ch = parseFloat(wrap.style.height);
  if (!(cw > 0 && ch > 0)) return null;          // theme hall (no backdrop): nothing cropped
  const sw = scene.clientWidth, sh = scene.clientHeight;
  return {
    side: Math.max(0, (1 - sw / cw) / 2 * 100),  // % trimmed off EACH side
    top: Math.max(0, (1 - sh / ch) * 100),       // % trimmed off the top
  };
}

// ------------------------------------------------------------
// HALL ORDER — display/step through halls by the levels they cover, not by
// their position in COLLECTIONS.halls. Halls are appended to that array as
// they're authored (new halls go on the end), so a hall backfilled into an
// earlier gap — e.g. Game Room, added later to cover levels 44-51 — sits
// AFTER halls covering levels into the 80s. Walking the raw array made the
// tab jump backwards in level order for no visible reason. This only
// reorders how the list is walked/displayed; `data-hall`/`wtHallIdx` still
// index the real `COLLECTIONS.halls` array everywhere else.
function wtHallOrderIndices(win) {
  const halls = win.COLLECTIONS.halls || [];
  return halls
    .map((h, i) => ({ i, min: Math.min(...(h.slots || []).map(s => s.levelId), Infinity) }))
    .sort((a, b) => a.min - b.min)
    .map(x => x.i);
}

// ------------------------------------------------------------
// RENDER — hall list + slot list
// ------------------------------------------------------------
function wtRender() {
  const win = wtWin();
  const hallsEl = wtEl('wt-halls');
  const slotsEl = wtEl('wt-slots');
  if (!hallsEl || !slotsEl) return;
  if (!win) { hallsEl.innerHTML = '<div class="wt-muted">loading the game…</div>'; slotsEl.innerHTML = ''; return; }

  const halls = win.COLLECTIONS.halls || [];
  wtHallIdx = Math.max(0, Math.min(wtHallIdx, halls.length - 1));

  // Which journey is loaded, and how long it is. This is not decoration: whether a
  // slot can reveal at all depends entirely on whether its `levelId` exists in the
  // live journey, and that number MOVES while levels are being authored. Halls
  // covering levels 40-54 read as "3 halls with no levels" at 35 levels and
  // "2 halls fully live" at 50. Without this line the hall list looks broken or
  // fixed for no visible reason.
  const jEl = wtEl('wt-journey');
  if (jEl) {
    const ids = win.LEVELS || [];
    const slots = halls.reduce((n, h) => n + (h.slots || []).length, 0);
    const dead = halls.reduce((n, h) =>
      n + (h.slots || []).filter(s => (win.__wtOrigSlotLevelIndex || win.slotLevelIndex)(s) < 0).length, 0);
    jEl.textContent = `journey ${wtProg(win).progressionStyle || '—'} · ${ids.length} levels`
      + (ids.length ? ` (id ${ids[0].id}–${ids[ids.length - 1].id})` : '')
      + ` · ${slots - dead}/${slots} hall slots have a level`;
  }

  const order = wtHallOrderIndices(win);
  hallsEl.innerHTML = order.map((i, pos) => {
    const h = halls[i];
    const states = (h.slots || []).map(s => wtSlotState(win, s));
    const shown = states.filter(s => s.revealed).length;
    const dead = states.filter(s => s.missing).length;
    const noArt = states.filter(s => s.noBoardArt).length;
    const levels = (h.slots || []).map(s => s.levelId);
    const range = levels.length ? `${Math.min(...levels)}–${Math.max(...levels)}` : '—';
    return `<button class="wt-hall${i === wtHallIdx ? ' active' : ''}" data-hall="${i}">
      <span class="wt-hall-name">${pos + 1}. ${h.name} <span class="wt-muted">(lvl ${range})</span></span>
      <span class="wt-hall-meta">${shown}/${states.length}${dead ? ` · ${dead} no level` : ''}${noArt ? ` · ${noArt} no board art` : ''}</span>
    </button>`;
  }).join('');
  hallsEl.querySelectorAll('.wt-hall').forEach(b =>
    b.addEventListener('click', () => wtGoHall(+b.dataset.hall)));

  const hall = halls[wtHallIdx];
  if (!hall) { slotsEl.innerHTML = ''; return; }
  const crop = wtCrop();

  slotsEl.innerHTML = `
    <div class="wt-hall-head">
      <b>${hall.name}</b>
      <span class="wt-muted">${hall.backdrop || 'theme: ' + (hall.theme || '—')}</span>
      ${crop ? `<span class="wt-crop">crop now: ${crop.side.toFixed(1)}% each side · ${crop.top.toFixed(1)}% top</span>` : ''}
    </div>` +
    (hall.slots || []).map((slot, si) => {
      const st = wtSlotState(win, slot);
      const item = win.COLLECTIONS.items[slot.item];
      const tag = st.revealed ? '<span class="wt-dot on"></span>revealed'
                : st.missing && !wtSimulate ? '<span class="wt-dot dead"></span>no such level'
                : '<span class="wt-dot"></span>hidden';
      return `<div class="wt-slot${st.revealed ? ' revealed' : ''}" data-slot="${si}">
        <div class="wt-slot-main">
          <b>${slot.item}</b>
          <span class="wt-muted">${item ? item.name : '⚠ not in registry'}</span>
          <span class="wt-tags">${slot.kind === 'layer' ? '<span class="wt-chip">layer</span>' : '<span class="wt-chip">placed</span>'}
            ${st.simulated ? '<span class="wt-chip sim">simulated</span>' : ''}
            ${st.seen ? '<span class="wt-chip">seen</span>' : ''}
            ${st.noBoardArt ? '<span class="wt-chip warn">no board art</span>' : ''}
            ${st.boardArtItem ? `<span class="wt-chip warn">board art: ${st.boardArtItem}</span>` : ''}</span>
        </div>
        <div class="wt-slot-meta">
          <span>level ${slot.levelId}</span>
          <span>idx ${st.real >= 0 ? st.real : '—'}</span>
          <span class="wt-state">${tag}</span>
          <span class="wt-fit" data-fit="${si}"></span>
        </div>
      </div>`;
    }).join('');

  slotsEl.querySelectorAll('.wt-slot').forEach(row =>
    row.addEventListener('click', () => wtToggleSlot(+row.dataset.slot)));

  wtFillFit(win, hall, crop);
  wtSyncDeviceButtons(win);
}

// Per-slot crop verdict, filled in asynchronously (each measurement is one
// canvas scan, cached, so switching halls back and forth is free).
function wtFillFit(win, hall, crop) {
  (hall.slots || []).forEach((slot, si) => {
    const cell = document.querySelector(`.wt-fit[data-fit="${si}"]`);
    if (!cell) return;
    const item = win.COLLECTIONS.items[slot.item];
    if (!item) { cell.textContent = ''; return; }
    if (slot.kind !== 'layer') {
      // A placed item's geometry is authored, not baked — the Collections tab
      // owns it. Only the top matters here, against the same ceiling.
      const top = (slot.bottom || 0) + (slot.h || 0);
      const bad = crop && top > 100 - crop.top;
      cell.className = 'wt-fit' + (bad ? ' bad' : '');
      cell.textContent = `top ${top.toFixed(1).replace(/\.0$/, '')}%` + (bad ? ' ⚠ above the crop' : '');
      return;
    }
    const rel = item.layer || item.file;
    if (!rel) { cell.textContent = ''; return; }
    wtMeasureArt('../' + rel).then(m => {
      const live = document.querySelector(`.wt-fit[data-fit="${si}"]`);
      if (!live) return;                      // hall changed while we measured
      if (!m) { live.textContent = ''; return; }
      const flags = [];
      if (crop) {
        if (m.x0 < crop.side) flags.push(`clipped left (x ${m.x0.toFixed(0)}%)`);
        if (m.x1 > 100 - crop.side) flags.push(`clipped right (x ${m.x1.toFixed(0)}%)`);
        if (m.top > 100 - crop.top) flags.push(`clipped top (${m.top.toFixed(0)}%)`);
      }
      live.className = 'wt-fit' + (flags.length ? ' bad' : ' ok');
      live.textContent = `x ${m.x0.toFixed(0)}–${m.x1.toFixed(0)}% · top ${m.top.toFixed(0)}%`
        + (flags.length ? ' ⚠ ' + flags.join(', ') : '');
    });
  });
}

// ------------------------------------------------------------
// ACTIONS
// ------------------------------------------------------------
function wtGoHall(i, dir) {
  const win = wtWin();
  if (!win) return;
  const halls = win.COLLECTIONS.halls || [];
  if (i < 0 || i >= halls.length) return;
  wtHallIdx = i;
  win.renderHall(i, dir ? { slideDir: dir } : {});
  wtRender();
}

function wtStep(delta) {
  const win = wtWin();
  if (!win) return;
  const order = wtHallOrderIndices(win);
  const pos = order.indexOf(wtHallIdx);
  const next = order[(pos < 0 ? 0 : pos) + delta];
  if (next === undefined) return;
  wtGoHall(next, delta > 0 ? 1 : -1);
}

// Reveal ONE item, the way the game does it after a win: set the star, make sure
// the index is not marked seen (so the pop-in actually plays), then re-render
// with `reveal: true`. The engine schedules the appearance and marks it seen.
function wtRevealNext() {
  const win = wtWin();
  if (!win) return;
  const hall = win.COLLECTIONS.halls[wtHallIdx];
  if (!hall) return;
  const next = (hall.slots || []).map(s => wtSlotState(win, s)).findIndex(s => s.idx >= 0 && !s.revealed);
  if (next < 0) {
    const anyMissing = (hall.slots || []).some(s => wtSlotState(win, s).missing);
    wtStatus(anyMissing
      ? 'every revealable item is shown — the rest have no level in this journey (try “simulate”)'
      : 'this hall is fully revealed');
    return;
  }
  const st = wtSlotState(win, hall.slots[next]);
  if (!Array.isArray(wtProg(win).stars)) wtProg(win).stars = [];
  wtProg(win).stars[st.idx] = 3;
  wtProg(win).seenInstruments = (wtProg(win).seenInstruments || []).filter(i => i !== st.idx);
  wtCommit(win);
  win.renderHall(wtHallIdx, { reveal: true });
  wtStatus(`revealing ${hall.slots[next].item} (level ${hall.slots[next].levelId}, stars[${st.idx}] = 3)`);
  setTimeout(wtRender, WT_SETTLE_MS);
}

function wtRevealAll() {
  const win = wtWin();
  if (!win) return;
  const hall = win.COLLECTIONS.halls[wtHallIdx];
  if (!hall) return;
  if (!Array.isArray(wtProg(win).stars)) wtProg(win).stars = [];
  const idxs = (hall.slots || []).map(s => wtSlotState(win, s)).filter(s => s.idx >= 0).map(s => s.idx);
  idxs.forEach(i => { wtProg(win).stars[i] = 3; });
  wtProg(win).seenInstruments = (wtProg(win).seenInstruments || []).filter(i => !idxs.includes(i));
  wtCommit(win);
  win.renderHall(wtHallIdx, { reveal: true });
  wtStatus(`revealed ${idxs.length} item(s) at once`);
  setTimeout(wtRender, WT_SETTLE_MS);
}

function wtHideHall() {
  const win = wtWin();
  if (!win) return;
  const hall = win.COLLECTIONS.halls[wtHallIdx];
  if (!hall) return;
  const idxs = (hall.slots || []).map(s => wtSlotState(win, s)).filter(s => s.idx >= 0).map(s => s.idx);
  idxs.forEach(i => { if (Array.isArray(wtProg(win).stars)) wtProg(win).stars[i] = 0; });
  wtProg(win).seenInstruments = (wtProg(win).seenInstruments || []).filter(i => !idxs.includes(i));
  wtCommit(win);
  win.renderHall(wtHallIdx);
  wtStatus('hall reset to empty — “Reveal next” will pop each item in again');
  wtRender();
}

// Click a row to flip just that item, which is how you check one specific piece
// of art (and the only way to reveal out of order).
function wtToggleSlot(si) {
  const win = wtWin();
  if (!win) return;
  const hall = win.COLLECTIONS.halls[wtHallIdx];
  const slot = hall && hall.slots[si];
  if (!slot) return;
  const st = wtSlotState(win, slot);
  if (st.idx < 0) {
    wtStatus(`${slot.item}: level ${slot.levelId} does not exist in this journey — turn on “simulate” to force it`, true);
    return;
  }
  if (!Array.isArray(wtProg(win).stars)) wtProg(win).stars = [];
  if (st.revealed) {
    wtProg(win).stars[st.idx] = 0;
    wtProg(win).seenInstruments = (wtProg(win).seenInstruments || []).filter(i => i !== st.idx);
    wtCommit(win);
    win.renderHall(wtHallIdx);
    wtStatus(`hid ${slot.item}`);
    wtRender();
  } else {
    wtProg(win).stars[st.idx] = 3;
    wtProg(win).seenInstruments = (wtProg(win).seenInstruments || []).filter(i => i !== st.idx);
    wtCommit(win);
    win.renderHall(wtHallIdx, { reveal: true });
    wtStatus(`revealing ${slot.item}`);
    setTimeout(wtRender, WT_SETTLE_MS);
  }
}

// Replay the pop-in for everything currently revealed: drop the seen flags and
// re-render. Useful for watching the animation without hiding/showing by hand.
function wtReplay() {
  const win = wtWin();
  if (!win) return;
  const hall = win.COLLECTIONS.halls[wtHallIdx];
  if (!hall) return;
  const idxs = (hall.slots || []).map(s => wtSlotState(win, s)).filter(s => s.revealed).map(s => s.idx);
  if (!idxs.length) { wtStatus('nothing revealed to replay'); return; }
  wtProg(win).seenInstruments = (wtProg(win).seenInstruments || []).filter(i => !idxs.includes(i));
  wtCommit(win);
  win.renderHall(wtHallIdx, { reveal: true });
  wtStatus(`replaying ${idxs.length} reveal(s)`);
  setTimeout(wtRender, WT_SETTLE_MS);
}

// The finished-hall celebration is its own beat in the real flow; trigger it
// directly rather than making someone win a level to see it.
function wtCelebrate() {
  const win = wtWin();
  if (!win || typeof win.celebrateHallComplete !== 'function') { wtStatus('celebrateHallComplete not available', true); return; }
  win.celebrateHallComplete(wtHallIdx);
  wtStatus('hall-complete banner shown');
}

function wtResetAll() {
  const win = wtWin();
  if (!win) return;
  if (!confirm('Clear stars, seen-flags and hall progress for EVERY hall in the sandbox?')) return;
  wtProg(win).stars = [];
  wtProg(win).seenInstruments = [];
  wtProg(win).seenHall = null;
  wtCommit(win);
  win.renderHall(wtHallIdx);
  wtStatus('all halls cleared');
  wtRender();
}

// THE IFRAME IS PART OF THE MEASUREMENT — size it to the preset.
// Inside an iframe, the game's `100dvh` / `100vw` are the IFRAME's box, and
// #device-frame is `height: min(--device-h, 100dvh - 72px); max-width: 100vw - 16px`.
// So a frame that is too short or too narrow silently overrides the preset's
// aspect ratio, and the crop it reports is not the crop that device applies —
// an iPad in an 880x880 frame reported 13.9% off the top (really 18.1%) and then
// 10.6% off the SIDES, which the iPad does not trim at all.
// Height must clear --device-h + the switcher row; width must clear the bezel AND
// stay above 520px, because at 520 the game's own media query drops the bezel and
// goes full-bleed — a different (real, but not preset-driven) geometry.
const WT_DEVICE_H = { ip15pro: 852, galaxys24p: 832, pixel8: 915, ipad: 1180 };
const WT_FRAME_W = { ip15pro: 560, galaxys24p: 560, pixel8: 560, ipad: 880 };

function wtFitFrameTo(id) {
  const f = wtFrame();
  if (!f) return;
  f.style.height = ((WT_DEVICE_H[id] || 852) + 80) + 'px';
  f.style.width = (WT_FRAME_W[id] || 560) + 'px';
}

// Recompute the cover rect in the frame and redraw our readout. `syncBackdropBox`
// is the game's own function and is idempotent, so calling it costs nothing.
function wtRefreshGeometry() {
  const win = wtWin();
  if (!win) return;
  if (typeof win.syncBackdropBox === 'function') win.syncBackdropBox();
  wtRender();
}

function wtSetDevice(id) {
  const win = wtWin();
  if (!win || typeof win.setDevice !== 'function') return;
  win.setDevice(id);
  wtFitFrameTo(id);
  // Resizing the iframe relayouts the CHILD document on its own schedule, so this
  // cannot be read back synchronously (nor on a parent-side rAF — that fires while
  // the child is still on the old geometry and the crop line renders stale).
  // Two staggered reads: the first is enough in practice, the second covers a slow
  // relayout. wtObserveScene() would cover this too, but only in a foregrounded
  // window — see the note there — so this path does not depend on it.
  setTimeout(wtRefreshGeometry, 60);
  setTimeout(wtRefreshGeometry, 250);
}

// Re-render whenever the game's scene box changes size — a device switch here, a
// window resize, or the user clicking the game's OWN device buttons inside the
// frame.
//
// The observer has to be created INSIDE the frame. A ResizeObserver constructed
// in this document and pointed at an element in the child's document simply never
// fires (observation is driven by the observer's own document's rendering
// lifecycle, so cross-realm observing silently does nothing) — measured: the
// child's #room-scene went 796px → 369px and the callback never ran, leaving a
// stale crop line that read 18.3% off the top for an iPhone. So we build it in
// the child's realm and have it call back out.
//
// This is a NICE-TO-HAVE, not the main path: ResizeObserver delivery rides the
// rendering lifecycle, so it does not fire in a frame the browser is not painting
// (it never fired under automation here, which is also why the game's own
// syncBackdropBox observer was wrongly suspected). Everything this tool changes
// itself refreshes explicitly via wtRefreshGeometry(); this only catches resizes
// it did not cause — a window resize, or the game's own device buttons.
function wtObserveScene(win) {
  if (win.__wtSceneObs) return;
  win.wtOnSceneResize = wtRender;         // the child calls this on every resize
  win.eval(`(function () {
    if (window.__wtSceneObs) return;
    var scene = document.getElementById('room-scene');
    if (!scene || typeof ResizeObserver === 'undefined') return;
    window.__wtSceneObs = new ResizeObserver(function () {
      if (typeof syncBackdropBox === 'function') syncBackdropBox();
      if (typeof window.wtOnSceneResize === 'function') window.wtOnSceneResize();
    });
    window.__wtSceneObs.observe(scene);
  })();`);
}

function wtSyncDeviceButtons(win) {
  let active = null;
  try { active = win.localStorage.getItem('mm_device'); } catch (e) {}
  document.querySelectorAll('#wt-devices .wt-dev').forEach(b =>
    b.classList.toggle('active', b.dataset.device === (active || 'ip15pro')));
}

// ------------------------------------------------------------
// WIRING
// ------------------------------------------------------------
function wtInit() {
  const f = wtFrame();
  if (!f) return;

  f.addEventListener('load', () => {
    // boot.js runs on DOMContentLoaded inside the frame; poll briefly for the
    // globals rather than guessing a delay.
    let tries = 0;
    (function wait() {
      if (wtWin()) {
        const win = wtWin();
        wtApplySimulation(win);
        wtSetJumperVisible(win, wtShowJumper);
        wtHideGameChrome(win);
        let boot = null;
        try { boot = win.localStorage.getItem('mm_device'); } catch (e) {}
        wtFitFrameTo(WT_DEVICE_H[boot] ? boot : 'ip15pro');
        wtObserveScene(win);          // keeps the crop line honest from here on
        wtStatus('game loaded — pick a hall, then “Reveal next”');
        wtRender();
      } else if (tries++ < 60) setTimeout(wait, 100);
      else wtStatus('the game frame did not finish loading', true);
    })();
  });

  wtEl('wt-prev').addEventListener('click', () => wtStep(-1));
  wtEl('wt-next').addEventListener('click', () => wtStep(1));
  wtEl('wt-reveal').addEventListener('click', wtRevealNext);
  wtEl('wt-reveal-all').addEventListener('click', wtRevealAll);
  wtEl('wt-hide').addEventListener('click', wtHideHall);
  wtEl('wt-replay').addEventListener('click', wtReplay);
  wtEl('wt-celebrate').addEventListener('click', wtCelebrate);
  wtEl('wt-reset-all').addEventListener('click', wtResetAll);
  wtEl('wt-reload').addEventListener('click', () => {
    wtStatus('reloading the game frame…');
    const fr = wtFrame(); if (fr) fr.src = WT_FRAME_SRC;
  });
  wtEl('wt-simulate').addEventListener('change', e => {
    wtSimulate = e.target.checked;
    const win = wtWin();
    if (win) { wtApplySimulation(win); win.renderHall(wtHallIdx); }
    wtStatus(wtSimulate
      ? 'simulating slots whose level does not exist — these are NOT playable levels, art only'
      : 'showing real unlock state only');
    wtRender();
  });
  wtEl('wt-show-jumper').addEventListener('change', e => {
    wtShowJumper = e.target.checked;
    const win = wtWin();
    if (win) wtSetJumperVisible(win, wtShowJumper);
  });
  document.querySelectorAll('#wt-devices .wt-dev').forEach(b =>
    b.addEventListener('click', () => wtSetDevice(b.dataset.device)));

  // The frame is only loaded when the tab is first opened — the game boots
  // audio/Firebase and there is no reason to pay for that while editing levels.
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    const mine = btn.dataset.tab === 'walkthrough';
    const bar = document.querySelector('.top-bar-right');
    // Those buttons load/save LEVEL json and would be a footgun here.
    if (bar) bar.style.visibility = mine ? 'hidden' : '';
    if (!mine) return;
    if (!f.getAttribute('src')) f.src = WT_FRAME_SRC;
    else if (wtWin()) wtRender();
  }));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wtInit);
else wtInit();
