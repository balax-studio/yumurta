/**
 * CinematicCore — common infrastructure for all retire cinematics.
 *
 * Owns:  button disable, pre-fade, cine-fade DOM, retire-cine-root,
 *        retire-stats-overlay, phase-6 dissolve, phase-4 The End card.
 *
 * Does NOT own: entity spawning, animation logic (those live in script.js
 *               via registered handlers that close over its private vars).
 *
 * Adding a new cinematic:
 *   window.CinematicCore.register('mymode', {
 *     startPhase : 5,
 *     spawn()    { /* spawn entities for mymode *\/ },
 *     update(dt, timer, phase, goPhase) { /* animation — call goPhase(6) when done *\/ }
 *   });
 */
window.CinematicCore = (function () {
    'use strict';

    // ── Button keeplist (single source of truth) ─────────────────
    var KEEP_BUTTONS = [
        'wipe-btn', 'wipe-confirm', 'wipe-cancel',
        'speedrun-submit-btn', 'ranking-btn', 'ranking-close',
        'speedrun-start-btn', 'normal-mode-btn', 'adam-mode-btn',
        'fourth-mode-btn', 'endless-mode-btn',
        'mode-switch-cancel', 'mode-switch-confirm',
        // Botones del cartel final: si no están aquí, _disableButtons() los deja
        // disabled justo cuando el cartel aparece (la cinemática está activa).
        'rs-reto-btn', 'rs-restart-btn', 'rs-steam-btn', 'rs-view-ranking-btn'
    ];

    // ── Internal state ────────────────────────────────────────────
    var _phase    = 0;
    var _timer    = 0;
    var _preFade  = -1;   // -1 = inactive, 0+ = fading in
    var _active   = false;
    var _mode     = null;
    var _cbs      = null; // { onCommonSetup(), onStatsUpdate() }
    var _handlers = {};   // mode -> { startPhase, spawn(), update() }

    // ── Register a cinematic mode ────────────────────────────────
    function register(mode, handler) {
        _handlers[mode] = handler;
    }

    // ── Start (called from buy('retire')) ────────────────────────
    // callbacks = { onCommonSetup(), onStatsUpdate() }
    function start(mode, callbacks) {
        _mode    = mode;
        _cbs     = callbacks || {};
        _preFade = 0;
        _phase   = -1;
        _timer   = 0;
        _active  = true;
        _disableButtons();
        var gt = document.getElementById('game-tooltip');
        if (gt) gt.style.display = 'none';
    }

    // ── Enter end directly — re-entry with state.hasRetired=true ─
    function enterEnd() {
        _preFade = -1;
        _phase   = 4;
        _timer   = 0;
        _active  = true;
        _mode    = null;
        _cbs     = null;
    }

    // ── Reset (called from _switchToChallenge on new game) ───────
    function reset() {
        _hideStats();
        _setFade(0);
        _preFade = -1;
        _phase   = 0;
        _timer   = 0;
        _active  = false;
        _mode    = null;
        _cbs     = null;
        _enableButtons();
        document.body.classList.remove('is-cinematic');
    }

    // ── Update (called every frame from the game loop) ───────────
    function update(dt) {
        // ── Pre-fade: fade to black ──────────────────────────────
        if (_preFade >= 0) {
            _preFade += dt;
            _setFade(Math.min(1, _preFade));
            if (_preFade >= 1.0) {
                _preFade = -1;
                // Screen is black — run common game setup
                if (_cbs && _cbs.onCommonSetup) _cbs.onCommonSetup();
                // Show cinematic overlay / background
                _showCineRoot();
                // Mode-specific entity spawn
                var h = _handlers[_mode];
                if (h && h.spawn) h.spawn();
                // Begin animation at the mode's start phase
                _setPhase(h ? (h.startPhase != null ? h.startPhase : 5) : 5);
            }
            return;
        }

        if (!_active) return;

        _timer += dt;

        // ── Phase 6: dissolve to black ───────────────────────────
        if (_phase === 6) {
            _setFade(Math.min(1, _timer / 0.4));
            if (_timer >= 0.4) _setPhase(4);
            return;
        }

        // ── Phase 4: The End card ────────────────────────────────
        if (_phase === 4) {
            _setFade(_timer < 0.4 ? Math.max(0, 1 - _timer / 0.4) : 0);
            _showStats();
            return;
        }

        // ── Animation phases: delegate to mode handler ───────────
        var h = _handlers[_mode];
        if (h && h.update) h.update(dt, _timer, _phase, _setPhase);
    }

    // ── Phase transition ─────────────────────────────────────────
    function _setPhase(p) {
        _phase = p;
        _timer = 0;
        if (p === 4) {
            var rl = document.getElementById('rate-link');
            if (rl && window.PLATFORM && window.PLATFORM.showRateLink) rl.style.display = 'block';
        }
    }

    // ── cine-fade opacity ────────────────────────────────────────
    function _setFade(a) {
        var el = document.getElementById('cine-fade');
        if (el) el.style.opacity = Math.max(0, Math.min(1, a));
    }

    // ── retire-cine-root: show overlay + background ──────────────
    function _showCineRoot() {
        // Screen is fully black here — safe to change layout without visual jump
        document.body.classList.add('is-cinematic');
        if (typeof window.performDesktopAutoScale === 'function') window.performDesktopAutoScale();
        var root = document.getElementById('retire-cine-root');
        var cv   = document.getElementById('retireCineCanvas');
        if (!root || !cv) return;
        root.style.display = 'block';
        window._retireCineCtx = cv.getContext('2d');
        var bg = document.getElementById('retire-cine-bg');
        if (bg) bg.style.display = 'block'; // CSS handles size/position
    }

    // ── retire-stats-overlay: show + update content ──────────────
    function _showStats() {
        var el = document.getElementById('retire-stats-overlay');
        if (!el) return;
        if (el.style.display !== 'flex') {
            el.style.display = 'flex';
            document.body.classList.add('retire-stats-open');
        }
        if (_cbs && _cbs.onStatsUpdate) _cbs.onStatsUpdate();
    }

    function _hideStats() {
        var el = document.getElementById('retire-stats-overlay');
        if (!el || el.style.display !== 'flex') return;
        if (el.classList.contains('overlay-closing')) return;
        if (document.body.classList.contains('in-game')) {
            el.classList.add('overlay-closing');
            el.addEventListener('animationend', function () {
                el.style.display = 'none';
                el.classList.remove('overlay-closing');
                document.body.classList.remove('retire-stats-open');
            }, { once: true });
        } else {
            el.style.display = 'none';
            document.body.classList.remove('retire-stats-open');
        }
    }

    // ── Button disable / enable (keeplist is canonical here) ────────
    function _disableButtons() {
        document.querySelectorAll('.shop-btn, .pixel-btn').forEach(function (b) {
            if (!KEEP_BUTTONS.includes(b.id) &&
                !b.classList.contains('prado-play-btn') &&
                !b.classList.contains('prado-restart-btn')) {
                b.disabled = true;
            }
        });
    }

    function _enableButtons() {
        document.querySelectorAll('.shop-btn, .pixel-btn').forEach(function (b) {
            if (!KEEP_BUTTONS.includes(b.id) &&
                !b.classList.contains('prado-play-btn') &&
                !b.classList.contains('prado-restart-btn')) {
                b.disabled = false;
            }
        });
    }

    // ── Public API ────────────────────────────────────────────────
    return {
        register  : register,
        start     : start,
        enterEnd  : enterEnd,
        reset     : reset,
        update    : update,

        // Getters — script.js syncs its local vars from these
        get phase()   { return _phase;   },
        get timer()   { return _timer;   },
        get preFade() { return _preFade; },
        isActive()    { return _active;  }
    };
}());
