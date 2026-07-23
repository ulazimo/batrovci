// ============================================================
// LEVEL GOALS SYSTEM
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================


// Normalize row/col coverage targets: supports both uniform number and per-index array
// e.g. { timesEachRow: 2 } → [2,2,2,2,2,2]  or  { rows: [1,2,1,1,2,1] } → [1,2,1,1,2,1]
function getRowTargets(g) { return g.rows || Array(ROWS).fill(g.timesEachRow || 1); }
function getColTargets(g) { return g.cols || Array(COLS).fill(g.timesEachCol || 1); }

function initLevelGoals() {
  const lvl = LEVELS[currentLevelIndex];
  const defs = lvl.goals ? [...lvl.goals] : [{ type: 'score', target: lvl.target }];
  const progress = {};

  defs.forEach(g => {
    switch (g.type) {
      case 'colorCollect':
        progress.colorCollect = {};
        Object.keys(g.requirements).forEach(c => progress.colorCollect[c] = 0);
        break;
      case 'specificCombos':
        progress.specificCombos = { count: 0 };
        break;
      case 'markedCards':
        progress.markedCards = { collected: 0, currentMarked: new Set() };
        // Place initial marked cards on random non-special non-locked positions
        const avail = board.map((c, i) => i).filter(i => board[i] && !board[i].special && !board[i].locked);
        const shuffled = avail.sort(() => Math.random() - 0.5);
        for (let k = 0; k < Math.min(g.onBoardCount, shuffled.length); k++) {
          board[shuffled[k]].marked = true;
          progress.markedCards.currentMarked.add(shuffled[k]);
        }
        break;
      case 'orderedCards':
        progress.orderedCards = { nextRequired: 1 };
        if (g.positions) {
          g.positions.forEach(([r, c], idx) => {
            const bi = r * COLS + c;
            if (bi >= 0 && bi < TOTAL && board[bi] && !board[bi].special) {
              board[bi].ordered = idx + 1;
            }
          });
        }
        break;
      case 'colorAvoid':
        progress.colorAvoid = { flips: 0 };
        break;
      case 'rowCoverage':
        progress.rowCoverage = Array(ROWS).fill(0);
        break;
      case 'colCoverage':
        progress.colCoverage = Array(COLS).fill(0);
        break;
      case 'breakLocks':
        // Count total lock *layers* (multi-lock tiles need several breaks each).
        progress.breakLocks = { total: board.filter(c => c && c.locked).reduce((s, c) => s + (c.lockCount || 1), 0), broken: 0 };
        break;
      case 'clearAll':
        // Clear every card — those on the board now plus everything still in the refill deck.
        progress.clearAll = { total: board.filter(c => c && !c.special).length + deck.length };
        break;
    }
  });
  levelGoals = { definitions: defs, progress };
}

function updateGoalProgress(matched, combo) {
  if (!levelGoals) return;
  levelGoals.definitions.forEach(g => {
    switch (g.type) {
      case 'colorCollect':
        matched.forEach(idx => {
          let col = board[idx]?.color;
          // Wild/rainbow cards count as the chain color
          if (!col && board[idx]?.special && getSpecialType(board[idx].special)?.isWild) col = chainColor;
          if (col && g.requirements[col] !== undefined) {
            levelGoals.progress.colorCollect[col] = (levelGoals.progress.colorCollect[col] || 0) + 1;
          }
        });
        break;
      case 'specificCombos':
        if (combo >= g.minLength) levelGoals.progress.specificCombos.count++;
        break;
      case 'markedCards':
        matched.forEach(idx => {
          if (board[idx]?.marked) {
            levelGoals.progress.markedCards.collected++;
            levelGoals.progress.markedCards.currentMarked.delete(idx);
            board[idx].marked = false;
          }
        });
        break;
      case 'orderedCards': {
        const orderedInChain = matched.filter(idx => board[idx]?.ordered).sort((a, b) => board[a].ordered - board[b].ordered);
        let next = levelGoals.progress.orderedCards.nextRequired;
        let failed = false;
        orderedInChain.forEach(idx => {
          if (board[idx].ordered === next) { next++; board[idx].ordered = null; }
          else if (board[idx].ordered > next) { failed = true; }
        });
        levelGoals.progress.orderedCards.nextRequired = next;
        // Out-of-order card consumed — goal is now impossible
        if (failed) {
          stopChainTimer();
          inputLocked = true;
          setTimeout(() => levelFailed(), 600);
        }
        break;
      }
      case 'rowCoverage': {
        const rows = new Set();
        matched.forEach(idx => rows.add(toRC(idx).r));
        rows.forEach(r => levelGoals.progress.rowCoverage[r]++);
        break;
      }
      case 'colCoverage': {
        const cols = new Set();
        matched.forEach(idx => cols.add(toRC(idx).c));
        cols.forEach(c => levelGoals.progress.colCoverage[c]++);
        break;
      }
    }
  });
  updateGoalHUD();
}

