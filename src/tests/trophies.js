// v4 trophies (design/trophies.md §15.1): the pure rules and the store, offline in virtual time.
//   node bogeul/build.js
//   node bogeul/tools/run-chrome.js test-trophies.html tro-unit.png 900 760 90000 "TROPHY DONE"
//   a real phone viewport (the fit part only): node bogeul/tools/cdp-run.js "test-trophies.html#fit" C:/Temp/bogeul/tro-fit-320.png 320 568 30000 "TROPHY DONE" 1
// Checks: the store (fresh, clamps, a newer schema, unreadable JSON, blocked storage), read-modify-write and the storage
// event, the rules table (every row of §3.1, the ties and leavers, random invariants), applying a result (hostile rows,
// once, too early, 견습, the floor at 0, the stats, 승급 once), holding and every way a hold ends (§5.4, stale foreign
// holds), the 목욕 보너스 (runs, caps, days, 2회차, nothing for local co-op / the demo), the title badge and 내 기록 (keys,
// focus, never a solo start), the fit of the title / 내 기록 / 목욕 끝 cards at 1x, 2x and a 320 px phone, the 트로피 row and
// the 승급 chip, and the web-font warm-up of every trophy string.
// Prints "TROPHY PASS|FAIL <name>", "TROPHY INFO ..." and "TROPHY DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => { if (cond) { pass++; log('TROPHY PASS ' + name); } else { fail++; log('TROPHY FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); } return !!cond; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const FIT_ONLY = /fit/.test(location.hash);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let D, T, G;
  const S = () => T.state();
  const raw = () => { try { return JSON.parse(localStorage.getItem(S().key)); } catch (e) { return null; } };
  let nsN = 0;
  const fresh = (t) => { T.ns('u' + (++nsN)); T.away(false); if (t !== undefined) T.set({ t }); return S(); };
  const MID = (i) => 'abc123.' + i;
  const key = (code, k) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: k || code, bubbles: true, cancelable: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: k || code, bubbles: true })); };
  // (a dt / dd row group is display: contents - it has no box of its own: its dd's box counts)
  const shown = (e) => !!e && !e.hidden && (e.getClientRects().length > 0 || (getComputedStyle(e).display === 'contents' && [...e.children].some((c) => c.getClientRects().length > 0)));

  // ---------------------------------------------------------------- 1. the store
  function storeTests() {
    let s = fresh();
    ok('store: a fresh store has the gift (30), v 4 (the 뽑기, design/gacha.md 5.1) and an 8-character dev', s.t === 30 && s.best === 30 && /^[0-9a-z]{8}$/.test(s.dev) && raw() && raw().v === 4 && raw().t === 30, [s.t, s.dev, raw()]);
    const dev = s.dev, name = 'u' + nsN;
    T.ns(name);
    ok('store: it round-trips (same dev and count on a reload)', S().dev === dev && S().t === 30 && !S().mem && !S().ro, S());
    // clamps: hand-edited / hostile values
    const now = Date.now(), e = (i, o) => Object.assign({ m: MID(i), tab: 'zzzzzz', h: 16, s: 10, n: 4, p: 0, st: 'open', t0: now }, o || {});
    const bad = { v: 1, dev: 'abcdefgh', t: 1e9, best: -5, bl: 99, w: -1, g: 1e9, ko: 'x', day: 0, de: 999, seen: 'yes',
      esc: [e(1, { m: 'nope' }), e(2, { tab: 'TOO-LONG-TAB' }), e(3, { h: 999, s: 7, n: 9, st: 'weird' }), e(4), e(5), e(6), e(7), e(8), e(9), e(10), e(11), null, 'x'] };
    localStorage.setItem('ppogeul-trophy-clamp', JSON.stringify(bad));
    s = T.ns('clamp');
    ok('store: t 1e9 -> 99999, best >= t, bl <= 6, negatives -> 0, g <= 1e6, de <= 20', s.t === 99999 && s.best === 99999 && s.bl === 6 && s.w === 0 && s.g === 1e6 && s.ko === 0 && s.de === 20 && s.seen === 1, s);
    ok('store: bad mids / tabs dropped, more than 8 holds trimmed to the newest 8, each hold clamped', s.esc.length === 8 && s.esc.every((q) => /^abc123\.\d+$/.test(q.m) && q.tab === 'zzzzzz') && s.esc[0].m === MID(4) && s.esc.every((q) => q.h <= 56 && [0, 5, 10, 20, 50].includes(q.s) && q.n >= 2 && q.n <= 4 && (q.st === 'open' || q.st === 'wait')), s.esc.map((q) => [q.m, q.h, q.s, q.n, q.st]));
    // a newer page's data: read-only, never overwritten
    const newer = JSON.stringify({ v: 5, dev: 'abcdefgh', t: 777, extra: [1, 2] }); // (v 5: newer than this page's v 4)
    localStorage.setItem('ppogeul-trophy-newer', newer);
    s = T.ns('newer');
    ok('store: v 5 on disk -> read-only (a fresh store in memory)', s.ro === true && s.t === 30, s);
    T.openRec(); T.closeRec(); T.set({ t: 99 });
    ok('store: ... and the key is unchanged afterwards', localStorage.getItem('ppogeul-trophy-newer') === newer);
    localStorage.setItem('ppogeul-trophy-junk', '{not json');
    s = T.ns('junk');
    ok('store: unreadable JSON -> a fresh store (the gift), written back as valid JSON', s.t === 30 && !s.ro && raw() && raw().v === 4, [s.t, localStorage.getItem('ppogeul-trophy-junk')]);
    // blocked storage: everything in memory, no exceptions
    const P = Storage.prototype, gi = P.getItem, si = P.setItem;
    let threw = null;
    try {
      P.getItem = function () { throw new Error('blocked'); }; P.setItem = function () { throw new Error('blocked'); };
      s = T.ns('blocked');
      T.set({ t: 45 }); T.openRec(); T.closeRec();
      ok('store: storage that throws -> this session only (mem), the count still works', S().mem === true && S().t === 45, S());
      T.openRec();
      ok('store: ... 내 기록 says it is not saved', /저장되지 않아요/.test($('pg-rec-note').textContent), $('pg-rec-note').textContent);
      T.closeRec();
    } catch (er) { threw = er; } finally { P.getItem = gi; P.setItem = si; }
    ok('store: no exception with blocked storage', !threw, threw && threw.message);
  }

  // ---------------------------------------------------------------- 2. read-modify-write
  function rmwTests() {
    fresh(30);
    const k = S().key, o = raw();
    o.t = 77; localStorage.setItem(k, JSON.stringify(o));            // another tab of this browser wrote
    T.openRec(); T.closeRec();                                         // any change (opening 내 기록 sets seen)
    ok('rmw: a change builds on the stored 77, not on this tab\'s stale 30', S().t === 77 && raw().t === 77 && raw().seen === 1, [S().t, raw()]);
    o.t = 123; o.seen = 1; localStorage.setItem(k, JSON.stringify(o));
    window.dispatchEvent(new StorageEvent('storage', { key: k }));
    ok('rmw: a storage event updates the badge', $('pg-tro-n').textContent === '123' && S().t === 123, $('pg-tro-n').textContent);
  }

  // ---------------------------------------------------------------- 3. the rules (§3.1)
  const nets = (n, s, fin, gl) => T.table(n, s, fin, gl).map((r) => r[2] + r[3] - s);
  const fins = (n, sc) => Array.from({ length: n }, (_, i) => ({ slot: i, sc: sc ? sc[i] : 1000 - 100 * i, k: 0, ko: 0, p: 0 }));
  function ruleTests() {
    const WANT = {
      0: { 2: [10, -6], 3: [12, 3, -6], 4: [14, 6, -2, -6] },
      5: { 2: [15, -11], 3: [22, -2, -11], 4: [29, 1, -7, -11] },
      10: { 2: [20, -16], 3: [32, -7, -16], 4: [44, -4, -12, -16] },
      20: { 2: [30, -26], 3: [52, -17, -26], 4: [74, -14, -22, -26] },
      50: { 2: [60, -56], 3: [112, -47, -56], 4: [164, -44, -52, -56] },
    };
    const bad = [];
    for (const s of [0, 5, 10, 20, 50]) for (const n of [2, 3, 4]) { const got = nets(n, s, fins(n), 0); if (!same(got, WANT[s][n])) bad.push([s, n, got]); }
    ok('rules: every distinct-places row of the §3.1 table (n 2/3/4 x stakes 0/5/10/20/50)', !bad.length, bad);
    const tie = (n, groups) => { const f = []; let slot = 0; groups.forEach((g, gi) => { for (let j = 0; j < g; j++) f.push({ slot: slot++, sc: 1000 - 100 * gi, k: 0, ko: 0, p: 0 }); }); return f; };
    const CASES = [
      ['4 players, 2nd = 3rd', nets(4, 10, tie(4, [1, 2, 1]), 0), [44, -8, -8, -16]],
      ['4 players, 1st = 2nd', nets(4, 10, tie(4, [2, 1, 1]), 0), [20, 20, -12, -16]],
      ['3 players, 1st = 2nd', nets(3, 10, tie(3, [2, 1]), 0), [13, 13, -16]],
      ['3 players, 2nd = 3rd', nets(3, 10, tie(3, [1, 2]), 0), [32, -11, -11]],
      ['1v1 tie: 무승부', nets(2, 10, tie(2, [2]), 0), [0, 0]],
      ['all 4 tied: 무승부', nets(4, 10, tie(4, [4]), 0), [0, 0, 0, 0]],
      ['4 players, one left on purpose', nets(4, 10, fins(3), 1), [44, -4, -12]],
      ['4 players, one link dropped (no gg)', nets(4, 10, fins(3), 0), [34, -4, -12]],
      ['4 players, three left on purpose (기권승)', nets(4, 10, fins(1), 3), [44]],
      ['1v1, the other left on purpose (기권승)', nets(2, 10, fins(1), 1), [20]],
      ['4 players, three finishers all tied, one left on purpose', nets(4, 10, tie(3, [3]), 1), [3, 3, 3]],
    ];
    for (const [name, got, want] of CASES) ok('rules: ' + name + ' -> ' + want.join(' / '), same(got, want), got);
    ok('rules: 1v1 or 4 players, everyone else dropped without gg -> void ([])', T.table(2, 10, fins(1), 0).length === 0 && T.table(4, 10, fins(1), 0).length === 0);
    ok('rules: a tie on (score, kos, koed) only - the host\'s slot 0 does not win a tie', same(T.table(2, 0, [{ slot: 0, sc: 5, k: 1, ko: 0, p: 0 }, { slot: 1, sc: 5, k: 1, ko: 0, p: 0 }], 0).map((r) => r[1]), [1, 1]));
    ok('rules: kos break a score tie', same(nets(2, 0, [{ slot: 1, sc: 5, k: 2, ko: 0, p: 0 }, { slot: 0, sc: 5, k: 1, ko: 0, p: 0 }], 0), [10, -6]));
    ok('rules: 견습 at 시작! loses nothing by place (its base 0), a bet still can', same(nets(2, 10, [{ slot: 0, sc: 9, k: 0, ko: 0, p: 1 }, { slot: 1, sc: 1, k: 0, ko: 0, p: 1 }], 0), [20, -10]));
    // random invariants
    let worst = { lo: 0, hi: 0 }, viol = [];
    let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let it = 0; it < 4000; it++) {
      const n = 2 + Math.floor(rnd() * 3), m = 1 + Math.floor(rnd() * n), gl = Math.floor(rnd() * (n - m + 1)), s = [0, 5, 10, 20, 50][Math.floor(rnd() * 5)];
      const fin = Array.from({ length: m }, (_, i) => ({ slot: i, sc: Math.floor(rnd() * 3) * 100, k: Math.floor(rnd() * 2), ko: 0, p: rnd() < 0.3 ? 1 : 0 }));
      fin.sort((a, b) => b.sc - a.sc || b.k - a.k);
      const rows = T.table(n, s, fin, gl), pot = s * (m + gl), shares = rows.reduce((a, r) => a + r[3], 0);
      if (m === 1 && !gl) { if (rows.length) viol.push(['m1', n, s]); continue; }
      if (rows.length !== m) viol.push(['rows', n, m, gl]);
      if (shares > pot || shares < pot - 3) viol.push(['pot', n, m, gl, s, shares, pot]);
      for (const r of rows) { const v = r[2] + r[3] - s; worst.lo = Math.min(worst.lo, v + s + 6); worst.hi = Math.max(worst.hi, v); if (v < -(s + 6) || v > 164) viol.push(['net', n, m, gl, s, v]); }
    }
    ok('rules: 4000 random results - the shares never pass the pot (and lose at most 3 to the floor), every net in -(s+6)..+164, m = 1 without gg is void', !viol.length, viol.slice(0, 5));
    log('TROPHY INFO random: lowest net + s + 6 = ' + worst.lo + ', highest net ' + worst.hi);
  }

  // ---------------------------------------------------------------- 4. applying a result (my own row, once, clamped)
  function applyTests() {
    T.fast(true);
    fresh(100);
    ok('hold: stake 10 at 100 holds 16 (s + 6)', T.hold(MID(1), 10, 4, 0) === true && S().t === 84 && S().esc[0].h === 16 && S().esc[0].p === 0, S());
    ok('hold: once per match id', T.hold(MID(1), 10, 4, 0) === false && S().t === 84);
    let r = T.result(MID(1), [[1, 9, 999, 9999, 500]], 1, false);
    ok('apply: a hostile best row (place 9, base 999, share 9999, kos 500) is clamped: +14 + 40 - 10 = +44 at most', r && r.net === 44 && S().t === 144 && S().ko === 99 && S().esc.length === 0, [r, S().t]);
    ok('apply: a second apply of the same match changes nothing', T.result(MID(1), [[1, 1, 14, 40, 0]], 1, false) === null && S().t === 144);
    T.hold(MID(2), 10, 4, 0);
    r = T.result(MID(2), [[1, 1, -999, -5, 0]], 1, false);
    ok('apply: a hostile worst row (base -999, share -5) costs exactly the hold: -(s + 6)', r && r.net === -16 && S().t === 128, [r, S().t]);
    T.hold(MID(3), 10, 4, 0);
    ok('apply: my slot missing from the rows -> nothing (the hold stays)', T.result(MID(3), [[2, 1, 14, 40, 0]], 1, false) === null && S().esc.length === 1);
    ok('apply: an unknown match id -> nothing', T.result(MID(99), [[1, 1, 14, 40, 0]], 1, false) === null && S().esc.length === 1);
    T.close(MID(3), 'refund');
    ok('close: refund gives the hold back', S().t === 128 && S().esc.length === 0, S().t);
    T.fast(false);
    T.hold(MID(4), 10, 4, 60000);
    ok('apply: a result before the battle clock could have run is not applied (no fast)', T.result(MID(4), [[1, 1, 14, 40, 0]], 1, false) === null && S().esc.length === 1 && S().t === 112);
    T.close(MID(4), 'refund');
    T.fast(true);
    // 견습: placement never costs; a bet still can
    fresh(40);
    ok('hold: 견습 (40) holds only the stake', T.hold(MID(5), 10, 2, 0) && S().esc[0].h === 10 && S().esc[0].p === 1 && S().t === 30, S().esc);
    r = T.result(MID(5), [[1, 2, -6, 0, 0]], 1, false);
    ok('apply: 견습 last place loses only the stake (-10, not -16)', r && r.net === -10 && S().t === 30, r);
    T.hold(MID(6), 0, 2, 0);
    r = T.result(MID(6), [[1, 2, -6, 0, 0]], 1, false);
    ok('apply: 견습 at stake 0 loses nothing by place', r && r.net === 0 && S().t === 30 && S().esc.length === 0, r);
    ok('hold: refused (practice for me) when the count cannot cover the stake', fresh(5) && T.hold(MID(7), 10, 2, 0) === false && S().t === 5 && S().esc.length === 0);
    // the floor at 0 (only a safety net: a hold with p 0 below 60 cannot happen through the gates)
    fresh(0);
    T.set({ esc: [{ m: MID(8), tab: S().tab, h: 3, s: 10, n: 2, p: 0, st: 'open', t0: Date.now() }] });
    r = T.result(MID(8), [[0, 2, -6, 0, 0]], 0, true);
    ok('apply: the count never goes below 0', r && S().t === 0 && r.now === 0, [r, S().t]);
    // stats + 승급 once
    fresh(50);
    T.hold(MID(9), 10, 4, 0);
    r = T.result(MID(9), [[2, 1, 14, 40, 3]], 2, false);
    ok('apply: a win from 50 -> 94: w 1, g 1, ko 3, best 94, 승급 뽀득 새내기 (league 1)', r && r.win && r.now === 94 && r.promo === 1 && S().w === 1 && S().g === 1 && S().ko === 3 && S().best === 94 && S().bl === 1 && S().lg === 1, [r, S()]);
    T.hold(MID(10), 50, 2, 0);
    r = T.result(MID(10), [[2, 2, -6, 0, 0]], 2, false);
    ok('apply: a loss back into 견습 (38): the league follows the count down, no 승급', r && !r.win && r.now === 38 && S().lg === 0 && S().bl === 1 && S().g === 2 && r.promo === -1, [r, S().lg]);
    T.hold(MID(11), 20, 2, 0);
    r = T.result(MID(11), [[2, 1, 10, 40, 0]], 2, false);
    ok('apply: back into 뽀득 새내기 (68): no second 승급', r && r.now === 68 && r.promo === -1 && S().w === 2, r);
    T.hold(MID(12), 0, 2, 0);
    r = T.result(MID(12), [[2, 1, 0, 0, 0], [3, 1, 0, 0, 0]], 2, false);
    ok('apply: a draw (place 1, base 0) is not a win', r && !r.win && r.net === 0 && S().w === 2 && S().g === 4, r);
  }

  // ---------------------------------------------------------------- 5. how holds end without a result (§5.4)
  function endTests() {
    fresh(100);
    const tab = S().tab;
    const holdOne = (i, s) => { T.hold(MID(i), s, 2, 0); return S().t; };
    holdOne(20, 10); T.away(false); T.end('lost');
    ok('end: lost while present -> refund', S().t === 100 && S().esc.length === 0 && S().g === 0, S());
    holdOne(21, 10); T.away(); T.end('lost'); T.away(false);
    ok('end: lost while away -> forfeit (last place: -16, a game)', S().t === 84 && S().g === 1, S());
    holdOne(22, 10); T.end('host_left');
    ok('end: host_left -> refund', S().t === 84);
    holdOne(23, 10); T.end('reload');
    ok('end: reload (hot reload) -> refund', S().t === 84);
    holdOne(24, 10); T.end('left');
    ok('end: left (나가기 / 로비로 / the tab closing) -> forfeit', S().t === 68 && S().g === 2, S());
    ok('end: the last hold\'s end is remembered for the friends / room line', S().last && S().last.how === 'forfeit' && S().last.h === 16, S().last);
    holdOne(25, 10); T.wait(MID(25));
    ok('end: wait marks the hold', S().esc.length === 1 && S().esc[0].st === 'wait' && S().waits.length === 1, S().esc);
    T.end('left');
    ok('end: a waiting hold is refunded even on leaving', S().t === 68 && S().esc.length === 0);
    holdOne(26, 10); T.wait(MID(26)); T.expire();
    ok('end: wait + 15 s (expire) -> refund', S().t === 68 && S().esc.length === 0 && S().waits.length === 0);
    holdOne(27, 10); T.wait(MID(27));
    const r = T.result(MID(27), [[0, 1, 10, 20, 0]], 0, false);
    ok('end: a result that comes inside the wait still applies', r && r.net === 20 && S().t === 88 && S().waits.length === 0, [r, S().t]);
    // a tab that died without pagehide: another load closes its holds after 15 min (open: forfeit, wait: refund)
    const old = Date.now() - 16 * 60000, young = Date.now() - 60000;
    T.set({ t: 50, g: 0, esc: [
      { m: MID(30), tab: 'dead01', h: 16, s: 10, n: 2, p: 0, st: 'open', t0: old },
      { m: MID(31), tab: 'dead02', h: 16, s: 10, n: 2, p: 0, st: 'wait', t0: old },
      { m: MID(32), tab: 'live03', h: 16, s: 10, n: 2, p: 0, st: 'open', t0: young },
      { m: MID(33), tab, h: 6, s: 0, n: 2, p: 0, st: 'open', t0: old }] });
    T.stale();
    const ms = S().esc.map((e) => e.m);
    ok('stale: a foreign open hold older than 15 min -> forfeit (a game), a waiting one -> refund', !ms.includes(MID(30)) && !ms.includes(MID(31)) && S().t === 66 && S().g === 1, [ms, S().t, S().g]);
    ok('stale: a young foreign hold is left alone; this tab\'s own holds are never touched', ms.includes(MID(32)) && ms.includes(MID(33)), ms);
    T.set({ esc: [] });
  }

  // ---------------------------------------------------------------- 6. 목욕 보너스
  // a solo game from the 1st 탕, game over in the given one (its run starts at round index 0)
  async function toOver(round) {
    D.start(0);
    if (round) D.gotoRound(round);
    G.lives = 1; D.hitPlayer(0); D.step(100);
    return D.getState().phase;
  }
  async function bonusTests() {
    T.today(20261014);
    fresh(30);
    let ph = await toOver(3);
    ok('bonus: solo game over in the 4th 탕 -> +1 (3 탕 cleared)', ph === 'gameover' && S().t === 31 && S().de === 1 && S().day === 20261014, [ph, S().t, S().de]);
    const dd = $('pg-over-tro');
    ok('bonus: the 목욕 끝 card shows the 트로피 row "+1 · 31개"', shown($('pg-over-trow')) && dd.querySelector('span').textContent === '+1' && dd.querySelector('small').textContent === '31개', dd.textContent);
    let b = T.bonus(false);
    ok('bonus: showing the card again pays nothing more', b && b.give === 0 && b.got === 1 && S().t === 31, b);
    ph = await toOver(0);
    ok('bonus: game over in the 1st 탕 -> nothing, and no row', S().t === 31 && !shown($('pg-over-trow')));
    D.start(0); G.round = 6;
    b = T.bonus(false);
    ok('bonus: 6 탕 cleared with 1 boss -> 2 + 2 = +4', b && b.give === 4 && S().t === 35, b);
    T.today(20261013);                                                // (a fresh day for the caps)
    D.start(0); G.round = 23;
    b = T.bonus(true);
    ok('bonus: a full clear (8 + 8 + 4 = 20) is capped at 15 a run', b && b.give === 15 && b.got === 15, b);
    D.start(0); G.round = 23;
    b = T.bonus(true);
    ok('bonus: the next full clear the same day gets the last 5 (20 a day)', b && b.give === 5 && b.capped && S().de === 20, b);
    D.start(0); G.round = 23;
    b = T.bonus(true);
    ok('bonus: then nothing (capped, shown as "오늘 보너스 끝")', b && b.give === 0 && b.capped && b.show, b);
    ph = await toOver(3);
    ok('bonus: the 목욕 끝 row reads "+0 · 오늘 보너스 끝" when the day is used up', shown($('pg-over-trow')) && dd.querySelector('span').textContent === '+0' && dd.querySelector('small').textContent === '오늘 보너스 끝', dd.textContent);
    T.today(20261015);
    D.start(0); G.round = 23;
    b = T.bonus(true);
    ok('bonus: a new day resets the daily cap', b && b.give === 15 && S().de === 15 && S().day === 20261015, b);
    // 2회차 is a new run (its own 15, under the daily 20)
    T.today(20261016);
    D.start(0); D.gotoRound(23); D.killBoss(); D.step(700);
    ok('bonus: the ending card pays the run (capped 15) and shows the row', D.getState().phase === 'ending' && shown($('pg-end-trow')) && $('pg-end-tro').querySelector('span').textContent === '+15', [D.getState().phase, $('pg-end-tro').textContent]);
    const before = S().t;
    key('Enter');                                                     // 2회차 도전
    ok('bonus: 2회차 starts a new run at round index 24', D.getState().loop === 1 && T.run() && T.run().at === 24 && T.run().got === 0, T.run());
    G.round = 3; G.lives = 1; D.hitPlayer(0); D.step(100);
    ok('bonus: 2회차 game over in its 4th 탕 -> +1 more (its own run)', S().t === before + 1, [before, S().t]);
    // no bonus: offline local co-op, the attract demo
    const t0 = S().t;
    D.local.coop(['duck', 'cat'], 0); G.round = 6;
    ok('bonus: offline local co-op gives nothing', T.bonus(false) === null && S().t === t0);
    D.toTitle();
    ok('bonus: the attract demo gives nothing', T.bonus(false) === null && S().t === t0);
    T.today(null);
  }

  // ---------------------------------------------------------------- 7. the title badge, 내 기록, the cards
  async function uiTests() {
    fresh(30);
    D.toTitle(); await sleep(60);
    const b = $('pg-tro');
    ok('badge: shows the count and the league, a NEW dot before 내 기록 was opened', $('pg-tro-n').textContent === '30' && $('pg-tro-name').textContent === '때밀이 견습' && shown($('pg-tro-new')), [b.textContent]);
    // (v4 shop 9.1 / 9.5: the badge opens 마이페이지, whose 내 기록 button opens this card - and its 닫기 goes back there)
    ok('badge: aria-label "내 트로피 30개 · 때밀이 견습 · 마이페이지 열기"', b.getAttribute('aria-label') === '내 트로피 30개 · 때밀이 견습 · 마이페이지 열기', b.getAttribute('aria-label'));
    b.click(); await sleep(60);
    ok('badge: opens 마이페이지 over the title (the demo keeps running)', shown($('pg-hub')) && !$('pg-hub-my').hidden && $('pg-title').hidden && D.getState().phase === 'title', [$('pg-hub').hidden, D.getState().phase]);
    ok('badge: the NEW dot is gone once 마이페이지 showed', $('pg-tro-new').hidden && S().seen === 1);
    $('pg-my-rec').click(); await sleep(60);
    ok('rec: 마이페이지\'s 내 기록 opens the card over the title', shown($('pg-rec')) && $('pg-hub').hidden && $('pg-title').hidden && D.getState().phase === 'title', [$('pg-rec').hidden, D.getState().phase]);
    ok('rec: league, next league, stats and the note', $('pg-rec-lgname').textContent === '때밀이 견습' && $('pg-rec-next').textContent === '다음 리그까지 30개' && $('pg-rec-win').textContent === '0승 / 0판' &&
      $('pg-rec-ladder').children.length === 7 && /처음 선물로 트로피 30개를 받았어요/.test($('pg-rec-note').textContent), [$('pg-rec-next').textContent, $('pg-rec-note').textContent]);
    const ladder = [...$('pg-rec-ladder').children];
    ok('rec: the ladder marks my league (aria-current) and dims the ones not reached', ladder[0].getAttribute('aria-current') === 'true' && ladder[0].classList.contains('got') && !ladder[1].classList.contains('got'), ladder.map((l) => l.className));
    $('pg-rec-close').click(); await sleep(60);
    ok('rec: 닫기 goes back to 마이페이지 (it was opened there)', $('pg-rec').hidden && shown($('pg-hub')) && !$('pg-hub-my').hidden);
    $('pg-hub-close').click(); await sleep(60);
    // (opened from the title - T.openRec(), as before the shop: its keys and 닫기 go back to the title)
    for (const [code, k] of [['Escape'], ['Enter'], ['KeyZ', 'z'], ['KeyX', 'x'], ['Space', ' ']]) {
      if ($('pg-rec').hidden) { T.openRec(); await sleep(60); }
      key(code, k); await sleep(60);
      const st = D.getState();
      ok('rec: ' + code + ' closes it, never starts a solo game; focus back on the badge', $('pg-rec').hidden && shown($('pg-title')) && st.phase === 'title' && document.activeElement === b, [$('pg-rec').hidden, st.phase, document.activeElement && document.activeElement.id]);
    }
    T.openRec(); await sleep(60);
    $('pg-rec-close').click(); await sleep(60);
    ok('rec: 닫기 closes it', $('pg-rec').hidden && shown($('pg-title')));
    T.set({ t: 1300, w: 12, g: 30, ko: 44, best: 1400 }); T.openRec(); await sleep(60);
    ok('rec: the top league says so, with a full bar', $('pg-rec-lgname').textContent === '목욕탕 왕' && $('pg-rec-next').textContent === '최고 리그예요!' && $('pg-rec-fill').style.width === '100%' && $('pg-rec-win').textContent === '12승 / 30판', [$('pg-rec-next').textContent, $('pg-rec-fill').style.width]);
    $('pg-rec-close').click();
    // the 승급 chip on the 목욕 끝 card
    fresh(59); T.today(20261020);
    await toOver(3); await sleep(1400);
    ok('card: +1 from 59 -> 60: the 승급 chip "승급! 뽀득 새내기" shows after the row pops', shown($('pg-over-promo')) && $('pg-over-promo').textContent === '승급! 뽀득 새내기' && S().bl === 1, [$('pg-over-promo').hidden, $('pg-over-promo').textContent]);
    await toOver(3); await sleep(1400);
    ok('card: no chip the next time (already reached)', !shown($('pg-over-promo')));
    T.today(null);
  }

  // ---------------------------------------------------------------- the fit at 1x, 2x and a 320 px phone
  function setScale(s) {
    const st = $('pg-stage'); st.style.flex = 'none'; st.style.width = Math.round(256 * s + 22) + 'px'; st.style.height = Math.round(224 * s + 22) + 'px';
    window.dispatchEvent(new Event('resize'));
  }
  function measure(label, card) {
    const sc = $('pg-screen'), fs = parseFloat(getComputedStyle(sc).fontSize), sr = sc.getBoundingClientRect(), r = card.getBoundingClientRect();
    log('TROPHY INFO ' + label + ': screen ' + Math.round(sr.width) + 'x' + Math.round(sr.height) + ' (' + (sr.width / fs).toFixed(1) + 'x' + (sr.height / fs).toFixed(1) + 'em) card ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' scroll ' + card.scrollHeight + '/' + card.clientHeight);
    ok(label + ': no scrolling (nothing cut off)', card.scrollHeight <= card.clientHeight + 1, [card.scrollHeight, card.clientHeight]);
    ok(label + ': inside the game screen', r.top >= sr.top - 0.5 && r.bottom <= sr.bottom + 0.5 && r.left >= sr.left - 0.5 && r.right <= sr.right + 0.5, [r.top, r.bottom, sr.top, sr.bottom]);
    return { fs, w: sr.width / fs };
  }
  async function fitAt(label) {
    await sleep(120);
    D.toTitle(); await sleep(120);
    const m = measure(label + ' title card', document.querySelector('.pg-title-card'));
    const hi = document.querySelector('.pg-best-hi').getBoundingClientRect(), b = $('pg-tro').getBoundingClientRect();
    const oneLine = Math.abs((hi.top + hi.bottom) / 2 - (b.top + b.bottom) / 2) < b.height / 2;
    if (m.w >= 23) ok(label + ': the badge shares the 최고 점수 line', oneLine, [hi.top, b.top]);
    else log('TROPHY INFO ' + label + ': screen ' + m.w.toFixed(1) + 'em wide: the badge ' + (oneLine ? 'shares the line' : 'wraps under the score'));
    const bf = parseFloat(getComputedStyle($('pg-tro')).fontSize), tap = { left: b.left - 0.35 * bf, right: b.right + 0.35 * bf, top: b.top - 0.3 * bf, bottom: b.bottom + 0.3 * bf };
    const hit = (q) => { const r = q.getBoundingClientRect(); return Math.min(r.right, tap.right) - Math.max(r.left, tap.left) > 0.5 && Math.min(r.bottom, tap.bottom) - Math.max(r.top, tap.top) > 0.5; };
    ok(label + ': the badge\'s tap area does not reach the start buttons', !hit($('pg-start')) && !hit($('pg-friends-btn')), [tap, $('pg-start').getBoundingClientRect().top]);
    T.openRec(); await sleep(80);
    measure(label + ' 내 기록', document.querySelector('.pg-rec-card'));
    T.closeRec();
    await toOver(3); await sleep(1300);
    ok(label + ': the 목욕 끝 card has its 트로피 row', shown($('pg-over-trow')));
    measure(label + ' 목욕 끝 card', document.querySelector('#pg-over .pg-card'));
    D.toTitle(); await sleep(60);
  }
  async function fitTests() {
    fresh(1234); T.set({ seen: 0 }); T.today(20261021);
    G.hiscore = 1234567;                                              // (the widest 최고 점수 line)
    if (FIT_ONLY) { await fitAt('this viewport (' + innerWidth + 'x' + innerHeight + ')'); return; }
    setScale(1); await fitAt('1x (256x224)');
    setScale(2); await fitAt('2x (512x448)');
    window.dispatchEvent(new Event('touchstart'));                    // a phone: touch mode, then a 320 px wide screen
    D.forceLand(false);                                               // (an upright phone: never the landscape layout)
    setScale(278 / 256); await fitAt('320x568 phone (touch, 278x243)');
    D.forceLand(null);
    T.today(null);
  }

  // ---------------------------------------------------------------- 8. the web fonts know every trophy syllable
  function fontTests() {
    const warm = ($('pg-fontwarm').textContent || '');
    const L = T.leagues().map((l) => l.name);
    const strs = ['내 트로피', '내 기록', '최고 트로피', '배틀', '뽀득 KO', '혼자 최고 점수', '다음 리그까지 30개', '최고 리그예요!', '0승 / 0판', '닫기',
      '이 브라우저에서는 기록이 저장되지 않아요', '처음 선물로 트로피 30개를 받았어요! 친구와 배틀할 때 걸어 봐요', '오늘 목욕 보너스 6/20개 · 배틀은 제한이 없어요',
      '트로피 걸기', '안 걸기', '트로피 부족', '연습 경기', '10개씩', '트로피 10개씩', '트로피 안 걸기',
      '트로피가 모자라요 · 방장에게 걸기를 낮춰 달라고 해요', '트로피가 모자란 친구가 있어요 · 걸기를 낮춰 주세요', '내 트로피가 모자라요 · 걸기를 낮춰 주세요',
      '걸기를 낮췄어요: 10개씩', '걸기를 낮췄어요: 안 걸기', '걸기가 바뀌었어요: 10개씩 · 다시 준비해 주세요',
      '트로피 경기: 1등 +14 · 2등 +6 · 3등 -2 · 4등 -6', '모두 10개씩 걸고 1등이 다 가져요: 1등 +44 · 2등 -4 · 3등 -12 · 4등 -16',
      '견습 리그는 등수로 잃지 않아요 · 판 중간에 나가면 꼴찌로 쳐요', '연습 경기예요: 이 브라우저의 탭끼리는 트로피가 바뀌지 않아요', '연습 경기예요: 같은 기기에서 들어온 친구가 있어요',
      '끝까지 갈수록 모두 트로피를 받아요 (잃지 않아요)', '트로피 10개씩 걸어요!', '연습 경기 · 트로피 없음', '트로피 경기', '결과 발표!', '무승부', '기권승', '연습',
      '내 트로피가 모자라요 · 방으로 가서 걸기를 바꿔요', '트로피가 모자란 친구가 있어요 · 방으로 가서 걸기를 바꿔요', '친구가 나가서 이번 판은 무효예요',
      '방장이 다음 판을 고르고 있어요 · 다음 판도 10개씩', '트로피', '+15', '31개', '오늘 보너스 끝', '한 번 더 누르면 나가요 · 트로피 -16', '한 번 더 누르면 모두 방으로 · 내 트로피 -16',
      '걸었던 트로피를 돌려받았어요', '이번 판은 진 걸로 쳤어요'].concat(L, L.map((n) => '승급! ' + n));
    const miss = new Set();
    for (const s of strs) for (const ch of s) if (/[\uac00-\ud7a3]/.test(ch) && warm.indexOf(ch) < 0) miss.add(ch);
    ok('fonts: every syllable of every trophy string is in #pg-fontwarm (both faces get it)', miss.size === 0, [...miss].join(''));
    const both = ['.pg-fw-sign', '.pg-fw-body'].every((q) => { const t = document.querySelector('#pg-fontwarm ' + q).textContent; return t.indexOf('기권승') >= 0 && t.indexOf('사우나 명인') >= 0; });
    ok('fonts: both web-font faces are warmed with the trophy text', both);
  }

  // ---------------------------------------------------------------- screenshot scenes (#shot=title|rec|over|overpromo|ending)
  async function shot(name) {
    fresh(268); T.set({ w: 7, g: 15, ko: 23, best: 312, bl: 2, seen: name === 'title' ? 0 : 1 }); T.today(20261022);
    G.hiscore = 123456;
    if (name === 'title') { D.toTitle(); await sleep(400); }
    else if (name === 'rec') { D.toTitle(); await sleep(100); T.openRec(); await sleep(400); }
    else if (name === 'over') { T.set({ t: 58, bl: 0 }); await toOver(3); G.hiscore = 123456; await sleep(1500); }
    // (the 승급 chip sharing its line with 최고 기록 달성!: 57 + 4 (6 탕 cleared, a boss) -> 61, a new best score)
    else if (name === 'overpromo') { T.set({ t: 57, bl: 0 }); G.hiscore = 0; D.start(0); D.gotoRound(6); G.score = 54321; G.newHi = true; G.lives = 1; D.hitPlayer(0); D.step(100); await sleep(1800); }
    else if (name === 'ending') { T.set({ t: 140, bl: 1 }); D.start(0); D.gotoRound(23); D.killBoss(); D.step(700); await sleep(1500); }
    log('TROPHY SHOT READY ' + name);
  }
  async function run() {
    for (let i = 0; i < 300 && !(window.PG && PG.debug && PG.debug.tro); i++) await sleep(20);
    D = PG.debug; T = D.tro; G = D.G;
    const sm = /shot=([a-z]+)/.exec(location.hash);
    if (sm) { if (/touch/.test(location.hash)) window.dispatchEvent(new Event('touchstart')); await shot(sm[1]); return; }
    const steps = FIT_ONLY ? [fitTests] : [storeTests, rmwTests, ruleTests, applyTests, endTests, bonusTests, uiTests, fitTests, fontTests];
    for (const f of steps) {
      try { await f(); } catch (e) { fail++; log('TROPHY FAIL ' + f.name + ' threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
    }
    log('TROPHY DONE pass=' + pass + ' fail=' + fail);
  }
  setTimeout(run, 50);
})();
