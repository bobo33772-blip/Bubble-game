// Screenshot driver: starts round 1 and plays ~200 frames so the scene shows bubbles, enemies and HUD.
(function () {
  function go() {
    if (!window.PG || !PG.debug) return setTimeout(go, 30);
    const D = PG.debug;
    D.seed(42); D.start(0); D.setInvincible(true);
    D.step(90);
    D.press('right', true); D.step(24); D.press('right', false);
    for (let i = 0; i < 4; i++) { D.press('shoot', true); D.step(1); D.press('shoot', false); D.step(16); }
    D.press('jump', true); D.step(1); D.press('jump', false); D.step(30);
    const e = D.G.enemies.find((q) => q.state === 'active');
    if (e) { const b = D.spawnBubble('empty', e.x, e.y); D.G.bubbles.pop(); D.G.bubbles.push(b); }
    D.trapAll();
    D.step(40);
    D.spawnBubble('stamp', 150, 60);
    D.G.stamps = 3;
    D.step(4);
    console.log('SHOT state ' + JSON.stringify(D.getState()).slice(0, 300));
  }
  go();
})();
