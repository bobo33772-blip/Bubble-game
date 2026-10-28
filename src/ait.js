/* ==========================================================================
   뽀득뽀득 목욕탕 — ait.js (the 앱인토스 / Apps in Toss build only: design/toss.md 2.4 and 8)
   PG.Ait = { boot(sdk, opts), make(sdk, store), store(native, local), call(fn, ms), NAV }
   Not one of the engine files: the artifact and the web deploy never carry it. The Toss entry (toss/src/main.js)
   imports the SDK and hands it to boot(); the test pages hand it a fake SDK (src/tests/toss-fake.js). A plain IIFE:
   no import, no build step, `window` named explicitly (it runs as a module in the bundle and as a classic script in
   the test pages).

   boot(sdk, {scripts})   the storage wrapper first, then in parallel: landscape (800 ms at most), the Safe Area as
                          CSS variables, native Storage read into localStorage (3 s at most) and the game key asked for
                          (never waited on); then window.PG_AIT = the bridge, one screen log ('title'), and only then the
                          engine files, in order. -> Promise<boolean> (false: a file did not load)
   window.PG_AIT (v 1)    the only thing game.js ever sees of the SDK:
     v, env               1, Environment.environment ('toss' | 'sandbox' | '')
     key()                -> Promise<{st:'ok', hash} | {st:'old'} | {st:'err'}>  (8 s at most; an ok is kept for the page;
                          after an err a new SDK call at most every 5 s; one call in its 8 s window at a time)
     onKey(fn)            fn() when a HASH arrives after its call already answered err (late)
     lb.ok() / lb.submit(n) -> 'ok'|'nf'|'np'|'bad'|'err' / lb.open() -> true|false     (the leaderboard, 8 s caps)
     screen(name)         Analytics.screen({log_name}) - the same name twice in a row is sent once
     back(fn)             fn: one backEvent listener until back(null); null: none (Toss's own back applies)
     close()              Screen.close() (the two-press back fallback only)
     play(on)             only on a change: awake mode on / iOS swipe back off while a game runs
     onShow(fn)           the SDK's overlay visibility (the exit modal, the game profile): fn(false) / fn(true); the
                          store is flushed before fn(false)
     insets(), nav        the last Safe Area {t, r, b, l} in CSS px; NAV, the box kept free for 더보기 / X
     sync()               the mirror's state for PG.debug (no keys, no values)
   It never hands out the SDK object and has no "call anything" member. Every SDK call goes through call(fn, ms) or
   a try: outside the Toss WebView every SDK function throws synchronously, and inside it a bridge call can stay
   pending forever (the SDK links its bridge with timeout 0).

   store(native, local)   localStorage stays the engine's synchronous working copy; every 'ppogeul-*' write is mirrored
                          to native Storage (wiped only with the Toss app). A lineage id (gen) plus a write sequence
                          number decide at boot which side is newer; numbers are compared only inside one lineage.
                          Flushes: 2 s after the last write, at the latest 20 s after the first, never sooner than 5 s
                          after the previous one; at once when the page hides; 10 s cap; one retry 10 s after a failure,
                          then nothing until the next write. A session whose boot read failed never writes native until
                          a later read proves it safe (design/toss.md 8)
   ========================================================================== */
