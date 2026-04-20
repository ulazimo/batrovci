/**
 * Rewarded-ad wrapper for mini-games-lottery.
 *
 * Current implementation: fake canvas "Lucky Coins" interstitial (30s, skip
 * after 5s). Callers don't depend on any of that — they only interact through
 * `showRewardedAd({ onReward, onSkip })`, so swapping in a real ad provider
 * later means replacing the body of show() and keeping the rest untouched.
 *
 * Example swaps:
 *   - Poki:        PokiSDK.rewardedBreak().then(r => r ? onReward() : onSkip())
 *   - CrazyGames:  CrazyGames.SDK.ad.requestAd('rewarded').then(onReward).catch(onSkip)
 *   - Google IMA:  construct an AdsRequest with a VAST rewarded tag, listen for
 *                  COMPLETE/SKIPPED events on AdsManager
 *
 * Relies on these DOM elements existing in the host page:
 *   #ad-overlay, #ad-canvas, #adCountdown, #adProgressFill, #adSkipBtn
 */

const AD_DURATION = 30;   // total ad seconds
const SKIP_AFTER  = 5;    // show skip button after N seconds

const state = {
    active: false,
    elapsedSec: 0,
    intervalId: null,
    raf: null,
    animT: 0,
    prevT: 0,
    onReward: null,
    onSkip: null,
};

const $ = id => document.getElementById(id);

function stopTimers() {
    if (state.intervalId) { clearInterval(state.intervalId); state.intervalId = null; }
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
}

function finish(rewarded) {
    if (!state.active) return;
    state.active = false;
    const watched = state.elapsedSec;
    const reward = state.onReward;
    const skip   = state.onSkip;
    state.onReward = state.onSkip = null;
    stopTimers();
    $('ad-overlay').classList.remove('active');
    if (rewarded) { if (reward) reward({ secondsWatched: watched }); }
    else           { if (skip)   skip({   secondsWatched: watched }); }
}

