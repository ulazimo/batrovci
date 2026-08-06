// ============================================================
// INVENTORY — collection, decks, durability, coins
//
// The doc's rules, all enforced here rather than in the UI:
//   · Special rocks are UNIQUE — you own at most one of each type
//   · Basic Rocks are unlimited, up to the deck capacity of 8
//   · Three decks; you pick which one goes into a match
//   · Durability is spent when a special rock is USED in a match, and bought
//     back by Polishing with soft currency earned from victories
//
// Everything persists to one localStorage key. Basic Rocks are never stored as
// owned — they are infinite, so recording them would be noise.
// ============================================================

const DECK_SIZE = 8;
const DECK_COUNT = 3;
const INVENTORY_KEY = 'cc_inventory_v1';

const inventory = {
  owned: {},                 // rockId -> { durability }
  decks: [],                 // DECK_COUNT arrays of DECK_SIZE rock ids
  activeDeck: 0,
  coins: 0,
};

function emptyDeck() {
  return Array.from({ length: DECK_SIZE }, () => 'basic');
}

function defaultInventory() {
  return {
    owned: {},
    decks: Array.from({ length: DECK_COUNT }, emptyDeck),
    activeDeck: 0,
    // Enough to buy one cheap special immediately, so the Shop is not a dead
    // screen on a fresh install.
    coins: 1200,
  };
}

function loadInventory() {
  const d = defaultInventory();
  inventory.owned = d.owned;
  inventory.decks = d.decks;
  inventory.activeDeck = d.activeDeck;
  inventory.coins = d.coins;

  try {
    const raw = localStorage.getItem(INVENTORY_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);

    // Validate on the way in. A save written by an older catalogue can name
    // rocks that no longer exist, and a deck full of undefined would break the
    // match rather than just looking odd.
    if (s.owned && typeof s.owned === 'object') {
      for (const id in s.owned) {
        if (!ROCK_BY_ID[id] || id === 'basic') continue;
        const dur = s.owned[id] && s.owned[id].durability;
        inventory.owned[id] = { durability: clampDurability(id, dur) };
      }
    }
    if (Array.isArray(s.decks)) {
      for (let i = 0; i < DECK_COUNT; i++) {
        const src = Array.isArray(s.decks[i]) ? s.decks[i] : [];
        inventory.decks[i] = Array.from({ length: DECK_SIZE }, (_, j) => {
          const id = src[j];
          // A special that is no longer owned reverts to Basic rather than
          // silently granting a rock the player does not have.
          if (!id || !ROCK_BY_ID[id]) return 'basic';
          if (id !== 'basic' && !inventory.owned[id]) return 'basic';
          return id;
        });
      }
    }
    if (Number.isFinite(s.activeDeck)) {
      inventory.activeDeck = Math.max(0, Math.min(DECK_COUNT - 1, s.activeDeck | 0));
    }
    if (Number.isFinite(s.coins)) inventory.coins = Math.max(0, s.coins);
  } catch (e) {
    console.warn('Inventory load failed, starting fresh', e);
  }
  dedupeAllDecks();
}

function saveInventory() {
  try {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify({
      owned: inventory.owned,
      decks: inventory.decks,
      activeDeck: inventory.activeDeck,
      coins: inventory.coins,
    }));
  } catch (e) {
    console.warn('Inventory save failed', e);
  }
}

function resetInventory() {
  try { localStorage.removeItem(INVENTORY_KEY); } catch (e) {}
  loadInventory();
}

function clampDurability(id, v) {
  const max = rockById(id).maxDurability;
  if (!Number.isFinite(v)) return max;
  return Math.max(0, Math.min(max, v));
}

// ---------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------

function ownsRock(id) {
  return id === 'basic' || !!inventory.owned[id];
}

function durabilityOf(id) {
  if (id === 'basic') return Infinity;
  const o = inventory.owned[id];
  return o ? o.durability : 0;
}

// A worn-out special still sits in the deck — it just cannot be thrown until it
// is Polished, and falls back to Basic for that shot.
function isUsable(id) {
  return id === 'basic' || durabilityOf(id) > 0;
}

