// 파티 (design/party.md §13.1): the rules, the two minigames, the flow, the coins and the card fit - offline, one engine,
// driven frame by frame with PG.debug.step (a whole 3판 at real lengths is ~14,000 frames: never waited out).
//   node build.js
//   node tools/run-chrome.js test-party.html party.png 900 760 120000 "PARTY DONE"
//   the card on a landscape phone (the fit part only): node tools/cdp-run.js "test-party.html#fit&touch=1" C:/Temp/bogeul/party-fit-568.png 568 320 30000 "PARTY DONE" 1
// Checks: the rotation (two games: A B A / A B A B A, never twice in a row, a replan keeps what was played), the points
// and ties (competition ranking, the standings' tie-breaks), 물 차오르기 (the schedule, each step drowning exactly one
// tier, the 3 px slack, the duck sinks too, a sinking prison puts its animal out with no release, a prison two tiers up
// lets go dry, a remote body judged only on a state of its own epoch, same-frame outs, survivors share 1st, the last one
// standing, an out animal hidden / harmless / back next 판), 왕관 뺏기 (it falls onto the centre stage, the first touch
// takes it, held time, a capture drops it, the dropper waits, a capy's shield keeps it, the holder is slower, a leaver
// drops it, places), no KO in a party, the flow and its timings, the podium (shared places, an out animal back on it),
// leavers and the walkover, full magazines at every 시작!, 파티 한 번 더, the coins (every branch, through coinGive),
// no trophy change, the card (texts, board, fit at 1x / 2x / a 568x320 phone), the warm-up, the podium's title switching
// back for a battle, the HUD, the closed arenas.
// Prints "PARTY PASS|FAIL <name>", "PARTY INFO ..." and "PARTY DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => { if (cond) { pass++; log('PARTY PASS ' + name); } else { fail++; log('PARTY FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); } return !!cond; };
  const info = (s) => log('PARTY INFO ' + s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const FIT_ONLY = /fit/.test(location.hash);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let D, G, P;
  const PS = () => P.state();
  const pl = (slot) => G.players.find((q) => q.slot === slot);
  const step = (n) => D.step(n);
  // step until pred() (at most max frames); returns the frames it took or -1
  function until(pred, max) { for (let i = 0; i < max; i++) { if (pred()) return i; D.step(1); } return pred() ? max : -1; }
  const toPlaying = () => until(() => G.mode === 'playing', 1200);
  // a local party (all players on this screen); plan forces the order
  function party(chars, opts, seed) { D.seed(seed === undefined ? 7 : seed); D.local.party(chars, opts); }
  const put = (slot, x, y) => { const p = pl(slot); p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.onGround = false; };
  // tier tops (px) of 물 차는 대욕장: floor 216, rows 21 / 17 / 13 / 9 / 5
  const TOP = (row) => 16 + row * 8;
  const T = { floor: [28, 200], r21: [60, TOP(21) - 16], r17: [36, TOP(17) - 16], r13: [60, TOP(13) - 16], r9: [36, TOP(9) - 16], r5L: [60, TOP(5) - 16], r5R: [172, TOP(5) - 16] };

  // ---------------------------------------------------------------- 1. rotation (3.2)
  function rotationTests() {
    const bad = [];
    for (const n of [2, 3, 4]) for (const r of [3, 5]) for (let seed = 1; seed <= 300; seed++) {
      const plan = P.plan(n, r, seed);
      if (plan.length !== r) bad.push(['len', n, r, seed, plan]);
      for (let i = 1; i < plan.length; i++) if (plan[i] === plan[i - 1]) bad.push(['twice', n, r, seed, plan]);
      if (plan.some((id) => id !== 'water' && id !== 'crown')) bad.push(['id', n, r, seed, plan]);
    }
    ok('rotation: 2 / 3 / 4 players x 3판 / 5판 x 300 seeds - the right length, only 물 / 왕관, never the same game twice in a row', !bad.length, bad.slice(0, 3));
    const a3 = P.plan(3, 3, 11), a5 = P.plan(4, 5, 12);
    ok('rotation: two games -> 3판 is A B A, 5판 A B A B A', a3[0] === a3[2] && a3[0] !== a3[1] && a5[0] === a5[2] && a5[2] === a5[4] && a5[1] === a5[3] && a5[0] !== a5[1], [a3, a5]);
    let firsts = new Set(); for (let s = 1; s <= 40; s++) firsts.add(P.plan(2, 3, s)[0]);
    ok('rotation: either game may come first (a shuffled bag)', firsts.size === 2, [...firsts]);
    const rp = P.plan(3, 5, 5, ['crown', 'water']);
    ok('rotation: a replan keeps the 판 already played and goes on without repeating the last one', rp.length === 5 && rp[0] === 'crown' && rp[1] === 'water' && rp[2] === 'crown' && rp.every((id, i) => !i || id !== rp[i - 1]), rp);
  }

  // ---------------------------------------------------------------- 2. points and ties (0, 3.3)
  function pointTests() {
    ok('points: 2 players 4 / 0, 3 players 4 / 2 / 0, 4 players 4 / 2 / 1 / 0', same(P.points(2, [1, 2]), [4, 0]) && same(P.points(3, [1, 2, 3]), [4, 2, 0]) && same(P.points(4, [1, 2, 3, 4]), [4, 2, 1, 0]));
    const r = new Map(P.rank([{ slot: 0, k: 9 }, { slot: 1, k: 9 }, { slot: 2, k: 5 }, { slot: 3, k: 1 }]));
    ok('rank: competition ranking - a tie shares the best place, the next is skipped (1, 1, 3, 4 -> 4, 4, 1, 0)', same([0, 1, 2, 3].map((s) => r.get(s)), [1, 1, 3, 4]) && same(P.points(4, [1, 1, 3, 4]), [4, 4, 1, 0]), [...r]);
    const r4 = new Map(P.rank([0, 1, 2, 3].map((slot) => ({ slot, k: 0 }))));
    ok('rank: a 4-way tie is 1st for everyone (4 points each)', [0, 1, 2, 3].every((s) => r4.get(s) === 1) && same(P.points(4, [1, 1, 1, 1]), [4, 4, 4, 4]));
    const St = (pts, wins, last) => P.standings({ pts, wins, last }, Object.keys(pts).map(Number));
    const s1 = St({ 0: 8, 1: 10, 2: 3 }, { 0: 2, 1: 1, 2: 0 }, { 0: 1, 1: 2, 2: 3 });
    ok('standings: by points first', same(s1.map((q) => [q.slot, q.place]), [[1, 1], [0, 2], [2, 3]]), s1);
    const s2 = St({ 0: 8, 1: 8, 2: 3 }, { 0: 1, 1: 2, 2: 0 }, { 0: 1, 1: 2, 2: 3 });
    ok('standings: equal points -> more 1등 is higher', same(s2.map((q) => [q.slot, q.place]), [[1, 1], [0, 2], [2, 3]]), s2);
    const s3 = St({ 0: 8, 1: 8, 2: 3 }, { 0: 1, 1: 1, 2: 0 }, { 0: 3, 1: 2, 2: 1 });
    ok('standings: then the better place in the last 판', same(s3.map((q) => [q.slot, q.place]), [[1, 1], [0, 2], [2, 3]]), s3);
    const s4 = St({ 0: 8, 1: 8, 2: 8, 3: 0 }, { 0: 1, 1: 1, 2: 2, 3: 0 }, { 0: 2, 1: 2, 2: 1, 3: 4 });
    ok('standings: still tied -> a shared place (공동 2등), the next skipped', same(s4.map((q) => [q.slot, q.place]), [[2, 1], [0, 2], [1, 2], [3, 4]]), s4);
  }

  // ---------------------------------------------------------------- 3. 물 차오르기 (4.1)
  function waterTests() {
    const A = P.arenas()[0];
    ok('water: 물 차는 대욕장 is closed (no drain: floor and ceiling all blocks, gapX mid-screen) with its rise schedule', A && A.key === 'water' && A.closed === true && /^#{32}$/.test(A.map[25]) && /^#{32}$/.test(A.map[0]) && A.gapX === 128 && A.rise && A.rise.steps.length === 5, A && [A.map[25], A.gapX]);
    const w = (s) => Math.round(P.waterAt(s * 60) * 100) / 100;
    ok('water: waterAt - y0 222 before 5 s, linear inside a step, flat between, the last level 78 to the end', w(0) === 222 && w(5) === 222 && w(7) === 214 && w(9) === 206 && w(15) === 206 && w(21) === 190 && w(23) === 174 && w(37) === 142 && w(51) === 110 && w(65) === 78 && w(75) === 78, [w(0), w(7), w(9), w(21), w(65), w(75)]);
    ok('water: a fast party runs the same schedule in 12 s (k = 0.16)', Math.abs(P.waterAt(7 * 60 * 0.16, 0.16) - 214) < 0.01);

    // each step drowns exactly one tier: 4 animals on the floor and rows 21 / 17 / 13 -> out in that order, ~2.25 s into
    // each step (when the surface is 3 px over the tier top); the 3rd out leaves one standing: the 판 ends 1 s later
    party(['duck', 'cat', 'frog', 'capy'], { plan: ['water'] });
    ok('water: a local party opens on its card (5 s), over the closed arena', G.mode === 'card' && PS().kind === 'p' && PS().mini.id === 'water' && PS().total === 4500, PS());
    toPlaying();
    put(0, ...T.floor); put(1, ...T.r21); put(2, ...T.r17); put(3, ...T.r13);
    const outAt = {};
    for (let f = 0; f < 3000 && G.mode === 'playing'; f++) { step(1); for (const p of G.players) if (p.out && outAt[p.slot] === undefined) outAt[p.slot] = PS().mini.t; }
    const want = { 0: 435, 1: 1328, 2: 2168, 3: 3008 };
    info('out frames ' + JSON.stringify(outAt) + ' (expected ~' + JSON.stringify(want) + ')');
    ok('water: the floor goes under in step 1, row 21 in step 2, row 17 in step 3 - each step one tier, at ~2.25 s into it', [0, 1, 2].every((s) => Math.abs(outAt[s] - want[s]) <= 2) && outAt[3] === undefined, outAt);
    const res = PS();
    ok('water: the last one standing ends it PARTY_F.early (60 f) after the 3rd out', G.mode === 'result' && Math.abs(res.mini.t - (outAt[2] + 60)) <= 1, [G.mode, res.mini.t]);
    ok('water: places - the later out the better: row 13 1st (4), row 17 2nd (2), row 21 3rd (1), the floor last (0)', same([0, 1, 2, 3].map((s) => res.pts[s]), [0, 1, 2, 4]) && same([0, 1, 2, 3].map((s) => res.last[s]), [4, 3, 2, 1]), [res.pts, res.last]);
    ok('water: p.score is the party points (the HUD, the podium)', G.players.every((p) => p.score === res.pts[p.slot]));

    // the shelves stay dry to the end; time-up survivors share 1st; row 9 goes under in step 5
    party(['duck', 'penguin', 'otter'], { plan: ['water'] });
    toPlaying();
    put(0, ...T.r5L); put(1, ...T.r5R); put(2, ...T.r9);
    let out9 = -1;
    for (let f = 0; f < 4700 && G.mode === 'playing'; f++) { step(1); if (out9 < 0 && pl(2).out) out9 = PS().mini.t; }
    const r2 = PS();
    ok('water: row 9 goes under in the last step (~64.1 s), the two top shelves stay dry to 75 s', Math.abs(out9 - 3848) <= 2 && !pl(0).out && !pl(1).out && r2.mini.t === 4500, [out9, r2.mini.t]);
    ok('water: survivors at time-up share 1st (4 + 4), the one out is 3rd (3 players: 0)', same([r2.last[0], r2.last[1], r2.last[2]], [1, 1, 3]) && same([r2.pts[0], r2.pts[1], r2.pts[2]], [4, 4, 0]), r2);

    // the 3 px slack (party.level forces the surface): feet 2 px under -> dry, 4 px -> out; the duck sinks like anyone
    party(['duck', 'cat'], { plan: ['water'] });
    toPlaying();
    put(0, ...T.floor); put(1, ...T.r5L); step(2);
    P.level(214); step(2);
    const dry = !pl(0).out;
    P.level(212); step(1);
    ok('water: WATER_SLACK - feet 2 px under the surface stay dry, 4 px under is out (the duck does not float: no tile water)', dry && pl(0).out, [dry, pl(0).out]);
    ok('water: an out animal - hidden, not free, cannot blow (its body is not run), cannot be caught', D.getState().players[0].out && !P.catch(0, 1) && (() => { const n = G.bubbles.length; D.press('shoot', true, 0); step(2); D.press('shoot', false, 0); step(1); return G.bubbles.length === n; })());
    ok('water: the last one standing (1 of 2) ends the 판 60 f later; the one left is 1st', until(() => G.mode === 'result', 80) >= 50 && PS().last[1] === 1 && PS().last[0] === 2, [G.mode, PS().last]);

    // a trapped animal sinks with its prison (MINI_SINK) and is judged by it: carried 3 px under the surface it is out
    // with no release first - no hop, no blink, no frame of its own physics
    party(['duck', 'cat', 'frog'], { plan: ['water'] });
    toPlaying();
    put(0, ...T.r21); put(1, ...T.r5L); put(2, ...T.r17);
    until(() => PS().mini.t >= 9 * 60 + 5, 1000);       // (step 1 done: the surface rests at 206 until 19 s)
    ok('water: (setup) the surface rests at 206 after step 1, row 21 and row 17 are dry', Math.abs(PS().mini.wl - 206) < 0.01 && !pl(0).out && !pl(2).out, PS().mini.wl);
    D.trapPlayer(0, 1); D.trapPlayer(2, 1);
    const y0 = pl(0).y; step(10); const sink = pl(0).y - y0;
    ok('water: a prison sinks MINI_SINK (0.3 px) a frame - no drift to the gather', Math.abs(sink - 3) < 0.6, sink);
    let freeFrame = false, outF = -1;
    for (let f = 0; f < 100 && outF < 0; f++) { step(1); const p = pl(0); if (!p.trap && !p.out) freeFrame = true; if (p.out) outF = f; }
    ok('water: carried 3 px under the surface (row 21, ~84 f) it is out straight from the prison - never free for a frame', outF >= 0 && !freeFrame && !pl(0).trap, [outF, freeFrame]);
    ok('water: a prison on the tier two above the water lets go dry (row 17: 27 px of sinking in 90 f)', until(() => !pl(2).trap, 40) >= 0 && !pl(2).out && pl(2).y + 16 < PS().mini.wl, [pl(2).out, pl(2).y]);

    // a remote body: judged only on a reported state of its current epoch; one stale for longer than REWIND is judged anyway
    party(['duck', 'cat', 'frog'], { plan: ['water'] });
    toPlaying();
    put(1, ...T.r5L); put(2, ...T.r5R); step(2);
    put(0, 28, 215); // (a copy frozen under the water level - a guest that, on its own screen, hopped clear)
    P.fakeRemote(0, { ep: pl(0).ep - 1, x: 28, y: 215 });
    P.level(150);
    const j0 = P.judge(0); step(5);
    const notYet = !pl(0).out;
    step(30);
    ok('water: a remote body whose state is from an older epoch is not judged (the frozen copy after a release) ...', j0 === null && notYet, [j0, notYet]);
    ok('water: ... and one stale for longer than REWIND (30 f) is judged anyway', pl(0).out);
    party(['duck', 'cat'], { plan: ['water'] });
    toPlaying(); put(1, ...T.r5L); step(2);
    P.fakeRemote(0, { x: 28, y: 200 }); // (its own epoch)
    ok('water: ... a state of its own epoch is judged at once', P.judge(0) === pl(0).y);

    // same-frame outs share; an out animal is back for the next 판
    party(['duck', 'cat', 'frog'], { plan: ['water', 'crown'] });
    toPlaying();
    put(0, ...T.floor); put(1, 172, 200); put(2, ...T.r5L); step(2);
    P.level(190); step(1);
    ok('water: two out on the same frame share the place (2nd and 2nd)', pl(0).out && pl(1).out && new Map(P.places()).get(0) === 2 && new Map(P.places()).get(1) === 2, P.places());
    until(() => G.mode === 'result', 100);
    until(() => G.mode === 'card', 300);
    ok('water: the out animals are back (not out, at their spawns) for the next 판', G.mode === 'card' && G.players.every((p) => !p.out) && PS().mini.id === 'crown', [G.mode, G.players.map((p) => p.out)]);

    // my own 탈락 line is this screen's only: the snapshot leaves it out and keeps sending the shared banner it covers
    // here (else the host's own out would cut that banner on every guest); once that one ends, nothing
    party(['duck', 'cat'], { plan: ['water'] });
    toPlaying();
    put(0, ...T.r5L); put(1, ...T.r5R);
    const warnAt = until(() => G.banner && G.banner.main === '물이 차올라요!', 400);
    const shared = P.snapBn(), mine = P.myLine('탈락! 2등', '친구들을 구경해요'), under = P.snapBn();
    ok('my line: shown here, marked local; the snapshot still carries the shared warning under it', warnAt >= 0 && !!shared && mine && mine.loc && G.banner.main === '탈락! 2등'
      && !!under && under[0] === shared[0] && under[1] === '물이 차올라요!', [warnAt, shared, mine, under]);
    step(110);
    ok('my line: ... and once the shared one is over, the snapshot sends no banner (never mine)', G.banner && G.banner.loc && G.frame < G.banner.end && P.snapBn() === null, [G.banner, P.snapBn()]);
  }

  // ---------------------------------------------------------------- 4. 왕관 뺏기 (4.2)
  function crownTests() {
    const dry = P.dry();
    ok('crown: only the dry battle arenas (not 냉온탕 대결: a hot-tub shield would keep the crown)', same(dry, [0, 2, 3]), dry);
    const seen = new Set(); let repeat = false, prev = -1;
    for (let k = 0; k < 6; k++) {
      party(['duck', 'cat'], { plan: ['crown', 'water', 'crown', 'water', 'crown'] }, 30 + k);
      for (const i of [0, 2, 4]) { while (PS().i < i) { P.next(); } const a = PS().arena; seen.add(a); if (PS().kind !== 'b' || !dry.includes(a)) repeat = true; if (i && a === prev) repeat = true; prev = a; }
    }
    ok('crown: a dry arena each time, never the one of the crown 판 before', !repeat && seen.size >= 2, [...seen]);
    for (const ai of dry) {
      // (each dry arena in turn: draw seeds until the crown 판 lands there)
      let tries = 0; do party(['duck', 'cat', 'frog', 'capy'], { plan: ['crown'] }, 100 + tries); while (PS().arena !== ai && tries++ < 60);
      ok('crown [' + ai + ']: (setup) drawn', PS().arena === ai, PS().arena);
      toPlaying();
      const g = G.gather, M0 = PS().mini;
      ok('crown [' + ai + ']: at 시작! it appears at the gather (free), 왕관이 나타났어요! after the 시작! banner', M0.cr.holder === -1 && Math.abs(M0.cr.x - (g.x - 8)) < 1 && Math.abs(M0.cr.y - (g.y - 8)) < 1, M0.cr);
      until(() => PS().mini.cr.onGround, 200);
      const cr = PS().mini.cr, stage = { 0: TOP(14), 2: TOP(13), 3: TOP(17) }[ai];
      ok('crown [' + ai + ']: it lands on the centre stage (equally far from every spawn)', cr.onGround && Math.abs(cr.y + 16 - stage) < 0.5 && cr.x + 8 > 12 * 8 && cr.x + 8 < 20 * 8, [cr.x, cr.y, stage]);
      step(70);
      ok('crown [' + ai + ']: ... and its banner shows once 시작! is gone', G.banner && G.banner.main === P.tx().crownIn, G.banner && G.banner.main);
    }
    party(['duck', 'cat', 'frog'], { plan: ['crown'] });
    toPlaying();
    until(() => PS().mini.cr.onGround, 200);
    const c0 = PS().mini.cr;
    put(1, c0.x, c0.y); put(0, c0.x + 4, c0.y - 2); step(1);
    ok('crown: the first touch takes it (several in one frame: the nearest)', PS().mini.cr.holder === 1, PS().mini.cr);
    step(60);
    const h1 = PS().mini.held[1] | 0;
    ok('crown: held frames count only for the holder', h1 >= 59 && !(PS().mini.held[0] | 0) && !(PS().mini.held[2] | 0), PS().mini.held);
    // the holder is slower: the same walk, x0.85
    put(1, 100, pl(1).y); put(2, 100, pl(2).y);
    D.press('right', true, 1); D.press('right', true, 2); step(30); const v1 = pl(1).vx, v2 = pl(2).vx; D.press('right', false, 1); D.press('right', false, 2);
    ok('crown: the holder walks at CROWN_SLOW (0.85x)', Math.abs(v1 / v2 - 0.85) < 0.02, [v1, v2]);
    // a capture drops it; its dropper cannot take it again for CROWN_NOPICK (the others out of the way)
    put(0, 20, 40); put(2, 220, 40); step(10);
    D.trapPlayer(1, 2);
    const cd = PS().mini.cr;
    ok('crown: a capture of the holder drops it (it flies out, 떨어졌다!), the dropper is barred for 90 f', cd.holder === -1 && cd.noPick === 1 && cd.vy < 0 && G.words.some((w) => w.txt === P.tx().crownDrop), cd);
    for (let i = 0; i < 12; i++) D.mash(1);
    step(2);
    until(() => PS().mini.cr.onGround, 100);
    const cc = PS().mini.cr; put(1, cc.x, cc.y); put(0, 20, 40); put(2, 220, 40); step(2);
    const barred = PS().mini.cr.holder === -1;
    until(() => PS().mini.cr.holder === 1 || G.frame >= cc.noUntil + 2, 120);
    ok('crown: ... and takes it back once the 90 f are over', barred && PS().mini.cr.holder === 1, [barred, PS().mini.cr]);
    // a capy's onsen shield takes the capture: the crown stays on
    party(['capy', 'cat'], { plan: ['crown'] });
    toPlaying(); P.crown(0); pl(0).shield = 100;
    const caught = P.catch(0, 1);
    ok('crown: a capy\'s shield takes the capture - the crown stays on', !caught && PS().mini.cr.holder === 0 && !pl(0).trap, [caught, PS().mini.cr.holder]);
    // places by held time; a leaver holding it drops it where it was
    party(['duck', 'cat', 'frog'], { plan: ['crown'] });
    toPlaying(); P.crown(2); step(120); P.crown(0); step(60); P.crown(1); step(2);
    const x1 = pl(1).x; P.drop(1); step(1);
    ok('crown: a leaver holding it drops it where it was (free, near its last spot)', PS().mini.cr.holder === -1 && Math.abs(PS().mini.cr.x - x1) < 4, PS().mini.cr);
    P.skip();
    const rs = PS();
    ok('crown: places by time held - 2 s 1st, 1 s 2nd (n0 3: 4 / 2), the leaver gone from the standings', rs.last[2] === 1 && rs.last[0] === 2 && rs.pts[2] === 4 && rs.pts[0] === 2 && G.players.length === 2, rs);
    // nobody touched it: everyone shares 1st
    party(['duck', 'cat', 'frog', 'otter'], { plan: ['crown'] });
    toPlaying(); P.skip();
    ok('crown: nobody touched it -> a 4-way shared 1st (4 points each)', [0, 1, 2, 3].every((s) => PS().pts[s] === 4 && PS().last[s] === 1), PS().pts);
  }

  // ---------------------------------------------------------------- 6. no KO
  function noKoTests() {
    party(['duck', 'cat', 'frog'], { plan: ['crown'] });
    toPlaying();
    for (const p of G.players) p.invuln = 0;
    put(0, 60, 160); put(1, 120, 160); put(2, 180, 160); step(3);
    D.trapPlayer(1, 0);
    step(20);
    const b = G.bubbles.find((q) => q.kind === 'player');
    put(2, b.x, b.y); step(2);
    const p1 = pl(1);
    ok('no KO: a rival touching a prison only frees it (no 뽀득 KO, no points, no KO wait)', !p1.trap && !(p1.koT > 0) && pl(2).kos === 0 && pl(2).score === 0 && p1.koed === 0, [p1.trap, p1.koT, pl(2).kos]);
    ok('no KO: the trap is short - MINI_TRAP 90 f (mash out faster as in battle)', P.consts().MINI_TRAP === 90);
    put(1, 20, 40); step(2);   // (the freed one out of the way: its touch would free the next prison)
    D.trapPlayer(2, 0); const t0 = G.frame; until(() => !pl(2).trap, 200);
    ok('no KO: ... left alone it lets go after 90 f', Math.abs(G.frame - t0 - 90) <= 2, G.frame - t0);
    ok('no KO: addScore does nothing in a party (empty pops pay no 10 points)', G.players.every((p) => p.score === 0));
  }

  // ---------------------------------------------------------------- 7. the flow (3.1), leavers (3.4), rematch
  function flowTests() {
    party(['duck', 'cat', 'frog', 'penguin'], { rounds: 3 });
    const plan = PS().plan, seq = [], first = { card: -1 };
    ok('flow: a 3판 party planned A B A', plan.length === 3 && plan[0] === plan[2] && plan[0] !== plan[1], plan);
    ok('flow: the first card is shown (#pg-party) with its 판 line', P.card().shown && P.card().round === '1판 / 3판' && P.card().name === P.mini()[plan[0]].name, P.card());
    let last = G.mode, since = 0;
    const marks = [];
    for (let f = 0; f < 20000 && G.mode !== 'podium'; f++) {
      // (every 판 ends early: skip it 2 s in)
      if (G.mode === 'playing' && PS().mini && PS().mini.t === 120) { P.skip(); marks.push([last, since]); last = G.mode; since = 0; }
      step(1); since++;
      if (G.mode !== last) { marks.push([last, since]); last = G.mode; since = 0; }
    }
    const seqModes = marks.map((m) => m[0]);
    info('flow: ' + marks.map((m) => m[0] + ' ' + m[1]).join(' > '));
    ok('flow: card -> countdown -> playing -> result, three times, then the podium', same(seqModes, ['card', 'countdown', 'playing', 'result', 'card', 'countdown', 'playing', 'result', 'card', 'countdown', 'playing', 'result']) && G.mode === 'podium', seqModes);
    ok('flow: the card 300 f, the 3-2-1 180 f, the result 180 f', marks.filter((m) => m[0] === 'card').every((m) => m[1] === 300) && marks.filter((m) => m[0] === 'countdown').every((m) => m[1] === 180) && marks.filter((m) => m[0] === 'result').every((m) => m[1] === 180), marks);
    ok('flow: the podium shows (#pg-podium, 파티 결과!, tag 3판, 파티 한 번 더)', !$('pg-podium').hidden && $('pg-podium-h').textContent === '파티 결과!' && $('pg-podium-tag').textContent === '3판' && !$('pg-podium-tag').hidden && $('pg-podium-again').textContent === '파티 한 번 더', [$('pg-podium-h').textContent, $('pg-podium-tag').textContent]);
    const pd = PS().podium;
    ok('flow: podium order and places from the standings; p.score = points', pd.order.length === 4 && pd.pl.length === 4 && G.players.every((p) => p.score === PS().pts[p.slot]), pd);

    // a shared 1st: two gold blocks, two 1s, "1위" twice for screen readers
    party(['duck', 'cat'], { plan: ['crown'] });
    toPlaying(); P.skip(); until(() => G.mode === 'podium', 400); step(5);
    const cv = $('pg-canvas'), x = cv.getContext('2d');
    const px = (X, Y) => Array.from(x.getImageData(X, Y, 1, 1).data.slice(0, 3));
    const gold = [255, 212, 71], strip = (X, Y) => { let n = 0; for (let k = 0; k < 8; k++) if (same(px(X + k, Y), gold)) n++; return n >= 6; }; // (confetti may cross a pixel)
    ok('podium: a shared 1st - two 1st places, both blocks gold, "1위" twice in the screen-reader line', same(PS().podium.pl, [1, 1]) && strip(128 - 12, 113) && strip(92 - 12, 123) && ($('pg-podium-sum').textContent.match(/1위/g) || []).length === 2,
      [PS().podium.pl, px(118, 113), px(82, 123), $('pg-podium-sum').textContent]);
    ok('podium: the note says the shared place', $('pg-podium-note').textContent === '공동 1등!' && !$('pg-podium-note').hidden, $('pg-podium-note').textContent);
    // an animal out in the last 물 stands on the podium
    party(['duck', 'cat'], { plan: ['water'] });
    toPlaying(); put(1, ...T.r5L); step(2); P.level(150); step(2); P.level(null);
    until(() => G.mode === 'podium', 600);
    ok('podium: an animal out in the last 물 stands on the podium (not out any more)', G.mode === 'podium' && G.players.every((p) => !p.out) && D.getState().players.every((p) => !p.out), G.players.map((p) => p.out));

    // a leaver mid-party: the party goes on; down to 1: a walkover podium
    party(['duck', 'cat', 'frog'], { rounds: 3 });
    toPlaying(); P.skip(); until(() => G.mode === 'card', 400);
    P.drop(2);
    ok('leavers: one leaves during a card (3 -> 2): the plan still fits, the party goes on', G.mode === 'card' && PS().plan.length === 3 && G.players.length === 2, [G.mode, PS().plan]);
    toPlaying();
    P.drop(1);
    ok('leavers: down to 1 player -> a walkover podium (친구가 나가서 일찍 끝났어요)', G.mode === 'podium' && PS().walk && $('pg-podium-note').textContent === '친구가 나가서 일찍 끝났어요', [G.mode, PS().walk, $('pg-podium-note').textContent]);

    // every magazine is full at each 시작!, even one emptied at the end of the 판 before
    party(['duck', 'cat'], { plan: ['crown', 'water'] });
    toPlaying(); step(170);
    for (let k = 0; k < 3; k++) { D.press('shoot', true, 0); step(2); D.press('shoot', false, 0); step(15); }
    const emptied = D.ammo.of(0).left;
    P.skip(); until(() => G.mode === 'playing', 800);
    const full = D.ammo.of(0);
    ok('magazines: emptied at the end of a 판 -> full again at the next 시작!', emptied === 0 && full.left === full.n, [emptied, full]);

    // 파티 한 번 더 (rematch): a new party with the same options
    party(['duck', 'cat'], { plan: ['crown'], rounds: 5, rapid: true });
    toPlaying(); P.skip(); until(() => G.mode === 'podium', 400);
    D.rematch();
    ok('rematch: 파티 한 번 더 starts a new party on its card (the options kept)', G.mode === 'card' && PS().i === 0 && PS().on && G.opts.rapid === true && G.players.every((p) => p.score === 0), [G.mode, PS().i, G.opts]);
  }

  // ---------------------------------------------------------------- 8. rewards (8)
  function coinTests() {
    const C = P.coin, K = P.consts();
    ok('coins: pBase 2 + pRound 4 a 판, pPlace 2 [6, 0] / 3 [8, 4, 0] / 4 [10, 5, 2, 0]', K.pBase === 2 && K.pRound === 4 && same(K.pPlace, { 2: [6, 0], 3: [8, 4, 0], 4: [10, 5, 2, 0] }));
    const all = [true, true, true];
    ok('coins: AFK (fewer than 5 blows, or under 60 s played) -> 0', C(4, true, all, 4, 9999, 1, 1) === 0 && C(4, true, all, 9, 3599, 1, 1) === 0);
    ok('coins: a finished 3판, 4 players: 1st 2 + 12 + 10 = 24, last 14', C(4, true, all, 30, 9000, 1, 1) === 24 && C(4, true, all, 30, 9000, 4, 1) === 14);
    ok('coins: 2 players 1st 20 / last 14; 3 players 1st 22 / 2nd 18 / 3rd 14', C(2, true, all, 30, 9000, 1, 1) === 20 && C(2, true, all, 30, 9000, 2, 1) === 14 && C(3, true, all, 30, 9000, 1, 1) === 22 && C(3, true, all, 30, 9000, 2, 1) === 18 && C(3, true, all, 30, 9000, 3, 1) === 14);
    ok('coins: a 판 I idled through pays no 4 (act false)', C(4, true, [true, false, true], 30, 9000, 1, 1) === 20);
    ok('coins: a walkover pays participation only (no rank bonus)', C(4, false, [true, true], 30, 9000, 1, 1) === 10);
    ok('coins: a shared place averages its bonuses (4 players, 2 share 1st: (10 + 5) / 2 = 7 -> 21)', C(4, true, all, 30, 9000, 1, 2) === 21 && C(4, true, all, 30, 9000, 3, 2) === 15);
    ok('coins: 5판 1st of 4 = 32 (still less a minute than a battle)', C(4, true, [true, true, true, true, true], 50, 20000, 1, 1) === 32);
    // through coinGive: the day bonus on the day's first paid result, then the soft cap halves
    const sh = D.shop, T0 = D.tro;
    T0.ns('partycoin'); T0.today(20261101);
    sh.set({ ce: 0, sp: 0, cd: 0, cde: 0, bd: 0, bs: 0 });
    party(['duck', 'cat'], { plan: ['crown'] });
    const r1 = P.payNow({ n: 2, done: true, place: 1, tie: 1, act: [true, true, true], pf: [3600, 3600, 3600], shots: 20 });
    ok('coins: through coinGive - 20 for 1st of 2 + the day bonus 20 (the day\'s first paid game)', r1 && r1.give === 40 && r1.bonus === 20 && sh.state().co === 40, [r1, sh.state().co]);
    sh.set({ cde: 395 });
    const r2 = P.payNow({ n: 2, done: true, place: 1, tie: 1, act: [true, true, true], pf: [3600, 3600, 3600], shots: 20 });
    ok('coins: ... past the soft cap (400 a day) the rest is halved (5 + 15 / 2 = 12), no second day bonus', r2 && r2.give === 12 && r2.bonus === 0, r2);
    T0.today(null);
    // an offline party pays nothing and leaves the trophy store byte-identical
    T0.ns('partyoff');
    const before = localStorage.getItem(T0.state().key);
    party(['duck', 'cat'], { plan: ['crown', 'water', 'crown'] });
    for (let f = 0; f < 20000 && G.mode !== 'podium'; f++) { if (G.mode === 'playing' && PS().mini.t === 60) { D.press('shoot', true, 0); step(1); D.press('shoot', false, 0); P.skip(); } step(1); }
    ok('coins: an offline party pays nothing; the trophy store is byte-identical after it (no trophies, no stats)', G.mode === 'podium' && localStorage.getItem(T0.state().key) === before && !PS().pod, [G.mode, PS().pod]);
  }

  // ---------------------------------------------------------------- 9. the card, the podium switch, the HUD
  function longNicks() { return ['가나다라마바사아자차카타', '하늘바다구름별달해님', '뽀득뽀득거품왕자님아', '까삐까삐까삐까삐까삐'].map((nick, i) => ({ char: ['duck', 'capy', 'otter', 'frog'][i], nick })); }
  function cardTests() {
    party(longNicks(), { plan: ['water', 'crown', 'water'] });
    let c = P.card();
    ok('card: round line, name, the one-line how-to, the rule line, the keyboard keys line (desktop)', c.shown && c.round === '1판 / 3판' && c.name === '물 차오르기' && c.how === P.mini().water.how && c.rule === P.mini().water.rule && c.keys === P.tx().keys && !c.team, c);
    ok('card: the board - one row per player, the place, nick, points; no +N before the first result', c.board.length === 4 && c.board.every((r) => r.place === '1' && r.pts === '0점' && !r.gain), c.board);
    toPlaying(); P.skip(); until(() => G.mode === 'card', 400);
    c = P.card();
    ok('card: the 2nd card - 2판 / 3판, the board best first with +N of the last 판', c.round === '2판 / 3판' && c.name === '왕관 뺏기' && c.board.every((r) => r.gain === '+4'), c);
    toPlaying(); for (const s of [1, 2, 3]) pl(s).invuln = 0; P.crown(1); step(30); P.skip(); until(() => G.mode === 'card', 400);
    c = P.card();
    ok('card: the last card says 마지막 판!; the board is in standing order (the crown winner first)', c.round === '마지막 판! 3판 / 3판' && c.board[0].nick === '하늘바다구름별달해님' && c.board[0].place === '1' && c.board[0].pts === '8점', c);
    // the podium title switches back for a battle; the HUD draws in every phase without errors
    D.local.battle(['duck', 'cat']); D.setTimeLeft(0.02); step(5);
    ok('podium: a battle afterwards has 결과 발표! again (no 3판 tag, no party note)', G.mode === 'podium' && $('pg-podium-h').textContent === '결과 발표!' && $('pg-podium-again').textContent === '한 판 더' && $('pg-podium-tag').textContent !== '3판', [$('pg-podium-h').textContent, $('pg-podium-tag').textContent]);
    let threw = null;
    try { for (const plan of [['water'], ['crown']]) { party(['duck', 'cat', 'frog', 'otter'], { plan }); for (let f = 0; f < 900; f++) { step(1); if (G.mode === 'playing' && PS().mini.t === 300) P.skip(); } } } catch (e) { threw = e.message; }
    ok('HUD: every phase of both games renders without an exception', !threw, threw);
    const warm = $('pg-fontwarm').textContent, miss = new Set();
    for (const ch of P.text()) if (/[\uac00-\ud7a3]/.test(ch) && warm.indexOf(ch) < 0) miss.add(ch);
    ok('fonts: every party syllable (PARTY_TEXT) is in #pg-fontwarm, both faces', !miss.size && ['.pg-fw-sign', '.pg-fw-body'].every((q) => document.querySelector('#pg-fontwarm ' + q).textContent.indexOf('물 차오르기') >= 0), [...miss].join(''));
    ok('texts: no party string holds the retired v1 title\'s syllables', P.text().indexOf(String.fromCharCode(0xbf40, 0xae00)) < 0);
  }
  // (last: touch mode never goes off again on this page)
  function touchTests() {
    window.dispatchEvent(new Event('touchstart'));
    party(longNicks(), { plan: ['water'] });
    ok('card: touch mode shows the touch keys line', $('pg-party-keys').textContent === P.tx().keysT, $('pg-party-keys').textContent);
  }
  // the fit: 4 players with 12-syllable nicks, each game's card - at 1x (no rule line), at 2x (the rule line)
  function setScale(s) {
    const st = $('pg-stage'); st.style.flex = 'none'; st.style.width = Math.round(256 * s + 22) + 'px'; st.style.height = Math.round(224 * s + 22) + 'px';
    window.dispatchEvent(new Event('resize'));
  }
  const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el); const tops = new Set(); for (const q of r.getClientRects()) if (q.width > 1) tops.add(Math.round(q.top)); return tops.size; };
  function measure(label, card) {
    const sc = $('pg-screen'), fs = parseFloat(getComputedStyle(sc).fontSize), sr = sc.getBoundingClientRect(), r = card.getBoundingClientRect();
    info(label + ': screen ' + Math.round(sr.width) + 'x' + Math.round(sr.height) + ' (' + (sr.width / fs).toFixed(1) + 'x' + (sr.height / fs).toFixed(1) + 'em) card ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' scroll ' + card.scrollHeight + '/' + card.clientHeight);
    ok(label + ': no scrolling (nothing cut off)', card.scrollHeight <= card.clientHeight + 1, [card.scrollHeight, card.clientHeight]);
    ok(label + ': inside the game screen', r.top >= sr.top - 0.5 && r.bottom <= sr.bottom + 0.5 && r.left >= sr.left - 0.5 && r.right <= sr.right + 0.5, [r.top, r.bottom, sr.top, sr.bottom]);
    return { em: sr.height / fs };
  }
  async function fitAt(label, wantRule) {
    for (const plan of [['water'], ['crown']]) {
      party(longNicks(), { plan: plan.concat(plan[0] === 'water' ? ['crown'] : ['water']) });
      toPlaying(); P.skip(); until(() => G.mode === 'card', 400);   // (the 2nd card: the board has +N and points)
      await sleep(120);
      const card = document.querySelector('.pg-party-card'), m = measure(label + ' ' + plan[0] + ' card', card), c = P.card();
      ok(label + ' ' + plan[0] + ': the how-to on one line, the keys on one line', lines($('pg-party-how')) === 1 && lines($('pg-party-keys')) === 1, [lines($('pg-party-how')), lines($('pg-party-keys'))]);
      if (wantRule !== undefined) ok(label + ' ' + plan[0] + ': the rule line ' + (wantRule ? 'shown' : 'hidden (a short screen)'), c.ruleShown === wantRule, [c.ruleShown, m.em]);
      ok(label + ' ' + plan[0] + ': each 12-syllable nick ends in an ellipsis inside its row (no row wider than the board)', [...$('pg-party-board').children].every((li) => li.scrollWidth <= li.clientWidth + 1));
    }
  }
  async function fitTests() {
    if (FIT_ONLY) { await fitAt('this viewport (' + innerWidth + 'x' + innerHeight + ')', true); return; }
    setScale(1); await fitAt('1x (256x224)', false);
    setScale(2); await fitAt('2x (512x448)', true);
    D.toTitle();
  }

  // ---------------------------------------------------------------- 10. the arenas (5.3)
  function arenaTests() {
    const ok1 = P.reload(PG.PARTY_ARENAS);
    ok('arenas: PG.PARTY_ARENAS loads (물 차는 대욕장 with its fields, closed)', ok1.length === 1 && ok1[0].key === 'water' && ok1[0].closed && ok1[0].rise && ok1[0].gapX === 128, ok1);
    const open = P.arenas()[0].map.slice(); open[25] = '##############...###############';
    const r = P.reload([{ key: 'water', name: 'x', theme: 1, map: open, players: [{ col: 4, row: 24 }], rise: { y0: 222, warn: 2, steps: [[5, 9, 206]] } }]);
    ok('arenas: normLevel keeps a closed map closed (a gap in its floor is closed again, no drain opened)', /^#{32}$/.test(r[0].floor) && /^#{32}$/.test(r[0].ceil) && r[0].gapX === 128, r[0]);
    const b = P.reload([null, { key: 'water', map: 'junk' }, { key: 'water', name: 'y', map: open }]);
    ok('arenas: a broken entry (or one without its rise schedule) gets the built-in closed arena', b.length === 3 && b.every((A) => A.closed && A.rise && A.rise.steps.length === 5 && /^#{32}$/.test(A.floor)), b.map((A) => [A.name, !!A.rise]));
  }

  // ---------------------------------------------------------------- screenshot scenes (#shot=card|water|crown|result|podium[&s=1|2])
  async function shot(name) {
    const sc = +((/[&#]s=([0-9.]+)/.exec(location.hash) || [])[1] || 2); setScale(sc);
    if (name === 'card') { party(longNicks(), { plan: ['water', 'crown', 'water'] }); toPlaying(); P.skip(); until(() => G.mode === 'card', 400); step(120); }
    else if (name === 'water') {
      party(longNicks(), { plan: ['water'] }); toPlaying();
      put(0, ...T.r17); put(1, ...T.r13); put(2, ...T.floor); put(3, ...T.r5R);
      until(() => PS().mini.t >= 1340, 1500); D.trapPlayer(1, 3); step(40);
    } else if (name === 'crown') {
      party(longNicks(), { plan: ['crown'] }, 101); toPlaying(); until(() => PS().mini.cr.onGround, 200);
      const c = PS().mini.cr; put(2, c.x, c.y); step(200); D.trapPlayer(0, 2); step(4);
    } else if (name === 'result') { party(longNicks(), { plan: ['crown', 'water'] }, 101); toPlaying(); P.crown(1); step(200); P.skip(); step(30); }
    else if (name === 'podium') { party(longNicks(), { plan: ['crown'] }, 101); toPlaying(); P.crown(1); step(200); P.crown(3); step(100); P.skip(); until(() => G.mode === 'podium', 400); step(120); }
    D.G.manual = true; D.step(0);
    await sleep(300);
    log('PARTY SHOT READY ' + name);
  }
  async function run() {
    for (let i = 0; i < 300 && !(window.PG && PG.debug && PG.debug.party); i++) await sleep(20);
    D = PG.debug; G = D.G; P = D.party;
    D.tro.ns('party'); D.tro.away(false);
    if (/touch/.test(location.hash)) window.dispatchEvent(new Event('touchstart'));
    const sm = /shot=([a-z]+)/.exec(location.hash);
    if (sm) { await shot(sm[1]); return; }
    const steps = FIT_ONLY ? [fitTests] : [rotationTests, pointTests, waterTests, crownTests, noKoTests, flowTests, coinTests, arenaTests, cardTests, fitTests, touchTests];
    for (const f of steps) {
      try { await f(); } catch (e) { fail++; log('PARTY FAIL ' + f.name + ' threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
    }
    log('PARTY DONE pass=' + pass + ' fail=' + fail);
  }
  setTimeout(run, 50);
})();
