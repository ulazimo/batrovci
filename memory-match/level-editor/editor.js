// ============================================================
// STATE
// ============================================================
let levels = [];
let selectedLevelIndex = -1;
let activeTool = 'normal';
const MAX_LOCK_LAYERS = 4; // Locked tool cycles 1→…→MAX, then clears.
let stackValue = 2;        // Stack tool stamps this many cards per tile (2–MAX_STACK).
let backEffectValue = 'row'; // Back Effect tool stamps this reveal pattern (cycled with ‹ ›).
let colorValue = 'red';    // Color tool stamps this fixed card colour (cycled with ‹ ›).
let currentLayer = 0;      // Editing layer: 0 = top (on-board) cards; -1, -2, … = cards beneath
                           // that emerge later from Stacks / Elevators (authored in `lvl.beneath`).
let undoStack = [];
let redoStack = [];
let loadedFileName = 'levels';
let loadedProgressionFileName = 'progression';

// ============================================================
// TOOLS
// ============================================================
const TOOLS = [
  { id: 'normal',   icon: '🟦', name: 'Normal',   desc: 'Regular card cell' },
  { id: 'color',    icon: '🎨', name: 'Color',    desc: 'Paint a FIXED card colour on any tile (coexists with locks/ice/color-lock). Pick the colour with ‹ ›; click again to remove.' },
  { id: 'locked',   icon: '🔒', name: 'Locked',   desc: 'Click to add lock layers (1–4, then clears)' },
  { id: 'disabled', icon: '<img src="../blocks/disabled.png" style="width:32px;height:32px;border-radius:4px;opacity:.7">', name: 'Disabled', desc: 'Empty cell — no card, no interaction' },
  { id: 'ordered',  icon: '🔢', name: 'Ordered',  desc: 'Place numbered positions for orderedCards goal' },
  { id: 'stack',    icon: '🃏', name: 'Stack',    desc: 'Stamp a pile of cards on a tile (set the size with − / +)' },
  { id: 'elevator', icon: '🛗', name: 'Elevator', desc: 'Paint batch-refill areas — adjacent cells form one area. Set each area\'s refills in the list below. Can share a tile with a stack.' },
  { id: 'ice',      icon: '🧊', name: 'Ice',      desc: 'Paint ice areas — cards frozen until enough cards are collected. Set each area\'s melt count in the list below. Can share a tile with a stack.' },
  { id: 'colorlock', icon: '🔐', name: 'Color Lock', desc: 'Paint color-lock areas — cards locked until enough of a chosen colour is collected. Set each area\'s colour + count in the list below. Can share a tile with a stack.' },
  { id: 'backeffect', icon: '✴️', name: 'Back Effect', desc: 'Stamp a reveal effect on a card — it fires when that card is collected. Pick the pattern with ‹ ›; click again to remove.' },
  { id: 'eraser',   icon: '🧹', name: 'Eraser',   desc: 'Clear cell to normal' },
];
const MAX_STACK = 10;

// Back-of-card reveal effects (mirrors BACK_EFFECTS in the game's specials.js). Stored on the
// level as `backEffects: [[r,c,id]…]`; each fires its reveal pattern when the card is collected.
const BACK_EFFECTS = [
  { id: 'row',    icon: '↔️', name: 'Row' },
  { id: 'column', icon: '↕️', name: 'Column' },
  { id: 'cross',  icon: '➕', name: 'Cross' },
  { id: 'circle', icon: '⭕', name: 'Circle' },
  { id: 'star',   icon: '✴️', name: 'Star' },
];
function beIcon(id) { const b = BACK_EFFECTS.find(x => x.id === id); return b ? b.icon : '✨'; }
function beName(id) { const b = BACK_EFFECTS.find(x => x.id === id); return b ? b.name : id; }

// ============================================================
// BENEATH LAYERS — cards that emerge later from Stacks/Elevators can carry an authored
// back-effect (stored in `lvl.beneath: [{r,c,layer,backEffect}]`, layer < 0). A Stack of N
// exposes layers -1…-(N-1); an Elevator area with R refills exposes -1…-R.
// ============================================================
function stackSizeAt(lvl, row, col) {
  const s = (lvl.stacks || []).find(([r, c]) => r === row && c === col);
  return s ? (s[2] || 2) : 0;
}
function elevatorRefillsAt(lvl, row, col) {
  const a = elevatorAreaAt(lvl, row, col);
  return a ? Math.max(0, a.refills || 0) : 0;
}
// How many cards a tile produces below the top: a stack of N gives N-1, an elevator gives
// its refill count. A tile that is both uses the deeper of the two.
function tileBeneathDepth(lvl, row, col) {
  return Math.max(Math.max(0, stackSizeAt(lvl, row, col) - 1), elevatorRefillsAt(lvl, row, col));
}
// Deepest beneath layer available anywhere on the level (as a positive count). 0 → no beneath.
function maxBeneathDepth(lvl) {
  let d = 0;
  for (let r = 0; r < lvl.rows; r++) for (let c = 0; c < lvl.cols; c++) d = Math.max(d, tileBeneathDepth(lvl, r, c));
  return d;
}
// Does (row,col) hold a card at this (negative) layer?
function tileHasCardAtLayer(lvl, row, col, layer) {
  if (layer >= 0) return true;
  return tileBeneathDepth(lvl, row, col) >= -layer;
}
function beneathAt(lvl, row, col, layer) {
  return (lvl.beneath || []).find(b => b.r === row && b.c === col && b.layer === layer);
}
// Drop beneath entries whose tile no longer produces a card at that layer (stack shrank,
// elevator refills dropped, tile changed type, or out of bounds).
function pruneBeneath(lvl) {
  if (!Array.isArray(lvl.beneath)) { lvl.beneath = []; return; }
  lvl.beneath = lvl.beneath.filter(b =>
    b.r >= 0 && b.r < lvl.rows && b.c >= 0 && b.c < lvl.cols &&
    b.layer < 0 && tileHasCardAtLayer(lvl, b.r, b.c, b.layer));
}
// Keep currentLayer within the level's available beneath range.
function clampCurrentLayer(lvl) {
  const min = -maxBeneathDepth(lvl);
  if (currentLayer > 0) currentLayer = 0;
  if (currentLayer < min) currentLayer = min;
}

const GOAL_TYPES = [
  { id: 'score',          name: 'Score Target',     icon: '🎯' },
  { id: 'colorCollect',   name: 'Color Collect',    icon: '🎨' },
  { id: 'specificCombos',  name: 'Specific Combos',  icon: '🔗' },
  { id: 'markedCards',    name: 'Marked Cards',     icon: '⭐' },
  { id: 'orderedCards',   name: 'Ordered Cards',    icon: '🔢' },
  { id: 'colorAvoid',     name: 'Color Avoid',      icon: '🚫' },
  { id: 'rowCoverage',    name: 'Row Coverage',     icon: '↔️' },
  { id: 'colCoverage',    name: 'Column Coverage',  icon: '↕️' },
  { id: 'breakLocks',     name: 'Break Locks',      icon: '🔓' },
  { id: 'clearAll',       name: 'Clear Board',      icon: '🧹' },
];
const ALL_COLORS = ['red', 'green', 'blue', 'yellow', 'orange', 'purple'];

// ============================================================
// ELEVATOR AREAS — independent batch-refill zones, each with its own refill count.
// Stored on the level as `elevators: [{ cells:[[r,c]…], refills }]`. Cells that are
// orthogonally adjacent belong to the same area; painting maintains that grouping.
// ============================================================
const ELEV_HUES = ['#3fd0c9', '#f5a623', '#e879f9', '#5b9bff', '#4ade80', '#f87171', '#c084fc', '#facc15'];
const ELEV_DEFAULT_REFILLS = 3;

function elevatorAreaAt(lvl, row, col) {
  return (lvl.elevators || []).find(a => a.cells.some(([r, c]) => r === row && c === col));
}

// Split a flat cell list into orthogonally-connected components.
function connectedComponents(cells) {
  const key = ([r, c]) => `${r},${c}`;
  const set = new Set(cells.map(key));
  const seen = new Set();
  const comps = [];
  cells.forEach(cell => {
    if (seen.has(key(cell))) return;
    const comp = [];
    const stack = [cell];
    seen.add(key(cell));
    while (stack.length) {
      const [r, c] = stack.pop();
      comp.push([r, c]);
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
        const nk = `${r + dr},${c + dc}`;
        if (set.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push([r + dr, c + dc]); }
      });
    }
    comps.push(comp);
  });
  return comps;
}

// Add (row,col) to the elevator: join the adjacent area, merge several if it bridges them,
// or start a fresh area (with the default refill count) if it touches none.
function addElevatorCell(lvl, row, col) {
  if (!lvl.elevators) lvl.elevators = [];
  const adjacent = lvl.elevators.filter(a =>
    a.cells.some(([r, c]) => Math.abs(r - row) + Math.abs(c - col) === 1));
  if (adjacent.length === 0) {
    lvl.elevators.push({ cells: [[row, col]], refills: ELEV_DEFAULT_REFILLS });
    return;
  }
  const target = adjacent[0];
  for (let k = 1; k < adjacent.length; k++) target.cells.push(...adjacent[k].cells);
  lvl.elevators = lvl.elevators.filter(a => a === target || !adjacent.includes(a));
  target.cells.push([row, col]);
}

// Remove (row,col); drop the area if empty, or re-split it if the removal disconnected it.
function removeElevatorCell(lvl, row, col) {
  const area = elevatorAreaAt(lvl, row, col);
  if (!area) return;
  area.cells = area.cells.filter(([r, c]) => !(r === row && c === col));
  const others = lvl.elevators.filter(a => a !== area);
  const rebuilt = connectedComponents(area.cells).map(cells => ({ cells, refills: area.refills }));
  lvl.elevators = [...others, ...rebuilt];
}

// After a row/column edit, re-derive connected areas (each keeps its parent's refills) and
// drop any that became empty.
function resplitElevators(lvl) {
  if (!Array.isArray(lvl.elevators)) return;
  const rebuilt = [];
  lvl.elevators.forEach(a => {
    const cells = (a.cells || []).filter(Boolean);
    connectedComponents(cells).forEach(comp => { if (comp.length) rebuilt.push({ cells: comp, refills: a.refills }); });
  });
  lvl.elevators = rebuilt;
}

// ============================================================
// ICE AREAS — frozen-card zones stored as `ice: [{ cells:[[r,c]…], threshold }]`.
// `threshold` = number of cards that must be collected in the level to melt the area.
// Same adjacency-grouping model as elevators.
// ============================================================
const ICE_DEFAULT_THRESHOLD = 5;

function iceAreaAt(lvl, row, col) {
  return (lvl.ice || []).find(a => a.cells.some(([r, c]) => r === row && c === col));
}
function addIceCell(lvl, row, col) {
  if (!lvl.ice) lvl.ice = [];
  const adjacent = lvl.ice.filter(a =>
    a.cells.some(([r, c]) => Math.abs(r - row) + Math.abs(c - col) === 1));
  if (adjacent.length === 0) {
    lvl.ice.push({ cells: [[row, col]], threshold: ICE_DEFAULT_THRESHOLD });
    return;
  }
  const target = adjacent[0];
  for (let k = 1; k < adjacent.length; k++) target.cells.push(...adjacent[k].cells);
  lvl.ice = lvl.ice.filter(a => a === target || !adjacent.includes(a));
  target.cells.push([row, col]);
}
function removeIceCell(lvl, row, col) {
  const area = iceAreaAt(lvl, row, col);
  if (!area) return;
  area.cells = area.cells.filter(([r, c]) => !(r === row && c === col));
  const others = lvl.ice.filter(a => a !== area);
  const rebuilt = connectedComponents(area.cells).map(cells => ({ cells, threshold: area.threshold }));
  lvl.ice = [...others, ...rebuilt];
}
function resplitIce(lvl) {
  if (!Array.isArray(lvl.ice)) return;
  const rebuilt = [];
  lvl.ice.forEach(a => {
    const cells = (a.cells || []).filter(Boolean);
    connectedComponents(cells).forEach(comp => { if (comp.length) rebuilt.push({ cells: comp, threshold: a.threshold }); });
  });
  lvl.ice = rebuilt;
}

// ============================================================
// COLOR LOCK AREAS — stored as `colorLocks: [{ cells:[[r,c]…], color, count }]`.
// `count` = number of `color` cards to collect to unlock. Same adjacency grouping as ice.
// ============================================================
const CL_DEFAULT_COLOR = 'red';
const CL_DEFAULT_COUNT = 5;
const CL_COLOR_HEX = { red:'#e74c3c', green:'#2ecc71', blue:'#3498db', yellow:'#f1c40f', orange:'#e67e22', purple:'#9b59b6' };

function colorLockAreaAt(lvl, row, col) {
  return (lvl.colorLocks || []).find(a => a.cells.some(([r, c]) => r === row && c === col));
}
function addColorLockCell(lvl, row, col) {
  if (!lvl.colorLocks) lvl.colorLocks = [];
  const adjacent = lvl.colorLocks.filter(a =>
    a.cells.some(([r, c]) => Math.abs(r - row) + Math.abs(c - col) === 1));
  if (adjacent.length === 0) {
    lvl.colorLocks.push({ cells: [[row, col]], color: CL_DEFAULT_COLOR, count: CL_DEFAULT_COUNT });
    return;
  }
  const target = adjacent[0];
  for (let k = 1; k < adjacent.length; k++) target.cells.push(...adjacent[k].cells);
  lvl.colorLocks = lvl.colorLocks.filter(a => a === target || !adjacent.includes(a));
  target.cells.push([row, col]);
}
function removeColorLockCell(lvl, row, col) {
  const area = colorLockAreaAt(lvl, row, col);
  if (!area) return;
  area.cells = area.cells.filter(([r, c]) => !(r === row && c === col));
  const others = lvl.colorLocks.filter(a => a !== area);
  const rebuilt = connectedComponents(area.cells).map(cells => ({ cells, color: area.color, count: area.count }));
  lvl.colorLocks = [...others, ...rebuilt];
}
function resplitColorLocks(lvl) {
  if (!Array.isArray(lvl.colorLocks)) return;
  const rebuilt = [];
  lvl.colorLocks.forEach(a => {
    const cells = (a.cells || []).filter(Boolean);
    connectedComponents(cells).forEach(comp => { if (comp.length) rebuilt.push({ cells: comp, color: a.color, count: a.count }); });
  });
  lvl.colorLocks = rebuilt;
}

