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
  const wasDisabled = btn.classList.contains('disabled');
  btn.classList.toggle('disabled', !enabled);
  if (!enabled) {
    btn.classList.remove('holding');
    if (_bankHoldTimer) { clearTimeout(_bankHoldTimer); _bankHoldTimer = null; }
  }
  // Show tutorial the first time the button becomes enabled — but only if the
  // Bank bar is actually visible (it's hidden in this build).
  const bankVisible = btn.offsetParent !== null;
  if (canBank && wasDisabled && bankVisible) {
    if (!progress.seenFeatures) progress.seenFeatures = [];
    if (!progress.seenFeatures.includes('bankButton')) {
      itemTutorialQueue.push({
        id: 'feature_bankButton', icon: '💰', name: 'Bank It',
        accentColor: '#9b59b6',
        descHTML: ''
          + '<div style="display:flex;gap:10px;margin:6px 0;text-align:left">'
          +   '<div style="flex:1;padding:8px;border-radius:10px;background:rgba(240,192,64,.08);border:1px solid rgba(240,192,64,.25)">'
          +     '<div style="font-weight:800;color:#f0c040;font-size:13px;margin-bottom:3px">💰 Bank It</div>'
          +     '<div style="color:#bbb;font-size:11px;line-height:1.4">Hold to <b style="color:#ddd">secure your combo</b> safely. No risk, guaranteed points.</div>'
          +   '</div>'
          +   '<div style="flex:1;padding:8px;border-radius:10px;background:rgba(155,89,182,.08);border:1px solid rgba(155,89,182,.25)">'
          +     '<div style="font-weight:800;color:#c39bd3;font-size:13px;margin-bottom:3px">🎰 Keep Going</div>'
          +     '<div style="color:#bbb;font-size:11px;line-height:1.4">Risk the chain for <b style="color:#ddd">bigger combos</b> and powerful Special cards!</div>'
          +   '</div>'
          + '</div>'
          + '<div style="text-align:center;margin-top:4px">'
          +   '<span style="display:inline-flex;gap:4px;margin-bottom:4px">'
          +     '<span style="display:inline-block;width:16px;height:5px;border-radius:3px;background:#9b59b6"></span>'
          +     '<span style="display:inline-block;width:16px;height:5px;border-radius:3px;background:#9b59b6"></span>'
          +     '<span style="display:inline-block;width:16px;height:5px;border-radius:3px;background:#9b59b6"></span>'
          +   '</span><br>'
          +   '<span style="color:#c39bd3;font-weight:700;font-size:13px">3 banks</span> '
          +   '<span style="color:#888;font-size:12px">earns a free</span> '
          +   '<span style="color:#c39bd3;font-weight:700;font-size:13px">💣 Baby Bomb</span>'
          + '</div>',
        markAs: 'bankButton'
      });
      if (!itemTutorialShowing) showNextItemTutorial();
    }
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
  showTutorialHint('💣 Tap a card to drop a Baby Bomb — it destroys the cards around it!');
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
  // Candidate cards in the blast: normal, unlocked, and not already flipped into the
  // active chain — leaving existing chain cards untouched keeps chainCards indices valid.
  const blast = [...new Set(cells)].filter(i =>
    i >= 0 && board[i] && !board[i].special && !board[i].locked && !chainCards.includes(i));

  // Chain-color cards in the blast can be pulled into the active chain and left on the
  // board (resolve with the chain) instead of being collected — the `bombChainStay` rule.
  const matchesChain = i => turnActive && (board[i].color === chainColor || (getRule('coloredBombs') && chainColors.has(board[i].color)));
  const joinChain = getRule('bombChainStay') ? blast.filter(matchesChain) : [];
  const targets = blast.filter(i => !joinChain.includes(i));

  if (targets.length === 0 && joinChain.length === 0) { inputLocked = false; updateBoosterUI(); updateBankButton(); return; }

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
  const centerCell = boardEl.children[index];
  if (centerCell) spawnBombVFX(centerCell);
  shakeBoard();

  // Did the bomb reveal the last off-chain card(s) of the chain colour? Judge this NOW,
  // before the bomb collects/refills its other targets — the refill can drop a fresh card
  // of that colour and mask the fact that the colour was cleared. `targets` are treated as
  // already gone (the bomb is about to collect them). Only meaningful when cards joined.
  const bombCleared = joinChain.length > 0 ? chainClearedColors(targets) : [];

  // Resolve the chain as a colour clear: collect the chain, refund the turn, show the
  // "<COLOUR> Cleared" banner. The override makes endTurn honour the clear even though the
  // bomb's own refill may have dropped new cards of that colour onto the board.
  const resolveBombColorClear = () => {
    bombColorClearOverride = bombCleared;
    stopChainTimer();
    inputLocked = true;
    updateBoosterUI(); updateBankButton(); updateChainIndicator();
    setTimeout(() => endTurn(true, false), 300);
  };

  // Whole blast joined the chain — nothing to collect
  if (targets.length === 0) {
    setTimeout(() => {
      // Colour clear? The bomb may have added the last card(s) of the chain colour.
      if (bombCleared.length > 0) { resolveBombColorClear(); return; }
      inputLocked = false;
      updateBoosterUI(); updateBankButton(); updateChainIndicator();
    }, 400);
    return;
  }

  // Count collected cards toward color/marked/coverage goals; combo 0 so it isn't treated as a chain
  updateGoalProgress(targets, 0);
  lastRevealedCards = [...targets];

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
        inputLocked = false; updateBoosterUI(); updateBankButton(); updateChainIndicator();
      };
      // Refilled cards drop in face-up (like a normal clear), then hide after a beat
      if (nc.length > 0 && getRule('bombRevealNewCards')) {
        revealCardsNoHide(nc);
        lastRevealedCards = [...nc];
        setTimeout(() => {
          nc.forEach(i => { const c = board[i]; if (c && !c.special && c.flipped) { c.flipped = false; const el = getCardEl(i); if (el) el.classList.remove('flipped'); } });
          finish();
        }, 2000);
      } else finish();
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
