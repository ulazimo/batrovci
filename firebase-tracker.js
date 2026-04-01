import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, setPersistence, inMemoryPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyC2RSC711FagoP5XsODIFfLMMZUX6Up-xM",
    authDomain: "prototypes-7691b.firebaseapp.com",
    projectId: "prototypes-7691b",
    storageBucket: "prototypes-7691b.firebasestorage.app",
    messagingSenderId: "263652926534",
    appId: "1:263652926534:web:9af3c4ce63aab78f0f9647",
    measurementId: "G-1X91H99N2G"
};

export function initTracking(gameId) {
    let db, auth, currentUser = null;
    let startTime = Date.now();

    let paused = false;

    function flushTime() {
        if (!db || !currentUser) return;
        const s = Math.floor((Date.now() - startTime) / 1000);
        if (s > 0) {
            setDoc(doc(db, "game_stats", gameId), { timePlayed: increment(s) }, { merge: true })
                .catch(e => console.warn("Stats error:", e));
            startTime = Date.now();
        }
    }

    async function init() {
        try {
            const existing = getApps().find(a => a.name === gameId);
            const app = existing || initializeApp(firebaseConfig, gameId);
            db = getFirestore(app);
            auth = getAuth(app);
            try {
                await setPersistence(auth, inMemoryPersistence);
            } catch (e) {
                console.warn("Persistence set warning", e);
            }
            const { user } = await signInAnonymously(auth);
            currentUser = user;
            setDoc(doc(db, "game_stats", gameId), { plays: increment(1) }, { merge: true })
                .catch(e => console.warn("Stats error:", e));
            setInterval(() => { if (!paused) flushTime(); }, 30000);
        } catch (e) {
            console.error("Tracking error:", e);
        }
    }

    init();

    window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            flushTime();   // save time accumulated while playing
            paused = true; // stop counting while tab is hidden
        } else {
            paused = false;
            startTime = Date.now(); // restart counting from now
        }
    });
    window.addEventListener("beforeunload", flushTime);
}
