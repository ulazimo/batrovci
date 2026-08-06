// ============================================================
// ROCK EFFECTS — the catalogue
//
// Every rock the player can own, from the doc's Special Effects chapter. The
// doc is explicit that "Each Special Rock effect Level should be its own Special
// Rock, instead of Leveling up", so levels expand into separate entries here
// rather than being a property to upgrade.
//
// Levels exist only where the doc states them: Wall ("3 levels of extension"),
// Speed Up Zone ("3 levels to it"), Magnet and Pulse ("based on its Level").
// Slow Down Zone is single-level because the doc gives it none — see the flag in
// MILESTONE-1-SPECIAL-ROCKS.md. Adding levels is a data change, nothing more.
//
// `trigger` is what makes the dispatch tractable. Eleven effects firing at
// arbitrary points would be unmaintainable; instead each declares one of four
// moments, and physics.js consults exactly one list at each:
//
//   passive      read continuously — stat and physics modifiers
//   onCollide    fires inside collidePair
//   onStop       fires once when everything has come to rest
//   whileMoving  deposits something every step
//
// `params` are per-level numbers. Anything worth feeling out is scaled by a
// TUNABLE at use site rather than being hard-coded here, so the catalogue stays
// a description of intent and tuning.js stays the single place to tweak.
// ============================================================

const ROCK_TYPE = {
  OFFENSE: 'offense',   // red
  DEFENSE: 'defense',   // blue
  CONTROL: 'control',   // orange
  BASIC:   'basic',     // grey
};

const TYPE_COLORS = {
  offense: '#d93b30',
  defense: '#2f6fd0',
  control: '#e08a2c',
  basic:   '#8c8f96',
};

// The fixed order the doc requires for the deck distribution bar.
const TYPE_BAR_ORDER = [ROCK_TYPE.OFFENSE, ROCK_TYPE.DEFENSE, ROCK_TYPE.CONTROL, ROCK_TYPE.BASIC];

// Base stats default to the Basic Rock's level 3 across the board; a special
// rock overrides only what its identity actually changes.
function rockDef(id, name, type, trigger, effect, params, stats, extra) {
  return Object.assign({
    id, name, type, trigger, effect,
    params: params || {},
    power: 3, accuracy: 3, curl: 3, trajectory: 3,
    maxDurability: 8,
    price: 0,
  }, stats || {}, extra || {});
}

