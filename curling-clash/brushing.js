// ============================================================
// BRUSHING
//
// The control is a thumbstick, not a set of buttons: "Think of these controls
// as a thumbstick/analog stick on a Joystick, so it can be moved in a circular
// way, causing multiple effects (it is not orthogonal, in only one direction at
// a time)." So intensity and side-brushing are read off one vector.
//
//   up      faster / more intense sweeping → less traction → rock runs further
//   down    slower / less intense
//   left    side-brush left  → path bends left
//   right   side-brush right → path bends right
//
// Effect on the ice, per the doc: brushing lowers traction only for a short
// distance in front of the rock, and traction returns to normal the moment the
// player stops. That is why brushTractionAt is a zone test rather than a global
// multiplier.
//
// Opponent brushing: once the delivered rock has crossed the Tee Line and is
// still moving, the other team gets a brief window to sweep it further and try
// to carry it out the back of the house.
// ============================================================

const brush = {
  active: false,            // finger down on the stick
  vec: { x: 0, y: 0 },      // −1..1 each, raw stick deflection
  effect: 0,                // 0..1, ramped intensity actually applied
  side: 0,                  // −1..1, ramped side-brush actually applied
  available: false,         // may the current controller brush at all?
  target: null,             // the rock being swept
  owner: null,              // which team is sweeping
  opponentWindow: 0,        // seconds left in the opponent's steal window
  pointerId: null,
};

let stickEl, knobEl, stickRect = null;

function initBrushing() {
  stickEl = document.getElementById('brush-stick');
  knobEl = document.getElementById('brush-stick-knob');

  stickEl.addEventListener('pointerdown', onStickDown, { passive: false });
  window.addEventListener('pointermove', onStickMove, { passive: false });
  window.addEventListener('pointerup', onStickUp, { passive: false });
  window.addEventListener('pointercancel', onStickUp, { passive: false });
}

function onStickDown(e) {
  if (!brush.available) return;
  e.preventDefault();
  e.stopPropagation();
  brush.pointerId = e.pointerId;
  brush.active = true;
  stickRect = stickEl.getBoundingClientRect();
  stickEl.classList.add('active');
  updateStickVector(e);
}

function onStickMove(e) {
  if (!brush.active || e.pointerId !== brush.pointerId) return;
  e.preventDefault();
  updateStickVector(e);
}

function onStickUp(e) {
  if (!brush.active || (brush.pointerId !== null && e.pointerId !== brush.pointerId)) return;
  brush.active = false;
  brush.pointerId = null;
  brush.vec.x = 0;
  brush.vec.y = 0;
  stickEl.classList.remove('active');
  knobEl.style.transform = '';
}

function updateStickVector(e) {
  if (!stickRect) return;
  const cx = stickRect.left + stickRect.width / 2;
  const cy = stickRect.top + stickRect.height / 2;
  const maxR = stickRect.width / 2;

  let dx = (e.clientX - cx) / maxR;
  let dy = (e.clientY - cy) / maxR;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }     // clamp into the circle

  brush.vec.x = dx;
  brush.vec.y = -dy;                          // screen Y grows downward
  const px = dx * maxR * 0.55;
  const py = dy * maxR * 0.55;
  knobEl.style.transform = `translate(${px}px, ${py}px)`;
}

// ---------------------------------------------------------------
// Per-step update
// ---------------------------------------------------------------

