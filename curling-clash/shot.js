// ============================================================
// SHOT — aiming, the power slider, the curl handle, release
//
// Flow, following the doc's "Rock Launching Controls and Flow":
//
//   idle       rock waiting at the delivery end, curl handle available
//   charging   finger down on the rock; power slider revealed. Vertical drag
//              sets power (pull back to throw harder), horizontal drag aims.
//   delivering rock slides from the hack to the near hog line, "from where it
//              gets its initial moment"
//   travelling physics owns it; trajectory fades, shot area shrinks
//
// The Shot Area's honesty is the subtle part. The doc wants the landing point
// fixed at release with random variance, yet the circle to become "more
// deterministic as the Rock is slowing down". So the variance is baked into the
// launch itself — a nudge to power and angle — and the circle is then drawn
// around a genuine forward simulation of where the rock is now headed. It
// shrinks because the prediction gets more certain, not because the game is
// quietly steering the rock.
// ============================================================

const shot = {
  phase: 'idle',            // idle | charging | delivering | travelling
  power: 0,                 // 0..1 slider position
  aim: 0,                   // −1..1, scaled to aimMaxAngleDeg
  spin: 0,                  // −1..1, + clockwise (curves left)
  rock: null,               // the rock being aimed

  dragging: null,           // 'power' | 'handle' | null
  dragStart: { x: 0, y: 0 },
  dragBase: 0,

  deliverT: 0,              // 0..1 through the delivery slide
  resolved: null,           // { power, angle } after variance, applied at release
  trajFade: 1,              // 1 = fully visible, 0 = gone
  shakePhase: 0,

  enabled: false,           // false during the opponent's turn or an overlay
};

let shotPreview = null;     // last prediction, reused by the renderer

function initShot() {
  const cvs = document.getElementById('sheet-canvas');
  cvs.addEventListener('pointerdown', onShotPointerDown, { passive: false });
  window.addEventListener('pointermove', onShotPointerMove, { passive: false });
  window.addEventListener('pointerup', onShotPointerUp, { passive: false });
  window.addEventListener('pointercancel', onShotPointerUp, { passive: false });

  document.getElementById('btn-focus-house').addEventListener('click', () => {
    setCameraMode('house');
    document.getElementById('btn-back-to-shot').classList.add('show');
    updateShotButtons();
  });
  document.getElementById('btn-back-to-shot').addEventListener('click', () => {
    setCameraMode('shot');
    document.getElementById('btn-back-to-shot').classList.remove('show');
    updateShotButtons();
  });
}

// Arm a new rock at the delivery end and hand control to the player.
function armShot(rock) {
  shot.rock = rock;
  rock.x = 0;
  rock.y = SHOOT_Y;
  rock.handleAngle = 0;
  shot.phase = 'idle';
  shot.power = 0;
  shot.aim = 0;
  shot.spin = 0;
  shot.trajFade = 1;
  shot.resolved = null;
  shot.dragging = null;
  shot.enabled = true;
  resetCameraToShot();
  positionFocusButton();
  updateShotButtons();
}

function disableShotInput() {
  shot.enabled = false;
  shot.dragging = null;
  updateShotButtons();
}

function updateShotButtons() {
  const fh = document.getElementById('btn-focus-house');
  const back = document.getElementById('btn-back-to-shot');
  const canLook = shot.enabled && shot.phase === 'idle' && camState.mode !== 'house';
  fh.classList.toggle('ready', canLook);
  if (camState.mode !== 'house') back.classList.remove('show');
}

// The doc puts the Focus House button on the right, in line with the rock's
// starting position.
function positionFocusButton() {
  if (!viewH) return;
  const btn = document.getElementById('btn-focus-house');
  const row = TUNE.camAnchorRow * viewH;
  btn.style.top = Math.round(row - 23) + 'px';
}

