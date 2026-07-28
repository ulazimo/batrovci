// ============================================================
// COLLECTIONS TAB — authors ../collections.json (+ its .js twin): the item art
// registry, the home-screen halls and their item slots, and the per-level
// behind-the-board art.
//
// Deliberately a separate file from editor.js (which is large and owns
// levels/progression) so the two don't collide. The tab plugs into editor.js's
// generic switcher purely via data-tab="collections".
//
// The centre pane is an <iframe src="preview.html"> that loads the GAME's real
// style.css, so what you drag is what ships. Same-origin, so we talk to it via
// postMessage + a direct window.PREVIEW handle.
// ============================================================

let COLL = null;             // the working collections dataset
let collHallIdx = 0;
let collSlotIdx = 0;
let collDirty = false;
let collDirHandle = null;    // File System Access directory handle (memory-match/)
let previewReady = false;

const collEl = id => document.getElementById(id);

// ------------------------------------------------------------
// LOAD
// ------------------------------------------------------------
async function collLoad() {
  try {
    const res = await fetch('../collections.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    COLL = await res.json();
  } catch (e) {
    collSetStatus('could not fetch ../collections.json — ' + e.message, 'dirty');
    return;
  }
  collHallIdx = 0; collSlotIdx = 0; collDirty = false;
  collRenderAll();
  collSetStatus('loaded');
}

function collSetStatus(msg, cls) {
  const el = collEl('coll-status');
  if (el) { el.textContent = msg; el.className = cls || ''; }
}

function collTouch() {
  collDirty = true;
  collSetStatus('unsaved changes', 'dirty');
}

// ------------------------------------------------------------
// RENDER
// ------------------------------------------------------------
function collRenderAll() {
  if (!COLL) return;
  collRenderHalls();
  collRenderItems();
  collRenderHallProps();
  collRenderSlots();
  collRenderBoardArt();
  collValidate();
  collPushPreview();
}

function collRenderHalls() {
  const wrap = collEl('hall-list');
  wrap.innerHTML = COLL.halls.map((h, i) => {
    const kind = h.backdrop ? 'image' : ('theme:' + (h.theme || '—'));
    return `<div class="hall-row${i === collHallIdx ? ' active' : ''}" data-i="${i}">
      <span>${h.name || h.id}</span>
      <span class="hr-kind${h.backdrop ? ' img' : ''}">${kind}</span></div>`;
  }).join('');
  wrap.querySelectorAll('.hall-row').forEach(r => r.onclick = () => {
    collHallIdx = +r.dataset.i; collSlotIdx = 0; collRenderAll();
  });
}

function collRenderItems() {
  const wrap = collEl('item-list');
  const used = new Set();
  COLL.halls.forEach(h => (h.slots || []).forEach(s => used.add(s.item)));
  Object.values(COLL.boardArt || {}).forEach(byLvl =>
    Object.values(byLvl).forEach(p => used.add(p.item)));

  wrap.innerHTML = Object.entries(COLL.items).map(([key, it]) => `
    <div class="item-row" title="${key}">
      <img src="../${it.file}" alt="">
      <div><div>${it.name || key}</div>
        <div class="ir-meta">${it.view.w}×${it.view.h} · ${(it.view.w / it.view.h).toFixed(2)}${it.layer ? ' · +layer' : ''}${used.has(key) ? '' : ' · unused'}</div>
      </div>
      <button data-del="${key}" title="Remove from registry">✕</button>
    </div>`).join('');
  wrap.querySelectorAll('button[data-del]').forEach(b => b.onclick = () => {
    const key = b.dataset.del;
    if (used.has(key)) { alert(`"${key}" is still referenced by a hall slot or board art.`); return; }
    delete COLL.items[key]; collTouch(); collRenderAll();
  });
}

function collRenderHallProps() {
  const h = COLL.halls[collHallIdx];
  const wrap = collEl('hall-props');
  if (!h) { wrap.innerHTML = '<p style="font-size:12px;color:#8d84ad">No hall selected.</p>'; return; }
  const themeOpts = ['<option value="">(none — image backdrop)</option>'].concat(
    Object.keys(COLL.themes || {}).map(t =>
      `<option value="${t}"${h.theme === t ? ' selected' : ''}>${t}</option>`)).join('');
  wrap.innerHTML = `
    <div class="prop-row"><label>Name</label><input type="text" id="hp-name" value="${h.name || ''}"></div>
    <div class="prop-row"><label>Backdrop</label><input type="text" id="hp-backdrop" value="${h.backdrop || ''}" placeholder="art/backdrops/x.png"></div>
    <div class="prop-row"><label>CSS theme</label><select id="hp-theme">${themeOpts}</select></div>
    <div class="prop-row"><label>Shadow</label><input type="checkbox" id="hp-shadow"${h.shadow ? ' checked' : ''}></div>
    <div class="prop-row"><label>Glow</label><input type="checkbox" id="hp-glow"${h.glow ? ' checked' : ''}></div>
    <div class="prop-row"><label>Notes ♪</label><input type="checkbox" id="hp-notes"${h.notes ? ' checked' : ''}></div>`;
  const bind = (id, fn) => { const e = collEl(id); if (e) e.onchange = () => { fn(e); collTouch(); collRenderAll(); }; };
  bind('hp-name', e => h.name = e.value);
  bind('hp-backdrop', e => { const v = e.value.trim(); if (v) h.backdrop = v; else delete h.backdrop; });
  bind('hp-theme', e => { const v = e.value; if (v) h.theme = v; else delete h.theme; });
  bind('hp-shadow', e => h.shadow = e.checked);
  bind('hp-glow', e => h.glow = e.checked);
  bind('hp-notes', e => h.notes = e.checked);
}

function collRenderSlots() {
  const h = COLL.halls[collHallIdx];
  const wrap = collEl('slot-props');
  if (!h || !(h.slots || []).length) { wrap.innerHTML = '<p style="font-size:12px;color:#8d84ad">No slots.</p>'; return; }
  collSlotIdx = Math.min(collSlotIdx, h.slots.length - 1);
  const s = h.slots[collSlotIdx];

  const tabs = h.slots.map((sl, i) =>
    `<span class="slot-tab${i === collSlotIdx ? ' active' : ''}" data-i="${i}">${sl.item}</span>`).join('');
  const itemOpts = Object.keys(COLL.items).map(k =>
    `<option value="${k}"${s.item === k ? ' selected' : ''}>${k}</option>`).join('');

  const isLayer = s.kind === 'layer';
  const item = COLL.items[s.item] || {};
  const geometry = isLayer
    ? `<p style="font-size:11px;color:#8d84ad;line-height:1.4;margin:2px 0 0">
         Full-scene layer — position is baked into the art
         (<code style="color:#9ecbff">${item.layer || '(no layer file!)'}</code>),
         drawn to fill the picture box. Nothing to place.</p>`
    : `<div class="prop-row"><label>Left %</label><input type="number" id="sp-left" value="${s.left}" step="0.1"></div>
       <div class="prop-row"><label>Bottom %</label><input type="number" id="sp-bottom" value="${s.bottom}" step="0.1"></div>
       <div class="prop-row"><label>Height cqh</label><input type="number" id="sp-h" value="${s.h}" step="0.1"></div>
       <div class="prop-row"><label>Pedestal cqw</label><input type="number" id="sp-pw" value="${s.pw ?? ''}" step="1" placeholder="(none)"></div>`;

  wrap.innerHTML = `<div class="slot-tab-row">${tabs}</div>
    <div class="prop-row"><label>Item</label><select id="sp-item">${itemOpts}</select></div>
    <div class="prop-row"><label>Level id</label><input type="number" id="sp-level" value="${s.levelId}" min="1"></div>
    <div class="prop-row"><label>Kind</label><select id="sp-kind">
      <option value=""${isLayer ? '' : ' selected'}>placed item</option>
      <option value="layer"${isLayer ? ' selected' : ''}>full-scene layer</option>
    </select></div>
    ${geometry}`;

  wrap.querySelectorAll('.slot-tab').forEach(t => t.onclick = () => {
    collSlotIdx = +t.dataset.i; collRenderSlots(); collPushPreview();
  });
  const bind = (id, fn) => { const e = collEl(id); if (e) e.oninput = () => { fn(e); collTouch(); collPushPreview(); collValidate(); }; };
  // A number input reads back "" mid-edit (cleared, or a locale comma the browser
  // rejects). Coercing that with + gives 0 and teleports the item, so skip it.
  const num = (e, apply) => { const v = parseFloat(e.value); if (Number.isFinite(v)) apply(v); };
  bind('sp-item', e => { s.item = e.value; collRenderSlots(); });
  bind('sp-level', e => num(e, v => s.levelId = Math.round(v)));
  bind('sp-kind', e => {
    if (e.value === 'layer') { s.kind = 'layer'; }
    else {
      delete s.kind;
      // a placed item needs geometry; seed something visible rather than NaN
      if (typeof s.left !== 'number') s.left = 50;
      if (typeof s.bottom !== 'number') s.bottom = 30;
      if (typeof s.h !== 'number') s.h = 20;
    }
    collRenderSlots();
  });
  bind('sp-left', e => num(e, v => s.left = v));
  bind('sp-bottom', e => num(e, v => s.bottom = v));
  bind('sp-h', e => num(e, v => s.h = v));
  bind('sp-pw', e => { const v = e.value.trim(); if (v === '') delete s.pw; else num(e, x => s.pw = x); });
}

function collRenderBoardArt() {
  const h = COLL.halls[collHallIdx];
  const wrap = collEl('boardart-list');
  if (!h) { wrap.innerHTML = ''; return; }
  const style = collEl('ba-style').value || 'cleaningxl';
  const byLvl = (COLL.boardArt[style] = COLL.boardArt[style] || {});
  wrap.innerHTML = (h.slots || []).map(s => {
    const p = byLvl[String(s.levelId)];
    return `<div class="prop-row">
      <label>lvl ${s.levelId}</label>
      <span style="flex:1;font-size:11px;color:${p ? (p.item === s.item ? '#c6f5d4' : '#ffe6b8') : '#ff9b9b'}">
        ${p ? p.item + (p.item === s.item ? '' : ' (≠ slot)') : 'missing'}</span>
      <button class="seg" data-sync="${s.levelId}" data-item="${s.item}" style="font-size:10px">use “${s.item}”</button>
    </div>`;
  }).join('');
  wrap.querySelectorAll('button[data-sync]').forEach(b => b.onclick = () => {
    const lvl = b.dataset.sync;
    byLvl[lvl] = Object.assign({ cx: 0.5, cy: 0.5, h: 0.9 }, byLvl[lvl], { item: b.dataset.item });
    collTouch(); collRenderBoardArt(); collValidate();
  });
}

// ------------------------------------------------------------
// VALIDATE — the payoff of one dataset: catch drift the game can't.
// ------------------------------------------------------------
function collValidate() {
  const out = [];
  const push = (cls, msg) => out.push(`<div class="v-row v-${cls}">${msg}</div>`);
  const style = (collEl('ba-style') || {}).value || 'cleaningxl';
  const byLvl = (COLL.boardArt || {})[style] || {};
  const seenLevel = new Map();

  COLL.halls.forEach(h => {
    if (!h.backdrop && !h.theme) push('err', `Hall “${h.name || h.id}” has neither a backdrop nor a CSS theme.`);
    if (h.theme && !(COLL.themes || {})[h.theme]) push('err', `Hall “${h.name || h.id}” uses theme “${h.theme}” which isn't in themes.`);
    const lvls = (h.slots || []).map(s => s.levelId).filter(Number.isFinite).sort((a, b) => a - b);
    if (lvls.length && lvls.some((v, i) => i && v !== lvls[i - 1] + 1))
      push('warn', `Hall “${h.name || h.id}” covers non-consecutive levels (${lvls.join(', ')}) — reveal order will jump.`);
    if (!(h.slots || []).length) push('warn', `Hall “${h.name || h.id}” has no slots.`);

    (h.slots || []).forEach(s => {
      const it = COLL.items[s.item];
      if (!it) { push('err', `Slot in “${h.name || h.id}” references unknown item “${s.item}”.`); return; }
      if (seenLevel.has(s.levelId))
        push('err', `Level ${s.levelId} is claimed by two slots (${seenLevel.get(s.levelId)} and ${h.id}).`);
      seenLevel.set(s.levelId, h.id);

      const ba = byLvl[String(s.levelId)];
      if (!ba) push('warn', `Level ${s.levelId} (${s.item}) has no ${style} board art — nothing is revealed as the board clears.`);
      else if (ba.item !== s.item) push('err', `Level ${s.levelId}: board art shows “${ba.item}” but the hall awards “${s.item}”.`);

      if (s.kind === 'layer') {
        if (!it.layer) push('err', `“${s.item}” is a layer slot but the item has no \`layer\` file.`);
        return;                         // position is baked in — no geometry to check
      }
      // geometry: does the art fit the picture?
      const artW = s.h * (it.view.w / it.view.h);
      if (s.bottom + s.h > 100) push('warn', `${s.item} overflows the top of the picture (bottom ${s.bottom} + h ${s.h} > 100).`);
      if (s.left - artW / 2 < 0 || s.left + artW / 2 > 100)
        push('warn', `${s.item} overflows the picture horizontally (width ≈ ${artW.toFixed(1)}% at left ${s.left}).`);
      if (s.bottom < 0) push('warn', `${s.item} sits below the picture bottom.`);
      if (h.backdrop && s.pw) push('warn', `${s.item} sets a pedestal width, but “${h.name || h.id}” is an image backdrop (pedestals are painted in).`);
    });

    // overlapping slots within a hall
    (h.slots || []).forEach((a, i) => (h.slots || []).slice(i + 1).forEach(b => {
      if (a.kind === 'layer' || b.kind === 'layer') return;   // layers are meant to stack
      const ia = COLL.items[a.item], ib = COLL.items[b.item];
      if (!ia || !ib) return;
      const aw = a.h * (ia.view.w / ia.view.h), bw = b.h * (ib.view.w / ib.view.h);
      const ox = Math.min(a.left + aw / 2, b.left + bw / 2) - Math.max(a.left - aw / 2, b.left - bw / 2);
      const oy = Math.min(a.bottom + a.h, b.bottom + b.h) - Math.max(a.bottom, b.bottom);
      if (ox > 0 && oy > 0) {
        const frac = (ox * oy) / Math.min(aw * a.h, bw * b.h);
        if (frac > 0.35) push('warn', `${a.item} and ${b.item} overlap by ~${Math.round(frac * 100)}% of the smaller one.`);
      }
    }));
  });

  Object.keys(COLL.items).forEach(k => {
    const it = COLL.items[k];
    if (!it.file) push('err', `Item “${k}” has no file.`);
    if (!it.view || !it.view.w || !it.view.h) push('err', `Item “${k}” has no usable view size.`);
  });

  if (!out.length) push('ok', 'No problems found.');
  collEl('validator').innerHTML = out.join('');
}

// ------------------------------------------------------------
// PREVIEW BRIDGE
// ------------------------------------------------------------
function collPushPreview() {
  const f = collEl('preview-frame');
  if (!f || !previewReady || !f.contentWindow || !f.contentWindow.PREVIEW) return;
  f.contentWindow.PREVIEW.render({
    hall: COLL.halls[collHallIdx], items: COLL.items,
    themes: COLL.themes, sel: collSlotIdx,
  });
}

window.addEventListener('message', e => {
  const f = collEl('preview-frame');
  if (!f || e.source !== f.contentWindow) return;
  const m = e.data || {};
  if (m.type === 'ready') { previewReady = true; collPushPreview(); return; }
  const h = COLL && COLL.halls[collHallIdx];
  if (!h) return;
  if (m.type === 'select') { collSlotIdx = m.index; collRenderSlots(); collPushPreview(); }
  else if (m.type === 'move') {
    const s = h.slots[m.index];
    if (!s) return;
    s.left = m.left; s.bottom = m.bottom;
    collPushPreview();
    ['sp-left', 'sp-bottom'].forEach((id, k) => {
      const el = collEl(id); if (el) el.value = k ? s.bottom : s.left;
    });
  } else if (m.type === 'commit') { collTouch(); collValidate(); }
});

// ------------------------------------------------------------
// ITEM INGEST — read the intrinsic size so `view` is never hand-typed.
// ------------------------------------------------------------
async function collIngestFiles(files) {
  const added = [];
  for (const file of files) {
    const isSvg = /\.svg$/i.test(file.name);
    const key = file.name.replace(/\.(png|svg|webp|jpe?g)$/i, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    let w, h;
    if (isSvg) {
      const text = await file.text();
      const m = text.match(/viewBox\s*=\s*["']\s*[\d.+-]+\s+[\d.+-]+\s+([\d.]+)\s+([\d.]+)/i);
      if (!m) { alert(`${file.name}: no viewBox found, can't derive its size.`); continue; }
      w = Math.round(+m[1]); h = Math.round(+m[2]);
    } else {
      const url = URL.createObjectURL(file);
      try {
        const dim = await new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
          im.onerror = () => rej(new Error('not an image'));
          im.src = url;
        });
        w = dim.w; h = dim.h;
      } catch (err) { alert(`${file.name}: ${err.message}`); continue; }
      finally { URL.revokeObjectURL(url); }
    }
    const folder = collEl('ingest-folder').value.trim().replace(/^\/+|\/+$/g, '') || 'art/new-hall';
    COLL.items[key] = {
      name: key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      file: `${folder}/${file.name}`, view: { w, h },
    };
    added.push({ key, file, folder });
  }
  if (!added.length) return;

  // Copy the asset next to the game if we have write access; otherwise the user
  // must drop the file in themselves — say so rather than silently half-working.
  if (collDirHandle) {
    for (const a of added) {
      try {
        // getDirectoryHandle takes ONE path segment — walk them, since hall art
        // lives a level down (art/<hall>/).
        let dir = collDirHandle;
        for (const seg of a.folder.split('/')) {
          dir = await dir.getDirectoryHandle(seg, { create: true });
        }
        const fh = await dir.getFileHandle(a.file.name, { create: true });
        const ws = await fh.createWritable();
        await ws.write(await a.file.arrayBuffer());
        await ws.close();
      } catch (err) { alert(`Could not write ${a.folder}/${a.file.name}: ${err.message}`); }
    }
    collSetStatus(`added ${added.length} item(s) and copied the file(s)`, 'dirty');
  } else {
    collSetStatus(`added ${added.length} item(s) — copy the file(s) into memory-match/ yourself, or grant folder access`, 'dirty');
  }
  collDirty = true;
  collRenderAll();
}

// ------------------------------------------------------------
// SAVE
// ------------------------------------------------------------
function collSerialize() {
  const json = JSON.stringify(COLL, null, 2);
  const js = '// Collections — item art registry, home halls, and per-level board art.\n' +
             '// Single source of truth for home-room.js (main menu) and board-bg.js (art\n' +
             '// revealed behind the board). Mirrors collections.json.\n' +
             '// Auto-generated by level-editor — edit there; hand-edits get overwritten.\n' +
             'COLLECTIONS = ' + json + ';\n';
  return { json, js };
}

async function collGrantFolder() {
  if (!window.showDirectoryPicker) {
    alert('This browser has no File System Access API — use Download instead (Chrome/Edge only).');
    return;
  }
  try {
    collDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    collSetStatus(`folder access granted (${collDirHandle.name}) — pick memory-match/`, 'saved');
    collEl('btn-coll-save').disabled = false;
  } catch (e) { /* user cancelled */ }
}

async function collSaveToDisk() {
  if (!collDirHandle) return collGrantFolder();
  const { json, js } = collSerialize();
  try {
    for (const [name, body] of [['collections.json', json], ['collections.js', js]]) {
      const fh = await collDirHandle.getFileHandle(name, { create: true });
      const ws = await fh.createWritable();
      await ws.write(body);
      await ws.close();
    }
    collDirty = false;
    collSetStatus('saved collections.json + collections.js', 'saved');
  } catch (e) {
    collSetStatus('save failed: ' + e.message, 'dirty');
    alert('Save failed: ' + e.message + '\nMake sure you granted access to the memory-match folder.');
  }
}

function collDownload() {
  const { json, js } = collSerialize();
  [['collections.json', json, 'application/json'],
   ['collections.js', js, 'application/javascript']].forEach(([name, body, type]) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  collSetStatus('downloaded — move both files into memory-match/', 'dirty');
}

// ------------------------------------------------------------
// INIT
// ------------------------------------------------------------
function initCollectionsTab() {
  if (!collEl('collections-layout')) return;

  // editor.js's top bar only knows levels-vs-progression, so on this tab its
  // Load/Download buttons would export the WRONG file. Hide them here — this tab
  // has its own Save/Download for collections.json.
  const topRight = document.querySelector('.top-bar-right');
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    if (topRight) topRight.style.visibility = btn.dataset.tab === 'collections' ? 'hidden' : '';
  }));

  collEl('btn-coll-reload').onclick = () => {
    if (collDirty && !confirm('Discard unsaved changes and reload from disk?')) return;
    collLoad();
  };
  collEl('btn-coll-grant').onclick = collGrantFolder;
  collEl('btn-coll-save').onclick = collSaveToDisk;
  collEl('btn-coll-download').onclick = collDownload;
  collEl('ba-style').onchange = () => { collRenderBoardArt(); collValidate(); };

  collEl('btn-add-hall').onclick = () => {
    const n = COLL.halls.length + 1;
    COLL.halls.push({ id: 'hall' + n, name: 'Hall ' + n, backdrop: '', shadow: true, slots: [] });
    collHallIdx = COLL.halls.length - 1; collTouch(); collRenderAll();
  };
  collEl('btn-add-slot').onclick = () => {
    const h = COLL.halls[collHallIdx];
    if (!h) return;
    const firstItem = Object.keys(COLL.items)[0];
    const maxLvl = Math.max(0, ...COLL.halls.flatMap(x => (x.slots || []).map(s => s.levelId)));
    h.slots = h.slots || [];
    h.slots.push({ item: firstItem, levelId: maxLvl + 1, left: 50, bottom: 30, h: 20 });
    collSlotIdx = h.slots.length - 1; collTouch(); collRenderAll();
  };
  collEl('btn-del-slot').onclick = () => {
    const h = COLL.halls[collHallIdx];
    if (!h || !(h.slots || []).length) return;
    h.slots.splice(collSlotIdx, 1); collSlotIdx = 0; collTouch(); collRenderAll();
  };

  // aspect toggles — the point is checking how `cover` crops per device
  collEl('preview-bar').querySelectorAll('[data-aspect]').forEach(b => b.onclick = () => {
    collEl('preview-bar').querySelectorAll('[data-aspect]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const [w, h] = b.dataset.aspect.split('x').map(Number);
    const f = collEl('preview-frame');
    if (f.contentWindow && f.contentWindow.PREVIEW) f.contentWindow.PREVIEW.setAspect([w, h]);
  });

  const drop = collEl('item-drop');
  const input = collEl('item-file');
  drop.onclick = () => input.click();
  input.onchange = () => { if (input.files.length) collIngestFiles([...input.files]); input.value = ''; };
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => {
    e.preventDefault(); drop.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => {
    e.preventDefault(); drop.classList.remove('over');
  }));
  drop.addEventListener('drop', e => {
    const files = [...(e.dataTransfer.files || [])];
    if (files.length) collIngestFiles(files);
  });

  window.addEventListener('beforeunload', e => {
    if (collDirty) { e.preventDefault(); e.returnValue = ''; }
  });

  collEl('btn-coll-save').disabled = true;
  collLoad();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCollectionsTab);
else initCollectionsTab();
