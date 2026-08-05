// ============================================================
// PROJECTION — sheet space ↔ screen space
//
// The ice is a flat plane and every game object sits on it, so one transform
// places everything. No 3D library needed.
//
// WHY THIS IS NOT A TEXTBOOK PERSPECTIVE CAMERA.
//
// A true pinhole projection puts screen row and on-screen width under the same
// 1/distance falloff. Run the numbers for curling on a phone and it falls apart:
// the house is 3.66 m across and sits 38 m from the hack, so at true perspective
// it occupies about 7 vertical pixels. Correct, and unplayable — you cannot see
// which ring a rock is in, let alone aim at one.
//
// So depth and width are decoupled, and each gets its own control:
//
//   ROW   how far up the screen a point sits.        projDepthCompress
//   WIDTH how wide the sheet is at that point.       projWidthLens
//
// Depth stays close to even (a metre near the camera covers roughly the same
// pixels as a metre at the house), which keeps distances fair to judge and the
// house readable. The perspective read comes almost entirely from the width
// taper, which costs nothing in readability. That combination is what the
// Curling Sheet reference and the shooting-perspective photo actually look like,
// and with rock shading on top it reads as the stylized 3D the art direction
// asks for.
//
// Both mappings are analytically invertible, so hit-testing and the camera's
// "what camera.y puts the rock on this row?" question stay exact — see
// cameraYForRowAt.
//
// TOP-DOWN MODE is the ground truth for verifying geometry: same API, an affine
// fit of the whole sheet, so every drawing routine works unchanged.
// ============================================================

const camera = {
  y: 0,                       // sheet Y sitting on the anchor row
  span: 40,                   // metres of depth between anchor row and top of view
  fill: 1.45,                 // sheet width at the target, as a fraction of screen width
  topDown: false,
};

const proj = {
  topRow: 0,
  anchorRow: 0,
  anchorSpan: 1,              // anchorRow - topRow, in pixels
  halfPx: 0,                  // screen half-width of the sheet at the camera target
  D: 40,                      // camera.span, cached
  a: 0.35,                    // depth compression
  Lw: 22,                     // width taper distance
  // Top-down only
  tdScale: 1,
  tdOriginX: 0,
  tdOriginY: 0,
};

function updateProjection() {
  if (!viewW || !viewH) return;

  if (camera.topDown) {
    const span = SHEET.RUNOUT_Y - SHEET.BEHIND_HACK_Y;
    const sx = (viewW * 0.90) / SHEET.WIDTH;
    const sy = (viewH * 0.96) / span;
    proj.tdScale = Math.min(sx, sy);
    proj.tdOriginX = viewW / 2;
    const used = span * proj.tdScale;
    proj.tdOriginY = (viewH - used) / 2 + used + SHEET.BEHIND_HACK_Y * proj.tdScale;
    return;
  }

  proj.topRow = TUNE.projTopRow * viewH;
  proj.anchorRow = TUNE.camAnchorRow * viewH;
  proj.anchorSpan = Math.max(1, proj.anchorRow - proj.topRow);
  proj.halfPx = (viewW * camera.fill) / 2;
  proj.D = Math.max(1, camera.span);
  proj.a = TUNE.projDepthCompress;
  proj.Lw = TUNE.projWidthLens;
}

// ---------------------------------------------------------------
// Depth mapping
//
// f maps normalised depth t (0 at the camera target, 1 at the top of the view)
// onto normalised screen height. f(0)=0, f(1)=1, monotonic.
//
//     f(t) = t(1+a) / (1+at)
//
// a = 0 gives f(t) = t: perfectly even depth. Larger a bunches the far end up.
// Behind the camera (t < 0) it extends linearly at f'(0) = 1+a, which keeps the
// mapping smooth across the camera plane instead of blowing up at t = −1/a.
// ---------------------------------------------------------------

function depthF(t) {
  const a = proj.a;
  if (a <= 0) return t;
  if (t < 0) return t * (1 + a);
  return (t * (1 + a)) / (1 + a * t);
}

function depthFInv(y) {
  const a = proj.a;
  if (a <= 0) return y;
  if (y < 0) return y / (1 + a);
  return y / (1 + a * (1 - y));
}

