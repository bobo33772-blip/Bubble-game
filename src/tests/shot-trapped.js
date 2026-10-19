// Screenshot driver: round 3, the duck shoots a real bubble into a walking enemy (no trapAll shortcut),
// then the trapped bubble floats up while the remaining enemies keep moving.
(function () {
  function go() {
    if (!window.PG || !PG.debug) return setTimeout(go, 30);
    const D = PG.debug, G = D.G;
    D.seed(5); D.start(2); D.setInvincible(true);
    D.step(130);
    let trapped = 0;
    for (let k = 0; k < 400 && !trapped; k++) {
      const e = G.enemies.find((q) => q.state === 'active' && Math.abs(q.y - G.p.y) < 6);
      if (!e) {
        // walk toward the nearest ground enemy's x, hop if it is above
        const t = G.enemies.find((q) => q.state === 'active');
        if (!t) break;
        const dir = t.x > G.p.x ? 'right' : 'left';
        D.press(dir, true); D.step(4); D.press(dir, false);
        if (t.y < G.p.y - 10 && G.p.onGround && k % 8 === 0) { D.press('jump', true); D.step(1); D.press('jump', false); }
        D.step(2);
      } else {
        const dir = e.x > G.p.x ? 'right' : 'left';
        if (Math.abs(e.x - G.p.x) < 30) { D.press(dir === 'right' ? 'left' : 'right', true); D.step(8); D.press(dir === 'right' ? 'left' : 'right', false); }
        D.press(dir, true); D.step(1); D.press(dir, false);
        D.press('shoot', true); D.step(1); D.press('shoot', false); D.step(16);
      }
      trapped = G.enemies.filter((q) => q.state === 'trapped').length;
    }
    D.step(50);
    const s = D.getState();
    console.log('SHOT trapped mode=' + s.phase + ' trapped=' + trapped + ' enemies=' + s.enemies.map((e) => e.type + ':' + e.state).join(',') + ' bubbles=' + s.bubbles.map((b) => b.kind + ':' + b.state).join(','));
  }
  go();
})();