function stepBrushing(dt) {
  // Brushing only exists while a rock is actually travelling.
  const rock = deliveredRock;
  const travelling = rock && rock.moving && rock.removing <= 0;

  if (!travelling) {
    if (brush.available) setBrushAvailable(false);
    brush.target = null;
    brush.opponentWindow = 0;
    rampBrush(dt, 0, 0);
    return;
  }

  brush.target = rock;

  // Hand-off to the opponent once the rock is past the tee line.
  const pastTee = rock.y > SHEET.TEE_Y;
  if (pastTee && brush.owner !== opponentOf(rock.team)) {
    brush.owner = opponentOf(rock.team);
    brush.opponentWindow = TUNE.brushOpponentWindow;
    // A fresh controller starts from neutral rather than inheriting the stick.
    brush.vec.x = 0; brush.vec.y = 0;
    brush.active = false;
    stickEl.classList.remove('active');
    knobEl.style.transform = '';
    if (typeof onBrushOwnerChanged === 'function') onBrushOwnerChanged(brush.owner);
  } else if (!pastTee) {
    brush.owner = rock.team;
  }

  if (brush.opponentWindow > 0) {
    brush.opponentWindow -= dt;
    if (brush.opponentWindow <= 0) setBrushAvailable(false);
  }

  const shouldBeAvailable = brush.opponentWindow > 0 || !pastTee;
  if (shouldBeAvailable !== brush.available) setBrushAvailable(shouldBeAvailable);

  // Ramp toward the stick, so starting and stopping is smooth rather than a
  // step change in the physics.
  let targetIntensity = 0;
  let targetSide = 0;
  if (brush.active && brush.available) {
    // Up on the stick is intensity; the doc puts "slower" at the bottom, so the
    // whole vertical range maps to a sweep rate with neutral at centre.
    const up = Math.max(0, brush.vec.y);
    const down = Math.max(0, -brush.vec.y);
    const magnitude = Math.hypot(brush.vec.x, brush.vec.y);
    // Holding the button at all sweeps; pushing up sweeps harder, down softer.
    const rate = 0.45 + up * 0.55 - down * 0.35;
    targetIntensity = Math.max(0, Math.min(1, Math.pow(rate, TUNE.brushIntensityCurve)));
    targetSide = brush.vec.x * Math.min(1, magnitude + 0.35);
  }
  rampBrush(dt, targetIntensity, targetSide);

  if (brush.effect > 0.05) {
    spawnIceSpray(rock.x, rock.y + TUNE.brushReach * 0.35, brush.effect);
    brushUsedThisShot = true;
  }
}

function rampBrush(dt, targetIntensity, targetSide) {
  const k = TUNE.brushRamp <= 0 ? 1 : Math.min(1, dt / TUNE.brushRamp);
  brush.effect += (targetIntensity - brush.effect) * k;
  brush.side += (targetSide - brush.side) * k;
  if (Math.abs(brush.effect) < 0.001) brush.effect = 0;
  if (Math.abs(brush.side) < 0.001) brush.side = 0;
}

function setBrushAvailable(on) {
  brush.available = on;
  stickEl.classList.toggle('show', on);
  if (!on) {
    brush.active = false;
    brush.vec.x = 0; brush.vec.y = 0;
    stickEl.classList.remove('active');
    knobEl.style.transform = '';
  }
}

function opponentOf(team) {
  return team === TEAM.YELLOW ? TEAM.RED : TEAM.YELLOW;
}

// ---------------------------------------------------------------
// Effect on the physics — called every step for every moving rock
// ---------------------------------------------------------------

// Traction multiplier. 1 = untouched ice. Only the swept rock is affected, and
// only while brushing is actually happening.
function brushTractionAt(rock) {
  if (brush.effect <= 0.001 || rock !== brush.target) return 1;
  // Brushing removes up to (1 − brushTractionMult) of the traction, scaled by
  // how hard the player is sweeping.
  return 1 - (1 - TUNE.brushTractionMult) * brush.effect;
}

// Lateral acceleration from side-brushing, positive bending the path left.
// The doc: "left brushing will cause the Rock to go more to the left".
function brushSideAccel(rock) {
  if (brush.effect <= 0.001 || rock !== brush.target) return 0;
  if (Math.abs(brush.side) < 0.02) return 0;
  // Stick left is negative X, which is left on the ice too.
  return -brush.side * TUNE.brushSideForce * brush.effect;
}
