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

- **Single-file HTML games** - Each game is completely standalone
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
├── index.html              # Main landing page
├── ideas.html              # Idea submission page
├── favicon.svg
├── work_in_progress_video.mp4
│
├── block away.html
├── closet sort.html
├── dice-roller.html
├── hunting.html
├── mind match 3d.html
├── monopoly mini games.html
└── pixel.html
```

## 🎯 Adding New Games

1. Create `game-name.html` file
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

**Last Updated:** 2026-01-23  
**Contact:** [LinkedIn](https://www.linkedin.com/in/mladendulanovic/)
