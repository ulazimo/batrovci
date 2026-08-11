/*
 * ============================================================
 *  MEMORY MATCH — Google Sheet analytics endpoint (Apps Script)
 * ============================================================
 *
 *  This is the little backend that receives each match result from the game
 *  and appends it as a row to your spreadsheet. It's the standard (and only)
 *  way to write to a Google Sheet from a static web page.
 *
 *  Target spreadsheet:
 *  https://docs.google.com/spreadsheets/d/12lUETa2baAt4GqxUa9G4Bk3FJuE8V6y9T4g0OdU7VMM/edit
 *
 *  ── ONE-TIME SETUP ──────────────────────────────────────────
 *  1. Open the spreadsheet above.
 *  2. Menu:  Extensions → Apps Script.  A code editor opens.
 *  3. Delete whatever is in Code.gs and paste THIS ENTIRE FILE in. Save (⌘/Ctrl+S).
 *  4. Click "Deploy" → "New deployment".
 *       • Click the gear ⚙ next to "Select type" → choose "Web app".
 *       • Description:        Memory Match analytics
 *       • Execute as:         Me (your account)
 *       • Who has access:     Anyone            ← important, so the game can post
 *       • Click "Deploy". Approve the permissions prompt (it's your own script).
 *  5. Copy the "Web app URL" it gives you. It ends in  /exec.
 *  6. Put that URL into the game. Either:
 *       (a) paste it as ANALYTICS_ENDPOINT at the top of analytics-sheet.js, OR
 *       (b) run this once in the browser console while the game is open:
 *           localStorage.setItem('mm_analytics_endpoint',
 *             'PASTE_YOUR_/exec_URL_HERE');
 *
 *  That's it. Play a level; a new row appears in the sheet.
 *
 *  ── IF YOU CHANGE THE SCRIPT LATER ─────────────────────────
 *  Re-deploy via Deploy → "Manage deployments" → edit (pencil) → "New version",
 *  so the same /exec URL keeps working. A brand-new deployment gives a new URL.
 *
 *  ── COLUMNS ────────────────────────────────────────────────
 *  Headers are created automatically from the first result received, and any
 *  new field added to the game later is appended as a new column on the fly —
 *  you never have to edit the sheet by hand.
 *
 *  TABS: each payload may carry a `sheet` field naming the tab it belongs in.
 *  Missing/blank → 'Results'. The tab is CREATED automatically if absent, so you
 *  never add one by hand. `sheet` itself is not written as a column.
 *
 *  'Results' (one row per finished match):
 *    timestamp · username · outcome · journey · level · levelIndex ·
 *    turnsStart · turnsEnd · turnsTaken · turnsRefunded · score · stars ·
 *    powerUps · powerUpsTotal · durationSec
 *  (turnsTaken = actual turns played; NOT turnsStart - turnsEnd, because a colour
 *   clear refunds its turn. turnsTaken = (turnsStart - turnsEnd) + turnsRefunded.
 *   durationSec = wall-clock seconds from pressing Play to the win/fail, and it
 *   keeps running through a coin-continue, so it covers the whole attempt.)
 *
 *  'Purchases' (one row per shop buy):
 *    timestamp · username · journey · level · levelIndex · previousState ·
 *    item · itemName · quantity · cost · coinsBefore · coinsAfter
 *  (previousState = what the player was doing before buying: boot, prelevel,
 *   in-level, level-complete or level-failed. coinsBefore is the balance BEFORE
 *   the purchase; coinsAfter = coinsBefore - cost.)
 *
 *  'Logins' (one row per app launch — logged from boot.js after consent):
 *    timestamp · username · user_id · is_registration · device_type ·
 *    build_platform · country · network_connection_type · application_version ·
 *    timezone · os_version · device_manufacturer · device_model · device_cpu_type ·
 *    device_gpu_name · device_memory_size_mb · device_tier · screen_width_px ·
 *    screen_height_px · screen_dpi
 *  (is_registration is TRUE only on the first-ever launch of a device, when its
 *   user_id is minted; every launch after is FALSE. Fields the platform can't
 *   supply — most device_* fields on the web, plus device_cpu_type everywhere —
 *   arrive blank. On the native app the Capacitor Device/App/Network plugins fill
 *   manufacturer, model, os_version, app version and wifi/cellular.)
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // serialize writes so concurrent posts don't clobber

    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Which tab? The payload's `sheet` field, defaulting to 'Results'. It's routing
    // metadata, not data — strip it so it never becomes a column.
    var tabName = (data.sheet ? String(data.sheet) : 'Results');
    delete data.sheet;

    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      // 'Results' adopts the very first (default) tab so an untouched, empty
      // spreadsheet doesn't end up with a stray blank "Sheet1". Any other tab
      // (e.g. 'Purchases') is simply created.
      if (tabName === 'Results' && ss.getSheets().length === 1 && ss.getSheets()[0].getLastRow() === 0) {
        sheet = ss.getSheets()[0];
        sheet.setName(tabName);
      } else {
        sheet = ss.insertSheet(tabName);
      }
    }

    // Read existing header row (if any).
    var headers = [];
    if (sheet.getLastRow() > 0) {
      headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn()))
                     .getValues()[0]
                     .filter(function (h) { return h !== '' && h !== null; });
    }

    // Add any keys we haven't seen before as new columns.
    var newHeaders = Object.keys(data).filter(function (k) {
      return headers.indexOf(k) === -1;
    });
    if (newHeaders.length) {
      headers = headers.concat(newHeaders);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }

    // Append the row, aligned to the header order.
    var row = headers.map(function (h) {
      var v = data[h];
      return (v === undefined || v === null) ? '' : v;
    });
    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// Visiting the URL in a browser just confirms it's live (handy for testing).
function doGet() {
  return ContentService.createTextOutput('Memory Match analytics endpoint is live.');
}

/*
 * ============================================================
 *  DASHBOARDS — summarized views built from the raw 'Results' tab
 * ============================================================
 *
 *  These read the 'Results' rows (never the game) and (re)generate a handful
 *  of summary tabs. Fully idempotent — safe to run any time; each run wipes and
 *  rewrites the summary tabs from the current data. Nothing here touches the
 *  raw 'Results' / 'Purchases' data.
 *
 *  HOW TO RUN
 *    • Reload the spreadsheet once after saving this script — a "📊 Analytics"
 *      menu appears. Pick "Rebuild dashboards now".
 *    • Or run it automatically: "📊 Analytics → Auto-rebuild hourly" installs a
 *      time trigger so the tabs stay fresh on their own.
 *
 *  TABS PRODUCED
 *    • 'Leaderboard'        one row per player, sorted by furthest level reached
 *                           (+ unique-player and total-match counts up top). Each
 *                           player NAME is a link that jumps to their block in
 *                           'Player Detail'.
 *    • 'Player Detail'      one consolidated tab, all players stacked. Per player,
 *                           one row per level they played: plays, wins/fails,
 *                           success rate, turns taken / left / refunded, best
 *                           score, ★, avg duration, AND a column per power-up.
 *                           Reached by clicking a player on the Leaderboard;
 *                           A1 has a "◂ Back to Leaderboard" link.
 *    • 'Level Stats'        one row per level (across all players): plays, success
 *                           rate, turns taken / left / refunded vs. the turn
 *                           budget, an "enough turns?" verdict, avg duration.
 *    • 'Power-Ups Overview' one row per power-up: total uses, share, how many
 *                           players used it, uses per user. (Per-player, per-level
 *                           power-up detail lives in 'Player Detail'.)
 */

