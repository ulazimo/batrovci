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

**There are four camera modes and each sets its own depth span**, because they want genuinely
different things and one compromise value serves none of them — see the header in `camera.js`.

| mode | span | what it is for |
|---|---|---|
| `shot` | `projDepthSpan` 16 m | resting and aiming, overhead |
| `follow` | `projFollowDepth` **16 m** | tracking the rock — same span, so no shift at release |
| `house` | `projHouseDepth` 11 m | Focus House; the only one that must show full sheet width |

**One perspective throughout play, and this is hard-won — do not "improve" it.** `shot` and
`follow` share a depth span, so the camera only ever *translates*: nothing tilts or zooms as a
shot goes out. Two earlier attempts gave aiming and travelling their own spans (one even derived
the span from the power, so the tilt shifted as the slider moved). Both read as the sheet warping
underfoot, and the switch at release was a visible jolt. **Any span difference between modes is a
jump, however smoothly it is tweened.** The camera also does not move while aiming.

**Seeing where the shot will land is solved by `drawOffscreenLanding`, not by the camera.** At
rest the view spans 16 m and the house is 35 m away — you cannot see a house that far off *and*
have an overhead camera on a phone. So the Shot Area is projected onto the top edge of the view,
labelled with what the shot would actually score (BUTTON, GUARD, HOGGED). That costs nothing in
camera stability, which is why it is the right answer and moving the camera was not.

Two details worth keeping:

- The **power slider is anchored to `shot.dragStart`, not to the rock.** Equivalent while the
  camera is still, and it survives any future camera motion without the track chasing the rock
  off-screen.
- **The follow band is deliberately low** (`camBandTop` 0.60). The rock is held 60% down the
  screen, so 60% of the view is the ice *ahead* of it. A high band pins the rock near the top and
  the shot develops off-screen.


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

As the rock slows the circle both tightens (`shotAreaShrinkPow`) and fades out
(`shotAreaFadePow`), reaching zero radius and zero opacity as the rock stops — so nothing is
left on screen to contradict where the rock actually ended up. It is drawn plain white,
translucent with a slightly more opaque outline, exactly as the doc specifies.

**`camera.y` is the sheet Y sitting on `camAnchorRow`.** `cameraYForRowAt(sheetY, row)`
inverts it, which is why the follow logic is a couple of lines. The follow band alone never
centres the house, so there is an approach blend (`camApproach`) that eases onto the
house-centred view — that is what satisfies the doc's "House to finish in the middle of the
screen and Camera not to move further than that".

**Rock size: check the numbers before "fixing" it.** A rock is 8.3% of the sheet width, by the
rules — that ratio is fixed and any complaint that rocks look small is really a complaint about
the camera. At `projSheetFill` 1.15 a rock is 39 px on a 414 px screen; at 0.98 it is 34 px. The
default `rockRadiusScale` 1.35 already makes rocks **35% larger than regulation**, which drops
the house from 12.6 rocks across to 9.3. Push it further and you are changing strategy, not art —
in real curling 16 rocks genuinely do not fit in the house, and that is the whole game. Reach for
`projSheetFill` first: it moves the camera instead.

**The delivery slide's duration is derived, not authored.** `deliveryDuration()` solves
`t = 2d/v` so the slide accelerates from rest and *arrives* at exactly the launch speed. With a
fixed slide time the delivery and the launch were two unrelated speeds and the rock visibly
lurched at release. If you change the launch speeds, the slide follows automatically —
`deliveryPushScale` only exists to deliberately break that match.

**The rock is released at `SHEET.RELEASE_Y`** (the near tee line), not the hog line. Comfortably
inside the hog line the rules require release before, and close enough to the hack that the
delivery reads as one push. Travel distance to the button is therefore 34.7 m, which is what the
traction and launch-speed defaults are calibrated against.

## Conventions

- Register in the root `../index.html` `projects` array; `id` must match the tracking id
  (`curling-clash`).
- Preview with `.claude/launch.json` (port 8098) — `devserver.py` sends no-cache headers so
  edits show on reload.
- Touch handlers use `{ passive: false }` and `e.preventDefault()`; body is `touch-action: none`.
- Keep the Firebase tracking and analytics module blocks at the bottom of `index.html`.
- The device-frame switcher is desktop-only; a real phone (≤520 px) drops the bezel.
