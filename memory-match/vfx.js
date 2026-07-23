// ============================================================
// VISUAL EFFECTS — juice, animations, banners, sweep, score popup
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

// ============================================================
// JUICE HELPERS
// ============================================================

function spawnBombVFX(cellEl) {
  const rect = cellEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const container = document.createElement('div');
  container.className = 'bomb-vfx';
  container.style.left = cx + 'px';
  container.style.top = cy + 'px';
  container.style.position = 'fixed';

  const particles = [
    { tx:  90, ty: -90, color: '#ffaa00' },
    { tx:-105, ty: -60, color: '#ff0000' },
    { tx:  60, ty: 105, color: '#ffcc00' },
    { tx: -75, ty:  75, color: '#ff5500' },
    { tx:   0, ty:-120, color: '#ffaa00' },
    { tx: 120, ty:   0, color: '#ff0000' },
    { tx:-120, ty:   0, color: '#ffcc00' },
    { tx:   0, ty: 120, color: '#ff5500' },
    { tx:  68, ty:  30, color: '#ffffff' },
    { tx: -45, ty: -30, color: '#ffeeaa' },
  ];
  particles.forEach(p => {
    const el = document.createElement('div');
    el.className = 'vfx-particle';
    el.style.cssText = `--tx:${p.tx}px;--ty:${p.ty}px;--color:${p.color}`;
    container.appendChild(el);
  });

  document.body.appendChild(container);
  // Trigger animation
  void container.offsetWidth;
  container.classList.add('is-exploding');
  setTimeout(() => container.remove(), 600);
}

function explodeBomb(idx) {
  const el = getCardEl(idx);
  if (!el) return;
  el.classList.add('bomb-exploding');
  SFX.boom();
  // Spawn particle VFX after the card starts fading (halfway through)
  setTimeout(() => {
    const cell = boardEl.children[idx];
    if (cell) spawnBombVFX(cell);
  }, 150);
}

function shakeBoard() {
  boardContainerEl.classList.remove('board-shake');
  void boardContainerEl.offsetWidth; // reflow to restart animation
  boardContainerEl.classList.add('board-shake');
  boardContainerEl.addEventListener('animationend', () => boardContainerEl.classList.remove('board-shake'), { once: true });
}

function spawnParticles(indices, color) {
  const hex = { red:'#e74c3c', green:'#2ecc71', blue:'#3498db', yellow:'#f1c40f' }[color] || '#fff';
  indices.slice(0, 5).forEach(idx => {
    const cell = boardEl.children[idx]; if (!cell) return;
    const r = cell.getBoundingClientRect();
    for (let i = 0; i < 9; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.cssText = `left:${r.left+r.width/2}px;top:${r.top+r.height/2}px;background:${i%3===0?'#fff':hex};--dx:${(Math.random()-.5)*110}px;--dy:${(Math.random()-.5)*110}px;animation-duration:${.4+Math.random()*.25}s`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 700);
    }
  });
}

