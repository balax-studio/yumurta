// portrait.js — Variables y CSS custom properties exclusivos para modo Portrait
// Carga después de layout.js y responsive.js.
// Modifica este archivo para ajustes portrait sin tocar layout.js ni style.css.

// ── Menú principal ──────────────────────────────────────────────────────────
// Todos los valores posicionales son relativos al viewport (vw / vh)
// para funcionar correctamente en cualquier móvil o tablet.
// Assets nativos: logo 174×60 | marco modo 89×59
window.MENU_PORTRAIT_LOGO_W_VW         = 88;    // Ancho del logo en % del ancho de pantalla (vw)
window.MENU_PORTRAIT_LOGO_LAND_Y_VH    = 51;    // Y donde cae la BASE del logo (% del alto de pantalla)
window.MENU_PORTRAIT_JUGAR_FROM_LOGO_VH = 20;    // Distancia desde BASE del logo hasta borde inferior del botón JUGAR (vh)
window.MENU_PORTRAIT_HIDE_JUGAR        = false;  // Ocultar botón JUGAR principal en portrait
window.MENU_PORTRAIT_CRATES_Y_VH       = 59;    // Y del borde superior de la fila de modos (% del alto de pantalla)
window.MENU_PORTRAIT_CRATE_W_VW        = 50;    // Ancho de cada carta de modo (% del ancho de pantalla) — ya era vw
window.MENU_PORTRAIT_BG_SCALE          = 1.3;   // Escala del fondo de intro (1.0 = tamaño natural, >1 amplía)
window.MENU_PORTRAIT_FOOTER_W          = 1;   // Estiramiento horizontal del footer (1.0 = sin estirar, solo afecta al ancho)
window.MENU_PORTRAIT_FOOTER_SCALE      = 3.2;   // Escala general del footer (afecta ancho Y alto a la vez)
window.MENU_PORTRAIT_FOOTER_BOTTOM     = 0;  // Desplazamiento desde el borde inferior en px
window.MENU_PORTRAIT_BOTTOM_BAR_Y      = -15;  // Offset desde el borde inferior del menú footer (positivo = sube)

// Sombras de suelo del menú principal (pseudo-elemento ::after y div #mm-logo-shadow)
// MENU_PORTRAIT_LOGO_SHADOW_AFTER_Y eliminado — posición calculada por _anchorShadowToRig() desde el DOM real
window.MENU_PORTRAIT_JUGAR_SHADOW_AFTER_Y = -5;   // bottom de #mm-jugar-btn::after
window.MENU_PORTRAIT_PRADO_SHADOW_AFTER_Y = 20;   // bottom de .mm-prado-mode-btn::after
window.MENU_PORTRAIT_PRADO_SHADOW_AFTER_W = 78;   // width de .mm-prado-mode-btn::after en %

// Iconos de modo (mode_icons.png) — equivalente portrait de MENU_MODE_ICON_SCALE / MENU_MODE_ICON_Y de layout.js
window.MENU_PORTRAIT_MODE_ICON_TOP     = 10;   // % desde borde superior del marco donde empieza el icono
window.MENU_PORTRAIT_MODE_ICON_SCALE   = 1.0;  // escala del icono (1.0 = 81% del ancho del marco, ratio natural 72/89)

// Getters en px para index.html — no editar, ajusta los _VH / _VW de arriba
Object.defineProperty(window, 'MENU_PORTRAIT_LOGO_LAND_Y', {
    get: function() { return Math.round(window.innerHeight * window.MENU_PORTRAIT_LOGO_LAND_Y_VH / 100); },
    configurable: true
});
Object.defineProperty(window, 'MENU_PORTRAIT_CRATES_Y', {
    get: function() { return Math.round(window.innerHeight * window.MENU_PORTRAIT_CRATES_Y_VH / 100); },
    configurable: true
});

// ── Límites visuales y de juego ─────────────────────────────────────────────
// Variables personalizables para calibrar los límites visuales en modo móvil (Portrait)
// Edita estos valores para ajustar exactamente las alturas Y lúdicas y visuales del escenario
window.PORTRAIT_MEADOW_LIMIT_Y_OVERRIDE = 525; // Límite inferior de caminata de gallinas (Línea roja)
window.PORTRAIT_EGG_LIMIT_Y_OVERRIDE = 535; // Nivel de suelo / caída de huevos (Línea celeste)

// Calibración para la cinta transportadora del sótano y el gato Sebastian en modo Portrait (Móvil)
window.PORTRAIT_UNDERGROUND_FLOOR_Y_OVERRIDE = 854; // Nivel Y de la cinta del sótano (Líneas magenta e inicio de cinta)
window.PORTRAIT_UNDERGROUND_EGG_FLOOR_Y_OVERRIDE = 854; // Suelo de colisión de huevos sueltos en el sótano (null = igual que UNDERGROUND_FLOOR_Y)
window.PORTRAIT_PACKAGE_FLOOR_Y_OFFSET = -6; // Desplazamiento Y adicional para cajas de huevos (negativo = más arriba, positivo = más abajo)
window.PORTRAIT_CAT_Y_OVERRIDE = 646; // Altura Y del Gato Sebastian (caseta de madera en el sótano)
window.PORTRAIT_CAT_SCALE_OVERRIDE = 3.25; // Escala del Gato Sebastian en modo Portrait (Móvil)

