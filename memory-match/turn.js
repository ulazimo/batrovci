// ============================================================
// TURN LOOP — onCardClick, endTurn, place/reveal new cards
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

// ============================================================
// CARD CLICK
// ============================================================
function onCardClick(index) {
  if (isBombAiming()) return; // bomb drag-to-place owns board input while active
  if (inputLocked) return;
  const card = board[index];
  if (!card || turns <= 0) return;

  // Nudge: dismiss on any action, restart idle timer
  dismissNudge();
  clearNudgeTimer();

  if (activeBooster) {
    const ab = BOOSTERS.find(x => x.id === activeBooster);
    if (ab && ab.bomb) { detonateBoosterBomb(index); return; }
    if (card.special) return;
    executeBoosterTap(activeBooster, index);
    return;
  }

  // Spotlight mode: next tap on a face-down card permanently reveals it
  if (spotlightMode && !card.special && !card.flipped && !card.locked) {
    spotlightMode = false;
    card.flipped = true;
    const cel = getCardEl(index);
    if (cel) { cel.classList.add('flipped', 'reveal-flash'); cel.addEventListener('animationend', () => cel.classList.remove('reveal-flash'), {once:true}); }
    SFX.match();
    inputLocked = false;
    updateBoosterUI();
    updateChainIndicator();
    return;
  }

  if (card.special) {
    const spec = getSpecialType(card.special);
    if (!spec) return;

    // Wild card: acts as a color wildcard in combos
    if (spec.isWild) {
      SFX.match();
      getCardEl(index).classList.add('used');
      if (!turnActive) {
        turnActive = true; chainColor = null; chainColors = new Set(); chainCards = [index]; specialsUsed = [];
      } else {
        chainCards.push(index);
      }
      lastSelectedIdx = index;
      SFX.shepard(chainCards.length + specialsUsed.length - 1);
      const chainLen = chainCards.length + specialsUsed.length;
      if (chainLen === 3) { startChainTimer(); applyChainColorHint(); }
      else if (chainLen > 3) resetChainTimer();
      updateChainIndicator();
      return;
    }

    // Mark special as used and register in turn
    function markUsed() {
      SFX.special();
      getCardEl(index).classList.add('used');
      if (!turnActive) { turnActive = true; chainColor = null; chainColors = new Set(); chainCards = []; specialsUsed = [index]; lastSelectedIdx = index; SFX.shepard(0); }
      else if (!specialsUsed.includes(index)) { specialsUsed.push(index); lastSelectedIdx = index; SFX.shepard(chainCards.length + specialsUsed.length - 1); }
      // Colored bombs: add bomb's color as a parallel chain color
      if (getRule('coloredBombs') && card.bombColor && isBombType(card.special)) {
        chainColors.add(card.bombColor);
      }
      const chainLen = chainCards.length + specialsUsed.length;
      if (chainLen === 3) { startChainTimer(); applyChainColorHint(); }
      else if (chainLen > 3) resetChainTimer();
      updateChainIndicator();
    }

    // Instant mode OR special types that always activate immediately
    const alwaysInstant = ['peek', 'tint', 'spotlight', 'echo'];
    if (getRule('instantSpecialReveal') || alwaysInstant.includes(card.special)) {
      markUsed();

      if (card.special === 'echo') {
        // Echo: next flipped card stays visible 1 extra turn
        echoCharges++;
        inputLocked = false;
        updateBoosterUI();
        return;
      }

      if (card.special === 'spotlight') {
        // Spotlight: enter tap mode
        spotlightMode = true;
        updateBoosterUI();
        return;
      }

      if (card.special === 'tint') {
        // Tint: add color hints to nearby face-down cards
        const targets = getRevealPattern(card.special, index)
          .filter(i => board[i] && !board[i].special && !board[i].flipped && !board[i].locked);
        const tintTargets = targets.slice(0, spec.tintCount || 4);
        spawnParticles([index], chainColor || 'blue');
        tintTargets.forEach((idx, ti) => {
          setTimeout(() => {
            const cel = getCardEl(idx);
            if (cel && !board[idx].flipped && !board[idx].locked) {
              const color = board[idx].color;
              const colorMap = { red:'#e74c3c', green:'#2ecc71', blue:'#3498db', yellow:'#f1c40f' };
              cel.classList.add('tinted');
              cel.style.setProperty('--tint-color', colorMap[color] || '#5b9bd5');
            }
          }, ti * 60);
        });
        inputLocked = false;
        updateBoosterUI();
        return;
      }

      // Peek and cross/ring/diamond: reveal targets
      inputLocked = true;
      pauseChainTimer();
      const targets = getRevealPattern(card.special, index)
        .filter(i => board[i] && !board[i].special && !board[i].flipped && !board[i].locked);
      spawnParticles([index], chainColor || 'red');

      targets.forEach((idx, ti) => {
        setTimeout(() => {
          board[idx].flipped = true;
          const cel = getCardEl(idx);
          if (cel) { cel.classList.add('flipped', 'reveal-flash'); cel.addEventListener('animationend', () => cel.classList.remove('reveal-flash'), {once:true}); }
        }, 100 + ti * 70);
      });

      // Colored bombs: find revealed cards that match the bomb's color — they join the chain
      const bombAutoChain = (getRule('coloredBombs') && card.bombColor && isBombType(card.special))
        ? targets.filter(idx => board[idx].color === card.bombColor)
        : [];

      // All instant reveals are temporary flashes — peek is shorter
      const hideDelay = 100 + Math.max(targets.length, 1) * 70 + (spec.temporary ? 1500 : 2000);
      setTimeout(() => {
        targets.forEach(idx => {
          // Keep bomb-color matched cards face-up — they're part of the chain now
          if (bombAutoChain.includes(idx)) return;
          board[idx].flipped = false; const cel = getCardEl(idx); if (cel) cel.classList.remove('flipped');
        });
        // Auto-add bomb-color cards to chain
        if (bombAutoChain.length > 0) {
          bombAutoChain.forEach(idx => { if (!chainCards.includes(idx)) { chainCards.push(idx); SFX.shepard(chainCards.length + specialsUsed.length - 1); } });
          const chainLen = chainCards.length + specialsUsed.length;
          if (chainLen === 3) { startChainTimer(); applyChainColorHint(); }
          else if (chainLen > 3) resetChainTimer();
          // Check all-colors bonus
          if (chainColors.size >= ACTIVE_COLORS.length) { checkAllColorsBonus(); return; }
        }
        inputLocked = false;
        resumeChainTimer();
        updateBoosterUI();
        updateChainIndicator();
      }, hideDelay);
      return;
    }

    // Default mode: mark special as used, reveal at end of turn
    markUsed();
    return;
  }

  if (card.flipped || card.locked) return;

  card.flipped = true;
  trackColorAvoidFlip(card.color);
  const el = getCardEl(index); el.classList.add('flipped');
  // Remove tint hint when card is flipped
  if (el.classList.contains('tinted')) { el.classList.remove('tinted'); el.style.removeProperty('--tint-color'); }
  SFX.flip();

  if (!turnActive) { turnActive=true; chainColor=card.color; chainColors=new Set([card.color]); chainCards=[index]; specialsUsed=[]; lastSelectedIdx=index; SFX.shepard(chainCards.length + specialsUsed.length - 1); updateChainIndicator(); advanceTutorial('firstFlip'); startNudgeIdleTimer(); tryAutoResolveColor(); return; }
  if (chainColor === null) { chainColor=card.color; chainColors=new Set([card.color]); chainCards.push(index); lastSelectedIdx=index; SFX.shepard(chainCards.length + specialsUsed.length - 1); updateChainIndicator(); startNudgeIdleTimer(); tryAutoResolveColor(); return; }
  // Match: primary chain color OR any parallel chain color (colored bombs)
  const colorMatch = card.color === chainColor || (getRule('coloredBombs') && chainColors.has(card.color));
  if (colorMatch) {
    SFX.match(); chainCards.push(index); lastSelectedIdx=index; SFX.shepard(chainCards.length + specialsUsed.length - 1);
    // If this is a parallel color and no primary was set yet, adopt it
    if (chainColor === null) { chainColor = card.color; chainColors.add(card.color); }
    const chainLen = chainCards.length + specialsUsed.length;
    if (chainLen === 2) advanceTutorial('firstMatch');
    if (chainLen === 3) { startChainTimer(); advanceTutorial('chainOf3'); applyChainColorHint(); }
    else if (chainLen > 3) resetChainTimer();
    updateChainIndicator();
    // All cards of the chain colour opened? Resolve the sweep. (Cleaning waives the
    // combo minimum when only 1-2 of the colour remained — handled in tryAutoResolveColor.)
    tryAutoResolveColor();
    // Check all-colors-active bonus
    if (getRule('coloredBombs') && chainColors.size >= ACTIVE_COLORS.length) {
      checkAllColorsBonus();
    }
    startNudgeIdleTimer();
    return;
  }

  if (shieldCharges > 0) {
    shieldCharges--; updateStatusBadge();
    // Let player see the wrong color, then flip back, then show shield break
    setTimeout(() => {
      card.flipped = false; el.classList.remove('flipped');
      // After card is hidden, play shield break effect
      setTimeout(() => {
        const breakIcon = document.createElement('span');
        breakIcon.className = 'shield-break-icon';
        breakIcon.textContent = '🛡';
        el.style.position = 'relative';
        el.appendChild(breakIcon);
        setTimeout(() => breakIcon.remove(), 1200);
        // Floating "-1 🛡" text above the card
        const rect = el.getBoundingClientRect();
        const floater = document.createElement('div');
        floater.className = 'shield-float-text';
        floater.textContent = '-1 🛡';
        floater.style.left = `${rect.left + rect.width / 2 - 20}px`;
        floater.style.top = `${rect.top - 5}px`;
        document.body.appendChild(floater);
        setTimeout(() => floater.remove(), 1400);
      }, 300);
    }, 600);
    updateChainIndicator(); return;
  }

  const comboLen = chainCards.length + specialsUsed.length;
  // Only a genuine miss (chain below the scoring minimum) gets the fail buzz + shake.
  // A completed collect that ends on a wrong flip (e.g. Match-2's 2-chain + wrong 3rd)
  // is a success and must feel like one — no negative feedback.
  if (comboLen < getMinCombo()) { SFX.mismatch(); shakeBoard(); }
  advanceTutorial('mismatch');
  chainCards.push(index); inputLocked = true;
  updateChainFaces(index);
  setTimeout(() => endTurn(false), 500);
}

