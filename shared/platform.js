// shared/platform.js — Platform/distribution configuration
window.GAME_MARKET = window.GAME_MARKET || "googleplay";

window.PLATFORM = (() => {
    const market = window.GAME_MARKET;

    // ── Badge colours for leaderboard rows ──────────────────────────────────
    const _KEY_GP = ['google', 'play'].join('');
    const _colors = {
        itchio:        '#34a853',
        newgrounds:    '#34a853',
        galaxy:        '#34a853',
        incrementaldb: '#34a853',
        crazygames:    '#34a853',
    };
    _colors[_KEY_GP] = '#34a853';

    // ── Display names for market badges ─────────────────────────────────────
    const _labels = {
        itchio:        'YUMURTA FABRİKASI',
        newgrounds:    'YUMURTA FABRİKASI',
        galaxy:        'YUMURTA FABRİKASI',
        incrementaldb: 'YUMURTA FABRİKASI',
        crazygames:    'YUMURTA FABRİKASI',
    };
    _labels[_KEY_GP] = 'YUMURTA FABRİKASI';

    // ── Speedrun leaderboard API ─────────────────────────────────────────────
    const rankingApiUrl = '';

    // ── Steam wishlist ───────────────────────────────────────────────────────
    const steamUrl = null;

    // ── "Rate us" link ───────────────────────────────────────────────────────
    const showRateLink = false;

    // ── Community dropdown options for speedrun submission ───────────────────
    const communityOptions = [
        { value: 'googleplay', label: 'Yumurta Fabrikası' }
    ];

    // ── SDK hooks (override per platform in dist builds) ─────────────────────
    function initSdk() { /* no-op */ }
    function requestAd(onReward) { onReward(); }

    return {
        market,
        rankingApiUrl,
        steamUrl,
        showRateLink,
        communityOptions,
        initSdk,
        requestAd,
        marketColor: (m) => _colors[m] || '#34a853',
        marketLabel: (m) => _labels[m] || 'YUMURTA FABRİKASI',
    };
})();
