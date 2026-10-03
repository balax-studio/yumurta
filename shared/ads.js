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
    let _currentBannerId = null; // tracks which banner is active so ad-breaks can clear/restore it
    // Pick up the SDK promise set in index.html immediately at load time,
    // so _sdkRun defers correctly even before GameAds.init() is called.
    let _sdkReady        = window._cgSdkReady || null;

    // ── AdMob (Android & iOS) ────────────────────────────────────────────────
    const _ADMOB_BANNER_ID          = 'ca-app-pub-5090386339666109/8062105220';
    const _ADMOB_INTERSTITIAL_ID    = 'ca-app-pub-5090386339666109/4842211831';
    const _ADMOB_REWARDED_ID_ANDROID = 'ca-app-pub-2626843024156194/9307387605';
    const _ADMOB_REWARDED_ID_IOS     = 'ca-app-pub-2626843024156194/9778246614';

    function _getRewardedAdId() {
        return (window.Capacitor?.getPlatform?.() === 'ios')
            ? _ADMOB_REWARDED_ID_IOS
            : _ADMOB_REWARDED_ID_ANDROID;
    }
    // Pon esto a `true` SOLO en tu propio dispositivo mientras pruebas antes de
    // publicar — sirve anuncios de test reales en vez de producción (evita que
    // tus propios clics/impresiones de prueba cuenten como tráfico inválido).
    const _ADMOB_TEST_MODE = false;

    let _admListenersReady = false;
    let _admInterstitialLoaded = false;
    let _admInterstitialLoading = false;
    let _admRewardedLoaded = false;
    let _admRewardedLoading = false;
    let _admPendingReward = null;

    // window.Capacitor solo existe dentro de la app nativa empaquetada (Capacitor
    // lo inyecta en el WebView antes de que cargue esta página) — nunca en el
    // navegador de escritorio ni en el build web/CrazyGames.
    function _adm() {
        try {
            if (!window.Capacitor?.isNativePlatform?.()) return null;
            return window.Capacitor.Plugins?.AdMob || null;
        } catch (e) { return null; }
    }

    // Precarga en segundo plano, SIN pausar el juego — así cuando el jugador
    // pide ver un anuncio, ya está listo y se muestra al instante en vez de
    // dejar el juego en pausa mientras AdMob lo descarga. Se llama al iniciar
    // y se vuelve a llamar tras cada anuncio (dismissed/failed) para rellenar
    // la "reserva" de cara a la siguiente vez.
    function _admPreloadInterstitial() {
        const adm = _adm();
        if (!adm || _admInterstitialLoaded || _admInterstitialLoading) return;
        _admInterstitialLoading = true;
        adm.prepareInterstitial({ adId: _ADMOB_INTERSTITIAL_ID, isTesting: _ADMOB_TEST_MODE })
            .catch((e) => console.warn('[Ads] AdMob interstitial preload failed:', e))
            .finally(() => { _admInterstitialLoading = false; });
    }
    function _admPreloadRewarded() {
        const adm = _adm();
        if (!adm || _admRewardedLoaded || _admRewardedLoading) return;
        _admRewardedLoading = true;
        adm.prepareRewardVideoAd({ adId: _getRewardedAdId(), isTesting: _ADMOB_TEST_MODE })
            .catch((e) => console.warn('[Ads] AdMob rewarded preload failed:', e))
            .finally(() => { _admRewardedLoading = false; });
    }

    // Listeners registrados UNA sola vez (no en cada request) — cada evento
    // ajusta el estado interno y, si aplica, cierra el "ad-break" (reanuda
    // juego/audio) igual que hace el flujo de CrazyGames.
    function _admInitListeners(adm) {
        if (_admListenersReady) return;
        _admListenersReady = true;

        adm.addListener('interstitialAdLoaded', () => { _admInterstitialLoaded = true; });
        adm.addListener('interstitialAdFailedToLoad', (e) => {
            console.warn('[Ads] AdMob interstitial failed to load:', e);
            _admInterstitialLoaded = false;
        });
        adm.addListener('interstitialAdFailedToShow', (e) => {
            console.warn('[Ads] AdMob interstitial failed to show:', e);
            _admInterstitialLoaded = false;
            _adBreakEnd();
            _admPreloadInterstitial();
        });
        adm.addListener('interstitialAdDismissed', () => {
            _admInterstitialLoaded = false;
            _adBreakEnd();
            _admPreloadInterstitial();
        });

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
            _adBreakEnd();
            _admPreloadRewarded();
        });
    }

    // ── Banner position ──────────────────────────────────────────────────────
    // Change ONLY this line to move the banner top ↔ bottom.
    const _BANNER_POSITION = 'top'; // 'top' | 'bottom'

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
            console.warn('[Ads] init — no CrazyGames SDK found, ads will be stubs');
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
                    // Precarga ambos formatos desde ya para que estén listos cuando se pidan.
                    _admPreloadInterstitial();
                    _admPreloadRewarded();
                }).catch((e) => {
                    console.warn('[Ads] AdMob initialize failed:', e);
                });
            };

            // AppTrackingTransparency (ATT) for iOS compliance (§5.1.2)
            const att = window.Capacitor?.Plugins?.AppTrackingTransparency;
            if (att?.requestTrackingAuthorization) {
                att.requestTrackingAuthorization().then(_startAdm).catch(_startAdm);
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
        // Clear banner during ads (required by CrazyGames — no banner on top of ad)
        if (_currentBannerId) {
            try { _cgBanner()?.clearBanner?.(_currentBannerId); } catch (e) {}
        }
    }

    // Resumes the game loop and audio after any ad.
    function _adBreakEnd() {
        window.isAdPaused = false;
        _onAdEnd?.();
        gameplayStart();
        // Re-request banner after ad ends. Pequeño respiro antes de repedirlo:
        // justo al cerrarse el anuncio, el overlay del SDK puede seguir un
        // instante en el DOM/mid-transición, y el propio SDK comprobaba la
        // visibilidad del contenedor EN ESE momento → "notVisible" en un
        // contenedor que en realidad está bien (confirmado con log real de
        // CrazyGames: BannerError notVisible justo tras un midgame).
        if (_currentBannerId) setTimeout(() => _requestBannerNow(_currentBannerId), 500);
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
    // Called automatically on a timer. Pauses the game for the ad duration.
    function requestMidgame() {
        _logAdState('requestMidgame');
        _sdkRun(() => {
            if (!_cgAd()) { console.warn('[Ads] requestMidgame — no _cgAd(), skipping'); return; }
            console.log('[Ads] requestMidgame → requesting midgame ad');
            _adBreakStart();
            _cgAd().requestAd('midgame', {
                adStarted:  () => { console.log('[Ads] midgame adStarted'); },
                adFinished: () => { console.log('[Ads] midgame adFinished'); _adBreakEnd(); },
                adError:    (e) => { console.warn('[Ads] midgame adError:', e); _adBreakEnd(); },
            });
        });

        // _sdkRun() above runs synchronously when there's no CrazyGames SDK promise
        // (see _sdkRun), so by this point _cgAd() already reflects reality.
        const adm = _adm();
        if (!_cgAd() && adm) {
            if (_admInterstitialLoaded) {
                // Ya estaba precargado — se muestra al instante, sin pausa de carga.
                console.log('[Ads] requestMidgame → AdMob interstitial preloaded, showing now');
                _adBreakStart();
                adm.showInterstitial().catch((e) => {
                    console.warn('[Ads] AdMob interstitial error:', e);
                    _adBreakEnd();
                });
            } else {
                // Fallback poco común (aún no había terminado de precargar): se pide y
                // se muestra en cuanto llegue, como antes.
                console.log('[Ads] requestMidgame → AdMob interstitial not preloaded, prepare+show');
                _adBreakStart();
                adm.prepareInterstitial({ adId: _ADMOB_INTERSTITIAL_ID, isTesting: _ADMOB_TEST_MODE })
                    .then(() => adm.showInterstitial())
                    .catch((e) => {
                        console.warn('[Ads] AdMob interstitial error:', e);
                        _adBreakEnd();
                    });
            }
        }
    }

    // ── Rewarded ads ─────────────────────────────────────────────────────────
    // Pauses + mutes the game, shows the ad, then rewards and resumes.
    // IMPORTANT: must be called synchronously from a user gesture (click).
    // _sdkRun() uses .then() which breaks the browser's user-gesture chain
    // and causes requestFullscreen to fail inside the CG SDK.
    // So we check _cgAd() synchronously first — if SDK is ready, call directly.
    function request(onReward) {
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
    // containerId: id del div reservado en el HTML para el banner (e.g. 'game-banner').
    // Platform routing:
    //   CrazyGames → SDK.banner.requestBanner() inyecta el banner en el div.
    //   AdMob      → descomenta el hook AdMob; el div actúa como placeholder de espacio.
    //
    // Solo se muestra en pantallas con ratio > 1.78 (más altas que 16:9 — a 16:9
    // o menos no cabe). En esas pantallas el hueco no se reserva — el canvas
    // recibe el 100% del espacio.

    let _bannerInterval = null;

    // CrazyGames rechaza requestBanner() con "bannerCooldown" si se pide dos
    // veces para el mismo contenedor en menos de 30s (confirmado con log real:
    // "A banner has already been requested for container ... less than 30
    // seconds ago"). _syncBannerToGameState puede disparar una petición nueva
    // sin que haga falta — p.ej. al cambiar de reto, CinematicCore.reset()
    // toca la clase body.in-game (aunque nunca se sale realmente de partida),
    // y eso reengancha showBanner() sobre un banner que ya estaba bien puesto.
    // Guardamos cuándo se pidió cada contenedor por última vez para no volver
    // a pedirlo antes de que el propio SDK vaya a aceptarlo — así se evita el
    // rechazo en vez de intentar sortearlo a reintentos cortos (30s no se
    // arregla reintentando cada 400ms).
    const _lastBannerRequestTs = {};
    const _BANNER_COOLDOWN_MS = 30000;

    // "bannersDisabledMobileApp" (confirmado en la documentación oficial:
    // docs.crazygames.com/sdk/banners/ → Errors) — cuando el juego corre
    // DENTRO de la app móvil de CrazyGames (no en su web/navegador), los
    // banners están deshabilitados por diseño de la plataforma, sin
    // excepción; no es un error transitorio ni algo que un reintento vaya a
    // arreglar. rewarded/midgame sí funcionan ahí con normalidad. Una vez se
    // confirma este error para un contenedor, se deja de pedir banner para
    // él el resto de la sesión y se oculta — sin esto se quedaba reintentando
    // cada 35s para siempre y, si se llegaba a mostrar el contenedor vacío,
    // dejaba una franja negra sin usar ocupando espacio en la app.
    const _bannerDisabledPermanently = {};

    // CrazyGames exige width/height explícitos en requestBanner() — sin ellos
    // el SDK falla con "undefinedxundefined is not a valid size" (visto en
    // producción: el hueco del banner se quedaba vacío sin ningún error en
    // nuestra consola, solo en la de CrazyGames). game-banner (portrait, tira
    // horizontal arriba) y desktop-banner (franja de 50px de alto en el
    // topbar) usan el tamaño IAB estándar más cercano a su alto real.
    const _BANNER_SIZES = {
        'game-banner':    { width: 320, height: 50 },
        'desktop-banner': { width: 320, height: 50 },
    };

    // _retriesLeft: SDK.banner es un getter que ya no throwea una vez _sdkRun
    // esperó a _cgSdkReady — pero (igual que SDK.data, ver _waitForSDK en
    // shared/save.js) puede seguir rechazando con "not initialized" durante un
    // instante justo después de que SDK.init() resuelva, antes de estar
    // REALMENTE listo. Antes esto se perdía en silencio hasta el siguiente
    // refresco de 35s (o para siempre, si esos 35s nunca llegaban a probarse) —
    // probable causa de "container not available" al revisar el banner recién
    // entrado en partida. Reintenta unas pocas veces con una espera corta,
    // mismo patrón ya probado para SDK.data.
    function _requestBannerNow(containerId, _retriesLeft) {
        const _isFreshCall = _retriesLeft === undefined;
        if (_retriesLeft === undefined) _retriesLeft = 15;

        if (_bannerDisabledPermanently[containerId]) return;

        // Solo se aplica en la llamada "fresca" (no en los propios reintentos
        // de esta función, que ya manejan su error específico aparte) — evita
        // pedir un banner que el SDK va a rechazar de todos modos por
        // "bannerCooldown" (ver _lastBannerRequestTs arriba). El banner que ya
        // está puesto se deja tal cual en vez de tocarlo sin necesidad.
        if (_isFreshCall) {
            const _elapsed = Date.now() - (_lastBannerRequestTs[containerId] || 0);
            if (_elapsed < _BANNER_COOLDOWN_MS) {
                console.log('[Ads] requestBanner: en cooldown (' + Math.ceil((_BANNER_COOLDOWN_MS - _elapsed) / 1000) + 's), se omite —', containerId);
                return;
            }
        }

        _sdkRun(() => {
            const b = _cgBanner();
            if (b) {
                const size = _BANNER_SIZES[containerId] || { width: 320, height: 50 };
                console.log('[Ads] requestBanner:', containerId, size);
                _lastBannerRequestTs[containerId] = Date.now();
                // El SDK v3 espera la clave "id" (confirmado en la documentación
                // oficial: requestBanner({ id, width, height })) — el intento
                // anterior con "containerId" (creyendo que era la clave correcta
                // tras cambiarla desde "bannerId") seguía siendo el nombre
                // equivocado: el SDK no lo reconoce, lee su propio "id" interno
                // como undefined, y construye el contenedor que busca como
                // "undefined-crazygames-inner" — que nunca existe. Confirmado con
                // el log real de CrazyGames: id: 'undefined-crazygames-inner' y
                // "ContainerId: undefined" pese a que SÍ mandábamos el div correcto.
                const req = b.requestBanner({ id: containerId, width: size.width, height: size.height });
                req?.catch?.(e => {
                    const _msg = String(e?.message || e);
                    if (e?.code === 'bannersDisabledMobileApp' || _msg.includes('bannersDisabledMobileApp')) {
                        console.log('[Ads] banner deshabilitado por la plataforma (app móvil de CrazyGames) — no se reintenta más esta sesión:', containerId);
                        _bannerDisabledPermanently[containerId] = true;
                        clearInterval(_bannerInterval);
                        _bannerInterval = null;
                        const _elDisabled = document.getElementById(containerId);
                        if (_elDisabled) _elDisabled.style.display = 'none';
                        return;
                    }
                    // "bannerCooldown": el SDK rechaza por su propio límite de 30s —
                    // reintentar a los 400ms es inútil (va a fallar igual toda la
                    // ventana de reintentos). Se deja pasar: el guard de arriba evita
                    // que vuelva a pasar por nuestra propia culpa, y si aun así llega
                    // aquí (otro disparador fuera de nuestro control), el refresco
                    // periódico de 35s ya lo recogerá cuando el cooldown expire.
                    if (_msg.includes('bannerCooldown') || _msg.includes('already been requested')) {
                        console.warn('[Ads] banner error (cooldown del SDK, no se reintenta a corto plazo):', e);
                        return;
                    }
                    // "not initialized" (SDK.banner aún no listo) y "notVisible" (el
                    // contenedor no se ve como "entero" en el instante exacto del
                    // chequeo — típico justo tras cerrarse un midgame, o durante una
                    // transición) son ambos transitorios: mismo reintento para los
                    // dos. Antes solo cubría "not initialized" y un "notVisible" se
                    // abandonaba sin más, dejando el banner caído hasta el próximo
                    // refresco de 35s — y si ESE también caía en mal momento, se
                    // quedaba caído indefinidamente.
                    if (_retriesLeft > 0 && (_msg.includes('not initialized') || _msg.includes('notVisible') || _msg.includes('not entirely visible'))) {
                        console.log('[Ads] requestBanner: retry (' + _msg + ')', 15 - _retriesLeft + 1);
                        // Limpiar antes de reintentar: un requestBanner repetido sobre
                        // el mismo id sin clearBanner de por medio puede quedarse
                        // pegado al primer intento fallido en vez de crear uno nuevo.
                        try { b.clearBanner?.(containerId); } catch (_) {}
                        setTimeout(() => _requestBannerNow(containerId, _retriesLeft - 1), 400);
                    } else {
                        console.warn('[Ads] banner error:', e);
                    }
                });
                return;
            }
            // _cgBanner() devolvió null pese a que _sdkRun ya esperó _cgSdkReady —
            // el módulo banner puede tardar un pelín más en poblarse tras init().
            if (_retriesLeft > 0 && window.CrazyGames?.SDK) {
                setTimeout(() => _requestBannerNow(containerId, _retriesLeft - 1), 150);
            }
        });

        // AdMob: el banner es un overlay NATIVO por encima del WebView — no se
        // dibuja dentro del <div>, así que el contenedor solo sirve para reservar
        // el hueco de layout (ver showBanner()/CSS) mientras el SDK pinta encima.
        const adm = _adm();
        if (!_cgBanner() && adm) {
            adm.showBanner({
                adId: _ADMOB_BANNER_ID,
                adSize: 'ADAPTIVE_BANNER',
                position: _BANNER_POSITION === 'top' ? 'TOP_CENTER' : 'BOTTOM_CENTER',
                isTesting: _ADMOB_TEST_MODE,
            }).catch((e) => console.warn('[Ads] AdMob banner error:', e));
        }
    }

    function showBanner(containerId) {
        // Quitada del todo la gate de aspect-ratio que había aquí (primero 1.78,
        // luego bajada a 1.3 — ninguna de las dos bastaba: seguía sin cargar en
        // móvil real de CrazyGames, "sí rewarded/midgame, banner de arriba no").
        // window.GAME_MODE ya solo vale 'game-banner' cuando GAME_MODE==='portrait'
        // (shared/responsive.js: h > w), así que el ratio real ya es > 1.0 antes
        // de llegar aquí; y la franja portrait es una tira fija de 50px (ver
        // portrait.css body.mode-portrait #game-banner) que cabe en cualquier
        // viewport portrait real sin necesitar ningún margen extra de aspect-ratio.
        _currentBannerId = containerId;
        const el = document.getElementById(containerId);
        if (!el) return;
        el.classList.toggle('banner-bottom', _BANNER_POSITION === 'bottom');
        el.style.display = 'flex';
        _requestBannerNow(containerId);
        // Refrescar cada 35 s (requisito CrazyGames)
        clearInterval(_bannerInterval);
        _bannerInterval = setInterval(() => _requestBannerNow(containerId), 35000);
    }

    function hideBanner(containerId) {
        clearInterval(_bannerInterval);
        _bannerInterval = null;
        const el = document.getElementById(containerId);
        if (el) el.style.display = 'none';
        const b = _cgBanner();
        if (b) { b.clearBanner?.(containerId)?.catch?.(() => {}); return; }
        const adm = _adm();
        if (adm) adm.removeBanner().catch(() => {});
    }

    // ── Free-ad token pool (used for "ad-gated" shop items) ──────────────────
    function hasFree()       { return _freeAdsLeft > 0; }
    function consume()       { _freeAdsLeft = Math.max(0, _freeAdsLeft - 1); }
    function replenishFree() { _freeAdsLeft = Math.min(1, _freeAdsLeft + 1); }
    function freeLeft()      { return _freeAdsLeft; }

    return { init, gameplayStart, gameplayStop, request, requestMidgame, showBanner, hideBanner, saveScore, showLeaderboard, hasFree, consume, replenishFree, freeLeft };
})();
