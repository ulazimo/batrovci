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
  useArtIfPresent('art/hero-rock.png', (url) => {
    rock.classList.add('has-art');
    rock.style.backgroundImage = `url("${url}")`;
  });
  swapNavIcons();

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

  // Play launches the curl, then the match.
  document.getElementById('btn-play').addEventListener('click', () => {
    spinHomeRock();
    setTimeout(() => startMatch(selectedEnds), 620);
  });
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

// Probe an art file and only apply it if it actually decodes.
function useArtIfPresent(url, apply) {
  const probe = new Image();
  probe.onload = () => { if (probe.naturalWidth > 0) apply(url); };
  probe.src = url;
}

function spinHomeRock() {
  const rock = document.getElementById('home-rock');
  rock.classList.remove('spin');
  void rock.offsetWidth;        // restart the CSS animation
  rock.classList.add('spin');
}
