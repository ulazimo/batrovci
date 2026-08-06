// ============================================================
// DRAG SCROLL — swipe a list with a pointer, with a flick that carries
//
// The meta screens are lists of tappable cards inside a scroller. Touch already
// scrolls them natively, but two things were missing:
//
//   · on a mouse there is no swipe at all — you had to find the scrollbar
//   · a flick stopped dead where your finger left, which reads as a drag, not a
//     swipe, and makes a twenty-rock collection feel much longer than it is
//
// So this drives scrollTop itself: press, follow the pointer, then coast on
// release at the speed the pointer was moving.
//
// The part that actually matters is the click suppression. Every card here is a
// button that swaps a deck slot or spends coins, and without it a swipe that
// ends over a card also buys the rock. Past a few pixels of travel the gesture
// is a scroll, and the click that the browser fires afterwards is swallowed.
// ============================================================

// Below this the gesture is a tap, above it a scroll. Four pixels is about the
// wobble of a thumb pressing a button; it is not enough travel to be a swipe.
const DRAG_SLOP = 4;

// Coasting. `DRAG_DECAY` is per 16 ms frame, so ~0.94 loses half the speed in
// roughly ten frames — long enough to feel like momentum, short enough that the
// list never runs away from a small flick.
const DRAG_DECAY = 0.94;
const DRAG_MIN_V = 0.06;          // px/ms; below this the coast is over

function enableDragScroll(el, axis) {
  if (!el || el.dataset.dragScroll) return;
  el.dataset.dragScroll = '1';

  const vertical = axis !== 'x';
  const pos = () => (vertical ? el.scrollTop : el.scrollLeft);
  const setPos = (v) => { if (vertical) el.scrollTop = v; else el.scrollLeft = v; };

  let dragging = false;
  let moved = false;
  let start = 0;             // pointer coordinate at press
  let startScroll = 0;
  let last = 0;              // pointer coordinate at the previous move
  let lastT = 0;
  let velocity = 0;          // px/ms, signed in pointer space
  let coast = 0;

  const coordOf = (e) => (vertical ? e.clientY : e.clientX);

  el.addEventListener('pointerdown', (e) => {
    // Let the scrollbar, and anything with its own drag, keep their behaviour.
    if (e.button !== 0) return;
    cancelAnimationFrame(coast);
    dragging = true;
    moved = false;
    start = last = coordOf(e);
    lastT = e.timeStamp;
    startScroll = pos();
    velocity = 0;
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const c = coordOf(e);
    const travel = c - start;
    if (!moved && Math.abs(travel) > DRAG_SLOP) {
      moved = true;
      // Taking the pointer means the browser stops sending it to the card under
      // the finger, so a card cannot end up in a stuck :active state.
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
    }
    if (!moved) return;

    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (c - last) / dt;
    last = c;
    lastT = e.timeStamp;
    setPos(startScroll - travel);
  });

  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging');
    if (el.hasPointerCapture && e.pointerId !== undefined && el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    if (!moved) return;

    // A pointer that stopped before lifting should not coast, so only a flick
    // still moving at release carries.
    if (e.timeStamp - lastT > 90) velocity = 0;
    let v = velocity;
    const step = () => {
      v *= DRAG_DECAY;
      if (Math.abs(v) < DRAG_MIN_V) return;
      const before = pos();
      setPos(before - v * 16);
      if (pos() === before) return;                  // hit an end
      coast = requestAnimationFrame(step);
    };
    if (Math.abs(v) >= DRAG_MIN_V) coast = requestAnimationFrame(step);
  };

  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  // The click arrives after pointerup, so `moved` is still set and the tap that
  // ended a swipe never reaches the card.
  el.addEventListener('click', (e) => {
    if (!moved) return;
    e.stopPropagation();
    e.preventDefault();
    moved = false;
  }, true);
}
