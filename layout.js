// ============================================================
//  LAYOUT.JS — Posiciones del juego
//
//  buildLayout(cw, ch) genera todas las coordenadas para cualquier
//  tamaño de canvas. Los anchors X son siempre relativos al
//  ancho de referencia (800). Los anchors Y se escalan según la
//  altura del canvas.
//
//  Llama _applyLayout(cw, ch) para aplicar window.LAYOUT.
//  shared/responsive.js lo hace automáticamente al cargar.
// ============================================================

// ── Modo debug ───────────────────────────────────────────────────────────────
window.DEBUG = false;

// ── Cinemáticas ─────────────────────────────────────────────────────────────
// Los ajustes de cinemática YA NO viven aquí. Están en scenarios/farm/cinematic.js
// (bloque CONFIG), que es el único dueño de la cinemática final.
//
// Se movieron 8 constantes vivas; las otras 14 que había aquí estaban MUERTAS
// (nunca se leían desde ningún sitio) y se han borrado — entre ellas todas las
// _DESKTOP, que eran los únicos ajustes por resolución. La cinemática se dibuja
// en un canvas CUADRADO de 400×400 escalado a min(100vw,100vh): es
// resolución-independiente y no necesita variantes.

// ── Menú principal: escalas y posicionamiento de assets ─────────────────────
// Assets nativos: logo 174×60 | botón Play 80×38 | marco modo 89×59 | icono modo 90×28
window.MENU_LOGO_SCALE      = 3;   // Escala de renderizado del logo (themachinegg_logo.png)
window.MENU_PLAY_BTN_SCALE  = 3;   // Escala del botón Play (themachinegg_boton_patas.png)
window.MENU_PLAY_BTN_BOTTOM = 180;  // px desde el borde inferior del viewport visible hasta el botón JUGAR (mayor = más arriba)
window.MENU_MODE_SCALE      = 8;   // Escala del marco de modo Y de sus iconos (factor idéntico, themachinegg_modo_marco + mode_icons)
window.MENU_MODE_ICON_SCALE = 1.1; // Escala del icono de modo independiente del marco (1.0 = ajuste natural 72/89 ≈ 81% del ancho del marco)
window.MENU_MODE_ICON_X     = 0;   // Offset X del icono dentro del marco, en px nativos (icono 72px ≈ marco 89px → ~0)
window.MENU_MODE_ICON_Y     = 3;   // Offset Y del icono dentro del marco, en px nativos (centrado vertical: (59-28)/2 ≈ 15)

// ── Menú principal: texto y botones dentro de cada crate de modo (prado) ────
window.MENU_PRADO_NAME_BOTTOM    = 86;   // % desde el borde inferior del marco para el nombre del modo
window.MENU_PRADO_NAME_SIZE      = 14;  // Tamaño de fuente base (px) del nombre del modo
window.MENU_PRADO_DESC_SIZE      = 10;   // Tamaño de fuente base (px) de la descripción del modo
window.MENU_PRADO_INNER_PAD      = 6;   // % de padding horizontal interior del marco (aplica a descripción y fila de botones)
window.MENU_PRADO_DESC_TOP       = 45;  // % desde el borde superior del marco para la descripción (dentro del marco)
window.MENU_PRADO_PLAY_SIZE      = 13;   // Tamaño de fuente base (px) del botón Play / Continuar
window.MENU_PRADO_BTN_H          = 50;  // Altura (px) compartida del botón Play y del botón Reiniciar
window.MENU_PRADO_ACTIONS_BOTTOM = 8;  // % desde el borde inferior del marco para la fila de botones Play+Restart
window.MENU_PRADO_RESTART_SIZE   = 10;   // Tamaño de fuente base (px) del botón Reiniciar

// Techo del sótano en PC (solo colisión, no afecta visuals del sótano)
// null = automático (ugCeil). Poner valor en px para forzar.
window.DESKTOP_UNDERGROUND_CEILING_Y_OVERRIDE = 473;

// Calibración de escala de máquinas en modo Desktop (PC)
window.DESKTOP_WASHER_SCALE = 2.82;
window.DESKTOP_STAMPER_SCALE = 1.35;
window.DESKTOP_PACKAGER_SCALE = 1.35;
window.DESKTOP_RIBBON_SCALE = 1.35;
window.DESKTOP_SORTER_SCALE = 1.35;
window.DESKTOP_TV_SCALE = 3.0;
window.DESKTOP_CAT_SCALE = 2.13;
window.DESKTOP_BOOMBOX_SCALE = 2.0; // ver getter BOOMBOX_SCALE para el valor actual
window.DESKTOP_CHICKEN_SCALE = 1.0;

// Contador de tiempo del modo Speedrun (solo visible en ese reto) — ver
// getters SPEEDRUN_COUNTER_* más abajo para el equivalente en modo Portrait.
window.DESKTOP_SPEEDRUN_COUNTER_SCALE      = 1.5;  // Escala del fondo (contador.png)
window.DESKTOP_SPEEDRUN_COUNTER_W          = 60;   // Ancho del contador (px de referencia, 800×650)
window.DESKTOP_SPEEDRUN_COUNTER_TEXT_SCALE = 1.0;  // Escala del texto del tiempo
window.DESKTOP_SPEEDRUN_COUNTER_TEXT_Y     = -1;    // Offset Y del texto DENTRO del contador (px, relativo a él mismo)

// Variables base de animación del bebedero y grifos (compartidas desktop/portrait)
window.TROUGH_WATER_ANIM_X_OFFSET = 0; // Desplazamiento X del agua animada dentro de la cubeta
window.TROUGH_WATER_ANIM_Y_OFFSET = 0; // Desplazamiento Y del agua animada dentro de la cubeta
window.TROUGH_WATER_ANIM_SCALE = 1.0;  // Escala visual del agua animada dentro de la cubeta
window.TROUGH_WATER_ANIM_TOP_CROP = 0;  // Recorte superior visual del agua animada dentro de la cubeta
window.TROUGH_WATER_TEXT_Y_OFFSET = -20; // Desplazamiento vertical del número de agua
window.FAUCET_X_OFFSET = 15; // Ajuste fino horizontal del grifo respecto a su posicion base
window.FAUCET_Y_OFFSET = 0; // Ajuste fino vertical del grifo respecto a su posicion base
window.FAUCET_SCALE = 1.5; // Escala visual del grifo
window.FAUCET_ANIM_X_OFFSET = 12; // Ajuste fino X del chorro animado respecto al grifo
window.FAUCET_ANIM_Y_OFFSET = -8; // Ajuste fino Y del chorro animado respecto al grifo
window.FAUCET_ANIM_SCALE = 1.5; // Escala visual del chorro animado
window.FAUCET_ANIM_MAX_CROP = 22; // Recorte máximo del chorro animado del bebedero
window.FOOD_PIPE_X_OFFSET = 50; // Ajuste fino horizontal del grifo comedero respecto a su posicion base
window.FOOD_PIPE_Y_OFFSET = -5; // Ajuste fino vertical del grifo comedero respecto a su posicion base
window.FOOD_PIPE_SCALE = 1.5; // Escala visual del grifo comedero
window.FOOD_PIPE_ANIM_X_OFFSET = 0; // Ajuste fino X del chorro animado del comedero
window.FOOD_PIPE_ANIM_Y_OFFSET = 10; // Ajuste fino Y del chorro animado del comedero
window.FOOD_PIPE_ANIM_SCALE = 1.5; // Escala visual del chorro animado del comedero
window.FOOD_PIPE_ANIM_MAX_CROP = 22; // Recorte máximo del chorro animado del comedero
window.FOOD_ANIM_X_OFFSET = 0; // Desplazamiento X del relleno de comida dentro de la cubeta
window.FOOD_ANIM_Y_OFFSET = 0; // Desplazamiento Y del relleno de comida dentro de la cubeta
window.FOOD_ANIM_SCALE = 0; // Escala visual del relleno de comida dentro de la cubeta
window.FOOD_ANIM_TOP_CROP = 0; // Recorte superior visual del relleno de comida dentro de la cubeta