// Calibración para la cinta transportadora de la Granja (piso superior) en modo Portrait (Móvil)
window.PORTRAIT_FARM_BELT_Y_OVERRIDE = 535; // Altura Y del dibujo de la cinta de la granja (por defecto sigue al suelo de huevos)

// Calibración general de las cintas transportadoras (afecta a ambas: la de la
// Granja arriba y la de venta en el sótano) en modo Portrait (Móvil)
window.PORTRAIT_BELT_SCALE_OVERRIDE = 2.5; // Escala del sprite de la cinta (null = 2.0, igual que desktop)
window.PORTRAIT_BELT_Y_OVERRIDE = null; // Offset Y interno del dibujo de la cinta dentro de su contenedor (null = 0, igual que desktop)
window.PORTRAIT_BELT_END_PAD_OVERRIDE = null; // Recorte del extremo derecho de la cinta de venta, junto al hueco (null = -3, igual que desktop)
window.PORTRAIT_BELT_SELL_START_OVERRIDE = null; // Posición X de inicio de la cinta de venta, en el sótano (null = igual que desktop)
// Nota: la Y de la cinta de venta (sótano) NO tiene override propio — ya sigue
// PORTRAIT_UNDERGROUND_FLOOR_Y_OVERRIDE (más arriba), que fija el nivel del
// suelo del sótano completo (cinta, huevos sueltos, etc.).

// Nacimiento (X inicial) y ancho total de la cinta de la Granja (piso superior)
window.PORTRAIT_BELT_FARM_START_OVERRIDE = 80; // Posición X donde nace la cinta (null = HOLE_LEFT_X - 4, igual que desktop)
window.PORTRAIT_BELT_FARM_END_PAD_OVERRIDE = 6; // Ajuste del ancho total en el extremo derecho — a más valor, más ancha (null = 4)

// Calibración para la zona clicable de llenado del Bebedero y Comedero (Comida/Agua)
window.PORTRAIT_TROUGH_WATER_CLICK_WIDTH_OVERRIDE = 70; // Ancho de la zona clicable del bebedero (agua)
window.PORTRAIT_TROUGH_FOOD_CLICK_WIDTH_OVERRIDE = 70;  // Ancho de la zona clicable del comedero (comida)
window.PORTRAIT_TROUGH_CLICK_TOP_OFFSET_OVERRIDE = 0;  // Extensión vertical hacia arriba desde el borde superior dinámico
window.PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET_OVERRIDE = 0; // Extensión vertical hacia abajo desde el borde inferior dinámico

// Calibración para la radio/boombox en modo Portrait (Móvil)
window.PORTRAIT_BOOMBOX_X_OVERRIDE = null; // Posición X de la radio boombox (null para centrado automático)
window.PORTRAIT_BOOMBOX_Y_OVERRIDE = 400; // Posición Y de la radio boombox
window.PORTRAIT_BOOMBOX_SCALE_OVERRIDE = 3.5; // Escala de la radio boombox en modo Portrait (Móvil)

// Calibración para el contador de tiempo del modo Speedrun en modo Portrait (Móvil)
window.PORTRAIT_SPEEDRUN_COUNTER_X_OVERRIDE = 640; // Posición X del contador (null para centrado automático)
window.PORTRAIT_SPEEDRUN_COUNTER_Y_OVERRIDE = 570;  // Posición Y del contador
window.PORTRAIT_SPEEDRUN_COUNTER_SCALE_OVERRIDE = 3; // Escala del fondo (contador.png)
window.PORTRAIT_SPEEDRUN_COUNTER_W_OVERRIDE = 60;   // Ancho del contador (px de referencia, 800×900)
window.PORTRAIT_SPEEDRUN_COUNTER_TEXT_SCALE_OVERRIDE = 1.0; // Escala del texto del tiempo
window.PORTRAIT_SPEEDRUN_COUNTER_TEXT_Y_OVERRIDE = -1; // Offset Y del texto DENTRO del contador (px, relativo a él mismo)

// Calibración para Comedero, Bebedero y Grifos
window.PORTRAIT_TROUGH_WATER_X_OVERRIDE = 20;       // Posición X del Bebedero (izq)
window.PORTRAIT_TROUGH_FOOD_X_OVERRIDE = 740;       // Posición X del Comedero (der)
window.PORTRAIT_TROUGH_W_OVERRIDE = 40;            // Ancho del Bebedero y Comedero
window.PORTRAIT_TROUGH_CENTER_Y_OVERRIDE = 332;     // Altura Y central de Bebedero y Comedero
window.PORTRAIT_TROUGH_WATER_ANIM_X_OFFSET_OVERRIDE = window.TROUGH_WATER_ANIM_X_OFFSET;
window.PORTRAIT_TROUGH_WATER_ANIM_Y_OFFSET_OVERRIDE = window.TROUGH_WATER_ANIM_Y_OFFSET;
window.PORTRAIT_TROUGH_WATER_ANIM_SCALE_OVERRIDE = window.TROUGH_WATER_ANIM_SCALE;
window.PORTRAIT_TROUGH_WATER_ANIM_TOP_CROP_OVERRIDE = window.TROUGH_WATER_ANIM_TOP_CROP;
window.PORTRAIT_TROUGH_WATER_TEXT_Y_OFFSET_OVERRIDE = window.TROUGH_WATER_TEXT_Y_OFFSET;
window.PORTRAIT_FAUCET_X_OFFSET_OVERRIDE = 0;
window.PORTRAIT_FAUCET_Y_OFFSET_OVERRIDE = window.FAUCET_Y_OFFSET;
window.PORTRAIT_FAUCET_SCALE_OVERRIDE = 2.3;
window.PORTRAIT_FAUCET_ANIM_X_OFFSET_OVERRIDE = 18;
window.PORTRAIT_FAUCET_ANIM_Y_OFFSET_OVERRIDE = 10;
window.PORTRAIT_FAUCET_ANIM_SCALE_OVERRIDE = window.FAUCET_ANIM_SCALE;
window.PORTRAIT_FAUCET_ANIM_MAX_CROP_OVERRIDE = window.FAUCET_ANIM_MAX_CROP;

