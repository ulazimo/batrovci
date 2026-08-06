// ============================================================
// INVENTORY SCREEN — the doc's Rocks tab
//
// Layout follows "Inventory Rock Screen Reference.jpg": tabs across the top,
// Rock Deck above, Rock Collection below.
//
// The doc's specifics, all honoured here:
//   · three decks, switched from the TOP RIGHT of the Rock Deck area
//   · eight slots you swap with rocks from the Collection
//   · the type distribution bar over the deck, fixed Red-Blue-Orange-Grey order
//   · Basic Rock sits at the END of the collection list
//   · special rocks have durability and are repaired by Polishing with Coins
//
// One deliberate departure: the doc's Collection is a single horizontal strip
// with the leftmost rock focused, and that was built first. Nineteen specials in
// one row read as a queue you page through rather than a set you own part of, so
// it is now a wrapping grid. Focus follows the tap instead of the scroll
// position, which is also the only reading that survives multiple rows.
//
// Placing works slot-first: tap a deck slot to arm it, then tap a collection
// rock to drop it in. Tapping an armed slot again clears it back to Basic.
// ============================================================

let invSelectedSlot = 0;
let invFocusedRock = null;

function initInventoryScreen() {
  enableDragScroll(document.getElementById('collection-grid'));
}

function openInventory() {
  invSelectedSlot = 0;
  invFocusedRock = invFocusedRock || ROCK_CATALOGUE[0].id;
  showScreen('inventory-screen');
  refreshInventoryScreen();
}

function refreshInventoryScreen() {
  document.getElementById('inv-coins').textContent = inventory.coins.toLocaleString();
  buildDeckSwitch();
  buildTypeBar();
  buildDeckSlotsUI();
  buildCollection();
  buildRockDetail();
}

// ---- Deck switcher, top right of the deck area ----
function buildDeckSwitch() {
  const el = document.getElementById('deck-switch');
  el.innerHTML = '';
  for (let i = 0; i < DECK_COUNT; i++) {
    const b = document.createElement('button');
    b.className = 'deck-switch-btn' + (i === inventory.activeDeck ? ' active' : '');
    b.textContent = i + 1;
    b.addEventListener('click', () => {
      setActiveDeck(i);
      invSelectedSlot = 0;
      refreshInventoryScreen();
    });
    el.appendChild(b);
  }
}

// ---- Type distribution bar ----
function buildTypeBar() {
  const el = document.getElementById('type-bar');
  const dist = deckTypeDistribution(inventory.activeDeck);
  el.innerHTML = '';
  for (const d of dist) {
    if (!d.count) continue;
    const seg = document.createElement('span');
    seg.className = 'type-seg';
    seg.style.flexGrow = d.count;
    seg.style.background = d.color;
    seg.title = `${d.count} ${d.type}`;
    el.appendChild(seg);
  }
}

// ---- The eight deck slots ----
function buildDeckSlotsUI() {
  const el = document.getElementById('deck-slots');
  const deck = inventory.decks[inventory.activeDeck];
  el.innerHTML = '';

  deck.forEach((id, i) => {
    const def = rockById(id);
    const worn = id !== 'basic' && durabilityOf(id) <= 0;
    const b = document.createElement('button');
    b.className = 'deck-slot' + (i === invSelectedSlot ? ' selected' : '') + (worn ? ' worn' : '');
    b.style.setProperty('--rock-type', TYPE_COLORS[def.type]);
    b.innerHTML = `
      ${effectBadge(def, "slot-glyph")}
      <span class="slot-name">${shortName(def)}</span>
      ${id === 'basic' ? '' : `<span class="slot-dur">${durabilityOf(id)}/${def.maxDurability}</span>`}
    `;
    b.addEventListener('click', () => {
      if (invSelectedSlot === i && id !== 'basic') {
        clearDeckSlot(inventory.activeDeck, i);   // second tap empties it
      } else {
        invSelectedSlot = i;
      }
      refreshInventoryScreen();
    });
    el.appendChild(b);
  });

  const sel = rockById(deck[invSelectedSlot]);
  document.getElementById('deck-hint').textContent =
    `Slot ${invSelectedSlot + 1}: ${sel.name} — tap a rock below to swap`;
}

