// ============================================================
// SOUND — Web Audio API programmatic tones
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

// ============================================================
// SOUND (Web Audio API — programmatic tones, no files)
// ============================================================
const SFX = (() => {
  let ctx = null;
  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, type, vol, dur, delay = 0) {
    try {
      const c = ac(), o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type; o.frequency.value = freq;
      const t = c.currentTime + delay;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    } catch(e) {}
  }
  // Shepard bell buffer cache
  const shepardCache = new Map();
  function createShepardBellBuffer(baseFreq, duration = 1) {
    const key = baseFreq.toFixed(4) + '_' + duration;
    if (shepardCache.has(key)) return shepardCache.get(key);
    try {
      const c = ac();
      const sampleRate = c.sampleRate;
      const numSamples = Math.floor(sampleRate * duration);
      const buffer = c.createBuffer(1, numSamples, sampleRate);
      const data = buffer.getChannelData(0);
      let maxVal = 0;
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const timeEnvelope = Math.exp(-3.5 * t);
        let signal = 0;
        for (let octave = -5; octave <= 5; octave++) {
          const freq = baseFreq * Math.pow(2, octave);
          if (freq > 20 && freq < 20000) {
            const amplitude = Math.exp(-Math.pow((Math.log2(freq) - Math.log2(1000)), 2) / 4);
            signal += amplitude * Math.sin(2 * Math.PI * freq * t);
          }
        }
        data[i] = signal * timeEnvelope;
        if (Math.abs(data[i]) > maxVal) maxVal = Math.abs(data[i]);
      }
      const norm = maxVal > 0 ? maxVal : 1;
      for (let i = 0; i < numSamples; i++) data[i] /= norm;
      shepardCache.set(key, buffer);
      return buffer;
    } catch (e) { return null; }
  }
  // Shared output chain: per-bell gain → master gain → compressor → destination
  // Prevents overlapping bells from stacking into loudness.
  let shepardMaster = null;
  function getShepardMaster() {
    if (shepardMaster) return shepardMaster;
    const c = ac();
    const master = c.createGain();
    master.gain.value = 0.15; // overall shepard level
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value       = 20;
    comp.ratio.value      = 12;
    comp.attack.value     = 0.003;
    comp.release.value    = 0.25;
    master.connect(comp);
    comp.connect(c.destination);
    shepardMaster = master;
    return master;
  }
  function playShepardStep(step, vol = 0.3) {
    try {
      const c = ac();
      const startFreq = 261.63; // C4
      const freq = startFreq * Math.pow(2, (step * 2 / 12));
      const buffer = createShepardBellBuffer(freq);
      if (!buffer) return;
      const source = c.createBufferSource();
      const g = c.createGain();
      source.buffer = buffer;
      source.connect(g); g.connect(getShepardMaster());
      g.gain.value = vol;
      source.start(0);
    } catch (e) {}
  }

  // Web Audio buffer cache (preloaded via fetch + decode, played via AudioBufferSourceNode)
  const audioBuffers = {};
  function preload(name, url) {
    fetch(url)
      .then(r => r.arrayBuffer())
      .then(buf => {
        // Lazy context creation — decode when AudioContext is available
        const decode = () => {
          try {
            const c = ac();
            c.decodeAudioData(buf.slice(0),
              decoded => { audioBuffers[name] = decoded; },
              err => console.warn('Decode failed for ' + name, err)
            );
          } catch (e) { console.warn('AudioContext create failed', e); }
        };
        decode();
      })
      .catch(err => console.warn('Fetch failed for ' + url, err));
  }
  function playBuffer(name, vol = 0.5) {
    try {
      const buffer = audioBuffers[name];
      if (!buffer) return;
      const c = ac();
      const src = c.createBufferSource();
      const g = c.createGain();
      src.buffer = buffer;
      src.connect(g); g.connect(c.destination);
      g.gain.value = vol;
      src.start(0);
    } catch(e) {}
  }
  // Kick off preloads
  preload('boom', 'audio/boom.mp3');
  preload('pop', 'audio/pop.mp3');
  preload('cardFlip', 'audio/card_flip.mp3');

  return {
    flip()     { tone(880, 'sine',     0.07, 0.07); },
    match()    { tone(660, 'sine',     0.09, 0.11); tone(990, 'sine', 0.06, 0.11, 0.05); },
    mismatch() { tone(160, 'sawtooth', 0.13, 0.24); },
    combo(n)   { [523,659,784,1047,1319].slice(0, Math.min(n-2, 5)).forEach((f,i) => tone(f,'triangle',0.14,0.22,i*0.09)); },
    win()      { [523,659,784,1047].forEach((f,i) => tone(f,'triangle',0.16,0.40,i*0.10)); },
    fail()     { [380,300,220].forEach((f,i) => tone(f,'sawtooth',0.12,0.30,i*0.13)); },
    booster()  { tone(1200,'sine',0.09,0.12); tone(1600,'sine',0.06,0.10,0.08); },
    special()  { tone(440,'triangle',0.10,0.20); },
    ding(i)    { const f = 1200 + (i % 5) * 100; tone(f,'sine',0.12,0.12); tone(f*1.5,'sine',0.06,0.08,0.04); },
    boom()     { playBuffer('boom', 0.5); },
    pop()      { playBuffer('pop', 0.4); },
    cardFlip() { playBuffer('cardFlip', 0.5); },
    shepard(step) { playShepardStep(step); },
  };
})();
