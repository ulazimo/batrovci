#!/usr/bin/env node
/**
 * release.mjs — one-command OTA content release for the Cleaning XL journey.
 *
 * Ships new levels WITHOUT an app-store build, in three steps:
 *   1. Assemble    — node assemble.mjs → public/cleaningxl-content.json (bumps contentVersion)
 *   2. Deploy      — firebase deploy --only hosting → prototyping-nordeus.web.app
 *   3. Bump client — set BUNDLED_CONTENT_VERSION in ../memory-match/content-remote.js
 *                    to the version now live.
 *
 * Why this order: the client "floor" advances ONLY after a successful deploy, so it
 * always equals the newest live version. That preserves the safety invariant — a
 * future NATIVE build bakes a floor equal to its bundled levels, so an old cached
 * OTA bundle can never override freshly-shipped app levels.
 *
 * After this script:
 *   • Installed apps pick up the new content on their NEXT launch (cache-first).
 *   • Commit the changed content-remote.js.
 *   • Cutting a native build (memory-match-app / -ios) is a SEPARATE flow; it will
 *     bake the new floor automatically because content-remote.js is now updated.
 *
 * Usage (runs from anywhere — paths resolve relative to this file):
 *   node release.mjs            # real release
 *   node release.mjs --dry-run  # preview versions + commands; no writes, no deploy
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(HERE, 'public', 'cleaningxl-content.json');
const CLIENT = join(HERE, '..', 'memory-match', 'content-remote.js');
const DEPLOY_CMD = 'firebase deploy --only hosting';
const LIVE_URL = 'https://prototyping-nordeus.web.app/cleaningxl-content.json';
const DRY = process.argv.includes('--dry-run');
const VER_RE = /(const BUNDLED_CONTENT_VERSION = )(\d+)(;)/;

const sh = (cmd) => execSync(cmd, { cwd: HERE, stdio: 'inherit' });
const bundleVersion = () =>
  existsSync(BUNDLE) ? (JSON.parse(readFileSync(BUNDLE, 'utf8')).contentVersion || 0) : 0;
function clientVersion() {
  const m = readFileSync(CLIENT, 'utf8').match(VER_RE);
  if (!m) throw new Error(`BUNDLED_CONTENT_VERSION not found in ${CLIENT}`);
  return Number(m[2]);
}

try {
  // Preflight — fail early with a clear message rather than half-way through.
  if (!existsSync(join(HERE, 'assemble.mjs'))) throw new Error('assemble.mjs not found next to release.mjs');
  if (!existsSync(CLIENT)) throw new Error(`client loader not found: ${CLIENT}`);
  const fromClient = clientVersion();               // also asserts the patch target exists

  if (DRY) {
    const cur = bundleVersion();
    console.log('DRY RUN — no files written, nothing deployed.\n');
    console.log(`  1. assemble     → contentVersion ${cur} → ${cur + 1}`);
    console.log(`  2. deploy       → ${DEPLOY_CMD}  (→ ${LIVE_URL})`);
    console.log(`  3. bump client  → BUNDLED_CONTENT_VERSION ${fromClient} → ${cur + 1}`);
    process.exit(0);
  }

  // Verify the Firebase CLI is usable before we assemble/bump anything.
  try { execSync('firebase --version', { cwd: HERE, stdio: 'ignore' }); }
  catch { throw new Error('Firebase CLI not found. Install: npm i -g firebase-tools  then: firebase login'); }

  console.log('\n▶ [1/3] Assembling bundle…');
  sh('node assemble.mjs');
  const live = bundleVersion();

  console.log(`\n▶ [2/3] Deploying v${live} to Firebase Hosting…`);
  sh(DEPLOY_CMD);

  console.log('\n▶ [3/3] Bumping client floor (post-deploy)…');
  const src = readFileSync(CLIENT, 'utf8');
  writeFileSync(CLIENT, src.replace(VER_RE, `$1${live}$3`));
  console.log(`  content-remote.js: BUNDLED_CONTENT_VERSION ${fromClient} → ${live}`);

  console.log(`\n✅ Released content v${live}`);
  console.log(`   Live: ${LIVE_URL}`);
  console.log(`   Installed apps apply it on next launch (cache-first).`);
  console.log(`   → Commit content-remote.js so your next native build bakes floor v${live}.`);
} catch (e) {
  console.error(`\n✖ Release aborted: ${e.message || e}`);
  console.error('  The client floor is bumped ONLY after a successful deploy, so it is safe to fix and re-run.');
  process.exit(1);
}
