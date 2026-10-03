// shared/intro.js — Title screen animal animation
window.GameIntro = (() => {
    const HEN_SRCS = [
        'pixelart_design/chicken_white.png',
        'pixelart_design/chicken_beige.png',
        'pixelart_design/chicken_brown.png',
        'pixelart_design/chicken_black.png',
    ];
    const CHICK_SRC   = 'pixelart_design/chick.png';
    const ROOSTER_SRC = 'pixelart_design/rooster.png';

    // Timing constants matching game's 942.47 ms cycle
    const CYCLE    = 942.47;
    const MS8      = CYCLE / 8;   // ms per frame — 8-frame animations
    const MS4      = CYCLE / 4;   // ms per frame — 4-frame animations
    const WAKE_DUR = 0.471235;    // wake animation duration (seconds)

    // Layout — Option B: intro-pan-container is 1920×2229px reference space.
    const W_CONT = 1920;

    // Zone (% from container bottom / % from container left). Updated by _computeZone().
    var _zone = { xMin: 3, xMax: 90, yMin: 28, yMax: 42 };
    var _zone2 = null;            // portrait: second zone above the logo (null = inactive)
    var _portraitTwoZones = false; // enabled once logo lands in portrait mode
    var _zoneReady    = false;
    var _currentPanPx = 0;  // set by index.html via setCurrentPan() so _computeZone is accurate
    var _zoneFloor    = null; // when non-null, yMin is clamped to at least this % (used when mode row is visible)

    // Mouse tracking — #mm-home (z-index:1) blocks mouseenter on animal divs.
    var _mouseX = -9999, _mouseY = -9999;
    function _trackMouse(e) { _mouseX = e.clientX; _mouseY = e.clientY; }

    // Collision rects in container-% coords (y = % from container bottom)
    var _logoRect  = null;
    var _crateRect = null;

    // F6 debug overlays: green = walk zone (Z1/Z2), red = logo collider, orange = crate collider, yellow = animal boxes
    var _debugZone       = false;
    var _debugEl         = null;   // green: lower zone (Z2 in portrait, or single zone in desktop)
    var _debugZone2El    = null;   // cyan:  upper zone (Z1 in portrait only)
    var _debugColliderEl = null;   // red logo collider rect
    var _debugCrateEl    = null;   // orange crate collider rect
    function _onKeyDown(e) {
        if (!window.DEBUG) return;
        if (e.key !== 'F6') return;
        e.preventDefault();
        _debugZone = !_debugZone;
        if (_debugEl)         _debugEl.style.display         = _debugZone ? 'block' : 'none';
        if (_debugZone2El)    _debugZone2El.style.display    = (_debugZone && _zone2) ? 'block' : 'none';
        if (_debugColliderEl) _debugColliderEl.style.display = _debugZone ? 'block' : 'none';
        if (_debugCrateEl)    _debugCrateEl.style.display    = _debugZone ? 'block' : 'none';
        if (_eggDebugEl)      _eggDebugEl.style.display      = _debugZone ? 'block' : 'none';
        _states.forEach(function(s){ if (s._dbEl) s._dbEl.style.display = _debugZone ? 'block' : 'none'; });
    }

    let _root   = null;
    let _contEl = null;
    let _states = [];
    let _rafId  = null;
    let _lastT  = 0;

    // ── Easter egg: wake counter ─────────────────────────────────────────────────
    var _eggWakeTotal  = 0;     // global wake counter (shared across all animals)
    var _eggFlying     = false; // true when exodus triggered
    var _eggDebugEl    = null;  // debug HUD element
    var _logoWakeTime  = 0;     // timestamp of last logo-impact wake — grace window
    var _walkerState   = null;  // walking hen diplomat during exile
    var _activeBubbles = [];    // [{el, target}] — milestone bubbles that follow their hen

    function _t(key) { return (window.t && window.t(key)) || key; }
    function _tf(key, n) { return _t(key).replace('{n}', n); }

    function _sfx(sfxKey, vol, throttle) {
        var ga = window.GameAudio;
        if (!ga || !ga[sfxKey]) return;
        ga.playSound(ga[sfxKey], vol || 0.5, throttle || 100);
    }

    // Row of the angry hen walk sprite. Confirm with user which row is correct.
    // Current guess: row 5. Set to -1 to disable and fall back to normal walk row 1.
    var _HEN_ANGRY_WALK_ROW = 5;

    var _EGG_EXILE_KEY   = 'tme_egg_exile';
    var _EGG_OFFENSE_KEY = 'tme_egg_offense';
    var _EGG_WAKE_KEY    = 'tme_egg_wakes';
    var _EGG_MSG_KEY     = 'tme_egg_msgidx';

    function _gs()            { return window.GameSave || null; }
    function _rawSave(k, v)   { var gs = _gs(); if (gs && gs.saveRaw) { gs.saveRaw(k, v); } else { try { localStorage.setItem(k, v); } catch(e) {} } }
    function _rawLoad(k)      { var gs = _gs(); if (gs && gs.loadRaw) { return gs.loadRaw(k); } try { return localStorage.getItem(k); } catch(e) { return null; } }
    function _rawRemove(k)    { var gs = _gs(); if (gs && gs.remove) { gs.remove(k); } else { try { localStorage.removeItem(k); } catch(e) {} } }
    function _saveExile()     { _rawSave(_EGG_EXILE_KEY, '1'); }
    function _clearExile()    { _rawRemove(_EGG_EXILE_KEY); }
    function _isExiled()      { return !!_rawLoad(_EGG_EXILE_KEY); }
    function _getOffense()    { return parseInt(_rawLoad(_EGG_OFFENSE_KEY), 10) || 0; }
    function _incOffense()    { _rawSave(_EGG_OFFENSE_KEY, String(_getOffense() + 1)); }
    function _saveWakeTotal() { _rawSave(_EGG_WAKE_KEY, String(_eggWakeTotal)); }
    function _loadWakeTotal() { return parseInt(_rawLoad(_EGG_WAKE_KEY), 10) || 0; }
    function _clearWakeTotal(){ _rawRemove(_EGG_WAKE_KEY); }
    function _saveMsgIdx(i)   { _rawSave(_EGG_MSG_KEY, String(i)); }
    function _loadMsgIdx()    { return parseInt(_rawLoad(_EGG_MSG_KEY), 10) || 0; }
    function _clearMsgIdx()   { _rawRemove(_EGG_MSG_KEY); }

    // ── Helper: read game stats from save (null if no save exists) ───────────────
    function _getPlayStats() {
        try {
            var gs = window.GameSave;
            if (!gs || !gs.load) return null;
            var lastMode = null;
            try { lastMode = localStorage.getItem('lastPlayedChallenge'); } catch(e) {}
            var keyMap = {
                vanilla: 'chickenIdleSave', speedrun: 'chickenIdleSave_speedrun',
                adam: 'chickenIdleSave_adam', manual: 'chickenIdleSave_manual',
                endless: 'chickenIdleEndlessSave'
            };
            var key = (lastMode && keyMap[lastMode]) || 'chickenIdleSave';
            var d = gs.load(key) || gs.load('chickenIdleEndlessSave') || gs.load('chickenIdleSave');
            if (!d || !d.state) return null;
            return {
                playTime:  Math.floor((d.state.playTime  || 0) / 60), // minutes
                chickens:  d.state.purchasedChickens || d.state.chickens || 0,
                earnings:  d.state.totalEarnings || d.state.money || 0
            };
        } catch(e) { return null; }
    }

    // ── Walker hen messages (shown one per click, some dynamic) ──────────────────
    var _WALKER_MSGS = [
        function() { return _t('eggW1'); },
        function() { return _t('eggW2'); },
        function() { return _t('eggW3'); },
        function() { return _t('eggW4'); },
        function() {
            var s = _getPlayStats();
            if (!s || s.chickens < 1) return _t('eggW5a');
            return _tf('eggW5b', s.chickens);
        },
        function() {
            var s = _getPlayStats();
            if (!s || s.playTime < 5) return _t('eggW6a');
            return _tf('eggW6b', s.playTime);
        },
        function() { return _t('eggW7'); },
        function() { return _t('eggW8'); },
        function() { return _t('eggW9'); },
        function() { return _t('eggW10'); },
    ];

    // ── Milestone bubbles — follow their target hen every frame ──────────────────
    function _positionBubble(entry) {
        var bub = entry.el;
        if (!bub || !bub.parentNode) return;
        var s = (entry.target && entry.target.el) ? entry.target : null;
        if (!s) {
            for (var k = 0; k < _states.length; k++) {
                if (_states[k].action === 'waking' && _states[k].el) { s = _states[k]; break; }
            }
        }
        if (!s) {
            for (var k = 0; k < _states.length; k++) {
                if (_states[k].action !== 'flyaway' && _states[k].el) { s = _states[k]; break; }
            }
        }
        if (s && s.el) {
            var ar = s.el.getBoundingClientRect();
            if (ar.width && ar.height) {
                var _bw = bub.offsetWidth  || 120;
                var _bh = bub.offsetHeight || 70;
                bub.style.left = Math.max(4, Math.min(ar.left + ar.width / 2 - _bw / 2, window.innerWidth  - _bw - 4)) + 'px';
                bub.style.top  = Math.max(4, Math.min(ar.top  - _bh - 14,                window.innerHeight - _bh - 4)) + 'px';
                return;
            }
        }
        bub.style.left = (window.innerWidth / 2 - (bub.offsetWidth || 120) / 2) + 'px';
        bub.style.top  = Math.max(4, Math.min(window.innerHeight * 0.45, window.innerHeight - (bub.offsetHeight || 70) - 4)) + 'px';
    }

    function _showMilestoneBubble(text, target) {
        var bub = document.createElement('div');
        bub.style.cssText =
            'position:fixed;z-index:99998;pointer-events:none;' +
            'font-family:\'Press Start 2P\',cursive;font-size:8px;color:#222;' +
            'background:#fff;border:3px solid #333;border-radius:4px;' +
            'box-shadow:3px 3px 0 #333;overflow:visible;box-sizing:border-box;' +
            'padding:6px 10px;white-space:pre;line-height:1.7;text-align:center;' +
            'opacity:1;transition:opacity 0.4s;';
        bub.textContent = text;
        var ar1 = document.createElement('div');
        ar1.style.cssText = 'position:absolute;bottom:-11px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:11px solid #333;';
        var ar2 = document.createElement('div');
        ar2.style.cssText = 'position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #fff;';
        bub.appendChild(ar1); bub.appendChild(ar2);
        document.body.appendChild(bub);

        var entry = { el: bub, target: target || null };
        _activeBubbles.push(entry);
        requestAnimationFrame(function() { _positionBubble(entry); });

        setTimeout(function() {
            bub.style.opacity = '0';
            setTimeout(function() {
                if (bub.parentNode) bub.parentNode.removeChild(bub);
                var idx = _activeBubbles.indexOf(entry);
                if (idx >= 0) _activeBubbles.splice(idx, 1);
            }, 500);
        }, 3500);
    }

    // ── Diplomatic walker hen ────────────────────────────────────────────────────
    // Enters from right, walks randomly for 5 s (AI-style), stops with speech bubble.
    // Click → walks randomly 5 s again → next message. 10 messages total.
    // After last click → walks off left → all animals return.
    function _showWalkerChicken() {
        if (_walkerState) return;
        if (!_root) return;

        var zy  = (_zone.yMin + _zone.yMax) / 2;
        var src = HEN_SRCS[Math.floor(Math.random() * HEN_SRCS.length)];
        var sz  = 128;

        var el = document.createElement('div');
        el.style.cssText =
            'position:absolute;overflow:visible;image-rendering:pixelated;' +
            'cursor:pointer;user-select:none;transform-origin:center bottom;' +
            'width:' + sz + 'px;height:' + sz + 'px;' +
            'background-image:url(' + src + ');background-repeat:no-repeat;' +
            'background-size:' + (sz * 8) + 'px auto;';

        var bub = document.createElement('div');
        bub.style.cssText =
            'position:fixed;z-index:99998;pointer-events:none;display:none;' +
            'font-family:\'Press Start 2P\',cursive;font-size:8px;color:#222;' +
            'background:#fff;border:3px solid #333;border-radius:4px;' +
            'box-shadow:3px 3px 0 #333;overflow:visible;box-sizing:border-box;' +
            'padding:6px 10px;white-space:pre;line-height:1.7;text-align:center;';
        // Text node in a span so setting textContent never destroys the arrow divs
        var _wText = document.createElement('span');
        _wText.style.cssText = 'white-space:pre;';
        bub.appendChild(_wText);
        // CSS arrow pointing down toward the walker hen
        var _wAr1 = document.createElement('div');
        _wAr1.style.cssText = 'position:absolute;bottom:-11px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:11px solid #333;';
        var _wAr2 = document.createElement('div');
        _wAr2.style.cssText = 'position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #fff;';
        bub.appendChild(_wAr1); bub.appendChild(_wAr2);
        document.body.appendChild(bub);

        // States: 'entering' | 'walking' | 'stopped' | 'leaving'
        var ws = {
            el: el, bub: bub, bubText: _wText,
            msgIdx:   _loadMsgIdx(),
            x:        112,
            y:        zy,
            vx:       -14,
            vy:       0,
            dir:      -1,
            state:    'entering',
            walkTimer:  0,
            dirTimer:   0,
            phase:    Math.random() * CYCLE,
            _nextCokAt: Date.now() + 2000 + Math.random() * 2000,
        };
        _walkerState = ws;

        el.style.left   = ws.x + '%';
        el.style.bottom = ws.y + '%';
        _root.appendChild(el);

        function _onClick() {
            var _ws = _walkerState;
            if (!_ws || _ws.state !== 'stopped') return;
            window.GameAudio && window.GameAudio.playRandomCok();
            _ws.msgIdx++;
            _saveMsgIdx(_ws.msgIdx);
            _ws.bub.style.display = 'none';
            if (_ws.msgIdx >= _WALKER_MSGS.length) {
                _ws.state = 'leaving';
                _ws.vx = -14; _ws.vy = 0; _ws.dir = -1;
            } else {
                _ws.state     = 'walking';
                _ws.walkTimer = 5;
                _ws.dirTimer  = 0;
                _ws._nextCokAt = Date.now() + 1500 + Math.random() * 2000;
            }
        }
        el.addEventListener('click', _onClick);
        el.addEventListener('touchend', function(e) { e.preventDefault(); _onClick(); });
    }

    // Called every frame from _tick
    function _tickWalker(dt, t) {
        var ws = _walkerState;
        if (!ws) return;

        var xHi = _zone.xMax - 128 / W_CONT * 100;

        if (ws.state === 'entering') {
            ws.x += ws.vx * dt;
            ws.y  = Math.max(_zone.yMin, Math.min(_zone.yMax, ws.y));
            if (ws.x <= xHi) {
                ws.state     = 'walking';
                ws.walkTimer = 5;
                ws.dirTimer  = 0;
            }

        } else if (ws.state === 'walking') {
            ws.walkTimer -= dt;
            ws.dirTimer  -= dt;

            // Random direction change (same speed range as normal hens: 3-6 %/s)
            if (ws.dirTimer <= 0) {
                ws.dirTimer = 1 + Math.random() * 1.5;
                var spd = 3 + Math.random() * 3;
                ws.vx = (Math.random() - 0.5) * spd * 2;
                ws.vy = (Math.random() - 0.5) * spd * 0.6;
                if (Math.abs(ws.vx) < 0.5) ws.vx = ws.vx >= 0 ? 1 : -1;
                ws.dir = ws.vx >= 0 ? 1 : -1;
            }

            ws.x += ws.vx * dt;
            ws.y += ws.vy * dt;

            // Bounce off zone boundaries (logo already capped by _zone.yMax in portrait)
            if (ws.x > xHi)        { ws.x = xHi;         ws.vx = -Math.abs(ws.vx); ws.dir = -1; }
            if (ws.x < _zone.xMin) { ws.x = _zone.xMin;  ws.vx =  Math.abs(ws.vx); ws.dir =  1; }
            if (ws.y > _zone.yMax) { ws.y = _zone.yMax;  ws.vy = -Math.abs(ws.vy); }
            if (ws.y < _zone.yMin) { ws.y = _zone.yMin;  ws.vy =  Math.abs(ws.vy); }

            // Also respect logo rect if set (extra safety)
            if (_logoRect) {
                var _wSz = 128 / W_CONT * 100;
                var _wR  = ws.x + _wSz;
                if (_wR > _logoRect.xMin && ws.x < _logoRect.xMax && ws.y < _logoRect.yMax && (ws.y + 5 / (_contEl ? _contEl.offsetHeight : 2229) * 100) > _logoRect.yMin) {
                    ws.vy = Math.abs(ws.vy) * -1;
                    ws.y  = _logoRect.yMin - 0.5;
                }
            }

            // Ambient coks while walking
            if (t >= ws._nextCokAt) {
                ws._nextCokAt = t + 2000 + Math.random() * 3000;
                window.GameAudio && window.GameAudio.playRandomCok();
            }

            if (ws.walkTimer <= 0) {
                ws.state = 'stopped';
                ws.vx = 0; ws.vy = 0;
                var _wm = _WALKER_MSGS[ws.msgIdx];
                ws.bubText.textContent = (typeof _wm === 'function') ? _wm() : _wm;
                ws.bub.style.display   = 'block';
                _sfx('sfxChickenAngry', 0.5, 300);
            }

        } else if (ws.state === 'leaving') {
            ws.x += ws.vx * dt;
            if (ws.x < -20) {
                if (ws.el.parentNode) ws.el.parentNode.removeChild(ws.el);
                if (ws.bub.parentNode) ws.bub.parentNode.removeChild(ws.bub);
                _walkerState  = null;
                _clearExile();
                _clearWakeTotal();
                _clearMsgIdx();
                _eggFlying    = false;
                _eggWakeTotal = 0;
                setTimeout(_returnAnimals, 200);
                return;
            }
        }
        // 'stopped': no movement — animate idle + update bubble

        if (ws.state === 'stopped' && ws.bub.style.display !== 'none') {
            var er = ws.el.getBoundingClientRect();
            if (er.width && er.height) {
                var _wbw = ws.bub.offsetWidth  || 120;
                var _wbh = ws.bub.offsetHeight || 70;
                ws.bub.style.left = Math.max(4, Math.min(er.left + er.width / 2 - _wbw / 2, window.innerWidth  - _wbw - 4)) + 'px';
                ws.bub.style.top  = Math.max(4, Math.min(er.top  - _wbh - 14,               window.innerHeight - _wbh - 4)) + 'px';
            }
        }

        // Idle (row 0, face viewer) when stopped; walk row 1 otherwise
        var row, frame, flip;
        if (ws.state === 'stopped') {
            row   = 0;
            frame = Math.floor((t + ws.phase) / MS4 % 4);
            flip  = false;
        } else {
            row   = 1;
            frame = Math.floor((t + ws.phase) / (CYCLE / 8) % 8);
            flip  = (ws.dir < 0);
        }
        var _wps = _portraitTwoZones ? (window.PORTRAIT_INTRO_CHICKEN_SCALE || 1) : 1;
        ws.el.style.backgroundPosition = (-frame * 128) + 'px ' + (-row * 128) + 'px';
        ws.el.style.left      = ws.x + '%';
        ws.el.style.bottom    = ws.y + '%';
        ws.el.style.transform = _wps !== 1
            ? 'scale(' + (flip ? -_wps : _wps) + ',' + _wps + ')'
            : (flip ? 'scaleX(-1)' : 'none');
        ws.el.style.zIndex    = String(Math.round(1000 - ws.y * 10) + 200);
    }

    // ── Return animation — animals re-enter from both sides ──────────────────────
    function _returnAnimals() {
        _states.forEach(function(s) {
            if (s.el && s.el.parentNode) s.el.parentNode.removeChild(s.el);
            if (s._dbEl && s._dbEl.parentNode) s._dbEl.parentNode.removeChild(s._dbEl);
        });
        _states = [];
        _updateDebug();

        var defs = [];
        HEN_SRCS.forEach(function(src) { for (var i = 0; i < 4; i++) defs.push({ t: 'hen', src: src }); });
        defs.push({ t: 'rooster', src: null });
        for (var j = 0; j < 8; j++) defs.push({ t: 'chick', src: null });

        for (var i = 0; i < defs.length; i++) {
            var d = defs[i];
            var spawnZone = (_portraitTwoZones && _zone2 && i % 2 === 0) ? _zone2 : _zone;
            var s = _makeState(d.t, d.src, spawnZone);
            // Start off-screen alternating left/right, walk in at normal speed
            var fromRight = (i % 2 === 0);
            var spd = s.isChick ? 1.17 + Math.random() * 1.17 : 3 + Math.random() * 3;
            if (fromRight) {
                s.x   = 100 + Math.random() * 8; // off-screen right
                s.vx  = -spd; s.dir = -1;
            } else {
                s.x   = -s.size / W_CONT * 100 - Math.random() * 8; // off-screen left
                s.vx  = spd;  s.dir = 1;
            }
            s.y             = spawnZone.yMin + Math.random() * Math.max(0, spawnZone.yMax - spawnZone.yMin);
            s.vy            = (Math.random() - 0.5) * 0.5;
            s.action        = 'walk';
            s.actionTimer   = 20; // long timer so they reach zone before AI kicks in
            s._enteringZone = true;
            if (_root) _root.appendChild(s.el);
            _states.push(s);
        }
    }

    // Compute visible zone from fence bottom to just above the button bar.
    // Uses _currentPanPx (set by index.html) so the zone reflects the actual camera position.
    function _computeZone() {
        var cont = _contEl || document.getElementById('intro-pan-container');
        if (!cont) return;
        var ch  = cont.offsetHeight || 2229;
        // Use physical dimensions to compute visible reference height — matches _visRefH in index.html.
        // window.innerHeight is CSS px and diverges from reference px at zoom ≠ 1.
        var _z2  = window.outerWidth / window.innerWidth || 1;
        var _ph  = Math.round(window.innerHeight * _z2);
        var _pw  = Math.round(window.innerWidth  * _z2);
        var _ds  = Math.max(_pw / 1920, _ph / 1080);
        var vh   = Math.round(_ph / _ds);
        var sc   = ch / 1264;
        var visTop = -_currentPanPx;

        // Zone ceiling: fence bottom, or the visible viewport top if camera panned below it.
        // This makes yMax shift down together with the camera so upper animals also come down.
        var fenceBottom   = 600 * sc;
        var zoneHenBottom = fenceBottom + 128 * 0.5 - 60;
        var viewCeiling   = Math.max(visTop, zoneHenBottom);
        _zone.yMax = Math.max(5, (1 - viewCeiling / ch) * 100);

        var buttonBarContainerY = visTop + vh - 80;
        _zone.yMin = Math.max(1, (1 - buttonBarContainerY / ch) * 100);
        if (_zoneFloor !== null) _zone.yMin = Math.max(_zone.yMin, _zoneFloor);

        if (_zone.yMax < _zone.yMin + 8) _zone.yMax = _zone.yMin + 15;

        // Portrait two-zone mode: split zone at logo boundary
        if (_portraitTwoZones && _logoRect) {
            // Visible x range: only the portion of the 1920px canvas actually on screen.
            // In portrait the canvas is wider than the screen; BCR gives the real viewport rect.
            var _bcr   = cont.getBoundingClientRect();
            var _bcW   = _bcr.width;
            var _vxMin = _bcW > 1 ? Math.max(0,   (-_bcr.left               / _bcW) * 100 + 1) : 1;
            var _vxMax = _bcW > 1 ? Math.min(100, ((window.innerWidth - _bcr.left) / _bcW) * 100 - 1) : 99;
            _zone.xMin = _vxMin;
            _zone.xMax = _vxMax;
            // Lower zone (Z2): from button bar up to just below logo/shadow bottom
            _zone.yMax = Math.min(_zone.yMax, _logoRect.yMin - 1.5);
            if (_zone.yMax < _zone.yMin + 4) _zone.yMax = _zone.yMin + 8;
            // Upper zone (Z1): from just above logo top to very top of visible viewport
            var _z2yMin = _logoRect.yMax + 1.5;
            var _z2yMax = Math.max(_z2yMin + 8, (1 - visTop / ch) * 100);
            if (!_zone2) _zone2 = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
            _zone2.xMin = _vxMin;
            _zone2.xMax = _vxMax;
            _zone2.yMin = _z2yMin;
            _zone2.yMax = _z2yMax;
        } else if (!_portraitTwoZones) {
            _zone2 = null;
        }

        _zoneReady = true;

        // Update debug overlay dimensions
        if (_debugEl) {
            _debugEl.style.left   = _zone.xMin + '%';
            _debugEl.style.bottom = _zone.yMin + '%';
            _debugEl.style.width  = (_zone.xMax - _zone.xMin) + '%';
            _debugEl.style.height = (_zone.yMax - _zone.yMin) + '%';
        }
        if (_debugZone2El) {
            if (_zone2 && _debugZone) {
                _debugZone2El.style.left    = _zone2.xMin + '%';
                _debugZone2El.style.bottom  = _zone2.yMin + '%';
                _debugZone2El.style.width   = (_zone2.xMax - _zone2.xMin) + '%';
                _debugZone2El.style.height  = (_zone2.yMax - _zone2.yMin) + '%';
                _debugZone2El.style.display = 'block';
            } else {
                _debugZone2El.style.display = 'none';
            }
        }
    }

    // Called by index.html after each camera pan completes to update the walk zone
    // and scatter any animal that landed outside the new bounds back toward the zone.
    function _refreshZone(floorPct) {
        _zoneFloor = (floorPct !== undefined) ? floorPct : null;
        _zoneReady = false;
        _computeZone();
        _states.forEach(function(s) {
            var _sz = (s.zoneIdx === 1 && _zone2) ? _zone2 : _zone;
            var spd = s.isChick ? 1.5 : 4.5;
            if (s.y < _sz.yMin) {
                // Below zone (camera panned back up) → run upward
                s.action      = 'walk';
                s.actionTimer = 10 + Math.random() * 8;
                s.vy          = spd * (0.6 + Math.random() * 0.6);
                s.vx          = (Math.random() - 0.5) * spd;
                s.dir         = s.vx >= 0 ? 1 : -1;
            } else if (s.y > _sz.yMax) {
                // Above zone → run downward
                s.action      = 'walk';
                s.actionTimer = 10 + Math.random() * 8;
                s.vy          = -spd * (0.6 + Math.random() * 0.6);
                s.vx          = (Math.random() - 0.5) * spd;
                s.dir         = s.vx >= 0 ? 1 : -1;
            }
        });
    }

    // ── DOM ─────────────────────────────────────────────────────────────────────
    function _makeEl(src, size, sheetW) {
        var el = document.createElement('div');
        el.style.cssText =
            'position:absolute;overflow:hidden;image-rendering:pixelated;' +
            'cursor:pointer;user-select:none;transform-origin:center bottom;' +
            'width:' + size + 'px;height:' + size + 'px;' +
            'background-image:url(' + src + ');' +
            'background-repeat:no-repeat;' +
            'background-size:' + sheetW + 'px auto;';
        return el;
    }

    function _randVel(speed) {
        var a = Math.random() * Math.PI * 2;
        return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed };
    }

    // ── Entity ───────────────────────────────────────────────────────────────────
    // type: 'hen' | 'chick' | 'rooster'
    function _makeState(type, forceSrc, zone) {
        var isChick   = (type === 'chick');
        var isRooster = (type === 'rooster');
        var src    = forceSrc  ? forceSrc
                   : isChick   ? CHICK_SRC
                   : isRooster ? ROOSTER_SRC
                   : HEN_SRCS[Math.floor(Math.random() * HEN_SRCS.length)];
        var size   = isChick ? 96 : isRooster ? 160 : 128;
        var sheetW = size * 8;
        var el     = _makeEl(src, size, sheetW);
        var speed  = isChick ? 1.17 + Math.random() * 1.17
                             : 3    + Math.random() * 3;
        var vel    = _randVel(speed);
        var _spawnZone = zone || _zone;

        var s = {
            el, isChick, isRooster, size,
            zoneIdx:      (zone === _zone2) ? 1 : 0,
            x:            _spawnZone.xMin + Math.random() * (_spawnZone.xMax - _spawnZone.xMin),
            y:            _spawnZone.yMin + Math.random() * Math.max(0, _spawnZone.yMax - _spawnZone.yMin),
            vx:           vel.vx,
            vy:           vel.vy,
            dir:          vel.vx >= 0 ? 1 : -1,
            action:       'sleeping',
            actionTimer:  0,
            phase:        Math.random() * CYCLE,
            sleepDir:     Math.random() < 0.5 ? 1 : -1,
            sleepInStep:  0,
            sleepInTimer: 0,
            wakeTimer:    0,
            forceSleepTimer: -1,
            _scatterCx:      undefined,
            _angry:          false,
            _enteringZone:   false,
            _nextSoundAt:    Date.now() + 3000 + Math.random() * 5000,
        };

        // Yellow debug box showing this animal's collision bounding rect (F6)
        s._dbEl = document.createElement('div');
        s._dbEl.style.cssText = 'position:absolute;pointer-events:none;z-index:9996;box-sizing:border-box;display:none;border:2px solid rgba(255,230,0,0.9);background:rgba(255,230,0,0.06);';
        if (_contEl) _contEl.appendChild(s._dbEl);

        el.addEventListener('touchend', function (e) { if (e.cancelable) e.preventDefault(); _onHover(s); });
        return s;
    }

    // ── Debug HUD ────────────────────────────────────────────────────────────────
    function _updateDebug() {
        if (!_eggDebugEl) {
            _eggDebugEl = document.createElement('div');
            _eggDebugEl.style.cssText =
                'position:fixed;bottom:12px;left:12px;z-index:99999;pointer-events:none;display:none;' +
                'font-family:monospace;font-size:13px;font-weight:bold;color:#fff;' +
                'background:rgba(0,0,0,0.82);padding:7px 12px;border:2px solid #555;' +
                'border-radius:4px;line-height:1.6;white-space:nowrap;';
            document.body.appendChild(_eggDebugEl);
        }
        if (_debugZone) _eggDebugEl.style.display = 'block';
        var col, txt;
        if (_eggFlying) {
            var _wm = _walkerState ? ((_walkerState.msgIdx + 1) + '/' + _WALKER_MSGS.length) : 'ESPERANDO';
            col = '#f55';
            txt = 'EXILIO x' + _getOffense() + '  MSG: ' + _wm;
        } else {
            col = _eggWakeTotal >= 90 ? '#f55' : _eggWakeTotal >= 50 ? '#f8a840' : '#7fff7f';
            txt = 'WAKES: ' + _eggWakeTotal + ' / 100  [' +
                (_eggWakeTotal >= 90 ? 'DANGER' : _eggWakeTotal >= 50 ? 'ANGRY' : 'OK') + ']';
        }
        _eggDebugEl.textContent = txt;
        _eggDebugEl.style.color = col;
        _eggDebugEl.style.borderColor = col;
    }

    // ── Wake on hover ────────────────────────────────────────────────────────────
    function _onHover(s) {
        if (s.action !== 'sleeping' && s.action !== 'sleepTransition') return;
        if (_eggFlying) return;
        if (Date.now() - _logoWakeTime < 400) return; // ignore touches from logo impact
        _eggWakeTotal++;
        _updateDebug();
        s.action    = 'waking';
        s.wakeTimer = WAKE_DUR;
        if (s.isChick)     _sfx('sfxChickWake',   0.4, 200);
        else if (s.isRooster) _sfx('sfxRoosterWake', 0.5, 500);
        else                   _sfx('sfxChickenWake', 0.4, 200);
        // Milestone speech bubbles at exact thresholds — pinned to this hen
        if      (_eggWakeTotal === 25) _showMilestoneBubble(_t('eggM25'), s);
        else if (_eggWakeTotal === 50) _showMilestoneBubble(_t('eggM50'), s);
        else if (_eggWakeTotal === 70) _showMilestoneBubble(_t('eggM70'), s);
        else if (_eggWakeTotal === 90) _showMilestoneBubble(_t('eggM90'), s);
        if (_eggWakeTotal >= 100) {
            _eggFlying = true;
            s._angry   = false;
            s.forceSleepTimer = -1;
            _showMilestoneBubble(_t('eggFarewell'), s);
            setTimeout(_triggerExodus, 2000);
        } else if (_eggWakeTotal >= 50) {
            s._angry = (!s.isChick && !s.isRooster);
            // forceSleepTimer set to 10s in waking completion for angry hens
        } else {
            s._angry          = false;
            s.forceSleepTimer = 10 + Math.random() * 10;
        }
    }

    function _triggerExodus() {
        _incOffense();
        _saveExile();
        for (var i = 0; i < _states.length; i++) {
            var s = _states[i];
            var goRight = s.x >= 50;
            var spd = s.isChick ? 8 : 22;
            s.vx  = goRight ? spd : -spd;
            s.vy  = s.isChick ? 0.5 : 3 + Math.random() * 2;
            s.dir = goRight ? 1 : -1;
            s.action = 'flyaway';
            s.wakeTimer = 0;
            s.forceSleepTimer = -1;
            s._angry = false;
        }
        // Walker hen appears 3 s after animals leave (gives them time to clear the screen)
        setTimeout(_showWalkerChicken, 3000);
    }

    // ── Main loop ────────────────────────────────────────────────────────────────
    function _tick(now) {
        var mmo = document.getElementById('main-menu-overlay');
        if (!mmo || mmo.style.display === 'none') {
            if (_walkerState && _walkerState.bub) _walkerState.bub.style.display = 'none';
            for (var _bi = 0; _bi < _activeBubbles.length; _bi++) { if (_activeBubbles[_bi].el) _activeBubbles[_bi].el.style.display = 'none'; }
            _rafId = null; return;
        }

        _updateDebug();
        if (!_zoneReady) _computeZone();

        var dt = Math.min((now - _lastT) / 1000, 0.05);
        _lastT = now;
        var t  = Date.now();
        if (window.GameAudio) window.GameAudio.tickPioRateLimit(dt);
        _tickWalker(dt, t);
        for (var bi = 0; bi < _activeBubbles.length; bi++) _positionBubble(_activeBubbles[bi]);

        // Proximity hover
        var cRect = _contEl ? _contEl.getBoundingClientRect() : null;
        if (cRect && _mouseX > -9000) {
            for (var hi = 0; hi < _states.length; hi++) {
                var hs = _states[hi];
                if (hs.action !== 'sleeping') continue;
                var ex = cRect.left + hs.x / 100 * cRect.width  + hs.size / 2;
                var ey = cRect.bottom - hs.y / 100 * cRect.height - hs.size / 2;
                var hw = hs.size * 0.55;
                if (Math.abs(_mouseX - ex) < hw && Math.abs(_mouseY - ey) < hw) _onHover(hs);
            }
        }

        for (var i = 0; i < _states.length; i++) {
            var s   = _states[i];
            var el  = s.el;
            var fs  = s.size;
            var row = 0, frame = 0, flipX = false;

            // ── SLEEPING ──────────────────────────────────────────────────────────
            if (s.action === 'sleeping') {
                if (s.isChick) {
                    row = 9; flipX = (s.sleepDir < 0);
                } else if (s.isRooster) {
                    // Rooster: row 6 = sleep right, row 7 = sleep left (direction baked in)
                    row = (s.sleepDir >= 0) ? 6 : 7; flipX = false;
                } else {
                    // Hen: row 14 = sleep right, row 9 = sleep left
                    row = (s.sleepDir >= 0) ? 14 : 9; flipX = false;
                }
                frame = Math.floor((t + s.phase) / MS8 % 8);
                el.style.opacity = '1';
            }
            // ── SLEEP TRANSITION (hen only) ───────────────────────────────────────
            else if (s.action === 'sleepTransition') {
                row   = 6;
                frame = [0, 1, 5][Math.min(s.sleepInStep, 2)];
                flipX = (s.sleepDir < 0);
                el.style.opacity = '1';
                s.sleepInTimer -= dt;
                if (s.sleepInTimer <= 0) {
                    s.sleepInStep++;
                    if (s.sleepInStep >= 3) {
                        s.action = 'sleeping';
                        s.phase  = Math.random() * CYCLE;
                    } else {
                        s.sleepInTimer = 0.3;
                    }
                }
            }
            // ── WAKING ────────────────────────────────────────────────────────────
            else if (s.action === 'waking') {
                // Rooster uses row 8 for wake; hen/chick use row 10
                row   = s.isRooster ? 8 : 10;
                frame = Math.min(7, Math.floor((1 - s.wakeTimer / WAKE_DUR) * 8));
                flipX = (s.sleepDir < 0);
                el.style.opacity = '1';
                s.wakeTimer -= dt;
                if (s.wakeTimer <= 0) {
                    if (s._angry && !s.isChick && !s.isRooster) {
                        // Angry idle: stand still with angry sprite for 10 s, then sleep
                        s.vx = 0; s.vy = 0;
                        s.action      = 'idle';
                        s.actionTimer = 15;
                        s.forceSleepTimer = 10 + Math.random() * 2;
                        _sfx('sfxChickenAngry', 0.5, 300);
                    } else {
                        s._angry = false;
                        var nspd = s.isChick ? 1.17 + Math.random() * 1.17
                                            : 3    + Math.random() * 3;
                        if (s._scatterCx !== undefined) {
                            var dx = s.x - s._scatterCx;
                            s.vx = (dx >= 0 ? 1 : -1) * (nspd * 0.85 + Math.random() * nspd * 0.4);
                            s.vy = (Math.random() - 0.4) * nspd * 0.5;
                            s._scatterCx = undefined;
                        } else {
                            var nv = _randVel(nspd);
                            s.vx = nv.vx; s.vy = nv.vy;
                        }
                        s.dir         = s.vx >= 0 ? 1 : -1;
                        s.action      = 'walk';
                        s.actionTimer = 2 + Math.random() * 3;
                    }
                }
            }
            // ── WALK / IDLE ───────────────────────────────────────────────────────
            else if (s.action !== 'flyaway') {
                el.style.opacity = '1';
                flipX = (s.dir < 0);

                var forceNow = false;
                if (s.forceSleepTimer >= 0) {
                    s.forceSleepTimer -= dt;
                    if (s.forceSleepTimer <= 0) { s.forceSleepTimer = -1; forceNow = true; }
                }

                s.actionTimer -= dt;
                if (s.actionTimer <= 0 || forceNow) {
                    var r = forceNow ? 0 : Math.random();
                    if (r < 0.30 || forceNow) {
                        s._angry = false;
                        s.sleepDir = s.dir;
                        s.vx = 0; s.vy = 0;
                        s.forceSleepTimer = -1;
                        if (s.isChick || s.isRooster) {
                            s.action = 'sleeping';
                            s.phase  = Math.random() * CYCLE;
                        } else {
                            s.action       = 'sleepTransition';
                            s.sleepInStep  = 0;
                            s.sleepInTimer = 0.3;
                        }
                    } else if (r < 0.70) {
                        var spd = s.isChick ? 1.17 + Math.random() * 1.17
                                            : 3    + Math.random() * 3;
                        var nv2 = _randVel(spd);
                        s.vx = nv2.vx; s.vy = nv2.vy;
                        s.dir         = nv2.vx >= 0 ? 1 : -1;
                        s.action      = 'walk';
                        s.actionTimer = 2 + Math.random() * 4;
                    } else {
                        s.vx = 0; s.vy = 0;
                        s.action      = 'idle';
                        s.actionTimer = 0.8 + Math.random() * 1.5;
                    }
                }

                if (s.action === 'walk') {
                    s.x += s.vx * dt;
                    s.y += s.vy * dt;
                    var _sz = (s.zoneIdx === 1 && _zone2) ? _zone2 : _zone;
                    // X: portrait two-zone clamps to visible screen portion; desktop uses full canvas.
                    var _xLo = _portraitTwoZones ? _sz.xMin : 0;
                    var _xHi = (_portraitTwoZones ? _sz.xMax : 100) - s.size / W_CONT * 100;
                    if (_xHi < _xLo) _xHi = _xLo;
                    if (s._enteringZone) {
                        // Animals entering from off-screen: skip x clamp until in zone, then go idle
                        if (s.x >= _xLo && s.x <= _xHi && s.y >= _sz.yMin && s.y <= _sz.yMax) {
                            s._enteringZone = false;
                            s.vx = 0; s.vy = 0;
                            s.action = 'idle';
                            s.actionTimer = 0.5 + Math.random() * 1.5;
                        }
                        // Still clamp Y so they don't fly off vertically
                        if (s.y > _sz.yMax) { s.y = _sz.yMax; s.vy = -Math.abs(s.vy); }
                        if (s.y < _sz.yMin) { s.y = _sz.yMin; s.vy =  Math.abs(s.vy); }
                    } else {
                        if (s.x > _xHi) { s.x = _xHi; s.vx = -Math.abs(s.vx); s.dir = -1; s.vy += (Math.random()-0.5)*Math.abs(s.vx)*0.6; }
                        if (s.x < _xLo) { s.x = _xLo; s.vx =  Math.abs(s.vx); s.dir =  1; s.vy += (Math.random()-0.5)*Math.abs(s.vx)*0.6; }
                        // Y: clamp + reverse + deflect X so animals don't bounce vertically in a corridor.
                        if (s.y > _sz.yMax) { s.y = _sz.yMax; s.vy = -Math.abs(s.vy); s.vx += (Math.random()-0.5)*Math.abs(s.vy)*0.6; s.dir = s.vx >= 0 ? 1 : -1; }
                        if (s.y < _sz.yMin) { s.y = _sz.yMin; s.vy =  Math.abs(s.vy); s.vx += (Math.random()-0.5)*Math.abs(s.vy)*0.6; s.dir = s.vx >= 0 ? 1 : -1; }
                    }

                    // Colliders: logo container + crate button.
                    // Uses minimum-separation-axis: push on whichever axis has less penetration.
                    if (_contEl && !s._enteringZone) {
                        var ch   = _contEl.offsetHeight || 2229;
                        var szW  = s.size * 0.25 / W_CONT * 100; // narrower than before (was 0.4)
                        var sxOff = s.size * 0.38 / W_CONT * 100; // shift right: start near sprite centre
                        var sxL  = s.x + sxOff;
                        var sxR  = sxL + szW;
                        var szH  = 5 / ch * 100;                  // flat 5px feet
                        var eT   = s.y + szH;
                        var rects = [];
                        if (_logoRect)  rects.push(_logoRect);
                        if (_crateRect) rects.push(_crateRect);
                        for (var ri = 0; ri < rects.length; ri++) {
                            var rc = rects[ri];
                            if (sxR > rc.xMin && sxL < rc.xMax && eT > rc.yMin && s.y < rc.yMax) {
                                var minSpd = s.isChick ? 0.9 : 3;
                                // Convert % penetration to px so X and Y are comparable
                                var xPen = Math.min(sxR - rc.xMin, rc.xMax - sxL) * W_CONT / 100;
                                var yPen = Math.min(eT - rc.yMin, rc.yMax - s.y) * ch / 100;
                                if (xPen <= yPen) {
                                    // Exit on X axis + deflect Y so animal escapes instead of oscillating
                                    if ((sxR - rc.xMin) < (rc.xMax - sxL)) {
                                        s.vx = -Math.max(minSpd, Math.abs(s.vx));
                                    } else {
                                        s.vx =  Math.max(minSpd, Math.abs(s.vx));
                                    }
                                    s.dir = s.vx > 0 ? 1 : -1;
                                    s.vy += (Math.random() - 0.5) * Math.abs(s.vx) * 0.5;
                                } else {
                                    // Exit on Y axis + deflect X
                                    if ((eT - rc.yMin) < (rc.yMax - s.y)) {
                                        s.vy = -Math.abs(s.vy);
                                    } else {
                                        s.vy =  Math.abs(s.vy);
                                    }
                                    s.vx += (Math.random() - 0.5) * Math.abs(s.vy) * 0.5;
                                    s.dir = s.vx >= 0 ? 1 : -1;
                                }
                                sxR = sxL + szW;
                            }
                        }
                    }

                    flipX = (s.dir < 0);
                }

                // Ambient periodic sounds while awake
                if (t >= s._nextSoundAt) {
                    s._nextSoundAt = t + 3000 + Math.random() * 5000;
                    if (s.isChick && window.GameAudio) window.GameAudio.playChickSound();
                    else if (s.isRooster && window.GameAudio) window.GameAudio.playRandomCok();
                    else if (window.GameAudio) window.GameAudio.playRandomCok();
                }

                if (s.action === 'idle') {
                    // Angry hens stand still with angry sprite for 10 s before sleeping
                    var angryIdle = !s.isChick && !s.isRooster && s._angry && _HEN_ANGRY_WALK_ROW >= 0;
                    row   = angryIdle ? _HEN_ANGRY_WALK_ROW : 0;
                    frame = Math.floor((t + s.phase) / MS4 % 4);
                } else if (s.action === 'walk') {
                    var avx = Math.abs(s.vx), avy = Math.abs(s.vy);
                    if (avy > avx * 1.2) {
                        row = s.vy > 0 ? 3 : 2;
                    } else {
                        row = 1;
                    }
                    // Rooster horizontal walk has 4 frames; chick always 4; hen 8
                    var wf = (s.isChick || (s.isRooster && row === 1)) ? 4 : 8;
                    frame  = Math.floor((t + s.phase) / (CYCLE / wf) % wf);
                }
            }

            // ── FLYAWAY (exodus easter egg) ───────────────────────────────────────
            if (s.action === 'flyaway') {
                s.x += s.vx * dt;
                s.y += s.vy * dt;
                row   = 1;
                var _wf = (s.isChick || (s.isRooster && row === 1)) ? 4 : 8;
                frame = Math.floor((t + s.phase) / (CYCLE / _wf) % _wf);
                flipX = (s.vx < 0);
                var _offscreen = s.x < -20 || s.x > 120;
                var _fade = Math.max(0, 1 - Math.max(0, s.x < 0 ? -s.x : s.x - 100) / 15);
                el.style.opacity = String(_fade);
                if (_offscreen) {
                    el.remove();
                    if (s._dbEl && s._dbEl.parentNode) s._dbEl.parentNode.removeChild(s._dbEl);
                    _states.splice(i, 1);
                    i--;
                    continue;
                }
            }

            el.style.backgroundPosition = (-frame * fs) + 'px ' + (-row * fs) + 'px';
            el.style.left      = s.x + '%';
            el.style.bottom    = s.y + '%';
            el.style.zIndex    = String(Math.round(1000 - s.y * 10));
            var _ps = _portraitTwoZones ? (window.PORTRAIT_INTRO_CHICKEN_SCALE || 1) : 1;
            if (_ps !== 1) {
                el.style.transform = 'scale(' + (flipX ? -_ps : _ps) + ',' + _ps + ')';
            } else {
                el.style.transform = flipX ? 'scaleX(-1)' : 'none';
            }

            // Update yellow debug bounding box (matches actual collision rect)
            if (_debugZone && s._dbEl && _contEl) {
                var _dch   = _contEl.offsetHeight || 2229;
                var _dsW   = s.size * 0.25 / W_CONT * 100;
                var _dsOff = s.size * 0.38 / W_CONT * 100;
                var _dsH   = 5 / _dch * 100;
                s._dbEl.style.left    = (s.x + _dsOff) + '%';
                s._dbEl.style.bottom  = s.y + '%';
                s._dbEl.style.width   = _dsW + '%';
                s._dbEl.style.height  = _dsH + '%';
                s._dbEl.style.display = 'block';
            }
        }

        _rafId = requestAnimationFrame(_tick);
    }

    // ── Public API ───────────────────────────────────────────────────────────────
    function init() {
        _root   = document.getElementById('mm-animals');
        _contEl = document.getElementById('intro-pan-container');
        if (!_root) return;
        // Remove per-animal debug elements before clearing states
        _states.forEach(function(s){ if (s._dbEl && s._dbEl.parentNode) s._dbEl.parentNode.removeChild(s._dbEl); });
        _root.innerHTML = '';
        _states = [];
        _zoneReady    = false;
        var _exiledNow = _isExiled();
        _eggWakeTotal = 0;
        _eggFlying = _exiledNow;

        if (_walkerState) {
            if (_walkerState.el && _walkerState.el.parentNode) _walkerState.el.parentNode.removeChild(_walkerState.el);
            if (_walkerState.bub && _walkerState.bub.parentNode) _walkerState.bub.parentNode.removeChild(_walkerState.bub);
            _walkerState = null;
        }
        _activeBubbles.forEach(function(e) { if (e.el && e.el.parentNode) e.el.parentNode.removeChild(e.el); });
        _activeBubbles = [];

        // Yellow: lower walk zone (Z2 in portrait, single zone in desktop)
        _debugEl = document.createElement('div');
        _debugEl.style.cssText =
            'position:absolute;pointer-events:none;z-index:9997;box-sizing:border-box;display:none;' +
            'border:2px dashed rgba(255,230,0,0.9);background:rgba(255,230,0,0.07);' +
            'font:bold 11px monospace;color:rgba(255,230,0,0.9);padding:2px 4px;';
        _debugEl.textContent = 'Z2';
        _root.appendChild(_debugEl);
        // Magenta: upper walk zone (Z1 in portrait only)
        _debugZone2El = document.createElement('div');
        _debugZone2El.style.cssText =
            'position:absolute;pointer-events:none;z-index:9997;box-sizing:border-box;display:none;' +
            'border:2px dashed rgba(255,0,220,0.9);background:rgba(255,0,220,0.07);' +
            'font:bold 11px monospace;color:rgba(255,0,220,0.9);padding:2px 4px;';
        _debugZone2El.textContent = 'Z1';
        _root.appendChild(_debugZone2El);
        // Red: logo collider bounds — appended to container so it's above the rig
        _debugColliderEl = document.createElement('div');
        _debugColliderEl.style.cssText =
            'position:absolute;pointer-events:none;z-index:9998;box-sizing:border-box;display:none;' +
            'border:2px solid rgba(255,60,60,0.9);background:rgba(255,60,60,0.08);';
        (_contEl || _root).appendChild(_debugColliderEl);
        // Orange: crate collider bounds — appended to container so it's above the jugar button
        _debugCrateEl = document.createElement('div');
        _debugCrateEl.style.cssText =
            'position:absolute;pointer-events:none;z-index:9999;box-sizing:border-box;display:none;' +
            'border:2px solid rgba(255,160,0,0.9);background:rgba(255,160,0,0.08);';
        (_contEl || _root).appendChild(_debugCrateEl);

        _doSpawnAnimals();
    }

    function _doSpawnAnimals() {
        if (_eggFlying) { setTimeout(_showWalkerChicken, 600); return; }
        // In desktop mode, avoid spawning where the logo will land.
        var _logoW  = 800;
        var _avXMin = (W_CONT / 2 - _logoW / 2) / W_CONT * 100;
        var _avXMax = (W_CONT / 2 + _logoW / 2) / W_CONT * 100;
        var _avYMin = _zone.yMin + (_zone.yMax - _zone.yMin) * 0.45;

        function _avoidLogo(s) {
            if (_portraitTwoZones) return; // zones already exclude the logo area
            if (s.y < _avYMin || s.x <= _avXMin || s.x >= _avXMax) return;
            var leftW  = Math.max(0, _avXMin - _zone.xMin);
            var rightW = Math.max(0, _zone.xMax - _avXMax);
            if (leftW + rightW > 4) {
                s.x = Math.random() < leftW / (leftW + rightW)
                    ? _zone.xMin + Math.random() * leftW
                    : _avXMax    + Math.random() * rightW;
            } else {
                s.y = _zone.yMin + Math.random() * Math.max(1, _avYMin - _zone.yMin);
            }
        }

        // Build ordered list: 4 hens × 4 colors, 1 rooster, 8 chicks (25 total).
        // In two-zone mode, even index → Z1 (above logo), odd index → Z2 (below logo).
        var _defs = [];
        HEN_SRCS.forEach(function(src) {
            for (var i = 0; i < 4; i++) _defs.push({ t: 'hen', src: src });
        });
        _defs.push({ t: 'rooster', src: null });
        for (var j = 0; j < 8; j++) _defs.push({ t: 'chick', src: null });

        for (var i = 0; i < _defs.length; i++) {
            var d = _defs[i];
            var spawnZone = (_portraitTwoZones && _zone2 && i % 2 === 0) ? _zone2 : _zone;
            var s = _makeState(d.t, d.src, spawnZone);
            _avoidLogo(s);
            _root.appendChild(s.el);
            _states.push(s);
        }
    }

    // Antes esto cargaba cursors.png por su cuenta (duplicando shared/cursors.js) y forzaba
    // la MANO en #mm-home y en el botón JUGAR. Hoy eso sobra y encima estorba:
    //   · #mm-home ya hereda la mano de `html, body { cursor: var(--cur-hand) }`.
    //   · El botón JUGAR es un <button>, así que el CSS ya le pone el DEDO — y este código
    //     se lo pisaba con la mano.
    // Lo único que el CSS no puede deducir son los animales del intro: son <div> clicables,
    // así que se les pone el dedo a mano.
    function _applyCursor() {
        if (!window.GameCursors) return;
        window.GameCursors.ready.then(function () {
            var finger = window.GameCursors.get('finger');
            if (!finger) return;
            for (var k = 0; k < _states.length; k++) {
                if (_states[k].el) _states[k].el.style.cursor = finger;
            }
        });
    }

    function start() {
        if (_rafId) return;
        init();
        _applyCursor();
        _mouseX = -9999; _mouseY = -9999;
        document.addEventListener('mousemove', _trackMouse, { passive: true });
        document.addEventListener('keydown', _onKeyDown);
        _lastT = performance.now();
        _rafId = requestAnimationFrame(_tick);
    }

    function stop() {
        if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
        document.removeEventListener('mousemove', _trackMouse);
        document.removeEventListener('keydown', _onKeyDown);
        if (_eggDebugEl) _eggDebugEl.style.display = 'none';
        if (_walkerState && _walkerState.bub) _walkerState.bub.style.display = 'none';
    }

    function wakeAll(opts) {
        var cx = (opts && opts.centerX !== undefined) ? opts.centerX : 50;
        for (var i = 0; i < _states.length; i++) {
            var s = _states[i];
            if (s.action === 'sleeping' || s.action === 'sleepTransition') {
                s.action     = 'waking';
                s.wakeTimer  = WAKE_DUR;
                s._scatterCx = cx;
                s._angry = (_eggWakeTotal >= 50 && !s.isChick && !s.isRooster);
                // forceSleepTimer: for angry hens the waking completion overrides this to 10s
                var tier = Math.random();
                s.forceSleepTimer = tier < 0.33
                    ? 5  + Math.random() * 5
                    : tier < 0.66
                        ? 10 + Math.random() * 10
                        : 20 + Math.random() * 20;
            }
        }
    }

    function getZone() { return { xMin: _zone.xMin, xMax: _zone.xMax, yMin: _zone.yMin, yMax: _zone.yMax }; }

    function _applyDebugRect(el, rect) {
        if (!el) return;
        if (rect) {
            el.style.left    = rect.xMin + '%';
            el.style.bottom  = rect.yMin + '%';
            el.style.width   = (rect.xMax - rect.xMin) + '%';
            el.style.height  = (rect.yMax - rect.yMin) + '%';
            if (_debugZone) el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    }

    // Assign zone indices based on where animals already are — no position change.
    // Animals in the logo gap (between Z2.yMax and Z1.yMin) are nudged to the
    // nearest zone boundary; this small clamp is hidden by the logo-land shake.
    function _splitZones() {
        if (!_zone2) return;
        for (var i = 0; i < _states.length; i++) {
            var s = _states[i];
            if (s.y >= _zone2.yMin) {
                s.zoneIdx = 1;
            } else if (s.y <= _zone.yMax) {
                s.zoneIdx = 0;
            } else {
                // In the logo gap: nudge to nearest zone, no random reposition
                var distToZ2 = s.y - _zone.yMax;
                var distToZ1 = _zone2.yMin - s.y;
                if (distToZ2 <= distToZ1) { s.zoneIdx = 0; s.y = _zone.yMax; }
                else                       { s.zoneIdx = 1; s.y = _zone2.yMin; }
            }
            // Clamp X to zone's visible screen range
            var _sz  = s.zoneIdx === 1 ? _zone2 : _zone;
            var _xHi = _sz.xMax - s.size / W_CONT * 100;
            if (s.x < _sz.xMin || s.x > _xHi) {
                s.x = _sz.xMin + Math.random() * Math.max(0, _xHi - _sz.xMin);
            }
        }
    }

    // Activate portrait two-zone mode. Called from portrait.js after the logo lands.
    // Safe to call multiple times — only applies split on first call (or on re-init).
    function enablePortraitTwoZones() {
        if (_portraitTwoZones) { _computeZone(); return; } // already active: just refresh bounds
        _portraitTwoZones = true;
        _computeZone();
        // _root is null until init() runs — spawning will happen from init() → _doSpawnAnimals()
        if (!_root) return;
        if (_states.length === 0) {
            _doSpawnAnimals();
        } else {
            _splitZones();
        }
    }

    function setLogoRect(rect) {
        _logoRect = rect;
        _applyDebugRect(_debugColliderEl, rect);
        if (window.GAME_MODE === 'portrait') {
            if (!_portraitTwoZones && _states.length > 0) {
                enablePortraitTwoZones(); // first call: activate zones (happens during logo-land shake)
            } else if (_portraitTwoZones) {
                _computeZone(); // real logo rect arrived: refine zone bounds
            }
        }
    }

    function setCrateRect(rect) {
        _crateRect = rect;
        _applyDebugRect(_debugCrateEl, rect);
    }

    function setCurrentPan(px) {
        _currentPanPx = px;
    }

    // Called when the intro logo drops/lands — wakes up to 10 sleeping animals.
    // Each woken animal counts +1 toward _eggWakeTotal (max 10 per drop).
    // _logoWakeTime grace window blocks duplicate touch events right after impact.
    function addLogoWakes() {
        if (_eggFlying) return;
        _logoWakeTime = Date.now();
        var woken = 0;
        for (var k = 0; k < _states.length; k++) {
            var s = _states[k];
            if (s.action !== 'sleeping' && s.action !== 'sleepTransition') continue;
            if (woken >= 10) break;
            s.action    = 'waking';
            s.wakeTimer = WAKE_DUR;
            woken++;
            _eggWakeTotal++;
            s._angry = (_eggWakeTotal >= 50 && !s.isChick && !s.isRooster);
            if      (_eggWakeTotal === 25) _showMilestoneBubble(_t('eggM25'), s);
            else if (_eggWakeTotal === 50) _showMilestoneBubble(_t('eggM50'), s);
            else if (_eggWakeTotal === 70) _showMilestoneBubble(_t('eggM70'), s);
            else if (_eggWakeTotal === 90) _showMilestoneBubble(_t('eggM90'), s);
            if (_eggWakeTotal >= 100) {
                _eggFlying = true;
                s._angry   = false;
                s.forceSleepTimer = -1;
                _showMilestoneBubble(_t('eggFarewell'), s);
                setTimeout(_triggerExodus, 2000);
                break;
            }
        }
        _updateDebug();
    }

    return { start, stop, wakeAll, setLogoRect, setCrateRect, getZone, setCurrentPan, refreshZone: _refreshZone, enablePortraitTwoZones, addLogoWakes };
})();