function buyRock(id) {
  const def = rockById(id);
  if (!def || id === 'basic') return { ok: false, reason: 'not for sale' };
  if (ownsRock(id)) return { ok: false, reason: 'already owned' };
  if (inventory.coins < def.price) return { ok: false, reason: 'not enough coins' };
  inventory.coins -= def.price;
  inventory.owned[id] = { durability: def.maxDurability };
  saveInventory();
  return { ok: true };
}

// Polishing scales with how worn the rock is, so topping up a nearly-full rock
// is cheap and rescuing a dead one costs real money.
function polishCost(id) {
  const def = rockById(id);
  if (!def || id === 'basic') return 0;
  const missing = def.maxDurability - durabilityOf(id);
  if (missing <= 0) return 0;
  return Math.max(1, Math.round(def.price * TUNE.polishCostFrac * missing / def.maxDurability));
}

function polishRock(id) {
  if (!ownsRock(id) || id === 'basic') return { ok: false, reason: 'not owned' };
  const cost = polishCost(id);
  if (cost <= 0) return { ok: false, reason: 'already polished' };
  if (inventory.coins < cost) return { ok: false, reason: 'not enough coins' };
  inventory.coins -= cost;
  inventory.owned[id].durability = rockById(id).maxDurability;
  saveInventory();
  return { ok: true, cost };
}

function awardCoins(n) {
  inventory.coins = Math.max(0, inventory.coins + Math.round(n));
  saveInventory();
}

// ---------------------------------------------------------------
// Decks
// ---------------------------------------------------------------

function activeDeckIds() {
  return inventory.decks[inventory.activeDeck].slice();
}

function setActiveDeck(i) {
  inventory.activeDeck = Math.max(0, Math.min(DECK_COUNT - 1, i | 0));
  saveInventory();
}

// Specials are unique, so placing one that is already in this deck has to move
// it rather than clone it — otherwise the deck could hold two of a rock the
// player owns one of.
function setDeckSlot(deckIndex, slot, rockId) {
  const deck = inventory.decks[deckIndex];
  if (!deck || slot < 0 || slot >= DECK_SIZE) return false;
  if (!ownsRock(rockId)) return false;

  if (rockId !== 'basic') {
    const existing = deck.indexOf(rockId);
    if (existing !== -1 && existing !== slot) {
      // Swap, so the deck stays full and nothing is duplicated.
      deck[existing] = deck[slot];
    }
  }
  deck[slot] = rockId;
  saveInventory();
  return true;
}

function clearDeckSlot(deckIndex, slot) {
  const deck = inventory.decks[deckIndex];
  if (!deck || slot < 0 || slot >= DECK_SIZE) return false;
  deck[slot] = 'basic';
  saveInventory();
  return true;
}

// Belt and braces after a load: strip any duplicate specials a hand-edited or
// stale save might contain.
function dedupeAllDecks() {
  for (const deck of inventory.decks) {
    const seen = new Set();
    for (let i = 0; i < deck.length; i++) {
      const id = deck[i];
      if (id === 'basic') continue;
      if (seen.has(id) || !ownsRock(id)) deck[i] = 'basic';
      else seen.add(id);
    }
  }
}

// The doc's distribution bar: counts per type, in the fixed Red-Blue-Orange-Grey
// order, proportional to how many of that type are in the deck.
function deckTypeDistribution(deckIndex) {
  const deck = inventory.decks[deckIndex] || [];
  const counts = {};
  for (const t of TYPE_BAR_ORDER) counts[t] = 0;
  for (const id of deck) counts[rockById(id).type]++;
  return TYPE_BAR_ORDER.map(t => ({ type: t, count: counts[t], color: TYPE_COLORS[t] }));
}

// ---------------------------------------------------------------
// Durability across a match
//
// The doc: "Durability will be consumed on the Rock when it has been used in the
// Match." Once per match per rock, not once per throw — so uses are collected
// and spent at the end.
// ---------------------------------------------------------------

let usedThisMatch = new Set();

function noteRockUsed(id) {
  if (id && id !== 'basic') usedThisMatch.add(id);
}

function beginMatchDurability() {
  usedThisMatch = new Set();
}

function settleMatchDurability() {
  let spent = 0;
  for (const id of usedThisMatch) {
    const o = inventory.owned[id];
    if (!o) continue;
    o.durability = Math.max(0, o.durability - 1);
    spent++;
  }
  usedThisMatch = new Set();
  if (spent) saveInventory();
  return spent;
}

loadInventory();
