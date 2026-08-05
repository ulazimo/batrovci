# Curling Clash

A mobile curling game, played vertically. Real WCF sheet dimensions, real scoring,
real hammer rules — pull back for power, rotate the handle to curl, then sweep the ice
ahead of the rock to carry it further or bend its line.

This is the **Initial Version** from `Game Concept - Curling Clash.pdf`. See
[DEVELOPMENT-PLAN.md](DEVELOPMENT-PLAN.md) for scope, the decisions taken, and the
milestone roadmap; [CLAUDE.md](CLAUDE.md) for how the code fits together.

## Run it

```bash
python3 .claude/devserver.py 8098
```

Then open <http://localhost:8098>. The dev server sends no-cache headers so edits show
on reload. On desktop the game renders inside a phone bezel with a device switcher; on a
real phone (≤520 px) the bezel drops away and it fills the screen.

## Play

| | |
|---|---|
| **Aim and throw** | Touch the rock and drag *down* — pull back to throw harder. Drag sideways to aim off the centre line. |
| **Curl** | Drag the handle that orbits to the right of the rock. Clockwise curves the path left, counter-clockwise curves it right, same as the real sport. |
| **Perfect power** | The green band on the slider lands the rock on the button. Above it the slider goes orange, then red, and starts to shake. |
| **Where it lands** | The house is too far off to see while you aim, so the marker at the top edge is your Shot Area — its position and width are the real line and spread, labelled with what the shot would score (BUTTON, GUARD, HOGGED). Once the rock is away the circle appears on the ice, tightening and fading out as the rock slows. |
| **Sweep** | Once the rock is away, the thumbstick appears. Hold it to sweep. Push up for harder sweeping (the rock runs further), down for lighter, sideways to bend the line a few degrees. |
| **Steal a sweep** | After the opponent's rock crosses the tee line and while it is still moving, you get a brief window to sweep it — try to carry it out the back of the house. |
| **Look at the house** | The button beside the rock. Red *Back* returns you to the shooting position; you cannot throw from the house view. |

Local hot-seat: you play Yellow, then Red. 3, 5 or 7 ends, and a tie goes to sudden death.

## Dev tools

| | |
|---|---|
| **Tuning panel** | ⚙ in-game, or the `` ` `` key. Every physics and camera number as a live slider, grouped by system, with JSON export so a tuned set can be pasted back into `tuning.js` as new defaults. |
| **Top-down view** | ▦ in-game. Renders the raw sheet with a metre grid and every landmark labelled — the ground truth for checking geometry against the WCF figures. |
| **Physics bench** | [debug/physics-bench.html](debug/physics-bench.html). Power sweeps, solves the perfect-power slider position by binary search, checks the curl ladder against its stated deflections, and asserts each removal rule. Reads the same tuning the game does. |
| **Syntax check** | `bash debug/check.sh` — run before any browser check. A parse error in a classic script kills every declaration in the file and surfaces as a confusing error elsewhere. |

## Art

`art/` holds Layer AI output prepared by `art/prepare.py`, which keys the flat render
background, un-blends the anti-aliased edges so they are not left washed out, and trims to
content. Raw generations are kept in `art/raw/` for re-cropping.

Every sprite is optional. `sprites.js` probes each file and the drawing code falls back to
its procedural version, so the game stays playable while art is being iterated on.

## Tech

Vanilla JS, no build step, no package manager — plain `<script>` tags in dependency order,
matching the rest of this prototype lab. Canvas 2D with a custom projection (see the header
in `projection.js` for why it is deliberately not a textbook perspective camera). Physics on
a fixed 120 Hz step so shots are reproducible regardless of frame rate.

Ready for CapacitorJS when the Sounds and Haptics milestone lands: no build step to wire up,
`viewport-fit=cover` and safe-area insets already in place, and all input goes through
pointer events.
