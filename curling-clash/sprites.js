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
