// ============================================================
// STATE — the match, the end, the turn
//
// One object holds everything a match is. Kept plainly serialisable, because
// that is what the later multiplayer milestone will need.
// ============================================================

const match = {
  ends: MATCH_LENGTHS.normal,     // 3 / 5 / 7, chosen on the home screen
  endIndex: 0,                    // 0-based
  suddenDeath: false,
  suddenDeathCount: 0,

  score: { yellow: 0, red: 0 },
  lineScore: [],                  // per end: { yellow, red, suddenDeath }

  hammer: TEAM.YELLOW,            // who throws last this end
  turn: TEAM.YELLOW,              // who is on the clock
  thrown: { yellow: 0, red: 0 },  // rocks delivered this end

  decks: { yellow: [], red: [] },
  phase: 'idle',                  // idle | coin | playing | scoring | endBreak | over

  names: { yellow: 'You', red: 'Opponent' },
};

function endNumberLabel() {
  if (match.suddenDeath) return `SD ${match.suddenDeathCount}`;
  return `End ${match.endIndex + 1}/${match.ends}`;
}

function rocksLeft(team) {
  return ROCK.PER_TEAM - match.thrown[team];
}

function otherTeam(team) {
  return team === TEAM.YELLOW ? TEAM.RED : TEAM.YELLOW;
}

// The non-hammer team throws first. Within an end the teams alternate, so
// whoever has thrown fewer rocks is up; on a tie the non-hammer team goes.
function whoseTurn() {
  const nonHammer = otherTeam(match.hammer);
  if (match.thrown[nonHammer] <= match.thrown[match.hammer]) return nonHammer;
  return match.hammer;
}

function endIsComplete() {
  return match.thrown.yellow >= ROCK.PER_TEAM && match.thrown.red >= ROCK.PER_TEAM;
}

function resetMatchState(ends) {
  match.ends = ends;
  match.endIndex = 0;
  match.suddenDeath = false;
  match.suddenDeathCount = 0;
  match.score.yellow = 0;
  match.score.red = 0;
  match.lineScore = [];
  match.thrown.yellow = 0;
  match.thrown.red = 0;
  match.decks.yellow = buildDeck();
  match.decks.red = buildDeck();
  match.phase = 'idle';
}

function resetEndState() {
  match.thrown.yellow = 0;
  match.thrown.red = 0;
  match.decks.yellow = buildDeck();
  match.decks.red = buildDeck();
}
