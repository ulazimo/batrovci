# Memory Match — Game Guide for AI Agents

> A single-file, vanilla-JS mobile match game prototype. This doc is the shared
> mental model for any Claude instance working in `memory-match/`. Read it before
> editing — the turn lifecycle and the "everything is config-driven" design are
> non-obvious and easy to break.

---

## 1. What the game is

**Memory Match** is a memory + combo puzzle. The board is a grid of face-down
cards, each a hidden color (red / green / blue / yellow / orange / purple). The player flips cards
one at a time trying to build a **combo chain** of same-colored cards from memory.

- Flip cards of the **same color** → the chain grows.
- Flip a **wrong color** → the turn ends (the chain resolves).
- A chain of **2+** scores points and clears those cards; new cards drop in.
  (Match-2 is the default; the `legacyMatch3` rule restores the original 3+ —
  everything reads the minimum through `getMinCombo()`, never a hardcoded 3.)
- Opening **every remaining card of the active color** is a **colour clear**: it
  collects at *any* chain length (even a lone last card) and **refunds the turn**.
- Long chains **grant power-ups into your stash** (5+ → Baby Bomb, 7+ → BIG Bomb).
  They no longer leave a special card on the board.
- Each level has **limited turns** and one or more **goals** (clear the whole
  board, reach a score, collect colors, break locks, cover rows, etc.). Meet all
  goals before turns run out to win.

It is a self-contained HTML prototype (part of a larger "HTML Prototypes"
portfolio repo of ~20 mini-games). No build step, no framework, no npm.

---

## 2. Tech stack & how to run

- **Pure vanilla JS + HTML + CSS.** No framework, no bundler, no dependencies.
- Global-scoped functions and mutable module-level `let` state (scripts share one
  global namespace via `<script>` tags — order matters, see the `<script src=...>`
  block near the end of [index.html](index.html) and the load-order rules in §12).
- **Sound** is generated programmatically via the Web Audio API (`const SFX` in
  [audio.js](audio.js)), plus a few `audio/*.mp3` files. No external libs.
- **Persistence** is `localStorage` under the key `mm_progress`
  ([settings.js:303-309](settings.js)).
- **Assets**: card art in `blocks/` (`block_<color>_<1-6>.png`), power-up/goal
  icons in `icons/`.
- **Analytics**: GA4 + a Firebase tracker are wired in `index.html` (shared
  across the whole portfolio — see repo root `AGENTS.md`). Not gameplay-relevant.

**To run:** open `memory-match/index.html` in a browser (or serve the repo root
statically). There is no test suite and no lint config for this game.

---

## 3. File map

| File | Lines | Role |
|------|-------|------|
| `index.html` | ~363 | DOM skeleton: HUD, board container, all overlay screens (home, journey picker, level select, pre-level, win/fail, settings, tutorials). Loads all scripts in order. |
| `settings.js` | ~845 | Config layer: `GAMEPLAY_RULES` toggles, win-streak config, persistence (`progress`), the in-game **Settings panel** UI, combo→special mapping UI, level-rewards UI. |

**The engine** (formerly one ~3,370-line `gameplay.js`) is now split by concern into
19 files, all loaded as ordered `<script>` tags sharing one global namespace. They are
loaded in this order after `settings.js` (see [index.html](index.html)):

