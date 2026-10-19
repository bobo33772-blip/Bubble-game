// Level-design review: does simply walking over each round's floor gap drop the duck through it?
// (the wrap gap is the genre's escape hatch). Logs the duck's path for a hold-right / hold-left walk.
(function () {
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30);
    const D = PG.debug, G = D.G;
    const LV = D.levels();
    if (location.hash === '#r13') {
      D.seed(3); D.start(14); D.setInvincible(true); D.step(130); // R13 번개 지그재그
      const p = G.p; p.x = 96; p.y = 200; p.vy = 0; D.step(2);
      D.press('right', true); D.step(56); D.press('right', false); D.step(1);
      // find ground enemies embedded in the floor after a while
      const src = document.getElementById('pg-canvas'), sh = document.createElement('canvas');
      sh.width = 768; sh.height = 672; sh.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;image-rendering:pixelated';
      document.body.appendChild(sh); const x = sh.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, 768, 672);
      console.log('GAP R13 duck x=' + p.x.toFixed(1) + ' y=' + p.y.toFixed(1) + ' onGround=' + p.onGround + ' (floor surface y=200)');
      let sunk = 0; for (let t = 0; t < 1800; t++) { D.step(1); for (const e of G.enemies) if (e.state === 'active' && e.onGround && Math.abs(e.y - 208) < 0.5) sunk++; }
      console.log('GAP R13 enemy-frames standing at y=208 (inside the floor) over 30 s: ' + sunk);
      console.log('GAP DONE'); return;
    }
    for (let i = 0; i < LV.length; i++) {
      const res = [];
      for (const dir of ['right', 'left']) {
        D.seed(3); D.start(i); D.setInvincible(true);
        for (const e of G.enemies) e.state = 'gone', e.gone = true; // empty the room
        G.enemies = []; G.clearT = -999999;
        // put the duck 3 tiles before the gap on the floor
        const gx = LV[i].gapX, gw = LV[i].map[25].split('').filter((c, k) => c === '.' && k > 1 && k < 30).length * 8;
        const p = G.p; p.x = dir === 'right' ? gx - gw / 2 - 32 : gx + gw / 2 + 16; p.y = 200; p.vy = 0;
        D.step(2);
        D.press(dir, true);
        let wrapped = -1, minY = 999, maxY = 0;
        let ly = G.p.y;
        for (let t = 0; t < 120; t++) { D.step(1); if (G.p.y < ly - 100 && wrapped < 0) wrapped = t; ly = G.p.y; maxY = Math.max(maxY, G.p.y); }
        D.press(dir, false);
        res.push(`${dir}: ${wrapped >= 0 ? 'falls through @' + wrapped + 'f' : 'walks over (maxY ' + maxY.toFixed(1) + ', end x ' + (G.p.x / 8).toFixed(1) + ' y ' + G.p.y.toFixed(1) + ' onGround ' + G.p.onGround + ')'}`);
      }
      console.log(`GAP R${i + 1} ${LV[i].name} gapW=${LV[i].map[25].slice(2, 30).split('').filter((c) => c === '.').length} | ${res.join(' | ')}`);
    }
    console.log('GAP DONE');
  }
  go();
})();
