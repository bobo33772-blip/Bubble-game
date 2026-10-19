// Level-design review: how lethal is re-entering from the CEILING wrap gap?
// For each round, at several moments (t0 = 150..1500 frames, duck invincible until then), the duck is
// placed just under the ceiling gap falling (as after dropping through the floor gap) and gets no input
// for 45 frames (0.75 s). We count deaths and record the killer's spawn cell.
// node tools/run-chrome.js test-review-dropin.html - 900 760 60000
(function () {
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30);
    const D = PG.debug, G = D.G;
    const LV = D.levels();
    for (let i = 0; i < LV.length; i++) {
      if (PG.LEVELS[i] && PG.LEVELS[i].boss) continue; // boss arenas place no enemies
      let deaths = 0, trials = 0; const who = {};
      for (let s = 1; s <= 6; s++) {
        for (const t0 of [150, 450, 750, 1050, 1500]) {
          D.seed(s * 53 + i); D.start(i); D.setInvincible(true);
          const id0 = G.enemies[0].id;
          D.step(t0);
          if (G.mode !== 'playing') continue;
          const p = G.p; p.x = LV[i].gapX - 8; p.y = 8; p.vx = 0; p.vy = 2.5; p.onGround = false; p.invuln = 0;
          D.setInvincible(false); trials++;
          for (let t = 0; t < 45; t++) {
            const snap = G.enemies.map((e) => ({ id: e.id, type: e.type, st: e.state, x: e.x, y: e.y }));
            D.step(1);
            if (G.mode === 'dying') {
              deaths++;
              let best = null, bd = 1e9;
              for (const e of G.enemies.map((q) => ({ id: q.id, type: q.type, st: q.state, x: q.x, y: q.y }))) { if (e.st !== 'active') continue; /* post-step: includes enemies that became active this frame */ const d = Math.hypot(e.x - G.p.x, e.y - G.p.y); if (d < bd) { bd = d; best = e; } }
              const d = best ? PG.LEVELS[i].enemies[best.id - id0] : null;
              const key = best ? `${best.type}(${d.col},${d.row})` : 'drop?';
              who[key] = (who[key] || 0) + 1;
              break;
            }
          }
        }
      }
      console.log(`DI R${i + 1} ${LV[i].name} gap@${(LV[i].gapX / 8).toFixed(1)} | drop-in deaths ${deaths}/${trials} (${Math.round(100 * deaths / trials)}%) ${JSON.stringify(who)}`);
    }
    console.log('DI DONE');
  }
  go();
})();
