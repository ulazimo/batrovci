// Headless balance simulation for Goal Machine (economy v2: skills + magic + quests).
// Loads the REAL economy + event loop from index.html (Three.js/DOM stubbed) and drives it
// with a simulated player: focuses XP into the lowest skill, buys best-ROI gear, grabs magic
// with Magic Points, taps SHOOT until Auto-Serve. Reports how progression actually paces.
//   run:  node balance-sim.js index.html
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(process.argv[2], 'utf8');

// ---- shared economy/config module: strip `export` so it concatenates into the runtime scope ----
const econ = fs.readFileSync(path.join(path.dirname(process.argv[2]), 'economy.js'), 'utf8').replace(/\bexport\s+/g, '');

// ---- extract the module script, strip imports (incl. the multi-line ./economy.js block) + 3D boot ----
let code = HTML.match(/<script type="module">\s*\nimport \* as THREE[\s\S]*?<\/script>/)[0]
  .replace(/^<script type="module">/, '').replace(/<\/script>$/, '');
code = code.replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/economy\.js';/, '');   // multi-line economy import
code = code.split('\n').filter(l => !/^\s*import .* from /.test(l)).join('\n');  // single-line THREE imports
code = code.replace(/setup3D\(\);\s*\n\s*resize\(\);\s*\n\s*window\.addEventListener\('load',resize\);/, '');
code = econ + '\n' + code;   // economy definitions first, then the runtime that consumes them

// ---- minimal stubs ----
const V = class { constructor(x,y,z){this.x=x||0;this.y=y||0;this.z=z||0;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} project(){this.x=0;this.y=0;return this;}
  normalize(){return this;} setScalar(){return this;} copy(){return this;} };
const THREE = { Vector3:V, Color:class{setHex(){return this;}}, Matrix4:class{makeScale(){return this;}compose(){return this;}},
  Quaternion:class{setFromAxisAngle(){return this;}},
  Raycaster:class{constructor(){this.ray={intersectPlane:()=>null};}setFromCamera(){}}, Plane:class{} };
const ctxStub = new Proxy({}, { get:()=> ()=>{} });
function el(){ return { style:{}, dataset:{}, classList:{add(){},remove(){},toggle(){},contains(){return false}},
  addEventListener(){}, appendChild(){}, querySelector(){return el();}, querySelectorAll(){return [];}, getContext(){return ctxStub;},
  getBoundingClientRect(){return {width:430,height:320};}, set innerHTML(v){}, set textContent(v){}, width:0,height:0, disabled:false }; }
const documentStub = { getElementById(){return el();}, createElement(){return el();}, addEventListener(){} };
const windowStub = { addEventListener(){}, devicePixelRatio:1 };

let API;
const fn = new Function('THREE','document','window','localStorage','performance','requestAnimationFrame','setInterval','GLTFLoader','DRACOLoader','__expose',
  code + '\n;__expose({get S(){return S}, setS:v=>{S=v}, newState, ATTR, AMAP, LIFESTYLE, LMAP, attr, lv, ' +
  'incomePerSec, analyticDPS, targetHP, targetReward, avgBallDmg, ballsPerSec, hitFrac, prestigeMult, legacyGain, ' +
  'stageScale, targetCount, cashPerHit, lifeMult, update, serve, spawnTargets, get serving(){return serving}, setServing:v=>{serving=v}, ' +
  'SKILLS, SKMAP, skUnlocked, unlockSkill, sl, skillDmg, skillRate, keeperSaveChance, vitMult, conMult, magMult, ensureSkills, grantXP, questGoldPerSec, QUESTS });');
fn(THREE, documentStub, windowStub, {getItem(){return null;},setItem(){}}, {now(){return 0;}}, ()=>{}, ()=>{}, function(){}, function(){}, a=>{API=a;});

const G = API;
const fmt = n => !isFinite(n) ? '∞' : Math.abs(n)<1000 ? (Math.round(n*10)/10).toString()
  : (()=>{const U=['','K','M','B','T','Qa','Qi','Sx','Sp','Oc','No','Dc','Ud','Dd','Td'];let t=0,m=n;while(m>=1000&&t<U.length-1){m/=1000;t++;}return (m<100?m.toFixed(1):Math.round(m))+U[t];})();
const S = () => G.S;

