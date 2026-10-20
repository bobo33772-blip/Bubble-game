// v4 뽑기 (비누 캡슐 뽑기, design/gacha.md 13.1): the catalog, the pure draw, the odds, the pace, offline in virtual time.
//   node bogeul/build.js
//   node bogeul/tools/run-chrome.js test-gacha.html - 900 760 120000 "GACHA DONE"
// Checks (G1): 1. the pool and the odds (the 43 ids of 3.2, weights, tiers, drawW's zeros, refunds below the price);
// 2. the pity and the 10회 (drawCands: 확정 / 희귀+ / normal, the kind-2 draw's place in 100 seeded batches); 3. the
// statistics of drawPick with the real crypto RNG (tiers, items, chi-square) and drawInt's range / fallback; 4. the pace
// (drawPace: 20,000 seeded collections, 3.7's numbers). (G2): 5. the commit before the animation (the store as written,
// a "reload" draws nothing, the 10회, done / read-only / poor); 6. refunds (full, never clamped, the log parses); 7. the
// store v 4 (migrations from v 3 / 2 / 1, a v 6 store read-only, every clamp; written back as v 5, the trophy balance); 8. two tabs (the other tab's write
// followed at its storage event, drawLost: a lost batch caught by its id, none after two batches one after the other).
// Every store test runs in its own namespace (PG.debug.tro.ns).
// Prints "GACHA PASS|FAIL <name>", "GACHA INFO ..." and "GACHA DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => { if (cond) { pass++; log('GACHA PASS ' + name); } else { fail++; log('GACHA FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); } return !!cond; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let D, DR, SH, T, IT;
  let nsN = 0;
  const raw = () => { try { return JSON.parse(localStorage.getItem(T.state().key)); } catch (e) { return null; } };
  const fresh = (o) => { T.ns('gacha' + (++nsN)); T.away(false); DR.forget(); if (o) SH.set(o); return DR.state(); };
  const storage = () => window.dispatchEvent(new StorageEvent('storage', { key: T.state().key }));
  // a seeded generator in [0, 1) (mulberry32)
  const seeded = (seed) => { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const sum = (L) => L.reduce((s, e) => s + e[1], 0);

  // ---------------------------------------------------------------- 1. the pool and the odds (pure)
  const TIERS = { 0: 'h1 h2 h3 h4 f1 f2 n2 n3 n4 b1 e2 e1', 1: 'h5 h6 h7 f4 f5 f6 n6 b2 b3 b4 e3 e4 f9 n9', 2: 'h9 ha f7 n8 b5 b6 e5 he f8 na b8 e7', 3: 'b7 e6 hd b9 e8' };
  function poolTests() {
    const C = DR.consts(), want = [].concat(...Object.values(TIERS).map((s) => s.split(' ')));
    ok('pool: exactly the 43 ids of 3.2, no league item, no starter, every draw-only item', C.pool.length === 43 && same(C.pool.slice().sort(), want.slice().sort()) &&
      !C.pool.some((id) => IT[id].lg > 0 || IT[id].rar < 0) && Object.values(IT).filter((it) => it.dr).every((it) => C.pool.includes(it.id)), C.pool);
    ok('pool: DRAW_IDS equals it today (grow-only, holds every pool id); DRAW_ONLY = the 10 draw-only ids', same(C.ids, C.pool) && same(C.only, 'hd he f8 f9 n9 na b8 b9 e7 e8'.split(' ')), [C.ids.length, C.only]);
    const tier = [0, 0, 0, 0]; let tot = 0, each = true;
    for (const id of C.pool) { const w = C.w[id], it = IT[id]; tot += w; tier[it.rar] += w; if (w !== (it.dr ? [0, 500, 200, 100] : [375, 200, 100, 50])[it.rar]) each = false; }
    ok('odds: the weights add up to 10,000; tiers 4,500 / 3,400 / 1,700 / 400; each item as the table (shop 375 / 200 / 100 / 50, draw-only 500 / 200 / 100)', tot === 10000 && same(tier, [4500, 3400, 1700, 400]) && each, [tot, tier]);
    const lg = Object.values(IT).filter((it) => it.lg > 0 || it.rar < 0);
    ok('odds: drawW is 0 for the 6 league items and the starter', lg.length === 7 && lg.every((it) => C.w[it.id] === 0 && DR.w(it) === 0), lg.map((it) => it.id));
    SH.retire('h1', true);
    const rw = DR.consts().w.h1, rp = DR.isPool('h1');
    SH.retire('h1', false);
    ok('odds: a retired item weighs 0 but stays in DRAW_IDS (isPoolId)', rw === 0 && rp && DR.w(Object.assign({}, IT.h5, { retired: 1 })) === 0 && DR.consts().w.h1 === 375, [rw, rp]);
    ok('odds: every refund is below the price (30 / 60 / 100 / 150 < 200); no 보통 draw-only weight', same(C.DRAW.refund, [30, 60, 100, 150]) && C.DRAW.refund.every((r) => r < C.DRAW.price) && C.DRAW.price === 200 && C.DRAW.wd[0] === 0, C.DRAW);
    const O = DR.odds([]);
    ok('odds(): the panel data - tiers, columns (10,000 / 2,100 / 2,300 fresh), 확정 only draw-only', O.sum === 10000 && O.sumRare === 2100 && O.sumPity === 2300 && same(O.rows.map((r) => r.total), [4500, 3400, 1700, 400]) &&
      O.rows.every((r) => r.items.every(([id, w, wr, wp]) => w === C.w[id] && wr === (IT[id].rar >= 2 ? w : 0) && wp === (IT[id].dr ? w : 0))), [O.sum, O.sumRare, O.sumPity]);
    const O2 = DR.odds(['f9', 'hd']);
    ok('odds(): the 확정 column follows the store (f9 and hd owned -> 2,300 - 500 - 100)', O2.sumPity === 1700 && O2.rows[1].items.find((e) => e[0] === 'f9')[3] === 0 && O2.rows[1].items.find((e) => e[0] === 'n9')[3] === 500, O2.sumPity);
    ok('pool: isPoolId - no league item, no starter, no junk', !DR.isPool('h8') && !DR.isPool('n1') && !DR.isPool('zz') && !DR.isPool('constructor') && !DR.isPool(5) && DR.isPool('hd') && DR.isPool('h1'));
  }

  // ---------------------------------------------------------------- 2. the pity and the 10회 (pure drawCands)
  function pityTests() {
    const ONLY = DR.consts().only, WD = { 1: 500, 2: 200, 3: 100 };
    let c = DR.cands([], 0, 0, false);
    ok('pity: dn 0 (never drew) -> kind 1, only the unowned draw-only items, 5 : 2 : 1', c.k === 1 && same(c.L.map((e) => e[0]), ONLY) && c.L.every(([id, w]) => w === WD[IT[id].rar]), c);
    c = DR.cands(['hd', 'f9', 'h1'], 0, 0, false);
    ok('pity: ... without the owned ones', c.k === 1 && c.L.length === 8 && !c.L.some((e) => e[0] === 'hd' || e[0] === 'f9'), c.L.map((e) => e[0]));
    const c9 = DR.cands(['h1'], 9, 30, false), c8 = DR.cands(['h1'], 8, 30, false);
    ok('pity: pt 9 -> kind 1; pt 8 -> kind 0, the whole pool (43, 10,000)', c9.k === 1 && c9.L.length === 10 && c8.k === 0 && c8.L.length === 43 && sum(c8.L) === 10000, [c9.k, c8.k, c8.L.length]);
    const all = ONLY.concat(['h1', 'b7']);
    ok('pity: every draw-only item owned -> never kind 1, whatever pt / dn; drawDone true', [[0, 0], [9, 0], [9, 50], [0, 7]].every(([pt, dn]) => DR.cands(all, pt, dn, false).k === 0) && DR.done({ own: all }) && !DR.done({ own: ONLY.slice(1) }), DR.cands(all, 9, 0, false).k);
    const r = DR.cands(['h1'], 3, 12, true);
    ok('10회: rare -> kind 2, only 희귀 / 전설 (17 items - 3.4 says 21, its own table gives 7 + 5 + 2 + 3 - weighing 2,100)', r.k === 2 && r.L.length === 17 && sum(r.L) === 2100 && r.L.every(([id]) => IT[id].rar >= 2), [r.k, r.L.length, sum(r.L)]);
    ok('10회: rare with a 확정 due -> kind 1 first (pt 9 / dn 0)', DR.cands(['h1'], 9, 12, true).k === 1 && DR.cands([], 0, 0, true).k === 1 && DR.cands(all, 9, 0, true).k === 2);
    // 100 seeded batches from varied stores: the kind-2 draw is draw 1, or draw 2 after a 확정 draw 1, exactly once
    const rnd = seeded(4242), pool = DR.consts().pool;
    let good = 0; const bad = [];
    DR.rng(seeded(99));
    try {
      for (let b = 0; b < 100; b++) {
        const own = pool.filter(() => rnd() < (b % 4) / 4), S = { own, gd: [], nw: [], dn: b % 7 === 0 ? 0 : 1 + Math.floor(rnd() * 80), pt: Math.floor(rnd() * 10), ce: 0, sp: 0 };
        const ks = []; let rare = true;
        for (let i = 0; i < 10; i++) { const o = DR.one(S, rare); if (o.k === 2) rare = false; ks.push(o.k); }
        const at = ks.indexOf(2), n2 = ks.filter((k) => k === 2).length;
        if (n2 === 1 && (at === 0 || (at === 1 && ks[0] === 1))) good++; else bad.push(ks.join(''));
      }
    } finally { DR.rng(null); }
    ok('10회: in 100 seeded batches the 희귀+ draw is draw 1, or draw 2 after a 확정 draw 1 - exactly once each', good === 100, bad.slice(0, 5));
  }

  // ---------------------------------------------------------------- 3. the statistics (the real crypto RNG)
  function statTests() {
    DR.rng(null);
    const L = DR.cands([], 0, 1, false).L, N = 200000, n = {};
    for (const [id] of L) n[id] = 0;
    for (let i = 0; i < N; i++) n[DR.pick(L)]++;
    const tier = [0, 0, 0, 0]; let chi = 0, worst = 0;
    for (const [id, w] of L) {
      const p = w / 10000, e = N * p, sd = Math.sqrt(N * p * (1 - p));
      tier[IT[id].rar] += n[id]; chi += (n[id] - e) * (n[id] - e) / e; worst = Math.max(worst, Math.abs(n[id] - e) / sd);
    }
    const pct = tier.map((x) => x / N * 100), dfn = L.length - 1, z = 3.0902;
    const crit = dfn * Math.pow(1 - 2 / (9 * dfn) + z * Math.sqrt(2 / (9 * dfn)), 3);   // (chi-square 0.001, Wilson-Hilferty)
    ok('stats: 200,000 picks - each tier within 0.5 points of 45 / 34 / 17 / 4 %', [45, 34, 17, 4].every((t, i) => Math.abs(pct[i] - t) <= 0.5), pct.map((x) => x.toFixed(2)));
    ok('stats: each item within 4 standard deviations', worst < 4, worst.toFixed(2));
    ok('stats: chi-square over the 43 items below the 0.001 critical value', chi < crit, [chi.toFixed(1), crit.toFixed(1)]);
    log('GACHA INFO stats tiers ' + pct.map((x) => x.toFixed(2)).join(' / ') + ' chi2 ' + chi.toFixed(1) + ' / ' + crit.toFixed(1) + ' worst ' + worst.toFixed(2) + ' sd');
    let inRange = true;
    for (let k = 1; k <= 10000; k++) { const v = DR.int(k); if (!(v >= 0 && v < k && Number.isInteger(v))) { inRange = false; break; } }
    ok('stats: drawInt(n) over 1..10,000 never returns >= n (or a fraction, or < 0)', inRange && DR.int(0) === 0 && DR.int(-5) === 0);
    const P = Object.getPrototypeOf(window.crypto), g = P.getRandomValues;
    let threw = null, fine = true;
    try {
      P.getRandomValues = function () { throw new Error('no crypto'); };
      for (let i = 0; i < 200; i++) { const v = DR.int(37); if (!(v >= 0 && v < 37)) fine = false; }
    } catch (e) { threw = String(e); } finally { P.getRandomValues = g; }
    ok('stats: with crypto failing, drawInt falls back to Math.random without throwing', !threw && fine, threw);
  }

  // ---------------------------------------------------------------- 4. the pace (3.7)
  function drawPace() {
    const t0 = performance.now(), R = DR.sim(20000, 20261019), ms = performance.now() - t0;
    log('GACHA INFO pace ' + JSON.stringify(R) + ' in ' + Math.round(ms) + ' ms');
    const near = (v, want) => Math.abs(v - want) <= want * 0.05;
    ok('pace: all 10 draw-only items in 60-66 draws on average (63), p90 <= 78', R.avg >= 60 && R.avg <= 66 && R.p90 <= 78, [R.avg, R.p10, R.med, R.p90, R.max]);
    ok('pace: never more than 10 draws between two new draw-only items, in every run', R.gapMax <= 10, R.gapMax);
    ok('pace: net coins within 5 % of 11,000; shop value within 5 % of 4,000', near(R.net, 11000) && near(R.shop, 4000), [R.net, R.shop]);
    ok('pace: a fresh 10회 - 2.9 new draw-only items (5 %), always a 희귀+; 15 fresh single draws - 3.5', near(R.ten, 2.9) && R.tenRare === 1 && near(R.fifteen, 3.5), [R.ten, R.tenHi, R.tenRare, R.fifteen]);
    ok('pace: the first draw is a draw-only item in 100 % of runs', R.first === 1, R.first);
  }

  // ---------------------------------------------------------------- 5. the commit before the animation (store level)
  function commitTests() {
    fresh({ ce: 5000 });
    const r = DR.commit(1), o = raw();
    ok('commit: one draw - the store on disk is the result: dn 1, sp 200, the item owned and in gd, pt 0 (a first draw: 확정), ce untouched, the log with its id',
      r.ok && r.n === 1 && o.dn === 1 && o.sp === 200 && o.ce === 5000 && o.own.includes(r.res[0].id) && same(o.gd, [r.res[0].id]) && o.pt === 0 && r.res[0].k === 1 && !r.res[0].dup && IT[r.res[0].id].dr &&
      o.dl && o.dl.id === r.id && /^[0-9a-z]{6}$/.test(r.id) && o.dl.n === 1 && same(o.dl.r, [[r.res[0].id, 0, 1]]) && same(o.nw, [r.res[0].id]) && r.now === 4800, [r, o]);
    const name = T.state().key.replace('ppogeul-trophy-', ''), before = JSON.stringify(raw());
    T.ns(name);
    ok('commit: a "reload" (troLoad on the same key) gives the same store and draws nothing', JSON.stringify(raw()) === before && DR.state().dn === 1 && DR.state().dl.id === r.id);
    const sp0 = raw().sp, r10 = DR.commit(10), o10 = raw();
    ok('commit: a 10회 - sp + 2,000 once, dn 11, a log of 10 with at least one 희귀+ and exactly one kind-2 draw',
      r10.ok && o10.sp === sp0 + 2000 && o10.dn === 11 && o10.dl.r.length === 10 && o10.dl.r.some((e) => IT[e[0]].rar >= 2) && o10.dl.r.filter((e) => e[2] === 2).length === 1 && o10.dl.id === r10.id && o10.dl.n === 11, [r10.res.map((q) => [q.id, q.k]), o10.sp - sp0]);
    ok('commit: refunds in the 10회 went into ce (dups only), never paying a later draw of it', o10.ce === 5000 + r10.res.reduce((t, q) => t + q.ref, 0) && r10.res.every((q) => q.dup ? q.ref === [30, 60, 100, 150][IT[q.id].rar] : q.ref === 0), r10.res);
    fresh({ ce: 199 });
    const rp = DR.commit(1), rp10 = DR.commit(10);
    ok('commit: too poor -> poor with what is missing (1 / 1,801); nothing written', rp.why === 'poor' && rp.need === 1 && rp10.why === 'poor' && rp10.need === 1801 && raw().dn === 0 && raw().sp === 0, [rp, rp10]);
    ok('commit: n other than 1 / 10 -> bad', DR.commit(2).why === 'bad' && DR.commit(0).why === 'bad' && raw().dn === 0);
    fresh({ ce: 5000, own: DR.consts().only.slice(), dn: 30 });
    ok('commit: every draw-only item owned -> done (nothing spent)', DR.state().done && DR.commit(1).why === 'done' && DR.commit(10).why === 'done' && raw().sp === 0, DR.state());
    localStorage.setItem('ppogeul-trophy-gachanewer', JSON.stringify({ v: 6, dev: 'abcdefgh', t: 9, ce: 5000 }));
    T.ns('gachanewer');
    ok('commit: a read-only store (v 6 on disk) -> ro, the key untouched', T.state().ro && DR.commit(1).why === 'ro' && JSON.parse(localStorage.getItem('ppogeul-trophy-gachanewer')).v === 6);
  }

  // ---------------------------------------------------------------- 6. refunds
  function refundTests() {
    const C = DR.consts(), miss = 'e8', own = C.pool.filter((id) => id !== miss);
    fresh({ ce: 1000, own, dn: 50, pt: 3 });
    const s0 = DR.state();
    DR.rng(() => 0);                                         // (the first pool item, h1 - 보통, owned: a duplicate)
    let r; try { r = DR.commit(1); } finally { DR.rng(null); }
    const s1 = DR.state();
    ok('refund: a duplicate (h1, 보통) pays back the full 30 into ce; own / gd / nw unchanged; pt + 1; sp + 200',
      r.ok && r.res[0].id === 'h1' && r.res[0].dup && r.res[0].ref === 30 && raw().ce === 1030 && raw().sp === 200 && same(s1.own, s0.own) && same(s1.gd, s0.gd) && same(s1.nw, s0.nw) && s1.pt === 4 && r.now === 830, [r, s1.pt]);
    ok('refund: ... its log says so ([h1, 30, 0])', same(raw().dl.r, [['h1', 30, 0]]));
    fresh({ ce: 300000, own, dn: 50, pt: 3 });
    DR.rng(() => 0);                                         // (h1 again: a duplicate)
    let r2; try { r2 = DR.commit(1); } finally { DR.rng(null); }
    const name = T.state().key.replace('ppogeul-trophy-', ''); T.ns(name);
    const want = r2.res[0].dup ? [30, 60, 100, 150][IT[r2.res[0].id].rar] : 0;
    ok('refund: a store whose coins are far above 99,999 still gets the FULL refund (never clamped), and its log parses after a reload',
      r2.ok && raw().ce === 300000 + want && DR.state().dl && DR.state().dl.id === r2.id && same(DR.state().dl.r[0], [r2.res[0].id, want, r2.res[0].k]), [r2, raw().ce]);
  }

  // ---------------------------------------------------------------- 7. the store v 4 (troParse)
  function storeTests() {
    const now = Date.now(), eqs = '50000' + '00300'.repeat(4) + '00006';
    const cs = { u: 'uidgacha', k: 'kgacha01', c: { t: 5, w: 0, g: 1, ko: 0, de: 0, day: 20261019, ce: 100, sp: 60, o: ['h5'], bd: 0, bs: 0 }, v: { t: 35, w: 0, g: 1, ko: 0, de: 0, day: 20261019, ce: 900, sp: 280, o: ['h5', 'n3'], bd: 0, bs: 0 }, m: { n: 2, t: 5, g: 1, ce: 100, sp: 60, o: ['h5'] }, n: 2, mt: 1, ev: eqs };
    const v3 = { v: 3, dev: 'abcd1234', t: 345, best: 400, bl: 3, w: 5, g: 9, ko: 12, day: 20261019, de: 7, seen: 1, esc: [{ m: 'abc123.1', tab: 'zzzzzz', h: 16, s: 10, n: 4, p: 0, st: 'open', t0: now }],
      ce: 900, sp: 280, own: ['h5', 'n3', 'e6'], eq: eqs, lh: 0, cd: 20261019, cde: 40, bd: 20261019, bs: 2, sh: 1, cv: 300, cs };
    localStorage.setItem('ppogeul-trophy-gachav3', JSON.stringify(v3));
    T.ns('gachav3');
    const o = raw(), keep = Object.keys(v3).filter((k) => k !== 'v' && k !== 'cs');
    ok('store: a v 3 store (coins, items, six worn sets, a link record, a hold) -> v 5, every v 3 field identical, written back at load',
      o.v === 5 && keep.every((k) => same(o[k], v3[k])) && o.cs && o.cs.u === cs.u && o.cs.k === cs.k && o.cs.n === 2 && o.cs.ev === eqs && !T.state().ro, keep.filter((k) => !same(o[k], v3[k])));
    ok('store: ... with no draws: dn 0, pt 0, gd [], dl null, ds 0, nw [], gs 0', o.dn === 0 && o.pt === 0 && same(o.gd, []) && o.dl === null && o.ds === 0 && same(o.nw, []) && o.gs === 0, o);
    localStorage.setItem('ppogeul-trophy-gachav2', JSON.stringify({ v: 2, dev: 'abcd1234', t: 50, best: 50, esc: [], ce: 90, sp: 0, own: ['h1'], eq: '10000' }));
    T.ns('gachav2'); const o2 = raw();
    localStorage.setItem('ppogeul-trophy-gachav1', JSON.stringify({ v: 1, dev: 'abcd1234', t: 50, best: 50, esc: [] }));
    T.ns('gachav1'); const o1 = raw();
    ok('store: v 2 and v 1 migrate the same way (looks\' migration, then no draws), written back as v 5', o2.v === 5 && o2.eq === '10000'.repeat(6) && o2.lh === 1 && o2.dn === 0 && same(o2.gd, []) && o1.v === 5 && o1.dn === 0 && o1.dl === null && same(o1.own, []), [o2, o1]);
    const v6 = JSON.stringify({ v: 6, dev: 'abcd1234', t: 50, dn: 7, gd: ['hd'] });
    localStorage.setItem('ppogeul-trophy-gachav6', v6); T.ns('gachav6');
    ok('store: a v 6 store -> read-only, untouched', T.state().ro && localStorage.getItem('ppogeul-trophy-gachav6') === v6);
    // the clamps
    const B = { v: 4, dev: 'abcd1234', t: 30, best: 30, esc: [], ce: 0, sp: 0, own: ['h1', 'hd', 'f9', 'h8', 'b7'], dn: -5, pt: 99,
      gd: ['h1', 'zz', 'h2', 'h8', 'n1', 'constructor', 'b7', 'b7'], dl: null, ds: 99, nw: ['h1', 'h2', 'zz', 'hd', 'hd'] };
    const put = (o) => { localStorage.setItem('ppogeul-trophy-gachaclamp', JSON.stringify(Object.assign({}, B, o))); T.ns('gachaclamp'); return DR.state(); };
    let c = put({});
    ok('clamps: gd keeps owned pool ids only (h1 b7; not h2 unowned, h8 a league item, n1, junk), every owned draw-only id added (hd f9), in own\'s order, once',
      same(c.gd, ['h1', 'hd', 'f9', 'b7']), c.gd);
    ok('clamps: dn -5 -> raised to gd\'s length (4); pt 99 -> 9; ds <= dn; nw owned ids only, once', c.dn === 4 && c.pt === 9 && c.ds === 4 && same(c.nw, ['h1', 'hd']), [c.dn, c.pt, c.ds, c.nw]);
    c = put({ dn: 2 });
    ok('clamps: dn below gd\'s length (2 < 4) -> raised to 4', c.dn === 4, c.dn);
    const L = (r, o) => put(Object.assign({ dn: 20, dl: Object.assign({ id: 'abc123', n: 3, r }, o || {}) })).dl;
    ok('clamps: a good log is kept as it is', same(L([['h1', 30, 0], ['hd', 0, 1], ['b7', 0, 2]]), { id: 'abc123', n: 3, r: [['h1', 30, 0], ['hd', 0, 1], ['b7', 0, 2]] }));
    const r11 = []; for (let i = 0; i < 11; i++) r11.push(['h1', 30, 0]);
    ok('clamps: a log of 11, a wrong refund, a bad kind, a non-pool id, a missing / bad id, n > dn, n 0, no results -> null',
      L(r11) === null && L([['h1', 60, 0]]) === null && L([['h1', 30, 3]]) === null && L([['h8', 0, 0]]) === null && L([['h1', 30, 0]], { id: undefined }) === null &&
      L([['h1', 30, 0]], { id: 'ABC123' }) === null && L([['h1', 30, 0]], { n: 21 }) === null && L([['h1', 30, 0]], { n: 0 }) === null && L([]) === null);
    const nw17 = []; for (const id of DR.consts().pool.slice(0, 17)) nw17.push(id);
    c = put({ own: nw17, nw: nw17, gd: [] });
    ok('clamps: 17 NEW ids -> the last 16', same(c.nw, nw17.slice(-16)), c.nw);
  }

  // ---------------------------------------------------------------- 8. two tabs (the other tab emulated on the same key)
  function twoTabTests() {
    fresh({ ce: 9000, dn: 5, pt: 2 });
    // another tab draws: its write arrives as a storage event - this page follows at once (store only; the 뽑기 tab's chip,
    // pity line and collection follow it in G3)
    const o = raw(); o.dn = 6; o.sp += 200; o.own = o.own.concat(['h2']); o.gd = o.gd.concat(['h2']); o.pt = 3; o.dl = { id: 'oth001', n: 6, r: [['h2', 0, 0]] };
    localStorage.setItem(T.state().key, JSON.stringify(o)); storage();
    ok('two tabs: the other tab\'s draw shows here at its storage event (dn 6, h2 owned, coins down 200), nothing lost here', DR.state().dn === 6 && DR.state().own.includes('h2') && DR.state().co === 8800 && !DR.state().lost && !DR.lost(), DR.state());
    // a lost write: this tab draws, the other tab's write from BEFORE it wins with the same dn - caught by the batch id
    const pre = raw();
    DR.rng(() => 0); let r; try { r = DR.commit(1); } finally { DR.rng(null); }   // (h1: new here)
    const lost = Object.assign({}, pre, { dn: 7, sp: pre.sp + 200, own: pre.own.concat(['h3']), gd: pre.gd.concat(['h3']), dl: { id: 'oth002', n: 7, r: [['h3', 0, 0]] } });
    const mineNew = r.res.filter((q) => !q.dup).map((q) => q.id);
    localStorage.setItem(T.state().key, JSON.stringify(lost)); storage();
    ok('two tabs: a lost batch (equal dn after the clash) is caught by its id: lost, its item not owned, its coins back with it', r.ok && r.n === 7 && DR.state().dn === 7 && DR.state().lost && DR.state().lost.id === r.id && !DR.state().mine &&
      mineNew.every((id) => !DR.state().own.includes(id)) && DR.state().co === 8600, [r.res, DR.state().lost, DR.state().co]);
    // a batch of duplicates only, lost: caught by the count (the other tab's write has a lower dn)
    DR.forget();
    const pre2 = raw();
    SH.set({ own: DR.consts().pool.filter((id) => !DR.consts().only.includes(id)).concat(DR.consts().only.slice(1)) });
    const pre3 = raw();
    DR.rng(() => 0); let rd; try { rd = DR.commit(1); } finally { DR.rng(null); }
    localStorage.setItem(T.state().key, JSON.stringify(Object.assign({}, pre3, { dl: pre2.dl }))); storage();
    ok('two tabs: a lost batch of duplicates only (h1) is caught by the count alone', rd.ok && rd.res[0].dup && DR.state().lost && DR.state().lost.id === rd.id && DR.state().dn === pre3.dn, [rd.res, DR.state().lost, DR.state().dn]);
    // two batches one after the other (this tab, then the other on top of it): never lost
    DR.forget();
    const r1 = DR.commit(1), after = raw();
    const next = Object.assign({}, after, { dn: after.dn + 1, sp: after.sp + 200, dl: { id: 'oth003', n: after.dn + 1, r: [['h1', 30, 0]] }, ce: after.ce + 30 });
    localStorage.setItem(T.state().key, JSON.stringify(next)); storage();
    ok('two tabs: two legitimate batches one after the other (mine, then the other tab\'s on top) -> not lost', r1.ok && !DR.state().lost && !!DR.state().mine && DR.state().dn === after.dn + 1, [r1.ok, DR.state().lost]);
  }

  // ---------------------------------------------------------------- G3: 9. the 뽑기 tab (no show), 10. its fit, 11. e7 / e8
  const $ = (id) => document.getElementById(id);
  const info = (s) => log('GACHA INFO ' + s);
  // prefers-reduced-motion on demand (CALM = true): the engine holds its MediaQueryList, so answer through the prototype
  let CALM = false;
  try {
    const md = Object.getOwnPropertyDescriptor(MediaQueryList.prototype, 'matches');
    Object.defineProperty(MediaQueryList.prototype, 'matches', { configurable: true, get() { return (CALM && /reduced-motion: reduce/.test(this.media)) || md.get.call(this); } });
  } catch (e) { /* ignore */ }
  let G, L;
  const st = () => DR.state();
  const keyOn = (code, o) => { const t = document.activeElement || document.body, e = new KeyboardEvent('keydown', Object.assign({ code, key: code, bubbles: true, cancelable: true }, o || {})); t.dispatchEvent(e); t.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); return e; };
  const hangul = (s) => (String(s).match(/[가-힣]/g) || []).length;
  const lkOf = (...ids) => { const k = ['0', '0', '0', '0', '0']; for (const id of ids) k['hfnbe'.indexOf(id[0])] = id[1]; return k.join(''); };
  const cellOf = (id) => document.querySelector('#pg-gacha-grid [role="option"][data-id="' + id + '"]');
  const resCells = () => [...document.querySelectorAll('#pg-gacha-grid [role="option"]')];
  const pill = () => document.querySelector('#pg-hub-draw .pg-look-name');
  const P = (w, t, d) => (w / t * 100).toLocaleString('ko-KR', { maximumFractionDigits: d === undefined ? 2 : d }) + '%';
  const ONLY = () => DR.consts().only;
  // the 뽑기 tab opened from the title on a fresh store (o merged; the 상점 and the 뽑기 tab already seen)
  async function openDraw(o) { fresh(Object.assign({ sh: 1, gs: 1 }, o || {})); D.toTitle(); await sleep(40); DR.open('title'); await sleep(40); return st(); }
  // both taps of a draw button, 400 ms apart (rng: a test generator for the batch)
  // (G4: and the show played to its reveal - its own tests are animTests; keep: the show left running)
  async function draw2(w, rng, keep) { if (rng) DR.rng(rng); try { DR.tap(w); await sleep(400); DR.tap(w); } finally { DR.rng(null); } if (!keep) { await sleep(20); for (let i = 0; i < 260 && st().anim; i++) SH.tick(1); } await sleep(20); return st(); }
  const first0 = (seed) => { const g = seeded(seed); let k = 0; return () => (k++ ? g() : 0); };   // (0 first: the 확정 draw takes hd)
  // the footer's lines while the 뽑기 tab shows (6.4: never over 12 syllables there)
  const MSGS = [];
  function watchMsgs() { try { new MutationObserver(() => { const t = $('pg-hub-msg').textContent; if (t && D.shop.hub().tab === 'draw') MSGS.push(t); }).observe($('pg-hub-msg'), { childList: true, characterData: true, subtree: true }); } catch (e) { /* ignore */ } }

  async function tabUiTests() {
    fresh({ ce: 500, sh: 1, gs: 0, cv: 500 }); D.toTitle(); await sleep(40);
    const lab = () => $('pg-shop-btn').getAttribute('aria-label') || '';
    ok('title: the first draw is affordable and 뽑기 never seen -> the 상점 dot, its label ends "· 뽑기를 할 수 있어요"', SH.state().newDot && / · 뽑기를 할 수 있어요$/.test(lab()), [SH.state().newDot, lab()]);
    SH.open('shop', 'title'); await sleep(40);
    const tabs = [...document.querySelectorAll('#pg-hub [role="tab"][data-hub]')].map((b) => b.dataset.hub);
    ok('tabs: 상점 · 뽑기 · 마이페이지 in that order; the 뽑기 dot on its own tab until the first visit; the tablist label',
      same(tabs, ['shop', 'draw', 'my']) && !$('pg-tab-draw-new').hidden && $('pg-tab-draw-new').parentNode.id === 'pg-tab-draw' && st().gs === 0 &&
      document.querySelector('#pg-hub .pg-tabs').getAttribute('aria-label') === '상점, 뽑기, 마이페이지', tabs);
    $('pg-tab-shop').focus(); const seen = [];
    for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft']) { keyOn(k); seen.push(st().tab + ':' + document.activeElement.id); }
    ok('tabs: ←/→ go round all three, the focus staying on the tabs', same(seen, ['draw:pg-tab-draw', 'my:pg-tab-my', 'shop:pg-tab-shop', 'my:pg-tab-my']), seen);
    ok('tabs: showing 뽑기 marked it seen (gs 1): its dot is gone', st().gs === 1 && $('pg-tab-draw-new').hidden);
    SH.close(); await sleep(20);
    ok('title: after the visit the dot is off and the label has no 뽑기 part', !SH.state().newDot && !/뽑기를/.test(lab()), [SH.state().newDot, lab()]);
    // focus: only when the hub OPENS on 뽑기 (keyboard / mouse) - 1회 뽑기
    await openDraw({ ce: 500, dn: 2 });
    ok('focus: the hub opened on 뽑기 focuses 1회 뽑기', document.activeElement === $('pg-gacha-one'), document.activeElement && document.activeElement.id);
  }

  async function btnTests() {
    let s = await openDraw({ ce: 5000, dn: 3, pt: 2 });
    ok('buttons: ready - 1회 뽑기 / 10회 뽑기 over their prices, the aria-labels', s.btn[0].k === 'go' && s.btn[0].t === '1회 뽑기200' && s.btn[0].aria === '1회 뽑기 · 200코인' &&
      s.btn[1].t === '10회 뽑기2,000' && s.btn[1].aria === '10회 뽑기 · 2,000코인 · 희귀 이상 1개 확정' && !s.skip && !s.btn[0].dis, s.btn);
    ok('machine: the name, the pity line "8회 안에 …", the sub', s.name === '비누 캡슐 뽑기' && s.line === '8회 안에 뽑기 전용 아이템 확정' && s.sub === '10회 뽑기는 희귀 이상 1개 확정', [s.name, s.line, s.sub]);
    s = DR.tap('one');
    ok('arm: the first tap arms 1회 (pink, "한 번 더 누르면 뽑아요"), the live region says it, nothing drawn', s.btn[0].k === 'arm' && s.btn[0].t === '한 번 더 누르면 뽑아요' && s.msg === '한 번 더 누르면 뽑아요' && s.dn === 3 && $('pg-gacha-one').classList.contains('is-armed'), s.btn[0]);
    s = DR.tap('ten');
    ok('arm: arming 10회 disarms 1회', s.btn[1].k === 'arm' && s.btn[0].k === 'go', s.btn);
    await sleep(200); s = DR.tap('ten');
    ok('arm: a second tap 200 ms later (a phone\'s double-tap) is ignored - still armed, nothing spent', s.btn[1].k === 'arm' && s.dn === 3 && s.co === 5000, [s.btn[1], s.dn]);
    await sleep(200); s = DR.tap('ten');
    ok('arm: ... at 400 ms it draws (dn + 10)', s.dn === 13 && !!s.anim && s.res.r.length === 10, [s.dn, s.view]);
    SH.tick(230); await sleep(900); DR.tap('ok');
    s = DR.tap('one'); await sleep(2600); s = st();
    ok('arm: 2.6 s later it is disarmed; the next tap arms again (never draws)', s.btn[0].k === 'go' && DR.tap('one').btn[0].k === 'arm' && st().dn === 13, s.btn[0]);
    // keys: a held Enter never presses twice; Z / X / the pads do nothing
    s = await openDraw({ ce: 5000, dn: 3 });
    $('pg-gacha-one').focus();
    const ev = keyOn('Enter', { repeat: true });
    for (const k of ['KeyZ', 'KeyX', 'ArrowUp', 'Space']) window.dispatchEvent(new KeyboardEvent('keydown', { code: k, key: k, bubbles: true, cancelable: true }));
    D.press('jump', true, 0); D.press('shoot', true, 0); D.step(4); D.press('jump', false, 0); D.press('shoot', false, 0);
    ok('keys: a held Enter (repeat) is swallowed; Z / X / the pads do nothing - nothing armed or drawn', ev.defaultPrevented && st().armId === '' && st().dn === 3 && st().shown, [ev.defaultPrevented, st().armId, st().dn]);
    // not enough coins: disabled, the shortfall said on a tap
    s = await openDraw({ ce: 150, dn: 3 });
    ok('poor: 1회 with 150 coins - disabled, "1회 뽑기 · 200코인 · 50개 더 모아요"', s.btn[0].k === 'poor' && s.btn[0].dis && s.btn[0].aria === '1회 뽑기 · 200코인 · 50개 더 모아요' && s.btn[1].k === 'poor', s.btn);
    ok('poor: ... a tap says "50개 더 모아요", nothing armed', DR.tap('one').msg === '50개 더 모아요' && st().armId === '');
    s = await openDraw({ ce: 1999, dn: 3 });
    ok('poor: 10회 with 1,999 -> "1개 더 모아요"; 1회 ready', s.btn[1].k === 'poor' && DR.tap('ten').msg === '1개 더 모아요' && s.btn[0].k === 'go', s.btn);
    s = await openDraw({ ce: 5000, dn: 30, own: ONLY() });
    ok('done: "다 모았어요!" on both buttons, disabled; the line and sub of 3.6', s.btn.every((b) => b.t === '다 모았어요!' && b.dis) && s.line === '뽑기 전용 아이템을 다 모았어요!' && s.sub === '남은 아이템은 상점에서 사요', [s.btn, s.line]);
    // the other tab spent the coins / got the last draw-only item between the two taps
    s = await openDraw({ ce: 5000, dn: 3 });
    DR.tap('one'); await sleep(400);
    const o = raw(); o.sp += 4900; localStorage.setItem(T.state().key, JSON.stringify(o)); storage();
    s = DR.tap('one');
    ok('two tabs: armed here, the other tab spent the coins -> the second tap says "{n}개 더 모아요", nothing animates', s.msg === '100개 더 모아요' && s.dn === 3 && s.view === 'machine' && !s.anim, [s.msg, s.dn]);
    // a read-only store: one button
    localStorage.setItem('ppogeul-trophy-gacharo', JSON.stringify({ v: 6, dev: 'abcdefgh', t: 9, ce: 5000 }));
    T.ns('gacharo'); D.toTitle(); await sleep(20); s = DR.open('title');
    ok('read-only: one button "이 브라우저에서는 저장되지 않아요" (disabled), 10회 hidden', s.ro && s.btn[0].k === 'ro' && s.btn[0].dis && s.btn[0].t === '이 브라우저에서는 저장되지 않아요' && s.btn[1].hidden, s.btn);
    SH.close();
  }

  async function resultTests() {
    // one draw: a first draw (dn 0) is a 확정 - rng 0 takes the first unowned draw-only item, hd (전설)
    let s = await openDraw({ ce: 5000 });
    const said0 = s.said, a0 = s.ani;
    s = await draw2('one', () => 0);
    ok('result (one): the result view - hd on the hub\'s animal (tried on), "새 아이템!", "뽑기 전용 확정! " + its desc, 확인 · 지금 쓰기, the pill',
      s.view === 'res' && s.item === 'hd' && s.name === IT.hd.name && s.line === '새 아이템!' && s.sub === '뽑기 전용 확정! ' + IT.hd.desc && s.btn[0].t === '확인' && s.btn[1].t === '지금 쓰기' &&
      /: 지금 쓰기$/.test(s.btn[1].aria) && !pill().hidden && SH.hub().view.look[0] === 'd', [s.view, s.item, s.line, s.sub, s.btn]);
    ok('result: ds written at the reveal; the live region spoke once ("새 아이템! 진주 이태리타올 · 전설"); the cell selected with its NEW dot', s.ds === s.dl.n && s.said === said0 + 1 &&
      s.sr === '새 아이템! ' + IT.hd.name + ' · 전설' && cellOf('hd').getAttribute('aria-selected') === 'true' && !!cellOf('hd').querySelector('.pg-item-nw') && s.nw.includes('hd'), [s.ds, s.said, s.sr]);
    ok('NEW: the 마이페이지 tab dot while something is NEW', !$('pg-tab-my-new').hidden);
    // DRAW_GUARD: buttons, canvas and grid ignore taps for 0.8 s after the reveal
    const sAria = s.btn[1].aria;
    DR.tap('wear'); DR.tap('view'); cellOf('he').click(); await sleep(500); DR.tap('wear'); DR.tap('ok');
    s = st();
    ok('guard: 0.5 s after the reveal a tap on 지금 쓰기 / 확인 / the canvas / a cell does nothing', s.view === 'res' && s.btn[1].k === 'on' && s.ani === a0 && s.item === 'hd', [s.view, s.btn[1], s.ani]);
    await sleep(400); s = DR.tap('view');
    const nm1 = s.ani;
    ok('result: after 0.9 s the canvas\' right half shows the next animal; the button follows it', nm1 !== a0 && s.btn[1].k === 'on' && /: 지금 쓰기$/.test(s.btn[1].aria) && s.btn[1].aria !== sAria, [nm1, s.btn[1]]);
    s = DR.tap('wear');
    ok('result: 지금 쓰기 wears it on the hub\'s animal only ("{주어} 썼어요"), then 벗기; my pick\'s set unchanged; no longer NEW', s.btn[1].k === 'off' && s.btn[1].t === '벗기' && s.msg === SH.subj(nm1) + ' 썼어요' && SH.state().eq[0] === '0' && !s.nw.includes('hd'), [s.btn[1], s.msg, SH.state().eq]);
    s = DR.tap('viewL');
    ok('result: back on my pick (the left half) the button is 지금 쓰기 again', s.ani === a0 && s.btn[1].k === 'on', [s.ani, s.btn[1]]);
    ok('result: no "한 번 더" in the 뽑기 tab', !/한 번 더/.test($('pg-hub-draw').textContent + $('pg-hub-msg').textContent));
    s = DR.tap('ok');
    ok('확인: back to the machine (the selection cleared), focus on 1회 뽑기', s.view === 'machine' && s.item === '' && s.btn[0].k === 'go' && document.activeElement === $('pg-gacha-one'), [s.view, s.item]);
    // a duplicate: the refund line, the chip counting up, the announcement
    const p0 = DR.consts().pool[0];
    s = await openDraw({ ce: 5000, dn: 5, own: [p0] });
    s = await draw2('one', () => 0);
    const ref = DR.consts().DRAW.refund[IT[p0].rar];
    ok('result (duplicate): "이미 있어요 · 코인 +' + ref + '" in coin pink; the sub its desc; the announcement', s.item === p0 && s.line === '이미 있어요 · 코인 +' + ref && $('pg-gacha-line').classList.contains('is-dup') &&
      s.sub === IT[p0].desc && s.sr === '이미 있어요 · ' + IT[p0].name + ' · 코인 ' + ref + '개 돌려받았어요', [s.line, s.sr]);
    await sleep(500); SH.tick(2);
    ok('result (duplicate): the coin chip counts the refund up to the balance', st().chip === (5000 - 200 + ref).toLocaleString('ko-KR'), st().chip);
    // b9's verb (입기)
    s = await openDraw({ ce: 5000, dn: 5, pt: 9, own: ONLY().filter((id) => id !== 'b9') });
    s = await draw2('one', () => 0);
    ok('result: b9 (선녀 날개옷) - its verb "지금 입기"', s.item === 'b9' && s.btn[1].t === '지금 입기', s.btn[1]);
    // ten draws: the results grid, the batch line, the best result selected
    s = await openDraw({ ce: 5000, dn: 5, own: ['h1', 'h2', 'h3', 'f1', 'f2', 'n2'] });
    s = await draw2('ten', seeded(11));
    const R = s.res.r, nn = R.filter((e) => !e[1]).length, cc = R.reduce((t, e) => t + e[1], 0);
    let best = 0; R.forEach((e, i) => { const x = IT[e[0]].rar, y = IT[R[best][0]].rar; if (x > y || (x === y && !e[1] && R[best][1])) best = i; });
    ok('result (ten): 10 result cells, the caption "뽑기 결과", the batch line', resCells().length === 10 && s.cap === '뽑기 결과' &&
      s.sub.indexOf(nn ? '새 아이템 ' + nn + '개' + (cc ? ' · 코인 +' + cc.toLocaleString('ko-KR') : '') : '모두 이미 있어요 · 코인 +' + cc.toLocaleString('ko-KR')) === 0, [s.cap, s.sub, nn, cc]);
    ok('result (ten): the best result (highest rarity, a new one first, then the first drawn) selected and shown', s.rsel === best && s.item === R[best][0] && resCells()[best].getAttribute('aria-selected') === 'true', [s.rsel, best]);
    ok('result (ten): each cell - the refund "+n" on a duplicate, a NEW dot on a new one, its aria-label', R.every((e, i) => { const b = resCells()[i]; return (e[1] ? b.textContent === '+' + e[1] && !b.querySelector('.pg-item-nw') && b.getAttribute('aria-label') === IT[e[0]].name + ' · ' + ['보통', '고급', '희귀', '전설'][IT[e[0]].rar] + ' · 이미 있어요 · 코인 +' + e[1] : !!b.querySelector('.pg-item-nw') && /새 아이템$/.test(b.getAttribute('aria-label'))); }), R);
    ok('result (ten): the announcement "10회 뽑기 결과: 새 아이템 n개, 코인 m개 돌려받았어요"', s.sr === '10회 뽑기 결과: 새 아이템 ' + nn + '개' + (cc ? ', 코인 ' + cc.toLocaleString('ko-KR') + '개 돌려받았어요' : ''), s.sr);
    await sleep(900); const j = (best + 1) % 10; resCells()[j].click(); s = st();
    ok('result (ten): a tap on another result shows that one (no longer NEW)', s.rsel === j && s.item === R[j][0] && (R[j][1] || !s.nw.includes(R[j][0])), [s.rsel, j]);
    SH.close();
  }

  async function machineTests() {
    let s = await openDraw({ ce: 5000, dn: 3 });
    const v = $('pg-gacha-view'), a0 = s.ani;
    ok('machine: the canvas is decoration - aria-hidden, out of the tab order, no pill', v.getAttribute('aria-hidden') === 'true' && v.tabIndex === -1 && pill().hidden);
    s = DR.tap('view');
    ok('machine: ... a tap on it does nothing', s.ani === a0 && s.item === '', s.ani);
    ok('collection: the 10 draw-only items, "0/10", each cell its odds and aria-label ("… · 전설 · 뽑기 확률 1%")', resCells().length === 10 && s.cap === '뽑기 전용 아이템 0/10' &&
      cellOf('b9').textContent === '1%' && cellOf('b9').getAttribute('aria-label') === IT.b9.name + ' · 전설 · 뽑기 확률 1%' && cellOf('f9').textContent === '5%', [s.cap, cellOf('b9').getAttribute('aria-label')]);
    cellOf('he').click(); s = st();
    const nm = v.getAttribute('aria-label') || '';
    ok('machine: a selected cell - tried on the hub\'s animal, the pill, the canvas a button "{이름} · 눌러서 다른 동물로", "뽑기 확률 2%"', s.item === 'he' && !pill().hidden && !v.hasAttribute('aria-hidden') && v.tabIndex === 0 &&
      / · 눌러서 다른 동물로$/.test(nm) && s.line === '뽑기 확률 2%' && s.name === IT.he.name && SH.hub().view.look[0] === 'e', [s.item, nm, s.line]);
    s = DR.tap('view');
    ok('machine: with an animal shown the canvas cycles it', s.ani !== a0 && s.item === 'he', s.ani);
    cellOf('he').click(); s = st();
    ok('machine: tapping the selected cell again deselects (the machine)', s.item === '' && v.getAttribute('aria-hidden') === 'true' && pill().hidden, s.item);
    // 지난 뽑기 결과예요: a batch committed with no UI (a reload / a close mid-show) opens its result view, no announcement
    fresh({ ce: 5000, sh: 1, gs: 1, dn: 3 }); D.toTitle(); await sleep(20);
    const r = DR.commit(1), said = st().said;
    s = DR.open('title');
    ok('past: a batch never shown opens on its result view with "지난 뽑기 결과예요", marked shown, not announced', r.ok && s.view === 'res' && s.sub.indexOf('지난 뽑기 결과예요') === 0 && s.ds === s.dl.n && s.said === said && !s.anim, [s.view, s.sub, s.ds]);
    SH.close(); fresh({ ce: 5000, sh: 1, gs: 1, dn: 3 }); DR.rng(() => 0); DR.commit(1); DR.rng(null);
    const gone = st().dl.r[0][0]; SH.set({ own: st().own.filter((id) => id !== gone) });
    s = DR.open('title');
    ok('past: a batch whose item is gone (the store was replaced) is only marked shown', s.view === 'machine' && s.ds === s.dl.n, [s.view, s.ds, gone]);
    SH.close();
  }

  async function shopCellTests() {
    fresh({ ce: 5000, sh: 1, gs: 1 }); D.toTitle(); await sleep(20);
    SH.open('shop', 'title'); await sleep(20);
    const sb = (s) => { document.querySelector('#pg-shop-slots [data-slot="' + s + '"]').click(); };
    sb('h'); const c = document.querySelector('#pg-shop-grid [data-id="hd"]');
    ok('상점: a draw-only cell - the capsule + "뽑기" (never dimmed), its aria-label "… · 뽑기에서만 나와요"', !!c && c.textContent === '뽑기' && !c.classList.contains('is-poor') && c.getAttribute('aria-label') === IT.hd.name + ' · 전설 · 뽑기에서만 나와요', c && [c.textContent, c.className, c.getAttribute('aria-label')]);
    ok('상점: the opening never selects a draw-only item (shopCheapest)', !IT[SH.hub().sel].dr, SH.hub().sel);
    c.click(); let h = SH.hub();
    ok('상점: selecting it - tried on, the button "뽑기로 가기" (mint, never disabled), its aria-label', h.kind === 'draw' && h.btn.trim() === '뽑기로 가기' && h.view.look[0] === 'd' && $('pg-shop-buy').getAttribute('aria-disabled') === 'false' &&
      $('pg-shop-buy').getAttribute('aria-label') === '뽑기에서만 나와요 · 뽑기로 가기', [h.kind, h.btn]);
    $('pg-shop-buy').click(); const s = st();
    ok('상점: 뽑기로 가기 jumps to the 뽑기 tab with that item selected (tried on) and focused', s.tab === 'draw' && s.sel === 'hd' && s.item === 'hd' && document.activeElement === cellOf('hd'), [s.tab, s.sel, document.activeElement && document.activeElement.dataset.id]);
    SH.close();
    // every sold item owned: nothing to buy - the 상점 dot ignores the draw-only items
    const sold = SH.items().filter((it) => it.price > 0).map((it) => it.id);
    fresh({ ce: 5000, sh: 1, gs: 1, cv: 0, own: sold }); D.toTitle(); await sleep(20);
    ok('상점: every sold item owned, 5,000 coins - no dot (draw-only items are not "something to buy")', !SH.state().newDot, SH.state().newDot);
  }

  async function dotOddsTests() {
    // NEW: cleared by a tap in 마이페이지 / by wearing (the equipment box's dot while its slot has one)
    let s = await openDraw({ ce: 5000 });
    s = await draw2('one', () => 0);
    $('pg-tab-my').click(); await sleep(20);
    const box = document.querySelector('#pg-my-slots [data-slot="h"] .pg-tro-new');
    ok('NEW: in 마이페이지 the 머리 box has the dot while hd is NEW', !!box && !box.hidden && !$('pg-tab-my-new').hidden);
    document.querySelector('#pg-my-slots [data-slot="h"]').click(); await sleep(20);
    document.querySelector('#pg-my-grid [data-id="hd"]').click(); await sleep(20);
    ok('NEW: tapping it in 마이페이지 (it is worn) clears it - the dots go', !st().nw.includes('hd') && box.hidden && $('pg-tab-my-new').hidden, st().nw);
    SH.close();
    // the odds panel: its numbers from the DOM equal drawOdds (all three columns), the 확정 column follows the store
    s = await openDraw({ ce: 5000, dn: 3 });
    s = DR.tap('odds');
    ok('odds: 확률 보기 opens the panel ("확률 닫기", aria-expanded)', s.odds && !$('pg-gacha-odds').hidden && $('pg-gacha-odds-btn').textContent === '확률 닫기' && $('pg-gacha-odds-btn').getAttribute('aria-expanded') === 'true');
    const check = () => {
      const O = DR.odds(), bad = []; let n = 0;
      for (const r of O.rows) {
        const tr = document.querySelector('#pg-gacha-odds tr[data-rar="' + r.rar + '"]');
        if (!tr || tr.querySelector('td').textContent !== P(r.total, O.sum)) bad.push('tier ' + r.rar);
        for (const [id, w, wr, wp] of r.items) {
          n++;
          const td = [...document.querySelectorAll('#pg-gacha-odds tr[data-id="' + id + '"] td')].map((t) => t.textContent);
          if (!same(td, [P(w, O.sum), wr ? P(wr, O.sumRare) : '–', wp ? P(wp, O.sumPity) : '–'])) bad.push(id + ' ' + td.join('/'));
        }
      }
      return { bad, n, rows: document.querySelectorAll('#pg-gacha-odds tr[data-id]').length };
    };
    let c = check();
    ok('odds: every number in the panel equals drawOdds - tiers, 43 items x 3 columns', !c.bad.length && c.n === 43 && c.rows === 43, c);
    const rules = $('pg-gacha-odds').textContent;
    ok('odds: the rules - 5 : 2 : 1, 희귀 81% · 전설 19%, the refunds, computed', /5 : 2 : 1/.test(rules) && rules.indexOf('(희귀 81% · 전설 19%)') > 0 && rules.indexOf('보통 30 · 고급 60 · 희귀 100 · 전설 150') > 0 && rules.indexOf('비누 코인은 게임을 해야만 모여요') > 0, rules.slice(0, 80));
    SH.set({ own: ['hd', 'f9'] }); await sleep(20); c = check();
    ok('odds: the 확정 column follows the store (hd, f9 owned -> "–", the others re-shared)', !c.bad.length && document.querySelector('#pg-gacha-odds tr[data-id="hd"] td:last-child').textContent === '–', c.bad);
    // fonts: every syllable the 뽑기 tab shows (the panel open, its details too) is warmed
    $('pg-gacha-odds').querySelector('details').open = true;
    const fw = $('pg-fontwarm').textContent, txt = $('pg-hub-draw').textContent + $('pg-gacha-odds-btn').textContent + document.querySelector('#pg-hub .pg-tabs').textContent;
    const miss = [...new Set(txt.match(/[가-힣]/g) || [])].filter((ch) => fw.indexOf(ch) < 0);
    ok('fonts: every syllable of the 뽑기 tab is in #pg-fontwarm', !miss.length, miss.join(''));
    s = DR.tap('odds');
    ok('odds: 확률 닫기 closes it', !s.odds && $('pg-gacha-odds').hidden && $('pg-gacha-odds-btn').textContent === '확률 보기');
    SH.close();
  }

  async function lostUiTests() {
    // the other tab's draw shows here at its storage event: the chip, the pity line, the collection - no show
    let s = await openDraw({ ce: 9000, dn: 5, pt: 2 });
    const o = raw(); o.dn = 6; o.sp += 200; o.own = o.own.concat(['he']); o.gd = o.gd.concat(['he']); o.pt = 0; o.ds = 6; o.dl = { id: 'oth009', n: 6, r: [['he', 0, 1]] };
    localStorage.setItem(T.state().key, JSON.stringify(o)); storage(); s = st();
    ok('two tabs: the other tab\'s draw here - the chip, the pity line, the collection (1/10, he checked), no show', s.chip === '8,800' && s.line === '10회 안에 뽑기 전용 아이템 확정' && s.cap === '뽑기 전용 아이템 1/10' &&
      !!cellOf('he').querySelector('.pg-item-ck') && s.view === 'machine' && !s.anim, [s.chip, s.line, s.cap]);
    // a lost batch: its result view closes, the line says so (and the live region)
    const pre = raw();
    s = await draw2('one', () => 0);
    const lost = Object.assign({}, pre, { dn: pre.dn + 1, sp: pre.sp + 200, dl: { id: 'oth010', n: pre.dn + 1, r: [['h1', 30, 0]] }, ce: pre.ce + 30 });
    localStorage.setItem(T.state().key, JSON.stringify(lost)); storage(); s = st();
    ok('lost: the result view closes, "뽑기가 저장되지 않았어요 · 코인은 그대로예요" in the line and the live region', s.lost && s.view === 'machine' && s.line === '뽑기가 저장되지 않았어요 · 코인은 그대로예요' && s.sr === s.line, [s.view, s.line]);
    await sleep(4200);
    ok('lost: ... for 4 s, then the pity line again', st().line !== '뽑기가 저장되지 않았어요 · 코인은 그대로예요', st().line);
    // blocked storage: arming says so in the line
    SH.close();
    ok('footer: no message on 뽑기 over 12 syllables', MSGS.every((m) => hangul(m) <= 12), MSGS.filter((m) => hangul(m) > 12));
  }

  // (G4) 9's show: every phase by tick, the capsule's rows, skip (건너뛰기 / Escape / the results grid, never before 24 f;
  // the canvas never), the tab switch, the ten cells' order, reduced motion
  const startShow = async (o, w, rng) => { const s = await openDraw(o); DR.sfxClear(); await draw2(w, rng, true); return s; };
  const toT = (t) => { for (let i = 0; i < 300 && st().anim && st().anim.t < t; i++) SH.tick(1); return st(); };
  const vpx = () => $('pg-gacha-view').querySelector('canvas').getContext('2d').getImageData(0, 0, 32, 32).data;
  const isBack = (d, x, y) => { const o = (y * 32 + x) * 4, c = d[o] + ',' + d[o + 1] + ',' + d[o + 2]; return c === '18,50,54' || c === '13,42,45'; };
  async function animTests() {
    if (!DR.art()) { ok('show: the machine / capsule art is there (GA2)', false); return; }
    const s0 = await startShow({ ce: 5000, dn: 3, pt: 9 }, 'one', () => 0);   // (a 확정: hd, 전설 - its rays)
    let s = st();
    ok('show: a draw starts it - "두근두근…", the buttons hidden, 건너뛰기 shown and focused, the canvas still decoration, the chip at the balance after the price',
      !!s.anim && s.anim.n === 1 && s.line === '두근두근…' && s.btn[0].hidden && s.btn[1].hidden && s.skip && document.activeElement === $('pg-gacha-skip') &&
      $('pg-gacha-view').getAttribute('aria-hidden') === 'true' && s.chip === '4,800' && s.view === 'machine' && s.sr === s0.sr, [s.line, s.chip, s.skip]);
    ok('show: no spoilers - the collection keeps its old checks (0/10, hd unchecked, no NEW dot)', s.cap === '뽑기 전용 아이템 0/10' && !cellOf('hd').querySelector('.pg-item-ck') && !cellOf('hd').querySelector('.pg-item-nw') && $('pg-tab-my-new').hidden, s.cap);
    const ph = {}; let land = null, wob = null, rays = 0, halves = false, feet = true;
    for (let t = 1; t < 96; t++) {
      s = toT(t); if (!s.anim) break;
      ph[s.anim.phase] = 1; const V = s.anim.view || {};
      if (t === 51) land = V.cap; if (t === 70) wob = V.cap; if (V.rays) rays = Math.max(rays, V.rays); if (V.halves) halves = true;
      if (t % 10 === 0) { const d = vpx(); feet = feet && !isBack(d, 6, 30) && !isBack(d, 20, 30); }
    }
    ok('show (one): every phase reached by tick - crank, drop, hop, wobble, pop', ['crank', 'drop', 'hop', 'wobble', 'pop'].every((k) => ph[k]), Object.keys(ph));
    ok('show (one): the capsule lands on rows 25-30 (top row 25), wobbles at the centre (13 +- 1, 16); the machine feet on row 30', !!land && land.x === 5 && land.y === 25 && !!wob && Math.abs(wob.x - 13) === 1 && wob.y === 16 && feet, [land, wob, feet]);
    ok('show (one): a 전설 pops - both halves fly, rays drawn, never past the canvas (clipped)', halves && rays > 0, [halves, rays]);
    s = toT(97);
    ok('show (one): the reveal at t = 96 - the result view, ds written, the announcement, the 전설 fanfare (crank, drop, pop before it)', !s.anim && s.view === 'res' && s.item === 'hd' && s.ds === s.dl.n && s.sr === '새 아이템! ' + IT.hd.name + ' · 전설' &&
      same(s.sfx, ['gacha_roll:0', 'gacha_drop:0', 'gacha_pop:0', 'gacha_win:3']), s.sfx);
    // skip: 건너뛰기 / Escape ignored before t = 24, acting after; the canvas never skips
    for (const how of ['skip', 'esc']) {
      await startShow({ ce: 5000, dn: 3 }, 'one', () => 0.5); toT(10);
      const go = () => { if (how === 'skip') DR.tap('skip'); else window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true })); };
      go(); const early = st(); toT(30); DR.tap('view'); const cv = st(); go(); s = st();
      ok('skip (' + how + '): ignored at t = 10, the canvas never skips, at t = 30 it reveals (the hub stays open)', !!early.anim && early.shown && !!cv.anim && !s.anim && s.view === 'res' && s.shown, [!!early.anim, !!cv.anim, s.view]);
    }
    // ten: the capsules roll out, the results grid opens in ascending rarity, the best last; a tap on it skips
    await startShow({ ce: 5000, dn: 3, own: ['h1', 'h2', 'f1'] }, 'ten', seeded(21));
    s = toT(60); const rolled = s.anim.view && s.anim.view.rolled;
    const opened = []; let prev = s.anim.open.slice();
    for (let t = 100; t < 210; t++) { s = toT(t); if (!s.anim) break; s.anim.open.forEach((o, i) => { if (o && !prev[i]) opened.push(i); }); prev = s.anim.open.slice(); }
    s = toT(211); const R = s.res.r, rr = opened.map((i) => IT[R[i][0]].rar);
    let best = 0; R.forEach((e, i) => { const x = IT[e[0]].rar, y = IT[R[best][0]].rar; if (x > y || (x === y && !e[1] && R[best][1])) best = i; });
    ok('show (ten): capsules roll out of the chute; the ten cells open one by one in ascending rarity, the best last; the reveal at 210 selects it',
      rolled > 0 && opened.length === 10 && rr.slice(0, 9).every((x, i) => !i || x >= rr[i - 1]) && opened[9] === best && s.rsel === best && !s.anim, [rolled, opened, rr, best]);
    ok('show (ten): the sounds - two turns, nine drops without a bounce and the last with it, ten climbing pops', s.sfx[0] === 'gacha_roll:1' && s.sfx.filter((q) => q === 'gacha_drop:1').length === 9 &&
      s.sfx.filter((q) => q === 'gacha_drop:0').length === 1 && same(s.sfx.filter((q) => /^gacha_pop/.test(q)), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => 'gacha_pop:' + k)), s.sfx);
    await startShow({ ce: 5000, dn: 3 }, 'ten', seeded(22)); toT(20); cellOf('hd').click(); const e1 = st(); toT(120); resCells()[3].click(); s = st();
    ok('skip (ten): the collection is inert mid-show; a tap on the results grid reveals everything at once', !!e1.anim && !s.anim && s.view === 'res' && resCells().every((b) => !b.classList.contains('is-cap')), [!!e1.anim, s.view]);
    // DRAW_GUARD on the results grid: 0.5 s after the reveal a tap does nothing, at 0.9 s it acts
    const r0 = s.rsel, j = (r0 + 1) % 10; await sleep(500); resCells()[j].click(); const g1 = st().rsel; await sleep(400); resCells()[j].click();
    ok('guard: the results grid ignores a tap 0.5 s after the reveal, takes one at 0.9 s', g1 === r0 && st().rsel === j, [r0, g1, st().rsel]);
    // a tab switch mid-show: revealed silently (ds written, the live region speaks), the result view back on return
    await startShow({ ce: 5000, dn: 3 }, 'one', () => 0.3); toT(40); const said = st().said;
    $('pg-tab-shop').click(); s = st();
    ok('tab switch mid-show: revealed silently - no reveal sound, ds written, announced once', s.tab === 'shop' && !s.anim && s.ds === s.dl.n && s.said === said + 1 && !s.sfx.some((q) => /^(gacha_win|buy)/.test(q)), s.sfx);
    $('pg-tab-draw').click(); s = st();
    ok('tab switch: back on 뽑기 the result view is there until 확인', s.tab === 'draw' && s.view === 'res' && s.btn[0].t === '확인', [s.view]);
    // closing mid-show: the result shows next time (지난 뽑기 결과예요)
    await startShow({ ce: 5000, dn: 3 }, 'one', () => 0.3); toT(30); SH.close(); s = DR.open('title');
    ok('close mid-show: the next opening shows it as "지난 뽑기 결과예요"', s.view === 'res' && s.sub.indexOf('지난 뽑기 결과예요') === 0 && !s.anim, [s.view, s.sub]);
    // reduced motion: still - the crank at frame 1, the capsule by the chute, no motion between frames; 24 f; only the knock
    CALM = true;
    try {
      await startShow({ ce: 5000, dn: 3, pt: 9 }, 'one', () => 0); s = toT(2); const v2 = s.anim.view, d2 = vpx().join(); s = toT(12); const d12 = vpx().join(), v12 = s.anim.view;
      ok('reduced motion: still - the crank at frame 1, the capsule at (5, 25), no jiggle / halves / rays, the canvas unchanged t 2 -> 12', s.anim.phase === 'still' && v2.crank === 1 && v2.cap.x === 5 && v2.cap.y === 25 && !v12.jig && !v12.halves && !v12.rays && d2 === d12, [v2, v12]);
      s = toT(25);
      ok('reduced motion: the reveal at t = 24 with only the knock and the reveal sound', !s.anim && s.view === 'res' && same(s.sfx, ['gacha_roll:2', 'gacha_win:3']), s.sfx);
      await startShow({ ce: 5000, dn: 3 }, 'ten', seeded(23)); s = toT(20); const g20 = s.anim.grid; s = toT(25);
      ok('reduced motion (ten): 24 f still (no results grid), then every cell open at once; no cell flashes', !g20 && !s.anim && resCells().length === 10 && resCells().every((b) => !b.classList.contains('is-cap') && !b.classList.contains('is-flash')) &&
        s.sfx.filter((q) => /^gacha_(drop|pop)/.test(q)).length === 0, s.sfx);
    } finally { CALM = false; }
    SH.close();
  }

  // 10. the fit (6.11): the resting tab and a ten-result view
  async function drawStage(stn) {
    if (stn === 'rest') return openDraw({ ce: 8888, dn: 3, pt: 2 });
    if (stn === 'shop') { fresh({ ce: 8888, sh: 1, gs: 1 }); D.toTitle(); await sleep(20); SH.open('shop', 'title'); document.querySelector('#pg-shop-slots [data-slot="h"]').click(); await sleep(40); return st(); }
    await openDraw({ ce: 10888, own: ['h1', 'h2', 'f1', 'n2'] });
    return draw2('ten', first0(5));            // (hd first: 진주 이태리타올 - the longest name - is the best, selected)
  }
  async function fitAt(label, o) {
    for (const stn of ['rest', 'res10', 'shop']) {
      await drawStage(stn); await sleep(60);
      const pn = $('pg-hub'), cd = pn.querySelector('.pg-hub-card'), r = cd.getBoundingClientRect();
      const out = [...cd.querySelectorAll('*')].filter((e) => { if (!e.getClientRects().length || e.closest('[hidden]')) return false; const b = e.getBoundingClientRect(); return b.width && (b.left < r.left - 0.5 || b.right > r.right + 0.5); }).map((e) => e.id || e.className || e.tagName);
      ok(label + ' ' + stn + ': nothing goes sideways', pn.scrollWidth <= pn.clientWidth + 1 && !out.length, [pn.scrollWidth, pn.clientWidth, out.slice(0, 4)]);
      if (o.noScroll) ok(label + ' ' + stn + ': no vertical scroll', pn.scrollHeight <= pn.clientHeight + 1, [pn.scrollHeight, pn.clientHeight]);
      else info(label + ' ' + stn + ': panel ' + pn.scrollHeight + '/' + pn.clientHeight);
      if (stn === 'shop') { SH.close(); continue; }
      const cs = resCells(), row1 = cs.filter((b) => b.offsetTop === cs[0].offsetTop).length, inner = $('pg-gacha-grid').getBoundingClientRect().width;
      const ci = cd.clientWidth - parseFloat(getComputedStyle(cd).paddingLeft) - parseFloat(getComputedStyle(cd).paddingRight);
      ok(label + ' ' + stn + ': the 10-grid ' + (ci >= 494 ? 'one row of ten' : '5 x 2') + ' (card inside ' + Math.round(ci) + ' px)', cs.length === 10 && row1 === (ci >= 494 ? 10 : 5), [row1, Math.round(ci), Math.round(inner)]);
      if (o.land) { const b = $('pg-gacha-one').getBoundingClientRect(); ok(label + ' ' + stn + ': the draw buttons visible without scrolling', b.bottom <= innerHeight + 0.5 && b.top >= 0, [Math.round(b.top), Math.round(b.bottom), innerHeight]); }
      if (stn === 'res10') { const nb = $('pg-gacha-name').getBoundingClientRect(); info(label + ' res10: the name "' + $('pg-gacha-name').textContent + '" ' + Math.round(nb.height) + ' px tall'); }
      SH.close();
    }
    if (o.tabRow) for (const ce of [9999, 8888]) {
      await openDraw({ ce, dn: 3 }); await sleep(40);
      const tb = document.querySelector('#pg-hub .pg-tabs'), ch = $('pg-hub-coins');
      ok(label + ': three tabs and the chip "' + $('pg-hub-co').textContent + '" on one line', ch.offsetTop < tb.offsetTop + tb.offsetHeight - 2, [ch.offsetTop, tb.offsetTop, tb.offsetHeight, SH.hub().snug]);
      SH.close();
    }
  }
  function setScale(s) { const e = $('pg-stage'); e.style.flex = 'none'; e.style.width = Math.round(256 * s + 22) + 'px'; e.style.height = Math.round(224 * s + 22) + 'px'; window.dispatchEvent(new Event('resize')); }
  async function fitTests() {
    if (/hubfit/.test(location.hash)) {
      if (/touch/.test(location.hash)) window.dispatchEvent(new Event('touchstart'));
      const land = innerWidth > innerHeight;
      await fitAt('this viewport (' + innerWidth + 'x' + innerHeight + ')', { noScroll: !land, tabRow: !land, land });
      return;
    }
    setScale(1); await fitAt('1x (256x224)', {});
    setScale(2); await fitAt('2x (512x448)', { noScroll: true, tabRow: true });
    const e = $('pg-stage'); e.style.flex = ''; e.style.width = ''; e.style.height = ''; window.dispatchEvent(new Event('resize')); await sleep(40);
    await fitAt('desktop ' + innerWidth + 'x' + innerHeight, { noScroll: true, tabRow: true });
  }

  // 11. e7 / e8 in play (4.3)
  function stage(c, lk, foes) {
    D.start(0, c); D.setInvincible(true); D.step(2);
    if (!foes) G.enemies = [];          // (foes: kept - with none left the round is cleared and the next one respawns everyone)
    G.enemies.forEach((e) => { e.x = 230; e.y = 20; });
    G.bubbles = []; G.parts = []; G.kfx = []; G.pops = []; G.words = []; G.shake = 0;
    const p = G.players[0]; SH.dress(0, lk);
    Object.assign(p, { x: 120, y: 96, vx: 0, vy: 0, onGround: true, facing: 1, invuln: 0, sq: 0, shootAnim: 0, water: false, stunT: 0, shield: 0 });
    return p;
  }
  const contrast = (a, b) => { const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }; const A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  async function fxTests() {
    D.toTitle(); await sleep(20);
    fresh({ ce: 0 });
    // e7: two ducklings on the feet row behind the heel, clear of the ground marker, following, hidden in a jump
    let p = stage('duck', lkOf('e7'), true); Object.assign(p, { x: 40, y: 200 }); D.step(30);   // (the floor by the spawn: flat, no pit)
    let k = DR.ducks(p), mL = Math.round(p.x + 8) - 7;
    ok('e7: two ducklings on the wearer\'s feet row (y + 15) behind the heel, 7 px apart, >= 1 px clear of the marker\'s columns', !!k && k.a.length === 2 && !k.hid && k.y === Math.round(p.y) + 15 &&
      Math.round(k.a[0].x) + 4 <= mL - 2 && Math.abs(k.a[0].x - k.a[1].x - 7) < 0.6, [k, p.x, mL]);
    ok('e7: no particles', !G.parts.some((q) => q.lf === '7'));
    D.press('right', true, 0); D.step(24); D.press('right', false, 0); D.step(60);
    k = DR.ducks(p);
    ok('e7: after a walk they follow at their spacing (the first 7 px behind the heel, the second 7 px behind it)', Math.abs(k.a[0].x - (p.x - 5)) < 1 && Math.abs(k.a[0].x - k.a[1].x - 7) < 1 && !k.hid, [k.a, p.x]);
    D.press('left', true, 0); D.step(12); D.press('left', false, 0); D.step(80); info('e7: after the walks x ' + Math.round(p.x) + ', y ' + p.y);
    k = DR.ducks(p);
    ok('e7: facing left they settle on the right (x + 16, + 23)', p.facing < 0 && Math.abs(k.a[0].x - (p.x + 16)) < 1 && Math.abs(k.a[1].x - k.a[0].x - 7) < 1, [k.a, p.x]);
    let hid = false, y0 = k.y;
    D.press('jump', true, 0); for (let i = 0; i < 40; i++) { D.step(1); const q = DR.ducks(p); if (q && q.hid && y0 - (p.y + 15) > 8) hid = true; if (i === 3) D.press('jump', false, 0); }
    for (let i = 0; i < 120 && !p.onGround; i++) D.step(1); D.step(2); k = DR.ducks(p);
    ok('e7: hidden during a jump > 8 px, back behind the heel after the landing', hid && !k.hid && Math.abs(k.a[0].x - (p.facing < 0 ? p.x + 16 : p.x - 5)) < 1.3 && k.y === Math.round(p.y) + 15, [hid, k]);
    p.x += 60; D.step(1); k = DR.ducks(p);
    ok('e7: a teleport / respawn puts them back behind the heel at once', Math.abs(k.a[0].x - (p.facing < 0 ? p.x + 16 : p.x - 5)) < 0.01, [k.a, p.x]);
    CALM = true; D.step(2); const calm = DR.ducks(p); CALM = false;
    ok('e7: none under reduced motion', calm === null, calm);
    // e8: <= 4 wisps, 2 px for 12 f then 1 px, the sway, never above the head, never white
    p = stage('cat', lkOf('e8')); D.step(60);
    const ws = () => G.parts.filter((q) => q.lf === '8');
    let mx = 0, top = 1e9, cols = new Set(), okF = true;
    for (let i = 0; i < 72; i++) { D.step(1); const w = ws(); mx = Math.max(mx, w.length); for (const q of w) { top = Math.min(top, q.y); cols.add(q.c); if (q.big !== 12 || q.sw !== 6 || q.sz !== 1 || q.max !== 24) okF = false; } }
    ok('e8: at most 4 wisps alive, each 2 px for 12 f then 1 px with a 1 px sway every 6 f', mx <= 4 && mx >= 3 && okF, [mx, okF]);
    ok('e8: never above headTop, pink / cream, never #ffffff', top >= SH.headTop(0) - 0.01 && same([...cols].sort(), ['#f3e2b4', '#ff8fb1']), [top, SH.headTop(0), [...cols]]);
    CALM = true; G.parts = []; D.step(30); const c8 = ws().length; CALM = false;
    ok('e8: none under reduced motion', c8 === 0, c8);
    // visibility on the arenas: each wisp colour against what is behind it
    const grab = () => $('pg-canvas').getContext('2d').getImageData(0, 0, 256, 224).data;
    for (let a = 0; a < 4; a++) {
      L.battle([{ char: 'cat', look: lkOf('e8') }, { char: 'duck' }], { arena: a, countdown: false, monsters: false, intrusion: false });
      D.setInvincible(true); D.step(70);
      // (the background with the wearer away: the wisps against the arena itself)
      const w = ws(), keep = G.parts, me = G.players[0]; G.parts = []; me.out = true; D.step(0); const bg = grab(); G.parts = keep; me.out = false;
      let lo = 99;
      for (const q of w) { const x = Math.round(q.x), y = Math.round(q.y); if (x < 0 || y < 0 || x > 255 || y > 223) continue; const o = (y * 256 + x) * 4; lo = Math.min(lo, contrast(hexRgb(q.c), [bg[o], bg[o + 1], bg[o + 2]])); }
      ok('e8: visible on arena ' + a + ' (the lowest wisp / background contrast ' + lo.toFixed(2) + ')', w.length && lo >= 2, [w.length, lo]);
    }
    // the budget (shop.md 16.1 item 8) with four wearers of e7 / e8 walking over a full screen
    L.battle([{ char: 'duck', look: lkOf('e7') }, { char: 'cat', look: lkOf('e8') }, { char: 'frog', look: lkOf('e8') }, { char: 'otter', look: lkOf('e7') }], { arena: 0, countdown: false, monsters: false, intrusion: false });
    D.setInvincible(true); D.step(60);
    for (let i = 0; i < 186; i++) G.parts.push({ x: 2, y: 30, vx: 0, vy: 0, g: 0, life: 900, max: 900, c: '#000000', sz: 1 });
    let made = 0, over = 0;
    const push0 = Array.prototype.push;
    // eslint-disable-next-line no-extend-native
    Array.prototype.push = function (...a) { if (this === G.parts) for (const q of a) if (q && q.lf) { made++; if (this.length >= 200) over++; } return push0.apply(this, a); };
    try { for (let i = 0; i < 600; i++) { if (i % 120 === 0) for (let s = 0; s < 4; s++) { D.press((i / 120) & 1 ? 'left' : 'right', true, s); D.press((i / 120) & 1 ? 'right' : 'left', false, s); } D.step(1); } } finally { Array.prototype.push = push0; }
    for (let s = 0; s < 4; s++) { D.press('left', false, s); D.press('right', false, s); }
    ok('budget: 4 players with e7 / e8 walking 600 f over a full screen - no effect particle goes in at 200 or more', over === 0 && made > 0, [over, made]);
    D.setInvincible(false); D.toTitle();
  }

  // ---------------------------------------------------------------- screenshot scenes ("GACHA SHOT READY")
  async function shot(name) {
    const Q = new URLSearchParams(location.hash.slice(1)), stn = Q.get('st') || 'first';
    if (Q.get('s')) setScale(+Q.get('s'));
    if (name === 'play') {
      fresh({ ce: 0 }); D.seed(5);
      L.battle([{ char: 'duck', look: lkOf('h5', 'e7'), nick: '뽀숑', local: true }, { char: 'cat', look: lkOf('hd', 'b9', 'e8'), nick: '까삐', local: true }, { char: 'frog', look: lkOf('e8'), nick: '개굴', local: true }, { char: 'capy', look: lkOf('f8', 'e7'), nick: '말랑', local: true }],
        { arena: +(Q.get('arena') || 0), countdown: false, monsters: false, intrusion: false });
      D.setInvincible(true); D.press('right', true, 0); D.press('left', true, 3); D.step(70); D.press('right', false, 0); D.press('left', false, 3); D.step(14);
      for (const p of G.players) p.invuln = 0;
      D.step(1);
    } else {
      if (stn === 'shopcell') { fresh({ ce: 1234, sh: 1, gs: 1 }); D.toTitle(); await sleep(40); SH.open('shop', 'title'); document.querySelector('#pg-shop-slots [data-slot="h"]').click(); document.querySelector('#pg-shop-grid [data-id="hd"]').click(); }
      else if (stn === 'first') await openDraw({ ce: 1234, gs: 0 });
      else if (stn === 'armed') { await openDraw({ ce: 1234, dn: 3, pt: 6 }); DR.tap('one'); }
      else if (stn === 'poor') await openDraw({ ce: 150, dn: 3, pt: 4 });
      else if (stn === 'odds') { await openDraw({ ce: 1234, dn: 3, own: ['f9'] }); DR.tap('odds'); }
      else if (stn === 'done') await openDraw({ ce: 4321, dn: 70, own: ONLY() });
      else if (stn === 'e7') { await openDraw({ ce: 1234, dn: 3 }); cellOf('e7').click(); }
      else if (stn === 'res1-new') { await openDraw({ ce: 1234 }); await draw2('one', () => 0); }
      else if (stn === 'res1-dup') { await openDraw({ ce: 1234, dn: 5, own: [DR.consts().pool[0]] }); await draw2('one', () => 0); }
      else if (stn === 'anim' || stn === 'anim10' || stn === 'pop') {
        await openDraw({ ce: 8888, dn: 3, pt: 9, own: ['h1', 'h2', 'f1'] }); await draw2(stn === 'anim10' ? 'ten' : 'one', stn === 'anim10' ? seeded(21) : () => 0, true);
        const t = +(Q.get('t') || (stn === 'anim' ? 70 : stn === 'pop' ? 88 : 150));
        for (let i = 0; i < 300 && st().anim && st().anim.t < t; i++) SH.tick(1);
        DR.hold(true);                         // (frozen at t: the main loop goes on in real time)
      } else if (stn === 'res10') { await openDraw({ ce: 8888, dn: 4, own: ['h1', 'h2', 'h3', 'h4', 'f1', 'f2', 'n2', 'n3'] }); await draw2('ten', seeded(+(Q.get('seed') || 3))); }
      else await openDraw({ ce: 1234, dn: 3 });
      if (!/^(anim|anim10|pop)$/.test(stn)) SH.tick(+(Q.get('tick') || 90));
      // (&big=1: the 뽑기 canvas blown up 8x over the page, to look at its pixels)
      if (Q.get('big')) { const cv = $('pg-gacha-view').querySelector('canvas'), o = document.createElement('canvas'); o.width = 256; o.height = 256;
        o.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;image-rendering:pixelated'; const x = o.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(cv, 0, 0, 256, 256); document.body.appendChild(o); }
    }
    await sleep(300);
    log('GACHA SHOT READY ' + name + ' ' + stn);
  }

  async function run() {
    for (let i = 0; i < 300 && !(window.PG && PG.debug && PG.debug.draw); i++) await sleep(20);
    D = PG.debug; DR = D.draw; SH = D.shop; T = D.tro; G = D.G; L = D.local;
    IT = {}; for (const it of SH.items()) IT[it.id] = it;
    const sm = /shot=([a-z]+)/.exec(location.hash);
    if (sm) { if (/touch/.test(location.hash)) window.dispatchEvent(new Event('touchstart')); await shot(sm[1]); return; }
    watchMsgs();
    const steps = /hubfit/.test(location.hash) ? [fitTests] : [poolTests, pityTests, statTests, drawPace, commitTests, refundTests, storeTests, twoTabTests,
      tabUiTests, btnTests, resultTests, machineTests, shopCellTests, dotOddsTests, lostUiTests, animTests, fitTests, fxTests];
    for (const f of steps) {
      try { await f(); } catch (e) { fail++; log('GACHA FAIL ' + f.name + ' threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
    }
    DR.rng(null);
    log('GACHA DONE pass=' + pass + ' fail=' + fail);
  }
  setTimeout(run, 50);
})();
