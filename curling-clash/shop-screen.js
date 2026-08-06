// ============================================================
// SHOP SCREEN
//
// "Special Rocks are available to be bought in the Shop, let's say with soft
// currency for the start." Hard currency and earning mechanisms are explicitly
// future work, so this is deliberately one grid and one currency.
//
// Owned rocks stay listed rather than disappearing — the shop doubles as the
// catalogue, and a player wants to see what the set contains before they can
// afford it.
// ============================================================

function initShopScreen() {
  // The grid itself is rebuilt on open so prices and affordability always
  // reflect the current purse; only the gesture is bound once.
  enableDragScroll(document.getElementById('shop-grid'));
}

function openShop() {
  showScreen('shop-screen');
  refreshShopScreen();
}

function refreshShopScreen() {
  document.getElementById('shop-coins').textContent = inventory.coins.toLocaleString();
  const grid = document.getElementById('shop-grid');
  // Buying rebuilds the whole grid; without this you are returned to the top of
  // the list every purchase, which is worst exactly where the dear rocks are.
  const keepScroll = grid.scrollTop;
  grid.innerHTML = '';

  for (const def of ROCK_CATALOGUE) {
    if (def.id === 'basic') continue;          // Basic is not for sale
    const owned = ownsRock(def.id);
    const afford = inventory.coins >= def.price;

    const card = document.createElement('div');
    card.className = 'shop-card' + (owned ? ' owned' : '');
    card.style.setProperty('--rock-type', TYPE_COLORS[def.type]);
    card.innerHTML = `
      <div class="shop-card-top">
        ${effectBadge(def, "shop-glyph")}
        <span class="shop-type">${def.type}</span>
      </div>
      <div class="shop-name">${def.name}</div>
      <div class="shop-blurb-sm">${def.blurb || ''}</div>
      <button class="shop-buy${owned ? ' is-owned' : ''}"
              ${owned || !afford ? 'disabled' : ''}>
        ${owned ? 'Owned' : `◉ ${def.price.toLocaleString()}`}
      </button>
    `;
    if (!owned) {
      card.querySelector('.shop-buy').addEventListener('click', () => {
        const r = buyRock(def.id);
        if (r.ok) {
          refreshShopScreen();
          flashShopMessage(`${def.name} purchased`);
        } else {
          flashShopMessage(r.reason);
        }
      });
    }
    grid.appendChild(card);
  }
  grid.scrollTop = keepScroll;
}

let shopMsgTimer = null;
function flashShopMessage(text) {
  let el = document.getElementById('shop-msg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'shop-msg';
    document.getElementById('shop-screen').appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(shopMsgTimer);
  shopMsgTimer = setTimeout(() => el.classList.remove('show'), 1600);
}
