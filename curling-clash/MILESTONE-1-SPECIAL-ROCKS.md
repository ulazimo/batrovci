# Milestone 1 — Special Rocks

From the concept doc's Future Milestones, point 1:

> Special Rocks — I want you to implement all of the Special Rocks, Inventory Tab and Shop Tab
> in the Navigation Bar and Rock functionality in Inventory and Shop. I want to have Deck
> controls in the Gameplay Screen and in the Inventory. I want to be able to choose which Deck
> I am going in the Match with.

Builds on the shipped Initial Version — see [DEVELOPMENT-PLAN.md](DEVELOPMENT-PLAN.md) and
[CLAUDE.md](CLAUDE.md).

---

## 1. Scope

### 1.1 In scope

| Doc chapter | What gets built |
|---|---|
| Special Effects | All 11 effects, each level as its own rock (19 special rocks total) |
| Deck of Rocks | 8 rocks per end, brought from the Inventory |
| Choosing the Rock | Auto-select the next rock; Deck button bottom-right to pick another mid-end |
| Rock Statistics | The four base stats already exist; special rocks now vary them |
| Special Rocks and Rock Decks | Collection, 3 decks, uniqueness, durability, Polishing |
| Rock Types | Offense/Defense/Control/Basic colours + the distribution bar over the deck |
| Meta & UI | Inventory tab and Shop tab unlocked in the nav bar |
| — | Coins earned from match victory, spent on rocks and Polishing |

### 1.2 Out of scope

Everything the doc puts in later milestones: Brushes / Shoes / Team Leveling inventory tabs
(explicitly "TBD"), hard currency and IAP, multiples of the same special rock, Stages,
Player Profile, Bot and Multiplayer.

### 1.3 The rock catalogue

