// ============================================================
// SHOP — spend coins on power-ups (bought in batches) and bombs (which may be
// bought OVER their normal capacity — that's the selling point).
// Split from the former gameplay.js monolith; shares one global namespace.
// Loaded after home-room.js, before boot.js. No load-time code — all call-time,
// so load order past its dependencies (BOOSTERS, progress, save*) doesn't matter.
// ============================================================

// Coin price PER UNIT. Batches multiply this (with a bulk discount, below).
const SHOP_PRICES = {
  peek: 10,
  random3: 20,
  pluscolor: 30,
  babybomb: 40,
  bigbomb: 80,
};

// What the shop sells, and the batch sizes offered per group.
const SHOP_POWERUPS = ['peek', 'random3', 'pluscolor'];
const SHOP_BOMBS = ['babybomb', 'bigbomb'];
const SHOP_POWERUP_BATCHES = [1, 5, 10];
const SHOP_BOMB_BATCHES = [1, 3, 5];

// Bulk discount: bigger batches are cheaper per unit, so buying in batches pays off.
function batchDiscount(qty) {
  if (qty >= 10) return 0.20;
  if (qty >= 5) return 0.10;
  return 0;
}
function batchCost(id, qty) {
  const unit = SHOP_PRICES[id] || 0;
  return Math.max(0, Math.round(unit * qty * (1 - batchDiscount(qty))));
}

// Effective owned count. In-memory `boosterCounts` is the working inventory, but
// on the home screen (before initBoosters runs) it can be empty — fall back to the
// booster's configured default, matching what initBoosters would grant. Disabled
// boosters own 0 (same rule as initBoosters).
function shopOwned(id) {
  if (boosterCounts[id] !== undefined) return boosterCounts[id];
  const s = (typeof getBoosterSetting === 'function') ? getBoosterSetting(id) : null;
  if (!s || !s.enabled) return 0;
  return s.qty;
}

// Keep every coin readout in sync (shop, home HUD, in-game banner).
function updateShopCoinDisplays() {
  const c = progress.coins || 0;
  ['shop-coin-count', 'room-coins', 'coin-count'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = c;
  });
}

function openShop() {
  renderShop();
  updateShopCoinDisplays();
  document.getElementById('shop-screen').classList.add('active');
}
function closeShop() {
  document.getElementById('shop-screen').classList.remove('active');
}

// One purchasable row: icon, name, owned/capacity pill, and a batch button per size.
function shopItemHTML(id, batches, coins) {
  const b = (typeof BOOSTERS !== 'undefined') ? BOOSTERS.find(x => x.id === id) : null;
  if (!b) return '';
  const owned = shopOwned(id);
  const max = getBoosterMax(id);
  const capped = Number.isFinite(max);
  // Uncapped power-ups just show how many you own. Bombs show a capacity pill —
  // green under the cap, RED once reached/exceeded (you can still buy past it).
  const ownedHTML = capped
    ? `<span class="shop-owned cap${owned >= max ? ' maxed' : ''}">${owned}/${max}</span>`
    : `<span class="shop-owned">Owned ${owned}</span>`;

  const buys = batches.map(qty => {
    const cost = batchCost(id, qty);
    const save = Math.round(batchDiscount(qty) * 100);
    const afford = coins >= cost;
    return `<div class="shop-buy${afford ? '' : ' disabled'}" data-qty="${qty}"` +
      `${afford ? ` onclick="buyBooster('${id}',${qty})"` : ''}>` +
      `<span class="shop-buy-qty">×${qty}</span>` +
      `<span class="shop-buy-cost"><img src="icons/coin_icon.png" class="coin-icon" alt="">${cost}</span>` +
      `<span class="shop-buy-save">${save ? 'save ' + save + '%' : '&nbsp;'}</span>` +
      `</div>`;
  }).join('');

  return `<div class="shop-item${capped ? ' bomb' : ''}" data-booster="${id}">` +
    `<div class="shop-item-icon">${b.icon}</div>` +
    `<div class="shop-item-main">` +
    `<div class="shop-item-top"><span class="shop-item-name">${b.name}</span>${ownedHTML}</div>` +
    `<div class="shop-batches">${buys}</div>` +
    `</div></div>`;
}

function renderShop() {
  const list = document.getElementById('shop-list');
  if (!list) return;
  const coins = progress.coins || 0;
  let html = '';

  html += `<div class="shop-section-title">Power-Ups</div>`;
  SHOP_POWERUPS.forEach(id => { html += shopItemHTML(id, SHOP_POWERUP_BATCHES, coins); });

  html += `<div class="shop-section-title">Bombs</div>`;
  html += `<div class="shop-section-note">⚡ Stock up past the cap — bombs bought here ignore the limit!</div>`;
  SHOP_BOMBS.forEach(id => { html += shopItemHTML(id, SHOP_BOMB_BATCHES, coins); });

  list.innerHTML = html;
}

function buyBooster(id, qty) {
  const cost = batchCost(id, qty);
  if ((progress.coins || 0) < cost) return;   // can't afford (buttons are disabled too)

  // Materialize every booster's effective count first. saveBoosterCounts() writes
  // boosterCounts[b.id]||0 for ALL boosters, so an undefined entry (common on the
  // home screen, where initBoosters hasn't run) would otherwise be persisted as 0
  // and wipe the player's default stock.
  if (typeof BOOSTERS !== 'undefined') {
    BOOSTERS.forEach(b => { if (boosterCounts[b.id] === undefined) boosterCounts[b.id] = shopOwned(b.id); });
  }

  progress.coins = (progress.coins || 0) - cost;
  boosterCounts[id] = (boosterCounts[id] || 0) + qty;   // bombs may now exceed their cap — intended

  // Persist through every read path: progress.boosterCounts (initBoosters reads it),
  // the per-journey snapshot (a fresh boot restores from it), and progress itself.
  if (typeof saveBoosterCounts === 'function') saveBoosterCounts();
  if (typeof saveJourneySnapshot === 'function') saveJourneySnapshot();
  if (typeof saveProgress === 'function') saveProgress();

  if (typeof SFX !== 'undefined' && SFX.ding) SFX.ding(0);
  // Spend animation: chips scatter out of the shop's coin pill (cap the count).
  const pill = document.querySelector('#shop-screen .shop-coins');
  if (pill && typeof burstCoinsDown === 'function') burstCoinsDown(Math.min(cost, 12), pill);

  updateShopCoinDisplays();
  renderShop();
  if (typeof updateBoosterUI === 'function') updateBoosterUI();

  // Pulse the button that was clicked (renderShop just rebuilt the DOM).
  const fresh = document.querySelector(`#shop-list .shop-item[data-booster="${id}"] .shop-buy[data-qty="${qty}"]`);
  if (fresh) { fresh.classList.add('bought'); fresh.addEventListener('animationend', () => fresh.classList.remove('bought'), { once: true }); }
}
