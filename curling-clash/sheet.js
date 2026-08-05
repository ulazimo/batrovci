// ============================================================
// SHEET — the ice, its lines, the house, and the zone tests
//
// Every dimension comes from config.js, which in turn comes from the WCF
// rules. Nothing here invents a measurement.
//
// Drawing order matches real ice: the house rings are painted first and the
// tee, back and centre lines run across them, visible on top — check the
// shooting-perspective reference photo.
// ============================================================

// Deterministic longitudinal scratches, so the ice has grain without a texture
// file and without re-randomising every frame. Fixed sheet-space X positions.
const ICE_SCRATCHES = (() => {
  const out = [];
  let seed = 20260805;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 16; i++) {
    out.push({
      x: (rnd() * 2 - 1) * SHEET.HALF_WIDTH * 0.94,
      y0: rnd() * SHEET.RUNOUT_Y * 0.5,
      y1: SHEET.RUNOUT_Y * (0.5 + rnd() * 0.5),
      a: 0.03 + rnd() * 0.05,
    });
  }
  return out;
})();

// ---------------------------------------------------------------
// Path helpers — anything on the ice plane projects through the same transform
// ---------------------------------------------------------------

// A circle drawn on the ice becomes a conic on screen, so sample it rather
// than faking it with ctx.arc. 48 segments is smooth at phone resolution.
function traceIceCircle(ctx, cx, cy, r, segments = 48) {
  ctx.beginPath();
  let started = false;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const sy = cy + Math.sin(a) * r;
    if (!isVisibleY(sy)) { started = false; continue; }
    const pt = projectPoint(cx + Math.cos(a) * r, sy);
    if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.closePath();
}

// A line across the sheet at a constant sheet Y, from x0 to x1.
function traceIceCrossLine(ctx, y, x0 = -SHEET.HALF_WIDTH, x1 = SHEET.HALF_WIDTH) {
  const a = projectPoint(x0, y);
  const b = projectPoint(x1, y);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
}

// A band across the sheet with real thickness in metres (the hog line is 4in).
function fillIceBand(ctx, yCentre, thickness, color, x0 = -SHEET.HALF_WIDTH, x1 = SHEET.HALF_WIDTH) {
  const yA = yCentre - thickness / 2;
  const yB = yCentre + thickness / 2;
  if (!isVisibleY(yA) && !isVisibleY(yB)) return;
  const p1 = projectPoint(x0, yA), p2 = projectPoint(x1, yA);
  const p3 = projectPoint(x1, yB), p4 = projectPoint(x0, yB);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// Thin painted lines are sub-centimetre, so drawing them as bands would make
// them vanish. Stroke them instead, with a width that respects perspective but
// never drops below one pixel.
function strokeIceLine(ctx, y, color, weight = 1, x0 = -SHEET.HALF_WIDTH, x1 = SHEET.HALF_WIDTH) {
  if (!isVisibleY(y)) return;
  traceIceCrossLine(ctx, y, x0, x1);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.8, projScaleX(y) * SHEET.WIDTH * 0.004 * weight);
  ctx.stroke();
}

// ---------------------------------------------------------------
// Main draw
// ---------------------------------------------------------------

function drawSheet(ctx) {
  if (camera.topDown) { drawSheetTopDown(ctx); return; }

  drawArena(ctx);
  drawIceSurface(ctx);
  drawHouse(ctx);
  drawSheetLines(ctx);
  drawHacks(ctx);
  drawNearBoards(ctx);
}

