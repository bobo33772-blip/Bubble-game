// Level-design review: can the duck actually pop bubbles resting at the gather point?
// Empty room; N empty bubbles are released around the gather point and left to settle (6 s).
// The duck is then put on the highest standable cell under the cluster and does ONE full jump straight up
// (holding jump, no steering). We count how many bubbles it pops (directly or by chain).
(function () {
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30);
    const D = PG.debug, G = D.G;
  const GATHER_PATCH = {"0":{"col":8,"row":2},"1":{"col":24,"row":2},"2":{"col":8,"row":4},"4":{"col":7,"row":2},"5":{"col":24,"row":2},"6":{"col":7,"row":2},"7":{"col":24,"row":2},"9":{"col":23,"row":2},"11":{"col":24,"row":2},"14":{"col":7,"row":2},"15":{"col":24,"row":4},"16":{"col":7,"row":2},"12":{"col":7,"row":2},"18":{"col":8,"row":2},"19":{"col":24,"row":2}}; // proposed gather points (0-based round index)
  if (location.hash === '#patched') { const LVp = PG.debug.levels(); const v2 = (k) => +k + (k >= 5) + (k >= 10) + (k >= 15); for (const k in GATHER_PATCH) LVp[v2(k)].gather = GATHER_PATCH[k]; LVp[14].map = LVp[14].map.slice(); LVp[14].map[0] = LVp[14].map[25] = '##############....##############'; LVp[14].gapX = 16 * 8; }
    const LV = D.levels();
    for (let i = 0; i < LV.length; i++) {
      if (LV[i].boss || !LV[i].enemies.length) continue; // boss arenas are checked by the boss stage
      const L = LV[i], m = L.map;
      const gx = L.gather.col * 8 + 4;
      const out = [];
      for (const N of [1, 6]) {
        D.seed(4); D.start(i); D.setInvincible(true);
        G.enemies = G.enemies.slice(0, 1); G.enemies[0].state = "descend"; G.enemies[0].delay = 1e9; G.stampT = 1e9; G.steamT = -1;
        for (let k = 0; k < N; k++) D.spawnBubble('empty', gx - 8 + (k % 3) * 6 - 6, 100 + k * 4);
        D.step(360);
        // highest standable cell within 3 columns of the cluster's centre column
        const bs = G.bubbles.filter((b) => !b.dead);
        const cx = bs.reduce((a, b) => a + b.x + 8, 0) / bs.length;
        const cc = Math.round((cx - 4) / 8);
        let perch = null;
        for (let r = 3; r < 26 && !perch; r++) for (let dc = 0; dc <= 3 && !perch; dc++) for (const c of [cc - dc, cc + dc]) {
          if (c >= 2 && c <= 29 && m[r][c] === '#' && m[r - 1][c] === '.') { perch = { r, c }; break; }
        }
        const before = G.bubbles.length;
        const p = G.p; p.x = perch.c * 8 - 4; p.y = (perch.r - 2) * 8 + 16; p.vy = 0; p.vx = 0; D.step(2);
        D.press('jump', true); D.step(70); D.press('jump', false); D.step(20);
        const popped = before - G.bubbles.length;
        const ys = bs.map((b) => Math.round(b.y + 8)).sort((a, b) => a - b);
        out.push(`N=${N}: cluster centre-y ${ys.join('/')} perch row ${perch.r} col ${perch.c} -> popped ${popped}/${before}`);
      }
      console.log(`GA R${i + 1} ${L.name} gather ${L.gather.col},${L.gather.row} | ${out.join(' | ')}`);
    }
    console.log('GA DONE');
  }
  go();
})();
