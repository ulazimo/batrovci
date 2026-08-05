// ============================================================
// HUD — the gameplay header
//
// From the doc's Gameplay Screen chapter: "Two parts for each player, Yellow
// and Red backgrounds side by side with VS in the middle, Avatar, Username,
// Current score of the Game. Who is currently winning the round based on the
// current state of the House. Under the Player elements should be 8 circles
// representing Rocks and how many of them used, so they would go to greyed out
// state when they were used and out of the game, unused state and on the board
// state."
//
// So each pip has three states, and "on the board" is a genuinely different
// thing from "used" — a rock that was thrown and then removed reads as used,
// while one still sitting on the ice reads as on the board.
// ============================================================

function initHud() {
  for (const team of [TEAM.YELLOW, TEAM.RED]) {
    const wrap = document.getElementById(team === TEAM.YELLOW ? 'pips-yellow' : 'pips-red');
    wrap.innerHTML = '';
    for (let i = 0; i < ROCK.PER_TEAM; i++) {
      const pip = document.createElement('span');
      pip.className = 'pip unused';
      wrap.appendChild(pip);
    }
  }
}

function refreshHud() {
  document.getElementById('hud-end-label').textContent = endNumberLabel();

  for (const team of [TEAM.YELLOW, TEAM.RED]) {
    const panel = document.getElementById(team === TEAM.YELLOW ? 'hud-yellow' : 'hud-red');
    panel.querySelector('.hud-name').textContent = match.names[team];
    panel.querySelector('.hud-score').textContent = match.score[team];
    panel.classList.toggle('has-hammer', match.hammer === team);
    panel.classList.toggle('is-turn', match.phase === 'playing' && match.turn === team);

    updatePips(team);
  }
}

function updatePips(team) {
  const wrap = document.getElementById(team === TEAM.YELLOW ? 'pips-yellow' : 'pips-red');
  const pips = wrap.children;

  // How many of this team's thrown rocks are still on the ice? Those are the
  // "on the board" pips; the rest of the thrown ones are used and gone.
  const onBoard = rocks.filter(r => r.team === team && r.removing <= 0).length;
  const thrown = match.thrown[team];
  const gone = Math.max(0, thrown - onBoard);

  for (let i = 0; i < pips.length; i++) {
    let cls = 'pip ';
    if (i < gone) cls += 'used';
    else if (i < thrown) cls += 'onboard';
    else cls += 'unused';
    pips[i].className = cls;
  }
}
