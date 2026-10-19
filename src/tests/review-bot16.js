// Level-design review: attract-autopilot difficulty proxy over 16 seeds per round (hash #a-b = entry range, 1-based; 24 entries).
// Boss arenas are skipped: the attract autopilot does not fight bosses (test-v2-boss.html#bot1..#bot4 measures those).
(function () {
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30);
    const D = PG.debug, G = D.G, LV = D.levels();
    const m = (location.hash || '#1-24').slice(1).split('-').map(Number);
    const ov = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    for (let i = m[0] - 1; i < m[1]; i++) {
      if (LV[i].boss) { console.log(`B16 R${i + 1} ${LV[i].name} | boss arena: skipped (see test-v2-boss.html#bot1..#bot4)`); continue; }
      const hits = [], clears = [];
      for (let s = 1; s <= 16; s++) {
        D.seed(s * 7919 + i * 13); D.start(i); D.setInvincible(true); G.attract = true; G.mode = 'title';
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
      hits.sort((a, b) => a - b);
      const ok = clears.filter((c) => c > 0).sort((a, b) => a - b);
      const mean = hits.reduce((a, b) => a + b, 0) / 16;
      const sd = Math.sqrt(hits.reduce((a, b) => a + (b - mean) * (b - mean), 0) / 15);
      console.log(`B16 R${i + 1} ${LV[i].name} | hits mean ${mean.toFixed(2)} (se ${(sd / 4).toFixed(2)}) median ${hits[8]} | clears ${ok.length}/16 median ${ok.length ? ok[ok.length >> 1] : '-'}f`);
    }
    console.log('B16 DONE');
  }
  go();
})();
