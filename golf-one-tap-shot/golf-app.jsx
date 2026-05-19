// Golf one‑tap prototype.
// One gesture: drag landing target → press SEND IT.
// Hunting‑Sniper-inspired scope HUD, top‑down hole, optional ball‑cam.

const { useState, useRef, useEffect, useMemo, useCallback } = React;

// ─────────────────────────────────────────────────────────────
// Hole data (top-down, SVG-coord)
// ─────────────────────────────────────────────────────────────
// Canvas: 360 × 780 (inside phone screen)
const HOLE_W = 360, HOLE_H = 780;
const TEE = { x: 180, y: 720 };
const PIN = { x: 245, y: 95 };

// Polygons / shapes for terrain. Order matters: green > bunker > water > fairway > rough.
const FAIRWAY = [
  [150, 720], [210, 720], [240, 580], [225, 470], [180, 380],
  [125, 300], [135, 220], [200, 170], [275, 145], [270, 95],
  [220, 80], [165, 110], [105, 200], [90, 290], [125, 380],
  [170, 470], [185, 580],
];
const ROUGH = [
  [90, 740], [270, 740], [305, 580], [285, 460], [240, 360],
  [185, 290], [205, 220], [255, 195], [325, 175], [330, 80],
  [200, 50], [125, 80], [55, 200], [40, 310], [85, 410],
  [130, 510], [120, 620],
];
const GREEN = { cx: 245, cy: 110, rx: 58, ry: 42 };
const BUNKERS = [
  { cx: 192, cy: 150, r: 22 },
  { cx: 298, cy: 145, r: 18 },
  { cx: 250, cy: 175, r: 14 },
];
const WATER = { x: 245, y: 320, w: 80, h: 200, rx: 24 };
const TREES = [
  // decorative; not OB hit zones
  { cx: 60, cy: 260, r: 14 }, { cx: 45, cy: 360, r: 12 }, { cx: 50, cy: 460, r: 13 },
  { cx: 70, cy: 560, r: 14 }, { cx: 95, cy: 650, r: 12 },
  { cx: 320, cy: 250, r: 13 }, { cx: 340, cy: 350, r: 12 }, { cx: 335, cy: 540, r: 13 },
  { cx: 315, cy: 640, r: 14 }, { cx: 295, cy: 700, r: 12 },
];

// Distance scale: tee→pin ≈ 625 px → 420 yds. 1 px ≈ 0.67 yd
const PX_PER_YD = 625 / 420;
const yards = (dx, dy) => Math.round(Math.hypot(dx, dy) / PX_PER_YD);

// ─────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function inCircle(x, y, c) { return Math.hypot(x - c.cx, y - c.cy) <= c.r; }
function inEllipse(x, y, e) {
  const dx = (x - e.cx) / e.rx, dy = (y - e.cy) / e.ry;
  return dx * dx + dy * dy <= 1;
}
function inRect(x, y, r) {
  return x >= r.x - r.w / 2 && x <= r.x + r.w / 2 &&
         y >= r.y - r.h / 2 && y <= r.y + r.h / 2;
}

function terrainAt(x, y) {
  if (inEllipse(x, y, GREEN)) return 'green';
  for (const b of BUNKERS) if (inCircle(x, y, b)) return 'bunker';
  if (inRect(x, y, WATER)) return 'water';
  if (pointInPoly(x, y, FAIRWAY)) return 'fairway';
  if (pointInPoly(x, y, ROUGH)) return 'rough';
  return 'ob';
}

// Club selection from yardage
const CLUBS = [
  { name: 'PW',  max: 110 },
  { name: '9I',  max: 135 },
  { name: '8I',  max: 155 },
  { name: '7I',  max: 175 },
  { name: '6I',  max: 195 },
  { name: '5I',  max: 215 },
  { name: '4I',  max: 235 },
  { name: '3W',  max: 270 },
  { name: 'DRV', max: 320 },
];
function clubFor(yds) {
  for (const c of CLUBS) if (yds <= c.max) return c;
  return CLUBS[CLUBS.length - 1];
}

