# Batrovci — AGENTS.md

**Mladen's Prototype Lab** is a personal portfolio of playable HTML5 game prototypes and interactive mechanics demonstrations. Each prototype is a completely self-contained single-file HTML application with embedded JavaScript, CSS, and Firebase analytics integration. The project serves as a testing ground for game mechanics, UI/UX patterns, and gameplay loops — targeting portfolio visitors, game designers, and potential clients or employers.

**Architecture in one sentence:** Zero build process, zero package manager, zero bundler — pure static HTML files with CDN-loaded libraries and Firebase Firestore for analytics.

---

## Technology Stack

### Core Languages & Runtimes
- **HTML5** — every game is a single `.html` document; no templating, no partials
- **Vanilla JavaScript (ES6+)** — arrow functions, destructuring, template literals, `async/await`, ES modules (`type="module"`)
- **CSS3** — inline `<style>` blocks; Tailwind utility classes combined with hand-written custom animations

### CDN-Loaded Libraries (no local installation)
| Library | Version | CDN URL | Used In |
|---|---|---|---|
| Tailwind CSS | latest | `https://cdn.tailwindcss.com` | `index.html`, `ideas.html`, `block away.html`, `closet sort.html`, `monopoly mini games.html`, `hunting.html`, `football legendary league.html` |
| React + ReactDOM | 18 (production UMD) | `https://unpkg.com/react@18/umd/react.production.min.js` | `closet sort.html`, `monopoly mini games.html` |
| Babel Standalone | latest | `https://unpkg.com/@babel/standalone/babel.min.js` | `closet sort.html`, `monopoly mini games.html` (JSX in-browser compilation) |
| Three.js | r128 | `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` | `mind match 3d.html` |
| Cannon.js | 0.6.2 | `https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js` | `mind match 3d.html` |
| Lucide Icons | latest | `https://unpkg.com/lucide@latest` | `index.html`, `ideas.html`, `monopoly mini games.html` |
| Google Fonts: Orbitron + Rajdhani | — | `https://fonts.googleapis.com/css2?family=Orbitron…&family=Rajdhani…` | `index.html`, `ideas.html` |
| Google Fonts: Inter | — | `https://fonts.googleapis.com/css2?family=Inter…` | `block away.html` |
| Google Fonts: Rajdhani | — | `https://fonts.googleapis.com/css2?family=Rajdhani…` | `football legendary league.html` |
| Google Fonts: Fredoka One | — | `https://fonts.googleapis.com/css2?family=Fredoka+One` | `pixel.html` |
| Firebase SDK | 10.7.1 | `https://www.gstatic.com/firebasejs/10.7.1/` | All game files + `index.html` + `ideas.html` |

### Backend / Data
- **Firebase Firestore** (project: `prototypes-7691b`) — stores `game_stats` and `ideas` collections
- **Firebase Anonymous Auth** — signs in with `inMemoryPersistence` (no cookies, works in iframes/previews)
- Firebase SDK loaded as **ES modules** via `<script type="module">` — this is critical; it cannot be loaded as a regular script

### Deployment
Static hosting only. No server-side logic. Compatible with GitHub Pages, Netlify, Vercel, Firebase Hosting, or any web server.

---

## Project Structure

```
batrovci/
│
├── index.html                     # Main portfolio landing page — dark "cyber" theme, game grid,
│                                  # Firebase real-time stats, category filtering, search
├── ideas.html                     # Idea submission page — Firebase form + live idea list display
├── favicon.svg                    # SVG favicon (gamepad icon)
├── work_in_progress_video.mp4     # Background video used in index.html hero section
│
├── README.md                      # Project documentation (deployment, setup, Firebase rules)
├── FIXES_APPLIED.md               # Log of issues found and fixed (historical record)
├── SAGE.md                        # Older AI assistant configuration file (superseded by this file)
├── .gitignore                     # Ignores .DS_Store, editor files, .env, .firebase/
│
├── block away.html                # Puzzle — Arrow-based block clearing (Vanilla JS, class-based)
│                                  # GAME_ID: 'block-away' | Featured: true
├── closet sort.html               # Puzzle — Match-3 luxury item organizer (React 18 + hooks)
│                                  # GAME_ID: 'closet-sort' | Featured: false
├── dice-roller.html               # Tool — Physics-animated dice with roll statistics
│                                  # GAME_ID: 'dice-roller' | Featured: false
├── hunting.html                   # Action — Hunting sniper simulator (Canvas 2D, dual canvas)
│                                  # GAME_ID: 'hunting-sniper' | Featured: false
├── mind match 3d.html             # Puzzle — 3D emoji card matching (Three.js + Cannon.js)
│                                  # GAME_ID: 'mind-match-3d' | Featured: true
├── monopoly mini games.html       # Board — 10+ Monopoly-style mini-games (~80KB, React 18)
│                                  # GAME_ID: 'monopoly-mini' | Featured: false
├── pixel.html                     # Arcade — Pixel destruction with pig ammo (Canvas 2D)
│                                  # GAME_ID: 'pixel-orbit' | Featured: false
├── desert golf tribute.html       # Sports — Minimalist golf with procedural terrain (Canvas 2D)
│                                  # GAME_ID: 'desert-golf-tribute' | Featured: false
└── football legendary league.html # Sports — Match-3 puzzle + league simulation (Vanilla JS)
                                   # GAME_ID: 'football-legendary-league' | Featured: true
```

