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
- A chain of **3+** scores points and clears those cards; new cards drop in.
- Long chains (4, 5, 6+) also **spawn special cards** (Wild, bombs, etc.).
- Each level has **limited turns** and one or more **goals** (reach a score,
  collect colors, break locks, cover rows, etc.). Meet all goals before turns
  run out to win.

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
| `index.html` | ~242 | DOM skeleton: HUD, board container, all overlay screens (home, journey picker, level select, pre-level, win/fail, settings, tutorials). Loads all scripts in order. |
| `settings.js` | ~660 | Config layer: `GAMEPLAY_RULES` toggles, win-streak config, persistence (`progress`), the in-game **Settings panel** UI, combo→special mapping UI, level-rewards UI. |

**The engine** (formerly one ~3,370-line `gameplay.js`) is now split by concern into
17 files, all loaded as ordered `<script>` tags sharing one global namespace. They are
loaded in this order after `settings.js` (see [index.html](index.html)):

| File | Role |
|------|------|
| `state.js` | **Loads first.** All cross-cutting shared state (`board`, `score`, `turns`, `chainColor`, `chainCards`, `specialsUsed`, `turnActive`, `inputLocked`, `shieldCharges`, `deck`, `COLS/ROWS/TOTAL`, `currentLevelIndex`, `levelGoals`, …) + top-level DOM refs (`boardEl`, `scoreEl`, …) + progression-data consts. |
| `audio.js` | `SFX` — Web Audio API programmatic sound. |
| `vfx.js` | Juice/animation: particles, `flyCardsToGoal`, confetti, `animateScore`, board/sweep banners, score popup, initial board reveal. |
| `progression.js` | Journeys: load/save/restore snapshots, `applyProgression`, `playFromHome`. |
| `specials.js` | `SPECIAL_TYPES`, level rewards, combo→special mapping, `getMinCombo`, `getSpecialForCombo`. |
| `goals.js` | Level goals: `initLevelGoals`, `updateGoalProgress`, `checkAllGoalsMet`, goal HUD. |
| `board.js` | Card model/factory, `renderBoard`, board-cell UI, chain tension/faces/indicators, long-press peek, `boardEl` event listeners. |
| `chain-timer.js` | Optional chain countdown timer. |
| `boosters.js` | `BOOSTERS`, booster inventory/consume/UI + booster execution actions. |
| `bank.js` | Bank-It button + `detonateBombAt` (bomb blast + refill). |
| `bomb-aim.js` | **Drag-to-place** for Baby/BIG bombs: press a bomb button (or Bank-It "Place Bomb") and drag; a live blast silhouette snaps to the tile under the pointer. Drives commit → `detonateBombAt`. Owns board input while `isBombAiming()`. |
| `tutorials.js` | Main tutorial, feature/special/booster popups, level-select grid. |
| `ui-nudges.js` | Idle-nudge/hint system, `closeAllOverlays`. |
| `level.js` | Level lifecycle: `initLevelConfig`, pre-level prep UI, `startGame`, retry/test/next. |
| `turn.js` | **Core loop:** `onCardClick`, `endTurn`, `placeNewCards`/reveal helpers. |
| `endgame.js` | `recallCards`, `finishTurn`, win/fail overlays, continue-with-coins. |
| `boot.js` | **Loads last.** `boot()` IIFE — restores progression, shows home. |
| `config.js` | 4 | `ALL_COLORS = ['red','green','blue','yellow']`. |
| `style.css` | ~750 | All styling + CSS animations (flips, particles, banners, nudges). |
| `levels_default.js` / `_short.js` / `_long.js` | — | Level definitions per **journey** (16 / 40 / 253 levels). `.json` twins exist for the editor. |
| `progression_default.js` / `_short.js` / `_long.js` | — | Per-journey unlock thresholds + level rewards. |
| `level-editor/` | — | Standalone visual editor (`index.html` + `editor.js`) to author levels & progression; exports `.json` and `.js`. Not loaded by the game. |
| `audio/`, `blocks/`, `icons/` | — | Sound files, card art, UI icons. |

