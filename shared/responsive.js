// shared/responsive.js — Detección de modo y tamaño de canvas
// Se carga ANTES que layout.js y script.js.
// Expone window.GAME_MODE: 'desktop' | 'portrait' | 'landscape'

window.GAME_MODE = (() => {
    // ?mode= override for dev/testing
    const _modeParam = new URLSearchParams(window.location.search).get('mode');
    if (_modeParam === 'portrait' || _modeParam === 'desktop') return _modeParam;

    // En el build de Android (googleplay), window.innerWidth/innerHeight pueden
    // reportar valores transitorios/incorrectos justo al arrancar — la app usa
    // un WebView "edge-to-edge" (barras del sistema transparentes/superpuestas,
    // ver MainActivity.setDecorFitsSystemWindows(false)) que tarda unos frames en
    // asentar su recorte real. Esto provocaba, en cold start, que se detectara
    // brevemente 'desktop' en vez de 'portrait' (logo/layout mal dimensionado
    // una fracción de segundo, hasta que el listener de resize detectaba el
    // desajuste y recargaba la página). La app está bloqueada a portrait a
    // nivel de Android (android:screenOrientation="portrait" en el manifest),
    // así que screen.width/height son fiables desde el primer frame y no
    // dependen de que el WebView termine de asentar sus insets.
    const _isNativeStore = (window.GAME_MARKET === ['google', 'play'].join('') || window.GAME_MARKET === 'appstore' || !!window.Capacitor?.isNativePlatform?.());
    const w = (_isNativeStore ? screen.width  : window.innerWidth)  || screen.width;
    const h = (_isNativeStore ? screen.height : window.innerHeight) || screen.height;
    if (h > w) return 'portrait';
    return 'desktop';
})();

// Mismo motivo que arriba — expuesto para que index.html (_physVW/_physVH,
// que alimentan _applyScaling()/_displayScale) y portrait.js (_computeDs(),
// que corrige ese escalado tras DOMContentLoaded) usen la MISMA fuente fiable
// en vez de cada uno leer window.innerWidth/innerHeight por su cuenta — si
// ambos leen el valor transitorio incorrecto a la vez, la "corrección" no
// corrige nada y el flash de escala exagerada persiste hasta que el valor se
// asiente solo.
const _isNativeStoreGlobal = (window.GAME_MARKET === ['google', 'play'].join('') || window.GAME_MARKET === 'appstore' || !!window.Capacitor?.isNativePlatform?.());
window._safeInnerW = function () { return _isNativeStoreGlobal ? screen.width  : window.innerWidth; };
window._safeInnerH = function () { return _isNativeStoreGlobal ? screen.height : window.innerHeight; };

// Dimensiones de canvas según modo
const _CANVAS_SIZES = {
    desktop:   { w: 800, h: 650 },
    landscape: { w: 800, h: 650 },
    portrait:  { w: 800, h: 900 },
};

const _sz = _CANVAS_SIZES[window.GAME_MODE];

// Aplica tamaño al elemento canvas y calcula el LAYOUT
document.addEventListener('DOMContentLoaded', () => {
    // Clase CSS en body para estilos adaptativos
    document.body.classList.add('mode-' + window.GAME_MODE);

    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
        canvas.width  = _sz.w;
        canvas.height = _sz.h;
    }

    if (typeof _applyLayout === 'function') {
        _applyLayout(_sz.w, _sz.h);
    }
});

// Guardar para que layout.js lo use al cargar
window._RESPONSIVE_W = _sz.w;
window._RESPONSIVE_H = _sz.h;

// Debug: log inicial de resolución y modo
console.log(`[RES] ${window.innerWidth}x${window.innerHeight} → mode=${window.GAME_MODE}`);

// Resize: si el modo cambiaría, recargar para reinicializar layout y canvas
let _resizeDebounce = null;
window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    const orient = h > w ? 'portrait' : (w > h ? 'landscape' : 'square');
    console.log(`[RES] resize → ${w}x${h} orient=${orient} mode=${window.GAME_MODE}`);

    // Skip override via ?mode=
    const _modeParam = new URLSearchParams(window.location.search).get('mode');
    if (_modeParam) return;

    // En Android la orientación está bloqueada a portrait (ver AndroidManifest) —
    // un "resize" ahí es el teclado abriéndose/cerrándose (p.ej. al escribir el
    // nombre en el ranking), no un cambio real de modo. window.innerHeight se
    // reduce con el teclado abierto y podría disparar una recarga en mitad de
    // una partida si no se descarta aquí.
    if (_isNativeStoreGlobal) return;

    function _calcMode(w, h) {
        if (h > w) return 'portrait';
        return 'desktop';
    }

    clearTimeout(_resizeDebounce);
    _resizeDebounce = setTimeout(() => {
        const newMode = _calcMode(window.innerWidth, window.innerHeight);
        if (newMode !== window.GAME_MODE) {
            console.log(`[RES] mode change ${window.GAME_MODE} → ${newMode}, reloading`);
            window.location.reload();
        }
    }, 400);
});
