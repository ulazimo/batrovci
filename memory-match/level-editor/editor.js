// ============================================================
// STATE
// ============================================================
let levels = [];
let selectedLevelIndex = -1;
let activeTool = 'normal';
let undoStack = [];
let redoStack = [];
let loadedFileName = 'levels';
let loadedProgressionFileName = 'progression';

// ============================================================
// TOOLS
// ============================================================
const TOOLS = [
  { id: 'normal',   icon: '🟦', name: 'Normal',   desc: 'Regular card cell' },
  { id: 'locked',   icon: '🔒', name: 'Locked',   desc: 'Locked until adjacent combo' },
  { id: 'disabled', icon: '<img src="../blocks/disabled.png" style="width:32px;height:32px;border-radius:4px;opacity:.7">', name: 'Disabled', desc: 'Empty cell — no card, no interaction' },
  { id: 'ordered',  icon: '🔢', name: 'Ordered',  desc: 'Place numbered positions for orderedCards goal' },
  { id: 'eraser',   icon: '🧹', name: 'Eraser',   desc: 'Clear cell to normal' },
];

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
];
const ALL_COLORS = ['red', 'green', 'blue', 'yellow'];

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
        colorCount: Math.max(1, Math.min(4, lvl.colorCount || 3)),
        turns: lvl.turns || 10,
        target: lvl.target || 500,
        locked:    Array.isArray(lvl.locked)    ? lvl.locked    : [],
        disabled:  Array.isArray(lvl.disabled)  ? lvl.disabled  : [],
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
    // Sync breakLocks goal locked array from board locked cells
    if (lvl.goals) {
      const blg = lvl.goals.find(g => g.type === 'breakLocks');
      if (blg) blg.locked = [...(lvl.locked || [])];
    }
    if (lvl.goals && lvl.goals.length > 0) obj.goals = lvl.goals;
    if (lvl.locked && lvl.locked.length > 0) obj.locked = lvl.locked;
    if (lvl.disabled && lvl.disabled.length > 0) obj.disabled = lvl.disabled;
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
      <span class="level-info">${lvl.cols}×${lvl.rows} | ${lvl.colorCount} colors | ${lvl.turns} turns</span>
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
  let html = `<div class="mini-grid" style="grid-template-columns:repeat(${lvl.cols},1fr);grid-template-rows:repeat(${lvl.rows},1fr)">`;
  for (let r = 0; r < lvl.rows; r++) {
    for (let c = 0; c < lvl.cols; c++) {
      const key = `${r},${c}`;
      let cls = 'mini-cell';
      if (disabledSet.has(key))    cls += ' disabled';
      else if (lockedSet.has(key)) cls += ' locked';
      html += `<div class="${cls}"></div>`;
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
  renderBoard();
  renderGoals();
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
    locked: [],
    disabled: [],
    goals: [{ type: 'score', target: 500 }],
  };
  levels.push(newLevel);
  selectLevel(levels.length - 1);
}

function insertLevel(atIndex) {
  const newLevel = {
    id: atIndex + 1,
    cols: 6, rows: 6, colorCount: 4, turns: 10, target: 500,
    locked: [], disabled: [],
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
  const lockedSet   = new Set((lvl.locked   || []).map(([r, c]) => `${r},${c}`));
  const disabledSet = new Set((lvl.disabled || []).map(([r, c]) => `${r},${c}`));
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
      } else if (lockedSet.has(key)) cell.classList.add('locked');
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
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.addEventListener('click', () => onCellClick(r, c));
      board.appendChild(cell);
    }
  }

  midRow.appendChild(board);
  area.appendChild(midRow);
  boardWrap.appendChild(area);
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
    lvl.locked   = (lvl.locked   || []).map(([r, c]) => [r + 1, c]);
    lvl.disabled = (lvl.disabled || []).map(([r, c]) => [r + 1, c]);
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
  lvl.locked   = (lvl.locked   || []).filter(([row]) => row !== r).map(([row, c]) => [row > r ? row - 1 : row, c]);
  lvl.disabled = (lvl.disabled || []).filter(([row]) => row !== r).map(([row, c]) => [row > r ? row - 1 : row, c]);
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
    lvl.locked   = (lvl.locked   || []).map(([r, c]) => [r, c + 1]);
    lvl.disabled = (lvl.disabled || []).map(([r, c]) => [r, c + 1]);
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
  lvl.locked   = (lvl.locked   || []).filter(([r, col]) => col !== c).map(([r, col]) => [r, col > c ? col - 1 : col]);
  lvl.disabled = (lvl.disabled || []).filter(([r, col]) => col !== c).map(([r, col]) => [r, col > c ? col - 1 : col]);
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

  // Always clear from both sets first, then apply the active tool
  lvl.locked   = (lvl.locked   || []).filter(([r, c]) => !(r === row && c === col));
  lvl.disabled = (lvl.disabled || []).filter(([r, c]) => !(r === row && c === col));

  if (activeTool === 'locked' && !disabledSet.has(key)) {
    lvl.locked = [...lvl.locked, [row, col]];
  } else if (activeTool === 'disabled') {
    lvl.disabled = [...lvl.disabled, [row, col]];
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
    card.innerHTML = `
      <div class="tool-icon">${tool.icon}</div>
      <div class="tool-name">${tool.name}</div>
      <div class="tool-desc">${tool.desc}</div>
    `;
    card.addEventListener('click', () => {
      activeTool = tool.id;
      renderToolbar();
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
