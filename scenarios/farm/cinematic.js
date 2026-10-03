/**
 * FarmCinematic — TODA la cinemática final vive aquí.
 *
 * Un único archivo se encarga de las 5 cinemáticas (vanilla, speedrun, adam,
 * manual, endless): configuración, spawn de entidades, animación por fases y
 * render. Antes esto estaba repartido entre script.js (~880 líneas), layout.js
 * (constantes, 14 de ellas muertas) y las dos hojas de estilo.
 *
 * ── Resolución ────────────────────────────────────────────────────────────
 * La cinemática se dibuja en #retireCineCanvas, un canvas CUADRADO de 400×400
 * escalado por CSS a min(100vw, 100vh). El contenido de juego (800×650) se
 * escala uniformemente y se centra dentro (ver _gs en drawCinematic).
 * => Es resolución-independiente por construcción: NO hay versiones por
 *    resolución ni ramas desktop/portrait. No las añadas.
 *
 * ── Reparto de responsabilidades ──────────────────────────────────────────
 *   CinematicCore (cinematic-core.js) — fundidos, fases 4 y 6, overlay de
 *       stats, bloqueo de botones. Infraestructura común.
 *   FarmEnding   (ending.js)          — datos puros: fuente de píxeles y
 *       matrices de texto (THANKS FOR PLAYING, insultos del cementerio).
 *   FarmCinematic (este archivo)      — spawn + animación + render.
 *
 * ── Fases ─────────────────────────────────────────────────────────────────
 *   0 espera → 1 entran andando → 2 forman la matriz → 3 aguanta
 *   5 = animación propia (adam / manual arrancan aquí)
 *   6 = fundido a negro  → 4 = cartel final + stats   (6 y 4 los lleva el Core)
 *
 * ── Acoplamiento con script.js ────────────────────────────────────────────
 * script.js llama a init(deps) pasando referencias vivas (getters/setters) a
 * sus arrays y helpers. Los arrays se REASIGNAN en los spawns, por eso van con
 * setter y no como copia.
 */
