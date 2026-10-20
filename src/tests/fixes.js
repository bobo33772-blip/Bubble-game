// Regression tests for the review fixes (landing, steam blast, result-screen key lock, clear wait,
// stamp-bubble cadence/popup, trapped time, level placement rules). Runs through PG.debug.step, so it works
// under virtual time:
//   node tools/run-chrome.js test-fixes.html - 900 760 30000
// Prints "FIX PASS/FAIL <name>" lines and "FIX DONE pass=.. fail=..".
(function () {
  let pass = 0, fail = 0, errors = 0;
  window.addEventListener('error', (e) => { errors++; console.log('FIX page error: ' + e.message + ' @' + e.lineno); });
  const ok = (name, cond, info) => { if (cond) { pass++; console.log('FIX PASS ' + name + (info ? ' (' + info + ')' : '')); } else { fail++; console.log('FIX FAIL ' + name + (info ? ': ' + info : '')); } };
  const key = (type, code, k) => window.dispatchEvent(new KeyboardEvent(type, { code, key: k || code, bubbles: true, cancelable: true }));
  const PF_TOP = 16, FLOOR_TOP = PF_TOP + 25 * 8;

  function run() {
    const D = PG.debug, G = D.G, LV = D.levels();
    const releaseAll = () => { for (const a of ['left', 'right', 'jump', 'shoot']) D.press(a, false); };
    const gapOf = (L) => { const g = []; for (let c = 2; c < 30; c++) if (L.map[25][c] === '.') g.push(c); return g; };

    // 1. a 2-column wrap gap: walking in never leaves the duck standing inside the floor row; it wraps
    {
      const L = LV[0], saved = { map: L.map, gapX: L.gapX };
      L.map = L.map.slice(); L.map[0] = L.map[25] = '###############..###############'; L.gapX = 16 * 8;
      const res = [];
      for (const dir of [1, -1]) {
        D.seed(3); D.start(0); D.setInvincible(true); D.step(1);
        G.enemies = []; G.clearT = -5000;
        G.enemies.push({ id: 999, type: 'grime', x: 30, y: 0, vx: 0, vy: 0, dir: 1, state: 'trapped', bubble: null, t: 0, gone: false });
        D.setPlayer(dir > 0 ? 120 - 4 : 136 - 12, FLOOR_TOP - 16); G.p.onGround = true;
        D.press(dir > 0 ? 'right' : 'left', true);
        let sunk = null, wrapped = false;
        for (let f = 0; f < 60 && !wrapped; f++) {
          D.step(1);
          if (G.p.onGround && G.p.y + 16 > FLOOR_TOP + 0.5) sunk = sunk || ('y=' + G.p.y.toFixed(1) + ' f' + f);
          if (G.p.y < 100) wrapped = true;
        }
        releaseAll();
        res.push('dir ' + dir + (sunk ? ' SUNK ' + sunk : '') + (wrapped ? ' wrapped' : ' no-wrap'));
      }
      L.map = saved.map; L.gapX = saved.gapX;
      ok('2-col gap: duck wraps and never stands inside the floor row', res.every((s) => !/SUNK/.test(s) && /wrapped/.test(s)), res.join(' | '));
    }

    // 2. covered tiles (inside a pillar) are not landing surfaces: R14's ㅌ has a solid column at col 4, rows 4-12
    {
      const r = LV.findIndex((L) => L.map[6][4] === '#' && L.map[5][4] === '#' && L.map[7][4] === '#');
      if (r < 0) ok('pillar fall-through (no pillar round found, skipped)', true);
      else {
        D.seed(4); D.start(r); D.setInvincible(true); D.step(1);
        G.enemies = []; G.clearT = -5000;
        G.enemies.push({ id: 998, type: 'grime', x: 30, y: 0, vx: 0, vy: 0, dir: 1, state: 'trapped', bubble: null, t: 0, gone: false });
        D.setPlayer(22, PF_TOP + 6 * 8 - 16);
        const stops = [];
        for (let f = 0; f < 150; f++) { D.step(1); if (G.p.onGround && stops.indexOf(G.p.y) < 0) stops.push(G.p.y); }
        const inPillar = stops.filter((y) => y + 16 > PF_TOP + 6 * 8 && y + 16 <= PF_TOP + 12 * 8);
        ok('falling beside/through a pillar does not rest on covered tiles', inPillar.length === 0 && G.p.onGround, 'round ' + (r + 1) + ' rest y=' + stops.join(','));
      }
    }

    // 3. steam blast from the duck sweeps the duck's own row, also when the bubble is popped overhead mid-jump
    {
      const si = LV.findIndex((L) => L.special === 'steam');
      const res = [];
      for (const dy of [-30, -16, -4]) {
        D.seed(5); D.start(si); D.setInvincible(true); D.step(130);
        G.bubbles = []; G.steamT = -1; G.stampT = 1e9;
        const p = G.p; p.facing = 1; p.vx = 0;
        const keep = G.enemies.filter((e) => e.type !== 'fly').slice(0, 3);
        G.enemies = keep;
        keep.forEach((e, k) => { Object.assign(e, { state: 'active', x: p.x + 30 + k * 22, y: p.y, vx: 0, vy: 0, onGround: true, dir: -1, angry: false, windT: 0, chargeT: 0, chargeCd: 999, hopT: 999, jumpCd: 999 }); });
        const b = D.spawnBubble('steam', p.x, p.y + dy); b.grace = 0;
        if (dy < -10) { D.press('jump', true); D.step(1); D.press('jump', false); }
        let f = 0; while (G.bubbles.some((q) => q.kind === 'steam' && q.state === 'float') && f++ < 60) D.step(1);
        D.step(45);
        const killed = keep.filter((e) => e.state === 'dead' || e.gone).length;
        res.push('dy ' + dy + ': ' + killed + '/3');
      }
      ok('steam blast clears the duck\'s row (overhead and side pops)', res.every((s) => /: 3\/3/.test(s)), res.join(' | '));
    }

    // 4. a steam blast through a trapped enemy bursts its bubble (no lingering enemy-less trapped bubble)
    {
      const si = LV.findIndex((L) => L.special === 'steam');
      D.seed(6); D.start(si); D.setInvincible(true); D.step(130);
      G.bubbles = []; G.steamT = -1;
      const p = G.p; p.facing = 1;
      const e = G.enemies.find((q) => q.type !== 'fly');
      G.enemies = [e];
      Object.assign(e, { state: 'active', x: p.x + 50, y: p.y, vx: 0, vy: 0, onGround: true, hopT: 999, chargeCd: 999, jumpCd: 999 });
      D.trapAll(); // traps it in a bubble where it stands
      const trappedBubble = G.bubbles.find((q) => q.kind === 'trapped');
      trappedBubble.y = p.y; trappedBubble.x = p.x + 40;
      D.spawnBubble('steam', p.x + 2, p.y); // touching the duck: popped by the player next step
      let bad = false;
      for (let f = 0; f < 40; f++) {
        D.step(1);
        for (const q of G.bubbles) if (q.kind === 'trapped' && q.state === 'float' && !q.enemy) bad = true;
      }
      ok('steam kills a trapped enemy and its bubble bursts', e.state === 'dead' || e.gone ? !bad : false, 'enemy ' + e.state + ' lingering=' + bad);
    }

    // 5. result screens ignore jump/shoot for ~1 s, then accept a fresh press; Enter is immediate
    {
      const toGameOver = () => {
        D.seed(7); D.start(0); D.step(140); D.setInvincible(false); G.lives = 1; G.p.invuln = 0;
        const e = G.enemies.find((q) => q.state === 'active'); e.x = G.p.x; e.y = G.p.y;
        let g = 0; while (G.mode !== 'gameover' && g++ < 200) D.step(1);
        return G.mode === 'gameover';
      };
      let r1 = toGameOver();
      key('keydown', 'KeyX', 'x'); key('keyup', 'KeyX', 'x');
      const m1 = G.mode;
      D.step(30); key('keydown', 'Space', ' '); key('keyup', 'Space', ' ');
      const m2 = G.mode;
      D.step(35); key('keydown', 'KeyX', 'x'); key('keyup', 'KeyX', 'x');
      const m3 = G.mode;
      ok('game over: X/Space ignored for ~1 s, then a fresh X retries', r1 && m1 === 'gameover' && m2 === 'gameover' && m3 === 'playing' && G.lives === 4 && G.score === 0, [r1, m1, m2, m3].join(','));
      r1 = toGameOver();
      key('keydown', 'Enter', 'Enter'); key('keyup', 'Enter', 'Enter');
      ok('game over: Enter retries immediately', r1 && G.mode === 'playing', G.mode);
      r1 = toGameOver();
      const held = new KeyboardEvent('keydown', { code: 'KeyX', key: 'x', repeat: true, bubbles: true, cancelable: true });
      D.step(70); window.dispatchEvent(held);
      ok('game over: an auto-repeating held key never retries', r1 && G.mode === 'gameover', G.mode);
      key('keyup', 'KeyX', 'x');

      D.start(LV.length - 1); D.setInvincible(true); D.step(140); D.killAll();
      let g = 0; while (G.mode !== 'ending' && g++ < 1200) D.step(1);
      const re = G.mode === 'ending';
      key('keydown', 'KeyZ', 'z'); key('keyup', 'KeyZ', 'z');
      const e1 = G.mode;
      D.step(62); key('keydown', 'KeyZ', 'z'); key('keyup', 'KeyZ', 'z');
      ok('ending: Z ignored at first, a fresh Z after ~1 s starts the next loop', re && e1 === 'ending' && G.mode === 'playing' && G.loop === 1, [re, e1, G.mode, G.loop].join(','));
    }

    // 6. the snack-grab window (3 s) starts only after the last knocked-out enemy has landed as a snack
    {
      const r6 = LV.findIndex((L, i) => i >= 5 && !L.boss && L.enemies.length >= 4);
      D.seed(8); D.start(r6); D.setInvincible(true); D.step(150);
      D.trapAll(); D.step(200); D.popAll();
      let f = 0, landed = -1, trans = -1;
      while (f++ < 900) {
        D.step(1);
        if (landed < 0 && !G.enemies.length) landed = f;
        if (G.mode === 'transition') { trans = f; break; }
      }
      ok('round clear waits ~3 s after the last snack lands', landed > 0 && trans - landed >= 175 && trans - landed <= 185, 'last landed f' + landed + ', scroll f' + trans);
    }

    // 7. stamp-bubble cadence counts play time across rounds; a fresh game starts it within 10-15 s
    {
      D.seed(9); D.start(0); const t0 = G.stampT;
      G.stampT = 250; D.gotoRound(1); const t1 = G.stampT;
      G.stampT = 1200; D.gotoRound(2); const t2 = G.stampT;
      D.step(100); const t3 = G.stampT;
      ok('stamp timer: carried over across rounds (never re-rolled), first one within 10-15 s', t0 >= 600 && t0 <= 900 && t1 === 250 && t2 === 1200 && t3 === 1100, [t0, t1, t2, t3].join(','));
    }

    // 8. the collected-stamp popup appears above the duck, not on top of it
    {
      D.seed(10); D.start(2); D.setInvincible(true); D.step(150);
      G.stamps = 0; G.pops = [];
      const p = G.p;
      const b = D.spawnBubble('stamp', p.x + 4, p.y - 4); b.grace = 0;
      D.step(2);
      const pop = G.pops.find((q) => q.icon === 'stamp');
      const clear = pop && (pop.y + 16 <= p.y + 2 || Math.abs(pop.x - (p.x + 8)) >= 19);
      ok('stamp popup does not cover the duck', G.stamps === 1 && !!clear, pop ? 'pop y=' + pop.y.toFixed(1) + ' x=' + pop.x.toFixed(1) + ' duck y=' + p.y.toFixed(1) : 'no popup');
    }

    // 9. trapped time stays >= 5 s even in the last rounds of later loops
    {
      D.seed(11); D.start(LV.length - 1); const a = G.trapTime;
      G.loop = 1; D.gotoRound(LV.length - 1); const b2 = G.trapTime;
      G.loop = 3; D.gotoRound(LV.length - 1); const c = G.trapTime;
      ok('trapped time floor', a >= 300 && b2 >= 300 && c >= 300 && a > b2, [a, b2, c].join(','));
    }

    // 10. level placement rules from the review
    {
      const bad = [];
      LV.forEach((L, i) => {
        const g = gapOf(L);
        if (g.length < 3) bad.push('R' + (i + 1) + ' gap ' + g.length);
        const gc = (g[0] + g[g.length - 1]) / 2;
        if (i > 0 && !L.boss && Math.abs(L.gather.col - gc) < 5.5) bad.push('R' + (i + 1) + ' gather col ' + L.gather.col + ' vs gap ' + gc);
      });
      ok('levels: gaps >= 3 wide, gather points away from the ceiling gap (R1 and boss arenas exempt)', bad.length === 0, bad.join(', '));
    }

    releaseAll();
    D.setInvincible(false);
    ok('no uncaught errors', errors === 0, String(errors));
    console.log('FIX DONE pass=' + pass + ' fail=' + fail);
  }
  function go() { if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30); setTimeout(run, 60); }
  go();
})();
