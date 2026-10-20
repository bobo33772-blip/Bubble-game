// v4 shop (design/shop.md 16.1): 비누 코인, the store v2, and (pass S2) the items in play - offline, virtual time.
//   node bogeul/build.js
//   node bogeul/tools/run-chrome.js test-shop.html shop-unit.png 900 760 120000 "SHOP DONE"
//   a real phone viewport (the cards' fit only): node bogeul/tools/cdp-run.js "test-shop.html#fit" - 320 568 30000 "SHOP DONE" 1
// Groups (16.1): 1. the battle economy, pure (coinBattle: every place of 3.1, ties, walkovers, < 60 s, < 5 shots, the KO
// cap, a random bound); 2. runs (a solo game over in the 4th 탕 through real clears, a full clear = 232, the anti-AFK
// shots, once per index, 2회차 a new run, nothing offline in local co-op / the demo, my blows only - an otter's volley is
// one); 3. the day bonus and the soft cap (streak 20..40, a skipped day, a clock set back / far ahead, 400 then halves,
// the bonus never halved, the 99,999 stop); 4. the pace of 3.7; 5. the store v2 (a v1 store with a link record and
// holds migrates losslessly, v 3 is read-only, the clamps, read-modify-write, the storage event) and buying / wearing at
// store level; 6c. the 목욕 끝 / ending coin rows (texts, 최고 점수 stepping aside, the fit at 1x / 2x / 320 px) and the
// podium's coin line (staged) and screen-reader text; 10. the web-font warm-up of the coin strings.
// Pass S2 (items in play): 7. the composites (every animal x anchored frame x 12 sets wearing all 34 items, + twins)
// against a reference built here from pixels, the anchors on the art, hats <= 6 px, the curled poses, the capy's yuzu,
// no items on die / trapped / ghost / life frames, the real drawing path (exact spot, flip, squash, the penguin slide
// 3 px low), headTop / lookLift with the tag pointer, the stun stars and the podium crown, a twin's hat keeping its
// colours inside one slot ring, bare(true), my set on the solo animal / the demo / 한 판 더 / the picker; 8. the
// effects (each of e1-e6, the heel, reduced motion, the particle budget with 4 players).
// Pass S3a / S3b (the hub): 6. / 9. hubTests (the title's 상점 button and dot, the 상점: first visit, the opening pick,
// the armed buy, every verb and message, cells, locks, read-only, keys), myTests (the badge -> 마이페이지, equipment,
// grid, notes, the name, 내 기록 there and back), viewTests (the preview and its effects), hubFitTests (1x / 2x /
// desktop); #hubfit[&touch=1][&ns=all|shop|none][&s=1] the fit at a real viewport; ?net=bc#room (http) the room's 꾸미기.
//   #shot=title | hub&st=<first|buy|armed|bought|poor|locked|legend|e6|starter|full|empty|my>[&tick=n][&big=1] | room
//   (http, ?net=bc)&st=my&close=1
//   ?perf=1   frame cost of a 4-player battle bare vs wearing (real time: node tools/run-chrome.js test-shop.html?perf=1 -
//             900 760 rt60000 "SHOP DONE")
// Every group works in its own store namespace (PG.debug.tro.ns): the default store stays bare for the pixel tests.
// Prints "SHOP PASS|FAIL <name>", "SHOP INFO ..." and "SHOP DONE pass=N fail=M".
//   #shot=over|ending|podium[&s=1]  a scene to look at ("SHOP SHOT READY"; s = the screen scale, 1 = 256x224)
//   #shot=play[&bare=1]  a 4-player battle, all four wearing hats (two ducks: a twin); bare = the same without items
//   #shot=podhat  the podium with hats (crowns above them);  #shot=sheet  every animal x frame x 6 sets at 4x
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  window.addEventListener('error', (e) => { fail++; log('SHOP FAIL page error: ' + e.message + ' @' + e.lineno); });
  const ok = (name, cond, info) => { if (cond) { pass++; log('SHOP PASS ' + name); } else { fail++; log('SHOP FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); } return !!cond; };
  const info = (s) => log('SHOP INFO ' + s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const HUBFIT = /hubfit/.test(location.hash), FIT_ONLY = !HUBFIT && /fit/.test(location.hash);
  // prefers-reduced-motion on demand (CALM = true): the engine holds its MediaQueryList, so answer through the
  // prototype's getter (as distinction.js / kits-scenes.js do)
  let CALM = false;
  try {
    const md = Object.getOwnPropertyDescriptor(MediaQueryList.prototype, 'matches');
    Object.defineProperty(MediaQueryList.prototype, 'matches', { configurable: true, get() { return (CALM && /reduced-motion: reduce/.test(this.media)) || md.get.call(this); } });
  } catch (e) { /* ignore */ }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let D, T, SH, G, L;
  const S = () => SH.state();
  const raw = () => { try { return JSON.parse(localStorage.getItem(T.state().key)); } catch (e) { return null; } };
  let nsN = 0;
  // a fresh store in its own namespace (fake day `day`, the day bonus already paid today unless bonus)
  const fresh = (day, bonus) => { T.ns('shop' + (++nsN)); T.away(false); T.today(day || 20261018); if (!bonus) SH.set({ bd: day || 20261018, bs: 1 }); return S(); };
  const shown = (e) => !!e && !e.hidden && (e.getClientRects().length > 0 || (getComputedStyle(e).display === 'contents' && [...e.children].some((c) => c.getClientRects().length > 0)));
  // (keyOn: from the focused element, as a real key press - the hub's arrows read their target)
  const keyOn = (code, k) => { const t = document.activeElement || document.body; t.dispatchEvent(new KeyboardEvent('keydown', { code, key: k || code, bubbles: true, cancelable: true })); t.dispatchEvent(new KeyboardEvent('keyup', { code, key: k || code, bubbles: true })); };
  const key = (code, k) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: k || code, bubbles: true, cancelable: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: k || code, bubbles: true })); };
  // one blow of player `slot`'s bubble (a press, then the shot cooldown)
  const blow = (slot) => { D.press('shoot', true, slot | 0); D.step(1); D.press('shoot', false, slot | 0); D.step(24); };
  // the current solo 탕 cleared through the real path (enemies killed -> the clear -> nextRound -> the doors): returns
  // when the next 탕 is playing (or the ending / game over showed)
  function clearRound() {
    const r0 = G.round;
    D.killAll();
    for (let i = 0; i < 1500; i++) { D.step(1); const st = D.getState(); if (st.phase === 'ending' || st.phase === 'gameover' || (G.round !== r0 && st.phase === 'playing')) break; }
  }

  // ---------------------------------------------------------------- 1. the battle economy (pure)
  function econTests() {
    const B = { 2: [6, 0], 3: [8, 4, 0], 4: [8, 4, 2, 0] };
    const fin = (n) => { const a = []; for (let i = 0; i < n; i++) a.push({ slot: i, sc: (n - i) * 100, k: 0, ko: 0 }); return a; };
    let bad = [];
    for (const n of [2, 3, 4]) for (const m of [2, 3, 5]) for (let p = 0; p < n; p++) {
      const got = SH.battle(n, fin(n), p, 0, m * 3600, 5, 0), want = 2 + 4 * m + B[n][p];
      if (got !== want) bad.push([n, m, p, got, want]);
    }
    ok('econ: every place of n 2 / 3 / 4 x 2 / 3 / 5 min pays 2 + 4 / min + the place bonus (3.1)', !bad.length, bad);
    // the 3.1 table (4 players, full time)
    const t4 = [2, 3, 5].map((m) => [0, 1, 2, 3].map((p) => SH.battle(4, fin(4), p, 0, m * 3600, 9, 0)));
    ok('econ: the 4-player table 18/14/12/10 · 22/18/16/14 · 30/26/24/22', same(t4, [[18, 14, 12, 10], [22, 18, 16, 14], [30, 26, 24, 22]]), t4);
    // ties: the floored average of the tied places' bonuses
    const tie = [{ slot: 0, sc: 500, k: 1, ko: 0 }, { slot: 1, sc: 500, k: 1, ko: 0 }, { slot: 2, sc: 300, k: 0, ko: 0 }, { slot: 3, sc: 100, k: 0, ko: 0 }];
    const tg = [0, 1, 2, 3].map((s) => SH.battle(4, tie, s, 0, 7200, 5, 0) - 10);
    ok('econ: a tie for 1st shares (8 + 4) / 2 = 6 each; the next ones keep 2 / 0', same(tg, [6, 6, 2, 0]), tg);
    const tie3 = [{ slot: 0, sc: 500, k: 0, ko: 0 }, { slot: 1, sc: 300, k: 0, ko: 0 }, { slot: 2, sc: 300, k: 0, ko: 0 }, { slot: 3, sc: 300, k: 0, ko: 0 }];
    const t3 = [0, 1, 2, 3].map((s) => SH.battle(4, tie3, s, 0, 7200, 5, 0) - 10);
    ok('econ: three tied behind the winner share floor((4 + 2 + 0) / 3) = 2', same(t3, [8, 2, 2, 2]), t3);
    const all = [0, 1, 2].map((s) => ({ slot: s, sc: 0, k: 0, ko: 0 }));
    const ta = [0, 1, 2].map((s) => SH.battle(3, all, s, 0, 7200, 5, 0) - 10);
    ok('econ: everyone tied -> everyone the floored average (8 + 4 + 0) / 3 = 4', same(ta, [4, 4, 4]), ta);
    const kt = [{ slot: 0, sc: 500, k: 2, ko: 0 }, { slot: 1, sc: 500, k: 1, ko: 0 }];
    ok('econ: the same score but more KOs is not a tie (sameRes: score, kos, koed)', SH.battle(2, kt, 0, 0, 7200, 5, 2) === 10 + 6 + 2 && SH.battle(2, kt, 1, 0, 7200, 5, 1) === 10 + 0 + 1);
    // walkovers, too short, too few shots, the KO cap, not a finisher
    ok('econ: a walkover (ended 61 f early) pays the minutes and KOs, no place bonus', SH.battle(4, fin(4), 0, 61, 10800, 5, 2) === 2 + 4 * 2 + 2, SH.battle(4, fin(4), 0, 61, 10800, 5, 2));
    // (review 2026-10-18: an end within 60 f is full time - every minute and the place bonus; a guest's clock comes from a
    // snapshot a few frames before the end, which floor() used to cut down by a whole minute)
    ok('econ: ending 60 f early is full time - the last minute and the place bonus (3분 1st: 22)', SH.battle(4, fin(4), 0, 60, 10800, 5, 0) === 2 + 4 * 3 + 8, SH.battle(4, fin(4), 0, 60, 10800, 5, 0));
    ok('econ: a guest\'s 2-frame clock pays what the host\'s 0 pays (2분 / 3분 / 5분 tables)', [2, 3, 5].every((m) => [0, 1, 2, 3].every((p) => SH.battle(4, fin(4), p, 2, m * 3600, 5, 0) === SH.battle(4, fin(4), p, 0, m * 3600, 5, 0))));
    ok('econ: under 60 s played pays nothing', SH.battle(2, fin(2), 0, 7200 - 3599, 7200, 9, 3) === 0 && SH.battle(2, fin(2), 0, 7200 - 3600, 7200, 9, 0) === 6);
    ok('econ: fewer than 5 bubbles blown pays nothing', SH.battle(4, fin(4), 0, 0, 7200, 4, 3) === 0 && SH.battle(4, fin(4), 0, 0, 7200, 5, 0) === 18);
    ok('econ: at most 6 KOs count', SH.battle(4, fin(4), 3, 0, 7200, 5, 40) === 10 + 0 + 6);
    ok('econ: a player who is not among the finishers gets nothing', SH.battle(4, fin(3), 3, 0, 7200, 9, 2) === 0);
    // random fins: never above 22 + 8 + 6 (5 min, 1st, 6 KOs)
    let mx = 0, neg = 0, seed = 7;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 3000; i++) {
      const n = 2 + Math.floor(rnd() * 3), f = [];
      for (let s = 0; s < n; s++) f.push({ slot: s, sc: Math.floor(rnd() * 4) * 100, k: Math.floor(rnd() * 3), ko: Math.floor(rnd() * 2) });
      f.sort((a, b) => b.sc - a.sc || b.k - a.k || a.ko - b.ko);
      const c = SH.battle(n, f, Math.floor(rnd() * n), Math.floor(rnd() * 400) - 100, [2, 3, 5][Math.floor(rnd() * 3)] * 3600, Math.floor(rnd() * 12), Math.floor(rnd() * 12));
      mx = Math.max(mx, c); if (c < 0) neg++;
    }
    ok('econ: 3000 random finishes never pay above 36 (22 + 8 + 6) or below 0', mx <= 36 && !neg, [mx, neg]);
    info('random battles: the most paid ' + mx);
  }

  // ---------------------------------------------------------------- 2. runs (solo through the real path, co-op, the demo)
  async function runTests() {
    fresh(20261018, true);                                     // (the day's first: the bonus is in the first award)
    D.start(0, 'duck'); D.setInvincible(true);
    const r0 = SH.run();
    ok('run: a debug solo start starts a coin run (nothing paid yet, coins ok)', r0 && r0.got === 0 && !r0.done.length && S().ok, [r0, S().ok]);
    // 탕 1-3: two blows each, then cleared
    for (let r = 0; r < 3; r++) { blow(0); blow(0); clearRound(); }
    const r3 = SH.run();
    ok('run: 3 탕 cleared with 2 blows each -> 3 x 6 + the day\'s first bonus 20 = 38', D.getState().round === 3 && r3.got === 38 && r3.bonus === 20 && same(r3.done, [0, 1, 2]) && S().co === 38, [D.getState().round, r3, S().co]);
    ok('run: the +6 word pop shows over my animal at each clear (this screen only)', G.words.some((w) => w.txt === '+6') || r3.got === 38, G.words.map((w) => w.txt));
    // the 4th 탕: no blow, then the play coin needs 60 s and 5 blows (6 so far), then game over
    while (G.frame - r3.t0 < 3700) D.step(50);
    D.setInvincible(false); G.lives = 1; D.hitPlayer(0); D.step(120);
    const r4 = SH.run();
    ok('run: game over in the 4th 탕 -> + the play coin 2 = 40 (3 x 6 + 2 + 20)', D.getState().phase === 'gameover' && r4.got === 40 && r4.end && S().co === 40, [D.getState().phase, r4, S().co]);
    const dd = $('pg-over-coin');
    // (review 2026-10-18: the first coins send a kid to the 상점 only when they buy something - 40 do not: the goal)
    ok('card: the 목욕 끝 card shows "비누 코인 +40" and, the first coins ever but nothing affordable yet, "60개 모으면 첫 아이템!"', shown($('pg-over-crow')) && dd.querySelector('span').textContent === '+40' && dd.querySelector('small').textContent === '60개 모으면 첫 아이템!', dd.textContent);
    ok('card: the coin icon is painted', (() => { const c = dd.querySelector('canvas'); const d = c.getContext('2d').getImageData(0, 0, 8, 8).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; })());
    SH.end();
    ok('run: showing the card again pays nothing more', SH.run().got === 40 && S().co === 40, [SH.run(), S().co]);
    // an AFK 탕 (1 blow) pays nothing; the same index twice pays once
    D.start(0, 'duck'); D.setInvincible(true);
    SH.shot(); SH.clear(0, false);
    ok('run: a 탕 where I blew only 1 bubble pays 0', SH.run().got === 0 && same(SH.run().done, [0]), SH.run());
    SH.shot(); SH.shot(); SH.clear(0, false);
    ok('run: the same index again pays nothing (once a run)', SH.run().got === 0, SH.run());
    SH.shot(); SH.shot(); SH.clear(1, false);
    ok('run: the next index with 2 blows pays 6', SH.run().got === 6, SH.run());
    // a full clear: 20 x 6 + 4 x 15 + 50 + 2 = 232
    fresh(20261019);
    D.start(0, 'duck'); D.setInvincible(true);
    for (let i = 0; i < 24; i++) { SH.shot(); SH.shot(); SH.clear(i, i === 23); }
    G.frame += 3700; SH.end();
    ok('run: a full clear (24 탕, 4 bosses, the ending, the play coin) pays 232', SH.run().got === 232 && S().co === 232, [SH.run().got, S().co]);
    // the ending card through the real path, then 2회차 is a new run (round index 24 on)
    fresh(20261020);
    D.start(23, 'duck'); D.setInvincible(true); blow(0); blow(0);
    D.killBoss(); for (let i = 0; i < 900 && D.getState().phase !== 'ending'; i++) D.step(1);
    const re = SH.run();
    ok('run: the last boss 탕 cleared -> the ending card pays 15 + 50 = 65', D.getState().phase === 'ending' && re.got === 65 && shown($('pg-end-crow')) && $('pg-end-coin').querySelector('span').textContent === '+65', [D.getState().phase, re, $('pg-end-coin').textContent]);
    ok('card: first coins that buy something (65 >= 60) -> "상점에서 써요!"', $('pg-end-coin').querySelector('small').textContent === '상점에서 써요!', $('pg-end-coin').textContent);
    await sleep(320); key('Enter');
    const r2 = SH.run();
    ok('run: 2회차 starts a new run (nothing paid, nothing done)', D.getState().loop === 1 && r2 && r2.got === 0 && !r2.done.length && r2.t0 !== re.t0, [D.getState().loop, r2]);
    SH.shot(); SH.shot(); SH.clear(24, false);
    ok('run: ... and pays its own 탕 (index 24: 6)', SH.run().got === 6, SH.run());
    // my blows only (an otter's volley is one blow); a partner's blow is not mine
    D.start(0, 'otter'); D.setInvincible(true); D.step(30);
    const nb = G.bubbles.length; D.press('shoot', true, 0); D.step(1); D.press('shoot', false, 0);
    const vol = G.bubbles.slice(nb), one = vol.length >= 3 && vol.every((q) => q.vol === vol[0].vol);
    D.step(24);
    ok('shots: an otter\'s 3-bubble volley (one fire) counts as one blow', one && SH.run().all === 1 && SH.run().shots === 1, [vol.length, SH.run()]);
    D.local.coop(['duck', 'cat'], 0); D.setInvincible(true); D.step(30);
    blow(1);
    ok('shots: another player\'s blow (slot 2 - as the host\'s hostShot for a guest) is not mine', SH.run().all === 0, SH.run());
    blow(0);
    ok('shots: ... my own is', SH.run().all === 1, SH.run());
    // nothing offline in local co-op, nothing in the attract demo
    const c0 = S().co;
    SH.shot(); SH.shot();
    ok('run: offline local co-op pays nothing (coinOk false)', !S().ok && SH.clear(0, false) === null && S().co === c0, S());
    D.toTitle();
    ok('run: the attract demo has no run and pays nothing', SH.run() === null && SH.clear(0, false) === null && !S().ok && S().co === c0, S());
    D.setInvincible(false);
  }

  // ---------------------------------------------------------------- 3. the day bonus and the soft cap
  function dayTests() {
    fresh(20261001, true);
    const days = [20261001, 20261002, 20261003, 20261004, 20261005, 20261006], got = [];
    for (const d of days) { T.today(d); got.push(SH.give(6, true).bonus); SH.give(6, true); }
    ok('day: streak bonuses 20 -> 25 -> 30 -> 35 -> 40 -> 40, once a day', same(got, [20, 25, 30, 35, 40, 40]) && S().bs === 5, [got, S().bs]);
    T.today(20261008); const sk = SH.give(6, true);
    ok('day: a skipped day starts the streak over at 20', sk.bonus === 20 && S().bs === 1 && S().bd === 20261008, [sk, S().bs]);
    ok('day: an award without the day flag never pays the bonus', (() => { T.today(20261009); const r = SH.give(6, false); return r.bonus === 0 && S().bd === 20261008; })());
    T.today(20261007); const back = SH.give(6, true);
    ok('day: the clock set back one day pays no bonus (a day already paid is ahead)', back.bonus === 0 && S().bd === 20261008, [back, S().bd]);
    SH.set({ bd: 20311018, bs: 4 }); T.today(20261010);
    const fut = SH.give(6, true);
    ok('day: a bonus day 5 years ahead (a wrong clock) is forgotten: the bonus pays at streak 1, today stored', fut.bonus === 20 && S().bd === 20261010 && S().bs === 1, [fut, S().bd, S().bs]);
    ok('day: month and year edges (the local calendar)', SH.dayAdd(20261031, 1) === 20261101 && SH.dayAdd(20270101, -1) === 20261231 && SH.dayAdd(20280229, 1) === 20280301);
    // the soft cap: 400 a day at full rate, then halves (floor, at least 1); the raw coins count
    fresh(20261011);
    const a = SH.give(399), b = SH.give(5), c = SH.give(1), d = SH.give(9);
    ok('cap: 399 -> 399; then 5 -> 1 + floor(4 / 2) = 3; 1 -> 1 (min 1); 9 -> 4; the raw day count 414', a.give === 399 && !a.halved && b.give === 3 && b.halved && c.give === 1 && d.give === 4 && S().cde === 414 && S().co === 407, [a, b, c, d, S().cde]);
    T.today(20261012);
    const n1 = SH.give(10, true);
    ok('cap: a new day resets it (full rate again; this is the day\'s first: +25)', n1.give === 35 && !n1.halved && S().cde === 10, [n1, S().cde]);
    SH.set({ cd: 20261013, cde: 600, bd: 20261010 }); T.today(20261013);
    const h = SH.give(10, true);
    ok('cap: the day bonus is never halved (10 halved to 5 + the full 20)', h.give === 25 && h.bonus === 20 && h.halved, h);
    SH.set({ ce: 99990 + S().sp, cd: 20261013, cde: 0 });
    const top = SH.give(50), top2 = SH.give(50);
    ok('cap: the balance stops at 99,999 (no more coins are added)', top.give === 9 && S().co === 99999 && top2.give === 0 && S().co === 99999, [top, top2, S().co]);
    // a read-only store (a newer page's) gives nothing
    localStorage.setItem('ppogeul-trophy-shopro', JSON.stringify({ v: 6, dev: 'abcdefgh', t: 1 }));
    T.ns('shopro');
    ok('cap: a read-only store gives nothing and buys nothing', SH.give(10, true) === null && S().ro && SH.buy('h1').why === 'ro' && SH.wear('n', 'n1') === false);
    T.today(null);
  }

  // ---------------------------------------------------------------- 4. the pace (3.7), with fixed play times
  function paceTests() {
    // day 1, a new solo player: game 1 dies in the 3rd 탕 (~4 min: 2 cleared), game 2 in the 5th (~6 min: 4 cleared)
    fresh(20261101, true);
    const solo = (cleared, idx0) => { D.start(0, 'duck'); for (let i = 0; i < cleared; i++) { SH.shot(); SH.shot(); SH.clear((idx0 | 0) + i, false); } SH.shot(); G.frame += 3700; SH.end(); };
    solo(2); const g1 = S().co; solo(4); const g2 = S().co;
    ok('pace: day 1 - game 1 (2 탕) = 34 with the day bonus, game 2 (4 탕) = 26 more: 60 at ~10 min, the first 보통 item (60)', g1 === 34 && g2 === 60, [g1, g2]);
    // an evening: 22 battles of 3 min (places cycling 1st..4th, 0..3 KOs) + the day bonus, under the soft cap's halving
    fresh(20261102, true);
    const fin = [0, 1, 2, 3].map((s) => ({ slot: s, sc: (4 - s) * 100, k: 0, ko: 0 }));
    for (let i = 0; i < 22; i++) SH.give(SH.battle(4, fin, i % 4, 0, 10800, 8, i % 4), true);
    const ev = S().co;
    ok('pace: an evening of 22 three-minute battles pays >= 380 (a 희귀 item or two 고급)', ev >= 380, ev);
    // two weeks of casual play at ≈ 45 min a day (3.7, as restated by the review of 2026-10-18 - its old "35 min" model
    // played ≈ 49): 3 solo games that end in 탕 5 / 7 / 9 (4 + 6 + 8 cleared, ≈ 1.6 min a 탕 and twice that for the two
    // bosses: ≈ 32 min) and 3 three-minute battles with their countdowns and podiums (≈ 10 min); the streak kept
    fresh(20261103, true);
    for (let d = 0; d < 14; d++) {
      T.today(SH.dayAdd(20261103, d));
      for (const n of [4, 6, 8]) solo(n);
      for (let i = 0; i < 3; i++) SH.give(SH.battle(4, fin, (i + d) % 4, 0, 10800, 8, 1), true);
    }
    const two = S().co;
    ok('pace: two weeks of casual play (≈ 45 min a day) pay >= 2,800 (a 전설 around days 12-16)', two >= 2800, two);
    info('pace: day 1 ' + g1 + ' + ' + (g2 - g1) + ' = ' + g2 + ', an evening ' + ev + ', two weeks ' + two);
    T.today(null);
  }

  // ---------------------------------------------------------------- 5. the store v2
  function storeTests() {
    // a v1 store with a link record and holds: every trophy field identical, the link record kept, coins 0
    const cs = { u: 'uid1', k: 'abcdefgh', c: { t: 5, w: 1, g: 2, ko: 3, de: 4, day: 20261017 }, v: { t: 345, w: 5, g: 9, ko: 12, de: 7, day: 20261017 }, m: { n: 3, t: 340, w: 4, g: 8, ko: 11, best: 380, bl: 3, seen: 1, hi: 5000, day: 20261017, de: 6 }, n: 3, mt: 1760000000000 };
    const esc = [{ m: 'abc123.7', tab: 'zzzzzz', h: 16, s: 10, n: 4, p: 0, st: 'open', t0: Date.now() }];
    const v1 = { v: 1, dev: 'abcd1234', t: 345, best: 400, bl: 3, w: 5, g: 9, ko: 12, day: 20261017, de: 7, seen: 1, esc, cs };
    localStorage.setItem('ppogeul-trophy-shopv1', JSON.stringify(v1));
    T.ns('shopv1');
    const ts = T.state(), r = raw();
    const keep = ['dev', 't', 'best', 'bl', 'w', 'g', 'ko', 'day', 'de', 'seen'];
    ok('v1 -> v2: every trophy field identical, the holds kept', keep.every((k) => ts[k] === v1[k]) && same(ts.esc, esc) && !ts.ro, keep.filter((k) => ts[k] !== v1[k]));
    // (S5: the cloud's v 2 link record reads a v 1 one's c / v with no coins - its own fields equal after the clamps)
    const v1Of = (x) => ({ t: x.t, w: x.w, g: x.g, ko: x.ko, de: x.de, day: x.day }), noCoins = (x) => x.ce === 0 && x.sp === 0 && same(x.o, []) && x.bd === 0 && x.bs === 0;
    ok('v1 -> v5: written back as v 5 (the trophy balance, after the 뽑기 v 4) with the link record kept (equal after its clamps, no coins in it), no coins, every animal bare, lh 0', r && r.v === 5 && r.lh === 0 && r.cs && r.cs.u === 'uid1' && r.cs.k === 'abcdefgh' && same(v1Of(r.cs.c), cs.c) && same(v1Of(r.cs.v), cs.v) && noCoins(r.cs.c) && noCoins(r.cs.v) && r.cs.n === 3 &&
      r.ce === 0 && r.sp === 0 && same(r.own, []) && r.eq === '0'.repeat(30) && r.bd === 0 && r.sh === 0, r);
    ok('v1 -> v2: the coins read 0 and nothing is worn', S().co === 0 && S().look === '00000');
    // (looks-per-animal.md 11.1) a v 2 store: its one worn set copied to all six animals, lh 1, written back AT LOAD as v 3
    const ANIS = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'];
    const v2 = { v: 2, dev: 'abcd1234', t: 345, best: 400, bl: 3, w: 5, g: 9, ko: 12, day: 20261017, de: 7, seen: 1, esc: [], ce: 900, sp: 280, own: ['h5', 'n3', 'e6'], eq: '50306', cd: 20261017, cde: 40, bd: 20261017, bs: 2, sh: 1, cv: 300 };
    localStorage.setItem('ppogeul-trophy-shopv2', JSON.stringify(v2));
    T.ns('shopv2');
    const r2 = raw(), same2 = Object.keys(v2).filter((k) => k !== 'v' && k !== 'eq').every((k) => same(r2[k], v2[k]));
    ok('v2 -> v3: every animal wears the old set (50306), lh 1, written back at load as v 5 (the trophy balance) with 50306 x 6 and every other field identical',
      ANIS.every((c) => SH.look(c) === '50306') && S().lh === 1 && r2 && r2.v === 5 && r2.eq === '50306'.repeat(6) && r2.lh === 1 && same2, [r2, ANIS.map((c) => SH.look(c))]);
    localStorage.setItem('ppogeul-trophy-shopv2b', JSON.stringify(Object.assign({}, v2, { eq: '00000' })));
    T.ns('shopv2b');
    ok('v2 -> v3: a bare v 2 store gets lh 0', S().lh === 0 && raw().lh === 0 && S().eqs === '0'.repeat(30), [S().lh, S().eqs]);
    // a newer page's v 6 (after the trophy balance's v 5): read-only, its key untouched; a v 3 store is read
    const v4 = JSON.stringify({ v: 6, dev: 'abcdefgh', t: 777, ce: 50, own: ['h1'], extra: 1 });
    localStorage.setItem('ppogeul-trophy-shopv4', v4);
    T.ns('shopv4'); SH.give(10, true); SH.buy('h1'); T.set({ t: 9 });
    ok('v 6 on disk: read-only, never written', T.state().ro && localStorage.getItem('ppogeul-trophy-shopv4') === v4);
    localStorage.setItem('ppogeul-trophy-shopv3', JSON.stringify(Object.assign({}, v2, { v: 3, eq: '50000' + '00300'.repeat(4) + '00006', lh: 1 })));
    T.ns('shopv3');
    ok('v 3 on disk: read as it is (its own lh kept)', !T.state().ro && S().lh === 1 && SH.look('duck') === '50000' && SH.look('cat') === '00300' && SH.look('frog') === '00006', [S().eqs, S().lh]);
    // the clamps
    const junk = { v: 2, dev: 'abcdefgh', t: 30, best: 30, ce: 1e12, sp: -5, own: ['h1', 'h1', 'zz', 'n1', 'constructor', 'b7', 5, null, 'e6', 'hc'], eq: 'zzzzz', cd: 'x', cde: 1e9, bd: 1e12, bs: 77, sh: 'yes', cv: 1e9 };
    localStorage.setItem('ppogeul-trophy-shopclamp', JSON.stringify(junk));
    T.ns('shopclamp');
    let s = S();
    ok('clamps: ce 1e12 -> 1e9, sp < 0 -> 0, cde / bd / bs / cv to their ranges, sh -> 1', s.ce === 1e9 && s.sp === 0 && s.cde === 99999 && s.bd === 99991231 && s.bs === 5 && s.cv === 99999 && s.sh === 1 && s.cd === 0, s);
    ok('clamps: own keeps catalog ids once each, never the starter (n1 is implicit) - h1 b7 e6 hc', same(s.own, ['h1', 'b7', 'e6', 'hc']), s.own);
    ok('clamps: a worn set of junk -> 00000', s.eq === '00000', s.eq);
    SH.set({ eq: '1a111' });
    s = S();
    ok('clamps: worn items not owned are stripped (h1 owned and n1 the starter kept; fa no item, b1 / e1 not owned -> 0)', s.eq === '10100', s.eq);
    SH.set({ eq: 'c0076' });
    ok('clamps: the 효과 slot keeps an owned effect (e6) and b7', S().eq === 'c0076', S().eq);
    // (looks-per-animal.md 11.1) 30 characters of junk / 29 / 31 -> all bare; a junk chunk bares that animal only; an
    // unowned item on the cat is stripped there only (h1 b7 e6 hc owned here)
    SH.set({ eq: 'zz'.repeat(15) });
    ok('clamps: 30 characters of junk -> every animal bare', S().eqs === '0'.repeat(30), S().eqs);
    SH.set({ eq: '10000'.repeat(6).slice(1) }); const e29 = S().eqs; SH.set({ eq: '10000'.repeat(6) + '1' });
    ok('clamps: 29 / 31 characters -> every animal bare', e29 === '0'.repeat(30) && S().eqs === '0'.repeat(30), [e29, S().eqs]);
    SH.set({ eq: '10000' + 'ZZ000' + '10076'.repeat(4) });
    ok('clamps: a junk chunk on one animal only bares that animal (capy), the others keep theirs', S().eqs === '10000' + '00000' + '10076'.repeat(4), S().eqs);
    SH.set({ eq: '10000'.repeat(4) + '20000' + '10000' });
    ok('clamps: an unowned item on the cat (h2) is stripped there only', S().eqs === '10000'.repeat(4) + '00000' + '10000' && SH.look('cat') === '00000' && SH.look('frog') === '10000', S().eqs);
    ok('clamps: looksParse - 5 characters copied to all six, junk per chunk, 29 / 31 bare', SH.parses('10100') === '10100'.repeat(6) && SH.parses('1' + '0'.repeat(28)) === '0'.repeat(30) && SH.parses(5) === '0'.repeat(30) && SH.parses('z0z0z' + '10000'.repeat(5)) === '00000' + '10000'.repeat(5), [SH.parses('10100')]);
    ok('clamps: a worn digit that is no item at all -> 0 (lookParse)', SH.parse('z0z0z') === '00000' && SH.parse('1a0') === '00000' && SH.parse(12345) === '00000' && SH.parse('h1000') === '01000' && SH.parse('10100') === '10100', [SH.parse('h1000')]);
    // buying and wearing at store level (the 상점 UI is pass S3a)
    fresh(20261014);
    SH.give(150);
    let b = SH.buy('h1');
    ok('buy: an affordable item -> bought and worn, sp + 60', b.ok && b.now === 90 && S().sp === 60 && same(S().own, ['h1']) && S().eq === '10000', [b, S()]);
    ok('buy: the same item again -> own', SH.buy('h1').why === 'own' && S().sp === 60);
    ok('buy: too poor -> poor, with what is missing', (() => { const r2 = SH.buy('h5'); return r2.why === 'poor' && r2.need === 70 && S().sp === 60; })());
    ok('buy: a league item above my best league -> lock', SH.buy('h8').why === 'lock' && S().sp === 60);
    T.set({ bl: 3 }); SH.give(200);
    ok('buy: ... once the best league reaches it, it sells', SH.buy('h8').ok && S().eq === '80000');
    ok('buy: the starter and junk are not for sale', SH.buy('n1').why === 'bad' && SH.buy('zz').why === 'bad' && SH.buy('constructor').why === 'bad');
    // (gacha.md 13.2, G1: 50 entries - 10 draw-only, never sold; a retired item never sells either)
    const its = SH.items(), drs = its.filter((it) => it.dr), sp0 = S().sp;
    ok('catalog: 50 entries, 10 draw-only at price 0 - none of them for sale (bad), the coins untouched', its.length === 50 && drs.length === 10 && drs.every((it) => it.price === 0 && SH.buy(it.id).why === 'bad') && S().sp === sp0 && !S().own.includes('hd'), [its.length, drs.length, S().sp]);
    SH.retire('h3', true); const rb = SH.buy('h3'); SH.retire('h3', false);
    ok('catalog: a retired item is not for sale (bad, before any other answer)', rb.why === 'bad' && !S().own.includes('h3') && S().sp === sp0, rb);
    ok('wear: take a hat off, put another owned one on, the starter is always wearable', SH.wear('h', null) && S().eq === '00000' && SH.wear('h', 'h1') && S().eq === '10000' && SH.wear('n', 'n1') && S().eq === '10100', S().eq);
    ok('wear: an unowned item / a wrong slot / junk -> refused', !SH.wear('h', 'h2') && !SH.wear('f', 'h1') && !SH.wear('x', null) && S().eq === '10100', S().eq);
    T.set({ bl: 0 });
    ok('wear: a league item stays owned and wearable after the league drops', SH.wear('h', 'h8') && S().eq === '80100', S().eq);
    // (looks-per-animal.md 11.1) per animal: everything above dressed my pick only (the duck here)
    const pick = G.sel, others = ANIS.filter((c) => c !== pick);
    ok('per animal: buying / wearing dressed only my pick - every other animal is bare', SH.look(pick) === '80100' && others.every((c) => SH.look(c) === '00000'), [pick, S().eqs]);
    SH.set({ ce: S().ce + 1000 });
    const bc = SH.buy('h2', 'cat');
    ok('per animal: buy(h2, cat) dresses only the cat (bought = worn there); my pick keeps h8', bc.ok && SH.look('cat') === '20000' && SH.look(pick) === '80100' && ANIS.filter((c) => c !== 'cat' && c !== pick).every((c) => SH.look(c) === '00000'), [bc, S().eqs]);
    ok('per animal: wear(h, null, cat) takes the cat\'s hat off and leaves my pick\'s', SH.wear('h', null, 'cat') && SH.look('cat') === '00000' && SH.look(pick) === '80100', S().eqs);
    ok('per animal: the starter on the frog only', SH.wear('n', 'n1', 'frog') && SH.look('frog') === '00100' && SH.look('cat') === '00000', S().eqs);
    ok('per animal: refusals unchanged (unowned / wrong slot / junk animal = my pick)', !SH.wear('h', 'h9', 'cat') && !SH.wear('f', 'h1', 'cat') && SH.look('cat') === '00000' && SH.wear('h', 'h1', 'zebra') && SH.look(pick) === '10100', S().eqs);
    SH.set({ lh: 1 }); const lh1 = S().lh; SH.wear('h', 'h8');
    const lh2 = S().lh; SH.set({ lh: 1 }); SH.buy('f2', 'capy');
    ok('per animal: every dressing clears lh (a wear, a purchase)', lh1 === 1 && lh2 === 0 && S().lh === 0 && SH.look('capy') === '02000', [lh1, lh2, S().lh]);
    // read-modify-write: another tab wrote ce, then buy builds on it
    const k = T.state().key, o = raw(); o.ce += 500; localStorage.setItem(k, JSON.stringify(o));
    const co0 = S().co, bb = SH.buy('b1');
    ok('rmw: coins written behind the page\'s back are there for the next purchase (+500 - 90)', bb.ok && raw().ce === o.ce && S().co === co0 + 500 - 90, [bb, co0, S().co]);
    const o2 = raw(); o2.own = o2.own.concat(['f1']); o2.sp += 60; localStorage.setItem(k, JSON.stringify(o2));
    window.dispatchEvent(new StorageEvent('storage', { key: k }));
    ok('rmw: a purchase in another tab (storage event) shows here at once', S().own.includes('f1') && S().sp === o2.sp && SH.buy('f1').why === 'own', S().own);
  }

  // ---------------------------------------------------------------- 6c. the cards and the podium
  function setScale(s) {
    const st = $('pg-stage'); st.style.flex = 'none'; st.style.width = Math.round(256 * s + 22) + 'px'; st.style.height = Math.round(224 * s + 22) + 'px';
    window.dispatchEvent(new Event('resize'));
  }
  // a game over in the 4th 탕 after three real clears (both rows: the 목욕 보너스 +1 and the coins)
  async function overBoth() {
    D.start(0, 'duck'); D.setInvincible(true);
    for (let r = 0; r < 3; r++) { blow(0); blow(0); clearRound(); }
    D.setInvincible(false); G.lives = 1; D.hitPlayer(0); D.step(120);
    await sleep(700);
  }
  async function endingBoth() {
    D.start(23, 'duck'); D.setInvincible(true); blow(0); blow(0);
    D.killBoss(); for (let i = 0; i < 900 && D.getState().phase !== 'ending'; i++) D.step(1);
    await sleep(700);
  }
  function fitCheck(label, card) {
    const sc = $('pg-screen'), sr = sc.getBoundingClientRect(), r = card.getBoundingClientRect();
    info(label + ': card ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' scroll ' + card.scrollHeight + '/' + card.clientHeight);
    ok(label + ': no scrolling (nothing cut off), inside the screen', card.scrollHeight <= card.clientHeight + 1 && r.top >= sr.top - 0.5 && r.bottom <= sr.bottom + 0.5, [card.scrollHeight, card.clientHeight, r.top, sr.top, r.bottom, sr.bottom]);
  }
  async function cardAt(label, small) {
    fresh(20261015 + nsN); G.hiscore = 1234567;
    await overBoth();
    const both = shown($('pg-over-trow')) && shown($('pg-over-crow'));
    ok(label + ': the 목욕 끝 card shows the 트로피 and 비누 코인 rows', both, [shown($('pg-over-trow')), shown($('pg-over-crow'))]);
    const hi = document.querySelector('#pg-over .pg-hi-row');
    ok(label + ': 최고 점수 ' + (small ? 'steps aside (the HUD has it)' : 'stays'), small ? getComputedStyle(hi).display === 'none' : shown(hi), getComputedStyle(hi).display);
    fitCheck(label + ' 목욕 끝', document.querySelector('#pg-over .pg-card'));
    await endingBoth();
    ok(label + ': the ending card shows both rows', shown($('pg-end-trow')) && shown($('pg-end-crow')));
    ok(label + ': the ending\'s sub line ' + (small ? 'steps aside' : 'stays'), small ? getComputedStyle($('pg-end-sub')).display === 'none' : shown($('pg-end-sub')));
    fitCheck(label + ' ending', document.querySelector('#pg-ending .pg-card'));
    D.toTitle(); await sleep(60);
  }
  async function cardTests() {
    if (!FIT_ONLY) {
      // the small texts: the day bonus, halved, the balance; nothing when nothing was paid
      fresh(20261016, true); SH.give(5);                          // (not the first coins ever any more; the bonus is still due)
      await overBoth();
      ok('card text: the day bonus in it -> "첫 판 +20"', $('pg-over-coin').querySelector('small').textContent === '첫 판 +20', $('pg-over-coin').textContent);
      fresh(20261017); SH.give(5); SH.set({ cde: 500 });
      await overBoth();
      ok('card text: halved -> "오늘은 반만 모여요" (3 탕: 9 coins)', $('pg-over-coin').querySelector('small').textContent === '오늘은 반만 모여요' && $('pg-over-coin').querySelector('span').textContent === '+9', $('pg-over-coin').textContent);
      fresh(20261018); SH.give(5);
      await overBoth();
      ok('card text: otherwise the balance "23개"', $('pg-over-coin').querySelector('small').textContent === '23개' && $('pg-over-coin').querySelector('span').textContent === '+18', $('pg-over-coin').textContent);
      fresh(20261019);
      D.start(0, 'duck'); G.lives = 1; D.hitPlayer(0); D.step(120); await sleep(100);
      ok('card: nothing paid (no 탕 cleared, under 60 s) -> no coin row', !shown($('pg-over-crow')) && !$('pg-over').classList.contains('has-2rows'));
      D.local.coop(['duck', 'cat'], 0); G.lives = 0; for (const p of G.players) D.hitPlayer(p.slot);
      for (let i = 0; i < 1200 && D.getState().phase !== 'gameover'; i++) D.step(1);
      ok('card: offline local co-op -> no coin row', D.getState().phase === 'gameover' && !shown($('pg-over-crow')));
      // the podium (staged: an offline battle's podium as if it paid 38, 20 of it the day bonus)
      D.local.battle(['duck', 'cat', 'frog'], { arena: 0, countdown: false, monsters: false, intrusion: false });
      D.setInvincible(true); D.step(10);
      G.players.forEach((p, k) => { p.score = [900, 1500, 300][k]; });
      D.endBattle();
      const pd = SH.pod(38, 20), cv = $('pg-canvas'), cx = cv.getContext('2d');
      const place = G.podium.order.indexOf(0), sp = [[128, 112], [92, 122], [164, 130], [206, 144]][place], y = sp[1] + 21;
      const lineHash = () => { const d = cx.getImageData(sp[0] - 16, y - 2, 32, 10).data; let h = 0; for (let i = 0; i < d.length; i++) h = (Math.imul(h, 31) + d[i]) | 0; return h; };
      const pink = () => { const d = cx.getImageData(sp[0] - 16, y - 2, 32, 10).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 255 && d[i + 1] === 201 && d[i + 2] === 220) n++; return n; };
      while (G.podium.t < pd.t1 - 5) D.step(1);
      const before = pink();
      D.step(10); const on = pink();
      D.step(90); const off = pink();
      D.step(90); const on2 = pink();
      ok('podium: my block\'s 2nd line swaps to the pink "+38" coin line from T1, back after 90 f, again after 180 f', before === 0 && on > 10 && off === 0 && on2 > 10, [pd.t1, before, on, off, on2]);
      const other = G.podium.order.find((s) => s !== 0), op = [[128, 112], [92, 122], [164, 130], [206, 144]][G.podium.order.indexOf(other)];
      ok('podium: only my block shows a coin line', (() => { D.step(0); const d = cx.getImageData(op[0] - 16, op[1] + 19, 32, 10).data; for (let i = 0; i < d.length; i += 4) if (d[i] === 255 && d[i + 1] === 201 && d[i + 2] === 220) return false; return true; })());
      info('podium coin line from frame ' + pd.t1 + ' (hash ' + lineHash() + ')');
      // the screen-reader line (an online page's podium: staged)
      G.online = true; SH.pod(38, 20); const sr = $('pg-podium-sum').textContent;
      SH.pod(0, 0, true); const sr2 = $('pg-podium-sum').textContent;
      G.online = false;
      ok('podium: the screen-reader line ends ", 비누 코인 +38개, 오늘 첫 판 +20 포함" (practice: ", 연습 경기라 비누 코인은 없어요")', /, 비누 코인 \+38개, 오늘 첫 판 \+20 포함$/.test(sr) && /, 연습 경기라 비누 코인은 없어요$/.test(sr2), [sr, sr2]);
      D.setInvincible(false); D.toTitle();
    }
    // the fit (9.11): 1x, 2x and a 320 px phone (or this viewport)
    if (FIT_ONLY) { await cardAt('this viewport (' + innerWidth + 'x' + innerHeight + ')', innerHeight < 700); return; }
    setScale(1); await cardAt('1x (256x224)', true);
    setScale(2); await cardAt('2x (512x448)', false);
    window.dispatchEvent(new Event('touchstart'));
    setScale(278 / 256); await cardAt('320x568 phone (touch, 278x243)', true);
  }

  // ---------------------------------------------------------------- 10. the web fonts know every coin string
  function fontTests() {
    const warm = ($('pg-fontwarm').textContent || '');
    const strs = ['비누 코인', '+40', '상점에서 써요!', '첫 판 +20', '오늘은 반만 모여요', '1,234개', '이기든 지든 비누 코인을 받아요', '연습 경기라 비누 코인도 없어요', '+6']
      .concat(SH.items().map((it) => it.name + ' ' + it.desc))
      // (S3a / S3b: every visible line of the hub, the title button and the room's 꾸미기 - built ones with sample numbers)
      .concat(['상점', '마이페이지', '사기 160', '한 번 더 누르면 사요', '32개 더 모아요', '1,160개 더 모아요', '사기 1,200', '샀어요! 바로 썼어요 · 마이페이지에서 바꿀 수 있어요', '샀어요! 바로 했어요', '샀어요! 바로 켰어요',
        '이미 가지고 있어요', '게임을 하면 비누 코인이 모여요 · 이기든 지든, 혼자 해도!', '아이템을 골라 봐요', '이 브라우저에서는 저장되지 않아요', '보통 고급 희귀 전설 처음 선물',
        '머리 얼굴 목 등 효과', '쓰기 벗기 하기 빼기 켜기 끄기', '이름', '내 기록', '없음', '아직 없어요 · 상점에서 골라 봐요', '상점 가기', '꾸미기', '내 캐릭터', '닫기',
        '처음 선물: 초록 때타월 리본을 해 봐요', '오늘 첫 판 하면 코인 +25!', '3일 연속 · 내일 첫 판 +35', '345',
        // (review 2026-10-18: the taken-off messages, the 등 verbs, day 1, the first card's goal, a lost purchase)
        '벗었어요 뺐어요 껐어요', '두르기 둘렀어요 끼기 꼈어요 메기 멨어요 달기 떼기 달았어요 뗐어요', '두르고 있어요 끼고 있어요 메고 있어요 달고 있어요',
        '오늘 보너스 받았어요 · 내일 첫 판 +25', '60개 모으면 첫 아이템!', '다시 사 주세요',
        // (looks-per-animal.md 8: the per-animal lines, the six subjects, the pills)
        '샀어요! 꽥꽥이가 바로 썼어요 · 동물마다 따로 꾸며요', '냥냥이가 했어요 · 이제 동물마다 따로 꾸며요', '이제 동물마다 따로 꾸며요!'])
      .concat(D.chars().map((c) => SH.subj(c.id) + ' ' + c.name))
      .concat(D.tro.leagues().map((l) => l.name + ' 리그부터'));
    const miss = new Set();
    for (const s of strs) for (const ch of s) if (/[가-힣]/.test(ch) && warm.indexOf(ch) < 0) miss.add(ch);
    ok('fonts: every syllable of the coin texts and the catalog is in #pg-fontwarm', miss.size === 0, [...miss].join(''));
    const both = ['.pg-fw-sign', '.pg-fw-body'].every((q) => { const t = document.querySelector('#pg-fontwarm ' + q).textContent; return t.indexOf('황금 대야 투구') >= 0 && t.indexOf('오늘은 반만 모여요') >= 0; });
    ok('fonts: both web-font faces are warmed with the shop text', both);
  }

  // ---------------------------------------------------------------- 7. items in play (S2): anchors, composites, drawing
  const ANIMALS = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'];
  const MOVE = { duck: ['glide', 2], capy: ['slam', 1], otter: ['dash', 1], penguin: ['slide', 1], cat: ['flip', 1] };
  const animsOf = (c) => [['idle', 2], ['walk', 4], ['jump', 1], ['fall', 1], ['shoot', 1]].concat(MOVE[c] ? [MOVE[c]] : []);
  const HATS = 'h1 h2 h3 h4 h5 h6 h7 h8 h9 ha hb hc'.split(' '), FACES = 'f1 f2 f3 f4 f5 f6 f7'.split(' ');
  const NECKS = 'n1 n2 n3 n4 n5 n6 n7 n8'.split(' '), BACKS = 'b1 b2 b3 b4 b5 b6 b7'.split(' ');
  // a worn set from item ids ('h1', 'f2' -> '12000')
  const lkOf = (...ids) => { const k = ['0', '0', '0', '0', '0']; for (const id of ids) k['hfnbe'.indexOf(id[0])] = id[1]; return k.join(''); };
  // 12 sets that wear every one of the 34 items at least once
  const SETS = HATS.map((hh, i) => lkOf(hh, FACES[i % 7], NECKS[i % 8], BACKS[i % 7]));
  const itemC = new Map();
  const itemPx = (id, part) => { const k = id + ':' + part; if (!itemC.has(k)) itemC.set(k, SH.item(id, part)); return itemC.get(k); };
  const opq = (d, w, x, y) => x >= 0 && y >= 0 && x < w && y * w * 4 < d.length && d[(y * w + x) * 4 + 3] > 0;
  const topRow = (d, w) => { for (let i = 3; i < d.length; i += 4) if (d[i]) return ((i >> 2) / w) | 0; return 99; };
  const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const palRgb = (k) => hex(PG.PALETTE[k]);
  const sameRgb = (d, o, rgb) => d[o] === rgb[0] && d[o + 1] === rgb[1] && d[o + 2] === rgb[2];
  let ATW = null;
  const bodyC = new Map();
  const bodyPx = (name, fi, tw) => { const k = name + ':' + fi + ':' + (tw | 0); if (!bodyC.has(k)) bodyC.set(k, D.twinPixels(name, fi, tw | 0)); return bodyC.get(k); };
  // the reference composite of shop.md 6.2, rebuilt here from pixels (the resolved anchors, each item's art and pivot,
  // the - twin - body): a 등 item behind (B / a tube's back half at W), the body, the hat's hide box cleared, a tube's
  // front half, 목 at N, 얼굴 at E (front faces: frame 1), 머리 at H. from[] says who owns each pixel (0 none, 1 body,
  // 2 hat, 3 face, 4 neck, 5 back); clip counts item pixels that would fall outside the 24x24 box
  function refComp(c, anim, fi, lk, tw) {
    if (!ATW) { ATW = {}; for (const it of SH.items()) ATW[it.id] = it.at === 'W'; }
    const name = c + '_' + anim, A = SH.anchors(name, fi), body = bodyPx(name, fi, tw | 0);
    const out = new Uint8ClampedArray(24 * 24 * 4), from = new Uint8Array(24 * 24); let clip = 0;
    const set = (x, y, d, o, who) => { if (x < 0 || y < 0 || x >= 24 || y >= 24) { clip++; return; } const k = (y * 24 + x) * 4; for (let j = 0; j < 4; j++) out[k + j] = d[o + j]; from[y * 24 + x] = who; };
    const put = (id, part, P) => { const it = P ? itemPx(id, part) : null; if (!it) return; for (let y = 0; y < it.h; y++) for (let x = 0; x < it.w; x++) { const o = (y * it.w + x) * 4; if (it.d[o + 3]) set(4 + P[0] - it.px + x, 8 + P[1] - it.py + y, it.d, o, 'hfnb'.indexOf(id[0]) + 2); } };
    const id = (i) => (lk[i] !== '0' ? 'hfnb'[i] + lk[i] : ''), back = id(3), tube = !!back && ATW[back];
    if (back) put(back, 0, tube ? A.W : A.B);
    for (let y = 0; y < body.height; y++) for (let x = 0; x < body.width; x++) { const o = (y * body.width + x) * 4; if (body.data[o + 3]) set(4 + x, 8 + y, body.data, o, 1); }
    if (id(0) && A.hide && A.H) for (let y = A.hide[1]; y <= A.hide[3]; y++) for (let x = A.hide[0]; x <= A.hide[2]; x++) if (x + 4 >= 0 && y + 8 >= 0 && x + 4 < 24 && y + 8 < 24) set(4 + x, 8 + y, [0, 0, 0, 0], 0, 0);
    if (tube) put(back, 1, A.W);
    if (id(2)) put(id(2), 0, A.N);
    if (id(1)) put(id(1), A.face === 'f' ? 1 : 0, A.E);
    if (id(0)) put(id(0), 0, A.H);
    return { d: out, from, clip };
  }
  // the canvas, read once
  const grab = () => $('pg-canvas').getContext('2d').getImageData(0, 0, 256, 224).data;
  // comp (24x24 RGBA) drawn unscaled with its top-left at (X, Y), mirrored when flip: the opaque pixels that differ
  function offBy(img, comp, X, Y, flip) {
    let bad = 0;
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
      const o = (i * 24 + j) * 4; if (!comp[o + 3]) continue;
      const x = X + (flip ? 23 - j : j), y = Y + i, q = (y * 256 + x) * 4;
      if (x < 0 || y < 0 || x >= 256 || y >= 224 || img[q] !== comp[o] || img[q + 1] !== comp[o + 1] || img[q + 2] !== comp[o + 2]) bad++;
    }
    return bad;
  }
  // a solo game of animal c with player 1 wearing lk (dressed: the store is not touched) standing at (120, 96) on a
  // quiet screen (no enemies, bubbles, particles, blink or squash)
  function stage(c, lk) {
    D.start(0, c); D.setInvincible(true); D.step(2);
    G.enemies = []; G.bubbles = []; G.parts = []; G.kfx = []; G.pops = []; G.words = []; G.shake = 0;
    const p = G.players[0]; SH.dress(0, lk);
    Object.assign(p, { x: 120, y: 96, vx: 0, vy: 0, onGround: true, facing: 1, invuln: 0, sq: 0, shootAnim: 0, water: false, mvA: false, mvB: false, stunT: 0, shield: 0 });
    if (p.fx) p.fx.sq = 0;
    return p;
  }
  function renderTests() {
    // a. the composites, exactly
    let n = 0; const bad = [], clipped = [];
    for (const c of ANIMALS) for (const [anim, nf] of animsOf(c)) for (let fi = 0; fi < nf; fi++) {
      for (const [lk, tw] of SETS.map((s) => [s, 0]).concat([[SETS[0], 1], [SETS[5], 2], [SETS[11], 3]])) {
        const ref = refComp(c, anim, fi, lk, tw), got = SH.pixels(c, anim, fi, lk, tw); n++;
        if (ref.clip) clipped.push([c, anim, fi, lk, ref.clip]);
        if (!got || got.w !== 24 || got.d.length !== ref.d.length || got.d.some((v, i) => v !== ref.d[i])) bad.push([c, anim, fi, lk, tw, got && got.w]);
      }
    }
    ok('composite: ' + n + ' composites (6 animals x every anchored frame x 12 sets wearing all 34 items, + twins) equal the reference - the 6.2 order, the hide box, the front-face frame', !bad.length, bad.slice(0, 6));
    ok('composite: no item pixel leaves the 24x24 box (nothing below the feet line, <= 4 px aside, <= 8 px above)', !clipped.length, clipped.slice(0, 6));
    // b. the anchors on the art (every anchored frame): H and the pixel under it on the body, E inside the head's box,
    //    N and W on the body, B within 1 px of it; idle / walk / jump / fall / shoot follow the frame's own top row (+-1)
    const anch = [];
    for (const c of ANIMALS) {
      const A0 = SH.anchors(c + '_idle', 0), top0 = topRow(bodyPx(c + '_idle', 0, 0).data, 16);
      for (const [anim, nf] of animsOf(c)) for (let fi = 0; fi < nf; fi++) {
        const name = c + '_' + anim, A = SH.anchors(name, fi), b = bodyPx(name, fi, 0), d = b.data, w = b.width, why = [];
        if (!A || !A.H || !A.E || !A.N) { anch.push([name, fi, 'missing']); continue; }
        if (!opq(d, w, A.H[0], A.H[1]) || !opq(d, w, A.H[0], A.H[1] + 1)) why.push('H');
        if (!opq(d, w, A.N[0], A.N[1])) why.push('N');
        let l = 99, r = -1, t = 99; for (let y = 0; y <= A.N[1]; y++) for (let x = 0; x < w; x++) if (opq(d, w, x, y)) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); }
        if (A.E[0] < l || A.E[0] > r || A.E[1] < t || A.E[1] > A.N[1]) why.push('E');
        if (A.W && !opq(d, w, A.W[0], A.W[1])) why.push('W');
        if (A.B && ![-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => opq(d, w, A.B[0] + dx, A.B[1] + dy)))) why.push('B');
        if (!MOVE[c] || anim !== MOVE[c][0]) { const dh = (A.H[1] - A0.H[1]) - (topRow(d, w) - top0); if (Math.abs(dh) > 1) why.push('moves ' + dh); }
        if (why.length) anch.push([name, fi, why.join(' ')]);
      }
    }
    ok('anchors: H (and the pixel under it), N, W on the body, B at its edge, E in the head; they move with each frame\'s own head rows (+-1)', !anch.length, anch.slice(0, 8));
    // (exactly: H.y moves as the head's top FILL row does - the top non-ink pixel in the 5 columns round H; the ink
    // outline is clipped at the frame's row 0 - idle 1 one lower, walk 1 / 3 one higher; the otter's idle has no bob)
    const ink = palRgb('k');
    const headTopRow = (name, fi) => { const A = SH.anchors(name, fi), d = bodyPx(name, fi, 0).data; for (let y = 0; y < 16; y++) for (let x = A.H[0] - 2; x <= A.H[0] + 2; x++) if (opq(d, 16, x, y) && !sameRgb(d, (y * 16 + x) * 4, ink)) return y; return 99; };
    const idle = ANIMALS.map((c) => [['idle', 1], ['walk', 1], ['walk', 3]].map(([a, fi]) => [SH.anchors(c + '_' + a, fi).H[1] - SH.anchors(c + '_idle', 0).H[1],
      headTopRow(c + '_' + a, fi) - headTopRow(c + '_idle', 0)]));
    ok('anchors: idle 1 / walk 1 / walk 3 move H exactly as the head\'s top fill row moves (one lower / one higher; the otter\'s idle does not bob)',
      idle.every((v) => v.every(([a, b]) => a === b)) && idle[0][0][0] === 1 && idle[0][1][0] === -1, idle);
    // c. hat heights and lookLift (6.3, 6.6)
    const tall = [], lifts = [];
    for (const c of ANIMALS) for (const hh of HATS) {
      const lk = lkOf(hh), reach = SH.reach(c, lk), top = topRow(SH.pixels(c, 'idle', 0, lk).d, 24);
      if (reach > 6 || reach !== 8 - top) tall.push([c, hh, reach, top]);
      if (SH.lift(c, lk) !== Math.max(0, 8 - top - 1)) lifts.push([c, hh, SH.lift(c, lk), top]);
    }
    ok('hats: every hat rises <= 6 px above the frame top in idle 0, on every animal', !tall.length, tall.slice(0, 6));
    ok('lookLift: px above the frame top in idle 0 - 1, floored at 0 (every hat x animal); bare 0', !lifts.length && SH.lift('duck', '00000') === 0 && SH.lift('duck', lkOf('f2', 'n3')) === 0, lifts.slice(0, 6));
    info('lookLift by hat on the duck: ' + HATS.map((hh) => hh + ' ' + SH.lift('duck', lkOf(hh))).join(', '));
    // d. the curled poses wear no 등 item (B / W hidden); e. the capy's yuzu (and the cat's ears) cleared under a hat
    const curl = [['capy', 'slam'], ['cat', 'flip']].map(([c, a]) => { const A = SH.anchors(c + '_' + a, 0); const w1 = SH.pixels(c, a, 0, lkOf('h1', 'b1')), w0 = SH.pixels(c, a, 0, lkOf('h1')), w2 = SH.pixels(c, a, 0, lkOf('h1', 'b2'));
      return A.B === null && A.W === null && same(w1.d, w0.d) && same(w2.d, w0.d); });
    ok('curled poses: capy_slam / cat_flip have no B / W - a cape or a tube adds nothing there', curl.every(Boolean), curl);
    const yuzu = [], gone = { capy: 0, cat: 0 };
    for (const c of ['capy', 'cat']) for (const hh of HATS) for (const [anim, nf] of animsOf(c)) for (let fi = 0; fi < nf; fi++) {
      const A = SH.anchors(c + '_' + anim, fi); if (!A.hide) continue;
      const lk = lkOf(hh), ref = refComp(c, anim, fi, lk, 0), got = SH.pixels(c, anim, fi, lk), body = bodyPx(c + '_' + anim, fi, 0);
      let left = 0;
      for (let y = A.hide[1]; y <= A.hide[3]; y++) for (let x = A.hide[0]; x <= A.hide[2]; x++) {
        if (x < 0 || y < 0 || x > 15 || !opq(body.data, 16, x, y)) continue;
        const k = (y + 8) * 24 + x + 4; if (ref.from[k] === 2) continue;
        if (got.d[k * 4 + 3]) left++; else gone[c]++;
      }
      if (left) yuzu.push([c, hh, anim, fi, left]);
    }
    ok('hide: under every hat the capy\'s yuzu and the cat\'s ears are gone in every frame - what the hat does not cover is clear', !yuzu.length && gone.capy > 0 && gone.cat > 0, [yuzu.slice(0, 6), gone]);
    // f. the frames that wear nothing
    const none = ANIMALS.every((c) => [0, 1, 2, 3].every((k) => SH.frame(c, 'die', k, SETS[0]) === null) && SH.frame(c, 'trapped', 0, SETS[0]) === null && SH.frame(c, 'ghost', 1, SETS[0]) === null && SH.anchors('life_' + c, 0) === null && SH.anchors('portrait_' + c, 0) === null);
    ok('bare frames: the die tumble, the trapped and ghost bubbles, the life icons have no anchors and wear nothing', none);
    ok('frame(): a set with nothing worn draws the frame itself (no composite)', SH.frame('duck', 'idle', 0, '00000') === null && SH.frame('duck', 'idle', 0, lkOf('e6')) === null && !!SH.frame('duck', 'idle', 0, lkOf('n1')));
    // g. the real drawing path: the composite lands where the bare frame did (x - 4, y - 8), mirrored when facing left
    const spots = [];
    for (const c of ANIMALS) for (const facing of [1, -1]) {
      const lk = SETS[ANIMALS.indexOf(c) * 2], p = stage(c, lk); p.facing = facing; D.step(0);
      const fi = (G.frame / 30) | 0, comp = SH.pixels(c, 'idle', fi, lk).d, off = offBy(grab(), comp, p.x - 4, p.y - 8, facing < 0);
      if (off) spots.push([c, facing, off]);
    }
    ok('drawing: every animal\'s composite is drawn at exactly (x - 4, y - 8) - the bare frame\'s spot - and mirrored when it faces left', !spots.length, spots);
    // h. squashed (+-0.32 about the feet): the hat (h2: cyan) stays on the head - above the body's top row, over its columns
    const sq = [];
    for (const s of [0.32, -0.32]) {
      const p = stage('duck', lkOf('h2')); p.sq = s; D.step(0);
      const img = grab(), C1 = palRgb('C'), C2 = palRgb('c'), YY = palRgb('Y');
      let hT = 999, hB = -1, hL = 999, hR = -1, bT = 999, bL = 999, bR = -1;
      for (let y = p.y - 24; y < p.y + 17; y++) for (let x = p.x - 12; x < p.x + 28; x++) {
        const o = (y * 256 + x) * 4;
        if (sameRgb(img, o, C1) || sameRgb(img, o, C2)) { hT = Math.min(hT, y); hB = Math.max(hB, y); hL = Math.min(hL, x); hR = Math.max(hR, x); }
        if (sameRgb(img, o, YY)) { bT = Math.min(bT, y); bL = Math.min(bL, x); bR = Math.max(bR, x); }
      }
      if (!(hB >= 0 && hT < bT && hB <= bT + 2 && hL >= bL - 4 && hR <= bR + 4)) sq.push([s, { hT, hB, hL, hR, bT, bL, bR }]);
    }
    ok('squash: at sq +0.32 and -0.32 the hat stays on the head (above the body\'s top row, within 2 rows of it, over its columns)', !sq.length, sq);
    // i. the penguin slide: drawn 3 px lower, the hat on its head
    {
      const lk = lkOf('h5', 'f5'), p = stage('penguin', lk); p.mvA = true; D.step(0);
      const off = offBy(grab(), SH.pixels('penguin', 'slide', 0, lk).d, p.x - 4, p.y + 3 - 8, false);
      ok('penguin slide: drawn 3 px lower (the belly on the floor) with the hat on its head', off === 0, off);
      p.mvA = false;
    }
    // j. headTop and the marks above the head
    {
      const lk = lkOf('hc'), p = stage('duck', lk), lift = SH.lift('duck', lk);
      ok('headTop(p) = p.y - lookLift (the 황금 대야 on a duck lifts by ' + lift + ')', lift > 0 && SH.headTop(0) === p.y - lift, [SH.headTop(0), p.y, lift]);
      SH.bare(true); const ht0 = SH.headTop(0); SH.bare(false);
      ok('headTop: bare(true) puts it back on p.y', ht0 === p.y, ht0);
      // the tag pointer (5x3 at headTop - 5 .. headTop - 3, columns x + 6 .. x + 10) never covers a hat pixel in idle
      const hits = [];
      for (const c of ANIMALS) for (const hh of HATS) {
        const k = lkOf(hh), L = SH.lift(c, k);
        for (const fi of [0, 1]) { const d = SH.pixels(c, 'idle', fi, k).d; for (let y = 3 - L; y <= 5 - L; y++) for (let x = 10; x <= 14; x++) if (opq(d, 24, x, y)) hits.push([c, hh, fi, x, y]); }
      }
      ok('tag pointer: never over a hat pixel in idle 0 / 1 (every hat x animal)', !hits.length, hits.slice(0, 6));
      // the stun stars orbit headTop + 1 (they rise with the hat)
      p.stunT = 30; G.frame += 8 - (G.frame & 7); D.step(0);
      const img = grab(), ht = SH.headTop(0), star = [0, 1, 2].map((i) => { const a = G.frame * 0.15 + i * (Math.PI * 2 / 3), x = Math.round(p.x + 8 + Math.cos(a) * 7), y = Math.round(ht + 1 + Math.sin(a) * 7 * 0.35), o = (y * 256 + x) * 4; return sameRgb(img, o, i & 1 ? [255, 255, 255] : [255, 227, 107]); });
      ok('stun stars: drawn round headTop + 1 - lifted with the hat', star.every(Boolean), star);
      p.stunT = 0;
    }
    // the tag pointer over a hat in a real 2-player battle: right under where it should be, the hat's top row under it
    {
      L.battle([{ char: 'duck', look: lkOf('hc'), nick: 'P1' }, { char: 'cat', nick: 'P2' }], { arena: 0, countdown: false, monsters: false, intrusion: false });
      D.setInvincible(true); D.step(40); G.parts = []; for (const q of G.players) { q.invuln = 0; q.sq = 0; }
      const p = G.players[0]; p.vx = 0; p.onGround = true; D.step(0);
      const img = grab(), ht = SH.headTop(0), ax = Math.round(p.x + 8 - 2.5), ay = Math.round(ht - 5), slot = hex(D.slotColors()[0]);
      const row = [0, 1, 2, 3, 4].every((k) => sameRgb(img, (ay * 256 + ax + k) * 4, slot)), tip = sameRgb(img, ((ay + 2) * 256 + ax + 2) * 4, slot);
      const top = Math.round(p.y) - 8 + topRow(SH.pixels('duck', 'idle', (G.frame / 30) | 0, lkOf('hc')).d, 24);
      ok('tag pointer: drawn at headTop - 5 over the hat (its tip row ' + (ay + 2) + ', the hat\'s top row ' + top + ': a 1 px gap)', row && tip && ay + 2 < top - 1, [row, tip, ay, top]);
    }
    // the podium crown: 1 px above a hat (the winner, untinted crown; a capy: none of the crown's colours in its body)
    {
      L.battle([{ char: 'capy', look: lkOf('h1'), nick: 'P1' }, { char: 'cat', nick: 'P2' }, { char: 'frog', nick: 'P3' }], { arena: 0, countdown: false, monsters: false, intrusion: false });
      D.setInvincible(true); D.step(10); G.players.forEach((q, k) => { q.score = [3000, 1000, 500][k]; });
      D.endBattle(); let p = G.players[0], k = 0;
      do { D.step(1); k++; } while (k < 400 && !(p.onGround && Math.abs(p.y - Math.round(p.y)) < 1e-6 && G.podium.t > 30));
      G.parts = []; D.step(0);
      const img = grab(), crown = ['Y', 'L', 'y', 'R'].map(palRgb), hat = ['P', 'p', 'q'].map(palRgb);
      let cB = -1, hT = 999;
      for (let y = Math.round(p.y) - 30; y < Math.round(p.y) + 4; y++) for (let x = Math.round(p.x) + 2; x < Math.round(p.x) + 14; x++) {
        const o = (y * 256 + x) * 4;
        if (crown.some((rgb) => sameRgb(img, o, rgb))) cB = Math.max(cB, y);
        if (hat.some((rgb) => sameRgb(img, o, rgb))) hT = Math.min(hT, y);
      }
      ok('podium crown: above the hat with a 1 px gap (its fill ends 2 rows above the hat\'s ink top)', cB >= 0 && hT < 999 && cB <= hT - 3, [cB, hT, p.y, SH.reach('capy', lkOf('h1'))]);
    }
    // k. a twin wearing the 바가지 모자 (Y y L): its body pink, the hat still yellow, one slot ring round both
    {
      L.battle([{ char: 'duck', nick: 'P1' }, { char: 'duck', look: lkOf('h5'), nick: 'P2' }], { arena: 0, countdown: false, monsters: false, intrusion: false });
      D.setInvincible(true); D.step(40); G.parts = []; for (const q of G.players) { q.invuln = 0; q.sq = 0; }
      const p = G.players[1]; p.vx = 0; p.onGround = true; p.facing = 1; p.x = Math.round(p.x); p.y = Math.round(p.y); D.step(0);
      const fi = (G.frame / 30) | 0, lk = lkOf('h5'), ref = refComp('duck', 'idle', fi, lk, 1), img = grab(), X = p.x - 4, Y = p.y - 8;
      const drawn = offBy(img, ref.d, X, Y, false);
      let hatY = 0, bodyY = 0, bodyPink = 0;
      for (let k = 0; k < 576; k++) { const o = k * 4; if (!ref.d[o + 3]) continue; if (ref.from[k] === 2 && sameRgb(ref.d, o, palRgb('Y'))) hatY++; if (ref.from[k] === 1 && sameRgb(ref.d, o, palRgb('Y'))) bodyY++; if (ref.from[k] === 1 && sameRgb(ref.d, o, hex('#f6a6bd'))) bodyPink++; }
      ok('twin + hat: the 2P duck is drawn pink with the hat\'s yellow kept (items are never recoloured)', p.twin && drawn === 0 && hatY > 0 && bodyY === 0 && bodyPink > 0, [p.twin, drawn, hatY, bodyY, bodyPink]);
      // the ring above the hat's top row (a column away from the pointer's tip)
      const tipX = Math.round(p.x + 8 - 2.5) + 2; let ring = null;
      for (let i = 0; i < 24 && !ring; i++) for (let j = 0; j < 24; j++) if (ref.d[(i * 24 + j) * 4 + 3] && X + j !== tipX) { ring = [X + j, Y + i]; break; }
      const up1 = sameRgb(img, ((ring[1] - 1) * 256 + ring[0]) * 4, hex(D.slotColors()[1])), up2 = sameRgb(img, ((ring[1] - 2) * 256 + ring[0]) * 4, hex('#1c1530'));
      ok('twin + hat: the slot ring wraps the hat - 1 px above its top row the slot colour, 2 px above SLOT_INK', up1 && up2, [ring, up1, up2]);
    }
    // l. bare(true): today's exact pixels (a 4-player battle dressed and drawn bare = the same battle with nothing worn)
    {
      const scene = (looks) => {
        D.seed(11); G.frame = 0;
        L.battle(['duck', 'duck', 'cat', 'frog'].map((c, k) => ({ char: c, look: looks[k], nick: 'P' + (k + 1) })), { arena: 1, countdown: false, monsters: false, intrusion: false });
        G.wisps = []; G.kfx = []; G.parts = []; G.pops = []; G.words = []; G.shake = 0; // (cosmetic leftovers of the last scene)
        D.setInvincible(true); for (let s = 0; s < 4; s++) D.press(s & 1 ? 'left' : 'right', true, s);
        D.step(90); for (let s = 0; s < 4; s++) D.press(s & 1 ? 'left' : 'right', false, s);
        for (const q of G.players) q.invuln = 0; G.parts = []; D.step(0);
        const d = grab(); let hh = 0; for (let i = 0; i < d.length; i += 7) hh = (Math.imul(hh, 31) + d[i]) | 0; return hh;
      };
      const plain = scene(['00000', '00000', '00000', '00000']), plain2 = scene(['00000', '00000', '00000', '00000']);
      const worn = scene([SETS[0], SETS[4], SETS[8], SETS[11]]);
      SH.bare(true); const bare = scene([SETS[0], SETS[4], SETS[8], SETS[11]]); SH.bare(false);
      ok('bare(true): a dressed battle draws exactly like the same battle wearing nothing (and differs when worn)', bare === plain && plain2 === plain && worn !== plain, [plain, plain2, worn, bare]);
    }
  }
  // m. whose set (looks-per-animal.md 3): the demo wears my pick's set, solo the animal played's, 한 판 더 keeps the
  // match's looks, each picker bust its own animal's set
  async function wearTests() {
    const ANIS = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'], sel0 = G.sel;
    const pickBtn = (c) => document.querySelector('#pg-pick .pg-pick-btn[data-char="' + c + '"]');
    D.toTitle(); await sleep(30); pickBtn('duck').click(); await sleep(20);
    fresh(20261021); SH.give(400); SH.buy('h1', 'duck'); SH.buy('n2', 'duck'); SH.wear('h', 'h1', 'cat');
    const lk = SH.look('duck');
    D.toTitle(); await sleep(30);
    ok('demo: the title\'s attract animal wears my pick\'s (the duck\'s) set', lk === lkOf('h1', 'n2') && G.players[0].char === 'duck' && G.players[0].look === lk, [lk, G.players[0].look]);
    const art = (c) => { const cv = pickBtn(c).querySelector('canvas.pg-pick-art'); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let hh = 0; for (let i = 0; i < d.length; i++) hh = (Math.imul(hh, 31) + d[i]) | 0; return hh; };
    const a1 = ANIS.map(art); SH.wear('h', null, 'duck'); const a0 = ANIS.map(art);
    ok('picker: each bust wears its own animal\'s set - the duck\'s hat off changes the duck\'s bust only (and the demo)', a1[0] !== a0[0] && ANIS.every((c, i) => !i || a1[i] === a0[i]) && G.players[0].look === lkOf('n2'), [a1, a0, G.players[0].look]);
    SH.wear('n', 'n2', 'cat'); const a2 = ANIS.map(art);
    ok('picker: ... dressing the cat changes the cat\'s bust only (the demo, still the duck, does not)', a2[4] !== a0[4] && ANIS.every((c, i) => i === 4 || a2[i] === a0[i]) && G.players[0].look === lkOf('n2'), [a0, a2]);
    pickBtn('cat').click(); await sleep(20);
    ok('demo: picking the cat - the demo wears the cat\'s set (h1 + n2)', G.sel === 'cat' && G.players[0].char === 'cat' && G.players[0].look === lkOf('h1', 'n2'), [G.sel, G.players[0].char, G.players[0].look]);
    const pr = SH.portrait('duck', lkOf('h9')), pb = SH.portrait('duck', '00000');
    ok('portrait: a tall hat drops the bust (dy <= 8) so the whole hat shows - its top row is inside the 32x32 box', !!pr && !!pb && topRow(pr.d, 32) >= 0 && topRow(pr.d, 32) < 99 && !same(pr.d, pb.d));
    D.start(0, 'cat');
    ok('solo: the animal played (the cat) wears its own set (h1 + n2; the duck has n2 only)', G.players[0].char === 'cat' && G.players[0].look === lkOf('h1', 'n2') && SH.look('duck') === lkOf('n2'), G.players[0].look);
    SH.wear('h', null, 'cat');
    ok('solo: a change mid-game waits for the next game (looks are frozen at the start)', G.players[0].look === lkOf('h1', 'n2'));
    L.battle([{ char: 'duck', look: lkOf('h3'), nick: 'P1' }, { char: 'cat', look: lkOf('f4', 'b5'), nick: 'P2' }], { arena: 0, countdown: false, monsters: false, intrusion: false });
    D.rematch();
    ok('한 판 더: the match\'s looks carry over', G.players[0].look === lkOf('h3') && G.players[1].look === lkOf('f4', 'b5'), G.players.map((q) => q.look));
    D.toTitle(); await sleep(30); if (pickBtn(sel0)) pickBtn(sel0).click();
  }

  // ---------------------------------------------------------------- 8. the effects (6.7)
  function fxTests() {
    const fxp = () => G.parts.filter((q) => q.lf);
    const walk = (p, frames, dir) => { D.press(dir || 'right', true, 0); const seen = []; for (let k = 0; k < frames; k++) { D.step(1); for (const q of G.parts) if (q.lf && q.life === q.max) seen.push({ x: q.x, y: q.y, px: p.x, py: p.y, f: p.facing, c: q.c, lf: q.lf }); } D.press(dir || 'right', false, 0); return seen; };
    // e6: walking - a still dot every 6 f at the heel, the rainbow in order, fading over 24 f
    let p = stage('duck', lkOf('e6')); p.onGround = false; D.step(30);
    const s6 = walk(p, 60);
    const heel = s6.every((s) => s.x === s.px + 8 - 6 * s.f && s.y === s.py + 15 && Math.abs(s.x - (s.px + 8)) === 6);
    const rain = ['R', 'O', 'Y', 't', 'b', 'v'].map((k) => PG.PALETTE[k]), inOrder = s6.every((s, i) => s.c === rain[(rain.indexOf(s6[0].c) + i) % 6]);
    ok('e6: walking leaves a dot every 6 f at the heel (x + 8 - 6 x facing, y + 15 - never under the body\'s centre column), R O Y t b v in turn', s6.length >= 8 && s6.length <= 11 && heel && inOrder, [s6.length, heel, inOrder, s6[0]]);
    ok('e6: the dots do not move and fade over 24 f', fxp().every((q) => q.vx === 0 && q.vy === 0 && q.g === 0 && q.fd === 24 && q.max === 24));
    const s6l = walk(p, 30, 'left');
    ok('e6: facing left, the heel is on the right (x + 14)', s6l.length > 0 && s6l.every((s) => s.f < 0 && s.x === s.px + 14), s6l.slice(0, 2));
    // e4: walking - every 14 f a 2 px bubble behind the feet, rising
    p = stage('duck', lkOf('e4')); D.step(10);
    const s4 = walk(p, 70);
    ok('e4: walking blows a 2 px bubble behind the feet every 14 f (5 in 70 f)', s4.length === 5 && s4.every((s) => s.x === s.px + 7 - 6 * s.f && s.y === s.py + 12), [s4.length, s4[0]]);
    const b4 = fxp()[0], y4 = b4 ? b4.y : 0; D.step(10);
    ok('e4: ... rising a steady 0.25 px/f (the damping held by its g)', !!b4 && Math.abs((y4 - b4.y) - 2.5) < 0.05, b4 && y4 - b4.y);
    // e1: standing still >= 30 f - a puff from the head every 24 f
    p = stage('duck', lkOf('e1')); G.parts = [];
    const s1 = []; for (let k = 0; k < 100; k++) { D.step(1); for (const q of G.parts) if (q.lf === '1' && q.life === q.max) s1.push(G.frame); }
    ok('e1: standing still, the steam starts after 30 f and puffs every 24 f', s1.length >= 3 && s1.length <= 4 && s1.every((f, i) => !i || f - s1[i - 1] === 24), s1);
    const pf = fxp()[0];
    ok('e1: the puff starts above the head (headTop) and rises', !!pf && pf.y < p.y && pf.vy < 0 && pf.sz === 2, pf);
    // e2: a landing after vy > 1.5 - 4 droplets; e3: a take-off with vy < -1 - 3 sparkles
    p = stage('duck', lkOf('e2')); p.onGround = false; p.y = 60; p.vy = 0; G.parts = [];
    let landed = 0; for (let k = 0; k < 120 && !landed; k++) { D.step(1); landed = fxp().length; }
    ok('e2: landing from a fall drops 4 droplets (white / pale cyan) sideways', landed === 4 && fxp().every((q) => (q.c === '#ffffff' || q.c === '#c8f4ff') && q.vx !== 0), [landed, fxp()[0]]);
    G.parts = []; D.press('jump', true, 0); D.step(1); D.press('jump', false, 0); D.step(4); const j2 = fxp().length;
    ok('e2: a take-off drops nothing', j2 === 0, j2);
    p = stage('duck', lkOf('e3')); p.onGround = false;
    for (let k = 0; k < 200 && !p.onGround; k++) D.step(1);   // (down onto a real floor first)
    D.step(4); G.parts = [];
    D.press('jump', true, 0); D.step(1); D.press('jump', false, 0); D.step(2);
    const sp = fxp();
    ok('e3: a jump\'s take-off throws 3 sparkles (pink / lilac) that drift down', sp.length === 3 && sp.every((q) => (q.c === '#ffc9dc' || q.c === '#d9c8ff') && q.vy > 0), sp.map((q) => q.c));
    // e5: the score jumps >= 500 in a frame - 2 hearts from the head (kfx 'heart'); 499 does nothing
    p = stage('duck', lkOf('e5')); D.step(2); G.kfx = [];
    p.score += 499; D.step(1); const h0 = G.kfx.length;
    p.score += 500; D.step(1); const hs = G.kfx.filter((o) => o.k === 'heart');
    ok('e5: a score jump of 500 sends up 2 hearts from the head; 499 none', h0 === 0 && hs.length === 2 && hs.every((o) => o.y <= SH.headTop(0) && o.col === '#ff8fb1' && o.dur === 20), [h0, hs]);
    // reduced motion: no effect particles at all (the art still shows)
    CALM = true;
    p = stage('duck', lkOf('h1', 'e6')); D.step(4); G.parts = []; G.kfx = [];
    walk(p, 40); p.score += 900; D.step(2);
    const calm = fxp().length + G.kfx.length;
    Object.assign(p, { x: Math.round(p.x), y: Math.round(p.y), vx: 0, onGround: true, sq: 0, invuln: 0, shootAnim: 0 }); G.parts = []; D.step(0);
    const off = offBy(grab(), SH.pixels('duck', 'idle', (G.frame / 30) | 0, lkOf('h1', 'e6')).d, p.x - 4, p.y - 8, p.facing < 0);
    CALM = false;
    ok('reduced motion: walking with e6 and a 900-point jump spawn no effect particle and no heart', calm === 0, calm);
    ok('reduced motion: the items still show (the hat drawn as always)', off === 0, off);
    // the budget: 4 players walking with e6 / e4 over a screen already full of particles never push past 200 (multi)
    L.battle([{ char: 'duck', look: lkOf('e6') }, { char: 'cat', look: lkOf('e4') }, { char: 'frog', look: lkOf('e6') }, { char: 'otter', look: lkOf('e4') }], { arena: 0, countdown: false, monsters: false, intrusion: false });
    D.setInvincible(true); D.step(60);
    // (every push onto G.parts is watched: an effect particle may only go in while fewer than 200 are on screen - other
    // systems keep their own caps, e.g. a landing's dust)
    for (let i = 0; i < 186; i++) G.parts.push({ x: 2, y: 30, vx: 0, vy: 0, g: 0, life: 900, max: 900, c: '#000000', sz: 1 });
    let mx = 0, made = 0, over = 0, mxFx = 0;
    const push0 = Array.prototype.push;
    // eslint-disable-next-line no-extend-native
    Array.prototype.push = function (...a) { if (this === G.parts) for (const q of a) if (q && q.lf) { made++; if (this.length >= 200) over++; } return push0.apply(this, a); };
    try {
      for (let k = 0; k < 600; k++) {
        if (k % 120 === 0) for (let s = 0; s < 4; s++) { D.press(((k / 120) | 0) & 1 ? 'left' : 'right', true, s); D.press(((k / 120) | 0) & 1 ? 'right' : 'left', false, s); }
        D.step(1); mx = Math.max(mx, G.parts.length); mxFx = Math.max(mxFx, G.parts.filter((q) => q.lf).length);
      }
    } finally { Array.prototype.push = push0; }
    for (let s = 0; s < 4; s++) { D.press('left', false, s); D.press('right', false, s); }
    ok('budget: 4 players with e6 / e4 walking 600 f over a full screen - no effect particle ever goes in at 200 or more (multiplayer cap)', over === 0 && made > 0, [over, made, mx]);
    info('budget: ' + made + ' effect particles in 600 f, at most ' + mxFx + ' alive (G.parts peaked at ' + mx + ')');
    D.setInvincible(false); D.toTitle();
  }
  // frame cost (real time, ?perf=1): a 4-player battle, update + render of 600 frames, best of 5, ms per frame
  function perf(looks) {
    let best = 1e9;
    for (let k = 0; k < 5; k++) {
      D.seed(77 + k); G.frame = 0;
      L.battle(['duck', 'capy', 'frog', 'penguin'].map((c, s) => ({ char: c, look: looks[s], nick: 'P' + (s + 1) })), { arena: k % 4, intrusion: false });
      D.setInvincible(true);
      for (let s = 0; s < 4; s++) D.press(k & 1 ? 'right' : 'left', true, s);
      const t0 = performance.now();
      for (let f = 0; f < 600; f++) { D.step(1); if (f % 40 === 0) for (let s = 0; s < 4; s++) { D.press('jump', true, s); D.press('shoot', f % 80 === 0, s); } else if (f % 40 === 2) for (let s = 0; s < 4; s++) D.press('jump', false, s); }
      best = Math.min(best, (performance.now() - t0) / 600);
      for (let s = 0; s < 4; s++) for (const a of ['left', 'right', 'jump', 'shoot']) D.press(a, false, s);
    }
    D.setInvincible(false);
    return Math.round(best * 1000) / 1000;
  }

  // ---------------------------------------------------------------- 6. / 9. the hub (S3a / S3b): the title's 상점 button and
  // its dot, the 상점 (first visit, opening selection, the armed buy, poor / locked / read-only, the verbs, the cells), the
  // keys, the badge -> 마이페이지 (equipment, grid, notes, the name field), 내 기록 there and back, the preview
  const btnK = () => $('pg-shop-buy').dataset.k;
  const btnT = () => $('pg-shop-buy').textContent;
  // (looks-per-animal.md 8: the hub's messages name the animal dressed - my pick unless the hub was moved on)
  const SJ = (c) => SH.subj(c || G.sel);
  const cell = (id) => document.querySelector('#pg-hub .pg-hub-pane:not([hidden]) [role="option"][data-id="' + id + '"]');
  const ink = (cv) => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; };
  async function hubTests() {
    // the title: the button at the end of the start row, its icon, the NEW dot for a store that never opened the 상점
    // (as on a new page load: earlier groups may have lit the dot on the title - an opening of only 마이페이지 keeps it)
    SH.pageLoad(); fresh(20261020); SH.set({ ce: 0, sh: 0 }); D.toTitle(); await sleep(80);
    const btn = $('pg-shop-btn'), row = btn.parentNode;
    ok('title: the 상점 button ends the start row (혼자 하기 · 친구와 하기 · 상점), its 8x8 basket painted', row.children[0].id === 'pg-start' && row.children[1].id === 'pg-friends-btn' && row.lastElementChild === btn && ink($('pg-shop-ic')) > 20);
    ok('title: a store that never opened the 상점 -> the NEW dot, aria "상점 · 비누 코인 0개"', shown($('pg-shop-new')) && S().newDot && btn.getAttribute('aria-label') === '상점 · 비누 코인 0개', btn.getAttribute('aria-label'));
    ok('title: the dot\'s first lighting in a page load hops the button (is-nudge), 혼자 하기 stays data-primary', btn.classList.contains('is-nudge') && $('pg-start').hasAttribute('data-primary') && !btn.hasAttribute('data-primary'));
    btn.focus(); btn.click(); await sleep(80);
    ok('hub: the 상점 button opens the hub on 상점 over the title (the demo runs behind, the touch pads hidden)', shown($('pg-hub')) && S().hub.tab === 'shop' && S().hub.from === 'title' && $('pg-title').hidden && D.getState().phase === 'title' && $('pg-app').classList.contains('pg-panel-open'));
    ok('hub: the first visit selects nothing - the intro line, "아이템을 골라 봐요" (disabled), the coin chip 0', S().hub.sel === '' && $('pg-shop-desc').textContent === '게임을 하면 비누 코인이 모여요 · 이기든 지든, 혼자 해도!' &&
      btnT() === '아이템을 골라 봐요' && $('pg-shop-buy').getAttribute('aria-disabled') === 'true' && $('pg-hub-co').textContent === '0' && !shown($('pg-shop-rar')), [S().hub, btnT()]);
    ok('hub: showing the 상점 marks it visited (S.sh = 1)', S().sh === 1);
    ok('hub: 5 slot tabs (머리 얼굴 목 등 효과, icons painted), 머리 holds its 12 sold items then its 2 draw-only ones (gacha.md 6.8)', [...$('pg-shop-slots').children].map((b) => b.textContent).join() === '머리,얼굴,목,등,효과' &&
      [...$('pg-shop-slots').querySelectorAll('canvas')].every((c) => ink(c) > 8) && [...$('pg-shop-grid').children].map((b) => b.dataset.id).join() === 'h1,h2,h3,h4,h5,h6,h7,h8,h9,ha,hb,hc,hd,he');
    $('pg-hub-close').click(); await sleep(80);
    ok('hub: 닫기 returns to the title, the focus back on the 상점 button, no dot left (nothing to buy with 0 coins)', shown($('pg-title')) && $('pg-hub').hidden && document.activeElement === btn && !shown($('pg-shop-new')) && !$('pg-app').classList.contains('pg-panel-open'), [document.activeElement && document.activeElement.id]);
    // the dot rule (9.1): more coins than at the last close and something they buy
    SH.give(100);
    ok('dot: new coins that buy something -> the dot; aria "상점 · 비누 코인 100개 · 살 수 있는 아이템이 있어요"', shown($('pg-shop-new')) && btn.getAttribute('aria-label') === '상점 · 비누 코인 100개 · 살 수 있는 아이템이 있어요', btn.getAttribute('aria-label'));
    SH.open('shop'); await sleep(40);
    ok('hub: opening selects the cheapest affordable unowned item of the first slot with one (양머리 수건 60)', S().hub.sel === 'h1' && S().hub.slot === 'h' && $('pg-shop-iname').textContent === '양머리 수건' && $('pg-shop-rar').textContent === '보통', S().hub);
    SH.close(); await sleep(40);
    ok('dot: closing the 상점 remembers the balance (S.cv = 100) - the dot goes out', S().cv === 100 && !shown($('pg-shop-new')), S().cv);
    SH.give(3);
    ok('dot: ... and lights again with more coins (103 > 100, something to buy)', shown($('pg-shop-new')));
    // opening: a slot further on (머리 has nothing affordable), or nothing affordable at all (the first 머리 item)
    fresh(20261020); SH.set({ ce: 65, sh: 1, own: ['h1'] }); SH.open('shop'); await sleep(40);
    ok('hub: 65 coins, 양머리 owned: 얼굴\'s 하트 볼터치 (60) is the opening pick', S().hub.slot === 'f' && S().hub.sel === 'f1', S().hub);
    SH.close(); SH.set({ ce: 0, sp: 0, own: [] }); SH.open('shop'); await sleep(40);
    ok('hub: nothing affordable -> the first 머리 item, "[coin]60개 더 모아요" (disabled, focus kept: aria-disabled)', S().hub.sel === 'h1' && btnK() === 'poor' && btnT() === '60개 더 모아요' &&
      !!$('pg-shop-buy').querySelector('canvas.pg-coin') && $('pg-shop-buy').getAttribute('aria-disabled') === 'true' && !$('pg-shop-buy').disabled, [S().hub, btnT()]);
    $('pg-shop-buy').click();
    ok('hub: a tap on a disabled button does nothing', S().own.length === 0 && S().co === 0 && btnK() === 'poor');
    SH.close();
    // (gacha.md 13.2, G3) every slot's grid shows its draw-only items after the sold ones: 14 / 9 / 10 / 9 / 8 cells
    fresh(20261020); SH.set({ ce: 300, sh: 1 }); SH.open('shop'); await sleep(40);
    const per = 'hfnbe'.split('').map((s) => { slotTab(s); return document.querySelectorAll('#pg-shop-grid [role="option"]').length; });
    const hIds = (slotTab('h'), [...document.querySelectorAll('#pg-shop-grid [role="option"]')].map((b) => b.dataset.id));
    ok('grids: 14 / 9 / 10 / 9 / 8 cells per slot, the draw-only ones (hd, he) last in 머리', same(per, [14, 9, 10, 9, 8]) && same(hIds.slice(-2), ['hd', 'he']), [per, hIds.slice(-3)]);
    SH.close();
    // the armed buy (9.3): a first tap arms for 2.5 s, a second one buys; bought = worn; the verbs follow the slot
    fresh(20261020); SH.set({ ce: 300, sh: 1 }); SH.open('shop'); await sleep(40);
    pickCell('h5');
    ok('buy: 바가지 모자 selected - "사기 [coin]160", its cell white inside its 고급 border', btnK() === 'buy' && btnT() === '사기 160' && !!$('pg-shop-buy').querySelector('canvas.pg-coin') &&
      cell('h5').getAttribute('aria-selected') === 'true' && cell('h1').getAttribute('aria-selected') === 'false' && cell('h5').style.getPropertyValue('--rar') === '#6fd08a' && $('pg-shop-desc').textContent === '노란 목욕 바가지를 거꾸로 쓴 모자', [btnT(), $('pg-shop-desc').textContent]);
    $('pg-shop-buy').click(); await sleep(30);
    ok('buy: the first tap arms it - "한 번 더 누르면 사요" in pink, nothing bought yet', btnK() === 'arm' && btnT() === '한 번 더 누르면 사요' && $('pg-shop-buy').classList.contains('is-armed') && S().hub.armed && S().own.length === 0 && S().co === 300);
    $('pg-shop-buy').click(); await sleep(30);
    ok('buy: the second tap within 2.5 s buys - worn at once (bought = worn), 140 left, the button "벗기"', same(S().own, ['h5']) && S().eq === '50000' && S().co === 140 && btnK() === 'off' && btnT() === '벗기', [S().own, S().eq, S().co, btnT()]);
    ok('buy: "샀어요! 꽥꽥이가 바로 썼어요 · 동물마다 따로 꾸며요" (the first purchase ever: the animal named)', S().hub.msg === '샀어요! ' + SJ() + ' 바로 썼어요 · 동물마다 따로 꾸며요', S().hub.msg);
    ok('buy: the cell gets its check (owned) and the duck ring (worn); aria "바가지 모자 · 고급 · 160코인 · 가지고 있어요 · 쓰고 있어요"', !!cell('h5').querySelector('.pg-item-ck') && cell('h5').classList.contains('is-worn') &&
      cell('h5').getAttribute('aria-label') === '바가지 모자 · 고급 · 160코인 · 가지고 있어요 · 쓰고 있어요', cell('h5').getAttribute('aria-label'));
    ok('buy: a sparkle in the preview (kfx crosses round the animal)', S().hub.view.kfx >= 5, S().hub.view);
    // (review 2026-10-18: the same hand tapping a third time right after the purchase does not take the hat off; the
    // take-off verb is a ghost button; the preview shows the set as worn - an owned item is never "tried on")
    $('pg-shop-buy').click(); await sleep(20); SH.tick(4);
    ok('buy: a third tap within 0.8 s of the purchase is ignored - still worn, the message unchanged', S().eq === '50000' && btnK() === 'off' && /바로 썼어요/.test(S().hub.msg), [S().eq, btnK(), S().hub.msg]);
    ok('buy: 벗기 is drawn as a ghost button (not the yellow 사기 of the taps before)', getComputedStyle($('pg-shop-buy')).backgroundColor === 'rgba(0, 0, 0, 0)', getComputedStyle($('pg-shop-buy')).backgroundColor);
    ok('buy: the preview wears the bought hat as worn (50000)', S().hub.view.look === '50000', S().hub.view.look);
    const co1 = $('pg-hub-co').textContent; await sleep(500); SH.tick(1);
    ok('buy: the coin chip counts down from 300 to 140 over 0.4 s', co1 !== '140' && +co1.replace(/,/g, '') <= 300 && $('pg-hub-co').textContent === '140', [co1, $('pg-hub-co').textContent]);
    ok('buy: the title\'s demo animal wears it at once', G.players[0] && G.players[0].look === '50000', G.players[0] && G.players[0].look);
    await sleep(350); $('pg-shop-buy').click(); await sleep(20); SH.tick(4);
    ok('wear: 벗기 takes it off (쓰기 now; still owned), "벗었어요", and the preview shows it off (00000)', S().eq === '00000' && btnK() === 'on' && btnT() === '쓰기' && same(S().own, ['h5']) && !cell('h5').classList.contains('is-worn') &&
      S().hub.msg === SJ() + ' 벗었어요' && S().hub.view.look === '00000', [S().eq, S().hub.msg, S().hub.view.look]);
    $('pg-shop-buy').click(); await sleep(20); SH.tick(4);
    ok('wear: 쓰기 puts it on again ("썼어요", the preview wears it)', S().eq === '50000' && btnT() === '벗기' && S().hub.msg === SJ() + ' 썼어요' && S().hub.view.look === '50000', [S().hub.msg, S().hub.view.look]);
    // a scarf: 하기 / 빼기, the second purchase message without the hint; a second tap after 2.6 s re-arms instead
    slotTab('n'); pickCell('n2');
    $('pg-shop-buy').click(); await sleep(2600);
    ok('arm: after 2.5 s the arm is gone ("사기" again)', btnK() === 'buy' && !S().hub.armed, btnK());
    $('pg-shop-buy').click(); await sleep(30);
    ok('arm: a tap after 2.6 s re-arms instead of buying', btnK() === 'arm' && S().own.length === 1, [btnK(), S().own]);
    $('pg-shop-buy').click(); await sleep(30);
    ok('buy: a scarf - "샀어요! 바로 했어요", its button "빼기"', same(S().own, ['h5', 'n2']) && S().eq === '50200' && S().hub.msg === '샀어요! ' + SJ() + ' 바로 했어요' && btnT() === '빼기', [S().hub.msg, btnT()]);
    await sleep(850); $('pg-shop-buy').click(); await sleep(20);
    ok('wear: 빼기 -> 하기 ("뺐어요")', btnT() === '하기' && S().eq === '50000' && S().hub.msg === SJ() + ' 뺐어요', [btnT(), S().hub.msg]);
    SH.give(200); slotTab('e'); pickCell('e2'); $('pg-shop-buy').click(); $('pg-shop-buy').click(); await sleep(30);
    ok('buy: an effect - "샀어요! 바로 켰어요", its button "끄기"; the starter on the 목 tab says 하기 (owned, not worn)', S().eq === '50002' && S().hub.msg === '샀어요! ' + SJ() + ' 바로 켰어요' && btnT() === '끄기' && (slotTab('n'), pickCell('n1'), btnT() === '하기' && btnK() === 'on'), [S().hub.msg]);
    ok('cells: the starter shows "처음 선물" and its check; an effect cell is "착지 물방울 · 보통 · 80코인 · 가지고 있어요 · 켜 놨어요"', $('pg-shop-rar').textContent === '처음 선물' && !!cell('n1').querySelector('.pg-item-ck') &&
      (slotTab('e'), cell('e2').getAttribute('aria-label') === '착지 물방울 · 보통 · 80코인 · 가지고 있어요 · 켜 놨어요'), cell('e2') && cell('e2').getAttribute('aria-label'));
    ok('cells: every slot holds its catalog items (머리 14 · 얼굴 9 · 목 10 · 등 9 · 효과 8, the draw-only ones included), the 전설 ones shimmer (r3)', ['h', 'f', 'n', 'b', 'e'].map((s) => (slotTab(s), $('pg-shop-grid').children.length)).join() === '14,9,10,9,8' &&
      (slotTab('h'), cell('hc').classList.contains('r3')) && (slotTab('e'), cell('e6').classList.contains('r3')));
    // (looks-per-animal.md L1) the hub's animal: every action dresses it - to 냥냥, the hat my pick wears is 쓰기 there and
    // 쓰기 dresses only the cat; buying with 까삐 shown dresses 까삐 and not the demo (my pick); the pick never changes
    const p0 = G.sel; slotTab('h'); pickCell('h5'); SH.ani('cat'); await sleep(850); SH.tick(4);
    ok('ani: the hub on 냥냥 - the preview shows the cat bare, 쓰기 for the hat my pick wears (no worn ring)', S().hub.ani === 'cat' && S().hub.view.char === 'cat' && S().hub.view.look === '00000' && btnK() === 'on' && btnT() === '쓰기' && !cell('h5').classList.contains('is-worn') && G.sel === p0, [S().hub.ani, S().hub.view, btnT()]);
    ok('ani: the pill reads 냥냥, the previews\' aria "미리 보기: 냥냥 · 눌러서 다른 동물로", the button\'s "냥냥: 쓰기"', $('pg-shop-aname').textContent === '냥냥' && $('pg-shop-view').getAttribute('aria-label') === '미리 보기: 냥냥 · 눌러서 다른 동물로' &&
      $('pg-shop-buy').getAttribute('aria-label') === '냥냥: 쓰기', [$('pg-shop-aname').textContent, $('pg-shop-view').getAttribute('aria-label'), $('pg-shop-buy').getAttribute('aria-label')]);
    $('pg-shop-buy').click(); await sleep(20); SH.tick(4);
    ok('ani: 쓰기 dresses only the cat (my pick keeps 50002; the demo too), "냥냥이가 썼어요"', SH.look('cat') === '50000' && SH.look(p0) === '50002' && S().eq === '50002' && S().hub.view.look === '50000' && btnK() === 'off' && G.players[0].look === '50002' &&
      S().hub.msg === '냥냥이가 썼어요', [S().eqs, S().hub.view.look, S().hub.msg]);
    // (4.2) the preview's halves: the right one the next animal, the left one the previous; ←/→ on the focused preview
    const half = (el, right) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, clientX: r.left + r.width * (right ? 0.8 : 0.2), clientY: r.top + r.height / 2 })); return S().hub.ani; };
    const AN = D.chars().map((c) => c.id), nx = (c, d) => AN[(AN.indexOf(c) + d + AN.length) % AN.length];
    const hr = half($('pg-shop-view'), true), hl = half($('pg-shop-view'), false), hl2 = half($('pg-shop-view'), false);
    $('pg-shop-view').focus(); keyOn('ArrowRight'); const kr = S().hub.ani; keyOn('ArrowLeft'); const kl = S().hub.ani;
    ok('ani: a tap on the preview\'s right half - the next animal, the left half - the previous; ←/→ on the focused preview the same', hr === 'frog' && hl === 'cat' && hl2 === nx('cat', -1) && kr === 'cat' && kl === nx('cat', -1) && G.sel === p0, [hr, hl, hl2, kr, kl]);
    SH.set({ ce: S().ce + 500 }); SH.ani('capy'); slotTab('f'); pickCell('f1'); $('pg-shop-buy').click(); $('pg-shop-buy').click(); await sleep(30);
    ok('ani: buying with 까삐 shown - 까삐 wears it, my pick and the demo do not', S().own.includes('f1') && SH.look('capy') === '01000' && SH.look(p0) === '50002' && G.players[0].look === '50002' && G.sel === p0, [S().eqs, G.players[0].look]);
    const cy1 = SH.cycle(-1).ani, cy2 = SH.cycle(1).ani; SH.ani(p0);
    ok('ani: the preview steps back (-1) and on (+1), wrapping in the game\'s order', cy1 === 'duck' && cy2 === 'capy' && S().hub.ani === p0, [cy1, cy2]);
    // locked (a league not reached): the lock and 40 %, "[lg] 양머리 고수 리그부터"; it sells once the best league reaches it
    slotTab('h'); pickCell('h8');
    ok('lock: 금테 양머리 (양머리 고수) - "양머리 고수 리그부터" with the league icon, disabled; the cell locked with its lock', btnK() === 'lock' && /양머리 고수 리그부터$/.test(btnT()) && !!$('pg-shop-buy').querySelector('canvas') &&
      $('pg-shop-buy').getAttribute('aria-disabled') === 'true' && cell('h8').classList.contains('is-lock') && !!cell('h8').querySelector('.pg-item-lk') && /양머리 고수 리그부터$/.test(cell('h8').getAttribute('aria-label')), [btnT(), cell('h8').className]);
    T.set({ bl: 3 }); await sleep(20);
    ok('lock: once the best league reaches it, the same view sells it (no lock)', (btnK() === 'buy' || btnK() === 'poor') && !cell('h8').classList.contains('is-lock'), btnK());
    // a purchase that another tab beat (the store as it is NOW)
    pickCell('h1'); $('pg-shop-buy').click();
    { const k = T.state().key, o = JSON.parse(localStorage.getItem(k)); o.own = o.own.concat(['h1']); o.sp += 60; localStorage.setItem(k, JSON.stringify(o)); }
    $('pg-shop-buy').click(); await sleep(20);
    ok('buy: another tab bought it meanwhile -> "이미 가지고 있어요", charged once', S().hub.msg === '이미 가지고 있어요' && S().own.filter((x) => x === 'h1').length === 1, [S().hub.msg, S().own]);
    // the keys (9.10): no game key acts behind the hub; the arrows move in the tabs and the grid (a key never buys)
    slotTab('h'); pickCell('h1'); cell('h1').focus();
    const own0 = S().own.length, ph0 = D.getState().phase, sel0 = G.sel;
    for (const [code, k] of [['KeyZ', 'z'], ['KeyX', 'x'], ['Enter'], ['Space', ' '], ['ArrowUp'], ['KeyP', 'p']]) { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); key(code, k); }
    D.step(3); await sleep(30);
    ok('keys: Z / X / Enter / Space / ↑ / P with the hub open start nothing, pause nothing, buy nothing', shown($('pg-hub')) && D.getState().phase === ph0 && S().own.length === own0 && G.sel === sel0, [D.getState().phase, S().own.length]);
    cell('h1').focus(); keyOn('ArrowRight');
    ok('keys: → in the grid moves the focus and the selection (roving tabindex), nothing bought', document.activeElement === cell('h2') && S().hub.sel === 'h2' && cell('h2').tabIndex === 0 && cell('h1').tabIndex === -1 && S().own.length === own0, [document.activeElement && document.activeElement.dataset.id, S().hub.sel]);
    keyOn('ArrowDown');
    const cols = [...$('pg-shop-grid').children].filter((b) => b.offsetTop === $('pg-shop-grid').children[0].offsetTop).length;
    const HS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'ha', 'hb', 'hc'];
    ok('keys: ↓ moves a whole row down (' + cols + ' columns here; past the end it stays)', S().hub.sel === (1 + cols < 12 ? HS[1 + cols] : 'h2'), [S().hub.sel, cols]);
    document.querySelector('#pg-shop-slots [data-slot="h"]').focus(); keyOn('ArrowRight');
    ok('keys: → on the slot tabs shows the next slot (얼굴)', S().hub.slot === 'f' && document.activeElement === document.querySelector('#pg-shop-slots [data-slot="f"]'));
    $('pg-tab-shop').focus(); keyOn('ArrowRight');
    keyOn('ArrowRight');   // (gacha.md 6.10: 상점 → 뽑기 → 마이페이지)
    ok('keys: → → on the hub tabs shows 뽑기, then 마이페이지', S().hub.tab === 'my' && !$('pg-hub-my').hidden && $('pg-hub-shop').hidden && $('pg-tab-my').getAttribute('aria-selected') === 'true' && document.activeElement === $('pg-tab-my'));
    keyOn('ArrowLeft'); keyOn('ArrowLeft');
    ok('keys: ← ← back to 상점 (through 뽑기)', S().hub.tab === 'shop' && !$('pg-hub-shop').hidden);
    // the touch pads (hidden behind the panel anyway) never start a game either
    for (const id of ['pg-t-jump', 'pg-t-shoot']) { const el = $(id); el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, bubbles: true })); }
    D.step(3);
    ok('keys: the touch pads behind the hub start nothing', shown($('pg-hub')) && D.getState().phase === 'title');
    key('Escape'); await sleep(30);
    ok('keys: Escape closes the hub back to the title', $('pg-hub').hidden && shown($('pg-title')));
    // (looks-per-animal.md 2.4 / 8) a migrated store (lh): its first dressing in the 상점 says so, once; with a purchase
    // its line wins over the first-purchase one
    fresh(20261020); SH.set({ ce: 300, sh: 1, own: ['h5'], eq: '50000', lh: 1 }); SH.open('shop'); await sleep(30);
    ok('lh: a migrated store (lh 1) wears its set on all six', S().lh === 1 && S().eqs === '50000'.repeat(6), [S().lh, S().eqs]);
    await sleep(850);   // (the 0.8 s guard after the purchase a moment ago)
    slotTab('h'); pickCell('h5'); $('pg-shop-buy').click(); await sleep(20);
    ok('lh: its first 벗기 - "꽥꽥이가 벗었어요 · 이제 동물마다 따로 꾸며요", lh cleared', S().hub.msg === SJ() + ' 벗었어요 · 이제 동물마다 따로 꾸며요' && S().lh === 0, [S().hub.msg, S().lh]);
    $('pg-shop-buy').click(); await sleep(20);
    ok('lh: ... and never again ("꽥꽥이가 썼어요")', S().hub.msg === SJ() + ' 썼어요', S().hub.msg);
    SH.close(); fresh(20261020); SH.set({ ce: 300, sh: 1, lh: 1 }); SH.open('shop'); await sleep(30);
    slotTab('h'); pickCell('h1'); $('pg-shop-buy').click(); $('pg-shop-buy').click(); await sleep(20);
    ok('lh: a first purchase with lh - its line wins: "샀어요! 꽥꽥이가 바로 썼어요 · 이제 동물마다 따로 꾸며요"', S().hub.msg === '샀어요! ' + SJ() + ' 바로 썼어요 · 이제 동물마다 따로 꾸며요' && S().lh === 0, [S().hub.msg, S().lh]);
    ok('subj: the six subjects - 꽥꽥이가 까삐가 해롱이가 펭펭이가 냥냥이가 개굴이가', D.chars().map((c) => SH.subj(c.id)).join(' ') === '꽥꽥이가 까삐가 해롱이가 펭펭이가 냥냥이가 개굴이가', D.chars().map((c) => SH.subj(c.id)));
    SH.close();
    // read-only (a newer page's store): every state says so
    localStorage.setItem('ppogeul-trophy-shopro2', JSON.stringify({ v: 6, dev: 'abcdefgh', t: 1 }));
    T.ns('shopro2'); SH.open('shop'); await sleep(30); pickCell('h1');
    ok('ro: a read-only store - "이 브라우저에서는 저장되지 않아요" (disabled)', btnK() === 'ro' && btnT() === '이 브라우저에서는 저장되지 않아요' && $('pg-shop-buy').getAttribute('aria-disabled') === 'true');
    SH.close();
  }
  // 마이페이지 (9.4), the badge, 내 기록 there and back (9.5)
  async function myTests() {
    fresh(20261020); SH.set({ ce: 0, sh: 1, seen: 0 }); T.set({ t: 345, best: 400, bl: 3 }); SH.set({ bd: 0, bs: 0 });
    D.toTitle(); await sleep(60);
    const b = $('pg-tro');
    ok('badge: aria "내 트로피 345개 · 양머리 고수 · 마이페이지 열기", its NEW dot (마이페이지 not seen yet)', b.getAttribute('aria-label') === '내 트로피 345개 · 양머리 고수 · 마이페이지 열기' && shown($('pg-tro-new')), b.getAttribute('aria-label'));
    b.focus(); b.click(); await sleep(60);
    ok('badge: opens the hub on 마이페이지 (S.seen = 1: the badge\'s dot is gone)', shown($('pg-hub')) && S().hub.tab === 'my' && !$('pg-hub-my').hidden && $('pg-hub-shop').hidden && T.state().seen === 1 && $('pg-tro-new').hidden);
    ok('my: the name, the trophy chip and the league ("345", "양머리 고수")', $('pg-my-nick').value === D.mp.state().nick && /345/.test($('pg-my-tro').textContent) && $('pg-my-lg').textContent === '양머리 고수', [$('pg-my-nick').value, $('pg-my-tro').textContent]);
    ok('my: nothing owned, the starter not worn -> "처음 선물: 초록 때타월 리본을 해 봐요" (the 목 button says 하기)', $('pg-my-note').textContent === '처음 선물: 초록 때타월 리본을 해 봐요', $('pg-my-note').textContent);
    ok('my: 5 equipment boxes, all bare (grey slot icons); with the starter note it opens on 목 (the ribbon one tap away)', [...$('pg-my-slots').children].map((x) => x.textContent).join() === '머리,얼굴,목,등,효과' &&
      [...$('pg-my-slots').children].every((x) => /· 없음$/.test(x.getAttribute('aria-label')) && ink(x.querySelector('canvas')) > 8) && S().hub.mySlot === 'n', S().hub.mySlot);
    eqTab('h');
    ok('my: 머리 owns nothing -> "아직 없어요 · 상점에서 골라 봐요" + 상점 가기, no grid', shown($('pg-my-empty')) && $('pg-my-empty').textContent === '아직 없어요 · 상점에서 골라 봐요상점 가기' && $('pg-my-grid').children.length === 0);
    eqTab('n');
    ok('my: 목 lists 없음 then the starter (always owned); 없음 is selected (nothing worn), aria "빼기"', [...$('pg-my-grid').children].map((x) => x.dataset.id).join() === ',n1' && $('pg-my-grid').children[0].getAttribute('aria-selected') === 'true' && $('pg-my-grid').children[0].getAttribute('aria-label') === '빼기' && !shown($('pg-my-empty')));
    cell('n1').click(); await sleep(20);
    ok('my: a tap wears it at once (no confirm): eq 00100, its box shows the ribbon, the note moves on to the day bonus "오늘 첫 판 하면 코인 +20!"', S().eq === '00100' && cell('n1').getAttribute('aria-selected') === 'true' &&
      document.querySelector('#pg-my-slots [data-slot="n"]').getAttribute('aria-label') === '목 · 초록 때타월 리본' && $('pg-my-note').textContent === '오늘 첫 판 하면 코인 +20!', [S().eq, $('pg-my-note').textContent]);
    $('pg-my-grid').children[0].click(); await sleep(20);
    ok('my: 없음 takes it off', S().eq === '00000');
    // the day-bonus notes
    SH.set({ bd: 20261019, bs: 2, own: ['h5'] });
    ok('my: yesterday was streak day 2 -> "오늘 첫 판 하면 코인 +30!"', $('pg-my-note').textContent === '오늘 첫 판 하면 코인 +30!', $('pg-my-note').textContent);
    SH.set({ bd: 20261020, bs: 3 });
    ok('my: paid today on streak day 3 -> "3일 연속 · 내일 첫 판 +35"', $('pg-my-note').textContent === '3일 연속 · 내일 첫 판 +35', $('pg-my-note').textContent);
    SH.set({ bd: 20311020, bs: 4 });
    ok('my: a bonus day years ahead (a wrong clock) is forgotten -> "오늘 첫 판 하면 코인 +20!"', $('pg-my-note').textContent === '오늘 첫 판 하면 코인 +20!', $('pg-my-note').textContent);
    // 상점 가기 from an empty slot: the 상점 on that slot
    eqTab('f'); await sleep(10);
    ok('my: 얼굴 owns nothing -> the empty line', shown($('pg-my-empty')) && !$('pg-my-grid').children.length);
    $('pg-my-go').click(); await sleep(30);
    ok('my: 상점 가기 shows the 상점 on 얼굴', S().hub.tab === 'shop' && S().hub.slot === 'f' && /^f/.test(S().hub.sel), S().hub);
    $('pg-tab-my').click(); await sleep(20);
    // the full inventory: purchase order, the worn one selected, the equipment boxes' art
    SH.set({ own: ['h9', 'h1', 'hc', 'f2', 'b2', 'e6'], eq: 'c0026' });
    eqTab('h'); await sleep(20);
    ok('my: 머리 lists 없음 + what I own in purchase order (h9 h1 hc), the worn 황금 대야 투구 selected', [...$('pg-my-grid').children].map((x) => x.dataset.id).join() === ',h9,h1,hc' && cell('hc').getAttribute('aria-selected') === 'true' &&
      document.querySelector('#pg-my-slots [data-slot="h"]').getAttribute('aria-label') === '머리 · 황금 대야 투구' && document.querySelector('#pg-my-slots [data-slot="e"]').getAttribute('aria-label') === '효과 · 무지개 발자국');
    cell('h9').focus(); keyOn('ArrowRight');
    ok('my: → in the grid moves the focus only (wearing is a tap / Enter)', document.activeElement === cell('h1') && S().eq === 'c0026');
    // the name field: netSetNick (change / blur)
    const nk = $('pg-my-nick'); nk.focus(); nk.value = '  뽀송이  '; nk.dispatchEvent(new Event('change'));
    ok('my: the name field sets the nick (netSetNick: cleaned, stored)', D.mp.state().nick === '뽀송이' && nk.value === '뽀송이' && localStorage.getItem('ppogeul-nick') === '뽀송이', [D.mp.state().nick, nk.value]);
    nk.value = '말랑두부'; key('Escape'); await sleep(20);
    ok('my: Escape in the name field closes the hub - the typed name is kept', $('pg-hub').hidden && D.mp.state().nick === '말랑두부' && shown($('pg-title')), D.mp.state().nick);
    // 내 기록 from 마이페이지 and back (9.5); Escape / 닫기 return to the title with the focus on the opener
    b.focus(); b.click(); await sleep(40);
    $('pg-my-rec').click(); await sleep(60);
    ok('rec: 내 기록 opens #pg-rec unchanged (over the title, the hub hidden)', shown($('pg-rec')) && $('pg-hub').hidden && $('pg-title').hidden && $('pg-rec-lgname').textContent === '양머리 고수');
    $('pg-rec-close').click(); await sleep(60);
    ok('rec: its 닫기 returns to 마이페이지, the focus on 내 기록', shown($('pg-hub')) && S().hub.tab === 'my' && $('pg-rec').hidden && document.activeElement === $('pg-my-rec'), [document.activeElement && document.activeElement.id]);
    $('pg-my-rec').click(); await sleep(40); key('Escape'); await sleep(40);
    ok('rec: Escape there returns to 마이페이지 too', shown($('pg-hub')) && S().hub.tab === 'my');
    $('pg-hub-close').click(); await sleep(40);
    ok('hub: 닫기 returns to the title, the focus back on the badge', shown($('pg-title')) && document.activeElement === b, document.activeElement && document.activeElement.id);
    T.openRec(); await sleep(40); T.closeRec(); await sleep(40);
    ok('rec: opened the old way (no argument) it still closes to the title', shown($('pg-title')) && $('pg-hub').hidden);
    // (looks-per-animal.md 4.1) the row of six: a radiogroup, my pick checked at every opening, each bust in its own set
    // (the duck: a hat and goggles; the otter: only a cape - the 등 / 효과 dot; the cat: a bell), 내 기록 in the footer
    const nm = (c) => D.chars().find((x) => x.id === c).name, AN = D.chars().map((c) => c.id), p0 = G.sel;
    fresh(20261020); SH.set({ ce: 300, sh: 1, bd: 20261020, bs: 1, own: ['h5', 'f2', 'b1', 'n3'], eq: '52000' + '00000' + '00010' + '00000' + '00300' + '00000' }); D.toTitle(); await sleep(40);
    SH.open('my'); await sleep(40);
    const row = $('pg-my-anis'), rds = () => [...row.querySelectorAll('[role="radio"]')], rd = (c) => row.querySelector('[data-char="' + c + '"]'), chk = () => rds().filter((x) => x.getAttribute('aria-checked') === 'true').map((x) => x.dataset.char).join();
    ok('row: a radiogroup "꾸밀 동물" of 6 radios in the game\'s order, my pick checked and the tab stop', row.getAttribute('role') === 'radiogroup' && row.getAttribute('aria-label') === '꾸밀 동물' && rds().map((x) => x.dataset.char).join() === AN.join() &&
      chk() === p0 && rds().every((x) => x.tabIndex === (x.dataset.char === p0 ? 0 : -1)), [chk(), rds().map((x) => x.tabIndex)]);
    ok('row: aria-labels name what each wears ("꽥꽥이 · 바가지 모자, 수경", "냥냥 · 딸랑 방울", "까삐 · 아직 안 꾸몄어요")', rd('duck').getAttribute('aria-label') === nm('duck') + ' · 바가지 모자, 수경' && rd('cat').getAttribute('aria-label') === nm('cat') + ' · 딸랑 방울' &&
      rd('capy').getAttribute('aria-label') === nm('capy') + ' · 아직 안 꾸몄어요' && rd('otter').getAttribute('aria-label') === nm('otter') + ' · 망토 수건', rds().map((x) => x.getAttribute('aria-label')));
    const bust = (c, lk) => { const p = SH.portrait(c, lk), d = rd(c).querySelector('canvas').getContext('2d').getImageData(0, 0, 32, 32).data; return !!p && p.w === 32 && p.h === 32 && d.every((v, i) => v === p.d[i]); };
    ok('row: each bust is its animal\'s portrait in its own set (the duck hatted, the cat belled, the capy bare); the 등 / 효과 dot only on the otter (a cape only)', AN.every((c) => bust(c, SH.look(c))) && !bust('duck', '00000') && !bust('cat', '00000') &&
      shown(rd('otter').querySelector('.pg-ani-more')) && rds().filter((x) => shown(x.querySelector('.pg-ani-more'))).length === 1, rds().map((x) => shown(x.querySelector('.pg-ani-more'))));
    ok('footer: 내 기록 sits left of 닫기 on 마이페이지', shown($('pg-my-rec')) && [...$('pg-hub-close').parentNode.children].filter((e) => !e.hidden).slice(-2)[0] === $('pg-my-rec') && $('pg-my-rec').parentNode.classList.contains('pg-hub-foot'));
    rd('cat').click(); await sleep(20); SH.tick(4);
    ok('row: a radio -> the hub\'s animal (the pick unchanged): the pill, the preview, the boxes\' aria "냥냥 꾸미기", the 목 box', S().hub.ani === 'cat' && chk() === 'cat' && G.sel === p0 && $('pg-my-aname').textContent === nm('cat') && S().hub.view.char === 'cat' &&
      $('pg-my-slots').getAttribute('aria-label') === nm('cat') + ' 꾸미기' && document.querySelector('#pg-my-slots [data-slot="n"]').getAttribute('aria-label') === '목 · 딸랑 방울' && $('pg-my-view').getAttribute('aria-label') === nm('cat') + ' · 눌러서 다른 동물로', [S().hub.ani, $('pg-my-aname').textContent]);
    eqTab('h'); cell('h5').click(); await sleep(20);
    ok('row: a cell dresses that animal only - "냥냥이가 썼어요", the grid\'s ring follows it', SH.look('cat') === '50300' && SH.look('duck') === '52000' && S().hub.msg === '냥냥이가 썼어요' && cell('h5').classList.contains('is-worn'), [SH.look('cat'), S().hub.msg]);
    $('pg-my-grid').children[0].click(); await sleep(20);
    ok('row: 없음 takes it off with the worn item\'s verb - "냥냥이가 벗었어요"', SH.look('cat') === '00300' && S().hub.msg === '냥냥이가 벗었어요', [SH.look('cat'), S().hub.msg]);
    rd('cat').focus(); keyOn('ArrowRight'); const k1 = [S().hub.ani, document.activeElement && document.activeElement.dataset.char];
    keyOn('ArrowRight'); const k2 = S().hub.ani; keyOn('ArrowUp'); keyOn('ArrowDown'); const k3 = S().hub.ani; keyOn('ArrowLeft'); const k4 = S().hub.ani;
    ok('row: → checks and focuses the next (wrapping: frog -> duck), ↑/↓ do nothing, ← back', k1[0] === 'frog' && k1[1] === 'frog' && k2 === 'duck' && k3 === 'duck' && k4 === 'frog' && rd('frog').tabIndex === 0, [k1, k2, k3, k4]);
    $('pg-tab-shop').click(); await sleep(20);
    ok('footer: 내 기록 hidden on 상점; the hub\'s animal kept (the 상점 preview on the frog)', !shown($('pg-my-rec')) && S().hub.ani === 'frog' && $('pg-shop-aname').textContent === nm('frog'), [S().hub.ani]);
    $('pg-tab-my').click(); await sleep(20); $('pg-my-rec').click(); await sleep(50); $('pg-rec-close').click(); await sleep(50);
    ok('footer: 내 기록 there and back keeps the animal (frog), the focus on 내 기록', S().hub.tab === 'my' && S().hub.ani === 'frog' && chk() === 'frog' && document.activeElement === $('pg-my-rec'), [S().hub.ani, document.activeElement && document.activeElement.id]);
    SH.close(); await sleep(20); SH.open('my'); await sleep(20);
    ok('row: reopening the hub starts on my pick again', S().hub.ani === p0 && chk() === p0, [S().hub.ani]);
    SH.close();
    // the lh note (2.4): first among the notes after the storage line, gone at the first dressing; the starter note gone
    // once any animal wears the ribbon
    fresh(20261020); SH.set({ ce: 0, sh: 1, bd: 20261020, bs: 1, own: ['h5'], eq: '50000', lh: 1 }); SH.open('my'); await sleep(20);
    ok('my: a migrated store -> "이제 동물마다 따로 꾸며요!"', $('pg-my-note').textContent === '이제 동물마다 따로 꾸며요!', $('pg-my-note').textContent);
    rd('capy').click(); await sleep(10);
    ok('my: choosing an animal in the row dresses nothing (lh kept)', S().lh === 1 && $('pg-my-note').textContent === '이제 동물마다 따로 꾸며요!');
    eqTab('h'); $('pg-my-grid').children[0].click(); await sleep(20);
    ok('my: the first dressing (the capy\'s 없음) clears it (the note moves on: "오늘 보너스 받았어요 · 내일 첫 판 +25")', S().lh === 0 && SH.look('capy') === '00000' && $('pg-my-note').textContent === '오늘 보너스 받았어요 · 내일 첫 판 +25', [S().lh, $('pg-my-note').textContent]);
    SH.close(); fresh(20261020); SH.set({ ce: 0, sh: 1, seen: 1 }); SH.open('my'); await sleep(20);
    const st0 = $('pg-my-note').textContent; rd('frog').click(); eqTab('n'); cell('n1').click(); await sleep(20);
    ok('my: the starter note goes once any animal (here the frog) wears the ribbon', st0 === '처음 선물: 초록 때타월 리본을 해 봐요' && SH.look('frog') === '00100' && SH.look('duck') === '00000' && $('pg-my-note').textContent !== st0 && S().hub.msg === SJ('frog') + ' 했어요', [st0, $('pg-my-note').textContent, S().hub.msg]);
    SH.close();
    // a read-only store / storage that keeps nothing
    localStorage.setItem('ppogeul-trophy-shopro3', JSON.stringify({ v: 6, dev: 'abcdefgh', t: 1 }));
    T.ns('shopro3'); SH.open('my'); await sleep(20);
    ok('my: a read-only store -> "이 브라우저에서는 저장되지 않아요"', $('pg-my-note').textContent === '이 브라우저에서는 저장되지 않아요', $('pg-my-note').textContent);
    SH.close();
  }
  // the preview (9.3): my pick in my set with the selected item tried on, the animal cycled by a tap, every effect shown
  async function viewTests() {
    SH.pageLoad(); fresh(20261020); SH.set({ ce: 5000, sh: 1 }); T.set({ bl: 6 }); D.toTitle(); await sleep(40);
    const sel0 = G.sel;
    SH.open('shop'); await sleep(40); pickCell('h5'); SH.tick(4);
    ok('view: the selected item tried on my picked animal (not bought)', S().hub.view.char === sel0 && S().hub.view.look === '50000' && S().own.length === 0, S().hub.view);
    ok('view: the 32x32 preview is drawn (tiles, floor, the animal)', ink($('pg-shop-view').querySelector('canvas')) > 900);
    // (review 2026-10-18: a carousel's two arrows beside the animal until the preview is first tapped in a page load)
    const pv = $('pg-shop-view').querySelector('canvas'), px = (x, y) => Array.from(pv.getContext('2d').getImageData(x, y, 1, 1).data);
    // (looks-per-animal.md 4.2: the arrows always - the halves step back and on)
    const a0 = [px(2, 22), px(29, 22)];
    $('pg-shop-view').click(); SH.tick(4);
    const a1 = [px(2, 22), px(29, 22)];
    ok('view: the two carousel arrows beside the animal, before and after a tap (always)', a0.every((c) => c[0] > 200) && a1.every((c) => c[0] > 200), [a0, a1]);
    const ids = D.chars().map((c) => c.id);
    ok('view: a tap with no pointer (Enter / Space) shows the next animal - the pick itself is unchanged', S().hub.view.char === ids[(ids.indexOf(sel0) + 1) % ids.length] && G.sel === sel0, [S().hub.view.char, G.sel]);
    // (the preview's frames by hand: watch n of them - the lowest y, the most particles / kfx alive)
    const watch = (n) => { let y = 99, p = 0, k = 0; for (let i = 0; i < n; i++) { SH.tick(1); const v = S().hub.view; y = Math.min(y, v.y); p = Math.max(p, v.parts); k = Math.max(k, v.kfx); } return { y, p, k }; };
    slotTab('e'); pickCell('e6');
    let w = watch(80);
    ok('view: 무지개 발자국 - the animal walks and leaves rainbow dots (particles of its own, at most 20)', w.p > 0 && w.p <= 20 && S().hub.view.look[4] === '6', w);
    const n0 = G.parts.length; watch(50);
    ok('view: the preview never touches the world\'s particles', G.parts.length === n0, [n0, G.parts.length]);
    pickCell('e3'); w = watch(130);
    ok('view: 점프 반짝이 - a hop every 2 s (it leaves the floor) with sparkles at the take-off', w.y < 15 && w.p > 0, w);
    pickCell('e2'); w = watch(130);
    ok('view: 착지 물방울 - the hop\'s landing throws droplets', w.y < 15 && w.p > 0, w);
    pickCell('e5'); w = watch(130);
    ok('view: 하트 뿅뿅 - a 500-point jump every 2 s sends hearts', w.k > 0, w);
    pickCell('e1'); w = watch(90);
    ok('view: 김 모락모락 - standing still, steam from the head', w.p > 0 && w.y === 15, w);
    CALM = true; pickCell('e6'); w = watch(150);
    ok('view: reduced motion - the idle frame, no hop, no particles', w.p === 0 && w.k === 0 && w.y === 15, w);
    CALM = false;
    // (4.2) the name pill straddles the preview's top border, and no hat pixel of a hopping e2 preview is ever under it
    // (every frame drawn over two hops: the hop's peak among them)
    SH.set({ own: ['h5', 'h9'], eq: '90000' }); SH.ani(sel0); slotTab('e'); pickCell('e2'); SH.tick(4);
    const pill = $('pg-shop-aname').getBoundingClientRect(), pvr = $('pg-shop-view').getBoundingClientRect(), cvr = pv.getBoundingClientRect(), k = cvr.width / 32;
    ok('view: the pill "' + $('pg-shop-aname').textContent + '" straddles the preview\'s top border, inside its width', pill.top < pvr.top && pill.bottom > pvr.top && pill.left > pvr.left && pill.right < pvr.right && $('pg-shop-aname').textContent === D.chars().find((c) => c.id === sel0).name, [pill.top, pill.bottom, pvr.top]);
    const BG = ['18,50,54', '13,42,45'], under = () => { let n = 0; const d = pv.getContext('2d').getImageData(0, 0, 32, 32).data;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const X0 = cvr.left + x * k, Y0 = cvr.top + y * k; if (X0 + k <= pill.left || X0 >= pill.right || Y0 + k <= pill.top || Y0 >= pill.bottom) continue; const i = (y * 32 + x) * 4; if (BG.indexOf(d[i] + ',' + d[i + 1] + ',' + d[i + 2]) < 0) n++; }
      return n; };
    for (const lk of ['90002', '50002']) {
      SH.set({ eq: lk.slice(0, 4) + '0' }); pickCell('e2');
      let worst = 0, top = 99; for (let i = 0; i < 250; i++) { SH.tick(1); top = Math.min(top, S().hub.view.y); worst = Math.max(worst, under()); }
      ok('view: ' + lk + ' hopping (to y ' + top + ') - no art under the pill', top < 15 && worst === 0, [top, worst]);
    }
    SH.close();
  }
  // the review of 2026-10-18 (S3a / S3b findings): prices on the cells and the art as large as it fits, the 등 items' own
  // verbs, numbers with commas, an opening that showed only 마이페이지 keeps the 상점's dot, day 1 is no streak, a
  // purchase another tab's write lost, a held Enter, blocked storage said before buying and on the card, the preview's
  // carousel arrows, a run's revive baseline
  const bbox = (cv) => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let x0 = 99, x1 = -1, y0 = 99, y1 = -1; for (let i = 3; i < d.length; i += 4) if (d[i]) { const q = i >> 2, x = q % cv.width, y = (q / cv.width) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { w: x1 - x0 + 1, h: y1 - y0 + 1 }; };
  async function reviewTests() {
    fresh(20261020); SH.set({ ce: 70, sh: 1, own: ['h2'] }); D.toTitle(); await sleep(40);
    SH.open('shop'); await sleep(30); slotTab('h');
    const pr = (id) => { const e = cell(id) && cell(id).querySelector('.pg-item-pr'); return e ? e.textContent : null; };
    ok('cells: every 상점 cell shows its price under the art ("60" ... "1,200")', pr('h1') === '60' && pr('h4') === '90' && pr('hc') === '1,200' && [...$('pg-shop-grid').children].every((b) => !!b.querySelector('.pg-item-pr canvas')), [pr('h1'), pr('hc')]);
    ok('cells: affordable prices in coin pink, the rest (poor, league-locked) dim; an owned cell hides its price (the check instead)', !cell('h1').classList.contains('is-poor') && cell('h3').classList.contains('is-poor') && cell('h8').classList.contains('is-poor') &&
      cell('h2').classList.contains('is-own') && getComputedStyle(cell('h2').querySelector('.pg-item-pr')).visibility === 'hidden' && getComputedStyle(cell('h1').querySelector('.pg-item-pr')).color === 'rgb(255, 201, 220)', [cell('h1').className, cell('h3').className]);
    slotTab('f'); const f2 = bbox(cell('f2').querySelector('canvas')), f5 = bbox(cell('f5').querySelector('canvas'));
    slotTab('n'); const n1 = bbox(cell('n1').querySelector('canvas')), n6 = bbox(cell('n6').querySelector('canvas'));
    ok('cells: the art as large as it fits - glasses 9 wide at 4x (36), the ribbon and the pearls at 4x', f2.w === 36 && f5.w === 36 && n1.w === 20 && n6.w === 32, [f2, f5, n1, n6]);
    // the 등 items wear with their own verbs
    SH.set({ ce: 2000 }); slotTab('b');
    const buyB = async (id) => { pickCell(id); $('pg-shop-buy').click(); $('pg-shop-buy').click(); await sleep(20); return [S().hub.msg, btnT(), cell(id).getAttribute('aria-label')]; };
    const b1 = await buyB('b1'), b2 = await buyB('b2'), b4 = await buyB('b4'), b6 = await buyB('b6');
    ok('등: a cape - "샀어요! 바로 둘렀어요", 벗기, "… 두르고 있어요"', b1[0] === '샀어요! ' + SJ() + ' 바로 둘렀어요' && b1[1] === '벗기' && /두르고 있어요$/.test(b1[2]), b1);
    ok('등: a tube - "샀어요! 바로 꼈어요", 빼기, "… 끼고 있어요"', b2[0] === '샀어요! ' + SJ() + ' 바로 꼈어요' && b2[1] === '빼기' && /끼고 있어요$/.test(b2[2]), b2);
    ok('등: a backpack - "샀어요! 바로 멨어요", 벗기, "… 메고 있어요"', b4[0] === '샀어요! ' + SJ() + ' 바로 멨어요' && b4[1] === '벗기' && /메고 있어요$/.test(b4[2]), b4);
    ok('등: wings - "샀어요! 바로 달았어요", 떼기, "… 달고 있어요"', b6[0] === '샀어요! ' + SJ() + ' 바로 달았어요' && b6[1] === '떼기' && /달고 있어요$/.test(b6[2]), b6);
    await sleep(850); $('pg-shop-buy').click(); await sleep(20);
    ok('등: 떼기 -> "뗐어요", 달기', S().hub.msg === SJ() + ' 뗐어요' && btnT() === '달기', [S().hub.msg, btnT()]);
    pickCell('b1');
    ok('등: an owned cape not worn says 두르기', btnT() === '두르기' && btnK() === 'on', btnT());
    // the shortfall with a comma, one number
    SH.set({ ce: 40 + S().sp }); slotTab('e'); pickCell('e6');
    ok('poor: "[coin]1,060개 더 모아요" (one number, a comma); aria "1,100코인 · 1,060개 더 모아요"', btnT() === '1,060개 더 모아요' && $('pg-shop-buy').getAttribute('aria-label') === '1,100코인 · 1,060개 더 모아요', [btnT(), $('pg-shop-buy').getAttribute('aria-label')]);
    SH.close();
    // an opening that showed only 마이페이지 keeps the 상점's "살 수 있어요" dot
    fresh(20261020); SH.set({ ce: 300, sh: 1, cv: 0, gs: 1 }); D.toTitle(); await sleep(30);
    const dot0 = shown($('pg-shop-new'));
    SH.open('my'); await sleep(20); SH.close(); await sleep(20);
    ok('dot: closing the hub after only 마이페이지 keeps the 상점\'s dot (S.cv unchanged)', dot0 && shown($('pg-shop-new')) && S().cv === 0, [dot0, S().cv]);
    SH.open('my'); await sleep(20); $('pg-tab-shop').click(); await sleep(20); SH.close(); await sleep(20);
    ok('dot: ... the 상점 shown in that opening clears it', !shown($('pg-shop-new')) && S().cv === 300, S().cv);
    // day 1 is no streak
    SH.set({ bd: 20261020, bs: 1, own: ['h1'] }); SH.open('my'); await sleep(20);
    ok('my: paid today on streak day 1 -> "오늘 보너스 받았어요 · 내일 첫 판 +25" (not "1일 연속")', $('pg-my-note').textContent === '오늘 보너스 받았어요 · 내일 첫 판 +25', $('pg-my-note').textContent);
    SH.close();
    // a purchase another tab's write lost (two tabs writing at once): the 상점 says so
    fresh(20261020); SH.set({ ce: 200, sh: 1 }); SH.open('shop'); await sleep(20); slotTab('h'); pickCell('h1');
    const k = T.state().key, before = localStorage.getItem(k);
    $('pg-shop-buy').click(); $('pg-shop-buy').click(); await sleep(20);
    const had = S().own.includes('h1');
    localStorage.setItem(k, before); window.dispatchEvent(new StorageEvent('storage', { key: k })); await sleep(20);
    ok('race: another tab\'s write lost the purchase -> "다시 사 주세요", the item and its coins back', had && !S().own.includes('h1') && S().co === 200 && S().hub.msg === '다시 사 주세요' && btnK() === 'buy', [had, S().own, S().co, S().hub.msg]);
    // a held Enter (auto-repeat) never presses the hub's buttons
    $('pg-shop-buy').focus();
    const ev = (rep) => { const e = new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', repeat: rep, bubbles: true, cancelable: true }); $('pg-shop-buy').dispatchEvent(e); return e.defaultPrevented; };
    ok('keys: a repeated Enter on a hub button is swallowed; the first press is the button\'s own', ev(true) === true && ev(false) === false);
    SH.close();
    // blocked storage: said before a purchase and on the card
    const P = Storage.prototype, gi = P.getItem, si = P.setItem;
    try {
      P.getItem = function () { throw new Error('blocked'); }; P.setItem = function () { throw new Error('blocked'); };
      T.ns('shopblocked'); T.today(20261020); SH.set({ ce: 200, sh: 1, bd: 20261020, bs: 1 });
      SH.open('shop'); await sleep(20); slotTab('h'); pickCell('h1'); $('pg-shop-buy').click(); await sleep(20);
      ok('mem: storage that keeps nothing - arming 사기 says "이 브라우저에서는 저장되지 않아요"', S().mem && btnK() === 'arm' && S().hub.msg === '이 브라우저에서는 저장되지 않아요', [S().mem, S().hub.msg]);
      SH.close();
      // (touch is on since cardTests: the 320 px phone's screen, as cardTests' phone row)
      setScale(278 / 256); G.hiscore = 1234567; await overBoth();
      fitCheck('mem: the 목욕 끝 card on a 320 px phone with that line', document.querySelector('#pg-over .pg-card'));
      ok('mem: ... and the 목욕 끝 card\'s coin row says so', shown($('pg-over-crow')) && $('pg-over-coin').querySelector('small').textContent === '저장되지 않아요', $('pg-over-coin').textContent);
      D.toTitle();
    } finally { P.getItem = gi; P.setItem = si; }
    // a run's revive baseline (2회차 keeps the players and their counts)
    fresh(20261020); D.start(0, 'duck'); G.players[0].revives = 3;
    ok('revives: a run started with 3 revives already counted takes them as its baseline', SH.runStart().rv0 === 3, SH.run());
    D.toTitle();
  }
  // the room's 꾸미기 (9.6, S3b; ?net=bc over http: a lone host): the hub from the room and back, my card's bust in my set
  const hashOf = (cv) => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let x = 0; for (let i = 0; i < d.length; i++) x = (Math.imul(x, 31) + d[i]) | 0; return x; };
  async function roomTests() {
    fresh(20261020); SH.set({ ce: 500, sh: 1, own: ['h5', 'n3'], eq: '00000' });
    const code = await D.mp.host({ mode: 'coop', nick: '뽀숑', char: 'duck' });
    await sleep(400);
    ok('room: a room is open', !!code && shown($('pg-room')) && D.mp.state().screen === 'room', code);
    const look = $('pg-room-look'), h3 = look && look.closest('h3');
    ok('room: 꾸미기 at the end of the 내 캐릭터 heading, on the same line', !!h3 && /^내 캐릭터/.test(h3.textContent) && shown(look) && h3.lastElementChild === look &&
      Math.abs(look.getBoundingClientRect().top + look.offsetHeight / 2 - (h3.getBoundingClientRect().top + h3.offsetHeight / 2)) < 2, h3 && h3.textContent);
    const myCard = () => document.querySelector('#pg-room-players .pg-pc.is-me > canvas'), myPick = () => document.querySelector('#pg-room-pick .pg-pick-btn[data-char="duck"] canvas');
    const c0 = hashOf(myCard()), p0 = hashOf(myPick());
    look.focus(); look.click(); await sleep(120);
    ok('room: 꾸미기 opens the hub on 마이페이지 from the room (the room hidden, the session going on)', shown($('pg-hub')) && S().hub.tab === 'my' && S().hub.from === 'room' && $('pg-room').hidden && D.mp.state().screen === 'room' && !!D.mp.session(), S().hub);
    eqTab('h'); cell('h5').click(); await sleep(60);
    ok('room: a tap there wears the hat', S().eq === '50000', S().eq);
    $('pg-my-rec').click(); await sleep(80);
    ok('room: 내 기록 from 마이페이지 (over the game screen)', shown($('pg-rec')) && $('pg-hub').hidden);
    $('pg-rec-close').click(); await sleep(80);
    ok('room: its 닫기 goes back to 마이페이지, still from the room', shown($('pg-hub')) && S().hub.tab === 'my' && S().hub.from === 'room');
    $('pg-hub-close').click(); await sleep(150);
    ok('room: 닫기 returns to the room (not the title), the focus back on 꾸미기', shown($('pg-room')) && $('pg-hub').hidden && $('pg-title').hidden && document.activeElement === look, [document.activeElement && document.activeElement.id]);
    ok('room: my card\'s bust wears the hat now, and the room\'s picker busts too', hashOf(myCard()) !== c0 && hashOf(myPick()) !== p0);
    look.click(); await sleep(80); key('Escape'); await sleep(80);
    ok('room: Escape in the hub returns to the room as well', shown($('pg-room')) && $('pg-hub').hidden);
    look.click(); await sleep(80); $('pg-tab-shop').click(); await sleep(20); slotTab('h'); pickCell('h1'); $('pg-shop-buy').click(); $('pg-shop-buy').click(); await sleep(60);
    ok('room: the 상점 works from the room too (bought and worn)', S().own.includes('h1') && S().eq[0] === '1', [S().own, S().eq]);
    const c1 = hashOf(myCard());
    $('pg-hub-close').click(); await sleep(150);
    ok('room: ... and my card follows', hashOf(myCard()) !== c1);
    // (looks-per-animal.md L2) 꾸미기 opens on the room's animal; dressing another animal (the cat) changes neither my
    // card nor the R - only the room picker's cat bust
    const catPick = () => document.querySelector('#pg-room-pick .pg-pick-btn[data-char="cat"] canvas');
    const c2 = hashOf(myCard()), p2 = hashOf(myPick()), k2 = hashOf(catPick()), r2 = JSON.stringify(D.mp.state().roster.map((r) => r.lk)), R2 = JSON.stringify(D.mp.state().tro.R && D.mp.state().tro.R.p);
    look.click(); await sleep(80);
    ok('room: 꾸미기 opens on the room\'s animal (my seat: the duck)', S().hub.ani === 'duck' && D.mp.seat() === 'duck', [S().hub.ani, D.mp.seat()]);
    SH.ani('cat'); eqTab('h'); cell('h5').click(); await sleep(60);
    $('pg-hub-close').click(); await sleep(150);
    ok('room: dressing the cat there changes neither my card nor the roster / R (the duck plays); the room picker\'s cat bust follows',
      SH.look('cat')[0] === '5' && hashOf(myCard()) === c2 && hashOf(myPick()) === p2 && hashOf(catPick()) !== k2 && JSON.stringify(D.mp.state().roster.map((r) => r.lk)) === r2 && JSON.stringify(D.mp.state().tro.R && D.mp.state().tro.R.p) === R2, [SH.look('cat'), r2]);
    const rules = [...$('pg-room-rules').children].map((li) => li.textContent);
    ok('room: the rules say what this room pays (practice over bc: no coins)', rules.includes(S().prac || D.mp.state().tro.q ? '연습 경기라 비누 코인도 없어요' : '이기든 지든 비누 코인을 받아요'), rules);
    D.mp.leave(); await sleep(150);
    ok('room: leaving goes to 친구와 하기 as before', shown($('pg-friends')) && $('pg-hub').hidden);
    // a game starting while the hub is open (a guest's guestBegin: showOverlay(null)) closes it - no panel over the game
    D.toTitle(); SH.open('my'); await sleep(40);
    D.local.coop(['duck', 'cat'], 0); await sleep(40);
    ok('hub: a game starting while it is open closes it (and the panel-open class)', $('pg-hub').hidden && !$('pg-app').classList.contains('pg-panel-open') && D.getState().phase !== 'title');
    D.toTitle();
  }
  // the fit (9.11) at this viewport / stage: the title row on one line, the hub never sideways, no vertical scroll where
  // it must not (opt.noScroll: 'all' | 'shop' | ''), the action button beside the preview
  async function hubFitAt(label, opt) {
    D.toTitle(); await sleep(150);
    try { await document.fonts.ready; } catch (e) { /* ignore */ }   // (the web fonts' metrics, not a fallback's mid-load)
    await sleep(250);
    // (layout boxes: the 상점 button's NEW-dot hop is a transform, not layout - it is taken off while measuring)
    const card = document.querySelector('.pg-title-card'), row = $('pg-start').parentNode, sb = $('pg-shop-btn'), hop = sb.classList.contains('is-nudge');
    sb.classList.remove('is-nudge');
    const cr = card.getBoundingClientRect(), bs = ['pg-start', 'pg-friends-btn', 'pg-shop-btn'].map((id) => $(id).getBoundingClientRect());
    if (hop) sb.classList.add('is-nudge');
    // (touch: the 상점 button's invisible 44 px target, ::after, may reach past a row that ends at the button - into the
    // card's padding)
    const hit = Math.max(0, -parseFloat(getComputedStyle(sb, '::after').right) || 0);
    info(label + ': title row ' + bs.map((r) => Math.round(r.width)).join(' + ') + ' in ' + Math.round(row.clientWidth) + ' (label ' + (shown(document.querySelector('.pg-shopbtn-tx')) ? 'shown' : 'icon-only') + '), card ' + card.scrollHeight + '/' + card.clientHeight);
    ok(label + ': the title\'s 3 buttons on one row inside the card, as tall as each other, no overflow', bs.every((r) => Math.abs(r.top - bs[0].top) < 0.6 && Math.abs(r.height - bs[0].height) < 0.6) && row.scrollWidth <= row.clientWidth + 1 + hit && bs[0].left >= cr.left && bs[2].right <= cr.right, bs.map((r) => [+r.left.toFixed(1), +r.top.toFixed(1), +r.right.toFixed(1), +r.height.toFixed(1)]).concat([[+cr.left.toFixed(1), +cr.right.toFixed(1), row.scrollWidth, row.clientWidth]]));
    ok(label + ': the title card does not scroll', card.scrollHeight <= card.clientHeight + 1, [card.scrollHeight, card.clientHeight]);
    // (review 2026-10-18: the label wherever the row has room - so an icon-only button means a labelled one would not
    // fit: forced on, the row would leave the card)
    if (!shown(document.querySelector('.pg-shopbtn-tx'))) {
      sb.classList.remove('is-nudge', 'is-tight'); sb.classList.add('is-label'); row.classList.add('is-snug');
      const r2 = sb.getBoundingClientRect(), c2 = card.getBoundingClientRect(), wide = r2.right > c2.right - parseFloat(getComputedStyle(card).paddingRight) + 0.5;
      ok(label + ': the 상점 button is icon-only only because its label would not fit the row', wide, [Math.round(r2.right), Math.round(c2.right), Math.round(cr.width), Math.round(c2.width)]);
      window.dispatchEvent(new Event('resize')); await sleep(60);   // (fit() measures the row again: the classes as the game sets them)
    } else ok(label + ': the 상점 button shows its label "상점"', shown(document.querySelector('.pg-shopbtn-tx')));
    for (const st of ['first', 'buy', 'legend', 'poor', 'locked', 'armed', 'e6', 'full', 'starter', 'empty', 'my', 'ani', 'hint', 'hintbuy']) {
      await hubStage(st); await sleep(60);
      const pn = $('pg-hub'), cd = pn.querySelector('.pg-hub-card'), r = cd.getBoundingClientRect(), tab = S().hub.tab;
      const out = [...cd.querySelectorAll('*')].filter((e) => { if (!e.getClientRects().length || e.closest('[hidden]')) return false; const b = e.getBoundingClientRect(); return b.width && (b.left < r.left - 0.5 || b.right > r.right + 0.5); }).map((e) => e.id || e.className || e.tagName);
      ok(label + ' ' + st + ': nothing goes sideways', pn.scrollWidth <= pn.clientWidth + 1 && !out.length, [pn.scrollWidth, pn.clientWidth, out.slice(0, 4)]);
      // (looks-per-animal.md 4.1 / 4.2 / 4.0) the pill inside the card; 마이페이지's row of six on one line; the footer
      // message in at most two lines (the 44 px row)
      const pl = document.querySelector('.pg-hub-pane:not([hidden]) .pg-look-name').getBoundingClientRect();
      ok(label + ' ' + st + ': the name pill inside the card, on the preview\'s top border', pl.top >= r.top && pl.left >= r.left && pl.right <= r.right && pl.width > 10, [Math.round(pl.top), Math.round(r.top)]);
      if (tab === 'my') { const bs = [...$('pg-my-anis').children].map((b) => b.getBoundingClientRect()); ok(label + ' ' + st + ': the row of six on one line inside the card', bs.length === 6 && bs.every((b) => Math.abs(b.top - bs[0].top) < 0.6 && b.left >= r.left && b.right <= r.right && b.width >= 24), bs.map((b) => Math.round(b.width))); }
      const hm = $('pg-hub-msg'), lh = parseFloat(getComputedStyle(hm).lineHeight) || 16;
      if (hm.textContent) ok(label + ' ' + st + ': the message "' + hm.textContent + '" in at most two lines', hm.offsetHeight <= 2 * lh + 1, [hm.offsetHeight, lh, Math.round(hm.getBoundingClientRect().width)]);
      if (opt.noScroll === 'all' || (opt.noScroll === 'shop' && tab === 'shop')) ok(label + ' ' + st + ': the ' + (tab === 'shop' ? '상점' : '마이페이지') + ' tab shows whole (no vertical scroll)', pn.scrollHeight <= pn.clientHeight + 1, [pn.scrollHeight, pn.clientHeight]);
      else info(label + ' ' + st + ': panel ' + pn.scrollHeight + '/' + pn.clientHeight);
      if (tab === 'shop') {
        const v = $('pg-shop-view').getBoundingClientRect(), bb = $('pg-shop-buy').getBoundingClientRect();
        ok(label + ' ' + st + ': the action button beside the preview', bb.left >= v.right && bb.top < v.bottom && bb.bottom > v.top, [Math.round(v.right), Math.round(bb.left), Math.round(bb.top), Math.round(v.bottom)]);
      }
      SH.close();
    }
    // (4.0) the tab row and a 4-digit chip on one line (hubTopFit not needed); not at 1x (scrolls by design)
    if (opt.tabRow) for (const ce of [9999, 8888]) {
      fresh(20261020); SH.set({ ce, sh: 1 }); SH.open('shop'); await sleep(60);
      const tb = document.querySelector('#pg-hub .pg-tabs'), ch = $('pg-hub-coins');
      ok(label + ': the tab row and the chip "' + $('pg-hub-co').textContent + '" on one line, not snug', ch.offsetTop < tb.offsetTop + tb.offsetHeight - 2 && !S().hub.snug, [ch.offsetTop, tb.offsetTop, tb.offsetHeight, S().hub.snug]);
      SH.close();
    }
  }
  async function hubFitTests() {
    if (/hubfit/.test(location.hash)) {
      const ns = (/[&#]ns=(\w+)/.exec(location.hash) || [])[1] || 'all';
      if (/touch/.test(location.hash)) window.dispatchEvent(new Event('touchstart'));
      const sc = (/[&#]s=([\d.]+)/.exec(location.hash) || [])[1]; if (sc) setScale(+sc);   // (&s=1: the stage at 1x - headless windows have a minimum size)
      await hubFitAt('this viewport (' + innerWidth + 'x' + innerHeight + ')', { noScroll: ns === 'none' ? '' : ns, tabRow: !sc });
      return;
    }
    setScale(1); await hubFitAt('1x (256x224)', { noScroll: '' });
    setScale(2); await hubFitAt('2x (512x448)', { noScroll: 'all', tabRow: true });
    const st = $('pg-stage'); st.style.flex = ''; st.style.width = ''; st.style.height = ''; window.dispatchEvent(new Event('resize'));
    await hubFitAt('desktop ' + innerWidth + 'x' + innerHeight, { noScroll: 'all', tabRow: true });
  }

  // ---------------------------------------------------------------- the hub, staged (shots and the fit runs)
  const ALL = () => SH.items().filter((it) => it.price > 0).map((it) => it.id);
  const pickCell = (id) => { const b = document.querySelector('#pg-hub .pg-hub-pane:not([hidden]) [role="option"][data-id="' + id + '"]'); if (b) b.click(); return b; };
  const slotTab = (s) => { const b = document.querySelector('#pg-shop-slots [data-slot="' + s + '"]'); if (b) b.click(); return b; };
  const eqTab = (s) => { const b = document.querySelector('#pg-my-slots [data-slot="' + s + '"]'); if (b) b.click(); return b; };
  // the hub opened in a staged state, a fresh store each: 상점 - first (never opened: the intro), buy (the cheapest
  // affordable item selected), armed (사기 tapped once), bought, poor, locked, legend (a 전설 selected, affordable), e6 (the
  // rainbow footprints walking in the preview); 마이페이지 - starter (nothing owned yet), full (everything owned, 머리
  // shown: 13 cells), empty (얼굴: nothing owned there), my (a few items, a streak); looks-per-animal.md 11.1: ani
  // (마이페이지 on 냥냥, the duck and the cat dressed differently, the otter in a cape only: its dot), hint (a migrated
  // store, lh: the note), hintbuy (the 상점 with lh, a cape just bought: the longest footer line)
  async function hubStage(st, from) {
    fresh(20261020);
    const tab = /^(starter|full|empty|my|ani|hint)$/.test(st) ? 'my' : 'shop';
    if (st === 'ani') { SH.set({ ce: 2345, sh: 1, bs: 3, own: ['h5', 'f2', 'n6', 'e6', 'h1', 'n3', 'b1'], eq: '52606' + '00000' + '00010' + '00000' + '10310' + '00000' }); T.set({ t: 345, best: 400, bl: 3 }); }
    else if (st === 'hint') { SH.set({ ce: 420, sh: 1, bs: 3, own: ['h5', 'f2', 'n6'], eq: '52600', lh: 1 }); T.set({ t: 345, best: 400, bl: 3 }); }
    else if (st === 'hintbuy') SH.set({ ce: 1234, sh: 1, own: ['h5'], eq: '50000', lh: 1 });
    if (/^(ani|hint|hintbuy)$/.test(st)) { /* (set above) */ }
    else if (st === 'first') SH.set({ ce: 0, sh: 0 });
    else if (st === 'starter') SH.set({ ce: 0, sh: 1, seen: 0 });
    else if (st === 'full') { T.set({ bl: 6, t: 1300, best: 1300 }); SH.set({ ce: 2345, sp: 0, sh: 1, own: ALL(), eq: 'c7520' }); }
    else if (st === 'empty') SH.set({ ce: 300, sh: 1, own: ['h1', 'n3', 'b1'], eq: '10310' });
    else if (st === 'my') { SH.set({ ce: 420, sh: 1, own: ['h5', 'f2', 'n6', 'e6'], eq: '52606', bs: 3 }); T.set({ t: 345, best: 400, bl: 3 }); }
    else SH.set({ ce: st === 'poor' ? 100 : 1234, sh: 1 });
    if (st === 'legend') T.set({ bl: 6, t: 1250, best: 1250 });
    if (from !== 'room') { D.toTitle(); await sleep(60); }
    SH.open(tab, from || 'title');
    if (st === 'poor') pickCell('h5');
    if (st === 'locked') pickCell('h8');
    if (st === 'legend') { slotTab('h'); pickCell('hc'); }
    if (st === 'e6') { slotTab('e'); pickCell('e6'); }
    if (st === 'armed' || st === 'bought') { pickCell('h5'); $('pg-shop-buy').click(); if (st === 'bought') { await sleep(300); $('pg-shop-buy').click(); } }
    if (st === 'hintbuy') { slotTab('b'); pickCell('b1'); $('pg-shop-buy').click(); await sleep(300); $('pg-shop-buy').click(); }
    if (st === 'full') eqTab('h');
    if (st === 'empty') eqTab('f');
    if (st === 'ani') { SH.ani('cat'); eqTab('h'); }
    await sleep(80);
  }

  // ---------------------------------------------------------------- screenshot scenes
  async function shot(name) {
    const s = /[&?]s=([\d.]+)/.exec(location.hash); if (s) setScale(+s[1]);
    fresh(20261020); SH.set({ ce: 1234 }); G.hiscore = 123456;   // (a balance, not the first coins, no bonus due: the card shows "1,2xx개")
    if (name === 'over') await overBoth();
    else if (name === 'ending') await endingBoth();
    else if (name === 'podium') {
      D.local.battle(['duck', 'cat', 'frog', 'otter'], { arena: 0, countdown: false, monsters: false, intrusion: false });
      D.setInvincible(true); D.step(10);
      G.players.forEach((p, k) => { p.score = [2100, 3400, 800, 1200][k]; });
      D.endBattle(); const pd = SH.pod(38, 20);
      while (G.podium.t < pd.t1 + 10) D.step(1);
      D.step(0);
    } else if (name === 'play' || name === 'podhat') {
      // four players, all four wearing hats (and more): two ducks, so 2P is a twin (pink body, its 바가지 모자 still yellow)
      const Q = new URLSearchParams(location.hash.slice(1)), a = +(Q.get('arena') || 0);
      const looks = [lkOf('hc', 'f5', 'n7', 'b6'), lkOf('h5', 'f1', 'n3', 'b2'), lkOf('h9', 'f4', 'n8', 'b7'), lkOf('h1', 'f2', 'n2', 'b3')];
      const nick = ['뽀숑', '까삐', '개굴', '말랑두부'];
      D.seed(5);
      L.battle(['duck', 'duck', 'cat', 'frog'].map((c, k) => ({ char: c, look: looks[k], nick: nick[k], local: true })), { arena: a, countdown: false, monsters: false, intrusion: false });
      D.setInvincible(true); D.step(30);
      for (const p of G.players) p.invuln = 0;
      if (Q.get('bare')) SH.bare(true);
      const P = (s) => G.players.find((p) => p.slot === s);
      if (name === 'podhat') {
        G.players.forEach((p, k) => { p.score = [1200, 3400, 800, 2100][k]; });
        D.endBattle(); D.step(150);
      } else {
        // 1P and 2P side by side (16 px apart: compact tags), 3P jumping beside them, 4P shooting from its own spot
        const p0 = P(0), y = p0.y, x = Math.min(p0.x, 150);
        P(1).x = x + 16; P(1).y = y; P(2).x = x + 34; P(2).y = y;
        D.step(2);
        D.press('jump', true, 2); D.step(1); D.press('jump', false, 2);
        D.press('shoot', true, 3); D.step(1); D.press('shoot', false, 3);
        D.step(12);
      }
      G.parts = []; G.pops = []; G.words = []; G.banner = null; G.bannerQ = []; G.shake = 0; D.step(0);
    } else if (name === 'title') {
      // (the title with the 상점 button: coins and something to buy -> its NEW dot; &tro=1: 마이페이지's badge too. The
      // six busts each in their own set - looks-per-animal.md L3: the penguin bare)
      SH.set({ own: ['h5', 'n3', 'f5', 'h9', 'f2'], eq: '50000' + '00300' + '05000' + '00000' + '90000' + '02000' });
      D.toTitle(); await sleep(400);
    } else if (name === 'hub' || name === 'room') {
      const Q = new URLSearchParams(location.hash.slice(1));
      if (name === 'room') { await D.mp.host({ mode: 'coop', nick: '뽀숑', char: 'duck' }); await sleep(300); }
      await hubStage(Q.get('st') || 'buy', name === 'room' ? 'room' : 'title');
      if (name === 'room' && Q.get('close')) { SH.close(); await sleep(200); }
      // (&scroll=1: the panel scrolled to its end - what a phone sees after scrolling)
      if (Q.get('scroll')) { const pn = $('pg-hub'); pn.scrollTop = pn.scrollHeight; }
      if (name === 'hub') SH.tick(+(Q.get('tick') || 60));   // (the preview's frames: headless virtual time draws few)
      // (&big=1: the preview blown up 8x over the page, to look at its pixels)
      if (Q.get('big')) { const cv = document.querySelector('.pg-hub-pane:not([hidden]) .pg-look-view canvas'), o = document.createElement('canvas'); o.width = 256; o.height = 256;
        o.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;image-rendering:pixelated'; const x = o.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(cv, 0, 0, 256, 256); document.body.appendChild(o); }
      await sleep(400);
    } else if (name === 'sheet') {
      // the game's own composites at 3x: every animal (rows) x idle 0 / walk 1 / jump / the move pose / idle 0 mirrored
      // (columns) x two sets (&part=0: sets 0, 1; 1: 2, 3), then the six portraits wearing each set at 2x
      const part = +((/[&?]part=(\d)/.exec(location.hash) || [])[1] || 0), sets = [[SETS[0], SETS[11]], [lkOf('hc', 'f7', 'n5', 'b2'), lkOf('h7', 'f6', 'n6', 'b4')]][part] || [SETS[0], SETS[1]];
      const K = 3, cell = 24 * K + 4, cols = [['idle', 0, false], ['walk', 1, false], ['jump', 0, false], ['move', 0, false], ['idle', 0, true]];
      const sh = document.createElement('canvas'); sh.width = Math.max(sets.length * cols.length * cell + 8, sets.length * (ANIMALS.length * 68 + 12) + 8); sh.height = ANIMALS.length * cell + 32 * 2 + 30;
      sh.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#0b2427;image-rendering:pixelated';
      const sx = sh.getContext('2d'); sx.imageSmoothingEnabled = false; sx.fillStyle = '#0b2427'; sx.fillRect(0, 0, sh.width, sh.height);
      const blit = (px, X, Y, k, flip) => { const c = document.createElement('canvas'); c.width = px.w; c.height = px.h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.d), px.w, px.h), 0, 0);
        sx.save(); if (flip) { sx.translate(X + px.w * k, Y); sx.scale(-1, 1); sx.drawImage(c, 0, 0, px.w * k, px.h * k); } else sx.drawImage(c, X, Y, px.w * k, px.h * k); sx.restore(); };
      ANIMALS.forEach((c, r) => sets.forEach((lk, si) => cols.forEach(([anim, fi, flip], ci) => {
        const an = anim === 'move' ? (MOVE[c] ? MOVE[c][0] : 'shoot') : anim, px = SH.pixels(c, an, fi, lk);
        const X = 4 + (si * cols.length + ci) * cell, Y = r * cell;
        sx.fillStyle = '#123236'; sx.fillRect(X, Y, 24 * K, 24 * K); sx.fillStyle = '#2f7f78'; sx.fillRect(X, Y + 24 * K - 1, 24 * K, 1);
        if (px) blit(px, X + (px.w === 16 ? 4 * K : 0), Y + (px.h === 16 ? 8 * K : 0), K, flip);
      })));
      sets.forEach((lk, si) => ANIMALS.forEach((c, k) => { const px = SH.portrait(c, lk); if (px) blit(px, 4 + si * (ANIMALS.length * 68 + 12) + k * 68, ANIMALS.length * cell + 6, 2, false); }));
      document.body.appendChild(sh);
    }
    // &zoom=x,y,w,h: that canvas region blown up (pixelated) over the page, to look at single pixels (&zoomp=slots: the
    // region round those players, e.g. zoomp=0,1)
    let z = ((/[&?]zoom=([\d,]+)/.exec(location.hash) || [])[1] || '').split(',').map(Number);
    const zp = ((/[&?]zoomp=([\d,]+)/.exec(location.hash) || [])[1] || '').split(',').filter(Boolean).map(Number).map((s) => G.players.find((p) => p.slot === s)).filter(Boolean);
    if (zp.length) { const x0 = Math.min(...zp.map((p) => p.x)) - 14, x1 = Math.max(...zp.map((p) => p.x)) + 30, y0 = Math.min(...zp.map((p) => p.y)) - 26, y1 = Math.max(...zp.map((p) => p.y)) + 20; z = [x0, y0, x1 - x0, y1 - y0].map((v) => Math.max(0, Math.round(v))); }
    if (z.length === 4 && z.every((v) => v >= 0)) {
      const src = $('pg-canvas'), k = Math.max(1, Math.floor(Math.min(innerWidth * 0.75 / z[2], innerHeight * 0.72 / z[3])));
      const o = document.createElement('canvas'); o.width = z[2] * k; o.height = z[3] * k;
      o.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#000;image-rendering:pixelated';
      const ox = o.getContext('2d'); ox.imageSmoothingEnabled = false; ox.drawImage(src, z[0], z[1], z[2], z[3], 0, 0, o.width, o.height);
      document.body.appendChild(o);
    }
    await sleep(300);
    log('SHOP SHOT READY ' + name);
  }
  async function run() {
    for (let i = 0; i < 300 && !(window.PG && PG.debug && PG.debug.shop); i++) await sleep(20);
    D = PG.debug; T = D.tro; SH = D.shop; G = D.G; L = D.local;
    const sm = /shot=([a-z]+)/.exec(location.hash);
    if (sm) { if (/touch/.test(location.hash)) window.dispatchEvent(new Event('touchstart')); await shot(sm[1]); return; }
    if (/[?&]perf=1/.test(location.search + location.hash)) {
      // bare / four hats / four full sets with an effect, alternating (best of 5 each, three rounds)
      const sets = { bare: ['00000', '00000', '00000', '00000'], hats: [lkOf('hc'), lkOf('h9'), lkOf('h5'), lkOf('h1')], full: [lkOf('hc', 'f5', 'n7', 'b6', 'e6'), lkOf('h9', 'f1', 'n3', 'b2', 'e4'), lkOf('h5', 'f4', 'n8', 'b7', 'e1'), lkOf('h1', 'f2', 'n2', 'b3', 'e3')] };
      const best = { bare: 1e9, hats: 1e9, full: 1e9 };
      const ks = ['bare', 'hats', 'full'];
      for (let r = 0; r < 6; r++) for (let i = 0; i < 3; i++) { const k = ks[(i + r) % 3]; best[k] = Math.min(best[k], perf(sets[k])); } // (the order rotates)
      const pc = (k) => Math.round((best[k] / best.bare - 1) * 1000) / 10;
      log('SHOP PERF bare ' + best.bare + ' ms/frame, 4 hats ' + best.hats + ' (' + pc('hats') + ' %), 4 full sets + effects ' + best.full + ' (' + pc('full') + ' %)');
      log('SHOP DONE pass=1 fail=0'); return;
    }
    // (hubFitTests before cardTests: that one turns touch mode on for good - the 1x / 2x / desktop rows are mouse ones)
    const steps = /room/.test(location.hash) ? [roomTests] : HUBFIT ? [hubFitTests] : FIT_ONLY ? [cardTests] : [econTests, runTests, dayTests, paceTests, storeTests, hubFitTests, cardTests, fontTests, renderTests, wearTests, fxTests, hubTests, myTests, viewTests, reviewTests];
    for (const f of steps) {
      try { await f(); } catch (e) { fail++; log('SHOP FAIL ' + f.name + ' threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
    }
    T.today(null);
    log('SHOP DONE pass=' + pass + ' fail=' + fail);
  }
  setTimeout(run, 50);
})();