// ---------------------------------------------------------------
// Input
// ---------------------------------------------------------------

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function onShotPointerDown(e) {
  if (!shot.enabled || shot.phase !== 'idle' || camState.mode === 'house') return;
  const p = canvasPoint(e);

  // The curl handle sits to the right of the rock and is checked first: it is
  // smaller than the rock and would otherwise be impossible to grab.
  const hp = handleScreenPos();
  if (Math.hypot(p.x - hp.x, p.y - hp.y) < 34) {
    e.preventDefault();
    shot.dragging = 'handle';
    return;
  }

  const rp = projectPoint(shot.rock.x, shot.rock.y);
  const grabR = Math.max(38, shot.rock.radius * projScaleX(shot.rock.y) * 2.2);
  if (Math.hypot(p.x - rp.x, p.y - rp.y) < grabR) {
    e.preventDefault();
    shot.dragging = 'power';
    shot.dragStart = p;
    shot.phase = 'charging';
    shot.power = 0;
    shot.aim = 0;
    updateShotButtons();
  }
}

function onShotPointerMove(e) {
  if (!shot.dragging) return;
  e.preventDefault();
  const p = canvasPoint(e);

  if (shot.dragging === 'handle') {
    const rp = projectPoint(shot.rock.x, shot.rock.y);
    // Angle of the handle around the rock, measured from 3 o'clock. Screen Y
    // grows downward, so a positive angle is clockwise — which is also
    // clockwise on the ice, since we are looking down the sheet.
    let ang = Math.atan2(p.y - rp.y, p.x - rp.x);
    const maxRad = (TUNE.curlHandleMaxDeg * Math.PI) / 180;
    ang = Math.max(-maxRad, Math.min(maxRad, ang));
    shot.spin = ang / maxRad;
    shot.rock.handleAngle = ang;
    return;
  }

  if (!viewW || !viewH) return;

  // Power: pull back (downward) from the rock, like a slingshot.
  const track = powerTrackLength();
  let power = (p.y - shot.dragStart.y) / track;
  power = Math.max(0, Math.min(1, power));

  // Aim: sideways offset. Full deflection at a third of the screen width.
  let aim = (p.x - shot.dragStart.x) / (viewW * 0.34);
  aim = Math.max(-1, Math.min(1, aim));

  // Light snapping, as the doc asks: to a dead-straight shot, and to perfect
  // power. Both pull harder the closer you already are, so they assist rather
  // than fight the finger.
  shot.aim = softSnap(aim, 0, 0.22, TUNE.snapStraight);
  shot.power = softSnap(power, TUNE.perfectPowerCenter, TUNE.perfectZoneWidth, TUNE.snapPerfect);
}

function onShotPointerUp(e) {
  if (!shot.dragging) return;
  const was = shot.dragging;
  shot.dragging = null;
  if (was !== 'power') return;

  // A tap with no meaningful pull is a cancel, not a dribbled shot.
  if (shot.power < 0.02) {
    shot.phase = 'idle';
    shot.power = 0;
    updateShotButtons();
    return;
  }
  releaseShot();
}

function softSnap(v, target, radius, strength) {
  const d = v - target;
  if (Math.abs(d) >= radius || radius <= 0) return v;
  const closeness = 1 - Math.abs(d) / radius;
  return v - d * strength * closeness;
}

// ---------------------------------------------------------------
// Release
// ---------------------------------------------------------------

function aimAngleRad() {
  return (shot.aim * TUNE.aimMaxAngleDeg * Math.PI) / 180;
}

function shotAreaRadius(rockDef) {
  return statValue(rockDef, 'accuracy') * TUNE.shotAreaScale;
}

