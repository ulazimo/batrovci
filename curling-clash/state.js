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

  // Per team, the eight rocks brought to this end. Each slot tracks whether it
  // has been thrown, because the doc lets the player pick ANY unused rock for
  // the current shot rather than working strictly down the list.
  decks: { yellow: [], red: [] },
  pending: { yellow: 0, red: 0 },  // slot chosen for the next throw
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

// Build a team's eight slots for an end from the chosen deck.
function buildDeckSlots() {
  return buildDeck().map(def => ({ def, used: false }));
}

// The next rock that would be thrown if the player does not choose otherwise —
// "the next Rock in the Deck will be automatically selected".
function firstUnusedSlot(team) {
  const slots = match.decks[team] || [];
  for (let i = 0; i < slots.length; i++) if (!slots[i].used) return i;
  return -1;
}

// The slot the given team will actually throw next, honouring a pick made
// through the Deck button and falling back to the next unused one.
function pendingSlot(team) {
  const slots = match.decks[team] || [];
  const p = match.pending[team];
  if (slots[p] && !slots[p].used) return p;
  return firstUnusedSlot(team);
}

function choosePendingSlot(team, index) {
  const slots = match.decks[team] || [];
  if (!slots[index] || slots[index].used) return false;
  match.pending[team] = index;
  return true;
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
  resetEndState();
  match.phase = 'idle';
}

function resetEndState() {
  match.thrown.yellow = 0;
  match.thrown.red = 0;
  // Hot-seat: both teams play the chosen deck, so neither side has an advantage
  // from the player's collection. When the Milestone 9 bot arrives it gets its
  // own deck here.
  match.decks.yellow = buildDeckSlots();
  match.decks.red = buildDeckSlots();
  match.pending.yellow = 0;
  match.pending.red = 0;
}
