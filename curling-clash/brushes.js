// ============================================================
// BRUSHES — the visuals
//
// The doc: brushes appear at the sides of the screen when the rock is launched,
// dash in front of the rock when brushing starts, always stay in front of it,
// and ride along as the camera follows.
//
// So the two heads have two homes — parked at the screen edges, and working the
// ice just ahead of the rock — and we lerp between them. When they are working
// they live in sheet space, which is what makes them follow the camera for free.
// ============================================================

const brushVis = {
  enter: 0,          // 0 = parked at the screen edges, 1 = sweeping ahead of the rock
  visible: 0,        // fades in on launch, out when the rock stops
  sweepPhase: 0,
};

function drawBrushes(ctx) {
  const rock = brush.target;
  const travelling = rock && rock.moving && rock.removing <= 0;

  // Fade the whole rig in while a rock is live, out once it settles.
  const targetVis = travelling ? 1 : 0;
  brushVis.visible += (targetVis - brushVis.visible) * 0.14;
  if (brushVis.visible < 0.01) { brushVis.visible = 0; return; }

  // Dash in when the player actually starts sweeping.
  const targetEnter = brush.active && brush.available ? 1 : 0;
  brushVis.enter += (targetEnter - brushVis.enter) * 0.16;

  // Sweep rate tracks how hard the player is pushing the stick.
  brushVis.sweepPhase += 0.18 + brush.effect * 0.55;

  if (!rock || camera.topDown) return;

  const workY = rock.y + TUNE.brushReach * 0.40;
  const rowNow = screenRowOf(rock.y);

  for (const side of [-1, 1]) {
    // Working position: just ahead of the rock, offset to its side, with the
    // heads scrubbing back and forth across the path.
    const scrub = Math.sin(brushVis.sweepPhase + (side > 0 ? Math.PI : 0)) * 0.14;
    const workX = rock.x + side * (rock.radius * 1.5) + scrub;
    const w = isVisibleY(workY) ? projectPoint(workX, workY) : { x: viewW / 2, y: rowNow };
    const workScale = Math.max(0.35, projSpriteScale(workY));

    // Parked position: hard against the screen edge, level with the rock.
    const parkX = side < 0 ? viewW * 0.10 : viewW * 0.90;
    const parkY = Math.min(viewH * 0.86, Math.max(viewH * 0.30, rowNow + 26));

    const e = brushVis.enter;
    const x = parkX + (w.x - parkX) * e;
    const y = parkY + (w.y - parkY) * e;
    const scale = 1.0 + (workScale - 1.0) * e;

    drawBrush(ctx, x, y, side, scale, brushVis.visible, brushVis.sweepPhase + (side > 0 ? Math.PI : 0));
  }
}

function drawBrush(ctx, x, y, side, scale, alpha, phase) {
  const s = Math.max(0.4, Math.min(2.2, scale)) * 34;
  const wobble = Math.sin(phase) * 0.16 * brush.effect;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  // Heads angle inward toward the centre line, and rock with the sweep.
  ctx.rotate(side * (0.55 + wobble));

  // Layer AI broom if it loaded; the drawn one below is the fallback.
  const art = sprite('brush_head');
  if (art) {
    const bw = s * 1.05;
    const bh = bw * (art.naturalHeight / art.naturalWidth);
    // Anchored at the head, which is the end that meets the ice.
    ctx.drawImage(art, -bw / 2, -bh + s * 0.16, bw, bh);
    if (brush.effect > 0.15) {
      ctx.globalAlpha = alpha * brush.effect * 0.30;
      roundRect(ctx, -s * 0.72, -s * 0.10, s * 1.44, s * 0.28, s * 0.14);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // Shaft.
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -s * 1.35);
  ctx.strokeStyle = '#2f4a63';
  ctx.lineWidth = Math.max(1.8, s * 0.11);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.15);
  ctx.lineTo(0, -s * 1.30);
  ctx.strokeStyle = '#5278a0';
  ctx.lineWidth = Math.max(0.8, s * 0.05);
  ctx.stroke();

  // Head — the pad that meets the ice.
  const hw = s * 0.46, hh = s * 0.22;
  const g = ctx.createLinearGradient(0, -hh, 0, hh);
  g.addColorStop(0, '#ffe9b8');
  g.addColorStop(0.55, '#e0b978');
  g.addColorStop(1, '#8e6a35');
  roundRect(ctx, -hw, -hh, hw * 2, hh * 2, hh * 0.6);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Motion smear while sweeping hard.
  if (brush.effect > 0.15) {
    ctx.globalAlpha = alpha * brush.effect * 0.35;
    roundRect(ctx, -hw * 1.5, -hh * 0.7, hw * 3, hh * 1.4, hh * 0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
  }
  ctx.restore();
}