| File | Role |
|------|------|
| `state.js` | **Loads first.** All cross-cutting shared state (`board`, `score`, `turns`, `chainColor`, `chainCards`, `specialsUsed`, `turnActive`, `inputLocked`, `shieldCharges`, `deck`, `COLS/ROWS/TOTAL`, `currentLevelIndex`, `levelGoals`, …) + top-level DOM refs (`boardEl`, `scoreEl`, …) + progression-data consts. |
| `audio.js` | `SFX` — Web Audio API programmatic sound. |
| `vfx.js` | Juice/animation: particles, `flyCardsToGoal`, confetti, `animateScore`, board/sweep banners, score popup, initial board reveal. |
| `reveal-skip.js` | **Skippable reveal holds** — the one owner of *when* a reveal's beats fire. `runSkippableReveal(steps, holdMs, finish)`, `skipReveal`, `isRevealing`, `discardActiveReveal`. See §4. |
| `progression.js` | Journeys: load/save/restore snapshots, `applyProgression`. (`playFromHome` moved to `home-room.js`.) |
| `specials.js` | `SPECIAL_TYPES`, `BACK_EFFECTS`, level rewards, `getMinCombo`. (Also the vestigial combo→special mapping — see §6.) |
| `goals.js` | Level goals: `initLevelGoals`, `updateGoalProgress`, `checkAllGoalsMet`, goal HUD. |
| `board.js` | Card model/factory, `renderBoard`, board-cell UI, chain tension/faces/indicators, long-press peek, `boardEl` event listeners. Also the **obstacle areas** (ice / color-lock decoration + break logic), `assignBoardColors`, `buildDeck`, the Collection tray, and `registerCollected` (the counter that drives ice/color-lock breaks). |
| `board-bg.js` | Per-level collectible art revealed **behind** the grid as tiles break, so clearing a level uncovers the item you then see in its hall. Placement read from `COLLECTIONS.boardArt`. `currentLevelBackground`, `bgArtBox`, `applyBoardBackground`, `bgOption` (0=off, 1–4 render modes, persisted in `mm_bg_option`, driven by the `#bg-switcher` dev panel). Keeps `#board-bg` as the **last child** of `#board` — lots of code indexes `boardEl.children[i]` as board index `i`. |
| `chain-timer.js` | Optional chain countdown timer. |
| `boosters.js` | `BOOSTERS`, booster inventory/consume/UI + booster execution actions. |
| `bank.js` | Bank-It button + `detonateBombAt` (bomb blast + refill). |
| `bomb-aim.js` | **Drag-to-place** for Baby/BIG bombs: press a bomb button (or Bank-It "Place Bomb") and drag; a live blast silhouette snaps to the tile under the pointer. Drives commit → `detonateBombAt`. Owns board input while `isBombAiming()`. |
| `tutorials.js` | Main tutorial, feature/special/booster popups, level-select grid. |
| `ui-nudges.js` | Idle-nudge/hint system, `closeAllOverlays`. |
| `level.js` | Level lifecycle: `initLevelConfig`, pre-level prep UI, `startGame`, retry/test/next. |
| `turn.js` | **Core loop:** `onCardClick`, `endTurn`, `placeNewCards`/reveal helpers. |
| `endgame.js` | `recallCards`, `finishTurn`, `tryAutoResolveColor` (colour clear), win/fail overlays, continue-with-coins. |
| `home-room.js` | The **home screen** "halls": `showHome`/`renderHall`, `slotLevelIndex`, the win-streak meter + next-level reward pills, `playFromHome`, and the dev level-jumper. Halls/slots read from `COLLECTIONS.halls`; `HALLS`/`HALL_ITEMS` are just aliases onto it. Owns `MAIN_JOURNEY`. |
| `boot.js` | **Loads last.** `boot()` IIFE — restores progression, shows home. |
| `config.js` | ~16 | `ALL_COLORS` (the 6 colors) + `COLOR_HEX` (each color's CSS hex). |
| `style.css` | ~1758 | All styling + CSS animations (flips, particles, banners, nudges). |
| `levels_default.js` / `_short.js` / `_cleaning.js` / `_cleaningxl.js` / `_long.js` | — | Level definitions per **journey** (16 / 40 / 40 / 40 / 253 levels). `.json` twins exist for the editor. **`cleaningxl` is the live journey** — see §10. |
| `progression_*.js` (5 twins) | — | Per-journey unlock thresholds + level rewards. |
| `collections.js` | — | **Single source of truth for backgrounds**: item art registry, home halls + their slots, per-level board art. Read by `home-room.js` and `board-bg.js`. `.json` twin; generated by the level-editor. See below. |
| `level-editor/` | — | Standalone visual editor (`index.html` + `editor.js`) to author levels & progression; exports `.json` and `.js`. 12 tools (Normal, Color, Locked, Disabled, Ordered, Stack, Elevator, Ice, Color Lock, Back Effect, Eraser) + Color Counts. Not loaded by the game. |
| `audio/`, `blocks/`, `icons/` | — | Sound files, card art, UI icons. |
| `instruments/`, `animals/` | — | Low-poly SVG collectible art, registered in `collections.js` (`file` + `view` = the SVG's `viewBox`). Each is used **twice**: as the level's behind-board art (`board-bg.js`) and as its hall trophy (`home-room.js`). Not card skins — there is no card-theme system. |
| `reef/` | — | Coral Reef collectibles — **transparent PNGs** (Layer AI generated, keyed off white locally). Same dual use as the SVGs; `view` is the pixel size. |
| `backdrops/` | — | Hall backdrop images for halls with `backdrop` set in `collections.js`. |

`.js` and `.json` level files are **generated by the level editor** — the header
comment says "Auto-generated by level-editor". Prefer editing via the editor, or
keep the `.js` and `.json` in sync manually.

### Backgrounds / collectibles (`collections.js`)

The home-screen halls and the art revealed behind the board are **one dataset**, so
a level's reveal and its home-screen item can't drift apart:

```js
COLLECTIONS = {
  hallSize: 5,
  themes:   { music: { label, pedestals, notes, glow }, … },  // each maps to .theme-<id> in style.css
  items:    { guitar: { name, file, view: {w,h}, layer? }, … },  // view = SVG viewBox OR PNG pixel size
  halls:    [ { id, name, theme?, backdrop?, shadow?, glow?, notes?,
                slots: [ { item, levelId, kind?, left, bottom, h, pw? } ] } ],
  boardArt: { cleaningxl: { <levelId>: { item, cx, cy, h } } },
}
```

- A slot names its level by **`levelId`**, not by position. `slotLevelIndex(slot)`
  resolves id → index, because `progress.stars` / `progress.seenInstruments` are
  keyed by **global level index**. Returns −1 when the active journey has no such id.
- A hall gets its background **one of two ways**:
  - **`backdrop`** (an image) — hides the procedural `#room-bg` scenery and shows
    `#room-backdrop`. Pedestals/props are **painted into the picture**, so a slot
    adds only an optional ground shadow (`hall.shadow`); ornaments (`glow`, `notes`)
    default **off** and are opted into per hall. A new hall of this kind is pure data.
  - **`theme`** — a hand-authored `.theme-<id>` CSS preset declared in
    `COLLECTIONS.themes`, where `pedestals` picks `.spot-pedestal` vs `.spot-shadow`.
    Only the two original halls use this; prefer a backdrop for new ones.
- **`syncBackdropBox()` (home-room.js) is load-bearing — don't remove it.** The
  backdrop is `object-fit: cover`, so a wider device crops it (iPad crops ~59% of a
  portrait backdrop's height). Slots are authored against the *picture*, so the spot
  layer `#room-pedestals` is resized to the backdrop's cover rect and made the
  container-query container — that keeps `left`/`bottom`/`h` picture-relative and
  items glued to painted pedestals on every device. Driven by a **ResizeObserver**
  on `#room-scene`, because `#device-switcher` rescales the phone purely in CSS and
  never fires a window `resize`.
- For backdrop halls `.spot-shadow` is taken **out of the column flow** (CSS). In
  flow it adds its own height below the art, so `bottom` landed the *shadow* on the
  plinth and floated every item ~2.5% high. Out of flow, `bottom` means exactly
  "where the item's base sits" — which is what the art is authored against.
- Authoring a backdrop: keep the aspect near **0.57 w/h** and important scenery in
  the lower two-thirds, since wide screens crop from the top (bottom-anchored).
- **Two kinds of slot.** A *placed item* (the default) is tight-cropped art anchored
  by `left`/`bottom`/`h`. A **`kind: 'layer'`** slot is a *full-scene tableau layer*:
  the art (`item.layer`) is a whole canvas with the piece already at its final
  position, drawn to fill the picture box, so `left`/`bottom`/`h` are unused and
  stacking a hall's layers reproduces its `final.png`. Placement stops being a
  problem at the cost of one canvas per piece. Layers get no pedestal/shadow/glow,
  an unearned one is simply absent, and they fade in via `@keyframes childhoodReveal`
  (`.spot-layer.new`). An item can carry **both**: `file` (tight, for the
  behind-board reveal) and `layer` (full-scene, for the hall) — Childhood does.
  This only lines up because the layers and the backdrop share an aspect ratio and
  the same cover geometry; `syncBackdropBox()` is what guarantees the second part.
- Today: **4 halls** — Childhood (image backdrop + tableau layers, levels 1–4),
  Music Hall (CSS theme, 5–9), Green Pasture (CSS theme, 10–14), Coral Reef (image
  backdrop + placed items, 15–19) — and `boardArt` for `cleaningxl` 1–19 + 38–40.
- **Load order**: `collections.js` must load *before* `board-bg.js` (which calls
  `setBgOption` at load time). It sits with the other data files, before `settings.js`.

---

## 4. The turn lifecycle (most important mental model)

A "turn" = one attempt at a chain, ending on a mismatch, a manual bank, or a
completed sweep. This is the core loop — trace it before touching combat code.

```
onCardClick(index)                       [turn.js:11]
  ├─ bails if isBombAiming() / inputLocked / card.iced / card.colorLocked
  ├─ special-card cases (active booster, spotlight, specials)
  ├─ first flip of turn → turnActive=true, chainColor=card.color, chainCards=[i]
  ├─ same color   → push to chainCards, SFX.shepard (rising pitch)
  │                 → tryAutoResolveColor(): every card of the colour open? resolve now
  ├─ wrong color  → if shieldCharges>0: absorb; else → endTurn(false)  after 500ms
  │                 (fail buzz + shake ONLY if comboLen < getMinCombo() — a
  │                  completed Match-2 that ends on a wrong 3rd flip is a success)
  └─ chain length 3 → startChainTimer() + applyChainColorHint() (danger ✕ tiles)

endTurn(manual, perfectSweep)            [turn.js:250]
  ├─ capture pendingDangerReveal (chainDangerReveal rule)
  ├─ compute `matched` (drop trailing mismatched card), `combo = matched+specials`
  ├─ clearedColors: every card of a collected colour gone? → colour clear
  ├─ turns--   … then turns++ if colorCleared (net zero — the refund)
  ├─ willCollect = combo >= getMinCombo() || colorCleared
  ├─ willCollect →
  │     • score: combo 2=50, 3=100, 4=150, else combo*50
  │     • updateGoalProgress(matched, combo)
  │     • combo >= 3 → grantChainReward(combo): power-up into the stash (5+/7+)
  │     • collected backEffect cards merge their reveal patterns into revealTargets
  │     • flyCardsToGoal animation → cards removed, registerCollected() →
  │       breakAdjacentLocks / checkIceBreaks / checkColorLockBreaks
  ├─ activate any used special cards' reveal patterns (danger reveal folded into
  │  the SAME batch, so both flash together)
  ├─ placeNewCards() refills cleared slots: stack re-seed → elevator → deck → new
  └─ finishTurn()                        [endgame.js:61]
        ├─ reset chain state, flushLockHide()
        ├─ checkAllGoalsMet() → levelWon()
        ├─ else turns <= 0   → levelFailed()
        └─ else revealChainDangerCards()  (only when no reveal batch ran)
```

### Reveals are skippable ([reveal-skip.js](reveal-skip.js))
Every "look at these cards" beat has the same shape: cards flip up on a **stagger**,
sit face-up for a **hold**, then hide and play continues. All of them route through
`runSkippableReveal(steps, holdMs, finish)` so a tap can hurry them along — the first
tap flushes the remaining stagger (every queued card flips up at once), the next ends
the hold. A tap never changes the outcome; the same `finish` runs, just sooner, and
**exactly once** (tap and timer can't double-run it).

The board `click` listener routes to `skipReveal()` while `isRevealing()`, so the tap
is never also read as a card flip. Converted callers — **every hold that locks input**:
`endTurn`'s end-of-turn reveal batch (the big one: back-effect + chain-danger tiles +
new cards), `boosterReveal`, `doSimultaneousReveal`, the instant-special reveal in
`onCardClick`, `sweepRevealBoard`, `revealEntireBoard`, `recallCards`, the bomb-refill
reveal in `detonateBombAt`, the normal Peek, and `executeRandom3`.
**New reveals must use it too** — a raw `setTimeout` chain is unskippable and will feel
broken next to the rest. (Deliberately *not* converted: the `revealOnUnlock` per-card
flash in `board.js`, which doesn't lock input and can run on several tiles at once —
the single-active-reveal model would make them clobber each other.) `startGame` calls
`discardActiveReveal()` (drops timers *without* running `finish`, since the board is
about to be rebuilt); starting a new reveal calls `finishActiveReveal()` on the old one
so two can never overlap.

Key rules:
- **The scoring minimum is `getMinCombo()`** — **2** by default, 3 with the
  `legacyMatch3` rule. Never hardcode it.
- A **colour clear collects at any length and refunds the turn**, so it can bypass
  the minimum entirely (this is what makes "clear the board" levels terminate).
- The last card of a *genuine* mismatch is dropped from `matched` **and** from
  `chainCards` before scoring — otherwise a mid-resolution ice/color-lock break
  would re-render the wrong-colour card as a chain slot.

### Turn-state variables ([state.js](state.js))
- `board[]` — array of card objects (or `null` for disabled cells).
- `score`, `turns` — current level score and remaining turns.
- `chainColor` — the color the current chain is matching.
- `chainColors` (Set) — parallel chain colors (only used with the Colored Bombs rule).
- `chainCards[]` — indices of normal cards in the active chain.
- `specialsUsed[]` — indices of special cards played this turn.
- `turnActive`, `inputLocked` — turn/animation gating flags.
- `shieldCharges`, `echoCharges`, `spotlightMode`, `activeBooster` — power-up state.
- `lastRevealedCards[]` — feeds the **Recall** button.
- `deck[]` — finite refill pool for `clearBoard` levels (§10).
- `elevatorAreas` / `iceAreas` / `colorLockAreas` (+ their `*CellArea` index→area
  maps) — the obstacle areas (§5).
- `cardsCollectedTotal` / `cardsCollectedByColor` — running collect counters that
  drive ice melts and color-lock breaks. Both fed by `registerCollected()`.
- `pendingDangerReveal` / `pendingLockHide` / `bombColorClearOverride` — cross-beat
  handoffs; see §5 and §11.

`inputLocked` is set `true` during every animation and reset in `finishTurn()` /
callback ends. **If you add an early `return` in the turn flow, make sure
`inputLocked` gets cleared** or the game freezes.

---

## 5. The card model

Cards are plain objects created by helpers at [board.js](board.js) (`createCard`):

```js
{ color, flipped, special, index, locked, lockCount?, stack?, bombColor?, marked?, ordered?, backEffect? }
```

- **Normal card**: `color` set, `special=null`.
- **Special card**: `color=null`, `special=<type id>` (see §7).
- **Locked card**: `locked=true` — can't be flipped; **peeks/reveals skip it** (the
  `!board[i].locked` guard), but a **bomb blast breaks one lock layer** rather than
  destroying it (see `breakLockLayer`). Unlocked when an adjacent combo clears (goal
  type `breakLocks`).
- **Multi-lock card**: `locked=true` + `lockCount=N` — needs **N** breaks. It loses
  **one layer per collected card orthogonally adjacent to it** (so one combo/bomb that
  clears 3 of its neighbours breaks 3 layers), decrementing `lockCount`; unlocks at 0.
  A bomb dropped *directly onto* a lock also lands one extra direct-hit break. A
  counter badge (centered under the 🔒) shows the remaining breaks. Placed via a
  3-tuple `[r,c,N]` in the level's `locked`/`breakLocks.locked` array (`[r,c]` = 1
  layer). The `breakLocks` goal counts total **layers**, not tiles. Lock-breaking is
  centralized in `breakLockLayer(idx)` + `breakAdjacentLocks(collected)` (board.js),
  called from both the combo path (turn.js) and the bomb path (bank.js
  `detonateBombAt`).
- **Stacked card**: `stack=N` — a pile of **N** cards on one slot (top + N−1 underneath).
  Collecting the top card re-seeds the *same slot* with the next card carrying `stack=N−1`
  (handled in `placeNewCards`, before the deck/normal refill — the pile is its own supply),
  until it's exhausted. A **square** counter (top-right) shows the total on the tile, and
  `.card.stacked` draws offset "sheets" hinting at more below. Placed via
  `stacks: [[r,c,N]…]` in the level data. `countBoardCards()` (board.js) counts a stacked
  tile as all N layers (used by the `clearAll` goal so it stays winnable).
- **Disabled cell**: the board slot is `null` (level `disabled: [[r,c],...]`).
- **Back-effect card**: a normal card carrying `backEffect=<id>` (one of `row`/`column`/
  `cross`/`circle`/`star`; see `BACK_EFFECTS` in [specials.js](specials.js)). The effect icon
  sits in the tile's **top-left corner**, drawn on the `.cell` (via `decorateBackEffect`, like
  the stack badge) so it **stays put — doesn't rotate — while the card flips**. `decorateBackEffect`
  adds **two** cell emblems, both **top-left**: the blue **back badge** (`.back-effect-badge`) shown
  while the card is face-**down** (the "hidden effect" cue), and an amber **armed emblem**
  (`.back-effect-armed`) shown once the **player opens the card into the chain** (pops in, then
  breathes) so they know the revealed card is still loaded and with which effect. The back badge
  hides via `.card.flipped ~ …`; the armed emblem lights via `.card.flipped.armed ~ …`, where the
  `.armed` class is applied only to played chain cards (`updateBackEffectImpactPreview`) — so a card
  merely **flashed by a reveal effect** is flipped-but-not-armed and stays plain. When a
  back-effect card is collected, its cell emblems are hidden and a copy (`.back-effect-fly`) rides
  the flying clone to the Collection (`flyCardsToGoal`, clone set `overflow:visible` so it isn't
  clipped). When the card is
  **collected as part of a successful chain**, its effect fires: `getBackEffectPattern` reveals
  the pattern's cards (row/column span the whole line; cross/circle/star use offsets), merged
  into `endTurn`'s `revealTargets` so they flash face-up briefly and land in **Recall** for the
  next turn. Placed via `backEffects: [[r,c,id]…]` in the level data (one-time; a refill card in
  the same slot is plain). Authorable via the level-editor's **Back Effect** tool.
  - **Impact glow** (`.reveal-impact`, a soft *white* cue — not the red danger ember): the impact
    area lights up while the card sits in the active chain (`updateBackEffectImpactPreview`, driven
    by `updateChainIndicator`) and **stays lit** through the resolve, held a beat
    (`BACK_EFFECT_PREVIEW_MS`) before the reveal. Both the impact glow and the danger ✕ marks
    persist untouched until each card is actually revealed — the highlight is stripped as the card
    flips up (in `revealCardsNoHide` / `boosterReveal`), so it never blinks off and back on;
    `finishTurn` clears any highlight on a card that won't be revealed. **Danger wins**: a tile
    that is both a danger card and an impact target shows the red ember (CSS override +
    `markWrongColorHint` strips `.reveal-impact`).
  - **Activation slam** (`slamBackEffectIcons` in vfx.js, `.back-effect-slam`): during that hold,
    each collected back-effect card's icon scales up and slams down over its tile, and the reveal
    bursts out as it lands (`BACK_EFFECT_PREVIEW_MS` is tuned to the slam moment).
  - The **Chain Danger Reveal** (`pendingDangerReveal`) is folded into the *same* reveal batch in
    `endTurn`, so back-effect and danger reveals flash **together** rather than one after the other.
