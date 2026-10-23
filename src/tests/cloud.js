// v4 cloud trophies (design/cloud-trophies.md 13): Google sign-in + Firestore, against a fake SDK. Real time, over http.
//   node bogeul/build.js; node bogeul/tools/serve.js   (C:/Temp/bogeul at http://localhost:8765)
//   node bogeul/tools/run-chrome.js http://localhost:8765/test-cloud.html - 900 760 rt300000 "CLOUD DONE"
//   screenshots: http://localhost:8765/test-cloud.html?shot=<rec-out|rec-in|rec-msg|rec-frame|title-in|title-wait|my-out> at
//   900x760 / 390x844 (one frame fills the window, touch mode under 600 px) -> "CLOUD SHOT READY <scene>"; a scene
//   ending in -1x / -2x sets that game-screen scale; &zoom=<element id> magnifies that element 5x (to look at pixels)
// This page is the ARTIFACT skeleton (the cloud must be inert here); the deploy fixtures build.js writes run in iframes:
//   /deploy-cloud/  the deploy page with a made-up config. Its head hook hands every SDK <script> game.js makes to
//                   window.__pgFake below (nothing is downloaded): game.js's own loader, SRI attributes and fallback run
//   /deploy-nocfg/  the deploy page without a config (no login UI, no SDK request)
// FakeFirebase: exactly the compat calls game.js makes (13.1) - app / auth (popup, redirect, observer; sessions per
// profile ?p=, so two frames of one profile are two tabs of one browser) / firestore (update with dotted paths and the
// delete sentinel, onSnapshot with latency compensation and metadata, runTransaction), one shared backend with a server
// clock (50x while the frames run fast), offline profiles, injected failures, a write log, and RULES: a JS port of
// bogeul/firebase/firestore.rules, function by function (any rules change updates it). The user object's name / mail /
// photo / provider getters count reads (must stay 0).
// Groups: 1 inert artifact, 2 pure (the design's simulation through PG.debug.cloud), 2b v4 shop pure (design/shop.md
// 8.4's rules case by case; coins / items / the worn set / the day bonus / a v1 record through the pure parts), 3 the
// fixture at boot / 내 기록 warm-up, 4 first sign-in uploads, 5 cloud wins + sign-out, 6 pushes / holds / a staked
// result / the best score, 7 two devices, 8 offline, 9 a tab dying mid-write, 10 two tabs, 11 folding / full, 11b v4
// shop through the frames (the upload, a second device, a purchase, the worn set alone, sign-out, v 1 -> v 2, a newer
// document), 12 failures, 13 relog, 14 UI fit, 15 fonts, 16 the deploy without a config, 17 start() on this page.
// 친구 순위 (design/friends.md 6): the fake also has document get / delete, sub-collections, limited lists and batches,
// and F.PR, a JS port of the rules of profiles / codes / outbox / reqs / friends (F.pEval: a batch against a map of
// documents, one request.time, getAfter = the state after it); 19a the rules case by case, 19b through the frames (the
// card and code at sign-in, request / accept / decline + mute / unfriend, the best 탕, the card's debounce, the
// messages, the reads, errors, sign-out, another account, the preview's demo), 19c the fit (?shot=pal-in|pal-guest|
// pal-demo|pal-rec|pal-my (마이페이지's 친구 button) at phones on their side, a portrait tablet, the 1x screen; "CLOUD SHOT error pal fit" when it fails).
// Prints "CLOUD PASS|FAIL <name>", "CLOUD INFO ..." and "CLOUD DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => { if (cond) { pass++; log('CLOUD PASS ' + name); } else { fail++; log('CLOUD FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); } return !!cond; };
  const info = (s) => log('CLOUD INFO ' + s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const J = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
  const $ = (id) => document.getElementById(id);
  async function until(fn, ms, step) { const t0 = performance.now(); for (;;) { let v = false; try { v = fn(); } catch (e) { v = false; } if (v) return v; if (performance.now() - t0 > (ms || 3000)) return false; await sleep(step || 15); } }
  const SHOT = (/[?&]shot=([a-z0-9-]+)/.exec(location.search) || [])[1] || '';
  const HOME = 'https://pg-cloud-test.firebaseapp.com/';
  // (v4 shop 8.5: the account carries the coins and items too)
  const PITCH = '로그인하면 다른 기기에서도 트로피·꾸미기가 이어져요 · 구글 계정 이름·메일은 저장하지 않아요';

  // ================================================================ FakeFirebase (13.1)
  function makeFake() {
    const F = { SDK_VERSION: '12.19.0', docs: new Map(), log: [], calls: [], fails: [], profiles: new Map(), frames: new Map(), scripts: [], nss: [],
      peeks: 0, errors: [], speed: 1, off: 0, base: Date.now(), t0: performance.now(), lat: 3, hold: false, popupWait: false, open: new Map() };
    F.finishPopup = (name) => { const f = F.open.get(name); F.open.delete(name); if (f) f(); return !!f; };
    F.now = () => Math.round(F.base + F.off + (performance.now() - F.t0) * F.speed);
    F.setSpeed = (v) => { F.base = F.now() - F.off; F.t0 = performance.now(); F.speed = v; };
    F.tick = (ms) => { F.off += ms; };
    class TS { constructor(ms) { this.ms = ms; } toMillis() { return this.ms; } }
    F.TS = TS;
    const SV_TS = Object.freeze({ _fv: 'serverTimestamp' }), SV_DEL = Object.freeze({ _fv: 'delete' });
    const isMap = (x) => !!x && typeof x === 'object' && !(x instanceof TS) && !Array.isArray(x);
    const clone = (v) => (v instanceof TS ? new TS(v.ms) : Array.isArray(v) ? v.map(clone) : isMap(v) && v !== SV_TS && v !== SV_DEL ? Object.fromEntries(Object.keys(v).map((k) => [k, clone(v[k])])) : v);
    const resolve = (v, now) => (v === SV_TS ? new TS(now) : v instanceof TS ? new TS(v.ms) : Array.isArray(v) ? v.map((x) => resolve(x, now)) : isMap(v) ? Object.fromEntries(Object.keys(v).filter((k) => v[k] !== SV_DEL).map((k) => [k, resolve(v[k], now)])) : v);
    F.clone = clone; F.resolve = resolve;
    function applyUpdate(doc, upd, now) {
      const d = clone(doc);
      for (const p of Object.keys(upd)) {
        const parts = p.split('.'); let o = d;
        for (let i = 0; i < parts.length - 1; i++) { if (!isMap(o[parts[i]])) o[parts[i]] = {}; o = o[parts[i]]; }
        const last = parts[parts.length - 1];
        if (upd[p] === SV_DEL) delete o[last]; else o[last] = resolve(upd[p], now);
      }
      return d;
    }
    F.applyUpdate = applyUpdate;
    const later = (fn) => setTimeout(() => { try { fn(); } catch (e) { F.errors.push(String(e && e.stack || e)); } }, 0);
    const call = (fn, ...a) => { if (typeof fn !== 'function') return; try { fn(...a); } catch (e) { F.errors.push(String(e && e.stack || e)); } };
    F.err = (code) => { const e = new Error(code); e.code = code; return e; };
    F.failNext = (op, code, n) => { F.fails.push({ op, code, n: n || 1 }); };
    F.take = (op) => { const i = F.fails.findIndex((f) => f.op === op); if (i < 0) return ''; const f = F.fails[i]; if (--f.n <= 0) F.fails.splice(i, 1); return f.code; };

    // ---- a JS port of bogeul/firebase/firestore.rules, function by function (any rules change updates this too). v 2
    // (design/shop.md 8.4): the catalog literals (itemIds / priceOf / leagueNeed) come from the same catalog the rules'
    // GENERATED block is made from (PG.debug.shop.items(): tools/check-shop.js checks that block against it)
    const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    const isKey = (k) => typeof k === 'string' && /^[a-z][0-9a-z]{7}$/.test(k);
    const nickValue = (n) => typeof n === 'string' && n.length >= 1 && n.length <= 24;
    const SLOTK = ['t', 'w', 'g', 'ko', 'best', 'bl', 'seen', 'hi', 'day', 'de', 'n', 'at'], SLOTK2 = SLOTK.concat(['ce', 'sp', 'o', 'bd', 'bs']), SLOTK3 = SLOTK2.concat(['dn', 'gd']);
    let CAT = null;
    // (v 4: poolIds = DRAW_IDS, drawPrice / drawMax = DRAW's price / ten - the same numbers as the rules' GENERATED block)
    const cat = () => { if (!CAT) { const its = PG.debug.shop.items(), C0 = PG.debug.draw.consts(); CAT = { ids: new Set(its.filter((it) => it.price > 0).map((it) => it.id)), price: {}, lg: {}, pool: new Set(C0.ids), dp: C0.DRAW.price, dm: C0.DRAW.ten }; for (const it of its) { if (it.price > 0) CAT.price[it.id] = it.price; if (it.lg) CAT.lg[it.id] = it.lg; } } return CAT; };
    const priceOf = (id) => cat().price[id], leagueNeed = (id) => cat().lg[id] || 0;
    const hasAll = (x, ks) => ks.every((k) => k in x), hasOnly = (x, ks) => Object.keys(x).every((k) => ks.includes(k));
    const tsIs = (a, now) => a instanceof TS && a.ms === now;
    const deq = (a, b) => {
      if (a instanceof TS || b instanceof TS) return a instanceof TS && b instanceof TS && a.ms === b.ms;
      if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => deq(v, b[i]));
      if (isMap(a) && isMap(b)) { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k) => k in b && deq(a[k], b[k])); }
      return a === b;
    };
    const affected = (a, b) => { const out = []; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!(k in a) || !(k in b) || !deq(a[k], b[k])) out.push(k); return out; };
    const only = (ks, allowed) => ks.every((k) => allowed.includes(k));
    function slotCore(x, now) {
      return isInt(x.t, -999999, 999999) && isInt(x.g, 0, 10000000) && isInt(x.w, 0, x.g) && isInt(x.ko, 0, 10000000)
        && isInt(x.best, 0, 99999) && isInt(x.bl, 0, 6) && isInt(x.seen, 0, 1) && isInt(x.hi, 0, 999999999) && isInt(x.day, 0, 99991231) && isInt(x.de, 0, 40)
        && isInt(x.n, 1, 1000000000) && tsIs(x.at, now);
    }
    const slotShape = (x, now) => isMap(x) && hasAll(x, SLOTK) && hasOnly(x, SLOTK) && slotCore(x, now);
    function slotShape2(x, now) {
      return isMap(x) && hasAll(x, SLOTK2) && hasOnly(x, SLOTK2) && slotCore(x, now) && isInt(x.ce, 0, 1000000000) && isInt(x.sp, 0, 1000000000)
        && Array.isArray(x.o) && x.o.length <= 64 && new Set(x.o).size === x.o.length && x.o.every((id) => cat().ids.has(id)) && isInt(x.bd, 0, 99991231) && isInt(x.bs, 0, 5);
    }
    // (v 4, gacha.md 7.3: + dn the draws, gd the drawn items - pool ids, <= dn)
    function slotShape3(x, now) {
      return isMap(x) && hasAll(x, SLOTK3) && hasOnly(x, SLOTK3) && slotCore(x, now) && isInt(x.ce, 0, 1000000000) && isInt(x.sp, 0, 1000000000)
        && Array.isArray(x.o) && x.o.length <= 64 && new Set(x.o).size === x.o.length && x.o.every((id) => cat().ids.has(id)) && isInt(x.bd, 0, 99991231) && isInt(x.bs, 0, 5)
        && isInt(x.dn, 0, 1000000000) && Array.isArray(x.gd) && x.gd.length <= 64 && new Set(x.gd).size === x.gd.length && x.gd.every((id) => cat().pool.has(id)) && x.gd.length <= x.dn;
    }
    const dv = (a) => ('dn' in a ? a.dn : 0), gv = (a) => ('gd' in a ? a.gd : []);
    function coinStepOk3(a, b, dt) {
      const ao = ov(a), n = ao.length, ag = gv(a), g = ag.length, rise = b.ce - cv(a, 'ce'), d = b.dn - dv(a), dp = cat().dp;
      return rise >= 0 && rise <= 150 && rise * 2000 <= 60000 + dt && b.bd >= cv(a, 'bd')
        && d >= 0 && d <= cat().dm && b.gd.length >= g && b.gd.length <= g + d && deq(b.gd.slice(0, g), ag)
        && (b.o.length === n ? (deq(b.o, ao) && b.sp === cv(a, 'sp') + dp * d)
          : (b.o.length === n + 1 && deq(b.o.slice(0, n), ao) && !ao.includes(b.o[n]) && b.sp === cv(a, 'sp') + dp * d + priceOf(b.o[n]) && b.bl >= leagueNeed(b.o[n])));
    }
    const coinNewOk3 = (b) => b.ce <= 150 && b.o.length <= 1 && b.dn <= cat().dm && b.sp === cat().dp * b.dn + (b.o.length === 1 ? priceOf(b.o[0]) : 0) && (b.o.length === 0 || b.bl >= leagueNeed(b.o[0]));
    const slotOk3 = (o, b, k, now) => slotShape3(b, now) && ((k in o.s) ? (stepOk(o.s[k], b, now) && coinStepOk3(o.s[k], b, now - o.s[k].at.toMillis())) : (newOk(b) && coinNewOk3(b)));
    const drawSumOk = (a, b, z) => z.dn === dv(a) + dv(b) && gv(a).every((id) => z.gd.includes(id)) && gv(b).every((id) => z.gd.includes(id)) && z.gd.every((id) => gv(a).concat(gv(b)).includes(id));
    const eqValue = (e) => typeof e === 'string' && /^[0-9a-z]{5}$/.test(e);
    // (v 3, looks-per-animal.md 6.6: a worn set per animal - 30 characters; eqFor: as the document's version wants it)
    const eqsValue = (e) => typeof e === 'string' && /^[0-9a-z]{30}$/.test(e), eqFor = (e, v) => (v >= 3 ? eqsValue(e) : eqValue(e));
    const cv = (a, f) => (f in a ? a[f] : 0), ov = (a) => ('o' in a ? a.o : []);
    function coinStepOk(a, b, dt) {
      const ao = ov(a), n = ao.length, rise = b.ce - cv(a, 'ce');
      return rise >= 0 && rise <= 150 && rise * 2000 <= 60000 + dt && b.bd >= cv(a, 'bd')
        && (b.o.length === n ? (deq(b.o, ao) && b.sp === cv(a, 'sp'))
          : (b.o.length === n + 1 && deq(b.o.slice(0, n), ao) && !ao.includes(b.o[n]) && b.sp === cv(a, 'sp') + priceOf(b.o[n]) && b.bl >= leagueNeed(b.o[n])));
    }
    const coinNewOk = (b) => b.ce <= 150 && b.o.length <= 1 && b.sp === (b.o.length === 1 ? priceOf(b.o[0]) : 0) && (b.o.length === 0 || b.bl >= leagueNeed(b.o[0]));
    function createOk(d, now) {
      return hasAll(d, ['v', 'dev', 's', 'last', 'updatedAt']) && hasOnly(d, ['v', 'dev', 'nick', 'eq', 's', 'last', 'updatedAt'])
        && typeof d.dev === 'string' && /^[0-9a-z]{8}$/.test(d.dev) && (!('nick' in d) || nickValue(d.nick)) && tsIs(d.updatedAt, now)
        && isMap(d.s) && Object.keys(d.s).length === 1 && isKey(d.last) && (d.last in d.s)
        && ((d.v === 1 && slotShape(d.s[d.last], now) && !('eq' in d)) || (d.v === 2 && slotShape2(d.s[d.last], now) && (!('eq' in d) || eqValue(d.eq)))
          || (d.v === 3 && slotShape2(d.s[d.last], now) && (!('eq' in d) || eqsValue(d.eq)))
          || (d.v === 4 && slotShape3(d.s[d.last], now) && (!('eq' in d) || eqsValue(d.eq))))
        && d.s[d.last].n === 1 && d.s[d.last].t >= 0 && d.s[d.last].t <= 99999;
    }
    function metaOk(d, o, now) {
      return only(affected(d, o), ['s', 'last', 'nick', 'eq', 'v', 'updatedAt']) && (d.v === o.v || ((d.v === 2 || d.v === 3 || d.v === 4) && d.v > o.v))
        && tsIs(d.updatedAt, now) && o.updatedAt instanceof TS && now > o.updatedAt.ms + 2000
        && isMap(d.s) && Object.keys(d.s).length <= ('_' in d.s ? 17 : 16) && (!('nick' in d) || nickValue(d.nick)) && (!('eq' in d) || eqFor(d.eq, d.v));
    }
    function slotOk(d, o, now) {
      const k = d.last;
      return isKey(k) && isMap(o.s) && only(affected(d.s, o.s), [k]) && (k in d.s)
        && (d.v === 4 ? slotOk3(o, d.s[k], k, now) : d.v >= 2 ? slotOk2(o, d.s[k], k, now) : (slotShape(d.s[k], now) && ((k in o.s) ? stepOk(o.s[k], d.s[k], now) : newOk(d.s[k]))));
    }
    const slotOk2 = (o, b, k, now) => slotShape2(b, now) && ((k in o.s) ? (stepOk(o.s[k], b, now) && coinStepOk(o.s[k], b, now - o.s[k].at.toMillis())) : (newOk(b) && coinNewOk(b)));
    const newOk = (b) => b.n === 1 && b.t <= 250 && b.g <= 20 && b.ko <= 400;
    function stepOk(a, b, now) {
      const dt = now - a.at.toMillis(), rise = b.t - a.t;
      return b.n > a.n && dt >= 2000 && (rise <= 0 || (rise <= 250 && rise * 500 <= 10000 + dt)) && b.g >= a.g && b.g - a.g <= 20
        && b.w >= a.w && b.w - a.w <= b.g - a.g && b.ko >= a.ko && b.ko - a.ko <= 400 && b.best >= a.best && b.bl >= a.bl && b.seen >= a.seen && b.hi >= a.hi;
    }
    function foldOk(d, o, now) {
      const k = d.last, z0 = isMap(o.s) && '_' in o.s ? o.s._ : { t: 0, w: 0, g: 0, ko: 0, best: 0, bl: 0, seen: 0, hi: 0, n: 0 };
      return isKey(k) && isMap(o.s) && (k in o.s) && !(k in d.s) && ('_' in d.s) && only(affected(d.s, o.s), [k, '_'])
        && o.s[k].at instanceof TS && o.s[k].at.ms < now - 7 * 864e5 && sumOk(z0, o.s[k], d.s._, d.v, now);
    }
    function sumOk(a, b, z, v, now) {
      return (v === 4 ? (slotShape3(z, now) && coinSumOk(a, b, z) && drawSumOk(a, b, z)) : v >= 2 ? (slotShape2(z, now) && coinSumOk(a, b, z)) : slotShape(z, now))
        && z.n === a.n + 1 && z.day === 0 && z.de === 0 && z.t === a.t + b.t && z.w === a.w + b.w && z.g === a.g + b.g && z.ko === a.ko + b.ko
        && z.best === (a.best > b.best ? a.best : b.best) && z.bl === (a.bl > b.bl ? a.bl : b.bl) && z.seen === (a.seen > b.seen ? a.seen : b.seen) && z.hi === (a.hi > b.hi ? a.hi : b.hi);
    }
    const coinSumOk = (a, b, z) => z.ce === cv(a, 'ce') + cv(b, 'ce') && z.sp === cv(a, 'sp') + cv(b, 'sp')
      && ov(a).every((id) => z.o.includes(id)) && ov(b).every((id) => z.o.includes(id)) && z.o.every((id) => ov(a).concat(ov(b)).includes(id)) && z.bd === 0 && z.bs === 0;
    const nickOk = (d, o) => only(affected(d, o), ['nick', 'updatedAt']) && ('nick' in d);
    const eqOk = (d, o) => only(affected(d, o), ['eq', 'v', 'updatedAt']) && ('eq' in d);   // (v 3: the upgrade may ride with it)
    // '' = allowed, else the reason
    F.rules = (op, uid, auth, o, d, now) => {
      if (!auth || auth !== uid) return 'auth';
      if (op === 'get') return '';
      if (op === 'list') return 'list';
      if (op === 'delete') return 'delete';                   // (allow delete: if false - the owner deletes in the console)
      if (op === 'create') return createOk(d, now) ? '' : 'create';
      if (op === 'update') return metaOk(d, o, now) && (slotOk(d, o, now) || foldOk(d, o, now) || nickOk(d, o) || eqOk(d, o)) ? '' : 'update';
      return 'op';
    };
    F.R = { slotShape, slotShape2, slotShape3, coinStepOk3, coinNewOk3, drawSumOk, createOk, metaOk, slotOk, stepOk, coinStepOk, coinNewOk, foldOk, sumOk, nickOk, eqOk };
    // ---- 친구 순위 (design/friends.md 3): profiles / codes / outbox / reqs / friends, function by function (any rules change
    // updates this too). ctx: now (request.time), d (request.resource.data), o (resource.data), get(p) / getAfter(p) (a
    // document or null - before / after the whole write or batch), limit (a list's); ctx.n counts the get / exists calls
    const PAL_RE = /^[A-HJKMNP-Z2-9]{8}$/, CARDK = ['v', 'code', 'nick', 'st', 'hi', 'tr', 'c', 'lk', 'at'];
    F.PR = (op, path, auth, ctx) => {
      const sg = path.split('/'), me = auth || null, d = ctx.d, o = ctx.o, now = ctx.now;
      ctx.n = 0;
      const get = (q) => { ctx.n++; return ctx.get(q); }, exists = (q) => { ctx.n++; return !!ctx.get(q); };
      const getAfter = (q) => { ctx.n++; return ctx.getAfter(q); }, existsAfter = (q) => { ctx.n++; return !!ctx.getAfter(q); };
      const signedIn = (u) => !!me && me === u;
      const profP = (u) => 'profiles/' + u, codeP = (c) => 'codes/' + c, outP = (u) => 'outbox/' + u, reqP = (to, from) => 'reqs/' + to + '/in/' + from, frP = (a, b) => 'friends/' + a + '/f/' + b;
      const isCode = (c) => typeof c === 'string' && PAL_RE.test(c);
      const cardVals = (x) => nickValue(x.nick) && isInt(x.st, 0, 2400) && isInt(x.hi, 0, 999999999) && isInt(x.tr, 0, 99999) && isInt(x.c, 0, 5)
        && typeof x.lk === 'string' && /^[0-9a-z]{5}$/.test(x.lk) && tsIs(x.at, now);
      const profNewOk = (uid) => hasAll(d, CARDK) && hasOnly(d, CARDK) && d.v === 1 && isCode(d.code) && cardVals(d) && (getAfter(codeP(d.code)) || {}).u === uid;
      const cardOk = () => only(affected(d, o), ['nick', 'st', 'hi', 'tr', 'c', 'lk', 'at']) && cardVals(d) && d.st >= o.st && d.hi >= o.hi && o.at instanceof TS && now > o.at.ms + 5000;
      const codeNewOk = (code) => isCode(code) && hasOnly(d, ['u']) && d.u === me && !exists(profP(me)) && (getAfter(profP(me)) || {}).code === code;
      const rqVal = () => hasOnly(d, ['rq']) && tsIs(d.rq, now);
      const reqNewOk = (to, from) => {
        if (to === from) return false;
        const pf = get(profP(from)); if (!pf) return false;          // (get() of a missing document: an error - refused)
        return hasAll(d, ['n', 'cd', 'c', 'lk', 'at']) && hasOnly(d, ['n', 'cd', 'c', 'lk', 'at'])
          && d.n === pf.nick && d.cd === pf.code && d.c === pf.c && d.lk === pf.lk && tsIs(d.at, now)
          && tsIs((getAfter(outP(from)) || {}).rq, now) && exists(profP(to)) && !exists(frP(from, to)) && !exists(reqP(from, to));
      };
      const pairNewOk = (uid, other) => {
        const them = me === uid ? other : uid;
        return (me === uid || me === other) && uid !== other && hasOnly(d, ['at']) && tsIs(d.at, now)
          && exists(reqP(me, them)) && !existsAfter(reqP(me, them)) && existsAfter(frP(me, them)) && existsAfter(frP(them, me));
      };
      // (친구 초대: invites/{to}/in/{from} and ivbox/{uid})
      const ivP = (u) => 'ivbox/' + u, IVK = ['code', 'mode', 'nick', 'at'];
      const ivVal = () => hasOnly(d, ['at']) && tsIs(d.at, now);
      const ivOk = (to, from) => to !== from && hasAll(d, IVK) && hasOnly(d, IVK) && typeof d.code === 'string' && /^[a-z0-9]{4}$/.test(d.code)
        && (d.mode === 'coop' || d.mode === 'battle') && nickValue(d.nick) && tsIs(d.at, now) && exists(frP(to, from)) && tsIs((getAfter(ivP(from)) || {}).at, now);
      const lim = (n) => typeof ctx.limit === 'number' && ctx.limit <= n;
      let ok = false;
      if (sg[0] === 'profiles' && sg.length === 2) {
        const uid = sg[1];
        ok = op === 'get' ? signedIn(uid) || (!!me && exists(frP(uid, me))) : op === 'create' ? signedIn(uid) && profNewOk(uid) : op === 'update' ? signedIn(uid) && cardOk() : false;
      } else if (sg[0] === 'codes' && sg.length === 2) {
        ok = op === 'get' ? !!me : op === 'create' ? !!me && codeNewOk(sg[1]) : false;
      } else if (sg[0] === 'outbox' && sg.length === 2) {
        const uid = sg[1];
        ok = op === 'get' ? signedIn(uid) : op === 'create' ? signedIn(uid) && rqVal() : op === 'update' ? signedIn(uid) && rqVal() && o.rq instanceof TS && now > o.rq.ms + 20000 : false;
      } else if (sg[0] === 'reqs' && sg[2] === 'in' && sg.length === 4) {
        const to = sg[1], from = sg[3];
        ok = op === 'get' || op === 'delete' ? !!me && (me === from || me === to) : op === 'create' ? signedIn(from) && reqNewOk(to, from) : false;
      } else if (sg[0] === 'reqs' && sg[2] === 'in' && sg.length === 3) {
        ok = op === 'list' && !!me && me === sg[1] && lim(20);
      } else if (sg[0] === 'friends' && sg[2] === 'f' && sg.length === 4) {
        const uid = sg[1], other = sg[3];
        ok = op === 'get' || op === 'delete' ? !!me && (me === uid || me === other) : op === 'create' ? !!me && pairNewOk(uid, other) : false;
      } else if (sg[0] === 'friends' && sg[2] === 'f' && sg.length === 3) {
        ok = op === 'list' && signedIn(sg[1]) && lim(60);
      } else if (sg[0] === 'invites' && sg[2] === 'in' && sg.length === 4) {
        const to = sg[1], from = sg[3];
        ok = op === 'get' ? signedIn(to) : op === 'delete' ? !!me && (me === to || me === from) : op === 'create' || op === 'update' ? signedIn(from) && ivOk(to, from) : false;
      } else if (sg[0] === 'invites' && sg[2] === 'in' && sg.length === 3) {
        ok = op === 'list' && signedIn(sg[1]) && lim(50);
      } else if (sg[0] === 'ivbox' && sg.length === 2) {
        const uid = sg[1];
        ok = op === 'get' ? signedIn(uid) : op === 'create' ? signedIn(uid) && ivVal() : op === 'update' ? signedIn(uid) && ivVal() && o.at instanceof TS && now > o.at.ms + 10000 : false;
      }
      if (ctx.n > 10) return 'calls ' + ctx.n;
      return ok ? '' : op;
    };
    // one batch / transaction / write of these paths against the documents in map W: one request.time, every write's
    // rule against the state before (get / exists) and after (getAfter) the whole batch, <= 20 rule calls in all.
    // -> { why, after (path -> document or null), calls }
    F.pEval = (W, auth, ws, now) => {
      const before = (q) => W.get(q) || null, after = new Map();
      for (const w of ws) { const old = after.has(w.path) ? after.get(w.path) : before(w.path); after.set(w.path, w.kind === 'delete' ? null : w.kind === 'update' ? (old ? applyUpdate(old, w.data, now) : null) : resolve(w.data, now)); }
      const ga = (q) => (after.has(q) ? after.get(q) : before(q));
      let why = '', calls = 0;
      for (const w of ws) {
        const old = before(w.path), neu = after.get(w.path);
        if (/^players\//.test(w.path)) { why = 'players in a batch'; break; }
        if (w.kind === 'update' && !old) { why = 'not-found'; break; }
        const op = w.kind === 'delete' ? 'delete' : old ? 'update' : 'create', ctx = { now, d: neu, o: old, get: before, getAfter: ga };
        const r = F.PR(op, w.path, auth, ctx); calls += ctx.n || 0;
        if (r) { why = op + ' ' + w.path + ': ' + r; break; }
      }
      if (!why && calls > 20) why = 'calls ' + calls;
      return { why, after, calls };
    };
    // a read of one of these paths (get or list) against map W
    F.pRead = (W, auth, op, path, limit) => F.PR(op, path, auth, { now: F.now(), d: null, o: W.get(path) || null, get: (q) => W.get(q) || null, getAfter: (q) => W.get(q) || null, limit });
    F.SV = { ts: SV_TS, del: SV_DEL };

    // ---- profiles (a browser profile: its sign-in session, its network) and the SDK namespaces
    F.prof = (name) => { let P = F.profiles.get(name); if (!P) { P = { name, user: null, next: null, online: true, redirect: null, ls: new Set() }; F.profiles.set(name, P); } return P; };
    const userObj = (uid) => {
      const u = { uid };
      for (const k of ['email', 'displayName', 'photoURL', 'phoneNumber', 'providerData']) Object.defineProperty(u, k, { enumerable: true, get() { F.peeks++; return k === 'providerData' ? [] : 'secret'; } });
      return u;
    };
    F.notify = (P) => { for (const l of Array.from(P.ls)) later(() => { if (P.ls.has(l) && !l.ns.dead) call(l.next, P.user ? userObj(P.user) : null); }); };
    function mkAuth(ns) {
      const P = ns.prof, A = { languageCode: null };
      Object.defineProperty(A, 'currentUser', { get: () => (P.user ? userObj(P.user) : null) });
      A.onAuthStateChanged = (next) => { const l = { ns, next }; P.ls.add(l); later(() => { if (P.ls.has(l) && !ns.dead) call(next, P.user ? userObj(P.user) : null); }); return () => P.ls.delete(l); };
      // (as the real SDK: a new popup of this page cancels the one still open - auth/cancelled-popup-request. F.popupWait:
      // the popup stays open - a Google tab the player left - until F.finishPopup(profile) or a newer popup)
      A.signInWithPopup = (prov) => {
        F.calls.push({ op: 'popup', prof: P.name, frame: ns.frame, prompt: prov && prov.custom ? prov.custom.prompt : '', lang: A.languageCode });
        if (A._open) { const o = A._open; A._open = null; setTimeout(() => o.rej(F.err('auth/cancelled-popup-request')), 1); }
        const code = F.take('popup');
        return new Promise((res, rej) => {
          const done = () => { if (P.next) { P.user = P.next; F.notify(P); res({ user: userObj(P.user) }); } else rej(F.err('auth/popup-closed-by-user')); };
          if (F.popupWait && !code) { const o = { res, rej, done }; A._open = o; F.open.set(P.name, () => { if (A._open === o) { A._open = null; done(); } }); return; }
          setTimeout(() => { if (code) rej(F.err(code)); else done(); }, F.lat);
        });
      };
      A.signInWithRedirect = (prov) => {
        F.calls.push({ op: 'redirect', prof: P.name, frame: ns.frame, prompt: prov && prov.custom ? prov.custom.prompt : '' });
        const code = F.take('redirect'); if (code) return Promise.reject(F.err(code));
        P.redirect = P.next; return new Promise(() => { /* the page goes away to Google */ });
      };
      A.getRedirectResult = () => {
        F.calls.push({ op: 'result', prof: P.name, frame: ns.frame });
        const code = F.take('result');
        return new Promise((res, rej) => setTimeout(() => {
          if (code) { rej(F.err(code)); return; }
          if (P.redirect) { P.user = P.redirect; P.redirect = null; F.notify(P); res({ user: userObj(P.user) }); } else res({ user: null });
        }, F.lat));
      };
      A.signOut = () => { F.calls.push({ op: 'signOut', prof: P.name, frame: ns.frame }); P.user = null; F.notify(P); return Promise.resolve(); };
      return A;
    }
    F.ns = (name, frame, mock) => {
      const P = F.prof(name), ns = { SDK_VERSION: F.SDK_VERSION, apps: [], dead: false, frame: frame || name, prof: P, parts: new Set(mock ? ['app', 'auth', 'firestore'] : []) };
      ns.initializeApp = (cfg) => {
        if (!ns.parts.has('app')) throw new Error('app file not loaded');
        const app = { name: '[DEFAULT]', options: Object.assign({}, cfg) };
        app.auth = () => { if (!ns.parts.has('auth')) throw new Error('auth file not loaded'); return app._a || (app._a = mkAuth(ns)); };
        app.firestore = () => { if (!ns.parts.has('firestore')) throw new Error('firestore file not loaded'); return app._d || (app._d = mkDb(ns)); };
        ns.apps.push(app); F.calls.push({ op: 'init', frame: ns.frame, cfg: app.options }); return app;
      };
      ns.app = () => { if (!ns.apps.length) throw new Error('no app'); return ns.apps[0]; };
      function GoogleAuthProvider() { this.custom = null; }
      GoogleAuthProvider.prototype.setCustomParameters = function (p) { this.custom = Object.assign({}, p); return this; };
      ns.auth = { GoogleAuthProvider };
      ns.firestore = { FieldValue: { serverTimestamp: () => SV_TS, delete: () => SV_DEL } };
      F.nss.push(ns);
      return ns;
    };
    // the frame went away (a reload): its pending writes never reach the server, its listeners hear nothing more
    F.kill = (frame) => { for (const ns of F.nss) if (ns.frame === frame) ns.dead = true; for (const P of F.profiles.values()) for (const l of Array.from(P.ls)) if (l.ns.dead) P.ls.delete(l); };

    // ---- firestore
    const dbs = [];
    function mkDb(ns) {
      const db = { ns, pending: [], ls: new Set(), seen: new Map() };
      db.collection = (c) => mkColl(db, c);
      db.runTransaction = (fn) => F.tx(db, fn);
      // (친구 순위: a batch of set / update / delete, committed at once)
      db.batch = () => {
        const ws = [], b = {
          set: (ref, data) => { ws.push({ path: ref.path, kind: 'set', data }); return b; },
          update: (ref, data) => { ws.push({ path: ref.path, kind: 'update', data }); return b; },
          delete: (ref) => { ws.push({ path: ref.path, kind: 'delete' }); return b; },
          commit: () => F.pbatch(db, ws.slice(), 'batch'),
        };
        return b;
      };
      dbs.push(db);
      return db;
    }
    function mkRef(db, path, id) {
      return {
        id, path,
        update: (upd) => F.write(db, path, id, 'update', upd),
        set: (data) => F.write(db, path, id, 'set', data),
        onSnapshot: (opts, next, err) => F.listen(db, path, next, err),
        get: () => F.pread(db, path),
        delete: () => F.pbatch(db, [{ path, kind: 'delete' }], 'delete'),
        collection: (c) => mkColl(db, path + '/' + c),
      };
    }
    function mkColl(db, path) {
      return { path, id: path.split('/').pop(), doc: (id) => mkRef(db, path + '/' + id, id), get: () => F.plist(db, path, undefined),
        limit: (n) => ({ get: () => F.plist(db, path, n), onSnapshot: (a, b, c) => (typeof a === 'function' ? F.qlisten(db, path, n, a, b) : F.qlisten(db, path, n, b, c)) }) };
    }
    // (친구 초대: a listener on a limited collection - the rule checked when it starts and at every delivery (another
    // account: permission-denied, the listener ends); a write under it delivers the whole set; offline: nothing new)
    const qdocs = (path, n) => Array.from(F.docs.keys()).filter((k) => k.startsWith(path + '/') && k.indexOf('/', path.length + 1) < 0).sort().slice(0, n)
      .map((k) => ({ id: k.split('/').pop(), exists: true, data: () => clone(F.docs.get(k)) }));
    F.qlisten = (db, path, n, next, err) => {
      const code = F.take('psnap');
      F.calls.push({ op: 'listen', prof: db.ns.prof.name, frame: db.ns.frame, path, limit: n });
      if (code) { later(() => call(err, F.err(code))); return () => { /* never started */ }; }
      const l = { db, path, q: n, next, err, alive: true };
      db.ls.add(l); later(() => F.deliver(l));
      return () => { l.alive = false; db.ls.delete(l); };
    };
    F.qdeliver = (l) => {
      const P = l.db.ns.prof;
      if (!P.online) return;
      const why = F.pRead(F.docs, P.user, 'list', l.path, l.q);
      if (why) { l.alive = false; l.db.ls.delete(l); call(l.err, F.err('permission-denied')); return; }
      const docs = qdocs(l.path, l.q);
      call(l.next, { docs, size: docs.length, empty: !docs.length, metadata: { hasPendingWrites: false, fromCache: false } });
    };
    // the live query listeners of a frame (or of all) on a path
    F.qls = (frame, path) => { let n = 0; for (const db of dbs) if (!db.ns.dead && (!frame || db.ns.frame === frame)) for (const l of db.ls) if (l.q && (!path || l.path === path)) n++; return n; };
    const snapOf = (doc, pending, fromCache) => ({ exists: !!doc, data: () => (doc ? clone(doc) : undefined), metadata: { hasPendingWrites: pending, fromCache } });
    F.deliver = (l) => {
      if (!l.alive || l.db.ns.dead) return;
      if (l.q) { F.qdeliver(l); return; }
      const db = l.db, P = db.ns.prof;
      let doc;
      if (P.online) { doc = F.docs.get(l.path) || null; db.seen.set(l.path, doc ? clone(doc) : null); } else doc = db.seen.has(l.path) ? db.seen.get(l.path) : null;
      const mine = db.pending.filter((w) => w.path === l.path), now = F.now();
      for (const w of mine) doc = w.kind === 'update' ? (doc ? applyUpdate(doc, w.data, now) : doc) : resolve(w.data, now);
      call(l.next, snapOf(doc, mine.length > 0, !P.online));
    };
    F.listen = (db, path, next, err) => {
      const code = F.take('snapshot');
      if (code) { later(() => call(err, F.err(code))); return () => { /* never started */ }; }
      const l = { db, path, next, err, alive: true };
      db.ls.add(l); later(() => F.deliver(l));
      return () => { l.alive = false; db.ls.delete(l); };
    };
    const under = (l, path) => !!l.q && path.startsWith(l.path + '/') && path.indexOf('/', l.path.length + 1) < 0;
    F.broadcast = (path) => { for (const db of dbs) if (!db.ns.dead && db.ns.prof.online) for (const l of db.ls) if ((!l.q && l.path === path) || under(l, path)) later(() => F.deliver(l)); };
    F.local = (db, path) => { for (const l of db.ls) if (!l.q && l.path === path) later(() => F.deliver(l)); };
    F.write = (db, path, id, kind, data) => {
      const w = { db, path, id, kind, data, code: F.take(/^players\//.test(path) ? kind : 'p' + kind) };
      F.calls.push({ op: kind, prof: db.ns.prof.name, frame: db.ns.frame, path });
      db.pending.push(w);
      F.local(db, path);
      return new Promise((res, rej) => { w.res = res; w.rej = rej; setTimeout(() => F.flush(db), F.lat); });
    };
    F.flush = (db) => {
      if (db.ns.dead) { db.pending.length = 0; return; }
      const P = db.ns.prof;
      if (!P.online || F.hold) return;
      while (db.pending.length) {
        const w = db.pending.shift(), now = F.now(), old = F.docs.get(w.path) || null;
        let code = w.code, neu = null, why = '';
        if (code) why = 'injected';
        else if (w.kind === 'update' && !old) { code = 'not-found'; why = 'not-found'; }
        else {
          neu = w.kind === 'update' ? applyUpdate(old, w.data, now) : resolve(w.data, now);
          why = /^players\//.test(w.path) ? F.rules(old ? 'update' : 'create', w.id, P.user, old, neu, now)
            : F.PR(old ? 'update' : 'create', w.path, P.user, { now, d: neu, o: old, get: (q) => F.docs.get(q) || null, getAfter: (q) => (q === w.path ? neu : F.docs.get(q) || null) });
          if (why) code = 'permission-denied';
        }
        if (/^players\//.test(w.path)) F.log.push({ uid: w.id, op: w.kind, ok: !code, code, why, prof: P.name, frame: db.ns.frame, t: now, upd: w.data, data: neu ? clone(neu) : null });
        else F.plog.push({ tag: w.kind, frame: db.ns.frame, prof: P.name, t: now, ok: !code, why, w: [w.kind + ' ' + w.path], data: neu ? [clone(neu)] : [null] });
        if (!code) F.docs.set(w.path, neu);
        if (code) w.rej(F.err(code)); else w.res();
        F.broadcast(w.path); F.local(db, w.path);
      }
    };
    F.flushAll = () => { for (const db of dbs) F.flush(db); };
    F.release = () => { F.hold = false; F.flushAll(); };
    F.setOnline = (name, on) => {
      const P = F.prof(name); P.online = !!on;
      if (on) for (const db of dbs) if (db.ns.prof === P && !db.ns.dead) { F.flush(db); for (const l of db.ls) later(() => F.deliver(l)); }
    };
    F.tx = (db, fn) => {
      const P = db.ns.prof;
      F.calls.push({ op: 'tx', prof: P.name, frame: db.ns.frame });
      return new Promise((res, rej) => setTimeout(() => {
        if (db.ns.dead) return;
        let first = true, code = '';
        const gate = (path) => { if (first) { first = false; code = F.take(/^players\//.test(path) ? 'tx' : 'ptx'); if (!code && !P.online) code = 'unavailable'; } return code; };
        const writes = [];
        const tx = {
          get: (ref) => {
            const c = gate(ref.path); if (c) return Promise.reject(F.err(c));
            const d = F.docs.get(ref.path) || null;
            if (!/^players\//.test(ref.path) && F.pRead(F.docs, P.user, 'get', ref.path)) return Promise.reject(F.err('permission-denied'));
            return Promise.resolve(snapOf(d, false, false));
          },
          set: (ref, data) => { writes.push({ ref, kind: 'set', data }); return tx; },
          update: (ref, data) => { writes.push({ ref, kind: 'update', data }); return tx; },
        };
        let out; try { out = fn(tx); } catch (e) { rej(e); return; }
        Promise.resolve(out).then((v) => setTimeout(() => {
          if (db.ns.dead) return;
          if (writes.length && writes.every((w) => !/^players\//.test(w.ref.path))) {
            const c = F.pcommit(P, db.ns.frame, writes.map((w) => ({ path: w.ref.path, kind: w.kind, data: w.data })), 'tx');
            if (c) rej(F.err(c)); else res(v);
            return;
          }
          const now = F.now(), staged = [];
          for (const w of writes) {
            const old = F.docs.get(w.ref.path) || null;
            if (w.kind === 'update' && !old) { rej(F.err('not-found')); return; }
            const neu = w.kind === 'update' ? applyUpdate(old, w.data, now) : resolve(w.data, now);
            const why = F.rules(old ? 'update' : 'create', w.ref.id, P.user, old, neu, now);
            F.log.push({ uid: w.ref.id, op: 'tx-' + w.kind, ok: !why, code: why ? 'permission-denied' : '', why, prof: P.name, frame: db.ns.frame, t: now, upd: w.data, data: clone(neu) });
            if (why) { rej(F.err('permission-denied')); return; }
            staged.push([w.ref.path, neu]);
          }
          for (const [q, d] of staged) { F.docs.set(q, d); F.broadcast(q); }
          res(v);
        }, F.lat), rej);
      }, F.lat));
    };
    // ---- 친구 순위's reads and batches (design/friends.md 6): a get / a list (limit n) / a batch or a delete, each a
    // round trip; offline: 'unavailable' (no cache here); injected failures 'pget' / 'plist' / 'pbatch' / 'pdelete';
    // F.plog logs each with its verdict, F.calls each call (op get / list / batch / delete, with its path)
    F.plog = [];
    F.pcommit = (P, frame, ws, tag) => {
      const now = F.now(), r = F.pEval(F.docs, P.user, ws, now);
      F.plog.push({ tag, frame, prof: P.name, t: now, ok: !r.why, why: r.why, w: ws.map((w) => w.kind + ' ' + w.path), calls: r.calls, data: ws.map((w) => (r.after.get(w.path) ? clone(r.after.get(w.path)) : null)) });
      if (r.why) return /^not-found/.test(r.why) ? 'not-found' : 'permission-denied';
      for (const [q, d] of r.after) { if (d) F.docs.set(q, d); else F.docs.delete(q); }
      for (const q of r.after.keys()) F.broadcast(q);
      return '';
    };
    const pTrip = (db, call, take, fn) => {
      const P = db.ns.prof;
      F.calls.push(Object.assign({ prof: P.name, frame: db.ns.frame }, call));
      return new Promise((res, rej) => setTimeout(() => {
        if (db.ns.dead) return;
        const code = F.take(take);
        if (code) { rej(F.err(code)); return; }
        if (!P.online) { rej(F.err('unavailable')); return; }
        try { fn(P, res, rej); } catch (e) { F.errors.push(String(e && e.stack || e)); rej(e); }
      }, F.lat));
    };
    F.pread = (db, path) => pTrip(db, { op: 'get', path }, 'pget', (P, res, rej) => {
      const doc = F.docs.get(path) || null, why = /^players\//.test(path) ? F.rules('get', path.split('/')[1], P.user, doc, null, F.now()) : F.pRead(F.docs, P.user, 'get', path);
      F.plog.push({ tag: 'get', frame: db.ns.frame, prof: P.name, t: F.now(), ok: !why, why, w: ['get ' + path] });
      if (why) rej(F.err('permission-denied')); else res(Object.assign(snapOf(doc, false, false), { id: path.split('/').pop() }));
    });
    F.plist = (db, path, limit) => pTrip(db, { op: 'list', path, limit }, 'plist', (P, res, rej) => {
      const why = F.pRead(F.docs, P.user, 'list', path, limit);
      F.plog.push({ tag: 'list', frame: db.ns.frame, prof: P.name, t: F.now(), ok: !why, why, w: ['list ' + path + ' ' + limit] });
      if (why) { rej(F.err('permission-denied')); return; }
      const docs = Array.from(F.docs.keys()).filter((k) => k.startsWith(path + '/') && k.indexOf('/', path.length + 1) < 0).sort().slice(0, limit === undefined ? 1e9 : limit)
        .map((k) => ({ id: k.split('/').pop(), exists: true, data: () => clone(F.docs.get(k)) }));
      res({ docs, size: docs.length, empty: !docs.length });
    });
    F.pbatch = (db, ws, tag) => pTrip(db, { op: tag, n: ws.length, path: ws.map((w) => w.kind + ' ' + w.path).join(', ') }, tag === 'delete' ? 'pdelete' : 'pbatch', (P, res, rej) => {
      const c = F.pcommit(P, db.ns.frame, ws, tag);
      if (c) rej(F.err(c)); else res();
    });

    // ---- the fixture's script hook (build.js FAKE_HOOK): the SDK files of a frame, "loaded" here
    F.claims = (src) => /\/firebase-(app|auth|firestore)-compat\.js$/.test(src);
    F.script = (win, el) => {
      let name = 'default', frame = '';
      try { const q = new URLSearchParams(win.location.search); name = q.get('p') || 'default'; frame = q.get('f') || name; } catch (e) { /* ignore */ }
      const part = /-(app|auth|firestore)-compat/.exec(el.src)[1];
      F.scripts.push({ frame, src: el.src, integrity: el.integrity, cross: el.crossOrigin, ref: el.referrerPolicy, async: el.async, part });
      const code = F.take('load');
      setTimeout(() => {
        if (code) { call(el.onerror, new win.Event('error')); return; }
        if (part === 'app' && !win.firebase) { win.firebase = F.ns(name, frame); F.frames.set(frame, win.firebase); }
        if (win.firebase && win.firebase.parts) win.firebase.parts.add(part);
        call(el.onload, new win.Event('load'));
      }, 2);
      return el;
    };
    F.writes = (o) => F.log.filter((e) => (!o || ((!o.frame || e.frame === o.frame) && (!o.uid || e.uid === o.uid) && (o.ok === undefined || e.ok === o.ok) && (!o.since || e.t >= o.since))));
    // a document as a test sets it up (plain numbers; at in ms)
    F.put = (uid, d) => { const doc = clone(d); doc.updatedAt = new TS(d.updatedAt || F.now() - 60000); for (const k of Object.keys(doc.s || {})) doc.s[k].at = new TS(d.s[k].at || F.now() - 60000); F.docs.set('players/' + uid, doc); };
    F.get = (uid) => F.docs.get('players/' + uid) || null;
    F.sum = (uid) => { const d = F.get(uid); let t = 0; if (d) for (const k of Object.keys(d.s)) t += d.s[k].t; return t; };
    return F;
  }
  const F = window.__pgFake = makeFake();
  const slotOf = (o) => Object.assign({ t: 0, w: 0, g: 0, ko: 0, best: 0, bl: 0, seen: 1, hi: 0, day: 0, de: 0, n: 1 }, o);

  // ================================================================ frames (the deploy fixture)
  let box = null;
  function frameBox() {
    if (box) return box;
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:99999;background:#061518;overflow:hidden;display:flex;flex-wrap:wrap;align-content:flex-start;gap:2px';
    document.body.appendChild(box);
    return box;
  }
  async function frame(id, prof, opts) {
    opts = opts || {};
    const el = document.createElement('iframe');
    el.style.cssText = `width:${opts.w || 440}px;height:${opts.h || 372}px;border:0;flex:none;background:#000`;
    el.src = (opts.src || '/deploy-cloud/index.html') + '?p=' + encodeURIComponent(prof) + '&f=' + encodeURIComponent(id) + (opts.q || '');
    frameBox().appendChild(el);
    const fr = { el, id, prof };
    fr.win = () => el.contentWindow;
    fr.$ = (x) => el.contentWindow.document.getElementById(x);
    fr.D = () => el.contentWindow.PG.debug;
    fr.C = () => el.contentWindow.PG.debug.cloud;
    fr.T = () => el.contentWindow.PG.debug.tro;
    fr.st = () => fr.C().state();
    fr.tro = () => fr.T().state();
    // (booted: the title shows - or the login screen before it, design/cloud-trophies.md "As built (login screen)"; or
    // 친구와 하기, opened by an invite link)
    fr.ready = () => until(() => { const w = el.contentWindow; if (!w || w.__pgOld || !w.PG || !w.PG.debug || !w.PG.debug.cloud || w.document.readyState === 'loading') return false; const t = w.document.getElementById('pg-title'), l = w.document.getElementById('pg-login'), fd = w.document.getElementById('pg-friends'); return !!t && (!t.hidden || (!!l && !l.hidden) || (!!fd && !fd.hidden)); }, 15000, 20);
    // fast timers and the test server's clock, the environment of a browser tab (these frames play top-level tabs: a
    // real frame never signs in - opts.env null keeps the real one), then this test's namespace (the cloud boots again in it)
    fr.boot = (ns, fast) => { const C = fr.C(); if (fast !== false) { C.fast(true); C.clock(F.now); } C.env(opts.env === undefined ? {} : opts.env); fr.T().away(false); if (ns) fr.T().ns(ns); return fr.st(); };
    fr.reload = async (ns, fast) => { F.kill(id); el.contentWindow.__pgOld = true; el.contentWindow.location.reload(); const r = await fr.ready(); if (r) fr.boot(ns, fast); return !!r; };
    fr.rec = async (open) => { if (open) fr.T().openRec(); else fr.T().closeRec(); await sleep(40); };
    fr.recShown = () => !fr.$('pg-rec').hidden;
    fr.remove = () => { F.kill(id); el.remove(); };
    const r = await fr.ready();
    if (!r) throw new Error('frame ' + id + ' did not boot');
    if (opts.ns !== null) fr.boot(opts.ns || ('n-' + id), opts.fast);
    return fr;
  }
  // sign a frame in through its own button (opens 내 기록 first, as a player does)
  async function signIn(fr, uid, wantSt) {
    F.prof(fr.prof).next = uid;
    if (!fr.recShown()) await fr.rec(true);
    await until(() => fr.st().parts[1], 3000);
    fr.C().click();
    return until(() => fr.st().st === (wantSt || 'in') && (wantSt || fr.st().cs), 5000);
  }
  const settle = (fr, ms) => until(() => { const s = fr.st(); return s.st === 'in' && !s.push && !s.dirty && s.live; }, ms || 4000);

  // ================================================================ 1. inert on the artifact skeleton (this page)
  function inertTests() {
    const C = PG.debug.cloud, T = PG.debug.tro, st = C.state();
    ok('inert: the cloud is off on the artifact skeleton (no PG_CLOUD)', st.on === false && st.st === 'off' && window.PG_CLOUD === undefined, st);
    ok('inert: #pg-cloud, #pg-cloud-btn and #pg-tro-cloud are hidden', $('pg-cloud').hidden && $('pg-cloud-btn').hidden && $('pg-tro-cloud').hidden);
    ok('inert: the card has no has-cloud, the badge its plain aria-label', !document.querySelector('.pg-rec-card').classList.contains('has-cloud') && /^내 트로피 [\d,]+개 · [^·]+ · 마이페이지 열기$/.test($('pg-tro').getAttribute('aria-label')), $('pg-tro').getAttribute('aria-label'));
    ok('inert: #pg-fontwarm lacks 구글로 로그인', $('pg-fontwarm').textContent.indexOf('구글로 로그인') < 0);
    // (친구 순위, design/friends.md 6: nothing of it on the artifact)
    const ps0 = PG.debug.pal.state();
    ok('inert: no 친구 순위 here - no #pg-pal-btn, no 마이페이지 친구 button, no #pg-pal, no panel made, no dot', !$('pg-pal-btn') && !$('pg-my-pal') && !ps0.myBtn && !$('pg-pal') && !ps0.made && !ps0.btn && !ps0.demo && !ps0.code, ps0);
    ok('inert: no ppogeul-stage / ppogeul-pal key from the boot, no 친구 순위 text warmed', !Object.keys(localStorage).some((k) => /^ppogeul-(stage|pal)/.test(k)) && $('pg-fontwarm').textContent.indexOf('혼자 하기 최고 기록') < 0);
    ok('inert: no 친구 초대 banner, room button or sign-in card; no invites listener; online not gated', !$('pg-iv') && !$('pg-room-iv') && !$('pg-net-gate') && !PG.debug.pal.iv().on && !PG.debug.mp.state().gated);
    ok('inert: no profiles / codes / reqs / friends call', !F.calls.some((c) => /(profiles|codes|reqs|friends|outbox)\//.test(c.path || '')));
    T.openRec();
    const s2 = C.state();
    ok('inert: 내 기록 loads nothing (no script element, no loader call)', s2.loads === 0 && s2.parts.every((p) => !p) && ![...document.scripts].some((s) => s.src) && !performance.getEntriesByType('resource').some((r) => /compat\.js|firebase/i.test(r.name)) && $('pg-cloud').hidden && $('pg-cloud-btn').hidden, s2);
    T.closeRec();
    ok('inert: no ppogeul-cloud* / ppogeul-guest* keys', !Object.keys(localStorage).some((k) => /^ppogeul-(cloud|guest)/.test(k)), Object.keys(localStorage));
    let raw = null; try { raw = JSON.parse(localStorage.getItem(T.state().key)); } catch (e) { raw = null; }
    ok('inert: the trophy JSON has no cs key', raw && !('cs' in raw), raw);
    // even a store that somehow carries a link record stays inert here (troParse keeps it, nothing acts on it)
    const cs = { u: 'uid1', k: 'abcdefgh', c: { t: 0, w: 0, g: 0, ko: 0, de: 0, day: 0 }, v: { t: 30, w: 0, g: 0, ko: 0, de: 0, day: 0 }, m: { n: 0 }, n: 0, mt: 0 };
    localStorage.setItem('ppogeul-trophy-inertcs', JSON.stringify({ v: 1, dev: 'abcdefgh', t: 30, best: 30, bl: 0, w: 0, g: 0, ko: 0, day: 0, de: 0, seen: 1, esc: [], cs }));
    T.ns('inertcs'); T.openRec();
    const s3 = C.state();
    ok('inert: a linked store on the artifact: still off, nothing loaded or shown', s3.st === 'off' && s3.loads === 0 && $('pg-tro-cloud').hidden && $('pg-cloud-btn').hidden, s3);
    T.closeRec(); T.ns('inert2');
  }

  // ================================================================ 2. the pure parts (the design's simulation, 6.2)
  function pureTests() {
    const C = PG.debug.cloud, T = PG.debug.tro, TS = F.TS, DAY = 20261016;
    T.today(DAY);
    const srv = { doc: null, now: 1.7e12 }, UID = 'uid1';
    let keyN = 0;
    const KEYS = ['kaaaaaa1', 'kbbbbbb2', 'kcccccc3', 'kdddddd4', 'keeeeee5'];
    const dev = (t) => ({ S: { v: 1, dev: 'abcd1234', t, best: t, bl: 0, w: 0, g: 0, ko: 0, day: DAY, de: 0, seen: 1, esc: [] }, cs: null, hi: 0 });
    const cnt = (x) => ({ t: x.t, w: x.w, g: x.g, ko: x.ko, de: x.de, day: x.day });
    const D = () => C.doc(F.clone(srv.doc));
    const write = (doc, opName) => { const why = F.rules(opName, UID, UID, srv.doc, doc, srv.now); if (!why) srv.doc = doc; return why; };
    function create(d) {
      const k = KEYS[keyN++], S = d.S, slot = { t: S.t, w: Math.min(S.w, S.g), g: S.g, ko: S.ko, best: Math.max(S.best, S.t), bl: S.bl, seen: S.seen, hi: d.hi, day: S.day, de: S.de, n: 1 };
      const why = write({ v: 1, dev: S.dev, s: { [k]: Object.assign({}, slot, { at: new TS(srv.now) }) }, last: k, updatedAt: new TS(srv.now) }, 'create');
      d.cs = { u: UID, k, c: cnt(slot), v: cnt(S), m: slot, n: 1, mt: srv.now + 1 };
      return why;
    }
    const join = (d) => { d.cs = C.adopt(d.S, { u: UID, k: KEYS[keyN++], c: null, v: null, m: C.zero(), n: 0, mt: 0 }, D(), d.hi, true, false); };
    const adopt = (d) => { d.cs = C.adopt(d.S, d.cs, D(), d.hi, false, false); };
    // one write of d's slot as clPush makes it; returns '' (written), 'none', 'wait' or the rules' refusal
    function push(d, cs) {
      cs = cs || d.cs;
      const st = C.step(C.mine(d.S, cs, d.hi), cs.m, cs.n, srv.now, cs.mt);
      if (!st) return 'none'; if (st.wait) return 'wait';
      cs.n = Math.max(cs.n, st.slot.n);
      // (as clPush: this page's first slot write makes an older document v 4 - the 뽑기's, gacha.md 7.1)
      const doc = F.applyUpdate(srv.doc, Object.assign({ ['s.' + cs.k]: Object.assign({}, st.slot, { at: { _fv: 'x' } }), last: cs.k, updatedAt: null }, srv.doc.v < 4 ? { v: 4 } : {}), srv.now);
      doc.s[cs.k].at = new TS(srv.now); doc.updatedAt = new TS(srv.now);
      const why = write(doc, 'update');
      if (!why) { cs.m = Object.assign({}, st.slot); cs.mt = srv.now + 1; }
      return why;
    }
    const tick = (ms) => { srv.now += ms; };
    const sum = () => Object.keys(srv.doc.s).reduce((a, k) => a + srv.doc.s[k].t, 0);
    // push until nothing is dirty, with the doc-level 2 s between writes
    function drain(devs) { let n = 0; for (let i = 0; i < 400; i++) { let any = false; for (const d of devs) { tick(2600); const r = push(d); if (r === '') { n++; any = true; } else if (r !== 'none' && r !== 'wait') return -1; } for (const d of devs) adopt(d); if (!any && devs.every((d) => !C.step(C.mine(d.S, d.cs, d.hi), d.cs.m, d.cs.n, Infinity, 0))) return n; } return -2; }

    // a. two devices at once: + and -
    const A = dev(100); ok('pure: the first device creates the document (rules: create)', create(A) === '', srv.doc);
    const B = dev(55); join(B);
    ok('pure: a second device joins: cloud wins (view = the account\'s 100, mine 0)', B.S.t === 100 && B.cs.m.n === 0 && B.cs.c.t === 0, [B.S.t, B.cs]);
    A.S.t += 20; B.S.t -= 6; A.S.g++; A.S.w++; B.S.g++;
    let n = drain([A, B]);
    ok('pure: concurrent +20 / -6: both views 114 = the sum of the slots', n > 0 && A.S.t === 114 && B.S.t === 114 && sum() === 114 && A.S.g === 2 && B.S.g === 2 && A.S.w === 1, [n, A.S.t, B.S.t, sum()]);
    // b. offline for 3 battles
    B.S.t += 10; B.S.g++; B.S.t -= 6; B.S.g++; B.S.t += 14; B.S.g++; B.S.w++;
    A.S.t += 15; tick(3000); push(A); adopt(A);
    n = drain([A, B]);
    ok('pure: a device offline for 3 battles (+18) while the other got +15: both 147, nothing lost', A.S.t === 147 && B.S.t === 147 && sum() === 147 && A.S.g === 5 && B.S.w === 2, [A.S.t, B.S.t, sum(), A.S.g]);
    // c. +164 right after a write: parts, all of it arrives
    tick(3000); A.S.t += 1; push(A); tick(500); A.S.t += 164;
    const w0 = push(A);
    let parts = 0; for (let i = 0; i < 40; i++) { tick(2600); const r = push(A); if (r === '') parts++; else if (r === 'none') break; }
    adopt(A); adopt(B);
    ok('pure: +164 half a second after a write: "wait", then rate-capped parts (rules accept each), all of it arrives', w0 === 'wait' && parts >= 2 && sum() === 312 && A.S.t === 312 && B.S.t === 312, [w0, parts, sum()]);
    info('pure: +164 went in ' + parts + ' writes');
    // d. adopting twice changes nothing
    const snapA = JSON.stringify([A.S, A.cs]); adopt(A);
    ok('pure: adopting the same document twice is a no-op', JSON.stringify([A.S, A.cs]) === snapA);
    // e. two tabs of one browser racing on one slot with the same n: the rules refuse the second
    tick(3000); A.S.t += 3;
    const csCopy = JSON.parse(JSON.stringify(A.cs));
    const r1 = push(A), r2 = (tick(2500), push(A, csCopy));
    ok('pure: two tabs sending the same n: the second is refused (never a stale overwrite)', r1 === '' && r2 === 'update' && sum() === 315, [r1, r2, sum()]);
    adopt(A); adopt(B);
    // f. a debt: both lose more than the account has
    const acct = sum(); A.S.t -= acct - 10; tick(3000); push(A); adopt(A); adopt(B);
    ok('pure: (the account down to 10)', A.S.t === 10 && B.S.t === 10, [A.S.t, B.S.t]);
    A.S.t -= 8; B.S.t -= 8;
    drain([A, B]);
    ok('pure: a debt: both devices lose 8 of 10: the sum is -6, both views show 0', sum() === -6 && A.S.t === 0 && B.S.t === 0, [sum(), A.S.t, B.S.t]);
    A.S.t += 10; drain([A, B]);
    ok('pure: ... and a later +10 pays the debt first: both views 4', sum() === 4 && A.S.t === 4 && B.S.t === 4, [sum(), A.S.t, B.S.t]);
    // g. today's bonus is one cap for the account; a new day starts at 0
    A.S.de = 15; A.S.t += 15; drain([A, B]);
    ok('pure: 15 of today\'s trophy bonus on one device: the other\'s view says 15 (25 left today)', B.S.de === 15 && A.S.de === 15, [A.S.de, B.S.de]);
    B.S.de += 5; B.S.t += 5; drain([A, B]);
    ok('pure: ... the other gives 5 more: 20 everywhere', A.S.de === 20 && B.S.de === 20, [A.S.de, B.S.de]);
    T.today(DAY + 1); adopt(A); adopt(B);
    ok('pure: a new day: today\'s bonus 0 on both, the day moved on', A.S.de === 0 && B.S.de === 0 && A.S.day === DAY + 1, [A.S.de, A.S.day]);
    ok('pure: a bare day change is not dirty (no write just for the date)', C.step(C.mine(A.S, A.cs, A.hi), A.cs.m, A.cs.n, Infinity, 0) !== null && pushDirty(A) === '', [pushDirty(A)]);
    // h. a fold: B's slot goes into the archive; B comes back, starts over - no double count
    const total = sum(), kb = B.cs.k, bs = srv.doc.s[kb];
    tick(8 * 864e5);
    const z = { t: bs.t, w: bs.w, g: bs.g, ko: bs.ko, best: bs.best, bl: bs.bl, seen: bs.seen, hi: bs.hi, day: 0, de: 0, n: 1, at: new TS(srv.now) };
    if (srv.doc.v >= 2) Object.assign(z, { ce: bs.ce || 0, sp: bs.sp || 0, o: (bs.o || []).slice(), bd: 0, bs: 0 });   // (a v 2 document: a v 2 archive)
    if (srv.doc.v >= 4) Object.assign(z, { dn: bs.dn || 0, gd: (bs.gd || []).slice() });                                // (v 4: + the draws, gacha.md 7.3)
    const fd = F.clone(srv.doc); delete fd.s[kb]; fd.s._ = z; fd.last = kb; fd.updatedAt = new TS(srv.now);
    ok('pure: a fold of a slot idle 8 days with exact sums (rules: fold)', write(fd, 'update') === '', srv.doc);
    const bad = F.clone(fd); bad.s._ = Object.assign({}, z, { t: z.t + 1, n: 2, at: new TS(srv.now + 3000) }); bad.updatedAt = new TS(srv.now + 3000);
    ok('pure: (an archive off by one is refused)', F.rules('update', UID, UID, srv.doc, bad, srv.now + 3000) !== '');
    const before = B.S.t; B.S.t += 7;                             // (a change B never pushed before its slot was folded)
    adopt(B);
    ok('pure: the folded device starts over: view = the sum (its pushed part is in the archive), no double count', B.S.t === total && sum() === total && B.cs.m.n === 0, [before, B.S.t, total, sum()]);
    B.S.t += 2; drain([A, B]);
    ok('pure: ... and its next change makes a fresh slot: everyone at total + 2', sum() === total + 2 && A.S.t === total + 2 && B.S.t === total + 2 && Object.keys(srv.doc.s).length === 3, [sum(), A.S.t, Object.keys(srv.doc.s)]);
    // i. hostile documents
    let threw = null, outs = [];
    const many = { v: 1, dev: 'abcd1234', s: {} }; for (let i = 0; i < 40; i++) many.s['k' + String(i).padStart(7, '0')] = { t: i };
    const hostile = [null, 5, 'x', [], { v: 5, s: {} }, { v: '1' }, { v: 1 }, { v: 1, s: [] }, { v: 1, s: 'x' }, { v: 1, dev: 'BAD', nick: { x: 1 }, s: { abcdefgh: { t: 'x', w: 9, g: 2, ko: -5, best: 1e12, bl: 99, seen: 'yes', hi: Infinity, day: NaN, de: 999, n: -3, at: { toMillis() { throw new Error('x'); } } } } },
      many, JSON.parse('{"v":1,"s":{"__proto__":{"t":5},"constructor":{"t":5},"ABCDEFGH":{"t":5},"a1":{"t":5},"_":{"t":5},"abcdefgh":[1,2]}}')];
    try { outs = hostile.map((d) => C.doc(d)); } catch (e) { threw = e; }
    ok('pure: clDoc on hostile documents never throws', !threw, threw && String(threw));
    const h9 = outs[9] && outs[9].s && outs[9].s.get('abcdefgh');
    ok('pure: ... v 5 -> "newer" (v 2: the shop, v 3: a set per animal, v 4: the 뽑기 - read), v "1" / missing / bad -> null or empty, a bad dev -> "", junk numbers clamped (w <= g, best <= 99999, bl <= 6, de <= 40)',
      outs[4] === 'newer' && outs[5] === null && outs[0] === null && outs[6] && outs[6].s.size === 0 && outs[7].s.size === 0 && outs[9].dev === '' && outs[9].nick === ''
      && h9 && h9.t === 0 && h9.w === 2 && h9.g === 2 && h9.ko === 0 && h9.best === 99999 && h9.bl === 6 && h9.seen === 1 && h9.hi === 0 && h9.day === 0 && h9.de === 40 && h9.n === 1 && h9.at === 0, h9);
    ok('pure: ... 40 slots -> at most 17 kept; only 8-char keys and "_"', outs[10].s.size <= 17 && outs[11].s.size === 1 && outs[11].s.has('_'), [outs[10].s.size, Array.from(outs[11].s.keys())]);
    // j. the link record from storage
    const csOk = C.parseCs({ u: 'uid1', k: 'abcdefgh', c: { t: -5, w: 1e9, g: 'x', ko: 1, de: 99, day: 1 }, v: { t: 1, w: 0, g: 0, ko: 0, de: 0, day: 1 }, m: { t: 3, n: 7, at: 5 }, n: 2, mt: 'x' });
    ok('pure: clParseCs clamps a record (and n >= m.n), refuses a bad uid / key / missing c or v',
      csOk && csOk.c.w === 1e7 && csOk.c.g === 0 && csOk.c.de === 40 && csOk.m.n === 7 && csOk.n === 7 && csOk.mt === 0 && !('at' in csOk.m)
      && C.parseCs({ u: 'a b', k: 'abcdefgh', c: {}, v: {} }) === null && C.parseCs({ u: 'u', k: 'ABC', c: {}, v: {} }) === null && C.parseCs({ u: 'u', k: 'abcdefgh', c: {} }) === null, csOk);
    // k. the step's caps match the rules
    const m0 = C.zero(), big = { t: 9999, w: 500, g: 400, ko: 9000, best: 9999, bl: 6, seen: 1, hi: 5, day: DAY, de: 3 };
    const s0 = C.step(big, m0, 0, 1e15, 0), s1 = C.step(big, Object.assign(C.zero(), { t: 10, w: 1, g: 2, ko: 3, n: 4 }), 4, 1e15, 1e15 - 4000);
    ok('pure: a new slot\'s first write: t <= 250, g <= 20, ko <= 400, w <= g, n 1 (rules: new)', s0.slot.t === 250 && s0.slot.g === 20 && s0.slot.ko === 400 && s0.slot.w === 20 && s0.slot.n === 1 && s0.partial, s0.slot);
    ok('pure: a step 4 s after the last: t +28 (20 + 2/s), g +20, w no more than the new games, n + 1', s1.slot.t === 10 + 28 && s1.slot.g === 22 && s1.slot.w === 21 && s1.slot.n === 5, s1.slot);
    ok('pure: within 2.5 s of the last write: wait', C.step(big, Object.assign(C.zero(), { n: 1 }), 1, 1000, 0).wait === 1500);
    T.today(null);
    // (clDirty's rule, on this simulation's own hi)
    function pushDirty(d) { const st = C.step(C.mine(d.S, d.cs, d.hi), d.cs.m, d.cs.n, Infinity, 0); if (!st) return ''; const x = st.slot, m = d.cs.m; return ['t', 'w', 'g', 'ko'].some((f) => x[f] !== m[f]) || (x.day === m.day ? x.de !== m.de : x.de > 0) ? 'hard' : ''; }
  }

  // ================================================================ 2b. v4 shop: the rules of 8.4, then 비누 코인 / items / the worn set
  // synced through the pure parts (design/shop.md 8, 16.3)
  function coinPureTests() {
    const C = PG.debug.cloud, T = PG.debug.tro, TS = F.TS, DAY = 20261020, UID = 'uidc';
    T.today(DAY);
    // ---- the rules, case by case (8.4's list)
    const T0 = 1.75e12, NOW = T0 + 10000;
    const v2s = (o) => Object.assign({ t: 10, w: 0, g: 1, ko: 0, best: 30, bl: 0, seen: 1, hi: 0, day: 0, de: 0, n: 3, at: new TS(T0), ce: 100, sp: 60, o: ['h1'], bd: DAY, bs: 1 }, o);
    const v1s = (o) => Object.assign({ t: 10, w: 0, g: 1, ko: 0, best: 30, bl: 0, seen: 1, hi: 0, day: 0, de: 0, n: 3, at: new TS(T0) }, o);
    const base = (v, s, extra) => Object.assign({ v, dev: 'abcd1234', s, last: Object.keys(s)[0], updatedAt: new TS(T0) }, extra || {});
    const K = 'kaaaaaa1', K2 = 'kbbbbbb2';
    // a write of slot K (fields over the old slot's, n + 1, at now) -> the rules' answer ('' = allowed)
    const upd = (doc, o, extra) => { const d = F.clone(doc); d.s[K] = Object.assign({}, d.s[K], o, { n: d.s[K].n + 1, at: new TS(NOW) }); if (o && o.__v1) { for (const f of ['ce', 'sp', 'o', 'bd', 'bs', '__v1']) delete d.s[K][f]; } d.last = K; d.updatedAt = new TS(NOW); Object.assign(d, extra || {}); return F.rules('update', UID, UID, doc, d, NOW); };
    const D2 = base(2, { [K]: v2s() });
    ok('rules: a purchase (one item appended, sp + exactly its price: 수경 80) is allowed', upd(D2, { o: ['h1', 'f2'], sp: 140 }) === '');
    ok('rules: two items in one write are refused', upd(D2, { o: ['h1', 'f2', 'h2'], sp: 210 }) !== '');
    ok('rules: a wrong price (79 for 수경) is refused', upd(D2, { o: ['h1', 'f2'], sp: 139 }) !== '');
    ok('rules: an o reorder or shrink is refused', upd(D2, { o: ['f2', 'h1'], sp: 140 }) !== '' && upd(D2, { o: [], sp: 60 }) !== '');
    ok('rules: an unknown id (and the starter, never sold) is refused', upd(D2, { o: ['h1', 'zz'], sp: 60 }) !== '' && upd(D2, { o: ['h1', 'n1'], sp: 60 }) !== '');
    ok('rules: a league item with too low a bl is refused (금테 양머리: 양머리 고수 = 3); with bl 3 allowed', upd(D2, { o: ['h1', 'h8'], sp: 280, bl: 2 }) !== '' && upd(D2, { o: ['h1', 'h8'], sp: 280, bl: 3 }) === '');
    ok('rules: coins earned rise by at most 30 + 1 per 2 s (10 s after the last write: +35 ok, +36 refused) and 150', upd(D2, { ce: 135 }) === '' && upd(D2, { ce: 136 }) !== '');
    ok('rules: coins earned never drop; spent coins never drop (and never move without an item)', upd(D2, { ce: 99 }) !== '' && upd(D2, { sp: 50 }) !== '' && upd(D2, { sp: 61 }) !== '');
    ok('rules: the bonus day never goes back (later: ok)', upd(D2, { bd: DAY - 1 }) !== '' && upd(D2, { bd: DAY + 1, bs: 2 }) === '');
    ok('rules: a v 2 slot written back in the v 1 shape is refused', upd(D2, { __v1: 1 }) !== '');
    const D1 = base(1, { [K]: v1s() });
    ok('rules: an old page\'s v 1 write into a v 1 document is still allowed', upd(D1, { __v1: 1, t: 12 }) === '');
    ok('rules: ... into a v 2 document refused', upd(base(2, { [K]: v1s() }), { __v1: 1, t: 12 }) !== '');
    const up = (doc, o, extra) => { const d = F.clone(doc); d.s[K] = Object.assign({ ce: 0, sp: 0, o: [], bd: 0, bs: 0 }, d.s[K], o, { n: d.s[K].n + 1, at: new TS(NOW) }); d.last = K; d.updatedAt = new TS(NOW); Object.assign(d, extra || {}); return F.rules('update', UID, UID, doc, d, NOW); };
    ok('rules: the v 1 -> v 2 upgrade with a v 2 slot write is allowed (coins from 0: <= 35 here, one item)', up(D1, { ce: 30 }, { v: 2 }) === '' && up(D1, { ce: 30, o: ['h1'], sp: 60 }, { v: 2 }) === '');
    ok('rules: ... but not without the slot in the v 2 shape, and never v 2 -> 1', up(D1, { t: 12 }, { v: 2 }) === '' && upd(D1, { __v1: 1, t: 12 }, { v: 2 }) !== '' && upd(D2, { ce: 101 }, { v: 1 }) !== '');
    const eqw = (doc, eq) => { const d = F.clone(doc); d.eq = eq; d.updatedAt = new TS(NOW); return F.rules('update', UID, UID, doc, d, NOW); };
    ok('rules: an eq-only write is allowed; an eq of 6 characters, upper case or a number is refused', eqw(D2, 'a0300') === '' && eqw(D2, '100000') !== '' && eqw(D2, 'A0300') !== '' && eqw(D2, 12345) !== '');
    ok('rules: the nick and the worn set alone in one write (two metadata keys) are refused', (() => { const d = F.clone(D2); d.eq = '10000'; d.nick = '뽀숑'; d.updatedAt = new TS(NOW); return F.rules('update', UID, UID, D2, d, NOW) !== ''; })());
    // a browser's first write into a v 2 document
    const nw = (o) => { const d = F.clone(D2); d.s[K2] = Object.assign(v2s({ t: 0, g: 0, best: 0, ce: 0, sp: 0, o: [], bd: 0, bs: 0 }), o, { n: 1, at: new TS(NOW) }); d.last = K2; d.updatedAt = new TS(NOW); return F.rules('update', UID, UID, D2, d, NOW); };
    ok('rules: a new slot starts with at most 150 coins and at most one item at exactly its price', nw({ ce: 150 }) === '' && nw({ ce: 151 }) !== '' && nw({ o: ['h2'], sp: 70 }) === '' && nw({ o: ['h2', 'h3'], sp: 150 }) !== '' && nw({ o: ['h2'], sp: 71 }) !== '');
    // creating a document: an old page's v 1, this page's v 2 (with its worn set)
    const cr = (d) => F.rules('create', UID, UID, null, Object.assign(F.clone(d), { updatedAt: new TS(NOW), s: { [K]: Object.assign(F.clone(d.s[K]), { n: 1, at: new TS(NOW) }) } }), NOW);
    ok('rules: an old page creates a v 1 document (allowed, no eq); a v 1 document with an eq is refused', cr(base(1, { [K]: v1s() })) === '' && cr(base(1, { [K]: v1s() }, { eq: '10000' })) !== '');
    ok('rules: this page creates a v 2 document with any coins / items (the first upload is trusted) and its eq; a bad eq is refused', cr(base(2, { [K]: v2s({ ce: 99999, sp: 1260, o: ['h1', 'hc'] }) }, { eq: 'c0000' })) === '' && cr(base(2, { [K]: v2s() }, { eq: 'c00000' })) !== '' && cr(base(2, { [K]: v1s() })) !== '');
    // folds (a slot quiet for 8 days): of a v 2 slot, of a v 1-shaped one in a v 2 document
    const old = new TS(NOW - 8 * 864e5), F2 = base(2, { [K]: v2s({ at: old, ce: 300, sp: 140, o: ['h1', 'f2'] }), [K2]: v2s({ t: 3, at: new TS(T0), o: [], sp: 0, ce: 5 }), _: v2s({ n: 2, t: 4, ce: 50, sp: 70, o: ['h2'], bd: 0, bs: 0, at: old }) });
    F2.last = K2;
    const fold = (doc, z) => { const d = F.clone(doc); delete d.s[K]; d.s._ = Object.assign(z, { at: new TS(NOW) }); d.last = K; d.updatedAt = new TS(NOW); return F.rules('update', UID, UID, doc, d, NOW); };
    const zz = (a, b) => ({ t: a.t + b.t, w: a.w + b.w, g: a.g + b.g, ko: a.ko + b.ko, best: Math.max(a.best, b.best), bl: Math.max(a.bl, b.bl), seen: Math.max(a.seen, b.seen), hi: Math.max(a.hi, b.hi), day: 0, de: 0, n: a.n + 1 });
    const z2 = Object.assign(zz(F2.s._, F2.s[K]), { ce: 350, sp: 210, o: ['h2', 'h1', 'f2'], bd: 0, bs: 0 });
    ok('rules: a fold of a v 2 slot: coins summed, items the union, no bonus day (allowed); off by one coin or an item short refused',
      fold(F2, F.clone(z2)) === '' && fold(F2, Object.assign(F.clone(z2), { ce: 351 })) !== '' && fold(F2, Object.assign(F.clone(z2), { o: ['h2', 'h1'] })) !== '' && fold(F2, Object.assign(F.clone(z2), { bd: DAY })) !== '');
    const F3 = base(2, { [K]: v1s({ at: old }), [K2]: v2s({ at: new TS(T0) }) }); F3.last = K2;
    // ---- v 3 (looks-per-animal.md 6.6): a worn set per animal - eq is 30 characters in a v 3 document
    const X30 = '10000'.repeat(6), D3 = base(3, { [K]: v2s() }, { eq: X30 }), D2e = base(2, { [K]: v2s() }, { eq: '10000' });
    const eqv = (doc, eq, v) => { const d = F.clone(doc); d.eq = eq; d.v = v; d.updatedAt = new TS(NOW); return F.rules('update', UID, UID, doc, d, NOW); };
    ok('rules v3: create v 3 with 30 characters (allowed), with 5 (refused), without eq (allowed)', cr(base(3, { [K]: v2s() }, { eq: X30 })) === '' && cr(base(3, { [K]: v2s() }, { eq: '10000' })) !== '' && cr(base(3, { [K]: v2s() })) === '');
    ok('rules v3: an eq-only write of 30 characters into v 3 (allowed); of 5, 29, 31 or upper case (refused)', eqw(D3, '20000'.repeat(6)) === '' && eqw(D3, '20000') !== '' && eqw(D3, X30.slice(1)) !== '' && eqw(D3, X30 + '0') !== '' && eqw(D3, 'A' + X30.slice(1)) !== '');
    ok('rules v3: an eq-only upgrade v 2 -> 3 with 30 characters (allowed), with 5 (refused)', eqv(D2e, X30, 3) === '' && eqv(D2e, '10000', 3) !== '');
    ok('rules v3: a slot write upgrading v 2 -> 3 keeping the 5-character eq (refused), with eq replaced by 30 (allowed), into a v 2 document without eq (allowed)',
      up(D2e, { ce: 120 }, { v: 3 }) !== '' && up(D2e, { ce: 120 }, { v: 3, eq: X30 }) === '' && up(D2, { ce: 120 }, { v: 3 }) === '');
    ok('rules v3: v 1 -> 3 with a slot write (allowed); v 3 -> 2 (refused); v 2.5 (refused)', up(D1, { ce: 30 }, { v: 3 }) === '' && upd(D3, { ce: 101 }, { v: 2 }) !== '' && up(D2, { ce: 120 }, { v: 2.5 }) !== '');
    ok('rules v3: a v 2-shaped slot write into v 3 (allowed), a v 1-shaped one (refused)', upd(D3, { o: ['h1', 'f2'], sp: 140 }) === '' && upd(D3, { __v1: 1, t: 12 }) !== '');
    const F3v = base(3, { [K]: v2s({ at: old, ce: 300, sp: 140, o: ['h1', 'f2'] }), [K2]: v2s({ t: 3, at: new TS(T0), o: [], sp: 0, ce: 5 }), _: v2s({ n: 2, t: 4, ce: 50, sp: 70, o: ['h2'], bd: 0, bs: 0, at: old }) }, { eq: X30 }); F3v.last = K2;
    ok('rules v3: a fold in v 3 (allowed); a v 2 page\'s eq-only write into a v 2 document (unchanged: allowed)', fold(F3v, F.clone(z2)) === '' && eqw(D2e, '20000') === '');
    // ---- v 4 (design/gacha.md 7.3, every case of 7.6): each slot also counts its draws (dn) and lists its drawn items (gd)
    const v4s = (o) => Object.assign(v2s({ sp: 260 }), { dn: 1, gd: ['f9'] }, o);         // (sp: h1 60 + one draw 200)
    const D4 = base(4, { [K]: v4s() }, { eq: X30 });
    const rw = (doc, slot, extra) => { const d = F.clone(doc); d.s[K] = Object.assign(slot, { n: doc.s[K].n + 1, at: new TS(NOW) }); d.last = K; d.updatedAt = new TS(NOW); Object.assign(d, extra || {}); return F.rules('update', UID, UID, doc, d, NOW); };
    ok('rules v4: one draw (dn + 1, sp + 200, gd + 1 pool id) allowed; a duplicate draw (dn + 1, sp + 200, gd unchanged, its refund ce + 30) allowed',
      upd(D4, { dn: 2, sp: 460, gd: ['f9', 'hd'] }) === '' && upd(D4, { dn: 2, sp: 460, ce: 130 }) === '');
    ok('rules v4: ten draws with 6 new items (sp + 2,000) allowed; 11 draws refused', upd(D4, { dn: 11, sp: 2260, gd: ['f9', 'hd', 'he', 'f8', 'n9', 'na', 'b8'] }) === '' && upd(D4, { dn: 12, sp: 2460 }) !== '');
    ok('rules v4: one draw with 2 new items refused; a gd item outside the pool (h8, n1, zz) refused', upd(D4, { dn: 2, sp: 460, gd: ['f9', 'hd', 'he'] }) !== '' &&
      ['h8', 'n1', 'zz'].every((id) => upd(D4, { dn: 2, sp: 460, gd: ['f9', id] }) !== ''));
    ok('rules v4: gd reordered, shrunk or with a duplicate refused', upd(D4, { dn: 3, sp: 660, gd: ['hd', 'f9'] }) !== '' && upd(D4, { dn: 2, sp: 460, gd: [] }) !== '' && upd(D4, { dn: 2, sp: 460, gd: ['f9', 'f9'] }) !== '');
    ok('rules v4: sp + 199 or + 201 for one draw refused; a draw and a purchase in one write (sp + 200 + 70) allowed',
      upd(D4, { dn: 2, sp: 459 }) !== '' && upd(D4, { dn: 2, sp: 461 }) !== '' && upd(D4, { dn: 2, sp: 530, o: ['h1', 'h2'] }) === '');
    ok('rules v4: a draw-only id appended to o (with any sp) refused', [260, 460, 500].every((sp) => upd(D4, { o: ['h1', 'hd'], sp }) !== '' && upd(D4, { o: ['h1', 'hd'], sp, dn: 2 }) !== ''));
    ok('rules v4: dn going down refused; create with gd larger than dn refused (and with gd <= dn allowed)', upd(D4, { dn: 0, gd: [] }) !== '' &&
      cr(base(4, { [K]: v4s({ dn: 0 }) }, { eq: X30 })) !== '' && cr(base(4, { [K]: v4s({ dn: 5, sp: 1060, gd: ['f9', 'b7'] }) }, { eq: X30 })) === '');
    ok('rules v4: a v 2-shaped slot write into a v 4 document refused', rw(D4, v2s({ sp: 260 })) !== '' && rw(D4, v2s({ sp: 260, dn: 1 })) !== '');
    ok('rules v4: v 3 -> 4 by a slot write (30-character eq in place, one draw) allowed; by an eq-only write allowed; v 4 -> 3 refused',
      up(D3, { dn: 1, gd: ['f9'], sp: 260 }, { v: 4 }) === '' && eqv(D3, X30, 4) === '' && upd(D4, { ce: 101 }, { v: 3 }) !== '' && up(D3, { ce: 101 }, { v: 4 }) !== '');
    const F4 = base(4, { [K]: v4s({ at: old, dn: 3, sp: 660, gd: ['f9', 'hd'] }), [K2]: v4s({ t: 3, at: new TS(T0) }), _: v4s({ n: 2, t: 4, ce: 50, sp: 270, o: ['h2'], bd: 0, bs: 0, dn: 1, gd: ['he'], at: old }) }, { eq: X30 }); F4.last = K2;
    const z4 = Object.assign(zz(F4.s._, F4.s[K]), { ce: 150, sp: 930, o: ['h2', 'h1'], bd: 0, bs: 0, dn: 4, gd: ['he', 'f9', 'hd'] });
    ok('rules v4: a fold of a v 4 slot (draws summed, drawn items the union) allowed; a draw short or an item short refused',
      fold(F4, F.clone(z4)) === '' && fold(F4, Object.assign(F.clone(z4), { dn: 3 })) !== '' && fold(F4, Object.assign(F.clone(z4), { gd: ['he', 'f9'] })) !== '');
    const F4b = base(4, { [K]: v2s({ at: old }), [K2]: v4s({ at: new TS(T0) }) }, { eq: X30 }); F4b.last = K2;
    const z4b = Object.assign(zz({ t: 0, w: 0, g: 0, ko: 0, best: 0, bl: 0, seen: 0, hi: 0, n: 0 }, F4b.s[K]), { ce: 100, sp: 60, o: ['h1'], bd: 0, bs: 0 });
    ok('rules v4: a fold of a v 2-shaped slot in a v 4 document (the archive v 4-shaped, draws from zeros) allowed; a v 2-shaped archive refused',
      fold(F4b, Object.assign(F.clone(z4b), { dn: 0, gd: [] })) === '' && fold(F4b, F.clone(z4b)) !== '');
    ok('rules: a fold of a v 1-shaped slot in a v 2 document (it reads as no coins) is allowed', fold(F3, Object.assign(zz({ t: 0, w: 0, g: 0, ko: 0, best: 0, bl: 0, seen: 0, hi: 0, n: 0 }, F3.s[K]), { ce: 0, sp: 0, o: [], bd: 0, bs: 0 })) === '');

    // ---- the simulation: two devices of one account with coins, items and a worn set
    const srv = { doc: null, now: 1.8e12 };
    let keyN = 0;
    const KEYS = ['kcoin001', 'kcoin002', 'kcoin003'];
    const X6 = (s) => s.repeat(6);                            // (looks-per-animal.md: one set copied to all six animals)
    const dev = (ce, sp, own, eq) => ({ S: { v: 3, dev: 'abcd1234', t: 30, best: 30, bl: 0, w: 0, g: 0, ko: 0, day: DAY, de: 0, seen: 1, esc: [], ce, sp, own: own.slice(), eq: eq.length === 5 ? X6(eq) : eq, lh: 0, cd: 0, cde: 0, bd: 0, bs: 0, sh: 1, cv: 0 }, cs: null, hi: 0 });
    const D = () => C.doc(F.clone(srv.doc));
    const write = (doc, opName) => { const why = F.rules(opName, UID, UID, srv.doc, doc, srv.now); if (!why) srv.doc = doc; return why; };
    const tick = (ms) => { srv.now += ms; };
    function create(d) {
      const k = KEYS[keyN++], slot = C.upload(d.S);
      const why = write({ v: 4, dev: d.S.dev, eq: d.S.eq, s: { [k]: Object.assign({}, slot, { at: new TS(srv.now) }) }, last: k, updatedAt: new TS(srv.now) }, 'create');
      const at = { t: d.S.t, w: d.S.w, g: d.S.g, ko: d.S.ko, de: d.S.de, day: d.S.day, ce: d.S.ce, sp: d.S.sp, o: d.S.own.slice(), bd: d.S.bd, bs: d.S.bs };
      d.cs = { u: UID, k, c: Object.assign({}, at, { o: slot.o.slice() }), v: at, m: slot, n: 1, mt: srv.now + 1, ev: d.S.eq };
      return why;
    }
    const join = (d) => { d.cs = C.adopt(d.S, { u: UID, k: KEYS[keyN++], c: null, v: null, m: C.zero(), n: 0, mt: 0 }, D(), d.hi, true, false); };
    const adopt = (d) => { d.cs = C.adopt(d.S, d.cs, D(), d.hi, false, false); };
    // one write as clPush makes it (the slot, and the worn set when it changed here and the account owns its items)
    const writes = [];
    function push(d) {
      const cs = d.cs, st = C.step(C.mine(d.S, cs, d.hi), cs.m, cs.n, srv.now, cs.mt);
      if (!st) return 'none'; if (st.wait) return 'wait';
      cs.n = Math.max(cs.n, st.slot.n);
      const doc = F.applyUpdate(srv.doc, Object.assign({ ['s.' + cs.k]: Object.assign({}, st.slot, { at: { _fv: 'x' } }), last: cs.k, updatedAt: null }, srv.doc.v < 4 ? { v: 4 } : {}), srv.now);
      doc.s[cs.k].at = new TS(srv.now); doc.updatedAt = new TS(srv.now);
      const why = write(doc, 'update');
      if (!why) { writes.push({ k: cs.k, o: st.slot.o.slice(), sp: st.slot.sp, ce: st.slot.ce }); cs.m = Object.assign({}, st.slot); cs.mt = srv.now + 1; }
      return why;
    }
    function drain(devs) {
      let n = 0;
      for (let i = 0; i < 400; i++) {
        let any = false;
        for (const d of devs) { tick(2600); const r = push(d); if (r === '') { n++; any = true; } else if (r !== 'none' && r !== 'wait') return 'refused: ' + r; }
        for (const d of devs) adopt(d);
        if (!any && devs.every((d) => !C.step(C.mine(d.S, d.cs, d.hi), d.cs.m, d.cs.n, Infinity, 0))) return n;
      }
      return -2;
    }
    const sums = () => { let ce = 0, sp = 0; const o = new Set(); for (const k of Object.keys(srv.doc.s)) { const x = srv.doc.s[k]; ce += x.ce || 0; sp += x.sp || 0; for (const id of x.o || []) o.add(id); } return { ce, sp, o: [...o].sort() }; };
    const bal = (S) => Math.max(0, Math.min(99999, S.ce - S.sp));
    // a. the first device uploads its store: coins, items and the worn set
    const A = dev(500, 60, ['h1'], '10000');
    ok('coins: the first device creates a v 4 document with its coins, items and worn sets (rules: create)', create(A) === '' && srv.doc.v === 4 && srv.doc.eq === X6('10000') && srv.doc.s[A.cs.k].ce === 500 && srv.doc.s[A.cs.k].sp === 60 && J(srv.doc.s[A.cs.k].o) === '["h1"]', srv.doc);
    // b. a second device joins: cloud wins - the account's coins, items and worn set (its own put aside by the game)
    const B = dev(999, 0, ['hc'], 'c0000');
    join(B);
    ok('coins: a joining device takes the account\'s coins (440), items (h1) and worn set (10000) - none of its own', bal(B.S) === 440 && J(B.S.own) === '["h1"]' && B.S.eq === X6('10000') && B.cs.ev === X6('10000'), [bal(B.S), B.S.own, B.S.eq]);
    ok('coins: ... and it writes nothing until it changes something (not dirty)', C.dirty(Object.assign({}, B.S, { cs: B.cs })) === '', C.mine(B.S, B.cs, 0));
    const snapB = JSON.stringify([B.S, B.cs]); adopt(B);
    ok('coins: adopting the same document twice is a no-op', JSON.stringify([B.S, B.cs]) === snapB);
    // c. both earn and buy while apart: B +30 and 수경 (80); A two items offline (h2 70, h3 80)
    B.S.ce += 30; B.S.sp += 80; B.S.own.push('f2');
    A.S.sp += 70; A.S.own.push('h2'); A.S.sp += 80; A.S.own.push('h3');
    writes.length = 0;
    const n1 = drain([A, B]), su = sums();
    ok('coins: after both sync, the account = the sums: 530 earned, 290 spent, 4 items - on both views', n1 > 0 && su.ce === 530 && su.sp === 290 && J(su.o) === '["f2","h1","h2","h3"]' && bal(A.S) === 240 && bal(B.S) === 240 && J([...A.S.own].sort()) === J(su.o) && J([...B.S.own].sort()) === J(su.o), [n1, su, bal(A.S), bal(B.S), A.S.own, B.S.own]);
    const aw = writes.filter((w) => w.k === A.cs.k);
    ok('coins: two items bought offline went in two writes, one item each, sp exactly +70 then +80', aw.length >= 2 && aw[0].o.length === 2 && aw[0].sp === 130 && aw[1].o.length === 3 && aw[1].sp === 210, aw);
    const inv = (d) => { const mi = C.mine(d.S, d.cs, 0), m = d.cs.m; return mi.sp - (m.sp || 0) === mi.o.filter((id) => !(m.o || []).includes(id)).reduce((s, id) => s + PG.debug.shop.items().find((it) => it.id === id).price, 0); };
    ok('coins: the invariant mine.sp - m.sp = the prices of the items not yet written holds (in sync: 0 = 0)', inv(A) && inv(B));
    // d. the same item bought on two devices while apart: owned once, paid twice (shop.md 8.2, 13)
    A.S.sp += 90; A.S.own.push('h4'); B.S.sp += 90; B.S.own.push('h4');
    drain([A, B]);
    const su2 = sums();
    ok('coins: the same item bought on both devices: owned once, its price spent twice (accepted)', su2.o.filter((id) => id === 'h4').length === 1 && su2.sp === 290 + 180 && bal(A.S) === 60 && bal(B.S) === 60, [su2, bal(A.S)]);
    // e. a debt: both spend the same coins offline (100: A 하트 볼터치 60, B 수건 목도리 70) -> the balance shows 0, later
    // coins pay the debt first
    A.S.ce += 40; drain([A, B]);
    A.S.sp += 60; A.S.own.push('f1'); B.S.sp += 70; B.S.own.push('n2');
    drain([A, B]);
    ok('coins: a debt (130 spent of 100 on two devices): the balance 0 everywhere, the 30 in the sums', bal(A.S) === 0 && bal(B.S) === 0 && sums().sp - sums().ce === 30, [bal(A.S), bal(B.S), sums()]);
    A.S.ce += 100; drain([A, B]);
    ok('coins: ... and a later +100 pays it first: 70 on both', bal(A.S) === 70 && bal(B.S) === 70, [bal(A.S), bal(B.S)]);
    // f. a big gain: the rate cap splits it; every part accepted
    writes.length = 0; const b0 = bal(B.S);
    A.S.ce += 400; tick(3000); push(A); tick(500);
    let parts = 0; for (let i = 0; i < 60; i++) { tick(2600); const r = push(A); if (r === '') parts++; else if (r === 'none') break; else if (r !== 'wait') { parts = -1; break; } }
    adopt(A); adopt(B);
    ok('coins: +400 at once goes up in rate-capped parts (<= 150 and 30 + 1 per 2 s each), the rules take every one, all of it arrives', parts >= 2 && writes.every((w, i) => i === 0 || w.ce - writes[i - 1].ce <= 150) && bal(B.S) === b0 + 400, [parts, writes.map((w) => w.ce), bal(B.S), b0]);
    // g. the worn set: the account's unless a change here is waiting to go up
    srv.doc.eq = X6('30000'); adopt(A);
    ok('eq: no change waiting here -> the account\'s worn sets are taken (30000 x 6), in step', A.S.eq === X6('30000') && A.cs.ev === X6('30000'), [A.S.eq, A.cs.ev]);
    B.S.eq = X6('20000');                                      // (a change on B, not sent yet)
    srv.doc.eq = X6('40000'); adopt(B);
    ok('eq: a change waiting here is kept over the account\'s (20000 stays, still to go up)', B.S.eq === X6('20000') && B.cs.ev !== B.S.eq, [B.S.eq, B.cs.ev]);
    srv.doc.eq = X6('20000'); adopt(B);
    ok('eq: ... once the account has it, in step', B.S.eq === X6('20000') && B.cs.ev === X6('20000'));
    srv.doc.eq = X6('c0000'); adopt(A);
    ok('eq: a worn item the account does not own is stripped (황금 대야 투구) on every animal', A.S.eq === X6('00000'), A.S.eq);
    // (looks-per-animal.md 6.3) per character against the ACKNOWLEDGED set: a change here on the duck and the account's
    // on the cat -> both; my own write echoed while pending never moves the base; refused -> mine stays, sent again
    const b30 = X6('00000'), du = '20000' + b30.slice(5), ca = b30.slice(0, 20) + '30000' + '00000', both = '20000' + b30.slice(5, 20) + '30000' + '00000';
    srv.doc.eq = b30; adopt(A);
    A.S.eq = du; srv.doc.eq = ca; adopt(A);
    ok('eq: the duck dressed here, the cat by the account -> both kept (per character); the base is the account\'s', A.S.eq === both && A.cs.ev === ca, [A.S.eq, A.cs.ev]);
    const ev0 = A.cs.ev; srv.doc.eq = both; A.cs = C.adopt(A.S, A.cs, D(), A.hi, false, true);
    ok('eq: my own write echoed while pending: mine, the base does not move', A.S.eq === both && A.cs.ev === ev0, [A.S.eq, A.cs.ev]);
    srv.doc.eq = ev0; adopt(A);
    ok('eq: ... that write refused, the next snapshot shows the old set: mine stays, still to go up', A.S.eq === both && A.cs.ev === ev0 && A.S.eq !== A.cs.ev, [A.S.eq, A.cs.ev]);
    const snapE = JSON.stringify([A.S.eq, A.cs.ev]); adopt(A);
    ok('eq: a snapshot adopted again with nothing new is a no-op', JSON.stringify([A.S.eq, A.cs.ev]) === snapE);
    const M = C.looksMerge;
    ok('looksMerge: nothing here -> remote; mine, remote unchanged -> mine; different animals -> both; no base / no remote -> local; merge(x, b, b) = x',
      M(b30, b30, ca) === ca && M(du, b30, b30) === du && M(du, b30, ca) === both && M(du, '', ca) === du && M(du, b30, '') === du && M(du, ca, ca) === du && M(M(du, b30, ca), b30, ca) === both);
    ok('looksParse: 5 characters -> x 6, junk per chunk, 29 / 31 / a number -> bare', C.looksParse('10100') === X6('10100') && C.looksParse('zz' + X6('10000').slice(2)) === '00000' + X6('10000').slice(5) && C.looksParse(X6('10000').slice(1)) === b30 && C.looksParse(X6('10000') + '1') === b30 && C.looksParse(7) === b30);
    // h. the day bonus: another slot's bd far ahead (a wrong clock) is skipped; this slot keeps the max of its own
    const hdoc = F.clone(srv.doc); Object.assign(hdoc.s[A.cs.k], { bd: DAY, bs: 2 }); hdoc.s.kcoin009 = Object.assign(F.clone(hdoc.s[A.cs.k]), { ce: 0, sp: 0, o: [], t: 0, bd: 20311020, bs: 5, n: 1 });
    const BS = F.clone(B.S); C.adopt(BS, F.clone(B.cs), C.doc(hdoc), 0, false, false);
    ok('day: another slot\'s bonus day 5 years ahead is skipped by the account (the view takes today\'s, streak 2)', BS.bd === DAY && BS.bs === 2, [BS.bd, BS.bs]);
    const m0 = Object.assign(C.zero(), { n: 3, bd: 20311020, bs: 4 }), st0 = C.step(Object.assign(C.mine(B.S, B.cs, 0), { bd: DAY, bs: 1 }), m0, 3, 1e15, 1e15 - 5000);
    ok('day: this slot\'s own write keeps max(m.bd, the bonus paid now) - the rules want it never to go back', !!st0 && st0.slot.bd === 20311020 && st0.slot.bs === 4, st0 && st0.slot);
    // i. a v1 link record (from before the shop): every coin of the store is this browser's
    const v1cs = C.parseCs({ u: UID, k: 'kold0001', c: { t: 5, w: 0, g: 1, ko: 0, de: 0, day: DAY }, v: { t: 35, w: 0, g: 1, ko: 0, de: 0, day: DAY }, m: { n: 2, t: 5, g: 1 }, n: 2, mt: 1 });
    const mi = C.mine({ t: 35, w: 0, g: 1, ko: 0, best: 35, bl: 0, seen: 1, day: DAY, de: 0, ce: 120, sp: 60, own: ['h1'], bd: DAY, bs: 1 }, v1cs, 0);
    const v2cs = C.parseCs({ u: UID, k: 'kold0002', c: { t: 5 }, v: { t: 5 }, m: { n: 1 }, n: 1, mt: 1, ev: '10300' });
    ok('migration: a v 2 link record\'s 5-character ev reads as all six (so S.eq === cs.ev survives the store\'s own copy)', v2cs && v2cs.ev === X6('10300') && v2cs.ev === C.looksParse('10300'), v2cs && v2cs.ev);
    ok('migration: a v1 link record parses with no coins; its store\'s 120 earned / 60 spent / h1 are this browser\'s part', v1cs && v1cs.c.ce === 0 && v1cs.m.ce === 0 && J(v1cs.m.o) === '[]' && v1cs.ev === '' && mi.ce === 120 && mi.sp === 60 && J(mi.o) === '["h1"]', [v1cs, mi]);
    // j. the documents
    const hd = C.doc({ v: 2, dev: 'abcd1234', eq: 'zzyzy', s: { kxxxxxx1: { t: 1, ce: -5, sp: 2e9, o: ['h1', 'h1', 'n1', 'zz', 'constructor', 'hc'], bd: 1e12, bs: 99 } } });
    const hx = hd && hd.s.get('kxxxxxx1');
    const d3 = C.doc({ v: 3, eq: X6('10300'), s: {} }), d3b = C.doc({ v: 3, eq: '10300', s: {} }), d2 = C.doc({ v: 2, eq: '10300', s: {} }), d2b = C.doc({ v: 2, eq: X6('10300'), s: {} }), d1 = C.doc({ v: 1, s: {} });
    ok('clDoc: v 3 takes 30 characters (5 there: none), v 2 takes 5 copied to all six (30 there: none); hasEq says whether the field is there', d3.eq === X6('10300') && d3.hasEq && d3b.eq === '' && d3b.hasEq && d2.eq === X6('10300') && d2b.eq === '' && d1.eq === '' && !d1.hasEq, [d3, d3b, d2, d2b, d1].map((x) => x && x.eq));
    ok('clDoc: v 1, 2, 3 and 4 are read, 5 is "newer"; a hostile slot\'s coins / items / bonus clamped like the rules', C.doc({ v: 5, s: {} }) === 'newer' && C.doc({ v: 3, s: {} }).v === 3 && C.doc({ v: 1, s: {} }).v === 1 && hd.v === 2 && hd.eq === X6('00000') && hx.ce === 0 && hx.sp === 1e9 && J(hx.o) === '["h1","hc"]' && hx.bd === 99991231 && hx.bs === 5, [hd && hd.eq, hx]);
    T.today(null);
  }

  // ================================================================ 3. the deploy fixture at boot and 내 기록's warm-up
  // ================================================================ 2c. the 뽑기 in the cloud, pure (design/gacha.md 7.2, 13.2)
  // two devices of one account with draws, through the real clMine / clStep / clAdopt / clUpload and the rules port:
  // a first upload with draws, a join (the pity starts over), one write per <= 10 draws, gd items <= draws, sp exact and
  // never above what was spent, refunds under the coin cap (a 10회 of duplicates: about 50 writes, all taken), two
  // devices drawing offline, the same item drawn on both
  function drawPureTests() {
    const C = PG.debug.cloud, DR = PG.debug.draw, TS = F.TS, DAY = 20261021, UID = 'uidd';
    PG.debug.tro.today(DAY);
    const srv = { doc: null, now: 1.85e12 }, KEYS = ['kdraw001', 'kdraw002', 'kdraw003'], writes = [];
    let keyN = 0;
    const X30 = '0'.repeat(30);
    const dev = (o) => ({ S: Object.assign({ v: 4, dev: 'abcd1234', t: 30, best: 30, bl: 0, w: 0, g: 0, ko: 0, day: DAY, de: 0, seen: 1, esc: [], ce: 0, sp: 0, own: [], eq: X30, lh: 0, cd: 0, cde: 0, bd: 0, bs: 0, sh: 1, cv: 0,
      dn: 0, pt: 0, gd: [], dl: null, ds: 0, nw: [], gs: 0 }, o || {}), cs: null, hi: 0 });
    const D = () => C.doc(F.clone(srv.doc));
    const write = (doc, opName) => { const why = F.rules(opName, UID, UID, srv.doc, doc, srv.now); if (!why) srv.doc = doc; return why; };
    const tick = (ms) => { srv.now += ms; };
    function create(d) {
      const k = KEYS[keyN++], slot = C.upload(d.S);
      const why = write({ v: 4, dev: d.S.dev, eq: d.S.eq, s: { [k]: Object.assign({}, slot, { at: new TS(srv.now) }) }, last: k, updatedAt: new TS(srv.now) }, 'create');
      const at = { t: d.S.t, w: d.S.w, g: d.S.g, ko: d.S.ko, de: d.S.de, day: d.S.day, ce: d.S.ce, sp: d.S.sp, o: d.S.own.slice(), bd: d.S.bd, bs: d.S.bs, dn: d.S.dn, gd: d.S.gd.slice() };
      d.cs = { u: UID, k, c: C.cnt(slot), v: at, m: slot, n: 1, mt: srv.now + 1, ev: d.S.eq };
      return why;
    }
    const join = (d) => { d.cs = C.adopt(d.S, { u: UID, k: KEYS[keyN++], c: null, v: null, m: C.zero(), n: 0, mt: 0 }, D(), d.hi, true, false); };
    const adopt = (d) => { d.cs = C.adopt(d.S, d.cs, D(), d.hi, false, false); };
    function push(d) {
      const cs = d.cs, st = C.step(C.mine(d.S, cs, d.hi), cs.m, cs.n, srv.now, cs.mt);
      if (!st) return 'none'; if (st.wait) return 'wait';
      cs.n = Math.max(cs.n, st.slot.n);
      const doc = F.applyUpdate(srv.doc, { ['s.' + cs.k]: Object.assign({}, st.slot, { at: { _fv: 'x' } }), last: cs.k, updatedAt: null }, srv.now);
      doc.s[cs.k].at = new TS(srv.now); doc.updatedAt = new TS(srv.now);
      const m0 = cs.m, why = write(doc, 'update');
      if (!why) { writes.push({ k: cs.k, dn: st.slot.dn - (m0.dn | 0), gd: st.slot.gd.length - (m0.gd || []).length, sp: st.slot.sp - (m0.sp | 0), ce: st.slot.ce - (m0.ce | 0), o: st.slot.o.length - (m0.o || []).length }); cs.m = Object.assign({}, st.slot); cs.mt = srv.now + 1; }
      return why;
    }
    function drain(devs) {
      let n = 0;
      for (let i = 0; i < 400; i++) {
        let any = false;
        for (const d of devs) { tick(2600); const r = push(d); if (r === '') { n++; any = true; } else if (r !== 'none' && r !== 'wait') return 'refused: ' + r; }
        for (const d of devs) adopt(d);
        if (!any && devs.every((d) => !C.step(C.mine(d.S, d.cs, d.hi), d.cs.m, d.cs.n, Infinity, 0))) return n;
      }
      return -2;
    }
    const sums = () => { let dn = 0, sp = 0, ce = 0; const gd = new Set(), o = new Set(); for (const k of Object.keys(srv.doc.s)) { const x = srv.doc.s[k]; dn += x.dn || 0; sp += x.sp || 0; ce += x.ce || 0; for (const id of x.gd || []) gd.add(id); for (const id of x.o || []) o.add(id); } return { dn, sp, ce, gd: [...gd].sort(), o: [...o].sort() }; };
    const srt = (a) => a.slice().sort();
    let seed = 777; DR.rng(() => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; });
    try {
      // a. a first upload with draws: dn >= gd, the drawn items in gd, the bought one in o, sp = 3 draws + its price
      const A = dev({ ce: 6000, sp: 60, own: ['h1'] });
      for (let i = 0; i < 3; i++) DR.one(A.S, false);
      const aGd = A.S.gd.slice();
      ok('draws: a first upload with 3 draws makes a v 4 document (rules: create): dn 3 >= gd, drawn items in gd, the bought h1 in o, sp 660',
        create(A) === '' && srv.doc.v === 4 && srv.doc.s[A.cs.k].dn === 3 && J(srv.doc.s[A.cs.k].gd) === J(aGd) && J(srv.doc.s[A.cs.k].o) === '["h1"]' && srv.doc.s[A.cs.k].sp === 660 && aGd.length >= 1, srv.doc.s[A.cs.k]);
      ok('draws: clZero / clCnt / clUpload carry dn and gd', C.zero().dn === 0 && J(C.zero().gd) === '[]' && C.cnt(srv.doc.s[A.cs.k]).dn === 3 && J(C.cnt(srv.doc.s[A.cs.k]).gd) === J(aGd) && C.upload(A.S).dn >= C.upload(A.S).gd.length);
      // b. a join: dn / own / gd the account's, the pity / log / NEW dots start over (3.3)
      const B = dev({ ce: 900, dn: 4, pt: 7, gd: ['f9'], own: ['f9', 'h2'], nw: ['f9'], dl: { id: 'abc123', n: 4, r: [['f9', 0, 0]] }, ds: 3 });
      join(B);
      ok('draws: a join takes the account\'s draws and items (dn 3, gd as A drew) and resets this store\'s pity: pt 0, no log, ds 0, no NEW dots',
        B.S.dn === 3 && J(srt(B.S.gd)) === J(srt(aGd)) && J(srt(B.S.own)) === J(srt(['h1'].concat(aGd))) && B.S.pt === 0 && B.S.dl === null && B.S.ds === 0 && J(B.S.nw) === '[]' && C.mine(B.S, B.cs, 0).dn === 0, [B.S.dn, B.S.gd, B.S.pt, B.S.dl]);
      ok('draws: ... so the next draw there is no first-draw 확정 (dn is the account\'s)', DR.cands(B.S.own, B.S.pt, B.S.dn, false).k === 0);
      // c. a 10회 on A: one write per <= 10 draws, new gd items <= its draws, sp exactly 200 a draw; B sees it all
      const sp0 = sums().sp, before = writes.length;
      let rare = true; for (let i = 0; i < 10; i++) { const o = DR.one(A.S, rare); if (o.k === 2) rare = false; }
      const n10 = drain([A, B]), w10 = writes.slice(before).filter((w) => w.k === A.cs.k && w.dn > 0);
      ok('draws: a 10회 goes up in writes of <= 10 draws, each with <= as many new gd items and sp + exactly 200 a draw (rules took all)',
        typeof n10 === 'number' && n10 > 0 && w10.length >= 1 && w10.every((w) => w.dn <= 10 && w.gd <= w.dn && w.sp === 200 * w.dn) && sums().sp === sp0 + 2000 && sums().dn === 13, [n10, w10, sums()]);
      ok('draws: ... both views own every drawn item and count 13 draws', A.S.dn === 13 && B.S.dn === 13 && J(srt(B.S.gd)) === J(srt(A.S.gd)) && J(sums().gd) === J(srt(A.S.gd)) && A.S.gd.every((id) => B.S.own.includes(id)), [A.S.dn, B.S.dn]);
      // d. refunds: ten duplicates' 1,500 coins back go up under the coin cap - about 50 writes, all accepted; their 2,000 in one
      const ce0 = sums().ce, b2 = writes.length;
      A.S.dn += 10; A.S.sp += 2000; A.S.ce += 1500;       // (as drawCommit books ten 전설 duplicates)
      const nr = drain([A, B]), wr = writes.slice(b2).filter((w) => w.k === A.cs.k);
      ok('draws: refunds (ten duplicates, +1,500) converge under the cap: 40-60 writes, every one taken, ce <= 150 a write; the 2,000 spent in the first',
        typeof nr === 'number' && wr.length >= 40 && wr.length <= 60 && wr.every((w) => w.ce <= 150) && sums().ce === ce0 + 1500 && wr[0].sp === 2000 && wr[0].dn === 10, [nr, wr.length, sums().ce - ce0, wr[0]]);
      log('CLOUD INFO draws: a 10회 of duplicates refunded in ' + wr.length + ' writes');
      // e. the spent check: a hand-edited store whose gd lost a mark - that item is never charged its price; the rest unwritable
      const b3 = writes.length, sp1 = sums().sp, gid = DR.consts().pool.find((id) => !A.S.own.includes(id) && !DR.consts().only.includes(id));
      A.S.own = A.S.own.concat([gid]); A.S.gd = A.S.gd.concat([gid]); A.S.dn += 1; A.S.sp += 200; A.S.gd = A.S.gd.filter((id) => id !== gid);
      const ne = drain([A, B]);
      ok('draws: a drawn shop item whose gd mark was lost (' + gid + '): the draw goes up at 200, the item is never charged its price, then nothing is dirty',
        typeof ne === 'number' && sums().sp === sp1 + 200 && !sums().o.includes(gid) && C.dirty(Object.assign({}, A.S, { cs: A.cs })) === '' && writes.slice(b3).every((w) => w.o === 0), [ne, sums().sp - sp1, sums().o]);
      // f. two devices drawing offline: each slot its own dn / gd, the account the sum and the union
      const t0 = sums();
      for (let i = 0; i < 3; i++) { DR.one(A.S, false); DR.one(B.S, false); }
      const nf = drain([A, B]);
      ok('draws: two devices drawing offline (3 each): the account has 6 more draws, 1,200 more spent, both views equal',
        typeof nf === 'number' && sums().dn === t0.dn + 6 && sums().sp === t0.sp + 1200 && A.S.dn === B.S.dn && A.S.dn === sums().dn && J(srt(A.S.gd)) === J(srt(B.S.gd)), [nf, sums().dn - t0.dn, sums().sp - t0.sp, A.S.dn, B.S.dn, A.S.gd.length, B.S.gd.length]);
      // g. the same item drawn on both: owned once, both paid, both slots' gd hold it
      const L = DR.cands([], 0, 1, false).L; let x = '', c = 0;
      for (const v of [0.02, 0.07, 0.12, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.97]) { DR.rng(() => v); const id = DR.pick(L); if (!A.S.own.includes(id) && !B.S.own.includes(id)) { x = id; c = v; break; } }
      const t1 = sums();
      if (x) { DR.rng(() => c); A.S.pt = 0; B.S.pt = 0; DR.one(A.S, false); DR.one(B.S, false); }
      const ng = drain([A, B]), ka = A.cs.k, kb = B.cs.k;
      ok('draws: the same item (' + x + ') drawn on both devices: owned once, both paid (sp + 400), both slots\' gd hold it',
        !!x && typeof ng === 'number' && srv.doc.s[ka].gd.includes(x) && srv.doc.s[kb].gd.includes(x) && sums().sp === t1.sp + 400 && A.S.own.filter((id) => id === x).length === 1 && B.S.own.includes(x), [x, ng, sums().sp - t1.sp]);
      ok('draws: every write of the run was taken by the rules (none refused) and no slot ever lists a draw-only id in o', Object.keys(srv.doc.s).every((k) => (srv.doc.s[k].o || []).every((id) => !DR.consts().only.includes(id))));
    } finally { DR.rng(null); }
  }

  // ================================================================ 6e. the 뽑기 with frames (design/gacha.md 7.2, 13.2)
  async function drawSyncTests() {
    const sh = (fr) => fr.D().shop, dr = (fr) => fr.D().draw, X6 = (s) => s.repeat(6);
    const a = await frame('G1', 'pdraw1', { ns: 'tg1' });
    sh(a).set({ ce: 3000, sp: 0, own: [], bd: 0, bs: 0, sh: 1 });
    await signIn(a, 'uidDraw'); await settle(a);
    const k = a.st().cs.k, mark = F.now();
    const r1 = dr(a).commit(1);
    const up1 = await until(() => { const x = F.get('uidDraw').s[k]; return x && x.dn === 1 && !a.st().dirty; }, 5000);
    const s1 = F.get('uidDraw').s[k];
    ok('draws: one draw goes up as dn 1, sp + 200, its item in gd (or a refund in ce) - rules took every write', r1.ok && !!up1 && s1.sp === 200 && (r1.res[0].dup ? J(s1.gd) === '[]' : J(s1.gd) === J([r1.res[0].id])) && F.writes({ uid: 'uidDraw', since: mark, ok: false }).length === 0, [r1, s1]);
    // wearing a drawn draw-only item on the cat: its gd write first, the 30-character set right after (clEqOut knows gd)
    await settle(a);
    const st0 = dr(a).state();
    sh(a).set({ sp: sh(a).state().sp + 200, dn: st0.dn + 1, own: st0.own.concat(['b9']) });   // (as a draw of b9 books it)
    const worn = sh(a).wear('b', 'b9', 'cat');
    const eqUp = await until(() => { const d = F.get('uidDraw'); return d.s[k].gd.includes('b9') && d.eq && d.eq.slice(20, 25) === '000' + '9' + '0' && !a.st().dirty; }, 6000);
    ok('draws: b9 drawn and worn on the cat - its gd write and then the 30-character set reach the account (nothing refused)', worn && !!eqUp && F.writes({ uid: 'uidDraw', since: mark, ok: false }).length === 0, [F.get('uidDraw').eq, F.get('uidDraw').s[k].gd]);
    // a join with draws on the account: the pity starts over there, the guest key keeps its own; sign-out brings it back
    const b = await frame('G2', 'pdraw2', { ns: 'tg2' });
    sh(b).set({ ce: 700, sp: 0, own: ['f9'], dn: 3, pt: 6, bd: 0, bs: 0, sh: 1 });
    await signIn(b, 'uidDraw'); await settle(b);
    let g = null; try { g = JSON.parse(b.st().guest); } catch (e) { g = null; }
    const bs = dr(b).state();
    ok('draws: a join - the account\'s draws and items here, pt 0; the put-aside guest store keeps its own pt 6 and dn 3', bs.pt === 0 && bs.dn === dr(a).state().dn && bs.own.includes('b9') && g && g.pt === 6 && g.dn === 3, [bs.pt, bs.dn, g && g.pt]);
    ok('draws: ... and the next draw there is not a first-draw 확정 (no extra 확정 by signing in)', dr(b).cands(bs.own, bs.pt, bs.dn, false).k === 0);
    b.C().signOut(true); await until(() => b.st().st === 'out', 3000);
    ok('draws: sign-out -> the guest store is back with its own pt 6, dn 3', dr(b).state().pt === 6 && dr(b).state().dn === 3, dr(b).state());
    await signIn(b, 'uidDraw'); await settle(b);
    ok('draws: signing in again -> pt 0 again, never a 확정 owed by the loop', dr(b).state().pt === 0 && dr(b).cands(dr(b).state().own, 0, dr(b).state().dn, false).k === 0, dr(b).state());
    b.remove();
    // an offline draw, then the forced sign-out: the account's copy is parked; the next sign-in restores it and pushes the draw
    await settle(a);
    const dn0 = F.get('uidDraw').s[k].dn, sp0 = F.get('uidDraw').s[k].sp;
    F.setOnline('pdraw1', false);
    const r2 = dr(a).commit(1);
    a.C().signOut(true);
    await until(() => a.st().st === 'out', 3000);
    const parked = a.st().park;
    ok('draws: offline draw + forced sign-out -> the account\'s copy is parked (not dropped)', r2.ok && a.st().st === 'out' && /uidDraw/.test(parked), [r2.ok, a.st().st, parked.slice(0, 80)]);
    F.setOnline('pdraw1', true);
    await signIn(a, 'uidDraw'); await settle(a, 6000);
    const s2 = F.get('uidDraw').s[k];
    ok('draws: ... signing in again restores it and pushes the draw and its 200 coins into the same slot', s2 && s2.dn === dn0 + 1 && s2.sp === sp0 + 200 && a.st().cs.k === k && a.st().park === '', [s2 && s2.dn, dn0, s2 && s2.sp, sp0, a.st().park]);
    a.remove();
    // a v 3 document (looks) upgraded to v 4 by this page's first write
    F.put('uidDraw3', { v: 3, dev: 'gg12gg34', eq: X6('10000'), s: { kgggggg1: Object.assign(slotOf({ t: 40, g: 1, best: 40 }), { ce: 100, sp: 60, o: ['h1'], bd: 0, bs: 0 }) }, last: 'kgggggg1' });
    const c = await frame('G3', 'pdraw3', { ns: 'tg3' });
    await signIn(c, 'uidDraw3'); await settle(c);
    sh(c).give(25);
    const v4 = await until(() => F.get('uidDraw3').v === 4 && !c.st().dirty, 5000);
    ok('draws: a v 3 document becomes v 4 at this page\'s first write (its 30-character eq kept), the rules took it', !!v4 && F.get('uidDraw3').eq === X6('10000') && F.writes({ uid: 'uidDraw3', ok: false }).length === 0, F.get('uidDraw3'));
    c.remove();
  }

  // ================================================================ 12c. looks-per-animal.md 6.7 / 11.3 "L0 cases": store swaps, read-only pages
  async function l0Tests() {
    const sh = (fr) => fr.D().shop;
    const keysOf = (fr) => { const sfx = fr.tro().key.slice('ppogeul-trophy'.length); return [fr.tro().key, 'ppogeul-guest' + sfx, 'ppogeul-park' + sfx, 'ppogeul-cloud' + sfx]; };
    const snap = (ks) => ks.map((k) => localStorage.getItem(k)).join('|');
    // (a newer page's store in this browser: the frame gets the storage event -> read-only)
    const newer = (fr) => { const k = fr.tro().key; const o = JSON.parse(localStorage.getItem(k)); o.v = 99; localStorage.setItem(k, JSON.stringify(o)); };
    // 1. a linked tab made read-only by a storage event: listening stops, 'newer'; its sign-out writes nothing
    F.put('uidL0', { v: 1, dev: 'll12ll34', s: { kllllll1: slotOf({ t: 50, best: 50 }) }, last: 'kllllll1' });
    const a = await frame('L1', 'pl0a', { ns: 'tl0a' });
    a.T().set({ t: 77, best: 77 });
    await signIn(a, 'uidL0'); await settle(a);
    const ka = keysOf(a), g0 = a.st().guest;
    newer(a);
    const ro = await until(() => a.st().newer && a.st().msg === 'newer' && !a.st().listening, 3000);
    ok('L0: a storage event makes the linked tab read-only -> listening stops, the message is \'newer\'', !!ro && a.st().st === 'in', a.st());
    const s0 = snap(ka), mark = F.now();
    a.C().signOut(true); await sleep(120);
    ok('L0: ... a forced sign-out there: still signed in, \'newer\', the guest key untouched (t 77), no key of this browser written',
      a.st().st === 'in' && a.st().msg === 'newer' && snap(ka) === s0 && a.st().guest === g0 && JSON.parse(g0).t === 77, [a.st().st, a.st().msg, snap(ka) === s0]);
    a.C().click(); await sleep(120);
    ok('L0: ... the plain sign-out tap the same, and nothing went to the server', a.st().st === 'in' && a.st().msg === 'newer' && snap(ka) === s0 && F.writes({ uid: 'uidL0', since: mark }).length === 0, F.writes({ uid: 'uidL0', since: mark }));
    a.remove(); for (const k of ka) localStorage.removeItem(k);
    // 2. a sign-in on its way when the tab turns read-only: the link does nothing (no document, no key written)
    const b = await frame('L2', 'pl0b', { ns: 'tl0b' });
    await b.rec(true); await until(() => b.st().parts[1], 3000);
    F.popupWait = true; F.prof('pl0b').next = 'uidL0b';
    b.C().click(); await until(() => b.st().st === 'auth', 2000);
    await b.rec(false);                                              // (closed: the message waits for 내 기록, not timed out)
    const kb = keysOf(b);
    newer(b); await until(() => b.st().newer, 2000);
    const s1 = snap(kb);
    F.finishPopup('pl0b'); await sleep(400);
    ok('L0: a link attempt from a read-only tab does nothing - no document, \'newer\', \'out\', no key written', !F.get('uidL0b') && b.st().msg === 'newer' && b.st().st === 'out' && !b.st().cs && snap(kb) === s1, [F.get('uidL0b'), b.st().st, b.st().msg]);
    F.popupWait = false;
    b.C().click(); await sleep(80);
    ok('L0: ... a tap there now: \'nostore\' (no sign-in from a read-only page), still nothing written', b.st().st === 'nostore' && !F.get('uidL0b') && snap(kb) === s1, b.st());
    b.remove(); for (const k of kb) localStorage.removeItem(k);
    // 3. a forced sign-out offline with an unsaved coin award and a purchase: parked, then restored and pushed into the same slot
    const c = await frame('L3', 'pl0c', { ns: 'tl0c' });
    sh(c).set({ ce: 1000, sp: 0, own: [], bd: 0, bs: 0, sh: 1 });
    await signIn(c, 'uidL0c'); await settle(c);
    const k3 = c.st().cs.k, x0 = F.get('uidL0c').s[k3];
    F.setOnline('pl0c', false);
    const gv = sh(c).give(40), bought = sh(c).buy('h1');
    c.C().signOut(true); await until(() => c.st().st === 'out', 3000);
    const pk = c.st().park;
    ok('L0: offline coins + a purchase, forced sign-out -> parked (not dropped), "로그아웃했어요 · 저장 안 된 기록은 다시 로그인하면 올라가요"',
      gv && gv.give > 0 && bought && /uidL0c/.test(pk) && c.st().msg === 'outkeep' && c.D().cloud.texts().outkeep === '로그아웃했어요 · 저장 안 된 기록은 다시 로그인하면 올라가요', [gv, bought, pk.slice(0, 60), c.st().msg]);
    F.setOnline('pl0c', true);
    await signIn(c, 'uidL0c'); await until(() => { const x = F.get('uidL0c').s[k3]; return x && x.o.includes('h1') && x.ce === x0.ce + gv.give && !c.st().dirty; }, 6000);
    const x1 = F.get('uidL0c').s[k3];
    ok('L0: ... signing in again restores both and pushes them into the same slot (ce + the award, h1 and its 60 coins)',
      x1.ce === x0.ce + gv.give && x1.o.includes('h1') && x1.sp === x0.sp + 60 && c.st().cs.k === k3 && c.st().park === '' && Object.keys(F.get('uidL0c').s).length === 1, [x0, x1, c.st().park]);
    c.remove();
    // 4. the soft cap's day count survives the swap: guest 100 -> join -> +50 -> sign-out: the guest store says 150
    F.put('uidL0d', { v: 1, dev: 'dd12dd34', s: { kdddddd1: slotOf({ t: 40, best: 40 }) }, last: 'kdddddd1' });
    const d = await frame('L4', 'pl0d', { ns: 'tl0d' });
    sh(d).set({ ce: 0, sp: 0, own: [], bd: 0, bs: 0, sh: 1 });
    sh(d).give(100);
    const cd0 = sh(d).state().cd;
    await signIn(d, 'uidL0d'); await settle(d);
    const cdeIn = sh(d).state().cde;
    sh(d).give(50); await settle(d, 6000);
    d.C().signOut(true); await until(() => d.st().st === 'out', 3000);
    ok('L0: the soft cap\'s count after sign-in -> play -> sign-out is the day\'s total (150), not the guest\'s old 100', cdeIn === 100 && sh(d).state().cde === 150 && sh(d).state().cd === cd0, [cdeIn, sh(d).state().cde, sh(d).state().cd, cd0]);
    d.remove();
    // 5. a worn-set write refused by the server's 2 s rule: the change stays here and goes up at the next push
    const e = await frame('L5', 'pl0e', { ns: 'tl0e' });
    sh(e).set({ ce: 500, sp: 0, own: ['h1'], bd: 0, bs: 0, sh: 1 });
    await signIn(e, 'uidL0e'); await settle(e);
    const m5 = F.now();
    F.hold = true;
    const worn = sh(e).wear('h', 'h1', 'cat');
    await until(() => e.st().push, 3000);
    F.get('uidL0e').updatedAt = new F.TS(F.now() + 1500);            // (another device wrote just now: the 2 s per document)
    F.release();
    const refused = await until(() => F.writes({ uid: 'uidL0e', since: m5, ok: false }).some((w) => /eq/.test(J(w.upd))), 3000);
    ok('L0: a worn-set write refused by the 2 s rule -> the cat keeps h1 here', worn && !!refused && sh(e).look('cat')[0] === '1', [worn, F.writes({ uid: 'uidL0e', since: m5 }).map((w) => [w.ok, w.why])]);
    const upEq = await until(() => { const x = F.get('uidL0e'); return x.eq && x.eq.slice(20, 21) === '1' && !e.st().dirty && !e.st().eqOut; }, 6000);
    ok('L0: ... and it goes up at the next push', !!upEq && sh(e).look('cat')[0] === '1', F.get('uidL0e').eq);
    e.remove();
  }

  // ================================================================ 18. the login screen before the title (the deploy with the cloud; the PR preview)
  // (every other frame of this page boots past it: run() keeps this browser's default guest choice 'ppogeul-login' = '1';
  // a login frame is made with it taken away for its load)
  async function loginFrame(id, prof, opts) {
    localStorage.removeItem('ppogeul-login');
    try { return await frame(id, prof, opts); } finally { localStorage.setItem('ppogeul-login', '1'); }
  }
  const LG = (fr) => fr.D().login.state();
  const key = (fr, code) => { const W = fr.win(), t = W.document.activeElement && W.document.activeElement !== W.document.body ? W.document.activeElement : W; t.dispatchEvent(new W.KeyboardEvent('keydown', { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true })); };
  async function loginTests() {
    const TX = { why: '어서 오세요, 손님!', note: '' };
    // 1. at load, not linked, no choice yet: the screen instead of the title (this frame boots as a top-level tab: 'out')
    const a = await loginFrame('LG1', 'plg1', { ns: 'tlg1' });
    let s = LG(a);
    ok('login: at load (not linked, never a guest) the login screen shows instead of the title', s.shown && a.$('pg-title').hidden && !a.$('pg-login').hidden && a.D().G.mode === 'title', s);
    ok('login: logo, the why line, 구글로 시작하기 and 로그인 없이 하기; the line under them says what is kept', a.$('pg-login-h').textContent.indexOf('뽀득뽀득 목욕탕') >= 0 && a.$('pg-login-why').textContent === TX.why
      && s.btn === 'Google로 계속하기' && !s.btnHidden && !s.btnDisabled && a.$('pg-login-guest').textContent === '손님으로 입장하기' && s.line === TX.note, s);
    ok('login: a labelled region (its heading), the Google button described by the why line, a polite live line', a.$('pg-login').getAttribute('aria-labelledby') === 'pg-login-h' && a.$('pg-login-go').getAttribute('aria-describedby') === 'pg-login-why pg-login-st' && a.$('pg-login-st').getAttribute('aria-live') === 'polite');
    await until(() => LG(a).focus === 'pg-login-go', 1000);
    ok('login: the keyboard starts on 구글로 시작하기', LG(a).focus === 'pg-login-go', LG(a).focus);
    key(a, 'ArrowDown'); await sleep(20);
    const f1 = LG(a).focus; key(a, 'ArrowUp'); await sleep(20);
    ok('login: ↓ / ↑ move between the two buttons', f1 === 'pg-login-guest' && LG(a).focus === 'pg-login-go', [f1, LG(a).focus]);
    a.win().document.activeElement.blur();
    const sel0 = a.D().G.sel;
    for (const c of ['Enter', 'Space', 'KeyX', 'KeyZ', 'ArrowRight', 'KeyP', 'Escape']) key(a, c);
    await sleep(80);
    ok('login: no game key does anything behind it (no solo start, no pick, no pause; the screen stays)', a.D().G.mode === 'title' && LG(a).shown && a.D().G.sel === sel0, [a.D().G.mode, LG(a).overlay, a.D().G.sel]);
    // 2. 구글로 시작하기: the existing popup sign-in; linked -> the title; the link's message waits in 내 기록
    F.prof('plg1').next = 'uidLG1';
    a.$('pg-login-go').click();
    await until(() => a.st().st === 'in' && a.st().cs, 5000);
    await until(() => LG(a).overlay === 'title', 2000);
    ok('login: 구글로 시작하기 signs in (popup) and uploads; linked -> the title', a.st().cs && a.st().cs.u === 'uidLG1' && !!F.get('uidLG1') && LG(a).overlay === 'title' && !a.$('pg-title').hidden && a.$('pg-login').hidden, [a.st().st, LG(a)]);
    await a.rec(true);
    ok('login: ... 내 기록 then shows the link\'s message as today', a.st().line === '구글 계정에 트로피 100개를 저장했어요', a.st().line);
    ok('login: a linked browser is past it (the load check says no)', LG(a).wanted === false && !a.D().login.show().shown, LG(a));
    await a.rec(false); await settle(a);
    a.C().signOut(true); await until(() => a.st().st === 'out', 2000);
    ok('login: signing out (내 기록 as today) stays on the title, not the login screen', LG(a).overlay === 'title' && !LG(a).shown, LG(a));
    // 3. failures are said on the screen; 로그인 없이 하기 then goes on and clears them
    a.D().login.show(true);
    F.failNext('popup', 'auth/popup-blocked'); a.D().login.go();
    await until(() => LG(a).line === '팝업이 막혔어요 · 한 번 더 눌러 주세요', 2000);
    ok('login: a blocked popup is said on the screen (pink), the button ready again', LG(a).shown && /is-err/.test(LG(a).cls) && LG(a).btn === 'Google로 계속하기' && !LG(a).busy, LG(a));
    a.D().login.guest();
    ok('login: 로그인 없이 하기 -> the title, remembered for this browser, the failure message gone', LG(a).overlay === 'title' && LG(a).guest === '1' && a.st().msg === null && localStorage.getItem('ppogeul-login-tlg1') === '1', [LG(a), a.st().msg]);
    // 4. the popup left open: 다시 열기 on the screen (tappable), then a busy label while it links
    a.D().login.forget(); a.D().login.show();
    F.popupWait = true; F.prof('plg1').next = 'uidLG2';
    a.D().login.go(); await sleep(40);
    ok('login: the Google window open -> "다시 열기" and "구글 창에서 로그인을 마쳐 주세요" (not busy)', LG(a).btn === '다시 열기' && LG(a).line === '구글 창에서 로그인을 마쳐 주세요' && !LG(a).busy, LG(a));
    F.finishPopup('plg1'); F.popupWait = false;
    await until(() => a.st().st === 'in' && a.st().cs, 4000);
    ok('login: ... finished there -> linked, the title', a.st().cs && a.st().cs.u === 'uidLG2' && LG(a).overlay === 'title', LG(a));
    await settle(a); a.C().signOut(true); await until(() => a.st().st === 'out', 2000);
    // 5. an installed app on the authDomain: redirect; back from Google (a reload in reality) the screen waits, then the title with 내 기록 open
    a.D().login.forget(); a.C().env({ app: true, same: true }); a.C().reboot(); a.D().login.show();
    F.prof('plg1').next = 'uidLG3';
    a.D().login.go();
    await until(() => F.calls.some((c) => c.op === 'redirect' && c.frame === 'LG1'), 2000);
    ok('login: an installed app -> the redirect sign-in, the button busy ("로그인 중…")', LG(a).shown && LG(a).busy && LG(a).btn === '로그인 중…', LG(a));
    a.C().reboot(); a.D().login.show();
    const waitShown = LG(a).shown;
    await until(() => a.st().st === 'in' && a.st().cs && LG(a).overlay !== 'login', 4000);
    await until(() => a.recShown() && a.st().line === '구글 계정에 트로피 100개를 저장했어요', 2000);
    ok('login: ... back from the redirect: the screen waits, then the title with 내 기록 open and its message (as from the title)', waitShown && a.st().cs && a.st().cs.u === 'uidLG3' && a.recShown(), [waitShown, a.st().st, a.recShown(), a.st().line]);
    await a.rec(false); await settle(a); a.C().signOut(true); await until(() => a.st().st === 'out', 2000);
    // 6. in-app browsers: the other-browser button where one exists (KakaoTalk), the message alone where none does (iOS)
    a.D().login.forget(); a.C().env({ inApp: true, kakao: true }); a.C().reboot(); a.D().login.show();
    ok('login: KakaoTalk\'s in-app browser -> "다른 브라우저로 열기" and the in-app line', LG(a).shown && LG(a).btn === '다른 브라우저로 열기' && !LG(a).btnHidden && LG(a).line === a.D().cloud.texts().inapp, LG(a));
    a.D().login.go();
    ok('login: ... it opens the game\'s address outside (kakaotalk://web/openExternal)', /^kakaotalk:\/\/web\/openExternal\?url=/.test(a.st().opened), a.st().opened);
    a.C().env({ inApp: true }); a.C().reboot(); a.D().login.show();
    ok('login: an in-app browser with no way out -> no dead button, the line says what to do, 로그인 없이 하기 stays', LG(a).shown && LG(a).btnHidden && LG(a).line === a.D().cloud.texts().inapp && !a.$('pg-login-guest').hidden, LG(a));
    a.C().env({}); a.C().reboot();
    a.remove();
    // 7. a real frame of the deploy (its own env: 'frame'): 새 창에서 열기; 로그인 없이 하기 is remembered over a reload
    const b = await loginFrame('LG2', 'plg2', { ns: null });
    s = LG(b);
    ok('login: in a frame -> "새 창에서 열기" and the frame line, at load', s.shown && b.st().st === 'frame' && s.btn === '새 창에서 열기' && !s.btnHidden && s.line === b.D().cloud.texts().frame, [s, b.st().st]);
    localStorage.removeItem('ppogeul-login');
    b.D().login.guest();
    ok('login: ... 로그인 없이 하기 -> the title, the choice kept in this browser (ppogeul-login)', LG(b).overlay === 'title' && localStorage.getItem('ppogeul-login') === '1', LG(b));
    await b.reload(null);
    ok('login: ... a reload goes straight to the title', !LG(b).shown && LG(b).overlay === 'title' && !b.$('pg-title').hidden, LG(b));
    b.remove();
    localStorage.setItem('ppogeul-login', '1');
    // 8. the deploy without a config: no login screen at all (nothing made)
    const c = await loginFrame('LG3', 'plg3', { src: '/deploy-nocfg/index.html' });
    ok('login: the deploy without a config -> the title, no login screen made', !LG(c).made && !c.$('pg-login') && !c.$('pg-title').hidden, LG(c));
    c.remove();
    // 9. a PR preview: the same screen, the Google button off with its note; 로그인 없이 하기 works and is remembered (preview keys)
    const p = await loginFrame('LG4', 'plg4', { src: '/deploy-preview/index.html', ns: null });
    s = LG(p);
    ok('login: a PR preview shows the screen, 구글로 시작하기 disabled, "미리보기에서는 로그인을 할 수 없어요"', s.shown && s.preview === '999' && s.btnDisabled && s.btn === 'Google로 계속하기' && s.line === '미리보기에서는 로그인을 할 수 없어요' && !p.st().on, s);
    await until(() => LG(p).focus === 'pg-login-guest', 1000);
    ok('login: ... the keyboard starts on 로그인 없이 하기 there; the disabled button does nothing', LG(p).focus === 'pg-login-guest' && p.D().login.go().shown, LG(p));
    p.D().login.guest();
    ok('login: ... 로그인 없이 하기 -> the title, kept under the preview\'s own key', LG(p).overlay === 'title' && localStorage.getItem('ppogeul-login@pr999') === '1' && localStorage.getItem('ppogeul-login') === '1', [LG(p), localStorage.getItem('ppogeul-login@pr999')]);
    p.remove(); localStorage.removeItem('ppogeul-login@pr999');
  }

  async function fixtureTests() {
    const d = await frame('d0', 'p3', { ns: 'g3' });
    const st = d.st(), w = d.win();
    ok('fixture: the deploy page with a config boots with the cloud on, signed out', st.on === true && st.st === 'out' && !!w.PG_CLOUD && Object.isFrozen(w.PG_CLOUD), st);
    ok('fixture: no SDK script asked for at boot (nothing for a player who never signed in)', !F.scripts.some((s) => s.frame === 'd0') && st.loads === 0 && st.parts.every((p) => !p), F.scripts);
    ok('fixture: no web.app hop on localhost (the page stayed)', w.location.hostname === 'localhost' && /\/deploy-cloud\//.test(w.location.pathname));
    ok('fixture: the badge mark is hidden while signed out; the warm-up has the cloud text', d.$('pg-tro-cloud').hidden && d.$('pg-fontwarm').textContent.indexOf('구글로 로그인') >= 0);
    await d.rec(true);
    await until(() => d.st().parts[1], 3000);
    const s2 = d.st(), sc = F.scripts.filter((s) => s.frame === 'd0'), cfg = w.PG_CLOUD;
    ok('fixture: 내 기록 loads app + auth (in order), not firestore', s2.parts[0] && s2.parts[1] && !s2.parts[2] && sc.length === 2 && sc[0].part === 'app' && sc[1].part === 'auth' && s2.loads === 2, [s2.parts, sc.map((s) => s.part)]);
    ok('fixture: each SDK script carries the build\'s integrity hash, crossorigin anonymous, no referrer, async false', sc.every((s, i) => s.src === cfg.sdk[i][0] && s.integrity === cfg.sdk[i][1] && /^sha512-/.test(s.integrity) && s.cross === 'anonymous' && s.ref === 'no-referrer' && s.async === false), sc);
    ok('fixture: 내 기록 shows 구글로 로그인 and what it is for (+ the privacy part); the card has has-cloud', d.st().btn === '구글로 로그인' && d.st().line === PITCH && d.$('pg-rec').querySelector('.pg-rec-card').classList.contains('has-cloud'), [d.st().btn, d.st().line]);
    ok('fixture: the button\'s aria-label says what it does', d.$('pg-cloud-btn').getAttribute('aria-label') === '구글로 로그인 · 트로피를 구글 계정에 저장해요');
    const init = F.calls.find((c) => c.op === 'init' && c.frame === 'd0');
    ok('fixture: the app is made with the page\'s config (projectId, authDomain, apiKey, appId only)', init && init.cfg.projectId === 'pg-cloud-test' && init.cfg.authDomain === 'pg-cloud-test.firebaseapp.com' && Object.keys(init.cfg).sort().join() === 'apiKey,appId,authDomain,projectId', init);
    d.remove();
  }

  // ================================================================ 4. first sign-in: the cloud is empty -> upload
  let A1 = null;
  async function uploadTests() {
    A1 = await frame('A1', 'pa', { ns: 't4' });
    A1.T().set({ t: 77, w: 2, g: 5, ko: 4, best: 90 });
    A1.C().nick('뽀숑');
    const okIn = await signIn(A1, 'uidA');
    const st = A1.st(), doc = F.get('uidA'), ks = doc ? Object.keys(doc.s) : [], sl = doc ? doc.s[ks[0]] : null;
    ok('upload: 구글로 로그인 -> signed in and linked', !!okIn && st.user === 'uidA' && st.cs && st.cs.u === 'uidA' && st.cs.m.n === 1, st);
    ok('upload: the document: one slot with the store as it was (t 77, w 2, g 5, ko 4, best 90, n 1), the store\'s dev, the nick', doc && ks.length === 1 && sl.t === 77 && sl.w === 2 && sl.g === 5 && sl.ko === 4 && sl.best === 90 && sl.n === 1 && doc.dev === A1.tro().dev && doc.nick === '뽀숑' && doc.v === 4 && doc.last === ks[0], doc);
    const cr = F.writes({ uid: 'uidA' });
    ok('upload: it was made in a transaction the rules accepted (create)', cr.length === 1 && cr[0].op === 'tx-set' && cr[0].ok, cr);
    ok('upload: the message "구글 계정에 트로피 77개를 저장했어요"', st.msg === 'up' && st.line === '구글 계정에 트로피 77개를 저장했어요', [st.msg, st.line]);
    await until(() => A1.st().live && A1.st().mark === 'pg-tro-cloud', 3000);
    ok('upload: the title badge\'s cloud mark: plain (saved); the badge says so', A1.st().mark === 'pg-tro-cloud' && /구글 계정에 저장 중$/.test(A1.$('pg-tro').getAttribute('aria-label')), [A1.st().mark, A1.$('pg-tro').getAttribute('aria-label')]);
    const pop = F.calls.find((c) => c.op === 'popup' && c.frame === 'A1');
    ok('upload: a popup in a browser tab, prompt select_account, Korean pages', pop && pop.prompt === 'select_account' && pop.lang === 'ko', pop);
    ok('upload: firestore loaded only after the sign-in', F.scripts.filter((s) => s.frame === 'A1').map((s) => s.part).join() === 'app,auth,firestore');
    ok('upload: the user\'s name / mail / photo / provider data were never read', F.peeks === 0, F.peeks);
    ok('upload: the store keeps its link record (cs) beside the counts; the guest key is empty', !!A1.tro() && A1.st().cs.k === ks[0] && A1.st().guest === '', A1.st().guest);
    ok('upload: the button says 로그아웃, the line "구글 계정에 저장돼요" after the message', A1.st().btn === '로그아웃' && (await until(() => A1.st().line === '구글 계정에 저장돼요', 1500)), A1.st().line);
    // the default nick is never written
    const A2 = await frame('A2', 'pa2', { ns: 't4b' });
    A2.C().nick('손님42');
    await signIn(A2, 'uidA2');
    const d2 = F.get('uidA2');
    ok('upload: a default nick (손님NN) is not written', d2 && !('nick' in d2) && Object.keys(d2.s).length === 1, d2);
    A2.remove();
  }

  // ================================================================ 5. the cloud wins; sign-out brings this browser's own back
  let B = null;
  async function cloudWinsTests() {
    F.put('uidB', { v: 1, dev: 'zz12zz34', nick: '목욕왕', s: { kbbbbbb1: slotOf({ t: 70, w: 3, g: 6, ko: 9, best: 80, bl: 1, hi: 5000 }), kbbbbbb2: slotOf({ t: 50, g: 2, best: 60 }) }, last: 'kbbbbbb2' });
    B = await frame('B1', 'pb', { ns: 't5' });
    B.T().set({ t: 150, w: 4, g: 7, best: 150 });
    B.C().nick('손님55');
    const writes0 = F.log.length;
    await signIn(B, 'uidB');
    const st = B.st(), tr = B.tro();
    let guest = null; try { guest = JSON.parse(st.guest); } catch (e) { guest = null; }
    ok('cloud wins: the view is the account\'s 120 (and its w / g / ko / best / league)', tr.t === 120 && tr.w === 3 && tr.g === 8 && tr.ko === 9 && tr.best === 120 && tr.bl === 1, tr);
    ok('cloud wins: this browser\'s 150 is put aside (ppogeul-guest)', guest && guest.t === 150 && guest.w === 4 && !('cs' in guest), guest);
    const SWAP = '구글 계정의 트로피 120개예요 · 이 기기의 트로피 150개와 꾸미기는 로그아웃하면 다시 보여요';
    ok('cloud wins: the message "' + SWAP + '"', st.msg === 'swap' && st.line === SWAP, st.line);
    ok('cloud wins: the device id and the nick are the account\'s (a default nick takes it)', tr.dev === 'zz12zz34' && B.win().localStorage.getItem('ppogeul-nick') === '목욕왕', [tr.dev, B.win().localStorage.getItem('ppogeul-nick')]);
    ok('cloud wins: the account\'s best score comes too', B.D().G.hiscore >= 5000 && B.$('pg-rec-hi').textContent.replace(/,/g, '') >= 5000, B.D().G.hiscore);
    await sleep(400);
    ok('cloud wins: this browser writes nothing until it changes something', F.log.length === writes0 && B.st().dirty === '', F.log.slice(writes0));
    ok('cloud wins: that message stays while 내 기록 is open (not just 8 s)', B.st().msg === 'swap' && B.st().line === SWAP, [B.st().msg, B.st().line]);
    await B.rec(false); await B.rec(true);
    ok('cloud wins: ... and is over once 내 기록 was closed', B.st().msg === null && B.st().line !== SWAP && B.st().st === 'in', [B.st().msg, B.st().line]);
    B.C().signOut(false);
    await until(() => B.st().st === 'out', 2000);
    const s2 = B.st(), t2 = B.tro();
    ok('sign-out: this browser\'s own 150 is back, the guest key empty, no link record', t2.t === 150 && t2.w === 4 && s2.guest === '' && !s2.cs && s2.user === null, [t2.t, s2.guest, s2.cs]);
    ok('sign-out: "로그아웃했어요 · 다시 로그인하면 계정 트로피가 돌아와요", 구글로 로그인 again, the mark hidden', s2.msg === 'out' && s2.line === '로그아웃했어요 · 다시 로그인하면 계정 트로피가 돌아와요' && s2.btn === '구글로 로그인' && s2.mark === '', s2);
    ok('sign-out: the session is closed (the SDK signed out)', F.prof('pb').user === null);
  }

  // ================================================================ 6. pushes, holds, a staked result, the best score
  async function pushTests() {
    const fr = A1, k = fr.st().cs.k;
    await settle(fr);
    let mark = F.now(), t0 = fr.tro().t;
    fr.T().set({ t: t0 + 15 });
    ok('push: a change is not written at once (debounced)', F.writes({ frame: 'A1', since: mark }).length === 0);
    await until(() => F.writes({ frame: 'A1', since: mark }).length > 0, 3000);
    await sleep(300);
    let ws = F.writes({ frame: 'A1', since: mark });
    const sl = F.get('uidA').s[k];
    ok('push: one update with absolute values after the debounce (t ' + (t0 + 15) + ', n 2)', ws.length === 1 && ws[0].op === 'update' && ws[0].ok && sl.t === t0 + 15 && sl.n === 2 && ws[0].upd['s.' + k] && ws[0].upd.last === k, ws.map((w) => [w.op, w.ok, w.why]));
    await sleep(500);
    ok('push: nothing more without changes', F.writes({ frame: 'A1', since: mark }).length === 1 && fr.st().dirty === '');
    // a hold (an online battle's stake at 시작!) is never pushed while open
    mark = F.now();
    fr.T().fast(true);
    ok('hold: stake 10 holds 16', fr.T().hold('abc123.1', 10, 2, 0) === true && fr.tro().esc.length === 1, fr.tro().esc);
    await sleep(700);
    ok('hold: no push while this tab holds trophies (the store is dirty)', F.writes({ frame: 'A1', since: mark }).length === 0 && fr.st().dirty === 'hard', fr.st().dirty);
    fr.C().click();
    ok('hold: no sign-out with a hold open ("경기가 끝난 뒤에 해 주세요")', fr.st().st === 'in' && fr.st().msg === 'held', fr.st());
    fr.T().close('abc123.1', 'forfeit', 'test');
    await until(() => F.writes({ frame: 'A1', since: mark }).length > 0, 3000);
    await settle(fr);
    const s2 = F.get('uidA').s[k];
    ok('hold: closed (forfeit: -16, a game) -> pushed', s2.t === t0 + 15 - 16 && s2.g === 6 && F.writes({ frame: 'A1', since: mark, ok: true }).length === 1, [s2.t, s2.g]);
    // a staked online battle's result: applied once (my own row), then synced
    mark = F.now();
    const before = fr.tro();
    fr.T().hold('abc123.2', 10, 2, 0);
    const r1 = fr.T().result('abc123.2', [[0, 1, 10, 20, 2]], 0, false), r2 = fr.T().result('abc123.2', [[0, 1, 10, 20, 2]], 0, false);
    ok('result: a staked win (+10 base, +20 pot, -10 stake) is applied once', r1 && r1.net === 20 && r2 === null && fr.tro().t === before.t + 20 && fr.tro().w === before.w + 1 && fr.tro().g === before.g + 1 && fr.tro().ko === before.ko + 2, [r1, r2, fr.tro().t]);
    await until(() => F.writes({ frame: 'A1', since: mark }).length > 0, 3000);
    await settle(fr);
    const s3 = F.get('uidA').s[k], w3 = F.writes({ frame: 'A1', since: mark });
    ok('result: ... synced in one write (the hold itself never went out)', w3.length === 1 && w3[0].ok && s3.t === before.t + 20 && s3.w === before.w + 1 && s3.g === before.g + 1 && s3.ko === before.ko + 2, [w3.length, s3]);
    // the best solo score: a soft change (60 s)
    mark = F.now();
    const D = fr.D(); D.start(0); D.G.score = 123456; D.toTitle();
    ok('best score: a higher solo score is a soft change (no hurry)', fr.st().dirty === 'soft' && F.writes({ frame: 'A1', since: mark }).length === 0, fr.st().dirty);
    await sleep(500);
    ok('best score: ... not written within 4 s of server time... nor 20 s', F.writes({ frame: 'A1', since: mark }).length === 0);
    await until(() => F.writes({ frame: 'A1', since: mark }).length > 0, 4000);
    ok('best score: ... written after ~60 s (hi 123456)', F.get('uidA').s[k].hi === 123456 && F.writes({ frame: 'A1', since: mark, ok: true }).length === 1, F.get('uidA').s[k]);
    const dt = (F.writes({ frame: 'A1', since: mark })[0] || {}).t - mark;
    info('best score: written ' + Math.round(dt / 1000) + ' s (server time) after the change');
    // the nick follows
    mark = F.now();
    fr.C().nick('때밀이왕');
    await until(() => F.get('uidA').nick === '때밀이왕', 3000);
    ok('nick: a new in-game nick reaches the account (rules: nick only)', F.get('uidA').nick === '때밀이왕' && F.writes({ frame: 'A1', since: mark, ok: true }).length === 1, F.writes({ frame: 'A1', since: mark }).map((w) => [w.ok, w.why]));
    await settle(fr);
  }

  // ================================================================ 7. two devices of one account
  let A3 = null;
  async function twoDeviceTests() {
    A3 = await frame('A3', 'pc', { ns: 't7' });
    await signIn(A3, 'uidA');
    await settle(A1);
    const base = A1.tro().t;
    ok('two devices: the second device joins with the account\'s count', A3.tro().t === base && A3.st().msg !== 'up', [A3.tro().t, base, A3.st().msg]);
    ok('two devices: the same device id (practice when they meet): devHash equal', A1.T().devHash('ab12') === A3.T().devHash('ab12') && A1.tro().dev === A3.tro().dev);
    A1.T().set({ t: A1.tro().t + 10 });
    ok('two devices: +10 on one -> the other adopts it', !!(await until(() => A3.tro().t === base + 10, 3000)), [A3.tro().t, base + 10]);
    await settle(A1); await settle(A3);
    // both change at once: the server takes one write per 2 s per document - one is refused and retried
    const mark = F.now(); F.hold = true;
    A1.T().set({ t: A1.tro().t + 5 }); A3.T().set({ t: A3.tro().t + 7 });
    await until(() => A1.st().push && A3.st().push, 3000);
    F.release();
    await until(() => { const a = A1.st(), b = A3.st(); return !a.dirty && !b.dirty && a.live && b.live && A1.tro().t === base + 22 && A3.tro().t === base + 22; }, 5000);
    const ws = F.writes({ uid: 'uidA', since: mark }), refused = ws.filter((w) => !w.ok);
    ok('two devices: both change at the same moment -> one refused (2 s per document), retried; both views = the sum', refused.length >= 1 && refused.every((w) => w.why === 'update') && A1.tro().t === base + 22 && A3.tro().t === base + 22 && F.sum('uidA') === base + 22, [ws.map((w) => [w.frame, w.ok]), A1.tro().t, A3.tro().t, F.sum('uidA')]);
    info('two devices: ' + ws.length + ' writes, ' + refused.length + ' refused (fails seen: ' + A1.st().fails + '/' + A3.st().fails + ')');
  }

  // ================================================================ 8. offline then online
  async function offlineTests() {
    await settle(A1); await settle(A3);
    const base = A1.tro().t;
    F.setOnline('pc', false);
    A3.T().set({ t: A3.tro().t + 30 }); A1.T().set({ t: A1.tro().t + 10 });
    await until(() => F.sum('uidA') === base + 10 && A3.st().push, 3000);
    ok('offline: the online device\'s +10 arrives; the offline one\'s write waits in the queue', F.sum('uidA') === base + 10 && A3.st().push && A3.tro().t === base + 30, [F.sum('uidA'), A3.st().push, A3.tro().t]);
    await sleep(300);
    ok('offline: the offline device hears nothing meanwhile (its view: its own +30)', A3.tro().t === base + 30);
    F.setOnline('pc', true);
    const okSum = await until(() => A1.tro().t === base + 40 && A3.tro().t === base + 40 && F.sum('uidA') === base + 40 && !A3.st().dirty, 5000);
    ok('offline: back online -> both views = the sum (+40)', !!okSum, [A1.tro().t, A3.tro().t, F.sum('uidA')]);
  }

  // ================================================================ 9. the tab dies with a write in flight
  async function tabDeathTests() {
    await settle(A3);
    const base = F.sum('uidA'), k = A3.st().cs.k;
    F.setOnline('pc', false);
    A3.T().set({ t: A3.tro().t + 12 });
    await until(() => A3.st().push, 3000);
    const okR = await A3.reload('t7');
    const mark = F.now();
    F.setOnline('pc', true);
    ok('tab death: the frame reloaded (its pending write never reached the server)', okR && F.sum('uidA') === base, F.sum('uidA'));
    ok('tab death: after the reload the store is still dirty', A3.st().dirty === 'hard' || !!(await until(() => A3.st().dirty === 'hard', 500)), A3.st());
    await until(() => F.sum('uidA') === base + 12 && A3.st().st === 'in' && !A3.st().dirty, 5000);
    await sleep(300);
    const ws = F.writes({ frame: 'A3', since: mark, ok: true });
    ok('tab death: ... one write, the +12 counted once', F.sum('uidA') === base + 12 && ws.length === 1 && A1.tro().t === base + 12 && F.get('uidA').s[k].t > 0, [F.sum('uidA'), ws.length]);
  }

  // ================================================================ 10. two tabs of one browser
  async function twoTabTests() {
    const a = await frame('A4', 'pd', { ns: 't10' });
    await signIn(a, 'uidD');
    const b = await frame('A5', 'pd', { ns: 't10' });
    ok('two tabs: the second tab of the browser comes up linked (same store, same session)', !!(await until(() => b.st().st === 'in' && b.st().listening && b.st().live, 3000)), b.st());
    await settle(a); await settle(b);
    const base = a.tro().t, mark = F.now();
    a.T().set({ t: base + 9 });
    ok('two tabs: the other tab\'s badge follows (storage event)', !!(await until(() => b.$('pg-tro-n').textContent === String(base + 9), 1500)), b.$('pg-tro-n').textContent);
    await until(() => F.sum('uidD') === base + 9 && !a.st().dirty && !b.st().dirty, 4000);
    await sleep(400);
    const ws = F.writes({ uid: 'uidD', since: mark });
    ok('two tabs: at most two writes, one of them taken (the second refused or never sent)', ws.length >= 1 && ws.length <= 2 && ws.filter((w) => w.ok).length === 1 && F.sum('uidD') === base + 9, ws.map((w) => [w.frame, w.ok, w.why]));
    a.C().signOut(true);
    ok('two tabs: signing out in one tab: the other follows (\'out\')', !!(await until(() => b.st().st === 'out' && !b.st().cs, 2000)), b.st());
    a.remove(); b.remove();
  }

  // ================================================================ 11. folding the oldest slot / a full document
  async function foldTests() {
    const s = {}, now = F.now();
    for (let i = 0; i < 15; i++) s['kf' + String(i).padStart(6, '0')] = slotOf({ t: 10 + i, g: 1, w: i % 2, at: now - 864e5 });
    s.kfold000 = slotOf({ t: 33, w: 1, g: 4, ko: 7, best: 60, bl: 1, hi: 777, day: 20261001, de: 9, n: 5, at: now - 9 * 864e5 });
    s._ = slotOf({ t: 5, g: 1, best: 40, hi: 900, n: 2, at: now - 20 * 864e5 });
    F.put('uidF', { v: 1, dev: 'ff12ff34', s, last: 'kf000000' });
    const total = F.sum('uidF');
    const fr = await frame('A6', 'pf', { ns: 't11' });
    await signIn(fr, 'uidF');
    ok('fold: (joined a document with 16 browser slots + the archive)', fr.tro().t === total && fr.st().doc && fr.st().doc.browsers === 16, [fr.tro().t, total, fr.st().doc]);
    const mark = F.now();
    fr.T().set({ t: fr.tro().t + 5 });
    await until(() => F.sum('uidF') === total + 5 && !fr.st().dirty, 5000);
    const ws = F.writes({ uid: 'uidF', since: mark }), d = F.get('uidF'), z = d.s._;
    ok('fold: the new slot\'s first write folds the oldest idle slot first (a transaction the rules accept), then writes', ws.length >= 2 && ws[0].op === 'tx-update' && ws[0].ok && ws.some((w) => w.op === 'update' && w.ok) && !('kfold000' in d.s), ws.map((w) => [w.op, w.ok, w.why]));
    ok('fold: the archive = old archive + the folded slot exactly (sums, bests, n + 1, day 0)', z.t === 38 && z.w === 1 && z.g === 5 && z.ko === 7 && z.best === 60 && z.bl === 1 && z.hi === 900 && z.n === 3 && z.day === 0 && z.de === 0, z);
    ok('fold: the count is kept: the sum is the old total + 5, 16 browser slots again', F.sum('uidF') === total + 5 && Object.keys(d.s).filter((x) => x !== '_').length === 16 && fr.tro().t === total + 5, [F.sum('uidF'), Object.keys(d.s).length]);
    fr.remove();
    // 16 slots and none idle: this browser cannot save (full), it plays on
    const s2 = {}; for (let i = 0; i < 16; i++) s2['kg' + String(i).padStart(6, '0')] = slotOf({ t: 10, at: now - 864e5 });   // (160: more than a fresh browser's gift of 100 - no put-aside message)
    F.put('uidG', { v: 1, dev: 'gg12gg34', s: s2, last: 'kg000000' });
    const g = await frame('A7', 'pg', { ns: 't11b' });
    await signIn(g, 'uidG');
    const m2 = F.now();
    g.T().set({ t: g.tro().t + 5 });
    await until(() => g.st().err === 'full', 4000);
    await g.rec(true); await until(() => !g.st().msg, 2000);
    ok('full: no idle slot -> "이 기기는 저장할 수 없어요 (기기 16대까지)", the mark pink, nothing written but the look', g.st().err === 'full' && g.st().line === '이 기기는 저장할 수 없어요 (기기 16대까지)' && g.st().mark === 'pg-tro-cloud is-err' && F.writes({ uid: 'uidG', since: m2, ok: true }).length === 0 && g.tro().t === 165, [g.st().err, g.st().line, g.st().mark]);
    g.remove();
  }

  // ================================================================ 11b. v4 shop: 비누 코인, items and the worn set through the frames
  // (design/shop.md 8, 16.3): the first upload carries them, a second device shows the account's (its own put aside),
  // a purchase and coins cross over, the worn set goes alone (eq-only) and is taken over, sign-out brings a device's
  // own back, a v 1 document is made v 2 by the first slot write, a newer page's document is never written
  async function coinSyncTests() {
    const sh = (fr) => fr.D().shop, ss = (fr) => fr.D().shop.state(), X6 = (s) => s.repeat(6);
    // (looks-per-animal.md) the account's worn sets with frame fr's pick wearing lk and every other animal rest
    const ANI = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'], eqWith = (fr, lk, rest) => ANI.map((c) => (c === fr.D().G.sel ? lk : rest)).join('');
    const a = await frame('C1', 'pcoin1', { ns: 'tc1' });
    sh(a).set({ ce: 500, sp: 60, own: ['h1'], eq: '10000', bd: 0, bs: 0, sh: 1 });
    await signIn(a, 'uidC');
    const d0 = F.get('uidC'), k = a.st().cs && a.st().cs.k, s0 = d0 && k ? d0.s[k] : null;
    ok('coins: the first upload makes a v 4 document - the slot carries the store\'s coins / items, the document its worn sets (30 characters)', d0 && d0.v === 4 && d0.eq === X6('10000') && s0 && s0.ce === 500 && s0.sp === 60 && J(s0.o) === '["h1"]' && s0.bd === 0 && s0.bs === 0, d0);
    ok('coins: ... the link record knows that worn set as in step (ev)', a.st().cs.ev === X6('10000'), a.st().cs);
    const b = await frame('C2', 'pcoin2', { ns: 'tc2' });
    sh(b).set({ ce: 999, sp: 0, own: ['hc'], eq: 'c0000', sh: 1 }); b.T().set({ bl: 6 });
    await signIn(b, 'uidC');
    let gb = null; try { gb = JSON.parse(b.st().guest); } catch (e) { gb = null; }
    const sb = ss(b);
    ok('coins: a second device shows the account\'s coins (440), items and worn set; its own 999 coins and 황금 대야 투구 are put aside', sb.co === 440 && J(sb.own) === '["h1"]' && sb.eq === '10000' && sb.eqs === X6('10000') && gb && gb.ce === 999 && J(gb.own) === '["hc"]', [sb.co, sb.own, sb.eq, gb && gb.ce]);
    await settle(a); await settle(b);
    const mark = F.now();
    sh(a).give(100); const r = sh(a).buy('h2');
    const got = await until(() => ss(b).own.includes('h2') && ss(b).co === 470 && !a.st().dirty, 5000);
    const ws = F.writes({ frame: 'C1', since: mark, ok: true });
    ok('coins: +100 and a purchase (양머리... 샤워캡 70) on one device reach the other (470, owns it); every write the rules took', r.ok && !!got && ws.length >= 1 && F.writes({ uid: 'uidC', since: mark, ok: false }).length === 0, [r, ss(b).co, ss(b).own, ws.length]);
    ok('coins: the account: 600 earned, 130 spent, items h1 h2 - the slot\'s sp rose by exactly the price', a.st().doc.sum.ce === 600 && a.st().doc.sum.sp === 130 && J(a.st().doc.sum.o) === '["h1","h2"]' && F.get('uidC').s[k].sp === 130, a.st().doc.sum);
    await settle(a); await settle(b);
    // the worn set: buying wore 샤워캡 on device 1 (bought = worn) - it went up with that slot write; device 2 wears it too
    ok('eq: a purchase wears the item (bought = worn, on the pick only): it went up with the slot write, device 2 wears it too', F.get('uidC').eq === eqWith(a, '20000', '10000') && ss(b).eq === '20000' && F.writes({ frame: 'C1', since: mark, ok: true }).some((w) => 'eq' in w.upd && ('s.' + k) in w.upd), [F.get('uidC').eq, ss(b).eq]);
    // taken off on device 2: the account gets it alone (an eq-only write), device 1 follows
    const m2 = F.now();
    sh(b).wear('h', null);
    const eqd = await until(() => F.get('uidC').eq === eqWith(b, '00000', '10000') && ss(a).eq === '00000', 5000);
    const we = F.writes({ frame: 'C2', since: m2, ok: true });
    ok('eq: taking it off on device 2 goes to the account alone (rules: eq only), device 1 follows', !!eqd && we.length === 1 && Object.keys(we[0].upd).sort().join() === 'eq,updatedAt', [F.get('uidC').eq, ss(a).eq, we.map((w) => Object.keys(w.upd))]);
    await settle(a); await settle(b);
    sh(a).wear('h', 'h2');
    await until(() => F.get('uidC').eq === eqWith(a, '20000', '10000') && ss(b).eq === '20000', 5000);
    ok('eq: ... and wearing it again on device 1 reaches device 2 the same way (the last write wins)', F.get('uidC').eq === eqWith(a, '20000', '10000') && ss(b).eq === '20000', [F.get('uidC').eq, ss(b).eq]);
    // (looks-per-animal.md 6.3) both devices offline: device 1 dresses the otter, device 2 undresses the cat -> both
    // changes on both devices and in the account (a write the 2 s rule refused is sent again)
    await settle(a); await settle(b);
    const e0 = F.get('uidC').eq, wantE = e0.slice(0, 10) + '20000' + e0.slice(15, 20) + '00000' + e0.slice(25);
    F.setOnline('pcoin1', false); F.setOnline('pcoin2', false);
    sh(a).wear('h', 'h2', 'otter'); sh(b).wear('h', null, 'cat');
    await sleep(300); F.setOnline('pcoin1', true); F.setOnline('pcoin2', true);
    const conv = await until(() => F.get('uidC').eq === wantE && ss(a).eqs === wantE && ss(b).eqs === wantE && !a.st().dirty && !b.st().dirty, 8000);
    ok('eq: two devices offline dress different animals (otter on 1, cat on 2) -> both changes everywhere', !!conv && e0 !== wantE, [e0, wantE, F.get('uidC').eq, ss(a).eqs, ss(b).eqs]);
    // sign-out: device 2's own store is back
    b.C().signOut(true); await until(() => b.st().st === 'out', 3000);
    ok('coins: signing out on device 2 brings its own store back (999 coins, 황금 대야 투구 worn)', ss(b).co === 999 && J(ss(b).own) === '["hc"]' && ss(b).eq === 'c0000' && ss(b).eqs === X6('c0000'), [ss(b).co, ss(b).own, ss(b).eq]);
    a.remove(); b.remove();
    // an older page's v 1 document: joined as it is; this page's first coin write makes it v 3
    F.put('uidV1', { v: 1, dev: 'vv12vv34', s: { kvvvvvv1: slotOf({ t: 40, g: 1, best: 40 }) }, last: 'kvvvvvv1' });
    const c = await frame('C3', 'pcoin3', { ns: 'tc3' });
    await signIn(c, 'uidV1'); await settle(c);
    ok('v1 -> v3: joining a v 1 document writes nothing (it stays v 1)', F.get('uidV1').v === 1 && !F.writes({ uid: 'uidV1' }).length, F.writes({ uid: 'uidV1' }));
    sh(c).give(25);
    const v2 = await until(() => F.get('uidV1').v === 4 && !c.st().dirty, 5000);
    const dv = F.get('uidV1'), mk = c.st().cs.k;
    ok('v1 -> v3: the first coin write makes it v 3 (rules: the upgrade) - its slot in the v 2 shape, the older slot untouched, no eq added', !!v2 && !('eq' in dv) && dv.s[mk] && dv.s[mk].ce === 25 && Array.isArray(dv.s[mk].o) && !('ce' in dv.s.kvvvvvv1) && dv.s.kvvvvvv1.t === 40, dv);
    c.remove();
    // (looks-per-animal.md 6.1) a seeded v 2 document (eq 10000): read as all six, stays v 2 until this page's next write,
    // which upgrades it with 10000 x 6; one with a junk eq is upgraded with every animal bare
    const v2slot = Object.assign(slotOf({ t: 40, g: 1, best: 40 }), { ce: 100, sp: 60, o: ['h1'], bd: 0, bs: 0 });
    for (const [uid, eq, want, fr0] of [['uidW2', '10000', X6('10000'), 'C5'], ['uidW2j', 'ZZ', X6('00000'), 'C6']]) {
      F.put(uid, { v: 2, dev: 'ww12ww34', eq, s: { kwwwwww1: v2slot }, last: 'kwwwwww1' });
      const e = await frame(fr0, 'p' + fr0, { ns: 't' + fr0 });
      await signIn(e, uid); await settle(e);
      const eqs0 = ss(e).eqs, w0 = F.writes({ uid }).length;
      sh(e).give(25);
      const upg = await until(() => F.get(uid).v === 4 && !e.st().dirty, 5000);
      ok('v2 -> v3: a v 2 document (eq ' + eq + ') joins as ' + eqs0.slice(0, 5) + ' x 6, written nothing; the next write upgrades it with ' + want.slice(0, 5) + ' x 6 (rules took it)',
        eqs0 === want && !w0 && !!upg && F.get(uid).eq === want && F.writes({ uid, ok: false }).length === 0, [eqs0, w0, F.get(uid)]);
      e.remove();
    }
    // a newer page's document (v 5): read-only here, never written
    F.put('uidN', { v: 5, dev: 'nn12nn34', s: { knnnnnn1: slotOf({ t: 40 }) }, last: 'knnnnnn1' });
    const n = await frame('C4', 'pcoin4', { ns: 'tc4' });
    F.prof('pcoin4').next = 'uidN';
    await n.rec(true); await until(() => n.st().parts[1], 3000); n.C().click();
    await until(() => n.st().newer, 4000); await sleep(300);
    ok('newer: a v 4 document is never written (newer, the message says to reload)', n.st().newer && !F.writes({ uid: 'uidN' }).length && n.st().line === '새 버전에서 저장한 기록이에요 · 새로고침해 주세요', [n.st().newer, n.st().line]);
    n.remove();
  }

  // ================================================================ 12. failures (4.3) - and never a console message
  async function failureTests() {
    const e = await frame('E1', 'pe', { ns: 't12' });
    await e.rec(true); await until(() => e.st().parts[1], 3000);
    F.prof('pe').next = 'uidE';
    // popup blocked, not on the authDomain: say so (the next tap opens it straight away)
    F.failNext('popup', 'auth/popup-blocked'); e.C().click();
    await until(() => e.st().st === 'out' && e.st().msg, 2000);
    ok('fail: popup blocked (not on the authDomain) -> "팝업이 막혔어요 · 한 번 더 눌러 주세요", signed out', e.st().st === 'out' && e.st().line === '팝업이 막혔어요 · 한 번 더 눌러 주세요' && !F.calls.some((c) => c.op === 'redirect' && c.frame === 'E1'), e.st());
    // popup blocked on the authDomain -> redirect
    e.C().env({ same: true });
    F.failNext('popup', 'auth/popup-blocked'); e.C().click();
    await until(() => F.calls.some((c) => c.op === 'redirect' && c.frame === 'E1'), 2000);
    let meta = null; try { meta = JSON.parse(e.st().meta); } catch (er) { meta = null; }
    ok('fail: popup blocked on the authDomain -> redirect sign-in, its start remembered (meta.rd)', F.calls.some((c) => c.op === 'redirect' && c.frame === 'E1' && c.prompt === 'select_account') && meta && meta.rd > 0 && e.st().st === 'auth', [e.st().st, meta]);
    // the redirect comes back (a reload in reality): linked, 내 기록 open with its message
    await e.rec(false);
    e.C().reboot();
    await until(() => e.st().st === 'in' && e.st().cs, 4000);
    await until(() => e.recShown() && e.st().line === '구글 계정에 트로피 100개를 저장했어요', 2000);
    ok('fail: ... back from the redirect -> linked, 내 기록 opens with its message', e.st().st === 'in' && e.recShown() && e.st().line === '구글 계정에 트로피 100개를 저장했어요' && e.st().meta === '' && !!F.get('uidE'), [e.st().st, e.recShown(), e.st().line]);
    e.C().env({ app: true, same: true });
    ok('fail: an installed app on the authDomain signs in by redirect; a browser tab by popup; a real frame not at all (\'frame\')', e.st().method === 'redirect' && e.C().env({ same: true }).method === 'popup' && e.C().env(null).method === 'frame');
    e.C().env({});
    e.C().signOut(true); await until(() => e.st().st === 'out', 2000);
    // a closed popup
    F.failNext('popup', 'auth/popup-closed-by-user'); e.C().click();
    await until(() => e.st().msg === 'cancel', 2000);
    ok('fail: popup closed -> "로그인을 취소했어요"', e.st().st === 'out' && e.st().line === '로그인을 취소했어요', e.st());
    // never a sign-in where the stored session would not be this game's alone: a frame (a portal - itch.io serves every
    // game from one origin), a shared host, a page built for one (the itch zip: away) -> 'frame' at boot, nothing asked
    const pops = () => F.calls.filter((c) => (c.op === 'popup' || c.op === 'redirect') && c.frame === 'E1').length, pops0 = pops();
    for (const [what, env, site] of [['a frame', { framed: true }, null], ['a shared host (itch.zone)', { shared: true }, null], ['a page built for one (away)', {}, { away: true }]]) {
      e.C().env(env); if (site) e.C().site(site); e.C().reboot(); await e.rec(true);
      const s = e.st();
      ok('no sign-in on ' + what + ': \'frame\' at once - "' + s.line + '", 새 창에서 열기 -> home', s.st === 'frame' && s.btn === '새 창에서 열기' && s.line === '이 화면에서는 로그인이 안 돼요 · 새 창에서 열어 주세요' && e.C().outside() === HOME && !s.here && s.mark === '', s);
      await e.rec(false); e.C().env({}); e.C().site({ away: false }); e.C().reboot(); await e.rec(true);
      e.C().env(env); if (site) e.C().site(site);
      e.C().click(); await sleep(60);                       // (구글로 로그인 tapped as the page turned out to be one)
      ok('no sign-in on ' + what + ': ... a tap on 구글로 로그인 opens nothing either', e.st().st === 'frame' && pops() === pops0, [e.st().st, pops() - pops0]);
      await e.rec(false); e.C().env({}); e.C().site({ away: false });
    }
    e.C().env({ framed: true }); e.C().site({ home: '' }); e.C().reboot(); await e.rec(true);
    ok('no sign-in in a frame without home: "이 화면에서는 구글 로그인을 쓸 수 없어요", no button (never the portal\'s own address)', e.st().st === 'frame' && e.st().btn === '' && e.st().line === '이 화면에서는 구글 로그인을 쓸 수 없어요' && e.C().outside() === '', [e.st(), e.C().outside()]);
    await e.rec(false); e.C().site({ home: HOME }); e.C().env({}); e.C().reboot();
    // in-app browsers: known at boot - the way out first, never a 구글로 로그인 that cannot work there
    e.C().env({ inApp: true, kakao: true }); e.C().reboot(); await e.rec(true);
    ok('fail: KakaoTalk\'s in-app browser -> \'inapp\' at once (no tap), 다른 브라우저로 열기 -> kakaotalk://web/openExternal', e.st().st === 'inapp' && e.st().btn === '다른 브라우저로 열기' && e.C().outside() === 'kakaotalk://web/openExternal?url=' + encodeURIComponent(HOME) && e.st().line === '앱 안 브라우저에서는 구글 로그인이 안 돼요 · 크롬이나 사파리에서 열어 주세요' && pops() === pops0, [e.st().st, e.C().outside()]);
    e.C().env({ inApp: true, kakao: true, framed: true });
    ok('fail: ... KakaoTalk showing a portal\'s frame: the way out goes to home, never the frame\'s address', e.C().outside() === 'kakaotalk://web/openExternal?url=' + encodeURIComponent(HOME), e.C().outside());
    e.C().env({ inApp: true, android: true });
    ok('fail: another Android in-app browser -> a Chrome intent', /^intent:\/\/pg-cloud-test\.firebaseapp\.com\/#Intent;scheme=https;package=com\.android\.chrome;end$/.test(e.C().outside()), e.C().outside());
    e.C().env({ inApp: true, line: true });
    ok('fail: LINE -> ?openExternalBrowser=1', e.C().outside() === HOME + '?openExternalBrowser=1');
    e.C().env({ inApp: true });
    ok('fail: an iOS in-app browser without a way out: the message only (button hidden)', e.C().outside() === '' && e.st().btn === '' && e.st().st === 'inapp', e.st());
    e.C().env({}); e.C().reboot(); await e.rec(true);
    // the domain is not authorised
    F.failNext('popup', 'auth/unauthorized-domain'); e.C().click();
    await until(() => e.st().msg === 'domain', 2000);
    ok('fail: unauthorized-domain -> "승인되지 않은 주소예요: localhost"', e.st().line === '승인되지 않은 주소예요: localhost', e.st().line);
    F.failNext('popup', 'auth/operation-not-allowed'); e.C().click();
    await until(() => e.st().msg === 'setup', 2000);
    ok('fail: Google sign-in not switched on -> "로그인이 아직 준비되지 않았어요 · 설정을 확인해 주세요"', e.st().line === '로그인이 아직 준비되지 않았어요 · 설정을 확인해 주세요', e.st().line);
    F.failNext('popup', 'auth/internal-error'); e.C().click();
    await until(() => e.st().msg === 'fail', 2000);
    ok('fail: anything else -> "로그인하지 못했어요 · 잠시 뒤에 다시 해 주세요"', e.st().line === '로그인하지 못했어요 · 잠시 뒤에 다시 해 주세요' && e.st().st === 'out', e.st());
    // storage blocked: no sign-in at all
    const P = e.win().Storage.prototype, gi = P.getItem, si = P.setItem;
    P.getItem = function () { throw new Error('blocked'); }; P.setItem = function () { throw new Error('blocked'); };
    try { e.T().ns('t12blocked'); } finally { P.getItem = gi; P.setItem = si; }
    await e.rec(true);
    ok('fail: storage blocked (TRO.mem) -> \'nostore\': "이 브라우저에서는 로그인을 쓸 수 없어요", no button', e.st().st === 'nostore' && e.st().btn === '' && e.st().line === '이 브라우저에서는 로그인을 쓸 수 없어요' && e.st().method === 'nostore', e.st());
    // ... and in a frame (a portal whose frame's site data is refused): it is the frame, not the browser - the way out
    await e.rec(false); e.C().env({ framed: true }); e.C().reboot(); await e.rec(true);
    ok('fail: storage blocked in a frame -> \'frame\', 새 창에서 열기 (home), "새 창에서 열면 기록이 저장되고 로그인도 돼요", the note "이 화면에서는 기록이 저장되지 않아요"',
      e.st().st === 'frame' && e.st().btn === '새 창에서 열기' && e.st().line === '새 창에서 열면 기록이 저장되고 로그인도 돼요' && e.$('pg-rec-note').textContent === '이 화면에서는 기록이 저장되지 않아요', [e.st(), e.$('pg-rec-note').textContent]);
    e.remove();
    // the SDK does not load (both CDNs): say so; the next tap tries again and works
    const e2 = await frame('E2', 'pe2', { ns: 't12b' });
    F.failNext('load', 'blocked', 2);
    await e2.rec(true); await sleep(150);
    F.failNext('load', 'blocked', 2);
    F.prof('pe2').next = 'uidE2';
    e2.C().click();
    await until(() => e2.st().msg === 'sdk', 3000);
    const tried = F.scripts.filter((s) => s.frame === 'E2' && s.part === 'app');
    ok('fail: the SDK blocked -> "로그인 도구를 불러오지 못했어요 · 인터넷이나 광고 차단을 확인해 주세요" (cdnjs, then jsDelivr, both tried)', e2.st().st === 'out' && e2.st().line === '로그인 도구를 불러오지 못했어요 · 인터넷이나 광고 차단을 확인해 주세요' && tried.some((s) => /cdnjs/.test(s.src)) && tried.some((s) => /jsdelivr/.test(s.src) && s.integrity === tried[0].integrity), [e2.st().line, tried.map((s) => s.src)]);
    e2.C().click(); await until(() => e2.st().parts[1], 3000); await sleep(30);
    if (e2.st().st !== 'in') e2.C().click();                // (the first retry tap only loaded: the popup comes from the next)
    ok('fail: ... a later tap loads it and signs in', !!(await until(() => e2.st().st === 'in' && e2.st().cs, 4000)), e2.st());
    e2.remove();
    // a refused write: back off (5 s), then it goes
    await settle(A1);
    const t1 = A1.tro().t, mark = F.now();
    F.failNext('update', 'permission-denied');
    A1.T().set({ t: t1 + 3 });
    await until(() => A1.st().fails === 1, 3000);
    const s1 = A1.st();
    ok('fail: permission-denied on a push -> fails 1, holdUntil >= now + 5 s', s1.fails === 1 && s1.holdUntil >= s1.now + 4000, [s1.fails, s1.holdUntil - s1.now]);
    await until(() => F.sum('uidA') === t1 + 3 && A1.st().fails === 0, 4000);
    ok('fail: ... and the retry after the back-off goes through', F.sum('uidA') === t1 + 3 && A1.st().fails === 0 && F.writes({ frame: 'A1', since: mark }).length === 2, [F.sum('uidA'), t1 + 3, F.writes({ frame: 'A1', since: mark }).map((w) => [w.ok, w.why])]);
    // the free quota is used up
    await settle(A1);
    F.failNext('update', 'resource-exhausted');
    A1.T().set({ t: t1 + 6 });
    await until(() => A1.st().err === 'quota', 3000);
    await A1.rec(true);
    ok('fail: resource-exhausted -> "지금은 저장할 수 없어요 · 나중에 다시 저장돼요", the mark pink, a 1 h pause', A1.st().line === '지금은 저장할 수 없어요 · 나중에 다시 저장돼요' && A1.st().mark === 'pg-tro-cloud is-err' && A1.st().holdUntil - A1.st().now > 3000000, [A1.st().line, A1.st().mark]);
    A1.C().push();
    await until(() => A1.st().err === '' && !A1.st().dirty, 3000);
    ok('fail: ... a later write that goes through clears it', A1.st().err === '' && F.sum('uidA') === t1 + 6 && A1.st().line === '구글 계정에 저장돼요', [F.sum('uidA'), t1 + 6, A1.st().line]);
    await A1.rec(false);
    // a newer page's document: never written
    F.put('uidV', { v: 5, dev: 'vv12vv34', s: { kvvvvvv1: slotOf({ t: 10 }) }, last: 'kvvvvvv1', extra: 'x' });
    const e3 = await frame('E3', 'pv', { ns: 't12c' });
    F.prof('pv').next = 'uidV'; await e3.rec(true); await until(() => e3.st().parts[1], 3000);
    e3.C().click();
    await until(() => e3.st().newer, 3000);
    e3.T().set({ t: 99 }); await sleep(400);
    ok('fail: a v 5 document (a newer page than this v 4 one) -> not linked, "새 버전에서 저장한 기록이에요 · 새로고침해 주세요" stays, nothing written', e3.st().newer && e3.st().st === 'out' && !e3.st().cs && e3.st().line === '새 버전에서 저장한 기록이에요 · 새로고침해 주세요' && F.writes({ uid: 'uidV' }).length === 0 && F.get('uidV').v === 5, [e3.st(), F.writes({ uid: 'uidV' })]);
    e3.remove();
    ok('fail: no callback of game.js threw inside the fake SDK', F.errors.length === 0, F.errors.slice(0, 3));
  }

  // ================================================================ 13. the session lost, the store still linked
  async function relogTests() {
    // B: signed in again (cloud wins), then the session drops
    await signIn(B, 'uidB');
    await settle(B);
    const kb = B.st().cs.k, t0 = B.tro().t;
    F.prof('pb').user = null;                                  // (the session expired / was revoked: no event)
    await B.reload('t5');
    await until(() => B.st().st === 'relog', 4000);
    ok('relog: reload without a session -> \'relog\': the view kept, 다시 로그인, "다시 로그인해 주세요", the mark pink (nothing is saved now)', B.st().st === 'relog' && B.tro().t === t0 && B.st().btn === '다시 로그인' && B.st().mark === 'pg-tro-cloud is-err' && !!B.st().cs, B.st());
    ok('relog: ... the badge says so too (never "저장 대기 중")', / · 다시 로그인해 주세요$/.test(B.$('pg-tro').getAttribute('aria-label')), B.$('pg-tro').getAttribute('aria-label'));
    await B.rec(true);
    ok('relog: ... the line in 내 기록', B.st().line === '다시 로그인해 주세요', B.st().line);
    const mark = F.now();
    B.T().set({ t: B.tro().t + 4 }); await sleep(300);
    ok('relog: play goes on (+4 in the view), nothing written while signed out', B.tro().t === t0 + 4 && F.writes({ frame: 'B1', since: mark }).length === 0 && B.st().dirty === 'hard');
    F.prof('pb').next = 'uidB'; B.C().click();
    await until(() => F.get('uidB').s[kb] && F.get('uidB').s[kb].t === 4 && !B.st().dirty, 4000);
    ok('relog: signing in again (the same account) -> the +4 is pushed into this browser\'s slot', B.st().st === 'in' && F.get('uidB').s[kb].t === 4 && B.tro().t === t0 + 4 && F.sum('uidB') === 124, [F.get('uidB').s[kb], F.sum('uidB')]);
    // the session drops again, the copy gains +7 there (unsaved), and ANOTHER account signs in: this account's copy is
    // parked (not lost), this browser's own (150) comes back and becomes that account's
    await settle(B);
    F.prof('pb').user = null;
    await B.reload('t5');
    await until(() => B.st().st === 'relog', 4000);
    B.T().set({ t: B.tro().t + 7 }); await sleep(100);
    const slotsB = Object.keys(F.get('uidB').s).length;
    ok('relog: (+7 played on the account\'s copy, unsaved)', B.st().dirty === 'hard' && B.tro().t === t0 + 11, [B.st().dirty, B.tro().t]);
    F.prof('pb').next = 'uidY';
    await B.rec(true); await until(() => B.st().parts[1], 2000);
    B.C().click();
    await until(() => B.st().st === 'in' && B.st().cs && B.st().cs.u === 'uidY', 4000);
    const dy = F.get('uidY');
    let park = null; try { park = JSON.parse(B.st().park); } catch (e) { park = null; }
    ok('relog: another account -> this browser\'s own store (150) comes back and becomes that account\'s', B.st().cs.u === 'uidY' && dy && Object.keys(dy.s).length === 1 && dy.s[Object.keys(dy.s)[0]].t === 150 && B.tro().t === 150 && F.sum('uidB') === 124, [dy, B.tro().t]);
    ok('relog: ... the first account\'s copy is parked with its link record and the unsaved +7', park && park.uidB && JSON.parse(park.uidB.s).t === t0 + 11 && JSON.parse(park.uidB.s).cs.k === kb && Object.keys(park).length === 1, park);
    // back to the first account (after signing out of the other): its parked copy returns, the +7 goes into its own slot
    await settle(B);
    B.C().signOut(true); await until(() => B.st().st === 'out', 2000);
    F.prof('pb').next = 'uidB'; B.C().click();
    await until(() => B.st().st === 'in' && B.st().cs && B.st().cs.u === 'uidB' && F.get('uidB').s[kb].t === 11 && !B.st().dirty, 5000);
    ok('relog: signing in with the first account again -> its parked copy is back and the +7 pushed into the same slot (no new slot)', B.st().cs.k === kb && F.get('uidB').s[kb].t === 11 && F.sum('uidB') === 131 && B.tro().t === 131 && Object.keys(F.get('uidB').s).length === slotsB && B.st().park === '', [F.get('uidB').s[kb], F.sum('uidB'), B.tro().t, B.st().park]);
    await B.rec(false);
  }

  // ================================================================ 13b. the Google window left open (the watch, 다시 열기, a late finish)
  async function popupTests() {
    const p = await frame('P1', 'pp', { ns: 't13b' });
    await p.rec(true); await until(() => p.st().parts[1], 3000);
    const pops = () => F.calls.filter((c) => c.op === 'popup' && c.frame === 'P1').length;
    F.popupWait = true; F.prof('pp').next = 'uidP';
    p.C().click(); await sleep(30);
    let s = p.st();
    ok('popup left open: \'auth\' says what to do ("구글 창에서 로그인을 마쳐 주세요") and offers 다시 열기 (tappable, not busy)', s.st === 'auth' && s.pop && s.btn === '다시 열기' && s.line === '구글 창에서 로그인을 마쳐 주세요' && p.$('pg-cloud-btn').getAttribute('aria-disabled') === 'false' && !p.$('pg-cloud-btn').hasAttribute('aria-busy'), s);
    const n1 = pops(); p.C().click(); await sleep(30);
    ok('popup left open: ... a second tap right away is the same tap (no second window)', pops() === n1 && p.st().st === 'auth', [pops(), n1]);
    await sleep(1600);
    p.C().click(); await sleep(60);
    s = p.st();
    ok('popup left open: 다시 열기 later opens it again; the window it replaces (auth/cancelled-popup-request) is no failure', pops() === n1 + 1 && s.st === 'auth' && s.msg === null && s.btn === '다시 열기', [pops() - n1, s.st, s.msg]);
    // the player is back on the game without finishing: 20 s later (fast 0.4 s) the watch says so
    p.win().dispatchEvent(new (p.win().Event)('focus'));
    await until(() => p.st().st === 'out', 3000);
    s = p.st();
    ok('popup left open: back on the game -> 20 s later \'out\', "로그인을 마치지 못했어요 · 다시 눌러 주세요", 구글로 로그인', s.st === 'out' && s.msg === 'late' && s.line === '로그인을 마치지 못했어요 · 다시 눌러 주세요' && s.btn === '구글로 로그인' && !s.user, s);
    // ... and a sign-in finished in that window after all still links here
    F.finishPopup('pp');
    await until(() => p.st().st === 'in' && p.st().cs, 3000);
    ok('popup left open: finished after the watch gave up -> still linked (the upload, "구글 계정에 트로피 100개를 저장했어요")', p.st().cs && p.st().cs.u === 'uidP' && F.sum('uidP') === p.tro().t && p.st().msg === 'up', [p.st().st, p.st().msg, F.get('uidP')]);
    await settle(p);
    p.C().signOut(true); await until(() => p.st().st === 'out', 2000);
    // the watch gave up, then 구글로 로그인 again: the new window cancels the old one - the old one's cancel changes nothing
    F.prof('pp').next = 'uidP2';
    p.C().click(); await sleep(30);
    p.win().dispatchEvent(new (p.win().Event)('focus'));
    await until(() => p.st().st === 'out' && p.st().msg === 'late', 3000);
    p.C().click(); await sleep(60);
    ok('popup left open: 구글로 로그인 after the watch -> a new window, still \'auth\' (no "로그인을 취소했어요")', p.st().st === 'auth' && p.st().msg === null, p.st());
    F.finishPopup('pp');
    await until(() => p.st().st === 'in' && p.st().cs && p.st().cs.u === 'uidP2', 3000);
    ok('popup left open: ... finishing the new window links', p.st().cs && p.st().cs.u === 'uidP2' && !!F.get('uidP2'), p.st());
    F.popupWait = false;
    p.remove();
  }

  // ================================================================ 13c. a first upload whose answer is lost (never twice)
  async function lostAnswerTests() {
    const a = await frame('L1', 'pl', { ns: 't13c' });
    a.T().set({ t: 77, w: 2, g: 5, ko: 4, best: 90 });
    await a.rec(true); await until(() => a.st().parts[1], 3000);
    const orig = F.tx;
    // (a) the transaction commits; its answer comes after the 15 s deadline (fast 0.3 s)
    F.tx = (db, fn) => orig(db, fn).then((v) => sleep(900).then(() => v));
    F.prof('pl').next = 'uidL';
    a.C().click();
    await until(() => !!F.get('uidL') && a.st().st === 'out' && a.st().msg === 'fail', 3000);
    const s1 = a.st(); let meta = null; try { meta = JSON.parse(s1.meta); } catch (e) { meta = null; }
    ok('lost answer: past the deadline (\'out\', "로그인하지 못했어요 …") though the document was made - under the key kept first (meta pk)', !s1.cs && meta && meta.pu === 'uidL' && F.get('uidL').s[meta.pk] && F.get('uidL').s[meta.pk].t === 77, [s1.st, s1.msg, meta, F.get('uidL')]);
    await until(() => a.st().st === 'in' && a.st().cs, 3000);
    F.tx = orig;
    const s2 = a.st();
    ok('lost answer: ... its late answer links it as uploaded ("… 77개를 저장했어요"), that key, guest and meta empty', s2.cs && s2.cs.k === meta.pk && s2.msg === 'up' && s2.guest === '' && s2.meta === '' && Object.keys(F.get('uidL').s).length === 1, s2);
    await settle(a);
    a.C().signOut(true); await until(() => a.st().st === 'out', 2000);
    ok('lost answer: ... sign-out: the 77 in the account only, this browser fresh (not a second 77)', a.tro().t === 100 && F.sum('uidL') === 77, [a.tro().t, F.sum('uidL')]);
    // (b) the answer never comes and the tab is reloaded: the next sign-in knows the slot as this browser's own
    a.T().set({ t: 64, g: 2, w: 1, best: 64 });
    F.tx = (db, fn) => new Promise(() => { orig(db, fn).catch(() => { /* (the test's) */ }); });
    F.prof('pl').next = 'uidL2';
    a.C().click();
    await until(() => !!F.get('uidL2'), 3000);
    await sleep(50);
    F.tx = orig;
    await a.reload('t13c');
    await a.rec(true); await until(() => a.st().parts[1] && a.st().user === 'uidL2', 3000);
    ok('lost answer: (after the reload: signed in, not linked, the trophies still here)', a.st().st === 'out' && !a.st().cs && a.tro().t === 64, [a.st().st, a.tro().t]);
    a.C().click();
    await until(() => a.st().st === 'in' && a.st().cs, 3000);
    const s3 = a.st(), d3 = F.get('uidL2');
    ok('lost answer: ... the next sign-in finishes that upload (its slot, "… 64개를 저장했어요"), never a join over it', s3.cs.k === Object.keys(d3.s)[0] && Object.keys(d3.s).length === 1 && s3.msg === 'up' && s3.guest === '' && a.tro().t === 64, [s3, d3]);
    await settle(a);
    a.C().signOut(true); await until(() => a.st().st === 'out', 2000);
    ok('lost answer: ... sign-out: the 64 in the account only', a.tro().t === 100 && F.sum('uidL2') === 64, [a.tro().t, F.sum('uidL2')]);
    a.remove();
  }

  // ================================================================ 13d. a hold opened in another tab while the store would be swapped
  async function holdRaceTests() {
    F.put('uidH', { v: 1, dev: 'hh12hh34', s: { khhhhhh1: slotOf({ t: 200, w: 5, g: 10, best: 200, bl: 2 }) }, last: 'khhhhhh1' });
    const x = await frame('H1', 'ph', { ns: 't13d' }), y = await frame('H2', 'ph', { ns: 't13d' });
    x.T().set({ t: 100, best: 100 }); await sleep(100);
    const orig = F.tx; F.tx = (db, fn) => sleep(150).then(() => orig(db, fn));
    F.prof('ph').next = 'uidH';
    await x.rec(true); await until(() => x.st().parts[1], 3000);
    x.C().click();
    await until(() => x.st().parts[2], 3000);
    y.T().fast(true);
    const held = y.T().hold('abc123.7', 10, 2, 0);
    await until(() => x.st().msg === 'held', 3000);
    F.tx = orig;
    const s = x.st();
    ok('hold race: a hold opened in another tab during a first sign-in -> no join under it ("경기가 끝난 뒤에 해 주세요"), the store as it was', held && s.st === 'out' && !s.cs && s.guest === '' && x.tro().t === 84 && x.tro().esc.length === 1, [s.st, s.msg, s.guest, x.tro()]);
    const r = y.T().result('abc123.7', [[0, 2, -6, 0, 0]], 0, false);
    await sleep(100);
    ok('hold race: ... the lost battle costs this browser\'s own trophies; the account keeps its 200', r && r.now === 84 && x.tro().t === 84 && F.sum('uidH') === 200, [r, x.tro().t, F.sum('uidH')]);
    x.C().click();
    await until(() => x.st().st === 'in' && x.st().cs, 3000);
    let g = null; try { g = JSON.parse(x.st().guest); } catch (e) { g = null; }
    ok('hold race: ... the next tap joins (the account\'s 200, this browser\'s 84 put aside)', x.tro().t === 200 && g && g.t === 84 && !g.esc.length, [x.tro().t, g]);
    await settle(x);
    // another account over a lost session while a hold opens elsewhere: nothing parked or swapped under it
    F.prof('ph').user = null; F.notify(F.prof('ph'));
    await until(() => x.st().st === 'relog', 2000);
    F.popupWait = true; F.prof('ph').next = 'uidH2';
    x.C().click(); await sleep(40);
    y.T().hold('abc123.8', 10, 2, 0);
    F.finishPopup('ph'); F.popupWait = false;
    await until(() => x.st().msg === 'held', 3000);
    ok('hold race: another account over a lost session with a hold open elsewhere -> not swapped, not parked (\'relog\', "경기가 끝난 뒤에 해 주세요")', x.st().st === 'relog' && x.st().cs && x.st().cs.u === 'uidH' && x.st().park === '' && !F.get('uidH2'), x.st());
    y.T().close('abc123.8', 'forfeit', 'test');
    x.remove(); y.remove();
  }

  // ================================================================ 14. UI fit (1x, 2x, a 320 px phone) and the keyboard
  function setScale(fr, s) {
    const st = fr.$('pg-stage'); st.style.flex = 'none'; st.style.width = Math.round(256 * s + 22) + 'px'; st.style.height = Math.round(224 * s + 22) + 'px';
    const W = fr.win(); W.dispatchEvent(new W.Event('resize'));
  }
  function measure(fr, label) {
    const W = fr.win(), sc = fr.$('pg-screen'), fs = parseFloat(W.getComputedStyle(sc).fontSize), sr = sc.getBoundingClientRect();
    const card = fr.$('pg-rec').querySelector('.pg-rec-card'), r = card.getBoundingClientRect();
    info(label + ': screen ' + Math.round(sr.width) + 'x' + Math.round(sr.height) + ' (' + (sr.width / fs).toFixed(1) + 'x' + (sr.height / fs).toFixed(1) + 'em) 내 기록 ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' scroll ' + card.scrollHeight + '/' + card.clientHeight + ' line "' + fr.st().line + '"');
    ok(label + ': 내 기록 fits (no scrolling)', card.scrollHeight <= card.clientHeight + 1 && r.bottom <= sr.bottom + 0.5 && r.top >= sr.top - 0.5, [card.scrollHeight, card.clientHeight]);
    const btn = fr.$('pg-cloud-btn'), close = fr.$('pg-rec-close');
    if (!btn.hidden) { const a = btn.getBoundingClientRect(), b = close.getBoundingClientRect(); ok(label + ': the button row is one line', Math.abs(a.top - b.top) < 2 && a.right <= b.left, [a.top, b.top]); }
    const tx = fr.$('pg-cloud-tx'), lh = parseFloat(W.getComputedStyle(fr.$('pg-cloud')).lineHeight) || parseFloat(W.getComputedStyle(fr.$('pg-cloud')).fontSize) * 1.3;
    const parts = [...tx.querySelectorAll('.pg-cloud-c')], lines = tx.getClientRects().length;
    if (parts.length) ok(label + ': the status line: ' + parts.length + ' parts, each on one line (a break only after its ·)', parts.every((c) => c.getBoundingClientRect().height < lh * 1.6) && lines <= parts.length && tx.querySelector('.pg-cloud-c .pg-cloud-ic') === parts[0].firstChild, [lines, parts.map((c) => Math.round(c.getBoundingClientRect().height)), lh]);
    else ok(label + ': the status line is one line', lines === 1 && tx.getBoundingClientRect().height < lh * 1.6, [lines, tx.getBoundingClientRect().height, lh]);
  }
  function measureTitle(fr, label) {
    const W = fr.win(), sc = fr.$('pg-screen'), fs = parseFloat(W.getComputedStyle(sc).fontSize), sr = sc.getBoundingClientRect();
    const card = fr.win().document.querySelector('.pg-title-card'), r = card.getBoundingClientRect();
    ok(label + ' title: the card fits with the cloud mark (and the install hint)', card.scrollHeight <= card.clientHeight + 1 && r.bottom <= sr.bottom + 0.5, [card.scrollHeight, card.clientHeight]);
    const hi = W.document.querySelector('.pg-best-hi').getBoundingClientRect(), b = fr.$('pg-tro').getBoundingClientRect();
    const one = Math.abs((hi.top + hi.bottom) / 2 - (b.top + b.bottom) / 2) < b.height / 2;
    const best = W.document.querySelector('.pg-title-card .pg-best'), br = best.getBoundingClientRect();
    info(label + ' title: line ' + (br.width / fs).toFixed(2) + 'em, score ' + (hi.width / fs).toFixed(2) + 'em, badge ' + (b.width / fs).toFixed(2) + 'em, card scroll ' + card.scrollHeight + '/' + card.clientHeight);
    if (sr.width / fs >= 23) ok(label + ' title: the badge (with its mark) shares the 최고 점수 line', one, [hi.top, b.top]);
    else info(label + ' title: ' + (sr.width / fs).toFixed(1) + 'em wide: the badge ' + (one ? 'shares the line' : 'wraps'));
  }
  async function stage(fr, st, uid) {
    if (st === 'out' && fr.st().st !== 'out') { fr.C().signOut(true); await until(() => fr.st().st === 'out', 2000); }
    if (st === 'in' && fr.st().st !== 'in') await signIn(fr, uid);
    if (st === 'relog') { if (fr.st().st !== 'in') await signIn(fr, uid); F.prof(fr.prof).user = null; F.notify(F.prof(fr.prof)); await until(() => fr.st().st === 'relog', 2000); }
    // (any message of the change runs out - 8 s, fast 160 ms, counted from when 내 기록 shows it: the state's own line)
    await fr.rec(true); await until(() => !fr.st().msg, 2000);
  }
  async function uiTests() {
    const u = await frame('U1', 'pu', { ns: 't14', w: 900, h: 760, fast: true });
    u.D().pwa({ ios: true, framed: false });                    // (the install hint shows on the 최고 점수 line too)
    u.D().G.hiscore = 1234567; u.T().set({ t: 1234, seen: 1 });
    for (const st of ['out', 'in', 'relog']) {
      await stage(u, st, 'uidU');
      for (const s of [1, 2]) {
        setScale(u, s); await sleep(120);
        await u.rec(false); u.D().toTitle(); await sleep(80);
        u.D().G.hiscore = 1234567; u.$('pg-title-hi').textContent = (1234567).toLocaleString('ko-KR');
        await sleep(30);
        measureTitle(u, s + 'x \'' + st + '\'');
        await u.rec(true); await sleep(80);
        measure(u, s + 'x \'' + st + '\'');
      }
    }
    // the keyboard: Enter on the focused sign-in button presses it and does not close the card; Escape closes
    await stage(u, 'in', 'uidU'); await stage(u, 'out');
    setScale(u, 2); await u.rec(true);
    await sleep(120);                                          // (after 내 기록's own focus of 닫기)
    const W = u.win(), btn = u.$('pg-cloud-btn');
    btn.focus();
    const ev = new W.KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true, cancelable: true });
    btn.dispatchEvent(ev);
    ok('keys: Enter on the focused 구글로 로그인 keeps 내 기록 open and is left to the button (not prevented)', u.recShown() && !ev.defaultPrevented);
    F.prof('pu').next = 'uidU';
    btn.click();                                               // (what the browser does with that Enter)
    await until(() => u.st().st === 'in', 3000);
    ok('keys: ... the button signs in; the focus stays on it', u.st().st === 'in' && W.document.activeElement === btn, [u.st().st, W.document.activeElement && W.document.activeElement.id]);
    const sp = new W.KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
    btn.dispatchEvent(sp);
    ok('keys: Space on it does not close the card either', u.recShown() && !sp.defaultPrevented);
    W.dispatchEvent(new W.KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }));
    await sleep(40);
    ok('keys: Escape closes 내 기록', !u.recShown());
    u.remove();
    // a 320 px phone (touch)
    const p = await frame('U2', 'pu2', { ns: 't14b', w: 320, h: 568 });
    { const W = p.win(); W.dispatchEvent(new W.Event('touchstart')); } await sleep(100);
    p.D().pwa({ ios: true, framed: false });
    p.D().G.hiscore = 1234567; p.T().set({ t: 1234, seen: 1 });
    F.prof('pu2').next = 'uidU2';
    for (const st of ['out', 'in', 'relog']) {
      await stage(p, st, 'uidU2');
      await p.rec(false); p.D().toTitle(); await sleep(80);
      p.$('pg-title-hi').textContent = (1234567).toLocaleString('ko-KR'); await sleep(30);
      measureTitle(p, '320x568 \'' + st + '\'');
      await p.rec(true); await sleep(80);
      measure(p, '320x568 \'' + st + '\'');
    }
    p.remove();
    // an iPhone's 390x844 less its insets (the review's misfit: a new player's 2-line note + a 2-line line), and a 360 /
    // 412 phone: every 2-part line and message fits 내 기록 without scrolling, and breaks only after its ·
    for (const [w, h] of [[390, 763], [360, 756], [412, 891]]) {
      const q = await frame('U3', 'pu3', { ns: 't14c', w, h });
      { const W = q.win(); W.dispatchEvent(new W.Event('touchstart')); } await sleep(100);
      q.T().set({ t: 30, g: 0, w: 0, ko: 0, de: 0, seen: 1 });
      await q.rec(true); await sleep(80);
      const keys = Object.keys(q.C().texts()).filter((k) => / · /.test(q.C().texts()[k]));
      const bad = [], card = q.$('pg-rec').querySelector('.pg-rec-card');
      for (const st of ['out', 'inapp']) {
        if (st === 'inapp') { await q.rec(false); q.C().env({ inApp: true, kakao: true }); q.C().reboot(); await q.rec(true); await sleep(60); }
        for (const k of [null].concat(keys)) {
          if (k) q.C().say(k, 1234567, 12345);
          await sleep(30);
          const tx = q.$('pg-cloud-tx'), lh = parseFloat(q.win().getComputedStyle(q.$('pg-cloud')).lineHeight), parts = [...tx.querySelectorAll('.pg-cloud-c')];
          const over = card.scrollHeight - card.clientHeight, split = parts.some((c) => c.getBoundingClientRect().height > lh * 1.6);
          if (over > 1 || split) bad.push(st + '/' + (k || 'line') + ': ' + (over > 1 ? 'scroll ' + card.scrollHeight + '/' + card.clientHeight + ' ' : '') + (split ? 'a part on 2 lines' : ''));
        }
      }
      info(w + 'x' + h + ' 2-part lines: note "' + q.$('pg-rec-note').textContent + '" shown ' + (q.win().getComputedStyle(q.$('pg-rec-note')).display !== 'none') + ', ladder shown ' + (q.win().getComputedStyle(q.$('pg-rec-ladder')).display !== 'none'));
      ok(w + 'x' + h + ' phone, a new player: every 2-part line / message (' + keys.length + ') fits 내 기록 with 구글로 로그인 and 다른 브라우저로 열기, no part split', bad.length === 0, bad.slice(0, 6));
      q.remove();
    }
  }

  // ================================================================ 15. the web fonts know every cloud syllable
  async function fontTests() {
    const f = await frame('W1', 'pw', { ns: 't15' });
    const C = f.C(), tx = C.texts(), bt = C.buttons();
    const strs = Object.keys(tx).map((k) => tx[k].replace('{0}', '1,234').replace('{1}', '56')).concat(Object.keys(bt).map((k) => bt[k]));
    const miss = new Set();
    for (const q of ['.pg-fw-sign', '.pg-fw-body']) {
      const warm = f.win().document.querySelector('#pg-fontwarm ' + q).textContent;
      for (const s of strs) for (const ch of s) if (/[\uac00-\ud7a3…·]/.test(ch) && warm.indexOf(ch) < 0) miss.add(q + ':' + ch);
    }
    ok('fonts: every syllable of every cloud line, message and button is warmed in both faces', miss.size === 0, [...miss].join(''));
    f.remove();
  }

  // ================================================================ 16. the deploy WITHOUT a config
  async function noConfigTests() {
    const n = await frame('N1', 'pn', { src: '/deploy-nocfg/index.html', ns: 't16', fast: false });
    const W = n.win(), st = n.st();
    ok('no config: no PG_CLOUD, the cloud off', W.PG_CLOUD === undefined && st.on === false && st.st === 'off', st);
    await n.rec(true); await sleep(300);
    const s2 = n.st();
    ok('no config: 내 기록 has no login UI (button, line, mark hidden; no has-cloud)', n.$('pg-cloud-btn').hidden && n.$('pg-cloud').hidden && n.$('pg-tro-cloud').hidden && !n.$('pg-rec').querySelector('.pg-rec-card').classList.contains('has-cloud'));
    ok('no config: no SDK request at all (no script element, no resource, the loader never ran)', s2.loads === 0 && !F.scripts.some((s) => s.frame === 'N1') && ![...W.document.scripts].some((s) => /compat|firebase/i.test(s.src)) && !W.performance.getEntriesByType('resource').some((r) => /compat\.js|firebase/i.test(r.name)), s2);
    ok('no config: the page source has nothing of Firebase', !/firebase|PG_CLOUD\s*=/i.test(W.document.documentElement.outerHTML) && W.document.getElementById('pg-fontwarm').textContent.indexOf('구글로 로그인') < 0);
    n.remove();
  }

  // ================================================================ 17. PG.debug.cloud.start on this artifact-skeleton page
  async function startTests() {
    const C = PG.debug.cloud, T = PG.debug.tro;
    T.ns('t17'); T.set({ t: 64 });
    const ns = F.ns('main', 'main', true);
    C.start({ apiKey: 'x', authDomain: 'pg-cloud-test.firebaseapp.com', projectId: 'pg-cloud-test', appId: '1:1:web:1' }, ns);
    C.fast(true); C.clock(F.now); C.reboot();
    T.openRec(); await sleep(60);
    F.prof('main').next = 'uidM'; C.click();
    await until(() => C.state().st === 'in' && C.state().cs, 3000);
    ok('start(): the artifact skeleton with a fake SDK signs in and uploads - and never makes a script element', C.state().st === 'in' && F.get('uidM') && F.sum('uidM') === 64 && C.state().loads === 0 && ![...document.scripts].some((s) => s.src), C.state());
    T.closeRec();
  }


  // ================================================================ 19a. 친구 순위: the rules, case by case (design/friends.md 3, 6)
  function palRulesTests() {
    const TS = F.TS, now = F.now(), T0 = new TS(now - 60000), SV = F.SV.ts;
    const prof = (code, o) => Object.assign({ v: 1, code, nick: '뽀숑', st: 5, hi: 100, tr: 30, c: 0, lk: '00000', at: T0 }, o);
    const world = () => new Map([['profiles/A', prof('AAAA2222')], ['codes/AAAA2222', { u: 'A' }], ['profiles/B', prof('BBBB3333', { nick: '비비', c: 2, lk: '10100' })],
      ['codes/BBBB3333', { u: 'B' }], ['profiles/C', prof('CCCC4444', { nick: '씨씨' })], ['codes/CCCC4444', { u: 'C' }]]);
    const W0 = world(), ev = (W, auth, ws) => F.pEval(W, auth, ws, now), rd = (W, auth, op, q, limit) => F.pRead(W, auth, op, q, limit);
    const yes = (name, W, auth, ws) => { const r = ev(W, auth, ws); ok('friends rules: ' + name + ' (allowed)', !r.why, r.why); return r; };
    const no = (name, W, auth, ws) => { const r = ev(W, auth, ws); ok('friends rules: ' + name + ' (refused)', !!r.why, r.calls); return r; };
    const with2 = (pairs) => { const W = world(); for (const [k, v] of pairs) W.set(k, v); return W; };
    // reads
    const Wf = with2([['friends/A/f/C', { at: T0 }], ['friends/C/f/A', { at: T0 }]]);
    ok('friends rules: the owner gets its card', rd(W0, 'A', 'get', 'profiles/A') === '');
    ok('friends rules: a stranger (or nobody) cannot get a card', rd(W0, 'C', 'get', 'profiles/A') !== '' && rd(W0, null, 'get', 'profiles/A') !== '');
    ok('friends rules: an accepted friend gets the card, others still not', rd(Wf, 'C', 'get', 'profiles/A') === '' && rd(Wf, 'B', 'get', 'profiles/A') !== '');
    ok('friends rules: profiles / codes / outbox are never listed', ['profiles', 'codes', 'outbox'].every((c) => rd(W0, 'A', 'list', c, 1) !== ''));
    ok('friends rules: a code is read signed in only', rd(W0, 'B', 'get', 'codes/AAAA2222') === '' && rd(W0, null, 'get', 'codes/AAAA2222') !== '');
    ok('friends rules: another\'s inbox / friend list is never listed', rd(W0, 'B', 'list', 'reqs/A/in', 20) !== '' && rd(W0, 'B', 'list', 'friends/A/f', 60) !== '');
    ok('friends rules: my own lists - without a limit or over it refused, at the limit allowed', rd(W0, 'A', 'list', 'reqs/A/in') !== '' && rd(W0, 'A', 'list', 'reqs/A/in', 21) !== ''
      && rd(W0, 'A', 'list', 'reqs/A/in', 20) === '' && rd(W0, 'A', 'list', 'friends/A/f') !== '' && rd(W0, 'A', 'list', 'friends/A/f', 61) !== '' && rd(W0, 'A', 'list', 'friends/A/f', 60) === '');
    ok('friends rules: a pair half is read by its two members only', rd(Wf, 'A', 'get', 'friends/C/f/A') === '' && rd(Wf, 'C', 'get', 'friends/C/f/A') === '' && rd(Wf, 'B', 'get', 'friends/C/f/A') !== '');
    ok('friends rules: an outbox is its owner\'s alone', rd(W0, 'A', 'get', 'outbox/A') === '' && rd(W0, 'B', 'get', 'outbox/A') !== '');
    // the first card (and its code)
    const card = (code, o) => Object.assign({ v: 1, code, nick: '디디', st: 0, hi: 0, tr: 100, c: 1, lk: '00000', at: SV }, o);
    const mk = (code, o, u) => [{ path: 'codes/' + code, kind: 'set', data: { u: u || 'D' } }, { path: 'profiles/D', kind: 'set', data: card(code, o) }];
    no('a first card without its code document', W0, 'D', [{ path: 'profiles/D', kind: 'set', data: card('DDDD5555') }]);
    no('a first card with another account\'s code document', with2([['codes/DDDD5555', { u: 'B' }]]), 'D', [{ path: 'profiles/D', kind: 'set', data: card('DDDD5555') }]);
    const r1 = yes('a first card with its own new code document', W0, 'D', mk('DDDD5555'));
    ok('friends rules: ... within the rule-call limits (<= 10 a write, <= 20 a batch)', r1.calls > 0 && r1.calls <= 20, r1.calls);
    no('a first card with an extra key (email)', W0, 'D', mk('DDDD5555', { email: 'x' }));
    no('a first card missing a key (lk)', W0, 'D', mk('DDDD5555', { lk: undefined }));
    no('a code document for somebody else', W0, 'D', mk('DDDD5555', {}, 'B'));
    no('a second code for an account that has its card', W0, 'A', [{ path: 'codes/ZZZZ9999', kind: 'set', data: { u: 'A' } }]);
    no('a taken code (its document exists: an update)', W0, 'D', mk('AAAA2222'));
    no('a code outside the alphabet (O)', W0, 'D', mk('DDDD555O'));
    // card writes
    const upd = (o, at) => [{ path: 'profiles/A', kind: 'update', data: Object.assign({ at: at || SV }, o) }];
    for (const k of ['email', 'name', 'photo']) no('a card write with ' + k, W0, 'A', upd({ [k]: 'x' }));
    no('a card write: a nick of 25', W0, 'A', upd({ nick: 'ㄱ'.repeat(25) }));
    no('a card write: lk of 6', W0, 'A', upd({ lk: '000000' }));
    no('a card write: st 2401', W0, 'A', upd({ st: 2401 }));
    no('a card write: st lower', W0, 'A', upd({ st: 4 }));
    no('a card write: hi lower', W0, 'A', upd({ hi: 99 }));
    no('a card write: code changed', W0, 'A', upd({ code: 'ZZZZ9999' }));
    no('a card write: v changed', W0, 'A', upd({ v: 2 }));
    no('a card write: at not the server time', W0, 'A', upd({}, new TS(now - 1)));
    no('a card write by another account', W0, 'B', upd({ st: 9 }));
    no('a card write within 5 s of the last', with2([['profiles/A', prof('AAAA2222', { at: new TS(now - 3000) })]]), 'A', upd({ st: 9 }));
    yes('a card write (st / hi up, nick, look, animal, trophies)', W0, 'A', upd({ st: 29, hi: 12340, nick: '뽀숑2', lk: '10100', c: 3, tr: 320 }));
    ok('friends rules: a card is never deleted', !!ev(W0, 'A', [{ path: 'profiles/A', kind: 'delete' }]).why && !!ev(W0, 'A', [{ path: 'codes/AAAA2222', kind: 'delete' }]).why);
    // requests
    const rq = (to, from, o) => ({ path: 'reqs/' + to + '/in/' + from, kind: 'set', data: Object.assign({ n: '뽀숑', cd: 'AAAA2222', c: 0, lk: '00000', at: SV }, o) });
    const out = (u) => ({ path: 'outbox/' + u, kind: 'set', data: { rq: SV } });
    no('a request without the outbox bump', W0, 'A', [rq('B', 'A')]);
    no('a request whose nick is not the sender\'s card\'s', W0, 'A', [out('A'), rq('B', 'A', { n: '가짜' })]);
    no('a request whose look is not the card\'s', W0, 'A', [out('A'), rq('B', 'A', { lk: '10100' })]);
    no('a request to myself', W0, 'A', [out('A'), rq('A', 'A')]);
    no('a request to somebody who is not a player', W0, 'A', [out('A'), rq('Q', 'A')]);
    no('a request written as somebody else', W0, 'B', [out('B'), rq('C', 'A')]);
    no('a request while already friends', with2([['friends/A/f/B', { at: T0 }], ['friends/B/f/A', { at: T0 }]]), 'A', [out('A'), rq('B', 'A')]);
    no('a request while the other\'s request to me waits', with2([['reqs/A/in/B', { n: '비비', cd: 'BBBB3333', c: 2, lk: '10100', at: T0 }]]), 'A', [out('A'), rq('B', 'A')]);
    no('a request with an extra key', W0, 'A', [out('A'), rq('B', 'A', { msg: 'hi' })]);
    const Wq = with2([['reqs/B/in/A', { n: '뽀숑', cd: 'AAAA2222', c: 0, lk: '00000', at: T0 }], ['outbox/A', { rq: new TS(now - 60000) }]]);
    no('a request sent again (its document exists)', Wq, 'A', [out('A'), rq('B', 'A')]);
    no('a request within 20 s of the last (the outbox)', with2([['outbox/A', { rq: new TS(now - 10000) }]]), 'A', [out('A'), rq('B', 'A')]);
    const r2 = yes('a request (outbox + request, the sender\'s own card values)', W0, 'A', [out('A'), rq('B', 'A')]);
    ok('friends rules: ... within the rule-call limits', r2.calls > 0 && r2.calls <= 20, r2.calls);
    yes('a request 21 s after the last', with2([['outbox/A', { rq: new TS(now - 21000) }]]), 'A', [out('A'), rq('B', 'A')]);
    ok('friends rules: the sender withdraws, the receiver declines; nobody else deletes it', !ev(Wq, 'A', [{ path: 'reqs/B/in/A', kind: 'delete' }]).why
      && !ev(Wq, 'B', [{ path: 'reqs/B/in/A', kind: 'delete' }]).why && !!ev(Wq, 'C', [{ path: 'reqs/B/in/A', kind: 'delete' }]).why);
    ok('friends rules: a request is never updated', !!ev(Wq, 'A', [{ path: 'reqs/B/in/A', kind: 'update', data: { n: '뽀숑' } }]).why);
    // accept (B accepts A's request in Wq) / unfriend
    const pair = (a, b, o) => ({ path: 'friends/' + a + '/f/' + b, kind: 'set', data: Object.assign({ at: SV }, o) }), del = (q) => ({ path: q, kind: 'delete' });
    const r3 = yes('accept by the receiver: both halves, the request consumed', Wq, 'B', [pair('B', 'A'), pair('A', 'B'), del('reqs/B/in/A'), del('reqs/A/in/B')]);
    ok('friends rules: ... the accept batch\'s rule calls (8 of 20)', r3.calls === 8, r3.calls);
    no('accept with one half missing', Wq, 'B', [pair('B', 'A'), del('reqs/B/in/A')]);
    no('accept without consuming the request', Wq, 'B', [pair('B', 'A'), pair('A', 'B')]);
    no('"accept" by the sender', Wq, 'A', [pair('A', 'B'), pair('B', 'A'), del('reqs/B/in/A')]);
    no('"accept" by a third party', Wq, 'C', [pair('A', 'B'), pair('B', 'A'), del('reqs/B/in/A')]);
    no('accept with no request', W0, 'B', [pair('B', 'A'), pair('A', 'B')]);
    no('accept with an extra key in a pair document', Wq, 'B', [pair('B', 'A', { x: 1 }), pair('A', 'B'), del('reqs/B/in/A')]);
    ok('friends rules: unfriend by either member (both halves at once)', !ev(Wf, 'A', [del('friends/A/f/C'), del('friends/C/f/A')]).why && !ev(Wf, 'C', [del('friends/A/f/C'), del('friends/C/f/A')]).why);
    no('unfriend by a third party', Wf, 'B', [del('friends/A/f/C'), del('friends/C/f/A')]);
    no('a pair document updated', Wf, 'A', [{ path: 'friends/A/f/C', kind: 'update', data: { at: SV } }]);
    ok('friends rules: a players document never goes through these rules', !!ev(W0, 'A', [{ path: 'players/A', kind: 'set', data: {} }]).why);
    // ---- 친구 초대 (invites/{to}/in/{from}, ivbox/{uid}): A and C are friends (both halves), B is not
    const iv = (to, from, o) => ({ path: 'invites/' + to + '/in/' + from, kind: 'set', data: Object.assign({ code: 'ab12', mode: 'coop', nick: '뽀숑', at: SV }, o) });
    const ivb = (u, o) => ({ path: 'ivbox/' + u, kind: 'set', data: Object.assign({ at: SV }, o) });
    const IV = (to, from, nick) => ['invites/' + to + '/in/' + from, { code: 'ab12', mode: 'coop', nick: nick || '뽀숑', at: T0 }];
    const yi = (name, W, auth, ws) => { const r = ev(W, auth, ws); ok('invite rules: ' + name + ' (allowed)', !r.why, r.why); return r; };
    const ni = (name, W, auth, ws) => { const r = ev(W, auth, ws); ok('invite rules: ' + name + ' (refused)', !!r.why, r.calls); return r; };
    const i1 = yi('a friend invites with the ivbox bumped (first invite: the ivbox created)', Wf, 'A', [ivb('A'), iv('C', 'A')]);
    ok('invite rules: ... the invite as written, the ivbox at the same time', J(Object.keys(i1.after.get('invites/C/in/A') || {}).sort()) === J(['at', 'code', 'mode', 'nick']) && !!i1.after.get('ivbox/A') && i1.calls <= 4, i1.calls);
    yi('battle, a 12-character nick', Wf, 'A', [ivb('A'), iv('C', 'A', { mode: 'battle', nick: '거품거품거품거품거품거품' })]);
    ni('an invite without the ivbox bump', Wf, 'A', [iv('C', 'A')]);
    ni('an invite to somebody who is not my friend', Wf, 'A', [ivb('A'), iv('B', 'A')]);
    ni('an invite when only my half of the pair is left (the receiver unfriended me)', with2([['friends/A/f/C', { at: T0 }]]), 'A', [ivb('A'), iv('C', 'A')]);
    yi('... and when only the receiver\'s half is (it still lets me read its card)', with2([['friends/C/f/A', { at: T0 }]]), 'A', [ivb('A'), iv('C', 'A')]);
    ni('an invite written as somebody else', Wf, 'B', [ivb('B'), iv('C', 'A')]);
    ni('an invite signed out', Wf, null, [ivb('A'), iv('C', 'A')]);
    ni('an invite to myself', with2([['friends/A/f/A', { at: T0 }]]), 'A', [ivb('A'), iv('A', 'A')]);
    for (const [why, o] of [['an upper-case code', { code: 'AB12' }], ['a 5-character code', { code: 'ab123' }], ['a code with a dash', { code: 'ab-1' }], ['a numeric code', { code: 1234 }],
      ['another mode', { mode: 'solo' }], ['an empty nick', { nick: '' }], ['a 25-unit nick', { nick: 'x'.repeat(25) }], ['a nick that is no string', { nick: 7 }],
      ['a time of the page\'s clock', { at: new TS(now - 1000) }], ['an extra key', { x: 1 }]]) ni('an invite with ' + why, Wf, 'A', [ivb('A'), iv('C', 'A', o)]);
    { const d = iv('C', 'A'); delete d.data.nick; ni('an invite without its nick', Wf, 'A', [ivb('A'), d]); }
    const Wi = with2([['friends/A/f/C', { at: T0 }], ['friends/C/f/A', { at: T0 }], IV('C', 'A'), ['ivbox/A', { at: new TS(now - 5000) }]]);
    ni('a second invite 5 s after the last (the ivbox\'s 10 s)', Wi, 'A', [ivb('A'), iv('C', 'A', { code: 'cd34' })]);
    const Wj = with2([['friends/A/f/C', { at: T0 }], ['friends/C/f/A', { at: T0 }], IV('C', 'A'), ['ivbox/A', { at: new TS(now - 11000) }]]);
    yi('a new invite replaces mine 11 s on (one per sender -> receiver)', Wj, 'A', [ivb('A'), iv('C', 'A', { code: 'cd34', mode: 'battle' })]);
    ni('an ivbox with an extra key / another\'s ivbox', Wj, 'A', [ivb('A', { n: 1 }), iv('C', 'A')]);
    ni('another\'s ivbox bumped', Wj, 'B', [ivb('A')]);
    ni('an ivbox deleted (a fresh cooldown)', Wj, 'A', [{ path: 'ivbox/A', kind: 'delete' }]);
    ok('invite rules: the receiver reads and lists its invites (<= 50); the sender and others cannot read; nobody lists another\'s',
      rd(Wi, 'C', 'get', 'invites/C/in/A') === '' && rd(Wi, 'C', 'list', 'invites/C/in', 50) === '' && rd(Wi, 'C', 'list', 'invites/C/in', 51) !== '' && rd(Wi, 'C', 'list', 'invites/C/in') !== ''
      && rd(Wi, 'A', 'get', 'invites/C/in/A') !== '' && rd(Wi, 'B', 'get', 'invites/C/in/A') !== '' && rd(Wi, 'A', 'list', 'invites/C/in', 50) !== '' && rd(Wi, null, 'list', 'invites/C/in', 50) !== '');
    ok('invite rules: the receiver (joined / 나중에) and the sender (room closed) delete it; nobody else',
      !ev(Wi, 'C', [del('invites/C/in/A')]).why && !ev(Wi, 'A', [del('invites/C/in/A')]).why && !!ev(Wi, 'B', [del('invites/C/in/A')]).why && !!ev(Wi, null, [del('invites/C/in/A')]).why);
    ni('the receiver rewriting the invite', Wj, 'C', [ivb('C'), iv('C', 'A')]);
    ok('invite rules: the ivbox is read by its owner only, never listed', rd(Wi, 'A', 'get', 'ivbox/A') === '' && rd(Wi, 'C', 'get', 'ivbox/A') !== '' && rd(Wi, 'A', 'list', 'ivbox', 1) !== '');
  }

  // ================================================================ 19b. 친구 순위 through the frames (design/friends.md 6)
  const PALP = (fr) => fr.D().pal, PS = (fr) => fr.D().pal.state();
  const isPal = (c) => /(^|[ ,])(profiles|codes|reqs|friends|outbox)\//.test(c.path || '');
  const palN = (frame, since, ops) => F.calls.slice(since).filter((c) => c.frame === frame && isPal(c) && (!ops || ops.includes(c.op))).length;
  const pwrites = (q, since) => F.plog.slice(since).filter((e) => e.ok && e.tag === 'update' && e.w.includes('update ' + q));
  const fmt = (c) => c.slice(0, 4) + '-' + c.slice(4);
  async function palFrameTests() {
    const TX = PG.debug.pal.texts(), say = async (fr, code) => (await PALP(fr).add(code)).said;
    const A = await frame('PA', 'ppa', { ns: 'p19a' });
    await A.rec(true);
    {
      const b = A.$('pg-pal-btn'), card = A.$('pg-rec').querySelector('.pg-rec-card'), h2 = A.$('pg-rec-h');
      const rg = A.win().document.createRange(); rg.selectNodeContents(h2);
      const r = b ? b.getBoundingClientRect() : null, c = card.getBoundingClientRect(), t = rg.getBoundingClientRect();
      ok('friends: 내 기록 has the 친구 순위 button (in the card, clear of its title)', !!r && r.right <= c.right + 0.5 && r.top >= c.top - 0.5 && (r.left >= t.right || r.bottom <= t.top), r && [r.left, r.right, t.left, t.right]);
    }
    let c0 = F.calls.length;
    PALP(A).open(); await sleep(80);
    let st = PS(A);
    ok('friends: signed out - the invite line and 구글로 로그인 only', st.shown && st.view === 'guest' && st.gline === TX.guest && !A.$('pg-pal-login').hidden && A.$('pg-pal-login').textContent === TX.login && A.$('pg-pal-add').hidden, st);
    ok('friends: ... and no friend call', palN('PA', c0) === 0, F.calls.slice(c0));
    key(A, 'Escape'); await sleep(80);
    ok('friends: Escape goes back to 내 기록', !PS(A).shown && A.recShown(), PS(A));
    // 마이페이지's 친구 button (2026-10-23): in the hub footer on the 마이페이지 tab only; signed out it opens the sign-in
    // invitation; 닫기 goes back to 마이페이지 (the 친구 button focused)
    {
      await A.rec(false);
      const H = A.D().shop; H.open('shop', 'title'); await sleep(40);
      const onShop = PS(A).myShown; H.open('my', 'title'); await sleep(40);
      const b = A.$('pg-my-pal'), r = b && b.getBoundingClientRect(), foot = A.$('pg-hub-close').parentNode.getBoundingClientRect(), mine = PS(A);
      ok('friends: 마이페이지 has a 친구 button in its footer (not on the 상점 tab), its dot off', mine.myBtn && mine.myShown && !onShop && !mine.myDot && b.textContent === '친구' && r.width > 0 && r.top >= foot.top - 0.5 && r.bottom <= foot.bottom + 0.5, { mine, onShop, r: r && [r.left, r.top, r.width] });
      b.click(); await sleep(80);
      const st1 = PS(A);
      ok('friends: ... it opens 친구 순위 (signed out: the sign-in invitation)', st1.shown && st1.view === 'guest' && st1.palFrom === 'hub' && !A.$('pg-pal-login').hidden, st1);
      A.$('pg-pal-close').click(); await sleep(80);
      const hb = H.hub();
      ok('friends: ... 닫기 goes back to 마이페이지, the 친구 button focused', !PS(A).shown && hb.shown && hb.tab === 'my' && A.win().document.activeElement === b, { hb: [hb.shown, hb.tab], act: A.win().document.activeElement && A.win().document.activeElement.id });
      H.close(); await sleep(40);
    }
    // A signs in: its card and code
    await signIn(A, 'palA'); await settle(A);
    await until(() => PS(A).code && !PS(A).booting, 4000);
    const codeA = PS(A).code, pa = F.docs.get('profiles/palA') || {}, cardA = PALP(A).card();
    ok('friends: A signed in -> a card with exactly the card keys (no name / mail / photo), v 1, its code', Object.keys(pa).sort().join() === 'at,c,code,hi,lk,nick,st,tr,v' && pa.v === 1 && pa.code === codeA, pa);
    ok('friends: ... its code document points at it (8 of the 31 characters)', (F.docs.get('codes/' + codeA) || {}).u === 'palA' && /^[A-HJKMNP-Z2-9]{8}$/.test(codeA), codeA);
    ok('friends: ... the card: the nick, trophies, animal and look of this page', pa.nick === cardA.nick && pa.tr === A.tro().t && pa.c === cardA.c && pa.lk === cardA.lk, [pa, cardA]);
    // B signs in and asks A
    const B = await frame('PB', 'ppb', { ns: 'p19b' });
    await signIn(B, 'palB'); await settle(B);
    await until(() => PS(B).code && !PS(B).booting, 4000);
    const codeB = PS(B).code;
    st = await PALP(B).add(fmt(codeA).toLowerCase());
    const rqd = F.docs.get('reqs/palA/in/palB') || {};
    ok('friends: B sends A a request (typed with a dash, lower case)', st.said === 'sent' && !!F.docs.get('reqs/palA/in/palB'), st);
    ok('friends: ... it carries B\'s own nick / code / animal / look only', Object.keys(rqd).sort().join() === 'at,c,cd,lk,n' && rqd.cd === codeB && rqd.n === F.docs.get('profiles/palB').nick, rqd);
    st = await PALP(A).load(true);
    ok('friends: A\'s inbox has it; the red dot on 친구 순위, on the title badge and on 마이페이지\'s 친구', st.reqs.length === 1 && st.reqs[0].uid === 'palB' && st.dot && st.badgeDot && st.myDot, st);
    PALP(A).open(); await until(() => PS(A).reqRows.length === 1, 2000);
    ok('friends: 받은 요청 (1): B with its code', A.$('pg-pal-rqh').textContent === TX.reqs + ' (1)' && PS(A).reqRows[0].indexOf(rqd.n) >= 0 && PS(A).reqRows[0].indexOf(fmt(codeB)) >= 0, PS(A).reqRows);
    A.$('pg-pal-rq').querySelector('button[data-act="acc"]').click();
    await until(() => !PS(A).busy && PS(A).rows && PS(A).rows.some((r) => r.uid === 'palB'), 3000);
    st = PS(A);
    ok('friends: 수락 -> friends both ways, the request gone, the dot off', st.rows.some((r) => r.uid === 'palB') && !st.reqs.length && !st.dot && !st.badgeDot && !st.myDot && !F.docs.get('reqs/palA/in/palB')
      && !!F.docs.get('friends/palA/f/palB') && !!F.docs.get('friends/palB/f/palA') && st.said === 'added', st);
    st = await PALP(B).load(true);
    ok('friends: B sees A too', st.rows.some((r) => r.uid === 'palA'), st);
    // the best 탕: a solo run to 탕 3, then the card follows after the debounce
    PALP(A).close(); await A.rec(false);
    const D = A.D();
    D.start(0);
    for (let r = 1; r < 3; r++) { D.killAll(); for (let i = 0; i < 60 && D.G.round < r; i++) D.step(60); }
    ok('friends: a solo run to 탕 3 -> this browser\'s best 탕 is 3', PS(A).local === 3 && D.G.round === 2, [PS(A).local, D.G.round]);
    let L0 = F.plog.length;
    D.toTitle();
    await until(() => (F.docs.get('profiles/palA') || {}).st === 3, 3000); await sleep(300);
    ok('friends: the title -> the card says st 3 after the debounce, in one write', F.docs.get('profiles/palA').st === 3 && pwrites('profiles/palA', L0).length === 1, F.plog.slice(L0).map((e) => e.w.join()));
    for (const [name, set] of [['co-op', (g) => { g.gameMode = 'coop'; }], ['the attract demo', null]]) {
      if (set) { D.start(0); set(D.G); } else D.toTitle();
      D.G.loop = 1; D.killAll(); D.step(1500);
      ok('friends: ' + name + ' never records a 탕 (2회차 here)', PS(A).local === 3, [PS(A).local, D.G.round, D.G.loop, D.G.gameMode]);
    }
    D.start(4); D.step(5);
    ok('friends: a debug start at 탕 5 never records', PS(A).local === 3 && !PS(A).run, PS(A).local);
    D.toTitle(); await sleep(400);
    A.win().localStorage.setItem(PS(A).key, '1');
    L0 = F.plog.length; PALP(A).kick(); await sleep(500);
    ok('friends: a lower best here never lowers the card (and writes nothing)', PALP(A).card().st === 3 && pwrites('profiles/palA', L0).length === 0 && F.docs.get('profiles/palA').st === 3, PALP(A).card());
    L0 = F.plog.length;
    A.C().nick('새이름'); D.setChar('otter'); PALP(A).kick(); D.toTitle(); PALP(A).kick();
    await until(() => (F.docs.get('profiles/palA') || {}).nick === '새이름', 3000); await sleep(500);
    ok('friends: a new nick + animal -> one coalesced card write', pwrites('profiles/palA', L0).length === 1 && F.docs.get('profiles/palA').c === 2, F.plog.slice(L0).map((e) => e.w.join()));
    L0 = F.plog.length; PALP(A).kick(); D.toTitle(); await sleep(600);
    ok('friends: an unchanged card is never written', pwrites('profiles/palA', L0).length === 0, F.plog.slice(L0).map((e) => e.w.join()));
    // the messages
    ok('friends: my own code -> 내 코드예요', await say(A, codeA) === 'own');
    ok('friends: a malformed code -> 코드 8자리를 확인해 주세요', await say(A, 'ABC') === 'bad' && await say(A, 'ABCD-234O') === 'bad');
    ok('friends: an unknown code -> 그런 코드가 없어요', await say(A, 'ZZZZ9999') === 'none');
    ok('friends: a friend\'s code -> 이미 친구예요', await say(A, codeB) === 'already');
    const C = await frame('PC', 'ppc', { ns: 'p19c' });
    await signIn(C, 'palC'); await settle(C);
    await until(() => PS(C).code && !PS(C).booting, 4000);
    const codeC = PS(C).code;
    ok('friends: C asks A', await say(C, codeA) === 'sent');
    ok('friends: C asks B at once -> 20초 뒤에 다시 보낼 수 있어요', await say(C, codeB) === 'wait');
    PALP(C).unwait();
    ok('friends: C asks A again -> 이미 요청했어요', await say(C, codeA) === 'sent0');
    // 50 friends: no 51st; the reads of a load; the cache
    const T1 = new F.TS(F.now());
    for (let i = 0; i < 49; i++) {
      const u = 'fk' + i; F.docs.set('profiles/' + u, { v: 1, code: 'FKFK' + String(2000 + i).replace(/[01]/g, '2'), nick: '친구' + i, st: i, hi: i * 10, tr: i, c: i % 6, lk: '00000', at: T1 });
      F.docs.set('friends/palA/f/' + u, { at: T1 }); F.docs.set('friends/' + u + '/f/palA', { at: T1 });
    }
    PALP(A).open(); await until(() => !PS(A).loading, 2000);
    let c1 = F.calls.length;
    st = await PALP(A).load(true);
    ok('friends: a load with 50 friends = 1 + 50 + 1 reads', st.rows.length === 50 && palN('PA', c1, ['get', 'list']) === 52, [st.rows.length, palN('PA', c1, ['get', 'list'])]);
    c1 = F.calls.length; PALP(A).close(); PALP(A).open(); await sleep(200);
    ok('friends: opened again within 60 s -> no read', palN('PA', c1) === 0 && PS(A).list.length === 51, palN('PA', c1));
    ok('friends: the 51st friend -> 친구는 50명까지예요 (asking and accepting)', await say(A, codeC) === 'full' && (await PALP(A).accept('palC')).said === 'full');
    for (let i = 0; i < 49; i++) { const u = 'fk' + i; F.docs.delete('profiles/' + u); F.docs.delete('friends/palA/f/' + u); F.docs.delete('friends/' + u + '/f/palA'); }
    // decline + mute; a muted sender's next request is dropped
    st = await PALP(A).load(true);
    ok('friends: C\'s request waits for A', st.reqs.some((r) => r.uid === 'palC'), st.reqs);
    A.$('pg-pal-rq').querySelector('[data-uid="palC"] button[data-act="dec"]').click();
    await until(() => !F.docs.get('reqs/palA/in/palC'), 2000);
    st = PS(A);
    ok('friends: 거절 -> the request deleted, C muted here', !F.docs.get('reqs/palA/in/palC') && /palC/.test(st.mute) && st.said === 'declined' && !st.reqs.length, st);
    PALP(C).unwait(); await sleep(500);
    ok('friends: C asks A again (after the 20 s)', await say(C, codeA) === 'sent' && !!F.docs.get('reqs/palA/in/palC'));
    st = await PALP(A).load(true); await until(() => !F.docs.get('reqs/palA/in/palC'), 2000);
    ok('friends: ... dropped unseen and deleted (muted)', !st.reqs.some((r) => r.uid === 'palC') && !F.docs.get('reqs/palA/in/palC'), st.reqs);
    // crossing requests: C asks B, B types C's code -> friends at once
    PALP(C).unwait(); await sleep(500);
    ok('friends: C asks B', await say(C, codeB) === 'sent');
    await PALP(B).load(true);
    ok('friends: B types C\'s code while C\'s request waits -> 서로 요청해서 바로 친구가 됐어요', await say(B, codeC) === 'both' && !!F.docs.get('friends/palB/f/palC') && !F.docs.get('reqs/palB/in/palC'));
    // the ranking
    st = await PALP(A).load(true); await sleep(50);
    st = PS(A);
    ok('friends: the ranking - best round count first, my row (나) with its 최고 3라운드, no 회차 / 탕', st.list.length === 2 && /\(나\)/.test(st.list[0]) && /최고 3라운드/.test(st.list[0]) && !/회차|탕/.test(st.list.join()) && st.list[1].indexOf(F.docs.get('profiles/palB').nick) >= 0
      && A.$('pg-pal-list').children[0].classList.contains('is-me'), st.list);
    ok('friends: the stage text: one round count from the first 탕 - 최고 5라운드 / 최고 29라운드 (2회차 5탕) / 기록 없음', PALP(A).stageTx(5) === '최고 5라운드' && PALP(A).stageTx(29) === '최고 29라운드' && PALP(A).stageTx(0) === TX.none0 && PALP(A).stageTx(2400) === '최고 2400라운드');
    // unfriend (asked inline first)
    A.$('pg-pal-list').querySelector('[data-uid="palB"] button[data-act="cut"]').click(); await sleep(30);
    const ask = A.$('pg-pal-list').querySelector('.pg-pal-ask');
    ok('friends: 끊기 asks first, inline', !!ask && ask.textContent.indexOf(TX.ask.replace('{0}', F.docs.get('profiles/palB').nick)) >= 0 && !!F.docs.get('friends/palA/f/palB'), ask && ask.textContent);
    ask.querySelector('button[data-act="cutok"]').click();
    await until(() => !PS(A).busy && !PS(A).rows.some((r) => r.uid === 'palB'), 2000);
    ok('friends: ... yes -> both halves gone', !F.docs.get('friends/palA/f/palB') && !F.docs.get('friends/palB/f/palA') && PS(A).said === 'cutDone');
    ok('friends: ... and the cards closed both ways', F.pRead(F.docs, 'palA', 'get', 'profiles/palB') !== '' && F.pRead(F.docs, 'palB', 'get', 'profiles/palA') !== '');
    // failures
    F.setOnline('ppa', false); st = await PALP(A).load(true);
    ok('friends: offline -> 인터넷이 연결되면 다시 볼 수 있어요, 다시 시도', st.line === TX.offline && !A.$('pg-pal-retry').hidden && !st.list.length, st);
    await sleep(40);                             // (the load's second list - its inbox - lands too before the next failure is set)
    F.setOnline('ppa', true);
    F.failNext('plist', 'permission-denied'); st = await PALP(A).load(true);
    ok('friends: refused (the rules not published yet) -> 친구 기능을 준비 중이에요', st.line === TX.rules, st);
    await sleep(40); F.failNext('plist', 'resource-exhausted'); st = await PALP(A).load(true);
    ok('friends: the quota -> 지금은 사람이 많아요 · 잠시 후 다시', st.line === TX.busy, st);
    await sleep(40); A.$('pg-pal-retry').click(); await until(() => !PS(A).loading && PS(A).list.length, 2000);
    ok('friends: 다시 시도 -> the ranking again (my row and the no-friends line)', PS(A).line === TX.empty && PS(A).list.length === 1, PS(A));
    // sign-out: the guest view, nothing kept, no call; another account here sees none of it
    A.C().signOut(true); await until(() => A.st().st === 'out', 3000); await sleep(50);
    st = PS(A);
    ok('friends: sign-out -> the guest view, nothing kept', st.view === 'guest' && !st.code && st.rows === null && !st.reqs.length && !st.uid, st);
    const c2 = F.calls.length; await sleep(800);
    ok('friends: ... and no friend call after it', palN('PA', c2) === 0, F.calls.slice(c2));
    await signIn(A, 'palD'); await settle(A);
    await until(() => PS(A).code && !PS(A).booting, 4000);
    st = await PALP(A).load(true);
    ok('friends: another account in the same browser -> its own code, none of A\'s friends', st.uid === 'palD' && st.code && st.code !== codeA && st.rows.length === 0 && !st.reqs.length, st);
    // the web fonts know every 친구 순위 syllable
    const strs = Object.values(TX).concat(['위', '최고', '라운드', '점']), miss = new Set();
    for (const q of ['.pg-fw-sign', '.pg-fw-body']) { const warm = A.win().document.querySelector('#pg-fontwarm ' + q).textContent; for (const x of strs) for (const ch of x) if (/[가-힣…·]/.test(ch) && warm.indexOf(ch) < 0) miss.add(q + ':' + ch); }
    ok('friends: every syllable of 친구 순위 is warmed in both faces', miss.size === 0, [...miss].join(''));
    A.remove(); B.remove(); C.remove();
    // the PR preview: a staged demo, no SDK at all
    localStorage.removeItem('ppogeul-login@pr999');
    const V = await frame('PV', 'ppv', { ns: 'p19v', src: '/deploy-preview/index.html' });
    if (V.D().login.state().shown) V.D().login.guest();
    await sleep(50);
    st = PS(V);
    ok('friends: the preview stages its demo from the start (the dot of its request, on 마이페이지\'s 친구 too)', st.demo && st.code === 'PVWX2345' && st.reqs.length === 1 && st.dot && st.myBtn && st.myDot, st);
    V.T().openRec(); await sleep(50);
    PALP(V).open(); await sleep(80);
    st = PS(V);
    ok('friends: preview: the demo - my code, 4 friends and me, 1 request, the note', st.view === 'main' && V.$('pg-pal-mine').textContent === 'PVWX-2345' && st.list.length === 5 && st.reqRows.length === 1 && st.note === TX.demo, st);
    await PALP(V).accept(st.reqs[0].uid); st = PS(V);
    ok('friends: preview: 수락 works here (6 rows)', st.list.length === 6 && !st.reqs.length && st.said === 'added', st);
    st = await PALP(V).cut('demo4');
    ok('friends: preview: 끊기 works here', st.list.length === 5, st);
    ok('friends: preview: 친구 요청 -> sent (nothing goes anywhere)', await say(V, 'KMNP-2345') === 'sent');
    ok('friends: preview: no SDK script, no call, nothing stored', !F.calls.some((c) => c.frame === 'PV') && !F.scripts.some((x) => x.frame === 'PV') && !PS(V).mute, F.calls.filter((c) => c.frame === 'PV'));
    V.remove();
  }

  // ================================================================ screenshot scenes (?shot=...)
  async function shot(scene) {
    const w = innerWidth, h = innerHeight, phone = w < 600 || h < 500;     // (844x390: a phone on its side)
    frameBox().style.gap = '0';
    // (the login screen: this browser has not chosen yet; login-pv: a PR preview's page)
    const lg = /^login/.test(scene);
    if (lg) localStorage.removeItem('ppogeul-login');
    if (scene === 'pal-demo') localStorage.removeItem('ppogeul-login@pr999');
    const fr = await frame('S1', 'ps', { ns: 'shot', w, h, fast: true, src: /^login-pv|^pal-demo/.test(scene) ? '/deploy-preview/index.html' : undefined });
    const sc = /-(\d)x$/.exec(scene); if (sc) { setScale(fr, +sc[1]); scene = scene.replace(/-\dx$/, ''); await sleep(100); }
    // (친구 순위's shots: a portrait tablet is a touch screen too)
    if (phone || (/^pal-/.test(scene) && h > w)) { const W = fr.win(); W.dispatchEvent(new W.Event('touchstart')); await sleep(80); }
    fr.D().pwa({ ios: phone, framed: false });
    fr.D().G.hiscore = 123456; fr.$('pg-title-hi').textContent = (123456).toLocaleString('ko-KR');
    fr.T().set({ t: 268, w: 7, g: 15, ko: 23, best: 312, bl: 2, seen: 1 });
    F.put('uidS', { v: 1, dev: 'ss12ss34', nick: '뽀숑', s: { ksssss01: slotOf({ t: 180, w: 5, g: 9, ko: 14, best: 210, bl: 2, hi: 98000 }) }, last: 'ksssss01' });
    const C = fr.C();
    if (scene === 'rec-out') { await fr.rec(true); }
    else if (scene === 'rec-in' || scene === 'title-in' || scene === 'title-wait') {
      await signIn(fr, 'uidS'); await settle(fr);
      for (let i = 0; i < 40 && fr.st().msg; i++) { await fr.rec(true); await sleep(30); }
      if (scene === 'rec-in') await fr.rec(true);
      else {
        await fr.rec(false); fr.D().toTitle(); fr.$('pg-title-hi').textContent = fr.D().G.hiscore.toLocaleString('ko-KR');
        if (scene === 'title-wait') { F.setOnline('ps', false); fr.T().set({ t: fr.tro().t + 3 }); await until(() => fr.st().mark === 'pg-tro-cloud is-wait', 3000); }
      }
    } else if (scene === 'rec-msg') { C.fast(false); await signIn(fr, 'uidS'); }
    else if (scene === 'rec-frame') { C.env({ framed: true }); C.reboot(); await fr.rec(true); await until(() => fr.st().st === 'frame', 2000); }
    // (v4 shop 9.4: 마이페이지 signed out - its note gets the sign-in pitch as a second line; 내 기록 is one tap away)
    else if (scene === 'my-out') { fr.D().shop.set({ ce: 420, sh: 1, own: ['h5'], eq: '50000', bd: 0, bs: 0 }); fr.D().shop.open('my'); fr.D().shop.tick(40); }
    else if (lg) fr.D().login.show(true);
    else if (/^pal-/.test(scene)) await palShot(fr, scene);
    // (looks L0: the two new 2-part lines staged in 내 기록 for one look - by hand: ?shot=rec-say&say=outkeep)
    else if (scene === 'rec-say') { await signIn(fr, 'uidS'); await settle(fr); await fr.rec(true); await until(() => !fr.st().msg, 2000); C.fast(false); C.say((/[?&]say=([a-z]+)/.exec(location.search) || [])[1] || 'dirty'); }
    await sleep(500);
    if (scene === 'my-out' && !(fr.$('pg-my-note').querySelector('small') && fr.$('pg-my-note').querySelector('small').textContent === fr.D().cloud.texts().pitch)) log('CLOUD SHOT error: 마이페이지 has no pitch line: ' + fr.$('pg-my-note').textContent);
    // (the web fonts' glyph files still on their way - a fresh profile per shot - would leave the shot in the fallback face)
    try { await Promise.race([fr.win().document.fonts.ready, sleep(6000)]); } catch (e) { /* ignore */ }
    await sleep(150);
    // (&zoom=<element id>: that element magnified 5x at the top left, to look at the pixels)
    const zm = /[?&]zoom=([a-z0-9-]+)/.exec(location.search);
    if (zm && fr.$(zm[1])) { const r = fr.$(zm[1]).getBoundingClientRect(); fr.el.style.transformOrigin = '0 0'; fr.el.style.transform = `scale(5) translate(${-r.left + 8}px, ${-r.top + 8}px)`; await sleep(200); }
    log('CLOUD INFO shot ' + scene + ' ' + w + 'x' + h + ': st ' + fr.st().st + ', line "' + fr.st().line + '", mark ' + fr.st().mark);
    // (the login screen fits: the card inside the game screen without scrolling, no button label clipped, the touch
    // targets >= 44 px on a phone, the status line at most 2 lines)
    if (lg) {
      const W = fr.win(), sc = fr.$('pg-screen').getBoundingClientRect(), card = fr.$('pg-login').querySelector('.pg-login-card'), r = card.getBoundingClientRect(), bad = [];
      const fs = parseFloat(W.getComputedStyle(fr.$('pg-screen')).fontSize), st = fr.$('pg-login-st'), lh = parseFloat(W.getComputedStyle(st).lineHeight);
      if (!LG(fr).shown) bad.push('not shown');
      if (r.top < sc.top - 0.5 || r.bottom > sc.bottom + 0.5 || r.left < sc.left - 0.5 || r.right > sc.right + 0.5) bad.push('card outside the screen ' + J([r.top, r.bottom, sc.top, sc.bottom]));
      if (card.scrollHeight > card.clientHeight + 1) bad.push('card scrolls ' + card.scrollHeight + '/' + card.clientHeight);
      for (const b of card.querySelectorAll('button')) {
        if (b.hidden) continue;
        if (b.scrollWidth > b.clientWidth + 1) bad.push(b.id + ' label clipped');
        if (phone && b.getBoundingClientRect().height < 43.5) bad.push(b.id + ' under 44 px');
      }
      if (st.getBoundingClientRect().height > 2 * lh + 1) bad.push('status line over 2 lines');
      log('CLOUD INFO login fit ' + scene + ' ' + w + 'x' + h + ': fs ' + fs + 'px, card ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' in ' + Math.round(sc.width) + 'x' + Math.round(sc.height) + ', line "' + st.textContent + '"');
      if (bad.length) log('CLOUD SHOT error login fit: ' + bad.join('; '));
    }
    if (/^pal-/.test(scene)) palFit(fr, scene, w, h, phone || h > w);
    log('CLOUD SHOT READY ' + scene);
  }

  // 19c. 친구 순위's scenes: pal-in (signed in: 12 friends - one with a 12-character nick - and 2 requests), pal-guest
  // (signed out), pal-demo (the PR preview), pal-rec (내 기록 with the button and its dot)
  async function palShot(fr, scene) {
    const P = fr.D().pal, T1 = new F.TS(F.now() - 60000), now = new F.TS(F.now());
    if (scene === 'pal-demo') { if (fr.D().login.state().shown) fr.D().login.guest(); await sleep(60); fr.T().openRec(); await sleep(60); P.open(); return; }
    if (scene === 'pal-guest') { await fr.rec(true); P.open(); return; }
    // (친구 초대: pal-gate - 친구와 하기 as a guest on the deploy, the sign-in card; pal-iv - signed in, an invite from a
    // friend in my list: the banner over the title)
    if (scene === 'pal-gate') { fr.D().mp.openFriends(); await until(() => fr.D().mp.state().gate, 2000); return; }
    if (scene === 'pal-iv') F.docs.set('invites/uidS/in/sf0', { code: 'ab12', mode: 'coop', nick: '거품왕', at: new F.TS(F.now() + 5 * 60000) });   // (the shot's clock runs 50x: a page clock behind the server's)
    F.docs.set('profiles/uidS', { v: 1, code: 'QWER2345', nick: '뽀숑', st: 29, hi: 98000, tr: 268, c: 0, lk: '10100', at: T1 }); F.docs.set('codes/QWER2345', { u: 'uidS' });
    const nk = ['거품왕', '뽀득이', '거품거품거품거품거품거품', '때밀이', '수건양', '온탕지기', 'Bubble', '냉탕러버', '사우나', '바가지', '귤껍질', '오리'];
    nk.forEach((n, i) => {
      const u = 'sf' + i;
      F.docs.set('profiles/' + u, { v: 1, code: 'ABCD' + (2345 + i * 111).toString().replace(/[01]/g, '9'), nick: n, st: [61, 41, 33, 29, 22, 17, 12, 9, 6, 3, 1, 0][i], hi: [215400, 58200, 41000, 99000, 31950, 24800, 15000, 12400, 8000, 2600, 900, 0][i],
        tr: [1350, 640, 480, 268, 210, 150, 90, 75, 40, 0, 0, 0][i], c: i % 6, lk: ['50000', '10100', '00100', '30000', '90000', '00000'][i % 6], at: T1 });
      F.docs.set('friends/uidS/f/' + u, { at: T1 }); F.docs.set('friends/' + u + '/f/uidS', { at: T1 });
    });
    F.docs.set('reqs/uidS/in/sr0', { n: '반신욕', cd: 'HN4WX8PB', c: 2, lk: '30000', at: now }); F.docs.set('reqs/uidS/in/sr1', { n: '이태리타올장인', cd: 'K7MQ2RTA', c: 4, lk: '00100', at: now });
    await signIn(fr, 'uidS'); await settle(fr);
    await until(() => P.state().code && !P.state().booting, 4000);
    if (scene === 'pal-rec') { await P.load(true); await fr.rec(true); return; }
    if (/^pal-my/.test(scene)) { await P.load(true); await fr.rec(false); fr.D().shop.open('my', 'title'); fr.D().shop.tick(40); await sleep(60); fr.$('pg-hub-close').scrollIntoView({ block: 'end' }); return; }   // (마이페이지 with its 친구 button and dot)
    if (scene === 'pal-iv') { await P.load(true); await fr.rec(false); fr.D().toTitle(); await until(() => P.iv().shown, 3000); return; }
    P.open(); await until(() => P.state().list.length > 5 && !P.state().loading, 4000);
  }
  // the fit: the card inside the panel, nothing clipped or wider than its box, the body the scroller (pal-in: it does
  // scroll), button labels whole, touch targets >= 32 px; pal-rec: 내 기록 still fits, the button clear of its title
  function palFit(fr, scene, w, h, touch) {
    const W = fr.win(), bad = [], nm = (el) => el.id || (typeof el.className === 'string' && el.className.split(' ')[0]) || el.tagName;
    // (친구 초대: the banner inside the stage, its text whole, its buttons whole and tappable; the sign-in card inside
    // 친구와 하기 with its 뒤로, no scrolling, the boxes gone)
    const whole = (box, els) => {
      const br = box.getBoundingClientRect();
      for (const el of els) {
        if (!el.getClientRects().length) continue;
        const r = el.getBoundingClientRect();
        if (r.left < br.left - 0.5 || r.right > br.right + 0.5 || r.top < br.top - 0.5 || r.bottom > br.bottom + 0.5) bad.push(nm(el) + ' outside ' + nm(box));
        if (el.scrollWidth > el.clientWidth + 1) bad.push(nm(el) + ' clipped');
        if (el.tagName === 'BUTTON' && r.height < (touch ? 43.5 : 31.5)) bad.push(nm(el) + ' under ' + (touch ? 44 : 32) + ' px');
      }
      return br;
    };
    if (scene === 'pal-iv') {
      const el = fr.$('pg-iv'), st = fr.$('pg-stage'), tx = fr.$('pg-iv-tx');
      if (!el || el.hidden) { log('CLOUD SHOT error pal fit: no banner'); return; }
      const sr = whole(st, [el]); whole(el, [...el.querySelectorAll('button')].concat([tx]));
      const r = el.getBoundingClientRect(), lh = parseFloat(W.getComputedStyle(tx).lineHeight);
      if (tx.getBoundingClientRect().height > 2 * lh + 1) bad.push('the text over 2 lines');
      if (!el.querySelector('canvas')) bad.push('no bust');
      if (!/^거품왕이 같이 하자고 해요 · 같이 하기$/.test(tx.textContent)) bad.push('text ' + tx.textContent);
      info('pal fit ' + scene + ' ' + w + 'x' + h + ': banner ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' at ' + Math.round(r.top - sr.top) + ' in ' + Math.round(sr.width) + 'x' + Math.round(sr.height));
    } else if (scene === 'pal-gate') {
      const sec = fr.$('pg-friends'), g = fr.$('pg-net-gate'), back = fr.$('pg-friends-back');
      if (!sec || sec.hidden || !g || g.hidden) { log('CLOUD SHOT error pal fit: no sign-in card'); return; }
      whole(sec, [g, back]); whole(g, [...g.querySelectorAll('button, p, b')]);
      if (sec.scrollHeight > sec.clientHeight + 1) bad.push('the panel scrolls ' + sec.scrollHeight + '/' + sec.clientHeight);
      if ([...sec.querySelectorAll('.pg-box, .pg-field')].some((e) => e.getClientRects().length)) bad.push('a box shows');
      const r = g.getBoundingClientRect();
      info('pal fit ' + scene + ' ' + w + 'x' + h + ': card ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' panel ' + sec.clientWidth + 'x' + sec.clientHeight + ', line "' + fr.$('pg-net-gate-st').textContent + '"');
    } else if (/^pal-my/.test(scene)) {
      // (마이페이지's 친구: whole in the footer beside 내 기록 / 닫기, the footer inside the panel and the screen, its dot on)
      const b = fr.$('pg-my-pal'), foot = fr.$('pg-hub-close').parentNode;
      if (!b || b.hidden) { log('CLOUD SHOT error pal fit: no 친구 button'); return; }
      const r = b.getBoundingClientRect(), f = foot.getBoundingClientRect();
      for (const el of foot.querySelectorAll('button')) {
        if (!el.getClientRects().length) continue;
        const q = el.getBoundingClientRect();
        if (q.left < f.left - 0.5 || q.right > f.right + 0.5 || q.top < f.top - 0.5 || q.bottom > f.bottom + 0.5) bad.push(nm(el) + ' outside the footer');
        const lb = el.firstElementChild && el.firstElementChild.tagName === 'SPAN' ? el.firstElementChild.getBoundingClientRect() : null;   // (친구's dot pokes out on purpose)
        if (lb ? lb.left < q.left - 0.5 || lb.right > q.right + 0.5 : el.scrollWidth > el.clientWidth + 1) bad.push(nm(el) + ' clipped');
        if (el !== b && q.left < r.right - 0.5 && q.right > r.left + 0.5) bad.push(nm(el) + ' over 친구');
      }
      // (a short screen scrolls the hub: the scene brings its footer into view)
      if (f.bottom > W.innerHeight + 1.5 || f.top < -1.5 || f.left < -0.5 || f.right > W.innerWidth + 0.5) bad.push('the footer outside the view ' + J([f.top, f.bottom, W.innerHeight]));
      if (touch && r.height < 31.5) bad.push('친구 under 32 px');
      if (fr.$('pg-pal-new2').hidden) bad.push('no dot');
      if (fr.$('pg-my-rec').hidden) bad.push('no 내 기록');
      info('pal fit ' + scene + ' ' + w + 'x' + h + ': 친구 ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' in a footer ' + Math.round(f.width) + ' wide');
    } else if (scene === 'pal-rec') {
      const card = fr.$('pg-rec').querySelector('.pg-rec-card'), b = fr.$('pg-pal-btn'), rg = W.document.createRange(); rg.selectNodeContents(fr.$('pg-rec-h'));
      const r = b.getBoundingClientRect(), c = card.getBoundingClientRect(), t = rg.getBoundingClientRect(), sc = fr.$('pg-screen').getBoundingClientRect();
      if (card.scrollHeight > card.clientHeight + 1) bad.push('내 기록 scrolls');
      if (c.bottom > sc.bottom + 0.5 || c.top < sc.top - 0.5) bad.push('내 기록 outside the screen');
      if (r.right > c.right + 0.5 || r.top < c.top - 0.5 || !(r.left >= t.right || r.bottom <= t.top)) bad.push('the button over the title or outside the card');
      if (touch && r.height < 31.5) bad.push('the button under 32 px');
      if (fr.$('pg-pal-new').hidden) bad.push('no dot');
      info('pal fit ' + scene + ' ' + w + 'x' + h + ': button ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' card ' + Math.round(c.width) + 'x' + Math.round(c.height));
    } else {
      const sec = fr.$('pg-pal'), card = sec && sec.querySelector('.pg-pal-card');
      if (!sec || sec.hidden) { log('CLOUD SHOT error pal fit: not shown'); return; }
      const pr = sec.getBoundingClientRect(), cr = card.getBoundingClientRect();
      if (cr.top < pr.top - 0.5 || cr.bottom > pr.bottom + 0.5 || cr.left < pr.left - 0.5 || cr.right > pr.right + 0.5) bad.push('card outside the panel');
      if (card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1) bad.push('card overflows ' + [card.scrollWidth, card.clientWidth, card.scrollHeight, card.clientHeight]);
      if (W.document.documentElement.scrollWidth > W.innerWidth + 1) bad.push('the page scrolls sideways');
      const scrollers = [...card.querySelectorAll('.pg-pal-body, .pg-pal-sec, .pg-pal-guest')].filter((e) => e.getClientRects().length && /auto|scroll/.test(W.getComputedStyle(e).overflowY));
      for (const s of scrollers) if (s.scrollWidth > s.clientWidth + 1) bad.push(nm(s) + ' scrolls sideways');
      for (const el of card.querySelectorAll('*')) {
        if (!el.getClientRects().length) continue;
        const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
        const sc = scrollers.find((x) => x !== el && x.contains(el)), box = sc ? sc.getBoundingClientRect() : cr;
        if (r.left < box.left - 0.5 || r.right > box.right + 0.5) bad.push(nm(el) + ' clipped sideways');
        if (!sc && (r.top < cr.top - 0.5 || r.bottom > cr.bottom + 0.5)) bad.push(nm(el) + ' clipped');
      }
      for (const b of card.querySelectorAll('button')) {
        if (!b.getClientRects().length) continue;
        if (b.scrollWidth > b.clientWidth + 1) bad.push(nm(b) + ' label clipped');
        if (touch && b.getBoundingClientRect().height < 31.5) bad.push(nm(b) + ' under 32 px');
      }
      const list = fr.$('pg-pal-list'), sl = scrollers.find((x) => x.contains(list));
      if (scene === 'pal-in') {
        if (!sl) bad.push('the ranking is in no scroller');
        else { if (sl.scrollHeight <= sl.clientHeight) bad.push('the ranking does not scroll (13 rows)'); if (sl.clientHeight < 36) bad.push('the ranking under one row (' + sl.clientHeight + ')'); }
      }
      info('pal fit ' + scene + ' ' + w + 'x' + h + ': panel ' + Math.round(pr.width) + 'x' + Math.round(pr.height) + ', card ' + Math.round(cr.width) + 'x' + Math.round(cr.height) + (sl ? ', list ' + sl.clientHeight + '/' + sl.scrollHeight : '') + ', state ' + J(fr.D().pal.state().view));
    }
    if (bad.length) log('CLOUD SHOT error pal fit ' + scene + ' ' + w + 'x' + h + ': ' + [...new Set(bad)].slice(0, 10).join('; '));
  }

  // ================================================================ 19d. 친구 초대 + 손님은 온라인 불가 through the frames
  // (design/friends.md "As built (invites)"): three accounts, A friends with B and C; online between the frames over
  // BroadcastChannel (&net=bc). The gate as a guest, signing in from its card; A's 초대 makes a room and invites B, whose
  // banner joins it; 초대 from inside the room, the 10 s, 닫기 back to the room, the room closing deletes its invites;
  // B: an expired invite deleted unseen, a battle invite, again after a reload, 나중에, expiry while shown, sign-out;
  // an invite link opened as a guest goes on to the room after signing in; the preview's demo; nothing on the artifact
  async function ivFrameTests() {
    const IVS = (fr) => PALP(fr).iv(), N = (fr) => fr.D().mp, T1 = new F.TS(F.now() - 60000), TX = PG.debug.pal.texts();
    for (const [u, code, nick, c] of [['ivA', 'VAAA2345', '뽀숑', 0], ['ivB', 'VBBB2345', '거품왕', 1], ['ivC', 'VCCC2345', '때밀이', 2]]) {
      F.docs.set('profiles/' + u, { v: 1, code, nick, st: 3, hi: 1000, tr: 100, c, lk: '00000', at: T1 }); F.docs.set('codes/' + code, { u });
    }
    for (const [a, b] of [['ivA', 'ivB'], ['ivB', 'ivA'], ['ivA', 'ivC'], ['ivC', 'ivA']]) F.docs.set('friends/' + a + '/f/' + b, { at: T1 });
    // ---- a guest: 친구와 하기 is the sign-in card
    const B = await frame('IB', 'pib', { ns: 'p19d-b', q: '&net=bc' });
    N(B).openFriends(); await sleep(80);
    let ns = N(B).state();
    ok('online gate: a guest on the deploy - 친구와 하기 is the card (Google로 계속하기, the 혼자 하기 hint), no 방 만들기 / 코드로 참여 / 이름',
      ns.gated && ns.gate && B.$('pg-net-gate-go').textContent === 'Google로 계속하기' && /온라인 같이 하기·배틀은 Google 로그인하고 할 수 있어요/.test(B.$('pg-net-gate').textContent)
      && /혼자 하기/.test(B.$('pg-net-gate').textContent) && [...B.$('pg-friends').querySelectorAll('.pg-box, .pg-field')].every((e) => !e.getClientRects().length) && !!B.$('pg-friends-back').getClientRects().length, ns);
    const hc = await N(B).host({ mode: 'coop' }), jr = await N(B).join('ab12');
    ok('online gate: ... hosting and joining refused (the test API too), no room', hc === null && !jr.ok && jr.code === 'login' && !N(B).session() && N(B).state().gate, [hc, jr]);
    F.prof('pib').next = 'ivB';
    await until(() => B.st().parts[1], 3000);
    B.$('pg-net-gate-go').click();
    await until(() => B.st().st === 'in' && B.st().cs, 5000); await settle(B);
    await until(() => !N(B).state().gate && IVS(B).on, 3000);
    ns = N(B).state();
    ok('online gate: signed in from the card -> the panel itself (방 만들기, 코드로 참여); the invites listener on', !ns.gated && !ns.gate && !!B.$('pg-host').getClientRects().length
      && !!B.$('pg-join').getClientRects().length && IVS(B).on && F.qls('IB', 'invites/ivB/in') === 1, [ns.gate, IVS(B)]);
    // ---- A invites B from 친구 순위 with no room: a room the normal way, the invite
    const A = await frame('IA', 'pia', { ns: 'p19d-a', q: '&net=bc' });
    await signIn(A, 'ivA'); await settle(A);
    await until(() => PS(A).code && !PS(A).booting && IVS(A).on, 4000);
    N(A).setNick('뽀숑');
    PALP(A).open(); await until(() => PS(A).rows && PS(A).rows.length >= 2 && !PS(A).loading, 3000);
    const ivBtn = (fr, u) => fr.$('pg-pal-list').querySelector('[data-uid="' + u + '"] button[data-act="iv"]');
    ok('invite: each friend\'s row has 초대 (on) before 끊기, my own row none', !!ivBtn(A, 'ivB') && ivBtn(A, 'ivB').getAttribute('aria-disabled') !== 'true' && !!ivBtn(A, 'ivC')
      && ivBtn(A, 'ivB').nextElementSibling === A.$('pg-pal-list').querySelector('[data-uid="ivB"] button[data-act="cut"]') && !A.$('pg-pal-list').querySelector('.is-me button[data-act="iv"]'), [PS(A).rows, PS(A).list, PS(A).view, PS(A).line]);
    let c0 = F.plog.length;
    ivBtn(A, 'ivB').click();
    await until(() => N(A).state().screen === 'room' && !IVS(A).busy && !!F.docs.get('invites/ivB/in/ivA'), 6000);
    let as = N(A).state(), ivd = F.docs.get('invites/ivB/in/ivA') || {};
    const codeA = as.code;
    ok('invite: 초대 with no room -> a 같이 하기 room the normal way (host, the room screen); the invite and the ivbox in one batch',
      as.role === 'host' && as.overlay === 'room' && as.mode === 'coop' && ivd.code === codeA && ivd.mode === 'coop' && ivd.nick === '뽀숑' && ivd.at instanceof F.TS
      && !!F.docs.get('ivbox/ivA') && F.plog.slice(c0).some((e) => e.ok && e.tag === 'batch' && e.w.length === 2 && e.w.includes('set invites/ivB/in/ivA')), [as.overlay, ivd]);
    const nickB = (PS(A).rows.find((q) => q.uid === 'ivB') || {}).nick;
    ok('invite: ... the room\'s line says "{B}님을 초대했어요"; its 친구 초대 button shows', A.$('pg-room-msg').textContent === nickB + '님을 초대했어요' && IVS(A).roomBtn, [A.$('pg-room-msg').textContent, IVS(A)]);
    // ---- B (signed in, 친구와 하기 open) gets the banner; 참여 joins
    await until(() => IVS(B).shown, 3000);
    let bi = IVS(B);
    ok('invite: B gets the banner "뽀숑이 같이 하자고 해요 · 같이 하기" with 참여 / 나중에', bi.shown && bi.cur === 'ivA' && bi.text === '뽀숑이 같이 하자고 해요 · 같이 하기'
      && B.$('pg-iv-join').textContent === '참여' && B.$('pg-iv-later').textContent === '나중에', bi);
    B.$('pg-iv-join').click();
    await until(() => N(B).state().screen === 'room' && N(B).state().role === 'guest', 6000);
    await until(() => N(A).state().roster.length === 2, 3000);
    ok('invite: 참여 -> B in A\'s room with its code (no typing); the invite deleted; no banner in the room', N(B).state().code === codeA && N(A).state().roster.length === 2
      && !F.docs.get('invites/ivB/in/ivA') && !IVS(B).shown, [N(B).state().code, codeA, IVS(B)]);
    ok('invite: ... in someone else\'s room 초대 is off (guest)', IVS(B).why === 'guest' && !IVS(B).roomBtn, IVS(B));
    // ---- from inside the room: 친구 초대 -> 친구 순위 over it; 초대 invites into this room; the 10 s; 닫기 back
    A.$('pg-room-iv').click(); await until(() => PS(A).shown && !PS(A).loading, 2000);
    ok('invite: the room\'s 친구 초대 opens 친구 순위 over the room', PS(A).shown && IVS(A).from === 'room' && N(A).state().screen === 'room', IVS(A));
    await sleep(300);                            // (the server's 10 s since the first invite: 200 ms here)
    ivBtn(A, 'ivC').click();
    await until(() => !IVS(A).busy && !!F.docs.get('invites/ivC/in/ivA'), 3000);
    ok('invite: hosting -> 초대 invites into my room (no second room), said in 친구 순위', (F.docs.get('invites/ivC/in/ivA') || {}).code === codeA && N(A).state().code === codeA
      && PS(A).said === 'ivSent' && PS(A).msg === '때밀이님을 초대했어요', [PS(A).msg, F.docs.get('invites/ivC/in/ivA'), PS(A), A.$('pg-pal-list').innerHTML.slice(0, 600)]);
    const c1 = F.plog.length, r2 = await PALP(A).invite('ivB');
    ok('invite: another 초대 within 10 s -> "10초 뒤에 다시 초대할 수 있어요", nothing written', r2.said === 'ivWait' && PS(A).msg === TX.ivWait && !F.plog.slice(c1).some((e) => /invites\//.test(e.w.join())), r2);
    A.$('pg-pal-close').click(); await sleep(60);
    ok('invite: 닫기 -> back to the room (still hosting)', N(A).state().overlay === 'room' && !PS(A).shown && N(A).state().role === 'host', N(A).state().overlay);
    // ---- the host leaves: the invites into its room go
    N(A).leave();
    await until(() => !F.docs.get('invites/ivC/in/ivA'), 3000);
    ok('invite: the host closes its room -> the invites it sent into it deleted', !F.docs.get('invites/ivC/in/ivA') && !IVS(A).out.length, IVS(A));
    await until(() => !N(B).session(), 4000);
    // ---- B: an expired invite (deleted unseen), a battle invite (shown), shown again after a reload, 나중에
    const put = (from, o) => { F.docs.set('invites/ivB/in/' + from, Object.assign({ code: 'zz99', mode: 'battle', nick: '때밀이' }, o)); F.broadcast('invites/ivB/in/' + from); };
    N(B).openFriends(); await sleep(60);
    put('ivC', { at: new F.TS(F.now() - 11 * 60000) });
    await until(() => !F.docs.get('invites/ivB/in/ivC'), 2000);
    ok('invite: an invite older than 10 minutes is not shown, and deleted', !F.docs.get('invites/ivB/in/ivC') && !IVS(B).shown, IVS(B));
    put('ivC', { at: new F.TS(F.now() - 1000) });
    await until(() => IVS(B).shown, 2000);
    ok('invite: a battle invite -> "때밀이가 같이 하자고 해요 · 배틀"', IVS(B).text === '때밀이가 같이 하자고 해요 · 배틀', IVS(B));
    await B.reload('p19d-b');
    await until(() => B.st().st === 'in' && IVS(B).shown, 5000);
    ok('invite: ... shown again when the page opens next while it is valid', IVS(B).shown && IVS(B).cur === 'ivC' && !B.$('pg-iv').hidden, [IVS(B), B.st().st, B.st().parts, PS(B).palOn, B.D().mp.state().overlay]);
    B.$('pg-iv-later').click();
    await until(() => !F.docs.get('invites/ivB/in/ivC'), 2000);
    ok('invite: 나중에 -> the banner goes, the invite deleted', !IVS(B).shown && !F.docs.get('invites/ivB/in/ivC') && IVS(B).said === 'later', IVS(B));
    put('ivA', { mode: 'coop', nick: '뽀숑', at: new F.TS(F.now() - (10 * 60000 - 15000)) });
    await until(() => IVS(B).shown, 2000);
    const shownAt = IVS(B).shown;
    await until(() => !IVS(B).shown, 3000);
    ok('invite: shown with 15 s left -> gone when it expires', shownAt && !IVS(B).shown, IVS(B));
    // ---- sign-out: the listener stops, nothing shows
    put('ivA', { mode: 'coop', nick: '뽀숑', at: new F.TS(F.now() - 1000) });
    await until(() => IVS(B).shown, 2000);
    B.C().signOut(true); await until(() => B.st().st === 'out', 3000); await sleep(60);
    ok('invite: sign-out -> the listener stopped, no banner', !IVS(B).on && !IVS(B).shown && F.qls('IB') === 0, [IVS(B), F.qls('IB')]);
    // ---- an invite link opened as a guest: the card, then signed in -> on to the room
    const room = await N(A).host({ mode: 'battle' });
    const C = await frame('IC', 'pic', { ns: 'p19d-c', q: '&net=bc&join=' + room });
    await until(() => N(C).state().screen === 'friends' && N(C).state().gate, 3000);
    ok('online gate: an invite link as a guest -> 친구와 하기 with the card (the code kept)', N(C).state().gate && C.$('pg-code').value === String(room).toUpperCase(), N(C).state());
    F.prof('pic').next = 'ivC';
    await until(() => C.st().parts[1], 3000);
    C.$('pg-net-gate-go').click();
    await until(() => N(C).state().screen === 'room' && N(C).state().role === 'guest' && N(C).state().roster.length === 2, 8000);
    ok('online gate: ... signed in -> on to that room by itself', N(C).state().code === room && N(C).state().mode === 'battle', N(C).state());
    N(C).leave(); N(A).leave(); await sleep(100);
    // ---- the PR preview: online as before (not gated); 초대 makes the room and says nothing was sent; the staged banner
    const V = await frame('IV', 'piv', { ns: null, src: '/deploy-preview/index.html', q: '&net=bc' });
    if (V.D().login.state().shown) V.D().login.guest();
    await sleep(60);
    ok('preview: online is not gated', !N(V).state().gated, N(V).state());
    PALP(V).open(); await until(() => IVS(V).shown, 4000);
    ok('preview: 친구 순위 stages an invite banner from a demo friend (marked as an example)', IVS(V).demo && IVS(V).text.indexOf('거품왕이 같이 하자고 해요 · 같이 하기') === 0 && /예시 초대/.test(IVS(V).text), IVS(V));
    const vr = await PALP(V).invite('demo2');
    ok('preview: 초대 -> a room the normal way, "미리보기라 초대는 보내지 않아요"', vr.said === 'ivDemo' && N(V).state().screen === 'room' && N(V).state().role === 'host'
      && V.$('pg-room-msg').textContent === TX.ivDemo && !F.calls.some((c) => c.frame === 'IV' && /invites|ivbox/.test(c.path || '')), [vr, V.$('pg-room-msg').textContent]);
    N(V).leave(); await sleep(80);
    ok('preview: ... the staged banner goes with 나중에', (V.$('pg-iv-later').click(), !IVS(V).shown && !IVS(V).demo), IVS(V));
    for (const fr of [A, B, C, V]) fr.remove();
  }

  async function run() {
    for (let i = 0; i < 300 && !(window.PG && PG.debug && PG.debug.cloud); i++) await sleep(20);
    // (this browser has chosen to play as a guest: the deploy frames boot to the title; loginTests / the login shots take it away)
    localStorage.setItem('ppogeul-login', '1');
    if (SHOT) { F.setSpeed(50); try { await shot(SHOT); } catch (e) { log('CLOUD SHOT error ' + (e && e.stack || e)); log('CLOUD SHOT READY ' + SHOT); } return; }
    if (!/^http/.test(location.protocol)) { fail++; log('CLOUD FAIL this page needs http (tools/serve.js): frames share storage and the fake'); log('CLOUD DONE pass=' + pass + ' fail=' + fail); return; }
    const steps = [inertTests, pureTests, coinPureTests, drawPureTests, palRulesTests];
    for (const f of steps) { try { f(); } catch (e) { fail++; log('CLOUD FAIL ' + f.name + ' threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); } }
    F.setSpeed(50);
    const asyncSteps = [fixtureTests, uploadTests, cloudWinsTests, pushTests, twoDeviceTests, offlineTests, tabDeathTests, twoTabTests, foldTests, coinSyncTests, failureTests, relogTests,
      popupTests, lostAnswerTests, holdRaceTests, drawSyncTests, l0Tests, loginTests, uiTests, fontTests, noConfigTests, startTests, palFrameTests, ivFrameTests];
    // (?only=<prefix>: just the async groups whose name starts so - while working on one)
    const ONLY = (/[?&]only=([a-zA-Z]+)/.exec(location.search) || [])[1] || '';
    for (const f of asyncSteps) {
      if (ONLY && f.name.indexOf(ONLY) !== 0) continue;
      const t0 = performance.now();
      try { await f(); } catch (e) { fail++; log('CLOUD FAIL ' + f.name + ' threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
      info(f.name + ' took ' + Math.round(performance.now() - t0) + ' ms');
    }
    ok('fake: no callback of game.js threw inside the fake SDK (whole run)', F.errors.length === 0, F.errors.slice(0, 3));
    ok('fake: the user object\'s name / mail / photo / provider data were never read (whole run)', F.peeks === 0, F.peeks);
    log('CLOUD DONE pass=' + pass + ' fail=' + fail);
  }
  setTimeout(run, 80);
})();