// Cifra de venta — popup +$X al llegar un huevo al mercado
window.DESKTOP_SELL_POPUP_X = null;  // null = canvas.width - 40
window.DESKTOP_SELL_POPUP_Y = null;  // null = canvas.height - 30
window.DESKTOP_SELL_POPUP_FONT_SIZE = 12;

// Cifras de relleno — popup -$X al hacer clic en bebedero o comedero
window.DESKTOP_WATER_REFILL_POPUP_X = 50;   // null = 40
window.DESKTOP_FOOD_REFILL_POPUP_X = null; // null = canvas.width - 40
window.DESKTOP_REFILL_POPUP_FONT_SIZE = 12;
window.REFILL_POPUP_Y_OFFSET = -10; // margen sobre el borde superior de la cubeta



function _buildLayout(cw, ch) {

    // ── Referencias (desktop 800×650) ───────────────────────
    const REF_W = 800;
    const REF_H = 650;

    // Sótano: siempre las mismas proporciones desde abajo
    const UG_FLOOR_MARGIN = 28;   // px desde el fondo del canvas
    const UG_HEIGHT = 202;  // altura del sótano
    const UG_MEADOW_GAP = 40;   // hueco entre pradera y techo sótano

    const ugFloor = ch - UG_FLOOR_MARGIN;
    const ugCeil = ugFloor - UG_HEIGHT;
    const meadowB = ugCeil - UG_MEADOW_GAP;

    // Escala X e Y para coordenadas de pradera
    const sx = cw / REF_W;
    // En portrait, el alto de la pradera (meadowB) mide 650px.
    // Usamos la escala adecuada (meadowB / 400) pero si es portrait,
    // escalamos la pradera proporcionalmente a su altura lúdica real de 400px.
    // Como meadowB en portrait is 650, sy_meadow = 650 / 400 = 1.625.
    const sy_meadow = meadowB / 400;

    // Offset Y para coordenadas en el sótano (relativas al UG_CEIL de referencia)
    const ugDeltaY = ugCeil - 430;     // 430 = REF UG_CEIL

    function scaleX(x) { return Math.round(x * sx); }
    function meadowY(y) { return Math.round(y * sy_meadow); }
    function undergroundY(y) { return Math.round(y + ugDeltaY); }

    return {

        // ── Terreno ─────────────────────────────────────────
        MEADOW_BOTTOM: meadowB,
        get UNDERGROUND_CEILING_Y() {
            if (window.GAME_MODE !== 'portrait' && window.DESKTOP_UNDERGROUND_CEILING_Y_OVERRIDE !== null) {
                return window.DESKTOP_UNDERGROUND_CEILING_Y_OVERRIDE;
            }
            return ugCeil;
        },
        UNDERGROUND_FLOOR_Y: ugFloor,

        // ── Lavadora (Egg Washer) ────────────────────────────
        get WASHER_X() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_WASHER_X_OVERRIDE !== null ? window.PORTRAIT_WASHER_X_OVERRIDE : scaleX(230)) : scaleX(230) - 20; },
        get WASHER_Y() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_WASHER_Y_OVERRIDE !== null ? window.PORTRAIT_WASHER_Y_OVERRIDE : undergroundY(430)) : undergroundY(577); },
        get WASHER_SCALE() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_WASHER_SCALE_OVERRIDE !== null ? window.PORTRAIT_WASHER_SCALE_OVERRIDE : 1.5) : window.DESKTOP_WASHER_SCALE; },
        _WASHER_COLLISION_W: scaleX(80),
        _WASHER_VISUAL_OFF: scaleX(5),
        WASHER_VISUAL_W: scaleX(60),
        _WASHER_PIPE_OFF: scaleX(30),
        get WASHER_PIPE_Y() { return this.WASHER_Y + 52; }, // 482 - 430 = 52

        get WASHER_X1() {
            if (window.GAME_MODE === 'portrait') {
                let cx = this.WASHER_X + 40;
                return cx - 20 * this.WASHER_SCALE;
            }
            let cx = this.WASHER_X + 40;
            let halfW = (40 * this.WASHER_SCALE) / 2;
            return cx - halfW;
        },
        get WASHER_X2() {
            if (window.GAME_MODE === 'portrait') {
                let cx = this.WASHER_X + 40;
                return cx + 20 * this.WASHER_SCALE;
            }
            let cx = this.WASHER_X + 40;
            let halfW = (40 * this.WASHER_SCALE) / 2;
            return cx + halfW;
        },
        get WASHER_VISUAL_X() { return this.WASHER_X + this._WASHER_VISUAL_OFF; },
        get WASHER_PIPE_X() { return this.WASHER_X + this._WASHER_PIPE_OFF; },

        // ── Sellador (Quality Stamp) ─────────────────────────
        get STAMPER_X() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_STAMPER_X_OVERRIDE !== null ? window.PORTRAIT_STAMPER_X_OVERRIDE : scaleX(392)) : scaleX(392) - 80; },
        get STAMPER_Y() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_STAMPER_Y_OVERRIDE !== null ? window.PORTRAIT_STAMPER_Y_OVERRIDE : undergroundY(430)) : undergroundY(430); },
        get STAMPER_SCALE() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_STAMPER_SCALE_OVERRIDE !== null ? window.PORTRAIT_STAMPER_SCALE_OVERRIDE : 1.5) : window.DESKTOP_STAMPER_SCALE; },
        _STAMPER_COLLISION_W: scaleX(14),
        _STAMPER_CARTON_OFF: scaleX(78),

        get STAMPER_X1() {
            if (window.GAME_MODE === 'portrait') {
                let cx = this.STAMPER_X + 7;
                return cx - 7 * this.STAMPER_SCALE;
            }
            return this.STAMPER_X;
        },
        get STAMPER_X2() {
            if (window.GAME_MODE === 'portrait') {
                let cx = this.STAMPER_X + 7;
                return cx + 7 * this.STAMPER_SCALE;
            }
            return this.STAMPER_X + this._STAMPER_COLLISION_W;
        },
        get STAMPER_CARTON_X2() { return this.STAMPER_X + this._STAMPER_CARTON_OFF; },
        get STAMPER_VISUAL_X() { return this.STAMPER_X; },

        // ── Empaquetadora (Egg Packager) ─────────────────────
        get PACKAGER_X() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_PACKAGER_X_OVERRIDE !== null ? window.PORTRAIT_PACKAGER_X_OVERRIDE : scaleX(500)) : scaleX(500) - 75; },
        get PACKAGER_Y() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_PACKAGER_Y_OVERRIDE !== null ? window.PORTRAIT_PACKAGER_Y_OVERRIDE : undergroundY(430)) : undergroundY(430); },
        get PACKAGER_SCALE() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_PACKAGER_SCALE_OVERRIDE !== null ? window.PORTRAIT_PACKAGER_SCALE_OVERRIDE : 1.5) : window.DESKTOP_PACKAGER_SCALE; },
        PACKAGER_VISUAL_W: scaleX(60),

        get PACKAGER_X1() {
            if (window.GAME_MODE === 'portrait') {
                let cx = this.PACKAGER_X + 30;
                return cx - 30 * this.PACKAGER_SCALE;
            }
            return this.PACKAGER_X - 10;
        },
        get PACKAGER_X2() {
            if (window.GAME_MODE === 'portrait') {
                let cx = this.PACKAGER_X + 30;
                return cx + 30 * this.PACKAGER_SCALE;
            }
            return this.PACKAGER_X + this.PACKAGER_VISUAL_W - 10;
        },
        get PACKAGER_VISUAL_X() { return this.PACKAGER_X; },
        get PACKAGER_EJECT_X() { return this.PACKAGER_X + this.PACKAGER_VISUAL_W; },

        // ── Cinta Premium (PRO PACK / Ribbon) ────────────────
        get RIBBON_X() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_RIBBON_X_OVERRIDE !== null ? window.PORTRAIT_RIBBON_X_OVERRIDE : scaleX(630)) : scaleX(630) - 40; },
        get RIBBON_Y() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_RIBBON_Y_OVERRIDE !== null ? window.PORTRAIT_RIBBON_Y_OVERRIDE : undergroundY(430)) : undergroundY(430); },
        get RIBBON_SCALE() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_RIBBON_SCALE_OVERRIDE !== null ? window.PORTRAIT_RIBBON_SCALE_OVERRIDE : 1.5) : window.DESKTOP_RIBBON_SCALE; },
        RIBBON_VISUAL_W: scaleX(45),
        _RIBBON_COLLISION_W: scaleX(30),
        _RIBBON_TUNNEL_OFF: scaleX(-4),
        _RIBBON_LABEL_OFF: scaleX(16),

        get RIBBON_X1() {
            if (window.GAME_MODE === 'portrait') {
                let cx = this.RIBBON_X + 15;
                return cx - 15 * this.RIBBON_SCALE;
            }
            return this.RIBBON_X + 10;
        },
        get RIBBON_X2() {
            if (window.GAME_MODE === 'portrait') {
                let cx = this.RIBBON_X + 15;
                return cx + 15 * this.RIBBON_SCALE;
            }
            return this.RIBBON_X + this._RIBBON_COLLISION_W + 10;
        },
        get RIBBON_VISUAL_X() { return this.RIBBON_X; },
        get RIBBON_TUNNEL_X() { return this.RIBBON_X + this._RIBBON_TUNNEL_OFF; },
        get RIBBON_LABEL_X() { return this.RIBBON_X + this._RIBBON_LABEL_OFF; },

        // ── Clasificador (Egg Sorter) ────────────────────────
        get SORTER_ENTRY_X() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_SORTER_X_OVERRIDE !== null ? window.PORTRAIT_SORTER_X_OVERRIDE : scaleX(82)) : scaleX(82); },
        get SORTER_Y() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_SORTER_Y_OVERRIDE !== null ? window.PORTRAIT_SORTER_Y_OVERRIDE : undergroundY(430)) : undergroundY(430); },
        get SORTER_SCALE() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_SORTER_SCALE_OVERRIDE !== null ? window.PORTRAIT_SORTER_SCALE_OVERRIDE : 1.5) : window.DESKTOP_SORTER_SCALE; },
        SORTER_MACHINE_W: scaleX(100),
        SORTER_MACHINE_H: 74,
        SORTER_SLOT_W: scaleX(14),

        // ── Mercado (Market) ─────────────────────────────────
        MARKET_MARGIN: scaleX(82),

        // ── Bebedero (Water Trough — izquierda) ──────────────
        get TROUGH_WATER_X() {
            return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_TROUGH_WATER_X_OVERRIDE !== null ? window.PORTRAIT_TROUGH_WATER_X_OVERRIDE : scaleX(40)) : scaleX(15);
        },
        get TROUGH_W() {
            return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_TROUGH_W_OVERRIDE !== null ? window.PORTRAIT_TROUGH_W_OVERRIDE : scaleX(40)) : scaleX(40);
        },
        get TROUGH_CENTER_Y() {
            return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_TROUGH_CENTER_Y_OVERRIDE !== null ? window.PORTRAIT_TROUGH_CENTER_Y_OVERRIDE : meadowY(220)) : meadowY(220);
        },

        _TW_PHYS_X: scaleX(-100),
        _TW_PHYS_W: scaleX(145),
        _TW_TARGET_OFF: scaleX(35),
        _TW_CLICK_X2: scaleX(80),

        get TROUGH_WATER_CENTER_X() { return this.TROUGH_WATER_X + this.TROUGH_W / 2; },
        get TROUGH_WATER_PHYS_X() { return this._TW_PHYS_X; },
        get TROUGH_WATER_PHYS_W() { return this._TW_PHYS_W; },
        get TROUGH_WATER_TARGET_X() { return this.TROUGH_WATER_X + this._TW_TARGET_OFF; },
        get TROUGH_WATER_CLICK_X2() { return this._TW_CLICK_X2; },
        get TROUGH_WATER_ANIM_X_OFFSET() { return window.TROUGH_WATER_ANIM_X_OFFSET; },
        get TROUGH_WATER_ANIM_Y_OFFSET() { return window.TROUGH_WATER_ANIM_Y_OFFSET; },
        get TROUGH_WATER_ANIM_SCALE() { return window.TROUGH_WATER_ANIM_SCALE; },
        get TROUGH_WATER_ANIM_TOP_CROP() { return window.TROUGH_WATER_ANIM_TOP_CROP; },
        get FAUCET_ANIM_MAX_CROP() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FAUCET_ANIM_MAX_CROP_OVERRIDE !== null ? window.PORTRAIT_FAUCET_ANIM_MAX_CROP_OVERRIDE : window.FAUCET_ANIM_MAX_CROP)
                : window.FAUCET_ANIM_MAX_CROP;
        },
        get TROUGH_WATER_TEXT_Y_OFFSET() { return window.TROUGH_WATER_TEXT_Y_OFFSET; },

        get TROUGH_FOOD_X() {
            return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_TROUGH_FOOD_X_OVERRIDE !== null ? window.PORTRAIT_TROUGH_FOOD_X_OVERRIDE : scaleX(720)) : scaleX(745);
        },

        _TF_PHYS_OFF: scaleX(10),
        _TF_PHYS_W: scaleX(200),
        _TF_TARGET_OFF: scaleX(5),
        _TF_CLICK_X1: scaleX(700),
        _TF_HOVER_X1: scaleX(720),

        get TROUGH_FOOD_CENTER_X() { return this.TROUGH_FOOD_X + this.TROUGH_W / 2; },
        get TROUGH_FOOD_PHYS_X() { return this.TROUGH_FOOD_X + this._TF_PHYS_OFF; },
        get TROUGH_FOOD_PHYS_W() { return this._TF_PHYS_W; },
        get TROUGH_FOOD_TARGET_X() { return this.TROUGH_FOOD_X + this._TF_TARGET_OFF; },
        get TROUGH_FOOD_CLICK_X1() { return this._TF_CLICK_X1; },
        get TROUGH_FOOD_HOVER_X1() { return this._TF_HOVER_X1; },

        // ── Huecos / Pasadizos ───────────────────────────────
        HOLE_LEFT_X: scaleX(90),
        get HOLE_RIGHT_MARGIN() { return window.GAME_MODE === 'portrait' ? scaleX(105) : scaleX(105) + 15; },
        HOLE_RIGHT_Y_MARGIN: 15,
        HOLE_RIGHT_TRIGGER_OFFSET: 30,

        // ── Cintas Transportadoras ───────────────────────────
        get BELT_FARM_START() {
            const _default = this.HOLE_LEFT_X - 4;
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_BELT_FARM_START_OVERRIDE !== null ? window.PORTRAIT_BELT_FARM_START_OVERRIDE : _default)
                : _default;
        },
        get BELT_FARM_END_PAD() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_BELT_FARM_END_PAD_OVERRIDE !== null ? window.PORTRAIT_BELT_FARM_END_PAD_OVERRIDE : 4)
                : 29; // 4 + 25 extra solo-desktop, tal cual estaba antes
        },
        get BELT_END_PAD() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_BELT_END_PAD_OVERRIDE !== null ? window.PORTRAIT_BELT_END_PAD_OVERRIDE : -3)
                : -3;
        },
        get BELT_SELL_START() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_BELT_SELL_START_OVERRIDE !== null ? window.PORTRAIT_BELT_SELL_START_OVERRIDE : scaleX(1))
                : scaleX(1);
        },
        get BELT_SCALE() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_BELT_SCALE_OVERRIDE !== null ? window.PORTRAIT_BELT_SCALE_OVERRIDE : 2.0)
                : 2.0;
        },
        get BELT_Y_OFFSET() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_BELT_Y_OVERRIDE !== null ? window.PORTRAIT_BELT_Y_OVERRIDE : 0)
                : 0;
        },

        // ── Gato (Cat) ───────────────────────────────────────
        CAT_X: scaleX(350),
        get CAT_Y() {
            // window.LAYOUT no está definido dentro de _buildLayout todavía, así que leemos directamente de la propiedad configurada
            return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_CAT_Y_OVERRIDE || 820) : undergroundY(470);
        },
        get CAT_SCALE() {
            return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_CAT_SCALE_OVERRIDE !== null ? window.PORTRAIT_CAT_SCALE_OVERRIDE : 2.25) : window.DESKTOP_CAT_SCALE;
        },

        // ── Boombox / Radio ──────────────────────────────────
        BOOMBOX_W: scaleX(40),
        BOOMBOX_H: 32,
        get BOOMBOX_X() {
            const centeredX = scaleX(400) - this.BOOMBOX_W / 2;
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_BOOMBOX_X_OVERRIDE !== null ? window.PORTRAIT_BOOMBOX_X_OVERRIDE : centeredX)
                : centeredX;
        },
        get BOOMBOX_Y() {
            return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_BOOMBOX_Y_OVERRIDE || 340) : meadowY(300);
        },
        get BOOMBOX_SCALE() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_BOOMBOX_SCALE_OVERRIDE !== null ? window.PORTRAIT_BOOMBOX_SCALE_OVERRIDE : 1.5)
                : window.DESKTOP_BOOMBOX_SCALE;
        },

        // ── Contador de tiempo (solo Speedrun) ───────────────
        get SPEEDRUN_COUNTER_X() {
            const centeredX = scaleX(680);
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_SPEEDRUN_COUNTER_X_OVERRIDE !== null ? window.PORTRAIT_SPEEDRUN_COUNTER_X_OVERRIDE : centeredX)
                : centeredX;
        },
        get SPEEDRUN_COUNTER_Y() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_SPEEDRUN_COUNTER_Y_OVERRIDE !== null ? window.PORTRAIT_SPEEDRUN_COUNTER_Y_OVERRIDE : 200)
                : 420;
        },
        get SPEEDRUN_COUNTER_SCALE() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_SPEEDRUN_COUNTER_SCALE_OVERRIDE !== null ? window.PORTRAIT_SPEEDRUN_COUNTER_SCALE_OVERRIDE : 2)
                : window.DESKTOP_SPEEDRUN_COUNTER_SCALE;
        },
        get SPEEDRUN_COUNTER_W() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_SPEEDRUN_COUNTER_W_OVERRIDE !== null ? window.PORTRAIT_SPEEDRUN_COUNTER_W_OVERRIDE : 40)
                : window.DESKTOP_SPEEDRUN_COUNTER_W;
        },
        get SPEEDRUN_COUNTER_TEXT_SCALE() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_SPEEDRUN_COUNTER_TEXT_SCALE_OVERRIDE !== null ? window.PORTRAIT_SPEEDRUN_COUNTER_TEXT_SCALE_OVERRIDE : 1)
                : window.DESKTOP_SPEEDRUN_COUNTER_TEXT_SCALE;
        },
        get SPEEDRUN_COUNTER_TEXT_Y() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_SPEEDRUN_COUNTER_TEXT_Y_OVERRIDE !== null ? window.PORTRAIT_SPEEDRUN_COUNTER_TEXT_Y_OVERRIDE : 0)
                : window.DESKTOP_SPEEDRUN_COUNTER_TEXT_Y;
        },

        // ── Televisión publicitaria ──────────────────────────
        TV_W: scaleX(120),
        TV_H: 80,
        get TV_MARGIN_RIGHT() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_TV_X_OVERRIDE !== null ? window.PORTRAIT_TV_X_OVERRIDE : scaleX(220)) : scaleX(220); },
        get TV_Y() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_TV_Y_OVERRIDE !== null ? window.PORTRAIT_TV_Y_OVERRIDE : undergroundY(440) - 30) : undergroundY(440); },
        get TV_SCALE() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_TV_SCALE_OVERRIDE !== null ? window.PORTRAIT_TV_SCALE_OVERRIDE : 1.5) : window.DESKTOP_TV_SCALE; },
        get CHICKEN_SCALE() { return window.GAME_MODE === 'portrait' ? (window.PORTRAIT_CHICKEN_SCALE_OVERRIDE !== null ? window.PORTRAIT_CHICKEN_SCALE_OVERRIDE : 1.5) : window.DESKTOP_CHICKEN_SCALE; },

        // ── Popup cifra de venta (+$X) ───────────────────────
        get SELL_POPUP_X() {
            const _def = cw - 40;
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_SELL_POPUP_X !== null ? window.PORTRAIT_SELL_POPUP_X : _def)
                : (window.DESKTOP_SELL_POPUP_X !== null ? window.DESKTOP_SELL_POPUP_X : _def);
        },
        get SELL_POPUP_Y() {
            const _def = ch - 30;
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_SELL_POPUP_Y !== null ? window.PORTRAIT_SELL_POPUP_Y : _def)
                : (window.DESKTOP_SELL_POPUP_Y !== null ? window.DESKTOP_SELL_POPUP_Y : _def);
        },
        get SELL_POPUP_FONT_SIZE() {
            return window.GAME_MODE === 'portrait' ? window.PORTRAIT_SELL_POPUP_FONT_SIZE : window.DESKTOP_SELL_POPUP_FONT_SIZE;
        },
        get WATER_REFILL_POPUP_X() {
            const _def = 40;
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_WATER_REFILL_POPUP_X !== null ? window.PORTRAIT_WATER_REFILL_POPUP_X : _def)
                : (window.DESKTOP_WATER_REFILL_POPUP_X !== null ? window.DESKTOP_WATER_REFILL_POPUP_X : _def);
        },
        get FOOD_REFILL_POPUP_X() {
            const _def = cw - 40;
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_REFILL_POPUP_X !== null ? window.PORTRAIT_FOOD_REFILL_POPUP_X : _def)
                : (window.DESKTOP_FOOD_REFILL_POPUP_X !== null ? window.DESKTOP_FOOD_REFILL_POPUP_X : _def);
        },
        get REFILL_POPUP_FONT_SIZE() {
            return window.GAME_MODE === 'portrait' ? window.PORTRAIT_REFILL_POPUP_FONT_SIZE : window.DESKTOP_REFILL_POPUP_FONT_SIZE;
        },

        // ── Grifos automáticos ───────────────────────────────
        PIPE_DISPATCH_Y: meadowY(50),
        PIPE_SPRITE_Y: meadowY(36),
        PIPE_FOOD_SPRITE_MARGIN: scaleX(49),

        get FOOD_PIPE_SCALE() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_PIPE_SCALE_OVERRIDE !== null ? window.PORTRAIT_FOOD_PIPE_SCALE_OVERRIDE : window.FOOD_PIPE_SCALE)
                : window.FOOD_PIPE_SCALE;
        },
        get FOOD_PIPE_ANIM_X_OFFSET() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_PIPE_ANIM_X_OFFSET_OVERRIDE !== null ? window.PORTRAIT_FOOD_PIPE_ANIM_X_OFFSET_OVERRIDE : window.FOOD_PIPE_ANIM_X_OFFSET)
                : window.FOOD_PIPE_ANIM_X_OFFSET;
        },
        get FOOD_PIPE_ANIM_Y_OFFSET() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_PIPE_ANIM_Y_OFFSET_OVERRIDE !== null ? window.PORTRAIT_FOOD_PIPE_ANIM_Y_OFFSET_OVERRIDE : window.FOOD_PIPE_ANIM_Y_OFFSET)
                : window.FOOD_PIPE_ANIM_Y_OFFSET;
        },
        get FOOD_PIPE_ANIM_SCALE() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_PIPE_ANIM_SCALE_OVERRIDE !== null ? window.PORTRAIT_FOOD_PIPE_ANIM_SCALE_OVERRIDE : window.FOOD_PIPE_ANIM_SCALE)
                : window.FOOD_PIPE_ANIM_SCALE;
        },
        get FOOD_PIPE_ANIM_MAX_CROP() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_PIPE_ANIM_MAX_CROP_OVERRIDE !== null ? window.PORTRAIT_FOOD_PIPE_ANIM_MAX_CROP_OVERRIDE : window.FOOD_PIPE_ANIM_MAX_CROP)
                : window.FOOD_PIPE_ANIM_MAX_CROP;
        },
        get FOOD_ANIM_X_OFFSET() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_ANIM_X_OFFSET_OVERRIDE !== null ? window.PORTRAIT_FOOD_ANIM_X_OFFSET_OVERRIDE : window.FOOD_ANIM_X_OFFSET)
                : window.FOOD_ANIM_X_OFFSET;
        },
        get FOOD_ANIM_Y_OFFSET() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_ANIM_Y_OFFSET_OVERRIDE !== null ? window.PORTRAIT_FOOD_ANIM_Y_OFFSET_OVERRIDE : window.FOOD_ANIM_Y_OFFSET)
                : window.FOOD_ANIM_Y_OFFSET;
        },
        get FOOD_ANIM_SCALE() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_ANIM_SCALE_OVERRIDE !== null ? window.PORTRAIT_FOOD_ANIM_SCALE_OVERRIDE : window.FOOD_ANIM_SCALE)
                : window.FOOD_ANIM_SCALE;
        },
        get FOOD_ANIM_TOP_CROP() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_ANIM_TOP_CROP_OVERRIDE !== null ? window.PORTRAIT_FOOD_ANIM_TOP_CROP_OVERRIDE : window.FOOD_ANIM_TOP_CROP)
                : window.FOOD_ANIM_TOP_CROP;
        },
        get FAUCET_X() {
            const baseX = window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FAUCET_X_OVERRIDE !== null ? window.PORTRAIT_FAUCET_X_OVERRIDE : (this.TROUGH_WATER_CENTER_X - 50 * 1.5))
                : (this.TROUGH_WATER_CENTER_X - 50);
            const xOffset = window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FAUCET_X_OFFSET_OVERRIDE !== null ? window.PORTRAIT_FAUCET_X_OFFSET_OVERRIDE : window.FAUCET_X_OFFSET)
                : window.FAUCET_X_OFFSET;
            return baseX + xOffset;
        },
        get FAUCET_Y() {
            const baseY = window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FAUCET_Y_OVERRIDE !== null ? window.PORTRAIT_FAUCET_Y_OVERRIDE : (this.PIPE_SPRITE_Y - 8))
                : this.PIPE_SPRITE_Y;
            const yOffset = window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FAUCET_Y_OFFSET_OVERRIDE !== null ? window.PORTRAIT_FAUCET_Y_OFFSET_OVERRIDE : window.FAUCET_Y_OFFSET)
                : window.FAUCET_Y_OFFSET;
            return baseY + yOffset;
        },
        get FAUCET_SCALE() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FAUCET_SCALE_OVERRIDE !== null ? window.PORTRAIT_FAUCET_SCALE_OVERRIDE : window.FAUCET_SCALE)
                : window.FAUCET_SCALE;
        },
        get FAUCET_ANIM_X_OFFSET() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FAUCET_ANIM_X_OFFSET_OVERRIDE !== null ? window.PORTRAIT_FAUCET_ANIM_X_OFFSET_OVERRIDE : window.FAUCET_ANIM_X_OFFSET)
                : window.FAUCET_ANIM_X_OFFSET;
        },
        get FAUCET_ANIM_Y_OFFSET() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FAUCET_ANIM_Y_OFFSET_OVERRIDE !== null ? window.PORTRAIT_FAUCET_ANIM_Y_OFFSET_OVERRIDE : window.FAUCET_ANIM_Y_OFFSET)
                : window.FAUCET_ANIM_Y_OFFSET;
        },
        get FAUCET_ANIM_SCALE() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FAUCET_ANIM_SCALE_OVERRIDE !== null ? window.PORTRAIT_FAUCET_ANIM_SCALE_OVERRIDE : window.FAUCET_ANIM_SCALE)
                : window.FAUCET_ANIM_SCALE;
        },
        get FOOD_PIPE_X() {
            const baseX = window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_PIPE_X_OVERRIDE !== null ? window.PORTRAIT_FOOD_PIPE_X_OVERRIDE : (this.TROUGH_FOOD_CENTER_X - 14 * 1.5))
                : (this.TROUGH_FOOD_CENTER_X - 14);
            const xOffset = window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_PIPE_X_OFFSET_OVERRIDE !== null ? window.PORTRAIT_FOOD_PIPE_X_OFFSET_OVERRIDE : window.FOOD_PIPE_X_OFFSET)
                : window.FOOD_PIPE_X_OFFSET;
            return baseX + xOffset;
        },
        get FOOD_PIPE_Y() {
            const baseY = window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_PIPE_Y_OVERRIDE !== null ? window.PORTRAIT_FOOD_PIPE_Y_OVERRIDE : (this.PIPE_SPRITE_Y - 8))
                : (this.PIPE_SPRITE_Y - 8);
            const yOffset = window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_PIPE_Y_OFFSET_OVERRIDE !== null ? window.PORTRAIT_FOOD_PIPE_Y_OFFSET_OVERRIDE : window.FOOD_PIPE_Y_OFFSET)
                : window.FOOD_PIPE_Y_OFFSET;
            return baseY + yOffset;
        },

        // ── Huevera / Caja (Cardboard Box) ───────────────────
        BOX_SHELF_X: scaleX(405) - 30,
        BOX_SHELF_OFFSET_Y: 52,

        // ── Huevos ───────────────────────────────────────────
        EGG_GROUND_OFFSET: 10,

        // ── Lavadora: Y absolutas del sótano ─────────────────
        // Usadas en draw para detalles visuales
        WASHER_BASIN_Y: undergroundY(516),   // cubeta
        WASHER_DRAIN_Y: undergroundY(530),   // desagüe
        WASHER_SPLASH_Y: undergroundY(534),   // salpicaduras
    };
}

