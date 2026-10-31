// 파티 (design/party.md §13.1, design/party-polish.md §10.2): the rules, the three minigames, the flow, the coins and the
// views' fit - offline, one engine, driven frame by frame with PG.debug.step (a whole 3판 at real lengths is ~14,000
// frames: never waited out).
//   node build.js
//   node tools/run-chrome.js test-party.html party.png 900 760 120000 "PARTY DONE"
//   the views on a landscape phone (the fit part only): node tools/cdp-run.js "test-party.html#fit&touch=1" C:/Temp/bogeul/party-fit-568.png 568 320 30000 "PARTY DONE" 1
// Checks: the rotation (2 / 4 players: each of the three once in 3판; 3 players: A B A / A B A B A without 거품 축구;
// never twice in a row, a replan keeps what was played and drops 축구 for 3), the points and ties (competition ranking,
// the standings' tie-breaks, the last 판 x2 for 2 / 3 / 4 players and 2v2), 물 차오르기 v2 (the schedule - steps, surges,
// the flood - each tier going out in order, a jump over a surge, a jumper outlasting a stander in the flood, everybody
// out by 59 s, the 3 px slack, a sinking prison, a remote body judged on its own epoch, same-frame outs; 비누 방울 - spawn
// times, at most 2, 32 px apart, y on the water, the first touch, a remote one's slack, never a raft, the save once,
// the tie-break; 오리 튜브 - not out, flag 512, on the surface, slow, a small hop, plain bubbles, never caught, never
// judged; its bubble's capture; 역전 once a 판 and never from the flood), 왕관 뺏기 (it falls onto the centre stage, the
// first touch takes it, held time, a capture drops it, the dropper waits, a capy's shield keeps it, the holder is
// slower, a leaver drops it, places - 1st wearing it at time-up, a capture / a pick-up at the buzzer, the rest and a
// free crown by held time; the flights at 15 / 30 / 45 s and the gold, held time no longer doubled), 거품 축구 (the field, the teams by
// standing, the kickoff, body pushes, shots, a capy's slam, goals, the clock stopping for 골!, the kickoff opening every
// prison, team places; the second ball at 45 s, its goals with no freeze and a re-drop, 골든 골 and its draw, 60 s of
// random kicks), no KO in a party, the card (the splash, 준비 완료 and its timings, the auto start, a leaver), the result
// beats (their order and lengths, the host's skip), the tally (count-up, re-sort, ▲ / ▼), 마지막 판!, the 보너스상 (the
// counters, the awards, their points), the podium, leavers and the walkover, full magazines at every 시작!, 파티 한 번
// 더, the coins (every branch, through coinGive), no trophy change, the demos, the views' fit at 1x / 2x / a 568x320
// phone, the warm-up, a battle afterwards with no party left over, the HUD, the closed arenas.
// The new games (design/party-games.md §13.1, on a virtual clock - vclock - so press and draw times are exact): the
// shared machinery, 바나나우유 잡기 (milkTests), 펑! 비눗방울 (puffTests: puffL, the 66 ms rule, 만점 / the pop at L_k, the
// dip / foam, a bank and a puff of one frame in time order, the warnings, the bell, the wall-clock window, remote rows
// clamped, over at the done reports or waitF, the key, a leaver, the view, the fast window, the card), 살금살금 술래
// (sneakTests: the order, the base kit, the chant - queue, 6 f, the auto-advance, 탕! - the feint, the look's edges, the
// prisons, arrivals by stamp, 3초!, remote runners judged from fakeBody states by a monotonic, clamped rt, the 술래
// leaving, 4 rounds at their caps, the key, the coins, the view, the card).
//   scenes: #shot=milk|milkrev|milkdecoy|milkcard|puff|puffcard|sneak|sneakchant|sneakcard (&s=0: the page's own layout, a phone)
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
  let D, G, P, K;
  const PS = () => P.state();
  const pl = (slot) => G.players.find((q) => q.slot === slot);
  const step = (n) => D.step(n);
  // step until pred() (at most max frames); returns the frames it took or -1
  function until(pred, max) { for (let i = 0; i < max; i++) { if (pred()) return i; D.step(1); } return pred() ? max : -1; }
  // the card: everyone presses 준비 once it counts (P.t 12) - the card then ends at cardMin (150 f); else the auto start
  function readyAll() { until(() => G.mode !== 'card' || PS().t >= 12, 40); if (G.mode === 'card') for (const p of G.players) P.ready(p.slot); }
  const toPlaying = () => { readyAll(); return until(() => G.mode === 'playing', 1200); };
  const toCard = () => until(() => G.mode === 'card' || G.mode === 'podium', 2400);
  const beatIs = (b) => P.beat() && P.beat().b === b;
  const toBeat = (b, max) => until(() => G.mode === 'result' && beatIs(b), max || 1200);
  // a local party (all players on this screen); plan forces the order
  function party(chars, opts, seed) { D.seed(seed === undefined ? 7 : seed); D.local.party(chars, opts); }
  const put = (slot, x, y) => { const p = pl(slot); p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.onGround = false; };
  const tap = (act, slot) => { D.press(act, true, slot); step(1); D.press(act, false, slot); };
  // tier tops (px) of 물 차는 대욕장: floor 216, rows 21 / 17 / 13 / 9 / 5
  const TOP = (row) => 16 + row * 8;
  const T = { floor: [28, 200], r21: [60, TOP(21) - 16], r21R: [180, TOP(21) - 16], r17: [36, TOP(17) - 16], r13: [60, TOP(13) - 16], r9: [36, TOP(9) - 16], r5L: [60, TOP(5) - 16], r5R: [172, TOP(5) - 16] };
  // the first frame of the schedule at which feet at y are out (more than WATER_SLACK under the surface)
  const firstUnder = (feet, k) => { for (let f = 0; f < 3600; f++) if (feet > P.waterAt(f, k) + 3) return f; return -1; };

  // ---------------------------------------------------------------- 1. rotation (3.2)
  // (party-games 3.6, the owner's pick: one shuffled bag of every game that fits n, drawn freely - no families. Written
  // for the games this page has: K.MINI_IDS, where only 거품 축구 has a fits rule - 2 or 4 players)
  const fitIds = (n) => K.MINI_IDS.filter((id) => id !== 'ball' || n === 2 || n === 4);
  function rotationTests() {
    const bad = [], seen = { 2: new Set(), 3: new Set(), 4: new Set() };
    for (const n of [2, 3, 4]) for (const r of [3, 5]) for (let seed = 1; seed <= 300; seed++) {
      const plan = P.plan(n, r, seed), fit = fitIds(n);
      plan.forEach((id) => seen[n].add(id));
      if (plan.length !== r) bad.push(['len', n, r, seed, plan]);
      for (let i = 1; i < plan.length; i++) if (plan[i] === plan[i - 1]) bad.push(['twice', n, r, seed, plan]);
      if (plan.some((id) => !fit.includes(id))) bad.push(['id', n, r, seed, plan]);
      // (all distinct while the bag lasts: a 3판 always, a 5판 when 5 or more games fit)
      const k = Math.min(r, fit.length); if (new Set(plan.slice(0, k)).size !== k) bad.push(['distinct', n, r, seed, plan]);
    }
    ok('rotation: 2 / 3 / 4 players x 3판 / 5판 x 300 seeds - the right length, never the same game twice in a row, only games that fit (3 players never 거품 축구), all distinct while the bag lasts (3판 always, 5판 from 5 games)', !bad.length, bad.slice(0, 3));
    ok('rotation: every game that fits shows up (' + fitIds(2).length + ' for 2 / 4 players, ' + fitIds(3).length + ' for 3) - the new games are in the bag', [2, 3, 4].every((n) => seen[n].size === fitIds(n).length) && K.MINI_IDS.includes('milk'), [2, 3, 4].map((n) => [...seen[n]]));
    let firsts = new Set(); for (let s = 1; s <= 120; s++) firsts.add(P.plan(4, 3, s)[0]);
    ok('rotation: any game may come first (a shuffled bag)', firsts.size === fitIds(4).length, [...firsts]);
    // a replan from a played prefix: never a played game again while one that fits is unplayed, never twice in a row
    const rbad = [];
    for (const n of [2, 3, 4]) for (let seed = 1; seed <= 200; seed++) {
      const fit = fitIds(n), pre = P.plan(n, 2, seed + 500), out = P.plan(n, 5, seed, pre);
      if (out[0] !== pre[0] || out[1] !== pre[1] || out.length !== 5) rbad.push(['keep', n, seed, pre, out]);
      for (let i = 2; i < 5; i++) {
        const unplayed = fit.filter((id) => !out.slice(0, i).includes(id));
        if (unplayed.length && !unplayed.includes(out[i])) rbad.push(['again', n, seed, out]);
        if (out[i] === out[i - 1]) rbad.push(['twice', n, seed, out]);
      }
    }
    ok('rotation: a replan keeps the 판 already played and never brings a played game back while another that fits is unplayed (5판, 2 / 3 / 4 players x 200)', !rbad.length, rbad.slice(0, 3));
    const rb = P.plan(3, 3, 9, ['water']);
    ok('rotation: a replan for 3 players (4 -> 3 before a 거품 축구) keeps the 판 played and plans no 축구, no 물 again', rb[0] === 'water' && !rb.includes('ball') && rb[1] !== 'water' && rb[2] !== 'water' && rb[2] !== rb[1], rb);
    // with fewer games in the bag (the cut line: a game left out) no game twice in a row either - a 3-player 5판 of 3
    // games repeats some, never back to back
    const tw = [];
    for (let seed = 1; seed <= 300; seed++) { const pl5 = P.plan(3, 5, seed); for (let i = 1; i < 5; i++) if (pl5[i] === pl5[i - 1]) tw.push(pl5); }
    ok('rotation: never twice in a row across a bag refill (3 players, 5판 x 300)', !tw.length, tw.slice(0, 2));
    ok('rotation: a forced list (debug) is kept as it is when every game fits, else none', same(P.force(['milk', 'water']), ['milk', 'water']) && P.force(null) === null);
  }

  // ---------------------------------------------------------------- 2. points and ties (0, 3.3; polish 3.7)
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
    // the last 판 pays PARTY_LAST_X (a 1-판 plan's only 판 is its last): 2 / 3 / 4 players by 왕관 held time (the crown
    // put back free at the gather before time-up: nobody wears it, so every place is by held time)
    K = P.consts();
    const crownPts = (chars, order) => {
      party(chars, { plan: ['crown'] }); toPlaying();
      order.forEach((s, i) => { P.crown(s); step(60 * (order.length - i)); });
      P.crown(-1); P.skip(); return chars.map((c, s) => PS().pts[s]);
    };
    ok('x2: PARTY_LAST_X 2 and AWARD_PTS 2', K.PARTY_LAST_X === 2 && K.AWARD_PTS === 2, [K.PARTY_LAST_X, K.AWARD_PTS]);
    const p2 = crownPts(['duck', 'cat'], [1, 0]), p3 = crownPts(['duck', 'cat', 'frog'], [2, 0, 1]), p4 = crownPts(['duck', 'cat', 'frog', 'otter'], [3, 1, 2, 0]);
    ok('x2: the last 판 pays double - 2 players 8 / 0, 3 players 8 / 4 / 0, 4 players 8 / 4 / 2 / 0', same(p2, [0, 8]) && same(p3, [4, 0, 8]) && same(p4, [0, 4, 2, 8]), [p2, p3, p4]);
    party(['duck', 'cat', 'frog', 'capy'], { plan: ['ball'] }); toPlaying(); P.goal(0); until(() => PS().mini.goalT === 0, 200); P.skip();
    const b4 = [0, 1, 2, 3].map((s) => PS().pts[s]);
    party(['duck', 'cat', 'frog', 'capy'], { plan: ['ball'] }); toPlaying(); P.skip();
    const d4 = [0, 1, 2, 3].map((s) => PS().pts[s]);
    ok('x2: a 2v2 축구 last 판 pays 8 / 8 / 2 / 2, a draw 8 to everyone', same(b4, [8, 2, 2, 8]) && same(d4, [8, 8, 8, 8]), [b4, d4]);
    // not the last 판: no doubling; a replan keeps the doubling on the last index
    party(['duck', 'cat', 'frog', 'capy'], { plan: ['crown', 'ball', 'water'] }); toPlaying(); P.crown(0); step(60); P.skip();
    const first = [0, 1, 2, 3].map((s) => PS().pts[s]);
    toCard(); step(20); P.drop(3);
    ok('x2: the first 판 of three pays the table (4 / 2 / 2 / 2: three share 2nd); a replan (4 -> 3, no 축구) keeps x1 on 2판 and x2 on the last', same(first, [4, 2, 2, 2]) && PS().plan[1] !== 'ball' && PS().x === 1, [first, PS().plan, PS().x]);
    toPlaying(); P.skip(); toCard(); readyAll(); until(() => G.mode === 'countdown', 300);
    ok('x2: ... the last card says 마지막 판! with its 점수 2배! chip', PS().i === 2 && PS().x === 2, [PS().i, PS().x]);
  }

  // ---------------------------------------------------------------- 3. 물 차오르기 v2 (4.1)
  function waterTests() {
    P.soapsOff(true);
    const A = P.arenas()[0], R = A && A.rise;
    ok('water: 물 차는 대욕장 is closed (no drain: floor and ceiling all blocks, gapX mid-screen) with its v2 schedule (5 steps, 2 surges, the flood, 7 soaps, 2 revive spots)', A && A.key === 'water' && A.closed === true && /^#{32}$/.test(A.map[25]) && /^#{32}$/.test(A.map[0]) && A.gapX === 128 && R && R.steps.length === 5 && R.surges.length === 2 && R.flood && R.soaps.length === 7 && R.revive.length === 2, A && [A.map[25], A.gapX, R]);
    const w = (s) => Math.round(P.waterAt(s * 60) * 100) / 100;
    ok('water: waterAt - y0 222 to 4 s, linear inside a step, flat between, the steps 206 / 174 / 142 / 110 / 78', w(0) === 222 && w(4) === 222 && w(5.5) === 214 && w(7) === 206 && w(10) === 206 && w(19.5) === 190 && w(21) === 174 && w(34) === 142 && w(46) === 110 && w(49) === 94 && w(51) === 78, [w(0), w(5.5), w(7), w(19.5), w(46), w(49), w(51)]);
    ok('water: the surges - a half sine up from the level and back (206 -> 178 at 13.8 s -> 206; 142 -> 114 at 37.8 s)', w(13) === 206 && w(13.8) === 178 && w(14.6) === 206 && w(13.4) < 190 && w(37) === 142 && w(37.8) === 114 && w(38.6) === 142, [w(13), w(13.4), w(13.8), w(14.6), w(37.8)]);
    ok('water: the flood after the last step - 78 at 52 s, 56 at 55.5 s, 34 from 59 s', w(52) === 78 && w(55.5) === 56 && w(59) === 34 && w(60) === 34, [w(52), w(55.5), w(59), w(60)]);
    ok('water: a fast party runs the same schedule in 12 s (k = 0.2)', Math.abs(P.waterAt(7 * 60 * 0.2, 0.2) - 206) < 0.01 && Math.abs(P.waterAt(13.8 * 60 * 0.2, 0.2) - 178) < 0.01);

    // each tier in turn: the floor in step 1, row 21 in the first surge, row 17 in step 3 - the 3rd out leaves one dry:
    // the 판 ends 1 s later
    party(['duck', 'cat', 'frog', 'capy'], { plan: ['water'] });
    ok('water: a local party opens on its card, over the closed arena (60 s)', G.mode === 'card' && PS().kind === 'p' && PS().mini.id === 'water' && PS().total === 3600, [G.mode, PS().total]);
    toPlaying();
    put(0, ...T.floor); put(1, ...T.r21); put(2, ...T.r17); put(3, ...T.r13);
    const outAt = {};
    for (let f = 0; f < 3000 && G.mode === 'playing'; f++) { step(1); for (const p of G.players) if (p.raft && outAt[p.slot] === undefined) outAt[p.slot] = PS().mini.t; }
    const want = { 0: firstUnder(216), 1: firstUnder(184), 2: firstUnder(152) };
    info('out frames ' + JSON.stringify(outAt) + ' (expected ~' + JSON.stringify(want) + ')');
    ok('water: the floor goes under in step 1 (~5.7 s), row 21 in the first surge (~13.6 s), row 17 in step 3 (~32.3 s)', [0, 1, 2].every((s) => Math.abs(outAt[s] - want[s]) <= 2) && want[1] > 13 * 60 && want[1] < 14.6 * 60 && outAt[3] === undefined, outAt);
    const res = PS();
    ok('water: the last one dry ends it PARTY_F.early (60 f) after the 3rd out', G.mode === 'result' && Math.abs(res.mini.t - (outAt[2] + 60)) <= 1, [G.mode, res.mini.t]);
    ok('water: places - the later out the better: row 13 1st, row 17 2nd, row 21 3rd, the floor last (x2: 8 / 4 / 2 / 0)', same([0, 1, 2, 3].map((s) => res.pts[s]), [0, 2, 4, 8]) && same([0, 1, 2, 3].map((s) => res.last[s]), [4, 3, 2, 1]), [res.pts, res.last]);
    ok('water: p.score is the party points (the HUD, the podium)', G.players.every((p) => p.score === res.pts[p.slot]));

    // the top shelves stay dry until the flood; row 9 goes under in step 5; standing on the shelves both go out on the
    // same frame (~56 s): they share 1st; everybody is out by 59 s
    party(['duck', 'penguin', 'otter'], { plan: ['water'] });
    toPlaying();
    put(0, ...T.r5L); put(1, ...T.r5R); put(2, ...T.r9);
    const o3 = {};
    for (let f = 0; f < 3700 && G.mode === 'playing'; f++) { step(1); for (const p of G.players) if (p.raft && o3[p.slot] === undefined) o3[p.slot] = PS().mini.t; }
    const r2 = PS();
    info('flood outs ' + JSON.stringify(o3) + ' (row 9 ~' + firstUnder(88) + ', shelves ~' + firstUnder(56) + ')');
    ok('water: row 9 goes under in the last step (~49.6 s); the two shelves only in the 마지막 물결 (~56 s), on the same frame', Math.abs(o3[2] - firstUnder(88)) <= 2 && Math.abs(o3[0] - firstUnder(56)) <= 2 && o3[0] === o3[1], o3);
    ok('water: everybody is out by 59 s - the 판 ends a second after the last one', G.mode === 'result' && r2.mini.t < 59 * 60 + 60 && Math.abs(r2.mini.t - (o3[0] + 60)) <= 1, [G.mode, r2.mini.t]);
    ok('water: the two out last share 1st (8 + 8), row 9 is 3rd (3 players: 0)', same([r2.last[0], r2.last[1], r2.last[2]], [1, 1, 3]) && same([r2.pts[0], r2.pts[1], r2.pts[2]], [8, 8, 0]), r2);

    // a jump timed over a surge stays dry, a standing one goes out (perks off: plain jumps)
    party(['duck', 'duck', 'cat'], { plan: ['water'], perks: false });
    toPlaying(); put(0, ...T.r21); put(1, ...T.r21R); put(2, ...T.r5L); step(2);
    let pk = 13 * 60, lo = 999; for (let f = 13 * 60; f < 14.6 * 60; f++) { const y = P.waterAt(f); if (y < lo) { lo = y; pk = f; } }
    until(() => PS().mini.t >= pk - 18, 1200); tap('jump', 0);
    until(() => PS().mini.t >= 14.6 * 60 + 30, 200);
    ok('water: a jump timed over the surge (18 f before its peak) stays dry; the one standing beside goes out', !pl(0).raft && pl(1).raft && PS().mini.wl === 206, [pl(0).raft, pl(1).raft, PS().mini.wl]);

    // the flood: a jumping animal outlasts a standing one on the shelves
    party(['duck', 'duck'], { plan: ['water'], perks: false });
    toPlaying(); put(0, ...T.r5L); put(1, ...T.r5R); step(2);
    const fu = firstUnder(56); until(() => PS().mini.t >= fu - 8, 3600);
    tap('jump', 0);
    let jOut = -1, sOut = -1;
    for (let f = 0; f < 200 && G.mode === 'playing'; f++) { step(1); if (pl(0).raft && jOut < 0) jOut = PS().mini.t; if (pl(1).raft && sOut < 0) sOut = PS().mini.t; }
    ok('water: in the 마지막 물결 a jump just before buys time - the jumper goes under after the stander (and the 판 still ends)', sOut > 0 && jOut > sOut, [jOut, sOut]);

    // the 3 px slack (party.level forces the surface): feet 2 px under -> dry, 4 px -> out; the duck sinks like anyone
    party(['duck', 'cat'], { plan: ['water'] });
    toPlaying();
    put(0, ...T.floor); put(1, ...T.r5L); step(2);
    P.level(214); step(2);
    const dry = !pl(0).raft;
    P.level(212); step(1);
    ok('water: WATER_SLACK - feet 2 px under the surface stay dry, 4 px under is out (the duck does not float: no tile water)', dry && pl(0).raft && !pl(0).out, [dry, pl(0).raft]);
    P.level(null);
    ok('water: the last one dry (1 of 2) ends the 판 60 f later; the one left is 1st', until(() => G.mode === 'result', 80) >= 50 && PS().last[1] === 1 && PS().last[0] === 2, [G.mode, PS().last]);

    // a trapped animal sinks with its prison (MINI_SINK) and is judged by it: carried 3 px under the surface it is out
    // (a raft) with no release first - no hop, no blink, no frame of its own physics
    party(['duck', 'cat', 'frog'], { plan: ['water'] });
    toPlaying();
    put(0, ...T.r21); put(1, ...T.r5L); put(2, ...T.r17);
    until(() => PS().mini.t >= 8 * 60, 1000);       // (step 1 done: the surface rests at 206 until 13 s)
    ok('water: (setup) the surface rests at 206 after step 1, row 21 and row 17 are dry', Math.abs(PS().mini.wl - 206) < 0.01 && !pl(0).raft && !pl(2).raft, PS().mini.wl);
    D.trapPlayer(0, 1); D.trapPlayer(2, 1);
    const y0 = pl(0).y; step(10); const sink = pl(0).y - y0;
    ok('water: a prison sinks MINI_SINK (0.3 px) a frame - no drift to the gather', Math.abs(sink - 3) < 0.6, sink);
    let freeFrame = false, outF = -1;
    for (let f = 0; f < 100 && outF < 0; f++) { step(1); const p = pl(0); if (p.raft) outF = f; else if (!p.trap) freeFrame = true; }
    ok('water: carried 3 px under the surface (row 21, ~84 f) it is out straight from the prison - never free for a frame', outF >= 0 && !freeFrame && !pl(0).trap, [outF, freeFrame]);
    ok('water: a prison on the tier two above the water lets go dry (row 17: 27 px of sinking in 90 f)', until(() => !pl(2).trap, 40) >= 0 && !pl(2).raft && pl(2).y + 16 < PS().mini.wl, [pl(2).raft, pl(2).y]);

    // a remote body: judged only on a reported state of its current epoch; one stale for longer than REWIND is judged anyway
    party(['duck', 'cat', 'frog'], { plan: ['water'] });
    toPlaying();
    put(1, ...T.r5L); put(2, ...T.r5R); step(2);
    put(0, 28, 215); // (a copy frozen under the water level - a guest that, on its own screen, hopped clear)
    P.fakeRemote(0, { ep: pl(0).ep - 1, x: 28, y: 215 });
    P.level(150);
    const j0 = P.judge(0); step(5);
    const notYet = !pl(0).raft;
    step(30);
    ok('water: a remote body whose state is from an older epoch is not judged (the frozen copy after a release) ...', j0 === null && notYet, [j0, notYet]);
    ok('water: ... and one stale for longer than REWIND (30 f) is judged anyway', pl(0).raft);
    party(['duck', 'cat'], { plan: ['water'] });
    toPlaying(); put(1, ...T.r5L); step(2);
    P.fakeRemote(0, { x: 28, y: 200 }); // (its own epoch)
    ok('water: ... a state of its own epoch is judged at once', P.judge(0) === pl(0).y);

    // same-frame outs share; a raft is an animal again for the next 판
    party(['duck', 'cat', 'frog'], { plan: ['water', 'crown'] });
    toPlaying();
    put(0, ...T.floor); put(1, 172, 200); put(2, ...T.r5L); step(2);
    P.level(190); step(1);
    ok('water: two out on the same frame (the same 비누: none) share the place (2nd and 2nd)', pl(0).raft && pl(1).raft && new Map(P.places()).get(0) === 2 && new Map(P.places()).get(1) === 2, P.places());
    until(() => G.mode === 'result', 100);
    toCard();
    ok('water: the rafts are animals again (not rafts, at their spawns) for the next 판', G.mode === 'card' && G.players.every((p) => !p.raft && !p.out) && PS().mini.id === 'crown', [G.mode, G.players.map((p) => p.raft)]);

    // my own 탈락 line is this screen's only: the snapshot leaves it out and keeps sending the shared banner it covers
    // here (else the host's own out would cut that banner on every guest); once that one ends, nothing
    party(['duck', 'cat'], { plan: ['water'] });
    toPlaying();
    put(0, ...T.r5L); put(1, ...T.r5R);
    const warnAt = until(() => G.banner && G.banner.main === '물이 차올라요!', 400);
    const shared = P.snapBn(), mine = P.myLine('탈락! 2등', P.tx().raftMe), under = P.snapBn();
    ok('my line: shown here, marked local; the snapshot still carries the shared warning under it', warnAt >= 0 && !!shared && mine && mine.loc && G.banner.main === '탈락! 2등'
      && !!under && under[0] === shared[0] && under[1] === '물이 차올라요!', [warnAt, shared, mine, under]);
    step(110);
    ok('my line: ... and once the shared one is over, the snapshot sends no banner (never mine)', G.banner && G.banner.loc && G.frame < G.banner.end && P.snapBn() === null, [G.banner, P.snapBn()]);
    // the warnings: a surge's 큰 물결! / 점프로 피해요! SURGE_WARN before it, the flood's 마지막 물결! / 계속 점프! 2 s before
    party(['duck', 'cat'], { plan: ['water'] });
    toPlaying(); put(0, ...T.r5L); put(1, ...T.r5R);
    const sw = until(() => G.banner && G.banner.main === P.tx().surge1, 1200), swT = PS().mini.t;
    ok('water: 큰 물결! / 점프로 피해요! 1.5 s before the first surge', sw >= 0 && swT === Math.round((13 - K.SURGE_WARN) * 60) && G.banner.sub === P.tx().surge2, [swT, G.banner]);
    const fw = until(() => G.banner && G.banner.main === '마지막 물결!', 3000), fwT = PS().mini.t;
    ok('water: 마지막 물결! / 계속 점프! 2 s before the flood (the last step says 물이 차올라요!)', fw >= 0 && fwT === 50 * 60 && G.banner.sub === P.tx().flood2, [fwT, G.banner]);
    P.soapsOff(false);
  }

  // ---------------------------------------------------------------- 3b. 비누 방울 (4.1.3)
  function soapTests() {
    P.soapsOff(false);
    party(['duck', 'cat'], { plan: ['water'] }, 21);
    toPlaying(); put(0, ...T.r5L); put(1, ...T.r5R);
    const seen = [], counts = []; let gapBad = false, maxN = 0;
    for (let f = 0; f < 50 * 60 && G.mode === 'playing'; f++) {
      step(1); const m = PS().mini; maxN = Math.max(maxN, m.soaps.length);
      for (const q of m.soaps) if (!seen.some((s) => s.id === q.id)) seen.push(Object.assign({ at: m.t, n: m.soaps.length }, q));
      for (const a of m.soaps) for (const b of m.soaps) if (a !== b && Math.abs(a.x - b.x) < K.SOAP.gap) gapBad = true;
      if (m.t === 9 * 60 + 30) counts.push(m.soaps.length);
    }
    info('soaps: ' + JSON.stringify(seen.map((q) => [q.at / 60, q.x])));
    ok('soaps: one at each rise.soaps second (3 9 15 24 28 36 46) while fewer than 2 float; never more than 2, never within 32 px', seen.length >= 6 && seen.every((q) => [3, 9, 15, 24, 28, 36, 46].includes(q.at / 60)) && maxN <= 2 && !gapBad && counts[0] === 2, [seen.length, maxN, gapBad, counts]);
    // y on the water; the first touch takes it (got, a save); a raft never; a remote body with 4 px slack
    party(['duck', 'cat', 'frog'], { plan: ['water'] }, 3);
    P.soapsOff(true); toPlaying(); put(0, ...T.r5L); put(1, ...T.r5R); put(2, ...T.r9); step(2);
    P.soap(120); const sy = P.soapY(0), wl = PS().mini.wl;
    ok('soaps: it floats SOAP.hover (20) px over the surface, bobbing at most 2 px', Math.abs(sy - (wl - 20)) <= 2.01, [sy, wl]);
    put(2, 120 - 4, sy - 8); step(1);
    ok('soaps: the first touch takes it - 비누! (got 1, a save held), it is gone', (PS().mini.got[2] | 0) === 1 && PS().mini.sh[2] === 1 && PS().mini.soaps.length === 0, PS().mini);
    P.soap(60); const y2 = P.soapY(0);
    P.fakeRemote(1); put(1, 60 + 8 + 3 - 2, y2 - 8); step(1);  // (its body box 3 px right of the soap's: within the slack)
    ok('soaps: a remote body touches it with SOAP.slack (4 px)', (PS().mini.got[1] | 0) === 1, PS().mini.got);
    P.soap(200); const y3 = P.soapY(0);
    put(1, 200 + 8 + 6 - 2, y3 - 8); step(1);
    ok('soaps: ... and not from 6 px away', PS().mini.soaps.length === 1 && (PS().mini.got[1] | 0) === 1, PS().mini);
    P.raft(0); const r0 = pl(0); r0.local = false; put(0, 200 - 2, y3 - 10); step(1);
    ok('soaps: a 오리 튜브 never takes one', PS().mini.soaps.length === 1 && !(PS().mini.got[0] | 0), PS().mini);
    // the save: no out, the hop out of the water, the grace, only once; a prison bursts; a remote one's epoch
    party(['duck', 'cat', 'frog'], { plan: ['water'] });
    P.soapsOff(true); toPlaying(); put(0, ...T.floor); put(1, ...T.r5L); put(2, ...T.r5R); step(2);
    P.soap(28); const ys = P.soapY(0); put(0, 28, ys - 8); step(1); put(0, ...T.floor); step(2);
    ok('soaps: (setup) a save held', PS().mini.sh[0] === 1);
    D.trapPlayer(0, 1);
    const ep0 = pl(0).ep; P.level(200); step(1);
    const p0 = pl(0);
    ok('soaps: the water reaching a held save - not out: its prison bursts, it hops out (22 px over the surface, vy up), a new epoch, 살았다!', !p0.raft && !p0.trap && p0.y <= 200 - 22 + 0.01 && p0.vy < 0 && p0.ep > ep0 && !PS().mini.sh[0] && G.words.some((q) => q.txt === P.tx().saved), [p0.raft, p0.y, p0.vy, p0.ep, ep0]);
    P.level(140); step(30);
    ok('soaps: ... not judged during SOAP.grace (45 f)', !pl(0).raft);
    step(20);
    ok('soaps: ... then judged again - no second save from the same soap', pl(0).raft, [pl(0).raft, PS().mini.sh]);
    // 비누 breaks a same-frame tie; equal 비누 share
    party(['duck', 'cat', 'frog', 'otter'], { plan: ['water'] });
    P.soapsOff(true); toPlaying(); put(0, ...T.floor); put(1, 172, 200); put(2, 100, 200); put(3, ...T.r5L); step(2);
    G.mini.got[0] = 2; G.mini.got[2] = 2; P.level(190); step(1);
    const pls = new Map(P.places());
    ok('soaps: out on the same frame, more 비누 is the better place; equal 비누 share it (2nd, 2nd, 4th)', pls.get(3) === 1 && pls.get(0) === 2 && pls.get(2) === 2 && pls.get(1) === 4, [...pls]);
    P.soapsOff(false);
  }

  // ---------------------------------------------------------------- 3c. 오리 튜브 and 역전 (4.1.4)
  function raftTests() {
    party(['otter', 'cat', 'frog'], { plan: ['water'] });
    P.soapsOff(true); toPlaying(); put(0, ...T.floor); put(1, ...T.r5L); put(2, ...T.r5R); step(2);
    until(() => pl(0).raft, 600);
    const p = pl(0), row = P.prow(0);
    ok('raft: an out animal becomes a 오리 튜브 - not out, alive and free, flag 512 in its P row, its out entry kept', p.raft && !p.out && row && (row[7] & 512) && (row[7] & 64) && PS().mini.outs.some((o) => o[0] === 0), [p.raft, p.out, row && row[7]]);
    step(5);
    ok('raft: it rides the surface (its top at wl - 12)', Math.abs(p.y - (PS().mini.wl - K.RAFT.dy)) < 0.6, [p.y, PS().mini.wl]);
    const ys = []; for (let f = 0; f < 60; f++) { step(1); ys.push(Math.abs(p.y - (PS().mini.wl - K.RAFT.dy))); }
    ok('raft: ... as the water rises (step 1)', Math.max(...ys) < 0.6, Math.max(...ys));
    D.press('right', true, 0); step(10); const vx = p.vx; D.press('right', false, 0); step(1);
    ok('raft: it walks at RAFT.walk (0.75x)', Math.abs(vx - 1.25 * K.RAFT.walk) < 0.01, vx);
    const base = p.y; tap('jump', 0); let top = base; for (let f = 0; f < 40; f++) { step(1); top = Math.min(top, p.y); }
    ok('raft: a jump is a small hop (~20 px) back down to the surface line', base - top > 16 && base - top < 24 && Math.abs(p.y - (PS().mini.wl - K.RAFT.dy)) < 0.6, [base - top]);
    const n0 = G.bubbles.filter((b) => b.owner === 0).length; tap('shoot', 0); step(2);
    const mine = G.bubbles.filter((b) => b.owner === 0);
    ok('raft: it blows one plain bubble (an otter: no volley)', mine.length === n0 + 1, [n0, mine.length]);
    for (let k = 0; k < 40; k++) step(1);
    const sh = P.shot(1, p.x - 16, p.y, 1); step(3);
    ok('raft: it cannot be caught (a rival\'s shot through it)', !p.trap && p.raft, [p.trap, sh.state]);
    const outs0 = JSON.stringify(PS().mini.outs); P.level(p.y - 40); step(5); P.level(null);
    ok('raft: it is never judged by the water again (no second out)', p.raft && JSON.stringify(PS().mini.outs) === outs0);
    // its bubble traps a dry animal (최다 가두기상 counts it); that animal drowning in its prison -> 역전
    party(['duck', 'cat', 'frog'], { plan: ['water'] });
    P.soapsOff(true); toPlaying(); put(0, ...T.r5L); put(1, ...T.floor); put(2, ...T.r5R); step(2);
    P.raft(1); step(2); pl(0).invuln = 0; pl(2).invuln = 0;
    put(2, 120, 180); step(1);
    const caps0 = P.counts().caps[1] | 0;
    D.trapPlayer(2, 1);
    ok('raft: (setup) a raft\'s bubble holds a dry rival (caps +1 for the rafter)', !!pl(2).trap && (P.counts().caps[1] | 0) === caps0 + 1, P.counts());
    P.level(pl(2).y + 6); step(2); P.level(null);
    const r1 = pl(1), m1 = PS().mini;
    ok('역전: the rival drowns in the rafter\'s prison - the rafter is back on a top shelf (the farther one from the dry), blinking RAFT.inv, its out entry gone', !r1.raft && pl(2).raft && Math.abs(r1.y - 40) < 0.01 && (r1.x === 60 || r1.x === 180) && r1.invuln > 80 && !m1.outs.some((o) => o[0] === 1) && m1.rv[1] === 1, [r1.raft, r1.x, r1.y, r1.invuln, m1.outs, m1.rv]);
    ok('역전: ... on the shelf away from the dry animal (slot 0 on the left: the right one)', r1.x === 180, r1.x);
    ok('역전: ... 역전! over it', G.words.some((q) => q.txt === P.tx().revive));
    // once a 판: a second comeback of the same rafter does not happen
    step(100); P.raft(1); step(2); pl(0).invuln = 0; put(0, 60, 180); step(1); D.trapPlayer(0, 1); P.level(pl(0).y + 6); step(2); P.level(null);
    ok('역전: once a 판 - its second capture-drown leaves it a raft', pl(1).raft && pl(0).raft, [pl(1).raft, pl(0).raft]);
    // never from the flood's start
    party(['duck', 'cat', 'frog'], { plan: ['water'] });
    P.soapsOff(true); toPlaying(); put(0, ...T.r5L); put(1, ...T.floor); put(2, ...T.r5R); step(2);
    G.battle.left = G.battle.total - 52 * 60 - 10; P.level(222); step(2);
    P.raft(1); step(2); pl(2).invuln = 0; put(2, 120, 100); step(1); D.trapPlayer(2, 1); P.level(pl(2).y + 6); step(2); P.level(null);
    ok('역전: never from the flood\'s start (52 s)', pl(1).raft && pl(2).raft, [pl(1).raft, pl(2).raft]);
    // places by the last out frame; the podium / the next 판 clear raft
    party(['duck', 'cat'], { plan: ['water'] });
    P.soapsOff(true); toPlaying(); put(0, ...T.r5L); put(1, ...T.r5R); step(2); P.raft(1); step(2); P.skip();
    ok('raft: places - a raft is out (2nd), the dry one 1st', PS().last[0] === 1 && PS().last[1] === 2, PS().last);
    toCard();
    ok('raft: the podium stands everyone as an animal (partyFinal clears raft)', G.mode === 'podium' && G.players.every((q) => !q.raft) && D.getState().players.every((q) => !q.out), G.players.map((q) => q.raft));
    P.soapsOff(false);
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
    ok('crown: a capture drops it (free, flying out) - 떨어졌다!', cd.holder === -1 && cd.noPick === 1 && cd.vy < 0, cd);
    for (let k = 0; k < 12 && pl(1).trap; k++) D.mash(1);
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
    // a leaver holding it drops it where it was; nobody wears it at time-up -> every place by time held
    party(['duck', 'cat', 'frog'], { plan: ['crown'] });
    toPlaying(); P.crown(2); step(120); P.crown(0); step(60); P.crown(1); step(2);
    const x1 = pl(1).x; P.drop(1); step(1);
    ok('crown: a leaver holding it drops it where it was (free, near its last spot)', PS().mini.cr.holder === -1 && Math.abs(PS().mini.cr.x - x1) < 4, PS().mini.cr);
    P.skip();
    const rs = PS();
    ok('crown: nobody wears it at time-up (its holder left) -> places by time held - 2 s 1st, 1 s 2nd (n0 3, the last 판: 8 / 4), the leaver gone from the standings', rs.last[2] === 1 && rs.last[0] === 2 && rs.pts[2] === 8 && rs.pts[0] === 4 && G.players.length === 2, rs);
    // the one wearing it at time-up is 1st, over a longer holder; 2nd and on by time held
    party(['duck', 'cat', 'frog'], { plan: ['crown'] });
    toPlaying(); P.crown(2); step(300); P.crown(1); step(60); P.crown(0); step(30); P.skip();
    const rw = PS();
    ok('crown: wearing it at time-up is 1st over a longer holder (0 0.5 s over 2 5 s), then by time held (2 2nd, 1 1 s 3rd: 8 / 4 / 0)', rw.last[0] === 1 && rw.last[2] === 2 && rw.last[1] === 3 && rw.pts[0] === 8 && rw.pts[2] === 4 && rw.pts[1] === 0 && rw.mini.held[0] < rw.mini.held[2], [rw.last, rw.pts, rw.mini.held]);
    // a capture just before the buzzer (the real clock, past the gold flight): 2 held 5 s early, 1 wears it from 45 s
    const lateHolder = () => {
      party(['duck', 'cat', 'frog'], { plan: ['crown'] });
      toPlaying(); P.crown(2); step(300); P.crown(-1);
      until(() => PS().mini.t >= 45 * 60 + 2, 3000);
      P.crown(1);
    };
    lateHolder(); until(() => PS().mini.t >= 3600 - 30, 1000);
    put(2, 220, 40); step(1);
    D.trapPlayer(1, 2); const fly = PS().mini.cr;
    put(0, fly.x, fly.y); until(() => PS().mini.cr.holder === 0, 20);
    const grab = PS().mini.cr.holder; until(() => G.mode === 'result', 60);
    const rg = PS();
    ok('crown: caught 0.5 s before time-up, it flies out; whoever grabs it before the buzzer is 1st (0, under 0.5 s held), the others by time held (1 ~14.5 s 2nd, 2 5 s 3rd)', fly.holder === -1 && fly.noPick === 1 && grab === 0 && G.mode === 'result' && rg.last[0] === 1 && rg.last[1] === 2 && rg.last[2] === 3 && rg.mini.held[0] < 30, [fly, grab, rg.last, rg.mini.held]);
    lateHolder(); until(() => PS().mini.t >= 3600 - 4, 1000);
    put(0, 20, 40); put(2, 220, 40);
    D.trapPlayer(1, 2); until(() => G.mode === 'result', 20);
    const ra = PS();
    ok('crown: caught 4 frames before time-up and still flying at the buzzer -> nobody wears it: places by time held (1 1st, 2 2nd, 0 3rd)', G.mode === 'result' && ra.mini.cr.holder === -1 && !ra.mini.cr.onGround && ra.last[1] === 1 && ra.last[2] === 2 && ra.last[0] === 3, [ra.mini.cr, ra.last, ra.mini.held]);
    // a pick-up on the very last frame (the crown free on 0 with 1 frame left): the grabber is 1st with no held time
    lateHolder(); until(() => G.battle.left <= 1, 1000);
    put(0, 20, 40); put(1, 200, 40); put(2, 220, 40);
    Object.assign(G.mini.cr, { holder: -1, x: pl(0).x, y: pl(0).y, vx: 0, vy: 0, onGround: false, noPick: -1, noUntil: 0 });
    const left1 = G.battle.left; step(1);
    const rl = PS();
    ok('crown: picked up on the very last frame -> the grabber is 1st with 0 held (0 1st, 1 ~15 s 2nd, 2 5 s 3rd)', left1 === 1 && G.mode === 'result' && rl.mini.cr.holder === 0 && (rl.mini.held[0] | 0) === 0 && rl.last[0] === 1 && rl.last[1] === 2 && rl.last[2] === 3, [left1, G.mode, rl.mini.cr, rl.last, rl.mini.held]);
    // nobody touched it: everyone shares 1st
    party(['duck', 'cat', 'frog', 'otter'], { plan: ['crown'] });
    toPlaying(); P.skip();
    ok('crown: nobody touched it -> a 4-way shared 1st (8 points each)', [0, 1, 2, 3].every((s) => PS().pts[s] === 8 && PS().last[s] === 1), PS().pts);
    // 왕관이 날아가요: at 15 / 30 / 45 s the crown leaves its holder and falls again from the gather; the 45 s one is gold
    party(['duck', 'cat', 'frog'], { plan: ['crown'] });
    toPlaying(); P.crown(1);
    until(() => PS().mini.t >= 15 * 60, 1000);
    const f1 = PS().mini;
    ok('crown: at 15 s it flies - the holder freed, the crown at the gather (nobody waits), 왕관이 날아가요!', f1.fl === 1 && f1.cr.holder === -1 && f1.cr.noPick === -1 && Math.abs(f1.cr.x - (G.gather.x - 8)) < 1 && G.banner && G.banner.main === P.tx().crownFly && !f1.gold, [f1.fl, f1.cr, G.banner && G.banner.main]);
    until(() => PS().mini.cr.onGround, 200);
    ok('crown: ... it lands on the centre stage again', PS().mini.cr.onGround && PS().mini.cr.x + 8 > 12 * 8 && PS().mini.cr.x + 8 < 20 * 8, PS().mini.cr);
    P.crown(0);
    until(() => PS().mini.t >= 30 * 60, 1000);
    ok('crown: at 30 s again (fl 2), not gold yet', PS().mini.fl === 2 && PS().mini.cr.holder === -1 && !PS().mini.gold, PS().mini);
    P.crown(2); const hb = PS().mini.held[2] | 0;
    until(() => PS().mini.t >= 45 * 60, 1000);
    const g45 = PS().mini;
    ok('crown: at 45 s the 황금 왕관 - gold, 황금 왕관! / 끝날 때 쓴 사람이 1등!', g45.fl === 3 && g45.gold === 1 && g45.cr.holder === -1 && G.banner && G.banner.main === P.tx().gold1 && G.banner.sub === P.tx().gold2 && P.tx().gold1 === '황금 왕관!' && P.tx().gold2 === '끝날 때 쓴 사람이 1등!', [g45.fl, g45.gold, G.banner]);
    ok('crown: (the 15 s before it: held 1 a frame)', (g45.held[2] | 0) - hb >= 899 && (g45.held[2] | 0) - hb <= 901, (g45.held[2] | 0) - hb);
    P.crown(1); const h0 = PS().mini.held[1] | 0; step(30);
    ok('crown: once gold, held time still counts 1 a frame (no CROWN2.goldX: no doubling)', (PS().mini.held[1] | 0) - h0 === 30 && P.consts().CROWN2.goldX === undefined, [(PS().mini.held[1] | 0) - h0, P.consts().CROWN2]);
    ok('crown: the wire carries gold (its last field)', P.mg()[9] === 1, P.mg());
    P.crown(2); step(10); P.skip();
    ok('crown: time-up with 2 wearing the gold crown - 2 is 1st over 1, who held longer; then 1 2nd, 0 3rd by time held', PS().last[2] === 1 && PS().last[1] === 2 && PS().last[0] === 3 && PS().mini.held[1] > PS().mini.held[2] && PS().mini.held[2] > PS().mini.held[0], [PS().last, PS().mini.held]);
  }

  // ---------------------------------------------------------------- 5. 거품 축구 (4.3)
  const NK = ['방장', '까삐', '펭펭', '냥냥'];
  const withNicks = (chars) => chars.map((char, i) => ({ char, nick: NK[i] }));
  const BL = () => PS().mini.ball;
  const B2 = () => PS().mini.ball2;
  const REST = 216 - 11;                                  // (the ball's centre resting on the floor)
  const sx = (col) => col * 8 - 4;                        // (a spawn cell's body x)
  const kicked = () => until(() => BL().kick === 0, 80);
  const winLine = () => { toBeat('w', 120); return G.banner && G.banner.main; };
  // the players out of the way: standing on the two crossbars (over every ball on the floor), or (floor) on the floor
  // mid-field (under a ball on a crossbar)
  const park = (except, floor) => {
    const X = floor ? [100, 124, 148, 172] : [16, 32, 208, 224]; let k = 0;
    for (const p of G.players) { if (p.slot === except) continue; put(p.slot, X[k++], floor ? 200 : 176 - 16); p.invuln = 0; }
    step(1);
  };
  function ballTests() {
    const KB = K.BALL;
    const A = P.arenas()[1];
    ok('ball: 거품 축구장 is closed with a crossbar over each goal (row 20), goal mouths, two kickoff spots a team, the ball\'s spot', A && A.key === 'ball' && A.closed && /^#{32}$/.test(A.map[25]) && A.map[20] === '######....................######' && A.goals.length === 2 && A.goals[0].line === 40 && A.goals[1].line === 216 && A.sides.length === 2 && A.ball.x === 128 && A.ball.y === 64, A && [A.map[20], A.goals]);

    // a guest reads the ball off the snapshot clamped as the host's own: inside the field, never past BALL.maxV
    const vj = P.view(['b', -4000, 30000, 99999, -99999, 0, 0, 0, 0, 0]), vk = P.view(['b', 1280, 640, 120, -80, 0, 0, 0, 0, 0]);
    ok('ball: a guest\'s view of a junk ball row stays in the field (27..229 x 35..205) and under BALL.maxV; a sane row reads as sent',
      vj.x === 27 && vj.y === 205 && vj.vx === KB.maxV && vj.vy === -KB.maxV && vk.x === 128 && vk.y === 64 && vk.vx === 1.2 && vk.vy === -0.8, [vj, vk]);

    // 2v2 before any points: slots 0 + 3 left, 1 + 2 right, each on its team's side; the card's team line
    party(withNicks(['duck', 'cat', 'frog', 'capy']), { plan: ['ball'] });
    const s0 = PS();
    ok('ball: a 4-player 판 on 거품 축구장 (60 s), opening on its card', G.mode === 'card' && s0.kind === 'p' && s0.arena === 1 && s0.mini.id === 'ball' && s0.total === 3600, [G.mode, s0.kind, s0.arena, s0.total]);
    ok('ball: 2v2 before any points - slots 0 + 3 on the left, 1 + 2 on the right', same(s0.mini.team, { 0: 0, 1: 1, 2: 1, 3: 0 }), s0.mini.team);
    ok('ball: everyone on its team\'s kickoff spots (left cols 11 / 7, right cols 20 / 24)', pl(0).x === sx(11) && pl(3).x === sx(7) && pl(1).x === sx(20) && pl(2).x === sx(24) && G.players.every((p) => p.y === 200), G.players.map((p) => [p.slot, p.x, p.y]));
    step(80);
    let c = P.card();
    ok('ball: the card\'s team line - 왼쪽 팀: 방장 · 냥냥 / 오른쪽 팀: 까삐 · 펭펭 (offline: no own side line)', c.team && same(c.teams, ['왼쪽 팀: 방장 · 냥냥', '오른쪽 팀: 까삐 · 펭펭']) && c.mine === '' && c.name === '거품 축구' && c.how === P.mini().ball.how, c);
    const m2 = P.fill(2).mine, m0 = P.fill(0).mine; P.fill(-1);
    ok('ball: ... on a seat\'s own screen the side it scores on (나는 오른쪽 팀 · 왼쪽 골대에 넣어요!)', m2 === P.tx().mineR && m0 === P.tx().mineL, [m2, m0]);
    toPlaying();
    const b0 = BL(), calls = (t) => G.words.filter((w) => w.txt === t).length;
    ok('ball: at 시작! the ball hangs at the centre top (BALL.kickF), each local animal gets its side called (오른쪽으로! x2, 왼쪽으로! x2)', b0.kick > 0 && b0.kick <= KB.kickF && b0.x === 128 && b0.y === 64 && calls(P.tx().toR) === 2 && calls(P.tx().toL) === 2, [b0, calls(P.tx().toR), calls(P.tx().toL)]);
    ok('ball: (setup) the kickoff wait is over in BALL.kickF frames', kicked() >= 0 && kicked() < KB.kickF);
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
    ok('ball: a capy\'s slam (quake) next to it sets vy to BALL.slam (-3.4): it flies up', BL().vy === KB.slam && !BL().rest, BL());

    // goals: the left goal is a point for the right team and the other way round, each counted once; the clock stops for
    // 골!; the kickoff opens every prison (no orphan prison left), everyone back on their side, the ball at the centre top
    party(withNicks(['duck', 'cat', 'frog', 'capy']), { plan: ['ball'] }); toPlaying(); kicked();
    park(); step(2);
    D.trapPlayer(1, 2);
    const kp = PS().mini.ko;
    P.ball(40, REST, -2.5, 0);
    const gAt = until(() => PS().mini.goalT > 0, 30), left0 = PS().left;
    ok('ball: into the left goal -> a point for the right team (0 : 1), 골! / 오른쪽 팀 0 : 1, the ball burst', gAt >= 0 && same(PS().mini.goals, [0, 1]) && PS().mini.goalT >= KB.goalF - 1 && G.banner && G.banner.main === '골!' && G.banner.sub === '오른쪽 팀 0 : 1', [gAt, PS().mini.goals, G.banner]);
    ok('ball: (setup) a rival is in a prison during the cheer', !!pl(1).trap && G.bubbles.some((b) => b.kind === 'player'));
    step(60);
    ok('ball: the clock stops while 골! shows; the goal counted once', PS().left === left0 && same(PS().mini.goals, [0, 1]), [left0, PS().left, PS().mini.goals]);
    D.trapPlayer(3, 0);   // (a fresh prison: the first one would have let go by itself before the kickoff)
    const esc0 = P.counts().esc[3] | 0;
    until(() => PS().mini.goalT === 0, 200);
    const kb = BL();
    ok('ball: the kickoff - every prison opened (no orphan prison), no bubble left, everyone back on its side, the ball at the centre top (kickF)',
      !G.players.some((p) => p.trap) && !G.bubbles.some((b) => b.kind === 'player' || b.kind === 'empty') && pl(0).x === sx(11) && pl(3).x === sx(7) && pl(1).x === sx(20) && pl(2).x === sx(24) && kb.x === 128 && kb.y === 64 && kb.kick === KB.kickF && PS().mini.ko === kp + 1,
      [G.players.map((p) => [p.slot, p.x, !!p.trap]), G.bubbles.map((b) => b.kind), kb]);
    ok('awards: a kickoff\'s release is no 탈출 (최다 탈출상 counts mashing out only)', (P.counts().esc[3] | 0) === esc0, P.counts());
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

    // places by the team's goals: the winners share 1st, the losers the next place; 1v1; a draw: everyone 1st (x2: the last)
    P.goal(0); until(() => PS().mini.goalT === 0, 200); P.skip();
    let r = PS();
    const wl1 = winLine();
    ok('ball: 2 : 1 for the left team -> 왼쪽 팀 승리!, left 8 + 8, right 2 + 2 (team members share the place)', same([0, 1, 2, 3].map((s) => r.pts[s]), [8, 2, 2, 8]) && same([0, 1, 2, 3].map((s) => r.last[s]), [1, 3, 3, 1]) && wl1 === P.tx().winL, [r.pts, r.last, wl1]);
    party(['duck', 'cat', 'frog', 'capy'], { plan: ['ball'] }); toPlaying(); P.skip();
    r = PS();
    const wl2 = winLine();
    ok('ball: 0 : 0 ended by hand -> 무승부!, everyone shares 1st (8 each)', [0, 1, 2, 3].every((s) => r.pts[s] === 8 && r.last[s] === 1) && wl2 === P.tx().draw, [r.pts, wl2]);
    party(withNicks(['duck', 'cat']), { plan: ['ball'] });
    step(80); c = P.card();
    ok('ball: 1v1 - one each (slot 0 left), the card says 왼쪽: 방장 / 오른쪽: 까삐', same(PS().mini.team, { 0: 0, 1: 1 }) && same(c.teams, ['왼쪽: 방장', '오른쪽: 까삐']), [PS().mini.team, c.teams]);
    toPlaying(); kicked(); P.goal(1); until(() => PS().mini.goalT === 0, 200); P.skip();
    r = PS();
    const wl3 = winLine();
    ok('ball: 1v1 0 : 1 -> 오른쪽 팀 승리!, 8 / 0', r.pts[1] === 8 && r.pts[0] === 0 && wl3 === P.tx().winR, [r.pts, wl3]);

    // teams by the standing before the 판: 1st + 4th left, 2nd + 3rd right
    party(['duck', 'cat', 'frog', 'capy'], { plan: ['crown', 'ball'] }); toPlaying();
    P.crown(3); step(20); P.crown(1); step(60); P.crown(2); step(120); P.skip();   // (2 wears it at time-up, then by held)
    const st = PS();
    toCard();
    ok('ball: (setup) after a crown 판 the standing is 2, 1, 3, 0', same([2, 1, 3, 0].map((s) => st.last[s]), [1, 2, 3, 4]), st.last);
    ok('ball: teams by the standing - 1st (2) + 4th (0) left, 2nd (1) + 3rd (3) right', same(PS().mini.team, { 0: 0, 1: 1, 2: 0, 3: 1 }), PS().mini.team);

    // 공이 2개: at 45 s of the clock (the 골! freezes do not count), a second, pink ball; its goals stop nothing
    party(['duck', 'cat'], { plan: ['ball'] }); toPlaying(); kicked();
    until(() => PS().mini.t >= 20 * 60, 1500);
    P.goal(0); const tg = PS().mini.t; step(60);
    ok('ball2: (setup) the clock stands during 골! (M.t frozen)', PS().mini.t === tg && !B2(), [tg, PS().mini.t]);
    until(() => PS().mini.t >= 2700 - 1, 3000);
    ok('ball2: none at 44.98 s of the clock', !B2(), B2());
    step(1);
    const t2 = PS().mini.t, b2 = B2();
    ok('ball2: at 45 s of the clock - a second ball hanging at the centre top, 공이 하나 더! / 골을 넣으면 공이 다시 떨어져요', t2 === 2700 && b2 && b2.x === 128 && b2.y === 64 && b2.kick > 0 && G.banner && G.banner.main === P.tx().two1 && G.banner.sub === P.tx().two2, [t2, b2, G.banner]);
    until(() => B2().kick === 0, 80);
    park(); P.ball2(128, REST, 0, 0); P.ball(60, REST, 0, 0); step(1);
    const kq = P.shot(0, 96, REST - 8, 1); for (let f = 0; f < 20 && !(kq.state === 'pop' || kq.dead); f++) step(1);
    ok('ball2: a shot pushes the second ball too', B2().vx > 1.2, B2());
    P.ball2(128, REST, 0, 0); P.ball(128 - 18, REST, 0, 0); step(1);
    ok('ball2: two balls in touch are pushed apart (never inside each other)', Math.hypot(B2().x - BL().x, B2().y - BL().y) >= 2 * KB.r - 0.01, [BL(), B2()]);
    const g0 = PS().mini.goals.slice(), lft = PS().left, xs = G.players.map((p) => p.x);
    P.ball(150, 120, 0, 0); P.ball2(40, REST, -2.5, 0);
    until(() => PS().mini.goals[1] > g0[1], 40); step(3);
    const m2b = PS().mini;
    ok('ball2: a goal with two balls - counted once, no freeze (goalT 0), the clock runs on, nobody moved; that ball re-drops from the centre top after BALL2.redrop', m2b.goals[1] === g0[1] + 1 && m2b.goalT === 0 && PS().left < lft && same(G.players.map((p) => p.x), xs) && B2().kick > 0 && B2().kick <= K.BALL2.redrop && B2().x === 128 && B2().y === 64, [m2b.goals, m2b.goalT, B2()]);
    ok('ball2: ... 골! with the score for BALL2.cheer (60 f)', G.banner && G.banner.main === '골!' && G.banner.end - G.frame <= K.BALL2.cheer, G.banner);
    // 골든 골: tied at time-up with both teams present -> play on; the next goal wins (the cheer, then the result)
    party(['duck', 'cat'], { plan: ['ball'] }); toPlaying(); kicked(); step(10);
    P.golden(); step(1);
    ok('골든 골: tied at time-up -> still playing, 골든 골! / 먼저 넣는 팀이 이겨요!, the overtime counting', G.mode === 'playing' && PS().mini.gg >= 0 && G.banner && G.banner.main === P.tx().golden1 && G.banner.sub === P.tx().golden2, [G.mode, PS().mini.gg, G.banner]);
    step(120);
    ok('골든 골: ... the clock stays at 0 meanwhile, gg counts up', PS().left === 0 && PS().mini.gg >= 119, [PS().left, PS().mini.gg]);
    park(); P.ball(216, REST, 2.5, 0);
    const gIn = until(() => PS().mini.goals[0] === 1, 40), endIn = until(() => G.mode === 'result', 120);
    ok('골든 골: the next goal ends it BALL2.cheer (60 f) later - 왼쪽 팀 승리!', gIn >= 0 && endIn >= K.BALL2.cheer - 2 && endIn <= K.BALL2.cheer + 2 && winLine() === P.tx().winL && PS().last[0] === 1 && PS().last[1] === 2, [gIn, endIn, PS().last]);
    party(['duck', 'cat'], { plan: ['ball'] }); toPlaying(); kicked(); P.goal(1); until(() => PS().mini.goalT === 0, 200);
    P.golden(); step(2);
    ok('골든 골: not when the goals differ - time-up ends it', G.mode === 'result' && PS().mini.gg === -1, [G.mode, PS().mini.gg]);
    party(['duck', 'cat'], { plan: ['ball'] }); toPlaying(); kicked(); park(); P.ball(128, REST, 0, 0);
    P.golden(); const dIn = until(() => G.mode === 'result', 1400);
    ok('골든 골: no goal in BALL2.golden (20 s) -> a draw (everyone 1st)', dIn >= 1190 && dIn <= 1210 && PS().last[0] === 1 && PS().last[1] === 1, [dIn, PS().last]);

    // 60 s of random kicks (seeded), two balls from 45 s: bodies thrown at them, bubbles at them - never out of the
    // field, never NaN, never wrapped
    party(['penguin', 'otter', 'capy', 'cat'], { plan: ['ball'] }); toPlaying(); kicked();
    let sd = 4242;
    const rnd = () => ((sd = (sd * 1103515245 + 12345) >>> 0) / 4294967296);
    const bad = []; let prev = Object.assign({}, BL()), goals = 0, frames = 0, top = 0, two = 0;
    for (let f = 0; f < 3600 && G.mode === 'playing'; f++) {
      const b = f & 1 && B2() ? B2() : BL();
      if (f % 6 === 0) for (const p of G.players) {
        if (p.trap) continue;
        p.x = Math.max(14, Math.min(226, b.x - 8 + (rnd() - 0.5) * 44)); p.y = Math.max(24, Math.min(200, b.y - 8 + (rnd() - 0.5) * 36));
        p.vx = (rnd() - 0.5) * 7; p.vy = (rnd() - 0.5) * 7; p.invuln = 60;
      }
      if (f % 13 === 0) P.shot(G.players[(f / 13 | 0) % 4].slot, Math.max(16, Math.min(224, b.x - 8 + (rnd() - 0.5) * 50)), Math.max(24, Math.min(206, b.y - 8 + (rnd() - 0.5) * 40)), rnd() < 0.5 ? -1 : 1);
      if (f % 211 === 0) { if ((f / 211) % 3 === 2) P.ball(38, 200, -3, 0); else P.ball(30 + rnd() * 196, 40 + rnd() * 160, (rnd() - 0.5) * 10, (rnd() - 0.5) * 10); }
      step(1); frames++;
      const q = BL(), m = PS().mini;
      for (const z of [q, m.ball2].filter(Boolean)) {
        if (![z.x, z.y, z.vx, z.vy].every(Number.isFinite)) bad.push(['nan', f, z]);
        if (z.x < 27 - 1e-6 || z.x > 229 + 1e-6 || z.y < 35 - 1e-6 || z.y > 205 + 1e-6) bad.push(['out', f, z]);
        if (Math.hypot(z.vx, z.vy) > KB.maxV + 1e-6) bad.push(['fast', f, z]);
        top = Math.max(top, Math.hypot(z.vx, z.vy));
      }
      if (m.ball2) two++;
      if (m.goalT === 0 && q.kick === 0 && prev.kick === 0 && f % 211 !== 0 && Math.hypot(q.x - prev.x, q.y - prev.y) > 40) bad.push(['jump', f, prev, q]);
      prev = Object.assign({}, q); goals = m.goals[0] + m.goals[1];
      if (bad.length > 3) break;
    }
    info('random kicks: ' + frames + ' frames (' + two + ' with two balls), ' + goals + ' goals, top speed ' + top.toFixed(2) + ', kn ' + PS().mini.kn);
    ok('ball: 60 s of random kicks (seeded, two balls from 45 s) - never out of the field, never NaN, never wrapped, never past BALL.maxV; some goals', !bad.length && frames >= 3000 && goals >= 1 && two > 60, bad.slice(0, 3));
    ok('ball: ... and no orphan prison or stuck trap after its kickoffs', G.bubbles.every((b) => b.kind !== 'player' || (b.victim && b.victim.trap && b.victim.trap.b === b)));

    // leavers: one leaving during a 축구 card (4 -> 3) - that 판 is drawn again (no 축구 for 3) and its card starts over;
    // one leaving mid-축구 (4 -> 3): it plays on short-handed, the team keeps its member
    party(withNicks(['duck', 'cat', 'frog', 'capy']), { plan: ['water', 'ball', 'crown'] });
    toPlaying(); P.skip(); toCard();
    step(80);
    ok('leavers: (setup) the 2nd card is 거품 축구 with its team line', PS().mini.id === 'ball' && P.card().team && PS().t >= 80, [PS().mini.id, PS().t]);
    P.drop(3); step(80);
    c = P.card();
    // (party-games 3.6: the replan draws from what fits 3 and was not played - 왕관 or a new game, never 축구 or 물 again)
    const rp1 = PS().plan;
    ok('leavers: one leaves during the 축구 card (4 -> 3) - that 판 is drawn again (a game for 3 not played yet, no team line), its card starts over, the 3rd fits 3 too and differs',
      G.mode === 'card' && rp1[0] === 'water' && !rp1.includes('ball') && rp1[1] !== 'water' && rp1[2] !== rp1[1] && rp1[2] !== 'water' && PS().mini.id === rp1[1] && PS().t === 80 && c.name === P.mini()[rp1[1]].name && (!c.team || rp1[1] === 'sneak') && c.round === '2판 / 3판', [rp1, PS().mini.id, PS().t, c]);   // (술래's card has its order line)
    party(withNicks(['duck', 'cat', 'frog', 'capy']), { plan: ['ball', 'crown'] });
    toPlaying(); kicked(); P.drop(2);
    ok('leavers: one leaves mid-축구 (4 -> 3) - it plays on (the team keeps its member), the 판 after it still fits', G.mode === 'playing' && PS().mini.id === 'ball' && same(PS().mini.team, { 0: 0, 1: 1, 2: 1, 3: 0 }) && G.players.length === 3 && same(PS().plan, ['ball', 'crown']), [G.mode, PS().mini.team, PS().plan]);
    P.goal(1); until(() => PS().mini.goalT === 0, 200);
    ok('leavers: ... the kickoff puts the short-handed team on its first spot', pl(1).x === sx(20) && pl(0).x === sx(11) && pl(3).x === sx(7));
    P.skip();
    ok('leavers: ... places by the team\'s goals (n0 4, not the last 판: the lone winner 4, the losers 2 + 2)', PS().pts[1] === 4 && PS().pts[0] === 2 && PS().pts[3] === 2, PS().pts);
    // a whole team gone (4 -> 3 -> 2, both of the right team): nobody to play against - the 판 ends early (PARTY_F.early),
    // the team left wins it even from behind (the line agrees with the places: both 1st, 4 each)
    party(withNicks(['duck', 'cat', 'frog', 'capy']), { plan: ['ball', 'crown'] });
    toPlaying(); kicked(); P.goal(1); until(() => PS().mini.goalT === 0, 200);
    P.drop(2); step(5);
    ok('leavers: (setup) one of the right team gone - still playing', G.mode === 'playing' && PS().mini.endAt < 0, [G.mode, PS().mini.endAt]);
    P.drop(1);
    const endIn2 = until(() => G.mode === 'result', 120), wl4 = winLine();
    ok('leavers: the right team all gone -> the 판 ends early (PARTY_F.early), 왼쪽 팀 승리! from 0 : 1, the two left 1st with 4 each', endIn2 >= K.PARTY_F.early - 2 && endIn2 <= K.PARTY_F.early + 2 && wl4 === P.tx().winL && PS().pts[0] === 4 && PS().pts[3] === 4 && PS().last[0] === 1 && PS().last[3] === 1,
      [endIn2, wl4, PS().pts, PS().last]);
  }

  // ---------------------------------------------------------------- 5b. the new games' machinery (party-games 3, 13.1.1)
  const MK = () => K.MILK;
  // (gold pixels on the ring's top arc - 240-300 degrees: clear of the 32 px bottle, the fridge's bottles and the counter's edge)
  const goldish = (X, Y, R) => { const x = $('pg-canvas').getContext('2d'); let n = 0; for (let a = 240; a <= 300; a += 2) { const q = a * Math.PI / 180, px = x.getImageData(Math.round(X + Math.cos(q) * R), Math.round(Y + Math.sin(q) * R), 1, 1).data; if (px[0] > 200 && px[1] > 150 && px[2] < 140) n++; } return n; };
  function machineryTests() {
    P.vclock(true, 1000);
    // the stage: everyone parked on STAGE_X, no blink; walking and blowing do nothing; the HUD's centre is the round
    for (const chars of [['duck', 'cat'], ['duck', 'cat', 'frog'], ['duck', 'cat', 'frog', 'otter']]) {
      party(chars, { plan: ['milk'] }); toPlaying();
      const xs = G.players.map((p) => p.x + 8), want = K.STAGE_X[chars.length];
      ok('stage: ' + chars.length + ' players stand on STAGE_X (' + want.join(' / ') + ') on 무대 목욕탕\'s floor, no START_INV blink', same(xs, want) && G.players.every((p) => p.y === 200 && p.invuln === 0) && PS().kind === 'p' && P.arenas()[PS().arena].key === 'stage', [xs, G.players.map((p) => [p.y, p.invuln]), PS().arena]);
    }
    const x0 = G.players.map((p) => [p.x, p.y]), bs0 = PS().coins.bshots;
    D.press('right', true, 0); D.press('left', true, 1); step(20); D.press('right', false, 0); D.press('left', false, 1);
    D.press('jump', true, 2); step(3); D.press('jump', false, 2);
    ok('world: false - walking and jumping move nobody (no physics; vx / vy 0, on the ground, invuln 0)', same(G.players.map((p) => [p.x, p.y]), x0) && G.players.every((p) => p.vx === 0 && p.vy === 0 && p.onGround && p.invuln === 0), G.players.map((p) => [p.x, p.y, p.vx, p.vy]));
    D.press('shoot', true, 0); step(2); D.press('shoot', false, 0); step(2);
    ok('noFire: a 거품 press in the intro makes no bubble and no blow (bshots unchanged: unarmed, not a grab either)', !G.bubbles.length && PS().coins.bshots === bs0, [G.bubbles.length, PS().coins.bshots, bs0]);
    P.fakeBody(3, {}); const shot = P.shotIn(3);
    ok('noFire: a \'shot\' message from a seat while 바나나우유 plays makes no bubble (hostShot drops it)', shot === 0 && !G.bubbles.length, shot);
    G.battle.left = 601; step(2);
    ok('cues: false - no 10초 남았어요! at 10 s left', !(G.banner && G.banner.main === '10초 남았어요!'), G.banner && G.banner.main);
    ok('clock: the HUD centre is the round (1/8) - MINI.milk.cues false, world false, noFire', PS().mini.n === MK().rounds && P.mini().milk.world === false && P.mini().milk.noFire === true && P.mini().milk.cues === false);
    // a crown 판 for contrast: the same 'shot' blows a bubble there
    party(['duck', 'cat', 'frog', 'penguin'], { plan: ['crown'] }); toPlaying(); P.fakeBody(3, {}); step(1);
    ok('noFire: ... while in 왕관 뺏기 the same \'shot\' blows one (the guard is the game\'s flag)', P.shotIn(3) === 1, G.bubbles.length);
    // the press queue: each fresh press with its time (two in one frame = two, in time order), a 'down' entry, downP an
    // edge; nothing while the menu is open, nothing stale for the next frame; G.drawT moves with D.step
    party(['duck', 'cat'], { plan: ['milk'] }); toPlaying();
    const t0 = P.now();
    P.press(1, 'shoot', t0 + 9); P.press(1, 'jump', t0 + 3); P.press(1, 'down', t0 + 5); step(1);
    const q1 = P.pq(1);
    ok('pq: three presses in one frame reach that seat\'s frame as three entries in time order (a down between two presses)', same(q1, [['jump', t0 + 3], ['down', t0 + 5], ['shoot', t0 + 9]]), q1);
    step(1);
    ok('pq: ... and nothing of them is left for the next frame', P.pq(1) === null);
    D.press('down', true, 0); step(1); const dq = P.pq(0); step(3); const dq2 = P.pq(0); D.press('down', false, 0); step(1);
    ok('pq: a held down pushes one \'down\' entry on its edge only', dq && dq.length === 1 && dq[0][0] === 'down' && dq2 === null, [dq, dq2]);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', key: 'x', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', key: 'x', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', key: 'z', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', key: 'ArrowDown', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowDown', key: 'ArrowDown', bubbles: true }));
    step(1); const kq = P.pq(0);
    ok('pq: real key presses (X, Z, ↓) reach my seat\'s next frame as shoot / jump / down entries (↓ also a D: party-games-2 3.3)', kq && same(kq.map((q) => q[0]).sort(), ['D', 'down', 'jump', 'shoot']), kq);
    G.menuOpen = true; P.press(0, 'shoot'); step(1); const mq = P.pq(0); G.menuOpen = false; step(1);
    ok('pq: with the menu open my seat gets no presses, and none come back after it closes', mq === null && P.pq(0) === null, mq);
    const d0 = P.drawT(); step(1); const d1 = P.drawT(); step(3); const d2 = P.drawT();
    ok('G.drawT: set in render - D.step moves it by a world frame each (the virtual clock)', Math.abs(d1 - d0 - 1000 / 60) < 0.01 && Math.abs(d2 - d1 - 3000 / 60) < 0.01, [d0, d1, d2]);
    // mi on the wire: bounded; G.mloc starts again at each 판
    const pb = P.parseBody({ k: 5, mi: [1, 'x', 1e9, -1e9, 5, 6, 7, 8, 9, 10] }), pn = P.parseBody({ k: 5 });
    ok('mi: parseBody keeps at most 8 ints clamped to +-1e6 (junk 0); none -> null', same(pb.mi, [1, 0, 1e6, -1e6, 5, 6, 7, 8]) && pn.mi === null, [pb.mi, pn.mi]);
    party(['duck', 'cat'], { plan: ['milk', 'crown'] }); toPlaying();
    until(() => P.seen() && P.seen().milk !== undefined, 400); P.press(0, 'shoot', P.seen().milk + 300); step(2);
    const ml = P.mloc(0); P.skip(); toCard();
    ok('G.mloc: this page\'s own part of a seat (its report) is there during the 판, empty again at the next card', ml && ml.rep && ml.rep[1] === 1 && same(P.mloc(), {}), [ml, P.mloc()]);
    // the fast party: a round game's fastSecs, the others' 12 s
    P.fast(true); party(['duck', 'cat'], { plan: ['milk', 'crown'] });
    const ft = PS().total, fn = PS().mini.n; toPlaying(); P.skip(); toCard(); const ct = PS().total; P.fast(false);
    ok('fastSecs: the fast party gives 바나나우유 its 30 s (and 4 rounds), 왕관 its 12 s', ft === 30 * 60 && fn === MK().fast && ct === 12 * 60, [ft, fn, ct]);
    // the HUD: no magazine pips in a noFire game (seat 1's panel at x 1: its pips at x 48, the bottom one y 11..13)
    const pip = () => { const d = $('pg-canvas').getContext('2d').getImageData(48, 12, 1, 1).data; return d[0] > 200 && d[1] > 200 && d[2] > 200; };
    party(['duck', 'cat'], { plan: ['crown', 'milk'] }); toPlaying(); step(2); const pipC = pip();
    P.skip(); toCard(); toPlaying(); step(2); const pipM = pip();
    ok('HUD: the magazine pips show in 왕관 뺏기, not in 바나나우유 (noFire)', pipC && !pipM, [pipC, pipM]);
    // no regressions: a battle after a milk party - bodies move, bubbles fire, the magazine is there
    D.local.battle(['duck', 'cat']); step(160);
    const bx = pl(0).x; D.press('right', true, 0); step(20); D.press('right', false, 0);
    const nb = G.bubbles.length; D.press('shoot', true, 0); step(2); D.press('shoot', false, 0); step(2);
    ok('after a party: a battle moves and blows bubbles again (no game flag left over)', !PS().on && pl(0).x > bx + 8 && G.bubbles.length > nb, [pl(0).x - bx, G.bubbles.length, nb]);
    P.vclock(false);
  }

  // ---------------------------------------------------------------- 5c. 바나나우유 잡기 (party-games 4, 13.1.3)
  // the frames of this round until the milk was drawn here (P.seen().milk: its draw time); -1 if it never came
  const toMilk = () => until(() => G.mode !== 'playing' || (P.seen() && P.seen().r === P.milk().r && P.seen().milk !== undefined), 600);
  const toRound = (r) => until(() => G.mode !== 'playing' || (P.milk().r === r && P.milk().ph === 0), 1500);
  function milkTests() {
    const M = MK();
    // the plan (pure, seeded): decoys by round, 딸기우유 from 5 (one at most), the NO-GO rounds
    const pbad = []; let two = 0, pink = 0, shortOne = 0;
    for (let seed = 1; seed <= 400; seed++) for (let r = 1; r <= 8; r++) {
      const pl0 = P.milkPlan(r, false, 1000, seed * 13 + r), ev = pl0.ev, arm = 1000 + M.intro, dec = ev.filter((e) => e[0] >= 1 && e[0] <= 4), wait = pl0.m - arm;
      if (ev[0][0] !== 0 || ev[0][1] !== arm || ev[ev.length - 1][0] !== 9 || ev[ev.length - 1][1] !== pl0.m || wait < M.wait[0] || wait > M.wait[1]) pbad.push(['shape', r, seed, ev]);
      const want = r < M.dFrom ? [0] : r < M.dTwo ? [1] : wait < 2 * (M.decoyF + M.gapF) ? [1] : [1, 2];
      if (!want.includes(dec.length)) pbad.push(['count', r, seed, wait, ev]);
      if (dec.length === 2) two++; if (r >= M.dTwo && wait < 2 * (M.decoyF + M.gapF)) shortOne++;
      const starts = dec.map((e) => e[1]).concat([pl0.m]);
      for (let k = 0; k < dec.length; k++) if (dec[k][1] < arm || dec[k][1] + M.decoyF + M.gapF > starts[k + 1]) pbad.push(['space', r, seed, ev]);
      const pk = dec.filter((e) => e[0] === 4).length; pink += pk;
      if (pk > 1 || (pk && r < M.pinkFrom)) pbad.push(['pink', r, seed, ev]);
    }
    ok('plan: rounds 1-2 no decoy, 3-4 one, 5-8 one or two (one when the wait drew under 2 x 54 f), each 30 f + 24 f clear of the next appearance; the milk 72-180 f after the arm; 딸기우유 only from round 5, one at most (400 seeds)', !pbad.length && two > 50 && pink > 50 && shortOne > 20, [pbad.slice(0, 3), two, pink, shortOne]);
    const nb = []; let nn = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const pl0 = P.milkPlan(5 + (seed % 4), true, 500, seed), ev = pl0.ev, dec = ev.filter((e) => e[0] >= 1 && e[0] <= 4), last = dec[dec.length - 1];
      if (dec.length < 2 || dec.length > 3 || ev.some((e) => e[0] === 9) || pl0.m !== -1 || ev[ev.length - 1][0] !== 8 || pl0.end !== last[1] + M.decoyF + 60 || ev[ev.length - 1][1] !== pl0.end) nb.push([seed, ev, pl0]);
      const g = P.milkNogo(8, seed); nn += g.length;
      if (g.length !== M.nogo || g.some((q) => q < M.nogoFrom || q > 8) || Math.abs(g[0] - g[1]) < 2) nb.push(['nogo', seed, g]);
    }
    ok('plan: a NO-GO round has 2-3 decoys, no milk, its end 60 f after the last decoy leaves; 2 NO-GO rounds of 4-8, never adjacent (300 seeds)', !nb.length && same(P.milkNogo(4, 3), [4]), nb.slice(0, 3));

    // the judge (4 players, round 1): presses -50 / 0 / 99 / 100 ms around my own draw of the milk; the snapshot never
    // carries an event before the host's clock reaches it
    P.vclock(true, 1000);
    party(['duck', 'cat', 'frog', 'otter'], { plan: ['milk'] }, 41); toPlaying();
    let leak = 0;
    const r1 = P.milk(); for (let f = 0; f < 600 && !(P.seen() && P.seen().milk !== undefined); f++) { const mg = P.mg(); if (mg[3].some((e) => e[1] > G.frame)) leak++; step(1); }
    const sh1 = P.seen();
    ok('wire: an event rides in g.mg only once the host\'s clock reached its tick (the whole wait of round 1)', !leak && r1.r === 1 && P.mg()[3].length === 2 && P.mg()[0] === 'm', [leak, P.mg()]);
    ok('draw: the milk was first drawn on the frame the host reached its tick (the arm too), its draw time is G.drawT then', sh1 && sh1.milk !== undefined && sh1.arm !== undefined && G.frame === r1.plan.m && sh1.milk === P.drawT() && Math.abs(sh1.milk - sh1.arm - (r1.plan.m - r1.plan.ev[0][1]) * 1000 / 60) < 0.01, [sh1, G.frame, r1.plan]);
    // (the teaching ring in rounds 1-4: gold pixels round the bottle on some frames)
    let ring1 = 0; for (let f = 0; f < 16; f++) { step(1); ring1 += goldish(128, 134, 20); }
    const tm = P.seen().milk;
    [-50, 0, 99, 100].forEach((d, s) => P.press(s, 'shoot', tm + d)); step(1);
    const reps = [0, 1, 2, 3].map((s) => (P.mloc(s) || {}).rep);
    ok('judge: -50 / 0 / 99 ms after my draw are a 반칙, 100 ms a grab of 100', reps[0][1] === 2 && reps[1][1] === 2 && reps[2][1] === 2 && same(reps[3], [100, 1]), reps);
    ok('mi: a host-local seat\'s report goes local -> input as [판 i, round, ms, flag] (one code path with a guest\'s)', same(P.mi(3), [PS().i, 1, 100, 1]) && same(P.milk().rep[3], [100, 1]), [P.mi(3), P.milk().rep]);
    ok('ring: the teaching gold ring blinks round the milk in round 1', ring1 > 10, ring1);
    const rv1 = P.milk();
    ok('close: every seat reported -> the round closes at once (the reveal): grab 3, 반칙 -1 each', rv1.ph === 2 && same(rv1.res.map((q) => q[3]), [-1, -1, -1, 3]) && same(rv1.pts, { 0: -1, 1: -1, 2: -1, 3: 3 }), rv1);
    ok('wire: the reveal\'s rows ride in g.mg ([slot, ms, flag, points]) with the totals', same(P.mg()[5], rv1.res) && same(P.mg()[6], [-1, -1, -1, 3]), P.mg());
    // round 2: 1500 ms is a grab, 1501 느려요, no press 느려요 at 1500 ms of my clock, 250 the fastest
    toRound(2); toMilk(); const t2 = P.seen().milk;
    P.press(0, 'jump', t2 + 1500); P.press(1, 'shoot', t2 + 1501); P.press(3, 'shoot', t2 + 250); step(1);
    const mid2 = P.milk().ph;
    until(() => P.milk().ph === 2, 200);
    const rv2 = P.milk(), rep2 = P.mloc(2).rep;
    ok('judge: 1500 ms a grab, 1501 ms 느려요; no press - 느려요 once my clock passed 1500 ms (then the round closes)', mid2 === 0 && rv2.ph === 2 && same(rv2.res.map((q) => q.slice(0, 3)), [[0, 1500, 1], [1, 1500, 4], [2, 1500, 4], [3, 250, 1]]) && same(rep2, [1500, 4]), [rv2.res, rep2]);
    ok('points: by ms - 250 gets 3, 1500 gets 2, 느려요 0', same(rv2.res.map((q) => q[3]), [2, 0, 0, 3]) && same(rv2.ms, { 0: 1500 + 1500, 1: 1500 + 1500, 2: 1500 + 1500, 3: 100 + 250 }), [rv2.res, rv2.ms]);
    // round 3: a decoy - a press on it is a 반칙 (my line says 바나나우유만 잡아요); equal ms share the place (3 / 3 / 1)
    toRound(3);
    ok('banner: round 3 opens with 가짜 간식이 나와요! / 바나나우유만 잡아요', G.banner && G.banner.main === P.tx().mkFake1 && G.banner.sub === P.tx().mkFake2, G.banner);
    until(() => P.seen() && P.seen().r === 3 && P.seen().d.length > 0, 400);
    const dk = P.seen().d[0];
    P.press(3, 'shoot', dk[3] + 50); step(1);
    const foul3 = P.mloc(3), line3 = G.banner ? [G.banner.main, G.banner.sub] : null;
    P.press(3, 'shoot', dk[3] + 400); step(1);
    toMilk(); const t3 = P.seen().milk;
    P.press(0, 'shoot', t3 + 200); P.press(1, 'shoot', t3 + 200); P.press(2, 'shoot', t3 + 300); P.press(3, 'shoot', t3 + 150); step(1);
    const rv3 = P.milk();
    ok('decoy: a press on a decoy is a 반칙 (on my seat\'s screen at once: the 물벼락 and my line 물벼락! / 바나나우유만 잡아요 - offline every seat is mine)', foul3.rep[1] === 2 && foul3.why === 'decoy' && dk[0] >= 1 && dk[0] <= 3 && same(line3, [P.tx().mkSplash, P.tx().mkDecoy]), [foul3, dk, line3]);
    ok('물벼락: my later presses this round count for nothing (still the 반칙 after the milk)', rv3.ph === 2 && rv3.res[3][2] === 2 && rv3.res[3][3] === -1, rv3.res);
    ok('points: equal ms share the place - 200 / 200 / 300 -> 3 / 3 / 1', same(rv3.res.map((q) => q[3]), [3, 3, 1, -1]), rv3.res);
    ok('coins: each valid grab of MY seat (slot 0) counts one action - my 2 grabs so far, not seat 3 grabs (bshots 2)', PS().coins.bshots === 2, PS().coins);
    // the rest: no presses - every GO round closes on the 느려요 reports, a NO-GO round on everyone's 참았다 at its end
    const nogo = P.milk().nogo; let heldOk = true, ringLate = 0, pinkBanner = false;
    for (let r = 4; r <= 8; r++) {
      toRound(r); if (r === 5) pinkBanner = !!(G.banner && G.banner.main === P.tx().mkPink1 && G.banner.sub === P.tx().mkPink2);
      if (!nogo.includes(r) && r >= 5) { toMilk(); for (let f = 0; f < 16; f++) { step(1); ringLate += goldish(128, 134, 20); } }
      until(() => P.milk().ph === 2, 900);
      const rv = P.milk();
      if (nogo.includes(r)) heldOk = heldOk && rv.res.every((q) => q[2] === 3 && q[3] === 1) && G.banner && G.banner.main === P.tx().mkNone1;
    }
    ok('NO-GO: in a round with no milk, no press until my screen drew its end is 참았다 (+1), the reveal says 바나나우유가 없었어요!', nogo.length === 2 && heldOk, [nogo, heldOk]);
    ok('banner: round 5 opens with 딸기우유 조심! / 분홍색은 참아요', pinkBanner);
    ok('ring: no teaching ring from round 5 (the pink twin would be no test)', ringLate === 0, ringLate);
    const e8 = until(() => G.mode !== 'playing', 400), st8 = PS();
    ok('end: 8 rounds, then the 판 ends endF after the last reveal (not by the clock)', st8.mini && st8.mini.r === 8 && G.mode === 'result' && e8 > 0 && st8.left > 0, [e8, st8.mini && st8.mini.r, G.mode, st8.left]);

    // a NO-GO round: any press before its end is a 반칙; a press after my screen drew its end counts for nothing
    party(['duck', 'cat'], { plan: ['milk'] }, 41); toPlaying();
    const ng = P.milk().nogo[0]; toRound(ng);
    until(() => P.seen() && P.seen().r === ng && P.seen().d.length > 0, 400);
    P.press(0, 'shoot', P.seen().d[0][3] + 300); step(1);
    until(() => P.seen().end !== undefined, 600); P.press(1, 'shoot', P.seen().end + 10); step(1);
    until(() => P.milk().ph === 2, 100);
    const rn = P.milk();
    ok('NO-GO: a press on a decoy is a 반칙 (-1); a press only after the end was drawn is still 참았다 (+1)', rn.r === ng && same(rn.res.map((q) => [q[2], q[3]]), [[2, -1], [3, 1]]), rn.res);

    // remote seats (fakeBody: its own mi in a body state): clamped; a silent one is waited for up to the cap; a stale one
    // (no state for staleF) is not waited for; a leaver drops out
    party(['duck', 'cat', 'frog'], { plan: ['milk'] }, 41); toPlaying();
    P.fakeBody(1, {}); P.fakeBody(2, {});
    const ri0 = PS().i;
    const r0 = P.milk().r, tick = () => { P.fakeBody(2, {}); step(1); };
    for (let f = 0; f < 600 && !(P.seen() && P.seen().milk !== undefined); f++) tick();
    P.fakeBody(1, { mi: [ri0, r0, 50, 1] }); P.press(0, 'shoot', P.seen().milk + 180); tick(); tick();
    const due = P.milk().plan.m;
    ok('input: a remote grab under minMs is taken as a 반칙 (its first report only)', same(P.milk().rep[1], [M.maxMs, 2]) && same(P.milk().rep[0], [180, 1]), P.milk().rep);
    P.fakeBody(1, { mi: [ri0, r0, 300, 1] }); tick();
    ok('input: ... a later report of the same round changes nothing', same(P.milk().rep[1], [M.maxMs, 2]));
    let closeAt = -1; for (let f = 0; f < 400 && closeAt < 0; f++) { tick(); if (P.milk().ph === 2) closeAt = G.frame; }
    ok('close: a seat still sending states but never reporting is waited for up to the cap (the milk + 180 f) - then 느려요 (0)', closeAt === due + M.capF && P.milk().res[2][2] === 4 && P.milk().res[2][3] === 0, [closeAt, due, P.milk().res]);
    toRound(2); until(() => P.seen() && P.seen().r === 2 && P.seen().milk !== undefined, 600);
    P.fakeBody(1, { mi: [ri0, 2, 2000, 1] }); P.fakeBody(2, { mi: [ri0 + 1, 2, 300, 1] }); P.press(0, 'shoot', P.seen().milk + 400); step(1);
    const rp2 = P.milk().rep;
    ok('input: a grab over maxMs is 느려요; a report for another 판 is ignored', same(rp2[1], [M.maxMs, 4]) && !rp2[2], rp2);
    let c2 = -1; for (let f = 0; f < 60 && c2 < 0; f++) { step(1); if (P.milk().ph === 2) c2 = f; }
    ok('close: a remote seat whose states stopped (no new one for staleF) is not waited for - the round closes once it is stale', c2 >= 0 && c2 <= M.staleF + 2 && P.milk().res.find((q) => q[0] === 2)[2] === 4, [c2, P.milk().res]);
    toRound(3); P.fakeBody(2, {}); until(() => P.seen() && P.seen().r === 3 && P.seen().milk !== undefined, 600);
    P.fakeBody(1, { mi: [ri0, 3, 400, 3] }); step(1);
    ok('input: a 참았다 in a GO round is taken as 느려요', same(P.milk().rep[1], [M.maxMs, 4]), P.milk().rep);
    P.drop(2); P.press(0, 'shoot', P.seen().milk + 200); step(2);
    ok('leaver: one leaves mid-round - the round resolves without it (its row gone)', P.milk().ph === 2 && P.milk().res.length === 2 && !P.milk().res.some((q) => q[0] === 2) && P.mg()[5].length === 2, P.milk().res);

    // the place key: points, then less ms; still equal - a shared place
    party(['duck', 'cat', 'frog'], { plan: ['milk'] }); toPlaying();
    Object.assign(G.mini, { pts: { 0: 5, 1: 5, 2: 5 }, ms: { 0: 3000, 1: 2900, 2: 3000 } });
    const pm = new Map(P.places());
    ok('key: equal points - the less ms over the GO rounds places higher; equal ms too - a shared place', pm.get(1) === 1 && pm.get(0) === 2 && pm.get(2) === 2, P.places());

    // a guest's mirror: events of the next snapshot merged in (a.k < e <= rt), rows bounded
    const v = P.milkView(['m', 3, 0, [[0, 130]], -1, [[1, 0, 2, -1], ['x']], [1, -1, 0, 0], 8], ['m', 3, 0, [[0, 130], [2, 170]], -1, [], [], 8]);
    const v2 = P.milkView(['m', 3, 0, [[0, 130]], -1, [], [], 8], ['m', 4, 0, [[0, 400]], -1, [], [], 8]);
    ok('view: milkView merges the next snapshot\'s events of the same round (not another round\'s); junk rows dropped', same(v.ev, [[0, 130], [2, 170]]) && same(v.res, [[1, 0, 2, -1]]) && same(v.pts, { 0: 1, 1: -1 }) && same(v2.ev, [[0, 130]]), [v, v2]);
    // once drawn, it stays drawn: the view clock stepping back after the milk changes nothing (one draw time)
    party(['duck', 'cat'], { plan: ['milk'] }); toPlaying(); toMilk();
    const s0 = P.seen().milk, mm = P.milk().plan.m;
    P.viewAt(mm - 40); step(5); const s1 = P.seen(); P.viewAt(null);
    ok('draw: a view clock stepping back after the milk was drawn keeps it drawn (the same draw time)', s1.milk === s0, [s0, s1]);
    P.vclock(false);
    // the card: the texts as specified, the demo
    party(longNicks(), { plan: ['milk'] }); step(80);
    const c = P.card();
    ok('card: 바나나우유 잡기 - its how, rule and keys lines as specified', c.name === '바나나우유 잡기' && c.how === '바나나우유가 나오면 바로 눌러요!' && c.rule === '다른 간식이나 딸기우유에 누르면 물벼락 -1점 · 빠를수록 점수가 커요' && c.keys === 'Z 또는 X로 잡기' && P.mini().milk.keysT === '점프나 거품 버튼으로 잡기' && c.demo, c);
  }

  // ---------------------------------------------------------------- 5d. 펑! 비눗방울 (party-games 5, 13.1.4)
  // a seed whose bubble 0 pops at a size L that passes pred (the first from 1)
  const seedL0 = (pred) => { for (let s = 1; s < 200000; s++) if (pred(P.puffL(s, 0))) return s; return -1; };
  // a 펑 판 (2 players unless chars), bubble 0's pop size set by seed, played to its first playing frame (my window runs)
  function puffAt(seed, chars) { party(chars || ['duck', 'cat'], { plan: ['puff'] }, 41); if (seed > 0) P.puffSeed(seed); toPlaying(); return P.puffT0(); }
  // n presses of 거품 by a seat, one every gapF frames (5: 83 ms - each one counts)
  const puffs = (slot, n, gapF) => { for (let k = 0; k < n; k++) { P.press(slot, 'shoot'); step(gapF || 5); } };
  const PST = (slot) => P.mloc(slot) || {};
  const sfxLog = [];
  function puffTests() {
    const U = K.PUFF;
    if (!sfxLog.hooked) { const A = PG.Audio, o = A.sfx; A.sfx = function (n) { sfxLog.push(n); return o.apply(A, arguments); }; sfxLog.hooked = true; }
    // puffL: pure, integers in lo..hi, every size drawn, none much likelier; another seed, another list
    const cnt = {}; let bad = 0;
    for (let s = 1; s <= 200; s++) for (let k = 0; k < 40; k++) { const v = P.puffL(s, k); if (v !== P.puffL(s, k) || v < U.lo || v > U.hi || v !== Math.floor(v)) bad++; cnt[v] = (cnt[v] | 0) + 1; }
    const vs = Object.values(cnt), lo = Math.min(...vs), hi = Math.max(...vs);
    ok('puffL: pure (the same seed and k -> the same size), integers in 40..110, all 71 sizes drawn, none much likelier (8000 draws); another seed draws another list', !bad && Object.keys(cnt).length === 71 && lo > 60 && hi < 180 && !same([0, 1, 2, 3, 4].map((k) => P.puffL(7, k)), [0, 1, 2, 3, 4].map((k) => P.puffL(8, k))), [bad, Object.keys(cnt).length, lo, hi]);
    const gold = 1 - (U.hi - 100) / (U.hi - U.lo + 1);
    ok('puffL: ' + (U.hi - 100) + ' of ' + (U.hi - U.lo + 1) + ' sizes are golden (over 100: they reach 만점), about ' + Math.round((1 - gold) * 100) + '%', U.hi - 100 === 10 && U.lo === 40);

    P.vclock(true, 1000);
    // the window: from my first draw while playing; the HUD's centre counts it down
    const sGold = seedL0((L) => L >= 101), t0 = puffAt(sGold);
    ok('window: it starts on the first frame this screen drew while playing (G.drawT); the HUD centre is my window, 0:45', t0 !== null && t0 === P.drawT() && same(P.clock(), ['0:45', false]) && P.puff().win === U.winMs, [t0, P.drawT(), P.clock(), P.puff()]);
    ok('world: false - the 펑 판 plays on 무대 목욕탕, the animals on their stage spots, no START_INV blink; noFire, cues: false', P.arenas()[PS().arena].key === 'stage' && G.players.every((p) => p.invuln === 0) && P.mini().puff.world === false && P.mini().puff.noFire && P.mini().puff.cues === false);
    // the 66 ms rule: presses 50 ms apart count every other one
    const b0 = PS().coins.bshots;
    for (let k = 0; k < 10; k++) { P.press(0, 'shoot'); step(3); }
    ok('puffs: presses 50 ms apart count every other one (one each 66 ms at most): 10 presses -> 5 puffs, 17.0%', PST(0).k === 5 && P.puffSeat(0).s10 === 170 && !G.bubbles.length, [PST(0), P.puffSeat(0)]);
    let maxMi = 0; for (let k = 0; k < 24; k++) { puffs(0, 1); maxMi = Math.max(maxMi, P.mi(0)[2]); }
    const s29 = P.puffSeat(0); puffs(0, 1); const m30 = PST(0);
    ok('만점: 30 puffs make 100% - a bubble whose pop size is over 100 (bubble 0: ' + P.puffL(sGold, 0) + ') sends itself off at the 30th for 100 points (the 29th: 98.6%), the dip follows', s29.s10 === 986 && m30.score === 100 && m30.n === 1 && m30.pops === 0 && m30.st === 1 && m30.k === 0 && G.words.some((w) => w.txt === P.tx().pfMax), [s29, m30]);
    ok('size: never over 100 (the mi\'s size stayed in 0..100: 99 at the 29th)', maxMi === 99 && P.mi(0)[2] === 0, maxMi);
    ok('coins: a send-off is one action of my seat (bshots +1)', PS().coins.bshots === b0 + 1, [PS().coins.bshots, b0]);
    puffs(0, 6);
    const dip = PST(0); step(6); puffs(0, 1);
    ok('dip: puffs in the 0.6 s after a send-off count for nothing; after it they count again', dip.k === 0 && dip.st === 1 && PST(0).k === 1 && PST(0).st === 0, [dip, PST(0)]);
    // a bank and a puff of the same frame, in their time order
    puffs(0, 9);
    let t = P.now(); P.press(0, 'shoot', t + 9); P.press(0, 'down', t + 2); step(1);
    const bp = PST(0);
    ok('order: a down 7 ms before a puff in the same frame banks first (34.0% -> 12 points) and the puff falls in the dip', bp.n === 2 && bp.score === 112 && bp.k === 0 && bp.st === 1, bp);
    step(40); puffs(0, 3); t = P.now(); P.press(0, 'down', t + 9); P.press(0, 'shoot', t + 2); step(1);
    const pb = PST(0);
    ok('order: ... a puff 7 ms before a down counts first, then the bank (4 puffs, 13.6% -> 2 points)', pb.n === 3 && pb.score === 114 && pb.k === 0, pb);
    ok('mi: a host-local seat reports [판 i, score, size, bubbles, pops, st] through local -> input (its row on the wire)', same(P.mi(0), [PS().i, 114, 0, 3, 0, 1]) && same(P.puff().rows[0], [114, 0, 3, 0, 1]) && same(P.mg()[2][0], [0, 114, 0, 3, 0, 1]) && P.mg()[0] === 'f' && P.mg()[3] === U.winMs && P.mg()[4] === 2, [P.mi(0), P.puff().rows, P.mg()]);
    // a pop exactly at L_k: L 51 - 14 puffs (47.6%) stay, the 15th (51.0%) pops; the foam then blocks puffs for 1 s
    const s51 = seedL0((L) => L === 51); puffAt(s51);
    const c1 = PS().coins.bshots; sfxLog.length = 0;
    puffs(0, 14); const a14 = P.puffSeat(0); puffs(0, 1); const p15 = PST(0);
    ok('pop: bubble k pops on the puff that brings it to L_k (L 51: 14 puffs - 47.6% - stay, the 15th - 51.0% - pops): 0 points, the foam, 펑!', a14.s10 === 476 && p15.pops === 1 && p15.n === 1 && p15.score === 0 && p15.st === 2 && p15.k === 0 && G.words.some((w) => w.txt === P.tx().pfPop), [a14, p15]);
    ok('pop: my own pop plays pop + b_splash on my page; each counted puff its own puff sound (14)', sfxLog.filter((n) => n === 'pop').length === 1 && sfxLog.includes('b_splash') && sfxLog.filter((n) => n === 'puff').length === 14, sfxLog.slice(-6));
    ok('coins: a bubble popped by puffing is one action too (bshots +1)', PS().coins.bshots === c1 + 1, [PS().coins.bshots, c1]);
    puffs(0, 10); const foam = PST(0); step(6); puffs(0, 1);
    ok('foam: puffs in the 1.0 s after a pop count for nothing; after it they count, on bubble 1 (its own pop size)', foam.k === 0 && foam.st === 2 && PST(0).k === 1 && PST(0).n === 1, [foam, PST(0)]);
    for (const Lw of [99, 100]) {
      puffAt(seedL0((L) => L === Lw)); puffs(0, 29); const a = PST(0); puffs(0, 1); const b = PST(0);
      ok('pop: L ' + Lw + ' pops on the 30th puff (the pop test comes before 만점) - 29 puffs stay', a.pops === 0 && a.k === 29 && b.pops === 1 && b.score === 0 && b.n === 1, [a, b]);
    }
    // the warnings: the tremble from 70% of L, the bigger one from 85%, the flash from 90% (tenths of a %)
    ok('warning: L 80 - 55.9% none, 56.0% the tremble, 68.0% the bigger tremble, 72.0% the flash; L 51 - 45.9% the flash, 45.8% not', P.puffWarn(559, 80) === 0 && P.puffWarn(560, 80) === 1 && P.puffWarn(679, 80) === 1 && P.puffWarn(680, 80) === 2 && P.puffWarn(719, 80) === 2 && P.puffWarn(720, 80) === 3 && P.puffWarn(459, 51) === 3 && P.puffWarn(458, 51) === 2 && P.puffWarn(0, 40) === 0);
    // the tags over the biggest bubble (tagY), never on it
    ok('tags: 펑\'s name tags sit over the biggest bubble (tagY: head - sit - 4 - 44 - 2), never on its tremble', G.players.every((p) => P.tagAnchor(p.slot) <= p.y - U.sit - 4 - 44 - 1 && P.tagAnchor(p.slot) > 100), G.players.map((p) => [p.y, P.tagAnchor(p.slot)]));

    // the bell 5 s before my window ends, then the end: a bubble in hand pops (no coin) and I am done; the 판 ends at the
    // host's time-up with every seat done
    const t0b = puffAt(sGold);
    until(() => P.now() - t0b >= U.winMs - 10000 - 60, 3000); until(() => P.clock()[1], 10);
    ok('clock: under 10 s my window\'s clock blinks red (0:10)', same(P.clock(), ['0:10', true]) && P.now() - t0b >= U.winMs - 10000, [P.clock(), P.now() - t0b]);
    until(() => P.now() - t0b >= U.winMs - U.bellMs - 120, 3000); sfxLog.length = 0;
    const fb = until(() => G.banner && G.banner.main === P.tx().pfLast1, 20), atB = P.now() - t0b;
    ok('bell: 5 s before my window\'s end - my line 마지막엔 꼭 날려요! / 안 날린 방울은 터져요 and hurry', fb >= 0 && atB >= U.winMs - U.bellMs && atB < U.winMs - U.bellMs + 17 && G.banner.sub === P.tx().pfLast2 && sfxLog.includes('hurry'), [fb, atB, G.banner]);
    puffs(0, 5); const c2 = PS().coins.bshots;
    const fe = until(() => PST(0).st === 3, 400), atE = P.now() - t0b, e0 = PST(0);
    ok('end: at 45 000 ms of my window a bubble not sent off pops (0 points, no coin) and I am done (st 3)', fe >= 0 && atE >= U.winMs && atE < U.winMs + 17 && e0.pops === 1 && e0.n === 1 && e0.score === 0 && e0.k === 0 && PS().coins.bshots === c2, [fe, atE, e0]);
    const fr = until(() => G.mode !== 'playing', 200);
    ok('end: every seat done - the 판 ends at the host\'s time-up (left 0), places by the rows', fr >= 0 && fr <= 3 && G.mode === 'result' && PS().left <= 0 && PS().mini.fin, [fr, G.mode, PS().left]);
    // the window is wall-clock: a 2 s jump of the page clock (frames dropped) ends it 120 frames sooner; the 판 then still
    // waits for the host's time-up, my done line up meanwhile
    const t0c = puffAt(sGold); step(600); P.drawAt(P.now() + 2000); const f0 = G.frame;
    until(() => PST(0).st === 3, 3000); const dF = G.frame - f0, atC = P.now() - t0c, upC = PS().left;
    step(30); const waitLine = G.mode === 'playing' && G.banner && G.banner.main === P.tx().pfDone1 && G.banner.sub === P.tx().pfDone2;
    const fr2 = until(() => G.mode !== 'playing', 400);
    ok('window: wall-clock - a 2 s jump of the page clock ends my window 120 frames sooner, still at 45 000 ms of it', Math.abs(dF - (U.winMs / (1000 / 60) - 600 - 120)) <= 1 && atC >= U.winMs && atC < U.winMs + 17 && upC > 100, [dF, atC, upC]);
    ok('end: done before the host\'s time-up - the 판 waits for it (my line stays: 다 불었어요!), then ends', waitLine && fr2 > 50 && G.mode === 'result', [waitLine, fr2, G.mode]);

    // remote seats: a junk row clamped; fewer bubbles or another 판 ignored; done stays done; a friend's pop plays on my
    // page once; the host waits waitF past its time-up for a seat that never says done, its bubble counted as popped
    puffAt(sGold, ['duck', 'cat', 'frog']); P.fakeBody(1, {}); P.fakeBody(2, {});
    const pi = PS().i, feed = (s, mi) => { P.fakeBody(s, mi ? { mi } : {}); };
    feed(1, [pi, 99999, 500, 3, 7, 0]); step(1); const j1 = P.puff().rows[1];
    feed(1, [pi, 10, 10, 2, 0, 0]); step(1); const j2 = P.puff().rows[1];
    feed(1, [pi + 1, 50, 10, 5, 0, 0]); step(1); const j3 = P.puff().rows[1];
    ok('input: a junk row is clamped (score <= 100 a bubble, size <= 100, pops <= bubbles); fewer bubbles, or another 판\'s row, is ignored', same(j1, [300, 100, 3, 3, 0]) && same(j2, j1) && same(j3, j1), [j1, j2, j3]);
    feed(1, [pi, 250, 0, 4, 3, 3]); step(1); feed(1, [pi, 400, 0, 6, 3, 0]); step(1);
    ok('input: done stays done (a later row changes nothing)', same(P.puff().rows[1], [250, 0, 4, 3, 3]), P.puff().rows[1]);
    sfxLog.length = 0; const pp0 = sfxLog.length;
    feed(2, [pi, 0, 30, 0, 0, 0]); step(1); feed(2, [pi, 0, 0, 1, 1, 2]); step(1); feed(2, [pi, 0, 0, 1, 1, 2]); step(1);
    ok('friends: a remote seat\'s pop plays pop + b_splash on the host\'s page once (from its row), its 펑! too', sfxLog.slice(pp0).filter((n) => n === 'pop').length === 1 && sfxLog.includes('b_splash') && G.words.some((w) => w.txt === P.tx().pfPop), sfxLog.slice(pp0));
    for (let f = 0; f < 4000 && PS().left > 0; f++) { feed(1); feed(2, [pi, 49, 21, 1, 1, 0]); step(1); }
    let endF = -1; for (let f = 0; f < 200 && G.mode === 'playing'; f++) { feed(1); feed(2, [pi, 49, 21, 1, 1, 0]); step(1); endF = f + 1; }
    const r2 = PS().mini.rows[2];
    ok('over: a seat still sending states but never done is waited for ' + U.waitF + ' f past the host\'s time-up; its bubble in hand then counts as popped', Math.abs(endF - U.waitF) <= 2 && G.mode === 'result' && same(r2, [49, 0, 2, 2, 3]), [endF, r2, G.mode]);
    // a stale seat (states stopped) is not waited for
    puffAt(sGold, ['duck', 'cat', 'frog']); P.fakeBody(1, {}); P.fakeBody(2, {});
    const pj = PS().i;
    for (let f = 0; f < 4000 && PS().left > 0; f++) { P.fakeBody(1, { mi: [pj, 0, 0, 0, 0, 3] }); if (f % 2 === 0 && PS().left > 200) P.fakeBody(2, { mi: [pj, 25, 0, 1, 0, 0] }); step(1); }
    const sf = until(() => G.mode !== 'playing', 200);
    ok('over: a remote seat whose states stopped (staleF) is not waited for - the 판 ends at the host\'s time-up', sf >= 0 && sf <= 3 && G.mode === 'result' && PS().mini.rows[2][4] === 3, [sf, PS().mini.rows]);
    // the place key: points, then fewer pops, then more bubbles; still equal: a shared place
    party(['duck', 'cat', 'frog', 'otter'], { plan: ['puff'] }); toPlaying();
    Object.assign(G.mini.rows, { 0: [301, 0, 9, 9, 3], 1: [300, 0, 6, 1, 3], 2: [300, 0, 4, 1, 3], 3: [300, 0, 4, 1, 3] });
    const pm = new Map(P.places());
    ok('key: more points first (301 with 9 pops wins), then fewer pops, then more bubbles; still equal - a shared place', pm.get(0) === 1 && pm.get(1) === 2 && pm.get(2) === 3 && pm.get(3) === 3, P.places());
    // a leaver mid-판: its row leaves the wire, its stall stays, the game goes on
    puffs(1, 3); P.drop(1); step(2);
    ok('leaver: one leaves mid-판 - its row leaves the wire, the stalls stay (4), the game goes on', G.mode === 'playing' && !P.mg()[2].some((q) => q[0] === 1) && P.mg()[4] === 4 && G.players.length === 3, P.mg());
    // a guest's mirror: bounded rows, the seed, the window, the stalls
    const v = P.puffView(['f', 'x', [[1, 5, 500, 3, 9, 7], ['y'], [-3, 1], [2, 30, 40, 2, 1, 1]], 99, 7]);
    ok('view: puffView bounds a junk row (size 100, pops <= bubbles, st 0-3), drops junk entries, the window >= 1 s, 2-4 stalls', v.seed === 0 && same(v.rows, { 1: [5, 100, 3, 3, 3], 2: [30, 40, 2, 1, 1] }) && v.win === 1000 && v.ns === 4, v);
    // the fast party: a 12 s window
    P.fast(true); party(['duck', 'cat'], { plan: ['puff'] });
    const fw = P.puff().win, ftot = PS().total; P.fast(false);
    ok('fast: the debug fast party gives 펑 a 12 s window (its 12 s clock)', fw === U.fastMs && ftot === 12 * 60, [fw, ftot]);
    P.vclock(false);
    // the card: the texts as specified, the demo
    party(longNicks(), { plan: ['puff'] }); step(80);
    const c = P.card();
    ok('card: 펑! 비눗방울 - its how, rule and keys lines as specified', c.name === '펑! 비눗방울' && c.how === '연타로 불고 아래로 날려요! 터지면 꽝' && c.rule === '흔들리면 조심, 반짝이면 바로 날려요 · 클수록 점수가 훨씬 커요' && c.keys === 'Z·X 연타로 불기 · ↓ 날리기' && P.mini().puff.keysT === '점프·거품 연타로 불기 · 조이스틱 아래로 날리기' && c.demo, c);
    ok('texts: 펑\'s lines are in PARTY_TX and warmed (펑! 만점! 마지막엔 꼭 날려요! 다 불었어요!)', ['펑!', '만점!', '마지막엔 꼭 날려요!', '안 날린 방울은 터져요', '다 불었어요!', '친구들을 기다려요', '펑! 비눗방울'].every((s) => P.text().indexOf(s) >= 0));
  }

  // ---------------------------------------------------------------- 5e. 살금살금 술래 (party-games 6, 13.1.5)
  const SN = () => P.sneak();
  const at = (f) => { while (G.frame < f) step(1); return G.frame === f; };
  // a 술래 판 to its first playing frame (slot 0 the first 술래); it: that seat made the 술래 of round 1
  function sneakAt(chars, it) { party(chars || ['duck', 'cat', 'frog', 'otter'], { plan: ['sneak'] }, 41); toPlaying(); if (it !== undefined) P.it(it); return SN(); }
  const walk = (slot, on) => D.press('right', !!on, slot);
  const prisonOf = (slot) => G.bubbles.find((b) => b.kind === 'player' && b.victim === pl(slot));
  // a host-local runner past the second stool, then walking until its body reaches the line (that frame)
  const toLine = (slot) => { put(slot, 186, 200); step(2); walk(slot, true); const n = until(() => SN().arr.some((a) => a[0] === slot), 30); walk(slot, false); return n; };
  // a seat made remote (its old buffer gone) and its states: each its own k (always newer), the view tick rt it showed,
  // at = now (as hostBodyIn stamps it) - rt 0: no view yet (read as now - lagMax)
  let fk = 0;
  const fake = (slot, rt, x, o) => { fk = Math.max(fk + 1, G.frame); return P.fakeBody(slot, Object.assign({ k: fk, rt, x, y: 200, vx: 0, fl: 1 }, o || {})); };
  const remote = (...slots) => { for (const s of slots) { P.fakeRemote(s, null); fake(s, 0, pl(s).x); } };
  function sneakTests() {
    const U = K.SNEAK;
    // the order: one round per player (2 players: 4 - each the 술래 twice), seat order rotated by the 판 index
    const orders = [];
    for (const chars of [['duck', 'cat'], ['duck', 'cat', 'frog'], ['duck', 'cat', 'frog', 'otter']]) {
      party(chars, { plan: ['crown', 'sneak'] }, 41); toPlaying(); P.skip(); toCard(); orders.push([SN().order, SN().n]);
    }
    ok('rounds: 2 players play 4 (each the 술래 twice), 3 play 3, 4 play 4 - the order is seat order rotated by the 판 index (2nd 판: from slot 1)', same(orders, [[[1, 0, 1, 0], 4], [[1, 2, 0], 3], [[1, 2, 3, 0], 4]]), orders);
    // the arena and the spots: the runners on the start (one x), the 술래 on its spot facing its wall; parked
    sneakAt();
    const S = P.arenas()[PS().arena].sneak;
    ok('arena: 살금살금 복도 (key sneak) - runners on the start (x 20, one x), the 술래 (slot 0) on its spot (x 212) facing the wall; the line at 200; no START_INV blink; the clock 1/4', P.arenas()[PS().arena].key === 'sneak' && S.line === 200 && pl(0).x === 212 && [1, 2, 3].every((s) => pl(s).x === 20 && pl(s).y === 200) && pl(0).facing === 1 && G.players.every((p) => p.invuln === 0) && SN().r === 1 && SN().it === 0 && SN().ph === 0 && P.clock() === '1/4',
      [S, G.players.map((p) => [p.x, p.y, p.invuln]), SN().r, SN().it, P.clock()]);
    // the base kit, no bubbles, everyone creeps at WALK x 0.7; the 술래 never moves
    const bs0 = PS().coins.bshots, x0 = pl(0).x; walk(1, true); D.press('left', true, 0); step(12); const v1 = pl(1).vx; walk(1, false); D.press('left', false, 0); step(4);
    D.press('shoot', true, 2); step(2); D.press('shoot', false, 2); step(2);
    ok('kit: the base kit for everyone - a runner walks at 0.875 px/f (WALK x 0.7); the 술래\'s body never moves (parked); a 거품 press blows nothing', Math.abs(v1 - 0.875) < 1e-9 && pl(0).x === x0 && !G.bubbles.length && PS().coins.bshots === bs0 && P.parked(0) && !P.parked(1), [v1, pl(0).x, x0, G.bubbles.length]);
    // the chant: presses queue (at most 3), one syllable every 6 f; the 술래's mi [판 i, presses, feints]
    sneakAt(); step(6);
    for (let k = 0; k < 5; k++) P.press(0, 'shoot'); step(1);
    const lit = [[G.frame, SN().syl]]; for (let k = 0; k < 14; k++) { step(1); if (SN().syl !== lit[lit.length - 1][1]) lit.push([G.frame, SN().syl]); }
    ok('chant: five presses in a frame - 3 wait, one syllable every 6 f (1, 2, 3), then nothing; the 술래\'s mi carries all its presses', same(lit.map((q) => q[1]), [1, 2, 3]) && lit[1][0] - lit[0][0] === U.sylF && lit[2][0] - lit[1][0] === U.sylF && same(P.mi(0), [PS().i, 5, 0]), [lit, P.mi(0)]);
    // the auto-advance: 60 f with no press, then every 24 f; 욕 -> 탕! 21 f later (the banner), the look
    sneakAt(); const rs = SN().rs, sylAt = [];
    for (let f = 0; f < 60 + 24 * 5 + 2 && SN().syl < 6; f++) { const s0 = SN().syl; step(1); if (SN().syl !== s0) sylAt.push(G.frame - rs); }
    const T1 = SN().T, yok = G.frame;
    at(T1 - 1); const pre = SN().syl; step(1);
    ok('chant: idle, it moves on by itself - the 1st syllable 60 f into the round, then every 24 f; 욕 the 6th', same(sylAt, [60, 84, 108, 132, 156, 180]), sylAt);
    ok('chant: T = 욕 + 21 - 탕! (the one banner) and the look (pips red) on that frame, not before', T1 === yok + U.tangF && pre === 6 && SN().syl === 7 && G.banner && G.banner.main === '탕!' && P.sneakSyl() === 7, [T1, yok, pre, SN().syl, G.banner]);
    at(T1 + U.lookF);
    ok('chant: lookF after T the look ends and the chant starts again (0 pips)', SN().syl === 0 && SN().T === T1 && P.sneakSyl() === 0, SN().syl);
    // the feint: the 술래's 점프 from syllable 3 until 욕, once a chant
    sneakAt(); step(6);
    P.press(0, 'shoot'); P.press(0, 'shoot'); step(8); P.press(0, 'jump'); step(1); const fe0 = SN().feintT;
    P.press(0, 'shoot'); step(7); P.press(0, 'jump'); step(1); const fe1 = SN().feintT, feAt = G.frame;
    P.press(0, 'jump'); step(1); const fe2 = SN().feintT;
    ok('feint: a 점프 before syllable 3 does nothing; at syllable 3 흠칫! (once a chant - a second 점프 does nothing)', fe0 === -1 && fe1 === feAt && fe2 === fe1 && SN().fUsed, [fe0, fe1, fe2, feAt, SN().syl]);
    sneakAt(); P.look(); step(2); P.press(0, 'jump'); step(1);
    ok('feint: none once 욕 is lit', SN().feintT === -1, SN().feintT);

    // the look's edges (host-local runners, judged frame by frame): stopped by T+10 safe; still walking at T+12 caught (its
    // vx - only 1.25 px past the anchor); a hop caught (in the air)
    sneakAt(); for (const s of [1, 2, 3]) put(s, 96, 200); step(3);
    let T = P.look(); at(T - 14); for (const s of [1, 2, 3]) walk(s, true);
    at(T + 8); walk(1, false); at(T + 11); walk(2, false); D.press('jump', true, 3); step(1); D.press('jump', false, 3); walk(3, false);
    at(T + 30);
    ok('look: a runner that let go of the stick at T+9 is safe; one still walking at T+12 is caught (its vx, 1.25 px past its anchor); one that hops is caught (in the air)', !pl(1).trap && !!pl(2).trap && !!pl(3).trap && SN().catches[0] === 2, [pl(1).trap, !!pl(2).trap, !!pl(3).trap, SN().catches]);
    const b2 = prisonOf(2);
    ok('catch: a prison owned by the 술래 (최다 가두기상 counts it), +1 a catch for the 술래', b2 && b2.owner === 0 && P.counts().caps[0] === 2 && SN().pts[0] === 2, [b2 && b2.owner, P.counts(), SN().pts]);
    for (let k = 0; k < 8 && pl(2).trap; k++) { D.mash(2); step(1); }
    const fr = !pl(2).trap; step(20);
    ok('look: a runner mashed out in the middle of the look is not caught again by its release hop (freed after T+10-30: exempt for the rest of it); its escape counts (3+ presses)', fr && !pl(2).trap && SN().catches[0] === 2 && (P.counts().esc[2] | 0) === 1, [fr, !!pl(2).trap, SN().catches, P.counts().esc]);
    // the drift (a prison alone: two side by side push apart)
    sneakAt(['duck', 'cat']); put(1, 140, 200); step(3); D.trapPlayer(1, 0); step(30); const bx0 = prisonOf(1).x, by0 = prisonOf(1).y; step(10);
    ok('catch: a prison drifts back toward the start at 1.2 px/f, over the stools (y 188)', Math.abs(bx0 - prisonOf(1).x - 12) < 0.01 && Math.abs(by0 - 188) < 0.01, [bx0, prisonOf(1).x, by0]);
    // 1.9 px safe, 2 px caught (set by hand: standing bodies); trapped and arrived runners are not judged
    sneakAt(); toLine(3); T = P.look(); at(T + 20);
    D.trapPlayer(2, 0); pl(1).x += 1.9; step(2); const safe19 = !pl(1).trap; pl(1).x += 0.1; pl(3).x -= 5; step(2);
    ok('look: 1.9 px from the anchor is safe, 2 px caught; a runner already trapped or arrived is not judged', safe19 && !!pl(1).trap && SN().catches[0] === 1 && SN().arr.some((a) => a[0] === 3) && !pl(3).trap, [safe19, !!pl(1).trap, SN().catches, SN().arr]);
    // the 3 a round cap: one round, every runner caught twice
    sneakAt(); for (const s of [1, 2, 3]) put(s, 96, 200); step(3);
    for (let k = 0; k < 2; k++) {
      T = P.look(); at(T + 5); for (const s of [1, 2, 3]) walk(s, true); at(T + 20); for (const s of [1, 2, 3]) walk(s, false);
      at(T + U.lookF + 1); until(() => [1, 2, 3].every((s) => !pl(s).trap), 200); step(40);
    }
    ok('catch: points capped at 3 a round (6 catches -> +3); 최다 가두기상 counts every one', SN().catches[0] === 6 && SN().pts[0] === 3 && P.counts().caps[0] === 6, [SN().catches, SN().pts, P.counts().caps]);

    // arrival: the body box reaching the line - parked there from that frame, 도착!, 3초!; points 3 / 2 / 1 by stamp
    sneakAt(); put(1, 186, 200); put(2, 186, 200); step(2); walk(1, true);
    until(() => pl(1).x + 12 >= 200, 30); const fa = G.frame, xa = pl(1).x; step(3); walk(2, true); until(() => SN().arr.length === 2, 30); walk(1, false); walk(2, false);
    ok('arrive: a runner whose body reaches the line has arrived on that frame (its stamp) and stands parked there, 3초! / 빨리 와요! starts', SN().arr[0][0] === 1 && SN().arr[0][1] === fa && pl(1).x === xa && P.parked(1) && G.banner && G.banner.main === '3초!' && G.banner.sub === '빨리 와요!', [SN().arr, fa, pl(1).x, xa, G.banner]);
    const end = SN().end;
    ok('3초!: the round\'s end is the first stamp + 180 f', end === fa + U.hurryF, [end, fa]);
    at(end); const sw = SN();
    ok('round: at the 3초! end it closes - arrivals 3 / 2 by stamp, 0 for the one that never came; the swap: 다음 술래 (slot 1), everyone back on the spots', sw.ph === 1 && sw.it === 1 && sw.pts[1] === 3 && sw.pts[2] === 2 && !sw.pts[3] && pl(1).x === 212 && [0, 2, 3].every((s) => pl(s).x === 20) && G.banner && G.banner.main.indexOf('다음 술래: ') === 0 && G.banner.sub === '술래가 돌아보면 멈춰요!',
      [sw.ph, sw.it, sw.pts, G.players.map((p) => p.x), G.banner]);
    at(sw.swapAt + U.swapF);
    ok('swap: 72 f later round 2 starts with its 술래 (2/4), the arrivals cleared', SN().r === 2 && SN().ph === 0 && SN().it === 1 && P.clock() === '2/4' && !SN().arr.length, [SN().r, SN().ph, P.clock()]);

    // remote runners judged from their states (fakeBody: each its own k, its view's rt, its epoch)
    party(['duck', 'cat', 'frog'], { plan: ['sneak'] }, 41); toPlaying(); remote(1, 2);
    T = P.look();
    // slot 1: walked until its own T+5 and stood still - its states arrive 40 f late; slot 2: its rt stuck 90 f back
    // (read as host - 60), walking through
    let x1 = 20, x2 = 20, c2 = -1;
    while (G.frame < T + 140) {
      const r1 = G.frame - 40; if (r1 <= T + 5) x1 += 0.875; fake(1, r1, x1, { vx: r1 <= T + 5 ? 0.875 : 0 });
      x2 += 0.875; fake(2, G.frame - 90, x2, { vx: 0.875 });
      step(1); if (pl(2).trap && c2 < 0) c2 = G.frame;
    }
    ok('remote: a runner that stopped at its own T+5 is safe though all its states arrive 40 f late', !pl(1).trap && SN().catches[0] === 1, [!!pl(1).trap, SN().catches]);
    ok('remote: a runner whose rt is stuck 90 f back is judged at host - 60 (lagMax): caught once that reaches T+12', c2 >= T + 72 && c2 <= T + 74, [c2, T]);
    // vx at T+12 within 2 px; states at T+0 and T+40 only; an older epoch; rt stepping back
    party(['duck', 'cat', 'frog', 'otter'], { plan: ['sneak'] }, 41); toPlaying(); remote(1, 2, 3);
    T = P.look(); at(T + 14);
    fake(1, T + 10, 100, { vx: 0.875 }); fake(1, T + 12, 101, { vx: 0.875 });
    fake(2, T, 100, { vx: 0.875 }); fake(2, T + 40, 107);
    fake(3, T + 10, 60); fake(3, T + 20, 90, { ep: pl(3).ep - 1, vx: 0.875 }); fake(3, T + 30, 60);
    step(1);
    ok('remote: a state at T+12 with vx 0.875 catches it though it is only 1 px past its anchor', !!pl(1).trap, pl(1).trap);
    ok('remote: a runner with states at T+0 and T+40 only (it stopped at T+9) is never caught - no anchor made up between them', !pl(2).trap);
    ok('remote: a state of an older epoch (the body before a catch or a swap) is never judged', !pl(3).trap);
    at(T + 40); fake(3, T + 41, 60); fake(3, T - 19, 60); fake(3, T - 18, 60); step(1);
    const rtm = SN().rtMax[3];
    ok('remote: rt stepping back by 60 mid-look is read monotonic (still T+41) - a runner that stopped is not caught', !pl(3).trap && rtm === T + 41, [rtm, T]);
    at(T + 180); fake(3, T + 180, 60); step(1); fake(3, T + 125, 194); fake(2, T + 150, 194); step(1);
    ok('arrive: by the stamp, not by when it reached the host - a stepped-back stamp is read monotonic (slot 3 at T+180, not T+125: after slot 2\'s T+150)', same(SN().arr, [[2, T + 150], [3, T + 180]]), [SN().arr, T]);
    // a look still judged when the next 탕! comes (a mashed chant turns again at T+147 at the earliest, its judging may
    // stay open to T+150): a late state of the first look still catches
    party(['duck', 'cat', 'frog'], { plan: ['sneak'] }, 41); toPlaying(); remote(1);
    const Ta = P.look(); at(Ta + 12); fake(1, Ta + 10, 50); at(Ta + U.lookF + 1); P.look(Ta + 147); at(Ta + 148);
    const two = SN().Js.length; fake(1, Ta + 88, 60); step(1);
    ok('look: the next 탕! at T+147 while a look is still judged keeps both - a late state of the first one (rt T+88, 10 px past its anchor, reaching the host at T+148) still catches', two === 2 && !!pl(1).trap && SN().catches[0] === 1, [two, !!pl(1).trap, SN().catches]);
    at(Ta + 147 + U.lookF + U.lagMax);
    ok('look: each look closes on its own (lagMax after its end with no state past it)', SN().Js.length === 0, SN().Js);
    // arrivals 12 f apart, the earlier stamp reaching the host later; catch + arrival in one state -> caught
    party(['duck', 'cat', 'frog', 'otter'], { plan: ['sneak'] }, 41); toPlaying(); remote(1, 2, 3);
    step(20); const fr0 = G.frame; fake(1, fr0, 190); step(4); fake(2, fr0 - 12, 190); step(1);
    ok('arrive: frames 12 apart - the one whose state reached the host later but with the earlier stamp is first', same(SN().arr, [[2, fr0 - 12], [1, fr0]]), SN().arr);
    T = P.look(); at(T + 12); fake(3, T + 10, 150); fake(3, T + 12, 190); step(1);
    ok('catch + arrival in one state: caught (not arrived)', !!pl(3).trap && !SN().arr.some((a) => a[0] === 3), [pl(3).trap, SN().arr]);
    // a remote 술래's chant: its mi [판 i, presses, feints] - a rise joins the queue; a runner's or another 판's counts nothing
    party(['duck', 'cat', 'frog'], { plan: ['sneak'] }, 41); toPlaying(); remote(1, 2); P.it(1); step(8);
    fake(1, 0, 212, { mi: [PS().i, 2, 0] }); fake(2, 0, 20, { mi: [PS().i, 9, 0] }); step(1); const q1 = SN().syl; step(6); const q2 = SN().syl;
    fake(1, 0, 212, { mi: [PS().i + 1, 9, 0] }); step(8);
    ok('remote 술래: its mi\'s presses light syllables (2 -> 1, then 2 six frames later); a runner\'s mi or another 판\'s counts nothing', q1 === 1 && q2 === 2 && SN().syl === 2, [q1, q2, SN().syl]);
    // the 3초! end waits for a remote runner still running: its first state past the end closes it, else lagMax later
    sneakAt(['duck', 'cat', 'frog']); remote(2); toLine(1);
    const e2 = SN().end; at(e2 + 20); fake(2, e2 - 1, 40); step(1); const open1 = SN().ph === 0;
    at(e2 + 30); fake(2, e2 + 1, 40); step(1);
    ok('3초!: past the end the host waits for the remote runner still running - it closes on its first state past the end', open1 && SN().ph === 1, [open1, SN().ph, e2]);
    sneakAt(['duck', 'cat', 'frog']); remote(2); toLine(1);
    const e3 = SN().end; at(e3 + U.lagMax - 1); const open2 = SN().ph === 0; step(1);
    ok('3초!: ... or lagMax (60 f) after the end when none comes', open2 && SN().ph === 1, [open2, SN().ph]);
    // the 술래 leaving ends its round at once: catches kept, no arrival points
    sneakAt(['duck', 'cat', 'frog']); toLine(1); put(2, 96, 200); step(2);
    T = P.look(); at(T - 5); walk(2, true); at(T + 20); walk(2, false);
    const cb = SN().pts[0]; P.drop(0); step(1);
    ok('leaver: the 술래 leaves - its round ends at once (its catch kept, no arrival points), the swap to the next 술래 with the 2 left', SN().ph === 1 && !SN().pts[1] && cb === 1 && SN().it === 1 && G.players.length === 2, [SN().ph, SN().pts, cb, SN().it]);
    // a leaver on the card: the order is drawn again from the 2 left (3rd 판: [2, 0, 1] -> [0, 2, 0, 2]) - the new first 술래
    // goes to its spot and the old one back on the start (left past the line it would arrive at once: a free 3 points)
    party(['duck', 'cat', 'frog'], { plan: ['crown', 'water', 'sneak'] }, 41); toPlaying(); P.skip(); toCard(); toPlaying(); P.skip(); toCard();
    const oc = SN().order.slice(); P.drop(1); step(1); toPlaying(); step(3);
    ok('leaver on the card: the 술래 order drawn again from the 2 left - the new first 술래 on its spot (x 212), the old one on the start (x 20), nobody arrived', same(oc, [2, 0, 1]) && same(SN().order, [0, 2, 0, 2]) && SN().it === 0 && pl(0).x === 212 && pl(2).x === 20 && !SN().arr.length && !SN().pts[2],
      [oc, SN().order, SN().it, pl(0) && pl(0).x, pl(2) && pl(2).x, SN().arr, SN().pts]);
    // the 4-player 판: every round at its cap and every wait at lagMax still plays its 4th round (before the 80 s cap)
    party(['duck', 'cat', 'frog', 'otter'], { plan: ['sneak'] }, 41); toPlaying(); remote(1, 2, 3);
    const rr = []; const done4 = until(() => { const m = SN(); if (m && rr[rr.length - 1] !== m.r) rr.push(m.r); return G.mode !== 'playing'; }, 80 * 60 + 100);
    ok('end: 4 rounds each at its cap (13 s), 60 f of waiting each and the swaps - the 판 ends by its 4th round, not the 80 s cap', same(rr, [1, 2, 3, 4]) && done4 > 0 && PS().left > 0, [rr, done4, PS().left]);
    // the key: points, then fewer frames to arrive
    sneakAt(['duck', 'cat', 'frog']); Object.assign(G.mini, { pts: { 0: 4, 1: 4, 2: 4 }, arrSum: { 0: 900, 1: 800, 2: 900 } });
    const pm = new Map(P.places());
    ok('key: equal points - fewer frames to arrive places higher; equal again - a shared place', pm.get(1) === 1 && pm.get(0) === 2 && pm.get(2) === 2, P.places());
    // coins on my own seat (slot 0): a look survived free after 16 px of progress; my arrival; my chant of 3 presses to 탕!
    sneakAt(['duck', 'cat'], 1); const cA = PS().coins.bshots;
    walk(0, true); step(30); walk(0, false); T = P.look(); at(T + U.lookF + 1); const cB = PS().coins.bshots;
    toLine(0); step(2); const cC = PS().coins.bshots;
    sneakAt(['duck', 'cat']); step(6); const cD = PS().coins.bshots;
    for (let k = 0; k < 3; k++) { P.press(0, 'shoot'); step(6); } T = P.look(); at(T + 1); const cE = PS().coins.bshots;
    ok('coins: my own seat - a look survived free after 16+ px (1), my arrival (1); as the 술래 my chant of 3 presses reaching 탕! (1)', cB - cA === 1 && cC - cB === 1 && cE - cD === 1, [cA, cB, cC, cD, cE]);
    // the guest's mirror: bounded
    const v = P.sneakView(['s', 2, 9, 12, 500, 'x', -5, 700, [3, 3, 'y', 1], [0, 2, 0, 0], [3, -2, 0, 1], 7, 99, [0, 1, 'z', 2], 300]);
    ok('view: sneakView bounds a junk row (seats 0-3, syllables 0-7, phase 0-2, rounds <= 8), drops junk entries', v.r === 2 && v.it === 3 && v.syl === 7 && v.T === 500 && v.feintT === -1 && v.first === -1 && same(v.arr, [[3, 0], [1, 0]]) && same(v.catches, { 1: 2 }) && same(v.pts, { 0: 3, 3: 1 }) && v.ph === 2 && v.n === 8 && same(v.order, [0, 1, 2]) && v.rs === 300, v);
    // the fast party: 2 rounds of 6 s in its 30 s
    P.fast(true); party(['duck', 'cat', 'frog'], { plan: ['sneak'] }); const fn = SN().n, ftot = PS().total; toPlaying(); const fcap = SN().capF; P.fast(false);
    ok('fast: the debug fast party plays 2 rounds of 6 s (fastSecs 30)', fn === 2 && fcap === 360 && ftot === 30 * 60, [fn, fcap, ftot]);
    // the card: the texts as specified, the order line, the demo
    party(longNicks(), { plan: ['crown', 'sneak'] }); toPlaying(); P.skip(); toCard(); step(80);
    const c = P.card();
    ok('card: 살금살금 술래 - its how, rule and keys lines as specified; the order line 술래 순서: (from slot 1 in the 2nd 판)', c.name === '살금살금 술래' && c.how === '술래가 돌아보면 멈춰! 먼저 닿으면 3점' && c.rule === '모두 한 번씩 술래 · 움직이다 들키면 거품에 갇혀 뒤로 · 술래는 잡을 때마다 1점' && c.keys === '←→ 살금살금 · Z 점프 · 술래는 X 연타' && P.mini().sneak.keysT === '조이스틱 걷기 · 점프 · 술래는 거품 연타'
      && c.team && same(c.teams, [1, 2, 3, 0].map((s) => longNicks()[s].nick)) && $('pg-party-team').textContent.indexOf('술래 순서:') === 0 && c.demo, c);
    ok('texts: 술래\'s lines are in PARTY_TX and warmed', ['술래 순서: ', '다음 술래: ', '이번엔 내가 술래!', '거품 연타로 외쳐요', '이번 술래: 나!', '뽀득뽀득목욕탕', '탕!', '들켰다!', '흠칫!', '도착!', '움직였어요!', '연타로 빠져나와요', '3초!', '빨리 와요!', '살금살금 술래', '→'].every((s) => P.text().indexOf(s) >= 0));
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
    ok('no KO: the trap is short - MINI_TRAP 90 f (mash out faster as in battle)', K.MINI_TRAP === 90);
    put(1, 20, 40); step(2);   // (the freed one out of the way: its touch would free the next prison)
    const e0 = P.counts().esc[2] | 0;
    D.trapPlayer(2, 0); const t0 = G.frame; until(() => !pl(2).trap, 200);
    ok('no KO: ... left alone it lets go after 90 f', Math.abs(G.frame - t0 - 90) <= 2, G.frame - t0);
    ok('no KO: addScore does nothing in a party (empty pops pay no 10 points)', G.players.every((p) => p.score === 0));
    ok('awards: the timer alone is no 탈출', (P.counts().esc[2] | 0) === e0, P.counts());
  }

  // ---------------------------------------------------------------- 7. the card (polish 3.2)
  function cardFlowTests() {
    party(['duck', 'cat', 'frog'], { plan: ['crown', 'water', 'crown'] });
    let c = P.card();
    ok('card: the title splash first (.is-splash): the round line and the name only', c.shown && c.view === 'card' && c.splash && c.round === '1판 / 3판' && c.name === '왕관 뺏기' && !c.howShown && !c.button && !c.x2, c);
    step(71); c = P.card();
    ok('card: ... for PARTY_F.splash (72 f)', c.splash && PS().t === 71, [c.splash, PS().t]);
    step(1); c = P.card();
    ok('card: then the how-to - the demo, the how and keys lines, the ready row (a chip a player, none ready), 준비 완료! (Z) and the bar line (N초 뒤 시작)', !c.splash && c.howShown && c.demo && c.how === P.mini().crown.how && c.keys === P.tx().keys && c.ready.length === 3 && c.ready.every((r) => !r.ok) && c.button && c.button.text === P.tx().readyK && !c.button.disabled && c.barText === '9초 뒤 시작', c);
    step(130);
    ok('card: the bar line counts down once a second', P.card().barText === '7초 뒤 시작', P.card().barText);
    // a press before P.t 12 is ignored; one at 12 counts (its 'ready')
    party(['duck', 'cat', 'frog'], { plan: ['crown', 'water', 'crown'] });
    step(5); tap('jump', 1); step(1);
    const early = !!PS().rdy[1];
    until(() => PS().t >= 13, 20); tap('shoot', 1);
    ok('card: a press before P.t 12 is ignored (one held from the beat before); a jump / shoot press after it is 준비', !early && PS().rdy[1] === 1, [early, PS().rdy]);
    tap('jump', 0); until(() => PS().t >= 80, 100); c = P.card();
    ok('card: the ready row marks each ready seat; my own (slot 0 offline) turns the button into 준비됐어요!', c.ready[0].ok && c.ready[1].ok && !c.ready[2].ok && c.button.text === P.tx().readyDone && c.button.disabled, c);
    // everyone ready at 40 f -> the card ends at cardMin 150; at 300 f -> 330; nobody ready -> the auto start 600
    const endAt = (readyT) => { party(['duck', 'cat', 'frog'], { plan: ['crown', 'water', 'crown'] }); until(() => PS().t >= readyT, 700); if (readyT >= 0) for (const p of G.players) P.ready(p.slot); until(() => G.mode !== 'card', 800); return PS().t; };
    const e40 = endAt(40), e300 = endAt(300), eNone = endAt(9999);
    ok('card: all ready at 40 f -> the 3-2-1 at 150 (never before cardMin); at 300 f -> 330 (allIn 30 later); nobody -> 600 (auto)', e40 === 150 && e300 === 330 && eNone === 600, [e40, e300, eNone]);
    party(['duck', 'cat', 'frog'], { plan: ['crown', 'water', 'crown'] }); until(() => PS().t >= 20, 40); for (const p of G.players) P.ready(p.slot); until(() => PS().t >= 80, 100);
    ok('card: everyone ready - the bar line says 모두 준비됐어요!', P.card().barText === P.tx().allReady, P.card().barText);
    // a game already played in this party: the auto start at 360
    party(['duck', 'cat'], { plan: ['crown', 'water', 'crown'] });
    toPlaying(); P.skip(); toCard(); readyAll(); toPlaying(); P.skip(); toCard();
    ok('card: (setup) the 3rd card is a crown 판 again', PS().i === 2 && PS().mini.id === 'crown' && PS().auto === 360, [PS().i, PS().mini.id, PS().auto]);
    const t360 = until(() => G.mode !== 'card', 500);
    ok('card: ... a game already played starts on its own after 6 s (360 f)', PS().t === 360 || t360 === 360, [t360, PS().t]);
    // a leaver during the card who was the last not ready: the card ends (allIn later, never before cardMin)
    party(['duck', 'cat', 'frog'], { plan: ['crown', 'water', 'crown'] });
    until(() => PS().t >= 40, 60); P.ready(0); P.ready(1);
    until(() => PS().t >= 200, 200); P.drop(2);
    until(() => G.mode !== 'card', 100);
    ok('card: the last one not ready leaves at 200 f -> the 3-2-1 at 230', G.mode === 'countdown' && PS().t === 230, [G.mode, PS().t]);
    // a re-drawn card (4 -> 3 on a 축구 card: another game, the same 판 index): a remote seat's pr for the game before
    // does not count on it; a press after a state without it does
    party(['duck', 'cat', 'frog', 'penguin'], { plan: ['ball', 'water', 'crown'] });
    const gid = D.mp && D.mp.state ? D.mp.state().gid : 0;
    P.fakeRemote(1, { gid, pr: 0 }); until(() => PS().t >= 14, 30);
    const rd0 = !!PS().rdy[1];
    P.drop(3); step(1);
    const id1 = PS().mini.id; until(() => PS().t >= 20, 40);
    const stale = !!PS().rdy[1];
    P.fakeRemote(1, { gid, pr: -1 }); step(2); P.fakeRemote(1, { gid, pr: 0 }); step(2);
    ok('card: a re-drawn card (4 -> 3 on 축구) - a remote seat\'s 준비 for the game before does not count; a press after a state without it does', rd0 && id1 !== 'ball' && !stale && !!PS().rdy[1], [rd0, id1, stale, PS().rdy]);
    // the countdown's 2 / 1 on the last 판 say 점수 2배; 시작! plays mg_go
    party(['duck', 'cat'], { plan: ['crown'] }); readyAll();
    until(() => G.mode === 'countdown' && G.banner && G.banner.main === '2', 300);
    ok('countdown: the last 판\'s 2 / 1 say 1판 / 1판 · 마지막 판! · 점수 2배', G.banner.sub === '1판 / 1판 · 마지막 판! · 점수 2배', G.banner.sub);
  }

  // ---------------------------------------------------------------- 8. the result beats, the tally, the awards (3.4 - 3.9)
  function beatTests() {
    party(['duck', 'cat', 'frog', 'penguin'], { plan: ['crown', 'water', 'crown'] });
    const seq = []; let last = '', since = 0;
    const note = () => { const b = G.mode === 'result' ? P.beat().b + P.beat().bk : G.mode; if (b !== last) { if (last) seq.push([last, since]); last = b; since = 0; } };
    for (let f = 0; f < 9000 && G.mode !== 'podium'; f++) {
      if (G.mode === 'card' && PS().t === 12) readyAll();
      if (G.mode === 'playing' && PS().mini.t === 60) { if (PS().mini.id === 'crown') P.crown(PS().i === 0 ? 1 : 2); }
      if (G.mode === 'playing' && PS().mini.t === 150) { if (PS().i === 2) { pl(0).invuln = 0; D.trapPlayer(0, 3); } P.skip(); }
      note(); step(1); since++;
    }
    note(); seq.push([last, since]);
    info('beats: ' + seq.map((q) => q[0] + ' ' + q[1]).join(' > '));
    const rs = seq.filter((q) => /^[fwtsaAz]\d$/.test(q[0]));
    const L = K.PARTY_F, want = [['f0', L.finish], ['w0', L.win], ['t0', L.tally], ['f0', L.finish], ['w0', L.win], ['t0', L.tally], ['s0', L.stand], ['f0', L.finish], ['w0', L.win], ['t0', L.tally], ['a0', L.awardIn]];
    ok('beats: 1판 f w t -> the card; 2판 (the second-to-last) f w t s -> the card; the last f w t -> a 보너스상! ... - each exactly its PARTY_F frames', same(rs.slice(0, want.length), want), rs.slice(0, 12));
    const aw = rs.filter((q) => q[0][0] === 'A');
    ok('beats: ... then each award (108 f) and 최종 순위 (96 f), then the podium', aw.length >= 1 && aw.every((q) => q[1] === L.award) && same(rs[rs.length - 1], ['z0', L.final]) && G.mode === 'podium', rs.slice(10));
    // the awards of that party: 판 won by 1 (crown), 2 (crown) and - the last crown 판 - nobody touched water's... (P.awards)
    const A = PS().A || [];
    info('awards: ' + JSON.stringify(A) + ' bonus ' + JSON.stringify(PS().bonus));
    ok('awards: 최다 가두기상 to slot 3 (the one rival it trapped) with its +2점; the podium order and p.score include the bonuses', A.some((a) => a[0] === 'c' && same(a[2], [3]) && a[1] === 1) && PS().bonus[3] >= 2 && G.players.every((p) => p.score === PS().pts[p.slot]), [A, PS().bonus]);
    const pd = PS().podium, stand = P.standings({ pts: PS().pts, wins: PS().wins, last: PS().last }, G.players.map((p) => p.slot));
    ok('awards: ... the podium is the standing with the bonuses in it', same(pd.order, stand.map((q) => q.slot)), [pd.order, stand]);
    // the host's skip: never 끝! (f), from skipMin (30 f) into every other beat; the card and the 3-2-1 never
    party(['duck', 'cat', 'frog'], { plan: ['crown', 'water', 'crown'] });
    step(20);
    const sCard = P.skipBeat();
    readyAll(); until(() => G.mode === 'countdown', 300); step(10);
    const sCount = P.skipBeat();
    until(() => G.mode === 'playing', 300); P.crown(1); step(60); P.skip();
    step(40); const sF = P.skipBeat(), bF = P.beat().b;
    toBeat('w'); step(29); const sW29 = P.skipBeat(); step(1); const sW30 = P.skipBeat(), bAfter = P.beat();
    ok('skip: never on the card, the 3-2-1 or 끝!; the winner stage not before 30 f, then it jumps to the tally\'s start', !sCard && !sCount && !sF && bF === 'f' && !sW29 && sW30 && bAfter.b === 't' && bAfter.bt === 0, [sCard, sCount, sF, bF, sW29, sW30, bAfter]);
    step(30); const sT = P.skipBeat();
    ok('skip: ... the tally -> the next card', sT && G.mode === 'card' && PS().i === 1, [sT, G.mode]);
    readyAll(); toPlaying(); P.skip(); toBeat('s');
    step(30); const sS = P.skipBeat();
    ok('skip: ... 마지막 판! -> the last card', sS && G.mode === 'card' && PS().i === 2, [sS, G.mode, PS().i]);
    // a press of a local player skips too (offline: anyone's)
    readyAll(); toPlaying(); P.crown(2); step(30); pl(0).invuln = 0; D.trapPlayer(0, 2); P.skip(); toBeat('w'); step(31);
    tap('jump', 2); step(1);
    ok('skip: offline any local player\'s press skips a beat', P.beat().b === 't', P.beat());
    // the tally: the rows in the standing before this 판 with +N, counting up; then re-sorted with ▲ / ▼
    const tv = P.card();
    ok('tally: the tally view - 3판 결과 with its 점수 2배! chip, the rows in the standing before the 판', tv.view === 'tally' && tv.name === '3판 결과' && tv.sub === P.tx().x2 && tv.board.length === 3, tv);
    step(50);
    const mid = P.card().board;
    until(() => P.beat().bt >= 100, 100);
    const done = P.card().board;
    info('tally rows mid ' + JSON.stringify(mid.map((r) => [r.nick, r.pts, r.gain])) + ' done ' + JSON.stringify(done.map((r) => [r.place, r.nick, r.pts, r.gain, r.mv])));
    const st = P.standings({ pts: PS().pts, wins: PS().wins, last: PS().last }, [0, 1, 2]);
    ok('tally: after bt 96 the rows are in the new standing with the final points, +N kept, ▲ on a row that rose', same(done.map((r) => r.place), st.map((q) => String(q.place))) && done.every((r, i) => r.pts === PS().pts[st[i].slot] + '점') && done.some((r) => /^▲\d$/.test(r.mv)), [done, st]);
    ok('tally: the host\'s (offline: this screen\'s) 방장: 눌러서 넘기기 from 30 f', P.card().skip);
    // awards: the counters and partyAwards
    const C = P.counts();
    ok('awards: caps counts rival traps (slot 2 trapped slot 0 once in this 판, slot 1 earlier)', (C.caps[2] | 0) >= 1, C);
    G.party.wins = { 0: 2, 1: 2, 2: 0 }; G.party.caps = { 0: 0, 1: 0, 2: 0 }; G.party.esc = { 0: 1, 1: 1, 2: 1 };
    const aw1 = P.awards();
    ok('awards: the top value wins, ties share it; none for a top of 0, none when everyone has it', same(aw1, [['w', 2, [0, 1]]]), aw1);
    G.party.caps = { 0: 3, 1: 1, 2: 0 }; G.party.esc = { 0: 0, 1: 4, 2: 0 };
    const aw2 = P.awards();
    ok('awards: in AWARDS order (1등 · 가두기 · 탈출)', same(aw2, [['w', 2, [0, 1]], ['c', 3, [0]], ['e', 4, [1]]]), aw2);
    // the awards' beats: a -> A k (the +2점 at bt 18) -> z; an empty list goes straight to z
    until(() => !beatIs('t'), 200);
    ok('awards: the last tally -> 보너스상! / 상마다 +2점 (the counters as set: three awards)', beatIs('a') && P.card().view === 'award' && P.card().name === P.tx().awardsH && P.card().sub === P.tx().awardsSub && PS().A.length === 3, [P.beat(), P.card()]);
    toBeat('A'); step(5);
    const pts0 = PS().pts[0], av = P.card();
    ok('awards: an award - its name, line, winners (공동 수상! for two), its value and +2점', av.name === '최다 1등상' && av.award && av.award.line === '1등을 가장 많이 했어요' && av.award.tie && av.award.winners.length === 2 && av.award.value === '2번+2점', av);
    until(() => P.beat().bt >= 18, 20); step(1);
    ok('awards: ... its +2점 lands at bt 18 (P.pts, the bonus, p.score)', PS().pts[0] === pts0 + 2 && PS().bonus[0] === 2 && pl(0).score === PS().pts[0], [pts0, PS().pts[0], PS().bonus]);
    step(20); P.skipBeat(); step(1);
    ok('awards: skipping an award moves to the next one (bk 1)', beatIs('A') && P.beat().bk === 1, P.beat());
    step(31); P.skipBeat(); step(31); P.skipBeat(); step(1);
    ok('awards: ... then 최종 순위; every winner holds its bonus (slot 0: 1등 + 가두기, slot 1: 1등 + 탈출)', beatIs('z') && PS().bonus[1] === 4 && PS().bonus[0] === 4, [P.beat(), PS().bonus]);
    const zv = P.card();
    ok('awards: 최종 순위 - the tally view titled 최종 순위, the bonuses counting in', zv.view === 'tally' && zv.name === P.tx().finalH && zv.board.length === 3, zv);
    until(() => G.mode === 'podium', 200);
    ok('awards: ... then the podium', G.mode === 'podium');
    party(['duck', 'cat'], { plan: ['crown'] }); toPlaying(); P.skip();
    toBeat('t'); until(() => !beatIs('t'), 300);
    ok('awards: no award to give (nobody won more, trapped or escaped) -> the tally goes straight to 최종 순위', beatIs('z') && (!PS().A || PS().A.length === 0), [P.beat(), PS().A]);
    // 최종 순위's "before" standing keeps the last 판's tie-break (only the bonuses move a row): equal points and 1등,
    // the last places 1 / 2, no bonus -> the rows stay 1 / 2 with no ▲ / ▼
    Object.assign(G.party, { pts: { 0: 8, 1: 8 }, wins: { 0: 1, 1: 1 }, last: { 0: 1, 1: 2 }, bonus: {} }); P.fill(-1);
    until(() => P.beat().bt >= 50, 60);
    const zb = P.card().board;
    ok('awards: 최종 순위 keeps the last 판\'s tie-break in the standing before the awards - no bonus, no ▲ / ▼', zb.length === 2 && same(zb.map((r) => r.place), ['1', '2']) && zb.every((r) => !r.mv), zb);
    // 탈출: escapes by mashing (>= 3 presses) count, a friend's touch does not
    party(['duck', 'cat', 'frog'], { plan: ['crown'] }); toPlaying();
    for (const p of G.players) p.invuln = 0;
    put(0, 60, 160); put(1, 120, 160); put(2, 180, 160); step(3);
    D.trapPlayer(1, 0); for (let k = 0; k < 12 && pl(1).trap; k++) D.mash(1);
    ok('awards: an escape with >= 3 presses counts for 최다 탈출상', (P.counts().esc[1] | 0) === 1, P.counts());
    put(1, 20, 40); step(2); D.trapPlayer(2, 0); D.mash(2); D.mash(2); step(25);   // (past the prison's TRAP_GRACE)
    const bq = G.bubbles.find((q) => q.kind === 'player' && q.victim === pl(2)); put(1, bq.x, bq.y); step(2);
    ok('awards: ... a friend\'s touch does not (nor 2 presses)', !pl(2).trap && !(P.counts().esc[2] | 0), P.counts());
    ok('awards: caps never counts one\'s own bubble', !(P.counts().caps[1] | 0) && (P.counts().caps[0] | 0) === 2, P.counts());
  }

  // ---------------------------------------------------------------- 9. the flow (3.1), the podium, leavers, rematch
  function flowTests() {
    // (party-games 3.6: the free draw may bring the new games - the beat timings are checked on a forced plan of the
    // three arena games; an unforced party is drawn from all that fit, three distinct)
    party(['duck', 'cat', 'frog', 'penguin'], { rounds: 3 }, 5);
    const free3 = PS().plan;
    ok('flow: an unforced 4-player 3판 party draws three distinct games of all that fit', free3.length === 3 && new Set(free3).size === 3 && free3.every((id) => fitIds(4).includes(id)), free3);
    party(['duck', 'cat', 'frog', 'penguin'], { plan: ['water', 'crown', 'ball'] });
    const plan = PS().plan;
    ok('flow: a 4-player 3판 party of the three arena games plays each once', plan.length === 3 && new Set(plan).size === 3 && plan.includes('ball'), plan);
    ok('flow: the first card is shown (#pg-party) with its 판 line', P.card().shown && P.card().round === '1판 / 3판' && P.card().name === P.mini()[plan[0]].name, P.card());
    let last = G.mode, since = 0;
    const marks = [];
    for (let f = 0; f < 20000 && G.mode !== 'podium'; f++) {
      // (every 판 ends early: skip it 2 s in; nobody presses 준비: every card auto-starts)
      if (G.mode === 'playing' && PS().mini && PS().mini.t === 120) { P.skip(); marks.push([last, since]); last = G.mode; since = 0; }
      step(1); since++;
      if (G.mode !== last) { marks.push([last, since]); last = G.mode; since = 0; }
    }
    const seqModes = marks.map((m) => m[0]);
    info('flow: ' + marks.map((m) => m[0] + ' ' + m[1]).join(' > '));
    ok('flow: card -> countdown -> playing -> result, three times, then the podium', same(seqModes, ['card', 'countdown', 'playing', 'result', 'card', 'countdown', 'playing', 'result', 'card', 'countdown', 'playing', 'result']) && G.mode === 'podium', seqModes);
    const L = K.PARTY_F, res = marks.filter((m) => m[0] === 'result').map((m) => m[1]);
    ok('flow: each card 600 f with nobody ready, the 3-2-1 180 f, the results f + w + t (354), + s (504), the last f w t (+ awards) z', marks.filter((m) => m[0] === 'card').every((m) => m[1] === 600) && marks.filter((m) => m[0] === 'countdown').every((m) => m[1] === 180)
      && res[0] === L.finish + L.win + L.tally && res[1] === L.finish + L.win + L.tally + L.stand && res[2] >= L.finish + L.win + L.tally + L.final, [marks, res]);
    ok('flow: the podium shows (#pg-podium, 파티 결과!, tag 3판, 파티 한 번 더)', !$('pg-podium').hidden && $('pg-podium-h').textContent === '파티 결과!' && $('pg-podium-tag').textContent === '3판' && !$('pg-podium-tag').hidden && $('pg-podium-again').textContent === '파티 한 번 더', [$('pg-podium-h').textContent, $('pg-podium-tag').textContent]);
    const pd = PS().podium;
    ok('flow: podium order and places from the standings; p.score = points', pd.order.length === 4 && pd.pl.length === 4 && G.players.every((p) => p.score === PS().pts[p.slot]), pd);
    // the music between the 판: party on the card and from the tally; none during 끝!
    party(['duck', 'cat'], { plan: ['crown', 'water'] });
    const mCard = G.music; toPlaying(); P.skip(); const mF = G.music; toBeat('t'); const mT = G.music;
    ok('music: party on the card, none on 끝!, party again from the tally', mCard === 'party' && mF === null && mT === 'party', [mCard, mF, mT]);

    // a shared 1st: two gold blocks, two 1s, "1위" twice for screen readers
    party(['duck', 'cat'], { plan: ['crown'] });
    toPlaying(); P.skip(); until(() => G.mode === 'podium', 1500); step(5);
    const cv = $('pg-canvas'), x = cv.getContext('2d');
    const px = (X, Y) => Array.from(x.getImageData(X, Y, 1, 1).data.slice(0, 3));
    const gold = [255, 212, 71], strip = (X, Y) => { let n = 0; for (let k = 0; k < 8; k++) if (same(px(X + k, Y), gold)) n++; return n >= 6; }; // (confetti may cross a pixel)
    ok('podium: a shared 1st - two 1st places, both blocks gold, "1위" twice in the screen-reader line', PS().podium && same(PS().podium.pl, [1, 1]) && strip(128 - 12, 113) && strip(92 - 12, 123) && ($('pg-podium-sum').textContent.match(/1위/g) || []).length === 2,
      [PS().podium, px(118, 113), px(82, 123), $('pg-podium-sum').textContent]);
    ok('podium: the note says the shared place', $('pg-podium-note').textContent === '공동 1등!' && !$('pg-podium-note').hidden, $('pg-podium-note').textContent);

    // a leaver mid-party: the party goes on; down to 1: a walkover podium
    party(['duck', 'cat', 'frog'], { rounds: 3 });
    toPlaying(); P.skip(); toCard();
    P.drop(2);
    ok('leavers: one leaves during a card (3 -> 2): the plan still fits, the party goes on', G.mode === 'card' && PS().plan.length === 3 && G.players.length === 2, [G.mode, PS().plan]);
    toPlaying();
    P.drop(1);
    ok('leavers: down to 1 player -> a walkover podium (친구가 나가서 일찍 끝났어요)', G.mode === 'podium' && PS().walk && $('pg-podium-note').textContent === '친구가 나가서 일찍 끝났어요', [G.mode, PS().walk, $('pg-podium-note').textContent]);
    // a leaver during the beats: they go on with the players left; < 2 left: the walkover
    party(['duck', 'cat', 'frog'], { plan: ['crown', 'water'] });
    toPlaying(); P.skip(); toBeat('t'); P.drop(2);
    step(1);
    ok('leavers: one leaves during the tally (3 -> 2) - the beats go on, the tally\'s rows without the leaver at once', G.mode === 'result' && beatIs('t') && G.players.length === 2 && P.card().board.length === 2, [G.mode, P.beat(), P.card().board.length]);
    P.drop(1);
    ok('leavers: ... down to 1 during the beats -> the walkover podium (no awards)', G.mode === 'podium' && PS().walk, [G.mode, PS().walk]);

    // every magazine is full at each 시작!, even one emptied at the end of the 판 before
    party(['duck', 'cat'], { plan: ['crown', 'water'] });
    toPlaying(); step(170);
    for (let k = 0; k < 3; k++) { D.press('shoot', true, 0); step(2); D.press('shoot', false, 0); step(15); }
    const emptied = D.ammo.of(0).left;
    P.skip(); toCard(); toPlaying();
    const full = D.ammo.of(0);
    ok('magazines: emptied at the end of a 판 -> full again at the next 시작!', emptied === 0 && full.left === full.n, [emptied, full]);

    // 파티 한 번 더 (rematch): a new party with the same options
    party(['duck', 'cat'], { plan: ['crown'], rounds: 5, rapid: true });
    toPlaying(); P.skip(); until(() => G.mode === 'podium', 1500);
    D.rematch();
    ok('rematch: 파티 한 번 더 starts a new party on its card (the options kept)', G.mode === 'card' && PS().i === 0 && PS().on && G.opts.rapid === true && G.players.every((p) => p.score === 0) && !Object.keys(PS().bonus).length, [G.mode, PS().i, G.opts]);
  }

  // ---------------------------------------------------------------- 10. rewards (8)
  function coinTests() {
    const C = P.coin;
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

  // ---------------------------------------------------------------- 10b. 파티 트로피 (design/party-trophies.md 9.4): the room
  // rules by size, stake, a free seat and q; the 3-2-1 sub and the card chip of the first 판 only; the new strings warmed
  function troTests() {
    D.tro.ns('partytro'); D.tro.set({ t: 100 });
    const base = (n) => ['미니게임 3판! 판마다 ' + [[4, 0], [4, 2, 0], [4, 2, 1, 0]][n - 2].map((v, i) => (i + 1) + '등 ' + v + '점').join(' · '), '마지막 판은 점수 2배!', '끝나면 보너스상 3개 · 상마다 +2점'];
    const R = (o) => P.rules(o), has = (list, l) => list.includes(l);
    const play = '끝까지 하면 파티마다 오늘 트로피 보너스 +5 (꼴등 빼고 · 하루 40개까지)', leave = '견습 리그는 등수로 잃지 않아요 · 파티 중간에 나가면 꼴찌로 쳐요';
    const r4 = R({ n: 4, bet: 10 }), r3 = R({ n: 3, bet: 10 }), r2 = R({ n: 2, bet: 10 });
    ok('rules at 10: 모두 10개씩 걸고 최종 등수대로 나눠요 - 4p +26 / +10 / 0 / -16, 3p +23 / +4 / -13, 2p +22 / -16; the +5 and 견습 / leaving lines; no 트로피는 걸지 않아요',
      has(r4, '모두 10개씩 걸고 최종 등수대로 나눠요: 1등 +26 · 2등 +10 · 3등 0 · 4등 -16') && has(r3, '모두 10개씩 걸고 최종 등수대로 나눠요: 1등 +23 · 2등 +4 · 3등 -13') && has(r2, '모두 10개씩 걸고 최종 등수대로 나눠요: 1등 +22 · 2등 -16')
      && [r4, r3, r2].every((r) => has(r, play) && has(r, leave) && has(r, '트로피가 모자라면 안 걸고 참여해요 (등수 점수만 받아요)') && !has(r, '트로피는 걸지 않아요') && same(r.slice(0, 3), base(r === r4 ? 4 : r === r3 ? 3 : 2))), [r4, r3, r2]);
    ok('rules at 10: the trophy lines sit where 트로피는 걸지 않아요 was (after the coin line, before the magazine); 14 lines for 4 players (the new games line before the coin line)', r4.length === 14 && r4[6] === '끝까지 하면 등수대로 비누 코인을 받아요' && r4[7].indexOf('모두 10개씩') === 0 && r4[11].indexOf('거품') >= 0, r4);
    const rf = R({ n: 4, bet: 10, free: [3] });
    ok('rules with a free seat: 판돈 30개 (3명이 10개씩): 건 사람끼리 최종 등수대로 나눠요 and what 안 걸고 참여 pays', has(rf, '판돈 30개 (3명이 10개씩): 건 사람끼리 최종 등수대로 나눠요') && has(rf, '안 걸고 참여: 등수 점수만 받아요 · 1등 +16 · 2등 +8 · 3등 +2 · 4등 -6'), rf);
    // (party-games-2 3.5: the new games line - 새 게임: and the short names of every game after the first three)
    const gnL = P.tx().newGames + K.MINI_IDS.slice(K.MINI_OLD).map((id) => P.mini()[id].short).join(' · ');
    const r0 = R({ n: 4, bet: 0 }), was = base(4).concat(['같은 기록이면 같은 등수 · 동점이면 1등을 더 많이 한 친구가 위예요', '물 차오르기 · 왕관 뺏기 · 거품 축구', gnL, '끝까지 하면 등수대로 비누 코인을 받아요', '트로피는 걸지 않아요']);
    ok('rules at 안 걸기: exactly as before - 트로피는 걸지 않아요, no trophy line (a party at 안 걸기 is no 트로피 경기)', same(r0.slice(0, 8), was) && r0.length === 11 && !r0.some((l) => /최종 등수|파티마다|트로피 경기/.test(l)), r0);
    const q1 = R({ n: 3, bet: 10, q: 1 }), q2 = R({ n: 3, bet: 10, q: 2 });
    ok('rules in practice (q 1 / 2) at 10: 연습 경기라 트로피는 그대로예요 beside the coin line, no other trophy line', [q1, q2].every((r) => has(r, '연습 경기라 트로피는 그대로예요') && !r.some((l) => /최종 등수|파티마다/.test(l))) && /이 브라우저의 탭끼리는/.test(q1[6]) && /같은 기기에서/.test(q2[6]), [q1, q2]);
    const old = R({ n: 3, bet: 10, role: 'guest', pv: 0 });
    const new6 = R({ n: 3, bet: 0, role: 'guest', pv: K.PARTY_V - 1 }), new7 = R({ n: 3, bet: 0, role: 'guest', pv: K.PARTY_V });
    ok('rules for a guest of an older host (no R.pv): 트로피는 걸지 않아요 (its party holds nothing for it)', has(old, '트로피는 걸지 않아요') && !old.some((l) => /최종 등수|파티마다/.test(l)), old);
    ok('rules: the new games line only from a host that plans them (a guest of a pa ' + (K.PARTY_V - 1) + ' host - or none - has none)', !has(old, gnL) && !has(new6, gnL) && has(new7, gnL) && has(r3, gnL), [old, new6, new7]);
    // the 3-2-1 of the first 판 and its card chip (each page's own stake / q; later 판 unchanged)
    party(['duck', 'cat', 'frog', 'capy'], { plan: ['crown', 'water', 'crown'] }); step(30);
    const c10 = P.count({ bet: 10 }), cp = P.count({ bet: 10, q: 1 }), c0 = P.count({ bet: 0 });
    ok('3-2-1 (1판): "1판 / 3판 · 트로피 10개씩 걸어요!" (bet), practice " · 연습 경기" (prac), 안 걸기 unchanged', c10.sub === '1판 / 3판 · 트로피 10개씩 걸어요!' && c10.cls === ' bet' && cp.sub === '1판 / 3판 · 연습 경기' && cp.cls === ' prac' && c0.sub === '1판 / 3판' && c0.cls === '', [c10, cp, c0]);
    ok('card chip (1판): 10개씩 (aria 트로피 10개씩 걸어요); none in practice or at 안 걸기', same(c10.chip, ['10개씩', '트로피 10개씩 걸어요']) && cp.chip === null && c0.chip === null, [c10.chip, cp.chip, c0.chip]);
    // (a 술래 1판: 이번 술래: 나! in place of the 판 line on its first 술래's screen, the stake kept - a guest's from the host's line)
    D.toTitle(); party(['duck', 'cat', 'frog', 'capy'], { plan: ['sneak', 'water', 'crown'] }); step(30);
    const cs = P.count({ bet: 10, hs: '1판 / 3판 · 트로피 10개씩 걸어요!' });
    ok('3-2-1 of a 술래 1판 on its first 술래\'s screen: 이번 술래: 나! · 트로피 10개씩 걸어요! (host and guest)', cs.sub === '이번 술래: 나! · 트로피 10개씩 걸어요!' && cs.cls === ' bet' && cs.gs === cs.sub, cs);
    D.toTitle(); party(['duck', 'cat', 'frog', 'capy'], { plan: ['crown', 'water', 'crown'] }); step(30);
    D.tro.set({ t: 3 });
    ok('card chip: the host short of the stake plays without it - 안 걸고 참여 (aria 안 걸고 참여해요)', same(P.count({ bet: 10 }).chip, ['안 걸고 참여', '안 걸고 참여해요']), P.count({ bet: 10 }).chip);
    D.tro.set({ t: 100 });
    toPlaying(); P.skip(); toCard();
    const c2 = P.count({ bet: 10 });
    ok('2판: the 3-2-1 and the card say nothing about the stake (the hold was at the first 시작!)', c2.sub === '2판 / 3판' && c2.cls === '' && c2.chip === null, c2);
    D.toTitle();
    // the 최종 순위 hold (party-games 21: a staked party settles no sooner than PARTY_TRO_MINF after its first 시작! - an
    // honest party of the short new games is held there, never voided; tro.partyHold stands in for the online host's hold):
    // the host's skip and the beat's own end both wait for the floor, then the podium; without a hold 최종 순위 ends at 96 f
    party(['duck', 'cat', 'frog'], { plan: ['crown'] }); toPlaying(); const h0 = G.frame; D.tro.partyHold(h0, 900);
    P.skip(); toBeat('z', 1500); const zAt = G.frame; step(40); tap('jump', 0); step(1);
    const held = G.mode === 'result' && beatIs('z') && !P.card().skip; until(() => G.mode === 'podium', 1200); const pAt = G.frame;
    D.tro.partyHold(null);
    party(['duck', 'cat', 'frog'], { plan: ['crown'] }); toPlaying(); P.skip(); toBeat('z', 1500); const z1 = G.frame; step(40); const skN = P.card().skip; until(() => G.mode === 'podium', 400);
    ok('staked party floor: 최종 순위 held (a skip at 40 f waits, no 눌러서 넘기기 line) until its first 시작! is the floor old, then the podium; no hold: 96 f', held && skN && zAt < h0 + 900 && Math.abs(pAt - h0 - 900) <= 1 && Math.abs(G.frame - z1 - 96) <= 1,
      [held, skN, zAt - h0, pAt - h0, G.frame - z1]);
    D.toTitle();
    // the new strings: every syllable warmed (PARTY_TEXT), 7.4 verbatim
    const tx = P.tx(), strs = [tx.troZero, tx.troAll, tx.troPot, tx.troPlay, tx.troLeave, tx.troPrac, tx.toParty, tx.toBattle, tx.countBet, tx.countPrac, tx.chipFree, tx.chipBetA, tx.chipFreeA, tx.short, tx.walkVoid, tx.walkPaid, tx.nextFreeMe, tx.nextFree, tx.waitBet, tx.recRow];
    ok('texts (7.4): the party trophy strings verbatim', tx.troAll === '모두 {0}개씩 걸고 최종 등수대로 나눠요: ' && tx.short === '파티가 너무 빨리 끝나서 트로피는 그대로예요' && tx.walkPaid === '친구가 나가서 일찍 끝났어요 · 기권승' && tx.toParty === '파티로 바뀌었어요: ' && tx.waitBet === ' · 다음 파티도 {0}개씩' && tx.recRow === '배틀·파티' && tx.troPlay === play && tx.troLeave === leave, strs);
    const warm = $('pg-fontwarm').textContent, miss = new Set();
    for (const s of strs.concat(['판돈 30개 (3명이 10개씩): 건 사람끼리 최종 등수대로 나눠요', '내 트로피가 모자라서 다음 파티는 안 걸고 해요'])) for (const ch of s) if (/[가-힣]/.test(ch) && (warm.indexOf(ch) < 0 || P.text().indexOf(ch) < 0 && D.tro.text().indexOf(ch) < 0)) miss.add(ch);
    ok('fonts: every party trophy syllable is warmed (PARTY_TEXT / TRO_TEXT, #pg-fontwarm)', !miss.size, [...miss].join(''));
  }

  // ---------------------------------------------------------------- 11. the card texts, the podium switch, the HUD, the demos
  function longNicks() { return ['가나다라마바사아자차카타', '하늘바다구름별달해님', '뽀득뽀득거품왕자님아', '까삐까삐까삐까삐까삐'].map((nick, i) => ({ char: ['duck', 'capy', 'otter', 'frog'][i], nick })); }
  function cardTests() {
    party(longNicks(), { plan: ['water', 'crown', 'water'] });
    step(80);
    let c = P.card();
    ok('card: round line, name, the one-line how-to, the rule line, the keyboard keys line (desktop); no board on the card', c.shown && c.round === '1판 / 3판' && c.name === '물 차오르기' && c.how === P.mini().water.how && c.rule === P.mini().water.rule && c.keys === P.tx().keys && !c.team && !c.board.length, c);
    ok('card: 물 v2\'s texts - the how (가장 늦게 젖으면 1등) and the rule (비누 방울 · 오리 튜브 · 역전)', P.mini().water.how === '물이 차올라요! 가장 늦게 젖으면 1등' && P.mini().water.rule === '비누 방울을 먹으면 한 번 살아나요 · 빠지면 오리 튜브로 친구를 맞혀 역전!' && P.mini().crown.rule === '15초마다 왕관이 날아가요 · 2등부터는 쓴 시간 순서' &&P.mini().ball.rule === '45초부터 공이 2개! · 비기면 골든 골' && P.mini().water.secs === 60);
    toPlaying(); P.skip(); toCard(); step(80);
    c = P.card();
    ok('card: the 2nd card - 2판 / 3판 · 왕관 뺏기', c.round === '2판 / 3판' && c.name === '왕관 뺏기' && !c.x2, c);
    ok('card: 왕관\'s texts - the how (끝날 때 왕관을 쓴 사람이 1등) and the rule (날아가요 · 2등부터는 쓴 시간 순서), on the card', c.how === '끝날 때 왕관을 쓴 사람이 1등' && c.rule === '15초마다 왕관이 날아가요 · 2등부터는 쓴 시간 순서' && P.mini().crown.how === c.how && P.mini().crown.rule === c.rule, [c.how, c.rule]);
    toPlaying(); for (const s of [1, 2, 3]) pl(s).invuln = 0; P.crown(1); step(30); P.skip(); toBeat('s');
    c = P.card();
    ok('마지막 판!: the stand view - 점수 2배 · 1등 8점 · 2등 4점 · 3등 2점 (4 players), 선두 on the leader, 1위와 N점 차 on the others', c.view === 'stand' && c.name === '마지막 판!' && c.sub === '점수 2배 · 1등 8점 · 2등 4점 · 3등 2점' && c.board[0].gain === '선두' && c.board[0].nick === '하늘바다구름별달해님' && c.board.slice(1).every((r) => /^1위와 \d+점 차$/.test(r.gain)), c);
    toCard(); step(80); c = P.card();
    ok('card: the last card says 마지막 판! 3판 / 3판 with the 점수 2배! chip', c.round === '마지막 판! 3판 / 3판' && c.x2, c);
    // the podium title switches back for a battle; no raft, no demo, the HUD draws in every phase without errors
    D.local.battle(['duck', 'cat']); D.setTimeLeft(0.02); step(5);
    ok('podium: a battle afterwards has 결과 발표! again (no 3판 tag, no party note), no raft, no party overlay', G.mode === 'podium' && $('pg-podium-h').textContent === '결과 발표!' && $('pg-podium-again').textContent === '한 판 더' && $('pg-podium-tag').textContent !== '3판' && G.players.every((p) => !p.raft) && !PS().on, [$('pg-podium-h').textContent, $('pg-podium-tag').textContent]);
    let threw = null;
    try { for (const plan of K.MINI_IDS.map((id) => [id])) { party(['duck', 'cat', 'frog', 'otter'], { plan }); for (let f = 0; f < 1500; f++) { step(1); if (G.mode === 'card' && PS().t === 12) readyAll(); if (G.mode === 'playing' && PS().mini.t === 300) { if (plan[0] === 'water') P.raft(1); P.skip(); } } } } catch (e) { threw = e.message; }
    ok('HUD: every phase of every game renders without an exception (a raft, the beats)', !threw, threw);
    for (const id of K.MINI_IDS) { const d = P.demo(id); ok('demo [' + id + ']: its 240-frame loop draws into a 96x32 context without errors and leaves pixels on it', d && !d.err && d.lit > 200, d); }
    const warm = $('pg-fontwarm').textContent, miss = new Set();
    for (const ch of P.text()) if (/[\uac00-\ud7a3]/.test(ch) && warm.indexOf(ch) < 0) miss.add(ch);
    ok('fonts: every party syllable (PARTY_TEXT, the polish\'s new lines too) is in #pg-fontwarm, both faces', !miss.size && ['.pg-fw-sign', '.pg-fw-body'].every((q) => document.querySelector('#pg-fontwarm ' + q).textContent.indexOf('물 차오르기') >= 0) && ['준비 완료!', '보너스상!', '오리 튜브', '골든 골', '황금 왕관'].every((t) => P.text().indexOf(t) >= 0), [...miss].join(''));
    ok('texts: no party string holds the retired v1 title\'s syllables', P.text().indexOf(String.fromCharCode(0xbf40, 0xae00)) < 0);
  }
  // (last: touch mode never goes off again on this page)
  function touchTests() {
    window.dispatchEvent(new Event('touchstart'));
    party(longNicks(), { plan: ['water'] }); step(80);
    ok('card: touch mode shows the touch keys line and the button says 준비 완료!', $('pg-party-keys').textContent === P.tx().keysT && P.card().button.text === P.tx().ready, [$('pg-party-keys').textContent, P.card().button]);
  }
  // the fit: 4 players with 12-syllable nicks - every view (the card's how-to with the ready row for each game, 축구 with
  // its team line; the tally, 마지막 판!, an award, 최종 순위) at 1x (no rule line), at 2x (the rule line) and on a phone
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
  const cardEl = () => document.querySelector('.pg-party-card');
  async function fitAt(label, wantRule) {
    for (const id of K.MINI_IDS) {
      party(longNicks(), { plan: [id === 'water' ? 'crown' : 'water', id] });
      toPlaying(); P.skip(); toCard(); step(80);   // (the 2nd card, past its splash)
      if (id === 'ball') P.fill(0);                 // (축구: with my own side line, as an online screen)
      await sleep(120);
      // (파티 트로피: the first card's stake chip in the round line - its longest text - as a staked online party shows it:
      // this view is the party's last card, so it is shown as a first one - 1판 / 3판, no 점수 2배!)
      const chip = $('pg-party-bet'), x2 = $('pg-party-x2'), rt0 = $('pg-party-rt').textContent, x20 = x2.hidden;
      chip.hidden = false; chip.querySelector('span').textContent = '안 걸고 참여'; x2.hidden = true; $('pg-party-rt').textContent = '1판 / 3판';
      const m = measure(label + ' ' + id + ' card', cardEl()), c = P.card();
      const ra = $('pg-party-rt').getBoundingClientRect(), rb = chip.getBoundingClientRect(), rr = $('pg-party-round').getBoundingClientRect();
      if (getComputedStyle($('pg-party-round')).display !== 'none') ok(label + ' ' + id + ': the round line with the stake chip stays one line (the chip beside 2판 / 3판, the line no taller)', Math.abs(ra.top + ra.bottom - rb.top - rb.bottom) / 2 < ra.height * 0.5 && rb.right <= rr.right + 1 && rr.height < ra.height * 1.6, [ra.top, ra.bottom, rb.top, rb.bottom, rr.height]);
      chip.hidden = true; x2.hidden = x20; $('pg-party-rt').textContent = rt0;
      ok(label + ' ' + id + ': the how-to on one line, the keys on one line; the ready row and the button shown', lines($('pg-party-how')) === 1 && lines($('pg-party-keys')) === 1 && c.ready.length === 4 && !!c.button, [lines($('pg-party-how')), lines($('pg-party-keys'))]);
      if (wantRule !== undefined) ok(label + ' ' + id + ': the rule line ' + (wantRule ? 'shown' : 'hidden (a short screen)'), c.ruleShown === wantRule, [c.ruleShown, m.em]);
      ok(label + ' ' + id + ': the ready row inside the card (no chip cut off)', $('pg-party-ready').scrollWidth <= $('pg-party-ready').clientWidth + 1);
      if (id === 'ball') {
        const tl = $('pg-party-team'), sides = [...tl.querySelectorAll('.pg-party-side')];
        const row = tl.querySelector('.pg-party-teams'), kids = [...row.children], cut = sides.filter((e) => e.scrollWidth > e.clientWidth + 1).length;
        ok(label + ' ball: the team line - both teams on one row (no overflow: a long half ends in an ellipsis), my side on the next line', c.team && c.mine === P.tx().mineL && sides.length === 2 && kids.every((e) => e.offsetTop === kids[0].offsetTop) && row.scrollWidth <= row.clientWidth + 1 && lines(tl.querySelector('.pg-party-mine')) === 1 && tl.scrollWidth <= tl.clientWidth + 1,
          [c.teams, c.mine, kids.map((e) => e.offsetTop), row.scrollWidth, row.clientWidth, lines(tl.querySelector('.pg-party-mine'))]);
        info(label + ' ball: team line halves cut with an ellipsis: ' + cut + ' of 2');
        P.fill(-1);
      }
      if (id === 'sneak') {
        const tl = $('pg-party-team'), row = tl.querySelector('.pg-party-teams'), kids = row ? [...row.children] : [], nicks = [...tl.querySelectorAll('.pg-party-side')];
        ok(label + ' sneak: the 술래 order line - 술래 순서: and the four nicks on one row (a long nick ends in an ellipsis)', c.team && nicks.length === 4 && kids.every((e) => e.offsetTop === kids[0].offsetTop) && row.scrollWidth <= row.clientWidth + 1 && tl.scrollWidth <= tl.clientWidth + 1,
          [c.teams, kids.map((e) => e.offsetTop), row && row.scrollWidth, row && row.clientWidth]);
        info(label + ' sneak: order line nicks cut with an ellipsis: ' + nicks.filter((e) => e.scrollWidth > e.clientWidth + 1).length + ' of 4');
      }
    }
    // 왕관's gold banner: 황금 왕관! over 끝날 때 쓴 사람이 1등! - the sub on one line, the banner inside the screen
    party(longNicks(), { plan: ['crown'] }); toPlaying(); step(90);
    for (let k = 0; k < 3; k++) P.flight();
    step(2); await sleep(120);
    // (layout boxes, not getBoundingClientRect: the banner may still be in its pg-pop scale-in)
    const bn = $('pg-banner'), bnIn = bn.querySelector('.pg-banner-in'), bnSub = $('pg-banner-sub'), sw = $('pg-screen').clientWidth;
    info(label + ' gold banner: ' + bnIn.offsetWidth + 'x' + bnIn.offsetHeight + ' at x ' + bnIn.offsetLeft + ' in ' + sw + ' (sub ' + getComputedStyle(bnSub).fontSize + '), main ' + lines($('pg-banner-main')) + ' line(s), sub ' + lines(bnSub));
    ok(label + ' gold banner: 끝날 때 쓴 사람이 1등! on one line, 황금 왕관! on one line, inside the screen', !bn.hidden && bnSub.textContent === P.tx().gold2 && lines(bnSub) === 1 && lines($('pg-banner-main')) === 1
      && bnIn.offsetLeft >= 0 && bnIn.offsetLeft + bnIn.offsetWidth <= sw && bnSub.scrollWidth <= bnSub.clientWidth + 1, [bnSub.textContent, lines(bnSub), lines($('pg-banner-main')), bnIn.offsetLeft, bnIn.offsetWidth, sw]);
    // the result views: a 3판 so the tally, 마지막 판!, the last tally, the awards and 최종 순위 all show
    party(longNicks(), { plan: ['crown', 'water', 'crown'] });
    toPlaying(); P.crown(1); step(60); P.skip(); toBeat('t'); step(100); await sleep(80);
    measure(label + ' tally', cardEl());
    ok(label + ' tally: each 12-syllable nick ends in an ellipsis inside its row', [...$('pg-party-board').children].every((li) => li.scrollWidth <= li.clientWidth + 1));
    toCard(); readyAll(); toPlaying(); P.skip(); toBeat('s'); await sleep(80);
    measure(label + ' 마지막 판!', cardEl());
    ok(label + ' 마지막 판!: the rows fit (the gap lines too)', [...$('pg-party-board').children].every((li) => li.scrollWidth <= li.clientWidth + 1));
    toCard(); readyAll(); toPlaying(); for (const p of G.players) p.invuln = 0; D.trapPlayer(0, 3); P.crown(2); step(30); P.skip();
    G.party.esc = { 0: 1, 1: 0, 2: 0, 3: 0 };
    toBeat('A'); step(20); await sleep(80);
    measure(label + ' award', cardEl());
    toBeat('z', 2000); step(50); await sleep(80);
    measure(label + ' 최종 순위', cardEl());
  }
  async function fitTests() {
    if (FIT_ONLY) { await fitAt('this viewport (' + innerWidth + 'x' + innerHeight + ')', true); return; }
    setScale(1); await fitAt('1x (256x224)', false);
    setScale(2); await fitAt('2x (512x448)', true);
    D.toTitle();
  }

  // ---------------------------------------------------------------- 12. the arenas (5.3)
  function arenaTests() {
    const ok1 = P.reload(PG.PARTY_ARENAS);
    ok('arenas: PG.PARTY_ARENAS loads (물 차는 대욕장 with its rise, 거품 축구장 with its goals / sides / ball, 무대 목욕탕 a plain box, 살금살금 복도 with its stools and sneak spots - all closed)', ok1.length === 4 && ok1[3].key === 'sneak' && ok1[3].closed && same(ok1[3].sneak, { start: { col: 3, row: 24 }, it: { col: 27, row: 24 }, line: 200 }) && ok1[3].low === '##.......##..........##.......##' && ok1[2].key === 'stage' && ok1[2].closed && !ok1[2].rise && !ok1[2].goals && ok1[2].bar === '##............................##' && ok1[0].key === 'water' && ok1[0].closed && ok1[0].rise && ok1[0].gapX === 128
      && ok1[1].key === 'ball' && ok1[1].closed && ok1[1].goals.length === 2 && ok1[1].sides.length === 2 && ok1[1].ball.x === 128 && /^#{32}$/.test(ok1[1].floor) && ok1[1].bar === '######....................######', ok1);
    const open = P.arenas()[0].map.slice(); open[25] = '##############...###############';
    const r = P.reload([{ key: 'water', name: 'x', theme: 1, map: open, players: [{ col: 4, row: 24 }], rise: { y0: 222, warn: 2, steps: [[5, 9, 206]], surges: [['junk']], flood: 'x' } }]);
    ok('arenas: normLevel keeps a closed map closed (a gap in its floor is closed again, no drain opened); a broken surge / flood is left out', /^#{32}$/.test(r[0].floor) && /^#{32}$/.test(r[0].ceil) && r[0].gapX === 128 && r[0].rise.surges.length === 0 && r[0].rise.flood === null, r[0]);
    const b = P.reload([null, { key: 'water', map: 'junk' }, { key: 'water', name: 'y', map: open }, { key: 'water', name: 'y', map: open }, { key: 'water', name: 'y', map: open }]);
    ok('arenas: a broken entry (or one without its rise schedule / its goals, or another key) gets the built-in closed arena of its index\'s game (with the v2 schedule; the stage a plain box)', b.length === 5 && b[2].key === 'stage' && b[2].name === '무대 목욕탕' && b[2].floor === '#'.repeat(32) && b[2].bar === '##............................##' && b[3].key === 'sneak' && b[3].name === '살금살금 복도' && b[3].sneak.line === 200 && [0, 4].every((k) => b[k].key === 'water' && b[k].closed && b[k].rise && b[k].rise.steps.length === 5 && b[k].rise.flood && b[k].rise.surges.length === 2 && /^#{32}$/.test(b[k].floor))
      && b[1].key === 'ball' && b[1].closed && b[1].goals.length === 2 && b[1].bar === '######....................######', b.map((A) => [A.name, A.key, !!A.rise, !!A.goals]));
    const ns = P.reload([PG.PARTY_ARENAS[0], PG.PARTY_ARENAS[1]]);
    ok('arenas: a missing 무대 목욕탕 gets the built-in plain box (and a missing 살금살금 복도 its built-in corridor)', ns.length === 4 && ns[2].key === 'stage' && ns[2].closed && ns[2].floor === '#'.repeat(32) && ns[3].key === 'sneak' && ns[3].low === '##.......##..........##.......##' && ns[3].sneak.start.col === 3, [ns[2], ns[3]]);
    const nk = P.reload([PG.PARTY_ARENAS[0], PG.PARTY_ARENAS[1], PG.PARTY_ARENAS[2], Object.assign({}, PG.PARTY_ARENAS[3], { sneak: { start: { col: 20, row: 24 }, it: { col: 5, row: 24 }, line: 'x' } })]);
    ok('arenas: a 살금살금 복도 with unusable sneak spots (the start right of the 술래, no line) gets the built-in one', nk[3].key === 'sneak' && same(nk[3].sneak, { start: { col: 3, row: 24 }, it: { col: 27, row: 24 }, line: 200 }), nk[3].sneak);
    const nb = P.reload([PG.PARTY_ARENAS[0], { key: 'ball', name: 'z', theme: 0, map: PG.PARTY_ARENAS[1].map, goals: 'junk', sides: PG.PARTY_ARENAS[1].sides, ball: { x: 128, y: 64 } }]);
    ok('arenas: a 거품 축구장 without usable goals gets the built-in field (its crossbars, goals, sides, ball)', nb.length === 4 && nb[1].key === 'ball' && nb[1].name === '거품 축구장' && nb[1].goals[0].line === 40 && nb[1].sides[1][0].col === 20, nb[1]);
  }

  // ---------------------------------------------------------------- screenshot scenes (#shot=card|water|crown|ball|ballcard|win|tally|award|podium[&s=1|2])
  async function shot(name) {
    const sm0 = /[&#]s=([0-9.]+)/.exec(location.hash), sc = sm0 ? +sm0[1] : 2; if (sc > 0) setScale(sc);   // (s=0: the page's own layout - a phone)
    if (name === 'card') { party(longNicks(), { plan: ['water', 'crown', 'water'] }); toPlaying(); P.skip(); toCard(); step(100); P.ready(1); P.ready(2); step(20); }
    else if (name === 'water') {
      party(longNicks(), { plan: ['water'] }); toPlaying();
      put(0, ...T.r17); put(1, ...T.r13); put(2, ...T.floor); put(3, ...T.r5R);
      until(() => PS().mini.t >= 9 * 60, 1500); P.soap(150); D.trapPlayer(1, 3); step(40);
    } else if (name === 'crown') {
      party(longNicks(), { plan: ['crown'] }, 101); toPlaying(); until(() => PS().mini.t >= 45 * 60 + 60, 3000);
      const c = PS().mini.cr; put(2, c.x, c.y); step(100); D.trapPlayer(0, 2); step(4);
    } else if (name === 'ball') {
      party(longNicks(), { plan: ['ball'] }, 101); toPlaying(); kicked();
      put(0, 70, 200); put(3, 40, 160); put(1, 150, 200); put(2, 200, 200); P.goal(0); until(() => PS().mini.goalT === 0, 200); kicked();
      P.two(); until(() => B2().kick === 0, 80); P.ball(110, 120, 1.5, -1); step(8); D.trapPlayer(2, 0); step(6);
    } else if (name === 'ballcard') { party(longNicks(), { plan: ['water', 'ball'] }, 101); toPlaying(); P.skip(); toCard(); P.fill(1); step(120); }
    else if (name === 'win') { party(longNicks(), { plan: ['crown', 'water'] }, 101); toPlaying(); P.crown(1); step(200); P.skip(); toBeat('w'); step(40); }
    else if (name === 'tally') { party(longNicks(), { plan: ['crown', 'water'] }, 101); toPlaying(); P.crown(1); step(200); P.skip(); toBeat('t'); step(120); }
    else if (name === 'award') { party(longNicks(), { plan: ['crown'] }, 101); toPlaying(); P.crown(1); step(100); P.crown(3); step(50); P.skip(); G.party.caps = { 0: 2, 1: 0, 2: 0, 3: 0 }; toBeat('A'); step(40); }
    else if (name === 'podium') { party(longNicks(), { plan: ['crown'] }, 101); toPlaying(); P.crown(1); step(200); P.crown(3); step(100); P.skip(); until(() => G.mode === 'podium', 2000); step(120); }
    // (바나나우유: the milk on the counter with its ring - two grabbed, one splashed; then the reveal; a decoy round)
    else if (name === 'milk' || name === 'milkrev') {
      P.vclock(true, 1000); party(longNicks(), { plan: ['milk'] }, 101); toPlaying(); toMilk(); const t = P.seen().milk;
      P.press(0, 'shoot', t + 254); P.press(2, 'shoot', t + 318); P.press(3, 'shoot', t + 40); step(10);
      if (name === 'milkrev') { P.press(1, 'shoot', t + 420); until(() => P.milk().ph === 2, 100); step(14); }
    } else if (name === 'milkcard') { party(longNicks(), { plan: ['water', 'milk'] }, 101); toPlaying(); P.skip(); toCard(); step(140); }
    // (펑: four stalls mid-game - a bubble trembling, one flashing, a pop's foam, banked columns; the card)
    else if (name === 'puff') {
      P.vclock(true, 1000); party(longNicks(), { plan: ['puff'] }, 101); P.puffSeed(seedL0((L) => L >= 101)); toPlaying();
      const blow = (s, n) => { for (let k = 0; k < n; k++) { P.press(s, 'shoot'); step(4); } };
      [26, 10, 18, 28].forEach((n, s) => blow(s, n));   // (bubble 0, golden: banked at 88 / 34 / 61 / 95%)
      for (const s of [0, 1, 2, 3]) P.down(s); step(45);
      // (bubble 1, the same L for everyone: 1 trembling, 2 trembling more, 3 flashing - then 0 pops it)
      const L1 = P.puffL(P.puff().seed, 1), kOf = (w) => { let b = 0; for (let k = 1; k * 34 < L1 * 10; k++) if (P.puffWarn(k * 34, L1) === w) b = k; return b; };
      [1, 2, 3].forEach((s) => blow(s, kOf(s)));
      blow(0, Math.ceil(L1 * 10 / 34)); step(4);
      until(() => G.frame % 6 === 1, 6);   // (a frame of the flash: it blinks 3 on / 3 off)
      info('puff scene: L1 ' + L1 + ' - ' + [0, 1, 2, 3].map((s) => P.puffSeat(s).s10 / 10 + '% warn ' + P.puffWarn(P.puffSeat(s).s10, L1) + ' score ' + P.puffSeat(s).score).join(' | '));
    } else if (name === 'puffcard') { party(longNicks(), { plan: ['water', 'puff'] }, 101); toPlaying(); P.skip(); toCard(); step(170); }
    // (술래: the look - the 술래 turned round with red pips and the red edge, one runner caught in a drifting prison, one
    // arrived at the line, one frozen mid-way; sneaklook: the chant at 4 syllables; the card with its order line)
    else if (name === 'sneak' || name === 'sneakchant') {
      party(longNicks(), { plan: ['sneak'] }, 101); toPlaying();
      put(1, 120, 200); put(2, 186, 200); put(3, 60, 200); step(3); D.press('right', true, 2); step(4); D.press('right', false, 2);
      if (name === 'sneakchant') { for (let k = 0; k < 4; k++) { P.press(0, 'shoot'); step(6); } step(4); }
      else { const T = P.look(); until(() => G.frame >= T - 10, 60); D.press('right', true, 1); until(() => G.frame >= T + 13, 60); D.press('right', false, 1); step(16); }
    } else if (name === 'sneakcard') { party(longNicks(), { plan: ['water', 'sneak'] }, 101); toPlaying(); P.skip(); toCard(); step(170); }
    else if (name === 'milkdecoy') { P.vclock(true, 1000); party(longNicks(), { plan: ['milk'] }, 101); toPlaying(); toRound(3); until(() => P.seen() && P.seen().r === 3 && P.seen().d.length > 0, 400); step(3); }
    D.G.manual = true; D.step(0);
    await sleep(300);
    log('PARTY SHOT READY ' + name);
  }
  async function run() {
    for (let i = 0; i < 300 && !(window.PG && PG.debug && PG.debug.party); i++) await sleep(20);
    D = PG.debug; G = D.G; P = D.party; K = P.consts();
    D.tro.ns('party'); D.tro.away(false);
    if (/touch/.test(location.hash)) window.dispatchEvent(new Event('touchstart'));
    const sm = /shot=([a-z]+)/.exec(location.hash);
    if (sm) { await shot(sm[1]); return; }
    const steps = FIT_ONLY ? [fitTests] : [rotationTests, pointTests, waterTests, soapTests, raftTests, crownTests, ballTests, machineryTests, milkTests, puffTests, sneakTests, noKoTests, cardFlowTests, beatTests, flowTests, coinTests, troTests, arenaTests, cardTests, fitTests, touchTests];
    for (const f of steps) {
      try { await f(); } catch (e) { fail++; log('PARTY FAIL ' + f.name + ' threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
    }
    log('PARTY DONE pass=' + pass + ' fail=' + fail);
  }
  setTimeout(run, 50);
})();
