// shared/utils.js — Pure utility functions shared across all scenarios
// Exposes window.GameUtils. No DOM dependencies, no game state.

window.GameUtils = {
    getCurrencySymbol() {
        const lang = window.currentLang || (typeof localStorage !== 'undefined' && localStorage.getItem('chickenIdleLang')) || '';
        return (lang === 'tr') ? '₺' : '$';
    },
    fmt(num) {
        if (num === undefined || num === null || isNaN(num)) return "0";
        return Math.floor(num).toLocaleString('en-US');
    },

    fmtShort(num) {
        if (num === undefined || num === null || isNaN(num)) return "0";
        const n = Math.floor(num);
        if (n < 10000) return n.toLocaleString('en-US');
        // Antes se quedaba pegado en "T" (billón) para siempre — Endless en
        // partidas largas ya lo supera de sobra. Sigue escalando en vez de
        // mostrar un número gigante detrás de la T.
        const suf = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
        const tier = Math.min(Math.floor(Math.log10(n) / 3), suf.length - 1);
        const scaled = n / Math.pow(1000, tier);
        return scaled.toFixed(scaled < 10 ? 2 : 1) + suf[tier];
    },

    fmtMoney(num) {
        if (num === undefined || num === null || isNaN(num)) return "0";
        if (num === 0) return "0";
        if (num < 1) return num.toFixed(2);
        if (num < 10) return num.toFixed(1);
        return Math.floor(num).toLocaleString('en-US');
    },

    getMousePos(e, canvas) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    },

    formatTimeSecs(s) {
        const totalMin = Math.floor(s / 60);
        const sec      = Math.floor(s % 60);
        return `${String(totalMin).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    },

    getPips(cur, max) {
        cur = Math.min(cur, max);
        const pips = '<span style="line-height: 20px;color:#ed8099;letter-spacing:1px;">' + '■'.repeat(cur)
            + '</span><span style="line-height: 20px;color:white;letter-spacing:1px;">' + '□'.repeat(Math.max(0, max - cur)) + '</span>';
        return `<br><span class="btn-row2"><span class="upg-info"></span><span class="lv-corner">${pips}</span></span>`;
    }
};
