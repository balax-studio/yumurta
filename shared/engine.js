// shared/engine.js — Core game engine: loop, pause, orientation, background-tab, tooltip
// Exposes window.GameEngine. Loaded before scenario scripts.

window.GameEngine = (() => {
    let _update = null;
    let _draw   = null;
    let _onTabResume = null;

    let _lastTime        = 0;
    let _currentFps      = 0;
    let _framesThisSecond = 0;
    let _lastFpsTime     = 0;
    let _bgInterval      = null;
    let _bgLastTime      = 0;
    let _bgHiddenAt      = 0;

    // Per-subsystem timing (rolling 60-frame buffers)
    let _tickBuf = [];
    let _drawBuf = [];
    const _BUF = 60;

    window.gamePaused         = false;
    window.isOrientationPaused = false;

    function loop(timestamp) {
        if (!_lastFpsTime) _lastFpsTime = timestamp;
        if (timestamp - _lastFpsTime >= 1000) {
            _currentFps      = _framesThisSecond;
            _framesThisSecond = 0;
            _lastFpsTime     = timestamp;
        }
        _framesThisSecond++;

        let dt = (timestamp - _lastTime) / 1000;
        if (isNaN(dt) || dt > 0.1) dt = 0.016;
        _lastTime = timestamp;

        if (!window.gamePaused && !window.isOrientationPaused) {
            const _t0 = performance.now();
            if (_update) _update(dt);
            const _t1 = performance.now();
            if (_draw)   _draw();
            const _t2 = performance.now();
            if (_tickBuf.length >= _BUF) _tickBuf.shift();
            if (_drawBuf.length >= _BUF) _drawBuf.shift();
            _tickBuf.push(_t1 - _t0);
            _drawBuf.push(_t2 - _t1);
        }

        requestAnimationFrame(loop);
    }

    function start({ update, draw, onTabResume }) {
        _update      = update;
        _draw        = draw;
        _onTabResume = onTabResume || null;
        _lastTime    = performance.now();

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                _bgHiddenAt = Date.now();
                _bgLastTime = _bgHiddenAt;
                _bgInterval = setInterval(() => {
                    if (window.gamePaused || window.isOrientationPaused) return;
                    const now = Date.now();
                    const elapsed = (now - _bgLastTime) / 1000;
                    _bgLastTime = now;
                    // Run in small steps (max 0.1s each) so physics stays stable
                    const STEP = 0.1;
                    const steps = Math.min(Math.ceil(elapsed / STEP), 8);
                    const stepDt = elapsed / steps;
                    for (let i = 0; i < steps; i++) {
                        if (_update) _update(Math.min(stepDt, STEP));
                    }
                }, 250);
            } else {
                if (_bgInterval) { clearInterval(_bgInterval); _bgInterval = null; }
                _lastTime = performance.now();
                if (_onTabResume) _onTabResume();
            }
        });

        requestAnimationFrame(loop);
    }

    function setupOrientation(onPause, onResume) {
        function check() {
            // Si el juego arrancó en portrait mode (soportado), no pausar
            if (window.GAME_MODE === 'portrait') return;
            if (window.matchMedia('(max-width: 950px) and (orientation: portrait)').matches) {
                window.isOrientationPaused = true;
                if (onPause) onPause();
            } else {
                window.isOrientationPaused = false;
                _lastTime = performance.now();
                if (onResume) onResume();
            }
        }
        window.addEventListener('resize', check);
        window.addEventListener('orientationchange', check);
        check();
    }

    // titleTransform(btn, title) → string — optional hook for scenario-specific title tweaks
    function setupTooltip(tooltipEl, titleTransform) {
        if (!tooltipEl) return;
        document.querySelectorAll('.shop-btn, .pixel-btn').forEach(btn => {
            btn.addEventListener('mousemove', (e) => {
                if (window.infoMode) { tooltipEl.style.display = 'none'; return; }
                let title = btn.getAttribute('data-title') || btn.getAttribute('title');
                if (titleTransform) title = titleTransform(btn, title) || title;
                if (title) {
                    tooltipEl.innerHTML = title;
                    tooltipEl.style.display = 'block';
                    let x = e.clientX + 15, y = e.clientY + 15;
                    if (x + tooltipEl.offsetWidth  > window.innerWidth)  x = window.innerWidth  - tooltipEl.offsetWidth  - 10;
                    if (y + tooltipEl.offsetHeight > window.innerHeight) y = window.innerHeight - tooltipEl.offsetHeight - 10;
                    tooltipEl.style.left = x + 'px';
                    tooltipEl.style.top  = y + 'px';
                }
            });
            btn.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
        });
    }

    function getFps()    { return _currentFps; }
    function resetTime() { _lastTime = performance.now(); }
    function getTimings() {
        const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const max = arr => arr.length ? Math.max(...arr) : 0;
        return {
            tickAvg: avg(_tickBuf), tickMax: max(_tickBuf),
            drawAvg: avg(_drawBuf), drawMax: max(_drawBuf),
        };
    }

    return { start, setupOrientation, setupTooltip, getFps, resetTime, getTimings };
})();