// The client joins each power-up count with a '×' (U+00D7) in the powerUps cell,
// e.g. "Peek×2, Recall×1". We split on that same character to rebuild the counts.
var MULT = '×';

// ---- small helpers ----------------------------------------------------------
function dash_num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function dash_avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }
function dash_round(n, d) { var f = Math.pow(10, d || 0); return Math.round(n * f) / f; }
function dash_pct(n) { return dash_round(n * 100, 1) + '%'; }
function dash_mmss(sec) { sec = Math.round(sec); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
function dash_fmtDate(iso) { var s = String(iso || ''); return s.length >= 16 ? s.slice(0, 16).replace('T', ' ') : s; }

// Read the 'Results' tab into an array of plain objects (header-driven, so a
// changed column order or an extra column doesn't break anything). null = no data.
function dash_readResults(ss) {
  var sheet = ss.getSheetByName('Results');
  if (!sheet || sheet.getLastRow() < 2) return null;
  var values = sheet.getDataRange().getValues();
  var idx = {};
  values[0].forEach(function (h, i) { idx[String(h).trim()] = i; });
  var get = function (row, key) { return idx[key] === undefined ? '' : row[idx[key]]; };
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row.join('') === '') continue;
    rows.push({
      timestamp:     get(row, 'timestamp'),
      username:      String(get(row, 'username') || 'anonymous'),
      outcome:       String(get(row, 'outcome') || ''),
      journey:       String(get(row, 'journey') || '(none)'),
      level:         get(row, 'level'),
      levelIndex:    dash_num(get(row, 'levelIndex')),
      turnsStart:    dash_num(get(row, 'turnsStart')),
      turnsEnd:      dash_num(get(row, 'turnsEnd')),
      turnsTaken:    dash_num(get(row, 'turnsTaken')),
      turnsRefunded: dash_num(get(row, 'turnsRefunded')),
      score:         dash_num(get(row, 'score')),
      stars:         dash_num(get(row, 'stars')),
      powerUps:      String(get(row, 'powerUps') || ''),
      powerUpsTotal: dash_num(get(row, 'powerUpsTotal')),
      durationSec:   dash_num(get(row, 'durationSec')),
    });
  }
  return rows.length ? rows : null;
}