window.PORTRAIT_FAUCET_X_OVERRIDE = -14;           // Posición X del grifo bebedero (null para auto-centrado)
window.PORTRAIT_FAUCET_Y_OVERRIDE = 50;           // Posición Y del grifo bebedero (null para auto-centrado)
window.PORTRAIT_FOOD_PIPE_X_OVERRIDE = null;        // Posición X del grifo comedero (null para auto-centrado)
window.PORTRAIT_FOOD_PIPE_Y_OVERRIDE = 50;        // Posición Y del grifo comedero (null para auto-centrado)
window.PORTRAIT_FOOD_PIPE_X_OFFSET_OVERRIDE = window.FOOD_PIPE_X_OFFSET + 25;
window.PORTRAIT_FOOD_PIPE_Y_OFFSET_OVERRIDE = window.FOOD_PIPE_Y_OFFSET + 10;
window.PORTRAIT_FOOD_PIPE_SCALE_OVERRIDE = 2.3;
window.PORTRAIT_FOOD_PIPE_ANIM_X_OFFSET_OVERRIDE = window.FOOD_PIPE_ANIM_X_OFFSET;
window.PORTRAIT_FOOD_PIPE_ANIM_Y_OFFSET_OVERRIDE = window.FOOD_PIPE_ANIM_Y_OFFSET;
window.PORTRAIT_FOOD_PIPE_ANIM_SCALE_OVERRIDE = window.FOOD_PIPE_ANIM_SCALE;
window.PORTRAIT_FOOD_PIPE_ANIM_MAX_CROP_OVERRIDE = window.FOOD_PIPE_ANIM_MAX_CROP;
window.PORTRAIT_FOOD_ANIM_X_OFFSET_OVERRIDE = window.FOOD_ANIM_X_OFFSET;
window.PORTRAIT_FOOD_ANIM_Y_OFFSET_OVERRIDE = window.FOOD_ANIM_Y_OFFSET;
window.PORTRAIT_FOOD_ANIM_SCALE_OVERRIDE = window.FOOD_ANIM_SCALE;
window.PORTRAIT_FOOD_ANIM_TOP_CROP_OVERRIDE = window.FOOD_ANIM_TOP_CROP;

// Calibración de las máquinas del sótano en modo Portrait (Móvil)
window.PORTRAIT_WASHER_X_OVERRIDE = 205;
window.PORTRAIT_WASHER_Y_OVERRIDE = 799;
window.PORTRAIT_WASHER_SCALE_OVERRIDE = 3.65;

window.PORTRAIT_STAMPER_X_OVERRIDE = 310;
window.PORTRAIT_STAMPER_Y_OVERRIDE = null;
window.PORTRAIT_STAMPER_SCALE_OVERRIDE = 1.8;

window.PORTRAIT_PACKAGER_X_OVERRIDE = 455;
window.PORTRAIT_PACKAGER_Y_OVERRIDE = null;
window.PORTRAIT_PACKAGER_SCALE_OVERRIDE = 1.8;

window.PORTRAIT_RIBBON_X_OVERRIDE = null;
window.PORTRAIT_RIBBON_Y_OVERRIDE = null;
window.PORTRAIT_RIBBON_SCALE_OVERRIDE = 1.8;

window.PORTRAIT_SORTER_X_OVERRIDE = null;
window.PORTRAIT_SORTER_Y_OVERRIDE = null;
window.PORTRAIT_SORTER_SCALE_OVERRIDE = 1.5;

// Calibración para la televisión en modo Portrait (Móvil)
window.PORTRAIT_TV_X_OVERRIDE = 240;
window.PORTRAIT_TV_Y_OVERRIDE = 618;
window.PORTRAIT_TV_SCALE_OVERRIDE = 3.8;

// Calibración para la escala de las gallinas en modo Portrait (Móvil)
window.PORTRAIT_CHICKEN_SCALE_OVERRIDE = 1.5;


// Escala de las gallinas del menú intro (GameIntro) — independiente de las gallinas del juego
// La escala se aplica por elemento en _tick() de intro.js; no se usa transform en #mm-animals.
window.PORTRAIT_INTRO_CHICKEN_SCALE = 0.65;
// Cifra de venta — popup +$X al llegar un huevo al mercado
window.PORTRAIT_SELL_POPUP_X = 780;  // null = canvas.width - 40
window.PORTRAIT_SELL_POPUP_Y = 820;  // null = canvas.height - 30
window.PORTRAIT_SELL_POPUP_FONT_SIZE = 25;

