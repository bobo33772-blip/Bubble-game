// Reviewer screenshot driver: duck walks into the 2-column floor gap of round 13 (v2 entry index 14) and ends up
// standing INSIDE the floor row at y=208 instead of wrapping; then keeps walking right along it.
//   node tools/run-chrome.js test-review-sunk-shot.html rv-sunk.png 900 760 8000
(function () {
  function run() {
    const D = PG.debug, G = D.G, LV = D.levels();
    let r = LV.findIndex((L) => L.map[25].split('').filter((ch, i) => i > 1 && i < 30 && ch === '.').length === 2);
    if (r < 0) {
      // the shipped rounds no longer have a 2-wide gap (R13 was widened): recreate the old R13 gap in-page
      // so this driver still exercises the engine's landing code on a 2-column gap
      r = 14; const L = LV[r]; L.map = L.map.slice();
      L.map[0] = L.map[25] = '###############..###############'; L.gapX = 16 * 8;
      console.log('SUNK note: no 2-col gap round shipped; patched round ' + (r + 1) + ' in-page to a 2-col gap');
    }
    D.seed(5); D.start(r); D.setInvincible(true); D.step(150);
    let g0 = 0; for (let c = 2; c < 30; c++) if (LV[r].map[25][c] === '.') { g0 = c * 8; break; }
    // park the enemies far up so they do not interfere
    for (const e of G.enemies) { if (e.state === 'active') { e.x = 30; e.y = 40; e.state = 'trapped'; e.bubble = null; } }
    D.setPlayer(g0 - 4, 200); G.p.onGround = true;
    D.press('right', true);
    const log = [];
    for (let f = 0; f < 70; f++) { D.step(1); if (f % 5 === 4) log.push(f + 1 + ':' + G.p.x.toFixed(1) + ',' + G.p.y.toFixed(1) + (G.p.onGround ? 'G' : '')); }
    D.press('right', false); D.step(1);
    console.log('SUNK round=' + r + ' name=' + LV[r].name + ' gapStartPx=' + g0 + ' trace=' + log.join(' '));
    console.log('SUNK final player ' + JSON.stringify(D.getState().player));
    // A charging sponge on the 3-column gap round as well
    const r3 = LV.findIndex((L, i) => L.map[25].split('').filter((ch, k) => k > 1 && k < 30 && ch === '.').length === 3 && L.enemies.some((e) => e.type === 'sponge'));
    if (r3 >= 0) {
      D.seed(5); D.start(r3); D.setInvincible(true); D.step(150);
      let h0 = 0; for (let c = 2; c < 30; c++) if (LV[r3].map[25][c] === '.') { h0 = c * 8; break; }
      const e = G.enemies.find((q) => q.type === 'sponge');
      G.enemies = [e];
      Object.assign(e, { state: 'active', angry: true, x: h0 - 4, y: 200, vx: 0, vy: 0, dir: 1, onGround: true, committed: true, chargeT: 50, windT: 0 });
      D.setPlayer(200, 40);
      let res = 'ok';
      for (let f = 0; f < 30; f++) { D.step(1); if (e.onGround && e.y > 200.5) { res = 'SUNK at y=' + e.y + ' x=' + e.x.toFixed(1); break; } if (e.y < 100) break; }
      console.log('SUNK sponge on 3-col gap round ' + r3 + ' (' + LV[r3].name + '): ' + res);
      // back to the duck screenshot
      D.seed(5); D.start(r); D.setInvincible(true); D.step(150);
      for (const q of G.enemies) { if (q.state === 'active') { q.x = 30; q.y = 40; q.state = 'trapped'; q.bubble = null; } }
      D.setPlayer(g0 - 4, 200); G.p.onGround = true; D.press('right', true); D.step(40); D.press('right', false); D.step(1);
      console.log('SUNK screenshot state ' + JSON.stringify(D.getState().player));
    }
    console.log('SUNK DONE');
  }
  function go() { if (!window.PG || !PG.debug) return setTimeout(go, 30); setTimeout(() => { try { run(); } catch (e) { console.log('SUNK exception ' + e.message); } }, 50); }
  go();
})();