`.js` and `.json` level files are **generated by the level editor** — the header
comment says "Auto-generated by level-editor". Prefer editing via the editor, or
keep the `.js` and `.json` in sync manually.

---

## 4. The turn lifecycle (most important mental model)

A "turn" = one attempt at a chain, ending on a mismatch, a manual bank, or a
completed sweep. This is the core loop — trace it before touching combat code.

```
onCardClick(index)                       [gameplay.js:2414]
  ├─ special-card cases (bomb placement, active booster, spotlight, wild, specials)
  ├─ first flip of turn → turnActive=true, chainColor=card.color, chainCards=[i]
  ├─ same color   → push to chainCards, SFX.shepard (rising pitch), check sweep
  ├─ wrong color  → if shieldCharges>0: absorb; else → endTurn(false)  after 500ms
  └─ (chain length 3 starts the optional chain timer)

endTurn(manual, perfectSweep)            [gameplay.js:2671]
  ├─ turns--   (every resolved turn costs one turn)
  ├─ compute `matched` (drop trailing mismatched card), `combo = matched+specials`
  ├─ combo >= 3 →
  │     • score: combo 3=100, 4=150, else combo*50
  │     • updateGoalProgress(matched, combo)
  │     • getSpecialForCombo(combo) may spawn a special card at last position
  │     • flyCardsToGoal animation → cards removed, adjacent locked cards unlock
  ├─ activate any used special cards' reveal patterns
  ├─ placeNewCards() drops fresh cards into cleared slots
  └─ finishTurn()                        [gameplay.js:3019]
        ├─ reset chain state
        ├─ checkAllGoalsMet() → levelWon()
        └─ else turns <= 0   → levelFailed()
```

Key rule: **a chain of exactly 1–2 cards scores nothing** (it must be 3+). The
last card of a mismatched chain is dropped from `matched` before scoring.

### Turn-state variables ([gameplay.js:132-139](gameplay.js))
- `board[]` — array of card objects (or `null` for disabled cells).
- `score`, `turns` — current level score and remaining turns.
- `chainColor` — the color the current chain is matching.
- `chainColors` (Set) — parallel chain colors (only used with the Colored Bombs rule).
- `chainCards[]` — indices of normal cards in the active chain.
- `specialsUsed[]` — indices of special cards played this turn.
- `turnActive`, `inputLocked` — turn/animation gating flags.
- `shieldCharges`, `echoCharges`, `spotlightMode`, `activeBooster` — power-up state.
- `lastRevealedCards[]` — feeds the **Recall** button.

`inputLocked` is set `true` during every animation and reset in `finishTurn()` /
callback ends. **If you add an early `return` in the turn flow, make sure
`inputLocked` gets cleared** or the game freezes.

---

## 5. The card model

Cards are plain objects created by helpers at [gameplay.js:1635-1638](gameplay.js):

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
  the stack badge) so it **stays put — doesn't rotate — while the card flips**, and it **fades
  out once the card is opened (face-up)** since the effect belongs to the card's back
  (`.card.flipped ~ .back-effect-badge` in style.css). When the card is
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
- `marked` (⭐) / `ordered` (numbered) flags are added by specific goal types.

Grid math: `toRC(i)` → `{r,c}`, `toIndex(r,c)` → flat index. `COLS`/`ROWS`/`TOTAL`
are set per-level in `initLevelConfig()`.

---

## 6. Scoring & combo system

- Combo length = `matched.length + specialsUsed.length`.
- Points: **combo 3 → 100, combo 4 → 150, combo N≥5 → N×50** ([gameplay.js:2720](gameplay.js)).
- Longer chains also produce a **special card** via the **combo→special mapping**
  (`DEFAULT_COMBO_MAP` at [gameplay.js:1599](gameplay.js), editable in Settings):
  - combo 4 → `wild`
  - combo 5 → `cross` (Baby Bomb)
  - combo 6+ → `ring` (BIG Bomb)
