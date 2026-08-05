// ============================================================
// ROCK — the model and how it draws
//
// Drawn as a squat granite cylinder: a footprint ellipse for the base, a
// second ellipse lifted by the rock's real height for the top face, and the
// sliver between them reads as the side. The handle sits on the top face and
// rotates with the spin.
//
// Rocks are perspective billboards, but because they stand on the ice plane
// their position, footprint and scale all come from the same projection as the
// sheet, so they sit in the scene rather than floating over it.
// ============================================================

const rocks = [];              // every rock currently on the sheet
let deliveredRock = null;      // the rock in flight, or the last one thrown
let rockIdSeq = 0;

function rockRadius() {
  return ROCK.RADIUS * TUNE.rockRadiusScale;
}

function createRock(team, rockDef, x, y) {
  return {
    id: ++rockIdSeq,
    team,
    def: rockDef,
    x, y,
    vx: 0, vy: 0,
    spin: 0,               // signed handle rotation: + clockwise, − counter-clockwise
    spinMag: 0,            // 0..1, how much rotation was applied
    handleAngle: 0,        // rendered rotation of the handle, radians
    radius: rockRadius(),
    mass: TUNE.rockMass,
    moving: false,
    hasStruck: false,      // exempts the delivered rock from the hog-line rule
    removing: 0,           // >0 while the swipe-away animation plays
    removeReason: null,
    distance: 0,           // metres travelled this shot, drives spin decay
    sideBend: 0,           // radians of path bend owed to side brushing
    tractionBias: 1,       // per-shot ice variation from iceFrictionJitter
  };
}

function onRockSizeChanged() {
  const r = rockRadius();
  for (const rock of rocks) rock.radius = r;
}

function resetRocks() {
  rocks.length = 0;
  deliveredRock = null;
}

// ---------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------

function drawRocks(ctx) {
  // Far rocks first, so nearer ones overlap them correctly.
  const order = rocks.slice().sort((a, b) => b.y - a.y);
  for (const rock of order) drawRock(ctx, rock);
}

