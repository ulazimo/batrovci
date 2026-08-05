// ============================================================
// PHYSICS — the integrator
//
// Runs on the fixed 120 Hz step from boot.js, so a shot plays out identically
// regardless of frame rate.
//
// FRICTION.  a = −(A + B·v) along the direction of travel. A is the constant
// floor that guarantees the rock stops; B shapes the long glide. Real ice has a
// messier, speed-dependent coefficient, but two comprehensible knobs reproduce
// the feel and are actually tunable by hand.
//
// CURL.  Lateral acceleration whose strength rises as the rock slows, which is
// why a real stone hooks late. Clockwise handle curves the path left,
// counter-clockwise curves it right — matching the doc and the real sport.
//
// COLLISIONS.  Impulse-based, resolved over several passes per step so one
// shot can chain through a cluster. Restitution controls bounce; energy loss
// scales the impulse, so the two are independent handles.
// ============================================================

const STOP_SPEED = 0.02;          // m/s below which a rock is considered at rest
const HANDLE_TURN_PER_M = 0.56;   // rad/m at full spin ≈ 2.5 turns over a draw

let allStoppedCallback = null;
let wasAnythingMoving = false;

function onAllRocksStopped(fn) { allStoppedCallback = fn; }

function anyRockMoving() {
  for (const r of rocks) if (r.moving) return true;
  return false;
}

// ---------------------------------------------------------------
// Step
// ---------------------------------------------------------------

function stepPhysics(dt) {
  advanceRemovals(dt);

  const moving = anyRockMoving();
  if (moving) {
    integrate(dt);
    resolveCollisions();
    applyImmediateRemovals();
  }

  // Fire once on the transition from moving to settled.
  const nowMoving = anyRockMoving();
  if (wasAnythingMoving && !nowMoving) {
    applyRestRemovals();
    if (allStoppedCallback) allStoppedCallback();
  }
  wasAnythingMoving = nowMoving;
}

function integrate(dt) {
  for (const rock of rocks) {
    if (!rock.moving || rock.removing > 0) continue;
    // Brushing only ever touches the delivered rock (or, in the opponent's
    // window, whichever rock is being swept) — brushTractionAt decides.
    const speed = advanceRockState(rock, dt, brushTractionAt(rock), brushSideAccel(rock));
    if (speed <= STOP_SPEED) stopRock(rock);
  }
}

// ---------------------------------------------------------------
// The shared step
//
// Both the live simulation and the trajectory preview go through this, so the
// line the player sees can never drift from the physics they get. `traction`
// is a multiplier (1 = untouched ice, lower = brushed) and `sideAccel` is the
// lateral push from side brushing, positive bending left.
//
// Returns the speed after the step.
// ---------------------------------------------------------------
function advanceRockState(st, dt, traction, sideAccel) {
  const speed = Math.hypot(st.vx, st.vy);
  if (speed <= STOP_SPEED) return 0;

  const ux = st.vx / speed;
  const uy = st.vy / speed;

  const decel = (TUNE.iceFrictionA + TUNE.iceFrictionB * speed) * traction * st.tractionBias;

  // Curl: lateral acceleration that grows as the rock slows, which is why a
  // real stone hooks late in its travel.
  let aLatX = 0, aLatY = 0;
  if (st.spinMag > 0.0001) {
    const resp = Math.min(
      TUNE.curlSpeedFloor,
      Math.pow(TUNE.curlSpeedRef / Math.max(speed, 0.05), TUNE.curlSpeedShape)
    );
    const statScale = statValue(st.def, 'curl') / STAT_LEVELS.curl[2];
    const mag = TUNE.curlCoefficient * st.spinMag * statScale * resp;
    // Left of travel is (−uy, ux). Clockwise (spin > 0) curves left.
    const dir = Math.sign(st.spin);
    aLatX += dir * -uy * mag;
    aLatY += dir *  ux * mag;
  }

  if (sideAccel !== 0) {
    aLatX += -uy * sideAccel;
    aLatY +=  ux * sideAccel;
  }

  let newSpeed = speed - decel * dt;
  if (newSpeed < 0) newSpeed = 0;
  st.vx = ux * newSpeed + aLatX * dt;
  st.vy = uy * newSpeed + aLatY * dt;

  // Track how far side brushing alone has bent the path, then clamp it so
  // brushing can never fully redirect a shot — the doc is explicit that it is
  // only worth a few degrees.
  if (sideAccel !== 0) {
    st.sideBend += (sideAccel * dt) / Math.max(newSpeed, 0.05);
    clampSideBend(st);
  }

  const stepSpeed = Math.hypot(st.vx, st.vy);
  const ds = stepSpeed * dt;
  st.x += st.vx * dt;
  st.y += st.vy * dt;
  st.distance += ds;

  // Spin bleeds off with distance; the handle keeps turning while it lasts.
  if (st.spinMag > 0) {
    st.spinMag *= Math.max(0, 1 - TUNE.spinDecay * ds);
    st.handleAngle += Math.sign(st.spin) * st.spinMag * HANDLE_TURN_PER_M * ds;
  }

  return stepSpeed;
}

