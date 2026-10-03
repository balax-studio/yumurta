// scenarios/farm/ending.js — Farm ending data & utilities
// Pure data / pure functions, no IIFE dependencies.
// updateCinematic / drawCinematic still live in script.js (they need _farmCtx
// throughout ~760 lines of tightly-coupled rendering code — extract in a follow-up).

window.FarmEnding = (() => {

    // ── Pixel font: 3-wide × 5-tall glyphs ───────────────────────────────────
    // Used for speedrun time display (digits/h/m/s) and THANKS FOR PLAYING text.
    const PIXEL_FONT = {
        '0': ["XXX", "X X", "X X", "X X", "XXX"],
        '1': [" X ", "XX ", " X ", " X ", "XXX"],
        '2': ["XXX", "  X", "XXX", "X  ", "XXX"],
        '3': ["XXX", "  X", "XXX", "  X", "XXX"],
        '4': ["X X", "X X", "XXX", "  X", "  X"],
        '5': ["XXX", "X  ", "XXX", "  X", "XXX"],
        '6': ["XXX", "X  ", "XXX", "X X", "XXX"],
        '7': ["XXX", "  X", "  X", "  X", "  X"],
        '8': ["XXX", "X X", "XXX", "X X", "XXX"],
        '9': ["XXX", "X X", "XXX", "  X", "XXX"],
        ':': ["   ", " X ", "   ", " X ", "   "],
        '#': ["   ", " X ", "XXX", " X ", "XXX"],
        ' ': ["   ", "   ", "   ", "   ", "   "],
        'h': ["X X", "X X", "XXX", "X X", "X X"],
        'm': ["XXX", "X X", "X X", "X X", "X X"],
        's': ["XXX", "X  ", "XXX", "  X", "XXX"],
        // uppercase alphabet
        'A': [" X ", "X X", "XXX", "X X", "X X"],
        'F': ["XXX", "X  ", "XX ", "X  ", "X  "],
        'G': [" XX", "X  ", "X X", "X X", " XX"],
        'H': ["X X", "X X", "XXX", "X X", "X X"],
        'I': ["XXX", " X ", " X ", " X ", "XXX"],
        'K': ["X X", "XX ", "X  ", "XX ", "X X"],
        'L': ["X  ", "X  ", "X  ", "X  ", "XXX"],
        'N': ["X X", "XX ", "X X", "X X", "X X"],
        'O': ["XXX", "X X", "X X", "X X", "XXX"],
        'P': ["XX ", "X X", "XX ", "X  ", "X  "],
        'R': ["XX ", "X X", "XX ", "XX ", "X X"],
        'S': ["XXX", "X  ", "XXX", "  X", "XXX"],
        'T': ["XXX", " X ", " X ", " X ", " X "],
        'Y': ["X X", " X ", " X ", " X ", " X "],
    };

    // Cada línea se CENTRA automáticamente respecto a la más ancha, así que no
    // hace falta rellenar con espacios a mano al escribir el texto.
    function buildTextMatrix(lines) {
        const glyphH = 5;
        const CHAR_W = 4; // 3 columnas de glifo + 1 de separación

        // Ancho (en columnas) de la línea más larga → define el ancho del bloque.
        let blockW = 0;
        for (let li = 0; li < lines.length; li++) {
            if (lines[li].length * CHAR_W > blockW) blockW = lines[li].length * CHAR_W;
        }

        let allRows = [];
        for (let li = 0; li < lines.length; li++) {
            const text = lines[li];
            // Sangría izquierda para centrar esta línea dentro del bloque.
            const pad = ' '.repeat(Math.max(0, Math.round((blockW - text.length * CHAR_W) / 2)));
            let rowData = [];
            for (let r = 0; r < glyphH; r++) rowData.push(pad);
            for (let ci = 0; ci < text.length; ci++) {
                const glyph = PIXEL_FONT[text[ci]] || PIXEL_FONT[' '];
                for (let r = 0; r < glyphH; r++) {
                    rowData[r] += (glyph[r] || '') + ' ';
                }
            }
            for (let r = 0; r < glyphH; r++) allRows.push(rowData[r]);
            if (li < lines.length - 1) { allRows.push(''); allRows.push(''); }
        }
        return allRows;
    }

    // ── Formación de píxeles del final ──────────────────────────────────────
    // Una entrada por línea. Se centran solas (ver buildTextMatrix), no pongas
    // espacios de relleno. Cuantas más líneas, más alta la formación: el spawn
    // reduce el espaciado para que quepa, así que menos líneas = gallinas más
    // separadas y legibles.
    const THE_END_MATRIX = buildTextMatrix(["THANKS", "FOR", "PLAYING"]);

    // ── Graveyard insult matrices (shown when chickens die) ──────────────────
    const CRUELTY_MATRICES = [
        // NO (25 Xs)
        [
            "X   X  XXX ",
            "XX  X X   X",
            "X X X X   X",
            "X  XX X   X",
            "X   X  XXX "
        ],
        // WHY? (35 Xs)
        [
            "X   X X   X X   X",
            "X   X X   X X   X",
            "X X X XXXXX  XXX ",
            "XX XX X   X   X  ",
            "X   X X   X   X  "
        ],
        // BAD (44 Xs)
        [
            "XXXX   XXX  XXXX ",
            "X   X X   X X   X",
            "XXXX  XXXXX X   X",
            "X   X X   X X   X",
            "XXXX  X   X XXXX "
        ],
        // GUILTY (63 Xs)
        [
            " XXX  X   X XXXXX X     XXXXX X   X",
            "X     X   X   X   X       X   X   X",
            "X  XX X   X   X   X       X    XXX ",
            "X   X X   X   X   X       X     X  ",
            " XXX   XXX  XXXXX XXXXX   X     X  "
        ],
        // SINNER (80 Xs)
        [
            " XXX  XXXXX X   X X   X XXXXX XXXX ",
            "X      X   XX  X XX  X X     X   X",
            " XXX    X   X X X X X X XXXX  XXXX ",
            "    X   X   X  XX X  XX X     X  X ",
            " XXX  XXXXX X   X X   X XXXXX X   X"
        ],
        // MONSTER (88 Xs)
        [
            "X   X  XXX  X   X  XXX  XXXXX XXXXX XXXX ",
            "XX XX X   X XX  X X       X   X     X   X",
            "X X X X   X X X X  XXX    X   XXXX  XXXX ",
            "X   X X   X X  XX     X   X   X     X  X ",
            "X   X  XXX  X   X  XXX    X   XXXXX X   X"
        ]
    ];

    function getGraveyardMatrix(chickens, tombstoneCount) {
        let totalFarmSize = chickens + tombstoneCount;
        if (totalFarmSize >= 88) return CRUELTY_MATRICES[5];
        if (totalFarmSize >= 80) return CRUELTY_MATRICES[4];
        if (totalFarmSize >= 63) return CRUELTY_MATRICES[3];
        if (totalFarmSize >= 44) return CRUELTY_MATRICES[2];
        if (totalFarmSize >= 35) return CRUELTY_MATRICES[1];
        return CRUELTY_MATRICES[0];
    }

    return { THE_END_MATRIX, PIXEL_FONT, buildTextMatrix, CRUELTY_MATRICES, getGraveyardMatrix };
})();
