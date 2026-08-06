// ============================================================
// TUNING — one registry for every number worth feeling out
//
// The concept doc asks for a slider six separate times (traction, rock mass,
// collision energy loss, brushing traction change, side-brush curve amount,
// camera follow area). Rather than scatter magic numbers through the physics,
// every tunable is declared once here and rendered as a live slider by
// tuning-panel.js. Values persist to localStorage and can be exported as JSON
// so a good configuration gets committed back as the new defaults.
//
// Read values straight off TUNE — it is a plain object, so the physics inner
// loop pays nothing for the indirection:
//
//     const decel = TUNE.iceFrictionA + TUNE.iceFrictionB * speed;
//
// Sliders the doc asks for by name are marked with a ★ in their label.
// ============================================================

const TUNE_GROUPS = [
  { id: 'ice',        label: 'Ice' },
  { id: 'rock',       label: 'Rock' },
  { id: 'curl',       label: 'Curl' },
  { id: 'collision',  label: 'Collisions' },
  { id: 'brush',      label: 'Brushing' },
  { id: 'shot',       label: 'Shot UI' },
  { id: 'camera',     label: 'Camera' },
  { id: 'projection', label: 'Projection' },
  { id: 'scoring',    label: 'Scoring' },
  { id: 'effects',    label: 'Special Rocks' },
  { id: 'economy',    label: 'Economy' },
];