function depthFPrime(t) {
  const a = proj.a;
  if (a <= 0) return 1;
  if (t < 0) return 1 + a;
  const d = 1 + a * t;
  return (1 + a) / (d * d);
}

// ---------------------------------------------------------------
// Width mapping — this is the perspective the eye actually reads
//
//     w(sy) = Lw / (Lw + aheadOfCamera)
//
// 1 at the camera target, falling toward 0 far away. Clamped just short of the
// singularity so geometry behind the camera stays finite.
// ---------------------------------------------------------------

function widthFactor(sy) {
  if (camera.topDown) return 1;
  const ahead = sy - camera.y;
  const denom = proj.Lw + ahead;
  if (denom < proj.Lw * 0.12) return proj.Lw / (proj.Lw * 0.12);
  return proj.Lw / denom;
}

// ---------------------------------------------------------------
// Core transforms
// ---------------------------------------------------------------

function screenRowOf(sheetY) {
  if (camera.topDown) return proj.tdOriginY - sheetY * proj.tdScale;
  const t = (sheetY - camera.y) / proj.D;
  return proj.anchorRow - proj.anchorSpan * depthF(t);
}

function projectPoint(sx, sy) {
  if (camera.topDown) {
    return {
      x: proj.tdOriginX + sx * proj.tdScale,
      y: proj.tdOriginY - sy * proj.tdScale,
      p: 1,
    };
  }
  const w = widthFactor(sy);
  return {
    x: viewW / 2 + (sx / SHEET.HALF_WIDTH) * proj.halfPx * w,
    y: screenRowOf(sy),
    p: w,
  };
}

// Pixels per metre across the sheet.
function projScaleX(sy) {
  if (camera.topDown) return proj.tdScale;
  return (proj.halfPx / SHEET.HALF_WIDTH) * widthFactor(sy);
}

// Pixels per metre along the sheet — the derivative of the row mapping.
function projScaleY(sy) {
  if (camera.topDown) return proj.tdScale;
  const t = (sy - camera.y) / proj.D;
  return (proj.anchorSpan * depthFPrime(t)) / proj.D;
}

// Scale for a sprite standing on the ice. It follows the width taper, which is
// the honest size cue; projDepthScale softens it for readability.
function projSpriteScale(sy) {
  if (camera.topDown) return 1;
  return Math.pow(widthFactor(sy), TUNE.projDepthScale);
}

// Screen row → sheet Y.
function unprojectY(screenY) {
  if (camera.topDown) return (proj.tdOriginY - screenY) / proj.tdScale;
  const y = (proj.anchorRow - screenY) / proj.anchorSpan;
  return camera.y + depthFInv(y) * proj.D;
}

function unprojectPoint(screenX, screenY) {
  if (camera.topDown) {
    return {
      sx: (screenX - proj.tdOriginX) / proj.tdScale,
      sy: (proj.tdOriginY - screenY) / proj.tdScale,
    };
  }
  const sy = unprojectY(screenY);
  const w = widthFactor(sy);
  const sx = w <= 0 ? 0 : ((screenX - viewW / 2) * SHEET.HALF_WIDTH) / (proj.halfPx * w);
  return { sx, sy };
}

// What camera.y places this sheet Y on this screen row?
function cameraYForRowAt(sheetY, row) {
  const y = (proj.anchorRow - row) / proj.anchorSpan;
  return sheetY - depthFInv(y) * proj.D;
}

// The sheet Y at the very bottom of the screen — where the ice quad must start
// so there is no gap beneath the camera.
function sheetYAtScreenBottom() {
  if (camera.topDown) return SHEET.BEHIND_HACK_Y;
  return unprojectY(viewH);
}

// On screen at all? Generous margins so objects do not pop at the edges.
function isVisibleY(sy) {
  if (camera.topDown) return sy >= SHEET.BEHIND_HACK_Y - 1 && sy <= SHEET.RUNOUT_Y + 1;
  const row = screenRowOf(sy);
  return row > proj.topRow - viewH * 0.5 && row < viewH * 1.5 && widthFactor(sy) > 0.02;
}

function toggleTopDown() {
  camera.topDown = !camera.topDown;
  updateProjection();
  return camera.topDown;
}
