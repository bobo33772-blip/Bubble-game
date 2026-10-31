// 파티 새 게임 2 (design/party-games-2.md §14.1): the shared machinery v2 and the new games - offline, one engine, driven
// frame by frame with PG.debug.step on a virtual clock (vclock: press and draw times exact). The rotation, the cards'
// fit, the demos' and the HUD's every-game loops run over MINI_IDS in party.js and pick the new games up there.
//   node build.js
//   node tools/run-chrome.js test-party2.html party2.png 900 760 120000 "PARTY2 DONE"
// Checks: the machinery (PARTY_V 8, the MINI flags - music / base / short -, the room's new-games line, PARTY_TEXT, 유령
// drawn through the scratch canvas at GHOST.alpha and never p.out / p.ghost, its HUD panel, miniRt monotonic and
// clamped by LAG_MAX, miniStamp's bounds, miniPast by rtMax / by LAG_MAX / a stale seat, relative ticks through
// parseBody past G.frame 1e6), 수도꼭지 순서 기억하기 (tapTests: tapSeq pure and never three alike, lengths and speeds,
// the show's lit frames and notes, the go draw once, answers - right, wrong at once, early presses ignored, the window's
// edge, the minMs clamp -, the close on all reports / a stale seat / the cap, points, 유령, everyone wrong, a 유령
// scoring, the end's +2, the key, coins, a leaver, the view and its merge, the fast party, the worst honest 판, pips
// without directions, no music, the card), 목욕 의자 뺏기 (chairTests).
// Prints "PARTY2 PASS|FAIL <name>", "PARTY2 INFO ..." and "PARTY2 DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, inf) => { if (cond) { pass++; log('PARTY2 PASS ' + name); } else { fail++; log('PARTY2 FAIL ' + name + (inf !== undefined ? ' :: ' + JSON.stringify(inf) : '')); } return !!cond; };
  const info = (s) => log('PARTY2 INFO ' + s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let D, G, P, K;
  const PS = () => P.state();
  const pl = (slot) => G.players.find((q) => q.slot === slot);
  const step = (n) => D.step(n);
  function until(pred, max) { for (let i = 0; i < max; i++) { if (pred()) return i; D.step(1); } return pred() ? max : -1; }
  function readyAll() { until(() => G.mode !== 'card' || PS().t >= 12, 40); if (G.mode === 'card') for (const p of G.players) P.ready(p.slot); }
  const toPlaying = () => { readyAll(); return until(() => G.mode === 'playing', 1200); };
  const toCard = () => until(() => G.mode === 'card' || G.mode === 'podium', 2400);
  function party(chars, opts, seed) { D.seed(seed === undefined ? 7 : seed); D.local.party(chars, opts); }
  function longNicks() { return ['가나다라마바사아자차카타', '하늘바다구름별달해님', '뽀득뽀득거품왕자님아', '까삐까삐까삐까삐까삐'].map((nick, i) => ({ char: ['duck', 'capy', 'otter', 'frog'][i], nick })); }
  const CH4 = ['duck', 'cat', 'frog', 'otter'];
  const cv = () => $('pg-canvas').getContext('2d');
  const px = (x, y, w, h) => Array.from(cv().getImageData(x, y, w, h).data);

  // ---------------------------------------------------------------- 1. the machinery v2 (3)
  function machineryTests() {
    P.vclock(true, 1000);
    ok('PARTY_V 8, LAG_MAX 60 (SNEAK.lagMax reads it), GHOST 0.55 / +2', K.PARTY_V === 8 && K.LAG_MAX === 60 && K.SNEAK.lagMax === 60 && K.GHOST.alpha === 0.55 && K.GHOST.bonus === 2, [K.PARTY_V, K.LAG_MAX, K.SNEAK.lagMax, K.GHOST]);
    const MI = P.mini();
    ok('MINI flags: tap music null, chair music chair; base on chair and sneak; short on every game after the first three', MI.tap.music === null && (!MI.chair || MI.chair.music === 'chair') && (!MI.chair || MI.chair.base === true) && MI.sneak.base === true && !MI.milk.base
      && K.MINI_IDS.slice(K.MINI_OLD).every((id) => typeof MI[id].short === 'string' && MI[id].short.length > 0) && MI.milk.short === '바나나우유' && MI.puff.short === '펑!' && MI.sneak.short === '술래' && MI.tap.short === '수도꼭지', MI.tap);
    // the room's new-games line (from short) - 3 / 4 players
    const r = P.rules({ n: 3, bet: 0 }), want = '새 게임: ' + K.MINI_IDS.slice(K.MINI_OLD).map((id) => MI[id].short).join(' · ');
    ok('rules: the new games line is 새 게임: + their short names (' + want + ')', r.includes(want) && !r.some((l) => l.indexOf('바나나우유 잡기 ·') >= 0), r);
    // PARTY_TEXT warms every new string (the names, how / rule / keys lines, short, the PARTY_TX additions)
    const txt = P.text(), tx = P.tx();
    const need = ['수도꼭지 순서 기억하기', MI.tap.how, MI.tap.rule, MI.tap.keys, MI.tap.keysT, tx.ghost1, tx.ghost2, tx.tpGo, tx.tpWatch, tx.tpAll1, tx.tpAll2, tx.tpEnd, tx.newGames.trim(), tx.surv2, tx.survAll, tx.miss, tx.tpLate];
    ok('PARTY_TEXT holds every new string of the games in play', need.every((s) => txt.indexOf(s.replace('{0}', '')) >= 0), need.filter((s) => txt.indexOf(s.replace('{0}', '')) < 0));
    // music: none for 수도꼭지 (no music at its 시작!); the base kit in 술래 unchanged
    party(['duck', 'cat'], { plan: ['tap'] }); toPlaying(); step(2);
    ok('music: 수도꼭지 plays no track (MINI.tap.music null - Snd.cur null)', P.music() === null && G.music === null, [P.music(), G.music]);
    // 유령: drawn through the scratch canvas at GHOST.alpha - never p.out / p.ghost; its HUD panel dims; bodies untouched
    party(['duck', 'cat', 'frog'], { plan: ['tap'] }); toPlaying(); until(() => G.frame % 30 === 5, 40);
    const b = pl(1), X = Math.round(b.x), Y = Math.round(b.y), o = pl(0), OX = Math.round(o.x), OY = Math.round(o.y);
    const r0 = px(X, Y, 16, 16), s0 = px(OX, OY, 16, 16), h0 = px(53, 0, 50, 16);
    const keep = b.x; b.x = -200; step(1); const bg = px(X, Y, 16, 16); b.x = keep;
    P.ghost(1, true); step(1);
    const r1 = px(X, Y, 16, 16), s1 = px(OX, OY, 16, 16), h1 = px(53, 0, 50, 16);
    let n = 0, sum = 0;
    for (let i = 0; i < r0.length; i += 4) for (let c = 0; c < 3; c++) { const d0 = r0[i + c] - bg[i + c]; if (Math.abs(d0) > 60) { n++; sum += (r1[i + c] - bg[i + c]) / d0; } }
    const k = n ? sum / n : 0;
    ok('유령: drawn see-through - its body pixels at ~0.55 of the way from the floor to the solid animal (' + k.toFixed(2) + ' over ' + n + ' channels)', n > 30 && k > 0.45 && k < 0.65, [n, k]);
    ok('유령: another animal beside it is drawn exactly as before', same(s0, s1));
    ok('유령: never p.out, never p.ghost (co-op\'s ghost bubble); its seat only in M.gh', !b.out && !b.ghost && same(P.ghosts(), { 1: 1 }) && same(P.mg()[8], 2), [b.out, b.ghost, P.ghosts(), P.mg()[8]]);
    ok('유령: its HUD panel changes (dimmed, the wisp beside its icon)', !same(h0, h1));
    P.ghost(1, false);
    // relative ticks: parseBody clamps every mi int to +-1e6 - a tick relative to its anchor survives, an absolute one past 1e6 would not
    const rel = P.parseBody({ k: 5, mi: [0, 1, 2, 1234567 - 1234500, 33] }), abs = P.parseBody({ k: 5, mi: [0, 1, 2, 1234567, 33] });
    ok('mi: a tick sent relative to its anchor (67) survives parseBody; an absolute one past 1e6 is clamped (why mi carries tick - anchor)', rel.mi[3] === 67 && abs.mi[3] === 1e6, [rel.mi, abs.mi]);
    P.vclock(false);
  }

  // ---------------------------------------------------------------- 2. the stamps (3.2): miniRt, miniStamp, miniPast
  function stampTests() {
    party(['duck', 'cat', 'frog'], { plan: ['tap'] }); toPlaying(); step(100);
    const f = G.frame;
    P.fakeBody(1, { rt: f - 10 }); P.fakeBody(2, { rt: f - 300 });
    const r1 = P.rt();
    ok('miniRt: a host-local seat is at G.frame; a remote seat at its state\'s rt, never under its arrival - LAG_MAX', r1[0] === f && r1[1] === f - 10 && r1[2] === f - K.LAG_MAX, r1);
    P.fakeBody(1, { rt: f - 40 }); const r2 = P.rt();
    ok('miniRt: monotonic - an older rt later changes nothing', r2[1] === f - 10, r2);
    ok('miniStamp: a reported tick clamped into [its state\'s arrival - LAG_MAX, G.frame]', P.stamp(1, f - 500) === f - K.LAG_MAX && P.stamp(1, f + 99) === f && P.stamp(1, f - 5) === f - 5 && P.stamp(0, f - 500) === f - K.LAG_MAX, [P.stamp(1, f - 500), P.stamp(1, f + 99), P.stamp(1, f - 5)]);
    // past: seat 2's view is at f - 60: a claim at f - 20 waits for it (or for f0 + LAG_MAX); with seat 2 skipped, seat 1 (f - 10) is past it
    ok('miniPast: not past while a seat\'s view is behind the stamp; past with that seat skipped (final elsewhere / the claimant)', !P.past(f - 20, f, {}) && P.past(f - 20, f, { 2: 1 }) && !P.past(f - 5, f, { 2: 1 }), [P.past(f - 20, f, {}), P.past(f - 20, f, { 2: 1 })]);
    ok('miniPast: ... and past anyway LAG_MAX after the host saw the claim', P.past(f - 20, f - K.LAG_MAX, {}) && !P.past(f - 20, f - K.LAG_MAX + 1, {}));
    step(35); P.fakeBody(1, { rt: G.frame });
    ok('miniPast: a stale seat (no state for staleF) is not waited for', P.past(f - 20, G.frame, {}), P.rt());
  }

  // ---------------------------------------------------------------- 3. 수도꼭지 순서 기억하기 (4)
  const TP = () => K.TAP;
  const tapNow = () => P.tap();
  const toGo = () => until(() => G.mode !== 'playing' || (P.seen() && P.seen().r === tapNow().r && P.seen().go !== undefined), 800);
  const toTapRound = (r) => until(() => G.mode !== 'playing' || (tapNow().r === r && tapNow().ph === 0), 2400);
  const seqOf = (r) => P.tapList(tapNow().seed, TP().len0 + r - 1);
  function tapTests() {
    const T = TP();
    // the list: pure, 0..3, never three alike; lengths and speeds by round
    const bad = []; let dist = [0, 0, 0, 0];
    for (let seed = 1; seed <= 400; seed++) {
      const L = P.tapList(seed, 8), L2 = P.tapList(seed, 5);
      if (!same(L.slice(0, 5), L2) || L.some((v) => v < 0 || v > 3) || L.some((v, i) => i >= 2 && v === L[i - 1] && v === L[i - 2]) || P.tapSeq(seed, 6) !== L[6]) bad.push([seed, L]);
      L.forEach((v) => dist[v]++);
    }
    ok('tapSeq: pure (a longer list starts with the shorter one), 0..3, never three of the same in a row; all four faucets used (400 seeds)', !bad.length && dist.every((v) => v > 500), [bad.slice(0, 3), dist]);
    ok('rounds: 6 of 3..8 faucets, a step 30 / 30 / 24 / 24 / 20 / 20 f, the window 1500 + 700 ms a faucet', T.rounds === 6 && T.len0 === 3 && same(T.sp, [30, 30, 24, 24, 20, 20]) && T.winMs === 1500 && T.perMs === 700 && T.minMs === 80);

    // the show: step k first lit at A + intro + k sp (its note then), the go drawn once at G
    P.vclock(true, 1000);
    party(CH4, { plan: ['tap'] }, 21); toPlaying();
    const m1 = tapNow(), A = m1.A;
    ok('round 1: the arm A is 시작!, G = A + 36 + 3 x 30 + 12; the banner 잘 봐요! / 3개를 기억해요', m1.r === 1 && m1.ph === 0 && m1.G === A + T.intro + 3 * 30 + T.goGap && G.banner && G.banner.main === P.tx().tpWatch && G.banner.sub === '3개를 기억해요', [m1, G.banner]);
    let litAt = [], leak = 0;
    for (let f = 0; f < 200 && !(P.seen() && P.seen().go !== undefined); f++) { const s0 = P.seen(), n0 = s0 && s0.r === 1 ? s0.lit : 0; step(1); const s1 = P.seen(); if (s1 && s1.lit > n0) litAt.push(G.frame - A); if (P.mg()[7].some((q) => q.length !== 4 || q[3] !== 0)) leak++; }
    ok('show: each step first drawn at A + 36 + k x 30 (its note then) - 36 / 66 / 96', same(litAt, [36, 66, 96]), litAt);
    const sh = P.seen();
    ok('go: drawn once at G (its draw time G.drawT then), 따라 해요! on this screen', sh.go !== undefined && sh.gf === m1.G && G.frame === m1.G && G.banner && G.banner.main === P.tx().tpGo, [sh, G.frame, m1.G, G.banner]);
    // answers (round 1, 4 seats): 0 right at 300 ms a step; 1 wrong second press; 2 presses before go then right; 3 nothing
    const s1 = seqOf(1), wrong = (s1[1] + 1) % 4;
    P.answer(0, s1, 300);
    const KIND = ['jump', 'L', 'R', 'D'];
    P.press(1, KIND[s1[0]], sh.go + 200); P.press(1, KIND[wrong], sh.go + 400); P.press(1, KIND[s1[2]], sh.go + 600);
    P.press(2, KIND[s1[0]], sh.go - 50); P.press(2, 'down', sh.go + 100); s1.forEach((v, i) => P.press(2, KIND[v], sh.go + 250 * (i + 1)));
    step(1);
    const L0 = P.mloc(0), L1 = P.mloc(1), L2 = P.mloc(2);
    ok('answer: all right -> done in (last press - my go draw) ms (3 x 300 = 900); its mi [판 i, round, steps, 1, 900]', L0.flag === 1 && L0.ms === 900 && same(P.mi(0), [PS().i, 1, 3, 1, 900]), [L0, P.mi(0)]);
    ok('answer: a wrong second press ends it at once (flag 2, the window\'s ms), the cold water on its screen; the press after it counts for nothing', L1.flag === 2 && L1.step === 1 && L1.ms === 1500 + 700 * 3 && !!(P.mloc().fx && P.mloc().fx[1]), [L1, P.mloc().fx]);
    ok('answer: a press before my go draw counts for nothing (no penalty), a \'down\' is not a faucet - then right in 750 ms', L2.flag === 1 && L2.ms === 750, L2);
    ok('host: a seat\'s report keeps its steps and its first final flag (rep [3, 1, 900] / [1, 2, win])', same(tapNow().rep[0], [3, 1, 900]) && same(tapNow().rep[1], [1, 2, 3600]), tapNow().rep);
    ok('wire: during the input a row is [slot, steps, flag, 0] - how many, never which faucet', P.mg()[7].every((q) => q.length === 4 && q[3] === 0) && P.mg()[7].some((q) => q[0] === 0 && q[1] === 3), P.mg()[7]);
    // seat 3: nothing - a time out once its window passed (1500 + 2100 = 3600 ms of my clock), then the round closes
    const goT = sh.go; let lateAt = -1;
    for (let f = 0; f < 300 && lateAt < 0; f++) { step(1); const L3 = P.mloc(3); if (L3 && L3.flag === 3) lateAt = P.now() - goT; }
    const rv1 = tapNow();
    ok('time out: no answer - a time out once my clock passed the window (3600 ms), then the round closes on all reports', lateAt > 3600 && lateAt <= 3600 + 17 && rv1.ph === 2, [lateAt, rv1.ph]);
    ok('close: +1 each correct one; the wrong and the late living ones go out (유령, 탈락!); ms + its time (the window for wrong / late)', same(rv1.pts, { 0: 1, 2: 1 }) && same(rv1.gh, { 1: 1, 3: 1 }) && same(rv1.ms, { 0: 900, 1: 3600, 2: 750, 3: 3600 }) && same(rv1.res.map((q) => q[2]), [1, 2, 1, 3]), rv1);
    ok('reveal: the rows ride in g.mg with the 유령 bits (seats 1 and 3: 10) and the points', P.mg()[2] === 2 && same(P.mg()[7], rv1.res) && P.mg()[8] === 10 && same(P.mg()[9], [1, 0, 1, 0]), P.mg());
    ok('coins: a correct sequence of MY seat (slot 0) is one action (bshots 1 - not seat 2\'s)', PS().coins.bshots === 1, PS().coins);
    // round 2: the 유령 still answer and score; the living all fail -> nobody out (모두 틀렸어요!)
    toTapRound(2); toGo(); const s2 = seqOf(2), sh2 = P.seen();
    P.answer(1, s2, 200); P.answer(3, s2, 200);
    P.press(0, KIND[(s2[0] + 1) % 4], sh2.go + 100); P.press(2, KIND[(s2[0] + 2) % 4], sh2.go + 100);
    step(1); until(() => tapNow().ph === 2, 50);
    const rv2 = tapNow();
    ok('유령: still in every round - both 유령 answer right and score +1 (not back to living)', rv2.pts[1] === 1 && rv2.pts[3] === 1 && same(rv2.gh, { 1: 1, 3: 1 }), rv2);
    ok('everyone living wrong: nobody goes out (모두 틀렸어요! / 이번엔 아무도 안 빠져요)', same(rv2.gh, { 1: 1, 3: 1 }) && G.banner && G.banner.main === P.tx().tpAll1 && G.banner.sub === P.tx().tpAll2, [rv2.gh, G.banner]);
    // round 3: a remote seat (fakeBody) - a correct claim under minMs a step is wrong, over its window late; its
    // first final report stands; a stale seat is not waited for; a missing report at the cap is a time out
    toTapRound(3); toGo();
    const pi = PS().i, n3 = 5, win3 = 1500 + 700 * n3;
    P.fakeBody(2, { mi: [pi, 3, 2, 0, 0] }); step(1);
    ok('remote: steps in progress reach the host (the pips) - rep [2, 0, 0]', same(tapNow().rep[2], [2, 0, 0]), tapNow().rep);
    P.fakeBody(2, { mi: [pi, 3, 5, 1, 80 * 5 - 1] }); step(1);
    ok('remote: a correct one under 80 ms a step is taken as wrong', tapNow().rep[2][1] === 2, tapNow().rep);
    P.fakeBody(2, { mi: [pi, 3, 5, 1, 1000] }); step(1);
    ok('remote: ... a later report of the round changes nothing (its first final flag stands)', tapNow().rep[2][1] === 2);
    P.fakeBody(3, { mi: [pi, 3, 5, 1, win3 + 1] }); step(1);
    ok('remote: a correct one over its window is a time out', tapNow().rep[3][1] === 3, tapNow().rep);
    P.answer(0, seqOf(3), 300); step(1);
    // seat 1 is local and silent; its window runs out on its own; both remote seats are final - the close at once
    until(() => tapNow().ph === 2, 400);
    ok('close: every seat final (a local time out counted) -> the reveal', tapNow().ph === 2 && tapNow().res.find((q) => q[0] === 1)[2] === 3, tapNow().res);
    // round 4: seat 2 goes stale (no state) - not waited for; seat 3 keeps sending states but never reports - the cap
    toTapRound(4); toGo(); const go4 = tapNow().G;
    P.answer(0, seqOf(4), 300); P.answer(1, seqOf(4), 300);
    let c4 = -1; for (let f = 0; f < 600 && c4 < 0; f++) { P.fakeBody(3, {}); step(1); if (tapNow().ph === 2) c4 = G.frame; }
    const cap4 = go4 + Math.ceil((1500 + 700 * 6) * 60 / 1000) + T.slackF;
    ok('close: a seat still sending states but never reporting is waited for up to the cap (G + window + 90 f) - then a time out; a stale one is not waited for', c4 === cap4 && tapNow().res.find((q) => q[0] === 3)[2] === 3 && tapNow().res.find((q) => q[0] === 2)[2] === 3, [c4, cap4, tapNow().res]);
    // a leaver mid-round: the round resolves without it
    toTapRound(5); toGo(); P.drop(3); P.answer(0, seqOf(5), 300); P.answer(1, seqOf(5), 300);
    until(() => tapNow().ph === 2, 900);
    ok('leaver: one leaves mid-round - the round closes without it (its row and its 유령 bit gone)', tapNow().ph === 2 && !tapNow().res.some((q) => q[0] === 3) && !tapNow().gh[3] && P.mg()[7].length === 3, [tapNow().res, tapNow().gh]);
    // the end: after round 6's reveal everyone still living +2; the 판 ends 30 f after that beat
    toTapRound(6); toGo(); P.answer(0, seqOf(6), 300); P.answer(1, seqOf(6), 300);
    const liv = [0, 1, 2].filter((s) => !tapNow().gh[s]), pts6 = Object.assign({}, tapNow().pts);
    until(() => tapNow().ph === 3, 900);
    const e6 = tapNow();
    ok('end: everyone still living gets +2 (' + liv.join(', ') + '), the banner says who', liv.every((s) => (e6.pts[s] | 0) >= (pts6[s] | 0) + 2) && Object.keys(e6.gh).every((s) => (e6.pts[s] | 0) <= (pts6[s] | 0) + 1) && G.banner && (G.banner.main === P.tx().survAll || G.banner.main.indexOf('살아남았다!') > 0) && G.banner.sub === P.tx().tpEnd, [pts6, e6.pts, e6.gh, G.banner]);
    const endF = until(() => G.mode !== 'playing', 200);
    ok('end: the 판 ends bonusF + endF after the beat - by its rounds, not the 75 s cap', G.mode === 'result' && endF >= T.bonusF + T.endF - 2 && endF <= T.bonusF + T.endF + 2 && PS().left > 0, [endF, G.mode, PS().left]);
    // the key: points first, then less ms; equal both - a shared place
    party(['duck', 'cat', 'frog'], { plan: ['tap'] }); toPlaying();
    Object.assign(G.mini, { pts: { 0: 4, 1: 4, 2: 4 }, ms: { 0: 9000, 1: 8900, 2: 9000 } });
    const pm = new Map(P.places());
    ok('key: equal points - the less ms places higher; equal ms too - a shared place', pm.get(1) === 1 && pm.get(0) === 2 && pm.get(2) === 2, P.places());
    // the view: rows bounded, the next snapshot's round once my view is past its arm, junk dropped
    const v = P.tapView(['t', 2, 0, 77, 500, 650, -1, [[1, 2, 0, 0], ['x'], ['y', 1, 1, 1]], 2, [1, 0, 0, 0], 6]);
    const v2 = P.tapView(['t', 2, 2, 77, 500, 650, 900, [], 0, [], 6], ['t', 3, 0, 77, 1e9, 1e9, -1, [], 0, [], 6]);
    ok('view: tapView reads the rows within bounds (junk dropped), the 유령 bits, the points; a next round not yet reached is not merged', v.r === 2 && same(v.rep, { 1: [2, 0, 0] }) && same(v.gh, { 1: 1 }) && same(v.pts, { 0: 1 }) && v2.r === 2, [v, v2]);
    P.vclock(false);
    // the fast party: 3 rounds, under fastSecs 35; the worst honest 판 (every window waited out) under the 75 s cap
    for (const fast of [true, false]) {
      P.fast(fast); party(['duck', 'cat'], { plan: ['tap'] }); toPlaying();
      const t0 = G.frame, n = tapNow().n; until(() => G.mode !== 'playing', 75 * 60 + 60); const len = G.frame - t0;
      ok((fast ? 'fast party: 3 rounds, done in ' : 'worst honest 판 (no answers, every window and slack waited out): ') + (len / 60).toFixed(1) + ' s - under ' + (fast ? 'fastSecs 35' : 'the 75 s cap'), n === (fast ? T.fast : T.rounds) && G.mode === 'result' && len < (fast ? 35 : 75) * 60 && PS().left > 0, [n, len, G.mode]);
    }
    P.fast(false);
    // the card
    party(longNicks(), { plan: ['tap'] }); step(80);
    const c = P.card();
    ok('card: 수도꼭지 순서 기억하기 - its how, rule and keys lines as specified', c.name === '수도꼭지 순서 기억하기' && c.how === '순서대로 똑같이 눌러요! 틀리면 빠져요' && c.rule === '점점 길어져요 · 빠져도 유령으로 계속 해요 · 맞히면 1점, 끝까지 남으면 +2점' && c.keys === '↑ ← ↓ → 로 눌러요 (Z·X도 ↑)' && P.mini().tap.keysT === '점프는 위 · 조이스틱은 ← ↓ →' && c.demo, c);
    const d = P.demo('tap');
    ok('demo [tap]: 240 frames into a 96x32 context without errors, pixels left', d && !d.err && d.lit > 200, d);
  }

  // ---------------------------------------------------------------- screenshot scenes (#shot=tap|tapgo|taprev|tapcard|
  // chair|chairstop|chairrev|chaircard[&s=1|2|0]) - to LOOK at
  function setScale(s) {
    const st = $('pg-stage'); st.style.flex = 'none'; st.style.width = Math.round(256 * s + 22) + 'px'; st.style.height = Math.round(224 * s + 22) + 'px';
    window.dispatchEvent(new Event('resize'));
  }
  async function shot(name) {
    const sm0 = /[&#]s=([0-9.]+)/.exec(location.hash), sc = sm0 ? +sm0[1] : 2; if (sc > 0) setScale(sc);
    P.vclock(true, 1000);
    if (/^tap/.test(name)) {
      party(longNicks(), { plan: ['tap'] }, 31);
      if (name === 'tapcard') step(100);
      else {
        toPlaying(); P.ghost(3, true);
        if (name === 'tap') { until(() => !!(P.seen() && P.seen().lit === 2), 300); step(6); }
        else { toGo(); const s = seqOf(1); P.answer(0, s, 300); P.answer(1, [s[0], (s[1] + 1) % 4], 300); P.answer(2, s.slice(0, 2), 300); step(name === 'taprev' ? 260 : 20); }
      }
    } else if (/^chair/.test(name)) {
      party(longNicks(), { plan: ['chair'] }, 31);
      if (name === 'chaircard') step(100);
      else { toPlaying(); P.ghost(3, true); step(60); if (name !== 'chair') { P.stopAt(G.frame + 2); step(name === 'chairrev' ? 400 : 30); } }
    }
    D.G.manual = true; D.step(0);
    await sleep(300);
    log('PARTY2 SHOT READY ' + name);
  }
  async function run() {
    for (let i = 0; i < 300 && !(window.PG && PG.debug && PG.debug.party); i++) await sleep(20);
    D = PG.debug; G = D.G; P = D.party; K = P.consts();
    D.tro.ns('party2'); D.tro.away(false);
    const sm = /shot=([a-z]+)/.exec(location.hash);
    if (sm) { await shot(sm[1]); return; }
    const steps = [machineryTests, stampTests, tapTests];
    for (const f of steps) {
      try { await f(); } catch (e) { fail++; log('PARTY2 FAIL ' + f.name + ' threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
    }
    log('PARTY2 DONE pass=' + pass + ' fail=' + fail);
  }
  setTimeout(run, 50);
})();
