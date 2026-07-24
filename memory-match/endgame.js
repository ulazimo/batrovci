// ============================================================
// RECALL, FINISH TURN, WIN/FAIL overlays
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

// ============================================================
// RECALL — re-reveal the last shown cards
// ============================================================
const RECALL_COST = 10; // coins per use
function recallCards() {
  dismissNudge(); clearNudgeTimer();
  if (inputLocked || !lastRevealedCards.length) return;
  const targets = lastRevealedCards.filter(i => i >= 0 && board[i] && !board[i].special && !board[i].flipped && !board[i].locked);
  if (!targets.length) return;
  if ((progress.coins || 0) < RECALL_COST) { updateRecallButton(); return; }
  progress.coins -= RECALL_COST; saveProgress(); updateCoinDisplay();
  SFX.booster();
  inputLocked = true;
  targets.forEach(idx => {
    board[idx].flipped = true;
    const el = getCardEl(idx);
    if (el) { el.classList.add('flipped', 'reveal-flash'); el.addEventListener('animationend', () => el.classList.remove('reveal-flash'), {once:true}); }
  });
  setTimeout(() => {
    targets.forEach(idx => { board[idx].flipped = false; const el = getCardEl(idx); if (el) el.classList.remove('flipped'); });
    inputLocked = false; updateBoosterUI(); updateChainIndicator(); updateRecallButton();
  }, 1800);
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
  stackReseededSlots.clear(); // drop any leftover markers (e.g. from a goal-met collect)
  turnActive=false; inputLocked=false; activeBooster=null;
  clearNudgeTimer();
  updateChainIndicator(); updateBoosterUI(); updateRecallButton(); updateGoalHUD();
  if (checkAllGoalsMet()) levelWon();
  else if (turns <= 0) levelFailed();
  else revealChainDangerCards();
}

// Called after a card joins the current chain. If every remaining card of the active
// colour(s) is now open, the colour is cleared — resolve the turn regardless of chain
// length (a lone last card counts). endTurn awards the collect, refunds the spent turn,
// and shows the "<COLOUR> Cleared" banner. Returns true if it resolved the turn.
function tryAutoResolveColor() {
  if (chainColor === null) return false;
  const activeColors = getRule('coloredBombs') ? [...chainColors] : [chainColor];
  const stillClosed = board.some(c => c && !c.special && !c.flipped && activeColors.includes(c.color));
  if (stillClosed) return false; // not every card of the colour is open yet
  stopChainTimer();
  inputLocked = true;
  setTimeout(() => endTurn(true, false), 300);
  return true;
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
  updateCoinDisplay();
  saveJourneySnapshot();
  saveProgress();
  updateBanner();

  // Show win banner over the board, then open overlay.
  // Cleaning journeys hide Score, so skip the score/coins subtitle under the banner.
  const winSub = LEVELS[currentLevelIndex]?.clearBoard
    ? ''
    : `Score: ${score} · +${coinsEarned} <img src="icons/coin_icon.png" class="coin-icon" alt="coins">`;
  showBoardBanner('win', '🎉 LEVEL COMPLETE!', winSub);
  setTimeout(() => hideBoardBanner(() => showWinOverlay()), 1800);
  SFX.win();
  launchConfetti();
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

  document.getElementById('next-level-btn').style.display = currentLevelIndex >= LEVELS.length-1 ? 'none' : '';
  document.getElementById('overlay-win').classList.add('active');
}

function levelFailed() {
  const hadStreak = progress.winStreak;
  _failSavedStreak = hadStreak;   // stash so keepStreak() can restore it
  progress.winStreak = 0;
  progress.lives = Math.max(0, (progress.lives ?? 5) - 1);
  saveJourneySnapshot();
  saveProgress();
  updateBanner();

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
  setTimeout(() => hideBoardBanner(() => showFailOverlay(hadStreak)), 1800);
}

function showFailOverlay(hadStreak) {
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
  if (hadStreak > 0) {
    streakInfo.textContent = `You lost your 🔥 ${hadStreak} win streak!`;
  } else {
    streakInfo.textContent = '';
  }

  // Show continue option — disabled if player can't afford it
  const continueBtn = document.getElementById('keep-streak-btn');
  const canAfford = (progress.coins || 0) >= KEEP_STREAK_COST;
  document.getElementById('keep-streak-cost').textContent = KEEP_STREAK_COST;
  continueBtn.disabled = !canAfford;
  continueBtn.style.opacity = canAfford ? '1' : '0.4';
  continueBtn.style.cursor = canAfford ? 'pointer' : 'not-allowed';

  document.getElementById('overlay-fail').classList.add('active');
}

let _failSavedStreak = 0;
function continueLevelWithCoins() {
  progress.coins = (progress.coins || 0) - KEEP_STREAK_COST;
  // Restore life that was lost on fail
  progress.lives = Math.min(5, (progress.lives ?? 0) + 1);
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
  inputLocked = false;
  turnsEl.textContent = turns;
  updateBanner();
  updateChainIndicator();
  updateBoosterUI();
  updateGoalHUD();
}