const ROCK_CATALOGUE = [
  // ---- Offense ----
  rockDef('ricochet', 'Ricochet Rock', ROCK_TYPE.OFFENSE, 'onCollide', 'ricochet',
    { speedGain: 0.45 }, { power: 4 }, { price: 900,
    blurb: 'Gains speed off every rock it strikes, with a burst of sparks.' }),

  rockDef('curve', 'Curve Rock', ROCK_TYPE.OFFENSE, 'passive', 'curve',
    { curlMul: 2.1, sideBrushMul: 2.0 }, { curl: 5 }, { price: 950,
    blurb: 'Curls far harder and answers the side brush, for coming around guards.' }),

  rockDef('power', 'Power Rock', ROCK_TYPE.OFFENSE, 'passive', 'power',
    { impulseMul: 1.55, wallDamageMul: 2.4 }, { power: 5, accuracy: 2 }, { price: 1000,
    blurb: 'Carries more through a hit — breaks walls and shifts heavy rocks.' }),

  rockDef('pulse-1', 'Pulse Rock I', ROCK_TYPE.OFFENSE, 'onStop', 'pulse',
    { radius: 1.1, push: 1.6 }, null, { price: 800,
    blurb: 'Shoves nearby rocks away the moment it settles.' }),
  rockDef('pulse-2', 'Pulse Rock II', ROCK_TYPE.OFFENSE, 'onStop', 'pulse',
    { radius: 1.6, push: 2.4 }, null, { price: 1400,
    blurb: 'A wider, harder shove when it settles.' }),
  rockDef('pulse-3', 'Pulse Rock III', ROCK_TYPE.OFFENSE, 'onStop', 'pulse',
    { radius: 2.2, push: 3.3 }, null, { price: 2100,
    blurb: 'Clears the front of the house on arrival.' }),

  // ---- Defense ----
  rockDef('wall-1', 'Wall Rock I', ROCK_TYPE.DEFENSE, 'onStop', 'wall',
    { halfWidth: 0.55, health: 3.0 }, null, { price: 850,
    blurb: 'Throws out a short wall either side when it stops.' }),
  rockDef('wall-2', 'Wall Rock II', ROCK_TYPE.DEFENSE, 'onStop', 'wall',
    { halfWidth: 0.90, health: 4.5 }, null, { price: 1450,
    blurb: 'A longer, tougher wall.' }),
  rockDef('wall-3', 'Wall Rock III', ROCK_TYPE.DEFENSE, 'onStop', 'wall',
    { halfWidth: 1.30, health: 6.0 }, null, { price: 2200,
    blurb: 'Shuts down most of the lane until something breaks through.' }),

  // rangeMul is deliberately mild, and stacks on top of the Power-1 stat.
  // Distance goes as the SQUARE of launch speed, so a penalty that looks small
  // bites hard: 0.88 put the button beyond full power and made the rock
  // unusable rather than merely short. 0.97 × Power-1 lands perfect power around
  // 84% of the slider — clearly "throw this hard", with headroom above it.
  rockDef('heavy', 'Heavy Rock', ROCK_TYPE.DEFENSE, 'passive', 'heavy',
    { massMul: 2.2, rangeMul: 0.97 }, { power: 1 }, { price: 900,
    blurb: 'Very hard to move off a spot, but it will not travel as far.' }),

  rockDef('freeze', 'Freeze Rock', ROCK_TYPE.DEFENSE, 'onStop', 'freeze',
    { radius: 1.5 }, null, { price: 1250,
    blurb: 'Freezes rocks around it — they shrug off their next collision.' }),

  // ---- Control ----
  rockDef('speedzone-1', 'Speed Zone Rock I', ROCK_TYPE.CONTROL, 'onStop', 'speedZone',
    { radius: 1.1, traction: 0.62, turns: 0 }, null, { price: 800,
    blurb: 'Leaves slick ice behind — rocks crossing it run further.' }),
  rockDef('speedzone-2', 'Speed Zone Rock II', ROCK_TYPE.CONTROL, 'onStop', 'speedZone',
    { radius: 1.6, traction: 0.48, turns: 0 }, null, { price: 1350,
    blurb: 'A wider, slicker patch.' }),
  rockDef('speedzone-3', 'Speed Zone Rock III', ROCK_TYPE.CONTROL, 'onStop', 'speedZone',
    { radius: 2.2, traction: 0.34, turns: 0 }, null, { price: 2000,
    blurb: 'Turns a stretch of the lane into a slide.' }),

  rockDef('slowzone', 'Slow Zone Rock', ROCK_TYPE.CONTROL, 'onStop', 'slowZone',
    { radius: 1.5, traction: 1.9, turns: 0 }, null, { price: 1100,
    blurb: 'Scatters debris that drags rocks to a stop early.' }),

  rockDef('magnet-1', 'Magnet Rock I', ROCK_TYPE.CONTROL, 'onStop', 'magnet',
    { radius: 1.3, pull: 0.5, turns: 0 }, null, { price: 850,
    blurb: 'Draws passing rocks gently toward it.' }),
  rockDef('magnet-2', 'Magnet Rock II', ROCK_TYPE.CONTROL, 'onStop', 'magnet',
    { radius: 1.9, pull: 0.9, turns: 0 }, null, { price: 1500,
    blurb: 'A stronger pull over a wider area.' }),
  rockDef('magnet-3', 'Magnet Rock III', ROCK_TYPE.CONTROL, 'onStop', 'magnet',
    { radius: 2.6, pull: 1.4, turns: 0 }, null, { price: 2300,
    blurb: 'Bends anything that comes near it off its line.' }),

  rockDef('fire', 'Fire Rock', ROCK_TYPE.CONTROL, 'whileMoving', 'fire',
    { radius: 0.42, turns: 0 }, null, { price: 1300,
    blurb: 'Melts a trail of water. Brushing does not work on water.' }),

  // ---- Basic. Last in the collection list, as the doc specifies. ----
  rockDef('basic', 'Basic Rock', ROCK_TYPE.BASIC, 'none', null, null, null,
    { price: 0, maxDurability: Infinity,
      blurb: 'No special effect. Reliable, and you have as many as you need.' }),
];

const ROCK_BY_ID = {};
for (const r of ROCK_CATALOGUE) ROCK_BY_ID[r.id] = r;

// `turns: 0` in the catalogue means "until the end of the match", which is the
// doc's stated default for zone durations. Resolved here so the effect system
// never has to special-case zero.
const LASTS_ALL_MATCH = 9999;

function effectTurns(def) {
  const t = def.params.turns;
  return !t ? LASTS_ALL_MATCH : t;
}

function rockById(id) {
  return ROCK_BY_ID[id] || ROCK_BY_ID.basic;
}

function isSpecial(def) {
  return def.type !== ROCK_TYPE.BASIC;
}

// Does this rock carry the named passive effect? Used at the physics hot path,
// so it is a straight comparison rather than a lookup.
function hasEffect(def, name) {
  return def && def.effect === name;
}

// Every special rock in collection order, Basic last — the order the doc asks
// the Rock Collection tab to use.
function catalogueForCollection() {
  return ROCK_CATALOGUE;
}
