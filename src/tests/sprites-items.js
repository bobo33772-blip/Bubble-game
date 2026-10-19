// Sprite showcase (sprites agent): pops every trapped enemy so they fly off and land as snack items.
(function () {
  function waitFor() {
    if (!window.PG || !window.PG.debug) return setTimeout(waitFor, 30);
    setTimeout(run, 50);
  }
  function run() {
    const D = PG.debug;
    try {
      D.seed(7);
      D.start(3);
      D.setInvincible(true);
      D.step(130);
      D.trapAll();
      D.step(30);
      D.popAll();
      D.step(36);
      const s = D.getState();
      console.log('ITEMS mode=' + s.phase + ' enemies=' + s.enemies.map((e) => e.type + ':' + e.state).join(',') + ' items=' + s.items);
    } catch (e) {
      console.log('ITEMS ERROR ' + (e && e.message));
    }
  }
  waitFor();
})();
