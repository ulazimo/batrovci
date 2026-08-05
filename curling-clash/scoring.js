// ============================================================
// SCORING — who is winning, right now and at the end of the end
//
// The rule, from the doc and WCF R12: the rock closest to the centre of the
// house scores for its team, and if that team also has the next-closest rocks,
// they all score. So: rank every rock in the house by distance to the tee, take
// the owner of the closest, and count forward while the team stays the same.
//
// The doc wants the players to know at all times who is scoring, with the
// scoring rocks highlighted in their colour — and nothing highlighted when
// rocks are on the sheet but none are in the house.
// ============================================================

// Every rock in the house, nearest the button first.
function rocksInHouseByDistance() {
  return rocks
    .filter(r => r.removing <= 0 && isInHouse(r))
    .map(r => ({ rock: r, dist: distToTee(r) }))
    .sort((a, b) => a.dist - b.dist);
}

// { team, count, rocks } — or null when nobody is scoring.
function currentStanding() {
  const ranked = rocksInHouseByDistance();
  if (!ranked.length) return null;

  const team = ranked[0].rock.team;
  const scoring = [];
  for (const entry of ranked) {
    if (entry.rock.team !== team) break;
    scoring.push(entry.rock);
  }
  return { team, count: scoring.length, rocks: scoring };
}

// Is this end close enough at the front to deserve the measurement sequence?
// Only meaningful once the last rock has come to rest.
function needsMeasurement() {
  const ranked = rocksInHouseByDistance();
  if (ranked.length < 2) return null;
  const first = ranked[0];
  const rival = ranked.find(e => e.rock.team !== first.rock.team);
  if (!rival) return null;
  if (rival.dist - first.dist > TUNE.measureThreshold) return null;
  return { winner: first, loser: rival };
}

// ---------------------------------------------------------------
// Live leader readout in the header
// ---------------------------------------------------------------

let highlightRocks = [];

function updateLiveScoring() {
  const el = document.getElementById('hud-leader');
  const txt = document.getElementById('hud-leader-text');
  const standing = currentStanding();

  if (!standing) {
    // Rocks may be on the sheet with none in the house — the doc is explicit
    // that nothing should be highlighted in that case.
    highlightRocks = [];
    el.classList.remove('show', 'yellow', 'red');
    return;
  }

  highlightRocks = standing.rocks;
  const name = standing.team === TEAM.YELLOW ? match.names.yellow : match.names.red;
  txt.textContent = `${name} scoring ${standing.count}`;
  el.classList.add('show');
  el.classList.toggle('yellow', standing.team === TEAM.YELLOW);
  el.classList.toggle('red', standing.team === TEAM.RED);
}

// Rings around the scoring rocks, drawn after the rocks themselves.
function drawScoringOverlay(ctx) {
  for (const rock of highlightRocks) {
    if (rock.removing > 0) continue;
    drawRockHighlight(ctx, rock);
  }
  if (measureAnim.active) drawMeasurement(ctx);
}

// ---------------------------------------------------------------
// Measurement drama
//
// "darken the screen, draw the line from the center of the house to the closest
// edge of those Rocks and show it with tension to see which is the winning Rock"
// ---------------------------------------------------------------

const measureAnim = {
  active: false,
  t: 0,
  pair: null,
  done: null,
};

const MEASURE_DUR = 3.4;

function startMeasurement(pair, onDone) {
  measureAnim.active = true;
  measureAnim.t = 0;
  measureAnim.pair = pair;
  measureAnim.done = onDone;
}

function stepMeasurement(dt) {
  if (!measureAnim.active) return;
  measureAnim.t += dt;
  if (measureAnim.t > MEASURE_DUR) {
    measureAnim.active = false;
    const cb = measureAnim.done;
    measureAnim.done = null;
    if (cb) cb();
  }
}

// The whole sequence is drawn on the canvas, dimming included. A DOM overlay
// would sit above the canvas and dim the measurement lines along with the
// scene, which is the opposite of the intent.
function drawMeasurement(ctx) {
  const { winner, loser } = measureAnim.pair;
  const t = measureAnim.t;

  // Fade the ice back so the tapes are the only bright thing on screen.
  const dim = Math.min(1, t / 0.45) * (1 - Math.max(0, (t - (MEASURE_DUR - 0.4)) / 0.4));
  ctx.save();
  ctx.fillStyle = `rgba(3,8,14,${0.66 * dim})`;
  ctx.fillRect(0, 0, viewW, viewH);

  const tee = projectPoint(0, SHEET.TEE_Y);

  // The two tapes extend one after the other, then the winner is called.
  const legs = [
    [loser, Math.min(1, t / 1.0), 0],
    [winner, Math.min(1, Math.max(0, (t - 1.0) / 1.0)), 1],
  ];
  const reveal = t > 2.15;

  for (const [entry, grow, order] of legs) {
    if (grow <= 0) continue;
    const rock = entry.rock;
    // Measure to the rock's near edge, not its centre — that is how a real
    // measure is taken, and it is what makes a tight call look tight.
    const d = entry.dist || 1;
    const ux = rock.x / d;
    const uy = (rock.y - SHEET.TEE_Y) / d;
    const edge = Math.max(0, d - rock.radius);
    const reach = edge * grow;
    const p = projectPoint(ux * reach, SHEET.TEE_Y + uy * reach);
    const col = rock.team === TEAM.YELLOW ? COLORS.yellow : COLORS.red;

    // The rock being measured comes back to full brightness.
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * grow;
    drawRock(ctx, rock);
    ctx.restore();

    // A ring at the measured radius. Two nested rings make "which is closer?"
    // readable at a glance even when the tapes are only a few pixels apart.
    if (grow > 0.15) {
      traceIceCircle(ctx, 0, SHEET.TEE_Y, reach, 44);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.55 * grow;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // The tape itself.
    ctx.beginPath();
    ctx.moveTo(tee.x, tee.y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.shadowBlur = 0;

    if (grow >= 1) {
      const label = edge.toFixed(3) + ' m';
      const lx = viewW / 2 + (order ? 46 : -46);
      const ly = viewH * 0.30 + order * 22;
      ctx.font = '800 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(label, lx, ly);
      ctx.fillStyle = col;
      ctx.fillText(label, lx, ly);
    }
  }

  // The pin both tapes run from.
  ctx.beginPath();
  ctx.arc(tee.x, tee.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  if (reveal) {
    const rock = winner.rock;
    const pulse = 0.6 + 0.4 * Math.sin(t * 9);
    ctx.globalAlpha = pulse;
    drawRockHighlight(ctx, rock);
    ctx.globalAlpha = 1;

    const name = match.names[rock.team];
    const text = `${name.toUpperCase()} — SHOT ROCK`;
    ctx.font = '900 19px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(text, viewW / 2, viewH * 0.22);
    ctx.fillStyle = rock.team === TEAM.YELLOW ? COLORS.yellow : COLORS.red;
    ctx.fillText(text, viewW / 2, viewH * 0.22);
  }
  ctx.restore();
}