// "Peek×2, Recall×1" -> { Peek: 2, Recall: 1 }
function dash_parsePU(str) {
  var out = {};
  if (!str) return out;
  String(str).split(',').forEach(function (part) {
    part = part.trim();
    if (!part) return;
    var i = part.lastIndexOf(MULT);
    var label = i === -1 ? part : part.slice(0, i).trim();
    var n = i === -1 ? 1 : (dash_num(part.slice(i + 1)) || 1);
    if (label) out[label] = (out[label] || 0) + n;
  });
  return out;
}

// (Re)create a tab and dump a 2D matrix, with a styled/frozen header row.
function dash_writeSheet(ss, name, matrix) {
  var sheet = ss.getSheetByName(name);
  if (sheet) sheet.clear(); else sheet = ss.insertSheet(name);
  if (!matrix.length) matrix = [['(no data yet)']];
  var cols = matrix.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
  matrix = matrix.map(function (r) { r = r.slice(); while (r.length < cols) r.push(''); return r; });
  sheet.getRange(1, 1, matrix.length, cols).setValues(matrix);
  return sheet;
}

function dash_styleHeader(sheet, rowIndex, cols) {
  sheet.setFrozenRows(rowIndex);
  sheet.getRange(rowIndex, 1, 1, cols)
       .setFontWeight('bold').setBackground('#4a2f7a').setFontColor('#ffffff');
}

// ---- Shared per-player aggregate (Leaderboard + Player Detail + Power-Ups) ---
// Builds, per player: headline totals AND a per-level breakdown (stats + power-
// ups). Level key is journey+index, since the same index is a different level
// across journeys. `names` is sorted the way the Leaderboard ranks: furthest
// level, then wins, then best score.
function dash_aggPlayers(rows) {
  var players = {}, globalTotals = {}, labelSet = {};
  rows.forEach(function (r) {
    var P = players[r.username] || (players[r.username] = {
      matches: 0, wins: 0, fails: 0, bestScore: 0, stars: 0, totalPU: 0,
      reachedIndex: -1, reachedLevel: '', reachedJourney: '', last: '', levels: {}
    });
    P.matches++;
    if (r.outcome === 'complete') { P.wins++; P.stars = Math.max(P.stars, r.stars); }
    else if (r.outcome === 'fail') P.fails++;
    P.bestScore = Math.max(P.bestScore, r.score);
    P.totalPU += r.powerUpsTotal;
    if (r.levelIndex > P.reachedIndex) { P.reachedIndex = r.levelIndex; P.reachedLevel = r.level; P.reachedJourney = r.journey; }
    if (String(r.timestamp) > P.last) P.last = String(r.timestamp);

    var key = r.journey + '##' + r.levelIndex;
    var L = P.levels[key] || (P.levels[key] = {
      journey: r.journey, level: r.level, idx: r.levelIndex,
      plays: 0, wins: 0, fails: 0, taken: [], endWins: [], refunded: [], dur: [], best: 0, star: 0, pu: {}
    });
    L.plays++;
    if (r.outcome === 'complete') { L.wins++; L.endWins.push(r.turnsEnd); L.star = Math.max(L.star, r.stars); }
    else if (r.outcome === 'fail') L.fails++;
    L.taken.push(r.turnsTaken);
    L.refunded.push(r.turnsRefunded);
    L.dur.push(r.durationSec);
    L.best = Math.max(L.best, r.score);
    var pu = dash_parsePU(r.powerUps);
    Object.keys(pu).forEach(function (lbl) {
      var n = pu[lbl]; labelSet[lbl] = true;
      L.pu[lbl] = (L.pu[lbl] || 0) + n;
      globalTotals[lbl] = (globalTotals[lbl] || 0) + n;
    });
  });
  var labels = Object.keys(labelSet).sort(function (a, b) {
    return (globalTotals[b] || 0) - (globalTotals[a] || 0) || (a < b ? -1 : 1);
  });
  var names = Object.keys(players).sort(function (a, b) {
    var A = players[a], B = players[b];
    if (B.reachedIndex !== A.reachedIndex) return B.reachedIndex - A.reachedIndex;
    if (B.wins !== A.wins) return B.wins - A.wins;
    return B.bestScore - A.bestScore;
  });
  return { players: players, names: names, labels: labels, globalTotals: globalTotals };
}