function stopRock(rock) {
  rock.vx = 0; rock.vy = 0;
  rock.moving = false;
}

// Total angular deviation from side brushing, capped by brushSideMaxDeg.
function clampSideBend(rock) {
  if (!rock.sideBend) return;
  const maxRad = (TUNE.brushSideMaxDeg * Math.PI) / 180;
  if (Math.abs(rock.sideBend) <= maxRad) return;
  const excess = Math.abs(rock.sideBend) - maxRad;
  const sign = Math.sign(rock.sideBend);
  // Rotate the velocity back by the overshoot, and record the clamp.
  const a = -sign * excess;
  const cos = Math.cos(a), sin = Math.sin(a);
  const vx = rock.vx * cos - rock.vy * sin;
  const vy = rock.vx * sin + rock.vy * cos;
  rock.vx = vx; rock.vy = vy;
  rock.sideBend = sign * maxRad;
}

// ---------------------------------------------------------------
// Collisions
// ---------------------------------------------------------------

function resolveCollisions() {
  const n = rocks.length;
  if (n < 2) return;

  const passes = Math.max(1, TUNE.collisionIterations | 0);
  for (let pass = 0; pass < passes; pass++) {
    let touched = false;
    for (let i = 0; i < n; i++) {
      const a = rocks[i];
      if (a.removing > 0) continue;
      for (let j = i + 1; j < n; j++) {
        const b = rocks[j];
        if (b.removing > 0) continue;
        if (collidePair(a, b)) touched = true;
      }
    }
    if (!touched) break;
  }
}

function collidePair(a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  const minDist = a.radius + b.radius;
  if (dist >= minDist) return false;

  // Perfectly stacked rocks have no normal; nudge them apart deterministically.
  if (dist < 1e-6) { dx = 0; dy = minDist; dist = minDist; }

  const nx = dx / dist;
  const ny = dy / dist;

  // Push apart so they stop overlapping.
  const overlap = (minDist - dist) * 0.5 * TUNE.collisionSeparation;
  a.x -= nx * overlap; a.y -= ny * overlap;
  b.x += nx * overlap; b.y += ny * overlap;

  // Closing speed along the contact normal.
  const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rvn >= 0) return true;   // already separating; the push-apart was enough

  const e = TUNE.collisionRestitution;
  const invA = 1 / a.mass;
  const invB = 1 / b.mass;
  let jImp = (-(1 + e) * rvn) / (invA + invB);
  jImp *= 1 - TUNE.collisionEnergyLoss;

  a.vx -= jImp * invA * nx; a.vy -= jImp * invA * ny;
  b.vx += jImp * invB * nx; b.vy += jImp * invB * ny;

  // Anything that took a hit is now in motion and, if it was the delivered
  // rock, is exempt from the hog-line rule (WCF R2(f)).
  for (const r of [a, b]) {
    r.hasStruck = true;
    if (Math.hypot(r.vx, r.vy) > STOP_SPEED) r.moving = true;
    // A struck rock keeps whatever spin it had but stops curling — the
    // handle rotation is no longer driving a clean path.
    r.spinMag *= 0.35;
  }

  if (typeof spawnCollisionSpark === 'function') {
    const impact = Math.min(1, Math.abs(rvn) / 2.5);
    spawnCollisionSpark(a.x + nx * a.radius, a.y + ny * a.radius, impact);
  }
  if (typeof onRockCollision === 'function') onRockCollision(a, b, Math.abs(rvn));

  return true;
}

