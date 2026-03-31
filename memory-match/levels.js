// ============================================================
// LEVELS
// ============================================================
const LEVELS = [
  { id:1,  cols:4, rows:4, colorCount:3, turns:12, target:250  },
  { id:2,  cols:4, rows:4, colorCount:3, turns:10, target:320  },
  { id:3,  cols:4, rows:4, colorCount:4, turns:14, target:500  },
  { id:4,  cols:5, rows:5, colorCount:4, turns:13, target:620  },
  { id:5,  cols:5, rows:5, colorCount:4, turns:11, target:750  },
  { id:6,  cols:5, rows:5, colorCount:4, turns:14, target:600, locked:[[0,2],[2,0],[2,4]] },
  { id:7,  cols:5, rows:5, colorCount:4, turns:12, target:700, locked:[[0,1],[0,3],[2,2],[4,1],[4,3]] },
  { id:8,  cols:6, rows:6, colorCount:4, turns:15, target:900  },
  { id:9,  cols:6, rows:6, colorCount:4, turns:13, target:1000, locked:[[1,1],[1,4],[4,1],[4,4]] },
  { id:10, cols:6, rows:6, colorCount:4, turns:12, target:1100 },
  { id:11, cols:6, rows:6, colorCount:4, turns:14, target:1100, locked:[[0,2],[0,3],[2,0],[2,5],[5,2],[5,3]] },
  { id:12, cols:6, rows:6, colorCount:4, turns:12, target:1200, locked:[[0,1],[0,4],[1,0],[1,5],[4,0],[4,5],[5,1],[5,4]] },
  { id:13, cols:6, rows:6, colorCount:4, turns:10, target:1300 },
  { id:14, cols:6, rows:6, colorCount:4, turns:12, target:1400, locked:[[0,0],[0,2],[0,3],[0,5],[2,1],[2,4],[3,1],[3,4],[5,0],[5,5]] },
  { id:15, cols:6, rows:6, colorCount:4, turns:10, target:1600, locked:[[0,0],[0,1],[0,4],[0,5],[1,0],[1,5],[4,0],[4,5],[5,0],[5,1],[5,4],[5,5]] },
];
const ALL_COLORS = ['red','green','blue','yellow'];