// ---- Leaderboard (the hub — each player links into Player Detail) -----------
function dash_buildLeaderboard(ss, sheet, agg, rows, detailGid, startRow) {
  var names = agg.names, players = agg.players;
  var matrix = [
    ['Memory Match — Leaderboard  (click a player to open their detailed journey)'],
    ['Unique players', names.length, '', 'Total matches', rows.length],
    [],
    ['Rank', 'Player', 'Furthest level', 'Journey', 'Matches', 'Wins', 'Fails',
     'Win rate', 'Best score', '★ best', 'Power-ups used', 'Last played'],
  ];
  var headerRows = matrix.length; // 4 (data starts on the next row)
  names.forEach(function (n, i) {
    var u = players[n];
    matrix.push([
      i + 1, n, u.reachedLevel, u.reachedJourney, u.matches, u.wins, u.fails,
      u.matches ? dash_pct(u.wins / u.matches) : '—',
      u.bestScore, u.stars, u.totalPU, dash_fmtDate(u.last)
    ]);
  });
  matrix = dash_pad(matrix);
  sheet.getRange(1, 1, matrix.length, matrix[0].length).setValues(matrix);

  // Player name -> link that jumps to that player's first row in Player Detail.
  names.forEach(function (n, i) {
    var target = startRow[n] || 1;
    var label = String(n).replace(/"/g, '""');
    sheet.getRange(headerRows + 1 + i, 2).setFormula(
      '=HYPERLINK("#gid=' + detailGid + '&range=A' + target + '","' + label + '")');
  });

  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  dash_styleHeader(sheet, headerRows, 12);
  sheet.autoResizeColumns(1, 12);
}

// ---- Player Detail (all players stacked; drilled into from the Leaderboard) --
// Returns { player -> 1-based sheet row of their first level row } so the
// Leaderboard can anchor its links.
function dash_buildPlayerDetail(ss, sheet, agg, lbGid) {
  var names = agg.names, players = agg.players, labels = agg.labels;
  var header = ['Player', 'Journey', 'Level', 'Idx', 'Plays', 'Wins', 'Fails', 'Success rate',
    'Avg turns taken', 'Avg turns left (wins)', 'Avg refunded', 'Best score', '★ best', 'Avg dur (m:ss)']
    .concat(labels).concat(['Total PU', 'PU / play']);
  var W = header.length;
  var SR_COL = 8; // 'Success rate'
  var matrix = [[''], header]; // row 1 = backlink (set below), row 2 = header
  var startRow = {};
  names.forEach(function (n) {
    var P = players[n];
    var lvKeys = Object.keys(P.levels).sort(function (a, b) {
      var A = P.levels[a], B = P.levels[b];
      if (A.journey !== B.journey) return A.journey < B.journey ? -1 : 1;
      return A.idx - B.idx;
    });
    startRow[n] = matrix.length + 1; // where this player's first row will land
    lvKeys.forEach(function (k) {
      var L = P.levels[k], row = [
        n, L.journey, L.level, L.idx, L.plays, L.wins, L.fails,
        L.plays ? L.wins / L.plays : 0,
        dash_round(dash_avg(L.taken), 1), dash_round(dash_avg(L.endWins), 1), dash_round(dash_avg(L.refunded), 1),
        L.best, L.star, dash_mmss(dash_avg(L.dur))
      ], tot = 0;
      labels.forEach(function (l) { var v = L.pu[l] || 0; row.push(v); tot += v; });
      row.push(tot);
      row.push(L.plays ? dash_round(tot / L.plays, 2) : 0);
      matrix.push(row);
    });
  });
  matrix = dash_pad(matrix);
  sheet.getRange(1, 1, matrix.length, matrix[0].length).setValues(matrix);

  sheet.getRange(1, 1).setFormula('=HYPERLINK("#gid=' + lbGid + '","◂ Back to Leaderboard")')
       .setFontWeight('bold').setFontSize(12);
  sheet.getRange(2, 1, 1, W).setFontWeight('bold').setBackground('#4a2f7a').setFontColor('#ffffff');
  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(1);
  if (matrix.length > 2) sheet.getRange(3, SR_COL, matrix.length - 2, 1).setNumberFormat('0.0%');
  sheet.autoResizeColumns(1, W);
  return startRow;
}

// ---- Level Stats ------------------------------------------------------------
function dash_turnVerdict(sr, plays, avgLeftW, budget) {
  if (plays < 3) return 'Low data';
  if (sr < 0.40) return 'Tight — low win rate';
  if (budget > 0 && avgLeftW >= budget * 0.34) return 'Generous — turns to spare';
  return 'OK';
}

function dash_buildLevelStats(ss, rows) {
  var byLevel = {};
  rows.forEach(function (r) {
    var key = r.journey + '##' + r.levelIndex;
    var g = byLevel[key] || (byLevel[key] = {
      journey: r.journey, levelIndex: r.levelIndex, level: r.level,
      plays: 0, wins: 0, fails: 0,
      budgets: [], starts: [], taken: [], takenWins: [], endAll: [], endWins: [], refunded: [], dur: []
    });
    g.plays++;
    if (r.outcome === 'complete') { g.wins++; g.takenWins.push(r.turnsTaken); g.endWins.push(r.turnsEnd); }
    else if (r.outcome === 'fail') g.fails++;
    g.budgets.push(r.turnsStart);
    g.starts.push(r.turnsStart);
    g.taken.push(r.turnsTaken);
    g.endAll.push(r.turnsEnd);
    g.refunded.push(r.turnsRefunded);
    g.dur.push(r.durationSec);
  });

  var keys = Object.keys(byLevel).sort(function (a, b) {
    var A = byLevel[a], B = byLevel[b];
    if (A.journey !== B.journey) return A.journey < B.journey ? -1 : 1;
    return A.levelIndex - B.levelIndex;
  });

  var header = ['Journey', 'Level', 'Idx', 'Plays', 'Wins', 'Fails', 'Success rate',
    'Turn budget', 'Avg start (incl. +5)', 'Avg turns taken', 'Avg taken (wins)',
    'Avg turns left (all)', 'Avg turns left (wins)', 'Avg refunded', 'Enough turns?',
    'Avg duration (s)', 'Avg dur (m:ss)'];
  var matrix = [header];
  keys.forEach(function (k) {
    var g = byLevel[k];
    var budget = Math.min.apply(null, g.budgets);   // base budget ignores +5 coin-continues
    var sr = g.plays ? g.wins / g.plays : 0;
    var avgLeftW = dash_avg(g.endWins);
    matrix.push([
      g.journey, g.level, g.levelIndex, g.plays, g.wins, g.fails, sr,
      budget, dash_round(dash_avg(g.starts), 1),
      dash_round(dash_avg(g.taken), 1), dash_round(dash_avg(g.takenWins), 1),
      dash_round(dash_avg(g.endAll), 1), dash_round(avgLeftW, 1),
      dash_round(dash_avg(g.refunded), 1),
      dash_turnVerdict(sr, g.plays, avgLeftW, budget),
      Math.round(dash_avg(g.dur)), dash_mmss(dash_avg(g.dur))
    ]);
  });

  var sheet = dash_writeSheet(ss, 'Level Stats', matrix);
  dash_styleHeader(sheet, 1, header.length);
  if (keys.length) sheet.getRange(2, 7, keys.length, 1).setNumberFormat('0.0%'); // Success rate
  sheet.setFrozenColumns(2);
  sheet.autoResizeColumns(1, header.length);
}

// ---- shared helpers ---------------------------------------------------------
// Pad every row of a matrix to the same width so setValues() accepts it.
function dash_pad(matrix) {
  var c = matrix.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
  return matrix.map(function (r) { r = r.slice(); while (r.length < c) r.push(''); return r; });
}

// Remove tabs left by earlier versions of this script (the per-player 'PU — *'
// tabs and the consolidated 'Power-Ups' tab) so a rebuild doesn't leave clutter.
function dash_cleanupOldPUTabs(ss) {
  ss.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (n.indexOf('PU — ') === 0 || n === 'Power-Ups') ss.deleteSheet(sh);
  });
}

