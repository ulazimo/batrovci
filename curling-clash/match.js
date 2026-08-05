// ============================================================
// MATCH — the flow through ends, turns and scoring
//
// Hammer rules, from the doc and WCF R5(a):
//   End 1        decided by the coin toss
//   after that   the Hammer goes to the team that did NOT score
//   blank end    the Hammer stays where it was
//
// Turn order: the non-hammer team throws first, then the teams alternate until
// both have delivered eight rocks.
//
// Match length is 3 / 5 / 7 ends. A tie goes to a Sudden Death end, and because
// a sudden death end can itself be blank, it repeats until someone scores.
//
// The Initial Version is local hot-seat: the same device plays both Yellow and
// Red. Turn order and every rule is identical to the doc — only the input
// source differs, which is what makes the Milestone 9 bot a drop-in later.
// ============================================================

let flowTimer = 0;
let flowNext = null;

// Schedule a step a beat later, so scoring and turn changes have room to read.
function afterDelay(seconds, fn) {
  flowTimer = seconds;
  flowNext = fn;
}

function stepMatchFlow(dt) {
  stepMeasurement(dt);
  if (flowNext) {
    flowTimer -= dt;
    if (flowTimer <= 0) {
      const fn = flowNext;
      flowNext = null;
      fn();
    }
  }
  if (match.phase === 'playing') updateLiveScoring();
}

function initMatch() {
  onAllRocksStopped(onShotSettled);
  document.getElementById('btn-next-end').addEventListener('click', () => {
    hideOverlay('end-overlay');
    beginEnd();
  });
  document.getElementById('btn-rematch').addEventListener('click', () => {
    hideOverlay('match-overlay');
    startMatch(match.ends);
  });
  document.getElementById('btn-home').addEventListener('click', () => {
    hideOverlay('match-overlay');
    showScreen('home-screen');
  });
}

// ---------------------------------------------------------------
// Match / end lifecycle
// ---------------------------------------------------------------

function startMatch(ends) {
  resetMatchState(ends);
  resetRocks();
  clearVfx();
  showScreen('game-screen');
  refreshHud();
  match.phase = 'coin';
  trackMatchStart(ends);
  runCoinToss((winner) => {
    match.hammer = winner;
    beginEnd();
  });
}

function beginEnd() {
  resetRocks();
  clearVfx();
  resetEndState();
  highlightRocks = [];
  match.phase = 'playing';
  match.turn = whoseTurn();
  refreshHud();
  nextThrow();
}

function nextThrow() {
  if (endIsComplete()) { concludeEnd(); return; }

  match.turn = whoseTurn();
  refreshHud();

  const deck = match.decks[match.turn];
  const def = deck[match.thrown[match.turn]] || BASIC_ROCK;
  const rock = createRock(match.turn, def, 0, SHOOT_Y);
  rocks.push(rock);
  armShot(rock);

  showTurnBanner(match.turn);
}

// Called by physics once every rock has come to rest.
function onShotSettled() {
  if (match.phase !== 'playing') return;

  if (deliveredRock) trackShotResult(deliveredRock, deliveredRock.removeReason);
  match.thrown[match.turn]++;
  refreshHud();
  updateLiveScoring();

  if (endIsComplete()) {
    // The last rock of the end is the only time a measure can matter — until
    // then the players can already see who is closest.
    const pair = needsMeasurement();
    if (pair) {
      afterDelay(0.5, () => startMeasurement(pair, () => afterDelay(0.4, concludeEnd)));
      return;
    }
    afterDelay(0.9, concludeEnd);
    return;
  }

  afterDelay(0.7, nextThrow);
}

function concludeEnd() {
  match.phase = 'scoring';
  disableShotInput();
  setCameraMode('house');

  const standing = currentStanding();
  const scoringTeam = standing ? standing.team : null;
  const points = standing ? standing.count : 0;

  if (standing) {
    highlightRocks = standing.rocks;
    match.score[scoringTeam] += points;
  } else {
    highlightRocks = [];
  }

  match.lineScore.push({
    yellow: scoringTeam === TEAM.YELLOW ? points : 0,
    red: scoringTeam === TEAM.RED ? points : 0,
    suddenDeath: match.suddenDeath,
  });

  // Hammer: to whoever did not score; a blank end leaves it alone.
  const hammerBefore = match.hammer;
  if (scoringTeam) match.hammer = otherTeam(scoringTeam);
  const hammerMoved = match.hammer !== hammerBefore;

  refreshHud();
  trackEndComplete(standing, points);
  countUpScore(standing, () => showEndSummary(standing, points, hammerMoved));
}

// Count up one rock at a time, as the doc asks.
function countUpScore(standing, done) {
  if (!standing) { afterDelay(0.6, done); return; }
  const col = standing.team === TEAM.YELLOW ? COLORS.yellow : COLORS.red;
  let i = 0;
  const pace = TUNE.countUpPace / 1000;
  const tick = () => {
    if (i >= standing.rocks.length) { afterDelay(0.5, done); return; }
    const rock = standing.rocks[i];
    spawnIceLabel(rock.x, rock.y, '+1', col);
    i++;
    afterDelay(pace, tick);
  };
  tick();
}

