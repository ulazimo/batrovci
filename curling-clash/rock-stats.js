// ============================================================
// ROCK STATS — the four base statistics, 5 levels each
//
// The Inventory screen is out of scope for the Initial Version, but the
// shot controls and physics both depend on these stats (see the doc's
// "Rock Launching Controls and Flow" and "Rock Statistics" chapters), so
// they exist here as data.
//
//   Power      — how far the rock travels and how fast it launches
//   Accuracy   — the size of the Shot Area; higher accuracy = smaller area
//   Curl       — how much curve can be applied to the path
//   Trajectory — how much of the predicted path is drawn
//
// The doc pins one value: "Basic Rock should have Level 3 Power, which is
// enough to make it to the end of the House." The other three are set to
// level 3 as well, so the Basic Rock sits mid-ladder across the board.
// ============================================================

const STAT_LEVELS = {
  // Multiplier on the launch speed range. L3 = 1.0, i.e. the calibrated
  // baseline where perfect power stops the rock on the button.
  //
  // Kept DELIBERATELY NARROW. The launch speed range itself only spans a factor
  // of 1.29 (8.82 → 11.42 m/s), so a wide stat ladder eats the whole slider: at
  // ±12% a Power-5 rock's green zone landed at 13% of the slider and everything
  // above it overshot, while a Power-1 rock could not reach the button at all.
  // ±4% shifts where the green zone sits without making the slider unusable.
  power: [0.96, 0.98, 1.00, 1.02, 1.04],

  // Shot Area radius in metres, at release. Bigger = less precise.
  // L1 is roughly the 8-foot ring; L5 is tighter than the 4-foot ring.
  accuracy: [1.15, 0.90, 0.68, 0.48, 0.30],

  // Maximum lateral deflection in metres over a full-length draw, at full
  // handle rotation.
  curl: [0.55, 0.80, 1.05, 1.30, 1.60],

  // Fraction of the predicted path that the trajectory line covers.
  trajectory: [0.25, 0.38, 0.52, 0.70, 1.00],
};

// The Basic Rock is the catalogue's own entry rather than a second definition —
// two objects claiming to be the same rock is exactly how they drift apart.
const BASIC_ROCK = ROCK_BY_ID.basic;

// Read a stat's value for a rock definition. Levels are 1-based in design
// terms and 0-based in the arrays.
function statValue(rockDef, stat) {
  const ladder = STAT_LEVELS[stat];
  const level = Math.max(1, Math.min(5, rockDef[stat] | 0));
  return ladder[level - 1];
}

// Resolve the player's chosen deck into rock definitions for a match.
//
// A special rock with no durability left falls back to Basic for the match: it
// stays in the deck so the player can see it needs Polishing, but it cannot be
// thrown. Returning Basic rather than skipping the slot keeps the deck at eight.
function buildDeck() {
  const ids = typeof activeDeckIds === 'function'
    ? activeDeckIds()
    : Array.from({ length: ROCK.PER_TEAM }, () => 'basic');
  return ids.slice(0, ROCK.PER_TEAM).map(id => (isUsable(id) ? rockById(id) : BASIC_ROCK));
}