function drawArena(ctx) {
  // Everything beyond the ice: cool, dark, out of focus.
  const g = ctx.createLinearGradient(0, 0, 0, viewH);
  g.addColorStop(0, '#08131f');
  g.addColorStop(TUNE.projTopRow * 0.85, '#0f2740');
  g.addColorStop(Math.min(1, TUNE.projTopRow + 0.02), '#16334e');
  g.addColorStop(1, '#0c1f31');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);

  // The Layer AI arena plate over the gradient. Anchored to the top of the view
  // rather than stretched to fill, so the horizon in the plate stays put as the
  // camera moves down the sheet — a plate that slid with the camera would read
  // as the arena walking away from you.
  const plate = sprite('arena');
  if (plate) {
    const ph = viewW * (plate.naturalHeight / plate.naturalWidth);
    const drawH = Math.max(ph, viewH * (TUNE.projTopRow + 0.30));
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(plate, 0, 0, viewW, drawH);
    ctx.restore();
    // Blend its bottom edge into the gradient so there is no visible seam.
    const fade = ctx.createLinearGradient(0, drawH * 0.72, 0, drawH);
    fade.addColorStop(0, 'rgba(12,31,49,0)');
    fade.addColorStop(1, 'rgba(12,31,49,1)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, drawH * 0.72, viewW, drawH * 0.28 + 1);
  }
}

