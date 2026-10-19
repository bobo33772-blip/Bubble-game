// Reviewer test driver (runtime correctness / robustness). Tries to break the engine through PG.debug.step,
// so it works under run-chrome.js virtual time:
//   node tools/run-chrome.js test-review-correctness.html - 900 760 60000
// Prints "RV PASS/FAIL <name>: info" lines and "RV DONE pass=.. fail=..".
(function () {
  let pass = 0, fail = 0, errors = 0;
  window.addEventListener('error', (e) => { errors++; console.log('RV page error: ' + e.message + ' @' + e.lineno); });
  const ok = (name, cond, info) => { if (cond) { pass++; console.log('RV PASS ' + name + (info ? ' (' + info + ')' : '')); } else { fail++; console.log('RV FAIL ' + name + (info ? ': ' + info : '')); } };
  const key = (type, code, k) => window.dispatchEvent(new KeyboardEvent(type, { code, key: k || code, bubbles: true, cancelable: true }));
  const PF_TOP = 16, FLOOR_TOP = PF_TOP + 25 * 8; // 216 = top of the floor row

  function run() {
    const D = PG.debug, G = D.G, LV = D.levels();
    const solid = (map, c, r) => map[((r % 26) + 26) % 26][c] === '#';
    const releaseAll = () => { for (const a of ['left', 'right', 'jump', 'shoot']) D.press(a, false); };

    // ------------------------------------------------------------------ 1. floor-gap "invisible floor"
    // Walk off the floor into the wrap gap at walking speed, from both sides, on every round.
    const sunk = [];
    for (let r = 0; r < LV.length; r++) {
      const map = LV[r].map; const gap = [];
      for (let c = 2; c < 30; c++) if (map[25][c] === '.') gap.push(c);
      const g0 = gap[0] * 8, g1 = (gap[gap.length - 1] + 1) * 8;
      for (const dir of [1, -1]) {
        D.seed(5); D.start(r); D.setInvincible(true); D.step(1);
        G.enemies = []; G.clearT = 0; G.clearT = -5000; // no enemies, no clear flow interference
        G.enemies.push({ id: 999, type: 'grime', x: 30, y: 0, vx: 0, vy: 0, dir: 1, state: 'trapped', bubble: null, t: 0, gone: false }); // keeps round "uncleared"
        const x = dir > 0 ? g0 - 3 - 1 : g1 - 13 + 1; // landing range [x+3, x+13] still touching the floor edge
        D.setPlayer(x, FLOOR_TOP - 16); G.p.onGround = true;
        D.press(dir > 0 ? 'right' : 'left', true);
        let sunkAt = null;
        for (let f = 0; f < 40; f++) {
          D.step(1);
          const p = G.p;
          if (p.onGround && p.y + 16 > FLOOR_TOP + 0.5) { sunkAt = { f, x: +p.x.toFixed(2), y: +p.y.toFixed(2) }; break; }
          if (p.y < 100) break; // wrapped to the top as intended
        }
        releaseAll();
        if (sunkAt) sunk.push('round ' + r + ' (' + LV[r].name + ', gap ' + gap.length + ' cols) dir ' + dir + ' -> standing at y=' + sunkAt.y + ' x=' + sunkAt.x + ' after ' + sunkAt.f + 'f');
      }
    }
    ok('walking into the floor gap never leaves the duck standing inside the floor row', sunk.length === 0, sunk.join(' | '));

    // Same for an angry grime (0.96 px/f) and a charging sponge on round 12 (2-col gap)
    {
      const r = LV.findIndex((L) => L.map[25].split('').filter((ch, i) => i > 1 && i < 30 && ch === '.').length === 2);
      const res = [];
      if (r >= 0) {
        const map = LV[r].map; let g0 = 0; for (let c = 2; c < 30; c++) if (map[25][c] === '.') { g0 = c * 8; break; }
        for (const type of ['grime', 'sponge']) {
          D.seed(7); D.start(r); D.setInvincible(true); D.step(1);
          G.enemies = G.enemies.slice(0, 1); const e = G.enemies[0];
          Object.assign(e, { type, state: 'active', angry: true, x: g0 - 3 - 1, y: FLOOR_TOP - 16, vx: 0, vy: 0, dir: 1, onGround: true, committed: true, chargeT: type === 'sponge' ? 50 : 0, windT: 0, jumpCd: 999 });
          D.setPlayer(200, 40); // far away, out of the row
          let hit = null;
          for (let f = 0; f < 30; f++) { D.step(1); if (e.onGround && e.y + 16 > FLOOR_TOP + 0.5) { hit = { f, x: +e.x.toFixed(1), y: e.y }; break; } if (e.y < 100) break; }
          res.push(type + (hit ? ' SUNK y=' + hit.y + ' x=' + hit.x + ' f' + hit.f : ' ok'));
        }
      }
      ok('angry grime / charging sponge fall through the 2-col gap', !res.some((s) => /SUNK/.test(s)), 'round ' + r + ': ' + res.join(', '));
    }

    // ------------------------------------------------------------------ 2. pause / resume mid-transition
    {
      D.seed(3); D.start(0); D.setInvincible(true); D.step(140);
      D.killAll(); let g = 0; while (G.mode !== 'transition' && g++ < 800) D.step(1);
      D.step(55); const t0 = G.transT; D.pause(); D.step(200);
      const frozen = G.mode === 'paused' && G.transT === t0;
      D.resume(); g = 0; while (G.mode === 'transition' && g++ < 400) D.step(1);
      D.step(30);
      ok('pause freezes transition and resume completes it', frozen && G.mode === 'playing' && G.round === 1 && !G.trans && G.p.onGround, JSON.stringify({ frozen, mode: G.mode, round: G.round, trans: !!G.trans, onG: G.p.onGround }));
    }

    // ------------------------------------------------------------------ 3. pause during dying -> 처음으로 -> new game is clean
    {
      D.seed(4); D.start(3); D.step(150); D.setInvincible(false); G.p.invuln = 0;
      const e = G.enemies.find((q) => q.state === 'active'); e.x = G.p.x; e.y = G.p.y; D.step(2);
      const wasDying = G.mode === 'dying';
      D.pause(); D.toTitle(); D.step(10);
      const t = G.mode === 'title' && !document.getElementById('pg-title').hidden && document.getElementById('pg-pause').hidden;
      D.start(0); D.step(5);
      ok('dying -> pause -> title -> start is clean', wasDying && t && G.mode === 'playing' && G.lives === 3 && G.score === 0 && !G.p.dead && !G.drops.length && !G.hurry && !G.scald, JSON.stringify({ wasDying, t, mode: G.mode, lives: G.lives, dead: G.p.dead }));
    }

    // ------------------------------------------------------------------ 4. game over / ending screens skipped by one action key
    {
      D.seed(6); D.start(0); D.step(140); D.setInvincible(false); G.lives = 1; G.p.invuln = 0;
      const e = G.enemies.find((q) => q.state === 'active'); e.x = G.p.x; e.y = G.p.y;
      let g = 0; while (G.mode !== 'gameover' && g++ < 200) D.step(1);
      const reached = G.mode === 'gameover';
      key('keydown', 'KeyX', 'x'); key('keyup', 'KeyX', 'x');
      const after = G.mode;
      ok('game-over screen is not dismissed by the first shoot press right after it appears', reached && after === 'gameover', 'reached=' + reached + ' mode after one X press=' + after + ' overlay hidden=' + document.getElementById('pg-over').hidden);

      D.start(LV.length - 1); D.setInvincible(true); D.step(140); D.killAll();
      g = 0; while (G.mode !== 'ending' && g++ < 900) D.step(1);
      const reachedEnd = G.mode === 'ending';
      key('keydown', 'KeyZ', 'z'); key('keyup', 'KeyZ', 'z');
      ok('ending screen is not dismissed by the first jump press right after it appears', reachedEnd && G.mode === 'ending', 'reached=' + reachedEnd + ' mode after one Z press=' + G.mode + ' loop=' + G.loop);
    }

    // ------------------------------------------------------------------ 5. blur clears held keys (real key events)
    {
      D.seed(8); D.start(0); D.setInvincible(true); D.step(140);
      key('keydown', 'ArrowRight', 'ArrowRight'); D.step(10); const x1 = G.p.x;
      window.dispatchEvent(new Event('blur')); D.step(30); const x2 = G.p.x; D.step(30); const x3 = G.p.x;
      key('keyup', 'ArrowRight', 'ArrowRight');
      ok('window blur releases a held key', Math.abs(x3 - x2) < 0.01, 'x after blur moved ' + (x3 - x2).toFixed(2));
    }

    // ------------------------------------------------------------------ 6. storage throwing everywhere
    {
      let threw = null;
      const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
      try {
        Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('SecurityError: blocked'); } });
        D.start(0); D.step(140); D.setInvincible(false); G.lives = 1; G.p.invuln = 0; G.score = 777;
        const e = G.enemies.find((q) => q.state === 'active'); e.x = G.p.x; e.y = G.p.y;
        let g = 0; while (G.mode !== 'gameover' && g++ < 200) D.step(1);
        key('keydown', 'KeyM', 'm'); key('keyup', 'KeyM', 'm'); key('keydown', 'KeyM', 'm'); key('keyup', 'KeyM', 'm');
        D.toTitle(); D.step(5);
      } catch (er) { threw = er.message; }
      try { if (desc) Object.defineProperty(window, 'localStorage', desc); else delete window.localStorage; } catch (e) { /* ignore */ }
      ok('blocked localStorage never throws', !threw && G.mode === 'title', threw || '');
    }

    // ------------------------------------------------------------------ 7. long soak: natural progression with random input + random pause/resume
    {
      const VALID = new Set(['title', 'playing', 'transition', 'dying', 'gameover', 'paused', 'ending']);
      const issues = []; const note = (s) => { if (issues.length < 25) issues.push(s); };
      let seedR = 1;
      const rnd = () => { seedR = (seedR * 1103515245 + 12345) & 0x7fffffff; return seedR / 0x7fffffff; };
      D.seed(2026); D.start(0);
      let frames = 0, roundsCleared = 0, deaths = 0, gameovers = 0, pauses = 0, lastRound = G.round, lastMode = G.mode, modeFrames = 0;
      let lastLoop = 0, maxBubbles = 0, maxItems = 0, maxParts = 0, endings = 0;
      const enemyTrack = new Map();
      const t0 = performance.now();
      const TOTAL = 60000;
      while (frames < TOTAL) {
        // inputs: change every few frames, biased to move+shoot
        if (frames % 6 === 0) { D.press('left', rnd() < 0.35); D.press('right', rnd() < 0.45); D.press('jump', rnd() < 0.3); D.press('shoot', rnd() < 0.5); }
        // invincible most of the time but not always (so deaths, game overs and respawns happen)
        if (frames % 3000 === 0) D.setInvincible(rnd() < 0.7);
        // random pauses in every mode, including transition and dying
        if (rnd() < 0.004 && (G.mode === 'playing' || G.mode === 'dying' || G.mode === 'transition')) { pauses++; const m = G.mode; D.pause(); D.step(3); if (G.mode !== 'paused') note('pause from ' + m + ' did not pause'); D.resume(); if (G.mode !== m) note('resume from ' + m + ' went to ' + G.mode); }
        // make progress: every 1500 frames in a round, trap and pop everything (as a skilled player would)
        if (G.mode === 'playing' && G.roundT > 0 && G.roundT % 1500 === 0) { D.trapAll(); }
        if (G.mode === 'playing' && G.roundT > 0 && G.roundT % 1500 === 40) { D.popAll(); }
        const prevScore = G.score, prevEnemies = G.enemies.length, prevMode = G.mode, prevRound = G.round;
        D.step(1); frames++;
        // ---- invariants
        if (!VALID.has(G.mode)) note('f' + frames + ' invalid mode ' + G.mode);
        if (G.mode === prevMode) modeFrames++; else modeFrames = 0;
        if (G.mode === 'dying' && modeFrames > 95) note('f' + frames + ' stuck dying ' + modeFrames);
        if (G.mode === 'transition' && modeFrames > 110) note('f' + frames + ' stuck transition ' + modeFrames);
        // (after a boss the snack window runs with the foam explosion and the victory fanfare: 250 frames)
        if (G.mode === 'playing' && G.clearT > (G.boss ? 255 : 200)) note('f' + frames + ' stuck clear wait ' + G.clearT);
        if (G.mode === 'gameover') { gameovers++; D.start(rnd() < 0.5 ? 0 : (prevRound + 1) % LV.length); continue; }
        if (G.mode === 'ending') { endings++; D.G.mode = 'ending'; const before = G.loop; document.getElementById('pg-end-next').click(); if (G.loop !== before + 1 || G.mode !== 'playing') note('continue loop failed'); continue; }
        if (G.mode === 'dying' && prevMode !== 'dying') deaths++;
        // the next round is built while the bath doors are shut (mode 'transition'), so check it right at the swap
        if (G.round !== prevRound && (G.mode === 'playing' || G.mode === 'transition')) {
          roundsCleared++;
          if (G.bubbles.length || G.items.length || G.bolts.length || G.drops.length || G.ice.length || G.pickup || G.hurry || G.scald || G.clearT !== -1) note('round ' + G.round + ' started dirty: b' + G.bubbles.length + ' i' + G.items.length + ' bolts' + G.bolts.length + ' drops' + G.drops.length + ' ice' + G.ice.length + ' pickup' + !!G.pickup);
          if (G.enemies.some((e) => e.state !== 'descend')) note('round ' + G.round + ' enemies not descending at start');
          enemyTrack.clear();
        }
        // enemies never multiply, except a boss's minions (at most 4 alive at once)
        if (G.mode === 'playing' && G.round === prevRound && G.enemies.length > prevEnemies && !G.boss) note('f' + frames + ' enemy count grew ' + prevEnemies + '->' + G.enemies.length);
        if (G.boss && G.enemies.filter((e) => e.state !== 'dead').length > 4) note('f' + frames + ' more than 4 boss minions alive');
        if (G.boss && (!isFinite(G.boss.x) || !isFinite(G.boss.y) || G.boss.x < 15 || G.boss.x > 209 || G.boss.y < -8 || G.boss.y > 200)) note('f' + frames + ' boss out of the bath ' + G.boss.x + ',' + G.boss.y);
        if (G.score < prevScore && G.mode === 'playing' && G.round === prevRound) note('f' + frames + ' score decreased');
        const p = G.p;
        if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.vx) || !isFinite(p.vy)) note('f' + frames + ' player NaN');
        if (p.x < 13.9 || p.x > 226.1) note('f' + frames + ' player x out of walls ' + p.x);
        if (G.mode === 'playing' && p.onGround && !p.dead && !p.water) { // a floating duck rests on the water surface, off the tile grid
          const feet = p.y + 16, r = Math.round((feet - PF_TOP) / 8);
          if (Math.abs(feet - (PF_TOP + r * 8)) > 0.01) note('f' + frames + ' player onGround off-grid feet=' + feet);
          if (feet > FLOOR_TOP + 0.5) note('f' + frames + ' round ' + G.round + ' player standing inside floor row y=' + p.y.toFixed(1) + ' x=' + p.x.toFixed(1));
        }
        for (const e of G.enemies) {
          if (!isFinite(e.x) || !isFinite(e.y) || !isFinite(e.vx) || !isFinite(e.vy)) note('f' + frames + ' enemy NaN ' + e.type);
          if (e.x < 13.9 || e.x > 226.1) note('f' + frames + ' enemy x out ' + e.type + ' ' + e.x);
          if (e.state === 'active' && e.type !== 'fly' && e.onGround && e.y + 16 > FLOOR_TOP + 0.5) note('f' + frames + ' round ' + G.round + ' ' + e.type + ' standing inside floor row y=' + e.y);
          if (G.mode === 'playing' && e.state === 'active' && e.type !== 'fly') {
            let tr = enemyTrack.get(e.id); if (!tr) { tr = { x: e.x, y: e.y, n: 0 }; enemyTrack.set(e.id, tr); }
            if (Math.abs(e.x - tr.x) < 3 && Math.abs(e.y - tr.y) < 3) { tr.n++; if (tr.n === 600) note('f' + frames + ' round ' + G.round + ' ' + e.type + ' stuck 10 s at ' + e.x.toFixed(1) + ',' + e.y.toFixed(1) + ' dir ' + e.dir + ' angry ' + e.angry + ' onG ' + e.onGround); }
            else { tr.x = e.x; tr.y = e.y; tr.n = 0; }
          }
          if (e.state === 'dead' && e.deadT > 430) note('dead enemy never resolved');
          if (e.state === 'trapped' && (!e.bubble || e.bubble.dead)) note('f' + frames + ' trapped enemy without live bubble');
          if (e.state === 'frozen' && (!e.ice || e.ice.dead)) note('f' + frames + ' frozen enemy without ice');
        }
        for (const b of G.bubbles) {
          if (!isFinite(b.x) || !isFinite(b.y)) note('f' + frames + ' bubble NaN');
          if (b.kind === 'trapped' && b.state === 'float' && (!b.enemy || b.enemy.state !== 'trapped')) note('f' + frames + ' trapped bubble with enemy state ' + (b.enemy && b.enemy.state));
        }
        for (const it of G.items) {
          if (!isFinite(it.x) || !isFinite(it.y)) note('item NaN');
          if (it.onGround && it.y + 16 > FLOOR_TOP + 0.5) note('f' + frames + ' round ' + G.round + ' item resting inside floor row y=' + it.y + ' x=' + it.x.toFixed(1));
        }
        maxBubbles = Math.max(maxBubbles, G.bubbles.length); maxItems = Math.max(maxItems, G.items.length); maxParts = Math.max(maxParts, G.parts.length);
        if (G.lives < 0 || G.lives > 9) note('lives out of range ' + G.lives);
        if (!(G.stamps >= 0 && G.stamps < 10)) note('stamp card out of range ' + G.stamps);
        if (G.drops.length > 40) note('drop leak ' + G.drops.length);
      }
      releaseAll();
      const ms = (performance.now() - t0) | 0;
      // de-duplicate repeated issue kinds
      ok('soak ' + TOTAL + ' frames: invariants hold', issues.length === 0, issues.join(' | '));
      console.log('RV soak stats: frames=' + frames + ' ms=' + ms + ' roundsAdvanced=' + roundsCleared + ' deaths=' + deaths + ' gameovers=' + gameovers + ' endings=' + endings + ' pauses=' + pauses + ' maxBubbles=' + maxBubbles + ' maxItems=' + maxItems + ' maxParts=' + maxParts + ' loop=' + G.loop + ' round=' + G.round);
    }

    // ------------------------------------------------------------------ 8. key/button mash through every mode (real DOM events)
    {
      const issues = []; const note = (s) => { if (issues.length < 20 && !issues.includes(s)) issues.push(s); };
      const OV = { title: 'pg-title', paused: 'pg-pause', gameover: 'pg-over', ending: 'pg-ending' };
      const CODES = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyZ', 'KeyX', 'Space', 'KeyJ', 'KeyA', 'KeyD', 'KeyP', 'Escape', 'Enter', 'KeyM'];
      const held = new Set();
      let s = 77; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      D.toTitle(); D.seed(31);
      let modes = {};
      for (let f = 0; f < 30000; f++) {
        if (rnd() < 0.08) {
          const c = CODES[(rnd() * CODES.length) | 0];
          if (held.has(c)) { key('keyup', c); held.delete(c); } else { key('keydown', c); held.add(c); }
          if ((c === 'KeyP' || c === 'Escape' || c === 'KeyM' || c === 'Enter') && held.has(c)) { key('keyup', c); held.delete(c); }
        }
        if (rnd() < 0.002) { const btns = [...document.querySelectorAll('#pg-app button')].filter((b) => b.offsetParent !== null && !b.disabled); if (btns.length) btns[(rnd() * btns.length) | 0].click(); }
        if (rnd() < 0.001) window.dispatchEvent(new Event('blur'));
        if (G.mode === 'playing' && rnd() < 0.002) { D.trapAll(); }
        if (G.mode === 'playing' && rnd() < 0.003) { D.popAll(); }
        if (f % 4000 === 0) D.setInvincible(rnd() < 0.5);
        D.step(1);
        modes[G.mode] = (modes[G.mode] || 0) + 1;
        for (const m in OV) {
          const vis = !document.getElementById(OV[m]).hidden;
          if (vis !== (G.mode === m)) note('mode ' + G.mode + ' but overlay ' + OV[m] + (vis ? ' visible' : ' hidden'));
        }
        const pb = document.getElementById('pg-pausebtn');
        const shouldEnable = G.mode === 'playing' || G.mode === 'dying' || G.mode === 'transition' || G.mode === 'paused';
        if (pb && pb.disabled === shouldEnable) note('pause button disabled=' + pb.disabled + ' in mode ' + G.mode);
        const p = G.p; if (!isFinite(p.x) || !isFinite(p.y)) note('player NaN in ' + G.mode);
      }
      for (const c of held) key('keyup', c);
      ok('key/button mash keeps overlays consistent with mode', issues.length === 0, issues.join(' | ') + ' modes=' + JSON.stringify(modes));
      if (!issues.length) console.log('RV mash modes ' + JSON.stringify(modes));
    }

    // ------------------------------------------------------------------ 9. long attract demo
    {
      D.toTitle(); const f0 = G.frame; let bad = '';
      for (let i = 0; i < 20000; i++) { D.step(1); if (G.mode !== 'title') { bad = 'mode ' + G.mode + ' at ' + i; break; } if (!isFinite(G.p.x)) { bad = 'NaN'; break; } }
      ok('20000-frame attract demo stays in title and never scores', !bad && G.score === 0 && G.frame - f0 === 20000, bad + ' score=' + G.score);
    }

    ok('no uncaught errors', errors === 0, String(errors));
    console.log('RV DONE pass=' + pass + ' fail=' + fail);
  }
  function go() { if (!window.PG || !PG.debug) return setTimeout(go, 30); setTimeout(() => { try { run(); } catch (e) { console.log('RV FAIL exception ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' ')); console.log('RV DONE pass=' + pass + ' fail=' + (fail + 1)); } }, 50); }
  go();
})();