// ---- The collection grid ----
function buildCollection() {
  const el = document.getElementById('collection-grid');
  const list = catalogueForCollection();
  // Every tap rebuilds the grid, and innerHTML resets scrollTop — so tapping a
  // rock on the third row used to throw the view back to the top.
  const keepScroll = el.scrollTop;
  el.innerHTML = '';

  let ownedCount = 0;
  for (const def of list) {
    const owned = ownsRock(def.id);
    if (owned && def.id !== 'basic') ownedCount++;
    const card = document.createElement('button');
    card.className = 'coll-card' + (owned ? '' : ' unowned') +
                     (def.id === invFocusedRock ? ' focused' : '');
    card.dataset.rock = def.id;
    card.style.setProperty('--rock-type', TYPE_COLORS[def.type]);
    card.innerHTML = `
      ${effectBadge(def, "coll-glyph")}
      <span class="coll-name">${shortName(def)}</span>
      <span class="coll-type">${def.type}</span>
      ${owned ? '' : '<span class="coll-lock">🔒</span>'}
    `;
    card.addEventListener('click', () => {
      invFocusedRock = def.id;
      if (owned) setDeckSlot(inventory.activeDeck, invSelectedSlot, def.id);
      refreshInventoryScreen();
    });
    el.appendChild(card);
  }

  el.scrollTop = keepScroll;

  const specials = list.filter(d => d.id !== 'basic').length;
  document.getElementById('collection-count').textContent = `${ownedCount}/${specials} owned`;
}

// ---- Detail panel for the focused rock ----
function buildRockDetail() {
  const el = document.getElementById('rock-detail');
  const def = rockById(invFocusedRock);
  const owned = ownsRock(def.id);
  const dur = durabilityOf(def.id);
  const cost = polishCost(def.id);

  const stat = (label, key) => {
    const lvl = def[key];
    const pips = Array.from({ length: 5 }, (_, i) =>
      `<span class="pip${i < lvl ? ' on' : ''}"></span>`).join('');
    return `<div class="stat-row"><span class="stat-label">${label}</span>
            <span class="stat-pips">${pips}</span></div>`;
  };

  el.innerHTML = `
    <div class="detail-head" style="--rock-type:${TYPE_COLORS[def.type]}">
      ${effectBadge(def, "detail-glyph")}
      <div class="detail-title">
        <div class="detail-name">${def.name}</div>
        <div class="detail-type">${def.type}</div>
      </div>
      ${def.id === 'basic' ? '<span class="detail-dur">∞</span>'
        : owned ? `<span class="detail-dur${dur <= 0 ? ' out' : ''}">${dur}/${def.maxDurability}</span>`
        : `<span class="detail-price">◉ ${def.price.toLocaleString()}</span>`}
    </div>
    <div class="detail-blurb">${def.blurb || ''}</div>
    <div class="detail-stats">
      ${stat('Power', 'power')}${stat('Accuracy', 'accuracy')}
      ${stat('Curl', 'curl')}${stat('Trajectory', 'trajectory')}
    </div>
    ${owned && def.id !== 'basic' && cost > 0
      ? `<button class="polish-btn" id="polish-btn"${inventory.coins < cost ? ' disabled' : ''}>
           Polish · ◉ ${cost.toLocaleString()}</button>`
      : ''}
    ${!owned ? '<div class="detail-locked">Buy this rock in the Shop</div>' : ''}
  `;

  const pb = document.getElementById('polish-btn');
  if (pb) {
    pb.addEventListener('click', () => {
      const r = polishRock(def.id);
      if (r.ok) refreshInventoryScreen();
    });
  }
}

// Catalogue names carry "Rock" and a level; the tiles are too small for both.
function shortName(def) {
  return def.name.replace(' Rock', '').replace('Rock', '').trim() || 'Basic';
}
