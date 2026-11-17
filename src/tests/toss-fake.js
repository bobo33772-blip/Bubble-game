// A fake 앱인토스 SDK for the Toss test pages (design/toss.md 15.2, 15.3): exactly the members src/ait.js calls (the
// 3.9.0 shapes of 1.2), so the PG_AIT a test sees is the REAL bridge over a fake SDK. Not a test page of its own
// (build.js puts it inline in test-toss.html's head and beside toss-fx/ as toss-fake.js).
//   PGFake.make(cfg) -> F    cfg {key, insets, boot, throwAll, env}
//     F.sdk                  the fake SDK handed to PG.Ait.boot / make / store
//     F.log                  every call as [name, args, t] (t: performance.now()); F.calls(name) filters it
//     F.on(name, ...a)       answers for the next calls of name, in order; F.always(name, a) for every later call
//                            a: {v} a value, {e: 'msg'} a rejection, 'never' (pending forever), {ms, v|e} after ms (virtual
//                            time), {throw: 'msg'} a synchronous throw, or a function(args) returning one of these
//                            (a sync member - isSupported, SafeAreaInsets.get - takes {v} / {throw})
//     F.storage              the native Storage (a Map); F.sup[name] = whether name.isSupported() says true
//     F.fire(ev, payload)    'backEvent' / 'homeEvent' to the graniteEvent listeners, 'show' (true / false) to
//                            onVisibilityChangedByTransparentServiceWeb, 'insets' ({top, left, right, bottom}) to
//                            SafeAreaInsets.subscribe; F.listeners(ev) counts them
//   PGFake.start(scripts)    the test pages' boot line: a fake from the page's own URL (#boot=<scenario>, ?k=<key>,
//                            &ins=l,r,b,t), window.PG_FAKE = it, then PG.Ait.boot(F.sdk, {scripts})
// Default answers settle without timers. Also spies: fetch / XMLHttpRequest / WebSocket (F.net counts them) and the
// localStorage reads of 'ppogeul-*' keys (logged as ['ls.get', [key]]) - installed by start() before src/ait.js boots.
window.PGFake = (function () {
  'use strict';
  const W = window;
  const KEYS = { A: 'fakeHashA-0123456789abcdefghijklmnopqrstuv', B: 'fakeHashB-zyxwvutsrqponmlkjihgfedcba9876543210' };
  function make(cfg) {
    cfg = cfg || {};
    const F = { log: [], storage: new Map(), q: {}, perm: {}, sup: {}, subs: { backEvent: [], homeEvent: [], show: [], insets: [] }, cfg, net: { fetch: 0, xhr: 0, ws: 0 } };
    F.sup = { getUserKeyForGame: true, 'Screen.setOrientation': true, 'Storage.getItems': false, 'Storage.setItems': false, 'Game.setLeaderboardScore': true, 'Game.openLeaderboard': true, 'Game.getUserProfile': true };
    F.insets = Object.assign({ top: 0, left: 47, right: 47, bottom: 21 }, cfg.insets || {});
    if (cfg.noorient) F.sup['Screen.setOrientation'] = false;     // (an old Toss app: the rotate screen asks instead)
    F.key = cfg.key === undefined ? KEYS.A : cfg.key;
    const now = () => performance.now();
    const rec = (name, args) => { F.log.push([name, args, now()]); };
    F.calls = (name) => F.log.filter((e) => e[0] === name);
    F.on = (name, ...a) => { (F.q[name] = F.q[name] || []).push(...a); return F; };
    F.always = (name, a) => { if (a === undefined) delete F.perm[name]; else F.perm[name] = a; return F; };
    F.clear = (name) => { delete F.q[name]; delete F.perm[name]; return F; };
    const next = (name, args) => {
      let a = F.q[name] && F.q[name].length ? F.q[name].shift() : F.perm[name];
      if (typeof a === 'function') a = a(args);
      return a;
    };
    // an async member: rec, then the scripted answer or dflt() (a value, settled without a timer)
    const am = (name, dflt) => function (...args) {
      if (F.cfg.throwAll) { rec(name + '!throw', args); throw new Error('apps-in-toss 웹뷰 환경이 아니에요 (fake)'); }
      rec(name, args);
      const a = next(name, args);
      if (a === undefined) { let v; try { v = dflt.apply(null, args); } catch (e) { return Promise.reject(e); } return Promise.resolve(v); }
      if (a === 'never') return new Promise(() => {});
      if (a.throw) throw new Error(a.throw);
      if (a.ms) return new Promise((res, rej) => setTimeout(() => (a.e ? rej(new Error(a.e)) : res(typeof a.v === 'function' ? a.v() : a.v)), a.ms));
      if (a.e) return Promise.reject(new Error(a.e));
      return Promise.resolve(a.v);
    };
    // a synchronous member
    const sm = (name, dflt) => function (...args) {
      if (F.cfg.throwAll) { rec(name + '!throw', args); throw new Error('apps-in-toss 웹뷰 환경이 아니에요 (fake)'); }
      rec(name, args);
      const a = next(name, args);
      if (a === undefined) return dflt.apply(null, args);
      if (a.throw) throw new Error(a.throw);
      return a.v;
    };
    const sup = (name) => sm(name + '.isSupported', () => F.sup[name] !== false);
    const subscribe = (kind) => (o) => { const fn = o && o.onEvent; F.subs[kind].push(fn); return () => { const i = F.subs[kind].indexOf(fn); if (i >= 0) F.subs[kind].splice(i, 1); rec('unsub:' + kind, []); }; };
    const fn = (f, name) => Object.assign(f, { isSupported: sup(name) });
    const st = F.storage;
    const sdk = {
      getUserKeyForGame: fn(am('getUserKeyForGame', () => (F.key === null ? 'ERROR' : { type: 'HASH', hash: F.key })), 'getUserKeyForGame'),
      Storage: {
        getItem: am('Storage.getItem', (k) => (st.has(k) ? st.get(k) : null)),
        setItem: am('Storage.setItem', (k, v) => { st.set(String(k), String(v)); }),
        removeItem: am('Storage.removeItem', (k) => { st.delete(String(k)); }),
        clearItems: am('Storage.clearItems', () => { st.clear(); }),
        getItems: fn(am('Storage.getItems', (ks) => { const o = {}; for (const k of ks) o[k] = st.has(k) ? st.get(k) : null; return o; }), 'Storage.getItems'),
        setItems: fn(am('Storage.setItems', (o) => { for (const k of Object.keys(o)) st.set(k, String(o[k])); }), 'Storage.setItems'),
      },
      Screen: {
        setOrientation: fn(am('Screen.setOrientation', () => undefined), 'Screen.setOrientation'),
        setAwakeMode: am('Screen.setAwakeMode', () => undefined),
        setIosSwipeBack: am('Screen.setIosSwipeBack', () => undefined),
        close: am('Screen.close', () => undefined),
      },
      SafeAreaInsets: {
        get: sm('SafeAreaInsets.get', () => Object.assign({}, F.insets)),
        subscribe: (o) => { if (F.cfg.throwAll) throw new Error('fake: not in Toss'); rec('SafeAreaInsets.subscribe', []); return subscribe('insets')(o); },
      },
      graniteEvent: {
        addEventListener: (ev, o) => { if (F.cfg.throwAll) throw new Error('fake: not in Toss'); rec('graniteEvent.addEventListener', [ev]); return subscribe(ev === 'homeEvent' ? 'homeEvent' : 'backEvent')(o); },
      },
      Game: {
        setLeaderboardScore: fn(am('Game.setLeaderboardScore', () => ({ statusCode: 'SUCCESS' })), 'Game.setLeaderboardScore'),
        openLeaderboard: fn(am('Game.openLeaderboard', () => undefined), 'Game.openLeaderboard'),
        getUserProfile: fn(am('Game.getUserProfile', () => ({ statusCode: 'PROFILE_NOT_FOUND' })), 'Game.getUserProfile'),
        subscribeInfoOverlayHidden: (o) => { rec('Game.subscribeInfoOverlayHidden', []); return () => {}; },
      },
      Analytics: { screen: am('Analytics.screen', () => undefined), impression: am('Analytics.impression', () => undefined), click: am('Analytics.click', () => undefined), log: am('Analytics.log', () => undefined) },
      Environment: { get environment() { if (F.cfg.throwAll) throw new Error('fake: not in Toss'); return cfg.env || 'toss'; } },
      isMinVersionSupported: sm('isMinVersionSupported', () => true),
      onVisibilityChangedByTransparentServiceWeb: (o) => { if (F.cfg.throwAll) throw new Error('fake: not in Toss'); rec('onVisibilityChangedByTransparentServiceWeb', [o && o.options]); return subscribe('show')(o); },
    };
    F.sdk = sdk;
    F.fire = (ev, payload) => {
      const k = ev === 'show' ? 'show' : ev === 'insets' ? 'insets' : ev === 'homeEvent' ? 'homeEvent' : 'backEvent';
      if (k === 'insets' && payload) F.insets = Object.assign({}, payload);
      for (const f of F.subs[k].slice()) { try { f(payload); } catch (e) { console.error('fake listener', e); } }
      return F.subs[k].length;
    };
    F.listeners = (ev) => F.subs[ev === 'show' ? 'show' : ev === 'insets' ? 'insets' : ev === 'homeEvent' ? 'homeEvent' : 'backEvent'].length;
    // the scenarios a boot can start from (#boot=...)
    const B = cfg.boot || '';
    if (B === 'throw') F.cfg.throwAll = true;
    if (B === 'slow') F.always('Storage.getItem', 'never');
    if (B === 'restore') {
      // a full native store (the local one is empty: a fresh profile = a wiped WebView storage)
      const S = { v: 5, dev: 'abcd1234', t: 777, best: 800, bl: 0, w: 3, g: 9, ko: 4, day: 0, de: 0, seen: 1, esc: [], ce: 500, sp: 100, own: ['h2'], eq: '0'.repeat(30), lh: 0,
        cd: 0, cde: 0, bd: 0, bs: 0, sh: 0, cv: 0, dn: 0, pt: 0, gd: [], dl: null, ds: 0, nw: [], gs: 0 };
      const vals = { 'ppogeul-trophy': JSON.stringify(S), 'ppogeul-hiscore': '12345', 'ppogeul-nick': '토스친구', 'ppogeul-muted': '1', 'ppogeul-ait-lb': JSON.stringify({ ok: 4000, p: 0 }) };
      for (const k of Object.keys(vals)) st.set(k, vals[k]);
      st.set('pgait:keys', JSON.stringify(Object.keys(vals).sort())); st.set('pgait:gen', 'nativegen001'); st.set('pgait:seq', '7');
    }
    // (the default boot: the game key arrives late - 12 s, after the bridge's 8 s cap - and the next try says ERROR)
    if (B === '' && cfg.lateKey) F.on('getUserKeyForGame', { ms: 12000, v: () => ({ type: 'HASH', hash: F.key }) }, { v: 'ERROR' });
    return F;
  }
  function spies(F) {
    try {
      const P = W.Storage.prototype, g = P.getItem;
      P.getItem = function (k) { if (typeof k === 'string' && k.indexOf('ppogeul-') === 0 && this === W.localStorage) F.log.push(['ls.get', [k], performance.now()]); return g.call(this, k); };
    } catch (e) { /* ignore */ }
    try { const f = W.fetch; if (typeof f === 'function') W.fetch = function () { F.net.fetch++; return f.apply(this, arguments); }; } catch (e) { /* ignore */ }
    try { const o = W.XMLHttpRequest.prototype.open; W.XMLHttpRequest.prototype.open = function () { F.net.xhr++; return o.apply(this, arguments); }; } catch (e) { /* ignore */ }
    try { const WS = W.WebSocket; if (typeof WS === 'function') { W.WebSocket = function (u, p) { F.net.ws++; return new WS(u, p); }; W.WebSocket.prototype = WS.prototype; } } catch (e) { /* ignore */ }
  }
  function fromUrl() {
    const q = {};
    const put = (s) => { for (const part of String(s || '').replace(/^[?#]/, '').split('&')) { if (!part) continue; const i = part.indexOf('='); q[decodeURIComponent(i < 0 ? part : part.slice(0, i))] = i < 0 ? '' : decodeURIComponent(part.slice(i + 1)); } };
    put(location.search); put(location.hash);
    const cfg = { boot: q.boot || '' };
    if (q.k) cfg.key = KEYS[q.k] || q.k;
    if (q.ins) { const a = q.ins.split(',').map((x) => +x || 0); cfg.insets = { left: a[0] || 0, right: a[1] || 0, bottom: a[2] || 0, top: a[3] || 0 }; }
    if (!cfg.boot && !q.shot && !q.k) cfg.lateKey = true;
    if (q.noorient) cfg.noorient = true;
    return cfg;
  }
  function start(scripts) {
    const F = make(fromUrl());
    W.PG_FAKE = F;
    spies(F);
    if (!W.PG || !W.PG.Ait) { console.error('PGFake.start: src/ait.js is not loaded'); return null; }
    return W.PG.Ait.boot(F.sdk, { scripts });
  }
  return { make, start, KEYS };
})();
