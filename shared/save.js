// shared/save.js — Save/load hub for all platforms.
//
// Two isolated sessions:
//   Guest   → localStorage keys suffixed with _guest (only on CrazyGames). Cloud never touched.
//   Account → in-memory _memStore + SDK cloud. No localStorage writes.
//
// Auth changes handled by addAuthListener → location.reload().
// initAndLoad: guest calls onReady() immediately.
//              account waits for SDK, loads cloud → _memStore, calls onReady().

window.GameSave = (() => {

    const AUTH_FLAG      = '_cgLoggedIn'; // '1' when logged in
    const WIPE_FLAG      = '_cgWiped';    // sessionStorage: keys to delete from cloud on next init
    const NEXT_MODE_FLAG = '_cgNextMode'; // sessionStorage: {challenge, speedrun} to force after reload

    let _isLoggedIn = localStorage.getItem(AUTH_FLAG) === '1';
    let _memStore   = {};

    function _cgData() {
        try { return window.CrazyGames?.SDK?.data; } catch (e) { return null; }
    }

    // ── Write ─────────────────────────────────────────────────────────────────
    function save(key, data) {
        const json = JSON.stringify(data);
        if (_isLoggedIn) {
            _memStore[key] = json;
            const d = _cgData();
            if (d) {
                d.setItem(key, json)?.catch(err => console.warn('[Save] setItem failed:', key, err));
            } else {
                console.warn('[Save] _cgData() is null, save lost for key:', key);
            }
        } else {
            try { localStorage.setItem(key + '_guest', json); } catch (e) {}
        }
    }

    // ── Read JSON ─────────────────────────────────────────────────────────────
    function load(key) {
        try {
            const s = _isLoggedIn ? (_memStore[key] ?? null) : localStorage.getItem(key + '_guest');
            return s ? JSON.parse(s) : null;
        } catch (e) { return null; }
    }

    // ── Read raw string ───────────────────────────────────────────────────────
    function loadRaw(key) {
        return _isLoggedIn ? (_memStore[key] ?? null) : localStorage.getItem(key + '_guest');
    }

    // ── Save raw string ───────────────────────────────────────────────────────
    function saveRaw(key, value) {
        if (_isLoggedIn) {
            _memStore[key] = value;
            try { return _cgData()?.setItem(key, value)?.catch?.(() => {}) ?? Promise.resolve(); } catch (e) { return Promise.resolve(); }
        }
        try { localStorage.setItem(key + '_guest', value); } catch (e) {}
        return Promise.resolve();
    }

    // ── Remove ────────────────────────────────────────────────────────────────
    async function remove(key) {
        if (_isLoggedIn) {
            delete _memStore[key];
            try { await (_cgData()?.removeItem(key) ?? Promise.resolve()); } catch (e) {}
        } else {
            localStorage.removeItem(key + '_guest');
        }
    }

    // ── Clear all ─────────────────────────────────────────────────────────────
    async function clear() {
        if (_isLoggedIn) {
            _memStore = {};
            try { await (_cgData()?.clear() ?? Promise.resolve()); } catch (e) {}
        } else {
            Object.keys(localStorage)
                .filter(k => k.endsWith('_guest'))
                .forEach(k => localStorage.removeItem(k));
        }
    }

    // ── Push _memStore → SDK cloud (fire-and-forget, called every 10s) ────────
    // _SAVE_KEYS (script.js) lista las 22 claves de TODOS los modos (vanilla,
    // speedrun, adam, manual, endless, logros, PBs...) porque cloudPush no sabe
    // cuál se está jugando ahora — pero antes reescribía las 22 en cada tick
    // aunque solo una hubiera cambiado. _lastPushed recuerda el último valor
    // enviado por clave y solo llama a setItem() si de verdad cambió.
    const _lastPushed = {};
    function cloudPush(keys) {
        if (!_isLoggedIn) return;
        const cgData = _cgData();
        if (!cgData) return;
        for (const key of keys) {
            const raw = _memStore[key];
            if (raw == null) continue;
            if (_lastPushed[key] === raw) continue;
            _lastPushed[key] = raw;
            try { cgData.setItem(key, raw)?.catch?.(() => {}); } catch (e) {}
        }
    }

    // ── Mark keys to wipe from cloud on next init ─────────────────────────────
    function markWiped(keys) {
        sessionStorage.setItem(WIPE_FLAG, JSON.stringify(keys));
    }

    // ── Force-await a cloud write for a single key from _memStore ─────────────
    async function flushKey(key) {
        if (!_isLoggedIn) return;
        const raw = _memStore[key];
        if (raw == null) return;
        const cgData = _cgData();
        if (!cgData) return;
        try { await (cgData.setItem(key, raw) ?? Promise.resolve()); } catch (e) {}
    }

    // ── Store next mode in sessionStorage (survives redirect, no cloud timing) ─
    function markNextMode(challenge, speedrun) {
        sessionStorage.setItem(NEXT_MODE_FLAG, JSON.stringify({ challenge, speedrun }));
    }

    // Returns array of keys cleared from _memStore that must also be removed from cloud.
    function _applyNextMode() {
        const raw = sessionStorage.getItem(NEXT_MODE_FLAG);
        if (!raw) return [];
        sessionStorage.removeItem(NEXT_MODE_FLAG);
        const toDelete = [];
        try {
            const m = JSON.parse(raw);
            if ('challenge' in m) {
                if (m.challenge) _memStore['activeChallenge'] = m.challenge;
                else { delete _memStore['activeChallenge']; toDelete.push('activeChallenge'); }
                if (m.challenge === 'endless') _memStore['chickenIdleActiveSlot'] = 'endless';
                else { delete _memStore['chickenIdleActiveSlot']; toDelete.push('chickenIdleActiveSlot'); }
            }
            if ('speedrun' in m) {
                if (m.speedrun) _memStore['chickenIdleSpeedrun'] = 'true';
                else { delete _memStore['chickenIdleSpeedrun']; toDelete.push('chickenIdleSpeedrun'); }
            }
        } catch(_) {}
        return toDelete;
    }

    // Tope de espera del SDK de CrazyGames. Si no responde, se SIGUE SIN ÉL: el juego
    // funciona con localStorage (se pierde el guardado en la nube, pero se puede jugar).
    // Nunca debe bloquear el arranque por un servicio de terceros.
    const SDK_TIMEOUT_MS = 6000;

    // ── Wait until SDK is fully initialized and SDK.data is usable ───────────
    async function _waitForSDK() {
        // 1. Wait for window.CrazyGames.SDK to appear (may not be sync on some hosts).
        //    OJO: esto era un `while` INFINITO. Si el script del SDK no llegaba a cargar
        //    (red lenta, adblock, el ITP de Safari bloqueando el iframe de terceros), esta
        //    función NO VOLVÍA NUNCA → initAndLoad() no llamaba a onReady() → el juego se
        //    quedaba sin arrancar. Ahora tiene tope y sale por el camino de "invitado".
        const _t0 = Date.now();
        let _waitIter = 0;
        while (!window.CrazyGames?.SDK) {
            if (Date.now() - _t0 > SDK_TIMEOUT_MS) {
                console.warn('[Save] _waitForSDK: el SDK no apareció en ' + SDK_TIMEOUT_MS + 'ms — se sigue solo con localStorage');
                return null;   // null = sin nube; mismo camino que un invitado
            }
            if (_waitIter++ === 0) console.log('[Save] _waitForSDK: waiting for CrazyGames.SDK...');
            await new Promise(r => setTimeout(r, 100));
        }
        console.log('[Save] _waitForSDK: CrazyGames.SDK found');

        // 2. Call SDK.init() once; reuse the promise if already started.
        if (!window._cgSdkReady) {
            console.log('[Save] _waitForSDK: calling SDK.init() (not already started)');
            window._cgSdkReady = window.CrazyGames.SDK.init().catch(() => {});
        } else {
            console.log('[Save] _waitForSDK: reusing existing _cgSdkReady promise');
        }
        // init() tampoco garantiza resolver: si se cuelga, seguimos igual pasado el tope.
        await Promise.race([
            window._cgSdkReady,
            new Promise(r => setTimeout(r, SDK_TIMEOUT_MS))
        ]);
        console.log('[Save] _waitForSDK: SDK init resuelto (o vencido el tope)');

        // 3. Probe SDK.data — it may be null for guests or need a moment after init.
        //    Return null immediately if the module doesn't exist (guest user on CG).
        //    Retry only while the module exists but still reports "not initialized".
        for (let i = 0; i < 20; i++) {
            const d = _cgData();
            if (!d) { console.log('[Save] _waitForSDK: SDK.data is null — guest user'); return null; }
            try { await d.getItem('__ping__'); console.log('[Save] _waitForSDK: SDK.data ready (ping ok)'); return d; } catch (e) {
                if (!String(e?.message || e).includes('not initialized')) { console.log('[Save] _waitForSDK: SDK.data ready (non-init error)'); return d; }
                console.log('[Save] _waitForSDK: SDK.data not initialized yet, retry', i + 1);
            }
            await new Promise(r => setTimeout(r, 100));
        }
        console.warn('[Save] _waitForSDK: max retries reached');
        return _cgData();
    }

    // ── Migración desde el formato MUY viejo (pre-sufijo _guest) ────────────────
    // Versiones antiguas guardaban con la clave PELADA — p.ej.
    // localStorage["chickenIdleSave"], sin sufijo. load()/save()/loadRaw() de
    // ARRIBA SIEMPRE leen/escriben con sufijo "_guest" en cuanto _isLoggedIn es
    // false. Solo copia si el destino con sufijo TODAVÍA no existe, así que es
    // segura de ejecutar en cada carga (no pisa progreso nuevo ya migrado).
    //
    // SOLO CrazyGames: pedido explícito — en Galaxy/itch.io NO se recupera el
    // save viejo (esas builds arrancan siempre limpias); CrazyGames sí, porque ya
    // tiene en producción este mismo sistema de 4 slots + guest y depende de esta
    // migración para sus jugadores que vuelven.
    function _migrateLegacyUnsuffixedKeys(keys) {
        if (_isLoggedIn) return;
        if (window.GAME_MARKET !== 'crazygames') return;
        for (const key of keys) {
            try {
                const oldVal = localStorage.getItem(key);
                const newVal = localStorage.getItem(key + '_guest');
                if (oldVal != null && newVal == null) {
                    localStorage.setItem(key + '_guest', oldVal);
                    console.log('[Save] migrated legacy unsuffixed key →', key + '_guest');
                }
            } catch (e) {}
        }
    }

    // ── Init and load ─────────────────────────────────────────────────────────
    // Not on CrazyGames → onReady() immediately (pure localStorage guest).
    // Guest on CrazyGames → wait for SDK init, then onReady() (no cloud load).
    // Account on CrazyGames → wait for SDK, load cloud into _memStore, onReady().
    async function initAndLoad(keys, onReady) {
        _migrateLegacyUnsuffixedKeys(keys);
        console.log('[Save] initAndLoad start — CrazyGames present:', !!window.CrazyGames, '| _isLoggedIn:', _isLoggedIn);
        if (!window.CrazyGames) {
            // Sin el SDK de CrazyGames no hay forma de confirmar (ni de usar) un login
            // en la nube — si _isLoggedIn quedó a true por un flag viejo en localStorage
            // (p.ej. de una prueba anterior en este mismo origin), save()/load() seguirían
            // intentando la ruta de nube para siempre y CADA guardado se perdería en
            // silencio (_cgData() siempre null aquí). Se corrige antes de seguir.
            if (_isLoggedIn) {
                console.warn('[Save] initAndLoad — _isLoggedIn era true sin CrazyGames presente, se corrige a guest');
                _isLoggedIn = false;
                localStorage.removeItem(AUTH_FLAG);
            }
            console.log('[Save] initAndLoad — not CrazyGames, calling onReady() immediately');
            onReady();
            return;
        }

        // Always wait for SDK on CrazyGames — prevents "not initialized" errors
        // in gameplayStart/setupAuthListener called from the onReady() callback.
        const cgData = await _waitForSDK();
        console.log('[Save] initAndLoad — cgData present:', !!cgData, '| _isLoggedIn before cross-check:', _isLoggedIn);

        // Cross-check real login state from SDK in case the localStorage flag is stale
        // (e.g. first load before the auth-listener reload has a chance to fire).
        // This avoids saving to _guest when the user is actually logged in.
        if (!_isLoggedIn && cgData) {
            try {
                const sdkUser = await window.CrazyGames.SDK.user.getUser();
                console.log('[Save] initAndLoad — cross-check getUser():', sdkUser ? sdkUser.username : 'null (guest)');
                if (sdkUser) {
                    _isLoggedIn = true;
                    localStorage.setItem(AUTH_FLAG, '1');
                }
            } catch (_) { console.warn('[Save] initAndLoad — getUser() failed'); }
        }

        console.log('[Save] initAndLoad — _isLoggedIn after cross-check:', _isLoggedIn);
        if (!_isLoggedIn) {
            console.log('[Save] initAndLoad — guest user, calling onReady()');
            onReady();
            return;
        }

        if (!cgData) {
            // Logueado según el flag pero el SDK no entregó un módulo de datos usable
            // (timeout, red, etc.) — igual que arriba, sin esto el guardado se perdería
            // en silencio toda la sesión. Se cae a localStorage de invitado SOLO para
            // esta sesión (no se borra el flag: puede que el login siga siendo válido
            // y la próxima carga sí consiga el SDK).
            if (_isLoggedIn) console.warn('[Save] initAndLoad — cgData no disponible pese a _isLoggedIn, se usa guest solo esta sesión');
            _isLoggedIn = false;
            onReady();
            return;
        }

        // Handle wipe: delete flagged keys from cloud, keep the rest.
        const wipeRaw = sessionStorage.getItem(WIPE_FLAG);
        if (wipeRaw) {
            sessionStorage.removeItem(WIPE_FLAG);
            let wipeKeys;
            try { wipeKeys = JSON.parse(wipeRaw); } catch (_) { wipeKeys = keys; }
            const wipeSet = new Set(wipeKeys);
            for (const key of wipeKeys) {
                try { await cgData.removeItem(key); } catch (e) {}
            }
            // Load non-wiped keys (achievements, beaten flags, etc.) from cloud.
            for (const key of keys) {
                if (wipeSet.has(key)) continue;
                try {
                    const v = await cgData.getItem(key);
                    if (v != null) _memStore[key] = v;
                } catch (e) {}
            }
            for (const key of _applyNextMode()) {
                try { await cgData.removeItem(key); } catch (e) {}
            }
            onReady();
            return;
        }

        // Load everything from SDK cloud — cloud always wins.
        console.log('[Save] initAndLoad — loading cloud keys...');
        let _cloudHasData = false;
        for (const key of keys) {
            try {
                const v = await cgData.getItem(key);
                if (v != null) { _memStore[key] = v; _cloudHasData = true; }
            } catch (e) {}
        }
        console.log('[Save] initAndLoad — cloud load done, cloudHasData:', _cloudHasData);

        // First login ever: cloud is empty but guest localStorage may have progress.
        // Import it once and push to cloud so the player doesn't lose their save.
        // After this point _guest keys are never written (logged-in path skips them).
        if (!_cloudHasData) {
            console.log('[Save] initAndLoad — first login, migrating _guest localStorage → cloud');
            for (const key of keys) {
                const guestVal = localStorage.getItem(key + '_guest');
                if (guestVal != null) {
                    _memStore[key] = guestVal;
                    console.log('[Save] initAndLoad — migrating key:', key);
                    try { cgData.setItem(key, guestVal)?.catch?.(() => {}); } catch (e) {}
                }
            }
        }

        for (const key of _applyNextMode()) {
            try { await cgData.removeItem(key); } catch (e) {}
        }
        onReady();
    }

    // ── Auth change listener ──────────────────────────────────────────────────
    // Fires on login and logout. Reloads only when auth state actually changes.
    // Must wait for SDK init before accessing SDK.user (guest path calls this
    // synchronously, before the SDK has finished initializing).
    async function setupAuthListener() {
        if (!window.CrazyGames) return;
        await _waitForSDK();
        try {
            const sdkUser = window.CrazyGames?.SDK?.user;
            if (!sdkUser?.addAuthListener) return;
            sdkUser.addAuthListener((user) => {
                const nowLoggedIn = !!user;
                if (nowLoggedIn === _isLoggedIn) return; // no change, skip
                if (nowLoggedIn) localStorage.setItem(AUTH_FLAG, '1');
                else             localStorage.removeItem(AUTH_FLAG);
                location.reload();
            });
        } catch (e) {}
    }

    // ── Run fn after SDK is initialized (or immediately on non-CG platforms) ──
    function whenReady(fn) {
        if (!window.CrazyGames) { fn(); return; }
        _waitForSDK().then(() => fn());
    }

    return { save, load, loadRaw, saveRaw, remove, clear, cloudPush, flushKey, initAndLoad, setupAuthListener, whenReady, markWiped, markNextMode };
})();
