// Level-design review: after every enemy is trapped and the bubbles have drifted to the gather point,
// can the duck pop the whole cluster just by walking from its spawn into the floor wrap gap
// (re-entering from the ceiling gap straight through the cluster)? No jumping, no climbing.
(function () {
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30);
    const D = PG.debug, G = D.G, LV = D.levels();
  const GATHER_PATCH = {"0":{"col":8,"row":2},"1":{"col":24,"row":2},"2":{"col":8,"row":4},"4":{"col":7,"row":2},"5":{"col":24,"row":2},"6":{"col":7,"row":2},"7":{"col":24,"row":2},"9":{"col":23,"row":2},"11":{"col":24,"row":2},"14":{"col":7,"row":2},"15":{"col":24,"row":4},"16":{"col":7,"row":2},"12":{"col":7,"row":2},"18":{"col":8,"row":2},"19":{"col":24,"row":2}}; // proposed gather points (0-based round index)
  if (location.hash === '#patched') { const LVp = PG.debug.levels(); const v2 = (k) => +k + (k >= 5) + (k >= 10) + (k >= 15); for (const k in GATHER_PATCH) LVp[v2(k)].gather = GATHER_PATCH[k]; LVp[14].map = LVp[14].map.slice(); LVp[14].map[0] = LVp[14].map[25] = '##############....##############'; LVp[14].gapX = 16 * 8; }
    let free = 0;
    for (let i = 0; i < LV.length; i++) {
      D.seed(21 + i); D.start(i); D.setInvincible(true); D.step(130); D.trapAll();
      D.step(Math.min(220, G.trapTime - 200));
      const p = G.p; p.x = LV[i].player.col * 8 - 4; p.y = (LV[i].player.row + 1) * 8; p.vx = 0; p.vy = 0;
      const n0 = G.bubbles.filter((b) => b.kind === 'trapped' && !b.dead).length;
      const dir = LV[i].gapX > p.x ? 'right' : 'left';
      D.press(dir, true);
      let t = 0, wrapped = -1, ly = p.y; const deadIds = new Set();
      while (t < 240) { D.step(1); t++; for (const e of G.enemies) if (e.state === 'dead') deadIds.add(e.id); if (G.p.y < ly - 100 && wrapped < 0) { wrapped = t; D.press(dir, false); } ly = G.p.y; if (wrapped >= 0 && t > wrapped + 50) break; }
      D.press(dir, false);
      const killed = deadIds.size;
      if (wrapped >= 0 && killed >= n0 * 0.5) free++;
      console.log(`CH R${i + 1} ${LV[i].name} gather ${LV[i].gather.col},${LV[i].gather.row} gapX ${(LV[i].gapX / 8).toFixed(1)} | trapped ${n0} | wrapped ${wrapped >= 0 ? '@' + wrapped + 'f' : 'no'} | enemies killed by the fall ${killed}/${n0}`);
    }
    console.log(`CH rounds where >=half the trapped cluster pops from a no-jump floor-gap drop: ${free}/${LV.length}`);
    console.log('CH DONE');
  }
  go();
})();