- **Iced card** (`iced=true` + `locked=true`): part of an **Ice area**
  (`ice: [{cells,threshold}…]`). Inert — `onCardClick` bails, reveals/Recall/danger
  marks skip it, and **bombs can't chip it** (`breakLockLayer` refuses iced tiles).
  The whole area melts when `cardsCollectedTotal >= threshold` (cards of *any*
  colour, level-wide). `locked=true` is set deliberately so every existing guard
  skips the tile for free. Badge: `❄ <remaining>` at the area centroid.
- **Color-locked card** (`colorLocked=true` + `locked=true`): part of a **Color Lock
  area** (`colorLocks: [{cells,color,count}…]`). Same inertness as ice, including
  bomb immunity — *"they only clear via their own collection condition."* Breaks
  when `cardsCollectedByColor[color] >= count`. Tinted by the required colour.
  `assignBoardColors` has a solvability pass that injects enough of that colour into
  free cells (crediting authored cards) and `console.warn`s if it can't.
- **Elevator cell**: part of an **Elevator area** (`elevators: [{cells,refills}…]`).
  Such a cell **never refills per-card** — it goes `null` and stays empty until the
  *whole area* is clear, then a fresh batch emerges at once (`.elevator-emerge`),
  decrementing `refillsLeft`. Checked **before** the `clearBoard` deck branch in
  `placeNewCards`, or the deck would swallow the slot and the elevator never fires.
  Batch N carries layer `-N`, so `beneath[]` can author its colours/back-effects.
  Badge: `⬆N` while the slot is empty.