function _applyLayout(cw, ch) {
    window.LAYOUT = _buildLayout(cw, ch);
    window.CANVAS_W = cw;
    window.CANVAS_H = ch;

    // Volvemos a mapear los getters/setters dinámicos sobre el nuevo objeto window.LAYOUT
    // para evitar que se pierdan cuando responsive.js llama a _applyLayout en DOMContentLoaded
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_MEADOW_LIMIT_Y', {
        get() { return window.PORTRAIT_MEADOW_LIMIT_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_MEADOW_LIMIT_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_EGG_LIMIT_Y', {
        get() { return window.PORTRAIT_EGG_LIMIT_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_EGG_LIMIT_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_UNDERGROUND_FLOOR_Y', {
        get() { return window.PORTRAIT_UNDERGROUND_FLOOR_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_UNDERGROUND_FLOOR_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_CAT_Y', {
        get() { return window.PORTRAIT_CAT_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_CAT_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_CAT_SCALE', {
        get() { return window.PORTRAIT_CAT_SCALE_OVERRIDE; },
        set(v) { window.PORTRAIT_CAT_SCALE_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FARM_BELT_Y', {
        get() { return window.PORTRAIT_FARM_BELT_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_FARM_BELT_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_BELT_SCALE', {
        get() { return window.PORTRAIT_BELT_SCALE_OVERRIDE; },
        set(v) { window.PORTRAIT_BELT_SCALE_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_BELT_Y', {
        get() { return window.PORTRAIT_BELT_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_BELT_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_BELT_FARM_START', {
        get() { return window.PORTRAIT_BELT_FARM_START_OVERRIDE; },
        set(v) { window.PORTRAIT_BELT_FARM_START_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_BELT_FARM_END_PAD', {
        get() { return window.PORTRAIT_BELT_FARM_END_PAD_OVERRIDE; },
        set(v) { window.PORTRAIT_BELT_FARM_END_PAD_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_BELT_END_PAD', {
        get() { return window.PORTRAIT_BELT_END_PAD_OVERRIDE; },
        set(v) { window.PORTRAIT_BELT_END_PAD_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_BELT_SELL_START', {
        get() { return window.PORTRAIT_BELT_SELL_START_OVERRIDE; },
        set(v) { window.PORTRAIT_BELT_SELL_START_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_BOOMBOX_Y', {
        get() { return window.PORTRAIT_BOOMBOX_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_BOOMBOX_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_BOOMBOX_X', {
        get() { return window.PORTRAIT_BOOMBOX_X_OVERRIDE; },
        set(v) { window.PORTRAIT_BOOMBOX_X_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_BOOMBOX_SCALE', {
        get() { return window.PORTRAIT_BOOMBOX_SCALE_OVERRIDE; },
        set(v) { window.PORTRAIT_BOOMBOX_SCALE_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_TROUGH_WATER_CLICK_WIDTH', {
        get() { return window.PORTRAIT_TROUGH_WATER_CLICK_WIDTH_OVERRIDE; },
        set(v) { window.PORTRAIT_TROUGH_WATER_CLICK_WIDTH_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_TROUGH_FOOD_CLICK_WIDTH', {
        get() { return window.PORTRAIT_TROUGH_FOOD_CLICK_WIDTH_OVERRIDE; },
        set(v) { window.PORTRAIT_TROUGH_FOOD_CLICK_WIDTH_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_TROUGH_CLICK_TOP_OFFSET', {
        get() { return window.PORTRAIT_TROUGH_CLICK_TOP_OFFSET_OVERRIDE; },
        set(v) { window.PORTRAIT_TROUGH_CLICK_TOP_OFFSET_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET', {
        get() { return window.PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET_OVERRIDE; },
        set(v) { window.PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_TROUGH_WATER_X', {
        get() { return window.PORTRAIT_TROUGH_WATER_X_OVERRIDE; },
        set(v) { window.PORTRAIT_TROUGH_WATER_X_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_TROUGH_FOOD_X', {
        get() { return window.PORTRAIT_TROUGH_FOOD_X_OVERRIDE; },
        set(v) { window.PORTRAIT_TROUGH_FOOD_X_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_TROUGH_W', {
        get() { return window.PORTRAIT_TROUGH_W_OVERRIDE; },
        set(v) { window.PORTRAIT_TROUGH_W_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_TROUGH_CENTER_Y', {
        get() { return window.PORTRAIT_TROUGH_CENTER_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_TROUGH_CENTER_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FAUCET_X', {
        get() { return window.PORTRAIT_FAUCET_X_OVERRIDE; },
        set(v) { window.PORTRAIT_FAUCET_X_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FAUCET_Y', {
        get() { return window.PORTRAIT_FAUCET_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_FAUCET_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FAUCET_X_OFFSET', {
        get() { return window.FAUCET_X_OFFSET; },
        set(v) { window.FAUCET_X_OFFSET = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FAUCET_Y_OFFSET', {
        get() { return window.FAUCET_Y_OFFSET; },
        set(v) { window.FAUCET_Y_OFFSET = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FAUCET_SCALE', {
        get() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FAUCET_SCALE_OVERRIDE !== null ? window.PORTRAIT_FAUCET_SCALE_OVERRIDE : window.FAUCET_SCALE)
                : window.FAUCET_SCALE;
        },
        set(v) { window.FAUCET_SCALE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FAUCET_ANIM_X_OFFSET', {
        get() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FAUCET_ANIM_X_OFFSET_OVERRIDE !== null ? window.PORTRAIT_FAUCET_ANIM_X_OFFSET_OVERRIDE : window.FAUCET_ANIM_X_OFFSET)
                : window.FAUCET_ANIM_X_OFFSET;
        },
        set(v) { window.FAUCET_ANIM_X_OFFSET = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FAUCET_ANIM_Y_OFFSET', {
        get() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FAUCET_ANIM_Y_OFFSET_OVERRIDE !== null ? window.PORTRAIT_FAUCET_ANIM_Y_OFFSET_OVERRIDE : window.FAUCET_ANIM_Y_OFFSET)
                : window.FAUCET_ANIM_Y_OFFSET;
        },
        set(v) { window.FAUCET_ANIM_Y_OFFSET = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FAUCET_ANIM_SCALE', {
        get() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FAUCET_ANIM_SCALE_OVERRIDE !== null ? window.PORTRAIT_FAUCET_ANIM_SCALE_OVERRIDE : window.FAUCET_ANIM_SCALE)
                : window.FAUCET_ANIM_SCALE;
        },
        set(v) { window.FAUCET_ANIM_SCALE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FAUCET_ANIM_MAX_CROP', {
        get() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FAUCET_ANIM_MAX_CROP_OVERRIDE !== null ? window.PORTRAIT_FAUCET_ANIM_MAX_CROP_OVERRIDE : window.FAUCET_ANIM_MAX_CROP)
                : window.FAUCET_ANIM_MAX_CROP;
        },
        set(v) { window.FAUCET_ANIM_MAX_CROP = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FAUCET_X_OFFSET', {
        get() { return window.PORTRAIT_FAUCET_X_OFFSET_OVERRIDE; },
        set(v) { window.PORTRAIT_FAUCET_X_OFFSET_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FAUCET_Y_OFFSET', {
        get() { return window.PORTRAIT_FAUCET_Y_OFFSET_OVERRIDE; },
        set(v) { window.PORTRAIT_FAUCET_Y_OFFSET_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FAUCET_SCALE', {
        get() { return window.PORTRAIT_FAUCET_SCALE_OVERRIDE; },
        set(v) { window.PORTRAIT_FAUCET_SCALE_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FAUCET_ANIM_X_OFFSET', {
        get() { return window.PORTRAIT_FAUCET_ANIM_X_OFFSET_OVERRIDE; },
        set(v) { window.PORTRAIT_FAUCET_ANIM_X_OFFSET_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FAUCET_ANIM_Y_OFFSET', {
        get() { return window.PORTRAIT_FAUCET_ANIM_Y_OFFSET_OVERRIDE; },
        set(v) { window.PORTRAIT_FAUCET_ANIM_Y_OFFSET_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FAUCET_ANIM_SCALE', {
        get() { return window.PORTRAIT_FAUCET_ANIM_SCALE_OVERRIDE; },
        set(v) { window.PORTRAIT_FAUCET_ANIM_SCALE_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FAUCET_ANIM_MAX_CROP', {
        get() { return window.PORTRAIT_FAUCET_ANIM_MAX_CROP_OVERRIDE; },
        set(v) { window.PORTRAIT_FAUCET_ANIM_MAX_CROP_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FOOD_PIPE_X', {
        get() { return window.PORTRAIT_FOOD_PIPE_X_OVERRIDE; },
        set(v) { window.PORTRAIT_FOOD_PIPE_X_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FOOD_PIPE_X_OFFSET', {
        get() { return window.FOOD_PIPE_X_OFFSET; },
        set(v) { window.FOOD_PIPE_X_OFFSET = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FOOD_PIPE_X_OFFSET', {
        get() { return window.PORTRAIT_FOOD_PIPE_X_OFFSET_OVERRIDE; },
        set(v) { window.PORTRAIT_FOOD_PIPE_X_OFFSET_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FOOD_PIPE_Y', {
        get() { return window.PORTRAIT_FOOD_PIPE_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_FOOD_PIPE_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FOOD_PIPE_Y_OFFSET', {
        get() { return window.FOOD_PIPE_Y_OFFSET; },
        set(v) { window.FOOD_PIPE_Y_OFFSET = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FOOD_PIPE_SCALE', {
        get() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_PIPE_SCALE_OVERRIDE !== null ? window.PORTRAIT_FOOD_PIPE_SCALE_OVERRIDE : window.FOOD_PIPE_SCALE)
                : window.FOOD_PIPE_SCALE;
        },
        set(v) { window.FOOD_PIPE_SCALE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FOOD_PIPE_ANIM_X_OFFSET', {
        get() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_PIPE_ANIM_X_OFFSET_OVERRIDE !== null ? window.PORTRAIT_FOOD_PIPE_ANIM_X_OFFSET_OVERRIDE : window.FOOD_PIPE_ANIM_X_OFFSET)
                : window.FOOD_PIPE_ANIM_X_OFFSET;
        },
        set(v) { window.FOOD_PIPE_ANIM_X_OFFSET = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FOOD_PIPE_ANIM_Y_OFFSET', {
        get() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_PIPE_ANIM_Y_OFFSET_OVERRIDE !== null ? window.PORTRAIT_FOOD_PIPE_ANIM_Y_OFFSET_OVERRIDE : window.FOOD_PIPE_ANIM_Y_OFFSET)
                : window.FOOD_PIPE_ANIM_Y_OFFSET;
        },
        set(v) { window.FOOD_PIPE_ANIM_Y_OFFSET = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FOOD_PIPE_ANIM_SCALE', {
        get() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_PIPE_ANIM_SCALE_OVERRIDE !== null ? window.PORTRAIT_FOOD_PIPE_ANIM_SCALE_OVERRIDE : window.FOOD_PIPE_ANIM_SCALE)
                : window.FOOD_PIPE_ANIM_SCALE;
        },
        set(v) { window.FOOD_PIPE_ANIM_SCALE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FOOD_PIPE_ANIM_MAX_CROP', {
        get() {
            return window.GAME_MODE === 'portrait'
                ? (window.PORTRAIT_FOOD_PIPE_ANIM_MAX_CROP_OVERRIDE !== null ? window.PORTRAIT_FOOD_PIPE_ANIM_MAX_CROP_OVERRIDE : window.FOOD_PIPE_ANIM_MAX_CROP)
                : window.FOOD_PIPE_ANIM_MAX_CROP;
        },
        set(v) { window.FOOD_PIPE_ANIM_MAX_CROP = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FOOD_ANIM_X_OFFSET', {
        get() { return window.FOOD_ANIM_X_OFFSET; },
        set(v) { window.FOOD_ANIM_X_OFFSET = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FOOD_ANIM_Y_OFFSET', {
        get() { return window.FOOD_ANIM_Y_OFFSET; },
        set(v) { window.FOOD_ANIM_Y_OFFSET = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FOOD_ANIM_SCALE', {
        get() { return window.FOOD_ANIM_SCALE; },
        set(v) { window.FOOD_ANIM_SCALE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'FOOD_ANIM_TOP_CROP', {
        get() { return window.FOOD_ANIM_TOP_CROP; },
        set(v) { window.FOOD_ANIM_TOP_CROP = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FOOD_PIPE_Y_OFFSET', {
        get() { return window.PORTRAIT_FOOD_PIPE_Y_OFFSET_OVERRIDE; },
        set(v) { window.PORTRAIT_FOOD_PIPE_Y_OFFSET_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FOOD_PIPE_SCALE', {
        get() { return window.PORTRAIT_FOOD_PIPE_SCALE_OVERRIDE; },
        set(v) { window.PORTRAIT_FOOD_PIPE_SCALE_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FOOD_PIPE_ANIM_X_OFFSET', {
        get() { return window.PORTRAIT_FOOD_PIPE_ANIM_X_OFFSET_OVERRIDE; },
        set(v) { window.PORTRAIT_FOOD_PIPE_ANIM_X_OFFSET_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FOOD_PIPE_ANIM_Y_OFFSET', {
        get() { return window.PORTRAIT_FOOD_PIPE_ANIM_Y_OFFSET_OVERRIDE; },
        set(v) { window.PORTRAIT_FOOD_PIPE_ANIM_Y_OFFSET_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FOOD_PIPE_ANIM_SCALE', {
        get() { return window.PORTRAIT_FOOD_PIPE_ANIM_SCALE_OVERRIDE; },
        set(v) { window.PORTRAIT_FOOD_PIPE_ANIM_SCALE_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FOOD_PIPE_ANIM_MAX_CROP', {
        get() { return window.PORTRAIT_FOOD_PIPE_ANIM_MAX_CROP_OVERRIDE; },
        set(v) { window.PORTRAIT_FOOD_PIPE_ANIM_MAX_CROP_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FOOD_ANIM_X_OFFSET', {
        get() { return window.PORTRAIT_FOOD_ANIM_X_OFFSET_OVERRIDE; },
        set(v) { window.PORTRAIT_FOOD_ANIM_X_OFFSET_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FOOD_ANIM_Y_OFFSET', {
        get() { return window.PORTRAIT_FOOD_ANIM_Y_OFFSET_OVERRIDE; },
        set(v) { window.PORTRAIT_FOOD_ANIM_Y_OFFSET_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FOOD_ANIM_SCALE', {
        get() { return window.PORTRAIT_FOOD_ANIM_SCALE_OVERRIDE; },
        set(v) { window.PORTRAIT_FOOD_ANIM_SCALE_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_FOOD_ANIM_TOP_CROP', {
        get() { return window.PORTRAIT_FOOD_ANIM_TOP_CROP_OVERRIDE; },
        set(v) { window.PORTRAIT_FOOD_ANIM_TOP_CROP_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_WASHER_X', {
        get() { return window.PORTRAIT_WASHER_X_OVERRIDE; },
        set(v) { window.PORTRAIT_WASHER_X_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_WASHER_Y', {
        get() { return window.PORTRAIT_WASHER_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_WASHER_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_WASHER_SCALE', {
        get() { return window.PORTRAIT_WASHER_SCALE_OVERRIDE; },
        set(v) { window.PORTRAIT_WASHER_SCALE_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_STAMPER_X', {
        get() { return window.PORTRAIT_STAMPER_X_OVERRIDE; },
        set(v) { window.PORTRAIT_STAMPER_X_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_STAMPER_Y', {
        get() { return window.PORTRAIT_STAMPER_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_STAMPER_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_STAMPER_SCALE', {
        get() { return window.PORTRAIT_STAMPER_SCALE_OVERRIDE; },
        set(v) { window.PORTRAIT_STAMPER_SCALE_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_PACKAGER_X', {
        get() { return window.PORTRAIT_PACKAGER_X_OVERRIDE; },
        set(v) { window.PORTRAIT_PACKAGER_X_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_PACKAGER_Y', {
        get() { return window.PORTRAIT_PACKAGER_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_PACKAGER_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_PACKAGER_SCALE', {
        get() { return window.PORTRAIT_PACKAGER_SCALE_OVERRIDE; },
        set(v) { window.PORTRAIT_PACKAGER_SCALE_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_RIBBON_X', {
        get() { return window.PORTRAIT_RIBBON_X_OVERRIDE; },
        set(v) { window.PORTRAIT_RIBBON_X_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_RIBBON_Y', {
        get() { return window.PORTRAIT_RIBBON_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_RIBBON_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_RIBBON_SCALE', {
        get() { return window.PORTRAIT_RIBBON_SCALE_OVERRIDE; },
        set(v) { window.PORTRAIT_RIBBON_SCALE_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_SORTER_X', {
        get() { return window.PORTRAIT_SORTER_X_OVERRIDE; },
        set(v) { window.PORTRAIT_SORTER_X_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_SORTER_Y', {
        get() { return window.PORTRAIT_SORTER_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_SORTER_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_SORTER_SCALE', {
        get() { return window.PORTRAIT_SORTER_SCALE_OVERRIDE; },
        set(v) { window.PORTRAIT_SORTER_SCALE_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_TV_X', {
        get() { return window.PORTRAIT_TV_X_OVERRIDE; },
        set(v) { window.PORTRAIT_TV_X_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_TV_Y', {
        get() { return window.PORTRAIT_TV_Y_OVERRIDE; },
        set(v) { window.PORTRAIT_TV_Y_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_TV_SCALE', {
        get() { return window.PORTRAIT_TV_SCALE_OVERRIDE; },
        set(v) { window.PORTRAIT_TV_SCALE_OVERRIDE = v; }
    });
    Object.defineProperty(window.LAYOUT, 'PORTRAIT_CHICKEN_SCALE', {
        get() { return window.PORTRAIT_CHICKEN_SCALE_OVERRIDE; },
        set(v) { window.PORTRAIT_CHICKEN_SCALE_OVERRIDE = v; }
    });

}

_applyLayout(window._RESPONSIVE_W || 800, window._RESPONSIVE_H || 650);
