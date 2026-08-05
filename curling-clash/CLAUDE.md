# Curling Clash — project instructions

A mobile curling game, played vertically. Built from `Game Concept - Curling Clash.pdf`;
the phased build is in [DEVELOPMENT-PLAN.md](DEVELOPMENT-PLAN.md), which also records the
scope decisions and the three places where the concept doc needed reconciling.

Art and rules references live in `~/Documents/Curling Clash Exploration/`.

---

## Architecture

Plain ES5-compatible scripts loaded in order by `index.html` — no build step, no bundler,
no package manager, matching the rest of this prototype lab. Globals are shared across
files; **load order in `index.html` is the dependency graph.**

```
config.js       official WCF geometry in metres, palette          ← nothing invents a dimension
rock-stats.js   Power/Accuracy/Curl/Trajectory ladders, Basic Rock
tuning.js       TUNABLES registry: every number worth feeling out
tuning-panel.js dev slider overlay (⚙ button, or ` key)

projection.js   sheet space ↔ screen space
sheet.js        ice, lines, house, and the in/out-of-play rule tests
rock.js         rock model and rendering
physics.js      fixed-step integrator: friction, curl, collisions, removals
predict.js      collision-free forward sim → trajectory + shot area

camera.js       follow band, house clamp, Focus House transitions
shot.js         power slider, curl handle, release, delivery slide
brushing.js     thumbstick input and its effect on the ice
brushes.js      brush visuals

state.js        match / end / turn state
scoring.js      who is scoring, end scoring, measurement drama
match.js        end lifecycle, hammer rules, coin toss, sudden death

vfx.js          sparks, ice spray, floating labels
hud.js          gameplay header
home.js         home screen
boot.js         canvas, the frame loop, screen switching
```

## Non-obvious things worth knowing

**Run `bash debug/check.sh` before any browser check.** A `SyntaxError` in a classic
script silently kills every declaration in that file, so the failure surfaces somewhere
unrelated — a duplicate `const` in `camera.js` once presented as `SHOOT_Y is not defined`
thrown from `match.js`. The browser console does not reliably show the parse error itself.

**`debug/physics-bench.html` is how the physics gets tuned, not by eye.** It runs power
sweeps, solves the perfect-power slider position by binary search, checks the curl ladder
against its stated deflections, and asserts each WCF removal rule. It reads the same
`localStorage` tuning the game does, so: adjust sliders in the game → reload the bench →
read the tables. **After changing traction or the launch speeds, re-run it and paste the
`perfectPowerCenter` it reports back into `tuning.js`** — otherwise the green zone on the
power slider stops landing on the button.

**The projection is deliberately not a textbook perspective camera.** Depth and width have
separate controls (`projDepthCompress`, `projWidthLens`). At true perspective the house is
3.66 m across and 38 m away, which is about 7 vertical pixels on a phone — correct and
unplayable. Depth stays close to even so distances are fair to judge; the perspective read
comes from the width taper, which costs no readability. See the header in `projection.js`.

**Physics runs on a fixed 120 Hz step** (`stepSimulation` in `boot.js`) so a shot is
reproducible regardless of frame rate. Anything that affects outcomes belongs there, not in
`renderFrame` — the delivery slide was originally in the render path with a hard-coded
`1/60`, which stretched it out whenever the tab was throttled.

**`advanceRockState` in `physics.js` is shared** by the live simulation and the trajectory
preview. That is on purpose: the line the player sees cannot drift from the physics they
get. Do not fork it.

**Shot Area honesty.** The doc wants the landing point fixed at release with random
variance, *and* the circle to become "more deterministic as the Rock is slowing down". So
`resolveShotVariance` folds the error into the launch itself (a nudge to power and angle),
and the circle is drawn around a genuine forward simulation. The game never steers the rock
to match a circle — if you change this, keep that property.

**`camera.y` is the sheet Y sitting on `camAnchorRow`.** `cameraYForRowAt(sheetY, row)`
inverts it, which is why the follow logic is a couple of lines. The follow band alone never
centres the house, so there is an approach blend (`camApproach`) that eases onto the
house-centred view — that is what satisfies the doc's "House to finish in the middle of the
screen and Camera not to move further than that".

**`rockRadiusScale` is a design lever, not art.** At a true 1.00 a rock is ~16 px wide.
The default 1.35 buys legibility; pushing it higher crowds the house and genuinely changes
strategy, because in real curling 16 rocks do not fit.

## Conventions

- Register in the root `../index.html` `projects` array; `id` must match the tracking id
  (`curling-clash`).
- Preview with `.claude/launch.json` (port 8098) — `devserver.py` sends no-cache headers so
  edits show on reload.
- Touch handlers use `{ passive: false }` and `e.preventDefault()`; body is `touch-action: none`.
- Keep the Firebase tracking and analytics module blocks at the bottom of `index.html`.
- The device-frame switcher is desktop-only; a real phone (≤520 px) drops the bezel.
