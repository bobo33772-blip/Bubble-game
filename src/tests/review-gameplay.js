// Gameplay-fidelity review driver (reviewer). Measures mechanics numerically through PG.debug.
// build.js -> C:/Temp/bogeul/test-review-gameplay.html ; run:
//   node tools/run-chrome.js test-review-gameplay.html C:/Temp/bogeul/rv-final.png 900 760 60000
(function () {
  const log = (tag, o) => console.log('RV ' + tag + ' ' + (typeof o === 'string' ? o : JSON.stringify(o)));
  function waitFor() { if (!window.PG || !window.PG.debug || !window.PG.debug.G) return setTimeout(waitFor, 30); setTimeout(run, 50); }
  const r1 = (v) => Math.round(v * 10) / 10;
  function run() {
    const D = PG.debug, G = D.G;
    const sec = (name, fn) => { try { fn(); } catch (e) { log('ERR', name + ': ' + (e && e.message) + ' ' + String(e && e.stack).split('\n')[1]); } };
    const park = (e) => { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; };
    const parkAll = () => G.enemies.forEach(park);
    const activate = (e, x, y) => { e.state = 'active'; e.x = x; e.y = y; e.vx = 0; e.vy = 0; e.onGround = true; e.angry = false; e.hopT = 999; e.delay = 0; e.spawnY = y; };
    const settle = (i, seed) => { D.seed(seed || 7); D.start(i); D.setInvincible(true); D.step(150); };
    const tap = (a) => { D.press(a, true); D.step(1); D.press(a, false); };
    const ctr = (b) => [b.x + 8, b.y + 8];
    function components(bs) { // chain graph (centre distance < 18)
      const n = bs.length, seen = new Array(n).fill(false); let comps = [];
      for (let i = 0; i < n; i++) { if (seen[i]) continue; let q = [i], c = 0; seen[i] = true; while (q.length) { const k = q.pop(); c++; for (let j = 0; j < n; j++) if (!seen[j]) { const dx = bs[j].x - bs[k].x, dy = bs[j].y - bs[k].y; if (dx * dx + dy * dy < 18 * 18) { seen[j] = true; q.push(j); } } } comps.push(c); }
      return comps.sort((a, b) => b - a);
    }
    function nnDist(bs) { const out = []; for (let i = 0; i < bs.length; i++) { let m = 1e9; for (let j = 0; j < bs.length; j++) if (i !== j) m = Math.min(m, Math.hypot(bs[i].x - bs[j].x, bs[i].y - bs[j].y)); out.push(r1(m)); } return out; }

    // ---------------------------------------------------------------- 1. player physics
    sec('physics', () => {
      settle(0); parkAll();
      D.setPlayer(40, 200); D.step(5);
      D.press('right', true); D.step(30); const x0 = G.p.x; D.step(30); const walk = (G.p.x - x0) / 30; D.press('right', false); D.step(10);
      const y0 = G.p.y; D.press('jump', true); let minY = y0, air = 0;
      for (let i = 0; i < 80; i++) { D.step(1); air++; minY = Math.min(minY, G.p.y); if (G.p.onGround && i > 2) break; }
      D.press('jump', false);
      log('physics', { walk: r1(walk * 100) / 100, apexPx: r1(y0 - minY), airFrames: air });
    });

    // ---------------------------------------------------------------- 2. shot path + capture range (enemy held still)
    sec('shot', () => {
      settle(0); parkAll();
      D.setPlayer(40, 200); D.step(5); D.press('right', true); D.step(2); D.press('right', false); D.step(10);
      const n0 = G.bubbles.length; tap('shoot');
      const b = G.bubbles[G.bubbles.length - 1]; const xs = [];
      let shotEnd = null;
      for (let i = 0; i < 80; i++) { if (b.state === 'shot') shotEnd = b.x; xs.push(r1(b.x)); D.step(1); }
      log('shotPath', { startX: xs[0], playerX: 40, xAtShotEnd: r1(shotEnd), restX: r1(b.x), travelShot: r1(shotEnd - xs[0]), travelTotal: r1(b.x - xs[0]), nAfter: G.bubbles.length - n0 });
      // horizontal capture scan
      const res = [];
      for (let dist = 0; dist <= 120; dist += 6) {
        settle(0); parkAll(); const e = G.enemies[0];
        D.setPlayer(40, 200); D.step(3); D.press('right', true); D.step(1); D.press('right', false); D.step(8);
        const px = G.p.x; activate(e, px + dist, 200);
        const sc0 = G.score; D.press('shoot', true);
        let outcome = 'miss', at = -1;
        for (let f = 0; f < 40; f++) {
          e.x = px + dist; e.y = 200; e.vx = 0; e.vy = 0; e.hopT = 999;
          D.step(1); if (f === 0) D.press('shoot', false);
          if (e.state === 'dead') { outcome = 'instakill'; at = f; break; }
          if (e.state === 'trapped') { outcome = 'trapped'; at = f; }
          if (outcome === 'trapped') break;
        }
        res.push(dist + ':' + outcome + (at >= 0 ? '@' + at : '') + (G.score > sc0 ? '(+' + (G.score - sc0) + ')' : ''));
      }
      log('captureScanH', res.join(' '));
      // vertical tolerance at dx=48
      const vres = [];
      for (let dy = -28; dy <= 28; dy += 4) {
        settle(0); parkAll(); const e = G.enemies[0];
        D.setPlayer(40, 200); D.step(3); D.press('right', true); D.step(1); D.press('right', false); D.step(8);
        const px = G.p.x, py = G.p.y; activate(e, px + 48, py + dy);
        D.press('shoot', true); let ok = false;
        for (let f = 0; f < 40; f++) { e.x = px + 48; e.y = py + dy; e.vx = 0; e.vy = 0; D.step(1); if (f === 0) D.press('shoot', false); if (e.state !== 'active') { ok = true; break; } }
        vres.push(dy + ':' + (ok ? 'Y' : 'n'));
      }
      log('captureScanV(dx=48)', vres.join(' '));
    });

    // ---------------------------------------------------------------- 3. clustering at gather + chain connectivity
    sec('cluster', () => {
      for (const N of [3, 5, 8]) {
        settle(22, 11); parkAll();
        D.setPlayer(24, 200); D.step(2);
        const g = G.gather; const bs = [];
        for (let k = 0; k < N; k++) bs.push(D.spawnBubble('empty', 30 + k * 23, 60 + (k % 3) * 40));
        bs.forEach((b) => { b.age = -2000; }); // keep them alive
        let reach = -1;
        for (let f = 0; f < 700; f++) { D.step(1); const far = bs.filter((b) => Math.hypot(b.x + 8 - g.x, b.y + 8 - g.y) > 40).length; if (far === 0 && reach < 0) reach = f; }
        // sample connectivity over 240 frames after settle
        let full = 0, worstLargest = N, nn = [];
        for (let f = 0; f < 240; f++) { D.step(1); const c = components(bs.filter((b) => !b.dead)); if (c[0] === N) full++; worstLargest = Math.min(worstLargest, c[0]); if (f === 239) nn = nnDist(bs); }
        log('cluster', { N, framesToGather: reach, gather: g, pctFramesFullyChained: Math.round(full / 2.4), worstLargestComponent: worstLargest, nnDist: nn, comps: components(bs) });
      }
    });

    // ---------------------------------------------------------------- 3b. real chain: trapped enemies clustered, duck touches one
    sec('chainPop', () => {
      settle(22, 12); D.step(10);
      G.enemies.forEach((e, k) => activate(e, 40 + k * 22, 120 + (k % 2) * 30));
      D.trapAll(); G.bubbles.forEach((b) => { b.trapMax = 1e9; });
      D.step(600);
      const tr = G.bubbles.filter((b) => b.kind === 'trapped');
      const comps = components(tr);
      // put duck under the lowest-left bubble touching it
      const tgt = tr.slice().sort((a, b) => b.y - a.y)[0];
      const sc0 = G.score;
      D.setPlayer(tgt.x, tgt.y + 12); G.p.vy = -1;
      const kills = []; let pops = 0;
      for (let f = 0; f < 90; f++) { D.step(1); }
      const killed = G.enemies.filter((e) => e.state === 'dead' || e.gone).length + (8 - G.enemies.length);
      log('chainPop', { trapped: tr.length, clusterComponents: comps, killed: G.enemies.filter((e) => e.state === 'dead').length, remainingTrapped: G.bubbles.filter((b) => b.kind === 'trapped').length, scoreGain: G.score - sc0, popups: G.pops.map((p) => p.txt).join(',') });
      // screenshot-friendly: rebuild cluster for final frame later
    });

    // ---------------------------------------------------------------- 4. per round: trapped at spawn -> does it reach the gather cluster before escaping?
    sec('riseVsTrap', () => {
      const rows = [];
      for (let i = 0; i < D.levels().length; i++) { if (D.levels()[i].boss) continue; // boss arenas: stage B
        settle(i, 100 + i);
        G.enemies.forEach((e) => { if (e.state === 'descend') { e.state = 'active'; e.y = e.spawnY; } });
        D.trapAll();
        const g = G.gather, bs = G.bubbles.filter((b) => b.kind === 'trapped');
        const tMax = G.trapTime; let reached = 0; const tReach = [];
        const done = new Set();
        for (let f = 0; f < tMax + 5; f++) {
          D.step(1);
          for (const b of bs) { if (done.has(b) || b.dead) continue; if (Math.hypot(b.x + 8 - g.x, b.y + 8 - g.y) < 28) { done.add(b); tReach.push(f); } }
        }
        rows.push({ r: i + 1, trapS: r1(tMax / 60), n: bs.length, atGather: done.size, medReachS: tReach.length ? r1(tReach.sort((a, b) => a - b)[tReach.length >> 1] / 60) : null, escaped: G.enemies.filter((e) => e.escaped).length });
      }
      log('riseVsTrap', rows.map((r) => `R${r.r} trap ${r.trapS}s: ${r.atGather}/${r.n} reached gather (median ${r.medReachS}s)`).join(' | '));
    });

    // ---------------------------------------------------------------- 5. escape + anger speed
    sec('escape', () => {
      settle(0, 3);
      D.trapAll(); const tMax = G.trapTime; D.step(tMax - 1);
      const before = G.enemies.map((e) => e.state).join(',');
      D.step(3);
      const after = G.enemies.map((e) => e.state + (e.angry ? '!' : '')).join(',');
      // measure angry grime ground speed
      D.step(90); let sum = 0, n = 0; for (let f = 0; f < 120; f++) { D.step(1); for (const e of G.enemies) if (e.type === 'grime' && e.onGround && e.state === 'active') { sum += Math.abs(e.vx); n++; } }
      log('escape', { trapFrames: tMax, before, after, angryGrimeSpeed: n ? r1(sum / n * 100) / 100 : null });
    });

    // ---------------------------------------------------------------- 6. corpse -> item timing vs round clear; items left when the doors close
    sec('items', () => {
      const rows = [];
      for (let i = 0; i < D.levels().length; i++) { if (D.levels()[i].boss) continue; // boss arenas: stage B
        settle(i, 200 + i);
        G.enemies.forEach((e) => { if (e.state === 'descend') { e.state = 'active'; e.y = e.spawnY; } });
        D.trapAll(); D.step(180); // bubbles have risen
        D.popAll();
        const n = G.enemies.length; let firstItem = -1, lastItem = -1; let corpsesAtDoor = 0, itemsAtDoor = 0; const landT = [];
        let prevItems = 0, clearAt = -1;
        for (let f = 0; f < 400; f++) {
          D.step(1);
          if (G.clearT === 0 && clearAt < 0) clearAt = f;
          if (G.items.length > prevItems) { if (firstItem < 0) firstItem = f; lastItem = f; for (let k = prevItems; k < G.items.length; k++) landT.push(f); }
          prevItems = G.items.length;
          if (G.mode === 'transition') { corpsesAtDoor = G.enemies.length; break; }
          itemsAtDoor = G.items.length;
          corpsesAtDoor = G.enemies.filter((e) => e.state === 'dead').length;
        }
        rows.push(`R${i + 1}: ${n} kills, items at f${firstItem}..f${lastItem}, still-flying corpses at door=${corpsesAtDoor}, items on screen at door=${itemsAtDoor}, grab window for last item=${lastItem >= 0 ? r1((180 - lastItem) / 60) + 's' : '-'}`);
      }
      log('items', rows.join(' | '));
    });

    // ---------------------------------------------------------------- 7. wrap: duck through floor gap; grime walking into gap
    sec('wrap', () => {
      settle(0, 5); parkAll();
      const L = D.levels()[0]; const gx = L.gapX;
      D.setPlayer(gx - 8, 150); const tr = [];
      for (let f = 0; f < 140; f++) { D.step(1); if (f % 7 === 0) tr.push(r1(G.p.y)); }
      log('wrapDuck', { gapX: gx, trace: tr.join(','), endY: r1(G.p.y), onGround: G.p.onGround });
      // grime dropping into floor gap
      let wrapped = 0, tries = 0;
      for (let s = 0; s < 10; s++) {
        settle(0, 300 + s); parkAll(); const e = G.enemies[0]; activate(e, gx - 40, 200); e.dir = 1; e.hopT = 0;
        let minY = 999, sawTop = false;
        for (let f = 0; f < 240; f++) { D.step(1); if (e.y < 60) sawTop = true; }
        tries++; if (sawTop) wrapped++;
      }
      log('wrapGrime', { seeds: tries, wrappedThroughFloorGap: wrapped });
    });

    // ---------------------------------------------------------------- 8. hurry + broken shower (scalding drops)
    sec('hurry', () => {
      settle(0, 8);
      G.roundT = 1795; D.step(8);
      const s1 = { hurry: G.hurry, angry: G.enemies.map((e) => e.angry).join(','), music: G.music, banner: G.banner && G.banner.main };
      // park enemies, keep one trapped forever so the round can't clear
      D.trapAll(); G.bubbles.forEach((b) => { b.trapMax = 1e9; b.x = 200; b.y = 30; });
      G.roundT = 2695; D.step(8);
      const s2 = { scald: G.scald, banner: G.banner && G.banner.main };
      D.setInvincible(false); D.setPlayer(40, 200); D.step(3);
      let hitF = -1;
      for (let f = 0; f < 1800; f++) { D.step(1); if (G.mode === 'dying') { hitF = f; break; } }
      log('hurry', { s1, s2, framesUntilDropHitsIdleDuck: hitF, dropsSpawned: G.dropN });
      D.step(95);
      log('afterDeath', { mode: G.mode, scald: G.scald, drops: G.drops.length, hurry: G.hurry, roundT: G.roundT, lives: G.lives, invuln: G.p.invuln });
      // pacing the floor under the drops: how long does a moving duck survive?
      G.roundT = 2695; D.step(8); D.setPlayer(30, 200); D.step(130);
      let kills = -1; D.press('right', true);
      for (let f = 0; f < 1200; f++) { if (G.p.x > 210) { D.press('right', false); D.press('left', true); } if (G.p.x < 30) { D.press('left', false); D.press('right', true); } D.step(1); if (G.mode === 'dying') { kills = f; break; } }
      D.press('left', false); D.press('right', false);
      log('scaldPacing', { framesSurvivedPacingFloor: kills < 0 ? '1200+ (survived)' : kills });
    });

    // ---------------------------------------------------------------- 9. stamp card
    sec('stamps', () => {
      settle(0, 9); parkAll();
      const st0 = G.stampT; let first = -1;
      for (let f = 0; f < 1500; f++) { D.step(1); if (G.bubbles.some((b) => b.kind === 'stamp')) { first = f + 150; break; } }
      // stamp timer carried over at round start?
      const sb = G.stampT; D.gotoRound(1); const sa = G.stampT;
      log('stampTimer', { stampTAtRoundStart: st0, firstStampBubbleAtFrame: first, stampTBeforeGoto: sb, stampTAfterNewRound: sa });
      settle(0, 10); parkAll();
      const lives0 = G.lives; G.stamps = 7;
      for (let k = 0; k < 3; k++) { const b = D.spawnBubble('stamp', G.p.x, G.p.y); b.grace = 0; D.step(3); }
      log('stampCollect', { lives0, lives1: G.lives, stamps: G.stamps, banner: G.banner && G.banner.main, queued: G.bannerQ.map((q) => q.main) });
    });

    // ---------------------------------------------------------------- 10. steam round
    sec('steam', () => {
      settle(8, 13); parkAll();
      let at = -1; for (let f = 0; f < 400; f++) { D.step(1); if (G.bubbles.some((b) => b.kind === 'steam')) { at = f + 150; break; } }
      const sb = G.bubbles.find((b) => b.kind === 'steam');
      // let it rise a bit, then put 3 enemies on its row to the right, duck touches it from left facing right
      D.step(60);
      const es = G.enemies.slice(0, 3);
      es.forEach((e, k) => activate(e, sb.x + 40 + k * 30, sb.y));
      D.setPlayer(sb.x - 10, sb.y); G.p.facing = 1; G.p.vy = 0;
      D.step(1);
      const bolt = G.bolts[0] ? { x: G.bolts[0].x, y: G.bolts[0].y } : null;
      for (let f = 0; f < 70; f++) { es.forEach((e) => { if (e.state === 'active') { e.y = sb.y; e.vy = 0; } }); D.step(1); }
      log('steam', { firstSteamFrame: at, bubbleY: r1(sb.y), bolt, killed: es.filter((e) => e.state === 'dead' || !G.enemies.includes(e)).length + '/3' });
      // steam bubble popped while duck stands on floor below and jumps into it -> bolt height
      settle(8, 14); parkAll();
      for (let f = 0; f < 400; f++) { D.step(1); if (G.bubbles.some((b) => b.kind === 'steam')) break; }
      const sb2 = G.bubbles.find((b) => b.kind === 'steam');
      const path = []; for (let f = 0; f < 600; f += 30) { path.push(r1(sb2.x) + '/' + r1(sb2.y)); D.step(30); if (sb2.dead) break; }
      log('steamPath', path.join(' '));
    });

    // ---------------------------------------------------------------- 11. respawn invulnerability
    sec('respawn', () => {
      settle(0, 15); parkAll(); D.setInvincible(false);
      const e = G.enemies[0]; const sp = { x: G.p.x, y: G.p.y };
      activate(e, sp.x, sp.y);
      let d1 = -1; for (let f = 0; f < 10; f++) { e.x = sp.x; e.y = sp.y; D.step(1); if (G.mode === 'dying') { d1 = f; break; } }
      let back = -1; for (let f = 0; f < 200; f++) { D.step(1); if (G.mode === 'playing') { back = f; break; } }
      const inv = G.p.invuln; let d2 = -1;
      for (let f = 0; f < 300; f++) { e.x = sp.x; e.y = sp.y; e.vx = 0; e.state = 'active'; D.step(1); if (G.mode === 'dying') { d2 = f; break; } }
      log('respawn', { firstHitFrame: d1, dyingFrames: back + 1, invulnAtRespawn: inv, framesUntilSecondDeathWithEnemyCamping: d2, lives: G.lives });
    });

    // ---------------------------------------------------------------- 12. bounce on bubble with jump held
    sec('bounce', () => {
      const out = [];
      for (const hold of [true, false]) {
        settle(0, 16); parkAll();
        const b = D.spawnBubble('empty', 100, 120); b.age = -2000;
        D.setPlayer(100, 90); G.p.vy = 1.5; D.press('jump', hold);
        let res = 'none', vy = null;
        for (let f = 0; f < 30; f++) { D.step(1); if (G.p.vy < -3 && !b.dead && b.state !== 'pop') { res = 'bounced'; vy = r1(G.p.vy); break; } if (b.state === 'pop' || b.dead) { res = 'popped'; break; } }
        D.press('jump', false);
        out.push({ holdJump: hold, res, vy });
      }
      // climbing a column: 3 bubbles stacked 18 px apart, can duck bounce on top one repeatedly?
      settle(0, 17); parkAll();
      const b = D.spawnBubble('empty', 100, 150); b.age = -2000; b.trapT = 0;
      D.setPlayer(100, 100); G.p.vy = 0; D.press('jump', true);
      let bounces = 0, minY = 999; let prevVy = 0;
      for (let f = 0; f < 300; f++) { D.step(1); if (G.p.vy < -3.5 && prevVy >= 0) bounces++; prevVy = G.p.vy; minY = Math.min(minY, G.p.y); if (b.dead || b.state === 'pop') break; }
      D.press('jump', false);
      out.push({ chainBouncesOnOneRisingBubble: bounces, bubbleAlive: !b.dead && b.state !== 'pop', duckMinY: r1(minY), bubbleY: r1(b.y) });
      log('bounce', out);
    });

    // ---------------------------------------------------------------- 13. loop 2
    sec('loop', () => {
      settle(D.levels().length - 1, 18); D.killAll(); // last entry = final boss; killAll defeats it
      let f = 0; while (G.mode !== 'ending' && f < 900) { D.step(1); f++; }
      const m1 = G.mode; const btn = document.getElementById('pg-end-next'); if (btn) btn.click(); D.step(150);
      let sum = 0, n = 0; for (let k = 0; k < 120; k++) { D.step(1); for (const e of G.enemies) if (e.type === 'grime' && e.onGround && e.state === 'active' && !e.angry) { sum += Math.abs(e.vx); n++; } }
      log('loop', { reachedEnding: m1, framesToEnding: f, after: { mode: G.mode, loop: G.loop, round: G.round, loopMul: G.loopMul, trapFrames: G.trapTime, grimeSpeed: n ? r1(sum / n * 100) / 100 : null, lives: G.lives } });
    });

    // ---------------------------------------------------------------- 1b. physics on a safe stretch of floor (no gap)
    sec('physics2', () => {
      settle(0); parkAll();
      D.setPlayer(30, 200); D.step(5);
      D.press('right', true); D.step(20); const x0 = G.p.x; D.step(30); const walk = (G.p.x - x0) / 30; D.press('right', false); D.step(10);
      const y0 = G.p.y; tap('jump'); let minY = y0, air = 1;
      for (let i = 0; i < 80; i++) { D.step(1); air++; minY = Math.min(minY, G.p.y); if (G.p.onGround) break; }
      // stopping distance from full speed
      D.press('right', true); D.step(30); D.press('right', false); const xs = G.p.x; D.step(20);
      log('physics2', { walk: r1(walk * 100) / 100, apexPx: r1(y0 - minY), airFrames: air, stopSlidePx: r1(G.p.x - xs) });
    });

    // ---------------------------------------------------------------- 4b. can the duck reach the gather cluster? (trajectory sim with engine constants)
    sec('gatherReach', () => {
      const rows = [];
      const circBox = (cx, cy, r, bx, by, bw, bh) => { const nx = Math.max(bx, Math.min(cx, bx + bw)), ny = Math.max(by, Math.min(cy, by + bh)); const dx = cx - nx, dy = cy - ny; return dx * dx + dy * dy < r * r; };
      for (let i = 0; i < D.levels().length; i++) { if (D.levels()[i].boss) continue; // boss arenas: stage B
        settle(i, 400 + i);
        G.enemies.forEach((e) => { if (e.state === 'descend') { e.state = 'active'; e.y = e.spawnY; } });
        D.trapAll(); G.bubbles.forEach((b) => { b.trapMax = 1e9; });
        D.step(300);
        const bs = G.bubbles.filter((b) => b.kind === 'trapped').map((b) => ({ x: b.x, y: b.y }));
        const map = D.levels()[i].map;
        let best = null; // best = smallest vertical shortfall
        for (let r = 1; r < 26; r++) for (let c = 2; c < 30; c++) {
          if (map[r][c] !== '#' || map[r - 1][c] !== '.') continue;
          const feet = 16 + r * 8;
          for (const b of bs) {
            // simulate jump from this cell, steering toward the bubble
            let x = c * 8 - 4, y = feet - 16, vx = 0, vy = -4.1, hit = false, top = 1e9;
            for (let f = 0; f < 40; f++) {
              const dir = Math.sign(b.x - x); vx += Math.max(-0.5, Math.min(0.5, dir * 1.25 - vx));
              x = Math.max(14, Math.min(226, x + vx));
              const vy0 = vy; vy = Math.min(3.5, vy + 0.22); y += (vy0 + vy) / 2; top = Math.min(top, y);
              if (circBox(b.x + 8, b.y + 8, 7.5, x + 2, y + 2, 12, 14)) { hit = true; break; }
              if (vy > 0 && y > feet - 16) break;
            }
            const short = hit ? 0 : (top + 2) - (b.y + 15.5);
            if (!best || short < best.short) best = { short: r1(short), from: c + ',' + r, bubble: Math.round(b.x) + ',' + Math.round(b.y) };
          }
        }
        rows.push(`R${i + 1}: ${best.short <= 0 ? 'reachable' : 'UNREACHABLE by ' + best.short + 'px'} (best from tile ${best.from} to bubble ${best.bubble}, gather ${JSON.stringify(D.levels()[i].gather)})`);
      }
      log('gatherReach', rows.join(' | '));
    });

    // ---------------------------------------------------------------- 6b. kill everything where it stands (low kills) -> item timing
    sec('items2', () => {
      const rows = [];
      for (let i = 0; i < D.levels().length; i++) { if (D.levels()[i].boss) continue; // boss arenas: stage B
        settle(i, 500 + i);
        G.enemies.forEach((e) => { if (e.state === 'descend') { e.state = 'active'; e.y = e.spawnY; } });
        D.step(240);
        D.killAll();
        const n = G.enemies.length; const land = []; let prev = 0, flying = 0, onScr = 0;
        for (let f = 0; f < 400; f++) {
          D.step(1);
          if (G.items.length > prev) for (let k = prev; k < G.items.length; k++) land.push(f);
          prev = G.items.length;
          if (G.mode === 'transition') break;
          flying = G.enemies.filter((e) => e.state === 'dead').length; onScr = G.items.length;
        }
        const late = land.filter((f) => f > 120).length;
        rows.push(`R${i + 1}: ${n} kills, landed ${land.length} (last at ${r1((land[land.length - 1] || 0) / 60)}s, ${late} with <1s left), lost-in-air ${flying}`);
      }
      log('items2', rows.join(' | '));
    });

    // ---------------------------------------------------------------- 14. scald drop cadence: drops per 5 s window after the shower breaks
    sec('scaldRate', () => {
      settle(0, 30); D.trapAll(); G.bubbles.forEach((b) => { b.trapMax = 1e9; b.x = 200; b.y = 30; });
      G.roundT = 2695; D.step(6);
      const per = []; let n0 = G.dropN;
      for (let w = 0; w < 6; w++) { D.step(300); per.push(G.dropN - n0); n0 = G.dropN; }
      log('scaldRate', { dropsPer5s: per.join(','), onScreenNow: G.drops.length });
    });

    // ---------------------------------------------------------------- 15. sponge charge telegraph
    sec('sponge', () => {
      const out = [];
      for (const angry of [false, true]) {
        settle(10, 31); parkAll();
        const e = G.enemies.find((q) => q.type === 'sponge');
        activate(e, 150, 200); e.dir = -1; e.angry = angry; e.chargeCd = 0;
        D.setPlayer(60, 200); D.step(2);
        let wind = -1, chargeStart = -1, speed = 0;
        for (let f = 0; f < 120; f++) { D.step(1); if (e.windT > 0 && wind < 0) wind = f; if (e.chargeT > 0 && chargeStart < 0) { chargeStart = f; } if (e.chargeT > 0) speed = Math.max(speed, Math.abs(e.vx)); }
        out.push({ angry, windupFrames: chargeStart - wind, chargeSpeed: r1(speed * 100) / 100 });
      }
      log('sponge', out);
    });

    // ---------------------------------------------------------------- 16. autopilot (attract AI) clear times per round, stamp bubbles seen
    sec('autoClear', () => {
      const rows = [];
      for (let i = 0; i < D.levels().length; i++) {
        if (D.levels()[i].boss) continue;
        D.seed(600 + i); D.start(i); G.attract = true; G.mode = 'title';
        let t = -1, letters = 0, seen = new Set();
        for (let f = 0; f < 3600; f++) {
          D.step(1);
          for (const b of G.bubbles) if (b.kind === 'stamp' && !seen.has(b.id)) { seen.add(b.id); letters++; }
          if (G.clearT >= 0) { t = G.roundT; break; }
          if (G.round !== i) break;
        }
        rows.push(`R${i + 1}:${t < 0 ? '>60s' : r1(t / 60) + 's'}/S${letters}`);
      }
      G.attract = false;
      log('autoClear(attract bot, no deaths)', rows.join(' '));
    });

    // ---------------------------------------------------------------- 17. idle duck at spawn: time until first death per round
    sec('idleDeath', () => {
      const rows = [];
      for (let i = 0; i < D.levels().length; i++) { if (D.levels()[i].boss) continue; // boss arenas: stage B
        D.seed(700 + i); D.start(i); D.setInvincible(false);
        let t = -1, who = '';
        for (let f = 0; f < 1800; f++) { D.step(1); if (G.mode === 'dying') { t = f; const p = G.p; let best = 1e9; for (const e of G.enemies) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < best) { best = d; who = e.type + (e.angry ? '!' : ''); } } break; } }
        rows.push(`R${i + 1}:${t < 0 ? '>30s' : r1(t / 60) + 's(' + who + ')'}`);
      }
      log('idleDeath', rows.join(' '));
    });

    // ---------------------------------------------------------------- 18. jump up through the ceiling gap from the row-5 platform (round 1)
    sec('ceilWrap', () => {
      const out = [];
      for (let x = 96; x <= 148; x += 4) {
        settle(0, 40); parkAll(); D.setPlayer(x, 40); D.step(4);
        if (!G.p.onGround) { out.push(x + ':noplat'); continue; }
        tap('jump'); let wrapped = false, prevY = G.p.y;
        for (let f = 0; f < 150; f++) { D.step(1); if (Math.abs(G.p.y - prevY) > 100) wrapped = true; prevY = G.p.y; }
        out.push(x + ':' + (wrapped ? 'W' : '-') + Math.round(G.p.y) + (G.p.onGround ? 'g' : 'a'));
      }
      log('ceilWrap(x:wrapped? endY ground/air)', out.join(' '));
    });

    // ---------------------------------------------------------------- 19. "panic shot": enemy walks into duck, shoot pressed when already overlapping (not invincible)
    sec('panic', () => {
      const out = [];
      for (const dist of [14, 10, 8, 6, 4, 2, 0]) {
        settle(0, 41); parkAll(); D.setInvincible(false);
        const e = G.enemies[0]; D.setPlayer(60, 200); D.step(3); D.press('right', true); D.step(1); D.press('right', false); D.step(8);
        const px = G.p.x; activate(e, px + dist, 200);
        // one frame with no shot: does contact kill?
        const ctrl = (() => { return Math.abs(dist) < 9; })();
        D.press('shoot', true); D.step(1); D.press('shoot', false);
        out.push(`d${dist}:${G.mode === 'dying' ? 'died' : (e.state === 'dead' ? 'enemyKilled' : e.state)}${ctrl ? '(lethal overlap)' : ''}`);
      }
      log('panic', out.join(' '));
    });

    // ---------------------------------------------------------------- 20. dodging scald drops (pacing the floor, reading the warning shimmer) per seed
    sec('scaldDodge', () => {
      const out = [];
      for (const seed of [42, 43, 44, 45]) {
        settle(0, seed);
        D.trapAll(); G.bubbles.forEach((b) => { b.trapMax = 1e9; b.x = 200; b.y = 30; });
        D.setInvincible(false); G.roundT = 2695; D.step(8); D.setPlayer(30, 200); D.step(10);
        let died = -1; D.press('right', true);
        for (let f = 0; f < 900; f++) {
          if (G.p.x > 210) { D.press('right', false); D.press('left', true); } if (G.p.x < 30) { D.press('left', false); D.press('right', true); }
          // a simple dodger: stop if a drop is forming over the column just ahead
          const ahead = G.p.x + 8 + (G.p.facing || 1) * 14;
          const warn = G.drops.some((d) => Math.abs(d.x + 4 - ahead) < 10);
          if (warn) { D.press('left', false); D.press('right', false); }
          D.step(1);
          if (!warn && !(G.p.x > 210) && !(G.p.x < 30)) D.press(G.p.facing > 0 ? 'right' : 'left', true);
          if (G.mode === 'dying') { died = f; break; }
        }
        D.press('left', false); D.press('right', false);
        out.push(`seed ${seed}: ${died < 0 ? 'survived 15s' : 'hit after ' + r1(died / 60) + 's'}`);
      }
      log('scaldDodge', out.join(' | '));
    });

    // ---------------------------------------------------------------- 21. bounce onto a GROUP of bubbles (jump held): does the group survive?
    sec('bounceGroup', () => {
      const out = [];
      for (const kind of ['empty', 'trapped']) {
        for (const off of [0, 2, 4, 6, 8]) {
          settle(0, 50); parkAll();
          let bs;
          if (kind === 'empty') {
            bs = [0, 1, 2].map((k) => { const b = D.spawnBubble('empty', 84 + k * 15, 120); b.age = -2000; return b; });
          } else {
            G.enemies.forEach((e, k) => activate(e, 84 + k * 15, 120));
            D.trapAll(); bs = G.bubbles.filter((b) => b.kind === 'trapped'); bs.forEach((b, k) => { b.x = 84 + k * 15; b.y = 120; b.vx = 0; b.vy = 0; b.trapMax = 1e9; });
          }
          const mid = bs[1];
          D.setPlayer(mid.x + off, mid.y - 30); G.p.vy = 1.0; D.press('jump', true);
          const sc0 = G.score; let bounced = false;
          for (let f = 0; f < 40; f++) { const vy0 = G.p.vy; D.step(1); if (vy0 >= 0 && G.p.vy < -3) bounced = true; }
          D.press('jump', false);
          const alive = bs.filter((b) => !b.dead && b.state !== 'pop').length;
          out.push(`${kind} duckOffset+${off}px: bounced=${bounced} bubblesLeft=${alive}/3 score+${G.score - sc0}`);
        }
      }
      // realistic: duck blows 3 bubbles on the floor, waits, then jumps onto them holding jump
      settle(0, 51); parkAll(); D.setPlayer(24, 200); D.step(3); D.press('right', true); D.step(1); D.press('right', false);
      for (let k = 0; k < 3; k++) { tap('shoot'); D.step(15); }
      D.step(40);
      const emp = G.bubbles.filter((b) => b.kind === 'empty');
      const pos = emp.map((b) => Math.round(b.x) + ',' + Math.round(b.y)).join(' ');
      log('bounceGroup', out.join(' | ') + ' || natural 3-shot group positions: ' + pos + ' nn=' + JSON.stringify(nnDist(emp)));
    });

    // ---------------------------------------------------------------- 22. steam aim: duck on floor pops a steam bubble placed at height offset dy (jumping into it when above)
    sec('steamAim', () => {
      const out = [];
      for (const dy of [-36, -28, -22, -16, -12, -8, -4, 0]) {
        settle(8, 60); parkAll();
        G.steamT = -1; G.bubbles = [];
        D.setPlayer(60, 200); D.step(3); D.press('right', true); D.step(1); D.press('right', false); D.step(6);
        const px = G.p.x, py = G.p.y;
        const es = G.enemies.slice(0, 3); es.forEach((e, k) => activate(e, px + 70 + k * 30, py));
        const sb = D.spawnBubble('steam', dy >= -12 ? px + 16 : px, py + dy); sb.age = 200;
        let boltY = null; const hold = () => { sb.vx = 0; sb.vy = 0; es.forEach((e, k) => { if (e.state === 'active') { e.x = px + 70 + k * 30; e.y = py; e.vx = 0; } }); };
        hold();
        if (dy < -12) { D.press('jump', true); }
        else { D.press('right', true); }
        for (let f = 0; f < 90; f++) { if (sb.state !== 'pop' && !sb.dead) { sb.x = dy >= -12 ? sb.x : px; sb.y = py + dy; sb.vx = 0; sb.vy = 0; } es.forEach((e, k) => { if (e.state === 'active') { e.x = px + 70 + k * 30; e.y = py; e.vx = 0; } }); D.step(1); if (G.bolts[0] && boltY === null) boltY = r1(G.bolts[0].y - py); if (G.p.x > px + 30) D.press('right', false); }
        D.press('jump', false); D.press('right', false);
        const killed = es.filter((e) => e.state === 'dead' || !G.enemies.includes(e)).length;
        out.push(`bubble dy=${dy}: popped=${sb.state === 'pop' || sb.dead} boltY(rel duck)=${boltY} killed ${killed}/3 on duck's row`);
      }
      log('steamAim', out.join(' | '));
    });

    // ---------------------------------------------------------------- 23. steam rounds: bubble settled at gather, popped from the side, best direction
    sec('steamGather', () => {
      const out = [];
      // the shipped steam rounds (v1 used fixed indices; v2 inserts boss arenas, so look them up)
      for (const i of D.levels().map((L, k) => (L.special === 'steam' ? k : -1)).filter((k) => k >= 0)) {
        const res = [];
        for (const dir of [1, -1]) {
          settle(i, 70 + i);
          G.enemies.forEach((e) => { if (e.state === 'descend') { e.state = 'active'; e.y = e.spawnY; } });
          let sb = null; for (let f = 0; f < 900 && !sb; f++) { D.step(1); sb = G.bubbles.find((b) => b.kind === 'steam' && b.age > 600) || null; }
          if (!sb) { res.push('none'); continue; }
          const y = sb.y, n0 = G.enemies.filter((e) => e.state === 'active').length;
          D.setPlayer(sb.x - dir * 9, sb.y); G.p.facing = dir; G.p.vx = 0;
          D.step(1); G.p.facing = dir; const popped = sb.state === 'pop' || sb.dead; const bo = G.bolts[0]; const boY = bo ? Math.round(bo.y) : null; let minD = 1e9;
          for (let f = 0; f < 70; f++) { D.step(1); if (G.bolts[0]) for (const e of G.enemies) if (e.state === 'active') minD = Math.min(minD, Math.abs(e.y - G.bolts[0].y)); }
          const killed = G.enemies.filter((e) => e.state === 'dead').length + (n0 - G.enemies.filter((e) => e.state !== 'dead').length) - G.enemies.filter((e) => e.state === 'dead').length;
          res.push(`${dir > 0 ? '→' : '←'} popped=${popped} boltY=${boY} killed ${n0 - G.enemies.filter((e) => e.state === 'active' || e.state === 'trapped').length}/${n0} (nearest enemy row ${minD < 1e9 ? Math.round(minD) : '-'}px from bolt)`);
        }
        out.push(`R${i + 1}: ${res.join(', ')}`);
      }
      log('steamGather', out.join(' | '));
    });

    // ---------------------------------------------------------------- 24. sponge charge: duck reacts (jumps) 15 frames after wind-up begins. survive?
    sec('spongeReact', () => {
      const out = [];
      for (const angry of [false, true]) {
        const row = [];
        for (const dist of [30, 45, 60, 75, 90, 120, 150]) {
          settle(10, 80); parkAll(); D.setInvincible(false);
          const e = G.enemies.find((q) => q.type === 'sponge');
          D.setPlayer(40, 200); D.step(4);
          activate(e, G.p.x + dist, 200); e.dir = -1; e.angry = angry; e.chargeCd = 0;
          let windAt = -1, outcome = 'safe';
          for (let f = 0; f < 150; f++) {
            if (windAt < 0 && e.windT > 0) windAt = f;
            if (windAt >= 0 && f === windAt + 15) { D.press('jump', true); }
            D.step(1);
            if (windAt >= 0 && f === windAt + 16) D.press('jump', false);
            if (G.mode === 'dying') { outcome = 'HIT'; break; }
          }
          D.press('jump', false);
          row.push(dist + 'px:' + outcome);
        }
        out.push((angry ? 'angry' : 'normal') + ' ' + row.join(' '));
      }
      log('spongeReact(jump 15f after windup)', out.join(' | '));
    });

    // ---------------------------------------------------------------- final frame: cluster scene for screenshot
    sec('scene', () => {
      settle(4, 21);
      G.enemies.forEach((e) => { if (e.state === 'descend') { e.state = 'active'; e.y = e.spawnY; } });
      D.trapAll(); G.bubbles.forEach((b) => { b.trapMax = 1e9; });
      for (let k = 0; k < 4; k++) D.spawnBubble('empty', 60 + k * 30, 140).age = -2000;
      D.step(420);
      log('scene', { bubbles: G.bubbles.map((b) => b.kind[0] + '@' + Math.round(b.x) + ',' + Math.round(b.y)).join(' '), comps: components(G.bubbles) });
    });
    // final screenshot: R19 (steam) — settled steam bubble popped from the side, bolt mid-flight along the ceiling
    sec('steamShot', () => {
      settle(21, 90); G.enemies.forEach((e) => { if (e.state === 'descend') { e.state = 'active'; e.y = e.spawnY; } });
      let sb = null; for (let f = 0; f < 900 && !sb; f++) { D.step(1); sb = G.bubbles.find((b) => b.kind === 'steam' && b.age > 600) || null; }
      D.setPlayer(sb.x - 9, sb.y); G.p.facing = 1; D.step(1); G.p.facing = 1; D.step(14);
      log('steamShot', { bolt: G.bolts.map((b) => Math.round(b.x) + ',' + Math.round(b.y)), enemyYs: G.enemies.filter((e) => e.state === 'active').map((e) => Math.round(e.y)) });
    });
    log('DONE', 'ok');
  }
  waitFor();
})();