// ============================================================
// END TURN
// ============================================================
// A turn resolves on a mismatch, a manual bank, or a colour clear. If this collect takes
// every remaining card of an active colour off the board it's a "colour clear": it
// collects at ANY chain length (even a lone last card), refunds the spent turn (net zero),
// and shows a small "<COLOUR> Cleared" banner. See showColorClearBanner / showTurnRefund.
function endTurn(manual, perfectSweep) {
  stopChainTimer();
  clearChainColorHints(); // remove the chain-3 wrong-color ✕ marks — the chain is resolving
  // Kill chain tension immediately — turn is resolving, no more pulsing
  boardEl.removeAttribute('data-tension');
  if (tensionRAF) { cancelAnimationFrame(tensionRAF); tensionRAF = null; }
  boardEl.querySelectorAll('.card-front').forEach(el => { if (el.style.scale) el.style.scale = ''; });
  inputLocked = true;
  shieldCharges = 0; spotlightMode = false;

  // Capture the chain as recallable before cards flip back
  const chainNormal = chainCards.filter(i => board[i] && !board[i].special);
  if (chainNormal.length > 0) lastRevealedCards = [...chainNormal];

  const isWildCard = (i) => board[i].special && getSpecialType(board[i].special)?.isWild;
  const normalCards = chainCards.filter(i => !board[i].special || isWildCard(i));
  const mismatchIdx = manual ? -1 : (normalCards.length>0 && !isWildCard(normalCards[normalCards.length-1]) ? normalCards[normalCards.length-1] : -1);

  let matched;
  const isColorMatch = (color) => color === chainColor || (getRule('coloredBombs') && chainColors.has(color));
  if (manual) matched = normalCards;
  else if (mismatchIdx >= 0 && !isColorMatch(board[mismatchIdx].color))
    matched = normalCards.slice(0,-1);
  else matched = normalCards;

  const combo = matched.length + specialsUsed.length;
  const minCombo = getMinCombo();

  // Colour clear: for each colour we're collecting, is every card of that colour on the
  // board part of this collect? Measured before removal, so a lone last card counts. A
  // locked card of that colour still on the board means it is NOT cleared (locked cards
  // can't be chained, so they'd remain).
  const matchedSet = new Set(matched);
  const matchedColors = [...new Set(matched.map(i => board[i]?.color).filter(Boolean))];
  const clearedColors = matchedColors.filter(color => !board.some(c => c && !c.special && c.color === color && !matchedSet.has(c.index)));
  const colorCleared = clearedColors.length > 0;
  const willCollect = combo >= minCombo || colorCleared;
  // A colour clear flashes the whole board when the Perfect Sweep Reveal rule is on.
  const willSweepReveal = (perfectSweep || colorCleared) && isSweepRevealActive();

  // Every resolved turn costs one — but a colour clear refunds it (net zero).
  turns--;
  if (colorCleared) turns++;
  scoreEl.textContent = _scoreDisplayed; turnsEl.textContent = turns; updateStatusBadge();

  // Low turns warning — go red at ≤3 (including 0), callout exactly at 3
  if (turns <= 3) {
    turnsEl.classList.add('danger');
    if (turns === 3) {
      showTutorialHint('⚠️ Only 3 turns remaining!');
      turnsEl.classList.add('danger-pulse');
      turnsEl.addEventListener('animationend', () => turnsEl.classList.remove('danger-pulse'), { once: true });
    }
  } else {
    turnsEl.classList.remove('danger');
  }

  let specialActivated = matched.length>=2 && specialsUsed.length>0;
  let pts=0, toRemove=[], newST=null, newSP=-1;

  // Track failed combos for nudge system (a colour clear is a successful collect)
  if (willCollect) { consecutiveFailedCombos = 0; }
  else { consecutiveFailedCombos++; if (consecutiveFailedCombos >= 3) setTimeout(() => { if (consecutiveFailedCombos >= 3 && !activeNudge && hasAnyBoosters()) showNudge('booster'); }, 2000); }

  if (willCollect) {
    updateGoalProgress(matched, combo);
    toRemove = [...matched];
    if (combo===2) pts=50; else if (combo===3) pts=100; else if (combo===4) pts=150; else pts=combo*50;
    // Completing a chain of 3+ grants a power-up (Peek / Baby Bomb / BIG Bomb) —
    // no special card is left on the board anymore.
    if (combo >= 3) grantChainReward(combo);
  }
  if (specialActivated) toRemove.push(...specialsUsed);

  const toFlip = [];
  normalCards.forEach(idx => { if (!toRemove.includes(idx) && idx!==newSP) toFlip.push(idx); });
  // Echo: keep the first card(s) visible instead of flipping back
  const echoProtected = new Set();
  if (echoCharges > 0 && toFlip.length > 0) {
    const keep = Math.min(echoCharges, toFlip.length);
    for (let i = 0; i < keep; i++) echoProtected.add(toFlip[i]);
    echoCharges -= keep;
  }
  toFlip.forEach(idx => {
    if (echoProtected.has(idx)) return; // echo keeps this card visible
    const el = getCardEl(idx);
    if (el) {
      if (!manual && idx===mismatchIdx) { el.classList.add('wrong'); el.addEventListener('animationend', ()=>el.classList.remove('wrong'), {once:true}); }
      setTimeout(() => { el.classList.remove('flipped'); board[idx].flipped=false; const img=el.querySelector('.card-front img'); if(img) img.src=`blocks/block_${board[idx].color}_1.png`; }, 300);
    }
  });

  if (!specialActivated) specialsUsed.forEach(idx => { const el=getCardEl(idx); if(el) el.classList.remove('used'); });
  // Wild cards live in chainCards (not specialsUsed) — clear their 'used' state on failed chains
  if (!specialActivated) chainCards.filter(i => isWildCard(i)).forEach(idx => { const el=getCardEl(idx); if(el) el.classList.remove('used'); });

  let revealTargets = [];
  if (specialActivated && !getRule('instantSpecialReveal')) {
    specialsUsed.forEach(sIdx => { const sc=board[sIdx]; if(sc&&sc.special) revealTargets.push(...getRevealPattern(sc.special,sIdx)); });
    const flippingBack = new Set(toFlip.filter(i => !echoProtected.has(i)));
    revealTargets = [...new Set(revealTargets)].filter(i=>board[i]&&!toRemove.includes(i)&&i!==newSP&&!board[i].special&&!board[i].locked&&(!board[i].flipped||flippingBack.has(i)));
  }

  if (toRemove.length>0 || newSP>=0 || revealTargets.length>0) {
    turnsEl.textContent = turns;
    if (pts>0) {
      showScorePopup(pts, matched.length>0 ? matched : specialsUsed, null);
      spawnParticles(matched.length>0 ? matched : specialsUsed, chainColor);
      if (willSweepReveal) { SFX.win(); launchConfetti(); }
    }
    // Colour clear feedback: small "<COLOUR> Cleared" banner + the refunded turn.
    if (colorCleared) { showColorClearBanner(clearedColors); showTurnRefund(); }
    // Unlock cards orthogonally adjacent to removed combo cards (include newSP — it's consumed too)
    const unlocked = new Set();
    const unlockSources = newSP >= 0 ? [...toRemove, newSP] : toRemove;
    unlockSources.forEach(idx => {
      const {r, c} = toRC(idx);
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => {
        const adj = toIndex(r+dr, c+dc);
        if (adj >= 0 && board[adj] && board[adj].locked) unlocked.add(adj);
      });
    });
    unlocked.forEach(idx => {
      board[idx].locked = false;
      if (levelGoals?.progress?.breakLocks) levelGoals.progress.breakLocks.broken++;
      const el = getCardEl(idx);
      if (el) {
        el.classList.remove('locked');
        el.classList.add('unlocking');
        el.addEventListener('animationend', () => el.classList.remove('unlocking'), {once:true});
        el.style.pointerEvents = '';
        // Reveal on unlock setting
        if (getRule('revealOnUnlock')) {
          board[idx].flipped = true;
          el.classList.add('flipped', 'reveal-flash');
          el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true});
          setTimeout(() => { board[idx].flipped = false; el.classList.remove('flipped'); }, 1500);
        }
      }
    });

    // Separate normal cards (fly to goal) from bombs (explode in place after fly)
    const isBomb = idx => board[idx] && board[idx].special && isBombType(board[idx].special);
    const flyCards = toRemove.filter(idx => !isBomb(idx));
    const bombCards = toRemove.filter(idx => isBomb(idx));

    // Award bomb cards' share of points immediately; rest goes via fly animation
    const bombPts = flyCards.length > 0 ? Math.floor(pts * bombCards.length / toRemove.length) : pts;
    const flyPts = pts - bombPts;
    if (bombPts > 0) { score += bombPts; animateScore(score); }

    // Check if all goals are met — fly cards then finish
    if (checkAllGoalsMet()) {
      flyCardsToGoal(flyCards, flyPts, () => {
        bombCards.forEach(idx => explodeBomb(idx));
        setTimeout(() => finishTurn(), 450);
      });
      return;
    }

    flyCardsToGoal(flyCards, flyPts, () => {
      // Bombs explode after fly cards are collected
      bombCards.forEach(idx => explodeBomb(idx));
      const bombExplodeDelay = bombCards.length > 0 ? 450 : 0;
      setTimeout(() => {
        // Step 1: Reveal bomb targets (stay face-up, no auto-hide)
        if (revealTargets.length > 0) {
          revealCardsNoHide(revealTargets);
        }
      // Step 2: After bomb reveal animation, drop in new cards
      const bombRevealTime = revealTargets.length > 0 ? 300 : 0;
      setTimeout(() => {
        const nc = placeNewCards(toRemove, newSP);
        const showNewCards = nc.length > 0 && !getRule('hiddenNewCards') && !willSweepReveal;
        const dropDelay = nc.length > 0 ? 450 : 0;

        // Show sweep banner in parallel with new cards dropping
        if (willSweepReveal) showSweepBanner();

        setTimeout(() => {
          // Reveal new cards (no auto-hide) — skip if sweep reveal is coming
          if (showNewCards) revealCardsNoHide(nc);
          // Hide everything together after 2.2s
          const allRevealed = [...revealTargets, ...(showNewCards ? nc : [])];
          if (allRevealed.length > 0) lastRevealedCards = allRevealed;
          const doFinish = () => willSweepReveal ? setTimeout(() => hideSweepBanner(() => sweepRevealBoard(finishTurn)), 1200) : finishTurn();
          const doFinishWithTutorial = () => { checkSpecialTutorials(); if (!itemTutorialShowing) doFinish(); else { const wait = setInterval(() => { if (!itemTutorialShowing) { clearInterval(wait); doFinish(); } }, 200); } };
          if (allRevealed.length > 0) {
            setTimeout(() => {
              allRevealed.forEach(idx => { const c = board[idx]; if (c && !c.special && c.flipped) { c.flipped = false; const el = getCardEl(idx); if (el) el.classList.remove('flipped'); } });
              doFinishWithTutorial();
            }, 2200);
          } else doFinishWithTutorial();
        }, dropDelay);
      }, bombRevealTime);
    }, bombExplodeDelay);
    });
  } else if (willSweepReveal) {
    showSweepBanner();
    setTimeout(() => hideSweepBanner(() => sweepRevealBoard(finishTurn)), 1600);
  } else setTimeout(finishTurn, 400);
}