// Roll the shot's error once, at release, and fold it into the launch so the
// physics carries it honestly.
function resolveShotVariance(rockDef, powerT, angleRad) {
  const r = shotAreaRadius(rockDef);

  // Uniform point in the disc — sqrt keeps it area-uniform rather than
  // clustering in the middle.
  const a = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random()) * r;
  const offLat = Math.cos(a) * rad;      // across the sheet
  const offLong = Math.sin(a) * rad;     // along the sheet

  // Local sensitivity of the rest point to the controls, measured rather than
  // assumed, so this stays correct through any re-tuning.
  const base = predictLaunch(rockDef, powerT, angleRad, shot.spin, 0, SHEET.NEAR_HOG_Y);
  const baseY = base.restY;
  const travel = Math.max(1, base.restY - SHEET.NEAR_HOG_Y);

  const dP = 0.02;
  const bumped = predictLaunch(rockDef, Math.min(1, powerT + dP), angleRad, shot.spin, 0, SHEET.NEAR_HOG_Y);
  const metresPerPower = (bumped.restY - baseY) / dP;

  const powerAdj = metresPerPower !== 0 ? offLong / metresPerPower : 0;
  const angleAdj = Math.atan2(offLat, travel);

  const power = Math.max(0, Math.min(1, powerT + powerAdj));
  const angle = angleRad + angleAdj;
  // Never hand a non-finite launch to the physics — one NaN would corrupt the
  // rock permanently and there is no recovering from it mid-shot.
  return {
    power: isFinite(power) ? power : powerT,
    angle: isFinite(angle) ? angle : 0,
  };
}

function releaseShot() {
  shot.resolved = resolveShotVariance(shot.rock.def, shot.power, aimAngleRad());
  shot.phase = 'delivering';
  shot.deliverT = 0;
  shot.enabled = false;
  updateShotButtons();
  brushUsedThisShot = false;
  trackShot(shot.rock, shot.resolved);
}

// The delivery slide: the rock travels from the hack to the near hog line,
// where it picks up the launch velocity. On the fixed timestep with everything
// else, so a slow frame rate cannot stretch it out in wall-clock time.
function stepDelivery(dt) {
  if (shot.phase === 'travelling' || shot.phase === 'delivering') {
    shot.trajFade = Math.max(0, shot.trajFade - dt / TUNE.trajectoryFade);
  }
  if (shot.phase !== 'delivering') return;
  shot.deliverT += dt / Math.max(0.05, TUNE.deliverySlideTime);
  const t = Math.min(1, shot.deliverT);
  const e = t * t * (3 - 2 * t);          // smoothstep: eases out of the hack

  const from = SHOOT_Y;
  const to = SHEET.NEAR_HOG_Y;
  shot.rock.y = from + (to - from) * e;
  shot.rock.x = Math.sin(shot.resolved.angle) * (shot.rock.y - from) * 0.15;
  // Handle already turned to its curl angle; it holds until release.

  if (t >= 1) {
    shot.rock.x = 0;
    shot.rock.y = to;
    launchRock(shot.rock, shot.resolved.power, shot.resolved.angle, shot.spin);
    shot.phase = 'travelling';
    setCameraMode('follow', false);
    if (typeof onRockLaunched === 'function') onRockLaunched(shot.rock);
  }
}

// ---------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------

// The track runs downward from the rock — pull back to throw harder — so it has
// to fit in the screen below the camera anchor row. Floored well above zero: a
// zero or negative track would divide the drag by nothing and poison the shot
// with NaN, which can happen if the view is measured before layout settles.
function powerTrackLength() {
  return Math.max(60, Math.min(viewH * 0.24, viewH * (1 - TUNE.camAnchorRow) - 26));
}

function drawShotUI(ctx) {
  if (!shot.rock) return;
  if (camera.topDown) { drawIceAids(ctx); return; }

  drawIceAids(ctx);

  if (shot.phase === 'idle' || shot.phase === 'charging') {
    drawCurlHandle(ctx);
  }
  if (shot.phase === 'charging') {
    drawPowerSlider(ctx);
  }
}

