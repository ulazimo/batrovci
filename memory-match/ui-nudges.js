// ============================================================
// OVERLAY HELPERS
// (Former idle-nudge/hint system lived here — removed for a clean-slate
// tutorial rebuild. Shared state & DOM refs live in state.js, loaded
// first via <script>; boot.js loads last. All files share one global
// namespace — do not redeclare a name.)
// ============================================================

function closeAllOverlays() {
  ['home-screen','level-select','overlay-fail','overlay-win','pre-level','color-picker','settings-panel','progression-picker','shop-screen']
    .forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });
  const _nlb = document.getElementById('next-level-btn');
  if (_nlb) _nlb.style.display = '';
}