// ---- Power-Ups Overview (global: one row per power-up) ----------------------
// Per-player and per-level power-up detail lives in 'Player Detail'; this is the
// bird's-eye "which power-ups matter" view.
function dash_buildPowerUps(ss, agg) {
  var labels = agg.labels, players = agg.players, names = agg.names, globalTotals = agg.globalTotals;
  var grand = labels.reduce(function (s, l) { return s + (globalTotals[l] || 0); }, 0);

  // How many distinct players used each power-up at least once.
  var usersUsing = {};
  names.forEach(function (n) {
    var per = {}, lv = players[n].levels;
    Object.keys(lv).forEach(function (k) {
      var pu = lv[k].pu;
      Object.keys(pu).forEach(function (l) { per[l] = (per[l] || 0) + pu[l]; });
    });
    labels.forEach(function (l) { if (per[l]) usersUsing[l] = (usersUsing[l] || 0) + 1; });
  });

  var header = ['Power-up', 'Total uses', '% of all', 'Players who used it', 'Uses / user (of users)'];
  var matrix = [header];
  labels.forEach(function (l) {
    var tot = globalTotals[l] || 0, u = usersUsing[l] || 0;
    matrix.push([l, tot, grand ? tot / grand : 0, u, u ? dash_round(tot / u, 1) : 0]);
  });
  matrix.push(['TOTAL', grand, grand ? 1 : 0, '', '']);

  var sheet = dash_writeSheet(ss, 'Power-Ups Overview', matrix);
  dash_styleHeader(sheet, 1, header.length);
  if (labels.length) sheet.getRange(2, 3, labels.length + 1, 1).setNumberFormat('0.0%');
  sheet.getRange(matrix.length, 1, 1, header.length).setFontWeight('bold');
  sheet.autoResizeColumns(1, header.length);
}