### File Naming Convention
- **Game files**: lowercase with spaces — `game name.html` (e.g., `block away.html`, `desert golf tribute.html`)
- **Utility pages**: simple lowercase — `index.html`, `ideas.html`
- **No subdirectories** — everything is at the root level

---

## Development Workflow

### Running Locally

```bash
# No build step required. Open any file directly in browser, OR:

# Option 1: Python local server (recommended — Firebase works correctly)
python3 -m http.server 8000
# Navigate to http://localhost:8000

# Option 2: Node.js
npx http-server

# Option 3: VS Code Live Server
# Right-click index.html → "Open with Live Server"
```

**Important:** Firebase Anonymous Auth may be blocked when opening files with `file://` protocol. Always use a local server for Firebase features.

### There Is No Build Process
- ❌ No npm / yarn / pnpm
- ❌ No webpack / Vite / Parcel / Rollup
- ❌ No TypeScript compilation
- ❌ No CSS preprocessing
- ❌ No minification step
- ✅ CDN libraries are pre-minified; game files are served as-is

### Adding a New Game (Complete Checklist)

**Step 1 — Create the game file:**
```html
<!-- game-name.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Game Title</title>
    <!-- Add CDN libraries as needed -->
    <style>
        body { touch-action: none; user-select: none; -webkit-user-select: none; }
    </style>
</head>
<body>
    <!-- Game UI here -->
    <script>
        // Game logic here
    </script>

    <!-- FIREBASE TRACKING — copy from any existing game, change only GAME_ID -->
    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
        import { getFirestore, doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
        import { getAuth, signInAnonymously, setPersistence, inMemoryPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

        const firebaseConfig = { /* copy from existing game */ };
        const GAME_ID = 'your-game-id'; // ← ONLY CHANGE THIS

        let db, auth, currentUser = null;
        const startTime = Date.now();

        async function initFirebase() {
            try {
                if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
                    const app = initializeApp(firebaseConfig);
                    db = getFirestore(app);
                    auth = getAuth(app);
                    try {
                        await setPersistence(auth, inMemoryPersistence);
                    } catch (e) {
                        console.warn("Persistence set warning", e);
                    }
                    const userCredential = await signInAnonymously(auth);
                    currentUser = userCredential.user;
                    const statsRef = doc(db, "game_stats", GAME_ID);
                    updateDoc(statsRef, { plays: increment(1) }).catch(e => console.log("Stats error:", e));
                    setInterval(saveTime, 30000); // Periodically save time
                }
            } catch (e) { console.error("Tracking Error - check console", e); }
        }

        function saveTime() {
            if (db && currentUser) {
                const timeSpentSeconds = Math.floor((Date.now() - startTime) / 1000);
                if (timeSpentSeconds > 0) {
                    const statsRef = doc(db, "game_stats", GAME_ID);
                    updateDoc(statsRef, { timePlayed: increment(timeSpentSeconds) }).catch(e => console.log("Stats error:", e));
                }
            }
        }

        window.addEventListener('beforeunload', saveTime);
        initFirebase();
    </script>
</body>
</html>
```

**Step 2 — Register in `index.html`'s `projects` array:**
```javascript
{
    id: "your-game-id",       // MUST exactly match GAME_ID in the game file
    title: "Your Game Title",
    file: "game-name.html",   // filename with spaces, lowercase
    description: "Brief description of mechanics.",
    category: "Puzzle",       // Valid: Puzzle, Arcade, Board, Tool, Action, Sports
    date: "2026-01-30",       // ISO date string
    featured: false,          // true = amber border/glow accent on card
    version: "1.0"
}
```

