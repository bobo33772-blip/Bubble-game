// 파티 (design/party.md §13.1): the rules, the three minigames, the flow, the coins and the card fit - offline, one engine,
// driven frame by frame with PG.debug.step (a whole 3판 at real lengths is ~14,000 frames: never waited out).
//   node build.js
//   node tools/run-chrome.js test-party.html party.png 900 760 120000 "PARTY DONE"
//   the card on a landscape phone (the fit part only): node tools/cdp-run.js "test-party.html#fit&touch=1" C:/Temp/bogeul/party-fit-568.png 568 320 30000 "PARTY DONE" 1
// Checks: the rotation (2 / 4 players: each of the three once in 3판; 3 players: A B A / A B A B A without 거품 축구;
// never twice in a row, a replan keeps what was played and drops 축구 for 3), the points
// and ties (competition ranking, the standings' tie-breaks), 물 차오르기 (the schedule, each step drowning exactly one
// tier, the 3 px slack, the duck sinks too, a sinking prison puts its animal out with no release, a prison two tiers up
// lets go dry, a remote body judged only on a state of its own epoch, same-frame outs, survivors share 1st, the last one
// standing, an out animal hidden / harmless / back next 판), 왕관 뺏기 (it falls onto the centre stage, the first touch
// takes it, held time, a capture drops it, the dropper waits, a capy's shield keeps it, the holder is slower, a leaver
// drops it, places), 거품 축구 (the field, the teams by standing, the kickoff, body pushes - a still body nudges, a
// sliding penguin kicks hard - a shot pushes along its flight and pops, a shot meeting the ball and a rival is spent on
// the ball, a capy's slam lifts it, goals on both sides counted once, the clock stops for 골!, the kickoff opens every
// prison and puts everyone back, kn, team places and points, a draw, 60 s of random kicks never out / NaN / wrapped),
// no KO in a party, the flow and its timings, the podium (shared places, an out animal back on it),
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
      const fit = n === 3 ? ['water', 'crown'] : ['water', 'crown', 'ball'];
      if (plan.some((id) => !fit.includes(id))) bad.push(['id', n, r, seed, plan]);
      if (n !== 3 && new Set(plan.slice(0, 3)).size !== 3) bad.push(['once', n, r, seed, plan]);
    }
    ok('rotation: 2 / 3 / 4 players x 3판 / 5판 x 300 seeds - the right length, never the same game twice in a row; 2 / 4 players play each of the three once in 3판 (5판: then two of a fresh bag); 3 players never 거품 축구', !bad.length, bad.slice(0, 3));
    const a3 = P.plan(3, 3, 11), a5 = P.plan(3, 5, 12);
    ok('rotation: 3 players (two games) -> 3판 is A B A, 5판 A B A B A', a3[0] === a3[2] && a3[0] !== a3[1] && a5[0] === a5[2] && a5[2] === a5[4] && a5[1] === a5[3] && a5[0] !== a5[1], [a3, a5]);
    let firsts = new Set(); for (let s = 1; s <= 60; s++) firsts.add(P.plan(4, 3, s)[0]);
    ok('rotation: any of the three may come first (a shuffled bag)', firsts.size === 3, [...firsts]);
    const rb = P.plan(3, 3, 9, ['water']);
    ok('rotation: a replan for 3 players (4 -> 3 before a 거품 축구) keeps the 판 played and plans no 축구', rb[0] === 'water' && !rb.includes('ball') && rb[1] !== 'water' && rb[2] !== rb[1], rb);
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

  // ---------------------------------------------------------------- 5. 거품 축구 (4.3)
  const NK = ['방장', '까삐', '펭펭', '냥냥'];
  const withNicks = (chars) => chars.map((char, i) => ({ char, nick: NK[i] }));
  const BL = () => PS().mini.ball;
  const REST = 216 - 11;                                  // (the ball's centre resting on the floor)
  const sx = (col) => col * 8 - 4;                        // (a spawn cell's body x)
  const kicked = () => until(() => BL().kick === 0, 80);
  // the players out of the way: standing on the two crossbars (over every ball on the floor), or (floor) on the floor
  // mid-field (under a ball on a crossbar)
  const park = (except, floor) => {
    const X = floor ? [100, 124, 148, 172] : [16, 32, 208, 224]; let k = 0;
    for (const p of G.players) { if (p.slot === except) continue; put(p.slot, X[k++], floor ? 200 : 176 - 16); p.invuln = 0; }
    step(1);
  };
  function ballTests() {
    const K = P.consts().BALL;
    const A = P.arenas()[1];
    ok('ball: 거품 축구장 is closed with a crossbar over each goal (row 20), goal mouths, two kickoff spots a team, the ball\'s spot', A && A.key === 'ball' && A.closed && /^#{32}$/.test(A.map[25]) && A.map[20] === '######....................######' && A.goals.length === 2 && A.goals[0].line === 40 && A.goals[1].line === 216 && A.sides.length === 2 && A.ball.x === 128 && A.ball.y === 64, A && [A.map[20], A.goals]);

    // a guest reads the ball off the snapshot clamped as the host's own: inside the field, never past BALL.maxV
    const vj = P.view(['b', -4000, 30000, 99999, -99999, 0, 0, 0, 0, 0]), vk = P.view(['b', 1280, 640, 120, -80, 0, 0, 0, 0, 0]);
    ok('ball: a guest\'s view of a junk ball row stays in the field (27..229 x 35..205) and under BALL.maxV; a sane row reads as sent',
      vj.x === 27 && vj.y === 205 && vj.vx === K.maxV && vj.vy === -K.maxV && vk.x === 128 && vk.y === 64 && vk.vx === 1.2 && vk.vy === -0.8, [vj, vk]);

    // 2v2 before any points: slots 0 + 3 left, 1 + 2 right, each on its team's side; the card's team line
    party(withNicks(['duck', 'cat', 'frog', 'capy']), { plan: ['ball'] });
    const s0 = PS();
    ok('ball: a 4-player 판 on 거품 축구장 (60 s), opening on its card', G.mode === 'card' && s0.kind === 'p' && s0.arena === 1 && s0.mini.id === 'ball' && s0.total === 3600, [G.mode, s0.kind, s0.arena, s0.total]);
    ok('ball: 2v2 before any points - slots 0 + 3 on the left, 1 + 2 on the right', same(s0.mini.team, { 0: 0, 1: 1, 2: 1, 3: 0 }), s0.mini.team);
    ok('ball: everyone on its team\'s kickoff spots (left cols 11 / 7, right cols 20 / 24)', pl(0).x === sx(11) && pl(3).x === sx(7) && pl(1).x === sx(20) && pl(2).x === sx(24) && G.players.every((p) => p.y === 200), G.players.map((p) => [p.slot, p.x, p.y]));
    let c = P.card();
    ok('ball: the card\'s team line - 왼쪽 팀: 방장 · 냥냥 / 오른쪽 팀: 까삐 · 펭펭 (offline: no own side line)', c.team && same(c.teams, ['왼쪽 팀: 방장 · 냥냥', '오른쪽 팀: 까삐 · 펭펭']) && c.mine === '' && c.name === '거품 축구' && c.how === P.mini().ball.how, c);
    const m2 = P.fill(2).mine, m0 = P.fill(0).mine; P.fill(-1);
    ok('ball: ... on a seat\'s own screen the side it scores on (나는 오른쪽 팀 · 왼쪽 골대에 넣어요!)', m2 === P.tx().mineR && m0 === P.tx().mineL, [m2, m0]);
    toPlaying();
    const b0 = BL(), calls = (t) => G.words.filter((w) => w.txt === t).length;
    ok('ball: at 시작! the ball hangs at the centre top (BALL.kickF), each local animal gets its side called (오른쪽으로! x2, 왼쪽으로! x2)', b0.kick > 0 && b0.kick <= K.kickF && b0.x === 128 && b0.y === 64 && calls(P.tx().toR) === 2 && calls(P.tx().toL) === 2, [b0, calls(P.tx().toR), calls(P.tx().toL)]);
    ok('ball: (setup) the kickoff wait is over in BALL.kickF frames', kicked() >= 0 && kicked() < K.kickF);
    ok('ball: ... it drops and comes to rest mid-field on the floor', until(() => BL().rest, 300) >= 0 && Math.abs(BL().x - 128) < 0.01 && Math.abs(BL().y - REST) < 0.01, BL());

    // bodies: a still body nudges it (BALL.nudge), a walking one pushes (closing speed x BALL.body + nudge), a sliding
    // penguin kicks hard (no special code); bodies are never pushed back
    party(['duck', 'penguin'], { plan: ['ball'] }); toPlaying(); kicked();
    park(); P.ball(128, REST, 0, 0); step(1);
    put(0, 128 - 11 - 14 + 2, 200); step(1);
    const nudge = BL().vx, kn1 = PS().mini.kn;
    ok('ball: a still body nudges it away (~BALL.nudge 0.4 px/f), kn counts the push', nudge > 0.3 && nudge < 0.45 && kn1 >= 1 && pl(0).vx === 0, [nudge, kn1]);
    park(); P.ball(128, REST, 0, 0); put(0, 60, 200);
    D.press('right', true, 0); let walkV = 0, walkPv = 0;
    for (let f = 0; f < 120 && !walkV; f++) { step(1); if (Math.abs(BL().vx) > 0.5) { walkV = BL().vx; walkPv = pl(0).vx; } }
    D.press('right', false, 0);
    ok('ball: a walking body pushes it: ~1.2 x its closing speed + 0.4 (the duck at ~1.25 px/f -> ~1.9)', walkV > 1.6 && walkV < 2.1 && walkPv > 1.1, [walkV, walkPv]);
    park(); P.ball(128, REST, 0, 0); put(1, 96, 200); step(1);
    Object.assign(pl(1), { mv: 'slide', mvT: 0, mvD: 1, vx: 2.6, onGround: true });
    let slideV = 0, slidePv = 0;
    for (let f = 0; f < 60 && !slideV; f++) { const pv = pl(1).vx; step(1); if (Math.abs(BL().vx) > 0.5) { slideV = BL().vx; slidePv = pv; } }
    ok('ball: a sliding penguin kicks it hard (> 3 px/f, far past a walking push) and keeps sliding (never pushed back)', slideV > 3 && slideV > walkV * 1.5 && pl(1).vx > 1.5, [slideV, slidePv, pl(1).vx]);

    // bubbles: a shot pushes it along its flight and pops on it; a floating one pushes along the centre line; one that
    // meets the ball and a rival on the same frame is spent on the ball (no trap) - without the ball it traps the rival
    party(['capy', 'cat'], { plan: ['ball'] }); toPlaying(); kicked();
    park(); P.ball(128, REST, 0, 0); step(1);
    const kn2 = PS().mini.kn, sh = P.shot(0, 96, REST - 8, 1);
    let popAt = -1; for (let f = 0; f < 20 && popAt < 0; f++) { step(1); if (sh.state === 'pop' || sh.dead) popAt = f; }
    ok('ball: a shot pops on the ball and pushes it along its flight (+BALL.shot 1.8 px/f to the right)', popAt >= 0 && BL().vx > 1.5 && BL().vx < 1.9 && Math.abs(BL().vy) < 0.5 && PS().mini.kn > kn2, [popAt, BL(), PS().mini.kn]);
    park(); P.ball(128, REST, 0, 0); step(1);
    const fl = P.shot(0, 128 - 8 - 16, REST - 8, 1); fl.state = 'float'; fl.vx = 0; fl.vy = 0; step(1);
    ok('ball: a floating bubble touching it pops and pushes it along the centre line (+BALL.float 0.5 px/f)', (fl.state === 'pop' || fl.dead) && BL().vx > 0.4 && BL().vx < 0.55, [fl.state, BL()]);
    park(1); pl(1).invuln = 0; P.ball(128, REST, 0, 0); step(1);
    put(1, 120, 200); P.ball(128, REST, 0, 0);
    const both = P.shot(0, 112, REST - 8, 1); step(1);
    ok('ball: a shot meeting the ball and a rival on the same frame is spent on the ball - no trap', (both.state === 'pop' || both.dead) && !pl(1).trap && BL().vx > 0.5, [both.state, !!pl(1).trap, BL()]);
    park(1); pl(1).invuln = 0; put(1, 120, 200); P.ball(40, REST, 0, 0); step(1);
    P.shot(0, 112, REST - 8, 1); step(2);
    ok('ball: ... (control) the same shot without the ball there traps the rival', !!pl(1).trap, [pl(1).trap]);
    for (let k = 0; k < 12 && pl(1).trap; k++) D.mash(1);
    // a capy's slam lifts it (a header for free)
    park(0); P.ball(140, REST, 0, 0); put(0, 112, 200); P.quake(0);
    ok('ball: a capy\'s slam (quake) next to it sets vy to BALL.slam (-3.4): it flies up', BL().vy === K.slam && !BL().rest, BL());

    // goals: the left goal is a point for the right team and the other way round, each counted once; the clock stops for
    // 골!; the kickoff opens every prison (no orphan prison left), everyone back on their side, the ball at the centre top
    party(withNicks(['duck', 'cat', 'frog', 'capy']), { plan: ['ball'] }); toPlaying(); kicked();
    park(); step(2);
    D.trapPlayer(1, 2);
    const kp = PS().mini.ko;
    P.ball(40, REST, -2.5, 0);
    const gAt = until(() => PS().mini.goalT > 0, 30), left0 = PS().left;
    ok('ball: into the left goal -> a point for the right team (0 : 1), 골! / 오른쪽 팀 0 : 1, the ball burst', gAt >= 0 && same(PS().mini.goals, [0, 1]) && PS().mini.goalT >= K.goalF - 1 && G.banner && G.banner.main === '골!' && G.banner.sub === '오른쪽 팀 0 : 1', [gAt, PS().mini.goals, G.banner]);
    ok('ball: (setup) a rival is in a prison during the cheer', !!pl(1).trap && G.bubbles.some((b) => b.kind === 'player'));
    step(60);
    ok('ball: the clock stops while 골! shows; the goal counted once', PS().left === left0 && same(PS().mini.goals, [0, 1]), [left0, PS().left, PS().mini.goals]);
    D.trapPlayer(3, 0);   // (a fresh prison: the first one would have let go by itself before the kickoff)
    until(() => PS().mini.goalT === 0, 200);
    const kb = BL();
    ok('ball: the kickoff - every prison opened (no orphan prison), no bubble left, everyone back on its side, the ball at the centre top (kickF)',
      !G.players.some((p) => p.trap) && !G.bubbles.some((b) => b.kind === 'player' || b.kind === 'empty') && pl(0).x === sx(11) && pl(3).x === sx(7) && pl(1).x === sx(20) && pl(2).x === sx(24) && kb.x === 128 && kb.y === 64 && kb.kick === K.kickF && PS().mini.ko === kp + 1,
      [G.players.map((p) => [p.slot, p.x, !!p.trap]), G.bubbles.map((b) => b.kind), kb]);
    step(5);
    ok('ball: ... and the clock runs again', PS().left < left0, [left0, PS().left]);
    kicked(); park(); P.ball(216, REST, 2.5, 0);
    until(() => PS().mini.goalT > 0, 30);
    ok('ball: into the right goal -> a point for the left team (1 : 1, 왼쪽 팀 1 : 1)', same(PS().mini.goals, [1, 1]) && G.banner.sub === '왼쪽 팀 1 : 1', [PS().mini.goals, G.banner]);
    until(() => PS().mini.goalT === 0, 200); kicked(); park(-1, true); P.ball(30, 150, 0, 1);
    const onBar = until(() => BL().rest, 200);
    ok('ball: a ball resting on the crossbar is no goal (only under the bar counts)', onBar >= 0 && Math.abs(BL().y - (176 - 11)) < 0.01 && BL().x < 34 && same(PS().mini.goals, [1, 1]), [BL(), PS().mini.goals]);
    // (against the wall only a cat could reach it there: a bar's top sheds it toward the field, BALL.tilt)
    const offL = until(() => BL().x > 48 + 11, 150);
    P.ball(226, 150, 0, 1); until(() => BL().rest, 200);
    const offR = until(() => BL().x < 208 - 11, 150);
    ok('ball: ... and it rolls off the crossbar toward the field (left and right, within 2.5 s), still no goal', offL >= 0 && offR >= 0 && same(PS().mini.goals, [1, 1]), [offL, offR, BL(), PS().mini.goals]);

    // places by the team's goals: the winners share 1st (4 + 4), the losers the next place (1 + 1); 1v1 4 / 0; a draw: 4 for all
    P.goal(0); until(() => PS().mini.goalT === 0, 200); P.skip();
    let r = PS();
    ok('ball: 2 : 1 for the left team -> 왼쪽 팀 승리!, left 4 + 4, right 1 + 1 (team members share the place)', same([0, 1, 2, 3].map((s) => r.pts[s]), [4, 1, 1, 4]) && same([0, 1, 2, 3].map((s) => r.last[s]), [1, 3, 3, 1]) && G.banner.main === P.tx().winL, [r.pts, r.last, G.banner && G.banner.main]);
    party(['duck', 'cat', 'frog', 'capy'], { plan: ['ball'] }); toPlaying(); P.skip();
    r = PS();
    ok('ball: 0 : 0 -> 무승부!, everyone shares 1st (4 each)', [0, 1, 2, 3].every((s) => r.pts[s] === 4 && r.last[s] === 1) && G.banner.main === P.tx().draw, [r.pts, G.banner && G.banner.main]);
    party(withNicks(['duck', 'cat']), { plan: ['ball'] });
    c = P.card();
    ok('ball: 1v1 - one each (slot 0 left), the card says 왼쪽: 방장 / 오른쪽: 까삐', same(PS().mini.team, { 0: 0, 1: 1 }) && same(c.teams, ['왼쪽: 방장', '오른쪽: 까삐']), [PS().mini.team, c.teams]);
    toPlaying(); kicked(); P.goal(1); until(() => PS().mini.goalT === 0, 200); P.skip();
    r = PS();
    ok('ball: 1v1 0 : 1 -> 오른쪽 팀 승리!, 4 / 0', r.pts[1] === 4 && r.pts[0] === 0 && G.banner.main === P.tx().winR, [r.pts, G.banner && G.banner.main]);

    // teams by the standing before the 판: 1st + 4th left, 2nd + 3rd right
    party(['duck', 'cat', 'frog', 'capy'], { plan: ['crown', 'ball'] }); toPlaying();
    P.crown(2); step(120); P.crown(1); step(60); P.crown(3); step(20); P.skip();
    const st = PS();
    until(() => G.mode === 'card', 400);
    ok('ball: (setup) after a crown 판 the standing is 2, 1, 3, 0', same([2, 1, 3, 0].map((s) => st.last[s]), [1, 2, 3, 4]), st.last);
    ok('ball: teams by the standing - 1st (2) + 4th (0) left, 2nd (1) + 3rd (3) right', same(PS().mini.team, { 0: 0, 1: 1, 2: 0, 3: 1 }), PS().mini.team);

    // 60 s of random kicks (seeded): bodies thrown at it, bubbles at it - never out of the field, never NaN, never wrapped
    party(['penguin', 'otter', 'capy', 'cat'], { plan: ['ball'] }); toPlaying(); kicked();
    let sd = 4242;
    const rnd = () => ((sd = (sd * 1103515245 + 12345) >>> 0) / 4294967296);
    const bad = []; let prev = Object.assign({}, BL()), goals = 0, frames = 0, top = 0;
    for (let f = 0; f < 3600 && G.mode === 'playing'; f++) {
      const b = BL();
      if (f % 6 === 0) for (const p of G.players) {
        if (p.trap) continue;
        p.x = Math.max(14, Math.min(226, b.x - 8 + (rnd() - 0.5) * 44)); p.y = Math.max(24, Math.min(200, b.y - 8 + (rnd() - 0.5) * 36));
        p.vx = (rnd() - 0.5) * 7; p.vy = (rnd() - 0.5) * 7; p.invuln = 60;
      }
      if (f % 13 === 0) P.shot(G.players[(f / 13 | 0) % 4].slot, Math.max(16, Math.min(224, b.x - 8 + (rnd() - 0.5) * 50)), Math.max(24, Math.min(206, b.y - 8 + (rnd() - 0.5) * 40)), rnd() < 0.5 ? -1 : 1);
      if (f % 211 === 0) { if ((f / 211) % 3 === 2) P.ball(38, 200, -3, 0); else P.ball(30 + rnd() * 196, 40 + rnd() * 160, (rnd() - 0.5) * 10, (rnd() - 0.5) * 10); }
      step(1); frames++;
      const q = BL(), m = PS().mini;
      if (![q.x, q.y, q.vx, q.vy].every(Number.isFinite)) bad.push(['nan', f, q]);
      if (q.x < 27 - 1e-6 || q.x > 229 + 1e-6 || q.y < 35 - 1e-6 || q.y > 205 + 1e-6) bad.push(['out', f, q]);
      if (m.goalT === 0 && q.kick === 0 && prev.kick === 0 && f % 211 !== 0 && Math.hypot(q.x - prev.x, q.y - prev.y) > 40) bad.push(['jump', f, prev, q]);
      if (Math.hypot(q.vx, q.vy) > K.maxV + 1e-6) bad.push(['fast', f, q]);
      top = Math.max(top, Math.hypot(q.vx, q.vy));
      prev = Object.assign({}, q); goals = m.goals[0] + m.goals[1];
      if (bad.length > 3) break;
    }
    info('random kicks: ' + frames + ' frames, ' + goals + ' goals, top speed ' + top.toFixed(2) + ', kn ' + PS().mini.kn);
    ok('ball: 60 s of random kicks (seeded) - never out of the field, never NaN, never wrapped, never past BALL.maxV; some goals', !bad.length && frames >= 3000 && goals >= 1, bad.slice(0, 3));
    ok('ball: ... and no orphan prison or stuck trap after its kickoffs', G.bubbles.every((b) => b.kind !== 'player' || (b.victim && b.victim.trap && b.victim.trap.b === b)));

    // leavers: one leaving during a 축구 card (4 -> 3) - that 판 is drawn again (no 축구 for 3) and its card starts over;
    // one leaving mid-축구 (4 -> 3): it plays on short-handed, the team keeps its member
    party(withNicks(['duck', 'cat', 'frog', 'capy']), { plan: ['water', 'ball', 'crown'] });
    toPlaying(); P.skip(); until(() => G.mode === 'card', 400);
    step(40);
    ok('leavers: (setup) the 2nd card is 거품 축구 with its team line', PS().mini.id === 'ball' && P.card().team && PS().t >= 40, [PS().mini.id, PS().t]);
    P.drop(3);
    c = P.card();
    ok('leavers: one leaves during the 축구 card (4 -> 3) - that 판 is drawn again (왕관 뺏기, no team line), its card starts over, the 3rd fits 3 too',
      G.mode === 'card' && PS().plan[1] === 'crown' && PS().plan[2] === 'water' && PS().mini.id === 'crown' && PS().t === 0 && c.name === '왕관 뺏기' && !c.team && c.round === '2판 / 3판', [PS().plan, PS().mini.id, PS().t, c]);
    party(withNicks(['duck', 'cat', 'frog', 'capy']), { plan: ['ball', 'crown'] });
    toPlaying(); kicked(); P.drop(2);
    ok('leavers: one leaves mid-축구 (4 -> 3) - it plays on (the team keeps its member), the 판 after it still fits', G.mode === 'playing' && PS().mini.id === 'ball' && same(PS().mini.team, { 0: 0, 1: 1, 2: 1, 3: 0 }) && G.players.length === 3 && same(PS().plan, ['ball', 'crown']), [G.mode, PS().mini.team, PS().plan]);
    P.goal(1); until(() => PS().mini.goalT === 0, 200);
    ok('leavers: ... the kickoff puts the short-handed team on its first spot', pl(1).x === sx(20) && pl(0).x === sx(11) && pl(3).x === sx(7));
    P.skip();
    ok('leavers: ... places by the team\'s goals (n0 4: the lone winner 4, the losers 2 + 2)', PS().pts[1] === 4 && PS().pts[0] === 2 && PS().pts[3] === 2, PS().pts);
    // a whole team gone (4 -> 3 -> 2, both of the right team): nobody to play against - the 판 ends early (PARTY_F.early),
    // the team left wins it even from behind (the line agrees with the places: both 1st, 4 each)
    party(withNicks(['duck', 'cat', 'frog', 'capy']), { plan: ['ball', 'crown'] });
    toPlaying(); kicked(); P.goal(1); until(() => PS().mini.goalT === 0, 200);
    P.drop(2); step(5);
    ok('leavers: (setup) one of the right team gone - still playing', G.mode === 'playing' && PS().mini.endAt < 0, [G.mode, PS().mini.endAt]);
    P.drop(1);
    const endIn = until(() => G.mode === 'result', 120);
    ok('leavers: the right team all gone -> the 판 ends early (PARTY_F.early), 왼쪽 팀 승리! from 0 : 1, the two left 1st with 4 each', endIn >= P.consts().PARTY_F.early - 2 && endIn <= P.consts().PARTY_F.early + 2 && G.banner && G.banner.main === P.tx().winL && PS().pts[0] === 4 && PS().pts[3] === 4 && PS().last[0] === 1 && PS().last[3] === 1,
      [endIn, G.banner && G.banner.main, PS().pts, PS().last]);
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
    ok('flow: a 4-player 3판 party plays each of the three games once', plan.length === 3 && new Set(plan).size === 3 && plan.includes('ball'), plan);
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
    try { for (const plan of [['water'], ['crown'], ['ball']]) { party(['duck', 'cat', 'frog', 'otter'], { plan }); for (let f = 0; f < 900; f++) { step(1); if (G.mode === 'playing' && PS().mini.t === 300) P.skip(); } } } catch (e) { threw = e.message; }
    ok('HUD: every phase of the three games renders without an exception', !threw, threw);
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
    for (const id of ['water', 'crown', 'ball']) {
      party(longNicks(), { plan: [id === 'water' ? 'crown' : 'water', id] });
      toPlaying(); P.skip(); until(() => G.mode === 'card', 400);   // (the 2nd card: the board has +N and points)
      if (id === 'ball') P.fill(0);                                  // (축구: with my own side line, as an online screen)
      await sleep(120);
      const card = document.querySelector('.pg-party-card'), m = measure(label + ' ' + id + ' card', card), c = P.card();
      ok(label + ' ' + id + ': the how-to on one line, the keys on one line', lines($('pg-party-how')) === 1 && lines($('pg-party-keys')) === 1, [lines($('pg-party-how')), lines($('pg-party-keys'))]);
      if (wantRule !== undefined) ok(label + ' ' + id + ': the rule line ' + (wantRule ? 'shown' : 'hidden (a short screen)'), c.ruleShown === wantRule, [c.ruleShown, m.em]);
      ok(label + ' ' + id + ': each 12-syllable nick ends in an ellipsis inside its row (no row wider than the board)', [...$('pg-party-board').children].every((li) => li.scrollWidth <= li.clientWidth + 1));
      if (id === 'ball') {
        const tl = $('pg-party-team'), sides = [...tl.querySelectorAll('.pg-party-side')];
        const row = tl.querySelector('.pg-party-teams'), kids = [...row.children], cut = sides.filter((e) => e.scrollWidth > e.clientWidth + 1).length;
        ok(label + ' ball: the team line - both teams on one row (no overflow: a long half ends in an ellipsis), my side on the next line', c.team && c.mine === P.tx().mineL && sides.length === 2 && kids.every((e) => e.offsetTop === kids[0].offsetTop) && row.scrollWidth <= row.clientWidth + 1 && lines(tl.querySelector('.pg-party-mine')) === 1 && tl.scrollWidth <= tl.clientWidth + 1,
          [c.teams, c.mine, kids.map((e) => e.offsetTop), row.scrollWidth, row.clientWidth, lines(tl.querySelector('.pg-party-mine'))]);
        info(label + ' ball: team line halves cut with an ellipsis: ' + cut + ' of 2');
        P.fill(-1);
      }
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
    ok('arenas: PG.PARTY_ARENAS loads (물 차는 대욕장 with its rise, 거품 축구장 with its goals / sides / ball, both closed)', ok1.length === 2 && ok1[0].key === 'water' && ok1[0].closed && ok1[0].rise && ok1[0].gapX === 128
      && ok1[1].key === 'ball' && ok1[1].closed && ok1[1].goals.length === 2 && ok1[1].sides.length === 2 && ok1[1].ball.x === 128 && /^#{32}$/.test(ok1[1].floor) && ok1[1].bar === '######....................######', ok1);
    const open = P.arenas()[0].map.slice(); open[25] = '##############...###############';
    const r = P.reload([{ key: 'water', name: 'x', theme: 1, map: open, players: [{ col: 4, row: 24 }], rise: { y0: 222, warn: 2, steps: [[5, 9, 206]] } }]);
    ok('arenas: normLevel keeps a closed map closed (a gap in its floor is closed again, no drain opened)', /^#{32}$/.test(r[0].floor) && /^#{32}$/.test(r[0].ceil) && r[0].gapX === 128, r[0]);
    const b = P.reload([null, { key: 'water', map: 'junk' }, { key: 'water', name: 'y', map: open }]);
    ok('arenas: a broken entry (or one without its rise schedule / its goals) gets the built-in closed arena of its index\'s game', b.length === 3 && [0, 2].every((k) => b[k].key === 'water' && b[k].closed && b[k].rise && b[k].rise.steps.length === 5 && /^#{32}$/.test(b[k].floor))
      && b[1].key === 'ball' && b[1].closed && b[1].goals.length === 2 && b[1].bar === '######....................######', b.map((A) => [A.name, A.key, !!A.rise, !!A.goals]));
    const nb = P.reload([PG.PARTY_ARENAS[0], { key: 'ball', name: 'z', theme: 0, map: PG.PARTY_ARENAS[1].map, goals: 'junk', sides: PG.PARTY_ARENAS[1].sides, ball: { x: 128, y: 64 } }]);
    ok('arenas: a 거품 축구장 without usable goals gets the built-in field (its crossbars, goals, sides, ball)', nb.length === 2 && nb[1].key === 'ball' && nb[1].name === '거품 축구장' && nb[1].goals[0].line === 40 && nb[1].sides[1][0].col === 20, nb[1]);
  }

  // ---------------------------------------------------------------- screenshot scenes (#shot=card|water|crown|ball|ballcard|result|podium[&s=1|2])
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
    } else if (name === 'ball') {
      party(longNicks(), { plan: ['ball'] }, 101); toPlaying(); kicked();
      put(0, 70, 200); put(3, 40, 160); put(1, 150, 200); put(2, 200, 200); P.goal(0); until(() => PS().mini.goalT === 0, 200); kicked();
      P.ball(110, 120, 1.5, -1); step(8); D.trapPlayer(2, 0); step(6);
    } else if (name === 'ballcard') { party(longNicks(), { plan: ['water', 'ball'] }, 101); toPlaying(); P.skip(); until(() => G.mode === 'card', 400); P.fill(1); step(120); }
    else if (name === 'result') { party(longNicks(), { plan: ['crown', 'water'] }, 101); toPlaying(); P.crown(1); step(200); P.skip(); step(30); }
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
    const steps = FIT_ONLY ? [fitTests] : [rotationTests, pointTests, waterTests, crownTests, ballTests, noKoTests, flowTests, coinTests, arenaTests, cardTests, fitTests, touchTests];
    for (const f of steps) {
      try { await f(); } catch (e) { fail++; log('PARTY FAIL ' + f.name + ' threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
    }
    log('PARTY DONE pass=' + pass + ' fail=' + fail);
  }
  setTimeout(run, 50);
})();
