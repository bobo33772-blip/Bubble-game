// Headless check that every entry in PG.LEVELS (v2: 20 rounds + 4 boss arenas) plays sanely in the real engine.
// build.js turns this into C:/Temp/bogeul/test-levels-engine.html; run it with
//   node tools/run-chrome.js test-levels-engine.html - 900 760 40000
// Part 1, every entry: the layout is 24 entries with the bosses at indices 5/11/17/23; start it, let the enemies
// descend, then verify the duck and every ground enemy actually landed on their spawn platform, that the engine
// loaded exactly the water cells the data has, and that over ~12 s of play no ground enemy falls forever (e.g.
// through a wrap gap with nothing below) and nothing leaves the playfield. Boss arenas place no enemies; once the
// engine reports a boss (getState().boss), its type must match, it must start at bossSpawn and stay in the
// playfield (until the boss stage exists the boss checks report PEND instead of failing).
// Part 2, water: the duck is dropped into every pool and must float ~5 px deep; then scripted jumps follow the
// water routes the level validator's reachability model relies on (into a tub from a ledge below, out of a tub
// onto the next ledge) and must arrive.
(function () {
  const TS = 8, PF_TOP = 16;
  const BOSS_AT = { 5: 'kingGrime', 11: 'moldQueen', 17: 'megaSponge', 23: 'towelKing' };
  let pass = 0;
  let fail = 0;
  let pend = 0;
  const log = (s) => console.log(s);
  function waitFor() {
    if (!window.PG || !window.PG.debug || !window.PG.debug.G) return setTimeout(waitFor, 30);
    setTimeout(run, 50);
  }
  const waterCount = (L) => L.map.join('').replace(/[^~=]/g, '').length;
  const report = (ok, msg, problems) => {
    if (ok) pass++; else fail++;
    log(`LEVELTEST ${ok ? 'PASS' : 'FAIL'} ${msg}` + (ok ? '' : ' :: ' + [...new Set(problems)].slice(0, 6).join(' | ')));
  };

  function run() {
    const D = PG.debug;
    const G = D.G;
    const n = PG.LEVELS.length;

    // ── layout
    {
      const problems = [];
      if (n !== 24) problems.push(`PG.LEVELS has ${n} entries (expected 24)`);
      PG.LEVELS.forEach((L, i) => {
        if ((L.boss || null) !== (BOSS_AT[i] || null)) problems.push(`entry ${i + 1}: boss ${L.boss || 'none'} (expected ${BOSS_AT[i] || 'none'})`);
      });
      if (D.levels().length !== n) problems.push(`engine loaded ${D.levels().length} entries`);
      report(problems.length === 0, `layout · ${n} entries, bosses at ${PG.LEVELS.map((L, i) => (L.boss ? i + 1 : 0)).filter(Boolean).join('/')}`, problems);
    }

    // ── part 1: every entry
    for (let i = 0; i < n; i++) {
      const L = PG.LEVELS[i];
      const isBoss = !!L.boss;
      const problems = [];
      let bossNote = '';
      try {
        D.seed(1000 + i);
        D.start(i);
        D.setInvincible(true);
        const p0 = { x: G.p.x, y: G.p.y };
        if (isBoss) {
          if (L.enemies.length !== 0) problems.push(`boss arena places ${L.enemies.length} enemies (expected none)`);
        } else if (G.enemies.length !== L.enemies.length) problems.push(`engine has ${G.enemies.length} enemies, data has ${L.enemies.length}`);
        const st0 = D.getState();
        if (st0.water !== waterCount(L)) problems.push(`engine has ${st0.water} water cells, data has ${waterCount(L)}`);
        // boss: first report must be its type at bossSpawn (a short entry drop from above is allowed)
        let bossSeen = null;
        const seeBoss = () => {
          const b = D.getState().boss;
          if (!b) return null;
          if (!bossSeen) {
            bossSeen = b;
            if (!isBoss) problems.push(`engine reports a boss (${b.type}) in a normal round`);
            else {
              if (b.type !== L.boss) problems.push(`boss type ${b.type} (expected ${L.boss})`);
              const bx = L.bossSpawn.col * TS, by = PF_TOP + L.bossSpawn.row * TS;
              if (Math.abs(b.x - bx) > TS || b.y - by > TS || by - b.y > 48) problems.push(`boss first seen at ${b.x.toFixed(1)},${b.y.toFixed(1)} (bossSpawn is ${bx},${by})`);
            }
          }
          if (!isFinite(b.x) || !isFinite(b.y)) problems.push('boss has NaN position');
          else if (b.x < 8 || b.x > 216 || b.y < -8 || b.y > 232) problems.push(`boss left the playfield (${b.x.toFixed(1)},${b.y.toFixed(1)})`);
          return b;
        };
        seeBoss();
        // let every enemy finish descending; check each one two frames after it lands
        const pending = new Map();
        const checked = new Set();
        let f = 0;
        while ((G.enemies.some((e) => e.state === 'descend') || pending.size) && f < 400) {
          D.step(1); f++; seeBoss();
          G.enemies.forEach((e, k) => {
            if (e.type === 'fly' || e.state === 'descend' || checked.has(k) || e.spawnY === undefined) return;
            const left = pending.has(k) ? pending.get(k) - 1 : 2;
            if (left > 0) { pending.set(k, left); return; }
            pending.delete(k); checked.add(k);
            if (Math.abs(e.y - e.spawnY) > 2 || !e.onGround) problems.push(`${e.type}#${k} did not settle on its spawn platform (y ${e.y.toFixed(1)} vs ${e.spawnY}, onGround ${e.onGround})`);
          });
        }
        if (f >= 400) problems.push('enemies still descending after 400 frames');
        if (!isBoss) {
          const ground = G.enemies.filter((e) => e.type !== 'fly').length;
          if (checked.size !== ground) problems.push(`only ${checked.size}/${ground} ground enemies were checked on landing`);
        }
        if (!G.p.onGround || Math.abs(G.p.y - p0.y) > 0.5 || G.p.water) problems.push(`duck not standing dry at spawn (y ${G.p.y} vs ${p0.y}, water ${G.p.water | 0})`);
        // ~12 s of unattended play: track how long each ground enemy stays airborne
        const air = new Map();
        let worst = 0;
        let worstWho = '';
        let wade = 0;
        for (let t = 0; t < 720; t++) {
          D.step(1);
          if (G.mode !== 'playing') break;
          seeBoss();
          for (const e of G.enemies) {
            if (e.state !== 'active' || e.type === 'fly') { air.delete(e.id); continue; }
            if (!isFinite(e.x) || !isFinite(e.y)) problems.push(`${e.type} has NaN position`);
            if (e.x < 8 || e.x > 232) problems.push(`${e.type} left the playfield horizontally (x ${e.x})`);
            if (e.water) wade++;
            const a = e.onGround ? 0 : (air.get(e.id) || 0) + 1;
            air.set(e.id, a);
            if (a > worst) { worst = a; worstWho = `${e.type}#${e.id}`; }
          }
        }
        if (worst > 240) problems.push(`${worstWho} was airborne for ${worst} frames (endless fall?)`);
        if (isBoss) {
          if (!bossSeen) { bossNote = ' · boss PEND (engine reports no boss yet)'; pend++; }
          else bossNote = ` · boss ${bossSeen.type} ok`;
        }
        report(problems.length === 0, `round ${i + 1} ${L.name} · longest fall ${worst}f${waterCount(L) ? ` · water ${waterCount(L)} cells, ${wade} wading enemy-frames` : ''}${bossNote}`, problems);
      } catch (e) {
        fail++;
        log(`LEVELTEST FAIL round ${i + 1} ${L && L.name} exception ${e && e.message} @ ${String((e && e.stack) || '').split('\n')[1]}`);
      }
    }

    // ── part 2: water
    // Fresh entry with every enemy parked (frozen, harmless) plus one parked dummy so the round never clears.
    function prep(i) {
      D.seed(500 + i); D.start(i); D.setInvincible(true); D.step(140);
      if (G.mode !== 'playing') D.gotoRound(i);
      for (const e of G.enemies) { if (e.state === 'active' || e.state === 'descend') { e.state = 'trapped'; e.bubble = null; } }
      G.enemies.push({ id: 99999, type: 'grime', x: 30, y: 0, vx: 0, vy: 0, dir: 1, state: 'trapped', bubble: null, t: 0, gone: false, soakT: 0 });
      G.bubbles.length = 0;
      for (const k of ['left', 'right', 'jump', 'shoot']) D.press(k, false);
    }
    const feet = () => G.p.y + 16;
    const surfaceOf = (row) => PF_TOP + row * TS;
    const floatingIn = (row) => {
      const w = D.waterAt(G.p.x + 8, G.p.y + 15);
      return !!(G.p.water && w && w.surfaceY === surfaceOf(row) && Math.abs(feet() - (w.surfaceY + 5)) < 1.6);
    };

    // 2a. drop the duck into every pool (centre of each surface run) and check that it floats there
    for (let i = 0; i < n; i++) {
      const L = PG.LEVELS[i];
      if (!waterCount(L)) continue;
      const runs = [];
      for (let r = 1; r < 25; r++) {
        let c = 2;
        while (c <= 29) {
          if (!/[~=]/.test(L.map[r][c]) || /[~=]/.test(L.map[r - 1][c])) { c++; continue; }
          const a = c;
          while (c <= 29 && /[~=]/.test(L.map[r][c]) && !/[~=]/.test(L.map[r - 1][c])) c++;
          runs.push({ r, a, b: c - 1 });
        }
      }
      const problems = [];
      for (const R of runs) {
        prep(i);
        D.setPlayer((R.a + R.b + 1) * TS / 2 - 8, surfaceOf(R.r) - 16 - 20); // centred over the run, 20 px up
        let ok = -1;
        for (let t = 0; t < 120 && ok < 0; t++) { D.step(1); if (floatingIn(R.r) && Math.abs(G.p.vy) < 0.3) ok = t; }
        if (ok < 0) problems.push(`row ${R.r} cols ${R.a}-${R.b}: duck did not settle afloat (feet ${feet().toFixed(1)}, surface ${surfaceOf(R.r)}, water ${G.p.water | 0})`);
      }
      report(problems.length === 0, `float round ${i + 1} ${L.name} · ${runs.length} pool surface(s)`, problems);
    }

    // 2b. scripted routes. from/to are the cell the duck's left half occupies (like the player spawn);
    // from.float = start afloat on the pool surface in that row; to.kind 'water' = end afloat on that row's pool,
    // 'ground' = end standing on a block with feet at or above the top of row to.row+1.
    const ROUTES = [
      [0, 'floor -> cold dip (walk in)', { col: 18, row: 24 }, { col: 24, row: 24, kind: 'water' }, false],
      [0, 'cold dip -> right ledge (3 up)', { col: 24, row: 24, float: true }, { col: 24, row: 20, kind: 'ground' }, true],
      [1, 'low shelf -> hot tub (4 up)', { col: 9, row: 18 }, { col: 13, row: 15, kind: 'water' }, true],
      [1, 'hot tub -> left shelf (3 up)', { col: 12, row: 15, float: true }, { col: 8, row: 11, kind: 'ground' }, true],
      [3, 'shelf -> soaking tub (walk in)', { col: 5, row: 12 }, { col: 11, row: 12, kind: 'water' }, false],
      [3, 'soaking tub -> shelf beyond the rim', { col: 13, row: 12, float: true }, { col: 17, row: 12, kind: 'ground' }, true],
      [4, 'low ledge -> clawfoot tub (4 up)', { col: 6, row: 20 }, { col: 11, row: 17, kind: 'water' }, true],
      [4, 'clawfoot tub -> tub lip (2 up)', { col: 9, row: 17, float: true }, { col: 4, row: 14, kind: 'ground' }, true],
      [9, 'floor -> duck pond (walk in)', { col: 19, row: 24 }, { col: 25, row: 24, kind: 'water' }, false],
      [9, 'duck pond -> back onto the floor', { col: 24, row: 24, float: true }, { col: 20, row: 24, kind: 'ground' }, true],
      [11, 'side ledge -> queen\'s hot tub', { col: 5, row: 20 }, { col: 13, row: 20, kind: 'water' }, true],
      [11, 'queen\'s hot tub -> ledge (3 up)', { col: 11, row: 20, float: true }, { col: 7, row: 16, kind: 'ground' }, true],
      [15, 'stool -> hot ㅇ ring (3 up)', { col: 7, row: 22 }, { col: 13, row: 20, kind: 'water' }, true],
      [15, 'hot ㅇ ring -> ring wall (3 up)', { col: 12, row: 20, float: true }, { col: 8, row: 16, kind: 'ground' }, true],
      [17, 'floor -> cold storage pool (walk in)', { col: 17, row: 24 }, { col: 24, row: 24, kind: 'water' }, false],
      [17, 'cold storage pool -> first shelf (3 up)', { col: 24, row: 24, float: true }, { col: 25, row: 20, kind: 'ground' }, true],
      [21, 'ice bar -> cold floe tub (4 up)', { col: 11, row: 20 }, { col: 6, row: 17, kind: 'water' }, true],
      [21, 'cold floe tub -> floe rim', { col: 5, row: 17, float: true }, { col: 3, row: 16, kind: 'ground' }, true],
      [22, 'side ledge -> raised grand bath', { col: 4, row: 20 }, { col: 11, row: 18, kind: 'water' }, true],
      [22, 'grand bath -> rim', { col: 11, row: 18, float: true }, { col: 7, row: 17, kind: 'ground' }, true],
    ];
    for (const [i, label, from, to, jump] of ROUTES) {
      const L = PG.LEVELS[i];
      const problems = [];
      try {
        prep(i);
        if (from.float) {
          D.setPlayer(from.col * TS, surfaceOf(from.row) + 5 - 16);
          for (let t = 0; t < 40; t++) D.step(1);
          if (!floatingIn(from.row)) problems.push(`could not start afloat in row ${from.row} (water ${G.p.water | 0}, feet ${feet().toFixed(1)})`);
        } else {
          D.setPlayer(from.col * TS, surfaceOf(from.row + 1) - 16);
          D.step(2);
          if (!G.p.onGround || G.p.water || feet() !== surfaceOf(from.row + 1)) problems.push(`could not start standing in cell (${from.col},${from.row}) (feet ${feet()})`);
        }
        const tx = to.col * TS + 8;
        let done = -1;
        for (let t = 0; t < 180 && done < 0 && !problems.length; t++) {
          const cx = G.p.x + 8;
          D.press('right', cx < tx - 1.5);
          D.press('left', cx > tx + 1.5);
          D.press('jump', jump && t < 2);
          D.step(1);
          if (to.kind === 'water' ? floatingIn(to.row) : (G.p.onGround && !G.p.water && feet() <= surfaceOf(to.row + 1))) done = t;
        }
        for (const k of ['left', 'right', 'jump']) D.press(k, false);
        if (done < 0 && !problems.length) problems.push(`did not arrive (duck at ${G.p.x.toFixed(1)},${G.p.y.toFixed(1)} water ${G.p.water | 0} onGround ${G.p.onGround})`);
        report(problems.length === 0, `route round ${i + 1} ${L.name}: ${label}${done >= 0 ? ` · ${done}f` : ''}`, problems);
      } catch (e) {
        fail++;
        log(`LEVELTEST FAIL route round ${i + 1} ${label} exception ${e && e.message} @ ${String((e && e.stack) || '').split('\n')[1]}`);
      }
    }
    log(`LEVELTEST SUMMARY ${pass} passed, ${fail} failed${pend ? `, ${pend} boss check(s) pending` : ''}`);
  }
  waitFor();
})();