window.FarmCinematic = (function () {
    'use strict';

    // El render (draw(), más abajo) SIEMPRE encuadra el contenido asumiendo un
    // espacio de referencia fijo de 800×650 (Math.min(w/800, h/650)), sea cual
    // sea el modo real de juego. D.canvas es el <canvas id="gameCanvas"> real,
    // cuya .height varía por modo (650 desktop, 900 portrait) — usar
    // D.canvas.height directamente para posicionar (en vez de esta constante)
    // hacía que en portrait todo lo situado por debajo de y=650 quedara fuera
    // del encuadre del render y se cortara (visto con "THANKS FOR PLAYING").
    // D.canvas.width sí es fiable (siempre 800 en ambos modos), no hace falta
    // una constante equivalente para el ancho.
    const CINE_REF_H = 650;

    // ── Configuración ────────────────────────────────────────────────────
    // Única fuente de verdad de los ajustes de cinemática (antes en layout.js,
    // donde 14 de 22 constantes estaban MUERTAS — nunca se leían).
    // Se publican como window.CINEMATIC_* porque script.js también las lee.
    //
    // OJO: _spawnAdam PISA ADAM_RING_* en runtime (20/20). Es intencionado:
    // el valor de aquí solo cuenta antes de que arranque la cinemática de Adam.
    var CONFIG = {
        // ZONA DE EXCLUSIÓN: por encima de esta Y (coords de juego, 800×650) está
        // la valla y el cielo. NADA puede pisarlo nunca — ni la formación, ni las
        // gallinas entrando. Súbelo si ves bichos en el cielo; bájalo para ganar
        // sitio (la formación crece sola hasta llenarlo, ver _spawnVanilla).
        // La valla acaba en y≈110, así que 120 deja un margen de 10px justo debajo.
        SKY_FLOOR_Y:         120,
        // TOPE del espaciado entre gallinas. El spawn calcula solo el mayor que
        // quepa en la caja útil (ver _spawnVanilla); esto es solo un techo, no un
        // valor fijo. Súbelo si quieres permitir formaciones aún más separadas.
        FORMATION_SPACING:    40,
        // OJO: drawCinematic() ya multiplica cada entidad por 2.0, así que 0.5 aquí = tamaño
        // EXACTO del juego (0.5 × 2 = 1.0). Cualquier valor por encima de 0.5 los agranda.
        // Lo aplican los tres renderers vía _cineAnimalScale() (script.js).
        ANIMAL_SCALE_VANILLA:  0.5, // escala de animales — vanilla y speedrun (= tamaño juego)
        ANIMAL_SCALE_ADAM:     0.5, // escala — Adam & Eve (= tamaño juego, igual que vanilla)
        // Antes 0.7 (1.4× el juego): se ajustó así para las gallinas VOLANDO del viejo
        // concepto de Egg Jam (cruzaban toda la pantalla, hacía falta que se vieran
        // grandes). Ese concepto ya no existe (ahora es el duelo de gallos) — a
        // tamaño de juego (0.5, igual que vanilla/adam) es lo correcto para gallos y
        // público quietos y cercanos. "las gallinas... se ve muy grandes... el
        // vanilla si se ve bien" — mismo tamaño que vanilla ahora.
        ANIMAL_SCALE_MANUAL:   0.5,
        EGG_SCALE:             1.0, // escala de huevos en cualquier cinemática

        // ── Adam & Eve ───────────────────────────────────────────────────
        // Coreografía: los gallos salen primero y corriendo; ADAM_CHICK_DELAY
        // segundos después arrancan los pollitos. El padre frena en el centro,
        // se gira, y los pollitos lo alcanzan y lo rodean en anillos.
        ADAM_CHICK_DELAY:      2.0, // s que tardan los pollitos en arrancar tras los gallos
        ADAM_DAD_SPEED:      280,   // px/s del gallo padre (antes 180)
        ADAM_ROOSTER_SPEED:  220,   // px/s base de los otros gallos (antes 120)
        // Los pollitos se reparten por anillos con cupo PROPORCIONAL AL RADIO (ver la fase 5).
        // Ojo con la geometría: el sprite del pollito mide ~48px de mundo, así que para que
        // NO se solapen hacen falta 48px de separación → con estos radios caben ~125.
        // Con 200 se solapan sí o sí (harían falta anillos de r=536, fuera del canvas).
        ADAM_CHICKS:         200,   // pollitos que salen corriendo
        ADAM_RINGS:            6,   // nº de anillos concéntricos (antes 4, fijos en el código)
        ADAM_RING_R1:         60,   // radio del anillo interno de pollitos
        ADAM_RING_SPACING:    55,   // separación entre anillos (el externo llega a r=335)
        // Velocidad de giro de los anillos, en px/s LINEALES (no rad/s). El código hace
        // ω = ADAM_RING_SPIN / r, así que todos giran a la misma velocidad real.
        // DEBE quedar bien por debajo de la velocidad del pollito (180-220 px/s): si no, su
        // hueco huye más rápido de lo que corren y no llegan nunca a colocarse.
        ADAM_RING_SPIN:       70,
        ADAM_RING_HOLD:        1.8, // s que se mantienen los anillos formados antes del pile
        ADAM_PILE_TIMEOUT:     9.0, // s de seguridad para no colgarse si no llegan suficientes

        // Fracción de pollitos YA COLOCADOS que dispara el pile.
        // Estaba en 0.6 y era demasiado pronto: con el reparto proporcional, los 4 anillos
        // interiores solo suman 96 de 200, así que el 60% (=120) se alcanzaba cuando los
        // anillos 5 y 6 AÚN ESTABAN LLEGANDO. Resultado: unos pollitos se abalanzaban sobre
        // el padre mientras otros seguían volando hacia sus anillos → parecían dos
        // animaciones a la vez y los círculos "se reducían" de golpe.
        // Con 0.95 se espera a que la formación esté hecha; ADAM_PILE_TIMEOUT sigue de red.
        ADAM_PILE_AT:         0.95,

        // ── Egg Jam / Manual: duelo de gallos ──────────────────────────────
        // Un gallo entra corriendo por cada lado; al chocar en el centro se
        // "esconden" dentro de una nube de pelea (rooster_fight.png, sprite ya
        // existente sin usar) durante DUEL_FIGHT_TIME segundos. Al acabar,
        // reaparecen tumbados y DORMIDOS a los lados de la nube — reutiliza el
        // estado 'sleeping' que renderRooster YA sabe dibujar (fila 6/7 del
        // sprite normal de gallo), así que no hace falta animación nueva para
        // eso. Un público de gallinas quietas mirando de fondo, abajo, remata
        // la escena. Fundido a negro tras DUEL_SLEEP_HOLD segundos.
        DUEL_AUDIENCE:          50, // gallinas por banda de público (arriba + abajo = ×2)
        DUEL_ROOSTER_SPEED:   150,  // px/s de los 2 gallos corriendo al centro (antes 260, "más lentos")
        DUEL_FIGHT_TIME:      2.0,  // s que dura la nube de pelea (pedido: "a los 2s")
        // 50ms/frame × 40 pasos = 2 vueltas completas a los 20 frames dentro de
        // DUEL_FIGHT_TIME (pedido: "dos ciclos... 40 frames"). La tira pasa de
        // tranquila a caótica dos veces seguidas en vez de una.
        DUEL_FIGHT_FRAME_MS:   50,
        DUEL_CLOUD_SCALE:      2.6, // escala de la nube (sprite nativo 80×44) — pedido x2 de la 1.3 anterior
        DUEL_SLEEP_HOLD:       2.5, // s tumbados y dormidos antes del fundido a negro
    };
    for (var k in CONFIG) window['CINEMATIC_' + k] = CONFIG[k];

    // Sprite de la nube de pelea del duelo (Egg Jam/Manual). Tira de 20 frames de
    // 80×44px cada uno, en una sola fila (1600×44 total). Propio de este archivo
    // porque ningún otro sitio del juego dibuja peleas.
    var _fightSheet = new Image();
    _fightSheet.src = 'pixelart_design/rooster_fight.png';
    var FIGHT_FRAME_W = 80, FIGHT_FRAME_H = 44, FIGHT_FRAMES = 20;

    // ── window.CINEMATIC_CHICKEN_* — NO son config: son knobs de RUNTIME ──
    // Acotan por dónde deambulan las gallinas mientras corre el retiro.
    // Arrancan UNDEFINED a propósito, y cada punto de lectura aplica su propio
    // fallback (la IA usa `?? 40`, el spawn de la formación usa `|| 160`).
    // script.js los sube a 220 al entrar en cinemática y los vuelve a poner a
    // undefined al resetear. NO los declares aquí con un valor: le cambiarías
    // el fallback a la IA de las gallinas y romperías el deambular normal.
    //   CINEMATIC_CHICKEN_X1 · CINEMATIC_CHICKEN_X2_MARGIN
    //   CINEMATIC_CHICKEN_Y1 · CINEMATIC_CHICKEN_Y2_OFFSET

    // ── Zoom de la escena completa ───────────────────────────────────────
    // El fondo (#retire-cine-bg, un <img>) y el canvas (#retireCineCanvas) están
    // SUPERPUESTOS, centrados y del mismo tamaño (min(100vw,100vh)). Aplicándoles el MISMO
    // transform escalan juntos y no se desalinean: por eso el zoom arrastra fondo, gallina
    // y huevos a la vez. #retire-cine-root tiene overflow:hidden, así que al ampliar
    // simplemente se ve menos escena (que es lo que queremos).
    //
    // OJO: hay que devolverlo a 1 en las cinemáticas que NO usan zoom, o se quedaría
    // pegado de una partida anterior.
    // Normaliza la escala de fondo + canvas. Se llama con 1 en todos los spawns para que
    // ninguna cinemática herede una escala pegada de una sesión anterior.
    function _setCineZoom(z) {
        const t = 'translate(-50%,-50%) scale(' + z.toFixed(4) + ')';
        const bg = document.getElementById('retire-cine-bg');
        const cv = document.getElementById('retireCineCanvas');
        if (bg) bg.style.transform = t;
        if (cv) cv.style.transform = t;
    }

    // ── Anillos de pollitos (Adam & Eve) ─────────────────────────────────
    // ÚNICA fuente del reparto en anillos. La usan LOS DOS actos: 'stop' (la formación)
    // y 'pile' (el ritual sobre el padre).
    //
    // Antes el 'pile' tenía su PROPIA copia del código, con la distribución vieja
    // (4 anillos, cupos fijos 25/25/75/75) y velocidades ANGULARES fijas (2.2, 1.8, 1.5,
    // 1.0 rad/s). Al dispararse el pile, los pollitos se reasignaban a esa otra formación:
    // menos anillos y girando mucho más rápido. Parecía que arrancaba una segunda
    // cinemática encima. Con una sola fuente, el paso a 'pile' ya no cambia la formación.

    // Cupo de cada anillo, PROPORCIONAL AL RADIO: a doble radio, doble circunferencia y
    // por tanto doble sitio. Así la separación entre pollitos es pareja en todos.
    function _adamRings(total) {
        const R1 = window.CINEMATIC_ADAM_RING_R1 ?? 40;
        const RS = window.CINEMATIC_ADAM_RING_SPACING ?? 40;
        const NR = Math.max(1, CONFIG.ADAM_RINGS);
        const radii = [], counts = [], starts = [];
        let wsum = 0;
        for (let i = 0; i < NR; i++) { radii.push(R1 + RS * i); wsum += radii[i]; }
        let acc = 0;
        for (let i = 0; i < NR; i++) {
            // El último se queda con el resto, para no perder pollitos por el redondeo.
            const n = (i === NR - 1) ? (total - acc) : Math.round(total * radii[i] / wsum);
            counts.push(n); starts.push(acc); acc += n;
        }
        return { NR, radii, counts, starts };
    }

    // Posición que le toca al pollito `idx` en el instante `t`.
    function _adamSlot(rings, idx, dad, t) {
        let ring = 0;
        while (ring < rings.NR - 1 && idx >= rings.starts[ring] + rings.counts[ring]) ring++;
        const iIn = idx - rings.starts[ring];
        const n   = Math.max(1, rings.counts[ring]);
        const r   = rings.radii[ring];
        // Giro por velocidad LINEAL (ω = v / r): todos los anillos giran a los mismos px/s
        // reales. Si fuese angular fija, al agrandar el radio la velocidad tangencial
        // superaría la del pollito (180-220 px/s) y su hueco huiría más rápido de lo que
        // corre: no llegaría NUNCA a colocarse. Anillos alternos giran en sentido opuesto.
        const spin = (ring % 2 === 0 ? 1 : -1) * (CONFIG.ADAM_RING_SPIN / r);
        const a = (iIn / n) * Math.PI * 2 + t * spin;
        return {
            ring: ring,
            tx: dad.x + Math.cos(a) * r,
            ty: dad.y - 5 + Math.sin(a) * (r * 0.6),
        };
    }

    // ── Dependencias vivas inyectadas por script.js ──────────────────────
    var D = null;

    function init(deps) {
        D = deps;
        window.CinematicCore.register('vanilla',  { startPhase: 0, spawn: _spawnVanilla, update: _wrapCinematicAnim });
        window.CinematicCore.register('speedrun', { startPhase: 0, spawn: _spawnVanilla, update: _wrapCinematicAnim });
        window.CinematicCore.register('adam',     { startPhase: 5, spawn: _spawnAdam,    update: _wrapCinematicAnim });
        window.CinematicCore.register('manual',   { startPhase: 5, spawn: _spawnManual,  update: _wrapCinematicAnim });
        window.CinematicCore.register('endless',  { startPhase: 0, spawn: _spawnVanilla, update: _wrapCinematicAnim });
    }

    function updateCinematic(dt) {
        const state = D.state, canvas = D.canvas, myPin = D.myPin, RANKING_API_URL = D.RANKING_API_URL;
        const chickensArr = D.chickensArr, chicksArr = D.chicksArr,
              roostersArr = D.roostersArr, particlesArr = D.particlesArr;
        // Phase 0: Hold black (1s)
        if (D.cinematicPhase === 0) {
            if (D.cinematicTimer > 1) { D.cinematicPhase = 1; D.cinematicTimer = 0; }
        }
        // Phase 1: Background reveal (1s cine-fade out), chickens stationary; then walk in
        else if (D.cinematicPhase === 1) {
            if (D.cinematicTimer < 1.0) return; // wait for background to fully reveal
            let crossedCenter = 0;
            // ZONA DE EXCLUSIÓN: por encima de SKY_FLOOR_Y está la valla y el cielo.
            // Nada puede pisarlo NUNCA. Aquí las gallinas avanzan con velY aleatoria,
            // que sin tope las hacía subir hasta el cielo mientras entraban.
            const skyY = window.CINEMATIC_SKY_FLOOR_Y ?? 120;
            const floorY = CINE_REF_H - 20;
            chickensArr.forEach(c => {
                c.direction = 1;
                c.x += c.velX * dt; c.y += c.velY * dt;
                if (c.y < skyY)   { c.y = skyY;   c.velY = Math.abs(c.velY); }  // rebota hacia abajo
                if (c.y > floorY) { c.y = floorY; c.velY = -Math.abs(c.velY); }
                if (c.x > canvas.width / 2) {
                    crossedCenter++;
                }
            });
            if (crossedCenter >= chickensArr.length / 2) {
                D.cinematicPhase = 2; D.cinematicTimer = 0;
            }
        }
        // Phase 2: Formation
        else if (D.cinematicPhase === 2) {
            let allInPosition = true;
            chickensArr.forEach(c => {
                let dx = c.targetX - c.x; let dy = c.targetY - c.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 1) {
                    allInPosition = false;
                    let speed = Math.sqrt(c.velX * c.velX + c.velY * c.velY) || 60; // Keep their original wandering speed for matching visual flow
                    c.x += (dx / dist) * speed * dt; c.y += (dy / dist) * speed * dt;
                    c.direction = dx >= 0 ? 1 : -1;
                } else {
                    c.x = c.targetX; c.y = c.targetY;
                    c.direction = -1; // Face forward/left at the end
                    c.velX = 0; c.velY = 0;
                }
            });
            if (allInPosition || D.cinematicTimer > 15) { D.cinematicPhase = 3; D.cinematicTimer = 0; }
        }
        // Phase 3: Hold formation briefly (2s) then dissolve to stats
        else if (D.cinematicPhase === 3) {
            if (D.cinematicTimer > 2) {
                D.cinematicPhase = 6; D.cinematicTimer = 0;
                let rl = document.getElementById('rate-link');
                if (rl && window.PLATFORM.showRateLink) rl.style.display = 'block';

                // ── DEBUG: solo cuando el retiro lo disparó F4 (script.js pone
                // window._f4DebugRetire = true justo antes de buy('retire')) — así no
                // hace falta tener window.DEBUG activo, basta con pulsar F4. Se apaga
                // aquí mismo nada más leerlo: es de un solo uso, no afecta a un retiro
                // NORMAL posterior en la misma sesión.
                //   - Tiempo forzado a 50min: cola de cualquier ranking real, así una prueba
                //     nunca desplaza una puntuación real de verdad de nadie.
                //   - Pin nuevo cada vez: el backend lo trata como jugador distinto, así el
                //     envío no choca con un pin ya usado.
                //   - Se limpian los flags de "ya enviado"/"nombre guardado" para que NUNCA
                //     tome la rama de auto-envío silencioso de abajo y SIEMPRE salga el
                //     panel de poner nombre.
                if (window._f4DebugRetire && state.isSpeedrunMode) {
                    window._f4DebugRetire = false;
                    state.playTime = 3000;
                    D.myPin = 'debug_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
                    localStorage.removeItem('chickenIdleSpeedrunSubmitted');
                    localStorage.removeItem('chickenIdleLastName');
                    // F4 fuerza state.money/totalEarnings directamente (ver el handler de F4 en
                    // script.js) para poder pagar el retiro al instante — eso descuadra
                    // money + totalMoneySpent vs totalMoneyEarned y el botón de enviar del
                    // panel de nombre lo lee como "CHEATER DETECTED!" (es el mismo chequeo
                    // anti-trampas de siempre, no tiene nada que ver con el tiempo). Esta
                    // bandera, que SÍ sobrevive hasta que se pulsa enviar (a diferencia de
                    // _f4DebugRetire, que se consume aquí mismo), hace que ese botón se salte
                    // el chequeo solo para envíos de prueba disparados por F4.
                    window._f4DebugSubmission = true;
                }

                if (state.isSpeedrunMode && !localStorage.getItem('chickenIdleSpeedrunSubmitted')) {
                    let savedName = localStorage.getItem('chickenIdleLastName');

                    if (savedName && typeof myPin !== 'undefined' && myPin) {
                        let timeSecs = Math.floor(state.playTime || 0);
                        let chickens = state.maxChickens || state.chickens || 0;

                        fetch(RANKING_API_URL + '/submit_score_2.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: savedName, market: window.PLATFORM.market, time_secs: timeSecs, chickens: chickens, pin: myPin })
                        })
                            .then(r => r.json())
                            .then(data => {
                                localStorage.setItem('chickenIdleSpeedrunSubmitted', 'true');
                                window._endRankFetched = false;
                            });
                    } else {
                        let nameOverlay = document.getElementById('name-input-overlay');
                        let timeEl = document.getElementById('final-speedrun-time');
                        let chickensEl2 = document.getElementById('final-speedrun-chickens');
                        let marketEl = document.getElementById('final-speedrun-market');
                        if (nameOverlay && timeEl) {
                            let hrs = Math.floor((state.playTime || 0) / 3600);
                            let mins = Math.floor(((state.playTime || 0) % 3600) / 60);
                            let secs = Math.floor((state.playTime || 0) % 60);
                            timeEl.innerText = `${window.t ? window.t("time") : "TIME:"} ${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;

                            if (chickensEl2) chickensEl2.innerText = `${window.t ? window.t("chickensFreed") : "Chickens Freed:"} ${state.maxChickens || state.chickens || 0}`;

                            let mktSelect = document.getElementById('speedrun-market-select');
                            if (mktSelect) {
                                const opts = window.PLATFORM.communityOptions;
                                const defaultOptionHtml = opts.length > 1
                                    ? `<option value="" disabled selected>${window.t ? window.t("selectCommunity") : "-- SELECT COMMUNITY --"}</option>`
                                    : '';
                                mktSelect.innerHTML = defaultOptionHtml + opts.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
                            }

                            // Pre-fill name input: last used name, or CrazyGames username
                            const _nameInput = document.getElementById('speedrun-name-input');
                            if (_nameInput) {
                                const _lastName = localStorage.getItem('chickenIdleLastName') || '';
                                _nameInput.value = _lastName;
                                if (!_lastName) {
                                    (async () => {
                                        try {
                                            const _tok = await window.CrazyGames?.SDK?.user?.getUserToken();
                                            if (_tok) {
                                                const _p = JSON.parse(atob(_tok.split('.')[1]));
                                                const _cgName = (_p.username ?? _p.name ?? '').toUpperCase().substring(0, 15);
                                                if (_cgName) _nameInput.value = _cgName;
                                            }
                                        } catch (e) { }
                                    })();
                                }
                            }

                            nameOverlay.style.display = 'flex';
                        }
                    }
                }
            }
        }
        // Phase 5: Custom Comedy Animations (Adam & Eve)
        else if (D.cinematicPhase === 5) {
            if (state.activeChallenge === 'adam') {
                // --- INTERNAL STATE ---
                // adamAct: 'run' -> dad running, chickies trailing
                //          'stop' -> dad stopped, turned, chickies rushing
                //          'pile' -> dad knocked, chickies piling on, fade begins
                if (!window._adamAct) window._adamAct = 'run';
                if (!window._adamActTimer) window._adamActTimer = 0;
                window._adamActTimer += dt;
                // Reloj GLOBAL de la fase: _adamActTimer se resetea en cada cambio de acto,
                // así que no sirve para el retardo de los pollitos. Con los gallos ya rápidos
                // el padre llega al centro ANTES de los 2s → el acto cambia a 'stop' y los
                // pollitos habrían salido disparados igual. Este reloj no se resetea nunca.
                window._adamPhaseTimer = (window._adamPhaseTimer || 0) + dt;

                let dad = roostersArr.find(r => r.isDad);
                let chicksOnDad = 0;
                let halfW = canvas.width / 2;

                // Los gallos salen primero; los pollitos esperan ADAM_CHICK_DELAY segundos.
                const chicksGo = window._adamPhaseTimer >= CONFIG.ADAM_CHICK_DELAY;

                // ============ ACT 1: RUNNING ============
                if (window._adamAct === 'run') {
                    roostersArr.forEach(r => {
                        r.x += r.velX * dt;
                        r.direction = 1;
                    });

                    // Los pollitos no arrancan hasta que pasa el retardo.
                    if (chicksGo) {
                        chicksArr.forEach(c => {
                            c.x += (c.runSpeed || 160) * dt;
                            c.direction = 1;
                        });
                    }

                    // Dad reaches center → switch to STOP act
                    if (dad && dad.x >= halfW) {
                        window._adamAct = 'stop';
                        window._adamActTimer = 0;
                        dad.velX = 0;
                        dad.direction = -1; // turns to look back
                    }

                    // ============ ACT 2: DAD STOPS, CHICKS RUSH IN ============
                } else if (window._adamAct === 'stop') {
                    // Other roosters keep running off screen
                    roostersArr.forEach(r => {
                        if (!r.isDad) {
                            r.x += r.velX * dt;
                            r.direction = 1;
                        }
                    });

                    // Chicks now target the dad directly, rushing towards him.
                    // chicksGo también aquí: con los gallos rápidos el padre llega al centro
                    // antes de que expire el retardo, y sin este guard los pollitos saldrían
                    // igualmente disparados desde el frame 1.
                    // Reparto en anillos — MISMA fuente que el acto 'pile' (ver _adamRings /
                    // _adamSlot arriba). Antes cada acto tenía su propia copia y no coincidían.
                    const _rings = _adamRings(chicksArr.length);

                    let _arrived = 0;
                    if (chicksGo) chicksArr.forEach((c, idx) => {
                        const s = _adamSlot(_rings, idx, dad, D.cinematicTimer);
                        // Solo saltan los de los dos anillos interiores (los que se ven de cerca).
                        if (s.ring < 2) {
                            const jumpSine = Math.sin(D.cinematicTimer * 4 + idx * 2.3);
                            c.jumpTimer = Math.max(0, jumpSine * 4 - 3) * 0.5;
                        }
                        const dx = s.tx - c.x;
                        const dy = s.ty - c.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist > 8) {
                            const spd = 180 + (idx % 5) * 10;
                            c.x += (dx / dist) * spd * dt;
                            c.y += (dy / dist) * spd * dt;
                        } else {
                            _arrived++;
                        }
                        c.direction = dx >= 0 ? 1 : -1;
                    });
                    // Se mide en PORCENTAJE del total (los cupos por anillo ya no son fijos).
                    chicksOnDad = _arrived;
                    // Antes esto contaba solo los 50 primeros y exigía >25. Con el reparto
                    // proporcional los cupos cambian, así que se mide en PORCENTAJE del total.
                    chicksOnDad = _arrived;

                    // Anillos formados → se MANTIENEN ADAM_RING_HOLD segundos para que dé
                    // tiempo a verlos, y luego pile. El timeout es solo red de seguridad:
                    // subido de 5s a 9s porque con el retardo de los pollitos los más
                    // lejanos (spawn en x=-600) tardan ~5.3s en llegar y el pile se
                    // disparaba ANTES de que los anillos llegaran a formarse.
                    const _pileNeeded = Math.max(1, Math.round(chicksArr.length * CONFIG.ADAM_PILE_AT));
                    if (chicksOnDad >= _pileNeeded) window._adamRingTimer = (window._adamRingTimer || 0) + dt;
                    const _ringsHeld = (window._adamRingTimer || 0) >= CONFIG.ADAM_RING_HOLD;
                    if ((_ringsHeld || window._adamActTimer > CONFIG.ADAM_PILE_TIMEOUT) && window._adamAct !== 'pile') {
                        window._adamAct = 'pile';
                        window._adamActTimer = 0;
                        particlesArr.push({ x: dad.x, y: dad.y - 40, text: "?!", color: '#ff4444', life: 2.5, maxLife: 2.5, velY: -15 });
                        window._dadKnockedDownTimer = 0;
                    }

                    // ============ ACT 3: PILE-ON & RITUAL ============
                } else if (window._adamAct === 'pile') {
                    window._dadKnockedDownTimer = (window._dadKnockedDownTimer || 0) + dt;

                    // ¡OJO! Aquí había una COPIA del código de anillos con la distribución
                    // VIEJA: 4 anillos con cupos fijos (25/25/75/75) y velocidades ANGULARES
                    // fijas (2.2, 1.8, 1.5, 1.0 rad/s). Como el acto 'stop' ya usaba 6 anillos
                    // proporcionales y giro lineal, al saltar el pile los pollitos se
                    // reasignaban DE GOLPE a esa otra formación: menos círculos y girando
                    // mucho más rápido. Parecía que arrancaba una segunda cinemática encima.
                    //
                    // Ahora ambos actos usan _adamRings/_adamSlot, así que el paso a 'pile'
                    // NO cambia la formación: los pollitos siguen exactamente donde estaban y
                    // solo cambia lo que le pasa al padre (se lo llevan por delante).
                    const _pRings = _adamRings(chicksArr.length);
                    chicksArr.forEach((c, idx) => {
                        const s = _adamSlot(_pRings, idx, dad, D.cinematicTimer);
                        if (s.ring < 2) {
                            const jumpSine = Math.sin(D.cinematicTimer * 4 + idx * 2.3);
                            c.jumpTimer = Math.max(0, jumpSine * 4 - 3) * 0.5;
                        }

                        const dx = s.tx - c.x;
                        const dy = s.ty - c.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist > 5) {
                            const spd = 180 + (idx % 5) * 10;
                            c.x += (dx / dist) * spd * dt;
                            c.y += (dy / dist) * spd * dt;
                        } else {
                            c.x = s.tx;
                            c.y = s.ty;
                        }

                        c.direction = dx >= 0 ? 1 : -1;
                    });

                    // Extended ritual time to 8 seconds so it can be fully appreciated
                    if (window._dadKnockedDownTimer > 8.0) {
                        D.cinematicPhase = 6;
                        D.cinematicTimer = 0;
                    }
                }

            } else if (state.activeChallenge === 'manual') {
                // ═══ DUELO DE GALLOS ═══════════════════════════════════════════════
                //   run   — los 2 gallos corren el uno hacia el otro por el centro.
                //   fight — al chocar se OCULTAN (drawMeadow no dibuja los que tienen
                //           r.hidden) y encima se dibuja la nube de pelea — ver
                //           _drawFightCloud, llamada desde drawMeadow.
                //   sleep — reaparecen tumbados y DORMIDOS a cada lado de la nube,
                //           reutilizando el estado 'sleeping' normal del gallo.
                if (!window._duelAct) window._duelAct = 'run';
                window._duelTimer = (window._duelTimer || 0) + dt;

                const r1 = roostersArr[0], r2 = roostersArr[1];

                if (window._duelAct === 'run') {
                    roostersArr.forEach(r => { r.x += r.velX * dt; });
                    if (r1 && r2 && Math.abs(r1.x - r2.x) <= 26) {
                        window._duelAct = 'fight';
                        window._duelTimer = 0;
                        window._duelCloudX = (r1.x + r2.x) / 2;
                        window._duelCloudY = (r1.y + r2.y) / 2;
                        r1.velX = 0; r2.velX = 0;
                        r1.hidden = true; r2.hidden = true;
                        if (D.playSound && D.sfxRoosterFight) D.playSound(D.sfxRoosterFight, 0.5, 500);
                    }
                } else if (window._duelAct === 'fight') {
                    if (window._duelTimer > CONFIG.DUEL_FIGHT_TIME) {
                        window._duelAct = 'sleep';
                        window._duelTimer = 0;
                        // Tumbados a cada lado de donde estaba la nube, dormidos del todo.
                        if (r1) { r1.hidden = false; r1.action = 'sleeping'; r1.velX = 0; r1.x = window._duelCloudX - 22; r1.y = window._duelCloudY; r1.direction = -1; }
                        if (r2) { r2.hidden = false; r2.action = 'sleeping'; r2.velX = 0; r2.x = window._duelCloudX + 22; r2.y = window._duelCloudY; r2.direction = 1; }
                    }
                } else if (window._duelAct === 'sleep') {
                    if (window._duelTimer > CONFIG.DUEL_SLEEP_HOLD) {
                        D.cinematicPhase = 6;
                        D.cinematicTimer = 0;
                    }
                }
            }

            particlesArr.forEach(p => {
                p.life -= dt;
                p.y += (p.velY || -20) * dt;
            });
            D.particlesArr = particlesArr.filter(p => p.life > 0);

            // No global cutoff — each challenge manages its own end
        }
    }

    // ── Cinematic wrapper: syncs local vars, runs animation, propagates phase changes ──
    function _wrapCinematicAnim(dt, timer, phase, goPhase) {
        const _prev = phase;
        D.cinematicPhase = phase;
        D.cinematicTimer = timer;
        updateCinematic(dt);
        if (D.cinematicPhase !== _prev) goPhase(D.cinematicPhase);
    }

    // ── Vanilla / Speedrun spawn: chickens walk in from left then form matrix pattern ──
    function _spawnVanilla() {
        const state = D.state, canvas = D.canvas;
        _setCineZoom(1);   // por si una sesión anterior dejó el zoom pegado
        const THE_END_MATRIX = window.FarmEnding.THE_END_MATRIX;
        const buildTextMatrix = (...a) => window.FarmEnding.buildTextMatrix(...a);
        let chickensArr = D.chickensArr;
        const CHICKEN_COLORS = ['#ffffff', '#dcc5a4', '#8b5a2b', '#444444'];
        let activeM = THE_END_MATRIX;
        if (state.isSpeedrunMode) {
            let mins = Math.floor((state.playTime || 0) / 60);
            let secs = Math.floor((state.playTime || 0) % 60);
            if (mins > 99) { mins = 99; secs = 59; }
            activeM = buildTextMatrix([String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0')]);
        }

        D.chickensArr = []; chickensArr = D.chickensArr;

        let minC = 9999, maxC = -1;
        activeM.forEach(function (r) {
            for (let c = 0; c < r.length; c++) {
                if (r[c] === 'X') { if (c < minC) minC = c; if (c > maxC) maxC = c; }
            }
        });
        const trueCols = maxC - minC;
        const rows     = activeM.length - 1;   // separación entre la 1ª y la última fila
        // "la cinemática del speedrun se sale, hay que reducir la matriz y las
        // gallinas para que encaje — mira el tamaño de la de gracias por jugar de
        // ejemplo": el speedrun usaba un grid FIJO en 48 y c.scale FIJO en 2.5, así
        // que con un tiempo largo (más dígitos → más columnas) la formación se salía
        // del canvas sin más — nada la topaba. Ahora usa EXACTAMENTE el mismo cálculo
        // adaptativo que vanilla/"gracias por jugar" (el mayor grid que cabe en la
        // caja útil, nunca desborda por construcción) y una escala de gallina más
        // moderada (1.6, antes 2.5).
        const chickenW = state.isSpeedrunMode ? 60 : 20;

        // Caja útil: nada puede pisar el cielo/valla (SKY_FLOOR_Y) ni salirse.
        const skyY = window.CINEMATIC_SKY_FLOOR_Y ?? 120;
        const padX = 20, padB = 20;
        const boxW = canvas.width  - 2 * padX - chickenW;
        const boxH = CINE_REF_H - padB - skyY - chickenW;

        // Espaciado AUTOMÁTICO: el mayor que cabe en ambos ejes. Así el texto (o los
        // dígitos del speedrun) sale lo más grande posible sin desbordar nunca. El
        // tope solo pone un TECHO — para speedrun es más alto (dígitos chunky, son
        // pocos caracteres) pero sigue acotado por la caja real, así que un tiempo
        // largo (más columnas) simplemente encoge el grid en vez de salirse.
        // (Antes era fijo: al pasar el texto a 3 líneas la formación medía 452px
        //  desde y=220 → llegaba a 672 y el canvas mide 650: se cortaba "PLAYING".)
        const gridS = Math.max(8, Math.min(
            Math.floor(boxW / Math.max(1, trueCols)),
            Math.floor(boxH / Math.max(1, rows)),
            state.isSpeedrunMode ? 60 : (window.CINEMATIC_FORMATION_SPACING || 24)
        ));

        const totalVisW = (trueCols * gridS) + chickenW;
        const visualStartX = Math.round((canvas.width - totalVisW) / 2);
        // Pequeño ajuste fino a la derecha — pedido explícito tras verlo un poco
        // descentrado hacia la izquierda. Sube/baja este valor para reajustar.
        const H_NUDGE = 20;
        const sX = visualStartX - (minC * gridS) + H_NUDGE;
        // Centrada verticalmente dentro de la caja útil — mismo cálculo para las dos,
        // ya no hay una Y fija especial para speedrun (esa Y fija asumía el grid
        // fijo de antes; con grid adaptativo dejaba de centrar bien).
        const sY = Math.round(skyY + (CINE_REF_H - padB - skyY - rows * gridS) / 2);

        for (let row = 0; row < activeM.length; row++) {
            for (let col = 0; col < activeM[row].length; col++) {
                if (activeM[row][col] === 'X') {
                    const tx = sX + col * gridS;
                    const ty = sY + row * gridS;
                    chickensArr.push({
                        x: -80 - Math.random() * 300,
                        // El jitter de entrada nunca puede subir al cielo/valla.
                        y: Math.max(skyY, ty + (Math.random() - 0.5) * 60),
                        targetX: tx,
                        targetY: ty,
                        velX: 80 + Math.random() * 80,
                        velY: (Math.random() - 0.5) * 30,
                        direction: 1,
                        action: 'roam',
                        color: CHICKEN_COLORS[Math.floor(Math.random() * CHICKEN_COLORS.length)],
                        scale: state.isSpeedrunMode ? 1.6 : 1.0
                    });
                }
            }
        }
    }

    // ── Adam & Eve spawn: dad rooster + companions + 200 chicks from off-screen left ──
    function _spawnAdam() {
        const canvas = D.canvas, createChick = D.createChick, createRooster = D.createRooster;
        _setCineZoom(1);   // por si una sesión anterior dejó el zoom pegado
        let roostersArr = D.roostersArr, chicksArr = D.chicksArr;
        window._adamAct = 'run';
        window._adamActTimer = 0;
        window._adamPhaseTimer = 0;   // reloj GLOBAL de la fase 5 (no se resetea entre actos)
        window._adamRingTimer = 0;    // cuánto llevan los anillos formados
        window._dadKnockedDownTimer = 0;
        // Antes aquí se PISABAN los anillos con 20/20, lo que dejaba muerto el valor del
        // CONFIG. Ahora manda el CONFIG (y por tanto es ajustable desde un solo sitio).

        D.roostersArr = []; roostersArr = D.roostersArr;
        D.chicksArr = []; chicksArr = D.chicksArr;

        const dad = createRooster();
        dad.x = -80; dad.y = Math.round(CINE_REF_H * 0.5);
        dad.velX = CONFIG.ADAM_DAD_SPEED; dad.direction = 1; dad.action = 'roam'; dad.isDad = true;
        roostersArr.push(dad);

        for (let i = 0; i < 4; i++) {
            const r = createRooster();
            r.x = -120 - Math.random() * 200;
            r.y = Math.round(CINE_REF_H * (0.3 + Math.random() * 0.4));
            r.velX = CONFIG.ADAM_ROOSTER_SPEED + Math.random() * 80; r.direction = 1; r.action = 'roam';
            roostersArr.push(r);
        }

        for (let i = 0; i < CONFIG.ADAM_CHICKS; i++) {
            const ch = createChick(-100 - Math.random() * 500, Math.round(CINE_REF_H * (0.2 + Math.random() * 0.6)));
            ch.runSpeed = 120 + Math.random() * 80;
            ch.direction = 1;
            chicksArr.push(ch);
        }
    }

    // ── Duelo de gallos: 2 gallos entran corriendo, el público (gallinas quietas)
    //    ya está colocado mirando. Ver el acto 'run'/'fight'/'sleep' en updateCinematic. ──
    function _spawnManual() {
        const canvas = D.canvas, createRooster = D.createRooster;
        _setCineZoom(1);   // por si una sesión anterior dejó el zoom pegado
        window._duelAct = 'run';
        window._duelTimer = 0;

        D.eggsArr = [];
        D.chicksArr = [];
        D.roostersArr = [];
        D.chickensArr = [];
        const roostersArr = D.roostersArr, chickensArr = D.chickensArr;

        // Los 2 gallos corren por una franja BAJA, debajo del público, para que la
        // pelea quede a la vista de las gallinas de arriba.
        const laneY = Math.round(CINE_REF_H * 0.55);
        const rLeft = createRooster();
        rLeft.x = -60; rLeft.y = laneY;
        rLeft.velX = CONFIG.DUEL_ROOSTER_SPEED; rLeft.direction = 1; rLeft.action = 'roam';
        roostersArr.push(rLeft);

        const rRight = createRooster();
        rRight.x = canvas.width + 60; rRight.y = laneY;
        rRight.velX = -CONFIG.DUEL_ROOSTER_SPEED; rRight.direction = -1; rRight.action = 'roam';
        roostersArr.push(rRight);

        // Público a ambos lados de la pelea, como gradas de cerca/lejos:
        //   arriba  — forceRow:2 ("de frente", la fila que el juego usa al andar hacia
        //             ABAJO en pantalla) → mirando hacia la pelea, que queda más abajo.
        //   abajo   — forceRow:3 ("de espaldas", sin cara — la que se usa al andar
        //             hacia ARRIBA) → mirando hacia la pelea, que queda más arriba.
        // forceFrames:[1,2] anima solo esos 2 frames (no las 8 del ciclo de andar
        // completo), para una animación idle pequeña, no un paseo. Cada gallina lleva
        // su propio forceFramePhase/forceFrameMs (aleatorios) para que las de un mismo
        // grupo NO parpadeen todas a la vez — sin esto, como Date.now() es el mismo
        // para todas en el mismo frame de render, iban perfectamente al unísono.
        const CHICKEN_COLORS = ['#ffffff', '#dcc5a4', '#8b5a2b', '#444444'];
        const cx = canvas.width / 2;
        const skyY = window.CINEMATIC_SKY_FLOOR_Y ?? 120;

        function _spawnAudienceBand(bandTop, bandH, forceRow) {
            for (let i = 0; i < CONFIG.DUEL_AUDIENCE; i++) {
                const x = 20 + Math.random() * (canvas.width - 40);
                chickensArr.push({
                    x: x,
                    y: bandTop + Math.random() * bandH,
                    velX: 0, velY: 0,
                    direction: x < cx ? 1 : -1,
                    action: 'roam',
                    color: CHICKEN_COLORS[Math.floor(Math.random() * CHICKEN_COLORS.length)],
                    scale: 1.0,
                    forceRow: forceRow,
                    forceFrames: [1, 2],
                    forceFrameMs: 450 + Math.random() * 250,
                    forceFramePhase: Math.random() * 2000,
                });
            }
        }
        _spawnAudienceBand(skyY + 15, 90, 2);                          // arriba, mirando abajo
        _spawnAudienceBand(CINE_REF_H - 170, 90, 3);                   // abajo, mirando arriba
    }

    // Dibuja la nube de pelea (rooster_fight.png, 20 frames de 80×44) centrada en
    // (x, y), en coordenadas de MUNDO — llamar solo dentro de drawMeadow, con su
    // transform de escala ya aplicado.
    function _drawFightCloud(ctx, x, y, timer) {
        if (!_fightSheet || !_fightSheet.complete || _fightSheet.naturalWidth === 0) return;
        const frame = Math.floor((timer * 1000) / CONFIG.DUEL_FIGHT_FRAME_MS) % FIGHT_FRAMES;
        const dw = FIGHT_FRAME_W * CONFIG.DUEL_CLOUD_SCALE;
        const dh = FIGHT_FRAME_H * CONFIG.DUEL_CLOUD_SCALE;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(_fightSheet, frame * FIGHT_FRAME_W, 0, FIGHT_FRAME_W, FIGHT_FRAME_H,
            x - dw / 2, y - dh / 2 - 10, dw, dh);
        ctx.restore();
    }

    function drawCinematic() {
        const state = D.state;
        const RANKING_API_URL = D.RANKING_API_URL, SAVE_KEY_BY_MODE = D.SAVE_KEY_BY_MODE;
        const chickensArr = D.chickensArr, chicksArr = D.chicksArr, eggsArr = D.eggsArr,
              roostersArr = D.roostersArr, particlesArr = D.particlesArr;
        const renderChicken = D.renderChicken, renderChick = D.renderChick, renderRooster = D.renderRooster;
        const drawEgg = D.drawEgg, drawFence = D.drawFence;
        const fmt = D.fmt, fmtMoney = D.fmtMoney, formatTimeSecs = D.formatTimeSecs;
        // ÚNICO camino de render: el canvas CUADRADO #retireCineCanvas (400×400,
        // escalado por CSS a min(100vw,100vh)). Resolución-independiente, sin variantes.
        //
        // Aquí había un fallback `ctx = _farmCtx` que era CÓDIGO MUERTO Y ROTO:
        // `_farmCtx` no es un contexto 2D, es el objeto-puente de script.js
        // (window._farmCtx = { get state(), get canvas(), ... }). Si esa rama se
        // hubiera alcanzado, habría petado en el primer ctx.fillRect() (no es función).
        // Eliminado: si no hay canvas de cinemática, no hay nada que dibujar.
        const ctx = window._retireCineCtx;
        if (!ctx) return;
        let canvas = ctx.canvas;
        let w = canvas.width;
        let h = canvas.height;
        // Siempre true ahora. Se conserva porque el cuerpo lo consulta en varios
        // sitios; sus ramas `else` (el render sobre el canvas de la granja) han
        // quedado inalcanzables y se pueden podar en una limpieza aparte.
        const _isCine = true;

        // Helper block to draw the meadow exactly like normal but without troughs/machines
        let drawMeadow = function () {
            if (_isCine) {
                // Canvas is transparent — bg_intro HTML img shows through underneath
                ctx.clearRect(0, 0, w, h);
                // Apply uniform scale so game content (800×650) fills center of canvas
                const _gs = Math.min(w / 800, h / 650);
                ctx.save();
                ctx.translate((w - 800 * _gs) / 2, (h - 650 * _gs) / 2);
                ctx.scale(_gs, _gs);
            } else {
                ctx.fillStyle = '#7cba3a'; ctx.fillRect(0, 0, w, h);
                drawFence(ctx, w, h);
                ctx.fillStyle = '#6b9c2a';
                for (let i = 1; i < 30; i++) {
                    let gx = (i * 137) % w; let gy = (i * 93) % h;
                    if (gy < 65) gy += 65;
                    ctx.fillRect(gx, gy, 4, 4);
                }
            }
            let drawEntity = function (c, renderer) {
                let _s = (c.scale || 1.0) * (_isCine ? 2.0 : 1.0);

                if (c.angle) {
                    c.hideShadow = true;
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                    ctx.fillRect(c.x - 10, c.y - 5, 20, 6);
                }

                if (_s !== 1.0 || c.angle) {
                    ctx.save();
                    ctx.translate(c.x, c.y);
                    if (c.angle) ctx.rotate(c.angle);
                    ctx.scale(_s, _s);
                    ctx.translate(-c.x, -c.y);
                    renderer(ctx, c);
                    ctx.restore();
                } else {
                    renderer(ctx, c);
                }
            };
            let allCineEntities = [];
            // r.hidden: el gallo se "esconde" dentro de la nube de pelea del duelo
            // (Egg Jam/Manual) — ver el acto 'fight' en updateCinematic.
            roostersArr.forEach(r => { if (!r.hidden) allCineEntities.push({ e: r, r: renderRooster, isEgg: false }); });
            chickensArr.forEach(c => allCineEntities.push({ e: c, r: renderChicken, isEgg: false }));
            chicksArr.forEach(c => allCineEntities.push({ e: c, r: renderChick, isEgg: false }));
            eggsArr.forEach(e => allCineEntities.push({ e: e, isEgg: true }));

            allCineEntities.sort((a, b) => (a.e.y - b.e.y) || (a.e.x - b.e.x));

            allCineEntities.forEach(item => {
                if (item.isEgg) {
                    // ¡El ctx es OBLIGATORIO aquí! Sin él, drawEgg pinta en el canvas del
                    // juego (oculto durante la cinemática) y los huevos no se ven.
                    //
                    // OJO: no envuelvas esto en un `ctx.scale(item.e.scale, item.e.scale)`
                    // extra — drawEgg YA aplica `drawScale *= e.scale` internamente
                    // (script.js). Envolverlo aplicaría el escalado DOS VECES (e.scale²).
                    drawEgg(item.e, ctx);
                } else {
                    drawEntity(item.e, item.r);
                }
            });
            particlesArr.forEach(p => {
                let renderY = p.y - 10;
                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
                ctx.fillStyle = p.color || '#fff';
                ctx.font = `bold ${8 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                ctx.textAlign = 'center';
                ctx.shadowColor = '#000'; ctx.shadowBlur = 2;
                ctx.fillText(p.text, p.x, renderY);
                ctx.restore();
            });
            if (state.activeChallenge === 'manual' && window._duelAct === 'fight') {
                _drawFightCloud(ctx, window._duelCloudX, window._duelCloudY, window._duelTimer);
            }
            // Restore the game-space scale transform applied at the start of drawMeadow
            if (_isCine) ctx.restore();
        };

        if (D.cinematicPhase === 0) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, w, h);
        } else if (D.cinematicPhase === 1) {
            drawMeadow();
            let alpha = Math.max(0, 1.0 - D.cinematicTimer);
            if (alpha > 0) {
                ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
                ctx.fillRect(0, 0, w, h);
            }
        } else if (D.cinematicPhase === 2) {
            drawMeadow();
        } else if (D.cinematicPhase === 3) {
            drawMeadow();
        } else if (D.cinematicPhase === 5) {
            drawMeadow();
            if (state.activeChallenge === 'adam' && window._dadKnockedDownTimer > 3.0) {
                let alpha = Math.min(1, (window._dadKnockedDownTimer - 3.0) / 2.0);
                ctx.fillStyle = `rgba(0,0,0,${alpha})`;
                ctx.fillRect(0, 0, w, h);
            }
        } else if (D.cinematicPhase === 4) {
            if (_isCine) {
                // Cinematic canvas: show farm background — HTML overlay handles the stats panel
                drawMeadow();
            } else if (state.isSpeedrunMode) {
                drawMeadow();
                ctx.fillStyle = 'rgba(28, 28, 28, 0.88)';
                ctx.fillRect(0, 0, w, h);
            } else {
                ctx.fillStyle = '#1c1c1c';
                ctx.fillRect(0, 0, w, h);
            }
            if (_isCine) { ctx.textAlign = 'left'; return; }

            // ── LEFT PANEL: Stats ──
            let panelW = 320;
            let panelH = 420;
            let leftX = w / 2 - panelW - 20;
            let panelY = h / 2 - panelH / 2;

            ctx.strokeStyle = '#d4af37';
            ctx.lineWidth = 4;
            ctx.strokeRect(leftX, panelY, panelW, panelH);
            ctx.strokeStyle = '#8a6d3b';
            ctx.lineWidth = 2;
            ctx.strokeRect(leftX + 6, panelY + 6, panelW - 12, panelH - 12);
            ctx.lineWidth = 1;

            ctx.textAlign = 'center';
            ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;

            ctx.fillStyle = '#ffffff';
            ctx.font = `${14 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
            ctx.fillText('Yumurta Fabrikası', leftX + panelW / 2, panelY + 40);

            ctx.fillStyle = '#f1c40f';
            ctx.font = `${10 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
            ctx.fillText('Çiftlik Tycoon', leftX + panelW / 2, panelY + 68);

            ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

            ctx.fillStyle = '#444';
            ctx.fillRect(leftX + 30, panelY + 95, panelW - 60, 2);

            ctx.font = `${9 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
            let hrs = Math.floor((state.playTime || 0) / 3600);
            let mins = Math.floor(((state.playTime || 0) % 3600) / 60);
            let secs = Math.floor((state.playTime || 0) % 60);
            let timeStr = (window.currentLang === 'tr')
                ? (hrs > 0 ? `${hrs}sa ${mins}dk ${secs}sn` : `${mins}dk ${secs}sn`)
                : `${hrs}h ${mins}m ${secs}s`;

            let chalStr = window.t ? window.t("chal1Title") : "1. NORMAL";
            if (state.activeChallenge === 'speedrun' || state.isSpeedrunMode) chalStr = window.t ? window.t("chal2Title") : "4. SPEEDRUN";
            else if (state.activeChallenge === 'adam') chalStr = window.t ? window.t("chal3Title") : "2. ADAM & EVE";
            else if (state.activeChallenge === 'manual') chalStr = window.t ? window.t("chal4Title") : "3. EGG JAM";
            else if (state.activeChallenge === 'endless') chalStr = window.t ? window.t("chal5Title") : "5. ENDLESS FARM";
            chalStr = chalStr.replace(/^\d+\.\s*/, '');

            let lblX = leftX + panelW / 2 - 5;
            let valX = leftX + panelW / 2 + 5;
            let sY = panelY + 120;

            ctx.textAlign = 'right';
            ctx.fillStyle = '#ccc';
            ctx.fillText((window.t ? window.t("challengeLabel") : (window.currentLang === 'tr' ? 'Görev:' : 'Challenge:')), lblX, sY);
            ctx.fillText((window.t ? window.t("playtime") : "Playtime:"), lblX, sY + 30);
            ctx.fillText((window.t ? window.t("eggsSold") : "Eggs Sold:"), lblX, sY + 60);
            ctx.fillText((window.t ? window.t("earnings") : "Earnings:"), lblX, sY + 90);
            ctx.fillText((window.t ? window.t("chickens") : "Chickens:"), lblX, sY + 120);
            ctx.fillStyle = '#e74c3c';
            ctx.fillText((window.currentLang === 'tr' ? 'Ölen:' : 'Dead:'), lblX, sY + 150);
            ctx.fillText((window.t ? window.t("hungryLabel") : (window.currentLang === 'tr' ? 'Aç Kalan:' : 'Hungry:')), lblX, sY + 180);

            ctx.textAlign = 'left';
            ctx.fillStyle = '#d4af37';
            ctx.fillText(chalStr, valX, sY);
            ctx.fillStyle = '#fff';
            ctx.fillText(timeStr, valX, sY + 30);
            ctx.fillText(fmt(state.eggsSold), valX, sY + 60);
            const _cineCurSym = (window.currentLang === 'tr' || (typeof localStorage !== 'undefined' && localStorage.getItem('chickenIdleLang') === 'tr')) ? ' ₺' : '$';
            ctx.fillText(fmtMoney(state.totalEarnings || state.money) + _cineCurSym, valX, sY + 90);
            ctx.fillStyle = '#f39c12';
            { const _mc2 = state.megaChickens || 0; const _eq2 = (state.chickens || 0) - _mc2 + _mc2 * 50; ctx.fillText(fmt(_eq2) + (_mc2 > 0 ? ' (' + _mc2 + '★)' : ''), valX, sY + 120); }
            ctx.fillStyle = '#e74c3c';
            ctx.fillText(fmt(state.deadChickens || 0), valX, sY + 150);
            ctx.fillText(fmt(state.chickensSuffered || 0), valX, sY + 180);

            let suffered = (state.chickensSuffered || 0) + (state.deadChickens || 0);
            if (suffered === 0) {
                ctx.fillStyle = Date.now() % 1000 < 500 ? '#f1c40f' : '#f39c12';
                ctx.font = `${7 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                ctx.textAlign = 'center';
                ctx.fillText((window.currentLang === 'tr' ? 'KUSURSUZ! Hiçbir tavuk zarar görmedi.' : 'PERFECT! No chickens harmed.'), leftX + panelW / 2, sY + 210);
            }

            ctx.fillStyle = '#aaa';
            ctx.textAlign = 'center';
            ctx.font = `${8 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
            let blink = Date.now() % 1000 < 500 ? (window.currentLang === 'tr' ? 'Tekrar oynamak için MEYDAN OKUMALARI aç' : 'Open CHALLENGES to play again') : '';
            ctx.fillText(blink, leftX + panelW / 2, panelY + panelH - 20);

            // ── RIGHT PANEL: Ranking ──
            let rightPanelW = 380;
            let rightX = w / 2 + 10;

            ctx.strokeStyle = '#d4af37';
            ctx.lineWidth = 4;
            ctx.strokeRect(rightX, panelY, rightPanelW, panelH);
            ctx.strokeStyle = '#8a6d3b';
            ctx.lineWidth = 2;
            ctx.strokeRect(rightX + 6, panelY + 6, rightPanelW - 12, panelH - 12);
            ctx.lineWidth = 1;

            ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
            ctx.fillStyle = '#f1c40f';
            ctx.font = `${14 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
            ctx.textAlign = 'center';
            ctx.fillText((window.currentLang === 'tr' ? 'HIZLI KOŞU' : 'SPEEDRUN'), rightX + rightPanelW / 2, panelY + 35);
            ctx.fillText((window.currentLang === 'tr' ? 'SIRALAMASI' : 'RANKING'), rightX + rightPanelW / 2, panelY + 55);
            ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

            ctx.fillStyle = '#444';
            ctx.fillRect(rightX + 30, panelY + 68, rightPanelW - 60, 2);

            // Fetch ranking once
            if (!window._endRankFetched) {
                window._endRankFetched = true;
                window._endRankData = null;
                window._endRankPlayerPos = null;
                fetch(RANKING_API_URL + '/get_ranking_2.php')
                    .then(r => r.json())
                    .then(data => {
                        if (data.ok) window._endRankData = data.ranking;
                    })
                    .catch(() => { });
            }

            let rData = window._endRankData;
            let rY = panelY + 95;
            let rowH = 26;
            const marketColors = (m) => window.PLATFORM.marketColor(m);
            const marketLabels = (m) => window.PLATFORM.marketLabel(m);

            if (!rData) {
                ctx.fillStyle = '#888';
                ctx.font = `${8 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                ctx.textAlign = 'center';
                ctx.fillText((window.t ? window.t('rankingLoading') : (window.currentLang === 'tr' ? 'Yükleniyor...' : 'Loading...')), rightX + rightPanelW / 2, rY + 50);
            } else {
                let top10 = rData.slice(0, 10);
                let ld = null;
                try {
                    let s = localStorage.getItem('chickenIdleSpeedrunData');
                    if (s) ld = JSON.parse(s);
                } catch (e) { }
                let playerName = (ld && ld.name) ? ld.name : (localStorage.getItem('chickenIdleLastName') || '');
                let playerPos = window._endRankPlayerPos || (ld ? ld.pos : null);
                let playerMarket = (ld && ld.market) ? ld.market : 'itchio';
                let playerTime = (ld && ld.time_secs) ? ld.time_secs : Math.floor(state.playTime || 0);
                let playerInTop = false;

                for (let i = 0; i < top10.length; i++) {
                    let r = top10[i];
                    let posColors = ['#f1c40f', '#bdc3c7', '#cd7f32'];
                    let isPlayer = (playerName && r.name === playerName);
                    let baseY = rY + i * rowH;
                    let centerY = baseY + rowH / 2;

                    if (isPlayer) {
                        playerInTop = true;
                        ctx.fillStyle = 'rgba(46, 204, 113, 0.15)';
                        ctx.fillRect(rightX + 12, centerY - 11, rightPanelW - 24, 22);
                        ctx.strokeStyle = 'rgba(46, 204, 113, 0.4)';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(rightX + 12, centerY - 11, rightPanelW - 24, 22);
                    }

                    ctx.textBaseline = 'middle';

                    // Position number
                    ctx.textAlign = 'left';
                    ctx.font = `${8 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                    ctx.fillStyle = posColors[i] || '#fff';
                    ctx.fillText(`${r.pos}.`, rightX + 16, centerY);

                    // Market badge (fixed width, vertically centered)
                    let mktColor = marketColors(r.market);
                    let mktLabel = marketLabels(r.market);
                    let badgeW = 100;
                    let badgeH = 14;
                    let badgeX = rightX + 42;
                    let badgeY = centerY - badgeH / 2;
                    ctx.fillStyle = mktColor;
                    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
                    ctx.fillStyle = '#fff';
                    ctx.font = `${6 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                    let labelW = ctx.measureText(mktLabel).width;
                    ctx.fillText(mktLabel, badgeX + (badgeW - labelW) / 2, centerY);

                    // Name (after badge)
                    let nameX = badgeX + badgeW + 8;
                    ctx.font = `${10 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                    ctx.fillStyle = '#fff';
                    ctx.fillText(r.name, nameX, centerY + 1); // +1 because 10px font optical center is slightly lower

                    // Time (MM:SS) aligned right
                    ctx.textAlign = 'right';
                    ctx.font = `${8 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                    ctx.fillStyle = '#e67e22';
                    ctx.fillText(formatTimeSecs(r.time_secs), rightX + rightPanelW - 16, centerY);
                }

                // If player not in top 10, show their position below
                if (!playerInTop && playerPos && playerName) {
                    let sepY = rY + Math.min(top10.length, 10) * rowH + 5;
                    ctx.fillStyle = '#555';
                    ctx.fillRect(rightX + 20, sepY, rightPanelW - 40, 1);

                    // Player row
                    let pY = sepY + 8;
                    let pCenterY = pY + rowH / 2;
                    ctx.fillStyle = 'rgba(46, 204, 113, 0.15)';
                    ctx.fillRect(rightX + 12, pCenterY - 11, rightPanelW - 24, 22);
                    ctx.strokeStyle = 'rgba(46, 204, 113, 0.4)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(rightX + 12, pCenterY - 11, rightPanelW - 24, 22);

                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'left';
                    ctx.font = `${8 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                    ctx.fillStyle = '#fff';
                    ctx.fillText(`${playerPos}.`, rightX + 16, pCenterY);

                    // Re-use data for the bottom row
                    let pMktColor = marketColors(playerMarket);
                    let pMktLabel = marketLabels(playerMarket);
                    let badgeW = 100;
                    let badgeH = 14;
                    let badgeX = rightX + 42;
                    let badgeY = pCenterY - badgeH / 2;
                    ctx.fillStyle = pMktColor;
                    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
                    ctx.fillStyle = '#fff';
                    ctx.font = `${6 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                    let labelW = ctx.measureText(pMktLabel).width;
                    ctx.fillText(pMktLabel, badgeX + (badgeW - labelW) / 2, pCenterY);

                    ctx.textAlign = 'left';
                    ctx.font = `${10 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                    ctx.fillText(playerName, badgeX + badgeW + 8, pCenterY + 1);

                    ctx.textAlign = 'right';
                    ctx.font = `${8 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                    ctx.fillStyle = '#e67e22';
                    ctx.fillText(formatTimeSecs(playerTime), rightX + rightPanelW - 16, pCenterY);
                }

                ctx.textBaseline = 'alphabetic';

                if (top10.length === 0) {
                    ctx.fillStyle = '#888';
                    ctx.textAlign = 'center';
                    ctx.fillText((window.currentLang === 'tr' ? 'Henüz kayıt yok' : 'No records yet'), rightX + rightPanelW / 2, rY + 50);
                    ctx.fillText((window.currentLang === 'tr' ? 'İlk sen ol!' : 'Be the first!'), rightX + rightPanelW / 2, rY + 70);
                }
            }

            if (!state.isSpeedrunMode) {
                let cx = rightX + rightPanelW / 2;
                let cy = panelY + panelH - 30;
                let bw = 280, bh = 30;
                let blinkHover = Date.now() % 1000 < 500;
                ctx.fillStyle = blinkHover ? '#e74c3c' : '#c0392b';
                ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
                ctx.fillStyle = '#fff';
                ctx.font = `${10 * (window.P2P_SCALE || 1)}px "${window.P2P_FONT || 'Press Start 2P'}"`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText((window.currentLang === 'tr' ? 'HIZLI KOŞU OYNA (x2 KAZANÇ)' : 'PLAY SPEEDRUN (x2 VALUE)'), cx, cy);
                window._speedrunCanvasBtn = { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
            } else {
                window._speedrunCanvasBtn = null;
            }

            ctx.textAlign = 'left';
        }
    }

    // ── API pública ──────────────────────────────────────────────────────
    return {
        init:   init,
        update: updateCinematic,   // llamada desde el bucle de juego
        draw:   drawCinematic,     // llamada desde el render
        CONFIG: CONFIG,
    };
}());