- `marked` (⭐) / `ordered` (numbered) flags are added by specific goal types.
- **Authored colour**: a level can hand-pin a card's `color` via `colors: [[r,c,color]…]`
  (any tile, including locked/iced/color-locked — the pin is the colour *under* the lock). These
  are **fixed** — never re-rolled, so the level plays the same every time. Applied in
  `assignBoardColors` (board.js), which also honours per-colour totals (`colorCounts`) and keeps
  color-lock levels solvable by adjusting only the *un-authored* cells. Cards emerging later from
  a Stack/Elevator can carry an authored colour too via `beneath[].color` (read by
  `getBeneathColor`, applied in `reseedStackTile`/elevator refill — same path as `beneath[].backEffect`).

Grid math: `toRC(i)` → `{r,c}`, `toIndex(r,c)` → flat index. `COLS`/`ROWS`/`TOTAL`
are set per-level in `initLevelConfig()`.

---

## 6. Scoring & combo system

- Combo length = `matched.length + specialsUsed.length`.
- Collection happens when `combo >= getMinCombo()` **or** the turn is a colour clear.
- Points ([turn.js:332](turn.js)): **combo 2 → 50, 3 → 100, 4 → 150, N≥5 → N×50**.
- **Chain rewards** ([boosters.js:153](boosters.js)): a chain of 3+ calls
  `grantChainReward(combo)`, which tops up a **booster in your stash** per
  `CHAIN_REWARD_TIERS` — **5+ → Baby Bomb, 7+ → BIG Bomb** — and flies the icon into
  its tray tile (or pulses "full" if already at `max`). By default only the highest
  tier is granted; `cumulativeChainRewards` grants every tier passed.