**Step 3 — Verify the `id` in `projects` array matches `GAME_ID` constant in the game file exactly.**

---

## Code Conventions

### JavaScript Style

**Functional approach for game logic:**
```javascript
// Arrow functions preferred
const handleClick = (e) => { ... };

// Array methods over loops
const active = blocks.filter(b => b.active);
const positions = items.map(item => item.position);

// Destructuring
const { useState, useEffect, useCallback } = React;

// Template literals
const msg = `Score: ${score} / Level: ${level}`;
```

**Class-based for complex game engines** (see `block away.html`):
```javascript
class Game {
    constructor() {
        this.blocks = [];
        this.lives = MAX_LIVES;
        // ...
    }
    loop() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        requestAnimationFrame(() => this.loop());
    }
}
```

**Global constants in SCREAMING_SNAKE_CASE:**
```javascript
const GAME_ID = 'block-away';
const MAX_LIVES = 3;
const GRAVITY = 0.5;
const TERRAIN_RESOLUTION = 10;
```

### React Usage (closet sort.html, monopoly mini games.html)
- Functional components with hooks only — no class components
- `const { useState, useEffect, useCallback, useRef } = React;` destructured at top of `<script type="text/babel">`
- `ReactDOM.createRoot(document.getElementById('root')).render(<App />)` for React 18
- JSX scripts **must** use `type="text/babel"` — not `type="text/javascript"`
- Lucide icons in React context use a custom `LucideIcon` component that maps `lucide.icons[name]` to React elements

### CSS & Styling

**Cyber theme** (used in `index.html` and `ideas.html`):
```javascript
// Tailwind config — must be declared before Tailwind loads
tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Rajdhani', 'sans-serif'],
                display: ['Orbitron', 'sans-serif'],
            },
            colors: {
                cyber: {
                    bg: '#0B0E14',        // Dark background
                    card: '#151923',      // Card background
                    border: '#2A303C',    // Border color
                    primary: '#00F0FF',   // Neon Cyan
                    secondary: '#7000FF', // Neon Purple
                    text: '#E0E6ED',      // Body text
                    muted: '#94A3B8'      // Muted text
                }
            }
        }
    }
}
```

**Featured cards** use amber accent (`border-amber-500/50`, `box-shadow: rgba(245,158,11,0.15)`) vs standard cyan (`border-cyber-primary`) for non-featured cards.

**Custom CSS animations** defined in `<style>` blocks:
- `@keyframes shake` — used in `block away.html` for wrong moves
- `@keyframes roll` — used in `dice-roller.html` for dice animation
- `@keyframes scanline` — used in `index.html` for the CRT scanline effect
- `@keyframes popUp` — used in `monopoly mini games.html`

### Mobile-First Patterns (required in every game)
```css
/* Always include in body or root element */
body {
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
}
```

```javascript
// Unified pointer events (works for both mouse and touch)
canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
window.addEventListener('pointermove', onPointerMove, { passive: false });
window.addEventListener('pointerup', onPointerUp, { passive: false });
window.addEventListener('pointercancel', onPointerUp, { passive: false });

// OR touchstart with passive: false to allow preventDefault
canvas.addEventListener('touchstart', handler, { passive: false });
window.addEventListener('touchmove', handler, { passive: false });
```

### Canvas Game Loop Pattern
```javascript
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function gameLoop(timestamp) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // update state
    // draw everything
    requestAnimationFrame(gameLoop);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();
requestAnimationFrame(gameLoop);
```

### Error Handling
- Firebase errors: caught in outer `try/catch`, logged with `console.error("Tracking Error - check console", e)`
- Stats update failures: `.catch(e => console.log("Stats error:", e))` — non-fatal, game continues
- Persistence warnings: `console.warn("Persistence set warning", e)` — expected in some environments
- Guard clauses before Firebase calls: `if (db && currentUser) { ... }`
- `ideas.html` uses `console.error` + `alert()` for form submission failures (no anonymous auth on this page)

### File Structure Within Each Game File
1. `<!DOCTYPE html>` + `<head>` (meta tags, CDN `<script>` and `<link>` tags, inline `<style>`)
2. `<body>` — game UI, screens, overlays, controls (HTML structure)
3. `<script>` (or `<script type="text/babel">` for React) — all game logic
4. `<!-- FIREBASE TRACKING -->` `<script type="module">` — analytics at bottom of `</body>`

