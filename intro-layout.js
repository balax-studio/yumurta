// intro-layout.js — Layout de la intro del menú principal por resolución.
// =========================================================================
// Modifica este archivo para ajustar el posicionamiento sin tocar la lógica.
// Los cambios se aplican en la siguiente recarga.
//
// OPCIÓN B (canvas virtual 1920×2229): todos los valores son en píxeles de
// referencia 1920×1080. La escena siempre se renderiza igual en todas las
// pantallas; solo cambia el zoom general. Los breakpoints usan window.innerWidth
// para distinguir tamaños de dispositivo y ajustar panFrac si se desea.
//
// ── Parámetros ────────────────────────────────────────────────────────────
//
//  panFrac
//    Fracción del espacio disponible que avanza la cámara al terminar la intro.
//    Espacio disponible = vh − h  (normalmente negativo: el contenedor es más alto).
//    0.80 → la cámara baja el 80 % de ese espacio (queda un 20 % oculto debajo).
//    0.65 → la cámara baja solo el 65 % (queda más cielo visible, más prado oculto).
//
//  logoFrac, logoOffset, logoMinFall
//    El logo cae hasta que su BORDE INFERIOR llegue a:
//      max(logoMinFall, vh × logoFrac − alturaRig − topRig) + logoOffset  px
//    logoFrac    → fracción de vh como objetivo (0.50 = mitad de pantalla)
//    logoOffset  → px extra añadidos tras el cálculo (empuja el logo más abajo)
//    logoMinFall → caída mínima garantizada antes de añadir logoOffset
//
//  modePanFrac, modePanMin, modePanExtra
//    Al pulsar JUGAR la cámara baja adicionalmente:
//      min(oculto, max(modePanMin, oculto × modePanFrac)) + modePanExtra  px
//    "oculto" = contenido que queda debajo del viewport tras el pan inicial.
//
//  Botón JUGAR
//    Controlado por window.MENU_PLAY_BTN_BOTTOM en layout.js (px desde borde inferior).
// ──────────────────────────────────────────────────────────────────────────

window.INTRO_LAYOUT = (function () {

    // maxVW     panFrac   logoFrac  logoOffset  logoMinFall   modePanFrac  modePanMin  modePanExtra  modeCratesBotPx
    // logoOffset bajado de 150 a 0: empujaba el logo 150px POR DEBAJO del centro
    // calculado (logoFrac=0.50 ya apunta al medio del alto visible) — pedido:
    // "sube el logo... para que esté siempre en el centro del alto". Además, al
    // caer tan abajo, la lógica anti-solape de _onLogoLand() (index.html, "On
    // very short viewports the JUGAR button may overlap the logo sign") empujaba
    // el botón JUGAR aún MÁS abajo para no pisar el logo — con el logo centrado
    // esa lógica ya no debería tener que actuar, así que arregla las dos cosas.
    var _bp = [
        { maxVW:  1088, panFrac: 0.65, logoFrac: 0.50, logoOffset: 0, logoMinFall: 120, modePanFrac: 0.85, modePanMin: 80, modePanExtra: 60, modeCratesBotPx: 70 },
        { maxVW:  1920, panFrac: 0.65, logoFrac: 0.50, logoOffset: 0, logoMinFall: 120, modePanFrac: 0.85, modePanMin: 80, modePanExtra: 60, modeCratesBotPx: 70 },
        { maxVW: 99999, panFrac: 0.65, logoFrac: 0.50, logoOffset: 0, logoMinFall: 120, modePanFrac: 0.85, modePanMin: 80, modePanExtra: 60, modeCratesBotPx: 70 },
    ];

    // Portrait override — fence at ~39% from viewport top; reduce to see more sky, increase for less.
    var _portraitPanFrac = 0.65;

    function get() {
        if (window.GAME_MODE === 'portrait') {
            var _base = _bp[0];
            return { maxVW: _base.maxVW, panFrac: _portraitPanFrac, logoFrac: _base.logoFrac,
                     logoOffset: _base.logoOffset, logoMinFall: _base.logoMinFall,
                     modePanFrac: _base.modePanFrac, modePanMin: _base.modePanMin,
                     modePanExtra: _base.modePanExtra, modeCratesBotPx: _base.modeCratesBotPx };
        }
        var vw = window.innerWidth;
        for (var i = 0; i < _bp.length; i++) {
            if (vw <= _bp[i].maxVW) return _bp[i];
        }
        return _bp[_bp.length - 1];
    }

    return { get: get };
})();