function drawRock(ctx, rock) {
  if (!isVisibleY(rock.y)) return;

  const base = projectPoint(rock.x, rock.y);
  const w = widthFactor(rock.y);
  if (w <= 0) return;

  // projDepthScale lets rocks shrink slower than the width taper, so the ones
  // sitting in the far house stay readable. At depthScale 1 this boost is 1 and
  // the rock matches the sheet's own taper exactly.
  const boost = projSpriteScale(rock.y) / w;
  const sx = projScaleX(rock.y) * boost;
  const sy = projScaleY(rock.y) * boost;
  if (sx <= 0) return;

  // Floors keep a distant rock from collapsing into a single pixel.
  const rx = Math.max(3.5, rock.radius * sx);
  const ry = Math.max(1.8, rock.radius * sy);      // foreshortened footprint
  // Height maps at roughly the cross-sheet scale: we are looking down a long
  // lane at a shallow angle, so a vertical edge projects close to 1:1 with the
  // horizontal. This vertical extent is most of what makes the rock read as a
  // solid object rather than a dash on the ice.
  const h = Math.max(2.5, ROCK.HEIGHT * TUNE.rockRadiusScale * sx * 0.95);

  let alpha = 1;
  let lift = 0;
  if (rock.removing > 0) {
    // Swiped away to the back: slides off and fades.
    alpha = Math.max(0, 1 - rock.removing);
    lift = rock.removing * 30;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, -lift);

  // --- Contact shadow on the ice ---
  ctx.beginPath();
  ctx.ellipse(base.x, base.y + ry * 0.12, rx * 1.06, ry * 1.06, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(24,52,80,0.30)';
  ctx.fill();

  // Layer AI art if it loaded, procedural granite if not. The sprite path is
  // body + handle as separate images so the handle can keep spinning, which is
  // the player's only read on which way the rock is curling.
  if (drawRockSprite(ctx, rock, base, rx, ry, h)) {
    ctx.restore();
    return;
  }

  // --- Side of the cylinder: the band between the two ellipses ---
  const topY = base.y - h;
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, rx, ry, 0, 0, Math.PI, false);   // lower half of the base
  ctx.lineTo(base.x - rx, topY);
  ctx.ellipse(base.x, topY, rx, ry, 0, Math.PI, 0, true);      // upper half of the top
  ctx.closePath();
  const bandG = ctx.createLinearGradient(base.x - rx, 0, base.x + rx, 0);
  bandG.addColorStop(0, '#3d4046');
  bandG.addColorStop(0.35, COLORS.graniteDark);
  bandG.addColorStop(1, '#33363b');
  ctx.fillStyle = bandG;
  ctx.fill();

  // A dark contour so a small rock still separates from pale ice.
  ctx.strokeStyle = 'rgba(18,30,44,0.75)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- Top face ---
  const g = ctx.createRadialGradient(
    base.x - rx * 0.35, topY - ry * 0.4, rx * 0.1,
    base.x, topY, rx * 1.25
  );
  g.addColorStop(0, '#c3c9d2');
  g.addColorStop(0.42, COLORS.granite);
  g.addColorStop(1, '#4d5057');
  ctx.beginPath();
  ctx.ellipse(base.x, topY, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  // Bright rim on the striking band catches the arena lights, over a dark
  // contour that holds the shape together at small sizes.
  ctx.beginPath();
  ctx.ellipse(base.x, topY, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(18,30,44,0.6)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(base.x, topY - 0.5, rx * 0.94, Math.max(1, ry * 0.9), 0, Math.PI, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = Math.max(0.7, rx * 0.07);
  ctx.stroke();

  drawHandle(ctx, rock, base.x, topY, rx, ry);

  ctx.restore();
}

// Sprite path. Returns false when the art has not loaded, so drawRock falls
// through to the procedural granite.
//
// The body sprite was rendered at a fixed camera angle, so its own aspect ratio
// is used for height rather than the projection's — the strictly correct
// foreshortening at this scale squashes a rock into a 4 px dash. The handle is a
// separate top-down sprite, squashed to the footprint's aspect and rotated, so
// the spin still reads.
function drawRockSprite(ctx, rock, base, rx, ry, h) {
  const body = sprite('rock_body');
  if (!body) return false;

  const w = rx * 2 * 1.06;
  const bh = w * (body.naturalHeight / body.naturalWidth);
  // Sit the sprite so its base meets the contact point, not its centre.
  ctx.drawImage(body, base.x - w / 2, base.y + ry * 0.35 - bh, w, bh);

  const handle = sprite(rock.team === TEAM.YELLOW ? 'handle_yellow' : 'handle_red');
  if (handle) {
    // The top face of the body sprite sits a little above its centre.
    const topY = base.y + ry * 0.35 - bh * 0.62;
    const hw = w * 0.52;
    const hh = hw * (handle.naturalHeight / handle.naturalWidth);
    ctx.save();
    ctx.translate(base.x, topY);
    // Squash into the plane of the top face, then spin.
    ctx.scale(1, 0.62);
    ctx.rotate(rock.handleAngle);
    ctx.drawImage(handle, -hw / 2, -hh / 2, hw, hh);
    ctx.restore();
  } else {
    drawHandle(ctx, rock, base.x, base.y - h, rx, ry);
  }
  return true;
}

function drawHandle(ctx, rock, cx, cy, rx, ry) {
  const isY = rock.team === TEAM.YELLOW;
  const light = isY ? '#ffd95c' : '#ff8479';
  const mid   = isY ? COLORS.yellow : COLORS.red;
  const dark  = isY ? COLORS.yellowDark : COLORS.redDark;

  // The handle is a bar across the top face. Under foreshortening its length
  // squashes vertically the same way the footprint does.
  const len = rx * 1.30;
  const thick = Math.max(1.6, ry * 0.46);
  const a = rock.handleAngle;

  ctx.save();
  ctx.translate(cx, cy);
  // Squash first, then rotate, so the bar lies in the plane of the top face.
  ctx.scale(1, Math.max(0.18, ry / Math.max(rx, 0.001)));
  ctx.rotate(a);

  const hg = ctx.createLinearGradient(0, -thick, 0, thick);
  hg.addColorStop(0, light);
  hg.addColorStop(0.5, mid);
  hg.addColorStop(1, dark);

  roundRect(ctx, -len / 2, -thick, len, thick * 2, thick);
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 0.7;
  ctx.stroke();

  // Bolt at the centre.
  ctx.beginPath();
  ctx.arc(0, 0, thick * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

// Ring drawn around a rock that is currently scoring. Called by scoring.js.
function drawRockHighlight(ctx, rock) {
  if (!isVisibleY(rock.y)) return;
  const base = projectPoint(rock.x, rock.y);
  const sx = projScaleX(rock.y);
  const sy = projScaleY(rock.y);
  const rx = rock.radius * sx * 1.34;
  const ry = Math.max(2, rock.radius * sy * 1.34);

  const pulse = 0.72 + 0.28 * Math.sin(performance.now() / 260);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = rock.team === TEAM.YELLOW ? COLORS.yellow : COLORS.red;
  ctx.globalAlpha = pulse;
  ctx.lineWidth = TUNE.leaderHighlight;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.restore();
}
