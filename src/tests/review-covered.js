// Reviewer probe: how often do characters come to rest on a tile whose cell above is also solid
// (i.e. standing embedded in a stacked/pillar tile), and how often below the floor row (y=208).
//   node tools/run-chrome.js test-review-covered.html - 900 760 60000
(function () {
  function run() {
    const D = PG.debug, G = D.G, LV = D.levels();
    const out = {};
    let s = 9; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    function support(map, b) {
      const feet = b.y + 16, r = Math.round((feet - 16) / 8);
      const c0 = Math.floor((b.x + 3) / 8), c1 = Math.floor((b.x + 13 - 0.001) / 8);
      let any = false, exposed = false;
      for (let c = c0; c <= c1; c++) { if (c < 2 || c > 29) continue; const row = map[((r % 26) + 26) % 26]; if (row[c] === '#') { any = true; const up = map[(((r - 1) % 26) + 26) % 26][c]; if (up !== '#' || r === 0) exposed = true; } }
      return { r, any, exposed };
    }
    for (let round = 0; round < LV.length; round++) {
      const map = LV[round].map; const rec = { coveredFrames: 0, sunkFrames: 0, events: [] };
      D.seed(100 + round); D.start(round); D.setInvincible(true);
      let prevBad = new Set();
      for (let f = 0; f < 6000; f++) {
        if (f % 8 === 0) { D.press('left', rnd() < 0.4); D.press('right', rnd() < 0.45); D.press('jump', rnd() < 0.35); D.press('shoot', rnd() < 0.15); }
        if (G.mode !== 'playing') { if (G.mode === 'transition' || G.round !== round) break; D.step(1); continue; }
        if (G.roundT > 1700) { G.roundT = 200; G.hurry = false; G.scald = false; G.drops = []; } // keep enemies around, avoid hurry chaos
        D.step(1);
        const bodies = [['duck', G.p]].concat(G.enemies.filter((e) => e.state === 'active' && e.type !== 'fly').map((e) => [e.type + '#' + e.id, e]));
        const bad = new Set();
        for (const [name, b] of bodies) {
          if (!b.onGround) continue;
          const sp = support(map, b);
          if (b.y + 16 > 216.5) { rec.sunkFrames++; bad.add(name + ' sunk'); }
          else if (sp.any && !sp.exposed) { rec.coveredFrames++; bad.add(name + ' covered r' + sp.r + ' x' + b.x.toFixed(0)); }
        }
        for (const k of bad) if (!prevBad.has(k) && rec.events.length < 4) rec.events.push('f' + f + ' ' + k);
        prevBad = bad;
      }
      for (const a of ['left', 'right', 'jump', 'shoot']) D.press(a, false);
      if (rec.coveredFrames || rec.sunkFrames) out[round + ' ' + LV[round].name] = rec;
    }
    console.log('COVERED ' + JSON.stringify(out));
    console.log('COVERED DONE');
  }
  function go() { if (!window.PG || !PG.debug) return setTimeout(go, 30); setTimeout(() => { try { run(); } catch (e) { console.log('COVERED exception ' + e.message + ' ' + e.stack); } }, 50); }
  go();
})();
