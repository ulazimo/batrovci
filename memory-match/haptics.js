// ============================================================
// HAPTICS — vibration / Taptic feedback
// Sibling of audio.js (SFX). Shared global namespace — do not redeclare a name.
// Loads right after audio.js so every engine file can call HAPTICS.* at call-time.
//
// Two output paths, picked automatically per fire:
//   • NATIVE  — Capacitor Haptics plugin (window.Capacitor.Plugins.Haptics).
//               Real Taptic Engine on iOS + Android; distinct Light/Medium/Heavy
//               impacts and Success/Warning/Error notifications. This is what ships.
//   • WEB     — navigator.vibrate(pattern). Works on Android Chrome; a no-op on
//               desktop and iOS Safari (which is why the debug overlay exists — it
//               shows every cue firing where you can't feel it).
//
// The Web Vibration API has NO amplitude control — only on/off durations — so on the
// web path "intensity" is faked with duration/pattern. Native gets the real thing.
//
// Preview: open haptics-preview.html for an on-demand button per cue, or turn on the
// debug overlay (Test Mode panel → "Haptics debug", or ?haptics-debug=1, or
// HAPTICS.setDebug(true)) to watch cues fire during real gameplay.
//
// The player-facing master switch is the "Vibrations" toggle in the home ⚙ Settings
// (setEnabled / mm_haptics, default ON). When OFF, fire() is a hard no-op — no buzz
// AND no debug visual — so the overlay only ever shows while vibrations are enabled.
// ============================================================
const HAPTICS = (() => {
  const ENABLED_KEY = 'mm_haptics';
  const DEBUG_KEY   = 'mm_haptics_debug';

  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  let enabled = ls.get(ENABLED_KEY, '1') !== '0';   // default ON
  let debug   = ls.get(DEBUG_KEY, '0') === '1';
  try { if (/[?&]haptics-debug=1/.test(location.search)) debug = true; } catch (e) {}

  // ── Cue table ─────────────────────────────────────────────────────────────
  // web:    navigator.vibrate() value — a duration (ms) or an [on,off,on,…] pattern.
  // native: [kind, arg] → Capacitor Haptics — impact 'LIGHT'|'MEDIUM'|'HEAVY',
  //         notification 'SUCCESS'|'WARNING'|'ERROR', or 'selection'.
  // tone/label are debug-overlay only.
  const CUES = {
    // 1 — cards fly into the Collection: the softest tick, fired once PER card as it
    //     lands (see flyCardsToGoal), so it's kept at selection strength to stay gentle.
    collect:       { web: 8,                     native: ['selection'],               tone: 'selection', label: 'Collect' },
    // 2 — a colour is fully cleared: a bit more
    colorClear:    { web: [12, 40, 26],          native: ['notification', 'SUCCESS'], tone: 'success',   label: 'Colour cleared' },
    // 3 — item revealed on the Home screen after a win: celebratory
    homeReveal:    { web: [16, 45, 26, 45, 34],  native: ['notification', 'SUCCESS'], tone: 'reveal',    label: 'Home reveal' },
    // 4 — Small/Big bomb landing: strong
    bomb:          { web: 42,                    native: ['impact', 'HEAVY'],         tone: 'heavy',     label: 'Bomb drop' },
    // 5 — Back-effect slam: softer than the bomb
    backEffect:    { web: 26,                    native: ['impact', 'MEDIUM'],        tone: 'medium',    label: 'Back-effect slam' },
    // 6 — a Lock fully breaks / Ice melts / Colour-lock opens: a crisp double snap
    obstacleBreak: { web: [20, 28, 14],          native: ['impact', 'MEDIUM'],        tone: 'medium',    label: 'Obstacle break' },
    // 7 — Elevator rises: small
    elevator:      { web: 12,                    native: ['impact', 'LIGHT'],         tone: 'light',     label: 'Elevator rise' },
    // 8 — Peek used (tap or long-press): subtle
    peek:          { web: 14,                    native: ['impact', 'LIGHT'],         tone: 'light',     label: 'Peek' },
    // 9 — Random-3 reveal, one weak tick per card as it flips
    random3:       { web: 10,                    native: ['selection'],               tone: 'selection', label: 'Random 3 tick' },
    // 10 — +1 Colour opens another of the chain colour
    plusColor:     { web: 16,                    native: ['impact', 'LIGHT'],         tone: 'light',     label: '+1 Colour' },
    // 11 — Win-streak start reveal: the WEAKEST cue, one per card, in sync
    streakCard:    { web: 8,                     native: ['selection'],               tone: 'selection', label: 'Win-streak card' },
    // 12 — Level failed: negative shake
    fail:          { web: [50, 45, 50, 45, 80],  native: ['notification', 'ERROR'],   tone: 'error',     label: 'Level failed' },
    // 13 — Level beaten: positive
    win:           { web: [20, 55, 32, 55, 60],  native: ['notification', 'SUCCESS'], tone: 'success',   label: 'Level won' },
    // Recall re-reveals your remembered cards (costs coins): a light reveal tick, fired
    // once for the whole batch (the cards all flash at once, so no per-card stagger).
    recall:        { web: 16,                    native: ['impact', 'LIGHT'],         tone: 'light',     label: 'Recall' },
  };

  // ── Native (Capacitor) path ───────────────────────────────────────────────
  function nativePlugin() {
    try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics || null; }
    catch (e) { return null; }
  }
  function fireNative(cue) {
    const H = nativePlugin();
    if (!H) return false;
    try {
      const [kind, arg] = cue.native;
      if (kind === 'impact' && H.impact) H.impact({ style: arg });
      else if (kind === 'notification' && H.notification) H.notification({ type: arg });
      else if (kind === 'selection') {
        // A one-shot selection tick. Fall back to a light impact if the plugin build
        // doesn't expose the selection* calls.
        if (H.selectionStart) { H.selectionStart(); if (H.selectionChanged) H.selectionChanged(); if (H.selectionEnd) setTimeout(() => { try { H.selectionEnd(); } catch (e) {} }, 40); }
        else if (H.impact) H.impact({ style: 'LIGHT' });
      } else if (H.vibrate) { H.vibrate({ duration: Array.isArray(cue.web) ? cue.web[0] : cue.web }); }
      else return false;
    } catch (e) { return false; }
    return true;
  }

  // ── Web (navigator.vibrate) path ──────────────────────────────────────────
  function fireWeb(cue) {
    try { return typeof navigator !== 'undefined' && navigator.vibrate ? navigator.vibrate(cue.web) : false; }
    catch (e) { return false; }
  }

  // ── Debug overlay (self-contained; injects its own CSS) ───────────────────
  const TONE_COLOR = {
    selection: '#818cf8', light: '#38bdf8', medium: '#fbbf24',
    heavy: '#f87171', success: '#34d399', reveal: '#a78bfa', error: '#ef4444',
  };
  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const s = document.createElement('style');
    s.textContent = `
      #mm-haptic-debug{position:fixed;right:12px;bottom:12px;z-index:2147483647;display:flex;
        flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none;font-family:-apple-system,system-ui,sans-serif}
      .mm-haptic-chip{background:rgba(15,10,30,.92);color:#fff;border-left:4px solid var(--c,#38bdf8);
        border-radius:8px;padding:6px 10px;font-size:12px;line-height:1.3;box-shadow:0 6px 18px rgba(0,0,0,.4);
        opacity:0;transform:translateX(16px);animation:mmHapticIn .16s ease-out forwards, mmHapticOut .3s ease-in 1s forwards;max-width:230px}
      .mm-haptic-chip b{color:var(--c,#38bdf8)} .mm-haptic-chip small{opacity:.65;display:block;font-size:10px;margin-top:1px}
      @keyframes mmHapticIn{to{opacity:1;transform:translateX(0)}}
      @keyframes mmHapticOut{to{opacity:0;transform:translateX(16px)}}
      #mm-haptic-pulse{position:fixed;inset:0;z-index:2147483646;pointer-events:none;opacity:0;
        box-shadow:inset 0 0 0 4px var(--c,#38bdf8);border-radius:2px}
      #mm-haptic-pulse.go{animation:mmHapticPulse .5s ease-out}
      @keyframes mmHapticPulse{0%{opacity:.55}100%{opacity:0}}`;
    document.head.appendChild(s);
  }
  let pulseEl = null;
  function showDebug(name, cue) {
    if (!document.body) return;
    injectStyles();
    let box = document.getElementById('mm-haptic-debug');
    if (!box) { box = document.createElement('div'); box.id = 'mm-haptic-debug'; document.body.appendChild(box); }
    const color = TONE_COLOR[cue.tone] || '#38bdf8';
    const chip = document.createElement('div');
    chip.className = 'mm-haptic-chip';
    chip.style.setProperty('--c', color);
    const pat = Array.isArray(cue.web) ? '[' + cue.web.join(', ') + ']' : cue.web + 'ms';
    chip.innerHTML = `<b>${cue.label}</b><small>${name} · vibrate ${pat}${enabled ? '' : ' · MUTED'}</small>`;
    box.appendChild(chip);
    setTimeout(() => chip.remove(), 1400);
    if (!pulseEl) { pulseEl = document.createElement('div'); pulseEl.id = 'mm-haptic-pulse'; document.body.appendChild(pulseEl); }
    pulseEl.style.setProperty('--c', color);
    pulseEl.classList.remove('go'); void pulseEl.offsetWidth; pulseEl.classList.add('go');
  }

  // ── Public dispatch ───────────────────────────────────────────────────────
  function fire(name) {
    const cue = CUES[name];
    if (!cue) return;
    // When the player turns Vibrations OFF it is FULLY off: no native buzz, no web
    // vibrate, and no debug visual either. `enabled` is the single master switch.
    if (!enabled) return;
    if (!fireNative(cue)) fireWeb(cue);
    if (debug) { try { showDebug(name, cue); } catch (e) {} }
  }

  const api = {
    fire,
    cues: CUES,
    isEnabled: () => enabled,
    setEnabled(v) { enabled = !!v; ls.set(ENABLED_KEY, enabled ? '1' : '0'); },
    toggle() { api.setEnabled(!enabled); return enabled; },
    isDebug: () => debug,
    setDebug(v) { debug = !!v; ls.set(DEBUG_KEY, debug ? '1' : '0'); },
    toggleDebug() { api.setDebug(!debug); return debug; },
    supported() {
      return { native: !!nativePlugin(), web: !!(typeof navigator !== 'undefined' && navigator.vibrate) };
    },
  };
  // Named helpers so call sites read well (one per game event; several share a cue).
  Object.keys(CUES).forEach(name => { api[name] = () => fire(name); });
  // A couple of readable aliases for shared cues.
  api.obstacleBreakLock = () => fire('obstacleBreak');
  api.random3Tick = () => fire('random3');
  api.streakTick  = () => fire('streakCard');
  api.peekLong    = () => fire('peek');
  return api;
})();
