// ============================================================
// RECALL, FINISH TURN, WIN/FAIL overlays
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

// ============================================================
// RECALL — re-reveal the cards seen since the last chain
// ============================================================
// `lastRevealedCards` is a running memory of every face-down card the player has
// glimpsed since the last chain that CLEARED cards: mismatched chain cards that
// flipped back, chain-3 danger reveals, and freshly dropped cards. A collect resets
// it (the board changed); everything else accumulates. Recall re-shows the lot.
function resetRecall() { lastRevealedCards = []; }
function addRecall(indices) {
  if (!indices || !indices.length) return;
  const seen = new Set(lastRevealedCards);
  indices.forEach(i => { if (i >= 0 && !seen.has(i)) { seen.add(i); lastRevealedCards.push(i); } });
}
// Forget specific slots — used when cards are collected/refilled so Recall never
// re-shows a fresh, unseen card that happens to have landed on a remembered slot.
function removeRecall(indices) {
  if (!indices || !indices.length) return;
  const drop = new Set(indices);
  lastRevealedCards = lastRevealedCards.filter(i => !drop.has(i));
}

const RECALL_COST = 10; // coins per use
function recallCards() {
  if (typeof tutorialAllowsRecall === 'function' && !tutorialAllowsRecall()) return; // FTUE: only during a useRecall step
  if (inputLocked || !lastRevealedCards.length) return;
  const targets = lastRevealedCards.filter(i => i >= 0 && board[i] && !board[i].special && !board[i].flipped && !board[i].locked);
  if (!targets.length) return;
  if ((progress.coins || 0) < RECALL_COST) { updateRecallButton(); return; }
  progress.coins -= RECALL_COST; saveProgress(); updateCoinDisplay();
  if (typeof recordPowerUpUse === 'function') recordPowerUpUse('recall'); // analytics: recall used this match
  // Show the spend: RECALL_COST coins drop out of the header and scatter away.
  if (typeof burstCoinsDown === 'function') {
    burstCoinsDown(RECALL_COST, document.querySelector('#level-banner .coin-pill'));
  }
  SFX.booster();
  inputLocked = true;
  targets.forEach(idx => {
    board[idx].flipped = true;
    const el = getCardEl(idx);
    if (el) { el.classList.add('flipped', 'reveal-flash'); el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true}); }
  });
  if (typeof tutorialOnRecallUsed === 'function') tutorialOnRecallUsed(); // FTUE: light the board + advance after the re-reveal
  runSkippableReveal([], 1800, () => {
    targets.forEach(idx => { board[idx].flipped = false; const el = getCardEl(idx); if (el) el.classList.remove('flipped'); });
    inputLocked = false; updateBoosterUI(); updateChainIndicator(); updateRecallButton();
  });
}

function updateRecallButton() {
  const btn = document.getElementById('recall-btn');
  if (!btn) return;
  const hasCards = lastRevealedCards.some(i => i >= 0 && board[i] && !board[i].special && !board[i].flipped && !board[i].locked);
  const canAfford = (progress.coins || 0) >= RECALL_COST;
  btn.classList.toggle('disabled', !hasCards || inputLocked || !canAfford);
}

// ============================================================
// FINISH TURN
// ============================================================
function finishTurn() {
  chainColor=null; chainColors=new Set(); chainCards=[]; specialsUsed=[];
  flushLockHide(); // catch-all: flip any still-held just-unlocked reveal cards face-down
  stackReseededSlots.clear(); // drop any leftover markers (e.g. from a goal-met collect)
  turnActive=false; inputLocked=false; activeBooster=null;
  updateChainIndicator(); updateBoosterUI(); updateRecallButton(); updateGoalHUD();
  // Clear any leftover danger marks on cards that WON'T be revealed. The pendingDangerReveal
  // set keeps its mark until revealChainDangerCards flips it up (removed on flip); everything
  // else (danger marks with the reveal rule off, or a stale mark) is dropped now. Impact glow
  // is handled by updateChainIndicator above (chain is empty here → all cleared).
  const keepDanger = new Set(pendingDangerReveal);
  boardEl.querySelectorAll('.card.wrong-color-hint').forEach(el => {
    if (!keepDanger.has(parseInt(el.dataset.index, 10))) el.classList.remove('wrong-color-hint');
  });
  if (checkAllGoalsMet()) levelWon();
  else if (turns <= 0) levelFailed();
  else if (isBoardStuck()) levelFailed('stuck'); // only locked/iced/color-locked tiles left, no bomb
  else revealChainDangerCards();
  if (typeof tutorialOnTurnResolved === 'function') tutorialOnTurnResolved(); // FTUE: advance the script
}