// Seeded random
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = seed; t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────
// Hole SVG
// ─────────────────────────────────────────────────────────────
function HoleScene({ children, svgRef, viewBox, onPointerDown, onPointerMove, onPointerUp }) {
  return (
    <svg
      ref={svgRef}
      viewBox={viewBox || `0 0 ${HOLE_W} ${HOLE_H}`}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', userSelect: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        <linearGradient id="skyOB" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a3a1c" />
          <stop offset="1" stopColor="#0e2410" />
        </linearGradient>
        <radialGradient id="greenGrad" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#a9e36a" />
          <stop offset="1" stopColor="#6fb33b" />
        </radialGradient>
        <linearGradient id="fairwayGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7cc449" />
          <stop offset="1" stopColor="#5fa036" />
        </linearGradient>
        <radialGradient id="waterGrad" cx="0.5" cy="0.5" r="0.7">
          <stop offset="0" stopColor="#5cb8ff" />
          <stop offset="1" stopColor="#2a6fb5" />
        </radialGradient>
        <radialGradient id="bunkerGrad" cx="0.45" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#f2e2a4" />
          <stop offset="1" stopColor="#d4be72" />
        </radialGradient>
        <pattern id="fairwayStripes" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(20)">
          <rect width="14" height="14" fill="url(#fairwayGrad)" />
          <rect width="7" height="14" fill="#6cb43e" opacity="0.55" />
        </pattern>
        <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>

      {/* OB / trees background */}
      <rect x="0" y="0" width={HOLE_W} height={HOLE_H} fill="url(#skyOB)" />
      {TREES.map((t, i) => (
        <g key={i}>
          <circle cx={t.cx + 1.5} cy={t.cy + 2} r={t.r} fill="#000" opacity="0.35" />
          <circle cx={t.cx} cy={t.cy} r={t.r} fill="#2c5a2e" />
          <circle cx={t.cx - t.r * 0.35} cy={t.cy - t.r * 0.35} r={t.r * 0.55} fill="#3a7038" />
        </g>
      ))}

      {/* Rough */}
      <polygon points={ROUGH.map(p => p.join(',')).join(' ')} fill="#4d8a31" />

      {/* Fairway (striped) */}
      <polygon points={FAIRWAY.map(p => p.join(',')).join(' ')} fill="url(#fairwayStripes)" />

      {/* Water */}
      <rect
        x={WATER.x - WATER.w / 2} y={WATER.y - WATER.h / 2}
        width={WATER.w} height={WATER.h} rx={WATER.rx}
        fill="url(#waterGrad)" stroke="#a9deff" strokeWidth="1.2" strokeOpacity="0.6"
      />
      {/* Water wavelets */}
      {[0, 1, 2, 3, 4].map(i => (
        <path
          key={i}
          d={`M ${WATER.x - 28} ${WATER.y - 70 + i * 36} q 12 -4 24 0 t 24 0`}
          fill="none" stroke="#fff" strokeWidth="1" strokeOpacity="0.35"
        />
      ))}

      {/* Bunkers */}
      {BUNKERS.map((b, i) => (
        <circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill="url(#bunkerGrad)"
          stroke="#b59a4a" strokeWidth="1" strokeOpacity="0.5" />
      ))}

      {/* Green */}
      <ellipse cx={GREEN.cx + 2} cy={GREEN.cy + 4} rx={GREEN.rx} ry={GREEN.ry}
        fill="#000" opacity="0.25" filter="url(#softShadow)" />
      <ellipse cx={GREEN.cx} cy={GREEN.cy} rx={GREEN.rx} ry={GREEN.ry} fill="url(#greenGrad)" />
      {/* Green mow lines */}
      {[0.3, 0.55, 0.8].map(t => (
        <ellipse key={t} cx={GREEN.cx} cy={GREEN.cy}
          rx={GREEN.rx * t} ry={GREEN.ry * t}
          fill="none" stroke="#9ed95a" strokeOpacity="0.35" strokeWidth="0.7" />
      ))}

      {/* Pin */}
      <line x1={PIN.x} y1={PIN.y} x2={PIN.x} y2={PIN.y - 22} stroke="#fff" strokeWidth="1.5" />
      <path d={`M ${PIN.x} ${PIN.y - 22} L ${PIN.x + 12} ${PIN.y - 18} L ${PIN.x} ${PIN.y - 13} Z`} fill="#ff3b3b" />
      <circle cx={PIN.x} cy={PIN.y} r="3" fill="#fff" stroke="#222" strokeWidth="0.5" />
      <circle cx={PIN.x} cy={PIN.y} r="1.6" fill="#0d1011" />

      {/* Tee box */}
      <rect x={TEE.x - 14} y={TEE.y - 6} width="28" height="12" rx="2" fill="#7cc449" stroke="#3d6420" strokeWidth="0.8" />
      <circle cx={TEE.x - 6} cy={TEE.y} r="1.2" fill="#3d6420" />
      <circle cx={TEE.x + 6} cy={TEE.y} r="1.2" fill="#3d6420" />

      {children}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Target reticle — 3-zone bullseye + wind direction arrow.
// Outer (green) = loose, middle (blue) = tight, inner (orange) = perfect.
// Ring radii contract when scoped + breath held (tighter aim).
// ─────────────────────────────────────────────────────────────
function TargetReticle({ x, y, dragging, scoped, aborting, windAngle }) {
  // Three concentric zones (radii in svg-px)
  const baseScale = scoped ? 0.72 : 1;
  const dragScale = dragging ? 1.04 : 1;
  const r1 = 11 * baseScale * dragScale;
  const r2 = 20 * baseScale * dragScale;
  const r3 = 32 * baseScale * dragScale;

  // Colors — muted when aborting
  const cOuter   = aborting ? '#ff8a8a' : '#a9e36a';   // light green
  const sOuter   = aborting ? '#ff5050' : '#5fa036';
  const cMiddle  = aborting ? '#ff9090' : '#7ad6ff';   // cyan/blue
  const sMiddle  = aborting ? '#ff4040' : '#2a8fcc';
  const cInner   = aborting ? '#ff5b5b' : '#ff9a3d';   // orange
  const sInner   = aborting ? '#a02020' : '#d96b18';

  return (
    <g transform={`translate(${x},${y})`} style={{ pointerEvents: 'none' }}>
      {/* Outer ring (green) */}
      <circle r={r3} fill={cOuter} fillOpacity="0.38"
        stroke={sOuter} strokeWidth="1.4" strokeOpacity="0.85" />
      {/* Middle ring (blue) */}
      <circle r={r2} fill={cMiddle} fillOpacity="0.55"
        stroke={sMiddle} strokeWidth="1.3" strokeOpacity="0.9" />
      {/* Inner disc (orange) */}
      <circle r={r1} fill={cInner} fillOpacity="0.85"
        stroke={sInner} strokeWidth="1.2" strokeOpacity="0.95" />

      {/* Center pin dot */}
      <circle r="1.7" fill="#1a1f23" />

      {/* Wind direction arrow on the outer ring (points where wind blows TO) */}
      <g transform={`rotate(${windAngle})`}>
        <line x1="0" y1={-r3 - 1} x2="0" y2={-r3 - 9}
          stroke="#0d3550" strokeWidth="2.6" strokeLinecap="round" />
        <line x1="0" y1={-r3 - 1} x2="0" y2={-r3 - 9}
          stroke="#7ad6ff" strokeWidth="1.4" strokeLinecap="round" />
        <path d={`M 0 ${-r3 - 13} L 4.5 ${-r3 - 6} L 0 ${-r3 - 8} L -4.5 ${-r3 - 6} Z`}
          fill="#7ad6ff" stroke="#0d3550" strokeWidth="0.6" strokeLinejoin="round" />
      </g>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// Trajectory preview path
// ─────────────────────────────────────────────────────────────
function buildArcPath(ax, ay, bx, by, curveAmt = 0) {
  // perpendicular offset for wind curve
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len; // perp
  const cx = mx + nx * curveAmt;
  const cy = my + ny * curveAmt;
  return `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
}

// ─────────────────────────────────────────────────────────────
// HUD: top status bar
// ─────────────────────────────────────────────────────────────
function HudTop({ hole, par, ydsToPin, wind }) {
  const arrow = wind.angle; // degrees (0 = N / up = headwind from N)
  return (
    <div style={{
      position: 'absolute', top: 50, left: 0, right: 0, zIndex: 20,
      display: 'flex', justifyContent: 'space-between', padding: '8px 14px',
      pointerEvents: 'none',
    }}>
      <div style={hudPanelStyle}>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 11, letterSpacing: '0.12em', color: '#8b969e' }}>HOLE</div>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 700, color: '#fff', lineHeight: 0.95 }}>
          {hole}<span style={{ fontSize: 14, color: '#8b969e', marginLeft: 5 }}>· PAR {par}</span>
        </div>
      </div>
      <div style={{ ...hudPanelStyle, alignItems: 'center', minWidth: 88 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 11, letterSpacing: '0.12em', color: '#8b969e' }}>TO PIN</div>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 28, fontWeight: 700, color: '#c8ff3d', lineHeight: 0.95 }}>
          {ydsToPin}<span style={{ fontSize: 12, color: '#8b969e', marginLeft: 2 }}>yd</span>
        </div>
      </div>
      <div style={hudPanelStyle}>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 11, letterSpacing: '0.12em', color: '#8b969e' }}>WIND</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="20" height="20" viewBox="-12 -12 24 24" style={{ transform: `rotate(${arrow}deg)` }}>
            <path d="M 0 -8 L 5 4 L 0 1 L -5 4 Z" fill="#7ad6ff" />
          </svg>
          <div style={{ fontFamily: 'Barlow Condensed', fontSize: 22, fontWeight: 700, color: '#7ad6ff', lineHeight: 0.95 }}>
            {wind.speed}<span style={{ fontSize: 10, color: '#8b969e', marginLeft: 1 }}>mph</span>
          </div>
        </div>
      </div>
    </div>
  );
}
const hudPanelStyle = {
  display: 'flex', flexDirection: 'column', gap: 2,
  background: 'rgba(13,16,17,0.78)',
  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  border: '1px solid rgba(200,255,61,0.18)',
  borderRadius: 8, padding: '7px 11px',
};

// ─────────────────────────────────────────────────────────────
// HUD: bottom (club / send button)
// ─────────────────────────────────────────────────────────────
function HudBottom({ club, distance, onFire, armed, firing, onReset, didShoot, fireMode, dragging, exitZone, scoped }) {
  const isRelease = fireMode === 'release';
  const aborting = exitZone === 'cancel';
  const unscoping = exitZone === 'unscope';
  return (
    <div style={{
      position: 'absolute', bottom: 38, left: 0, right: 0, zIndex: 20,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      padding: '0 14px', gap: 10, pointerEvents: 'none',
    }}>
      {/* Club card */}
      <div style={{
        background: 'rgba(13,16,17,0.85)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 12, padding: '8px 12px 9px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 66,
        pointerEvents: 'auto',
      }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.14em', color: '#8b969e' }}>CLUB</div>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 30, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{club.name}</div>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#8b969e' }}>≤{club.max}y</div>
      </div>

      {/* Center: button (button mode) or status pill (release mode) */}
      {isRelease ? (
        <div style={{
          flex: 1, height: 64, borderRadius: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          background: didShoot
            ? 'linear-gradient(180deg, rgba(42,58,69,0.85) 0%, rgba(26,37,48,0.85) 100%)'
            : aborting
              ? 'linear-gradient(180deg, rgba(120,30,30,0.85) 0%, rgba(70,15,15,0.85) 100%)'
              : unscoping
                ? 'linear-gradient(180deg, rgba(30,80,120,0.85) 0%, rgba(15,40,70,0.85) 100%)'
                : dragging
                  ? 'linear-gradient(180deg, rgba(200,255,61,0.18) 0%, rgba(120,180,30,0.18) 100%)'
                  : 'rgba(13,16,17,0.78)',
          border: aborting
            ? '1px solid rgba(255,107,107,0.55)'
            : unscoping
              ? '1px solid rgba(122,214,255,0.55)'
              : dragging
                ? '1px solid rgba(200,255,61,0.55)'
                : '1px solid rgba(255,255,255,0.12)',
          boxShadow: dragging && !aborting && !unscoping
            ? '0 6px 20px rgba(200,255,61,0.22), inset 0 0 22px rgba(200,255,61,0.06)'
            : '0 4px 12px rgba(0,0,0,0.35)',
          cursor: didShoot ? 'pointer' : 'default',
          pointerEvents: didShoot ? 'auto' : 'none',
          fontFamily: 'Barlow Condensed', fontWeight: 800, letterSpacing: '0.14em',
          textTransform: 'uppercase',
          transition: 'background 140ms ease, border-color 140ms ease',
        }} onClick={didShoot ? onReset : undefined}>
          {firing ? (
            <span style={{ fontSize: 22, color: '#c8ff3d' }}>· · ·</span>
          ) : didShoot ? (
            <span style={{ fontSize: 18, color: '#7ad6ff' }}>Tap for next shot</span>
          ) : aborting ? (
            <span style={{ fontSize: 16, color: '#ff6b6b' }}>↓ Release to cancel</span>
          ) : unscoping ? (
            <span style={{ fontSize: 16, color: '#7ad6ff' }}>Release scope · no fire</span>
          ) : dragging ? (
            scoped ? (
              <span style={{ fontSize: 18, color: '#c8ff3d' }}>Release to fire — {distance}y</span>
            ) : (
              <span style={{ fontSize: 13, color: '#8b969e' }}>Hold still to scope — release cancels</span>
            )
          ) : (
            <span style={{ fontSize: 14, color: '#8b969e' }}>⤳ Press &amp; drag to aim</span>
          )}
        </div>
      ) : (
        <button
          disabled={!armed || firing}
          onClick={didShoot ? onReset : onFire}
          style={{
            flex: 1, height: 64, borderRadius: 32, border: 'none',
            fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 22, letterSpacing: '0.14em',
            textTransform: 'uppercase',
            background: didShoot
              ? 'linear-gradient(180deg, #2a3a45 0%, #1a2530 100%)'
              : armed
                ? 'linear-gradient(180deg, #d8ff4d 0%, #9fd71b 100%)'
                : 'linear-gradient(180deg, #2a2f33 0%, #1a1d20 100%)',
            color: didShoot ? '#7ad6ff' : armed ? '#0d1011' : '#5a6168',
            boxShadow: armed && !didShoot
              ? '0 8px 24px rgba(200,255,61,0.35), inset 0 -3px 0 rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.5)'
              : '0 4px 12px rgba(0,0,0,0.35), inset 0 -2px 0 rgba(0,0,0,0.2)',
            cursor: armed || didShoot ? 'pointer' : 'not-allowed',
            pointerEvents: 'auto',
            transition: 'transform 80ms ease',
            transform: firing ? 'scale(0.98)' : 'scale(1)',
          }}
        >
          {firing ? '· · ·' : didShoot ? 'Next shot' : `Send it  •  ${distance}y`}
        </button>
      )}

      {/* Distance + status mini panel */}
      <div style={{
        background: 'rgba(13,16,17,0.85)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 12, padding: '8px 10px 9px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60,
        pointerEvents: 'auto',
      }}>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.14em', color: '#8b969e' }}>SHOT</div>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 26, fontWeight: 800, color: '#c8ff3d', lineHeight: 1 }}>{distance}</div>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#8b969e' }}>yards</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Result banner
// ─────────────────────────────────────────────────────────────
const RESULT_COPY = {
  green:   { label: 'On the green',  sub: 'Solid contact',   color: '#c8ff3d' },
  fairway: { label: 'Fairway',       sub: 'In play',         color: '#a9e36a' },
  rough:   { label: 'In the rough',  sub: 'Tough lie',       color: '#e6cc5a' },
  bunker:  { label: 'In the sand',   sub: 'Splash shot up',  color: '#f2d076' },
  water:   { label: 'Splash!',       sub: '+1 penalty',      color: '#7ad6ff' },
  ob:      { label: 'Out of bounds', sub: '+1 penalty',      color: '#ff6b6b' },
  hole:    { label: 'HOLE IN ONE',   sub: 'Are you kidding', color: '#c8ff3d' },
};
function ResultBanner({ result }) {
  if (!result) return null;
  const meta = RESULT_COPY[result.terrain] || RESULT_COPY.fairway;
  return (
    <div style={{
      position: 'absolute', top: 110, left: '50%', transform: 'translateX(-50%)',
      zIndex: 30, pointerEvents: 'none',
      animation: 'banner-in 380ms cubic-bezier(0.3,1.4,0.5,1)',
    }}>
      <div style={{
        background: 'rgba(13,16,17,0.92)',
        border: `1px solid ${meta.color}55`,
        borderRadius: 12, padding: '10px 18px',
        textAlign: 'center', minWidth: 200,
      }}>
        <div style={{
          fontFamily: 'Barlow Condensed', fontSize: 22, fontWeight: 800,
          letterSpacing: '0.06em', color: meta.color, lineHeight: 1.05,
        }}>{meta.label}</div>
        <div style={{
          fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.12em',
          color: '#8b969e', marginTop: 3, textTransform: 'uppercase',
        }}>{meta.sub}{result.toHole != null ? ` · ${result.toHole}y to pin` : ''}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Drop target — Instagram Stories style circular button
// ─────────────────────────────────────────────────────────────
function DropTarget({ active, side, color, label, icon, btnRef, topPx }) {
  const baseStyle = {
    position: 'absolute',
    top: topPx,
    [side]: 14,
    transform: 'translateY(-50%)',
    zIndex: 19,
    pointerEvents: 'none',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
  };
  const ringStyle = {
    width: 48, height: 48, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: active ? color : 'rgba(13,16,17,0.78)',
    border: `1.5px solid ${active ? color : 'rgba(255,255,255,0.45)'}`,
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    boxShadow: active
      ? `0 6px 22px ${color}88, 0 0 0 8px ${color}22`
      : '0 4px 14px rgba(0,0,0,0.45)',
  };
  const iconColor = active ? '#0d1011' : '#fff';
  return (
    <div ref={btnRef} style={baseStyle}>
      <div style={{
        ...ringStyle,
        transform: `scale(${active ? 1.18 : 1})`,
        transition: 'transform 140ms cubic-bezier(0.3,1.4,0.5,1), background 140ms ease, box-shadow 140ms ease, border-color 140ms ease',
      }}>
        {icon === 'cancel' ? (
          <svg width="20" height="20" viewBox="0 0 22 22">
            <path d="M5 5 L17 17 M17 5 L5 17" stroke={iconColor} strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 22 22">
            <circle cx="11" cy="11" r="8.5" fill="none" stroke={iconColor} strokeWidth="1.6" />
            <circle cx="11" cy="11" r="4.5" fill="none" stroke={iconColor} strokeWidth="1.6" />
            <path d="M11 1.5 L11 4.5 M11 17.5 L11 20.5 M1.5 11 L4.5 11 M17.5 11 L20.5 11"
              stroke={iconColor} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div style={{
        fontFamily: 'JetBrains Mono', fontSize: 8.5, letterSpacing: '0.14em',
        color: active ? color : 'rgba(255,255,255,0.7)',
        textTransform: 'uppercase',
        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
        whiteSpace: 'nowrap',
        transition: 'color 140ms ease',
      }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main app
// ─────────────────────────────────────────────────────────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showWindCurve": false,
  "windSpeed": 9,
  "windAngle": 235,
  "snap": false,
  "accent": "#c8ff3d",
  "longPressZoom": true,
  "breathEnabled": false,
  "zoomFactor": 2.2,
  "breathSeconds": 2.6,
  "scopeSensitivity": 0.35,
  "scopeExit": "split-bottom",
  "fireMode": "release"
}/*EDITMODE-END*/;

// ─────────────────────────────────────────────────────────────
// Loadout data (cosmetic only — doesn't affect physics)
// ─────────────────────────────────────────────────────────────
const CLUB_OPTIONS = [
  { name: 'Starter Iron',  tag: 'Lv 1', power: 2, accuracy: 3, spin: 2, hue: '#9ab0bc' },
  { name: 'Tour Iron',     tag: 'Lv 3', power: 3, accuracy: 4, spin: 3, hue: '#c8ff3d' },
  { name: 'Carbon Driver', tag: 'Lv 4', power: 5, accuracy: 2, spin: 1, hue: '#2a2e33' },
  { name: 'Apex Hybrid',   tag: 'Lv 3', power: 4, accuracy: 4, spin: 2, hue: '#7ad6ff' },
  { name: 'Sand Wedge',    tag: 'Lv 2', power: 1, accuracy: 5, spin: 4, hue: '#e6cc5a' },
  { name: 'Tour Putter',   tag: 'Lv 5', power: 1, accuracy: 5, spin: 1, hue: '#cdd7dd' },
];
const BALL_OPTIONS = [
  { name: 'Pro V1',     tag: 'Default', spin: 3, control: 3, dist: 3, fill: '#ffffff', dot: '#bcd' },
  { name: 'Tour X',     tag: 'Spin+',   spin: 5, control: 4, dist: 2, fill: '#ff9a3d', dot: '#d96b18' },
  { name: 'Velocity',   tag: 'Power',   spin: 1, control: 2, dist: 5, fill: '#7ad6ff', dot: '#2a8fcc' },
  { name: 'Soft Feel',  tag: 'Touch',   spin: 4, control: 5, dist: 2, fill: '#c8ff3d', dot: '#7cb324' },
  { name: 'Range',      tag: 'Practice',spin: 2, control: 2, dist: 3, fill: '#ffeb3b', dot: '#c9a900' },
  { name: 'Tour Speed', tag: 'Hybrid',  spin: 3, control: 3, dist: 4, fill: '#ff6b9d', dot: '#a83962' },
];

// Small icon used inside loadout cards.
function ClubGlyph({ hue }) {
  return (
    <svg width="44" height="44" viewBox="-22 -22 44 44">
      <defs>
        <linearGradient id={`cg-${hue}`} x1="0" y1="-12" x2="0" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={hue} stopOpacity="1" />
          <stop offset="1" stopColor="#0d1011" stopOpacity="1" />
        </linearGradient>
      </defs>
      <line x1="6" y1="-18" x2="-6" y2="10" stroke="#cdd7dd" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M -14 9 Q -10 18 0 16 Q 12 14 14 6 Q 12 4 4 5 Q -10 7 -14 9 Z"
        fill={`url(#cg-${hue})`} stroke="#1a1f23" strokeWidth="1" strokeLinejoin="round" />
      <line x1="-9" y1="10" x2="-2" y2="7" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.8" />
      <line x1="-5" y1="11.5" x2="2" y2="8" stroke="#fff" strokeOpacity="0.25" strokeWidth="0.8" />
    </svg>
  );
}
function BallGlyph({ fill, dot }) {
  return (
    <svg width="44" height="44" viewBox="-22 -22 44 44">
      <circle cx="1" cy="3" r="15" fill="#000" opacity="0.22" />
      <circle r="15" fill={fill} stroke={dot} strokeWidth="0.8" />
      <ellipse cx="-4.5" cy="-5" rx="6" ry="3.5" fill="#fff" opacity="0.5" />
      {[[-4,-2],[3,-3],[-1,2],[5,3],[-5,5],[2,6]].map(([dx,dy],i) => (
        <circle key={i} cx={dx} cy={dy} r="0.9" fill={dot} opacity="0.55" />
      ))}
    </svg>
  );
}
function StatRow({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, letterSpacing: '0.14em',
        color: '#8b969e', textTransform: 'uppercase', width: 38 }}>{label}</div>
      <div style={{ flex: 1, display: 'flex', gap: 2 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 1.5,
            background: i < value ? accent : 'rgba(255,255,255,0.08)',
          }} />
        ))}
      </div>
    </div>
  );
}