// The sheet stops 6 ft behind the hack, and because depth is close to even that
// leaves real screen below the ice. Rather than a floating slab, this is the
// delivery end: backboard, then the surround the sweepers stand on. The power
// slider and brushing stick live down here, so the space earns its keep.
function drawNearBoards(ctx) {
  if (camera.topDown) return;
  const edge = SHEET.BEHIND_HACK_Y;
  const row = screenRowOf(edge);
  if (row >= viewH) return;

  const g = ctx.createLinearGradient(0, row, 0, viewH);
  g.addColorStop(0, '#24384a');
  g.addColorStop(0.10, '#1a2b39');
  g.addColorStop(0.55, '#121e29');
  g.addColorStop(1, '#0a1017');
  ctx.fillStyle = g;
  ctx.fillRect(0, row, viewW, viewH - row);

  // Backboard cap catching the arena light.
  ctx.fillStyle = 'rgba(190,222,245,0.20)';
  ctx.fillRect(0, row, viewW, Math.max(1.5, viewH * 0.005));
  ctx.fillStyle = 'rgba(6,12,20,0.45)';
  ctx.fillRect(0, row + Math.max(1.5, viewH * 0.005), viewW, Math.max(1, viewH * 0.010));

  // A cool pool of light spilling off the ice onto the surround.
  const glow = ctx.createLinearGradient(0, row, 0, row + (viewH - row) * 0.55);
  glow.addColorStop(0, 'rgba(140,200,240,0.13)');
  glow.addColorStop(1, 'rgba(140,200,240,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, row, viewW, (viewH - row) * 0.55);
}

function drawIceSurface(ctx) {
  // Draw the whole sheet from wherever it meets the bottom of the screen up to
  // the runout. The horizon does the compressing — there is no separate "how
  // much is visible" number to get out of step with the lens.
  const nearY = Math.max(sheetYAtScreenBottom(), SHEET.BEHIND_HACK_Y);
  const farY = SHEET.RUNOUT_Y;
  if (farY <= nearY) return;

  const nl = projectPoint(-SHEET.HALF_WIDTH, nearY);
  const nr = projectPoint(SHEET.HALF_WIDTH, nearY);
  const fr = projectPoint(SHEET.HALF_WIDTH, farY);
  const fl = projectPoint(-SHEET.HALF_WIDTH, farY);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(nl.x, nl.y); ctx.lineTo(nr.x, nr.y);
  ctx.lineTo(fr.x, fr.y); ctx.lineTo(fl.x, fl.y);
  ctx.closePath();

  const g = ctx.createLinearGradient(0, fl.y, 0, nl.y);
  g.addColorStop(0, COLORS.iceDeep);
  g.addColorStop(0.35, COLORS.iceShadow);
  g.addColorStop(1, COLORS.ice);
  ctx.fillStyle = g;
  ctx.fill();

  // Clip everything that follows to the ice, so neither the texture nor the
  // grain bleeds onto the arena floor.
  ctx.clip();

  // Layer AI ice texture, if it loaded. Scaled so the tile shrinks with the
  // perspective and faded well back — this is a floor, and the rocks and UI have
  // to sit clearly on top of it.
  const pattern = getIcePattern();
  if (pattern) {
    const scale = Math.max(0.25, projScaleX(camera.y) / 120);
    ctx.save();
    // Multiply rather than overlay: the ice is nearly white, and overlay on a
    // near-white base does almost nothing. Multiply reads the pebble as gentle
    // darkening, which is what pebbled ice actually looks like.
    ctx.globalAlpha = 0.38;
    ctx.globalCompositeOperation = 'multiply';
    ctx.translate(0, nl.y);
    ctx.scale(scale, scale * 0.55);
    ctx.fillStyle = pattern;
    ctx.fillRect(-viewW / scale, -viewH / (scale * 0.55), (viewW * 2) / scale, (viewH * 2) / (scale * 0.55));
    ctx.restore();
  }

  ctx.lineCap = 'round';
  for (const s of ICE_SCRATCHES) {
    if (s.y1 < nearY || s.y0 > farY) continue;
    const a = projectPoint(s.x, Math.max(s.y0, nearY));
    const b = projectPoint(s.x, Math.min(s.y1, farY));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = `rgba(255,255,255,${s.a})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();

  // Side lines — the sheet edges.
  ctx.beginPath();
  ctx.moveTo(nl.x, nl.y); ctx.lineTo(fl.x, fl.y);
  ctx.moveTo(nr.x, nr.y); ctx.lineTo(fr.x, fr.y);
  ctx.strokeStyle = 'rgba(90,107,122,0.55)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function drawHouse(ctx) {
  const tee = SHEET.TEE_Y;
  // Outside in, so each ring paints over the one beneath it.
  const rings = [
    [HOUSE.R_12FT, COLORS.house12],
    [HOUSE.R_8FT,  COLORS.house8],
    [HOUSE.R_4FT,  COLORS.house4],
    [HOUSE.R_BUTTON, COLORS.houseButton],
  ];
  for (const [r, col] of rings) {
    traceIceCircle(ctx, 0, tee, r);
    ctx.fillStyle = col;
    ctx.fill();
  }
  // A faint rim so the outer edge reads against pale ice.
  traceIceCircle(ctx, 0, tee, HOUSE.R_12FT);
  ctx.strokeStyle = 'rgba(20,40,80,0.35)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function drawSheetLines(ctx) {
  // Hog lines are 102 mm wide — wide enough to draw as real bands.
  fillIceBand(ctx, SHEET.NEAR_HOG_Y, R.HOG_LINE_WIDTH, 'rgba(90,107,122,0.75)');
  fillIceBand(ctx, SHEET.FAR_HOG_Y,  R.HOG_LINE_WIDTH, 'rgba(90,107,122,0.75)');

  // Thin painted lines.
  strokeIceLine(ctx, SHEET.TEE_Y,       'rgba(70,86,100,0.85)', 1.0);
  strokeIceLine(ctx, SHEET.BACK_LINE_Y, 'rgba(70,86,100,0.85)', 1.0);
  strokeIceLine(ctx, SHEET.NEAR_TEE_Y,  'rgba(90,107,122,0.55)', 1.0);

  // Centre line: runs from the near hack line to 12 ft past the playing tee,
  // which lands it just past the back line.
  const cTop = Math.min(SHEET.TEE_Y + R.TEE_TO_HACK, SHEET.RUNOUT_Y);
  const a = projectPoint(0, SHEET.HACK_Y);
  const b = projectPoint(0, cTop);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = 'rgba(70,86,100,0.6)';
  ctx.lineWidth = 1.3;
  ctx.stroke();
}

function drawHacks(ctx) {
  // Two hacks either side of the centre line at the delivery end.
  if (!isVisibleY(SHEET.HACK_Y)) return;
  for (const side of [-1, 1]) {
    const x0 = side * R.HACK_INSET;
    const x1 = side * (R.HACK_INSET + R.HACK_WIDTH);
    fillIceBand(ctx, SHEET.HACK_Y, R.HACK_LINE_LENGTH * 0.28, 'rgba(40,54,68,0.8)',
      Math.min(x0, x1), Math.max(x0, x1));
  }
}

// ---------------------------------------------------------------
// Top-down debug view — the ground truth for geometry
// ---------------------------------------------------------------

function drawSheetTopDown(ctx) {
  ctx.fillStyle = '#0a1622';
  ctx.fillRect(0, 0, viewW, viewH);

  const w = SHEET.WIDTH * proj.tdScale;
  const h = SHEET.RUNOUT_Y * proj.tdScale;
  const left = proj.tdOriginX - w / 2;
  const top = proj.tdOriginY - h;

  ctx.fillStyle = COLORS.ice;
  ctx.fillRect(left, top, w, h);

  // Metre grid: every metre faint, every 5 m labelled.
  ctx.font = '9px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (let m = 0; m <= Math.floor(SHEET.RUNOUT_Y); m++) {
    const y = proj.tdOriginY - m * proj.tdScale;
    const major = m % 5 === 0;
    ctx.strokeStyle = major ? 'rgba(20,50,80,0.30)' : 'rgba(20,50,80,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y); ctx.lineTo(left + w, y);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = 'rgba(150,190,220,0.75)';
      ctx.textAlign = 'right';
      ctx.fillText(m + 'm', left - 4, y);
    }
  }

  drawHouse(ctx);
  drawSheetLines(ctx);
  drawHacks(ctx);

  // Landmark labels on the right, so every named line can be checked at once.
  const marks = [
    ['hack', SHEET.HACK_Y],
    ['near tee', SHEET.NEAR_TEE_Y],
    ['near hog', SHEET.NEAR_HOG_Y],
    ['far hog', SHEET.FAR_HOG_Y],
    ['TEE / button', SHEET.TEE_Y],
    ['back line', SHEET.BACK_LINE_Y],
  ];
  ctx.textAlign = 'left';
  for (const [label, y] of marks) {
    const py = proj.tdOriginY - y * proj.tdScale;
    ctx.strokeStyle = 'rgba(88,200,240,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left + w, py); ctx.lineTo(left + w + 6, py);
    ctx.stroke();
    ctx.fillStyle = 'rgba(143,227,255,0.9)';
    ctx.fillText(`${label}  ${y.toFixed(3)}`, left + w + 9, py);
  }
}

// ---------------------------------------------------------------
// Zone tests — the in/out-of-play rules, WCF R2 (f)(g)(h)
// ---------------------------------------------------------------

function distToTee(rock) {
  const dx = rock.x;
  const dy = rock.y - SHEET.TEE_Y;
  return Math.sqrt(dx * dx + dy * dy);
}

// R2(f): a rock must come to rest COMPLETELY beyond the inside edge of the
// playing hog line — unless it struck another rock, which exempts it.
function clearsFarHog(rock) {
  return rock.y - rock.radius > SHEET.FAR_HOG_Y + R.HOG_LINE_WIDTH / 2;
}

// R2(g): removed once it COMPLETELY crosses the outside edge of the back line.
function pastBackLine(rock) {
  return rock.y - rock.radius > SHEET.BACK_LINE_Y;
}

// R2(h): removed on touching a side line.
function touchesSideLine(rock) {
  return Math.abs(rock.x) + rock.radius >= SHEET.HALF_WIDTH;
}

// A rock is in the house if any part of it touches or overlaps the 12-foot
// circle, so compare centre distance against ring radius + rock radius.
function isInHouse(rock) {
  return distToTee(rock) < HOUSE.R_12FT + rock.radius;
}