(function () {
  'use strict';
  const W = window;
  const PG = W.PG = W.PG || {};

  // the box kept free for the game nav bar's 더보기 / X, from the top-right inset corner: right inset + 10 + w wide,
  // top inset + h tall (design/toss.md 9.3; the QR test measures the real capsule and corrects these two numbers)
  const NAV = Object.freeze({ w: 96, h: 44 });
  const PREFIX = 'ppogeul-';
  // internal keys (never mirrored): local lseq / gen, native seq / gen / keys (native Storage cannot list its keys)
  const L_SEQ = 'pgait:lseq', L_GEN = 'pgait:gen', N_SEQ = 'pgait:seq', N_GEN = 'pgait:gen', N_KEYS = 'pgait:keys';
  const MS = { orient: 800, load: 3000, key: 8000, keyGap: 5000, lb: 8000, quiet: 2000, latest: 20000, gap: 5000, flush: 10000, retry: 10000, resync: 10000 };
  const WHO = 'ppogeul-ait-who';
  const noop = () => {};
  const now = () => (W.performance && typeof W.performance.now === 'function' ? W.performance.now() : Date.now());
  const settle = (p) => { try { if (p && typeof p.then === 'function') p.then(noop, noop); } catch (e) { /* ignore */ } };
  const int = (s) => { const n = parseInt(s, 10); return isFinite(n) && n > 0 ? n : 0; };

  // ---- one helper for every awaited SDK call: fn runs inside try (a synchronous throw), its promise races ms; a throw,
  // a rejection and the cap all come back as FAIL
  const FAIL = Object.freeze({ failed: true });
  function call(fn, ms) {
    return new Promise((resolve) => {
      let done = false, t = 0;
      const fin = (v) => { if (done) return; done = true; if (t) clearTimeout(t); resolve(v); };
      if (ms > 0) t = setTimeout(() => fin(FAIL), ms);
      let p;
      try { p = fn(); } catch (e) { fin(FAIL); return; }
      Promise.resolve(p).then(fin, () => fin(FAIL));
    });
  }
  // fn.isSupported() === true, never a throw (outside Toss it throws: not supported)
  function supported(fn) { try { return typeof fn === 'function' && typeof fn.isSupported === 'function' && fn.isSupported() === true; } catch (e) { return false; } }
  function rid(n) {
    const A = '0123456789abcdefghijklmnopqrstuvwxyz';
    let b = null; try { b = new Uint8Array(n); W.crypto.getRandomValues(b); } catch (e) { b = null; }
    let s = ''; for (let i = 0; i < n; i++) s += A[(b ? b[i] : Math.floor(Math.random() * 256)) % 36];
    return s;
  }

  // ================================================================== the storage mirror (design/toss.md 8)
  // raw access to a real web Storage through the prototype's methods as they were before the wrapper (never mirrored)
  const SP = W.Storage ? W.Storage.prototype : null;
  const ORIG = SP ? { g: SP.getItem, s: SP.setItem, r: SP.removeItem, c: SP.clear } : null;
  function rawOf(ls) {
    return {
      get: (k) => ORIG.g.call(ls, k), set: (k, v) => ORIG.s.call(ls, k, v), del: (k) => ORIG.r.call(ls, k),
      keys: () => { const out = []; for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (typeof k === 'string') out.push(k); } return out; },
    };
  }
  // the wrapper (once a page): setItem / removeItem / clear on the real localStorage run first, then mark the key
  let WRAP = null;
  function wrap(ls, st) {
    WRAP = { ls, st };
    if (wrap.done || !SP) return;
    wrap.done = true;
    const hit = (area, k) => { const w = WRAP; if (!w || area !== w.ls) return; k = String(k); if (k.indexOf(PREFIX) === 0) w.st.mark(k); };
    SP.setItem = function (k, v) { const r = ORIG.s.call(this, k, v); hit(this, k); return r; };
    SP.removeItem = function (k) { const r = ORIG.r.call(this, k); hit(this, k); return r; };
    SP.clear = function () {
      let ks = [];
      try { if (WRAP && this === WRAP.ls) ks = rawOf(this).keys().filter((k) => k.indexOf(PREFIX) === 0); } catch (e) { ks = []; }
      const r = ORIG.c.call(this);
      for (const k of ks) hit(this, k);
      return r;
    };
  }
  // store(native, local): local is a real Storage (the page's localStorage: the wrapper marks its writes) or, in the
  // unit tests, a raw adapter {get, set, del, keys} whose writer calls st.mark(k) itself
  function store(N, local, o) {
    o = o || {};
    N = N && typeof N === 'object' ? N : {};
    const real = !!(SP && local && Object.prototype.toString.call(local) === '[object Storage]');
    const L = real ? rawOf(local) : local && typeof local.get === 'function' ? local : { get: () => null, set: noop, del: noop, keys: () => [] };
    const S = {
      how: '', synced: false, never: !local, loaded: false, gen: '', lgen: '', lseq: 0, seq0: 0, nseq: 0, genSent: false,
      dirty: new Set(), sent: new Map(), nkeys: new Set(), first: 0, last: 0, prev: -1e9, timer: 0, busy: false, again: false, urgent: false,
      retry: 1, fails: 0, flushes: 0, calls: 0, writes: 0, tries: 0, rsT: 0, rsBusy: false,
    };
    const lget = (k) => { try { return L.get(k); } catch (e) { return null; } };
    const lset = (k, v) => { try { L.set(k, v); } catch (e) { /* storage full / blocked */ } };
    const ldel = (k) => { try { L.del(k); } catch (e) { /* ignore */ } };
    const lkeys = () => { try { return L.keys().filter((k) => k.indexOf(PREFIX) === 0); } catch (e) { return []; } };
    const parseKeys = (t) => { let a = null; try { a = JSON.parse(t); } catch (e) { a = null; } return Array.isArray(a) ? Array.from(new Set(a.filter((k) => typeof k === 'string' && k.indexOf(PREFIX) === 0 && k.length <= 120))).slice(0, 200) : []; };
    let readyFn = noop;
    const ready = new Promise((r) => { readyFn = r; });
    // native reads: getItems (Toss 5.270.0+, one call) or the getItem calls in parallel; meta first, then the listed keys
    function nget(ks) {
      if (supported(N.getItems)) return Promise.resolve(N.getItems(ks)).then((m) => ks.map((k) => (m && typeof m[k] === 'string' ? m[k] : null)));
      return Promise.all(ks.map((k) => Promise.resolve(N.getItem(k)).then((v) => (typeof v === 'string' ? v : null))));
    }
    function readMeta() { S.calls++; return nget([N_GEN, N_SEQ, N_KEYS]).then(([g, s, k]) => ({ gen: g || '', seq: int(s), keys: parseKeys(k) })); }
    function readAll() {
      return readMeta().then((m) => (m.keys.length ? (S.calls++, nget(m.keys)) : Promise.resolve([])).then((vs) => Object.assign(m, { vals: new Map(m.keys.map((k, i) => [k, vs[i]])) })));
    }
    // ---- boot: which side wins
    function nativeWins(r) {
      const keep = new Set(r.keys);
      for (const k of r.keys) { const v = r.vals.get(k); if (v === null || v === undefined) ldel(k); else lset(k, v); }
      for (const k of lkeys()) if (!keep.has(k)) ldel(k);
      S.gen = r.gen || rid(12); S.genSent = !!r.gen;
      lset(L_GEN, S.gen); S.lgen = S.gen;
      S.lseq = S.nseq = r.seq; lset(L_SEQ, String(S.lseq));
      S.nkeys = new Set(r.keys.filter((k) => typeof r.vals.get(k) === 'string'));
      S.sent = new Map(); for (const k of S.nkeys) S.sent.set(k, r.vals.get(k));
      S.dirty.clear(); S.how = 'native';
    }
    function localWins(nk, all) {
      for (const k of lkeys()) S.dirty.add(k);
      for (const k of nk) if (lget(k) === null) S.dirty.add(k);    // (a native key local no longer has: a removal)
      S.how = all ? 'local' : 'push';
      S.first = S.last = now();
    }
    function decide(r) {
      const has = lkeys().length > 0;
      if (!(r.seq > 0) || !r.keys.length) {                          // native empty: local wins if it has anything
        S.gen = S.lgen || rid(12); if (S.gen !== S.lgen) { lset(L_GEN, S.gen); S.lgen = S.gen; }
        S.genSent = r.gen === S.gen; S.nseq = 0; S.nkeys = new Set(); S.sent = new Map();
        if (has) localWins([], true); else S.how = 'empty';
      } else if (r.gen && r.gen === S.lgen) {                         // one lineage: the sequence numbers decide
        S.gen = r.gen; S.genSent = true; S.nseq = r.seq; S.nkeys = new Set(r.keys.filter((k) => typeof r.vals.get(k) === 'string'));
        S.sent = new Map(); for (const k of S.nkeys) S.sent.set(k, r.vals.get(k));
        if (r.seq > S.lseq) nativeWins(r);
        else if (S.lseq > r.seq) localWins(r.keys, false);
        else S.how = 'same';
      } else nativeWins(r);                                            // another lineage: native, whatever the numbers say
      S.synced = true;
    }
    async function load() {
      S.lgen = lget(L_GEN) || ''; S.lseq = int(lget(L_SEQ)); S.seq0 = S.lseq;
      if (S.never) { S.loaded = true; S.how = 'none'; readyFn(); return S.how; }
      const r = await call(readAll, MS.load);
      if (r === FAIL || !r) { S.how = 'timeout'; S.loaded = true; resyncLater(); readyFn(); return S.how; }
      decide(r); S.loaded = true; readyFn();
      if (S.dirty.size) sched(true);
      return S.how;
    }
    // ---- an unsynced session (its boot read failed): marks pile up, nothing is written native until a read of the meta
    // succeeds (at most 3 tries 10 s apart, + one on each return to the foreground) and proves it safe
    function resyncLater() { if (S.never || S.synced || S.tries >= 3) return; clearTimeout(S.rsT); S.rsT = setTimeout(() => resync(false), MS.resync); }
    async function resync(fg) {
      if (!S.loaded || S.synced || S.never || S.rsBusy) return;
      if (!fg) S.tries++;
      S.rsBusy = true;
      const r = await call(readMeta, MS.load);
      S.rsBusy = false;
      if (S.synced || S.never) return;
      if (r === FAIL || !r) { if (!fg) resyncLater(); return; }
      if (!(r.seq > 0) || !r.keys.length) {                          // native empty: everything local goes out
        S.gen = S.lgen || rid(12); if (S.gen !== S.lgen) { lset(L_GEN, S.gen); S.lgen = S.gen; }
        S.genSent = r.gen === S.gen; S.nseq = 0; S.nkeys = new Set(); S.sent = new Map();
        localWins([], true);
      } else if (r.gen && r.gen === S.lgen && r.seq <= S.seq0) {     // ours, and not newer than what this page booted on
        S.gen = r.gen; S.genSent = true; S.nseq = r.seq; S.nkeys = new Set(r.keys); S.sent = new Map();
        if (r.seq < S.seq0) localWins(r.keys, false); else { for (const k of r.keys) if (lget(k) === null) S.dirty.add(k); S.how = 'resync'; }
      } else {                                                        // another lineage / newer: never write native now
        S.never = true; S.how = 'skip';
        ldel(L_GEN);                                                  // (the next boot restores native)
        clearTimeout(S.timer); S.timer = 0;
        return;
      }
      S.synced = true;
      sched(false);
    }
    // ---- writes
    function mark(k) {
      S.lseq++; S.writes++; lset(L_SEQ, String(S.lseq));
      S.dirty.add(k);
      const t = now(); if (!S.first) S.first = t; S.last = t;
      S.retry = 1;                                                    // (a new write: the next failure may retry once again)
      if (S.synced && !S.never) sched(false);
    }
    function work() { return S.dirty.size > 0 || !S.genSent || S.lseq !== S.nseq; }
    function sched(urgent) {
      if (!S.synced || S.never) return;
      if (S.busy) { S.again = true; if (urgent) S.urgent = true; return; }
      if (!work()) return;
      clearTimeout(S.timer); S.timer = 0;
      const t = now();
      let due = urgent ? t : Math.max(Math.min(S.last + MS.quiet, (S.first || t) + MS.latest), S.prev + MS.gap);
      S.timer = setTimeout(go, Math.max(0, due - t));
    }
    async function go() {
      S.timer = 0;
      if (S.busy || !S.synced || S.never) return;
      const keys = Array.from(S.dirty), seq = S.lseq;
      S.dirty.clear(); S.first = 0;
      const sets = {}, dels = [], nk = new Set(S.nkeys);
      for (const k of keys) {
        const v = lget(k);
        if (v === null) { if (nk.has(k) || S.sent.has(k)) dels.push(k); nk.delete(k); }
        else { if (S.sent.get(k) !== v) sets[k] = v; nk.add(k); }
      }
      const kt = JSON.stringify(Array.from(nk).sort()), kChanged = kt !== JSON.stringify(Array.from(S.nkeys).sort());
      if (!Object.keys(sets).length && !dels.length && !kChanged && S.genSent && seq === S.nseq) return;
      S.busy = true; S.prev = now(); S.flushes++;
      const r = await call(() => send(sets, dels, kChanged ? kt : null, seq), MS.flush);
      S.busy = false;
      if (S.never) return;
      if (r === FAIL) {
        S.fails++;
        for (const k of keys) S.dirty.add(k);
        if (!S.first) S.first = now();
        S.again = false; S.urgent = false;
        if (S.retry > 0) { S.retry--; clearTimeout(S.timer); S.timer = setTimeout(go, MS.retry); }
        return;
      }
      for (const k of Object.keys(sets)) S.sent.set(k, sets[k]);
      for (const k of dels) S.sent.delete(k);
      S.nkeys = nk; S.genSent = true; S.nseq = seq;
      const u = S.urgent; S.again = false; S.urgent = false;
      if (S.dirty.size || S.lseq !== S.nseq) sched(u);
    }
    // one flush: the changed values (setItems in one call where Toss has it, with the key list and the lineage id),
    // else one call each; the sequence number always last - native's seq only ever counts flushes that completed
    async function send(sets, dels, kt, seq) {
      const ks = Object.keys(sets);
      if (supported(N.setItems)) {
        const batch = Object.assign({}, sets);
        if (kt !== null) batch[N_KEYS] = kt;
        if (!S.genSent) batch[N_GEN] = S.gen;
        if (Object.keys(batch).length) { S.calls++; await N.setItems(batch); }
        for (const k of dels) { S.calls++; await N.removeItem(k); }
      } else {
        for (const k of ks) { S.calls++; await N.setItem(k, sets[k]); }
        for (const k of dels) { S.calls++; await N.removeItem(k); }
        if (kt !== null) { S.calls++; await N.setItem(N_KEYS, kt); }
        if (!S.genSent) { S.calls++; await N.setItem(N_GEN, S.gen); }
      }
      S.calls++; await N.setItem(N_SEQ, String(seq));
      return true;
    }
    // urgent: the page hides / closes / an overlay covers it - what is dirty goes now (the in-flight flush first)
    function flush(urgent) { if (S.synced && !S.never) sched(urgent !== false); }
    function state() {
      return { how: S.how, synced: S.synced, never: S.never, loaded: S.loaded, gen: !!S.gen, lseq: S.lseq, nseq: S.nseq, dirty: S.dirty.size,
        busy: S.busy, flushes: S.flushes, fails: S.fails, calls: S.calls, writes: S.writes, tries: S.tries, timer: !!S.timer };
    }
    const api = { load, mark, flush, resync: () => resync(true), state, ready };
    if (real) wrap(local, api);
    return api;
  }

  // ================================================================== the bridge (window.PG_AIT)
  function keyOf(v) {
    if (v === undefined) return { st: 'old' };
    if (v && typeof v === 'object' && v.type === 'HASH' && typeof v.hash === 'string' && v.hash.length >= 8 && v.hash.length <= 512) return { st: 'ok', hash: v.hash };
    return { st: 'err' };
  }
  // the first 16 hex of SHA-256(text) ('' when crypto.subtle is missing)
  function sha16(text) {
    try {
      const sub = W.crypto && W.crypto.subtle; if (!sub || typeof TextEncoder !== 'function') return Promise.resolve('');
      return sub.digest('SHA-256', new TextEncoder().encode(text)).then((b) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16), () => '');
    } catch (e) { return Promise.resolve(''); }
  }
  const LB = { SUCCESS: 'ok', LEADERBOARD_NOT_FOUND: 'nf', PROFILE_NOT_FOUND: 'np', UNPARSABLE_SCORE: 'bad' };
  // make(sdk, st[, inner]): inner (boot's) receives the internal hooks the page lifecycle needs; never on PG_AIT
  function make(sdk, st, inner) {
    sdk = sdk && typeof sdk === 'object' ? sdk : {};
    st = st || { flush: noop, state: () => ({}), ready: Promise.resolve() };
    const sec = (o) => (o && typeof o === 'object' ? o : {});
    const Screen = () => sec(sdk.Screen), Game = () => sec(sdk.Game);
    let env = ''; try { const e = sec(sdk.Environment).environment; env = e === 'toss' || e === 'sandbox' ? e : ''; } catch (e) { env = ''; }
    // ---- the game key
    const K = { st: '', hash: '', p: null, at: -1e9, fn: null, tagged: false };
    function tag(hash) {
      if (K.tagged) return; K.tagged = true;
      Promise.resolve(st.ready).then(() => sha16('ppodeuk-bath:' + hash)).then((hex) => {
        if (!/^[0-9a-f]{16}$/.test(hex)) return;
        try { if (W.localStorage.getItem(WHO) !== hex) W.localStorage.setItem(WHO, hex); } catch (e) { /* storage blocked */ }
      }, noop);
    }
    function key() {
      if (K.st === 'ok') return Promise.resolve({ st: 'ok', hash: K.hash });
      if (K.p) return K.p;
      if (K.st === 'old') return Promise.resolve({ st: 'old' });
      if (K.st === 'err' && now() - K.at < MS.keyGap) return Promise.resolve({ st: 'err' });
      K.at = now();
      K.p = new Promise((resolve) => {
        let done = false;
        const t = setTimeout(() => fin({ st: 'err' }), MS.key);
        function fin(r) { if (done) return; done = true; clearTimeout(t); K.p = null; if (r.st !== 'ok') K.st = r.st; resolve(r.st === 'ok' ? { st: 'ok', hash: r.hash } : { st: r.st }); }
        let p;
        try {
          const f = sdk.getUserKeyForGame;
          if (typeof f.isSupported === 'function' && f.isSupported() === false) { fin({ st: 'old' }); return; }
          p = f();
        } catch (e) { fin({ st: 'err' }); return; }
        Promise.resolve(p).then((v) => {
          const r = keyOf(v);
          if (r.st === 'ok') {
            const late = done; K.st = 'ok'; K.hash = r.hash; tag(r.hash);
            if (late && K.fn) { try { K.fn(); } catch (e) { /* ignore */ } }
          }
          fin(r);
        }, () => fin({ st: 'err' }));
      });
      return K.p;
    }
    // ---- the back button, the game state, the overlay
    let backFn = null, backUn = null, playOn = false, lastScr = '', ins = { t: 0, r: 0, b: 0, l: 0 }, showUn = null;
    function back(fn) {
      fn = typeof fn === 'function' ? fn : null;
      if (fn === backFn) return !!backUn;
      if (backUn) { try { backUn(); } catch (e) { /* ignore */ } backUn = null; }
      backFn = fn;
      if (fn) {
        try {
          const un = sec(sdk.graniteEvent).addEventListener('backEvent', { onEvent: () => { try { if (backFn) backFn(); } catch (e) { /* ignore */ } }, onError: noop });
          backUn = typeof un === 'function' ? un : null;
        } catch (e) { backUn = null; }
      }
      return !!backUn;
    }
    function play(on) {
      on = !!on; if (on === playOn) return false;
      playOn = on;
      try { settle(Screen().setAwakeMode({ enabled: on })); } catch (e) { /* ignore */ }
      try { settle(Screen().setIosSwipeBack({ isEnabled: !on })); } catch (e) { /* ignore */ }
      return true;
    }
    function onShow(fn) {
      if (typeof fn !== 'function' || showUn) return false;
      try {
        const un = sdk.onVisibilityChangedByTransparentServiceWeb({ options: { callbackId: 'pg' }, onEvent: (v) => { const vis = v !== false; if (!vis) { try { st.flush(true); } catch (e) { /* ignore */ } } try { fn(vis); } catch (e) { /* ignore */ } }, onError: noop });
        showUn = typeof un === 'function' ? un : noop;
      } catch (e) { showUn = null; return false; }
      return true;
    }
    function submit(n) {
      const sc = String(Math.max(0, Math.floor(+n || 0)));
      return call(() => Game().setLeaderboardScore({ score: sc }), MS.lb).then((r) => (r === FAIL || !r || typeof r !== 'object' ? 'err' : LB[r.statusCode] || 'err'));
    }
    function open() {
      return new Promise((resolve) => {
        let done = false;
        const t = setTimeout(() => fin(true), MS.lb);                 // (no answer: it is open in front of the game)
        function fin(v) { if (!done) { done = true; clearTimeout(t); resolve(v); } }
        let p; try { p = Game().openLeaderboard(); } catch (e) { fin(false); return; }
        Promise.resolve(p).then(() => fin(true), () => fin(false));
      });
    }
    if (inner) {
      inner.ins = (v) => { ins = v; };
      inner.exit = () => {                                            // pagehide: what this mini-app changed app-wide goes back
        if (playOn) { playOn = false; try { settle(Screen().setAwakeMode({ enabled: false })); } catch (e) { /* ignore */ } try { settle(Screen().setIosSwipeBack({ isEnabled: true })); } catch (e) { /* ignore */ } }
        back(null);
      };
      inner.again = () => { const p = playOn, f = backFn; playOn = false; backFn = null; if (p) play(true); if (f) back(f); };
    }
    return Object.freeze({
      v: 1, env, nav: NAV,
      key, onKey: (fn) => { K.fn = typeof fn === 'function' ? fn : null; },
      lb: Object.freeze({ ok: () => supported(Game().setLeaderboardScore), submit, open }),
      screen(name) {
        name = String(name || '');
        if (!/^[a-z]{2,16}$/.test(name) || name === lastScr) return false;
        lastScr = name;
        try { settle(sec(sdk.Analytics).screen({ log_name: name })); } catch (e) { /* not inside Toss */ }
        return true;
      },
      back, play, onShow,
      close() { try { settle(Screen().close()); return true; } catch (e) { return false; } },
      insets: () => Object.assign({}, ins),
      sync: () => st.state(),
    });
  }

  // ================================================================== boot
  function px(x) { return typeof x === 'number' && isFinite(x) ? Math.max(0, Math.min(400, Math.round(x * 100) / 100)) : 0; }
  function domParsed() {
    if (document.readyState !== 'loading' && document.body) return Promise.resolve();
    return new Promise((r) => document.addEventListener('DOMContentLoaded', () => r(), { once: true }));
  }
  function failLine() {
    try {
      const p = document.createElement('p');
      p.textContent = '게임을 불러오지 못했어요. 닫고 다시 열어 주세요';
      p.style.cssText = 'position:fixed;left:0;right:0;top:40%;z-index:2147483647;margin:0;padding:16px;text-align:center;color:#fbf0d9;font:16px/1.5 system-ui,sans-serif';
      (document.body || document.documentElement).appendChild(p);
    } catch (e) { /* ignore */ }
  }
  // the engine files in order (async = false keeps the order), appended once the page is parsed
  function loadScripts(list) {
    return new Promise((resolve) => {
      const L = (Array.isArray(list) ? list : []).filter((s) => typeof s === 'string' && s);
      if (!L.length) { resolve(true); return; }
      let left = L.length, bad = false;
      const one = (ok) => { if (!ok && !bad) { bad = true; failLine(); } if (--left === 0) resolve(!bad); };
      for (const src of L) {
        const s = document.createElement('script');
        s.src = src; s.async = false;
        s.onload = () => one(true); s.onerror = () => one(false);
        document.body.appendChild(s);
      }
    });
  }
  function boot(sdk, opts) {
    opts = opts || {};
    sdk = sdk && typeof sdk === 'object' ? sdk : {};
    const T0 = now();
    // 1. the storage wrapper before anything else
    let ls = null; try { ls = W.localStorage; } catch (e) { ls = null; }
    const st = store(sdk.Storage, ls, {});
    const inner = {};
    const br = make(sdk, st, inner);
    const scr = (o) => (o && typeof o === 'object' ? o : {});
    // 2. landscape (it applies to the whole Toss app: pagehide asks for portrait again); not supported: the rotate screen
    let asked = false;
    const land = () => call(() => { if (!supported(scr(sdk.Screen).setOrientation)) return null; asked = true; return sdk.Screen.setOrientation({ type: 'landscape' }); }, MS.orient);
    const orient = land();
    // 3. the Safe Area -> --sa-t/r/b/l (px) on <html style> (they win over page.html's env() on :root); the nav bar box
    const root = document.documentElement.style;
    root.setProperty('--ait-nav-w', NAV.w + 'px'); root.setProperty('--ait-nav-h', NAV.h + 'px');
    const apply = (v) => {
      if (!v || typeof v !== 'object') return false;
      const i = { t: px(v.top), r: px(v.right), b: px(v.bottom), l: px(v.left) };
      root.setProperty('--sa-t', i.t + 'px'); root.setProperty('--sa-r', i.r + 'px'); root.setProperty('--sa-b', i.b + 'px'); root.setProperty('--sa-l', i.l + 'px');
      inner.ins(i);
      return true;
    };
    try { apply(scr(sdk.SafeAreaInsets).get()); } catch (e) { /* not inside Toss: env() stays */ }
    try { sdk.SafeAreaInsets.subscribe({ onEvent: (v) => { if (apply(v)) { try { W.dispatchEvent(new Event('resize')); } catch (e) { /* ignore */ } } } }); } catch (e) { /* ignore */ }
    // 8. the page lifecycle (from the start: a page closed during boot flushes too)
    document.addEventListener('visibilitychange', () => { if (document.hidden) st.flush(true); else st.resync(); });
    W.addEventListener('pagehide', () => {
      st.flush(true);
      if (asked) { try { settle(sdk.Screen.setOrientation({ type: 'portrait' })); } catch (e) { /* ignore */ } }
      inner.exit();
    });
    W.addEventListener('pageshow', (e) => { if (e && e.persisted) { settle(land()); inner.again(); } });
    // 4. native Storage into localStorage (3 s at most); 5. the game key (asked now, never waited for)
    const loadP = st.load();
    br.key();
    return Promise.all([orient, loadP]).then(() => {
      // 6. the bridge, then the one "init" screen log
      W.PG_AIT = br;
      br.screen('title');
      PG.Ait.t0 = T0; PG.Ait.ready = now() - T0;
      // 7. the engine
      return domParsed().then(() => loadScripts(opts.scripts));
    });
  }

  PG.Ait = { boot, make, store, call, FAIL, NAV, MS, supported };
})();
