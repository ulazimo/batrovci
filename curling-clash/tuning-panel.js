// ============================================================
// TUNING PANEL — dev overlay of live sliders over the game
//
// Renders every entry in TUNE_DEFS as a slider grouped by system, with a
// filter box, per-value reset, and JSON export/import so a tuned set can be
// pasted back into tuning.js as new defaults.
//
// Opened with the ⚙ button, or the ` (backtick) key on desktop.
// ============================================================

let tunePanelEl = null;
let tunePanelOpen = false;

function buildTuningPanel() {
  if (tunePanelEl) return tunePanelEl;

  const panel = document.createElement('div');
  panel.id = 'tune-panel';
  panel.innerHTML = `
    <div class="tune-head">
      <span class="tune-title">Tuning</span>
      <input class="tune-filter" type="text" placeholder="filter…" spellcheck="false">
      <button class="tune-x" title="Close">×</button>
    </div>
    <div class="tune-body"></div>
    <div class="tune-foot">
      <button class="tune-btn" data-act="copy">Copy JSON</button>
      <button class="tune-btn" data-act="paste">Paste JSON</button>
      <button class="tune-btn tune-danger" data-act="reset">Reset all</button>
    </div>
    <textarea class="tune-json" spellcheck="false" placeholder="Paste a tuning JSON here, then press Apply."></textarea>
    <div class="tune-json-row"><button class="tune-btn" data-act="apply">Apply</button><button class="tune-btn" data-act="cancel">Cancel</button></div>
  `;

  const body = panel.querySelector('.tune-body');
  body.appendChild(buildDevCheats());

  for (const group of TUNE_GROUPS) {
    const keys = Object.keys(TUNE_DEFS).filter(k => TUNE_DEFS[k][0] === group.id);
    if (!keys.length) continue;

    const sec = document.createElement('div');
    sec.className = 'tune-group';
    sec.innerHTML = `<div class="tune-group-head">${group.label}</div>`;

    for (const key of keys) {
      const [, label, def, min, max, step, help] = TUNE_DEFS[key];
      const row = document.createElement('div');
      row.className = 'tune-row';
      row.dataset.key = key;
      row.dataset.search = (key + ' ' + label).toLowerCase();
      row.innerHTML = `
        <div class="tune-row-top">
          <label title="${help.replace(/"/g, '&quot;')}">${label}</label>
          <span class="tune-val">${fmtTune(TUNE[key], step)}</span>
        </div>
        <div class="tune-row-bot">
          <input type="range" min="${min}" max="${max}" step="${step}" value="${TUNE[key]}">
          <button class="tune-reset" title="Reset to ${def}">↺</button>
        </div>
      `;
      const slider = row.querySelector('input');
      const valEl = row.querySelector('.tune-val');
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        setTune(key, v);
        valEl.textContent = fmtTune(v, step);
        row.classList.toggle('tune-dirty', v !== def);
      });
      row.querySelector('.tune-reset').addEventListener('click', () => {
        setTune(key, def);
        slider.value = def;
        valEl.textContent = fmtTune(def, step);
        row.classList.remove('tune-dirty');
      });
      row.classList.toggle('tune-dirty', TUNE[key] !== def);
      sec.appendChild(row);
    }
    body.appendChild(sec);
  }

  // Filter
  panel.querySelector('.tune-filter').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    panel.querySelectorAll('.tune-row').forEach(r => {
      r.style.display = !q || r.dataset.search.includes(q) ? '' : 'none';
    });
    panel.querySelectorAll('.tune-group').forEach(g => {
      const anyVisible = [...g.querySelectorAll('.tune-row')].some(r => r.style.display !== 'none');
      g.style.display = anyVisible ? '' : 'none';
    });
  });

  panel.querySelector('.tune-x').addEventListener('click', () => toggleTuningPanel(false));

  const jsonBox = panel.querySelector('.tune-json');
  const jsonRow = panel.querySelector('.tune-json-row');

  panel.addEventListener('click', (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    if (!act) return;
    if (act === 'copy') {
      const text = exportTuning();
      navigator.clipboard?.writeText(text).then(
        () => flashTune(e.target, 'Copied'),
        () => { jsonBox.value = text; jsonBox.classList.add('open'); jsonRow.classList.add('open'); }
      );
    } else if (act === 'paste') {
      jsonBox.value = '';
      jsonBox.classList.add('open');
      jsonRow.classList.add('open');
      jsonBox.focus();
    } else if (act === 'apply') {
      try {
        importTuning(jsonBox.value);
        refreshTuningPanel();
        jsonBox.classList.remove('open');
        jsonRow.classList.remove('open');
      } catch (err) {
        flashTune(e.target, 'Bad JSON');
      }
    } else if (act === 'cancel') {
      jsonBox.classList.remove('open');
      jsonRow.classList.remove('open');
    } else if (act === 'reset') {
      resetTuning();
      saveTuning();
      refreshTuningPanel();
    }
  });

  document.getElementById('device-frame').appendChild(panel);
  tunePanelEl = panel;
  return panel;
}

