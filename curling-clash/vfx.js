// ============================================================
// VFX — sparks, ice spray, floating labels
//
// Particles live in sheet space so they sit on the ice under the same
// projection as everything else, and shrink correctly with distance.
// ============================================================

const particles = [];
const MAX_PARTICLES = 260;

function spawnParticle(p) {
  if (particles.length >= MAX_PARTICLES) particles.shift();
  particles.push(p);
}

// Granite on granite: a hard flash and a scatter of chips.
function spawnCollisionSpark(x, y, impact) {
  const n = Math.round(4 + impact * 10);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (0.6 + Math.random() * 2.2) * (0.4 + impact);
    spawnParticle({
      kind: 'spark',
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 1, decay: 2.4 + Math.random() * 1.6,
      size: 0.020 + Math.random() * 0.030,
    });
  }
  spawnParticle({ kind: 'flash', x, y, life: 1, decay: 5.5, size: 0.30 + impact * 0.34 });
}

// Brushed ice throws a fine spray behind the brush heads.
function spawnIceSpray(x, y, intensity) {
  if (Math.random() > intensity * 0.7) return;
  const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
  spawnParticle({
    kind: 'spray',
    x: x + (Math.random() - 0.5) * 0.35,
    y,
    vx: Math.cos(a) * (0.3 + Math.random() * 0.6),
    vy: Math.sin(a) * (0.3 + Math.random() * 0.5),
    life: 1, decay: 1.6 + Math.random(),
    size: 0.014 + Math.random() * 0.022,
  });
}

// Text that rises off a point on the ice — used for the score count-up.
function spawnIceLabel(x, y, text, color) {
  spawnParticle({ kind: 'label', x, y, text, color, life: 1, decay: 0.7, rise: 0 });
}

function drawVfx(ctx, dt) {
  const step = Math.min(0.05, dt || 1 / 60);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= p.decay * step;
    if (p.life <= 0) { particles.splice(i, 1); continue; }

    if (p.vx !== undefined) {
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.vx *= 0.90;
      p.vy *= 0.90;
    }
    if (p.kind === 'label') p.rise += step * 34;

    if (!isVisibleY(p.y)) continue;
    const s = projectPoint(p.x, p.y);
    const sx = projScaleX(p.y);

    ctx.save();
    if (p.kind === 'spark') {
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(0.7, p.size * sx), 0, Math.PI * 2);
      ctx.fillStyle = p.life > 0.6 ? '#fff6d8' : '#ffd27a';
      ctx.fill();
    } else if (p.kind === 'flash') {
      ctx.globalAlpha = p.life * 0.75;
      const r = Math.max(2, p.size * sx * (1.6 - p.life));
      const art = sprite('flash');
      if (art) {
        // Additive, so the flash reads as light rather than a pasted decal.
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(art, s.x - r, s.y - r, r * 2, r * 2);
      } else {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
        g.addColorStop(0, 'rgba(255,255,235,0.95)');
        g.addColorStop(1, 'rgba(255,210,140,0)');
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }
    } else if (p.kind === 'ring') {
      // Expands to its true radius in sheet metres, so it reads as the actual
      // area of effect rather than a decorative flourish.
      ctx.globalAlpha = p.life;
      traceIceCircle(ctx, p.x, p.y, p.size * (1 - p.life * 0.85), 30);
      ctx.strokeStyle = p.color + p.life + ')';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (p.kind === 'spray') {
      ctx.globalAlpha = p.life * 0.85;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(0.6, p.size * sx), 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    } else if (p.kind === 'label') {
      ctx.globalAlpha = Math.min(1, p.life * 1.6);
      ctx.font = '900 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(p.text, s.x, s.y - p.rise);
      ctx.fillStyle = p.color || '#fff';
      ctx.fillText(p.text, s.x, s.y - p.rise);
    }
    ctx.restore();
  }
}

// ---- Special-rock effects ----

// Pulse Rock: an expanding ring at the true effect radius, so the player can
// see exactly how far the shove reached.
function spawnPulseRing(x, y, radius) {
  spawnParticle({ kind: 'ring', x, y, size: radius, life: 1, decay: 1.6,
                  color: 'rgba(255,150,120,' });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    spawnParticle({
      kind: 'spark', x, y,
      vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2,
      life: 1, decay: 2.6, size: 0.03,
    });
  }
}

// Freeze Rock: a cold ring plus frost shards settling.
function spawnFreezeBurst(x, y, radius) {
  spawnParticle({ kind: 'ring', x, y, size: radius, life: 1, decay: 1.1,
                  color: 'rgba(150,220,255,' });
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    spawnParticle({
      kind: 'spray', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
      vx: 0, vy: 0, life: 1, decay: 0.8, size: 0.03,
    });
  }
}

// A frozen rock taking its free hit.
function spawnFreezeShatter(x, y) {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.8 + Math.random() * 1.8;
    spawnParticle({
      kind: 'spray', x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 1, decay: 2.2, size: 0.022,
    });
  }
  spawnIceLabel(x, y, 'FROZEN', '#9fd8ff');
}

// A wall losing its last health.
function spawnWallBreak(fx) {
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.0 + Math.random() * 2.4;
    spawnParticle({
      kind: 'spark',
      x: fx.x + (Math.random() * 2 - 1) * fx.halfWidth,
      y: fx.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 1, decay: 1.8, size: 0.035,
    });
  }
  spawnIceLabel(fx.x, fx.y, 'WALL DOWN', '#9fd8ff');
}

function clearVfx() { particles.length = 0; }