function drawStar(ctx, cx, cy, spikes, outerR, innerR, color) {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

function resizeCanvas() {
    const canvas = $('ad-canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}

function renderFrame(ts) {
    const elapsedMs = ts - state.prevT;
    if (elapsedMs < 14) { state.raf = requestAnimationFrame(renderFrame); return; }
    const dt = Math.min(elapsedMs / 1000, 0.05);
    state.prevT = ts;
    state.animT += dt;

    const W = window.innerWidth, H = window.innerHeight;
    const ctx = $('ad-canvas').getContext('2d');
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0,   '#0a0a2e');
    bg.addColorStop(0.5, '#1a0533');
    bg.addColorStop(1,   '#2d0a0a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 40; i++) {
        const sx = (Math.sin(i * 137.5 + state.animT * 0.1) * 0.5 + 0.5) * W;
        const sy = ((i * 0.0337 + state.animT * 0.03) % 1) * H;
        const sr = 0.5 + Math.sin(state.animT * 2 + i) * 0.3;
        ctx.globalAlpha = 0.3 + Math.sin(state.animT * 1.5 + i) * 0.2;
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.1, sr), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const cx = W / 2, cy = H / 2;
    const boxW = Math.min(W * 0.7, 280), boxH = boxW;
    const boxX = cx - boxW / 2, boxY = cy - boxH / 2 - H * 0.06;

    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 20 + Math.sin(state.animT * 2) * 10;

    function rr(x, y, w, h, r) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
        else ctx.rect(x, y, w, h);
        ctx.fill();
    }

    const iconGrad = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY + boxH);
    iconGrad.addColorStop(0,   '#ff6b35');
    iconGrad.addColorStop(0.5, '#ffd700');
    iconGrad.addColorStop(1,   '#ff3d00');
    ctx.fillStyle = iconGrad;
    rr(boxX, boxY, boxW, boxH, boxW * 0.2);
    ctx.shadowBlur = 0;

    const coinR = boxW * 0.14;
    const stackX = cx, stackBase = boxY + boxH * 0.72;
    for (let i = 2; i >= 0; i--) {
        const yy = stackBase - i * coinR * 0.6 + Math.sin(state.animT * 2 + i * 0.7) * 3;
        ctx.beginPath();
        ctx.ellipse(stackX, yy, coinR, coinR * 0.32, 0, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#ffd700' : '#e6ac00';
        ctx.fill();
        ctx.strokeStyle = '#b8860b';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(stackX, yy - coinR * 0.1, coinR * 0.88, coinR * 0.25, 0, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#ffe44d' : '#f0c000';
        ctx.fill();
        if (i === 0) {
            ctx.fillStyle = '#b8860b';
            ctx.font = `bold ${coinR * 0.55}px Fredoka One, system-ui`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('$', stackX, yy - coinR * 0.1);
        }
    }

    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2 + state.animT * 0.3;
        const r = boxW * 0.42;
        const sx = boxX + boxW / 2 + Math.cos(angle) * r;
        const sy = boxY + boxH / 2 + Math.sin(angle) * r;
        const sr = 6 + Math.sin(state.animT * 3 + i) * 2;
        drawStar(ctx, sx, sy, 5, sr, sr * 0.45, '#ffd700');
    }

    ctx.shadowBlur = 0;
    const titleY = boxY + boxH + 22;
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${Math.min(W * 0.09, 34)}px Fredoka One, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('LUCKY COINS', cx, titleY);

    const starY = titleY + 20;
    for (let i = 0; i < 5; i++) drawStar(ctx, cx - 52 + i * 26, starY, 5, 9, 4, '#ffd700');
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px system-ui';
    ctx.fillText('4.8  \u2605  10M+ Downloads', cx, starY + 20);

    const btnW = Math.min(W * 0.7, 240), btnH = 52;
    const btnX = cx - btnW / 2;
    const btnY = H - H * 0.22;
    const pulse = 1 + Math.sin(state.animT * 3) * 0.03;
    ctx.save();
    ctx.translate(cx, btnY + btnH / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-cx, -(btnY + btnH / 2));

    ctx.shadowColor = '#69f0ae';
    ctx.shadowBlur = 15;
    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnGrad.addColorStop(0, '#69f0ae');
    btnGrad.addColorStop(1, '#00c853');
    ctx.fillStyle = btnGrad;
    rr(btnX, btnY, btnW, btnH, btnH / 2);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#003300';
    ctx.font = `bold ${Math.min(W * 0.055, 20)}px Fredoka One, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PLAY FOR FREE', cx, btnY + btnH / 2);
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Available on App Store & Google Play', cx, btnY + btnH + 18);

    state.raf = requestAnimationFrame(renderFrame);
}

// Somebody else (showScreen on nav) may hide the overlay while an ad is in
// flight. Treat that as a forced skip so we clean up timers and fire onSkip.
function installOverlayObserver() {
    const overlay = $('ad-overlay');
    if (!overlay || overlay._adObserverInstalled) return;
    overlay._adObserverInstalled = true;
    new MutationObserver(() => {
        if (state.active && !overlay.classList.contains('active')) finish(false);
    }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
}

export function showRewardedAd({ duration = AD_DURATION, skipAfter = SKIP_AFTER, onReward, onSkip } = {}) {
    if (state.active) return;
    installOverlayObserver();

    state.active = true;
    state.elapsedSec = 0;
    state.onReward = onReward || null;
    state.onSkip   = onSkip   || null;

    $('ad-overlay').classList.add('active');
    $('adSkipBtn').classList.remove('visible');
    $('adCountdown').textContent = duration;
    $('adProgressFill').style.width = '0%';
    $('adSkipBtn').onclick = () => finish(false);

    state.intervalId = setInterval(() => {
        state.elapsedSec++;
        $('adProgressFill').style.width = ((state.elapsedSec / duration) * 100) + '%';
        $('adCountdown').textContent = Math.max(0, duration - state.elapsedSec);
        if (state.elapsedSec >= skipAfter) $('adSkipBtn').classList.add('visible');
        if (state.elapsedSec >= duration) finish(true);
    }, 1000);

    resizeCanvas();
    state.animT = 0;
    state.prevT = performance.now();
    renderFrame(state.prevT);
}

export function skipRewardedAd() { finish(false); }