// Called after a card joins the current chain. If every remaining INTERACTABLE card of the
// active colour(s) is now open, resolve the turn regardless of chain length (a lone last card
// counts) — there's nothing more the player can do with the colour. Locked / iced / color-locked
// cards of the colour DON'T block this (they can't be chained). endTurn then decides the payoff
// from the board state: if the colour is gone ENTIRELY it's a full clear (banner + turn refund);
// if frozen cards of it remain the chain simply auto-collects (no banner, no refund — the frozen
// ones are dealt with when their lock breaks). Returns true if it resolved the turn.
function tryAutoResolveColor() {
  if (chainColor === null) return false;
  // A tutorial may need a scripted chain to WAIT for a guided bank instead of snapping shut
  // the instant the colour is fully open (e.g. Level 15's 2-green back-effect chain).
  if (typeof tutorialSuppressAutoResolve === 'function' && tutorialSuppressAutoResolve()) return false;
  const activeColors = getRule('coloredBombs') ? [...chainColors] : [chainColor];
  const stillClosed = board.some(c => c && !c.special && !c.flipped && !c.locked && activeColors.includes(c.color));
  if (stillClosed) return false; // not every interactable card of the colour is open yet
  stopChainTimer();
  inputLocked = true;
  setTimeout(() => endTurn(true, false), 300);
  return true;
}

// A placed bomb (Baby/BIG booster, or a charged Bank bomb) is the only power-up that can
// break a lock: every other booster just reveals, and special bomb CARDS skip locked tiles
// (§8). Feeds isBoardStuck.
function hasBombAvailable() {
  if (hasBooster('babybomb') || hasBooster('bigbomb')) return true; // includes unlimitedPowerUps
  return getRule('bankButton') && bankProgress >= 3;
}

// Dead end: it's the player's turn (no active chain) but nothing on the board can be flipped
// and no bomb is available to break a lock. Ice / color-lock thresholds only advance by
// collecting, so a board of only locked/iced/color-locked tiles with no bomb can never
// progress — the level is unwinnable. Callers declare the loss.
function isBoardStuck() {
  if (turnActive) return false;                                    // mid-chain — resolves first
  if (board.some(c => c && !c.special && !c.locked)) return false; // a flippable card remains
  return !hasBombAvailable();
}

function levelWon() {
  const remaining = turns / MAX_TURNS;
  const newStars = remaining >= 2/3 ? 3 : remaining >= 1/3 ? 2 : 1;
  if (newStars > (progress.stars[currentLevelIndex]||0)) progress.stars[currentLevelIndex] = newStars;
  if (currentLevelIndex+1 > progress.highestUnlocked && currentLevelIndex+1 < LEVELS.length)
    progress.highestUnlocked = currentLevelIndex+1;
  if (isWinStreakActive()) progress.winStreak++;
  const coinsEarned = Math.floor(Math.random() * 5) + 8; // 8-12
  progress.coins = (progress.coins || 0) + coinsEarned;
  // Hand the reward to the home screen, which shows the pre-win total and flies
  // these coins into the header (incrementing the count as they land).
  pendingHomeCoinReward = coinsEarned;
  _winCoinsEarned = coinsEarned;
  updateCoinDisplay();
  saveJourneySnapshot();
  saveProgress();
  updateBanner();

  // Analytics: report the completion (stars/score are finalized above).
  if (typeof logLevelResult === 'function') logLevelResult('complete');
  if (typeof setPlayerState === 'function') setPlayerState('level-complete');

  // A tutorial can ask to HOLD the win here (e.g. Level 6's bomb-reward finale): the
  // reward has just flown into the tray, so we pause, let the tutorial show its closing
  // box, and only run the win flow once that box is dismissed (via endTutorial → the
  // deferred callback). Everything above (stars/coins/save) already happened.
  if (typeof tutorialHoldForWin === 'function' && tutorialHoldForWin()) {
    tutorialDeferWin(winVisualFinish);
    return;
  }
  if (typeof isTutorialActive === 'function' && isTutorialActive()) endTutorial(); // clear overlay, mark seen
  winVisualFinish();
}

