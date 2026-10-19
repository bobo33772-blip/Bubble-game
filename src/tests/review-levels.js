// Level-design review contact sheets (reviewer driver).
// build.js turns this into C:/Temp/bogeul/test-review-levels.html. Select with location.hash:
//   #aK  rounds 4K..4K+3 right after the intro (enemies landed, ~130 frames), 2x2 grid at 2x
//   #bK  same rounds after ~12 s of scripted play with invincibility: the duck blows bubbles from its
//        spawn, so you can see where bubbles drift and cluster (gather point marked with a pink cross)
// e.g. node tools/run-chrome.js "test-review-levels.html#a0" C:/Temp/bogeul/rv-a0.png 1040 940 8000
(function () {
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30);
    const D = PG.debug, G = D.G;
    const h = (location.hash || '#a0').slice(1);
    const mode = h[0], k = +h.slice(1) || 0;
    const src = document.getElementById('pg-canvas');
    const sheet = document.createElement('canvas');
    const SC = 2;
    sheet.width = 2 * 256 * SC + 16; sheet.height = 2 * (224 * SC + 18) + 8;
    sheet.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;background:#000;image-rendering:pixelated';
    document.body.appendChild(sheet);
    const sx = sheet.getContext('2d');
    sx.imageSmoothingEnabled = false;
    sx.fillStyle = '#000'; sx.fillRect(0, 0, sheet.width, sheet.height);
    const n = D.levels().length;
    for (let j = 0; j < 4; j++) {
      const i = k * 4 + j;
      if (i >= n) break;
      D.seed(11 + i);
      D.start(i);
      D.setInvincible(true);
      if (mode === 'a') {
        D.step(130);
      } else {
        D.step(100);
        // blow a volley from the spawn area, walking a little between shots
        for (let s = 0; s < 8; s++) {
          const dir = s % 4 < 2 ? 'right' : 'left';
          D.press(dir, true); D.step(10); D.press(dir, false);
          D.press('shoot', true); D.step(1); D.press('shoot', false); D.step(14);
        }
        D.step(500);
      }
      const L = D.levels()[i];
      const ox = (j % 2) * (256 * SC + 16), oy = Math.floor(j / 2) * (224 * SC + 18 + 8);
      sx.fillStyle = '#fff'; sx.font = 'bold 14px sans-serif';
      const raw = PG.LEVELS[i];
      const st = D.getState();
      const kinds = st.bubbles.reduce((m, b) => { m[b.kind] = (m[b.kind] || 0) + 1; return m; }, {});
      sx.fillText(`R${i + 1} ${L.name} · theme ${raw.theme}${raw.special ? ' · ' + raw.special : ''} · enemies ${raw.enemies.length} · bubbles ${JSON.stringify(kinds)}`, ox + 4, oy + 14);
      sx.drawImage(src, ox, oy + 18, 256 * SC, 224 * SC);
      // gather marker
      const gx = ox + (L.gather.col * 8 + 4) * SC, gy = oy + 18 + (16 + L.gather.row * 8 + 4) * SC;
      sx.strokeStyle = '#ff3fa0'; sx.lineWidth = 2;
      sx.beginPath(); sx.moveTo(gx - 6, gy); sx.lineTo(gx + 6, gy); sx.moveTo(gx, gy - 6); sx.lineTo(gx, gy + 6); sx.stroke();
      console.log(`RV ${h} R${i + 1} mode=${st.phase} enemies=${st.enemies.map((e) => e.type[0] + ':' + e.state[0]).join(',')} bubbles=${JSON.stringify(kinds)}`);
    }
    console.log('RV DONE ' + h);
  }
  go();
})();
