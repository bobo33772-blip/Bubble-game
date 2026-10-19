// Headless check of the v3 level data (PG.LEVELS[*].players, PG.ARENAS) in the real engine.
// build.js turns this into C:/Temp/bogeul/test-v3-levels.html; run it with
//   node tools/run-chrome.js test-v3-levels.html - 900 760 60000
// Part 1 (solo engine, no multiplayer code needed): in every round the duck is put at each of the four co-op
//   spawns and must stand there, dry and still (the spawn really is a standing spot in the engine physics).
// Part 2 (co-op flow, when PG.debug.local.coop exists): a 4-player co-op start of every round puts each slot on
//   its own spawn, standing.
// Part 3 (battle flow, when PG.debug.local.battle exists): every arena loads with its name, map and water; the four
//   players start on their spawns, standing; the six enemies land on their enemySpawns; ~10 s of unattended play
//   keeps every enemy in the playfield with no endless falls; and each of the four bosses, sent in as the 보스 난입
//   intruder, stays in the playfield and (walkers) lands on something instead of dropping through the drain.
// Lines start with V3LEVELS PASS / FAIL / PEND; the last line is the summary.
(function () {
  const TS = 8, PF_TOP = 16;
  let pass = 0, fail = 0, pend = 0;
  const log = (s) => console.log(s);
  const report = (ok, msg, problems) => {
    if (ok) pass++; else fail++;
    log(`V3LEVELS ${ok ? 'PASS' : 'FAIL'} ${msg}` + (ok ? '' : ' :: ' + [...new Set(problems)].slice(0, 6).join(' | ')));
  };
  const body = (s) => ({ x: Math.max(14, Math.min(226, s.col * TS - 4)), y: (s.row + 1) * TS });
  const waterCount = (map) => map.join('').replace(/[^~=]/g, '').length;
  function waitFor() {
    if (!window.PG || !window.PG.debug || !window.PG.debug.G) return setTimeout(waitFor, 30);
    setTimeout(run, 50);
  }
  const guard = (label, fn) => {
    try { fn(); } catch (e) { fail++; log(`V3LEVELS FAIL ${label} exception ${e && e.message} @ ${String((e && e.stack) || '').split('\n')[1]}`); }
  };

  function run() {
    const D = PG.debug;
    const G = D.G;
    const release = () => { for (const k of ['left', 'right', 'jump', 'shoot']) for (let s = 0; s < 4; s++) D.press(k, false, s); };

    // ── part 1: every co-op spawn is a standing spot
    PG.LEVELS.forEach((L, i) => guard(`spawns round ${i + 1}`, () => {
      const problems = [];
      if (!Array.isArray(L.players) || L.players.length !== 4) problems.push('players is not 4 spawns');
      else {
        if (L.players[0].col !== L.player.col || L.players[0].row !== L.player.row) problems.push('players[0] != player');
        L.players.forEach((s, k) => {
          D.seed(3000 + i * 4 + k); D.start(i); D.setInvincible(true); release();
          const want = body(s);
          D.setPlayer(want.x, want.y);
          D.step(30);
          const p = G.p;
          if (!p.onGround || p.water || Math.abs(p.y - want.y) > 0.5 || Math.abs(p.x - want.x) > 0.5) {
            problems.push(`P${k + 1} (${s.col},${s.row}) did not stand still (at ${p.x.toFixed(1)},${p.y.toFixed(1)} vs ${want.x},${want.y}, onGround ${p.onGround}, water ${p.water | 0})`);
          }
        });
      }
      report(problems.length === 0, `round ${i + 1} ${L.name} · co-op spawns ${(L.players || []).map((s) => `(${s.col},${s.row})`).join(' ')}`, problems);
    }));

    // ── part 2: the co-op flow places every slot on its own spawn
    if (!(D.local && typeof D.local.coop === 'function')) { pend++; log('V3LEVELS PEND co-op flow (PG.debug.local.coop missing)'); }
    else {
      PG.LEVELS.forEach((L, i) => guard(`coop round ${i + 1}`, () => {
        const problems = [];
        D.seed(4000 + i);
        D.local.coop(['duck', 'capy', 'otter', 'penguin'], i);
        D.setInvincible(true); release();
        D.step(30);
        const st = D.getState();
        if (st.mode !== 'coop') problems.push(`mode ${st.mode}`);
        if ((st.players || []).length !== 4) problems.push(`${(st.players || []).length} players`);
        (st.players || []).forEach((p) => {
          const s = L.players[p.slot];
          const want = body(s);
          if (!p.onGround || p.water || Math.abs(p.x - want.x) > 0.5 || Math.abs(p.y - want.y) > 0.5) {
            problems.push(`slot ${p.slot} at ${p.x.toFixed(1)},${p.y.toFixed(1)} (spawn (${s.col},${s.row}) = ${want.x},${want.y}; onGround ${p.onGround})`);
          }
        });
        report(problems.length === 0, `co-op start round ${i + 1} ${L.name}`, problems);
      }));
    }

    // ── part 3: battle arenas
    const A = PG.ARENAS || [];
    if (!A.length) { fail++; log('V3LEVELS FAIL PG.ARENAS is empty'); }
    if (!(D.local && typeof D.local.battle === 'function')) { pend++; log('V3LEVELS PEND battle flow (PG.debug.local.battle missing)'); }
    else {
      const startBattle = (k, seed) => {
        D.seed(seed);
        D.local.battle(['duck', 'capy', 'otter', 'frog'], { arena: k, intrusion: false, countdown: false, time: 3 });
        D.setInvincible(true); release();
      };
      A.forEach((AR, k) => guard(`arena ${k + 1}`, () => {
        const problems = [];
        startBattle(k, 5000 + k);
        let st = D.getState();
        if (st.mode !== 'battle') problems.push(`mode ${st.mode}`);
        if (st.arena !== k) problems.push(`engine arena ${st.arena} (expected ${k})`);
        const EA = D.arenas()[k];
        if (!EA || EA.name !== AR.name) problems.push(`engine arena name ${EA && EA.name}`);
        else if (EA.map.join('') !== AR.map.join('')) problems.push('engine map differs from the data');
        if (st.water !== undefined && st.water !== waterCount(AR.map)) problems.push(`engine water ${st.water} cells, data ${waterCount(AR.map)}`);
        if (G.enemies.length !== Math.min(6, AR.enemySpawns.length)) problems.push(`${G.enemies.length} enemies at the start (expected 6)`);
        // the engine rolls a random type per spawn; make every one a walker so all six spawn cells get a landing check
        G.enemies.forEach((e, n) => {
          const sp = AR.enemySpawns[n];
          if (!sp || e.type !== 'fly') return;
          e.type = 'grime'; e.spawnY = (sp.row + 1) * TS; e.fvx = 0; e.fvy = 0;
        });
        const ground = G.enemies.filter((e) => e.type !== 'fly').length;
        D.step(30);
        st = D.getState();
        (st.players || []).forEach((p) => {
          const s = AR.players[p.slot];
          const want = body(s);
          if (!p.onGround || p.water || Math.abs(p.x - want.x) > 0.5 || Math.abs(p.y - want.y) > 0.5) {
            problems.push(`slot ${p.slot} at ${p.x.toFixed(1)},${p.y.toFixed(1)} (spawn (${s.col},${s.row}) = ${want.x},${want.y}; onGround ${p.onGround})`);
          }
        });
        // enemies finish descending onto their spawn cells (ground types)
        const checked = new Set();
        const pending = new Map();
        let f = 0;
        while ((G.enemies.some((e) => e.state === 'descend') || pending.size) && f < 400) {
          D.step(1); f++;
          G.enemies.forEach((e, n) => {
            if (e.type === 'fly' || e.state === 'descend' || checked.has(n)) return;
            const left = pending.has(n) ? pending.get(n) - 1 : 2;
            if (left > 0) { pending.set(n, left); return; }
            pending.delete(n); checked.add(n);
            // (an enemy right under the top spawns' shelf may already hop up toward them: that is landing, then a jump)
            const hopping = e.vy < 0 && e.y < e.spawnY && e.y > e.spawnY - 24;
            if (!hopping && (Math.abs(e.y - e.spawnY) > 2 || !e.onGround)) problems.push(`${e.type}#${n} did not settle on its spawn (y ${e.y.toFixed(1)} vs ${e.spawnY}, onGround ${e.onGround})`);
          });
        }
        if (f >= 400) problems.push('enemies still descending after 400 frames');
        if (checked.size !== ground) problems.push(`only ${checked.size}/${ground} ground enemies were checked on landing`);
        // ~10 s unattended: no endless falls, nobody leaves the playfield
        const air = new Map();
        let worst = 0;
        for (let t = 0; t < 600; t++) {
          D.step(1);
          for (const e of G.enemies) {
            if (e.state !== 'active' || e.type === 'fly') { air.delete(e.id); continue; }
            if (!isFinite(e.x) || !isFinite(e.y) || e.x < 8 || e.x > 232) problems.push(`${e.type} left the playfield (${e.x},${e.y})`);
            const a = e.onGround ? 0 : (air.get(e.id) || 0) + 1;
            air.set(e.id, a);
            worst = Math.max(worst, a);
          }
        }
        if (worst > 240) problems.push(`an enemy was airborne for ${worst} frames`);
        report(problems.length === 0, `arena ${k + 1} ${AR.name} · spawns, ${checked.size} enemies landed, longest fall ${worst}f`, problems);

        // the intruder: every boss type
        if (typeof D.intrude !== 'function') { pend++; log(`V3LEVELS PEND arena ${k + 1} intruder (PG.debug.intrude missing)`); return; }
        for (const type of ['kingGrime', 'moldQueen', 'megaSponge', 'towelKing']) {
          const bp = [];
          startBattle(k, 6000 + k * 10);
          D.step(5);
          const b0 = D.intrude(type);
          if (!b0) { bp.push('intrude() returned nothing'); report(false, `arena ${k + 1} intruder ${type}`, bp); continue; }
          let stood = -1;
          let lowest = -1e9;
          let firstY = null;
          let introY = null;
          for (let t = 0; t < 420; t++) {
            D.step(1);
            const b = G.boss;
            if (!b) break;
            if (!isFinite(b.x) || !isFinite(b.y) || b.x < 8 || b.x > 216 || b.y < -8 || b.y > 232) { bp.push(`left the playfield (${b.x},${b.y})`); break; }
            // the intro holds the boss (flagged on the ground) at its spawn; a walker then drops onto something
            if (b.state !== 'intro' && introY === null) introY = b.y;
            if (b.onGround && introY !== null && b.y > introY + 1 && stood < 0) { stood = t; firstY = b.y; }
            lowest = Math.max(lowest, b.y);
          }
          const walker = type === 'kingGrime' || type === 'megaSponge';
          if (walker && stood < 0) bp.push('never landed');
          report(bp.length === 0, `arena ${k + 1} intruder ${type}${walker && stood >= 0 ? ` · first stood on row ${(firstY + 32 - PF_TOP) / TS} after ${stood}f` : ''} · lowest y ${Math.round(lowest)}`, bp);
        }
      }));
    }
    release();
    log(`V3LEVELS SUMMARY ${pass} passed, ${fail} failed${pend ? `, ${pend} pending` : ''}`);
  }
  waitFor();
})();