// Cifras de relleno — popup -$X al hacer clic en bebedero o comedero
window.PORTRAIT_WATER_REFILL_POPUP_X = null;
window.PORTRAIT_FOOD_REFILL_POPUP_X = null;
window.PORTRAIT_REFILL_POPUP_FONT_SIZE = 30;

// ── CSS custom properties portrait ──────────────────────────────────────────
if (window.GAME_MODE === 'portrait') {
    var _lw = window.MENU_PORTRAIT_LOGO_W_VW;
    if (_lw != null) document.documentElement.style.setProperty('--portrait-logo-w', _lw + 'vw');
    var _ly = window.MENU_PORTRAIT_LOGO_LAND_Y_VH;
    if (_ly != null) document.documentElement.style.setProperty('--portrait-logo-land-y', _ly + 'vh');
    var _jg = window.MENU_PORTRAIT_JUGAR_FROM_LOGO_VH;
    if (_jg != null) document.documentElement.style.setProperty('--portrait-jugar-gap', _jg + 'vh');
    var _bs = window.MENU_PORTRAIT_BG_SCALE;
    if (_bs != null) document.documentElement.style.setProperty('--portrait-bg-scale', _bs);
    var _fw = window.MENU_PORTRAIT_FOOTER_W;
    if (_fw != null) document.documentElement.style.setProperty('--portrait-footer-w', _fw);
    var _fsc = window.MENU_PORTRAIT_FOOTER_SCALE;
    if (_fsc != null) document.documentElement.style.setProperty('--portrait-footer-scale', _fsc);
    var _fb = window.MENU_PORTRAIT_FOOTER_BOTTOM;
    if (_fb != null) document.documentElement.style.setProperty('--portrait-footer-bottom', _fb + 'px');
    var _bby = window.MENU_PORTRAIT_BOTTOM_BAR_Y;
    if (_bby != null) document.documentElement.style.setProperty('--portrait-bottom-bar-y', _bby + 'px');
    var _cs = window.PORTRAIT_CLOUD_SCALE;
    if (_cs != null) document.documentElement.style.setProperty('--portrait-cloud-scale', _cs);
    var _ics = window.PORTRAIT_INTRO_CHICKEN_SCALE;
    if (_ics != null) document.documentElement.style.setProperty('--portrait-intro-chicken-scale', _ics);

    // Sombras de suelo (::after y #mm-logo-shadow)
    document.documentElement.style.setProperty('--portrait-logo-shadow-after-y',  (window.MENU_PORTRAIT_LOGO_SHADOW_AFTER_Y  != null ? window.MENU_PORTRAIT_LOGO_SHADOW_AFTER_Y  : 0)  + 'px');
    document.documentElement.style.setProperty('--portrait-jugar-shadow-after-y', (window.MENU_PORTRAIT_JUGAR_SHADOW_AFTER_Y != null ? window.MENU_PORTRAIT_JUGAR_SHADOW_AFTER_Y : -5) + 'px');
    document.documentElement.style.setProperty('--portrait-prado-shadow-after-y', (window.MENU_PORTRAIT_PRADO_SHADOW_AFTER_Y != null ? window.MENU_PORTRAIT_PRADO_SHADOW_AFTER_Y : -1) + 'px');
    document.documentElement.style.setProperty('--portrait-prado-shadow-after-w', (window.MENU_PORTRAIT_PRADO_SHADOW_AFTER_W != null ? window.MENU_PORTRAIT_PRADO_SHADOW_AFTER_W : 92) + '%');

    // Iconos de modo
    document.documentElement.style.setProperty('--portrait-mode-icon-top', (window.MENU_PORTRAIT_MODE_ICON_TOP || 26) + '%');
    document.documentElement.style.setProperty('--portrait-mode-icon-w',   ((window.MENU_PORTRAIT_MODE_ICON_SCALE || 1) * 81) + '%');

    // NOTA: --portrait-bg-content-scale y --portrait-correct-ds se calculan en
    // DOMContentLoaded (no aquí) porque a la hora de parsear los scripts
    // window.innerHeight/outerWidth pueden no reflejar aún el tamaño real
    // (Chrome DevTools: outerWidth ≠ innerWidth; Android edge-to-edge: las
    // barras del sistema aún no han asentado su recorte) — producía un
    // _displayScale/escala de fondo exagerados durante los primeros frames
    // ("todo escalado de manera gigante, saliéndose de la pantalla").
    // Ver _fixScaleRoot() más abajo, donde ahora se calculan ambos juntos.
}


