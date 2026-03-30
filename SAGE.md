# Batrovci - SAGE Configuration

**Mladen's Prototype Lab** is a collection of experimental HTML5 game prototypes and interactive mechanics demonstrations. This project serves as a testing ground for game ideas, UI/UX patterns, and gameplay loops. Each prototype is a self-contained single-file HTML application with embedded JavaScript, CSS, and Firebase analytics integration.

## Project Overview

**Purpose**: Personal portfolio of playable game prototypes showcasing various mechanics (puzzle, arcade, board games, 3D interactions, physics simulations)

**Target Audience**: Portfolio visitors, game designers, potential clients/employers

**Architecture**: Static HTML files with CDN-loaded libraries - no build process, no dependencies, no package manager. Each game is completely standalone and can be opened directly in a browser.

**Deployment Model**: Simple static file hosting (can be deployed to GitHub Pages, Netlify, Vercel, or any web server)

## Technology Stack

### Core Technologies
- **HTML5**: All games are single-file `.html` documents with embedded scripts and styles
- **Vanilla JavaScript (ES6+)**: Modern JavaScript with arrow functions, destructuring, template literals, async/await
- **CSS3**: Inline `<style>` blocks with Tailwind utility classes and custom animations

### Frontend Frameworks & Libraries (CDN-loaded)
- **React 18** (production build from unpkg): Used in `closet sort.html` and `monopoly mini games.html`
  - Loaded via: `https://unpkg.com/react@18/umd/react.production.min.js`
  - ReactDOM: `https://unpkg.com/react-dom@18/umd/react-dom.production.min.js`
  - Babel Standalone: `https://unpkg.com/@babel/standalone/babel.min.js` for JSX compilation in browser
  - Scripts use `type="text/babel"` to enable JSX syntax

- **Three.js r128**: Used in `mind match 3d.html` for 3D rendering
  - Loaded via: `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`
  - Provides WebGL-based 3D scene, camera, renderer, lighting, and mesh management

- **Cannon.js 0.6.2**: Physics engine in `mind match 3d.html`
  - Loaded via: `https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js`
  - Handles rigid body physics, collisions, gravity, and drag interactions

- **Tailwind CSS** (latest via CDN): Primary styling framework
  - Loaded via: `https://cdn.tailwindcss.com`
  - Used in: `index.html`, `ideas.html`, `block away.html`, `closet sort.html`, `monopoly mini games.html`, `hunting.html`
  - Custom color palette defined inline using Tailwind's configuration

- **Lucide Icons** (latest): SVG icon library
  - Loaded via: `https://unpkg.com/lucide@latest`
  - Used in: `index.html`, `ideas.html`, `monopoly mini games.html`
  - Icons initialized with `lucide.createIcons()` after DOM render
  - In React apps, custom `LucideIcon` component maps icon names to React elements

### Backend & Data
- **Firebase 10.7.1**: Analytics and data persistence
  - **Firestore**: Real-time database for game statistics and user-submitted ideas
  - **Firebase Auth**: Anonymous authentication for tracking sessions
  - **Firebase SDK**: Loaded as ES modules from `https://www.gstatic.com/firebasejs/10.7.1/`
  - Project ID: `prototypes-7691b`
  - Collection: `game_stats` (tracks plays, time spent per game)
  - Collection: `ideas` (stores user-submitted prototype ideas)

### Mobile & Touch Support
- All games include `touch-action: none` and `-webkit-user-select: none` for mobile
- Pointer events (`pointerdown`, `pointermove`, `pointerup`) used for unified mouse/touch handling
- Viewport meta tags: `maximum-scale=1.0, user-scalable=no` for fixed scaling
- Touch event listeners with `{passive: false}` to prevent default scrolling

## Project Structure