// ---------------------------------------------------------------
// Removals — WCF R2 (f) (g) (h)
// ---------------------------------------------------------------

// Checked every step, because these apply the moment they happen.
function applyImmediateRemovals() {
  for (const rock of rocks) {
    if (rock.removing > 0) continue;
    if (touchesSideLine(rock)) { beginRemoval(rock, 'sideline'); continue; }
    if (pastBackLine(rock))    { beginRemoval(rock, 'backline'); continue; }
  }
}

// Checked once everything has come to rest: a delivered rock that never struck
// anything and failed to fully clear the far hog line is removed.
function applyRestRemovals() {
  if (!deliveredRock || deliveredRock.removing > 0) return;
  if (!deliveredRock.hasStruck && !clearsFarHog(deliveredRock)) {
    beginRemoval(deliveredRock, 'hogline');
  }
}

function beginRemoval(rock, reason) {
  rock.removing = 0.001;
  rock.removeReason = reason;
  rock.moving = false;
  rock.vx = 0; rock.vy = 0;
  if (typeof onRockRemoved === 'function') onRockRemoved(rock, reason);
}

// The swipe-away animation, then the rock leaves the array.
function advanceRemovals(dt) {
  for (let i = rocks.length - 1; i >= 0; i--) {
    const rock = rocks[i];
    if (rock.removing <= 0) continue;
    rock.removing += dt / 0.55;
    // Slide it off toward the back of the sheet as it fades.
    rock.y += dt * 5.0;
    if (rock.removing >= 1) {
      rocks.splice(i, 1);
      if (deliveredRock === rock) deliveredRock = null;
    }
  }
}

// ---------------------------------------------------------------
// Launching
// ---------------------------------------------------------------

// Power slider position (0..1) → launch speed in m/s, scaled by the rock's
// Power stat. The speed range is tuned so minimum power falls short of the far
// hog line and full power sails through the back line.
function launchSpeedFor(rockDef, powerT) {
  const t = Math.pow(Math.max(0, Math.min(1, powerT)), TUNE.powerCurve);
  const base = TUNE.launchSpeedMin + (TUNE.launchSpeedMax - TUNE.launchSpeedMin) * t;
  return base * statValue(rockDef, 'power');
}

// Fire a rock. angle is radians from straight down the sheet, positive = right.
// spinSigned is −1..+1: positive clockwise (curves left), negative
// counter-clockwise (curves right).
function launchRock(rock, powerT, angleRad, spinSigned) {
  const speed = launchSpeedFor(rock.def, powerT);
  rock.vx = Math.sin(angleRad) * speed;
  rock.vy = Math.cos(angleRad) * speed;
  rock.spin = spinSigned;
  rock.spinMag = Math.abs(spinSigned);
  rock.handleAngle = 0;          // snaps to 12 o'clock on release, per the doc
  rock.moving = true;
  rock.hasStruck = false;
  rock.distance = 0;
  rock.sideBend = 0;
  rock.mass = TUNE.rockMass;
  // Per-shot ice variation, so no two draws are microscopically identical.
  rock.tractionBias = 1 + (Math.random() * 2 - 1) * TUNE.iceFrictionJitter;
  deliveredRock = rock;
  wasAnythingMoving = true;
}