---

## Firebase Integration Details

### Firebase Project
- **Project ID**: `prototypes-7691b`
- **Firebase SDK version**: `10.7.1` (loaded from `https://www.gstatic.com/firebasejs/10.7.1/`)
- **Auth mode**: Anonymous, `inMemoryPersistence` (no cookies stored, works in iframes)

### Firestore Collections

**`game_stats`** — one document per game, keyed by `GAME_ID`:
```javascript
{
  plays: 42,              // incremented by 1 on each game load
  timePlayed: 3600,       // incremented by seconds on page unload + every 30s interval
  lastPlayed: Timestamp   // serverTimestamp() set on each play (index.html only)
}
```

**`ideas`** — one document per submission:
```javascript
{
  title: "Idea Title",
  description: "Description...",
  timestamp: Timestamp    // serverTimestamp() on creation
}
```

### index.html Firebase Differences
`index.html` uses **additional** Firestore functions not used in game files:
- `collection`, `getDoc`, `setDoc`, `onSnapshot` — for real-time stats display
- Creates the Firestore document if it doesn't exist (via `setDoc`) when a game card is clicked
- Uses `onSnapshot` listener on the entire `game_stats` collection for live play-count updates
- Displays aggregated total plays and total time in the hero section

### Required Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /game_stats/{gameId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /ideas/{ideaId} {
      allow read: if true;
      allow create: if request.auth != null;
    }
  }
}
```

---

## Game-Specific Implementation Details

### block away.html — Puzzle
- **Architecture**: Class-based `class Game { }` with `constructor`, `loop()`, `isPathClear()` methods
- **Rendering**: Canvas 2D for particle effects only; game grid is DOM-based
- **Font**: Inter (Google Fonts)
- **Key mechanic**: Click blocks → they fly in arrow direction; `isPathClear()` validates movement

### closet sort.html — Puzzle (React)
- **Architecture**: React 18 functional components, `useState`/`useEffect`/`useCallback`
- **State**: 2D array for shelf grid; all icons are inline SVGs (no external icon dependency)
- **Script tag**: `type="text/babel"` required

### dice-roller.html — Tool
- **Architecture**: Pure DOM manipulation, no canvas, no framework
- **Notable**: The only game with no canvas rendering; uses CSS animations for dice roll
- **Stats**: Local-only (roll history in JS array), Firebase only tracks plays/time

### hunting.html — Action
- **Architecture**: Dual canvas (`gameCanvas` for game, `feedback-canvas` for hit effects)
- **Controls**: Mouse/touch for aiming; `updateMouse` function handles both
- **Physics**: Projectile motion, landscape generated with `generateLandscape()`

### mind match 3d.html — Puzzle (Three.js + Cannon.js)
- **Architecture**: Three.js `PerspectiveCamera`, `DirectionalLight`, `BoxGeometry` meshes + Cannon.js rigid bodies
- **Input**: Pointer events (`pointerdown`/`pointermove`/`pointerup`) with `passive: false`
- **Mobile perf**: `world.solver.iterations = 7` (reduced from default for mobile)
- **Boosters**: Fan (auto-match), Shake (randomize), Spring (undo), Ice (freeze timer)
- **Page weight**: ~500KB+ (Three.js + Cannon.js)

### monopoly mini games.html — Board (React)
- **Architecture**: React 18 with `useState`/`useEffect`/`useRef`; `viewport-fit=cover` for iPhone notch
- **LucideIcon**: Custom React component mapping `lucide.icons[name]` to `React.createElement`
- **Mini-games**: Heist, Temple, Cauldron, Slots, Wheel, Safe, Memory, Ghost Hunter, Card Shark, Cyber Breach
- **Complexity**: Largest file (~80KB); most complex state management
- **Script tag**: `type="text/babel"` required

### pixel.html — Arcade
- **Architecture**: Canvas 2D, global `ctx`, `requestAnimationFrame` game loop
- **Font**: Fredoka One (Google Fonts)
- **Key fix**: `ctx.globalAlpha = 1.0` reset at start of each frame prevents "washed out" board

### desert golf tribute.html — Sports
- **Architecture**: Canvas 2D, `gameState` object holds all state (ball, terrain, hole, camera, wind)
- **Terrain**: Procedurally generated per hole; `generateLevel()` creates terrain array of `{x, y, isBunker}` points
- **Biomes**: DUNES, MESA, SAVANNA, TUNDRA, PLAINS — cycle every 5 holes
- **Camera**: Smooth lerp-based `cameraX` tracking ball position
- **Input**: Drag-to-aim slingshot mechanic; `touchstart`/`touchmove` with `passive: false`
- **Font**: Courier New (system font, no Google Fonts)

### football legendary league.html — Sports
- **Architecture**: Vanilla JS with multiple view states (`view-standings`, `view-squad`, `view-puzzle`, `view-sim`)
- **Mechanic**: Match-3 puzzle ("Match Prep") feeds stats into a simulated football match engine
- **Squad**: 11 Liverpool FC players with positions (attack/defense/midfield) affecting match outcomes
- **League**: 10 Premier League teams, 18-round schedule (round-robin + second half)
- **Special tiles**: Rocket Ball (match 4 → clear row/column), Star Boost (match 5+ → clear all of color)
- **Font**: Rajdhani (Google Fonts)
- **Title in `<title>` tag**: "Soccer Match-3: Liverpool Squad Edition" (differs from display name)

---

## Important Notes & Gotchas

### GAME_ID Must Match index.html `id` Field
The `GAME_ID` constant in each game file **must exactly match** the `id` field in the `projects` array in `index.html`. A mismatch means Firestore stats won't link to the right game card. Always verify both values when creating or renaming games.

| File | GAME_ID | index.html id |
|---|---|---|
| `block away.html` | `'block-away'` | `"block-away"` |
| `closet sort.html` | `'closet-sort'` | `"closet-sort"` |
| `dice-roller.html` | `'dice-roller'` | `"dice-roller"` |
| `hunting.html` | `'hunting-sniper'` | `"hunting-sniper"` |
| `mind match 3d.html` | `'mind-match-3d'` | `"mind-match-3d"` |
| `monopoly mini games.html` | `'monopoly-mini'` | `"monopoly-mini"` |
| `pixel.html` | `'pixel-orbit'` | `"pixel-orbit"` |
| `desert golf tribute.html` | `'desert-golf-tribute'` | `"desert-golf-tribute"` |
| `football legendary league.html` | `'football-legendary-league'` | `"football-legendary-league"` |

### React Games Require `type="text/babel"`
In `closet sort.html` and `monopoly mini games.html`, the main game script tag **must** be `<script type="text/babel">`. Using `type="text/javascript"` or omitting `type` will cause a blank screen with JSX syntax errors.

### Firebase SDK Must Be ES Module
The Firebase tracking block at the bottom of each game uses `<script type="module">` with ES module `import` syntax. Do **not** convert this to a regular script — Firebase 10.x is ESM-only from the CDN URL used.

### No Shared Firebase Module
Firebase setup code (~50 lines) is intentionally duplicated in every game file. This is a known trade-off of the single-file architecture. Do not attempt to create a shared `firebase-tracker.js` unless the project explicitly moves to a build process.

### ideas.html Has No Anonymous Auth
`ideas.html` initializes Firebase without Anonymous Auth (it uses `getDocs`/`addDoc` directly). This is inconsistent with the game files but intentional — ideas submission works without auth because Firestore rules allow `create if request.auth != null` is not enforced here in the current implementation. If adding auth to `ideas.html`, use the same pattern as game files.

### File Names with Spaces
Game files use spaces in filenames (`block away.html`, `mind match 3d.html`). When referencing them in HTML `href` attributes, use the exact filename — browsers handle URL encoding automatically. Do not rename files to use hyphens without also updating `index.html`'s `file` field.

### Categories in index.html
Valid category values for the `projects` array are: `"Puzzle"`, `"Arcade"`, `"Board"`, `"Tool"`, `"Action"`, `"Sports"`. The category filter buttons in `index.html` are dynamically generated from the unique categories present in the `projects` array — adding a new category automatically creates a new filter button.

### Touch Events Require `passive: false`
All touch/pointer event listeners that call `e.preventDefault()` must be registered with `{ passive: false }`. Without this, browsers throw a console warning and the `preventDefault()` call is ignored, causing scroll interference during gameplay.

### `ctx.globalAlpha` Reset
When using Canvas 2D, always reset `ctx.globalAlpha = 1.0` at the start of each frame before `clearRect`. Failing to do so causes a "washed out" visual effect where transparency accumulates across frames (this was a real bug fixed in `pixel.html`).

### Firebase API Key Exposure
The Firebase API key is visible in all HTML source files. This is **intentional and correct** for client-side Firebase — security is enforced through Firestore security rules, not key secrecy. The key should be restricted to specific domains in Google Cloud Console for production.

### No Git Repository
The project has no `.git` directory. Version control has not been initialized. If asked to work with git commands, note this.

---

## Troubleshooting Guide

### Firebase Not Connecting
- Check browser console for `"Firebase not configured"` — means `firebaseConfig.apiKey === "YOUR_API_KEY"` guard is true
- Verify Anonymous Authentication is enabled in Firebase Console
- Ensure Firestore security rules are set correctly (see rules above)
- Use a local server, not `file://` protocol

