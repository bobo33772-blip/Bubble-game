// Level-design review: (1) which spawn kills an idle duck first, per round (10 seeds);
// (2) 2nd loop: share of trapped bubbles that escape before they even reach the gather height.
(function () {
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30);
    const D = PG.debug, G = D.G;
    const LV = D.levels();
    for (let i = 0; i < LV.length; i++) {
      if (LV[i].boss || !LV[i].enemies.length) continue; // boss arenas are checked by the boss stage
      const who = {};
      for (let s = 1; s <= 10; s++) {
        D.seed(s * 97 + i); D.start(i); D.setInvincible(false);
        const id0 = G.enemies[0].id;
        for (let f = 0; f < 1800; f++) {
          const snap = G.enemies.map((e) => ({ id: e.id, type: e.type, st: e.state, x: e.x, y: e.y }));
          D.step(1);
          if (G.mode === 'dying') {
            let best = null, bd = 1e9;
            for (const e of G.enemies.map((q) => ({ id: q.id, type: q.type, st: q.state, x: q.x, y: q.y }))) { if (e.st !== 'active') continue; /* post-step: includes enemies that became active this frame */ const d = Math.hypot(e.x - G.p.x, e.y - G.p.y); if (d < bd) { bd = d; best = e; } }
            const d = PG.LEVELS[i].enemies[best.id - id0];
            const k = `${best.type}(${d.col},${d.row})`; who[k] = (who[k] || []); who[k].push(f);
            break;
          }
        }
      }
      // loop-2 float test
      D.seed(9 + i); D.start(i); G.loop = 1; D.gotoRound(i); D.setInvincible(true); D.step(130);
      const gy = 16 + LV[i].gather.row * 8 + 4;
      D.trapAll();
      const tb = G.bubbles.filter((b) => b.kind === 'trapped');
      const arrived = new Set(); let f = 0;
      while (f < 900 && tb.some((b) => !b.dead && !arrived.has(b.id))) { D.step(1); f++; for (const b of tb) if (!b.dead && b.y + 8 - gy < 16) arrived.add(b.id); }
      const esc = tb.filter((b) => !arrived.has(b.id)).length;
      G.loop = 0;
      console.log(`KL R${i + 1} ${LV[i].name} | idle killers ${Object.entries(who).map(([k, v]) => k + 'x' + v.length + '@' + Math.min(...v)).join(' ')} | loop2 trapMax ${tb.length ? tb[0].trapMax : '-'} escaped-before-gather ${esc}/${tb.length}`);
    }
    console.log('KL DONE');
  }
  go();
})();