- **Colour clear**: every remaining card of a collected colour is gone. Collects at
  any length, **refunds the spent turn**, shows a "`<COLOUR>` Cleared" banner +
  turn-refund float. Detected both proactively (`tryAutoResolveColor`, fires the
  moment the last card of the colour is opened) and in `endTurn`'s `clearedColors`.
- **Stars** ([endgame.js:97](endgame.js)): based on **turns remaining fraction** at
  win — `≥2/3 → 3★`, `≥1/3 → 2★`, else `1★`.
- Score display is animated (`animateScore`) and lags the internal `score` var.
  `clearBoard` levels hide Score entirely (CSS) and show Deck/Left instead.

> **Dead code warning.** `DEFAULT_COMBO_MAP` / `getSpecialForCombo` /
> `getComboMapping` (and the Settings "combo→special mapping" UI) are **vestigial** —
> `getSpecialForCombo` has **no callers**, and `endTurn`'s `newSP` is initialised to
> `-1` and never assigned. Combos have not spawned board specials since chain rewards
> replaced them. Don't reason from that mapping; don't extend it without rewiring.

`SFX.shepard(n)` plays a **Shepard-tone that rises with chain length** — the audio
feedback for a growing combo. Don't remove the `n` argument; it indexes pitch.

---

## 7. Special cards (`SPECIAL_TYPES`, [specials.js:12](specials.js))

Board-placed cards with abilities. They are **deployed pre-level from inventory** or
created by boosters — **not** spawned by combos any more (§6). Adding an entry here
auto-wires it into the inventory UIs.

| id | icon | Name | Effect |
|----|------|------|--------|
| `peek` | 👁 | Peek | Flash 2–3 nearby cards ~1.5s, then hide. |
| `tint` | 🎯 | Tint | Add a persistent color hint to 3–4 nearby face-down cards. |
| `spotlight` | 🔦 | Spotlight | Enter tap-mode: next tapped face-down card is permanently revealed. |
| `echo` | 🔔 | Echo | Next flipped card stays visible one extra turn. |
| `cross` | 💣 | Baby Bomb | Reveal 4 orthogonally-adjacent cards. |
| `ring` | 💥 | BIG Bomb | Reveal 8 surrounding cards. |
| `diamond` | ☢︎ | Nuke! | Reveal 12 cards in an extended cross. |

**`wild` has been removed** from `SPECIAL_TYPES`. No entry carries `isWild`, so the
wild handling still present in `turn.js` / `board.js` / `goals.js` is unreachable.
Re-adding a wild card means re-adding the type — the plumbing is already there.

- Bombs (`cross`/`ring`/`diamond`, `isBombType()`) reveal via `offsets` patterns
  and explode with VFX (`explodeBomb`).
- **Reveal timing** depends on the `instantSpecialReveal` rule: either fire
  immediately on click, or defer to `endTurn`. `peek/tint/spotlight/echo` are
  *always* instant.
- With the **Colored Bombs** rule, bombs carry `bombColor` and open a **parallel
  chain** of that color (`chainColors` Set); revealed cards of that color
  auto-join the chain.

---

## 8. Boosters / power-ups (`BOOSTERS`, [boosters.js:8](boosters.js))

Consumable, count-limited helpers shown in the booster bar. Distinct from special
cards (specials live on the board; boosters are inventory buttons).

| id | icon | Effect | needsTap |
|----|------|--------|:--------:|
| `peek` | 👁 | Reveal one tapped card (also long-press any card if `longPressPeek`). | yes |
| `babybomb` | 💣 | Destroy a tapped card + its 4 neighbours (`cross` blast). **Drag-to-place** (see below). | drag |
| `bigbomb` | 💥 | Destroy a 3×3 block (`ring` blast). **Drag-to-place**. | drag |
| `random3` | 🎲 | Reveal 3 random face-down cards. | no |
| `pluscolor` | ➕🎨 | Reveal one more card of your chain's color (or the most common color if no chain is active). | no |
| `cross` | ✚ | Reveal a cross around the tapped card. | yes |
| `row` | ↔ | Reveal the tapped card's whole row. | yes |
| `col` | ↕ | Reveal the tapped card's whole column. | yes |
| `neighbor` | 🔗 | Reveal same-color neighbors around the last revealed card. | no |
| `colorpick` | 🎨 | Pick a color, reveal 3 cards of it. | no |
| `shield` | 🛡 | Next 2 wrong flips don't break the combo. | no |
| `joker` | 🃏 | Tapped card copies your last-played card (its color or special). | yes |

- Counts persist in `progress.boosterCounts`; `hasBooster()`/`consumeBooster()`
  gate use. The `unlimitedPowerUps` rule makes them free.
- **Only 5 appear in the tray**: `VISIBLE_BOOSTERS = ['peek','random3','pluscolor',
  'babybomb','bigbomb']` ([boosters.js:40](boosters.js)). Hidden boosters still keep
  their inventory counts.
- Disabled by default: `cross`, `shield`, `neighbor`, `row`, `col`, `joker`,
  `colorpick` (`DISABLED_BY_DEFAULT_BOOSTERS`, [settings.js:463](settings.js)).
- **Capacity**: only the bombs are capped (Baby Bomb `max:3`, BIG Bomb `max:1`, both
  `startQty:0`) and show a `count/max` badge; everything else is uncapped.
- **Recall** (🔄) re-reveals `lastRevealedCards` for **`RECALL_COST` = 10 coins**
  ([endgame.js:29](endgame.js)) — it is *not* free — and is unlocked from a
  configurable level. It lives in its own bar above the chain, not in the tray.
  **Bank It** (💰) manually resolves a qualifying chain and, after 3 banks, lets you
  place a Baby Bomb. (`bankButton` now defaults **off**.)