### Blank Screen in React Games
1. Open DevTools console — look for Babel compilation errors
2. Verify script tag has `type="text/babel"` (not `type="text/javascript"`)
3. Check CDN links for React, ReactDOM, and Babel Standalone are accessible
4. Verify `ReactDOM.createRoot(document.getElementById('root')).render(<App />)` is called

### Play Counts Not Updating in index.html
- Open Network tab — check for failed Firebase requests
- Verify `onSnapshot` listener is active (check console for auth errors)
- Firestore documents may not exist yet — play each game once to create them, or create manually in Firebase Console
- Check Firestore security rules allow `read: if true`

### 3D Game Laggy on Mobile (mind match 3d.html)
- Reduce `world.solver.iterations` (currently 7, try 5)
- Limit spawned objects per level
- Disable shadows or reduce light count
- Ensure hardware acceleration is enabled in browser settings

### Touch Not Working
- Verify `touch-action: none` in CSS on body/canvas
- Verify event listeners use `{ passive: false }`
- Verify `e.preventDefault()` is called inside touch handlers
- Test on a real device — Chrome DevTools touch simulation is not always accurate

### CDN Library Fails to Load
- All CDN links must be HTTPS
- Check browser network tab for 4xx/5xx errors on CDN requests
- Verify CDN URLs haven't changed (Three.js r128 and Cannon.js 0.6.2 are pinned versions; Tailwind/React/Lucide use `latest`)

