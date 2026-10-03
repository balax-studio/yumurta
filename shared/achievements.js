// shared/achievements.js — Achievement display & storage engine
// Exposes window.GameAchievements. Loaded before script.js.
// Scenario-specific definitions are injected via init(defs, getState).

window.GameAchievements = (() => {
    let _defs     = [];
    let _getState = () => ({});

    let _unlockedAchievements = new Set();
    let _achQueue   = [];
    let _achShowing = false;

    function load() {
        try {
            const saved = JSON.parse(localStorage.getItem('chickenIdleAchievements') || '[]');
            _unlockedAchievements = new Set(saved);
        } catch(e) { _unlockedAchievements = new Set(); }
    }

    function _save() {
        localStorage.setItem('chickenIdleAchievements', JSON.stringify([..._unlockedAchievements]));
    }

    function _showNext() {
        if (_achQueue.length === 0) { _achShowing = false; return; }
        _achShowing = true;
        const ach = _achQueue.shift();
        const el  = document.getElementById('achievement-popup');
        if (!el) { _achShowing = false; return; }
        const t     = window.t || (k => k);
        const title = (ach.i18nKey && t(ach.i18nKey) !== ach.i18nKey) ? t(ach.i18nKey) : ach.title;
        const desc  = (ach.i18nKey && t(ach.i18nKey + '_tip') !== ach.i18nKey + '_tip') ? t(ach.i18nKey + '_tip') : ach.desc;
        document.getElementById('achievement-title').textContent = title;
        document.getElementById('achievement-desc').textContent  = desc;
        el.classList.add('show');
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(_showNext, 500);
        }, 3500);
    }

    function _trigger(ach) {
        _unlockedAchievements.add(ach.id);
        _save();
        _achQueue.push(ach);
        if (!_achShowing) _showNext();
    }

    function init(defs, getState) {
        _defs     = defs;
        _getState = getState;
        load();
    }

    function check() {
        const s = _getState();
        _defs.forEach(a => {
            if (!_unlockedAchievements.has(a.id)) {
                try { if (a.check(s)) _trigger(a); } catch(e) {}
            }
        });
    }

    function renderPause(fmt) {
        const countEl = document.getElementById('ach-count');
        const listEl  = document.getElementById('ach-list');
        if (!countEl || !listEl) return;
        const s = _getState();
        countEl.textContent = `(${_unlockedAchievements.size}/${_defs.length})`;
        listEl.innerHTML = '';
        const t   = window.t || (k => k);
        const tip = document.getElementById('game-tooltip');
        _defs.forEach(a => {
            const done = _unlockedAchievements.has(a.id);
            const prog = a.progress ? a.progress(s) : null;
            const pct  = prog ? Math.min(1, prog.cur / prog.max) : (done ? 1 : 0);
            const pctStr = Math.round(pct * 100) + '%';

            const curVal     = prog ? Math.min(prog.cur, prog.max) : null;
            const tooltipHtml = t(a.i18nKey + '_tip') + (curVal !== null ? ' (' + fmt(curVal) + ')' : '');

            const btn = document.createElement('div');
            btn.setAttribute('data-title', tooltipHtml);
            btn.className = 'ach-item ' + (done ? 'ach-item--done' : 'ach-item--locked');

            if (!done && pct > 0) {
                const fill = document.createElement('div');
                fill.className = 'ach-item-fill';
                fill.style.width = pctStr;
                btn.appendChild(fill);
            }

            const label = document.createElement('span');
            label.className = 'ach-item-label';
            label.textContent = t(a.i18nKey);
            btn.appendChild(label);

            if (tip) {
                btn.addEventListener('mousemove', (e) => {
                    tip.innerHTML = btn.getAttribute('data-title');
                    tip.style.display = 'block';
                    let x = e.clientX + 15, y = e.clientY + 15;
                    if (x + tip.offsetWidth > window.innerWidth)  x = window.innerWidth  - tip.offsetWidth  - 10;
                    if (y + tip.offsetHeight > window.innerHeight) y = window.innerHeight - tip.offsetHeight - 10;
                    tip.style.left = x + 'px';
                    tip.style.top  = y + 'px';
                });
                btn.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
            }
            listEl.appendChild(btn);
        });
    }

    return { init, load, check, renderPause };
})();
