# Mladen's Prototype Lab

A collection of experimental HTML5 game prototypes and interactive mechanics demonstrations. Each prototype is a self-contained single-file HTML application showcasing various gameplay mechanics.

## 🎮 Live Games

- **Block Away** - Arrow-based puzzle game with complex shapes
- **Mind Match 3D** - 3D object matching with physics (Three.js + Cannon.js)
- **Closet Sort** - Match-3 luxury item organizer
- **Monopoly Mini Games** - Board game with 10+ mini-games
- **Pixel Destroyer** - Arcade pixel destruction mechanics
- **Dice Roller** - Physics-based dice utility
- **Hunting Sniper** - Hunting simulator
- **Deep Sea Spearfishing** - Underwater spearfishing action game
- **Desert Golf Tribute** - Minimalist golf with procedural terrain
- **Football Legendary League** - Arcade football with league progression
- **Royal Chase** - Chess-inspired strategy on a 5x5 board
- **Logic Kitchen** - Visual node-based puzzle game
- **The Rite of the Crimson Veil** - Multiplayer party game for 2-8 players
- **Road Blocks: Car Blast!** - Block-placement puzzle by Tihi
- **Memory Match** - Flip cards to build color chains and combos
- **Black Hole City** - Control a black hole, consume everything

## 🚀 Quick Start

### Option 1: Direct File Opening
Simply open `index.html` in a modern browser.

### Option 2: Local Server (Recommended for Firebase features)
```bash
# Python 3
python3 -m http.server 8000

# Node.js
npx http-server

# Then navigate to http://localhost:8000
```

### Option 3: VS Code Live Server
Right-click `index.html` → "Open with Live Server"

## 🏗️ Architecture

- **One folder per game** - Each game lives in its own directory
- **No build process** - All dependencies loaded from CDN
- **Firebase integration** - Real-time analytics and statistics
- **Mobile-first design** - Touch-optimized controls

## 🛠️ Tech Stack

### Core
- HTML5, CSS3, Vanilla JavaScript (ES6+)
- Tailwind CSS (via CDN)
- Lucide Icons

### Game-Specific Libraries
- **React 18** - closet sort, monopoly mini games
- **Three.js r128** - mind match 3d (3D rendering)
- **Cannon.js 0.6.2** - mind match 3d (physics)

### Backend
- Firebase 10.7.1 (Firestore, Anonymous Auth)

## 📁 Project Structure

```
batrovci/
├── index.html                # Main landing page
├── ideas.html                # Idea submission page
├── firebase-tracker.js       # Shared play/time tracking module
├── favicon.svg
├── block-away/index.html
├── closet-sort/index.html
├── crimson-veil/index.html
├── desert-golf-tribute/index.html
├── dice-roller/index.html
├── football-legendary-league/index.html
├── hole-io/index.html
├── hunting-sniper/index.html
├── logic-kitchen/index.html
├── memory-match/index.html
├── mind-match-3d/
│   ├── index.html
│   └── models/               # 3D models (.glb)
├── monopoly-mini/index.html
├── pixel-orbit/index.html
├── road-blocks-car-blast/index.html
├── royal-chase/index.html
├── underwater-fishing/index.html
└── screenshots/
```

## 🎯 Adding New Games

1. Create `game-id/index.html`
2. Add Firebase tracking at the end of the file:
   ```html
   <script type="module">
       import { initTracking } from '../firebase-tracker.js';
       initTracking('game-id');
   </script>
   ```
3. Add "← All Games" link pointing to `../index.html`
4. Add game entry to `projects` array in `index.html`:

```javascript
{
    id: "game-id",
    title: "Game Title",
    file: "game-id/",
    description: "Brief description",
    category: "Puzzle",      // Puzzle, Arcade, Board, Tool, Action, Sports, Party
    date: "2026-01-23",
    featured: false,
    version: "1.0"
}
```

## 🔧 Firebase Setup

### Prerequisites
1. Enable Anonymous Authentication in Firebase Console
2. Create Firestore database
3. Set security rules:

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

### API Key Security
While Firebase API keys are safe to expose in client-side code (security is enforced through Firestore rules), you should restrict your API key in Google Cloud Console to specific domains in production.

## 🌐 Browser Compatibility

**Minimum Requirements:**
- Chrome 90+
- Safari 14+
- Firefox 88+
- Edge 90+

**Not Supported:** IE11 or older browsers

## 📦 Deployment

This project can be deployed to any static hosting service:

### GitHub Pages
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
# Enable Pages in repo settings
```

### Netlify / Vercel
Simply drag-and-drop the project folder or connect your git repository.

### Firebase Hosting
```bash
firebase init hosting
firebase deploy
```

## 🔒 Security Notes

- Firebase API keys are intentionally exposed (client-side requirement)
- Security enforced through Firestore security rules
- Anonymous auth uses in-memory persistence (no cookies)
- Restrict API key to specific domains in production

## 📝 License

Private portfolio project by Mladen Dulanovic.

## 🤝 Contributing

This is a personal portfolio project. For prototype ideas, use the ideas submission form on the website.

---

**Last Updated:** 2026-03-27
**Contact:** [LinkedIn](https://www.linkedin.com/in/mladendulanovic/)
