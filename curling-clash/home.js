// ============================================================
// HOME SCREEN
//
// From the doc: "Play button, Rock in the middle, Bottom navigation Bar with
// Inventory and Shop which are disabled/greyed out and Locked. Home in the
// middle." And from the Golf Clash reference: the rock in the middle spins
// around sometimes, and pressing Play launches the curl and starts the match.
// ============================================================

let homeSpinTimer = null;
let selectedEnds = MATCH_LENGTHS.normal;
let homeLaunching = false;   // guards against a double-tap on Play

function initHome() {
  const rock = document.getElementById('home-rock');

  // Swap the CSS-drawn placeholders for the Layer AI art when it is present.
  // Both are checked with an Image() probe rather than assumed, so a missing
  // file leaves the hand-built versions in place rather than an empty box.
  useArtIfPresent('art/logo.png', (url) => {
    const el = document.getElementById('home-logo');
    el.classList.add('has-art');
    el.style.backgroundImage = `url("${url}")`;
  });
  // Body and handle as separate images, handle sweeping about the vertical axis.
  // A rendered 8-frame turntable was tried and looked worse — the generated
  // frames were not consistent enough with each other, and the body render was
  // noisier than this one. The strip is kept in art/raw/ if it is ever worth
  // revisiting with better frames; art/prepare.py still has the `turntable`
  // command that builds it.
  //
  // Both images must land for the composed look, so the body only swaps in once
  // the handle is confirmed too — otherwise a missing handle would leave a bare,
  // handle-less stone on the hero shot.
  useArtIfPresent('art/handle-yellow.png', (handleUrl) => {
    useArtIfPresent('art/rock-body.png', (bodyUrl) => {
      rock.classList.add('has-art');
      rock.style.backgroundImage = `url("${bodyUrl}")`;
      const h = document.getElementById('home-rock-handle');
      h.classList.add('has-art');
      h.style.backgroundImage = `url("${handleUrl}")`;
    });
  });
  swapNavIcons();

  // Bottom nav now leads somewhere: the Inventory and Shop tabs are unlocked
  // by this milestone.
  for (const b of document.querySelectorAll('#home-nav .nav-btn')) {
    b.addEventListener('click', () => {
      const to = b.dataset.nav;
      if (to === 'inventory') openInventory();
      else if (to === 'shop') openShop();
      else { showScreen('home-screen'); refreshHomeDeck(); }
    });
  }

  // The idle spin: occasional, not metronomic, so it reads as a flourish
  // rather than an animation loop.
  const scheduleSpin = () => {
    const wait = 3200 + Math.random() * 4200;
    homeSpinTimer = setTimeout(() => {
      if (currentScreen === 'home-screen') spinHomeRock();
      scheduleSpin();
    }, wait);
  };
  scheduleSpin();

  rock.addEventListener('click', spinHomeRock);

  // Match length: 3 / 5 / 7 ends.
  for (const btn of document.querySelectorAll('.len-btn')) {
    btn.addEventListener('click', () => {
      selectedEnds = parseInt(btn.dataset.ends, 10);
      document.querySelectorAll('.len-btn').forEach(b =>
        b.classList.toggle('active', b === btn));
    });
  }
  document.querySelectorAll('.len-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.ends, 10) === selectedEnds));

  refreshHomeDeck();

  // "Pressing the Play button launches the Curl and Starts the match" — so the
  // rock spins up and slides away down the sheet before the match opens.
  document.getElementById('btn-play').addEventListener('click', () => {
    if (homeLaunching) return;
    homeLaunching = true;
    spinHomeRock();
    const slider = document.getElementById('home-rock-slider');
    slider.classList.remove('slide-away');
    void slider.offsetWidth;
    slider.classList.add('slide-away');
    setTimeout(() => {
      startMatch(selectedEnds);
      // Reset for the next visit home, after the screen has switched away.
      slider.classList.remove('slide-away');
      homeLaunching = false;
    }, 640);
  });
}

// "I want to be able to choose which Deck I am going in the Match with."
// The three decks and their type mix, right above the Play button.
function refreshHomeDeck() {
  const wrap = document.getElementById('home-deck-btns');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < DECK_COUNT; i++) {
    const b = document.createElement('button');
    b.className = 'home-deck-btn' + (i === inventory.activeDeck ? ' active' : '');
    b.textContent = i + 1;
    b.addEventListener('click', () => { setActiveDeck(i); refreshHomeDeck(); });
    wrap.appendChild(b);
  }
  const bar = document.getElementById('home-type-bar');
  bar.innerHTML = '';
  for (const d of deckTypeDistribution(inventory.activeDeck)) {
    if (!d.count) continue;
    const seg = document.createElement('span');
    seg.className = 'type-seg';
    seg.style.flexGrow = d.count;
    seg.style.background = d.color;
    bar.appendChild(seg);
  }
}

function swapNavIcons() {
  for (const el of document.querySelectorAll('.nav-ico[data-ico]')) {
    useArtIfPresent(`art/ico-${el.dataset.ico}.png`, (url) => {
      el.classList.add('has-art');
      el.style.backgroundImage = `url("${url}")`;
    });
  }
  for (const el of document.querySelectorAll('.nav-lock')) {
    useArtIfPresent('art/ico-lock.png', (url) => {
      el.classList.add('has-art');
      el.style.backgroundImage = `url("${url}")`;
    });
  }
}

// Probe an art file and only apply it if it actually decodes. onMissing lets
// callers chain to a lesser asset rather than silently showing nothing.
function useArtIfPresent(url, apply, onMissing) {
  const probe = new Image();
  probe.onload = () => {
    if (probe.naturalWidth > 0) apply(url);
    else if (onMissing) onMissing();
  };
  probe.onerror = () => { if (onMissing) onMissing(); };
  probe.src = url;
}

// Flourish spin: the handle when the composed art loaded, otherwise the whole
// CSS-drawn stone about its vertical axis.
function spinHomeRock() {
  const handle = document.getElementById('home-rock-handle');
  const target = handle.classList.contains('has-art')
    ? handle
    : document.getElementById('home-rock');
  target.classList.remove('spin');
  void target.offsetWidth;      // restart the CSS animation
  target.classList.add('spin');
  // Hand back to the idle drift once the flourish finishes, so the handle does
  // not snap to zero when the .spin animation is removed.
  if (target === handle) {
    setTimeout(() => handle.classList.remove('spin'), 2400);
  }
}
