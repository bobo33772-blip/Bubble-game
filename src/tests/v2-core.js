// v2 core-engine checks (built to C:/Temp/bogeul/test-v2-core.html):
//   node tools/run-chrome.js test-v2-core.html - 900 760 60000
// Rename, 뽀득 combo scoring, 세신 speed bonus, stamp card (stamp bubble, rewards, 10 -> free entry),
// scalding drops (warn -> fall -> kill), sliding-door transition, water (floating duck, soaked enemies,
// hot-water lift, cold-water ice blocks) and the three power-ups. Pools are patched into a round in-page
// so the checks do not depend on the shipped level layouts.
// Prints "V2 PASS/FAIL <name>" lines and "V2 DONE pass=N fail=M".
(function () {
  let pass = 0, fail = 0, errors = 0;
  window.addEventListener('error', (e) => { errors++; console.log('V2 page error: ' + e.message + ' @' + e.lineno); });
  const log = (s) => console.log(s);
  function t(name, fn) {
    let r;
    try { r = fn(); } catch (e) { r = 'exception ' + (e && e.message) + ' @ ' + String((e && e.stack) || '').split('\n')[1]; }
    if (r === undefined || r === true) { pass++; log('V2 PASS ' + name); } else { fail++; log('V2 FAIL ' + name + ': ' + r); }
  }
  const $ = (id) => document.getElementById(id);
  const near = (a, b, eps) => Math.abs(a - b) <= eps;

  function run() {
    const D = PG.debug, G = D.G, LV = D.levels(), S = () => D.getState();
    const PF_TOP = 16, NAME = '뽀득뽀득 목욕탕';
    const OLD = '\uBF40\uAE00\uBF40\uAE00'; // the v1 name, written escaped so this driver does not contain it
    const releaseAll = () => { for (const a of ['left', 'right', 'jump', 'shoot']) D.press(a, false); };
    const park = (e) => { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; };
    const activate = (e, x, y, type) => Object.assign(e, { type: type || e.type, state: 'active', x, y, vx: 0, vy: 0, onGround: true, angry: false, escaped: false, hopT: 999, delay: 0, spawnY: y, jumpCd: 999, chargeCd: 999, windT: 0, chargeT: 0, committed: false, soakT: 0, dir: 1, water: 0 });
    const tap = (a) => { D.press(a, true); D.step(1); D.press(a, false); };
    // ---- a plain test room installed over round 1 in-page (restored at the end), so these checks do not
    // depend on the shipped layouts: open floor with the wrap gap at cols 14-17, one ledge at row 15 (cols 8-14)
    const saved = new Map();
    const PLAIN = [];
    for (let r = 0; r < 26; r++) {
      if (r === 0 || r === 25) PLAIN.push('##############....##############');
      else if (r === 15) PLAIN.push('##......#######...............##');
      else PLAIN.push('##' + '.'.repeat(28) + '##');
    }
    function installPlain(pools) {
      const L = LV[0];
      if (!saved.has(0)) saved.set(0, { map: L.map, player: L.player, gather: L.gather, gapX: L.gapX, enemies: L.enemies, special: L.special, boss: L.boss });
      const m = PLAIN.slice();
      for (const pl of pools || []) for (let r = 25 - pl.depth; r <= 24; r++) m[r] = m[r].slice(0, pl.c0) + pl.ch.repeat(8) + m[r].slice(pl.c0 + 8);
      Object.assign(L, { map: m, player: { col: 3, row: 24 }, gather: { col: 8, row: 2 }, gapX: 16 * 8, special: undefined, boss: null,
        enemies: [{ type: 'grime', col: 9, row: 14, dir: 1 }, { type: 'grime', col: 24, row: 24, dir: -1 }, { type: 'mold', col: 12, row: 14, dir: 1 }, { type: 'fly', col: 20, row: 6, dir: 1 }, { type: 'grime', col: 26, row: 24, dir: 1 }] });
    }
    function restoreMaps() { for (const [i, o] of saved) Object.assign(LV[i], o); saved.clear(); }
    // a quiet round: enemies parked off-screen (round never clears), no spawners, duck invincible
    function fresh(i, seed, pools) {
      installPlain(pools);
      D.seed(seed || 7); D.start(0); D.setInvincible(true); D.step(150);
      G.enemies.forEach(park); G.bubbles = []; G.items = []; G.pickup = null; G.stampT = 1e9; G.steamT = -1;
      releaseAll();
    }
    // sfx / music trace
    const A = PG.Audio || {}, trace = [];
    const oSfx = A.sfx;
    if (typeof oSfx === 'function') A.sfx = function (n, o) { trace.push(n + (o && o.open ? ':open' : '')); return oSfx.apply(A, arguments); };

    // ---- in-page pool: 8 columns wide on the floor of the plain room (cols 20-27), away from the gap and the spawn
    function poolRound(ch, depth) {
      fresh(0, 7, [{ ch, depth, c0: 20 }]);
      const surfRow = 25 - depth;
      return { c0: 20, c1: 27, x: 160, surfRow, surfY: PF_TOP + surfRow * 8, floorY: PF_TOP + 25 * 8 };
    }

    // ------------------------------------------------------------------ 1. rename
    t('rename: GAME_NAME constant, page title, header brand and title logo', () => {
      if (PG.GAME_NAME !== NAME) return 'PG.GAME_NAME ' + PG.GAME_NAME;
      if (document.title !== NAME) return 'document.title ' + document.title;
      const brand = document.querySelector('.pg-brand'), logo = document.querySelector('.pg-logo');
      if (!brand || brand.textContent.indexOf(NAME) < 0) return 'brand ' + (brand && brand.textContent);
      if (!logo || logo.textContent.indexOf(NAME) < 0) return 'logo ' + (logo && logo.textContent);
      if (($('pg-canvas').getAttribute('aria-label') || '').indexOf(NAME) < 0) return 'canvas label';
    });
    t('rename: the old name is gone from the page and the engine', () => {
      const clone = document.getElementById('pg-app').cloneNode(true);
      if (clone.outerHTML.indexOf(OLD) >= 0) return 'old name in page markup';
      if (document.title.indexOf(OLD) >= 0) return 'old name in title';
      const eng = [...document.scripts].find((s) => s.textContent.indexOf('---- game.js ----') >= 0);
      if (!eng) return 'engine script not found';
      if (eng.textContent.indexOf(OLD) >= 0) return 'old name in game.js';
      if (eng.textContent.indexOf('const GAME_NAME = ') < 0) return 'no GAME_NAME constant';
      const others = [...document.scripts].filter((s) => s !== eng && s.textContent.indexOf(OLD) >= 0 && s.textContent.indexOf('---- ') >= 0).map((s) => (s.textContent.match(/---- (\S+) ----/) || [])[1]);
      if (others.length) log('V2 NOTE old name still appears in: ' + others.join(', ') + ' (teammate files)');
    });

    // ------------------------------------------------------------------ 2. 뽀득 combo + 세신 bonus
    t('combo: k-th kill in one chain scores 500k, capped at 5000; popup shows xk; 3+ chain = +1 stamp', () => {
      fresh(0, 11);
      const tmpl = G.enemies[0];
      const keep = G.enemies[1]; // stays parked so the round never clears
      const list = [];
      for (let k = 0; k < 12; k++) {
        const e = Object.assign({}, tmpl, { id: 9000 + k, bubble: null });
        activate(e, 40 + (k % 6) * 30, 60 + Math.floor(k / 6) * 40, 'grime');
        list.push(e);
      }
      G.enemies = list.concat([keep]);
      keep.state = 'hold'; // not trapped by trapAll, not alive-active, not dead
      D.trapAll(); keep.state = 'descend';
      const st0 = G.stamps, sc0 = G.score;
      D.popAll();
      const gain = G.score - sc0;
      let want = 0; for (let k = 1; k <= 12; k++) want += Math.min(5000, 500 * k);
      if (gain !== want) return 'gain ' + gain + ' want ' + want;
      const pts = G.pops.map((p) => +p.txt).filter((v) => v > 0);
      for (const v of [500, 1000, 1500, 5000]) if (pts.indexOf(v) < 0) return 'missing popup ' + v + ' in ' + pts.join(',');
      if (!G.pops.some((p) => p.combo === 'x3' && p.txt === '1500')) return 'no "x3" combo label';
      if (G.pops.some((p) => +p.txt > 5000)) return 'popup above cap';
      if (G.stamps !== st0 + 1) return 'stamps ' + st0 + ' -> ' + G.stamps + ' (want +1 for the 3+ chain)';
      D.step(20);
    });
    t('combo: two separate single pops score 500 each (no doubling)', () => {
      fresh(0, 12);
      const [a, b] = [G.enemies[0], G.enemies[1]];
      activate(a, 40, 60, 'grime'); activate(b, 180, 60, 'grime');
      a.state = 'active'; b.state = 'active';
      for (const e of G.enemies.slice(2)) e.state = 'hold';
      D.trapAll();
      for (const e of G.enemies.slice(2)) e.state = 'descend';
      const tb = G.bubbles.filter((q) => q.kind === 'trapped');
      if (tb.length !== 2) return 'trapped ' + tb.length;
      tb[0].x = 40; tb[0].y = 120; tb[1].x = 180; tb[1].y = 120; tb.forEach((q) => { q.vx = q.vy = 0; q.grace = 0; });
      const sc = G.score;
      D.setPlayer(36, 118); D.step(1); D.setPlayer(176, 118); D.step(1);
      if (G.score - sc !== 1000) return 'gain ' + (G.score - sc);
    });
    t('세신 bonus: (60 - whole seconds) x 100 at clear, shown in the clear banner; no-death clear = +1 stamp', () => {
      restoreMaps(); D.seed(5); D.start(0); D.setInvincible(true); D.step(130);
      G.stampT = 1e9;
      G.roundClock = 23 * 60 + 30;
      const sc = G.score, st = G.stamps;
      D.killAll(); D.step(1);
      if (G.score - sc !== 3700) return 'bonus ' + (G.score - sc);
      if (!G.lastBonus || G.lastBonus.secs !== 23) return 'secs ' + JSON.stringify(G.lastBonus);
      const sub = $('pg-banner-sub').textContent, main = $('pg-banner-main').textContent;
      if (main !== '청소 완료!' || sub.indexOf('세신 보너스') < 0 || sub.indexOf('3,700') < 0) return 'banner "' + main + '" / "' + sub + '"';
      if (G.stamps !== st + 1) return 'no-death stamp missing ' + st + '->' + G.stamps;
    });
    t('세신 bonus is 0 after 60 s, and a death in the round forfeits the no-death stamp', () => {
      restoreMaps(); D.seed(6); D.start(0); D.step(130);
      D.setInvincible(false); G.p.invuln = 0;
      const e = G.enemies.find((q) => q.state === 'active'); e.x = G.p.x; e.y = G.p.y;
      D.step(1); if (G.mode !== 'dying') return 'did not die';
      D.step(95); D.setInvincible(true);
      G.stampT = 1e9; G.roundClock = 75 * 60;
      const sc = G.score, st = G.stamps;
      D.killAll(); D.step(1);
      if (G.score - sc !== 0) return 'bonus ' + (G.score - sc);
      if (G.stamps !== st) return 'stamp given despite a death';
      if ($('pg-banner-sub').textContent.indexOf('+0') < 0) return 'banner ' + $('pg-banner-sub').textContent;
    });

    // ------------------------------------------------------------------ 3. stamp card
    t('stamp bubble rises out of the drain on its timer and popping it gives +1 stamp', () => {
      fresh(0, 13);
      G.stamps = 0; G.stampT = 1; D.step(1);
      const b = G.bubbles.find((q) => q.kind === 'stamp');
      if (!b) return 'no stamp bubble';
      if (b.y < 180 || !near(b.x + 8, LV[0].gapX, 1)) return 'not from the drain ' + b.x + ',' + b.y + ' gapX ' + LV[0].gapX;
      if (!(G.stampT > 1000 && G.stampT <= 1300)) return 'timer re-rolled to ' + G.stampT;
      D.step(150);
      if (b.y > 165) return 'did not rise y=' + b.y;
      b.grace = 0; D.setPlayer(b.x, b.y + 2); trace.length = 0; D.step(1);
      if (G.stamps !== 1) return 'stamps ' + G.stamps;
      if (!G.pops.some((p) => p.icon === 'stamp')) return 'no stamp popup';
      if (trace.indexOf('stamp') < 0) return 'no stamp sfx: ' + trace.join(',');
    });
    t('10 stamps -> 무료 입장권 banner, +1 life, card resets', () => {
      fresh(0, 14);
      G.stamps = 0; G.bannerQ = [];
      D.giveStamps(8);
      if (G.stamps !== 8) return 'giveStamps ' + G.stamps;
      const lives = G.lives;
      const b = D.spawnBubble('stamp', G.p.x, G.p.y); b.grace = 0;
      D.setPlayer(G.p.x, G.p.y); D.step(1); // 9
      if (G.stamps !== 9 || G.lives !== lives) return 'after 9: ' + G.stamps + ' lives ' + G.lives;
      trace.length = 0;
      const b2 = D.spawnBubble('stamp', G.p.x, G.p.y); b2.grace = 0;
      D.step(1);
      if (G.stamps !== 0) return 'card not reset: ' + G.stamps;
      if (G.lives !== lives + 1) return 'lives ' + G.lives + ' want ' + (lives + 1);
      if (trace.indexOf('ticket') < 0) return 'no ticket sfx ' + trace.join(',');
      let shown = false;
      for (let f = 0; f < 200 && !shown; f++) { D.step(1); shown = $('pg-banner-main').textContent === '무료 입장권!' && !$('pg-banner').hidden; }
      if (!shown) return 'no 무료 입장권 banner';
      D.giveStamps(13);
      if (G.stamps !== 3 || G.lives !== lives + 2) return 'overflow: stamps ' + G.stamps + ' lives ' + G.lives;
    });
    t('HUD shows the stamp counter; pause and game-over cards show the 10-slot stamp card', () => {
      fresh(0, 15);
      G.stamps = 4;
      D.pause();
      const on = document.querySelectorAll('#pg-pause [data-slot].on').length, all = document.querySelectorAll('#pg-pause [data-slot]').length;
      const cnt = document.querySelector('#pg-pause [data-stampcount]');
      D.resume();
      if (all !== 10) return 'pause slots ' + all;
      if (on !== 4) return 'pause lit slots ' + on;
      if (!cnt || cnt.textContent !== '4/10') return 'count ' + (cnt && cnt.textContent);
      G.stamps = 7; D.setInvincible(false); G.lives = 1;
      const e = G.enemies[0]; activate(e, G.p.x, G.p.y, 'grime'); G.p.invuln = 0;
      let g = 0; while (G.mode !== 'gameover' && g++ < 200) D.step(1);
      if (G.mode !== 'gameover') return 'no game over';
      const on2 = document.querySelectorAll('#pg-over [data-slot].on').length;
      if (on2 !== 7 || $('pg-over').hidden) return 'game-over lit slots ' + on2;
      D.setInvincible(true);
    });
    t('stamps carry across rounds and reset with a new game', () => {
      restoreMaps(); D.seed(16); D.start(0); D.setInvincible(true); D.step(130);
      G.stamps = 5; D.gotoRound(1);
      if (G.stamps !== 5) return 'lost on round change';
      D.start(0);
      if (G.stamps !== 0) return 'not reset on new game: ' + G.stamps;
    });

    // ------------------------------------------------------------------ 4. scalding drops
    t('hurry at 30 s (no towel chaser), 샤워기 고장 at 45 s', () => {
      fresh(0, 17);
      G.roundT = 1799; D.step(1);
      if (!G.hurry) return 'no hurry';
      if ($('pg-banner-main').textContent !== '서둘러!') return 'banner ' + $('pg-banner-main').textContent;
      if ('towel' in G && G.towel) return 'towel chaser still exists';
      if (G.scald || G.drops.length) return 'scald too early';
      G.roundT = 2699; D.step(1);
      if (!G.scald) return 'no scald at 45 s';
      if ($('pg-banner-main').textContent !== '샤워기 고장!') return 'banner ' + $('pg-banner-main').textContent;
      let first = -1;
      for (let f = 0; f < 40 && first < 0; f++) { D.step(1); if (G.drops.length) first = f; }
      if (first < 0) return 'no drop within 40 frames';
      // spawn interval starts at 90 frames and shrinks toward 30
      const times = []; let n = G.drops.length;
      for (let f = 0; f < 1500; f++) { D.step(1); if (G.dropN > n) { times.push(f); n = G.dropN; } G.drops = G.drops.filter((d) => d.state === 'form'); }
      const gaps = times.slice(1).map((v, i) => v - times[i]);
      if (!gaps.length || Math.abs(gaps[0] - 85) > 2) return 'first gaps ' + gaps.slice(0, 4).join(',');
      if (Math.min(...gaps) !== 30 || gaps[gaps.length - 1] !== 30) return 'never reached 30: ' + gaps.join(',');
      if (gaps.some((v, i) => i && v > gaps[i - 1])) return 'interval grew: ' + gaps.join(',');
    });
    function surfaceBelow(col) { const m = LV[G.round].map; for (let r = 2; r < 26; r++) if (m[r][col] === '#') return r; return 25; }
    t('scald drop: forms with a warning for 40 frames, then falls and kills the duck', () => {
      fresh(0, 18);
      G.scald = true; G.dropT = 1e9; G.drops = [];
      const col = 12, top = surfaceBelow(col);
      D.setPlayer(col * 8 - 4, PF_TOP + top * 8 - 16); D.step(2);
      trace.length = 0;
      const d = D.spawnDrop(col);
      if (trace.indexOf('scald_warn') < 0) return 'no warn sfx';
      if (d.state !== 'form' || G.drops.length !== 1 || S().drops !== 1) return 'not forming';
      const y0 = d.y;
      D.step(39);
      if (d.state !== 'form' || d.y !== y0) return 'fell early (t=' + d.t + ')';
      D.step(1);
      if (d.state !== 'fall') return 'not falling after 40 frames';
      D.setInvincible(false); G.p.invuln = 0;
      let died = -1;
      for (let f = 0; f < 120 && died < 0; f++) { D.step(1); if (G.mode === 'dying') died = f; }
      if (died < 0) return 'duck survived; drop ' + JSON.stringify(G.drops.map((q) => [q.state, q.y | 0]));
      if (G.drops.length) return 'drops not cleared on death';
      D.step(95);
      if (G.mode !== 'playing' || G.scald || G.hurry || G.roundT > 5) return 'hurry not reset on respawn ' + JSON.stringify({ m: G.mode, s: G.scald, h: G.hurry, t: G.roundT });
      D.setInvincible(true);
    });
    t('scald drop splashes on the first platform below and harms nothing else', () => {
      fresh(0, 19);
      G.dropT = 1e9; G.drops = [];
      const col = 12, top = surfaceBelow(col);
      const e = G.enemies[0]; activate(e, col * 8 - 4, PF_TOP + top * 8 - 16, 'grime');
      D.setPlayer(200, 40); trace.length = 0;
      const d = D.spawnDrop(col);
      let lastY = d.y, f = 0;
      while (G.drops.indexOf(d) >= 0 && f++ < 200) { e.x = col * 8 - 4; e.vx = 0; e.dir = 1; lastY = d.y; D.step(1); }
      if (G.drops.indexOf(d) >= 0) return 'never splashed';
      if (Math.abs(lastY + 8 - (PF_TOP + top * 8)) > 5) return 'splashed at ' + (lastY + 8) + ' not platform top ' + (PF_TOP + top * 8);
      if (trace.indexOf('scald_splash') < 0) return 'no splash sfx';
      if (e.state !== 'active') return 'enemy hurt: ' + e.state;
    });
    t('drops stop when the round clears; no hurry / scald in boss rounds', () => {
      fresh(0, 20);
      G.roundT = 2700; D.step(30); D.spawnDrop(5); D.spawnDrop(20);
      if (!G.drops.length) return 'no drops';
      G.enemies.forEach((e) => { e.state = 'active'; e.y = 100; });
      D.killAll(); D.step(1);
      if (G.drops.length || G.scald) return 'drops kept after clear ' + G.drops.length;
      fresh(0, 21);
      const L = LV[0];
      L.boss = 'kingGrime';
      G.roundT = 2698; D.step(3);
      L.boss = null;
      if (G.hurry || G.scald) return 'hurry/scald in a boss round';
    });

    // ------------------------------------------------------------------ 5. sliding-door transition
    t('door transition: shut -> next round behind the doors with its banner -> open, duck at spawn', () => {
      restoreMaps(); D.seed(22); D.start(0); D.setInvincible(true); D.step(130);
      D.killAll();
      let g = 0; while (G.mode !== 'transition' && g++ < 900) D.step(1);
      if (G.mode !== 'transition') return 'no transition';
      if (G.round !== 0 || !G.trans || G.trans.door > 0.05) return 'bad start ' + JSON.stringify(G.trans);
      if (trace.lastIndexOf('door') < 0) return 'no door sfx';
      const L1 = LV[1], sx = L1.player.col * 8 - 4, sy = (L1.player.row + 1) * 8;
      const rows = [];
      let f = 0, shutAt = -1, swapAt = -1, openStart = -1, bannerOk = false, bannerSub = '';
      while (G.mode === 'transition' && f++ < 300) {
        D.step(1);
        if (G.mode !== 'transition') break;
        const d = G.trans.door;
        rows.push(d);
        if (shutAt < 0 && d >= 0.999) shutAt = f;
        if (swapAt < 0 && G.round === 1) { swapAt = f; if (Math.abs(G.p.x - sx) > 0.5 || Math.abs(G.p.y - sy) > 0.5) return 'duck not at spawn after swap'; }
        if (shutAt > 0 && openStart < 0 && d < 0.999) openStart = f;
        if (G.round === 1 && d >= 0.999 && !$('pg-banner').hidden && $('pg-banner-main').textContent === L1.name) { bannerOk = true; bannerSub = $('pg-banner-sub').textContent; }
      }
      const total = f;
      if (G.mode !== 'playing' || G.round !== 1) return 'did not end in round 2: ' + G.mode + ' ' + G.round;
      if (shutAt < 25 || shutAt > 36) return 'doors shut at ' + shutAt + ' (want ~30)';
      if (swapAt < shutAt || swapAt > shutAt + 2) return 'swap at ' + swapAt;
      if (openStart - shutAt < 30 || openStart - shutAt > 42) return 'held closed ' + (openStart - shutAt) + ' frames (want ~36)';
      if (total < 85 || total > 105) return 'transition took ' + total;
      if (!bannerOk || bannerSub.indexOf('2번째 탕') < 0) return 'banner during hold: ' + bannerOk + ' "' + bannerSub + '"';
      for (let i = 1; i < shutAt; i++) if (rows[i] < rows[i - 1] - 1e-9) return 'doors re-opened while shutting';
      for (let i = openStart; i < rows.length; i++) if (rows[i] > rows[i - 1] + 1e-9) return 'doors closed while opening';
      if (trace.indexOf('door:open') < 0) return 'no opening door sfx: ' + trace.slice(-6).join(',');
      if (!G.p.onGround || Math.abs(G.p.x - sx) > 0.5) return 'duck not standing at spawn';
      if (G.enemies.length !== L1.enemies.length || G.enemies.some((e) => e.state !== 'descend')) return 'enemies not descending';
      if ('ride' in G.p && G.p.ride) return 'duck still riding a bubble';
    });
    t('door transition: pause mid-wipe freezes it and resume finishes it', () => {
      restoreMaps(); D.seed(23); D.start(1); D.setInvincible(true); D.step(130);
      D.killAll(); let g = 0; while (G.mode !== 'transition' && g++ < 900) D.step(1);
      D.step(15);
      const d0 = G.trans.door, t0 = G.transT;
      D.pause(); D.step(60);
      const frozen = G.mode === 'paused' && G.transT === t0 && G.trans.door === d0;
      D.resume(); g = 0; while (G.mode === 'transition' && g++ < 300) D.step(1);
      if (!frozen) return 'not frozen';
      if (G.mode !== 'playing' || G.round !== 2) return 'mode ' + G.mode + ' round ' + G.round;
    });

    // ------------------------------------------------------------------ 6. water
    let P = null;
    t('water: hot pool patched in; getState counts water cells', () => {
      P = poolRound('~', 2);
      if (!P) return 'no floor stretch for a pool';
      if (S().water !== 16) return 'water cells ' + S().water;
      const w = D.waterAt(P.x + 4, P.surfY + 2);
      if (!w || w.kind !== 'hot' || w.surfaceY !== P.surfY) return 'waterAt ' + JSON.stringify(w);
    });
    t('water: the duck floats ~5 px submerged, bobbing, and never sinks', () => {
      if (!P) return 'no pool';
      trace.length = 0;
      D.setPlayer(P.x + 24, P.surfY - 80);
      const ys = [];
      for (let f = 0; f < 150; f++) { D.step(1); if (f > 110) ys.push(G.p.y); }
      const want = P.surfY + 5 - 16;
      if (!G.p.water) return 'not in water y=' + G.p.y;
      if (!G.p.onGround) return 'floating duck should count as standing';
      if (ys.some((y) => Math.abs(y - want) > 1.5)) return 'not settled at ' + want + ': ' + ys.map((y) => y.toFixed(1)).join(',');
      if (trace.indexOf('splash') < 0) return 'no splash sfx on entry';
      if (G.p.y + 16 >= P.floorY) return 'sank to the pool floor';
    });
    // (v3: the duck's perk keeps it at full speed afloat; with perks off it is the v2 0.8x)
    t('water: moving while floating is 0.8x walking speed (duck perk: 1x)', () => {
      if (!P) return 'no pool';
      const swim = () => { D.setPlayer(P.x + 8, P.surfY + 5 - 16); D.step(30); D.press('right', true); D.step(15); const x0 = G.p.x; D.step(20); const v = (G.p.x - x0) / 20; D.press('right', false); const w = G.p.water; D.step(30); return w ? v : -1; };
      D.setPerks(false); const v0 = swim(); D.setPerks(true); const v1 = swim();
      if (v0 < 0 || v1 < 0) return 'left the water';
      if (!near(v0, 1.25 * 0.8, 0.03)) return 'perks off speed ' + v0.toFixed(3);
      if (!near(v1, 1.25, 0.03)) return 'duck perk speed ' + v1.toFixed(3);
    });
    t('water: the duck jumps out with a normal jump and splashes back in', () => {
      if (!P) return 'no pool';
      D.setPlayer(P.x + 24, P.surfY + 5 - 16); D.step(40);
      const y0 = G.p.y; trace.length = 0;
      tap('jump');
      let minY = y0, outAtApex = false;
      for (let f = 0; f < 60; f++) { D.step(1); if (G.p.y < minY) { minY = G.p.y; outAtApex = !G.p.water; } }
      const apex = y0 - minY;
      if (apex < 34 || apex > 42) return 'apex ' + apex.toFixed(1);
      if (!outAtApex) return 'still in water at the apex';
      D.step(60);
      if (!G.p.water) return 'did not come back down into the pool';
      if (trace.filter((s) => s === 'splash').length < 2) return 'splash sfx on leave + enter: ' + trace.join(',');
    });
    t('water: ground enemies wade along the pool floor at 0.6x; hot water soaks them for 6 s after leaving', () => {
      P = poolRound('~', 1);
      const e = G.enemies[0];
      activate(e, P.x + 4, P.floorY - 16, 'grime');
      D.step(4);
      if (e.water !== 1) return 'not wading (water=' + e.water + ' y=' + e.y + ')';
      if (!(e.soakT >= 355)) return 'not soaked in hot water: ' + e.soakT;
      if (Math.abs(e.y + 16 - P.floorY) > 0.5 || !e.onGround) return 'not on the pool floor y=' + e.y;
      e.x = P.x + 4; e.dir = 1; e.angry = false; D.step(1); const x0 = e.x; D.step(20);
      const vWade = (e.x - x0) / 20;
      if (!near(vWade, 0.6 * 0.6, 0.02)) return 'wading speed ' + vWade.toFixed(3);
      if (!S().enemies[0].soaked) return 'getState soaked flag';
      // out of the water: soaked for 6 s at half speed
      const fx = 40; activate(e, fx, PF_TOP + 25 * 8 - 16, 'grime'); e.soakT = 360; e.dir = 1;
      D.step(1); const x1 = e.x; D.step(30);
      const vSoak = (e.x - x1) / 30;
      if (!near(vSoak, 0.6 * 0.5, 0.02)) return 'soaked speed ' + vSoak.toFixed(3);
      D.step(360 - 31 - 2);
      if (!(e.soakT > 0)) return 'soak ended early';
      D.step(4);
      if (e.soakT > 0) return 'soak did not end after 6 s: ' + e.soakT;
      const x2 = e.x; D.step(20);
      if (!near(Math.abs(e.x - x2) / 20, 0.6, 0.03)) return 'normal speed not restored ' + ((e.x - x2) / 20).toFixed(3);
    });
    t('water: soaked enemy trapped stays 1.5x longer and its kill scores x2; sprite tint exists', () => {
      fresh(0, 24);
      const e = G.enemies[0];
      activate(e, 100, PF_TOP + 25 * 8 - 16, 'grime'); e.soakT = 200;
      const b = D.spawnBubble('empty', 100, e.y); b.state = 'shot'; b.vx = 0.01; b.shotT = 5;
      D.step(1);
      if (e.state !== 'trapped' || !b.soaked) return 'not trapped soaked: ' + e.state;
      if (b.trapMax !== Math.round(G.trapTime * 1.5)) return 'trapMax ' + b.trapMax + ' vs ' + G.trapTime;
      const sc = G.score; D.popAll();
      if (G.score - sc !== 1000) return 'soaked kill scored ' + (G.score - sc);
      for (const n of ['grime_soaked', 'mold_soaked', 'sponge_soaked']) if (!(PG.SPRITES && PG.SPRITES[n]) && !document.querySelector('canvas')) return 'missing ' + n;
    });
    t('water: flies bounce off the surface', () => {
      P = poolRound('~', 2);
      const e = G.enemies[0];
      activate(e, P.x + 24, P.surfY - 40, 'fly'); e.fvx = 0.0001; e.fvy = 1; e.onGround = false;
      let lowest = 0;
      for (let f = 0; f < 120; f++) { D.step(1); lowest = Math.max(lowest, e.y + 16); }
      if (lowest > P.surfY + 0.5) return 'fly went into the water: bottom ' + lowest + ' surface ' + P.surfY;
    });
    t('water: bubbles over hot water rise 1.6x faster', () => {
      P = poolRound('~', 1);
      G.gather = { x: 128, y: 30 };
      const hot = D.spawnBubble('empty', P.x + 24, 150), cold = D.spawnBubble('empty', 40, 150);
      hot.age = cold.age = 100;
      for (let f = 0; f < 120; f++) { hot.x = P.x + 24; cold.x = 40; D.step(1); }
      const rh = 150 - hot.y, rc = 150 - cold.y;
      if (!(rh > rc * 1.45 && rh < rc * 1.75)) return 'rise hot ' + rh.toFixed(1) + ' vs ' + rc.toFixed(1);
    });
    t('ice: a bubble touching a cold surface freezes into a 16x16 block on the surface', () => {
      P = poolRound('=', 1);
      trace.length = 0;
      const b = D.spawnBubble('empty', P.x + 24, P.surfY - 12);
      D.step(1);
      if (G.ice.length !== 1 || S().ice !== 1) return 'ice ' + G.ice.length;
      const ice = G.ice[0];
      if (ice.y !== P.surfY - 8 || ice.x % 8 !== 0 || ice.x < P.x || ice.x + 16 > P.x + 64) return 'ice at ' + ice.x + ',' + ice.y + ' surf ' + P.surfY;
      if (G.bubbles.indexOf(b) >= 0) return 'bubble survived';
      if (trace.indexOf('freeze') < 0) return 'no freeze sfx';
    });
    t('ice: it is a one-way platform the duck can stand on, then it melts after 6 s', () => {
      const ice = G.ice[0]; if (!ice) return 'no ice';
      D.setPlayer(ice.x, ice.y - 50);
      D.step(60);
      if (!G.p.onGround || G.p.y !== ice.y - 16 || G.p.water) return 'not standing on ice: y=' + G.p.y + ' ice ' + ice.y + ' water ' + G.p.water;
      // from below it does not block: a jump from the water passes up through it
      trace.length = 0;
      let g = 0; while (G.ice.length && g++ < 400) D.step(1);
      if (G.ice.length) return 'never melted';
      if (ice.t < 355 || ice.t > 361) return 'melted at ' + ice.t;
      if (trace.indexOf('melt') < 0) return 'no melt sfx';
      D.step(40);
      if (G.p.water !== 2) return 'duck did not drop into the cold pool: water=' + G.p.water;
    });
    t('ice: a trapped enemy touching cold water is frozen inside and dies (500 pts) when the ice melts', () => {
      P = poolRound('=', 1);
      const e = G.enemies[0], keep = G.enemies[1];
      activate(e, P.x + 20, P.floorY - 16, 'grime');
      D.step(2);
      const b = D.spawnBubble('empty', e.x, e.y); b.state = 'shot'; b.vx = 0.01; b.shotT = 6;
      D.step(3);
      if (e.state !== 'frozen' || !G.ice.length || G.ice[0].enemy !== e) return 'enemy ' + e.state + ' ice ' + G.ice.length;
      if (G.bubbles.some((q) => q.kind === 'trapped')) return 'trapped bubble kept';
      if (G.clearT >= 0) return 'round cleared while frozen';
      const sc = G.score; let g = 0;
      while (e.state === 'frozen' && g++ < 400) D.step(1);
      if (e.state !== 'dead') return 'enemy ' + e.state;
      if (G.score - sc !== 500) return 'melt kill scored ' + (G.score - sc);
      if (keep.state !== 'descend') return 'keep changed';
    });
    t('water: snacks that land in a pool float up to the surface', () => {
      P = poolRound('~', 2);
      G.items.push({ type: 'egg', value: 300, x: P.x + 20, y: P.surfY - 60, vx: 0, vy: 0, onGround: false, floating: false, age: 0 });
      D.setPlayer(30, PF_TOP + 25 * 8 - 16);
      D.step(120);
      const it = G.items[0];
      if (!it || !it.onGround || !near(it.y + 16, P.surfY + 3, 0.6)) return 'item ' + (it ? it.y + ' onG ' + it.onGround : 'gone');
    });

    // ------------------------------------------------------------------ 7. power-ups
    function shotDistance() {
      D.setPlayer(30, PF_TOP + 25 * 8 - 16); D.step(3); G.p.facing = 1; G.p.shootCd = 0;
      tap('shoot');
      const b = G.bubbles[G.bubbles.length - 1]; const x0 = b.x; let f = 0;
      while (b.state === 'shot' && f++ < 80) D.step(1);
      return { d: b.x - x0, big: b.big };
    }
    // (v4 kits: the 1.5x travel is the base bubble's - every animal's with 능력 끄기; the duck's own echo flies out
    // farther with shampoo, 63 -> 78 px before it turns, char-kits §3)
    function echoReach() {
      D.setPlayer(30, PF_TOP + 25 * 8 - 16); D.step(3); G.p.facing = 1; G.p.shootCd = 0;
      tap('shoot');
      const b = G.bubbles[G.bubbles.length - 1]; const x0 = b.x - 3.5; let f = 0, mx = 0; // (from the spawn: one frame flown)
      while (b.state === 'shot' && f++ < 90) { D.step(1); mx = Math.max(mx, b.x - x0); }
      return mx;
    }
    t('샴푸: bubbles travel 1.5x farther with a 1.5x capture radius, for 12 s with a HUD timer', () => {
      fresh(0, 25);
      D.setPerks(false);
      const n = shotDistance();
      trace.length = 0;
      if (!D.givePower('shampoo')) return 'givePower failed';
      if (trace.indexOf('powerup') < 0) return 'no powerup sfx';
      const st = S().power;
      if (!st || st.type !== 'shampoo' || st.framesLeft !== 720) return 'state ' + JSON.stringify(st);
      G.bubbles = [];
      const s = shotDistance();
      D.setPerks(true);
      if (!s.big || !near(s.d / n.d, 1.5, 0.08)) return 'distance (base bubble) ' + n.d.toFixed(1) + ' -> ' + s.d.toFixed(1);
      G.bubbles = []; G.power = null; const e0 = echoReach();
      G.bubbles = []; D.givePower('shampoo'); const e1 = echoReach(); G.bubbles = [];
      if (!near(e0, 63, 1) || !near(e1, 78.3, 1)) return 'duck echo reach ' + e0.toFixed(1) + ' -> ' + e1.toFixed(1);
      // capture radius: an enemy 11 px off the bubble path is caught only with shampoo
      const tryCatch = () => {
        G.bubbles = [];
        D.setPlayer(30, PF_TOP + 25 * 8 - 16); D.step(3); G.p.facing = 1; G.p.shootCd = 0;
        const e = G.enemies[0]; activate(e, 80, G.p.y - 20, 'grime');
        tap('shoot');
        for (let f = 0; f < 25; f++) { if (e.state === 'active') { e.x = 80; e.y = G.p.y - 20; e.vx = e.vy = 0; } D.step(1); }
        const caught = e.state === 'trapped';
        park(e); G.bubbles = [];
        return caught;
      };
      const withShampoo = tryCatch();
      G.power = null;
      const without = tryCatch();
      if (!withShampoo || without) return 'capture with=' + withShampoo + ' without=' + without;
      D.givePower('shampoo'); D.step(700);
      if (!G.power || G.power.t > 21) return 'timer ' + (G.power && G.power.t);
      D.step(25);
      if (G.power) return 'did not expire after 12 s';
    });
    t('고무 슬리퍼: walk 1.4x, jump velocity 1.08x', () => {
      fresh(0, 26);
      const measure = () => {
        D.setPlayer(24, PF_TOP + 25 * 8 - 16); D.step(5);
        D.press('right', true); D.step(15); const x0 = G.p.x; D.step(20); const v = (G.p.x - x0) / 20; D.press('right', false); D.step(20);
        const y0 = G.p.y; tap('jump'); let minY = y0; for (let f = 0; f < 50; f++) { D.step(1); minY = Math.min(minY, G.p.y); }
        D.step(30);
        return { v, apex: y0 - minY };
      };
      const a = measure();
      D.givePower('slippers');
      const b = measure();
      if (!near(a.v, 1.25, 0.02) || !near(b.v, 1.75, 0.03)) return 'walk ' + a.v.toFixed(3) + ' -> ' + b.v.toFixed(3);
      const ratio = b.apex / a.apex;
      if (!(ratio > 1.12 && ratio < 1.22)) return 'apex ' + a.apex.toFixed(1) + ' -> ' + b.apex.toFixed(1) + ' (x1.08 velocity ~ x1.17 height)';
    });
    t('입욕제: instant fizz, every active enemy becomes soaked for 8 s (no timed slot)', () => {
      fresh(0, 27);
      G.power = null;
      const [a, b, c] = G.enemies;
      activate(a, 40, 100, 'grime'); activate(b, 120, 100, 'mold'); activate(c, 200, 60, 'fly'); c.fvx = 1; c.fvy = 1; c.onGround = false;
      const p0 = G.parts.length;
      D.givePower('bathbomb');
      if (G.power) return 'bath bomb took the timed slot';
      if (G.parts.length < p0 + 30) return 'no fizz particles';
      if ([a, b, c].some((e) => e.soakT < 470)) return 'soak ' + [a, b, c].map((e) => e.soakT).join(',');
      if (G.enemies.slice(3).some((e) => e.soakT > 0)) return 'parked enemies soaked';
    });
    t('power-up pickup floats down to a surface and is used on touch', () => {
      fresh(0, 28);
      G.power = null;
      const k = D.spawnPickup('slippers', 60, 40);
      let f = 0; while (!k.onGround && f++ < 400) D.step(1);
      if (!k.onGround) return 'never landed';
      if (f < 30) return 'fell too fast (' + f + ' frames)';
      if (S().pickup !== 'slippers') return 'getState pickup';
      D.setPlayer(k.x, k.y); D.step(1);
      if (G.pickup) return 'not picked up';
      if (!G.power || G.power.type !== 'slippers') return 'power ' + JSON.stringify(G.power);
      // an unclaimed pickup disappears after a while
      const k2 = D.spawnPickup('shampoo', 200, 40); D.setPlayer(30, PF_TOP + 25 * 8 - 16);
      let g = 0; while (G.pickup && g++ < 1500) D.step(1);
      if (G.pickup) return 'pickup never expired';
    });
    t('a chain of 2+ kills drops a power-up about 35% of the time, at most one on screen', () => {
      let drops = 0, tries = 0, extra = 0;
      for (let s = 0; s < 60; s++) {
        fresh(0, 300 + s);
        const [a, b] = G.enemies; activate(a, 100, 100, 'grime'); activate(b, 112, 100, 'grime');
        for (const e of G.enemies.slice(2)) e.state = 'hold';
        D.trapAll();
        for (const e of G.enemies.slice(2)) e.state = 'descend';
        const pre = s % 5 === 0 ? D.spawnPickup('shampoo', 200, 40) : null;
        D.popAll(); tries++;
        if (pre) { if (G.pickup !== pre) extra++; continue; }
        if (G.pickup) drops++;
      }
      const rate = drops / (tries - 12);
      if (extra) return 'a second pickup replaced the one on screen';
      if (rate < 0.18 || rate > 0.55) return 'drop rate ' + rate.toFixed(2) + ' (' + drops + '/' + (tries - 12) + ')';
      log('V2 INFO power-up drop rate ' + rate.toFixed(2));
    });
    t('power-ups are lost on death; a new power replaces the old one', () => {
      fresh(0, 29);
      D.givePower('shampoo'); D.givePower('slippers');
      if (!G.power || G.power.type !== 'slippers' || G.power.t !== 720) return 'replace ' + JSON.stringify(G.power);
      D.setInvincible(false); G.p.invuln = 0;
      const e = G.enemies[0]; activate(e, G.p.x, G.p.y, 'grime');
      D.step(1);
      if (G.mode !== 'dying') return 'no death';
      if (G.power) return 'power kept through death';
      D.step(95); D.setInvincible(true);
    });

    // ------------------------------------------------------------------ 8. debug API / state shape
    t('getState v2 fields and new debug helpers', () => {
      const s = S();
      for (const k of ['stamps', 'power', 'water', 'ice', 'drops', 'boss']) if (!(k in s)) return 'missing ' + k;
      if (s.boss !== null) return 'boss should be null in a normal round';
      if ('letters' in s || 'towel' in s) return 'v1 fields still present';
      for (const fn of ['givePower', 'giveStamps', 'spawnDrop', 'getState', 'start', 'step', 'press', 'trapAll', 'popAll', 'killAll', 'setInvincible', 'gotoRound', 'seed']) if (typeof D[fn] !== 'function') return 'missing ' + fn;
      if (typeof s.water !== 'number' || typeof s.ice !== 'number' || typeof s.drops !== 'number' || typeof s.stamps !== 'number') return 'types';
    });
    t('every round (incl. any boss / water rounds) plays 600 frames cleanly', () => {
      restoreMaps();
      const bad = [];
      for (let i = 0; i < LV.length; i++) {
        D.seed(500 + i); D.start(i); D.setInvincible(true);
        for (let f = 0; f < 600; f++) {
          if (f % 10 === 0) { D.press('left', Math.random() < 0.4); D.press('right', Math.random() < 0.4); D.press('jump', Math.random() < 0.3); D.press('shoot', Math.random() < 0.5); }
          D.step(1);
          const p = G.p;
          if (!isFinite(p.x) || !isFinite(p.y)) { bad.push('R' + (i + 1) + ' NaN'); break; }
        }
        if (S().water) log('V2 INFO round ' + (i + 1) + ' ' + LV[i].name + ' has ' + S().water + ' water cells');
      }
      releaseAll();
      if (bad.length) return bad.join(', ');
    });

    restoreMaps();
    releaseAll();
    D.setInvincible(false);
    if (oSfx) A.sfx = oSfx;
    t('no uncaught page errors', () => (errors === 0 ? undefined : errors + ' errors'));
    log('V2 DONE pass=' + pass + ' fail=' + fail);
  }
  function go() { if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30); setTimeout(() => { try { run(); } catch (e) { console.log('V2 FAIL exception ' + e.message + ' ' + (e.stack || '').split('\n')[1]); console.log('V2 DONE pass=' + pass + ' fail=' + (fail + 1)); } }, 60); }
  go();
})();