```
batrovci/
├── index.html                    # Main landing page with game portfolio grid
├── ideas.html                    # User idea submission page with Firebase form
├── favicon.svg                   # Site favicon (SVG format)
├── work_in_progress_video.mp4    # Demo video asset
│
├── block away.html               # Puzzle: Arrow-based block clearing game
├── closet sort.html              # Puzzle: Match-3 luxury item organizer (React)
├── dice-roller.html              # Tool: Physics-based dice roller with statistics
├── hunting.html                  # Action: Hunting sniper simulator
├── mind match 3d.html            # Puzzle: 3D object matching with physics (Three.js + Cannon.js)
├── monopoly mini games.html      # Board: Collection of Monopoly-style mini games (React)
├── pixel.html                    # Arcade: Pixel destruction mechanics test
│
└── .DS_Store                     # macOS system file (ignore)
```

### File Naming Convention
- All game files use lowercase with spaces: `game name.html`
- Main pages use simple names: `index.html`, `ideas.html`
- Each game is completely self-contained with no external dependencies except CDN libraries

### Key Files Explained

**index.html** - Portfolio Landing Page
- Dark "cyber" themed design with neon accents
- Dynamic game grid with category filtering (Puzzle, Arcade, Board, Tool, Action)
- Real-time Firebase statistics display (total plays, total time, status)
- Search functionality across game titles and descriptions
- Responsive layout with Tailwind utilities
- Custom CSS variables: `cyber-primary`, `cyber-bg`, `cyber-card`, `cyber-border`, `cyber-muted`

**ideas.html** - Idea Submission Page
- Firebase form for submitting prototype ideas
- Displays all submitted ideas from Firestore in real-time
- Same cyber theme as index page
- Form fields: title (text input), description (textarea)
- Submissions stored with `serverTimestamp()` for ordering

**Game Files** - Individual Prototypes
- Each game has unique `GAME_ID` constant (e.g., `'block-away'`, `'mind-match-3d'`)
- Firebase tracking code at bottom of each file (plays counter, time tracking)
- `initFirebase()` function handles auth and Firestore initialization
- `saveTime()` function called on `beforeunload` to persist session duration
- Anonymous auth with `inMemoryPersistence` (no cookies)

## Development Workflow

### Running Locally
```bash
# No build step required! Simply open any HTML file in a browser.

# Option 1: Direct file opening
open index.html

# Option 2: Local server (recommended for Firebase features)
python3 -m http.server 8000
# Then navigate to http://localhost:8000

# Option 3: VS Code Live Server extension
# Right-click index.html → "Open with Live Server"
```

### Testing Games
1. Open `index.html` in browser
2. Click any game card to launch prototype
3. Firebase analytics will track session automatically
4. Return to index to see updated play counts (real-time)

### Adding New Games
1. Create new `game-name.html` file
2. Copy Firebase tracking code from existing game
3. Set unique `GAME_ID` constant
4. Add game entry to `projects` array in `index.html`:
```javascript
{
    id: "game-id",           // Must match GAME_ID in game file
    title: "Game Title",
    file: "game-name.html",
    description: "Brief description",
    category: "Puzzle",      // Puzzle, Arcade, Board, Tool, Action
    date: "2026-01-23",
    featured: false,         // Set true for amber accent
    version: "1.0"
}
```

### No Build Process
- **No npm/yarn**: All dependencies loaded from CDN
- **No bundler**: No webpack, Vite, Parcel, or similar
- **No transpilation**: Modern browsers only (ES6+ native support)
- **No CSS preprocessor**: Tailwind via CDN + inline custom CSS
- **No minification**: Files served as-is (CDN libraries are pre-minified)

## Code Conventions

### JavaScript Patterns

**Functional Style**
- Arrow functions preferred: `const handleClick = (e) => { ... }`
- Array methods over loops: `.map()`, `.filter()`, `.reduce()`, `.forEach()`
- Destructuring: `const { useState, useEffect } = React;`
- Template literals for strings: `` `Hello ${name}` ``

**React Usage** (in applicable games)
- Functional components with hooks
- State management via `useState`
- Side effects via `useEffect`
- `ReactDOM.createRoot()` for React 18 concurrent rendering
- JSX compiled in-browser via Babel Standalone

**Vanilla JS Games**
- Class-based for game state: `class Game { ... }`
- Global constants in UPPERCASE: `const GAME_ID = 'block-away';`
- Event listeners on DOM ready or after element creation
- Canvas API for rendering (2D context in pixel.html, hunting.html)

