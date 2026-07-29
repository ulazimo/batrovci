// ============================================================
// DIFFICULTY — level tier classification (Easy / Normal / Hard / Too Hard).
//
// This is a faithful PORT of the level-editor's Turns Advisor model
// (level-editor/editor.js → TURN_MODEL + computeTurnsModel and its helpers).
// The editor is the AUTHORING source of truth and is NOT loaded by the game, so
// the model is duplicated here to classify the level the player is about to play
// (used by the home Play button). If the constants or formula change in the
// editor, KEEP THIS IN SYNC. See CLAUDE.md §10 and the mm-turns-difficulty-model
// memo for the design rationale.
//
// Turns are a memory/mistake budget: difficulty = MARGIN of the authored turns
// over the exploration `need` (assists — chain-danger reveal, back-effects,
// reveal power-ups, face-up obstacle cells — lower need). No load-time deps
// (only ALL_COLORS at call time); loads with the other data files.
// ============================================================

const TURN_MODEL = {
  A: 0.39, B: 0.045,          // BARE exploration need = N·(A + B·Ceff)  (no assists)
  REVEAL_CREDIT: 0.2,         // turns saved per FREE card reveal (face-up cell / back-effect / power-up)
  DANGER_FRAC: 0.14,          // Chain Danger Reveal (default ON): turns saved ≈ this × N
  POWERUP_REVEALS: 3,         // assumed free reveals/level from reveal power-ups a player brings
  BACKEFFECT_DISCOUNT: 0.5,   // fraction of a back-effect's pattern that lands on NEW cells
  TIER: { bad: 1.30, hard: 1.75, normal: 2.5 }, // margin thresholds (turns / need)
};

// Authored back-of-card effects reveal a pattern when collected → free information.
function backEffectReveals(lvl) {
  const SIZE = { row: lvl.cols - 1, column: lvl.rows - 1, cross: 4, circle: 8, star: 12 };
  let cards = 0, reveals = 0;
  (lvl.backEffects || []).forEach(([r, c, id]) => {
    cards++;
    reveals += (SIZE[id] != null ? SIZE[id] : 4) * TURN_MODEL.BACKEFFECT_DISCOUNT;
  });
  return { cards, reveals };
}

// Every card that must be cleared. Elevator refills and stack under-layers are extra cards.
function activeCardCount(lvl) {
  const cells = lvl.cols * lvl.rows;
  const disabled = (lvl.disabled || []).length;
  const stackExtra = (lvl.stacks || []).reduce((s, x) => s + Math.max(0, (x[2] || 2) - 1), 0);
  const elevExtra = (lvl.elevators || []).reduce((s, a) => s + Math.max(0, a.refills || 0) * ((a.cells || []).length), 0);
  const base = cells - disabled;
  return { base, stackExtra, elevExtra, total: base + stackExtra + elevExtra };
}

// Face-up obstacle cells: their colour is known from the start, so they cut discovery cost.
function revealedObstacleCells(lvl) {
  const locked = (lvl.locked || []).length;
  const ice    = (lvl.ice || []).reduce((s, a) => s + ((a.cells || []).length), 0);
  const clk    = (lvl.colorLocks || []).reduce((s, a) => s + ((a.cells || []).length), 0);
  return { locked, ice, clk, total: locked + ice + clk };
}

// Best estimate of the top-board colour distribution: authored fixed colours + colorCounts
// targets, with the remainder spread evenly across the free active colours.
function estimateColorDistribution(lvl, N) {
  const C = Math.max(1, Math.min(6, lvl.colorCount || 3));
  const active = ALL_COLORS.slice(0, C);
  const counts = {}; active.forEach(c => counts[c] = 0);
  (lvl.colors || []).forEach(([r, c, col]) => { if (col) counts[col] = (counts[col] || 0) + 1; });
  const cc = lvl.colorCounts || {};
  Object.entries(cc).forEach(([col, n]) => { counts[col] = Math.max(counts[col] || 0, Math.floor(+n) || 0); });
  let assigned = Object.values(counts).reduce((a, b) => a + b, 0);
  let remaining = Math.max(0, N - assigned);
  const free = active.filter(c => !(c in cc));
  const pool = free.length ? free : active;
  for (let i = 0; i < remaining; i++) counts[pool[i % pool.length]]++;
  // Apply the ease skew to a REPRESENTATIVE colour (Pmatch is colour-symmetric).
  const skew = Math.max(0, lvl.colorSkew || 0);
  if (skew > 0 && pool.length >= 2) {
    let boost = Math.round((N / active.length) * skew);
    const dom = pool[0], donors = pool.slice(1);
    let i = 0, guard = 0;
    while (boost > 0 && guard++ < 10000) {
      const d = donors[i++ % donors.length];
      if (counts[d] > 3) { counts[d]--; counts[dom]++; boost--; }
      if (donors.every(x => counts[x] <= 3)) break;
    }
  }
  return counts;
}

function matchProbability(counts) {
  const vals = Object.values(counts).filter(k => k > 0);
  const N = vals.reduce((a, b) => a + b, 0);
  if (N < 2) return 1;
  let s = 0; for (const k of vals) s += (k / N) * ((k - 1) / (N - 1));
  return s || (1 / Math.max(1, vals.length));
}

// Cards on the TOP board (the cells `colorCounts` governs).
function topBoardCells(lvl) { return lvl.cols * lvl.rows - (lvl.disabled || []).length; }

function computeTurnsModel(lvl) {
  const cards = activeCardCount(lvl);
  const N = cards.total;
  const top = topBoardCells(lvl);
  const dist = estimateColorDistribution(lvl, top);
  const pm = matchProbability(dist);
  const ceff = 1 / pm;
  const rev = revealedObstacleCells(lvl);
  const be = backEffectReveals(lvl);

  const bare = N * (TURN_MODEL.A + TURN_MODEL.B * ceff);
  const assist = {
    danger:  TURN_MODEL.DANGER_FRAC * N,
    backfx:  TURN_MODEL.REVEAL_CREDIT * be.reveals,
    powerup: TURN_MODEL.REVEAL_CREDIT * TURN_MODEL.POWERUP_REVEALS,
    faceup:  TURN_MODEL.REVEAL_CREDIT * rev.total,
  };
  assist.total = assist.danger + assist.backfx + assist.powerup + assist.faceup;
  const need = Math.max(1, bare - assist.total);
  const turns = lvl.turns || 0;
  const margin = need > 0 ? turns / need : 0;
  let tier, tierClass;
  if (margin < TURN_MODEL.TIER.bad)         { tier = 'Too Hard'; tierClass = 'tier-bad'; }
  else if (margin < TURN_MODEL.TIER.hard)   { tier = 'Hard';     tierClass = 'tier-hard'; }
  else if (margin < TURN_MODEL.TIER.normal) { tier = 'Normal';   tierClass = 'tier-normal'; }
  else                                      { tier = 'Easy';     tierClass = 'tier-easy'; }
  return { cards, N, top, dist, pm, ceff, rev, be, bare, assist, need, turns, margin, tier, tierClass };
}

// Convenience: the tier of a level, or null if the level is missing/invalid.
// `hard` is true for the two hardest tiers (Hard / Too Hard) — what the home
// Play button uses to switch to its purple "hard" styling.
function levelDifficulty(lvl) {
  if (!lvl || !lvl.cols || !lvl.rows) return null;
  const m = computeTurnsModel(lvl);
  return { tier: m.tier, tierClass: m.tierClass, margin: m.margin, hard: m.tier === 'Hard' || m.tier === 'Too Hard' };
}