function showEndSummary(standing, points, hammerMoved) {
  const title = document.getElementById('end-title');
  const line = document.getElementById('end-scoreline');
  const detail = document.getElementById('end-detail');

  title.textContent = match.suddenDeath
    ? `Sudden Death ${match.suddenDeathCount}`
    : `End ${match.endIndex + 1} of ${match.ends}`;
  line.innerHTML = `<span class="sc-y">${match.score.yellow}</span>` +
                   `<span class="sc-dash">–</span>` +
                   `<span class="sc-r">${match.score.red}</span>`;

  const hammerName = match.names[match.hammer];
  if (!standing) {
    detail.textContent = `Blank end — nobody scored. ${hammerName} keep the Hammer.`;
  } else {
    const name = match.names[standing.team];
    const verb = hammerMoved ? 'take' : 'keep';
    detail.textContent = `${name} score ${points}. ${hammerName} ${verb} the Hammer.`;
  }

  // Is the match over?
  const advance = () => {
    if (match.suddenDeath) {
      match.suddenDeathCount++;
      if (match.score.yellow !== match.score.red) { finishMatch(); return; }
      openEndOverlay('Still tied — another Sudden Death end.');
      return;
    }
    match.endIndex++;
    if (match.endIndex >= match.ends) {
      if (match.score.yellow === match.score.red) {
        match.suddenDeath = true;
        match.suddenDeathCount = 1;
        openEndOverlay('Tied after regulation — Sudden Death! First score wins.');
      } else {
        finishMatch();
      }
      return;
    }
    openEndOverlay();
  };

  advance();
}

function openEndOverlay(extra) {
  if (extra) {
    const d = document.getElementById('end-detail');
    d.textContent = d.textContent + '  ' + extra;
  }
  document.getElementById('btn-next-end').textContent =
    match.suddenDeath ? 'Sudden Death' : 'Next End';
  showOverlay('end-overlay');
  match.phase = 'endBreak';
}

function finishMatch() {
  match.phase = 'over';
  trackMatchEnd();
  const yellowWon = match.score.yellow > match.score.red;
  document.getElementById('match-title').textContent =
    yellowWon ? `${match.names.yellow} win!` : `${match.names.red} win!`;
  document.getElementById('match-scoreline').innerHTML =
    `<span class="sc-y">${match.score.yellow}</span>` +
    `<span class="sc-dash">–</span>` +
    `<span class="sc-r">${match.score.red}</span>`;
  document.getElementById('match-linescore').innerHTML = buildLineScore();
  showOverlay('match-overlay');
}

function buildLineScore() {
  const head = ['<div class="ls-row"><span class="ls-label"></span>' +
    match.lineScore.map((e, i) =>
      `<span class="ls-cell">${e.suddenDeath ? 'SD' : i + 1}</span>`).join('') + '</div>'];
  for (const team of [TEAM.YELLOW, TEAM.RED]) {
    const cls = team === TEAM.YELLOW ? 'y' : 'r';
    head.push(`<div class="ls-row ${cls}"><span class="ls-label">${match.names[team]}</span>` +
      match.lineScore.map(e =>
        `<span class="ls-cell ${e[team] > 0 ? 'scored' : ''}">${e[team]}</span>`).join('') +
      '</div>');
  }
  return head.join('');
}

// ---------------------------------------------------------------
// Coin toss — minimal, for End 1's Hammer. The richer pre-match screen with
// avatars and trophies is flagged Milestone Bot Opponent/Multiplayer.
// ---------------------------------------------------------------

function runCoinToss(done) {
  const coin = document.getElementById('coin');
  const result = document.getElementById('coin-result');
  result.textContent = '';
  result.className = '';
  showOverlay('coin-overlay');

  const winner = Math.random() < 0.5 ? TEAM.YELLOW : TEAM.RED;
  // Yellow is the face-up side, so land on a half turn for red.
  coin.style.setProperty('--coin-end', winner === TEAM.YELLOW ? '1440deg' : '1620deg');
  coin.classList.remove('flipping');
  void coin.offsetWidth;              // restart the animation
  coin.classList.add('flipping');

  setTimeout(() => {
    const name = match.names[winner];
    result.textContent = `${name} take the Hammer`;
    result.className = winner;
    setTimeout(() => { hideOverlay('coin-overlay'); done(winner); }, 1250);
  }, 2100);
}

// ---------------------------------------------------------------
// Overlay helpers
// ---------------------------------------------------------------

function showOverlay(id) { document.getElementById(id).classList.add('show'); }
function hideOverlay(id) { document.getElementById(id).classList.remove('show'); }

function showTurnBanner(team) {
  const el = document.getElementById('turn-banner');
  el.textContent = `${match.names[team]} — Rock ${match.thrown[team] + 1}/8`;
  el.className = team;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1100);
}

// Rock removed mid-shot: worth a beat of feedback about why.
function onRockRemoved(rock, reason) {
  const labels = {
    hogline: 'HOGGED',
    backline: 'THROUGH',
    sideline: 'OUT',
  };
  const col = rock.team === TEAM.YELLOW ? COLORS.yellow : COLORS.red;
  spawnIceLabel(rock.x, rock.y, labels[reason] || 'OUT', col);
}
