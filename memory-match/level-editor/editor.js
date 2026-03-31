// ============================================================
// STATE
// ============================================================
let levels = [];
let selectedLevelIndex = -1;
let activeTool = 'normal';
let undoStack = [];
let redoStack = [];
let loadedFileName = 'levels';

// ============================================================
// TOOLS
// ============================================================
const TOOLS = [
  { id: 'normal',   icon: '🟦', name: 'Normal',   desc: 'Regular card cell' },
  { id: 'locked',   icon: '🔒', name: 'Locked',   desc: 'Locked until adjacent combo' },
  { id: 'disabled', icon: '<img src="../blocks/disabled.png" style="width:32px;height:32px;border-radius:4px;opacity:.7">', name: 'Disabled', desc: 'Empty cell — no card, no interaction' },
  { id: 'eraser',   icon: '🧹', name: 'Eraser',   desc: 'Clear cell to normal' },
];

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
const propTarget     = document.getElementById('prop-target');

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
  propTarget.addEventListener('change', () => {
    updateLevelProperty('target', parseInt(propTarget.value));
  });

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

function downloadJSON() {
  if (levels.length === 0) { alert('No levels to download.'); return; }
  // Build clean output
  const output = levels.map(lvl => {
    const obj = {
      id: lvl.id,
      cols: lvl.cols,
      rows: lvl.rows,
      colorCount: lvl.colorCount,
      turns: lvl.turns,
      target: lvl.target,
    };
    if (lvl.locked && lvl.locked.length > 0) {
      obj.locked = lvl.locked;
    }
    if (lvl.disabled && lvl.disabled.length > 0) {
      obj.disabled = lvl.disabled;
    }
    return obj;
  });
  const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = loadedFileName + '.json';
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
      <span class="level-info">${lvl.cols}×${lvl.rows} | ${lvl.colorCount} colors<br>${lvl.turns} turns | ${lvl.target} pts</span>
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
  propTarget.value = lvl.target;

  renderBoard();
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
  };
  levels.push(newLevel);
  selectLevel(levels.length - 1);
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
  const key = `${row},${col}`;
  const lockedSet   = new Set((lvl.locked   || []).map(([r, c]) => `${r},${c}`));
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

  renderBoard();
  renderLevelList();
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
// BOOT
// ============================================================
init();