### CSS & Styling

**Tailwind Utility Classes**
- Layout: `flex`, `grid`, `max-w-7xl`, `mx-auto`, `px-4`, `py-8`
- Spacing: Tailwind scale (4 = 1rem, 8 = 2rem, etc.)
- Colors: Tailwind palette + custom cyber theme
- Responsive: `sm:`, `md:`, `lg:` prefixes for breakpoints

**Custom Cyber Theme** (index.html, ideas.html)
```javascript
// Defined in Tailwind config
colors: {
    'cyber-primary': '#00F0FF',    // Neon cyan
    'cyber-secondary': '#FF00F5',  // Neon magenta
    'cyber-bg': '#0B0E14',         // Dark background
    'cyber-card': '#151922',       // Card background
    'cyber-border': '#1F2937',     // Border color
    'cyber-text': '#E5E7EB',       // Text color
    'cyber-muted': '#9CA3AF'       // Muted text
}
```

**Animations**
- CSS keyframes for effects: `@keyframes shake`, `@keyframes roll`, `@keyframes popUp`
- Tailwind transitions: `transition-all duration-300`
- Custom animations: `animate-shake`, `animate-pulse`, `pop-anim`

### Firebase Integration

**Authentication Pattern**
```javascript
const auth = getAuth(app);
await setPersistence(auth, inMemoryPersistence); // No cookies
const userCredential = await signInAnonymously(auth);
currentUser = userCredential.user;
```

**Analytics Tracking**
```javascript
// On game start
const statsRef = doc(db, "game_stats", GAME_ID);
await updateDoc(statsRef, {
    plays: increment(1),
    lastPlayed: serverTimestamp()
});

// On page unload
window.addEventListener('beforeunload', saveTime);
function saveTime() {
    const timeSpentSeconds = Math.floor((Date.now() - startTime) / 1000);
    updateDoc(statsRef, { timePlayed: increment(timeSpentSeconds) });
}
```

**Real-time Listeners** (index.html only)
```javascript
const q = collection(db, "game_stats");
onSnapshot(q, (querySnapshot) => {
    querySnapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        gameStats[change.doc.id] = data;
    });
    updateUI();
});
```

### Mobile-First Considerations
- All games designed for both desktop and mobile
- Touch events handled alongside mouse events
- Responsive canvas sizing with `window.addEventListener('resize', ...)`
- Prevent default touch behaviors: `e.preventDefault()` in touch handlers
- Large touch targets for buttons (min 44x44px)
- `viewport-fit=cover` for iPhone notch support (monopoly mini games)

## Game-Specific Implementation Details

### block away.html
- **Mechanics**: Click blocks to send them flying in arrow direction
- **Tech**: Vanilla JS with grid-based state management
- **Physics**: Custom collision detection with `isPathClear()` function
- **Levels**: Procedural generation with increasing complexity
- **Styling**: Tailwind + custom Inter font

### closet sort.html
- **Mechanics**: Match-3 luxury item sorting on shelves
- **Tech**: React 18 with hooks (useState, useEffect, useCallback)
- **State**: 2D array representing shelf grid
- **Animation**: CSS transitions for item movement and matching effects
- **Levels**: Progressive difficulty (more item types, more shelves)

### dice-roller.html
- **Mechanics**: Animated dice roll with statistics tracking
- **Tech**: Vanilla JS with DOM manipulation
- **Features**: Roll history, distribution chart, average/min/max stats
- **Animation**: CSS keyframe rotation during roll
- **Persistence**: Local state only (no Firebase writes)

### hunting.html
- **Mechanics**: Aim and shoot moving animals
- **Tech**: Canvas 2D API with sprite rendering
- **Physics**: Projectile motion, collision detection
- **Levels**: Progressive difficulty with faster/smaller targets
- **Controls**: Mouse/touch for aiming, click/tap to fire

### mind match 3d.html
- **Mechanics**: Match 3D emoji cards by dragging into tray
- **Tech**: Three.js for rendering + Cannon.js for physics
- **3D Setup**: PerspectiveCamera, DirectionalLight, BoxGeometry meshes
- **Physics**: Rigid bodies with drag constraints, gravity, collisions
- **Boosters**: Fan (auto-match), Shake (randomize), Spring (undo), Ice (freeze timer)
- **Performance**: Physics iterations reduced for mobile (solver.iterations = 7)

