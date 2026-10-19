// Battle-arena fairness in the REAL engine (measurement driver, also used to try layout candidates).
// For each arena: 4 idle ducks on their spawns x N seeds x S seconds (enemies on, intruder off): enemy stuns taken per
// spawn and the median time of each spawn's first stun; then the drain-drop check (4 trapped enemies parked at the
// gather, P1 walks from its spawn into the floor drain: nothing may pop).
// Page: test-arena-gate.html[#<url-encoded JSON>]  JSON: {patch: {<arena index>: {rows: {r: '...'}, players: [[c, r] x4],
//   enemySpawns: [[c, r] x6], gather: [c, r]}}, seeds: 8, secs: 60, only: [indexes]}
// Prints "AGATE A<n> ..." lines and "AGATE DONE pass=N fail=M" (pass: stuns max/min <= 2 with every spawn hit at least
// once overall, first-stun medians >= 4 s, the drain drop pops nothing).
(function () {
  'use strict';
  const log = (s) => console.log('AGATE ' + s);
  const TS = 8;
  let pass = 0, fail = 0;
  const ok = (name, cond, info) => { if (cond) pass++; else fail++; log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' :: ' + info : '')); };
  function release(D) { for (const k of ['left', 'right', 'jump', 'shoot']) for (let s = 0; s < 4; s++) D.press(k, false, s); }
  function applyPatch(AR, patch) {
    Object.keys(patch || {}).forEach((k) => {
      const A = AR[+k], p = patch[k]; if (!A || !p) return;
      if (p.rows) for (const r of Object.keys(p.rows)) A.map[+r] = p.rows[r];
      if (p.players) { A.players = p.players.map(([col, row]) => ({ col, row })); A.player = A.players[0]; }
      if (p.enemySpawns) A.enemySpawns = p.enemySpawns.map(([col, row]) => ({ col, row }));
      if (p.gather) A.gather = { col: p.gather[0], row: p.gather[1] };
    });
  }
  const med = (v) => { const b = v.slice().sort((x, y) => x - y); const n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; };
  function idle(a, seeds, secs) {
    const D = PG.debug, G = D.G;
    const stuns = [0, 0, 0, 0], firsts = [[], [], [], []];
    for (let seed = 0; seed < seeds; seed++) {
      D.seed(9900 + a * 20 + seed);
      D.local.battle(['duck', 'duck', 'duck', 'duck'].map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), { arena: a, intrusion: false, time: 3 });
      D.setInvincible(false); release(D);
      const got = [null, null, null, null], prev = [0, 0, 0, 0];
      for (let f = 0; f < 60 * secs; f++) {
        D.step(1);
        for (const p of G.players) {
          if (p.stunT > 0 && !prev[p.slot]) { stuns[p.slot]++; if (got[p.slot] === null) got[p.slot] = f / 60; }
          prev[p.slot] = p.stunT > 0 ? 1 : 0;
        }
      }
      got.forEach((g, k) => firsts[k].push(g === null ? secs : g));
    }
    return { stuns, first: firsts.map(med) };
  }
  // the drain drop: 4 enemies trapped (by P2) and parked at the gather; P1 walks from its spawn into the drain
  function drain(a) {
    const D = PG.debug, G = D.G, A = D.arenas()[a];
    D.seed(70 + a);
    D.local.battle(['duck', 'duck'].map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), { arena: a, intrusion: false });
    D.setInvincible(true); release(D);
    D.step(100);
    while (G.enemies.length > 4) G.enemies.pop();
    for (const e of G.enemies) { e.x = G.gather.x - 8; e.y = G.gather.y + 10; e.vx = 0; e.vy = 0; }
    D.trapAll();
    for (const b of G.bubbles) { b.owner = 1; b.trapMax = 99999; }
    D.step(200);
    const parked = G.bubbles.filter((b) => b.kind === 'trapped' && Math.hypot(b.x + 8 - G.gather.x, b.y + 8 - G.gather.y) < 28).length;
    const p = G.players[0], sp = A.players[0];
    p.x = sp.col * TS - 4; p.y = (sp.row + 1) * TS; p.vx = 0; p.vy = 0; p.invuln = 0;
    const k0 = p.kills;
    D.press('right', true, 0);
    let dropped = false;
    for (let f = 0; f < 400; f++) {
      if (p.y < 60 && p.vy > 0) { dropped = true; D.press('right', false, 0); }
      D.step(1);
      if (drain.trace && f % 8 === 0) log('trace f' + f + ' p ' + Math.round(p.x) + ',' + Math.round(p.y) + ' kills ' + (p.kills - k0) + ' bubbles ' + G.bubbles.filter((b) => b.kind === 'trapped').map((b) => Math.round(b.x) + ',' + Math.round(b.y)).join(' '));
    }
    D.press('right', false, 0);
    return { parked, kills: p.kills - k0, dropped };
  }
  function run() {
    const D = PG.debug, AR = D.arenas();
    let opt = {};
    try { const h = decodeURIComponent((location.hash || '').slice(1)); opt = h ? JSON.parse(h) : {}; } catch (e) { log('bad hash JSON: ' + e.message); }
    applyPatch(AR, opt.patch);
    const seeds = opt.seeds || 8, secs = opt.secs || 60;
    drain.trace = !!opt.trace;
    if (opt.drainOnly) { AR.forEach((A, a) => { if (opt.only && opt.only.indexOf(a) < 0) return; const d = drain(a); log('A' + (a + 1) + ' drain ' + JSON.stringify(d)); }); log('DONE pass=0 fail=0'); return; }
    AR.forEach((A, a) => {
      if (opt.only && opt.only.indexOf(a) < 0) return;
      const r = idle(a, seeds, secs);
      const mx = Math.max(...r.stuns), mn = Math.min(...r.stuns);
      log(`A${a + 1} ${A.name} spawns ${A.players.map((s) => `(${s.col},${s.row})`).join(' ')} enemies ${A.enemySpawns.map((s) => `(${s.col},${s.row})`).join(' ')} gather (${A.gather.col},${A.gather.row})`);
      log(`A${a + 1} idle ${seeds}x${secs}s: stuns ${r.stuns.join('/')} (max/min ${(mx / Math.max(1, mn)).toFixed(2)}), first-stun medians ${r.first.map((v) => v.toFixed(1)).join('/')} s`);
      ok(`A${a + 1} ${A.name}: enemy pressure even across the spawns (stuns max/min <= 2)`, mn >= 1 && mx / mn <= 2, r.stuns.join('/'));
      ok(`A${a + 1} ${A.name}: nobody is hit right after 시작! (first-stun medians >= 4 s)`, r.first.every((v) => v >= 4), r.first.map((v) => v.toFixed(1)).join('/'));
      const d = drain(a);
      log(`A${a + 1} drain drop: ${d.parked}/4 parked at the gather, P1 dropped through the drain: ${d.dropped}, kills ${d.kills}`);
      ok(`A${a + 1} ${A.name}: a drain drop pops nothing parked at the gather`, d.parked >= 3 && d.kills === 0, `${d.parked} parked, ${d.kills} kills`);
    });
    log(`DONE pass=${pass} fail=${fail}`);
  }
  function wait() { if (window.PG && PG.debug && PG.debug.arenas) setTimeout(run, 30); else setTimeout(wait, 30); }
  wait();
})();
