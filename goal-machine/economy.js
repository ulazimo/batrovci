// economy.js — Goal Machine economy/config: pure data tables, tuning constants,
// and side-effect-free helpers. No DOM, no THREE, no game state (S). Shared by
// index.html (browser ES module import) and balance-sim.js (node, concatenated).

export const SUF = ['','K','M','B','T','Qa','Qi','Sx','Sp','Oc','No','Dc','Ud','Dd','Td','Qd','Qq','Sd','St','Od','Nd','Vg'];
export function fmt(n){
  if(!isFinite(n)) return '∞';
  if(n<1000) return n<10 && n%1!==0 ? n.toFixed(1) : Math.floor(n).toString();
  let t=0,m=n; while(m>=1000 && t<SUF.length-1){m/=1000;t++;}
  if(m>=1000) return n.toExponential(2).replace('e+','e');   // past the suffix table → clean scientific
  return (m<100?m.toFixed(2):m<1000?m.toFixed(1):Math.floor(m))+SUF[t];
}

// ---- Attribute definitions (all numbers only go up) ----
// cost(l): price to buy the (l+1)-th level.  val(l): effect at level l.
export const ATTR = [
  // ATTACK — equipment that multiplies your Strength/Dexterity skills ----
  {id:'multi',  cat:'dmg', ic:'⚽', nm:'Multi-Ball',     desc:'balls per shot',
    cost:l=>180*Math.pow(2.35,l),     val:l=>1+l,            show:v=>v+' ball'+(v>1?'s':'')},
  {id:'critC',  cat:'dmg', ic:'🎯', nm:'Crit Chance',    desc:'chance to crit',
    cost:l=>70*Math.pow(1.21,l),      val:l=>Math.min(0.9,0.03*l), show:v=>(v*100).toFixed(0)+'%'},
  {id:'critD',  cat:'dmg', ic:'🔥', nm:'Crit Damage',    desc:'crit multiplier',
    cost:l=>110*Math.pow(1.24,l),     val:l=>2+0.3*l,        show:v=>'×'+v.toFixed(1)},
  {id:'power2', cat:'dmg', ic:'🚀', nm:'Power Shot',     desc:'chance for a ×5 blast',
    cost:l=>320*Math.pow(1.27,l),     val:l=>Math.min(0.5,0.02*l), show:v=>(v*100).toFixed(0)+'%'},
  {id:'combo',  cat:'dmg', ic:'📈', nm:'Combo Mastery',  desc:'max streak bonus',
    cost:l=>260*Math.pow(1.25,l),     val:l=>0.10+0.04*l,    show:v=>'+'+(v*100).toFixed(0)+'%'},
  {id:'lucky',  cat:'dmg', ic:'🍀', nm:'Lucky Strike',   desc:'chance to shatter 4% of a target',
    cost:l=>520*Math.pow(1.32,l),     val:l=>Math.min(0.4,0.012*l), show:v=>(v*100).toFixed(0)+'%'},
  {id:'free',   cat:'dmg', ic:'🎆', nm:'Free Kick',      desc:'auto power-strike every 9s',
    cost:l=>900*Math.pow(1.30,l),     val:l=>l<1?0:8*(1+0.4*l), show:v=>v?'×'+fmt(v)+' pwr':'locked'},
  {id:'hype',   cat:'dmg', ic:'📣', nm:'Fan Hype',       desc:'global damage multiplier',
    cost:l=>240*Math.pow(1.17,l),     val:l=>1+0.03*l,       show:v=>'×'+v.toFixed(2)},
  // TARGETS --------------------------------------------------------------
  {id:'targets',cat:'board',ic:'🥅', nm:'Bigger Stage',   desc:'more stage HP & gold',
    cost:l=>l>=5?Infinity:600*Math.pow(7,l), val:l=>Math.min(6,1+l), show:v=>'×'+v+' HP'},
  {id:'tgtHP',  cat:'board',ic:'🧱', nm:'Tougher Stage',  desc:'stage HP — bigger = more gold',
    cost:l=>140*Math.pow(1.22,l),     val:l=>1+0.6*l,        show:v=>'×'+v.toFixed(2)+' HP'},
  {id:'auto',   cat:'board',ic:'🔁', nm:'Auto-Shoot',     desc:'auto-fires at the goal + offline income',
    cost:l=>l>=1?Infinity:450,        val:l=>l>0?1:0,        show:v=>v?'active':'click to shoot'},
  // MAGIC INFUSIONS — bought with Magic Points; potency scales with Magic Affinity. Arranged as a tree (see MAGIC_TREE).
  {id:'mana',   cat:'magic',cur:'mp',ic:'🔵', nm:'Mana Shot',     desc:'chance for a bonus magic shot (scales with Vitality)',
    cost:l=>l<1?2:Math.ceil(2*Math.pow(1.38,l-1)), val:l=>l<1?0:Math.min(0.8,0.08+0.04*(l-1)), show:v=>v?(v*100).toFixed(0)+'%':'locked'},
  {id:'fire',   cat:'magic',cur:'mp',ic:'🔥', nm:'Fireball',     desc:'chance to set a target ablaze',
    cost:l=>l<1?3:Math.ceil(3*Math.pow(1.4,l-1)),  val:l=>l<1?0:Math.min(0.6,0.05+0.03*(l-1)), show:v=>v?(v*100).toFixed(0)+'%':'locked'},
  {id:'curve',  cat:'magic',cur:'mp',ic:'🌀', nm:'Spectral Ball', desc:'chance to phase past the keeper',
    cost:l=>l<1?4:Math.ceil(4*Math.pow(1.4,l-1)),  val:l=>l<1?0:Math.min(0.75,0.10+0.04*(l-1)), show:v=>v?(v*100).toFixed(0)+'%':'locked'},
  {id:'cannon', cat:'magic',cur:'mp',ic:'💣', nm:'Cannonball',   desc:'chance to splash every target',
    cost:l=>l<1?6:Math.ceil(6*Math.pow(1.45,l-1)), val:l=>l<1?0:Math.min(0.5,0.04+0.025*(l-1)), show:v=>v?(v*100).toFixed(0)+'%':'locked'},
  {id:'frost',  cat:'magic',cur:'mp',ic:'❄️', nm:'Frostball',    desc:'chance to freeze the keeper',
    cost:l=>l<1?8:Math.ceil(8*Math.pow(1.45,l-1)), val:l=>l<1?0:Math.min(0.6,0.05+0.03*(l-1)), show:v=>v?(v*100).toFixed(0)+'%':'locked'},
  {id:'portal', cat:'magic',cur:'mp',ic:'🌌', nm:'Portal Ball',   desc:'chance to open a rift — dmg scales with UNSPENT Magic Points',
    cost:l=>l<1?12:Math.ceil(12*Math.pow(1.5,l-1)), val:l=>l<1?0:Math.min(0.45,0.05+0.025*(l-1)), show:v=>v?(v*100).toFixed(0)+'%':'locked'},
  // ECONOMY --------------------------------------------------------------
  {id:'cashG',  cat:'cash', ic:'💰', nm:'Cash Per Goal', desc:'stage-clear reward',
    cost:l=>55*Math.pow(1.15,l),      val:l=>1+0.18*l,       show:v=>'×'+v.toFixed(2)},
  {id:'coins',  cat:'cash', ic:'🪙', nm:'Loose Change',   desc:'cash per ball that lands',
    cost:l=>40*Math.pow(1.14,l),      val:l=>0.3*l,          show:v=>fmt(v)+'/hit'},
  {id:'gold',   cat:'cash', ic:'✨', nm:'Golden Ball',    desc:'chance for a ×10 cash ball',
    cost:l=>210*Math.pow(1.26,l),     val:l=>Math.min(0.3,0.01*l), show:v=>(v*100).toFixed(0)+'%'},
  {id:'sponsor',cat:'cash', ic:'🤝', nm:'Sponsor Deal',   desc:'passive cash every second',
    cost:l=>120*Math.pow(1.19,l),     val:l=>0.8*l, show:v=>fmt(v)+'/s'},
  {id:'offline',cat:'cash', ic:'😴', nm:'Offline Training',desc:'earnings while away',
    cost:l=>400*Math.pow(1.38,l),     val:l=>Math.min(0.9,0.10+0.035*l), show:v=>(v*100).toFixed(0)+'%'},
  {id:'over',   cat:'cash', ic:'⌛', nm:'Overtime Bonus',  desc:'extra reward for fast clears',
    cost:l=>300*Math.pow(1.28,l),     val:l=>0.25*l,         show:v=>'+'+(v*100).toFixed(0)+'% max'},
  // PITCH / UTILITY ------------------------------------------------------
  {id:'speed',  cat:'util', ic:'💨', nm:'Ball Speed',     desc:'faster balls, more impacts',
    cost:l=>90*Math.pow(1.20,l),      val:l=>1+0.02*l,       show:v=>'×'+v.toFixed(2)+' dmg'},
  {id:'stagger',cat:'util', ic:'🧤', nm:'Keeper Stagger',  desc:'rattle the keeper for more dmg',
    cost:l=>150*Math.pow(1.23,l),     val:l=>1+0.025*l,      show:v=>'×'+v.toFixed(2)+' dmg'},
  {id:'scout',  cat:'util', ic:'🔭', nm:'Scout Report',    desc:'lower target HP growth',
    cost:l=>700*Math.pow(1.34,l),     val:l=>Math.min(0.35,0.012*l), show:v=>'−'+(v*100).toFixed(0)+'% HP'},
  {id:'agent',  cat:'util', ic:'💼', nm:'Star Agent',      desc:'more Legacy on transfer',
    cost:l=>1200*Math.pow(1.40,l),    val:l=>1+0.08*l,       show:v=>'×'+v.toFixed(2)+' 🏆'},
];
export const AMAP = {}; ATTR.forEach(a=>AMAP[a.id]=a);
export const GROUPS = [['dmg','Attack'],['board','Stage'],['cash','Economy'],['util','Pitch']];
export const TIERS = [[1,'Sunday League'],[10,'Academy'],[25,'Semi-Pro'],[50,'Championship'],[100,'Pro Club'],[250,'International'],[500,'Legend']];
export function tierIndex(stage){ let i=0; for(let k=0;k<TIERS.length;k++) if(stage>=TIERS[k][0]) i=k; return i; }
export function tierName(stage){ return TIERS[tierIndex(stage)][1]; }