### monopoly mini games.html
- **Mechanics**: Board game with dice rolling and mini-game events
- **Tech**: React 18 with extensive state management
- **Mini Games**: 10+ unique games (Heist, Temple, Cauldron, Slots, Wheel, Safe, Memory, Ghost Hunter, Card Shark, Cyber Breach)
- **Styling**: Tailwind with custom 3D dice CSS animation
- **Complexity**: Largest file (~80KB) with most complex game logic

### pixel.html
- **Mechanics**: Destroy falling pixel blocks with pig ammo
- **Tech**: Canvas 2D with particle effects
- **Physics**: Custom gravity and collision system
- **Levels**: Predefined patterns with increasing difficulty
- **Animation**: Smooth lerp-based movement for visual polish

## Common Patterns & Best Practices

### Error Handling
- Firebase errors caught and displayed in UI toast notifications
- Guard clauses for null/undefined checks: `if (!db || !currentUser) return;`
- Try-catch blocks around async Firebase operations
- Graceful degradation if Firebase unavailable

### Performance Optimization
- RequestAnimationFrame for game loops: `requestAnimationFrame(animate)`
- Canvas clearing before redraw: `ctx.clearRect(0, 0, width, height)`
- Physics timestep limiting: `world.step(1/60)` for consistent simulation
- Debounced window resize handlers where appropriate

### Accessibility
- Semantic HTML where possible (`<header>`, `<footer>`, `<main>`)
- Color contrast meets WCAG standards (cyber theme uses high contrast)
- Keyboard navigation not prioritized (games are primarily mouse/touch)
- Screen reader support minimal (visual-first prototypes)

### Code Organization Within Files
1. DOCTYPE and HTML head (meta tags, CDN links, inline styles)
2. Body content (game UI, screens, controls)
3. Inline JavaScript (game logic, Firebase setup)
4. Firebase tracking module at end

## Firebase Configuration

