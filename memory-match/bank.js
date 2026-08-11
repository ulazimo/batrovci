// ============================================================
// BANK IT BUTTON & baby-bomb placement
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

// ============================================================
// BANK IT BUTTON
// ============================================================
let _bankHoldTimer = null;
const BANK_HOLD_MS = 800;

function initBankButton() {
  const bar = document.getElementById('bank-bar');
  const btn = document.getElementById('bank-btn');
  if (!bar || !btn) return;
  if (!getRule('bankButton')) { bar.style.display = 'none'; return; }
  bar.style.display = '';
  btn.classList.add('disabled');
  btn.classList.remove('holding', 'banked');

  // Remove old listeners by replacing node
  const fresh = btn.cloneNode(true);
  fresh.style.touchAction = 'none';
  btn.replaceWith(fresh);

  fresh.addEventListener('pointerdown', (e) => {
    if (fresh.classList.contains('disabled')) return;
    e.preventDefault();
    // Bomb ready — drag the Baby Bomb from here onto the board (bomb-aim.js)
    if (bankProgress >= 3) {
      startBankBombDrag(e);
      return;
    }
    fresh.classList.add('holding');
    _bankHoldTimer = setTimeout(() => {
      fresh.classList.remove('holding');
      fresh.classList.add('banked');
      fresh.addEventListener('animationend', () => fresh.classList.remove('banked'), { once: true });
      bankChain();
    }, BANK_HOLD_MS);
  });

  const cancelHold = () => {
    if (_bankHoldTimer) { clearTimeout(_bankHoldTimer); _bankHoldTimer = null; }
    fresh.classList.remove('holding');
  };
  fresh.addEventListener('pointerup', cancelHold);
  fresh.addEventListener('pointerleave', cancelHold);
  fresh.addEventListener('pointercancel', cancelHold);
}

function updateBankButton() {
  const btn = document.getElementById('bank-btn');
  if (!btn || !getRule('bankButton')) return;
  const comboLen = chainCards.length + specialsUsed.length;
  const canBank = turnActive && !inputLocked && comboLen >= getMinCombo();
  // Button stays enabled when bomb is ready (3 charges), even without an active chain
  const bombReady = bankProgress >= 3 && !bankBombPlacement;
  const enabled = canBank || bombReady;
  btn.classList.toggle('disabled', !enabled);
  if (!enabled) {
    btn.classList.remove('holding');
    if (_bankHoldTimer) { clearTimeout(_bankHoldTimer); _bankHoldTimer = null; }
  }
}

// Bank → Baby Bomb progression
let bankProgress = 0;
let bankBombPlacement = false;

function updateBankProgress() {
  const pips = document.querySelectorAll('#bank-progress .bank-pip');
  const container = document.getElementById('bank-progress');
  const btn = document.getElementById('bank-btn');
  pips.forEach((p, i) => p.classList.toggle('filled', i < bankProgress));
  if (container) container.classList.toggle('ready', bankProgress >= 3);
  // Switch button to bomb mode at 3 charges
  if (btn) {
    btn.classList.toggle('bomb-ready', bankProgress >= 3);
    btn.textContent = bankProgress >= 3 ? '💣 Place Bomb' : '💰 Bank it';
  }
}

// Clear any bomb-placement highlight (both bomb-type variants)
function clearBombPlacement() {
  boardEl.classList.remove('bomb-placement', 'bomb-place-big');
}

function activateBombPlacement() {
  if (bankProgress < 3 || bankBombPlacement) return;
  bankBombPlacement = true;
  // Highlight placeable cells (Bank bomb is a Baby Bomb — orange)
  clearBombPlacement();
  boardEl.classList.add('bomb-placement');
}

