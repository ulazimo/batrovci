// Headless balance simulation for Goal Machine.
// Loads the REAL economy + event-sim functions from index.html (Three.js/DOM stubbed),
// drives them with a scripted buyer, and reports pacing / tuning findings.
const fs = require('fs');
const HTML = fs.readFileSync(process.argv[2], 'utf8');

// ---- extract the module script, strip imports + 3D boot ----
let code = HTML.match(/<script type="module">\s*\nimport \* as THREE[\s\S]*?<\/script>/)[0]
  .replace(/^<script type="module">/, '').replace(/<\/script>$/, '');
code = code.split('\n').filter(l => !/^\s*import .* from /.test(l)).join('\n');
code = code.replace(/setup3D\(\);\s*\n\s*resize\(\);\s*\n\s*window\.addEventListener\('load',resize\);/, '');

// ---- minimal stubs ----
const V = class { constructor(x,y,z){this.x=x||0;this.y=y||0;this.z=z||0;}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} project(){this.x=0;this.y=0;return this;}
  normalize(){return this;} setScalar(){return this;} copy(){return this;} };
const THREE = { Vector3:V, Color:class{setHex(){return this;}}, Matrix4:class{makeScale(){return this;}compose(){return this;}},
  Quaternion:class{setFromAxisAngle(){return this;}} };
const ctxStub = new Proxy({}, { get:()=> ()=>{} });
function el(){ return { style:{}, dataset:{}, classList:{add(){},remove(){},toggle(){},contains(){return false}},
  addEventListener(){}, appendChild(){}, querySelector(){return el();}, getContext(){return ctxStub;},
  getBoundingClientRect(){return {width:430,height:320};}, set innerHTML(v){}, set textContent(v){}, width:0,height:0, disabled:false }; }
const documentStub = { getElementById(){return el();}, createElement(){return el();}, addEventListener(){} };
const windowStub = { addEventListener(){}, devicePixelRatio:1 };
const localStorageStub = { getItem(){return null;}, setItem(){} };
const perfStub = { now(){return 0;} };

let API;
const fn = new Function('THREE','document','window','localStorage','performance','requestAnimationFrame','setInterval','GLTFLoader','DRACOLoader','__expose',
  code + '\n;__expose({get S(){return S}, setS:v=>{S=v}, newState, ATTR, AMAP, LIFESTYLE, LMAP, attr, lv, ' +
  'incomePerSec, analyticDPS, targetHP, targetReward, avgBallDmg, ballsPerSec, hitFrac, prestigeMult, legacyGain, ' +
  'stageScale, targetCount, cashPerHit, lifeMult, update, serve, spawnTargets, get serving(){return serving}, ' +
  'get stageVar(){return S.stage}, setServing:v=>{serving=v} });');
fn(THREE, documentStub, windowStub, localStorageStub, perfStub, ()=>{}, ()=>{}, function(){}, function(){}, a=>{API=a;});

const G = API;
const fmt = n => !isFinite(n) ? '∞' : n<1000 ? (Math.round(n*10)/10).toString()
  : (()=>{const S=['','K','M','B','T','Qa','Qi','Sx','Sp','Oc','No','Dc'];let t=0;while(n>=1000&&t<S.length-1){n/=1000;t++;}return (n<100?n.toFixed(1):Math.round(n))+S[t];})();

// ===== helpers to drive the real economy =====
function reset(){ G.setS(G.newState()); }
function S(){ return G.S; }
function setLv(obj){ for(const k in obj) S().lv[k]=obj[k]; }

// ---- scripted buyer: greedy ROI on real incomePerSec, + forced QoL ----
function cost(id){ const l=S().lv[id]||0; return G.AMAP[id].cost(l); }
function canAfford(id){ return S().cash >= cost(id); }
function incomeIfLevel(id){ const before=S().lv[id]||0; S().lv[id]=before+1; const v=G.incomePerSec(); S().lv[id]=before; return v; }
function buyOne(id){ const c=cost(id); if(!isFinite(c)||S().cash<c) return false; S().cash-=c; S().lv[id]=(S().lv[id]||0)+1; return true; }

