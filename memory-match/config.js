// ============================================================
// CONFIG — shared constants
// ============================================================
const ALL_COLORS = ['red', 'green', 'blue', 'yellow', 'orange', 'purple'];

// Single source of truth for each color's CSS hex (particles, tints, swatches,
// banners). A level's `colorCount` slices ALL_COLORS into ACTIVE_COLORS, so the
// 5th/6th (orange/purple) only appear when a level opts into 5 or 6 colors.
const COLOR_HEX = {
  red:    '#e74c3c',
  green:  '#2ecc71',
  blue:   '#3498db',
  yellow: '#f1c40f',
  orange: '#e67e22',
  purple: '#9b59b6',
};