// ---- Skills (XP-leveled; OWN the core stats; you focus XP into one at a time) ----
// Listed in UNLOCK ORDER. Skills are gold-gated and revealed one at a time: you start with
// Concentration only and buy the right to train each next skill (cost rises sharply).
export const SKILLS = [
  {id:'con', ic:'🧠', nm:'Concentration', desc:'XP gain for the focused skill',     cost:0},
  {id:'str', ic:'💪', nm:'Strength',      desc:'shot damage',                       cost:50},
  {id:'dex', ic:'⚡', nm:'Dexterity',     desc:'fire rate',                         cost:300},
  {id:'acc', ic:'🎯', nm:'Accuracy',      desc:'chance to hit the target',          cost:1100},
  {id:'vit', ic:'💰', nm:'Vitality',      desc:'gold per target & passive income',  cost:9000},
  {id:'mag', ic:'🪄', nm:'Magic Affinity',desc:'Magic Points & infusion potency',   cost:50000},
];
export const SKMAP={}; SKILLS.forEach(s=>SKMAP[s.id]=s);
export function skXpNeed(l){ return 10*Math.pow(1.14,l); }

// ---- Quests: passive GOLD generators that unlock at skill thresholds (run in background) ----
// Gated by SKILL LEVELS (gates follow the skill-unlock order so each quest is the next milestone).
// Gold only — quests do NOT grant XP, so the focused skill is the only one that levels from play.
export const QUESTS = [
  {id:'q1', nm:'Local Friendly',   req:['con',4],  gold:2},
  {id:'q2', nm:'Cup Run',          req:['str',8],  gold:6},
  {id:'q3', nm:'Sponsor Tour',     req:['dex',14], gold:15},
  {id:'q4', nm:'League Wages',     req:['acc',20], gold:34},
  {id:'q5', nm:'Boot Endorsement', req:['vit',28], gold:75},
  {id:'q6', nm:'Champions Bonus',  req:['str',40], gold:170},
  {id:'q7', nm:'Global Icon',      req:['mag',30], gold:400},
];

