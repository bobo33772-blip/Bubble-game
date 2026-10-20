// Headless smoke test for the engine. Appended after the page by build.js -> C:/Temp/bogeul/test-smoke.html
(function () {
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  function t(name, fn) {
    let r;
    try { r = fn(); } catch (e) { r = 'exception ' + (e && e.message) + ' @ ' + String(e && e.stack || '').split('\n')[1]; }
    if (r === undefined || r === true) { pass++; log('TEST PASS ' + name); } else { fail++; log('TEST FAIL ' + name + ': ' + r); }
  }
  function waitFor() {
    if (!window.PG || !window.PG.debug) return setTimeout(waitFor, 30);
    setTimeout(run, 50);
  }
  function run() {
    const D = PG.debug, G = D.G;
    const S = () => D.getState();
    const near = (a, b, eps) => Math.abs(a - b) <= eps;
    const activeEnemies = () => G.enemies.filter((e) => e.state === 'active');
    const L = () => D.levels()[G.round];

    t('boot title', () => {
      const s = S();
      if (s.phase !== 'title') return 'mode ' + s.phase;
      if (!document.getElementById('pg-title') || document.getElementById('pg-title').hidden) return 'title overlay hidden';
      if (D.levels().length !== 24) return 'levels ' + D.levels().length + ' (v2 has 24 rounds incl. 4 boss rounds)';
    });
    t('attract runs', () => { const f = S().frame; D.step(30); if (S().frame !== f + 30) return 'frame not advanced'; if (S().phase !== 'title') return 'mode ' + S().phase; });

    D.seed(1234);
    t('start round 0', () => {
      const s = D.start(0);
      if (s.phase !== 'playing') return 'mode ' + s.phase;
      if (s.round !== 0 || s.lives !== 4 || s.score !== 0) return JSON.stringify(s);
      if (!s.enemies.length || s.enemies.some((e) => e.state !== 'descend')) return 'enemies not descending';
      if (!document.getElementById('pg-title').hidden) return 'title overlay still shown';
    });
    t('banner shows round name', () => {
      const b = document.getElementById('pg-banner');
      if (b.hidden) return 'banner hidden';
      if (!document.getElementById('pg-banner-main').textContent) return 'no banner text';
    });
    D.setInvincible(true);
    t('enemies descend then activate', () => {
      D.step(30);
      const mid = S().enemies.filter((e) => e.state === 'descend').length;
      D.step(100);
      const s = S();
      if (mid === 0) return 'descend too fast';
      if (s.enemies.some((e) => e.state !== 'active')) return 'not all active: ' + s.enemies.map((e) => e.state).join(',');
    });
    t('player stands on floor', () => {
      const p = S().player;
      if (!p.onGround) return 'not on ground ' + JSON.stringify(p);
      if (p.y !== 200) return 'y=' + p.y;
    });
    t('walk right', () => {
      const x0 = S().player.x;
      D.press('right', true); D.step(30); D.press('right', false);
      const p = S().player;
      if (p.x - x0 < 30) return 'moved only ' + (p.x - x0);
      if (p.facing !== 1) return 'facing ' + p.facing;
      D.press('left', true); D.step(4); D.press('left', false); D.step(10);
      if (S().player.facing !== -1) return 'did not face left';
    });
    t('jump arc', () => {
      const y0 = S().player.y;
      D.press('jump', true); D.step(1); D.press('jump', false);
      let minY = y0;
      for (let i = 0; i < 40; i++) { D.step(1); minY = Math.min(minY, S().player.y); }
      const apex = y0 - minY;
      if (apex < 34 || apex > 42) return 'apex ' + apex;
      D.step(20);
      if (!S().player.onGround) return 'did not land';
    });
    t('jump buffer + coyote', () => {
      // press jump a few frames before landing -> buffered jump
      D.press('jump', true); D.step(1); D.press('jump', false);
      let landedAt = -1;
      for (let i = 0; i < 60; i++) { D.step(1); if (G.p.vy > 2) break; }
      D.press('jump', true); D.step(1); D.press('jump', false);
      for (let i = 0; i < 10; i++) { D.step(1); if (G.p.vy < -3) { landedAt = i; break; } }
      if (landedAt < 0) return 'buffered jump did not fire';
      D.step(60);
    });

    t('shot bubble traps enemy in front', () => {
      const p = G.p;
      p.x = 40; p.y = 200; p.vx = 0; p.vy = 0;
      D.press('right', true); D.step(1); D.press('right', false); D.step(4);
      const e = activeEnemies()[0];
      if (!e) return 'no active enemy';
      e.x = G.p.x + 36; e.y = 200; e.dir = 1; e.vx = 0; e.vy = 0; e.onGround = true;
      D.press('shoot', true); D.step(1); D.press('shoot', false);
      const s1 = S();
      if (!s1.bubbles.some((b) => b.state === 'shot')) return 'no shot bubble';
      D.step(8);
      if (e.state !== 'trapped') return 'enemy state ' + e.state + ' ex=' + e.x + ' px=' + G.p.x;
      const s = S();
      if (!s.bubbles.some((b) => b.kind === 'trapped')) return 'no trapped bubble';
    });
    t('trapped bubble floats up toward gather', () => {
      const b = G.bubbles.find((q) => q.kind === 'trapped');
      const y0 = b.y; D.step(120);
      if (!(b.y < y0 - 20)) return 'did not rise ' + y0 + ' -> ' + b.y;
    });
    t('pop trapped -> score + dead arc + item', () => {
      const sc = S().score;
      const b = G.bubbles.find((q) => q.kind === 'trapped');
      const e = b.enemy;
      // walk/teleport the duck into the bubble (jumping body overlap)
      G.p.x = b.x; G.p.y = b.y + 4; G.p.vy = -1; G.p.onGround = false;
      D.step(1);
      if (e.state !== 'dead') return 'enemy ' + e.state;
      if (S().score - sc < 500) return 'score +' + (S().score - sc);
      G.p.x = 40; G.p.y = 200; G.p.vy = 0;
      let items = 0;
      for (let i = 0; i < 300 && !items; i++) { D.step(1); items = S().items; }
      if (!items) return 'no item spawned';
    });
    t('collect item', () => {
      const it = G.items[0];
      const sc = S().score;
      G.p.x = it.x; G.p.y = it.y; G.p.vy = 0;
      D.step(2);
      if (S().items !== 0) return 'item not collected';
      if (S().score - sc !== it.value) return 'score +' + (S().score - sc) + ' expected ' + it.value;
    });
    t('floor gap wrap', () => {
      const lv = L();
      G.bubbles = [];
      G.p.x = lv.gapX - 8; G.p.y = 186; G.p.vx = 0; G.p.vy = 0; G.p.onGround = false;
      let maxY = 0, wrapped = false;
      for (let i = 0; i < 200; i++) {
        D.step(1);
        const y = S().player.y;
        if (y > maxY) maxY = y;
        if (maxY > 205 && y < 40) wrapped = true;
        if (wrapped && S().player.onGround) break;
      }
      if (!wrapped) return 'never wrapped, maxY=' + maxY + ' y=' + S().player.y;
      if (!S().player.onGround) return 'did not land after wrap';
      if (S().player.y > 120) return 'landed low y=' + S().player.y;
    });
    t('bubble bounce while holding jump', () => {
      G.bubbles = [];
      const b = D.spawnBubble('empty', 60, 120);
      b.age = 50;
      G.p.x = 60; G.p.y = 100; G.p.vx = 0; G.p.vy = 1.6; G.p.onGround = false;
      D.press('jump', true);
      let bounced = false;
      for (let i = 0; i < 20; i++) { D.step(1); if (G.p.vy < -3.2) { bounced = true; break; } }
      D.press('jump', false);
      if (!bounced) return 'no bounce; p.y=' + G.p.y + ' b.y=' + b.y;
      if (b.dead || b.state === 'pop') return 'bubble popped on bounce';
    });
    t('touching bubble pops it (+10)', () => {
      G.bubbles = [];
      const b = D.spawnBubble('empty', 60, 120); b.age = 50;
      const sc = S().score;
      G.p.x = 60; G.p.y = 118; G.p.vx = 0; G.p.vy = 0; G.p.onGround = false;
      D.step(1);
      if (b.state !== 'pop') return 'state ' + b.state;
      if (S().score - sc !== 10) return 'score +' + (S().score - sc);
      D.step(15);
      if (G.bubbles.length) return 'bubble not removed';
    });
    t('chain pop propagates', () => {
      G.bubbles = [];
      const a = D.spawnBubble('empty', 60, 100), b = D.spawnBubble('empty', 75, 100), c = D.spawnBubble('empty', 90, 100);
      [a, b, c].forEach((q) => { q.age = 50; });
      G.p.x = 50; G.p.y = 100; G.p.vy = 0; G.p.onGround = false;
      D.step(1);
      if (a.state !== 'pop') return 'first not popped';
      D.step(12);
      if (!(b.dead || b.state === 'pop') || !(c.dead || c.state === 'pop')) return 'chain did not propagate';
    });
    t('point-blank wall shot spawns floating', () => {
      G.bubbles = [];
      G.p.x = 14; G.p.y = 200; G.p.vy = 0; G.p.onGround = true; G.p.shootCd = 0;
      D.press('left', true); D.step(2); D.press('left', false);
      G.p.x = 14;
      D.press('shoot', true); D.step(1); D.press('shoot', false);
      const s = S();
      if (!s.bubbles.length) return 'no bubble';
      if (s.bubbles[0].state !== 'float') return 'state ' + s.bubbles[0].state;
      if (s.bubbles[0].x < 16) return 'bubble inside wall x=' + s.bubbles[0].x;
    });
    t('chain kills score 500 + 1000 (뽀득 combo, no doubling)', () => {
      G.bubbles = [];
      const es = activeEnemies();
      if (es.length < 2) return 'need 2 active enemies, have ' + es.length;
      es[0].x = 100; es[0].y = 100; es[1].x = 114; es[1].y = 100;
      es[0].soakT = es[1].soakT = 0;
      // any other enemy stays out of the chain (and keeps the round from clearing)
      const rest = G.enemies.filter((e) => e !== es[0] && e !== es[1] && e.state !== 'dead');
      if (!rest.length) { const dummy = Object.assign({}, es[0], { id: 99999, bubble: null }); G.enemies.push(dummy); rest.push(dummy); }
      rest.forEach((e) => { e.state = 'hold'; });
      D.trapAll();
      rest.forEach((e) => { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; });
      const tb = G.bubbles.filter((b) => b.kind === 'trapped');
      if (tb.length < 2) return 'trapped ' + tb.length;
      tb[0].x = 100; tb[0].y = 100; tb[1].x = 113; tb[1].y = 100;
      tb.forEach((b) => { b.vx = 0; b.vy = 0; });
      const sc = S().score;
      G.p.x = 90; G.p.y = 100; G.p.vy = 0; G.p.onGround = false;
      D.step(1);
      D.step(12);
      const gain = S().score - sc;
      if (gain !== 1500) return 'gain ' + gain;
      D.step(200);
    });

    t('death + respawn', () => {
      D.gotoRound(0); D.step(130);
      D.setInvincible(false);
      const lives = S().lives;
      const e = activeEnemies()[0];
      G.p.invuln = 0;
      e.x = G.p.x; e.y = G.p.y;
      D.step(1);
      if (S().phase !== 'dying') return 'mode ' + S().phase;
      if (!S().player.dead) return 'player not dead';
      D.step(95);
      const s = S();
      if (s.phase !== 'playing') return 'mode ' + s.phase;
      if (s.lives !== lives - 1) return 'lives ' + s.lives;
      if (G.p.invuln <= 0) return 'no invulnerability';
      const sp = L().player;
      if (!near(s.player.x, sp.col * 8 - 4, 2)) return 'not at spawn x=' + s.player.x;
      D.setInvincible(true);
    });
    t('hurry at 30s and 샤워기 고장 (scalding drops) at 45s', () => {
      D.gotoRound(0); D.step(1);
      D.step(1795);
      if (S().hurry) return 'hurry too early';
      D.step(10);
      if (!S().hurry) return 'no hurry at 30s';
      if (S().enemies.some((e) => e.state === 'active' && !e.angry)) return 'enemies not angry';
      if (document.getElementById('pg-banner-main').textContent.indexOf('서둘러') < 0) return 'no hurry banner';
      D.step(890);
      if (S().scald || S().drops) return 'scald too early';
      D.step(20);
      if (!S().scald) return 'no scald at 45s';
      if (document.getElementById('pg-banner-main').textContent.indexOf('샤워기 고장') < 0) return 'no 샤워기 고장 banner';
      D.step(20);
      if (!S().drops) return 'no drops forming';
    });
    t('a falling scald drop kills and death resets hurry', () => {
      D.setInvincible(false); G.p.invuln = 0;
      const away = () => G.enemies.forEach((e) => { if (e.state === 'active') { e.x = 200; e.y = 40; e.vx = e.vy = 0; } });
      G.drops = []; G.dropT = 1e9;
      // stand on the first surface under column 12, right below where the drop forms
      const m = L().map; let r = 2; while (r < 25 && m[r][12] !== '#') r++;
      D.setPlayer(12 * 8 - 4, 16 + r * 8 - 16); away(); D.step(2);
      D.spawnDrop(12);
      let g = 0; while (S().phase !== 'dying' && g++ < 140) { away(); D.step(1); }
      if (S().phase !== 'dying') return 'mode ' + S().phase;
      D.step(95);
      const s = S();
      if (s.hurry || s.scald || s.drops) return 'hurry/scald not reset';
      D.setInvincible(true);
    });
    t('stamps collected -> 10 stamps = extra life', () => {
      G.bubbles = []; G.stamps = 0;
      const lives = S().lives;
      D.spawnBubble('stamp', 60, 80);
      D.popAll(); D.step(12);
      if (S().stamps !== 1) return 'stamps ' + S().stamps;
      D.giveStamps(8);
      D.spawnBubble('stamp', 60, 80);
      D.popAll(); D.step(12);
      const s = S();
      if (s.lives !== lives + 1) return 'lives ' + s.lives + ' expected ' + (lives + 1);
      if (s.stamps !== 0) return 'stamp card not reset: ' + s.stamps;
    });
    t('stamp bubble rises out of the drain', () => {
      G.bubbles = []; G.stampT = 1;
      D.step(1);
      const b = G.bubbles.find((q) => q.kind === 'stamp');
      if (!b) return 'no stamp bubble';
      if (b.y < 180) return 'not from bottom y=' + b.y;
      D.step(200);
      if (b.y > 150) return 'did not float up';
    });
    t('steam round: blast kills enemies', () => {
      const idx = D.levels().findIndex((l) => l.special === 'steam');
      if (idx < 0) return 'no steam level';
      D.gotoRound(idx); D.step(130);
      G.steamT = 1; D.step(1);
      const sb = G.bubbles.find((q) => q.kind === 'steam');
      if (!sb) return 'no steam bubble';
      // popped by the duck: the blast leaves from the duck and sweeps the duck's own row
      const e = activeEnemies()[0];
      const ex = G.p.x + 64, ey = G.p.y;
      sb.x = 120; sb.y = 100; e.x = ex; e.y = ey; e.vx = 0; e.vy = 0;
      if (e.type === 'fly') { e.fvx = 0.0001; e.fvy = 0.0001; }
      G.p.facing = 1;
      const sc = S().score;
      D.popAll();
      if (!G.bolts.length) return 'no bolt';
      if (Math.abs(G.bolts[0].y - G.p.y) > 0.5) return 'blast did not start on the duck row: y=' + G.bolts[0].y;
      let killed = false;
      for (let i = 0; i < 40; i++) { if (e.state === 'active') { e.x = ex; e.y = ey; e.vy = 0; } D.step(1); if (e.state === 'dead') { killed = true; break; } }
      if (!killed) return 'enemy not killed by steam ' + e.state + ' ex=' + e.x + ' bolts=' + G.bolts.length;
      if (S().score - sc < 1000) return 'no steam score';
      D.step(60);
      if (G.bolts.length) return 'bolt never ended';
    });
    t('round clear -> transition -> round 2', () => {
      D.gotoRound(0); D.step(130);
      D.killAll();
      D.step(5);
      if (S().enemies.some((e) => e.state !== 'dead')) return 'enemies alive';
      // the ~3 s snack-grab window starts once every knocked-out enemy has landed as a snack
      let land = 0; while (S().enemies.length && land++ < 450) D.step(1);
      if (S().enemies.length) return 'corpses never landed';
      if (S().phase !== 'playing') return 'left playing before the snacks landed: ' + S().phase;
      D.step(150);
      if (S().phase !== 'playing') return 'left playing too soon: ' + S().phase;
      if (!S().items) return 'no items during clear wait';
      D.step(40);
      if (S().phase !== 'transition') return 'mode ' + S().phase + ' (expected transition)';
      D.step(10);
      if (!(G.trans && G.trans.door > 0.3 && G.trans.door < 1)) return 'doors not sliding shut: ' + (G.trans && G.trans.door);
      D.step(90);
      const s = S();
      if (s.phase !== 'playing' || s.round !== 1) return 'mode ' + s.phase + ' round ' + s.round;
      if (!s.enemies.length) return 'no enemies in round 2';
    });
    t('pause freezes and resumes', () => {
      D.pause();
      if (S().phase !== 'paused') return 'mode ' + S().phase;
      if (document.getElementById('pg-pause').hidden) return 'pause overlay hidden';
      const f = S().frame; D.step(20);
      if (S().frame !== f) return 'frame advanced while paused';
      D.resume();
      if (S().phase !== 'playing') return 'resume mode ' + S().phase;
    });
    t('last round -> ending -> 2nd loop', () => {
      const last = D.levels().length - 1;
      D.gotoRound(last); D.step(130);
      D.killAll();
      let g = 0; while (S().phase !== 'ending' && g++ < 700) D.step(1);
      if (S().phase !== 'ending') return 'mode ' + S().phase;
      if (document.getElementById('pg-ending').hidden) return 'ending overlay hidden';
      document.getElementById('pg-end-next').click();
      const s = S();
      if (s.phase !== 'playing' || s.loop !== 1 || s.round !== 0) return JSON.stringify({ m: s.phase, l: s.loop, r: s.round });
      if (G.loopMul <= 1) return 'no loop speedup';
    });
    t('game over after losing all lives', () => {
      D.gotoRound(0); D.step(130);
      D.setInvincible(false);
      let guard = 0;
      while (S().phase !== 'gameover' && guard++ < 12) {
        const e = activeEnemies()[0];
        if (!e) return 'no active enemy';
        G.p.invuln = 0; e.x = G.p.x; e.y = G.p.y;
        D.step(1);
        if (S().phase !== 'dying') return 'not dying: ' + S().phase;
        D.step(95);
      }
      const s = S();
      if (s.phase !== 'gameover') return 'mode ' + s.phase;
      if (s.lives !== 0) return 'lives ' + s.lives;
      if (document.getElementById('pg-over').hidden) return 'game over overlay hidden';
      if (!document.getElementById('pg-over-score').textContent) return 'no score text';
    });
    t('retry from game over', () => {
      document.getElementById('pg-retry').click();
      const s = S();
      if (s.phase !== 'playing' || s.lives !== 4 || s.score !== 0 || s.stamps !== 0) return JSON.stringify(s).slice(0, 200);
    });
    t('trapped enemy escapes angry', () => {
      D.gotoRound(0); D.step(130); D.setInvincible(true);
      D.trapAll();
      const b = G.bubbles.find((q) => q.kind === 'trapped');
      const e = b.enemy;
      D.step(b.trapMax + 2);
      if (e.state !== 'active') return 'state ' + e.state;
      if (!e.angry) return 'not angry';
    });
    t('debug api complete', () => {
      for (const k of ['getState', 'start', 'step', 'press', 'trapAll', 'popAll', 'killAll', 'setInvincible', 'gotoRound', 'seed', 'givePower', 'giveStamps', 'spawnDrop']) if (typeof D[k] !== 'function') return 'missing ' + k;
    });
    t('determinism with seed', () => {
      const runOnce = () => { D.seed(77); D.start(3); D.press('right', true); D.step(200); D.press('right', false); D.step(400); return JSON.stringify(S().enemies); };
      const a = runOnce(), b = runOnce();
      if (a !== b) return 'diverged';
    });
    t('back to title + start button', () => {
      D.toTitle();
      if (S().phase !== 'title') return 'mode ' + S().phase;
      document.getElementById('pg-start').click();
      if (S().phase !== 'playing') return 'mode ' + S().phase;
    });
    t('long random play: no exceptions', () => {
      D.seed(9); D.start(6); D.setInvincible(true);
      const acts = ['left', 'right', 'jump', 'shoot'];
      for (let i = 0; i < 3000; i++) {
        if (i % 7 === 0) for (const a of acts) D.press(a, Math.random() < 0.35);
        D.step(1);
      }
      for (let r = 0; r < D.levels().length; r++) { D.gotoRound(r); D.step(200); D.trapAll(); D.step(30); D.popAll(); D.step(40); }
      D.setInvincible(false);
    });
    log('TESTS DONE pass=' + pass + ' fail=' + fail);
  }
  waitFor();
})();