// def: [group, label, default, min, max, step, help]
const TUNE_DEFS = {
  // ---------- Ice ----------
  iceFrictionA:      ['ice', '★ Traction (base decel)', 1.440, 0.05, 3.00, 0.001,
    'Constant deceleration in m/s². Real ice is ≈0.165 (µ 0.0168), which gives a slow, floaty 3 m/s draw taking 17 s — authentic but a slog, and the rock looks like it is drifting. 1.44 puts launch speed around 10 m/s and a draw at about 7 s: the rock reads as genuinely thrown. Traction and launch speed trade off directly, so re-run the bench after touching either.'],
  iceFrictionB:      ['ice', 'Glide term (v-proportional)', 0.010, 0, 0.20, 0.001,
    'Deceleration proportional to speed, in 1/s. Shapes the long glide without changing the final crawl much.'],
  iceFrictionJitter: ['ice', 'Traction variance', 0.00, 0, 0.25, 0.01,
    'Random per-shot variation in traction, as a fraction. 0 = perfectly consistent ice.'],

  // ---------- Rock ----------
  rockMass:          ['rock', '★ Rock mass (kg)', 19.0, 17.24, 19.96, 0.01,
    'Official range is 17.24–19.96 kg. Affects collision momentum transfer only — friction is mass-independent.'],
  rockRadiusScale:   ['rock', 'Rock size scale', 1.35, 0.70, 2.40, 0.01,
    'Multiplier on the official 0.1455 m radius. This changes how many rocks fit in the house, so it is a strategy lever, not an art one — in real curling 16 rocks genuinely do not fit, and that is the whole game. Reach for projSheetFill first if rocks merely look small.'],
  spinDecay:         ['rock', 'Spin decay per metre', 0.018, 0, 0.10, 0.001,
    'Fraction of handle rotation lost per metre travelled.'],
  launchSpeedMin:    ['rock', 'Launch speed at 0% power', 8.82, 2.00, 14.00, 0.01,
    'm/s at the bottom of the power slider. Tuned so minimum power falls short of the far hog line — a real miss, not a dead zone.'],
  launchSpeedMax:    ['rock', 'Launch speed at 100% power', 11.42, 3.00, 18.00, 0.01,
    'm/s at full power. Tuned so full power sails through the back line, as the doc requires. Narrowing the gap to min widens the usable band around the house.'],
  powerCurve:        ['rock', 'Power curve exponent', 1.00, 0.50, 2.00, 0.01,
    'Maps the slider 0–1 onto the speed range. 1 = linear; above 1 gives finer control at low power.'],

  // ---------- Curl ----------
  curlCoefficient:   ['curl', 'Curl strength', 0.145, 0, 0.40, 0.001,
    'Lateral acceleration scale in m/s². Calibrated on the bench so full handle at Curl L5 deflects curlMaxDeflect.'],
  curlSpeedShape:    ['curl', 'Curl speed response', 1.30, 0, 3.00, 0.01,
    'Exponent on (referenceSpeed / speed). Higher means the rock curls much harder once it slows — real stones do this.'],
  curlSpeedRef:      ['curl', 'Curl reference speed', 5.00, 0.40, 12.00, 0.01,
    'Speed in m/s at which the curl response is 1×. Keep it near the mid-travel speed so the response curve straddles the useful range — it must move whenever the launch speeds do.'],
  curlSpeedFloor:    ['curl', 'Curl response clamp', 4.00, 1.00, 12.0, 0.10,
    'Caps the low-speed multiplier so the last crawling centimetres do not hook absurdly.'],

  // ---------- Collisions ----------
  collisionRestitution: ['collision', 'Restitution', 0.94, 0, 1.00, 0.01,
    'Bounciness of a rock-on-rock hit. Granite is nearly elastic, so this sits high.'],
  collisionEnergyLoss:  ['collision', '★ Energy lost per hit', 0.06, 0, 0.60, 0.01,
    'Extra scalar energy removed on impact, on top of restitution. Turn up to make takeouts feel heavier and deader.'],
  collisionIterations:  ['collision', 'Resolution passes', 4, 1, 12, 1,
    'Impulse passes per substep. Higher resolves multi-rock pile-ups more cleanly.'],
  collisionSeparation:  ['collision', 'Separation stiffness', 1.00, 0.20, 2.00, 0.01,
    'How firmly overlapping rocks are pushed apart.'],

  // ---------- Brushing ----------
  brushTractionMult: ['brush', '★ Traction while brushing', 0.55, 0.10, 1.00, 0.01,
    'Friction multiplier inside the swept zone at full intensity. 0.55 = brushing removes 45% of the traction.'],
  brushReach:        ['brush', 'Sweep reach ahead (m)', 2.20, 0.50, 6.00, 0.05,
    'How far ahead of the rock the brushed ice extends. Beyond this the rock is back on untouched ice.'],
  brushSideForce:    ['brush', '★ Side-brush force', 0.055, 0, 0.25, 0.001,
    'Lateral acceleration in m/s² from side-brushing at full deflection.'],
  brushSideMaxDeg:   ['brush', '★ Side-brush max bend (°)', 6.0, 0, 25.0, 0.5,
    'Hard clamp on how far side-brushing can bend the path. The doc says a few degrees, not a full redirect.'],
  brushRamp:         ['brush', 'Effect ramp (s)', 0.18, 0, 1.00, 0.01,
    'Seconds for the brushing effect to fade in when you start and out when you stop.'],
  brushIntensityCurve: ['brush', 'Intensity curve', 1.20, 0.50, 2.50, 0.01,
    'Exponent on thumbstick distance. Above 1 means you must push far for maximum intensity.'],
  brushOpponentWindow: ['brush', 'Opponent brush window (s)', 2.50, 0.50, 6.00, 0.10,
    'How long the opponent may brush your rock once it has crossed the tee line and is still moving.'],

  // ---------- Shot UI ----------
  perfectPowerCenter: ['shot', 'Perfect power (Basic Rock)', 0.547, 0.20, 0.90, 0.001,
    'Reference only: the slider position that stops a BASIC rock on the button. In play the green zone is solved per rock at arm time (see armShot), because a Heavy Rock cannot be thrown as far and a high-Power rock goes further. Kept here as the bench\'s calibration target.'],
  perfectZoneWidth:   ['shot', 'Perfect zone width', 0.060, 0.01, 0.30, 0.001,
    'Width of the green band. Sized to roughly the 4-foot ring — the button alone would be a 1% sliver.'],
  snapStraight:       ['shot', 'Snap to straight line', 0.35, 0, 1.00, 0.01,
    'Light pull toward a dead-straight shot when the aim is close to it.'],
  snapPerfect:        ['shot', 'Snap to perfect power', 0.30, 0, 1.00, 0.01,
    'Light pull toward perfect power when the slider is near the green zone.'],
  aimMaxAngleDeg:     ['shot', 'Max aim angle (°)', 9.0, 2.0, 25.0, 0.5,
    'How far off the centre line the shot can be aimed by dragging sideways.'],
  overShakeAmp:       ['shot', 'Overpower shake (px)', 3.2, 0, 12.0, 0.1,
    'Shake amplitude on the power slider above the perfect zone.'],
  curlHandleMaxDeg:   ['shot', 'Handle rotation range (°)', 75.0, 20.0, 180.0, 1.0,
    'How far the handle can be rotated either way. Full rotation = maximum curl for the rock.'],
  trajectoryFade:     ['shot', 'Trajectory fade (s)', 0.55, 0.05, 2.00, 0.01,
    'How long the trajectory line takes to fade out after release.'],
  shotAreaShrinkPow:  ['shot', 'Shot area shrink curve', 1.40, 0.40, 3.00, 0.01,
    'Exponent on remaining speed. Higher keeps the circle wide longer, then collapses it late.'],
  shotAreaFadePow:    ['shot', 'Shot area fade curve', 0.70, 0.20, 3.00, 0.01,
    'Exponent on remaining speed for the circle\'s opacity, so it fades away as the rock slows. Below 1 holds it visible through most of the travel and fades it late; above 1 fades it early.'],
  shotAreaScale:      ['shot', 'Shot area size ×', 1.00, 0.20, 2.50, 0.01,
    'Scales every Accuracy level at once. Raise to make the whole game less precise without touching the stat ladder.'],
  deliveryPushScale:  ['shot', 'Delivery push ×', 1.00, 0.40, 2.50, 0.05,
    'Scales the delivery slide duration. At 1.00 the slide is derived from the launch speed and arrives at exactly that speed, so release is seamless. Above 1 the push is slower than the throw and the rock appears to speed up on release; below 1 it lurches slower.'],

  // ---------- Camera ----------
  camAnchorRow:      ['camera', 'Camera anchor row', 0.72, 0.30, 0.95, 0.01,
    'Screen fraction from the top where the camera target sits. 0.72 puts the resting rock in the lower third, as the doc asks, and still leaves room below for the power slider.'],
  camBandTop:        ['camera', '★ Follow band top', 0.60, 0.05, 0.90, 0.01,
    'Screen fraction from the top — the rock is kept below this line. Held low on purpose: whatever fraction of the screen sits above the rock is how far ahead you can see, so a low band is what lets you watch the shot develop instead of staring at the rock.'],
  camBandBottom:     ['camera', '★ Follow band bottom', 0.80, 0.10, 0.95, 0.01,
    'Screen fraction from the top — the rock is kept above this line.'],
  camLerp:           ['camera', 'Follow smoothing', 0.12, 0.02, 1.00, 0.01,
    'Per-frame catch-up fraction. Lower is smoother and laggier.'],
  camHouseClamp:     ['camera', 'House clamp offset (m)', 0.0, -4.0, 6.0, 0.1,
    'Shifts where the camera stops. 0 puts the tee dead centre, as the doc asks.'],
  camApproach:       ['camera', 'Approach lead (m)', 12.0, 0.0, 24.0, 0.5,
    'How far before the far hog line the camera starts easing from pure follow onto the house-centred view. Larger = a longer, gentler settle.'],
  camFocusTime:      ['camera', 'Focus House time (s)', 0.45, 0.10, 1.50, 0.01,
    'Transition duration in and out of the House view.'],

  // ---------- Projection ----------
  projTopRow:        ['projection', 'Top of view', 0.15, 0.02, 0.45, 0.01,
    'Screen fraction from the top where the far end of the visible ice lands.'],
  projDepthSpan:     ['projection', 'Visible depth (m)', 16.0, 8.0, 48.0, 0.5,
    'Metres of ice between the camera target row and the top of the view. 16 gives an overhead view of the rock and the ice just ahead of it. Raise toward 40 to see the whole sheet from the hack, at the cost of the camera flattening out into a long lane.'],
  projDepthCompress: ['projection', 'Depth compression', 0.30, 0.00, 4.00, 0.01,
    'How much the far ice bunches up. 0 = even, top-down depth where a metre is a metre anywhere on screen. Higher adds perspective foreshortening, which costs readability fast.'],
  projWidthLens:     ['projection', 'Width taper (m)', 34.0, 6.0, 90.0, 0.5,
    'Distance ahead at which the sheet appears half as wide. This is what sells the perspective, and unlike depth compression it costs no readability. Lower = more dramatic taper; higher = closer to straight overhead.'],
  projSheetFill:     ['projection', 'Sheet width at target', 1.15, 0.40, 2.40, 0.01,
    'How much of the screen width the sheet spans at the camera target — the whole scale hangs off this, and it is the honest lever for rock size. A rock is 8.3% of the sheet width by the rules, so at 0.98 it is 34 px on a 414 px screen and at 1.15 it is 39 px. Above 1 the side lines run off-screen near the camera and come back into view further up as the sheet tapers, which is how curling is broadcast. The House view has its own value and is unaffected.'],
  projDepthScale:    ['projection', 'Sprite depth scale', 0.85, 0.40, 1.80, 0.01,
    'Exponent on how fast rocks shrink with distance. 1 = matches the width taper exactly; below 1 keeps rocks at the far house readable.'],
  projHouseDepth:    ['projection', 'House view depth (m)', 11.0, 3.0, 24.0, 0.5,
    'Visible depth while the House is focused. Smaller zooms in closer.'],
  projFollowDepth:   ['projection', 'Travel depth (m)', 16.0, 8.0, 48.0, 0.5,
    'Visible depth while the rock is travelling. Equal to projDepthSpan by default, which is what makes aiming and travelling a single unbroken perspective — the camera only translates, never tilts or zooms. Raising it lets you see further ahead of the rock, at the cost of a visible shift at release. Any difference between the two IS a jump, however smoothly it is tweened.'],
  projHouseFill:     ['projection', 'House view sheet width', 0.98, 0.40, 1.80, 0.01,
    'Sheet width at the target while the House is focused. Separate from projSheetFill because the two views want opposite things: the shooting view crops the side lines to make rocks big, whereas the house view must show the full width or a rock on the edge of the twelve-foot gets clipped off-screen.'],

  // ---------- Scoring ----------
  measureThreshold:  ['scoring', 'Measurement threshold (m)', 0.12, 0.01, 0.60, 0.01,
    'If the two closest opposing rocks are within this, the measurement drama plays.'],
  countUpPace:       ['scoring', 'Score count-up (ms/point)', 420, 100, 1200, 10,
    'Pause between each rock as the end score counts up.'],
  leaderHighlight:   ['scoring', 'Highlight ring width (px)', 3.0, 1.0, 8.0, 0.1,
    'Thickness of the ring drawn around currently-scoring rocks.'],

  // ---------- Special Rocks ----------
  // Global scales on top of the per-rock numbers in rock-effects.js. The
  // catalogue says what a rock IS; these say how strongly that lands, so the
  // whole set can be balanced together without editing 19 entries.
  fxZoneStrength:    ['effects', 'Zone strength ×', 1.00, 0.00, 2.50, 0.01,
    'Scales how far speed-up and slow-down zones move traction from normal. 0 disables zones entirely.'],
  fxZoneEdgeSoft:    ['effects', 'Zone edge softness', 0.35, 0.00, 1.00, 0.01,
    'Fraction of the radius over which a zone fades out. 0 is a hard rim, which reads as a bug when a rock clips it.'],
  fxMagnetStrength:  ['effects', 'Magnet pull ×', 1.00, 0.00, 3.00, 0.01,
    'Scales magnet pull acceleration in m/s².'],
  fxMagnetFalloff:   ['effects', 'Magnet falloff', 1.40, 0.00, 3.00, 0.01,
    'How quickly pull weakens toward the edge of the radius. Higher concentrates the effect near the magnet.'],
  fxPulseStrength:   ['effects', 'Pulse push ×', 1.00, 0.00, 3.00, 0.01,
    'Scales the one-shot shove a Pulse Rock gives when it settles, in m/s.'],
  fxWallHealth:      ['effects', 'Wall health ×', 1.00, 0.10, 3.00, 0.01,
    'Scales how much punishment a wall takes before breaking.'],
  fxWallDamage:      ['effects', 'Wall damage ×', 1.00, 0.10, 3.00, 0.01,
    'Scales damage dealt to walls per impact, before the Power Rock bonus.'],
  fxWallBounce:      ['effects', 'Wall bounce', 0.22, 0.00, 1.00, 0.01,
    'How much speed a rock keeps when a wall HOLDS. Kept low: granite into a barrier should mostly stop dead, and a lively rebound sent rocks metres back down the sheet.'],
  fxWallBreakKeep:   ['effects', 'Wall break-through keep', 0.55, 0.00, 1.00, 0.01,
    'How much speed a rock keeps when it BREAKS a wall and carries on through.'],
  fxRicochetGain:    ['effects', 'Ricochet gain ×', 1.00, 0.00, 3.00, 0.01,
    'Scales the speed a Ricochet Rock picks up from each hit.'],
  fxCurveMul:        ['effects', 'Curve Rock ×', 1.00, 0.20, 2.50, 0.01,
    'Scales the Curve Rock\'s extra curl and side-brush response.'],
  fxHeavyMul:        ['effects', 'Heavy Rock ×', 1.00, 0.20, 2.50, 0.01,
    'Scales how much heavier a Heavy Rock is, and how much range it gives up.'],
  fxPowerMul:        ['effects', 'Power Rock ×', 1.00, 0.20, 2.50, 0.01,
    'Scales the Power Rock\'s extra momentum through a collision.'],
  fxFireTrailWidth:  ['effects', 'Fire trail width ×', 1.00, 0.20, 3.00, 0.01,
    'Scales the width of the water a Fire Rock melts behind it.'],
  fxFireSpacing:     ['effects', 'Fire trail spacing (m)', 0.55, 0.15, 2.00, 0.05,
    'Distance between water patches. Tighter is a smoother trail but more objects to test against.'],
  fxFreezeRadius:    ['effects', 'Freeze radius ×', 1.00, 0.20, 2.50, 0.01,
    'Scales the area a Freeze Rock protects.'],
  fxEffectAlpha:     ['effects', 'Effect visibility', 0.85, 0.10, 1.00, 0.01,
    'Opacity of zones, walls and water on the ice. Lower if the board reads as too busy.'],

  // ---------- Economy ----------
  coinsPerWin:       ['economy', 'Coins for a win', 320, 0, 2000, 10,
    'Soft currency awarded for winning a match — the doc\'s stated source of Coins.'],
  coinsPerLoss:      ['economy', 'Coins for a loss', 90, 0, 1000, 10,
    'A consolation payout, so a losing streak cannot strand the player with no way to repair rocks.'],
  coinsPerEndWon:    ['economy', 'Coins per end won', 25, 0, 200, 5,
    'Paid per end scored, so a close loss still earns something.'],
  polishCostFrac:    ['economy', 'Polish cost fraction', 0.35, 0.05, 1.00, 0.01,
    'Cost to fully Polish a dead rock, as a fraction of its purchase price. Scaled by how worn it actually is.'],
};