// Fly matched cards to score element with staggered ding + score
function flyCardsToGoal(indices, ptsTotal, cb) {
  // Fly toward the Collection graveyard when it's active; otherwise the score.
  const useCollection = (typeof collectionEnabled === 'function') && collectionEnabled();
  const scoreTarget = document.getElementById(useCollection ? 'collection-stack' : 'score-value');
  // Capture colours before the cards are removed, so the graveyard shows real tiles.
  const flyColors = indices.map(idx => board[idx] && !board[idx].special ? board[idx].color : null);
  if (!scoreTarget || indices.length === 0) {
    indices.forEach(idx => { const el = getCardEl(idx); if (el) el.classList.add('exploding'); });
    if (useCollection) flyColors.forEach(c => addToCollection(c));
    if (cb) setTimeout(cb, 450);
    return;
  }
  const targetRect = scoreTarget.getBoundingClientRect();
  const targetCX = targetRect.left + targetRect.width / 2;
  const targetCY = targetRect.top + targetRect.height / 2;
  const ptsPerCard = indices.length > 0 ? Math.floor(ptsTotal / indices.length) : 0;
  const remainder = ptsTotal - ptsPerCard * indices.length;
  const stagger = Math.min(120, 600 / indices.length);
  const flyDuration = 350;

  // Hide originals immediately
  indices.forEach(idx => {
    const el = getCardEl(idx);
    if (el) el.style.opacity = '0';
  });

  indices.forEach((idx, i) => {
    const cell = boardEl.children[idx];
    if (!cell) return;
    const cellRect = cell.getBoundingClientRect();

    const clone = document.createElement('div');
    clone.className = 'fly-to-goal';
    clone.style.left = cellRect.left + 'px';
    clone.style.top = cellRect.top + 'px';
    clone.style.width = cellRect.width + 'px';
    clone.style.height = cellRect.height + 'px';

    const cardEl = getCardEl(idx);
    const front = cardEl ? cardEl.querySelector('.card-front') : null;
    if (front) clone.innerHTML = front.innerHTML;
    clone.style.background = front ? getComputedStyle(front).background : '';
    clone.style.borderRadius = '4px';

    document.body.appendChild(clone);

    setTimeout(() => {
      clone.style.transition = `left ${flyDuration}ms cubic-bezier(.4,0,.2,1), top ${flyDuration}ms cubic-bezier(.4,0,.2,1), width ${flyDuration}ms ease-in, height ${flyDuration}ms ease-in, opacity ${flyDuration}ms ease-in`;
      clone.style.left = (targetCX - 8) + 'px';
      clone.style.top = (targetCY - 8) + 'px';
      clone.style.width = '16px';
      clone.style.height = '16px';
      clone.style.opacity = '0.7';

      setTimeout(() => {
        SFX.ding(i);
        SFX.shepard(i);
        clone.classList.add('burst');
        setTimeout(() => clone.remove(), 300);

        // Pop the target element
        scoreTarget.style.transition = 'transform 0.15s ease-out';
        scoreTarget.style.transform = 'scale(1.25)';
        setTimeout(() => { scoreTarget.style.transform = 'scale(1)'; }, 150);

        // Drop the tile into the graveyard as it lands.
        if (useCollection) addToCollection(flyColors[i]);

        const cardPts = ptsPerCard + (i === indices.length - 1 ? remainder : 0);
        if (cardPts > 0) {
          score += cardPts;
          animateScore(score);
        }
      }, flyDuration);
    }, i * stagger);
  });

  const totalTime = (indices.length - 1) * stagger + flyDuration + 300;
  if (cb) setTimeout(cb, totalTime);
}

function launchConfetti() {
  const colors = ['#D01012','#FFD700','#006CB7','#237841','#ff6b6b','#f0c040','#4fc3f7'];
  for (let i = 0; i < 70; i++) {
    setTimeout(() => {
      const c = document.createElement('div');
      c.className = 'confetto';
      const size = 4 + Math.random() * 7;
      c.style.cssText = `left:${Math.random()*100}%;width:${size}px;height:${size}px;background:${colors[i%colors.length]};border-radius:${Math.random()>.5?'50%':'2px'};animation-duration:${.9+Math.random()*.9}s`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 2200);
    }, i * 22);
  }
}

let _scoreDisplayed = 0;
function animateScore(to) {
  const from = _scoreDisplayed;
  if (from === to) return;
  const dur = Math.min(500, Math.abs(to - from) * 1.5);
  const start = performance.now();
  (function tick(now) {
    const t = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    _scoreDisplayed = Math.round(from + (to - from) * e);
    scoreEl.textContent = _scoreDisplayed;
    if (t < 1) requestAnimationFrame(tick);
  })(start);
}