// ---- entry point ------------------------------------------------------------
function buildDashboards() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rows = dash_readResults(ss);
  if (!rows) {
    dash_writeSheet(ss, 'Leaderboard', [['No data in the "Results" tab yet — play a level first.']]);
    return;
  }
  dash_cleanupOldPUTabs(ss);
  var agg = dash_aggPlayers(rows);

  // Get-or-create (not delete) so the tab gids stay stable — the Leaderboard's
  // links reference Player Detail's gid and vice-versa.
  var lb = ss.getSheetByName('Leaderboard') || ss.insertSheet('Leaderboard'); lb.clear();
  var pd = ss.getSheetByName('Player Detail') || ss.insertSheet('Player Detail'); pd.clear();

  var startRow = dash_buildPlayerDetail(ss, pd, agg, lb.getSheetId());
  dash_buildLeaderboard(ss, lb, agg, rows, pd.getSheetId(), startRow);
  dash_buildLevelStats(ss, rows);
  dash_buildPowerUps(ss, agg);

  try { SpreadsheetApp.getActive().toast('Dashboards rebuilt from ' + rows.length + ' matches.', 'Memory Match', 5); } catch (e) {}
}

// Menu appears on open. (Simple trigger — only builds the menu; the build runs
// under your account when you click, so it has permission to write tabs.)
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Analytics')
    .addItem('Rebuild dashboards now', 'buildDashboards')
    .addSeparator()
    .addItem('Auto-rebuild hourly (install)', 'installAutoRebuild')
    .addItem('Stop auto-rebuild', 'removeAutoRebuild')
    .addToUi();
}

function installAutoRebuild() {
  removeAutoRebuild();
  ScriptApp.newTrigger('buildDashboards').timeBased().everyHours(1).create();
  try { SpreadsheetApp.getActive().toast('Dashboards will auto-rebuild every hour.', 'Memory Match', 5); } catch (e) {}
}
function removeAutoRebuild() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'buildDashboards') ScriptApp.deleteTrigger(t);
  });
}
