/**
 * Shared Google Analytics event wrapper.
 *
 * Usage (add to any game's bottom script block):
 *   <script type="module">
 *       import { initAnalytics } from '../analytics.js';
 *       initAnalytics('your-game-id');
 *   </script>
 *
 * Then anywhere in the game call:
 *   window.trackEvent('level_complete', { score: 42 });
 *
 * The game_id is injected automatically — events from different games
 * are distinguishable in the GA4 dashboard by filtering on the game_id
 * parameter (Reports → Engagement → Events → filter by game_id).
 */
export function initAnalytics(gameId) {
    window.trackEvent = function(event, data) {
        if (typeof gtag !== 'function') return;
        gtag('event', event, { game_id: gameId, ...data });
    };
}
