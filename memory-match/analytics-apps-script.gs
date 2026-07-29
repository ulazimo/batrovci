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
 *  you never have to edit the sheet by hand. Current fields:
 *    timestamp · username · outcome · journey · level · levelIndex ·
 *    turnsStart · turnsEnd · turnsUsed · score · stars · powerUps · powerUpsTotal
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
    var sheet = ss.getSheetByName('Results');
    if (!sheet) {
      sheet = ss.getSheets()[0];
      sheet.setName('Results');
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
