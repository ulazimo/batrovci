// ============================================================
// EFFECTS — what special rocks leave behind on the ice
//
// Most special effects are not properties of a rock. They are things a rock
// DEPOSITS, which then act on every later shot: zones, walls, water. So they
// live here in their own list with their own turn-counted lifetimes, entirely
// separate from rocks[].
//
// The physics only ever reaches into this module through three narrow queries,
// which is what keeps advanceRockState readable as eleven effects pile up:
//
//   zoneTractionAt(x, y)   traction multiplier, folded in beside brushing
//   zoneForceOn(rock)      magnet pull, as an {ax, ay} acceleration
//   wallCollide(rock)      static collision, returns true if it hit
//
// Freeze is not here — it is a counter on the rock itself, because it modifies
// that rock's next collision rather than occupying a place on the ice. Pulse is
// not here either: it fires once and leaves nothing behind.
//
// Lifetimes are counted in TURNS, per the doc ("Zones should have a duration of
// Turns how long they are on the board"), with 0 meaning until the end of the
// match. tickEffectTurns() is called once per completed throw.
// ============================================================

const boardEffects = [];

function clearBoardEffects() {
  boardEffects.length = 0;
}

function addBoardEffect(fx) {
  boardEffects.push(fx);
  return fx;
}

// Called once per completed throw. Expiring here rather than per-frame means a
// zone lives for a whole number of turns exactly as the doc describes.
function tickEffectTurns() {
  for (let i = boardEffects.length - 1; i >= 0; i--) {
    const fx = boardEffects[i];
    if (fx.turnsLeft !== undefined && fx.turnsLeft !== LASTS_ALL_MATCH) {
      fx.turnsLeft--;
      if (fx.turnsLeft <= 0) boardEffects.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------

function depositZone(kind, rock, def) {
  const p = def.params;
  return addBoardEffect({
    kind,                                   // 'speedZone' | 'slowZone'
    x: rock.x, y: rock.y,
    radius: p.radius,
    traction: p.traction,
    turnsLeft: effectTurns(def),
    team: rock.team,
    born: 0,
  });
}

function depositWall(rock, def) {
  const p = def.params;
  const health = p.health * TUNE.fxWallHealth;
  return addBoardEffect({
    kind: 'wall',
    x: rock.x, y: rock.y,
    halfWidth: p.halfWidth,
    health, maxHealth: health,
    turnsLeft: LASTS_ALL_MATCH,             // walls persist until broken
    team: rock.team,
    hitFlash: 0,
  });
}

function depositMagnet(rock, def) {
  const p = def.params;
  return addBoardEffect({
    kind: 'magnet',
    x: rock.x, y: rock.y,
    radius: p.radius,
    pull: p.pull,
    turnsLeft: effectTurns(def),
    team: rock.team,
    ownerId: rock.id,
    phase: 0,
  });
}

// The Fire Rock's trail. Deposited every fxFireSpacing metres while it moves,
// rather than every step — a patch per physics tick would be thousands of
// objects for one shot.
function depositWater(x, y, def) {
  return addBoardEffect({
    kind: 'water',
    x, y,
    radius: def.params.radius * TUNE.fxFireTrailWidth,
    turnsLeft: effectTurns(def),
    born: 0,
  });
}

// ---------------------------------------------------------------
// Physics queries
// ---------------------------------------------------------------

// Smooth falloff toward a zone's rim. A hard edge makes a rock clipping the
// boundary look like it snagged on nothing.
function zoneWeight(dist, radius) {
  if (dist >= radius) return 0;
  const soft = Math.max(0.0001, TUNE.fxZoneEdgeSoft) * radius;
  const fromEdge = radius - dist;
  return Math.min(1, fromEdge / soft);
}

// Combined traction multiplier from every zone the point sits in. 1 = untouched
// ice. Speed zones pull it below 1, slow zones above.
function zoneTractionAt(x, y) {
  let mul = 1;
  for (const fx of boardEffects) {
    if (fx.kind !== 'speedZone' && fx.kind !== 'slowZone') continue;
    const d = Math.hypot(x - fx.x, y - fx.y);
    const w = zoneWeight(d, fx.radius);
    if (w <= 0) continue;
    // Blend toward the zone's traction by weight, then scale the whole
    // departure from 1 by the global strength knob.
    const local = 1 + (fx.traction - 1) * w * TUNE.fxZoneStrength;
    mul *= local;
  }
  return mul;
}

// Is this point on melted water? Brushing does not work there, per the doc.
function isOnWater(x, y) {
  for (const fx of boardEffects) {
    if (fx.kind !== 'water') continue;
    if (Math.hypot(x - fx.x, y - fx.y) < fx.radius) return true;
  }
  return false;
}

// Magnet pull on a moving rock, as an acceleration. Never applied to the magnet
// rock that produced it, or a magnet would drag itself.
function zoneForceOn(rock) {
  let ax = 0, ay = 0;
  for (const fx of boardEffects) {
    if (fx.kind !== 'magnet') continue;
    if (fx.ownerId === rock.id) continue;
    const dx = fx.x - rock.x;
    const dy = fx.y - rock.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.02 || d >= fx.radius) continue;
    // Falls off toward the rim so the pull has a defined edge.
    const t = 1 - d / fx.radius;
    const mag = fx.pull * TUNE.fxMagnetStrength * Math.pow(t, TUNE.fxMagnetFalloff);
    ax += (dx / d) * mag;
    ay += (dy / d) * mag;
  }
  return { ax, ay };
}

// Static collision against wall segments. A wall is a thin horizontal barrier
// centred on its rock, extending halfWidth each way; it is treated as a line
// segment the rock cannot cross, rather than a box, because rocks only ever
// approach it from up or down the sheet.
function wallCollide(rock) {
  let hit = false;
  for (let i = boardEffects.length - 1; i >= 0; i--) {
    const fx = boardEffects[i];
    if (fx.kind !== 'wall') continue;

    const withinX = Math.abs(rock.x - fx.x) <= fx.halfWidth + rock.radius;
    if (!withinX) continue;

    const dy = rock.y - fx.y;
    const gap = Math.abs(dy) - rock.radius;
    if (gap > 0) continue;

    // Approaching only — a rock already resting against a wall must not be
    // repeatedly kicked.
    const closing = (dy > 0 && rock.vy < 0) || (dy <= 0 && rock.vy > 0);
    if (!closing) continue;

    const impact = Math.abs(rock.vy);
    hit = true;

    // Damage scales with how hard it was hit; a Power Rock hits far harder.
    const powerMul = hasEffect(rock.def, 'power')
      ? rock.def.params.wallDamageMul * TUNE.fxPowerMul : 1;
    fx.health -= impact * TUNE.fxWallDamage * powerMul;
    fx.hitFlash = 1;

    if (typeof spawnCollisionSpark === 'function') {
      spawnCollisionSpark(rock.x, fx.y, Math.min(1, impact / 4));
    }

    if (fx.health <= 0) {
      // Broke through. The rock keeps going — bouncing it back off a wall that
      // no longer exists is the obvious wrong answer, and it made a successful
      // smash look identical to being blocked.
      boardEffects.splice(i, 1);
      rock.vx *= TUNE.fxWallBreakKeep;
      rock.vy *= TUNE.fxWallBreakKeep;
      if (typeof spawnWallBreak === 'function') spawnWallBreak(fx);
      continue;
    }

    // Held. Push the rock clear and rebound it.
    const side = dy >= 0 ? 1 : -1;
    rock.y = fx.y + side * (rock.radius + 0.001);
    rock.vy = -rock.vy * TUNE.fxWallBounce;
    rock.vx *= TUNE.fxWallBounce;
  }
  return hit;
}

// ---------------------------------------------------------------
// One-shot effects
// ---------------------------------------------------------------

// Pulse: shove every other rock in radius directly away. Fires once, leaves
// nothing on the board.
function firePulse(rock, def) {
  const p = def.params;
  for (const other of rocks) {
    if (other === rock || other.removing > 0) continue;
    const dx = other.x - rock.x;
    const dy = other.y - rock.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.001 || d >= p.radius) continue;
    const t = 1 - d / p.radius;
    const push = p.push * TUNE.fxPulseStrength * t;
    other.vx += (dx / d) * push;
    other.vy += (dy / d) * push;
    other.moving = true;
  }
  if (typeof spawnPulseRing === 'function') spawnPulseRing(rock.x, rock.y, p.radius);
}

// Freeze: mark rocks in radius so they shrug off their next collision.
function fireFreeze(rock, def) {
  const r = def.params.radius * TUNE.fxFreezeRadius;
  for (const other of rocks) {
    if (other.removing > 0) continue;
    if (Math.hypot(other.x - rock.x, other.y - rock.y) >= r) continue;
    other.frozen = true;
  }
  if (typeof spawnFreezeBurst === 'function') spawnFreezeBurst(rock.x, rock.y, r);
}

// ---------------------------------------------------------------
// Dispatch — called by physics when a rock comes to rest
// ---------------------------------------------------------------

function applyOnStopEffect(rock) {
  const def = rock.def;
  if (!def || def.trigger !== 'onStop' || !def.effect) return;
  if (rock.effectFired) return;          // once per throw, not once per settle
  rock.effectFired = true;

  switch (def.effect) {
    case 'wall':      depositWall(rock, def); break;
    case 'speedZone': depositZone('speedZone', rock, def); break;
    case 'slowZone':  depositZone('slowZone', rock, def); break;
    case 'magnet':    depositMagnet(rock, def); break;
    case 'pulse':     firePulse(rock, def); break;
    case 'freeze':    fireFreeze(rock, def); break;
  }
}

// Fire Rock lays water as it travels. Called every step for the moving rock.
function applyTrailEffect(rock) {
  const def = rock.def;
  if (!def || def.trigger !== 'whileMoving' || def.effect !== 'fire') return;
  const spacing = TUNE.fxFireSpacing;
  if (rock.distance - (rock.lastTrailAt || 0) < spacing) return;
  rock.lastTrailAt = rock.distance;
  depositWater(rock.x, rock.y, def);
}

// ---------------------------------------------------------------
// Rendering — under the rocks, on the ice
// ---------------------------------------------------------------

function drawBoardEffects(ctx) {
  if (!boardEffects.length) return;
  const now = performance.now() / 1000;

  ctx.save();
  ctx.globalAlpha = TUNE.fxEffectAlpha;

  // Zones and water first, then walls on top — walls are solid objects, the
  // rest are surface treatments.
  for (const fx of boardEffects) {
    if (fx.kind === 'speedZone') drawSpeedZone(ctx, fx, now);
    else if (fx.kind === 'slowZone') drawSlowZone(ctx, fx);
    else if (fx.kind === 'water') drawWater(ctx, fx, now);
    else if (fx.kind === 'magnet') drawMagnet(ctx, fx, now);
  }
  for (const fx of boardEffects) {
    if (fx.kind === 'wall') drawWall(ctx, fx);
    if (fx.hitFlash > 0) fx.hitFlash = Math.max(0, fx.hitFlash - 0.04);
  }
  ctx.restore();
}

// "Visually as Speed Up arrows and green", per the doc.
function drawSpeedZone(ctx, fx, now) {
  if (!isVisibleY(fx.y)) return;
  traceIceCircle(ctx, fx.x, fx.y, fx.radius, 36);
  ctx.fillStyle = 'rgba(70,220,120,0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,240,140,0.75)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Chevrons drifting up the sheet, so the zone reads as "faster this way".
  const rows = 3;
  const drift = (now * 0.6) % 1;
  for (let i = 0; i < rows; i++) {
    const t = ((i / rows) + drift) % 1;
    const y = fx.y - fx.radius * 0.6 + t * fx.radius * 1.2;
    const fade = Math.sin(t * Math.PI);
    const w = fx.radius * 0.42;
    const a = projectPoint(fx.x - w, y);
    const b = projectPoint(fx.x, y + fx.radius * 0.22);
    const c = projectPoint(fx.x + w, y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y);
    ctx.strokeStyle = `rgba(150,255,190,${0.75 * fade})`;
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }
}

// "Visually as ice debris."
function drawSlowZone(ctx, fx) {
  if (!isVisibleY(fx.y)) return;
  traceIceCircle(ctx, fx.x, fx.y, fx.radius, 36);
  ctx.fillStyle = 'rgba(150,170,190,0.30)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,145,170,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Deterministic scatter of chips, seeded off the zone's position so it does
  // not crawl between frames.
  let seed = Math.floor((fx.x + 50) * 977 + fx.y * 131);
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * fx.radius * 0.92;
    const p = projectPoint(fx.x + Math.cos(a) * r, fx.y + Math.sin(a) * r);
    const s = 1 + rnd() * 2;
    ctx.fillStyle = 'rgba(235,245,255,0.85)';
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
}

function drawWater(ctx, fx, now) {
  if (!isVisibleY(fx.y)) return;
  traceIceCircle(ctx, fx.x, fx.y, fx.radius, 24);
  const shimmer = 0.5 + 0.5 * Math.sin(now * 2 + fx.x * 3 + fx.y);
  ctx.fillStyle = `rgba(40,120,190,${0.30 + 0.10 * shimmer})`;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,200,255,0.55)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function drawMagnet(ctx, fx, now) {
  if (!isVisibleY(fx.y)) return;
  // Concentric rings pulling inward.
  for (let i = 0; i < 3; i++) {
    const t = ((now * 0.5 + i / 3) % 1);
    const r = fx.radius * (1 - t);
    traceIceCircle(ctx, fx.x, fx.y, r, 30);
    ctx.strokeStyle = `rgba(224,138,44,${0.55 * t})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  traceIceCircle(ctx, fx.x, fx.y, fx.radius, 34);
  ctx.strokeStyle = 'rgba(224,138,44,0.35)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawWall(ctx, fx) {
  if (!isVisibleY(fx.y)) return;
  const frac = Math.max(0, fx.health / fx.maxHealth);

  // Wall thickness in metres, so it foreshortens with everything else.
  const thick = 0.16;
  const p1 = projectPoint(fx.x - fx.halfWidth, fx.y - thick);
  const p2 = projectPoint(fx.x + fx.halfWidth, fx.y - thick);
  const p3 = projectPoint(fx.x + fx.halfWidth, fx.y + thick);
  const p4 = projectPoint(fx.x - fx.halfWidth, fx.y + thick);

  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
  ctx.closePath();

  // Blue for Defense, and it visibly weakens as it takes damage.
  const g = ctx.createLinearGradient(0, p1.y, 0, p3.y);
  g.addColorStop(0, `rgba(120,190,255,${0.55 + 0.35 * frac})`);
  g.addColorStop(1, `rgba(40,95,175,${0.55 + 0.35 * frac})`);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = fx.hitFlash > 0
    ? `rgba(255,255,255,${fx.hitFlash})`
    : 'rgba(190,225,255,0.85)';
  ctx.lineWidth = fx.hitFlash > 0 ? 3 : 1.6;
  ctx.stroke();

  // Health pips along the top edge, so "how many more hits" is legible.
  const segs = 5;
  const lit = Math.ceil(frac * segs);
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs + 0.06 / segs;
    const t1 = (i + 1) / segs - 0.06 / segs;
    const a = projectPoint(fx.x - fx.halfWidth + fx.halfWidth * 2 * t0, fx.y - thick * 1.6);
    const b = projectPoint(fx.x - fx.halfWidth + fx.halfWidth * 2 * t1, fx.y - thick * 1.6);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = i < lit ? 'rgba(200,235,255,0.95)' : 'rgba(200,235,255,0.20)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}