// The on-ice aids: trajectory line and shot area.
function drawIceAids(ctx) {
  const rock = shot.rock;
  if (!rock) return;

  let pred = null;
  let areaR = 0;

  if (shot.phase === 'charging') {
    pred = predictLaunch(rock.def, shot.power, aimAngleRad(), shot.spin, 0, SHEET.NEAR_HOG_Y);
    areaR = shotAreaRadius(rock.def);
  } else if (shot.phase === 'travelling' && rock.moving) {
    pred = predictFromRock(rock);
    // The circle collapses as certainty arrives with the rock slowing down.
    const speed = Math.hypot(rock.vx, rock.vy);
    const launch = launchSpeedFor(rock.def, shot.resolved.power);
    const frac = Math.min(1, speed / Math.max(0.01, launch));
    areaR = shotAreaRadius(rock.def) * Math.pow(frac, TUNE.shotAreaShrinkPow);
  }

  if (!pred) return;

  // --- Trajectory: only the portion the rock's Trajectory stat reveals ---
  if (shot.trajFade > 0.01) {
    ctx.save();
    ctx.globalAlpha = 0.85 * shot.trajFade;

    // The delivery run-up, hack to hog line. Faint, because it is not part of
    // what the Trajectory stat reveals — but without it the dashed path appears
    // to float unconnected halfway down the sheet.
    if (shot.phase === 'charging') {
      const a = projectPoint(rock.x, rock.y);
      const b = projectPoint(0, SHEET.NEAR_HOG_Y);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 5]);
      ctx.stroke();
    }

    const frac = statValue(rock.def, 'trajectory');
    const pts = pred.points;
    const n = Math.max(2, Math.floor(pts.length * frac));
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      if (!isVisibleY(pts[i].y)) { started = false; continue; }
      const s = projectPoint(pts[i].x, pts[i].y);
      if (!started) { ctx.moveTo(s.x, s.y); started = true; }
      else ctx.lineTo(s.x, s.y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([7, 6]);
    ctx.shadowColor = 'rgba(60,140,190,0.9)';
    ctx.shadowBlur = 5;
    ctx.stroke();
    ctx.restore();
  }

  // --- Shot Area: transparent fill, more opaque outline, per the doc ---
  if (areaR > 0.01 && isVisibleY(pred.restY)) {
    ctx.save();
    traceIceCircle(ctx, pred.restX, pred.restY, areaR, 40);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.62)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
  }

  shotPreview = pred;
}

function handleScreenPos() {
  const rock = shot.rock;
  const rp = projectPoint(rock.x, rock.y);
  const sx = projScaleX(rock.y);
  const orbit = Math.max(44, rock.radius * sx * 2.5);
  const maxRad = (TUNE.curlHandleMaxDeg * Math.PI) / 180;
  const ang = shot.spin * maxRad;
  return { x: rp.x + Math.cos(ang) * orbit, y: rp.y + Math.sin(ang) * orbit, orbit, cx: rp.x, cy: rp.y };
}

function drawCurlHandle(ctx) {
  const h = handleScreenPos();
  const maxRad = (TUNE.curlHandleMaxDeg * Math.PI) / 180;

  ctx.save();
  // The arc the handle can travel, so the available curl range is legible.
  ctx.beginPath();
  ctx.arc(h.cx, h.cy, h.orbit, -maxRad, maxRad);
  ctx.strokeStyle = 'rgba(143,227,255,0.30)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Spoke from rock to handle.
  ctx.beginPath();
  ctx.moveTo(h.cx, h.cy);
  ctx.lineTo(h.x, h.y);
  ctx.strokeStyle = 'rgba(143,227,255,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // The grip.
  const g = ctx.createRadialGradient(h.x - 4, h.y - 5, 1, h.x, h.y, 15);
  g.addColorStop(0, '#b9ecff');
  g.addColorStop(1, '#1c6c92');
  ctx.beginPath();
  ctx.arc(h.x, h.y, 13, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Curl direction and amount.
  if (Math.abs(shot.spin) > 0.04) {
    ctx.fillStyle = '#eaf6ff';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shot.spin > 0 ? '↰' : '↱', h.x, h.y + 0.5);

    const label = (shot.spin > 0 ? 'CURLS LEFT ' : 'CURLS RIGHT ') +
                  Math.round(Math.abs(shot.spin) * 100) + '%';
    ctx.font = '800 9px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(143,227,255,0.95)';
    ctx.fillText(label, h.cx, h.cy - h.orbit - 12);
  }
  ctx.restore();
}

