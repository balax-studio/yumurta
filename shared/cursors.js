// shared/cursors.js — Cursores del juego, generados desde pixelart_design/cursors.png
//
// El sprite es 48×16: TRES tiles de 16×16, que se escalan a 32×32 al generarlos.
//   tile 0 → MANO   · cursor por defecto en TODO el juego
//   tile 1 → IMÁN   · en el canvas, al arrastrar/atraer huevos
//   tile 2 → DEDO   · al pasar por encima de un botón o elemento clicable
//
// Se publican como variables CSS en :root (--cur-hand / --cur-magnet / --cur-finger),
// así el CSS puede usarlos en cualquier selector sin tocar JS:
//     body   { cursor: var(--cur-hand); }
//     button { cursor: var(--cur-finger); }
//
// Cada cursor lleva un fallback nativo (default / grabbing / pointer) que actúa hasta
// que carga la imagen, y también si no llegara a cargar.
//
// Antes esta lógica estaba DUPLICADA en scenarios/farm/script.js y shared/intro.js, cada
// uno cargando el PNG por su cuenta y con hotspots distintos. Ahora es la única fuente.
window.GameCursors = (function () {
    'use strict';

    const SRC = 'pixelart_design/cursors.png';
    const TILE = 16;   // tamaño del tile en el sprite
    const OUT  = 32;   // tamaño del cursor generado (x2, pixelado)

    // Hotspot = punto exacto que "hace clic", en coordenadas del cursor ya escalado (32×32).
    // Sacados de la punta real de cada dibujo, no a ojo.
    const TILES = {
        hand:   { x: 0,           hot: [16, 4],  fallback: 'default'  },
        magnet: { x: TILE,        hot: [16, 16], fallback: 'grabbing' }, // centro: es el punto de atracción
        finger: { x: TILE * 2,    hot: [10, 6],  fallback: 'pointer'  }, // la yema del dedo
    };

    const _built = {};

    function _make(img, t) {
        const cvs = document.createElement('canvas');
        cvs.width = OUT; cvs.height = OUT;
        const c = cvs.getContext('2d');
        c.imageSmoothingEnabled = false;   // pixel art: nada de suavizado
        c.drawImage(img, t.x, 0, TILE, TILE, 0, 0, OUT, OUT);
        return 'url(' + cvs.toDataURL('image/png') + ') ' + t.hot[0] + ' ' + t.hot[1] + ', ' + t.fallback;
    }

    const _ready = new Promise(function (resolve) {
        const img = new Image();
        img.onload = function () {
            const root = document.documentElement;
            for (const k in TILES) {
                _built[k] = _make(img, TILES[k]);
                root.style.setProperty('--cur-' + k, _built[k]);
            }
            resolve(_built);
        };
        // Si no carga, no pasa nada: las variables CSS conservan sus fallbacks nativos.
        img.onerror = function () { resolve(_built); };
        img.src = SRC;
    });

    return {
        ready: _ready,                              // promesa: resuelve cuando están listos
        get: function (name) { return _built[name] || null; },
    };
}());