// ── Assets y navegación del menú en portrait ─────────────────────────────────
if (window.GAME_MODE === 'portrait') {
    document.addEventListener('DOMContentLoaded', function () {

        // Swap de assets
        document.querySelectorAll('.prado-crate-frame').forEach(function (img) {
            img.src = 'pixelart_design/themachinegg_modo_marco_portrait.png';
        });
        var introBg = document.getElementById('intro-bg-img');
        if (introBg) introBg.src = 'pixelart_design/bg_intro_portrait.png';
        var jugarCrate = document.querySelector('.mm-jugar-crate');
        if (jugarCrate) jugarCrate.src = 'pixelart_design/themachinegg_boton_patas_portrait.png';

        // Mover elementos al overlay (jugarBtn se queda en el canvas — debe moverse con la cámara)
        var row      = document.getElementById('mm-prado-crates-row');
        var overlay  = document.getElementById('main-menu-overlay');
        var jugarBtn = document.getElementById('mm-jugar-btn');
        if (!row || !overlay) return;
        overlay.appendChild(row);
        var bottomBar = document.getElementById('mm-bottom-bar');
        if (bottomBar) overlay.appendChild(bottomBar);

        // Footer decorativo — div con border-image para 9-slice izq/der
        var footerBg = document.createElement('div');
        footerBg.id  = 'mm-portrait-footer-bg';
        overlay.appendChild(footerBg);

        // Medir altura natural del sprite y exponerla como CSS var
        var _footerImg = new Image();
        _footerImg.onload = function () {
            document.documentElement.style.setProperty('--portrait-footer-natural-h', _footerImg.naturalHeight + 'px');
        };
        _footerImg.src = 'pixelart_design/bg_intro_footer_wood_portrait.png';

        // Panel de modos empieza fuera de plano (abajo del viewport)
        row.style.transition = 'none';
        row.style.top        = '110vh';

        // Botón JUGAR + footer: fade-in cuando el logo cae → _showButtons() pone pointer-events:auto
        if (jugarBtn) {
            var _jugarObserver = new MutationObserver(function () {
                if (jugarBtn.style.pointerEvents === 'auto') {
                    jugarBtn.classList.add('portrait-jugar-visible');
                    footerBg.classList.add('portrait-footer-visible');
                    if (window.GameIntro && window.GameIntro.enablePortraitTwoZones) {
                        window.GameIntro.enablePortraitTwoZones();
                    }
                    _jugarObserver.disconnect();
                }
            });
            _jugarObserver.observe(jugarBtn, { attributes: true, attributeFilter: ['style'] });
        }

        // Ancla mm-logo-shadow al rig para que siga al logo en cualquier pantalla.
        // index.html lo mueve a intro-pan-container (coordenadas px) durante la caída;
        // aquí lo devolvemos al rig con bottom relativo después de que aterriza.
        function _anchorShadowToRig() {
            var _ls   = document.getElementById('mm-logo-shadow');
            var _rig  = document.getElementById('mm-hang-rig');
            var _logo = document.getElementById('mm-logo');
            if (!_ls || !_rig) return;
            _ls.getAnimations().forEach(function (a) { a.cancel(); });
            // Move to rig first so subsequent reads are in rig-local space.
            _rig.appendChild(_ls);
            _ls.style.position  = 'absolute';
            _ls.style.bottom    = 'auto';
            _ls.style.left      = '50%';
            _ls.style.width     = '97%';
            _ls.style.opacity   = '0.58';
            _ls.style.transform = 'translateX(-50%) scaleX(1)';
            // Place shadow at logo foot using offsetTop/offsetHeight (rig-local layout px, scale-independent).
            // 4% of logo width below foot — same proportion as the fall setup in index.html.
            var footY   = _logo ? (_logo.offsetTop + _logo.offsetHeight) : _rig.offsetHeight;
            var shadowH = _ls.offsetHeight || 8;
            _ls.style.top = (footY + shadowH) + 'px';
        }

        // Devuelve el alto del viewport en píxeles de referencia del scale-root.
        // = innerHeight / ds_correcto (≈ 1080 en la mayoría de portables).
        // Se usa para animar el pan de la cámara exactamente un viewport visual completo.
        function _refH() {
            var ds = parseFloat(document.documentElement.style.getPropertyValue('--portrait-correct-ds')) || 0;
            return ds > 0 ? Math.round(window.innerHeight / ds) : window.innerHeight;
        }

        // ── Estado ───────────────────────────────────────────────────────────────
        var _open      = false;
        var _entryPanY = null;

        function _getPanY() {
            var c = document.getElementById('intro-pan-container');
            if (!c || !c.style.transform) return 0;
            var m = c.style.transform.match(/translateY\((-?[\d.]+)px\)/);
            return m ? parseFloat(m[1]) : 0;
        }

        // ── Abrir panel de modos: cámara baja + panel sube ───────────────────────
        function _openModesPanel() {
            _entryPanY = _getPanY();
            var cont = document.getElementById('intro-pan-container');

            if (jugarBtn) {
                jugarBtn.style.pointerEvents = 'none';
            }

            if (cont) {
                var toY = _entryPanY - _refH();
                cont.animate(
                    [{ transform: 'translateY(' + _entryPanY + 'px)' },
                     { transform: 'translateY(' + toY + 'px)' }],
                    { duration: 650, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
                ).addEventListener('finish', function () {
                    cont.style.transform = 'translateY(' + toY + 'px)';
                });
            }

            row.scrollTop = 0;
            row.style.overflowY   = 'hidden';
            row.style.transform   = '';
            row.style.transition  = 'top 650ms cubic-bezier(0.4, 0, 0.2, 1)';
            row.style.top         = '0';

            setTimeout(function () {
                row.style.pointerEvents = 'auto';
                row.querySelectorAll('.mm-prado-mode-btn').forEach(function (b) {
                    b.style.pointerEvents = 'auto';
                });
            }, 680);
        }

        // ── Cerrar panel de modos: cámara sube + panel baja ──────────────────────
        function _closeModesPanel() {
            _open = false;
            var cont = document.getElementById('intro-pan-container');

            row.style.pointerEvents = 'none';
            row.querySelectorAll('.mm-prado-mode-btn').forEach(function (b) {
                b.style.pointerEvents = 'none';
            });
            row.style.overflowY   = '';
            row.style.transform   = '';
            row.style.transition  = 'top 400ms cubic-bezier(0, 0, 0.2, 1)';
            row.style.top         = '110vh';

            if (cont && _entryPanY !== null) {
                var fromY = _entryPanY - _refH();
                cont.animate(
                    [{ transform: 'translateY(' + fromY + 'px)' },
                     { transform: 'translateY(' + _entryPanY + 'px)' }],
                    { duration: 400, easing: 'cubic-bezier(0, 0, 0.2, 1)', fill: 'forwards' }
                ).addEventListener('finish', function () {
                    cont.style.transform = 'translateY(' + _entryPanY + 'px)';
                });
            }

            setTimeout(function () {
                if (jugarBtn) {
                    var _inner = jugarBtn.querySelector('div');
                    if (_inner) _inner.style.transform = '';
                    jugarBtn.classList.add('portrait-jugar-visible');
                    jugarBtn.style.pointerEvents = 'auto';
                }
            }, 420);
        }

        // ── JUGAR click: capture bloquea _openModeScene() de index.html ──────────
        // Como usamos capture + stopImmediatePropagation, el handler de index.html (que lleva el
        // guard `_introDone`) NUNCA se ejecuta en portrait. Hay que repetir el guard aquí: si el
        // logo aún no ha aterrizado, el rig sigue en #mm-home (anclado a la cámara) y al bajar la
        // cámara a la zona de modos el logo bajaría con la vista en vez de quedarse en su sitio.
        if (jugarBtn) {
            jugarBtn.addEventListener('click', function (e) {
                e.stopImmediatePropagation();
                if (!_open && window._mmLogoSettled && !window._mmLogoSettled()) return;
                if (_open) {
                    _closeModesPanel();
                } else {
                    _open = true;
                    _openModesPanel();
                }
            }, { capture: true });
        }

        // ── VOLVER: cierra el panel de modos ─────────────────────────────────────
        var _volerBtn = document.getElementById('mm-prado-volver');
        if (_volerBtn) {
            _volerBtn.addEventListener('click', function () {
                if (_open) _closeModesPanel();
            });
        }

        // ── Scroll JS: opera sobre scrollTop directamente, ignora el eje inicial ──
        // overflow-y se pone a 'hidden' al abrir el panel para que el scroll nativo
        // no interfiera con este código.
        (function () {
            var _sY    = 0, _sTop  = 0;
            var _sPY   = 0, _sPT   = 0, _sVel = 0;
            var _sEdge = '', _sAmt = 0;
            var _momId = null;

            function _stopMom() {
                if (_momId) { cancelAnimationFrame(_momId); _momId = null; }
            }

            row.addEventListener('touchstart', function (e) {
                e.stopPropagation();
                _stopMom();
                _sY   = e.touches[0].clientY;
                _sTop = row.scrollTop;
                _sPY  = _sY;
                _sPT  = Date.now();
                _sVel = 0; _sAmt = 0;
                row.style.transition = 'none';
                row.style.transform  = '';
                _sEdge = row.scrollTop <= 0 ? 'top'
                       : row.scrollTop >= row.scrollHeight - row.clientHeight - 1 ? 'bottom'
                       : '';
            }, { passive: true });

            row.addEventListener('touchmove', function (e) {
                e.stopPropagation();
                var cy = e.touches[0].clientY, now = Date.now();
                if (now > _sPT) _sVel = (cy - _sPY) / (now - _sPT);
                _sPY = cy; _sPT = now;

                var dy  = cy - _sY;
                var tgt = _sTop - dy;
                var max = row.scrollHeight - row.clientHeight;

                if (tgt < 0) {
                    row.scrollTop = 0;
                    row.style.transform = 'translateY(' + Math.min(-tgt * 0.3, 80) + 'px)';
                    _sAmt = -tgt;
                } else if (tgt > max) {
                    row.scrollTop = max;
                    row.style.transform = 'translateY(' + Math.max(-(tgt - max) * 0.3, -80) + 'px)';
                    _sAmt = tgt - max;
                } else {
                    row.scrollTop = tgt;
                    row.style.transform = '';
                    _sAmt = 0;
                }
            }, { passive: true });

            row.addEventListener('touchend', function (e) {
                e.stopPropagation();
                if (_sEdge === 'top' && _sAmt > 60) {
                    _sEdge = ''; _sAmt = 0;
                    row.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                    row.style.transform  = '';
                    setTimeout(function () { row.style.transition = ''; }, 320);
                    _closeModesPanel();
                    return;
                }
                if (_sAmt > 0) {
                    _sEdge = ''; _sAmt = 0;
                    row.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                    row.style.transform  = '';
                    setTimeout(function () { row.style.transition = ''; }, 320);
                    return;
                }
                _sEdge = ''; _sAmt = 0;

                var vel    = _sVel * 1000;   // px/s
                var maxTop = row.scrollHeight - row.clientHeight;
                if (Math.abs(vel) < 50) return;
                var _lt = Date.now();
                _momId = requestAnimationFrame(function _tick() {
                    var now2 = Date.now(), dt = Math.min(now2 - _lt, 32) / 1000;
                    _lt = now2;
                    vel *= 0.94;
                    if (Math.abs(vel) < 10) { _momId = null; return; }
                    var nxt = Math.max(0, Math.min(row.scrollTop - vel * dt, maxTop));
                    row.scrollTop = nxt;
                    if (nxt <= 0 || nxt >= maxTop) { _momId = null; return; }
                    _momId = requestAnimationFrame(_tick);
                });
            }, { passive: true });

            // ── Mouse drag (desktop sin F12) ────────────────────────────────────
            var _mDragging = false;
            row.addEventListener('mousedown', function (e) {
                _stopMom();
                _mDragging = true;
                _sY   = e.clientY;
                _sTop = row.scrollTop;
                _sPY  = _sY; _sPT = Date.now();
                _sVel = 0; _sAmt = 0;
                _sEdge = row.scrollTop <= 0 ? 'top'
                       : row.scrollTop >= row.scrollHeight - row.clientHeight - 1 ? 'bottom'
                       : '';
                row.style.transition = 'none';
                row.style.userSelect = 'none';
                e.preventDefault();
            });
            document.addEventListener('mousemove', function (e) {
                if (!_mDragging) return;
                var cy = e.clientY, now = Date.now();
                if (now > _sPT) _sVel = (cy - _sPY) / (now - _sPT);
                _sPY = cy; _sPT = now;
                var dy  = cy - _sY;
                var tgt = _sTop - dy;
                var max = row.scrollHeight - row.clientHeight;
                if (tgt < 0) {
                    row.scrollTop = 0;
                    row.style.transform = 'translateY(' + Math.min(-tgt * 0.3, 80) + 'px)';
                    _sAmt = -tgt;
                } else if (tgt > max) {
                    row.scrollTop = max;
                    row.style.transform = 'translateY(' + Math.max(-(tgt - max) * 0.3, -80) + 'px)';
                    _sAmt = tgt - max;
                } else {
                    row.scrollTop = tgt;
                    row.style.transform = '';
                    _sAmt = 0;
                }
            });
            document.addEventListener('mouseup', function () {
                if (!_mDragging) return;
                _mDragging = false;
                row.style.userSelect = '';
                if (_sEdge === 'top' && _sAmt > 60) {
                    _sEdge = ''; _sAmt = 0;
                    row.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                    row.style.transform  = '';
                    setTimeout(function () { row.style.transition = ''; }, 320);
                    _closeModesPanel();
                    return;
                }
                if (_sAmt > 0) {
                    _sEdge = ''; _sAmt = 0;
                    row.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                    row.style.transform  = '';
                    setTimeout(function () { row.style.transition = ''; }, 320);
                    return;
                }
                _sEdge = ''; _sAmt = 0;
                var vel = _sVel * 1000;
                var maxTop = row.scrollHeight - row.clientHeight;
                if (Math.abs(vel) < 50) return;
                var _lt2 = Date.now();
                _momId = requestAnimationFrame(function _mTick() {
                    var now3 = Date.now(), dt = Math.min(now3 - _lt2, 32) / 1000;
                    _lt2 = now3;
                    vel *= 0.94;
                    if (Math.abs(vel) < 10) { _momId = null; return; }
                    var nxt = Math.max(0, Math.min(row.scrollTop - vel * dt, maxTop));
                    row.scrollTop = nxt;
                    if (nxt <= 0 || nxt >= maxTop) { _momId = null; return; }
                    _momId = requestAnimationFrame(_mTick);
                });
            });

            // ── Rueda del ratón ─────────────────────────────────────────────────
            row.addEventListener('wheel', function (e) {
                e.preventDefault();
                _stopMom();
                var max = row.scrollHeight - row.clientHeight;
                row.scrollTop = Math.max(0, Math.min(row.scrollTop + e.deltaY, max));
            }, { passive: false });
        })();

        row.addEventListener('click', function (e) { e.stopPropagation(); });

        // Safety: display:none → resetear posición instantáneamente
        var _safetyObserver = new MutationObserver(function () {
            if (row.style.display === 'none') {
                _open = false;
                row.style.transition = 'none';
                row.style.top        = '110vh';
            }
        });
        _safetyObserver.observe(row, { attributes: true, attributeFilter: ['style'] });

        // ── Corrección de escala del scale-root ──────────────────────────────────────────────
        // index.html llama a _applyScaling() con los scripts de página (antes de DOMContentLoaded),
        // cuando outerWidth puede ser diferente de innerWidth en Chrome DevTools mobile emulation.
        // Eso produce wrapper.width=physW, wrapper.scale=1/z, scaleRoot.scale=_displayScale
        // con _displayScale correcto visualmente (net = 0.863) PERO getBoundingClientRect no
        // siempre compone el wrapper.scale, dando medidas erróneas. Además, el CSS var
        // --portrait-correct-ds que es leído por portrait.css también se calcula aquí donde
        // outerWidth === innerWidth (z=1), dando el valor real correcto.
        //
        // La solución: corregir wrapper y scaleRoot directamente con los valores z=1 correctos,
        // y observar el scaleRoot para rehacerlo si _reflow() los cambia de nuevo.
        (function () {
            var _sr2 = document.getElementById('intro-scale-root');
            var _pw2 = document.getElementById('intro-pan-wrapper');
            if (!_sr2 || !_pw2) return;
            function _computeDs() {
                var _iw = window._safeInnerW ? window._safeInnerW() : window.innerWidth;
                var _ih = window._safeInnerH ? window._safeInnerH() : window.innerHeight;
                var z2 = window.outerWidth / (_iw || 1);
                if (z2 < 0.1 || z2 > 10) z2 = 1;
                return Math.max(_iw * z2 / 1920, _ih * z2 / 1080);
            }
            function _fixScaleRoot() {
                var _iw = window._safeInnerW ? window._safeInnerW() : window.innerWidth;
                var _ih = window._safeInnerH ? window._safeInnerH() : window.innerHeight;
                var ds2 = _computeDs();
                document.documentElement.style.setProperty('--portrait-correct-ds', ds2.toFixed(6));
                _pw2.style.width          = _iw + 'px';
                _pw2.style.height         = _ih + 'px';
                _pw2.style.transform      = 'scale(1)';
                _pw2.style.transformOrigin = 'top left';
                _sr2.style.transformOrigin = 'top center';
                _sr2.style.transform      = 'scale(' + ds2.toFixed(6) + ')';
                if (window._flashDiag) window._flashDiag('_fixScaleRoot', ds2);

                // Escala de contenido del fondo (usada por el footer para igualar la
                // escala visual del bg) — bg_intro_portrait.png nativo: 272×680px,
                // contenedor: 1264px alto + viewport. Calculada AQUÍ (no en el bloque
                // de arranque en frío) por el mismo motivo que --portrait-correct-ds.
                var _bcs = (1264 + _ih) / 680;
                document.documentElement.style.setProperty('--portrait-bg-content-scale', _bcs);
            }
            _fixScaleRoot();
            var _srObs2 = new MutationObserver(function () {
                // Fires when _applyScaling() overrides the transform; re-apply correct values.
                // Setting the same string a second time produces no attribute change → no re-entry.
                _fixScaleRoot();
            });
            _srObs2.observe(_sr2, { attributes: true, attributeFilter: ['style'] });
        })();

        // Fix logo X: _onLogoLand() (index.html) calcula left con _toRef2 = outerWidth/(innerWidth*ds).
        // En emulación mobile o ventana estrecha, outerWidth >> innerWidth → _toRef2 enorme → rig a la derecha.
        // Datos reales (DIAG-6): index.html puso left=1881px; correcto = 960 - offsetWidth/2 = 771px.
        // Solución: cuando el rig llega a #intro-pan-container, forzamos centrado en el container de 1920px.
        var _rigCont = document.getElementById('intro-pan-container');
        if (_rigCont) {
            var _rigObs = new MutationObserver(function (mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    var nl = mutations[i].addedNodes;
                    for (var j = 0; j < nl.length; j++) {
                        if (nl[j].id === 'mm-hang-rig') {
                            _rigObs.disconnect();
                            var rig = nl[j];
                            var cr  = _rigCont.getBoundingClientRect();
                            var ds  = cr.width > 0 ? cr.width / 1920 : 1;
                            // Restore portrait logo width in the scaled container.
                            // The CSS rule body.mode-portrait #mm-home #mm-hang-rig no longer
                            // applies once the rig leaves mm-home, so the width reverts to the
                            // inline clamp(275px,68vw,800px). We re-derive the reference-space
                            // equivalent of MENU_PORTRAIT_LOGO_W_VW so the visual size stays the same.
                            var _lwVW = window.MENU_PORTRAIT_LOGO_W_VW || 88;
                            var _targetPx = Math.round(window.innerWidth * _lwVW / 100);
                            rig.style.width = Math.round(_targetPx / ds) + 'px';
                            // Horizontal: viewport center en coordenadas de referencia del container
                            var refCX = (window.innerWidth / 2 - cr.left) / ds;
                            rig.style.left = Math.round(refCX - rig.offsetWidth / 2) + 'px';
                            // Vertical: la base del rig debe caer en MENU_PORTRAIT_LOGO_LAND_Y.
                            // index.html preserva el borde superior, pero el rig crece visualmente
                            // al entrar en el scale-root (offsetHeight * ds >> rr.height en mm-home).
                            var landY = window.MENU_PORTRAIT_LOGO_LAND_Y ||
                                        Math.round(window.innerHeight * (window.MENU_PORTRAIT_LOGO_LAND_Y_VH || 51) / 100);
                            rig.style.top = Math.round((landY - rig.offsetHeight * ds - cr.top) / ds) + 'px';
                            return;
                        }
                    }
                }
            });
            _rigObs.observe(_rigCont, { childList: true });
        }
    });
}

