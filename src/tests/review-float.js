// Level-design review: trap every enemy where it landed and count how many trapped bubbles reach the
// gather cluster (centre within 24 px of the gather point) before the enemy escapes. Loop 1 and loop 2.
(function () {
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30);
    const D = PG.debug, G = D.G, LV = D.levels();
    let tot = [0, 0], arr = [0, 0];
    for (let i = 0; i < LV.length; i++) {
      const res = [];
      for (const loop of [0, 1]) {
        D.seed(9 + i); D.start(i); G.loop = loop; D.gotoRound(i); D.setInvincible(true); D.step(130);
        const gx = LV[i].gather.col * 8 + 4, gy = 16 + LV[i].gather.row * 8 + 4;
        D.trapAll();
        const tb = G.bubbles.filter((b) => b.kind === 'trapped');
        const ok = new Set(); let f = 0;
        while (f < 900 && tb.some((b) => !b.dead && !ok.has(b.id))) { D.step(1); f++; for (const b of tb) if (!b.dead && Math.hypot(b.x + 8 - gx, b.y + 8 - gy) < 24) ok.add(b.id); }
        res.push(`loop${loop + 1} trapMax ${tb.length ? tb[0].trapMax : '-'}: ${ok.size}/${tb.length} reach the cluster`);
        tot[loop] += tb.length; arr[loop] += ok.size;
        G.loop = 0;
      }
      console.log(`FL R${i + 1} ${LV[i].name} gather ${LV[i].gather.col},${LV[i].gather.row} | ${res.join(' | ')}`);
    }
    console.log(`FL TOTAL loop1 ${arr[0]}/${tot[0]} (${Math.round(100 * arr[0] / tot[0])}%) loop2 ${arr[1]}/${tot[1]} (${Math.round(100 * arr[1] / tot[1])}%)`);
    console.log('FL DONE');
  }
  go();
})();
