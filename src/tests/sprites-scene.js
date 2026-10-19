// Sprite showcase in the real engine (sprites agent): traps half the enemies, pops the rest into snacks,
// and leaves a mix of bubbles / trapped enemies / items / the duck on screen for a screenshot.
(function () {
  function waitFor() {
    if (!window.PG || !window.PG.debug) return setTimeout(waitFor, 30);
    setTimeout(run, 50);
  }
  function run() {
    const D = PG.debug;
    try {
      D.seed(42);
      D.start(Number(new URLSearchParams(location.search).get('round') || 0));
      D.setInvincible(true);
      D.step(130);
      D.press('shoot', true); D.step(2); D.press('shoot', false); D.step(16);
      D.press('right', true); D.step(30); D.press('right', false);
      D.press('shoot', true); D.step(2); D.press('shoot', false); D.step(40);
      D.trapAll();
      D.step(20);
      const s = D.getState();
      console.log('SCENE mode=' + s.phase + ' enemies=' + s.enemies.map((e) => e.type + ':' + e.state).join(',') +
        ' bubbles=' + s.bubbles.length + ' items=' + s.items);
      // freeze rendering so the screenshot shows exactly this state
      D.step(0);
    } catch (e) {
      console.log('SCENE ERROR ' + (e && e.message));
    }
  }
  waitFor();
})();
