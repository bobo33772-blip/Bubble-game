// Screenshot scenarios selected by location.hash: #transition #over #ending #pause #dying #hurry #steam #touch #late
(function () {
  function go() {
    if (!window.PG || !PG.debug) return setTimeout(go, 30);
    const D = PG.debug, G = D.G, sc = (location.hash || '#late').slice(1);
    D.seed(7);
    if (sc === 'touch') {
      document.getElementById('pg-app').classList.add('pg-touch-on');
      window.dispatchEvent(new Event('resize'));
      D.start(2); D.step(150);
    } else if (sc === 'transition') {
      D.start(0); D.setInvincible(true); D.step(120); D.killAll(); D.step(180 + 85);
    } else if (sc === 'over') {
      D.start(4); D.step(120); G.score = 123450; G.lives = 1; D.setInvincible(false);
      const e = G.enemies.find((q) => q.state === 'active'); G.p.invuln = 0; e.x = G.p.x; e.y = G.p.y; D.step(1); D.step(100);
    } else if (sc === 'ending') {
      D.start(D.levels().length - 1); D.step(120); G.score = 987650; D.killAll();
      // (v2+: the last entry is a boss arena, whose defeat sequence runs longer than v1's 200 frames)
      for (let i = 0; i < 1800 && D.getState().phase !== 'ending'; i += 20) D.step(20);
      D.step(60);
    } else if (sc === 'pause') {
      D.start(7); D.step(200); D.pause();
    } else if (sc === 'dying') {
      D.start(1); D.step(120); D.setInvincible(false); const e = G.enemies.find((q) => q.state === 'active'); G.p.invuln = 0; e.x = G.p.x; e.y = G.p.y; D.step(30);
    } else if (sc === 'hurry') {
      D.start(10); D.setInvincible(true); D.step(2760);
    } else if (sc === 'steam') {
      const i = D.levels().findIndex((l) => l.special === 'steam'); D.start(i); D.setInvincible(true); D.step(150);
      G.steamT = 1; D.step(1); const b = G.bubbles.find((q) => q.kind === 'steam'); b.x = 60; b.y = 120; G.p.facing = 1; D.popAll(); D.step(14);
    } else if (sc === 'late') {
      D.start(16); D.setInvincible(true); D.step(150);
      for (let i = 0; i < 6; i++) { D.press(i % 2 ? 'left' : 'right', true); D.step(20); D.press(i % 2 ? 'left' : 'right', false); D.press('shoot', true); D.step(1); D.press('shoot', false); D.step(10); }
      D.trapAll(); D.step(60); D.popAll(); D.step(16);
    } else if (sc === 'cluster') {
      D.start(0); D.setInvincible(true); D.step(100);
      for (let i = 0; i < 12; i++) { D.press(i % 4 < 2 ? 'right' : 'left', true); D.step(12); D.press(i % 4 < 2 ? 'right' : 'left', false); D.press('shoot', true); D.step(1); D.press('shoot', false); D.step(15); if (i % 3 === 2) { D.press('jump', true); D.step(1); D.press('jump', false); D.step(20); } }
      D.step(300); D.trapAll(); D.step(40);
    } else if (sc.indexOf('round') === 0) {
      D.start(+sc.slice(5)); D.step(160);
    }
    console.log('SHOT ' + sc + ' mode=' + D.getState().phase + ' sw=' + document.documentElement.scrollWidth + ' sh=' + document.documentElement.scrollHeight + ' vw=' + innerWidth + ' vh=' + innerHeight);
  }
  go();
})();
