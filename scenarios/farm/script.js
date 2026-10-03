(async () => {
    // GAME_MARKET set by shared/platform.js
    let _totalMoneyEarned = 0;
    let _totalMoneySpent = 0;

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    // Alias del contexto del canvas de JUEGO. Hace falta porque drawEgg() acepta un ctx
    // opcional y, dentro, necesita poder sombrear el `ctx` de arriba sin auto-referenciarse.
    const _gameCtx = ctx;

    // ── PixiJS entity layer ──────────────────────────────────────────────────
    let _pixi = null;       // PIXI.Application
    let _pixiCont = null;   // PIXI.Container with sortableChildren
    let _pixiMap = new Map(); // entity object → PIXI.Sprite
    let _stackGfxMap = new Map();   // package entity → PIXI.Sprite[] (stack layers)
    let _stackBadgeMap = new Map(); // package entity → PIXI.Text (count badge)
    let _pixiTex = null;    // texture cache, built lazily once sheets are loaded
    let _pixiMoneyTexts = [];
    let _pixiGenTexts = [];
    let _pixiHearts = [];   // pool of { bgSp, fgSp, maskGfx } for petting radial hearts
    let _activeHeartCount = 0; // live heart sprites in particlesArr — capped at 100
    let _holeMaskGfx = null;
    let _holeMaskSprite = null;
    let _pixelParticlesGfx = null;

    // Flores decorativas — type 0-2, flip:true en la segunda de cada par
    const FLOWER_DEFS = [
        // flor A (×2)
        { type: 0, x: 200, y: 125, flip: false },
        { type: 0, x: 620, y: 205, flip: true },
        // flor B (×2)
        { type: 1, x: 350, y: 85, flip: false },
        { type: 1, x: 725, y: 315, flip: true },
        // flor C (×2)
        { type: 2, x: 80, y: 265, flip: false },
        { type: 2, x: 500, y: 155, flip: true },
    ];
    const FLOWER_DEFS_PORTRAIT = [
        // flor A (×2)
        { type: 0, x: 180, y: 175, flip: false },
        { type: 0, x: 620, y: 438, flip: true },
        // flor B (×2)
        { type: 1, x: 430, y: 185,  flip: false },
        { type: 1, x: 500, y: 300, flip: true },
        // flor C (×2)
        { type: 2, x: 255,  y: 465, flip: false },
        { type: 2, x: 300, y: 255, flip: true },
    ];
    let _flowerSprites = [];
    let _flowerFrame = []; // frame actual de cada flor (0 ó 1)
    let _flowerInside = []; // si el puntero estaba dentro en el tick anterior
    let _debugGfx = null;  // PIXI.Graphics para debug sortY (window.DEBUG_SORTY)
    let _rotDebugGfx = null; // PIXI.Graphics para debug rotación huevos
    let _tutArrowGfx = null; // PIXI.Graphics para flechas de tutorial (huevo → mercado)
    let _flyInShadowGfx = null; // PIXI.Graphics para sombras de aterrizaje

    // Feather-only tint shader: tints white/light pixels (feathers) only, leaves beak/legs/crest unchanged
    const _FEATHER_FRAG = `
        varying vec2 vTextureCoord;
        uniform sampler2D uSampler;
        uniform vec3 uTint;
        void main(void){
            vec4 c = texture2D(uSampler, vTextureCoord);
            if(c.a < 0.01){ gl_FragColor = c; return; }
            float mx = max(c.r, max(c.g, c.b));
            float mn = min(c.r, min(c.g, c.b));
            float sat = mx > 0.0 ? (mx - mn) / mx : 0.0;
            float mask = smoothstep(0.25, 0.75, (1.0 - sat) * mx);
            gl_FragColor = vec4(mix(c.rgb, c.rgb * uTint, mask), c.a);
        }
    `;
    let _featherFilterRose = null;
    let _featherFilterBlue = null;
    let _featherFilterGold = null;
    let _featherFilterGreen = null;
    let _faucetSprite = null;   // static PixiJS sprite for the water faucet
    let _autoWaterStreamPx = null; // PixiJS TilingSprite for the auto-water stream (caudal)
    let _autoFoodStreamPx = null;  // PixiJS TilingSprite for the auto-food stream
    let _foodPipeSprite = null; // static PixiJS sprite for the food pipe
    let _proPackCoverGfx = null; // PixiJS Graphics covering PRO PACK front so packages go behind
    let _boxGfx = null;          // PixiJS Graphics for the box — drawn above egg sprites

    // Landscape: move options button to shop-header (right of mute)
    if (window.GAME_MODE === 'landscape') {
        const pauseBtn = document.getElementById('pause-btn');
        const muteBtn = document.getElementById('mute-btn');
        const shopHdr = document.getElementById('shop-header');
        if (pauseBtn && muteBtn && shopHdr) {
            muteBtn.after(pauseBtn);
        }
    }

    // ── Chicken name registry ─────────────────────────────────────────────────
    let _chickenNames = [];
    fetch('Names.csv').then(r => r.text()).then(txt => {
        _chickenNames = txt.trim().split('\n').map(l => {
            const c = l.indexOf(',');
            return c >= 0 ? l.slice(c + 1).trim() : l.trim();
        }).filter(Boolean);
    }).catch(() => {});

    const _GLOBAL_CID_KEY = 'tme_global_chicken_id';
    function _nextGlobalChickenId() {
        let n = 0;
        try { n = parseInt(localStorage.getItem(_GLOBAL_CID_KEY), 10) || 0; } catch(e) {}
        n++;
        try { localStorage.setItem(_GLOBAL_CID_KEY, String(n)); } catch(e) {}
        return n;
    }

    function _registerNewChicken(chicken, showImmediately = false) {
        const id = _nextGlobalChickenId();
        state.globalChickenId = id;
        chicken.chickenId = id;
        chicken.chickenName = _chickenNames.length
            ? _chickenNames[(id - 1) % _chickenNames.length]
            : 'Tavuk #' + id;
        // Si ya está en suelo (pollito crecido), mostrar bocadillo de inmediato
        if (showImmediately) chicken.nameBubbleTimer = 5.0;
        return chicken;
    }
    // ─────────────────────────────────────────────────────────────────────────

    let _bgPixiSprite = null;
    let _bgPixiSrc = null;
    let _catPixiSprite = null;
    let _beltFarmPx = null;
    let _beltSellPx = null;
    let _beltFrameTex = null;
    let _boomboxPixi = null;
    let _tvPixi = null;
    let _washerPixi = null;
    let _stamperPixi = null;
    let _packagerPixi = null;
    let _ribbonPixi = null;
    let _waterTroughPx = null;
    let _foodTroughPx = null;
    let _waterTroughVisualBounds = null; // {x,y,w,h} updated each frame by _applyTroughLayout
    let _foodTroughVisualBounds = null;
    const _TROUGH_MID_MAX = 10;

    function _syncBgSprite() {
        if (!_pixi || !_pixiCont) return;
        const src = bgSpriteSheet.src;
        if (!bgSpriteSheet.complete || !bgSpriteSheet.naturalWidth) return;
        if (_bgPixiSrc === src && _bgPixiSprite) {
            _bgPixiSprite.width = canvas.width;
            _bgPixiSprite.height = canvas.height;
            return;
        }
        if (_bgPixiSprite) { _pixiCont.removeChild(_bgPixiSprite); _bgPixiSprite.destroy(); _bgPixiSprite = null; }
        const bt = new PIXI.BaseTexture(new PIXI.CanvasResource(_srcToCanvas(bgSpriteSheet)));
        bt.scaleMode = PIXI.SCALE_MODES.NEAREST;
        const tex = new PIXI.Texture(bt);
        _bgPixiSprite = new PIXI.Sprite(tex);
        _bgPixiSprite.zIndex = -1000;
        _bgPixiSprite.x = 0;
        _bgPixiSprite.y = 0;
        _bgPixiSprite.width = canvas.width;
        _bgPixiSprite.height = canvas.height;
        _pixiCont.addChild(_bgPixiSprite);
        _bgPixiSrc = src;
    }

    function _syncCatSprite() {
        if (!_pixi || !_pixiCont) return;
        if (!sebastianSpriteSheet.complete || !sebastianSpriteSheet.naturalWidth) return;
        const CAT_FRAME_W = 50, CAT_FRAME_H = 14, CAT_FRAMES = 6;
        if (!_catPixiSprite) {
            const bt = new PIXI.BaseTexture(new PIXI.CanvasResource(_srcToCanvas(sebastianSpriteSheet)));
            bt.scaleMode = PIXI.SCALE_MODES.NEAREST;
            const frames = [];
            for (let i = 0; i < CAT_FRAMES; i++)
                frames.push(new PIXI.Texture(bt, new PIXI.Rectangle(i * CAT_FRAME_W, 0, CAT_FRAME_W, CAT_FRAME_H)));
            _catPixiSprite = new PIXI.AnimatedSprite(frames);
            _catPixiSprite.animationSpeed = 1 / (0.6 * 60); // 600ms per frame at 60fps
            _catPixiSprite.loop = true;
            _catPixiSprite.play();
            _catPixiSprite.zIndex = 10;
            _pixiCont.addChild(_catPixiSprite);
        }
        const catScale = (window.LAYOUT && typeof window.LAYOUT.CAT_SCALE === 'number')
            ? window.LAYOUT.CAT_SCALE
            : (window.GAME_MODE === 'portrait' ? 2.25 : 1.0);
        _catPixiSprite.scale.set(catScale);
        _catPixiSprite.position.set(window.LAYOUT.CAT_X - 25 * catScale, window.LAYOUT.CAT_Y - 14 * catScale);
        _catPixiSprite.visible = true;
    }

    function _syncBoomboxSprite() {
        if (!_pixi || !_pixiCont) return;
        if (!(state.musicLevel > 0)) {
            if (_boomboxPixi) _boomboxPixi.visible = false;
            return;
        }
        if (!radioSpriteSheet.complete || !radioSpriteSheet.naturalWidth) return;

        if (!_boomboxPixi) {
            const RADIO_FRAME_W = 40, RADIO_FRAME_H = 32, RADIO_FRAMES = 8;
            const bt = new PIXI.BaseTexture(new PIXI.CanvasResource(_srcToCanvas(radioSpriteSheet)));
            bt.scaleMode = PIXI.SCALE_MODES.NEAREST;
            // Row 1 (y = RADIO_FRAME_H): animated frames for normal playback
            const frames = [];
            for (let i = 0; i < RADIO_FRAMES; i++)
                frames.push(new PIXI.Texture(bt, new PIXI.Rectangle(i * RADIO_FRAME_W, RADIO_FRAME_H, RADIO_FRAME_W, RADIO_FRAME_H)));
            _boomboxPixi = new PIXI.AnimatedSprite(frames);
            _boomboxPixi.animationSpeed = 1 / (0.16 * 60);
            _boomboxPixi.loop = true;
            _boomboxPixi.anchor.set(0.5, 0.5);
            // Row 0 (y = 0): single muted frame
            _boomboxPixi._mutedTex = new PIXI.Texture(bt, new PIXI.Rectangle(0, 0, RADIO_FRAME_W, RADIO_FRAME_H));
            _pixiCont.addChild(_boomboxPixi);
        }

        const boomboxScale = window.LAYOUT.BOOMBOX_SCALE || 1;
        const rw = window.LAYOUT.BOOMBOX_W, rh = window.LAYOUT.BOOMBOX_H;
        _boomboxPixi.scale.set(boomboxScale * rw / 40, boomboxScale * rh / 32);
        _boomboxPixi.position.set(window.LAYOUT.BOOMBOX_X + rw / 2, window.LAYOUT.BOOMBOX_Y + rh / 2);
        _boomboxPixi.zIndex = window.LAYOUT.BOOMBOX_Y + rh / 2 * (1 + boomboxScale);

        const muted = window.isMusicMuted || window.isBgmMuted;
        if (muted) {
            _boomboxPixi.stop();
            _boomboxPixi.texture = _boomboxPixi._mutedTex;
        } else if (!_boomboxPixi.playing) {
            _boomboxPixi.play();
        }
        _boomboxPixi.visible = true;
    }

    function _syncTvSprite() {
        if (!_pixi || !_pixiCont) return;
        if (!state.hasTvAd) {
            if (_tvPixi) _tvPixi.visible = false;
            return;
        }
        if (!tvSpriteSheet.complete || !tvSpriteSheet.naturalWidth) return;

        if (!_tvPixi) {
            const TV_FRAMES = 4;
            const TV_FRAME_W = Math.floor(tvSpriteSheet.naturalWidth / TV_FRAMES);
            const TV_FRAME_H = tvSpriteSheet.naturalHeight;
            const bt = _makeBaseTexture(tvSpriteSheet); // NEAREST filtering, no smoothing
            const frames = [];
            for (let i = 0; i < TV_FRAMES; i++)
                frames.push(new PIXI.Texture(bt, new PIXI.Rectangle(i * TV_FRAME_W, 0, TV_FRAME_W, TV_FRAME_H)));
            _tvPixi = new PIXI.AnimatedSprite(frames);
            _tvPixi.animationSpeed = 1 / (0.2 * 60); // ~5fps
            _tvPixi.loop = true;
            _tvPixi.play();
            _tvPixi.anchor.set(0, 0);
            _pixiCont.addChild(_tvPixi);
        }

        const tvScale = window.LAYOUT.TV_SCALE || 1.0;
        const TV_FRAME_W = Math.floor(tvSpriteSheet.naturalWidth / 4);
        const TV_FRAME_H = tvSpriteSheet.naturalHeight;
        const tvX = canvas.width - window.LAYOUT.TV_MARGIN_RIGHT;
        const tvY = window.LAYOUT.TV_Y;
        const _tvPop = _popMult('tv');
        _tvPixi.scale.set(tvScale * _tvPop);
        _tvPixi.position.set(
            tvX - (TV_FRAME_W * tvScale * (_tvPop - 1)) / 2,
            tvY + 40 - (TV_FRAME_H * tvScale * (_tvPop - 1)) / 2
        );
        _tvPixi.zIndex = 5; // fixed — always behind eggs, machines and hueveras
        _tvPixi.visible = true;
    }

    function _syncWasherSprite() {
        if (!_pixi || !_pixiCont) return;
        if (!state.hasWasher) { if (_washerPixi) _washerPixi.visible = false; return; }
        if (!washingMachineSpriteSheet.complete || !washingMachineSpriteSheet.naturalWidth) return;

        if (!_washerPixi) {
            const FW = 48, FH = 56, FRAMES = 8;
            const bt = new PIXI.BaseTexture(new PIXI.CanvasResource(_srcToCanvas(washingMachineSpriteSheet)));
            bt.scaleMode = PIXI.SCALE_MODES.NEAREST;
            const frames = [];
            for (let i = 0; i < FRAMES; i++)
                frames.push(new PIXI.Texture(bt, new PIXI.Rectangle(i * FW, 0, FW, FH)));
            _washerPixi = new PIXI.AnimatedSprite(frames);
            _washerPixi.animationSpeed = 1 / (0.12 * 60);
            _washerPixi.loop = true;
            _washerPixi.play();
            _washerPixi.anchor.set(0, 0);
            _washerPixi.zIndex = 8;
            _pixiCont.addChild(_washerPixi);
        }

        const ws = window.LAYOUT.WASHER_SCALE;
        const wx_center = window.LAYOUT.WASHER_X + 40;
        const _wPop = _popMult('washer');
        _washerPixi.scale.set(ws * _wPop);
        _washerPixi.position.set(
            wx_center + (window.LAYOUT.WASHER_X + 2 - wx_center) * ws - (48 * ws * (_wPop - 1)) / 2,
            UNDERGROUND_FLOOR_Y + (window.LAYOUT.WASHER_Y - UNDERGROUND_FLOOR_Y) * ws - (56 * ws * (_wPop - 1)) / 2
        );
        _washerPixi.visible = true;
    }

    function _syncStamperSprite() {
        if (!_pixi || !_pixiCont) return;
        if (!state.hasStamper) { if (_stamperPixi) _stamperPixi.visible = false; return; }
        if (!stampMachineSpriteSheet.complete || !stampMachineSpriteSheet.naturalWidth) return;

        if (!_stamperPixi) {
            const FW = 24, FH = 52, FRAMES = 8;
            const bt = new PIXI.BaseTexture(new PIXI.CanvasResource(_srcToCanvas(stampMachineSpriteSheet)));
            bt.scaleMode = PIXI.SCALE_MODES.NEAREST;
            const frames = [];
            for (let i = 0; i < FRAMES; i++)
                frames.push(new PIXI.Texture(bt, new PIXI.Rectangle(i * FW, 0, FW, FH)));
            _stamperPixi = new PIXI.AnimatedSprite(frames);
            _stamperPixi.loop = false;
            _stamperPixi.anchor.set(0, 0);
            _stamperPixi.zIndex = 8;
            _pixiCont.addChild(_stamperPixi);
        }

        const timeSinceStamp = window.lastStampActTime ? Math.max(0, Date.now() - window.lastStampActTime) : 9999;
        const stampFrame = timeSinceStamp < 300
            ? Math.min(7, Math.floor(timeSinceStamp / 300 * 8))
            : 0;
        _stamperPixi.gotoAndStop(stampFrame);

        const ss = window.LAYOUT.STAMPER_SCALE;
        const sx_center = window.LAYOUT.STAMPER_X + 8;
        const _sPop = _popMult('stamper');
        _stamperPixi.scale.set(2 * ss * _sPop, 2 * ss * _sPop);
        _stamperPixi.position.set(
            sx_center + (window.LAYOUT.STAMPER_VISUAL_X - 12 - sx_center) * ss - (24 * 2 * ss * (_sPop - 1)) / 2,
            (UNDERGROUND_FLOOR_Y + 5) + (-104) * ss - (52 * 2 * ss * (_sPop - 1)) / 2
        );
        _stamperPixi.visible = true;
    }

    function _syncRibbonSprite() {
        if (!_pixi || !_pixiCont) return;
        if (!state.hasRibbon) { if (_ribbonPixi) _ribbonPixi.visible = false; return; }
        if (!boxingMachineSpriteSheet.complete || !boxingMachineSpriteSheet.naturalWidth) return;

        if (!_ribbonPixi) {
            const FW = 32, FH = 29, FRAMES = 9;
            const bt = new PIXI.BaseTexture(new PIXI.CanvasResource(_srcToCanvas(boxingMachineSpriteSheet)));
            bt.scaleMode = PIXI.SCALE_MODES.NEAREST;
            const frames = [];
            for (let i = 0; i < FRAMES; i++)
                frames.push(new PIXI.Texture(bt, new PIXI.Rectangle(i * FW, 0, FW, FH)));
            _ribbonPixi = new PIXI.AnimatedSprite(frames);
            _ribbonPixi.loop = false;
            _ribbonPixi.anchor.set(0, 0);
            _ribbonPixi.zIndex = 600; // por delante de todo lo que viaja en la cinta (huevos 430-572, caja 350)
            _pixiCont.addChild(_ribbonPixi);
        }

        const timeSinceRibbon = window.lastRibbonActTime ? Math.max(0, Date.now() - window.lastRibbonActTime) : 9999;
        const ribbonFrame = timeSinceRibbon < 9 * 40
            ? Math.min(8, Math.floor(timeSinceRibbon / 40))
            : 0;
        _ribbonPixi.gotoAndStop(ribbonFrame);

        const rs = window.LAYOUT.RIBBON_SCALE;
        const rx_center = window.LAYOUT.RIBBON_X + 15;
        const _rPop = _popMult('ribbon');
        _ribbonPixi.scale.set(2 * rs * _rPop, 2 * rs * _rPop);
        _ribbonPixi.position.set(
            rx_center + (window.LAYOUT.RIBBON_VISUAL_X - 10 - rx_center) * rs - (32 * 2 * rs * (_rPop - 1)) / 2,
            UNDERGROUND_FLOOR_Y + (-58) * rs - (29 * 2 * rs * (_rPop - 1)) / 2
        );
        // zIndex dinámico: siempre por delante de cualquier huevo/caja en la cinta
        _ribbonPixi.zIndex = UNDERGROUND_FLOOR_Y + 100;
        _ribbonPixi.visible = true;
    }

    function _getPackagerFrame() {
        const now = Date.now();
        // Eject animation (400ms total: 80 flash + 120 hold + 200 eject)
        if (window._packagerEjectStart) {
            const t = now - window._packagerEjectStart;
            if (t < 400) {
                if (t < 80)  return 11;
                if (t < 200) return 12;
                return 13 + Math.min(3, Math.floor((t - 200) / 50));
            }
        }
        // Batch fill animation: cuando hay ≥6 huevos, anima 0→12 en 300ms antes del eject
        if (window._packagerBatchFillStart) {
            const t = Math.min(300, now - window._packagerBatchFillStart);
            return Math.round((t / 300) * 12);
        }
        // Fill normal: frame estático según cuántos huevos hay en el buffer
        const count = Math.min(6, (state.packageBuffer || []).length);
        if (count === 0) return 0;
        const holdFrame = (count - 1) * 2 + 2;
        const timeSinceEgg = window.lastPackageEggTime ? now - window.lastPackageEggTime : 9999;
        return timeSinceEgg < 150 ? holdFrame - 1 : holdFrame;
    }

    function _syncPackagerSprite() {
        if (!_pixi || !_pixiCont) return;
        if (!state.hasPackager) { if (_packagerPixi) _packagerPixi.visible = false; return; }
        if (!packMachineSpriteSheet.complete || !packMachineSpriteSheet.naturalWidth) return;

        if (!_packagerPixi) {
            const FW = 35, FH = 31, FRAMES = 17;
            const bt = new PIXI.BaseTexture(new PIXI.CanvasResource(_srcToCanvas(packMachineSpriteSheet)));
            bt.scaleMode = PIXI.SCALE_MODES.NEAREST;
            const frames = [];
            for (let i = 0; i < FRAMES; i++)
                frames.push(new PIXI.Texture(bt, new PIXI.Rectangle(i * FW, 0, FW, FH)));
            _packagerPixi = new PIXI.AnimatedSprite(frames);
            _packagerPixi.loop = false;
            _packagerPixi.anchor.set(0, 0);
            _packagerPixi.zIndex = UNDERGROUND_FLOOR_Y + 50; // por delante de los paquetes (UNDERGROUND_FLOOR_Y) pero detrás del ribbon (+100)
            _pixiCont.addChild(_packagerPixi);
        }

        _packagerPixi.gotoAndStop(_getPackagerFrame());

        const ps = window.LAYOUT.PACKAGER_SCALE;
        const px_center = window.LAYOUT.PACKAGER_X + 30;
        const _pPop = _popMult('packager');
        _packagerPixi.scale.set(2 * ps * _pPop, 2 * ps * _pPop);
        _packagerPixi.position.set(
            px_center + (window.LAYOUT.PACKAGER_X - 5 - px_center) * ps - (35 * 2 * ps * (_pPop - 1)) / 2,
            UNDERGROUND_FLOOR_Y + (-62) * ps - (31 * 2 * ps * (_pPop - 1)) / 2
        );
        _packagerPixi.visible = true;
    }

    function _buildTroughPx(topImg, midImg, botImg) {
        const topBT = _makeBaseTexture(topImg);
        const midBT = _makeBaseTexture(midImg);
        const botBT = _makeBaseTexture(botImg);
        const topTex = new PIXI.Texture(topBT);
        const botTex = new PIXI.Texture(botBT);
        const midSliceH = Math.floor(midImg.naturalHeight / 3);
        const midW = midImg.naturalWidth;
        const midTextures = [
            new PIXI.Texture(midBT, new PIXI.Rectangle(0, 0, midW, midSliceH)),
            new PIXI.Texture(midBT, new PIXI.Rectangle(0, midSliceH, midW, midSliceH)),
            new PIXI.Texture(midBT, new PIXI.Rectangle(0, midSliceH * 2, midW, midSliceH)),
        ];
        const topSp = new PIXI.Sprite(topTex); topSp.anchor.set(0, 0); topSp.visible = false;
        const botSp = new PIXI.Sprite(botTex); botSp.anchor.set(0, 0); botSp.visible = false;
        const mids = [];
        for (let i = 0; i < _TROUGH_MID_MAX; i++) {
            const s = new PIXI.Sprite(midTextures[2 - (i % 3)]);
            s.anchor.set(0, 0); s.visible = false;
            mids.push(s);
        }
        return { topSp, mids, botSp };
    }

    function _buildFillSp(img, frameW, frameH) {
        if (!img || !img.naturalWidth) return null;
        const bt = _makeBaseTexture(img);
        const nFrames = Math.max(1, Math.floor(img.naturalWidth / frameW));
        const frames = [];
        for (let i = 0; i < nFrames; i++)
            frames.push(new PIXI.Texture(bt, new PIXI.Rectangle(i * frameW, 0, frameW, frameH)));
        const sp = new PIXI.TilingSprite(frames[0], frameW, frameH);
        sp._fillFrames = frames;
        return sp;
    }

    function _applyTroughLayout(px, xOrigin, level, fillRatio, opts) {
        level = Math.min(10, level);
        const { topImg, midImg, botImg, S, animScale, animXOff, animYOff, layerTopOff, layerBotOff, centerY } = opts;
        const isPortrait = window.GAME_MODE === 'portrait';
        const pS = isPortrait ? 1.5 : 1;

        const topNatH = topImg.naturalHeight;
        const botNatH = botImg.naturalHeight;
        const midSliceNH = Math.floor(midImg.naturalHeight / 3);
        const natW = topImg.naturalWidth;

        const topH = topNatH * S;
        const botH = botNatH * S;
        const midH = midSliceNH * S;
        const visW = natW * S;
        const visH = topH + botH + level * midH;
        const wyTop = centerY - visH / 2;

        const pcx = xOrigin + visW / 2;
        function sx(x) { return isPortrait ? pcx + (x - pcx) * pS : x; }
        function sy(y) { return isPortrait ? centerY + (y - centerY) * pS : y; }

        const Z = 50; // trough always behind all chickens (chicken min Z ≈ y+6 ≥ ~70)

        // Visual bounding box in screen coordinates (used by debug overlay)
        const _bounds = {
            x: sx(xOrigin),
            y: sy(wyTop),
            w: visW * pS,
            h: visH * pS,
        };

        px.topSp.position.set(sx(xOrigin), sy(wyTop));
        px.topSp.width = visW * pS;
        px.topSp.height = topH * pS;
        px.topSp.zIndex = Z;
        px.topSp.visible = true;

        for (let i = 0; i < _TROUGH_MID_MAX; i++) {
            if (i < level) {
                const my = wyTop + topH + (level - 1 - i) * midH;
                px.mids[i].position.set(sx(xOrigin), sy(my));
                px.mids[i].width = visW * pS;
                px.mids[i].height = midH * pS;
                px.mids[i].zIndex = Z;
                px.mids[i].visible = true;
            } else {
                px.mids[i].visible = false;
            }
        }

        const botY = wyTop + topH + level * midH;
        px.botSp.position.set(sx(xOrigin), sy(botY));
        px.botSp.width = visW * pS;
        px.botSp.height = botH * pS;
        px.botSp.zIndex = Z;
        px.botSp.visible = true;

        if (px.fillSp) {
            const layerBottom = wyTop + visH + layerBotOff;
            const layerH = Math.max(0, layerBottom - (wyTop + layerTopOff));
            const fillH = Math.max(0, Math.min(layerH, fillRatio * layerH));
            const animY = wyTop + animYOff;
            const layerBotAdj = layerBottom + (animY - wyTop);
            const fillTopY = layerBotAdj - fillH;

            if (fillH > 0) {
                // Animate texture FIRST so any _onTextureUpdate side-effects are overwritten below
                if (px.fillSp._fillFrames && px.fillSp._fillFrames.length > 1) {
                    const fi = Math.floor(Date.now() / 140) % px.fillSp._fillFrames.length;
                    if (px.fillSp.texture !== px.fillSp._fillFrames[fi])
                        px.fillSp.texture = px.fillSp._fillFrames[fi];
                }
                const fsx = sx(xOrigin + animXOff);
                const fsy = sy(fillTopY);
                const fby = sy(layerBotAdj);
                px.fillSp.position.set(fsx, fsy);
                px.fillSp.width = visW * animScale * pS;
                px.fillSp.height = fby - fsy;
                px.fillSp.tileScale.set(S * animScale * pS);
                px.fillSp.zIndex = Z + 1;
                px.fillSp.visible = true;
            } else {
                px.fillSp.visible = false;
            }
        }
        return _bounds;
    }

    function _syncTroughs() {
        if (!_pixi || !_pixiCont) return;

        const waterBodyReady = waterTopSpriteSheet.complete && waterTopSpriteSheet.naturalWidth && waterMidSpriteSheet.complete && waterMidSpriteSheet.naturalWidth && waterBottomSpriteSheet.complete && waterBottomSpriteSheet.naturalWidth;
        if (!_waterTroughPx && waterBodyReady) {
            const px = _buildTroughPx(waterTopSpriteSheet, waterMidSpriteSheet, waterBottomSpriteSheet);
            const fillSp = _buildFillSp(waterAnimSpriteSheet, 16, 16);
            _pixiCont.addChild(px.topSp);
            for (const m of px.mids) _pixiCont.addChild(m);
            _pixiCont.addChild(px.botSp);
            if (fillSp) _pixiCont.addChild(fillSp);
            _waterTroughPx = { ...px, fillSp };
        }
        // Retry fillSp if it was null at creation time (anim sheet loaded late)
        if (_waterTroughPx && !_waterTroughPx.fillSp && waterAnimSpriteSheet.complete && waterAnimSpriteSheet.naturalWidth) {
            const fillSp = _buildFillSp(waterAnimSpriteSheet, 16, 16);
            if (fillSp) { _pixiCont.addChild(fillSp); _waterTroughPx.fillSp = fillSp; }
        }

        const foodBodyReady = feederTopSpriteSheet.complete && feederTopSpriteSheet.naturalWidth && feederMidSpriteSheet.complete && feederMidSpriteSheet.naturalWidth && feederBottomSpriteSheet.complete && feederBottomSpriteSheet.naturalWidth;
        if (!_foodTroughPx && foodBodyReady) {
            const px = _buildTroughPx(feederTopSpriteSheet, feederMidSpriteSheet, feederBottomSpriteSheet);
            const ffw = feederFoodSpriteSheet.naturalWidth || 16;
            const ffh = feederFoodSpriteSheet.naturalHeight || 16;
            const fillSp = _buildFillSp(feederFoodSpriteSheet, ffw, ffh);
            _pixiCont.addChild(px.topSp);
            for (const m of px.mids) _pixiCont.addChild(m);
            _pixiCont.addChild(px.botSp);
            if (fillSp) _pixiCont.addChild(fillSp);
            _foodTroughPx = { ...px, fillSp };
        }
        // Retry fillSp if it was null at creation time (food sheet loaded late)
        if (_foodTroughPx && !_foodTroughPx.fillSp && feederFoodSpriteSheet.complete && feederFoodSpriteSheet.naturalWidth) {
            const ffw = feederFoodSpriteSheet.naturalWidth;
            const ffh = feederFoodSpriteSheet.naturalHeight;
            const fillSp = _buildFillSp(feederFoodSpriteSheet, ffw, ffh);
            if (fillSp) { _pixiCont.addChild(fillSp); _foodTroughPx.fillSp = fillSp; }
        }

        const S = 2.5;
        const centerY = window.LAYOUT.TROUGH_CENTER_Y;

        if (state.hasRetired) {
            [_waterTroughPx, _foodTroughPx].forEach(function(px) {
                if (!px) return;
                if (px.topSp) px.topSp.visible = false;
                if (px.botSp) px.botSp.visible = false;
                if (px.mids) px.mids.forEach(function(s) { s.visible = false; });
                if (px.fillSp) px.fillSp.visible = false;
            });
            if (_autoWaterStreamPx) _autoWaterStreamPx.visible = false;
        } else {
        if (_waterTroughPx && !waterBodyReady)
            console.warn('[trough] waterBodyReady=false topW=', waterTopSpriteSheet.naturalWidth, 'midW=', waterMidSpriteSheet.naturalWidth, 'botW=', waterBottomSpriteSheet.naturalWidth);
        if (_waterTroughPx && waterBodyReady) {
            _waterTroughVisualBounds = _applyTroughLayout(_waterTroughPx, window.LAYOUT.TROUGH_WATER_X,
                state.maxWaterLevel || 0,
                Math.max(0, Math.min(1, (state.water || 0) / Math.max(1, state.maxWater || 1))),
                {
                    topImg: waterTopSpriteSheet, midImg: waterMidSpriteSheet, botImg: waterBottomSpriteSheet,
                    S, animScale: window.LAYOUT.TROUGH_WATER_ANIM_SCALE || 1.0,
                    animXOff: window.LAYOUT.TROUGH_WATER_ANIM_X_OFFSET || 0,
                    animYOff: window.LAYOUT.TROUGH_WATER_ANIM_Y_OFFSET || 0,
                    layerTopOff: 3, layerBotOff: -42, centerY,
                }
            );
        }

        if (_foodTroughPx && foodBodyReady) {
            _foodTroughVisualBounds = _applyTroughLayout(_foodTroughPx, window.LAYOUT.TROUGH_FOOD_X,
                state.maxFoodLevel || 0,
                Math.max(0, Math.min(1, (state.food || 0) / Math.max(1, state.maxFood || 1))),
                {
                    topImg: feederTopSpriteSheet, midImg: feederMidSpriteSheet, botImg: feederBottomSpriteSheet,
                    S, animScale: window.LAYOUT.FOOD_ANIM_SCALE || 0.85,
                    animXOff: window.LAYOUT.FOOD_ANIM_X_OFFSET || 3,
                    animYOff: window.LAYOUT.FOOD_ANIM_Y_OFFSET || 0,
                    layerTopOff: 3, layerBotOff: -42, centerY,
                }
            );
        }
        }

        // ── auto-water stream (caudal) ──────────────────────────────────────────
        const _awReady = state.autoWaterLevel > 0
            && waterAutoWaterSpriteSheet.complete
            && waterAutoWaterSpriteSheet.naturalWidth > 0;
        if (_awReady && !_autoWaterStreamPx) {
            const _cols = 3, _rows = 4;
            const _fW = Math.floor(waterAutoWaterSpriteSheet.naturalWidth / _cols);
            const _fH = Math.floor(waterAutoWaterSpriteSheet.naturalHeight / _rows);
            const bt = new PIXI.BaseTexture(new PIXI.CanvasResource(_srcToCanvas(waterAutoWaterSpriteSheet)));
            bt.scaleMode = PIXI.SCALE_MODES.NEAREST;
            const _frames = Array.from({length: _rows * _cols}, (_, i) =>
                new PIXI.Texture(bt, new PIXI.Rectangle((i % _cols) * _fW, Math.floor(i / _cols) * _fH, _fW, _fH)));
            _autoWaterStreamPx = new PIXI.TilingSprite(_frames[0], _fW, _fH);
            _autoWaterStreamPx._streamFrames = _frames;
            _autoWaterStreamPx._streamCols = _cols;
            _autoWaterStreamPx.zIndex = 550;
            _autoWaterStreamPx.visible = false;
            _pixiCont.addChild(_autoWaterStreamPx);
        }
        if (_autoWaterStreamPx) {
            const _awFlowing = state._autoWaterFlowing || 0;
            if (_awFlowing > 0 && _waterTroughVisualBounds && !state.hasRetired) {
                const faucetScale = window.LAYOUT.FAUCET_SCALE || 1;
                const streamScale = window.LAYOUT.FAUCET_ANIM_SCALE || 1;
                const streamOffsetX = window.LAYOUT.FAUCET_ANIM_X_OFFSET || 0;
                const pipeCenterX = (window.LAYOUT.FAUCET_X || 0) + 16 * faucetScale;
                const streamX = pipeCenterX + streamOffsetX;
                const streamStart = (window.LAYOUT.FAUCET_Y || 0) + 40 + (window.LAYOUT.FAUCET_ANIM_Y_OFFSET || 0);
                const wvb = _waterTroughVisualBounds;
                const _awpS = window.GAME_MODE === 'portrait' ? 1.5 : 1;
                const wLayerBottom = wvb.y + wvb.h - 42 * _awpS;
                const wLayerH = Math.max(0, wLayerBottom - (wvb.y + 3 * _awpS));
                const wCap = Math.max(1, state.maxWater || 1);
                const wFloor = wLayerBottom - (state.water / wCap) * wLayerH;
                const streamEnd = Math.max(streamStart + 4, wFloor);
                const _cols = _autoWaterStreamPx._streamCols || 3;
                const _fW = Math.floor(waterAutoWaterSpriteSheet.naturalWidth / _cols);
                const drawW = _fW * streamScale;
                const densityRow = Math.min(3, Math.max(0, (state.autoWaterLevel || 1) - 1));
                const _wFrameMs = state.activeChallenge === 'endless' ? Math.max(40, 120 - (state.autoWaterLevel - 1) * 9) : 120;
                const frameStep = Math.floor(Date.now() / _wFrameMs) % _cols;
                const _wTexIdx = densityRow * _cols + frameStep;
                if (_autoWaterStreamPx.texture !== _autoWaterStreamPx._streamFrames[_wTexIdx])
                    _autoWaterStreamPx.texture = _autoWaterStreamPx._streamFrames[_wTexIdx];
                _autoWaterStreamPx.x = streamX - drawW / 2;
                _autoWaterStreamPx.y = streamStart;
                _autoWaterStreamPx.width = drawW;
                _autoWaterStreamPx.height = Math.max(1, streamEnd - streamStart);
                _autoWaterStreamPx.tileScale.set(streamScale);
                _autoWaterStreamPx.alpha = Math.min(1, _awFlowing / 0.3);
                _autoWaterStreamPx.visible = true;
            } else {
                _autoWaterStreamPx.visible = false;
            }
        }

        // ── auto-food stream ────────────────────────────────────────────────────
        const _afReady = state.autoFoodLevel > 0
            && feederAutoFoodSpriteSheet.complete
            && feederAutoFoodSpriteSheet.naturalWidth > 0;
        if (_afReady && !_autoFoodStreamPx) {
            const _cols = 4, _rows = 4;
            const _fW = Math.floor(feederAutoFoodSpriteSheet.naturalWidth / _cols);
            const _fH = Math.floor(feederAutoFoodSpriteSheet.naturalHeight / _rows);
            const bt = new PIXI.BaseTexture(new PIXI.CanvasResource(_srcToCanvas(feederAutoFoodSpriteSheet)));
            bt.scaleMode = PIXI.SCALE_MODES.NEAREST;
            const _frames = Array.from({length: _rows * _cols}, (_, i) =>
                new PIXI.Texture(bt, new PIXI.Rectangle((i % _cols) * _fW, Math.floor(i / _cols) * _fH, _fW, _fH)));
            _autoFoodStreamPx = new PIXI.TilingSprite(_frames[0], _fW, _fH);
            _autoFoodStreamPx._streamFrames = _frames;
            _autoFoodStreamPx._streamCols = _cols;
            _autoFoodStreamPx.zIndex = 550;
            _autoFoodStreamPx.visible = false;
            _pixiCont.addChild(_autoFoodStreamPx);
        }
        if (_autoFoodStreamPx) {
            const _afFlowing = state._autoFoodFlowing || 0;
            if (_afFlowing > 0 && _foodTroughVisualBounds) {
                const streamScale = window.LAYOUT.FOOD_PIPE_ANIM_SCALE || 1;
                const _afpS = window.GAME_MODE === 'portrait' ? 1.5 : 1;
                // stream X: right edge of food trough minus sprite half-width offset (mirrors canvas 2D)
                const streamX = window.LAYOUT.TROUGH_FOOD_X + window.LAYOUT.TROUGH_W - 20
                    + (window.LAYOUT.FOOD_PIPE_ANIM_X_OFFSET || 0);
                // stream Y: from pipe dispatch down to food surface
                const streamStart = window.LAYOUT.PIPE_DISPATCH_Y + 5;
                const fvb = _foodTroughVisualBounds;
                const fLayerBottom = fvb.y + fvb.h - 42 * _afpS;
                const fLayerH = Math.max(0, fLayerBottom - (fvb.y + 3 * _afpS));
                const fFloor = fLayerBottom - (state.food / Math.max(1, state.maxFood || 1)) * fLayerH;
                const streamEnd = Math.max(streamStart + 4, fFloor);
                const _cols = _autoFoodStreamPx._streamCols || 4;
                const _fW = Math.floor(feederAutoFoodSpriteSheet.naturalWidth / _cols);
                const drawW = _fW * streamScale;
                const densityRow = Math.min(3, Math.max(0, (state.autoFoodLevel || 1) - 1));
                const _afFrameMs = state.activeChallenge === 'endless' ? Math.max(40, 100 - (state.autoFoodLevel - 1) * 8) : 100;
                const frameStep = Math.floor(Date.now() / _afFrameMs) % _cols;
                const _fTexIdx = densityRow * _cols + frameStep;
                if (_autoFoodStreamPx.texture !== _autoFoodStreamPx._streamFrames[_fTexIdx])
                    _autoFoodStreamPx.texture = _autoFoodStreamPx._streamFrames[_fTexIdx];
                _autoFoodStreamPx.x = streamX - drawW / 2;
                _autoFoodStreamPx.y = streamStart;
                _autoFoodStreamPx.width = drawW;
                _autoFoodStreamPx.height = Math.max(1, streamEnd - streamStart);
                _autoFoodStreamPx.tileScale.set(streamScale);
                _autoFoodStreamPx.alpha = Math.min(1, _afFlowing / 0.3);
                _autoFoodStreamPx.visible = true;
            } else {
                _autoFoodStreamPx.visible = false;
            }
        }
    }

    function _makeBeltPx() {
        const container = new PIXI.Container();
        const left = new PIXI.Sprite(_beltFrameTex.left[0]);
        const mid = new PIXI.TilingSprite(_beltFrameTex.mid[0], _beltFrameTex.mid[0].width, _beltFrameTex.mid[0].height);
        const right = new PIXI.Sprite(_beltFrameTex.right[0]);
        container.addChild(left, mid, right);
        return { container, left, mid, right };
    }

    function _syncBelts() {
        if (!_pixi || !_pixiCont) return;
        const ready = beltLeftSpriteSheet.complete && beltLeftSpriteSheet.naturalWidth &&
            beltMidSpriteSheet.complete && beltMidSpriteSheet.naturalWidth &&
            beltRightSpriteSheet.complete && beltRightSpriteSheet.naturalWidth;
        if (!ready) return;

        if (!_beltFrameTex) {
            const frameW = 10, totalFrames = 5;
            const beltH = beltMidSpriteSheet.naturalHeight || 13;
            const mkBT = (img) => {
                const bt = new PIXI.BaseTexture(new PIXI.CanvasResource(_srcToCanvas(img)));
                bt.scaleMode = PIXI.SCALE_MODES.NEAREST;
                return bt;
            };
            const btL = mkBT(beltLeftSpriteSheet);
            const btM = mkBT(beltMidSpriteSheet);
            const btR = mkBT(beltRightSpriteSheet);
            _beltFrameTex = { left: [], mid: [], right: [] };
            for (let i = 0; i < totalFrames; i++) {
                _beltFrameTex.left.push(new PIXI.Texture(btL, new PIXI.Rectangle(i * frameW, 0, frameW, beltH)));
                _beltFrameTex.mid.push(new PIXI.Texture(btM, new PIXI.Rectangle(i * frameW, 0, frameW, beltH)));
                _beltFrameTex.right.push(new PIXI.Texture(btR, new PIXI.Rectangle(i * frameW, 0, frameW, beltH)));
            }
        }

        if (!_beltFarmPx) {
            _beltFarmPx = _makeBeltPx();
            _beltFarmPx.container.zIndex = 2;
            _pixiCont.addChild(_beltFarmPx.container);
        }
        if (!_beltSellPx) {
            _beltSellPx = _makeBeltPx();
            _beltSellPx.container.zIndex = 2;
            _pixiCont.addChild(_beltSellPx.container);
        }

        const frameW = 10, totalFrames = 5;
        const beltH = beltMidSpriteSheet.naturalHeight || 13;
        const beltScale = Math.max(0.01, window.LAYOUT.BELT_SCALE || 1);
        const beltYOffset = window.LAYOUT.BELT_Y_OFFSET;
        const beltY = typeof beltYOffset === 'number' ? beltYOffset : -7;

        function _applyBelt(bx, startX, baseY, width, speedFactor, movesRight, visible, introFromRight) {
            const _wasVis = bx._wasVisible;
            bx._wasVisible = visible;
            if (visible && _wasVis === false) {
                bx._introTimer = 0;
                bx._introFromX = introFromRight ? canvas.width : -width;
            } else if (_wasVis === undefined) {
                bx._introTimer = undefined;
            }
            bx.container.visible = visible;
            if (!visible || width <= 0) return;
            const _INTRO_DUR = 0.35;
            let drawX = startX;
            if (bx._introTimer !== undefined && bx._introTimer < _INTRO_DUR) {
                bx._introTimer = Math.min(_INTRO_DUR, bx._introTimer + 1 / 60);
                const _t = bx._introTimer / _INTRO_DUR;
                const _ease = 1 - (1 - _t) * (1 - _t);
                drawX = bx._introFromX + (startX - bx._introFromX) * _ease;
            }
            const scaledWidth = width / beltScale;
            const snappedW = Math.ceil(scaledWidth / frameW) * frameW;
            const beltSpeed = Math.max(0.01, speedFactor || 1);
            let fi = Math.floor(Date.now() * beltSpeed / 16.7) % totalFrames;
            if (movesRight) fi = (totalFrames - 1 - fi + totalFrames) % totalFrames;
            bx.container.position.set(drawX, baseY);
            bx.container.scale.set(beltScale);
            bx.left.texture = _beltFrameTex.left[fi];
            bx.left.position.set(0, beltY);
            const midW = Math.max(0, snappedW - 2 * frameW);
            bx.mid.texture = _beltFrameTex.mid[fi];
            bx.mid.position.set(frameW, beltY);
            bx.mid.width = midW;
            bx.mid.height = beltH;
            bx.right.texture = _beltFrameTex.right[fi];
            bx.right.position.set(snappedW - frameW, beltY);
        }

        _applyBelt(
            _beltFarmPx,
            window.LAYOUT.BELT_FARM_START,
            window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_FARM_BELT_Y || 535) : EGG_GROUND_Y,
            canvas.width - window.LAYOUT.HOLE_RIGHT_MARGIN + window.LAYOUT.BELT_FARM_END_PAD,
            _beltSpeed(state.autoCollectLevel),
            false,
            state.autoCollectLevel > 0,
            true
        );

        const sellStartX = window.LAYOUT.BELT_SELL_START - 7 - (window.GAME_MODE !== 'portrait' ? 5 : 0);
        const sellEndX = canvas.width - window.LAYOUT.HOLE_RIGHT_MARGIN + (window.GAME_MODE !== 'portrait' ? 15 : 0);
        _applyBelt(
            _beltSellPx,
            sellStartX,
            UNDERGROUND_FLOOR_Y,
            Math.max(0, sellEndX - sellStartX - (window.LAYOUT.BELT_END_PAD || 0)),
            _beltSpeed(state.autoSellLevel),
            true,
            state.autoSellLevel > 0,
            false
        );
    }

    function initPixi() {
        if (_pixi) return;
        const result = window.GamePixi.init(canvas, canvas.parentNode);
        if (result) {
            _pixi = result.app; _pixiCont = result.container;
        } else {
            console.error(
                '[YumurtaFabrikasi] PixiJS did NOT initialise — canvas 2D fallback active.\n' +
                'Cause: ' + (window.location.protocol === 'file:'
                    ? 'file:// protocol blocks WebGL texture uploads. Serve via http:// (e.g. Live Server).'
                    : 'WebGL unavailable or PIXI not loaded.')
            );
        }
    }

    // Sync PixiJS canvas size on resize even when the game is paused
    window.addEventListener('resize', () => {
        if (_pixi) window.GamePixi.sync(canvas, _pixi);
        if (_bubbleCanvas && _pixi) {
            const pv = _pixi.view;
            _bubbleCanvas.style.width = pv.style.width;
            _bubbleCanvas.style.height = pv.style.height;
            _bubbleCanvas.style.left = pv.style.left;
            _bubbleCanvas.style.top = pv.style.top;
        }
    });

    // Overlay canvas for speech bubbles — sits on top of PIXI
    let _bubbleCanvas = null, _bubbleCtx = null;
    (function _initBubbleCanvas() {
        _bubbleCanvas = document.createElement('canvas');
        _bubbleCanvas.width = canvas.width;
        _bubbleCanvas.height = canvas.height;
        _bubbleCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;image-rendering:pixelated;z-index:10;';
        canvas.parentNode.appendChild(_bubbleCanvas);
        _bubbleCtx = _bubbleCanvas.getContext('2d');
    })();

    // ────────────────────────────────────────────────────────────────────────

    const chickenSpriteSheets = [];
    const baseChickenSprite = new Image();
    const chickenBeigeSprite = new Image();
    const chickenBrownSprite = new Image();
    const chickenBlackSprite = new Image();

    function _buildTintedChickenSprite(hex) {
        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = baseChickenSprite.width;
            tempCanvas.height = baseChickenSprite.height;
            const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
            tCtx.drawImage(baseChickenSprite, 0, 0);

            const imgData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imgData.data;
            const rT = parseInt(hex.substr(1, 2), 16);
            const gT = parseInt(hex.substr(3, 2), 16);
            const bT = parseInt(hex.substr(5, 2), 16);

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3];
                if (a > 0) {
                    const isGrayscale = Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && Math.abs(r - b) < 25;
                    if (isGrayscale) {
                        data[i] = (r * rT) / 255;
                        data[i + 1] = (g * gT) / 255;
                        data[i + 2] = (b * bT) / 255;
                    }
                }
            }
            tCtx.putImageData(imgData, 0, 0);
            return tempCanvas;
        } catch (e) {
            console.warn("Could not tint chicken sprite due to canvas tainting (e.g. running from file://). Falling back to base sprite.", e);
            return baseChickenSprite;
        }
    }

    baseChickenSprite.onload = () => {
        chickenSpriteSheets[0] = baseChickenSprite;
        if (chickenBeigeSprite.complete && chickenBeigeSprite.naturalWidth) chickenSpriteSheets[1] = chickenBeigeSprite;
        if (chickenBrownSprite.complete && chickenBrownSprite.naturalWidth) chickenSpriteSheets[2] = chickenBrownSprite;
        if (chickenBlackSprite.complete && chickenBlackSprite.naturalWidth) chickenSpriteSheets[3] = chickenBlackSprite;
        if (typeof drawUIIcons === 'function') drawUIIcons();
    };
    // ── Gallina remasterizada: chicken_white.png (24×24 px/frame, 8 frames/fila, 13 animaciones)
    baseChickenSprite.src = 'pixelart_design/chicken_white.png';
    chickenBeigeSprite.onload = () => {
        chickenSpriteSheets[1] = chickenBeigeSprite;
        if (typeof drawUIIcons === 'function') drawUIIcons();
    };
    chickenBeigeSprite.src = 'pixelart_design/chicken_beige.png';
    chickenBrownSprite.onload = () => {
        chickenSpriteSheets[2] = chickenBrownSprite;
        if (typeof drawUIIcons === 'function') drawUIIcons();
    };
    chickenBrownSprite.src = 'pixelart_design/chicken_brown.png';
    chickenBlackSprite.onload = () => {
        chickenSpriteSheets[3] = chickenBlackSprite;
        if (typeof drawUIIcons === 'function') drawUIIcons();
    };
    chickenBlackSprite.src = 'pixelart_design/chicken_black.png';

    // Gallinas especiales (Endless, fusión) — sprite PROPIO por tier, ya NO tinte
    // sobre la blanca (ver _tierMult / _pixiTex.chickenMega etc. más abajo).
    // Nombrado igual que los sprites de huevo equivalentes (Mega=t1, Pro=t2,
    // Gold=t3, Green=t4) + Purple=t5 nuevo.
    const chickenMegaSprite = new Image();
    chickenMegaSprite.src = 'pixelart_design/chicken_blue.png';

    const chickenProSprite = new Image();
    chickenProSprite.src = 'pixelart_design/chicken_pink.png';

    const chickenGoldSprite = new Image();
    chickenGoldSprite.src = 'pixelart_design/chicken_yellow.png';

    const chickenGreenSprite = new Image();
    chickenGreenSprite.src = 'pixelart_design/chicken_green.png';

    const chickenPurpleSprite = new Image();
    chickenPurpleSprite.src = 'pixelart_design/chicken_purple.png';

    // Lookup por tier para el draw 2D (mega 1-5 → su sprite; 0/false no se usa aquí).
    function _megaChickenSprite(mega) {
        return mega === 5 ? chickenPurpleSprite
            : mega === 4 ? chickenGreenSprite
            : mega === 3 ? chickenGoldSprite
            : mega === 2 ? chickenProSprite
            : mega === 1 ? chickenMegaSprite
            : null;
    }

    const eggSpriteSheet = new Image();
    eggSpriteSheet.src = 'pixelart_design/eggs.png';

    const bgSpriteSheet = new Image();
    bgSpriteSheet.src = window.GAME_MODE === 'portrait'
        ? 'pixelart_design/bg_portrait.png'
        : 'pixelart_design/bg.png';

    const roosterSpriteSheet = new Image();
    roosterSpriteSheet.src = 'pixelart_design/rooster.png';

    const radioSpriteSheet = new Image();
    radioSpriteSheet.src = 'pixelart_design/radio.png';

    const washingMachineSpriteSheet = new Image();
    washingMachineSpriteSheet.src = 'pixelart_design/washing_machine.png';

    const stampMachineSpriteSheet = new Image();
    stampMachineSpriteSheet.src = 'pixelart_design/stamp_machine.png';

    const packMachineSpriteSheet = new Image();
    packMachineSpriteSheet.src = 'pixelart_design/pack_machine.png';

    const boxingMachineSpriteSheet = new Image();
    boxingMachineSpriteSheet.src = 'pixelart_design/boxing_machine.png';

    const sebastianSpriteSheet = new Image();
    sebastianSpriteSheet.src = 'pixelart_design/sebastian.png';

    const tvSpriteSheet = new Image();
    tvSpriteSheet.src = 'pixelart_design/TV.png';

    const chickSpriteSheet = new Image();
    chickSpriteSheet.src = 'pixelart_design/chick.png';

    const tombstoneSpriteSheet = new Image();
    tombstoneSpriteSheet.src = 'pixelart_design/tombstone.png';

    const flowerSpriteSheet = new Image();
    flowerSpriteSheet.src = 'pixelart_design/Flowers.png';

    const waterTopSpriteSheet = new Image();
    waterTopSpriteSheet.src = 'pixelart_design/Water_top.png';

    const waterMidSpriteSheet = new Image();
    waterMidSpriteSheet.src = 'pixelart_design/Water_mid.png';

    const waterBottomSpriteSheet = new Image();
    waterBottomSpriteSheet.src = 'pixelart_design/Water_bottom.png';

    const waterStaticSpriteSheet = new Image();
    waterStaticSpriteSheet.src = 'pixelart_design/Water_Water_Static.png';

    const waterAnimSpriteSheet = new Image();
    waterAnimSpriteSheet.src = 'pixelart_design/water_water_anim.png';

    const waterAutoSpriteSheet = new Image();
    waterAutoSpriteSheet.src = 'pixelart_design/Water_auto.png';

    const waterAutoWaterSpriteSheet = new Image();
    waterAutoWaterSpriteSheet.src = 'pixelart_design/water_auto_water.png';

    const feederTopSpriteSheet = new Image();
    feederTopSpriteSheet.src = 'pixelart_design/Feeder_top.png';

    const feederMidSpriteSheet = new Image();
    feederMidSpriteSheet.src = 'pixelart_design/Feeder_mid.png';

    const feederBottomSpriteSheet = new Image();
    feederBottomSpriteSheet.src = 'pixelart_design/Feeder_bottom.png';

    const feederFoodSpriteSheet = new Image();
    feederFoodSpriteSheet.src = 'pixelart_design/Feeder_food.png';

    const feederFoodCapSpriteSheet = new Image();
    feederFoodCapSpriteSheet.src = 'pixelart_design/Feeder_food_cap.png';

    const feederAutoSpriteSheet = new Image();
    feederAutoSpriteSheet.src = 'pixelart_design/Feeder_auto.png';

    const feederAutoFoodSpriteSheet = new Image();
    feederAutoFoodSpriteSheet.src = 'pixelart_design/Feeder_auto_food.png';

    const beltLeftSpriteSheet = new Image();
    beltLeftSpriteSheet.src = 'pixelart_design/belt_left.png';

    const beltMidSpriteSheet = new Image();
    beltMidSpriteSheet.src = 'pixelart_design/belt_mid.png';

    const beltRightSpriteSheet = new Image();
    beltRightSpriteSheet.src = 'pixelart_design/belt_right.png';

    const heartSpriteSheet = new Image();
    heartSpriteSheet.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA6SURBVChTY/z//z8DPsAEJhkZ/4MxDCDxQSReIyAm4AFEKPj/nxHKxgRAOYgJ2BRBxRBWICuCsxkYAEWtFQiE3/O4AAAAAElFTkSuQmCC';

    const eggsSpriteSheet = new Image();
    eggsSpriteSheet.src = 'pixelart_design/eggs.png';

    const eggsPackageSpriteSheet = new Image();
    eggsPackageSpriteSheet.src = 'pixelart_design/eggs_old.png';

    const eggsMegaSpriteSheet = new Image();
    eggsMegaSpriteSheet.src = 'pixelart_design/eggs_1.png';

    const eggsProSpriteSheet = new Image();
    eggsProSpriteSheet.src = 'pixelart_design/eggs_2.png';

    const eggsGoldSpriteSheet = new Image();
    eggsGoldSpriteSheet.src = 'pixelart_design/eggs_3.png';

    const eggsGreenSpriteSheet = new Image();
    eggsGreenSpriteSheet.src = 'pixelart_design/eggs_4.png';

    const eggsPurpleSpriteSheet = new Image();
    eggsPurpleSpriteSheet.src = 'pixelart_design/eggs_5.png';

    const sortBonusSign = new Image();
    sortBonusSign.src = 'pixelart_design/cartel.png';

    function _drawSegmentedBelt(startX, baseY, width, boosted, speedFactor, movesRight) {
        if (width <= 0) return;

        const beltScale = Math.max(0.01, window.LAYOUT.BELT_SCALE || 1);
        const frameW = 10;
        const totalFrames = 5;
        const beltH = beltMidSpriteSheet.naturalHeight || 13;
        const beltRightAlphaPad = 0;
        const beltYOffset = window.LAYOUT.BELT_Y_OFFSET;
        const beltY = typeof beltYOffset === 'number' ? beltYOffset : -7;
        const beltStripeH = 6;
        const scaledWidth = width / beltScale;
        const ready =
            beltLeftSpriteSheet.complete && beltLeftSpriteSheet.naturalWidth &&
            beltMidSpriteSheet.complete && beltMidSpriteSheet.naturalWidth &&
            beltRightSpriteSheet.complete && beltRightSpriteSheet.naturalWidth;

        if (!ready) {
            ctx.save();
            ctx.translate(startX, baseY);
            ctx.scale(beltScale, beltScale);
            ctx.fillStyle = boosted ? '#1a4a1a' : '#333';
            ctx.fillRect(0, 0, scaledWidth, beltStripeH);
            ctx.strokeStyle = boosted ? '#2ecc71' : '#666';
            ctx.lineWidth = boosted ? 2 : 1;
            ctx.beginPath();
            ctx.rect(0, 0, scaledWidth, beltStripeH);
            ctx.clip();
            ctx.beginPath();
            const beltSpeed = Math.max(0.01, speedFactor || 1);
            let offset = (Date.now() * beltSpeed / 7.5) % 20;
            if (movesRight) {
                offset = 20 - offset;
            }
            for (let i = -20; i < scaledWidth + 20; i += 20) {
                const lx = i - offset;
                ctx.moveTo(lx, 0);
                ctx.lineTo(lx, beltStripeH);
            }
            ctx.stroke();
            ctx.lineWidth = 1;
            ctx.restore();
            return;
        }

        // Snap width to multiple of tile so no partial tiles appear
        const snappedScaledWidth = Math.ceil(scaledWidth / frameW) * frameW;

        ctx.save();
        const prevSmooth = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.translate(startX, baseY);
        ctx.scale(beltScale, beltScale);
        ctx.beginPath();
        ctx.rect(0, beltY, snappedScaledWidth, beltH);
        ctx.clip();

        const beltSpeed = Math.max(0.01, speedFactor || 1);
        let frameIdx = Math.floor(Date.now() * beltSpeed / 16.7) % totalFrames;
        if (movesRight) {
            frameIdx = (totalFrames - 1 - frameIdx + totalFrames) % totalFrames;
        }

        ctx.drawImage(beltLeftSpriteSheet, frameIdx * frameW, 0, frameW, beltH, 0, beltY, frameW, beltH);

        const innerEndX = snappedScaledWidth - frameW - beltRightAlphaPad;
        for (let x = frameW; x < innerEndX; x += frameW) {
            ctx.drawImage(beltMidSpriteSheet, frameIdx * frameW, 0, frameW, beltH, x, beltY, frameW, beltH);
        }

        if (snappedScaledWidth > frameW) {
            ctx.drawImage(beltRightSpriteSheet, frameIdx * frameW, 0, frameW, beltH, snappedScaledWidth - frameW, beltY, frameW, beltH);
        }

        ctx.imageSmoothingEnabled = prevSmooth;
        ctx.restore();
    }

    // ── Audio — sourced from shared/audio.js (window.GameAudio) ─────────────
    const sfxCok = window.GameAudio.sfxCok;
    const sfxEgg = window.GameAudio.sfxEgg;
    const sfxMoney = window.GameAudio.sfxMoney;
    const sfxDeathBirth = window.GameAudio.sfxDeathBirth;
    const sfxDeath = window.GameAudio.sfxDeath;
    const sfxLayEgg = window.GameAudio.sfxLayEgg;
    const sfxCatPurr = window.GameAudio.sfxCatPurr;
    const sfxPopBuy = window.GameAudio.sfxPopBuy;
    const sfxCok1 = window.GameAudio.sfxCok1;
    const sfxCok2 = window.GameAudio.sfxCok2;
    const sfxCok3 = window.GameAudio.sfxCok3;
    const bgmTheme = window.GameAudio.bgmTheme;
    const playSound = (a, v, t, p) => window.GameAudio.playSound(a, v, t, p);
    const playRestartSound = (a, v) => window.GameAudio.playRestartSound(a, v);
    const playRandomCok = () => window.GameAudio.playRandomCok();
    const sfxRefillWater   = window.GameAudio.sfxRefillWater;
    const sfxRefillFood    = window.GameAudio.sfxRefillFood;
    const sfxChickenAngry  = window.GameAudio.sfxChickenAngry;
    const sfxChickenWake   = window.GameAudio.sfxChickenWake;
    const sfxRoosterMate   = window.GameAudio.sfxRoosterMate;
    const sfxRoosterMatePrev = window.GameAudio.sfxRoosterMatePrev;
    const sfxRoosterCreate = window.GameAudio.sfxRoosterCreate;
    const sfxRoosterWake   = window.GameAudio.sfxRoosterWake;
    const sfxRoosterFight  = window.GameAudio.sfxRoosterFight;
    const sfxMachineCreate = window.GameAudio.sfxMachineCreate;
    const sfxStamp1        = window.GameAudio.sfxStamp1;
    const sfxStamp2        = window.GameAudio.sfxStamp2;
    const sfxChickAngry    = window.GameAudio.sfxChickAngry;
    const sfxChickWake     = window.GameAudio.sfxChickWake;
    const sfxChickBorn     = window.GameAudio.sfxChickBorn;
    const sfxPress         = window.GameAudio.sfxPress;
    const sfxRelease       = window.GameAudio.sfxRelease;
    const randomCokSounds = [sfxCok1, sfxCok2, sfxCok3];

    const _machinePopTime = {};
    const _POP_DUR = 0.45; // seconds
    function _popMult(key) {
        const t = _machinePopTime[key];
        if (!t) return 1;
        const e = (Date.now() - t) / 1000;
        if (e > _POP_DUR) return 1;
        return 1 + 0.38 * Math.sin((e / _POP_DUR) * Math.PI);
    }
    function _machineCreateFx(key) {
        if (key) _machinePopTime[key] = Date.now();
    }



    const updateBGM = () => window.GameAudio.updateBGM(state.musicLevel, state.chickens);

    // Desbloqueo de la música por gesto — SOLO hace falta fuera de Android:
    // ahí Capacitor ya desactiva la restricción nativa de gesto
    // (setMediaPlaybackRequiresUserGesture(false)) y la música arranca sola
    // al cargar (ver updateBGM() en GameSave.initAndLoad). En el resto de
    // plataformas (CrazyGames, itch.io, Steam, Galaxy) el navegador SÍ exige
    // un gesto real, así que este desbloqueo sigue haciendo falta ahí.
    if (!window.Capacitor?.isNativePlatform?.()) {
        document.body.addEventListener('click', () => {
            if (bgmTheme.paused && !window.isMusicMuted && !window.isBgmMuted) {
                bgmTheme.volume = 0.1;
                bgmTheme.play().catch(e => { });
            }
        }, { once: true });
    }

    // Android WebView Audio Unlock: resume AudioContext on first touch
    document.addEventListener('touchstart', function unlockAudio() {
        if (window.androidAudioUnlocked) return;
        window.androidAudioUnlocked = true;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const buf = ctx.createBuffer(1, 1, 22050);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            src.start(0);
            ctx.resume().then(() => {
                window.GameAudio._allAudioObjects.forEach(a => { if (a) a.load(); });
                // La música ya suena sola en Android (ver arriba) — este intento
                // solo hace falta en el resto de plataformas.
                if (!window.Capacitor?.isNativePlatform?.() && !window.isMusicMuted && !window.isBgmMuted) {
                    bgmTheme.volume = 0.1;
                    bgmTheme.play().catch(() => { });
                }
            });
        } catch (e) { }
        try {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            } else if (document.documentElement.webkitRequestFullscreen) {
                document.documentElement.webkitRequestFullscreen();
            }
        } catch (e) { }
    }, { once: true });

    const REFILL_TIERS = [50, 100, 250, 500, 1000];
    // Caché del último (n, modo) calculado — _simulateTierMoneyCost llama a
    // _nextChickenCost miles de veces SEGUIDAS con n creciendo de 1 en 1
    // (hasta 25.000 veces para Purple). Sin esto, cada llamada recalculaba la
    // cadena ENTERA desde n=5 (bucle O(n)), así que con purchasedChickens ya
    // en varios miles la simulación entera se volvía O(n²) — cientos de
    // millones de operaciones por frame, FPS por los suelos. Si el nuevo n
    // sigue directamente al último calculado (mismo modo), se sigue
    // multiplicando desde ahí en vez de recalcular desde cero.
    let _nextChickenCostCache = { n: 0, mult: null, cost: 0 };
    function _nextChickenCost(n) {
        if (n === 0) return 0;
        if (n === 1) return 2;
        if (n === 2) return 3;
        if (n === 3) return 4;
        if (n === 4) return 5;
        const _mult = state.activeChallenge === 'endless' ? 1.12 : 1.2;
        let cost, start;
        if (_nextChickenCostCache.mult === _mult && _nextChickenCostCache.n < n) {
            cost = _nextChickenCostCache.cost;
            start = _nextChickenCostCache.n + 1;
        } else {
            cost = 5;
            start = 5;
        }
        for (let i = start; i <= n; i++) cost = Math.ceil(cost * _mult);
        _nextChickenCostCache = { n, mult: _mult, cost };
        return cost;
    }

    // Media ponderada del multiplicador por TIPO de huevo (normal ×1 / premium
    // ×2 / dorado ×5), con las MISMAS probabilidades que layEgg() — se usa para
    // que el techo de precio de gallina (_chickenPriceCap) refleje el valor
    // medio REAL por huevo del jugador, no solo el caso normal. Pedido
    // explícito: que el techo también suba con premiumLevel/goldenLevel
    // (huevos azules/dorados), antes completamente ignorados ahí.
    function _avgEggTypeMult() {
        const _isE = state.activeChallenge === 'endless';
        const goldenChance  = Math.min(0.75, (state.goldenLevel || 0) * 0.01 + _ebGetBonus('goldEgg'));
        const premiumChance = Math.min(1.0, state.premiumLevel * (_isE ? 0.01 : 0.05) + _ebGetBonus('blueEgg'));
        const normalChance  = Math.max(0, 1 - goldenChance - premiumChance);
        return goldenChance * 5 + premiumChance * 2 + normalChance * 1;
    }

    function _chickenPriceCap() {
        const _isE = state.activeChallenge === 'endless';
        let v = getEggValue('normal');
        if (state.hasWasher) v *= _isE ? (1 + 0.12 * (state.washerLevel || 1)) : 2;
        if (state.hasStamper) v *= _isE ? (1 + 0.14 * (state.stamperLevel || 1)) : 2;
        if (state.hasPackager) v *= _isE ? (1 + 0.16 * (state.packagerLevel || 1)) : 2;
        if (state.hasRibbon) v *= _isE ? (1 + 0.18 * (state.ribbonLevel || 1)) : 2;
        if (state.hasTvAd) v *= state.activeChallenge === 'endless' ? (1 + (state.tvAdLevel || 1) * 0.20) : 2;
        v *= _avgEggTypeMult();
        // 5000 + nº de gallinas REALES (ponderadas por tier, ver _tierMult):
        // una Azul cuenta como 10, una Verde como 2500, etc. — no como 1 cada
        // una igual que una normal. Una manada grande produce más huevos/seg
        // (más gallinas poniendo a la vez, y las especiales ponen huevos que
        // valen mucho más), así que el techo también debe subir con el
        // tamaño REAL de la manada, no solo con el valor por huevo.
        const _weightedFlock = chickensArr.reduce((sum, c) => sum + _tierMult(c.mega), 0);
        return Math.floor((5000 + _weightedFlock) * v);
    }

    window.debugAllMaxed = () => {
        const _ie = state.activeChallenge === 'endless';
        const checks = _ie ? [] : [
            ['maxFoodLevel >= 10', state.maxFoodLevel >= 10, state.maxFoodLevel],
            ['maxWaterLevel >= 10', state.maxWaterLevel >= 10, state.maxWaterLevel],
            ['autoFoodLevel >= 7', state.autoFoodLevel >= AUTO_TICK_TIERS.length - 1, state.autoFoodLevel],
            ['autoWaterLevel >= 7', state.autoWaterLevel >= AUTO_TICK_TIERS.length - 1, state.autoWaterLevel],
            ['autoCollectLevel >= 5', (state.autoCollectLevel >= 5 || state.activeChallenge === 'manual'), state.autoCollectLevel],
            ['autoSellLevel >= 5', state.autoSellLevel >= 5, state.autoSellLevel],
            ['refillLevel >= 4', state.refillLevel >= REFILL_TIERS.length - 1, state.refillLevel],
            ['premiumLevel >= 10', state.premiumLevel >= 10, state.premiumLevel],
            ['goldenLevel >= 10', (state.goldenLevel || 0) >= 10, state.goldenLevel],
            ['hasWasher', state.hasWasher, state.hasWasher],
            ['hasStamper', state.hasStamper, state.hasStamper],
            ['hasPackager', state.hasPackager, state.hasPackager],
            ['hasRibbon', state.hasRibbon, state.hasRibbon],
            ['growthLevel >= 10', (state.growthLevel || 0) >= 10, state.growthLevel],
            ['musicLevel >= 10', state.musicLevel >= 10, state.musicLevel],
            ['dietLevel >= 4', state.dietLevel >= 4, state.dietLevel],
            ['batchLevel >= 2', (state.batchLevel || 0) >= 2, state.batchLevel],
            ['magnetLevel >= 9', (state.magnetLevel || 0) >= 9, state.magnetLevel],
            ['roosterLevel >= 3', (state.roosterLevel || 0) >= 3, state.roosterLevel],
            ['hasBox', state.hasBox, state.hasBox],
        ];
        console.log('── debugAllMaxed ──  mode:', state.activeChallenge, '| speedrun:', state.isSpeedrunMode);
        let ok = true;
        checks.forEach(([label, pass, val]) => {
            if (!pass) { console.warn('  ✗ FAIL:', label, '(val:', val, ')'); ok = false; }
            else console.log('  ✓', label, '(val:', val, ')');
        });
        console.log(ok ? '→ allMaxed = TRUE (tvAd should show)' : '→ allMaxed = FALSE');
        return ok;
    };
    window.checkChickenCap = () => {
        let v = getEggValue('normal');
        console.log('── Chicken Price Cap ──');
        console.log(`  Base egg value:  ${v.toFixed(4)}`);
        if (state.hasWasher) { v *= 1 + 0.12 * (state.washerLevel || 1); console.log(`  × Washer  Lv.${state.washerLevel || 1}:  ${v.toFixed(4)}`); }
        if (state.hasStamper) { v *= 1 + 0.14 * (state.stamperLevel || 1); console.log(`  × Stamper Lv.${state.stamperLevel || 1}:  ${v.toFixed(4)}`); }
        if (state.hasPackager) { v *= 1 + 0.16 * (state.packagerLevel || 1); console.log(`  × Packager Lv.${state.packagerLevel || 1}: ${v.toFixed(4)}`); }
        if (state.hasRibbon) { v *= 1 + 0.18 * (state.ribbonLevel || 1); console.log(`  × Ribbon  Lv.${state.ribbonLevel || 1}:  ${v.toFixed(4)}`); }
        if (state.hasTvAd) { v *= 1 + (state.tvAdLevel || 1) * 0.20; console.log(`  × TvAd   Lv.${state.tvAdLevel || 1}:  ${v.toFixed(4)}`); }
        const _avgMult = _avgEggTypeMult();
        v *= _avgMult;
        console.log(`  × media tipo huevo (premium/dorado incluidos) ×${_avgMult.toFixed(4)}: ${v.toFixed(4)}`);
        const _weightedFlock = chickensArr.reduce((sum, c) => sum + _tierMult(c.mega), 0);
        const _eggsBase = 5000 + _weightedFlock;
        const cap = Math.floor(_eggsBase * v);
        const raw = _nextChickenCost(state.purchasedChickens || 0);
        console.log(`  × (5000 + ${_weightedFlock} gallinas ponderadas = ${_eggsBase}) eggs  =  ${cap}`);
        console.log(`  Raw cost (no cap): ${raw}`);
        console.log(`  Applied cost: ${state.costs.chicken}  ${raw > cap ? '(CAPPED)' : '(no cap yet)'}`);
        return cap;
    };

    function _cappedChickenCost(n) {
        const raw = _nextChickenCost(n);
        if (state.activeChallenge !== 'endless') return raw;
        const cap = _chickenPriceCap();
        return (cap > 0 && cap < raw) ? cap : raw;
    }

    // Cuántas del tier ANTERIOR hacen falta para fusionar 1 de este tier
    // (mismos números que buy(): Blue=10 normales, Rose=5 Blues, Gold=10
    // Roses, Green=5 Golds, Purple=10 Greens). tier 0 = gallina normal.
    const _TIER_MERGE_COUNT = { 1: 10, 2: 5, 3: 10, 4: 5, 5: 10 };

    // Coste en $ y purchasedChickens resultante de "fabricar" `count` gallinas
    // del `tier` dado (1=Blue..5=Purple) puramente con dinero, sin tener
    // ninguna gallina física de partida — para poder comprar directamente
    // cualquier tier cuando no se tienen las del tier anterior a mano (p.ej.
    // ya fusionadas todas antes). Recursivo hacia tier 0 (gallina normal,
    // caso base): comprar 1 Rose con dinero implica comprar 5 Blues EN
    // SECUENCIA, cada una implicando 10 normales EN SECUENCIA — el coste
    // encadena purchasedChickens de principio a fin (no en paralelo), igual
    // que si de verdad las hubieras comprado una a una en ese orden.
    function _simulateTierMoneyCost(tier, count, startPurchased) {
        if (tier === 0) {
            let n = startPurchased, total = 0;
            for (let i = 0; i < count; i++) { n++; total += _cappedChickenCost(n); }
            return { cost: total, endPurchased: n };
        }
        const need = _TIER_MERGE_COUNT[tier];
        let total = 0, n = startPurchased;
        for (let i = 0; i < count; i++) {
            const sub = _simulateTierMoneyCost(tier - 1, need, n);
            total += sub.cost;
            n = sub.endPurchased;
        }
        return { cost: total, endPurchased: n };
    }
    // Atajo: coste de UNA gallina de `tier` a partir del purchasedChickens actual.
    function _tierMoneyCost(tier) {
        return _simulateTierMoneyCost(tier, 1, state.purchasedChickens || 0).cost;
    }
    function _refillAmt() {
        if (state.activeChallenge === 'endless') return Math.round(50 * Math.pow(1.18, state.refillLevel || 0));
        return REFILL_TIERS[Math.min(state.refillLevel || 0, REFILL_TIERS.length - 1)];
    }
    function _batchEggCap() {
        if (state.activeChallenge === 'endless') return 2 + (state.batchLevel || 0);
        return 2 * Math.pow(2, state.batchLevel || 0); // 2, 4, 8
    }
    function _batchFoodMult() {
        if (state.activeChallenge === 'endless') return (2 + (state.batchLevel || 0)) / 2;
        return Math.pow(2, state.batchLevel || 0); // 1, 2, 4
    }
    function _eggBaseTime() {
        if (state.activeChallenge === 'endless') return Math.round(30 * Math.pow(0.98, state.dietLevel || 0));
        return 10 - Math.min(4, state.dietLevel || 0);
    }
    function _refillCost() {
        const eggBase = Math.pow(state.activeChallenge === 'endless' ? 1.1 : 1.5, state.baseValueLevel || 0);
        const coeff = state.activeChallenge === 'endless' ? 0.15 : 0.075;
        return Math.max(1, Math.round(eggBase * coeff * _refillAmt()));
    }
    const AUTO_TICK_TIERS = [0, 1, 2, 4, 8, 12, 20, 40];
    const MAX_RESOURCE_TIERS = [50, 100, 200, 350, 550, 800, 1100, 1500, 1800, 2150, 2500];

    // Infinite auto-food/water rate: keeps old tier values, +20% per level beyond original max
    function _autoRate(level) {
        if (level <= 0) return 0;
        if (level < AUTO_TICK_TIERS.length) return AUTO_TICK_TIERS[level];
        return AUTO_TICK_TIERS[AUTO_TICK_TIERS.length - 1] * Math.pow(1.2, level - (AUTO_TICK_TIERS.length - 1));
    }
    // Infinite max-resource cap: keeps old tier values, +20% per level beyond original max
    function _maxResourceCap(level) {
        if (level < MAX_RESOURCE_TIERS.length) return MAX_RESOURCE_TIERS[level];
        return Math.floor(MAX_RESOURCE_TIERS[MAX_RESOURCE_TIERS.length - 1] * Math.pow(1.2, level - (MAX_RESOURCE_TIERS.length - 1)));
    }
    // Belt speed factor: 50 levels, +2% per level. Level 1 = 2%, level 50 = 100%.
    function _beltSpeed(level) {
        const base = state.activeChallenge === 'endless'
            ? Math.min(1, level * 0.04)
            : 0.01 + 0.99 * (level / 5);
        const _beltBonus = _ebGetBonus('belt');
        if (_beltBonus <= 0) return base;
        const cap = state.activeChallenge === 'endless' ? 1.4 : 1.0;
        return Math.min(cap, base + _beltBonus);
    }
    // Trough visual height: min 48px (16 top + 32 bottom), then +16px per mid section
    function _troughH(cap, level) {
        if (level !== undefined) return 48 + Math.min(10, level) * 16;
        return Math.round(48 + Math.min(1, Math.max(0, (cap - 50) / 2450)) * 32);
    }

    const MEADOW_BOTTOM = window.LAYOUT.MEADOW_BOTTOM;
    const MEADOW_LIMIT_Y = window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_MEADOW_LIMIT_Y || 400) : MEADOW_BOTTOM;
    const EGG_GROUND_Y = MEADOW_BOTTOM + window.LAYOUT.EGG_GROUND_OFFSET;
    const EGG_LIMIT_Y = window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_EGG_LIMIT_Y || 410) : EGG_GROUND_Y;
    const UNDERGROUND_CEILING_Y = window.LAYOUT.UNDERGROUND_CEILING_Y;
    const UNDERGROUND_FLOOR_Y = window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_UNDERGROUND_FLOOR_Y || 850) : window.LAYOUT.UNDERGROUND_FLOOR_Y;
    const UNDERGROUND_EGG_FLOOR_Y = (window.GAME_MODE === 'portrait' && window.PORTRAIT_UNDERGROUND_EGG_FLOOR_Y_OVERRIDE != null) ? window.PORTRAIT_UNDERGROUND_EGG_FLOOR_Y_OVERRIDE : UNDERGROUND_FLOOR_Y;
    const PACKAGE_FLOOR_Y = UNDERGROUND_FLOOR_Y + (window.GAME_MODE === 'portrait' && window.PORTRAIT_PACKAGE_FLOOR_Y_OFFSET != null ? window.PORTRAIT_PACKAGE_FLOOR_Y_OFFSET : 0);
    // Egg carton (huevera) — 4 cols × 3 rows = 12 eggs
    const CARTON_COLS = 4, CARTON_ROWS = 3;
    const CARTON_SLW = 12, CARTON_SLH = 10; // slot inner size
    const CARTON_GAP = 2, CARTON_PAD = 4;  // gap between slots, edge padding
    const BOX_W = CARTON_COLS * CARTON_SLW + (CARTON_COLS - 1) * CARTON_GAP + 2 * CARTON_PAD; // 62
    const BOX_H = CARTON_ROWS * CARTON_SLH + (CARTON_ROWS - 1) * CARTON_GAP + 2 * CARTON_PAD; // 42
    const BOX_WALL = 4; // kept for sell-zone compat

    // ── Ending data — scenarios/farm/ending.js (window.FarmEnding) ──────────
    const THE_END_MATRIX = window.FarmEnding.THE_END_MATRIX;
    const PIXEL_FONT = window.FarmEnding.PIXEL_FONT;
    const buildTextMatrix = (...args) => window.FarmEnding.buildTextMatrix(...args);
    const CRUELTY_MATRICES = window.FarmEnding.CRUELTY_MATRICES;
    function getGraveyardMatrix() {
        return window.FarmEnding.getGraveyardMatrix(state.chickens, tombstonesArr.length);
    }

    function assignGraveyardTarget(c) {
        c.action = 'walkToGraveyard';
        c.isGrey = false;
        c.isSad = true;
        let activeDeaths = chickensArr.filter(ch => ch.action === 'walkToGraveyard' || ch.action === 'sadFace').length +
            chicksArr.filter(ch => ch.action === 'walkToGraveyard' || ch.action === 'sadFace').length;
        let idx = tombstonesArr.length + activeDeaths - 1;

        let currentMatrix = getGraveyardMatrix();
        let countX = 0;
        let targetFound = false;
        let matrixCols = currentMatrix[0].length;
        let matrixRows = currentMatrix.length;
        let gSpacingX = Math.min(20, Math.floor((canvas.width - 60) / matrixCols));
        let gSpacingY = 24;
        let sX = (canvas.width - ((matrixCols - 1) * gSpacingX)) / 2;
        let sY = 80;

        for (let col = 0; col < matrixCols && !targetFound; col++) {
            for (let r = 0; r < matrixRows && !targetFound; r++) {
                if (currentMatrix[r][col] === 'X') {
                    if (countX === idx) {
                        c.targetX = sX + col * gSpacingX;
                        c.targetY = sY + r * gSpacingY;
                        targetFound = true;
                    }
                    countX++;
                }
            }
        }

        if (!targetFound) {
            c.targetX = 20 + Math.random() * (canvas.width - 40);
            c.targetY = 320 + Math.random() * 60;
        }
    }
    function assignSleepTarget(c) {
        c.action = 'walkToSleep';
        c.isGrey = true;
        c.isSad = false;
        c.targetX = 80 + Math.random() * (canvas.width - 160);
        c.targetY = 60 + Math.random() * (MEADOW_LIMIT_Y - 100);
        c.sleepDirection = Math.random() < 0.5 ? 1 : -1;
    }

    let cinematicPhase = 0;
    let cinematicTimer = 0;
    let retireFadeTimer = -1; // -1 = inactive, 0+ = fading

    let state = {
        adsRemoved: false,
        preregisterRewardNotified: false,
        money: 0,
        basket: [],
        food: 50,
        maxFood: 50,
        water: 50,
        maxWater: 50,

        chickens: 0,
        megaChickens: 0,
        gallinaPros: 0,
        chickenGolds: 0,
        chickenGreens: 0,
        chickenPurples: 0,
        blueUnlocked: false,
        roseUnlocked: false,
        goldUnlocked: false,
        greenUnlocked: false,
        purpleUnlocked: false,
        autoCollect: false,
        autoSellLevel: 0,
        premiumLevel: 0,
        goldenLevel: 0,
        goldenChance: 0,
        eggsSold: 0,
        refillLevel: 0,
        manualRefills: 0,
        maxFoodLevel: 0,
        maxWaterLevel: 0,
        autoFoodLevel: 0,
        autoFoodAmtLevel: 0,
        autoWaterAmtLevel: 0,
        autoWaterLevel: 0,
        baseValueLevel: 0,
        autoCollectLevel: 0,
        hasSorter: false,
        sorterLevel: 0,
        sortBonusLevel: 0,
        purchasedChickens: 0,
        globalChickenId: 0,
        sorterGoldBasket: [],
        sorterPremBasket: [],
        hasWasher: false,
        washerLevel: 0,
        hasBox: false,
        boxX: 300,
        boxY: 390,
        boxVelX: 0,
        boxVelY: 0,
        hasPackager: false,
        packagerLevel: 0,
        packageBuffer: [],
        magnetLevel: 0,
        hasRooster: false,
        roosterLevel: 0,
        hasStamper: false,
        stamperLevel: 0,
        hasRibbon: false,
        ribbonLevel: 0,
        musicLevel: 0,
        dietLevel: 0,
        batchLevel: 0,
        hasRetired: false,
        pettingLevel: 0,
        totalChicksBorn: 0,
        manualEggsMovedToMarket: 0,
        totalPets: 0,
        _offerEggDouble: 0,
        _offerFoodTimer: 0,
        _endlessBoostTimer: 0,
        _boostActive: [],
        _boostFrozen: {},
        _boostOfferTimer: 60,
        _boostCurrentOffer: null,
        _autoFoodTimer: 0,
        _autoWaterTimer: 0,

        costs: {
            chicken: 0,
            petting: 2,
            maxFood: 100,
            maxWater: 100,
            autoFood: 1000,
            autoWater: 1000,
            autoFoodAmt: 250,
            autoWaterAmt: 250,
            autoCollect: 15,
            autoSell: 40,
            refill: 1000,
            premium: 50,
            golden: 50000,
            baseValue: 10,
            box: 4,
            sorter: 250,
            sortBonus: 500,
            washer: 150,
            packager: 10000,
            magnet: 5,
            rooster: 200,
            growth: 1000,
            stamper: 1000,
            ribbon: 50000,
            music: 500,
            diet: 1500,
            batch: 30000,
            retire: 1000000000,
            tvAd: 250000
        }
    };
    const _STATE_DEFAULTS = JSON.parse(JSON.stringify(state));

    let roostersArr = [];
    let chicksArr = [];

    // ── Formatters — shared/utils.js (window.GameUtils) ────────────────────
    const fmt = (n) => window.GameUtils.fmt(n);
    const fmtMoney = (n) => window.GameUtils.fmtMoney(n);
    const getCurrencySym = () => window.GameUtils?.getCurrencySymbol ? window.GameUtils.getCurrencySymbol() : ((window.currentLang === 'tr' || (typeof localStorage !== 'undefined' && localStorage.getItem('chickenIdleLang') === 'tr')) ? '₺' : '$');
    const _shopEl = document.getElementById('shop');
    const fmtS = (n) => {
        const infoActive = _shopEl?.classList.contains('is-info') && _shopEl?.classList.contains('is-expanded');
        // En Endless los costes escalan mucho más rápido que en el resto de
        // modos — pedido explícito: formato corto (K/M/T...) ahí siempre,
        // sin importar desktop/portrait/info, no solo en portrait normal.
        const useShort = (window.GAME_MODE === 'portrait' && !infoActive) || state.activeChallenge === 'endless';
        const sym = getCurrencySym();
        return useShort
            ? sym + window.GameUtils.fmtShort(n)
            : sym + window.GameUtils.fmt(n);
    };

    const getPips = (cur, max) => window.GameUtils.getPips(cur, max);

    function drawSpeechBubble(_ctxIgnored, lines, x, y, isFlipped = false) {
        const ctx = _bubbleCtx || _ctxIgnored;
        ctx.save();
        let pulse = Math.abs(Math.sin(Date.now() / 200)) * 2;
        ctx.translate(x, y + (isFlipped ? pulse + 10 : -pulse));

        ctx.font = `${10 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
        let maxTw = 0;
        lines.forEach(l => {
            let w = ctx.measureText(l).width;
            if (w > maxTw) maxTw = w;
        });

        let boxW = maxTw + 16;
        let lineH = 15;
        let padding = 8;
        let boxH = (lines.length * lineH) + padding;
        let boxY = isFlipped ? 8 : -boxH - 2;

        // Auto-clamp horizontally if bubble is requested via absolute coordinates
        let shiftX = 0;
        if (x !== 0) {
            if (x - boxW / 2 < 10) shiftX = 10 - (x - boxW / 2);
            else if (x + boxW / 2 > 790) shiftX = 790 - (x + boxW / 2);
        }

        ctx.fillStyle = '#fff';
        ctx.fillRect(-boxW / 2 + shiftX, boxY, boxW, boxH);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(-boxW / 2 + shiftX, boxY, boxW, boxH);

        ctx.beginPath();
        if (isFlipped) {
            ctx.moveTo(-4, 8);
            ctx.lineTo(4, 8);
            ctx.lineTo(0, 0);
        } else {
            ctx.moveTo(-4, -2);
            ctx.lineTo(4, -2);
            ctx.lineTo(0, 4);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fff';
        if (isFlipped) {
            ctx.fillRect(-3, 7, 6, 3);
        } else {
            ctx.fillRect(-3, -4, 6, 3);
        }

        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], shiftX, boxY + padding + (i * lineH));
        }
        ctx.restore();
    }


    function drawFence(ctx, w, h) {
        let topY = 5; // Más pegada arriba

        // Top horizontal rails
        ctx.fillStyle = '#4a2e15'; ctx.fillRect(0, topY + 7, w, 6);
        ctx.fillStyle = '#4a2e15'; ctx.fillRect(0, topY + 27, w, 6);
        ctx.fillStyle = '#6b4423'; ctx.fillRect(0, topY + 5, w, 6);
        ctx.fillStyle = '#6b4423'; ctx.fillRect(0, topY + 25, w, 6);
        ctx.fillStyle = '#8b5a2b'; ctx.fillRect(0, topY + 5, w, 2);
        ctx.fillStyle = '#8b5a2b'; ctx.fillRect(0, topY + 25, w, 2);

        // Top fence vertical posts
        for (let x = 15; x < w; x += 55) {
            // Drop shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 2, topY - 10, 14, 50);
            // Base post
            ctx.fillStyle = '#7a4e25'; ctx.fillRect(x, topY - 10, 14, 48);
            ctx.beginPath(); ctx.moveTo(x, topY - 10); ctx.lineTo(x + 7, topY - 18); ctx.lineTo(x + 14, topY - 10); ctx.fill();
            // Highlight post
            ctx.fillStyle = '#9b6a3b'; ctx.fillRect(x, topY - 10, 3, 48);
            ctx.beginPath(); ctx.moveTo(x, topY - 10); ctx.lineTo(x + 7, topY - 18); ctx.lineTo(x + 7, topY - 10); ctx.fill();
            // Detail / Nail
            ctx.fillStyle = '#2a1a0d'; ctx.fillRect(x + 6, topY + 7, 2, 2);
            ctx.fillStyle = '#2a1a0d'; ctx.fillRect(x + 6, topY + 27, 2, 2);
        }
    }

    const moneyEl = document.getElementById('money');
    const chickensEl = document.getElementById('chickens');

    const btnCheat = document.getElementById('cheat-btn');
    const btnWipe = document.getElementById('wipe-btn');
    const translatorPanel = document.getElementById('translator-panel');
    const transAuthor = document.getElementById('trans-author');

    function _grantDebugMoney() {
        // Desactivado a petición explícita — se deja el cuerpo intacto para
        // poder reactivarlo luego sin rehacerlo.
        if (true) return;
        state.money += 100000000000;
        state.totalEarnings = (state.totalEarnings || 0) + 100000000000;
        updateUI();
    }

    let _transAuthorTapCount = 0;
    let _transAuthorTapTimer = null;
    const _translatorCheatBtn = document.createElement('button');
    _translatorCheatBtn.id = 'translator-cheat-btn';
    _translatorCheatBtn.type = 'button';
    _translatorCheatBtn.style.cssText = 'display:none;';
    _translatorCheatBtn.addEventListener('click', _grantDebugMoney);
    if (translatorPanel) translatorPanel.appendChild(_translatorCheatBtn);
    if (transAuthor) {
        transAuthor.style.cursor = 'var(--cur-finger)';
        transAuthor.title = ' ';
        transAuthor.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            _transAuthorTapCount++;
            clearTimeout(_transAuthorTapTimer);
            _transAuthorTapTimer = setTimeout(() => { _transAuthorTapCount = 0; }, 1500);
            if (_transAuthorTapCount >= 5) {
                _transAuthorTapCount = 0;
                _translatorCheatBtn.click();
            }
        });
    }

    const shopBtns = {
        chicken: document.getElementById('buy-chicken'),
        petting: document.getElementById('buy-petting'),
        maxFood: document.getElementById('buy-maxfood'),
        maxWater: document.getElementById('buy-maxwater'),
        autoFood: document.getElementById('buy-autofood'),
        autoWater: document.getElementById('buy-autowater'),
        autoFoodAmt: document.getElementById('buy-autofood-amt'),
        autoWaterAmt: document.getElementById('buy-autowater-amt'),
        autoCollect: document.getElementById('buy-autocollect'),
        autoSell: document.getElementById('buy-autosell'),
        refill: document.getElementById('buy-refill'),
        premium: document.getElementById('buy-premium'),
        golden: document.getElementById('buy-golden'),
        baseValue: document.getElementById('buy-basevalue'),
        washer: document.getElementById('buy-washer'),
        packager: document.getElementById('buy-packager'),
        magnet: document.getElementById('buy-magnet'),
        rooster: document.getElementById('buy-rooster'),
        growth: document.getElementById('buy-growth'),
        retire: document.getElementById('buy-retire'),
        stamper: document.getElementById('buy-stamper'),
        ribbon: document.getElementById('buy-ribbon'),
        sorter: document.getElementById('buy-sorter'),
        sortBonus: document.getElementById('buy-sortbonus'),
        music: document.getElementById('buy-music'),
        diet: document.getElementById('buy-diet'),
        batch: document.getElementById('buy-batch'),
        box: document.getElementById('buy-box'),
        tvAd: document.getElementById('buy-tvAd'),
        megaChicken: document.getElementById('buy-megachicken'),
        gallinaPro: document.getElementById('buy-gallinapro'),
        chickenGold: document.getElementById('buy-chickengold'),
        chickenGreen: document.getElementById('buy-chickengreen'),
        chickenPurple: document.getElementById('buy-chickenpurple')
    };

    // Initialize 4-zone grid layout: add .btn-title / .btn-price classes, append .upg-info + .lv-corner as direct children
    document.querySelectorAll('#shop-scroll .shop-btn').forEach(btn => {
        const spans = Array.from(btn.querySelectorAll(':scope > span'));
        if (spans.length >= 1) spans[0].classList.add('btn-title');
        if (spans.length >= 2) spans[1].classList.add('btn-price');
        if (!btn.querySelector(':scope > .upg-info')) {
            const ef = document.createElement('span'); ef.className = 'upg-info'; btn.appendChild(ef);
        }
        if (!btn.querySelector(':scope > .lv-corner')) {
            const lv = document.createElement('span'); lv.className = 'lv-corner'; btn.appendChild(lv);
        }
    });

    // Post-process: extract .btn-row2 content from inside .btn-title into direct-child zones
    function _shopBtnPost(btn) {
        const titleSpan = btn.querySelector(':scope > .btn-title');
        if (!titleSpan) return;
        const row2 = titleSpan.querySelector('.btn-row2');
        const infoInline = titleSpan.querySelector('.upg-info');
        const infoEl = btn.querySelector(':scope > .upg-info');
        const lvEl = btn.querySelector(':scope > .lv-corner');
        if (row2) {
            const inf = row2.querySelector('.upg-info');
            const lv = row2.querySelector('.lv-corner');
            if (infoEl) infoEl.innerHTML = inf ? inf.innerHTML : '';
            if (lvEl) lvEl.innerHTML = lv ? lv.innerHTML : '';
            row2.remove();
        } else if (infoInline) {
            if (infoEl) infoEl.textContent = infoInline.textContent;
            if (lvEl) lvEl.innerHTML = '';
            infoInline.remove();
        } else {
            if (infoEl) infoEl.innerHTML = '';
            if (lvEl) lvEl.innerHTML = '';
        }
        Array.from(titleSpan.childNodes).filter(n => n.nodeName === 'BR').forEach(n => n.remove());
    }

    function _normalizeShopBtns() {
        document.querySelectorAll('#shop-scroll .shop-btn').forEach(_shopBtnPost);
    }

    const shopCosts = {
        chicken: document.getElementById('cost-chicken'),
        petting: document.getElementById('cost-petting'),
        maxFood: document.getElementById('cost-maxfood'),
        maxWater: document.getElementById('cost-maxwater'),
        autoFood: document.getElementById('cost-autofood'),
        autoWater: document.getElementById('cost-autowater'),
        autoFoodAmt: document.getElementById('cost-autofood-amt'),
        autoWaterAmt: document.getElementById('cost-autowater-amt'),
        autoCollect: document.getElementById('cost-autocollect'),
        autoSell: document.getElementById('cost-autosell'),
        refill: document.getElementById('cost-refill'),
        premium: document.getElementById('cost-premium'),
        golden: document.getElementById('cost-golden'),
        baseValue: document.getElementById('cost-basevalue'),
        washer: document.getElementById('cost-washer'),
        packager: document.getElementById('cost-packager'),
        magnet: document.getElementById('cost-magnet'),
        rooster: document.getElementById('cost-rooster'),
        growth: document.getElementById('cost-growth'),
        retire: document.getElementById('cost-retire'),
        stamper: document.getElementById('cost-stamper'),
        ribbon: document.getElementById('cost-ribbon'),
        sorter: document.getElementById('cost-sorter'),
        sortBonus: document.getElementById('cost-sortbonus'),
        music: document.getElementById('cost-music'),
        diet: document.getElementById('cost-diet'),
        batch: document.getElementById('cost-batch'),
        box: document.getElementById('cost-box'),
        tvAd: document.getElementById('cost-tvAd'),
        megaChicken: document.getElementById('cost-megachicken'),
        gallinaPro: document.getElementById('cost-gallinapro'),
        chickenGold: document.getElementById('cost-chickengold'),
        chickenGreen: document.getElementById('cost-chickengreen'),
        chickenPurple: document.getElementById('cost-chickenpurple')
    };

    let autoSellTimer = 0;

    let chickensArr = [];
    let eggsArr = [];
    let particlesArr = [];
    let _saleAcc = { total: 0, golden: 0, premium: 0, mega: 0, timer: 0 };
    let _fakeRanking = null;
    let _rankHitBox = null;
    let tombstonesArr = [];
    let draggedEggs = [];
    let isDragging = false;
    let _boxDragging = false;
    let _boxDragOffX = 0, _boxDragOffY = 0;
    let _boxEjectAnim = 0;      // 0..1 flash when dispenser ejects box
    let _debugBoxCol = false;  // show collider debug overlay (toggle: 5 taps on money counter)
    // Capture mode (toggle: H) — hides on-screen elements that shouldn't appear in video
    // recordings: FPS/version/time/money HUD, the boost offer popup, chicken greeting
    // bubbles, and (via body.capture-mode-hide-menu in style.css) the main menu PLAY
    // button + footer bar. Add more elements here as needed by gating them on this flag.
    let _captureModeHidden = false;
    let _vortexAngle = 0;
    let mouseX = 0, mouseY = 0;

    function _roosterSetTarget(r, hen) {
        if (r.targetChicken && r.targetChicken !== hen && r.targetChicken.action === 'waitForMate') {
            r.targetChicken.action = 'roam';
            delete r.targetChicken.waitForMateTimer;
        }
        r.targetChicken = hen;
        if (hen) {
            if (hen.layEggPhase) {
                if (!hen.layEggEggDone) {
                    layEgg(hen.x, hen.y, hen.direction || 1, hen.mega || false);
                    hen.eggCount = (hen.eggCount || 0) + 1;
                }
                hen.layEggPhase = null;
                hen.layEggTimer = 0;
                hen.postLayTimer = 0;
                delete hen.layEggEggDone;
                delete hen.layEggCyclesLeft;
            }
            hen.action = 'waitForMate';
            hen.waitForMateTimer = 15;
            hen.direction = Math.random() < 0.5 ? 1 : -1;
        }
    }
    function _roosterClearTarget(r) {
        if (r.targetChicken && r.targetChicken.action === 'waitForMate') {
            r.targetChicken.action = 'roam';
            delete r.targetChicken.waitForMateTimer;
        }
        r.targetChicken = null;
        if (r._matingHen) {
            delete r._matingHen._beingMated;
            if (r._matingHen.action === 'waitForMate') {
                r._matingHen.action = 'roam';
                delete r._matingHen.waitForMateTimer;
            }
        }
        delete r._matingHen;
    }

    function createRooster(flyIn = false) {
        const base = {
            x: canvas.width / 2,
            y: MEADOW_LIMIT_Y / 2,
            moveTimer: 2,
            mateTimer: state.activeChallenge === 'endless' ? 150 : 30,
            sleepTimer: 90 + Math.random() * 60,
            wakeDuration: 0.471235,
            wakeTimer: 0,
            direction: 1,
            velX: 0,
            velY: 0,
            action: 'goToFood',
            targetChicken: null
        };
        if (flyIn) {
            const fromLeft = Math.random() < 0.5;
            const landX = fromLeft
                ? 80 + Math.random() * 160
                : canvas.width - 80 - Math.random() * 160;
            const landY = MEADOW_LIMIT_Y * 0.35 + Math.random() * (MEADOW_LIMIT_Y * 0.5);
            const startX = fromLeft ? -64 : canvas.width + 64;
            const startY = landY - 70;
            return Object.assign(base, {
                x: startX,
                y: startY,
                action: 'flyIn',
                flyInStartX: startX,
                flyInStartY: startY,
                flyInTargetX: landX,
                flyInTargetY: landY,
                direction: fromLeft ? 1 : -1
            });
        }
        return base;
    }

    function createChick(x, y) {
        const _isEndless = state.activeChallenge === 'endless';
        const CHICKEN_COLORS = ['#ffffff', '#ffffff', '#dcc5a4', '#8b5a2b', '#444444'];
        const cColor = CHICKEN_COLORS[Math.floor(Math.random() * CHICKEN_COLORS.length)];
        return {
            x: x,
            y: y,
            color: cColor,
            moveTimer: 2,
            foodTimer: _isEndless ? 50 : 10,
            growTimer: _isEndless ? Math.max(10, Math.round(450 * Math.pow(0.99, state.growthLevel || 0))) : (90 - ((state.growthLevel || 0) * 6)),
            direction: 1,
            velX: (Math.random() - 0.5) * 40,
            velY: (Math.random() - 0.5) * 40,
            action: 'roam',
            isGrey: false,
            failTimer: 0,
            hasFailedOnce: false,
            dead: false,
            variant: _chickenSheetVariantIndex(cColor),
            pioTimer: 2 + Math.random() * 3
        };
    }

    function _safeSpawnPos() {
        const pad = 20;
        const wb = _troughAABB(window.LAYOUT.TROUGH_WATER_X, waterTopSpriteSheet, waterMidSpriteSheet, waterBottomSpriteSheet, state.maxWaterLevel || 0, pad);
        const fb = _troughAABB(window.LAYOUT.TROUGH_FOOD_X, feederTopSpriteSheet, feederMidSpriteSheet, feederBottomSpriteSheet, state.maxFoodLevel || 0, pad);
        const _spawnX1 = state.hasRetired ? (window.CINEMATIC_CHICKEN_X1 ?? 20) : 20;
        const _spawnX2 = state.hasRetired ? canvas.width - (window.CINEMATIC_CHICKEN_X2_MARGIN ?? 20) : canvas.width - 20;
        const _spawnY1 = state.hasRetired ? (window.CINEMATIC_CHICKEN_Y1 ?? 40) : 40;
        const _spawnY2 = state.hasRetired ? MEADOW_LIMIT_Y - (window.CINEMATIC_CHICKEN_Y2_OFFSET ?? 0) : MEADOW_LIMIT_Y - 20;
        let x, y, tries = 0;
        do {
            x = _spawnX1 + Math.random() * (_spawnX2 - _spawnX1);
            y = _spawnY1 + Math.random() * (_spawnY2 - _spawnY1);
            tries++;
        } while (tries < 30 && (
            (fb && x > fb.x && x < fb.x + fb.w && y > fb.y && y < fb.y + fb.h) ||
            (wb && x > wb.x && x < wb.x + wb.w && y > wb.y && y < wb.y + wb.h)
        ));
        return { x, y };
    }

    function createChicken(mega = false, forcedColor = null, flyIn = false) {
        const CHICKEN_COLORS = ['#ffffff', '#ffffff', '#dcc5a4', '#8b5a2b', '#444444'];
        let cColor = forcedColor || CHICKEN_COLORS[Math.floor(Math.random() * CHICKEN_COLORS.length)];
        const _sp = _safeSpawnPos();

        const base = {
            color: cColor,
            mega: mega,
            moveTimer: Math.random() * 3,
            eggTimer: (state.isSpeedrunMode && chickensArr.length === 0) ? 1 : Math.random() * (state.activeChallenge === 'endless' ? 30 : 10),
            squishTimer: 0,
            direction: 1,
            velX: 0,
            velY: 0,
            action: 'roam',
            nextTrough: Math.random() < 0.5 ? 'goToFood' : 'goToWater',
            eggCount: 0,
            failTimer: 0,
            isGrey: false,
            variant: Math.floor(Math.random() * 4),
            hasFailedOnce: false,
            dead: false,
            wakeTimer: 0,
            wakeDuration: 0.471235,
            wakeNextAction: null
        };

        if (flyIn) {
            const fromLeft = Math.random() < 0.5;
            const landX = fromLeft
                ? 80 + Math.random() * 160
                : canvas.width - 80 - Math.random() * 160;
            const landY = MEADOW_LIMIT_Y * 0.35 + Math.random() * (MEADOW_LIMIT_Y * 0.5);
            const startX = fromLeft ? -64 : canvas.width + 64;
            const startY = landY - 70;
            return Object.assign(base, {
                x: startX,
                y: startY,
                action: 'flyIn',
                flyInStartX: startX,
                flyInStartY: startY,
                flyInTargetX: landX,
                flyInTargetY: landY,
                direction: fromLeft ? 1 : -1
            });
        }

        return Object.assign(base, {
            x: _sp.x,
            y: _sp.y,
            velX: (Math.random() - 0.5) * 40,
            velY: (Math.random() - 0.5) * 40
        });
    }

    function _wakeChicken(c, nextAction) {
        c.action = 'sleeping';
        c.wakeTimer = c.wakeDuration || 0.471235;
        c.wakeNextAction = nextAction || 'roam';
        c.isGrey = false;
        c.isSad = false;
        c.giveUpTimer = 0;
        c.jumpTimer = 0.5;
        c.sleepInStep = undefined;
        delete c.roamTargetX;
    }

    function initChickens() {
        chickensArr = [];
        const greenC = state.chickenGreens || 0;
        const goldC = state.chickenGolds || 0;
        const roseC = state.gallinaPros || 0;
        const blueC = state.megaChickens || 0;
        for (let i = 0; i < greenC; i++) chickensArr.push(createChicken(4));
        for (let i = 0; i < goldC; i++) chickensArr.push(createChicken(3));
        for (let i = 0; i < roseC; i++) chickensArr.push(createChicken(2));
        for (let i = 0; i < blueC; i++) chickensArr.push(createChicken(1));
        const tierCount = greenC + goldC + roseC + blueC;
        const regularC = Math.max(0, (state.chickens || 0) - tierCount);
        for (let i = 0; i < regularC; i++) chickensArr.push(createChicken(false));
    }
    initChickens();

    // lastTime managed by window.GameEngine
    const EGG_FALL_SPEED = 300;

    // Compute the AABB of a trough sprite using the same parameters as _applyTroughLayout.
    // Returns { x, y, w, h } in canvas coordinates, with optional padding.
    function _troughAABB(xOrigin, topImg, midImg, botImg, level, padding) {
        if (!topImg.naturalWidth || !midImg.naturalHeight || !botImg.naturalHeight) return null;
        level = Math.min(10, level);
        const S = 2.5;
        const isPortrait = window.GAME_MODE === 'portrait';
        const pS = isPortrait ? 1.5 : 1;
        const centerY = window.LAYOUT.TROUGH_CENTER_Y;

        const topH = topImg.naturalHeight * S;
        const botH = botImg.naturalHeight * S;
        const midH = Math.floor(midImg.naturalHeight / 3) * S;
        const visW = topImg.naturalWidth * S;
        const visH = topH + botH + level * midH;
        const wyTop = centerY - visH / 2;

        // sx/sy mirror _applyTroughLayout exactly
        const pcx = xOrigin + visW / 2;
        const left = isPortrait ? pcx + (xOrigin - pcx) * pS : xOrigin;
        const top = isPortrait ? centerY + (wyTop - centerY) * pS : wyTop;
        const w = visW * pS;
        const h = visH * pS;

        const pad = padding || 0;
        return { x: left - pad, y: top - pad, w: w + pad * 2, h: h + pad * 2 };
    }

    function resolveTroughCollision(c) {
        const padding = 5;
        const isTracking = (c.action === 'goToFood' || c.action === 'goToWater' || c.action === 'chase');
        // Pedido explícito: mientras va de camino a comer/beber (aún no ha llegado,
        // ver el "eating"/"drinking" que se activa al acercarse lo suficiente), que
        // NINGÚN colisionador de comedero/bebedero la detecte — antes el pushOut de
        // abajo la clavaba en el borde del colisionador (snap de posición duro, no
        // solo velocidad) y se quedaba pillada sin llegar nunca a su destino real.
        const isHeadingToTrough = (c.action === 'goToFood' || c.action === 'goToWater');

        function _pushOut(box) {
            if (isHeadingToTrough) return;
            if (!box) return;
            const { x, y, w, h } = box;
            if (c.x > x && c.x < x + w && c.y > y && c.y < y + h) {
                const dl = c.x - x, dr = (x + w) - c.x;
                const dt = c.y - y, db = (y + h) - c.y;
                const min = Math.min(dl, dr, dt, db);
                if (min === dl) { c.x = x; if (!isTracking) c.velX = -Math.abs(c.velX || 10); }
                else if (min === dr) { c.x = x + w; if (!isTracking) c.velX = Math.abs(c.velX || 10); }
                else if (min === dt) { c.y = y; if (!isTracking) c.velY = -Math.abs(c.velY || 10); }
                else { c.y = y + h; if (!isTracking) c.velY = Math.abs(c.velY || 10); }
            }
        }

        _pushOut(_troughAABB(window.LAYOUT.TROUGH_WATER_X, waterTopSpriteSheet, waterMidSpriteSheet, waterBottomSpriteSheet, state.maxWaterLevel || 0, padding));
        _pushOut(_troughAABB(window.LAYOUT.TROUGH_FOOD_X, feederTopSpriteSheet, feederMidSpriteSheet, feederBottomSpriteSheet, state.maxFoodLevel || 0, padding));
    }

    const BOX_SHELF_X = window.LAYOUT.BOX_SHELF_X;
    const BOX_SHELF_W = BOX_W + 14;
    const BOX_SHELF_TOP = UNDERGROUND_CEILING_Y + window.LAYOUT.BOX_SHELF_OFFSET_Y;

    function _cartonSlots(cX, cY) {
        const slots = [];
        for (let row = 0; row < CARTON_ROWS; row++)
            for (let col = 0; col < CARTON_COLS; col++)
                slots.push({
                    x: cX + CARTON_PAD + col * (CARTON_SLW + CARTON_GAP) + CARTON_SLW / 2,
                    y: cY + CARTON_PAD + row * (CARTON_SLH + CARTON_GAP) + CARTON_SLH / 2
                });
        return slots;
    }

    function _ejectBoxFromDispenser() {
        state.boxX = BOX_SHELF_X + (BOX_SHELF_W - BOX_W) / 2;
        state.boxY = BOX_SHELF_TOP - BOX_H;
        state.boxVelX = 0;
        state.boxVelY = 0;
        state.boxEggs = [];
        _boxEjectAnim = 1.0;
    }

    function update(dt) {
        if (window.isAdPaused) return;
        const _tUpdTop0 = performance.now();

        // Midgame ad — arms when playtime threshold is reached, fires on next pause
        state.nextAdTime = state.nextAdTime || 480;
        if (!_midgameAdReady && state.playTime >= state.nextAdTime) {
            state.nextAdTime += 480;
            _midgameAdReady = true;
        }

        // GC safety caps to prevent localStorage quota exceeded errors and mitigate FPS drops
        // egg cap removed for stress testing
        if (tombstonesArr.length > 300) tombstonesArr.splice(0, tombstonesArr.length - 300);

        // Cinematic pre-fade + animation — delegated to CinematicCore
        if (window.CinematicCore.isActive() || state.hasRetired) {
            window.CinematicCore.update(dt);
            cinematicPhase = window.CinematicCore.phase;
            cinematicTimer = window.CinematicCore.timer;
            retireFadeTimer = window.CinematicCore.preFade;
            if (state.hasRetired) {
                if (bgmTheme.paused && !window.isMusicMuted && !window.isBgmMuted && !document.hidden) { bgmTheme.volume = 0.5; bgmTheme.play().catch(function(){}); }
                if (Math.random() < 0.05 && cinematicPhase < 3) playRandomCok();
            }
            return;
        }

        if (window.isMusicMuted) {
            sfxCatPurr.volume = 0;
        } else if (window.catPurrVol > 0) {
            window.catPurrVol = Math.max(0, window.catPurrVol - 0.5 * dt);
            sfxCatPurr.volume = window.catPurrVol;
        }

        // TV Ad logic requires no per-frame updates, sales are boosted passively at collection.

        state.playTime = (state.playTime || 0) + dt;

        // Aviso "hay otros modos de juego" — solo CrazyGames, solo mientras el
        // jugador no haya abierto nunca la pantalla de selección de reto (ver
        // window._cgMarkOtherModesSeen, llamada desde index.html al mostrar ese
        // menú). Mismo patrón que el temporizador de nextAdTime de más arriba.
        if (window.GAME_MARKET === 'crazygames' && !_cgSeenOtherModes) {
            state.nextHintTime = state.nextHintTime || 600; // 10 min
            if (state.playTime >= state.nextHintTime) {
                const _hintChicken = chickensArr.length
                    ? chickensArr[Math.floor(Math.random() * chickensArr.length)]
                    : null;
                if (_hintChicken) {
                    _hintChicken.hintBubbleTimer = _HINT_BUBBLE_DURATION;
                    state.nextHintTime += 600;
                }
                // Si no hay gallinas todavía, no avanzamos nextHintTime — se
                // reintenta cada frame en vez de perder el intervalo entero.
            }
        }

        if (state.hasTvAd) {
            state.tvTimer = (state.tvTimer || 0) + dt;
            if (state.tvTimer >= 1) {
                state.tvTimer -= 1;
                state.tvUpvotes = (state.tvUpvotes || 0) + Math.floor(Math.random() * 5) + 1;
            }
        }

        saveTimer += dt;
        if (saveTimer >= 5) {
            saveState();
            saveTimer = 0;
        }

        _cloudTimer += dt;
        if (_cloudTimer >= 10) {
            _cloudTimer = 0;
            window.GameSave.cloudPush(_SAVE_KEYS);
        }

        _achCheckTimer += dt;
        if (_achCheckTimer >= 2) { _achCheckTimer = 0; checkAchievements(); }

        // Chick debug log — remove when bug is confirmed fixed
        if (typeof _chickDbgTimer === 'undefined') window._chickDbgTimer = 0;
        window._chickDbgTimer += dt;
        if (window._chickDbgTimer >= 3 && chicksArr.length > 0) {
            window._chickDbgTimer = 0;
            const FRAMES = 9;
            chicksArr.forEach((ch, i) => {
                const isEating = ch.action === 'eating';
                const isSleep = ch.action === 'sleeping' || ch.action === 'sadFace';
                const isJump = ch.jumpTimer > 0 || ch.squishTimer > 0;
                const isWalk = Math.abs(ch.velX) > 5 || Math.abs(ch.velY) > 5;
                let row = 0, frame = 0;
                if (isSleep) { row = 0; frame = 0; }
                else if (isEating) { row = 4; }
                else if (isJump) { row = 5; }
                else if (isWalk) { row = 1; }
                const idx = row * FRAMES + frame;
            });
        }

        _tickEndlessBoosts(dt);
        window.GameAudio.tickPioRateLimit(dt);

        const _mL = state.musicLevel || 0;
        let speedMult = state.activeChallenge === 'endless'
            ? 1 + 0.5 * (1 - Math.pow(0.9, _mL))
            : 1 + _mL * 0.15;
        if ((state._autoFoodFlowing || 0) > 0) state._autoFoodFlowing -= dt;
        if ((state._autoWaterFlowing || 0) > 0) state._autoWaterFlowing -= dt;
        if (state.activeChallenge === 'endless' && state.autoFoodLevel > 0) {
            const _afAmt = Math.round(5 * Math.pow(1.2, state.autoFoodAmtLevel || 0));
            const _afInterval = Math.max(0.5, 10 * Math.pow(0.90, state.autoFoodLevel - 1));
            const _afFoodRate = _afAmt / _afInterval;
            const _afCostRate = Math.max(1, Math.round(Math.pow(1.1, state.baseValueLevel || 0) * 0.15 * _afAmt)) / _afInterval;
            if (state.food < state.maxFood && state.money >= _afCostRate * dt) {
                state.food = Math.min(state.maxFood, state.food + _afFoodRate * dt);
                state.money -= _afCostRate * dt;
                _totalMoneySpent += _afCostRate * dt;
                state._autoFoodRate = _afFoodRate;
                state._autoFoodFlowing = 0.5;
                state._autoFoodParticleTimer = (state._autoFoodParticleTimer || 0) + dt;
                if (state._autoFoodParticleTimer >= 1.0) {
                    state._autoFoodParticleTimer -= 1.0;
                    const _afCostStr = _afCostRate >= 1 ? Math.round(_afCostRate) : _afCostRate >= 0.05 ? _afCostRate.toFixed(1) : null;
                    if (_afCostStr) particlesArr.push({ x: 765, y: 133, text: '-' + getCurrencySym() + _afCostStr + '/s', life: 1.0, color: '#e74c3c' });
                }
            } else {
                state._autoFoodParticleTimer = 0;
            }
        } else if (state.activeChallenge !== 'endless' && state.autoFoodLevel > 0) {
            if (state.food < state.maxFood) {
                const _nRate = _autoRate(state.autoFoodLevel);
                state.food = Math.min(state.maxFood, state.food + _nRate * dt);
                state._autoFoodRate = _nRate;
                state._autoFoodFlowing = 0.5;
            }
        }
        if (state.activeChallenge === 'endless' && state.autoWaterLevel > 0) {
            const _awAmt = Math.round(5 * Math.pow(1.2, state.autoWaterAmtLevel || 0));
            const _awInterval = Math.max(0.5, 10 * Math.pow(0.90, state.autoWaterLevel - 1));
            const _awWaterRate = _awAmt / _awInterval;
            const _awCostRate = Math.max(1, Math.round(Math.pow(1.1, state.baseValueLevel || 0) * 0.15 * _awAmt)) / _awInterval;
            if (state.water < state.maxWater && state.money >= _awCostRate * dt) {
                state.water = Math.min(state.maxWater, state.water + _awWaterRate * dt);
                state.money -= _awCostRate * dt;
                _totalMoneySpent += _awCostRate * dt;
                state._autoWaterRate = _awWaterRate;
                state._autoWaterFlowing = 0.5;
                state._autoWaterParticleTimer = (state._autoWaterParticleTimer || 0) + dt;
                if (state._autoWaterParticleTimer >= 1.0) {
                    state._autoWaterParticleTimer -= 1.0;
                    const _awCostStr = _awCostRate >= 1 ? Math.round(_awCostRate) : _awCostRate >= 0.05 ? _awCostRate.toFixed(1) : null;
                    if (_awCostStr) particlesArr.push({ x: 35, y: 133, text: '-' + getCurrencySym() + _awCostStr + '/s', life: 1.0, color: '#e74c3c' });
                }
            } else {
                state._autoWaterParticleTimer = 0;
            }
        } else if (state.activeChallenge !== 'endless' && state.autoWaterLevel > 0) {
            if (state.water < state.maxWater) {
                const _nWRate = _autoRate(state.autoWaterLevel);
                state.water = Math.min(state.maxWater, state.water + _nWRate * dt);
                state._autoWaterRate = _nWRate;
                state._autoWaterFlowing = 0.5;
            }
        }

        // Global starvation alarm removed; chickens scream individually when failing to eat/drink.

        particlesArr.forEach(p => {
            p.life -= dt;
            if (p.pixel) {
                p.y += (p.velY || 35) * dt;
            } else {
                p.y -= 20 * dt;
            }
            if (p.velX) p.x += p.velX * dt;
        });
        particlesArr = particlesArr.filter(p => p.life > 0);
        _activeHeartCount = particlesArr.reduce((n, p) => n + (p.text === '❤' ? 1 : 0), 0);

        // Flush sale particle accumulator (batches belt/auto sells into one readable particle)
        if (_saleAcc.total > 0) {
            _saleAcc.timer += dt;
            if (_saleAcc.timer >= 0.35) {
                const _sc = _saleAcc.golden > 0 ? '#ffd700' : _saleAcc.mega > 0 ? '#ff69b4' : _saleAcc.premium > 0 ? '#6bb8ff' : '#90ee90';
                particlesArr.push({ x: window.LAYOUT.SELL_POPUP_X + (Math.random() * 16 - 8), y: window.LAYOUT.SELL_POPUP_Y, text: '+' + getCurrencySym() + fmtMoney(_saleAcc.total), life: 1.5, color: _sc, rightAlign: true });
                _saleAcc.total = 0; _saleAcc.golden = 0; _saleAcc.premium = 0; _saleAcc.mega = 0; _saleAcc.timer = 0;
            }
        }

        tombstonesArr.forEach(t => {
            if (t.shakeTimer > 0) t.shakeTimer -= dt;
        });
        _dbgPerfSample('updateTop', performance.now() - _tUpdTop0);

        // Chicks AI
        const _tChicksAI0 = performance.now();
        let newChicks = [];
        chicksArr.forEach(ch => {
            if (ch.dead) {
                // Chicks sleep instead of dying — keep in array
                ch.dead = false;
                ch.action = 'sleeping';
                ch.giveUpTimer = 0;
            }

            // Conversión en curso: congela el AI y fuerza el timer hasta completar
            if (!ch.isGrey && ch.growTimer > 0 && ch.growTimer <= 1.0) {
                ch.growTimer -= dt;
                ch.velX = 0;
                ch.velY = 0;
                if (ch.growTimer <= 0) {
                    state.chickens++;
                    let newAdult = createChicken(false, ch.color || _chickenColorFromVariant(ch.variant));
                    newAdult.x = ch.x;
                    newAdult.y = ch.y;
                    chickensArr.push(_registerNewChicken(newAdult, true));
                    playSound(sfxCok, 0.5, 50);
                    return;
                }
                newChicks.push(ch);
                return;
            }

            if (!ch.isGrey && ch.action === 'roam') {
                ch.growTimer -= dt;
            }
            if (ch.growTimer <= 0) {
                state.chickens++;
                let newAdult = createChicken(false, ch.color || _chickenColorFromVariant(ch.variant));
                newAdult.x = ch.x;
                newAdult.y = ch.y;
                chickensArr.push(_registerNewChicken(newAdult, true));
                playSound(sfxCok, 0.5, 50);
                return;
            }

            if (!ch.isGrey && ch.action !== 'sleeping' && ch.action !== 'walkToSleep' && ch.action !== 'sadFace') {
                ch.pioTimer = (ch.pioTimer || 2) - dt;
                if (ch.pioTimer <= 0) {
                    ch.pioTimer = 2 + Math.random() * 3;
                    window.GameAudio.playChickSound();
                }
            }

            if (ch.action === 'roam') {
                ch.foodTimer -= dt;
                if (ch.foodTimer <= 0) {
                    // Ciclo: pasea → come → pasea → bebe → (bucle hasta que crece).
                    // pendingDrink lo pone 'eating' al acabar; así el paseo posterior lleva al bebedero.
                    ch.action = ch.pendingDrink ? 'goToWater' : 'goToFood';
                    ch.pendingDrink = false;
                    ch.troughY = undefined;
                    ch.goToFoodTimer = 0;
                    ch.roamTargetX = undefined; // Clear roam state
                } else {
                    if (ch.roamTargetX === undefined) {
                        ch.roamTargetX = 80 + Math.random() * (canvas.width - 160);
                        ch.roamTargetY = 70 + Math.random() * (MEADOW_LIMIT_Y - 120);

                        let dx = ch.roamTargetX - ch.x;
                        let dy = ch.roamTargetY - ch.y;
                        let dist = Math.sqrt(dx * dx + dy * dy);
                        let speed = 40;
                        if (dist > 0) {
                            ch.velX = (dx / dist) * speed;
                            ch.velY = (dy / dist) * speed;
                        }
                        ch.restTimer = 1 + Math.random() * 4;
                    }

                    let dx = ch.roamTargetX - ch.x;
                    let dy = ch.roamTargetY - ch.y;
                    let dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist <= 5) {
                        ch.velX = 0; ch.velY = 0;
                        ch.restTimer -= dt;
                        if (ch.restTimer <= 0) {
                            ch.roamTargetX = undefined; // trigger next wander
                        }
                    }
                }
            } else if (ch.action === 'failedFood') {
                ch.failTimer -= dt;
                // Nervous erratic movement
                if (ch.angryTargetX === undefined || (Math.abs(ch.x - ch.angryTargetX) < 10 && Math.abs(ch.y - ch.angryTargetY) < 10)) {
                    ch.angryTargetX = Math.max(60, Math.min(canvas.width - 60, ch.x + (Math.random() - 0.5) * 120));
                    ch.angryTargetY = Math.max(30, Math.min(MEADOW_LIMIT_Y, ch.y + (Math.random() - 0.5) * 120));
                    if (Math.random() > 0.3) ch.jumpTimer = 0.4;
                }
                const _cdx = ch.angryTargetX - ch.x, _cdy = ch.angryTargetY - ch.y;
                const _cd = Math.sqrt(_cdx * _cdx + _cdy * _cdy);
                if (_cd > 5) { ch.velX = (_cdx / _cd) * 90; ch.velY = (_cdy / _cd) * 90; ch.direction = ch.velX >= 0 ? 1 : -1; }
                else { ch.velX = 0; ch.velY = 0; }
                if (ch.failTimer <= 0) {
                    ch.action = 'goToFood';
                    ch.troughY = undefined;
                    ch.angryTargetX = undefined;
                    ch.isGrey = false;
                }
            }

            if (ch.action === 'goToFood') {
                if (ch.troughY === undefined) {
                    let fhBase = _troughH(state.maxFood, state.maxFoodLevel || 0);
                    let fyBase = window.LAYOUT.TROUGH_CENTER_Y - fhBase / 2;
                    ch.troughY = fyBase + 10 + Math.random() * Math.max(0, fhBase - 20);
                    ch.goToFoodTimer = 0;
                }
                ch.goToFoodTimer = (ch.goToFoodTimer || 0) + dt;
                // Timeout: si lleva demasiado sin llegar, se desatasca yendo a dormir
                if (ch.goToFoodTimer > 8) {
                    ch.troughY = undefined;
                    ch.goToFoodTimer = 0;
                    assignSleepTarget(ch);
                } else {
                    let fx = window.LAYOUT.TROUGH_FOOD_TARGET_X, fy = ch.troughY;
                    let dx = fx - ch.x;
                    let dy = fy - ch.y;
                    let dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 25) {
                        ch.troughY = undefined;
                        ch.goToFoodTimer = 0;
                        ch.velX = 0; ch.velY = 0;
                        if (state.food > 0) {
                            ch.action = 'eating';
                            ch.eatTimer = 2.0;
                            if (ch.consumptionGoal === undefined) ch.consumptionGoal = state.activeChallenge === 'endless' ? 5 : 10;
                        } else if (!ch.hasFailedOnce) {
                            ch.hasFailedOnce = true;
                            ch.action = 'failedFood';
                            ch.failTimer = 3.0;
                            playSound(sfxChickAngry, 0.45, 300);
                        } else {
                            assignSleepTarget(ch);
                        }
                    } else {
                        // Solo alinea Y primero si el pollito está pegado a la pared lateral
                        // del comedero (zona de riesgo de atasco). Fuera de esa zona va diagonal.
                        const _troughLeft = fx - (window.LAYOUT.TROUGH_W || 40);
                        let moveX = dx, moveY = dy;
                        if (ch.x >= _troughLeft - 30 && ch.x < fx && Math.abs(dy) > 20) {
                            moveX = 0; // alinea Y primero para no clavarse en la esquina
                        }
                        const moveDist = Math.sqrt(moveX * moveX + moveY * moveY) || 1;
                        ch.velX = (moveX / moveDist) * 80;
                        ch.velY = (moveY / moveDist) * 80;
                    }
                }
            } else if (ch.action === 'eating') {
                ch.eatTimer -= dt;
                ch.velX = 0; ch.velY = 0;
                ch.direction = 1;
                ch._eatPixTimer = (ch._eatPixTimer || 0) + dt;
                if (ch._eatPixTimer > 0.3) { ch._eatPixTimer = 0; for (let _pi = 0; _pi < 3; _pi++) particlesArr.push({ x: ch.x + 11 + (Math.random()-0.5)*4, y: ch.y - 5, color: '#f5c518', life: 0.5, velX: -(Math.random()*25+8), velY: Math.random()*40+20, pixel: true, size: 3 }); }

                let drain = 10 * (dt / 2.0); // Consumes 10 units over 2 seconds (1 by 1 effect)
                let actualDrain = _ebFamilyActive('food') ? 0 : Math.min(drain, state.food, ch.consumptionGoal);

                if (!_ebFamilyActive('food')) state.food -= actualDrain;
                ch.consumptionGoal -= actualDrain;

                if (state.food <= 0) ch.eatTimer = 0; // Stop eating if food runs out

                if (ch.eatTimer <= 0) {
                    if (ch.consumptionGoal > 0.1) {
                        if (!ch.hasFailedOnce) {
                            ch.hasFailedOnce = true;
                            ch.action = 'failedFood';
                            ch.failTimer = 3.0;
                            playSound(sfxChickAngry, 0.45, 300);
                        } else {
                            ch.isGrey = true;
                            if (!ch.hasSuffered) {
                                ch.hasSuffered = true;
                                state.chickensSuffered = (state.chickensSuffered || 0) + 1;
                            }
                            assignSleepTarget(ch);
                        }
                    } else {
                        // Ate fully — pasea un rato y LUEGO va a beber (pasean-comen-pasean-beben).
                        // pendingDrink hace que el siguiente destino tras el paseo sea el bebedero.
                        ch.action = 'roam';
                        ch.pendingDrink = true;
                        ch.foodTimer = 4 + Math.random() * 3;   // paseo corto antes de beber
                        ch.roamTargetX = undefined;
                        ch.troughY = undefined;
                        ch.goToFoodTimer = 0;
                        ch.hasFailedOnce = false;
                        delete ch.consumptionGoal;
                    }
                }
            } else if (ch.action === 'goToWater') {
                if (ch.troughY === undefined) {
                    const _whBase = _troughH(state.maxWater, state.maxWaterLevel || 0);
                    const _wyBase = window.LAYOUT.TROUGH_CENTER_Y - _whBase / 2;
                    // Clamp to MEADOW_LIMIT_Y so chicks can actually reach it (they can't go underground)
                    ch.troughY = Math.min(_wyBase + 10 + Math.random() * Math.max(0, _whBase - 20), MEADOW_LIMIT_Y);
                    ch.goToFoodTimer = 0;
                }
                ch.goToFoodTimer = (ch.goToFoodTimer || 0) + dt;
                if (ch.goToFoodTimer > 8) {
                    ch.troughY = undefined; ch.goToFoodTimer = 0;
                    ch.action = 'roam';
                    ch.foodTimer = (state.activeChallenge === 'endless' ? 50 : 10) + Math.random() * 5;
                } else {
                    const _wx = window.LAYOUT.TROUGH_WATER_TARGET_X, _wy = ch.troughY;
                    const _dx = _wx - ch.x, _dy = _wy - ch.y;
                    const _dist = Math.sqrt(_dx * _dx + _dy * _dy);
                    if (_dist < 25) {
                        ch.troughY = undefined; ch.goToFoodTimer = 0;
                        ch.velX = 0; ch.velY = 0;
                        if (state.water > 0) {
                            ch.action = 'drinking';
                            ch.eatTimer = 2.0;
                            ch.consumptionGoal = state.activeChallenge === 'endless' ? 5 : 10;
                        } else {
                            ch.action = 'roam';
                            ch.foodTimer = (state.activeChallenge === 'endless' ? 50 : 10) + Math.random() * 5;
                        }
                    } else {
                        // Anti-atasco (espejo del comedero): el bebedero está a la IZQUIERDA, así que el
                        // pollito llega desde la derecha. Si está pegado a la pared lateral del abrevadero,
                        // alinea primero la Y; si no, resolveTroughCollision() lo empuja fuera en diagonal
                        // y nunca baja de los 25px → se quedaba plantado sin llegar a beber.
                        const _troughRight = _wx + (window.LAYOUT.TROUGH_W || 40);
                        let _moveX = _dx, _moveY = _dy;
                        if (ch.x > _wx && ch.x <= _troughRight + 30 && Math.abs(_dy) > 20) {
                            _moveX = 0; // alinea Y primero para no clavarse en la esquina
                        }
                        const _moveDist = Math.sqrt(_moveX * _moveX + _moveY * _moveY) || 1;
                        ch.velX = (_moveX / _moveDist) * 80;
                        ch.velY = (_moveY / _moveDist) * 80;
                    }
                }
            } else if (ch.action === 'drinking') {
                ch.eatTimer -= dt;
                ch.velX = 0; ch.velY = 0;
                ch.direction = -1;
                ch._eatPixTimer = (ch._eatPixTimer || 0) + dt;
                if (ch._eatPixTimer > 0.3) { ch._eatPixTimer = 0; for (let _pi = 0; _pi < 3; _pi++) particlesArr.push({ x: ch.x - 11 + (Math.random()-0.5)*4, y: ch.y - 5, color: '#5bc8f5', life: 0.5, velX: +(Math.random()*25+8), velY: Math.random()*40+20, pixel: true, size: 3 }); }
                const _drain = 10 * (dt / 2.0);
                const _actualDrain = _ebFamilyActive('food') ? 0 : Math.min(_drain, state.water, ch.consumptionGoal || 10);
                if (!_ebFamilyActive('food')) state.water -= _actualDrain;
                ch.consumptionGoal = (ch.consumptionGoal || 10) - _actualDrain;
                if (state.water <= 0) ch.eatTimer = 0;
                if (ch.eatTimer <= 0) {
                    // Bebió: cierra el ciclo → pasea (largo) y la próxima parada vuelve a ser el comedero.
                    ch.action = 'roam';
                    ch.pendingDrink = false;
                    ch.foodTimer = (state.activeChallenge === 'endless' ? 50 : 10) + Math.random() * 5;
                    ch.roamTargetX = undefined;
                    ch.hasFailedOnce = false;
                    delete ch.consumptionGoal;
                    ch.velX = (Math.random() - 0.5) * 60;
                    ch.velY = Math.random() * 40;
                }
            } else if (ch.action === 'angry') {
                ch.angryTimer -= dt;
                if (ch.roamTargetX === undefined) {
                    ch.roamTargetX = 80 + Math.random() * (canvas.width - 160);
                    ch.roamTargetY = 70 + Math.random() * (MEADOW_BOTTOM - 120);
                }
                let dx = ch.roamTargetX - ch.x;
                let dy = ch.roamTargetY - ch.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 5) {
                    let speed = 120; // Fast erratic running
                    ch.velX = (dx / dist) * speed;
                    ch.velY = (dy / dist) * speed;
                } else {
                    ch.roamTargetX = undefined;
                }

                if (ch.jumpTimer <= 0) ch.jumpTimer = 0.5; // continuous jumping

                if (ch.angryTimer <= 0) {
                    if (ch.hasFailedOnce) {
                        assignSleepTarget(ch);
                    } else {
                        ch.action = 'goToFood';
                        ch.troughY = undefined;
                        ch.isGrey = false;
                        ch.jumpTimer = 0;
                    }
                }
            } else if (ch.action === 'walkToSleep' || ch.action === 'walkToGraveyard') {
                let dx = ch.targetX - ch.x;
                let dy = ch.targetY - ch.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 5) {
                    let speed = 60;
                    ch.velX = (dx / dist) * speed;
                    ch.velY = (dy / dist) * speed;
                    ch.direction = ch.velX >= 0 ? 1 : -1;
                } else {
                    ch.x = ch.targetX;
                    ch.y = ch.targetY;
                    ch.velX = 0;
                    ch.velY = 0;
                    ch.direction = ch.sleepDirection || (Math.random() < 0.5 ? 1 : -1);
                    ch.action = 'sleeping';
                    ch.giveUpTimer = 0;
                }
            } else if (ch.action === 'sadFace') {
                ch.giveUpTimer -= dt;
                if (ch.giveUpTimer <= 0) {
                    ch.action = 'sleeping';
                    ch.giveUpTimer = 0;
                }
            } else if (ch.action === 'waitForMate') {
                ch.velX = 0; ch.velY = 0;
                ch.waitForMateTimer = (ch.waitForMateTimer || 15) - dt;
                if (ch.waitForMateTimer <= 0) {
                    ch.action = 'roam';
                    delete ch.waitForMateTimer;
                }
            } else if (ch.action === 'sleeping') {
                if (ch.wakeTimer > 0) {
                    ch.wakeTimer -= dt;
                    ch.velX = 0;
                    ch.velY = 0;
                    if (ch.wakeTimer <= 0) {
                        ch.action = ch.wakeNextAction || 'roam';
                        ch.wakeTimer = 0;
                        ch.wakeNextAction = null;
                        ch.hasFailedOnce = false;
                        ch.angryTargetX = undefined;
                        playSound(sfxChickWake, 0.3, 200);
                    }
                }
                ch.velX = 0; ch.velY = 0;
            }

            ch.x += ch.velX * dt * speedMult;
            ch.y += ch.velY * dt * speedMult;
            if (ch.x < 20) ch.x = 20;
            if (ch.x > canvas.width - 20) ch.x = canvas.width - 20;
            if (ch.y < 40) ch.y = 40;
            if (ch.y > MEADOW_LIMIT_Y) ch.y = MEADOW_LIMIT_Y;

            // Collision for Water/Food Troughs (avoid hiding behind them)
            resolveTroughCollision(ch);

            if (Math.abs(ch.velX) > 1) {
                ch.direction = ch.velX >= 0 ? 1 : -1;
            }
            newChicks.push(ch);
        });
        chicksArr = newChicks;
        _dbgPerfSample('chicksLogic', performance.now() - _tChicksAI0);

        // Rooster AI
        const _tRoosterAI0 = performance.now();
        if (state.hasRooster || roostersArr.length > 0) {
            roostersArr.forEach(r => {
                if (r.squishTimer > 0) r.squishTimer -= dt;
                if (r.jumpTimer > 0) r.jumpTimer -= dt;

                if (r.action === 'roam') r.action = 'goToFood';

                // ── Fly in (compra) ──────────────────────────────────────────
                if (r.action === 'flyIn') {
                    const FLY_SPEED = 130;
                    r.velX = r.direction * FLY_SPEED;
                    r.velY = 0;
                    r.x += r.velX * dt;
                    const totalDx = r.flyInTargetX - r.flyInStartX;
                    const ratio = totalDx !== 0 ? Math.max(0, Math.min(1, (r.x - r.flyInStartX) / totalDx)) : 1;
                    r.y = r.flyInStartY + (r.flyInTargetY - r.flyInStartY) * ratio;
                    const arrived = r.direction > 0 ? r.x >= r.flyInTargetX : r.x <= r.flyInTargetX;
                    if (arrived) {
                        r.x = r.flyInTargetX;
                        r.y = r.flyInTargetY;
                        r.squishTimer = 0.3;
                        r.action = 'goToFood';
                        playSound(sfxRoosterCreate, 0.7, 200);
                    }
                    return;
                }

                // ── Sleeping ────────────────────────────────────────────────
                if (r.action === 'sleeping') {
                    r.velX = 0; r.velY = 0;
                    if (r.wakeTimer > 0) {
                        r.wakeTimer -= dt;
                        if (r.wakeTimer <= 0) {
                            r.wakeTimer = 0;
                            r.isGrey = false;
                            delete r.hasFailedOnce;
                            r.action = 'goToFood';
                            playSound(sfxRoosterWake, 0.5, 500);
                        }
                    }
                    return;
                }

                // ── Mating animation (row 9) ─────────────────────────────────
                if (r.action === 'mating') {
                    r.mateAnimTimer = (r.mateAnimTimer || 0) - dt;
                    r.velX = 0; r.velY = 0;
                    if (r._matingHen) r.direction = r.x < r._matingHen.x ? 1 : -1;
                    if (r.mateAnimTimer <= 0) {
                        if (r._matingHen) {
                            const _hen = r._matingHen;
                            const _cx = (r.x + _hen.x) / 2;
                            const _cy = (r.y + _hen.y) / 2;
                            chicksArr.push(createChick(_cx, _cy));
                            state.totalChicksBorn = (state.totalChicksBorn || 0) + 1;
                            particlesArr.push({ x: _cx, y: _cy - 20, text: '❤', life: 1.0 });
                            playSound(sfxChickBorn, 0.5, 200);
                            delete _hen._beingMated;
                            if (_hen.action === 'waitForMate') {
                                _hen.action = 'roam';
                                delete _hen.waitForMateTimer;
                            }
                        }
                        delete r._matingHen;
                        const next = r._matingNext || 'waitAfterMate';
                        delete r._matingNext;
                        if (next === 'waitAfterMate') {
                            r.action = 'waitAfterMate';
                            r.waitPhaseTimer = r._waitPhase25 || 4;
                            delete r._waitPhase25;
                        } else {
                            r.action = 'roamAfterEat';
                        }
                    }
                    return;
                }

                // ── Post-meal wait (25%) ──────────────────────────────────────
                if (r.action === 'waitAfterMate') {
                    r.velX = 0; r.velY = 0;
                    r.waitPhaseTimer = (r.waitPhaseTimer || 0) - dt;
                    if (r.waitPhaseTimer <= 0) {
                        r.action = r.nextTrough || 'goToFood';
                        r.nextTrough = (r.nextTrough === 'goToFood') ? 'goToWater' : 'goToFood';
                    }
                    return;
                }

                // ── Eating / drinking ─────────────────────────────────────────
                if (r.action === 'eating' || r.action === 'drinking') {
                    r.eatTimer -= dt;
                    r.velX = 0; r.velY = 0;
                    r.direction = (r.action === 'eating') ? 1 : -1;
                    r._eatPixTimer = (r._eatPixTimer || 0) + dt;
                    if (r._eatPixTimer > 0.3) { r._eatPixTimer = 0; const _rDir = r.action === 'eating' ? 1 : -1; for (let _pi = 0; _pi < 3; _pi++) particlesArr.push({ x: r.x + _rDir*17 + (Math.random()-0.5)*4, y: r.y - 33, color: r.action === 'eating' ? '#f5c518' : '#5bc8f5', life: 0.5, velX: -_rDir*(Math.random()*25+8), velY: Math.random()*40+20, pixel: true, size: 3 }); }
                    if (r.consumptionGoal === undefined) r.consumptionGoal = 10;
                    const drain = 10 * (dt / 2.0);
                    const resource = r.action === 'eating' ? state.food : state.water;
                    const actualDrain = Math.min(drain, resource, r.consumptionGoal);
                    if (r.action === 'eating' && !_ebFamilyActive('food')) state.food -= actualDrain;
                    if (r.action === 'drinking' && !_ebFamilyActive('food')) state.water -= actualDrain;
                    r.consumptionGoal -= actualDrain;
                    if ((r.action === 'eating' && state.food <= 0) || (r.action === 'drinking' && state.water <= 0)) r.eatTimer = 0;
                    if (r.eatTimer <= 0) {
                        if (r.consumptionGoal > 0.5) {
                            r.isGrey = true;
                            if (r.hasFailedOnce) {
                                assignSleepTarget(r);
                            } else {
                                r.hasFailedOnce = true;
                                r.action = r.action === 'eating' ? 'failedFood' : 'failedWater';
                                r.failTimer = 3.0;
                            }
                        } else {
                            r.isGrey = false;
                            delete r.hasFailedOnce;
                            delete r.consumptionGoal;
                            const _total = 15 + Math.random() * 5;
                            r.action = 'roamAfterEat';
                            r.roamPhaseTimer = _total * 0.75;
                            r._waitPhase25 = _total * 0.25;
                            delete r.roamTargetX;
                        }
                    }
                    return;
                }

                // ── Angry (failed food/water) ─────────────────────────────────
                if (r.action === 'failedFood' || r.action === 'failedWater') {
                    r.failTimer -= dt;
                    if (r.angryTargetX === undefined || (Math.abs(r.x - r.angryTargetX) < 10 && Math.abs(r.y - r.angryTargetY) < 10)) {
                        r.angryTargetX = Math.max(100, Math.min(canvas.width - 100, r.x + (Math.random() - 0.5) * 150));
                        r.angryTargetY = Math.max(40, Math.min(MEADOW_LIMIT_Y, r.y + (Math.random() - 0.5) * 150));
                        if (Math.random() > 0.2) r.jumpTimer = 0.4;
                    }
                    const _dx = r.angryTargetX - r.x, _dy = r.angryTargetY - r.y;
                    const _d = Math.sqrt(_dx * _dx + _dy * _dy);
                    if (_d > 5) { r.velX = (_dx / _d) * 100; r.velY = (_dy / _d) * 100; r.direction = r.velX >= 0 ? 1 : -1; }
                    else { r.velX = 0; r.velY = 0; }
                    if (r.failTimer <= 0) {
                        r.action = r.action === 'failedFood' ? 'goToFood' : 'goToWater';
                        delete r.angryTargetX;
                    }
                }

                // ── Go to trough ──────────────────────────────────────────────
                else if (r.action === 'goToFood' || r.action === 'goToWater') {
                    if (r.troughY === undefined) {
                        const hBase = (r.action === 'goToFood') ? _troughH(state.maxFood, state.maxFoodLevel || 0) : _troughH(state.maxWater, state.maxWaterLevel || 0);
                        const yBase = window.LAYOUT.TROUGH_CENTER_Y - hBase / 2;
                        r.troughY = yBase + 10 + Math.random() * Math.max(0, hBase - 20);
                    }
                    const targetX = r.action === 'goToFood' ? window.LAYOUT.TROUGH_FOOD_TARGET_X : window.LAYOUT.TROUGH_WATER_TARGET_X;
                    const _dx = targetX - r.x, _dy = r.troughY - r.y;
                    const _d = Math.sqrt(_dx * _dx + _dy * _dy);
                    if (_d > 25) {
                        const spd = r.isGrey ? 100 : 70;
                        r.velX = (_dx / _d) * spd; r.velY = (_dy / _d) * spd;
                        r.direction = r.velX >= 0 ? 1 : -1;
                    } else {
                        delete r.troughY;
                        const hasRes = r.action === 'goToFood' ? state.food > 0 : state.water > 0;
                        if (hasRes || !r.hasFailedOnce) {
                            r.action = r.action === 'goToFood' ? 'eating' : 'drinking';
                            r.eatTimer = 2.0;
                            r.consumptionGoal = 10;
                            r.isGrey = false;
                        } else {
                            assignSleepTarget(r);
                        }
                    }
                }

                // ── Roam after eat (75%) + breeding ───────────────────────────
                else if (r.action === 'roamAfterEat') {
                    r.roamPhaseTimer -= dt;
                    r.mateTimer = (r.mateTimer || 0) - dt;
                    if (r.roamPhaseTimer <= 0) {
                        if ((r.mateTimer || 0) > 0 && !r.isGrey) {
                            // Not ready to mate yet — start another roam lap
                            const _lapTotal = 10 + Math.random() * 8;
                            r.roamPhaseTimer = _lapTotal * 0.75;
                            r._waitPhase25   = _lapTotal * 0.25;
                            delete r.roamTargetX;
                        } else {
                            const awakeHens = chickensArr.filter(c => c.action !== 'sleeping' && c.action !== 'walkToSleep' && c.action !== 'sadFace' && c.action !== 'waitForMate' && !c.dead);
                            if (awakeHens.length > 0) {
                                r.action = 'goToMate';
                                _roosterSetTarget(r, awakeHens[Math.floor(Math.random() * awakeHens.length)]);
                                r._matingNext = 'waitAfterMate';
                                playSound(sfxRoosterMatePrev, 0.3, 1000);
                            } else {
                                r.action = 'waitAfterMate';
                                r.waitPhaseTimer = r._waitPhase25 || 4;
                                delete r._waitPhase25;
                            }
                            r.velX = 0; r.velY = 0;
                        }
                    } else {
                        if (r.roamTargetX === undefined) { r.roamTargetX = r.x; r.roamTargetY = r.y; r.restTimer = 1 + Math.random() * 2; }
                        const _dx = r.roamTargetX - r.x, _dy = r.roamTargetY - r.y;
                        const _d = Math.sqrt(_dx * _dx + _dy * _dy);
                        if (_d > 5) { r.velX = (_dx / _d) * 45; r.velY = (_dy / _d) * 45; }
                        else {
                            r.velX = 0; r.velY = 0;
                            r.restTimer = (r.restTimer || 0) - dt;
                            if (r.restTimer <= 0) {
                                r.roamTargetX = 80 + Math.random() * (canvas.width - 160);
                                r.roamTargetY = 70 + Math.random() * (MEADOW_LIMIT_Y - 120);
                                r.restTimer = 2 + Math.random() * 4;
                            }
                        }
                    }
                }

                // ── Go to mate (walk to a hen, then animate) ─────────────────
                else if (r.action === 'goToMate') {
                    const alive = r.targetChicken && !r.targetChicken.dead &&
                        r.targetChicken.action !== 'sleeping' && r.targetChicken.action !== 'walkToSleep' && r.targetChicken.action !== 'sadFace';
                    if (!alive) {
                        _roosterClearTarget(r);
                        const awakeHens = chickensArr.filter(c => c.action !== 'sleeping' && c.action !== 'walkToSleep' && c.action !== 'sadFace' && c.action !== 'waitForMate' && !c.dead);
                        if (awakeHens.length > 0) {
                            _roosterSetTarget(r, awakeHens[Math.floor(Math.random() * awakeHens.length)]);
                        } else {
                            r.action = 'waitAfterMate';
                            r.waitPhaseTimer = r._waitPhase25 || 4;
                            delete r._waitPhase25;
                        }
                    } else {
                        const _dx = r.targetChicken.x - r.x, _dy = r.targetChicken.y - r.y;
                        const _d = Math.sqrt(_dx * _dx + _dy * _dy);
                        if (_d < 15) {
                            const _hen = r.targetChicken;
                            r._matingHen = _hen;
                            r.targetChicken = null;
                            _hen._beingMated = true;
                            r.x = _hen.x - _hen.direction * 17;
                            r.y = _hen.y + 16;
                            r.direction = _hen.direction;
                            r.mateTimer = state.activeChallenge === 'endless' ? 150 + chicksArr.length * 25 : 30;
                            r.action = 'mating';
                            r.mateAnimTimer = 1.885;
                            r._matingNext = r._matingNext || 'waitAfterMate';
                            r.velX = 0; r.velY = 0;
                            playSound(sfxRoosterMate, 0.3, 500);
                        } else {
                            r.velX = (_dx / _d) * 70; r.velY = (_dy / _d) * 70;
                        }
                    }
                }

                // ── Chase (breeding) ──────────────────────────────────────────
                else if (r.action === 'chase') {
                    const alive = r.targetChicken && !r.targetChicken.dead &&
                        r.targetChicken.action !== 'sleeping' && r.targetChicken.action !== 'walkToSleep' && r.targetChicken.action !== 'sadFace';
                    if (!alive) {
                        _roosterClearTarget(r);
                        r.action = 'roamAfterEat';
                        r.mateTimer = state.activeChallenge === 'endless' ? 150 : 30;
                    } else {
                        const _dx = r.targetChicken.x - r.x, _dy = r.targetChicken.y - r.y;
                        const _d = Math.sqrt(_dx * _dx + _dy * _dy);
                        if (_d < 15) {
                            const _hen = r.targetChicken;
                            r._matingHen = _hen;
                            r.targetChicken = null;
                            _hen._beingMated = true;
                            r.x = _hen.x - _hen.direction * 17;
                            r.y = _hen.y + 16;
                            r.direction = _hen.direction;
                            r.mateTimer = state.activeChallenge === 'endless' ? 150 + chicksArr.length * 25 : 30;
                            r.action = 'mating';
                            r.mateAnimTimer = 1.885;
                            r._matingNext = 'roamAfterEat';
                            playSound(sfxRoosterMate, 0.3, 500);
                        } else {
                            r.velX = (_dx / _d) * 90; r.velY = (_dy / _d) * 90;
                        }
                    }
                }

                // ── Walk to sleep ─────────────────────────────────────────────
                else if (r.action === 'walkToSleep') {
                    const _dx = (r.targetX || r.x) - r.x, _dy = (r.targetY || r.y) - r.y;
                    const _d = Math.sqrt(_dx * _dx + _dy * _dy);
                    if (_d > 5) {
                        r.velX = (_dx / _d) * 45; r.velY = (_dy / _d) * 45;
                    } else {
                        r.x = r.targetX || r.x; r.y = r.targetY || r.y;
                        r.velX = 0; r.velY = 0;
                        r.direction = r.sleepDirection || (Math.random() < 0.5 ? 1 : -1);
                        r.action = 'sleeping';
                        r.sleepDuration = 90 + Math.random() * 60;
                        r.wakeTimer = 0;
                    }
                }

                r.x += r.velX * dt * speedMult;
                r.y += r.velY * dt * speedMult;
                if (r.x < 20) r.x = 20;
                if (r.x > canvas.width - 20) r.x = canvas.width - 20;
                if (r.y < 40) r.y = 40;
                if (r.y > MEADOW_LIMIT_Y) r.y = MEADOW_LIMIT_Y;
                resolveTroughCollision(r);
                if (Math.abs(r.velX) > 1) r.direction = r.velX >= 0 ? 1 : -1;
            });
        }
        _dbgPerfSample('roosterLogic', performance.now() - _tRoosterAI0);

        const _tChkLogic0 = performance.now();
        chickensArr.forEach(c => {
            if (c.squishTimer > 0) c.squishTimer -= dt;
            if (c.jumpTimer > 0) c.jumpTimer -= dt;

            if (c.action === 'flyIn') {
                const FLY_SPEED = 130;
                c.velX = c.direction * FLY_SPEED;
                c.velY = 0;
                c.x += c.velX * dt;
                // Y desciende linealmente según el progreso en X
                const totalDx = c.flyInTargetX - c.flyInStartX;
                const ratio = totalDx !== 0 ? Math.max(0, Math.min(1, (c.x - c.flyInStartX) / totalDx)) : 1;
                c.y = c.flyInStartY + (c.flyInTargetY - c.flyInStartY) * ratio;
                const arrived = c.direction > 0 ? c.x >= c.flyInTargetX : c.x <= c.flyInTargetX;
                if (arrived) {
                    c.x = c.flyInTargetX;
                    c.y = c.flyInTargetY;
                    c.squishTimer = 0.3;
                    const walkDist = 80 + Math.random() * 60;
                    c.roamTargetX = Math.max(40, Math.min(canvas.width - 40, c.flyInTargetX + c.direction * walkDist));
                    c.roamTargetY = c.flyInTargetY;
                    c.restTimer = 0;
                    c.action = 'roam';
                    if (c.chickenName && !window._suppressNameBubbles) c.nameBubbleTimer = 5.0;
                    playSound(sfxCok, 0.5, 50);
                }
            } else if (c.action === 'walkToSleep' || c.action === 'walkToGraveyard') {
                let dx = c.targetX - c.x;
                let dy = c.targetY - c.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 5) {
                    let speed = 60;
                    c.velX = (dx / dist) * speed;
                    c.velY = (dy / dist) * speed;
                    c.direction = c.velX >= 0 ? 1 : -1;
                    c.x += c.velX * dt;
                    c.y += c.velY * dt;
                } else {
                    c.x = c.targetX;
                    c.y = c.targetY;
                    c.velX = 0;
                    c.velY = 0;
                    if (c.action === 'walkToSleep') {
                        c.direction = c.sleepDirection || (Math.random() < 0.5 ? 1 : -1);
                        c.action = 'sleeping';
                        c.sleepInStep = 0;
                        c.sleepInTimer = 0.2;
                    } else {
                        c.action = 'sadFace';
                        c.giveUpTimer = 3;
                    }
                }
            } else if (c.action === 'sadFace') {
                c.giveUpTimer -= dt;
                if (c.giveUpTimer <= 0) {
                    c.action = 'sleeping';
                    c.giveUpTimer = 0;
                    c.sleepInStep = -1;
                }
            } else if (c.action === 'sleeping') {
                c.velX = 0; c.velY = 0;
                if ((c.wakeTimer || 0) > 0) {
                    c.wakeTimer -= dt;
                    if (c.wakeTimer <= 0) {
                        c.wakeTimer = 0;
                        const _next = c.wakeNextAction || c._wakeNext || 'roam';
                        delete c._wakeNext;
                        c.action = _next;
                        c.isGrey = false; c.isSad = false; c.giveUpTimer = 0;
                        c.sleepInStep = undefined;
                        c.hasFailedOnce = false; // reset so she gets angry again if still no food
                        c.angryTargetX = undefined;
                        playSound(sfxChickenWake, 0.4, 200);
                        if (_next === 'roam') {
                            c.foodTimer = state.activeChallenge === 'endless' ? 50 : 10;
                            c.roamTargetX = undefined;
                        }
                    }
                } else if ((c.sleepInStep || 0) >= 0 && c.sleepInStep !== undefined) {
                    c.sleepInTimer -= dt;
                    if (c.sleepInTimer <= 0) {
                        c.sleepInStep++;
                        if (c.sleepInStep < 3) {
                            c.sleepInTimer = 0.2;
                        } else {
                            c.sleepInStep = -1;
                        }
                    }
                }
            } else if (c.action === 'eating' || c.action === 'drinking') {
                c.eatTimer -= dt;
                c.velX = 0; c.velY = 0;
                c.direction = (c.action === 'eating') ? 1 : -1;
                c._eatPixTimer = (c._eatPixTimer || 0) + dt;
                if (c._eatPixTimer > 0.3) { c._eatPixTimer = 0; const _cDir = c.action === 'eating' ? 1 : -1; for (let _pi = 0; _pi < 3; _pi++) particlesArr.push({ x: c.x + _cDir*15 + (Math.random()-0.5)*4, y: c.y - 3, color: c.action === 'eating' ? '#f5c518' : '#5bc8f5', life: 0.5, velX: -_cDir*(Math.random()*25+8), velY: Math.random()*40+20, pixel: true, size: 3 }); }

                let batchMultiplier = _batchFoodMult();
                const _megaMult = _tierMult(c.mega);
                if (c.consumptionGoal === undefined) c.consumptionGoal = 5 * batchMultiplier * _megaMult;
                let drain = (5 * batchMultiplier * _megaMult) * (dt / 2.0);
                let resource = c.action === 'eating' ? state.food : state.water;
                let actualDrain = Math.min(drain, resource, c.consumptionGoal);

                if (c.action === 'eating' && !_ebFamilyActive('food')) state.food -= actualDrain;
                if (c.action === 'drinking' && !_ebFamilyActive('food')) state.water -= actualDrain;
                c.consumptionGoal -= actualDrain;

                if ((c.action === 'eating' && state.food <= 0) || (c.action === 'drinking' && state.water <= 0)) {
                    c.eatTimer = 0; // Force immediate leave on empty trough
                }

                if (c.eatTimer <= 0) {
                    if (c.consumptionGoal > 0.1) {
                        c.isGrey = true;
                        if (!c.hasFailedOnce) {
                            c.hasFailedOnce = true;
                            c.action = c.action === 'eating' ? 'failedFood' : 'failedWater';
                            c.failTimer = 3.0;
                            playSound(sfxChickenAngry, 0.5, 300);
                        } else {
                            if (!c.hasSuffered) {
                                c.hasSuffered = true;
                                state.chickensSuffered = (state.chickensSuffered || 0) + 1;
                            }
                            assignSleepTarget(c);
                        }
                    } else {
                        c.action = 'roam';
                        c.hasFailedOnce = false;
                        delete c.consumptionGoal;
                        c.restTimer = 1.0;
                    }
                    delete c.roamTargetX;
                }
            } else if (c.action === 'roam' || c.action === 'failedFood' || c.action === 'failedWater') {
                if (c.roamTargetX === undefined) {
                    c.roamTargetX = c.x; c.roamTargetY = c.y;
                    if (c.restTimer === undefined || c.restTimer <= 0) c.restTimer = 1 + Math.random() * 2;
                }
                let dx = c.roamTargetX - c.x;
                let dy = c.roamTargetY - c.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 5) {
                    let speed = 30;
                    c.velX = (dx / dist) * speed; c.velY = (dy / dist) * speed;
                    c.direction = c.velX >= 0 ? 1 : -1;
                } else {
                    c.velX = 0; c.velY = 0;
                    c.restTimer = (c.restTimer || 0) - dt;
                    if (c.restTimer <= 0) {
                        const _rtX1 = state.hasRetired ? (window.CINEMATIC_CHICKEN_X1 ?? 20) : 80;
                        const _rtX2 = state.hasRetired ? canvas.width - (window.CINEMATIC_CHICKEN_X2_MARGIN ?? 20) : canvas.width - 80;
                        const _rtY1 = state.hasRetired ? (window.CINEMATIC_CHICKEN_Y1 ?? 40) : 70;
                        const _rtY2 = state.hasRetired ? MEADOW_LIMIT_Y - (window.CINEMATIC_CHICKEN_Y2_OFFSET ?? 0) : MEADOW_LIMIT_Y - 50;
                        c.roamTargetX = _rtX1 + Math.random() * Math.max(0, _rtX2 - _rtX1);
                        c.roamTargetY = _rtY1 + Math.random() * Math.max(0, _rtY2 - _rtY1);
                        c.restTimer = 2 + Math.random() * 5;
                    }
                }

                if (c.layEggPhase || c.postLayTimer > 0) { c.velX = 0; c.velY = 0; }
                if (c.postLayTimer > 0) c.postLayTimer -= dt;
                c.x += c.velX * dt * speedMult;
                c.y += c.velY * dt * speedMult;
                {
                    const _cinematic = state.hasRetired;
                    const _bx1 = _cinematic ? (window.CINEMATIC_CHICKEN_X1 ?? 20) : 20;
                    const _bx2 = _cinematic ? canvas.width - (window.CINEMATIC_CHICKEN_X2_MARGIN ?? 20) : canvas.width - 20;
                    const _by1 = _cinematic ? (window.CINEMATIC_CHICKEN_Y1 ?? 40) : 40;
                    const _by2 = _cinematic ? MEADOW_LIMIT_Y - (window.CINEMATIC_CHICKEN_Y2_OFFSET ?? 0) : MEADOW_LIMIT_Y;
                    if (c.x < _bx1) c.x = _bx1;
                    if (c.x > _bx2) c.x = _bx2;
                    if (c.y < _by1) c.y = _by1;
                    if (c.y > _by2) c.y = _by2;
                }

                resolveTroughCollision(c);

                if (c.action === 'roam') {
                    if (c.layEggPhase === 'effort') {
                        c.layEggTimer -= dt;
                        if (c.layEggTimer <= 0) {
                            c.layEggCyclesLeft = (c.layEggCyclesLeft || 1) - 1;
                            if (c.layEggCyclesLeft > 0) {
                                c.layEggTimer = 0.4;
                            } else {
                                c.layEggPhase = 'release';
                                c.layEggTimer = 0.4;
                                c.layEggEggDone = false;
                            }
                        }
                    } else if (c.layEggPhase === 'release') {
                        c.layEggTimer -= dt;
                        if (!c.layEggEggDone) {
                            c.layEggEggDone = true;
                            layEgg(c.x, c.y, c.direction, c.mega || false);
                            c.squishTimer = 0.2;
                            c.eggTimer = _eggBaseTime();
                            c.eggCount++;
                            let eggCap = _batchEggCap();
                            if (c.eggCount >= eggCap) {
                                c.layEggPhase = null;
                                c.layEggTimer = 0;
                                c.postLayTimer = 0.2;
                                c.action = c.nextTrough;
                                c.nextTrough = (c.nextTrough === 'goToFood') ? 'goToWater' : 'goToFood';
                                playRandomCok();
                            }
                        }
                        if (c.layEggPhase === 'release' && c.layEggTimer <= 0) {
                            c.layEggPhase = null;
                            c.layEggTimer = 0;
                            c.postLayTimer = 0.2;
                        }
                    } else {
                        const _eggSpeed = state.activeChallenge === 'endless' ? speedMult : 1;
                        c.eggTimer -= dt * _eggSpeed * (1 + _ebGetBonus('laySpeed'));
                        if (c.eggTimer <= 0) {
                            c.layEggPhase = 'effort';
                            c.layEggCyclesLeft = 2 + Math.floor(Math.random() * 7);
                            c.layEggTimer = 0.4;
                            c.velX = 0;
                            c.velY = 0;
                        }
                    }
                } else {
                    c.failTimer -= dt;

                    // Nervous jumping and sprinting while angry
                    if (c.angryTargetX === undefined || (Math.abs(c.x - c.angryTargetX) < 10 && Math.abs(c.y - c.angryTargetY) < 10)) {
                        c.angryTargetX = c.x + (Math.random() - 0.5) * 150;
                        c.angryTargetY = c.y + (Math.random() - 0.5) * 150;
                        c.angryTargetX = Math.max(100, Math.min(canvas.width - 100, c.angryTargetX));
                        c.angryTargetY = Math.max(40, Math.min(MEADOW_LIMIT_Y, c.angryTargetY));

                        if (Math.random() > 0.2) {
                            c.jumpTimer = 0.4;
                            if (Math.random() > 0.5) playRandomCok();
                        }
                    }

                    let dx = c.angryTargetX - c.x;
                    let dy = c.angryTargetY - c.y;
                    let dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 5) {
                        let speed = 100;
                        c.velX = (dx / dist) * speed;
                        c.velY = (dy / dist) * speed;
                        c.direction = c.velX >= 0 ? 1 : -1;
                        c.x += c.velX * dt * speedMult;
                        c.y += c.velY * dt * speedMult;
                    }

                    if (c.failTimer <= 0) {
                        c.action = c.action === 'failedFood' ? 'goToFood' : 'goToWater';
                        c.angryTargetX = undefined;
                        playRandomCok();
                    }
                }
            } else if (c.action === 'goToFood' || c.action === 'goToWater') {
                if (c.troughY === undefined) {
                    let hBase = (c.action === 'goToFood') ? _troughH(state.maxFood, state.maxFoodLevel || 0) : _troughH(state.maxWater, state.maxWaterLevel || 0);
                    let yBase = window.LAYOUT.TROUGH_CENTER_Y - hBase / 2;
                    c.troughY = yBase + 10 + Math.random() * Math.max(0, hBase - 20);
                }
                let targetX = c.action === 'goToFood' ? window.LAYOUT.TROUGH_FOOD_TARGET_X : window.LAYOUT.TROUGH_WATER_TARGET_X;
                let targetY = c.troughY;

                let dx = targetX - c.x;
                let dy = targetY - c.y;
                let dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > 25) {
                    let speed = c.isGrey ? 100 : 60; // Run if angry
                    c.velX = (dx / dist) * speed;
                    c.velY = (dy / dist) * speed;
                    c.direction = c.velX >= 0 ? 1 : -1;
                    c.x += c.velX * dt * speedMult;
                    c.y += c.velY * dt * speedMult;

                    resolveTroughCollision(c);


                } else {
                    delete c.troughY;
                    if (c.action === 'goToFood') {
                        if (state.food > 0 || !c.hasFailedOnce) {
                            c.action = 'eating';
                            c.eatTimer = 2.0;
                            let batchMultiplier = _batchFoodMult();
                            if (c.consumptionGoal === undefined) c.consumptionGoal = 5 * batchMultiplier * _tierMult(c.mega);
                            c.isGrey = false;
                            c.eggCount = 0;
                        } else {
                            assignSleepTarget(c);
                        }
                    } else if (c.action === 'goToWater') {
                        if (state.water > 0 || !c.hasFailedOnce) {
                            c.action = 'drinking';
                            c.eatTimer = 2.0;
                            let batchMultiplier = _batchFoodMult();
                            if (c.consumptionGoal === undefined) c.consumptionGoal = 5 * batchMultiplier * _tierMult(c.mega);
                            c.isGrey = false;
                            c.eggCount = 0;
                        } else {
                            assignSleepTarget(c);
                        }
                    }
                }
            }
            if (Math.abs(c.velX) > 1) {
                c.direction = c.velX >= 0 ? 1 : -1;
            }
            if (state.hasRetired) {
                const _bx1 = window.CINEMATIC_CHICKEN_X1 ?? 20;
                const _bx2 = canvas.width - (window.CINEMATIC_CHICKEN_X2_MARGIN ?? 20);
                const _by1 = window.CINEMATIC_CHICKEN_Y1 ?? 40;
                const _by2 = MEADOW_LIMIT_Y - (window.CINEMATIC_CHICKEN_Y2_OFFSET ?? 0);
                if (c.x < _bx1) c.x = _bx1;
                if (c.x > _bx2) c.x = _bx2;
                if (c.y < _by1) c.y = _by1;
                if (c.y > _by2) c.y = _by2;
                if (c.roamTargetX !== undefined) {
                    c.roamTargetX = Math.max(_bx1, Math.min(_bx2, c.roamTargetX));
                    c.roamTargetY = Math.max(_by1, Math.min(_by2, c.roamTargetY));
                }
            }
        });
        _dbgPerfSample('chickenLogic', performance.now() - _tChkLogic0);

        const _tDeadFilter0 = performance.now();
        let newChickens = [];
        let chickensDied = false;
        chickensArr.forEach(c => {
            if (c.dead) {
                if (c.nameBubbleEl instanceof Element) c.nameBubbleEl.remove();
                if (c.hintBubbleEl instanceof Element) c.hintBubbleEl.remove();
                state.chickens--;
                state.deadChickens = (state.deadChickens || 0) + 1;
                if (c.mega === 5) state.chickenPurples = Math.max(0, (state.chickenPurples || 0) - 1);
                else if (c.mega === 4) state.chickenGreens = Math.max(0, (state.chickenGreens || 0) - 1);
                else if (c.mega === 3) state.chickenGolds = Math.max(0, (state.chickenGolds || 0) - 1);
                else if (c.mega === 2) state.gallinaPros = Math.max(0, (state.gallinaPros || 0) - 1);
                else if (c.mega === 1) state.megaChickens = Math.max(0, (state.megaChickens || 0) - 1);
                let t = { x: c.x, y: c.y, hp: 5, shakeTimer: 0, spawnTime: Date.now() };
                tombstonesArr.push(t);
                chickensDied = true;
            } else {
                newChickens.push(c);
            }
        });
        chickensArr = newChickens;

        if (chickensDied) {
            updateUI();
            saveState();
        }
        _dbgPerfSample('deadFilter', performance.now() - _tDeadFilter0);

        const _tDrag0 = performance.now();
        if (isDragging) {
            let grabRadius = 30 + (state.magnetLevel || 0) * 5;
            let maxGrab = (state.magnetLevel || 0) + 1 + Math.round(_ebGetBonus('magnet'));

            if (state.activeChallenge === 'manual') {
                grabRadius = Math.min(100, 30 + (state.magnetLevel || 0) * 6);
                const manualCaps = [1, 2, 4, 6, 8, 10, 15, 20, 30, 50, 75, 100, 150];
                maxGrab = manualCaps[state.magnetLevel || 0] || 150;
            }

            const _hasShelfEgg = draggedEggs.some(e => e._fromShelf);

            // Pull eggs from sorter shelves into drag group (locked to one type)
            if (state.hasSorter && draggedEggs.length < maxGrab) {
                if (!state.sorterPremBasket) state.sorterPremBasket = [];
                if (!state.sorterGoldBasket) state.sorterGoldBasket = [];
                const _cy = UNDERGROUND_CEILING_Y;
                // Determine locked type from existing shelf eggs in drag
                const _lockedType = draggedEggs.filter(e => e._fromShelf)[0]?.type || null;
                // If no lock yet, find closest egg across both shelves to determine type
                let _allowPrem = !_lockedType || _lockedType === 'premium';
                let _allowGold = !_lockedType || _lockedType === 'golden';
                if (!_lockedType && state.sorterPremBasket.length && state.sorterGoldBasket.length) {
                    // compare closest prem egg vs closest gold egg
                    const _pex = 92 + (state.sorterPremBasket.length - 1) * 14 + 16, _pey = _cy + 31;
                    const _gex = 92 + (state.sorterGoldBasket.length - 1) * 14 + 16, _gey = _cy + 67;
                    const _pd = (_pex - mouseX) * (_pex - mouseX) + (_pey - mouseY) * (_pey - mouseY);
                    const _gd = (_gex - mouseX) * (_gex - mouseX) + (_gey - mouseY) * (_gey - mouseY);
                    if (_pd <= _gd) _allowGold = false; else _allowPrem = false;
                }
                if (_allowPrem) {
                    for (let i = state.sorterPremBasket.length - 1; i >= 0; i--) {
                        if (draggedEggs.length >= maxGrab) break;
                        const _ex = 92 + i * 14 + 16, _ey = _cy + 31;
                        const _dx = mouseX - _ex, _dy = mouseY - _ey;
                        if (_dx * _dx + _dy * _dy < grabRadius * grabRadius) {
                            const _se = state.sorterPremBasket.splice(i, 1)[0];
                            const _newEgg = { x: _ex, y: _ey, velX: 0, velY: 0, type: _se.type, value: _se.value, washed: _se.washed, stamped: _se.stamped, collected: false, hasHitGround: false, isBeingDragged: true, wasManuallyDragged: true, _fromShelf: true, _orbitAngle: Math.atan2(_ey - mouseY, _ex - mouseX) };
                            eggsArr.push(_newEgg); draggedEggs.push(_newEgg);
                        }
                    }
                }
                if (_allowGold) {
                    for (let i = state.sorterGoldBasket.length - 1; i >= 0; i--) {
                        if (draggedEggs.length >= maxGrab) break;
                        const _ex = 92 + i * 14 + 16, _ey = _cy + 67;
                        const _dx = mouseX - _ex, _dy = mouseY - _ey;
                        if (_dx * _dx + _dy * _dy < grabRadius * grabRadius) {
                            const _se = state.sorterGoldBasket.splice(i, 1)[0];
                            const _newEgg = { x: _ex, y: _ey, velX: 0, velY: 0, type: _se.type, value: _se.value, washed: _se.washed, stamped: _se.stamped, collected: false, hasHitGround: false, isBeingDragged: true, wasManuallyDragged: true, _fromShelf: true, _orbitAngle: Math.atan2(_ey - mouseY, _ex - mouseX) };
                            eggsArr.push(_newEgg); draggedEggs.push(_newEgg);
                        }
                    }
                }
            }

            // Only grab eggsArr eggs if not currently holding shelf eggs
            // El imán no recoge hueveras (package) ni cajas premium (box)
            if (!_hasShelfEgg) eggsArr.forEach(egg => {
                if (!egg.collected && !egg.sold && !egg.isBeingDragged && draggedEggs.length < maxGrab
                        && egg.type !== 'package' && egg.type !== 'box') {
                    let dx = mouseX - egg.x;
                    let dy = mouseY - egg.y;
                    if (dx * dx + dy * dy < grabRadius * grabRadius) {
                        const _crossesBoundary = (mouseY >= UNDERGROUND_CEILING_Y) !== (egg.y >= UNDERGROUND_CEILING_Y);
                        if (_crossesBoundary && mouseX > 80) return;
                        egg.isBeingDragged = true;
                        egg.wasManuallyDragged = true;
                        egg._orbitAngle = Math.atan2(egg.y - mouseY, egg.x - mouseX);
                        draggedEggs.push(egg);
                    }
                }
            });

            if (_boxEjectAnim > 0) _boxEjectAnim = Math.max(0, _boxEjectAnim - dt * 2.5);

            const _hasMagnet = (state.magnetLevel || 0) > 0;
            if (_hasMagnet && draggedEggs.length > 0) {
                _vortexAngle += 3.5 * dt;
                const _total = draggedEggs.length;
                const _r = 9 + Math.min(_total, 8);
                const _step = (Math.PI * 2) / _total;
                draggedEggs.forEach((egg, idx) => {
                    const angle = _vortexAngle + idx * _step;
                    const tx = mouseX + Math.cos(angle) * _r;
                    let ty = mouseY + 8 + Math.sin(angle) * _r;
                    if (egg.y <= EGG_LIMIT_Y && ty > EGG_LIMIT_Y && tx > 80) ty = EGG_LIMIT_Y;
                    if (egg.y >= UNDERGROUND_CEILING_Y && ty < UNDERGROUND_CEILING_Y && tx > 80) ty = UNDERGROUND_CEILING_Y;
                    if (window.GAME_MODE !== 'portrait' && egg.y > EGG_LIMIT_Y && egg.y < UNDERGROUND_CEILING_Y && tx > 80) {
                        ty = (egg.y - EGG_LIMIT_Y < UNDERGROUND_CEILING_Y - egg.y) ? EGG_LIMIT_Y : UNDERGROUND_CEILING_Y;
                    }
                    egg.x += (tx - egg.x) * 20 * dt;
                    egg.y += (ty - egg.y) * 20 * dt;
                    egg.velX = 0;
                    egg.velY = 0;
                });
            }

            draggedEggs.forEach((egg, idx) => {
                let tx, ty;
                let prevY = egg.y;
                let prevX = egg.x;

                if (!_hasMagnet) {
                    let offsetR = (draggedEggs.length > 1) ? 1 : 0;
                    tx = mouseX + Math.sin(idx * 7.1) * 6 * offsetR;
                    ty = mouseY + Math.cos(idx * 3.3) * 6 * offsetR;
                    egg.x += (tx - egg.x) * 15 * dt;
                    egg.y += (ty - egg.y) * 15 * dt;
                    egg.velX = 0;
                    egg.velY = 0;
                }

                // prevX/prevY needed for boundary checks below
                // egg.angle = 0; // Removed so they keep their rotation naturally

                if (egg.x < 5) egg.x = 5;
                if (egg.x > canvas.width - 5) egg.x = canvas.width - 5;
                if (egg.y < 5) egg.y = 5;

                // X-Boundary of the vertical hole wall
                if (egg.y > EGG_LIMIT_Y && egg.y < UNDERGROUND_CEILING_Y) {
                    if (egg.x > window.LAYOUT.HOLE_LEFT_X && prevX <= window.LAYOUT.HOLE_LEFT_X) {
                        egg.x = window.LAYOUT.HOLE_LEFT_X;
                    }
                }

                let inLeftHole = (egg.x <= window.LAYOUT.HOLE_LEFT_X);

                // Y-Boundaries of solid floors
                if (!inLeftHole) {
                    if (prevY <= EGG_LIMIT_Y && egg.y > EGG_LIMIT_Y) {
                        egg.y = EGG_LIMIT_Y;
                    } else if (prevY >= UNDERGROUND_CEILING_Y && egg.y < UNDERGROUND_CEILING_Y) {
                        egg.y = UNDERGROUND_CEILING_Y;
                    } else if (egg.y > EGG_LIMIT_Y && egg.y < UNDERGROUND_CEILING_Y) {
                        egg.y = (egg.y - EGG_LIMIT_Y < UNDERGROUND_CEILING_Y - egg.y) ? EGG_LIMIT_Y : UNDERGROUND_CEILING_Y;
                    }
                }

                const _dragEggHalfW = window.GAME_MODE === 'portrait' ? 12 : 8;
                let inRightHole = (egg.x + _dragEggHalfW >= canvas.width - window.LAYOUT.HOLE_RIGHT_MARGIN + (window.LAYOUT.HOLE_RIGHT_TRIGGER_OFFSET || 0) && egg.y >= UNDERGROUND_CEILING_Y);
                const _goUnderground = (window.GAME_MODE === 'portrait' && mouseY >= EGG_LIMIT_Y)
                    || egg.y >= UNDERGROUND_CEILING_Y
                    || inLeftHole;
                let targetY = _goUnderground ? UNDERGROUND_FLOOR_Y : (window.GAME_MODE === 'portrait' ? UNDERGROUND_CEILING_Y : EGG_LIMIT_Y);
                if (inRightHole) targetY = canvas.height + 50;
                if (egg.y > targetY) egg.y = targetY;

                // Machine processing while dragging (washer + stamper)
                if (egg.y >= UNDERGROUND_FLOOR_Y - 100 && egg.y <= UNDERGROUND_FLOOR_Y) {
                    if (state.hasWasher && egg.type !== 'package' && !egg.washed && egg.x >= window.LAYOUT.WASHER_X1 && egg.x <= window.LAYOUT.WASHER_X2) {
                        egg.washed = true;
                        egg.washedAt = Date.now();
                        egg.value = state.activeChallenge === 'endless'
                            ? egg.value * (1 + 0.12 * (state.washerLevel || 1))
                            : Math.floor(egg.value * 2);
                    }
                    if (state.hasStamper && egg.type !== 'package' && !egg.stamped && egg.x >= window.LAYOUT.STAMPER_X1 && egg.x <= window.LAYOUT.STAMPER_X2) {
                        egg.stamped = true;
                        egg.value = egg.value * (state.activeChallenge === 'endless' ? (1 + 0.14 * (state.stamperLevel || 1)) : 2);
                        window.lastStampActTime = Date.now();
                    }
                }
            });

            // Drop eggs if stuck; auto-sell if carried to market
            let newDragged = [];
            draggedEggs.forEach(egg => {
                // !egg.sold evita doble cobro: si la cinta ya registró la venta (e.sold=true)
                // antes de que el jugador soltara el huevo manualmente en el hueco,
                // collectEgg NO se llama una segunda vez.
                if (!egg.collected && !egg.sold && egg.x >= canvas.width - window.LAYOUT.HOLE_RIGHT_MARGIN && egg.y > UNDERGROUND_FLOOR_Y + 10) {
                    egg.isBeingDragged = false;
                    collectEgg(egg);
                    return;
                }
                let dx = mouseX - egg.x;
                let dy = mouseY - egg.y;
                if (dx * dx + dy * dy > 450 * 450) {
                    egg.isBeingDragged = false;
                } else {
                    newDragged.push(egg);
                }
            });
            draggedEggs = newDragged;
        }
        _dbgPerfSample('dragMagnet', performance.now() - _tDrag0);

        // Box physics — full egg-like simulation
        const _tBoxPhys0 = performance.now();
        if (state.hasBox && !_boxDragging) {
            const _boxCenterX = state.boxX + BOX_W / 2;
            const _bInLeftHole = _boxCenterX <= window.LAYOUT.HOLE_LEFT_X;
            const _bInRightHole = state.boxX + BOX_W >= canvas.width - window.LAYOUT.HOLE_RIGHT_MARGIN + (window.LAYOUT.HOLE_RIGHT_TRIGGER_OFFSET || 0) && state.boxY + BOX_H >= UNDERGROUND_CEILING_Y;

            let _boxTargetY;
            if (_bInRightHole) {
                _boxTargetY = canvas.height + 50;
            } else if (_bInLeftHole || state.boxY + BOX_H > EGG_GROUND_Y + 10) {
                _boxTargetY = UNDERGROUND_FLOOR_Y - BOX_H;
            } else {
                _boxTargetY = EGG_GROUND_Y - BOX_H;
            }

            // Gravity
            state.boxVelY += 2500 * dt;

            // Belt push (mirrors egg belt logic)
            const _bOnSurface = Math.abs(state.boxY - (EGG_GROUND_Y - BOX_H)) < 4 && !_bInLeftHole;
            const _bOnUnderGround = Math.abs(state.boxY - (UNDERGROUND_FLOOR_Y - BOX_H)) < 4;
            if (_bOnSurface && state.autoCollectLevel > 0) {
                state.boxVelX -= 600 * _beltSpeed(state.autoCollectLevel) * dt;
            } else if (_bOnUnderGround && state.autoSellLevel > 0 && !_bInRightHole) {
                state.boxVelX += 600 * _beltSpeed(state.autoSellLevel) * dt;
            }

            const _prevBX = state.boxX, _prevBY = state.boxY;
            state.boxX += state.boxVelX * dt;
            state.boxY += state.boxVelY * dt;

            // Canvas wall bounces
            if (state.boxX < 0) { state.boxX = 0; state.boxVelX = Math.abs(state.boxVelX) * 0.3; }
            if (state.boxX + BOX_W > canvas.width) { state.boxX = canvas.width - BOX_W; state.boxVelX = -Math.abs(state.boxVelX) * 0.3; }
            if (state.boxY < 5) { state.boxY = 5; if (state.boxVelY < 0) state.boxVelY = 0; }

            // Underground ceiling collision (box bounces off factory ceiling)
            if (state.boxY + BOX_H > EGG_GROUND_Y + 10 && state.boxY < UNDERGROUND_CEILING_Y && state.boxVelY < 0) {
                state.boxY = UNDERGROUND_CEILING_Y;
                state.boxVelY *= -0.3;
            }

            // Shelf collision — box lands and rests on the elevated shelf
            const _overShelf = state.boxX + BOX_W > BOX_SHELF_X + 2 && state.boxX < BOX_SHELF_X + BOX_SHELF_W - 2;
            if (_overShelf && state.boxY + BOX_H >= BOX_SHELF_TOP && state.boxY + BOX_H < BOX_SHELF_TOP + 60 && state.boxVelY >= 0) {
                state.boxY = BOX_SHELF_TOP - BOX_H;
                state.boxVelY = 0;
                state.boxVelX *= Math.pow(0.01, dt);
            }

            // Floor clamp + friction
            if (state.boxY >= _boxTargetY) {
                state.boxY = _boxTargetY;
                state.boxVelY = 0;
                state.boxVelX *= Math.pow(0.01, dt);
            } else {
                state.boxVelX *= Math.pow(0.5, dt);
            }

            // Velocity limits
            state.boxVelX = Math.max(-1000, Math.min(1000, state.boxVelX));
            state.boxVelY = Math.max(-1500, Math.min(1500, state.boxVelY));

            // Sell eggs when box physically touches the market (right edge, at factory floor)
            if (state.boxX + BOX_W >= canvas.width - window.LAYOUT.MARKET_MARGIN && state.boxY >= UNDERGROUND_FLOOR_Y - BOX_H - 4) {
                const _cartonEggs = state.boxEggs || [];
                const _cartonFull = _cartonEggs.length >= CARTON_COLS * CARTON_ROWS;
                const _allPrem = _cartonFull && _cartonEggs.every(e => e.type === 'premium');
                const _allGold = _cartonFull && _cartonEggs.every(e => e.type === 'golden');
                const _sortBonusActive = state.hasSorter && (state.sortBonusLevel || 0) > 0 && (_allPrem || _allGold);
                const _sbMult = _sortBonusActive ? 1 + (state.sortBonusLevel || 0) * 0.25 : 1;
                let _boxBase = 0, _boxTotal = 0;
                _cartonEggs.forEach(egg => {
                    let _v = state.hasTvAd ? egg.value * (state.activeChallenge === 'endless' ? (1 + (state.tvAdLevel || 1) * 0.20) : 2) : egg.value;
                    if ((state._offerEggDouble || 0) > 0) _v *= 2;
                    _boxBase += _v;
                    _v *= _sbMult;
                    _boxTotal += _v;
                    state.money += _v;
                    state.eggsSold++;
                });
                if (_boxTotal > 0) {
                    _totalMoneyEarned += _boxTotal;
                    state.totalEarnings = (state.totalEarnings || 0) + _boxTotal;
                    playSound(sfxMoney, 0.4, 100);
                    const _particleTxt = '+' + getCurrencySym() + fmtMoney(_boxTotal);
                    const _boxHasGold = _cartonEggs.some(e => e.type === 'golden');
                    const _boxHasPrem = !_boxHasGold && _cartonEggs.some(e => e.type === 'premium');
                    const _boxColor = _boxHasGold ? '#ffd700' : _boxHasPrem ? '#6bb8ff' : '#90ee90';
                    particlesArr.push({ x: window.LAYOUT.SELL_POPUP_X, y: window.LAYOUT.SELL_POPUP_Y, text: _particleTxt, life: 1.5, color: _boxColor, rightAlign: true });
                    updateUI();
                    saveState();
                    _ejectBoxFromDispenser();
                }
            }

            // Respawn from dispenser if box fell off-screen
            if (state.boxY > canvas.height) {
                _ejectBoxFromDispenser();
                saveState();
            }
        }
        _dbgPerfSample('boxPhysics', performance.now() - _tBoxPhys0);

        // Carton washer / stamper — runs whether dragging or not
        const _tMachineAnim0 = performance.now();
        if (state.hasBox && (state.boxEggs || []).length > 0) {
            const _bcx = state.boxX + BOX_W / 2;
            const _bcy = state.boxY + BOX_H / 2;
            if (_bcy > UNDERGROUND_CEILING_Y) {
                if (state.hasWasher && _bcx >= window.LAYOUT.WASHER_X1 && _bcx <= window.LAYOUT.WASHER_X2) {
                    let _washed = false;
                    state.boxEggs.forEach(egg => {
                        if (!egg.washed) {
                            egg.washed = true;
                            egg.value = state.activeChallenge === 'endless'
                                ? egg.value * (1 + 0.12 * (state.washerLevel || 1))
                                : Math.floor(egg.value * 2);
                            _washed = true;
                        }
                    });
                    if (_washed) playSound(sfxEgg, 0.1, 20);
                }
                if (state.hasStamper && _bcx >= window.LAYOUT.STAMPER_X1 && _bcx <= window.LAYOUT.STAMPER_CARTON_X2) {
                    let _stamped = false;
                    state.boxEggs.forEach(egg => {
                        if (!egg.stamped) {
                            egg.stamped = true;
                            egg.value = egg.value * (state.activeChallenge === 'endless' ? (1 + 0.14 * (state.stamperLevel || 1)) : 2);
                            _stamped = true;
                        }
                    });
                    if (_stamped) { playSound(sfxEgg, 0.1, 20); window.lastStampActTime = Date.now(); }
                }
            }
        }

        // Batch stamp: un golpe de selladora cada 300ms (duración de la animación)
        // para que la animación sea visible. Los huevos en zona durante el cooldown
        // quedan marcados y se sellan en el siguiente golpe.
        const _stamperNow = Date.now();
        const _stamperBatchReady = state.hasStamper &&
            (!window._stamperNextAllowed || _stamperNow >= window._stamperNextAllowed);
        let _stamperBatchFired = false;
        // updateUI() es cara (toca mucho DOM) — antes se llamaba una vez POR HUEVO
        // vendido dentro del propio bucle. Con muchos huevos vendiéndose el mismo
        // frame (ej. 50 en Egg Jam) eso eran 50 llamadas seguidas y se notaba mucho
        // en FPS. Ahora solo se marca aquí y se llama una única vez después del bucle.
        let _anySoldThisFrame = false;

        eggsArr.forEach(e => {
            if (!e.collected && !e.isBeingDragged) {
                let inLeftHole = (e.x <= window.LAYOUT.HOLE_LEFT_X);
                const _eggHalfW = window.GAME_MODE === 'portrait' ? 12 : 8;
                // inRightHole = ha entrado en el agujero (borde superior de la cinta de
                // venta) — esto solo quita el suelo de tope de abajo (targetY =
                // canvas.height+50 más abajo) para que el huevo pueda seguir cayendo
                // A TRAVÉS del agujero, en vez de pararse en él.
                const _beltH = 16 * Math.max(0.01, window.LAYOUT.BELT_SCALE || 2.0);
                let inRightHole = (e.x + _eggHalfW >= canvas.width - window.LAYOUT.HOLE_RIGHT_MARGIN + (window.LAYOUT.HOLE_RIGHT_TRIGGER_OFFSET || 0) && e.y >= UNDERGROUND_FLOOR_Y - _beltH);

                // La VENTA en sí se dispara aparte, más abajo del agujero (no nada más
                // entrar en él) — así se ve caer de verdad por el hueco antes de
                // desaparecer, en vez de esfumarse de golpe según entra. Pedido
                // explícito: "tiene que haber un agujero donde caen y debajo de ese
                // agujero el colisionador de venta, no arriba".
                //
                // Vende y desaparece en el mismo frame en que cruza ese punto más
                // profundo (antes se dejaba caer ~1s con sold=true pero collected=false,
                // ventana en la que el imán o el arrastre manual podían volver a
                // cogerlo — se quedaba "vendido" pero seguía existiendo y arrastrable
                // para siempre).
                if (inRightHole && e.y >= UNDERGROUND_FLOOR_Y + _beltH && !e.sold) {
                    e.sold = true;
                    e.collected = true;
                    if (e.wasManuallyDragged) state.manualEggsMovedToMarket = (state.manualEggsMovedToMarket || 0) + 1;
                    playSound(sfxMoney, 0.3, 100);
                    let finalValue = state.hasTvAd ? e.value * (state.activeChallenge === 'endless' ? (1 + (state.tvAdLevel || 1) * 0.20) : 2) : e.value;
                    if ((state._offerEggDouble || 0) > 0) finalValue *= 2;
                    const _ebVal = _ebGetBonus('eggValue');
                    if (_ebVal > 0) finalValue *= (1 + _ebVal);
                    state.money += finalValue;
                    _totalMoneyEarned += finalValue;
                    state.totalEarnings = (state.totalEarnings || 0) + finalValue;
                    // Una "huevera" (type==='package') es UNA entidad en eggsArr que
                    // representa stackRealCount paquetes de 6 huevos reales cada uno
                    // (ver el empaquetador más abajo) — contarla como +1 al venderse
                    // deja "huevos vendidos" muy por debajo de la realidad. Pedido
                    // explícito tras detectar el mismo patrón que con las gallinas
                    // especiales (ver chickensWeighted): que cuente su valor real.
                    state.eggsSold += (e.type === 'package') ? (e.stackRealCount || 1) * 6 : 1;
                    const _eType = e.type || 'normal';
                    _saleAcc.total += finalValue;
                    if (_eType === 'golden') _saleAcc.golden += finalValue;
                    else if (_eType === 'premium') _saleAcc.premium += finalValue;
                    else if (e.mega) _saleAcc.mega += finalValue;
                    _anySoldThisFrame = true;
                }

                let targetY = EGG_LIMIT_Y;
                {
                    if (e.y > EGG_LIMIT_Y + 10 || inLeftHole) targetY = e.type === 'package' ? PACKAGE_FLOOR_Y : UNDERGROUND_EGG_FLOOR_Y;
                    if (inRightHole) targetY = canvas.height + 50;
                }
                e.floorY = targetY;

                // Apply Universal Gravity
                e.velY += 1200 * dt;

                // Belt physics
                if (e.y >= targetY - 5) {
                    if (targetY === EGG_LIMIT_Y && !inLeftHole && state.autoCollectLevel > 0) {
                        let speedFactor = _beltSpeed(state.autoCollectLevel);
                        if (e.x >= 80 && e.x <= canvas.width + 10) {
                            e.velX -= (600 * speedFactor) * dt;
                        }
                    } else if ((targetY === UNDERGROUND_EGG_FLOOR_Y || targetY === PACKAGE_FLOOR_Y) && state.autoSellLevel > 0 && !inRightHole) {
                        let speedFactor = _beltSpeed(state.autoSellLevel);
                        if (e.x >= 0 && e.x <= canvas.width - 70) {
                            e.velX += (600 * speedFactor) * dt;
                        }
                    }
                }

                e.x += e.velX * dt;
                e.y += e.velY * dt;

                // Wall Bounces — SIN FRICCIÓN a petición: antes cada rebote (pared L/R, techo,
                // techo del sótano) mataba el 70% de la velocidad (×-0.3). Ahora es elástico
                // (×-1, conserva toda la velocidad, solo invierte dirección) para ver si eso
                // era parte de por qué los huevos se veían a cámara lenta.
                {
                    if (e.x < 5) { e.x = 5; e.velX *= -1; }
                    if (e.x > canvas.width - 5) { e.x = canvas.width - 5; e.velX *= -1; }
                    if (e.y < 5) { e.y = 5; e.velY *= -1; }

                    if (e.y < UNDERGROUND_CEILING_Y && e.y > EGG_LIMIT_Y + 10 && !inLeftHole && e.velY < 0) {
                        e.y = UNDERGROUND_CEILING_Y;
                        e.velY *= -1;
                    }
                }

                // Egg Sorter — intercepts eggs just inside the underground left zone
                if (state.hasSorter && !e._sorted && e.velY > 0
                    && e.x >= 0 && e.x <= window.LAYOUT.SORTER_ENTRY_X
                    && e.y >= UNDERGROUND_CEILING_Y && e.y <= UNDERGROUND_CEILING_Y + 70) {
                    if (!state.sorterGoldBasket) state.sorterGoldBasket = [];
                    if (!state.sorterPremBasket) state.sorterPremBasket = [];
                    const _sSlots = state.sorterLevel || 1;
                    if (e.type === 'premium' && state.sorterPremBasket.length < _sSlots) {
                        state.sorterPremBasket.push({ type: e.type, value: e.value, washed: e.washed, stamped: e.stamped });
                        e.collected = true;
                        playSound(sfxEgg, 0.15, 20);
                    } else if (e.type === 'golden' && state.sorterGoldBasket.length < _sSlots) {
                        state.sorterGoldBasket.push({ type: e.type, value: e.value, washed: e.washed, stamped: e.stamped });
                        e.collected = true;
                        playSound(sfxEgg, 0.15, 20);
                    }
                    e._sorted = true;
                }

                if (state.hasBox && (state.boxY >= UNDERGROUND_CEILING_Y) === (e.y >= UNDERGROUND_CEILING_Y)) {
                    const _cX = state.boxX, _cY = state.boxY;
                    const _overCarton = e.x > _cX && e.x < _cX + BOX_W &&
                        e.y > _cY - 4 && e.y < _cY + BOX_H + 8;
                    if (_overCarton && e.velY > 8 && !document.hidden) {
                        if (!state.boxEggs) state.boxEggs = [];
                        if (state.boxEggs.length < CARTON_COLS * CARTON_ROWS) {
                            state.boxEggs.push({ type: e.type, value: e.value, washed: e.washed, stamped: e.stamped });
                            e.collected = true;
                            playSound(sfxEgg, 0.15, 20);
                        }
                    }
                }

                // Floor Clamp & Friction
                if (e.y >= targetY) {
                    if (e.velY > 50 && !e.hasHitGround) {
                        playSound(sfxEgg, 0.15, 20);
                        e.hasHitGround = true;
                    }
                    e.y = targetY;
                    // Velocity-proportional damping: fast impacts dead-stop, only soft taps micro-bounce
                    if (e.velY > 80) {
                        e.velY = 0;
                    } else if (e.velY > 10) {
                        e.velY *= -0.05;
                    } else {
                        e.velY = 0;
                    }
                    e.velX *= Math.pow(0.01, dt);
                } else {
                    e.velX *= Math.pow(0.5, dt);
                }

                // Limits
                e.velX = Math.max(-1000, Math.min(1000, e.velX));
                e.velY = Math.max(-1500, Math.min(1500, e.velY));

                if (e.type === 'package') {
                    e.angle = 0;
                } else {
                    const _now = Date.now();
                    if (!e._rotCheckTime) { e._rotCheckTime = _now; e._rotCheckY = e.y; e._rotLocked = false; e._rotGraceUntil = 0; }
                    if (_now - e._rotCheckTime >= 100) {
                        const _newLocked = Math.abs(e.y - e._rotCheckY) < 10;
                        if (_newLocked && !e._rotLocked) e._rotGraceUntil = _now + 500;
                        e._rotLocked = _newLocked;
                        e._rotCheckTime = _now;
                        e._rotCheckY = e.y;
                    }
                    if (!e._rotLocked || _now < e._rotGraceUntil) {
                        e.angularVel = e.velX / 8;
                        e.angle = (e.angle || 0) + e.angularVel * dt;
                    }
                }

                // Underground Machines processing
                if (e.y >= (e.type === 'package' ? PACKAGE_FLOOR_Y : UNDERGROUND_FLOOR_Y) - 100 && e.y <= (e.type === 'package' ? PACKAGE_FLOOR_Y : UNDERGROUND_EGG_FLOOR_Y)) {
                    if (state.hasWasher && e.type !== 'package' && !e.washed && e.x >= window.LAYOUT.WASHER_X1 && e.x <= window.LAYOUT.WASHER_X2) {
                        e.washed = true;
                        e.washedAt = Date.now();
                        e.value = state.activeChallenge === 'endless'
                            ? e.value * (1 + 0.12 * (state.washerLevel || 1))
                            : Math.floor(e.value * 2);
                    }

                    if (state.hasStamper && e.type !== 'package' && !e.stamped &&
                            e.x >= window.LAYOUT.STAMPER_X1 && e.x <= window.LAYOUT.STAMPER_X2) {
                        e._pendingStamp = true; // en zona de selladora
                    }
                    if (e._pendingStamp && _stamperBatchReady) {
                        e._pendingStamp = false;
                        e.stamped = true;
                        e.value = e.value * (1 + 0.14 * (state.stamperLevel || 1));
                        _stamperBatchFired = true;
                    }

                    if (state.hasRibbon && e.type === 'package' && !e.hasRibbon && e.x >= window.LAYOUT.RIBBON_X1 && e.x <= window.LAYOUT.RIBBON_X2) {
                        e.hasRibbon = true;
                        e.value = e.value * (state.activeChallenge === 'endless' ? (1 + 0.18 * (state.ribbonLevel || 1)) : 2);
                        window.lastRibbonActTime = Date.now();
                    }

                    if (e.y >= (e.type === 'package' ? PACKAGE_FLOOR_Y : UNDERGROUND_EGG_FLOOR_Y) - 15) {
                        if (state.hasPackager && e.type !== 'package' && e.x >= window.LAYOUT.PACKAGER_X1 && e.x <= window.LAYOUT.PACKAGER_X2) {
                            state.packageBuffer.push({
                                value: e.value,
                                type: e.type,
                                washed: e.washed,
                                stamped: e.stamped
                            });
                            window.lastPackageEggTime = Date.now();
                            e.collected = true;
                            // La creación de paquetes se gestiona fuera del bucle (batch con cooldown)
                        }
                    }
                }

                // Remove sold egg once it falls off canvas
                if (e.sold && e.y > canvas.height + 20) {
                    e.collected = true;
                }
            }
        });

        if (_anySoldThisFrame) updateUI();

        if (_stamperBatchFired) {
            window.lastStampActTime = _stamperNow;
            window._stamperNextAllowed = _stamperNow + 300;
            playSound(Math.random() < 0.5 ? sfxStamp1 : sfxStamp2, 0.1, 20);
        }

        // Empaquetadora: fill anim (400ms) → eject anim (750ms) → suelta cajas
        window.packageEjectQueue = window.packageEjectQueue || [];
        const _packNow = Date.now();
        const _packBuf = (state.packageBuffer || []).length;
        // Arranca la animación de llenado cuando el buffer llega a 6.
        // Si los huevos llegaron de uno en uno la animación de llenado ya se mostró frame a frame;
        // backdateamos el inicio para continuar desde el frame visual del 5º huevo (holdFrame=10).
        // Si llegaron en batch (wakes, etc.) reproducimos la animación completa desde 0.
        if (_packBuf >= 6 && !window._packagerBatchFillStart && !window._packagerEjectStart) {
            if (_packBuf === 6) {
                // Un huevo a la vez: el visual ya mostraba el frame del 5º huevo (holdFrame=10/12)
                window._packagerBatchFillStart = _packNow - Math.round((10 / 12) * 300);
            } else {
                window._packagerBatchFillStart = _packNow;
            }
        }
        // Cuando la animación de llenado termina (300ms), lanza el eject
        if (window._packagerBatchFillStart && !window._packagerEjectStart &&
                _packNow - window._packagerBatchFillStart >= 300) {
            window._packagerBatchFillStart = null;
            window._packagerEjectStart = _packNow;
            const _packCount = Math.floor(_packBuf / 6);
            for (let _pi = 0; _pi < _packCount; _pi++) {
                const _eggs6 = state.packageBuffer.slice(_pi * 6, (_pi + 1) * 6);
                const _totalVal = _eggs6.reduce((a, b) => a + (b.value || 0), 0);
                const _packVal = Math.floor(_totalVal * (state.activeChallenge === 'endless'
                    ? (1 + 0.16 * (state.packagerLevel || 1)) : 2));
                window.packageEjectQueue.push({ value: _packVal });
            }
            state.packageBuffer = state.packageBuffer.slice(_packCount * 6);
        }
        // Suelta las cajas cuando la animación de eject termina (400ms)
        if (window._packagerEjectStart && _packNow - window._packagerEjectStart >= 400) {
            window._packagerEjectStart = null;
            const _batchLen = window.packageEjectQueue.length;
            if (_batchLen > 0) {
                let _totalPackVal = 0;
                for (let _bi = 0; _bi < _batchLen; _bi++) _totalPackVal += window.packageEjectQueue[_bi].value;
                window.packageEjectQueue.splice(0, _batchLen);
                // Split 50/50 entre columnas, máx 5 visual cada una (10 total)
                const _col1Count = Math.min(Math.ceil(_batchLen / 2), 5);
                const _col2CountRaw = _batchLen - _col1Count;
                const _col2Count = Math.min(_col2CountRaw, 5);
                const _col1Val = _col2CountRaw > 0 ? Math.round(_totalPackVal * _col1Count / _batchLen) : _totalPackVal;
                const _col2Val = _totalPackVal - _col1Val;
                // Col1 (derecha): stackCount = visual (max 4), stackRealCount = paquetes reales de esta columna
                const _colSep = window.GAME_MODE === 'portrait' ? 65 : 42;
                eggsArr.push({
                    x: window.LAYOUT.PACKAGER_EJECT_X,
                    y: PACKAGE_FLOOR_Y,
                    type: 'package',
                    stackCount: _col1Count,
                    stackRealCount: _col1Count,
                    collected: false,
                    value: _col1Val,
                    isBeingDragged: false,
                    angle: 0,
                    velX: 60 + Math.random() * 60,
                    velY: 0,
                    washed: false
                });
                // Col2 (izquierda): stackRealCount puede ser > 4 si hay más de 8 paquetes en el batch
                if (_col2CountRaw > 0) {
                    eggsArr.push({
                        x: window.LAYOUT.PACKAGER_EJECT_X - _colSep,
                        y: PACKAGE_FLOOR_Y,
                        type: 'package',
                        stackCount: _col2Count,
                        stackRealCount: _col2CountRaw,
                        collected: false,
                        value: _col2Val,
                        isBeingDragged: false,
                        angle: 0,
                        velX: 55 + Math.random() * 60,
                        velY: 0,
                        washed: false
                    });
                }
            }
        }
        _dbgPerfSample('machineAnim', performance.now() - _tMachineAnim0);

        // Stable constraint solver via Sweep and Prune optimization
        const _tEggCol0 = performance.now();
        let activeEggs = eggsArr.filter(e => !e.collected && !e.isBeingDragged);
        for (let iter = 0; iter < 2; iter++) { // 2 iterations scale much better
            activeEggs.sort((a, b) => a.x - b.x);
            for (let i = 0; i < activeEggs.length; i++) {
                let e1 = activeEggs[i];
                for (let j = i + 1; j < activeEggs.length; j++) {
                    let e2 = activeEggs[j];

                    let dx = e2.x - e1.x;
                    if (dx > 14) break;

                    let dy = e2.y - e1.y;
                    if (Math.abs(dy) > 14) continue;

                    let isBox1 = (e1.type === 'package');
                    let isBox2 = (e2.type === 'package');

                    if (!isBox1 && !isBox2) {
                        // Hexágono SAT — 3 ejes: 30°, 90°, 150°
                        const HEX_R = 7, HEX_T = HEX_R * 1.732;
                        const p30 = dx * 0.866 + dy * 0.5;
                        const p90 = dy;
                        const p150 = -dx * 0.866 + dy * 0.5;
                        const pen30 = HEX_T - Math.abs(p30);
                        const pen90 = HEX_T - Math.abs(p90);
                        const pen150 = HEX_T - Math.abs(p150);

                        if (pen30 > 0 && pen90 > 0 && pen150 > 0) {
                            // Masa por tipo de huevo
                            const _em = e => e.type === 'golden' ? 1.8 : e.type === 'premium' ? 1.3 : 1.0;
                            const m1 = _em(e1), m2 = _em(e2);
                            const invM = 1 / m1 + 1 / m2;   // usada por el impulso de velocidad, más abajo

                            // Eje de mínima penetración → normal de colisión
                            let pen, nx, ny;
                            if (pen30 <= pen90 && pen30 <= pen150) {
                                const s = p30 >= 0 ? 1 : -1;
                                pen = pen30; nx = 0.866 * s; ny = 0.5 * s;
                            } else if (pen90 <= pen150) {
                                const s = p90 >= 0 ? 1 : -1;
                                pen = pen90; nx = 0; ny = s;
                            } else {
                                const s = p150 >= 0 ? 1 : -1;
                                pen = pen150; nx = -0.866 * s; ny = 0.5 * s;
                            }

                            // Corrección de posición — sin slop, factor moderado por iteración.
                            //
                            // BUG que esto arregla: un huevo APOYADO EN EL SUELO no tenía ninguna
                            // resistencia LATERAL frente a esta corrección posicional (la fricción
                            // de más abajo solo frena VELOCIDAD, no este empujón de posición). Con
                            // dos huevos en el suelo y uno tercero encima formando un triángulo, el
                            // de arriba empujaba a los de abajo un poco cada frame — sin nada que
                            // los devolviera — hasta que el hueco se abría lo bastante para que el
                            // de arriba se colara entre medias y los 3 acabaran en línea.
                            //
                            // Arreglo: a un huevo ya en el suelo se le da mucha más "masa lateral"
                            // (groundAnchor), así que apenas cede en X aunque el de arriba SIGA
                            // cediendo en Y con normalidad — el triángulo se sostiene en vez de
                            // abrirse.
                            const corr = pen * 0.5;   // sin slop, factor moderado por iteración
                            const groundAnchor = 6;   // cuánto más difícil es mover en X a un huevo ya en el suelo
                            const g1 = e1.y >= e1.floorY, g2 = e2.y >= e2.floorY;
                            const wx1 = (g1 ? groundAnchor : 1) / m1, wx2 = (g2 ? groundAnchor : 1) / m2;
                            const wxSum = wx1 + wx2;
                            const wy1 = 1 / m1, wy2 = 1 / m2, wySum = wy1 + wy2;

                            e1.x -= nx * corr * wx1 / wxSum;
                            e2.x += nx * corr * wx2 / wxSum;
                            e1.y -= ny * corr * wy1 / wySum;
                            e2.y += ny * corr * wy2 / wySum;

                            // Impulso de velocidad (casi inelástico, sin rebote)
                            const relVelN = (e2.velX - e1.velX) * nx + (e2.velY - e1.velY) * ny;
                            if (relVelN < 0) {
                                const j = -(1 + 0.02) * relVelN / invM;
                                e1.velX -= j / m1 * nx; e1.velY -= j / m1 * ny;
                                e2.velX += j / m2 * nx; e2.velY += j / m2 * ny;
                            }

                            // Amortiguación vertical DESACTIVADA DEL TODO a petición — mataba
                            // velocidad de caída (primero ×0.3, luego ×0.65) al tocar a otro
                            // huevo por arriba o en diagonal casi parado; se veía a cámara
                            // lenta. Sin esto, un huevo sobre la pila no pierde energía vertical
                            // al aterrizar — solo lo frena el rebote de pared (elástico, ×-1) y
                            // la corrección de POSICIÓN del solver (más arriba, `corr`), que
                            // sigue separando huevos que se solapan aunque ya no haya esta
                            // amortiguación de velocidad.
                            //
                            // const SETTLE_VY = 120;
                            // const isVertical = (nx === 0);
                            // if (dy > 2 && e1.velY > 0 && (isVertical || e1.velY < SETTLE_VY)) e1.velY *= 0.65;
                            // else if (dy < -2 && e2.velY > 0 && (isVertical || e2.velY < SETTLE_VY)) e2.velY *= 0.65;
                        }
                    } else if (isBox1 && isBox2) {
                        // handled in separate box pass below
                    } else {
                        let box = isBox1 ? e1 : e2;
                        let circ = isBox1 ? e2 : e1;
                        let cx = Math.max(box.x - 8, Math.min(circ.x, box.x + 8));
                        let cy = Math.max(box.y - 6, Math.min(circ.y, box.y + 6));
                        let cx_dx = circ.x - cx;
                        let cx_dy = circ.y - cy;
                        let distSq = cx_dx * cx_dx + cx_dy * cx_dy;

                        if (distSq < 25) {
                            let dist = Math.sqrt(distSq);
                            if (dist === 0) { cx_dx = 0; cx_dy = -1; dist = 1; }
                            let overlap = 5 - dist;
                            let nx = cx_dx / dist, ny = cx_dy / dist;
                            let push = overlap * 0.35;
                            circ.x += nx * push; circ.y += ny * push;
                            box.x -= nx * push; box.y -= ny * push;
                        }
                    }
                }
            }
        }
        _dbgPerfSample('eggCollision', performance.now() - _tEggCol0);

        const _tEggTail0 = performance.now();
        // Strict floor enforcement AFTER physics iterations
        eggsArr.forEach(e => {
            if (!e.collected && !e.isBeingDragged) {
                if (e.y > e.floorY) {
                    e.y = e.floorY;
                    e.velY = 0;
                }
            }
        });

        // Box-on-box stacking — separate pass with correct thresholds (eggs use 14px sweep, boxes need more)
        const _bHW = window.GAME_MODE === 'portrait' ? 29 : 19;
        const _bHH = window.GAME_MODE === 'portrait' ? 12 : 8;
        const _boxes = eggsArr.filter(e => !e.collected && !e.isBeingDragged && e.type === 'package');
        for (let _bi = 0; _bi < _boxes.length; _bi++) {
            for (let _bj = _bi + 1; _bj < _boxes.length; _bj++) {
                const b1 = _boxes[_bi], b2 = _boxes[_bj];
                const _ddx = Math.abs(b2.x - b1.x);
                const _ddy = Math.abs(b2.y - b1.y);
                const _ox = _bHW * 2 - _ddx;
                const _oy = _bHH * 2 - _ddy;
                if (_ox > 0 && _oy > 0) {
                    if (_ox < _oy) {
                        const _s = b2.x > b1.x ? 1 : -1;
                        b1.x -= _s * _ox * 0.25; b2.x += _s * _ox * 0.25;
                    } else {
                        const upper = b2.y < b1.y ? b2 : b1;
                        const lower = b2.y < b1.y ? b1 : b2;
                        upper.y = lower.y - _bHH * 2;
                        const _rv = upper.velY - lower.velY;
                        if (_rv > 10) upper.velY = lower.velY;
                        // friction: upper box follows lower box horizontally
                        upper.velX += (lower.velX - upper.velX) * 0.3;
                    }
                }
            }
        }

        eggsArr = eggsArr.filter(e => !e.collected);
        _dbgPerfSample('eggFloorTail', performance.now() - _tEggTail0);

        // Throttlado a ~12/s (ver _uiRefreshTimer más arriba) — confirmado con el
        // panel F6 que era, con diferencia, el mayor consumidor de update() (514
        // líneas / 115 escrituras al DOM en CADA frame, para textos que en su
        // inmensa mayoría no cambian de un frame al siguiente). A 12/s sigue
        // siendo imperceptible para un contador de texto y corta la llamada de
        // 60 veces/s a 12 — sin tocar los otros 30 sitios donde se llama
        // updateUI() tras una acción del jugador, que siguen siendo inmediatos.
        _uiRefreshTimer += dt;
        if (_uiRefreshTimer >= 1 / 12) {
            _uiRefreshTimer = 0;
            const _tUpdUI0 = performance.now();
            updateUI();
            // OJO con la semántica: se muestrea SIEMPRE (incluso los frames en que
            // el throttle de arriba se salta la llamada, con coste 0), para que la
            // media sea "ms por FRAME" igual que el resto de métricas — no "ms por
            // llamada". Si solo se muestreara cuando realmente se ejecuta, la media
            // saldría igual de alta que antes de throttlar (sigue costando lo
            // mismo CADA VEZ que corre) aunque ahora corra 5× menos — y encima
            // descuadraría la resta de "otr.u" (que sí es por frame).
            _dbgPerfSample('updateUICall', performance.now() - _tUpdUI0);
        } else {
            _dbgPerfSample('updateUICall', 0);
        }
    }

    const EGG_SPAWN_CAP = 1500;
    function layEgg(x, y, dir = 1, mega = false) {
        if (eggsArr.filter(e => !e.collected).length >= EGG_SPAWN_CAP) return;
        playSound(sfxLayEgg, 0.3, 50, true);
        let type = 'normal';
        let rand = Math.random();
        let premiumChance = Math.min(1.0, state.premiumLevel * (state.activeChallenge === 'endless' ? 0.01 : 0.05) + _ebGetBonus('blueEgg'));
        let goldenChance = Math.min(0.75, (state.goldenLevel || 0) * 0.01 + _ebGetBonus('goldEgg'));
        if (rand < goldenChance) type = 'golden';
        else if (rand < goldenChance + premiumChance) type = 'premium';

        const _makeEgg = (ox) => ({
            x: x + ox, y: y + 5, type, mega, collected: false,
            value: getEggValue(type, mega), isBeingDragged: false,
            velX: -dir * (120 + Math.random() * 60),
            velY: -50 - Math.random() * 50,
            angle: (Math.random() * 0.6 - 0.3), washed: false, stamped: false
        });
        eggsArr.push(_makeEgg(0));
        if (_ebGetBonus('doubleEgg') > 0 && Math.random() < _ebGetBonus('doubleEgg')) eggsArr.push(_makeEgg(10));
    }

    function _tierMult(mega) { return mega === 5 ? 25000 : mega === 4 ? 2500 : mega === 3 ? 500 : mega === 2 ? 50 : mega ? 10 : 1; }

    function getEggValue(type, mega = false) {
        let base = Math.pow(state.activeChallenge === 'endless' ? 1.1 : 1.5, state.baseValueLevel || 0);
        if (state.isSpeedrunMode) base *= 2;
        let typeMultiplier = type === 'golden' ? 5 : type === 'premium' ? 2 : 1;
        return typeMultiplier * _tierMult(mega) * base;
    }

    function collectEgg(egg) {
        egg.collected = true;
        if (egg.wasManuallyDragged) state.manualEggsMovedToMarket = (state.manualEggsMovedToMarket || 0) + 1;
        playSound(sfxMoney, 0.3, 100);
        let finalValue = state.hasTvAd ? egg.value * (state.activeChallenge === 'endless' ? (1 + (state.tvAdLevel || 1) * 0.20) : 2) : egg.value;
        if ((state._offerEggDouble || 0) > 0) finalValue *= 2;
        const _ebVal = _ebGetBonus('eggValue');
        if (_ebVal > 0) finalValue *= (1 + _ebVal);
        state.money += finalValue;
        _totalMoneyEarned += finalValue;
        state.totalEarnings = (state.totalEarnings || 0) + finalValue;
        // Mismo caso que en la venta automática por la cinta (ver más arriba):
        // una huevera arrastrada a mano también es UNA entidad que vale
        // stackRealCount × 6 huevos reales, no 1.
        state.eggsSold += (egg.type === 'package') ? (egg.stackRealCount || 1) * 6 : 1;
        const _eType = egg.type || 'normal';
        _saleAcc.total += finalValue;
        if (_eType === 'golden') _saleAcc.golden += finalValue;
        else if (_eType === 'premium') _saleAcc.premium += finalValue;
        else if (egg.mega) _saleAcc.mega += finalValue;
        updateUI();
    }



    function _buildFakeRanking() {
        const _A = ['Golden', 'Happy', 'Crazy', 'Sunny', 'Mega', 'Ultra', 'Super', 'Royal', 'Epic', 'Lucky', 'Mighty', 'Swift', 'Wild', 'Bold', 'Fast', 'Big', 'Pro', 'Mad', 'Top', 'Max'];
        const _B = ['Farm', 'Coop', 'Ranch', 'Nest', 'Eggs', 'Hens', 'Barn', 'Manor', 'Field', 'Grove', 'Gate', 'Hill', 'Yard', 'Chick', 'Roost'];
        const _G = ['FarmKing', 'EggMaster', 'HenBoss', 'ChickRush', 'YolkLord', 'CoopGod', 'EggL0rd', 'h3nz', 'farmerXx', 'egg_god', 'coop420', 'chickn99', 'pollo_loko', 'gallinaz', 'eggqueen', 'huevojefe', 'noobchick', 'farmero', 'gallinas_x', 'egg_rush', 'yolkmaster', 'coopcrazy', 'chickfarm', 'megachick', 'ultraegg'];
        let s = 42;
        const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        const nm = () => r() < 0.4
            ? _G[Math.floor(r() * _G.length)] + Math.floor(r() * 99 + 1)
            : _A[Math.floor(r() * _A.length)] + ' ' + _B[Math.floor(r() * _B.length)] + ' ' + Math.floor(r() * 99 + 1);
        let farms = [];
        for (let i = 0; i < 499; i++) {
            const logE = 4 + r() * 10; // $10K to $100T — broad endless spread
            const earnings = Math.floor(Math.pow(10, logE));
            const chickens = Math.max(1, Math.floor(5 + r() * 295));
            const eggsSold = Math.floor(earnings / (0.5 + r() * 3));
            const playTime = Math.floor(1800 + r() * 432000); // 30min to 5 days
            farms.push({ name: nm(), chickens, eggsSold, totalEarnings: earnings, playTime });
        }
        farms.sort((a, b) => b.totalEarnings - a.totalEarnings);
        return farms;
    }

    function _getPlayerEndlessRank() {
        if (!_fakeRanking) _fakeRanking = _buildFakeRanking();
        const pe = state.totalEarnings || 0;
        let rank = 1;
        for (let i = 0; i < _fakeRanking.length; i++) {
            if (_fakeRanking[i].totalEarnings > pe) rank++;
            else break;
        }
        return rank;
    }

    function _openEndlessRanking() {
        const overlay = document.getElementById('endless-ranking-overlay');
        if (!overlay) return;
        window.gamePaused = true;
        if (_cgGameplayStarted) window.GameAds.gameplayStop();
        overlay.style.display = 'flex';

        // Refrescar el input de nombre con el valor guardado
        const _ni = document.getElementById('endless-rank-name-input');
        if (_ni) _ni.value = localStorage.getItem('chickenIdleLastName') || '';

        const tbody = document.getElementById('endless-ranking-tbody');
        if (!tbody) return;

        const pin = localStorage.getItem('chickenIdleSpeedrunPin') || '';
        const mc = m => window.PLATFORM?.marketColor?.(m) || '#555';
        const ml = m => window.PLATFORM?.marketLabel?.(m) || m;
        const posColor = i => i === 0 ? '#ffd700' : i === 1 ? '#bdc3c7' : i === 2 ? '#cd7f32' : '#ccc';

        const _erAbbrev = (market) => {
            const MAP = { itchio:'IO', itch:'IO', newgrounds:'NG', galaxy:'GL', incrementaldb:'IDB', googleplay:'GP', google_play:'GP', crazygames:'CG' };
            const k = (market || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (MAP[k]) return MAP[k];
            const label = (ml(market) || market).toUpperCase();
            const words = label.split(/[\s_\-]+/);
            if (words.length >= 2) return words.map(w => w[0]).join('').slice(0, 3);
            return label.slice(0, 2);
        };
        const rowHtml = (r) => {
            const isMe = !!r.is_me;
            const c  = isMe ? '#2ecc71' : posColor(r.rank_pos - 1);
            const bg = isMe ? 'background:rgba(46,204,113,0.1);' : '';
            const badge = r.market
                ? `<span class="rank-com-badge" data-tooltip="${ml(r.market)}" style="width:26px;height:16px;background:${mc(r.market)};color:#fff;font-size:5px;border-radius:3px;letter-spacing:-0.5px;flex-shrink:0;margin-right:4px;">${_erAbbrev(r.market)}</span>`
                : '';
            return `<tr style="${bg}">
                <td style="padding:4px 5px;color:${c};text-align:left;white-space:nowrap;">${r.rank_pos}.</td>
                <td style="padding:4px 5px;color:${c};max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${badge}${r.name}</td>
                <td style="padding:4px 5px;color:#f1c40f;text-align:right;">${r.chickens}</td>
                <td style="padding:4px 5px;color:#e67e22;text-align:right;">${fmtMoney(r.eggs_sold)}</td>
                <td style="padding:4px 5px;color:#2ecc71;text-align:right;">${getCurrencySym()}${fmtMoney(r.earnings)}</td>
                <td style="padding:4px 5px;color:#3498db;text-align:right;white-space:nowrap;">${formatTimeSecs(r.play_time_secs)}</td>
            </tr>`;
        };

        const _renderEndlessRankData = (data) => {
            const sub = document.getElementById('endless-ranking-subtitle');
            const top10 = data.top10 || [];
            const player = data.player;
            const context = data.context || [];
            const inTop10 = top10.some(r => r.is_me);

            if (sub) {
                const myRank = inTop10
                    ? (top10.find(r => r.is_me) || {}).rank_pos
                    : (player ? player.rank_pos : window._endlessMyRank || '?');
                sub.innerText = myRank ? ((window.currentLang === 'tr') ? `Sıralaman: #${myRank}` : `Tu posición: #${myRank}`) : ((window.currentLang === 'tr') ? 'Küresel Sıralama' : 'Ranking Global');
            }

            let html = top10.map(r => rowHtml(r)).join('');

            if (!inTop10) {
                const rows = context.length > 0 ? context : (player ? [player] : []);
                if (rows.length > 0) {
                    html += `<tr><td colspan="6" style="padding:3px 0;"><div style="height:1px;background:#4a2a6e;margin:0 8px;"></div></td></tr>`;
                    html += rows.map(r => rowHtml(r)).join('');
                }
            }

            if (!html) html = '<tr><td colspan="6" style="text-align:center;color:#888;padding:20px;">' + ((window.currentLang === 'tr') ? 'Henüz kayıt yok — ilk sen ol!' : 'Sin registros aún — ¡sé el primero!') + '</td></tr>';
            tbody.innerHTML = html;
        };

        // Debug status bar
        let _dbgEl = document.getElementById('endless-rank-debug');
        if (!_dbgEl) {
            _dbgEl = document.createElement('div');
            _dbgEl.id = 'endless-rank-debug';
            _dbgEl.style.cssText = 'font-family:monospace;font-size:9px;color:#f39c12;text-align:center;padding:2px 0 4px;word-break:break-all;';
            const sub = document.getElementById('endless-ranking-subtitle');
            if (sub && sub.parentNode) sub.parentNode.insertBefore(_dbgEl, sub.nextSibling);
        }

        const _setDbg = (msg, color) => { if (_dbgEl) { _dbgEl.style.color = color || '#f39c12'; _dbgEl.textContent = msg; } };

        const _doFetch = () => {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;padding:20px;">' + (window.t ? window.t('rankingLoading') : 'Yükleniyor...') + '</td></tr>';
            const apiUrl = (RANKING_API_URL || '') + '/get_endless_ranking.php' + (pin ? '?pin=' + encodeURIComponent(pin) : '');
            _setDbg('⏳ ' + apiUrl, '#aaa');
            console.log('[EndlessRank] GET', apiUrl);
            fetch(apiUrl)
                .then(r => {
                    console.log('[EndlessRank] HTTP status:', r.status, r.statusText);
                    return r.text();
                })
                .then(raw => {
                    console.log('[EndlessRank] Raw response:', raw);
                    let data;
                    try { data = JSON.parse(raw); } catch(e) {
                        _setDbg('❌ JSON parse error: ' + raw.slice(0, 120), '#e74c3c');
                        throw new Error('json_parse');
                    }
                    console.log('[EndlessRank] Parsed:', data);
                    if (!data.ok) {
                        const errMsg = '❌ ' + JSON.stringify(data);
                        _setDbg(errMsg, '#e74c3c');
                        console.error('[EndlessRank] API returned error:', data);
                        throw new Error('api_error:' + (data.error || '?'));
                    }
                    _setDbg('✅ REAL DATA — ' + (data.top10 || []).length + ' entradas', '#2ecc71');
                    _renderEndlessRankData(data);
                })
                .catch((err) => {
                    const prev = _dbgEl ? _dbgEl.textContent : '';
                    _setDbg((prev.startsWith('❌') ? prev : '⚠️ FALLBACK — ' + String(err)), prev.startsWith('❌') ? '#e74c3c' : '#e67e22');
                    console.warn('[EndlessRank] Fallback activado:', String(err));
                    if (!_fakeRanking) _fakeRanking = _buildFakeRanking();
                    const playerEarnings = state.totalEarnings || 0;
                    const playerName = localStorage.getItem('chickenIdleLastName') || 'YOU';
                    const _norm = f => ({
                        name: f.name, market: f.market || null,
                        earnings: f.totalEarnings || f.earnings || 0,
                        chickens: f.chickens || 0,
                        eggs_sold: f.eggsSold || f.eggs_sold || 0,
                        play_time_secs: f.playTime || f.play_time_secs || 0,
                        is_me: !!f.is_me
                    });
                    const all = [..._fakeRanking.map(_norm), _norm({
                        name: playerName, chickens: state.chickens || 0,
                        eggsSold: state.eggsSold || 0, totalEarnings: playerEarnings,
                        playTime: Math.floor(state.playTime || 0), is_me: true
                    })];
                    all.sort((a, b) => b.earnings - a.earnings);
                    all.forEach((f, i) => { f.rank_pos = i + 1; });
                    _renderEndlessRankData({ top10: all.slice(0, 10), player: all.find(f => f.is_me) || null, context: [] });
                });
        };

        _doFetch();
    }

    function _chickFrameCount(row) {
        return (row === 4 || row === 9 || row === 10) ? 8 : 4;
    }

    // Factor de escala de la cinemática final. drawCinematic() ya multiplica cada entidad
    // por 2.0 (_isCine), así que TODOS los renderers deben aplicar este factor para
    // compensarlo — si no, salen al doble de tamaño.
    // Con 0.5 la entidad queda EXACTAMENTE al tamaño del juego (0.5 × 2.0 = 1.0).
    // renderChicken ya lo hacía; renderChick y renderRooster NO, y por eso gallos y
    // pollitos se veían al doble en la cinemática de Adam.
    function _cineAnimalScale() {
        if (!state.hasRetired) return 1.0;
        if (state.activeChallenge === 'adam')   return window.CINEMATIC_ANIMAL_SCALE_ADAM   ?? 0.7;
        if (state.activeChallenge === 'manual') return window.CINEMATIC_ANIMAL_SCALE_MANUAL ?? 0.7;
        return window.CINEMATIC_ANIMAL_SCALE_VANILLA ?? 0.7;
    }

    function _chickRenderScale() {
        return _chickenScaleFactor() * 2;
    }

    // Escala base de gallina/pollito: portrait/desktop en juego normal, O la escala
    // de cinemática cuando hasRetired — nunca las dos multiplicadas entre sí.
    //
    // BUG que arregla: los 4 sitios que antes tenían esta expresión duplicada hacían
    // `(portrait ? 1.5 : 1.0) * (hasRetired ? cineScale : 1.0)`. Fuera de la
    // cinemática eso da igual (el segundo factor es 1.0), pero DURANTE la cinemática
    // —un canvas cuadrado resolución-independiente por diseño, ver cinematic.js—
    // el multiplicador portrait se colaba igualmente y el mismo mundo 800×650 salía
    // con las gallinas 1.5× más grandes en portrait que en desktop.
    function _chickenScaleFactor() {
        if (state.hasRetired) return _cineAnimalScale();
        return (window.LAYOUT && typeof window.LAYOUT.CHICKEN_SCALE === 'number')
            ? window.LAYOUT.CHICKEN_SCALE
            : (window.GAME_MODE === 'portrait' ? 1.5 : 1.0);
    }

    function _chickenSheetVariantIndex(color) {
        const cHex = (color || '#ffffff').toLowerCase();
        if (cHex === '#dcc5a4') return 1;
        if (cHex === '#8b5a2b') return 2;
        if (cHex === '#444444') return 3;
        return 0;
    }

    function _chickenColorFromVariant(variantIdx) {
        return ['#ffffff', '#ffffff', '#dcc5a4', '#8b5a2b', '#444444'][variantIdx] || '#ffffff';
    }

    function renderChick(ctx, ch) {
        if (!chickSpriteSheet || !chickSpriteSheet.complete || chickSpriteSheet.naturalWidth === 0) return;

        let dir = ch.direction || 1;
        let isWalking = Math.abs(ch.velX) > 5 || Math.abs(ch.velY) > 5;
        let isGrey = ch.isGrey || false;
        let isEating = (ch.action === 'eating' || ch.action === 'drinking' || ch.action === 'failedFood' || ch.action === 'failedWater');
        let isVertical = (!ch.isSad && !isEating) && (Math.abs(ch.velY) > Math.abs(ch.velX) * 1.2);
        let sadIsVertical = Math.abs(ch.velY) > Math.abs(ch.velX) * 1.2;
        let isFront = isVertical && ch.velY > 0;
        let isBack = isVertical && ch.velY < 0;

        let row = 0;
        let frame = 0;
        let t = Date.now();
        let frameCount = 4;
        let isGrowing = (ch.growTimer !== undefined && ch.growTimer > 0 && ch.growTimer <= 1.0);

        if (isGrowing) {
            const growthVariantIdx = _chickenSheetVariantIndex(ch.color);
            const growthSheet = chickenSpriteSheets[growthVariantIdx] || chickenSpriteSheets[0];
            if (growthSheet && growthSheet.complete && growthSheet.naturalWidth) {
                const chickenScale = _chickenScaleFactor();
                const renderScale = chickenScale * 2;
                const growthFrame = Math.min(7, Math.floor((1 - Math.max(0, Math.min(1, ch.growTimer / 1.0))) * 8));
                let jumpY = ch.jumpTimer > 0 ? -4 * 8 * (1 - ch.jumpTimer / 0.5) * (ch.jumpTimer / 0.5) : 0;
                let shadowW = (ch.squishTimer > 0 ? 7 : 5) * Math.max(0.4, 1 - jumpY / -15) * renderScale;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                ctx.fillRect(ch.x - shadowW / 2, ch.y + 4, shadowW, 2);
                ctx.save();
                ctx.imageSmoothingEnabled = false;
                ctx.translate(Math.round(ch.x), Math.round(ch.y + jumpY));
                ctx.scale(dir * renderScale, renderScale);
                ctx.drawImage(growthSheet, growthFrame * 24, 12 * 24, 24, 24, -12, -21, 24, 24);
                ctx.restore();
                return;
            }
        }
        else if (ch.wakeTimer > 0 && ch.action === 'sleeping') {
            row = 10; // Despertar
            frameCount = _chickFrameCount(row);
            frame = Math.min(frameCount - 1, Math.floor((1 - (ch.wakeTimer / (ch.wakeDuration || 0.471235))) * frameCount));
        }
        else if (ch.action === 'sleeping') {
            row = 9; // Dormir
            frameCount = _chickFrameCount(row);
            frame = Math.floor((t / (942.47 / frameCount)) % frameCount);
        }
        else if (ch.action === 'sadFace' || (ch.giveUpTimer || 0) > 0) {
            row = 9; // Dormir / desvanecerse
            frameCount = _chickFrameCount(row);
            if (ch.giveUpTimer > 0) {
                frame = Math.min(frameCount - 1, Math.floor((1 - ch.giveUpTimer / 3) * frameCount));
            } else {
                frame = frameCount - 1;
            }
        }
        else if (ch.action === 'failedFood' || ch.action === 'failedWater') {
            row = 5; // Molesto
            frameCount = _chickFrameCount(row);
            frame = Math.min(frameCount - 1, Math.floor(((ch.failTimer || 0) * 2.5 % 1) * frameCount));
        }
        else if (isEating) {
            row = 4;
            frameCount = _chickFrameCount(row);
            let peckPhase = ((ch.eatTimer || ch.failTimer || 0) * 2.5) % 1.0;
            frame = Math.min(frameCount - 1, Math.floor(peckPhase * frameCount));
        }
        else if (ch.action === 'walkToSleep' || ch.action === 'walkToGraveyard' || (isGrey && isWalking)) {
            if (sadIsVertical && ch.velY > 0) row = 7;
            else if (sadIsVertical && ch.velY < 0) row = 8;
            else row = 6;
            frameCount = _chickFrameCount(row);
            frame = Math.floor(t / (942.47 / frameCount)) % frameCount;
        }
        else if (isWalking) {
            if (isFront) row = 2;
            else if (isBack) row = 3;
            else row = 1;

            frameCount = _chickFrameCount(row);
            frame = Math.floor(t / (942.47 / frameCount)) % frameCount;
        } else {
            row = 0;
            frameCount = _chickFrameCount(row);
            frame = Math.floor(t / (942.47 / frameCount)) % frameCount;
        }

        let jumpY = ch.jumpTimer > 0 ? -4 * 8 * (1 - ch.jumpTimer / 0.5) * (ch.jumpTimer / 0.5) : 0;

        let renderScale = _chickRenderScale();
        let shadowW = (ch.squishTimer > 0 ? 7 : 5) * Math.max(0.4, 1 - jumpY / -15) * renderScale;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(ch.x - shadowW / 2, ch.y + 4, shadowW, 2);

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.translate(Math.round(ch.x), Math.round(ch.y + jumpY + 7));

        // no rotation — sprite frames handle the lying-down animation

        ctx.scale(dir * renderScale, renderScale);

        // Offset Y=-24 places the bottom of the 24px cell exactly at the anchor (aligned with the shadow)
        ctx.drawImage(chickSpriteSheet, frame * 24, row * 24, 24, 24, -12, -24, 24, 24);

        ctx.restore();
    }

    function renderChicken(ctx, c) {

        if (!chickenSpriteSheets[0]) return;

        if (c.action === 'flyIn' && c.flyInTargetY !== undefined) {
            ctx.save();
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = '#000000';
            ctx.fillRect(c.x - 12, c.flyInTargetY + 19, 24, 2);
            ctx.restore();
        }

        let dir = c.direction || 1;
        let isWalking = Math.abs(c.velX) > 5 || Math.abs(c.velY) > 5;
        let isEating = (c.action === 'eating' || c.action === 'drinking');
        let isVertical = (!c.isSad && !isEating) && (Math.abs(c.velY) > Math.abs(c.velX) * 1.2);
        let isFront = isVertical && c.velY > 0;
        let isBack = isVertical && c.velY < 0;

        let cHex = (c.color || '#ffffff').toLowerCase();
        let variantIdx = 0;
        if (cHex === '#dcc5a4') variantIdx = 1;
        else if (cHex === '#8b5a2b') variantIdx = 2;
        else if (cHex === '#444444') variantIdx = 3;

        let baseRow = 0;
        let row = 0;
        let frame = 0;
        let ANIM_FRAMES = 8;

        let t = Date.now();
        let isGrey = c.isGrey || false;

        // c.forceRow: fuerza fila/frames fijos, saltándose toda la lógica normal de
        // acción/velocidad. Lo usa el público del duelo de gallos (Egg Jam/Manual,
        // cinematic.js) para dar una pequeña animación idle sin depender de acción o
        // velocidad real (están quietas del todo). c.forceFramePhase desincroniza el
        // parpadeo entre gallinas — sin él, Date.now() es igual para todas en el mismo
        // frame de render y cambiarían de frame todas a la vez (al unísono).
        if (c.forceRow !== undefined) {
            row = c.forceRow;
            const _frames = c.forceFrames || [0];
            const _ms = c.forceFrameMs || 500;
            const _phase = c.forceFramePhase || 0;
            frame = _frames[Math.floor((t + _phase) / _ms) % _frames.length];
        }
        else if (c.action === 'flyIn') {
            row = 15; // Volando (penúltima fila) — 2 frames
            frame = Math.floor(t / 120) % 2;
        }
        else if (c.wakeTimer > 0 && c.action === 'sleeping') {
            row = 10; // Despertar
            const WAKE_FRAMES = 8;
            frame = Math.min(WAKE_FRAMES - 1, Math.floor((1 - (c.wakeTimer / (c.wakeDuration || 0.471235))) * WAKE_FRAMES));
        }
        else if (c.action === 'sleeping' && (c.sleepInStep || 0) >= 0 && c.sleepInStep !== undefined) {
            row = 6; // Transición acostarse: frames específicos
            const _sleepInMap = [0, 1, 5];
            frame = _sleepInMap[Math.min(c.sleepInStep, 2)];
        }
        else if (c.action === 'sleeping') {
            row = (dir >= 0) ? 14 : 9; // Durmiendo derecha / izquierda
            const SLEEP_FRAMES = 8;
            if (!c.sleepPhase) c.sleepPhase = Math.random() * 942.47;
            frame = Math.floor(((t + c.sleepPhase) / (942.47 / SLEEP_FRAMES)) % SLEEP_FRAMES);
        }
        else if (c.action === 'sadFace') {
            if (c.giveUpTimer < 4) {
                row = 8;
                let deathP = 1.0 - (c.giveUpTimer / 4);
                frame = Math.min(ANIM_FRAMES - 1, Math.floor(deathP * ANIM_FRAMES));
            } else {
                row = 7;
                const SAD_LOOP_FRAMES = 4;
                let stepMs = 942.47 / SAD_LOOP_FRAMES;
                let mockTime = t + c.x * 100;
                frame = Math.floor(mockTime / stepMs) % ANIM_FRAMES;
            }
        }
        else if (c.layEggPhase === 'effort') {
            row = 4;
            frame = Math.min(3, Math.floor((1 - c.layEggTimer / 0.4) * 4));
        }
        else if (c.layEggPhase === 'release') {
            row = 4;
            frame = 4 + Math.min(3, Math.floor((1 - c.layEggTimer / 0.4) * 4));
        }
        else if (c.layEggTimer > 0) {
            row = 4;
            const LAY_FRAMES = 8;
            // La fila completa contiene el gesto de esfuerzo y la liberación.
            frame = Math.min(LAY_FRAMES - 1, Math.floor((1 - c.layEggTimer / 0.5) * LAY_FRAMES));
        }
        else if (c.action === 'failedFood' || c.action === 'failedWater') {
            row = 5; // Molesta (aleteando) — sin comida/agua
            const FLAP_FRAMES = 4;
            frame = Math.floor(t / (942.47 / FLAP_FRAMES)) % FLAP_FRAMES;
        }
        else if (isEating) {
            row = 13; // Comer/beber — fila específica de animación
            const ACTION_FRAMES = 4;
            let peckPhase = ((c.eatTimer || c.failTimer || c.mateTimer || 0) * 2.5) % 1.0;
            frame = Math.min(ACTION_FRAMES - 1, Math.floor(peckPhase * ACTION_FRAMES));
        }
        else if (c.action === 'waitForMate') {
            if (c._beingMated) {
                row = 5; // Nerviosa / aleteando durante el apareamiento
                frame = Math.floor((t / (942.47 / 4)) % 4);
            } else {
                row = 0; // Idle esperando
                frame = Math.floor((t / (942.47 / 4)) % 4);
            }
        }
        else if ((state.pettingLevel || 0) > 0 && c.isHovered && c.action === 'roam' && !isVertical) {
            row = 11; // Aparearse / happy petting
            const PET_FRAMES = 4;
            frame = Math.floor((t / (942.47 / PET_FRAMES)) % PET_FRAMES);
        }
        else if (c.jumpTimer > 0) {
            row = 5;
            const ACTION_FRAMES = 4;
            let p = 0.2 + (1.0 - (c.jumpTimer / 0.5)) * 0.6;
            frame = Math.max(0, Math.min(ACTION_FRAMES - 1, Math.floor(p * ACTION_FRAMES)));
        }
        else if (isGrey) {
            const _sadV = Math.abs(c.velY) > Math.abs(c.velX) * 1.2;
            if (_sadV && c.velY > 0) row = 7;
            else if (_sadV && c.velY < 0) row = 8;
            else row = 6;
            const SAD_WALK_FRAMES = 4;
            let stepMs = 376.99 / SAD_WALK_FRAMES;
            let mockTime = (t / 60 + (c._i || (c._i = Math.random() * 1000))) * 60;
            frame = Math.floor(mockTime / stepMs) % ANIM_FRAMES;
            if (isNaN(frame)) frame = 0;
        }
        else if (isWalking) {
            if (isFront) row = 2;
            else if (isBack) row = 3;
            else row = 1;

            let stepMs = 942.47 / ANIM_FRAMES;
            let mockTime = t / 60 * 60;
            frame = Math.floor(mockTime / stepMs) % ANIM_FRAMES;
        } else {
            row = 0;
            const IDLE_FRAMES = 4;
            let stepMs = 942.47 / IDLE_FRAMES;
            let mockTime = t / 60 * 60;
            frame = Math.floor(mockTime / stepMs) % IDLE_FRAMES;
        }

        let jumpY = 0;
        if (c.jumpTimer > 0) {
            let p = 1.0 - (c.jumpTimer / 0.5);
            jumpY = -4 * 8 * p * (1 - p);
        }


        // chicken_white.png: 24×24 px/frame. Escala combinada: renderScale * (64/24) para mismo tamaño visual.
        const _FW = 24, _FH = 24;
        const chickenScale = _chickenScaleFactor();
        const _totalScale = chickenScale * 2;
        let sx = frame * _FW;
        let sy = (row + baseRow) * _FH;

        // Gallinas especiales: sprite PROPIO por tier (ya no tinte sobre la blanca —
        // ver _megaChickenSprite arriba). Si su imagen aún no ha cargado, cae a la
        // variante normal en vez de dejarla invisible.
        const _megaSheet = c.mega ? _megaChickenSprite(c.mega) : null;
        const _drawSheet = (_megaSheet && _megaSheet.complete && _megaSheet.naturalWidth)
            ? _megaSheet
            : (chickenSpriteSheets[variantIdx] || chickenSpriteSheets[0]);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.translate(Math.round(c.x), Math.round(c.y + 13 + jumpY));
        ctx.scale(dir * _totalScale, _totalScale);
        // La nueva gallina tiene sombra propia en el sprite; no dibujar sombra adicional.
        // Anchor: centrado horizontalmente, base del frame en el punto de anclaje.
        ctx.drawImage(_drawSheet, sx, sy, _FW, _FH, -_FW / 2, -21, _FW, _FH);
        if (c.mega) {
            ctx.fillStyle = '#ffd700';
            ctx.font = `bold ${Math.round(11 / _totalScale)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('★'.repeat(c.mega), 0, -21 - 2);
        }
        ctx.restore();
    }

    function renderRooster(ctx, r) {
        if (!roosterSpriteSheet || !roosterSpriteSheet.complete || roosterSpriteSheet.naturalWidth === 0) return;

        if (r.action === 'flyIn' && r.flyInTargetY !== undefined) {
            ctx.save();
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = '#000000';
            ctx.fillRect(r.x - 12, r.flyInTargetY - 3, 24, 2);
            ctx.restore();
        }

        let dir = r.direction || 1;
        let isWalking = Math.abs(r.velX) > 5 || Math.abs(r.velY) > 5;
        let isEating = (r.action === 'eating' || r.action === 'drinking' || r.action === 'failedFood' || r.action === 'failedWater');
        let isVertical = (!r.isSad && !isEating) && (Math.abs(r.velY) > Math.abs(r.velX) * 1.2);
        let isFront = isVertical && r.velY > 0;
        let isBack = isVertical && r.velY < 0;

        let row = 0;
        let frame = 0;
        let ANIM_FRAMES = 8;

        let t = Date.now();
        let isGrey = r.isGrey || false;

        if (r.action === 'flyIn') {
            row = 5; // Molesto (aleteando) — vuelo de entrada
            frame = Math.floor(t / (942.47 / 4)) % 4;
        }
        else if (r.wakeTimer > 0 && r.action === 'sleeping') {
            row = 8; // Despertar
            frame = Math.min(ANIM_FRAMES - 1, Math.floor((1 - (r.wakeTimer / (r.wakeDuration || 0.471235))) * ANIM_FRAMES));
        }
        else if (r.action === 'sleeping') {
            row = (dir >= 0) ? 6 : 7; // Dormir derecha / izquierda
            if (!r.sleepPhase) r.sleepPhase = Math.random() * 942.47;
            frame = Math.floor(((t + r.sleepPhase) / (942.47 / ANIM_FRAMES)) % ANIM_FRAMES);
        }
        else if (r.action === 'mating') {
            row = 9; // Aparearse
            const _elapsed = 1.885 - (r.mateAnimTimer || 0);
            frame = Math.floor((_elapsed / 1.885) * 2 * ANIM_FRAMES) % ANIM_FRAMES;
        }
        else if (isEating) {
            row = 4;
            let peckPhase = ((r.eatTimer || r.failTimer || 0) * 2.5) % 1.0;
            frame = Math.min(ANIM_FRAMES - 1, Math.floor(peckPhase * ANIM_FRAMES));
        }
        else if (r.jumpTimer > 0 || r.squishTimer > 0) {
            row = 5; // Molesto — 4 frames
            let p = 0.2;
            if (r.jumpTimer > 0) p = 0.2 + (1.0 - (r.jumpTimer / 0.5)) * 0.6;
            frame = Math.max(0, Math.min(3, Math.floor(p * 4)));
        }
        else if (isWalking) {
            if (isFront) row = 2;
            else if (isBack) row = 3;
            else row = 1;

            const _wf = (row === 1) ? 4 : ANIM_FRAMES;
            frame = Math.floor((t / 60 * 60) / (942.47 / _wf)) % _wf;
        } else {
            row = 0;
            frame = Math.floor((t / 60 * 60) / (942.47 / 4)) % 4;
        }

        let jumpY = 0;
        if (r.jumpTimer > 0) {
            let p = 1.0 - (r.jumpTimer / 0.5);
            jumpY = -4 * 8 * p * (1 - p);
        }

        let isSquished = r.squishTimer > 0 || row === 5;
        let w = isSquished ? 24 : 20;
        let sScale = 1 - (jumpY / -15);
        // _cineAnimalScale() compensa el ×2 que drawCinematic() aplica a cada entidad.
        // Sin esto el gallo salía al DOBLE de tamaño en la cinemática.
        //
        // OJO: portrait y hasRetired son EITHER/OR, nunca multiplicados — si no, en
        // la cinemática (resolución-independiente por diseño) el gallo salía 1.5×
        // más grande en portrait que en desktop para el mismo mundo 800×650.
        let renderScale = state.hasRetired ? _cineAnimalScale() : (window.GAME_MODE === 'portrait' ? 1.5 : 1.0);
        let shadowW = (w * 1.8) * Math.max(0.4, sScale) * renderScale;


        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.translate(Math.round(r.x), Math.round(r.y + jumpY - 6));
        ctx.scale(dir * renderScale, renderScale);

        let sx = frame * 32;
        let sy = row * 32;

        // Rooster frames are 32×32px, drawn at 64×64 display size
        ctx.drawImage(roosterSpriteSheet, sx, sy, 32, 32, -32, -61, 64, 64);

        ctx.restore();
    }

    function sellOneEgg() {
        // This function is no longer used with the new auto-sell/processing system
        // Eggs are now processed directly on the underground belt
    }

    // ctxArg: contexto donde pintar. Si no se pasa, el del canvas de juego.
    //
    // BUG QUE ESTO ARREGLA: antes drawEgg no recibía ctx y usaba SIEMPRE el del canvas de
    // juego (el `const ctx` del módulo). Sus hermanos renderChicken/renderChick/renderRooster
    // sí lo reciben como parámetro. Resultado: durante la cinemática los huevos se pintaban
    // en el canvas de la granja —que está oculto— en vez de en el de la cinemática.
    // Los huevos NUNCA se han visto en ninguna cinemática.
    function drawEgg(e, ctxArg) {
        const ctx = ctxArg || _gameCtx;
        ctx.save();
        ctx.translate(e.x, e.y - 6);


        if (false) {
            // Tutorial arrows (legacy canvas fallback — moved to draw())
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.lineWidth = 4;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            let path = [];
            if (e.y < UNDERGROUND_FLOOR_Y - 30) {
                path = [
                    { x: e.x, y: e.y },
                    { x: 40, y: e.y },
                    { x: 40, y: UNDERGROUND_FLOOR_Y - 15 },
                    { x: canvas.width - 50, y: UNDERGROUND_FLOOR_Y - 15 }
                ];
            } else {
                path = [
                    { x: e.x, y: e.y },
                    { x: canvas.width - 50, y: e.y }
                ];
            }

            let totalLen = 0;
            let segments = [];
            for (let i = 0; i < path.length - 1; i++) {
                let dx = path[i + 1].x - path[i].x;
                let dy = path[i + 1].y - path[i].y;
                let len = Math.hypot(dx, dy);
                if (len > 0) {
                    segments.push({ len, dx, dy, x: path[i].x, y: path[i].y });
                    totalLen += len;
                }
            }

            let timeOffset = (Date.now() / 15) % 40;
            for (let d = timeOffset; d < totalLen; d += 40) {
                let dist = d;
                let pt = null;
                for (let i = 0; i < segments.length; i++) {
                    let seg = segments[i];
                    if (dist <= seg.len) {
                        let t = dist / seg.len;
                        pt = {
                            x: seg.x + seg.dx * t,
                            y: seg.y + seg.dy * t,
                            angle: Math.atan2(seg.dy, seg.dx)
                        };
                        break;
                    }
                    dist -= seg.len;
                }

                if (pt) {
                    ctx.save();
                    ctx.translate(pt.x, pt.y);
                    ctx.rotate(pt.angle);
                    ctx.beginPath();
                    ctx.moveTo(-7, -7);
                    ctx.lineTo(4, 0);
                    ctx.lineTo(-7, 7);
                    ctx.stroke();
                    ctx.restore();
                }
            }
            ctx.restore();
        }

        ctx.rotate(e.angle || 0);

        // EITHER/OR, no multiplicados: durante la cinemática (resolución-independiente
        // por diseño) el multiplicador portrait NO debe colarse, o el mismo huevo
        // saldría 1.5× más grande en portrait que en desktop.
        let drawScale = state.hasRetired ? (window.CINEMATIC_EGG_SCALE ?? 1.0) : (window.GAME_MODE === 'portrait' ? 1.5 : 1.0);
        if (e.type === 'package') drawScale *= 1.5;
        if (e.scale) drawScale *= e.scale;
        ctx.scale(drawScale, drawScale);

        if (!eggsSpriteSheet.complete || eggsSpriteSheet.naturalWidth === 0) {
            ctx.restore();
            return;
        }

        ctx.imageSmoothingEnabled = false;

        if (e.type === 'package') {
            if (eggsPackageSpriteSheet.complete && eggsPackageSpriteSheet.naturalWidth) {
                ctx.drawImage(eggsPackageSpriteSheet, 0, e.hasRibbon ? 80 : 72, 16, 8, -16, -18, 32, 32);
            }
        } else {
            const _typeRow  = (e.type === 'golden') ? 2 : ((e.type === 'premium') ? 1 : 0);
            const _stateCol = e.stamped ? 2 : (e.washed ? 1 : 0);
            const _sheet = (e.mega === 5 && eggsPurpleSpriteSheet.complete && eggsPurpleSpriteSheet.naturalWidth)
                ? eggsPurpleSpriteSheet
                : (e.mega === 4 && eggsGreenSpriteSheet.complete && eggsGreenSpriteSheet.naturalWidth)
                ? eggsGreenSpriteSheet
                : (e.mega === 3 && eggsGoldSpriteSheet.complete && eggsGoldSpriteSheet.naturalWidth)
                    ? eggsGoldSpriteSheet
                    : (e.mega === 2 && eggsProSpriteSheet.complete && eggsProSpriteSheet.naturalWidth)
                        ? eggsProSpriteSheet
                        : (e.mega && eggsMegaSpriteSheet.complete && eggsMegaSpriteSheet.naturalWidth)
                            ? eggsMegaSpriteSheet : eggsSpriteSheet;
            ctx.drawImage(_sheet, _stateCol * 28, _typeRow * 28, 28, 28, -16, -10, 32, 32);
        }

        ctx.restore();
    };

    // ── PixiJS texture cache ─────────────────────────────────────────────────
    // Convert any image/canvas source to a plain <canvas> so PixiJS always
    // uses CanvasResource (avoids WebGL security/CORS issues with ImageResource).
    function _srcToCanvas(src) {
        if (src instanceof HTMLCanvasElement) return src;
        const w = src.naturalWidth || src.width;
        const h = src.naturalHeight || src.height;
        if (!w || !h) return null;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(src, 0, 0);
        return c;
    }

    function _makeBaseTexture(src) {
        const c = _srcToCanvas(src);
        if (!c) return null;
        const bt = new PIXI.BaseTexture(new PIXI.CanvasResource(c));
        bt.scaleMode = PIXI.SCALE_MODES.NEAREST;
        return bt;
    }

    function _sheetFrames(bt, frameW, frameH, framesPerRow) {
        const rows = Math.floor(bt.realHeight / frameH);
        const arr = [];
        for (let row = 0; row < rows; row++) {
            for (let fr = 0; fr < framesPerRow; fr++) {
                if ((fr + 1) * frameW > bt.realWidth) break;
                arr[row * framesPerRow + fr] =
                    new PIXI.Texture(bt, new PIXI.Rectangle(fr * frameW, row * frameH, frameW, frameH));
            }
        }
        return arr;
    }

    // Egg sheets: 3 cols (base/washed/stamped) × 3 rows (normal/premium/golden), 28×28 px
    // Index 0-8 maps to the same linear row used by _syncEggSprite and carton draws.
    function _buildEggTexGrid(bt) {
        const arr = [];
        for (let i = 0; i < 9; i++) {
            arr[i] = new PIXI.Texture(bt, new PIXI.Rectangle((i % 3) * 28, Math.floor(i / 3) * 28, 28, 28));
        }
        return arr;
    }

    function _buildPixiTextures() {
        if (!baseChickenSprite.complete || !baseChickenSprite.naturalWidth) return false;
        if (!chickenBeigeSprite.complete || !chickenBeigeSprite.naturalWidth) return false;
        if (!chickenBrownSprite.complete || !chickenBrownSprite.naturalWidth) return false;
        if (!chickenBlackSprite.complete || !chickenBlackSprite.naturalWidth) return false;
        if (!chickenSpriteSheets[0] || !chickenSpriteSheets[1] || !chickenSpriteSheets[2] || !chickenSpriteSheets[3]) return false;

        if (!_pixiTex) _pixiTex = {};

        // Chickens — chicken_white.png: 24×24 px/frame, 8 frames/fila
        if (!_pixiTex.chicken) {
            _pixiTex.chicken = [];
            for (let v = 0; v < 4; v++) {
                const bt = _makeBaseTexture(chickenSpriteSheets[v] || chickenSpriteSheets[0]);
                if (!bt) continue;
                _pixiTex.chicken[v] = _sheetFrames(bt, 24, 24, 8);
            }
            if (!_pixiTex.chicken[0]) { _pixiTex = null; return false; }
        }

        // Chicks
        if (!_pixiTex.chick && chickSpriteSheet.complete && chickSpriteSheet.naturalWidth) {
            const bt = _makeBaseTexture(chickSpriteSheet);
            if (bt) _pixiTex.chick = _sheetFrames(bt, 24, 24, 8);
        }

        // Roosters
        if (!_pixiTex.rooster && roosterSpriteSheet.complete && roosterSpriteSheet.naturalWidth) {
            const bt = _makeBaseTexture(roosterSpriteSheet);
            if (bt) _pixiTex.rooster = _sheetFrames(bt, 32, 32, 8);
        }

        // Eggs — 3 cols (base/washed/stamped) × 3 rows (normal/premium/golden), 28×28 px
        // Packages (indices 9-10) come from eggs_old.png (16×88, rows at y=72 and y=80)
        if (!_pixiTex.egg && eggsSpriteSheet.complete && eggsSpriteSheet.naturalWidth
                && eggsPackageSpriteSheet.complete && eggsPackageSpriteSheet.naturalWidth) {
            const bt = _makeBaseTexture(eggsSpriteSheet);
            if (bt) {
                _pixiTex.egg = _buildEggTexGrid(bt);
                const btPkg = _makeBaseTexture(eggsPackageSpriteSheet);
                if (btPkg) {
                    _pixiTex.egg[9]  = new PIXI.Texture(btPkg, new PIXI.Rectangle(0, 72, 16, 8));
                    _pixiTex.egg[10] = new PIXI.Texture(btPkg, new PIXI.Rectangle(0, 80, 16, 8));
                }
            }
        }
        if (!_pixiTex.eggMega && eggsMegaSpriteSheet.complete && eggsMegaSpriteSheet.naturalWidth) {
            const bt = _makeBaseTexture(eggsMegaSpriteSheet);
            if (bt) _pixiTex.eggMega = _buildEggTexGrid(bt);
        }
        if (!_pixiTex.eggPro && eggsProSpriteSheet.complete && eggsProSpriteSheet.naturalWidth) {
            const bt = _makeBaseTexture(eggsProSpriteSheet);
            if (bt) _pixiTex.eggPro = _buildEggTexGrid(bt);
        }
        if (!_pixiTex.eggGold && eggsGoldSpriteSheet.complete && eggsGoldSpriteSheet.naturalWidth) {
            const bt = _makeBaseTexture(eggsGoldSpriteSheet);
            if (bt) _pixiTex.eggGold = _buildEggTexGrid(bt);
        }
        if (!_pixiTex.eggGreen && eggsGreenSpriteSheet.complete && eggsGreenSpriteSheet.naturalWidth) {
            const bt = _makeBaseTexture(eggsGreenSpriteSheet);
            if (bt) _pixiTex.eggGreen = _buildEggTexGrid(bt);
        }
        if (!_pixiTex.eggPurple && eggsPurpleSpriteSheet.complete && eggsPurpleSpriteSheet.naturalWidth) {
            const bt = _makeBaseTexture(eggsPurpleSpriteSheet);
            if (bt) _pixiTex.eggPurple = _buildEggTexGrid(bt);
        }

        // Gallinas especiales — mismo grid 24×24×8 que chicken_white.png, sprite
        // propio por tier (ver _megaChickenSprite). Opcional/no bloqueante, igual
        // que los huevos mega de arriba: si falta alguna, el draw cae a la normal.
        if (!_pixiTex.chickenMega && chickenMegaSprite.complete && chickenMegaSprite.naturalWidth) {
            const bt = _makeBaseTexture(chickenMegaSprite);
            if (bt) _pixiTex.chickenMega = _sheetFrames(bt, 24, 24, 8);
        }
        if (!_pixiTex.chickenPro && chickenProSprite.complete && chickenProSprite.naturalWidth) {
            const bt = _makeBaseTexture(chickenProSprite);
            if (bt) _pixiTex.chickenPro = _sheetFrames(bt, 24, 24, 8);
        }
        if (!_pixiTex.chickenGold && chickenGoldSprite.complete && chickenGoldSprite.naturalWidth) {
            const bt = _makeBaseTexture(chickenGoldSprite);
            if (bt) _pixiTex.chickenGold = _sheetFrames(bt, 24, 24, 8);
        }
        if (!_pixiTex.chickenGreen && chickenGreenSprite.complete && chickenGreenSprite.naturalWidth) {
            const bt = _makeBaseTexture(chickenGreenSprite);
            if (bt) _pixiTex.chickenGreen = _sheetFrames(bt, 24, 24, 8);
        }
        if (!_pixiTex.chickenPurple && chickenPurpleSprite.complete && chickenPurpleSprite.naturalWidth) {
            const bt = _makeBaseTexture(chickenPurpleSprite);
            if (bt) _pixiTex.chickenPurple = _sheetFrames(bt, 24, 24, 8);
        }

        // Flowers — 32×48: 3 types (rows) × 2 frames, each frame 16×16
        if (!_pixiTex.flowers && flowerSpriteSheet.complete && flowerSpriteSheet.naturalWidth) {
            const bt = _makeBaseTexture(flowerSpriteSheet);
            if (bt) {
                _pixiTex.flowers = [];
                for (let type = 0; type < 3; type++) {
                    _pixiTex.flowers[type] = [
                        new PIXI.Texture(bt, new PIXI.Rectangle(0, type * 16, 16, 16)),
                        new PIXI.Texture(bt, new PIXI.Rectangle(16, type * 16, 16, 16)),
                    ];
                }
            }
        }

        // Tombstone
        if (!_pixiTex.tombstone && tombstoneSpriteSheet.complete && tombstoneSpriteSheet.naturalWidth) {
            const bt = _makeBaseTexture(tombstoneSpriteSheet);
            if (bt) {
                const w = Math.min(32, bt.realWidth);
                const h = Math.min(32, bt.realHeight);
                _pixiTex.tombstone = new PIXI.Texture(bt, new PIXI.Rectangle(0, 0, w, h));
            }
        }

        // Water auto faucet — pixelart_design/Water_auto.png
        if (!_pixiTex.faucet && waterAutoSpriteSheet.complete && waterAutoSpriteSheet.naturalWidth) {
            const bt = _makeBaseTexture(waterAutoSpriteSheet);
            if (bt) {
                _pixiTex.faucet = new PIXI.Texture(bt, new PIXI.Rectangle(0, 0, bt.realWidth, bt.realHeight));
            }
        }

        // Food auto faucet — pixelart_design/Feeder_auto.png
        if (!_pixiTex.foodPipe && feederAutoSpriteSheet.complete && feederAutoSpriteSheet.naturalWidth) {
            const bt = _makeBaseTexture(feederAutoSpriteSheet);
            if (bt) {
                _pixiTex.foodPipe = new PIXI.Texture(bt, new PIXI.Rectangle(0, 0, bt.realWidth, bt.realHeight));
            }
        }

        // Heart sprite (petting radial fill) — base64 8×8 PNG
        if (!_pixiTex.heart && heartSpriteSheet.complete && heartSpriteSheet.naturalWidth) {
            const bt = _makeBaseTexture(heartSpriteSheet);
            if (bt) _pixiTex.heart = new PIXI.Texture(bt);
        }

        return true;
    }

    function _pixiSprite(entity) {
        let sp = _pixiMap.get(entity);
        if (!sp) {
            sp = new PIXI.Sprite(PIXI.Texture.EMPTY);
            sp.visible = false;
            _pixiCont.addChild(sp);
            _pixiMap.set(entity, sp);
        }
        return sp;
    }

    function _syncChickenSprite(c) {
        const sp = _pixiSprite(c);
        const cHex = (c.color || '#ffffff').toLowerCase();
        let vi = 0;
        if (cHex === '#dcc5a4') vi = 1;
        else if (cHex === '#8b5a2b') vi = 2;
        else if (cHex === '#444444') vi = 3;

        // ── chicken_white.png row map (24×24 px, 8 frames/row) ──────────────
        // Row 0: Esperar (Idle)
        // Row 1: Caminar lado
        // Row 2: Caminar frente (hacia cámara)
        // Row 3: Caminar dorso (de espaldas)
        // Row 4: Poner huevo         ← los 4 primeros frames son el gesto de esfuerzo
        // Row 5: Molesta (aleteando) ← usado para isEating y jumpTimer
        // Row 6: Caminar lado (triste)
        // Row 7: Caminar frente (triste)
        // Row 8: Caminar dorso (triste)
        // Row 9:  Durmiendo izquierda    ← dir < 0
        // Row 10: Despertar
        // Row 11: Aparearse             ← happy petting
        // Row 12: Crecer desde pollito
        // Row 13: Comer
        // Row 14: Durmiendo derecha     ← dir >= 0
        // Row 15: Volando (llegada)     ← flyIn, 2 frames
        // Row 16: (reservado)
        const FRAMES = 8;
        const t = Date.now();
        const dir = c.direction || 1;
        let row = 0, frame = 0;
        let noFlip = false; // true when the row already has the correct orientation baked in
        let flipDir = dir;  // overridden when a row faces left instead of right
        const isWalking = Math.abs(c.velX) > 5 || Math.abs(c.velY) > 5;
        const isEating = c.action === 'eating' || c.action === 'drinking';
        const isVertical = !c.isSad && !isEating && Math.abs(c.velY) > Math.abs(c.velX) * 1.2;

        if (c.action === 'flyIn') {
            row = 15; // Volando (penúltima fila) — 2 frames
            frame = Math.floor(t / 120) % 2;
        }
        else if (c.wakeTimer > 0 && c.action === 'sleeping') {
            row = 10; // Despertar
            const WAKE_FRAMES = 8;
            frame = Math.min(WAKE_FRAMES - 1, Math.floor((1 - (c.wakeTimer / (c.wakeDuration || 0.471235))) * WAKE_FRAMES));
        }
        else if (c.action === 'sleeping' && (c.sleepInStep || 0) >= 0 && c.sleepInStep !== undefined) {
            row = 6; // Transición acostarse — frames elegidos
            flipDir = -dir; // row 6 apunta izquierda: invertir para que coincida con sleepDirection
            const _sleepInMap = [0, 1, 5];
            frame = _sleepInMap[Math.min(c.sleepInStep, 2)];
        }
        else if (c.action === 'sleeping') {
            row = (dir >= 0) ? 14 : 9; // row 14 = derecha, row 9 = izquierda (ya orientadas, no flipear)
            noFlip = true;
            const SLEEP_FRAMES = 8;
            if (!c.sleepPhase) c.sleepPhase = Math.random() * 942.47;
            frame = Math.floor(((t + c.sleepPhase) / (942.47 / SLEEP_FRAMES)) % SLEEP_FRAMES);
        } else if (c.action === 'sadFace') {
            row = (dir >= 0) ? 14 : 9; // Usa durmiendo como fallback de muerta
            noFlip = true;
            if (c.giveUpTimer > 0) {
                frame = Math.min(FRAMES - 1, Math.floor((1 - c.giveUpTimer / 3) * FRAMES));
            } else {
                frame = FRAMES - 1; // fully flat
            }
        } else if (c.layEggPhase === 'effort') {
            row = 4;
            frame = Math.min(3, Math.floor((1 - c.layEggTimer / 0.4) * 4));
        } else if (c.layEggPhase === 'release') {
            row = 4;
            frame = 4 + Math.min(3, Math.floor((1 - c.layEggTimer / 0.4) * 4));
        } else if (c.layEggTimer > 0) {
            row = 4; // Poner huevo
            const LAY_FRAMES = 8;
            frame = Math.min(LAY_FRAMES - 1, Math.floor((1 - c.layEggTimer / 0.5) * LAY_FRAMES));
        } else if (c.action === 'failedFood' || c.action === 'failedWater') {
            row = 5; // Molesta (aleteando) — sin comida/agua
            frame = Math.floor(t / (942.47 / 4)) % 4;
        } else if (isEating) {
            row = 13; // Comer
            frame = Math.floor(t / (942.47 / FRAMES)) % FRAMES;
        } else if (c.action === 'waitForMate') {
            if (c._beingMated) {
                row = 5; // Nerviosa / aleteando durante el apareamiento
                frame = Math.floor((t / (942.47 / 4)) % 4);
            } else {
                row = 0; // Idle esperando
                frame = Math.floor((t / (942.47 / 4)) % 4);
            }
        } else if ((state.pettingLevel || 0) > 0 && c.isHovered && c.action === 'roam' && !isVertical) {
            row = 11; // Aparearse / happy petting
            const PET_FRAMES = 4;
            frame = Math.floor((t / (942.47 / PET_FRAMES)) % PET_FRAMES);
        } else if (c.jumpTimer > 0) {
            row = 5; // Molesta (aleteando) — acción dinámica
            const ACTION_FRAMES = 4;
            frame = Math.max(0, Math.min(ACTION_FRAMES - 1,
                Math.floor((0.2 + (1 - c.jumpTimer / 0.5) * 0.6) * ACTION_FRAMES)));
        } else if (c.isGrey) {
            const _sadV = Math.abs(c.velY) > Math.abs(c.velX) * 1.2;
            row = _sadV && c.velY > 0 ? 7 : _sadV && c.velY < 0 ? 8 : 6;
            const mt = (t / 60 + (c._i || (c._i = Math.random() * 1000))) * 60;
            const SAD_WALK_FRAMES = 4;
            frame = Math.floor(mt / (376.99 / SAD_WALK_FRAMES)) % FRAMES;
            if (isNaN(frame)) frame = 0;
        } else if (isWalking) {
            row = isVertical && c.velY > 0 ? 2 : isVertical && c.velY < 0 ? 3 : 1;
            frame = Math.floor(t / (942.47 / FRAMES)) % FRAMES;
        } else {
            row = 0; // Esperar (Idle)
            const IDLE_FRAMES = 4;
            frame = Math.floor(t / (942.47 / IDLE_FRAMES)) % IDLE_FRAMES;
        }

        let jumpY = 0;
        if (c.jumpTimer > 0) {
            const p = 1 - c.jumpTimer / 0.5;
            jumpY = -4 * 8 * p * (1 - p);
        }

        // Gallinas especiales: sprite PROPIO por tier (ya no tinte/filtro de plumas
        // — ver _pixiTex.chickenMega/Pro/Gold/Green/Purple, cargados en
        // _buildPixiTextures). Si su textura aún no está lista, cae a la normal.
        const _megaTexArr = c.mega === 5 ? _pixiTex.chickenPurple
            : c.mega === 4 ? _pixiTex.chickenGreen
            : c.mega === 3 ? _pixiTex.chickenGold
            : c.mega === 2 ? _pixiTex.chickenPro
            : c.mega === 1 ? _pixiTex.chickenMega
            : null;
        const _texArr = _megaTexArr || (_pixiTex.chicken[vi] || _pixiTex.chicken[0]);
        sp.texture = _texArr[row * FRAMES + frame] || PIXI.Texture.EMPTY;
        // Anchor Y: el personaje ocupa proporciones similares en el nuevo frame 24×24
        // 0.5 horizontal, ~0.875 vertical (centro visual ligeramente más alto que en 64px)
        sp.anchor.set(0.5, 0.875);
        sp.position.set(c.x, c.y + 13 + jumpY);
        const chickenScale = _chickenScaleFactor();
        const renderScale = chickenScale * 2 * (c.scale || 1);
        sp.scale.set(noFlip ? renderScale : flipDir * renderScale, renderScale);
        sp.tint = 0xFFFFFF;
        sp.filters = null;
        sp.rotation = c.angle || 0;
        sp.zIndex = c._depthY || (c.action === 'flyIn' ? (c.flyInTargetY + 19) : (c.y + 19));
        sp.visible = true;
    }

    function _syncChickSprite(ch) {
        if (!_pixiTex.chick) { _pixiSprite(ch).visible = false; return; }
        const sp = _pixiSprite(ch);
        const FRAMES = 8;
        const t = Date.now();
        const dir = ch.direction || 1;
        let row = 0, frame = 0;
        const isWalking = Math.abs(ch.velX) > 5 || Math.abs(ch.velY) > 5;
        const isEating = ch.action === 'eating' || ch.action === 'drinking';
        const isVertical = !ch.isSad && !isEating && Math.abs(ch.velY) > Math.abs(ch.velX) * 1.2;
        const sadIsVertical = Math.abs(ch.velY) > Math.abs(ch.velX) * 1.2;
        const isGrey = ch.isGrey || false;
        const jumpY = ch.jumpTimer > 0
            ? -4 * 8 * (1 - ch.jumpTimer / 0.5) * (ch.jumpTimer / 0.5) : 0;
        let frameCount = 4;
        let isGrowing = (ch.growTimer !== undefined && ch.growTimer > 0 && ch.growTimer <= 1.0);

        if (isGrowing) {
            const growthVariantIdx = _chickenSheetVariantIndex(ch.color);
            const growthTexArr = _pixiTex.chicken && (_pixiTex.chicken[growthVariantIdx] || _pixiTex.chicken[0]);
            if (growthTexArr) {
                const chickenScale = _chickenScaleFactor();
                const renderScale = chickenScale * 2;
                const growthFrame = Math.min(7, Math.floor((1 - Math.max(0, Math.min(1, ch.growTimer / 1.0))) * 8));
                const _texIdx = 12 * 8 + growthFrame;
                sp.texture = growthTexArr[_texIdx] || PIXI.Texture.EMPTY;
                sp.anchor.set(0.5, 0.875);
                sp.position.set(ch.x, ch.y + jumpY);
                sp.scale.set(dir * renderScale, renderScale);
                sp.rotation = 0;
                sp.zIndex = ch._depthY || (ch.y + 6);
                sp.visible = true;
                return;
            }
        } else if (ch.wakeTimer > 0 && ch.action === 'sleeping') {
            row = 10;
            frameCount = _chickFrameCount(row);
            frame = Math.min(frameCount - 1, Math.floor((1 - (ch.wakeTimer / (ch.wakeDuration || 0.471235))) * frameCount));
        } else if (ch.action === 'sleeping') {
            row = 9;
            frameCount = _chickFrameCount(row);
            frame = Math.floor((t / (942.47 / frameCount)) % frameCount);
        } else if (ch.action === 'sadFace' || (ch.giveUpTimer || 0) > 0) {
            row = 9;
            frameCount = _chickFrameCount(row);
            if (ch.giveUpTimer > 0) {
                frame = Math.min(frameCount - 1, Math.floor((1 - ch.giveUpTimer / 3) * frameCount));
            } else {
                frame = frameCount - 1;
            }
        } else if (ch.action === 'failedFood' || ch.action === 'failedWater') {
            row = 5;
            frameCount = _chickFrameCount(row);
            frame = Math.floor(t / (942.47 / frameCount)) % frameCount;
        } else if (isEating) {
            row = 4;
            frameCount = _chickFrameCount(row);
            frame = Math.floor(t / (942.47 / frameCount)) % frameCount;
        } else if (ch.action === 'walkToSleep' || ch.action === 'walkToGraveyard' || (isGrey && isWalking)) {
            if (sadIsVertical && ch.velY > 0) row = 7;
            else if (sadIsVertical && ch.velY < 0) row = 8;
            else row = 6;
            frameCount = _chickFrameCount(row);
            frame = Math.floor(t / (942.47 / frameCount)) % frameCount;
        } else if (isWalking) {
            row = isVertical && ch.velY > 0 ? 2 : isVertical && ch.velY < 0 ? 3 : 1;
            frameCount = _chickFrameCount(row);
            frame = Math.floor(t / (942.47 / frameCount)) % frameCount;
        } else {
            row = 0;
            frameCount = _chickFrameCount(row);
            frame = Math.floor(t / (942.47 / frameCount)) % frameCount;
        }

        const _texIdx = row * FRAMES + frame;
        const _tex = _pixiTex.chick[_texIdx];
        if (!_tex) {
            console.warn(`[CHICK INVISIBLE] action=${ch.action} row=${row} frame=${frame} idx=${_texIdx} totalFrames=${_pixiTex.chick.length}`);
        }
        sp.texture = _tex || PIXI.Texture.EMPTY;
        sp.anchor.set(0.5, 1.0);
        sp.position.set(ch.x, ch.y + jumpY + 7);
        const renderScale = _chickRenderScale() * (ch.scale || 1);
        sp.scale.set(dir * renderScale, renderScale);
        sp.rotation = ch.angle || 0;
        sp.zIndex = ch._depthY || (ch.y + 6);
        sp.visible = true;
    }

    function _syncRoosterSprite(r) {
        if (!_pixiTex.rooster) { _pixiSprite(r).visible = false; return; }
        const sp = _pixiSprite(r);
        const FRAMES = 8;
        const t = Date.now();
        const dir = r.direction || 1;
        let row = 0, frame = 0;
        const isWalking = Math.abs(r.velX) > 5 || Math.abs(r.velY) > 5;
        const isEating = r.action === 'eating' || r.action === 'drinking';
        const isVertical = !r.isSad && !isEating && Math.abs(r.velY) > Math.abs(r.velX) * 1.2;

        if (r.action === 'flyIn') {
            row = 5; // Molesto (aleteando) — vuelo de entrada
            frame = Math.floor(t / (942.47 / 4)) % 4;
        } else if (r.wakeTimer > 0 && r.action === 'sleeping') {
            row = 8; // Despertar
            frame = Math.min(FRAMES - 1, Math.floor((1 - r.wakeTimer / (r.wakeDuration || 0.471235)) * FRAMES));
        } else if (r.action === 'sleeping') {
            row = (dir >= 0) ? 6 : 7; // Dormir derecha / izquierda
            if (!r.sleepPhase) r.sleepPhase = Math.random() * 942.47;
            frame = Math.floor((t + r.sleepPhase) / (942.47 / FRAMES)) % FRAMES;
        } else if (r.action === 'mating') {
            row = 9; // Aparearse — 2 ciclos de 8 frames
            const _elapsed = 1.885 - (r.mateAnimTimer || 0);
            frame = Math.floor((_elapsed / 1.885) * 2 * FRAMES) % FRAMES;
        } else if (r.action === 'failedFood' || r.action === 'failedWater') {
            row = 5; // Molesto — sin comida/agua
            frame = Math.floor(t / (942.47 / 4)) % 4;
        } else if (isEating) {
            row = 4;
            frame = Math.floor(t / (942.47 / FRAMES)) % FRAMES;
        } else if (r.jumpTimer > 0 || r.squishTimer > 0) {
            row = 5; // Molesto — 4 frames
            const p = r.jumpTimer > 0 ? 0.2 + (1 - r.jumpTimer / 0.5) * 0.6 : 0.2;
            frame = Math.max(0, Math.min(3, Math.floor(p * 4)));
        } else if (isWalking) {
            row = isVertical && r.velY > 0 ? 2 : isVertical && r.velY < 0 ? 3 : 1;
            const _wf = (row === 1) ? 4 : FRAMES;
            frame = Math.floor(t / (942.47 / _wf)) % _wf;
        } else {
            row = 0;
            frame = Math.floor(t / (942.47 / 4)) % 4;
        }

        let jumpY = 0;
        if (r.jumpTimer > 0) {
            const p = 1 - r.jumpTimer / 0.5;
            jumpY = -4 * 8 * p * (1 - p);
        }
        sp.texture = _pixiTex.rooster[row * FRAMES + frame] || PIXI.Texture.EMPTY;
        sp.anchor.set(0.5, 61 / 64);
        sp.position.set(r.x, r.y + jumpY - 6);
        const renderScale = (window.GAME_MODE === 'portrait' ? 1.5 : 1.0) * 2; // 32px frames → 64px display
        sp.scale.set(dir * renderScale, renderScale);
        sp.rotation = 0;
        sp.zIndex = r._depthY || (r.action === 'flyIn' ? (r.flyInTargetY - 3) : (r.y - 3));
        sp.filters = null;
        sp.tint = 0xFFFFFF;
        sp.visible = true;
    }

    function _syncEggSprite(e, zOverride) {
        if (!_pixiTex.egg) { _pixiSprite(e).visible = false; return; }
        const sp = _pixiSprite(e);
        let row = 0;
        if (e.type === 'package') {
            row = e.hasRibbon ? 10 : 9;
        } else {
            const base = e.type === 'golden' ? 6 : e.type === 'premium' ? 3 : 0;
            row = e.stamped ? base + 2 : e.washed ? base + 1 : base;
        }

        const _texPool = (e.mega === 5 && _pixiTex.eggPurple) ? _pixiTex.eggPurple
            : (e.mega === 4 && _pixiTex.eggGreen) ? _pixiTex.eggGreen
            : (e.mega === 3 && _pixiTex.eggGold) ? _pixiTex.eggGold
                : (e.mega === 2 && _pixiTex.eggPro) ? _pixiTex.eggPro
                    : (e.mega === 1 && _pixiTex.eggMega) ? _pixiTex.eggMega : _pixiTex.egg;
        const _tex = _texPool[row];
        if (!_tex) { sp.visible = false; return; }
        sp.texture = _tex;
        sp.anchor.set(0.5, 0.5);
        const _spYOff = e.type === 'package' ? -12 : -6;
        sp.position.set(e.x, e.y + _spYOff);
        sp.rotation = e.angle || 0;
        let drawScale = (window.GAME_MODE === 'portrait' ? 1.5 : 1.0) * 2;
        if (e.type === 'package') drawScale *= 1.5;
        else drawScale *= 8 / 28;
        if (e.scale) drawScale *= e.scale;
        sp.scale.set(drawScale, drawScale);
        const _spZ = zOverride !== undefined ? zOverride : (e._depthY || e.y);
        sp.zIndex = _spZ;

        // Transición sucia→limpia: tint azul agua que desaparece en 500ms
        if (e.washedAt && Date.now() - e.washedAt < 500) {
            const _wt = (Date.now() - e.washedAt) / 500; // 0→1
            const _r = Math.round(0x66 + (0xFF - 0x66) * _wt);
            const _g = Math.round(0xBB + (0xFF - 0xBB) * _wt);
            sp.tint = (_r << 16) | (_g << 8) | 0xFF;
        } else {
            sp.tint = 0xFFFFFF;
        }

        sp.visible = true;

        // Sprites extra para paquetes batch (stackCount > 1) — misma textura del carton
        if (e.type === 'package' && (e.stackCount || 1) > 1 && _tex) {
            const sc = e.stackCount;
            let _extras = _stackGfxMap.get(e);
            if (!_extras || _extras.length !== sc - 1) {
                if (_extras) _extras.forEach(s => { s.visible = false; _pixiCont.removeChild(s); });
                _extras = [];
                for (let _i = 0; _i < sc - 1; _i++) {
                    const _es = new PIXI.Sprite(_tex);
                    _es.anchor.set(0.5, 0.5);
                    _pixiCont.addChild(_es);
                    _extras.push(_es);
                }
                _stackGfxMap.set(e, _extras);
            }
            const _ds = drawScale;
            const _maxPerCol = 5;
            const _cartonH = sc <= 4 ? 18 : 13; // 1-4 crecen con 18px; 5 comprimida al mismo alto que 4
            const _cartonW = 45;
            for (let _l = 0; _l < sc - 1; _l++) {
                const _es = _extras[_l];
                const _ci = _l + 1; // índice de esta huevera (0 = main)
                const _col = Math.floor(_ci / _maxPerCol);
                const _row = _ci % _maxPerCol;
                _es.texture = _tex;
                _es.anchor.set(0.5, 0.5);
                _es.position.set(e.x - _col * _cartonW, e.y - 12 - _row * _cartonH);
                _es.rotation = e.angle || 0;
                _es.scale.set(_ds, _ds);
                _es.zIndex = _spZ + _row;
                _es.visible = true;
            }
        } else {
            const _extras = _stackGfxMap.get(e);
            if (_extras) _extras.forEach(s => s.visible = false);
        }

        // Badge "xN + precio" — solo visible con F6 debug activo
        if (e.type === 'package' && _debugBoxCol) {
            let _badge = _stackBadgeMap.get(e);
            if (!_badge) {
                _badge = new PIXI.Text('', {
                    fontFamily: window.P2P_FONT || 'monospace',
                    fontSize: 7,
                    fill: '#ffffff',
                    stroke: '#000000',
                    strokeThickness: 2,
                    align: 'center'
                });
                _badge.anchor.set(0.5, 1);
                _badge.zIndex = 99999;
                _pixiCont.addChild(_badge);
                _stackBadgeMap.set(e, _badge);
            }
            const _sc = e.stackCount || 1;
            const _src = e.stackRealCount || _sc; // count real (puede ser > 4)
            const _fmtVal = e.value >= 1e6 ? (e.value / 1e6).toFixed(1) + 'M'
                : e.value >= 1e3 ? (e.value / 1e3).toFixed(1) + 'K'
                : Math.floor(e.value || 0).toString();
            _badge.text = 'x' + _src + '\n' + _fmtVal;
            const _topRow = Math.min(_sc, 5) - 1;
            const _badgeH = _sc <= 4 ? 18 : 13;
            _badge.position.set(e.x, e.y - 12 - _topRow * _badgeH - 10);
            _badge.visible = true;
        } else {
            const _badge = _stackBadgeMap.get(e);
            if (_badge) _badge.visible = false;
        }
    }

    function _syncTombstoneSprite(t) {
        if (!_pixiTex || !_pixiTex.tombstone) { const sp = _pixiMap.get(t); if (sp) sp.visible = false; return; }
        const sp = _pixiSprite(t);
        let ox = 0, oy = 0;
        if (t.shakeTimer > 0) ox = (Math.random() - 0.5) * 6;
        if (t.spawnTime) {
            const age = Date.now() - t.spawnTime;
            if (age < 500) oy = 20 * (1 - (1 - Math.pow(1 - age / 500, 3)));
        }
        sp.texture = _pixiTex.tombstone;
        sp.anchor.set(0.5, 20 / 32);
        sp.position.set(t.x + ox, t.y + oy);
        sp.scale.set(1, 1);
        sp.rotation = 0;
        sp.zIndex = t._depthY || (t.y + 12);
        sp.visible = true;
    }

    function _updateRetireStats() {
        if (window._lastPhase4Update && Date.now() - window._lastPhase4Update < 200) return;
        window._lastPhase4Update = Date.now();
        const fmt = n => Math.floor(n).toLocaleString('en-US');
        const fmtT = s => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60); return `${h}h ${m}m ${sec}s`; };
        const fmtM = n => { if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'; if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'; return Math.floor(n).toString(); };
        const chalMap = { speedrun: 'SPEEDRUN', adam: 'ADAM & EVE', manual: 'EGG JAM', endless: 'ENDLESS FARM', vanilla: 'NORMAL' };
        const chal = chalMap[state.activeChallenge] || 'NORMAL';
        const _mc = state.megaChickens || 0;
        const chickStr = fmt((state.chickens || 0) - _mc + _mc * 50) + (_mc > 0 ? ` (${_mc}★)` : '');
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        // Stats
        set('rs-val-challenge', chal);
        set('rs-val-playtime',  fmtT(state.playTime || 0));
        set('rs-val-eggs',      fmt(state.eggsSold || 0));
        set('rs-val-earnings',  getCurrencySym() + fmtM(state.totalEarnings || state.money));
        set('rs-val-chickens',  chickStr);
        // Sin fila "Dead" en el cartel: ya no muere ninguna gallina, deadChickens ya
        // no se usa aquí (era solo para el PERFECT, eliminado a petición).
        set('rs-val-hungry',    fmt(state.chickensSuffered || 0));
        // Solo Speedrun: tu mejor posición en el ranking global (chickenIdleSpeedrunData,
        // guardado en el último envío correcto — ver submit_score_2.php).
        const rankRow = document.getElementById('rs-row-rank');
        if (rankRow) {
            let ld = null;
            try { const s = localStorage.getItem('chickenIdleSpeedrunData'); if (s) ld = JSON.parse(s); } catch (e) { }
            const pPos = window._endRankPlayerPos || (ld ? ld.pos : null);
            if (state.isSpeedrunMode && pPos) {
                rankRow.style.display = '';
                set('rs-val-rank', '#' + pPos);
            } else {
                rankRow.style.display = 'none';
            }
        }
        // ("PERFECT! No chickens harmed." eliminado a petición — ya no se pinta.)
        // Speedrun button visibility
        const speedrunBtn = document.getElementById('rs-speedrun-btn');
        if (speedrunBtn) speedrunBtn.style.display = state.isSpeedrunMode ? 'none' : 'block';
        window._speedrunCanvasBtn = state.isSpeedrunMode ? null : { x: 0, y: 0, w: 0, h: 0 };
    }

    function _initRetireStats() {
        // Botón "VER RANKING" junto a "Posición:" — abre el panel de ranking ESTÁNDAR
        // del juego (#ranking-overlay, el mismo que el del menú principal), reusando
        // su lógica entera (pausa, medallas, fetchRanking...) en vez de duplicarla en
        // un panel propio de este cartel.
        const viewRankingBtn = document.getElementById('rs-view-ranking-btn');
        if (viewRankingBtn) {
            viewRankingBtn.addEventListener('click', () => {
                const rb = document.getElementById('ranking-btn');
                if (rb) rb.click();
            });
        }

        const speedrunBtn = document.getElementById('rs-speedrun-btn');
        if (speedrunBtn) speedrunBtn.addEventListener('click', () => { window._speedrunCanvasBtn = { _clicked: true }; });
    }

    function _syncHoleMask() {
        if (window.GAME_MODE !== 'portrait') {
            if (_holeMaskSprite) _holeMaskSprite.visible = false;
            return;
        }
        if (!_pixi || !_pixiCont || !_bgPixiSprite || !_bgPixiSprite.texture || !_bgPixiSprite.texture.valid) return;
        const maskH = window.LAYOUT.HOLE_RIGHT_Y_MARGIN || 0;
        if (!_holeMaskGfx) {
            _holeMaskGfx = new PIXI.Graphics();
            _holeMaskSprite = new PIXI.Sprite();
            _holeMaskSprite.zIndex = 950;
            _holeMaskSprite.mask = _holeMaskGfx;
            _pixiCont.addChild(_holeMaskSprite);
            _pixiCont.addChild(_holeMaskGfx);
        }
        _holeMaskGfx.clear();
        if (maskH <= 0) { _holeMaskSprite.visible = false; return; }
        const holeX = canvas.width - window.LAYOUT.HOLE_RIGHT_MARGIN;
        const maskY = canvas.height - maskH;
        _holeMaskGfx.beginFill(0xffffff, 1);
        _holeMaskGfx.drawRect(holeX, maskY, window.LAYOUT.HOLE_RIGHT_MARGIN, maskH + 20);
        _holeMaskGfx.endFill();
        _holeMaskSprite.texture = _bgPixiSprite.texture;
        _holeMaskSprite.x = 0;
        _holeMaskSprite.y = 0;
        _holeMaskSprite.width = canvas.width;
        _holeMaskSprite.height = canvas.height;
        _holeMaskSprite.visible = true;
    }

    function syncEntityLayer() {
        if (!_pixi) return;
        window.GamePixi.sync(canvas, _pixi);
        if (_bubbleCanvas) {
            const pv = _pixi.view;
            _bubbleCanvas.style.width = pv.style.width;
            _bubbleCanvas.style.height = pv.style.height;
            _bubbleCanvas.style.left = pv.style.left;
            _bubbleCanvas.style.top = pv.style.top;
        }
        _syncBgSprite();
        _syncHoleMask();

        // ── Flores decorativas ────────────────────────────────────────────
        if (_pixiTex && _pixiTex.flowers) {
            const SCALE = 3;
            const _fDefs = window.GAME_MODE === 'portrait' ? FLOWER_DEFS_PORTRAIT : FLOWER_DEFS;
            while (_flowerSprites.length < _fDefs.length) {
                const sp = new PIXI.Sprite(PIXI.Texture.EMPTY);
                sp.anchor.set(0.5, 0.875); // 14/16 — base visible del tallo, no el tile vacío
                _pixiCont.addChild(sp);
                _flowerSprites.push(sp);
            }
            _fDefs.forEach((def, i) => {
                const sp = _flowerSprites[i];
                const frame = _flowerFrame[i] || 0;
                sp.texture = _pixiTex.flowers[def.type][frame];
                sp.position.set(def.x, def.y);
                sp.scale.set(def.flip ? -SCALE : SCALE, SCALE);
                sp.zIndex = def.y;
                sp.visible = true;
            });
        }

        _syncCatSprite();
        _syncBelts();
        _syncBoomboxSprite();
        _syncTvSprite();
        _syncWasherSprite();
        _syncStamperSprite();
        _syncPackagerSprite();
        _syncRibbonSprite();
        _syncTroughs();
        // Sync bubble overlay CSS size with PIXI canvas
        if (_bubbleCanvas && _pixi) {
            const pv = _pixi.view;
            _bubbleCanvas.style.width = pv.style.width;
            _bubbleCanvas.style.height = pv.style.height;
            _bubbleCanvas.style.left = pv.style.left;
            _bubbleCanvas.style.top = pv.style.top;
        }
        // Ensure PixiJS overlay is always visible (cinematic runs fully in PixiJS)
        if (_pixi.view.style.opacity !== '') _pixi.view.style.opacity = '';
        // Retry building textures every frame until all sheets have loaded
        _buildPixiTextures();
        if (!_pixiTex) return;

        const active = new Set();

        const _tSyncChk0 = performance.now();
        for (let i = 0; i < chickensArr.length; i++) {
            const c = chickensArr[i];
            c._depthY = c.y + 19;
            active.add(c);
            _syncChickenSprite(c);
        }
        _dbgPerfSample('syncChickens', performance.now() - _tSyncChk0);
        for (let i = 0; i < chicksArr.length; i++) {
            const ch = chicksArr[i];
            ch._depthY = ch.y + 6;
            active.add(ch);
            _syncChickSprite(ch);
        }
        for (let i = 0; i < roostersArr.length; i++) {
            const r = roostersArr[i];
            r._depthY = r.y - 3;
            active.add(r);
            _syncRoosterSprite(r);
        }
        const _tSyncEgg0 = performance.now();
        for (let i = 0; i < eggsArr.length; i++) {
            const e = eggsArr[i];
            if (e.collected) {
                const sp = _pixiMap.get(e);
                if (sp) { sp.visible = false; }
            } else if (state.hasSorter && e.x >= 0 && e.x <= 100
                && e.y >= UNDERGROUND_CEILING_Y && e.y <= UNDERGROUND_CEILING_Y + 74) {
                // Egg inside sorter machine body — hide PixiJS sprite so main-canvas machine body covers it
                const sp = _pixiMap.get(e);
                if (sp) { sp.visible = false; }
            } else {
                e._depthY = e.y;
                active.add(e);
                _syncEggSprite(e);
            }
        }
        _dbgPerfSample('syncEggs', performance.now() - _tSyncEgg0);
        // Egg/box collider debug (F6)
        if (!_rotDebugGfx) {
            _rotDebugGfx = new PIXI.Graphics();
            _rotDebugGfx.zIndex = 99998;
            _pixiCont.addChild(_rotDebugGfx);
        }
        _rotDebugGfx.clear();
        if (_debugBoxCol) {
            for (let i = 0; i < eggsArr.length; i++) {
                const e = eggsArr[i];
                if (e.collected) continue;
                if (e.type === 'package') {
                    // box: 16×8 frame × scale3 = 48×24px
                    _rotDebugGfx.lineStyle(1, 0xFFFF00, 0.9);
                    _rotDebugGfx.drawRect(e.x - 24, e.y - 26, 48, 24);
                } else {
                    // egg: 8×8 frame × scale2 = radius 8
                    _rotDebugGfx.lineStyle(1, 0x00FFFF, 0.9);
                    _rotDebugGfx.drawCircle(e.x, e.y - 6, 8);
                }
            }
            _rotDebugGfx.lineStyle(0);

            // Hole mask zone — magenta outline
            const _dbHoleX = canvas.width - window.LAYOUT.HOLE_RIGHT_MARGIN;
            const _dbMaskH = window.LAYOUT.HOLE_RIGHT_Y_MARGIN || 0;
            const _dbMaskY = canvas.height - _dbMaskH;
            _rotDebugGfx.lineStyle(2, 0xff00ff, 1);
            _rotDebugGfx.drawRect(_dbHoleX, _dbMaskY, window.LAYOUT.HOLE_RIGHT_MARGIN, _dbMaskH);
            _rotDebugGfx.lineStyle(0);
        }

        for (let i = 0; i < draggedEggs.length; i++) {
            const e = draggedEggs[i];
            active.add(e);
            _syncEggSprite(e, 99000);
        }
        for (let i = 0; i < tombstonesArr.length; i++) {
            const t = tombstonesArr[i];
            t._depthY = t.y + 12;
            active.add(t);
            _syncTombstoneSprite(t);
        }

        // Hide sprites for entities that no longer exist
        for (const [entity, sp] of _pixiMap) {
            if (!active.has(entity)) {
                sp.visible = false;
            }
        }
        for (const [entity, extras] of _stackGfxMap) {
            if (!active.has(entity)) extras.forEach(s => s.visible = false);
        }
        for (const [entity, badge] of _stackBadgeMap) {
            if (!active.has(entity)) badge.visible = false;
        }

        // Water auto faucet sprite — spout over trough centre
        if (!state.hasRetired && state.autoWaterLevel > 0 && _pixiTex && _pixiTex.faucet) {
            if (!_faucetSprite) {
                _faucetSprite = new PIXI.Sprite(_pixiTex.faucet);
                _faucetSprite.anchor.set(0, 0);
                _faucetSprite.zIndex = 600;
                _pixiCont.addChild(_faucetSprite);
            }
            _faucetSprite.scale.set(window.LAYOUT.FAUCET_SCALE || 1);
            _faucetSprite.x = window.LAYOUT.FAUCET_X;
            _faucetSprite.y = window.LAYOUT.FAUCET_Y;
            _faucetSprite.visible = true;
        } else if (_faucetSprite) {
            _faucetSprite.visible = false;
        }

        // Food pipe sprite — 64x32, spout over food trough centre (canvas x=765)
        if (!state.hasRetired && state.autoFoodLevel > 0 && _pixiTex && _pixiTex.foodPipe) {
            if (!_foodPipeSprite) {
                _foodPipeSprite = new PIXI.Sprite(_pixiTex.foodPipe);
                _foodPipeSprite.anchor.set(1, 0); // right-edge anchor, mirrors canvas 2D
                _foodPipeSprite.zIndex = 600;
                _pixiCont.addChild(_foodPipeSprite);
            }
            let fScale = window.LAYOUT.FOOD_PIPE_SCALE || 1.0;
            _foodPipeSprite.scale.set(fScale);
            _foodPipeSprite.x = window.LAYOUT.FOOD_PIPE_X;
            _foodPipeSprite.y = window.LAYOUT.FOOD_PIPE_Y;
            _foodPipeSprite.visible = true;
        } else if (_foodPipeSprite) {
            _foodPipeSprite.visible = false;
        }

        if (_proPackCoverGfx) _proPackCoverGfx.visible = false;
        if (_bgPixiSprite) _bgPixiSprite.visible = true;

        // Retire fade-to-black: HTML overlay covers full game-viewport (sky+canvas+earth)
        {
            const _fadeEl = document.getElementById('cine-fade');
            if (_fadeEl) {
                let _fa = 0;
                if (retireFadeTimer >= 0 && !state.hasRetired) {
                    _fa = Math.min(1, retireFadeTimer / 1.0);
                } else if (state.hasRetired && cinematicPhase === 0) {
                    _fa = 1;
                } else if (state.hasRetired && cinematicPhase === 1) {
                    _fa = Math.max(0, 1.0 - cinematicTimer);
                } else if (state.hasRetired && cinematicPhase === 6) {
                    _fa = Math.min(1, cinematicTimer / 0.4);
                } else if (state.hasRetired && cinematicPhase === 4 && cinematicTimer < 0.4) {
                    _fa = Math.max(0, 1 - cinematicTimer / 0.4);
                }
                _fadeEl.style.opacity = _fa;
            }
            // Phase 4 HTML stats overlay
            {
                const _statsEl = document.getElementById('retire-stats-overlay');
                if (_statsEl) {
                    const _shouldShow = state.hasRetired && cinematicPhase === 4;
                    const _isVisible  = _statsEl.style.display === 'flex';
                    const _isClosing  = _statsEl.classList.contains('overlay-closing');
                    if (_shouldShow) {
                        if (!_isVisible) {
                            _statsEl.style.display = 'flex';
                            document.body.classList.add('retire-stats-open');
                        }
                        _updateRetireStats();
                    } else if (_isVisible && !_isClosing) {
                        if (document.body.classList.contains('in-game')) {
                            _statsEl.classList.add('overlay-closing');
                            _statsEl.addEventListener('animationend', function () {
                                _statsEl.style.display = 'none';
                                _statsEl.classList.remove('overlay-closing');
                                document.body.classList.remove('retire-stats-open');
                            }, { once: true });
                        } else {
                            _statsEl.style.display = 'none';
                            document.body.classList.remove('retire-stats-open');
                        }
                    }
                }
            }
        }

        // ── Sombras de aterrizaje (flyIn) ─────────────────────────────────────
        if (!_flyInShadowGfx) {
            _flyInShadowGfx = new PIXI.Graphics();
            _flyInShadowGfx.zIndex = 1;
            _pixiCont.addChild(_flyInShadowGfx);
        }
        _flyInShadowGfx.clear();
        {
            // Gallinas: pies en c.y + 19 → sombra en flyInTargetY + 19
            for (let _fi = 0; _fi < chickensArr.length; _fi++) {
                const _fe = chickensArr[_fi];
                if (_fe.action !== 'flyIn') continue;
                _flyInShadowGfx.beginFill(0x000000, 0.45);
                _flyInShadowGfx.drawRect(_fe.x - 12, _fe.flyInTargetY + 19, 24, 2);
                _flyInShadowGfx.endFill();
            }
            // Gallos: pies en r.y - 3 → sombra en flyInTargetY - 3
            for (let _fi = 0; _fi < roostersArr.length; _fi++) {
                const _fe = roostersArr[_fi];
                if (_fe.action !== 'flyIn') continue;
                _flyInShadowGfx.beginFill(0x000000, 0.45);
                _flyInShadowGfx.drawRect(_fe.x - 12, _fe.flyInTargetY - 3, 24, 2);
                _flyInShadowGfx.endFill();
            }
        }

        // ── Debug sortY overlay (window.DEBUG_SORTY = true para ver) ──────────
        if (!_debugGfx) {
            _debugGfx = new PIXI.Graphics();
            _debugGfx.zIndex = 99999;
            _pixiCont.addChild(_debugGfx);
        }
        _debugGfx.clear();
        if (window.DEBUG_SORTY) {
            const dot = (gfx, x, y, color) => {
                gfx.lineStyle(1, 0x000000, 0.6);
                gfx.beginFill(color, 1);
                gfx.drawCircle(x, y, 4);
                gfx.endFill();
                gfx.lineStyle(0);
            };
            // Flores — punto de suelo (anchor 0.5, 1.0) — cian
            FLOWER_DEFS.forEach(def => dot(_debugGfx, def.x, def.y, 0x00ffff));
            // Gallinas — amarillo
            chickensArr.forEach(c => dot(_debugGfx, c.x, c._depthY || (c.y + 19), 0xffff00));
            // Pollitos — naranja
            chicksArr.forEach(ch => dot(_debugGfx, ch.x, ch._depthY || (ch.y + 6), 0xff8800));
            // Gallo — magenta
            roostersArr.forEach(r => dot(_debugGfx, r.x, r._depthY || (r.y - 3), 0xff00ff));
        }
        if (window.DEBUG_EGG) {
            eggsArr.forEach(e => {
                if (e.collected) return;
                if (e.type === 'package') {
                    const _dbHW = window.GAME_MODE === 'portrait' ? 29 : 19;
                    const _dbHH = window.GAME_MODE === 'portrait' ? 12 : 8;
                    _debugGfx.lineStyle(1, 0x00ffff, 0.9);
                    _debugGfx.drawRect(e.x - _dbHW, e.y - _dbHH, _dbHW * 2, _dbHH * 2);
                    _debugGfx.lineStyle(0);
                } else {
                    const _ea = e.angle || 0, _ecx = e.x, _ecy = e.y - 6;
                    const _hexPts = [];
                    for (let _hi = 0; _hi < 6; _hi++) {
                        const _ha = _ea + _hi * Math.PI / 3;
                        _hexPts.push(_ecx + 7 * Math.cos(_ha), _ecy + 7 * Math.sin(_ha));
                    }
                    _debugGfx.lineStyle(1, 0xff4444, 0.9);
                    _debugGfx.drawPolygon(_hexPts);
                    _debugGfx.lineStyle(0);
                }
            });
        }

        // ── Tutorial arrows (egg → market) ───────────────────────────────────
        if (!_tutArrowGfx) {
            _tutArrowGfx = new PIXI.Graphics();
            _tutArrowGfx.zIndex = 5000;
            _pixiCont.addChild(_tutArrowGfx);
        }
        _tutArrowGfx.clear();
        if (!state.hasRetired && (state.eggsSold || 0) === 0 && (state.playTime || 0) > 10 && draggedEggs.length === 0) {
            const _tutEgg = eggsArr.find(egg => !egg.collected);
            if (_tutEgg) {
                const _tFarmY = EGG_LIMIT_Y -10;           // suelo granja — ajusta aquí
                const _tUgY = UNDERGROUND_FLOOR_Y - 10; // suelo sótano — ajusta aquí
                let _tPath = [];
                if (_tutEgg.y < UNDERGROUND_FLOOR_Y - 30) {
                    _tPath = [
                        { x: _tutEgg.x, y: _tFarmY },
                        { x: 40, y: _tFarmY },
                        { x: 40, y: _tUgY },
                        { x: canvas.width - 50, y: _tUgY }
                    ];
                } else {
                    _tPath = [
                        { x: _tutEgg.x, y: _tUgY },
                        { x: canvas.width - 50, y: _tUgY }
                    ];
                }
                let _tTotal = 0, _tSegs = [];
                for (let i = 0; i < _tPath.length - 1; i++) {
                    const dx = _tPath[i + 1].x - _tPath[i].x, dy = _tPath[i + 1].y - _tPath[i].y;
                    const len = Math.hypot(dx, dy);
                    if (len > 0) _tSegs.push({ len, dx, dy, x: _tPath[i].x, y: _tPath[i].y });
                    _tTotal += len;
                }
                // Collect chevron points once, draw twice (outline + fill)
                const _tOff = (Date.now() / 15) % 40;
                const _chevrons = [];
                for (let d = _tOff; d < _tTotal; d += 40) {
                    let dist = d, pt = null;
                    for (let i = 0; i < _tSegs.length; i++) {
                        if (dist <= _tSegs[i].len) {
                            const t = dist / _tSegs[i].len;
                            pt = { x: _tSegs[i].x + _tSegs[i].dx * t, y: _tSegs[i].y + _tSegs[i].dy * t, angle: Math.atan2(_tSegs[i].dy, _tSegs[i].dx) };
                            break;
                        }
                        dist -= _tSegs[i].len;
                    }
                    if (pt) {
                        const c = Math.cos(pt.angle), s = Math.sin(pt.angle);
                        const r = (lx, ly) => ({ x: lx * c - ly * s + pt.x, y: lx * s + ly * c + pt.y });
                        _chevrons.push([r(-7, -7), r(4, 0), r(-7, 7)]);
                    }
                }
                // Pass 1: black outline
                _tutArrowGfx.lineStyle({ width: 6, color: 0x000000, alpha: 0.9, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND });
                for (const [p0, p1, p2] of _chevrons) {
                    _tutArrowGfx.moveTo(p0.x, p0.y); _tutArrowGfx.lineTo(p1.x, p1.y); _tutArrowGfx.lineTo(p2.x, p2.y);
                }
                // Pass 2: white inner
                _tutArrowGfx.lineStyle({ width: 3, color: 0xffffff, alpha: 1, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND });
                for (const [p0, p1, p2] of _chevrons) {
                    _tutArrowGfx.moveTo(p0.x, p0.y); _tutArrowGfx.lineTo(p1.x, p1.y); _tutArrowGfx.lineTo(p2.x, p2.y);
                }
            }
        }

        // Pixel particles (eating=yellow, drinking=blue) — drawn via shared Graphics before render
        if (!_pixelParticlesGfx) {
            _pixelParticlesGfx = new PIXI.Graphics();
            _pixelParticlesGfx.zIndex = 1999;
            _pixiCont.addChild(_pixelParticlesGfx);
        }
        _pixelParticlesGfx.clear();
        particlesArr.filter(p => p.pixel).forEach(p => {
            const sz = p.size || 3;
            const ry = p.y;
            const col = parseInt((p.color || '#ffffff').replace('#', ''), 16);
            _pixelParticlesGfx.beginFill(col, Math.max(0, Math.min(1, p.life / 0.5)));
            _pixelParticlesGfx.drawRect(p.x - sz / 2, ry - sz / 2, sz, sz);
            _pixelParticlesGfx.endFill();
        });

        // OJO: aquí había un `_pixi.renderer.render(_pixi.stage)` — el escenario
        // WebGL se renderizaba ENTERO dos veces por frame (esta y la de más abajo,
        // tras sincronizar dinero/texto/corazones). El primer render se tiraba
        // sin más: nadie lo lee ni lo presenta, el segundo lo pisa por completo
        // antes de que el navegador muestre el frame. Probablemente quedó de
        // cuando se añadieron dinero/texto/corazones DESPUÉS de este punto y
        // hacía falta un render que los incluyera — pero se añadió uno nuevo al
        // final en vez de mover este de sitio. Con el segundo (línea de más
        // abajo) sobra: ya incluye TODO lo sincronizado hasta ahí, esto y lo que
        // viene después.

        // Money particles rendered above Pixi (zIndex 2000)
        const _tTextFx0 = performance.now();
        const _isMoneyParticle = p => !p.pixel && p.text && (p.text[0] === '+' || p.text[0] === '-') && (p.text.includes('$') || p.text.includes('₺'));
        const _mps = particlesArr.filter(_isMoneyParticle);
        while (_pixiMoneyTexts.length < _mps.length) {
            const _mStyle = new PIXI.TextStyle({ fontFamily: window.P2P_FONT || 'monospace', fontSize: 8, fontWeight: 'bold', fill: 0xffffff, stroke: 0x000000, strokeThickness: 2.5 });
            const _mt = new PIXI.Text('', _mStyle);
            _mt.zIndex = 2000;
            _pixiCont.addChild(_mt);
            _pixiMoneyTexts.push(_mt);
        }
        _pixiMoneyTexts.forEach((t, i) => {
            if (i < _mps.length) {
                const p = _mps[i];
                t.text = p.text;
                t.style.fill = p.color ? parseInt(p.color.replace('#', '0x')) : 0xffffff;
                t.style.fontSize = p.fontSize || window.LAYOUT.SELL_POPUP_FONT_SIZE;
                const ry = p.y - 35 - (4 - p.life) * 10;
                t.position.set(p.x, ry);
                t.alpha = Math.max(0, Math.min(1, p.life));
                t.anchor.set(p.leftAlign ? 0 : p.rightAlign ? 1 : 0.5, 0);
                t.visible = true;
            } else {
                t.visible = false;
            }
        });

        // General particles (non-money, non-heart — hearts handled as sprites below)
        const _isHeart = p => p.text && (p.text.includes('❤') || p.text.includes('❤️'));
        const _gps = particlesArr.filter(p => !p.pixel && !_isHeart(p) && !_isMoneyParticle(p));
        while (_pixiGenTexts.length < _gps.length) {
            const _gStyle = new PIXI.TextStyle({ fontFamily: window.P2P_FONT || 'monospace', fontSize: 8, fontWeight: 'bold', fill: 0xffffff, stroke: 0x000000, strokeThickness: 2.5 });
            const _gt = new PIXI.Text('', _gStyle);
            _gt.zIndex = 2001;
            _pixiCont.addChild(_gt);
            _pixiGenTexts.push(_gt);
        }
        _pixiGenTexts.forEach((t, i) => {
            if (i < _gps.length) {
                const p = _gps[i];
                t.text = p.text;
                t.style.fill = p.color ? parseInt(p.color.replace('#', '0x')) : 0xffffff;
                t.style.fontSize = window.LAYOUT.SELL_POPUP_FONT_SIZE;
                const ry = p.y - 35 - (4 - p.life) * 10;
                t.position.set(p.x, ry);
                t.alpha = Math.max(0, Math.min(1, p.life));
                t.anchor.set(0.5, 0);
                t.visible = true;
            } else {
                t.visible = false;
            }
        });
        _dbgPerfSample('pixiTextFx', performance.now() - _tTextFx0);

        // Heart particles — radial fill (bg dim sprite + fg sprite masked to pie sector)
        const _hps = particlesArr.filter(_isHeart);
        window._dbgHeartCount = _hps.length;
        while (_pixiHearts.length < _hps.length) {
            const bgSp = new PIXI.Sprite(PIXI.Texture.EMPTY);
            const fgSp = new PIXI.Sprite(PIXI.Texture.EMPTY);
            const maskGfx = new PIXI.Graphics();
            fgSp.mask = maskGfx;
            bgSp.zIndex = 2002;
            fgSp.zIndex = 2002;
            maskGfx.zIndex = 2002;
            _pixiCont.addChild(bgSp, fgSp, maskGfx);
            _pixiHearts.push({ bgSp, fgSp, maskGfx });
        }
        const _tHearts0 = performance.now();
        // Con más de 100 gallinas puede haber muchos corazones de caricia a la vez
        // en pantalla en pleno endgame — pedido: que ahí se dibuje un corazón
        // SIMPLE (un solo sprite, sin fondo atenuado ni máscara de relleno radial)
        // en vez del de 3 objetos (bg + fg + Graphics de máscara). La máscara ya no
        // se reconstruye cada frame (ver el comentario de más abajo) pero sigue
        // costando más en la GPU que un sprite plano — por debajo de 100 gallinas
        // el efecto bonito se mantiene, que es cuando de verdad se aprecia.
        const _simpleHearts = chickensArr.length > 100;
        _pixiHearts.forEach((h, i) => {
            if (i < _hps.length && _pixiTex && _pixiTex.heart) {
                const p = _hps[i];
                const ry = p.y - 35 - (4 - p.life) * 10;
                const alpha = Math.max(0, Math.min(1, p.life));
                const hsz = window.GAME_MODE === 'portrait' ? 8 : 4;

                if (_simpleHearts) {
                    h.bgSp.visible = false;
                    h.maskGfx.clear();
                    h._maskParticle = null;
                    h.fgSp.mask = null;
                    h.fgSp.texture = _pixiTex.heart;
                    h.fgSp.anchor.set(0.5, 0.5);
                    h.fgSp.position.set(p.x, ry);
                    h.fgSp.width = hsz * 2;
                    h.fgSp.height = hsz * 2;
                    h.fgSp.alpha = alpha;
                    h.fgSp.visible = true;
                    return;
                }
                // Por debajo de 100 gallinas: restaura la máscara por si este slot
                // se usó en modo simple en un frame anterior (gallinas cruzando el
                // umbral de 100 hacia abajo).
                if (h.fgSp.mask !== h.maskGfx) h.fgSp.mask = h.maskGfx;

                const prog = p.heartProgress != null ? p.heartProgress : 1;

                h.bgSp.texture = _pixiTex.heart;
                h.bgSp.anchor.set(0.5, 0.5);
                h.bgSp.position.set(p.x, ry);
                h.bgSp.width = hsz * 2;
                h.bgSp.height = hsz * 2;
                h.bgSp.alpha = alpha * 0.3;
                h.bgSp.visible = true;

                h.fgSp.texture = _pixiTex.heart;
                h.fgSp.anchor.set(0.5, 0.5);
                h.fgSp.position.set(p.x, ry);
                h.fgSp.width = hsz * 2;
                h.fgSp.height = hsz * 2;
                h.fgSp.alpha = alpha;
                h.fgSp.visible = prog > 0;

                // heartProgress se fija UNA vez al nacer el corazón (ver el push a
                // particlesArr más abajo) y ya no cambia — lo único que varía cada
                // frame es la posición (flota hacia arriba). Antes se hacía
                // clear()+moveTo()+arc()+fill() —reconstruir la geometría entera del
                // sector— 60 veces por segundo por corazón SOLO para seguir la
                // posición. Ahora el arco se dibuja UNA vez centrado en (0,0) por
                // cada combinación (partícula, prog, hsz) y cada frame solo se
                // reposiciona el Graphics entero vía .position — un simple update de
                // transform, no una reconstrucción de geometría.
                if (h._maskParticle !== p || h._maskProg !== prog || h._maskHsz !== hsz) {
                    h._maskParticle = p;
                    h._maskProg = prog;
                    h._maskHsz = hsz;
                    h.maskGfx.clear();
                    if (prog > 0) {
                        h.maskGfx.beginFill(0xffffff);
                        h.maskGfx.moveTo(0, 0);
                        h.maskGfx.arc(0, 0, hsz * 2.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
                        h.maskGfx.closePath();
                        h.maskGfx.endFill();
                    }
                }
                h.maskGfx.position.set(p.x, ry);
            } else {
                h.bgSp.visible = false;
                h.fgSp.visible = false;
                h.maskGfx.clear();
                h._maskParticle = null;
            }
        });
        _dbgPerfSample('pixiHearts', performance.now() - _tHearts0);

        const _tRender0 = performance.now();
        _pixi.renderer.render(_pixi.stage);
        _dbgPerfSample('pixiRender', performance.now() - _tRender0);

        // ── Debug overlay (F6) — dibujado sobre PixiJS en el bubble canvas ────
        if (_bubbleCtx) {
            if (_bubbleCanvas.width !== canvas.width) _bubbleCanvas.width = canvas.width;
            if (_bubbleCanvas.height !== canvas.height) _bubbleCanvas.height = canvas.height;
            _bubbleCtx.setTransform(1, 0, 0, 1, 0, 0);
            _bubbleCtx.clearRect(0, 0, _bubbleCanvas.width, _bubbleCanvas.height);
            _bubbleCtx.imageSmoothingEnabled = false;

            // HUD permanente: versión+FPS (top right) y tiempo+modo+dinero (top left)
            // Oculto en portrait (build de tienda) — solo visible en desktop para depurar.
            if (!_captureModeHidden && window.GAME_MODE !== 'portrait') {
            const dc = _bubbleCtx;
            const _hudPortrait = window.GAME_MODE === 'portrait';
            const fontSize = _hudPortrait ? 10 : (8 * (window.P2P_SCALE || 1));
            const _topY = (() => {
                if (!_hudPortrait) return 4;
                const _cr  = canvas.getBoundingClientRect();
                const _hdr = document.querySelector('header');
                const _hdrBot = _hdr ? _hdr.getBoundingClientRect().bottom : _cr.top;
                const _scale  = _cr.height > 0 ? _cr.height / canvas.height : 1;
                return Math.round(Math.max(0, _hdrBot - _cr.top) / _scale) + 15;
            })();
            dc.font = `${fontSize}px "${window.P2P_FONT || 'Press Start 2P'}"`;
            dc.textBaseline = 'top';
            dc.textAlign = 'left';
            const pad = 6, barH = fontSize + pad * 2;

            const verStr = `v1.5.1 | ${window.GameEngine.getFps()} FPS`;
            const verW = dc.measureText(verStr).width;
            const bx = canvas.width - 4 - pad - verW - pad;
            dc.fillStyle = 'rgba(0,0,0,0.55)';
            dc.fillRect(bx, _topY, pad + verW + pad, barH);
            dc.fillStyle = 'rgba(255,255,255,0.7)';
            dc.fillText(verStr, bx + pad, _topY + pad);

            const hrs = Math.floor((state.playTime || 0) / 3600);
            const mins = Math.floor(((state.playTime || 0) % 3600) / 60);
            const secs = Math.floor((state.playTime || 0) % 60);
            const timeStr = (hrs > 0 ? `${hrs}:` : '') + `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            const valStr = `${getCurrencySym()}${fmtMoney(state.totalEarnings || 0)}`;
            const _isTrMode = window.currentLang === 'tr';
            let modeLabel = '', modeCol = '#ffffff';
            if (state.isSpeedrunMode) { modeLabel = _isTrMode ? 'HIZLI KOŞU' : 'SPEEDRUN'; modeCol = Date.now() % 1000 < 500 ? '#e74c3c' : '#c0392b'; }
            else if (state.activeChallenge === 'adam') { modeLabel = _isTrMode ? 'ADEM İLE HAVVA' : 'ADAM & EVE'; modeCol = '#f39c12'; }
            else if (state.activeChallenge === 'manual') { modeLabel = _isTrMode ? 'YUMURTA İZDİHAMI' : 'EGG JAM'; modeCol = '#3498db'; }
            else if (state.activeChallenge === 'endless') { modeLabel = _isTrMode ? 'SONSUZ ÇİFTLİK' : 'ENDLESS'; modeCol = '#9b59b6'; }
            else { modeLabel = _isTrMode ? 'SAKİN MOD' : 'CLASSIC'; modeCol = '#aaaaaa'; }
            const gap = 12;
            const timeW = dc.measureText(timeStr).width;
            const modeW = dc.measureText(modeLabel).width;
            const valW = dc.measureText(valStr).width;
            const barW = pad + timeW + gap + modeW + gap + valW + pad;
            dc.fillStyle = 'rgba(0,0,0,0.55)';
            dc.fillRect(4, _topY, barW, barH);
            let cx = 4 + pad;
            dc.fillStyle = '#ffffff'; dc.fillText(timeStr, cx, _topY + pad); cx += timeW + gap;
            dc.fillStyle = modeCol;   dc.fillText(modeLabel, cx, _topY + pad); cx += modeW + gap;
            dc.fillStyle = '#f1c40f'; dc.fillText(valStr, cx, _topY + pad);
            }
        }
        if (_debugBoxCol && _bubbleCtx) {
            const dc = _bubbleCtx;

            dc.save();
            dc.font = 'bold 16px monospace';
            dc.lineWidth = 4;
            dc.setLineDash([]);

            const isPortrait = window.GAME_MODE === 'portrait';
            const L = window.LAYOUT;

            // ── 1. Límites de caminata de gallinas (rojo) ──────────────────────
            dc.strokeStyle = 'rgba(255,0,0,0.75)';
            dc.fillStyle = 'rgba(255,0,0,0.75)';
            dc.setLineDash([4, 4]);
            dc.beginPath();
            dc.moveTo(0, 40); dc.lineTo(canvas.width, 40);
            dc.moveTo(0, MEADOW_LIMIT_Y); dc.lineTo(canvas.width, MEADOW_LIMIT_Y);
            dc.stroke();
            dc.setLineDash([]);
            dc.fillText('GALLINAS TOP (Y=40)', 4, 36);
            dc.fillText('GALLINAS BOTTOM (Y=' + MEADOW_LIMIT_Y + ')', 4, MEADOW_LIMIT_Y - 2);

            // ── 2. Suelo de huevos / cinta superior (cian) ─────────────────────
            dc.strokeStyle = 'rgba(0,255,255,0.85)';
            dc.fillStyle = 'rgba(0,255,255,0.85)';
            dc.setLineDash([4, 4]);
            dc.beginPath();
            dc.moveTo(0, EGG_LIMIT_Y); dc.lineTo(canvas.width, EGG_LIMIT_Y);
            dc.stroke();
            dc.setLineDash([]);
            dc.fillText('SUELO HUEVOS / CINTA GRANJA (Y=' + EGG_LIMIT_Y + ')', 4, EGG_LIMIT_Y - 2);

            // ── 3. Límites del sótano (verde) ───────────────────────────────────
            dc.strokeStyle = 'rgba(0,200,80,0.7)';
            dc.fillStyle = 'rgba(0,200,80,0.7)';
            dc.setLineDash([4, 4]);
            dc.beginPath();
            dc.moveTo(0, UNDERGROUND_CEILING_Y); dc.lineTo(canvas.width, UNDERGROUND_CEILING_Y);
            dc.moveTo(0, UNDERGROUND_FLOOR_Y); dc.lineTo(canvas.width, UNDERGROUND_FLOOR_Y);
            dc.stroke();
            dc.setLineDash([]);
            dc.fillText('TECHO SOTANO (Y=' + UNDERGROUND_CEILING_Y + ')', 4, UNDERGROUND_CEILING_Y + 10);
            dc.fillText('SUELO SOTANO (Y=' + UNDERGROUND_FLOOR_Y + ')', 4, UNDERGROUND_FLOOR_Y - 2);

            // ── 4. Pasadizos / huecos (naranja) ────────────────────────────────
            const holeH = UNDERGROUND_CEILING_Y - EGG_LIMIT_Y;
            dc.strokeStyle = 'rgba(255,140,0,0.8)';
            dc.fillStyle = 'rgba(255,140,0,0.8)';
            dc.strokeRect(0, EGG_LIMIT_Y, L.HOLE_LEFT_X, holeH);
            dc.fillText('HUECO IZQ', 2, EGG_LIMIT_Y + 18);
            const holeRX = canvas.width - L.HOLE_RIGHT_MARGIN;
            dc.strokeRect(holeRX, EGG_LIMIT_Y, L.HOLE_RIGHT_MARGIN, holeH);
            dc.fillText('HUECO DER', holeRX + 2, EGG_LIMIT_Y + 18);

            // ── 5. Cinta de la granja (azul) ────────────────────────────────────
            const beltScale = Math.max(0.01, L.BELT_SCALE || 2.0);
            const beltH_px = 16 * beltScale;
            const farmBeltBaseY = isPortrait ? (L.PORTRAIT_FARM_BELT_Y || EGG_LIMIT_Y) : EGG_GROUND_Y;
            const farmBeltX = L.HOLE_LEFT_X - 4;
            const farmBeltW = canvas.width - L.HOLE_RIGHT_MARGIN - farmBeltX + 4;
            dc.strokeStyle = 'rgba(50,120,255,0.85)';
            dc.fillStyle = 'rgba(50,120,255,0.85)';
            dc.strokeRect(farmBeltX, farmBeltBaseY, farmBeltW, beltH_px);
            dc.fillText('CINTA GRANJA', farmBeltX + 2, farmBeltBaseY + 10);

            // ── 6. Cinta del sótano / venta (violeta) ───────────────────────────
            const sellBeltX = L.BELT_SELL_START - 7;
            const sellBeltW = canvas.width - L.HOLE_RIGHT_MARGIN - sellBeltX - (L.BELT_END_PAD || 0);
            dc.strokeStyle = 'rgba(180,50,255,0.85)';
            dc.fillStyle = 'rgba(180,50,255,0.85)';
            dc.strokeRect(sellBeltX, UNDERGROUND_FLOOR_Y - beltH_px, sellBeltW, beltH_px);
            dc.fillText('CINTA VENTA', sellBeltX + 2, UNDERGROUND_FLOOR_Y - beltH_px + 10);

            // ── 7. Zona de mercado (amarillo) ────────────────────────────────────
            dc.strokeStyle = 'rgba(255,230,0,0.8)';
            dc.fillStyle = 'rgba(255,230,0,0.8)';
            dc.strokeRect(0, 0, L.MARKET_MARGIN, canvas.height);
            dc.fillText('MERCADO', 2, 20);

            // ── 8. Bebedero — sprite visual (blanco) + colisión física (amarillo) ──
            const wVB = _waterTroughVisualBounds;
            const wwTrough = wVB ? wVB.h : _troughH(state.maxWater, state.maxWaterLevel || 0);
            const wyWater = wVB ? wVB.y : (L.TROUGH_CENTER_Y - wwTrough / 2);
            if (wVB) {
                dc.strokeStyle = 'rgba(255,255,255,0.6)';
                dc.strokeRect(wVB.x, wVB.y, wVB.w, wVB.h);
            }
            let physWX = L.TROUGH_WATER_PHYS_X, physWW = L.TROUGH_WATER_PHYS_W;
            let physWY = wyWater - 5, physWH = wwTrough + 10;
            if (isPortrait && !wVB) {
                const rightEdge = L.TROUGH_WATER_X + L.TROUGH_W / 2 + (L.TROUGH_W / 2) * 1.5 - 15;
                physWW = rightEdge - physWX;
                physWH *= 1.5; physWY = L.TROUGH_CENTER_Y - physWH / 2;
            }
            dc.strokeStyle = 'rgba(255,255,0,0.85)';
            dc.fillStyle = 'rgba(255,255,0,0.85)';
            dc.strokeRect(physWX, physWY, physWW, physWH);
            dc.fillText('COLISION AGUA', physWX + 2, physWY + 10);

            // ── 8b. Bebedero — zona clicable (naranja) ───────────────────────────
            const cwW = isPortrait ? (L.PORTRAIT_TROUGH_WATER_CLICK_WIDTH || 80) : L.TROUGH_WATER_CLICK_X2;
            let cwY1, cwY2;
            if (wVB) {
                cwY1 = wVB.y - (isPortrait ? (L.PORTRAIT_TROUGH_CLICK_TOP_OFFSET || 0) : 0);
                cwY2 = wVB.y + wVB.h + (isPortrait ? (L.PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET || 0) : 18);
            } else if (isPortrait) {
                const sh = wwTrough * 1.5, sty = L.TROUGH_CENTER_Y - sh / 2;
                cwY1 = sty - (L.PORTRAIT_TROUGH_CLICK_TOP_OFFSET || 0);
                cwY2 = sty + sh + (L.PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET || 0);
            } else { cwY1 = wyWater - 5; cwY2 = wyWater + wwTrough + 5; }
            dc.strokeStyle = 'rgba(255,127,0,0.9)';
            dc.fillStyle = 'rgba(255,127,0,0.9)';
            dc.strokeRect(0, cwY1, cwW, cwY2 - cwY1);
            dc.fillText('CLICK AGUA', 2, cwY1 + 10);

            // ── 9. Comedero — sprite visual (blanco) + colisión física (amarillo) ──
            const fVB = _foodTroughVisualBounds;
            const ffTrough = fVB ? fVB.h : _troughH(state.maxFood, state.maxFoodLevel || 0);
            const wyFood = fVB ? fVB.y : (L.TROUGH_CENTER_Y - ffTrough / 2);
            if (fVB) {
                dc.strokeStyle = 'rgba(255,255,255,0.6)';
                dc.strokeRect(fVB.x, fVB.y, fVB.w, fVB.h);
            }
            let physFX = L.TROUGH_FOOD_PHYS_X, physFW = L.TROUGH_FOOD_PHYS_W;
            let physFY = wyFood - 5, physFH = ffTrough + 10;
            if (isPortrait && !fVB) {
                const leftEdge = L.TROUGH_FOOD_X + L.TROUGH_W / 2 - (L.TROUGH_W / 2) * 1.5 + 15;
                physFW = (physFX + physFW) - leftEdge; physFX = leftEdge;
                physFH *= 1.5; physFY = L.TROUGH_CENTER_Y - physFH / 2;
            }
            dc.strokeStyle = 'rgba(255,255,0,0.85)';
            dc.fillStyle = 'rgba(255,255,0,0.85)';
            dc.strokeRect(physFX, physFY, physFW, physFH);
            dc.fillText('COLISION COMIDA', physFX + 2, physFY + 10);

            // ── 9b. Comedero — zona clicable (naranja) ───────────────────────────
            const cfW = isPortrait ? (L.PORTRAIT_TROUGH_FOOD_CLICK_WIDTH || 80) : (canvas.width - L.TROUGH_FOOD_CLICK_X1);
            let cfY1, cfY2;
            if (fVB) {
                cfY1 = fVB.y - (isPortrait ? (L.PORTRAIT_TROUGH_CLICK_TOP_OFFSET || 0) : 0);
                cfY2 = fVB.y + fVB.h + (isPortrait ? (L.PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET || 0) : 18);
            } else if (isPortrait) {
                const sh = ffTrough * 1.5, sty = L.TROUGH_CENTER_Y - sh / 2;
                cfY1 = sty - (L.PORTRAIT_TROUGH_CLICK_TOP_OFFSET || 0);
                cfY2 = sty + sh + (L.PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET || 0);
            } else { cfY1 = wyFood - 5; cfY2 = wyFood + ffTrough + 5; }
            dc.strokeStyle = 'rgba(255,127,0,0.9)';
            dc.fillStyle = 'rgba(255,127,0,0.9)';
            dc.strokeRect(canvas.width - cfW, cfY1, cfW, cfY2 - cfY1);
            dc.fillText('CLICK COMIDA', canvas.width - cfW + 2, cfY1 + 10);

            // ── 10. Máquinas del sótano (magenta) ────────────────────────────────
            dc.strokeStyle = 'rgba(255,0,220,0.75)';
            dc.fillStyle = 'rgba(255,0,220,0.75)';
            const ugH = UNDERGROUND_FLOOR_Y - UNDERGROUND_CEILING_Y;
            const _mbox = (x1, x2, label) => {
                dc.strokeRect(x1, UNDERGROUND_CEILING_Y, x2 - x1, ugH);
                dc.fillText(label, x1 + 2, UNDERGROUND_CEILING_Y + 10);
            };
            _mbox(L.WASHER_X1, L.WASHER_X2, 'LAVADORA');
            _mbox(L.STAMPER_X1, L.STAMPER_X2, 'SELLADORA');
            _mbox(L.PACKAGER_X1, L.PACKAGER_X2, 'EMPAQUETADORA');
            _mbox(L.RIBBON_X1, L.RIBBON_X2, 'RIBBON/PREMIA');
            _mbox(L.SORTER_ENTRY_X, L.SORTER_ENTRY_X + L.SORTER_MACHINE_W, 'CLASIFICADOR');

            dc.restore();
        }
        // ── Rooster debug labels (F6) ────────────────────────────────────────
        if (_debugBoxCol && _bubbleCtx && roostersArr.length > 0) {
            const dc = _bubbleCtx;
            dc.save();
            dc.textAlign = 'center';
            dc.textBaseline = 'top';
            roostersArr.forEach(function(r, ri) {
                const mt    = Math.ceil(Math.max(0, r.mateTimer || 0));
                const mtStr = mt > 0 ? 'MATE IN: ' + mt + 's' : '>>> LISTO <<<';
                const act   = (r.action || '?').toUpperCase();
                const chkStr = 'POLLITOS: ' + chicksArr.length;
                const bw = 170, bh = 52;
                const rx = Math.max(bw / 2 + 2, Math.min(canvas.width - bw / 2 - 2, r.x));
                const ry = Math.min(r.y + 20, canvas.height - bh - 4);
                dc.fillStyle = 'rgba(0,0,0,0.80)';
                dc.fillRect(rx - bw / 2, ry, bw, bh);
                dc.font = 'bold 10px monospace';
                dc.fillStyle = '#ff0';
                dc.fillText('GALLO ' + (ri + 1) + ': ' + act, rx, ry + 4);
                dc.font = 'bold 11px monospace';
                dc.fillStyle = mt > 0 ? '#0f0' : '#f0f';
                dc.fillText(mtStr, rx, ry + 18);
                dc.font = 'bold 10px monospace';
                dc.fillStyle = '#0cf';
                dc.fillText(chkStr, rx, ry + 34);
            });
            dc.restore();
            // Update live section in F6 panel
            if (_debugPanel && _debugPanel.style.display !== 'none') {
                let _rl = document.getElementById('debug-rooster-live');
                if (!_rl) {
                    _rl = document.createElement('div');
                    _rl.id = 'debug-rooster-live';
                    _rl.style.cssText = 'border-top:1px solid #0f0;margin-top:6px;padding-top:6px;color:#0cf;font-size:7px;white-space:pre;line-height:1.6;';
                    _debugPanel.appendChild(_rl);
                }
                _rl.textContent = '── GALLOS ──\n' + roostersArr.map(function(r, i) {
                    const mt = Math.ceil(Math.max(0, r.mateTimer || 0));
                    return 'GALLO ' + (i + 1) + ': ' + (r.action || '?') +
                        '\n  mate timer : ' + mt + 's' +
                        '\n  pollitos   : ' + chicksArr.length;
                }).join('\n');
            }
        }
    }
    // ────────────────────────────────────────────────────────────────────────

    function _fitBubble(inner) {
        if (!inner) return;
        const ch = inner.clientHeight, cw = inner.clientWidth;
        if (ch === 0 || cw === 0) return;
        const textDiv = inner.querySelector('div') || inner;
        const txt = (textDiv.textContent || '').trim();
        if (!txt) return;
        if (inner._fitH === ch && inner._fitW === cw && inner._fitTxt === txt) return;
        const cs = getComputedStyle(inner);
        const availH = ch - parseFloat(cs.paddingTop)  - parseFloat(cs.paddingBottom);
        const availW = cw - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const MAX = 30, MIN = 5;
        let chosen = MIN;
        for (let s = MAX; s >= MIN; s--) {
            textDiv.style.fontSize = s + 'px';
            if (textDiv.scrollHeight <= availH && textDiv.scrollWidth <= availW) { chosen = s; break; }
        }
        textDiv.style.fontSize = '';
        inner.style.fontSize = chosen + 'px';
        inner._fitH = ch; inner._fitW = cw; inner._fitTxt = txt;
    }

    // Altura del bocadillo "hola soy X" sobre la gallina, en px de canvas.
    // Súbelo para separarlo más de la gallina, bájalo para pegarlo.
    const _NAME_BUBBLE_Y_OFFSET = 30;
    // Duración del bocadillo de aviso "hay otros modos" — más larga que la de
    // los 5.0s del nombre porque el texto es una frase completa, no un nombre.
    const _HINT_BUBBLE_DURATION = 7.0;

    function _updateChickenNameBubbles() {
        if (_captureModeHidden) {
            for (const c of chickensArr) {
                if (c.nameBubbleEl) { c.nameBubbleEl.remove(); c.nameBubbleEl = null; }
            }
            return;
        }
        const rect = canvas.getBoundingClientRect();
        const _MAX_BUBBLES = 5;
        let _activeBubbles = 0;
        for (const c of chickensArr) { if (c.nameBubbleEl instanceof Element) _activeBubbles++; }
        for (const c of chickensArr) {
            if (c.nameBubbleTimer > 0 && !c.nameBubbleEl) {
                if (_activeBubbles >= _MAX_BUBBLES) { c.nameBubbleTimer -= (1 / 60); continue; }
                const el = document.createElement('div');
                el.style.cssText = 'display:block;position:fixed;pointer-events:none;z-index:9000;' +
                    'font-family:\'Press Start 2P\',cursive;color:#222;background:#fff;' +
                    'border:3px solid #333;border-radius:4px;box-shadow:3px 3px 0 #333;' +
                    'overflow:visible;box-sizing:border-box;padding:6px 10px;' +
                    'white-space:nowrap;font-size:7px;line-height:1.7;text-align:center;';
                el.innerHTML = `${window.t('heyMyNameIs')}<br><span style="color:#c0392b;font-size:8px">${c.chickenName}</span>`;
                const ar1 = document.createElement('div');
                ar1.style.cssText = 'position:absolute;bottom:-11px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:11px solid #333;';
                const ar2 = document.createElement('div');
                ar2.style.cssText = 'position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #fff;';
                el.appendChild(ar1);
                el.appendChild(ar2);
                document.body.appendChild(el);
                c.nameBubbleEl = el;
                _activeBubbles++;
            }
            if (c.nameBubbleEl && !(c.nameBubbleEl instanceof Element)) c.nameBubbleEl = null;
            if (c.nameBubbleEl) {
                if (c.nameBubbleTimer > 0) {
                    c.nameBubbleTimer -= (1 / 60); // aprox dt
                    const sx = rect.left + (c.x / canvas.width) * rect.width;
                    const sy = rect.top + ((c.y - _NAME_BUBBLE_Y_OFFSET) / canvas.height) * rect.height;
                    const el = c.nameBubbleEl;
                    el.style.left = (sx - el.offsetWidth / 2) + 'px';
                    el.style.top  = (sy - el.offsetHeight) + 'px';
                    el.style.opacity = c.nameBubbleTimer < 0.5 ? Math.max(0, c.nameBubbleTimer / 0.5) : 1;
                } else {
                    c.nameBubbleEl.remove();
                    c.nameBubbleEl = null;
                }
            }
        }
    }

    // Aviso "hay otros modos de juego" (solo CrazyGames, ver window._cgMarkOtherModesSeen
    // más abajo) — campos PARALELOS a nameBubbleTimer/nameBubbleEl a propósito: una
    // gallina puede estar mostrando su bocadillo de nombre justo cuando toca este aviso,
    // y reutilizar el mismo slot lo pisaría o lo saltaría.
    function _updateChickenHintBubbles() {
        if (_captureModeHidden) {
            for (const c of chickensArr) {
                if (c.hintBubbleEl) { c.hintBubbleEl.remove(); c.hintBubbleEl = null; }
            }
            return;
        }
        const rect = canvas.getBoundingClientRect();
        const _MAX_HINT_BUBBLES = 5;
        let _activeHintBubbles = 0;
        for (const c of chickensArr) { if (c.hintBubbleEl instanceof Element) _activeHintBubbles++; }
        for (const c of chickensArr) {
            if (c.hintBubbleTimer > 0 && !c.hintBubbleEl) {
                if (_activeHintBubbles >= _MAX_HINT_BUBBLES) { c.hintBubbleTimer -= (1 / 60); continue; }
                const el = document.createElement('div');
                el.style.cssText = 'display:block;position:fixed;pointer-events:none;z-index:9000;' +
                    'font-family:\'Press Start 2P\',cursive;color:#222;background:#fff;' +
                    'border:3px solid #333;border-radius:4px;box-shadow:3px 3px 0 #333;' +
                    'overflow:visible;box-sizing:border-box;padding:6px 10px;' +
                    'white-space:nowrap;font-size:7px;line-height:1.7;text-align:center;';
                el.innerHTML = window.t('otherModesHint');
                const ar1 = document.createElement('div');
                ar1.style.cssText = 'position:absolute;bottom:-11px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:11px solid #333;';
                const ar2 = document.createElement('div');
                ar2.style.cssText = 'position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #fff;';
                el.appendChild(ar1);
                el.appendChild(ar2);
                document.body.appendChild(el);
                c.hintBubbleEl = el;
                _activeHintBubbles++;
            }
            if (c.hintBubbleEl && !(c.hintBubbleEl instanceof Element)) c.hintBubbleEl = null;
            if (c.hintBubbleEl) {
                if (c.hintBubbleTimer > 0) {
                    c.hintBubbleTimer -= (1 / 60);
                    const sx = rect.left + (c.x / canvas.width) * rect.width;
                    const sy = rect.top + ((c.y - _NAME_BUBBLE_Y_OFFSET) / canvas.height) * rect.height;
                    const el = c.hintBubbleEl;
                    el.style.left = (sx - el.offsetWidth / 2) + 'px';
                    el.style.top  = (sy - el.offsetHeight) + 'px';
                    el.style.opacity = c.hintBubbleTimer < 0.5 ? Math.max(0, c.hintBubbleTimer / 0.5) : 1;
                } else {
                    c.hintBubbleEl.remove();
                    c.hintBubbleEl = null;
                }
            }
        }
    }

    function _updateTutorialBubbles() {
        const _wb = document.getElementById('water-bubble');
        if (_wb) {
            const _wShow = state.water <= 0 && !(state.autoWaterLevel > 0);
            _wb.style.display = _wShow ? 'block' : 'none';
            _wb._vf = _wShow ? (_wb._vf || 0) + 1 : 0;
            if (_wShow) {
                const _wt = document.getElementById('water-bubble-text');
                if (_wt) _wt.innerHTML = `${window.t ? window.t("waterEmpty") : "Water empty,"}<br>${window.t ? window.t("clickToRefill") : "click to refill"} (${_refillCost()})`;
                const _wr = canvas.getBoundingClientRect();
                _wb.style.position = 'fixed';
                if (_waterTroughVisualBounds) {
                    const _wtb = _waterTroughVisualBounds;
                    const _tipX = _wr.left + (_wtb.x + _wtb.w / 2) / canvas.width  * _wr.width;
                    const _tipY = _wr.top  + _wtb.y               / canvas.height * _wr.height;
                    _wb.style.left = (_tipX - 16) + 'px';
                    _wb.style.top  = (_tipY - _wb.offsetHeight - 11) + 'px';
                }
                _wb.style.right = '';
                _wb.style.bottom = '';
                // Sin _fitBubble aquí a propósito: agua/comida usan tamaño de fuente FIJO
                // (ver CSS de #water-bubble/#food-bubble en index.html) y es el globo el
                // que crece con el texto — antes cada uno encogía su fuente de forma
                // independiente para caber en una caja fija, y con textos de distinta
                // longitud por idioma acababan con tamaños distintos entre sí.
            }
        }
        const _fb2 = document.getElementById('food-bubble');
        if (_fb2) {
            const _fShow = state.food <= 0 && !(state.autoFoodLevel > 0);
            _fb2.style.display = _fShow ? 'block' : 'none';
            _fb2._vf = _fShow ? (_fb2._vf || 0) + 1 : 0;
            if (_fShow) {
                const _ft = document.getElementById('food-bubble-text');
                if (_ft) _ft.innerHTML = `${window.t ? window.t("foodEmpty") : "Food empty,"}<br>${window.t ? window.t("clickToRefill") : "click to refill"} (${_refillCost()})`;
                const _fr = canvas.getBoundingClientRect();
                _fb2.style.position = 'fixed';
                if (_foodTroughVisualBounds) {
                    const _fvb = _foodTroughVisualBounds;
                    const _tipX = _fr.left + (_fvb.x + _fvb.w / 2) / canvas.width  * _fr.width;
                    const _tipY = _fr.top  + _fvb.y               / canvas.height * _fr.height;
                    _fb2.style.left = (_tipX - (_fb2.offsetWidth - 16)) + 'px';
                    _fb2.style.top  = (_tipY - _fb2.offsetHeight - 11) + 'px';
                }
                _fb2.style.right = '';
                _fb2.style.bottom = '';
                // Ver comentario equivalente en el bloque de water-bubble de arriba.
            }
        }
        const _flowerBubble = document.getElementById('flower-bubble');
        if (_flowerBubble) {
            const _fbShow = (chickensArr.length === 0 && (state.playTime || 0) > 3 && (state.eggsSold || 0) === 0);
            _flowerBubble.style.display = _fbShow ? 'block' : 'none';
            _flowerBubble._vf = _fbShow ? (_flowerBubble._vf || 0) + 1 : 0;
            if (_fbShow) {
                const _fbr = canvas.getBoundingClientRect();
                const _fbPortrait = window.GAME_MODE === 'portrait';
                const _fDefs = _fbPortrait ? FLOWER_DEFS_PORTRAIT : FLOWER_DEFS;
                const _fTarget = _fDefs.filter(f => f.type === 0)[1];
                const _fw = _flowerBubble.offsetWidth;
                const _fh = _flowerBubble.offsetHeight;
                if (_fTarget) {
                    const _tipX = _fbr.left + _fTarget.x / canvas.width  * _fbr.width;
                    const _tipY = _fbr.top  + _fTarget.y / canvas.height * _fbr.height;
                    _flowerBubble.style.left = (_tipX - _fw + 28) + 'px';
                    _flowerBubble.style.top  = (_tipY - _fh - 30) + 'px';
                }
                _flowerBubble.style.position = 'fixed';
                _flowerBubble.style.bottom = '';
                _flowerBubble.style.right = '';
                if (_flowerBubble._vf > 1) _fitBubble(_flowerBubble.querySelector('.bubble-inner'));
            }
        }
        const _eggBubbleEl = document.getElementById('egg-bubble');
        if ((state.eggsSold || 0) === 0 && (state.playTime || 0) > 10 && draggedEggs.length === 0) {
            const _tutEgg = eggsArr.find(egg => !egg.collected);
            if (_tutEgg && _eggBubbleEl) {
                const _er = canvas.getBoundingClientRect();
                _eggBubbleEl.style.position = 'fixed';
                const _eggSX = _er.left + _tutEgg.x / canvas.width * _er.width;
                const _eggSY = _er.top  + _tutEgg.y / canvas.height * _er.height;
                _eggBubbleEl.style.left = (_eggSX - _eggBubbleEl.offsetWidth  / 2) + 'px';
                _eggBubbleEl.style.top  = (_eggSY - _eggBubbleEl.offsetHeight - 14) + 'px';
                _eggBubbleEl.style.right = '';
                _eggBubbleEl.style.bottom = '';
                _eggBubbleEl.style.display = 'block';
                _eggBubbleEl._vf = (_eggBubbleEl._vf || 0) + 1;
                if (_eggBubbleEl._vf > 1) _fitBubble(_eggBubbleEl.querySelector('.bubble-inner'));
            } else {
                if (_eggBubbleEl) { _eggBubbleEl.style.display = 'none'; _eggBubbleEl._vf = 0; }
            }
        } else if (_eggBubbleEl) { _eggBubbleEl.style.display = 'none'; _eggBubbleEl._vf = 0; }

        // Contador de tiempo — solo reto Speedrun. Posición/ancho en referencia
        // de canvas (window.LAYOUT.SPEEDRUN_COUNTER_*, ver layout.js/portrait.js).
        // SCALE, ancho y grosor de borde se calculan en PX FINALES y se aplican
        // directamente (width/border-width), NUNCA vía transform:scale(). Un
        // transform:scale() re-escala el elemento ya rasterizado (border-image
        // incluido) como si fuera una imagen — con image-rendering:pixelated eso
        // amplifica el redondeo sub-píxel de cada slice y se ven las rayitas entre
        // ellos. Los botones normales (fuera del canvas) nunca sufren esto porque
        // se dimensionan directamente a su tamaño final de CSS, sin ese paso extra
        // de reescalado; por eso replicamos aquí la misma técnica.
        const _speedrunCounterEl = document.getElementById('speedrun-counter');
        if (_speedrunCounterEl) {
            const _srShow = state.activeChallenge === 'speedrun' || state.isSpeedrunMode;
            _speedrunCounterEl.style.display = _srShow ? 'flex' : 'none';
            if (_srShow) {
                // X e Y usan proporciones INDEPENDIENTES (ancho contra ancho, alto
                // contra alto) — igual que water-bubble/food-bubble más arriba. Con
                // una sola proporción (basada solo en el ancho) para las dos, la Y se
                // descolocaba en cuanto la ventana no mantenía la proporción 800:650
                // exacta del canvas.
                const _scr = canvas.getBoundingClientRect();
                const _scRatioX = _scr.width  / canvas.width;
                const _scRatioY = _scr.height / canvas.height;
                // SCALE también se combina con la proporción canvas→pantalla (por eje),
                // igual que ya hace el ancho — si no, la escala se queda fija sin
                // importar el tamaño de ventana, a diferencia del boombox (que al
                // dibujarse DENTRO del canvas escala solo con él automáticamente).
                const _userScale = window.LAYOUT.SPEEDRUN_COUNTER_SCALE;
                const _finalScaleX = _userScale * _scRatioX;
                const _finalScaleY = _userScale * _scRatioY;
                const _refW = window.LAYOUT.SPEEDRUN_COUNTER_W; // px de referencia, SIN escalar
                const _finalScreenW = _refW * _finalScaleX;
                const _borderX = 8 * _finalScaleX; // 8px = border-width de referencia en CSS
                const _borderY = 8 * _finalScaleY;
                const _screenX = _scr.left + window.LAYOUT.SPEEDRUN_COUNTER_X * _scRatioX;
                const _screenY = _scr.top  + window.LAYOUT.SPEEDRUN_COUNTER_Y * _scRatioY;
                _speedrunCounterEl.style.left = (_screenX - _finalScreenW / 2) + 'px';
                _speedrunCounterEl.style.top  = _screenY + 'px';
                _speedrunCounterEl.style.width = _finalScreenW + 'px';
                _speedrunCounterEl.style.borderLeftWidth = _borderX + 'px';
                _speedrunCounterEl.style.borderRightWidth = _borderX + 'px';
                _speedrunCounterEl.style.borderTopWidth = _borderY + 'px';
                _speedrunCounterEl.style.borderBottomWidth = _borderY + 'px';
                _speedrunCounterEl.style.transform = '';
                const _srTextEl = document.getElementById('speedrun-counter-text');
                if (_srTextEl) {
                    _srTextEl.style.fontSize = (8 * window.LAYOUT.SPEEDRUN_COUNTER_TEXT_SCALE * _finalScaleY) + 'px';
                    // Offset relativo al propio contador, ya en px finales (el padre
                    // ya no tiene transform:scale() que lo re-escale por herencia).
                    _srTextEl.style.transform = 'translateY(' + (window.LAYOUT.SPEEDRUN_COUNTER_TEXT_Y * _finalScaleY) + 'px)';
                    _srTextEl.textContent = formatTimeSecs(state.playTime || 0);
                }
            }
        }
    }

    function draw() {
        if (state.hasRetired) {
            window.FarmCinematic.draw();
            return;
        }

        _updateTutorialBubbles();
        const _tBub0 = performance.now();
        _updateChickenNameBubbles();
        _updateChickenHintBubbles();
        _dbgPerfSample('nameBubbles', performance.now() - _tBub0);

        // ── PixiJS mode: canvas 2D body skipped — all game zone in syncEntityLayer ──
        // HUD (timer, money, FPS) needs to migrate to HTML elements.
        if (_pixi) {
            if (!draw._pixiConfirmed) {
                draw._pixiConfirmed = true;
                console.log('%c[YumurtaFabrikasi] PixiJS active ✓ — canvas 2D draw() skipped', 'color:lime;font-weight:bold');
            }
            ctx.fillStyle = '#6d4c41';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // HUD sobre PixiJS — dibujado en _bubbleCtx (z-index 10)
            if (_bubbleCtx) {
                const dc = _bubbleCtx;
                // Sync dimensions with current canvas in case it was resized after init
                if (_bubbleCanvas.width !== canvas.width) _bubbleCanvas.width = canvas.width;
                if (_bubbleCanvas.height !== canvas.height) _bubbleCanvas.height = canvas.height;
                dc.setTransform(1, 0, 0, 1, 0, 0);
                dc.clearRect(0, 0, _bubbleCanvas.width, _bubbleCanvas.height);
                dc.imageSmoothingEnabled = false;

                if (!_captureModeHidden && window.GAME_MODE !== 'portrait') {
                const _hudPortrait = window.GAME_MODE === 'portrait';
                const fontSize = _hudPortrait ? 10 : (8 * (window.P2P_SCALE || 1));
                const _topY = (() => {
                if (!_hudPortrait) return 4;
                const _cr  = canvas.getBoundingClientRect();
                const _hdr = document.querySelector('header');
                const _hdrBot = _hdr ? _hdr.getBoundingClientRect().bottom : _cr.top;
                const _scale  = _cr.height > 0 ? _cr.height / canvas.height : 1;
                return Math.round(Math.max(0, _hdrBot - _cr.top) / _scale) + 15;
            })();
                dc.font = `${fontSize}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                dc.textBaseline = 'top';
                dc.textAlign = 'left';
                const pad = 6, barH = fontSize + pad * 2;

                // Top right: versión y FPS
                const verStr = `v1.5.1 | ${window.GameEngine.getFps()} FPS`;
                const verW = dc.measureText(verStr).width;
                const bx = canvas.width - 4 - pad - verW - pad;
                dc.fillStyle = 'rgba(0,0,0,0.55)';
                dc.fillRect(bx, _topY, pad + verW + pad, barH);
                dc.fillStyle = 'rgba(255,255,255,0.7)';
                dc.fillText(verStr, bx + pad, _topY + pad);

                // Top left: tiempo, modo, dinero
                const hrs = Math.floor((state.playTime || 0) / 3600);
                const mins = Math.floor(((state.playTime || 0) % 3600) / 60);
                const secs = Math.floor((state.playTime || 0) % 60);
                const timeStr = (hrs > 0 ? `${hrs}:` : '') + `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                const valStr = `${getCurrencySym()}${fmtMoney(state.totalEarnings || 0)}`;
                const _isTrMode2 = window.currentLang === 'tr';
                let modeLabel = '', modeCol = '#ffffff';
                if (state.isSpeedrunMode) { modeLabel = _isTrMode2 ? 'HIZLI KOŞU' : 'SPEEDRUN'; modeCol = Date.now() % 1000 < 500 ? '#e74c3c' : '#c0392b'; }
                else if (state.activeChallenge === 'adam') { modeLabel = _isTrMode2 ? 'ADEM İLE HAVVA' : 'ADAM & EVE'; modeCol = '#f39c12'; }
                else if (state.activeChallenge === 'manual') { modeLabel = _isTrMode2 ? 'YUMURTA İZDİHAMI' : 'EGG JAM'; modeCol = '#3498db'; }
                else if (state.activeChallenge === 'endless') { modeLabel = _isTrMode2 ? 'SONSUZ ÇİFTLİK' : 'ENDLESS'; modeCol = '#9b59b6'; }
                else { modeLabel = _isTrMode2 ? 'SAKİN MOD' : 'CLASSIC'; modeCol = '#aaaaaa'; }
                const gap = 12;
                const timeW = dc.measureText(timeStr).width;
                const modeW = dc.measureText(modeLabel).width;
                const valW = dc.measureText(valStr).width;
                const barW = pad + timeW + gap + modeW + gap + valW + pad;
                dc.fillStyle = 'rgba(0,0,0,0.55)';
                dc.fillRect(4, _topY, barW, barH);
                let cx = 4 + pad;
                dc.fillStyle = '#ffffff'; dc.fillText(timeStr, cx, _topY + pad); cx += timeW + gap;
                dc.fillStyle = modeCol;   dc.fillText(modeLabel, cx, _topY + pad); cx += modeW + gap;
                dc.fillStyle = '#f1c40f'; dc.fillText(valStr, cx, _topY + pad);
                }
            }
            return;
        }

        ctx.imageSmoothingEnabled = false;

        // Clear bubble overlay each frame and reset any accumulated transforms
        if (_bubbleCtx) {
            _bubbleCtx.setTransform(1, 0, 0, 1, 0, 0);
            _bubbleCtx.clearRect(0, 0, _bubbleCanvas.width, _bubbleCanvas.height);
            _bubbleCtx.imageSmoothingEnabled = false;
        }


        // Background drawn by PixiJS (_bgPixiSprite, zIndex -1000)
        // Fallback only when PixiJS unavailable
        if (!_pixi) {
            if (bgSpriteSheet.complete && bgSpriteSheet.naturalWidth > 0) {
                ctx.drawImage(bgSpriteSheet, 0, 0, canvas.width, canvas.height);
            } else {
                ctx.fillStyle = '#7cba3a';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }

        // Sebastian the Cat (Sleeping Easter Egg)
        let catX = window.LAYOUT.CAT_X;
        let catY = window.LAYOUT.CAT_Y;

        if (!_pixi) {
            ctx.save();
            ctx.translate(catX, catY);
            let catScale = (window.LAYOUT && typeof window.LAYOUT.CAT_SCALE === 'number')
                ? window.LAYOUT.CAT_SCALE
                : (window.GAME_MODE === 'portrait' ? 2.25 : 1.0);
            ctx.scale(catScale, catScale);
            if (sebastianSpriteSheet.complete && sebastianSpriteSheet.naturalWidth > 0) {
                const prevSmoothing = ctx.imageSmoothingEnabled;
                ctx.imageSmoothingEnabled = false;
                const CAT_FRAME_W = 50;
                const CAT_FRAME_H = 14;
                const CAT_FRAMES = 6;
                const catFrame = Math.floor(Date.now() / 600) % CAT_FRAMES;
                ctx.drawImage(
                    sebastianSpriteSheet,
                    catFrame * CAT_FRAME_W, 0, CAT_FRAME_W, CAT_FRAME_H,
                    -25, -14, CAT_FRAME_W, CAT_FRAME_H
                );
                ctx.imageSmoothingEnabled = prevSmoothing;
            }

            ctx.restore();
        }

        if (!_pixi && state.hasTvAd) {
            ctx.save();
            let tvX = canvas.width - window.LAYOUT.TV_MARGIN_RIGHT;
            let tvY = window.LAYOUT.TV_Y;
            let tvScale = window.LAYOUT.TV_SCALE || 1.0;

            let tv_cx = tvX + 60;
            let tv_cy = tvY;
            ctx.translate(tv_cx, tv_cy);
            ctx.scale(tvScale, tvScale);
            ctx.translate(-tv_cx, -tv_cy);

            // Ceiling Mount
            ctx.fillStyle = '#222';
            ctx.fillRect(tvX + 55, tvY - 15, 10, 15);

            // TV Outer Frame
            ctx.fillStyle = '#111';
            ctx.fillRect(tvX, tvY, 120, 80);

            // TV Inner Frame
            ctx.fillStyle = '#333';
            ctx.fillRect(tvX + 4, tvY + 4, 112, 72);

            // Screen Glow Background (Green!)
            let glow = Math.sin(Date.now() / 150) * 0.1 + 0.9;
            ctx.fillStyle = `rgba(139, 195, 74, ${glow})`; // Light green
            ctx.fillRect(tvX + 8, tvY + 8, 104, 64);

            // Left Side: Starburst with current bonus %
            ctx.save();
            ctx.translate(tvX + 35, tvY + 40);
            let pulse = Math.sin(Date.now() / 100) * 0.1 + 1;
            ctx.scale(pulse, pulse);

            ctx.fillStyle = '#e53935'; // Red Burst
            ctx.beginPath();
            let spikes = 12;
            let outerR = 22;
            let innerR = 14;
            for (let i = 0; i < spikes * 2; i++) {
                let r = (i % 2 === 0) ? outerR : innerR;
                let a = (i * Math.PI) / spikes;
                if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#ffeb3b'; // Yellow border
            ctx.lineWidth = 2;
            ctx.stroke();

            const _tvPct = state.activeChallenge === 'endless' ? `+${(state.tvAdLevel || 1) * 20}%` : 'x2';
            ctx.fillStyle = '#ffffff';
            ctx.font = `${8 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3;
            ctx.strokeText(_tvPct, 0, 0);
            ctx.fillText(_tvPct, 0, 0);
            ctx.restore();

            // Label del TV eliminado: el % ya se ve dentro del monitor

            // Right Side: Peeking Chicken Head
            ctx.save();
            ctx.translate(tvX + 85, tvY + 72); // Pin to bottom right

            let bobY = Math.abs(Math.sin(Date.now() / 300)) * 6;
            ctx.translate(0, -bobY);

            // Body block
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-16, -24, 32, 24);

            // Head block
            ctx.fillRect(-12, -40, 24, 16);

            // Comb
            ctx.fillStyle = '#e53935';
            ctx.fillRect(-4, -50, 8, 10);
            ctx.fillRect(-10, -45, 6, 5);

            // Beak (Facing Left)
            ctx.fillStyle = '#ffa500';
            ctx.fillRect(-18, -34, 10, 8);

            // Eye (Facing Left)
            ctx.fillStyle = '#000000';
            ctx.fillRect(-6, -36, 4, 4);

            ctx.restore();
            ctx.restore();
        }

        // ── Egg carton (huevera) draw ─────────────────────────────────────────
        function _drawCarton(gx, cX, cY) {
            // gx = ctx (canvas 2D) or null when using PixiJS _boxGfx
            const _inMarket = cX + BOX_W >= canvas.width - window.LAYOUT.MARKET_MARGIN;
            const _drag = _boxDragging;
            const _bodyCol = _drag ? '#e8c87a' : '#d4a84b';

            // Tray body
            if (gx) {
                gx.fillStyle = _bodyCol;
                gx.fillRect(cX, cY, BOX_W, BOX_H);
                // Edge rim
                gx.fillStyle = _drag ? '#c8a040' : '#a07828';
                gx.fillRect(cX, cY, BOX_W, 2);
                gx.fillRect(cX, cY + BOX_H - 2, BOX_W, 2);
                gx.fillRect(cX, cY, 2, BOX_H);
                gx.fillRect(cX + BOX_W - 2, cY, 2, BOX_H);
                // Market glow outline
                if (_inMarket) {
                    gx.strokeStyle = '#22cc44'; gx.lineWidth = 2;
                    gx.strokeRect(cX - 1, cY - 1, BOX_W + 2, BOX_H + 2);
                }
                // Slots
                const _slots = _cartonSlots(cX, cY);
                const _cartonEggs = state.boxEggs || [];
                for (let i = 0; i < _slots.length; i++) {
                    const s = _slots[i];
                    const sX = s.x - CARTON_SLW / 2, sY = s.y - CARTON_SLH / 2;
                    const _eggData = _cartonEggs[i];
                    if (_eggData) {
                        const _base = _eggData.type === 'golden' ? 6 : _eggData.type === 'premium' ? 3 : 0;
                        const _row = _eggData.stamped ? _base + 2 : _eggData.washed ? _base + 1 : _base;
                        if (eggsSpriteSheet.complete && eggsSpriteSheet.naturalWidth) {
                            gx.drawImage(eggsSpriteSheet, (_row % 3) * 28, Math.floor(_row / 3) * 28, 28, 28, s.x - 10, s.y - 10, 20, 20);
                        } else {
                            gx.fillStyle = _eggData.type === 'golden' ? '#ffd700' : _eggData.type === 'premium' ? '#6bb8ff' : '#f0ead0';
                            gx.beginPath(); gx.ellipse(s.x, s.y, CARTON_SLW / 2 - 1, CARTON_SLH / 2 - 1, 0, 0, Math.PI * 2); gx.fill();
                        }
                    } else {
                        gx.fillStyle = '#7a5010';
                        gx.fillRect(sX, sY, CARTON_SLW, CARTON_SLH);
                        gx.fillStyle = 'rgba(0,0,0,0.3)';
                        gx.fillRect(sX, sY, CARTON_SLW, 1);
                        gx.fillRect(sX, sY, 1, CARTON_SLH);
                    }
                }
            }
        }

        if (state.hasBox && !_pixi) {
            _drawCarton(ctx, state.boxX, state.boxY);
        }

        if (state.hasBox && _pixi) {
            if (!_boxGfx) {
                _boxGfx = new PIXI.Graphics();
                _boxGfx.zIndex = 350; // detrás del packager (380) y de los huevos (430+)
                _pixiCont.addChild(_boxGfx);
            }
            _boxGfx.visible = true;
            const _cX = state.boxX, _cY = state.boxY;
            const _inMarket = _cX + BOX_W >= canvas.width - window.LAYOUT.MARKET_MARGIN;
            const _bodyHex = _boxDragging ? 0xe8c87a : 0xd4a84b;
            const _rimHex = _boxDragging ? 0xc8a040 : 0xa07828;
            _boxGfx.clear();
            _boxGfx.beginFill(_bodyHex); _boxGfx.drawRect(_cX, _cY, BOX_W, BOX_H); _boxGfx.endFill();
            _boxGfx.beginFill(_rimHex);
            _boxGfx.drawRect(_cX, _cY, BOX_W, 2);
            _boxGfx.drawRect(_cX, _cY + BOX_H - 2, BOX_W, 2);
            _boxGfx.drawRect(_cX, _cY, 2, BOX_H);
            _boxGfx.drawRect(_cX + BOX_W - 2, _cY, 2, BOX_H);
            _boxGfx.endFill();
            if (_inMarket) { _boxGfx.lineStyle(2, 0x22cc44, 1); _boxGfx.drawRect(_cX - 1, _cY - 1, BOX_W + 2, BOX_H + 2); }
            // Slots
            const _slots = _cartonSlots(_cX, _cY);
            const _cartonEggs = state.boxEggs || [];
            _boxGfx.lineStyle(0);
            for (let i = 0; i < _slots.length; i++) {
                const s = _slots[i];
                const _eggData = _cartonEggs[i];
                if (_eggData) {
                    const _base = _eggData.type === 'golden' ? 6 : _eggData.type === 'premium' ? 3 : 0;
                    const _row = (_eggData.washed && _eggData.stamped) ? _base + 2 : _eggData.washed ? _base + 1 : _base;
                    if (_pixiTex && _pixiTex.egg && _pixiTex.egg[_row]) {
                        // Zoom into egg body; center at frame (14,11), shift +3px down, tall draw to avoid squish
                        const _sc = 0.75, _ecx = 14, _ecy = 11;
                        const _cy2 = s.y + 3;
                        const _m = new PIXI.Matrix(_sc, 0, 0, _sc, s.x - _sc * _ecx, _cy2 - _sc * _ecy);
                        _boxGfx.beginTextureFill({ texture: _pixiTex.egg[_row], matrix: _m });
                        _boxGfx.drawRect(s.x - CARTON_SLW / 2, _cy2 - 7, CARTON_SLW, 14);
                        _boxGfx.endFill();
                    } else if (eggsSpriteSheet.complete && eggsSpriteSheet.naturalWidth) {
                        ctx.drawImage(eggsSpriteSheet, (_row % 3) * 28 + 7, Math.floor(_row / 3) * 28 + 5, 14, 18, s.x - CARTON_SLW / 2, s.y - 4, CARTON_SLW, 14);
                    }
                } else {
                    _boxGfx.beginFill(0x7a5010);
                    _boxGfx.drawRect(s.x - CARTON_SLW / 2, s.y - CARTON_SLH / 2, CARTON_SLW, CARTON_SLH);
                    _boxGfx.endFill();
                }
            }
        } else if (_boxGfx) {
            _boxGfx.visible = false;
        }

        // ── DEBUG: carton entry zone ──────────────────────────────────────────
        if (state.hasBox && _debugBoxCol) {
            const _cX = state.boxX, _cY = state.boxY;
            ctx.save();
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = '#ff2222';
            ctx.fillRect(_cX, _cY - 12, BOX_W, 12); // entry zone above carton
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = '#ff2222';
            ctx.font = 'bold 7px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(window.currentLang === 'tr' ? 'BURAYA BIRAK' : 'DROP HERE', _cX + BOX_W / 2, _cY - 2);
            ctx.restore();
        }


        let drawChicken = (c) => {
            renderChicken(ctx, c);
        };

        let drawChick = (ch) => {
            renderChick(ctx, ch);
        };
        let drawRooster = (r) => {
            renderRooster(ctx, r);
        };
        let drawTombstone = (t) => {
            renderTombstone(t);
        };

        // Depth-sort base Y values (still needed by trough draw code below)
        let waterBaseY = 180 + _troughH(state.maxWater, state.maxWaterLevel || 0) / 2 + 18;
        let foodBaseY = 180 + _troughH(state.maxFood, state.maxFoodLevel || 0) / 2 + 18;

        // Entity shadows — only needed in Canvas 2D fallback (PixiJS sprites carry their own shadows)
        if (!_pixi) {
            const ckScale = window.GAME_MODE === 'portrait' ? 1.5 : 1.0;
            for (let i = 0; i < chicksArr.length; i++) {
                const ch = chicksArr[i];
                const _sw = (ch.squishTimer > 0 ? 13 : 10) * ckScale;
                ctx.fillRect(ch.x - _sw / 2, ch.y + 4, _sw, 3);
            }
            const rstScale = window.GAME_MODE === 'portrait' ? 1.5 : 1.0;
        }

        // Draw Water Trough (LEFT)
        let mWLvl = state.maxWaterLevel || 0;
        let wx = window.LAYOUT.TROUGH_WATER_X;
        const waterTroughDepth = 18;
        const troughScale = 2.5;

        const waterCap = Math.max(1, state.maxWater || 1);
        const waterLevel = Math.max(0, state.maxWaterLevel || 0);
        const waterBodyReady =
            waterTopSpriteSheet.complete && waterTopSpriteSheet.naturalWidth &&
            waterMidSpriteSheet.complete && waterMidSpriteSheet.naturalWidth &&
            waterBottomSpriteSheet.complete && waterBottomSpriteSheet.naturalWidth;
        const troughBaseTopH = (waterBodyReady ? waterTopSpriteSheet.naturalHeight : 16) * troughScale;
        const troughBaseBottomH = (waterBodyReady ? waterBottomSpriteSheet.naturalHeight : 32) * troughScale;
        const troughMidThirdSrcH = (waterBodyReady ? waterMidSpriteSheet.naturalHeight : 16) / 3;
        const troughMidThirdDrawH = troughMidThirdSrcH * troughScale;
        const troughVisualW = (waterBodyReady ? waterTopSpriteSheet.naturalWidth : 16) * troughScale;
        const troughVisualH = troughBaseTopH + troughBaseBottomH + (waterLevel * troughMidThirdDrawH);
        const wyVisual = window.LAYOUT.TROUGH_CENTER_Y - troughVisualH / 2;
        const waterAnimReady = waterAnimSpriteSheet.complete && waterAnimSpriteSheet.naturalWidth;
        const waterAnimX = wx + (window.LAYOUT.TROUGH_WATER_ANIM_X_OFFSET || 0);
        const waterAnimY = wyVisual + (window.LAYOUT.TROUGH_WATER_ANIM_Y_OFFSET || 0);
        const waterAnimScale = window.LAYOUT.TROUGH_WATER_ANIM_SCALE || 1.0;
        const waterAnimTopCrop = window.LAYOUT.TROUGH_WATER_ANIM_TOP_CROP || 0;

        ctx.save();
        if (window.GAME_MODE === 'portrait') {
            ctx.translate(wx + troughVisualW / 2, wyVisual + troughVisualH / 2);
            ctx.scale(1.5, 1.5);
            ctx.translate(-(wx + troughVisualW / 2), -(wyVisual + troughVisualH / 2));
        }

        if (!_pixi && waterBodyReady) {
            const troughTopW = waterTopSpriteSheet.naturalWidth * troughScale;
            const troughMidW = waterMidSpriteSheet.naturalWidth * troughScale;
            const troughBottomW = waterBottomSpriteSheet.naturalWidth * troughScale;

            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(waterTopSpriteSheet, wx, wyVisual, troughTopW, troughBaseTopH);
            for (let i = 0; i < waterLevel; i++) {
                const midSlice = i % 3;
                const midSrcY = (2 - midSlice) * troughMidThirdSrcH;
                const midY = wyVisual + troughBaseTopH + ((waterLevel - 1 - i) * troughMidThirdDrawH);
                ctx.drawImage(
                    waterMidSpriteSheet,
                    0, midSrcY, waterMidSpriteSheet.naturalWidth, troughMidThirdSrcH,
                    wx, midY, troughMidW, troughMidThirdDrawH
                );
            }
            const bottomY = wyVisual + troughBaseTopH + (waterLevel * troughMidThirdDrawH);
            ctx.drawImage(waterBottomSpriteSheet, wx, bottomY, troughBottomW, troughBaseBottomH);
            ctx.restore();
        } else if (!_pixi) {
            const fallbackTopW = 16 * troughScale;
            const fallbackTopH = 16 * troughScale;
            const fallbackMidW = 16 * troughScale;
            const fallbackMidH = (16 / 3) * troughScale;
            const fallbackBottomW = 16 * troughScale;
            const fallbackBottomH = 32 * troughScale;
            ctx.fillStyle = '#8f96a0';
            ctx.fillRect(wx, wyVisual, fallbackTopW, fallbackTopH);
            for (let i = 0; i < waterLevel; i++) {
                ctx.fillRect(wx, wyVisual + fallbackTopH + (i * fallbackMidH), fallbackMidW, fallbackMidH);
            }
            ctx.fillRect(wx, wyVisual + fallbackTopH + (waterLevel * fallbackMidH), fallbackBottomW, fallbackBottomH);
            ctx.strokeStyle = '#6c727c'; ctx.lineWidth = 2; ctx.strokeRect(wx, wyVisual, fallbackBottomW, fallbackTopH + (waterLevel * fallbackMidH) + fallbackBottomH);
            ctx.fillStyle = '#c8cdd3';
            ctx.fillRect(wx + 2, wyVisual + 2, fallbackBottomW - 4, 2);
            ctx.fillRect(wx + 2, wyVisual + fallbackTopH + (waterLevel * fallbackMidH) + 2, fallbackBottomW - 4, 2);
        }

        const waterLayerTop = wyVisual + 3;
        const waterLayerBottom = wyVisual + troughVisualH - 42;
        const waterLayerH = Math.max(0, waterLayerBottom - waterLayerTop);
        const waterFillH = Math.max(0, Math.min(waterLayerH, (state.water / waterCap) * waterLayerH));
        if (!_pixi && waterAnimReady && waterFillH > 0) {
            const waterFrameW = 16;
            const waterFrameH = 16;
            const waterFrames = Math.max(1, Math.floor(waterAnimSpriteSheet.naturalWidth / waterFrameW));
            const waterDrawW = troughVisualW * waterAnimScale;
            const waterDrawH = waterFrameH * troughScale * waterAnimScale;
            const waterLayerBottomAdj = waterLayerBottom + (waterAnimY - wyVisual);
            const waterClipTop = waterLayerBottomAdj - waterFillH + waterAnimTopCrop;
            const waterY0 = waterClipTop;
            const waterBaseFrame = Math.floor(Date.now() / 140) % waterFrames;
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.beginPath();
            ctx.rect(waterAnimX, waterY0, waterDrawW, Math.max(0, waterLayerBottomAdj - waterY0));
            ctx.clip();
            for (let row = 0; row < Math.ceil(waterFillH / waterDrawH); row++) {
                const drawY = waterLayerBottomAdj - ((row + 1) * waterDrawH);
                const frameX = ((waterBaseFrame + row) % waterFrames) * waterFrameW;
                ctx.drawImage(
                    waterAnimSpriteSheet,
                    frameX, 0, waterFrameW, waterFrameH,
                    waterAnimX, drawY, waterDrawW, waterDrawH
                );
            }
            ctx.restore();
        }

        let drawWaterPipe = (cy, flowing) => {
            const faucetScale = window.LAYOUT.FAUCET_SCALE || 1;
            const streamScale = window.LAYOUT.FAUCET_ANIM_SCALE || 1;
            const faucetX = window.LAYOUT.FAUCET_X;
            const faucetY = cy;
            const streamOffsetX = window.LAYOUT.FAUCET_ANIM_X_OFFSET || 0;
            const pipeCenterX = faucetX + 16 * faucetScale;
            const streamX = pipeCenterX + streamOffsetX;
            const streamStartOffset = cy - 10 + (window.LAYOUT.FAUCET_ANIM_Y_OFFSET || 0);
            let streamWidth = 3;
            let time = Date.now() / 1000;

            // Flow (only when dispensing)
            if (flowing > 0) {
                let currentWaterFloor = waterLayerBottom - (state.water / waterCap) * waterLayerH;
                if (currentWaterFloor > waterLayerBottom) currentWaterFloor = waterLayerBottom;
                const streamEnd = Math.max(streamStartOffset, currentWaterFloor + 4);
                let dropDist = currentWaterFloor - streamStartOffset;
                let _wRate = state._autoWaterRate || 0;
                streamWidth = Math.min(10, 3 + _wRate * 0.3);
                ctx.globalAlpha = Math.min(1, flowing / 0.3);
                if (waterAutoWaterSpriteSheet.complete && waterAutoWaterSpriteSheet.naturalWidth) {
                    const _wCols = 3, _wRows = 4;
                    const streamFrameW = Math.max(1, Math.floor(waterAutoWaterSpriteSheet.naturalWidth / _wCols));
                    const streamFrameH = Math.max(1, Math.floor(waterAutoWaterSpriteSheet.naturalHeight / _wRows));
                    const drawW = streamFrameW * streamScale;
                    const drawH = streamFrameH * streamScale;
                    const _wDensityRow = Math.min(3, Math.max(0, (state.autoWaterLevel || 1) - 1));
                    const frameStep = Math.floor(Date.now() / 120) % _wCols;
                    const frameX = frameStep * streamFrameW;
                    const frameY = _wDensityRow * streamFrameH;
                    ctx.save();
                    ctx.imageSmoothingEnabled = false;
                    for (let sy = streamStartOffset; sy < streamEnd; sy += drawH) {
                        const clipH = Math.min(drawH, streamEnd - sy);
                        ctx.drawImage(
                            waterAutoWaterSpriteSheet,
                            frameX, frameY, streamFrameW, streamFrameH,
                            streamX - drawW / 2, sy, drawW, clipH
                        );
                    }
                    ctx.restore();
                } else {
                    ctx.fillStyle = 'rgba(52, 152, 219, 0.8)';
                    ctx.beginPath();
                    ctx.moveTo(streamX - streamWidth, streamStartOffset);
                    ctx.lineTo(streamX + streamWidth, streamStartOffset);
                    ctx.lineTo(streamX + streamWidth + Math.sin(time * 5), streamStartOffset + dropDist);
                    ctx.lineTo(streamX - streamWidth + Math.cos(time * 5), streamStartOffset + dropDist);
                    ctx.fill();
                    ctx.lineWidth = 1.5;
                    let splashPhase = (time * 2) % 1;
                    ctx.strokeStyle = `rgba(133, 193, 233, ${1.0 - splashPhase})`;
                    ctx.beginPath(); ctx.ellipse(streamX, currentWaterFloor, 4 + splashPhase * 12, 1 + splashPhase * 4, 0, 0, Math.PI * 2); ctx.stroke();
                    splashPhase = (time * 2 + 0.5) % 1;
                    ctx.strokeStyle = `rgba(133, 193, 233, ${1.0 - splashPhase})`;
                    ctx.beginPath(); ctx.ellipse(streamX, currentWaterFloor, 4 + splashPhase * 12, 1 + splashPhase * 4, 0, 0, Math.PI * 2); ctx.stroke();
                    ctx.fillStyle = 'rgba(133, 193, 233, 0.9)';
                    for (let i = 0; i < 6; i++) {
                        let phase = (time * 3 + i * (Math.PI * 2 / 6)) % (Math.PI * 2);
                        let dropY = streamStartOffset + (Math.sin(phase) * 0.5 + 0.5) * dropDist;
                        let dropX = streamX + Math.sin(phase * 1.5 + i) * 6;
                        ctx.beginPath(); ctx.arc(dropX, dropY, 2, 0, Math.PI * 2); ctx.fill();
                    }
                }
                ctx.globalAlpha = 1;
            }
            // Grifo encima del chorro
            if (waterAutoSpriteSheet.complete && waterAutoSpriteSheet.naturalWidth) {
                ctx.save();
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(waterAutoSpriteSheet, faucetX, cy - waterAutoSpriteSheet.naturalHeight * faucetScale, waterAutoSpriteSheet.naturalWidth * faucetScale, waterAutoSpriteSheet.naturalHeight * faucetScale);
                ctx.restore();
            }
        };

        // Carved capacity text
        // Cantidad de agua oculta
        {
            const _isE = state.activeChallenge === 'endless';
            const _sm = 1 + (state.musicLevel || 0) * (_isE ? 0.05 : 0.15);
            const _bm = _batchFoodMult();
            const _eCap = 2 * _bm;
            const _eTime = (_eggBaseTime() / _sm);
            const _travelTime = (canvas.width / 2) / (60 * _sm);
            const _chickenCycle = 2 * (_travelTime + 2) + 2 * _eCap * _eTime;
            const _chickenWaterRate = chickensArr.length * (5 * _bm) / _chickenCycle;
            const _awAmt = _isE ? Math.round(5 * Math.pow(1.2, state.autoWaterAmtLevel || 0)) : 5;
            const _autoW = state.autoWaterLevel > 0
                ? (_isE ? _awAmt / Math.max(0.5, 10 * Math.pow(0.90, state.autoWaterLevel - 1)) : _autoRate(state.autoWaterLevel))
                : 0;
            const _netW = _chickenWaterRate - _autoW;
            if (state.autoWaterLevel > 0) {
                const _wSecs = _netW <= 0 ? Infinity : (state.water / Math.max(0.0001, _netW));
                const _wCol = _netW <= 0 ? '#2ecc71' : _wSecs < 600 ? '#e74c3c' : _wSecs < 1800 ? '#e67e22' : _wSecs < 3600 ? '#f1c40f' : '#27ae60';
                ctx.save();
                ctx.beginPath(); ctx.arc(wx + troughVisualW, wyVisual, 5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
                ctx.beginPath(); ctx.arc(wx + troughVisualW, wyVisual, 4, 0, Math.PI * 2);
                ctx.fillStyle = _wCol; ctx.fill();
                ctx.restore();
            }
        }
        ctx.textAlign = 'left';
        ctx.restore();

        // Hover Tooltip — drawn on bubble overlay so it's above PIXI sprites
        let hoverW = troughVisualW;
        let hoverH = troughVisualH + waterTroughDepth;
        let hoverX = wx;
        let hoverY = wyVisual;
        if (window.GAME_MODE === 'portrait') {
            let cx = wx + troughVisualW / 2;
            let cy = wyVisual + (troughVisualH + waterTroughDepth) / 2;
            hoverW = troughVisualW * 1.5;
            hoverH = (troughVisualH + waterTroughDepth) * 1.5;
            hoverX = cx - hoverW / 2;
            hoverY = cy - hoverH / 2;
        }
        let isHoverW = (!state.hasRetired && lastMousePos.x >= 0 && lastMousePos.x <= hoverX + hoverW && lastMousePos.y >= hoverY && lastMousePos.y <= hoverY + hoverH);
        if (isHoverW && _bubbleCtx) {
            const _tc = _bubbleCtx;
            _tc.font = `${11 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
            const _wL1 = `${window.t ? window.t("water") : "WATER:"} ${fmt(Math.floor(state.water))}/${fmt(state.maxWater)}`;
            const _wL2 = `${window.t ? window.t("fill") : "Fill"} +${fmt(_refillAmt())} (${getCurrencySym()}${fmt(_refillCost())})`;
            const _wTW = Math.max(_tc.measureText(_wL1).width, _tc.measureText(_wL2).width) + 14;
            _tc.fillStyle = 'rgba(0,0,0,0.85)';
            _tc.fillRect(wx + troughVisualW + 12, lastMousePos.y - 20, _wTW, 38);
            _tc.strokeStyle = '#3498db'; _tc.lineWidth = 2;
            _tc.strokeRect(wx + troughVisualW + 12, lastMousePos.y - 20, _wTW, 38);
            _tc.fillStyle = '#fff'; _tc.textAlign = 'left';
            _tc.fillText(_wL1, wx + troughVisualW + 18, lastMousePos.y - 6);
            _tc.fillStyle = '#ffeb3b';
            _tc.fillText(_wL2, wx + troughVisualW + 18, lastMousePos.y + 11);
        }

        let physWx = window.LAYOUT.TROUGH_WATER_PHYS_X, physWw = window.LAYOUT.TROUGH_WATER_PHYS_W;

        ctx.textAlign = 'left';

        // Boombox (Radio Cassette) — drawn via depth-sorted _fb below
        function drawBoombox() {
            if (!(state.musicLevel > 0)) return;
            let rx = window.LAYOUT.BOOMBOX_X, ry = window.LAYOUT.BOOMBOX_Y, rw = window.LAYOUT.BOOMBOX_W, rh = window.LAYOUT.BOOMBOX_H;
            ctx.save();
            const boomboxScale = window.LAYOUT.BOOMBOX_SCALE || 1.0;
            ctx.translate(rx + rw / 2, ry + rh / 2);
            ctx.scale(boomboxScale, boomboxScale);
            ctx.translate(-(rx + rw / 2), -(ry + rh / 2));
            if (radioSpriteSheet.complete && radioSpriteSheet.naturalWidth > 0) {
                const prevSmoothing = ctx.imageSmoothingEnabled;
                ctx.imageSmoothingEnabled = false;
                const RADIO_FRAME_W = 40;
                const RADIO_FRAME_H = 32;
                const RADIO_FRAMES = 8;
                const radioFrame = (window.isMusicMuted || window.isBgmMuted) ? 0 : Math.floor(Date.now() / 160) % RADIO_FRAMES;
                ctx.drawImage(
                    radioSpriteSheet,
                    radioFrame * RADIO_FRAME_W, 0, RADIO_FRAME_W, RADIO_FRAME_H,
                    rx, ry, rw, rh
                );
                ctx.imageSmoothingEnabled = prevSmoothing;
            }
            ctx.restore();
        }

        // Draw Food Trough (RIGHT)
        let mFLvl = state.maxFoodLevel || 0;
        let fh = _troughH(state.maxFood, state.maxFoodLevel || 0);
        let fy = window.LAYOUT.TROUGH_CENTER_Y - fh / 2;
        let fx = window.LAYOUT.TROUGH_FOOD_X, fw = window.LAYOUT.TROUGH_W;

        const foodBodyReady =
            feederTopSpriteSheet.complete && feederTopSpriteSheet.naturalWidth &&
            feederMidSpriteSheet.complete && feederMidSpriteSheet.naturalWidth &&
            feederBottomSpriteSheet.complete && feederBottomSpriteSheet.naturalWidth;
        const foodTroughTopH = (foodBodyReady ? feederTopSpriteSheet.naturalHeight : 16) * troughScale;
        const foodTroughBottomH = (foodBodyReady ? feederBottomSpriteSheet.naturalHeight : 32) * troughScale;
        const foodTroughMidSrcH = (foodBodyReady ? feederMidSpriteSheet.naturalHeight : 16) / 3;
        const foodTroughMidDrawH = foodTroughMidSrcH * troughScale;
        const foodTroughVisualW = (foodBodyReady ? feederTopSpriteSheet.naturalWidth : 16) * troughScale;
        const foodTroughVisualH = foodTroughTopH + foodTroughBottomH + (mFLvl * foodTroughMidDrawH);
        const fyVisual = window.LAYOUT.TROUGH_CENTER_Y - foodTroughVisualH / 2;

        // Portrait transform centrado en el comedero visual (no el lógico)
        ctx.save();
        if (window.GAME_MODE === 'portrait') {
            const _visCX = fx + foodTroughVisualW / 2;
            const _visCY = fyVisual + foodTroughVisualH / 2;
            ctx.translate(_visCX, _visCY);
            ctx.scale(1.5, 1.5);
            ctx.translate(-_visCX, -_visCY);
        }

        if (!_pixi && foodBodyReady) {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(feederTopSpriteSheet, fx, fyVisual, foodTroughVisualW, foodTroughTopH);
            for (let i = 0; i < mFLvl; i++) {
                const midSlice = i % 3;
                const midSrcY = (2 - midSlice) * foodTroughMidSrcH;
                const midY = fyVisual + foodTroughTopH + ((mFLvl - 1 - i) * foodTroughMidDrawH);
                ctx.drawImage(
                    feederMidSpriteSheet,
                    0, midSrcY, feederMidSpriteSheet.naturalWidth, foodTroughMidSrcH,
                    fx, midY, foodTroughVisualW, foodTroughMidDrawH
                );
            }
            const foodBottomY = fyVisual + foodTroughTopH + (mFLvl * foodTroughMidDrawH);
            ctx.drawImage(feederBottomSpriteSheet, fx, foodBottomY, foodTroughVisualW, foodTroughBottomH);
            ctx.restore();
        } else if (!_pixi) {
            const fallbackTopW = 16 * troughScale;
            const fallbackTopH = 16 * troughScale;
            const fallbackMidW = 16 * troughScale;
            const fallbackMidH = (16 / 3) * troughScale;
            const fallbackBottomW = 16 * troughScale;
            const fallbackBottomH = 32 * troughScale;
            ctx.fillStyle = '#8f96a0';
            ctx.fillRect(fx, fyVisual, fallbackTopW, fallbackTopH);
            for (let i = 0; i < mFLvl; i++) {
                ctx.fillRect(fx, fyVisual + fallbackTopH + (i * fallbackMidH), fallbackMidW, fallbackMidH);
            }
            ctx.fillRect(fx, fyVisual + fallbackTopH + (mFLvl * fallbackMidH), fallbackBottomW, fallbackBottomH);
            ctx.strokeStyle = '#6c727c'; ctx.lineWidth = 2; ctx.strokeRect(fx, fyVisual, fallbackBottomW, fallbackTopH + (mFLvl * fallbackMidH) + fallbackBottomH);
            ctx.fillStyle = '#c8cdd3';
            ctx.fillRect(fx + 2, fyVisual + 2, fallbackBottomW - 4, 2);
        }

        const foodAnimReady = feederFoodSpriteSheet.complete && feederFoodSpriteSheet.naturalWidth;
        const foodCapReady = feederFoodCapSpriteSheet.complete && feederFoodCapSpriteSheet.naturalWidth;
        const foodAnimX = fx + (window.LAYOUT.FOOD_ANIM_X_OFFSET || 3);
        const foodAnimY = fyVisual + (window.LAYOUT.FOOD_ANIM_Y_OFFSET || 0);
        const foodAnimScale = window.LAYOUT.FOOD_ANIM_SCALE || 0.85;
        const foodAnimTopCrop = window.LAYOUT.FOOD_ANIM_TOP_CROP || 0;
        const foodLayerTop = fyVisual + 3;
        const foodLayerBottom = fyVisual + foodTroughVisualH - 42;
        const foodLayerH = Math.max(0, foodLayerBottom - foodLayerTop);
        const foodRatio = Math.max(0, Math.min(1, state.food / Math.max(1, state.maxFood || 1)));
        const foodFillH = Math.max(0, Math.min(foodLayerH, foodLayerH * foodRatio));
        const foodDrawW = foodTroughVisualW * foodAnimScale;
        const foodDrawH = 16 * troughScale * foodAnimScale;
        const foodLayerBottomAdj = foodLayerBottom + (foodAnimY - fyVisual);
        const foodClipTop = foodLayerBottomAdj - foodFillH + foodAnimTopCrop;
        const foodY0 = foodClipTop;

        if (!_pixi && foodAnimReady && foodFillH > 0) {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.beginPath();
            ctx.rect(foodAnimX, foodY0, foodDrawW, Math.max(0, foodLayerBottomAdj - foodY0));
            ctx.clip();
            const foodFrameW = feederFoodSpriteSheet.naturalWidth || 16;
            const foodFrameH = feederFoodSpriteSheet.naturalHeight || 16;
            const foodFrames = 1;
            const foodBaseFrame = 0;
            for (let row = 0; row < Math.ceil(foodFillH / foodDrawH); row++) {
                const drawY = foodLayerBottomAdj - ((row + 1) * foodDrawH);
                ctx.drawImage(
                    feederFoodSpriteSheet,
                    foodBaseFrame * foodFrameW, 0, foodFrameW, foodFrameH,
                    foodAnimX, drawY, foodDrawW, foodDrawH
                );
            }
            if (foodCapReady) {
                const foodCapH = (feederFoodCapSpriteSheet.naturalHeight || 16) * troughScale * foodAnimScale;
                const capY = foodClipTop - foodCapH;
                ctx.drawImage(feederFoodCapSpriteSheet, foodAnimX, capY, foodDrawW, foodCapH);
            }
            ctx.restore();
        }

        let drawFoodPipe = (cy, flowing) => {
            const pipeScale = window.LAYOUT.FOOD_PIPE_SCALE || 1;
            const streamScale = window.LAYOUT.FOOD_PIPE_ANIM_SCALE || 1;
            const streamOffsetX = window.LAYOUT.FOOD_PIPE_ANIM_X_OFFSET || 0;
            // Anclado al borde derecho del comedero
            const pipeRightX = fx + fw + 16;
            const spriteW = feederAutoSpriteSheet.naturalWidth || 16;
            const pipeCenterX = pipeRightX - (spriteW * pipeScale / 2);
            const streamX = pipeCenterX + streamOffsetX - 12;
            // Flow particles (only when dispensing)
            if (flowing > 0) {
                let streamStartOffset = cy - 10; // boquilla del grifo (-10 ajuste visual)
                let fRatio = state.food / Math.max(1, state.maxFood);
                const _visLayerBottom = fyVisual + foodTroughVisualH - 42;
                const _visLayerH = Math.max(0, _visLayerBottom - (fyVisual + 3));
                let currentFoodFloor = _visLayerBottom - _visLayerH * fRatio;
                if (currentFoodFloor > fyVisual + foodTroughVisualH) currentFoodFloor = fyVisual + foodTroughVisualH;
                let streamEnd = Math.max(streamStartOffset, currentFoodFloor - 19);
                let dropDist = currentFoodFloor - streamStartOffset;
                ctx.globalAlpha = Math.min(1, flowing / 0.3);
                if (feederAutoFoodSpriteSheet.complete && feederAutoFoodSpriteSheet.naturalWidth) {
                    const _fCols = 4, _fRows = 4;
                    const streamFrameW = Math.max(1, Math.floor(feederAutoFoodSpriteSheet.naturalWidth / _fCols));
                    const streamFrameH = Math.max(1, Math.floor(feederAutoFoodSpriteSheet.naturalHeight / _fRows));
                    const drawStreamW = streamFrameW * streamScale;
                    const drawStreamH = streamFrameH * streamScale;
                    const _fDensityRow = Math.min(3, Math.max(0, (state.autoFoodLevel || 1) - 1));
                    const frameStep = Math.max(1, Math.floor(Date.now() / 100));
                    const frameY = _fDensityRow * streamFrameH;
                    ctx.save();
                    ctx.imageSmoothingEnabled = false;
                    for (let sy = streamStartOffset, i = 0; sy < streamEnd; sy += drawStreamH, i++) {
                        const clipH = Math.min(drawStreamH, streamEnd - sy);
                        const frameX = ((frameStep + i) % _fCols) * streamFrameW;
                        ctx.drawImage(
                            feederAutoFoodSpriteSheet,
                            frameX, frameY, streamFrameW, streamFrameH,
                            streamX - drawStreamW / 2, sy, drawStreamW, clipH
                        );
                    }
                    ctx.restore();
                } else {
                    let time = Date.now() / 1000;
                    let _rate = state._autoFoodRate || 0;
                    let numParticles = Math.min(30, Math.max(4, Math.round(4 + _rate)));
                    for (let i = 0; i < numParticles; i++) {
                        let phase = (time * 1.5 + (i / numParticles)) % 1.0;
                        let particleY = streamStartOffset + phase * dropDist;
                        let particleX = pipeCenterX + (Math.sin(i * 74.234 + phase * 2) * 4);
                        let particleSize = 2 + (i % 3 === 0 ? 1 : 0);
                        ctx.fillStyle = (i % 3 === 0) ? '#c8a050' : (i % 3 === 1 ? '#e67e22' : '#f1c40f');
                        ctx.fillRect(particleX, particleY, particleSize, particleSize);
                    }
                }
                ctx.globalAlpha = 1;
            }
            // Comedero encima del chorro, pegado al borde derecho
            if (feederAutoSpriteSheet.complete && feederAutoSpriteSheet.naturalWidth) {
                ctx.save();
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(feederAutoSpriteSheet, pipeRightX - feederAutoSpriteSheet.naturalWidth * pipeScale, cy - feederAutoSpriteSheet.naturalHeight * pipeScale, feederAutoSpriteSheet.naturalWidth * pipeScale, feederAutoSpriteSheet.naturalHeight * pipeScale);
                ctx.restore();
            }
        };

        // Cantidad de comida oculta

        {
            const _isE = state.activeChallenge === 'endless';
            const _sm = 1 + (state.musicLevel || 0) * (_isE ? 0.05 : 0.15);
            const _bm = _batchFoodMult();
            const _eCap = 2 * _bm;
            const _eTime = (_eggBaseTime() / _sm);
            const _travelTime = (canvas.width / 2) / (60 * _sm);
            const _chickenCycle = 2 * (_travelTime + 2) + 2 * _eCap * _eTime;
            const _chickenFoodRate = chickensArr.length * (5 * _bm) / _chickenCycle;
            const _chickCycle = ((_isE ? 50 : 10) + 2.5) / _sm + 2;
            const _chickFoodRate = chicksArr.length * (_isE ? 5 : 10) / _chickCycle;
            const _demandF = _chickenFoodRate + _chickFoodRate;
            const _afAmt = _isE ? Math.round(5 * Math.pow(1.2, state.autoFoodAmtLevel || 0)) : 5;
            const _autoF = state.autoFoodLevel > 0
                ? (_isE ? _afAmt / Math.max(0.5, 10 * Math.pow(0.90, state.autoFoodLevel - 1)) : _autoRate(state.autoFoodLevel))
                : 0;
            const _netF = _demandF - _autoF;
            if (state.autoFoodLevel > 0) {
                const _fSecs = _netF <= 0 ? Infinity : (state.food / Math.max(0.0001, _netF));
                const _fCol = _netF <= 0 ? '#2ecc71' : _fSecs < 600 ? '#e74c3c' : _fSecs < 1800 ? '#e67e22' : _fSecs < 3600 ? '#f1c40f' : '#27ae60';
                ctx.save();
                ctx.beginPath(); ctx.arc(fx, fyVisual, 5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
                ctx.beginPath(); ctx.arc(fx, fyVisual, 4, 0, Math.PI * 2);
                ctx.fillStyle = _fCol; ctx.fill();
                ctx.restore();
            }
        }
        ctx.textAlign = 'left';
        ctx.restore();

        // Hover Tooltip — drawn on bubble overlay so it's above PIXI sprites
        let fDepth = 18;
        let hoverFW = foodTroughVisualW;
        let hoverFH = foodTroughVisualH + fDepth;
        let hoverFX = fx;
        let hoverFY = fyVisual;
        if (window.GAME_MODE === 'portrait') {
            let cx = fx + foodTroughVisualW / 2;
            let cy = fyVisual + (foodTroughVisualH + fDepth) / 2;
            hoverFW = foodTroughVisualW * 1.5;
            hoverFH = (foodTroughVisualH + fDepth) * 1.5;
            hoverFX = cx - hoverFW / 2;
            hoverFY = cy - hoverFH / 2;
        }
        let isHoverF = (!state.hasRetired && lastMousePos.x >= hoverFX && lastMousePos.x <= hoverFX + hoverFW && lastMousePos.y >= hoverFY && lastMousePos.y <= hoverFY + hoverFH);
        if (isHoverF && _bubbleCtx) {
            const _tc = _bubbleCtx;
            _tc.font = `${11 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
            const _fL1 = `${window.t ? window.t("food") : "FOOD:"} ${fmt(Math.floor(state.food))}/${fmt(state.maxFood)}`;
            const _fL2 = `${window.t ? window.t("fill") : "Fill"} +${fmt(_refillAmt())} (${getCurrencySym()}${fmt(_refillCost())})`;
            const _fTW = Math.max(_tc.measureText(_fL1).width, _tc.measureText(_fL2).width) + 14;
            _tc.fillStyle = 'rgba(0,0,0,0.85)';
            _tc.fillRect(fx - _fTW - 6, lastMousePos.y - 20, _fTW, 38);
            _tc.strokeStyle = '#e67e22'; _tc.lineWidth = 2;
            _tc.strokeRect(fx - _fTW - 6, lastMousePos.y - 20, _fTW, 38);
            _tc.fillStyle = '#fff'; _tc.textAlign = 'left';
            _tc.fillText(_fL1, fx - _fTW, lastMousePos.y - 6);
            _tc.fillStyle = '#ffeb3b';
            _tc.fillText(_fL2, fx - _fTW, lastMousePos.y + 11);
        }

        let physFx = window.LAYOUT.TROUGH_FOOD_PHYS_X, physFw = window.LAYOUT.TROUGH_FOOD_PHYS_W;

        ctx.textAlign = 'left';

        if (!_pixi) {
            if (state.autoFoodLevel > 0) {
                drawFoodPipe(window.LAYOUT.PIPE_DISPATCH_Y, state._autoFoodFlowing || 0);
            }
            if (state.autoWaterLevel > 0) {
                drawWaterPipe(window.LAYOUT.FAUCET_Y, state._autoWaterFlowing || 0);
            }
        }

        let holeX = canvas.width - window.LAYOUT.HOLE_RIGHT_MARGIN;
        if (!_pixi) {
            // Conveyor Belt (Auto collect) moves Left
            if (state.autoCollectLevel > 0) {
                const _beltBoosted = _ebFamilyActive('belt');
                let currentW = canvas.width - window.LAYOUT.HOLE_RIGHT_MARGIN + 4;
                let startX = window.LAYOUT.HOLE_LEFT_X - 4;

                let drawY = window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_FARM_BELT_Y || 535) : EGG_GROUND_Y;
                _drawSegmentedBelt(startX, drawY, currentW, _beltBoosted, _beltSpeed(state.autoCollectLevel), false);
            }

            // Draw Sell Belt (Auto sell)
            if (state.autoSellLevel > 0) {
                const _beltBoosted = _ebFamilyActive('belt');
                let beltEndX = canvas.width - window.LAYOUT.HOLE_RIGHT_MARGIN;
                let beltStartX = window.LAYOUT.BELT_SELL_START - 7;
                let beltCurrentW = Math.max(0, beltEndX - beltStartX - (window.LAYOUT.BELT_END_PAD || 0));
                _drawSegmentedBelt(beltStartX, UNDERGROUND_FLOOR_Y, beltCurrentW, _beltBoosted, _beltSpeed(state.autoSellLevel), true);
            }
        }

        // Box shelf / repisa mural (right of cat, wall-mounted, no legs)
        if (!_pixi && state.hasBox) {
            const _sX = BOX_SHELF_X, _sW = BOX_SHELF_W;
            const _sTop = BOX_SHELF_TOP;

            // Small wall brackets underneath (L-shaped, 6px each side)
            ctx.fillStyle = '#5a3a14';
            ctx.fillRect(_sX + 3, _sTop + 5, 4, 10); // left bracket vertical
            ctx.fillRect(_sX + 3, _sTop + 5, 8, 4);  // left bracket horizontal
            ctx.fillRect(_sX + _sW - 7, _sTop + 5, 4, 10); // right bracket vertical
            ctx.fillRect(_sX + _sW - 11, _sTop + 5, 8, 4);  // right bracket horizontal

            // Shelf board
            ctx.fillStyle = '#9b6a28';
            ctx.fillRect(_sX, _sTop, _sW, 5);
            // Top highlight
            ctx.fillStyle = '#c48a3a';
            ctx.fillRect(_sX, _sTop, _sW, 2);
            // Bottom shadow
            ctx.fillStyle = '#6a4010';
            ctx.fillRect(_sX, _sTop + 4, _sW, 1);
            // Wood grain
            ctx.fillStyle = 'rgba(80,40,0,0.3)';
            for (let _gi = _sX + 8; _gi < _sX + _sW - 4; _gi += 10) {
                ctx.fillRect(_gi, _sTop, 1, 4);
            }

            // Flash when box returns
            if (_boxEjectAnim > 0) {
                ctx.globalAlpha = _boxEjectAnim * 0.6;
                ctx.fillStyle = '#ffdd66';
                ctx.fillRect(_sX - 3, _sTop - BOX_H - 3, _sW + 6, BOX_H + 8);
                ctx.globalAlpha = 1;
            }

            // Sort Bonus sign — to the right of the carton shelf
            if (state.hasSorter) {
                ctx.save();
                const _sbLvl = state.sortBonusLevel || 0;
                const _pct = _sbLvl > 0 ? '+' + (_sbLvl * 25) + '%' : '+25%?';
                const _sx2 = _sX + _sW + 10;
                const _sw2 = 76, _sh2 = 36;
                const _sy2 = _sTop - _sh2;
                if (sortBonusSign.complete && sortBonusSign.naturalWidth)
                    ctx.drawImage(sortBonusSign, _sx2, _sy2, _sw2, _sh2);
                // Dynamic percentage always drawn on top
                ctx.font = `bold ${8 * (window.P2P_SCALE || 1)}px monospace`;
                ctx.fillStyle = _sbLvl > 0 ? '#226622' : '#886600';
                ctx.textAlign = 'center';
                ctx.fillText(_pct, _sx2 + _sw2 / 2, _sy2 + 30);
                ctx.restore();
            }
        }

        if (!_pixi && state.hasWasher) {
            ctx.save();
            let wx_center = window.LAYOUT.WASHER_X + 40;
            let wy_center = UNDERGROUND_FLOOR_Y;
            ctx.translate(wx_center, wy_center);
            ctx.scale(window.LAYOUT.WASHER_SCALE, window.LAYOUT.WASHER_SCALE);
            ctx.translate(-wx_center, -wy_center);

            if (!_pixi && washingMachineSpriteSheet.complete && washingMachineSpriteSheet.naturalWidth > 0) {
                const prevSmoothing = ctx.imageSmoothingEnabled;
                ctx.imageSmoothingEnabled = false;
                const WASHER_FRAME_W = 48;
                const WASHER_FRAME_H = 56;
                const WASHER_FRAMES = 8;
                const washerFrame = Math.floor(Date.now() / 120) % WASHER_FRAMES;
                ctx.drawImage(
                    washingMachineSpriteSheet,
                    washerFrame * WASHER_FRAME_W, 0, WASHER_FRAME_W, WASHER_FRAME_H,
                    window.LAYOUT.WASHER_X + 2, window.LAYOUT.WASHER_Y, WASHER_FRAME_W, WASHER_FRAME_H
                );
                ctx.imageSmoothingEnabled = prevSmoothing;
            }
            {
                if (state.activeChallenge === 'endless') {
                    const _lbl = `+${(state.washerLevel || 1) * 12}%`;
                    ctx.save();
                    ctx.font = `${7 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                    const _lw = ctx.measureText(_lbl).width;
                    const _lx = window.LAYOUT.WASHER_PIPE_X + 5, _ly = window.LAYOUT.WASHER_PIPE_Y + 16;
                    ctx.fillStyle = 'rgba(0,0,0,0.75)';
                    ctx.fillRect(_lx - _lw / 2 - 3, _ly - 10, _lw + 6, 12);
                    ctx.fillStyle = '#3498db';
                    ctx.fillText(_lbl, _lx, _ly);
                    ctx.restore();
                }
            }
            ctx.restore();
        }

        if (!_pixi && state.hasStamper) {
            ctx.save();
            let sx_center = window.LAYOUT.STAMPER_X + 8;
            let sy_center = UNDERGROUND_FLOOR_Y + 5;
            ctx.translate(sx_center, sy_center);
            ctx.scale(window.LAYOUT.STAMPER_SCALE, window.LAYOUT.STAMPER_SCALE);
            ctx.translate(-sx_center, -sy_center);

            if (stampMachineSpriteSheet.complete && stampMachineSpriteSheet.naturalWidth > 0) {
                const prevSmoothing = ctx.imageSmoothingEnabled;
                ctx.imageSmoothingEnabled = false;
                const STAMP_FRAME_W = 24;
                const STAMP_FRAME_H = 52;
                const STAMP_FRAMES = 8;
                const STAMP_DEST_W = 48;
                const STAMP_DEST_H = 104;

                let timeSinceStamp = window.lastStampActTime ? Date.now() - window.lastStampActTime : 9999;
                let stampFrame = 0;
                if (timeSinceStamp < 300) {
                    stampFrame = Math.min(STAMP_FRAMES - 1, Math.floor(timeSinceStamp / 300 * STAMP_FRAMES));
                }

                ctx.drawImage(
                    stampMachineSpriteSheet,
                    stampFrame * STAMP_FRAME_W, 0, STAMP_FRAME_W, STAMP_FRAME_H,
                    window.LAYOUT.STAMPER_VISUAL_X - 12, UNDERGROUND_FLOOR_Y + 5 - STAMP_DEST_H, STAMP_DEST_W, STAMP_DEST_H
                );
                ctx.imageSmoothingEnabled = prevSmoothing;
            }

            if (state.activeChallenge === 'endless') {
                const _lbl = `+${(state.stamperLevel || 1) * 14}%`;
                ctx.save();
                ctx.font = `${7 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                const _lw = ctx.measureText(_lbl).width;
                const _lx = window.LAYOUT.STAMPER_VISUAL_X + 8, _ly = UNDERGROUND_FLOOR_Y + 5 - 104 + 16;
                ctx.fillStyle = 'rgba(0,0,0,0.75)';
                ctx.fillRect(_lx - _lw / 2 - 3, _ly - 10, _lw + 6, 12);
                ctx.fillStyle = '#f1c40f';
                ctx.fillText(_lbl, _lx, _ly);
                ctx.restore();
            }

            ctx.restore();
        }

        if (!_pixi && state.hasPackager) {
            ctx.save();
            let px_center = window.LAYOUT.PACKAGER_X + 30;
            let py_center = UNDERGROUND_FLOOR_Y;
            ctx.translate(px_center, py_center);
            ctx.scale(window.LAYOUT.PACKAGER_SCALE, window.LAYOUT.PACKAGER_SCALE);
            ctx.translate(-px_center, -py_center);

            if (packMachineSpriteSheet.complete && packMachineSpriteSheet.naturalWidth > 0) {
                const prevSmoothing = ctx.imageSmoothingEnabled;
                ctx.imageSmoothingEnabled = false;
                const PACK_FRAME_W = 35;
                const PACK_FRAME_H = 31;
                const PACK_DEST_W = 70;
                const PACK_DEST_H = 62;

                const packFrame = _getPackagerFrame();

                ctx.drawImage(
                    packMachineSpriteSheet,
                    packFrame * PACK_FRAME_W, 0, PACK_FRAME_W, PACK_FRAME_H,
                    window.LAYOUT.PACKAGER_X - 5, UNDERGROUND_FLOOR_Y - PACK_DEST_H, PACK_DEST_W, PACK_DEST_H
                );
                ctx.imageSmoothingEnabled = prevSmoothing;
            }

            if (state.activeChallenge === 'endless') {
                const _lbl = `+${(state.packagerLevel || 1) * 16}%`;
                ctx.save();
                ctx.font = `${7 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                const _lw = ctx.measureText(_lbl).width;
                const _lx = window.LAYOUT.PACKAGER_X + 30, _ly = UNDERGROUND_FLOOR_Y - 45;
                ctx.fillStyle = 'rgba(0,0,0,0.75)';
                ctx.fillRect(_lx - _lw / 2 - 3, _ly - 10, _lw + 6, 12);
                ctx.fillStyle = '#e67e22';
                ctx.fillText(_lbl, _lx, _ly);
                ctx.restore();
            }

            ctx.restore();
        }

        // Egg Sorter — shelves drawn BEFORE eggs (so shelf eggs are behind falling eggs)
        if (!_pixi && state.hasSorter) {
            ctx.save();
            let sx_center = 50;
            let sy_center = UNDERGROUND_CEILING_Y;
            ctx.translate(sx_center, sy_center);
            ctx.scale(window.LAYOUT.SORTER_SCALE, window.LAYOUT.SORTER_SCALE);
            ctx.translate(-sx_center, -sy_center);

            if (!state.sorterGoldBasket) state.sorterGoldBasket = [];
            if (!state.sorterPremBasket) state.sorterPremBasket = [];
            const _cy = UNDERGROUND_CEILING_Y;
            const _mw = 100, _mh = 74;
            const _sSlots = state.sorterLevel || 1;
            const _slotW = 14;
            const _shelfW = _sSlots * _slotW + 4;
            const _sx = _mw;

            // Shelf planks (8px left of machine edge to align with eggs)
            const _spx = _sx - 8;
            const _psFull = state.sorterPremBasket.length >= _sSlots;
            ctx.fillStyle = _psFull ? '#4a1a6a' : '#6a2a96';
            ctx.fillRect(_spx, _cy + 34, _shelfW + 8, 5);
            ctx.fillStyle = '#3a0a56';
            ctx.fillRect(_spx, _cy + 34, _shelfW + 8, 2);
            const _gsFull = state.sorterGoldBasket.length >= _sSlots;
            ctx.fillStyle = _gsFull ? '#7a5010' : '#b08820';
            ctx.fillRect(_spx, _cy + 70, _shelfW + 8, 5);
            ctx.fillStyle = '#6a4010';
            ctx.fillRect(_spx, _cy + 70, _shelfW + 8, 2);

            // Eggs on shelves — sprite row reflects washed/stamped quality
            if (eggsSpriteSheet.complete && eggsSpriteSheet.naturalWidth) {
                ctx.globalAlpha = 0.3;
                for (let i = state.sorterPremBasket.length; i < _sSlots; i++)
                    ctx.drawImage(eggsSpriteSheet, 0, 3 * 32, 32, 32, _sx - 8 + i * _slotW, _cy + 15, 32, 32);
                ctx.globalAlpha = 1;
                for (let i = 0; i < state.sorterPremBasket.length; i++) {
                    const _ed = state.sorterPremBasket[i];
                    const _row = _ed.stamped ? 5 : _ed.washed ? 4 : 3;
                    ctx.drawImage(eggsSpriteSheet, 0, _row * 32, 32, 32, _sx - 8 + i * _slotW, _cy + 15, 32, 32);
                }
                ctx.globalAlpha = 0.3;
                for (let i = state.sorterGoldBasket.length; i < _sSlots; i++)
                    ctx.drawImage(eggsSpriteSheet, 0, 6 * 32, 32, 32, _sx - 8 + i * _slotW, _cy + 51, 32, 32);
                ctx.globalAlpha = 1;
                for (let i = 0; i < state.sorterGoldBasket.length; i++) {
                    const _ed = state.sorterGoldBasket[i];
                    const _row = _ed.stamped ? 8 : _ed.washed ? 7 : 6;
                    ctx.drawImage(eggsSpriteSheet, 0, _row * 32, 32, 32, _sx - 8 + i * _slotW, _cy + 51, 32, 32);
                }
            }
            ctx.restore();
        }




        // Tombstones
        function renderTombstone(t) {
            let ox = 0;
            let oy = 0;
            if (t.shakeTimer > 0) {
                ox = (Math.random() - 0.5) * 6;
            }

            // Popup from ground animation
            if (t.spawnTime) {
                let age = Date.now() - t.spawnTime;
                if (age < 500) {
                    let p = age / 500;
                    let easeOut = 1 - Math.pow(1 - p, 3);
                    oy = 20 * (1 - easeOut); // starts at 20, ends at 0
                }
            }

            ctx.save();
            ctx.translate(t.x + ox, t.y + oy);

            // Tombstone face setup (if we don't use original render method)
            if (typeof tombstoneSpriteSheet !== 'undefined' && tombstoneSpriteSheet.complete && tombstoneSpriteSheet.naturalWidth > 0) {
                ctx.drawImage(tombstoneSpriteSheet, -16, -20, 32, 32);
            } else {
                // Fallback geometry 
                ctx.fillStyle = '#808080';
                ctx.fillRect(-8, -9, 16, 17);
                ctx.beginPath();
                ctx.arc(0, -9, 8, Math.PI, 0);
                ctx.fill();

                ctx.strokeStyle = '#555';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(-5, -12);
                ctx.lineTo(-2, -9);
                ctx.lineTo(-4, -6);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(6, 4);
                ctx.lineTo(3, 8);
                ctx.stroke();

                ctx.font = `${6 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                ctx.textAlign = 'center';
                ctx.fillStyle = '#333';
                ctx.fillText("RIP", 0, -1);
                ctx.fillStyle = '#a0a0a0';
                ctx.fillText("RIP", 0, -2);
            }

            ctx.restore();
        };

        // Foreground Machine Parts (drawn OVER eggs to create 3D depth)
        if (!_pixi && state.hasStamper) {
            ctx.save();
            let sx_center = window.LAYOUT.STAMPER_X + 8;
            let sy_center = UNDERGROUND_FLOOR_Y + 5;
            ctx.translate(sx_center, sy_center);
            ctx.scale(window.LAYOUT.STAMPER_SCALE, window.LAYOUT.STAMPER_SCALE);
            ctx.translate(-sx_center, -sy_center);

            let stamperH = 75;
            let basY = UNDERGROUND_FLOOR_Y + 5;

            // Front Right Leg (overlap eggs)
            ctx.fillStyle = '#34495e';
            ctx.fillRect(window.LAYOUT.STAMPER_X + 22, basY - stamperH, 6, stamperH);
            ctx.fillStyle = '#2c3e50';
            ctx.fillRect(window.LAYOUT.STAMPER_X + 22, basY - stamperH, 2, stamperH);

            // Front crossbar / Warning Guard
            const _sGX = window.LAYOUT.STAMPER_X - 12, _sGEnd = window.LAYOUT.STAMPER_X + 28;
            ctx.fillStyle = '#e67e22'; // Orange guard area
            ctx.fillRect(_sGX, basY - stamperH + 35, 40, 4);
            ctx.fillStyle = '#222';
            for (let idx = _sGX; idx < _sGEnd; idx += 10) {
                ctx.beginPath();
                ctx.moveTo(idx, basY - stamperH + 35);
                ctx.lineTo(idx + 4, basY - stamperH + 39);
                ctx.lineTo(idx + 9, basY - stamperH + 39);
                ctx.lineTo(idx + 4, basY - stamperH + 35);
                ctx.fill();
            }
            ctx.restore();
        }

        if (!_pixi && state.hasRibbon) {
            ctx.save();
            let rx_center = window.LAYOUT.RIBBON_X + 15;
            let ry_center = UNDERGROUND_FLOOR_Y;
            ctx.translate(rx_center, ry_center);
            ctx.scale(window.LAYOUT.RIBBON_SCALE, window.LAYOUT.RIBBON_SCALE);
            ctx.translate(-rx_center, -ry_center);

            if (boxingMachineSpriteSheet.complete && boxingMachineSpriteSheet.naturalWidth > 0) {
                const prevSmoothing = ctx.imageSmoothingEnabled;
                ctx.imageSmoothingEnabled = false;
                const BOX_FRAME_W = 32;
                const BOX_FRAME_H = 29;
                const BOX_FRAMES = 9;
                const BOX_DEST_W = 64;
                const BOX_DEST_H = 58;

                const timeSinceRibbon = window.lastRibbonActTime ? Date.now() - window.lastRibbonActTime : 9999;
                const ribbonFrame = timeSinceRibbon < BOX_FRAMES * 40
                    ? Math.min(BOX_FRAMES - 1, Math.floor(timeSinceRibbon / 40))
                    : 0;

                ctx.drawImage(
                    boxingMachineSpriteSheet,
                    ribbonFrame * BOX_FRAME_W, 0, BOX_FRAME_W, BOX_FRAME_H,
                    window.LAYOUT.RIBBON_VISUAL_X - 10, UNDERGROUND_FLOOR_Y - BOX_DEST_H, BOX_DEST_W, BOX_DEST_H
                );
                ctx.imageSmoothingEnabled = prevSmoothing;
            }

            if (state.activeChallenge === 'endless') {
                const _lbl = `+${(state.ribbonLevel || 1) * 18}%`;
                ctx.save();
                ctx.font = `${7 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                const _lw = ctx.measureText(_lbl).width;
                const _lx = window.LAYOUT.RIBBON_VISUAL_X + 22, _ly = UNDERGROUND_FLOOR_Y - 58 + 16;
                ctx.fillStyle = 'rgba(0,0,0,0.75)';
                ctx.fillRect(_lx - _lw / 2 - 3, _ly - 10, _lw + 6, 12);
                ctx.fillStyle = '#f1c40f';
                ctx.fillText(_lbl, _lx, _ly);
                ctx.restore();
            }

            ctx.restore();
        }

        // Canvas 2D entity rendering — fallback when PixiJS is unavailable (file:// or WebGL fail)
        if (!_pixi) {
            const _fb = [];
            for (let i = 0; i < chickensArr.length; i++) _fb.push({ t: 'chicken', e: chickensArr[i], z: chickensArr[i].y + 19 });
            for (let i = 0; i < chicksArr.length; i++) _fb.push({ t: 'chick', e: chicksArr[i], z: chicksArr[i].y + 6 });
            for (let i = 0; i < roostersArr.length; i++) _fb.push({ t: 'rooster', e: roostersArr[i], z: roostersArr[i].y - 3 });
            for (let i = 0; i < eggsArr.length; i++) { const e = eggsArr[i]; if (!e.collected && !(state.hasSorter && e.x >= 0 && e.x <= 100 && e.y >= UNDERGROUND_CEILING_Y && e.y <= UNDERGROUND_CEILING_Y + 74)) _fb.push({ t: 'egg', e, z: e.y }); }
            for (let i = 0; i < tombstonesArr.length; i++) _fb.push({ t: 'tombstone', e: tombstonesArr[i], z: tombstonesArr[i].y + 12 });
            if (state.musicLevel > 0) _fb.push({ t: 'boombox', e: null, z: window.LAYOUT.BOOMBOX_Y + window.LAYOUT.BOOMBOX_H / 2 * (1 + (window.LAYOUT.BOOMBOX_SCALE || 1)) });
            _fb.sort((a, b) => a.z - b.z);
            for (let i = 0; i < _fb.length; i++) {
                const { t, e } = _fb[i];
                if (t === 'chicken') drawChicken(e);
                else if (t === 'chick') drawChick(e);
                else if (t === 'rooster') drawRooster(e);
                else if (t === 'egg') drawEgg(e);
                else if (t === 'tombstone') drawTombstone(e);
                else if (t === 'boombox') drawBoombox();
            }
            draggedEggs.forEach(e => drawEgg(e));

            // Mask: redraw background patch over right-hole entry to hide eggs before canvas edge (portrait only)
            if (window.GAME_MODE === 'portrait' && bgSpriteSheet.complete && bgSpriteSheet.naturalWidth > 0 && window.LAYOUT.HOLE_RIGHT_Y_MARGIN > 0) {
                const _mX = canvas.width - window.LAYOUT.HOLE_RIGHT_MARGIN;
                const _mW = window.LAYOUT.HOLE_RIGHT_MARGIN;
                const _mH = window.LAYOUT.HOLE_RIGHT_Y_MARGIN;
                const _mY = canvas.height - _mH;
                const _scX = bgSpriteSheet.naturalWidth / canvas.width;
                const _scY = bgSpriteSheet.naturalHeight / canvas.height;
                ctx.drawImage(bgSpriteSheet,
                    _mX * _scX, _mY * _scY, _mW * _scX, _mH * _scY,
                    _mX, _mY, _mW, _mH);
            }
        }

        // Tutorial egg arrows (canvas) — HTML bubble handled by _updateTutorialBubbles()
        if ((state.eggsSold || 0) === 0 && (state.playTime || 0) > 10 && draggedEggs.length === 0) {
            const _tutEgg = eggsArr.find(egg => !egg.collected);
            if (!_pixi && _tutEgg) {

                // Arrows showing path to market
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.lineWidth = 4;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';

                const _tFarmY = EGG_LIMIT_Y;           // suelo granja — ajusta aquí
                const _tUgY = UNDERGROUND_FLOOR_Y - 15; // suelo sótano — ajusta aquí
                let _tPath = [];
                if (_tutEgg.y < UNDERGROUND_FLOOR_Y - 30) {
                    _tPath = [
                        { x: _tutEgg.x, y: _tFarmY },
                        { x: 40, y: _tFarmY },
                        { x: 40, y: _tUgY },
                        { x: canvas.width - 50, y: _tUgY }
                    ];
                } else {
                    _tPath = [
                        { x: _tutEgg.x, y: _tUgY },
                        { x: canvas.width - 50, y: _tUgY }
                    ];
                }

                let _tTotal = 0, _tSegs = [];
                for (let i = 0; i < _tPath.length - 1; i++) {
                    let dx = _tPath[i + 1].x - _tPath[i].x, dy = _tPath[i + 1].y - _tPath[i].y;
                    let len = Math.hypot(dx, dy);
                    if (len > 0) { _tSegs.push({ len, dx, dy, x: _tPath[i].x, y: _tPath[i].y }); _tTotal += len; }
                }
                let _tOff = (Date.now() / 15) % 40;
                for (let d = _tOff; d < _tTotal; d += 40) {
                    let dist = d, pt = null;
                    for (let i = 0; i < _tSegs.length; i++) {
                        if (dist <= _tSegs[i].len) {
                            let t = dist / _tSegs[i].len;
                            pt = { x: _tSegs[i].x + _tSegs[i].dx * t, y: _tSegs[i].y + _tSegs[i].dy * t, angle: Math.atan2(_tSegs[i].dy, _tSegs[i].dx) };
                            break;
                        }
                        dist -= _tSegs[i].len;
                    }
                    if (pt) {
                        ctx.save();
                        ctx.translate(pt.x, pt.y);
                        ctx.rotate(pt.angle);
                        ctx.beginPath();
                        ctx.moveTo(-7, -7); ctx.lineTo(4, 0); ctx.lineTo(-7, 7);
                        ctx.stroke();
                        ctx.restore();
                    }
                }
                ctx.restore();
            }
        }

        // Egg Sorter machine body — drawn AFTER eggs so falling eggs appear behind it
        if (!_pixi && state.hasSorter) {
            const _cy = UNDERGROUND_CEILING_Y;
            const _mw = 100, _mh = 74;
            ctx.fillStyle = '#1e2d3a';
            ctx.fillRect(0, _cy, _mw, _mh);
            ctx.fillStyle = '#2c3e50';
            ctx.fillRect(2, _cy + 2, _mw - 4, _mh - 4);
            // Premium tint + label
            ctx.fillStyle = 'rgba(160,80,240,0.22)';
            ctx.fillRect(2, _cy + 2, _mw - 4, 33);
            ctx.fillStyle = '#cc88ff';
            ctx.fillRect(6, _cy + 12, 6, 6);
            ctx.save();
            ctx.font = `bold ${6 * (window.P2P_SCALE || 1)}px monospace`;
            ctx.fillStyle = '#cc88ff'; ctx.textAlign = 'left';
            ctx.fillText('PREM', 16, _cy + 19);
            ctx.restore();
            // Golden tint + label
            ctx.fillStyle = 'rgba(240,200,0,0.15)';
            ctx.fillRect(2, _cy + 40, _mw - 4, 32);
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(6, _cy + 48, 6, 6);
            ctx.save();
            ctx.font = `bold ${6 * (window.P2P_SCALE || 1)}px monospace`;
            ctx.fillStyle = '#ffd700'; ctx.textAlign = 'left';
            ctx.fillText('GOLD', 16, _cy + 55);
            ctx.restore();
            // Divider
            ctx.fillStyle = '#1e2d3a';
            ctx.fillRect(0, _cy + 37, _mw, 3);
        }

        // Particles — Canvas 2D fallback; money particles always use PixiJS layer
        if (!_pixi) particlesArr.forEach(p => {

            if (p.pixel) {
                const sz = p.size || 3;
                const renderY = p.y;
                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.5));
                ctx.fillStyle = p.color || '#ffffff';
                ctx.fillRect(p.x - sz / 2, renderY - sz / 2, sz, sz);
                ctx.restore();
                return;
            }

            let isHeart = p.text.includes('❤') || p.text.includes('❤️');

            if (p.color) {
                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, p.life));

                // Offset Y significantly so it doesn't block the box behind it
                let renderY = p.y - 35 - (4 - p.life) * 10;

                if (isHeart && heartSpriteSheet.complete && heartSpriteSheet.naturalWidth > 0) {
                    const hsz = window.GAME_MODE === 'portrait' ? 8 : 4;
                    const hcx = p.x, hcy = renderY;
                    const prog = p.heartProgress != null ? p.heartProgress : 1;
                    // Dim background
                    ctx.globalAlpha = Math.max(0, Math.min(1, p.life)) * 0.3;
                    ctx.drawImage(heartSpriteSheet, hcx - hsz, hcy - hsz, hsz * 2, hsz * 2);
                    // Radial fill clipped to pie sector
                    if (prog > 0) {
                        ctx.save();
                        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
                        ctx.beginPath();
                        ctx.moveTo(hcx, hcy);
                        ctx.arc(hcx, hcy, hsz * 2.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
                        ctx.closePath();
                        ctx.clip();
                        ctx.drawImage(heartSpriteSheet, hcx - hsz, hcy - hsz, hsz * 2, hsz * 2);
                        ctx.restore();
                    }
                    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
                } else {
                    ctx.fillStyle = p.color;
                    ctx.font = `bold ${(p.fontSize || window.LAYOUT.SELL_POPUP_FONT_SIZE) * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}", monospace`;
                    ctx.textAlign = p.leftAlign ? 'left' : p.rightAlign ? 'right' : p.x > canvas.width - window.LAYOUT.HOLE_RIGHT_MARGIN ? 'right' : 'center';

                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 2.5;
                    ctx.strokeText(p.text, p.x, renderY);
                    ctx.fillText(p.text, p.x, renderY);
                }
                ctx.restore();
            } else {
                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, p.life));

                let renderX = p.x - 10;
                let renderY = p.y - 45;

                if (isHeart && heartSpriteSheet.complete && heartSpriteSheet.naturalWidth > 0) {
                    ctx.drawImage(heartSpriteSheet, renderX - 4, renderY - 4, 8, 8);
                } else {
                    ctx.fillStyle = '#ffffff';
                    ctx.font = `bold ${window.GAME_MODE === 'portrait' ? 45 : 18}px sans-serif`;
                    ctx.textAlign = p.x > canvas.width - window.LAYOUT.HOLE_RIGHT_MARGIN ? 'right' : 'center';

                    // Dark Outline for readability
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 2.5;
                    ctx.strokeText(p.text, renderX, renderY);
                    ctx.fillText(p.text, renderX, renderY);
                }
                ctx.restore();
            }
        });

        // Magnet vortex visual
        if (!_pixi && isDragging && (state.magnetLevel || 0) > 0 && draggedEggs.length > 0) {
            const _t = Date.now() / 1000;
            const _total = draggedEggs.length;
            const _r = 9 + Math.min(_total, 8);
            ctx.save();
            // Orbit ring (spinning dashed)
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = '#a29bfe';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 5]);
            ctx.lineDashOffset = -_t * 40;
            ctx.beginPath();
            ctx.arc(mouseX, mouseY, _r, 0, Math.PI * 2);
            ctx.stroke();
            // Pulse rings expanding outward
            for (let _ri = 0; _ri < 2; _ri++) {
                const _pr = (_t * 22 + _ri * _r * 0.6) % (_r * 1.4);
                ctx.globalAlpha = 0.3 * (1 - _pr / (_r * 1.4));
                ctx.setLineDash([]);
                ctx.lineWidth = 1;
                ctx.strokeStyle = '#dfe6e9';
                ctx.beginPath();
                ctx.arc(mouseX, mouseY, _pr, 0, Math.PI * 2);
                ctx.stroke();
            }
            // Center dot
            ctx.setLineDash([]);
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = '#a29bfe';
            ctx.beginPath();
            ctx.arc(mouseX, mouseY, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Top right: versión y FPS + top left: tiempo/modo/dinero — dibujado en _bubbleCtx
        // Oculto en portrait (build de tienda) — solo visible en desktop para depurar.
        if (_bubbleCtx && !_captureModeHidden && window.GAME_MODE !== 'portrait') {
            const dc = _bubbleCtx;
            const _hudPortrait = window.GAME_MODE === 'portrait';
            const fontSize = _hudPortrait ? 10 : (8 * (window.P2P_SCALE || 1));
            const _topY = (() => {
                if (!_hudPortrait) return 4;
                const _cr  = canvas.getBoundingClientRect();
                const _hdr = document.querySelector('header');
                const _hdrBot = _hdr ? _hdr.getBoundingClientRect().bottom : _cr.top;
                const _scale  = _cr.height > 0 ? _cr.height / canvas.height : 1;
                return Math.round(Math.max(0, _hdrBot - _cr.top) / _scale) + 15;
            })();
            dc.font = `${fontSize}px "${window.P2P_FONT || 'Press Start 2P'}"`;
            dc.textBaseline = 'top';
            dc.textAlign = 'left';
            const pad = 6, gap = 12, barH = fontSize + pad * 2;

            const verStr = `v1.5.1 | ${window.GameEngine.getFps()} FPS`;
            const verW = dc.measureText(verStr).width;
            const bx = canvas.width - 4 - pad - verW - pad;
            dc.fillStyle = 'rgba(0,0,0,0.55)';
            dc.fillRect(bx, _topY, pad + verW + pad, barH);
            dc.fillStyle = 'rgba(255,255,255,0.7)';
            dc.fillText(verStr, bx + pad, _topY + pad);

            const hrs = Math.floor((state.playTime || 0) / 3600);
            const mins = Math.floor(((state.playTime || 0) % 3600) / 60);
            const secs = Math.floor((state.playTime || 0) % 60);
            const timeStr = (hrs > 0 ? `${hrs}:` : '') + `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            const valStr = `${getCurrencySym()}${fmtMoney(state.totalEarnings || 0)}`;

            const _isTrMode3 = window.currentLang === 'tr';
            let modeLabel = '';
            let modeCol = '#ffffff';
            if (state.isSpeedrunMode) { modeLabel = _isTrMode3 ? 'HIZLI KOŞU' : 'SPEEDRUN'; modeCol = Date.now() % 1000 < 500 ? '#e74c3c' : '#c0392b'; }
            else if (state.activeChallenge === 'adam') { modeLabel = _isTrMode3 ? 'ADEM İLE HAVVA' : 'ADAM & EVE'; modeCol = '#f39c12'; }
            else if (state.activeChallenge === 'manual') { modeLabel = _isTrMode3 ? 'YUMURTA İZDİHAMI' : 'EGG JAM'; modeCol = '#3498db'; }
            else if (state.activeChallenge === 'endless') { modeLabel = _isTrMode3 ? 'SONSUZ ÇİFTLİK' : 'ENDLESS'; modeCol = '#9b59b6'; }
            else { modeLabel = _isTrMode3 ? 'SAKİN MOD' : 'CLASSIC'; modeCol = '#aaaaaa'; }

            const timeW = dc.measureText(timeStr).width;
            const modeW = dc.measureText(modeLabel).width;
            const valW = dc.measureText(valStr).width;
            const barW = pad + timeW + gap + modeW + gap + valW + pad;

            dc.fillStyle = 'rgba(0,0,0,0.55)';
            dc.fillRect(4, _topY, barW, barH);

            let cx = 4 + pad;
            dc.fillStyle = '#ffffff';
            dc.fillText(timeStr, cx, _topY + pad);
            cx += timeW + gap;
            dc.fillStyle = modeCol;
            dc.fillText(modeLabel, cx, _topY + pad);
            cx += modeW + gap;
            dc.fillStyle = '#f1c40f';
            dc.fillText(valStr, cx, _topY + pad);

            _rankHitBox = null;
        }

        // Debug: Y-sort anchor circles
        if (window._debugYSort) {
            ctx.save();
            ctx.font = '6px monospace';
            ctx.textAlign = 'center';
            const _drawYDot = (x, sortY, label) => {
                ctx.beginPath();
                ctx.arc(x, sortY, 3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,0,0,0.85)';
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                ctx.strokeText(label, x, sortY - 5);
                ctx.fillText(label, x, sortY - 5);
            };
            for (const c of chickensArr) _drawYDot(c.x, c.y + 19, Math.round(c.y + 19));
            for (const ch of chicksArr) _drawYDot(ch.x, ch.y + 6, Math.round(ch.y + 6));
            for (const r of roostersArr) _drawYDot(r.x, r.y - 3, Math.round(r.y - 3));
            for (const e of eggsArr) if (!e.collected) _drawYDot(e.x, e.y, Math.round(e.y));
            ctx.restore();
        }

    }

    const getMousePos = (e) => window.GameUtils.getMousePos(e, canvas);

    let mouseVelX = 0;
    let mouseVelY = 0;
    let lastMouseUpdate = Date.now();
    let lastMousePos = { x: 0, y: 0 };

    let cursorNormalStr = '';
    let cursorActiveStr = '';
    let cursorWaterStr = '';
    let cursorFoodStr = '';

    function updateCursor(stateStr) {
        if (!cursorWaterStr) {
            // Water / food cursors: programáticos (no están en el sprite sheet)
            const createCursor = (type) => {
                const cvs = document.createElement('canvas');
                cvs.width = 32; cvs.height = 32;
                const c = cvs.getContext('2d');
                const cols = { 'O': '#221109', 'S': '#f5c697', 'R': '#e74c3c', 'B': '#3498db', 'G': '#ecf0f1', 'L': '#85c1e9', 'Y': '#f1c40f', 'D': '#d4ac0d', 'E': '#e67e22', 'F': '#f5dead', 'M': '#5c4033' };
                let pix = [];
                if (type === 'water') {
                    pix = [
                        "......OOOO......",
                        ".....OLLLLO.....",
                        ".....OLLLLO.....",
                        "....OLLLLLLO....",
                        "...OLLLLLLLLO...",
                        "..OLLLLLLLLLLO..",
                        "..OLLLLLLLLLLO..",
                        "..OLLLBBBBLLLO..",
                        "..OLLBBBBBBLLO..",
                        "..OLLBBBBBBLLO..",
                        "..OLLBBBBBBLLO..",
                        "...OLLLLLLLLO...",
                        "....OOOOOOOO....",
                        "................",
                        "................",
                        "................"
                    ];
                } else if (type === 'food') {
                    pix = [
                        "......YEY.......",
                        ".....EDYDY......",
                        "....YDYEYEY.....",
                        "...YEYYYYYEY....",
                        "..OEYYYDYYYEO...",
                        "..ODYYEYEYYDO...",
                        "..OOSOSOSOSOO...",
                        "...OSSSSSSSSO...",
                        "...OSSSSSSSSO...",
                        "....OSSSSSSO....",
                        ".....OOOOOO.....",
                        "................",
                        "................",
                        "................",
                        "................",
                        "................"
                    ];
                }
                for (let y = 0; y < pix.length; y++) {
                    for (let x = 0; x < pix[y].length; x++) {
                        if (cols[pix[y][x]]) { c.fillStyle = cols[pix[y][x]]; c.fillRect(x * 2, y * 2, 2, 2); }
                    }
                }
                return cvs.toDataURL('image/png');
            };
            cursorWaterStr = `url(${createCursor('water')}) 16 16, pointer`;
            cursorFoodStr = `url(${createCursor('food')}) 16 16, pointer`;

            // Cursores del canvas: MANO al pasar, IMÁN al arrastrar/atraer huevos.
            // Antes este bloque cargaba cursors.png por su cuenta (igual que shared/intro.js,
            // duplicando el trabajo y con hotspots distintos). Ahora la única fuente es
            // shared/cursors.js, que además los publica como variables CSS para el resto del
            // juego. Aquí usamos las cadenas directas porque el canvas cambia de cursor por JS.
            cursorNormalStr = 'var(--cur-hand)';     // fallback hasta que resuelva la promesa
            cursorActiveStr = 'var(--cur-magnet)';
            if (window.GameCursors) {
                window.GameCursors.ready.then(() => {
                    cursorNormalStr = window.GameCursors.get('hand')   || cursorNormalStr;
                    cursorActiveStr = window.GameCursors.get('magnet') || cursorActiveStr;
                    // Aplícalo ya si el canvas está a la vista
                    canvas.style.cursor = isDragging ? cursorActiveStr : cursorNormalStr;
                });
            }
        }

        if (stateStr === 'normal' || stateStr === false) canvas.style.cursor = cursorNormalStr;
        else if (stateStr === 'active' || stateStr === true) canvas.style.cursor = cursorActiveStr;
        else if (stateStr === 'water') canvas.style.cursor = cursorWaterStr;
        else if (stateStr === 'food') canvas.style.cursor = cursorFoodStr;
        else canvas.style.cursor = cursorNormalStr;
    }
    updateCursor('normal');

    canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId);
        if (cinematicPhase >= 4 && window._speedrunCanvasBtn) {
            const pos = getMousePos(e);
            let b = window._speedrunCanvasBtn;
            if (pos.x >= b.x && pos.x <= b.x + b.w && pos.y >= b.y && pos.y <= b.y + b.h) {
                playSound(sfxPopBuy, 0.8);
                localStorage.setItem('chickenIdleSpeedrun', 'true');
                localStorage.removeItem('chickenIdleSave');
                localStorage.removeItem('chickenIdleSpeedrunSubmitted');
                location.reload();
                return;
            }
        }
        if (state.hasRetired || retireFadeTimer >= 0 || cinematicPhase > 0) return;
        updateCursor(true);
        if ((state.pettingLevel || 0) > 0 && sfxCatPurr.paused && !window.isMusicMuted) {
            sfxCatPurr.volume = 0;
            sfxCatPurr.play().catch(e => { });
        }

        const pos = getMousePos(e);
        lastMousePos = pos;
        lastMouseUpdate = Date.now();

        // Endless ranking badge click
        if (_rankHitBox && pos.x >= _rankHitBox.x && pos.x <= _rankHitBox.x + _rankHitBox.w && pos.y >= _rankHitBox.y && pos.y <= _rankHitBox.y + _rankHitBox.h) {
            window.GameAds.showLeaderboard('endlessFarm', () => { const rb = document.getElementById('ranking-btn'); if (rb) rb.click(); });
            return;
        }

        if (state.musicLevel > 0) {
            let rx = window.LAYOUT.BOOMBOX_X, ry = window.LAYOUT.BOOMBOX_Y, rw = window.LAYOUT.BOOMBOX_W, rh = window.LAYOUT.BOOMBOX_H;
            let scale = window.LAYOUT.BOOMBOX_SCALE || 1.0;
            let newW = rw * scale;
            let newH = rh * scale;
            rx = rx + rw / 2 - newW / 2;
            ry = ry + rh / 2 - newH / 2;
            rw = newW;
            rh = newH;
            if (pos.x >= rx && pos.x <= rx + rw && pos.y >= ry && pos.y <= ry + rh) {
                window.isBgmMuted = !window.isBgmMuted;
                updateBGM();
                return;
            }
        }

        // Sorter shelf click — attach egg directly to cursor drag
        if (state.hasSorter) {
            if (!state.sorterGoldBasket) state.sorterGoldBasket = [];
            if (!state.sorterPremBasket) state.sorterPremBasket = [];
            const _cy = UNDERGROUND_CEILING_Y;
            let _shelfEgg = null;
            const _sW = 92 + (state.sorterLevel || 1) * 14 + 4;
            if (pos.x >= 92 && pos.x <= _sW && pos.y >= _cy + 2 && pos.y <= _cy + 38 && state.sorterPremBasket.length > 0) {
                _shelfEgg = state.sorterPremBasket.shift();
            }
            else if (pos.x >= 92 && pos.x <= _sW && pos.y >= _cy + 40 && pos.y <= _cy + 75 && state.sorterGoldBasket.length > 0) {
                _shelfEgg = state.sorterGoldBasket.shift();
            }
            if (_shelfEgg) {
                const _newEgg = { x: pos.x, y: pos.y, velX: 0, velY: 0, type: _shelfEgg.type, value: _shelfEgg.value, washed: _shelfEgg.washed, stamped: _shelfEgg.stamped, collected: false, hasHitGround: false, isBeingDragged: true, wasManuallyDragged: true, _fromShelf: true, _orbitAngle: 0 };
                eggsArr.push(_newEgg);
                draggedEggs.push(_newEgg);
                isDragging = true;
                mouseX = pos.x; mouseY = pos.y;
                lastMouseX = pos.x; lastMouseY = pos.y;
                playSound(sfxEgg, 0.2, 20);
                return;
            }
        }

        // Water click (LEFT)
        const clickWidth = window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_TROUGH_WATER_CLICK_WIDTH || 80) : window.LAYOUT.TROUGH_WATER_CLICK_X2;
        let clickWaterMinY, clickWaterMaxY;
        if (_waterTroughVisualBounds) {
            clickWaterMinY = _waterTroughVisualBounds.y - (window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_TROUGH_CLICK_TOP_OFFSET || 0) : 0);
            clickWaterMaxY = _waterTroughVisualBounds.y + _waterTroughVisualBounds.h + (window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET || 0) : 18);
        } else {
            const waterTroughH = _troughH(state.maxWater, state.maxWaterLevel || 0);
            let waterTroughY = window.LAYOUT.TROUGH_CENTER_Y - waterTroughH / 2;
            if (window.GAME_MODE === 'portrait') waterTroughY = window.LAYOUT.TROUGH_CENTER_Y - (waterTroughH * 1.5) / 2;
            clickWaterMinY = window.GAME_MODE === 'portrait' ? (waterTroughY - (window.LAYOUT.PORTRAIT_TROUGH_CLICK_TOP_OFFSET || 0)) : waterTroughY;
            clickWaterMaxY = window.GAME_MODE === 'portrait' ? (waterTroughY + (waterTroughH * 1.5) + (window.LAYOUT.PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET || 0)) : (waterTroughY + waterTroughH + 18);
        }

        if (pos.x >= 0 && pos.x <= clickWidth && pos.y >= clickWaterMinY && pos.y <= clickWaterMaxY) {
            if (state.money >= 1 && state.water < state.maxWater) {
                const fullCost = _refillCost();
                const fullFill = _refillAmt();
                const spaceLeft = state.maxWater - state.water;
                const actualCost = Math.min(state.money, fullCost * Math.min(1, spaceLeft / fullFill));
                const actualFill = Math.min(spaceLeft, Math.max(1, Math.round(fullFill * actualCost / fullCost)));
                playRestartSound(sfxRefillWater, 0.2);
                state.money -= actualCost;
                _totalMoneySpent += actualCost;
                state.water = Math.min(state.maxWater, state.water + actualFill);
                state.manualRefills++;
                const _wcLabel = actualCost.toLocaleString(undefined, { maximumFractionDigits: 1 });
                const _wPopY = (_waterTroughVisualBounds ? _waterTroughVisualBounds.y : 160) + (window.REFILL_POPUP_Y_OFFSET || 0);
                particlesArr.push({ x: window.LAYOUT.WATER_REFILL_POPUP_X, y: _wPopY, text: '-' + getCurrencySym() + _wcLabel, life: 1.0, color: '#e74c3c', fontSize: window.LAYOUT.REFILL_POPUP_FONT_SIZE, leftAlign: true });
                updateUI();
                return;
            }
        }
        // Food click (RIGHT)
        const clickFoodWidth = window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_TROUGH_FOOD_CLICK_WIDTH || 80) : 80;
        const clickFoodStartX = window.GAME_MODE === 'portrait' ? (800 - clickFoodWidth) : window.LAYOUT.TROUGH_FOOD_CLICK_X1;
        let clickFoodMinY, clickFoodMaxY;
        if (_foodTroughVisualBounds) {
            clickFoodMinY = _foodTroughVisualBounds.y - (window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_TROUGH_CLICK_TOP_OFFSET || 0) : 0);
            clickFoodMaxY = _foodTroughVisualBounds.y + _foodTroughVisualBounds.h + (window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET || 0) : 18);
        } else {
            const foodTroughH = _troughH(state.maxFood, state.maxFoodLevel || 0);
            let foodTroughY = window.LAYOUT.TROUGH_CENTER_Y - foodTroughH / 2;
            if (window.GAME_MODE === 'portrait') foodTroughY = window.LAYOUT.TROUGH_CENTER_Y - (foodTroughH * 1.5) / 2;
            clickFoodMinY = window.GAME_MODE === 'portrait' ? (foodTroughY - (window.LAYOUT.PORTRAIT_TROUGH_CLICK_TOP_OFFSET || 0)) : foodTroughY;
            clickFoodMaxY = window.GAME_MODE === 'portrait' ? (foodTroughY + (foodTroughH * 1.5) + (window.LAYOUT.PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET || 0)) : (foodTroughY + foodTroughH + 18);
        }

        if (pos.x >= clickFoodStartX && pos.x <= 800 && pos.y >= clickFoodMinY && pos.y <= clickFoodMaxY) {
            if (state.money >= 1 && state.food < state.maxFood) {
                const fullCost = _refillCost();
                const fullFill = _refillAmt();
                const spaceLeft = state.maxFood - state.food;
                const actualCost = Math.min(state.money, fullCost * Math.min(1, spaceLeft / fullFill));
                const actualFill = Math.min(spaceLeft, Math.max(1, Math.round(fullFill * actualCost / fullCost)));
                playRestartSound(sfxRefillFood, 0.2);
                state.money -= actualCost;
                _totalMoneySpent += actualCost;
                state.food = Math.min(state.maxFood, state.food + actualFill);
                state.manualRefills++;
                const _fcLabel = actualCost.toLocaleString(undefined, { maximumFractionDigits: 1 });
                const _fPopY = (_foodTroughVisualBounds ? _foodTroughVisualBounds.y : 160) + (window.REFILL_POPUP_Y_OFFSET || 0);
                particlesArr.push({ x: window.LAYOUT.FOOD_REFILL_POPUP_X, y: _fPopY, text: '-' + getCurrencySym() + _fcLabel, life: 1.0, color: '#e74c3c', fontSize: window.LAYOUT.REFILL_POPUP_FONT_SIZE, rightAlign: true });
                updateUI();
                return;
            }
        }

        // TV Ad has no active click effect

        // Wake up sleeping chickens/chicks on click
        const _wakeUpClick = arr => {
            for (let i = 0; i < arr.length; i++) {
                const c = arr[i];
                if (c.action === 'sleeping' && (c.wakeTimer || 0) <= 0 && Math.abs(pos.x - c.x) < 34 && Math.abs(pos.y - c.y) < 34) {
                    const _nextAction = (c.growTimer !== undefined)
                        ? 'goToFood'
                        : (c.nextTrough !== undefined)
                            ? (c.nextTrough === 'goToWater' ? 'goToFood' : 'goToWater')
                            : 'roam';
                    _wakeChicken(c, _nextAction);
                    if (c.growTimer !== undefined) {
                        c.troughY = undefined;
                        c.hasFailedOnce = false;
                    } else if (c.nextTrough === undefined) {
                        c.foodTimer = state.activeChallenge === 'endless' ? 50 : 10;
                        c.roamTargetX = undefined;
                    }
                    playSound(randomCokSounds[Math.floor(Math.random() * randomCokSounds.length)], 0.2, 100);
                    return true;
                }
            }
        };
        if (_wakeUpClick(chickensArr) || _wakeUpClick(chicksArr)) return;
        // Wake sleeping rooster on click
        for (let i = 0; i < roostersArr.length; i++) {
            const r = roostersArr[i];
            if (r.action === 'sleeping' && (r.wakeTimer || 0) <= 0 && Math.abs(pos.x - r.x) < 34 && Math.abs(pos.y - r.y) < 34) {
                r.wakeTimer = r.wakeDuration || 0.471235;
                playSound(randomCokSounds[Math.floor(Math.random() * randomCokSounds.length)], 0.2, 100);
                return;
            }
        }

        // Check tombstones click
        for (let i = tombstonesArr.length - 1; i >= 0; i--) {
            let t = tombstonesArr[i];
            let dx = pos.x - t.x;
            let dy = pos.y - t.y;
            if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
                t.hp--;
                t.shakeTimer = 0.2; // 200ms of shaking
                if (t.hp <= 0) {
                    tombstonesArr.splice(i, 1);
                }
                return;
            }
        }

        // Click on rooster → toggle grey (idle/paused breeding)
        if (state.activeChallenge === 'endless') {
            for (let i = 0; i < roostersArr.length; i++) {
                const r = roostersArr[i];
                if (Math.abs(pos.x - r.x) < 24 && Math.abs(pos.y - r.y) < 30) {
                    r.isGrey = !r.isGrey;
                    if (r.isGrey) { r.action = 'roam'; r.targetChicken = null; }
                    playSound(sfxPopBuy, 0.4);
                    saveState();
                    return;
                }
            }
        }

        // Ramp drag
        if (state.hasBox) {
            const _bX = state.boxX, _bY = state.boxY;
            if (pos.x >= _bX && pos.x <= _bX + BOX_W && pos.y >= _bY && pos.y <= _bY + BOX_H) {
                _boxDragging = true;
                _boxDragOffX = pos.x - _bX;
                _boxDragOffY = pos.y - _bY;
                state.boxVelX = 0; state.boxVelY = 0;
                return;
            }
        }

        // Si el clic cae encima de una huevera o caja, ignorar completamente
        for (let i = eggsArr.length - 1; i >= 0; i--) {
            const _ce = eggsArr[i];
            if (!_ce.collected && (_ce.type === 'package' || _ce.type === 'box')) {
                if (Math.abs(pos.x - _ce.x) < 28 && Math.abs(pos.y - _ce.y) < 20) return;
            }
        }

        isDragging = true;
        lastMouseX = pos.x;
        lastMouseY = pos.y;
        mouseX = pos.x;
        mouseY = pos.y;

        let clickedEgg = false;
        for (let i = eggsArr.length - 1; i >= 0; i--) {
            let egg = eggsArr[i];
            if (!egg.collected && !egg.sold && !egg.isBeingDragged && egg.type !== 'package' && egg.type !== 'box') {
                const dx = pos.x - egg.x;
                const dy = pos.y - egg.y;
                if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
                    egg.isBeingDragged = true;
                    egg.wasManuallyDragged = true;
                    draggedEggs.push(egg);
                    clickedEgg = true;
                    break;
                }
            }
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        if (state.hasRetired || retireFadeTimer >= 0 || cinematicPhase > 0) return;
        const pos = getMousePos(e);
        let now = Date.now();

        let ptrState = isDragging ? 'active' : 'normal';

        if (state.hasBox) {
            const _bX = state.boxX, _bY = state.boxY;
            if (pos.x >= _bX && pos.x <= _bX + BOX_W && pos.y >= _bY && pos.y <= _bY + BOX_H) {
                canvas.style.cursor = _boxDragging ? 'var(--cur-magnet)' : 'var(--cur-hand)';
                ptrState = null;
            }
        }

        let catX = window.LAYOUT.CAT_X, catY = window.LAYOUT.CAT_Y;
        let isOverCat = (state.pettingLevel || 0) > 0 && (Math.abs(pos.x - catX) < 30) && (Math.abs(pos.y - catY) < 20);

        const hoverWidth = window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_TROUGH_WATER_CLICK_WIDTH || 80) : window.LAYOUT.TROUGH_WATER_CLICK_X2;
        let hoverMinY, hoverMaxY;
        if (_waterTroughVisualBounds) {
            hoverMinY = _waterTroughVisualBounds.y - (window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_TROUGH_CLICK_TOP_OFFSET || 0) : 0);
            hoverMaxY = _waterTroughVisualBounds.y + _waterTroughVisualBounds.h + (window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET || 0) : 18);
        } else {
            const hoverWaterTroughH = _troughH(state.maxWater, state.maxWaterLevel || 0);
            const hoverWaterTroughY = window.LAYOUT.TROUGH_CENTER_Y - hoverWaterTroughH / 2;
            hoverMinY = window.GAME_MODE === 'portrait' ? (hoverWaterTroughY - (window.LAYOUT.PORTRAIT_TROUGH_CLICK_TOP_OFFSET || 0)) : hoverWaterTroughY;
            hoverMaxY = window.GAME_MODE === 'portrait' ? (hoverWaterTroughY + hoverWaterTroughH + (window.LAYOUT.PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET || 0)) : (hoverWaterTroughY + hoverWaterTroughH + 18);
        }
        if (pos.x >= 0 && pos.x <= hoverWidth && pos.y >= hoverMinY && pos.y <= hoverMaxY) ptrState = 'water';

        const hoverFoodWidth = window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_TROUGH_FOOD_CLICK_WIDTH || 80) : 80;
        const hoverFoodStartX = window.GAME_MODE === 'portrait' ? (800 - hoverFoodWidth) : window.LAYOUT.TROUGH_FOOD_CLICK_X1;
        let hoverFoodMinY, hoverFoodMaxY;
        if (_foodTroughVisualBounds) {
            hoverFoodMinY = _foodTroughVisualBounds.y - (window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_TROUGH_CLICK_TOP_OFFSET || 0) : 0);
            hoverFoodMaxY = _foodTroughVisualBounds.y + _foodTroughVisualBounds.h + (window.GAME_MODE === 'portrait' ? (window.LAYOUT.PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET || 0) : 18);
        } else {
            const hoverFoodTroughH = _troughH(state.maxFood, state.maxFoodLevel || 0);
            const hoverFoodTroughY = window.LAYOUT.TROUGH_CENTER_Y - hoverFoodTroughH / 2;
            hoverFoodMinY = window.GAME_MODE === 'portrait' ? (hoverFoodTroughY - (window.LAYOUT.PORTRAIT_TROUGH_CLICK_TOP_OFFSET || 0)) : hoverFoodTroughY;
            hoverFoodMaxY = window.GAME_MODE === 'portrait' ? (hoverFoodTroughY + hoverFoodTroughH + (window.LAYOUT.PORTRAIT_TROUGH_CLICK_BOTTOM_OFFSET || 0)) : (hoverFoodTroughY + hoverFoodTroughH + 18);
        }
        if (pos.x >= hoverFoodStartX && pos.x <= 800 && pos.y >= hoverFoodMinY && pos.y <= hoverFoodMaxY) ptrState = 'food';

        if (ptrState !== null) updateCursor(ptrState);

        let dtMouse = (now - lastMouseUpdate) / 1000;
        if (dtMouse > 0) {
            let dx = pos.x - lastMousePos.x;
            let dy = pos.y - lastMousePos.y;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                // Instantly update on strong movement
                mouseVelX = dx / dtMouse;
                mouseVelY = dy / dtMouse;

                // Wake up sleeping chickens/chicks on hover — no upgrade required
                const _wakeUp = (c) => {
                    if (c.action !== 'sleeping') return;
                    if ((c.wakeTimer || 0) > 0) return;
                    let cdx = pos.x - c.x, cdy = pos.y - c.y;
                    if (Math.abs(cdx) < 34 && Math.abs(cdy) < 34 && !c.wasHovered) {
                        c.wasHovered = true;
                        const _nextAction = (c.growTimer !== undefined)
                            ? 'goToFood'
                            : (c.nextTrough !== undefined)
                                ? (c.nextTrough === 'goToWater' ? 'goToFood' : 'goToWater')
                                : 'roam';
                        _wakeChicken(c, _nextAction);
                        if (c.growTimer !== undefined) {
                            c.troughY = undefined;
                            c.hasFailedOnce = false;
                        } else if (c.nextTrough === undefined) {
                            c.foodTimer = state.activeChallenge === 'endless' ? 50 : 10;
                            c.roamTargetX = undefined;
                        }
                        playSound(randomCokSounds[Math.floor(Math.random() * randomCokSounds.length)], 0.2, 100);
                    } else if (Math.abs(cdx) >= 34 || Math.abs(cdy) >= 34) {
                        c.wasHovered = false;
                    }
                };
                chickensArr.forEach(_wakeUp);
                chicksArr.forEach(_wakeUp);
                roostersArr.forEach(r => {
                    if (r.action !== 'sleeping' || (r.wakeTimer || 0) > 0) return;
                    let cdx = pos.x - r.x, cdy = pos.y - r.y;
                    if (Math.abs(cdx) < 34 && Math.abs(cdy) < 34 && !r.wasHovered) {
                        r.wasHovered = true;
                        r.wakeTimer = r.wakeDuration || 0.471235;
                        playSound(randomCokSounds[Math.floor(Math.random() * randomCokSounds.length)], 0.2, 100);
                    } else if (Math.abs(cdx) >= 34 || Math.abs(cdy) >= 34) {
                        r.wasHovered = false;
                    }
                });

                if ((state.pettingLevel || 0) > 0) {
                    chickensArr.forEach(c => {
                        if (c.action === 'roam' && !c.dead) {
                            let cdx = pos.x - c.x;
                            let cdy = pos.y - (c.y - 4);
                            let isOver = Math.abs(cdx) < 34 && Math.abs(cdy) < 34;

                            if (isOver && !c.wasHovered) {
                                c.wasHovered = true;
                                c.isHovered = true;
                                const _pl = state.pettingLevel || 0;
                                const _baseTime = state.activeChallenge === 'endless' ? 30 : 10;
                                const _petReduce = state.activeChallenge === 'endless'
                                    ? (_pl > 0 ? _baseTime * (20 * (1 - Math.pow(0.95, _pl)) / 100) * (1 + _ebGetBonus('petting')) : 0)
                                    : (_pl > 0 ? 1 : 0);
                                c.eggTimer = Math.max(1, c.eggTimer - _petReduce);
                                c.squishTimer = 0.1;
                                state.totalPets = (state.totalPets || 0) + 1;
                                playSound(randomCokSounds[Math.floor(Math.random() * randomCokSounds.length)], 0.1, 100 + (Math.random() - 0.5) * 50);
                                const _heartProgress = Math.min(1, Math.max(0, 1 - (c.eggTimer / _baseTime)));
                                if (_activeHeartCount < 100) {
                                    particlesArr.push({ x: c.x + (Math.random() - 0.5) * 10, y: c.y + 45, text: '❤', life: 1.0, color: '#ff69b4', heartProgress: _heartProgress });
                                    _activeHeartCount++;
                                }

                                if (c.eggTimer <= 1 && !c.layEggPhase) {
                                    c.layEggPhase = 'effort';
                                    c.layEggCyclesLeft = 1 + Math.floor(Math.random() * 3);
                                    c.layEggTimer = 0.4;
                                    c.velX = 0;
                                    c.velY = 0;
                                }
                                c.pettingTimer = 0.35;
                            } else if (!isOver && c.wasHovered) {
                                c.wasHovered = false;
                                c.isHovered = false;
                                c.pettingTimer = 0;
                            }
                        }
                    });

                    roostersArr.forEach(r => {
                        let rdx = pos.x - r.x;
                        let rdy = pos.y - r.y;
                        let isOver = Math.abs(rdx) < 30 && Math.abs(rdy) < 30;
                        if (!isOver || r.action !== 'roamAfterEat') {
                            if (!isOver) r.wasHovered = false;
                            return;
                        }
                        if (!r.wasHovered) {
                            r.wasHovered = true;
                            if (r.mateTimer > 0 && !r.isGrey) {
                                r.mateTimer -= 2;
                                playSound(randomCokSounds[Math.floor(Math.random() * randomCokSounds.length)], 0.15, 80 + (Math.random() - 0.5) * 40);
                                const _rMateMax = state.activeChallenge === 'endless' ? 150 : 30;
                                const _rHeartProgress = Math.min(1, Math.max(0, 1 - (r.mateTimer / _rMateMax)));
                                if (_activeHeartCount < 100) {
                                    particlesArr.push({ x: r.x + (Math.random() - 0.5) * 10, y: r.y - 10, text: '❤', life: 1.0, color: '#ff69b4', heartProgress: _rHeartProgress });
                                    _activeHeartCount++;
                                }
                            }
                        }
                    });

                    // Petting Cat visuals
                    let pdx = pos.x - catX;
                    let pdy = pos.y - catY;
                    if (Math.abs(pdx) < 30 && Math.abs(pdy) < 20) {
                        window.catPurrVol = Math.min(1.0, (window.catPurrVol || 0) + 0.2);
                        if (Math.random() < 0.1) {
                            particlesArr.push({ x: catX + (Math.random() - 0.5) * 15, y: catY + 25, text: '❤', life: 0.5, color: '#e91e63' });
                        }
                    }
                }
            } else {
                // Smoothly decay if the user briefly stops before releasing click
                mouseVelX *= Math.pow(0.05, dtMouse);
                mouseVelY *= Math.pow(0.05, dtMouse);
            }
        }
        if (_boxDragging) {
            const _prevBoxX = state.boxX, _prevBoxY = state.boxY;
            const _dragX = Math.max(0, Math.min(canvas.width - BOX_W, pos.x - _boxDragOffX));
            const _inHoleArea = _dragX + BOX_W / 2 <= window.LAYOUT.HOLE_LEFT_X;
            const _boxUnderground = _prevBoxY > EGG_GROUND_Y - BOX_H + 5;
            const _dragMaxY = (_inHoleArea || _boxUnderground) ? UNDERGROUND_FLOOR_Y - BOX_H : EGG_GROUND_Y - BOX_H;
            const _dragMinY = (_boxUnderground && !_inHoleArea) ? UNDERGROUND_CEILING_Y : 5;
            state.boxX = _dragX;
            state.boxY = Math.max(_dragMinY, Math.min(_dragMaxY, pos.y - _boxDragOffY));
            const _dBX = state.boxX - _prevBoxX, _dBY = state.boxY - _prevBoxY;
            // Track velocity during box drag so release has correct inertia
            const _dtB = (now - lastMouseUpdate) / 1000;
            if (_dtB > 0) {
                const _dmx = pos.x - lastMousePos.x, _dmy = pos.y - lastMousePos.y;
                if (Math.abs(_dmx) > 1 || Math.abs(_dmy) > 1) {
                    mouseVelX = _dmx / _dtB;
                    mouseVelY = _dmy / _dtB;
                } else {
                    mouseVelX *= Math.pow(0.05, _dtB);
                    mouseVelY *= Math.pow(0.05, _dtB);
                }
            }
            lastMousePos = pos;
            lastMouseUpdate = now;
            canvas.style.cursor = 'var(--cur-hand)';
            return;
        }

        lastMousePos = pos;
        lastMouseUpdate = now;

        mouseX = pos.x;
        mouseY = pos.y;

        // Flores — cada vez que el cursor entra avanza un frame (efecto acariciar)
        const FSCALE = 3, FHW = FSCALE * 8, FHH = FSCALE * 16;
        (window.GAME_MODE === 'portrait' ? FLOWER_DEFS_PORTRAIT : FLOWER_DEFS).forEach((def, i) => {
            const inside = pos.x >= def.x - FHW && pos.x <= def.x + FHW &&
                pos.y >= def.y - FHH && pos.y <= def.y;
            if (inside && !_flowerInside[i]) {
                _flowerFrame[i] = ((_flowerFrame[i] || 0) + 1) % 2;
            }
            _flowerInside[i] = inside;
        });
    });

    canvas.addEventListener('pointerup', (e) => {
        if (_boxDragging) {
            _boxDragging = false;
            state.boxVelX = Math.max(-900, Math.min(900, mouseVelX * 0.4));
            state.boxVelY = Math.max(-900, Math.min(900, mouseVelY * 0.4));
            saveState(); updateCursor(false); return;
        }
        updateCursor(false);
        isDragging = false;
        draggedEggs.forEach((egg, i) => {
            egg.isBeingDragged = false;
            egg.hasHitGround = false;
            egg._orbitAngle = undefined;
            egg._sorted = false;
            egg._fromShelf = false;
            const _spread = draggedEggs.length > 1 ? (Math.random() - 0.5) * 80 : 0;
            egg.velX = Math.max(-800, Math.min(800, mouseVelX * 0.2 + _spread));
            egg.velY = Math.max(-800, Math.min(800, mouseVelY * 0.2 + (Math.random() - 0.5) * 40));
        });
        draggedEggs = [];
    });

    canvas.addEventListener('pointercancel', () => {
        _boxDragging = false;
        updateCursor(false);
        isDragging = false;
        draggedEggs.forEach(egg => {
            egg.isBeingDragged = false;
            egg.hasHitGround = false;
            egg.velX = 0; egg.velY = 0;
        });
        draggedEggs = [];
    });

    // btnSell.addEventListener('click', () => { // This button is no longer used
    //     sellOneEgg();
    //     updateUI();
    // });

    if (btnCheat) {
        btnCheat.addEventListener('click', () => {
            // Desactivado a petición explícita — se deja el cuerpo intacto para
            // poder reactivarlo luego sin rehacerlo.
            if (true) return;
            state.money += 100000000000;
            state.totalEarnings = (state.totalEarnings || 0) + 100000000000;
            updateUI();
        });
    }

    if (btnWipe) btnWipe.addEventListener('click', () => _openWipeConfirm(null));

    let _wipeFromChallenge = false;
    let _pendingRestartChallenge = null;
    let _restartFromRetire = false;

    // Nombres visibles de los retos (mismos que usa el cartel final).
    const _CHAL_NAMES = { vanilla: 'NORMAL', speedrun: 'SPEEDRUN', adam: 'ADAM & EVE', manual: 'EGG JAM', endless: 'ENDLESS FARM' };

    // Único punto de entrada del diálogo de borrado. El mismo diálogo sirve para
    // dos cosas muy distintas, así que el texto tiene que decir cuál es:
    //   ch = null  → borrado TOTAL (botón de ajustes): texto genérico.
    //   ch = 'x'   → borrar SOLO ese reto: nombra el modo.
    function _openWipeConfirm(ch) {
        _pendingRestartChallenge = ch || null;
        const el = document.getElementById('wipe-desc');
        if (el) {
            if (_pendingRestartChallenge) {
                // Quitamos data-i18n para que applyTranslations() no pise el texto
                // al cambiar de idioma (lo repintaríamos con el genérico).
                el.removeAttribute('data-i18n');
                const name = _CHAL_NAMES[_pendingRestartChallenge] || _pendingRestartChallenge;
                el.innerHTML = String(window.t('wipeModeDesc') || '').replace('{mode}', name);
            } else {
                el.setAttribute('data-i18n', 'warningDesc');
                el.innerHTML = window.t('warningDesc');
            }
        }
        document.getElementById('wipe-confirm-overlay').style.display = 'flex';
    }

    window._showWipeConfirm = function(ch) { _openWipeConfirm(ch); };

    const _rsRestartBtn = document.getElementById('rs-restart-btn');
    if (_rsRestartBtn) _rsRestartBtn.addEventListener('click', function() {
        _restartFromRetire = true;
        _openWipeConfirm(state.activeChallenge);
    });



    document.getElementById('wipe-cancel').addEventListener('click', () => {
        const _wo = document.getElementById('wipe-confirm-overlay');
        const _afterClose = () => {
            if (_pendingRestartChallenge !== null) {
                _pendingRestartChallenge = null;
                if (_restartFromRetire) {
                    _restartFromRetire = false;
                    const _rso = document.getElementById('retire-stats-overlay');
                    if (_rso) _rso.style.display = 'flex';
                }
                return;
            }
            if (_wipeFromChallenge) {
                _wipeFromChallenge = false;
                window.gamePaused = false;
                window.GameEngine.resetTime();
                if (!window.isMusicMuted && !window.isBgmMuted && state.musicLevel > 0 && window.audioEnabled !== false)
                    bgmTheme.play().catch(() => { });
                if (_cgGameplayStarted) window.GameAds.gameplayStart();
            }
        };
        if (_wo) {
            _wo.classList.add('overlay-closing');
            setTimeout(function() {
                _wo.style.display = 'none';
                _wo.classList.remove('overlay-closing');
                _afterClose();
            }, 320);
        } else {
            _afterClose();
        }
    });

    document.getElementById('wipe-confirm').addEventListener('click', async () => {
        const _wo2 = document.getElementById('wipe-confirm-overlay');
        if (_wo2) {
            _wo2.classList.add('overlay-closing');
            setTimeout(function() { _wo2.style.display = 'none'; _wo2.classList.remove('overlay-closing'); }, 320);
        }

        if (_pendingRestartChallenge !== null) {
            const ch = _pendingRestartChallenge;
            _pendingRestartChallenge = null;
            _restartFromRetire = false;
            window.isWiping = true;
            state = { money: 0, chickens: 0 };
            chickensArr.forEach(function(c) { if (c.nameBubbleEl instanceof Element) c.nameBubbleEl.remove(); if (c.hintBubbleEl instanceof Element) c.hintBubbleEl.remove(); });
            chicksArr.forEach(function(c) { if (c.nameBubbleEl instanceof Element) c.nameBubbleEl.remove(); });
            chickensArr = [];
            const sk = SAVE_KEY_BY_MODE[ch];
            if (sk) { await window.GameSave.remove(sk); window.GameSave.markWiped([sk]); }
            await _switchToChallenge(ch);
            return;
        }

        window.isWiping = true;
        state = { money: 0, chickens: 0 };
        chickensArr = [];
        window.isMusicMuted = false;
        const curKey = _activeSaveKey();
        await window.GameSave.remove(curKey);
        window.GameSave.remove('chickenIdleSpeedrunSubmitted');
        window.GameSave.markWiped([curKey]);
        try { sessionStorage.setItem('skipMainMenu', '1'); } catch (_) {}
        window.location.href = window.location.href.split('?')[0];
    });

    let dbgBtn = document.getElementById('debug-btn');
    if (dbgBtn) {
        dbgBtn.addEventListener('click', () => {
            state.money = Math.max(state.money, state.costs.retire);
            buy('retire');
        });
    }

    let saveTimer = 0;
    let _cloudTimer = 0;
    // Throttle de la llamada a updateUI() al final de update(dt) — ver ese call
    // site para el porqué (perfilado con F6: era el consumidor más grande de
    // update(), con diferencia — 514 líneas y 115 escrituras al DOM CADA frame,
    // sin ninguna razón para no cambiar aunque nada relevante haya cambiado).
    // NO afecta a los otros 30 sitios donde se llama updateUI() (botones, buy(),
    // etc.) — esos siguen siendo inmediatos, solo se lanzan una vez por acción.
    let _uiRefreshTimer = 999; // arranca "vencido" para refrescar en el primer frame

    // === ACHIEVEMENTS — shared/achievements.js + scenarios/farm/achievements.js ===
    let _achCheckTimer = 0;
    function checkAchievements() { window.GameAchievements.check(); }
    function _loadAchievements() { window.GameAchievements.load(); }
    function _renderPauseAchievements() { window.GameAchievements.renderPause(fmt); }
    // chickensWeighted: para los logros de "tener X gallinas" (chicken_25/250/500),
    // en Endless las gallinas especiales (Blue/Rose/Gold/Green, ver _tierMult)
    // valen 10x/50x/500x/2500x una normal — pedido explícito: que cuenten como
    // su valor real, no como 1 cada una igual que una normal. Fuera de Endless
    // esas categorías no existen (mega siempre 0), así que coincide con
    // state.chickens tal cual — sin cambio de comportamiento ahí.
    window.GameAchievements.init(window.FarmAchievements, () => {
        state.chickensWeighted = (state.activeChallenge === 'endless')
            ? chickensArr.reduce((sum, c) => sum + _tierMult(c.mega), 0)
            : state.chickens;
        return state;
    });
    // === END ACHIEVEMENTS ===

    // === ENDLESS BOOST SYSTEM ===
    const ENDLESS_BOOSTS = [
        { id: 'food3', family: 'food', title: 'FREE FOOD & WATER', titleTr: 'ÜCRETSİZ YEM & SU', desc: '3 min', descTr: '3 dk', duration: 180, bonusType: 'food', bonus: 1 },
        { id: 'chick', family: 'chick', title: 'BORN CHICKS!', titleTr: 'YENİ CİVCİVLER!', desc: '', descTr: '', duration: 0, bonusType: 'chick', bonus: 0, instant: true },
        { id: 'blue20_5', family: 'blueEgg', title: '+20% BLUE EGGS', titleTr: '+%20 MAVİ YUMURTA', desc: '5 min', descTr: '5 dk', duration: 300, bonusType: 'blueEgg', bonus: 0.20 },
        { id: 'gold10_5', family: 'goldEgg', title: '+10% GOLDEN EGGS', titleTr: '+%10 ALTIN YUMURTA', desc: '5 min', descTr: '5 dk', duration: 300, bonusType: 'goldEgg', bonus: 0.10 },
        { id: 'blue40_3', family: 'blueEgg', title: '+40% BLUE EGGS', titleTr: '+%40 MAVİ YUMURTA', desc: '3 min', descTr: '3 dk', duration: 180, bonusType: 'blueEgg', bonus: 0.40 },
        { id: 'gold20_1', family: 'goldEgg', title: '+20% GOLDEN EGGS', titleTr: '+%20 ALTIN YUMURTA', desc: '1.5 min', descTr: '1.5 dk', duration: 90, bonusType: 'goldEgg', bonus: 0.20 },
        { id: 'sell20_5', family: 'eggValue', title: '+20% EGG VALUE', titleTr: '+%20 YUMURTA DEĞERİ', desc: '5 min', descTr: '5 dk', duration: 300, bonusType: 'eggValue', bonus: 0.20 },
        { id: 'sell50_2', family: 'eggValue', title: '+50% EGG VALUE', titleTr: '+%50 YUMURTA DEĞERİ', desc: '2 min', descTr: '2 dk', duration: 120, bonusType: 'eggValue', bonus: 0.50 },
        { id: 'sell100_30', family: 'eggValue', title: '+100% EGG VALUE', titleTr: '+%100 YUMURTA DEĞERİ', desc: '30s', descTr: '30 sn', duration: 30, bonusType: 'eggValue', bonus: 1.00 },
        { id: 'sell10_10', family: 'eggValue', title: '+10% EGG VALUE', titleTr: '+%10 YUMURTA DEĞERİ', desc: '10 min', descTr: '10 dk', duration: 600, bonusType: 'eggValue', bonus: 0.10 },
        { id: 'chickenDisc', family: 'chickenDiscount', title: '-25% DISCOUNT CHICKEN', titleTr: '-%25 TAVUK İNDİRİMİ', desc: '2 min', descTr: '2 dk', duration: 120, bonusType: 'chickenDiscount', bonus: 0.25 },
        { id: 'upgDisc', family: 'upgradeDiscount', title: '-10% DISCOUNT UPGRADES', titleTr: '-%10 GELİŞTİRME İNDİRİMİ', desc: '30s', descTr: '30 sn', duration: 30, bonusType: 'upgradeDiscount', bonus: 0.10 },
        { id: 'belt50', family: 'belt', title: '+25 BELT SPEED', titleTr: '+25 BANT HIZI', desc: '5 min', descTr: '5 dk', duration: 300, bonusType: 'belt', bonus: 0.25 },
        { id: 'laySpeed50', family: 'laySpeed', title: '+50% LAY SPEED', titleTr: '+%50 YUMURTLAMA HIZI', desc: '1 min', descTr: '1 dk', duration: 60, bonusType: 'laySpeed', bonus: 0.50 },
        { id: 'doubleEgg', family: 'doubleEgg', title: 'DOUBLE LAY EGG 10%', titleTr: '%10 ÇİFT YUMURTA', desc: '3 min', descTr: '3 dk', duration: 180, bonusType: 'doubleEgg', bonus: 0.10 },
        { id: 'petting50', family: 'petting', title: '+50% PETTING', titleTr: '+%50 SEVME ETKİSİ', desc: '3 min', descTr: '3 dk', duration: 180, bonusType: 'petting', bonus: 0.50 },
        { id: 'magnet20', family: 'magnet', title: '+20 MAGNET POWER', titleTr: '+20 MIKNATIS GÜCÜ', desc: '3 min', descTr: '3 dk', duration: 180, bonusType: 'magnet', bonus: 20 },
        { id: 'tempRooster', family: 'tempRooster', title: 'BONUS ROOSTERS!', titleTr: 'BONUS HOROZLAR!', desc: '', descTr: '', duration: 180, bonusType: 'tempRooster', bonus: 0 },
    ];

    function _ebGetBonus(bonusType) {
        const active = state._boostActive;
        if (!active || !active.length) return 0;
        let sum = 0;
        for (let i = 0; i < active.length; i++) if (active[i].bonusType === bonusType) sum += active[i].bonus;
        return sum;
    }
    function _ebFamilyActive(family) {
        const active = state._boostActive;
        return !!(active && active.some(b => b.family === family));
    }
    function _ebFmt(s) {
        const _isTr = window.currentLang === 'tr';
        if (s >= 3600) return Math.floor(s / 60) + (_isTr ? 'dk' : 'm');
        if (s >= 60) { const m = Math.floor(s / 60), r = Math.ceil(s % 60); return m + (_isTr ? 'dk' : 'm') + (r > 0 ? String(r).padStart(2, '0') + (_isTr ? 'sn' : 's') : ''); }
        return Math.ceil(s) + (_isTr ? 'sn' : 's');
    }

    // Inject HTML for boost offer + active boosts into the shop aside
    (function _injectEBHtml() {
        const anchor = document.getElementById('random-offer-popup');
        if (!anchor) return;
        const actDiv = document.createElement('div');
        actDiv.id = 'eb-active';
        actDiv.style.display = 'none';
        // Usamos div.shop-btn (no button) para tener zonas clicables independientes sin conflicto
        const offerDiv = document.createElement('div');
        offerDiv.id = 'eb-offer';
        const _isPortrait = window.GAME_MODE === 'portrait';
        if (_isPortrait) {
            offerDiv.style.cssText = 'display:none;cursor:var(--cur-hand);';
        } else {
            offerDiv.style.cssText = 'display:none;cursor:var(--cur-hand);flex-shrink:0;';
        }
        offerDiv.innerHTML =
            '<span id="eb-gift"></span>' +
            '<span id="eb-title" class="btn-title"></span>' +
            '<span id="eb-dur" class="btn-price"></span>' +
            '<div id="eb-reject" class="upg-info" style="cursor:var(--cur-finger);color:#999;pointer-events:auto;"><span id="eb-reject-label">✕ RECHAZAR</span><span id="eb-cd" style="font-size:6px;">60s</span></div>' +
            '<div id="eb-accept" class="lv-corner" style="cursor:var(--cur-finger);color:#f1c40f;pointer-events:auto;"><span id="eb-accept-label">VER ANUNCIO</span></div>';
        const shopScroll = document.getElementById('shop-scroll');
        if (shopScroll && shopScroll.parentNode) shopScroll.parentNode.insertBefore(actDiv, shopScroll);
        else anchor.parentNode.insertBefore(actDiv, anchor);
        if (_isPortrait) {
            // Portrait: insertar al inicio de #farm-area para que quede en el tope del canvas (por debajo del header)
            const _farmArea = document.getElementById('farm-area');
            if (_farmArea) _farmArea.insertBefore(offerDiv, _farmArea.firstChild);
            else actDiv.parentNode.insertBefore(offerDiv, actDiv.nextSibling);
        } else {
            // Desktop: pin above shop-scroll so it's always visible at the top
            if (shopScroll && shopScroll.parentNode) shopScroll.parentNode.insertBefore(offerDiv, shopScroll);
            else anchor.parentNode.insertBefore(offerDiv, anchor.nextSibling);
        }

        document.getElementById('eb-accept').addEventListener('click', () => {
            const offer = state._boostCurrentOffer;
            if (!offer) return;
            playSound(sfxPopBuy, 0.6); // feedback de clic inmediato — antes no sonaba nada al pulsar
            const def = ENDLESS_BOOSTS.find(b => b.id === offer.id);
            if (!def) return;
            window.GameAds.request(() => {
                state.nextAdTime = state.playTime + 480;
                state._boostCurrentOffer = null;
                state._boostOfferTimer = 60;
                if (def.instant) {
                    if (def.id === 'chick') {
                        const _real = roostersArr.filter(r => !r._tempBoost).length;
                        const count = 1 + Math.floor(_real / 2);
                        for (let i = 0; i < count; i++) {
                            chicksArr.push(createChick(
                                100 + Math.random() * (canvas.width - 200),
                                150 + Math.random() * 200
                            ));
                            state.totalChicksBorn = (state.totalChicksBorn || 0) + 1;
                        }
                        playSound(sfxChickBorn, 0.5, 200);
                        const _chickText = (window.currentLang === 'tr') ? ('+' + count + ' CİVCİV!') : ('+' + count + ' CHICK' + (count > 1 ? 'S' : '') + '!');
                        particlesArr.push({ x: canvas.width / 2, y: canvas.height / 3, text: _chickText, life: 2.0, color: '#f1c40f' });
                    }
                } else {
                    if (!state._boostActive) state._boostActive = [];
                    state._boostActive.push({ id: def.id, family: def.family, remaining: def.duration, bonus: def.bonus, bonusType: def.bonusType });
                    if (def.id === 'tempRooster') {
                        const _real = roostersArr.filter(r => !r._tempBoost).length;
                        const count = 1 + Math.floor(_real / 2);
                        for (let i = 0; i < count; i++) {
                            const _tr = createRooster();
                            _tr._tempBoost = true;
                            _tr.x = 100 + Math.random() * (canvas.width - 200);
                            _tr.y = 80 + Math.random() * (MEADOW_BOTTOM - 120);
                            roostersArr.push(_tr);
                        }
                        playSound(sfxRoosterCreate, 0.7, 200);
                        const _roosterText = (window.currentLang === 'tr') ? ('+' + count + ' HOROZ!') : ('+' + count + ' ROOSTER' + (count > 1 ? 'S' : '') + '!');
                        particlesArr.push({ x: canvas.width / 2, y: canvas.height / 3, text: _roosterText, life: 2.0, color: '#e67e22' });
                    }
                }
                _ebSyncOfferUI();
                _ebSyncActiveUI();
                updateUI();
            });
        });

        document.getElementById('eb-reject').addEventListener('click', () => {
            const offer = state._boostCurrentOffer;
            if (!offer) return;
            if (!state._boostFrozen) state._boostFrozen = {};
            state._boostFrozen[offer.id] = 1200;
            state._boostCurrentOffer = null;
            state._boostOfferTimer = 60;
            _ebSyncOfferUI();
        });
    })();

    function _ebSyncOfferUI() {
        const el = document.getElementById('eb-offer');
        if (!el) return;
        const offer = state._boostCurrentOffer;
        if (state.isSpeedrunMode || !offer || !_adsSupported || _captureModeHidden) { el.style.display = 'none'; return; }
        // Hide vanilla offer popup whenever a boost offer is showing
        const vanillaOffer = document.getElementById('random-offer-popup');
        if (vanillaOffer) vanillaOffer.classList.remove('show');
        const def = ENDLESS_BOOSTS.find(b => b.id === offer.id);
        if (!def) { el.style.display = 'none'; return; }
        el.style.display = 'grid';
        const _isTr = window.currentLang === 'tr';
        document.getElementById('eb-title').textContent = (_isTr && def.titleTr) ? def.titleTr : def.title;
        const _rl = document.getElementById('eb-reject-label');
        if (_rl) _rl.textContent = '✕ ' + (window.t ? window.t('boostReject') : (_isTr ? 'KAPAT' : 'RECHAZAR'));
        const _al = document.getElementById('eb-accept-label');
        if (_al) _al.textContent = '▶ ' + (window.t ? window.t('boostWatchAd') : (_isTr ? 'REKLAM İZLE' : 'WATCH AD'));
        const _realRoosters = roostersArr.filter(r => !r._tempBoost).length; // 0 roosters → 1 temp spawned
        const _chickCnt = 1 + Math.floor(_realRoosters / 2);
        const _dur = def.id === 'chick'
            ? (_isTr ? (_chickCnt + ' civciv') : (_chickCnt + ' chick' + (_chickCnt > 1 ? 's' : '')))
            : def.id === 'tempRooster'
                ? (_isTr ? (_chickCnt + ' horoz · 3 dk') : (_chickCnt + ' rooster' + (_chickCnt > 1 ? 's' : '') + ' · 3 min'))
                : ((_isTr && def.descTr) ? def.descTr : def.desc);
        document.getElementById('eb-dur').textContent = _dur;
        const _cdEl = document.getElementById('eb-cd');
        if (_cdEl) _cdEl.textContent = Math.ceil(offer.countdown) + (_isTr ? 'sn' : 's');
    }

    function _ebSyncActiveUI() {
        const el = document.getElementById('eb-active');
        if (!el) return;
        const active = state._boostActive || [];
        const shop = document.getElementById('shop');
        if (state.isSpeedrunMode || !active.length) {
            el.style.display = 'none';
            if (shop) shop.classList.remove('has-boosts');
            return;
        }
        el.style.display = '';
        if (shop) shop.classList.add('has-boosts');
        el.innerHTML = active.map(b => {
            const def = ENDLESS_BOOSTS.find(d => d.id === b.id);
            const _isTr = window.currentLang === 'tr';
            const _pillTitle = def ? ((_isTr && def.titleTr) ? def.titleTr : def.title) : b.id;
            return '<div class="eb-pill">' +
                '<span class="eb-pill-name">' + _pillTitle + '</span>' +
                '<span class="eb-pill-time">' + _ebFmt(b.remaining) + '</span>' +
                '</div>';
        }).join('');
    }

    let _cgScoreSyncTimer = 0;
    function _tickEndlessBoosts(dt) {
        if (state.isSpeedrunMode) return;

        // Sync score to CrazyGames leaderboard every 60s (endless only)
        if (state.activeChallenge === 'endless') {
            window._endlessLastTick = Date.now(); // marca que el game loop endless está activo
            _cgScoreSyncTimer -= dt;
            if (_cgScoreSyncTimer <= 0) {
                _cgScoreSyncTimer = 60;
                window.GameAds.saveScore('endlessFarm', Math.floor(state.totalEarnings || 0));
            }
        }

        if (!state._boostActive) state._boostActive = [];
        if (!state._boostFrozen) state._boostFrozen = {};

        const _expiring = state._boostActive.filter(b => b.remaining - dt <= 0);
        state._boostActive = state._boostActive.filter(b => { b.remaining -= dt; return b.remaining > 0; });
        _expiring.forEach(b => {
            if (b.bonusType === 'tempRooster') roostersArr = roostersArr.filter(r => !r._tempBoost);
        });

        const frozen = state._boostFrozen;
        for (const fid in frozen) { frozen[fid] -= dt; if (frozen[fid] <= 0) delete frozen[fid]; }

        if (state._boostCurrentOffer) {
            state._boostCurrentOffer.countdown -= dt;
            if (state._boostCurrentOffer.countdown <= 0) {
                state._boostCurrentOffer = null;
                state._boostOfferTimer = 60;
            }
            _ebSyncOfferUI();
            _ebSyncActiveUI();
            return;
        }

        if (state._boostOfferTimer === undefined || state._boostOfferTimer === null) state._boostOfferTimer = 60;
        state._boostOfferTimer -= dt;
        if (state._boostOfferTimer <= 0) _ebPickOffer();
        _ebSyncActiveUI();
    }

    function _ebPickOffer() {
        const frozen = state._boostFrozen || {};
        const activeFams = new Set((state._boostActive || []).map(b => b.family));
        const _isAdam = state.activeChallenge === 'adam';
        const eligible = ENDLESS_BOOSTS.filter(b => {
            if ((frozen[b.id] || 0) > 0) return false;
            if (activeFams.has(b.family)) return false;
            if (b.bonusType === 'magnet' && !(state.magnetLevel > 0)) return false;
            if (b.bonusType === 'belt' && !((state.autoCollectLevel || 0) > 0 || (state.autoSellLevel || 0) > 0)) return false;
            if (b.bonusType === 'petting' && !(state.pettingLevel > 0)) return false;
            // Golden egg boost only if player bought that upgrade
            if (b.bonusType === 'goldEgg' && !(state.goldenLevel > 0)) return false;
            // Adam & Eve: no chicken discount (breeding mode, not buying), no temp roosters (breaks max-5 rule)
            if (_isAdam && b.bonusType === 'chickenDiscount') return false;
            if (_isAdam && b.bonusType === 'tempRooster') return false;
            return true;
        });
        if (!eligible.length) { state._boostOfferTimer = 30; return; }
        const chosen = eligible[Math.floor(Math.random() * eligible.length)];
        state._boostCurrentOffer = { id: chosen.id, countdown: 60 };
        playSound(sfxPopBuy, 0.7); // llama la atención al aparecer — antes era mudo
        _ebSyncOfferUI();
    }
    // === BOOST DEBUG PANEL (F7 in endless) ===
    (function _injectBoostDebug() {
        const panel = document.createElement('div');
        panel.id = 'boost-debug-panel';
        panel.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.88);z-index:999999;overflow-y:auto;padding:16px;box-sizing:border-box;';
        panel.innerHTML =
            '<div style="max-width:500px;margin:0 auto;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '  <h2 style="color:#f1c40f;font-family:\'Press Start 2P\',monospace;font-size:12px;margin:0;">BOOST DEBUG</h2>' +
            '  <button id="bdp-close" style="background:#c0392b;color:#fff;border:3px solid #fff;font-family:\'Press Start 2P\',monospace;font-size:9px;padding:4px 10px;cursor:var(--cur-finger);">✕ CLOSE</button>' +
            '</div>' +
            '<div style="margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap;">' +
            '  <button id="bdp-clear" style="background:#e67e22;color:#fff;border:3px solid #fff;font-family:\'Press Start 2P\',monospace;font-size:7px;padding:4px 8px;cursor:var(--cur-finger);">CLEAR ALL ACTIVE</button>' +
            '  <button id="bdp-offer-now" style="background:#8e44ad;color:#fff;border:3px solid #fff;font-family:\'Press Start 2P\',monospace;font-size:7px;padding:4px 8px;cursor:var(--cur-finger);">FORCE NEXT OFFER NOW</button>' +
            '</div>' +
            '<div id="bdp-list" style="display:flex;flex-direction:column;gap:5px;"></div>' +
            '</div>';
        document.body.appendChild(panel);

        document.getElementById('bdp-close').addEventListener('click', () => { panel.style.display = 'none'; });

        document.getElementById('bdp-clear').addEventListener('click', () => {
            state._boostActive = [];
            state._boostFrozen = {};
            state._boostCurrentOffer = null;
            state._boostOfferTimer = 60;
            _ebSyncOfferUI(); _ebSyncActiveUI(); updateUI();
            _renderBDPList();
        });

        document.getElementById('bdp-offer-now').addEventListener('click', () => {
            state._boostCurrentOffer = null;
            state._boostOfferTimer = 0;
            panel.style.display = 'none';
        });

        function _renderBDPList() {
            const list = document.getElementById('bdp-list');
            if (!list) return;
            list.innerHTML = ENDLESS_BOOSTS.map(def => {
                const isActive = (state._boostActive || []).some(b => b.id === def.id);
                const isFrozen = (state._boostFrozen || {})[def.id] > 0;
                const bg = isActive ? '#27ae60' : isFrozen ? '#7f8c8d' : '#2c3e50';
                const status = isActive ? 'ACTIVE' : isFrozen ? 'FROZEN ' + Math.ceil(state._boostFrozen[def.id]) + 's' : 'IDLE';
                return '<div style="display:flex;align-items:center;gap:6px;background:' + bg + ';border:2px solid #555;border-radius:3px;padding:5px 7px;">' +
                    '<div style="flex:1;">' +
                    '  <div style="color:#f1c40f;font-family:\'Press Start 2P\',monospace;font-size:7px;">' + def.title + '</div>' +
                    '  <div style="color:#aaa;font-family:\'Press Start 2P\',monospace;font-size:6px;margin-top:2px;">' + def.desc + ' — ' + status + '</div>' +
                    '</div>' +
                    '<button data-bid="' + def.id + '" style="background:#8e44ad;color:#fff;border:2px solid #fff;font-family:\'Press Start 2P\',monospace;font-size:6px;padding:3px 7px;cursor:var(--cur-finger);white-space:nowrap;">▶ APPLY</button>' +
                    '</div>';
            }).join('');
            list.querySelectorAll('[data-bid]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const def = ENDLESS_BOOSTS.find(b => b.id === btn.dataset.bid);
                    if (!def) return;
                    if (def.instant) {
                        if (def.id === 'chick') {
                            const count = 1 + Math.floor(roostersArr.length / 2);
                            for (let i = 0; i < count; i++) {
                                chicksArr.push(createChick(100 + Math.random() * (canvas.width - 200), 150 + Math.random() * 200));
                                state.totalChicksBorn = (state.totalChicksBorn || 0) + 1;
                            }
                            particlesArr.push({ x: canvas.width / 2, y: canvas.height / 3, text: '+' + count + ' CHICK' + (count > 1 ? 'S' : '') + '!', life: 2.0, color: '#f1c40f' });
                        }
                    } else {
                        if (!state._boostActive) state._boostActive = [];
                        state._boostActive = state._boostActive.filter(b => b.id !== def.id);
                        state._boostActive.push({ id: def.id, family: def.family, remaining: def.duration, bonus: def.bonus, bonusType: def.bonusType });
                        if (def.id === 'tempRooster') {
                            roostersArr = roostersArr.filter(r => !r._tempBoost);
                            const _real = roostersArr.length;
                            const count = 1 + Math.floor(_real / 2);
                            for (let i = 0; i < count; i++) {
                                const _tr = createRooster();
                                _tr._tempBoost = true;
                                _tr.x = 100 + Math.random() * (canvas.width - 200);
                                _tr.y = 80 + Math.random() * (MEADOW_BOTTOM - 120);
                                roostersArr.push(_tr);
                            }
                        }
                    }
                    if (state._boostFrozen) delete state._boostFrozen[def.id];
                    _ebSyncActiveUI(); updateUI();
                    _renderBDPList();
                });
            });
        }

        window._boostDebugRender = _renderBDPList;
    })();
    // === END BOOST DEBUG PANEL ===

    // === END ENDLESS BOOST SYSTEM ===

    // === RANDOM OFFERS — scenarios/farm/offers.js (window.FarmOffers) ===
    // (setup() wires event listeners; tick(dt) called from update())
    // === END RANDOM OFFERS ===

    // Camino alternativo a la fusión física: paga directamente en $ el coste
    // equivalente a fabricar 1 gallina de `tier` desde cero (ver
    // _simulateTierMoneyCost) — para cuando no tienes las del tier anterior
    // físicas a mano (p.ej. ya fusionadas todas antes). Sube purchasedChickens
    // como si de verdad hubieras comprado en cadena todas las normales que
    // hacen falta, y la gallina entra volando y se presenta, igual que una
    // comprada normal (no como una fusión, que aparece de golpe entre las que
    // ya había en pantalla).
    function _buyTierChickenWithMoney(tier) {
        const sim = _simulateTierMoneyCost(tier, 1, state.purchasedChickens || 0);
        if (state.money < sim.cost) return false;
        state.money -= sim.cost;
        _totalMoneySpent += sim.cost;
        state.purchasedChickens = sim.endPurchased;
        state.costs.chicken = _cappedChickenCost(state.purchasedChickens);
        state.chickens += 1;
        chickensArr.push(_registerNewChicken(createChicken(tier, null, true)));
        playSound(sfxCok, 0.8, 100);
        return true;
    }

    function buy(item) {
        // Mega chicken costs chickens, not money — handle before the money gate
        if (item === 'chickenGreen') {
            if (state.activeChallenge !== 'endless') return;
            const _gc = chickensArr.filter(c => c.mega === 3).length;
            if (_gc >= 5) {
                let _tr = 5;
                chickensArr = chickensArr.filter(c => { if (c.mega === 3 && _tr > 0) { _tr--; if (c.nameBubbleEl instanceof Element) c.nameBubbleEl.remove(); if (c.hintBubbleEl instanceof Element) c.hintBubbleEl.remove(); return false; } return true; });
                state.chickens -= 4;
                state.chickenGolds = Math.max(0, (state.chickenGolds || 0) - 5);
                state.chickenGreens = (state.chickenGreens || 0) + 1;
                chickensArr.push(createChicken(4));
                playSound(sfxCok, 0.8, 100);
                updateUI(); saveState(); return;
            }
            if (!_buyTierChickenWithMoney(4)) return;
            state.chickenGreens = (state.chickenGreens || 0) + 1;
            updateUI(); saveState(); return;
        }
        if (item === 'chickenPurple') {
            if (state.activeChallenge !== 'endless') return;
            const _grc = chickensArr.filter(c => c.mega === 4).length;
            if (_grc >= 10) {
                let _tr = 10;
                chickensArr = chickensArr.filter(c => { if (c.mega === 4 && _tr > 0) { _tr--; if (c.nameBubbleEl instanceof Element) c.nameBubbleEl.remove(); if (c.hintBubbleEl instanceof Element) c.hintBubbleEl.remove(); return false; } return true; });
                state.chickens -= 9;
                state.chickenGreens = Math.max(0, (state.chickenGreens || 0) - 10);
                state.chickenPurples = (state.chickenPurples || 0) + 1;
                chickensArr.push(createChicken(5));
                playSound(sfxCok, 0.8, 100);
                updateUI(); saveState(); return;
            }
            if (!_buyTierChickenWithMoney(5)) return;
            state.chickenPurples = (state.chickenPurples || 0) + 1;
            updateUI(); saveState(); return;
        }
        if (item === 'chickenGold') {
            if (state.activeChallenge !== 'endless') return;
            const _rc = chickensArr.filter(c => c.mega === 2).length;
            if (_rc >= 10) {
                let _tr = 10;
                chickensArr = chickensArr.filter(c => { if (c.mega === 2 && _tr > 0) { _tr--; if (c.nameBubbleEl instanceof Element) c.nameBubbleEl.remove(); if (c.hintBubbleEl instanceof Element) c.hintBubbleEl.remove(); return false; } return true; });
                state.chickens -= 9;
                state.gallinaPros = Math.max(0, (state.gallinaPros || 0) - 10);
                state.chickenGolds = (state.chickenGolds || 0) + 1;
                chickensArr.push(createChicken(3));
                playSound(sfxCok, 0.8, 100);
                updateUI(); saveState(); return;
            }
            if (!_buyTierChickenWithMoney(3)) return;
            state.chickenGolds = (state.chickenGolds || 0) + 1;
            updateUI(); saveState(); return;
        }
        if (item === 'gallinaPro') {
            if (state.activeChallenge !== 'endless') return;
            const _bc = chickensArr.filter(c => c.mega === 1).length;
            if (_bc >= 5) {
                let _tr = 5;
                chickensArr = chickensArr.filter(c => { if (c.mega === 1 && _tr > 0) { _tr--; if (c.nameBubbleEl instanceof Element) c.nameBubbleEl.remove(); if (c.hintBubbleEl instanceof Element) c.hintBubbleEl.remove(); return false; } return true; });
                state.chickens -= 4;
                state.megaChickens = Math.max(0, (state.megaChickens || 0) - 5);
                state.gallinaPros = (state.gallinaPros || 0) + 1;
                chickensArr.push(createChicken(2));
                playSound(sfxCok, 0.8, 100);
                updateUI(); saveState(); return;
            }
            if (!_buyTierChickenWithMoney(2)) return;
            state.gallinaPros = (state.gallinaPros || 0) + 1;
            updateUI(); saveState(); return;
        }
        if (item === 'megaChicken') {
            if (state.activeChallenge !== 'endless') return;
            const _nc = chickensArr.filter(c => !c.mega).length;
            if (_nc >= 10) {
                let _tr = 10;
                chickensArr = chickensArr.filter(c => { if (!c.mega && _tr > 0) { _tr--; if (c.nameBubbleEl instanceof Element) c.nameBubbleEl.remove(); if (c.hintBubbleEl instanceof Element) c.hintBubbleEl.remove(); return false; } return true; });
                state.chickens -= 9;
                state.megaChickens = (state.megaChickens || 0) + 1;
                chickensArr.push(createChicken(1));
                playSound(sfxCok, 0.8, 100);
                updateUI(); saveState(); return;
            }
            if (!_buyTierChickenWithMoney(1)) return;
            state.megaChickens = (state.megaChickens || 0) + 1;
            updateUI(); saveState(); return;
        }
        const _ebDisc = item === 'chicken' ? _ebGetBonus('chickenDiscount') : _ebGetBonus('upgradeDiscount');
        const _ebEffCost = _ebDisc > 0 ? Math.ceil(state.costs[item] * Math.max(0, 1 - _ebDisc)) : state.costs[item];
        if (state.money >= _ebEffCost) {
            playSound(sfxPopBuy, 0.8);
            state.money -= _ebEffCost;
            _totalMoneySpent += _ebEffCost;

            if (item === 'chicken') {
                if (state.activeChallenge === 'adam') return; // Bloqueado
                state.chickens++;
                state.purchasedChickens = (state.purchasedChickens || 0) + 1;
                state.costs.chicken = _cappedChickenCost(state.purchasedChickens);
                chickensArr.push(_registerNewChicken(createChicken(false, null, true)));
            } else if (item === 'petting') {
                if (state.activeChallenge !== 'endless' && (state.pettingLevel || 0) >= 1) return;
                state.pettingLevel = (state.pettingLevel || 0) + 1;
                state.costs.petting = Math.ceil(state.costs.petting * 3.5);
            } else if (item === 'maxFood') {
                state.maxFoodLevel++;
                state.maxFood = state.activeChallenge === 'endless'
                    ? Math.round(100 * Math.pow(1.17, state.maxFoodLevel))
                    : _maxResourceCap(state.maxFoodLevel);
                if (state.activeChallenge !== 'endless') state.food = Math.min(state.food + (state.maxFood * 0.2), state.maxFood);
                state.costs.maxFood = state.activeChallenge === 'endless'
                    ? Math.round(100 * Math.pow(1.40, state.maxFoodLevel))
                    : Math.floor(state.costs.maxFood * 1.8);
            } else if (item === 'maxWater') {
                state.maxWaterLevel++;
                state.maxWater = state.activeChallenge === 'endless'
                    ? Math.round(100 * Math.pow(1.17, state.maxWaterLevel))
                    : _maxResourceCap(state.maxWaterLevel);
                if (state.activeChallenge !== 'endless') state.water = Math.min(state.water + (state.maxWater * 0.2), state.maxWater);
                state.costs.maxWater = state.activeChallenge === 'endless'
                    ? Math.round(100 * Math.pow(1.40, state.maxWaterLevel))
                    : Math.floor(state.costs.maxWater * 1.8);
            } else if (item === 'autoFood') {
                state.autoFoodLevel = (state.autoFoodLevel || 0) + 1;
                state.costs.autoFood = state.activeChallenge === 'endless'
                    ? Math.round(100 * Math.pow(1.5, state.autoFoodLevel))
                    : Math.floor(state.costs.autoFood * 2.5);
                if (state.activeChallenge !== 'endless' && state.autoFoodLevel >= AUTO_TICK_TIERS.length - 1) {
                    shopBtns.autoFood.disabled = true;
                    shopCosts.autoFood.innerText = 'MAX';
                }
            } else if (item === 'autoWater') {
                state.autoWaterLevel = (state.autoWaterLevel || 0) + 1;
                state.costs.autoWater = state.activeChallenge === 'endless'
                    ? Math.round(100 * Math.pow(1.5, state.autoWaterLevel))
                    : Math.floor(state.costs.autoWater * 2.5);
                if (state.activeChallenge !== 'endless' && state.autoWaterLevel >= AUTO_TICK_TIERS.length - 1) {
                    shopBtns.autoWater.disabled = true;
                    shopCosts.autoWater.innerText = 'MAX';
                }
            } else if (item === 'autoFoodAmt') {
                state.autoFoodAmtLevel = (state.autoFoodAmtLevel || 0) + 1;
                state.costs.autoFoodAmt = Math.floor(state.costs.autoFoodAmt * 2);
            } else if (item === 'autoWaterAmt') {
                state.autoWaterAmtLevel = (state.autoWaterAmtLevel || 0) + 1;
                state.costs.autoWaterAmt = Math.floor(state.costs.autoWaterAmt * 2);
            } else if (item === 'autoCollect') {
                if (state.activeChallenge === 'manual') return; // Roto
                const _acLvl = state.autoCollectLevel || 0;
                state.autoCollectLevel = _acLvl + 1;
                playSound(sfxMachineCreate, 0.7); _machineCreateFx('belt');
                if (state.activeChallenge === 'endless') {
                    state.costs.autoCollect = Math.ceil(state.costs.autoCollect * (1.5 + _acLvl * 0.05));
                } else {
                    const costsColl = [25, 250, 5000, 100000, 2000000];
                    if (state.autoCollectLevel < 5) state.costs.autoCollect = costsColl[state.autoCollectLevel];
                    if (state.autoCollectLevel >= 5) {
                        shopBtns.autoCollect.disabled = true;
                        shopCosts.autoCollect.innerText = 'MAX';
                    }
                }
            } else if (item === 'autoSell') {
                const _asLvl = state.autoSellLevel || 0;
                state.autoSellLevel = _asLvl + 1;
                playSound(sfxMachineCreate, 0.7); _machineCreateFx('belt');
                if (state.activeChallenge === 'endless') {
                    state.costs.autoSell = Math.ceil(state.costs.autoSell * (1.5 + _asLvl * 0.05));
                } else {
                    const costsSell = [100, 5000, 100000, 2000000, 10000000];
                    if (state.autoSellLevel < 5) state.costs.autoSell = costsSell[state.autoSellLevel];
                    if (state.autoSellLevel >= 5) {
                        shopBtns.autoSell.disabled = true;
                        shopCosts.autoSell.innerText = 'MAX';
                    }
                }
            } else if (item === 'refill') {
                state.refillLevel++;
                state.costs.refill = state.activeChallenge === 'endless'
                    ? Math.ceil(state.costs.refill * 1.5)
                    : Math.floor(state.costs.refill * 2.5);
                if (state.activeChallenge !== 'endless' && state.refillLevel >= REFILL_TIERS.length - 1) {
                    shopBtns.refill.disabled = true;
                    shopCosts.refill.innerText = 'MAX';
                }
            } else if (item === 'premium') {
                state.premiumLevel++;
                state.costs.premium = state.activeChallenge === 'endless'
                    ? Math.ceil(state.costs.premium * 1.5)
                    : Math.floor(state.costs.premium * 2);
                if (state.activeChallenge === 'endless' && state.premiumLevel >= 100) {
                    shopBtns.premium.disabled = true;
                    shopCosts.premium.innerText = 'MAX';
                } else if (state.activeChallenge !== 'endless' && state.premiumLevel >= 10) {
                    shopBtns.premium.disabled = true;
                    shopCosts.premium.innerText = 'MAX';
                }
            } else if (item === 'golden') {
                state.goldenLevel = (state.goldenLevel || 0) + 1;
                state.costs.golden = Math.floor(state.costs.golden * 2);
                const _goldenMax = state.activeChallenge === 'endless' ? 75 : 10;
                if ((state.goldenLevel || 0) >= _goldenMax) {
                    shopBtns.golden.disabled = true;
                    shopCosts.golden.innerText = 'MAX';
                }
            } else if (item === 'box') {
                state.hasBox = true;
                state.boxEggs = [];
                state.boxX = BOX_SHELF_X + (BOX_SHELF_W - BOX_W) / 2;
                state.boxY = BOX_SHELF_TOP - BOX_H;
            } else if (item === 'baseValue') {
                const _bvMultiplier = state.activeChallenge === 'endless'
                    ? 1.25 + (state.baseValueLevel || 0) * 0.02
                    : 1.75 + (state.baseValueLevel || 0) * 0.06;
                state.baseValueLevel++;
                state.costs.baseValue = Math.floor(state.costs.baseValue * _bvMultiplier);
                const _evMult = state.activeChallenge === 'endless' ? 1.1 : 1.5;
                eggsArr.forEach(e => e.value *= _evMult);
                state.packageBuffer = state.packageBuffer.map(v => {
                    if (typeof v === 'object') {
                        v.value *= _evMult;
                        return v;
                    }
                    return v * _evMult;
                });
            } else if (item === 'washer') {
                state.hasWasher = true;
                playSound(sfxMachineCreate, 0.7); _machineCreateFx('washer');
                if (state.activeChallenge === 'endless') {
                    const _wLvl = state.washerLevel || 0;
                    state.washerLevel = _wLvl + 1;
                    state.costs.washer = Math.floor(state.costs.washer * (1.35 + _wLvl * 0.05));
                } else {
                    shopBtns.washer.disabled = true;
                    shopCosts.washer.innerText = 'MAX';
                }
            } else if (item === 'stamper') {
                state.hasStamper = true;
                playSound(sfxMachineCreate, 0.7); _machineCreateFx('stamper');
                if (state.activeChallenge === 'endless') {
                    const _sLvl = state.stamperLevel || 0;
                    state.stamperLevel = _sLvl + 1;
                    state.costs.stamper = Math.ceil(state.costs.stamper * (1.40 + _sLvl * 0.05));
                    shopCosts.stamper.innerText = fmtS(state.costs.stamper);
                } else {
                    shopBtns.stamper.disabled = true;
                    shopCosts.stamper.innerText = 'MAX';
                }
            } else if (item === 'packager') {
                state.hasPackager = true;
                playSound(sfxMachineCreate, 0.7); _machineCreateFx('packager');
                if (state.activeChallenge === 'endless') {
                    const _pkLvl = state.packagerLevel || 0;
                    state.packagerLevel = _pkLvl + 1;
                    state.costs.packager = Math.ceil(state.costs.packager * (1.45 + _pkLvl * 0.05));
                    shopCosts.packager.innerText = fmtS(state.costs.packager);
                } else {
                    shopBtns.packager.disabled = true;
                    shopCosts.packager.innerText = 'MAX';
                }
            } else if (item === 'ribbon') {
                state.hasRibbon = true;
                playSound(sfxMachineCreate, 0.7); _machineCreateFx('ribbon');
                if (state.activeChallenge === 'endless') {
                    const _rbLvl = state.ribbonLevel || 0;
                    state.ribbonLevel = _rbLvl + 1;
                    state.costs.ribbon = Math.ceil(state.costs.ribbon * (1.25 + _rbLvl * 0.05));
                    shopCosts.ribbon.innerText = fmtS(state.costs.ribbon);
                } else {
                    shopBtns.ribbon.disabled = true;
                    shopCosts.ribbon.innerText = 'MAX';
                }
            } else if (item === 'sorter') {
                state.hasSorter = true;
                state.sorterLevel = (state.sorterLevel || 0) + 1;
                state.costs.sorter = Math.round(250 * Math.pow(2, state.sorterLevel - 1));
                if (state.sorterLevel >= 10) {
                    shopBtns.sorter.disabled = true;
                    shopCosts.sorter.innerText = 'MAX';
                }
            } else if (item === 'sortBonus') {
                state.sortBonusLevel = (state.sortBonusLevel || 0) + 1;
                state.costs.sortBonus = Math.round(500 * Math.pow(2.5, state.sortBonusLevel - 1));
                if (state.sortBonusLevel >= 10) {
                    shopBtns.sortBonus.disabled = true;
                    shopCosts.sortBonus.innerText = 'MAX';
                }
            } else if (item === 'music') {
                state.musicLevel++;
                state.costs.music = Math.floor(state.costs.music * (state.activeChallenge === 'endless' ? 1.3 : 2));
                updateBGM();
                // Ensure BGM starts — direct play in user gesture context as fallback
                if (!window.isMusicMuted && !window.isBgmMuted && bgmTheme.paused) {
                    bgmTheme.volume = 0.1;
                    bgmTheme.load();
                    bgmTheme.play().catch(() => { });
                }
                if (state.activeChallenge !== 'endless' && state.musicLevel >= 10) {
                    shopBtns.music.disabled = true;
                    shopCosts.music.innerText = 'MAX';
                }
            } else if (item === 'diet') {
                state.dietLevel++;
                if (state.activeChallenge === 'endless') {
                    state.costs.diet = Math.ceil(state.costs.diet * 1.5);
                } else {
                    state.costs.diet = Math.floor(state.costs.diet * 2.5);
                    if (state.dietLevel >= 4) {
                        shopBtns.diet.disabled = true;
                        shopCosts.diet.innerText = 'MAX';
                    }
                }
            } else if (item === 'batch') {
                state.batchLevel = (state.batchLevel || 0) + 1;
                if (state.activeChallenge === 'endless') {
                    state.costs.batch = Math.ceil(state.costs.batch * 3.5);
                } else {
                    state.costs.batch = state.batchLevel === 1 ? 500000 : 0;
                    if (state.batchLevel >= 2) {
                        shopBtns.batch.disabled = true;
                        shopCosts.batch.innerText = 'MAX';
                    }
                }
            } else if (item === 'magnet') {
                state.magnetLevel = (state.magnetLevel || 0) + 1;
                const mCosts = [10, 20, 40, 60, 100, 200, 400, 600, 1000, 2500, 5000, 10000];
                if (state.magnetLevel < mCosts.length) state.costs.magnet = mCosts[state.magnetLevel];
            } else if (item === 'rooster') {
                state.hasRooster = true;
                state.roosterLevel = (state.roosterLevel || 0) + 1;
                if (state.activeChallenge === 'endless') {
                    const _rCosts = [200, 5000, 100000, 1000000, 10000000, 100000000, 1000000000, 10000000000];
                    state.costs.rooster = _rCosts[state.roosterLevel] || 0;
                } else {
                    if (state.roosterLevel === 1) state.costs.rooster = 5000;
                    else if (state.roosterLevel === 2) state.costs.rooster = 100000;
                    else if (state.roosterLevel === 3) state.costs.rooster = 500000;
                    else if (state.roosterLevel === 4) state.costs.rooster = 2000000;
                }
                roostersArr.push(createRooster(true));
                let maxRooster = state.activeChallenge === 'endless' ? 8 : state.activeChallenge === 'adam' ? 5 : 3;
                if (state.activeChallenge !== 'endless' && state.roosterLevel >= maxRooster) {
                    shopBtns.rooster.disabled = true;
                    shopCosts.rooster.innerText = 'MAX';
                }
            } else if (item === 'growth') {
                state.growthLevel = (state.growthLevel || 0) + 1;
                if (state.activeChallenge === 'endless') {
                    state.costs.growth = Math.ceil(state.costs.growth * 1.2);
                } else {
                    state.costs.growth = Math.floor(state.costs.growth * 2.5);
                    if (state.growthLevel >= 10) {
                        shopBtns.growth.disabled = true;
                        shopCosts.growth.innerText = 'MAX';
                    }
                }
            } else if (item === 'tvAd') {
                const _tvLvl = state.tvAdLevel || 0;
                state.tvAdLevel = _tvLvl + 1;
                state.hasTvAd = true;
                playSound(sfxMachineCreate, 0.7); _machineCreateFx('tv');
                state.tvUpvotes = 0;
                if (state.activeChallenge !== 'endless') {
                    shopBtns.tvAd.disabled = true;
                    shopBtns.tvAd.style.display = 'none';
                } else {
                    state.costs.tvAd = Math.ceil(state.costs.tvAd * (1.35 + _tvLvl * 0.03));
                }
            } else if (item === 'retire') {
                canvas.style.cursor = 'var(--cur-hand)';
                window._cineOldChickens = state.chickens; // captured before arrays are cleared
                window.CinematicCore.start(state.activeChallenge, {
                    onCommonSetup: function () {
                        state.hasRetired = true;
                        // Retira la oferta de boost del shop al entrar en la cinemática.
                        // Es imprescindible hacerlo AQUÍ: update() hace un `return` temprano
                        // cuando hasRetired/cinemática está activa, así que _tickEndlessBoosts()
                        // deja de correr → el contador se congela y el panel se queda clavado
                        // en el shop, sin avanzar y sin poder aceptarse ni rechazarse.
                        state._boostCurrentOffer = null;
                        _ebSyncOfferUI();
                        window.CINEMATIC_ENTRY_Y1 = 180;
                        window.CINEMATIC_CHICKEN_Y1 = 100;
                        window.CINEMATIC_FORMATION_SPACING = 24;
                        checkAchievements();
                        localStorage.setItem('chickenIdleBeaten', 'true');
                        let _pbKey = 'pb_vanilla';
                        if (state.isSpeedrunMode) { localStorage.setItem('chickenIdleBeatenSpeedrun', 'true'); _pbKey = 'pb_speedrun'; }
                        else if (state.activeChallenge === 'adam') { localStorage.setItem('chickenIdleBeatenAdam', 'true'); _pbKey = 'pb_adam'; }
                        else if (state.activeChallenge === 'manual') { localStorage.setItem('chickenIdleBeatenManual', 'true'); _pbKey = 'pb_manual'; }
                        else { localStorage.setItem('chickenIdleBeatenVanilla', 'true'); }
                        const _curPB = parseFloat(localStorage.getItem(_pbKey) || 'Infinity');
                        if (state.playTime < _curPB) localStorage.setItem(_pbKey, state.playTime.toString());
                        const _rkB = document.getElementById('ranking-btn'), _wpB = document.getElementById('wipe-btn');
                        if (_rkB) _rkB.style.display = (state.isSpeedrunMode || state.activeChallenge === 'speedrun' || state.activeChallenge === 'endless') ? 'inline-block' : 'none';
                        if (_wpB) _wpB.style.display = 'none';
                        document.getElementById('shop').style.display = 'none';
                        chickensArr.forEach(function(c) { if (c.nameBubbleEl instanceof Element) c.nameBubbleEl.remove(); if (c.hintBubbleEl instanceof Element) c.hintBubbleEl.remove(); });
                        chicksArr.forEach(function(c) { if (c.nameBubbleEl instanceof Element) c.nameBubbleEl.remove(); });
                        chickensArr = []; eggsArr = []; chicksArr = []; roostersArr = []; tombstonesArr = []; particlesArr = []; draggedEggs = [];
                        _saleAcc = { total: 0, golden: 0, premium: 0, mega: 0, timer: 0 };
                        saveState();
                        updateUI();
                    },
                    onStatsUpdate: function () { _updateRetireStats(); }
                });
                updateUI();
                return;
            }

            updateUI();
        }
    }

    shopBtns.chicken.addEventListener('click', () => buy('chicken'));
    shopBtns.petting.addEventListener('click', () => buy('petting'));
    shopBtns.maxFood.addEventListener('click', () => buy('maxFood'));
    shopBtns.maxWater.addEventListener('click', () => buy('maxWater'));
    shopBtns.autoFood.addEventListener('click', () => buy('autoFood'));
    shopBtns.autoWater.addEventListener('click', () => buy('autoWater'));
    shopBtns.autoFoodAmt.addEventListener('click', () => buy('autoFoodAmt'));
    shopBtns.autoWaterAmt.addEventListener('click', () => buy('autoWaterAmt'));
    shopBtns.autoCollect.addEventListener('click', () => buy('autoCollect'));
    shopBtns.autoSell.addEventListener('click', () => buy('autoSell'));
    shopBtns.refill.addEventListener('click', () => buy('refill'));
    shopBtns.premium.addEventListener('click', () => buy('premium'));
    shopBtns.golden.addEventListener('click', () => buy('golden'));
    shopBtns.baseValue.addEventListener('click', () => {
        if (shopBtns.baseValue.classList.contains('free-ad-mode')) {
            buyWithAd('baseValue');
        } else {
            buy('baseValue');
            // Restore 1 free-ad token after a paid upgrade (CrazyGames: ad → pay → ad alternation)
            if (_adsSupported) { window.GameAds.replenishFree(); updateFreeAdButtons(); }
        }
    });
    shopBtns.washer.addEventListener('click', () => buy('washer'));
    shopBtns.stamper.addEventListener('click', () => buy('stamper'));
    shopBtns.packager.addEventListener('click', () => buy('packager'));
    shopBtns.ribbon.addEventListener('click', () => buy('ribbon'));
    if (shopBtns.sorter) shopBtns.sorter.addEventListener('click', () => buy('sorter'));
    if (shopBtns.sortBonus) shopBtns.sortBonus.addEventListener('click', () => buy('sortBonus'));
    shopBtns.music.addEventListener('click', () => buy('music'));
    shopBtns.diet.addEventListener('click', () => buy('diet'));
    if (shopBtns.megaChicken) shopBtns.megaChicken.addEventListener('click', () => buy('megaChicken'));
    if (shopBtns.gallinaPro) shopBtns.gallinaPro.addEventListener('click', () => buy('gallinaPro'));
    if (shopBtns.chickenGold) shopBtns.chickenGold.addEventListener('click', () => buy('chickenGold'));
    if (shopBtns.chickenGreen) shopBtns.chickenGreen.addEventListener('click', () => buy('chickenGreen'));
    if (shopBtns.chickenPurple) shopBtns.chickenPurple.addEventListener('click', () => buy('chickenPurple'));
    shopBtns.batch.addEventListener('click', () => buy('batch'));
    shopBtns.magnet.addEventListener('click', () => buy('magnet'));
    shopBtns.rooster.addEventListener('click', () => buy('rooster'));
    shopBtns.growth.addEventListener('click', () => buy('growth'));
    shopBtns.tvAd.addEventListener('click', () => buy('tvAd'));
    shopBtns.retire.addEventListener('click', () => buy('retire'));
    shopBtns.box.addEventListener('click', () => buy('box'));

    // =========================================================================
    // SHOP EXPANDABLE DRAWER (MOBILE)
    // =========================================================================
    const shopEl = document.getElementById('shop');
    const shopHeader = document.getElementById('shop-header');
    if (shopEl) {
        let touchStartY = 0;
        let touchStartX = 0;

        shopEl.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
        }, { passive: true });

        shopEl.addEventListener('touchend', (e) => {
            let touchEndY = e.changedTouches[0].clientY;
            let touchEndX = e.changedTouches[0].clientX;
            let diffY = touchStartY - touchEndY;
            let diffX = Math.abs(touchStartX - touchEndX);

            // Solo actuar si el movimiento es predominantemente vertical y HACIA ARRIBA
            if (Math.abs(diffY) > diffX && diffY > 40) {
                shopEl.classList.add('is-expanded');
                updateUI();
            }
        }, { passive: true });

        if (shopHeader) {
            shopHeader.addEventListener('click', (e) => {
                // Solo alternar si se pulsa en el área del header, no en sus botones
                if (e.target.tagName !== 'BUTTON') {
                    shopEl.classList.toggle('is-expanded');
                    updateUI();
                }
            });

            if (window.GAME_MODE === 'portrait' || window.GAME_MODE === 'desktop') {
                const infoBtn = document.createElement('button');
                infoBtn.id = 'shop-info-btn';
                infoBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (window.GAME_MODE === 'portrait') {
                        const isExpanded = shopEl.classList.contains('is-expanded');
                        const isInfo = shopEl.classList.contains('is-info');
                        if (!isExpanded) {
                            shopEl.classList.add('is-expanded');
                            if (!isInfo) shopEl.classList.add('is-info');
                        } else {
                            shopEl.classList.toggle('is-info');
                        }
                    } else {
                        shopEl.classList.toggle('is-info');
                    }
                    updateUI();
                });
                shopHeader.appendChild(infoBtn);
            }
        }
    }

    // --- Ad Functions — shared/ads.js (window.GameAds) ---
    const _localRequestAd = (cb) => window.GameAds.request(cb);

    function buyWithAd(item) {
        if (!window.GameAds.hasFree()) return;
        window.GameAds.request(() => {
            state.nextAdTime = state.playTime + 480;
            const cost = state.costs[item] || 0;
            state.money += cost;
            buy(item);
            window.GameAds.consume();
            updateFreeAdButtons();
        });
    }

    const FREE_AD_ITEMS = ['baseValue'];
    const _adsSupported = window.GAME_MARKET === 'crazygames' || window.GAME_MARKET === 'googleplay';

    function updateFreeAdButtons() {
        if (!_adsSupported) return;
        const inSpeedrun = !!(state.isSpeedrunMode || state.activeChallenge === 'speedrun');

        FREE_AD_ITEMS.forEach(item => {
            const paidBtn = document.getElementById('buy-' + item.toLowerCase());
            if (!paidBtn) return;
            const canAfford = !paidBtn.disabled;
            const isMax = paidBtn.querySelector('.btn-price')?.innerText === 'MAX';
            const showFree = !inSpeedrun && !canAfford && !isMax && window.GameAds.hasFree();
            paidBtn.classList.toggle('free-ad-mode', showFree);
            if (showFree) {
                paidBtn.disabled = false;
                const lvEl = paidBtn.querySelector(':scope > .lv-corner');
                if (lvEl) lvEl.textContent = 'FREE';
                const titleEl = paidBtn.querySelector(':scope > .btn-title');
                if (titleEl) {
                    const isInfo = shopEl && shopEl.classList.contains('is-expanded') && shopEl.classList.contains('is-info');
                    const _wa = window.t ? window.t('boostWatchAd') : 'WATCH AD';
                    titleEl.textContent = isInfo ? titleEl.textContent + ' - ' + _wa : _wa;
                }
            }
        });
    }

    let _iapToastTimer = null;
    function _showIapToast(text) {
        const el = document.getElementById('iap-toast');
        if (!el) return;
        document.getElementById('iap-toast-text').textContent = text;
        el.classList.add('show');
        clearTimeout(_iapToastTimer);
        _iapToastTimer = setTimeout(() => el.classList.remove('show'), 5000);
    }

    // scrollIntoView({block:'nearest', inline:'nearest'}) resultó poco fiable en
    // el WebView de Android (Capacitor) — no movía el scroll aunque el botón
    // estuviera fuera de vista. Cálculo manual con getBoundingClientRect (espacio
    // de viewport, inmune a offsetParent anidados como .shop-btn-wrapper) +
    // scrollTo suave, mucho más soportado que las opciones nuevas de scrollIntoView.
    function _scrollShopBtnIntoView(btn) {
        const scrollEl = document.getElementById('shop-scroll');
        const shopEl = document.getElementById('shop');
        if (!scrollEl || !shopEl) return;
        const isExpanded = shopEl.classList.contains('is-expanded');
        const br = btn.getBoundingClientRect();
        const sr = scrollEl.getBoundingClientRect();
        const PAD = 10;
        // TEMPORAL — diagnóstico, quitar tras confirmar
        console.log('[shop-scroll-DEBUG] isExpanded=', isExpanded,
            'btn.id=', btn.id,
            'br=', JSON.stringify({ left: br.left, right: br.right, top: br.top, bottom: br.bottom, width: br.width }),
            'sr=', JSON.stringify({ left: sr.left, right: sr.right, top: sr.top, bottom: sr.bottom, width: sr.width }),
            'scrollLeft(antes)=', scrollEl.scrollLeft, 'scrollWidth=', scrollEl.scrollWidth, 'clientWidth=', scrollEl.clientWidth,
            'overflowX=', getComputedStyle(scrollEl).overflowX);
        let _targetLeft = null, _targetTop = null;
        if (isExpanded) {
            if (br.top < sr.top) {
                _targetTop = scrollEl.scrollTop - (sr.top - br.top) - PAD;
            } else if (br.bottom > sr.bottom) {
                _targetTop = scrollEl.scrollTop + (br.bottom - sr.bottom) + PAD;
            }
            // Instantáneo (asignación directa), no scrollTo(behavior:'smooth'): con
            // updateUI() reordenando el DOM ~12 veces/seg, la animación suave se
            // interrumpía a mitad de camino cada vez (confirmado con logs: llegaba a
            // ~40% del recorrido y se quedaba clavada ahí para siempre).
            if (_targetTop !== null) scrollEl.scrollTop = _targetTop;
        } else {
            if (br.left < sr.left) {
                _targetLeft = scrollEl.scrollLeft - (sr.left - br.left) - PAD;
            } else if (br.right > sr.right) {
                _targetLeft = scrollEl.scrollLeft + (br.right - sr.right) + PAD;
            }
            if (_targetLeft !== null) scrollEl.scrollLeft = _targetLeft;
        }
        console.log('[shop-scroll-DEBUG] targetLeft=', _targetLeft, 'targetTop=', _targetTop,
            'scrollLeft(justo despues)=', scrollEl.scrollLeft);
        setTimeout(() => console.log('[shop-scroll-DEBUG] scrollLeft +100ms=', scrollEl.scrollLeft), 100);
        setTimeout(() => console.log('[shop-scroll-DEBUG] scrollLeft +500ms=', scrollEl.scrollLeft), 500);
    }

    // Aviso "hay una mejora comprable fuera de la vista" — pedido de feedback
    // de jugadores (portrait) y también pedido explícito de CrazyGames en
    // review ("show an indicator like down arrows" para las mejoras nuevas
    // al fondo de la tienda de desktop). En portrait la tienda alterna
    // colapsada (tira horizontal) / expandida (cuadrícula con scroll
    // vertical); en desktop es SIEMPRE cuadrícula con scroll vertical (sin
    // colapsar — ver body.mode-desktop #shop-header .shop-arrow{display:none}
    // en style.css), así que ahí se trata igual que "expandida" siempre.
    // Se llama al final del bucle de habilitación de shopBtns en updateUI()
    // (~12 veces/seg, ver _uiRefreshTimer) y también en cada scroll para que
    // desaparezca al instante en cuanto el jugador llega al botón.
    function _updateShopScrollHint() {
        const hintEl = document.getElementById('shop-scroll-hint');
        if (!hintEl) return;
        const scrollEl = document.getElementById('shop-scroll');
        const shopEl = document.getElementById('shop');
        if (!scrollEl || !shopEl) { hintEl.classList.remove('visible'); return; }
        const isExpanded = window.GAME_MODE === 'desktop' || shopEl.classList.contains('is-expanded');
        const sr = scrollEl.getBoundingClientRect();

        let hasHiddenBuyable = false;
        for (let key in shopBtns) {
            const btn = shopBtns[key];
            if (!btn || btn.disabled || btn.style.display === 'none' || btn.offsetParent === null) continue;
            const br = btn.getBoundingClientRect();
            if (isExpanded ? (br.top >= sr.bottom) : (br.left >= sr.right)) {
                hasHiddenBuyable = true;
                break;
            }
        }

        hintEl.classList.toggle('dir-down', isExpanded);
        hintEl.classList.toggle('dir-right', !isExpanded);
        hintEl.classList.toggle('visible', hasHiddenBuyable);
    }
    // Feedback inmediato mientras se scrollea, sin esperar al siguiente tick
    // throttlado de updateUI() (~83ms — casi imperceptible, pero por qué no).
    document.getElementById('shop-scroll')?.addEventListener('scroll', _updateShopScrollHint, { passive: true });

    function updateUI() {
        window.updateUI = updateUI;
        state.costs.chicken = _cappedChickenCost(state.purchasedChickens || 0);
        state.maxChickens = Math.max(state.maxChickens || 0, state.chickens);
        const _isEndless = state.activeChallenge === 'endless';
        const shopScroll = document.getElementById('shop-scroll');
        const savedScrollTop = shopScroll ? shopScroll.scrollTop : 0;

        // En Endless dinero y gallinas escalan mucho — formato corto (K/M/T...)
        // en vez del número completo con comas, igual que ya hacen los costes
        // de tienda vía fmtS.
        const _mv = _isEndless ? window.GameUtils.fmtShort(state.money) : fmtMoney(state.money);
        if (moneyEl._val !== _mv) { moneyEl._val = _mv; moneyEl.innerText = _mv; }
        if (chickensEl) {
            const _norm = chickensArr.filter(c => !c.mega).length;
            const _blue = chickensArr.filter(c => c.mega === 1).length;
            const _rose = chickensArr.filter(c => c.mega === 2).length;
            const _gold = chickensArr.filter(c => c.mega === 3).length;
            const _gren = chickensArr.filter(c => c.mega === 4).length;
            const _purp = chickensArr.filter(c => c.mega === 5).length;
            const _totalW = _norm + _blue * 10 + _rose * 50 + _gold * 500 + _gren * 2500 + _purp * 25000;
            const _cv = _isEndless ? window.GameUtils.fmtShort(_totalW) : fmt(_totalW);
            if (chickensEl._val !== _cv) { chickensEl._val = _cv; chickensEl.innerText = _cv; }
        }

        shopCosts.chicken.innerText = fmtS(state.costs.chicken);
        if (state.activeChallenge === 'adam') {
            shopBtns.chicken.disabled = true;
            shopCosts.chicken.innerText = 'BANNED';
            shopBtns.chicken.style.opacity = '0.5';
        } else {
            shopBtns.chicken.disabled = (state.money < state.costs.chicken);
            shopBtns.chicken.style.opacity = '';
        }
        shopBtns.chicken.classList.toggle('first-chicken', (chicksArr.length + chickensArr.length) === 0);

        let maxMagnet = state.activeChallenge === 'manual' ? 12 : 9;
        let maxRooster = state.activeChallenge === 'endless' ? 8 : state.activeChallenge === 'adam' ? 5 : 3;

        shopCosts.petting.innerText = fmtS(state.costs.petting);
        if (_isEndless || state.maxFoodLevel < 10) shopCosts.maxFood.innerText = fmtS(state.costs.maxFood);
        else shopCosts.maxFood.innerText = 'MAX';
        if (_isEndless || state.maxWaterLevel < 10) shopCosts.maxWater.innerText = fmtS(state.costs.maxWater);
        else shopCosts.maxWater.innerText = 'MAX';
        shopCosts.autoFood.innerText = fmtS(state.costs.autoFood);
        shopCosts.autoWater.innerText = fmtS(state.costs.autoWater);
        if (_isEndless || state.autoCollectLevel < 50) shopCosts.autoCollect.innerText = fmtS(state.costs.autoCollect);
        if (_isEndless || state.autoSellLevel < 50) shopCosts.autoSell.innerText = fmtS(state.costs.autoSell);
        shopCosts.refill.innerText = fmtS(state.costs.refill);
        if (shopCosts.autoFoodAmt) shopCosts.autoFoodAmt.innerText = fmtS(state.costs.autoFoodAmt);
        if (shopCosts.autoWaterAmt) shopCosts.autoWaterAmt.innerText = fmtS(state.costs.autoWaterAmt);
        shopCosts.premium.innerText = fmtS(state.costs.premium);
        const _goldenCapUI = _isEndless ? 75 : 10;
        if ((state.goldenLevel || 0) >= _goldenCapUI) {
            shopBtns.golden.disabled = true;
            shopCosts.golden.innerText = 'MAX';
        } else {
            shopCosts.golden.innerText = fmtS(state.costs.golden);
        }
        shopCosts.baseValue.innerText = fmtS(state.costs.baseValue);
        shopCosts.stamper.innerText = fmtS(state.costs.stamper);
        shopCosts.packager.innerText = fmtS(state.costs.packager);
        shopCosts.ribbon.innerText = fmtS(state.costs.ribbon);
        if (_isEndless || (state.growthLevel || 0) < 10) shopCosts.growth.innerText = fmtS(state.costs.growth);
        else shopCosts.growth.innerText = 'MAX';
        if (_isEndless || state.musicLevel < 10) {
            shopCosts.music.innerText = fmtS(state.costs.music);
        } else {
            shopBtns.music.disabled = true;
            shopCosts.music.innerText = 'MAX';
        }
        if (_isEndless || state.dietLevel < 4) shopCosts.diet.innerText = fmtS(state.costs.diet);
        if (_isEndless || (state.batchLevel || 0) < 2) shopCosts.batch.innerText = fmtS(state.costs.batch);

        if ((state.magnetLevel || 0) < maxMagnet) shopCosts.magnet.innerText = fmtS(state.costs.magnet);
        else shopCosts.magnet.innerText = 'MAX';

        if ((state.roosterLevel || 0) < maxRooster) shopCosts.rooster.innerText = fmtS(state.costs.rooster);
        else shopCosts.rooster.innerText = 'MAX';

        shopCosts.tvAd.innerText = fmtS(state.costs.tvAd);
        if (!state.hasRetired) shopCosts.retire.innerText = fmtS(state.costs.retire);
        if (!state.hasBox) shopCosts.box.innerText = fmtS(state.costs.box);

        // % e izquierda, Lv. a la derecha — misma fila
        const _row = (info, n) => n > 0
            ? `<br><span class="btn-row2"><span class="upg-info">${info}</span><span class="lv-corner">Lv.${n}</span></span>`
            : `<br><span class="upg-info">${info}</span>`;
        const _lv = n => n > 0 ? `<span class="lv-corner">Lv.${n}</span>` : '';
        const _inf = s => `<br><span class="upg-info">${s}</span>`;
        const _lvBadge = n => n > 0 ? _row('', n) : '';
        const _afL = state.autoFoodLevel, _awL = state.autoWaterLevel;
        if (_isEndless) {
            const _fmtSec = (lv) => { const v = Math.max(0.5, 10 * Math.pow(0.95, lv - 1)); return (v < 2 ? v.toFixed(2) : v.toFixed(1)) + 's'; };
            const _afSec = _afL > 0 ? _fmtSec(_afL) : '10s';
            const _afSecN = _fmtSec(_afL + 1);
            const _awSec = _awL > 0 ? _fmtSec(_awL) : '10s';
            const _awSecN = _fmtSec(_awL + 1);
            shopBtns.autoFood.querySelector('span:first-child').innerHTML = (window.t ? window.t("autoFood") : 'Auto-Food') + (_afL > 0 ? _row(`${_afSec} -> ${_afSecN}`, _afL) : _inf(`10s -> ${_awSecN}`));
            shopBtns.autoWater.querySelector('span:first-child').innerHTML = (window.t ? window.t("autoWater") : 'Auto-Water') + (_awL > 0 ? _row(`${_awSec} -> ${_awSecN}`, _awL) : _inf(`10s -> ${_awSecN}`));
            const _afaL = state.autoFoodAmtLevel || 0, _awaL = state.autoWaterAmtLevel || 0;
            const _afaCur = Math.round(5 * Math.pow(1.2, _afaL)), _afaNxt = Math.round(5 * Math.pow(1.2, _afaL + 1));
            const _awaCur = Math.round(5 * Math.pow(1.2, _awaL)), _awaNxt = Math.round(5 * Math.pow(1.2, _awaL + 1));
            if (shopBtns.autoFoodAmt) {
                shopBtns.autoFoodAmt.querySelector('span:first-child').innerHTML = (window.t ? window.t("autoFoodAmt") : 'Food Amount') + _row(`${_afaCur} -> ${_afaNxt}`, _afaL);
                shopBtns.autoFoodAmt.setAttribute('data-title', window.t ? window.t('autoFoodAmtDesc') : 'Increases the food dispensed per auto-feed tick. (+20% Food per level)');
            }
            if (shopBtns.autoWaterAmt) {
                shopBtns.autoWaterAmt.querySelector('span:first-child').innerHTML = (window.t ? window.t("autoWaterAmt") : 'Water Amount') + _row(`${_awaCur} -> ${_awaNxt}`, _awaL);
                shopBtns.autoWaterAmt.setAttribute('data-title', window.t ? window.t('autoWaterAmtDesc') : 'Increases the water dispensed per auto-water tick. (+20% Water per level)');
            }
        } else {
            shopBtns.autoFood.querySelector('span:first-child').innerHTML = (window.t ? window.t("autoFood") : 'Auto-Food') + getPips(_afL, AUTO_TICK_TIERS.length - 1);
            shopBtns.autoWater.querySelector('span:first-child').innerHTML = (window.t ? window.t("autoWater") : 'Auto-Water') + getPips(_awL, AUTO_TICK_TIERS.length - 1);
        }
        shopBtns.autoCollect.querySelector('span:first-child').innerHTML = (window.t ? window.t("farmBelt") : 'Farm Belt') + (_isEndless ? _lvBadge(state.autoCollectLevel) : getPips(state.autoCollectLevel, 5));
        shopBtns.autoSell.querySelector('span:first-child').innerHTML = (window.t ? window.t("storageBelt") : 'Storage Belt') + (_isEndless ? _lvBadge(state.autoSellLevel) : getPips(state.autoSellLevel, 5));
        if (_isEndless) {
            const _rfCur = _refillAmt(), _rfNxt = Math.round(50 * Math.pow(1.18, (state.refillLevel || 0) + 1));
            shopBtns.refill.querySelector('span:first-child').innerHTML = (window.t ? window.t("refill") : 'Refill') + _row(`${_rfCur} -> ${_rfNxt}`, state.refillLevel || 0);
        } else {
            shopBtns.refill.querySelector('span:first-child').innerHTML = (window.t ? window.t("refill") : 'Refill') + getPips(state.refillLevel || 0, REFILL_TIERS.length - 1);
        }
        const _mfL = state.maxFoodLevel || 0, _mwL = state.maxWaterLevel || 0;
        if (_isEndless) {
            const _mfCur = Math.round(100 * Math.pow(1.17, _mfL)), _mfNxt = Math.round(100 * Math.pow(1.17, _mfL + 1));
            const _mwCur = Math.round(100 * Math.pow(1.17, _mwL)), _mwNxt = Math.round(100 * Math.pow(1.17, _mwL + 1));
            shopBtns.maxFood.querySelector('span:first-child').innerHTML = (window.t ? window.t("maxFood") : 'Max Food') + _row(`${_mfCur} -> ${_mfNxt}`, _mfL);
            shopBtns.maxWater.querySelector('span:first-child').innerHTML = (window.t ? window.t("maxWater") : 'Max Water') + _row(`${_mwCur} -> ${_mwNxt}`, _mwL);
        } else {
            shopBtns.maxFood.querySelector('span:first-child').innerHTML = (window.t ? window.t("maxFood") : 'Max Food') + getPips(_mfL, 10);
            shopBtns.maxWater.querySelector('span:first-child').innerHTML = (window.t ? window.t("maxWater") : 'Max Water') + getPips(_mwL, 10);
        }
        shopBtns.premium.querySelector('span:first-child').innerHTML = (window.t ? window.t("premiumFeed") : `Premium Feed`) + (_isEndless ? _row(`${state.premiumLevel}%`, state.premiumLevel) : getPips(state.premiumLevel, 10));
        shopBtns.golden.querySelector('span:first-child').innerHTML = (window.t ? window.t("goldenEgg") : `Golden Egg`) + (_isEndless ? _row(`${state.goldenLevel || 0}%`, state.goldenLevel || 0) : getPips(state.goldenLevel || 0, 10));
        if (_isEndless) {
            const _mLvl = state.musicLevel || 0;
            const _mCur = (50 * (1 - Math.pow(0.9, _mLvl))).toFixed(1);
            const _mNxt = (50 * (1 - Math.pow(0.9, _mLvl + 1))).toFixed(1);
            shopBtns.music.querySelector('span:first-child').innerHTML = (window.t ? window.t("farmMusic") : 'Farm Music') + _row(`+${_mCur}% -> +${_mNxt}%`, _mLvl);
            shopBtns.music.setAttribute('data-title', window.t ? window.t('farmMusicDescE') : `Chickens lay eggs & move faster. (${_mLvl === 0 ? 'Level 1: +5%' : `Now: +${_mCur}%`}, max +50%)`);
        } else {
            shopBtns.music.querySelector('span:first-child').innerHTML = (window.t ? window.t("farmMusic") : 'Farm Music') + getPips(state.musicLevel, 10);
        }
        if (_isEndless) {
            const _dLvl = state.dietLevel || 0;
            const _dCur = (30 * Math.pow(0.98, _dLvl)).toFixed(2), _dNxt = (30 * Math.pow(0.98, _dLvl + 1)).toFixed(2);
            shopBtns.diet.querySelector('span:first-child').innerHTML = (window.t ? window.t("proDiet") : 'Pro Diet') + _row(`${_dCur}s -> ${_dNxt}s`, _dLvl);
            shopBtns.diet.setAttribute('data-title', window.t ? window.t('proDietDescE') : 'Specialized nutrition that speeds up egg laying. (-2% Lay Time per level)');
        } else {
            shopBtns.diet.querySelector('span:first-child').innerHTML = (window.t ? window.t("proDiet") : 'Pro Diet') + getPips(state.dietLevel, 4);
        }
        if (shopBtns.batch) {
            if (_isEndless) {
                const _bLvl = state.batchLevel || 0;
                shopBtns.batch.querySelector('span:first-child').innerHTML = (window.t ? window.t("dessertStomach") : "Dessert Stomach") + _row(`${2 + _bLvl} -> ${3 + _bLvl}`, _bLvl);
                shopBtns.batch.setAttribute('data-title', window.t ? window.t('dessertStomachDescE') : '+1 extra egg per meal per level (food cost scales proportionally).');
            } else {
                shopBtns.batch.querySelector('span:first-child').innerHTML = (window.t ? window.t("dessertStomach") : "Dessert Stomach") + getPips(state.batchLevel || 0, 2);
            }
        }
        if (_isEndless) {
            const _rLvl = state.roosterLevel || 0;
            shopBtns.rooster.querySelector('span:first-child').innerHTML = (window.t ? window.t("theRooster") : "The Rooster") + _row(`${_rLvl} -> ${_rLvl + 1}`, 0);
        } else {
            shopBtns.rooster.querySelector('span:first-child').innerHTML = (window.t ? window.t("theRooster") : "The Rooster") + getPips(state.roosterLevel || 0, maxRooster);
        }
        if (_isEndless) {
            const _gLvl = state.growthLevel || 0;
            const _gCur = Math.max(10, 450 * Math.pow(0.99, _gLvl)).toFixed(1);
            const _gNxt = Math.max(10, 450 * Math.pow(0.99, _gLvl + 1)).toFixed(1);
            shopBtns.growth.querySelector('span:first-child').innerHTML = (window.t ? window.t("growthFormula") : "Growth Formula") + _row(`${_gCur}s -> ${_gNxt}s`, _gLvl);
            shopBtns.growth.setAttribute('data-title', window.t ? window.t('growthFormulaDescE') : 'Speeds up chick maturation. (-1% per level, starts at 7.5 min)');
        } else {
            shopBtns.growth.querySelector('span:first-child').innerHTML = (window.t ? window.t("growthFormula") : "Growth Formula") + getPips(state.growthLevel || 0, 10);
        }
        shopBtns.magnet.querySelector('span:first-child').innerHTML = (window.t ? window.t("magnetForce") : "Magnet Force") + getPips(state.magnetLevel || 0, maxMagnet);
        {
            const _tvLvl = state.tvAdLevel || 0;
            const _tvCurPct = Math.max(1, _tvLvl) * 20, _tvNxtPct = Math.max(1, _tvLvl + 1) * 20;
            shopBtns.tvAd.querySelector('span:first-child').innerHTML = (window.t ? window.t("asSeenOnTV") : "As Seen On TV") + (_isEndless ? (_tvLvl > 0 ? _row(`+${_tvCurPct}% -> +${_tvNxtPct}%`, _tvLvl) : _inf('+20%/lv')) : _inf('×2'));
            if (_isEndless) shopBtns.tvAd.setAttribute('data-title', window.t ? window.t('asSeenOnTVDescE') : 'Your farm goes viral on TV! (+20% egg sale value per level, stacks multiplicatively)');
        }
        const _wL = state.washerLevel || 0;
        shopBtns.washer.querySelector('span:first-child').innerHTML = (window.t ? window.t("eggWasher") : 'Egg Washer') + (_isEndless ? (_wL > 0 ? _row(`+${_wL * 12}% -> +${(_wL + 1) * 12}%`, _wL) : _inf('+12%/lv')) : '');
        shopCosts.washer.innerText = fmtS(state.costs.washer);
        const _stL = state.stamperLevel || 0;
        shopBtns.stamper.querySelector('span:first-child').innerHTML = (window.t ? window.t("qualityStamp") : 'Quality Stamp') + (_isEndless ? (_stL > 0 ? _row(`+${_stL * 14}% -> +${(_stL + 1) * 14}%`, _stL) : _inf('+14%/lv')) : '');
        const _pkL = state.packagerLevel || 0;
        shopBtns.packager.querySelector('span:first-child').innerHTML = (window.t ? window.t("eggPackager") : 'Egg Packager') + (_isEndless ? (_pkL > 0 ? _row(`+${_pkL * 16}% -> +${(_pkL + 1) * 16}%`, _pkL) : _inf('+16%/lv')) : '');
        const _rbL = state.ribbonLevel || 0;
        shopBtns.ribbon.querySelector('span:first-child').innerHTML = (window.t ? window.t("premiumBox") : 'Premium Box') + (_isEndless ? (_rbL > 0 ? _row(`+${_rbL * 18}% -> +${(_rbL + 1) * 18}%`, _rbL) : _inf('+18%/lv')) : '');
        if (shopBtns.sorter && (state.sorterLevel || 0) < 10) {
            const _sLvl = state.sorterLevel || 0;
            shopCosts.sorter.innerText = fmtS(state.costs.sorter);
            shopBtns.sorter.querySelector('span:first-child').innerHTML = (window.t ? window.t('eggSorter') : 'Egg Sorter') + (_sLvl > 0 ? _row(`${_sLvl} -> ${_sLvl + 1} slots`, _sLvl) : _inf('1 slot/type'));
        }
        if (shopBtns.sortBonus && (state.sortBonusLevel || 0) < 10) {
            const _sbLvl = state.sortBonusLevel || 0;
            shopCosts.sortBonus.innerText = fmtS(state.costs.sortBonus || 500);
            shopBtns.sortBonus.querySelector('span:first-child').innerHTML = (window.t ? window.t('sortBonus') : 'Sort Bonus') + (_sbLvl > 0 ? _row(`+${_sbLvl * 25}%`, _sbLvl) : _inf('+25%/lv'));
        }
        const _bvL = state.baseValueLevel || 0;
        const _evMult = state.activeChallenge === 'endless' ? 1.1 : 1.5;
        const _evAccum = _bvL > 0 ? '+' + Math.round((Math.pow(_evMult, _bvL) - 1) * 100) + '%' : '+' + Math.round((_evMult - 1) * 100) + '%';
        shopBtns.baseValue.querySelector('span:first-child').innerHTML = (window.t ? window.t("eggValue") : 'Egg Value') + _row(_evAccum, _bvL);
        const _pl = state.pettingLevel || 0;
        if (_isEndless) {
            const _pCur = (20 * (1 - Math.pow(0.95, _pl))).toFixed(2);
            const _pNxt = (20 * (1 - Math.pow(0.95, _pl + 1))).toFixed(2);
            shopBtns.petting.querySelector('span:first-child').innerHTML = (window.t ? window.t("happyPetting") : "Happy Petting") + _row(`${_pCur}% -> ${_pNxt}%`, _pl);
            shopBtns.petting.setAttribute('data-title', window.t ? window.t('happyPettingDescE') : `Pet chickens to reduce their egg timer. (${_pl === 0 ? 'Level 1: ~0.3s' : `Now: ~${(30 * 20 * (1 - Math.pow(0.95, _pl)) / 100).toFixed(1)}s`} per pet, diminishing returns)`);
        } else {
            shopBtns.petting.querySelector('span:first-child').innerHTML = (window.t ? window.t("happyPetting") : "Happy Petting") + _lvBadge(0);
        }

        // Endless-specific sublabels (current → next) and corrected data-titles
        if (_isEndless) {
            const _pmL = state.premiumLevel || 0;
            shopBtns.premium.querySelector('span:first-child').innerHTML =
                (window.t ? window.t('premiumFeedEndless') : 'Blue Egg (+1%)') + _row(`${_pmL}% -> ${_pmL + 1}%`, _pmL);
            shopBtns.premium.setAttribute('data-title', window.t ? window.t('premiumFeedDescE') : 'A chance to lay a rare blue egg. (+1% Chance per level, x2 Value)');
            const _glL = state.goldenLevel || 0;
            shopBtns.golden.querySelector('span:first-child').innerHTML =
                (window.t ? window.t('goldenEgg') : 'Golden Egg') + _row(`${_glL}% -> ${_glL + 1}%`, _glL);
            shopBtns.golden.setAttribute('data-title', window.t ? window.t('goldenEggDescE') : 'Rare chance to lay legendary golden eggs. (+1% Chance per level)');
            const _sub = (key, fallback, lvl, pct) =>
                (window.t ? window.t(key) : fallback) + _row(`+${lvl * pct}% -> +${(lvl + 1) * pct}%`, lvl);
            shopBtns.baseValue.querySelector('span:first-child').innerHTML =
                (window.t ? window.t("eggValue") : 'Egg Value') + _row(`×${Math.pow(1.1, _bvL).toFixed(2)} -> ×${Math.pow(1.1, _bvL + 1).toFixed(2)}`, _bvL);
            shopBtns.baseValue.setAttribute('data-title', window.t ? window.t('eggValueDescE') : 'Enhances the innate quality of all eggs. (+10% Base Value per level)');
            shopBtns.washer.querySelector('span:first-child').innerHTML = _sub('eggWasher', 'Egg Washer', _wL, 12);
            shopBtns.washer.setAttribute('data-title', window.t ? window.t('eggWasherDescE') : 'Cleans eggs as they pass through. (+12% Value per level)');
            shopBtns.stamper.querySelector('span:first-child').innerHTML = _sub('qualityStamp', 'Quality Stamp', _stL, 14);
            shopBtns.stamper.setAttribute('data-title', window.t ? window.t('qualityStampDescE') : 'Certifies egg quality for a higher market price. (+14% Value per level)');
            shopBtns.packager.querySelector('span:first-child').innerHTML = _sub('eggPackager', 'Egg Packager', _pkL, 16);
            shopBtns.packager.setAttribute('data-title', window.t ? window.t('eggPackagerDescE') : 'Boxes eggs in dozens for massive profits. (+16% Value per level)');
            shopBtns.ribbon.querySelector('span:first-child').innerHTML = _sub('premiumBox', 'Premium Box', _rbL, 18);
            shopBtns.ribbon.setAttribute('data-title', window.t ? window.t('premiumBoxDescE') : 'Wraps packages in luxurious gold foil packaging. (+18% Value per level)');
        } else {
            shopBtns.baseValue.setAttribute('data-title', window.t ? window.t('eggValueDesc') : 'Enhances the innate quality of all eggs. (x1.5 Base Value)');
            shopBtns.washer.setAttribute('data-title', window.t ? window.t('eggWasherDesc') : 'Cleans eggs to dramatically increase their market value. (x2 Value Multiplier)');
            shopBtns.stamper.setAttribute('data-title', window.t ? window.t('qualityStampDesc') : 'Certifies egg quality for a higher market price. (x2 Value Multiplier)');
            shopBtns.packager.setAttribute('data-title', window.t ? window.t('eggPackagerDesc') : 'Boxes eggs in dozens for massive profits. (x2 Value Multiplier)');
            shopBtns.ribbon.setAttribute('data-title', window.t ? window.t('premiumBoxDesc') : 'Wraps your eggs in luxurious matte black and gold foil packaging. (x2 Value Multiplier)');
        }

        // Visibility configuration
        const _bothBelts = state.autoCollectLevel >= 1 && state.autoSellLevel >= 1;
        // Endless: maxFood/Water unlock when 10 chickens; non-endless: when maxChickens >= 9
        shopBtns.maxFood.style.display = (_isEndless ? (state.maxChickens || 0) >= 10 : (state.maxChickens >= 9 && state.maxFoodLevel < 10)) ? 'grid' : 'none';
        shopBtns.maxWater.style.display = (_isEndless ? (state.maxChickens || 0) >= 10 : (state.maxChickens >= 9 && state.maxWaterLevel < 10)) ? 'grid' : 'none';

        shopBtns.autoCollect.style.display = (state.eggsSold < 25 || (!_isEndless && state.autoCollectLevel >= 5)) ? 'none' : 'grid';
        if (state.activeChallenge === 'manual') {
            shopBtns.autoCollect.style.display = 'grid';
            shopBtns.autoCollect.style.opacity = '0.5';
            shopCosts.autoCollect.innerText = 'BROKEN';
        } else {
            shopBtns.autoCollect.style.opacity = '';
        }

        shopBtns.autoSell.style.display = ((state.autoCollectLevel < 1 && state.activeChallenge !== 'manual') || (!_isEndless && state.autoSellLevel >= 5)) ? 'none' : 'grid';
        shopBtns.washer.style.display = (state.autoSellLevel < 1 || (state.activeChallenge !== 'endless' && state.hasWasher)) ? 'none' : 'grid';
        shopBtns.stamper.style.display = (!state.hasWasher || (!_isEndless && state.hasStamper)) ? 'none' : 'grid';
        shopBtns.packager.style.display = (!state.hasStamper || (!_isEndless && state.hasPackager)) ? 'none' : 'grid';
        shopBtns.ribbon.style.display = (!state.hasPackager || (!_isEndless && state.hasRibbon)) ? 'none' : 'grid';
        if (shopBtns.sorter) shopBtns.sorter.style.display = 'none';
        if (shopBtns.sortBonus) shopBtns.sortBonus.style.display = 'none';
        shopBtns.music.style.display = (state.maxChickens < 20 || (!_isEndless && state.musicLevel >= 10)) ? 'none' : 'grid';
        shopBtns.diet.style.display = (state.maxChickens < 30 || (!_isEndless && state.dietLevel >= 4)) ? 'none' : 'grid';
        if (shopBtns.batch) shopBtns.batch.style.display = (state.dietLevel < 3 || (!_isEndless && (state.batchLevel || 0) >= 2)) ? 'none' : 'grid';
        // ── Chicken tiers unlock logic (permanent flags) ──────────────────────
        if (_isEndless) {
            const _nC = chickensArr.filter(c => !c.mega).length;
            const _bC = chickensArr.filter(c => c.mega === 1).length;
            const _rC = chickensArr.filter(c => c.mega === 2).length;
            const _gC = chickensArr.filter(c => c.mega === 3).length;
            const _grC = chickensArr.filter(c => c.mega === 4).length;
            if (!state.blueUnlocked && _nC >= 150) state.blueUnlocked = true;
            if (!state.roseUnlocked && _bC >= 15) state.roseUnlocked = true;
            if (!state.goldUnlocked && _rC >= 15) state.goldUnlocked = true;
            if (!state.greenUnlocked && _gC >= 10) state.greenUnlocked = true;
            if (!state.purpleUnlocked && _grC >= 20) state.purpleUnlocked = true;

            // Blue: unlock 150 normals, cost 10 normals — o directamente su
            // equivalente en $ si no tienes 10 normales físicas a mano (ver
            // _tierMoneyCost / buy('megaChicken')). Mismo patrón para las
            // otras 4: fusión física si hay stock, si no su coste en $.
            if (shopBtns.megaChicken) {
                shopBtns.megaChicken.style.display = state.blueUnlocked ? 'grid' : 'none';
                if (state.blueUnlocked) {
                    const _c = state.megaChickens || 0;
                    shopBtns.megaChicken.querySelector('span:first-child').innerHTML = (window.t ? window.t('chickenBlue') : 'Blue Chicken') + _row(`${_c} -> ${_c + 1}`, _c);
                    if (_nC >= 10) {
                        shopBtns.megaChicken.disabled = false;
                        if (shopCosts.megaChicken) shopCosts.megaChicken.textContent = `10 ${window.t ? window.t('chickens').replace(':', '').trim() : 'Chickens'}`;
                    } else {
                        const _cost = _tierMoneyCost(1);
                        shopBtns.megaChicken.disabled = state.money < _cost;
                        if (shopCosts.megaChicken) shopCosts.megaChicken.textContent = fmtS(_cost);
                    }
                }
            }
            // Rose: unlock 15 Blues, cost 5 Blues
            if (shopBtns.gallinaPro) {
                shopBtns.gallinaPro.style.display = state.roseUnlocked ? 'grid' : 'none';
                if (state.roseUnlocked) {
                    const _c = state.gallinaPros || 0;
                    shopBtns.gallinaPro.querySelector('span:first-child').innerHTML = (window.t ? window.t('chickenRose') : 'Rose Chicken') + _row(`${_c} -> ${_c + 1}`, _c);
                    if (_bC >= 5) {
                        shopBtns.gallinaPro.disabled = false;
                        if (shopCosts.gallinaPro) shopCosts.gallinaPro.textContent = `5 ${window.t ? window.t('blues') : 'Blues'}`;
                    } else {
                        const _cost = _tierMoneyCost(2);
                        shopBtns.gallinaPro.disabled = state.money < _cost;
                        if (shopCosts.gallinaPro) shopCosts.gallinaPro.textContent = fmtS(_cost);
                    }
                }
            }
            // Gold: unlock 15 Roses, cost 10 Roses
            if (shopBtns.chickenGold) {
                shopBtns.chickenGold.style.display = state.goldUnlocked ? 'grid' : 'none';
                if (state.goldUnlocked) {
                    const _c = state.chickenGolds || 0;
                    shopBtns.chickenGold.querySelector('span:first-child').innerHTML = (window.t ? window.t('chickenGold') : 'Gold Chicken') + _row(`${_c} -> ${_c + 1}`, _c);
                    if (_rC >= 10) {
                        shopBtns.chickenGold.disabled = false;
                        if (shopCosts.chickenGold) shopCosts.chickenGold.textContent = `10 ${window.t ? window.t('roses') : 'Roses'}`;
                    } else {
                        const _cost = _tierMoneyCost(3);
                        shopBtns.chickenGold.disabled = state.money < _cost;
                        if (shopCosts.chickenGold) shopCosts.chickenGold.textContent = fmtS(_cost);
                    }
                }
            }
            // Green: unlock 10 Golds, cost 5 Golds
            if (shopBtns.chickenGreen) {
                shopBtns.chickenGreen.style.display = state.greenUnlocked ? 'grid' : 'none';
                if (state.greenUnlocked) {
                    const _c = state.chickenGreens || 0;
                    shopBtns.chickenGreen.querySelector('span:first-child').innerHTML = (window.t ? window.t('chickenGreen') : 'Green Chicken') + _row(`${_c} -> ${_c + 1}`, _c);
                    if (_gC >= 5) {
                        shopBtns.chickenGreen.disabled = false;
                        if (shopCosts.chickenGreen) shopCosts.chickenGreen.textContent = `5 ${window.t ? window.t('golds') : 'Golds'}`;
                    } else {
                        const _cost = _tierMoneyCost(4);
                        shopBtns.chickenGreen.disabled = state.money < _cost;
                        if (shopCosts.chickenGreen) shopCosts.chickenGreen.textContent = fmtS(_cost);
                    }
                }
            }
            // Purple: unlock 20 Greens, cost 10 Greens
            if (shopBtns.chickenPurple) {
                shopBtns.chickenPurple.style.display = state.purpleUnlocked ? 'grid' : 'none';
                if (state.purpleUnlocked) {
                    const _c = state.chickenPurples || 0;
                    shopBtns.chickenPurple.querySelector('span:first-child').innerHTML = (window.t ? window.t('chickenPurple') : 'Purple Chicken') + _row(`${_c} -> ${_c + 1}`, _c);
                    if (_grC >= 10) {
                        shopBtns.chickenPurple.disabled = false;
                        if (shopCosts.chickenPurple) shopCosts.chickenPurple.textContent = `10 ${window.t ? window.t('greens') : 'Greens'}`;
                    } else {
                        const _cost = _tierMoneyCost(5);
                        shopBtns.chickenPurple.disabled = state.money < _cost;
                        if (shopCosts.chickenPurple) shopCosts.chickenPurple.textContent = fmtS(_cost);
                    }
                }
            }
        } else {
            if (shopBtns.megaChicken) shopBtns.megaChicken.style.display = 'none';
            if (shopBtns.gallinaPro) shopBtns.gallinaPro.style.display = 'none';
            if (shopBtns.chickenGold) shopBtns.chickenGold.style.display = 'none';
            if (shopBtns.chickenGreen) shopBtns.chickenGreen.style.display = 'none';
            if (shopBtns.chickenPurple) shopBtns.chickenPurple.style.display = 'none';
        }

        shopBtns.magnet.style.display = (state.maxChickens >= 3 && (state.magnetLevel || 0) < maxMagnet) ? 'grid' : 'none';

        shopBtns.rooster.style.display = (state.maxChickens >= 10 && (state.roosterLevel || 0) < maxRooster) ? 'grid' : 'none';
        if (state.activeChallenge === 'adam') {
            shopBtns.rooster.style.display = ((state.roosterLevel || 0) < maxRooster) ? 'grid' : 'none';
        }

        shopBtns.growth.style.display = _isEndless
            ? ((state.roosterLevel || 0) >= 1 ? 'grid' : 'none')
            : ((state.roosterLevel || 0) < 2 || (state.growthLevel || 0) >= 10) ? 'none' : 'grid';
        shopBtns.retire.style.display = (state.activeChallenge !== 'endless' && (state.isSpeedrunMode || (state.totalEarnings && state.totalEarnings >= 100000000))) ? 'grid' : 'none';
        shopBtns.petting.style.display = (state.maxChickens < 1 || (!_isEndless && (state.pettingLevel || 0) >= 1)) ? 'none' : 'grid';

        // box: disabled in all modes
        shopBtns.box.style.display = 'none';

        // allMaxed and tvAd must be computed BEFORE _grpVis so the machinery header is correct
        let allMaxed = _isEndless ? (
            (state.maxFoodLevel >= 10 && state.maxWaterLevel >= 10) &&
            (state.autoFoodLevel >= 7 && state.autoWaterLevel >= 7) &&
            state.hasWasher &&
            (state.autoCollectLevel >= 25 || state.activeChallenge === 'manual') &&
            state.autoSellLevel >= 25 &&
            state.refillLevel >= 4 &&
            state.premiumLevel >= 10 &&
            (state.goldenLevel || 0) >= 10 &&
            state.hasStamper &&
            state.hasPackager &&
            state.hasRibbon &&
            (state.growthLevel || 0) >= 10 &&
            state.musicLevel >= 10 &&
            state.dietLevel >= 4 &&
            (state.batchLevel || 0) >= 2 &&
            (state.magnetLevel || 0) >= 9 &&
            (state.roosterLevel || 0) >= 3 &&
            state.hasBox
        ) : (
            state.maxFoodLevel >= 10 &&
            state.maxWaterLevel >= 10 &&
            state.autoFoodLevel >= AUTO_TICK_TIERS.length - 1 &&
            state.autoWaterLevel >= AUTO_TICK_TIERS.length - 1 &&
            (state.autoCollectLevel >= 5 || state.activeChallenge === 'manual') &&
            state.autoSellLevel >= 5 &&
            state.refillLevel >= REFILL_TIERS.length - 1 &&
            state.premiumLevel >= 10 &&
            (state.goldenLevel || 0) >= 10 &&
            state.hasWasher &&
            state.hasStamper &&
            state.hasPackager &&
            state.hasRibbon &&
            (state.growthLevel || 0) >= 10 &&
            state.musicLevel >= 10 &&
            state.dietLevel >= 4 &&
            (state.batchLevel || 0) >= 2 &&
            (state.magnetLevel || 0) >= 9 &&
            (state.roosterLevel || 0) >= 3
        );

        shopBtns.tvAd.style.display = _isEndless
            ? (state.hasPackager ? 'grid' : 'none')
            : (allMaxed && !state.hasTvAd ? 'grid' : 'none');

        // Show/hide group headers based on whether any button in each group is visible
        const _grpVis = (ids) => ids.some(id => { const b = document.getElementById(id); return b && b.style.display !== 'none'; });
        const _grp = (id, ids) => { const h = document.getElementById(id); if (!h) return; const v = _grpVis(ids) ? 'block' : 'none'; if (h.style.display !== v) h.style.display = v; };
        _grp('grp-farm', ['buy-chicken', 'buy-rooster', 'buy-growth', 'buy-petting', 'buy-diet', 'buy-batch', 'buy-music']);
        _grp('grp-resources', ['buy-maxfood', 'buy-maxwater', 'buy-refill', 'buy-autofood', 'buy-autowater', 'buy-autofood-amt', 'buy-autowater-amt']);
        _grp('grp-eggs', ['buy-basevalue', 'buy-premium', 'buy-golden', 'buy-magnet']);
        _grp('grp-machinery', ['buy-autocollect', 'buy-autosell', 'buy-washer', 'buy-stamper', 'buy-packager', 'buy-ribbon', 'buy-box', 'buy-tvAd', 'buy-sorter', 'buy-sortbonus']);
        _grp('grp-special', ['buy-retire']);
        const _gt = (id, key, fb) => { const h = document.getElementById(id); if (!h) return; const t = window.t ? window.t(key) : fb; if (h.textContent !== t) h.textContent = t; };
        _gt('grp-farm', 'shopGrpFarm', 'FARM');
        _gt('grp-resources', 'shopGrpResources', 'RESOURCES');
        _gt('grp-eggs', 'shopGrpEggs', 'EGGS');
        _gt('grp-machinery', 'shopGrpMachinery', 'MACHINERY');
        _gt('grp-special', 'shopGrpSpecial', 'SPECIAL');

        shopBtns.baseValue.style.display = (state.maxChickens < 4) ? 'none' : 'grid';
        shopBtns.premium.style.display = (state.baseValueLevel < 5 || (!_isEndless && state.premiumLevel >= 10)) ? 'none' : 'grid';
        shopBtns.golden.style.display = (state.premiumLevel < 3 || (!_isEndless && (state.goldenLevel || 0) >= 10)) ? 'none' : 'grid';
        shopBtns.refill.style.display = ((state.maxFoodLevel < 2 && state.maxWaterLevel < 2) || (!_isEndless && (state.refillLevel || 0) >= REFILL_TIERS.length - 1)) ? 'none' : 'grid';
        shopBtns.autoFood.style.display = (_isEndless ? (state.maxFoodLevel || 0) >= 2 : (state.maxFood >= 400 && state.autoFoodLevel < AUTO_TICK_TIERS.length - 1)) ? 'grid' : 'none';
        shopBtns.autoWater.style.display = (_isEndless ? (state.maxWaterLevel || 0) >= 2 : (state.maxWater >= 400 && state.autoWaterLevel < AUTO_TICK_TIERS.length - 1)) ? 'grid' : 'none';
        if (shopBtns.autoFoodAmt) shopBtns.autoFoodAmt.style.display = (_isEndless && (state.autoFoodLevel || 0) > 0 && (state.maxFoodLevel || 0) >= 2) ? 'grid' : 'none';
        if (shopBtns.autoWaterAmt) shopBtns.autoWaterAmt.style.display = (_isEndless && (state.autoWaterLevel || 0) > 0 && (state.maxWaterLevel || 0) >= 2) ? 'grid' : 'none';

        let maxConditions = {
            chicken: false,
            petting: _isEndless ? false : (state.pettingLevel || 0) >= 1,
            baseValue: false,
            box: state.hasBox,
            premium: false,
            golden: false,
            refill: false,
            maxFood: false,
            maxWater: false,
            autoFood: false,
            autoWater: false,
            autoCollect: !_isEndless && state.autoCollectLevel >= 5,
            autoSell: !_isEndless && state.autoSellLevel >= 5,
            washer: false,
            stamper: false,
            packager: false,
            ribbon: false,
            music: !_isEndless && state.musicLevel >= 10,
            diet: !_isEndless && state.dietLevel >= 4,
            batch: !_isEndless && (state.batchLevel || 0) >= 2,
            magnet: (state.magnetLevel || 0) >= maxMagnet,
            rooster: (state.roosterLevel || 0) >= maxRooster,
            growth: !_isEndless && (state.growthLevel || 0) >= 10,
            tvAd: false,
            retire: state.hasRetired
        };

        const _chickenDisc = _ebGetBonus('chickenDiscount');
        const _upgradeDisc = _ebGetBonus('upgradeDiscount');
        // Tier chicken buttons cost chickens, not money — their disabled state is set
        // earlier in the endless block and must not be overwritten by the money check below.
        const _tierChickenBtns = new Set(['megaChicken', 'gallinaPro', 'chickenGold', 'chickenGreen', 'chickenPurple']);

        for (let key in shopBtns) {
            let btn = shopBtns[key];
            if (!btn) continue;
            if (_tierChickenBtns.has(key)) continue;

            // "Mejora recién desbloqueada" — zoom sutil y breve cuando el botón pasa
            // de display:none a visible (todas las condiciones de desbloqueo de más
            // arriba en updateUI() ya se han aplicado a estas alturas, así que basta
            // comparar contra lo que valía display en el tick anterior). No dispara en
            // la primera carga (btn._prevDisplayForHint empieza undefined, no 'none').
            const _wasHiddenForHint = btn._prevDisplayForHint === 'none';
            const _nowVisibleForHint = btn.style.display !== 'none';
            if (_wasHiddenForHint && _nowVisibleForHint) {
                // Pedido explícito: que el scroll se mueva solo hasta la mejora recién
                // desbloqueada y LUEGO se destaque con el zoom — no a la vez, porque si
                // estaba fuera de la vista el zoom pasaba desapercibido.
                // OJO: updateUI() guarda shopScroll.scrollTop al principio (savedScrollTop)
                // y lo RESTAURA al final, después de _normalizeShopBtns() — si moviéramos
                // el scroll aquí (a mitad de updateUI(), dentro de este mismo bucle) esa
                // restauración lo deshacía en el mismo tick, así que no se veía moverse.
                // setTimeout(...,0) lo aplaza a después de que updateUI() termine del todo.
                btn.classList.remove('newly-available');
                clearTimeout(btn._newlyAvailableTimer);
                clearTimeout(btn._newlyAvailableScrollTimer);
                setTimeout(() => _scrollShopBtnIntoView(btn), 0);
                btn._newlyAvailableScrollTimer = setTimeout(() => {
                    btn.classList.add('newly-available');
                    btn._newlyAvailableTimer = setTimeout(() => btn.classList.remove('newly-available'), 2400);
                }, 450); // ~duración típica del scroll suave a esta distancia
            }
            btn._prevDisplayForHint = btn.style.display;

            let isMax = maxConditions[key];

            if (isMax) {
                if (window.infoMode) btn.style.display = 'grid';
                btn.classList.add('maxed-btn');
                btn.style.order = 1;
                if (shopCosts[key]) shopCosts[key].innerText = 'MAX';
                btn.disabled = true;
            } else {
                btn.classList.remove('maxed-btn');
                btn.style.order = 0;
                if (btn.style.display !== 'none') {
                    const _disc = key === 'chicken' ? _chickenDisc : _upgradeDisc;
                    const _base = state.costs[key] || 0;
                    const _eff = _disc > 0 ? Math.ceil(_base * Math.max(0, 1 - _disc)) : _base;
                    // La cinta (autoCollect) está rota a propósito en Egg Jam (manual) —
                    // el bloque de arriba ya la deja visible con opacidad 0.5 y "BROKEN"
                    // como precio, pero sin esto igualmente se habilitaba en cuanto había
                    // dinero suficiente (podía comprarse, cobraba, y no hacía nada).
                    btn.disabled = (key === 'retire') ? false
                        : (key === 'autoCollect' && state.activeChallenge === 'manual') ? true
                        : state.money < _eff;
                    if (shopCosts[key] && shopCosts[key].innerText !== 'MAX') {
                        if (_disc > 0 && _base > 0) {
                            shopCosts[key].classList.add('has-discount');
                            shopCosts[key].innerHTML = '<span style="opacity:0.5">' + fmtS(_base) + '</span><br>' + fmtS(_eff);
                        } else {
                            shopCosts[key].classList.remove('has-discount');
                        }
                    }
                }
            }
        }
        _updateShopScrollHint();

        if (window.infoMode) {
            document.querySelectorAll('.shop-desc-text').forEach(d => d.style.display = 'block');
        } else {
            document.querySelectorAll('.shop-desc-text').forEach(d => d.style.display = 'none');
        }

        document.querySelectorAll('.pixel-counter').forEach(el => {
            el.style.display = state.hasRetired ? 'none' : '';
        });

        const steamWishBtn = document.getElementById('steam-btn');
        if (steamWishBtn && window.PLATFORM.steamUrl && state.hasRetired) {
            let topbar = document.getElementById('topbar');
            if (topbar && steamWishBtn.parentNode !== topbar) {
                topbar.insertBefore(steamWishBtn, topbar.children[1]);
                steamWishBtn.style.margin = '0 auto';
                steamWishBtn.style.fontSize = '14px';
                steamWishBtn.style.padding = '10px 20px';
                steamWishBtn.style.display = 'block';
            }
        }

        // Endless mode panel visibility + score display + boost timer
        const endlessPanel = document.getElementById('endless-panel');
        if (endlessPanel) {
            const isEndless = state.activeChallenge === 'endless';
            endlessPanel.style.display = isEndless ? 'flex' : 'none';
            if (isEndless) {
                const scoreEl = document.getElementById('endless-score-display');
                if (scoreEl) scoreEl.innerText = fmtMoney(state.totalEarnings || 0);
            }
        }

        _normalizeShopBtns();
        if (shopScroll) shopScroll.scrollTop = savedScrollTop;
        updateFreeAdButtons();

        const removeAdsBtn = document.getElementById('remove-ads-btn');
        if (removeAdsBtn) {
            removeAdsBtn.style.display = (!state.adsRemoved && window.GameIAP.canPurchase()) ? '' : 'none';
        }

        _adjustHUDTextSizes();
    }

    function _adjustHUDTextSizes() {
        // ── Tamaños de fuente por modo ────────────────────────────────
        const FONT_SIZES = {
            desktop:  { min: 5, max: 18 },
            portrait: { min: 5, max: 12 },
            tablet:   { min: 5, max: 14 },
        };
        // ── Ancho máximo del área de texto del contador de dinero ─────
        // = min-width CSS − border izquierdo − 4px margen
        // (el texto puede solapar el borde decorativo derecho)
        const MONEY_MAX_W = {
            desktop:  218, // 300 − 78 − 4
            portrait: 164, // 240 − 72 − 4
            tablet:   240, // ajustar según min-width CSS tablet
        };
        // ─────────────────────────────────────────────────────────────

        const mode = window.GAME_MODE || 'desktop';
        const isTablet = mode === 'portrait' && (document.documentElement.clientWidth || window.innerWidth) >= 601;
        const modeKey = isTablet ? 'tablet' : mode;
        const sizes = FONT_SIZES[modeKey] ?? FONT_SIZES.desktop;
        let height = 48;
        let moneyMaxW = MONEY_MAX_W[modeKey] ?? MONEY_MAX_W.desktop;

        if (mode === 'portrait') height = 44;

        if (!_adjustHUDTextSizes.canvas) {
            _adjustHUDTextSizes.canvas = document.createElement('canvas');
        }
        const ctx = _adjustHUDTextSizes.canvas.getContext('2d');

        function adjustEl(el, isChicken) {
            if (!el) return;
            const text = el.innerText;
            if (el._lastAdjustText === text) return;
            el._lastAdjustText = text;

            // chicken: pink box is 37/57 source px scaled to render height
            // money: content area of 9-slice wrap (see moneyMaxW above)
            let maxW = 0;
            if (isChicken) {
                maxW = Math.floor(37 * (height / 27));
            } else {
                maxW = moneyMaxW;
            }

            maxW = Math.max(10, maxW - 2); // safety margin

            let chosenSize = sizes.min;
            for (let size = sizes.max; size >= sizes.min; size--) {
                ctx.font = `${size}px "Press Start 2P"`;
                const w = ctx.measureText(text).width || (text.length * size);
                if (w <= maxW) {
                    chosenSize = size;
                    break;
                }
            }
            el.style.fontSize = chosenSize + 'px';
        }

        adjustEl(chickensEl, true);
        adjustEl(moneyEl, false);
    }


    const SAVE_KEY_BY_MODE = {
        vanilla: 'chickenIdleSave',
        speedrun: 'chickenIdleSave_speedrun',
        adam: 'chickenIdleSave_adam',
        manual: 'chickenIdleSave_manual',
        endless: 'chickenIdleEndlessSave',
    };
    function _activeSaveKey() {
        return SAVE_KEY_BY_MODE[state.activeChallenge] ?? 'chickenIdleSave';
    }

    function saveState() {
        if (window.isWiping) return;
        window._suppressNameBubbles = false;
        let cleanRoosters = roostersArr.map(r => {
            let copy = { ...r };
            copy.targetChicken = null;
            copy._matingHen = null;
            if (copy.action === 'chase' || copy.action === 'goToMate' || copy.action === 'mating') copy.action = 'goToFood';
            return copy;
        });

        const cleanChickens = chickensArr.map(c => {
            const needsCopy = c.action === 'waitForMate' || c.nameBubbleEl != null || c.hintBubbleEl != null;
            if (!needsCopy) return c;
            const copy = { ...c };
            if (c.action === 'waitForMate') { copy.action = 'roam'; delete copy.waitForMateTimer; }
            delete copy.nameBubbleEl;
            delete copy.nameBubbleTimer;
            delete copy.hintBubbleEl;
            delete copy.hintBubbleTimer;
            return copy;
        });

        const _isCG = window.GAME_MARKET === 'crazygames';
        const saveData = {
            savedAt: Date.now(),
            state: state,
            chickensArr: _isCG ? cleanChickens.map((c, i) => i < 100 ? c : { slim: true, sleeping: c.action === 'sleeping' }) : cleanChickens,
            chicksArr: chicksArr,
            roostersArr: cleanRoosters,
            eggsArr: _isCG ? eggsArr.slice(-100) : eggsArr,
        };
        const _saveJson = JSON.stringify(saveData);
        console.log(`[SaveSize] ${_activeSaveKey()} → ${(_saveJson.length / 1024).toFixed(1)} KB | chickens:${saveData.chickensArr.length} eggs:${saveData.eggsArr?.length ?? 0} chicks:${saveData.chicksArr?.length ?? 0}`);
        window.GameSave.save(_activeSaveKey(), saveData);
        try { localStorage.setItem('lastPlayedChallenge', state.activeChallenge || 'vanilla'); } catch (_) {}

    }

    function loadState() {
        const _ac = window.GameSave.loadRaw('activeChallenge');
        const _sl = window.GameSave.loadRaw('chickenIdleActiveSlot');
        const _sr = window.GameSave.loadRaw('chickenIdleSpeedrun') === 'true';
        let _ch = (_ac === 'endless' || _sl === 'endless') ? 'endless'
            : (_ac && SAVE_KEY_BY_MODE[_ac]) ? _ac
                : _sr ? 'speedrun'
                    : 'vanilla';
        if (window.DEBUG) {
            const _last = localStorage.getItem('lastPlayedChallenge');
            if (_last && SAVE_KEY_BY_MODE[_last]) {
                _ch = _last;
                if (_last === 'speedrun') localStorage.setItem('chickenIdleSpeedrun', 'true');
                else localStorage.removeItem('chickenIdleSpeedrun');
                if (_last !== 'speedrun' && _last !== 'vanilla') localStorage.setItem('activeChallenge', _last);
                else localStorage.removeItem('activeChallenge');
                if (_last === 'endless') localStorage.setItem('chickenIdleActiveSlot', 'endless');
                else localStorage.removeItem('chickenIdleActiveSlot');
            }
        }
        let data = window.GameSave.load(SAVE_KEY_BY_MODE[_ch] ?? 'chickenIdleSave');
        // Legacy de un solo slot: versiones muy viejas (antes de adam/manual/endless
        // tener su propia clave) guardaban TODO bajo "chickenIdleSave", el modo que
        // fuera — no había claves separadas por reto. Si el modo detectado (por la
        // clave "activeChallenge", o por el flag legacy chickenIdleSpeedrun)
        // todavía no tiene datos en SU clave nueva (p.ej. chickenIdleSave_adam),
        // pero SÍ hay un guardado viejo de formato plano, es ese mismo progreso —
        // se usa como si ya estuviera en su slot nuevo. Ya no exige que el propio
        // blob tenga "activeChallenge" embebido y coincida: _ch ya viene resuelto
        // desde la clave externa (la fuente de verdad de qué modo era), así que
        // basta con que exista el blob plano.
        // EXCEPCIÓN: speedrun NUNCA se recupera así — es un reto cronometrado de
        // una sentada; reanudar un cronómetro a mitad tras (posiblemente) meses no
        // tiene sentido, así que un speedrun viejo arranca siempre de cero.
        // SOLO CrazyGames: en Galaxy/itch.io esta recuperación no se aplica (pedido
        // explícito) — esas builds arrancan siempre limpias en modos no-vanilla.
        if (!data && _ch !== 'vanilla' && _ch !== 'speedrun' && window.GAME_MARKET === 'crazygames') {
            const _legacy = window.GameSave.load('chickenIdleSave');
            if (_legacy && _legacy.state) {
                data = _legacy;
            }
        }
        if (data) {
            try {
                if (data.state) {
                    let defaultCosts = { ...state.costs };
                    Object.assign(state, data.state);
                    if (data.state.costs) {
                        state.costs = Object.assign(defaultCosts, data.state.costs);
                    } else {
                        state.costs = defaultCosts;
                    }
                    _totalMoneyEarned = state.money || 0;

                    // Retro-compatibility fixes for base costs changed in latest updates
                    if (state.activeChallenge === 'endless') {
                        const _rC = [200, 5000, 100000, 1000000, 10000000, 100000000, 1000000000, 10000000000];
                        state.costs.rooster = _rC[state.roosterLevel || 0] || 0;
                    } else {
                        if ((state.roosterLevel || 0) === 0) state.costs.rooster = 200;
                        else if (state.roosterLevel === 1) state.costs.rooster = 5000;
                        else if (state.roosterLevel === 2) state.costs.rooster = 100000;
                        else if (state.roosterLevel === 3) state.costs.rooster = 500000;
                        else if (state.roosterLevel === 4) state.costs.rooster = 2000000;
                    }
                    if ((state.growthLevel || 0) === 0) state.costs.growth = state.activeChallenge === 'endless' ? 500 : 1000;
                    if ((state.batchLevel || 0) === 0 && state.activeChallenge === 'endless') state.costs.batch = 15000;
                    if ((state.magnetLevel || 0) === 0) state.costs.magnet = 10;
                    if ((state.autoFoodLevel || 0) === 0) state.costs.autoFood = 1000;
                    if ((state.autoWaterLevel || 0) === 0) state.costs.autoWater = 1000;
                    if (!state.hasSorter) { state.costs.sorter = 250; state.sorterLevel = 0; }
                    else if (!state.sorterLevel) { state.sorterLevel = 1; state.costs.sorter = 500; }
                    if (!(state.sortBonusLevel || 0)) state.costs.sortBonus = 500;
                    else state.costs.sortBonus = Math.round(500 * Math.pow(2.5, state.sortBonusLevel - 1));
                    if ((state.premiumLevel || 0) === 0) state.costs.premium = state.activeChallenge === 'endless' ? 50 : 2500;
                    if ((state.refillLevel || 0) === 0) state.costs.refill = state.activeChallenge === 'endless' ? 100 : 1000;
                    if ((state.goldenLevel || 0) === 0) state.costs.golden = state.activeChallenge === 'endless' ? 1000 : 50000;
                    if ((state.stamperLevel || 0) === 0 && !state.hasStamper) state.costs.stamper = state.activeChallenge === 'endless' ? 1000 : 15000;
                    if ((state.packagerLevel || 0) === 0 && !state.hasPackager) state.costs.packager = state.activeChallenge === 'endless' ? 10000 : 100000;
                    if ((state.ribbonLevel || 0) === 0 && !state.hasRibbon) state.costs.ribbon = state.activeChallenge === 'endless' ? 50000 : 600000;
                    if (state.chickens <= 1) state.costs.chicken = 0;

                    if (state.hasRetired === undefined) state.hasRetired = false;
                    if (state.gallinaPros === undefined) state.gallinaPros = 0;
                    if (state.chickenGolds === undefined) state.chickenGolds = 0;
                    if (state.chickenGreens === undefined) state.chickenGreens = 0;
                    if (state.chickenPurples === undefined) state.chickenPurples = 0;
                    if (state.blueUnlocked === undefined) state.blueUnlocked = (state.megaChickens || 0) > 0;
                    if (state.roseUnlocked === undefined) state.roseUnlocked = (state.gallinaPros || 0) > 0;
                    if (state.goldUnlocked === undefined) state.goldUnlocked = (state.chickenGolds || 0) > 0;
                    if (state.greenUnlocked === undefined) state.greenUnlocked = (state.chickenGreens || 0) > 0;
                    if (state.purpleUnlocked === undefined) state.purpleUnlocked = (state.chickenPurples || 0) > 0;

                    // Migration: hasRamp → hasBox
                    if (state.hasRamp && !state.hasBox) {
                        state.hasBox = true;
                        state.boxX = state.rampX || 300;
                        state.boxY = EGG_GROUND_Y - BOX_H;
                    }
                    if (state.hasBox && !state.boxEggs) state.boxEggs = [];

                    // Migration: hasPetting (bool) → pettingLevel (int)
                    if (state.hasPetting && !state.pettingLevel) {
                        state.pettingLevel = 1;
                        state.costs.petting = 5;
                    }
                    delete state.hasPetting;

                    // Migration: hasWasher (bool) → washerLevel (int)
                    if (state.hasWasher && !state.washerLevel) {
                        state.washerLevel = 1;
                    }
                    if (state.washerLevel === undefined) state.washerLevel = 0;

                    if (state.hasTvAd === undefined) state.hasTvAd = (state.shockwaveLevel > 0);
                    if (state.costs.tvAd === undefined) state.costs.tvAd = 250000;
                    // Always recalculate tvAd cost from level (fixes old scaling bug)
                    if (state.hasTvAd && (state.tvAdLevel || 0) > 0) {
                        let _tvC = 250000;
                        for (let _i = 0; _i < (state.tvAdLevel || 0); _i++) _tvC = Math.ceil(_tvC * (1.35 + _i * 0.03));
                        state.costs.tvAd = _tvC;
                    }

                    if (state.maxFoodLevel === undefined) {
                        state.maxFoodLevel = MAX_RESOURCE_TIERS.findIndex(v => v >= state.maxFood);
                        if (state.maxFoodLevel === -1) state.maxFoodLevel = 10;
                    }
                    if (state.maxWaterLevel === undefined) {
                        state.maxWaterLevel = MAX_RESOURCE_TIERS.findIndex(v => v >= state.maxWater);
                        if (state.maxWaterLevel === -1) state.maxWaterLevel = 10;
                    }
                    // Recalculate capacities using mode-appropriate formula
                    const _isEndlessSave = (_ch === 'endless');
                    state.maxFood = _isEndlessSave
                        ? Math.round(100 * Math.pow(1.17, state.maxFoodLevel || 0))
                        : (MAX_RESOURCE_TIERS[state.maxFoodLevel] || state.maxFood);
                    state.maxWater = _isEndlessSave
                        ? Math.round(100 * Math.pow(1.17, state.maxWaterLevel || 0))
                        : (MAX_RESOURCE_TIERS[state.maxWaterLevel] || state.maxWater);
                    state.food = Math.min(state.food, state.maxFood);
                    state.water = Math.min(state.water, state.maxWater);
                    if (_isEndlessSave) {
                        state.costs.maxFood = Math.round(100 * Math.pow(1.40, state.maxFoodLevel || 0));
                        state.costs.maxWater = Math.round(100 * Math.pow(1.40, state.maxWaterLevel || 0));
                        state.costs.autoFood = Math.round(100 * Math.pow(1.5, state.autoFoodLevel || 0));
                        state.costs.autoWater = Math.round(100 * Math.pow(1.5, state.autoWaterLevel || 0));
                    }
                }
                if (data.chickensArr) {
                    chickensArr = data.chickensArr.map(c => {
                        if (!c.slim) return c;
                        const _fresh = createChicken();
                        if (c.sleeping) { _fresh.action = 'sleeping'; _fresh.wakeTimer = _fresh.wakeDuration || 0.471235; }
                        return _fresh;
                    });
                    // Clamp saved Y coords to current meadow — fixes portrait→desktop mismatch
                    const _mL = MEADOW_LIMIT_Y;
                    chickensArr.forEach(ch => {
                        if (ch.y > _mL) ch.y = _mL;
                        if ((ch.targetY || 0) > _mL) ch.targetY = 40 + Math.random() * (_mL - 80);
                        if ((ch.roamTargetY || 0) > _mL) ch.roamTargetY = 40 + Math.random() * (_mL - 80);
                    });
                }
                if (data.chicksArr) {
                    chicksArr = data.chicksArr;
                    const _mL = MEADOW_LIMIT_Y;
                    chicksArr.forEach(ch => {
                        if (ch.y > _mL) ch.y = _mL;
                        if ((ch.targetY || 0) > _mL) ch.targetY = 40 + Math.random() * (_mL - 80);
                    });
                }
                if (data.roostersArr) {
                    roostersArr = data.roostersArr;
                    const _mL = MEADOW_LIMIT_Y;
                    roostersArr.forEach(r => {
                        if (r.y > _mL) r.y = _mL;
                        if ((r.targetY || 0) > _mL) r.targetY = 40 + Math.random() * (_mL - 80);
                    });
                }
                if (data.eggsArr) {
                    const _raw = data.eggsArr;
                    eggsArr = _raw.filter(e =>
                        !e.collected &&
                        typeof e.x === 'number' && !isNaN(e.x) &&
                        typeof e.y === 'number' && !isNaN(e.y) &&
                        typeof e.velX === 'number' && !isNaN(e.velX) &&
                        typeof e.velY === 'number' && !isNaN(e.velY)
                    ).map(e => {
                        e.isBeingDragged = false;
                        if (Math.abs(e.velX) < 0.1 && Math.abs(e.velY) < 0.1) {
                            e.velY = 50;
                        }
                        return e;
                    });
                }
                if (data.tombstonesArr) {
                    tombstonesArr = data.tombstonesArr;
                    if (state.deadChickens === undefined) {
                        state.deadChickens = tombstonesArr.length;
                    }
                }

                roostersArr.forEach(r => r.targetChicken = null);

                if (state.hasRetired) {
                    localStorage.setItem('chickenIdleBeaten', 'true');
                    const rankBtnTemp = document.getElementById('ranking-btn');
                    const wipeBtnTemp = document.getElementById('wipe-btn');
                    if (rankBtnTemp) rankBtnTemp.style.display = (state.activeChallenge === 'speedrun' || state.activeChallenge === 'endless' || state.isSpeedrunMode) ? 'inline-block' : 'none';
                    if (wipeBtnTemp) wipeBtnTemp.style.display = 'none';
                    document.getElementById('shop').style.display = 'none';
                    {
                        window.CinematicCore.enterEnd();
                        cinematicPhase = 4;
                        cinematicTimer = 10;

                        // Reentrando (carga de página) a un reto YA retirado: no se
                        // reconstruye la formación de gallinas — antes había aquí una COPIA
                        // manual y desactualizada de la lógica de _spawnVanilla (grid fijo en
                        // 48, sin ajuste a la caja) con el MISMO bug de desbordamiento que esa
                        // ya tenía antes de arreglarla en cinematic.js. Se deja el prado vacío
                        // detrás del cartel de stats, igual que hace el hot-reset de
                        // _switchToChallenge para este mismo caso.
                        chickensArr = [];

                        // enterEnd() no pasa por _showCineRoot() (eso solo ocurre en el
                        // arranque normal de la cinemática) — sin esto, FarmCinematic.draw()
                        // no tenía canvas ni contexto donde pintar y se veía todo negro
                        // (con audio y lógica corriendo igualmente).
                        document.body.classList.add('is-cinematic');
                        const _rcRootInit = document.getElementById('retire-cine-root');
                        const _cvInit = document.getElementById('retireCineCanvas');
                        if (_rcRootInit) _rcRootInit.style.display = 'block';
                        if (_cvInit) window._retireCineCtx = _cvInit.getContext('2d');
                        const _bgInit = document.getElementById('retire-cine-bg');
                        if (_bgInit) _bgInit.style.display = 'block';
                    }
                }
            } catch (e) {
                console.error("Save corrupted", e);
            }
        }

        // Always check for speedrun mode across fresh wipes
        state.isSpeedrunMode = (window.GameSave.loadRaw('chickenIdleSpeedrun') === 'true');

        state.activeChallenge = window.GameSave.loadRaw('activeChallenge') || 'vanilla';
        if (state.isSpeedrunMode && state.activeChallenge === 'vanilla') state.activeChallenge = 'speedrun';

        // Expose active mode for the main-menu overlay so _getCurrentMode() is always in sync
        window._activeGameChallenge = state.activeChallenge;

        // Non-endless: restore original prices for machines and shop items
        if (state.activeChallenge !== 'endless') {
            if (!state.hasWasher) state.costs.washer = 1000;
            if (!state.hasStamper) state.costs.stamper = 15000;
            if (!state.hasPackager) state.costs.packager = 100000;
            if (!state.hasRibbon) state.costs.ribbon = 600000;
            if ((state.autoCollectLevel || 0) === 0) state.costs.autoCollect = 25;
            if ((state.autoSellLevel || 0) === 0) state.costs.autoSell = 100;
            if ((state.premiumLevel || 0) === 0) state.costs.premium = 2500;
            if (!state.hasTvAd) state.costs.tvAd = 100000000;
        }

        // Endless mode: start with 100 food/water capacity
        if (state.activeChallenge === 'endless' && state.maxFood <= 50 && (state.maxFoodLevel || 0) === 0) {
            state.maxFood = 100; state.food = 100;
        }
        if (state.activeChallenge === 'endless' && state.maxWater <= 50 && (state.maxWaterLevel || 0) === 0) {
            state.maxWater = 100; state.water = 100;
        }

        // Adam & Eve initial spawn logic
        if (state.activeChallenge === 'adam' && !state.hasRetired && state.chickens === 0 && !state.hasRooster && chickensArr.length === 0) {
            state.chickens = 1;
            state.hasRooster = true;
            state.roosterLevel = 1;
            state.costs.rooster = 5000;

            // Reales en la granja
            let firstHen = createChicken();
            firstHen.x = 200; firstHen.y = 350;
            chickensArr.push(firstHen);

            let firstRooster = createRooster();
            firstRooster.x = 100; firstRooster.y = 350;
            roostersArr.push(firstRooster);
        }

        // state.adsRemoved viene de ESTE save-slot, pero la propiedad del
        // producto es un hecho GLOBAL de la cuenta de Google — si ya sabemos
        // la respuesta (GameIAP ya pasó por store.ready() en esta sesión, aunque
        // fuera antes de cargar este modo concreto), se aplica aquí también.
        // Sin esto, cambiar a un modo con save propio (o nunca jugado) podía
        // "revivir" los anuncios aunque la cuenta ya los tuviera quitados,
        // porque onOwnershipSync solo se dispara una vez al arrancar la app,
        // no en cada loadState().
        if (window.GameIAP && window.GameIAP.isOwned() != null) {
            state.adsRemoved = window.GameIAP.isOwned();
        }

        if (!data) {
            saveState();
        }
    }

    window.isAdPaused = false;
    window.adMobInitialized = false;

    function triggerMidgameAd() {
        // window.DEBUG=true (a mano en consola) fuerza los anuncios aunque
        // adsRemoved esté activo — para poder probar que se muestran de
        // verdad sin depender de qué cuenta de Google tenga cada dispositivo
        // (la recompensa de pre-registro concede "sin anuncios" en cuanto
        // Play Billing reconoce la cuenta como pre-registrada).
        if (state.adsRemoved && !window.DEBUG) return;
        window.GameAds.requestMidgame();
    }

    function _tryMidgameAd() {
        if (!_midgameAdReady) return;
        _midgameAdReady = false;
        triggerMidgameAd();
    }

    // loop managed by window.GameEngine

    function forceLayEgg(c) {
        if (c.dead) return;
        if (c.squishTimer <= 0) c.squishTimer = 0.3;
        c.jumpTimer = 0.5;
        layEgg(c.x, c.y, c.direction, c.mega || false);

        playRandomCok();

        c.eggTimer = _eggBaseTime();
        c.eggCount++;
        let eggCap = _batchEggCap();
        if (c.eggCount >= eggCap) {
            c.action = c.nextTrough;
            c.nextTrough = (c.nextTrough === 'goToFood') ? 'goToWater' : 'goToFood';
        }
    }

    function drawUIIcons() {
        let cp = document.getElementById('ui-chicken-icon');
        if (cp) {
            let cx = cp.getContext('2d');
            cx.clearRect(0, 0, 40, 40);
            cx.translate(20, 18);
            cx.scale(1.0, 1.0);
            renderChicken(cx, { x: 0, y: 0, velX: 0, velY: 0, direction: 1, color: '#ffffff', squishTimer: 0, isGrey: false });
            cx.setTransform(1, 0, 0, 1, 0, 0);
        }
    }

    // ── Farm context bridge — lets scenario modules read/write IIFE-scoped vars ─
    window._farmCtx = {
        get state() { return state; },
        get canvas() { return canvas; },
        get chicksArr() { return chicksArr; },
        set chicksArr(v) { chicksArr = v; },
        get chickensArr() { return chickensArr; },
        get eggsArr() { return eggsArr; },
        get createChicken() { return createChicken; },
        get createChick() { return createChick; },
        get _localRequestAd() { return _localRequestAd; },
        get updateUI() { return updateUI; },
        get debugBoxCol() { return _debugBoxCol; },
        set debugBoxCol(v) { _debugBoxCol = v; },
    };

    window.FarmOffers.setup();

    const _SAVE_KEYS = [
        'chickenIdleSave',
        'chickenIdleSave_speedrun',
        'chickenIdleSave_adam',
        'chickenIdleSave_manual',
        'chickenIdleEndlessSave',
        'chickenIdleActiveSlot',
        'activeChallenge',
        'chickenIdleSpeedrun',
        'chickenIdleBeaten',
        'chickenIdleBeatenVanilla',
        'chickenIdleBeatenSpeedrun',
        'chickenIdleBeatenAdam',
        'chickenIdleBeatenManual',
        'pb_vanilla',
        'pb_speedrun',
        'pb_adam',
        'pb_manual',
        'chickenIdleLastName',
        'chickenIdleSpeedrunSubmitted',
        'chickenIdleSpeedrunData',
        'chickenIdleLastPos',
        'chickenIdleAchievements',
    ];

    let _cgGameplayStarted = false;
    let _midgameAdReady = false;

    // Se llama SOLO cuando el jugador elige activamente un modo para jugar
    // (botones de modo del menú) — pedido explícito: antes gameplayStart()
    // se disparaba aquí mismo, nada más cargar el save, aunque el jugador se
    // quedara parado en el menú sin jugar. Expuesta en window porque el menú
    // vive en <script> aparte (index.html), fuera de este cierre.
    window._cgMarkGameplayStarted = function () {
        if (_cgGameplayStarted) return;
        _cgGameplayStarted = true;
        window.GameAds.gameplayStart();
    };

    // "¿Ha visto ya el menú de otros modos?" — leído una sola vez al arrancar
    // (no en cada frame). Fuera de CrazyGames se trata como "ya visto" para
    // que el temporizador de update(dt) sea directamente un no-op.
    let _cgSeenOtherModes = (window.GAME_MARKET === 'crazygames')
        ? (localStorage.getItem('chickenIdleSeenOtherModes') === 'true')
        : true;
    // Llamada desde index.html (_loadChallengeData) en cuanto la pantalla de
    // selección de reto se muestra de verdad — mismo patrón de exposición en
    // window que _cgMarkGameplayStarted, ver comentario de arriba.
    window._cgMarkOtherModesSeen = function () {
        try { localStorage.setItem('chickenIdleSeenOtherModes', 'true'); } catch (_) {}
        _cgSeenOtherModes = true;
    };

    window.GameSave.initAndLoad(_SAVE_KEYS, () => {
        loadState();
        refreshAllModeBtns();
        // Huevera y sorter desactivados en esta versión
        state.hasBox = false;
        state.boxEggs = [];
        state.hasSorter = false;
        state.sortBonusLevel = 0;
        _loadAchievements();
        drawUIIcons();

        updateUI();

        // Intento de arranque inmediato de la música — antes NADA la intentaba
        // reproducir hasta el primer gesto del jugador (updateBGM() solo se
        // llamaba desde acciones del jugador: silenciar, comprar mejora de
        // música, fin de anuncio). En Android, Capacitor ya desactiva la
        // restricción nativa de "requiere gesto" (Bridge.java,
        // setMediaPlaybackRequiresUserGesture(false)), así que debería sonar
        // directamente aquí. En plataformas donde el navegador SÍ lo bloquea,
        // esto falla en silencio (ya capturado dentro de updateBGM()) y el
        // desbloqueo existente en el primer toque sigue funcionando igual.
        updateBGM();

        // Sync ranking-btn after loadState (state.activeChallenge now known)
        const _rkBLoad = document.getElementById('ranking-btn');
        if (_rkBLoad) _rkBLoad.style.display =
            (state.activeChallenge === 'endless' || state.activeChallenge === 'speedrun' || state.isSpeedrunMode)
            ? 'inline-block' : 'none';

        initPixi();

        // ── Start engine — shared/engine.js ──────────────────────────────────
        window.GameEngine.start({
            update: (dt) => {
                const _t0 = performance.now();
                update(dt);
                _dbgPerfSample('update', performance.now() - _t0);
            },
            draw: () => {
                const _t0 = performance.now();
                draw();
                _dbgPerfSample('draw', performance.now() - _t0);
                const _t1 = performance.now();
                syncEntityLayer();
                _dbgPerfSample('pixiSync', performance.now() - _t1);
            },
            onTabResume: () => {
                if (state.musicLevel > 0 && bgmTheme.paused && !window.isMusicMuted && !window.isBgmMuted)
                    bgmTheme.play().catch(() => { });
            }
        });
        window.GameSave.setupAuthListener();

        // gameplayStart YA NO se dispara aquí — este callback corre nada más
        // cargar el save, aunque el jugador siga parado en el menú sin haber
        // elegido nada. Ver window._cgMarkGameplayStarted, llamado desde
        // _resumeGame()/_skipMenu (index.html) y _switchToChallenge() (abajo)
        // cuando el jugador elige activamente un modo. El hint visual de
        // "primera gallina gratis" para jugadores nuevos se mantiene igual.
        //
        // Caso especial: jugador de primera sesión (window._firstTimeAutoVanilla,
        // puesto por index.html) entra directo a Vanilla SIN pasar por el menú,
        // así que ninguno de esos otros puntos llega a llamar a
        // _cgMarkGameplayStarted(). Pedido explícito: para este caso concreto,
        // gameplayStart se difiere hasta que compren su primera gallina —
        // hasta entonces no están "jugando" de verdad, solo mirando.
        if (chickensArr.length === 0) {
            shopBtns.chicken.classList.add('cg-first-time-hint');
            shopBtns.chicken.addEventListener('click', () => {
                shopBtns.chicken.classList.remove('cg-first-time-hint');
                if (window._firstTimeAutoVanilla) window._cgMarkGameplayStarted();
            }, { once: true });
        }
    });

    // ── Shell UI — shared/shell.js ───────────────────────────────────────────
    window.GameShell.init({
        onPause: () => {
            _renderPauseAchievements();
            if (!window.isMusicMuted && !bgmTheme.paused) bgmTheme.pause();
            if (_cgGameplayStarted) window.GameAds.gameplayStop();
            _tryMidgameAd();
        },
        onResume: () => {
            if (!window.isMusicMuted && !window.isBgmMuted && state.musicLevel > 0 && !window.isOrientationPaused)
                bgmTheme.play().catch(() => { });
            window.GameAds.gameplayStart();
        },
        onMute: () => updateBGM(),
        onUnmute: () => updateBGM(),
        onInfoToggle: () => updateUI(),
    });

    // ── Re-render pause achievements when language changes ───────────────────
    const _origApplyTranslations = window.applyTranslations;
    window.applyTranslations = function () {
        _origApplyTranslations?.();
        if (window.gamePaused) _renderPauseAchievements();
    };

    // ── GameAds audio hooks — mute/resume BGM around ad breaks ─────────────
    window.GameAds.init({
        onAdStart: () => { if (!bgmTheme.paused) bgmTheme.pause(); },
        onAdEnd: () => { updateBGM(); },
    });
    // El banner solo debe verse DENTRO de una partida, nunca en el menú
    // principal — antes se pedía una vez al arrancar, sin importar dónde
    // estuviera el jugador. body.in-game se activa/desactiva en varios puntos
    // (index.html al entrar/salir de una partida, script.js al retirarse...);
    // en vez de enganchar cada uno, se observa la clase directamente.
    const _bannerContainerId = window.GAME_MODE === 'portrait' ? 'game-banner'
        : (window.GAME_MODE === 'desktop' ? 'desktop-banner' : null);
    if (_bannerContainerId) {
        let _bannerShown = false;
        const _syncBannerToGameState = () => {
            const inGame = document.body.classList.contains('in-game') && (!state.adsRemoved || window.DEBUG);
            if (inGame && !_bannerShown) { _bannerShown = true; window.GameAds.showBanner(_bannerContainerId); }
            else if (!inGame && _bannerShown) { _bannerShown = false; window.GameAds.hideBanner(_bannerContainerId); }
        };
        new MutationObserver(_syncBannerToGameState).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        _syncBannerToGameState(); // estado inicial (por si ya arranca in-game, p.ej. window.DEBUG)
        window._syncAdBannerToGameState = _syncBannerToGameState;
    }

    // ── "Remove Ads" IAP (Google Play, portrait only) ───────────────────────
    // GameIAP.init() no hace nada si no es build googleplay + modo portrait
    // (ver shared/iap.js _active()). Portado de OLD/TheMachinEgg_OLD/script.js.
    window.GameIAP.init({
        // Se dispara SOLO en el instante en que se aprueba una compra — sirve
        // para el toast de recompensa de pre-registro (una vez).
        onAdsRemoved: (isPreregister) => {
            if (isPreregister && !state.preregisterRewardNotified) {
                state.preregisterRewardNotified = true;
                _showIapToast(window.t('preregisterAdsUnlocked'));
            }
        },
        // Se dispara SIEMPRE en cada store.ready() con la propiedad real
        // (true o false) — sincroniza state.adsRemoved en ambos sentidos, para
        // que un reembolso posterior también reactive los anuncios (antes solo
        // se ponía a true una vez y nunca se revertía).
        onOwnershipSync: (owned) => {
            if (state.adsRemoved === owned) return;
            state.adsRemoved = owned;
            saveState();
            updateUI();
            window._syncAdBannerToGameState?.();
        },
        // El catálogo (oferta/precio) tarda en llegar de Play Billing y llega
        // DESPUÉS del primer updateUI() (que ya corrió al cargar la partida) —
        // sin esto el botón "quitar anuncios" se queda oculto para siempre
        // aunque canPurchase() ya devuelva true más tarde.
        onReady: () => updateUI(),
    });

    // ── CrazyGames gameplayStart — deferred for first-time players ───────────
    // gameplayStop/Start around popups (challenges, pause) must only fire AFTER
    // gameplay has legitimately started (first chicken bought or returning player).
    // (This is now deferred and managed entirely within the GameSave.initAndLoad callback above)

    // Speedrun Menu Logic
    const RANKING_API_URL = window.PLATFORM.rankingApiUrl;

    let myPin = localStorage.getItem('chickenIdleSpeedrunPin');
    if (!myPin) {
        myPin = 'pin_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('chickenIdleSpeedrunPin', myPin);
    }

    const formatTimeSecs = (s) => window.GameUtils.formatTimeSecs(s);

    let _rankingCurrentVersion = 'v2';

    function fetchRanking(version) {
        version = version || _rankingCurrentVersion;
        _rankingCurrentVersion = version;
        let statusEl = document.getElementById('ranking-status');
        let tbody = document.getElementById('ranking-tbody');
        if (statusEl) statusEl.innerText = window.t ? window.t('rankingLoading') : 'Loading...';
        const _prEl = document.getElementById('ranking-player-row');
        if (_prEl) _prEl.style.display = 'none';

        // Reset scroll to top on tab change
        const _rankList = document.getElementById('ranking-list');
        if (_rankList) _rankList.scrollTop = 0;

        // Update tab styles
        const _tabV2 = document.getElementById('ranking-tab-v2');
        const _tabLeg = document.getElementById('ranking-tab-legacy');
        const _tabEnd = document.getElementById('ranking-tab-endless');
        if (_tabV2)  { _tabV2.style.background  = version === 'v2'      ? '#f1c40f' : '#555'; _tabV2.style.color  = version === 'v2'      ? '#000' : '#ccc'; }
        if (_tabLeg) { _tabLeg.style.background = version === 'legacy'  ? '#e67e22' : '#555'; _tabLeg.style.color = version === 'legacy'  ? '#000' : '#ccc'; }
        if (_tabEnd) { _tabEnd.style.background = version === 'endless' ? '#9b59b6' : '#555'; _tabEnd.style.color = version === 'endless' ? '#fff' : '#ccc'; }

        // Update column headers via JS (avoids data-i18n timing issues)
        const _thName = document.getElementById('ranking-th-name');
        const _thChicken = document.getElementById('ranking-th-chicken');
        const _thValue = document.getElementById('ranking-th-value');
        const _thTime2 = document.getElementById('ranking-th-time');
        if (_thName) _thName.innerText = window.t ? window.t('rankingColName') : 'NAME';
        if (_thChicken) _thChicken.innerText = window.t ? window.t('rankingColChicken') : 'CHKN';
        if (_thValue) _thValue.innerText = window.t ? (version === 'endless' ? window.t('rankingColEarn') : window.t('rankingColTime2')) : 'TIME';
        if (_thTime2) _thTime2.innerText = window.t ? window.t('rankingColTime2') : 'TIME';

        // ── Shared cell helpers (same structure for all 3 tabs) ──
        const _posColors = ['#f1c40f', '#bdc3c7', '#cd7f32'];
        const _comAbbrev = (market) => {
            const MAP = { itchio:'IO', itch:'IO', newgrounds:'NG', galaxy:'GL', incrementaldb:'IDB', googleplay:'GP', google_play:'GP', crazygames:'CG' };
            const k = (market || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (MAP[k]) return MAP[k];
            const label = (window.PLATFORM?.marketLabel?.(market) || market).toUpperCase();
            const words = label.split(/[\s_\-]+/);
            if (words.length >= 2) return words.map(w => w[0]).join('').slice(0, 3);
            return label.slice(0, 2);
        };
        const _mkBadge = (market) => {
            if (!market) return '';
            const color = window.PLATFORM.marketColor(market);
            const fullLabel = window.PLATFORM.marketLabel(market);
            const abbrev = _comAbbrev(market);
            return `<span class="rank-com-badge" data-tooltip="${fullLabel}" style="width:30px;height:18px;background:${color};color:#fff;font-size:5px;font-family:'Press Start 2P',monospace;border-radius:3px;letter-spacing:-0.5px;flex-shrink:0;">${abbrev}</span>`;
        };
        const _isEndless = version === 'endless';
        const _ncols = _isEndless ? 6 : 5;
        // Show/hide TIME column for endless tab
        const _thTime = document.getElementById('ranking-th-time');
        if (_thTime) _thTime.style.display = _isEndless ? '' : 'none';
        document.querySelectorAll('.ranking-col-time').forEach(c => c.style.display = _isEndless ? '' : 'none');

        // Nombre editable: solo tiene sentido en la pestaña Endless (Speedrun ya
        // pide nombre en su propio panel al retirarse), y solo mientras el
        // jugador no haya gastado ya su única edición (ver _lockRankNameInput).
        const _rkNameRow = document.getElementById('ranking-name-edit-row');
        const _rkNameLocked = localStorage.getItem('chickenIdleEndlessNameLocked') === 'true';
        if (_rkNameRow) {
            _rkNameRow.style.display = (_isEndless && !_rkNameLocked) ? 'flex' : 'none';
            if (_isEndless && !_rkNameLocked) {
                const _rkNameInputEl = document.getElementById('ranking-name-edit-input');
                if (_rkNameInputEl && document.activeElement !== _rkNameInputEl) {
                    _rkNameInputEl.value = localStorage.getItem('chickenIdleLastName') || '';
                }
            }
        }

        // Ancho de la columna de VALOR según pestaña. En Endless muestra ganancias
        // ("$100.0M") y necesita los 88px; en Speedrun / Old ver. muestra un tiempo
        // ("12:09", ~40px) alineado a la derecha, así que esos 88px dejaban ~48px muertos
        // JUSTO entre CHKN y TIME. Al recortarla, CHKN se pega al tiempo y todo ese ancho
        // se lo queda NAME, que es la columna flexible (<col> sin width).
        document.querySelectorAll('.ranking-col-value').forEach(c => {
            c.style.width = _isEndless ? '88px' : '56px';
        });

        // All cells use nameColor: only top-3 and YOU row are colored, rest are white
        //
        // Endless tiene 6 columnas (#, COM, NAME, CHKN, GANANCIAS, TIME). Las de ancho fijo
        // suman 288px: en MÓVIL a NAME —que es la flexible— no le queda prácticamente nada
        // y el nombre no se lee. Ahí cada jugador ocupa DOS filas:
        //   fila 1:  #  |  badge  |  NOMBRE (a todo lo ancho)
        //   fila 2:            |  CHKN  |  GANANCIAS  |  TIME
        // El # y el badge van con rowspan=2, y los datos de la fila 2 caen en SUS columnas,
        // así las cabeceras siguen alineadas con sus valores.
        //
        // En ESCRITORIO el panel es ancho de sobra y las 6 columnas caben en una sola fila,
        // así que se mantiene el formato compacto de siempre.
        const _twoLine = _isEndless && window.GAME_MODE === 'portrait';
        const _mkRow = (pos, market, name, chickens, valueHtml, nameColor, _unused, timeHtml) => {
            const _c = `color:${nameColor};`;
            if (_twoLine) {
                return `<tr>` +
                    `<td rowspan="2" style="text-align:center;${_c}padding:4px 2px;vertical-align:middle;">${pos}.</td>` +
                    `<td rowspan="2" style="text-align:center;padding:4px 2px;vertical-align:middle;">${_mkBadge(market)}</td>` +
                    `<td colspan="4" style="${_c}padding:4px 2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</td>` +
                    `</tr><tr>` +
                    `<td style="padding:0 2px 4px;"></td>` +
                    `<td style="text-align:right;${_c}padding:0 2px 4px;white-space:nowrap;opacity:0.85;font-size:0.9em;">${chickens||0}</td>` +
                    `<td style="text-align:right;${_c}padding:0 2px 4px;white-space:nowrap;opacity:0.85;font-size:0.9em;">${valueHtml}</td>` +
                    `<td style="text-align:right;${_c}padding:0 2px 4px;white-space:nowrap;opacity:0.85;font-size:0.9em;">${timeHtml !== undefined ? timeHtml : ''}</td>` +
                    `</tr>`;
            }
            return `<tr>` +
                `<td style="text-align:center;${_c}padding:4px 2px;">${pos}.</td>` +
                `<td style="text-align:center;padding:4px 2px;">${_mkBadge(market)}</td>` +
                `<td style="${_c}padding:4px 2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</td>` +
                `<td style="text-align:right;${_c}padding:4px 2px;white-space:nowrap;">${chickens||0}</td>` +
                `<td style="text-align:right;${_c}padding:4px 2px;white-space:nowrap;">${valueHtml}</td>` +
                (timeHtml !== undefined ? `<td style="text-align:right;${_c}padding:4px 2px;white-space:nowrap;">${timeHtml}</td>` : '') +
                `</tr>`;
        };
        const _mkSep = () => `<tr><td colspan="${_ncols}" style="padding:8px 0;"><div style="height:1px;background:#555;margin:0 8px;"></div></td></tr>`;
        const _mkErr = (msg) => `<tr><td colspan="${_ncols}" style="text-align:center;color:#e74c3c;padding:20px;">${msg}</td></tr>`;
        const _you = window.t ? window.t('rankingYou') : 'YOU';

        // ── Endless tab ──
        if (version === 'endless') {
            // Antes se paraba en "B" (mil millones) — un jugador de partida larga
            // (48h+) ya pasa de eso y salía algo como "$166822.71B" en vez de
            // seguir escalando a T (billón) y más allá. Mismo patrón que
            // formatMoney() en admin/index.php.
            const fmtE = n => {
                n = n || 0;
                const sym = getCurrencySym();
                if (n < 1000) return sym + Math.round(n);
                const suf = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
                const tier = Math.min(Math.floor(Math.log10(n) / 3), suf.length - 1);
                const scaled = n / Math.pow(1000, tier);
                return sym + scaled.toFixed(scaled < 10 ? 2 : 1) + suf[tier];
            };
            const fmtT = s => {
                if (!s) return '--';
                const h = Math.floor(s/3600);
                const m = Math.floor((s%3600)/60);
                const isTr = (window.currentLang === 'tr');
                return h > 0 ? (h + (isTr ? 'sa ' : 'h') + String(m).padStart(2,'0') + (isTr ? 'dk' : 'm')) : (m + (isTr ? 'dk' : 'm'));
            };
            fetch(RANKING_API_URL + '/get_endless_ranking.php?pin=' + encodeURIComponent(myPin))
                .then(r => r.json())
                .then(data => {
                    if (!data.ok) { if (statusEl) statusEl.innerText = window.t ? window.t('rankingErrApi') : 'Error loading ranking'; if (tbody) tbody.innerHTML = _mkErr(window.t ? window.t('rankingErrLoad') : 'Could not load records'); return; }
                    const _myEntry = data.player || (data.top10 || []).find(r => r.is_me) || null;
                    const _endlessTitle = (window.currentLang === 'tr') ? 'Sonsuz Sıralama — İlk ' : 'Endless Ranking — Top ';
                    if (statusEl) statusEl.innerText = _endlessTitle + (data.top10 || []).length + (_myEntry ? ' · #' + _myEntry.rank_pos + ' ' + _you : '');
                    if (!tbody) return;
                    const toRows = (rows) => rows.map(r => {
                        const col = r.is_me ? '#2ecc71' : (_posColors[r.rank_pos - 1] || '#fff');
                        return _mkRow(r.rank_pos, r.market, r.name, r.chickens, fmtE(r.earnings), col, null, fmtT(r.play_time_secs || r.play_time));
                    }).join('');
                    let html = toRows(data.top10 || []);
                    const inTop10 = (data.top10 || []).some(r => r.is_me);
                    if (!inTop10 && data.player) html += _mkSep() + toRows([data.player]);
                    const _noRec = window.t ? window.t('rankingEmpty') : ((window.currentLang === 'tr') ? 'Henüz kayıt yok' : 'No records yet');
                    tbody.innerHTML = html || `<tr><td colspan="6" style="text-align:center;color:#888;padding:20px;">${_noRec}</td></tr>`;
                    if (_prEl && _myEntry) {
                        const _prTbody = document.getElementById('ranking-player-tbody');
                        if (_prTbody) _prTbody.innerHTML = _mkRow(_myEntry.rank_pos, _myEntry.market, _myEntry.name + ' — ' + _you, _myEntry.chickens, fmtE(_myEntry.earnings), '#2ecc71', null, fmtT(_myEntry.play_time_secs || _myEntry.play_time));
                        _prEl.style.display = 'block';
                    }
                })
                .catch(() => { if (statusEl) statusEl.innerText = window.t ? window.t('rankingErrConn') : 'Could not connect'; if (tbody) tbody.innerHTML = _mkErr(window.t ? window.t('rankingErrConnDetail') : 'Connection failed'); });
            return;
        }

        // ── Speedrun tabs (v2 / legacy) ──
        const _rankEndpoint = version === 'v2' ? '/get_ranking_2.php' : '/get_ranking.php';
        fetch(RANKING_API_URL + _rankEndpoint + '?pin=' + encodeURIComponent(myPin))
            .then(r => r.json())
            .then(data => {
                if (!data.ok) { if (statusEl) statusEl.innerText = window.t ? window.t('rankingErrApi') : 'Error loading ranking'; if (tbody) tbody.innerHTML = _mkErr(window.t ? window.t('rankingErrLoad') : 'Could not load records'); return; }
                const _vLabel = version !== 'v2' ? ' · LEGACY' : '';
                if (!tbody) return;
                tbody.innerHTML = '';
                let hasFoundSelf = false;
                data.ranking.forEach(r => {
                    if (r.is_me) hasFoundSelf = true;
                    const col = r.is_me ? '#2ecc71' : (_posColors[r.pos - 1] || '#fff');
                    tbody.insertAdjacentHTML('beforeend', _mkRow(r.pos, r.market, r.name, r.chickens, formatTimeSecs(r.time_secs), col));
                });
                if (data.selfRun && data.selfRun.pos > 0) {
                    const ld = data.selfRun;
                    if (_prEl) {
                        const _prTbody = document.getElementById('ranking-player-tbody');
                        if (_prTbody) _prTbody.innerHTML = _mkRow(ld.pos, ld.market, ld.name + ' — ' + _you, ld.chickens, formatTimeSecs(ld.time_secs), '#2ecc71');
                        _prEl.style.display = 'block';
                    }
                    if (!hasFoundSelf) tbody.insertAdjacentHTML('beforeend', _mkSep() + _mkRow(ld.pos, ld.market, ld.name, ld.chickens, formatTimeSecs(ld.time_secs), '#2ecc71'));
                }
                const _globalTitle = (window.currentLang === 'tr') ? 'Genel Sıralama — İlk ' : 'Global Ranking — Top ';
                if (statusEl) statusEl.innerText = `${_globalTitle}${data.ranking.length}${_vLabel}` + (data.selfRun?.pos > 0 ? ` · #${data.selfRun.pos} ${_you}` : '');
            })
            .catch(() => { if (statusEl) statusEl.innerText = window.t ? window.t('rankingErrConn') : 'Could not connect'; if (tbody) tbody.innerHTML = _mkErr(window.t ? window.t('rankingErrConnDetail') : 'Connection failed'); });
    }

    const rankingBtn = document.getElementById('ranking-btn');
    const rankingOverlay = document.getElementById('ranking-overlay');
    const rankingCloseBtn = document.getElementById('ranking-close');
    const speedrunStartBtn = document.getElementById('speedrun-start-btn');
    const normalModeBtn = document.getElementById('normal-mode-btn');
    const nameInputOverlay = document.getElementById('name-input-overlay');
    const speedrunSubmitBtn = document.getElementById('speedrun-submit-btn');
    const speedrunNameInput = document.getElementById('speedrun-name-input');

    const _tabV2Btn = document.getElementById('ranking-tab-v2');
    const _tabLegBtn = document.getElementById('ranking-tab-legacy');
    const _tabEndlessBtn = document.getElementById('ranking-tab-endless');
    if (_tabV2Btn) _tabV2Btn.addEventListener('click', () => fetchRanking('v2'));
    if (_tabLegBtn) _tabLegBtn.addEventListener('click', () => fetchRanking('legacy'));
    if (_tabEndlessBtn) _tabEndlessBtn.addEventListener('click', () => fetchRanking('endless'));

    // Endless ranking — nombre editable directamente en el panel visible (antes
    // solo existía en #endless-ranking-overlay, un overlay separado que quedó
    // huérfano tras unificar todo en las pestañas de #ranking-overlay y nunca
    // llegó a mostrarse). fetchRanking() muestra/oculta esta fila según pestaña.
    const _rkNameInput = document.getElementById('ranking-name-edit-input');
    const _rkNameSave  = document.getElementById('ranking-name-edit-save');
    const _rkNameRow = document.getElementById('ranking-name-edit-row');
    // Tras el primer cambio se OCULTA la fila entera (no solo deshabilitada) —
    // pedido: "una vez escrito el nombre se quita ese input y desaparece".
    // Nuevos jugadores tienen una edición gratis; después no vuelve a aparecer.
    function _lockRankNameInput() {
        if (_rkNameRow) _rkNameRow.style.display = 'none';
    }
    if (_rkNameInput) {
        const _doSaveRankName = () => {
            const n = _rkNameInput.value.trim().toUpperCase().replace(/[^A-Z0-9 _\-]/g, '').slice(0, 20);
            if (!n) return;
            _rkNameInput.value = n;
            localStorage.setItem('chickenIdleLastName', n);
            localStorage.setItem('chickenIdleEndlessNameLocked', 'true');
            _lockRankNameInput();
            // Empuja el cambio a la BD ya mismo (antes esperaba hasta 60s al
            // siguiente ping) y refresca la tabla visible con el nombre nuevo.
            _submitEndlessScore((ok) => { if (ok) fetchRanking('endless'); });
        };
        if (_rkNameSave) _rkNameSave.addEventListener('click', _doSaveRankName);
        _rkNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') _doSaveRankName(); });
    }

    // Drag-to-scroll on ranking list
    const _rankList = document.getElementById('ranking-list');
    if (_rankList) {
        let _rlDragging = false, _rlStartY = 0, _rlScrollTop = 0;
        _rankList.addEventListener('mousedown', e => {
            _rlDragging = true;
            _rlStartY = e.clientY;
            _rlScrollTop = _rankList.scrollTop;
            _rankList.style.cursor = 'var(--cur-hand)';
            e.preventDefault();
        });
        window.addEventListener('mousemove', e => {
            if (!_rlDragging) return;
            _rankList.scrollTop = _rlScrollTop - (e.clientY - _rlStartY);
        });
        window.addEventListener('mouseup', () => {
            if (!_rlDragging) return;
            _rlDragging = false;
            _rankList.style.cursor = 'var(--cur-hand)';
        });
    }

    // Drag-to-scroll on shop
    const _shopScroll = document.getElementById('shop-scroll');
    if (_shopScroll) {
        let _ssDragging = false, _ssStartY = 0, _ssScrollTop = 0;
        _shopScroll.addEventListener('mousedown', e => {
            _ssDragging = true;
            _ssStartY = e.clientY;
            _ssScrollTop = _shopScroll.scrollTop;
            _shopScroll.style.cursor = 'var(--cur-hand)';
            e.preventDefault();
        });
        window.addEventListener('mousemove', e => {
            if (!_ssDragging) return;
            _shopScroll.scrollTop = _ssScrollTop - (e.clientY - _ssStartY);
        });
        window.addEventListener('mouseup', () => {
            if (!_ssDragging) return;
            _ssDragging = false;
            _shopScroll.style.cursor = '';
        });
    }

    let _rankingCloseTimer = null;

    function _doCloseRanking() {
        if (!rankingOverlay) return;
        // El ranking se abre TAMBIÉN desde el menú principal, donde el juego está pausado a
        // propósito. Despausar aquí sin comprobarlo hacía que el bucle arrancara en el menú:
        // si el último modo jugado estaba completado, CinematicCore sigue activo en fase 4 y
        // su update() llamaba a _showStats() → aparecía el cartel final de ESE modo (p.ej.
        // Adam & Eve) sin que el jugador hubiera entrado en él.
        // body.in-game solo está presente cuando se está jugando de verdad.
        if (document.body.classList.contains('in-game')) {
            window.gamePaused = false;
            window.GameEngine.resetTime();
            if (_cgGameplayStarted) window.GameAds.gameplayStart();
        }
        if (!window.isMusicMuted && !window.isBgmMuted && state.musicLevel > 0 && window.audioEnabled !== false) {
            bgmTheme.play().catch(() => { });
        }
        rankingOverlay.classList.add('overlay-closing');
        _rankingCloseTimer = setTimeout(function() {
            rankingOverlay.style.display = 'none';
            rankingOverlay.classList.remove('overlay-closing');
            _rankingCloseTimer = null;
        }, 320);
    }

    if (rankingBtn) {
        rankingBtn.addEventListener('click', () => {
            const _defaultTab = state.activeChallenge === 'endless' ? 'endless' : 'v2';
            // Cancelar cierre pendiente (evita race condition si se abre mientras cierra)
            if (_rankingCloseTimer) {
                clearTimeout(_rankingCloseTimer);
                _rankingCloseTimer = null;
                if (rankingOverlay) rankingOverlay.classList.remove('overlay-closing');
            }
            // Limpiar mm-slide-out que deja _slideOut del menú principal (si estaba abierto antes)
            const _rankingPanel = document.getElementById('ranking-panel');
            if (_rankingPanel) { _rankingPanel.classList.remove('mm-slide-out'); _rankingPanel.classList.remove('mm-slide-in'); }
            window.gamePaused = true;
            if (!window.isMusicMuted && !bgmTheme.paused) {
                bgmTheme.pause();
            }
            if (_cgGameplayStarted) window.GameAds.gameplayStop();
            if (rankingOverlay) {
                rankingOverlay.style.display = 'flex';
                if (window.applyTranslations) window.applyTranslations();

                // Cargar medallas (elementos opcionales, pueden no existir en este contexto)
                if (localStorage.getItem('chickenIdleBeatenVanilla') === 'true' || localStorage.getItem('chickenIdleBeaten') === 'true') {
                    const c1 = document.getElementById('check-chal-1'); if (c1) c1.style.display = 'block';
                }
                if (localStorage.getItem('chickenIdleBeatenSpeedrun') === 'true') {
                    const c2 = document.getElementById('check-chal-2'); if (c2) c2.style.display = 'block';
                }
                if (localStorage.getItem('chickenIdleBeatenAdam') === 'true') {
                    const c3 = document.getElementById('check-chal-3'); if (c3) c3.style.display = 'block';
                }
                if (localStorage.getItem('chickenIdleBeatenManual') === 'true') {
                    const c4 = document.getElementById('check-chal-4'); if (c4) c4.style.display = 'block';
                }

                const fmtPB = (s) => {
                    let h = Math.floor(s / 3600);
                    let m = Math.floor((s % 3600) / 60);
                    let sc = Math.floor(s % 60);
                    let mStr = m.toString().padStart(2, '0');
                    let scStr = sc.toString().padStart(2, '0');
                    return `${h > 0 ? h + ':' : ''}${mStr}:${scStr}`;
                };

                let pbs = [
                    { key: 'pb_vanilla', id: 'pb-vanilla' },
                    { key: 'pb_speedrun', id: 'pb-speedrun' },
                    { key: 'pb_adam', id: 'pb-adam' },
                    { key: 'pb_manual', id: 'pb-manual' }
                ];

                pbs.forEach(pb => {
                    let val = localStorage.getItem(pb.key);
                    if (val) {
                        let el = document.getElementById(pb.id);
                        if (el) {
                            el.style.display = 'block';
                            el.innerText = 'Best: ' + fmtPB(parseFloat(val));
                        }
                    }
                });

                if (document.getElementById('speedrun-start-btn')) document.getElementById('speedrun-start-btn').disabled = false;
                if (document.getElementById('adam-mode-btn')) document.getElementById('adam-mode-btn').disabled = false;
            }
            fetchRanking(_defaultTab);
        });
    }
    if (rankingCloseBtn) {
        rankingCloseBtn.addEventListener('click', _doCloseRanking);
    }
    if (rankingOverlay) {
        rankingOverlay.addEventListener('click', function(ev) {
            if (ev.target === rankingOverlay) {
                const _rcBtn = document.getElementById('ranking-close');
                if (_rcBtn) _rcBtn.click(); else _doCloseRanking();
            }
        });
    }
    _initRetireStats();

    // Endless ranking — nombre editable
    const _erNameInput = document.getElementById('endless-rank-name-input');
    const _erNameSave  = document.getElementById('endless-rank-name-save');
    const _erNameOk    = document.getElementById('endless-rank-name-ok');
    if (_erNameInput) {
        // Pre-rellenar con el nombre guardado
        _erNameInput.value = localStorage.getItem('chickenIdleLastName') || '';
        const _doSaveName = () => {
            const n = _erNameInput.value.trim().toUpperCase().replace(/[^A-Z0-9 _\-]/g, '').slice(0, 20);
            if (!n) return;
            _erNameInput.value = n;
            localStorage.setItem('chickenIdleLastName', n);
            if (_erNameOk) { _erNameOk.style.display = 'inline'; setTimeout(() => { _erNameOk.style.display = 'none'; }, 1500); }
        };
        if (_erNameSave) _erNameSave.addEventListener('click', _doSaveName);
        _erNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') _doSaveName(); });
    }

    // Endless ranking overlay close
    const _erCloseBtn = document.getElementById('endless-ranking-close');
    const _erOverlay = document.getElementById('endless-ranking-overlay');
    if (_erCloseBtn && _erOverlay) {
        _erCloseBtn.addEventListener('click', () => {
            _erOverlay.classList.add('overlay-closing');
            setTimeout(function() {
                _erOverlay.style.display = 'none';
                _erOverlay.classList.remove('overlay-closing');
            }, 320);
            // Mismo caso que _doCloseRanking(): solo reanudar si se está jugando de verdad.
            // Desde el menú principal, despausar resucita el cartel final del último modo
            // completado (CinematicCore sigue activo en fase 4).
            if (document.body.classList.contains('in-game')) {
                window.gamePaused = false;
                window.GameEngine.resetTime();
                if (_cgGameplayStarted) window.GameAds.gameplayStart();
            }
            if (!window.isMusicMuted && !window.isBgmMuted && state.musicLevel > 0) bgmTheme.play().catch(() => { });
        });
        _erOverlay.addEventListener('click', (ev) => {
            if (ev.target === _erOverlay) {
                _erCloseBtn.click();
            }
        });
    }

    async function _switchToChallenge(challenge) {
        window._endlessLastTick = 0; // salir de cualquier modo resetea el guard de endless
        console.log('[SWITCH] start →', challenge);
        try {
        if (!window.isWiping) {
            saveState();
            await window.GameSave.flushKey(_activeSaveKey());
        }
        console.log('[SWITCH] state saved');
        window.GameSave.markNextMode(challenge, challenge === 'speedrun');
        if (challenge === 'endless') {
            await window.GameSave.saveRaw('chickenIdleActiveSlot', 'endless');
            await window.GameSave.saveRaw('activeChallenge', 'endless');
            await window.GameSave.remove('chickenIdleSpeedrun');
        } else if (challenge === 'speedrun') {
            await window.GameSave.remove('chickenIdleActiveSlot');
            await window.GameSave.saveRaw('chickenIdleSpeedrun', 'true');
            await window.GameSave.remove('activeChallenge');
        } else {
            await window.GameSave.remove('chickenIdleActiveSlot');
            await window.GameSave.remove('chickenIdleSpeedrun');
            if (challenge && challenge !== 'vanilla') await window.GameSave.saveRaw('activeChallenge', challenge);
            else await window.GameSave.remove('activeChallenge');
        }
        console.log('[SWITCH] localStorage flags set');

        // ── Hot reset: reinitialise all game state in-place, no page reload ──

        // 1. Destroy entire PIXI container tree and recreate it fresh.
        console.log('[SWITCH] clearing PIXI maps...');
        _pixiMap.clear();
        _stackGfxMap.clear();
        _stackBadgeMap.clear();
        _pixiMoneyTexts.length = 0;
        _pixiGenTexts.length = 0;
        _pixiHearts.length = 0;
        _flowerSprites.length = 0;
        _flowerFrame.length = 0;
        _flowerInside.length = 0;
        _bgPixiSprite = null; _bgPixiSrc = null; _catPixiSprite = null;
        _beltFarmPx = null; _beltSellPx = null; _beltFrameTex = null;
        _boomboxPixi = null; _tvPixi = null;
        _washerPixi = null; _stamperPixi = null; _packagerPixi = null; _ribbonPixi = null;
        _waterTroughPx = null; _foodTroughPx = null;
        _waterTroughVisualBounds = null; _foodTroughVisualBounds = null;
        _autoWaterStreamPx = null; _autoFoodStreamPx = null;
        _faucetSprite = null; _foodPipeSprite = null;
        _boxGfx = null; _proPackCoverGfx = null;
        window._packagerBatchFillStart = null;
        window._packagerEjectStart = null;
        window.packageEjectQueue = [];
        window.lastPackageEggTime = null;
        _holeMaskGfx = null; _holeMaskSprite = null;
        _debugGfx = null; _rotDebugGfx = null; _tutArrowGfx = null; _flyInShadowGfx = null;
        _pixelParticlesGfx = null;
        console.log('[SWITCH] destroying _pixiCont...');
        if (_pixiCont) {
            try { _pixiCont.destroy({ children: true, texture: false, baseTexture: false }); } catch (e) { console.warn('[SWITCH] destroy error:', e); }
            _pixiCont = null;
        }
        if (_pixi) {
            _pixiCont = new PIXI.Container();
            _pixiCont.sortableChildren = true;
            _pixi.stage.addChild(_pixiCont);
            console.log('[SWITCH] _pixiCont recreated');
        } else {
            console.warn('[SWITCH] _pixi is null — no PIXI container recreated');
        }

        // 2. Clear game arrays — remove orphaned DOM bubbles first
        console.log('[SWITCH] clearing game arrays...');
        chickensArr.forEach(function(c) { if (c.nameBubbleEl instanceof Element) c.nameBubbleEl.remove(); if (c.hintBubbleEl instanceof Element) c.hintBubbleEl.remove(); });
        chicksArr.forEach(function(c) { if (c.nameBubbleEl instanceof Element) c.nameBubbleEl.remove(); });
        chickensArr.length = 0; roostersArr.length = 0; chicksArr.length = 0;
        eggsArr.length = 0; particlesArr.length = 0; tombstonesArr.length = 0; draggedEggs.length = 0;

        // 3. Reset misc runtime state
        window.CinematicCore.reset();
        cinematicPhase = 0; cinematicTimer = 0; retireFadeTimer = -1;
        document.documentElement.style.setProperty('--cine-bar-top', '0%');
        document.documentElement.style.setProperty('--cine-bar-bot', '0%');
        document.documentElement.style.setProperty('--cine-content-y', '0%');
        autoSellTimer = 0; isDragging = false; _boxDragging = false;
        _saleAcc.total = 0; _saleAcc.golden = 0; _saleAcc.premium = 0; _saleAcc.mega = 0; _saleAcc.timer = 0;
        _totalMoneyEarned = 0; _totalMoneySpent = 0;
        console.log('[SWITCH] runtime state reset');

        // 4. Reset state to defaults so loadState() merges cleanly into a blank slate
        console.log('[SWITCH] resetting state object...');
        Object.keys(state).forEach(k => delete state[k]);
        Object.assign(state, JSON.parse(JSON.stringify(_STATE_DEFAULTS)));
        // Tell the DEBUG block which challenge to load (avoids it reading the old lastPlayedChallenge)
        try { localStorage.setItem('lastPlayedChallenge', challenge); } catch (_) {}
        console.log('[SWITCH] calling loadState()...');
        loadState();
        console.log('[SWITCH] loadState done — activeChallenge:', state.activeChallenge, 'chickens:', chickensArr.length);

        // Repinta la oferta de boost tras el reseteo de estado. Sin esto, el panel del shop
        // se quedaba visible con la oferta ANTERIOR: el estado sí se limpia (arriba), pero
        // el DOM solo lo actualiza _ebSyncOfferUI(), y nadie la llamaba en este punto.
        // Con _boostCurrentOffer ya a null, esta llamada lo oculta.
        _ebSyncOfferUI();

        // Skip cinematic when re-entering a completed mode
        if (state.hasRetired) {
            window.CinematicCore.enterEnd();
            cinematicPhase = 4;
            cinematicTimer = 0;
            retireFadeTimer = -1;
            chickensArr.length = 0;
            eggsArr.length = 0;
            chicksArr.length = 0;
            roostersArr.length = 0;
            tombstonesArr.length = 0;
            particlesArr.length = 0;
            draggedEggs.length = 0;
            const _shopElR = document.getElementById('shop');
            if (_shopElR) _shopElR.style.display = 'none';
            const _rkBR = document.getElementById('ranking-btn');
            const _wpBR = document.getElementById('wipe-btn');
            if (_rkBR) _rkBR.style.display = (state.isSpeedrunMode || state.activeChallenge === 'speedrun' || state.activeChallenge === 'endless') ? 'inline-block' : 'none';
            if (_wpBR) _wpBR.style.display = 'none';
        }

        // 5. Apply same post-load overrides as initAndLoad callback
        state.hasBox = false; state.boxEggs = []; state.hasSorter = false; state.sortBonusLevel = 0;
        _loadAchievements();
        console.log('[SWITCH] calling drawUIIcons / refreshAllModeBtns / updateUI...');
        drawUIIcons();
        refreshAllModeBtns();
        updateUI();
        // Sync ranking-btn visibility for the selected challenge (not just in hasRetired path)
        const _rkBSwitch = document.getElementById('ranking-btn');
        if (_rkBSwitch) _rkBSwitch.style.display =
            (state.isSpeedrunMode || state.activeChallenge === 'speedrun' || state.activeChallenge === 'endless')
            ? 'inline-block' : 'none';
        // Hide main menu overlay and restore in-game state
        const _mmo = document.getElementById('main-menu-overlay');
        if (_mmo) _mmo.style.display = 'none';
        const _po = document.getElementById('pause-overlay');
        if (_po) _po.style.display = 'none';
        document.body.classList.add('in-game');
        window._inGame = true;
        // _switchToChallenge() SOLO se llama al cambiar de modo o reiniciar el
        // actual (nunca en la primerísima entrada — esa pasa por _resumeGame(),
        // ver index.html), así que esto es SIEMPRE un "el jugador elige jugar
        // de nuevo" real. window._cgMarkGameplayStarted() es un no-op después
        // de la primera vez (por diseño, para no dispararlo solo por cargar el
        // save) — pedido explícito de CrazyGames: llamar gameplayStart() cada
        // vez que se elige jugar, no solo la primera. Se llama directo al SDK,
        // saltándose ese guard.
        _cgGameplayStarted = true;
        window.GameAds.gameplayStart();
        if (state.hasRetired) {
            // Reentrando a un reto YA retirado (enterEnd(), arriba, salta a fase 4
            // directo sin pasar por _showCineRoot()): sin esto, el bloque de abajo
            // —pensado para una partida NUEVA— apagaba is-cinematic, ocultaba
            // #retire-cine-root y anulaba window._retireCineCtx justo después de
            // haberlos activado. draw() sigue llamando a FarmCinematic.draw()
            // (state.hasRetired sigue true) pero con ctx=null no pinta nada: se
            // veía negro, con audio/lógica corriendo pero sin ningún dibujo — ni
            // el prado de fondo ni, según el timing, el propio cartel. Replica
            // aquí lo que hace _showCineRoot() para el caso normal.
            document.body.classList.add('is-cinematic');
            const _rcRootRetired = document.getElementById('retire-cine-root');
            const _cvRetired = document.getElementById('retireCineCanvas');
            if (_rcRootRetired) _rcRootRetired.style.display = 'block';
            if (_cvRetired) window._retireCineCtx = _cvRetired.getContext('2d');
            const _bgRetired = document.getElementById('retire-cine-bg');
            if (_bgRetired) _bgRetired.style.display = 'block';
        } else {
            document.body.classList.remove('is-cinematic');
            const _shopEl2 = document.getElementById('shop');
            if (_shopEl2) _shopEl2.style.display = '';
            const _rcRoot2 = document.getElementById('retire-cine-root');
            if (_rcRoot2) _rcRoot2.style.display = 'none';
            window._retireCineCtx = null;
        }
        window.CINEMATIC_ENTRY_Y1 = undefined;
        window.CINEMATIC_CHICKEN_Y1 = undefined;
        window.CINEMATIC_FORMATION_SPACING = undefined;
        if (typeof window.performDesktopAutoScale === 'function') window.performDesktopAutoScale();
        window.gamePaused = false;
        // Fade out the scene-transition overlay that _fadeToBlack left fully black
        const _tr = document.getElementById('scene-transition');
        if (_tr) {
            _tr.style.transition = 'opacity 0.4s ease';
            _tr.style.opacity = '0';
            _tr.addEventListener('transitionend', function _clearTr() {
                _tr.removeEventListener('transitionend', _clearTr);
                _tr.style.display = 'none';
            });
        }
        window.GameEngine.resetTime();
        window.isWiping = false;
        window._suppressNameBubbles = true;
        // Pedido explícito (feedback de CrazyGames): "you can call a midgame ad
        // when we choose to play a mode" — el cambio de reto es un punto de
        // corte natural (como una pausa), así que es una oportunidad de anuncio
        // más además de la periódica por tiempo de juego. Reutiliza
        // triggerMidgameAd() (ya respeta adsRemoved/DEBUG) en vez de llamar al
        // SDK directamente — mismo camino que usa el resto del juego.
        triggerMidgameAd();
        console.log('[SWITCH] ✓ complete — _pixi:', !!_pixi, '_pixiCont:', !!_pixiCont, '_pixiTex:', !!_pixiTex, 'chickens:', chickensArr.length);
        } catch (e) {
            console.error('[SWITCH] error during switch:', e);
            window.gamePaused = false;
            window.GameEngine.resetTime();
            const _trE = document.getElementById('scene-transition');
            if (_trE) { _trE.style.opacity = '0'; setTimeout(function() { _trE.style.display = 'none'; }, 400); }
        }
    }
    window._switchToChallenge = _switchToChallenge;

    // ── Cinemática ───────────────────────────────────────────────────────────
    // Toda la cinemática final vive en scenarios/farm/cinematic.js (FarmCinematic):
    // configuración, spawn de entidades, animación por fases y render.
    // Aquí solo le inyectamos referencias VIVAS a nuestro estado interno.
    //
    // Los arrays van con getter Y setter porque los spawns los REASIGNAN
    // (chickensArr = [], etc.); una copia se quedaría obsoleta.
    // Lo mismo con cinematicPhase/cinematicTimer: la animación los escribe y
    // el bucle de dibujo de este archivo los lee.
    window.FarmCinematic.init({
        get state()  { return state;  },
        get canvas() { return canvas; },
        get myPin()  { return myPin;  },
        // Setter añadido para el override de debug (ver fase 3 en cinematic.js): al
        // reasignar aquí, se reasigna la MISMA variable `myPin` que lee el handler
        // del botón de envío del nombre más abajo en este archivo (comparten cierre),
        // así que un pin nuevo generado desde cinematic.js sí llega a la petición real.
        set myPin(v) { myPin = v; },
        get RANKING_API_URL()  { return RANKING_API_URL;  },
        get SAVE_KEY_BY_MODE() { return SAVE_KEY_BY_MODE; },

        get chickensArr()  { return chickensArr;  },
        set chickensArr(v) { chickensArr = v;     },
        get chicksArr()    { return chicksArr;    },
        set chicksArr(v)   { chicksArr = v;       },
        get eggsArr()      { return eggsArr;      },
        set eggsArr(v)     { eggsArr = v;         },
        get roostersArr()  { return roostersArr;  },
        set roostersArr(v) { roostersArr = v;     },
        get particlesArr()  { return particlesArr; },
        set particlesArr(v) { particlesArr = v;    },

        get cinematicPhase()  { return cinematicPhase;  },
        set cinematicPhase(v) { cinematicPhase = v;     },
        get cinematicTimer()  { return cinematicTimer;  },
        set cinematicTimer(v) { cinematicTimer = v;     },

        createChick, createRooster,
        renderChicken, renderChick, renderRooster, drawEgg, drawFence,
        fmt, fmtMoney, formatTimeSecs,
        playSound, sfxRoosterFight,
    });

    function refreshAllModeBtns() {
        const modes = [
            { challenge: 'vanilla', btnId: 'normal-mode-btn', playI18n: 'playMode' },
            { challenge: 'speedrun', btnId: 'speedrun-start-btn', playI18n: 'playSpeedrun' },
            { challenge: 'adam', btnId: 'adam-mode-btn', playI18n: 'playAdam' },
            { challenge: 'manual', btnId: 'fourth-mode-btn', playI18n: 'playManual' },
            { challenge: 'endless', btnId: 'endless-mode-btn', playI18n: 'playEndless' },
        ];
        for (const m of modes) {
            const btn = document.getElementById(m.btnId);
            if (!btn) continue;
            const hasSave = !!window.GameSave.loadRaw(SAVE_KEY_BY_MODE[m.challenge]);
            btn.textContent = hasSave
                ? (window.t ? window.t('continueEndless') : 'CONTINUE')
                : (window.t ? window.t(m.playI18n) : btn.getAttribute('data-i18n') || 'PLAY');
            const card = btn.closest('.challenge-card');
            const actionRow = card ? card.querySelector('.card-action-row') : null;
            const existingRb = actionRow ? actionRow.querySelector('.card-restart-btn') : null;
            if (hasSave && actionRow && !existingRb) {
                const rb = document.createElement('button');
                rb.className = 'pixel-btn btn-sprite btn-red card-restart-btn';
                rb.style.cssText = 'flex:1;padding:6px 8px;border:0;display:flex;align-items:center;justify-content:center;';
                const icon = document.createElement('span');
                icon.className = 'card-icon card-icon-borrar';
                rb.appendChild(icon);
                rb.addEventListener('click', (e) => {
                    e.stopPropagation();
                    _openWipeConfirm(m.challenge);
                });
                actionRow.insertBefore(rb, actionRow.firstChild);
            } else if (!hasSave && existingRb) {
                existingRb.remove();
            }
        }
    }

    if (speedrunStartBtn) {
        speedrunStartBtn.addEventListener('click', async () => {
            if (window._inGame) return;
            if (rankingOverlay) rankingOverlay.style.display = 'none';
            await _switchToChallenge('speedrun');
        });
    }
    if (normalModeBtn) {
        normalModeBtn.addEventListener('click', async () => {
            if (window._inGame) return;
            if (rankingOverlay) rankingOverlay.style.display = 'none';
            await _switchToChallenge('vanilla');
        });
    }

    const adamModeBtn = document.getElementById('adam-mode-btn');
    if (adamModeBtn) {
        adamModeBtn.addEventListener('click', async () => {
            if (window._inGame) return;
            if (rankingOverlay) rankingOverlay.style.display = 'none';
            await _switchToChallenge('adam');
        });
    }

    const fourthModeBtn = document.getElementById('fourth-mode-btn');
    if (fourthModeBtn) {
        fourthModeBtn.addEventListener('click', async () => {
            if (window._inGame) return;
            if (rankingOverlay) rankingOverlay.style.display = 'none';
            await _switchToChallenge('manual');
        });
    }

    const endlessModeBtn = document.getElementById('endless-mode-btn');
    if (endlessModeBtn) {
        endlessModeBtn.addEventListener('click', async () => {
            if (window._inGame) return;
            if (rankingOverlay) rankingOverlay.style.display = 'none';
            await _switchToChallenge('endless');
        });
    }

    const endlessLeaderboardBtn = document.getElementById('endless-leaderboard-btn');
    if (endlessLeaderboardBtn) {
        endlessLeaderboardBtn.addEventListener('click', () => {
            window.GameAds.showLeaderboard('endlessFarm', () => { const rb = document.getElementById('ranking-btn'); if (rb) rb.click(); });
        });
    }


    if (speedrunSubmitBtn) {
        speedrunSubmitBtn.addEventListener('click', () => {
            let name = (speedrunNameInput.value || "").trim().toUpperCase().substring(0, 15);
            if (name.length < 3) {
                let oldText = speedrunSubmitBtn.innerText;
                speedrunSubmitBtn.innerText = "NAME TOO SHORT!";
                speedrunSubmitBtn.style.background = "#e74c3c";
                setTimeout(() => {
                    speedrunSubmitBtn.innerText = oldText;
                    speedrunSubmitBtn.style.background = "#2ecc71";
                }, 2000);
                return;
            }
            let market = document.getElementById('speedrun-market-select');
            let selectedMarket = market ? market.value : "";

            if (!selectedMarket) {
                let oldText = speedrunSubmitBtn.innerText;
                speedrunSubmitBtn.innerText = "SELECT COMMUNITY!";
                speedrunSubmitBtn.style.background = "#e74c3c";
                setTimeout(() => {
                    speedrunSubmitBtn.innerText = oldText;
                    speedrunSubmitBtn.style.background = "#2ecc71";
                }, 2000);
                return;
            }

            let timeSecs = Math.floor(state.playTime || 0);
            let chickens = state.maxChickens || state.chickens || 0;

            // Envío de prueba disparado por F4 (ver cinematic.js): F4 fuerza money/
            // totalEarnings directamente para pagar el retiro al instante, lo que
            // descuadra este chequeo aunque no haya trampa real — se salta solo para
            // ese caso, de un solo uso.
            const _skipCheatCheck = window._f4DebugSubmission;
            window._f4DebugSubmission = false;
            const _isTr = (window.currentLang === 'tr');
            if (!_skipCheatCheck && state.money + _totalMoneySpent > _totalMoneyEarned + 100) {
                speedrunSubmitBtn.innerText = _isTr ? "HİLE TESPİT EDİLDİ!" : "CHEATER DETECTED!";
                speedrunSubmitBtn.style.background = "#e74c3c";
                speedrunSubmitBtn.disabled = true;
                return;
            }

            speedrunSubmitBtn.innerText = _isTr ? "GÖNDERİLİYOR..." : "SENDING...";
            speedrunSubmitBtn.disabled = true;

            fetch(RANKING_API_URL + '/submit_score_2.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, market: selectedMarket, time_secs: timeSecs, chickens, pin: myPin })
            })
                .then(r => r.json())
                .then(data => {
                    if (data.ok) {
                        speedrunSubmitBtn.innerText = _isTr ? `#${data.pos} KAYDEDİLDİ!` : `#${data.pos} SUBMITTED!`;
                        localStorage.setItem('chickenIdleSpeedrunSubmitted', 'true');
                        localStorage.setItem('chickenIdleLastName', name);
                        localStorage.setItem('chickenIdleLastPos', String(data.pos));
                        localStorage.setItem('chickenIdleSpeedrunData', JSON.stringify({ pos: data.pos, name: name, market: selectedMarket, time_secs: timeSecs }));
                        window._endRankPlayerPos = data.pos;
                        window._endRankFetched = false;
                    } else {
                        speedrunSubmitBtn.innerText = data.error || (_isTr ? 'HATA' : 'ERROR');
                    }
                    setTimeout(() => {
                        if (nameInputOverlay) nameInputOverlay.style.display = 'none';
                    }, 2000);
                })
                .catch(() => {
                    speedrunSubmitBtn.innerText = _isTr ? 'ÇEVRİMDIŞI - GÖNDERİLEMEDİ' : 'OFFLINE - NOT SENT';
                    setTimeout(() => {
                        if (nameInputOverlay) nameInputOverlay.style.display = 'none';
                    }, 2000);
                });
        });
    }

    // ── Orientation + Tooltip — shared/engine.js ────────────────────────────
    // Portrait mode is now a supported layout — don't pause when in portrait
    if (window.GAME_MODE !== 'portrait') {
        window.GameEngine.setupOrientation(
            () => { if (!window.isMusicMuted && !bgmTheme.paused) bgmTheme.pause(); },
            () => { if (!window.isMusicMuted && state.musicLevel > 0 && !window.gamePaused && !window.isAdPaused) bgmTheme.play().catch(() => { }); }
        );
    }

    const gameTooltip = document.getElementById('game-tooltip');
    // Chicken counter tooltip
    const _chickenStatEl = document.getElementById('stats-header');
    if (_chickenStatEl && gameTooltip) {
        _chickenStatEl.style.cursor = 'var(--cur-hand)';
        _chickenStatEl.addEventListener('mousemove', (e) => {
            const normal = chickensArr.filter(c => !c.mega).length;
            const rose = chickensArr.filter(c => c.mega === true || c.mega === 1).length;
            const blue = chickensArr.filter(c => c.mega === 2).length;
            const total = normal + rose * 50 + blue * 500;
            const blue2 = chickensArr.filter(c => c.mega === 1).length;
            const rose2 = chickensArr.filter(c => c.mega === 2).length;
            const gold2 = chickensArr.filter(c => c.mega === 3).length;
            const green2 = chickensArr.filter(c => c.mega === 4).length;
            const purple2 = chickensArr.filter(c => c.mega === 5).length;
            const total2 = normal + blue2 * 10 + rose2 * 50 + gold2 * 500 + green2 * 2500 + purple2 * 25000;
            const _tt = window.t || (k => k);
            let _lines = `${_tt('tipNormal')}: ${normal}`;
            if (blue2 > 0) _lines += `<br>${_tt('tipBlue')}: ${blue2}`;
            if (rose2 > 0) _lines += `<br>${_tt('tipRose')}: ${rose2}`;
            if (gold2 > 0) _lines += `<br>${_tt('tipGold')}: ${gold2}`;
            if (green2 > 0) _lines += `<br>${_tt('tipGreen')}: ${green2}`;
            if (purple2 > 0) _lines += `<br>${_tt('tipPurple')}: ${purple2}`;
            _lines += `<br>─────────────<br>${_tt('tipTotal')}: ${total2}`;
            gameTooltip.innerHTML = _lines;
            gameTooltip.style.display = 'block';
            let x = e.clientX + 15, y = e.clientY + 15;
            if (x + gameTooltip.offsetWidth > window.innerWidth) x = window.innerWidth - gameTooltip.offsetWidth - 10;
            if (y + gameTooltip.offsetHeight > window.innerHeight) y = window.innerHeight - gameTooltip.offsetHeight - 10;
            gameTooltip.style.left = x + 'px';
            gameTooltip.style.top = y + 'px';
        });
        _chickenStatEl.addEventListener('mouseleave', () => { gameTooltip.style.display = 'none'; });
    }

    window.GameEngine.setupTooltip(gameTooltip, (btn, title) => {
        if (window.infoMode && btn.classList.contains('shop-btn')) return '';
        if (btn.id === 'buy-magnet' && state.activeChallenge === 'manual' && title) {
            const manualCaps = [1, 2, 4, 6, 8, 10, 15, 20, 30, 50, 75, 100, 150];
            const lvl = state.magnetLevel || 0;
            const diff = (lvl < 12) ? (manualCaps[lvl + 1] - manualCaps[lvl]) : 0;
            return title.replace('+5px', '+6px').replace('+1 ', '+' + diff + ' ');
        }
        return title;
    });

    // Logic for Steam Wishlist Button (disabled for standalone/local)
    const steamWishlistBtn = document.getElementById('steam-btn');
    if (steamWishlistBtn) {
        steamWishlistBtn.style.display = 'none';
    }
    // One-time check for legacy 1.0.5 players
    if (!localStorage.getItem('legacyCheckDone')) {
        localStorage.setItem('legacyCheckDone', 'true');
        // If they already have a save file before playing 1.1, they are returning players!
        if (localStorage.getItem('chickenIdleSave')) {
            localStorage.setItem('chickenIdleBeaten', 'true');
        }
    }

    // Background Ping System
    let globalPlaytimeTracker = parseInt(localStorage.getItem('chickenIdleGlobalPlaytime') || '0');
    let lastPingTime = Date.now();

    function sendPing() {
        let pin = localStorage.getItem('chickenIdleSpeedrunPin');
        if (!pin) return;

        let now = Date.now();
        let dt = Math.floor((now - lastPingTime) / 1000);
        lastPingTime = now;
        if (dt > 120) dt = 60; // Max out offline cheating protection for telemetry
        if (dt > 0) {
            globalPlaytimeTracker += dt;
            localStorage.setItem('chickenIdleGlobalPlaytime', globalPlaytimeTracker.toString());
        }

        let lastName = localStorage.getItem('chickenIdleLastName') || '';

        let beatenList = [];
        ['pb_vanilla', 'pb_speedrun', 'pb_adam', 'pb_manual'].forEach(k => {
            if (localStorage.getItem(k)) beatenList.push(k.replace('pb_', ''));
        });
        let currentMode = state.isSpeedrunMode ? 'speedrun' : (state.activeChallenge || 'vanilla');

        if (RANKING_API_URL) {
            fetch(RANKING_API_URL + '/sync_stats.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                player_id: pin,
                name: lastName,
                market: GAME_MARKET,
                total_playtime_secs: globalPlaytimeTracker,
                money: state.money,
                chickens: state.maxChickens || state.chickens || 0,
                has_retired: localStorage.getItem('chickenIdleBeaten') === 'true',
                active_mode: currentMode,
                beaten_count: beatenList.length,
                beaten_list: beatenList.join(','),
                lang: currentLang
            })
        }).catch(() => { });
    }

        // Endless ranking — solo si el game loop endless corrió en los últimos 90s (no desde menú/intro)
        const _endlessActive = currentMode === 'endless'
            && (state.totalEarnings || 0) > 0
            && window._endlessLastTick
            && (Date.now() - window._endlessLastTick) < 10000;
        if (_endlessActive) _submitEndlessScore();
    }

    // Extraído de sendPing() para poder reusarlo cuando el jugador cambia su
    // nombre desde el panel de ranking (ver ranking-name-edit-save): antes el
    // nombre nuevo solo llegaba al servidor en el siguiente ping periódico
    // (hasta 60s de espera) y la tabla no se refrescaba sola. IMPORTANTE: el
    // servidor (submit_endless.php) solo actualiza name/market/etc. si las
    // earnings enviadas son >= a las que ya tiene guardadas — por eso hay que
    // reenviar las earnings actuales (nunca 0) junto con el nombre, o el
    // cambio de nombre se ignora en silencio si el jugador ya tenía puntuación.
    function _submitEndlessScore(onDone) {
        const pin = localStorage.getItem('chickenIdleSpeedrunPin');
        const lastName = localStorage.getItem('chickenIdleLastName') || '';
        if (!pin) { onDone?.(false); return; }
        const _en = chickensArr.filter(c => !c.mega).length;
        const _eb = chickensArr.filter(c => c.mega === 1).length;
        const _er = chickensArr.filter(c => c.mega === 2).length;
        const _eg = chickensArr.filter(c => c.mega === 3).length;
        const _egr = chickensArr.filter(c => c.mega === 4).length;
        const _epu = chickensArr.filter(c => c.mega === 5).length;
        const _chickenEquiv = _en + _eb * 10 + _er * 50 + _eg * 500 + _egr * 2500 + _epu * 25000;
        const _payload = {
            pin: pin,
            name: lastName || 'Farmer',
            market: GAME_MARKET,
            earnings: Math.floor(state.totalEarnings || 0),
            chickens: _chickenEquiv,
            eggs_sold: state.eggsSold || 0,
            play_time_secs: Math.floor(state.playTime || 0)
        };
        console.log('[EndlessRank] POST submit_endless payload:', _payload);
        fetch(RANKING_API_URL + '/submit_endless.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(_payload)
        }).then(r => r.text()).then(raw => {
            console.log('[EndlessRank] submit_endless raw response:', raw);
            try {
                const d = JSON.parse(raw);
                if (d.ok) { window._endlessMyRank = d.rank; onDone?.(true); }
                else { console.error('[EndlessRank] submit_endless error:', d); onDone?.(false); }
            } catch(e) { console.error('[EndlessRank] submit_endless JSON parse fail:', raw); onDone?.(false); }
        }).catch(e => { console.error('[EndlessRank] submit_endless fetch error:', e); onDone?.(false); });
    }

    // Initial ping and loop
    setTimeout(sendPing, 2000);
    setInterval(sendPing, 60000);

    let hasBeatenGame = localStorage.getItem('chickenIdleBeaten');
    let rankBtnInit = document.getElementById('ranking-btn');
    let wipeBtnInit = document.getElementById('wipe-btn');
    const _rankModes = state.activeChallenge === 'speedrun' || state.activeChallenge === 'endless' || state.isSpeedrunMode;
    if (rankBtnInit) rankBtnInit.style.display = _rankModes ? 'inline-block' : 'none';
    if (hasBeatenGame || state.isSpeedrunMode) {
        if (wipeBtnInit) wipeBtnInit.style.display = 'none';
    }

    // ── Dev toast (feedback visual para toggles de captura de video) ─────────
    let _devToastEl = null;
    let _devToastTimer = null;
    function _showDevToast(msg) {
        if (!_devToastEl) {
            _devToastEl = document.createElement('div');
            _devToastEl.style.cssText =
                'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:999999;' +
                'background:rgba(0,0,0,0.75);color:#fff;' +
                'font-family:"Press Start 2P",cursive;font-size:9px;' +
                'padding:8px 14px;border-radius:4px;pointer-events:none;' +
                'opacity:0;transition:opacity 0.2s;white-space:nowrap;';
            document.body.appendChild(_devToastEl);
        }
        _devToastEl.textContent = msg;
        _devToastEl.style.opacity = '1';
        clearTimeout(_devToastTimer);
        _devToastTimer = setTimeout(() => { _devToastEl.style.opacity = '0'; }, 1200);
    }

    // ── Debug: saltar directo a la cinemática de retirada de un modo ─────────
    // Usada por el atajo de teclado 1-5 (window.DEBUG) y por el menú de
    // triple-tap sobre el contador de dinero (ver más abajo) — este último no
    // depende de teclado, para poder probarlo en móvil.
    function _debugJumpToCinematic(mode) {
        state.activeChallenge = mode;
        state.isSpeedrunMode = (mode === 'speedrun');
        state.hasRetired = false;
        window._cineOldChickens = state.chickens || 100;
        window.CinematicCore.start(state.activeChallenge, {
            onCommonSetup: function () {
                state.hasRetired = true;
                window.CINEMATIC_ENTRY_Y1 = 180;
                window.CINEMATIC_CHICKEN_Y1 = 100;
                window.CINEMATIC_FORMATION_SPACING = 24;
                chickensArr = []; eggsArr = []; chicksArr = []; roostersArr = [];
                tombstonesArr = []; particlesArr = []; draggedEggs = [];
                _saleAcc = { total: 0, golden: 0, premium: 0, mega: 0, timer: 0 };
            },
            onStatsUpdate: function () { _updateRetireStats(); }
        });
        console.log(`[CIN] → ${mode}`);
    }

    // ── Debug: menú de cinemáticas por triple-tap en el contador de dinero ──
    // Pedido explícito: no puede ser una tecla, hace falta probarlo en móvil.
    // 3 toques en menos de 700ms sobre #money-counter abren el menú.
    function _showCinematicMenu() {
        var existing = document.getElementById('cinematic-debug-menu');
        if (existing) existing.remove();

        var menu = document.createElement('div');
        menu.id = 'cinematic-debug-menu';
        Object.assign(menu.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.75)', zIndex: '999999',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '10px', fontFamily: "'Press Start 2P', monospace",
        });

        var modes = [
            ['vanilla',  'VANILLA'],
            ['speedrun', 'SPEEDRUN'],
            ['adam',     'ADAM & EVE'],
            ['manual',   'EGG JAM'],
            ['endless',  'ENDLESS'],
        ];
        modes.forEach(function (m) {
            var btn = document.createElement('button');
            btn.className = 'pixel-btn';
            btn.textContent = m[1];
            btn.style.fontSize = '10px';
            btn.style.padding = '12px 18px';
            btn.addEventListener('click', function () {
                menu.remove();
                _debugJumpToCinematic(m[0]);
            });
            menu.appendChild(btn);
        });

        var closeBtn = document.createElement('button');
        closeBtn.className = 'pixel-btn';
        closeBtn.textContent = 'CERRAR';
        closeBtn.style.fontSize = '10px';
        closeBtn.style.padding = '12px 18px';
        closeBtn.style.background = '#c0392b';
        closeBtn.addEventListener('click', function () { menu.remove(); });
        menu.appendChild(closeBtn);

        document.body.appendChild(menu);
    }

    (function () {
        // Desactivado a petición explícita — dejar el listener aquí (sin
        // registrar) para poder reactivarlo luego sin rehacerlo.
        if (true) return;
        var _moneyCounter = document.getElementById('money-counter');
        if (!_moneyCounter) return;
        var _tapTimes = [];
        _moneyCounter.addEventListener('click', function () {
            var now = Date.now();
            _tapTimes.push(now);
            _tapTimes = _tapTimes.filter(function (t) { return now - t < 700; });
            if (_tapTimes.length >= 3) {
                _tapTimes = [];
                _showCinematicMenu();
            }
        });
    })();

    // ── Dev/cheat panel (F6) ─────────────────────────────────────────────────
    let _debugPanel = null;
    let _dbgStatsEl = null;
    let _dbgStatsInterval = null;
    // perf tracking
    let _dbgFpsSamples = [];
    let _dbgLastRafT   = performance.now();
    let _dbgFrameTimes = [];
    let _dbgRafHooked  = false;

    // Desglose de coste por subsistema, en ms — mismo patrón de anillo que
    // _dbgFrameTimes pero una serie por categoría ('chickenLogic', 'eggCollision',
    // 'nameBubbles', 'update', 'draw', 'pixiSync', 'syncChickens', 'syncEggs').
    // Pedido: "puedes ponerme los costes por ms frame de todo lo que puedas medir".
    let _dbgPerfSamples = {};
    function _dbgPerfSample(name, ms) {
        let arr = _dbgPerfSamples[name];
        if (!arr) { arr = []; _dbgPerfSamples[name] = arr; }
        arr.push(ms);
        if (arr.length > 60) arr.shift();
    }
    function _dbgPerfAvg(name) {
        const arr = _dbgPerfSamples[name];
        if (!arr || !arr.length) return 0;
        let sum = 0;
        for (let i = 0; i < arr.length; i++) sum += arr[i];
        return sum / arr.length;
    }

    function _dbgHookRaf() {
        if (_dbgRafHooked) return;
        _dbgRafHooked = true;
        const _orig = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = function(cb) {
            return _orig(function(ts) {
                const ft = ts - _dbgLastRafT;
                _dbgLastRafT = ts;
                if (ft > 0 && ft < 500) {
                    _dbgFrameTimes.push(ft);
                    if (_dbgFrameTimes.length > 180) _dbgFrameTimes.shift();
                }
                cb(ts);
            });
        };
    }

    function _dbgUpdateStats() {
        if (!_dbgStatsEl || !_debugPanel || _debugPanel.style.display === 'none') return;

        const fps     = window.GameEngine ? window.GameEngine.getFps() : 0;
        _dbgFpsSamples.push(fps);
        if (_dbgFpsSamples.length > 60) _dbgFpsSamples.shift();

        const fpsMin  = Math.min(..._dbgFpsSamples);
        const fpsMax  = Math.max(..._dbgFpsSamples);
        const fpsAvg  = (_dbgFpsSamples.reduce((a, b) => a + b, 0) / _dbgFpsSamples.length).toFixed(1);
        const ftAvg   = _dbgFrameTimes.length
            ? (_dbgFrameTimes.reduce((a, b) => a + b, 0) / _dbgFrameTimes.length).toFixed(1)
            : '–';
        const ftMax   = _dbgFrameTimes.length
            ? Math.max(..._dbgFrameTimes).toFixed(1)
            : '–';

        const nC  = chickensArr.length;
        const nE  = eggsArr.length;
        const nP  = particlesArr.length;
        const nCk = chicksArr ? chicksArr.length : 0;
        const nR  = roostersArr ? roostersArr.length : 0;

        let memStr = '–';
        if (performance.memory) {
            memStr = (performance.memory.usedJSHeapSize / 1048576).toFixed(1) + ' MB';
        }

        // Desglose de coste por subsistema (avg de las últimas 60 muestras de cada
        // uno — ver _dbgPerfSample). "IAgal" = lógica/IA de gallinas (script.js
        // ~2970), "colhu" = colisión huevo-huevo (~3937), "sygal"/"syhue" = sync a
        // sprites PixiJS por entidad, "bocad" = bocadillos "hola soy X" (limitado a
        // 5 a la vez, pero recorre el array 2×/frame igualmente).
        const rUpd = _dbgPerfAvg('update');
        const rDrw = _dbgPerfAvg('draw');
        const rPix = _dbgPerfAvg('pixiSync');
        const rChk = _dbgPerfAvg('chickenLogic');
        const rEgg = _dbgPerfAvg('eggCollision');
        const rSyC = _dbgPerfAvg('syncChickens');
        const rSyE = _dbgPerfAvg('syncEggs');
        const rBub = _dbgPerfAvg('nameBubbles');
        const rHrt = _dbgPerfAvg('pixiHearts');
        const rRnd = _dbgPerfAvg('pixiRender');
        const rCkA = _dbgPerfAvg('chicksLogic');
        const rRoA = _dbgPerfAvg('roosterLogic');
        const rBox = _dbgPerfAvg('boxPhysics');
        const rMch = _dbgPerfAvg('machineAnim');
        const rDrg = _dbgPerfAvg('dragMagnet');
        const rTxt = _dbgPerfAvg('pixiTextFx');
        const rTop = _dbgPerfAvg('updateTop');
        const rDed = _dbgPerfAvg('deadFilter');
        const rTail = _dbgPerfAvg('eggFloorTail');
        const rUI = _dbgPerfAvg('updateUICall');
        // "otros": lo que queda del total tras restar todo lo medido por separado —
        // así SIEMPRE cuadra con updt/pixi aunque algo no esté desglosado todavía.
        const rUpdOther = Math.max(0, rUpd - (rChk + rEgg + rCkA + rRoA + rBox + rMch + rDrg + rTop + rDed + rTail + rUI));
        const rPixOther = Math.max(0, rPix - (rSyC + rSyE + rHrt + rRnd + rTxt));
        const pUpd = rUpd.toFixed(2);
        const pDrw = rDrw.toFixed(2);
        const pPix = rPix.toFixed(2);
        const pChk = rChk.toFixed(2);
        const pEgg = rEgg.toFixed(2);
        const pSyC = rSyC.toFixed(2);
        const pSyE = rSyE.toFixed(2);
        const pBub = rBub.toFixed(2);
        const pHrt = rHrt.toFixed(2);
        const pRnd = rRnd.toFixed(2);
        const pCkA = rCkA.toFixed(2);
        const pRoA = rRoA.toFixed(2);
        const pBox = rBox.toFixed(2);
        const pMch = rMch.toFixed(2);
        const pDrg = rDrg.toFixed(2);
        const pTxt = rTxt.toFixed(2);
        const pTop = rTop.toFixed(2);
        const pDed = rDed.toFixed(2);
        const pTail = rTail.toFixed(2);
        const pUI = rUI.toFixed(2);
        const pUpdOther = rUpdOther.toFixed(2);
        const pPixOther = rPixOther.toFixed(2);
        const nHearts = window._dbgHeartCount || 0;

        const fpsColor = fps < 30 ? '#f55' : fps < 50 ? '#fa0' : '#0f0';
        _dbgStatsEl.innerHTML =
            '<span style="color:#ff0">── RENDIMIENTO ──</span>\n' +
            '<span style="color:' + fpsColor + '">FPS  : ' + fps + '</span>  avg ' + fpsAvg + '\n' +
            'min  : ' + fpsMin + '   max : ' + fpsMax + '\n' +
            'ft Δ : ' + ftAvg + ' ms  spike: ' + ftMax + ' ms\n' +
            '<span style="color:#ff0">── ENTIDADES ──</span>\n' +
            'gall : ' + nC + '  pollos: ' + nCk + '  gallo: ' + nR + '\n' +
            'huevs: ' + nE + '  part : ' + nP + '  corzn: ' + nHearts + '\n' +
            'mem  : ' + memStr + '\n' +
            '<span style="color:#ff0">── COSTE (ms) ──</span>\n' +
            'updt : ' + pUpd + '  draw : ' + pDrw + '\n' +
            'pixi : ' + pPix + '\n' +
            'IAgal: ' + pChk + '  colhu: ' + pEgg + '\n' +
            'sygal: ' + pSyC + '  syhue: ' + pSyE + '\n' +
            'bocad: ' + pBub + '  corzn: ' + pHrt + '\n' +
            'rendr: ' + pRnd + '  txtfx: ' + pTxt + '\n' +
            'IApol: ' + pCkA + '  IAgll: ' + pRoA + '\n' +
            'caja : ' + pBox + '  maqns: ' + pMch + '\n' +
            'arstr: ' + pDrg + '  uitop: ' + pTop + '\n' +
            'muert: ' + pDed + '  cola : ' + pTail + '\n' +
            '<span style="color:#f0f">updUI(/frame): ' + pUI + '</span>\n' +
            '<span style="color:#f80">otr.u: ' + pUpdOther + '  otr.p: ' + pPixOther + '</span>\n' +
            '<span style="color:#ff0">── ESTADO ──</span>\n' +
            'mode : ' + (state.activeChallenge || '?') + '\n' +
            'money: $' + Math.floor(state.money || 0) + '\n' +
            _dbgChickenPriceBlock() + '\n' +
            (window.gamePaused ? '<span style="color:#f55">⏸ PAUSADO</span>' : '<span style="color:#0f0">▶ CORRIENDO</span>');
    }

    // Precio de la próxima gallina + fórmula, para ver de un vistazo cuándo se
    // llega al techo (ver _cappedChickenCost/_chickenPriceCap/_nextChickenCost
    // más arriba). Solo tiene sentido en Endless — es el único modo con techo.
    function _dbgChickenPriceBlock() {
        if (state.activeChallenge !== 'endless') return '';
        const n      = state.purchasedChickens || 0;
        const raw    = _nextChickenCost(n);
        const cap    = _chickenPriceCap();
        const applied = state.costs.chicken;
        const isCapped = cap > 0 && raw > cap;
        let untilCap = '–';
        if (cap > 0 && !isCapped) {
            let _n = n, _raw = raw, _steps = 0;
            while (_raw <= cap && _steps < 100000) { _n++; _steps++; _raw = _nextChickenCost(_n); }
            untilCap = String(_steps);
        } else if (isCapped) {
            untilCap = '0 (ya capado)';
        }
        return '<span style="color:#ff0">── PRECIO GALLINA ──</span>\n' +
            'compradas: ' + n + '\n' +
            'precio actual: $' + fmt(applied) + (isCapped ? ' <span style="color:#f80">[CAPADO]</span>' : '') + '\n' +
            'crudo (sin techo): $' + fmt(raw) + '\n' +
            'techo ((5000+gallinas ponderadas)×valor huevo medio): $' + fmt(cap) + '\n' +
            'fórmula: 5→∞ = anterior × 1.12 (ceil)\n' +
            'faltan p/ tocar techo: ' + untilCap;
    }

    function _createDebugPanel() {
        _debugPanel = document.createElement('div');
        _debugPanel.id = 'farm-debug-panel';
        _debugPanel.style.cssText =
            'position:fixed;bottom:60px;left:12px;z-index:99999;' +
            'background:#111;border:2px solid #0f0;color:#0f0;' +
            'font-family:"Press Start 2P",cursive;font-size:9px;' +
            'padding:8px 10px;border-radius:4px;display:none;user-select:none;min-width:200px;';
        const title = document.createElement('div');
        title.textContent = '⚙ DEBUG PANEL';
        title.style.cssText = 'color:#ff0;margin-bottom:8px;font-size:8px;letter-spacing:1px;';
        _debugPanel.appendChild(title);

        // Live stats block
        _dbgStatsEl = document.createElement('pre');
        _dbgStatsEl.style.cssText =
            'margin:0 0 10px;padding:6px 8px;background:#0a0a0a;border:1px solid #0f0;' +
            'font-family:"Press Start 2P",cursive;font-size:8px;line-height:1.8;white-space:pre;';
        _dbgStatsEl.textContent = 'Cargando...';
        _debugPanel.appendChild(_dbgStatsEl);

        function makeSep() {
            const s = document.createElement('div');
            s.style.cssText = 'border-top:1px solid #0f0;margin:6px 0;';
            _debugPanel.appendChild(s);
        }

        function makeBtn(label, fn) {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.cssText =
                'display:block;width:100%;margin-bottom:5px;' +
                'background:#1a1a1a;color:#0f0;border:1px solid #0f0;' +
                'font-family:"Press Start 2P",cursive;font-size:8px;' +
                'padding:5px 7px;cursor:var(--cur-finger);text-align:left;' +
                'transition:background 0.1s;';
            btn.onmouseenter = function() { btn.style.background = '#003300'; };
            btn.onmouseleave = function() { btn.style.background = '#1a1a1a'; };
            btn.onclick = fn;
            _debugPanel.appendChild(btn);
        }

        makeSep();
        makeBtn('+1.000 💰', function() { state.money += 1000; updateUI(); });
        makeBtn('+1.000.000 💰', function() { state.money += 1000000; updateUI(); });
        makeBtn('+10.000.000 💰', function() { state.money += 10000000; updateUI(); });
        makeBtn('+1.000.000.000 💰', function() { state.money += 1000000000; updateUI(); });
        makeBtn('GALLINA GRATIS 🐔', function() {
            const c = _registerNewChicken(createChicken(false, null, true));
            chickensArr.push(c);
            state.chickens++;
            updateUI();
        });
        makeBtn('POLLITO GRATIS 🐣', function() {
            const c = _registerNewChicken(createChicken(1, null, true));
            chickensArr.push(c);
            state.chickens++;
            updateUI();
        });
        makeSep();
        makeBtn('STRESS +20 🐔🔥', function() {
            for (let _si = 0; _si < 20; _si++) {
                const c = _registerNewChicken(createChicken(false, null, true));
                chickensArr.push(c);
                state.chickens++;
            }
            updateUI();
        });
        makeBtn('RESET STATS 📊', function() {
            _dbgFpsSamples = [];
            _dbgFrameTimes = [];
            _dbgPerfSamples = {};
        });
        makeSep();
        makeBtn('COLISIONES [D]', function() { _debugBoxCol = !_debugBoxCol; });

        document.body.appendChild(_debugPanel);
        _dbgHookRaf();
        _dbgStatsInterval = setInterval(_dbgUpdateStats, 500);
    }

    // ══════════════════════════════════════════════════════════════════════
    // Google Play screenshot automation hooks — llamados por
    // tools_dev/screenshots/generate_screenshots.js (Puppeteer), NUNCA por el
    // jugador. No van detrás de `window.DEBUG`: no son un atajo de teclado,
    // solo son alcanzables invocando window.setScreenshotState(...) a mano
    // desde un script de automatización.
    // ══════════════════════════════════════════════════════════════════════
    let _ssBackup = null;
    let _ssOrigFetch = null;

    function _ssWaitFor(check, timeoutMs) {
        const start = Date.now();
        return new Promise(resolve => {
            (function poll() {
                if (check() || Date.now() - start > timeoutMs) { resolve(); return; }
                setTimeout(poll, 100);
            })();
        });
    }

    function _ssEnterGame() {
        const mmo = document.getElementById('main-menu-overlay');
        if (mmo) mmo.style.display = 'none';
        document.body.classList.add('in-game');
        window._inGame = true;
        window.gamePaused = false;
    }

    function _ssStageEntities(nChickens, nRoosters, nChicks, nEggs) {
        chickensArr.length = 0; roostersArr.length = 0; chicksArr.length = 0; eggsArr.length = 0;
        for (let i = 0; i < nChickens; i++) {
            const c = _registerNewChicken(createChicken(false, null, false));
            // createChicken() siempre arranca con direction:1 (solo se recalcula cuando la
            // IA de movimiento lo toca en su próximo ciclo) — sin esto, todas las gallinas
            // recién spawneadas miran hacia el mismo lado en la captura.
            c.direction = Math.random() < 0.5 ? 1 : -1;
            chickensArr.push(c);
        }
        for (let i = 0; i < nRoosters; i++) {
            const r = createRooster(false);
            r.direction = Math.random() < 0.5 ? 1 : -1;
            roostersArr.push(r);
        }
        for (let i = 0; i < nChicks; i++) {
            const p = _safeSpawnPos();
            const ch = createChick(p.x, p.y);
            ch.direction = Math.random() < 0.5 ? 1 : -1;
            chicksArr.push(ch);
        }
        for (let i = 0; i < nEggs; i++) {
            // Márgenes generosos en X: el huevo más antiguo sin recoger recibe la burbuja de
            // tutorial "Drag me to the market..." (ver _updateTutorialBubbles), y esa burbuja
            // es un <div> HTML de 140px de ancho anclado a la posición del huevo — si spawnea
            // demasiado cerca del borde, Puppeteer recorta la burbuja fuera del viewport.
            layEgg(260 + Math.random() * (canvas.width - 520), 150 + Math.random() * 150, Math.random() < 0.5 ? 1 : -1, false);
        }
        state.chickens = chickensArr.length;
    }

    // #ranking-list es flex:1 con overflow-y:scroll — su alto real es "lo que quede
    // libre en el modal", no un valor fijo. Con solo 6 filas se queda mayormente vacío
    // (hueco grande antes del botón VOLVER); con ~15 se llena de borde a borde sin
    // desbordar nada (las de más simplemente quedan fuera del scroll, invisibles).
    const _SS_FAKE_NAMES = ['EGGMASTER', 'FARMKING', 'CLUCKY99', 'YOLKRUN', 'HENFAST', 'PECKZILLA',
        'BUKBUK', 'COOPKING', 'EGGSPERT', 'HATCHLING', 'FEATHERZ', 'YARDBIRD',
        'ROOSTER99', 'NESTKING', 'BROODY'];
    const _SS_FAKE_MARKETS = ['googleplay', 'crazygames', 'itchio', 'newgrounds', 'googleplay', 'crazygames',
        'itchio', 'newgrounds', 'googleplay', 'crazygames', 'itchio', 'googleplay',
        'newgrounds', 'crazygames', 'googleplay'];

    function _ssFakeSpeedrunRanking() {
        const ranking = _SS_FAKE_NAMES.map((name, i) => ({
            pos: i + 1, market: _SS_FAKE_MARKETS[i], name, chickens: 46 - i * 2,
            time_secs: 400 + i * 22, is_me: false
        }));
        return { ok: true, ranking, selfRun: { pos: 16, market: 'googleplay', name: (window.currentLang === 'es' ? 'TU GRANJA' : 'YOUR FARM'), chickens: 14, time_secs: 812 } };
    }

    function _ssFakeEndlessRanking() {
        const top10 = _SS_FAKE_NAMES.map((name, i) => ({
            rank_pos: i + 1, market: _SS_FAKE_MARKETS[i], name, chickens: 320 - i * 15,
            earnings: 5.6e7 - i * 3.2e6, play_time_secs: 29000 + i * 900, is_me: false
        }));
        const player = { rank_pos: 16, market: 'googleplay', name: (window.currentLang === 'es' ? 'TU GRANJA' : 'YOUR FARM'), chickens: 210, earnings: 3.1e7, play_time_secs: 26200, is_me: true };
        return { ok: true, top10, player };
    }

    window.setScreenshotState = async function (stateName, deviceName) {
        _ssBackup = {
            chickensArr: chickensArr.slice(), roostersArr: roostersArr.slice(),
            chicksArr: chicksArr.slice(), eggsArr: eggsArr.slice(),
            money: state.money, chickens: state.chickens, totalEarnings: state.totalEarnings,
            playTime: state.playTime, eggsSold: state.eggsSold, activeChallenge: state.activeChallenge,
            hasRetired: state.hasRetired, isSpeedrunMode: state.isSpeedrunMode,
            megaChickens: state.megaChickens, chickensSuffered: state.chickensSuffered
        };
        const shop = document.getElementById('shop');

        if (stateName === '1_gameplay_collapsed' || stateName === '2_gameplay_expanded') {
            const expanded = stateName === '2_gameplay_expanded';
            _ssEnterGame();
            state.activeChallenge = 'vanilla';
            state.isSpeedrunMode = false;
            state.money = expanded ? 123456 : 1580;
            // playTime > 10 + eggsSold === 0 + un huevo sin recoger = activa la burbuja
            // "Drag me to the market to sell me!" (ver _updateTutorialBubbles). Solo
            // queremos ese tutorial en el estado inicial (collapsed), no en el expandido.
            state.playTime = expanded ? 0 : 15;
            state.eggsSold = expanded ? 30 : 0;
            if (expanded) {
                // Desbloquea ~19 mejoras a la vez (de las ~23 disponibles en modo vanilla;
                // megachicken/gallinapro/chickengold/chickengreen son solo-endless, y de la
                // cadena washer→stamper→packager→ribbon solo una puede estar visible a la
                // vez por diseño) para que la tienda se vea llena en vez de con un hueco
                // vacío debajo de 7 botones. Ver visibilidad exacta en updateUI() ~L10119.
                state.maxChickens = 300;
                state.roosterLevel = 2;      // < maxRooster(3): rooster visible; permite growth
                state.growthLevel = 0;
                state.pettingLevel = 0;
                state.dietLevel = 3;         // >=3 para batch, <4 para diet: ambos visibles
                state.batchLevel = 0;
                state.musicLevel = 0;
                state.maxFoodLevel = 2;      // >=2 para refill, <10 para maxFood: ambos visibles
                state.maxWaterLevel = 2;
                state.refillLevel = 0;
                state.maxFood = 500;         // >=400 para autoFood
                state.maxWater = 500;
                state.autoFoodLevel = 0;
                state.autoWaterLevel = 0;
                state.baseValueLevel = 5;    // >=5 para premium
                state.premiumLevel = 3;      // <10 para premium, >=3 para golden: ambos visibles
                state.goldenLevel = 0;
                state.magnetLevel = 0;
                state.autoCollectLevel = 1;  // >=1 para autoSell, <5 para autoCollect: ambos visibles
                state.autoSellLevel = 1;     // >=1 para washer
                state.hasWasher = false;
                state.hasStamper = false;
                state.hasPackager = false;
                state.hasRibbon = false;
                state.totalEarnings = 0;     // evita que aparezca el botón de retiro
            }
            _ssStageEntities(expanded ? 12 : 3, expanded ? 3 : 0, expanded ? 5 : 0, expanded ? 10 : 2);
            if (shop) shop.classList.toggle('is-expanded', expanded);
            // cg-first-time-hint es el resplandor verde de "primera visita" (CrazyGames),
            // no queremos ese hint de onboarding en una captura de marketing.
            document.getElementById('buy-chicken')?.classList.remove('cg-first-time-hint');
            if (!expanded && shop) shop.style.display = 'none'; // colapsada: fuera del todo, no solo cerrada
            updateUI();
            _captureModeHidden = true;
            document.body.classList.add('capture-mode-hide-menu');
        } else if (stateName === '3_main_menu') {
            _captureModeHidden = false;
            document.body.classList.remove('capture-mode-hide-menu');
            const jugarBtn = document.getElementById('mm-jugar-btn');
            await _ssWaitFor(() => jugarBtn && jugarBtn.style.pointerEvents === 'auto', 8000);
            await new Promise(r => setTimeout(r, 400));
            // La lista de modos (#mm-prado-crates-row) no se ve de fábrica: existe en el DOM
            // pero desplazada fuera de encuadre hasta que se pulsa JUGAR, que dispara un pan
            // de cámara de 600ms (_openModeScene() en index.html) para revelarla.
            if (jugarBtn) jugarBtn.click();
            await new Promise(r => setTimeout(r, 900));
            // La tarjeta de cada modo es muy ancha (min(75vw,300px)) y en columna única
            // ocupa media pantalla — la reagrupamos en grid 2 columnas y encogemos cada
            // tarjeta entera (imagen + texto + botones) con transform:scale para no romper
            // el posicionamiento interno absoluto. Solo para esta captura, en ambos
            // dispositivos (en móvil también se ve bien: muestra más contenido).
            const cratesRow = document.getElementById('mm-prado-crates-row');
            if (cratesRow) {
                cratesRow.classList.add('ss-2col-modes');
                if (deviceName === 'tablet') cratesRow.classList.add('ss-2col-tablet');
                if (!document.getElementById('ss-2col-modes-style')) {
                    const styleEl = document.createElement('style');
                    styleEl.id = 'ss-2col-modes-style';
                    styleEl.textContent = `
                        body.mode-portrait #mm-prado-crates-row.ss-2col-modes {
                            display: grid !important;
                            grid-template-columns: 1fr 1fr !important;
                            align-items: start !important;
                            justify-items: center !important;
                            gap: 10px 0px !important;
                            height: 80vh !important;
                        }
                        /* Override de altura SOLO para tablet — ajusta este valor sin tocar móvil */
                        body.mode-portrait #mm-prado-crates-row.ss-2col-modes.ss-2col-tablet {
                            height: 120vh !important;
                        }
                        body.mode-portrait #mm-prado-crates-row.ss-2col-modes .mm-prado-mode-btn {
                            width: 100% !important;
                            min-width: 0 !important;
                            padding: 0.4rem 0 !important;
                            border-bottom: none !important;
                            overflow: hidden !important;
                        }
                        body.mode-portrait #mm-prado-crates-row.ss-2col-modes .prado-crate-inner {
                            transform: scale(0.62);
                            transform-origin: top center;
                            /*margin-bottom: -120px;*/
                            filter: drop-shadow(rgba(0, 0, 0, 0.6) 0px 6px 8px);
                        }
                        body.mode-portrait #mm-prado-crates-row.ss-2col-modes .mm-prado-mode-btn::after {
                            display: none !important;
                        }


                    `;
                    document.head.appendChild(styleEl);
                }
            }
            await new Promise(r => setTimeout(r, 200));
        } else if (stateName === '4_ranking') {
            _ssEnterGame(); // si no, el ranking se abre sobre el menú principal, no la granja
            _captureModeHidden = true;
            document.body.classList.add('capture-mode-hide-menu');
            _ssOrigFetch = window.fetch.bind(window);
            window.fetch = async (url, ...rest) => {
                const u = String(url);
                if (u.includes('get_endless_ranking.php')) return new Response(JSON.stringify(_ssFakeEndlessRanking()), { status: 200 });
                if (u.includes('get_ranking_2.php') || u.includes('get_ranking.php')) return new Response(JSON.stringify(_ssFakeSpeedrunRanking()), { status: 200 });
                return _ssOrigFetch(url, ...rest);
            };
            const rankingBtn = document.getElementById('ranking-btn');
            if (rankingBtn) rankingBtn.click();
            const speedrunTab = document.getElementById('ranking-tab-v2');
            if (speedrunTab) speedrunTab.click();
            // #ranking-panel mide 80vh fijo (index.html) — más alto que el hueco de
            // gameplay de la plantilla (~68.5vh tras banner+vigas), lo que obligaba a
            // recortarlo o meterlo con letterbox. Se reduce solo para esta captura para
            // que quepa entero con object-fit:cover normal (ancho completo, sin franjas).
            const rankingPanel = document.getElementById('ranking-panel');
            if (rankingPanel) rankingPanel.style.height = '66vh';
            const rankingStatus = document.getElementById('ranking-status');
            if (rankingStatus) rankingStatus.style.display = 'none';
            await new Promise(r => setTimeout(r, 500));
        } else if (stateName === '5_retirement') {
            // No es el cartel de "CONGRATULATIONS!" (eso ya no es lo que la referencia
            // antigua mostraba para este estado) — es la granja de gameplay pero llevada
            // al máximo: decenas de gallinas, las 4 máquinas del carril visibles a la vez
            // (washer/stamper/packager/ribbon — eso SÍ puede darse simultáneamente, a
            // diferencia de sus botones de compra en la tienda, que son secuenciales),
            // comederos llenos y huevos premium/dorados en la cinta.
            _ssEnterGame();
            state.activeChallenge = 'vanilla';
            state.isSpeedrunMode = false;
            state.hasRetired = false;
            state.money = 9876543;
            state.maxFoodLevel = 10;
            state.maxWaterLevel = 10;
            state.maxFood = 2500;
            state.maxWater = 2500;
            state.food = 2500;
            state.water = 2500;
            state.hasWasher = true;
            state.hasStamper = true;
            state.hasPackager = true;
            state.hasRibbon = true;
            state.hasTvAd = true;
            state.autoCollectLevel = 5;
            state.autoSellLevel = 5;
            state.premiumLevel = 10;
            state.goldenLevel = 10;
            // autoFoodLevel/autoWaterLevel > 0 = grifo y tolva automáticos visibles
            // (_faucetSprite/_foodPipeSprite, script.js ~L5778); musicLevel > 0 = radio
            // (_boomboxPixi, ~L193). Sin esto ninguno de los tres se dibuja.
            state.autoFoodLevel = AUTO_TICK_TIERS.length - 1;
            state.autoWaterLevel = AUTO_TICK_TIERS.length - 1;
            state.musicLevel = 10;
            _ssStageEntities(90, 8, 10, 25);
            // Adelanta la simulación real (mismo mecanismo que el atajo de dev F8) para que
            // el propio juego mueva huevos hacia el sótano/máquinas de forma orgánica.
            for (let i = 0; i < 120; i++) update(0.1);
            // El auto-sell ya maxeado se los va comiendo casi tan rápido como salen, así que
            // la simulación sola no deja "cientos" visibles a la vez — se rellena a mano
            // encima, esparcidos por todo el prado (no solo cerca de la cinta).
            for (let i = 0; i < 300; i++) {
                const p = _safeSpawnPos();
                layEgg(p.x, p.y, Math.random() < 0.5 ? 1 : -1, false);
            }
            // La simulación acelerada puede dejar eggsSold en 0 si el auto-sell aún no
            // procesó ninguno — eso reactivaría la burbuja de tutorial "Drag me to the
            // market..." (ver _updateTutorialBubbles), que no pinta nada en este estado.
            state.eggsSold = 999;
            if (shop) shop.classList.remove('is-expanded');
            if (shop) shop.style.display = 'none';
            updateUI();
            _captureModeHidden = true;
            document.body.classList.add('capture-mode-hide-menu');
        }
    };

    window.cleanupScreenshotState = async function (stateName) {
        _captureModeHidden = false;
        document.body.classList.remove('capture-mode-hide-menu');
        if (stateName === '4_ranking') {
            if (_ssOrigFetch) { window.fetch = _ssOrigFetch; _ssOrigFetch = null; }
            _doCloseRanking();
        }
        // La automatización recarga la página entera (localStorage.clear() + reload)
        // antes de CADA estado, así que este restore es solo defensivo — no es lo
        // que garantiza el aislamiento entre capturas.
        if (_ssBackup) {
            chickensArr.length = 0; chickensArr.push(..._ssBackup.chickensArr);
            roostersArr.length = 0; roostersArr.push(..._ssBackup.roostersArr);
            chicksArr.length = 0; chicksArr.push(..._ssBackup.chicksArr);
            eggsArr.length = 0; eggsArr.push(..._ssBackup.eggsArr);
            state.money = _ssBackup.money; state.chickens = _ssBackup.chickens;
            state.totalEarnings = _ssBackup.totalEarnings; state.playTime = _ssBackup.playTime;
            state.eggsSold = _ssBackup.eggsSold; state.activeChallenge = _ssBackup.activeChallenge;
            state.hasRetired = _ssBackup.hasRetired; state.isSpeedrunMode = _ssBackup.isSpeedrunMode;
            state.megaChickens = _ssBackup.megaChickens; state.chickensSuffered = _ssBackup.chickensSuffered;
            _ssBackup = null;
        }
    };

    // ── Dev shortcuts (T = stress test via tools_dev/farm-stress-test.js) ────
    // D/T/F4/F6/F7/F8/X/Y/1-4 quedan inertes en el build público: sin
    // `window.DEBUG=true` (poner a mano en la consola) ninguna de esas teclas
    // hace nada. Antes X/Y podían borrar el save de un jugador real de un
    // pulsado y F4/F6/F7/F8 daban dinero/gallinas infinitas sin querer.
    // H (modo captura) queda fuera de esta guarda a propósito: no es
    // destructiva, solo oculta HUD/banners para grabar vídeo.
    window.addEventListener('keydown', (e) => {
        if (e.target.matches('input,textarea')) return;

        if (e.key.toLowerCase() === 'h') {
            _captureModeHidden = !_captureModeHidden;
            _ebSyncOfferUI();
            document.body.classList.toggle('capture-mode-hide-menu', _captureModeHidden);
            _showDevToast(_captureModeHidden ? 'Modo captura: OCULTO' : 'Modo captura: VISIBLE');
            console.log('[H] Modo captura ' + (_captureModeHidden ? 'oculto' : 'visible'));
            return;
        }

        if (!window.DEBUG) return;

        if (e.key.toLowerCase() === 'd') { _debugBoxCol = !_debugBoxCol; }
        if (e.key.toLowerCase() === 't') { window.FarmStressTest?.toggle(); }

        if (e.key === 'F4') {
            e.preventDefault();
            // Debug: give enough money to retire and trigger the cinematic immediately
            const _retireCost = state.costs.retire || 1000000000;
            if (state.money < _retireCost) state.money = _retireCost;
            state.totalEarnings = Math.max(state.totalEarnings || 0, 100000000);
            updateUI();
            // Marca este retiro como disparado por F4 — la fase 3 en cinematic.js lo
            // consume (lee y apaga) para forzar tiempo/pin de prueba SOLO en este
            // retiro, sin depender de tener window.DEBUG activo.
            window._f4DebugRetire = true;
            buy('retire');
            console.log('[F4] Retire triggered');
        }

        if (e.key === 'F6') {
            e.preventDefault();
            if (!_debugPanel) _createDebugPanel();
            _debugPanel.style.display = _debugPanel.style.display === 'none' ? 'block' : 'none';
        }

        if (e.key === 'F7') {
            e.preventDefault();
            _ebPickOffer();
            console.log('[F7] Boost offer forced');
        }

        if (e.key === 'F8') {
            e.preventDefault();
            // Simulate 10s of background (same logic as the bg interval)
            const STEP = 0.1, total = 10, steps = total / STEP;
            for (let _i = 0; _i < steps; _i++) update(STEP);
            console.log('[F8] Simulated 10s background');
        }
        if (e.key.toLowerCase() === 'x') {
            const _wipeNormalPrompt = (window.currentLang === 'tr') ? "UYARI! Kaydı silip SAKİN MOD oynamak istediğinden emin misin?" : "WARNING! Are you sure you want to WIPE your save and play NORMAL MODE?";
            if (confirm(_wipeNormalPrompt)) {
                localStorage.setItem('chickenIdleSpeedrun', 'false');
                document.getElementById('wipe-confirm').click();
            }
        }
        if (e.key.toLowerCase() === 'y') {
            const _wipeSpeedrunPrompt = (window.currentLang === 'tr') ? "UYARI! Kaydı silip HIZLI KOŞU MODU oynamak istediğinden emin misin?" : "WARNING! Are you sure you want to WIPE your save and play SPEEDRUN MODE?";
            if (confirm(_wipeSpeedrunPrompt)) {
                localStorage.setItem('chickenIdleSpeedrun', 'true');
                document.getElementById('wipe-confirm').click();
            }
        }

        // Debug: saltar a cinemática por número (solo con window.DEBUG activo)
        // 1 = Vanilla  2 = Speedrun  3 = Adam & Eve  4 = Egg Jam  5 = Endless
        const _cinMap = { '1': 'vanilla', '2': 'speedrun', '3': 'adam', '4': 'manual', '5': 'endless' };
        if (window.DEBUG && _cinMap[e.key]) {
            e.preventDefault();
            _debugJumpToCinematic(_cinMap[e.key]);
        }
    });

    // ── Portrait block overlay (mobile portrait → rotate device) ────────────
    (() => {
        let overlay = document.getElementById('portrait-block-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'portrait-block-overlay';
            Object.assign(overlay.style, {
                display: 'none',
                position: 'fixed',
                inset: '0',
                background: 'rgba(20,10,5,0.97)',
                zIndex: '999999',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '24px',
                fontFamily: "'Press Start 2P', monospace",
                color: '#f4d03f',
                textAlign: 'center',
                padding: '30px',
            });
            overlay.innerHTML = `
                <style>
                    @keyframes rotateHint {
                        0%,100% { transform: rotate(0deg); }
                        40%,60% { transform: rotate(90deg); }
                    }
                </style>
                <div style="font-size:52px;display:inline-block;animation:rotateHint 2s ease-in-out infinite">📱</div>
                <div style="font-size:12px;line-height:2;text-shadow:2px 2px 0 #d35400">ROTA EL DISPOSITIVO</div>
                <div style="font-size:7px;color:#ccc;line-height:2">Este juego funciona<br>en modo horizontal</div>
            `;
            document.body.appendChild(overlay);
        }

        function checkPortrait() {
            // En modo portrait (googleplay/móvil), la orientación ES siempre vertical.
            // No mostramos el overlay de "rota el dispositivo".
            if (window.GAME_MODE === 'portrait') {
                window.isOrientationPaused = false;
                overlay.style.display = 'none';
                return;
            }
            const isPortrait = window.innerWidth <= 950 && window.innerHeight >= window.innerWidth;
            if (isPortrait) {
                window.isOrientationPaused = true;
                overlay.style.display = 'flex';
                if (!window.isMusicMuted && !bgmTheme.paused) bgmTheme.pause();
            } else {
                window.isOrientationPaused = false;
                overlay.style.display = 'none';
                if (!window.isMusicMuted && state.musicLevel > 0 && !window.gamePaused && !window.isAdPaused)
                    bgmTheme.play().catch(() => { });
                lastTime = performance.now();
            }
        }

        window.addEventListener('resize', checkPortrait);
        window.addEventListener('orientationchange', checkPortrait);
        checkPortrait();
    })();

})();
