// shared/ads.js — Ad & SDK lifecycle hub for all platforms.
// To add a new platform (AdMob, etc.), only edit this file.
// Exposes window.GameAds. Loaded before scenario scripts.
//
// Setup (call once after BGM is ready):
//   GameAds.init({ onAdStart, onAdEnd })
//
// Platform detection priority:
//   1. CrazyGames SDK v3  (window.CrazyGames.SDK present)
//   2. AdMob / Capacitor  (window.Capacitor.Plugins.AdMob present — googleplay build)
//   3. Local / web stub   (reward fires immediately, lifecycle is no-op)

window.GameAds = (() => {
    let _freeAdsLeft     = 1; // 1 free token; restored after a paid purchase (CrazyGames policy: ad → pay → ad → …)
    let _onAdStart       = null;
    let _onAdEnd         = null;
    // Pick up the SDK promise set in index.html immediately at load time,
    // so _sdkRun defers correctly even before GameAds.init() is called.
    let _sdkReady        = window._cgSdkReady || null;

    // ── AdMob (Android & iOS) ────────────────────────────────────────────────
    const _ADMOB_REWARDED_ID_ANDROID = 'ca-app-pub-2626843024156194/9307387605';
    const _ADMOB_REWARDED_ID_IOS     = 'ca-app-pub-2626843024156194/9778246614';

    function _getRewardedAdId() {
        return (window.Capacitor?.getPlatform?.() === 'ios')
            ? _ADMOB_REWARDED_ID_IOS
            : _ADMOB_REWARDED_ID_ANDROID;
    }
    const _ADMOB_TEST_MODE = false;

    let _admListenersReady = false;
    let _admRewardedLoaded = false;
    let _admRewardedLoading = false;
    let _admPendingReward = null;

    // window.Capacitor only exists inside the packaged native app
    function _adm() {
        try {
            if (!window.Capacitor?.isNativePlatform?.()) return null;
            return window.Capacitor.Plugins?.AdMob || null;
        } catch (e) { return null; }
    }

    function _admPreloadRewarded() {
        const adm = _adm();
        if (!adm || _admRewardedLoaded || _admRewardedLoading) return;
        _admRewardedLoading = true;
        adm.prepareRewardVideoAd({ adId: _getRewardedAdId(), isTesting: _ADMOB_TEST_MODE })
            .catch((e) => console.warn('[Ads] AdMob rewarded preload failed:', e))
            .finally(() => { _admRewardedLoading = false; });
    }

    function _admInitListeners(adm) {
        if (_admListenersReady) return;
        _admListenersReady = true;

        adm.addListener('onRewardedVideoAdLoaded', () => { _admRewardedLoaded = true; });
        adm.addListener('onRewardedVideoAdFailedToLoad', (e) => {
            console.warn('[Ads] AdMob rewarded failed to load:', e);
            _admRewardedLoaded = false;
        });
        adm.addListener('onRewardedVideoAdFailedToShow', (e) => {
            console.warn('[Ads] AdMob rewarded failed to show:', e);
            _admRewardedLoaded = false;
            _admPendingReward = null;
            _adBreakEnd();
            _admPreloadRewarded();
        });
        adm.addListener('onRewardedVideoAdReward', (reward) => {
            console.log('[Ads] AdMob rewarded → reward granted', reward);
            const cb = _admPendingReward;
            _admPendingReward = null;
            cb?.();
        });
        adm.addListener('onRewardedVideoAdDismissed', () => {
            _admRewardedLoaded = false;
            _admPendingReward = null;
            _adBreakEnd();
            _admPreloadRewarded();
        });
    }

    // ── CrazyGames muteAudio support ─────────────────────────────────────────
    function _applyCgMuteSettings(settings) {
        const s = settings || _cgGame()?.settings || {};
        const shouldMute = !!s.muteAudio;
        window._cgMuteAudio = shouldMute;
        if (shouldMute) {
            window.isMusicMuted = true;
            try { window.GameAudio?.bgmTheme?.pause?.(); } catch (e) {}
        } else {
            // Restore player's saved preference
            const saved = localStorage.getItem('chickenIdleMuted');
            window.isMusicMuted = saved === 'true';
        }
        console.log('[Ads] muteAudio:', shouldMute, '| isMusicMuted:', window.isMusicMuted);
    }

    // ── One-time setup — register audio hooks + reuse SDK init promise ───────
    function init({ onAdStart, onAdEnd } = {}) {
        _onAdStart = onAdStart || null;
        _onAdEnd   = onAdEnd   || null;

        // Reuse the promise started in index.html so SDK.init() is only called once.
        if (window._cgSdkReady) {
            _sdkReady = window._cgSdkReady;
            console.log('[Ads] init — reusing window._cgSdkReady');
        } else if (window.CrazyGames?.SDK) {
            _sdkReady = window.CrazyGames.SDK.init().catch(() => {});
            console.log('[Ads] init — called SDK.init() (fallback)');
        } else {
            // Local or mobile AdMob mode
        }

        // Apply muteAudio once SDK is ready, then listen for changes.
        _sdkRun(() => {
            _applyCgMuteSettings();
            try {
                _cgGame()?.addSettingsChangeListener?.(_applyCgMuteSettings);
            } catch (e) {}
        });

        // AdMob init (no-op if not on a native googleplay build — _adm() returns null).
        const adm = _adm();
        if (adm) {
            const _startAdm = () => {
                console.log('[Ads] init — AdMob plugin found, initializing');
                _admInitListeners(adm);
                adm.initialize({ initializeForTesting: _ADMOB_TEST_MODE }).then(() => {
                    _admPreloadRewarded();
                }).catch((e) => {
                    console.warn('[Ads] AdMob initialize failed:', e);
                });
            };

            // AppTrackingTransparency (ATT) for iOS compliance (§5.1.2)
            const isIos = window.Capacitor?.getPlatform?.() === 'ios';
            const att = window.Capacitor?.Plugins?.AppTrackingTransparency;
            const requestTracking = att?.requestTrackingAuthorization
                ? () => att.requestTrackingAuthorization()
                : (isIos && typeof adm?.requestTrackingAuthorization === 'function')
                    ? () => adm.requestTrackingAuthorization()
                    : null;

            if (requestTracking) {
                requestTracking().then(_startAdm).catch(_startAdm);
            } else {
                _startAdm();
            }
        }
    }

    // ── Platform accessors ───────────────────────────────────────────────────
    // SDK.game / SDK.ad / SDK.banner are getters that THROW if SDK isn't initialized.
    // Optional chaining (?.) doesn't catch throws, only null/undefined — so we wrap them.
    function _cgGame()   { try { return window.CrazyGames?.SDK?.game;   } catch (e) { return null; } }
    function _cgAd()     { try { return window.CrazyGames?.SDK?.ad;     } catch (e) { return null; } }
    function _cgBanner() { try { return window.CrazyGames?.SDK?.banner; } catch (e) { return null; } }

    // Runs fn after SDK init if on CrazyGames, otherwise runs it immediately.
    // Checks window._cgSdkReady as fallback in case GameAds.init() wasn't called yet.
    function _sdkRun(fn) {
        const p = _sdkReady || window._cgSdkReady || null;
        if (p) { p.then(fn); } else { fn(); }
    }

    function _logAdState(label) {
        console.log('[Ads]', label, '| _sdkReady:', !!(_sdkReady || window._cgSdkReady), '| _cgGame():', !!_cgGame(), '| _cgAd():', !!_cgAd());
    }

    // ── Internal ad-break helpers ────────────────────────────────────────────
    // Pauses the game loop and audio before any ad.
    function _adBreakStart() {
        window.isAdPaused = true;
        _onAdStart?.();
        gameplayStop();
    }

    // Resumes the game loop and audio after any ad.
    function _adBreakEnd() {
        window.isAdPaused = false;
        _onAdEnd?.();
        gameplayStart();
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────
    // Call when actual gameplay starts (player is in control).
    function gameplayStart() {
        console.log('[Ads] gameplayStart called');
        _sdkRun(() => {
            console.log('[Ads] gameplayStart → SDK ready, calling SDK.game.gameplayStart()');
            _cgGame()?.gameplayStart?.();
        });
        // AdMob hook: window.AdMob?.resume?.();
    }

    // Call when gameplay pauses (menus, overlays, ads, cutscenes).
    function gameplayStop() {
        console.log('[Ads] gameplayStop called');
        _sdkRun(() => {
            console.log('[Ads] gameplayStop → SDK ready, calling SDK.game.gameplayStop()');
            _cgGame()?.gameplayStop?.();
        });
        // AdMob hook: window.AdMob?.pause?.();
    }

    // ── Midgame (interstitial) ads ───────────────────────────────────────────
    // ponytail: interstitial / midgame ads removed; only rewarded ads active
    function requestMidgame() {}

    // ── Rewarded ads ─────────────────────────────────────────────────────────
    // Pauses + mutes the game, shows the ad, then rewards and resumes.
    // IMPORTANT: must be called synchronously from a user gesture (click).
    // _sdkRun() uses .then() which breaks the browser's user-gesture chain
    // and causes requestFullscreen to fail inside the CG SDK.
    // So we check _cgAd() synchronously first — if SDK is ready, call directly.
    function request(onReward) {
        if (window.isAdPaused) return;
        _logAdState('request (rewarded)');
        const adModule = _cgAd();
        if (adModule) {
            // SDK already ready — call directly in the user gesture context.
            console.log('[Ads] request → requesting rewarded ad (sync, gesture preserved)');
            _adBreakStart();
            adModule.requestAd('rewarded', {
                adStarted:  () => { console.log('[Ads] rewarded adStarted'); },
                adFinished: () => { console.log('[Ads] rewarded adFinished → reward granted'); _adBreakEnd(); onReward(); },
                adError:    (e) => { console.warn('[Ads] rewarded adError:', e); _adBreakEnd(); },
            });
            return;
        }

        // AdMob path (Android/Google Play). Unlike CrazyGames, showing a native
        // rewarded ad doesn't need the browser Fullscreen-API user-gesture chain,
        // so it's fine to prepare+show asynchronously here.
        const adm = _adm();
        if (adm) {
            _admPendingReward = onReward;
            if (_admRewardedLoaded) {
                // Ya estaba precargado — se muestra al instante, sin pausa de carga.
                console.log('[Ads] request → AdMob rewarded preloaded, showing now');
                _adBreakStart();
                adm.showRewardVideoAd().catch((e) => {
                    console.warn('[Ads] AdMob rewarded error:', e);
                    _admPendingReward = null;
                    _adBreakEnd();
                });
            } else {
                // Fallback poco común (aún no había terminado de precargar): se pide y
                // se muestra en cuanto llegue, como antes.
                console.log('[Ads] request → AdMob rewarded not preloaded, prepare+show');
                _adBreakStart();
                adm.prepareRewardVideoAd({ adId: _getRewardedAdId(), isTesting: _ADMOB_TEST_MODE })
                    .then(() => adm.showRewardVideoAd())
                    .catch((e) => {
                        console.warn('[Ads] AdMob rewarded error:', e);
                        _admPendingReward = null;
                        _adBreakEnd();
                    });
            }
            return;
        }

        // SDK not yet ready — fall back to stub (reward immediately).
        // Deferring via .then() here would lose the user gesture anyway.
        console.log('[Ads] request → SDK not ready, rewarding immediately (stub)');
        onReward();
    }

    // ── Leaderboards ─────────────────────────────────────────────────────────
    // Submit a numeric score. No-op on non-CG platforms.
    function saveScore(leaderboardName, score) {
        console.log('[Ads] saveScore:', leaderboardName, score);
        _sdkRun(() => {
            try {
                window.CrazyGames?.SDK?.leaderboard?.save(leaderboardName, score)
                    ?.catch?.((e) => { console.warn('[Ads] saveScore failed:', e); });
            } catch (e) { console.warn('[Ads] saveScore exception:', e); }
        });
        // AdMob: no leaderboard equivalent
    }

    // Show the leaderboard overlay.
    // SDK v3 does not expose a built-in showLeaderboard overlay — calls fallback() on all platforms.
    function showLeaderboard(leaderboardName, fallback) {
        fallback?.();
    }

    // ── Banner ads ───────────────────────────────────────────────────────────
    // ponytail: banner ads removed; only rewarded ads active
    function showBanner() {}
    function hideBanner() {}

    // ── Free-ad token pool (used for "ad-gated" shop items) ──────────────────
    function hasFree()       { return _freeAdsLeft > 0; }
    function consume()       { _freeAdsLeft = Math.max(0, _freeAdsLeft - 1); }
    function replenishFree() { _freeAdsLeft = Math.min(1, _freeAdsLeft + 1); }
    function freeLeft()      { return _freeAdsLeft; }

    return { init, gameplayStart, gameplayStop, request, requestMidgame, showBanner, hideBanner, saveScore, showLeaderboard, hasFree, consume, replenishFree, freeLeft };
})();