// The celebratory finish (SFX/confetti → board-art flash or banner → home). Split out so a
// tutorial can defer it until after its closing reward box.
function winVisualFinish() {
  SFX.win();
  launchConfetti();

  // If this level shows instrument/animal art behind the board, HIGHLIGHT it
  // (un-blur + glow) for 1s, then go straight to the home hall to watch the
  // piece appear + any hall-complete celebration. Otherwise fall back to the
  // classic banner, then home. No intermediate "Level Complete" overlay.
  const hasArt = (typeof currentLevelBackground === 'function') && !!currentLevelBackground();
  if (hasArt) {
    if (typeof flashBoardArtWin === 'function') flashBoardArtWin(true);
    setTimeout(() => {
      if (typeof flashBoardArtWin === 'function') flashBoardArtWin(false);
      finishLevelToHome();
    }, 1000);
    return;
  }

  // No board art: show the win banner over the board, then go home.
  // Cleaning journeys hide Score, so skip the score/coins subtitle under the banner.
  const winSub = LEVELS[currentLevelIndex]?.clearBoard
    ? ''
    : `Score: ${score} · +${_winCoinsEarned} <img src="icons/coin_icon.png" class="coin-icon" alt="coins">`;
  showBoardBanner('win', '🎉 LEVEL COMPLETE!', winSub);
  setTimeout(() => hideBoardBanner(() => finishLevelToHome()), 1800);
}
let _winCoinsEarned = 0;

// A win no longer opens the "Level Complete" overlay. We still GRANT the level's
// rewards (silently — the home screen shows the next reward, and inventories
// update), then return to the home hall so the just-unlocked piece animates in
// and, if it completed the hall, the celebration plays there.
function finishLevelToHome() {
  if (typeof grantLevelRewards === 'function') grantLevelRewards(LEVELS[currentLevelIndex].id);
  showHome();
}

function showWinOverlay() {

  // Grant level rewards
  const granted = grantLevelRewards(LEVELS[currentLevelIndex].id);

  const stars = progress.stars[currentLevelIndex];
  document.getElementById('win-title').textContent = `Level ${LEVELS[currentLevelIndex].id} Complete!`;
  document.getElementById('win-stars').textContent = '★'.repeat(stars)+'☆'.repeat(3-stars);
  document.getElementById('win-score').textContent  = `Score: ${score}  •  ${turns} turn${turns!==1?'s':''} remaining`;
  const effect = getStreakEffect();
  const nextBoost = effect === 'reveal'
    ? `👁 ${getStreakRevealCount()} card${getStreakRevealCount() !== 1 ? 's' : ''} revealed`
    : `🛡 ${getStreakShields()} shield${getStreakShields() !== 1 ? 's' : ''}`;
  const streakMsg = progress.winStreak > 0
    ? `🔥 Win Streak: ${progress.winStreak} — ${nextBoost} next game`
    : '';
  document.getElementById('win-streak').textContent = streakMsg;

  // Show rewards as pills
  const rewardsEl = document.getElementById('win-rewards');
  if (granted.length > 0) {
    rewardsEl.innerHTML = '<div style="width:100%;text-align:center;font-size:11px;font-weight:700;color:#f0c040;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Rewards</div>' +
      granted.map(r => {
        if ((r.type || 'booster') === 'special') {
          const s = SPECIAL_TYPES.find(x => x.id === r.specialId);
          return `<span class="pre-level-reward-pill"><span class="reward-icon">${s ? s.icon : '?'}</span> +${r.qty} ${s ? s.name : r.specialId}</span>`;
        }
        const b = BOOSTERS.find(x => x.id === r.boosterId);
        return `<span class="pre-level-reward-pill"><span class="reward-icon">${b ? b.icon : '?'}</span> +${r.qty} ${b ? (b.name || b.id) : r.boosterId}</span>`;
      }).join('');
    rewardsEl.style.display = '';
  } else {
    rewardsEl.style.display = 'none';
  }

  document.getElementById('overlay-win').classList.add('active');
}

