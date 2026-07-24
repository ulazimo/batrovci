// ============================================================
// SHARED STATE & DOM REFS — loads first
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

// Capture original defaults before any progression swap
const LEVELS_DEFAULT = LEVELS;
const PROGRESSION_UNLOCK_DEFAULTS = { ...PROGRESSION_UNLOCK_LEVELS };
const REWARDS_DEFAULT = DEFAULT_LEVEL_REWARDS;

let COLS, ROWS, TOTAL, ACTIVE_COLORS, MAX_TURNS, TARGET;
let currentLevelIndex = progress.highestUnlocked;

let board = [], score = 0, turns = 0;
let chainColor = null, chainColors = new Set(), chainCards = [], specialsUsed = [], lastSelectedIdx = -1;
let turnActive = false, inputLocked = false;
let shieldCharges = 0, echoCharges = 0, spotlightMode = false, activeBooster = null;
let lastRevealedCards = []; // accumulated cards seen since the last chain that cleared (for recall) — see resetRecall/addRecall
let pendingDangerReveal = []; // chain-3 danger tiles to flip up once the chain ends (chainDangerReveal rule)
let bombColorClearOverride = null; // colours a bomb cleared pre-refill — forces endTurn's colour clear despite the bomb's own refill
let remnantHintShown = false; // one-time per-level hint for Cleaning remnant collection
let deck = []; // Cleaning journey: finite refill pool (colors) drawn into cleared slots

let levelGoals = null;

const boardEl          = document.getElementById('board');
const boardContainerEl = document.getElementById('board-container');
const scoreEl          = document.getElementById('score-value');
const turnsEl          = document.getElementById('turns-value');
const targetEl         = document.getElementById('target-value');
const chainEl          = document.getElementById('chain-indicator');
const boosterBar       = document.getElementById('booster-bar');
const tooltipEl        = document.getElementById('tooltip');
const statusBadge      = document.getElementById('status-badge');
const colorPickerEl    = document.getElementById('color-picker');