function trackColorAvoidFlip(color) {
  if (!levelGoals) return;
  const g = levelGoals.definitions.find(d => d.type === 'colorAvoid');
  if (g && g.color === color) {
    levelGoals.progress.colorAvoid.flips++;
    updateGoalHUD();
    if (levelGoals.progress.colorAvoid.flips >= g.maxFlips) {
      // Immediate fail — let the current card flip animation finish first
      stopChainTimer();
      inputLocked = true;
      setTimeout(() => levelFailed(), 600);
    }
  }
}

function spawnMarkedCards() {
  if (!levelGoals) return;
  const g = levelGoals.definitions.find(d => d.type === 'markedCards');
  if (!g) return;
  const mp = levelGoals.progress.markedCards;
  while (mp.currentMarked.size < g.onBoardCount && mp.collected + mp.currentMarked.size < g.totalToCollect) {
    const avail = board.map((c, i) => i).filter(i =>
      board[i] && !board[i].special && !board[i].locked && !board[i].marked && !board[i].flipped
    );
    if (!avail.length) break;
    const idx = avail[Math.floor(Math.random() * avail.length)];
    board[idx].marked = true;
    mp.currentMarked.add(idx);
    replaceCell(idx);
  }
}

function checkAllGoalsMet() {
  if (!levelGoals) return score >= TARGET;
  return levelGoals.definitions.every(g => {
    switch (g.type) {
      case 'score':         return score >= g.target;
      case 'colorCollect':  return Object.entries(g.requirements).every(([c, n]) => (levelGoals.progress.colorCollect[c] || 0) >= n);
      case 'specificCombos': return levelGoals.progress.specificCombos.count >= g.count;
      case 'markedCards':   return levelGoals.progress.markedCards.collected >= g.totalToCollect;
      case 'orderedCards':  return levelGoals.progress.orderedCards.nextRequired > g.count;
      case 'colorAvoid':    return levelGoals.progress.colorAvoid.flips < g.maxFlips;
      case 'rowCoverage':   { const t = getRowTargets(g); return levelGoals.progress.rowCoverage.every((c, i) => c >= t[i]); }
      case 'colCoverage':   { const t = getColTargets(g); return levelGoals.progress.colCoverage.every((c, i) => c >= t[i]); }
      case 'breakLocks':   return levelGoals.progress.breakLocks.broken >= levelGoals.progress.breakLocks.total;
      case 'clearAll':     return deck.length === 0 && !board.some(c => c && !c.special);
      default: return true;
    }
  });
}

function colorSwatch(c) {
  const hex = { red:'#e74c3c', green:'#2ecc71', blue:'#3498db', yellow:'#f1c40f' }[c] || '#fff';
  return `<span class="color-swatch" style="background:${hex}"></span>`;
}
function capColor(c) { return c.charAt(0).toUpperCase() + c.slice(1); }

function goalIcon(type) {
  return { score:'🎯', colorCollect:'🎨', specificCombos:'🔗', markedCards:'⭐',
           orderedCards:'🔢', colorAvoid:'🚫', rowCoverage:'↔', colCoverage:'↕',
           breakLocks:'🔓', clearAll:'🧹' }[type] || '📋';
}

function goalDescription(g) {
  switch (g.type) {
    case 'score':         return `Reach a score of ${g.target}`;
    case 'colorCollect':  return 'Collect ' + Object.entries(g.requirements).map(([c, n]) => `${n} ${colorSwatch(c)}`).join(' and ');
    case 'specificCombos': return `Make ${g.count} combo${g.count>1?'s':''} of ${g.minLength}+ cards`;
    case 'markedCards':   return `Collect ${g.totalToCollect} marked ⭐ cards`;
    case 'orderedCards':  return `Collect ${g.count} numbered cards in order`;
    case 'colorAvoid':    return `Don't open ${g.maxFlips} ${colorSwatch(g.color)} cards (${g.maxFlips} lives)`;
    case 'rowCoverage':   { const t = getRowTargets(g); const u = [...new Set(t)]; return u.length === 1 ? `Use every row ${u[0]} time${u[0]>1?'s':''}` : `Use rows (${t.join(',')} times)`; }
    case 'colCoverage':   { const t = getColTargets(g); const u = [...new Set(t)]; return u.length === 1 ? `Use every column ${u[0]} time${u[0]>1?'s':''}` : `Use cols (${t.join(',')} times)`; }
    case 'breakLocks':   return `Break all ${g.locked ? g.locked.length : ''} locked tiles`;
    case 'clearAll':     return 'Clear the whole board — cards refill from the deck until it runs out';
    default: return '';
  }
}