// ---- Live values ----
const TUNE = {};
const TUNE_STORAGE_KEY = 'cc_tuning_v1';

function tuneDefault(key) { return TUNE_DEFS[key][2]; }

function resetTuning() {
  for (const key in TUNE_DEFS) TUNE[key] = tuneDefault(key);
}

function loadTuning() {
  resetTuning();
  try {
    const saved = JSON.parse(localStorage.getItem(TUNE_STORAGE_KEY) || '{}');
    for (const key in saved) {
      // Ignore keys that no longer exist, so an old save cannot resurrect a
      // tunable that has since been removed or renamed.
      if (key in TUNE_DEFS && typeof saved[key] === 'number') TUNE[key] = saved[key];
    }
  } catch (e) {
    console.warn('Tuning load failed, using defaults', e);
  }
}

function saveTuning() {
  try {
    // Only persist what actually differs from the defaults — keeps the blob
    // small and makes "what have I changed?" answerable.
    const diff = {};
    for (const key in TUNE_DEFS) {
      if (TUNE[key] !== tuneDefault(key)) diff[key] = TUNE[key];
    }
    localStorage.setItem(TUNE_STORAGE_KEY, JSON.stringify(diff));
  } catch (e) {
    console.warn('Tuning save failed', e);
  }
}

function setTune(key, value) {
  if (!(key in TUNE_DEFS)) return;
  TUNE[key] = value;
  saveTuning();
  if (typeof onTuningChanged === 'function') onTuningChanged(key, value);
}

// Export every value (not just the diff) so a pasted config is fully explicit.
function exportTuning() {
  const out = {};
  for (const key in TUNE_DEFS) out[key] = TUNE[key];
  return JSON.stringify(out, null, 2);
}

function importTuning(json) {
  const parsed = JSON.parse(json);
  for (const key in parsed) {
    if (key in TUNE_DEFS && typeof parsed[key] === 'number') TUNE[key] = parsed[key];
  }
  saveTuning();
  return true;
}

loadTuning();