// Place new cards on the board (with drop animation) but don't reveal them yet
function placeNewCards(toRemove, skip) {
  const nc = [];
  const clearBoard = LEVELS[currentLevelIndex]?.clearBoard;
  toRemove.forEach(idx => {
    if (idx===skip || board[idx]===null) return;
    if (clearBoard) {
      // Cleaning journey: draw a refill card from the deck; once it's empty the slot stays clear.
      if (deck.length === 0) { board[idx] = null; replaceCell(idx); return; }
      const color = deck.pop();
      board[idx] = { color, flipped:false, special:null, index:idx, locked:false };
      replaceCell(idx); nc.push(idx);
      const el=getCardEl(idx);
      if (el) { el.classList.add('dropping'); el.addEventListener('animationend',()=>el.classList.remove('dropping'),{once:true}); }
      return;
    }
    board[idx]=createCard(idx); replaceCell(idx); nc.push(idx);
    const el=getCardEl(idx);
    if (el) { el.classList.add('dropping'); el.addEventListener('animationend',()=>el.classList.remove('dropping'),{once:true}); }
  });
  if (clearBoard) updateDeckHUD();
  spawnMarkedCards();
  return nc;
}

// Legacy wrapper for any remaining callers
function addNewCards(toRemove, skip, cb) {
  const nc = placeNewCards(toRemove, skip);
  if (nc.length > 0 && !getRule('hiddenNewCards')) {
    doSimultaneousReveal(nc, cb);
  } else if (nc.length > 0) {
    setTimeout(cb, 450);
  } else cb();
}

// Reveal cards face-up without auto-hiding (caller is responsible for hiding)
function revealCardsNoHide(targets) {
  targets.forEach(rIdx => {
    const c = board[rIdx];
    if (c && !c.special && !c.flipped) {
      c.flipped = true;
      const el = getCardEl(rIdx);
      if (el) { el.classList.add('flipped', 'reveal-flash'); el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true}); }
    }
  });
}

// Reveal all targets at the same time, hide after 2s, then callback
function doSimultaneousReveal(targets, cb) {
  targets.forEach(rIdx => {
    const c = board[rIdx];
    if (c && !c.special && !c.flipped) {
      c.flipped = true;
      const el = getCardEl(rIdx);
      if (el) { el.classList.add('flipped', 'reveal-flash'); el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true}); }
    }
  });
  setTimeout(() => {
    targets.forEach(rIdx => { const c = board[rIdx]; if (c && !c.special && c.flipped) { c.flipped = false; const el = getCardEl(rIdx); if (el) el.classList.remove('flipped'); } });
    cb();
  }, 2200);
}
