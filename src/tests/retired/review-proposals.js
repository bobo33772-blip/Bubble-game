// RETIRED in v2 (integration pass): build.js no longer builds this driver (it only reads src/tests/*.js).
// It pastes v1-era map rows / enemy spots / gather points over the v2 entries, so its BEFORE/AFTER numbers
// describe layouts that no longer exist (and it runs past run-chrome.js's 2-minute limit). Kept as a record only;
// current level-difficulty numbers come from review-bot16 / review-killers / review-dropin / test-v2-boss #botN.
// Level-design review: candidate fixes, applied in-page to the loaded round data, measured against the
// unpatched rounds with the same metrics as review-bot / review-killers / review-dropin.
// NOTE (fix pass): these proposals are now applied in src/levels.js, and rounds 11/13 were swapped afterwards,
// so the indices below refer to the pre-fix round order; this driver is kept only as a record of the measurement.
// Hash #shot9 renders the proposed round-9 duck at 2x for a visual check.
window.PG_REVIEW_PATCHES = {
  // round index (0-based): { map: {row: 'string'}, enemies: {index: {col,row,dir?}}, gather: {col,row} }
  // Same edits as C:/Temp/bogeul/final-patch.js (validated with tools/validate-levels.js --file).
  0: { gather: { col: 8, row: 2 } }, 1: { gather: { col: 24, row: 2 } }, 2: { gather: { col: 8, row: 4 } },
  4: { gather: { col: 7, row: 2 } }, 5: { gather: { col: 24, row: 2 } }, 6: { gather: { col: 7, row: 2 } },
  7: { gather: { col: 24, row: 2 } }, 9: { gather: { col: 23, row: 2 } }, 11: { gather: { col: 24, row: 2 } },
  14: { gather: { col: 7, row: 2 } }, 15: { gather: { col: 24, row: 4 } }, 16: { gather: { col: 7, row: 2 } },
  18: { gather: { col: 8, row: 2 } },
  8: { map: {                                                          // R9: closed duck outline (head ring, beak, eye, body ring)
         4: '##................#####.......##',
         5: '##...............#.....#......##',
         6: '##...............#...#.#####..##',
         7: '##..............########......##',
         11: '##.#......................#...##',
         12: '##.#......................#...##',
         14: '##.#.......................#..##',
         15: '##.#.......................#..##',
         17: '##..#......................#..##',
         18: '##..#......................#..##',
         20: '##....#..................#....##',
         21: '##.....#................#.....##' },
       enemies: { 0: { col: 6, row: 17 } } },                        // R9: fly off the drop-in column
  12: { map: { 0: '##############....##############', 25: '##############....##############' }, gather: { col: 7, row: 2 } }, // R13: 4-wide gap
  19: { enemies: { 6: { col: 6, row: 16 }, 7: { col: 25, row: 16 } }, gather: { col: 24, row: 2 } }, // R20: flies start low at the sides
};
(function () {
  // v1 round index -> v2 entry index (boss arenas sit at 5/11/17/23)
  const v2 = (k) => +k + (k >= 5) + (k >= 10) + (k >= 15);
  function applyTo(LV) {
    for (const k in window.PG_REVIEW_PATCHES) {
      const P = window.PG_REVIEW_PATCHES[k], L = LV[v2(k)]; // keys are v1 round indices
      if (P.map) { L.map = L.map.slice(); for (const r in P.map) L.map[r] = P.map[r]; }
      if (P.gather) L.gather = Object.assign({}, P.gather);
      if (P.map) { const g = []; for (let c = 2; c < 30; c++) if (L.map[25][c] === '.') g.push(c); L.gapX = ((g[0] + g[g.length - 1] + 1) / 2) * 8; }
      if (P.enemies) { L.enemies = L.enemies.map((e) => Object.assign({}, e)); for (const i in P.enemies) Object.assign(L.enemies[i], P.enemies[i]); }
    }
  }
  window.PG_REVIEW_APPLY = applyTo;
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30);
    const D = PG.debug, G = D.G, LV = D.levels();
    const orig = LV.map((L) => ({ map: L.map, enemies: L.enemies, gather: L.gather, gapX: L.gapX }));
    const ov = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    function metrics(i) {
      const hits = [], clears = [], idle = [];
      for (let s = 1; s <= 8; s++) {
        D.seed(s * 131 + i); D.start(i); D.setInvincible(true); G.attract = true; G.mode = 'title';
        let h = 0, cd = 0, t = 0, clr = -1;
        while (t < 3600) {
          G.attractT = 0; D.step(1); t++;
          if (G.clearT >= 0) { clr = t; break; }
          if (cd > 0) { cd--; continue; }
          const p = G.p;
          if (G.enemies.some((e) => e.state === 'active' && ov(p.x + 4, p.y + 4, 8, 11, e.x + 3, e.y + 4, 10, 11)) || G.drops.some((d) => d.state === 'fall' && ov(p.x + 4, p.y + 4, 8, 11, d.x + 2, d.y + 1, 4, 7))) { h++; cd = 120; }
        }
        G.attract = false; hits.push(h); clears.push(clr);
      }
      for (let s = 1; s <= 10; s++) {
        D.seed(s * 97 + i); D.start(i); D.setInvincible(false);
        let f = 0; while (f < 1800 && G.mode !== 'dying') { D.step(1); f++; }
        idle.push(G.mode === 'dying' ? f : 1800);
      }
      let dd = 0, dt = 0;
      for (let s = 1; s <= 6; s++) for (const t0 of [150, 450, 750, 1050, 1500]) {
        D.seed(s * 53 + i); D.start(i); D.setInvincible(true); D.step(t0); if (G.mode !== 'playing') continue;
        const p = G.p; p.x = LV[i].gapX - 8; p.y = 8; p.vx = 0; p.vy = 2.5; p.onGround = false; p.invuln = 0; D.setInvincible(false); dt++;
        for (let t = 0; t < 45 && G.mode !== 'dying'; t++) D.step(1);
        if (G.mode === 'dying') dd++;
      }
      idle.sort((a, b) => a - b);
      const ok = clears.filter((c) => c > 0).sort((a, b) => a - b);
      return `bot hits avg ${(hits.reduce((a, b) => a + b, 0) / hits.length).toFixed(1)} clears ${ok.length}/8 med ${ok.length ? ok[ok.length >> 1] : '-'}f | idle death min ${idle[0]} med ${idle[5]} | drop-in deaths ${Math.round(100 * dd / dt)}%`;
    }
    const h = location.hash.slice(1);
    if (h === 'shot9') {
      applyTo(LV); LV[9].gapX = LV[9].gapX;
      D.seed(11); D.start(9); D.setInvincible(true); D.step(130);
      const src = document.getElementById('pg-canvas'), sh = document.createElement('canvas');
      sh.width = 512; sh.height = 448; sh.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;image-rendering:pixelated';
      document.body.appendChild(sh); const x = sh.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, 512, 448);
      console.log('RP DONE shot9'); return;
    }
    const rounds = Object.keys(window.PG_REVIEW_PATCHES).map(v2); // patch keys are v1 indices; measure the v2 entry
    for (const i of rounds) {
      Object.assign(LV[i], orig[i]);
      const before = metrics(i);
      applyTo(LV);
      const after = metrics(i);
      Object.assign(LV[i], orig[i]);
      console.log(`RP R${i + 1} ${LV[i].name} BEFORE: ${before}`);
      console.log(`RP R${i + 1} ${LV[i].name} AFTER : ${after}`);
    }
    console.log('RP DONE');
  }
  go();
})();
