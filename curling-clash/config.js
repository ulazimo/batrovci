// ============================================================
// CONFIG — official curling geometry + palette
//
// Every length is in METRES, taken from the World Curling Federation
// "Rules of Curling" (July 2025), rules R1 (Sheet) and R2 (Stones).
//
// Curling Clash never swaps ends, so unlike a real sheet ours is
// ASYMMETRIC: one house, at the playing end. The playing direction is
// +Y (toward the house) and x = 0 is the centre line.
//
//   y = 0.000   delivery hack ...... origin, where the rock starts
//   y = 3.658   delivery tee line ... centre line runs 12 ft past the tee
//   y = 10.059  delivery hog line ... rock must be released before here
//   y = 32.005  playing hog line .... rock must fully cross this to stay in play
//   y = 38.405  playing tee line .... the button, centre of the house
//   y = 40.234  back line .......... past this (fully) and the rock is out
// ============================================================

// ---- Raw rule measurements (the numbers the rules actually state) ----
const R = {
  SHEET_WIDTH:       4.750,   // R1(a) max width, side line to side line
  TEE_TO_TEE:       34.747,   // R1(b)I  — tee centres are 57 ft from mid-sheet
  TEE_TO_HOG:        6.401,   // R1(b)III — 21 ft, to the hog line's inside edge
  TEE_TO_BACK:       1.829,   // R1(b)II  — 6 ft, to the back line's outside edge
  TEE_TO_HACK:       3.658,   // R1(b)IV  — centre line runs 12 ft past the tee
  HOG_TO_HOG:       21.946,   // 72 ft — implied by TEE_TO_TEE - 2 * TEE_TO_HOG
  HOG_LINE_WIDTH:    0.102,   // R1(b)III — the hog line is a fat 4 in line
  THIN_LINE_WIDTH:   0.013,   // R1(b) — tee/back/centre lines, 1/2 in
  HACK_LINE_LENGTH:  0.457,   // R1(b)V — 18 in
  HACK_WIDTH:        0.152,   // R1(e) — 6 in max
  HACK_INSET:        0.076,   // R1(e) — inside edge 3 in from the centre line
};

// ---- Derived sheet layout, delivery hack at the origin ----
const SHEET = {
  WIDTH:      R.SHEET_WIDTH,
  HALF_WIDTH: R.SHEET_WIDTH / 2,               // 2.375 — side lines at ±this

  HACK_Y:         0,
  NEAR_TEE_Y:     R.TEE_TO_HACK,                            //  3.658
  NEAR_HOG_Y:     R.TEE_TO_HACK + R.TEE_TO_HOG,             // 10.059
  FAR_HOG_Y:      R.TEE_TO_HACK + R.TEE_TO_HOG + R.HOG_TO_HOG, // 32.005
  TEE_Y:          R.TEE_TO_HACK + R.TEE_TO_TEE,             // 38.405 — the button
  BACK_LINE_Y:    R.TEE_TO_HACK + R.TEE_TO_TEE + R.TEE_TO_BACK, // 40.234

  // A little ice past the back line so a through-rock has somewhere to be
  // swept away to rather than vanishing at the line.
  RUNOUT_Y:       R.TEE_TO_HACK + R.TEE_TO_TEE + R.TEE_TO_BACK + 2.0,

  // Real sheets run 6 ft past the hack to the backboard. Ours does too, so the
  // camera at the delivery end is not staring at the edge of the world.
  BEHIND_HACK_Y: -R.TEE_TO_BACK,
};

// ---- The house: four concentric circles, R1(d). Named by DIAMETER in feet,
//      which is how curlers talk about them, but stored as radii in metres. ----
const HOUSE = {
  R_12FT:  1.829,   // 6 ft radius  — outer edge of the house
  R_8FT:   1.219,   // 4 ft radius
  R_4FT:   0.610,   // 2 ft radius
  R_BUTTON: 0.152,  // 6 in radius  — the button
};

// ---- Rocks, R2(a). Circumference <= 914 mm, so diameter <= 914/pi. ----
const ROCK = {
  RADIUS: 0.914 / Math.PI / 2,   // 0.1455 m
  HEIGHT: 0.114,                 // 4.5 in minimum
  MASS_MIN: 17.24,               // 38 lb
  MASS_MAX: 19.96,               // 44 lb
  PER_TEAM: 8,                   // R3(a) — four players, two stones each
};

// A rock counts as in the house if any part of it touches or overlaps the
// 12-foot circle — so we compare centre distance against radius + rock radius.
const IN_HOUSE_RADIUS = HOUSE.R_12FT + ROCK.RADIUS;

// ---- Teams ----
const TEAM = {
  YELLOW: 'yellow',   // always the user
  RED:    'red',      // always the opponent
};

// ---- Palette ----
// House ring colours read off "Curling House Color Reference 1/2.jpeg":
// royal blue outer pair, red inner pair, white ice between.
const COLORS = {
  // Pulled back from pure white: a blown-out sheet leaves the rocks and UI
  // nothing to sit against, and real arena ice reads cool, not paper-white.
  ice:         '#dfecf6',
  iceShadow:   '#bcd5e9',
  iceDeep:     '#9dbdd6',
  lineDark:    '#5a6b7a',
  house12:     '#2f52a8',
  house8:      '#ffffff',
  house4:      '#d92b28',
  houseButton: '#ffffff',

  yellow:      '#f2c230',
  yellowDark:  '#c1902a',
  red:         '#d93b30',
  redDark:     '#a02a22',
  granite:     '#8c8f96',
  graniteDark: '#5d6067',

  // Power slider ramp — orange, through yellow, to green at the perfect zone,
  // then back through orange to red above it (see the doc's Rock Launching
  // Controls chapter).
  powerLow:    '#f2913d',
  powerMid:    '#f2d13d',
  powerPerfect:'#4fd672',
  powerHigh:   '#f2823d',
  powerOver:   '#e33d2e',
};

// ---- Match ----
const MATCH_LENGTHS = { short: 3, normal: 5, long: 7 };
