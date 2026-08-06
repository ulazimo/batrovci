// ============================================================
// DECK HUD — the in-game Deck button and rock picker
//
// From the doc: "At the start of each Shoot, the next Rock in the Deck will be
// automatically selected, but the User can click on the Deck button in the
// bottom right corner, to use another from the Deck if he sees it is more
// useful for the current shot."
//
// So the button shows what is loaded right now, and opening it lets the player
// swap to any rock they have not yet thrown this end. Only available while a
// shot is armed and not yet released — once the rock is sliding, the choice is
// made.
// ============================================================

let deckBtnEl, deckPickerEl, deckListEl;

function initDeckHud() {
  deckBtnEl = document.getElementById('btn-deck');
  deckPickerEl = document.getElementById('deck-picker');
  deckListEl = document.getElementById('deck-picker-list');

  deckBtnEl.addEventListener('click', () => toggleDeckPicker());
  document.getElementById('deck-picker-close').addEventListener('click', () => toggleDeckPicker(false));
  // Tapping the dimmed backdrop closes it, which is what every mobile player
  // will try first.
  deckPickerEl.addEventListener('click', (e) => {
    if (e.target === deckPickerEl) toggleDeckPicker(false);
  });
}

function canOpenDeck() {
  return match.phase === 'playing' && shot.enabled && shot.phase === 'idle';
}

function toggleDeckPicker(force) {
  const open = force === undefined ? !deckPickerEl.classList.contains('show') : force;
  if (open && !canOpenDeck()) return;
  deckPickerEl.classList.toggle('show', open);
  if (open) buildDeckPicker();
}

// The button face carries the loaded rock's type colour and effect glyph, so
// the player can see what is about to be thrown without opening anything.
function refreshDeckHud() {
  if (!deckBtnEl) return;
  const show = match.phase === 'playing';
  deckBtnEl.classList.toggle('ready', show && canOpenDeck());

  const slots = match.decks[match.turn] || [];
  const idx = match.pending[match.turn];
  const def = slots[idx] ? slots[idx].def : BASIC_ROCK;
  const left = slots.filter(s => !s.used).length;

  deckBtnEl.style.setProperty('--rock-type', TYPE_COLORS[def.type]);
  const glyph = deckBtnEl.querySelector('.deck-btn-glyph');
  const style = effectIconStyle(def.effect || 'basic');
  glyph.classList.toggle('has-icon', !!style);
  glyph.style.cssText = style || '';
  glyph.textContent = style ? '' : effectGlyph(def);
  deckBtnEl.querySelector('.deck-btn-count').textContent = left;
  deckBtnEl.title = def.name;
}

function buildDeckPicker() {
  const slots = match.decks[match.turn] || [];
  const current = match.pending[match.turn];
  deckListEl.innerHTML = '';

  document.getElementById('deck-picker-team').textContent = match.names[match.turn];
  document.getElementById('deck-picker-team').className = 'deck-picker-team ' + match.turn;

  slots.forEach((slot, i) => {
    const def = slot.def;
    const el = document.createElement('button');
    el.className = 'deck-card' + (slot.used ? ' used' : '') + (i === current ? ' current' : '');
    el.style.setProperty('--rock-type', TYPE_COLORS[def.type]);
    el.innerHTML = `
      ${effectBadge(def, "deck-card-glyph")}
      <span class="deck-card-name">${def.name}</span>
      <span class="deck-card-type">${slot.used ? 'thrown' : def.type}</span>
    `;
    if (!slot.used) {
      el.addEventListener('click', () => {
        if (!choosePendingSlot(match.turn, i)) return;
        // Re-arm the waiting rock with the newly chosen definition. Swapping the
        // def on the existing rock would leave stale mass and effect state, so
        // the rock is rebuilt.
        swapArmedRock(def);
        toggleDeckPicker(false);
        refreshDeckHud();
      });
    }
    deckListEl.appendChild(el);
  });
}

// Replace the armed rock with one built from a different definition.
function swapArmedRock(def) {
  const old = shot.rock;
  if (!old) return;
  const i = rocks.indexOf(old);
  if (i !== -1) rocks.splice(i, 1);
  const rock = createRock(match.turn, def, 0, SHOOT_Y);
  rocks.push(rock);
  armShot(rock);
}

// Markup for a rock's effect badge: the generated icon if the sheet loaded,
// otherwise the text glyph. Every UI surface goes through this so the fallback
// is consistent and there is one place to change it.
function effectBadge(def, cls) {
  const style = effectIconStyle(def.effect || 'basic');
  if (style) return `<span class="${cls} has-icon" style="${style}"></span>`;
  return `<span class="${cls}">${effectGlyph(def)}</span>`;
}

// A one-character stand-in for each effect, used until the icon sheet loads and
// as the permanent fallback if it is missing. Chosen to be legible at button size.
function effectGlyph(def) {
  switch (def.effect) {
    case 'wall':      return '▭';
    case 'ricochet':  return '»';
    case 'curve':     return '↝';
    case 'power':     return '✹';
    case 'heavy':     return '⬤';
    case 'speedZone': return '⇈';
    case 'slowZone':  return '⁘';
    case 'magnet':    return '◎';
    case 'pulse':     return '◉';
    case 'freeze':    return '❄';
    case 'fire':      return '≈';
    default:          return '○';
  }
}

// Level suffix for display, derived from the id rather than stored twice.
function effectLevelLabel(def) {
  const m = /-(\d)$/.exec(def.id);
  return m ? ' ' + 'I'.repeat(+m[1]).replace('III', 'III') : '';
}
