// v4 trophies (design/trophies.md §15.1): the pure rules and the store, offline in virtual time.
//   node bogeul/build.js
//   node bogeul/tools/run-chrome.js test-trophies.html tro-unit.png 900 760 90000 "TROPHY DONE"
//   a real phone viewport (the fit part only): node bogeul/tools/cdp-run.js "test-trophies.html#fit" C:/Temp/bogeul/tro-fit-320.png 320 568 30000 "TROPHY DONE" 1
// Checks: the store (fresh, clamps, a newer schema, unreadable JSON, blocked storage), read-modify-write and the storage
// event, the rules table (every row of §3.1, the ties and leavers, 안 걸고 참여's pot of the stakes put in, random
// invariants), holding without the stake and what a row may make such a hold pay, applying a result (hostile rows,
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
  // (fresh(t): a store that got to t - best t, bl the league of t, as troParse raises it; fresh(): the new gift, 100)
  const fresh = (t) => { T.ns('u' + (++nsN)); T.away(false); if (t !== undefined) T.set({ t, best: t, bl: 0 }); return S(); };
  const MID = (i) => 'abc123.' + i;
  const key = (code, k) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: k || code, bubbles: true, cancelable: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: k || code, bubbles: true })); };
  // (a dt / dd row group is display: contents - it has no box of its own: its dd's box counts)
  const shown = (e) => !!e && !e.hidden && (e.getClientRects().length > 0 || (getComputedStyle(e).display === 'contents' && [...e.children].some((c) => c.getClientRects().length > 0)));

  // ---------------------------------------------------------------- 1. the store
  function storeTests() {
    let s = fresh();
    ok('store: a fresh store has the gift (100), v 5 (the trophy balance; the 뽑기 fields from v 4, design/gacha.md 5.1) and an 8-character dev', s.t === 100 && s.best === 100 && /^[0-9a-z]{8}$/.test(s.dev) && raw() && raw().v === 5 && raw().t === 100, [s.t, s.dev, raw()]);
    ok('store: ... already in 뽀득 새내기, the best league reached too (bl 1: no 승급! for it, the shop locks read it)', s.lg === 1 && s.bl === 1 && raw().bl === 1, [s.lg, s.bl]);
    const dev = s.dev, name = 'u' + nsN;
    T.ns(name);
    ok('store: it round-trips (same dev and count on a reload)', S().dev === dev && S().t === 100 && !S().mem && !S().ro, S());
    // a store below its count's league (written before bl followed the gift, or by hand): bl is raised on read, quietly
    localStorage.setItem('ppogeul-trophy-lowbl', JSON.stringify({ v: 4, dev: 'abcdefgh', t: 400, best: 400, bl: 0 }));
    s = T.ns('lowbl');
    ok('store: bl below the count\'s league (400, bl 0) -> raised to 양머리 고수 (3) on read', s.bl === 3 && s.lg === 3, s);
    T.hold(MID(40), 0, 2, 0); T.fast(true);
    const rl = T.result(MID(40), [[0, 1, 12, 0, 0], [1, 2, -6, 0, 0]], 0, true); T.fast(false);
    ok('store: ... so its next result shows no false 승급!', rl && rl.promo === -1 && S().bl === 3, rl);
    // a v 4 store (before the trophy balance): read as is, today's bonus up to 40 kept, written back as v 5 - so a v 4 page
    // still open in this browser reads 'newer' and never clamps de back to its 20
    localStorage.setItem('ppogeul-trophy-v4de', JSON.stringify({ v: 4, dev: 'abcdefgh', t: 140, best: 150, bl: 1, g: 9, day: 20261019, de: 33 }));
    s = T.ns('v4de');
    ok('store: a v 4 store -> read (t 140, de 33 kept), written back as v 5 at load', s.t === 140 && s.de === 33 && !s.ro && raw() && raw().v === 5 && raw().de === 33, [s, raw()]);
    // clamps: hand-edited / hostile values
    const now = Date.now(), e = (i, o) => Object.assign({ m: MID(i), tab: 'zzzzzz', h: 16, s: 10, n: 4, p: 0, st: 'open', t0: now }, o || {});
    const bad = { v: 1, dev: 'abcdefgh', t: 1e9, best: -5, bl: 99, w: -1, g: 1e9, ko: 'x', day: 0, de: 999, seen: 'yes',
      esc: [e(1, { m: 'nope' }), e(2, { tab: 'TOO-LONG-TAB' }), e(3, { h: 999, s: 7, n: 9, st: 'weird' }), e(4), e(5), e(6), e(7), e(8), e(9), e(10), e(11), null, 'x'] };
    localStorage.setItem('ppogeul-trophy-clamp', JSON.stringify(bad));
    s = T.ns('clamp');
    ok('store: t 1e9 -> 99999, best >= t, bl <= 6, negatives -> 0, g <= 1e6, de <= 40', s.t === 99999 && s.best === 99999 && s.bl === 6 && s.w === 0 && s.g === 1e6 && s.ko === 0 && s.de === 40 && s.seen === 1, s);
    ok('store: bad mids / tabs dropped, more than 8 holds trimmed to the newest 8, each hold clamped', s.esc.length === 8 && s.esc.every((q) => /^abc123\.\d+$/.test(q.m) && q.tab === 'zzzzzz') && s.esc[0].m === MID(4) && s.esc.every((q) => q.h <= 56 && [0, 5, 10, 20, 50].includes(q.s) && q.n >= 2 && q.n <= 4 && (q.st === 'open' || q.st === 'wait')), s.esc.map((q) => [q.m, q.h, q.s, q.n, q.st]));
    // a newer page's data: read-only, never overwritten
    const newer = JSON.stringify({ v: 6, dev: 'abcdefgh', t: 777, extra: [1, 2] }); // (v 6: newer than this page's v 5)
    localStorage.setItem('ppogeul-trophy-newer', newer);
    s = T.ns('newer');
    ok('store: v 6 on disk -> read-only (a fresh store in memory)', s.ro === true && s.t === 100, s);
    T.openRec(); T.closeRec(); T.set({ t: 99 });
    ok('store: ... and the key is unchanged afterwards', localStorage.getItem('ppogeul-trophy-newer') === newer);
    localStorage.setItem('ppogeul-trophy-junk', '{not json');
    s = T.ns('junk');
    ok('store: unreadable JSON -> a fresh store (the gift), written back as valid JSON', s.t === 100 && !s.ro && raw() && raw().v === 5, [s.t, localStorage.getItem('ppogeul-trophy-junk')]);
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
      0: { 2: [12, -6], 3: [15, 5, -6], 4: [16, 8, 2, -6] },
      5: { 2: [17, -11], 3: [25, 0, -11], 4: [31, 3, -3, -11] },
      10: { 2: [22, -16], 3: [35, -5, -16], 4: [46, -2, -8, -16] },
      20: { 2: [32, -26], 3: [55, -15, -26], 4: [76, -12, -18, -26] },
      50: { 2: [62, -56], 3: [115, -45, -56], 4: [166, -42, -48, -56] },
    };
    const bad = [];
    for (const s of [0, 5, 10, 20, 50]) for (const n of [2, 3, 4]) { const got = nets(n, s, fins(n), 0); if (!same(got, WANT[s][n])) bad.push([s, n, got]); }
    ok('rules: every distinct-places row of the §3.1 table (n 2/3/4 x stakes 0/5/10/20/50)', !bad.length, bad);
    const tie = (n, groups) => { const f = []; let slot = 0; groups.forEach((g, gi) => { for (let j = 0; j < g; j++) f.push({ slot: slot++, sc: 1000 - 100 * gi, k: 0, ko: 0, p: 0 }); }); return f; };
    const CASES = [
      ['4 players, 2nd = 3rd', nets(4, 10, tie(4, [1, 2, 1]), 0), [46, -5, -5, -16]],
      ['4 players, 1st = 2nd', nets(4, 10, tie(4, [2, 1, 1]), 0), [22, 22, -8, -16]],
      ['3 players, 1st = 2nd', nets(3, 10, tie(3, [2, 1]), 0), [15, 15, -16]],
      ['3 players, 2nd = 3rd ((5 - 6) / 2 rounds to 0)', nets(3, 10, tie(3, [1, 2]), 0), [35, -10, -10]],
      ['1v1 tie: 무승부', nets(2, 10, tie(2, [2]), 0), [0, 0]],
      ['all 4 tied: 무승부', nets(4, 10, tie(4, [4]), 0), [0, 0, 0, 0]],
      ['4 players, one left on purpose', nets(4, 10, fins(3), 1), [46, -2, -8]],
      ['4 players, one link dropped (no gg)', nets(4, 10, fins(3), 0), [36, -2, -8]],
      ['4 players, three left on purpose (기권승: the pot only, no 1st-place base)', nets(4, 10, fins(1), 3), [30]],
      ['1v1, the other left on purpose (기권승: the pot only)', nets(2, 10, fins(1), 1), [10]],
      ['1v1 at stake 0, the other left on purpose (기권승: nothing to win)', nets(2, 0, fins(1), 1), [0]],
      ['4 players, three finishers all tied, one left on purpose', nets(4, 10, tie(3, [3]), 1), [3, 3, 3]],
    ];
    for (const [name, got, want] of CASES) ok('rules: ' + name + ' -> ' + want.join(' / '), same(got, want), got);
    ok('rules: 1v1 or 4 players, everyone else dropped without gg -> void ([])', T.table(2, 10, fins(1), 0).length === 0 && T.table(4, 10, fins(1), 0).length === 0);
    ok('rules: a tie on (score, kos, koed) only - the host\'s slot 0 does not win a tie', same(T.table(2, 0, [{ slot: 0, sc: 5, k: 1, ko: 0, p: 0 }, { slot: 1, sc: 5, k: 1, ko: 0, p: 0 }], 0).map((r) => r[1]), [1, 1]));
    ok('rules: kos break a score tie', same(nets(2, 0, [{ slot: 1, sc: 5, k: 2, ko: 0, p: 0 }, { slot: 0, sc: 5, k: 1, ko: 0, p: 0 }], 0), [12, -6]));
    ok('rules: 견습 at 시작! loses nothing by place (its base 0), a bet still can', same(nets(2, 10, [{ slot: 0, sc: 9, k: 0, ko: 0, p: 1 }, { slot: 1, sc: 1, k: 0, ko: 0, p: 1 }], 0), [22, -10]));
    // 안 걸고 참여 (z 1: put no stake in): only the stakes put in are in the pot, and only those who put one in share it -
    // the best-placed group with a stake in takes it. Each row's r[5] says whether its stake is in (net: no stake when 0)
    const zf = (n, zs) => fins(n).map((r, i) => Object.assign(r, { z: zs.includes(i) ? 1 : 0 }));
    const netsZ = (n, s, fin, gl, gz) => T.table(n, s, fin, gl, gz).map((r) => r[2] + r[3] - (r[5] === 0 ? 0 : s));
    const tieZ = (n, groups, zs) => tie(n, groups).map((r, i) => Object.assign(r, { z: zs.includes(i) ? 1 : 0 }));
    const FREE = [
      ['4 players at 10, the 4th without the stake: the pot is the 3 stakes (30)', netsZ(4, 10, zf(4, [3]), 0, 0), [36, -2, -8, -6]],
      ['... the 1st without it: its place points only, the best with a stake in (2nd) takes the pot', netsZ(4, 10, zf(4, [0]), 0, 0), [16, 28, -8, -16]],
      ['... 1st and 2nd without it: the 3rd takes the pot of 2 stakes', netsZ(4, 10, zf(4, [0, 1]), 0, 0), [16, 8, 12, -16]],
      ['... a tie for 1st, one of the two without it: the other takes the whole pot', netsZ(4, 10, tieZ(4, [2, 1, 1], [0]), 0, 0), [12, 32, -8, -16]],
      ['1v1, both without it: place points only', netsZ(2, 10, zf(2, [0, 1]), 0, 0), [12, -6]],
      ['4 players, one without the stake left on purpose: its stake is not in the pot', netsZ(4, 10, zf(3, []), 1, 1), [36, -2, -8]],
      ['1v1 기권승 for one without the stake: nothing (the leaver\'s stake is not its to take)', netsZ(2, 10, zf(1, [0]), 1, 0), [0]],
      ['1v1 기권승, the leaver without the stake: my own stake back (0)', netsZ(2, 10, zf(1, []), 1, 1), [0]],
      ['4 players, 무승부 of 3 (one without it) + a leaver: the pot of 3 split between the 2 with a stake in', netsZ(4, 10, tieZ(3, [3], [0]), 1, 0), [0, 5, 5]],
    ];
    for (const [name, got, want] of FREE) ok('rules (안 걸고): ' + name + ' -> ' + want.join(' / '), same(got, want), got);
    ok('rules (안 걸고): r[5] says whose stake is in (1 / 0); at stake 0 every row is 1', same(T.table(4, 10, zf(4, [3]), 0, 0).map((r) => r[5]), [1, 1, 1, 0]) && same(T.table(2, 0, zf(2, [1]), 0, 0).map((r) => r[5]), [1, 1]));
    // random invariants
    let worst = { lo: 0, hi: 0 }, viol = [];
    let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let it = 0; it < 4000; it++) {
      const n = 2 + Math.floor(rnd() * 3), m = 1 + Math.floor(rnd() * n), gl = Math.floor(rnd() * (n - m + 1)), s = [0, 5, 10, 20, 50][Math.floor(rnd() * 5)];
      // (z: 안 걸고 참여 on a quarter of the finishers, gz of the gg leavers too)
      const fin = Array.from({ length: m }, (_, i) => ({ slot: i, sc: Math.floor(rnd() * 3) * 100, k: Math.floor(rnd() * 2), ko: 0, p: rnd() < 0.3 ? 1 : 0, z: rnd() < 0.25 ? 1 : 0 }));
      fin.sort((a, b) => b.sc - a.sc || b.k - a.k);
      const gz = Math.floor(rnd() * (gl + 1)), put = fin.filter((f) => !(s > 0 && f.z)).length;
      const rows = T.table(n, s, fin, gl, gz), pot = s * (put + gl - gz), shares = rows.reduce((a, r) => a + r[3], 0);
      if (m === 1 && !gl) { if (rows.length) viol.push(['m1', n, s]); continue; }
      if (rows.length !== m) viol.push(['rows', n, m, gl]);
      // (no finisher with a stake in: nobody takes the pot - the leavers' stakes simply stay lost)
      if (put ? shares > pot || shares < pot - 3 : shares !== 0) viol.push(['pot', n, m, gl, gz, s, shares, pot]);
      for (const r of rows) {
        const st = r[5] === 0 ? 0 : s, v = r[2] + r[3] - st;
        if (r[5] === 0 && r[3] !== 0) viol.push(['z share', n, m, s, r]);
        worst.lo = Math.min(worst.lo, v + st + 6); worst.hi = Math.max(worst.hi, v); if (v < -(st + 6) || v > 166) viol.push(['net', n, m, gl, s, v]);
      }
    }
    ok('rules: 4000 random results (안 걸고 참여 too) - the shares never pass the stakes put in (and lose at most 3 to the floor), a row without a stake shares nothing, every net in -(stake + 6)..+166, m = 1 without gg is void', !viol.length, viol.slice(0, 5));
    log('TROPHY INFO random: lowest net + s + 6 = ' + worst.lo + ', highest net ' + worst.hi);
  }

  // ---------------------------------------------------------------- 4. applying a result (my own row, once, clamped)
  function applyTests() {
    T.fast(true);
    fresh(100);
    ok('hold: stake 10 at 100 holds 16 (s + 6)', T.hold(MID(1), 10, 4, 0) === true && S().t === 84 && S().esc[0].h === 16 && S().esc[0].p === 0, S());
    ok('hold: once per match id', T.hold(MID(1), 10, 4, 0) === false && S().t === 84);
    let r = T.result(MID(1), [[1, 9, 999, 9999, 500]], 1, false);
    ok('apply: a hostile best row (place 9, base 999, share 9999, kos 500) is clamped: +16 + 40 - 10 = +46 at most', r && r.net === 46 && S().t === 146 && S().ko === 99 && S().esc.length === 0, [r, S().t]);
    ok('apply: a second apply of the same match changes nothing', T.result(MID(1), [[1, 1, 16, 40, 0]], 1, false) === null && S().t === 146);
    T.hold(MID(2), 10, 4, 0);
    r = T.result(MID(2), [[1, 1, -999, -5, 0]], 1, false);
    ok('apply: a hostile worst row (base -999, share -5) costs exactly the hold: -(s + 6), and is no win', r && r.net === -16 && !r.win && S().t === 130, [r, S().t]);
    T.hold(MID(3), 10, 4, 0);
    ok('apply: my slot missing from the rows -> nothing (the hold stays)', T.result(MID(3), [[2, 1, 14, 40, 0]], 1, false) === null && S().esc.length === 1);
    ok('apply: an unknown match id -> nothing', T.result(MID(99), [[1, 1, 14, 40, 0]], 1, false) === null && S().esc.length === 1);
    T.close(MID(3), 'refund');
    ok('close: refund gives the hold back', S().t === 130 && S().esc.length === 0, S().t);
    T.fast(false);
    T.hold(MID(4), 10, 4, 60000);
    ok('apply: a result before the battle clock could have run is not applied (no fast)', T.result(MID(4), [[1, 1, 14, 40, 0]], 1, false) === null && S().esc.length === 1 && S().t === 114);
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
    T.hold(MID(13), 10, 2, 0);
    r = T.result(MID(13), [[2, 1, 0, 20, 0]], 2, true);
    ok('apply: a 기권승 (my row alone: base 0, the pot) is a win: +20 - 10 = +10', r && r.win && r.net === 10 && r.now === 78 && S().w === 3, r);
    // 안 걸고 참여: a hold without the stake (nos 1: short of it; nos 2: readied without it), and what a row may make it pay
    fresh(7);
    ok('hold: short of the stake with 안 걸고 참여 (nos 1): held without it - s 0; a 견습 (7) holds 0', T.hold(MID(60), 10, 4, 0, 1) === true && S().esc[0].s === 0 && S().esc[0].h === 0 && S().t === 7, S().esc);
    r = T.result(MID(60), [[1, 1, 16, 999, 0, 1]], 1, false);
    ok('apply: without the stake, a hostile share (999, a row saying staked) is capped at 0: +16 only (7 -> 23), a win', r && r.net === 16 && r.put === 0 && r.win && S().t === 23, [r, S().t]);
    fresh(100);
    ok('hold: nos 2 (readied without the stake) holds without it even when the count covers it: s 0, h 6', T.hold(MID(61), 10, 2, 0, 2) === true && S().esc[0].s === 0 && S().esc[0].h === 6 && S().t === 94, S().esc);
    r = T.result(MID(61), [[1, 2, -6, 0, 0, 0]], 1, false);
    ok('apply: ... and its last place costs only the place points: -6 (not -16)', r && r.net === -6 && S().t === 94, r);
    T.hold(MID(62), 10, 2, 0);
    r = T.result(MID(62), [[1, 2, -6, 20, 0, 0]], 1, false);
    ok('apply: a staked hold whose row says the pot did not get it (r[5] 0): no stake paid, no share: -6', r && r.net === -6 && r.put === 0 && S().t === 88, [r, S().t]);
    T.hold(MID(63), 10, 2, 0, 1);
    r = T.result(MID(63), [[1, 1, 12, 20, 0]], 1, false);
    ok('apply: covering it with nos 1 puts the stake in as before (an older host\'s 5-element row): +12 + 20 - 10', r && r.net === 22 && r.put === 10 && S().t === 110, [r, S().t]);
    // the +5 오늘 트로피 보너스 of a real battle (B1): the same daily pool as the 목욕 보너스, apart from the net
    T.today(20261030); fresh(100);
    const two = (a, b) => [[0, 1, a, 0, 0], [1, 2, b, 0, 0]];
    T.hold(MID(50), 0, 2, 0);
    r = T.result(MID(50), two(12, -6), 1, true, true);
    ok('play bonus (꼴등 빼고): a 2-player real match lost: net -6 and no +5 (now 94), today still 0/40', r && r.net === -6 && r.bonus === 0 && r.now === 94 && S().t === 94 && S().de === 0, [r, S().de, S().day]);
    T.set({ t: 99, de: 5, day: 20261030 });
    T.hold(MID(51), 0, 2, 0);
    r = T.result(MID(51), two(12, -6), 0, true, false);
    ok('play bonus: not a real match (too short / under 5 bubbles): no bonus', r && r.net === 12 && r.bonus === 0 && S().t === 111 && S().de === 5, [r, S().de]);
    T.hold(MID(52), 10, 2, 0);
    r = T.result(MID(52), [[0, 1, 0, 20, 0]], 0, true, true);
    ok('play bonus: never for a 기권승 (one row), even when called real', r && r.bonus === 0 && r.net === 10 && S().de === 5, [r, S().de]);
    T.hold(MID(53), 0, 2, 0); T.close(MID(53), 'refund');
    ok('play bonus: a refunded / void match gets nothing (no result to apply)', T.result(MID(53), two(12, -6), 0, true, true) === null && S().de === 5);
    ok('play bonus: practice for me (no hold of mine) gets nothing', T.result(MID(54), two(12, -6), 0, true, true) === null && S().de === 5);
    T.set({ de: 38 });
    T.hold(MID(55), 0, 2, 0);
    r = T.result(MID(55), two(12, -6), 0, true, true);
    ok('play bonus: the daily cap: 38/40 -> only +2', r && r.bonus === 2 && S().de === 40, [r, S().de]);
    T.hold(MID(56), 0, 2, 0);
    r = T.result(MID(56), two(12, -6), 0, true, true);
    ok('play bonus: 40/40 -> nothing more today', r && r.bonus === 0 && S().de === 40, [r, S().de]);
    T.today(20261031);
    T.hold(MID(57), 0, 2, 0);
    r = T.result(MID(57), two(12, -6), 0, true, true);
    ok('play bonus: a new day starts the pool again', r && r.bonus === 5 && S().de === 5 && S().day === 20261031, [r, S().de]);
    T.set({ t: 7, best: 7 });
    T.hold(MID(58), 10, 2, 0, 1);
    r = T.result(MID(58), [[0, 1, 12, 0, 0, 0], [1, 2, -6, 20, 0, 1]], 0, true, true);
    ok('play bonus: 안 걸고 참여 (no stake in) gets its place points and the +5 like everyone: 7 + 12 + 5', r && r.net === 12 && r.bonus === 5 && r.put === 0 && S().t === 24 && S().de === 10, [r, S().t, S().de]);
    // 꼴등 빼고 (the user's pick, 2026-10): the last place of 2+ finishers gets no +5 - ties for it too; a 무승부 has no last
    const four = [[0, 1, 16, 0, 0], [1, 2, 8, 0, 0], [2, 3, 2, 0, 0], [3, 4, -6, 0, 0]];
    const lastOf = (rows, slot, mid) => { fresh(100); T.hold(mid, 0, rows.length, 0); return T.result(mid, rows, slot, true, true); };
    r = lastOf(four, 3, MID(160));
    ok('play bonus (꼴등 빼고): 4 players, the 4th: -6 and no +5 (now 94, today 0/40)', r && r.net === -6 && r.bonus === 0 && S().t === 94 && S().de === 0, [r, S().t, S().de]);
    r = lastOf(four, 2, MID(161));
    ok('play bonus (꼴등 빼고): 4 players, the 3rd still gets it: +2 + 5', r && r.net === 2 && r.bonus === 5 && S().t === 107, [r, S().t]);
    const tie = [[0, 1, 16, 0, 0], [1, 2, 8, 0, 0], [2, 3, -2, 0, 0], [3, 3, -2, 0, 0]];
    r = lastOf(tie, 2, MID(162)); const r2 = lastOf(tie, 3, MID(163));
    ok('play bonus (꼴등 빼고): a tie for last (3rd = 3rd of 4): neither gets it', r && r.bonus === 0 && r2 && r2.bonus === 0 && r.net === -2, [r, r2]);
    r = lastOf([[0, 1, 0, 0, 0], [1, 1, 0, 0, 0]], 1, MID(164));
    ok('play bonus (꼴등 빼고): a 무승부 has no last place: everyone keeps the +5', r && r.net === 0 && r.bonus === 5 && S().t === 105, [r, S().t]);
    r = lastOf([[0, 1, 15, 0, 0], [1, 2, 5, 0, 0], [2, 3, -6, 0, 0]], 1, MID(165));
    ok('play bonus (꼴등 빼고): 3 players, the 2nd gets it (+5 + 5)', r && r.net === 5 && r.bonus === 5, r);
    // the 8-trophy floor of the bug report: 견습 at 8 covering stake 5 used to lose 5 and get the 5 back (8 again); now it drops
    fresh(8); T.hold(MID(166), 5, 2, 0, 1);
    r = T.result(MID(166), [[0, 1, 12, 10, 0, 1], [1, 2, -6, 0, 0, 1]], 1, true, true);
    ok('play bonus (꼴등 빼고): 견습 at 8 losing a 5 stake now drops to 3 (was 8: -5 +5)', r && r.net === -5 && r.bonus === 0 && S().t === 3, [r, S().t]);
    T.today(null);
  }

  // ---------------------------------------------------------------- 4b. 파티 트로피 (design/party-trophies.md 9.2): the table
  // (a staked party only - 안 걸기 holds nothing: the stake-0 rows are only 안 걸고 참여's own line, place points alone)
  const pfin = (n, pls) => Array.from({ length: n }, (_, i) => ({ slot: i, pl: pls ? pls[i] : i + 1, p: 0, z: 0 }));
  const pnets = (n, s, fin, gl, gz, rot) => T.ptable(n, s, fin, gl | 0, gz | 0, rot | 0).map((r) => r[2] + r[3] - (r[5] === 0 ? 0 : s));
  function partyTableTests() {
    const WANT = {
      0: { 2: [12, -6], 3: [15, 5, -6], 4: [16, 8, 2, -6] },
      5: { 2: [17, -11], 3: [20, 4, -10], 4: [21, 9, 1, -11] },
      10: { 2: [22, -16], 3: [23, 4, -13], 4: [26, 10, 0, -16] },
      20: { 2: [32, -26], 3: [31, 3, -20], 4: [36, 12, -2, -26] },
      50: { 2: [62, -56], 3: [55, 0, -41], 4: [66, 18, -8, -56] },
    };
    const bad = [];
    for (const s of [0, 5, 10, 20, 50]) for (const n of [2, 3, 4]) { const got = pnets(n, s, pfin(n)); if (!same(got, WANT[s][n])) bad.push([s, n, got]); }
    ok('party table: every distinct-places row of 2.2 (n 2/3/4 x stakes 5/10/20/50; 0: the place points alone)', !bad.length, bad);
    const sh = (n, s) => T.ptable(n, s, pfin(n), 0, 0, 0).map((r) => r[3]);
    ok('party table: the shares 4p at 10 = 20 / 12 / 8 / 0, at 50 = 100 / 60 / 40 / 0; 3p at 5 = 10 / 4 / 1 (the floors\' rest to 1st)', same(sh(4, 10), [20, 12, 8, 0]) && same(sh(4, 50), [100, 60, 40, 0]) && same(sh(3, 5), [10, 4, 1]), [sh(4, 10), sh(4, 50), sh(3, 5)]);
    const TIES = [
      ['4p, 1st = 2nd', 4, [1, 1, 3, 4], { 0: [12, 12, 2, -6], 5: [15, 15, 1, -11], 10: [18, 18, 0, -16], 50: [42, 42, -8, -56] }],
      ['4p, 2nd = 3rd', 4, [1, 2, 2, 4], { 0: [16, 5, 5, -6], 5: [21, 5, 5, -11], 10: [26, 5, 5, -16], 50: [66, 5, 5, -56] }],
      ['4p, 3rd = 4th', 4, [1, 2, 3, 3], { 0: [16, 8, -2, -2], 5: [21, 9, -5, -5], 10: [26, 10, -8, -8], 50: [66, 18, -32, -32] }],
      ['4p, 1st = 2nd = 3rd', 4, [1, 1, 1, 4], { 0: [9, 9, 9, -6], 5: [11, 11, 10, -11], 10: [13, 12, 12, -16], 50: [26, 26, 25, -56] }],
      ['4p, 1st = 2nd, 3rd = 4th', 4, [1, 1, 3, 3], { 0: [12, 12, -2, -2], 5: [15, 15, -5, -5], 10: [18, 18, -8, -8], 50: [42, 42, -32, -32] }],
      ['3p, 1st = 2nd', 3, [1, 1, 3], { 0: [10, 10, -6], 5: [12, 12, -10], 10: [14, 13, -13], 50: [28, 27, -41] }],
      ['3p, 2nd = 3rd', 3, [1, 2, 2], { 0: [15, 0, 0], 5: [20, -2, -3], 10: [23, -4, -4], 50: [55, -20, -20] }],
      ['everyone tied (무승부)', 4, [1, 1, 1, 1], { 0: [0, 0, 0, 0], 5: [0, 0, 0, 0], 10: [0, 0, 0, 0], 50: [0, 0, 0, 0] }],
    ];
    const tb = [];
    for (const [nm, n, pl, want] of TIES) for (const s of [0, 5, 10, 50]) { const got = pnets(n, s, pfin(n, pl)); if (!same(got, want[s])) tb.push([nm, s, got]); }
    ok('party table: every tie row of 2.2 at stakes 0 / 5 / 10 / 50 (the remainder to the tie\'s first seat at game id 0)', !tb.length, tb);
    ok('party table: a 무승부 is every row 1st with base 0 (the podium\'s draw)', T.ptable(4, 10, pfin(4, [1, 1, 1, 1]), 0, 0, 0).every((r) => r[1] === 1 && r[2] === 0));
    const zf = (n, zs, pl) => pfin(n, pl).map((r, i) => Object.assign(r, { z: zs.includes(i) ? 1 : 0 }));
    const LEAVE = [
      ['4 at the hold, one left with gg (3 finish)', pnets(4, 10, pfin(3), 1, 0), [26, 10, 0]],
      ['4 at the hold, one link dropped (no gg): pot 30', pnets(4, 10, pfin(3), 0, 0), [21, 7, -2]],
      ['4 at the hold, two left with gg: the 3rd place\'s 20% to the best staker', pnets(4, 10, pfin(2), 2, 0), [34, 10]],
      ['3 at the hold, one left with gg', pnets(3, 10, pfin(2), 1, 0), [26, 4]],
      ['4 at the hold, three left with gg (기권승: the pot only)', pnets(4, 10, pfin(1), 3, 0), [30]],
      ['4 at the hold, three left, one with gg (기권승)', pnets(4, 10, pfin(1), 1, 0), [10]],
      ['2 at the hold, the other left with gg (기권승)', pnets(2, 10, pfin(1), 1, 0), [10]],
      ['4p, the 1st without the stake: the stakers take 15 / 9 / 6 among themselves', pnets(4, 10, zf(4, [0])), [16, 13, 1, -10]],
      ['4p, the 4th without the stake', pnets(4, 10, zf(4, [3])), [21, 7, -2, -6]],
      ['4p, 1st and 2nd without it (pot 20)', pnets(4, 10, zf(4, [0, 1])), [16, 8, 6, -10]],
      ['4p, tie for 1st, one of the two without it', pnets(4, 10, zf(4, [0], [1, 1, 3, 4])), [12, 17, 1, -10]],
      ['2p, either one without it', pnets(2, 10, zf(2, [0])).concat(pnets(2, 10, zf(2, [1]))), [12, -6, 12, -6]],
    ];
    for (const [nm, got, want] of LEAVE) ok('party table: ' + nm + ' -> ' + want.join(' / '), same(got, want), got);
    ok('party table: everyone else\'s link dropped (no gg) -> void ([]), as a battle', T.ptable(4, 10, pfin(1), 0, 0, 0).length === 0 && T.ptable(2, 10, pfin(1), 0, 0, 0).length === 0);
    ok('party table: r[4] (KOs) is 0, r[5] says whose stake is in', T.ptable(4, 10, zf(4, [3]), 0, 0, 0).every((r) => r[4] === 0) && same(T.ptable(4, 10, zf(4, [3]), 0, 0, 0).map((r) => r[5]), [1, 1, 1, 0]));
    // the remainder turns with the game id: 4p 1st = 2nd = 3rd at 10 shares 40 -> 13 / 13 / 13 + 1 (one seat), at 5
    // shares 20 -> 6 / 6 / 6 + 2 (two seats)
    const ex = (s, rot) => T.ptable(4, s, pfin(4, [1, 1, 1, 4]), 0, 0, rot).slice(0, 3).map((r) => r[3]);
    const r10 = [0, 1, 2].map((k) => ex(10, k)), r5 = [0, 1, 2].map((k) => ex(5, k));
    ok('party table: the tie\'s extra trophy rotates with the game id (at 10 each seat gets it once in 3 parties; at 5 each misses it once)',
      [0, 1, 2].every((q) => r10.filter((x) => x[q] === 14).length === 1) && [0, 1, 2].every((q) => r5.filter((x) => x[q] === 6).length === 1) && r10.every((x) => x[0] + x[1] + x[2] === 40), [r10, r5]);
    // random invariants (seeded): the pot paid out exactly whenever a staker finished, nothing when none did; every net in
    // -(stake + 6)..+150; a 기권승 the pot only
    let seed = 777; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const viol = []; let hi = 0, hiW = 0;
    for (let it = 0; it < 4000; it++) {
      const n = 2 + Math.floor(rnd() * 3), m = 1 + Math.floor(rnd() * n), gl = Math.floor(rnd() * (n - m + 1)), s = [5, 10, 20, 50][Math.floor(rnd() * 4)];
      const pts = Array.from({ length: m }, () => Math.floor(rnd() * 3)).sort((a, b) => b - a), pl = [];
      pts.forEach((v, i) => pl.push(i && v === pts[i - 1] ? pl[i - 1] : i + 1));
      const fin = pl.map((q, i) => ({ slot: i, pl: q, p: rnd() < 0.3 ? 1 : 0, z: rnd() < 0.25 ? 1 : 0 }));
      const gz = Math.floor(rnd() * (gl + 1)), K = fin.filter((f) => !f.z).length, pot = s * (K + gl - gz);
      const rows = T.ptable(n, s, fin, gl, gz, Math.floor(rnd() * 9));
      if (m === 1 && !gl) { if (rows.length) viol.push(['m1', n, s]); continue; }
      const shares = rows.reduce((a, r) => a + r[3], 0);
      if (rows.length !== m) viol.push(['rows', n, m]);
      if (K ? shares !== pot : shares !== 0) viol.push(['pot', n, m, gl, gz, s, shares, pot]);
      for (const r of rows) {
        const st = r[5] === 0 ? 0 : s, v = r[2] + r[3] - st;
        if (r[5] === 0 && r[3]) viol.push(['z share', r]);
        if (v < -(st + 6) || v > 150) viol.push(['net', n, m, gl, s, v]);
        if (m === 1) hiW = Math.max(hiW, v); else hi = Math.max(hi, v);
      }
    }
    ok('party table: 4000 random tables - the pot paid out exactly (0 when no staker finished), a row without a stake shares nothing, every net in -(stake + 6)..+150', !viol.length, viol.slice(0, 5));
    log('TROPHY INFO party random: highest finished net ' + hi + ' (spec bound 116), highest 기권승 ' + hiW + ' (150)');
  }
  // the +5 once, 꼴등 빼고, a 기권승 none; the real test over a party's own counters; v: 1 and the late result (9.2.3-6)
  function partyApplyTests() {
    T.fast(true); T.today(20261101);
    const P = D.party, rows4 = T.ptable(4, 10, pfin(4), 0, 0, 0);
    const go = (mid, slot, rows, real) => { fresh(100); T.hold(mid, 10, 4, 0); return T.result(mid, rows, slot, true, real); };
    let r = go(MID(300), 0, rows4, true);
    ok('party apply: 1st of 4 at 10: +26 and the +5 (131), g +1, w +1', r && r.net === 26 && r.bonus === 5 && S().t === 131 && S().g === 1 && S().w === 1, [r, S().t]);
    r = go(MID(301), 2, rows4, true);
    ok('party apply: 3rd breaks even (0) and still gets the +5', r && r.net === 0 && r.bonus === 5 && S().t === 105, [r, S().t]);
    r = go(MID(302), 3, rows4, true);
    ok('party apply: the last place: -16, no +5 (꼴등 빼고)', r && r.net === -16 && r.bonus === 0 && S().t === 84, [r, S().t]);
    const tieL = T.ptable(4, 10, pfin(4, [1, 2, 3, 3]), 0, 0, 0);
    r = go(MID(303), 2, tieL, true);
    ok('party apply: a tie for last: no +5 for either (-8)', r && r.net === -8 && r.bonus === 0, r);
    r = go(MID(304), 0, T.ptable(4, 10, pfin(1), 3, 0, 0), true);
    ok('party apply: a 기권승 (one row): the pot only (+30), no +5 even when called real', r && r.net === 30 && r.bonus === 0, r);
    r = go(MID(305), 1, [[1, 1, 999, 9999, 0, 1]], false);
    ok('party apply: a hostile row clamped as a battle\'s (base <= 16, share <= stake x n)', r && r.net === 16 + 40 - 10, r);
    fresh(100); T.hold(MID(306), 10, 4, 0, 1);
    r = T.result(MID(306), [[0, 1, 16, 20, 0, 0], [1, 2, 8, 12, 0, 1]], 0, true, true);
    ok('party apply: row[5] === 0 pays no stake (and shares none): +16 and the +5', r && r.net === 16 && r.put === 0 && r.bonus === 5, r);
    // troPartyReal over crafted counters: 2 blows in each of 3 판 (no single 판 reaching 5) -> real; 4 in all -> not; 5 but
    // under 60 s of play -> not (real again in the fast party); one finisher -> not; the 판 still open counts
    P.fast(false);
    P.coinPa({ act: [true, true, true], pf: [1300, 1300, 1300], shots: 6, seen: 2, go: 2 });
    const a1 = T.preal(3);
    P.coinPa({ act: [true, true], pf: [1300, 1300, 1300], shots: 4, seen: 1, go: 1, bshots: 3 });
    const a2 = T.preal(3);
    P.coinPa({ shots: 5, pf: [1000, 1000, 1000], seen: 2, go: 2 });
    const a3 = T.preal(3); P.fast(true); const a3f = T.preal(3); P.fast(false);
    P.coinPa({ act: [true, true, true], pf: [1300, 1300, 1300], shots: 6, seen: 2, go: 2 });
    const a4 = T.preal(1);
    P.coinPa({ shots: 4, pf: [1300, 1300, 1300], seen: 1, go: 2, bshots: 2 });
    const a5 = T.preal(3);
    ok('party real (+5): 6 blows over 3 판 -> real; 4 in all -> not; 5 under 60 s -> not (fast party: real); 1 finisher -> not; an open 판\'s blows count', a1 && !a2 && !a3 && a3f && !a4 && a5, [a1, a2, a3, a3f, a4, a5]);
    // v: 1 (a party too short to count): only a party hold of this tab, once; never restarts the pod
    fresh(100);
    T.hold(MID(310), 10, 4, 0);                                          // (a battle hold: no pa)
    T.apply({ t: 'tro', m: MID(310), n: 4, s: 10, r: [], v: 1 }, 1);
    ok('v: 1 for a battle hold changes nothing (still held)', S().t === 84 && S().esc.length === 1 && (!S().pod || S().pod.mid !== MID(310)), [S().t, S().esc]);
    P.coinPa({ shots: 9, pf: [4000], seen: 0, go: 0 });
    T.hold(MID(311), 10, 4, 0, 0, true);
    ok('a party hold carries its counters (livePa)', S().livePa.includes(MID(311)) && !S().livePa.includes(MID(310)), S().livePa);
    T.apply({ t: 'tro', m: MID(311), n: 4, s: 10, r: [], v: 1 }, 1);
    ok('v: 1 for the party hold: refunded at once (68 + 16), the pod says short', S().t === 84 && !S().esc.some((e) => e.m === MID(311)) && S().pod && S().pod.mid === MID(311) && S().pod.kind === 'short', [S().t, S().pod]);
    T.apply({ t: 'tro', m: MID(311), n: 4, s: 10, r: rows4 }, 1);
    T.apply({ t: 'tro', m: MID(311), n: 4, s: 10, r: [], v: 1 }, 1);
    ok('... a normal result or a second v: 1 after it changes nothing, the pod stays short', S().t === 84 && S().pod.kind === 'short' && S().g === 0, [S().t, S().pod, S().g]);
    T.hold(MID(312), 10, 4, 0, 0, true);
    T.apply({ t: 'tro', m: MID(312), n: 4, s: 10, r: rows4 }, 1);
    const t1 = S().t;
    T.apply({ t: 'tro', m: MID(312), n: 4, s: 10, r: [], v: 1 }, 1);
    ok('a v: 1 after an applied result changes nothing (2nd: +10 and the +5 kept)', t1 === 84 - 16 + 16 + 10 + 5 && S().t === t1 && S().pod.kind !== 'short', [t1, S().t, S().pod]);
    // the quick 파티 한 번 더 race: a party hold, then CO.pa replaced by the next party's (0 blows), then the OLD party's
    // result: applied once with the +5 from the OLD counters; the new CO.pa untouched (no coinPartyClose from troResultIn)
    fresh(100);
    P.coinPa({ gid: 7, act: [true, true, true], pf: [1300, 1300, 1300], shots: 6, seen: 2, go: 2 });
    T.hold(MID(320), 10, 4, 0, 0, true);
    const neu = P.coinPa({ gid: 8, shots: 0, seen: -1, go: 0, bshots: 0 });
    T.apply({ t: 'tro', m: MID(320), n: 4, s: 10, r: rows4 }, 1);
    const after = P.state().coins;
    ok('late result after a quick rematch: applied once with the OLD party\'s +5 (84 + 16 + 10 + 5 = 115)', S().t === 115 && S().pod && S().pod.bonus === 5, [S().t, S().pod]);
    ok('... the new party\'s counters untouched', after && after.gid === 8 && after.seen === neu.seen && after.shots === 0 && after.act.length === 0, [neu, after]);
    T.apply({ t: 'tro', m: MID(320), n: 4, s: 10, r: rows4 }, 1);
    ok('... a replay of it changes nothing', S().t === 115, S().t);
    P.coinPa({}); T.fast(false); T.today(null);
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
    ok('bonus: solo game over in the 4th 탕 -> +2 (3 탕 cleared)', ph === 'gameover' && S().t === 32 && S().de === 2 && S().day === 20261014, [ph, S().t, S().de]);
    const dd = $('pg-over-tro');
    ok('bonus: the 목욕 끝 card shows the 트로피 row "+2 · 32개"', shown($('pg-over-trow')) && dd.querySelector('span').textContent === '+2' && dd.querySelector('small').textContent === '32개', dd.textContent);
    let b = T.bonus(false);
    ok('bonus: showing the card again pays nothing more', b && b.give === 0 && b.got === 2 && S().t === 32, b);
    ph = await toOver(0);
    ok('bonus: game over in the 1st 탕 -> nothing, and no row', S().t === 32 && !shown($('pg-over-trow')));
    D.start(0); G.round = 6;
    b = T.bonus(false);
    ok('bonus: 6 탕 cleared with 1 boss -> 4 + 4 = +8', b && b.give === 8 && S().t === 40, b);
    T.today(20261013);                                                // (a fresh day for the caps)
    D.start(0); G.round = 23;
    b = T.bonus(true);
    ok('bonus: a full clear (16 + 16 + 8 = 40) is capped at 30 a run', b && b.give === 30 && b.got === 30, b);
    D.start(0); G.round = 23;
    b = T.bonus(true);
    ok('bonus: the next full clear the same day gets the last 10 (40 a day)', b && b.give === 10 && b.capped && S().de === 40, b);
    D.start(0); G.round = 23;
    b = T.bonus(true);
    ok('bonus: then nothing (capped, shown as "오늘 보너스 끝")', b && b.give === 0 && b.capped && b.show, b);
    ph = await toOver(3);
    ok('bonus: the 목욕 끝 row reads "+0 · 오늘 보너스 끝" when the day is used up', shown($('pg-over-trow')) && dd.querySelector('span').textContent === '+0' && dd.querySelector('small').textContent === '오늘 보너스 끝', dd.textContent);
    T.today(20261015);
    D.start(0); G.round = 23;
    b = T.bonus(true);
    ok('bonus: a new day resets the daily cap', b && b.give === 30 && S().de === 30 && S().day === 20261015, b);
    // 2회차 is a new run (its own 30, under the daily 40)
    T.today(20261016);
    D.start(0); D.gotoRound(23); D.killBoss(); D.step(700);
    ok('bonus: the ending card pays the run (capped 30) and shows the row', D.getState().phase === 'ending' && shown($('pg-end-trow')) && $('pg-end-tro').querySelector('span').textContent === '+30', [D.getState().phase, $('pg-end-tro').textContent]);
    const before = S().t;
    key('Enter');                                                     // 2회차 도전
    ok('bonus: 2회차 starts a new run at round index 24', D.getState().loop === 1 && T.run() && T.run().at === 24 && T.run().got === 0, T.run());
    G.round = 3; G.lives = 1; D.hitPlayer(0); D.step(100);
    ok('bonus: 2회차 game over in its 4th 탕 -> +2 more (its own run)', S().t === before + 2, [before, S().t]);
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
    // (fresh(30): an unplayed store from before the gift was 100 - its note says its own 30, never the new constant)
    ok('rec: league, next league, stats and the note (an unplayed store of 30 says 30)', $('pg-rec-lgname').textContent === '때밀이 견습' && $('pg-rec-next').textContent === '다음 리그까지 30개' && $('pg-rec-win').textContent === '0승 / 0판' &&
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
    fresh(); T.openRec(); await sleep(60);
    const lad2 = [...$('pg-rec-ladder').children];
    ok('rec: a new store: 뽀득 새내기, the gift of 100, 50 to 온탕 단골, 견습 shown as passed', $('pg-rec-lgname').textContent === '뽀득 새내기' && $('pg-rec-next').textContent === '다음 리그까지 50개' &&
      /처음 선물로 트로피 100개를 받았어요/.test($('pg-rec-note').textContent) && lad2[1].getAttribute('aria-current') === 'true' && lad2[0].classList.contains('got'), [$('pg-rec-lgname').textContent, $('pg-rec-note').textContent, lad2.map((l) => l.className)]);
    $('pg-rec-close').click(); await sleep(60);
    T.today(20261025); T.set({ g: 1, day: 20261025, de: 6 }); T.openRec(); await sleep(60);
    ok('rec: after a game the note is today\'s trophy bonus: "오늘 트로피 보너스 6/40개 · 목욕도 배틀도 파티도 받아요"', $('pg-rec-note').textContent === '오늘 트로피 보너스 6/40개 · 목욕도 배틀도 파티도 받아요', $('pg-rec-note').textContent);
    ok('rec: its game row reads 배틀·파티 (parties count in the same 승 / 판)', [...document.querySelectorAll('#pg-rec dt')].some((d) => d.textContent === '배틀·파티'), [...document.querySelectorAll('#pg-rec dt')].map((d) => d.textContent));
    $('pg-rec-close').click(); await sleep(60); T.today(null);
    T.set({ t: 1300, w: 12, g: 30, ko: 44, best: 1400 }); T.openRec(); await sleep(60);
    ok('rec: the top league says so, with a full bar', $('pg-rec-lgname').textContent === '목욕탕 왕' && $('pg-rec-next').textContent === '최고 리그예요!' && $('pg-rec-fill').style.width === '100%' && $('pg-rec-win').textContent === '12승 / 30판', [$('pg-rec-next').textContent, $('pg-rec-fill').style.width]);
    $('pg-rec-close').click();
    // the 승급 chip on the 목욕 끝 card
    fresh(59); T.today(20261020);
    await toOver(3); await sleep(1400);
    ok('card: +2 from 59 -> 61: the 승급 chip "승급! 뽀득 새내기" shows after the row pops', shown($('pg-over-promo')) && $('pg-over-promo').textContent === '승급! 뽀득 새내기' && S().bl === 1, [$('pg-over-promo').hidden, $('pg-over-promo').textContent]);
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
      '이 브라우저에서는 기록이 저장되지 않아요', '처음 선물로 트로피 100개를 받았어요! 친구와 배틀할 때 걸어 봐요', '오늘 트로피 보너스 6/40개 · 목욕도 배틀도 파티도 받아요', '배틀·파티',
      '끝까지 한 판마다 오늘 트로피 보너스 +5 (꼴등 빼고 · 하루 40개까지)', '오늘 트로피 보너스 +5', '내 트로피 -1개, 오늘 트로피 보너스 +5개, 지금 104개',
      '트로피 걸기', '안 걸기', '트로피 부족', '연습 경기', '10개씩', '트로피 10개씩', '트로피 안 걸기',
      '트로피가 모자라요 · 방장에게 걸기를 낮춰 달라고 해요', '트로피가 모자란 친구가 있어요 · 걸기를 낮춰 주세요', '내 트로피가 모자라요 · 걸기를 낮춰 주세요',
      '걸기를 낮췄어요: 10개씩', '걸기를 낮췄어요: 안 걸기', '걸기가 바뀌었어요: 10개씩 · 다시 준비해 주세요',
      '트로피 경기: 1등 +16 · 2등 +8 · 3등 +2 · 4등 -6', '모두 10개씩 걸고 1등이 다 가져요: 1등 +46 · 2등 -2 · 3등 -8 · 4등 -16',
      '견습 리그는 등수로 잃지 않아요 · 판 중간에 나가면 꼴찌로 쳐요', '연습 경기예요: 이 브라우저의 탭끼리는 트로피가 바뀌지 않아요', '연습 경기예요: 같은 기기에서 들어온 친구가 있어요',
      '끝까지 갈수록 모두 트로피를 받아요 (잃지 않아요)', '트로피 10개씩 걸어요!', '연습 경기 · 트로피 없음', '트로피 경기', '결과 발표!', '무승부', '기권승', '연습',
      '내 트로피가 모자라요 · 방으로 가서 걸기를 바꿔요', '트로피가 모자란 친구가 있어요 · 방으로 가서 걸기를 바꿔요', '친구가 나가서 이번 판은 무효예요',
      '방장이 다음 판을 고르고 있어요 · 다음 판도 10개씩', '트로피', '+15', '31개', '오늘 보너스 끝', '한 번 더 누르면 나가요 · 트로피 -16', '한 번 더 누르면 모두 방으로 · 내 트로피 -16',
      '걸었던 트로피를 돌려받았어요', '이번 판은 진 걸로 쳤어요',
      // (안 걸고 참여)
      '안 걸고 참여', '안 걸고 준비', '트로피가 모자라요 · 안 걸고 같이 해요', '판돈 30개 (3명이 10개씩): 건 사람 중 1등이 다 가져요',
      '안 걸고 참여: 등수 점수만 받아요 · 1등 +16 · 2등 +8 · 3등 +2 · 4등 -6', '트로피가 모자라면 안 걸고 참여해요 (등수 점수만 받아요)',
      '내 트로피가 모자라서 다음 판은 안 걸고 해요', '다음 판은 안 걸고 하는 친구가 있어요', '방장이 다음 판을 고르고 있어요 · 다음 판도 10개씩 · 나는 안 걸고 해요',
      '안 걸고 참여 · 오늘 트로피 보너스 +5', '내 트로피 +16개 (안 걸고 참여), 오늘 트로피 보너스 +5개, 지금 28개'].concat(L, L.map((n) => '승급! ' + n));
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
    // (the 승급 chip sharing its line with 최고 기록 달성!: 57 + 8 (6 탕 cleared, a boss) -> 65, a new best score)
    else if (name === 'overpromo') { T.set({ t: 57, bl: 0 }); G.hiscore = 0; D.start(0); D.gotoRound(6); G.score = 54321; G.newHi = true; G.lives = 1; D.hitPlayer(0); D.step(100); await sleep(1800); }
    else if (name === 'ending') { T.set({ t: 140, bl: 1 }); D.start(0); D.gotoRound(23); D.killBoss(); D.step(700); await sleep(1500); }
    log('TROPHY SHOT READY ' + name);
  }
  async function run() {
    for (let i = 0; i < 300 && !(window.PG && PG.debug && PG.debug.tro); i++) await sleep(20);
    D = PG.debug; T = D.tro; G = D.G;
    const sm = /shot=([a-z]+)/.exec(location.hash);
    if (sm) { if (/touch/.test(location.hash)) window.dispatchEvent(new Event('touchstart')); await shot(sm[1]); return; }
    const steps = FIT_ONLY ? [fitTests] : [storeTests, rmwTests, ruleTests, applyTests, partyTableTests, partyApplyTests, endTests, bonusTests, uiTests, fitTests, fontTests];
    for (const f of steps) {
      try { await f(); } catch (e) { fail++; log('TROPHY FAIL ' + f.name + ' threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
    }
    log('TROPHY DONE pass=' + pass + ' fail=' + fail);
  }
  setTimeout(run, 50);
})();