// `reason === 'stuck'` means the board has no possible moves (only locked/iced/color-locked
// tiles left and no bomb) — buying more turns can't change that, so the fail overlay hides the
// "+5 Turns" purchase in that case.
function levelFailed(reason) {
  const hadStreak = progress.winStreak;
  _failSavedStreak = hadStreak;   // stash so keepStreak() can restore it
  progress.winStreak = 0;
  progress.lives = Math.max(0, (progress.lives ?? 5) - 1);
  // Out of lives → kick off the 5-minute refill countdown (see lives.js).
  if (progress.lives <= 0) startLivesRefillTimer();
  saveJourneySnapshot();
  saveProgress();
  updateBanner();

  // Analytics: report the failure.
  if (typeof logLevelResult === 'function') logLevelResult('fail');
  if (typeof setPlayerState === 'function') setPlayerState('level-failed');

  // Show fail banner over the board with goal status
  let failBannerSub = `Score: ${score} / ${TARGET}`;
  if (levelGoals && levelGoals.definitions.length > 0) {
    const pills = levelGoals.definitions.map(g => {
      const d = getGoalDisplay(g);
      const countHtml = d.customLabel ? '' : ` ${d.livesOnly ? d.current : d.current + '/' + d.target}`;
      return `<span class="fail-banner-pill ${d.done ? 'done' : ''}">${d.icon}${countHtml}</span>`;
    }).join(' ');
    failBannerSub = pills;
  }
  showBoardBanner('fail', '💔 LEVEL FAILED', failBannerSub);
  SFX.fail();
  shakeBoard();
  setTimeout(() => hideBoardBanner(() => showFailOverlay(hadStreak, reason)), 1800);
}

function showFailOverlay(hadStreak, reason) {
  // Show goal status instead of score/target
  const failSub = document.getElementById('fail-sub');
  if (levelGoals && levelGoals.definitions.length > 0) {
    const pills = levelGoals.definitions.map(g => {
      const d = getGoalDisplay(g);
      const countHtml = d.customLabel ? '' : `<span class="goal-count">${d.livesOnly ? d.current : d.current + '/' + d.target}</span>`;
      return `<div class="goal-pill ${d.done ? 'goal-done' : 'goal-fail'}">
        <span class="goal-icon">${d.icon}</span>
        <span class="goal-text">${d.label}</span>
        ${countHtml}
      </div>`;
    }).join('');
    failSub.innerHTML = `<div class="fail-goals"><div class="goal-items">${pills}</div></div>`;
  } else {
    failSub.textContent = `Score: ${score} / ${TARGET}`;
  }

  const streakInfo = document.getElementById('fail-streak-info');
  const infoParts = [];
  if (reason === 'stuck') infoParts.push("No moves left — more turns won't help.");
  if (hadStreak > 0) infoParts.push(`You lost your 🔥 ${hadStreak} win streak!`);
  streakInfo.innerHTML = infoParts.join('<br>');

  // Continue-with-coins (+5 Turns) — pointless when the board is stuck (no possible moves), so
  // hide it there. Otherwise show it, disabled when the player can't afford it. The overlay is
  // reused across levels, so always restore display in the non-stuck path.
  const continueBtn = document.getElementById('keep-streak-btn');
  if (reason === 'stuck') {
    continueBtn.style.display = 'none';
  } else {
    continueBtn.style.display = '';
    const canAfford = (progress.coins || 0) >= KEEP_STREAK_COST;
    document.getElementById('keep-streak-cost').textContent = KEEP_STREAK_COST;
    continueBtn.disabled = !canAfford;
    continueBtn.style.opacity = canAfford ? '1' : '0.4';
    continueBtn.style.cursor = canAfford ? 'pointer' : 'not-allowed';
  }

  // Try Again needs a life to spend. Out of lives → hide it entirely and leave
  // "+5 Turns" (which restores the lost life) and Music Hall as the only exits.
  // The overlay is reused across levels, so always restore display otherwise.
  const retryBtn = document.getElementById('fail-retry-btn');
  if (retryBtn) retryBtn.style.display = (progress.lives ?? MAX_LIVES) <= 0 ? 'none' : '';

  document.getElementById('overlay-fail').classList.add('active');
}

let _failSavedStreak = 0;
function continueLevelWithCoins() {
  progress.coins = (progress.coins || 0) - KEEP_STREAK_COST;
  // Restore life that was lost on fail
  progress.lives = Math.min(5, (progress.lives ?? 0) + 1);
  // Buying back in cancels the refill wait — the player isn't out any more.
  delete progress.livesRefillAt;
  updateCoinDisplay();
  updateLivesDisplay();
  saveJourneySnapshot();
  saveProgress();

  // Restore streak that was lost
  progress.winStreak = _failSavedStreak;
  saveProgress();

  // Close fail overlay and resume the game with 5 extra turns
  document.getElementById('overlay-fail').classList.remove('active');
  turns += 5;
  if (typeof matchStartTurns === 'number') matchStartTurns += 5; // analytics: keep turnsUsed accurate after a coin-continue
  inputLocked = false;
  turnsEl.textContent = turns;
  updateBanner();
  updateChainIndicator();
  updateBoosterUI();
  updateGoalHUD();
}