// ============================================================
// DOM REFS
// ============================================================
const levelListEl    = document.getElementById('level-list');
const editorContent  = document.getElementById('editor-content');
const editorEmpty    = document.getElementById('editor-empty-state');
const toolListEl     = document.getElementById('tool-list');
const btnLoad        = document.getElementById('btn-load');
const btnDownload    = document.getElementById('btn-download');
const fileInput      = document.getElementById('file-input');
const btnUndo        = document.getElementById('btn-undo');
const btnRedo        = document.getElementById('btn-redo');
const propCols       = document.getElementById('prop-cols');
const propRows       = document.getElementById('prop-rows');
const propColors     = document.getElementById('prop-colors');
const propTurns      = document.getElementById('prop-turns');
const propClearBoard = document.getElementById('prop-clearboard');
const propDeck       = document.getElementById('prop-deck');

// ============================================================
// INIT
// ============================================================
function init() {
  // Populate width/height dropdowns (4-10)
  for (let v = 4; v <= 10; v++) {
    propCols.appendChild(new Option(v, v));
    propRows.appendChild(new Option(v, v));
  }

  renderToolbar();
  renderLevelList();
  updateUndoRedoButtons();
  bindEvents();
}

// ============================================================
// EVENT BINDING
// ============================================================
function bindEvents() {
  btnLoad.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', loadFromJSON);
  btnDownload.addEventListener('click', downloadJSON);
  document.getElementById('btn-download-js').addEventListener('click', downloadJS);
  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);

  propCols.addEventListener('change', () => {
    updateLevelProperty('cols', parseInt(propCols.value));
  });
  propRows.addEventListener('change', () => {
    updateLevelProperty('rows', parseInt(propRows.value));
  });
  propColors.addEventListener('change', () => {
    updateLevelProperty('colorCount', parseInt(propColors.value));
  });
  propTurns.addEventListener('change', () => {
    updateLevelProperty('turns', parseInt(propTurns.value));
  });
  propClearBoard.addEventListener('change', () => {
    updateLevelProperty('clearBoard', propClearBoard.checked);
    propDeck.disabled = !propClearBoard.checked;
  });
  propDeck.addEventListener('change', () => {
    updateLevelProperty('deck', Math.max(0, parseInt(propDeck.value) || 0));
  });
  document.getElementById('btn-add-goal').addEventListener('click', addGoal);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
  });
}

