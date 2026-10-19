// Review (multiplayer fairness probes): scripted, deterministic situations in ONE engine (PG.debug.local).
// Not part of run-all. Built to C:/Temp/bogeul/test-review-mpfair.html:
//   node tools/run-chrome.js test-review-mpfair.html - 900 760 rt120000 "FAIR DONE"
// Prints "FAIR <name> {json}" lines and "FAIR DONE".
(function () {
  'use strict';
  const log = (s) => console.log(s);
  function run() {
    const D = PG.debug, G = D.G;
    const P = (s) => G.players.find((q) => q.slot === s);
    const releaseAll = () => { for (let s = 0; s < 4; s++) for (const a of ['left', 'right', 'jump', 'shoot']) D.press(a, false, s); };
    const park = (e) => { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; };
    function quiet(chars, arena) {
      D.seed(77); D.local.battle(chars, { arena: arena || 0, time: 3, intrusion: false });
      G.enemies.forEach(park); G.battle.enemyT = 1e9; G.battle.powerT = 1e9; G.invincible = false;
      releaseAll(); D.step(5);
      for (const p of G.players) p.invuln = 0;
    }
    // ---- 1. point-blank shots: shooter P1 faces P2 on one floor, gap = distance between their x
    //      a) shooter stands still after the shot; b) shooter keeps walking toward the bubble; victim mashes 8/s
    const rows = [];
    for (const gap of [8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64, 72, 80, 88]) {
      for (const walk of [false, true]) {
        quiet(['duck', 'cat']);
        const p1 = P(0), p2 = P(1);
        D.setPlayer(40, 200, 0); D.setPlayer(40 + gap, 200, 1); D.step(10);
        p1.invuln = 0; p2.invuln = 0; p1.facing = 1; p2.facing = -1; G.bubbles = [];
        p1.shootCd = 0; p1.autoCd = 0;
        D.press('shoot', true, 0); D.step(1); D.press('shoot', false, 0);
        let trappedAt = -1, koAt = -1, escAt = -1, mashAcc = 0;
        if (p2.trap) trappedAt = 0;
        if (p2.koT > 0) { trappedAt = 0; koAt = 0; }
        for (let f = 1; f <= 200 && koAt < 0 && escAt < 0; f++) {
          if (walk && trappedAt >= 0) D.press('right', true, 0);
          // mash 8 presses / s once trapped
          if (p2.trap) { mashAcc += 8 / 60; if (mashAcc >= 1) { mashAcc -= 1; D.press('jump', true, 1); } else D.press('jump', false, 1); }
          D.step(1);
          if (trappedAt < 0 && p2.trap) trappedAt = f;
          if (trappedAt < 0 && p2.koT > 0) { trappedAt = f; koAt = f; }
          if (trappedAt >= 0 && koAt < 0 && p2.koT > 0) koAt = f;
          if (trappedAt >= 0 && koAt < 0 && !p2.trap && !(p2.koT > 0)) escAt = f;
          if (trappedAt < 0 && f > 40) break;
        }
        releaseAll();
        rows.push({ gap, walk, trapped: trappedAt, ko: koAt >= 0 ? koAt - trappedAt : null, esc: escAt >= 0 ? escAt - trappedAt : null, score1: p1.score });
      }
    }
    log('FAIR pointblank ' + JSON.stringify(rows));

    // ---- 2. how far does a just-trapped prisoner float within reach of a trapper standing next to it?
    //      (frames during which a standing trapper overlaps the prison bubble; jumping reach afterwards)
    {
      quiet(['duck', 'cat']);
      const p1 = P(0), p2 = P(1);
      D.setPlayer(40, 200, 0); D.setPlayer(140, 200, 1); D.step(10);
      p2.invuln = 0; D.trapPlayer(1, 0);
      const b = p2.trap.b, y0 = b.y, ys = [];
      for (let f = 1; f <= 240 && p2.trap; f++) { D.step(1); if (f % 30 === 0) ys.push(Math.round(y0 - b.y)); }
      log('FAIR prison-rise ' + JSON.stringify({ risePer30f: ys, note: 'px above the start, every 0.5 s, nobody mashing' }));
      void p1;
    }

    // ---- 3. respawn after a KO in a 1v1: which spawn, how far from the KO-er (who stays where it popped the bubble)
    {
      const res = [];
      for (const arena of [0, 1, 2, 3]) {
        for (const kx of [40, 120, 200]) {
          quiet(['duck', 'cat'], arena);
          const p1 = P(0), p2 = P(1);
          D.setPlayer(kx, 120, 0); D.step(30);
          p2.invuln = 0; D.trapPlayer(1, 0);
          const b = p2.trap.b; D.setPlayer(b.x, b.y, 0); D.step(1);
          let n = 0; while (p2.koT > 0 && n < 200) { D.step(1); n++; }
          res.push({ arena, killerX: Math.round(p1.x), killerY: Math.round(p1.y), respawn: [Math.round(p2.x), Math.round(p2.y)], dist: Math.round(Math.hypot(p1.x - p2.x, p1.y - p2.y)), invuln: p2.invuln });
        }
      }
      log('FAIR respawn ' + JSON.stringify(res));
    }

    // ---- 4. an online (remote) player's reach vs the host's own player: items, prison bubbles, revive
    {
      quiet(['duck', 'cat']);
      const p1 = P(0), p2 = P(1);
      // remote player: positions come from its reports (no physics here); slack 8 px on touches
      p2.local = false;
      const reach = (who, kind) => {
        let best = null;
        for (let dx = 0; dx <= 40; dx++) {
          quiet(['duck', 'cat']);
          const a = P(0), r = P(1); r.local = false;
          const pl = who === 'local' ? a : r, other = who === 'local' ? r : a;
          other.x = 220; other.y = 40; other.vx = 0; other.vy = 0;
          pl.x = 60; pl.y = 200; pl.vx = 0; pl.vy = 0; pl.onGround = true;
          if (who === 'local') D.setPlayer(60, 200, 0);
          let got = false;
          if (kind === 'item') {
            G.items.push({ id: 99999, type: 'tangerine', value: 100, x: 60 + dx, y: 200, vx: 0, vy: 0, onGround: true, floating: false, age: 0 });
            const s0 = pl.score; D.step(1); if (who === 'remote') { pl.x = 60; pl.y = 200; } got = pl.score > s0;
          } else {
            const v = P(who === 'local' ? 1 : 0); // the prisoner: the other player
            v.x = 60 + dx; v.y = 200; v.invuln = 0;
            if (who === 'remote') { /* remote victim not needed */ }
            const b = D.spawnBubble('empty', 60 + dx, 196); b.owner = pl.slot;
            // a prison bubble of the other player (not pl's own)
            b.kind = 'player'; b.victim = { trap: null }; b.state = 'float'; b.grace = 0;
            const s0 = pl.score; D.step(1); got = b.state === 'pop';
            void s0;
          }
          if (got) best = dx; else if (best !== null) break;
        }
        return best;
      };
      log('FAIR reach ' + JSON.stringify({ itemHost: reach('local', 'item'), itemGuest: reach('remote', 'item'), bubbleHost: reach('local', 'bubble'), bubbleGuest: reach('remote', 'bubble'),
        note: 'largest dx (px between the player x and the object x, same height) at which a touch still counts; local = host-side player, remote = an online guest as the host sees it' }));
      void p1;
    }

    // ---- 5. a stun from an enemy also makes the player untrappable for 2 s (stun 1 s + 1 s blink)
    {
      quiet(['duck', 'cat']);
      const p2 = P(1);
      D.setPlayer(40, 200, 0); D.setPlayer(70, 200, 1); D.step(10);
      D.hitPlayer(1);
      const inv = p2.invuln, stun = p2.stunT;
      P(0).facing = 1; P(0).shootCd = 0; G.bubbles = [];
      D.step(70);
      D.setPlayer(40, p2.y, 0); D.step(1); P(0).facing = 1;
      D.press('shoot', true, 0); D.step(1); D.press('shoot', false, 0); D.step(12);
      log('FAIR stun-immunity ' + JSON.stringify({ stunFrames: stun, invulnFrames: inv, trappedWhileBlinking: !!p2.trap }));
    }

    // ---- 6. co-op ghost: how long a partner standing on the same floor can still reach a ghost bubble
    {
      D.seed(5); D.local.coop(['duck', 'cat'], 0); D.setInvincible(true);
      G.enemies.forEach(park); D.step(20);
      const lv = D.levels()[0];
      const p1 = P(0), p2 = P(1);
      const floorY = (lv.player.row + 1) * 8;
      D.setPlayer(60, floorY, 0); D.setPlayer(100, floorY, 1); D.step(20);
      D.hitPlayer(1);
      let ghostAt = -1, f = 0;
      while (f < 100 && !p2.ghost) { D.step(1); f++; }
      ghostAt = f;
      const gy0 = p2.y;
      // partner jumps under it every 30 frames: does a jump from the floor still reach?
      const reachable = [];
      for (let k = 0; k <= 16; k++) {
        const y = gy0 - k * 30 * 0.22;
        // static check: the partner's box at the top of a full jump (apex ~38 px) vs the ghost circle
        const top = floorY + 2 - 38;
        reachable.push({ t: (k * 0.5).toFixed(1) + 's', ghostCentreY: Math.round(y + 8), partnerApexTop: top, reach: y + 8 + 8 > top });
      }
      log('FAIR ghost-floor ' + JSON.stringify({ ghostAfter: ghostAt, startY: Math.round(gy0), riseVy: 0.22, table: reachable.filter((r, i) => i % 2 === 0) }));
      void p1;
    }
    log('FAIR DONE');
  }
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G || !PG.debug.local) return setTimeout(go, 30);
    setTimeout(() => { try { run(); } catch (e) { log('FAIR ERROR ' + e.message + ' ' + String(e.stack || '').split('\n').slice(0, 3).join(' | ')); log('FAIR DONE'); } }, 60);
  }
  go();
})();
