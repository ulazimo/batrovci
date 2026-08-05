// ============================================================
// CAMERA
//
// Three states:
//   shot    parked at the delivery end, rock in the lower third, overhead
//   follow  tracking the delivered rock forward down the sheet
//   house   locked on the house, tee centred — the Focus House view
//
// ONE PERSPECTIVE THROUGHOUT PLAY. `projFollowDepth` defaults to the same value
// as `projDepthSpan`, so aiming and travelling share an identical camera and
// nothing tilts or zooms as the shot goes out — the camera only ever translates.
//
// This is deliberate and was arrived at the hard way. Two earlier attempts gave
// the aiming and travelling views their own depth spans (one even derived the
// span from the power, so it changed as the slider moved). Both read as the sheet
// warping underfoot, and the switch at release was a visible jolt. Any span
// difference between modes is a jump, however well it is tweened. If you want a
// tilt on travel, raise projFollowDepth — but know that is the trade you are
// making.
//
// Seeing where the shot will land is handled by drawOffscreenLanding instead,
// which projects the Shot Area onto the top edge of the view. That solves the
// problem without touching the camera at all.
//
// The doc's rule still holds at the end: once the rock nears the house the tee
// finishes in the middle of the screen and the camera stops following. The clamp
// and the house view are the same number, so that transition never jumps.
// ============================================================

// Where the rock waits before delivery, just in front of the hack so the hack
// itself stays visible behind it.
const SHOOT_Y = 1.15;

const camState = {
  mode: 'shot',          // shot | follow | house
  tween: null,           // { fromY, fromSpan, fromFill, t, dur } while easing
};

function spanForMode(mode) {
  if (mode === 'house') return TUNE.projHouseDepth;
  if (mode === 'follow') return TUNE.projFollowDepth;
  return TUNE.projDepthSpan;
}

function fillForMode(mode) {
  return mode === 'house' ? TUNE.projHouseFill : TUNE.projSheetFill;
}

function houseViewY() {
  return cameraYForRowAt(SHEET.TEE_Y, 0.5 * viewH) + TUNE.camHouseClamp;
}

function shotViewY() {
  return cameraYForRowAt(SHOOT_Y, TUNE.camAnchorRow * viewH);
}

// The target camera.y for a mode, evaluated with that mode's depth span — the
// two are coupled, so asking for one without the other gives a wrong answer.
function targetForMode(mode) {
  const prevSpan = camera.span, prevFill = camera.fill;
  camera.span = spanForMode(mode);
  camera.fill = fillForMode(mode);
  updateProjection();
  const y = mode === 'house' ? houseViewY()
          : mode === 'shot' ? shotViewY()
          : mode === 'follow' ? followTargetY()
          : camera.y;
  camera.span = prevSpan;
  camera.fill = prevFill;
  updateProjection();
  return y;
}

function setCameraMode(mode, animate = true, dur) {
  if (camState.mode === mode) return;
  const fromY = camera.y;
  const fromSpan = camera.span;
  const fromFill = camera.fill;
  camState.mode = mode;

  if (!animate) {
    camState.tween = null;
    camera.span = spanForMode(mode);
    camera.fill = fillForMode(mode);
    updateProjection();
    camera.y = targetForMode(mode);
    updateProjection();
    return;
  }
  camState.tween = { fromY, fromSpan, fromFill, t: 0, dur: dur || TUNE.camFocusTime };
}

// Snap straight to the delivery view — used when a new rock is set up.
function resetCameraToShot() {
  camState.mode = 'shot';
  camState.tween = null;
  camera.span = TUNE.projDepthSpan;
  camera.fill = TUNE.projSheetFill;
  updateProjection();
  camera.y = shotViewY();
  updateProjection();
}

function stepCamera(dt) {
  if (!viewW || !viewH) return;
  updateProjection();

  // An explicit view change eases to its destination and ignores follow logic.
  if (camState.tween) {
    const tw = camState.tween;
    tw.t = Math.min(1, tw.t + dt / Math.max(0.01, tw.dur));
    const e = easeInOutCubic(tw.t);
    // Recompute the destination every frame rather than caching it: the house
    // view depends on the projection, which the designer may be dragging a
    // slider through mid-transition.
    const toSpan = spanForMode(camState.mode);
    const toFill = fillForMode(camState.mode);
    const toY = targetForMode(camState.mode);
    camera.span = tw.fromSpan + (toSpan - tw.fromSpan) * e;
    camera.fill = tw.fromFill + (toFill - tw.fromFill) * e;
    camera.y = tw.fromY + (toY - tw.fromY) * e;
    if (tw.t >= 1) camState.tween = null;
    updateProjection();
    return;
  }

  camera.span = spanForMode(camState.mode);
  camera.fill = fillForMode(camState.mode);
  updateProjection();
  if (camState.mode === 'house') { camera.y = houseViewY(); updateProjection(); return; }
  if (camState.mode === 'shot')  { camera.y = shotViewY();  updateProjection(); return; }

  // ---- Follow ----
  if (!deliveredRock) return;
  const target = followTargetY();
  const smooth = 1 - Math.pow(1 - Math.min(0.999, TUNE.camLerp), dt * 60);
  camera.y += (target - camera.y) * smooth;
  updateProjection();
}

// Where the follow camera wants to be, given where the rock is. Split out so a
// tween INTO follow mode has a real destination to ease toward — otherwise the
// transition from the aiming view would target wherever the camera already was
// and land nowhere near the rock.
function followTargetY() {
  // deliveredRock only exists from launch onward, but the camera starts easing
  // back toward the rock during the delivery slide — so fall back to the rock
  // being delivered.
  const rock = deliveredRock || shot.rock;
  if (!rock) return camera.y;

  const bandTop = TUNE.camBandTop * viewH;
  const bandBottom = TUNE.camBandBottom * viewH;
  const row = screenRowOf(rock.y);

  let target = camera.y;
  if (row < bandTop) {
    // Rock has climbed too far up the screen — push the view down the sheet.
    target = cameraYForRowAt(rock.y, bandTop);
  } else if (row > bandBottom) {
    target = cameraYForRowAt(rock.y, bandBottom);
  }

  // The doc: "when the Rock is nearing the House, I want the center of the
  // House to finish in the middle of the screen and Camera not to move further
  // than that". The follow band alone never gets there — keeping the rock at a
  // fixed screen row leaves the camera short. So from the approach line onward,
  // blend the follow target toward the house-centred view. Whatever band the
  // designer picks, every shot then settles with the tee mid-screen.
  const from = SHEET.FAR_HOG_Y - TUNE.camApproach;
  const k = Math.max(0, Math.min(1, (rock.y - from) / Math.max(0.5, SHEET.TEE_Y - from)));
  const house = houseViewY();
  target = target + (house - target) * (k * k * (3 - 2 * k));

  // Never drift back behind the delivery view, and never past the house.
  return Math.max(shotViewY(), Math.min(house, target));
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
