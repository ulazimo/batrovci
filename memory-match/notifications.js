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
//   2. DAILY REMINDERS — a morning (09:00) and an evening (17:30) local-time nudge
//      for today (each slot only if it's still ahead) plus the next 3 days. This
//      game has no account, so a "login" = a session start: they are re-scheduled
//      on every boot AND every foreground return, clearing the prior batch first
//      so re-opening never duplicates them. Copy rotates per day (8 distinct
//      texts, morning/evening pools disjoint) so no two ever read the same.
//
// Player-facing master switch: the "Notifications" toggle in the home ⚙ Settings
// (setEnabled / mm_notifications, default ON). When OFF, nothing is ever scheduled
// and any pending notifications are cancelled. The OS permission prompt is asked
// automatically ONCE, on first app open (init), if not already decided — never from
// the Settings toggle, running out of lives, or any other trigger.
// ============================================================
const NOTIF = (() => {
  const ENABLED_KEY = 'mm_notifications';

  // Fixed IDs so a re-schedule replaces, rather than stacks, the same reminder.
  const ID_LIVES = 1001;
  // Daily reminders: today..+3 days × {morning, evening} = 8 stable slots. Cancelling
  // this whole range on each login is what stops re-opens from piling duplicates up.
  const SCHED_IDS = [1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107];

  const MORNING_HOUR = 9,  MORNING_MIN = 0;    // 09:00 local time
  const EVENING_HOUR = 17, EVENING_MIN = 30;   // 17:30 local time

  // One distinct copy per day-slot (index = day offset 0..3), so every scheduled
  // reminder reads differently. Morning and evening pools are disjoint ⇒ 8 texts.
  const MORNING_TEXTS = [
    { title: '☀️ Good morning', body: 'Wake up your brain with a round of Memory Match.' },
    { title: '🧠 Rise & match', body: 'A quick puzzle is the perfect way to start the day.' },
    { title: '☕ Morning warm-up', body: 'Sharpen your memory before things get busy.' },
    { title: '🌅 New day, new levels', body: 'Give your brain a gentle wake-up with Memory Match.' },
  ];
  const EVENING_TEXTS = [
    { title: '🎮 Ready for another level?', body: 'Unwind after work with a few matches.' },
    { title: '🌙 Evening challenge', body: 'Clear your head with a round of Memory Match.' },
    { title: '🔥 Keep your streak alive', body: 'Squeeze in a level before the day is done.' },
    { title: '🏆 One more level?', body: 'Relax and match your way to a new best.' },
  ];

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

  // Check, and prompt if not yet decided. Called once from init() on first open —
  // the only place we ever prompt.
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
  // Build the morning/evening reminders for today (only the slots still ahead of
  // now) plus the next 3 days. Each day-slot gets its own stable id and its own copy.
  function reminderNotes() {
    const now = Date.now();
    const out = [];
    for (let day = 0; day <= 3; day++) {
      const morning = new Date();
      morning.setDate(morning.getDate() + day);
      morning.setHours(MORNING_HOUR, MORNING_MIN, 0, 0);
      if (morning.getTime() > now) {
        out.push({ id: SCHED_IDS[day * 2], ...MORNING_TEXTS[day], schedule: { at: morning } });
      }
      const evening = new Date();
      evening.setDate(evening.getDate() + day);
      evening.setHours(EVENING_HOUR, EVENING_MIN, 0, 0);
      if (evening.getTime() > now) {
        out.push({ id: SCHED_IDS[day * 2 + 1], ...EVENING_TEXTS[day], schedule: { at: evening } });
      }
    }
    return out;
  }

  // Clear the previous batch (so re-opening never duplicates) then lay down a fresh
  // rolling window. Prompt-free: schedules only if permission is already granted.
  async function rescheduleReminders() {
    await drop(SCHED_IDS);
    if (!enabled) return;
    await put(reminderNotes());
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
      if (on) { refresh(); rescheduleReminders(); }
      else drop([ID_LIVES, ...SCHED_IDS]);
    },
    toggle() { this.setEnabled(!enabled); return enabled; },

    // lives.js hooks — schedule the lives reminder (prompt-free; permission was
    // asked at first open).
    onLivesDepleted(at) { if (enabled && at) put([livesNote(at)]); },
    onLivesRefilled() { drop([ID_LIVES]); },

    refresh,

    // Called once from boot(). Boot is a login: reconcile the lives reminder and
    // lay down today's + the next 3 days' morning/evening reminders. Every
    // foreground return is another login, so it clears + reschedules again to keep
    // the rolling window current (and drop today's slots once they've passed).
    // First open is also the ONE place we ask for OS permission (iOS shows the
    // dialog only once; a later boot with an already-decided status re-runs this as
    // a no-op). Foreground returns stay prompt-free.
    init() {
      const LN = plugin();
      if (!LN) return;   // web / desktop — nothing to do
      if (enabled) request().then(() => { refresh(); rescheduleReminders(); });
      else { refresh(); rescheduleReminders(); }
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          refresh();
          rescheduleReminders();
        }
      });
    },
  };
})();