- **Perfect Sweep**: clearing every remaining card of the active color(s) in one
  chain. Optionally flashes the whole next board (`sweepReveal` rule).
- **Stars** ([gameplay.js:3028-3031](gameplay.js)): based on **turns remaining
  fraction** at win — `≥2/3 → 3★`, `≥1/3 → 2★`, else `1★`.
- Score display is animated (`animateScore`) and lags the internal `score` var.

`SFX.shepard(n)` plays a **Shepard-tone that rises with chain length** — the audio
feedback for a growing combo. Don't remove the `n` argument; it indexes pitch.

---

## 7. Special cards (`SPECIAL_TYPES`, [gameplay.js:1539](gameplay.js))

Board-placed cards with abilities. They're spawned by combos, deployed pre-level,
or created by boosters. Adding an entry here auto-wires it into the combo-mapping
and inventory UIs.

| id | icon | Name | Effect |
|----|------|------|--------|
| `peek` | 👁 | Peek | Flash 2–3 nearby cards ~1.5s, then hide. |
| `tint` | 🎯 | Tint | Add a persistent color hint to 3–4 nearby face-down cards. |
| `spotlight` | 🔦 | Spotlight | Enter tap-mode: next tapped face-down card is permanently revealed. |
| `echo` | 🔔 | Echo | Next flipped card stays visible one extra turn. |
| `cross` | 💣 | Baby Bomb | Reveal 4 orthogonally-adjacent cards. |
| `ring` | 💥 | BIG Bomb | Reveal 8 surrounding cards. |
| `diamond` | ☢︎ | Nuke! | Reveal 12 cards in an extended cross. |
| `wild` | 🌈 | Wild | Matches any color — a wildcard inside a chain. |

- Bombs (`cross`/`ring`/`diamond`, `isBombType()`) reveal via `offsets` patterns
  and explode with VFX (`explodeBomb`).
- **Reveal timing** depends on the `instantSpecialReveal` rule: either fire
  immediately on click, or defer to `endTurn`. `peek/tint/spotlight/echo` are
  *always* instant.
- With the **Colored Bombs** rule, bombs carry `bombColor` and open a **parallel
  chain** of that color (`chainColors` Set); revealed cards of that color
  auto-join the chain.

---

## 8. Boosters / power-ups (`BOOSTERS`, [gameplay.js:535](gameplay.js))

Consumable, count-limited helpers shown in the booster bar. Distinct from special
cards (specials live on the board; boosters are inventory buttons).

| id | icon | Effect | needsTap |
|----|------|--------|:--------:|
| `peek` | 👁 | Reveal one tapped card (also long-press any card if `longPressPeek`). | yes |
| `babybomb` | 💣 | Destroy a tapped card + its 4 neighbours (`cross` blast). **Drag-to-place** (see below). | drag |
| `bigbomb` | 💥 | Destroy a 3×3 block (`ring` blast). **Drag-to-place**. | drag |
| `random3` | 🎲 | Reveal 3 random face-down cards. | no |
| `cross` | ✚ | Reveal a cross around the tapped card. | yes |
| `row` | ↔ | Reveal the tapped card's whole row. | yes |
| `col` | ↕ | Reveal the tapped card's whole column. | yes |
| `neighbor` | 🔗 | Reveal same-color neighbors around the last revealed card. | no |
| `colorpick` | 🎨 | Pick a color, reveal 3 cards of it. | no |
| `shield` | 🛡 | Next 2 wrong flips don't break the combo. | no |
| `joker` | 🃏 | Tapped card copies your last-played card (its color or special). | yes |

- Counts persist in `progress.boosterCounts`; `hasBooster()`/`consumeBooster()`
  gate use. The `unlimitedPowerUps` rule makes them free.
- Disabled by default: `cross`, `shield`, `neighbor`
  (`DISABLED_BY_DEFAULT_BOOSTERS`, [settings.js:341](settings.js)).
