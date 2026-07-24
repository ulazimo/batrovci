// ============================================================
// NUDGE SYSTEM & overlay helpers
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

// Nudge system
let consecutiveFailedCombos = 0;
let nudgeIdleTimer = null;
let activeNudge = null; // 'booster' | 'recall' | null

function showNudge(type) {
  if (activeNudge) dismissNudge();
  activeNudge = type;
  if (type === 'booster') {
    const bar = document.getElementById('booster-bar');
    bar.classList.add('nudge');
    let hand = bar.querySelector('.nudge-hand');
    if (!hand) { hand = document.createElement('span'); hand.className = 'nudge-hand'; hand.textContent = '👇'; bar.appendChild(hand); }
  } else if (type === 'recall') {
    const wrap = document.querySelector('.recall-wrap');
    const btn = document.getElementById('recall-btn');
    if (wrap && btn && !btn.classList.contains('disabled')) {
      wrap.classList.add('nudge');
      btn.classList.add('nudge');
      let hand = wrap.querySelector('.nudge-hand');
      if (!hand) { hand = document.createElement('span'); hand.className = 'nudge-hand'; hand.textContent = '👇'; wrap.appendChild(hand); }
    }
  }
}

function dismissNudge() {
  if (!activeNudge) return;
  activeNudge = null;
  const bar = document.getElementById('booster-bar');
  bar.classList.remove('nudge');
  const barHand = bar.querySelector('.nudge-hand');
  if (barHand) barHand.remove();
  const wrap = document.querySelector('.recall-wrap');
  if (wrap) {
    wrap.classList.remove('nudge');
    const wrapHand = wrap.querySelector('.nudge-hand');
    if (wrapHand) wrapHand.remove();
  }
  const btn = document.getElementById('recall-btn');
  if (btn) btn.classList.remove('nudge');
}

function hasAnyBoosters() {
  return BOOSTERS.some(b => boosterCounts[b.id] > 0);
}

function clearNudgeTimer() {
  if (nudgeIdleTimer) { clearTimeout(nudgeIdleTimer); nudgeIdleTimer = null; }
}

function startNudgeIdleTimer() {
  clearNudgeTimer();
  if (!turnActive || inputLocked) return;
  nudgeIdleTimer = setTimeout(() => {
    if (!turnActive || inputLocked) return;
    const chainLen = chainCards.length + specialsUsed.length;

    // Recall nudge: combo active + recall has matching cards
    if (chainLen >= 1 && chainColor && lastRevealedCards.length > 0) {
      const activeColors = getRule('coloredBombs') ? [...chainColors] : [chainColor];
      const hasMatch = lastRevealedCards.some(i =>
        i >= 0 && board[i] && !board[i].special && !board[i].flipped && !board[i].locked && activeColors.includes(board[i].color)
      );
      const btn = document.getElementById('recall-btn');
      if (hasMatch && btn && !btn.classList.contains('disabled')) {
        showNudge('recall');
        return;
      }
    }

    // Power-up nudge: sitting on combo 1 or 2 for 5s (only if player has power-ups)
    if (chainLen >= 1 && chainLen <= 2 && hasAnyBoosters()) {
      showNudge('booster');
    }
  }, 5000);
}

// ============================================================
// OVERLAY HELPERS
// ============================================================
function closeAllOverlays() {
  ['home-screen','level-select','overlay-fail','overlay-win','pre-level','color-picker','settings-panel','tutorial-overlay','progression-picker','special-tutorial']
    .forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });
  const _nlb = document.getElementById('next-level-btn');
  if (_nlb) _nlb.style.display = '';
}