// ============================================================
// PERFECT SWEEP BOARD REVEAL
// ============================================================
function showBoardBanner(type, title, sub) {
  inputLocked = true;
  let banner = boardContainerEl.querySelector('.board-banner');
  if (banner) banner.remove();
  banner = document.createElement('div');
  banner.className = `board-banner ${type}`;
  banner.innerHTML = `<div class="banner-title">${title}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`;
  boardContainerEl.appendChild(banner);
}

function hideBoardBanner(cb) {
  const banner = boardContainerEl.querySelector('.board-banner');
  if (!banner) { inputLocked = false; cb?.(); return; }
  // animationend can silently fail to fire (reduced motion, backgrounded tab, interrupted
  // paint) — a fallback timeout guarantees we never leave the game locked behind a banner.
  let done = false;
  const finish = () => { if (done) return; done = true; banner.remove(); inputLocked = false; cb?.(); };
  banner.classList.add('hiding');
  banner.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 550);
}

function showGoalIntroBanner(cb) {
  if (!levelGoals) { cb?.(); return; }
  const defs = levelGoals.definitions;
  if (defs.length === 0) { cb?.(); return; }

  // Build goal pills HTML with full descriptions
  const pills = defs.map(g => {
    const d = getGoalDisplay(g);
    const desc = goalDescription(g);
    return `<div class="banner-goal-pill"><span>${d.icon}</span><span>${desc}</span></div>`;
  }).join('');

  let banner = boardContainerEl.querySelector('.board-banner');
  if (banner) banner.remove();
  banner = document.createElement('div');
  banner.className = 'board-banner goal-intro';
  banner.innerHTML = `<div class="banner-title">Level ${LEVELS[currentLevelIndex].id}</div><div class="banner-goals">${pills}</div>`;
  boardContainerEl.appendChild(banner);

  // Hold then dismiss
  setTimeout(() => {
    let done = false;
    const finish = () => { if (done) return; done = true; banner.remove(); cb?.(); };
    banner.classList.add('hiding');
    banner.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 550); // fallback if animationend doesn't fire
  }, 1800);
}

function showSweepBanner() { showBoardBanner('sweep', '🧹 PERFECT SWEEP!', 'Revealing the NEW board...'); }
function hideSweepBanner(cb) { hideBoardBanner(cb); }

// Small, non-blocking banner shown when a chain clears every remaining card of a
// colour: "<COLOUR> Cleared" — the colour name tinted, "Cleared" in white. It never
// locks input and auto-dismisses, so it rides alongside the collect animation.
function showColorClearBanner(colors) {
  if (!colors || !colors.length) return;
  const hex = c => ({ red:'#e74c3c', green:'#2ecc71', blue:'#3498db', yellow:'#f1c40f' }[c] || '#fff');
  const names = colors.map(c => `<span style="color:${hex(c)}">${c.toUpperCase()}</span>`).join(' + ');
  const prev = boardContainerEl.querySelector('.color-clear-banner');
  if (prev) prev.remove();
  const banner = document.createElement('div');
  banner.className = 'color-clear-banner';
  banner.innerHTML = `${names} <span class="cc-word">Cleared</span>`;
  boardContainerEl.appendChild(banner);
  setTimeout(() => {
    let done = false;
    const finish = () => { if (done) return; done = true; banner.remove(); };
    banner.classList.add('hiding');
    banner.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 500); // fallback if animationend doesn't fire
  }, 1100);
}

// "+1" turn-refund feedback: clearing a colour refunds the spent turn. Floats a green
// +1 above the Turns counter and gives the counter a quick pulse.
function showTurnRefund() {
  const stat = document.getElementById('stat-turns');
  if (stat) {
    const rect = stat.getBoundingClientRect();
    const floater = document.createElement('div');
    floater.className = 'turn-refund-float';
    floater.textContent = '+1';
    floater.style.left = `${rect.left + rect.width / 2}px`;
    floater.style.top = `${rect.top}px`;
    document.body.appendChild(floater);
    setTimeout(() => floater.remove(), 900);
  }
  turnsEl.classList.add('refund-pulse');
  turnsEl.addEventListener('animationend', () => turnsEl.classList.remove('refund-pulse'), { once: true });
}