// ===== simulated-player policy =====
const PRIO = ['str','dex','acc','vit','con','mag'];
const UNLOCK_ORDER = ['str','dex','acc','vit','mag'];   // con is free at start
function buySkillUnlocks(){ // grab the next gold-gated skill the moment it's affordable
  for(const id of UNLOCK_ORDER){ if(!G.skUnlocked(id) && S().cash>=G.SKMAP[id].cost){ G.unlockSkill(id); } }
}
function lowestFocus(){ // balanced player: keep UNLOCKED skills roughly even (focus the lowest level)
  let best=null, bk=[1e9,9];
  for(const s of G.SKILLS){ if(!G.skUnlocked(s.id)) continue; const l=G.sl(s.id), k=[l, PRIO.indexOf(s.id)];
    if(k[0]<bk[0] || (k[0]===bk[0] && k[1]<bk[1])){ bk=k; best=s.id; } }
  if(best) S().focus=best;
}
const chooseFocus = lowestFocus;
function cashCost(id){ return G.AMAP[id].cost(G.lv(id)); }
function buyCashAndMagic(){
  // magic: buy any affordable infusion (Magic tab is gated behind the Magic Affinity skill)
  if(G.skUnlocked('mag')) for(const a of G.ATTR){ if(a.cur==='mp'){ const c=a.cost(G.lv(a.id)); if(isFinite(c)&&(S().mp||0)>=c){ S().mp-=c; S().magicLv[a.id]=(S().magicLv[a.id]||0)+1; } } }
  // gear (incl. auto-serve) lives in the Shop tab, gated behind the first paid skill (Strength)
  const shop = G.skUnlocked('str');
  if(shop && !(S().lv.auto) && S().cash>=G.AMAP.auto.cost(0)){ S().cash-=G.AMAP.auto.cost(0); S().lv.auto=1; }
  // gear + lifestyle: greedy best income-ROI, buy as many as affordable this tick
  for(let guard=0;shop && guard<80;guard++){
    const base=G.incomePerSec(); let best=null,roi=0;
    for(const a of G.ATTR){ if(a.cur==='mp'||a.id==='auto') continue; const c=cashCost(a.id); if(!isFinite(c)||S().cash<c) continue;
      const b4=S().lv[a.id]||0; S().lv[a.id]=b4+1; const g=G.incomePerSec()-base; S().lv[a.id]=b4;
      const r=g/c; if(r>roi){ roi=r; best=a; } }
    for(const it of G.LIFESTYLE){ if(S().assets[it.id]||S().cash<it.cost) continue;
      S().assets[it.id]=true; const g=G.incomePerSec()-base; delete S().assets[it.id];
      const r=g/it.cost; if(r>roi){ roi=r; best={life:it.id,cost:it.cost}; } }
    if(!best) break;
    if(best.life){ S().cash-=best.cost; S().assets[best.life]=true; }
    else { S().cash-=cashCost(best.id); S().lv[best.id]=(S().lv[best.id]||0)+1; }
  }
}

// ===== main progression run (event-driven; skills level from real target breaks) =====
function run(minutes){
  G.setS(G.newState()); G.ensureSkills(); G.serve();
  const dt=0.05, T=minutes*60; let t=0, polT=0;
  const marks={}, snaps=[], snapAt=new Set([60,300,900,1800,3600]);
  let autoT=null, firstMagicT=null, firstPrestT=null, overflowT=null;
  const stageMarks=[10,25,50,100,250,500];
  while(t<T){
    G.update(dt);
    if(!G.serving) G.serve();                 // attentive player taps SHOOT until Auto-Serve
    polT+=dt;
    if(polT>=0.5){ polT=0; buySkillUnlocks(); chooseFocus(); buyCashAndMagic(); }
    if(autoT==null && S().lv.auto) autoT=t;
    if(firstMagicT==null && S().magicLv && Object.values(S().magicLv).some(v=>v>0)) firstMagicT=t;
    if(firstPrestT==null && G.legacyGain()>=1) firstPrestT=t;
    for(const sm of stageMarks) if(marks['s'+sm]==null && S().stage>=sm) marks['s'+sm]=t;
    if(overflowT==null && (!isFinite(S().cash)||S().cash>1e300)){ overflowT=t; break; }
    const ti=Math.round(t);
    if(snapAt.has(ti) && (!snaps.length || snaps[snaps.length-1].t!==ti)){
      snaps.push({t:ti, stage:S().stage, cash:fmt(S().cash), inc:fmt(G.incomePerSec()), dps:fmt(G.analyticDPS()),
        mp:fmt(S().mp), sk:G.SKILLS.map(s=>s.id+':'+G.sl(s.id)).join(' '), q:G.QUESTS.filter(q=>G.sl(q.req[0])>=q.req[1]).length});
    }
    t+=dt;
  }
  return {marks, snaps, autoT, firstMagicT, firstPrestT, overflowT};
}

console.log('================ GOAL MACHINE v2 — BALANCE SIM ================\n');
const r = run(60);
const ms = s => s==null?'—':(s<90?Math.round(s)+'s':Math.round(s/60)+'m');
console.log('Auto-Serve bought:      ', ms(r.autoT));
console.log('First magic infusion:   ', ms(r.firstMagicT));
console.log('First prestige worth it:', ms(r.firstPrestT));
console.log('Overflow to Infinity:   ', r.overflowT==null?'no (good)':ms(r.overflowT));
console.log('Stage milestones:');
for(const sm of [10,25,50,100,250,500]) console.log('   stage '+String(sm).padEnd(4)+':', ms(r.marks['s'+sm]));
console.log('\nProgression snapshots:');
for(const s of r.snaps) console.log(`  @${String(Math.round(s.t/60)+'m').padEnd(3)} stage=${String(s.stage).padEnd(5)} cash=${String(s.cash).padEnd(7)} inc/s=${String(s.inc).padEnd(7)} DPS=${String(s.dps).padEnd(7)} MP=${String(s.mp).padEnd(5)} Q=${s.q}/7  [${s.sk}]`);

// ===== focus-matters A/B: 4 min all-Strength vs balanced =====
function focusRun(minutes, policy){
  G.setS(G.newState()); G.ensureSkills(); G.serve();
  const dt=0.05; let t=0, polT=0;
  while(t<minutes*60){ G.update(dt); if(!G.serving) G.serve(); polT+=dt; if(polT>=0.5){ polT=0; buySkillUnlocks(); policy(); buyCashAndMagic(); } t+=dt; }
  return {stage:S().stage, dps:fmt(G.analyticDPS()), inc:fmt(G.incomePerSec()), sk:G.SKILLS.map(s=>s.id+':'+G.sl(s.id)).join(' ')};
}
console.log('\nFocus policy A/B (4 min each):');
console.log('  all-into-Strength:', JSON.stringify(focusRun(4, ()=>{ if(G.skUnlocked('str')) S().focus='str'; })));
console.log('  balanced (lowest):', JSON.stringify(focusRun(4, chooseFocus)));