- **Recall** (🔄) is a free re-reveal of `lastRevealedCards`, unlocked from a
  configurable level. **Bank It** (💰) manually resolves a 3+ chain and, after 3
  banks, lets you place a Baby Bomb.
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
[gameplay.js:372](gameplay.js)). Goals are declarative in the level data. Nine
types exist — each has: init (`initLevelGoals`), progress
(`updateGoalProgress`), a met-check, an icon, a description, and a HUD display.

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

Levels can combine goals (e.g. `score` + `breakLocks`). `colorAvoid` and
out-of-order `orderedCards` trigger **immediate fail** mid-turn.

**A level definition** looks like ([levels_default.js](levels_default.js)):
```js
{ id, cols, rows, colorCount, turns, goals: [...],
  disabled?: [[r,c]...], locked?: [[r,c]...],
  stacks?: [[r,c,N]...], backEffects?: [[r,c,effectId]...] }
```

---

## 10. Progression, journeys & meta systems

### Journeys ([gameplay.js:1-118](gameplay.js))
Three selectable "journeys", swapped by `applyProgression(style)`:
- **default** — 16 original levels
- **short** — 40 levels (~30 min)
- **long** — 253 levels (full campaign)

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

### Pre-level prep ([gameplay.js:1152-1317](gameplay.js))
Before a level (once `deploySpecials` is unlocked) the player sees goals, rewards,
streak status, and can **deploy owned special cards** onto the board from inventory.

### Tutorials & nudges
- First-time popups for each special card / booster / feature
  (`checkSpecialTutorials`, `FEATURE_TUTORIALS`, `progress.seen*` arrays).
- **Nudge system** ([gameplay.js:141-216](gameplay.js)): after 5s idle mid-combo
  or 3 failed combos, a 👇 hand hints at Recall or power-ups.

### Persistence ([settings.js:303-331](settings.js))
Everything lives in one `localStorage` object `mm_progress` (`loadProgress`/
`saveProgress`). Call `saveProgress()` after mutating `progress`.

---

## 11. Configurable gameplay rules (`GAMEPLAY_RULES`, [settings.js:5-36](settings.js))