// ---------------------------------------------------------------
// Dev cheats
//
// Coins are the one thing in the meta that cannot be reached by fiddling with a
// slider: the Shop's cheapest rock is 850 and a match pays a few hundred, so
// checking a purchase used to mean playing five ends first. These sit above the
// sliders because that is the reason the panel gets opened outside gameplay.
//
// Everything goes through `awardCoins`, so the clamp-at-zero and the save to
// localStorage are the same ones the real economy uses — a cheated balance is
// not a special case anywhere downstream.
// ---------------------------------------------------------------

function buildDevCheats() {
  const sec = document.createElement('div');
  sec.className = 'tune-group';
  sec.innerHTML = `
    <div class="tune-group-head">Dev</div>
    <div class="tune-row">
      <div class="tune-row-top">
        <label title="Soft currency. Spent in the Shop and on Polish.">Coins</label>
        <span class="tune-val" id="tune-coins">0</span>
      </div>
      <div class="tune-row-bot">
        <button class="tune-btn" data-coins="1000">+1,000</button>
        <button class="tune-btn" data-coins="10000">+10,000</button>
        <button class="tune-btn tune-danger" data-coins="clear">Clear</button>
      </div>
    </div>
  `;

  sec.addEventListener('click', (e) => {
    const amt = e.target.dataset && e.target.dataset.coins;
    if (!amt) return;
    awardCoins(amt === 'clear' ? -inventory.coins : parseInt(amt, 10));
    refreshDevCheats();
  });

  return sec;
}

// The Shop and Inventory both print the balance in their header, so a screen
// sitting open behind the panel has to be rebuilt or it shows a stale number —
// and in the Shop the buy buttons' enabled state is wrong until it is.
function refreshDevCheats() {
  const el = document.getElementById('tune-coins');
  if (el) el.textContent = inventory.coins.toLocaleString();
  if (typeof currentScreen === 'undefined') return;
  if (currentScreen === 'inventory-screen' && typeof refreshInventoryScreen === 'function') refreshInventoryScreen();
  if (currentScreen === 'shop-screen' && typeof refreshShopScreen === 'function') refreshShopScreen();
}

function fmtTune(v, step) {
  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  return v.toFixed(decimals);
}

function flashTune(btn, msg) {
  const old = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = old; }, 900);
}

function refreshTuningPanel() {
  if (!tunePanelEl) return;
  refreshDevCheats();
  tunePanelEl.querySelectorAll('.tune-row').forEach(row => {
    const key = row.dataset.key;
    const [, , def, , , step] = TUNE_DEFS[key];
    row.querySelector('input').value = TUNE[key];
    row.querySelector('.tune-val').textContent = fmtTune(TUNE[key], step);
    row.classList.toggle('tune-dirty', TUNE[key] !== def);
  });
}

function toggleTuningPanel(force) {
  buildTuningPanel();
  tunePanelOpen = force === undefined ? !tunePanelOpen : force;
  tunePanelEl.classList.toggle('open', tunePanelOpen);
  if (tunePanelOpen) refreshTuningPanel();
}

window.addEventListener('keydown', (e) => {
  if (e.key === '`') { e.preventDefault(); toggleTuningPanel(); }
});
