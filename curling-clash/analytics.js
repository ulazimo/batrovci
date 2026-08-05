// ============================================================
// ANALYTICS — game events
//
// `window.trackEvent` is installed by ../analytics.js (loaded as a module at
// the bottom of index.html), which injects game_id automatically. It may not
// exist yet when the first event fires, so everything goes through track().
//
// Kept deliberately small. The questions worth answering for the Initial
// Version are: do people finish a match, which match length do they pick, and
// are they actually using brushing and curl — the two mechanics the whole
// design rests on.
// ============================================================

function track(event, data) {
  if (typeof window.trackEvent === 'function') window.trackEvent(event, data || {});
}

// --- Shot-level ---

// Records what the player actually did with the controls, so the tuning
// conversation can be had against real usage rather than guesses.
function trackShot(rock, resolved) {
  track('shot_taken', {
    end: match.endIndex + 1,
    rock_number: match.thrown[rock.team] + 1,
    team: rock.team,
    power: Math.round(shot.power * 100),
    aim_deg: +(shot.aim * TUNE.aimMaxAngleDeg).toFixed(1),
    curl_pct: Math.round(shot.spin * 100),
    used_curl: Math.abs(shot.spin) > 0.05,
  });
}

function trackShotResult(rock, reason) {
  track('shot_result', {
    team: rock.team,
    outcome: reason || (isInHouse(rock) ? 'in_house' : 'in_play'),
    dist_to_tee: +distToTee(rock).toFixed(2),
    brushed: brushUsedThisShot,
  });
}

// --- Brushing usage, accumulated per shot ---
let brushUsedThisShot = false;

// --- Match-level ---

function trackMatchStart(ends) {
  track('match_start', { ends, mode: 'local_hotseat' });
}

function trackEndComplete(standing, points) {
  track('end_complete', {
    end: match.endIndex + 1,
    sudden_death: match.suddenDeath,
    scoring_team: standing ? standing.team : 'blank',
    points,
    score_yellow: match.score.yellow,
    score_red: match.score.red,
  });
}

function trackMatchEnd() {
  track('match_end', {
    ends: match.ends,
    sudden_death: match.suddenDeath,
    sudden_death_ends: match.suddenDeathCount,
    winner: match.score.yellow > match.score.red ? 'yellow' : 'red',
    score_yellow: match.score.yellow,
    score_red: match.score.red,
  });
}