### Security Rules Required
```javascript
// Firestore rules (must be set in Firebase Console)
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

### Anonymous Auth Setup
- Enable Anonymous Authentication in Firebase Console
- Required for all game tracking to work
- Uses in-memory persistence (no cookies stored)

### Firestore Collections

**game_stats** (document per game)
```javascript
{
  plays: 42,              // increment(1) on each game start
  timePlayed: 3600,       // increment(seconds) on page unload
  lastPlayed: Timestamp   // serverTimestamp() on each play
}
```

**ideas** (document per submission)
```javascript
{
  title: "Game Idea Title",
  description: "Detailed description...",
  timestamp: Timestamp    // serverTimestamp() on creation
}
```

## Deployment

### Static Hosting Options
1. **GitHub Pages**: Push to repo, enable Pages in settings, done
2. **Netlify**: Drag-and-drop folder or connect repo
3. **Vercel**: Import project, auto-deploy on push
4. **Firebase Hosting**: `firebase init hosting` → `firebase deploy`
5. **Any web server**: Upload files, serve as static content

### Pre-Deployment Checklist
- [ ] Test all games in target browsers (Chrome, Safari, Firefox)
- [ ] Verify Firebase config is correct (not placeholder API key)
- [ ] Check mobile responsiveness on real devices
- [ ] Ensure all CDN links are HTTPS
- [ ] Test Firebase analytics are recording correctly
- [ ] Validate HTML (optional but recommended)

### Browser Compatibility
- **Minimum**: Chrome 90+, Safari 14+, Firefox 88+, Edge 90+
- **Reason**: ES6+ features, CSS Grid, Flexbox, async/await
- **Not supported**: IE11 or older browsers

## Troubleshooting

### Firebase Not Connecting
- **Error**: "Firebase not configured" in console
- **Fix**: Check `firebaseConfig.apiKey !== "YOUR_API_KEY"` condition
- **Fix**: Enable Anonymous Auth in Firebase Console
- **Fix**: Set correct Firestore security rules

### Games Not Loading Stats
- **Issue**: Play counts show 0 or "Loading..."
- **Fix**: Open browser console, check for CORS errors
- **Fix**: Ensure Firestore documents exist (create manually or play game once)
- **Fix**: Check network tab for failed Firebase requests

### React Games Not Rendering
- **Issue**: Blank screen in closet sort or monopoly mini games
- **Fix**: Check console for Babel compilation errors
- **Fix**: Ensure script tag has `type="text/babel"`
- **Fix**: Verify React/ReactDOM/Babel CDN links are accessible

### 3D Game Performance Issues
- **Issue**: mind match 3d.html is laggy on mobile
- **Fix**: Reduce `world.solver.iterations` in Cannon.js setup
- **Fix**: Limit number of objects spawned per level
- **Fix**: Disable shadows or reduce light count
- **Fix**: Test on device with hardware acceleration enabled

### Touch Events Not Working
- **Issue**: Games unresponsive on mobile
- **Fix**: Add `{passive: false}` to touch event listeners
- **Fix**: Include `e.preventDefault()` in touch handlers
- **Fix**: Verify `touch-action: none` in CSS
- **Fix**: Test with actual device (not just browser DevTools)

## Important Notes

### No Version Control Currently
- Project has no `.git` directory
- No `.gitignore` file
- Consider initializing git: `git init && git add . && git commit -m "Initial commit"`

### No README
- No project documentation file
- Consider adding README.md with project description and setup instructions

### Firebase API Key Exposed
- API key is visible in source code (this is normal for client-side Firebase)
- Security enforced through Firestore rules, not key secrecy
- Restrict API key in Google Cloud Console to specific domains in production

### Single-File Architecture Trade-offs
**Pros:**
- Easy to share individual prototypes
- No build complexity
- Instant preview by opening file
- Self-contained and portable

**Cons:**
- Code duplication (Firebase setup repeated in each game)
- Harder to maintain consistent styles across games
- Large files can be slow to edit
- No code splitting or lazy loading

### Performance Considerations
- CDN libraries cached by browser across games
- No bundle size optimization (each game loads full libraries)
- Firebase SDK is ~200KB (loaded per game)
- Three.js + Cannon.js adds ~500KB to mind match 3d
- Total page weight varies: 30KB (simple games) to 600KB (3D games)

### Future Improvement Opportunities
1. Extract common Firebase code into shared module
2. Create template file for new games
3. Add build step for production (minification, bundling)
4. Implement service worker for offline play
5. Add unit tests for game logic
6. Create design system documentation for cyber theme
7. Add analytics dashboard page to visualize game stats
8. Implement user accounts (replace anonymous auth)
9. Add social sharing features
10. Create game editor/builder tool

## AI Assistant Guidelines

When working with this project:

1. **Respect the architecture**: Don't suggest adding npm, webpack, or build tools unless explicitly requested
2. **Maintain single-file structure**: Keep games self-contained
3. **Use CDN libraries**: Don't install packages, use unpkg/cdnjs links
4. **Follow naming conventions**: Lowercase with spaces for game files
5. **Include Firebase tracking**: Copy pattern from existing games
6. **Test in browser**: Always verify changes by opening HTML file
7. **Mobile-first**: Consider touch events and responsive design
8. **Preserve cyber theme**: Use existing color palette and styling patterns
9. **Update index.html**: Add new games to projects array
10. **Document unique mechanics**: Add comments for complex game logic

### When Adding New Features
- Check if similar pattern exists in other games first
- Maintain consistency with existing code style
- Test on both desktop and mobile
- Update this SAGE.md if adding new patterns or conventions

### When Debugging
- Open browser DevTools console first
- Check Network tab for failed CDN requests
- Verify Firebase connection status
- Test with different browsers
- Use `console.log()` liberally (no build step to remove them)

### When Refactoring
- Consider impact on all game files (shared patterns)
- Test each game individually after changes
- Don't break Firebase tracking integration
- Maintain backward compatibility with existing saved data

---

**Last Updated**: 2026-01-23  
**Project Owner**: Mladen Dulanovic  
**License**: Not specified (assume private/portfolio use)