// ---- Lifestyle: one-time purchases, permanent bonuses, kept through transfers ----
export const LIFESTYLE = [
  {id:'boots', ic:'👟', nm:'Golden Boots',    cost:1.2e3, b:{cash:.05}, blurb:'+5% cash'},
  {id:'car',   ic:'🏎️', nm:'Sports Car',       cost:5e4,   b:{cash:.10}, blurb:'+10% cash'},
  {id:'watch', ic:'⌚', nm:'Luxury Watch',     cost:4e5,   b:{dmg:.10},  blurb:'+10% damage'},
  {id:'house', ic:'🏠', nm:'Mansion',          cost:2e6,   b:{cash:.15}, blurb:'+15% cash'},
  {id:'yacht', ic:'🛥️', nm:'Yacht',            cost:8e7,   b:{dmg:.15},  blurb:'+15% damage'},
  {id:'island',ic:'🏝️', nm:'Private Island',   cost:1.5e9, b:{all:.15},  blurb:'+15% everything'},
  {id:'jet',   ic:'✈️', nm:'Private Jet',       cost:3e10,  b:{all:.20},  blurb:'+20% everything'},
  {id:'club',  ic:'🏟️', nm:'Buy the Club',     cost:1e12,  b:{all:.30},  blurb:'+30% everything'},
];
export const LMAP = {}; LIFESTYLE.forEach(it=>LMAP[it.id]=it);

// ---- Mastery: a definitive GDD-style milestone that coexists with prestige ----
export const MASTERY_LV = 75, MASTERY_LEGACY = 25;

// ---- Derived-stat tuning constants ----
export const SAVE_PROB = 0.5;   // chance a ball on a guarded target is saved
export const SAVE_FRAC = 0.12;  // approx share of shots the keeper saves (for analytics)
export const BURN_MULT = 1.5, BURN_TIME = 2.0;     // Fireball: total burn = ball dmg × MULT over TIME
export const CANNON_SPLASH = 0.5;                  // Cannonball: splash dmg to each other target
export const FROST_TIME = 2.5;                     // Frostball: keeper frozen for this long
export const MP_RATE = 0.05;                       // base Magic Points per second (×Magic Affinity)
export const PORTAL_K = 0.30;                      // Portal Ball: bonus dmg per UNSPENT Magic Point (infinite scaler)
// magic-archer model: you BUY target count & HP; Stage stays a global ×ramp.
export const TGT_BASE = 12, REWARD_C = 0.5;
export function stageScale(stage){ return Math.pow(1.33, stage-1); }     // global difficulty/reward ramp
