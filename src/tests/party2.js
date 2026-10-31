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
// without directions, no music, the card), 목욕 의자 뺏기 (chairTests), 맥반석 계란 돌리기 (eggTests: the kits' base flag, the
// drop - never the last loser, never a stale seat -, B hidden, the heat, receipts on this screen - the slack, the juggle,
// a remote holder's shownAt sample, remote receipts and since = the stamp -, the prediction and its undos, hot feet, the
// burst's wait and late passes, points, 유령, the survivor, a leaver, a hidden tab, the key, coins, 2 players, the view,
// the lengths, the card), 미끌미끌 비누 씨름 (sumoTests: 비누 평상 and its fallback, the soap - 18 f to top speed and back,
// only while a foot is on the 평상 -, the push bubble - 2.0 px/f, 60 f, a wall / the 평상's side pops it, never floats -,
// a push on a host-local body - vx, the hop, the bubble popped, never a capture, its report, ~40 px of slide, off the edge
// from 20 px -, a remote report and its stamp's clamp, falls by state and stamp, the raft kept in its 탕 and its hop,
// credit within 120 f, 역전 once a set, the set's end / survivor / equal stamps / reset, the last 10 s, time-up, a stale
// seat, the key, coins from blows, a leaver, the view, the fast party, the card and demo, a battle after it).
//   #only=<section> runs one section (machinery, stamp, tap, chair, egg, sumo); #shot=<scene> draws one scene to look at
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
    const need = ['수도꼭지 순서 기억하기', MI.tap.how, MI.tap.rule, MI.tap.keys, MI.tap.keysT, tx.ghost1, tx.ghost2, tx.tpGo, tx.tpWatch, tx.tpAll1, tx.tpAll2, tx.tpEnd, tx.newGames.trim(), tx.surv2, tx.survAll, tx.miss, tx.tpLate,
      '맥반석 계란 돌리기', MI.egg.how, MI.egg.rule, MI.egg.keys, MI.egg.keysT, MI.egg.short, tx.egDrop, tx.egMine1, tx.egMine2, tx.egHot,
      '미끌미끌 비누 씨름', MI.sumo.how, MI.sumo.rule, MI.sumo.keys, MI.sumo.keysT, MI.sumo.short, tx.suFall, tx.suPush, tx.suKeep, tx.suRaft1, tx.suRaft2, tx.suLast1, tx.suLast2];
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

  // ---------------------------------------------------------------- 4. 목욕 의자 뺏기 (5)
  const CHR = () => K.CHAIR;
  const chNow = () => P.chair();
  // a body standing on the floor with its feet centre at fx (still: no input moves it)
  const put = (slot, fx, air) => { const p = pl(slot); p.x = fx - 8; p.y = air ? 180 : 200; p.vx = 0; p.vy = 0; p.onGround = !air; };
  const toStop = (i) => until(() => G.mode !== 'playing' || (chNow().i === i && chNow().ph === 0), 2400);
  const own = (j) => (chNow().own || {})[j] || null;
  function chairTests() {
    const C = CHR();
    // the stools: pure, inside lo..hi, every speed in 1.4..2.0 (but at a turn); the freeze spread >= gap, pure, inside
    let bad = [], spd = [9, 0];
    for (let seed = 1; seed <= 60; seed++) for (let i = 1; i <= 8; i++) for (let j = 0; j < 3; j++) {
      for (let dt = 0; dt < 400; dt += 7) {
        const x = P.chairX(seed, i, j, dt), x1 = P.chairX(seed, i, j, dt + 1), v = Math.abs(x1 - x);
        if (x < C.lo - 1e-9 || x > C.hi + 1e-9 || x !== P.chairX(seed, i, j, dt)) bad.push([seed, i, j, dt, x]);
        if (x > C.lo + 3 && x < C.hi - 3 && x1 > C.lo + 3 && x1 < C.hi - 3) { spd[0] = Math.min(spd[0], v); spd[1] = Math.max(spd[1], v); }
      }
    }
    ok('chairX: pure, inside ' + C.lo + '..' + C.hi + ', each stool at its own speed in 1.4..2.0 px/f (' + spd.map((v) => v.toFixed(3)).join('..') + ')', !bad.length && spd[0] >= 1.4 - 1e-9 && spd[1] <= 2.0 + 1e-9 && spd[1] - spd[0] > 0.4, [bad.slice(0, 3), spd]);
    P.vclock(true, 1000);
    party(CH4, { plan: ['chair'] }, 41); toPlaying();
    ok('chair: 4 players - 3 stools; the base kit; the chair track (G.music chair, Snd.cur chair)', chNow().k === 3 && chNow().i === 1 && G.music === 'chair' && P.music() === 'chair' && P.mini().chair.base === true, [chNow(), G.music, P.music()]);
    let sp = [];
    for (let s = 1; s <= 200; s++) { G.mini.seed = s; G.mini.S = G.mini.Ms + 37 + s; const xs = P.stoolsAt(G.mini.S + 5), o = xs.slice().sort((a, b) => a - b); if (o[1] - o[0] < C.gap || o[2] - o[1] < C.gap || o[0] < C.lo || o[2] > C.hi || !same(xs, P.stoolsAt(G.mini.S + 99))) sp.push([s, xs]); }
    ok('freeze: the stools stand still from S, spread at least 18 px apart inside lo..hi (200 seeds)', !sp.length, sp.slice(0, 3));
    // S: never in g.mg before its tick; then the stop on this screen (the scratch, 그만!) and the music cut here
    party(CH4, { plan: ['chair'] }, 41); toPlaying();
    const S0 = chNow().S; let leak = 0, mus = [];
    for (let f = 0; f < 400 && G.frame < S0 + 2; f++) { if (P.mg()[5] !== -1 && G.frame < S0) leak++; mus.push([G.frame, P.music()]); step(1); }
    ok('S: drawn 120..300 f after the music started, never in g.mg before the host reached it, then there', S0 - chNow().Ms >= C.music[0] && S0 - chNow().Ms <= C.music[1] && !leak && P.mg()[5] === S0, [S0, chNow().Ms, leak, P.mg()[5]]);
    const cut = mus.find((q) => q[1] === null);
    ok('music: this page asks for chair until its own view of S, null from that frame (G.music stays chair); 그만! here', cut && cut[0] === S0 && mus.filter((q) => q[0] < S0).every((q) => q[1] === 'chair') && G.music === 'chair' && P.seen().sf === S0, [cut, P.seen(), G.music]);
    // a gliding stool cannot be sat on; at S: the seat's edge (6 px sits, 6.1 does not), airborne no
    party(CH4, { plan: ['chair'] }, 43); toPlaying();
    const S1 = G.frame + 30; P.stopAt(S1);
    let glide = 0;
    for (let f = 0; f < 29; f++) { const x = P.stoolsAt(G.frame + 1)[0]; put(0, x); step(1); if (P.mloc(0) && P.mloc(0).sit >= 0) glide++; }
    const xs1 = P.stoolsAt(S1);
    put(0, xs1[0] + 6); put(1, xs1[1] + 6.1); put(2, xs1[2], true); put(3, 4);
    step(1);
    ok('sit: none on a gliding stool (a body on it the whole music)', glide === 0, glide);
    ok('sit: at S feet 6 px from a stool sit (parked, the claim [판 i, stop, stool, tick - S, dx]); 6.1 px and an airborne body do not', G.frame === S1 && P.mloc(0).sit === 0 && same(P.mi(0), [PS().i, 1, 0, 0, 60]) && P.mloc(1).sit === -1 && P.mloc(2).sit === -1 && P.parked(0) && !P.parked(1), [G.frame, S1, P.mloc(0), P.mloc(1), P.mloc(2)]);
    ok('host: the claim owns the stool (provisional, its stamp S, dx 60)', same(own(0), [0, S1, 60, S1, false]) || (own(0) && own(0)[0] === 0 && own(0)[1] === S1 && own(0)[2] === 60), own(0));
    step(39); put(1, xs1[1]); step(1);
    ok('sit: ... and at S + 40 too (a host-local claim final at once: no remote seat to wait for)', P.mloc(1).sit === 1 && own(1)[0] === 1 && own(1)[1] === S1 + 40 && own(1)[4] === true && own(0)[4] === true, [P.mloc(1), own(1)]);
    // the stamps: a remote claim against a host-local one - the earlier keeps it, either way round; equal - dx, then rotation
    // (seats 1-3 remote: their states keep coming with views 40 f behind - keep - except the seats named)
    party(CH4, { plan: ['chair'] }, 45); toPlaying();
    const S2 = G.frame + 10; P.stopAt(S2);
    const keep = (...skip) => { for (const s of [1, 2, 3]) if (!skip.includes(s)) P.fakeBody(s, { rt: Math.max(0, G.frame - 40) }); };
    for (const s of [0, 1, 2, 3]) put(s, 4 + 2 * s);
    while (G.frame < S2 + 29) { keep(); step(1); }
    const xs2 = P.stoolsAt(S2); put(0, xs2[0] + 5); keep(); step(1);   // (H sits at S + 30, dx 50)
    ok('host-local: H sits at S + 30 (provisional: the remote seats\' views are behind it)', P.mloc(0).sit === 0 && own(0)[0] === 0 && own(0)[1] === S2 + 30 && own(0)[2] === 50 && !own(0)[4], own(0));
    for (let f = 0; f < 5; f++) { keep(); step(1); }
    P.sit(1, 0, S2 + 20); keep(1); step(1);
    const b1 = own(0); keep(1); step(1); const m0 = P.mloc(0);
    ok('bump: a remote claim stamped S + 20 (its own view) arriving at S + 36 takes the stool from H (S + 30); H\'s page un-parks it and hops it off', b1[0] === 1 && b1[1] === S2 + 20 && chNow().bump[0] === 1 && m0.sit === -1 && pl(0).vy < 0 && !pl(0).onGround, [b1, m0, pl(0).vy, chNow().bump]);
    until(() => { keep(1); return pl(0).onGround; }, 60);
    put(0, xs2[1]); keep(1); step(1); const h1 = own(1);
    P.sit(2, 1, G.frame + 1); keep(1, 2); step(1);   // (stamped the frame after H's)
    ok('refused: a remote claim stamped one frame after the host-local owner\'s changes nothing', h1 && h1[0] === 0 && own(1)[0] === 0 && own(1)[1] === h1[1] && !chNow().bump[0], [h1, own(1)]);
    for (let f = 0; f < 10; f++) { keep(1, 2); step(1); }
    const T2 = G.frame; P.sit(3, 2, T2, { dx: 30 }); keep(1, 2, 3); step(1);
    const e3 = own(2); P.sit(2, 2, T2, { dx: 20 }); keep(1, 2, 3); step(1);
    ok('equal stamps: the smaller dx keeps it (dx 20 bumps dx 30, both stamped ' + T2 + ')', e3 && e3[0] === 3 && !e3[4] && own(2)[0] === 2 && own(2)[1] === T2 && chNow().bump[3] === 1, [e3, own(2)]);
    party(CH4, { plan: ['chair'] }, 45); toPlaying();
    const S3 = G.frame + 10; P.stopAt(S3); for (const s of [1, 2, 3]) P.fakeBody(s, { rt: G.frame });
    until(() => G.frame >= S3 + 4, 30);
    P.sit(2, 0, S3 + 3, { dx: 10 }); step(1); P.sit(1, 0, S3 + 3, { dx: 10 }); step(1);
    ok('equal stamps and dx: the earlier seat in the rotation (stop 1: seat 1 before seat 2)', own(0)[0] === 1 && chNow().bump[2] === 1, [own(0), chNow().bump]);
    // final: only once every seat that can still claim is past the stamp (or LAG_MAX) - a provisional sitter waited for, a
    // final one not; a final owner is never bumped; a stale seat is not waited for
    party(CH4, { plan: ['chair'] }, 47); toPlaying();
    const S4 = G.frame + 10; P.stopAt(S4); for (const s of [0, 1, 2, 3]) put(s, 4 + 2 * s);
    for (const s of [1, 2, 3]) P.fakeBody(s, { rt: G.frame });
    until(() => G.frame >= S4 + 9, 30);
    const xs4 = P.stoolsAt(S4); put(0, xs4[0]); P.sit(1, 1, S4 + 8); P.fakeBody(2, { rt: S4 + 5 }); P.fakeBody(3, { rt: S4 + 5 }); step(1);   // (H at S + 10; seat 1 at S + 8)
    ok('provisional: H\'s claim (S + 10) and seat 1\'s (S + 8) wait while seats 2-3 have shown views only up to S + 5', own(0) && own(0)[0] === 0 && !own(0)[4] && own(1) && own(1)[0] === 1 && !own(1)[4], [own(0), own(1), P.rt()]);
    P.sit(1, 1, S4 + 8); P.fakeBody(2, { rt: S4 + 12 }); P.fakeBody(3, { rt: S4 + 12 }); step(1);
    const fA = [own(0)[4], own(1)[4]];
    P.sit(1, 1, S4 + 8); P.fakeBody(2, { rt: S4 + 12 }); P.fakeBody(3, { rt: S4 + 12 }); step(1);
    ok('final: seat 1\'s claim (S + 8) once seats 2-3 passed it; H\'s (S + 10) waits for seat 1 while it sits provisionally (its view S + 8), then - seat 1 final - not', fA[0] === false && fA[1] === true && own(0)[4] === true, [fA, own(0)]);
    P.fakeBody(2, { rt: G.frame }); P.sit(3, 0, S4 + 1, { rt: S4 + 1 }); step(1);
    ok('final: never bumped - an earlier stamp (S + 1) against a final owner (S + 10) is refused', own(0)[0] === 0 && !chNow().bump[0], own(0));
    // a stale seat: not waited for; a refused claim (feet 9 px off in its state) - nothing; the page side of a refusal
    party(CH4, { plan: ['chair'] }, 49); toPlaying();
    const S5 = G.frame + 10; P.stopAt(S5); for (const s of [0, 1, 2, 3]) put(s, 4 + 2 * s);
    for (const s of [1, 2, 3]) P.fakeBody(s, { rt: G.frame });
    until(() => G.frame >= S5 + 1, 30);
    const xs5 = P.stoolsAt(S5); put(0, xs5[0]); P.fakeBody(2, { rt: S5 - 50 }); P.fakeBody(3, { rt: S5 - 50 }); step(1);
    const f5 = G.frame; let fin5 = -1;
    for (let f = 0; f < 80 && fin5 < 0; f++) { P.fakeBody(2, { rt: G.frame }); P.fakeBody(3, { rt: G.frame }); step(1); if (own(0)[4]) fin5 = G.frame - f5; }
    ok('stale: seat 1 sends nothing - it is not waited for once stale (30 f), well before LAG_MAX', fin5 > 0 && fin5 <= K.MILK.staleF + 3, fin5);
    P.sit(2, 1, G.frame, { x: xs5[1] + 9 }); step(1);
    ok('refused: a claim whose state has its feet 9 px off the stool (slack 8) is not taken', !own(1), own(1));
    // (the page side: my claim never shown as mine - my sit is let go when my view passes tick + LAG_MAX + 30, and I sit
    // again on the same frame with a new tick - a new claim the host takes)
    pl(3).local = true; put(3, xs5[2]); step(1); const t3 = P.mloc(3).tick;
    delete G.mini.own[2]; let re3 = -1;
    for (let f = 0; f < 120 && re3 < 0; f++) { step(1); const L = P.mloc(3); if (L.sit === 2 && L.tick > t3) re3 = G.frame; }
    ok('let go: a sit my mirror never shows as mine is let go when my view passes tick + LAG_MAX + 30 - then I sit again at once with a new tick, a new claim', t3 > 0 && re3 === t3 + K.LAG_MAX + 31 && own(2) && own(2)[0] === 3 && own(2)[1] === re3, [t3, re3, own(2)]);
    P.vclock(false);
    // the close, the reveal, 유령, the survivor; the cap - stopSit: the stop in 5 f, everyone away from the stools until
    // the frame before it, then the seats in map on their stools (sitting at S)
    const stopSit = (map) => { const S = G.frame + 5; P.stopAt(S); for (const s of G.players.map((p) => p.slot)) put(s, 4 + 2 * s); step(4); const xs = P.stoolsAt(S); for (const [s, j] of map) put(s, xs[j]); step(1); return S; };
    P.vclock(true, 1000);
    party(CH4, { plan: ['chair'] }, 51); toPlaying();
    stopSit([[0, 0], [1, 1], [2, 2]]);
    ok('close: every stool final -> the reveal at once (+1 each sitter; the one standing a 유령: 탈락!)', chNow().ph === 2 && same(chNow().pts, { 0: 1, 1: 1, 2: 1 }) && same(chNow().gh, { 3: 1 }) && chNow().standF[3] === C.capF, chNow());
    ok('reveal: the owners ride in g.mg as [stool, slot, stamp - S, final], the 유령 bits (8), the points', same(P.mg()[6].map((q) => q[3]), [1, 1, 1]) && P.mg()[7] === 8 && same(P.mg()[8], [1, 1, 1, 0]), P.mg());
    toStop(2); step(1);
    ok('stop 2: everyone stands up, the music again (chair), 3 stools still (the 유령 counts)', chNow().k === 3 && P.music() === 'chair' && !P.parked(0) && same(chNow().gh, { 3: 1 }), [chNow(), P.music()]);
    stopSit([[3, 0], [1, 1], [2, 2]]);
    ok('유령: still in every stop - it takes a stool (+1); the living one left standing goes out', chNow().pts[3] === 1 && same(chNow().gh, { 3: 1, 0: 1 }), chNow());
    toStop(3); stopSit([[3, 0], [0, 1], [1, 2]]);
    const pts3 = Object.assign({}, chNow().pts);
    until(() => chNow().ph === 3, 100);
    ok('set: one living player left (seat 1) - its +2 after the reveal, the banner', chNow().surv === 1 && chNow().pts[1] === pts3[1] + 2 && G.banner && G.banner.sub === P.tx().surv2, [chNow(), pts3, G.banner]);
    toStop(4);
    ok('set: ... then everyone living again at the next stop', same(chNow().gh, {}), chNow().gh);
    // the cap: nobody sits - the living standing would all go out: nobody does
    const S6 = G.frame + 5; P.stopAt(S6); for (const s of [0, 1, 2, 3]) put(s, 4 + 2 * s);
    until(() => chNow().ph === 2, 400);
    ok('cap: nobody sits - the stop closes at S + 240; all living standing would leave nobody: nobody goes out', G.frame === S6 + C.capF && same(chNow().gh, {}), [G.frame - S6, chNow().gh]);
    // the key: points, then fewer frames to a seat
    Object.assign(G.mini, { pts: { 0: 3, 1: 3, 2: 3, 3: 1 }, standF: { 0: 300, 1: 200, 2: 300, 3: 0 } });
    const pm = new Map(P.places());
    ok('key: equal points - the fewer frames to a seat places higher; equal both - a shared place', pm.get(1) === 1 && pm.get(0) === 2 && pm.get(2) === 2 && pm.get(3) === 4, P.places());
    // coins: my stool kept (final) is one action
    party(CH4, { plan: ['chair'] }, 53); toPlaying(); const bs0 = PS().coins.bshots;
    stopSit([[0, 0], [1, 1]]); step(1);
    ok('coins: MY seat\'s stool kept (final) is one action (seat 1\'s is not mine)', PS().coins.bshots === bs0 + 1, [bs0, PS().coins.bshots]);
    // a leaver holding a claim: its stool free again; one player present per stool then - the close once everyone holds one
    party(CH4, { plan: ['chair'] }, 55); toPlaying();
    P.fakeBody(3, { rt: G.frame }); const S7 = stopSit([]);
    P.sit(3, 0, S7 + 1); step(1);
    const lv0 = own(0); P.drop(3); step(1);
    ok('leaver: one leaves holding a claim - its stool is free again', lv0 && lv0[0] === 3 && !own(0), [lv0, own(0)]);
    const xs7 = P.stoolsAt(S7); put(0, xs7[0]); put(1, xs7[1]); put(2, xs7[2]); step(1);
    ok('leaver: 3 stools for 3 players now - the stop closes once every present player holds a final one', chNow().ph === 2 && same(chNow().pts, { 0: 1, 1: 1, 2: 1 }) && same(chNow().gh, {}), chNow());
    toStop(2);
    ok('leaver: the next stop has one stool fewer (2 for 3)', chNow().k === 2, chNow().k);
    // a leaver that leaves one living player: the set ends without the +2 - everyone living again
    party(['duck', 'cat', 'frog'], { plan: ['chair'] }, 56); toPlaying();
    stopSit([[0, 0], [1, 1]]); toStop(2);
    const pl0 = Object.assign({}, chNow().pts), gl0 = Object.assign({}, chNow().gh); P.drop(1); step(1);
    ok('leaver: one leaves and one living player is left (with a 유령) - nobody beat anyone: everyone living again, no +2', same(gl0, { 2: 1 }) && same(chNow().gh, {}) && same(chNow().pts, { 0: pl0[0], 1: pl0[1] }) && chNow().surv === -1, [gl0, chNow()]);
    // two players: one stool - every stop a set: the sitter +1 +2, the other out and back
    party(['duck', 'cat'], { plan: ['chair'] }, 57); toPlaying();
    const S8 = stopSit([[1, 0]]);
    ok('2 players: 1 stool; the sitter +1, the other a 유령', chNow().k === 1 && chNow().pts[1] === 1 && same(chNow().gh, { 0: 1 }), chNow());
    until(() => chNow().ph === 3, 100); const p2 = chNow().pts[1], mu3 = P.music();
    toStop(2); step(1);
    ok('2 players: ... the set ends at once - the sitter +2, everyone back', p2 === 3 && same(chNow().gh, {}), [p2, chNow()]);
    // the music on the next stop: chair again from its Ms (Snd.cur null in the reveal and the survivor's beat)
    ok('music: none in the reveal / the survivor\'s beat; chair again at the next stop\'s start, G.music chair all along', mu3 === null && P.music() === 'chair' && G.music === 'chair' && chNow().Ms > S8, [mu3, P.music(), G.music]);
    P.vclock(false);
    // the view: S from the next snapshot when this one has none, owners bounded, bump bits, junk dropped
    const v = P.chairView(['h', 2, 0, 9, 400, -1, [], 0, [1, 0, 0, 0], 8, 3, 0, -1], ['h', 2, 0, 9, 400, 600, [[0, 1, 4, 0]], 0, [], 8, 3, 0, -1]);
    const v2 = P.chairView(['h', 2, 0, 9, 400, 600, [[0, 1, 4, 1], ['x'], [7, 2, 1, 0], [1, 9, 0, 0]], 4, [], 8, 3, 2, 3]);
    ok('view: chairView takes S from the next snapshot of the same stop; owners [slot, S + rel, ..., final] within bounds (junk dropped), the 유령 / bump bits', v.S === 600 && same(v.own, {}) && same(v2.own['0'], [1, 604, 0, -1, true]) && Object.keys(v2.own).length <= 2 && same(v2.gh, { 2: 1 }) && same(v2.bump, { 1: 2 }) && v2.surv === 3, [v, v2]);
    // (review: a guest's reveal - its ? over the ones standing - reads the sitters from the owners, as the host's M.sat)
    const v3 = P.chairView(['h', 2, 2, 9, 400, 600, [[0, 1, 4, 1], [2, 3, 9, 1]], 0, [], 8, 3, 0, -1]);
    ok('view: in the reveal a guest\'s sitters (M.sat) are the stop\'s owners - the ? goes over everyone else; none before the reveal', same(v3.sat, { 1: 604, 3: 609 }) && same(v2.sat, {}), [v3.sat, v2.sat]);
    // the fast party: 3 stops under 35 s; the worst honest 판 (nobody ever sits: every stop to its cap) under 95 s
    for (const fast of [true, false]) {
      P.fast(fast); party(['duck', 'cat', 'frog'], { plan: ['chair'] }); toPlaying();
      for (const s of [0, 1, 2]) put(s, 4 + s * 2);
      const t0 = G.frame, n = chNow().n; until(() => G.mode !== 'playing', 95 * 60 + 60); const len = G.frame - t0;
      ok((fast ? 'fast party: 3 stops, done in ' : 'worst honest 판 (nobody sits: 8 stops to their caps): ') + (len / 60).toFixed(1) + ' s - under ' + (fast ? 'fastSecs 35' : 'the 95 s cap'), n === (fast ? C.fast : C.stops) && G.mode === 'result' && len < (fast ? 35 : 95) * 60 && PS().left > 0, [n, len, G.mode]);
    }
    P.fast(false);
    // the card
    party(longNicks(), { plan: ['chair'] }); step(80);
    const c = P.card();
    ok('card: 목욕 의자 뺏기 - its how, rule and keys lines as specified', c.name === '목욕 의자 뺏기' && c.how === '음악이 멈추면 앉아요! 못 앉으면 빠져요' && c.rule === '의자는 늘 하나 모자라요 · 빠져도 유령으로 계속 앉아요 · 앉으면 1점, 끝까지 남으면 +2점' && c.keys === '←→ 달리기 · 의자에 닿으면 앉아요' && P.mini().chair.keysT === '조이스틱으로 달려서 의자에 닿아요' && c.demo, c);
    const d = P.demo('chair');
    ok('demo [chair]: 240 frames into a 96x32 context without errors, pixels left', d && !d.err && d.lit > 200, d);
    // no regressions: a battle after a chair party - kits, bubbles, the music
    D.local.battle(['capy', 'cat']); step(160);
    const nb = G.bubbles.length; D.press('shoot', true, 0); step(2); D.press('shoot', false, 0); step(2);
    ok('after a chair party: a battle blows bubbles, the capy\'s kit is back (no base flag left over), battle music', !PS().on && G.bubbles.length > nb && G.music === 'battle', [G.bubbles.length, nb, G.music]);
  }

  // ---------------------------------------------------------------- 5. 맥반석 계란 돌리기 (6)
  const EG = () => K.EGG;
  const egg = () => P.egg();
  // a body standing on the arena's floor (feet y 216; x 16..104 is floor in every battle arena), still
  const stand = (slot, x) => { const p = pl(slot); p.x = x; p.y = 200; p.vx = 0; p.vy = 0; p.onGround = true; };
  const toLive = () => until(() => G.mode !== 'playing' || egg().ph === 1, 200);
  const toEggRound = (r) => until(() => G.mode !== 'playing' || (egg().r === r && egg().ph <= 1), 3000);
  // the bodies apart (no touch): seat s at 20 + 26 s
  const apart = () => { for (const p of G.players) stand(p.slot, 20 + 26 * p.slot); };
  function eggTests() {
    const E = EG();
    ok('EGG: 6 rounds, drop 36, fuse 210..420, juggle 45, slack 3, heat 90 / 180 / 240, reveal 72, run 1.2', E.rounds === 6 && E.dropF === 36 && same(E.fuse, [210, 420]) && E.coolF === 45 && E.slack === 3 && E.steamF === 90 && E.shakeF === 180 && E.glowF === 240 && E.revealF === 72 && E.run === 1.2, E);
    ok('heat: by the frames since the landing only - 0 / steam at 90 / shake at 180 / the red rim at 240', same([0, 89, 90, 179, 180, 239, 240, 999].map((a) => P.eggHeat(a)), [0, 0, 1, 1, 2, 2, 3, 3]));
    // (3.4: MINI base - 의자 and 술래 put everyone on KIT_BASE; 계란 keeps each animal's 특기, as 왕관)
    const kits = (id) => { party(CH4, { plan: [id] }, 60); toPlaying(); return G.players.map((p) => P.kitBase(p.slot)); };
    const kc = kits('chair'), ks = kits('sneak'), ke = kits('egg');
    ok('kits: 의자 and 술래 put everyone on the base kit (MINI base); 계란 keeps each animal\'s 특기 (as 왕관)', kc.every((v) => v === true) && ks.every((v) => v === true) && ke.every((v) => v === false), [kc, ks, ke]);
    P.vclock(true, 1000);
    party(CH4, { plan: ['egg'] }, 61); toPlaying();
    const e1 = egg(), MI = P.mini().egg;
    ok('egg: a dry battle arena (not 냉온탕), kits on (no base), nobody blows (noFire), the battle track; round 1 drops onto a present player, landing within 36 f of 시작!', e1.r === 1 && e1.ph === 0 && e1.holder >= 0 && e1.since === e1.L && e1.L > G.frame && e1.L <= G.frame + E.dropF && MI.noFire && !MI.base && G.arenaKind === 'b' && G.arena !== 1 && G.music === 'battle', [e1, G.frame, G.arenaKind, G.arena, G.music]);
    const bn = G.banner && G.banner.loc ? G.banner.under : G.banner;
    ok('drop: the banner {0}한테 떨어졌어요! (under my own 내 계란! when it is me)', !!bn && bn.main === (pl(e1.holder).nick || 'P' + (e1.holder + 1)) + '한테 떨어졌어요!', [G.banner, bn]);
    let leak = 0; const B1 = egg().B;
    for (let f = 0; f < 500 && egg().ph < 2; f++) { if (G.frame < B1 && P.mg()[6] !== -1) leak++; step(1); }
    ok('B: the fuse 210..420 f after the landing, never in g.mg before the host reached it, then there', B1 - e1.L >= E.fuse[0] && B1 - e1.L <= E.fuse[1] && !leak && P.mg()[6] === B1 && egg().ph >= 2, [B1, e1.L, leak, P.mg()]);
    // the drop: never the last round's loser when another is there (6 rounds x 3 parties: the burst right after each landing)
    const bad = [];
    for (const seed of [62, 63, 64]) {
      party(['duck', 'cat', 'frog'], { plan: ['egg'] }, seed); toPlaying();
      let last = -1;
      for (let r = 1; r <= 6 && G.mode === 'playing'; r++) {
        toEggRound(r); if (egg().r !== r) break;
        if (last >= 0 && egg().holder === last) bad.push([seed, r, last]);
        toLive(); apart(); P.burstAt(G.frame + 1); until(() => egg().ph >= 3, 80); last = egg().loser;
      }
    }
    ok('drop: never onto the last round\'s loser (3 parties x 6 rounds)', !bad.length, bad);
    // ... and never onto a stale seat (a hidden tab could never pass it on): seats 1 and 2 remote, silent after one state
    party(['duck', 'cat', 'frog'], { plan: ['egg'] }, 62); toPlaying();
    P.fakeBody(1, { rt: G.frame }); P.fakeBody(2, { rt: G.frame }); step(K.MILK.staleF + 2);
    const onto = [];
    for (let r = 1; r <= 4 && G.mode === 'playing'; r++) { toEggRound(r); toLive(); if (r >= 2) onto.push(egg().holder); P.burstAt(G.frame + 1); until(() => egg().ph >= 3, 80); }
    ok('drop: never onto a stale seat - with seats 1 and 2 silent every drop is seat 0\'s (' + onto.join(' ') + ')', onto.length >= 3 && onto.every((s) => s === 0), onto);
    // receipts on this screen: the slack (3 px counts, 3.1 does not); the juggle; a pass back after it
    party(CH4, { plan: ['egg'] }, 65); toPlaying(); toLive();
    apart(); P.eggHold(1); stand(1, 40); stand(0, 40 + 12 + 3.1); step(1);
    ok('receipt: my box 3.1 px from the holder (slack 3) - no pass', egg().holder === 1, egg());
    stand(1, 40); stand(0, 40 + 12 + 3); step(1);
    const r1 = egg();
    ok('receipt: 3 px from the holder past its juggle - the egg is mine (since = my stamp, from the giver), 앗 뜨거!', r1.holder === 0 && r1.from === 1 && r1.since === G.frame && same(P.mi(0).slice(2, 4), [1, 1]) && P.mi(0)[4] === G.frame - r1.L, [r1, P.mi(0)]);
    let back = -1;
    for (let f = 0; f < 60 && back < 0; f++) { stand(1, 40); stand(0, 55); step(1); if (egg().holder === 1) back = G.frame; }
    ok('juggle: the giver touching me gets nothing back for 45 f - then it receives (a pass back after the juggle is fair)', back === r1.since + E.coolF, [back, r1.since]);
    // run: 1.0 during the juggle, 1.2 after it - the holder on this page (offline: the host's own)
    const runs = [P.eggRun(1)]; apart(); step(E.coolF); runs.push(P.eggRun(1), P.eggRun(0));
    ok('hot feet: the holder runs 1.2x only after its juggle; nobody else does', same(runs, [false, true, false]), runs);
    const vx = (slot) => { for (const p of G.players) stand(p.slot, 96 + p.slot * 2); stand(slot, 16); D.press('right', true, slot); step(24); const v = pl(slot).vx; D.press('right', false, slot); step(12); return v; };
    const vHot = vx(1); P.eggHold(3); const vCool = vx(1);
    ok('hot feet: the holder\'s walk is EGG.run x its own (' + vHot.toFixed(3) + ' / ' + vCool.toFixed(3) + ')', Math.abs(vHot / vCool - E.run) < 0.01, [vHot, vCool]);
    // remote receipts (fakeBody): from a non-holder refused; since = the receipt's stamp (30 f before it arrived)
    apart(); P.eggHold(1, G.frame - 200); step(2);
    P.recv(2, 3, G.frame - 5); step(1);
    ok('host: a receipt from a seat that does not hold the egg is refused', egg().holder === 1, egg());
    P.eggHold(1, G.frame - 10); P.recv(2, 1, G.frame - 1); step(1);
    ok('host: a receipt stamped inside the giver\'s juggle is refused', egg().holder === 1, egg());
    P.eggHold(1, G.frame - 200); const ts = G.frame - 30; P.recv(3, 1, ts); step(1);
    ok('host: a remote receipt stamped 30 f before it arrived - the receiver holds it from its stamp (its juggle ends 30 f earlier than with G.frame)', egg().holder === 3 && egg().since === ts && egg().from === 1, [egg(), ts]);
    // the host's own screen judges a remote holder by its shownAt sample (PEER_DELAY behind), not its latest state
    party(CH4, { plan: ['egg'] }, 66); toPlaying(); toLive(); apart();
    // (a fresh remote id: a new buffer - 24 older states then the latest; the shown sample is PEER_DELAY+ behind the latest)
    const near = 40, far = 90, pushRun = (xOld, xNew) => { pl(3).id = 'egg3.' + G.frame; for (let k = 24; k >= 1; k--) P.fakeBody(3, { k: G.frame - k, x: xOld, y: 200 }); P.fakeBody(3, { k: G.frame, x: xNew, y: 200 }); pl(3).x = xNew; pl(3).y = 200; };
    P.eggHold(3); pushRun(far, near); stand(0, near + 14); step(1);
    ok('host: a remote holder whose LATEST state touches me but whose shown sample does not - no pass', egg().holder === 3, [egg(), P.mi(0)]);
    for (let k = 0; k < 4; k++) step(1);
    party(CH4, { plan: ['egg'] }, 66); toPlaying(); toLive(); apart();
    P.eggHold(3); pushRun(near, far); stand(0, near + 14); step(1);
    ok('host: ... and one whose shown sample touches me (its latest far away) - the pass, as this screen draws it', egg().holder === 0, egg());
    // a page's own prediction: kept until the mirror shows it, undone by another holder / the round moving on / no answer
    party(CH4, { plan: ['egg'] }, 67); toPlaying(); toLive(); apart();
    P.eggHold(1, G.frame); const tk = G.frame; P.eggPred(0, 1, tk); step(1);
    ok('prediction: my receipt shows the egg on me at once (the host has not taken it: inside the juggle)', P.eggShown() === 0 && egg().holder === 1, [P.eggShown(), egg()]);
    let undo = -1, hotP = false;
    for (let f = 0; f < 120 && undo < 0; f++) { apart(); step(1); if (P.eggRun(0)) hotP = true; if (P.eggShown() !== 0) undo = G.frame; }
    ok('prediction: no answer - undone when my view passes tick + LAG_MAX + 30; meanwhile I ran hot after my own juggle', undo === tk + K.LAG_MAX + 31 && hotP && egg().holder === 1, [undo, tk, hotP]);
    P.eggHold(1, G.frame); P.eggPred(0, 1, G.frame); step(1); P.eggHold(2, G.frame); step(1);
    ok('prediction: undone at once when the mirror shows a third holder', P.eggShown() === 2, P.eggShown());
    P.eggHold(1, G.frame); P.eggPred(0, 1, G.frame); step(1); P.burstAt(G.frame); until(() => egg().ph >= 3, 80); step(1);
    ok('prediction: undone when the round moves on (the burst): the giver loses it', egg().loser === 1 && P.mloc(0).pred === null, [egg(), P.mloc(0)]);
    // the burst's wait (seats 1-3 remote, their views behind): a receipt stamped B - 5 arriving at B + 20 moves the loss
    const keep = (rt, ...skip) => { for (const s of [1, 2, 3]) if (!skip.includes(s)) P.fakeBody(s, { rt, x: 20 + 26 * s, y: 200 }); };
    party(CH4, { plan: ['egg'] }, 68); toPlaying(); toLive(); apart(); keep(G.frame);
    P.eggHold(1); const Bw = G.frame + 6; P.burstAt(Bw);
    while (G.frame < Bw + 20) { keep(Bw - 30); step(1); }
    const w1 = egg();
    ok('burst: the host waits at B for the seats whose views are behind it (ph 2, the holder noted)', w1.ph === 2 && w1.bh === 1 && w1.loser === -1, w1);
    P.recv(2, 1, Bw - 5, { x: 46, y: 200 }); keep(Bw - 30, 2); step(1);
    ok('burst: a receipt stamped B - 5 arriving at B + 20 is a last-second pass (the receiver holds it)', egg().holder === 2 && egg().since === Bw - 5, egg());
    keep(Bw + 1, 2); step(1);
    ok('burst: the wait ends once every seat but the holder is past B - the receiver of the late pass loses the round', egg().ph === 3 && egg().loser === 2, egg());
    toEggRound(2); toLive(); apart(); keep(G.frame);
    const h2 = egg().holder; const B2 = G.frame + 4; P.burstAt(B2);
    const rx = [1, 2, 3].find((s) => s !== h2);
    while (G.frame < B2 + 10) { keep(B2 - 30); step(1); }
    if (h2 >= 1) P.recv(rx, h2, B2, { x: 20 + 26 * rx, y: 200 });
    let end2 = -1; for (let f = 0; f < 90 && end2 < 0; f++) { keep(B2 - 30, rx); step(1); if (egg().ph >= 3) end2 = G.frame; }
    ok('burst: a receipt stamped AT B is ignored; with every view behind B the wait ends at B + LAG_MAX', egg().loser === h2 && end2 === B2 + K.LAG_MAX, [egg(), end2, B2, h2, rx]);
    // points, 유령 (a 유령 holding at the burst: nobody out), the survivor's +2 (3 players)
    party(['duck', 'cat', 'frog'], { plan: ['egg'] }, 69); toPlaying(); toLive(); apart();
    P.eggHold(0); P.burstAt(G.frame + 1); until(() => egg().ph === 3, 80);
    ok('burst: the holder loses the round - a living one is a 유령 (탈락!); everyone else +1', same(egg().pts, { 1: 1, 2: 1 }) && same(egg().gh, { 0: 1 }), egg());
    toEggRound(2); toLive(); apart(); P.eggHold(0); P.burstAt(G.frame + 1); until(() => egg().ph === 3, 80);
    ok('유령: still in every round - holding at the burst costs it the point, nobody goes out (꽝!)', same(egg().pts, { 1: 2, 2: 2 }) && same(egg().gh, { 0: 1 }), egg());
    toEggRound(3); toLive(); apart(); P.eggHold(1); P.burstAt(G.frame + 1); until(() => egg().ph === 4, 200);
    ok('set: one living player left (seat 2) - its +2 after the reveal (살아남았다!), then everyone back', egg().surv === 2 && egg().pts[2] === 3 + 2 && egg().pts[0] === 1 && G.banner && G.banner.sub === P.tx().surv2, [egg(), G.banner]);
    toEggRound(4);
    ok('set: ... everyone living again at the next round', same(egg().gh, {}), egg());
    // a leaver holding the egg: it falls again onto a present player, B pushed past the new juggle; a stale holder loses
    toLive(); apart(); P.eggHold(2); const Bl = G.frame + 10; P.burstAt(Bl); P.drop(2); step(1);
    const lv = egg();
    ok('leaver: the holder leaves - the egg falls again (36 f) onto a present player; the fuse never bursts before the new juggle ends', lv.ph === 0 && lv.holder >= 0 && lv.holder !== 2 && lv.L === G.frame - 1 + E.dropF && lv.B >= lv.L + E.coolF + 30, lv);
    party(['duck', 'cat', 'frog'], { plan: ['egg'] }, 70); toPlaying(); toLive(); apart();
    P.fakeBody(2, { rt: G.frame, x: 72, y: 200 }); P.eggHold(2); P.burstAt(G.frame + 40); until(() => egg().ph >= 3, 140);
    ok('hidden tab: a stale holder (no states) keeps the egg and loses the round - nobody waits for it', egg().loser === 2 && egg().ph === 3, egg());
    // the key: points, then fewer frames holding
    Object.assign(G.mini, { pts: { 0: 3, 1: 3, 2: 3 }, heldF: { 0: 500, 1: 300, 2: 500 } });
    const pm = new Map(P.places());
    ok('key: equal points - fewer frames holding the egg places higher; equal both - a shared place', pm.get(1) === 1 && pm.get(0) === 2 && pm.get(2) === 2, P.places());
    // coins: a pass I made (my mirror's holder moves from me to a friend); a round I came through having walked 64 px
    party(['duck', 'cat', 'frog'], { plan: ['egg'] }, 71); toPlaying(); toLive(); apart();
    const bs0 = PS().coins.bshots; P.eggHold(0); stand(0, 40); stand(1, 55); step(2);
    ok('coins: MY pass (seat 0 -> seat 1) is one action', egg().holder === 1 && PS().coins.bshots === bs0 + 1, [egg(), bs0, PS().coins.bshots]);
    apart(); D.press('right', true, 0); step(50); D.press('right', false, 0); P.eggHold(2); P.burstAt(G.frame + 1); until(() => egg().ph === 3, 80); step(1);
    ok('coins: a round I came through having walked 64 px is one action (and not for the loser)', PS().coins.bshots === bs0 + 2, [bs0, PS().coins.bshots, P.mloc(0)]);
    // two players: every round a set - the loser a 유령, the other +1 +2, then both back
    party(['duck', 'cat'], { plan: ['egg'] }, 72); toPlaying(); toLive(); apart();
    P.eggHold(1); P.burstAt(G.frame + 1); until(() => egg().ph === 3, 80);
    const t2 = egg(); until(() => egg().ph === 4, 120); const t3 = egg(); toEggRound(2);
    ok('2 players: the holder at the burst a 유령, the other +1, then +2 at once (a set), both back next round', same(t2.gh, { 1: 1 }) && t2.pts[0] === 1 && t3.surv === 0 && t3.pts[0] === 3 && same(egg().gh, {}), [t2, t3, egg()]);
    // the view: B from the next snapshot of the same round; bounds
    const v = P.eggView(['e', 2, 1, 1, 400, 300, -1, -1, 4, [1, 0, 2, 0], 6, 0], ['e', 2, 2, 1, 400, 300, 700, -1, 4, [], 6, 0]);
    const v2 = P.eggView(['e', 2, 1, 9, 'x', 300, -1, 7, 99, [1], 6, -5], ['e', 3, 0, 1, 1, 1, 900, -1, 0, [], 6, 0]);
    ok('view: eggView takes B from the next snapshot of the same round (not another round\'s); fields within bounds', v.B === 700 && v.holder === 1 && same(v.gh, { 2: 1 }) && same(v.pts, { 0: 1, 2: 2 }) && v2.B === -1 && v2.holder === 3 && v2.loser === 3 && v2.since === -1 && v2.from === -1, [v, v2]);
    P.vclock(false);
    // 6 rounds then the end; the fast party: 3 rounds under fastSecs 35; the worst honest 판 under 70 s - 2 players (a
    // survivor's beat every round), every fuse its longest, seat 1 remote with its view far behind (the burst waits LAG_MAX
    // whenever seat 0 holds), nobody passes
    const worst = (E.dropF + E.fuse[1] + K.LAG_MAX + E.revealF + E.survF) * E.rounds + E.endF;
    ok('worst honest 판 by the numbers: 6 x (drop + the longest fuse + the burst wait + reveal + survivor) + endF = ' + (worst / 60).toFixed(1) + ' s - under the 70 s cap', worst < 70 * 60, worst);
    for (const fast of [true, false]) {
      P.fast(fast); party(['duck', 'cat'], { plan: ['egg'] }); toPlaying();
      const t0 = G.frame, n = egg().n; let lastR = 0;
      for (let f = 0; f < 70 * 60 + 60 && G.mode === 'playing'; f++) {
        stand(0, 20); P.fakeBody(1, { rt: Math.max(0, G.frame - 100), x: 90, y: 200 });
        const e = egg(); if (e && e.r !== lastR && e.ph === 0) { lastR = e.r; P.burstAt(e.L + E.fuse[1]); }
        step(1);
      }
      const len = G.frame - t0;
      ok((fast ? 'fast party: 3 rounds, done in ' : 'a long 판 (6 rounds, every fuse its longest, the wait, a survivor every round): ') + (len / 60).toFixed(1) + ' s - under ' + (fast ? 'fastSecs 35' : 'the 70 s cap'), n === (fast ? E.fast : E.rounds) && G.mode === 'result' && len < (fast ? 35 : 70) * 60 && PS().left > 0, [n, len, G.mode]);
    }
    P.fast(false);
    // the card
    party(longNicks(), { plan: ['egg'] }); step(80);
    const c = P.card();
    ok('card: 맥반석 계란 돌리기 - its how, rule and keys lines as specified', c.name === '맥반석 계란 돌리기' && c.how === '계란을 부딪혀 넘겨요! 들고 터지면 빠져요' && c.rule === '왕관과 반대예요 · 빠져도 유령으로 계속 해요 · 안 걸리면 1점, 끝까지 남으면 +2점' && c.keys === '←→ 달리기 · Z 점프 · 부딪히면 넘어가요' && P.mini().egg.keysT === '조이스틱 · 점프 · 친구에게 부딪혀요' && c.demo, c);
    const d = P.demo('egg');
    ok('demo [egg]: 240 frames into a 96x32 context without errors, pixels left', d && !d.err && d.lit > 200, d);
    // no regressions: a battle after an egg party - the walk is the kit's own (no hot feet), bubbles, the music
    D.local.battle(['capy', 'cat']); step(160);
    ok('after an egg party: nobody runs hot in a battle', !P.eggRun(0) && !P.eggRun(1) && G.music === 'battle', [P.eggRun(0), G.music]);
  }

  // ---------------------------------------------------------------- 6. 미끌미끌 비누 씨름 (7)
  const SU = () => K.SUMO;
  const su = () => P.sumo();
  // a body standing on the 평상 with its feet centre at x (not blinking)
  const on = (slot, x) => { const p = pl(slot); p.x = x - 8; p.y = 168; p.vx = 0; p.vy = 0; p.onGround = true; p.invuln = 0; };
  const calm = () => { for (const p of G.players) p.invuln = 0; };
  const sumoAt = (chars, seed) => { party(chars || ['duck', 'cat', 'frog'], { plan: ['sumo'] }, seed === undefined ? 81 : seed); toPlaying(); calm(); return su(); };
  function sumoTests() {
    const S = SU();
    ok('SUMO: acc 0.07 / acc2 0.045, the shot 2.0 px/f for 60 f, push 2.4 / push2 3.0, hop -1.3, credit 120, early 60, survivor 60, reset 72, 역전 blink 90, stale 120, the last 10 s',
      S.acc === 0.07 && S.acc2 === 0.045 && S.shotV === 2 && S.shotF === 60 && S.push === 2.4 && S.push2 === 3 && S.hop === -1.3 && S.creditF === 120 && S.early === 60 && S.survF === 60 && S.resetF === 72 && S.revInv === 90 && S.staleF === 120 && S.lastS === 10, S);
    // the arena (and its fallback)
    const A = P.arenas()[4], MI = P.mini().sumo;
    ok('arena: 비누 평상 (PARTY_ARENAS[4], key sumo) - the 평상 rows 21-24 at cols 7-24, the 탕 open beside it; wl 196, the spots, revive 128',
      A && A.key === 'sumo' && A.name === '비누 평상' && A.closed && A.map[21] === '##.....##################.....##' && A.map[24] === A.map[21] && A.sumo.wl === 196 && same(A.sumo.spots[4], [76, 108, 148, 180]) && same(A.sumo.spots[2], [96, 160]) && A.sumo.revive === 128, A && A.sumo);
    const rl = P.reload([null, null, null, null, { key: 'sumo', name: '비누 평상', map: ['#'], sumo: { wl: 'x' } }]);
    ok('arena: a broken 비누 평상 entry gets the built-in one (the same 평상, its field)', rl[4].key === 'sumo' && rl[4].deck === A.map[21] && rl[4].sumo && rl[4].sumo.wl === 196, rl[4]);
    ok('MINI.sumo: code u, 45 s (fastSecs 20), 비누 평상, the base kit, bubbles on (no noFire), the clock cues on, short 씨름', MI.c === 'u' && MI.secs === 45 && MI.fastSecs === 20 && same(MI.ar, ['p', 4]) && MI.base === true && !MI.noFire && MI.cues !== false && MI.short === '씨름' && MI.music === undefined, MI);
    let s = sumoAt(CH4);
    const xs = G.players.map((p) => p.x + 8);
    ok('start: set 1 live, everyone on the 평상\'s 4-player spots (76 / 108 / 148 / 180) on its top, the base kit, the battle track', s.set === 1 && s.ph === 0 && s.F0 >= 0 && same(xs, [76, 108, 148, 180]) && G.players.every((p) => p.y === 168 && !p.raft) && G.players.every((p) => P.kitBase(p.slot)) && G.music === 'battle' && PS().arena === 4, [s, xs, G.music]);
    const d = P.deck();
    ok('the 평상 from the map: x 56-200, top y 184', d.x0 === 56 && d.x1 === 200 && d.top === 184, d);
    // soap: from rest to the top speed and back ~18 f over the 평상; the normal 0.5 off it (feet past its edge)
    const ramp = (slot) => { let up = -1, dn = -1; D.press('right', true, slot); for (let f = 1; f <= 40 && up < 0; f++) { step(1); if (pl(slot).vx >= 1.25 - 1e-6) up = f; } D.press('right', false, slot); for (let f = 1; f <= 40 && dn < 0; f++) { step(1); if (Math.abs(pl(slot).vx) < 1e-6) dn = f; } return [up, dn]; };
    on(0, 70); for (const q of [1, 2, 3]) on(q, 150 + q * 10);
    const r1 = ramp(0);
    ok('soap: from rest to the top speed in ' + r1[0] + ' f and back to rest in ' + r1[1] + ' f on the 평상 (acc 0.07: 18)', r1[0] === 18 && r1[1] === 18, r1);
    const p0 = pl(0); p0.x = 30 - 8; p0.y = 120; p0.vx = 0; p0.vy = 0; p0.onGround = false;
    ok('soap: only over the 평상 - a body whose feet are past its edge (over a 탕) is not on it; a raft never', P.soapy(0) === false && P.soapy(1) === true, [P.soapy(0), P.soapy(1)]);
    // the shot: 2.0 px/f for 60 f, then it pops; never floats
    s = sumoAt(CH4, 82); for (const q of [0, 1, 2, 3]) on(q, 70 + q * 30);
    const id = P.sumoBub(0, 60, 60, 1), bub = () => G.bubbles.find((b) => b.id === id);
    const x0 = bub().x; step(10); const v = (bub().x - x0) / 10; let float = 0, life = 10;
    while (bub() && bub().state === 'shot' && life < 90) { step(1); life++; if (bub() && bub().state === 'float') float++; }
    ok('shot: flies ' + v.toFixed(2) + ' px/f and pops after ' + life + ' f (60) - never floats', Math.abs(v - 2) < 1e-6 && life === 60 && !float && (!bub() || bub().state === 'pop'), [v, life, float]);
    const w = P.sumoBub(0, 30, 60, -1); let wl = 0; while (G.bubbles.some((b) => b.id === w && b.state === 'shot') && wl < 60) { step(1); wl++; }
    ok('shot: into the wall - it pops there (' + wl + ' f), never floats at it', wl > 0 && wl < 12 && !G.bubbles.some((b) => b.id === w && b.state === 'float'), wl);
    const sd = P.sumoBub(0, 24, 183, 1); let sl = 0; while (G.bubbles.some((b) => b.id === sd && b.state === 'shot') && sl < 60) { step(1); sl++; }
    for (const q of [0, 1, 2, 3]) on(q, 186 + q * 2);   // (everyone at the far end: nobody in the bubble's way)
    const ov = P.sumoBub(0, 24, 163, 1); step(40); const ob = G.bubbles.find((b) => b.id === ov);
    ok('shot: from a raft at rest (y 183) the 평상\'s side pops it (' + sl + ' f); from the hop\'s top (y 163) it flies on over the 평상', sl > 0 && sl < 12 && ob && ob.state === 'shot' && ob.x > 100, [sl, ob && [ob.state, ob.x]]);
    // a push on a host-local body: vx the bubble's way, the hop, once per bubble (popped), my report; never a capture
    s = sumoAt(['duck', 'cat', 'frog'], 83); on(0, 70); on(1, 120); on(2, 190);
    const pb = P.sumoBub(0, 82, 167, 1); let pushed = -1;
    for (let f = 0; f < 20 && pushed < 0; f++) { step(1); if (pl(1).vx > 2) pushed = f; }
    const p1 = pl(1), m1 = P.mi(1), pbb = G.bubbles.find((b) => b.id === pb);
    ok('push: the bubble touching seat 1 pushes it the bubble\'s way (vx 2.4, the hop) - never a capture; the bubble pops', pushed >= 0 && Math.abs(p1.vx - 2.4) < 1e-6 && p1.vy < 0 && !p1.trap && !p1.onGround && (!pbb || pbb.state === 'pop'), [pushed, p1.vx, p1.vy, !!p1.trap, pbb && pbb.state]);
    ok('push: seat 1\'s report [판 i, set, 1, by 0, tick - F0, bubble id], the host\'s last[1] = [0, its stamp]', m1 && m1[1] === 1 && m1[2] === 1 && m1[3] === 0 && m1[4] === G.frame - su().F0 && m1[5] === pb % 1e6 && same(su().last[1], [0, G.frame]), [m1, su()]);
    let sx = []; for (let f = 0; f < 50; f++) { step(1); sx.push(p1.x + 8); }
    const slid = sx[sx.length - 1] - 120;
    ok('push: on soap one push slides ~40 px (' + slid.toFixed(1) + ')', slid > 34 && slid < 48 && Math.abs(p1.vx) < 1e-6, [slid, p1.vx]);
    // near the edge: it slides on while any foot is on the 평상, so a push 20 px from the edge carries it off - it falls in
    on(2, 180); P.pushMe(2, 1); let offAt = -1;
    for (let f = 0; f < 60 && offAt < 0; f++) { step(1); if (pl(2).raft) offAt = f; }
    ok('push: 20 px from the edge one push carries it off (soap until no foot is on) - a raft in the right 탕 (' + offAt + ' f)', offAt > 0 && su().tub[2] === 1, [offAt, pl(2).x, su().tub]);
    // a remote report: pops the bubbles it names, its stamp from its view tick (F0 added back, clamped by LAG_MAX)
    const rb = P.sumoBub(0, 30, 60, 1); step(2);
    P.pushRep(2, 0, G.frame - 20, [rb]); step(1);
    ok('host: a remote push report pops the bubble it names and keeps last[seat] = [pusher, its view tick]', !G.bubbles.some((b) => b.id === rb && b.state === 'shot') && same(su().last[2], [0, G.frame - 21]) && su().hits[2] >= 1, [su().last, su().hits]);
    step(120); P.pushRep(2, 0, G.frame - 100); step(1);
    ok('host: a stamp older than its arrival - LAG_MAX is clamped to it', su().last[2][1] === G.frame - 1 - K.LAG_MAX, [su().last, G.frame, su().F0]);
    // falls: a host-local body at wl + 3; a remote one by its own state of this epoch (feet 199 not, 199.5 yes), stamped by its view
    s = sumoAt(['duck', 'cat', 'frog'], 84); on(0, 70); on(1, 120);
    P.fakeBody(2, { x: 30, y: 183, rt: G.frame - 5 }); step(1);
    const f0 = su();
    P.fakeBody(2, { x: 30, y: 183.5, rt: G.frame - 5 }); step(1);
    const f1 = su(), p2 = pl(2);
    ok('fall: a remote body with its feet at wl + 3 (199) stays; at 199.5 it is a 오리 튜브 in the left 탕, stamped by its own view (rt)', !f0.outs.length && f1.outs.length === 1 && f1.outs[0][0] === 2 && f1.outs[0][1] === G.frame - 6 && p2.raft && f1.tub[2] === 0 && p2.x >= 16 && p2.x <= 40, [f0.outs, f1.outs, p2.raft, p2.x, f1.tub]);
    // the raft: kept in its 탕 - walking into the 평상's side stops it; its hop (top ~164)
    p2.local = true;
    D.press('right', true, 2); step(60); const rx = p2.x; D.press('right', false, 2);
    D.press('left', true, 2); step(60); const lx = p2.x; D.press('left', false, 2);
    D.press('jump', true, 2); step(1); D.press('jump', false, 2); let top = 999; for (let f = 0; f < 40; f++) { step(1); top = Math.min(top, p2.y); }
    ok('raft: kept in its own 탕 (x ' + rx.toFixed(1) + ' at the 평상\'s side - 40; ' + lx.toFixed(1) + ' at the wall - 16), its hop tops out at y ' + top.toFixed(1), Math.abs(rx - 40) < 1e-6 && Math.abs(lx - 16) < 1e-6 && top > 160 && top < 168 && p2.raft, [rx, lx, top]);
    // credit within 120 f (121 none), no credit for a lone fall
    s = sumoAt(['duck', 'cat', 'frog', 'otter'], 85); on(0, 70); on(1, 100); on(2, 140); on(3, 180);
    const F = G.frame;
    P.pushMe(1, 1, { by: 0, t: F }); P.fall(1, F + 120);
    P.pushMe(2, 1, { by: 0, t: F }); P.fall(2, F + 121);
    P.fall(3);
    ok('credit: the last pusher within 120 f of the fall +1 (밀어냈다!); 121 f - nobody; a lone fall - nobody', su().pts[0] === 1 && !su().pts[1] && !su().pts[2] && !su().pts[3], su().pts);
    // 역전: a raft's push that brings its target in - +1 and back on the 평상's centre, blinking; once a set
    s = sumoAt(['duck', 'cat', 'frog', 'otter'], 86); on(0, 70); on(1, 100); on(2, 140); on(3, 180);
    P.fall(3); P.pushMe(1, -1, { by: 3 }); P.fall(1);
    const b3 = pl(3), e1 = su();
    ok('역전: raft 3 pushes seat 1 in - +1, back on the 평상\'s centre (revive 128), blinking 90 (not pushable), its tub gone, rv', e1.pts[3] === 1 && !b3.raft && b3.x + 8 === 128 && b3.y === 168 && b3.invuln === S.revInv && e1.rv[3] === 1 && e1.tub[3] === undefined && P.pushMe(3, 1) !== undefined, [e1, b3.x, b3.y, b3.invuln]);
    b3.invuln = 0; P.fall(3); P.pushMe(2, -1, { by: 3 }); P.fall(2);
    ok('역전: once a set - a second push-in from the raft scores +1 but it stays a raft', su().pts[3] === 2 && pl(3).raft, [su().pts, pl(3).raft]);
    // the set: at most one left on - early later the survivor +2, the beat, the reset (spots, no rafts, no bubbles), the next set
    s = sumoAt(['duck', 'cat', 'frog'], 87); on(0, 70); on(1, 120); on(2, 170);
    P.sumoBub(0, 30, 40, 1); P.fall(1); P.fall(2); step(1); const tF = G.frame;
    const e2 = su(); step(S.early - 1); const e3 = su(); step(1); const e4 = su();
    ok('set: one left on - its end ' + S.early + ' f later: the survivor +2 ({0} 살아남았다!), the beat', e2.endAt0 === tF + S.early && e3.ph === 0 && e4.ph === 1 && e4.surv === 0 && e4.pts[0] === 2 && G.banner && G.banner.main === (pl(0).nick || 'P1') + ' 살아남았다!', [e2.endAt0, tF, e3.ph, e4]);
    step(S.survF); const e5 = su();
    ok('set: the reset - everyone on the spots (80 / 128 / 176), no rafts, no bubbles, held still', e5.ph === 2 && same(G.players.map((p) => p.x + 8), [80, 128, 176]) && G.players.every((p) => !p.raft) && !G.bubbles.some((b) => b.state === 'shot'), [e5, G.players.map((p) => [p.x + 8, p.raft])]);
    const hx = pl(0).x; D.press('right', true, 0); step(S.resetF - 2); const held = pl(0).x === hx; step(3); D.press('right', false, 0); const e6 = su();
    ok('set: held for the reset\'s 72 f, then set 2 live (F0 now), the 탕 / outs / last cleared', held && e6.set === 2 && e6.ph === 0 && e6.F0 > tF && !e6.outs.length && same(e6.tub, {}) && same(e6.last, {}), [held, e6]);
    // equal stamps: nobody; the later stamp wins
    s = sumoAt(['duck', 'cat'], 88); const T0 = G.frame; P.fall(0, T0 - 3); P.fall(1, T0 - 3); step(S.early + 1);
    const q1 = su();
    s = sumoAt(['duck', 'cat'], 88); const T1 = G.frame; P.fall(0, T1 - 3); P.fall(1, T1 - 2); step(S.early + 1);
    const q2 = su();
    ok('set: 2 players both in - equal last stamps: nobody +2; the later stamp is the survivor', q1.ph === 1 && q1.surv === -1 && !q1.pts[0] && !q1.pts[1] && q2.surv === 1 && q2.pts[1] === 2, [q1, q2]);
    // the last 10 s: acc2 / push2, the banner, the hurry music
    s = sumoAt(['duck', 'cat', 'frog'], 89); on(0, 70); on(1, 120); on(2, 170);
    G.battle.left = S.lastS * 60 + 1; step(1);
    const l10 = su(), bn = G.banner;
    const vP = P.pushMe(1, 1); step(40); on(1, 120); on(0, 70);
    const r2 = ramp(0);
    ok('last 10 s: 더 미끌미끌! / 10초 남았어요, the hurry track, a push of 3.0, acc2 (rest to top in ' + r2[0] + ' f)', l10.last10 === 1 && bn && bn.main === '더 미끌미끌!' && bn.sub === '10초 남았어요' && G.music === 'hurry' && Math.abs(vP - 3) < 1e-6 && r2[0] === Math.ceil(1.25 / S.acc2 - 1e-9), [l10.last10, bn, G.music, vP, r2]);
    // time-up: everyone still on in the live set +1 (버텼다!)
    P.fall(2); G.battle.left = 2; step(2);
    ok('time-up: everyone still on the 평상 +1 (버텼다!) - not the raft; the 판 ends', G.mode === 'result' && su().pts[0] === 1 && su().pts[1] === 1 && !su().pts[2], [G.mode, su()]);
    // a stale seat falls in after 120 f (its raft in the nearer 탕), credits nobody
    s = sumoAt(['duck', 'cat', 'frog'], 90); on(0, 70); on(1, 120);
    P.fakeBody(2, { x: 172, y: 168, rt: G.frame }); P.pushMe(0, 1, { by: 1 }); const lastB = su().last;
    step(S.staleF); const st0 = su(); step(2); const st1 = su(), p2b = pl(2);
    ok('stale: a seat silent for 120 f falls in - a raft in the nearer (right) 탕, no credit', !st0.outs.some((o) => o[0] === 2) && st1.outs.some((o) => o[0] === 2) && p2b.raft && st1.tub[2] === 1 && p2b.x >= 200 && p2b.x <= 224 && !st1.pts[1] && !!lastB, [st0.outs, st1, p2b.x]);
    // the key: points, then frames on the 평상
    Object.assign(G.mini, { pts: { 0: 2, 1: 2, 2: 2 }, platF: { 0: 900, 1: 1200, 2: 900 } });
    const pm = new Map(P.places());
    ok('key: equal points - more frames on the 평상 places higher; equal both - a shared place', pm.get(1) === 1 && pm.get(0) === 2 && pm.get(2) === 2, P.places());
    // coins: every blow through coinShot (no coinAct of its own)
    s = sumoAt(['duck', 'cat'], 91); on(0, 70); on(1, 180);
    const bs0 = PS().coins.bshots; D.press('shoot', true, 0); step(1); D.press('shoot', false, 0); step(30);
    ok('coins: a blow is one action (coinShot, as in the arena games)', PS().coins.bshots === bs0 + 1, [bs0, PS().coins.bshots]);
    // a leaver standing that leaves one on: the set ends without +2
    s = sumoAt(['duck', 'cat', 'frog'], 92); on(0, 70); on(1, 120); on(2, 170);
    P.fall(2); P.drop(1); step(S.early + 2);
    ok('leaver: one standing leaves - one left on: the set ends, no +2 (nobody beat anyone)', su().ph === 1 && su().surv === -1 && !su().pts[0] && su().lv === 1, su());
    // the view: bounds, the tub array
    const v1 = P.sumoView(['u', 3, 1, [2, 0, 1, 0], [1, 0, 0, 2], 5, 1, 196, 0, 900, [-1, 0, 1, -1]]);
    const v2 = P.sumoView(['u', 'x', 9, [99999, -3], 'y', 99, 7, 9999, 12, -5, 'z']);
    ok('view: sumoView mirrors the row (rv bits, the tub by seat, wl) and keeps every field within bounds', v1.set === 3 && v1.ph === 1 && same(v1.pts, { 0: 2, 2: 1 }) && same(v1.hits, { 0: 1, 3: 2 }) && same(v1.rv, { 0: 1, 2: 1 }) && v1.last10 === 1 && v1.wl === 196 && v1.surv === 0 && v1.F0 === 900 && same(v1.tub, { 1: 0, 2: 1 })
      && v2.set === 0 && v2.ph === 2 && v2.pts[0] === 999 && v2.last10 === 1 && v2.wl === 224 && v2.surv === 3 && v2.F0 === -1 && same(v2.tub, {}), [v1, v2]);
    // the fast party: 20 s; the 판 by its clock
    P.fast(true); party(['duck', 'cat'], { plan: ['sumo'] }); const ftot = PS().total; toPlaying(); const t0 = G.frame;
    until(() => G.mode !== 'playing', 25 * 60); const flen = G.frame - t0; P.fast(false);
    ok('fast party: 20 s (fastSecs) - the clock ends it (' + (flen / 60).toFixed(1) + ' s)', ftot === 20 * 60 && G.mode === 'result' && flen <= 20 * 60 + 2, [ftot, flen, G.mode]);
    // the card and the demo
    party(longNicks(), { plan: ['sumo'] }); step(80);
    const c = P.card();
    ok('card: 미끌미끌 비누 씨름 - its how, rule and keys lines as specified', c.name === '미끌미끌 비누 씨름' && c.how === '비눗방울로 밀어내요! 탕에 빠지면 탈락' && c.rule === '빠지면 오리 튜브로 밀어서 역전! · 밀어 빠뜨리면 1점, 끝까지 남으면 +2점' && c.keys === 'X 비눗방울 · Z 점프 · ←→ 미끌미끌' && P.mini().sumo.keysT === '거품으로 밀기 · 점프로 피하기' && c.demo, c);
    const dm = P.demo('sumo');
    ok('demo [sumo]: 240 frames into a 96x32 context without errors, pixels left', dm && !dm.err && dm.lit > 200, dm);
    // no regressions: a battle after a sumo party - bubbles trap again, the normal acc, a raft-free raftMove, the music
    D.local.battle(['duck', 'cat']); step(200);
    const a = pl(0), bb = pl(1); a.invuln = 0; bb.invuln = 0;
    ok('after a sumo party: no soap, no push bubbles in a battle (the base kit\'s 3.5 px/f line again)', P.soapy(0) === false && P.soapy(1) === false && G.music === 'battle', [P.soapy(0), G.music]);
  }

  // ---------------------------------------------------------------- screenshot scenes (#shot=tap|tapgo|taprev|tapcard|
  // chair|chairstop|chairrev|chaircard|egg|eggpass|eggburst|eggcard|sumo|sumopush|sumoraft|sumocard[&s=1|2|0]) - to LOOK at
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
    } else if (/^sumo/.test(name)) {
      party(longNicks(), { plan: ['sumo'] }, 31);
      if (name === 'sumocard') step(100);
      else {
        toPlaying(); calm(); on(0, 76); on(1, 108); on(2, 148); on(3, 180);
        if (name === 'sumo') { P.sumoBub(0, 76, 167, 1); step(4); }
        else if (name === 'sumopush') { P.sumoBub(1, 100, 167, 1); step(12); }
        else { P.fall(3); P.fall(0); D.press('jump', true, 0); step(1); D.press('jump', false, 0); step(10); P.sumoBub(0, pl(0).x, pl(0).y - 1, 1); step(8); }
      }
    } else if (/^egg/.test(name)) {
      party(longNicks(), { plan: ['egg'] }, 31);
      if (name === 'eggcard') step(100);
      else {
        toPlaying(); P.ghost(3, true); toLive(); apart(); P.eggHold(1, G.frame - 250);
        if (name === 'egg') step(20);
        else if (name === 'eggpass') { stand(1, 40); stand(0, 55); step(6); }
        else { P.burstAt(G.frame + 2); step(name === 'eggburst' ? 6 : 30); }
      }
    }
    if (/^chair/.test(name) && G.mini) info('scene ' + name + ': ' + JSON.stringify({ c: P.chair(), stools: P.stoolsAt(G.frame), xs: G.players.map((p) => p.x + 8), f: G.frame, mloc: P.mloc() }));
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
    // (#only=<name>: one section - e.g. #only=sumo while building)
    const om = /only=([a-z]+)/.exec(location.hash);
    const steps = [machineryTests, stampTests, tapTests, chairTests, eggTests, sumoTests].filter((f) => !om || f.name === om[1] + 'Tests');
    for (const f of steps) {
      try { await f(); } catch (e) { fail++; log('PARTY2 FAIL ' + f.name + ' threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
    }
    log('PARTY2 DONE pass=' + pass + ' fail=' + fail);
  }
  setTimeout(run, 50);
})();
