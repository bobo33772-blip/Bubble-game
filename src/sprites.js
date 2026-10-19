// 뽀득뽀득 목욕탕 — sprites, palette and themes (all original pixel art, drawn in code).
// PG.PALETTE: single shared palette ('.' = transparent).
// PG.SPRITES: { name: [frame, ...] }, frame = array of equal-length strings. Characters face RIGHT.
// PG.THEMES:  5 bathhouse colour themes.
window.PG = window.PG || {};
(function (PG) {
  'use strict';

  // ------------------------------------------------------------------ palette
  const PALETTE = {
    k: '#1c1530', // outline / ink
    w: '#ffffff', // white
    W: '#d9dfec', // pale grey
    a: '#8c8ca6', // mid grey
    d: '#4b4462', // dark slate (drain fly)
    Y: '#ffd23c', // duck yellow
    L: '#fff1a6', // light yellow
    y: '#e39a1e', // golden shade
    O: '#ff8c1e', // orange (beak, tangerine)
    o: '#c9520f', // dark orange
    p: '#ff8fb1', // pink
    P: '#ffc9dc', // light pink
    q: '#d9578a', // deep pink
    c: '#aef3ff', // bubble cyan
    C: '#3fbfe0', // deep cyan
    v: '#b9a0ff', // violet sheen
    V: '#5b3fb8', // deep violet (spores, queen's skirt)
    g: '#9c8a74', // grime
    G: '#685a4c', // grime shade
    h: '#c9b89c', // grime highlight
    m: '#8fd64c', // mold / leaf green
    M: '#3c8c3c', // dark green
    n: '#d2f59c', // pale green
    s: '#ff8c70', // sponge coral
    S: '#c8513f', // sponge shade
    b: '#4fa3f0', // scrub blue
    B: '#2b5fb4', // dark blue
    t: '#3cc464', // scrub-mitt green
    T: '#1b7a3a', // scrub-mitt dark green
    R: '#ff3b4c', // red
    r: '#b0203c', // dark red
    E: '#f3e2b4', // cream
    f: '#c98c4c', // roasted brown
    F: '#8a5428', // dark brown
    x: '#7fdcbf', // mint tile
    X: '#c6f6e6', // mint tile light
    j: '#3fa587', // mint tile shade
    u: '#8dc9ff', // sky tile
    l: '#f6da7e', // butter tile
    z: '#3c4656', // grout
    // ---- v2 additions (bosses, water, soaked enemies)
    H: '#463a31', // deep grime shadow
    N: '#1d5a32', // deep green
    Q: '#8a2f2c', // deep coral (sponge pores)
    Z: '#ffb79c', // coral highlight
    e: '#f5adc4', // soaked pink
    A: '#c06c90', // soaked pink shade
    D: '#2e9298', // hot water teal
    J: '#1c6072', // hot water deep teal
    i: '#e4f8ff', // ice white
    I: '#64aee8', // cold water blue
    // ---- v3 additions (bathhouse animal characters; digits are palette keys too)
    K: '#e8b67c', // capybara tan highlight
    U: '#9a6440', // otter brown
    '5': '#5c3824', // otter deep brown
    '1': '#35447a', // penguin navy
    '2': '#5d74b4', // penguin navy sheen
    '4': '#f6b26b', // cat apricot
    '3': '#a9bde6', // ghost periwinkle
  };

  // ------------------------------------------------------------------ helpers
  const A = (s) => s.trim().split('\n').map((r) => r.trim()).filter((r) => r.length);
  const G = (rows) => rows.map((r) => r.split(''));
  const S = (g) => g.map((r) => r.join(''));
  const blank = (w, h) => Array.from({ length: h }, () => '.'.repeat(w));

  // 1-px outline (4-neighbour) around every filled pixel that is not already ink.
  function outline(rows, oc) {
    oc = oc || 'k';
    const g = G(rows), o = G(rows), h = g.length, w = g[0].length;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (g[y][x] !== '.') continue;
        const n = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (const [nx, ny] of n) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const c = g[ny][nx];
          if (c !== '.' && c !== oc) { o[y][x] = oc; break; }
        }
      }
    }
    return S(o);
  }
  const recolor = (rows, map) => rows.map((r) => r.replace(/./g, (ch) => (map[ch] !== undefined ? map[ch] : ch)));
  function put(rows, pts) { // pts: [[x, y, ch], ...]
    const g = G(rows);
    for (const [x, y, ch] of pts) if (g[y] && g[y][x] !== undefined) g[y][x] = ch;
    return S(g);
  }
  function stamp(base, top, ox, oy) {
    const g = G(base);
    top.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) {
        const ch = r[x];
        if (ch === '.') continue;
        const gy = y + oy, gx = x + ox;
        if (g[gy] && g[gy][gx] !== undefined) g[gy][gx] = ch;
      }
    });
    return S(g);
  }
  const flipV = (rows) => rows.slice().reverse();
  function rot90(rows) { // clockwise
    const h = rows.length, w = rows[0].length, out = [];
    for (let x = 0; x < w; x++) {
      let s = '';
      for (let y = h - 1; y >= 0; y--) s += rows[y][x];
      out.push(s);
    }
    return out;
  }
  // replace rows [from..] with given rows (copy)
  const withRows = (rows, at, repl) => rows.map((r, i) => (i >= at && i < at + repl.length ? repl[i - at] : r));
  // move a block of rows up/down by dy (rows that leave are dropped, freed rows become blank)
  function shiftY(rows, dy) {
    const w = rows[0].length, h = rows.length, out = [];
    for (let y = 0; y < h; y++) {
      const sy = y - dy;
      out.push(sy >= 0 && sy < h ? rows[sy] : '.'.repeat(w));
    }
    return out;
  }
  function shiftX(rows, dx) {
    return rows.map((r) => {
      if (dx > 0) return ('.'.repeat(dx) + r).slice(0, r.length);
      return (r.slice(-dx) + '.'.repeat(-dx));
    });
  }

  const SPR = {};

  // ================================================================== DUCK 꽥꽥이
  // Fill art (outline is added automatically). Big round head, 2x3 eye, teardrop wing.
  // Rows 0..13 = body, row 14 = feet, row 15 = outline under the feet.
  const DUCK = A(`
    ................
    .......LLYY.....
    ......LwYYYY....
    .....LLYYYwkY...
    .....LYYYYkkY...
    .....YYYYYkkYOO.
    .Y...YYYYppYOoo.
    .YY...YYYYYY....
    .YYYYYYYyyyYY...
    .YYLLLYYYYYYYY..
    .YLYYYYyYYYYYY..
    .YyYYYyYYYYYYy..
    ..YyyyYYYYYYyy..
    ...yyyyyyyyyy...
    ....OO...OO.....
    ................
  `);
  const BODY = DUCK.slice(0, 14);
  const B2 = ['................', '................'];
  const up1 = (rows) => shiftY(rows, -1);
  const setRow = (rows, i, s) => rows.map((r, j) => (j === i ? s : r));

  const duckIdle0 = DUCK;
  // breathing bob: the head sinks 1px into the chest
  const duckIdle1 = [DUCK[0]].concat(DUCK.slice(0, 8), DUCK.slice(9, 16));

  // waddle: near foot O, far foot o; passing frames lift the body 1px
  const duckWalk = [
    BODY.concat(['...OO.....oo....', '................']),
    setRow(setRow(up1(BODY.concat(B2)), 13, '.......oo.......'), 14, '.....OO.........'),
    BODY.concat(['...oo.....OO....', '................']),
    setRow(setRow(up1(BODY.concat(B2)), 13, '.....oo.........'), 14, '.......OO.......'),
  ];

  // jump: body up 1px, wing flung up, feet tucked
  const duckJump = A(`
    .......LLYY.....
    ......LwYYYY....
    .....LLYYYwkY...
    .....LYYYYkkY...
    .LL..YYYYYkkYOO.
    .LLL.YYYYppYOoo.
    ..LLL.YYYYYY....
    .yyLLYYYyyyYY...
    .YYyyyYYYYYYYY..
    .YYYYYYYYYYYYY..
    .YYYYYYYYYYYYy..
    ..YYYYYYYYYYyy..
    ...yyyyyyyyyy...
    ...OO..OO.......
    ................
    ................
  `);
  // fall: wing up, surprised round eye, feet dangling apart
  const duckFall = put(['................'].concat(duckJump.slice(0, 13), ['..OO.......OO...', '................']), [
    [10, 3, 'w'], [11, 3, 'w'], [10, 4, 'k'], [11, 4, 'k'], [10, 5, 'k'], [11, 5, 'w'],
  ]);
  // blow: squeezed '>' eye, puffed pink cheek, beak wide open
  const duckShoot = A(`
    ................
    .......LLYY.....
    ......LwYYYY....
    .....LLYYYkYY...
    .....LYYYYYkY...
    .....YYYYYkYYOO.
    .Y...YYpPpYYOkk.
    .YY..YYpppYYooo.
    .YYYYYYYyyyYY...
    .YYLLLYYYYYYYY..
    .YLYYYYyYYYYYY..
    .YyYYYyYYYYYYy..
    ..YyyyYYYYYYyy..
    ...yyyyyyyyyy...
    ....OO...OO.....
    ................
  `);
  // dizzy: X eyes + open beak, rotated through four frames for a tumbling spin
  const duckDizzy = put(DUCK, [
    [9, 3, 'k'], [10, 3, 'Y'], [11, 3, 'k'],
    [9, 4, 'Y'], [10, 4, 'k'], [11, 4, 'Y'],
    [9, 5, 'k'], [10, 5, 'Y'], [11, 5, 'k'],
    [13, 6, 'k'], [14, 6, 'k'], [12, 7, 'o'], [13, 7, 'o'], [14, 7, 'o'],
  ]);
  const dz = outline(duckDizzy);

  SPR.duck_idle = [duckIdle0, duckIdle1].map((f) => outline(f));
  SPR.duck_walk = duckWalk.map((f) => outline(f));
  SPR.duck_jump = [outline(duckJump)];
  SPR.duck_fall = [outline(duckFall)];
  SPR.duck_shoot = [outline(duckShoot)];
  SPR.duck_die = [dz, rot90(dz), rot90(rot90(dz)), rot90(rot90(rot90(dz)))];

  // ================================================================== BUBBLES
  const RIM = A(`
    .....######.....
    ...##......##...
    ..#..........#..
    .#............#.
    .#............#.
    #..............#
    #..............#
    #..............#
    #..............#
    #..............#
    #..............#
    .#............#.
    .#............#.
    ..#..........#..
    ...##......##...
    .....######.....
  `);
  const INSIDE = RIM.map((r) => {
    const first = r.indexOf('#'), last = r.lastIndexOf('#');
    let s = '';
    for (let x = 0; x < r.length; x++) s += x > first && x < last && r[x] !== '#' ? '1' : '0';
    return s;
  });
  const angOf = (x, y) => (Math.atan2(y - 7.5, x - 7.5) * 180) / Math.PI; // 0 = right, 90 = down
  const angDist = (a, b) => { let d = Math.abs(((a - b) % 360 + 360) % 360); return d > 180 ? 360 - d : d; };
  const GLINT = [[4, 2], [5, 2], [3, 3], [2, 4], [2, 5], [4, 4]];

  // style: { base, shade, sheenA, sheenB, glint }
  function bubbleRim(phase, st) {
    const g = G(blank(16, 16));
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (RIM[y][x] === '#') {
          const a = angOf(x, y);
          let ch = st.base;
          if (a > 5 && a < 115) ch = st.shade;
          if (st.sheenA && angDist(a, phase) < 24) ch = st.sheenA;
          else if (st.sheenB && angDist(a, phase + 150) < 20) ch = st.sheenB;
          g[y][x] = ch;
        } else if (INSIDE[y][x] === '1' && st.inner) {
          // faint inner reflection along the lower right
          const nb = [[x + 1, y], [x, y + 1], [x + 1, y + 1]].some(([nx, ny]) => RIM[ny] && RIM[ny][nx] === '#');
          const a = angOf(x, y);
          if (nb && a > 25 && a < 70) g[y][x] = st.inner;
        }
      }
    }
    return S(g);
  }
  function addGlint(rows, ch, pts) {
    return put(rows, (pts || GLINT).map(([x, y]) => [x, y, ch || 'w']));
  }
  // compose: content (16x16, clipped to inside) + rim + glint
  function bubbleWith(content, phase, st) {
    const g = G(blank(16, 16));
    const cg = content ? G(content) : null;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (cg && INSIDE[y][x] === '1' && cg[y][x] !== '.') g[y][x] = cg[y][x];
    }
    let out = stamp(S(g), bubbleRim(phase, st), 0, 0);
    if (st.glint !== false) out = addGlint(out, 'w', st.glintPts);
    return out;
  }
  const ST_BUBBLE = { base: 'c', shade: 'C', sheenA: 'v', sheenB: 'P', inner: 'C' };
  const ST_NEW = { base: 'w', shade: 'c', sheenA: 'v', sheenB: 'P', inner: 'c' };
  const ST_TRAP = { base: 'c', shade: 'C', sheenA: 'v', sheenB: 'P' };
  const ST_STEAM = { base: 'P', shade: 'p', sheenA: 'w', sheenB: 'v', inner: 'p' };

  SPR.bubble_new = [bubbleWith(null, 200, ST_NEW), bubbleWith(null, 20, ST_NEW)];
  SPR.bubble = [bubbleWith(null, 200, ST_BUBBLE), bubbleWith(null, 320, ST_BUBBLE), bubbleWith(null, 80, ST_BUBBLE)];

  function polar(g, r, deg, ch) {
    const t = (deg * Math.PI) / 180;
    const x = Math.round(7.5 + r * Math.cos(t)), y = Math.round(7.5 + r * Math.sin(t));
    if (x >= 0 && y >= 0 && x < 16 && y < 16) g[y][x] = ch;
  }
  // pop: the film bursts into 8 radial streaks, then scatters as droplets
  (function () {
    const a = A(`
      ................
      .......ww.......
      ..c....cc....c..
      ...wc......cw...
      ....c......c....
      ................
      .P............v.
      wcc..........ccw
      wcc..........ccw
      .v............P.
      ................
      ....c......c....
      ...wc......cw...
      ..c....cc....c..
      .......ww.......
      ................
    `);
    const b = G(blank(16, 16));
    for (let i = 0; i < 8; i++) polar(b, 7.6, 22.5 + i * 45, i % 2 ? 'c' : 'w');
    for (let i = 0; i < 4; i++) polar(b, 5.4, i * 90, i % 2 ? 'v' : 'P');
    SPR.bubble_pop = [a, S(b)];
  })();

  // ================================================================== ENEMIES
  // ---- grime 때꼬마: grey-brown blob, grumpy googly eyes, drippy bottom
  const GRIME = A(`
    ................
    ................
    ................
    .......hhhh.....
    .....hhggggg....
    ...hhggggggggg..
    ..hgggggwwgwwg..
    ..hgggggwkgwkgg.
    .hggggggwkgwkgg.
    .hggGgggggggggg.
    .ggggggggkkkgGg.
    .gGgggggkgggkgg.
    .ggggGgggggggGg.
    ..gGgg.gGgg.gg..
    ...GG.....GG....
    ................
  `);
  const GRIME1 = ['................'].concat(GRIME.slice(0, 13), ['....GG...GG.....', '................']);
  const GRIME_BROWS = [[7, 5, 'k'], [8, 5, 'k'], [9, 6, 'k'], [11, 6, 'k'], [12, 5, 'k'], [13, 5, 'k']];
  const GRIME_MINI = A(`
    ...hhhh...
    ..hgggggg.
    .hgggggggg
    hggkgggkgg
    hgggkgkggg
    hggkgggkgg
    ggpggggpgg
    gGgggkkgGg
    .gGgggggg.
    ..GGgGGG..
  `);

  // ---- mold 곰팡이: green fuzzy puff
  const MOLD = A(`
    ................
    ................
    .......n.n......
    .....n.nmnn.n...
    ....nnmmmmmmn...
    ...nmmmmmmmmmn..
    ..nmmMmmmwwmww..
    ...mmmmmmwkmwkm.
    ..nmMmmmmwkmwkm.
    ..mmmmmmmmmmmmn.
    .nmmmMmmmmkkmm..
    ..mmmmmmMmmmmmn.
    ..nMmmMmmmmMmm..
    ...MmMMmMMmMM...
    ....M..M..M.....
    ................
  `);
  const MOLD1 = ['................', '................'].concat(
    A(`
      ......n..n.n....
      ....n.nmmnmn.n..
      ...nnmmmmmmmmn..
      ..nmmMmmmwwmww..
      ..nmmmmmmwkmwkm.
      .nmmMmmmmwkmwkm.
      .nmmmmMmmmkkmmn.
      .mmMmmmmMmmmmmmn
      ..nMmmMmmmmMmMm.
      ..MMmMMmMMmMMM..
      ...M..M..M..M...
      ................
    `),
    ['................', '................']);
  const MOLD_BROWS = [[8, 5, 'k'], [9, 5, 'k'], [10, 6, 'k'], [12, 6, 'k'], [13, 5, 'k'], [14, 5, 'k']];
  const MOLD_MINI = A(`
    ..n.nn.n..
    .nmmmmmmn.
    nmmmmmmmmn
    mmmkmmmkmm
    nmmmkmkmmn
    mmmkmmmkmm
    nmpmmmmpmn
    mmMmmkkmMm
    .mmMmmmMm.
    ..M.MM.M..
  `);

  // ---- fly 날파리: drain fly — big fuzzy wings, red eye, tiny legs
  const FLY0 = A(`
    ................
    ...aa...........
    ..aWWa..aa......
    .aWWWWa.aWa.....
    .aWWWWWaWWWa....
    ..aWWWWaWWWa..a.
    ...aWWWaWWa..a..
    ....aaaaaa.ddd..
    ...ddddddddRRRd.
    ..dadadaddRRwRd.
    ..dadadaddRRRRd.
    ...ddddddddRRd..
    ....dddddddd....
    .....a..a..a....
    ....a..a..a.....
    ................
  `);
  const FLY1 = A(`
    ................
    ................
    ................
    ................
    ................
    ..aaaa........a.
    .aWWWWaaa....a..
    .aWWWWWWWa.ddd..
    ..aWWWWWWadRRRd.
    ..dadadaddRRwRd.
    ..dadadaddRRRRd.
    ...ddddddddRRd..
    ....dddddddd....
    .....a..a..a....
    ....a..a..a.....
    ................
  `);
  const FLY_MINI = A(`
    ..aWWWWa..
    .aWWWaWWa.
    aWWWWaWWWa
    dddwdddwdd
    ddddwdwddd
    dadwdddwad
    ddaddddadd
    .dddpdddd.
    ..dddddd..
    ...a..a...
  `);

  // ---- sponge 수세미: scrub layer on top, coral sponge body
  const SPONGE = A(`
    ................
    ................
    ................
    ..bBbbBbbBbbBb..
    ..BbbBbbBbbBbb..
    ..bbBbbBbbBbbB..
    ..sssssskkskks..
    ..sSsssswkswks..
    ..ssssSswkswks..
    ..sSssssssssSs..
    ..ssssSsskkkks..
    ..sssSssssSsss..
    ..SSSSSSSSSSSS..
    ...SS.....SS....
    ..SSS....SSS....
    ................
  `);
  const SPONGE1 = shiftY(SPONGE.slice(0, 13).concat(['................', '................', '................']), 1)
    .map((r, i) => (i === 14 ? '....SSS.SSS.....' : r));
  const SPONGE_BROWS = [[8, 6, 's'], [9, 6, 'k'], [11, 6, 'k'], [12, 6, 's'], [8, 5, 'k'], [12, 5, 'k']];
  const SPONGE_MINI = A(`
    .bBbBbBbB.
    bBbBbBbBbB
    ssssssssss
    sSskssskss
    sssskskSss
    sSskssskss
    ssssssssSs
    sssSskksss
    SsssssssSS
    .SSSSSSSS.
  `);

  const ANGRY = {
    grime: { g: 'R', G: 'r', h: 'p' },
    mold: { m: 'R', M: 'r', n: 'p' },
    fly: { d: 'r', a: 'q', W: 'P', R: 'L' },
    sponge: { s: 'R', S: 'r', b: 'p', B: 'q' },
  };
  const XEYE = (x, y, under) => [
    [x, y, 'k'], [x + 1, y, under], [x + 2, y, 'k'],
    [x, y + 1, under], [x + 1, y + 1, 'k'], [x + 2, y + 1, under],
    [x, y + 2, 'k'], [x + 1, y + 2, under], [x + 2, y + 2, 'k'],
  ];
  const DEAD = {
    grime: put(GRIME, [...XEYE(7, 6, 'g'), ...XEYE(11, 6, 'g'), [9, 10, 'k'], [10, 10, 'p'], [11, 10, 'k'], [10, 11, 'p']]),
    mold: put(MOLD, [...XEYE(8, 6, 'm'), ...XEYE(12, 6, 'm'), [10, 10, 'k'], [11, 10, 'p'], [11, 11, 'p']]),
    fly: put(FLY0, [...XEYE(11, 8, 'R')]),
    sponge: put(SPONGE, [...XEYE(7, 6, 's'), ...XEYE(11, 6, 's'), [9, 10, 'k'], [10, 10, 'p'], [11, 10, 'p'], [12, 10, 'k'], [10, 11, 'p']]),
  };
  const ENEMY = {
    grime: { f: [GRIME, GRIME1], brows: GRIME_BROWS, mini: GRIME_MINI },
    mold: { f: [MOLD, MOLD1], brows: MOLD_BROWS, mini: MOLD_MINI },
    fly: { f: [FLY0, FLY1], brows: [], mini: FLY_MINI },
    sponge: { f: [SPONGE, SPONGE1], brows: SPONGE_BROWS, mini: SPONGE_MINI },
  };
  for (const T of Object.keys(ENEMY)) {
    const e = ENEMY[T];
    SPR[T + '_walk'] = e.f.map((f) => outline(f));
    SPR[T + '_angry'] = e.f.map((f, i) => {
      let a = recolor(f, ANGRY[T]);
      // brows follow the body when it bobs (frame 1 of grime/mold is shifted)
      const dy = (T === 'grime' && i === 1) ? 1 : (T === 'mold' && i === 1) ? -1 : (T === 'sponge' && i === 1) ? 1 : 0;
      a = put(a, e.brows.map(([x, y, ch]) => [x, y + dy, ch === 's' ? 'R' : ch]));
      return outline(a);
    });
    const mini = outline(['..........'].concat(e.mini, ['..........']).map((r) => '.' + r + '.'));
    const m0 = stamp(blank(16, 16), mini, 2, 2);
    const m1 = stamp(blank(16, 16), mini, 2, 1);
    SPR[T + '_trapped'] = [bubbleWith(m0, 200, ST_TRAP), bubbleWith(m1, 20, ST_TRAP)];
    SPR[T + '_dead'] = [outline(flipV(DEAD[T]))];
  }

  // ================================================================== ITEMS (snacks)
  const ITEMS = {
    tangerine: A(`
      ................
      ................
      .......M........
      ......Mmm.......
      ....OOoMmmm.....
      ...OOOOOOOOO....
      ..OLLOOOOOOOO...
      ..OLOOOOOoOOOo..
      ..OOOOOOOOOOOo..
      ..OOOOoOOOOOOo..
      ..OOOOOOOOOoOo..
      ..oOOOOOOOOOoo..
      ...oOOOOOOOoo...
      ....oooooooo....
      ................
      ................
    `),
    yogurt: A(`
      ................
      ......RRRR......
      .....RwRRRR.....
      .....rrrrrr.....
      ......EEEE......
      .....EwEEEW.....
      ....EwEEEEEW....
      ....EwEEEEEW....
      .....EwEEEW.....
      .....EwEEEW.....
      ....EwpppppW....
      ....EwpPpppW....
      ....EEpppppW....
      ....EEEEEEEW....
      .....WWWWWW.....
      ................
    `),
    egg: A(`
      ................
      ................
      ......ffff......
      .....fhhfff.....
      ....fhhffffF....
      ....fhfffffF....
      ...ffhffFfffF...
      ...ffffffffFF...
      ...ffFfffffFF...
      ...ffffffFffF...
      ...fffffffffF...
      ....fffFffFF....
      ....FfffffFF....
      .....FFFFFF.....
      ................
      ................
    `),
    banana_milk: A(`
      ................
      ..........R.....
      .........w......
      ........R.......
      ......WwWWW.....
      ......LLLLL.....
      .....LLLLLLL....
      ...LLLLLLLLLLL..
      ..LwLLLLLLLLFLY.
      ..LwLLLLLLLYyLY.
      ..LLLLLLLYYyLLY.
      ..LLLLYYYyLLLLY.
      ..LLLLLyyLLLLYY.
      ...LLLLLLLLLYY..
      ....YYYYYYYYY...
      ................
    `),
    sikhye: A(`
      ................
      ..........R.....
      ..........w.....
      ..cccccccccRcc..
      ..cEEwEEEEwREc..
      ..cwEEEwEEEEEc..
      ..cwEEEEEwEEEc..
      ...cwEwEEEEEc...
      ...cwEEEEwEEc...
      ...cEEEwEEEEc...
      ...cEEEEEEwEc...
      ....cEwEEEEc....
      ....cEEEEwEc....
      ....cccccccc....
      .....WWWWWW.....
      ................
    `),
    icecream: A(`
      ................
      ......pppp......
      .....pPPpppq....
      ....pPPppppqq...
      ....ppppppppq...
      ...EEqppppqqEE..
      ..EwwEqqqqEEEEW.
      ..EwEEEEEEEEEEW.
      ...EEEEEEEEEWW..
      ...ffffffffff...
      ....fFfFfFfF....
      ....fffffffF....
      .....FfFfFf.....
      ......ffFf......
      .......fF.......
      ................
    `),
    watermelon: A(`
      ................
      .......RR.......
      ......RpRR......
      ......pRkR......
      .....RpRRRR.....
      .....RRRRkR.....
      ....RRkRRRRR....
      ....RRRRRRRR....
      ...RRRRRRkRRR...
      ...RkRRRRRRRR...
      ..RRRRRkRRRkRR..
      ..RRRRRRRRRRRR..
      ..nnnnnnnnnnnn..
      ..mmmmmmmmmmmm..
      ...MMMMMMMMMM...
      ................
    `),
    towel_hat: A(`
      ................
      ................
      .....PPPPPP.....
      ....PPwPPPPP....
      ...PPwPPPPPPP...
      ..PPPPPPPPPPPp..
      ..qqqqqqqqqqqq..
      .PPPPEEEEEEPPPp.
      .PqqPEkEEkEPqqp.
      .PqPPpEEEEpPPqp.
      .PPqpEEkkEEpqPp.
      ..pp.EEEEEE.pp..
      ......EEEE......
      ................
      ................
      ................
    `),
  };
  for (const k of Object.keys(ITEMS)) SPR['item_' + k] = [outline(ITEMS[k])];

  // ================================================================== STEAM
  // steam bubble: warm pink film with three rising wavy steam lines over a little basin (온천 마크)
  function steamBubble(ph) {
    const g = G(blank(16, 16));
    const WAVE = ph ? [1, 1, 0, 0, 1, 1, 0] : [0, 1, 1, 0, 0, 1, 1];
    for (let i = 0; i < 3; i++) {
      for (let y = 3; y <= 9; y++) g[y][4 + i * 3 + WAVE[y - 3]] = y < 5 ? 'W' : 'w';
    }
    g[10][3] = 'c'; g[10][12] = 'c'; g[11][4] = 'c'; g[11][11] = 'c';
    for (let x = 5; x <= 10; x++) g[12][x] = 'c';
    return bubbleWith(S(g), ph ? 40 : 220, ST_STEAM);
  }
  SPR.steam_bubble = [steamBubble(0), steamBubble(1)];

  // steam bolt: puffy cloud lit from above, travelling right, with speed streaks behind
  function cloud(circles, wisps) {
    const g = G(blank(16, 16));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let best = 99, cy = 0, cr = 1;
      for (const [ccx, ccy, r] of circles) {
        const dn = Math.hypot(x - ccx, y - ccy) / r;
        if (dn < best) { best = dn; cy = ccy; cr = r; }
      }
      if (best <= 1) g[y][x] = best > 0.8 ? 'c' : (y - cy) > cr * 0.25 ? 'W' : 'w';
    }
    for (const [x, y, ch] of wisps) if (g[y][x] === '.') g[y][x] = ch;
    return outline(S(g), 'C');
  }
  SPR.steam_bolt = [
    cloud([[11, 8, 4.1], [6.6, 6.8, 3.0], [6.2, 10.2, 2.4], [3.2, 8.6, 1.8]],
      [[0, 6, 'c'], [1, 6, 'c'], [0, 11, 'c'], [1, 11, 'c'], [2, 11, 'c']]),
    cloud([[11, 7.6, 4.3], [7, 10, 3.0], [6.4, 6, 2.5], [3, 8, 1.9]],
      [[0, 5, 'c'], [1, 5, 'c'], [2, 5, 'c'], [0, 11, 'c'], [1, 11, 'c']]),
  ];

  // ================================================================== TILES (8x8)
  SPR.tile_0 = [A(`
    XXXXXXXz
    XwwxxxXz
    Xwxxxxjz
    Xxxxxxjz
    Xxxxxxjz
    Xxxxxxjz
    Xjjjjjjz
    zzzzzzzz
  `)];
  SPR.tile_1 = [A(`
    PPPPPPPz
    Pwppppqz
    PpppPpqz
    PppPppqz
    PpPpppqz
    Ppppppqz
    Pqqqqqqz
    zzzzzzzz
  `)];
  SPR.tile_2 = [A(`
    ccuzccuz
    cubzuubz
    ubbzubbz
    zzzzzzzz
    ccuzccuz
    uubzcubz
    ubbzubbz
    zzzzzzzz
  `)];
  SPR.tile_3 = [A(`
    LLLLLLLz
    Lwllllyz
    yyyyyyyz
    zzzzzzzz
    LLLzLLLL
    llyzLwll
    yyyzyyyy
    zzzzzzzz
  `)];
  SPR.tile_4 = [A(`
      wwwwwwwz
      wWWWWaWz
      wWWWaWWz
      wWWaWWWz
      wWaWWWWz
      wWaWWWaz
      waWWWaWz
      zzzzzzzz
    `)];

  // ================================================================== HUD
  SPR.life = [outline(A(`
      ........
      ..LYY...
      .LYYkY..
      .YYYkYO.
      .YpYYOo.
      ..YYYY..
      ........
      ........
    `))];

  // ================================================================== V2 HELPERS (big / procedural sprites)
  const grid = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
  const rowsOf = (g) => g.map((r) => r.join(''));
  function hash2(x, y, s) {
    let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((s | 0) + 1, 1442695041)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  const px = (g, x, y, ch) => { if (g[y] && g[y][x] !== undefined) g[y][x] = ch; };
  const pxIf = (g, x, y, ch) => { if (g[y] && g[y][x] === '.') g[y][x] = ch; };
  // ASCII patch onto a grid ('.' = keep what is there); map recolours characters
  function patch(g, rows, ox, oy, map) {
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) {
        let ch = r[x];
        if (ch === '.') continue;
        if (map && map[ch] !== undefined) ch = map[ch];
        px(g, x + ox, y + oy, ch);
      }
    });
  }
  const mirror = (rows) => rows.map((r) => r.split('').reverse().join(''));
  // Union of ellipses [cx, cy, rx, ry] lit from the upper left. Every pixel takes its light from the lump it is
  // deepest inside, so each lump gets its own rim highlight / shade; the bottom silhouette gets the deep tone.
  function blob(g, lumps, tone) {
    const H = g.length, W = g[0].length, mask = Array.from({ length: H }, () => Array(W).fill(false));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let best = 9, bx = 0, by = 0;
        for (const [cx, cy, rx, ry] of lumps) {
          const dx = (x - cx) / rx, dy = (y - cy) / (ry || rx), dn = Math.hypot(dx, dy);
          if (dn < best) { best = dn; bx = dx; by = dy; }
        }
        if (best > 1) continue;
        mask[y][x] = true;
        const k = best || 1, lit = -(bx / k) * 0.5 - (by / k) * 0.86;
        let ch = tone.base;
        if (best > 0.6 && lit > 0.42) ch = tone.hi;
        else if (best > 0.64 && lit < -0.5) ch = tone.sh;
        g[y][x] = ch;
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!mask[y][x]) continue;
        if (!(mask[y + 1] && mask[y + 1][x])) g[y][x] = tone.deep;
        else if (!(mask[y + 2] && mask[y + 2][x]) && g[y][x] === tone.base) g[y][x] = tone.sh;
      }
    }
    return mask;
  }
  // scale2x (EPX) — used to upsample before rotating so edges stay clean
  function scale2x(rows) {
    const h = rows.length, w = rows[0].length, out = [];
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : rows[y][x]);
    for (let y = 0; y < h; y++) {
      let r0 = '', r1 = '';
      for (let x = 0; x < w; x++) {
        const P = rows[y][x], a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), d = at(x, y + 1);
        r0 += (c === a && c !== d && a !== b ? a : P) + (a === b && a !== c && b !== d ? b : P);
        r1 += (d === c && d !== b && c !== a ? c : P) + (b === d && b !== a && d !== c ? d : P);
      }
      out.push(r0, r1);
    }
    return out;
  }
  // rotate pixel art clockwise by deg about (cx, cy) (default: centre), sampling an 8x EPX upscale
  function rotSprite(rows, deg, cx, cy) {
    const h = rows.length, w = rows[0].length, big = scale2x(scale2x(scale2x(rows)));
    const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    if (cx === undefined) { cx = w / 2; cy = h / 2; }
    const out = [];
    for (let y = 0; y < h; y++) {
      let r = '';
      for (let x = 0; x < w; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const sx = c * dx + s * dy + cx, sy = -s * dx + c * dy + cy;
        const bx = Math.floor(sx * 8), by = Math.floor(sy * 8);
        r += by >= 0 && by < h * 8 && bx >= 0 && bx < w * 8 ? big[by][bx] : '.';
      }
      out.push(r);
    }
    return out;
  }
  const SWEAT = A(`
    .c.
    ccc
    cwc
    .c.
  `);
  // '>' squeezed-shut eye (mirror for '<')
  const SQUINT = A(`
    kk....
    .kkk..
    ...kk.
    .kkk..
    kk....
  `);

  // ================================================================== BOSS 1 왕때꼬마 (king grime)
  // Huge lumpy grime with googly eyes, heavy brows, a snaggle-toothed frown and a tiny crown of soap scum.
  const KG_EYE = A(`
    .kkkk.
    kwwwwk
    kwwwwk
    kwwkkk
    kwwkkk
    .kkkk.
  `);
  const KG_CROWN = A(`
    c...c...c
    E..EEE..E
    EE.EEE.EE
    EEEEEEEEE
    WEWWEWWEW
    .W..W..W.
  `);
  const KG_POSE = {
    idle0: { L: [[16, 21, 13.4, 8.6], [10.5, 14.5, 6.4, 6.2], [18.5, 12.5, 7.4, 7.1], [25, 17, 5.2, 5], [5.4, 20, 4.4, 4.4]],
      fy: 0, crown: [14, 1], feet: [[8, 29, 5, 2], [20, 29, 5, 2]], drips: [[6, 2], [26, 2]] },
    idle1: { L: [[16, 21.4, 13.9, 8.2], [10.4, 15.3, 6.6, 5.9], [18.5, 13.4, 7.6, 6.8], [25.2, 17.6, 5.3, 4.8], [5.1, 20.4, 4.5, 4.3]],
      fy: 1, crown: [14, 2], feet: [[8, 29, 5, 2], [20, 29, 5, 2]], drips: [[6, 1], [26, 3]] },
    jump: { L: [[16, 19.4, 12.4, 8.4], [10.8, 13.6, 6, 6.2], [18.5, 11.8, 7, 7.1], [24.6, 16, 5, 5], [6, 18.6, 4, 4.2]],
      fy: -1, crown: [14, 0], feet: [[9, 27, 4, 4], [20, 27, 4, 4]], drips: [[7, 3], [25, 4], [15, 2]] },
    hurt: { L: [[15, 22, 14, 7.6], [9.6, 16.4, 6.6, 5.6], [17.5, 15, 7.6, 6.4], [24, 19, 5.4, 4.6], [4.6, 21.5, 4.2, 4]],
      fy: 3, ox: -1, crown: [18, 0], feet: [[6, 29, 6, 2], [19, 29, 6, 2]], drips: [[5, 1], [25, 2]] },
  };
  function kingGrime(pose) {
    const P = KG_POSE[pose], g = grid(32, 32), ox = P.ox || 0, ey = 12 + P.fy;
    for (const [fx, fy, fw, fh] of P.feet) {
      for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) px(g, x, y, y === fy + fh - 1 ? 'H' : 'G');
    }
    const mask = blob(g, P.L, { hi: 'h', base: 'g', sh: 'G', deep: 'H' });
    // grime specks and clumps
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        if (g[y][x] !== 'g') continue;
        const r = hash2(x, y, 3);
        if (r < 0.07) { g[y][x] = 'G'; if (r < 0.025 && g[y][x + 1] === 'g') g[y][x + 1] = 'G'; } else if (r > 0.965) g[y][x] = 'h';
      }
    }
    // drips hanging from the bottom silhouette
    for (const [dx, len] of P.drips) {
      let by = -1;
      for (let y = 31; y >= 0; y--) if (mask[y][dx]) { by = y; break; }
      if (by < 0) continue;
      for (let i = 1; i <= len; i++) px(g, dx, by + i, i === len ? 'H' : 'G');
    }
    if (pose === 'hurt') {
      patch(g, SQUINT, 15 + ox, ey);
      patch(g, mirror(SQUINT), 22 + ox, ey);
      patch(g, A(`
        .kk..kk..k
        k..kk..kk.
      `), 17 + ox, 20 + P.fy);
    } else {
      patch(g, KG_EYE, 15 + ox, ey);
      patch(g, KG_EYE, 22 + ox, ey);
      // heavy grumpy brows, inner ends low (they cut into the eye tops)
      const brow = [[14, -3], [15, -3], [14, -2], [15, -2], [16, -2], [17, -2], [16, -1], [17, -1], [18, -1], [19, -1], [20, -1], [19, 0], [20, 0]];
      for (const [bx, by] of brow) { px(g, bx + ox, ey + by, 'k'); px(g, 42 - bx + ox, ey + by, 'k'); }
      if (pose === 'jump') {
        patch(g, A(`
          .kkkkk.
          kwkwkwk
          kkrrrkk
          kkrRrkk
          .kkkkk.
        `), 18 + ox, 19 + P.fy);
      } else {
        patch(g, A(`
          ..kkkkkkk..
          .k...w...k.
          k....w....k
        `), 16 + ox, 20 + P.fy);
      }
    }
    // crown of soap scum (knocked off and tilted when hurt)
    if (pose === 'hurt') {
      const pad = grid(13, 11).map((r) => r.join(''));
      const c = rotSprite(stampRows(pad, KG_CROWN, 2, 2), 24);
      patch(g, c, P.crown[0], P.crown[1]);
    } else patch(g, KG_CROWN, P.crown[0], P.crown[1]);
    let rows = outline(rowsOf(g));
    if (pose === 'hurt') { const h = G(rows); patch(h, SWEAT, 28, 8); patch(h, SWEAT, 3, 7); rows = S(h); }
    return rows;
  }
  function stampRows(base, top, ox, oy) { return stamp(base, top, ox, oy); }
  SPR.boss_grime_idle = [kingGrime('idle0'), kingGrime('idle1')];
  SPR.boss_grime_jump = [kingGrime('jump')];
  SPR.boss_grime_hurt = [kingGrime('hurt')];

  // ================================================================== BOSS 2 곰팡이 여왕 (mold queen)
  // Fuzzy green puff with lashes and lipstick, a crown of violet spore-stalks and a frilly two-tier skirt.
  const MQ_EYE_L = A(`
    k.k...
    .kkkk.
    kkwwwk
    kwwkkk
    kwwkkk
    .kkkk.
  `);
  const MQ_EYE_R = A(`
    ...k.k
    .kkkk.
    kwwwkk
    kwwkkk
    kwwkkk
    .kkkk.
  `);
  function moldQueen(pose, f) {
    const g = grid(32, 32);
    const SH = pose === 'shoot', HU = pose === 'hurt';
    const cx = 15.5, cy = 14.5 + (HU ? 1.5 : 0) + (f ? 0.5 : 0), r = SH ? 10 : 9.4, ry = HU ? 8.4 : r;
    const ph = f + (SH ? 2 : 0) + (HU ? 1 : 0);
    // skirt: lower tier (deep violet), then upper tier (light violet), scalloped lace hems
    const SCALLOP = [0, 1, 2, 2, 1];
    const tier = (yTop, yBot, hw0, slope, base, pleat, lace) => {
      for (let x = 0; x < 32; x++) {
        const hemY = yBot + SCALLOP[(x + ph * 2 + 50) % 5] - (HU && Math.abs(x - cx) > 8 ? 1 : 0);
        for (let y = yTop; y <= hemY; y++) {
          const hw = hw0 + (y - yTop) * slope;
          if (Math.abs(x - cx) > hw) continue;
          let ch = (x + ph + 40) % 4 === 0 ? pleat : base;
          if (x - cx > hw - 1.6) ch = 'V';
          if (y === hemY) ch = lace;
          px(g, x, y, ch);
        }
      }
    };
    tier(23, 28, 8, 1.25, 'V', 'v', 'P');
    tier(20, 24, 6, 1.3, 'v', 'V', 'w');
    // fuzzy puff body
    const L = [[cx, cy, r, ry]];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + (f ? 0.2 : 0) + (SH ? 0.1 : 0);
      L.push([cx + Math.cos(a) * (r - 0.5), cy + Math.sin(a) * (ry - 0.5), 2.2, 2.2]);
    }
    blob(g, L, { hi: 'n', base: 'm', sh: 'M', deep: 'N' });
    // mold patches on the left / lower body
    for (const [dx, dy, w] of [[-7, -2, 2], [-5, 3, 3], [-2, 6, 2], [4, 7, 2], [-8, 4, 1], [-3, -6, 2]]) {
      for (let i = 0; i < w; i++) px(g, Math.round(cx + dx + i), Math.round(cy + dy), 'M');
      px(g, Math.round(cx + dx), Math.round(cy + dy + 1), 'N');
    }
    // crown: five spore stalks fanning from the top of the head
    const ANG = HU ? [-80, -46, -8, 34, 70] : [-58, -29, 0, 29, 58];
    ANG.forEach((deg, i) => {
      const a = ((deg - 90) * Math.PI) / 180, len = i === 2 ? 4 : 3;
      const bx = cx + Math.cos(a) * (ry - 1.2), by = cy + Math.sin(a) * (ry - 1.2);
      let tx = bx, ty = by;
      for (let s = 1; s <= len; s++) { tx = bx + Math.cos(a) * s; ty = by + Math.sin(a) * s + (HU ? s * 0.45 : 0); px(g, Math.round(tx), Math.round(ty), 'N'); }
      const hx = Math.round(tx + Math.cos(a) * 1.3) - 1, hy = Math.round(ty + Math.sin(a) * 1.3) - 1 + (f && i % 2 ? 1 : 0);
      const head = i === 2 ? A(`
        .vv.
        vPvv
        vvvV
        .VV.
      `) : A(`
        vPv
        vvV
        .V.
      `);
      patch(g, head, hx - (i === 2 ? 0 : 0), hy - (i === 2 ? 1 : 0), SH ? { v: 'P', P: 'w' } : null);
    });
    // face (looking right)
    const ex = 14, ey = Math.round(cy) - 5;
    if (HU) {
      patch(g, SQUINT, ex, ey + 1);
      patch(g, mirror(SQUINT), ex + 7, ey + 1);
      patch(g, A(`
        .q..q.
        q.qq.q
      `), ex + 4, ey + 8);
    } else {
      patch(g, MQ_EYE_L, ex, ey);
      patch(g, MQ_EYE_R, ex + 7, ey);
      if (SH) {
        patch(g, A(`
          .kkk.
          krrrk
          krRrk
          .kkk.
        `), ex + 5, ey + 7);
      } else {
        patch(g, A(`
          q...q
          .qRq.
        `), ex + 5, ey + 8);
      }
    }
    pts(g, [[ex, ey + 7, 'p'], [ex + 1, ey + 7, 'p'], [ex + 11, ey + 7, 'p'], [ex + 12, ey + 7, 'p']]);
    let rows = outline(rowsOf(g));
    if (HU) { const h = G(rows); patch(h, SWEAT, 28, 6); rows = S(h); }
    if (SH) { const h = G(rows); for (const [x, y] of [[29, 10], [30, 13], [28, 16]]) pxIf(h, x, y, 'n'); rows = S(h); }
    return rows;
  }
  function pts(g, list) { for (const [x, y, ch] of list) px(g, x, y, ch); }
  SPR.boss_mold_idle = [moldQueen('idle', 0), moldQueen('idle', 1)];
  SPR.boss_mold_shoot = [moldQueen('shoot', 0)];
  SPR.boss_mold_hurt = [moldQueen('hurt', 0)];

  // ================================================================== BOSS 3 대왕 수세미 (mega sponge)
  // Massive coral sponge block with a blue scrub layer, pores, furious brows and gritted teeth.
  function megaSponge(pose, f) {
    const g = grid(32, 32);
    const CH = pose === 'charge', HU = pose === 'hurt';
    let x0 = 3, x1 = 28, y0 = 6;
    const y1 = 27;
    if (pose === 'idle' && f) { x0 = 2; x1 = 29; y0 = 7; }
    if (HU) { x0 = 2; x1 = 29; y0 = 10; }
    if (CH) { x0 = 3; x1 = 26; y0 = 7; }
    const lean = CH ? 3 : 0;
    const sh = (y) => Math.round((lean * (y1 - y)) / (y1 - y0)) - (HU && y < y0 + 4 ? 1 : 0);
    const L = (X, Y, ch) => px(g, X + sh(Y), Y, ch);
    const R = 3;
    const inBox = (X, Y) => {
      if (X < x0 || X > x1 || Y < y0 || Y > y1) return false;
      const qx = X < x0 + R ? x0 + R : X > x1 - R ? x1 - R : X, qy = Y < y0 + R ? y0 + R : Y > y1 - R ? y1 - R : Y;
      return Math.hypot(X - qx, Y - qy) <= R + 0.3;
    };
    const sEnd = y0 + 7; // last scrub row
    // feet (behind)
    const feet = CH ? (f ? [[x0 + 1, 3], [x1 - 7, 4]] : [[x0 + 3, 3], [x1 - 5, 4]]) : [[x0 + 5, 3], [x1 - 9, 3]];
    for (const [fx, fh] of feet) {
      for (let y = y1 + 1; y <= Math.min(30, y1 + fh); y++) for (let x = fx; x < fx + 5; x++) L(x, y, y === Math.min(30, y1 + fh) ? 'Q' : x === fx ? 'Z' : 'S');
    }
    for (let Y = 0; Y < 32; Y++) {
      for (let X = 0; X < 32; X++) {
        if (!inBox(X, Y)) continue;
        let ch;
        if (Y <= sEnd) {
          ch = (X - Y + 60) % 3 === 0 ? 'B' : 'b';
          if (Y === y0 || (Y === y0 + 1 && (X < x0 + 3))) ch = X % 2 ? 'u' : 'b';
          if (X >= x1 - 1 && Y > y0) ch = 'B';
          if (Y === sEnd) ch = 'B';
        } else {
          ch = 's';
          if (X <= x0 + 1 || Y === sEnd + 1) ch = 'Z';
          if (X >= x1 - 1) ch = 'S';
          if (Y >= y1 - 1) ch = Y === y1 ? 'Q' : 'S';
        }
        L(X, Y, ch);
      }
    }
    // scrub fibres poking up
    for (let X = x0 + 2; X <= x1 - 2; X++) if (hash2(X, 1, 7 + f) < 0.3) L(X, y0 - 1, X < x0 + 8 ? 'u' : 'b');
    // pores (relative to the coral top-left)
    const cy0 = sEnd + 1;
    const PORES = HU
      ? [[3, 2, 2, 1], [5, 6, 1, 1], [2, 9, 2, 1], [7, 11, 3, 1], [12, 13, 2, 1], [23, 11, 2, 1], [25, 5, 1, 2], [18, 13, 1, 1]]
      : [[3, 2, 2, 1], [6, 6, 1, 1], [3, 9, 2, 2], [8, 13, 3, 1], [13, 14, 2, 1], [23, 13, 2, 1], [24, 4, 1, 2], [19, 16, 1, 1], [6, 16, 2, 1], [16, 10, 1, 1]];
    for (const [qx, qy, w, h] of PORES) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cy0 + qy + y < y1 - 1) L(x0 + qx + x, cy0 + qy + y, 'Q');
      if (cy0 + qy + h < y1 - 1) for (let x = 0; x < w; x++) L(x0 + qx + x, cy0 + qy + h, 'Z');
    }
    // face
    const fx = x0 + (CH ? 12 : 11), fy = cy0 + 1;
    if (HU) {
      patch(g, SQUINT, fx + sh(fy), fy);
      patch(g, mirror(SQUINT), fx + 8 + sh(fy), fy);
      patch(g, A(`
        ..kkkk..
        .kkrrkk.
        kk.kk.kk
      `), fx + 3 + sh(fy + 7), fy + 7);
    } else {
      const eye = CH ? A(`
        kkkkkk
        kwwkkk
        kwwkkk
        .kkkk.
      `) : A(`
        .kkkk.
        kwwwwk
        kwwkkk
        kwwkkk
        .kkkk.
      `);
      patch(g, eye, fx + sh(fy), fy);
      patch(g, eye, fx + 8 + sh(fy), fy);
      // furious brows (2px thick) slanting down to the middle, starting on the scrub layer
      for (let i = 0; i < 7; i++) {
        const by = fy - 3 + Math.floor(i / 2) + (CH ? 1 : 0);
        for (const t of [0, 1]) { L(fx - 1 + i, by + t, 'k'); L(fx + 14 - i, by + t, 'k'); }
      }
      patch(g, A(`
        .kkkkkkkkk.
        kwkwkwkwkwk
        kkkkkkkkkkk
        kwkwkwkwkwk
        .kkkkkkkkk.
      `), fx + 2 + sh(fy + 7), fy + 7, CH ? null : null);
    }
    let rows = outline(rowsOf(g));
    const h = G(rows);
    if (CH) {
      // speed lines behind + dust kicked up at the back foot
      const lines = f ? [[9, 4], [15, 6], [21, 3]] : [[11, 5], [17, 4], [23, 6]];
      for (const [ly, len] of lines) for (let i = 0; i < len; i++) pxIf(h, i + (f ? 0 : 1), ly, i === len - 1 ? 'w' : 'W');
      for (const [x, y] of f ? [[1, 29], [2, 28], [0, 28], [1, 27]] : [[2, 29], [1, 28], [3, 28], [0, 29]]) pxIf(h, x, y, 'W');
    }
    if (HU) { patch(h, SWEAT, 28, 4); patch(h, SWEAT, 1, 6); }
    return S(h);
  }
  SPR.boss_sponge_idle = [megaSponge('idle', 0), megaSponge('idle', 1)];
  SPR.boss_sponge_charge = [megaSponge('charge', 0), megaSponge('charge', 1)];
  SPR.boss_sponge_hurt = [megaSponge('hurt', 0)];

  // ================================================================== BOSS 4 이태리 타올 대마왕 (towel king)
  // Giant green scrub mitt with a royal cape-cuff (crimson, gold trim), slanted glowing eyes and a jagged grin.
  // slanted, glowing yellow eyes with red pupils (both looking right) under thick sloping lids
  const TK_EYE_L = A(`
    kkk....
    .kkkkk.
    .kLLRrk
    ..kLRk.
    ...kk..
  `);
  const TK_EYE_R = A(`
    ....kkk
    .kkkkk.
    kLLRrk.
    .kLRk..
    ..kk...
  `);
  const TK_GRIN = A(`
    k............k
    kk..........kk
    .kkkkkkkkkkkk.
    .kwwkwwkwwkwwk
    ..kwkkwkkwkkwk
    ...kkkkkkkkkk.
  `);
  function towelKing(pose, f) {
    const g = grid(32, 32);
    const HU = pose === 'hurt', SW = pose === 'swoop', ph = f + (SW ? 1 : 0);
    const top = HU ? 6 : 3;
    const inPalm = (x, y) => x >= 6 && x <= 22 && y >= top && y <= 23 &&
      (y >= 10 || ((x - 14) / 8.6) ** 2 + ((y - 10) / (10.4 - top)) ** 2 <= 1) &&
      !(HU && y < 9 && x >= 12 && x <= 13);
    const thY = HU ? 13 : 11;
    const inThumb = (x, y) => ((x - 25.6) / 2.3) ** 2 + ((y - thY) / 4.6) ** 2 <= 1 || (y >= thY + 2 && y <= thY + 6 && x >= 22 && x <= 25);
    const inM = (x, y) => x >= 0 && y >= 0 && x < 32 && y < 32 && (inPalm(x, y) || inThumb(x, y));
    // cape-cuff first, so the mitt overlaps its top: flares out and trails further on the left (behind him)
    const flare = SW ? 1.4 : 0.8;
    for (let y = 22; y <= 30; y++) {
      const l = Math.round(5 - (y - 22) * flare - (f ? 0.5 : 0)), rr = Math.round(23 + (y - 22) * 0.45);
      for (let x = Math.max(0, l); x <= Math.min(31, rr); x++) {
        const tail = x < 7 ? Math.min(2, 7 - x) : 0;   // longer, pointed trailing edge
        const hem = 27 + tail + (((x + ph * 2 + 40) % 4) < 2 ? 1 : 0) - (HU && x < 12 ? 2 : 0);
        if (y > Math.min(30, hem)) continue;
        let ch = (x + ph + 40) % 4 === 1 ? 'R' : 'r';
        if (y <= 23) ch = y === 22 ? 'Y' : 'y';
        else if (y === Math.min(30, hem)) ch = 'Y';
        px(g, x, y, ch);
      }
    }
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        if (!inM(x, y)) continue;
        let ch = (x + y + ph) % 3 === 0 ? 'T' : 't';
        if (!inM(x - 1, y) || !inM(x, y - 1)) ch = 'm';
        if (!inM(x + 1, y) || !inM(x, y + 1)) ch = 'N';
        if (y >= 22) ch = y === 22 ? 'Y' : 'y';
        px(g, x, y, ch);
      }
    }
    // ruby clasp on the gold cuff band
    pts(g, [[14, 22, 'R'], [15, 22, 'R'], [14, 23, 'r'], [15, 23, 'r'], [14, 22, 'P']]);
    // menacing face
    const ey = HU ? 11 : 9;
    if (HU) {
      // smooth the scrub weave behind the flinching face so the squint and wobbly mouth stay readable
      for (let y = ey - 1; y <= ey + 9; y++) for (let x = 8; x <= 22; x++) if (g[y][x] === 'T') g[y][x] = 't';
      patch(g, SQUINT, 9, ey);
      patch(g, mirror(SQUINT), 16, ey);
      patch(g, A(`
        .kk..kk..kk.
        k..kk..kk..k
      `), 9, ey + 7);
    } else {
      patch(g, TK_EYE_L, 8, ey);
      patch(g, TK_EYE_R, 15, ey);
      if (SW) {
        patch(g, A(`
          .kkkkkkkkkk.
          kwkwkwkwkwkk
          kkrrrrrrrrkk
          kkrrRRRrrrkk
          kwkwkwkwkwkk
          .kkkkkkkkkk.
        `), 9, ey + 6);
      } else patch(g, TK_GRIN, 8, ey + 6);
    }
    let rows = outline(rowsOf(g));
    if (SW) rows = rotSprite(rows, 28, 15, 16);
    const h = G(rows);
    if (SW) for (const [x, y, n] of [[1, 4, 4], [3, 8, 3], [0, 12, 3]]) for (let i = 0; i < n; i++) pxIf(h, x + i, y - i, i === 0 ? 'W' : 'w');
    if (HU) { patch(h, SWEAT, 27, 3); patch(h, SWEAT, 3, 5); }
    return S(h);
  }
  SPR.boss_towel_idle = [towelKing('idle', 0), towelKing('idle', 1)];
  SPR.boss_towel_swoop = [towelKing('swoop', 0)];
  SPR.boss_towel_hurt = [towelKing('hurt', 0)];

  // ================================================================== GIANT BUBBLE (40x40, rim + sheen only)
  function giantBubble(phase, wob) {
    const g = grid(40, 40), cx = 19.5, cy = 19.5, rx = 18.9 + wob, ry = 18.9 - wob;
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry), a = angOf2(x, y, cx, cy), depth = (1 - d) * 18.9;
        if (depth >= 0 && depth < 1.7) {
          let ch = 'c';
          if (a > 5 && a < 115) ch = 'C';
          if (angDist(a, phase) < 13) ch = 'v';
          else if (angDist(a, phase + 150) < 11) ch = 'P';
          g[y][x] = ch;
        } else if (depth >= 2.4 && depth < 3.3 && a > 22 && a < 72) g[y][x] = 'C';       // inner reflection
        else if (depth >= 3.2 && depth < 4.4 && a > 196 && a < 246) g[y][x] = 'w';      // big glint arc
        else if (depth >= 3.4 && depth < 4.4 && angDist(a, 256) < 3.5) g[y][x] = 'w';   // glint dot
      }
    }
    return rowsOf(g);
  }
  function angOf2(x, y, cx, cy) { return ((Math.atan2(y - cy, x - cx) * 180) / Math.PI + 360) % 360; } // 0..360, 90 = down
  SPR.giant_bubble = [giantBubble(200, 0), giantBubble(330, 0.5)];

  // ================================================================== BOSS PROJECTILES & HAZARDS
  // spore: round violet spore ball bristling with pale-green mold hairs (it grows into mold); the hairs turn 45°
  SPR.spore = [A(`
    ...nn...
    ...kk...
    .kkvvkk.
    nkvPvVkn
    nkvvVVkn
    .kkVVkk.
    ...kk...
    ...nn...
  `), A(`
    n......n
    .nkkkkn.
    .kvvvVk.
    .kvPvVk.
    .kvvVVk.
    .kVVVVk.
    .nkkkkn.
    n......n
  `)];
  // shockwave: a tall crest of dust rolling RIGHT along the ground, leading edge bright, spray flying off the top
  SPR.shockwave = [A(`
    .........kkkk...
    .h......kEEWWk..
    .......kEWkkWEk.
    ......khEk..kEk.
    ..h..khgEk...k..
    ....khggEEk.....
    ..kkhgggggEk....
    kkhggGGGGGGEk...
  `), A(`
    ..........kkkk..
    ..h......kEEWWk.
    ........kEWWkkWk
    .h.....khEEk..kk
    ......khgEEk....
    ....kkhggEEEk...
    ..kkhhgggggEhk..
    kkhggGGGGGGGGEk.
  `)];
  // scald drop: frame0 = bead forming under the ceiling, frame1 = falling drop
  SPR.scald_drop = [A(`
    .kkkkkk.
    .krRRrk.
    ..kRPk..
    ..krRk..
    ...kk...
    ........
    ........
    ........
  `), A(`
    ...kk...
    ...kRk..
    ..krRrk.
    .krPRRrk
    .kRwRRrk
    .kRRRRrk
    ..krrrk.
    ...kkk..
  `)];
  // mini scrub mitts rained by the towel king (crimson cuff like their master)
  const MINI_MITT = A(`
    ................
    ................
    .....######.....
    ....########....
    ...#########.#..
    ...#########.##.
    ...############.
    ...###########..
    ...##########...
    ...##########...
    ...##########...
    ...YYYYYYYYYY...
    ...rrrRrrrRrr...
    ..rrRrrrRrrrRr..
    ................
    ................
  `);
  function miniMitt(f) {
    let m = MINI_MITT;
    if (f) m = m.map((r, y) => (y >= 3 && y <= 6 ? r.slice(0, 12) + (MINI_MITT[y + 1] || r).slice(12) : r));
    const g = G(m);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g[y][x] === '#') g[y][x] = (x + y + f) % 3 === 0 ? 'T' : 't';
    let s = S(g);
    s = put(s, [
      [4, 4, 'k'], [5, 5, 'k'], [6, 5, 'k'], [9, 5, 'k'], [10, 4, 'k'], [11, 4, 'k'] /* brows */,
      [5, 6, 'R'], [6, 6, 'L'], [9, 6, 'R'], [10, 6, 'L'] /* glowing eyes */,
      [5, 8, 'k'], [6, 9, 'k'], [7, 8, 'k'], [8, 9, 'k'], [9, 8, 'k'], [10, 9, 'k'] /* zigzag teeth line */,
      [6, 8, 'w'], [8, 8, 'w'],
    ]);
    const h = G(outline(s));
    for (const [x, y] of f ? [[6, 0], [9, 1], [12, 0]] : [[5, 1], [8, 0], [11, 1]]) h[y][x] = 'W';
    return S(h);
  }
  SPR.mini_mitt = [miniMitt(0), miniMitt(1)];

  // ================================================================== STAMP CARD
  // round red seal (도장) carved with a cream rubber-duck silhouette — the bathhouse's own mark
  // (head with eye and beak set off from the body by a notched neck, tail flick on the left)
  const SEAL = A(`
    ..RRRR..
    .RRREER.
    RRREkEOR
    RERREERR
    REEEEEER
    RREEEERR
    .RRRRRr.
    ..rrrr..
  `);
  SPR.stamp = [SEAL];
  // empty slot on the card: dim dashed circle
  SPR.stamp_empty = [A(`
    ..aa.a..
    .d....d.
    a......a
    ........
    a......a
    a......a
    .d....d.
    ..a.aa..
  `)];
  SPR.stamp_bubble = [0, 1].map((f) => bubbleWith(stamp(blank(16, 16), SEAL, 4, 4 + f), f ? 20 : 200, ST_BUBBLE));

  // ================================================================== POWER-UPS (목욕 용품)
  SPR.pw_shampoo = [(function () {
    const g = G(outline(A(`
      ................
      ........WWWWWa..
      ........Waaaa...
      .c.......Wa.....
      ........WWWa....
      ......pPPPPPq...
      .....pPwPPPPPq..
      .....pwPPPPPPq..
      .....pPwwwwwPq..
      .....pPwcCcwPq..
      .....pPwCwcwPq..
      .....pPwwwwwPq..
      .....pPPPPPPPq..
      .....ppPPPPPqq..
      ......qqqqqqq...
      ................
    `)));
    // little soap bubbles drifting off the bottle
    for (const [x, y, ch] of [[1, 5, 'c'], [2, 5, 'w'], [1, 6, 'C'], [2, 6, 'c'], [3, 9, 'c'], [2, 12, 'w']]) if (g[y][x] === '.') g[y][x] = ch;
    return S(g);
  })()];
  // a pair of rubber bath slippers seen from above, toes splayed in a V like a pair left at the bathhouse door:
  // pale footbed with a heel dimple, a broad glossy band over the instep, narrow heels — reads as "slippers" at 1x
  SPR.pw_slippers = [outline(A(`
    ................
    ................
    ..uuu......uuu..
    .uuwuu....uuwuu.
    .uuuuu....uuuuu.
    .BBBBBB..BBBBBB.
    .BccbBB..BccbBB.
    ..BBBBB..BBBBB..
    ..uuuuu..uuuuu..
    ..uuuub..uuuub..
    ...uuub..uuub...
    ...uaub..uaub...
    ...uuub..uuub...
    ...uuub..uuub...
    ....bb....bb....
    ................
  `))];
  SPR.pw_bathbomb = [(function () {
    const g = G(outline(A(`
      ................
      ................
      ................
      ......PPPP......
      ....PwwPPPPP....
      ...PwwPPPvPPp...
      ...PwPPPPPPXp...
      ..PPPPvPPPPPPp..
      ..PPPPPPPLPPPp..
      ..PXPPPPPPPvpp..
      ..pPPPPvPPPPpp..
      ...pPLPPPPXpp...
      ...ppPPPPPppp...
      ....ppppppp.....
      ................
      ................
    `)));
    // fizz: tiny bubbles and a sparkle above
    for (const [x, y, ch] of [[11, 1, 'c'], [12, 0, 'w'], [4, 1, 'c'], [7, 0, 'w'], [13, 3, 'L'], [14, 2, 'w']]) if (g[y][x] === '.') g[y][x] = ch;
    return S(g);
  })()];

  // ================================================================== SOAKED ENEMIES (불은 때: pink, steaming)
  const SOAK = { grime: { g: 'e', G: 'A', h: 'P' }, mold: { m: 'e', M: 'A', n: 'P' }, sponge: { s: 'e', S: 'A', b: 'v', B: 'A' } };
  for (const T of Object.keys(SOAK)) {
    SPR[T + '_soaked'] = ENEMY[T].f.map((fr, i) => {
      const h = G(outline(recolor(fr, SOAK[T])));
      // three staggered steam wisps drifting above the head (never touching the outline)
      for (const [x0, y0, ph] of [[3, 1, 0], [8, 0, 1], [12, 1, 0]]) {
        const a = (i + ph) % 2, wisp = [[x0 + a, y0, 'W'], [x0 + 1 - a, y0 + 1, 'w']];
        for (const [x, y, ch] of wisp) if (h[y] && h[y][x] === '.' && !(h[y + 1] && h[y + 1][x] === 'k')) h[y][x] = ch;
      }
      return S(h);
    });
  }

  // ================================================================== WATER, ICE, DRAIN, SHOWER
  // hot bath (온탕): teal water, rose surface sheen, steam glints. Body tiles seamlessly.
  SPR.water_hot = [A(`
    DDDDDDDD
    DDDDDDDD
    DJJDDDDD
    DDDDDDDD
    DDDDDDDD
    DDDDDJJD
    DDDDDDDD
    DDDDDDDD
  `)];
  // Surface rows: the two frames are the left / right halves of one 16-px wave. The engine shows frame (t + col),
  // so neighbouring cells always alternate and the wave reads as one continuous line that ripples sideways
  // every tick. Hot: rose-pink rolling crest over teal, warm reflections, wisps of steam rising above.
  const halves = (rows) => [rows.map((r) => r.slice(0, 8)), rows.map((r) => r.slice(8, 16))];
  SPR.water_hot_top = halves(A(`
    ...W.....W....w.
    ..pPPp......ppP.
    PPwPPPPppPPPPwPP
    pDppDDpppDDpDDpp
    DDDDDDpDDDDDDDDD
    DDDDDDDDDDDDDJJD
    DDDDDDDDDDDDDDDD
    DDJDDDDDDDDDDDDD
  `));
  // cold bath (냉탕): icy blue water, a crisp white crest line with frost glints (same two-halves wave as hot)
  SPR.water_cold = [A(`
    IIIIIIII
    IIIIIIII
    IbbIIIII
    IIIIIIII
    IIIIuIII
    IIIIIbbI
    IIIIIIII
    IIIIIIII
  `)];
  SPR.water_cold_top = halves(A(`
    .......i......w.
    .ii.......ciii..
    ciwiicccccciiwic
    IcIIccIIIIcIIcIc
    IIIIIIIIIIIIIIII
    IIIIuIIIIIIIIbbI
    IbbIIIIIIIIuIIII
    IIIIIIIIIIIIIIII
  `));
  // ice block: bevelled frozen cube — bright top/left faces, blue lower-right, glassy diagonal glints and a crack.
  // Opaque; the engine may draw a frozen enemy over it with alpha.
  SPR.ice_block = [(function () {
    const g = grid(16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if ((x === 0 || x === 15) && (y === 0 || y === 15)) continue;
        let ch;
        if (y === 0 || x === 0) ch = 'k';
        else if (y === 15 || x === 15) ch = 'k';
        else if (y === 1 || x === 1) ch = 'w';
        else if (y === 14 || x === 14) ch = 'C';
        else if (y === 2 || x === 2) ch = 'i';
        else if (y === 13 || x === 13) ch = 'u';
        else ch = x + y > 17 ? 'u' : 'c';
        g[y][x] = ch;
      }
    }
    // glassy diagonal glints, frost speckles and a hairline crack
    for (const [x, y] of [[3, 7], [4, 6], [5, 5], [6, 4], [7, 3], [4, 9], [5, 8], [6, 7], [7, 6], [8, 5], [9, 4], [10, 3], [11, 10], [12, 9]]) g[y][x] = x + y < 12 ? 'w' : 'i';
    for (const [x, y] of [[9, 12], [10, 11], [11, 12], [12, 11], [8, 12]]) g[y][x] = 'I';
    for (const [x, y] of [[4, 11], [10, 7], [7, 10]]) g[y][x] = 'i';
    return rowsOf(g);
  })()];
  // drain grate (배수구) for the floor wrap gap: chrome bars over a dark hole
  SPR.drain = [A(`
    WWWWWWWW
    akakakak
    Wkwkwkwk
    akakakak
    Wkwkwkwk
    akakakak
    dzdzdzdz
    zzzzzzzz
  `)];
  // showerhead / pipe mouth for the ceiling wrap gap (pipe from above, perforated face down)
  SPR.shower = [A(`
    ......aWWd......
    ......aWWd......
    .....kaWWdk.....
    ...kkaWWWWdkk...
    .kkaWWwwWWWWdkk.
    kaWWWWWWWWWWWWdk
    kdddddddddddddak
    .kzkzkzkzkzkzkk.
  `)];

  // ================================================================== V3 CHARACTERS (6 bathhouse animals)
  // Fill art only (the 1-px ink outline is added by outline()). Same ground line as the duck: rows 0..12 = upper
  // body, rows 13..14 = legs / feet, row 15 = the outline under the feet. Walk = contact, passing (body up 1 px,
  // longer legs), contact (other legs), passing. All characters face RIGHT.
  const pad16 = (rows) => rows.concat(blank(16, 16)).slice(0, 16);
  const onLegs = (top, legs) => pad16(top.concat(legs));              // top 13 rows + 2 leg rows
  const liftLegs = (top, legs3) => pad16(top.slice(1).concat(legs3)); // body up 1 px + 3 leg rows
  // breathing: the part above row `at` sinks 1 px into the body
  const breathe = (f, at) => [f[0]].concat(f.slice(0, at), f.slice(at + 1));
  // move the pixels inside the box [x0..x1] x [y0..y1] by dx (freed pixels become transparent)
  function shiftBox(rows, y0, y1, x0, x1, dx) {
    const g = G(rows), src = G(rows);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = '.';
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (src[y][x] !== '.' && g[y][x + dx] !== undefined) g[y][x + dx] = src[y][x];
    return S(g);
  }
  const CHAR_IDS = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'];
  const CH = {};

  // ---------------------------------------------------------------- capybara 까삐: boxy loaf, calm lidded eyes, yuzu
  (function () {
    const TOP = A(`
      ................
      ...........m....
      ..........YLY...
      ........F.yYy...
      ........fKKKKK..
      .......ffffffff.
      ...KKKKfffFFffH.
      ..KffffFffffkkH.
      .KffffffFfffpff.
      .fffffffffffffF.
      .ffffffffffffF..
      .FffffffffFFFF..
      ..FFFFFFFFFFF...
    `);
    const L = {
      stand: ['..FF.ff..FF.ff..', '..FF.ff..FF.ff..'],
      a: ['..FF.ff..FF.ff..', '.FF.ff....FF.ff.'],
      b: ['..FF.ff..FF.ff..', '...FF.ffFF.ff...'],
      p1: ['..FF.ff..FF.ff..', '..FF.ff..FF.ff..', '.....ff......ff.'],
      p2: ['..FF.ff..FF.ff..', '..FF.ff..FF.ff..', '..FF.....FF.....'],
      jump: ['..FF.ff..FF.ff..', '.FF..ff.FF..ff..', '................'],
      fall: ['..FF.ff..FF.ff..', '.FF...ff.FF...ff', '.F......F.......'],
    };
    const idle = onLegs(TOP, L.stand);
    CH.capy = {
      idle: [idle, breathe(idle, 9)],
      // the yuzu wobbles: it lags a pixel behind on one passing frame, the leaf flips on the other
      walk: [onLegs(TOP, L.a), shiftBox(liftLegs(TOP, L.p1), 0, 2, 9, 13, 1), onLegs(TOP, L.b), put(liftLegs(TOP, L.p2), [[11, 0, '.'], [10, 0, 'm']])],
      // jump: a happy ^ eye; fall: a round startled eye and an open mouth
      jump: liftLegs(put(TOP, [[10, 6, 'f'], [11, 6, 'f'], [12, 7, 'f'], [13, 7, 'f'], [11, 7, 'k'], [12, 6, 'k'], [13, 7, 'k']]), L.jump),
      fall: liftLegs(put(TOP, [[10, 6, 'w'], [11, 6, 'k'], [10, 7, 'k'], [11, 7, 'k'], [12, 7, 'f'], [13, 7, 'f'], [13, 10, 'k']]), L.fall),
      // blowing: eye squeezed to a '>', puffed pink cheek, pursed mouth
      shoot: put(idle, [[10, 6, 'f'], [11, 6, 'k'], [12, 7, 'k'], [13, 7, 'f'], [11, 8, 'k'], [12, 8, 'p'], [13, 8, 'p'], [12, 9, 'k'], [13, 9, 'k']]),
      dizzy: put(idle, [[10, 6, 'k'], [11, 6, 'f'], [12, 6, 'k'], [11, 7, 'k'], [12, 7, 'f'], [13, 7, 'f'], [10, 8, 'k'], [12, 8, 'k'], [13, 9, 'k'], [12, 10, 'k']]),
    };
  })();

  // ---------------------------------------------------------------- sea otter 해롱이: sleek, cream face, whiskers, pebble
  // Standing upright like an otter on the lookout: round brown head, a cream muzzle with a button nose and whisker
  // dots, cream chest, long body, thick tail trailing on the floor. Idle: hugs a pebble (and tosses it); walk: paws swing.
  (function () {
    const TOP = A(`
      ................
      .......UUUU.....
      .....5UUUUUUU...
      ....5UUUUUUUUU..
      ....5UUUUUkUUU..
      ....5UUUUUkUEkk.
      .....5UUUEEEaEE.
      ......5UUEEpEE..
      ......5UUEEEEU..
      ......5U5EaWU5..
      .....55UU5aaU5..
      .....5UUUUUUUU..
      ...555UUUUUUU...
    `);
    const WALK = A(`
      ................
      .......UUUU.....
      .....5UUUUUUU...
      ....5UUUUUUUUU..
      ....5UUUUUkUUU..
      ....5UUUUUkUEkk.
      .....5UUUEEEaEE.
      ......5UUEEpEE..
      ......5UUEEEEU..
      ......5UUEEEE5..
      .....55UUUEE5U..
      .....5UUUUUUUU..
      ...555UUUUUUU...
    `);
    const L = {
      stand: ['..55..UU..UU....', '.55...55..55....'],
      a: ['..55..UU..UU....', '.55..55....55...'],
      b: ['..55..UU..UU....', '.55....5555.....'],
      p1: ['..55..UU..UU....', '.55...UU..UU....', '......55........'],
      p2: ['..55..UU..UU....', '.55...UU..UU....', '..........55....'],
      jump: ['..55..UU.UU.....', '.5...55...55....', '................'],
      fall: ['..55.UU...UU....', '.5..UU.....UU...', '...5.........5..'],
    };
    const idle = onLegs(TOP, L.stand);
    CH.otter = {
      // idle: the pebble hops up off the chest
      idle: [idle, put(idle, [[10, 9, 'E'], [11, 9, 'E'], [10, 10, '5'], [11, 10, 'E'], [10, 7, 'a'], [11, 7, 'W'], [10, 8, 'a'], [11, 8, 'a']])],
      // arm swings forward / back on the contact frames, the head sways back a pixel on the second step
      walk: [put(onLegs(WALK, L.a), [[14, 9, 'U'], [14, 10, '5']]), liftLegs(WALK, L.p1),
        shiftBox(put(onLegs(WALK, L.b), [[13, 9, 'U'], [12, 10, 'U'], [5, 9, 'U'], [5, 10, '5'], [4, 10, '5']]), 0, 7, 0, 15, -1), liftLegs(WALK, L.p2)],
      jump: liftLegs(put(WALK, [[13, 9, 'U'], [14, 8, 'U'], [6, 8, 'U'], [5, 7, '5']]), L.jump),
      fall: liftLegs(put(WALK, [[10, 3, 'w'], [11, 7, 'k'], [11, 8, 'k'], [5, 8, 'U'], [4, 7, '5']]), L.fall),
      shoot: put(onLegs(WALK, L.stand), [[10, 4, 'U'], [9, 4, 'k'], [10, 5, 'k'], [11, 7, 'k'], [12, 7, 'k'], [10, 7, 'p'], [13, 9, 'U'], [14, 9, 'U']]),
      dizzy: put(onLegs(WALK, L.stand), [[9, 3, 'k'], [11, 3, 'k'], [10, 4, 'k'], [9, 5, 'k'], [10, 5, 'U'], [11, 5, 'k'], [11, 7, 'k'], [12, 7, 'p']]),
    };
  })();

  // ---------------------------------------------------------------- penguin 펭펭: navy egg, white face, towel scarf
  (function () {
    const TOP = A(`
      ................
      ................
      ......1111......
      .....122111.....
      ....1211111w....
      ....111wwkwwOO..
      ....11wwwwpwo...
      ....qPPPPPPPP...
      ...1PwPPPPPPq...
      ...11qqwwwwww...
      ..1211wwwwwww...
      ..1121wwwwwwW...
      ...111wwwwwWW...
    `);
    const L = {
      stand: ['....1WWWWWW.....', '....OOO..OOO....'],
      a: ['....1WWWWWW.....', '...OOO....OOO...'],
      b: ['....1WWWWWW.....', '.....OOOOOO.....'],
      p1: ['....1WWWWWW.....', '.....WWWWW......', '.....OOO.OO.....'],
      p2: ['....1WWWWWW.....', '.....WWWWW......', '.....OO.OOO.....'],
      jump: ['....1WWWWWW.....', '....OO...OO.....', '................'],
      fall: ['....1WWWWWW.....', '...OO.....OO....', '................'],
    };
    const idle = onLegs(TOP, L.stand);
    const lean = (f, dx) => shiftBox(f, 0, 7, 0, 15, dx);
    const flap = (f) => put(f, [[1, 8, '1'], [1, 9, '2'], [2, 8, '1']]);
    CH.penguin = {
      idle: [idle, breathe(idle, 9)],
      walk: [lean(onLegs(TOP, L.a), -1), flap(liftLegs(TOP, L.p1)), lean(onLegs(TOP, L.b), 1), flap(liftLegs(TOP, L.p2))],
      jump: liftLegs(put(TOP, [[2, 9, '1'], [1, 8, '1'], [2, 10, '.'], [2, 11, '.']]), L.jump),
      fall: liftLegs(put(TOP, [[9, 5, 'k'], [9, 4, 'k'], [12, 6, 'o'], [13, 6, 'o'], [1, 9, '1'], [2, 9, '1']]), L.fall),
      shoot: put(idle, [[12, 5, 'O'], [13, 5, 'O'], [12, 6, 'k'], [13, 6, '.'], [12, 7, 'O'], [13, 7, 'o'], [10, 6, 'p']]),
      dizzy: put(idle, [[8, 4, 'k'], [10, 4, 'k'], [9, 5, 'k'], [8, 6, 'k'], [10, 6, 'k']]),
    };
  })();

  // ---------------------------------------------------------------- cat 냥냥: white-orange tabby, pointy ears, curly tail
  // Sweet-faced: two identical pointy ears with pink insides set evenly on a round head (mirror images about column
  // 9), an orange tabby cap between them, big round eyes low on the face, rosy cheeks, a tiny pink nose over an ω
  // mouth (the face sits 1 px to the right, the way the cat faces) and a banded tail curling up behind.
  (function () {
    const TOP = A(`
      ................
      ......w.....w...
      .....wpw...wpw..
      ..44.wppw4wppw..
      .oo..ww4o4o4ww..
      .44.wwwwwwwwwww.
      .oo.wwwkkwwwkkw.
      .44.wwwkkwpwkkw.
      .oo..PPwwkwkwP..
      .44o4oWwwwwwW...
      .oo4o4wwwwwwWW..
      ..wwwwwwwwwwWW..
      ..WWWWWWWWWWW...
    `);
    const L = {
      stand: ['..WW.ww..WW.ww..', '..WW.ww..WW.ww..'],
      a: ['..WW.ww..WW.ww..', '.WW.ww....WW.ww.'],
      b: ['..WW.ww..WW.ww..', '...WW.wwWW.ww...'],
      p1: ['..WW.ww..WW.ww..', '..WW.ww..WW.ww..', '.....ww......ww.'],
      p2: ['..WW.ww..WW.ww..', '..WW.ww..WW.ww..', '..WW.....WW.....'],
      jump: ['..WW.ww..WW.ww..', '.WW..ww.WW..ww..', '................'],
      fall: ['..WW.ww..WW.ww..', '.WW...ww.WW...ww', '.W......W.......'],
    };
    const idle = onLegs(TOP, L.stand);
    // happy ^ ^ eyes (jump), round startled eyes over a little "o" mouth (fall)
    const JOY = [[7, 5, 'k'], [12, 5, 'k'], [6, 6, 'k'], [7, 6, 'w'], [11, 6, 'k'], [12, 6, 'w'], [7, 7, 'w'], [8, 7, 'w'], [12, 7, 'w'], [13, 7, 'w']];
    const OOPS = [[7, 5, 'k'], [8, 5, 'k'], [12, 5, 'k'], [13, 5, 'k'], [9, 8, 'w'], [11, 8, 'w'], [10, 8, 'k']];
    CH.cat = {
      // idle: the tail tip flicks up
      idle: [idle, put(breathe(idle, 9), [[3, 4, '.'], [2, 3, '4']])],
      // walking: the tail tip sways back and forward
      walk: [onLegs(TOP, L.a), put(liftLegs(TOP, L.p1), [[3, 2, '.'], [1, 2, '4']]), onLegs(TOP, L.b), put(liftLegs(TOP, L.p2), [[2, 2, '.'], [3, 1, '4']])],
      jump: liftLegs(put(TOP, JOY), L.jump),
      fall: liftLegs(put(TOP, OOPS), L.fall),
      // blowing: eyes squeezed shut, puffed pink cheeks, a little round mouth
      shoot: put(idle, [[7, 6, 'w'], [8, 6, 'w'], [12, 6, 'w'], [13, 6, 'w'], [9, 8, 'w'], [10, 8, 'k'], [11, 8, 'k'], [10, 9, 'k'], [11, 9, 'k'], [5, 8, 'p'], [6, 8, 'p'], [13, 8, 'p']]),
      // dizzy: X X eyes
      dizzy: put(idle, [[6, 5, 'k'], [7, 5, 'w'], [8, 5, 'k'], [6, 6, 'w'], [7, 6, 'k'], [8, 6, 'w'], [6, 7, 'k'], [7, 7, 'w'], [8, 7, 'k'],
        [11, 5, 'k'], [12, 5, 'w'], [13, 5, 'k'], [11, 6, 'w'], [12, 6, 'k'], [13, 6, 'w'], [11, 7, 'k'], [12, 7, 'w'], [13, 7, 'k']]),
    };
  })();
  // ---------------------------------------------------------------- frog 개굴이: big eyes on top, pink cheeks, hops
  (function () {
    const TOP = A(`
      ................
      ................
      ................
      ......mm..mmm...
      .....twwmtwwwm..
      .....twkttwwkt..
      ....tttttttttt..
      ...tttttttpptkt.
      ..ttttttttkkkt..
      ..tttnnnnnnnnt..
      .TtTtnnnnnnnt...
      .TttTtnnnnnt....
      ..TTTTTTTTTT....
    `);
    const L = {
      stand: ['.TTT...tt.tt....', '..TTT..tt.tt....'],
      a: ['.TTT...tt.tt....', '..TTT..tt.tt....'],
      push: ['.TT....tt.tt....', '..TT...tt.tt....', '...TT..tt.tt....'],
      air: ['TTT....tt.tt....', 'T.......t...t...', '................', '................'],
      land: ['.TT....tt.tt....', 'TT.....tt.tt....', '.......tt..tt...'],
      jump: ['.TT....tt.tt....', 'TT......t..t....', '................'],
      fall: ['.TTT...tt.tt....', '..TT...t...t....', '...T...t...t....'],
    };
    const idle = onLegs(TOP, L.stand);
    CH.frog = {
      idle: [idle, breathe(idle, 10)],
      // a little hop cycle: crouch, push off, airborne, land
      walk: [onLegs(TOP, L.a), liftLegs(TOP, L.push), pad16(TOP.slice(1).concat(L.air)), liftLegs(TOP, L.land)],
      jump: liftLegs(put(TOP, [[7, 5, 'w'], [12, 5, 'w'], [7, 4, 'k'], [12, 4, 'k']]), L.jump),
      fall: liftLegs(put(TOP, [[7, 4, 'w'], [7, 5, 'k'], [12, 4, 'w'], [12, 5, 'k'], [11, 8, 't'], [12, 8, 'k'], [12, 9, 'k']]), L.fall),
      shoot: put(idle, [[10, 8, 't'], [11, 8, 't'], [12, 8, 'k'], [13, 8, 'k'], [13, 7, 'p'], [12, 7, 'p'], [12, 9, 'k']]),
      dizzy: put(idle, [[6, 4, 'k'], [7, 4, 'w'], [6, 5, 'w'], [7, 5, 'k'], [10, 4, 'k'], [11, 4, 'w'], [12, 4, 'k'], [10, 5, 'w'], [11, 5, 'k'], [12, 5, 'w'], [11, 8, 't'], [12, 8, 'k'], [12, 9, 'k']]),
    };
  })();

  for (const c of CHAR_IDS) {
    if (c === 'duck') continue;
    const d = CH[c], o = d.outlined ? (f) => f : (f) => outline(f);
    SPR[c + '_idle'] = d.idle.map(o);
    SPR[c + '_walk'] = d.walk.map(o);
    SPR[c + '_jump'] = [o(d.jump)];
    SPR[c + '_fall'] = [o(d.fall)];
    SPR[c + '_shoot'] = [o(d.shoot)];
    const z = o(d.dizzy);
    SPR[c + '_die'] = [z, rot90(z), rot90(rot90(z)), rot90(rot90(rot90(z)))];
  }

  // ================================================================== V4 MOVE POSES (char-kits v4 §11)
  // One extra pose per animal for its JUMP-button move. Same palette, head and colours as each animal's idle / jump
  // frames; fill art only (outline() adds the ink). The engine keeps a fallback for every one of them.
  // ---- duck_glide 둥실 활공: the folded wing opens; wings up (body on the ground line, feet tucked as in the jump) /
  // wings down (the downstroke lifts the body 1 px, the feather tips hang below the belly in front of the near foot)
  SPR.duck_glide = [A(`
    ................
    .L.L.L.LLYY.....
    .LLLL.LwYYYY....
    .LLL.LLYYYwkY...
    .yLL.LYYYYkkY...
    ..yL.YYYYYkkYOO.
    ..yL.YYYYppYOoo.
    ..yyL.YYYYYY....
    .YYyyYYYyyyYY...
    .YYYYYYYYYYYYY..
    .YYYYYYYYYYYYY..
    .YYYYYYYYYYYYy..
    ..YyYYYYYYYYyy..
    ...yyyyyyyyyy...
    ...OO..OO.......
    ................
  `), A(`
    .......LLYY.....
    ......LwYYYY....
    .....LLYYYwkY...
    .....LYYYYkkY...
    .....YYYYYkkYOO.
    .Y...YYYYppYOoo.
    .YY...YYYYYY....
    .YYYYYYYyyyYY...
    .YYYYYyyyyYYYY..
    .YYYYyLLLLyYYY..
    .YYYyLLLLyYYYy..
    .YYyLLLLyYYYyy..
    ..yLLLLyyyyyy...
    .yLLLLy.OO......
    .L.L.L..........
    ................
  `)].map((f) => outline(f));
  // ---- capy_slam 털썩 엉덩방아: curled up, rump down, paws tucked, eyes squeezed shut; the yuzu lifts off its head
  SPR.capy_slam = [outline(A(`
    ...........m....
    ..........YLY...
    ..........yYy...
    ........F.......
    ........fKKKKK..
    .....KKffffffff.
    ....KffffffkffH.
    ...KfffFffffkfH.
    ...fffffFffkppf.
    ..ffffffffffkkF.
    ..fffffFFfffFf..
    ..ffffFffFFFff..
    ...fffFffFFff...
    ....FfffFF......
    .....FFFF.......
    ................
  `))];
  // ---- otter_dash 휙 대시: stretched flat like a swimming otter, head first, tail streaming behind
  SPR.otter_dash = [outline(A(`
    ................
    ................
    ................
    ................
    ................
    ................
    ........UUUU....
    ......5UUUUUUU..
    ....555UUUkUUU..
    ..55UUUUUUkUEkk.
    .555UUUUUEEEaEE.
    ..55UUUUUEEpEE..
    ...5UUUUUEEEEU..
    ..55....UU......
    ................
    ................
  `))];
  // ---- penguin_slide 쭉 배미끄럼: lying on its belly, beak forward, scarf at the neck, feet trailing. The engine draws
  // it 3 px lower (spec §6), so the belly outline sits on row 12 here and lands on the floor line
  SPR.penguin_slide = [outline(A(`
    ................
    ................
    ................
    ................
    ................
    ................
    ....1111..111...
    ..112221qP1211..
    .1111111qP1wkw..
    .O11211wPPwwwOO.
    .OwwwwwwPqwpwo..
    ...WWWWWWWWWW...
    ................
    ................
    ................
    ................
  `))];
  // ---- cat_flip 냥냥 2단 점프: curled into a ball mid-somersault (round about the frame centre), happy ^ ^ eyes and
  // rosy cheeks under the same two mirror-image ears as her other frames, the tabby back and tail wrapped round it
  SPR.cat_flip = [outline(A(`
    ................
    .....w......w...
    ....wpw....wpw..
    ....wppw44wppw..
    ...4ww4o44o4ww..
    ..4o4wkwwwwkww..
    ..44wkwkwwkwkw..
    ..o4wPwwwpwwPw..
    ..44wwwwkwkwww..
    ..o4wwwwwwwwwW..
    ..4o4wwwwwwwWW..
    ...44o4wwwwWW...
    ....4o44o4oW....
    .....4o44o4.....
    ................
    ................
  `))];

  // ================================================================== V4 BUBBLE GLYPHS (5x5, drawn at the bubble centre)
  // No outline (no room): ink and shade pixels inside the art carry the contrast over the hue film (spec §2.6).
  // duck head + orange beak; capy yuzu with one leaf pixel; otter pebble with a white glint; penguin snowflake;
  // cat yarn swirl (frame 1 is the swirl turned a quarter, flipped as it rolls); frog egg with its dark dot
  SPR.icon_duck = [A(`
    .YYY.
    YYYkY
    YYYOO
    yYYYo
    .yyy.
  `)];
  SPR.icon_capy = [A(`
    ...t.
    .YLY.
    YLYYY
    YYYYy
    .yyy.
  `)];
  SPR.icon_otter = [A(`
    .....
    .aaa.
    awWaa
    aWaad
    .ddd.
  `)];
  SPR.icon_penguin = [A(`
    w.w.w
    .www.
    wwcww
    .www.
    w.w.w
  `)];
  const YARN = A(`
    .ppp.
    pqqpP
    ppqqp
    pqppq
    .pqp.
  `);
  SPR.icon_cat = [YARN, rot90(YARN)];
  SPR.icon_frog = [A(`
    .nnn.
    nwNNn
    nNNNm
    nNNNm
    .mmm.
  `)];

  // ---------------------------------------------------------------- curled minis: trapped (battle) and ghost (co-op) bubbles
  // 10x10 fill art of each animal curled into a ball, drawn without eyes. eye = [x, y, gap]: the '>' eye's top pixel;
  // the '<' eye mirrors it `gap` px to the right. Trapped = squeezed >< eyes inside a capture bubble; ghost = the same
  // ball turned pale and see-through (dithered ice / cyan, periwinkle edges, calm closed eyes, a wavy wisp).
  const MINI = {
    duck: { eye: [3, 2, 4], art: A(`
      ...LLYY...
      ..LYYYYYY.
      .LYYYYYYY.
      .YYYYYYYYY
      YYYYYYYYOO
      YyYYYYYYoo
      YYyYpYYpY.
      .yYYYYYYy.
      ..yyyyyyy.
      ...OO.OO..
    `) },
    capy: { eye: [3, 3, 4], art: A(`
      .....m....
      ....YLY...
      ..KKKyKKK.
      .Kfffffff.
      Kfffffffff
      ffffffffHH
      fFfpffpfff
      .fFfffffF.
      ..FFFFFFF.
      ..FF..FF..
    `) },
    otter: { eye: [3, 2, 4], art: A(`
      .5UUUUU5..
      .UUUUUUUU.
      UUEEEEEEUU
      UEEEEEEEEU
      UEEEEEEEkk
      5UEEEpEEE.
      5UUEEEEEU.
      .5UUUUUU5.
      ..555555..
      .555......
    `) },
    penguin: { eye: [3, 3, 4], art: A(`
      ...1111...
      ..122111..
      .1211111..
      .11wwwwww.
      1wwwwwwwOO
      1wwwwwwwoo
      11wpwwpww.
      .1PPPPPPP.
      ..1wwwww..
      ...OO.OO..
    `) },
    cat: { eye: [2, 3, 4], art: A(`
      .w.....w..
      wpw...wpw.
      wppw4wppw.
      ww4o4o4ww.
      wwwwwwwwww
      wwwwpwwwww
      wwwwwwwwww
      44o44owwww
      .4o44o4wW.
      ..WWWWWW..
    `) },
    frog: { eye: [1, 0, 7], art: A(`
      .www..www.
      wwwwttwwww
      wwwwttwwww
      tttttttttt
      tttttttttt
      tpttttttpt
      ttttkkkttt
      .tnnnnnnt.
      ..TnnnnT..
      .TT....TT.
    `) },
  };
  const ST_GHOST = { base: 'w', shade: '3', sheenA: 'c', sheenB: 'v' };
  const lumOf = (ch) => { const v = parseInt(PALETTE[ch].slice(1), 16); return (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255; };
  const inBubble = (mini, dy) => stamp(blank(16, 16), outline(['..........'].concat(mini, ['..........']).map((r) => '.' + r + '.')), 2, 2 + dy);
  function trappedFrames(m) {
    const [x, y, gap] = m.eye;
    const face = put(m.art, [[x, y, 'k'], [x + 1, y + 1, 'k'], [x, y + 2, 'k'], [x + gap, y, 'k'], [x + gap - 1, y + 1, 'k'], [x + gap, y + 2, 'k']]);
    // frame 1: bobbing 1 px higher with a bead of sweat
    const f1 = put(inBubble(face, -1), [[12, 3, 'c'], [12, 4, 'C']]);
    return [bubbleWith(inBubble(face, 0), 200, ST_TRAP), bubbleWith(f1, 20, ST_TRAP)];
  }
  // each ghost keeps a hint of its animal's key colour (beak, tangerine and leaf, brown back, apricot spots, green
  // legs) so a ghost can be told apart at 1x, not only by its name tag
  const GHOST_KEEP = { duck: { O: 'O', o: 'O' }, capy: { Y: 'Y', m: 'm' }, otter: { 5: 'U' }, penguin: { O: 'O', o: 'O' }, cat: { 4: '4', o: '4' }, frog: { T: 't' } };
  function ghostFrames(m, keep) {
    keep = keep || {};
    const [x, y, gap] = m.eye;
    // calm closed eyes (little downward arcs) with soft pink cheeks under them
    const calm = put(m.art, [[x, y + 1, '#'], [x + 1, y + 2, '#'], [x + gap, y + 1, '#'], [x + gap - 1, y + 2, '#'],
      [x - 1, y + 3, '+'], [x + gap + 1, y + 3, '+']].filter(([xx, yy]) => m.art[yy] && m.art[yy][xx] && m.art[yy][xx] !== '.'));
    const WISP = [['..cwiwci..', '...ic.....'], ['..icwiwc..', '.....ci...']];
    return [0, 1].map((ph) => {
      const body = calm.slice(0, 8).map((r, yy) => r.replace(/./g, (ch, xx) => {
        if (ch === '.') return ch;
        if (ch === '#') return 'C';
        if (ch === '+' || ch === 'p') return 'P';
        if (ch === 'k') return 'u';
        if (keep[ch]) return keep[ch];
        const l = lumOf(ch);
        if (l < 0.4) return '3';
        if (l < 0.78) return ((xx + yy + ph) & 1) ? 'i' : 'c';
        return 'w';
      }));
      const ghost = body.concat(WISP[ph]);
      // wobbly edge: the periwinkle outline shimmers between frames
      const g = G(outline(['..........'].concat(ghost, ['..........']).map((r) => '.' + r + '.'), '3'));
      for (let yy = 0; yy < g.length; yy++) for (let xx = 0; xx < g[yy].length; xx++) if (g[yy][xx] === '3' && ((xx + yy * 3 + ph) % 4 === 0)) g[yy][xx] = 'u';
      return bubbleWith(stamp(blank(16, 16), S(g), 2, 2 - ph), ph ? 40 : 220, ST_GHOST);
    });
  }
  for (const c of CHAR_IDS) {
    SPR[c + '_trapped'] = trappedFrames(MINI[c]);
    SPR[c + '_ghost'] = ghostFrames(MINI[c], GHOST_KEEP[c]);
  }

  // ---------------------------------------------------------------- life icons (8x8 heads for the HUD)
  const LIFE = {
    capy: A(`
      ........
      ...Ym...
      .KKyKKK.
      .ffkkfH.
      .fffffH.
      .FpffF..
      ........
      ........
    `),
    otter: A(`
      ........
      ..UUUU..
      .UkUUkU.
      .UEEEEU.
      .EEkkEE.
      ..EEEE..
      ........
      ........
    `),
    penguin: A(`
      ........
      ..1111..
      .121111.
      .1wkwkO.
      .1wwwwo.
      ..PPPP..
      ........
      ........
    `),
    cat: A(`
      ........
      .w....w.
      .wp44pw.
      .wwwwww.
      .wkwwkw.
      .PwppwP.
      ..wwww..
      ........
    `),
    frog: A(`
      ........
      .ww..ww.
      .wk..wk.
      .tttttt.
      .tpkkpt.
      ..tttt..
      ........
      ........
    `),
  };
  SPR.life_duck = [SPR.life[0].slice()];
  for (const c of Object.keys(LIFE)) SPR['life_' + c] = [outline(LIFE[c])];

  // ---------------------------------------------------------------- multiplayer UI marks
  // winner's crown, the pointer under a name tag (plain white: the engine tints it with the slot colour), ready check
  SPR.crown = [outline(A(`
    ........
    ........
    .L.LY.Y.
    .YYYYYY.
    .YRYYcY.
    .yyyyyy.
    ........
    ........
  `))];
  SPR.tag_arrow = [A(`
    wwwww
    .www.
    ..w..
  `)];
  SPR.ready = [outline(A(`
    ........
    ..tttt..
    .tttttw.
    .ttttwt.
    .twtwtt.
    .ttwttT.
    ..TTTT..
    ........
  `))];

  // ---------------------------------------------------------------- v4 trophies (design/trophies.md §9): 8x8 each
  // the trophy cup (every DOM cup, the podium's change lines, the cups flying to the winner): front, then turned
  SPR.trophy = [A(`
    .kkkkkk.
    ykLLYYky
    ykLYYYky
    .kYYYyk.
    ..kYyk..
    ...yy...
    ..kYYk..
    .kyyyyk.
  `), A(`
    .kkkkk..
    ykLYYyk.
    ykLYYyk.
    .kYYyk..
    ..kYk...
    ...y....
    ..kYyk..
    .kyyyk..
  `)];
  // the 7 league icons (lg_0 .. lg_6): 때밀이 견습 a green 이태리타올, 뽀득 새내기 a pink soap + bubble, 온탕 단골 a yellow
  // 바가지 with steam, 양머리 고수 the sheep-head towel, 세신 달인 a banana-milk jar, 사우나 명인 the sauna hourglass,
  // 목욕탕 왕 the bathhouse crown
  SPR.lg_0 = [A(`
    ..kkkk..
    .ktTtTk.
    .ktTtTkk
    .ktTtTtk
    .ktTtTtk
    .ktTtTk.
    .kwwwwk.
    ..kkkk..
  `)];
  SPR.lg_1 = [A(`
    .....kk.
    ....kcwk
    .....kk.
    .kkkkkk.
    kPPpppqk
    kPppppqk
    kqqqqqqk
    .kkkkkk.
  `)];
  SPR.lg_2 = [A(`
    .w...w..
    ..w...w.
    kkkkkkkk
    kLYYYYyk
    kYYYYYyk
    .kYYYyk.
    ..kkkk..
    ........
  `)];
  SPR.lg_3 = [A(`
    .kk..kk.
    kwWkkWwk
    kwwwwwwk
    kWEEEEWk
    kEkEEkEk
    kEPEEPEk
    .kEEEEk.
    ..kkkk..
  `)];
  SPR.lg_4 = [A(`
    ..kkkk..
    ..kwwk..
    .kkLLkk.
    kYLYYYyk
    kYYYYYyk
    kYYYYYyk
    .kYYYyk.
    ..kkkk..
  `)];
  SPR.lg_5 = [A(`
    FFFFFFFF
    .kOOOOk.
    ..kOOk..
    ...kk...
    ...kk...
    ..kwOk..
    .kOOOOk.
    FFFFFFFF
  `)];
  SPR.lg_6 = [A(`
    ........
    k..kk..k
    Yk.YY.kY
    YYkYYkYY
    YYYYYYYY
    YRYLLYRY
    kyyyyyyk
    .kkkkkk.
  `)];

  // ---------------------------------------------------------------- portraits (32x32 busts for the character picker)
  // Shaded ellipse lumps (blob: lit from the upper left) for head and shoulders, then hand-drawn feature patches.
  // Turned a little to the right like the in-game sprites. `post` patches go on after the outline (whiskers, steam).
  function portrait(build) {
    const g = grid(32, 32);
    const post = build(g) || [];
    let rows = outline(rowsOf(g));
    for (const [prow, ox, oy] of post) {
      const h = G(rows);
      prow.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== '.') px(h, x + ox, y + oy, r[x]); });
      rows = S(h);
    }
    return rows;
  }
  // keep only a 1-px highlight rim on top of a blob (blob() lights a wide band)
  function thinHi(g, hi, base) {
    for (let y = g.length - 1; y > 0; y--) for (let x = 0; x < g[y].length; x++) if (g[y][x] === hi && g[y - 1][x] === hi) g[y][x] = base;
  }
  const EYE_BIG = A(`
    .kkk.
    kwwkk
    kwkkk
    kkkkk
    kkkkk
    .kkk.
  `);
  const EYE_FAR = A(`
    .kk.
    kwkk
    kkkk
    kkkk
    .kk.
  `);

  SPR.portrait_duck = [portrait((g) => {
    const T = { base: 'Y', hi: 'L', sh: 'y', deep: 'y' };
    blob(g, [[13, 34, 14, 10]], T);
    blob(g, [[15, 14, 10.5, 10]], T);
    thinHi(g, 'L', 'Y');
    // a curl of fluff on top
    patch(g, A(`
      .LL..
      LYYL.
      ..YYY
    `), 13, 2);
    // bill: broad, slightly open in a smile, with a nostril
    patch(g, A(`
      ...OOOO...
      .OOLLOOkO.
      OOOOOOOOOO
      ooooooooOo
      .kkkkkkkk.
      ..oooooo..
    `), 20, 14);
    patch(g, EYE_FAR, 11, 9);
    patch(g, EYE_BIG, 17, 8);
    patch(g, A(`
      pPp
      ppp
    `), 11, 15);
    // chest fluff
    patch(g, A(`
      .L.L..
      LYLYL.
    `), 15, 25);
  })];

  SPR.portrait_capy = [portrait((g) => {
    const T = { base: 'f', hi: 'K', sh: 'F', deep: 'F' };
    blob(g, [[14, 34, 15, 10]], T);
    // boxy head: a wide flat-topped block with a big blunt snout on the right
    blob(g, [[12, 15, 9.5, 8.5], [20, 16, 9.5, 8], [16, 12, 10, 5]], T);
    thinHi(g, 'K', 'f');
    // tiny round ears
    patch(g, A(`
      .FF.
      FKfF
      .ff.
    `), 5, 6);
    patch(g, A(`
      .FF.
      FKfF
    `), 18, 6);
    // yuzu (with a leaf) balanced on top
    patch(g, A(`
      .....mm.
      ....mMm.
      ..LYY...
      .LYYYYy.
      .YYYYYy.
      .yYYYyy.
      ..yyyy..
    `), 9, 0);
    // calm, half-closed eyes
    patch(g, A(`
      FFFF
      kkkk
      .kk.
    `), 10, 12);
    patch(g, A(`
      FFFF
      kkkk
      .kk.
    `), 18, 12);
    // big blunt nose with two nostrils, a little smile, rosy cheeks
    patch(g, A(`
      .FHHHF.
      FHkHHkH
      HHHHHHH
      .FHHHF.
    `), 22, 15);
    patch(g, A(`
      F...F
      .FFF.
    `), 23, 20);
    patch(g, A(`
      ppp
      pPp
    `), 12, 17);
    patch(g, A(`
      pp
    `), 20, 18);
  })];

  SPR.portrait_otter = [portrait((g) => {
    const T = { base: 'U', hi: 'f', sh: '5', deep: '5' };
    const CREAM = { base: 'E', hi: 'w', sh: 'E', deep: 'K' };
    blob(g, [[15, 34, 14, 11]], T);
    blob(g, [[16, 33, 8, 9]], CREAM);
    // small round ears low on the sides
    patch(g, A(`
      .55.
      5UU5
      5UE5
      .55.
    `), 3, 8);
    patch(g, A(`
      .55.
      5UU5
      5EU5
      .55.
    `), 25, 7);
    blob(g, [[15, 15, 11, 10]], T);
    thinHi(g, 'f', 'U');
    // the pale face of a sea otter
    blob(g, [[16, 18, 9.5, 6.5], [16, 14, 7, 4]], CREAM);
    patch(g, A(`
      .kk.
      kwkk
      kkkk
      .kk.
    `), 10, 12);
    patch(g, A(`
      .kkk.
      kwwkk
      kwkkk
      kkkkk
      .kkk.
    `), 19, 11);
    // big button nose, w mouth, whisker dots, blush
    patch(g, A(`
      .kkkk.
      kwkkkk
      .kkkk.
      ..kk..
      .k..k.
      k.kk.k
    `), 15, 16);
    patch(g, A(`
      a.a
      .a.
    `), 11, 19);
    patch(g, A(`
      a.a
      .a.
    `), 21, 19);
    patch(g, A(`
      pp
    `), 10, 17);
    patch(g, A(`
      pp
    `), 23, 17);
    // paws hugging a pebble
    patch(g, A(`
      ..aaaa..
      .aWWaaa.
      UaWaaaad
      5UaaaadU
      .55dd55.
    `), 12, 25);
    return [[A(`
      ww....
      ..ww..
      ......
      .www..
    `), 2, 18], [A(`
      ....ww
      ..ww..
      ......
      ..www.
    `), 25, 18]];
  })];

  SPR.portrait_penguin = [portrait((g) => {
    blob(g, [[15, 34, 14, 11]], { base: '1', hi: '2', sh: '1', deep: '1' });
    blob(g, [[17, 33, 8, 8]], { base: 'w', hi: 'w', sh: 'W', deep: 'W' });
    blob(g, [[15, 14, 11.5, 11]], { base: '1', hi: '2', sh: '1', deep: '1' });
    // white face mask
    blob(g, [[13, 17, 6, 6], [20, 17, 6, 6.5], [17, 21, 7, 4]], { base: 'w', hi: 'w', sh: 'W', deep: 'W' });
    patch(g, EYE_FAR, 11, 13);
    patch(g, EYE_BIG, 18, 12);
    // orange beak pointing right
    patch(g, A(`
      .OOO..
      OLOOOO
      oooooo
      .ooo..
    `), 21, 18);
    patch(g, A(`
      pPp
      ppp
    `), 10, 19);
    // pink towel around the neck, one striped end hanging down
    patch(g, A(`
      ..qPPPPPPPPPPPPPPPPq..
      .qPPPPPPPPPPPPPPPPPPq.
      qPPwwPPPPPPPPPPPPPPPPq
      .qqqqqqqqqqqqqqqqqqqq.
      ...qPPq...............
      ...PwwP...............
      ...PPPP...............
      ...qqqq...............
    `), 5, 23);
  })];

  SPR.portrait_cat = [portrait((g) => {
    // evenly lit (blob's upper-left light would shade one cheek): only the silhouette bottoms get the grey
    const T = { base: 'w', hi: 'w', sh: 'w', deep: 'W' };
    // the face is drawn as left halves mirrored about the centre line x = 15.5, so the two ears (and eyes, cheeks,
    // whiskers) are exact mirror images at the same height
    const sym = (rows) => rows.map((r) => r + r.split('').reverse().join(''));
    const twin = (rows, ox, oy) => { patch(g, rows, ox, oy); patch(g, mirror(rows), 32 - ox - rows[0].length, oy); };
    // paint over fur only (keeps the silhouette)
    const onFur = (rows, ox, oy) => rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== '.' && g[y + oy] && g[y + oy][x + ox] && g[y + oy][x + ox] !== '.') g[y + oy][x + ox] = r[x]; });
    blob(g, [[15.5, 35, 14, 8.5]], T);
    // pointy ears with pink insides (left ear; the right one is its mirror image)
    twin(A(`
      ..w.......
      .ww.......
      .wpw......
      .wppw.....
      wwpppw....
      wwppppw...
      wwpPpppw..
      wwpPppppw.
      wwwppppppw
      wwwwwwwwww
    `), 5, 2);
    // a big round head
    blob(g, [[15.5, 18, 13.5, 10.5]], T);
    // orange tabby cap: a broad centre stripe and two side stripes down the forehead
    onFur(sym(A(`
      ....4444
      ...4444o
      ..4o444o
      .4o44o4o
      .....44o
    `)), 8, 8);
    // big shiny eyes (the same light from the upper left in both)
    for (const ex of [7, 19]) patch(g, A(`
      .kkkk.
      kwwkkk
      kwwkkk
      kkkkkk
      kkkkwk
      .kkkk.
    `), ex, 15);
    // rosy cheeks, a tiny pink nose over an ω mouth, a soft grey under the chin
    twin(A(`
      .pp.
      pPPp
      .pp.
    `), 4, 21);
    onFur(sym(A(`
      ......pp
      .......p
      ....k..k
      .....kk.
    `)), 8, 20);
    onFur(sym(A(`
      ....WWWW
    `)), 8, 28);
    // white chest, an orange patch on one shoulder
    onFur(sym(A(`
      ...WWWWW
      .WWWWWWW
    `)), 0, 30);
    onFur(A(`
      ..4444..
      .4o44o4.
      44o44o44
      4o44o444
    `), 2, 27);
    // whiskers (after outlining)
    const WH = A(`
      www...
      ......
      .wwww.
    `);
    return [[WH, 0, 21], [mirror(WH), 26, 21]];
  })];
  SPR.portrait_frog = [portrait((g) => {
    const T = { base: 't', hi: 'm', sh: 'T', deep: 'T' };
    blob(g, [[15, 34, 15, 11]], T);
    blob(g, [[16, 33, 9, 8]], { base: 'n', hi: 'n', sh: 'm', deep: 'm' });
    blob(g, [[15, 18, 13, 9]], T);
    // huge eyes on top
    blob(g, [[9, 9, 5.5, 5.5], [21, 8, 6, 6]], T);
    patch(g, A(`
      .wwww.
      wwwwww
      wwkkkw
      wwkwkk
      wwkkkk
      .wwkk.
    `), 6, 5);
    patch(g, A(`
      .wwwww.
      wwwwwww
      wwwkkkw
      wwwkwkk
      wwwkkkk
      wwwkkkk
      .wwwkk.
    `), 18, 4);
    // rosy cheeks and a wide smile
    patch(g, A(`
      ppp
      pPp
    `), 6, 17);
    patch(g, A(`
      ppp
      pPp
    `), 22, 17);
    patch(g, A(`
      k................k
      .k..............k.
      ..kkkkkkkkkkkkkk..
    `), 7, 19);
    patch(g, A(`
      ..pPPp..
      ...pp...
    `), 17, 22);
  })];

  // ---------------------------------------------------------------- twin colours 쌍둥이 색 (design/distinction.md §2.5)
  // When two players pick the same animal, every later copy has these body keys swapped, by exact pixel match on the
  // baked frame, for its own slot ramp: key -> role index into game.js SLOT_RAMP[slot] = [L, M, D, DD] (0 lightest ..
  // 3 darkest). Used on the body poses (idle walk jump fall shoot die + the move pose), life_<char> and portrait_<char>;
  // not on _trapped / _ghost. Keys not listed (eyes, beaks, cheeks, ink, props) keep their colours. Whoever redraws an
  // animal fixes its keys here: tools/check-sprites.js checks every key is drawn in that animal's body frames, the roles
  // are 0-3 and run light to dark, and all palette values are distinct (the pixel match relies on it).
  PG.TWIN_KEYS = {
    duck: { L: 0, Y: 1, y: 2 },            // the body and wing; the orange beak and feet (O o) kept
    capy: { K: 0, f: 1, F: 2, H: 3 },      // the fur and the snout; the yuzu (Y L y) and its leaf (m) kept
    otter: { U: 1, '5': 2 },               // the fur; the cream face (E) and the pebble (a W) kept
    penguin: { '2': 1, '1': 2 },           // the navy back; the white face and belly (w W), beak and feet (O o), towel (P p q) kept
    cat: { w: 0, W: 1, '4': 1, o: 2 },     // the coat and tabby patches (weakest: its w eye glints take the L tint)
    frog: { n: 0, t: 1, m: 1, T: 2 },      // the skin and belly; the eye whites (w) and cheeks (p) kept
  };

  // ================================================================== V4 SHOP (비누 코인 · 상점, design/shop.md §10)
  // ---------------------------------------------------------------- UI icons, 8x8: the coin (front; glint), the title
  // button's basket, the league lock, the five slot silhouettes (grey-cream; the UI tints the selected one)
  // coin: a pink soap disc (never yellow: the trophy cup is yellow) with a little bubble glint and a q rim below; frame 1
  // moves the rim's shine (the UI's twinkle)
  SPR.coin = [A(`
    ..kkkk..
    .kwPPPk.
    kwPPPPpk
    kPPPcPpk
    kPPcwPpk
    kpPPPppk
    .kqqqqk.
    ..kkkk..
  `), A(`
    ..kkkk..
    .kPPPwk.
    kPPPPPwk
    kPPPcPpk
    kPPcwPpk
    kpPPPppk
    .kqqqqk.
    ..kkkk..
  `)];
  // the 상점 button: a pink bath basket (handle, weave) with a folded white towel on top
  SPR.shop = [A(`
    ..kqqk..
    .kqkkqk.
    kwwwwwWk
    kWwwwWWk
    kkkkkkkk
    kPpPpPpk
    kqpqpqpk
    .kkkkkk.
  `)];
  SPR.lock = [A(`
    ..kkkk..
    .kaWWak.
    .ka..ak.
    kkkkkkkk
    kWWWWWak
    kWWddWak
    kaaddaak
    .kkkkkk.
  `)];
  SPR.slot_h = [A(`
    ........
    ...kkk..
    ..kWWWk.
    .kWWWWak
    .kWWWWak
    kkkkkkkk
    kEEEEEEk
    .kkkkkk.
  `)];
  SPR.slot_f = [A(`
    ........
    a......a
    .a....a.
    .kk..kk.
    kWWkkWWk
    kWakkWak
    .kk..kk.
    ........
  `)];
  SPR.slot_n = [A(`
    ........
    ........
    kkk..kkk
    kWWkkWWk
    kWaEEaWk
    kWWkkWWk
    kkk..kkk
    ........
  `)];
  SPR.slot_b = [A(`
    ..kkkk..
    .kEEEEk.
    .kWWWWk.
    kWWWWWak
    kWWWWWak
    kWWWWWak
    kWaWaWak
    kkkkkkkk
  `)];
  SPR.slot_e = [A(`
    ...k....
    ..kWk...
    .kkWkk..
    kWWEWWk.
    .kkWkk..
    ..kWk.k.
    ...k.kWk
    ......k.
  `)];
  // ---------------------------------------------------------------- the 효과 icons for the 상점 (8x8): steam wisps,
  // a droplet, sparkles, two bubbles, a heart, two footprints striped R O Y | t b v (toes, then soles)
  SPR.ic_e1 = [A(`
    .k...k..
    kwk.kwk.
    .kwk.kwk
    .kWk.kWk
    kWk.kWk.
    kWk.kWk.
    .kak.kak
    ..k...k.
  `)];
  SPR.ic_e2 = [A(`
    ...k....
    ..kck...
    ..kcck..
    .kwccCk.
    .kwccCk.
    .kcccCk.
    ..kCCk..
    ...kk...
  `)];
  SPR.ic_e3 = [A(`
    ...k....
    ..kPk...
    .kkPkk..
    kPPwPPk.
    .kkPkk..
    ..kPk.k.
    ...k.kvk
    ......k.
  `)];
  SPR.ic_e4 = [A(`
    ..kkk...
    .kwiik..
    kwiiiik.
    kiiiick.
    .kiick..
    ..kkkkk.
    ....kwik
    .....kk.
  `)];
  SPR.ic_e5 = [A(`
    ........
    .kk..kk.
    kPpkkppk
    kpppppqk
    kpppppqk
    .kpppqk.
    ..kpqk..
    ...kk...
  `)];
  SPR.ic_e6 = [A(`
    R.O.....
    .kk.....
    kYYkt.b.
    kttk.kk.
    .kk.kbbk
    ....kvvk
    .....kk.
    ........
  `)];

  // ---------------------------------------------------------------- the worn items (it_<id>, design/shop.md §4)
  // Each item is drawn with its own 1 px ink (the two face decals f1 / f6: a dark rim of their own colour) and faces
  // RIGHT. Pivots (PG.ITEM_PIVOT, item pixels, the pixel that lands ON the anchor pixel): 머리 = the brim's bottom-centre
  // (ANCHORS H), 얼굴 = the lens interior's left pixel (profile: E is the left pixel of the near eye) / the bridge (front:
  // E is the eyes' midpoint), 목 = top-centre (N), 등 = the attach pixel at the shoulder (B; the art reaches back and up),
  // tubes = the ring's centre (W). Face items have 2 frames [profile, front] in one box, tubes [back half, front half];
  // all frames of an item share one size (PG.ITEM_SIZE). Only existing palette keys. Clash rules (shop.md 6.6): no crown
  // shape, no gold-and-red hat, no round shiny bubble, nothing white at a hat's top edge (white marks "me" above the
  // head), nothing below the feet.
  const IT = {};
  // ---- 머리 (h): in front of the head (ANCHORS H); the capy's yuzu and the cat's ears are cleared under a hat (hide)
  // 양머리 수건: a pink towel band, its two ends rolled into round buns on the top corners (two, round: never points)
  IT.h1 = [[5, 5], A(`
    .kkk..kkk.
    kPwPkkPwPk
    kPqPkkPqPk
    kpPPPPPPpk
    kqppppppqk
    kkkkkkkkkk
  `)];
  // 샤워캡: a puffy see-through dome, a frilled elastic rim
  IT.h2 = [[5, 4], A(`
    ..kkkkkk..
    .kiwiiiik.
    kiwiiiiick
    kiiiiiiick
    kCcCcCcCck
  `)];
  // 때타월 두건: a green scrub-towel bandana (ridged), its knot tail behind
  IT.h3 = [[5, 3], A(`
    ...kkkkkk.
    ..ktTtTtTk
    .kkTtTtTtk
    kTtkkkkkkk
    .kk.......
  `)];
  // 귤 껍질 모자: half a tangerine peel with its leaf
  IT.h4 = [[4, 5], A(`
    .....kk.
    ..kkkmMk
    .kOOOkk.
    kOOOOOOk
    kOoOOoOk
    kkkkkkkk
  `)];
  // 바가지 모자: a yellow dipper upside down, its thin handle sticking out behind
  IT.h5 = [[6, 4], A(`
    .....kkk..
    ....kLYYk.
    ...kLYYYyk
    kkkkYYYYyk
    kyyykkkkkk
    kkkk......
  `)];
  // 고무장갑 볏: a red rubber glove pulled over the head, its pink cuff on the brow and the fingers splayed up like a
  // rooster's comb - every finger its own way (never an even row of points: that would be the crown)
  IT.h6 = [[5, 6], A(`
    .....kk...
    ..kk.kRk..
    .kRRkkRkkk
    kRwkRkRkRk
    .kkRRRRRRk
    .kPwPPPPPk
    .kkkkkkkkk
  `)];
  // 거품 왕방울 머리: a heap of soap foam bubbles (ice white, grey shading, cyan glints; the top edge is ink, never white)
  IT.h7 = [[6, 6], A(`
    ......kkk...
    ..kkk.kwik..
    .kwiikiiiWk.
    kiiiWkicWWak
    kicWiiiiWaWk
    kaiWWaWWWaak
    kkkkkkkkkkkk
  `)];
  // 금테 양머리: the 양머리 in cream with gold spirals and a stitched gold rim line (no solid gold band, no red: never
  // the crown's look)
  IT.h8 = [[5, 5], A(`
    .kkk..kkk.
    kEwEkkEwEk
    kEyEkkEyEk
    kWEEEEEEWk
    kyEyEyEyEk
    kkkkkkkkkk
  `)];
  // 오리 머리띠: a headband, a spring, a tiny rubber duck on top
  IT.h9 = [[5, 6], A(`
    ....kkk...
    ...kYYYk..
    ...kYkYOk.
    .kkYYYYk..
    kYyYYYyk..
    .kkkakkkkk
    kOOOOOOOOk
  `)];
  // 맥반석 계란 투구: a roasted-egg shell helmet with a crack line
  IT.ha = [[5, 6], A(`
    ...kkkk...
    ..kfwffk..
    .kfwfffFk.
    .kfFffFfFk
    kfFfFFfFFk
    kffffffFFk
    kkkkkkkkkk
  `)];
  // 사우나 모자: a cream felt bucket hat with an orange band
  IT.hb = [[5, 5], A(`
    ..kkkkkk..
    .kEEEEEWk.
    .kEEEEEWk.
    .kOOOOOok.
    kEEEEEEEWk
    kkkkkkkkkk
  `)];
  // 황금 대야 투구: a golden washbasin upside down - a smooth dome on a rim, a white shine, a small cyan soap gem; no
  // points and no red (the crown's scheme stays unique)
  IT.hc = [[6, 6], A(`
    ...kkkkkk...
    ..kLwYYYYk..
    .kLwYYYYYyk.
    .kYYYcYYYyk.
    kkkkkkkkkkkk
    kLYYYYYYYYyk
    kkkkkkkkkkkk
  `)];
  // ---- 얼굴 (f): [profile, front], over the eyes (ANCHORS E); both frames in one box with one pivot
  // 하트 볼터치: a little heart on the cheek below the near eye (front: on both cheeks); a q rim instead of ink
  IT.f1 = [[4, 0], A(`
    .........
    ...q.q...
    ...qPq...
    ....q....
  `), A(`
    .........
    q.q...q.q
    qPq...qPq
    .q.....q.
  `)];
  // 수경: a cyan swim-goggle lens and its blue strap (front: two lenses, the strap as the bridge)
  IT.f2 = [[4, 1], A(`
    ..kkkkk..
    ..Bkcwk..
    ..kkkkk..
  `), A(`
    kkkk.kkkk
    kcwkBkcwk
    kkkk.kkkk
  `)];
  // 새내기 별 스티커: a 3x3 violet star sticker with a white sparkle under the eye (front: under the right-hand eye), its
  // gaps in ink. Never yellow (review 2026-10-18: the yellow star vanished on the duck) and never pink (it sat on the
  // penguin's pink towel and next to f1's pink heart): violet reads on all six bodies and is no other face item's colour
  IT.f3 = [[4, 0], A(`
    .........
    .........
    ...kvk...
    ...vwv...
    ...vkv...
  `), A(`
    .........
    .........
    ......kvk
    ......vwv
    ......vkv
  `)];
  // 김서림 안경: round glasses, the lenses fogged white
  IT.f4 = [[4, 1], A(`
    ....kk...
    ..kkWwk..
    ....kk...
  `), A(`
    .kk...kk.
    kWwkkkWwk
    .kk...kk.
  `)];
  // 선글라스: a black bar lens with a 1 px white glint
  IT.f5 = [[4, 1], A(`
    ...kkkk..
    ..kkdwk..
    ...kkk...
  `), A(`
    kkkkkkkkk
    kdwkkkdwk
    .kkk.kkk.
  `)];
  // 오이 팩: a cool cucumber slice over the eye (front: one on each eye); a dark-green rind instead of ink
  IT.f6 = [[4, 1], A(`
    ...MMM...
    ..MnmnM..
    ...MMM...
  `), A(`
    .MMM.MMM.
    MnmnMnmnM
    .MMM.MMM.
  `)];
  // 황금 외알 안경: a gold monocle ring round the near eye - a light-gold rim top-left, dark gold (y, o) round the rest,
  // the pupil seen through the lens with a white glint - and its chain dangling at the back (front: on the right-hand
  // eye, the chain on the outer side). Never Y next to the eye (review 2026-10-18: a yellow ring vanished on the duck and
  // its ink over the eye read as a frown); no ink above the eye but the far corner
  IT.f7 = [[4, 1], A(`
    ....Lyk...
    ..yykwy...
    ..k.yok...
  `), A(`
    ......Lyk.
    .....ykwyy
    .....kyokk
  `)];
  // ---- 목 (n): in front, the top-centre at the throat (ANCHORS N)
  // 초록 때타월 리본: the starter's little green bow
  IT.n1 = [[2, 0], A(`
    kk.kk
    tTkTt
    kk.kk
  `)];
  // 수건 목도리: a white / blue striped towel scarf, one end hanging at the front
  IT.n2 = [[4, 0], A(`
    kbwbwbwk
    kwbwbwbk
    kkkkkwbk
    .....kkk
  `)];
  // 딸랑 방울: a red collar with a gold bell
  IT.n3 = [[4, 0], A(`
    kRRRRRRk
    kkkkYYkk
    ...kYyk.
    ....kk..
  `)];
  // 나비넥타이: a navy bow tie with a white dot
  IT.n4 = [[3, 0], A(`
    kk...kk
    k2wk21k
    kk...kk
  `)];
  // 사물함 열쇠 목걸이: the orange locker-key coil and its grey tag
  IT.n5 = [[4, 0], A(`
    kOoOoOok
    kkkkkakk
    ....kWak
    ....kkk.
  `)];
  // 거품 진주 목걸이: soap-bubble pearls strung in a V that hangs 1 px below the throat (the empty top row) - cyan beads
  // up the sides, the bottom pearl with one white highlight pixel, the ink only along the outside (review 2026-10-18: a
  // straight row of white pearls with ink between them, right under the mouth, read as a toothy grin). 3 rows below
  // the empty one: the otter's dash has its throat at row 12, and nothing goes below row 15
  IT.n6 = [[4, 0], A(`
    ........
    kc....ck
    .kc..ck.
    ..kwck..
  `)];
  // 세신 달인 금메달: a ribbon V and a gold disc
  IT.n7 = [[2, 0], A(`
    kRkkRk
    .kRRk.
    kYLYyk
    .kyyk.
  `)];
  // 꽃 목걸이: a garland of pink, yellow and violet flowers
  IT.n8 = [[5, 0], A(`
    k.p..Y..vk
    kpYpYPYvYv
    k.pM.YM.vk
  `)];
  // ---- 등 (b): behind the body, attached at the shoulder (ANCHORS B), reaching back and up; tubes (b2 b3) at the
  // waist (ANCHORS W): frame 0 = the far half (behind the body), frame 1 = the near half (in front)
  // 망토 수건: a pink striped towel cape - a white shoulder band lying over the neck (it shows in the notch between the
  // head and the back, ink above and below it), then the towel hanging down the back with vertical P / p stripes,
  // flaring 1 px, and a fringed hem. 8 wide: it shows up to 4 px behind the back (review 2026-10-18: the old 6-wide
  // strip showed 2 px and read as a pink tail)
  IT.b1 = [[7, 3], A(`
    ...kkkkk
    ..kwwwwk
    .kkkkkkk
    .kPpPpPk
    .kPpPpPk
    kPpPpPpk
    kPpPpPpk
    kPpPpPpk
    kqkqkqkk
  `)];
  // 도넛 튜브: a pink glazed donut ring with sprinkles
  IT.b2 = [[7, 2], A(`
    ..kkkkkkkkkk..
    .kPPwPPPPPPPk.
    kPPpkkkkkkpPPk
    kppk......kppk
    .kk........kk.
  `), A(`
    ..............
    .kkkkkkkkkkkk.
    kPwPYPPcPPYPPk
    kPPPPPPPPPPPpk
    .kppppppppppk.
  `)];
  // 오리 튜브: a yellow ring with a rubber duck's head at the front
  IT.b3 = [[7, 2], A(`
    ..kkkkkkkkkk..
    .kYYLYYYYYYYk.
    kYYykkkkkkyYYk
    kyyk......kyyk
    .kk........kk.
  `), A(`
    .........kkk..
    ........kYYYk.
    kkkkkkkkkYkYOk
    kYLYYYYYYYYYyk
    .kyyyyyyyyyyk.
  `)];
  // 목욕 바구니 배낭: a pink bath basket worn on the back, a shampoo bottle sticking out. 8 wide (was 7): it shows 4 px
  // behind the back, 3 of them weave (review 2026-10-18: behind the cat's tail only 2 px of weave showed)
  IT.b4 = [[7, 4], A(`
    .kk.....
    kcwk....
    kcck....
    kkkkkkkk
    kpqpqpqk
    kqpqpqpk
    kpqpqpqk
    kkkkkkkk
  `)];
  // 바가지 등껍질: a green dipper worn like a turtle's shell, its rim against the back
  IT.b5 = [[7, 3], A(`
    ..kkkkk.
    .knmttkk
    kntmtTTk
    ktmtTTMk
    kttTTTMk
    .kMMMMkk
    ..kkkk..
  `)];
  // 비누방울 날개: two POINTED wings in bubble colours, a cyan one sweeping up and a violet one back (never round, no
  // white shine dot: that is a free bubble)
  IT.b6 = [[7, 4], A(`
    kk......
    kcck....
    .kicck..
    ..kiicck
    kkkkviik
    kvvvvvik
    .kkvvvkk
    ...kkk..
  `)];
  // 무지개 망토: a rainbow cape fluttering down behind
  IT.b7 = [[6, 3], A(`
    ...kkkk
    ..kRRRk
    .kOOOOk
    kYYYYYk
    .kttttk
    kbbbbbk
    kvvvvvk
    .kRRRRk
    kOOOOOk
    kkk.kkk
  `)];
  // ---- the 뽑기's draw-only worn items (design/gacha.md 4.2; GA1). Same pivots and limits as the shop items above
  // 진주 이태리타올: a puffy pearl-white scrub mitt lying across the head - the open cuff behind with a green stitched
  // band, a thumb bump on the top-back, a diagonal W weave, one v sheen. No gold, no points, no red (hc / the crown)
  IT.hd = [[5, 5], A(`
    .kkk.kkkk.
    kiwWkiiwWk
    ktWwwWwwik
    kTwWwwWvwk
    ktwwWwwWk.
    kkkkkkkkk.
  `)];
  // 딸기우유 모자: a pink 단지 jar on the head, its white lid band in ink, a cyan straw rising at the back and bent
  // backwards (its top pixel ink), a w glint
  IT.he = [[4, 6], A(`
    kk......
    kck.....
    .kCkkkk.
    .kwWwWk.
    kPwPPPpk
    kpPPPPpk
    kkqqqqkk
  `)];
  // 오리 잠수경: [profile, front] orange-framed goggles round a cyan lens (w glint), the B strap behind; front: two
  // 3x1 lenses, the bill as one O pixel on the bridge row. No Y near the eye (f7's lesson on the duck)
  IT.f8 = [[4, 1], A(`
    ..kkOOk..
    ..BOcwO..
    ..kkook..
    .........
  `), A(`
    kOOOkOOOk
    OcwcOcwcO
    kooo.oook
    .........
  `)];
  // 거품 수염: [profile, front] a curly soap-foam mustache 2 rows under the eye, outlined in its own grey W (RIM)
  IT.f9 = [[4, 0], A(`
    .........
    .........
    ...WWiW..
    ...WiwW..
  `), A(`
    .........
    .........
    .WWW.WWW.
    WiwiWiwiW
  `)];
  // 냉탕 얼음 목걸이: a dark-blue cord as one row, a SQUARE 3x2 ice cube hanging at the centre (I / i, a B edge, a w
  // glint; never round, no c + w: that is the bubble)
  IT.n9 = [[4, 0], A(`
    kBBBBBBk
    ..kiwIk.
    ..kIIBk.
    ..kkkkk.
  `)];
  // 무지개 비누 목걸이: a grey string with six tiny soap bars R O Y t b v in a shallow U (the middle two 1 px lower)
  IT.na = [[5, 0], A(`
    kaROaabvak
    .kROYtbvk.
    ..kkYtkk..
  `)];
  // 샴푸 제트팩: two upright shampoo bottles side by side (cyan furthest back: it is what shows past the body), white
  // pump caps, dark nozzles, a side fin each (C / q), two grey straps meeting at the shoulder. No flames, no puff,
  // nothing below the feet; the cyan, the straps and the fins tell it from b4's pink basket
  IT.b8 = [[7, 3], A(`
    .kk.kk..
    kwWkwWk.
    kkkkkkak
    kcCkPPka
    CcCkPpak
    kcCkPpkk
    kcCkPpqk
    kCCkqqkk
    .kdk.kd.
  `)];
  // 선녀 날개옷: a floating pastel shawl in an OPEN S - from the shoulder it rises back over it, sweeps down behind the
  // back and flutters out at the bottom-left; a 2 px band v -> P -> c with an i edge, two L sparkles (never a ring)
  IT.b9 = [[7, 3], A(`
    ..kkkk..
    .kivvvk.
    kivkkvvk
    kvk..kvk
    kPk...k.
    kPPk....
    .kPPk.L.
    ..kcck..
    .kcck...
    kcck.L..
  `)];
  // IT[id] = [pivot, ...frames] -> SPR.it_<id> and PG.ITEM_PIVOT[id] = [px, py] (one pivot for every frame of the item;
  // the tools also accept [[px, py], ...] per frame). The 효과 slot (e1..e6) has no worn art, only its ic_e<n> icon
  PG.ITEM_PIVOT = {};
  PG.ITEM_SIZE = {};
  for (const id of Object.keys(IT)) {
    const [pv, ...frames] = IT[id];
    SPR['it_' + id] = frames;
    PG.ITEM_PIVOT[id] = pv;
  }
  // ---------------------------------------------------------------- the 뽑기 (design/gacha.md §8; GA1 / GA2)
  // the two draw-only 효과 icons (8x8, beside ic_e1..e6): two ducklings following (the far one small, up-left; a clear
  // gap between them, ink alone vanishes on the dark cells), the ♨ mark (three S-curled wisps over a round bath)
  SPR.ic_e7 = [A(`
    .kk.....
    kYwO....
    kyYk.kk.
    .kk.kYwO
    ..kkkYYk
    .kYYYYYk
    .kyyYYyk
    ..kkkkk.
  `)];
  SPR.ic_e8 = [A(`
    ..p..p..
    .p..p..p
    .p..p..p
    ..E..E..
    kk....kk
    kWwwwwWk
    .kWWWWk.
    ..kkkk..
  `)];
  // e7's duckling (5x4; frame 1 lifts the back foot): a Y body with a y shade, k outline, a w eye with k beside, an O
  // bill at the front; the round head's top is bare Y (inked, it read as a dash on the dark floors). game.js's
  // drawDucklings draws two of them behind the wearer's heel (gacha.md 4.3)
  SPR.fx_duck = [A(`
    ..YY.
    kYwkO
    kyYYk
    .k.k.
  `), A(`
    ..YY.
    kYwkO
    kyYYk
    ...k.
  `)];
  // the small capsule (8x8): the 상점's "뽑기" price line and its button
  SPR.ic_cap = [A(`
    ..kkkk..
    .kwPPPk.
    kPPPPPpk
    kPPPPPpk
    kkkkkkkk
    kwwwwwwk
    .kwwwwk.
    ..kkkk..
  `)];
  // 비누 캡슐 뽑기 기계 (20x28, drawn at 4, 3 of the 32x32 view: its feet on row 30): a round glass dome with a w shine
  // arc and nine 2x2 capsules (h / E, t, v, Y tops on w), a pink body (P, p shading, q base and feet) with a round
  // bubble emblem, a coin slot (k over a), the chute bottom-left (a k frame round a 6x5 d opening), the crank's axle
  // stub at the right. No R, no crown
  SPR.gacha = [A(`
    ......kkkkkkkk......
    ....kkiccccccikk....
    ...kwccccicccccck...
    ..kwciccccccicccck..
    ..kwcccciccccccick..
    .kccicccccEEcccccck.
    .kccccciccwwcciccck.
    kccicvvcYYicttcccick
    kccccwwcwwccwwccccck
    kcihhcttcivvcYYcEEck
    kccwwiwwccwwiwwcwwck
    .kiiciiiiciiiiciiik.
    .kkkkkkkkkkkkkkkkkk.
    .kppppppppppppppppk.
    .kPPPPPPkkkPPPPPppka
    .kPPPPPkwcckPPPPppk.
    .kPPPPPkccckPPPPppk.
    .kPPPPPkcCCkPPPPppk.
    .kPPPPPPkkkPPPPPppk.
    .kkkkkkkkPPPPPPPppk.
    .kddddddkPPPkkkPppk.
    .kddddddkPPPaaaPppk.
    .kddddddkPPPPPPPppk.
    .kddddddkPPPPPPPppk.
    .kddddddkPPPPPPPppk.
    .kkkkkkkkPPPPPPPppk.
    .kqqqqqqqqqqqqqqqqk.
    .kqqqk........kqqqk.
  `)];
  // the crank (7x7, drawn at 24, 14): a grey hub (a / W, ink) with its pink knob at 12, 3, 6 and 9 o'clock
  SPR.gacha_h = [A(`
    ...k...
    ..kpk..
    .kWaak.
    akaWak.
    .kaaak.
    ..kkk..
    .......
  `), A(`
    .......
    ..kkk..
    .kWaak.
    akaWapk
    .kaaak.
    ..kkk..
    .......
  `), A(`
    .......
    ..kkk..
    .kWaak.
    akaWak.
    .kaaak.
    ..kpk..
    ...k...
  `), A(`
    .......
    ..kkk..
    .kWaak.
    kpaWak.
    .kaaak.
    ..kkk..
    .......
  `)];
  // a closed capsule (6x6) by rarity 보통 고급 희귀 전설: the top half E / h, t / T, v / V, Y / y, the bottom half w / W,
  // the ink seam between them (two colours and a seam: never a free bubble); cap_t = the top half alone (the pop),
  // cap_b = the white bottom half
  SPR.cap = [['E', 'h'], ['t', 'T'], ['v', 'V'], ['Y', 'y']].map(([a, b]) => A(`
    .kkkk.
    kw${a}${a}${a}k
    k${a}${a}${a}${b}k
    kkkkkk
    kwwwWk
    .kkkk.
  `));
  SPR.cap_t = [['E', 'h'], ['t', 'T'], ['v', 'V'], ['Y', 'y']].map(([a, b]) => A(`
    .kkkk.
    kw${a}${a}${b}k
    kkkkkk
  `));
  SPR.cap_b = [A(`
    kkkkkk
    kwwwWk
    .kkkk.
  `)];
  // every shop sprite's [w, h] by sprite name (it_*, ic_*, slot_*, fx_*, coin, shop, lock and the 뽑기's gacha, gacha_h,
  // cap, cap_t, cap_b - exact names: /^cap/ would take the capybara; all frames of one sprite share
  // it): game.js's sizeOf reads it (S2), so OPT_SPR's size filter drops a misshapen frame instead of a stand-in box
  for (const n of Object.keys(SPR)) if (/^(it_|ic_|slot_|fx_)|^(coin|shop|lock|gacha|gacha_h|cap|cap_t|cap_b)$/.test(n)) PG.ITEM_SIZE[n] = [SPR[n][0][0].length, SPR[n][0].length];

  // ---------------------------------------------------------------- v4 shop: where worn items sit (design/shop.md 6.1)
  // per animal: face 'p' (profile: one eye shows) or 'f' (front: two eyes); base = [Hx, Hy, Ex, Ey, Nx, Ny, Bx, By, Wx, Wy]
  // of the idle frame 0; off: per sprite name, per frame, [dx, dy] added to every point (and to the hide box), or a full
  // 10-number array (a -1, -1 pair = no such point in that frame; the curled capy_slam / cat_flip drop B and W) that may
  // carry its own hide box as numbers 11-14 (without them the base hide box applies, unmoved); hide: [x0, y0, x1, y1]
  // pixels erased under a hat (the capy's yuzu, the cat's ears); port: the 32x32 portrait's [Hx, Hy, Ex, Ey, Nx, Ny]
  // (items at 2x: an item's pivot pixel becomes a 2x2 block whose top-left corner is the anchor), porthide: the same
  // erase box on the portrait. An item's pivot pixel (PG.ITEM_PIVOT) lands ON its anchor pixel.
  //   H = 1 px below the head's top fill row (a brim overlaps the head; cat / frog: 2 px above the pupils, so a hat
  //   covers the ears / sits on the eye bumps); E = profile: the left pixel of the near eye, front: the eyes' midpoint;
  //   N = the throat; B = the back of the neck, where 등 items attach (they reach back and up and show behind the body);
  //   W = the waist. tools/anchors.js prints the draft measured from the art; check-sprites places every item on
  //   every anchored frame (6.3). Whoever redraws a frame fixes its anchors here.
  PG.ANCHORS = {
    duck: { face: 'p', base: [9, 2, 10, 4, 11, 7, 3, 6, 8, 11],
      off: { duck_idle: [[0, 0], [0, 1]], duck_walk: [[0, 0], [0, -1], [0, 0], [0, -1]], duck_jump: [[0, -1]], duck_fall: [[0, 0]],
        duck_shoot: [[0, 0]], duck_glide: [[0, 0], [0, -1]] }, port: [15, 5, 18, 10, 17, 24] },
    // the yuzu is cleared under a hat; in the slam the yuzu lifts off and so does the hat (H.y 3)
    capy: { face: 'p', base: [11, 5, 12, 7, 12, 10, 4, 6, 8, 11], hide: [9, 0, 14, 3],
      off: { capy_idle: [[0, 0], [0, 1]], capy_walk: [[0, 0], [0, -1], [0, 0], [0, -1]], capy_jump: [[0, -1]], capy_fall: [[0, -1]],
        capy_shoot: [[0, 0]], capy_slam: [[11, 3, 12, 6, 12, 10, -1, -1, -1, -1, 9, 0, 13, 2]] },
      port: [16, 8, 18, 12, 18, 23], porthide: [9, 0, 16, 6] },
    otter: { face: 'p', base: [9, 2, 10, 4, 12, 8, 5, 6, 9, 11],
      off: { otter_idle: [[0, 0], [0, 0]], otter_walk: [[0, 0], [0, -1], [-1, 0], [0, -1]], otter_jump: [[0, -1]], otter_fall: [[0, -1]],
        otter_shoot: [[0, 0]], otter_dash: [[10, 7, 10, 8, 12, 12, 5, 9, 7, 11]] }, port: [15, 6, 20, 12, 16, 25] },
    // walk 0 / 2 lean only rows 0-7: full arrays keep B at x 4 (a [dx, 0] would push a wing 5 px behind the flipper)
    penguin: { face: 'p', base: [8, 3, 9, 5, 9, 7, 4, 7, 8, 11],
      off: { penguin_idle: [[0, 0], [0, 1]], penguin_walk: [[7, 3, 8, 5, 8, 7, 4, 7, 8, 11], [0, -1], [9, 3, 10, 5, 10, 7, 4, 7, 8, 11], [0, -1]],
        penguin_jump: [[0, -1]], penguin_fall: [[0, -1]], penguin_shoot: [[0, 0]], penguin_slide: [[11, 7, 12, 8, 9, 9, 5, 7, 7, 10]] },
      port: [15, 4, 19, 14, 17, 24] },
    // a hat covers the head top, so the ears are cleared under it (ear tips poking out round a hat looked broken).
    // B sits high on the tail (y 5, was 7: review 2026-10-18): a 등 item can show only left of the 4-px striped tail
    // (B.x 3 is the least that keeps the 8-wide b5 / b6 inside the composite), so it rises to show its top over the
    // tail's tip - b1's shoulder band, b4's bottle and rim, b7's top stripe
    cat: { face: 'f', base: [9, 4, 10, 6, 10, 9, 3, 5, 8, 11], hide: [4, 0, 15, 3],
      off: { cat_idle: [[0, 0], [0, 1]], cat_walk: [[0, 0], [0, -1], [0, 0], [0, -1]], cat_jump: [[0, -1]], cat_fall: [[0, -1]],
        cat_shoot: [[0, 0]], cat_flip: [[9, 4, 9, 6, 9, 9, -1, -1, -1, -1, 3, 0, 14, 3]] },
      port: [16, 8, 15, 17, 16, 27], porthide: [4, 0, 27, 6] },
    frog: { face: 'f', base: [9, 3, 9, 5, 9, 9, 3, 8, 8, 11],
      off: { frog_idle: [[0, 0], [0, 1]], frog_walk: [[0, 0], [0, -1], [0, -1], [0, -1]], frog_jump: [[0, -1]], frog_fall: [[0, -1]],
        frog_shoot: [[0, 0]] }, port: [15, 4, 15, 7, 16, 25] },
  };

  PG.PALETTE = PALETTE;
  PG.SPRITES = SPR;
  PG.THEMES = [
    { name: '민트 타일', bg: '#0b2427', bgTile: '#0f2f33', grout: '#08191c', tile: 'tile_0' },
    { name: '분홍 타일', bg: '#26122a', bgTile: '#311836', grout: '#1a0b1d', tile: 'tile_1' },
    { name: '하늘 타일', bg: '#0c1a33', bgTile: '#112442', grout: '#081223', tile: 'tile_2' },
    { name: '노랑 타일', bg: '#251e0f', bgTile: '#302716', grout: '#191409', tile: 'tile_3' },
    { name: '대리석', bg: '#171a2c', bgTile: '#1f2339', grout: '#0f111d', tile: 'tile_4' },
  ];
})(window.PG);
