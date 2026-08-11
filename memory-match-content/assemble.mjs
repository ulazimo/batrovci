// mm-content/assemble.mjs — run after exporting from the level-editor
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const G = '../memory-match';
const levels      = JSON.parse(readFileSync(`${G}/levels/levels_cleaningxl.json`, 'utf8'));
const progression = JSON.parse(readFileSync(`${G}/levels/progression_cleaningxl.json`, 'utf8'));
const collections = JSON.parse(readFileSync(`${G}/collections.json`, 'utf8'));

const out = 'public/cleaningxl-content.json';
// Read the previously-published version to bump it; default to 0 on first run.
const prev = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { contentVersion: 0 };
const contentVersion = (prev.contentVersion || 0) + 1;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({
  contentVersion,        // bumped each build; client applies only a strictly-newer bundle
  minApi: 1,             // client ignores this payload if its CONTENT_API < minApi (forward-compat gate)
  cleaningxl: { levels, progression, boardArt: collections.boardArt.cleaningxl }
}, null, 2));
console.log(`✔ wrote ${out} — contentVersion ${contentVersion}, ${levels.length} levels`);