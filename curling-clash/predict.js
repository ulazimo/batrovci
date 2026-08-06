// ============================================================
// PREDICT — collision-free forward simulation
//
// Two jobs:
//
//   1. The Trajectory line before release. The doc says the trajectory covers
//      only a portion of the path, set by the rock's Trajectory stat.
//
//   2. The Shot Area circle while the rock is travelling. The doc wants that
//      circle to "become smaller and smaller and more deterministic as the Rock
//      is slowing down". We centre it on the predicted rest point and shrink
//      the radius as speed bleeds off, so by the time the rock stops the circle
//      has collapsed onto the truth. The prediction is honest — the variance
//      was already baked into the launch, not applied at the end.
//
// Collisions are deliberately ignored: the preview shows where the rock would
// go on clear ice, which is the information a curler actually reads off the
// sheet. Brushing is ignored too, since it is live input that has not happened
// yet at preview time.
// ============================================================

const PREDICT_DT = 1 / 60;
const PREDICT_MAX_STEPS = 3600;      // 60 s of travel — far more than any shot

// Scratch state, reused every frame so a per-frame prediction allocates nothing.
// previewMode tells advanceRockState to skip the board-effect queries. The
// preview is a clear-ice forecast — the same reason it ignores collisions — and
// consulting zones would make the trajectory line jitter as the player drags,
// for a prediction that a single rock collision invalidates anyway.
const _predictState = {
  x: 0, y: 0, vx: 0, vy: 0,
  spin: 0, spinMag: 0, handleAngle: 0,
  def: null, distance: 0, sideBend: 0, tractionBias: 1,
  previewMode: true,
};

const _predictPath = [];

// Simulate from a launch setup that has not happened yet.
function predictLaunch(rockDef, powerT, angleRad, spinSigned, fromX, fromY) {
  const speed = launchSpeedFor(rockDef, powerT);
  _predictState.x = fromX;
  _predictState.y = fromY;
  _predictState.vx = Math.sin(angleRad) * speed;
  _predictState.vy = Math.cos(angleRad) * speed;
  _predictState.spin = spinSigned;
  _predictState.spinMag = Math.abs(spinSigned);
  _predictState.handleAngle = 0;
  _predictState.def = rockDef;
  _predictState.distance = 0;
  _predictState.sideBend = 0;
  _predictState.tractionBias = 1;
  return runPrediction();
}

// Simulate onward from a rock already in motion.
function predictFromRock(rock) {
  _predictState.x = rock.x;
  _predictState.y = rock.y;
  _predictState.vx = rock.vx;
  _predictState.vy = rock.vy;
  _predictState.spin = rock.spin;
  _predictState.spinMag = rock.spinMag;
  _predictState.handleAngle = rock.handleAngle;
  _predictState.def = rock.def;
  _predictState.distance = 0;
  _predictState.sideBend = rock.sideBend;
  _predictState.tractionBias = rock.tractionBias;
  return runPrediction();
}

function runPrediction() {
  const st = _predictState;
  _predictPath.length = 0;
  _predictPath.push({ x: st.x, y: st.y });

  let steps = 0;
  let sampleCounter = 0;
  while (steps++ < PREDICT_MAX_STEPS) {
    const speed = advanceRockState(st, PREDICT_DT, 1, 0);

    // Sample every 4th step — plenty for a smooth curve, a quarter of the work.
    if (++sampleCounter >= 4) {
      sampleCounter = 0;
      _predictPath.push({ x: st.x, y: st.y });
    }

    if (speed <= STOP_SPEED) break;
    // Stop early once it is off the end of the ice; nothing beyond matters.
    if (st.y > SHEET.RUNOUT_Y + 4) break;
    if (Math.abs(st.x) > SHEET.HALF_WIDTH + 1) break;
  }

  // Always include the true final point, even if the sampler skipped it.
  _predictPath.push({ x: st.x, y: st.y });

  return {
    points: _predictPath,
    restX: st.x,
    restY: st.y,
    distance: st.distance,
  };
}

// The power slider position that would stop the rock exactly on the button.
// Used by the bench to keep perfectPowerCenter honest as friction is tuned:
// binary search rather than inverting the integral by hand.
function solvePerfectPower(rockDef, fromX, fromY, targetY = SHEET.TEE_Y) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const r = predictLaunch(rockDef, mid, 0, 0, fromX, fromY);
    if (r.restY < targetY) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
