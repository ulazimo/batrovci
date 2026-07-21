// ============================================================
// BANK IT BUTTON & baby-bomb placement
// Split from the former gameplay.js monolith. Shared state & DOM refs
// live in state.js (loaded first via <script>); boot.js loads last.
// All files share one global namespace — do not redeclare a name.
// ============================================================

// ============================================================
// BANK IT BUTTON
// ============================================================
let _bankHoldTimer = null;
const BANK_HOLD_MS = 800;

function initBankButton() {
  const bar = document.getElementById('bank-bar');
  const btn = document.getElementById('bank-btn');
  if (!bar || !btn) return;
  if (!getRule('bankButton')) { bar.style.display = 'none'; return; }
  bar.style.display = '';
  btn.classList.add('disabled');
  btn.classList.remove('holding', 'banked');

  // Remove old listeners by replacing node
  const fresh = btn.cloneNode(true);
  btn.replaceWith(fresh);

  fresh.addEventListener('pointerdown', (e) => {
    if (fresh.classList.contains('disabled')) return;
    e.preventDefault();
    // Bomb ready — instant click, no hold needed
    if (bankProgress >= 3) {
      bankChain();
      return;
    }
    fresh.classList.add('holding');
    _bankHoldTimer = setTimeout(() => {
      fresh.classList.remove('holding');
      fresh.classList.add('banked');
      fresh.addEventListener('animationend', () => fresh.classList.remove('banked'), { once: true });
      bankChain();
    }, BANK_HOLD_MS);
  });

  const cancelHold = () => {
    if (_bankHoldTimer) { clearTimeout(_bankHoldTimer); _bankHoldTimer = null; }
    fresh.classList.remove('holding');
  };
  fresh.addEventListener('pointerup', cancelHold);
  fresh.addEventListener('pointerleave', cancelHold);
  fresh.addEventListener('pointercancel', cancelHold);
}

function updateBankButton() {
  const btn = document.getElementById('bank-btn');
  if (!btn || !getRule('bankButton')) return;
  const comboLen = chainCards.length + specialsUsed.length;
  const canBank = turnActive && !inputLocked && comboLen >= getMinCombo();
  // Button stays enabled when bomb is ready (3 charges), even without an active chain
  const bombReady = bankProgress >= 3 && !bankBombPlacement;
  const enabled = canBank || bombReady;
  const wasDisabled = btn.classList.contains('disabled');
  btn.classList.toggle('disabled', !enabled);
  if (!enabled) {
    btn.classList.remove('holding');
    if (_bankHoldTimer) { clearTimeout(_bankHoldTimer); _bankHoldTimer = null; }
  }
  // Show tutorial the first time the button becomes enabled
  if (canBank && wasDisabled) {
    if (!progress.seenFeatures) progress.seenFeatures = [];
    if (!progress.seenFeatures.includes('bankButton')) {
      itemTutorialQueue.push({
        id: 'feature_bankButton', icon: '💰', name: 'Bank It',
        accentColor: '#9b59b6',
        descHTML: ''
          + '<div style="display:flex;gap:10px;margin:6px 0;text-align:left">'
          +   '<div style="flex:1;padding:8px;border-radius:10px;background:rgba(240,192,64,.08);border:1px solid rgba(240,192,64,.25)">'
          +     '<div style="font-weight:800;color:#f0c040;font-size:13px;margin-bottom:3px">💰 Bank It</div>'
          +     '<div style="color:#bbb;font-size:11px;line-height:1.4">Hold to <b style="color:#ddd">secure your combo</b> safely. No risk, guaranteed points.</div>'
          +   '</div>'
          +   '<div style="flex:1;padding:8px;border-radius:10px;background:rgba(155,89,182,.08);border:1px solid rgba(155,89,182,.25)">'
          +     '<div style="font-weight:800;color:#c39bd3;font-size:13px;margin-bottom:3px">🎰 Keep Going</div>'
          +     '<div style="color:#bbb;font-size:11px;line-height:1.4">Risk the chain for <b style="color:#ddd">bigger combos</b> and powerful Special cards!</div>'
          +   '</div>'
          + '</div>'
          + '<div style="text-align:center;margin-top:4px">'
          +   '<span style="display:inline-flex;gap:4px;margin-bottom:4px">'
          +     '<span style="display:inline-block;width:16px;height:5px;border-radius:3px;background:#9b59b6"></span>'
          +     '<span style="display:inline-block;width:16px;height:5px;border-radius:3px;background:#9b59b6"></span>'
          +     '<span style="display:inline-block;width:16px;height:5px;border-radius:3px;background:#9b59b6"></span>'
          +   '</span><br>'
          +   '<span style="color:#c39bd3;font-weight:700;font-size:13px">3 banks</span> '
          +   '<span style="color:#888;font-size:12px">earns a free</span> '
          +   '<span style="color:#c39bd3;font-weight:700;font-size:13px">💣 Baby Bomb</span>'
          + '</div>',
        markAs: 'bankButton'
      });
      if (!itemTutorialShowing) showNextItemTutorial();
    }
  }
}

// Bank → Baby Bomb progression
let bankProgress = 0;
let bankBombPlacement = false;

function updateBankProgress() {
  const pips = document.querySelectorAll('#bank-progress .bank-pip');
  const container = document.getElementById('bank-progress');
  const btn = document.getElementById('bank-btn');
  pips.forEach((p, i) => p.classList.toggle('filled', i < bankProgress));
  if (container) container.classList.toggle('ready', bankProgress >= 3);
  // Switch button to bomb mode at 3 charges
  if (btn) {
    btn.classList.toggle('bomb-ready', bankProgress >= 3);
    btn.textContent = bankProgress >= 3 ? '💣 Place Bomb' : '💰 Bank it';
  }
}

function activateBombPlacement() {
  if (bankProgress < 3 || bankBombPlacement) return;
  bankBombPlacement = true;
  showTutorialHint('💣 Tap a face-down card to place a Baby Bomb!');
  // Highlight placeable cells
  boardEl.classList.add('bomb-placement');
}

function bankChain() {
  // If bomb is ready, clicking the button enters placement mode instead
  if (bankProgress >= 3) { activateBombPlacement(); return; }
  if (!turnActive || inputLocked) return;
  const comboLen = chainCards.length + specialsUsed.length;
  if (comboLen < getMinCombo()) return;
  inputLocked = true;
  endTurn(true);

  // Increment bank progress after successful bank
  bankProgress++;
  updateBankProgress();
}