function getGoalDisplay(g) {
  const p = levelGoals.progress;
  switch (g.type) {
    case 'score':
      return { icon:'🎯', label:'Score', current: score, target: g.target, done: score >= g.target };
    case 'colorCollect': {
      const entries = Object.entries(g.requirements);
      const allDone = entries.every(([c, n]) => (p.colorCollect[c] || 0) >= n);
      const label = entries.map(([c, n]) => {
        const have = p.colorCollect[c] || 0;
        const met = have >= n;
        return `<span class="goal-color-item${met ? ' done' : ''}">${colorSwatch(c)} ${have}/${n}</span>`;
      }).join(' ');
      return { icon:'🎨', label, current: 0, target: 0, done: allDone, customLabel: true };
    }
    case 'specificCombos':
      return { icon:'🔗', label:`${g.minLength}+ combos`, current: p.specificCombos.count, target: g.count, done: p.specificCombos.count >= g.count };
    case 'markedCards':
      return { icon:'⭐', label:'Marked', current: p.markedCards.collected, target: g.totalToCollect, done: p.markedCards.collected >= g.totalToCollect };
    case 'orderedCards':
      return { icon:'🔢', label:'In order', current: p.orderedCards.nextRequired - 1, target: g.count, done: p.orderedCards.nextRequired > g.count };
    case 'colorAvoid': {
      const left = g.maxFlips - p.colorAvoid.flips;
      return { icon:'🚫', label:`Avoid ${colorSwatch(g.color)}`, current: left, target: g.maxFlips, done: left > 0, livesOnly: true };
    }
    case 'rowCoverage': {
      const t = getRowTargets(g);
      const done = p.rowCoverage.filter((c, i) => c >= t[i]).length;
      return { icon:'↔', label:'Rows', current: done, target: ROWS, done: done >= ROWS };
    }
    case 'colCoverage': {
      const t = getColTargets(g);
      const done = p.colCoverage.filter((c, i) => c >= t[i]).length;
      return { icon:'↕', label:'Cols', current: done, target: COLS, done: done >= COLS };
    }
    case 'breakLocks':
      return { icon:'🔓', label:'Locks', current: p.breakLocks.broken, target: p.breakLocks.total, done: p.breakLocks.broken >= p.breakLocks.total };
    case 'clearAll': {
      const total = p.clearAll.total;
      const remaining = board.filter(c => c && !c.special).length + deck.length;
      return { icon:'🧹', label:'Cleared', current: total - remaining, target: total, done: remaining === 0 };
    }
    default: return { icon:'📋', label:'', current: 0, target: 0, done: true };
  }
}

function updateGoalHUD() {
  const el = document.getElementById('goal-hud');
  if (!el) return;
  if (!levelGoals) { el.style.display = 'none'; return; }
  const nonScore = levelGoals.definitions.filter(g => g.type !== 'score');
  if (nonScore.length === 0) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  const pills = levelGoals.definitions.map(g => {
    const d = getGoalDisplay(g);
    const countHtml = d.customLabel ? '' : `<span class="goal-count">${d.livesOnly ? d.current : d.current + '/' + d.target}</span>`;
    return `<div class="goal-pill ${d.done ? 'goal-done' : ''}">
      <span class="goal-icon">${d.icon}</span>
      <span class="goal-text">${d.label}</span>
      ${countHtml}
    </div>`;
  }).join('');
  el.innerHTML = `<div class="goal-hud-title">Goals</div><div class="goal-items">${pills}</div>`;
  updateCoverageIndicators();
}

function renderCoverageIndicators() {
  const colEl = document.getElementById('col-indicators');
  const rowEl = document.getElementById('row-indicators');
  if (!colEl || !rowEl) return;
  const hasCol = levelGoals?.definitions.some(g => g.type === 'colCoverage');
  const hasRow = levelGoals?.definitions.some(g => g.type === 'rowCoverage');

  if (hasCol) {
    colEl.classList.add('active');
    colEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    // Offset for row indicators if both active
    if (hasRow) colEl.style.marginLeft = '19px';
    else colEl.style.marginLeft = '';
    colEl.innerHTML = Array.from({ length: COLS }, (_, c) => `<div class="cov-ind" data-col="${c}">C${c + 1}</div>`).join('');
  } else {
    colEl.classList.remove('active');
    colEl.innerHTML = '';
  }

  if (hasRow) {
    rowEl.classList.add('active');
    rowEl.innerHTML = Array.from({ length: ROWS }, (_, r) => `<div class="cov-ind" data-row="${r}">R${r + 1}</div>`).join('');
  } else {
    rowEl.classList.remove('active');
    rowEl.innerHTML = '';
  }
}

function updateCoverageIndicators() {
  if (!levelGoals) return;
  const p = levelGoals.progress;

  const rowGoal = levelGoals.definitions.find(g => g.type === 'rowCoverage');
  if (rowGoal) {
    const targets = getRowTargets(rowGoal);
    document.querySelectorAll('#row-indicators .cov-ind').forEach(el => {
      const r = parseInt(el.dataset.row);
      const count = p.rowCoverage[r] || 0;
      const needed = targets[r];
      el.classList.toggle('done', count >= needed);
      el.textContent = count >= needed ? '✓' : `${count}/${needed}`;
    });
  }

  const colGoal = levelGoals.definitions.find(g => g.type === 'colCoverage');
  if (colGoal) {
    const targets = getColTargets(colGoal);
    document.querySelectorAll('#col-indicators .cov-ind').forEach(el => {
      const c = parseInt(el.dataset.col);
      const count = p.colCoverage[c] || 0;
      const needed = targets[c];
      el.classList.toggle('done', count >= needed);
      el.textContent = count >= needed ? '✓' : `${count}/${needed}`;
    });
  }
}
