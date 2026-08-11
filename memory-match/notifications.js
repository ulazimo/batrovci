// ============================================================
// NOTIFICATIONS — local (on-device) reminders
// Sibling of haptics.js. Shared global namespace — do not redeclare a name.
// Loads right after haptics.js so every engine file can call NOTIF.* at call-time.
//
// LOCAL notifications only — scheduled on-device, no server, no FCM/APNs, no
// push tokens. Two output paths, picked automatically:
//   • NATIVE — Capacitor Local Notifications plugin
//              (window.Capacitor.Plugins.LocalNotifications). Real scheduled
//              notifications on iOS + Android. This is what ships.
//   • WEB    — a hard no-op. Desktop browsers / the portfolio site never schedule
//              anything, so nothing changes there.
//
// The plugin MUST be installed in each native shell (memory-match-ios,
// memory-match-app) — unlike haptics (which degrades to navigator.vibrate), a
// missing plugin means notifications simply do nothing. See each shell's README.
//
// Two triggers ship today:
//   1. LIVES REFILL — anchored to progress.livesRefillAt (an absolute timestamp,
//      see lives.js). Fired from startLivesRefillTimer() the moment lives hit 0;
//      cancelled the instant they refill or the player returns to the app.
//   2. DAILY COMEBACK — a +24h and +72h "come back" nudge, (re)scheduled every
//      time the app is backgrounded and cleared when it returns to the foreground.
//
// Player-facing master switch: the "Notifications" toggle in the home ⚙ Settings
// (setEnabled / mm_notifications, default ON). When OFF, nothing is ever scheduled
// and any pending notifications are cancelled. The OS permission prompt is asked
// LAZILY at a natural moment (running out of lives, or flipping the toggle on) —
// never on cold start.
// ============================================================
const NOTIF = (() => {
  const ENABLED_KEY = 'mm_notifications';

  // Fixed IDs so a re-schedule replaces, rather than stacks, the same reminder.
  const ID_LIVES   = 1001;
  const ID_DAILY_1 = 1002;   // +24h
  const ID_DAILY_2 = 1003;   // +72h

  const HOUR = 60 * 60 * 1000;

  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  let enabled = ls.get(ENABLED_KEY, '1') !== '0';   // default ON

  // ── Plugin access ──────────────────────────────────────────────────────────
  function plugin() {
    try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications || null; }
    catch (e) { return null; }
  }

  // Already-granted check — never prompts. Used by passive schedulers (init
  // reconcile, backgrounding) so we don't pop a permission dialog at a bad moment.
  async function granted() {
    const LN = plugin();
    if (!LN) return false;
    try { return (await LN.checkPermissions()).display === 'granted'; }
    catch (e) { return false; }
  }

  // Check, and prompt if not yet decided. Only call from a natural, user-driven
  // moment (toggle ON, running out of lives).
  async function request() {
    const LN = plugin();
    if (!LN) return false;
    try {
      let res = await LN.checkPermissions();
      if (res.display !== 'granted') res = await LN.requestPermissions();
      return res.display === 'granted';
    } catch (e) { return false; }
  }

  // Schedule a batch. `prompt:true` will ask for permission first; otherwise it
  // silently no-ops unless permission is already granted.
  async function put(notifications, { prompt = false } = {}) {
    const LN = plugin();
    if (!LN || !enabled) return;
    const ok = prompt ? await request() : await granted();
    if (!ok) return;
    try { await LN.schedule({ notifications }); } catch (e) {}
  }

  async function drop(ids) {
    const LN = plugin();
    if (!LN) return;
    try { await LN.cancel({ notifications: ids.map(id => ({ id })) }); } catch (e) {}
  }

  // ── Notification content ───────────────────────────────────────────────────
  function livesNote(at) {
    return {
      id: ID_LIVES,
      title: 'Lives refilled ❤️',
      body: 'Your lives are back — jump into Memory Match!',
      schedule: { at: new Date(at) },
    };
  }
  function dailyNotes() {
    const now = Date.now();
    return [
      { id: ID_DAILY_1, title: 'Your puzzles miss you 🧩', body: 'Come back for a quick Memory Match round!', schedule: { at: new Date(now + 24 * HOUR) } },
      { id: ID_DAILY_2, title: 'New matches await ✨',      body: "Don't lose your streak — play Memory Match!", schedule: { at: new Date(now + 72 * HOUR) } },
    ];
  }

  // ── Reconcile ──────────────────────────────────────────────────────────────
  // Bring the lives reminder in line with stored state (no prompt). Called on
  // launch and whenever the app returns to the foreground.
  function refresh() {
    if (!enabled) { drop([ID_LIVES]); return; }
    const at = (typeof progress !== 'undefined') && progress.livesRefillAt;
    if (at && at > Date.now()) put([livesNote(at)]);
    else drop([ID_LIVES]);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    isEnabled: () => enabled,

    setEnabled(on) {
      enabled = !!on;
      ls.set(ENABLED_KEY, on ? '1' : '0');
      if (on) request().then(ok => { if (ok) refresh(); });
      else drop([ID_LIVES, ID_DAILY_1, ID_DAILY_2]);
    },
    toggle() { this.setEnabled(!enabled); return enabled; },

    // lives.js hooks — running out of lives is a natural moment to ask permission.
    onLivesDepleted(at) { if (enabled && at) put([livesNote(at)], { prompt: true }); },
    onLivesRefilled() { drop([ID_LIVES]); },

    refresh,

    // Called once from boot(). Reconciles pending reminders (silently) and wires
    // the background/foreground handling for the daily-comeback nudge.
    init() {
      const LN = plugin();
      if (!LN) return;   // web / desktop — nothing to do
      granted().then(ok => { if (enabled && ok) refresh(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (enabled) put(dailyNotes());          // granted-only; never prompts while leaving
        } else {
          drop([ID_DAILY_1, ID_DAILY_2]);          // they're back — clear the comeback nudges
          refresh();                                // and re-check the lives reminder
        }
      });
    },
  };
})();
