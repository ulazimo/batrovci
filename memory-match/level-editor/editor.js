// ============================================================
// STATE
// ============================================================
let levels = [];
let selectedLevelIndex = -1;
let activeTool = 'normal';
const MAX_LOCK_LAYERS = 4; // Locked tool cycles 1→…→MAX, then clears.
let stackValue = 2;        // Stack tool stamps this many cards per tile (2–MAX_STACK).
let backEffectValue = 'row'; // Back Effect tool stamps this reveal pattern (cycled with ‹ ›).
let undoStack = [];
let redoStack = [];
let loadedFileName = 'levels';
let loadedProgressionFileName = 'progression';

// ============================================================
// TOOLS
// ============================================================
const TOOLS = [
  { id: 'normal',   icon: '🟦', name: 'Normal',   desc: 'Regular card cell' },
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
    // Back-of-card reveal effects: [[r,c,id]…] — fire when the tagged card is collected.
    if (lvl.backEffects && lvl.backEffects.length > 0) obj.backEffects = lvl.backEffects;
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

  const lvl = levels[selectedLevelIndex];
  propCols.value = lvl.cols;
  propRows.value = lvl.rows;
  propColors.value = lvl.colorCount;
  propTurns.value = lvl.turns;
  propClearBoard.checked = !!lvl.clearBoard;
  propDeck.value = lvl.deck || 0;
  propDeck.disabled = !lvl.clearBoard;
  renderBoard();
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
    clearBoard: false,
    deck: 0,
    locked: [],
    disabled: [],
    stacks: [],
    elevators: [],
    ice: [],
    colorLocks: [],
    goals: [{ type: 'score', target: 500 }],
  };
  levels.push(newLevel);
  selectLevel(levels.length - 1);
}

function insertLevel(atIndex) {
  const newLevel = {
    id: atIndex + 1,
    cols: 6, rows: 6, colorCount: 4, turns: 10, target: 500,
    clearBoard: false, deck: 0,
    locked: [], disabled: [], stacks: [], elevators: [], ice: [], colorLocks: [],
    goals: [{ type: 'score', target: 500 }],
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
function renderBoard() {
  if (selectedLevelIndex < 0) return;
  const lvl = levels[selectedLevelIndex];
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
  resplitElevators(lvl); resplitIce(lvl); resplitColorLocks(lvl);
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
  resplitElevators(lvl); resplitIce(lvl); resplitColorLocks(lvl);
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
    (lvl.elevators || []).forEach(a => { a.cells = a.cells.filter(([r, c]) => r < lvl.rows && c < lvl.cols); });
    (lvl.ice || []).forEach(a => { a.cells = a.cells.filter(([r, c]) => r < lvl.rows && c < lvl.cols); });
    (lvl.colorLocks || []).forEach(a => { a.cells = a.cells.filter(([r, c]) => r < lvl.rows && c < lvl.cols); });
    resplitElevators(lvl); resplitIce(lvl); resplitColorLocks(lvl);
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
  TOOLS.forEach(tool => {
    const card = document.createElement('div');
    card.className = 'tool-card' + (tool.id === activeTool ? ' active' : '');
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
    }
    card.innerHTML = `
      <div class="tool-icon">${tool.icon}</div>
      <div class="tool-name">${tool.name}</div>
      <div class="tool-desc">${tool.desc}</div>
      ${stepper}
    `;
    card.addEventListener('click', () => {
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
