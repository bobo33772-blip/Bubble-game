// Level-design review: what happens to a new player who just holds RIGHT from the first frame
// (walks along the floor, usually drops through the floor gap and re-enters from the ceiling gap)?
// Logs the time of the first death and the killer's spawn cell, over 6 seeds.
// node tools/run-chrome.js test-review-firsthit.html - 900 760 60000
(function () {
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30);
    const D = PG.debug, G = D.G;
    const LV = D.levels();
    for (let i = 0; i < LV.length; i++) {
      if (LV[i].boss || !LV[i].enemies.length) continue; // boss arenas are checked by the boss stage
      const res = [];
      let wrapT = -1;
      for (let s = 1; s <= 6; s++) {
        D.seed(s * 17 + i); D.start(i); D.setInvincible(false);
        const id0 = G.enemies[0].id;
        D.press('right', true);
        let out = '-';
        let lastY = G.p.y;
        for (let t = 1; t <= 600; t++) {
          const snap = G.enemies.map((e) => ({ id: e.id, type: e.type, st: e.state, x: e.x, y: e.y }));
          D.step(1);
          if (G.p.y < lastY - 100 && wrapT < 0) wrapT = t;
          lastY = G.p.y;
          if (G.mode === 'dying') {
            const p = G.p; let best = null, bd = 1e9;
            for (const e of G.enemies.map((q) => ({ id: q.id, type: q.type, st: q.state, x: q.x, y: q.y }))) { if (e.st !== 'active') continue; /* post-step: includes enemies that became active this frame */ const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } }
            const k = best ? best.id - id0 : -1; const d = k >= 0 ? PG.LEVELS[i].enemies[k] : null;
            out = `${t}f:${best ? best.type : '?'}(${d ? d.col + ',' + d.row : '?'})@duck(${(p.x / 8 + 0.5).toFixed(0)},${(p.y / 8 - 1).toFixed(0)})`;
            break;
          }
        }
        D.press('right', false);
        res.push(out);
      }
      console.log(`FH R${i + 1} ${LV[i].name} gapX=${(LV[i].gapX / 8).toFixed(1)} wrapped@${wrapT}f | ${res.join(' ')}`);
    }
    console.log('FH DONE');
  }
  go();
})();