// ============================================================
// LOAD / DOWNLOAD JSON
// ============================================================
function loadFromJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  loadedFileName = file.name.replace(/\.json$/i, '');
  document.querySelector('#top-bar h1').textContent = loadedFileName;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!Array.isArray(data)) throw new Error('Expected an array of levels');
      levels = data.map((lvl, i) => ({
        id: lvl.id || i + 1,
        cols: Math.max(4, Math.min(10, lvl.cols || 4)),
        rows: Math.max(4, Math.min(10, lvl.rows || 4)),
        colorCount: Math.max(1, Math.min(6, lvl.colorCount || 3)),
        turns: lvl.turns || 10,
        target: lvl.target || 500,
        clearBoard: !!lvl.clearBoard,
        deck: Math.max(0, lvl.deck || 0),
        locked:    Array.isArray(lvl.locked)    ? lvl.locked    : [],
        disabled:  Array.isArray(lvl.disabled)  ? lvl.disabled  : [],
        stacks:    Array.isArray(lvl.stacks)    ? lvl.stacks    : [],
        backEffects: Array.isArray(lvl.backEffects) ? lvl.backEffects : [],
        // Authored FIXED top-layer card colours: [[r,c,color]…]. Kept verbatim; never re-rolled.
        colors: Array.isArray(lvl.colors)
          ? lvl.colors.filter(x => Array.isArray(x) && x.length >= 3 && ALL_COLORS.includes(x[2]))
                      .map(([r, c, col]) => [r, c, col])
          : [],
        // Per-colour target totals for the top-layer board. { color: n }.
        colorCounts: (lvl.colorCounts && typeof lvl.colorCounts === 'object' && !Array.isArray(lvl.colorCounts))
          ? Object.fromEntries(Object.entries(lvl.colorCounts)
              .filter(([col, n]) => ALL_COLORS.includes(col) && Number.isFinite(+n))
              .map(([col, n]) => [col, Math.max(0, Math.floor(+n))]))
          : {},
        // Difficulty-ease knob: bias ONE (random, per-play) colour upward on a clearBoard board.
        // 0 = even (still noisy); ~0.5 = one colour ≈1.5× the even share.
        colorSkew: Math.max(0, Math.min(0.5, +lvl.colorSkew || 0)),
        // Beneath-layer authored cards (layers < 0 from Stacks/Elevators): backEffect and/or a
        // fixed colour; layer is a negative int. Drop empty entries.
        beneath: Array.isArray(lvl.beneath)
          ? lvl.beneath.filter(b => b && typeof b.layer === 'number' && b.layer < 0 && (b.backEffect || ALL_COLORS.includes(b.color)))
                       .map(b => {
                         const e = { r: b.r, c: b.c, layer: b.layer };
                         if (b.backEffect) e.backEffect = b.backEffect;
                         if (ALL_COLORS.includes(b.color)) e.color = b.color;
                         return e;
                       })
          : [],
        elevators: Array.isArray(lvl.elevators)
          ? lvl.elevators.map(a => ({ cells: Array.isArray(a.cells) ? a.cells : [], refills: Math.max(0, a.refills || 0) }))
          : (Array.isArray(lvl.elevator) && lvl.elevator.length
              ? [{ cells: lvl.elevator, refills: Math.max(0, lvl.elevatorRefills || 0) }]
              : []),
        ice: Array.isArray(lvl.ice)
          ? lvl.ice.map(a => ({ cells: Array.isArray(a.cells) ? a.cells : [], threshold: Math.max(0, a.threshold || 0) }))
          : [],
        colorLocks: Array.isArray(lvl.colorLocks)
          ? lvl.colorLocks.map(a => ({ cells: Array.isArray(a.cells) ? a.cells : [], color: ALL_COLORS.includes(a.color) ? a.color : CL_DEFAULT_COLOR, count: Math.max(0, a.count || 0) }))
          : [],
        goals:     Array.isArray(lvl.goals)     ? lvl.goals     : (lvl.target ? [{ type: 'score', target: lvl.target }] : []),
      }));
      selectedLevelIndex = levels.length > 0 ? 0 : -1;
      undoStack = [];
      redoStack = [];
      renderLevelList();
      if (selectedLevelIndex >= 0) selectLevel(0);
      else showEmptyState();
    } catch (err) {
      alert('Failed to parse JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
  fileInput.value = '';
}

function buildLevelsOutput() {
  return levels.map(lvl => {
    const obj = {
      id: lvl.id,
      cols: lvl.cols,
      rows: lvl.rows,
      colorCount: lvl.colorCount,
      turns: lvl.turns,
    };
    // Cleaning journey: clear-the-board mode + finite refill deck
    if (lvl.clearBoard) { obj.clearBoard = true; obj.deck = Math.max(0, lvl.deck || 0); }
    // Sync breakLocks goal locked array from board locked cells
    if (lvl.goals) {
      const blg = lvl.goals.find(g => g.type === 'breakLocks');
      if (blg) blg.locked = [...(lvl.locked || [])];
    }
    if (lvl.goals && lvl.goals.length > 0) obj.goals = lvl.goals;
    if (lvl.locked && lvl.locked.length > 0) obj.locked = lvl.locked;
    if (lvl.disabled && lvl.disabled.length > 0) obj.disabled = lvl.disabled;
    if (lvl.stacks && lvl.stacks.length > 0) obj.stacks = lvl.stacks;
    // Authored FIXED top-layer colours: [[r,c,color]…]. Drop entries on now-disabled cells.
    if (lvl.colors && lvl.colors.length > 0) {
      const disSet = new Set((lvl.disabled || []).map(([r, c]) => `${r},${c}`));
      const colors = lvl.colors.filter(([r, c, col]) =>
        r < lvl.rows && c < lvl.cols && !disSet.has(`${r},${c}`) && ALL_COLORS.includes(col));
      if (colors.length > 0) obj.colors = colors;
    }
    // Per-colour target totals ({color:n}) — clamped to this level's active-colour slice.
    if (lvl.colorCounts) {
      const active = ALL_COLORS.slice(0, Math.max(1, Math.min(6, lvl.colorCount || 3)));
      const cc = {};
      active.forEach(c => { if (lvl.colorCounts[c] != null) cc[c] = Math.max(0, Math.floor(lvl.colorCounts[c])); });
      if (Object.keys(cc).length > 0) obj.colorCounts = cc;
    }
    // Difficulty-ease colour skew (bias one random colour per play). Omitted when 0/even.
    if (lvl.colorSkew > 0) obj.colorSkew = Math.round(lvl.colorSkew * 100) / 100;
    // Back-of-card reveal effects: [[r,c,id]…] — fire when the tagged card is collected.
    if (lvl.backEffects && lvl.backEffects.length > 0) obj.backEffects = lvl.backEffects;
    // Beneath-layer cards: [{r,c,layer,backEffect?,color?}] — a back-effect and/or fixed colour on
    // a card that emerges later from a Stack pile (layer -1…-(N-1)) or an Elevator refill (-1…-refills).
    if (lvl.beneath && lvl.beneath.length > 0) obj.beneath = lvl.beneath;
    // Elevator: one entry per batch-refill area (cells + its own refill count).
    const els = (lvl.elevators || []).filter(a => a.cells && a.cells.length > 0);
    if (els.length > 0) obj.elevators = els.map(a => ({ cells: a.cells, refills: Math.max(0, a.refills || 0) }));
    // Ice: one entry per frozen area (cells + cards-to-collect-to-melt threshold).
    const ices = (lvl.ice || []).filter(a => a.cells && a.cells.length > 0);
    if (ices.length > 0) obj.ice = ices.map(a => ({ cells: a.cells, threshold: Math.max(0, a.threshold || 0) }));
    // Color locks: one entry per area (cells + required colour + count to unlock).
    const cls = (lvl.colorLocks || []).filter(a => a.cells && a.cells.length > 0);
    if (cls.length > 0) obj.colorLocks = cls.map(a => ({ cells: a.cells, color: a.color, count: Math.max(0, a.count || 0) }));
    return obj;
  });
}

function downloadJSON() {
  if (levels.length === 0) { alert('No levels to download.'); return; }
  // Build clean output
  const output = buildLevelsOutput();
  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = loadedFileName + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

function fileNameToVarName(name) {
  // "levels" → "LEVELS", "levels_long" → "LEVELS_LONG", "levels_short" → "LEVELS_SHORT"
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function downloadJS() {
  if (levels.length === 0) { alert('No levels to download.'); return; }
  const output = buildLevelsOutput();
  const varName = fileNameToVarName(loadedFileName);
  const js = '// Auto-generated by level-editor — edit via level-editor\n' + varName + ' = ' + JSON.stringify(output, null, 2) + ';\n';
  const blob = new Blob([js], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = loadedFileName + '.js';
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// LEVEL LIST (Left Panel)
// ============================================================
function renderLevelList() {
  levelListEl.innerHTML = '';
  levels.forEach((lvl, i) => {
    const card = document.createElement('div');
    card.className = 'level-card' + (i === selectedLevelIndex ? ' selected' : '');
    card.innerHTML = `
      <button class="delete-btn" title="Delete level">−</button>
      <span class="level-label">Level ${lvl.id}</span>
      ${buildMiniGrid(lvl)}
      <span class="level-goals">${(lvl.goals||[]).map(g => { const d = GOAL_TYPES.find(t=>t.id===g.type); return d ? d.icon : ''; }).join(' ')}</span>
      <span class="level-info">${lvl.cols}×${lvl.rows} | ${lvl.colorCount} colors | ${lvl.turns} turns${lvl.clearBoard ? ` | 🃏 ${lvl.deck || 0}` : ''}</span>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.delete-btn')) return;
      selectLevel(i);
    });
    card.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteLevel(i);
    });
    levelListEl.appendChild(card);

    // Insert button after each level
    const insertBtn = document.createElement('button');
    insertBtn.className = 'list-insert-btn';
    insertBtn.textContent = '+ Insert';
    insertBtn.title = `Insert level after Level ${lvl.id}`;
    insertBtn.addEventListener('click', () => insertLevel(i + 1));
    levelListEl.appendChild(insertBtn);
  });

  // Add new level button
  const addCard = document.createElement('div');
  addCard.className = 'level-card add-card';
  addCard.textContent = '+';
  addCard.title = 'Add new level';
  addCard.addEventListener('click', addLevel);
  levelListEl.appendChild(addCard);
}

function buildMiniGrid(lvl) {
  const lockedSet   = new Set((lvl.locked   || []).map(([r, c]) => `${r},${c}`));
  const disabledSet = new Set((lvl.disabled || []).map(([r, c]) => `${r},${c}`));
  const elevatorSet = new Set((lvl.elevators || []).flatMap(a => a.cells || []).map(([r, c]) => `${r},${c}`));
  const iceSet = new Set((lvl.ice || []).flatMap(a => a.cells || []).map(([r, c]) => `${r},${c}`));
  const clMap = {}; (lvl.colorLocks || []).forEach(a => (a.cells || []).forEach(([r, c]) => { clMap[`${r},${c}`] = a.color; }));
  const beSet = new Set((lvl.backEffects || []).map(([r, c]) => `${r},${c}`));
  let html = `<div class="mini-grid" style="grid-template-columns:repeat(${lvl.cols},1fr);grid-template-rows:repeat(${lvl.rows},1fr)">`;
  for (let r = 0; r < lvl.rows; r++) {
    for (let c = 0; c < lvl.cols; c++) {
      const key = `${r},${c}`;
      let cls = 'mini-cell', st = '';
      if (disabledSet.has(key))      cls += ' disabled';
      else if (lockedSet.has(key))   cls += ' locked';
      else if (elevatorSet.has(key)) cls += ' elevator';
      else if (iceSet.has(key))      cls += ' ice';
      else if (clMap[key])         { cls += ' colorlock'; st = ` style="background:${CL_COLOR_HEX[clMap[key]] || '#888'}"`; }
      if (beSet.has(key) && !disabledSet.has(key)) cls += ' backeffect';
      html += `<div class="${cls}"${st}></div>`;
    }
  }
  html += '</div>';
  return html;
}

// ============================================================
// LEVEL SELECTION & EDITING
// ============================================================
function selectLevel(index) {
  selectedLevelIndex = index;
  undoStack = [];
  redoStack = [];
  updateUndoRedoButtons();
  loadLevelIntoEditor();
  renderLevelList();
}

function loadLevelIntoEditor() {
  if (selectedLevelIndex < 0 || selectedLevelIndex >= levels.length) {
    showEmptyState();
    return;
  }
  editorEmpty.style.display = 'none';
  editorContent.classList.remove('hidden');

  currentLayer = 0; // always start a level on the top layer

  const lvl = levels[selectedLevelIndex];
  propCols.value = lvl.cols;
  propRows.value = lvl.rows;
  propColors.value = lvl.colorCount;
  propTurns.value = lvl.turns;
  propClearBoard.checked = !!lvl.clearBoard;
  propDeck.value = lvl.deck || 0;
  propDeck.disabled = !lvl.clearBoard;
  renderBoard();
  renderToolbar(); // reset any beneath-layer tool dimming
  renderGoals();
}

// Per-area refills editor: one row per elevator area with a color swatch (matching the
// board tint) and a number input. Rendered from renderBoard so it stays in sync with edits.
function renderElevatorAreas() {
  const wrap = document.getElementById('elevator-areas');
  const title = document.getElementById('elevator-areas-title');
  if (!wrap) return;
  const lvl = selectedLevelIndex >= 0 ? levels[selectedLevelIndex] : null;
  const areas = (lvl && lvl.elevators) || [];
  if (areas.length === 0) {
    wrap.innerHTML = ''; wrap.style.display = 'none';
    if (title) title.style.display = 'none';
    return;
  }
  wrap.style.display = ''; if (title) title.style.display = '';
  wrap.innerHTML = areas.map((a, i) => `
    <div class="elev-area-row">
      <span class="elev-area-swatch" style="background:${ELEV_HUES[i % ELEV_HUES.length]}"></span>
      <span class="elev-area-label">Area ${i + 1} <span class="elev-area-cells">${a.cells.length} cell${a.cells.length !== 1 ? 's' : ''}</span></span>
      <label class="elev-area-refills-label">🛗 <input type="number" class="elev-area-refills" data-ai="${i}" value="${a.refills ?? 0}" min="0" max="99"></label>
    </div>`).join('');
  wrap.querySelectorAll('.elev-area-refills').forEach(el => {
    el.addEventListener('change', () => {
      const ai = parseInt(el.dataset.ai);
      if (!levels[selectedLevelIndex].elevators[ai]) return;
      pushUndo();
      levels[selectedLevelIndex].elevators[ai].refills = Math.max(0, parseInt(el.value) || 0);
      pruneBeneath(levels[selectedLevelIndex]); // fewer refills → drop beneath entries past the new depth
      renderBoard();
    });
  });
}

// Per-area melt-count editor for ice areas — one row per area with the shared board tint.
function renderIceAreas() {
  const wrap = document.getElementById('ice-areas');
  const title = document.getElementById('ice-areas-title');
  if (!wrap) return;
  const lvl = selectedLevelIndex >= 0 ? levels[selectedLevelIndex] : null;
  const areas = (lvl && lvl.ice) || [];
  if (areas.length === 0) {
    wrap.innerHTML = ''; wrap.style.display = 'none';
    if (title) title.style.display = 'none';
    return;
  }
  wrap.style.display = ''; if (title) title.style.display = '';
  wrap.innerHTML = areas.map((a, i) => `
    <div class="elev-area-row ice-area-row">
      <span class="elev-area-swatch ice-swatch"></span>
      <span class="elev-area-label">Ice ${i + 1} <span class="elev-area-cells">${a.cells.length} cell${a.cells.length !== 1 ? 's' : ''}</span></span>
      <label class="elev-area-refills-label">❄ <input type="number" class="ice-area-threshold" data-ai="${i}" value="${a.threshold ?? 0}" min="0" max="999"></label>
    </div>`).join('');
  wrap.querySelectorAll('.ice-area-threshold').forEach(el => {
    el.addEventListener('change', () => {
      const ai = parseInt(el.dataset.ai);
      if (!levels[selectedLevelIndex].ice[ai]) return;
      pushUndo();
      levels[selectedLevelIndex].ice[ai].threshold = Math.max(0, parseInt(el.value) || 0);
      renderBoard();
    });
  });
}

// Per-area colour + count editor for color-lock areas.
function renderColorLockAreas() {
  const wrap = document.getElementById('colorlock-areas');
  const title = document.getElementById('colorlock-areas-title');
  if (!wrap) return;
  const lvl = selectedLevelIndex >= 0 ? levels[selectedLevelIndex] : null;
  const areas = (lvl && lvl.colorLocks) || [];
  if (areas.length === 0) {
    wrap.innerHTML = ''; wrap.style.display = 'none';
    if (title) title.style.display = 'none';
    return;
  }
  wrap.style.display = ''; if (title) title.style.display = '';
  wrap.innerHTML = areas.map((a, i) => `
    <div class="elev-area-row">
      <span class="elev-area-swatch" style="background:${CL_COLOR_HEX[a.color] || '#888'}"></span>
      <span class="elev-area-label">Lock ${i + 1} <span class="elev-area-cells">${a.cells.length} cell${a.cells.length !== 1 ? 's' : ''}</span></span>
      <select class="cl-area-color" data-ai="${i}">${ALL_COLORS.map(c => `<option value="${c}" ${a.color === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <label class="elev-area-refills-label">× <input type="number" class="cl-area-count" data-ai="${i}" value="${a.count ?? 0}" min="0" max="999"></label>
    </div>`).join('');
  wrap.querySelectorAll('.cl-area-color').forEach(el => el.addEventListener('change', () => {
    const ai = parseInt(el.dataset.ai);
    if (!levels[selectedLevelIndex].colorLocks[ai]) return;
    pushUndo();
    levels[selectedLevelIndex].colorLocks[ai].color = el.value;
    renderBoard();
  }));
  wrap.querySelectorAll('.cl-area-count').forEach(el => el.addEventListener('change', () => {
    const ai = parseInt(el.dataset.ai);
    if (!levels[selectedLevelIndex].colorLocks[ai]) return;
    pushUndo();
    levels[selectedLevelIndex].colorLocks[ai].count = Math.max(0, parseInt(el.value) || 0);
    renderBoard();
  }));
}

// Per-colour target counts for the TOP-LAYER board (lvl.colorCounts). One row per active-slice
// colour: a blank input means "random" (engine default); a number is the exact total to place
// (authored cards count toward it). Lives in the right panel; re-rendered on every board change
// so the "authored" tally and the sum-vs-cells hint stay live.
function renderColorCounts() {
  const wrap = document.getElementById('color-counts');
  if (!wrap) return;
  const lvl = selectedLevelIndex >= 0 ? levels[selectedLevelIndex] : null;
  if (!lvl) { wrap.innerHTML = ''; return; }
  const active = ALL_COLORS.slice(0, Math.max(1, Math.min(6, lvl.colorCount || 3)));
  const counts = lvl.colorCounts || {};
  const authoredTally = {}; (lvl.colors || []).forEach(([r, c, col]) => { authoredTally[col] = (authoredTally[col] || 0) + 1; });
  const totalCells = lvl.rows * lvl.cols - (lvl.disabled || []).length;
  const sum = active.reduce((s, c) => s + (counts[c] != null ? Math.max(0, Math.floor(counts[c])) : 0), 0);
  wrap.innerHTML =
    `<div class="cc-hint">Blank = random. Authored cards count toward the total.</div>` +
    active.map(c => {
      const val = counts[c] != null ? counts[c] : '';
      const auth = authoredTally[c] || 0;
      return `<div class="elev-area-row cc-row">
        <span class="elev-area-swatch" style="background:${CL_COLOR_HEX[c]}"></span>
        <span class="elev-area-label">${c} <span class="elev-area-cells">${auth} authored</span></span>
        <input type="number" class="cc-input" data-color="${c}" value="${val}" min="0" max="${totalCells}" placeholder="rnd">
      </div>`;
    }).join('') +
    `<div class="cc-hint cc-sum">Targets sum: ${sum} / ${totalCells} top cells</div>`;
  wrap.querySelectorAll('.cc-input').forEach(el => el.addEventListener('change', () => {
    const lvl2 = levels[selectedLevelIndex];
    if (!lvl2) return;
    pushUndo();
    if (!lvl2.colorCounts) lvl2.colorCounts = {};
    const color = el.dataset.color;
    const raw = (el.value || '').trim();
    if (raw === '') delete lvl2.colorCounts[color];
    else lvl2.colorCounts[color] = Math.max(0, parseInt(raw) || 0);
    if (Object.keys(lvl2.colorCounts).length === 0) delete lvl2.colorCounts;
    renderBoard();
  }));
}

function showEmptyState() {
  editorEmpty.style.display = 'flex';
  editorContent.classList.add('hidden');
  selectedLevelIndex = -1;
  renderLevelList();
}

// ============================================================
// ADD / DELETE LEVELS
// ============================================================
function addLevel() {
  const newId = levels.length > 0 ? Math.max(...levels.map(l => l.id)) + 1 : 1;
  const newLevel = {
    id: newId,
    cols: 6,
    rows: 6,
    colorCount: 4,
    turns: 10,
    target: 500,
    clearBoard: true,
    deck: 0,
    locked: [],
    disabled: [],
    stacks: [],
    colors: [],
    colorCounts: {},
    beneath: [],
    elevators: [],
    ice: [],
    colorLocks: [],
    goals: [{ type: 'clearAll' }],
  };
  levels.push(newLevel);
  selectLevel(levels.length - 1);
}

function insertLevel(atIndex) {
  const newLevel = {
    id: atIndex + 1,
    cols: 6, rows: 6, colorCount: 4, turns: 10, target: 500,
    clearBoard: true, deck: 0,
    locked: [], disabled: [], stacks: [], colors: [], colorCounts: {}, elevators: [], ice: [], colorLocks: [], beneath: [],
    goals: [{ type: 'clearAll' }],
  };
  levels.splice(atIndex, 0, newLevel);
  levels.forEach((lvl, i) => lvl.id = i + 1);
  selectLevel(atIndex);
}

function deleteLevel(index) {
  if (!confirm(`Delete Level ${levels[index].id}?`)) return;
  levels.splice(index, 1);
  // Re-assign IDs
  levels.forEach((lvl, i) => lvl.id = i + 1);
  if (selectedLevelIndex >= levels.length) selectedLevelIndex = levels.length - 1;
  if (selectedLevelIndex >= 0) {
    selectLevel(selectedLevelIndex);
  } else {
    showEmptyState();
    renderLevelList();
  }
}

// ============================================================
// BOARD RENDERING
// ============================================================
// Layer selector bar: shown only when the level has Stacks/Elevators that produce cards
// beneath the top. ◀ steps deeper (toward -maxDepth), ▶ steps back toward layer 0.
function buildLayerBar(lvl) {
  const maxDepth = maxBeneathDepth(lvl);
  if (maxDepth <= 0) return null;
  const min = -maxDepth;
  const bar = document.createElement('div');
  bar.className = 'layer-bar' + (currentLayer < 0 ? ' beneath' : '');

  const deeper = document.createElement('button');
  deeper.className = 'layer-btn';
  deeper.textContent = '◀';
  deeper.title = 'Go one layer deeper';
  deeper.disabled = currentLayer <= min;
  deeper.addEventListener('click', () => { if (currentLayer > min) { currentLayer--; renderBoard(); renderToolbar(); } });

  const label = document.createElement('span');
  label.className = 'layer-label';
  label.textContent = currentLayer === 0 ? 'Layer 0 (top)' : `Layer ${currentLayer} (beneath)`;

  const shallower = document.createElement('button');
  shallower.className = 'layer-btn';
  shallower.textContent = '▶';
  shallower.title = 'Go one layer up';
  shallower.disabled = currentLayer >= 0;
  shallower.addEventListener('click', () => { if (currentLayer < 0) { currentLayer++; renderBoard(); renderToolbar(); } });

  bar.appendChild(deeper);
  bar.appendChild(label);
  bar.appendChild(shallower);
  if (currentLayer < 0) {
    const hint = document.createElement('span');
    hint.className = 'layer-hint';
    hint.textContent = 'Stamp Back Effects on cards coming in from Stacks 🃏 / Elevators 🛗';
    bar.appendChild(hint);
  }
  return bar;
}

// Render a cell while viewing a beneath layer (currentLayer < 0). Active tiles are ones that
// will produce a card at this depth; everything else is dimmed and inert.
function renderBeneathCell(cell, lvl, r, c, effectId, colorId) {
  if (!tileHasCardAtLayer(lvl, r, c, currentLayer)) {
    cell.classList.add('layer-inactive');
    return;
  }
  cell.classList.add('layer-active');
  // Authored FIXED colour on this beneath card — fill the cell like layer 0.
  if (colorId) {
    cell.classList.add('authored');
    cell.style.background = CL_COLOR_HEX[colorId] || '#888';
    cell.title = 'Card colour: ' + colorId;
  }
  // Source hint (top-right): which mechanism produces this beneath card.
  const fromStack = (stackSizeAt(lvl, r, c) - 1) >= -currentLayer;
  const fromElev  = elevatorRefillsAt(lvl, r, c) >= -currentLayer;
  const src = document.createElement('span');
  src.className = 'layer-src-badge';
  src.textContent = fromStack && fromElev ? '🃏🛗' : fromStack ? '🃏' : '🛗';
  cell.appendChild(src);
  // Authored back-effect on this beneath card (top-left) — same badge as layer 0.
  if (effectId) {
    cell.classList.add('backeffect');
    const badge = document.createElement('span');
    badge.className = 'be-badge';
    badge.textContent = beIcon(effectId);
    badge.title = beName(effectId) + ' reveal';
    cell.appendChild(badge);
  }
}

// ============================================================
// TURNS ADVISOR — difficulty read-out for a FIXED turn budget.
//
// Turns are a memory/mistake budget. A competent player reveals up to 2 cards per
// turn AND remembers them, and a colour clear REFUNDS its turn — so once a colour is
// known it clears for free, and the only real cost is the exploration turns spent
// discovering colours. (My first model ignored this and roughly doubled the cost.)
// Calibrated to a realistic imperfect-memory player from simulation:
//   Pmatch = Σ (kᵢ/N)·(kᵢ−1)/(N−1)   Ceff = 1/Pmatch   (effective colour count)
//   need   = N·(A + B·Ceff) − REVEAL_CREDIT·(pre-revealed obstacle cells)
// Ice / Lock / Color-Lock tiles sit FACE-UP (revealLockedCards), so the player learns
// their colour for free → they make a level a bit EASIER: they subtract from `need`.
//
// Turns are NEVER changed here. Difficulty is the MARGIN of the authored turns over
// `need`; the only lever offered is a *gentle* skew of the colour distribution
// (a dominant colour raises Pmatch → lowers need → raises margin, i.e. easier).
// All constants are tunable.
// ============================================================
const TURN_MODEL = {
  A: 0.39, B: 0.045,          // BARE exploration need = N·(A + B·Ceff)  (no assists) — realistic-player fit
  // --- free-information assists (each subtracts from `need`; ~0.2 turns per free card reveal) ---
  REVEAL_CREDIT: 0.2,         // turns saved per FREE card reveal (face-up cell / back-effect / power-up)
  DANGER_FRAC: 0.14,          // Chain Danger Reveal (default ON): turns saved ≈ this × N (measured in sim)
  POWERUP_REVEALS: 3,         // assumed free reveals/level from the reveal power-ups a player brings (tunable)
  BACKEFFECT_DISCOUNT: 0.5,   // fraction of a back-effect's pattern that lands on NEW (undiscovered) cards
  TIER: { bad: 1.30, hard: 1.75, normal: 2.5 }, // margin thresholds (turns / need), assists included
  EASE_STEP: 0.15,            // each "Ease colours" click raises lvl.colorSkew by this
  EASE_MAX: 0.5,              // …capped here (one colour ≈1.5× the even share); stays subtle + clearable
};

// Authored back-of-card effects reveal a pattern when collected → free information.
// row/column span the whole line; cross/circle/star are fixed offset sets (see specials.js).
function backEffectReveals(lvl) {
  const SIZE = { row: lvl.cols - 1, column: lvl.rows - 1, cross: 4, circle: 8, star: 12 };
  let cards = 0, reveals = 0;
  (lvl.backEffects || []).forEach(([r, c, id]) => {
    cards++;
    reveals += (SIZE[id] != null ? SIZE[id] : 4) * TURN_MODEL.BACKEFFECT_DISCOUNT;
  });
  return { cards, reveals };
}

// Every card that must be cleared. Elevator refills and stack under-layers are extra cards.
function activeCardCount(lvl) {
  const cells = lvl.cols * lvl.rows;
  const disabled = (lvl.disabled || []).length;
  const stackExtra = (lvl.stacks || []).reduce((s, x) => s + Math.max(0, (x[2] || 2) - 1), 0);
  const elevExtra = (lvl.elevators || []).reduce((s, a) => s + Math.max(0, a.refills || 0) * ((a.cells || []).length), 0);
  const base = cells - disabled;
  return { base, stackExtra, elevExtra, total: base + stackExtra + elevExtra };
}

// Face-up obstacle cells: their colour is known from the start, so they cut discovery cost.
function revealedObstacleCells(lvl) {
  const locked = (lvl.locked || []).length;                                           // one tile each
  const ice    = (lvl.ice || []).reduce((s, a) => s + ((a.cells || []).length), 0);
  const clk    = (lvl.colorLocks || []).reduce((s, a) => s + ((a.cells || []).length), 0);
  return { locked, ice, clk, total: locked + ice + clk };
}

// Best estimate of the top-board colour distribution: authored fixed colours + colorCounts
// targets, with the remainder spread evenly across the free active colours.
function estimateColorDistribution(lvl, N) {
  const C = Math.max(1, Math.min(6, lvl.colorCount || 3));
  const active = ALL_COLORS.slice(0, C);
  const counts = {}; active.forEach(c => counts[c] = 0);
  (lvl.colors || []).forEach(([r, c, col]) => { if (col) counts[col] = (counts[col] || 0) + 1; });
  const cc = lvl.colorCounts || {};
  Object.entries(cc).forEach(([col, n]) => { counts[col] = Math.max(counts[col] || 0, Math.floor(+n) || 0); });
  let assigned = Object.values(counts).reduce((a, b) => a + b, 0);
  let remaining = Math.max(0, N - assigned);
  const free = active.filter(c => !(c in cc));
  const pool = free.length ? free : active;
  for (let i = 0; i < remaining; i++) counts[pool[i % pool.length]]++;
  // Apply the ease skew to a REPRESENTATIVE colour. In-game the boosted colour is random per
  // play, but Pmatch is symmetric, so biasing pool[0] gives the correct average difficulty.
  const skew = Math.max(0, lvl.colorSkew || 0);
  if (skew > 0 && pool.length >= 2) {
    let boost = Math.round((N / active.length) * skew);
    const dom = pool[0], donors = pool.slice(1);
    let i = 0, guard = 0;
    while (boost > 0 && guard++ < 10000) {
      const d = donors[i++ % donors.length];
      if (counts[d] > 3) { counts[d]--; counts[dom]++; boost--; }
      if (donors.every(x => counts[x] <= 3)) break;
    }
  }
  return counts;
}

function matchProbability(counts) {
  const vals = Object.values(counts).filter(k => k > 0);
  const N = vals.reduce((a, b) => a + b, 0);
  if (N < 2) return 1;
  let s = 0; for (const k of vals) s += (k / N) * ((k - 1) / (N - 1));
  return s || (1 / Math.max(1, vals.length));
}

// Cards on the TOP board (the cells `colorCounts` governs).
function topBoardCells(lvl) { return lvl.cols * lvl.rows - (lvl.disabled || []).length; }

function computeTurnsModel(lvl) {
  const cards = activeCardCount(lvl);
  const N = cards.total;                          // total cards that must be cleared
  const top = topBoardCells(lvl);
  const dist = estimateColorDistribution(lvl, top);
  const pm = matchProbability(dist);
  const ceff = 1 / pm;
  const rev = revealedObstacleCells(lvl);
  const be = backEffectReveals(lvl);

  const bare = N * (TURN_MODEL.A + TURN_MODEL.B * ceff);   // cost with no free info
  const assist = {                                         // turns saved by each info source
    danger:  TURN_MODEL.DANGER_FRAC * N,                   // chain danger reveal (default on)
    backfx:  TURN_MODEL.REVEAL_CREDIT * be.reveals,        // authored back-of-card effects
    powerup: TURN_MODEL.REVEAL_CREDIT * TURN_MODEL.POWERUP_REVEALS, // reveal power-ups (assumed)
    faceup:  TURN_MODEL.REVEAL_CREDIT * rev.total,         // face-up ice/lock/color-lock cells
  };
  assist.total = assist.danger + assist.backfx + assist.powerup + assist.faceup;
  const need = Math.max(1, bare - assist.total);
  const turns = lvl.turns || 0;
  const margin = need > 0 ? turns / need : 0;
  let tier, tierClass;
  if (margin < TURN_MODEL.TIER.bad)         { tier = 'Too Hard'; tierClass = 'tier-bad'; }
  else if (margin < TURN_MODEL.TIER.hard)   { tier = 'Hard';     tierClass = 'tier-hard'; }
  else if (margin < TURN_MODEL.TIER.normal) { tier = 'Normal';   tierClass = 'tier-normal'; }
  else                                      { tier = 'Easy';     tierClass = 'tier-easy'; }
  return { cards, N, top, dist, pm, ceff, rev, be, bare, assist, need, turns, margin, tier, tierClass };
}

function renderTurnsAdvisor() {
  const box = document.getElementById('turns-advisor');
  if (!box) return;
  if (selectedLevelIndex < 0) { box.style.display = 'none'; return; }
  box.style.display = '';
  const lvl = levels[selectedLevelIndex];
  const m = computeTurnsModel(lvl);
  const C = Math.max(1, Math.min(6, lvl.colorCount || 3));
  const active = ALL_COLORS.slice(0, C);

  const cardsBreak = [`${m.cards.base} base`];
  if (m.cards.stackExtra) cardsBreak.push(`+${m.cards.stackExtra} stack`);
  if (m.cards.elevExtra)  cardsBreak.push(`+${m.cards.elevExtra} elevator`);

  const a = m.assist;

  // Distribution row. Three cases: hand-pinned colorCounts (show per-colour chips), an ease
  // skew (show a generic top/others + note that the boosted colour is random per play), or
  // plain even (show the ~even share + that noise varies it each play).
  const cc = lvl.colorCounts || {};
  const hasPins = Object.keys(cc).length > 0;
  const skew = Math.max(0, lvl.colorSkew || 0);
  const even = Math.round(m.top / C);
  let distHtml, distTag;
  if (hasPins) {
    distHtml = active.map(c =>
      `<span class="adv-chip"><span class="adv-dot" style="background:${CL_COLOR_HEX[c] || '#888'}"></span>${m.dist[c] || 0}</span>`).join('');
    distTag = 'pinned';
  } else if (skew > 0) {
    const dom = Math.round(even * (1 + skew));
    const other = Math.max(3, Math.round((m.top - dom) / Math.max(1, C - 1)));
    distHtml = `<span class="adv-chip"><span class="adv-dot" style="background:linear-gradient(90deg,#e74c3c,#f1c40f,#2ecc71,#3498db)"></span>top ~${dom}</span>`
             + `<span class="adv-chip">others ~${other}</span>`
             + `<span class="adv-dist-note">↻ boosted colour is random each play</span>`;
    distTag = `skew +${Math.round(skew * 100)}%`;
  } else {
    distHtml = `<span class="adv-chip">≈ ${even} each</span><span class="adv-dist-note">↻ jittered each play</span>`;
    distTag = 'even';
  }

  box.innerHTML = `
    <div class="adv-head">🎯 Turns Advisor
      <span class="adv-note">turns stay fixed — ease the colour mix to adjust</span>
      <span class="adv-tier ${m.tierClass}">${m.tier} · margin ${m.margin.toFixed(2)}×</span>
    </div>
    <div class="adv-grid">
      <div><span class="adv-k">Cards (N)</span><span class="adv-v">${m.N}</span><span class="adv-sub">${cardsBreak.join(' ')}</span></div>
      <div><span class="adv-k">Colours</span><span class="adv-v">${C}</span><span class="adv-sub">eff ${m.ceff.toFixed(1)} · match ${(m.pm * 100).toFixed(0)}%</span></div>
      <div><span class="adv-k">Needs ≈</span><span class="adv-v">${Math.round(m.need)}</span><span class="adv-sub">bare ${Math.round(m.bare)} − assists ${Math.round(a.total)}</span></div>
      <div><span class="adv-k">Turns (fixed)</span><span class="adv-v">${m.turns}</span><span class="adv-sub">authored budget</span></div>
    </div>
    <div class="adv-rec">
      <span class="adv-reclabel">Distribution</span>
      ${distHtml}
      <span class="adv-dist-tag">${distTag}</span>
      <button class="adv-pill primary" id="adv-ease">Ease colours ▸</button>
      <button class="adv-pill" id="adv-reset">Reset</button>
    </div>
  `;
  const easeBtn = box.querySelector('#adv-ease');
  const resetBtn = box.querySelector('#adv-reset');
  if (easeBtn) easeBtn.addEventListener('click', easeColorDistribution);
  if (resetBtn) resetBtn.addEventListener('click', resetColorDistribution);

  renderDifficultyGraph();
}

// ============================================================
// DIFFICULTY CURVE — margin (turns / need) plotted across every level, so you can
// see the whole progression's shape at a glance instead of one level at a time.
// The four TURN_MODEL.TIER thresholds paint horizontal zone bands (Too Hard / Hard /
// Normal / Easy) behind the curve; each level's dot is coloured by its own tier and
// clicking a dot jumps to that level. Reads the same computeTurnsModel() as the advisor.
// ============================================================
const TIER_COLORS = {
  'tier-bad':    '#ff6b81',   // Too Hard
  'tier-hard':   '#ffb454',   // Hard
  'tier-normal': '#67e0a3',   // Normal
  'tier-easy':   '#4fc3f7',   // Easy
};

function renderDifficultyGraph() {
  const box = document.getElementById('difficulty-graph');
  if (!box) return;
  if (!levels.length) { box.style.display = 'none'; return; }
  box.style.display = '';

  // One margin per level (same model as the Turns Advisor).
  const data = levels.map((lvl, i) => {
    const m = computeTurnsModel(lvl);
    return { i, id: lvl.id, margin: m.margin, tier: m.tier, tierClass: m.tierClass };
  });

  const T = TURN_MODEL.TIER;                 // { bad, hard, normal }
  const maxMargin = data.reduce((mx, d) => Math.max(mx, d.margin), 0);
  // Give the Easy band headroom above the top threshold; cap so one outlier can't squash the rest.
  const yMax = Math.min(6, Math.max(T.normal + 0.6, Math.ceil((maxMargin + 0.3) * 2) / 2));
  const yMin = 0;

  // Layout. Fixed px per level → the SVG grows and the box scrolls horizontally for long journeys.
  const padL = 46, padR = 14, padT = 8, padB = 26, plotH = 176;
  const perLevel = 16;
  const innerW = Math.max((box.clientWidth || 620) - padL - padR - 4, data.length * perLevel);
  const W = padL + innerW + padR;
  const H = padT + plotH + padB;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const xAt = i => padL + (data.length > 1 ? i * stepX : innerW / 2);
  const yAt = v => padT + (yMax - Math.min(v, yMax)) / (yMax - yMin) * plotH;

  // Zone bands: [valueLo, valueHi, tierClass, label]. Top band (Easy) is capped at yMax.
  const zones = [
    [T.normal, yMax,     'tier-easy',   'Easy'],
    [T.hard,   T.normal, 'tier-normal', 'Normal'],
    [T.bad,    T.hard,   'tier-hard',   'Hard'],
    [yMin,     T.bad,    'tier-bad',    'Too Hard'],
  ];
  const bands = zones.map(([lo, hi, cls]) => {
    const yTop = yAt(hi), yBot = yAt(lo);
    return `<rect x="${padL}" y="${yTop.toFixed(1)}" width="${innerW}" height="${(yBot - yTop).toFixed(1)}" fill="${TIER_COLORS[cls]}" fill-opacity="0.12"/>`;
  }).join('');

  // Threshold lines + right-edge value labels.
  const thresholds = [T.bad, T.hard, T.normal].map(v => {
    const y = yAt(v).toFixed(1);
    return `<line x1="${padL}" y1="${y}" x2="${padL + innerW}" y2="${y}" stroke="#ffffff" stroke-opacity="0.14" stroke-dasharray="3 3"/>`
         + `<text x="${padL - 6}" y="${(+y + 3).toFixed(1)}" text-anchor="end" class="dg-axis">${v.toFixed(2)}×</text>`;
  }).join('');

  // The curve itself + a subtle fill under it.
  const linePts = data.map(d => `${xAt(d.i).toFixed(1)},${yAt(d.margin).toFixed(1)}`);
  const linePath = linePts.length ? `M${linePts.join(' L')}` : '';
  const areaPath = linePts.length
    ? `M${xAt(0).toFixed(1)},${(padT + plotH).toFixed(1)} L${linePts.join(' L')} L${xAt(data.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} Z`
    : '';

  // Dots (coloured by tier). The selected level gets a white ring; each dot is clickable.
  const dots = data.map(d => {
    const cx = xAt(d.i).toFixed(1), cy = yAt(d.margin).toFixed(1);
    const sel = d.i === selectedLevelIndex;
    const r = sel ? 5 : 3;
    const ring = sel ? `<circle cx="${cx}" cy="${cy}" r="${r + 2.5}" fill="none" stroke="#fff" stroke-width="1.6"/>` : '';
    return `<g class="dg-dot" data-i="${d.i}">`
         + `<circle cx="${cx}" cy="${cy}" r="9" fill="transparent"/>`   /* fat hit area */
         + ring
         + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${TIER_COLORS[d.tierClass]}" stroke="#0d1226" stroke-width="1"/>`
         + `<title>Level ${d.id} · ${d.tier} · margin ${d.margin.toFixed(2)}×</title>`
         + `</g>`;
  }).join('');

  // X-axis level labels: thin out so they never collide (~every ceil(N/24) levels + last).
  const stride = Math.max(1, Math.ceil(data.length / 24));
  const xlabels = data.map((d, k) => {
    if (k % stride !== 0 && k !== data.length - 1) return '';
    return `<text x="${xAt(d.i).toFixed(1)}" y="${(padT + plotH + 15).toFixed(1)}" text-anchor="middle" class="dg-axis">${d.id}</text>`;
  }).join('');

  const legend = zones.slice().reverse().map(([, , cls, label]) =>
    `<span class="dg-leg"><span class="dg-swatch" style="background:${TIER_COLORS[cls]}"></span>${label}</span>`).join('');

  box.innerHTML = `
    <div class="dg-head">📈 Difficulty Curve
      <span class="dg-note">margin = turns ÷ need · per level</span>
      <span class="dg-legend">${legend}</span>
    </div>
    <div class="dg-scroll">
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="dg-svg">
        ${bands}
        ${thresholds}
        <path d="${areaPath}" fill="#4fc3f7" fill-opacity="0.06"/>
        <path d="${linePath}" fill="none" stroke="#cdd6f4" stroke-opacity="0.55" stroke-width="1.5"/>
        ${dots}
        ${xlabels}
      </svg>
    </div>
  `;
  box.querySelectorAll('.dg-dot').forEach(g => {
    g.style.cursor = 'pointer';
    g.addEventListener('click', () => {
      const i = +g.getAttribute('data-i');
      if (i !== selectedLevelIndex) selectLevel(i);
    });
  });
}

// Gently raise the ease skew (raises Pmatch → easier). Never touches turns. Stores an
// abstract magnitude in lvl.colorSkew — the game picks a RANDOM colour to boost each play,
// so no colour is ever fixed as "the easy one" and the counts vary run to run.
function easeColorDistribution() {
  if (selectedLevelIndex < 0) return;
  const lvl = levels[selectedLevelIndex];
  if (Math.max(1, Math.min(6, lvl.colorCount || 3)) < 2) return;
  const cur = Math.max(0, lvl.colorSkew || 0);
  const next = Math.min(TURN_MODEL.EASE_MAX, Math.round((cur + TURN_MODEL.EASE_STEP) * 100) / 100);
  if (next <= cur) return;                          // already at the cap
  pushUndo();
  lvl.colorSkew = next;
  renderBoard();
  renderLevelList();
}

// Back to an even (still noisy) mix. Clears only the ease skew, not hand-authored colorCounts.
function resetColorDistribution() {
  if (selectedLevelIndex < 0) return;
  const lvl = levels[selectedLevelIndex];
  if (!(lvl.colorSkew > 0)) return;
  pushUndo();
  lvl.colorSkew = 0;
  renderBoard();
  renderLevelList();
}

function renderBoard() {
  if (selectedLevelIndex < 0) return;
  const lvl = levels[selectedLevelIndex];
  clampCurrentLayer(lvl);
  const beneathMode = currentLayer < 0;
  const beneathMap = {};      // key → backEffect id, only for the layer being viewed
  const beneathColorMap = {}; // key → authored colour, only for the layer being viewed
  if (beneathMode) (lvl.beneath || []).forEach(b => {
    if (b.layer !== currentLayer) return;
    if (b.backEffect) beneathMap[`${b.r},${b.c}`] = b.backEffect;
    if (b.color) beneathColorMap[`${b.r},${b.c}`] = b.color;
  });
  const colorMap    = {}; (lvl.colors || []).forEach(([r, c, col]) => { colorMap[`${r},${c}`] = col; });
  const lockedCount = {}; (lvl.locked || []).forEach(([r, c, n]) => { lockedCount[`${r},${c}`] = n || 1; });
  const lockedSet   = new Set(Object.keys(lockedCount));
  const disabledSet = new Set((lvl.disabled || []).map(([r, c]) => `${r},${c}`));
  const stackMap    = {}; (lvl.stacks || []).forEach(([r, c, n]) => { stackMap[`${r},${c}`] = n || 2; });
  const backEffMap  = {}; (lvl.backEffects || []).forEach(([r, c, id]) => { backEffMap[`${r},${c}`] = id; });
  const elevAreaOf  = new Map(); (lvl.elevators || []).forEach((a, ai) => (a.cells || []).forEach(([r, c]) => elevAreaOf.set(`${r},${c}`, ai)));
  const iceAreaOf   = new Map(); (lvl.ice       || []).forEach((a, ai) => (a.cells || []).forEach(([r, c]) => iceAreaOf.set(`${r},${c}`, ai)));
  const clAreaOf    = new Map(); (lvl.colorLocks|| []).forEach((a, ai) => (a.cells || []).forEach(([r, c]) => clAreaOf.set(`${r},${c}`, ai)));
  const boardWrap   = document.getElementById('board-wrap');
  boardWrap.innerHTML = '';

  const area = document.createElement('div');
  area.className = 'board-area';

  // ── Layer selector: cycle 0 / -1 / -2 … to edit cards beneath Stacks & Elevators ───
  const layerBar = buildLayerBar(lvl);
  if (layerBar) area.appendChild(layerBar);

  // ── Top controls: col remove buttons + col insert buttons ───
  const topRow = document.createElement('div');
  topRow.className = 'ctrl-top-row';

  const corner = document.createElement('div');
  corner.className = 'ctrl-corner';
  topRow.appendChild(corner);

  const insColLeft = mkInsertBtn('ins-col', 'Insert column at left', lvl.cols >= 10);
  insColLeft.addEventListener('click', () => insertCol('left'));
  topRow.appendChild(insColLeft);

  for (let c = 0; c < lvl.cols; c++) {
    const hdr = document.createElement('div');
    hdr.className = 'ctrl-col-hdr';
    const btn = mkRemoveBtn('Remove column ' + c, lvl.cols <= 4);
    btn.addEventListener('click', () => removeCol(c));
    hdr.appendChild(btn);
    topRow.appendChild(hdr);
  }

  const insColRight = mkInsertBtn('ins-col', 'Insert column at right', lvl.cols >= 10);
  insColRight.addEventListener('click', () => insertCol('right'));
  topRow.appendChild(insColRight);
  area.appendChild(topRow);

  // ── Mid row: row controls + board ───────────────────────────
  const midRow = document.createElement('div');
  midRow.className = 'ctrl-mid-row';

  const leftCol = document.createElement('div');
  leftCol.className = 'ctrl-left-col';

  const insRowTop = mkInsertBtn('ins-row', 'Insert row at top', lvl.rows >= 10);
  insRowTop.addEventListener('click', () => insertRow('top'));
  leftCol.appendChild(insRowTop);

  for (let r = 0; r < lvl.rows; r++) {
    const hdr = document.createElement('div');
    hdr.className = 'ctrl-row-hdr';
    const btn = mkRemoveBtn('Remove row ' + r, lvl.rows <= 4);
    btn.addEventListener('click', () => removeRow(r));
    hdr.appendChild(btn);
    leftCol.appendChild(hdr);
  }

  const insRowBot = mkInsertBtn('ins-row', 'Insert row at bottom', lvl.rows >= 10);
  insRowBot.addEventListener('click', () => insertRow('bottom'));
  leftCol.appendChild(insRowBot);
  midRow.appendChild(leftCol);

  // Board grid
  const board = document.createElement('div');
  board.id = 'board';
  board.style.gridTemplateColumns = `repeat(${lvl.cols}, 60px)`;
  board.style.gridTemplateRows    = `repeat(${lvl.rows}, 60px)`;

  for (let r = 0; r < lvl.rows; r++) {
    for (let c = 0; c < lvl.cols; c++) {
      const key = `${r},${c}`;
      const cell = document.createElement('div');
      cell.className = 'board-cell';
      if (beneathMode) {
        renderBeneathCell(cell, lvl, r, c, beneathMap[key], beneathColorMap[key]);
      } else {
      if (disabledSet.has(key)) {
        cell.classList.add('disabled');
        const img = document.createElement('img');
        img.src = '../blocks/disabled.png';
        img.alt = 'disabled';
        cell.appendChild(img);
      } else if (lockedSet.has(key)) {
        cell.classList.add('locked');
        const nLock = lockedCount[key] || 1;
        if (nLock > 1) {
          const badge = document.createElement('span');
          badge.className = 'lock-count-badge';
          badge.textContent = nLock;
          cell.appendChild(badge);
        }
      }
      // Show ordered position badges
      const ordGoal = (lvl.goals || []).find(g => g.type === 'orderedCards');
      if (ordGoal && ordGoal.positions) {
        const oi = ordGoal.positions.findIndex(([pr, pc]) => pr === r && pc === c);
        if (oi >= 0) {
          cell.classList.add('ordered');
          const badge = document.createElement('span');
          badge.className = 'ordered-badge';
          badge.textContent = oi + 1;
          cell.appendChild(badge);
        }
      }
      // Show stacked-tile count (square badge, top-right)
      if (stackMap[key]) {
        cell.classList.add('stacked');
        const badge = document.createElement('span');
        badge.className = 'stack-count-badge';
        badge.textContent = stackMap[key];
        cell.appendChild(badge);
      }
      // Back-of-card reveal effect (icon badge, top-left)
      if (backEffMap[key] && !disabledSet.has(key)) {
        cell.classList.add('backeffect');
        const badge = document.createElement('span');
        badge.className = 'be-badge';
        badge.textContent = beIcon(backEffMap[key]);
        badge.title = beName(backEffMap[key]) + ' reveal';
        cell.appendChild(badge);
      }
      // Elevator area — tint by area index (matches the areas list) + show its refill count.
      // Independent layer that can share a tile with a stack.
      if (elevAreaOf.has(key) && !disabledSet.has(key)) {
        const ai = elevAreaOf.get(key);
        cell.classList.add('elevator');
        cell.style.setProperty('--elev-hue', ELEV_HUES[ai % ELEV_HUES.length]);
        const badge = document.createElement('span');
        badge.className = 'elev-refill-badge';
        badge.textContent = '🛗' + (lvl.elevators[ai].refills ?? 0);
        cell.appendChild(badge);
      }
      // Ice area — frost overlay + melt-count badge. Can share a tile with a stack.
      if (iceAreaOf.has(key) && !disabledSet.has(key)) {
        const ai = iceAreaOf.get(key);
        cell.classList.add('ice');
        const badge = document.createElement('span');
        badge.className = 'ice-count-badge';
        badge.textContent = '❄' + (lvl.ice[ai].threshold ?? 0);
        cell.appendChild(badge);
      }
      // Color-lock area — cell tinted by the required colour + a count badge.
      if (clAreaOf.has(key) && !disabledSet.has(key)) {
        const ai = clAreaOf.get(key);
        const a = lvl.colorLocks[ai];
        cell.classList.add('colorlock');
        cell.style.background = CL_COLOR_HEX[a.color] || '#888';
        cell.style.borderColor = '#fff';
        const badge = document.createElement('span');
        badge.className = 'cl-count-badge';
        badge.textContent = '×' + (a.count ?? 0);
        cell.appendChild(badge);
      }
      // Authored FIXED colour (lvl.colors) — independent layer, coexists with any tile type. On a
      // colour-lock cell (whose background already shows the REQUIRED colour) draw a small corner
      // swatch of the hidden authored colour; on every other tile fill the cell like a face-up card.
      if (colorMap[key] && !disabledSet.has(key)) {
        const hex = CL_COLOR_HEX[colorMap[key]] || '#888';
        if (clAreaOf.has(key)) {
          const sw = document.createElement('span');
          sw.className = 'authored-swatch';
          sw.style.background = hex;
          sw.title = 'Card colour: ' + colorMap[key];
          cell.appendChild(sw);
        } else {
          cell.classList.add('authored');
          cell.style.background = hex;
          cell.title = 'Card colour: ' + colorMap[key];
        }
      }
      } // end normal-mode (layer 0) decorations
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.addEventListener('click', () => onCellClick(r, c));
      board.appendChild(cell);
    }
  }

  midRow.appendChild(board);
  area.appendChild(midRow);
  boardWrap.appendChild(area);

  renderElevatorAreas();
  renderIceAreas();
  renderColorLockAreas();
  renderColorCounts();
  renderTurnsAdvisor();
}

function mkInsertBtn(cls, title, disabled) {
  const btn = document.createElement('button');
  btn.className = `ctrl-insert-btn ${cls}`;
  btn.textContent = '+';
  btn.title = title;
  btn.disabled = disabled;
  return btn;
}

function mkRemoveBtn(title, disabled) {
  const btn = document.createElement('button');
  btn.className = 'ctrl-remove-btn';
  btn.textContent = '×';
  btn.title = title;
  btn.disabled = disabled;
  return btn;
}

// ============================================================
// INSERT / REMOVE ROWS & COLUMNS
// ============================================================
function insertRow(position) {
  const lvl = levels[selectedLevelIndex];
  if (lvl.rows >= 10) return;
  pushUndo();
  if (position === 'top') {
    lvl.locked   = (lvl.locked   || []).map(p => [p[0] + 1, p[1], ...(p[2] ? [p[2]] : [])]);
    lvl.disabled = (lvl.disabled || []).map(([r, c]) => [r + 1, c]);
    lvl.stacks   = (lvl.stacks   || []).map(p => [p[0] + 1, p[1], p[2]]);
    (lvl.elevators || []).forEach(a => { a.cells = a.cells.map(([r, c]) => [r + 1, c]); });
    (lvl.ice || []).forEach(a => { a.cells = a.cells.map(([r, c]) => [r + 1, c]); });
    (lvl.colorLocks || []).forEach(a => { a.cells = a.cells.map(([r, c]) => [r + 1, c]); });
    (lvl.beneath || []).forEach(b => { b.r += 1; });
  }
  lvl.rows++;
  propRows.value = lvl.rows;
  renderBoard();
  renderLevelList();
}

function removeRow(r) {
  const lvl = levels[selectedLevelIndex];
  if (lvl.rows <= 4) return;
  pushUndo();
  lvl.locked   = (lvl.locked   || []).filter(([row]) => row !== r).map(p => [p[0] > r ? p[0] - 1 : p[0], p[1], ...(p[2] ? [p[2]] : [])]);
  lvl.disabled = (lvl.disabled || []).filter(([row]) => row !== r).map(([row, c]) => [row > r ? row - 1 : row, c]);
  lvl.stacks   = (lvl.stacks   || []).filter(([row]) => row !== r).map(p => [p[0] > r ? p[0] - 1 : p[0], p[1], p[2]]);
  (lvl.elevators || []).forEach(a => { a.cells = a.cells.filter(([row]) => row !== r).map(([row, c]) => [row > r ? row - 1 : row, c]); });
  (lvl.ice || []).forEach(a => { a.cells = a.cells.filter(([row]) => row !== r).map(([row, c]) => [row > r ? row - 1 : row, c]); });
  (lvl.colorLocks || []).forEach(a => { a.cells = a.cells.filter(([row]) => row !== r).map(([row, c]) => [row > r ? row - 1 : row, c]); });
  lvl.beneath  = (lvl.beneath  || []).filter(b => b.r !== r).map(b => ({ ...b, r: b.r > r ? b.r - 1 : b.r }));
  resplitElevators(lvl); resplitIce(lvl); resplitColorLocks(lvl); pruneBeneath(lvl);
  lvl.rows--;
  propRows.value = lvl.rows;
  renderBoard();
  renderLevelList();
}

function insertCol(position) {
  const lvl = levels[selectedLevelIndex];
  if (lvl.cols >= 10) return;
  pushUndo();
  if (position === 'left') {
    lvl.locked   = (lvl.locked   || []).map(p => [p[0], p[1] + 1, ...(p[2] ? [p[2]] : [])]);
    lvl.disabled = (lvl.disabled || []).map(([r, c]) => [r, c + 1]);
    lvl.stacks   = (lvl.stacks   || []).map(p => [p[0], p[1] + 1, p[2]]);
    (lvl.elevators || []).forEach(a => { a.cells = a.cells.map(([r, c]) => [r, c + 1]); });
    (lvl.ice || []).forEach(a => { a.cells = a.cells.map(([r, c]) => [r, c + 1]); });
    (lvl.colorLocks || []).forEach(a => { a.cells = a.cells.map(([r, c]) => [r, c + 1]); });
    (lvl.beneath || []).forEach(b => { b.c += 1; });
  }
  lvl.cols++;
  propCols.value = lvl.cols;
  renderBoard();
  renderLevelList();
}

function removeCol(c) {
  const lvl = levels[selectedLevelIndex];
  if (lvl.cols <= 4) return;
  pushUndo();
  lvl.locked   = (lvl.locked   || []).filter(([r, col]) => col !== c).map(p => [p[0], p[1] > c ? p[1] - 1 : p[1], ...(p[2] ? [p[2]] : [])]);
  lvl.disabled = (lvl.disabled || []).filter(([r, col]) => col !== c).map(([r, col]) => [r, col > c ? col - 1 : col]);
  lvl.stacks   = (lvl.stacks   || []).filter(([r, col]) => col !== c).map(p => [p[0], p[1] > c ? p[1] - 1 : p[1], p[2]]);
  (lvl.elevators || []).forEach(a => { a.cells = a.cells.filter(([r, col]) => col !== c).map(([r, col]) => [r, col > c ? col - 1 : col]); });
  (lvl.ice || []).forEach(a => { a.cells = a.cells.filter(([r, col]) => col !== c).map(([r, col]) => [r, col > c ? col - 1 : col]); });
  (lvl.colorLocks || []).forEach(a => { a.cells = a.cells.filter(([r, col]) => col !== c).map(([r, col]) => [r, col > c ? col - 1 : col]); });
  lvl.beneath  = (lvl.beneath  || []).filter(b => b.c !== c).map(b => ({ ...b, c: b.c > c ? b.c - 1 : b.c }));
  resplitElevators(lvl); resplitIce(lvl); resplitColorLocks(lvl); pruneBeneath(lvl);
  lvl.cols--;
  propCols.value = lvl.cols;
  renderBoard();
  renderLevelList();
}

// ============================================================
// CELL CLICK — Apply active tool
// ============================================================
function onCellClick(row, col) {
  if (selectedLevelIndex < 0) return;
  const lvl = levels[selectedLevelIndex];

  // Beneath-layer editing (viewing layer < 0): only Back Effect, Color + Eraser act, and only on
  // a tile that actually produces a card at this depth. Back-effect and colour are independent —
  // each toggles on its own while preserving the other. Stamps into lvl.beneath[{r,c,layer,…}].
  if (currentLayer < 0) {
    if (activeTool !== 'backeffect' && activeTool !== 'color' && activeTool !== 'eraser') return;
    if (!tileHasCardAtLayer(lvl, row, col, currentLayer)) return;
    pushUndo();
    if (!Array.isArray(lvl.beneath)) lvl.beneath = [];
    const existing = beneathAt(lvl, row, col, currentLayer);
    // Start from the existing back-effect/colour, then toggle whichever this tool controls.
    let be = existing ? existing.backEffect : undefined;
    let col2 = existing ? existing.color : undefined;
    if (activeTool === 'eraser')      { be = undefined; col2 = undefined; }
    else if (activeTool === 'backeffect') be  = (be === backEffectValue) ? undefined : backEffectValue;
    else if (activeTool === 'color')      col2 = (col2 === colorValue)    ? undefined : colorValue;
    // Rewrite the entry for this cell+layer (drop it entirely if nothing remains).
    lvl.beneath = lvl.beneath.filter(b => !(b.r === row && b.c === col && b.layer === currentLayer));
    if (be || col2) {
      const entry = { r: row, c: col, layer: currentLayer };
      if (be) entry.backEffect = be;
      if (col2) entry.color = col2;
      lvl.beneath.push(entry);
    }
    renderBoard(); renderLevelList();
    return;
  }

  // Color tool (top layer) — an INDEPENDENT authored-colour layer stored in lvl.colors. It
  // coexists with locks/ice/color-lock/stacks (so you can pre-set what's hidden under a lock),
  // so it must NOT run the destructive tile-type clearing below — handle + return early, like
  // the Ordered tool. Clicking the same colour again removes it. Disabled cells hold no card.
  if (activeTool === 'color') {
    if ((lvl.disabled || []).some(([r, c]) => r === row && c === col)) return;
    pushUndo();
    if (!Array.isArray(lvl.colors)) lvl.colors = [];
    const existing = lvl.colors.find(([r, c]) => r === row && c === col);
    lvl.colors = lvl.colors.filter(([r, c]) => !(r === row && c === col));
    if (!(existing && existing[2] === colorValue)) lvl.colors.push([row, col, colorValue]);
    renderBoard(); renderLevelList();
    return;
  }

  // Ordered tool — toggle position in orderedCards goal
  if (activeTool === 'ordered') {
    const ordGoal = (lvl.goals || []).find(g => g.type === 'orderedCards');
    if (!ordGoal) { alert('Add an "Ordered Cards" goal first.'); return; }
    pushUndo();
    if (!ordGoal.positions) ordGoal.positions = [];
    const pi = ordGoal.positions.findIndex(([pr, pc]) => pr === row && pc === col);
    if (pi >= 0) ordGoal.positions.splice(pi, 1);
    else ordGoal.positions.push([row, col]);
    ordGoal.count = ordGoal.positions.length;
    renderBoard(); renderGoals(); renderLevelList();
    return;
  }

  const key = `${row},${col}`;
  const disabledSet = new Set((lvl.disabled || []).map(([r, c]) => `${r},${c}`));

  pushUndo();

  // Remember an existing lock layer count so the Locked tool can add layers, and whether
  // this cell was already in an elevator area (so that tool can toggle it off).
  const prevLock = (lvl.locked || []).find(([r, c]) => r === row && c === col);
  const prevLocks = prevLock ? (prevLock[2] || 1) : 0;
  const prevBack = (lvl.backEffects || []).find(([r, c]) => r === row && c === col);
  const prevBE = prevBack ? prevBack[2] : null;
  const hadElevator = !!elevatorAreaAt(lvl, row, col);
  const hadIce = !!iceAreaAt(lvl, row, col);
  const hadColorLock = !!colorLockAreaAt(lvl, row, col);

  // Elevator, Ice and Color Lock are independent area layers that may each coexist with a
  // stack, but are mutually exclusive with each other. Keep the stack when toggling any of
  // them; every other tool clears all three.
  const keepStack = (activeTool === 'elevator' || activeTool === 'ice' || activeTool === 'colorlock');

  lvl.locked   = (lvl.locked   || []).filter(([r, c]) => !(r === row && c === col));
  lvl.disabled = (lvl.disabled || []).filter(([r, c]) => !(r === row && c === col));
  if (!keepStack) lvl.stacks = (lvl.stacks || []).filter(([r, c]) => !(r === row && c === col));
  // Back-effect layer: preserved by the area tools (like stacks), toggled by its own tool,
  // cleared by everything else.
  if (!keepStack) lvl.backEffects = (lvl.backEffects || []).filter(([r, c]) => !(r === row && c === col));
  // Authored-colour layer (lvl.colors): independent — coexists with every tile type, so only the
  // Eraser and turning a cell Disabled remove it. All other tools leave it in place.
  if (activeTool === 'eraser' || activeTool === 'disabled') {
    lvl.colors = (lvl.colors || []).filter(([r, c]) => !(r === row && c === col));
  }

  // Elevator membership: toggle with the elevator tool; ice/color-lock and any other non-stack
  // tool removes it (the three area types can't share a cell).
  if (activeTool === 'elevator') {
    if (!disabledSet.has(key)) { hadElevator ? removeElevatorCell(lvl, row, col) : addElevatorCell(lvl, row, col); }
  } else if (activeTool !== 'stack' && hadElevator) {
    removeElevatorCell(lvl, row, col);
  }

  // Ice membership: toggle with the ice tool; elevator/color-lock and any other non-stack tool removes it.
  if (activeTool === 'ice') {
    if (!disabledSet.has(key)) { hadIce ? removeIceCell(lvl, row, col) : addIceCell(lvl, row, col); }
  } else if (activeTool !== 'stack' && hadIce) {
    removeIceCell(lvl, row, col);
  }

  // Color-lock membership: toggle with the color-lock tool; elevator/ice and any other non-stack tool removes it.
  if (activeTool === 'colorlock') {
    if (!disabledSet.has(key)) { hadColorLock ? removeColorLockCell(lvl, row, col) : addColorLockCell(lvl, row, col); }
  } else if (activeTool !== 'stack' && hadColorLock) {
    removeColorLockCell(lvl, row, col);
  }

  if (activeTool === 'locked' && !disabledSet.has(key)) {
    // Each click adds a lock layer; past MAX it wraps back to cleared.
    const next = prevLocks >= MAX_LOCK_LAYERS ? 0 : prevLocks + 1;
    if (next >= 1) lvl.locked = [...lvl.locked, next > 1 ? [row, col, next] : [row, col]];
  } else if (activeTool === 'disabled') {
    lvl.disabled = [...lvl.disabled, [row, col]];
  } else if (activeTool === 'stack' && !disabledSet.has(key)) {
    // Stamp a pile of `stackValue` cards on this tile.
    lvl.stacks = [...lvl.stacks, [row, col, stackValue]];
  } else if (activeTool === 'backeffect' && !disabledSet.has(key)) {
    // Toggle: clicking the same effect that's already here removes it; else stamp the selected one.
    if (prevBE !== backEffectValue) lvl.backEffects = [...lvl.backEffects, [row, col, backEffectValue]];
  }
  // 'normal' or 'eraser' — already cleared above, nothing more to do

  // Sync breakLocks goal
  const blg = (lvl.goals || []).find(g => g.type === 'breakLocks');
  if (blg) blg.locked = [...(lvl.locked || [])];

  // A stack/elevator may have shrunk or been removed — drop beneath entries with no card left.
  pruneBeneath(lvl);

  renderBoard(); renderGoals(); renderLevelList();
}

// ============================================================
// PROPERTY UPDATES
// ============================================================
function updateLevelProperty(prop, value) {
  if (selectedLevelIndex < 0) return;
  const lvl = levels[selectedLevelIndex];

  pushUndo();

  const oldCols = lvl.cols;
  const oldRows = lvl.rows;
  lvl[prop] = value;

  // If board size changed, remove out-of-bounds cells
  if (prop === 'cols' || prop === 'rows') {
    lvl.locked   = (lvl.locked   || []).filter(([r, c]) => r < lvl.rows && c < lvl.cols);
    lvl.disabled = (lvl.disabled || []).filter(([r, c]) => r < lvl.rows && c < lvl.cols);
    lvl.stacks   = (lvl.stacks   || []).filter(([r, c]) => r < lvl.rows && c < lvl.cols);
    lvl.colors   = (lvl.colors   || []).filter(([r, c]) => r < lvl.rows && c < lvl.cols);
    (lvl.elevators || []).forEach(a => { a.cells = a.cells.filter(([r, c]) => r < lvl.rows && c < lvl.cols); });
    (lvl.ice || []).forEach(a => { a.cells = a.cells.filter(([r, c]) => r < lvl.rows && c < lvl.cols); });
    (lvl.colorLocks || []).forEach(a => { a.cells = a.cells.filter(([r, c]) => r < lvl.rows && c < lvl.cols); });
    lvl.beneath  = (lvl.beneath  || []).filter(b => b.r < lvl.rows && b.c < lvl.cols);
    resplitElevators(lvl); resplitIce(lvl); resplitColorLocks(lvl); pruneBeneath(lvl);
  }

  renderBoard();
  renderLevelList();
}

// ============================================================
// UNDO / REDO
// ============================================================
function deepCopy(lvl) {
  return JSON.parse(JSON.stringify(lvl));
}

function pushUndo() {
  if (selectedLevelIndex < 0) return;
  undoStack.push(deepCopy(levels[selectedLevelIndex]));
  redoStack = [];
  updateUndoRedoButtons();
}

function undo() {
  if (undoStack.length === 0 || selectedLevelIndex < 0) return;
  redoStack.push(deepCopy(levels[selectedLevelIndex]));
  levels[selectedLevelIndex] = undoStack.pop();
  loadLevelIntoEditor();
  renderLevelList();
  updateUndoRedoButtons();
}

function redo() {
  if (redoStack.length === 0 || selectedLevelIndex < 0) return;
  undoStack.push(deepCopy(levels[selectedLevelIndex]));
  levels[selectedLevelIndex] = redoStack.pop();
  loadLevelIntoEditor();
  renderLevelList();
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  btnUndo.disabled = undoStack.length === 0;
  btnRedo.disabled = redoStack.length === 0;
}

// ============================================================
// TOOL PALETTE (Right Panel)
// ============================================================
function renderToolbar() {
  toolListEl.innerHTML = '';
  // On beneath layers only Back Effect + Eraser act; the rest are structural (layer-0 only).
  const beneathMode = currentLayer < 0;
  // On beneath layers only Back Effect, Color + Eraser act; the rest are structural (layer-0 only).
  const usableOnBeneath = id => id === 'backeffect' || id === 'color' || id === 'eraser';
  TOOLS.forEach(tool => {
    const card = document.createElement('div');
    const dimmed = beneathMode && !usableOnBeneath(tool.id);
    card.className = 'tool-card' + (tool.id === activeTool ? ' active' : '') + (dimmed ? ' tool-disabled' : '');
    let stepper = '';
    if (tool.id === 'stack' && activeTool === 'stack') {
      stepper = `<div class="tool-stepper">
           <button class="stepper-btn" data-act="dec">−</button>
           <span class="stepper-val">${stackValue}</span>
           <button class="stepper-btn" data-act="inc">+</button>
         </div>`;
    } else if (tool.id === 'backeffect' && activeTool === 'backeffect') {
      // Cycle the reveal pattern this tool stamps.
      stepper = `<div class="tool-stepper">
           <button class="stepper-btn" data-act="be-prev">‹</button>
           <span class="stepper-val be-val">${beIcon(backEffectValue)} ${beName(backEffectValue)}</span>
           <button class="stepper-btn" data-act="be-next">›</button>
         </div>`;
    } else if (tool.id === 'color' && activeTool === 'color') {
      // Cycle the fixed colour this tool stamps.
      stepper = `<div class="tool-stepper">
           <button class="stepper-btn" data-act="col-prev">‹</button>
           <span class="stepper-val col-val"><span class="col-swatch" style="background:${CL_COLOR_HEX[colorValue]}"></span>${colorValue}</span>
           <button class="stepper-btn" data-act="col-next">›</button>
         </div>`;
    }
    // The Color tool's icon is a live swatch of the currently-selected colour.
    const iconHTML = tool.id === 'color'
      ? `<span class="col-swatch big" style="background:${CL_COLOR_HEX[colorValue]}"></span>`
      : tool.icon;
    card.innerHTML = `
      <div class="tool-icon">${iconHTML}</div>
      <div class="tool-name">${tool.name}</div>
      <div class="tool-desc">${tool.desc}</div>
      ${stepper}
    `;
    card.addEventListener('click', () => {
      if (dimmed) return; // structural tools are disabled while editing a beneath layer
      activeTool = tool.id;
      renderToolbar();
    });
    // Stepper controls (don't let the click bubble up and re-select the tool)
    card.querySelectorAll('.stepper-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === 'inc' || act === 'dec') {
          stackValue = Math.max(2, Math.min(MAX_STACK, stackValue + (act === 'inc' ? 1 : -1)));
        } else if (act === 'be-prev' || act === 'be-next') {
          const ids = BACK_EFFECTS.map(b => b.id);
          const i = ids.indexOf(backEffectValue);
          backEffectValue = ids[(i + (act === 'be-next' ? 1 : ids.length - 1)) % ids.length];
        } else if (act === 'col-prev' || act === 'col-next') {
          const i = ALL_COLORS.indexOf(colorValue);
          colorValue = ALL_COLORS[(i + (act === 'col-next' ? 1 : ALL_COLORS.length - 1)) % ALL_COLORS.length];
        }
        renderToolbar();
      });
    });
    toolListEl.appendChild(card);
  });
}

// ============================================================
// GOALS EDITING
// ============================================================
function renderGoals() {
  const goalListEl = document.getElementById('goal-list');
  if (!goalListEl) return;
  goalListEl.innerHTML = '';
  if (selectedLevelIndex < 0) return;
  const lvl = levels[selectedLevelIndex];
  if (!lvl.goals) lvl.goals = [];

  lvl.goals.forEach((goal, gi) => {
    const def = GOAL_TYPES.find(t => t.id === goal.type);
    const card = document.createElement('div');
    card.className = 'goal-card';
    card.innerHTML = `
      <div class="goal-header">
        <span class="goal-icon">${def ? def.icon : '📋'}</span>
        <span class="goal-name">${def ? def.name : goal.type}</span>
        <button class="goal-remove" data-gi="${gi}">×</button>
      </div>
      <div class="goal-props">${buildGoalPropsHTML(goal, gi, lvl)}</div>
    `;
    card.querySelector('.goal-remove').addEventListener('click', () => removeGoal(gi));
    goalListEl.appendChild(card);
  });

  // Bind all goal inputs
  goalListEl.querySelectorAll('[data-goal-prop]').forEach(el => {
    el.addEventListener('change', () => {
      const gi = parseInt(el.dataset.gi);
      const prop = el.dataset.goalProp;
      let val = el.type === 'number' ? parseInt(el.value) : el.value;
      updateGoalProp(gi, prop, val);
    });
  });

  // Bind color-collect per-color inputs
  goalListEl.querySelectorAll('[data-cc-color]').forEach(el => {
    el.addEventListener('change', () => {
      const gi = parseInt(el.dataset.gi);
      const color = el.dataset.ccColor;
      const goal = levels[selectedLevelIndex].goals[gi];
      if (!goal.requirements) goal.requirements = {};
      const v = parseInt(el.value) || 0;
      if (v > 0) goal.requirements[color] = v;
      else delete goal.requirements[color];
      pushUndo();
    });
  });

  // Bind per-row/col coverage inputs
  goalListEl.querySelectorAll('[data-cov-idx]').forEach(el => {
    el.addEventListener('change', () => {
      const gi = parseInt(el.dataset.gi);
      const idx = parseInt(el.dataset.covIdx);
      const prop = el.dataset.covProp; // 'rows' or 'cols'
      const goal = levels[selectedLevelIndex].goals[gi];
      if (!goal[prop]) goal[prop] = [];
      goal[prop][idx] = parseInt(el.value) || 1;
      pushUndo();
    });
  });
}

function buildGoalPropsHTML(goal, gi, lvl) {
  switch (goal.type) {
    case 'score':
      return `<label>Target <input type="number" data-gi="${gi}" data-goal-prop="target" value="${goal.target || 500}" min="0" step="50"></label>`;
    case 'colorCollect': {
      const reqs = goal.requirements || {};
      return ALL_COLORS.map(c =>
        `<label><span style="color:${cssCol(c)}">${c}</span> <input type="number" data-gi="${gi}" data-cc-color="${c}" value="${reqs[c] || 0}" min="0" max="20" style="width:50px"></label>`
      ).join('');
    }
    case 'specificCombos':
      return `<label>Min length <input type="number" data-gi="${gi}" data-goal-prop="minLength" value="${goal.minLength || 3}" min="3" max="10" style="width:50px"></label>
              <label>Count <input type="number" data-gi="${gi}" data-goal-prop="count" value="${goal.count || 1}" min="1" max="20" style="width:50px"></label>`;
    case 'markedCards':
      return `<label>Total to collect <input type="number" data-gi="${gi}" data-goal-prop="totalToCollect" value="${goal.totalToCollect || 5}" min="1" style="width:50px"></label>
              <label>On board at once <input type="number" data-gi="${gi}" data-goal-prop="onBoardCount" value="${goal.onBoardCount || 3}" min="1" style="width:50px"></label>`;
    case 'orderedCards':
      return `<label>Positions: ${(goal.positions || []).length} <span style="color:#888;font-size:10px">(use Ordered tool on board)</span></label>`;
    case 'colorAvoid':
      return `<label>Color <select data-gi="${gi}" data-goal-prop="color">${ALL_COLORS.map(c => `<option value="${c}" ${goal.color === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
              <label>Max flips <input type="number" data-gi="${gi}" data-goal-prop="maxFlips" value="${goal.maxFlips || 3}" min="1" max="20" style="width:50px"></label>`;
    case 'rowCoverage': {
      const rows = goal.rows || Array(lvl.rows).fill(goal.timesEachRow || 1);
      return `<div class="cov-inputs">${rows.map((v, i) =>
        `<label>R${i+1} <input type="number" data-gi="${gi}" data-cov-idx="${i}" data-cov-prop="rows" value="${v}" min="1" max="10" style="width:40px"></label>`
      ).join('')}</div>`;
    }
    case 'colCoverage': {
      const cols = goal.cols || Array(lvl.cols).fill(goal.timesEachCol || 1);
      return `<div class="cov-inputs">${cols.map((v, i) =>
        `<label>C${i+1} <input type="number" data-gi="${gi}" data-cov-idx="${i}" data-cov-prop="cols" value="${v}" min="1" max="10" style="width:40px"></label>`
      ).join('')}</div>`;
    }
    case 'breakLocks':
      return `<label>${(lvl.locked || []).length} locked cells <span style="color:#888;font-size:10px">(use Locked tool on board)</span></label>`;
    case 'clearAll':
      return `<span style="color:#888;font-size:10px">Clear every card. Enable Clear-Board & set Deck above for refills.</span>`;
    default:
      return `<span style="color:#888">Unknown goal type</span>`;
  }
}

function cssCol(c) {
  return { red: '#e74c3c', green: '#2ecc71', blue: '#3498db', yellow: '#f1c40f' }[c] || '#fff';
}

function addGoal() {
  if (selectedLevelIndex < 0) return;
  const goalListEl = document.getElementById('goal-list');
  // Remove any existing picker
  const old = goalListEl.querySelector('.goal-picker');
  if (old) { old.remove(); return; }
  const picker = document.createElement('div');
  picker.className = 'goal-picker';
  GOAL_TYPES.forEach(t => {
    const opt = document.createElement('div');
    opt.className = 'goal-pick-option';
    opt.textContent = `${t.icon} ${t.name}`;
    opt.addEventListener('click', () => { picker.remove(); insertGoal(t.id); });
    picker.appendChild(opt);
  });
  goalListEl.prepend(picker);
}

function insertGoal(type) {
  if (selectedLevelIndex < 0) return;
  pushUndo();
  const lvl = levels[selectedLevelIndex];
  if (!lvl.goals) lvl.goals = [];
  const goal = { type };
  switch (type) {
    case 'score':         goal.target = 500; break;
    case 'colorCollect':  goal.requirements = { red: 3 }; break;
    case 'specificCombos': goal.minLength = 4; goal.count = 2; break;
    case 'markedCards':   goal.totalToCollect = 5; goal.onBoardCount = 3; break;
    case 'orderedCards':  goal.count = 0; goal.positions = []; break;
    case 'colorAvoid':    goal.color = 'yellow'; goal.maxFlips = 3; break;
    case 'rowCoverage':   goal.rows = Array(lvl.rows).fill(1); break;
    case 'colCoverage':   goal.cols = Array(lvl.cols).fill(1); break;
    case 'breakLocks':    goal.locked = [...(lvl.locked || [])]; break;
  }
  lvl.goals.push(goal);
  renderGoals(); renderLevelList();
}

function removeGoal(index) {
  if (selectedLevelIndex < 0) return;
  pushUndo();
  levels[selectedLevelIndex].goals.splice(index, 1);
  renderGoals(); renderBoard(); renderLevelList();
}

function updateGoalProp(goalIndex, prop, value) {
  if (selectedLevelIndex < 0) return;
  pushUndo();
  const goal = levels[selectedLevelIndex].goals[goalIndex];
  if (!goal) return;
  goal[prop] = value;
  renderGoals();
}

// ============================================================
// TAB SWITCHING
// ============================================================
let activeTab = 'levels';

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
      document.querySelectorAll('main[data-tab]').forEach(m => m.style.display = m.dataset.tab === activeTab ? '' : 'none');
      // Update top bar buttons based on active tab
      updateTopBarForTab();
    });
  });
}

function updateTopBarForTab() {
  const isLevels = activeTab === 'levels';
  btnLoad.textContent = isLevels ? '📂 Load JSON' : '📂 Load Progression';
  document.getElementById('btn-download').textContent = isLevels ? '💾 Download JSON' : '💾 Download Progression';
  document.getElementById('btn-download-js').textContent = isLevels ? '💾 Download JS' : '💾 Download JS';
}

// ============================================================
// PROGRESSION STATE
// ============================================================
let progression = {
  winStreakStartLevel: 1,
  deploySpecialsStartLevel: 1,
  recallStartLevel: 1,
  sweepRevealStartLevel: 1,
  levelRewards: [],
};

const BOOSTER_TYPES = [
  { id: 'peek',      icon: '👁',  name: 'Peek' },
  { id: 'random3',   icon: '🎲',  name: 'Random 3' },
  { id: 'pluscolor', icon: '➕🎨', name: '+1 Color' },
  { id: 'cross',     icon: '✚',  name: 'Cross' },
  { id: 'row',       icon: '↔',  name: 'Row' },
  { id: 'col',       icon: '↕',  name: 'Column' },
  { id: 'neighbor',  icon: '🔗',  name: 'Neighbor' },
  { id: 'colorpick', icon: '🎨',  name: 'Color Pick' },
  { id: 'shield',    icon: '🛡',  name: 'Shield' },
  { id: 'joker',     icon: '🃏',  name: 'Joker' },
];

const SPECIAL_TYPES_EDITOR = [
  { id: 'cross',     icon: '💣', name: 'Baby Bomb' },
  { id: 'ring',      icon: '💥', name: 'BIG Bomb' },
  { id: 'diamond',   icon: '☢︎', name: 'Nuke!' },
  { id: 'peek',      icon: '👁', name: 'Peek' },
  { id: 'tint',      icon: '🎯', name: 'Tint' },
  { id: 'spotlight', icon: '🔦', name: 'Spotlight' },
  { id: 'echo',      icon: '🔔', name: 'Echo' },
  { id: 'wild',      icon: '🌈', name: 'Wild' },
];

function initProgression() {
  // Bind inputs
  ['winstreak', 'deploy', 'recall', 'sweep'].forEach(key => {
    const el = document.getElementById(`prog-${key}-level`);
    const propMap = { winstreak: 'winStreakStartLevel', deploy: 'deploySpecialsStartLevel', recall: 'recallStartLevel', sweep: 'sweepRevealStartLevel' };
    el.addEventListener('change', () => { progression[propMap[key]] = parseInt(el.value) || 1; });
  });
  document.getElementById('btn-add-reward').addEventListener('click', addReward);
}

function loadProgressionIntoUI() {
  document.getElementById('prog-winstreak-level').value = progression.winStreakStartLevel;
  document.getElementById('prog-deploy-level').value = progression.deploySpecialsStartLevel;
  document.getElementById('prog-recall-level').value = progression.recallStartLevel;
  document.getElementById('prog-sweep-level').value = progression.sweepRevealStartLevel;
  renderRewards();
}

function renderRewards() {
  const list = document.getElementById('rewards-list');
  list.innerHTML = '';
  progression.levelRewards.forEach((r, i) => {
    const isSpecial = (r.type || 'booster') === 'special';
    const card = document.createElement('div');
    card.className = 'reward-card';
    card.innerHTML = `
      <button class="goal-remove" data-ri="${i}">×</button>
      <label>After Level <input type="number" class="rw-level" data-ri="${i}" value="${r.afterLevel || 1}" min="1" max="99" style="width:50px"></label>
      <label>Type
        <select class="rw-type" data-ri="${i}">
          <option value="booster" ${!isSpecial ? 'selected' : ''}>Power-Up</option>
          <option value="special" ${isSpecial ? 'selected' : ''}>Special Card</option>
        </select>
      </label>
      <label>Item
        <select class="rw-item" data-ri="${i}">
          ${isSpecial
            ? SPECIAL_TYPES_EDITOR.map(s => `<option value="${s.id}" ${r.specialId === s.id ? 'selected' : ''}>${s.icon} ${s.name}</option>`).join('')
            : BOOSTER_TYPES.map(b => `<option value="${b.id}" ${r.boosterId === b.id ? 'selected' : ''}>${b.icon} ${b.name}</option>`).join('')}
        </select>
      </label>
      <label>Qty <input type="number" class="rw-qty" data-ri="${i}" value="${r.qty || 1}" min="1" max="99" style="width:50px"></label>
    `;
    list.appendChild(card);

    // Insert button after each reward
    const insertBtn = document.createElement('button');
    insertBtn.className = 'list-insert-btn';
    insertBtn.textContent = '+ Insert';
    insertBtn.title = `Insert reward after this one`;
    insertBtn.addEventListener('click', () => insertReward(i + 1));
    list.appendChild(insertBtn);
  });

  // Bind events
  list.querySelectorAll('.goal-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      progression.levelRewards.splice(parseInt(btn.dataset.ri), 1);
      renderRewards();
    });
  });
  list.querySelectorAll('.rw-level').forEach(el => {
    el.addEventListener('change', () => { progression.levelRewards[parseInt(el.dataset.ri)].afterLevel = parseInt(el.value) || 1; });
  });
  list.querySelectorAll('.rw-type').forEach(el => {
    el.addEventListener('change', () => {
      const ri = parseInt(el.dataset.ri);
      const r = progression.levelRewards[ri];
      const newType = el.value;
      if (newType === 'special') {
        r.type = 'special';
        r.specialId = SPECIAL_TYPES_EDITOR[0].id;
        delete r.boosterId;
      } else {
        delete r.type;
        r.boosterId = BOOSTER_TYPES[0].id;
        delete r.specialId;
      }
      renderRewards();
    });
  });
  list.querySelectorAll('.rw-item').forEach(el => {
    el.addEventListener('change', () => {
      const ri = parseInt(el.dataset.ri);
      const r = progression.levelRewards[ri];
      if ((r.type || 'booster') === 'special') r.specialId = el.value;
      else r.boosterId = el.value;
    });
  });
  list.querySelectorAll('.rw-qty').forEach(el => {
    el.addEventListener('change', () => { progression.levelRewards[parseInt(el.dataset.ri)].qty = parseInt(el.value) || 1; });
  });
}

function addReward() {
  progression.levelRewards.push({ afterLevel: 1, boosterId: 'peek', qty: 1 });
  renderRewards();
}

function insertReward(atIndex) {
  progression.levelRewards.splice(atIndex, 0, { afterLevel: 1, boosterId: 'peek', qty: 1 });
  renderRewards();
}

// ============================================================
// PROGRESSION LOAD / DOWNLOAD
// ============================================================
function loadProgressionFromJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  loadedProgressionFileName = file.name.replace(/\.json$/i, '');
  document.querySelector('#top-bar h1').textContent = loadedProgressionFileName;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      progression.winStreakStartLevel = data.winStreakStartLevel || 1;
      progression.deploySpecialsStartLevel = data.deploySpecialsStartLevel || 1;
      progression.recallStartLevel = data.recallStartLevel || 1;
      progression.sweepRevealStartLevel = data.sweepRevealStartLevel || 1;
      progression.levelRewards = Array.isArray(data.levelRewards) ? data.levelRewards : [];
      loadProgressionIntoUI();
    } catch (err) { alert('Failed to parse progression JSON: ' + err.message); }
  };
  reader.readAsText(file);
  fileInput.value = '';
}

function downloadProgressionJSON() {
  const blob = new Blob([JSON.stringify(progression, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = loadedProgressionFileName + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

function downloadProgressionJS() {
  const varName = fileNameToVarName(loadedProgressionFileName);
  let js = '// Auto-generated by level-editor — edit via level-editor\n';
  js += `${varName} = ${JSON.stringify({
    winStreakStartLevel: progression.winStreakStartLevel,
    deploySpecialsStartLevel: progression.deploySpecialsStartLevel,
    recallStartLevel: progression.recallStartLevel,
    sweepRevealStartLevel: progression.sweepRevealStartLevel,
    levelRewards: progression.levelRewards,
  }, null, 2)};\n`;
  const blob = new Blob([js], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = loadedProgressionFileName + '.js';
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// OVERRIDE LOAD/DOWNLOAD BASED ON TAB
// ============================================================
const origLoadFromJSON = loadFromJSON;
function routedLoad(e) {
  if (activeTab === 'progression') loadProgressionFromJSON(e);
  else origLoadFromJSON(e);
}

const origDownloadJSON = downloadJSON;
function routedDownloadJSON() {
  if (activeTab === 'progression') downloadProgressionJSON();
  else origDownloadJSON();
}

const origDownloadJS = downloadJS;
function routedDownloadJS() {
  if (activeTab === 'progression') downloadProgressionJS();
  else origDownloadJS();
}

// ============================================================
// BOOT
// ============================================================
init();
initTabs();
initProgression();
loadProgressionIntoUI();

// Re-bind file/download buttons to routed versions
fileInput.removeEventListener('change', origLoadFromJSON);
fileInput.addEventListener('change', routedLoad);
btnDownload.removeEventListener('click', origDownloadJSON);
btnDownload.addEventListener('click', routedDownloadJSON);
document.getElementById('btn-download-js').removeEventListener('click', origDownloadJS);
document.getElementById('btn-download-js').addEventListener('click', routedDownloadJS);
