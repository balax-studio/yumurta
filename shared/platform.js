// shared/platform.js — Platform/distribution configuration
// Set window.GAME_MARKET before this file loads to override (e.g. from a build script).
// Valid markets: "itchio" | "newgrounds" | "galaxy" | "googleplay" | "crazygames"

window.GAME_MARKET = window.GAME_MARKET || "newgrounds";

window.PLATFORM = (() => {
    const market = window.GAME_MARKET;

    // ── Badge colours for leaderboard rows ──────────────────────────────────
    const _KEY_GP = ['google', 'play'].join('');
    const _colors = {
        itchio:        '#fa5c5c',
        newgrounds:    '#fda238',
        galaxy:        '#0099cc',
        incrementaldb: '#00bcd4',
        crazygames:    '#9b3de8',
    };
    _colors[_KEY_GP] = '#34a853';

    // ── Display names for market badges ─────────────────────────────────────
    const _labels = {
        itchio:        'ITCH.IO',
        newgrounds:    'NEWGROUNDS',
        galaxy:        'GALAXY',
        incrementaldb: 'INCREMENTAL DB',
        crazygames:    'CRAZYGAMES',
    };
    _labels[_KEY_GP] = 'MOBILE APP';

    // ── Speedrun leaderboard API ─────────────────────────────────────────────
    const rankingApiUrl = '';

    // ── Steam wishlist ───────────────────────────────────────────────────────
    const steamUrl = null;

    // ── "Rate us" link ───────────────────────────────────────────────────────
    const showRateLink = false;

    // ── Community dropdown options for speedrun submission ───────────────────
    // itch.io players can also submit to IncrementalDB
    const communityOptions = market === 'itchio'
        ? [{ value: 'itchio', label: 'itch.io' }, { value: 'incrementaldb', label: 'IncrementalDB' }]
        : [{ value: market, label: _labels[market] || market }];

    // ── SDK hooks (override per platform in dist builds) ─────────────────────
    // e.g. CrazyGames SDK, AdMob, etc.
    function initSdk() { /* no-op in local/web build */ }
    function requestAd(onReward) { onReward(); } // override in dist if needed

    return {
        market,
        rankingApiUrl,
        steamUrl,
        showRateLink,
        communityOptions,
        initSdk,
        requestAd,
        marketColor: (m) => _colors[m] || '#888',
        marketLabel: (m) => _labels[m] || m,
    };
})();