---

## AI Assistant Guidelines

### Architecture Constraints — Respect These Always
1. **No build tools**: Never suggest npm, webpack, Vite, Parcel, or any bundler unless explicitly asked to add one
2. **No package installation**: All dependencies must be CDN links
3. **Single-file games**: Each game stays self-contained — no splitting into multiple files
4. **Preserve Firebase tracking**: Every game file must retain the `<!-- FIREBASE TRACKING -->` block at the bottom
5. **Maintain file naming**: Lowercase with spaces for game files (`game name.html`)

### When Adding New Games
- Copy the complete Firebase tracking block from an existing game (e.g., `block away.html` for vanilla JS games)
- Change **only** the `GAME_ID` constant — keep all other Firebase config identical
- Register the game in `index.html`'s `projects` array with a matching `id`
- Add `touch-action: none` and `user-select: none` to the game's body CSS
- Use `requestAnimationFrame` for all game loops — never `setInterval` for rendering

### When Modifying Existing Games
- Test changes by opening the file in a browser with a local server
- Check DevTools console for errors after every significant change
- For React games, Babel compilation errors appear at runtime in the console — they look like normal JS errors
- Do not change the Firebase config object — it is shared across all files

### When Debugging
- Open browser DevTools console first — always
- Check Network tab for failed CDN requests (common cause of blank screens)
- For Firebase issues, look for `"Tracking Error"` or `"Stats error"` in console
- Use `console.log()` freely — there is no build step to strip them out
- Test on both desktop and mobile viewport sizes

### Styling New Content
- Use the cyber theme color variables for `index.html` and `ideas.html` pages
- Individual games have their own visual style — do not force the cyber theme onto games
- `featured: true` in the projects array gives a card an amber accent; use sparingly
- Tailwind classes work in all files that load `https://cdn.tailwindcss.com`

### Performance Considerations
- `mind match 3d.html` is the heaviest page (~500KB+ of 3D libraries) — mobile optimizations matter here
- `monopoly mini games.html` is the most complex JS (~80KB file) — keep additions focused
- CDN libraries are browser-cached across games — users loading multiple games benefit from cache
- `setInterval(saveTime, 30000)` runs in all games — do not add additional polling intervals

---

**Last Updated**: 2026-01-30
**Project Owner**: Mladen Dulanovic
**Contact**: [LinkedIn](https://www.linkedin.com/in/mladendulanovic/)
**License**: Private portfolio project