// Detonate a bomb at `index`: destroy (collect) that card plus its pattern
// (Baby Bomb = ＋ of 5, BIG Bomb = 3×3 of 9). Cards fly to the score and clear,
// counting toward goals; cleared slots refill from the deck on Cleaning levels.
function detonateBombAt(index, bombType) {
  inputLocked = true;
  const cells = [index, ...getRevealPattern(bombType, index)];
  const uniqueCells = [...new Set(cells)];
  // Candidate cards in the blast: normal, unlocked, and not already flipped into the
  // active chain — leaving existing chain cards untouched keeps chainCards indices valid.
  const blast = uniqueCells.filter(i =>
    i >= 0 && board[i] && !board[i].special && !board[i].locked && !chainCards.includes(i));
  // Every locked tile inside the blast loses one lock layer (ice / color-lock are skipped by
  // breakLockLayer). This is the WHOLE blast — a lock dropped directly on AND any other lock
  // the pattern covers — not just the centre or tiles next to a collected card.
  const blastLocks = uniqueCells.filter(i => i >= 0 && board[i] && board[i].locked);

  // Chain-color cards in the blast can be pulled into the active chain and left on the
  // board (resolve with the chain) instead of being collected — the `bombChainStay` rule.
  const matchesChain = i => turnActive && (board[i].color === chainColor || (getRule('coloredBombs') && chainColors.has(board[i].color)));
  const joinChain = getRule('bombChainStay') ? blast.filter(matchesChain) : [];
  const targets = blast.filter(i => !joinChain.includes(i));

  if (targets.length === 0 && joinChain.length === 0 && blastLocks.length === 0) { inputLocked = false; updateBoosterUI(); updateBankButton(); return; }

  // Reveal everything the bomb touches (with a flash)
  [...targets, ...joinChain].forEach(i => { const c = board[i]; if (c && !c.flipped) { c.flipped = true; const el = getCardEl(i); if (el) { el.classList.add('flipped', 'reveal-flash'); el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true}); } } });

  // Chain-color cards join the active chain and stay on the board
  if (joinChain.length > 0) {
    joinChain.forEach(i => { if (!chainCards.includes(i)) { chainCards.push(i); lastSelectedIdx = i; SFX.shepard(chainCards.length + specialsUsed.length - 1); } });
    SFX.match();
    spawnParticles(joinChain, chainColor || 'red');
    onChainExtended(); // chain-3 "Danger cards" reward + timer (a bomb can add several at once)
    updateChainIndicator();
  }

  SFX.boom();
  HAPTICS.bomb(); // #4 — strong thump as the Small/Big bomb lands
  const centerCell = boardEl.children[index];
  if (centerCell) spawnBombVFX(centerCell);
  shakeBoard();

  // Break one lock layer on every locked tile the blast covers (see blastLocks).
  blastLocks.forEach(i => breakLockLayer(i));
  // A collected card also chips a lock it merely sits NEXT TO — the same adjacency rule as a
  // combo clear (breakAdjacentLocks): each collected card breaks one layer per orthogonally
  // adjacent lock. Skip locks already covered by the blast so a single bomb doesn't
  // double-count them.
  const blastLockSet = new Set(blastLocks);
  targets.forEach(idx => {
    const { r, c } = toRC(idx);
    [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr, dc]) => {
      const adj = toIndex(r + dr, c + dc);
      if (adj >= 0 && !blastLockSet.has(adj) && board[adj] && board[adj].locked) breakLockLayer(adj);
    });
  });
  updateGoalHUD();

  // Did the bomb open the last off-chain card(s) of the chain colour? Judge this NOW, before
  // the bomb collects/refills its other targets — the refill can drop a fresh card of that
  // colour and mask it. `targets` are treated as already gone (the bomb is about to collect
  // them). `bombCleared` = colours whose INTERACTABLE cards are all gone (→ at least collect);
  // `bombFullyCleared` = the subset gone ENTIRELY, frozen cards included (→ banner + refund).
  // Only meaningful when cards joined the chain.
  const bombCleared = joinChain.length > 0 ? chainClearedColors(targets) : [];
  const bombFullyCleared = joinChain.length > 0 ? chainClearedColors(targets, true) : [];

  // Resolve the chain: collect it, and — for colours cleared entirely — refund the turn + show
  // the "<COLOUR> Cleared" banner. The overrides make endTurn honour this even though the bomb's
  // own refill may have dropped new cards of the colour onto the board.
  const resolveBombColorClear = () => {
    bombColorClearOverride = bombCleared;
    bombColorFullyCleared = bombFullyCleared;
    stopChainTimer();
    inputLocked = true;
    updateBoosterUI(); updateBankButton(); updateChainIndicator();
    setTimeout(() => endTurn(true, false), 300);
  };

  // Nothing to collect — the blast only broke locks and/or joined cards to the chain.
  if (targets.length === 0) {
    const afterHold = () => {
      flushLockHide(); // flip any just-unlocked reveal cards face-down at the end of the hold
      // Colour clear? The bomb may have added the last card(s) of the chain colour.
      if (bombCleared.length > 0) { resolveBombColorClear(); return; }
      // Breaking a lock may have completed the breakLocks goal.
      if (checkAllGoalsMet()) { levelWon(); return; }
      // Used the last bomb into a board that still can't progress? Dead end.
      if (isBoardStuck()) { levelFailed('stuck'); return; }
      inputLocked = false;
      updateBoosterUI(); updateBankButton(); updateChainIndicator();
    };
    // A lock-only blast: hold any just-unlocked reveal-locked card face-up long enough to read
    // before it flips face-down (it used to snap after ~400ms). Skippable; just a short settle
    // beat when nothing was held face-up.
    setTimeout(() => {
      if (pendingLockHide.size) runSkippableReveal([], 2000, afterHold);
      else afterHold();
    }, 300);
    return;
  }

  // Count collected cards toward color/marked/coverage goals; combo 0 so it isn't treated as a chain
  updateGoalProgress(targets, 0);
  // A bomb collect must NOT wipe Recall — keep everything seen so far. Only forget the
  // slots it collected (they'll be refilled with fresh, unseen cards).
  removeRecall(targets);

  // Back-of-card effects: any card the bomb COLLECTS fires its reveal pattern, exactly like a
  // chain collect (endTurn). Capture now, before the fly/refill mutates those slots. Reveal
  // targets exclude the blast cells themselves (they're being destroyed / joined to the chain
  // and already face-up) and mirror endTurn's canReveal (face-down, non-special, unlocked).
  const bombFired = [];
  targets.forEach(i => { const c = board[i]; if (c && c.backEffect) bombFired.push({ idx: i, effect: c.backEffect }); });
  const bombBlast = new Set([index, ...targets, ...joinChain]);
  let bombBETargets = [];
  bombFired.forEach(({ idx, effect }) => bombBETargets.push(...getBackEffectPattern(effect, idx)));
  bombBETargets = [...new Set(bombBETargets)].filter(i =>
    i >= 0 && board[i] && !board[i].special && !board[i].locked && !board[i].flipped && !bombBlast.has(i));

  // Hold on the revealed cards so the player can read them, THEN collect (slower than before)
  setTimeout(() => {
    flyCardsToGoal(targets, targets.length * 25, () => {
      const nc = placeNewCards(targets, -1);
      updateGoalHUD(); updateDeckHUD();
      if (checkAllGoalsMet()) { levelWon(); return; }
      const finish = () => {
        // The bomb revealed the last card(s) of the chain colour → resolve as a colour
        // clear instead of leaving the (now complete) chain dangling.
        if (bombCleared.length > 0) { resolveBombColorClear(); return; }
        // Used the last bomb into a board that still can't progress? Dead end.
        if (isBoardStuck()) { levelFailed('stuck'); return; }
        inputLocked = false; updateBoosterUI(); updateBankButton(); updateChainIndicator();
      };
      // Reveal batch: collected back-effect patterns (+ the refilled cards when
      // bombRevealNewCards is on) flash face-up together, land in Recall, then hide.
      const showNewCards = nc.length > 0 && getRule('bombRevealNewCards');
      const doReveal = () => {
        if (bombBETargets.length) revealCardsNoHide(bombBETargets);
        if (showNewCards) revealCardsNoHide(nc);
        const allRevealed = [...bombBETargets, ...(showNewCards ? nc : [])];
        // Nothing extra to reveal AND no just-unlocked reveal-locked card being held → hand back.
        if (allRevealed.length === 0 && !pendingLockHide.size) { finish(); return; }
        addRecall(allRevealed);
        // Hold the reveal batch AND any card a broken lock just revealed face-up together, then
        // hide them as one. A bomb-unlocked reveal-locked card used to snap face-down at the
        // collect beat (~700ms), which read as "hiding too quickly" — now it gets the full window.
        runSkippableReveal([], 2000, () => {
          allRevealed.forEach(i => { const c = board[i]; if (c && !c.special && c.flipped) { c.flipped = false; const el = getCardEl(i); if (el) el.classList.remove('flipped'); } });
          flushLockHide();
          finish();
        });
      };
      // Back-effect activation: slam the collected effect icon(s) down over their tiles, then
      // the reveal bursts out as they land (mirrors endTurn). Skip the slam when there's
      // nothing left to reveal (e.g. the whole pattern sat inside the blast).
      if (bombFired.length && bombBETargets.length) { slamBackEffectIcons(bombFired); setTimeout(doReveal, BACK_EFFECT_PREVIEW_MS); }
      else doReveal();
    });
  }, 700);
}

function bankChain() {
  // If bomb is ready, clicking the button enters placement mode instead
  if (bankProgress >= 3) { activateBombPlacement(); return; }
  if (!turnActive || inputLocked) return;
  const comboLen = chainCards.length + specialsUsed.length;
  if (comboLen < getMinCombo()) return;
  inputLocked = true;
  endTurn(true);

  // Increment bank progress after successful bank
  bankProgress++;
  updateBankProgress();
}