function greedyBuy(){
  // returns true if something was bought
  const base = G.incomePerSec();
  let best=null, bestRoi=0;
  for(const a of G.ATTR){
    if(!canAfford(a.id)) continue;
    if(a.id==='auto'){ if(!(S().lv.auto)) { best={id:'auto'}; bestRoi=Infinity; break; } else continue; }
    const gain = incomeIfLevel(a.id) - base;
    const roi = gain / cost(a.id);
    if(roi>bestRoi){ bestRoi=roi; best=a; }
  }
  // lifestyle (one-time income multipliers)
  for(const it of G.LIFESTYLE){
    if(S().assets[it.id] || S().cash<it.cost) continue;
    const before=S().assets[it.id]; S().assets[it.id]=true; const gain=G.incomePerSec()-base; S().assets[it.id]=before||false; delete S().assets[it.id];
    const roi=gain/it.cost;
    if(roi>bestRoi){ bestRoi=roi; best={id:it.id, life:true}; }
  }
  if(!best) return false;
  if(best.life){ S().cash-=G.LMAP[best.id].cost; S().assets[best.id]=true; return true; }
  return buyOne(best.id);
}

// ===== ANALYSIS 1: event-sim sanity (real update loop) vs analytic income =====
function eventRun(seconds, dt=1/30){
  const start=S().cash; let t=0; G.serve();
  while(t<seconds){ G.update(dt); if(!G.serving) G.serve(); t+=dt; } // attentive player re-taps SHOOT
  return (S().cash-start)/seconds;
}
function A1(){
  // (a) headless WITHOUT re-tapping → proves the manual-serve gate truly stops play
  reset(); G.serve(); let t=0; const dt=1/30;
  while(t<60){ G.update(dt); t+=dt; }
  const noTap=`  no-tap (idle after 1st board): cash=${fmt(S().cash)} stage=${G.stageVar}  ← manual gate works`;
  // (b) attentive player who taps SHOOT every board
  reset(); G.serve(); t=0; let boards=0;
  while(t<60){ G.update(dt); if(!G.serving){ boards++; G.serve(); } t+=dt; }
  const tap=`  tapping player 60s: cash=${fmt(S().cash)} stage=${G.stageVar} boardsCleared=${boards} analyticIncome/s=${fmt(G.incomePerSec())} DPS=${fmt(G.analyticDPS())}`;
  return noTap+'\n'+tap;
}

// ===== ANALYSIS 2: does "More Targets" actually change measured cash/sec? =====
function A2(){
  const loadout={power:45,rate:22,multi:5,critC:15,critD:10,power2:12,combo:10,hype:25,accuracy:12,speed:30,stagger:30,tgtHP:8,auto:1};
  const res=[];
  for(const tg of [0,2,5]){ // targets level 0->1 target, 2->3, 5->6
    reset(); setLv(Object.assign({},loadout,{targets:tg})); S().stage=20; S().cash=0;
    const cps=eventRun(40);
    res.push(`targets=${G.targetCount()} (lv ${tg}): measured cash/s=${fmt(cps)}  DPS=${fmt(G.analyticDPS())}  targetHP=${fmt(G.targetHP())}  avgBallDmg=${fmt(G.avgBallDmg())}`);
  }
  return res.join('\n');
}