function drawPowerSlider(ctx) {
  const rock = shot.rock;
  const rp = projectPoint(rock.x, rock.y);
  const track = powerTrackLength();
  const w = 26;
  const top = rp.y;
  const x = rp.x;

  // Shakiness above the perfect zone, growing with the overdraw.
  const perfectHi = TUNE.perfectPowerCenter + TUNE.perfectZoneWidth / 2;
  let shakeX = 0;
  if (shot.power > perfectHi) {
    const over = (shot.power - perfectHi) / Math.max(0.01, 1 - perfectHi);
    shot.shakePhase += 0.9;
    shakeX = Math.sin(shot.shakePhase) * TUNE.overShakeAmp * over;
  }

  ctx.save();
  ctx.translate(shakeX, 0);

  // Track.
  roundRect(ctx, x - w / 2, top, w, track, w / 2);
  ctx.fillStyle = 'rgba(8,20,32,0.42)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  const zLo = top + (TUNE.perfectPowerCenter - TUNE.perfectZoneWidth / 2) * track;
  const zHi = top + (TUNE.perfectPowerCenter + TUNE.perfectZoneWidth / 2) * track;

  // Fill up to the current power, semi-transparent and colour-ramped.
  const fillH = shot.power * track;
  ctx.save();
  roundRect(ctx, x - w / 2, top, w, track, w / 2);
  ctx.clip();
  ctx.fillStyle = powerColor(shot.power, 0.72);
  ctx.fillRect(x - w / 2, top, w, fillH);

  // Perfect zone marker, drawn OVER the fill. Underneath it disappears the
  // moment the player pulls past it — which is exactly when they most need to
  // see where it was.
  ctx.fillStyle = 'rgba(79,214,114,0.22)';
  ctx.fillRect(x - w / 2, zLo, w, Math.max(3, zHi - zLo));
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 4, zLo); ctx.lineTo(x + w / 2 + 4, zLo);
  ctx.moveTo(x - w / 2 - 4, zHi); ctx.lineTo(x + w / 2 + 4, zHi);
  ctx.strokeStyle = 'rgba(79,214,114,0.95)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Knob.
  const ky = top + fillH;
  ctx.beginPath();
  ctx.arc(x, ky, w * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = powerColor(shot.power, 1);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Readout.
  ctx.fillStyle = '#fff';
  ctx.font = '800 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(shot.power * 100) + '', x, ky);

  // Aim indicator: how far off the centre line the shot is pointed.
  if (Math.abs(shot.aim) > 0.02) {
    const deg = shot.aim * TUNE.aimMaxAngleDeg;
    ctx.font = '800 10px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText((deg > 0 ? '▸ ' : '◂ ') + Math.abs(deg).toFixed(1) + '°', x, top + track + 14);
  }
  ctx.restore();
}

// The doc's ramp: "Orange, Yellow to Green when around the Perfect area, and
// above it, it will go Orange to Red". Both sides ease out of green rather than
// snapping at the zone edge, so the colour reads as a gradient you are steering
// through rather than a switch that flips.
function powerColor(t, alpha) {
  const lo = TUNE.perfectPowerCenter - TUNE.perfectZoneWidth / 2;
  const hi = TUNE.perfectPowerCenter + TUNE.perfectZoneWidth / 2;
  let c;
  if (t < lo) {
    const u = lo > 0 ? t / lo : 0;
    c = mixHex(COLORS.powerLow, COLORS.powerMid, u);
    c = mixHex(c, COLORS.powerPerfect, Math.pow(u, 3));   // greens up near the zone
  } else if (t <= hi) {
    c = COLORS.powerPerfect;
  } else {
    const u = (t - hi) / Math.max(0.001, 1 - hi);
    // Green → orange over the first stretch above the zone, then orange → red.
    c = u < 0.35
      ? mixHex(COLORS.powerPerfect, COLORS.powerHigh, u / 0.35)
      : mixHex(COLORS.powerHigh, COLORS.powerOver, (u - 0.35) / 0.65);
  }
  return hexToRgba(c, alpha);
}

function mixHex(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round((pa >> 16) + ((pb >> 16) - (pa >> 16)) * t);
  const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
  const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
  return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
}

function hexToRgba(hex, alpha) {
  const p = parseInt(hex.slice(1), 16);
  return `rgba(${p >> 16},${(p >> 8) & 255},${p & 255},${alpha})`;
}
