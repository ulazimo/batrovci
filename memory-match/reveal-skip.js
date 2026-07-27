// ============================================================
// SKIPPABLE REVEAL HOLDS — tap to hurry a reveal along
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================
//
// Every "look at these cards" beat has the same two-part shape: the cards flip up
// on a STAGGER, then sit face-up for a HOLD while the player memorises them, then
// they hide and play continues. Those holds are tuned for a first-time player and
// drag once you already know the board — so both beats are skippable by tapping:
//
//   tap during the stagger → every card still queued flips up immediately,
//                            then the player gets the full hold to look
//   tap during the hold    → the hold ends and play continues now
//
// A tap NEVER changes the outcome — the same `finish` callback runs, just sooner.
// Reveals route through runSkippableReveal() instead of raw setTimeout chains so
// there is exactly one place that owns this behaviour. Callers keep owning what a
// reveal *means* (what to flip, what to hide, what to unlock); this file only owns
// *when* those beats fire.

let activeReveal = null; // at most one reveal is ever in flight

// steps: [{ delay, fn }] — the staggered flip-ups (delays are ms from now).
// holdMs: how long the cards stay up after the LAST step lands.
// finish: hide + resume. Runs exactly once, whether by timer or by tap.
function runSkippableReveal(steps, holdMs, finish) {
  finishActiveReveal(); // never let two reveals overlap — resolve the old one first
  const r = { pending: [], holdTimer: null, holdMs, finish, done: false };
  activeReveal = r;
  steps.forEach(step => {
    const entry = { fn: step.fn, id: null };
    entry.id = setTimeout(() => {
      r.pending = r.pending.filter(x => x !== entry);
      step.fn();
      if (!r.pending.length) beginRevealHold(r);
    }, step.delay);
    r.pending.push(entry);
  });
  if (!r.pending.length) beginRevealHold(r); // no stagger (or none left) → hold now
}

function beginRevealHold(r) {
  if (r.done || r.holdTimer) return;
  r.holdTimer = setTimeout(() => resolveReveal(r), r.holdMs);
}

// End a reveal and run its finish. Guarded so a tap racing the timer can't double-run.
function resolveReveal(r) {
  if (!r || r.done) return;
  r.done = true;
  if (r.holdTimer) { clearTimeout(r.holdTimer); r.holdTimer = null; }
  r.pending.forEach(e => clearTimeout(e.id));
  r.pending = [];
  if (activeReveal === r) activeReveal = null; // cleared BEFORE finish, so a finish
  r.finish();                                  // that starts a new reveal is safe
}

// A reveal is on screen — board taps belong to the skip, not to flipping a card.
function isRevealing() { return !!activeReveal && !activeReveal.done; }

// Tap handler. Returns true if it consumed the tap.
function skipReveal() {
  const r = activeReveal;
  if (!r || r.done) return false;
  if (r.pending.length) {
    // Flush the rest of the stagger, then still give the player the hold to look.
    const pending = r.pending.slice();
    r.pending = [];
    pending.forEach(e => { clearTimeout(e.id); e.fn(); });
    beginRevealHold(r);
    return true;
  }
  resolveReveal(r); // already holding → end it now
  return true;
}

// Run a pending reveal to completion right now (so its finish unlocks input).
function finishActiveReveal() { resolveReveal(activeReveal); }

// Drop a pending reveal WITHOUT running its finish — for teardown (startGame), where
// the board is about to be rebuilt and the old callback would touch stale cards.
function discardActiveReveal() {
  const r = activeReveal;
  if (!r) return;
  r.done = true;
  if (r.holdTimer) clearTimeout(r.holdTimer);
  r.pending.forEach(e => clearTimeout(e.id));
  r.pending = [];
  activeReveal = null;
}