- **Bombs are drag-only** ([bomb-aim.js](bomb-aim.js)): press the Baby/BIG bomb
  button (or Bank-It's "Place Bomb") and drag in **one gesture** — a live blast
  **silhouette** snaps to the tile under the pointer so the player sees exactly
  what will be destroyed; release on a valid tile to drop. Any other release
  (off-board, invalid tile, a plain tap that never reached a valid tile, or a
  cancelled pointer) just aborts — there is **no tap-to-place fallback**. While a
  drag is active, `isBombAiming()` is true and it owns board input (`onCardClick` /
  long-press peek bail out); commit routes to `detonateBombAt`. Bombs no longer use
  the old tap-then-tap `bomb-placement` glow or `activeBooster`.
- **Bombs break locks.** A **locked tile is a valid drop target** and any locked
  tile in a bomb's blast (including a lock dropped directly on) has **one lock layer
  broken** instead of being destroyed (`detonateBombAt` → `breakLockLayer`); a BIG
  bomb chips every lock in its 3×3. This applies only to placed Baby/BIG/Bank bombs —
  special *bomb cards* (cross/ring/diamond) still only reveal and skip locked tiles.

---

## 9. Level goals / win conditions

A level wins when **all** of its `goals` are met (`checkAllGoalsMet()`
[goals.js:164](goals.js)). Goals are declarative in the level data. **Ten** types
exist — each has: init (`initLevelGoals`), progress (`updateGoalProgress`), a
met-check, an icon, a description, and a HUD display.

| type | Meaning | Key fields |
|------|---------|-----------|
| `score` | Reach a target score. | `target` |
| `colorCollect` | Collect N cards of specific colors. | `requirements: {color:n}` |
| `specificCombos` | Make N combos of length ≥ minLength. | `minLength`, `count` |
| `markedCards` | Collect ⭐-marked cards (respawn to keep `onBoardCount` on board). | `totalToCollect`, `onBoardCount` |
| `orderedCards` | Collect numbered cards **in order** (out-of-order = instant fail). | `count`, `positions` |
| `colorAvoid` | Don't flip a color more than `maxFlips` times (acts as lives; instant fail). | `color`, `maxFlips` |
| `rowCoverage` | Clear a combo touching each row N times. | `rows[]` or `timesEachRow` |
| `colCoverage` | Same for columns. | `cols[]` or `timesEachCol` |
| `breakLocks` | Unlock all locked tiles (clear adjacent combos; multi-lock tiles need N breaks). | `locked: [[r,c]` or `[r,c,N],...]` |
| `clearAll` | **Clear the whole board** — cleared slots refill from a finite `deck` until it runs out, then stay empty. The goal of every Cleaning level. | (none; reads `deck` + board) |

`clearAll` is the one type with **no `updateGoalProgress` case** — its progress is
derived from live board+deck state on each render rather than incremented.

Levels can combine goals (e.g. `score` + `breakLocks`, or `clearAll` +
`orderedCards`). `colorAvoid` and out-of-order `orderedCards` trigger **immediate
fail** mid-turn.

> ⚠️ **Do not combine `breakLocks` with an ice or color-lock area.** `initLevelGoals`
> totals every card with `locked === true` ([goals.js:60](goals.js)) and runs *after*
> ice/color-locks have set `locked = true` ([level.js:399](level.js),
> [level.js:415](level.js)) — but `breakLockLayer` refuses those tiles, so `broken`
> can never reach the total and the level is unwinnable. No shipped level hits this.

**A level definition** looks like ([levels_default.js](levels_default.js)):
```js
{ id, cols, rows, colorCount, turns, goals: [...],
  disabled?: [[r,c]...], locked?: [[r,c]...],
  stacks?: [[r,c,N]...], backEffects?: [[r,c,effectId]...],
  colors?: [[r,c,color]...],        // authored FIXED card colours (any tile)
  colorCounts?: { color: n, ... },  // per-colour total on the top board (authored count toward it)
  beneath?: [{ r,c,layer, backEffect?, color? }],  // authored cards emerging from Stacks/Elevators
  elevators?: [{ cells:[[r,c]...], refills:N }...],    // batch-refill areas
  ice?:       [{ cells:[[r,c]...], threshold:N }...],  // melt at N total cards collected
  colorLocks?:[{ cells:[[r,c]...], color, count }...], // open at N of `color` collected
  clearBoard?: true, deck?: N }    // Cleaning levels: finite refill pool (§10)
```

---

## 10. Progression, journeys & meta systems

### Journeys ([progression.js](progression.js))
**Five** journeys, swapped by `applyProgression(style)`:
- **cleaningxl** — 40 levels. **This is the live journey** (`MAIN_JOURNEY`,
  [home-room.js:20](home-room.js), consumed by [boot.js:14](boot.js)). Players never
  see the picker; it's dev-only via Settings.
- **cleaning** — the same 40 levels on a smaller board + a non-zero `deck`
- **default** — 16 original levels
- **short** — 40 levels (~30 min)
- **long** — 253 levels (full campaign)

#### Cleaning / Cleaning XL — the `clearBoard` levels
Both are "clean the whole board" journeys: every level sets `clearBoard: true` and a
single `clearAll` goal. **The flag, not the journey name, drives the behaviour:**
cleared slots draw from the finite `deck` instead of generating a card; initial
colours come from `generateClearableColors` (every colour present ≥3×, so the board
is provably clearable); the header's "Target" slot becomes **Deck** (refills left) or
**Left** (cards remaining) when `deck` is 0; Perfect-Sweep reveal is force-disabled;
the Collection "graveyard" tray turns on; Score and the goal HUD are hidden by CSS.

The two differ only in *where the extra cards live* — Cleaning uses a small board +
`deck: N`; **Cleaning XL** uses `deck: 0` and a board enlarged to absorb it. XL is
also the only journey carrying the advanced obstacles (locks, stacks, elevators, ice,
color-locks, back-effects) and the only one wired to the hall art.

When the deck empties, a cleared slot becomes a permanent hole — no banner, no event.
That one-way shrink is what makes `clearAll` terminate.

### Home screen: collection halls ([home-room.js](home-room.js))
The home screen is a **collection meta-layer**, not a level list. Halls come from
`COLLECTIONS.halls` (§3) — **Music Hall** (instruments) and **Green Pasture**
(animals), 5 slots each, covering levels 1–10. A slot's item is revealed once
`progress.stars[slotLevelIndex(slot)] > 0`; `progress.seenInstruments` / `seenHall`
track first-time reveal animations. After a win you always return to the hall so you
see what you unlocked. Above PLAY sit the **win-streak meter** and the **next-level
reward pills**. A dev level-jumper is appended outside the phone frame.

Note: halls only cover levels 1–10, so for level 11+ `currentHallIndex()` falls back
to the last hall the player has fully cleared past. And `seenInstruments`/`seenHall`
are **not** in the per-journey snapshot, so hall reveal state leaks across journeys.

Each journey keeps an **independent progress snapshot** in `progress.journeys[style]`
(unlocked level, stars, coins, lives, streak, inventories, seen-tutorial flags).
Switching journeys saves the current snapshot and restores the target's.

### Staggered feature unlocks (`PROGRESSION_UNLOCK_LEVELS`)
Features turn on at configurable levels per journey, so early levels stay simple:
`winStreakStartLevel`, `deploySpecialsStartLevel`, `recallStartLevel`,
`sweepRevealStartLevel`. Checked by `isWinStreakActive()` etc. in `settings.js`.

### Win streak ([settings.js:204-298](settings.js))
Consecutive wins build a streak (`progress.winStreak`) granting a start-of-level
boost — either a **board reveal %** or **shields** (`WIN_STREAK_LEVELS`, effect
chosen in Settings). Losing resets the streak (payable-to-keep for `KEEP_STREAK_COST`
coins on the fail screen).

### Economy
- **Coins**: earned 8–12 per win; spent to continue a failed level (+5 turns) or
  keep a streak.
- **Lives**: start at 5, `-1` on fail (UI only; not a hard gate in this build).
- **Level rewards**: after certain levels, grant boosters or special cards
  (`getLevelRewards()`, per-journey `levelRewards`, editable in Settings).

### Pre-level prep ([level.js:78-265](level.js))
Before a level (once `deploySpecials` is unlocked) the player sees goals, rewards,
streak status, and can **deploy owned special cards** onto the board from inventory.

### Tutorials & nudges
- First-time popups for each special card / booster / feature
  (`checkSpecialTutorials`, `FEATURE_TUTORIALS`, `progress.seen*` arrays).
- **Nudge system** ([ui-nudges.js](ui-nudges.js)): after 5s idle mid-combo
  or 3 failed combos, a 👇 hand hints at Recall or power-ups.

### Persistence ([settings.js:303-331](settings.js))
Everything lives in one `localStorage` object `mm_progress` (`loadProgress`/
`saveProgress`). Call `saveProgress()` after mutating `progress`.

---

## 11. Configurable gameplay rules (`GAMEPLAY_RULES`, [settings.js:5-36](settings.js))

**Eighteen** toggles in the in-game Settings panel that change core mechanics. Read
the current value with `getRule(id)` (falls back to each rule's `default`):

| id | default | Effect |
|----|:-------:|--------|
| `instantSpecialReveal` | off | Specials reveal on click vs. at end of turn. |
| `hiddenNewCards` | **on** | Replacement cards arrive face-down (no brief reveal). |
| `chainPulse` | **on** | Chain cards pulse; intensity grows with chain length. |
| `chainTimer` | off | Countdown (default 10s) starting at chain length 3; expiry breaks the chain. |
| `revealOnUnlock` | off | Briefly reveal a card's color when unlocked. |
| `revealLockedCards` | **on** | Locked/iced/color-locked cards sit **face-up** so you can memorise them; the moment one unlocks it flips face-down. |
| `sweepReveal` | off | Perfect sweep flashes the whole new board. (Force-disabled on `clearBoard` levels.) |
| `coloredBombs` | off | Bombs inherit combo color & open parallel chains; all-colors → +500 auto-reveal. |
| `bombChainStay` | **on** | Cards a bomb uncovers matching the chain color join the chain and stay on the board. Off = the bomb collects them. |
| `bombRevealNewCards` | off | Cards replacing bombed ones arrive briefly revealed. |
| `longPressPeek` | **on** | Long-press any card to peek (consumes a Peek). |
| `bankButton` | off | Show the "Bank it" button to bank a qualifying chain. |
| `unlimitedPowerUps` | off | Power-up counts never decrease. |
| `legacyMatch3` | off | **Restores the original 3+ minimum.** Off = Match-2 (the default) — see §4/§6. |
| `cumulativeChainRewards` | off | A long chain awards every tier it passed, not just the highest. |
| `blueTheme` | off | Original blue palette instead of the default purple. |
| `collectionTray` | **on** | Show the "graveyard" stack of cleared tiles (Cleaning levels). |
| `chainDangerReveal` | **on** | When a chain ends, briefly flip up the danger-marked tiles so you learn their colors. |

**Chain danger hints** are separate and unconditional: at chain length 3,
`applyChainColorHint` marks up to `getChainHintCount()` (default 3, tunable in
Settings; 0 disables) random face-down non-matching cards with a red ember. Locked /
iced / color-locked tiles are never marked. `chainDangerReveal` is what makes them
pay off — the marks survive the resolve and are stripped only as each card flips up,
so a highlight never blinks off and back on.

The Settings panel also exposes: chain-timer duration, chain-hint count, win-streak
start level & effect, deploy/recall/sweep start levels, the (vestigial, §6)
combo→special mapping, **level rewards**, per-booster enable+quantity, special-card
inventory, journey picker, reset-tutorials, and unlock-all-levels. It's essentially a
live design/tuning console.

---

## 12. Conventions & gotchas (read before editing)

- **Global namespace.** All functions/vars are global; scripts load via ordered
  `<script>` tags. `config.js` → level data → progression data → `collections.js` →
  `settings.js` → engine files (`state.js` … `boot.js`). Because these are **classic** scripts,
  top-level `function`/`let`/`const` share one global lexical scope across files, so
  any engine file can call any other and read the shared state in `state.js`.
  **Load-order rules when adding/reordering engine files:**
  1. **No name may be declared twice** across all files (a duplicate top-level
     `function`/`let`/`const` throws at load). Each name lives in exactly one file.
  2. Ordering only matters for code that runs *at load time* (not functions, which
     run later). So **`state.js` must stay first** (declares shared state + DOM refs;
     its `currentLevelIndex = progress.highestUnlocked` needs `progress` from the
     earlier `settings.js`) and **`boot.js` must stay last**. Two other load-time
     calls exist in between: `initInventoryDefaults()` in `specials.js` (needs only
     `SPECIAL_TYPES`, same file) and `setBgOption()` at the bottom of `board-bg.js`
     (needs `#bg-switcher` in the DOM — fine, since all scripts sit at the end of
     `index.html` — and `COLLECTIONS`, so `collections.js` must load earlier).
     Everything else is call-time-only and order-independent.
- **Any remaining `gameplay.js:NNNN` citation** predates the split and is stale — use
  the file map in §3 and the function index in §13 to find the owning file.
- **Don't hardcode the combo minimum.** Use `getMinCombo()` (§4).
- **Dead code to not reason from**: the combo→special mapping (§6), the `wild`
  special (§7), and `remnantHintShown` (declared in `state.js`, reset in `level.js`,
  never set or read — the remnant idea was generalised into colour clear).
- **`inputLocked` discipline.** Almost every animation sets it. Any new branch
  that returns early during a turn must eventually clear it, or input dies.
- **Data-driven extensibility.** Add a special card to `SPECIAL_TYPES`, a booster
  to `BOOSTERS`, a rule to `GAMEPLAY_RULES`, or a goal type to the goal
  switch-blocks — the UIs (settings, combo map, pre-level, HUD) pick them up
  automatically. New **goal types** must be added in *all* of: `initLevelGoals`,
  `updateGoalProgress`, `checkAllGoalsMet`, `goalIcon`, `goalDescription`,
  `getGoalDisplay`.
- **Level files are generated.** Edit levels/progression through `level-editor/`
  (or update both the `.js` and `.json` twins). The game only loads the `.js`.
  Same applies to `collections.js` (halls + board art) — see §3.
- **`nextLevel()` has a legacy "all 10 levels" string** (in [level.js](level.js))
  even though journeys have 16/40/253 levels — cosmetic end-of-journey message.
- **No build/test/lint.** Verify changes by opening `index.html` and playing.
  Use the Settings panel + "🧪 Test Level" / "🔓 Unlock All" to reach states fast.
- **Dev buttons in the level banner** (`.dev-btns`, stacked so the pair costs no more
  width than the old single button — the coin pill + gear have no slack): **Fill**
  (`fillBoosters`, tops up the tray power-ups) and **Finish** (`devFinishLevel` in
  [level.js](level.js)) — wipes the board + deck, force-satisfies every goal type, then
  calls the normal `levelWon()`, so the win overlay / rewards / streak / hall reveal /
  board art can be inspected without playing the level out. Add new goal types to its
  switch too, or Finish silently won't satisfy them.
- **Colors are fixed** to the six in `ALL_COLORS` (red, green, blue, yellow,
  orange, purple); `colorCount` per level slices how many are active
  (`ACTIVE_COLORS`) — so orange/purple only appear at `colorCount` 5/6. Each
  color's CSS hex lives once in `COLOR_HEX` (config.js); `cssColor(c)` reads it.
- **Board-colour assignment is authored-aware** (`assignBoardColors`, board.js, run every
  `startGame`). Precedence: authored `colors` (fixed, never moved) → color-lock **solvability
  shortfall** → `colorCounts` targets → clearable/random fill. The solvability pass only touches
  *un-authored* cells and **credits the author's own cards toward each lock's requirement**, so a
  hand-built cascade (the cards that open lock A are placed under lock B) is respected instead of
  being force-fed into the free cells — it no longer requires "all needed cards free at start."
  It `console.warn`s (never throws) when it can't guarantee a lock or hit a count; unsolvable
  authored layouts are the designer's responsibility. Authored colours may even be outside a
  level's active slice — allowed on purpose. The **level-editor** authors all this: a **Color**
  tool (paints a fixed colour on any tile / beneath layer), and a **Color Counts** panel.

---

## 13. Quick function index

| Concern | File | Entry points |
|---------|------|--------------|
| Boot / journeys | `boot.js` / `progression.js` | `boot()`, `applyProgression`, `loadProgression` |
| Home screen / halls | `home-room.js` | `showHome`, `renderHall`, `slotLevelIndex`, `playFromHome`, `renderHomeStreak`, `renderHomeReward`, `jumpToLevel`, `MAIN_JOURNEY` |
| Board background art | `board-bg.js` | `applyBoardBackground`, `bgArtBox`, `setBgOption`, `currentLevelBackground` |
| Halls / board art data | `collections.js` | `COLLECTIONS` (`themes`, `items`, `halls`, `boardArt`) |
| Start a level | `level.js` | `showPreLevel` → `confirmPreLevel` → `startGame`; `initLevelConfig` |
| Core loop | `turn.js` | `onCardClick`, `endTurn`, `placeNewCards` |
| Turn finish | `endgame.js` | `finishTurn`, `recallCards`, `tryAutoResolveColor` |
| Scoring/min combo | `turn.js` / `specials.js` | `endTurn` (scoring block), `getMinCombo` |
| Chain rewards | `boosters.js` | `CHAIN_REWARD_TIERS`, `getChainRewardBoosters`, `grantChainReward` |
| Chain danger hints | `boosters.js` | `applyChainColorHint`, `getChainHintIndices`, `revealChainDangerCards` |
| Ice / color-lock / elevator | `board.js` / `level.js` / `turn.js` | `registerCollected`, `checkIceBreaks`/`breakIceArea`, `checkColorLockBreaks`/`breakColorLockArea`, `normalizeIce`/`normalizeColorLocks`/`normalizeElevators`, `placeNewCards` (elevator batch) |
| Cleaning deck | `board.js` / `turn.js` | `buildDeck`, `updateDeckHUD`, `placeNewCards` (deck draw) |
| Specials | `specials.js` / `board.js` | `SPECIAL_TYPES`, `getRevealPattern`, `createSpecialCard` |
| Back-of-card effects | `specials.js` / `board.js` / `turn.js` | `BACK_EFFECTS`, `getBackEffectPattern`, `decorateBackEffect`, `endTurn` (reveal-on-collect block) |
| Board colours (authored/counts/solvability) | `board.js` / `level.js` | `assignBoardColors`, `getBeneathColor`, `generateClearableColors` |
| Boosters | `boosters.js` | `BOOSTERS`, `activateBooster`, `executeBoosterTap` |
| Bomb drag-to-place | `bomb-aim.js` | `startBombBoosterDrag`, `startBankBombDrag`, `renderBombSilhouette`, `commitBombAim`, `isBombAiming` |
| Bank It | `bank.js` | `bankChain`, `updateBankButton`, `detonateBombAt` |
| Goals | `goals.js` | `initLevelGoals`, `updateGoalProgress`, `checkAllGoalsMet` |
| Win/fail | `endgame.js` | `levelWon`, `levelFailed`, `continueLevelWithCoins` |
| Board render / UI | `board.js` | `renderBoard`, `buildCardHTML`, `updateChainIndicator`, `breakLockLayer` |
| VFX / animation | `vfx.js` | `flyCardsToGoal`, `spawnParticles`, `animateScore`, `sweepRevealBoard`, `revealEntireBoard` |
| Skippable reveals | `reveal-skip.js` | `runSkippableReveal`, `skipReveal`, `isRevealing`, `discardActiveReveal` |
| Tutorials | `tutorials.js` | `advanceTutorial`, `showNextItemTutorial`, `buildLevelGrid` |
| Shared state / DOM refs | `state.js` | `board`, `score`, `turns`, `chainCards`, `inputLocked`, `boardEl`, … |
| Config/rules | `settings.js` | `GAMEPLAY_RULES` + `getRule`, `showSettings` |
| Persistence | `settings.js` | `loadProgress`/`saveProgress` |
