// ============================================================
// CAMERA
//
// Three states:
//   shot    parked at the delivery end, rock in the lower third
//   follow  tracking the delivered rock, keeping it inside the follow band
//   house   locked on the house, tee centred — the Focus House view
//
// The doc's two rules: keep the rock inside a band the designer controls, and
// once the rock nears the house put the tee in the middle of the screen and
// stop following. The clamp and the house view are therefore the same number,
// which is why the transition into the house never jumps.
// ============================================================

// Where the rock waits before delivery, just in front of the hack so the hack
// itself stays visible behind it.
const SHOOT_Y = 1.15;

const camState = {
  mode: 'shot',          // shot | follow | house
  tween: null,           // { fromY, fromSpan, t, dur } while easing between views
};

// Focusing the house tightens the depth span, which is what actually magnifies
// it — see the projection header on why depth is nearly even. It also widens the
// frame, because the two views want opposite things: the shooting view crops the
// side lines so rocks read big, while the house view has to show the full sheet
// width or a rock on the edge of the twelve-foot falls off-screen.
function spanForMode(mode) {
  return mode === 'house' ? TUNE.projHouseDepth : TUNE.projDepthSpan;
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
  const y = mode === 'house' ? houseViewY() : mode === 'shot' ? shotViewY() : camera.y;
  camera.span = prevSpan;
  camera.fill = prevFill;
  updateProjection();
  return y;
}

function setCameraMode(mode, animate = true) {
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
    camera.y = mode === 'house' ? houseViewY() : mode === 'shot' ? shotViewY() : camera.y;
    updateProjection();
    return;
  }
  camState.tween = { fromY, fromSpan, fromFill, t: 0, dur: TUNE.camFocusTime };
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
  const rock = deliveredRock;
  if (!rock) return;

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
  target = Math.max(shotViewY(), Math.min(house, target));

  // Frame-rate independent smoothing.
  const smooth = 1 - Math.pow(1 - Math.min(0.999, TUNE.camLerp), dt * 60);
  camera.y += (target - camera.y) * smooth;
  updateProjection();
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
