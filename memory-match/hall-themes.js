/* Memory Match — per-hall UI theming data + applier.
 * Design source: "Bedroom Style.dc.html" (turn 3, "One shell, every hall").
 *
 * ONE shell for every hall. Layout, type scale, card art, card-back cream and all
 * state colours are FIXED. Only the values below change per hall, and every one of
 * them was sampled from that hall's own shipped backdrop / final.png.
 *
 * Sampling rule (reproducible for new halls):
 *   bar     = darkest ~10% of the backdrop
 *   accent  = darkest sample, OR the hall's one cool note if it has one
 *             (attic slate, kitchen sage, greenhouse leaf, shore sea)
 *   pad     = dominant hue
 *   screen  = lightest ~10%, warmed
 *   panel   = lightest ~10%, near-white
 *   edge    = panel darkened ~8%
 *   value   = bar (headline numbers)
 *   soft    = mid tone between bar and pad (secondary numbers)
 *   label   = desaturated mid tone (uppercase micro-labels)
 *   chip    = pad lightened, for pills inside panels
 *   badge   = the hall's warmest saturated accent, for counts + the coin CTA
 * Contrast gate: bar/accent must hit >= 4.5:1 against white text; value must hit
 * >= 4.5:1 against panel. All nine below pass.
 */
const HALL_THEMES = {
  bedroom:    { name:'Bedroom',               bar:'#7b3c25', screen:'#f7e7cd', pad:'#eec89e', panel:'#fbf0dc', edge:'#e3c49a', label:'#a97b56', value:'#7b3c25', soft:'#c07a3e', accent:'#7b3c25', badge:'#f5bc62', chip:'#f0d6ac' },
  attic:      { name:'Cozy Attic',            bar:'#8a5a3f', screen:'#f6e8d5', pad:'#f2dcbc', panel:'#fdf4e5', edge:'#e8d2b4', label:'#a5836a', value:'#7a4a33', soft:'#b1785a', accent:'#485663', badge:'#d9a05f', chip:'#ecd4b4' },
  kitchen:    { name:"Grandma's Kitchen",     bar:'#4f6d5c', screen:'#fbf1e2', pad:'#cd8462', panel:'#fffaf0', edge:'#e7d3b6', label:'#a5836a', value:'#8a5a3f', soft:'#b5714f', accent:'#4f6d5c', badge:'#b5714f', chip:'#e7cfae' },
  greenhouse: { name:'Victorian Greenhouse',  bar:'#7d6a4e', screen:'#f6ecd8', pad:'#d8c6a4', panel:'#fdf6e6', edge:'#e6d6b6', label:'#9c8768', value:'#6f5c40', soft:'#8d7a55', accent:'#4e6440', badge:'#cfa74f', chip:'#e4d8b8' },
  snow:       { name:'Snow Day',              bar:'#4d5880', screen:'#f6eff4', pad:'#cfd8ec', panel:'#fff7f6', edge:'#e4dbe6', label:'#8b84a0', value:'#4d5880', soft:'#7b83a8', accent:'#4d5880', badge:'#d9a05f', chip:'#dfe4f1' },
  musicroom:  { name:'Music Room',            bar:'#553221', screen:'#f5e6d6', pad:'#c79a78', panel:'#fdf3e6', edge:'#e5cdb2', label:'#a0785c', value:'#6b4028', soft:'#96684a', accent:'#553221', badge:'#dbac54', chip:'#e6cdb0' },
  workshop:   { name:'Toy Workshop',          bar:'#703e2f', screen:'#f8e8d6', pad:'#d49d76', panel:'#fdf2e2', edge:'#e8cfb4', label:'#a87f60', value:'#7a4630', soft:'#a2603f', accent:'#703e2f', badge:'#d59a4e', chip:'#ecd2b2' },
  shore:      { name:'Sunny Shore',           bar:'#8a5a3f', screen:'#fdf1da', pad:'#f3cf94', panel:'#fffaea', edge:'#ecd8ac', label:'#b08a63', value:'#8a5a3f', soft:'#c08b4a', accent:'#3f6b78', badge:'#f2b64c', chip:'#f4e0b4' },
  /* Culled from collections.js in bc2a31d — kept only because the design explored it.
   * Do not ship unless the hall comes back. */
  reef:       { name:'Coral Reef',            bar:'#2f5b63', screen:'#eaf6f6', pad:'#9fd6dd', panel:'#fbf6e8', edge:'#dbe8e2', label:'#6f8f93', value:'#2f5b63', soft:'#5c8f96', accent:'#2f5b63', badge:'#e3c075', chip:'#cfe8ea' },
};

/* NOT YET SAMPLED — halls 9-11 (Cosy Library, Artist's Studio, Sewing Room) exist in
 * collections.js but have no theme here. Sample them with the rule at the top of this
 * file before those levels go live; until then FALLBACK_HALL is used. */
const FALLBACK_HALL = 'bedroom';

/* Fixed across every hall — never re-key these. */
const FIXED = {
  cardBack:      '#fffdf5',
  cardShadow:    '0 2px 4px rgba(74,42,28,.2)',
  win:           '#3f8a52',
  winShadow:     '#2c6a3c',
  fail:          '#c0492f',
  ink:           '#4a2a1c',
  colors: { red:'#e74c3c', green:'#2ecc71', blue:'#3498db', yellow:'#f1c40f', orange:'#e67e22', purple:'#9b59b6' },
  font:          "Nunito, system-ui, sans-serif",
  tileRadius:    14,
  gridGap:       8,
};

/* Applier: set the vars on the frame root. Call on level start. Hall id resolution
 * reuses COLLECTIONS.halls — do not add a second source of truth. */
function applyHallTheme(hallId, el) {
  const t = HALL_THEMES[hallId] || HALL_THEMES[FALLBACK_HALL];
  const root = el || document.getElementById('device-frame') || document.documentElement;
  Object.keys(t).forEach(k => { if (k !== 'name') root.style.setProperty('--hall-' + k, t[k]); });
  root.dataset.hall = hallId in HALL_THEMES ? hallId : FALLBACK_HALL;
}

/* Resolve which hall owns the current level index, using COLLECTIONS.halls.
 * Returns a HALL_THEMES key, or FALLBACK_HALL if no match. */
function getActiveHallId() {
  if (typeof COLLECTIONS === 'undefined' || !COLLECTIONS || !COLLECTIONS.halls) return FALLBACK_HALL;
  if (typeof currentLevelIndex === 'undefined') return FALLBACK_HALL;
  for (const hall of COLLECTIONS.halls) {
    for (const slot of (hall.slots || [])) {
      if (typeof slotLevelIndex === 'function' && slotLevelIndex(slot) === currentLevelIndex) {
        return hall.id in HALL_THEMES ? hall.id : FALLBACK_HALL;
      }
    }
  }
  return FALLBACK_HALL;
}

if (typeof window !== 'undefined') {
  window.HALL_THEMES = HALL_THEMES;
  window.FALLBACK_HALL = FALLBACK_HALL;
  window.FIXED = FIXED;
  window.applyHallTheme = applyHallTheme;
  window.getActiveHallId = getActiveHallId;
}