// ===== ANALYSIS 3: macro progression with the scripted buyer (analytic) =====
function A3(){
  reset(); G.serve();
  const dt=0.25; let t=0; const log=[]; const marks={}; const stageMarks=[10,25,50,100,200];
  let autoT=null, firstPrestigeT=null;
  const snap=[300,900,1800,3600];
  let fracStage=1, overflowT=null;
  while(t<3600){
    if(overflowT==null && (!isFinite(S().cash) || !isFinite(G.incomePerSec()) || S().cash>1e300)){ overflowT=t; }
    // earn
    S().cash += G.incomePerSec()*dt;
    // advance stage by board-clear rate
    const hp=G.targetHP(), bps=G.ballsPerSec(), hf=G.hitFrac(), count=G.targetCount();
    const usefulDPS=Math.min(G.analyticDPS(), hp*bps*hf);
    const boardsPerSec = usefulDPS/(hp*count);
    fracStage += boardsPerSec*dt;
    const ns=Math.floor(fracStage); if(ns>S().stage){ S().stage=ns; if(ns>S().bestStage)S().bestStage=ns; }
    // buy
    let guard=0; while(greedyBuy() && guard++<200){}
    if(!autoT && S().lv.auto){ autoT=t; }
    if(!firstPrestigeT && G.legacyGain()>=1){ firstPrestigeT=t; }
    for(const sm of stageMarks){ if(!marks['stage'+sm] && S().stage>=sm) marks['stage'+sm]=t; }
    if(overflowT==null && snap.includes(Math.round(t))){ log.push(`  @${Math.round(t/60)}min: stage=${S().stage} cash=${fmt(S().cash)} income/s=${fmt(G.incomePerSec())} DPS=${fmt(G.analyticDPS())} legacyGain=${G.legacyGain()}`); }
    if(overflowT!=null) break;
    t+=dt;
  }
  const lv=id=>S().lv[id]||0;
  const out=[];
  out.push(`NUMBERS OVERFLOW TO INFINITY (>1e300) at: ${overflowT!=null?Math.round(overflowT)+'s ('+Math.round(overflowT/60)+'min), stage '+S().stage:'never in 1h'}`);
  out.push(`auto-serve bought at: ${autoT!=null?Math.round(autoT)+'s':'NEVER'}`);
  out.push(`first prestige worthwhile (legacyGain>=1) at: ${firstPrestigeT!=null?Math.round(firstPrestigeT)+'s':'NEVER'}`);
  for(const sm of stageMarks) out.push(`reach stage ${sm}: ${marks['stage'+sm]!=null?Math.round(marks['stage'+sm])+'s':'not in 1h'}`);
  out.push('snapshots:'); out.push(...log);
  out.push('final upgrade levels: '+G.ATTR.map(a=>`${a.id}:${lv(a.id)}`).join('  '));
  out.push('lifestyle owned: '+Object.keys(S().assets).join(',')||'none');
  out.push(`final: stage ${S().stage}, cash ${fmt(S().cash)}, income/s ${fmt(G.incomePerSec())}, legacyGain ${G.legacyGain()}`);
  return out.join('\n');
}

// ===== ANALYSIS 4: upgrade ROI snapshot at a mid-game state =====
function A4(){
  reset(); setLv({power:30,rate:15,multi:4,critC:10,critD:8,power2:8,combo:6,hype:15,accuracy:10,speed:20,stagger:20,tgtHP:5,cashG:12,coins:15,gold:8,sponsor:10,over:6,targets:2,auto:1});
  S().stage=15; S().cash=0;
  const base=G.incomePerSec();
  const rows=G.ATTR.map(a=>{ const before=S().lv[a.id]||0; S().lv[a.id]=before+1; const gain=G.incomePerSec()-base; S().lv[a.id]=before;
    return {id:a.id, gain, cost:a.cost(before), roi: gain/a.cost(before)}; });
  rows.sort((x,y)=>y.roi-x.roi);
  return rows.map(r=>`  ${r.id.padEnd(9)} ROI=${(r.roi).toExponential(2)}  Δincome/s=${fmt(r.gain)}  cost=${fmt(r.cost)}`).join('\n');
}

function regimeLine(name){
  const base=G.incomePerSec();
  const bh=S().lv.tgtHP||0; S().lv.tgtHP=bh+1; const dHP=G.incomePerSec()-base; S().lv.tgtHP=bh;
  const cap=G.targetHP()*G.ballsPerSec()*G.hitFrac();
  const regime = G.analyticDPS()<cap ? 'TANKY (shots < target HP)':'OVERKILL (shots one-shot targets)';
  return `  ${name}: avgBallDmg=${fmt(G.avgBallDmg())} targetHP=${fmt(G.targetHP())} → ${regime}\n     Δincome/s from +1 Target Size = ${fmt(dHP)}`;
}
function A5(){
  const out=[];
  reset(); setLv({power:10,rate:30,multi:6,accuracy:12,tgtHP:5,cashG:5,auto:1}); S().stage=25; S().cash=0;
  out.push(regimeLine('tanky build (many weak balls)'));
  reset(); setLv({power:220,critC:20,critD:20,power2:20,rate:5,multi:1,accuracy:12,tgtHP:0,cashG:5,auto:1}); S().stage=5; S().cash=0;
  out.push(regimeLine('overkill build (few huge balls)'));
  return out.join('\n');
}

console.log('================ GOAL MACHINE — BALANCE SIM ================\n');
console.log('--- A1: fresh-start real event sim (60s) ---'); console.log(A1(),'\n');
console.log('--- A2: does More Targets change measured cash/s? (40s real sim each) ---'); console.log(A2(),'\n');
console.log('--- A3: macro progression, scripted greedy buyer (1h) ---'); console.log(A3(),'\n');
console.log('--- A4: upgrade ROI ranking at a mid-game state (stage 15) ---'); console.log(A4(),'\n');
console.log('--- A5: when does "Target Size" actually pay off? ---'); console.log(A5(),'\n');
