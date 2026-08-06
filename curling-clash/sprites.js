// ============================================================
// SPRITES — Layer AI art, loaded with a procedural fallback
//
// Every drawing routine that uses a sprite must still work without it. The
// procedural rendering in rock.js / brushes.js / sheet.js is not scaffolding to
// be deleted — it is the fallback, and it is what keeps the game playable while
// art is being iterated on or if a file 404s.
//
// So: `sprite('rock_body')` returns a ready Image or null, and callers branch.
// Nothing here throws, and nothing blocks the first frame.
// ============================================================

const SPRITE_FILES = {
  rock_body:     'art/rock-body.png',
  handle_yellow: 'art/handle-yellow.png',
  handle_red:    'art/handle-red.png',
  brush_head:    'art/brush.png',
  ice_tile:      'art/ice-tile.png',
  arena:         'art/arena.png',
  logo:          'art/logo.png',
  hero_rock:     'art/hero-rock.png',
  // Only the impact flash is a sprite. The spark chips are 2 px dots — a bitmap
  // buys nothing there and the procedural ones blend additively for free.
  flash:         'art/flash.png',

  // Special-rock art. Bodies carry a type-coloured accent band; the HANDLE still
  // carries the team colour, so the two channels never fight: handle = who threw
  // it, band = what it does.
  rock_offense:  'art/rock-offense.png',
  rock_defense:  'art/rock-defense.png',
  rock_control:  'art/rock-control.png',
};

// The 12-cell effect icon sheet, addressed by grid position. One image keeps it
// to a single request and guarantees the icons share a style.
const EFFECT_ICON_SHEET = 'art/effect-icons.png';
const EFFECT_ICON_COLS = 4;
const EFFECT_ICON_ROWS = 3;
const EFFECT_ICON_INDEX = {
  wall: 0, ricochet: 1, curve: 2, power: 3,
  heavy: 4, speedZone: 5, slowZone: 6, magnet: 7,
  pulse: 8, freeze: 9, fire: 10, basic: 11,
};

const spriteCache = {};
let spritesReady = 0;
let spritesAttempted = 0;

function loadSprites() {
  for (const name in SPRITE_FILES) {
    spritesAttempted++;
    const img = new Image();
    img.onload = () => {
      // A zero-size decode is a broken file; treat it as absent.
      if (img.naturalWidth > 0) {
        spriteCache[name] = img;
        spritesReady++;
        if (name === 'ice_tile') buildIcePattern();
      }
    };
    img.onerror = () => {
      // Expected before the art pass has produced this file. The procedural
      // path covers it, so this is not worth a console error.
      spriteCache[name] = null;
    };
    img.src = SPRITE_FILES[name];
  }
}

function sprite(name) {
  const s = spriteCache[name];
  return s && s.complete && s.naturalWidth > 0 ? s : null;
}

// ---------------------------------------------------------------
// Effect icons
//
// The badges are DOM, not canvas, so the sheet is addressed the CSS way: one
// background-image shared by every badge (the browser fetches and decodes the
// file once) and a per-badge background-position picking the cell.
//
// The obvious alternative — slice each cell into a canvas and hand CSS a data
// URL — was tried and is a trap. A 256 px cell encodes to ~80 KB of base64, and
// the collection strip alone renders twenty badges, so the markup for one screen
// carries well over a megabyte of string. Positions are a few dozen bytes.
//
// The grid stays defined here rather than in the stylesheet because it has to
// match what `art/prepare.py iconsheet` laid out; one source of truth for it.
// ---------------------------------------------------------------

let effectIconSheet = null;
let effectIconSheetTried = false;

function loadEffectIconSheet(onReady) {
  if (effectIconSheetTried) { if (onReady) onReady(effectIconSheet); return; }
  effectIconSheetTried = true;
  const img = new Image();
  img.onload = () => {
    if (img.naturalWidth > 0) effectIconSheet = img;
    if (onReady) onReady(effectIconSheet);
  };
  img.onerror = () => { if (onReady) onReady(null); };
  img.src = EFFECT_ICON_SHEET;
}

// Inline style that puts one effect's cell in the badge, or null when the sheet
// is missing — callers then fall back to the text glyph.
function effectIconStyle(effectName) {
  if (!effectIconSheet) return null;
  const idx = EFFECT_ICON_INDEX[effectName || 'basic'];
  if (idx === undefined) return null;

  // Percentage background-position is a proportion of the leftover space, not an
  // offset, so the last column is 100% and a 1-column sheet would be 0%.
  const fx = EFFECT_ICON_COLS > 1 ? (idx % EFFECT_ICON_COLS) * 100 / (EFFECT_ICON_COLS - 1) : 0;
  const fy = EFFECT_ICON_ROWS > 1 ? Math.floor(idx / EFFECT_ICON_COLS) * 100 / (EFFECT_ICON_ROWS - 1) : 0;
  return `background-image:url('${EFFECT_ICON_SHEET}');` +
         `background-size:${EFFECT_ICON_COLS * 100}% ${EFFECT_ICON_ROWS * 100}%;` +
         `background-position:${fx.toFixed(3)}% ${fy.toFixed(3)}%`;
}

// The body sprite for a rock, by type. Falls back to the plain body so a
// missing variant degrades to "no accent" rather than to nothing.
function rockBodySprite(def) {
  if (def && def.type === ROCK_TYPE.OFFENSE) return sprite('rock_offense') || sprite('rock_body');
  if (def && def.type === ROCK_TYPE.DEFENSE) return sprite('rock_defense') || sprite('rock_body');
  if (def && def.type === ROCK_TYPE.CONTROL) return sprite('rock_control') || sprite('rock_body');
  return sprite('rock_body');
}

// ---------------------------------------------------------------
// Ice pattern
//
// The tile is a repeating texture, but the ice is drawn as a projected
// trapezoid, so a plain CSS-style repeat would not follow the perspective.
// Instead the pattern is painted into the clipped ice path in screen space at a
// scale that tracks the projection — close enough at these tile sizes, and it
// costs one createPattern rather than a per-frame warp.
// ---------------------------------------------------------------

let icePattern = null;

function buildIcePattern() {
  const img = sprite('ice_tile');
  if (!img || !ctx) return;
  try {
    icePattern = ctx.createPattern(img, 'repeat');
  } catch (e) {
    icePattern = null;
  }
}

function getIcePattern() {
  if (!icePattern) buildIcePattern();
  return icePattern;
}

// Draw a sprite centred on a point, scaled to a target width, preserving
// aspect. Returns false if the sprite is missing so the caller can fall back.
function drawSpriteCentred(ctx, name, cx, cy, targetW, alpha, rotation) {
  const img = sprite(name);
  if (!img) return false;
  const scale = targetW / img.naturalWidth;
  const h = img.naturalHeight * scale;
  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy);
  if (rotation) ctx.rotate(rotation);
  ctx.drawImage(img, -targetW / 2, -h / 2, targetW, h);
  ctx.restore();
  return true;
}

loadSprites();
// Kick the icon sheet off too, and refresh any meta screen already showing
// text glyphs once it lands.
loadEffectIconSheet((img) => {
  if (!img) return;
  if (typeof currentScreen === 'undefined') return;
  if (currentScreen === 'inventory-screen' && typeof refreshInventoryScreen === 'function') refreshInventoryScreen();
  if (currentScreen === 'shop-screen' && typeof refreshShopScreen === 'function') refreshShopScreen();
  if (typeof refreshDeckHud === 'function') refreshDeckHud();
});