function GolfApp() {
  const t0 = useTweaks(TWEAK_DEFAULTS);
  const t = t0[0], setTweak = t0[1];

  const [loadoutOpen, setLoadoutOpen] = useState(false);
  const [loadoutTab, setLoadoutTab] = useState('clubs');
  const [equippedClub, setEquippedClub] = useState(1);
  const [equippedBall, setEquippedBall] = useState(0);

  const [ball, setBall] = useState({ ...TEE });
  const [target, setTarget] = useState({ x: 175, y: 380 }); // mid-fairway default
  const [dragging, setDragging] = useState(false);
  const [firing, setFiring] = useState(false);
  const [ballAnim, setBallAnim] = useState(null); // {t, ax, ay, bx, by, curve, scale}
  const [result, setResult] = useState(null);
  const svgRef = useRef(null);

  // ── long-press zoom ("hold breath") ──
  const [zoomT, setZoomT] = useState(0);            // 0 = wide, 1 = full scope zoom
  const [breathLeft, setBreathLeft] = useState(1);  // 1 → 0 while held
  const holdTimerRef = useRef(null);
  const zoomRafRef = useRef(null);
  const breathRafRef = useRef(null);
  const downPosRef = useRef(null);
  const zoomedRef = useRef(false);
  const scopeAimRef = useRef(null); // { lockedTarget: {x,y}, lockedClient: {sx,sy} } while scoped
  const scopeCamRef = useRef(null); // { cx, cy } camera center locked at moment of zoom enter
  const moveHistoryRef = useRef([]); // [{ t, x, y }] last ~120ms for velocity break-out
  const fireBlockedUntilRef = useRef(0); // ms timestamp before which release-to-fire is suppressed
  const unscopeBtnRef = useRef(null);
  const cancelBtnRef = useRef(null);

  // Exit zone the finger is currently in (drives visual + release behavior)
  // 'none' | 'cancel' (scrap shot) | 'unscope' (bail aim, don't fire)
  const [exitZone, setExitZone] = useState('none');

  const cancelHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };
  const animateZoom = (to) => {
    if (zoomRafRef.current) cancelAnimationFrame(zoomRafRef.current);
    const start = performance.now();
    const from = zoomT;
    const dur = 240;
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - k, 2.2);
      setZoomT(from + (to - from) * e);
      if (k < 1) zoomRafRef.current = requestAnimationFrame(step);
    };
    zoomRafRef.current = requestAnimationFrame(step);
  };
  const [wobbleTick, setWobbleTick] = useState(0);
  const startBreathDrain = () => {
    if (breathRafRef.current) cancelAnimationFrame(breathRafRef.current);
    const start = performance.now();
    const dur = t.breathSeconds * 1000;
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      setBreathLeft(1 - k);
      // Keep ticking after breath depletes to drive wobble animation
      if (zoomedRef.current) {
        if (k >= 1) setWobbleTick(now);
        breathRafRef.current = requestAnimationFrame(step);
      }
    };
    breathRafRef.current = requestAnimationFrame(step);
  };
  const exitZoom = () => {
    cancelHoldTimer();
    zoomedRef.current = false;
    scopeAimRef.current = null;
    scopeCamRef.current = null;
    if (breathRafRef.current) cancelAnimationFrame(breathRafRef.current);
    setBreathLeft(1);
    animateZoom(0);
  };
  const triggerZoom = () => {
    if (zoomedRef.current) return;
    zoomedRef.current = true;
    setBreathLeft(1);
    animateZoom(1);
    if (t.breathEnabled) startBreathDrain();
    // Lock the camera center at the moment of zoom — viewBox stays fixed while scoped;
    // only the target/crosshair moves inside it.
    scopeCamRef.current = { cx: target.x, cy: target.y };
    if (downPosRef.current) {
      scopeAimRef.current = {
        lockedTarget: { x: target.x, y: target.y },
        lockedClient: { sx: downPosRef.current.lx, sy: downPosRef.current.ly },
      };
    }
  };

  const wind = { speed: t.windSpeed, angle: t.windAngle };

  // ───── Pointer / drag ─────
  const screenToSvg = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const clampToScene = (x, y) => ({
    x: Math.max(20, Math.min(HOLE_W - 20, x)),
    y: Math.max(60, Math.min(
      t.fireMode === 'release' ? HOLE_H - 4 : ball.y - 30,
      y
    )),
  });

  // Compute finger zone from clientX/Y relative to SVG rect (mode-aware)
  const computeZone = (clientX, clientY) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return 'none';
    const y01 = (clientY - rect.top) / rect.height;
    const mode = t.scopeExit;
    if (mode === 'edge-top' && zoomedRef.current && y01 < 0.07) return 'unscope';
    if (mode === 'split-bottom') {
      // Hit-test against actual rendered button bounds.
      const hitRing = (ref) => {
        if (!ref.current) return false;
        const ring = ref.current.children[0] || ref.current;
        const r = ring.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        return Math.hypot(clientX - cx, clientY - cy) < Math.max(r.width, r.height) / 2 + 14;
      };
      if (hitRing(cancelBtnRef)) return 'cancel';
      return 'none';
    }
    if (y01 > 0.945) return 'cancel'; // default bottom cancel for velocity / edge-top
    return 'none';
  };

  const onPointerDown = (e) => {
    if (firing || ballAnim) return;
    if (result) { reset(); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    // No-snap: don't move target on tap. Lock current target + finger pos so subsequent
    // moves are relative deltas (sensitivity differs by wide vs scoped).
    scopeAimRef.current = {
      lockedTarget: { x: target.x, y: target.y },
      lockedClient: { sx: e.clientX, sy: e.clientY },
    };
    downPosRef.current = { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY };
    moveHistoryRef.current = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
    fireBlockedUntilRef.current = 0;
    setExitZone(computeZone(e.clientX, e.clientY));
    // Schedule long-press zoom (settle-to-zoom: timer fires once finger is still for ~220ms)
    if (t.longPressZoom) {
      cancelHoldTimer();
      holdTimerRef.current = setTimeout(triggerZoom, 220);
    }
  };

  const onPointerMove = (e) => {
    if (!dragging || !scopeAimRef.current) return;
    const { lockedTarget, lockedClient } = scopeAimRef.current;
    const dxClient = e.clientX - lockedClient.sx;
    const dyClient = e.clientY - lockedClient.sy;
    const svgPerScreenPx = (HOLE_W / zoomScale) / (svgRef.current?.clientWidth || HOLE_W);
    const k = zoomedRef.current ? t.scopeSensitivity : 1.0;
    let p = clampToScene(
      lockedTarget.x + dxClient * svgPerScreenPx * k,
      lockedTarget.y + dyClient * svgPerScreenPx * k
    );
    if (t.snap) {
      const d = Math.hypot(p.x - PIN.x, p.y - PIN.y);
      if (d < 18) p = { x: PIN.x, y: PIN.y };
    }
    setTarget(p);

    // Track recent movement for velocity break-out.
    const now = performance.now();
    moveHistoryRef.current.push({ t: now, x: e.clientX, y: e.clientY });
    while (moveHistoryRef.current.length && moveHistoryRef.current[0].t < now - 120) {
      moveHistoryRef.current.shift();
    }
    if (zoomedRef.current && t.scopeExit === 'velocity' && moveHistoryRef.current.length >= 2) {
      const a = moveHistoryRef.current[0];
      const b = moveHistoryRef.current[moveHistoryRef.current.length - 1];
      const dt = (b.t - a.t) || 1;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const speed = dist / dt * 1000;
      if (speed > 900) {
        exitZoom();
        fireBlockedUntilRef.current = now + 220;
      }
    }
    setExitZone(computeZone(e.clientX, e.clientY));

    // Settle-to-zoom: every meaningful move resets timer; zoom kicks in once finger is still.
    if (t.longPressZoom && !zoomedRef.current && downPosRef.current) {
      const dx = e.clientX - downPosRef.current.lx;
      const dy = e.clientY - downPosRef.current.ly;
      if (Math.hypot(dx, dy) > 3) {
        downPosRef.current.lx = e.clientX;
        downPosRef.current.ly = e.clientY;
        cancelHoldTimer();
        holdTimerRef.current = setTimeout(triggerZoom, 220);
      }
    }
  };

  const onPointerUp = (e) => {
    const wasDragging = dragging;
    const wasScoped = zoomedRef.current;
    setDragging(false);
    const zoneAtRelease = computeZone(e.clientX, e.clientY);
    setExitZone('none');
    exitZoom();
    if (!wasDragging) return;
    if (t.fireMode !== 'release') return;
    if (performance.now() < fireBlockedUntilRef.current) return;
    if (zoneAtRelease !== 'none') return;
    // No scope = no shot. Release without scoping just cancels the aim.
    if (!wasScoped) return;
    fire();
  };

  // ───── Distance / club ─────
  const dxBT = target.x - ball.x;
  const dyBT = target.y - ball.y;
  const distance = yards(dxBT, dyBT);
  const club = clubFor(distance);

  // Release-mode exit-zone visibility booleans
  const aborting = exitZone === 'cancel';
  const unscoping = exitZone === 'unscope';

  // ───── Wind effect ─────
  // Wind angle is the direction wind BLOWS TOWARD (matches the arrow on the HUD).
  // Higher loft (longer clubs) → more drift.
  const windRad = wind.angle * Math.PI / 180;
  const windDx = Math.sin(windRad);
  const windDy = -Math.cos(windRad);
  const clubLoftFactor = Math.min(1.3, distance / 200);
  const driftMag = wind.speed * 0.85 * clubLoftFactor; // px
  const windOffX = windDx * driftMag;
  const windOffY = windDy * driftMag;

  // Predicted landing (wind-adjusted) for preview
  const predicted = { x: target.x + windOffX, y: target.y + windOffY };

  // Dispersion size grows with distance, reduced by short clubs.
  // Long-press scope zoom tightens it; if you held too long (breath ran out), it explodes.
  const aimBonus = zoomT > 0.6 && breathLeft > 0 ? 0.55 : 1; // scoped + holding = tighter
  const breathPenalty = (zoomT > 0.6 && breathLeft <= 0) ? 1.9 : 1; // wobble = worse
  const dispW = (12 + distance * 0.10) * aimBonus * breathPenalty;
  const dispH = (8  + distance * 0.06) * aimBonus * breathPenalty;

  // ───── Fire ─────
  const fire = () => {
    if (firing || ballAnim) return;
    setFiring(true);
    // Skill-shot: scoped + breath still has air = exact landing on wind-adjusted aim.
    const perfectShot = zoomedRef.current && breathLeft > 0;
    let land;
    if (perfectShot) {
      land = { x: predicted.x, y: predicted.y };
    } else {
      // Center-biased random sample inside dispersion oval (r² → most shots near center).
      const rng = mulberry32(Math.floor(performance.now()));
      const ang = rng() * Math.PI * 2;
      const u = rng();
      const r = u * u; // strong center bias
      land = {
        x: predicted.x + Math.cos(ang) * dispW * r,
        y: predicted.y + Math.sin(ang) * dispH * r,
      };
    }
    // Curve perpendicular to flight (visualize wind curve)
    const flightLen = Math.hypot(land.x - ball.x, land.y - ball.y);
    const curve = t.showWindCurve
      ? -driftMag * 1.4 * Math.sign(windDx) * Math.min(1, flightLen / 300)
      : 0;
    setBallAnim({
      ax: ball.x, ay: ball.y, bx: land.x, by: land.y, curve,
      start: performance.now(), dur: Math.max(900, flightLen * 2.2),
    });
  };

  // Animate ball
  useEffect(() => {
    if (!ballAnim) return;
    let raf;
    const tick = (now) => {
      const k = Math.min(1, (now - ballAnim.start) / ballAnim.dur);
      const e = 1 - Math.pow(1 - k, 2.2); // ease-out
      // Quadratic bezier with one control for curve
      const mx = (ballAnim.ax + ballAnim.bx) / 2;
      const my = (ballAnim.ay + ballAnim.by) / 2;
      const dx = ballAnim.bx - ballAnim.ax, dy = ballAnim.by - ballAnim.ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const cx = mx + nx * ballAnim.curve;
      const cy = my + ny * ballAnim.curve;
      const px = (1 - e) * (1 - e) * ballAnim.ax + 2 * (1 - e) * e * cx + e * e * ballAnim.bx;
      const py = (1 - e) * (1 - e) * ballAnim.ay + 2 * (1 - e) * e * cy + e * e * ballAnim.by;
      setBall({ x: px, y: py });
      if (k < 1) raf = requestAnimationFrame(tick);
      else {
        // Resolve outcome
        const land = { x: ballAnim.bx, y: ballAnim.by };
        let terrain = terrainAt(land.x, land.y);
        // hole-in detection
        if (Math.hypot(land.x - PIN.x, land.y - PIN.y) < 4) terrain = 'hole';
        const toHole = yards(land.x - PIN.x, land.y - PIN.y);
        setResult({ terrain, toHole });
        setFiring(false);
        setBallAnim(null);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ballAnim]);

  // ───── Reset ─────
  const reset = () => {
    setBall({ ...TEE });
    setTarget({ x: 175, y: 380 });
    setResult(null);
    setFiring(false);
    setBallAnim(null);
  };

  const armed = !firing && !ballAnim && !result;
  const accent = t.accent;
  const ydsToPin = yards(PIN.x - ball.x, PIN.y - ball.y);

  // ── Computed viewBox for zoom ──
  // At zoomT=0 → full hole. At zoomT=1 → centered on target, zoomed by zoomFactor.
  const zoomScale = 1 + (t.zoomFactor - 1) * zoomT;
  const vbW = HOLE_W / zoomScale;
  const vbH = HOLE_H / zoomScale;
  // Center on the locked camera position if we have one (scoped), otherwise the current target.
  // No vertical offset — the scope reticle sits in the center of the visible scope chrome.
  const camCenter = scopeCamRef.current || { cx: target.x, cy: target.y };
  let vbX = camCenter.cx - vbW / 2;
  let vbY = camCenter.cy - vbH / 2;
  vbX = Math.max(0, Math.min(HOLE_W - vbW, vbX));
  vbY = Math.max(0, Math.min(HOLE_H - vbH, vbY));
  // Blend with full-scene view based on zoomT
  vbX = (1 - zoomT) * 0 + zoomT * vbX;
  vbY = (1 - zoomT) * 0 + zoomT * vbY;
  const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`;

  // Target wobble when breath runs out
  const wobble = zoomT > 0.6 && breathLeft <= 0
    ? { x: Math.sin(performance.now() / 90) * 2.2, y: Math.cos(performance.now() / 75) * 1.6 }
    : { x: 0, y: 0 };
  const aimX = target.x + wobble.x;
  const aimY = target.y + wobble.y;

  // Apex scale: ball bigger mid-flight to suggest height
  const ballScale = ballAnim
    ? 1 + 1.5 * Math.sin(Math.PI * Math.min(1, (performance.now() - ballAnim.start) / ballAnim.dur))
    : 1;

  return (
    <>
      <style>{`
        @keyframes banner-in {
          0% { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(0.92); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @keyframes pulse {
          0%,100% { opacity: 0.7; } 50% { opacity: 1; }
        }
      `}</style>
      <IOSDevice width={402} height={874} dark>
        <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0d0e' }}>
          {/* Scene */}
          <div style={{ position: 'absolute', inset: 0 }}>
            <HoleScene
              svgRef={svgRef}
              viewBox={viewBox}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {/* Trajectory preview */}
              {armed && (
                <>
                  <path
                    d={buildArcPath(
                      ball.x, ball.y,
                      t.showWindCurve ? predicted.x : target.x,
                      t.showWindCurve ? predicted.y : target.y,
                      t.showWindCurve ? -driftMag * 1.4 * Math.sign(windDx) : 0
                    )}
                    fill="none" stroke={accent} strokeWidth="1.5"
                    strokeOpacity="0.55" strokeDasharray="4 4"
                  />
                  {/* Wind-adjusted landing dot (separate from target) */}
                  {t.showWindCurve && (Math.abs(windOffX) > 1 || Math.abs(windOffY) > 1) && (
                    <g>
                      <line x1={target.x} y1={target.y} x2={predicted.x} y2={predicted.y}
                        stroke="#7ad6ff" strokeWidth="0.8" strokeDasharray="2 2" strokeOpacity="0.7" />
                      <circle cx={predicted.x} cy={predicted.y} r="2.5" fill="#7ad6ff" />
                    </g>
                  )}
                </>
              )}

              {/* Aim target — 3-zone bullseye + wind arrow */}
              {armed && (
                <TargetReticle
                  x={aimX} y={aimY}
                  dragging={dragging}
                  scoped={zoomT > 0.6 && breathLeft > 0}
                  aborting={aborting}
                  windAngle={wind.angle}
                />
              )}

              {/* Breath ring while zoomed */}
              {t.breathEnabled && zoomT > 0.05 && armed && (
                <g transform={`translate(${aimX},${aimY})`} pointerEvents="none" opacity={zoomT}>
                  <circle r="34" fill="none"
                    stroke={aborting ? '#ff6b6b' : (breathLeft > 0.25 ? accent : '#ff6b6b')}
                    strokeWidth="1.4" strokeOpacity="0.55"
                    strokeDasharray={`${breathLeft * 213.6} 213.6`}
                    transform="rotate(-90)" strokeLinecap="round" />
                  <circle r="34" fill="none" stroke={aborting ? '#ff6b6b' : accent}
                    strokeOpacity="0.12" strokeWidth="1.4" />
                </g>
              )}

              {/* Distance label near reticle */}
              {armed && (
                <g transform={`translate(${aimX + 32}, ${aimY - 28})`} pointerEvents="none">
                  <rect x="-2" y="-12" width="54" height="22" rx="4"
                    fill="rgba(13,16,17,0.85)"
                    stroke={aborting ? '#ff6b6b' : accent} strokeWidth="0.6" strokeOpacity="0.5" />
                  <text x="25" y="3" textAnchor="middle"
                    fontFamily="Barlow Condensed" fontSize="14" fontWeight="700"
                    fill={aborting ? '#ff6b6b' : accent}>
                    {distance}y
                  </text>
                </g>
              )}

              {/* Ball */}
              <g>
                <circle cx={ball.x} cy={ball.y + 1.5} r={4 * ballScale} fill="#000" opacity="0.35" />
                <circle cx={ball.x} cy={ball.y} r={4 * ballScale} fill="#fff" stroke="#bcd" strokeWidth="0.4" />
                {ballScale > 1.1 && (
                  <circle cx={ball.x - 1} cy={ball.y - 1} r={1.2 * ballScale} fill="#fff" opacity="0.7" />
                )}
              </g>
            </HoleScene>
          </div>

          {/* Scope vignette overlay while zoomed */}
          {zoomT > 0.02 && (
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 17,
              opacity: zoomT,
              background:
                'radial-gradient(circle at 50% 48%, transparent 38%, rgba(0,0,0,0.35) 62%, rgba(0,0,0,0.85) 100%)',
            }}>
              {/* scope chrome ring */}
              <div style={{
                position: 'absolute', left: '50%', top: '48%', transform: 'translate(-50%,-50%)',
                width: 360, height: 360, borderRadius: '50%',
                border: '1px solid rgba(200,255,61,0.18)',
                boxShadow: 'inset 0 0 60px rgba(0,0,0,0.55)',
              }} />
              {/* tick markers */}
              {[0, 90, 180, 270].map(deg => (
                <div key={deg} style={{
                  position: 'absolute', left: '50%', top: '48%',
                  width: 2, height: 12, background: 'rgba(200,255,61,0.4)',
                  transformOrigin: '50% 178px',
                  transform: `translate(-50%,-178px) rotate(${deg}deg)`,
                }} />
              ))}
              {/* HOLD readout */}
              {t.breathEnabled && (
              <div style={{
                position: 'absolute', left: '50%', top: 'calc(48% + 130px)', transform: 'translateX(-50%)',
                fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.2em',
                color: breathLeft > 0.25 ? '#c8ff3d' : '#ff6b6b', opacity: 0.85,
              }}>
                {breathLeft > 0 ? `HOLD ${(breathLeft * t.breathSeconds).toFixed(1)}s` : 'EXHALE — wobble'}
              </div>
              )}
            </div>
          )}

          {/* HUD */}
          <HudTop hole={7} par={4} ydsToPin={ydsToPin} wind={wind} />
          <ResultBanner result={result} />
          <HudBottom
            club={club}
            distance={distance}
            armed={armed}
            firing={firing}
            didShoot={!!result}
            onFire={fire}
            onReset={reset}
            fireMode={t.fireMode}
            dragging={dragging}
            exitZone={exitZone}
            scoped={zoomT > 0.4}
          />

          {/* Bottom cancel strip — NOT shown in split-bottom mode (uses side buttons instead) */}
          {t.fireMode === 'release' && dragging && t.scopeExit !== 'split-bottom' && (
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              height: 56, zIndex: 18, pointerEvents: 'none',
              background: aborting
                ? 'linear-gradient(0deg, rgba(255,60,60,0.42) 0%, rgba(255,60,60,0) 100%)'
                : 'linear-gradient(0deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 100%)',
              borderTop: aborting ? '1px dashed rgba(255,107,107,0.7)' : '1px dashed rgba(255,255,255,0.18)',
              transition: 'background 140ms ease, border-color 140ms ease',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 8,
            }}>
              <span style={{
                fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.16em',
                color: aborting ? '#ff9090' : '#5a6168', textTransform: 'uppercase',
              }}>{aborting ? '↓ Release to cancel' : 'cancel zone'}</span>
            </div>
          )}

          {/* Split-bottom side button — Cancel drop target on the LEFT.
              Only visible while scoped (no-scope release already cancels). */}
          {t.fireMode === 'release' && dragging && t.scopeExit === 'split-bottom' && zoomT > 0.4 && (() => {
            let aimTopPx;
            if (scopeCamRef.current) {
              const anchorY = scopeCamRef.current.cy;
              const anchorYPct = (anchorY - vbY) / vbH;
              aimTopPx = Math.max(80, Math.min(720, anchorYPct * 874));
            } else {
              aimTopPx = 437;
            }
            return (
              <DropTarget
                btnRef={cancelBtnRef}
                active={aborting}
                side="left"
                color="#ff6b6b"
                label="Cancel"
                icon="cancel"
                topPx={aimTopPx}
              />
            );
          })()}

          {/* Edge-top scope-release strip (only in edge-top mode while zoomed) */}
          {t.fireMode === 'release' && dragging && t.scopeExit === 'edge-top' && zoomT > 0.4 && (
            <div style={{
              position: 'absolute', left: 0, right: 0, top: 0,
              height: 60, zIndex: 18, pointerEvents: 'none',
              background: unscoping
                ? 'linear-gradient(180deg, rgba(122,214,255,0.42) 0%, rgba(122,214,255,0) 100%)'
                : 'linear-gradient(180deg, rgba(122,214,255,0.08) 0%, rgba(122,214,255,0) 100%)',
              borderBottom: unscoping ? '1px dashed rgba(122,214,255,0.7)' : '1px dashed rgba(122,214,255,0.18)',
              transition: 'background 140ms ease, border-color 140ms ease',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 50,
            }}>
              <span style={{
                fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.16em',
                color: unscoping ? '#bce6ff' : '#7a8a92', textTransform: 'uppercase',
              }}>{unscoping ? '↑ Release to unscope' : 'unscope zone'}</span>
            </div>
          )}

          {/* Velocity mode: brief unscoped-grace badge */}
          {t.scopeExit === 'velocity' && dragging && !zoomedRef.current && performance.now() < fireBlockedUntilRef.current && (
            <div style={{
              position: 'absolute', top: 96, left: '50%', transform: 'translateX(-50%)',
              fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.18em',
              color: '#7ad6ff', textTransform: 'uppercase', pointerEvents: 'none', zIndex: 22,
              background: 'rgba(13,16,17,0.85)', padding: '5px 10px', borderRadius: 4,
              border: '1px solid rgba(122,214,255,0.4)',
            }}>↩ Unscoped — settle to re-zoom</div>
          )}

          {/* Loadout button — floating bottom-right, above the SHOT panel */}
          <button
            onClick={() => setLoadoutOpen(true)}
            style={{
              position: 'absolute', right: 14, bottom: 118,
              width: 44, height: 44, borderRadius: 12,
              background: 'rgba(13,16,17,0.88)',
              border: '1px solid rgba(200,255,61,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', zIndex: 24,
              boxShadow: '0 4px 14px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
              padding: 0,
            }}
            aria-label="Loadout"
          >
            <svg width="22" height="22" viewBox="-12 -12 24 24" fill="none">
              {/* Stylized golf bag */}
              <rect x="-7" y="-4" width="14" height="15" rx="3"
                stroke="#c8ff3d" strokeWidth="1.4" />
              <line x1="-7" y1="1" x2="7" y2="1" stroke="#c8ff3d" strokeOpacity="0.55" strokeWidth="1" />
              {/* Clubs sticking out */}
              <line x1="-3" y1="-4" x2="-4" y2="-11" stroke="#c8ff3d" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="0"  y1="-4" x2="0"  y2="-11" stroke="#c8ff3d" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="3"  y1="-4" x2="4"  y2="-11" stroke="#c8ff3d" strokeWidth="1.2" strokeLinecap="round" />
              <circle cx="-4" cy="-11" r="1.4" fill="#c8ff3d" />
              <circle cx="0"  cy="-11" r="1.4" fill="#c8ff3d" />
              <circle cx="4"  cy="-11" r="1.4" fill="#c8ff3d" />
            </svg>
          </button>

          {/* Loadout modal — fake equipment screen */}
          {loadoutOpen && (
            <div
              onClick={() => setLoadoutOpen(false)}
              style={{
                position: 'absolute', inset: 0, zIndex: 60,
                background: 'rgba(2,5,7,0.72)',
                backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '34px 14px 24px',
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%', maxHeight: '100%',
                  display: 'flex', flexDirection: 'column', gap: 12,
                  background: 'linear-gradient(180deg, #1a2025 0%, #0d1314 100%)',
                  border: '1px solid rgba(200,255,61,0.22)',
                  borderRadius: 16, padding: '14px 14px 16px',
                  boxShadow: '0 24px 50px rgba(0,0,0,0.6)',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.2em',
                      color: '#8b969e', textTransform: 'uppercase' }}>Loadout</div>
                    <div style={{ fontFamily: 'Barlow Condensed', fontSize: 22, fontWeight: 800,
                      color: '#fff', letterSpacing: '0.04em', lineHeight: 1 }}>Equipment</div>
                  </div>
                  <button
                    onClick={() => setLoadoutOpen(false)}
                    style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#fff', cursor: 'pointer', padding: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    aria-label="Close"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <path d="M2 2 L10 10 M10 2 L2 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                {/* Equipped summary strip */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                }}>
                  {[
                    { label: 'CLUB', item: CLUB_OPTIONS[equippedClub], kind: 'club' },
                    { label: 'BALL', item: BALL_OPTIONS[equippedBall], kind: 'ball' },
                  ].map(({ label, item, kind }) => (
                    <div key={label} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
                    }}>
                      {kind === 'club'
                        ? <ClubGlyph hue={item.hue} />
                        : <BallGlyph fill={item.fill} dot={item.dot} />}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8,
                          letterSpacing: '0.14em', color: '#8b969e' }}>{label}</div>
                        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700,
                          fontSize: 14, color: '#fff', lineHeight: 1.05,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.name}
                        </div>
                        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8,
                          color: '#c8ff3d', letterSpacing: '0.12em' }}>{item.tag}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4,
                  background: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: 3 }}>
                  {[
                    { k: 'clubs', label: 'Clubs' },
                    { k: 'balls', label: 'Balls' },
                  ].map(tab => {
                    const active = loadoutTab === tab.k;
                    return (
                      <button key={tab.k}
                        onClick={() => setLoadoutTab(tab.k)}
                        style={{
                          flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
                          background: active ? 'rgba(200,255,61,0.15)' : 'transparent',
                          borderRadius: 7,
                          color: active ? '#c8ff3d' : '#8b969e',
                          fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 14,
                          letterSpacing: '0.16em', textTransform: 'uppercase',
                        }}
                      >{tab.label}</button>
                    );
                  })}
                </div>

                {/* Grid */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                  overflowY: 'auto', paddingRight: 2, maxHeight: 360,
                }}>
                  {(loadoutTab === 'clubs' ? CLUB_OPTIONS : BALL_OPTIONS).map((item, i) => {
                    const isClub = loadoutTab === 'clubs';
                    const selected = isClub ? equippedClub === i : equippedBall === i;
                    return (
                      <button key={i}
                        onClick={() => isClub ? setEquippedClub(i) : setEquippedBall(i)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center',
                          gap: 5, padding: '10px 8px 9px',
                          background: selected
                            ? 'linear-gradient(180deg, rgba(200,255,61,0.16) 0%, rgba(200,255,61,0.04) 100%)'
                            : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${selected ? 'rgba(200,255,61,0.65)' : 'rgba(255,255,255,0.1)'}`,
                          borderRadius: 10, cursor: 'pointer',
                          boxShadow: selected
                            ? '0 4px 12px rgba(200,255,61,0.18), inset 0 0 14px rgba(200,255,61,0.06)'
                            : 'none',
                          transition: 'background 120ms, border-color 120ms, box-shadow 120ms',
                        }}
                      >
                        {isClub
                          ? <ClubGlyph hue={item.hue} />
                          : <BallGlyph fill={item.fill} dot={item.dot} />}
                        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700,
                          fontSize: 14, color: '#fff', lineHeight: 1 }}>{item.name}</div>
                        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8,
                          color: selected ? '#c8ff3d' : '#8b969e', letterSpacing: '0.12em',
                          textTransform: 'uppercase' }}>{item.tag}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3,
                          width: '100%', marginTop: 3 }}>
                          {isClub ? (
                            <>
                              <StatRow label="PWR" value={item.power} accent={selected ? '#c8ff3d' : '#5a6168'} />
                              <StatRow label="ACC" value={item.accuracy} accent={selected ? '#c8ff3d' : '#5a6168'} />
                              <StatRow label="SPN" value={item.spin} accent={selected ? '#c8ff3d' : '#5a6168'} />
                            </>
                          ) : (
                            <>
                              <StatRow label="DST" value={item.dist} accent={selected ? '#c8ff3d' : '#5a6168'} />
                              <StatRow label="CTL" value={item.control} accent={selected ? '#c8ff3d' : '#5a6168'} />
                              <StatRow label="SPN" value={item.spin} accent={selected ? '#c8ff3d' : '#5a6168'} />
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* OK button */}
                <button
                  onClick={() => setLoadoutOpen(false)}
                  style={{
                    height: 46, borderRadius: 23, border: 'none',
                    background: 'linear-gradient(180deg, #d8ff4d 0%, #9fd71b 100%)',
                    color: '#0d1011',
                    fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 18,
                    letterSpacing: '0.16em', textTransform: 'uppercase',
                    cursor: 'pointer',
                    boxShadow: '0 8px 20px rgba(200,255,61,0.32), inset 0 -2px 0 rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.5)',
                  }}
                >Equip</button>
              </div>
            </div>
          )}

          {/* Drag hint */}
          {armed && !dragging && (
            <div style={{
              position: 'absolute', bottom: 130, left: '50%', transform: 'translateX(-50%)',
              fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.12em',
              color: '#8b969e', textTransform: 'uppercase',
              background: 'rgba(13,16,17,0.6)', padding: '4px 10px', borderRadius: 4,
              pointerEvents: 'none', zIndex: 19,
            }}>
              {t.fireMode === 'release'
                ? 'Press → hold to scope → release to fire'
                : 'Drag crosshair → tap Send it'}
            </div>
          )}
        </div>
      </IOSDevice>

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Aim">
          <TweakToggle label="Show wind curve"
            value={t.showWindCurve} onChange={v => setTweak('showWindCurve', v)} />
          <TweakToggle label="Snap-to-pin"
            value={t.snap} onChange={v => setTweak('snap', v)} />
        </TweakSection>
        <TweakSection label="Conditions">
          <TweakSlider label="Wind speed" value={t.windSpeed} min={0} max={28} step={1} unit=" mph"
            onChange={v => setTweak('windSpeed', v)} />
          <TweakSlider label="Wind direction" value={t.windAngle} min={0} max={359} step={5} unit="°"
            onChange={v => setTweak('windAngle', v)} />
        </TweakSection>
        <TweakSection label="HUD">
          <TweakColor label="Accent" value={t.accent}
            options={['#c8ff3d', '#ff8c3d', '#7ad6ff', '#ff3b6b', '#ffffff']}
            onChange={v => setTweak('accent', v)} />
        </TweakSection>
        <TweakSection label="Scope (long-press zoom)">
          <TweakToggle label="Scope enabled"
            value={t.longPressZoom} onChange={v => setTweak('longPressZoom', v)} />
          <TweakToggle label="Breath mechanic"
            value={t.breathEnabled} onChange={v => setTweak('breathEnabled', v)} />
          <TweakSlider label="Zoom factor" value={t.zoomFactor}
            min={1.4} max={3.5} step={0.1} unit="x"
            onChange={v => setTweak('zoomFactor', v)} />
          <TweakSlider label="Breath seconds" value={t.breathSeconds}
            min={0} max={5.0} step={0.2} unit="s"
            onChange={v => setTweak('breathSeconds', v)} />
          <TweakSlider label="Scope sensitivity" value={t.scopeSensitivity}
            min={0.1} max={1.0} step={0.05} unit="x"
            onChange={v => setTweak('scopeSensitivity', v)} />
        </TweakSection>
        <TweakSection label="Run">
          <TweakButton label="Reset shot" onClick={reset} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

window.GolfApp = GolfApp;