"Each Special Rock effect Level should be its own Special Rock", so levels expand into
separate collection entries. Levels exist **only where the doc states them** — Wall ("3 levels
of extension"), Speed Up Zone ("3 levels to it"), Magnet and Pulse ("based on its Level"). The
rest are single-level.

| Rock | Levels | Type | Effect |
|---|---|---|---|
| Wall | 3 | Defense | On stop, extends a wall left and right. Walls have health and break on impact, scaled by collision speed. |
| Ricochet | 1 | Offense | On collision, gains speed and throws a powerful spark burst. |
| Curve | 1 | Offense | Curls far more, and side-brushing bites harder — for getting around guards. |
| Power | 1 | Offense | Carries more momentum; breaks walls and shifts heavy rocks more easily. |
| Heavy | 1 | Defense | Much harder to move, but cannot be thrown as far. |
| Speed Up Zone | 3 | Control | On stop, leaves a low-traction zone. Green, speed-up arrows. Lasts a number of turns. |
| Slow Down Zone | 1 | Control | On stop, leaves a high-traction zone that stops rocks faster. Ice debris. Stays put even if the rock is later moved. |
| Magnet | 3 | Control | On stop, pulls rocks within a radius toward it. |
| Pulse | 3 | Offense | On stop, shoves rocks within a radius away from it. |
| Freeze | 1 | Defense | On stop, freezes rocks in an area — they ignore their first collision. |
| Fire | 1 | Control | Leaves a melted-water trail. Brushing does not work on water and stops if it is running. Water refreezes after some turns. |

**19 special rocks + Basic Rock = 20 collection entries.** Distribution: 6 Offense, 5 Defense,
8 Control, 1 Basic.

**Flagged:** Slow Down Zone gets one level because the doc does not give it any, while its
mirror (Speed Up Zone) explicitly gets three. That reads slightly lopsided for a collection, but
the levels are pure data — say the word and it becomes three entries.

---

## 2. Architecture

Six new modules, following the existing flat, load-order-is-the-dependency-graph convention.

```
rock-effects.js     the catalogue: every rock, its type, level, stats and effect parameters
effects.js          LIVE board state — zones, walls, water, freeze marks — and its physics hooks
inventory.js        collection, 3 decks, durability, coins, localStorage persistence
inventory-screen.js the Inventory screen: deck area, collection, type bar, Polish
shop-screen.js      the Shop: buy special rocks with coins
deck-hud.js         the in-game Deck button and rock picker
```

### 2.1 The board-effects layer

This is the substantial new system. Most effects are not properties of a rock — they are
things a rock *leaves behind*, which then act on every later shot. So they live separately
from `rocks[]`, in `effects.js`, with their own turn-based lifetimes:

```js
boardEffects = [
  { kind: 'speedZone',  x, y, radius, strength, turnsLeft },
  { kind: 'slowZone',   x, y, radius, strength, turnsLeft },
  { kind: 'wall',       x, y, halfWidth, health, maxHealth },
  { kind: 'water',      x, y, radius, turnsLeft },
  { kind: 'magnet',     x, y, radius, pull, ownerId },
]
```

Physics queries it through three narrow functions, so `advanceRockState` stays readable:

- `zoneTractionAt(x, y)` — multiplier folded in beside the brushing multiplier
- `zoneForceOn(rock)` — magnet pull
- `wallCollide(rock)` — static collision + health loss

Freeze is a flag on the rock, not a board effect. Pulse fires once on stop and leaves nothing.

### 2.2 Effect triggers

Each catalogue entry declares when it acts, which keeps the dispatch in one place:

| Trigger | Effects | Hook |
|---|---|---|
| `passive` | Curve, Power, Heavy | read during `advanceRockState` and collisions |
| `onCollide` | Ricochet, Power | inside `collidePair` |
| `onStop` | Wall, SpeedZone, SlowZone, Magnet, Pulse, Freeze | the settle callback |
| `whileMoving` | Fire | per-step trail deposit |

### 2.3 Meta model

```js
inventory = {
  owned:  { 'wall-2': { durability: 7 }, ... },   // special rocks are unique
  decks:  [ [8 rock ids], [8], [8] ],
  activeDeck: 0,
  coins: 250,
}
```
Persisted to `localStorage` under one key. Basic Rocks are infinite and never stored as owned.

---

## 3. Phases

| # | Phase | Gate |
|---|---|---|
| M1.0 | Catalogue and meta model — `rock-effects.js`, `inventory.js`, persistence, tunables | Catalogue loads; a deck can be built and saved |
| M1.1 | Board-effects engine — `effects.js`, physics hooks, rendering, turn lifetimes | Zones and walls measurably change a shot on the bench |
| M1.2 | Wire all 11 effects | Each effect verified on the bench with before/after numbers |
| M1.3 | Gameplay deck controls — Deck button, picker, auto-advance, durability | An end can be played choosing rocks per shot |
| M1.4 | Inventory screen — deck area, 3 decks, collection, type bar, Polish | Decks can be edited and persist across reload |
| M1.5 | Shop screen — buy with coins | A rock can be bought and used |
| M1.6 | Wiring — unlock nav, deck choice before a match, coins on victory | Full loop: earn, buy, deck, play |
| M1.7 | Art — type-coloured rock bodies and a 12-cell effect icon sheet | Rocks readable by type and effect at a glance |
| M1.8 | Balance and regression — bench extension, full match | All effects fire; no regressions in the Initial Version rules |

---

## 4. Risks

| Risk | Mitigation |
|---|---|
| Board effects turn the physics into spaghetti | Three narrow query functions; effects never mutate rocks directly except through the existing impulse path |
| Effects that persist across turns break the end/match reset | Lifetimes are turn-counted and cleared in `beginEnd`; covered by the regression |
| 19 rocks is a lot of balance surface | Every parameter is a tunable in the existing registry, and the bench gets a per-effect table |
| Special rocks trivialise the game | Durability limits use; uniqueness caps stacking; the bench reports how far each effect shifts a shot |
| Art cost for 11 effects | One Layer AI icon-sheet run, priced and approved before spending, with a procedural glyph fallback |

---

## 5. What M1.7 actually shipped

The icon sheet went as planned: one Layer run (GPT Image 2, 18 CU), twelve icons in the order
`EFFECT_ICON_INDEX` declares, re-laid onto an exact 4×3 grid by `prepare.py iconsheet`. The
text glyphs in `effectGlyph()` stayed as the fallback and are still what renders if the file
is missing.

The rock bodies did not. Two runs (13.5 CU) produced a good four-stone design — team-neutral
granite, a thin glowing accent line along the top of the running band — but at 130 px per stone
against the 550 px basic body, and with a silhouette that did not match it. Rather than ship rocks
that change shape when they change type, the design was taken from the generation and executed
against the existing body by `prepare.py accent`. The generation paid for the design; the
compositing paid for the fidelity.

---

**Plan version:** 1.1 — 2026-08-06
