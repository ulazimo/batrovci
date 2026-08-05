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