function sweepRevealBoard(cb) {
  const targets = [];
  board.forEach((c, i) => { if (c && !c.special && !c.flipped && !c.locked) targets.push(i); });
  if (!targets.length) { cb(); return; }

  // Regenerate colors and update DOM
  targets.forEach(idx => {
    board[idx].color = randomColor();
    replaceCell(idx);
  });

  lastRevealedCards = targets;
  const stagger = 30;
  targets.forEach((idx, i) => {
    setTimeout(() => {
      board[idx].flipped = true;
      const el = getCardEl(idx);
      if (el) { el.classList.add('flipped', 'reveal-flash'); el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true}); }
      SFX.cardFlip();
    }, i * stagger);
  });
  const holdMs = Math.min(1500 + targets.length * 80, 3000);
  setTimeout(() => {
    targets.forEach(idx => {
      const c = board[idx];
      if (c && c.flipped && !c.special) { c.flipped = false; const el = getCardEl(idx); if (el) el.classList.remove('flipped'); }
    });
    cb();
  }, targets.length * stagger + holdMs);
}


// ============================================================
// SCORE POPUP
// ============================================================
function showScorePopup(pts, indices, extraMsg) {
  const mid = indices[Math.floor(indices.length/2)];
  const cell = boardEl.children[mid]; if(!cell) return;
  const rect = cell.getBoundingClientRect();
  const p = document.createElement('div'); p.className='score-popup';
  p.textContent = `+${pts}`;
  p.style.left = `${rect.left+rect.width/2-30}px`;
  p.style.top  = `${rect.top}px`;
  document.body.appendChild(p); setTimeout(()=>p.remove(), 1000);
  if (extraMsg) {
    const m = document.createElement('div'); m.className='score-popup';
    m.textContent = extraMsg;
    m.style.left = `${rect.left+rect.width/2-60}px`;
    m.style.top  = `${rect.top - 30}px`;
    m.style.fontSize = '18px'; m.style.color = '#f0c040'; m.style.width = '140px'; m.style.textAlign = 'center';
    document.body.appendChild(m); setTimeout(()=>m.remove(), 1500);
  }
}


// ============================================================
// INITIAL BOARD REVEAL — streak determines how much is shown
// ============================================================
function revealEntireBoard(onComplete) {
  inputLocked = true;
  const revealCount = isWinStreakActive() ? getStreakRevealCount() : 0;
  const revealMs  = Math.min(1500 + progress.winStreak * 250, 3500);
  const staggerMs = 50;

  // Decide which cards get the streak pre-reveal (stay face-up permanently)
  const streakIndices = new Set();
  if (revealCount > 0) {
    const indices = board.map((_, i) => i).filter(i => board[i] && !board[i].locked && !board[i].special);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const count = Math.min(revealCount, indices.length);
    indices.slice(0, count).forEach(idx => streakIndices.add(idx));
  }

  // Briefly flash only streak-awarded cards, then hide them
  if (streakIndices.size > 0) {
    lastRevealedCards = [...streakIndices];
    board.forEach((c, i) => {
      if (!c || !streakIndices.has(i)) return;
      c.flipped = true;
      const el = getCardEl(i);
      if (el) setTimeout(() => {
        el.classList.add('flipped');
        setTimeout(() => { el.classList.remove('flipped'); c.flipped = false; }, revealMs);
      }, i * staggerMs);
    });
  }

  const unlockDelay = streakIndices.size > 0 ? TOTAL * staggerMs + revealMs + 200 : 200;
  setTimeout(() => {
    inputLocked = false; updateBoosterUI(); updateRecallButton();
    advanceTutorial('boardRevealed');
    if (onComplete) onComplete();
  }, unlockDelay);
}