Ten toggles in the in-game Settings panel that change core mechanics. Read the
current value with `getRule(id)` (falls back to each rule's `default`). Defaults:

| id | default | Effect |
|----|:-------:|--------|
| `instantSpecialReveal` | off | Specials reveal on click vs. at end of turn. |
| `hiddenNewCards` | off | Replacement cards arrive face-down (no brief reveal). |
| `chainPulse` | **on** | Chain cards pulse; intensity grows with chain length. |
| `chainTimer` | off | Countdown (default 10s) starting at chain length 3; expiry breaks the chain. |
| `revealOnUnlock` | off | Briefly reveal a card's color when unlocked. |
| `sweepReveal` | **on** | Perfect sweep flashes the whole new board. |
| `coloredBombs` | off | Bombs inherit combo color & open parallel chains; all-colors → +500 auto-reveal. |
| `longPressPeek` | **on** | Long-press any card to peek (consumes a Peek). |
| `bankButton` | **on** | Show the "Bank it" button to bank a 3+ chain. |
| `unlimitedPowerUps` | off | Power-up counts never decrease. |

The Settings panel also exposes: chain-timer duration, win-streak start level &
effect, deploy/recall/sweep start levels, the **combo→special mapping**, **level
rewards**, per-booster enable+quantity, special-card inventory, reset-tutorials,
and unlock-all-levels. It's essentially a live design/tuning console.

---

## 12. Conventions & gotchas (read before editing)

- **Global namespace.** All functions/vars are global; scripts load via ordered
  `<script>` tags. `config.js` → level data → progression data → `settings.js` →
  engine files (`state.js` … `boot.js`). Because these are **classic** scripts,
  top-level `function`/`let`/`const` share one global lexical scope across files, so
  any engine file can call any other and read the shared state in `state.js`.
  **Load-order rules when adding/reordering engine files:**
  1. **No name may be declared twice** across all files (a duplicate top-level
     `function`/`let`/`const` throws at load). Each name lives in exactly one file.
  2. Ordering only matters for code that runs *at load time* (not functions, which
     run later). So **`state.js` must stay first** (declares shared state + DOM refs;
     its `currentLevelIndex = progress.highestUnlocked` needs `progress` from the
     earlier `settings.js`) and **`boot.js` must stay last**. The one other load-time
     call, `initInventoryDefaults()` in `specials.js`, only needs `SPECIAL_TYPES`
     (same file). Files in between are call-time-only and order-independent.
- **Line-number citations below** (e.g. `gameplay.js:2414`) predate the split and are
  approximate — use the file map in §3 and the function index in §13 to find the file
  that now owns a given concern.
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
- **`nextLevel()` has a legacy "all 10 levels" string** (in [level.js](level.js))
  even though journeys have 16/40/253 levels — cosmetic end-of-journey message.
- **No build/test/lint.** Verify changes by opening `index.html` and playing.
  Use the Settings panel + "🧪 Test Level" / "🔓 Unlock All" to reach states fast.
- **Colors are fixed** to the six in `ALL_COLORS` (red, green, blue, yellow,
  orange, purple); `colorCount` per level slices how many are active
  (`ACTIVE_COLORS`) — so orange/purple only appear at `colorCount` 5/6. Each
  color's CSS hex lives once in `COLOR_HEX` (config.js); `cssColor(c)` reads it.

---

## 13. Quick function index

| Concern | File | Entry points |
|---------|------|--------------|
| Boot / journeys | `boot.js` / `progression.js` | `boot()`, `applyProgression`, `loadProgression`, `playFromHome` |
| Start a level | `level.js` | `showPreLevel` → `confirmPreLevel` → `startGame`; `initLevelConfig` |
| Core loop | `turn.js` | `onCardClick`, `endTurn`, `placeNewCards` |
| Turn finish | `endgame.js` | `finishTurn`, `recallCards` |
| Scoring/combos | `turn.js` / `specials.js` | `endTurn` (scoring block), `getSpecialForCombo`, `getComboMapping`, `getMinCombo` |
| Specials | `specials.js` / `board.js` | `SPECIAL_TYPES`, `getRevealPattern`, `createSpecialCard` |
| Back-of-card effects | `specials.js` / `board.js` / `turn.js` | `BACK_EFFECTS`, `getBackEffectPattern`, `decorateBackEffect`, `endTurn` (reveal-on-collect block) |
| Boosters | `boosters.js` | `BOOSTERS`, `activateBooster`, `executeBoosterTap` |
| Bomb drag-to-place | `bomb-aim.js` | `startBombBoosterDrag`, `startBankBombDrag`, `renderBombSilhouette`, `commitBombAim`, `isBombAiming` |
| Bank It | `bank.js` | `bankChain`, `updateBankButton`, `detonateBombAt` |
| Goals | `goals.js` | `initLevelGoals`, `updateGoalProgress`, `checkAllGoalsMet` |
| Win/fail | `endgame.js` | `levelWon`, `levelFailed`, `continueLevelWithCoins` |
| Board render / UI | `board.js` | `renderBoard`, `buildCardHTML`, `updateChainIndicator`, `breakLockLayer` |
| VFX / animation | `vfx.js` | `flyCardsToGoal`, `spawnParticles`, `animateScore`, `sweepRevealBoard` |
| Tutorials | `tutorials.js` | `advanceTutorial`, `showNextItemTutorial`, `buildLevelGrid` |
| Shared state / DOM refs | `state.js` | `board`, `score`, `turns`, `chainCards`, `inputLocked`, `boardEl`, … |
| Config/rules | `settings.js` | `GAMEPLAY_RULES` + `getRule`, `showSettings` |
| Persistence | `settings.js` | `loadProgress`/`saveProgress` |
