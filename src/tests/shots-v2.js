// v2 screenshot scenes, selected by location.hash (web fonts get ~2.5 s to load first):
//   #water   a shipped water round: floating duck, soaked enemy, ice block, power-up pickup, stamp bubble, HUD power bar
//   #cold    the cold-pool round with a trapped enemy frozen in ice
//   #door    sliding-door transition mid-wipe          #doorhold   doors shut, next-round banner
//   #pause   pause card with the 10-slot stamp card     #over       game-over card with the stamp card
//   #scald   broken shower: drops forming (shimmer), falling and splashing
//   #clear   round clear banner with the 세신 bonus      #ticket     무료 입장권 banner
// e.g. node tools/run-chrome.js "test-shots-v2.html#water" C:/Temp/bogeul/v2-water.png 900 760 8000
(function () {
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30);
    setTimeout(() => { scene(); setTimeout(() => console.log('SHOTS-V2 READY'), 700); }, 2500);
  }
  function scene() {
    const D = PG.debug, G = D.G, LV = D.levels(), sc = (location.hash || '#water').slice(1);
    const park = (e) => { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; };
    const waterRound = (kind) => {
      let best = -1, n = 0;
      LV.forEach((L, i) => { const k = L.map.join('').split(kind).length - 1; if (k > n && !L.boss) { n = k; best = i; } });
      return best;
    };
    D.seed(5);
    if (sc === 'water') {
      const i = waterRound('~');
      D.start(i < 0 ? 0 : i); D.setInvincible(true); D.step(160);
      // find a hot surface cell and float the duck there
      const L = LV[G.round]; let spot = null;
      for (let r = 1; r < 25 && !spot; r++) for (let c = 3; c < 28 && !spot; c++) if (L.map[r][c] === '~' && L.map[r - 1][c] !== '~' && L.map[r][c + 1] === '~' && L.map[r][c + 2] === '~' && L.map[r][c + 3] === '~') spot = { c, r };
      if (spot) { D.setPlayer(spot.c * 8 + 8, 16 + spot.r * 8 - 30); }
      D.step(70);
      const e = G.enemies.find((q) => q.state === 'active' && q.type !== 'fly');
      if (e) e.soakT = 300;
      D.givePower('shampoo');
      D.press('shoot', true); D.step(1); D.press('shoot', false); D.step(6);
      D.spawnPickup('slippers', 60, 60);
      G.stamps = 3; G.stampT = 1; D.step(70);
      console.log('SHOT water round ' + (G.round + 1) + ' ' + L.name + ' duck water=' + G.p.water + ' y=' + G.p.y.toFixed(1));
    } else if (sc === 'cold') {
      const i = waterRound('=');
      D.start(i < 0 ? 0 : i); D.setInvincible(true); D.step(160);
      const L = LV[G.round]; let spot = null;
      for (let r = 1; r < 25 && !spot; r++) for (let c = 3; c < 27 && !spot; c++) if (L.map[r][c] === '=' && L.map[r - 1][c] !== '=' && L.map[r][c + 1] === '=' && L.map[r][c + 2] === '=') spot = { c, r };
      const e = G.enemies.find((q) => q.state === 'active' && q.type !== 'fly');
      if (spot && e) {
        Object.assign(e, { x: spot.c * 8, y: 16 + spot.r * 8 - 8, vx: 0, vy: 0, state: 'active' });
        const b = D.spawnBubble('empty', e.x, e.y); b.state = 'shot'; b.vx = 0.01; b.shotT = 4;
        D.step(4);
        D.spawnBubble('empty', spot.c * 8 + 24, 16 + spot.r * 8 - 12); D.step(2);
        D.setPlayer(spot.c * 8 + 20, 16 + spot.r * 8 - 50);
      }
      D.step(60);
      console.log('SHOT cold round ' + (G.round + 1) + ' ' + L.name + ' ice=' + G.ice.length + ' frozen=' + G.enemies.filter((q) => q.state === 'frozen').length);
    } else if (sc === 'door' || sc === 'doorhold') {
      D.start(0); D.setInvincible(true); D.step(130); D.killAll();
      let k = 0; while (G.mode !== 'transition' && k++ < 900) D.step(1);
      D.step(sc === 'door' ? 18 : 50);
      console.log('SHOT door T=' + G.transT + ' door=' + (G.trans && G.trans.door.toFixed(2)) + ' round=' + G.round);
    } else if (sc === 'pause') {
      D.start(2); D.step(200); G.stamps = 6; G.score = 48200; D.pause();
      console.log('SHOT pause');
    } else if (sc === 'over') {
      G.hiscore = 150000;
      D.start(4); D.step(120); G.score = 123450; G.stamps = 8; G.lives = 1; D.setInvincible(false);
      const e = G.enemies.find((q) => q.state === 'active'); G.p.invuln = 0; e.x = G.p.x; e.y = G.p.y; D.step(1); D.step(100);
      console.log('SHOT over mode=' + G.mode);
    } else if (sc === 'scald') {
      D.start(3); D.setInvincible(true); D.step(150);
      G.roundT = 2690; D.step(10);
      for (let f = 0; f < 200; f++) D.step(1);
      G.drops = []; G.dropT = 1e9;
      for (const c of [6, 11, 19, 25]) D.spawnDrop(c);
      D.step(50);
      D.spawnDrop(15); D.spawnDrop(22); D.step(14);
      console.log('SHOT scald drops=' + G.drops.length + ' states=' + G.drops.map((d) => d.state).join(','));
    } else if (sc === 'clear') {
      D.start(1); D.setInvincible(true); D.step(130); G.roundClock = 19 * 60; D.trapAll(); D.step(30); D.popAll(); D.step(30);
      console.log('SHOT clear banner=' + document.getElementById('pg-banner-sub').textContent);
    } else if (sc === 'ticket') {
      D.start(1); D.setInvincible(true); D.step(150); G.stamps = 9; G.banner = null;
      const b = D.spawnBubble('stamp', G.p.x, G.p.y - 2); b.grace = 0; D.step(20);
      console.log('SHOT ticket lives=' + G.lives);
    }
  }
  go();
})();
