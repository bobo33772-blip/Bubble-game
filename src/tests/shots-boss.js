// Boss screenshot scenes (built to C:/Temp/bogeul/test-shots-boss.html). Scene from the hash: #<boss>-<scene>
//   boss  = 1..4 (왕때꼬마, 곰팡이 여왕, 대왕 수세미, 이태리 타올 대마왕)
//   scene = intro | mid | stun | down | defeat | p3 (phase 3 mid-fight) | hop (boss 1 mid-hop: landing shadow;
//           boss 3: squatting before a hop) | over (the banner after the defeat, 1 s later)
//   node tools/run-chrome.js "test-shots-boss.html#1-mid" C:/Temp/bogeul/boss1-mid.png 900 760 6000
(function () {
  const IDX = [5, 11, 17, 23];
  function go() { if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30); setTimeout(run, 2500); } // let the web fonts load
  window.addEventListener('error', (e) => console.log('SHOT page error ' + e.message + ' @' + e.lineno));
  function run() {
    const D = PG.debug, G = D.G;
    const m = /^#(\d)-(\w+)/.exec(location.hash) || [0, '1', 'mid'];
    const n = +m[1], scene = m[2], i = IDX[n - 1];
    const until = (cond, max) => { for (let k = 0; k < max; k++) { if (cond()) return k; D.step(1); } return -1; };
    D.seed(40 + n); D.start(i); D.setInvincible(true);
    const B = () => G.boss;
    // move the duck to a fair spot for the camera
    const place = (x) => { D.setPlayer(x, G.p.y); };
    if (scene === 'intro') {
      D.step(96);
    } else if (scene === 'stun') {
      D.step(160); D.soapBoss(3); D.step(40); D.stunBoss(); D.step(70);
    } else if (scene === 'down') {
      D.step(160); D.stunBoss(); D.step(20); D.damageBoss(); D.step(40);
    } else if (scene === 'defeat') {
      D.step(160); D.soapBoss(2); D.killBoss(); D.step(56);
    } else if (scene === 'over') {
      D.step(160); D.killBoss(); D.step(120);
    } else if (scene === 'hop') {
      D.step(160); D.setPlayer(150, 200);
      const b = B(); b.minionT = 1e9;
      if (b.type === 'megaSponge') { D.setPlayer(60, 72); until(() => b.act === 'squat' && b.actT < 8, 1500); }
      else until(() => b.act === 'air' && b.vy > -1 && b.vy < 0.5, 900);
    } else {
      D.step(160);
      if (scene === 'p3') { D.damageBoss(); D.step(110); D.damageBoss(); D.step(110); }
      D.soapBoss(n + 2);
      const b = B();
      if (b.type === 'kingGrime') { D.setPlayer(150, 200); until(() => G.hazards.some((h) => h.kind === 'wave' && h.t > 14), 900); }
      else if (b.type === 'moldQueen') { until(() => G.hazards.some((h) => h.state === 'land') && G.hazards.some((h) => h.state === 'fly' && h.t > 12), 1500); }
      else if (b.type === 'megaSponge') until(() => b.act === 'wind' && b.actT < 20, 1500);
      else {
        // final boss: a sweep warning if phase 2+, otherwise a swoop target
        if (scene === 'p3') until(() => G.hazards.some((h) => h.kind === 'sweep' && h.state === 'go' && h.t > 18) && G.drops.length, 2500);
        else until(() => b.act === 'swoopWind' && b.actT < 24, 1500);
      }
    }
    D.step(0);
    const s = D.getState();
    console.log('SHOT READY ' + location.hash + ' ' + JSON.stringify({ mode: s.phase, boss: s.boss, hazards: G.hazards.map((h) => h.kind + ':' + (h.state || '')).join(','), drops: s.drops, enemies: s.enemies.length, banner: document.getElementById('pg-banner-main').textContent + ' / ' + document.getElementById('pg-banner-sub').textContent }));
    // (real-time runs: tools/cdp-run.js ... 'SHOT SETTLED' waits for the banner pop animation)
    setTimeout(() => console.log('SHOT SETTLED'), 600);
  }
  go();
})();
