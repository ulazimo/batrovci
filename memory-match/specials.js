// ============================================================
// SPECIAL CARD TYPES, LEVEL REWARDS & COMBO MAPPING
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

// ============================================================
// SPECIAL CARD TYPES — all available special abilities
// Add new types here; they auto-appear in combo mapping UI
// ============================================================
const SPECIAL_TYPES = [
  { id: 'peek',      icon: '👁', name: 'Peek',      desc: 'Flash 2-3 nearby cards for 1.5s then hide',        power: 'low',    needsTap: false,
    offsets: [[-1,0],[1,0],[0,-1],[0,1]], revealCount: 3, temporary: true },
  { id: 'tint',      icon: '🎯', name: 'Tint',      desc: 'Add color hints to 3-4 nearby face-down cards',    power: 'low',    needsTap: false,
    offsets: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]], tintCount: 4, temporary: false },
  { id: 'spotlight', icon: '🔦', name: 'Spotlight', desc: 'Tap any face-down card to permanently reveal it',  power: 'medium', needsTap: true },
  { id: 'echo',      icon: '🔔', name: 'Echo',      desc: 'Next flipped card stays visible for 1 extra turn', power: 'medium', needsTap: false },
  { id: 'cross',     icon: '💣',  name: 'Baby Bomb',     desc: 'Reveal 4 adjacent cards',                          power: 'high',   needsTap: false,
    offsets: [[-1,0],[1,0],[0,-1],[0,1]] },
  { id: 'ring',      icon: '💥',  name: 'BIG Bomb',      desc: 'Reveal 8 surrounding cards',                       power: 'high',   needsTap: false,
    offsets: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]] },
  { id: 'diamond',   icon: '☢︎',  name: 'Nuke!',   desc: 'Reveal 12 cards in extended cross',                power: 'high',   needsTap: false,
    offsets: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1],[-2,0],[2,0],[0,-2],[0,2]] },
];

function getSpecialType(id) { return SPECIAL_TYPES.find(s => s.id === id); }

const SPECIAL_BADGE_IMAGES = {
  cross:   'icons/small_bomb.png',
  ring:    'icons/big_bomb.png',
  diamond: 'icons/nuke.png',
};
function specialBadgeImage(id) { return SPECIAL_BADGE_IMAGES[id] || null; }
initInventoryDefaults();

// ============================================================
// COMBO → SPECIAL MAPPING
// ============================================================
// ============================================================
// LEVEL REWARDS — DEFAULT_LEVEL_REWARDS loaded from progression_default.js
// ============================================================

function getLevelRewards() {
  return progress.levelRewards || DEFAULT_LEVEL_REWARDS;
}

function setLevelRewards(rewards) {
  progress.levelRewards = rewards;
  saveProgress();
}

// Bombs are power-ups now, and Wild is gone — migrate legacy special rewards to boosters.
const SPECIAL_REWARD_MIGRATION = { cross: 'babybomb', ring: 'bigbomb', diamond: 'bigbomb' };

function grantLevelRewards(levelId) {
  const rewards = getLevelRewards().filter(r => r.afterLevel === levelId);
  if (rewards.length === 0) return [];
  const granted = [];
  rewards.forEach(r => {
    const migrated = (r.type === 'special') && SPECIAL_REWARD_MIGRATION[r.specialId];
    if (migrated) {
      // Legacy bomb special reward → grant the equivalent bomb power-up (respecting its cap)
      const cap = getBoosterMax(migrated);
      boosterCounts[migrated] = Math.min(cap, (boosterCounts[migrated] || 0) + r.qty);
      const b = BOOSTERS.find(x => x.id === migrated);
      granted.push({ type: 'booster', boosterId: migrated, qty: r.qty, _icon: b ? b.icon : '💣', _name: b ? b.name : migrated });
    } else if ((r.type || 'booster') === 'special') {
      // Wild is retired — skip it; other specials still go to the deploy inventory
      if (r.specialId === 'wild') return;
      progress.specialInventory[r.specialId] = (progress.specialInventory[r.specialId] || 0) + r.qty;
      granted.push(r);
    } else {
      boosterCounts[r.boosterId] = (boosterCounts[r.boosterId] || 0) + r.qty;
      granted.push(r);
    }
  });
  saveBoosterCounts();
  saveProgress();
  return granted;
}

// ============================================================
// COMBO MAPPING
// ============================================================
const DEFAULT_COMBO_MAP = [
  { combo: 4,   specialId: 'wild' },
  { combo: 5,   specialId: 'cross' },
  { combo: '6+', specialId: 'ring' },
];

function getComboMapping() {
  return progress.comboMapping || DEFAULT_COMBO_MAP;
}

function setComboMapping(map) {
  progress.comboMapping = map;
  saveProgress();
}

// Min chain length that scores + clears. Default 2 (Match-2); Legacy Match-3 setting → 3.
function getMinCombo() { return getRule('legacyMatch3') ? 3 : 2; }

function getSpecialForCombo(comboLen) {
  const map = getComboMapping();
  // Check exact matches first, then find highest N+ rule that applies
  let exact = map.find(m => typeof m.combo === 'number' && m.combo === comboLen);
  if (exact) return exact.specialId;
  // Find all range rules (e.g. '6+') where comboLen qualifies
  let bestRange = null;
  map.forEach(m => {
    if (typeof m.combo === 'string' && m.combo.endsWith('+')) {
      const min = parseInt(m.combo);
      if (comboLen >= min) {
        if (!bestRange || min > parseInt(bestRange.combo)) bestRange = m;
      }
    }
  });
  return bestRange ? bestRange.specialId : null;
}
