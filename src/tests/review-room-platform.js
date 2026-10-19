// Platform-contract review: the ARTIFACT page (dist/ppogeul-bath.html) played in 2-3 same-origin iframes through a
// FAKE `window.claude` whose use("room" | "user") follows the documented runtime contract (room.d.ts / user.d.ts 0.2.75):
//   - window.claude carries only `use` (a Proxy records every other member a page reads); use() resolves later,
//     never during the first run; null for a view that cannot connect (also: null after 10 s when nobody answers)
//   - presence(patch): per-field merge, top-level null removes, the MERGED object <= 4 KiB, nesting <= 8, plain JSON,
//     identifier keys (not prototype names) - else rejects invalid_argument and is NOT applied; strings with control /
//     invisible characters or > 1 KiB are recorded (the forwarding rules); sent coalesced, whole, <= ~30/s per room,
//     a shared ~40/s budget per page (burst 80: past it presence waits); per-pair ordered delivery with latency+jitter
//   - peers(): frozen, the same array until something changes, a frozen [] until the first answer, me included
//     (sameTab), plus the publishing session as kind:"agent" in the lobby; unchanged peers keep the same object
//   - onPeers: at most once per animation frame of the RECEIVING page, first delivery no earlier than a microtask
//     (everyone so far as joined), others "answer" over the following ~0.8 s; onConnection: once soon, then changes
//   - connected() false at load, true after ~0.5 s; blips (connection refresh) re-assert + reconcile
//   - emit is not opened for this artifact (rejects not_permitted; counted); terminal codes (revoked / not_granted):
//     every listener's onError once, calls reject, peers() decays to just me, the others see me leave
// Phases (?only=...): null (use("room") -> null: a public-link viewer), never (nobody answers for 10 s: a tap of 방 만들기
// and one of 참여 while that is pending), not_granted, dies (the room dies under a join; then a forced-bc page, unchanged),
// room, stress, flap. The first four check the block card of design/distinction.md 4.2 (방 만들기 off, 참여 answered at
// once with the true reason, never 방을 찾을 수 없어요). ?shot=off|off-tap: the screenshot of a public-link viewer's
// friends panel, before / after a 참여 tap (run-all off-friends-*), then "SHOT READY".
// Generated pages (tools/run-all.js writes them after node build.js - jobs room-platform / peer-deploy; or serve
// C:/Temp/bogeul with node tools/serve.js and run the line below):
// rrp-main.html (this driver), served by tools/serve.js; run with
//   node tools/run-chrome.js http://localhost:8765/rrp-main.html - 1200 900 rt600000 "RRP DONE"
// Prints "RRP PASS|FAIL <name>", "RRP METRIC <name> <json>", "RRP DONE pass=N fail=M".
(function () {
  'use strict';
  if (window.__RRP_DRIVER) return;
  window.__RRP_DRIVER = 1;
  const Q = new URLSearchParams(location.search);
  const ONLY = (Q.get('only') || '').split(',').filter(Boolean);
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => {
    if (cond) { pass++; log('RRP PASS ' + name); } else { fail++; log('RRP FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); }
    return !!cond;
  };
  const metric = (name, v) => log('RRP METRIC ' + name + ' ' + JSON.stringify(v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clock = () => performance.now();
  async function until(pred, ms, step) {
    const t0 = clock();
    for (;;) {
      let v = false;
      try { v = pred(); } catch (e) { v = false; }
      if (v) return v;
      if (clock() - t0 > ms) return false;
      await sleep(step || 30);
    }
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  try { if (window.PG && PG.debug) PG.debug.G.manual = true; } catch (e) { /* ignore */ }

  // ===================================================================================== the fake platform
  const PF = (function makePlatform() {
    const pf = { lat: +(Q.get('lat') || 45), jit: +(Q.get('jit') || 35), pages: [], rooms: new Map(), viol: [], soft: [], softKeys: new Set(),
      emits: 0, ons: 0, props: {}, maxBytes: { lobby: 0, game: 0 }, starved: 0, n: 0, throws: [], q: [], qSeq: 0 };
    const now = () => performance.now();
    const KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
    const PROTO = new Set(Object.getOwnPropertyNames(Object.prototype).concat(['prototype']));
    const INVIS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]/;
    const NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
    const rnd = (n) => { let s = ''; while (s.length < n) s += Math.random().toString(36).slice(2); return s.slice(0, n); };
    const err = (code, message) => Object.assign(new Error(message || code), { code });
    const utf8 = (s) => new TextEncoder().encode(s).length;
    const members = (name) => { let s = pf.rooms.get(name); if (!s) { s = new Set(); pf.rooms.set(name, s); } return s; };
    function deepFreeze(win, o) { if (o && typeof o === 'object') { win.Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(win, o[k]); } return o; }
    const inRealm = (win, str) => deepFreeze(win, win.JSON.parse(str));
    function hardCheck(v, lvl, path) {
      if (v === null || typeof v === 'boolean' || typeof v === 'string') return null;
      if (typeof v === 'number') return Number.isFinite(v) ? null : 'non-finite number at ' + path;
      if (typeof v !== 'object') return 'non-JSON ' + typeof v + ' at ' + path;
      if (lvl > 8) return 'nesting deeper than 8 at ' + path;
      if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const w = hardCheck(v[i], lvl + 1, path + '[' + i + ']'); if (w) return w; } return null; }
      if (Object.prototype.toString.call(v) !== '[object Object]') return 'exotic object at ' + path;
      for (const k of Object.keys(v)) {
        if (!KEY_RE.test(k) || PROTO.has(k)) return 'key "' + k + '" is not a plain identifier at ' + path;
        const w = hardCheck(v[k], lvl + 1, path + '.' + k); if (w) return w;
      }
      return null;
    }
    function softCheck(v, path, out) {
      if (typeof v === 'string') {
        if (INVIS.test(v)) out.push('control/invisible character in string at ' + path);
        if (utf8(v) > 1024) out.push('string over 1 KiB (' + utf8(v) + ' B) at ' + path);
      } else if (v && typeof v === 'object') for (const k of Object.keys(v)) softCheck(v[k], path + '.' + k, out);
      return out;
    }
    // the delivery queue (one for the whole platform, ordered by due time then by insertion)
    function later(at, fn) { pf.q.push({ at, s: ++pf.qSeq, fn }); }
    function pump() {
      const t = now();
      if (pf.q.length) {
        pf.q.sort((a, b) => a.at - b.at || a.s - b.s);
        while (pf.q.length && pf.q[0].at <= t) { const e = pf.q.shift(); try { e.fn(); } catch (x) { pf.throws.push('platform: ' + (x && x.message)); } }
      }
      for (const page of pf.pages) {
        if (page.gone) continue;
        page.tokens = Math.min(80, page.tokens + (t - page.tokAt) * 0.04); page.tokAt = t;
        for (const h of page.handles.values()) {
          if (!h.active || !h.dirty || !page.connected || page.terminal || t - h.lastSend < 33) continue;
          if (page.tokens < 1) { pf.starved++; continue; }
          page.tokens -= 1; h.dirty = false; h.lastSend = t; page.sends.push(t);
          const str = JSON.stringify(h.mine), ver = ++h.ver;
          for (const o of members(h.name)) if (o !== h && o.active) send(h, o, str, ver, 0);
        }
      }
    }
    setInterval(pump, 4);
    function send(h, o, str, ver, extra) {
      const at = Math.max(now() + pf.lat + Math.random() * pf.jit + (extra || 0), h.pairAt.get(o) || 0);
      h.pairAt.set(o, at);
      later(at, () => o.recv(h, str, ver));
    }
    function fireListeners(list, arg, isErr) {
      for (const l of list.slice()) {
        if (!l.live) continue;
        try { if (isErr) { l.live = false; if (l.onErr) l.onErr(arg); } else l.fn(arg); } catch (x) { pf.throws.push('listener: ' + (x && x.stack ? x.stack.split('\n').slice(0, 2).join(' ') : x)); }
      }
    }

    function mkHandle(page, name) {
      const win = page.win;
      const h = { page, name, active: true, mine: {}, mineF: deepFreeze(win, {}), myAt: Date.now(), dirty: false, lastSend: -1e9, ver: 0,
        view: new Map(), peerL: [], connL: [], pend: new Map(), rafOn: false, snap: null, answered: false, selfObj: null, pairAt: new Map(), firsts: [] };
      const agent = name === '' ? win.Object.freeze({ peer: 'agentpublishsess', by: null, isMe: false, sameTab: false, kind: 'agent', guest: false, presence: deepFreeze(win, {}), updatedAt: Date.now() }) : null;
      h.self = () => {
        if (!h.selfObj) h.selfObj = win.Object.freeze({ peer: page.label, by: page.userId, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: h.mineF, updatedAt: h.myAt });
        return h.selfObj;
      };
      h.peers = () => {
        if (page.terminal) return win.Object.freeze([h.self()]);
        if (!h.answered) return page.EMPTY;
        if (!h.snap) {
          const a = [h.self()];
          if (agent) a.push(agent);
          for (const v of h.view.values()) a.push(v.obj);
          h.snap = win.Object.freeze(a);
        }
        return h.snap;
      };
      h.queue = (kind, label, obj) => {
        const cur = h.pend.get(label);
        if (cur && cur.kind === 'joined' && kind === 'left') h.pend.delete(label);
        else h.pend.set(label, { kind: cur && cur.kind === 'joined' ? 'joined' : cur && cur.kind === 'left' && kind === 'joined' ? 'updated' : kind, obj });
        h.schedule();
      };
      h.schedule = () => {
        if (h.rafOn || page.gone) return;
        h.rafOn = true;
        try { win.requestAnimationFrame(h.dispatch); } catch (e) { h.rafOn = false; }
      };
      h.dispatch = () => {
        h.rafOn = false;
        if (!h.active || page.terminal || !h.pend.size || !h.answered) return;
        const joined = [], left = [], updated = [];
        for (const { kind, obj } of h.pend.values()) (kind === 'joined' ? joined : kind === 'left' ? left : updated).push(obj);
        h.pend.clear();
        const ch = win.Object.freeze({ peers: h.peers(), joined: win.Object.freeze(joined), left: win.Object.freeze(left), updated: win.Object.freeze(updated) });
        fireListeners(h.peerL.filter((l) => l.started), ch);
      };
      h.recv = (from, str, ver) => {
        if (!h.active || !page.connected || page.terminal || page.gone || !from.active) return;   // dropped while disconnected
        const label = from.page.label, old = h.view.get(label);
        if (old && old.ver >= ver) return;
        if (old && old.str === str) { old.ver = ver; return; }                                     // keepalive: same object
        const obj = win.Object.freeze({ peer: label, by: from.page.userId, isMe: false, sameTab: false, kind: 'viewer', guest: !!from.page.cfg.guest, presence: inRealm(win, str), updatedAt: Date.now() });
        h.view.set(label, { ver, str, obj }); h.snap = null;
        h.queue(old ? 'updated' : 'joined', label, obj);
      };
      h.drop = (label) => {
        const old = h.view.get(label); if (!old) return;
        h.view.delete(label); h.snap = null; h.queue('left', label, old.obj);
      };
      h.answer = () => {
        if (h.answered) return;
        h.answered = true; h.snap = null;
        // the others answer over the next ~0.8 s
        for (const o of members(name)) if (o !== h && o.active && o.page.connected && !o.page.terminal) send(o, h, JSON.stringify(o.mine), o.ver || 0, Math.random() * 800);
        for (const f of h.firsts.splice(0)) f();
      };
      const presence = (patch) => {
        const t = now();
        page.calls.push(t);
        if (page.terminal) return Promise.reject(err(page.terminal));
        if (!h.active) return Promise.reject(err('invalid_argument', 'room was left'));
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) { pf.viol.push(page.who + ': patch not an object'); return Promise.reject(err('invalid_argument', 'patch')); }
        const merged = Object.assign({}, h.mine);
        for (const k of Object.keys(patch)) { if (patch[k] === null) delete merged[k]; else merged[k] = patch[k]; }
        const why = hardCheck(merged, 1, name ? 'game' : 'lobby');
        let str = null;
        if (!why) { try { str = JSON.stringify(merged); } catch (e) { str = null; } }
        const size = str ? utf8(str) : 0;
        const kind = name ? 'game' : 'lobby';
        if (size > pf.maxBytes[kind]) pf.maxBytes[kind] = size;
        const bad = why || (!str ? 'not JSON' : size > 4096 ? 'merged presence ' + size + ' bytes > 4096' : null);
        if (bad) { pf.viol.push(page.who + ' ' + kind + ': ' + bad); return Promise.reject(err('invalid_argument', bad)); }
        for (const s of softCheck(merged, kind, [])) { const key = page.who + ' ' + s; if (!pf.softKeys.has(key)) { pf.softKeys.add(key); pf.soft.push(key); } }
        h.mine = JSON.parse(str); h.mineF = inRealm(win, str); h.myAt = Date.now(); h.selfObj = null; h.snap = null;
        h.dirty = true;
        if (h.answered) h.queue('updated', page.label, h.self());
        return Promise.resolve();
      };
      const onPeers = (fn, onErr) => {
        if (typeof fn !== 'function') throw new TypeError('handler');
        const l = { fn, onErr, live: true, started: false };
        h.peerL.push(l);
        const first = () => {
          if (!l.live || l.started || page.terminal) return;
          win.requestAnimationFrame(() => {
            if (!l.live || l.started || page.terminal) return;
            l.started = true;
            const ps = h.peers();
            try { fn(win.Object.freeze({ peers: ps, joined: ps, left: page.EMPTY, updated: page.EMPTY })); } catch (x) { pf.throws.push('first onPeers: ' + x.message); }
          });
        };
        Promise.resolve().then(() => {
          if (page.terminal) { if (l.live) { l.live = false; if (onErr) onErr({ code: page.terminal, message: page.terminal }); } return; }
          if (h.answered) first(); else h.firsts.push(first);
        });
        return () => { l.live = false; };
      };
      const onConnection = (fn, onErr) => {
        if (typeof fn !== 'function') throw new TypeError('handler');
        const l = { fn, onErr, live: true, last: undefined };
        h.connL.push(l);
        Promise.resolve().then(() => {
          if (!l.live) return;
          if (page.terminal) { l.live = false; if (onErr) onErr({ code: page.terminal, message: page.terminal }); return; }
          l.last = page.connected; try { fn(l.last); } catch (x) { pf.throws.push('onConnection: ' + x.message); }
        });
        return () => { l.live = false; };
      };
      h.connChanged = () => {
        for (const l of h.connL) if (l.live && l.last !== undefined && l.last !== page.connected) { l.last = page.connected; try { l.fn(l.last); } catch (x) { pf.throws.push('onConnection: ' + x.message); } }
      };
      const ns = {
        presence, peers: h.peers, onPeers, onConnection,
        connected: () => page.connected && !page.terminal && h.active,
        emit: (topic) => { pf.emits++; return Promise.reject(err(page.terminal || 'not_permitted', 'topic ' + topic + ' is admin-only')); },
        on: () => { pf.ons++; return () => {}; },
      };
      if (name === '') {
        ns.join = (n) => {
          if (page.terminal) return Promise.reject(err(page.terminal));
          if (typeof n !== 'string' || !NAME_RE.test(n)) return Promise.reject(err('invalid_argument', 'room name'));
          const ex = page.handles.get(n);
          if (ex && ex.active) return Promise.resolve(ex.ns);
          let named = 0; for (const x of page.handles.values()) if (x.name && x.active) named++;
          if (named >= 16) return Promise.reject(err('limit_reached'));
          return new Promise((resolve, reject) => {
            const t0 = now();
            const go = () => {
              if (page.terminal) { reject(err(page.terminal)); return; }
              if (!page.connected) { if (now() - t0 > 10000) reject(err('upstream_error')); else setTimeout(go, 50); return; }
              setTimeout(() => {
                if (page.terminal || page.gone) { reject(err(page.terminal || 'upstream_error')); return; }
                const nh = mkHandle(page, n);
                page.handles.set(n, nh);
                members(n).add(nh);
                nh.answer();
                resolve(nh.ns);
              }, pf.lat);
            };
            go();
          });
        };
        ns.sendToClaudeSession = () => Promise.reject(err('claude_unavailable'));
        ns.canSendToClaudeSession = () => Promise.resolve('no_session');
      } else {
        ns.name = name;
        ns.leave = () => {
          if (!h.active) return Promise.resolve();
          h.active = false; members(name).delete(h);
          for (const l of h.peerL.concat(h.connL)) l.live = false;
          for (const o of members(name)) if (o.active) later(now() + pf.lat, () => o.drop(page.label));
          if (page.handles.get(name) === h) page.handles.delete(name);
          return Promise.resolve();
        };
        // later calls on a left room reject invalid_argument
        const p0 = ns.presence; ns.presence = (patch) => (h.active ? p0(patch) : Promise.reject(err('invalid_argument', 'room was left')));
      }
      h.ns = win.Object.freeze(ns);
      return h;
    }

    function setConnected(page, c) {
      if (page.terminal || page.gone || page.connected === c) return;
      page.connected = c;
      for (const h of page.handles.values()) {
        if (!h.active) continue;
        Promise.resolve().then(() => h.connChanged());
        if (!c) continue;
        if (!h.answered) { h.answer(); continue; }
        // reconnect: the runtime re-asserts me and reconciles the room
        h.dirty = true;
        const present = new Set();
        for (const o of members(h.name)) if (o !== h && o.active && !o.page.terminal) { present.add(o.page.label); send(o, h, JSON.stringify(o.mine), o.ver, 0); }
        for (const label of Array.from(h.view.keys())) if (!present.has(label)) later(now() + pf.lat, () => h.drop(label));
      }
    }
    function removePage(page) {
      for (const h of page.handles.values()) {
        if (!h.active) continue;
        h.active = false; members(h.name).delete(h);
        for (const o of members(h.name)) if (o.active) later(now() + pf.lat + 200, () => o.drop(page.label));
      }
    }
    pf.terminate = (page, code) => {
      if (page.terminal) return;
      page.terminal = code; page.connected = false;
      for (const h of page.handles.values()) {
        if (!h.active) continue;
        const e = { code, message: code };
        Promise.resolve().then(() => { fireListeners(h.peerL, e, true); fireListeners(h.connL, e, true); });
      }
      removePage(page);
    };
    pf.flap = (page, ms) => {
      setConnected(page, false);
      const hs = Array.from(page.handles.values()).filter((h) => h.active);
      for (const h of hs) { members(h.name).delete(h); for (const o of members(h.name)) if (o.active) later(now() + pf.lat, () => o.drop(page.label)); }
      setTimeout(() => { for (const h of hs) if (h.active) { members(h.name).add(h); h.pairAt = new Map(); } setConnected(page, true); for (const h of hs) if (h.active) for (const o of members(h.name)) if (o !== h && o.active) send(h, o, JSON.stringify(h.mine), ++h.ver, 0); }, ms);
    };
    pf.blip = (page, ms) => { setConnected(page, false); setTimeout(() => setConnected(page, true), ms); };
    pf.unload = (page) => { if (page.gone) return; removePage(page); page.gone = true; };
    pf.attach = (win, cfg) => {
      const page = { who: cfg.who || ('p' + (pf.n + 1)), n: ++pf.n, label: rnd(16), userId: 'u_' + rnd(12), win, cfg, connected: false, terminal: null, gone: false,
        handles: new Map(), tokens: 80, tokAt: now(), calls: [], sends: [], uses: new Map(), EMPTY: win.Object.freeze([]), firstRunDone: false, usedEarly: [] };
      page.lobby = mkHandle(page, '');
      page.handles.set('', page.lobby);
      members('').add(page.lobby);
      win.setTimeout(() => { page.firstRunDone = true; }, 0);
      const user = win.Object.freeze({
        me: () => Promise.resolve(win.Object.freeze({ id: page.userId, name: cfg.name || '', avatarUrl: 'data:,', color: '#7fdcc8', email: null, isOwner: false, canEdit: false })),
        id: () => Promise.resolve(page.userId), isOwner: () => Promise.resolve(false), canEdit: () => Promise.resolve(false), can: () => Promise.resolve(null),
        profiles: (ids) => Promise.resolve({}), search: () => Promise.resolve([]),
      });
      page.use = (name) => {
        if (page.uses.has(name)) return page.uses.get(name);
        const mode = name === 'room' ? (cfg.room || 'ok') : name === 'user' ? (cfg.user || 'ok') : 'null';
        const p = new win.Promise((resolve) => {
          if (mode === 'ok') {
            setTimeout(() => {
              if (name === 'room') { resolve(page.lobby.ns); setTimeout(() => setConnected(page, true), 350 + Math.random() * 300); }
              else resolve(user);
            }, 30 + Math.random() * 50);
          } else if (mode === 'not_granted') {
            setTimeout(() => { page.terminal = 'not_granted'; resolve(page.lobby.ns); }, 40);
          } else if (mode === 'never') setTimeout(() => resolve(null), 10000);
          else setTimeout(() => resolve(null), 150);
        });
        page.uses.set(name, p);
        return p;
      };
      page.prop = (k) => { pf.props[k] = (pf.props[k] || 0) + 1; };
      pf.pages.push(page);
      return page;
    };
    pf.rate = (page, kind) => {             // max per-second count over the recorded timestamps
      const a = kind === 'calls' ? page.calls : page.sends;
      let best = 0, j = 0;
      for (let i = 0; i < a.length; i++) { while (a[i] - a[j] > 1000) j++; best = Math.max(best, i - j + 1); }
      return best;
    };
    return pf;
  })();
  window.__RRP = PF;

  // ===================================================================================== frames
  const frames = [];
  const LAYOUT = [[0, 0], [600, 0], [0, 450], [600, 450]];
  function frame(who, cfg) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      const q = new URLSearchParams(Object.assign({ who }, cfg || {}));
      f.src = 'rrp-frame.html?' + q.toString();
      f.title = who;
      const pos = LAYOUT[frames.length % LAYOUT.length];
      f.style.cssText = 'position:fixed;left:' + pos[0] + 'px;top:' + pos[1] + 'px;width:600px;height:450px;border:0;background:#0a2327';
      const t = setTimeout(() => reject(new Error('frame ' + who + ' did not load')), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        const okp = await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.Net, 15000);
        clearTimeout(t);
        if (!okp) { reject(new Error('frame ' + who + ' has no PG.debug.mp')); return; }
        const page = PF.pages.find((p) => p.win === w);
        const fr = { who, el: f, w, page, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, errors: [], warns: [] };
        w.addEventListener('error', (e) => { fr.errors.push(e.message + ' @' + e.lineno); log('RRP frame ' + who + ' page error: ' + e.message + ' @' + e.lineno); });
        w.addEventListener('unhandledrejection', (e) => { fr.errors.push('rejection ' + (e.reason && (e.reason.code || e.reason.message))); log('RRP frame ' + who + ' unhandled rejection: ' + (e.reason && (e.reason.code || e.reason.message))); });
        const cw = w.console.warn, ce = w.console.error;
        w.console.warn = function () { fr.warns.push(Array.from(arguments).join(' ')); return cw.apply(this, arguments); };
        w.console.error = function () { fr.errors.push('console.error ' + Array.from(arguments).join(' ')); return ce.apply(this, arguments); };
        frames.push(fr);
        resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  function drop(fr) { if (fr.page) PF.unload(fr.page); fr.el.remove(); const k = frames.indexOf(fr); if (k >= 0) frames.splice(k, 1); }
  const S = (fr) => fr.D.getState();
  const V = (fr) => fr.mp.view();
  const N = (fr) => fr.mp.state();
  const slotOf = (fr) => N(fr).mySlot;
  const me = (fr) => fr.G.players.find((p) => p.slot === slotOf(fr));
  const hp = (host, slot) => host.G.players.find((p) => p.slot === slot);
  const press = (fr, a, down) => fr.D.press(a, down, slotOf(fr));
  async function tap(fr, a, ms) { press(fr, a, true); await sleep(ms || 70); press(fr, a, false); }
  const txt = (fr, id) => { const e = fr.w.document.getElementById(id); return e ? e.textContent : null; };
  const shown = (fr, id) => { const e = fr.w.document.getElementById(id); return !!e && !e.hidden && e.offsetParent !== null; };
  function parkAll(host) { for (const e of host.G.enemies) { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; } }
  function stillEnemy(host, e, x, y, dir) {
    Object.assign(e, { type: 'mold', state: 'active', x, y, vx: 0, vy: 0, onGround: true, angry: false, escaped: false, hopT: 99999, delay: 0, spawnY: y,
      jumpCd: 999, chargeCd: 999, windT: 0, chargeT: 0, committed: false, soakT: 0, dir: dir || -1, water: 0, grace: 0, bubble: null, ice: null });
    return e;
  }
  function syncSample(host, guest) {
    const v = V(guest), tr = host.mp.traceAt(Math.round(v.renderTick));
    if (!tr) return null;
    const hostE = new Map(tr.E.filter((e) => e[3] !== 'dead').map((e) => [e[0], e]));
    const gE = v.enemies.filter((e) => e.state !== 'dead');
    const ids = (a) => a.slice().sort((x, y) => x - y).join(',');
    const d = [];
    for (const e of gE) { const h = hostE.get(e.id); if (h && Math.abs(h[2] - e.y) < 60) d.push(Math.hypot(h[1] - e.x, h[2] - e.y)); }
    return { dk: Math.abs(tr.k - v.renderTick), sameE: ids(Array.from(hostE.keys())) === ids(gE.map((e) => e.id)), nE: gE.length, maxD: d.length ? Math.max(...d) : 0 };
  }
  async function startRoom(F) {
    for (const f of F.slice(1)) f.mp.ready(true);
    await until(() => N(F[0]).canStart, 8000);
    const started = F[0].mp.start();
    const playing = await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online), 15000);
    return started && !!playing;
  }

  // ---- a page whose online only reaches this browser's tabs (design/distinction.md 4.2, pass D2): the friends panel
  // shows a block card (<div role="note" class="pg-note is-block">: the heading, the roomOff sentence verbatim, ask for
  // an email invite), 방 만들기 is disabled and described by it, 참여 stays enabled and answers at once (< 300 ms, no
  // bc wait) with joinOff, mp.host() is refused with hostOff - and no panel ever says 방을 찾을 수 없어요
  const OFF = { head: '이 링크로는 친구와 하기를 쓸 수 없어요', join: '이 링크로는 친구와 하기를 쓸 수 없어요 · 방장에게 이메일 초대를 부탁해요',
    host: '이 링크로는 방을 만들 수 없어요 · 게임을 보내 준 사람에게 이메일 초대를 부탁해요' };
  const NOT_FOUND = '방을 찾을 수 없어요';
  // every 25 ms: the visible friends / room panels of that frame (not the hidden font warm-up, which holds every string)
  function watchNotFound(fr) {
    fr.notFound = 0;
    const id = setInterval(() => {
      try { for (const p of ['pg-friends', 'pg-room']) { const e = fr.w.document.getElementById(p); if (e && !e.hidden && e.innerText.indexOf(NOT_FOUND) >= 0) fr.notFound++; } } catch (e) { clearInterval(id); }
    }, 25);
    return () => clearInterval(id);
  }
  const card = (fr) => { const n = fr.w.document.getElementById('pg-net-note'); return { tag: n.tagName, role: n.getAttribute('role'), block: n.classList.contains('is-block'), hidden: n.hidden, text: n.textContent }; };
  const isOffCard = (c) => c.tag === 'DIV' && c.role === 'note' && c.block && !c.hidden && c.text.indexOf(OFF.head) >= 0 &&
    c.text.indexOf('온라인은 Claude에 로그인하고 이 게임에 초대받은 친구끼리만 할 수 있어요') >= 0 && /이메일 초대/.test(c.text) && /혼자 하기는 지금 바로/.test(c.text);
  async function offChecks(F, tag) {
    const d = F.w.document, hostB = d.getElementById('pg-host'), joinB = d.getElementById('pg-join');
    ok(tag + ': the note is the block card (heading, the roomOff sentence verbatim, the email invite, solo)', isOffCard(card(F)), card(F));
    ok(tag + ': 방 만들기 is disabled with its label kept and aria-describedby the card; 참여 stays enabled',
      hostB.disabled && hostB.getAttribute('aria-describedby') === 'pg-net-note' && /방 만들기/.test(hostB.textContent) && !joinB.disabled, { host: hostB.disabled, desc: hostB.getAttribute('aria-describedby'), label: hostB.textContent, join: joinB.disabled });
    const stop = watchNotFound(F);
    const t0 = clock();
    const r = await F.mp.join('ab12');
    const ms = clock() - t0;
    metric(tag + '.join', { r, ms: Math.round(ms) });
    ok(tag + ': 참여 with a code answers at once (< 300 ms): room_off and exactly the joinOff sentence', !r.ok && r.code === 'room_off' && ms < 300 && txt(F, 'pg-friends-err') === OFF.join && r.text === OFF.join, { r, ms: Math.round(ms), err: txt(F, 'pg-friends-err') });
    ok(tag + ': ... the card flashes and stays', d.getElementById('pg-net-note').classList.contains('is-flash') && isOffCard(card(F)), card(F));
    const code = await F.mp.host({ mode: 'coop' });
    ok(tag + ': mp.host() is refused: null and exactly hostOff, no session', code === null && txt(F, 'pg-friends-err') === OFF.host && !N(F).role && N(F).screen === 'friends', { code, err: txt(F, 'pg-friends-err'), role: N(F).role });
    // (the user's own button again: still disabled, still answering)
    F.w.document.getElementById('pg-code').value = 'AB12'; joinB.click();
    await sleep(200);
    stop();
    ok(tag + ': the 참여 button (a real submit) answers joinOff too; the page never showed 방을 찾을 수 없어요', txt(F, 'pg-friends-err') === OFF.join && F.notFound === 0, { err: txt(F, 'pg-friends-err'), notFound: F.notFound });
  }

  // ===================================================================================== phases
  // 1. use("room") resolves null (signed out / not invited / public link): the friendly note, solo keeps working
  async function nullRoom() {
    const N1 = await frame('N', { room: 'null', user: 'null' });
    ok('null: window.claude exists before the page script ran and the page booted', !!N1.w.claude && S(N1).phase === 'title', S(N1).phase);
    N1.mp.openFriends();
    await until(() => N(N1).transport !== null || N1.w.document.getElementById('pg-net-note').textContent, 3000);
    await sleep(400);
    const note = txt(N1, 'pg-net-note');
    metric('null.note', note);
    metric('null.transport', N(N1).transport);
    ok('null: the friendly Korean explanation is shown', /온라인은 Claude에 로그인하고 이 게임에 초대받은 친구끼리만 할 수 있어요/.test(note || ''), note);
    ok('null: no lobby list without the room', !shown(N1, 'pg-games-box'));
    metric('null.host_button', { disabled: N1.w.document.getElementById('pg-host').disabled, text: txt(N1, 'pg-host') });
    await offChecks(N1, 'null');
    N1.w.document.getElementById('pg-friends-back').click();
    await sleep(200);
    N1.w.document.getElementById('pg-start').click();
    const playing = await until(() => S(N1).phase === 'playing', 6000);
    const f0 = S(N1).frame; await sleep(500);
    ok('null: solo (혼자 하기) still plays', !!playing && S(N1).frame > f0 + 10 && S(N1).mode === 'solo', [S(N1).phase, S(N1).mode]);
    ok('null: no page errors', !N1.errors.length, N1.errors);
    drop(N1);
  }
  // 2. nobody answers: use() resolves null only after 10 s; solo must not wait for it
  async function neverRoom() {
    const F = await frame('W', { room: 'never', user: 'never' });
    // (a second viewer taps 참여 while detection is still pending: once it settles on this browser's tabs, the same
    // joinOff answer - not the silent return of before)
    const P2 = await frame('W2', { room: 'never', user: 'never' });
    P2.mp.openFriends();
    const tP = clock(), pend = P2.mp.join('ab12');
    const t0 = clock();
    F.w.document.getElementById('pg-start').click();
    const playing = await until(() => S(F).phase === 'playing', 6000);
    ok('never: solo starts at once while use("room") is still pending', !!playing && clock() - t0 < 6000, S(F).phase);
    F.D.pause && F.D.pause();
    F.D.toTitle && F.D.toTitle();
    await sleep(200);
    F.mp.openFriends();
    await sleep(800);
    const early = { note: txt(F, 'pg-net-note'), host: F.w.document.getElementById('pg-host').disabled, err: txt(F, 'pg-friends-err') };
    metric('never.while_waiting', early);
    // clicking 방 만들기 while the runtime has not answered yet
    F.w.document.getElementById('pg-host').click();
    await sleep(300);
    const busy = { chip: N(F).chip, hostText: txt(F, 'pg-host'), busy: F.w.document.getElementById('pg-host').disabled };
    metric('never.host_click_while_waiting', busy);
    const done = await until(() => /온라인은 Claude에 로그인하고/.test(txt(F, 'pg-net-note') || ''), 13000, 100);
    const t = clock() - t0;
    metric('never.after', { ms: Math.round(t), note: txt(F, 'pg-net-note'), err: txt(F, 'pg-friends-err'), screen: N(F).screen, transport: N(F).transport, role: N(F).role, code: N(F).code });
    ok('never: after ~10 s the explanation appears', !!done, txt(F, 'pg-net-note'));
    await sleep(1500);
    metric('never.after_host_click_settled', { screen: N(F).screen, role: N(F).role, transport: N(F).transport, code: N(F).code, roomMsg: txt(F, 'pg-room-msg'), roomShown: shown(F, 'pg-room') });
    ok('never: the pending 방 만들기 tap ends with hostOff and no room (not silently)', txt(F, 'pg-friends-err') === OFF.host && !N(F).role && !N(F).code && N(F).screen === 'friends', { err: txt(F, 'pg-friends-err'), role: N(F).role, code: N(F).code });
    ok('never: then the block card, 방 만들기 disabled', isOffCard(card(F)) && F.w.document.getElementById('pg-host').disabled, card(F));
    const pr = await pend;
    metric('never.pending_join', { r: pr, ms: Math.round(clock() - tP) });
    ok('pending: 참여 tapped before detection resolved -> the same joinOff once it settles (room_off, not silent)', !pr.ok && pr.code === 'room_off' && txt(P2, 'pg-friends-err') === OFF.join && isOffCard(card(P2)), { pr, err: txt(P2, 'pg-friends-err') });
    ok('never: no page errors', !F.errors.length && !P2.errors.length, F.errors.concat(P2.errors));
    if (N(F).role) F.mp.leave();
    drop(F); drop(P2);
  }
  // 3. a namespace that can never connect (not_granted on every call and listener)
  async function notGranted() {
    const F = await frame('X', { room: 'not_granted', user: 'ok', name: 'Xena' });
    F.mp.openFriends();
    await until(() => N(F).transport, 3000);
    await sleep(800);
    const ui = { transport: N(F).transport, note: txt(F, 'pg-net-note'), gamesBox: shown(F, 'pg-games-box'), gamesEmpty: txt(F, 'pg-games-empty') };
    metric('not_granted.friends', ui);
    ok('not_granted: the viewer is told online is not available here (Korean explanation)', /온라인은 Claude에 로그인하고/.test(ui.note || ''), ui);
    ok('not_granted: no empty "open games" list that can never fill', !ui.gamesBox, ui);
    await offChecks(F, 'not_granted');
    const code = await F.mp.host({ mode: 'coop' });
    const after = { code, err: txt(F, 'pg-friends-err'), screen: N(F).screen, transport: N(F).transport, hint: txt(F, 'pg-room-hint') };
    metric('not_granted.host', after);
    // either no room with a clear Korean message, or (like a signed-out viewer) a room of this browser's tabs that says so
    ok('not_granted: 방 만들기 fails with a clear Korean message, or makes a same-browser room that says so (no hang)', (!code && !!after.err) || (!!code && after.transport === 'bc' && /이 브라우저의 다른 탭에서만/.test(after.hint || '')), after);
    if (code) { F.mp.leave(); await sleep(300); }
    F.w.document.getElementById('pg-friends-back').click();
    await sleep(200);
    F.w.document.getElementById('pg-start').click();
    const playing = await until(() => S(F).phase === 'playing', 6000);
    ok('not_granted: solo still plays', !!playing);
    ok('not_granted: no page errors', !F.errors.length, F.errors);
    drop(F);
  }
  // 3b. the room dies under a join (not_granted raised while the guest looks for the host): the joinOff answer, not
  // 연결이 끊겼어요 / 방을 찾을 수 없어요, and the card at once; then forced bc (?net=bc, every test) is untouched: a
  // missing code still reads 방을 찾을 수 없어요 and 방 만들기 stays enabled
  async function diesMidJoin() {
    const F = await frame('D', { room: 'ok', user: 'ok', name: 'Dana' });
    F.mp.openFriends();
    const up = await until(() => N(F).transport === 'room' && shown(F, 'pg-games-box'), 6000);
    ok('dies: the room is up first (transport room)', !!up, N(F).transport);
    const stop = watchNotFound(F);
    const p = F.mp.join('ab12');
    await sleep(250);
    PF.terminate(F.page, 'not_granted');
    const r = await p;
    const c0 = card(F);
    metric('dies.join', { r, err: txt(F, 'pg-friends-err'), card: c0, transport: N(F).transport });
    ok('dies: the join fails with exactly joinOff (room_off)', !r.ok && r.code === 'room_off' && txt(F, 'pg-friends-err') === OFF.join, { r, err: txt(F, 'pg-friends-err') });
    ok('dies: the card is there when the answer is (within one render), transport fell back to bc', isOffCard(c0) && N(F).transport === 'bc' && F.w.document.getElementById('pg-host').disabled, { c0, tr: N(F).transport });
    await sleep(300); stop();
    ok('dies: never 방을 찾을 수 없어요, no page errors', F.notFound === 0 && !F.errors.length, { nf: F.notFound, e: F.errors });
    drop(F);
    // forced bc: the tab-to-tab test path, unchanged
    const B = await frame('Y', { room: 'ok', user: 'ok', net: 'bc' });
    B.mp.openFriends();
    await until(() => N(B).transport === 'bc', 4000);
    await sleep(300);
    ok('forced bc: no card, 방 만들기 enabled', !card(B).block && !B.w.document.getElementById('pg-host').disabled && !B.w.document.getElementById('pg-join').disabled, card(B));
    const nf = await B.mp.join('zz99');
    ok('forced bc: a missing code still reads 방을 찾을 수 없어요', !nf.ok && nf.code === 'not_found' && txt(B, 'pg-friends-err') === NOT_FOUND, { nf, err: txt(B, 'pg-friends-err') });
    const code = await B.mp.host({ mode: 'coop' });
    ok('forced bc: hosting still works (a tab room)', /^[a-z0-9]{4}$/.test(code || '') && N(B).screen === 'room', { code, err: txt(B, 'pg-friends-err') });
    if (code) { B.mp.leave(); await sleep(300); }
    ok('forced bc: no page errors', !B.errors.length, B.errors);
    drop(B);
  }
  // the screenshots (?shot=off|off-tap; run-all off-friends-*): a public-link viewer (use("room") -> null) on the
  // friends panel, before and after a 참여 tap with a code; the frame fills the window ("SHOT READY")
  async function offShot(tap) {
    const F = await frame('S', { room: 'null', user: 'null' });
    F.el.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;z-index:99;background:#0a2327';
    if (innerWidth < 600) { try { F.w.dispatchEvent(new Event('touchstart')); } catch (e) { /* ignore */ } }
    F.mp.openFriends();
    await until(() => N(F).transport && card(F).block, 4000);
    await sleep(400);
    if (tap) {
      // like a person: the join box scrolled into view and focused, the code typed, 참여 tapped
      const d = F.w.document, inp = d.getElementById('pg-code');
      inp.scrollIntoView({ block: 'end' }); inp.focus(); inp.value = 'AB12';
      d.getElementById('pg-join').click();
      await sleep(250);
      inp.blur();
      metric('shot.after_tap', { err: txt(F, 'pg-friends-err'), cardTop: Math.round(d.getElementById('pg-net-note').getBoundingClientRect().top), vh: F.w.innerHeight });
    }
    await sleep(500);
    log('SHOT READY off' + (tap ? '-tap' : ''));
  }

  // 4. the real thing: two viewers through the room - lobby list, join by tap, co-op, blips, battle, revoke, host leave
  async function twoPlayers() {
    try { localStorage.removeItem('ppogeul-nick'); } catch (e) { /* ignore */ }
    const A = await frame('A', { name: 'Alice' });
    A.mp.openFriends();
    const roomUp = await until(() => N(A).transport === 'room' && shown(A, 'pg-games-box'), 6000);
    ok('room: transport room, the open-games list is shown', !!roomUp, { tr: N(A).transport, note: txt(A, 'pg-net-note') });
    const nick = await until(() => N(A).nick === 'Alice', 3000);
    ok('room: default nickname = the profile name from the user capability', !!nick, N(A).nick);
    const agentListed = A.w.document.querySelectorAll('#pg-games .pg-game').length;
    ok('room: the publishing session (kind agent) is not listed as a game', agentListed === 0, agentListed);
    const code = await A.mp.host({ mode: 'coop', char: 'duck' });
    ok('room: host over presence -> a 4-char code', /^[a-z0-9]{4}$/.test(code || ''), { code, err: txt(A, 'pg-friends-err') });
    if (!code) return;
    const B = await frame('B', { name: 'Bob' });
    B.mp.setNick('Bob');
    B.mp.openFriends();
    const listed = await until(() => B.w.document.querySelectorAll('#pg-games .pg-game').length === 1, 8000);
    const btn = B.w.document.querySelector('#pg-games .pg-game');
    ok('room: B sees Alice\'s open game in the lobby list', !!listed && /Alice/.test(btn ? btn.textContent : ''), btn && btn.textContent);
    if (!btn) return;
    const tJoin = clock();
    btn.click();
    const joined = await until(() => N(B).screen === 'room' && N(B).roster.length === 2 && N(A).roster.length === 2, 12000);
    metric('room.join_ms', Math.round(clock() - tJoin));
    ok('room: tapping it joins; both rosters have 2', !!joined, [N(A).roster.length, N(B).roster.length, txt(B, 'pg-friends-err')]);
    if (!joined) return;
    B.mp.pickChar('otter');
    const repick = await until(() => N(A).roster[1] && N(A).roster[1].char === 'otter', 4000);
    ok('room: guest re-pick reaches the host', !!repick);
    const tStart = clock();
    const started = await startRoom([A, B]);
    metric('room.start_ms', Math.round(clock() - tStart));
    ok('room: co-op starts on both through presence', started, [S(A).phase, S(B).phase]);
    if (!started) return;
    const C = await frame('C', { name: 'Cara' });
    C.mp.openFriends();
    await until(() => N(C).transport === 'room' && shown(C, 'pg-games-box'), 6000);
    await sleep(1500);
    ok('room: a game in progress is not in the open list', C.w.document.querySelectorAll('#pg-games .pg-game').length === 0);
    const late = await C.mp.join(code, { nick: 'Cara' });
    metric('room.late_join', late);
    ok('room: a late joiner is refused while playing (이미 게임이 시작됐어요)', !late.ok && /시작/.test(late.text || ''), late);
    drop(C);

    // ---- traffic: snapshots at the guest, bodies at the host
    A.mp.trace(true);
    let gotSnaps = 0, gotBodies = 0;
    const un1 = B.mp.session().onState(() => { gotSnaps++; });
    const un2 = A.mp.session().onState(() => { gotBodies++; });
    await sleep(3000);
    un1(); un2();
    metric('room.rates_per_s', { snapshotsAtGuest: r1(gotSnaps / 3), bodiesAtHost: r1(gotBodies / 3) });
    ok('room: guest receives >= 15 host snapshots per second', gotSnaps / 3 >= 15, gotSnaps / 3);
    ok('room: host receives >= 15 guest body states per second', gotBodies / 3 >= 15, gotBodies / 3);
    const samples = [];
    for (let i = 0; i < 8; i++) { samples.push(syncSample(A, B)); await sleep(300); }
    metric('room.sync', samples.map((s) => s && { same: s.sameE, maxD: r1(s.maxD), dk: r1(s.dk), n: s.nE }));
    ok('room: guest view = host world (enemy ids; positions within 4 px) in >= 6/8 samples', samples.filter((s) => s && s.sameE && s.maxD < 4).length >= 6);
    metric('room.stats', { host: A.mp.session().stats(), guest: B.mp.session().stats() });

    // ---- a guest shot over presence traps an enemy, the guest pops it
    parkAll(A); A.D.setInvincible(true);
    await sleep(600);
    const gm = me(B);
    const target = stillEnemy(A, A.G.enemies[0], gm.x + 44, gm.y, -1);
    await sleep(500);
    await tap(B, 'right', 40); await sleep(300);
    const tShot = clock();
    await tap(B, 'shoot', 60);
    const trapped = await until(() => target.state === 'trapped' && target.bubble && target.bubble.owner === slotOf(B), 3000);
    metric('room.shot_to_trap_ms', Math.round(clock() - tShot));
    ok('room: guest shot traps an enemy in the host world', !!trapped, target.state);
    const sc0 = hp(A, slotOf(B)).score;
    if (target.bubble) { const b = target.bubble; b.x = me(B).x; b.y = me(B).y - 2; b.vx = 0; b.vy = 0; b.bounceCd = 0; }
    const popped = await until(() => hp(A, slotOf(B)).score > sc0, 3000);
    await until(() => V(B).players.find((p) => p.slot === slotOf(B)).score === hp(A, slotOf(B)).score, 3000);
    ok('room: the guest pops it; scores agree on both pages', !!popped && V(B).players.find((p) => p.slot === slotOf(B)).score === hp(A, slotOf(B)).score, [sc0, hp(A, slotOf(B)).score]);

    // ---- connection blips (the platform refreshes connections now and then)
    PF.blip(B.page, 1500);
    await sleep(1600);
    await sleep(1500);
    ok('blip: a 1.5 s guest blip keeps the game (no 연결이 끊겼어요)', N(B).screen === 'game' && S(B).online && N(A).roster.length === 2, { screen: N(B).screen, err: txt(B, 'pg-friends-err') });
    const s2 = []; for (let i = 0; i < 5; i++) { s2.push(syncSample(A, B)); await sleep(300); }
    ok('blip: in sync again after the guest blip', s2.filter((s) => s && s.sameE).length >= 4, s2);
    PF.blip(A.page, 7000);
    let chipSeen = '';
    await until(() => { const c = N(B).chip; if (c) chipSeen = c; return false; }, 6800, 100);
    await sleep(2500);
    metric('blip.host7s', { chipSeenAtGuest: chipSeen, chipNow: N(B).chip, guestScreen: N(B).screen });
    ok('blip: a 7 s host outage shows 연결이 불안정해요 at the guest and recovers', /불안정/.test(chipSeen) && N(B).screen === 'game' && !N(B).chip, { chipSeen, chip: N(B).chip, screen: N(B).screen });
    const s3 = []; for (let i = 0; i < 5; i++) { s3.push(syncSample(A, B)); await sleep(300); }
    ok('blip: in sync again after the host outage', s3.filter((s) => s && s.sameE).length >= 4, s3);

    // ---- battle through presence (host decides traps; mash; KO by the other player; podium with the same scores)
    A.mp.toRoom();
    await until(() => N(B).screen === 'room', 6000);
    A.mp.setOpts({ mode: 'battle', arena: 0, time: 2 });
    await until(() => N(B).mode === 'battle', 4000);
    const bStarted = await startRoom([A, B]);
    ok('battle: starts on both through presence', bStarted && S(B).mode === 'battle', [S(A).mode, S(B).mode, S(B).phase]);
    if (bStarted) {
      parkAll(A);
      A.G.battle.enemyT = 1e9; A.G.battle.powerT = 1e9; A.G.opts.intrusion = false;
      const floorY = 24 * 8;
      A.D.setPlayer(40, floorY, 0); B.D.setPlayer(84, floorY, slotOf(B));
      await sleep(2400);
      await tap(A, 'right', 30); await sleep(300); await tap(A, 'shoot', 50);
      const bT = await until(() => hp(A, slotOf(B)).trap, 3000);
      ok('battle: host bubble traps the guest', !!bT);
      const bSees = await until(() => V(B).players.find((p) => p.slot === slotOf(B)).trapped, 3000);
      ok('battle: the guest sees itself trapped', !!bSees);
      const t0 = clock();
      for (let k = 0; k < 16 && hp(A, slotOf(B)).trap; k++) { await tap(B, k % 2 ? 'jump' : 'shoot', 45); await sleep(55); }
      const freed = await until(() => !hp(A, slotOf(B)).trap, 4000);
      metric('battle.mash_escape_ms', Math.round(clock() - t0));
      ok('battle: mashing over presence frees the guest in < 3 s', !!freed && clock() - t0 < 3000, Math.round(clock() - t0));
      await sleep(1400);
      B.D.setPlayer(84, floorY, slotOf(B)); A.D.setPlayer(40, floorY, 0);
      await sleep(500);
      await tap(A, 'right', 30); await sleep(250); await tap(A, 'shoot', 50);
      const bT2 = await until(() => hp(A, slotOf(B)).trap, 3000);
      const aScore = hp(A, 0).score;
      const ko = bT2 && await until(() => {
        const hb = hp(A, slotOf(B));
        if (hb.koT > 0 || hb.koed > 0) return true;
        const tb = hb.trap && hb.trap.b;
        if (tb) A.D.setPlayer(tb.x, tb.y + 1, 0);
        return false;
      }, 3000, 60);
      ok('battle: the host touching the trapped guest pops it: 뽀득 KO +500', !!ko && hp(A, 0).score >= aScore + 500, [aScore, hp(A, 0).score]);
      A.D.setTimeLeft(1.2);
      const podium = await until(() => S(A).phase === 'podium' && S(B).phase === 'podium', 8000);
      await sleep(900);
      const ref = S(A).players.map((p) => p.slot + ':' + p.score).join();
      ok('battle: podium on both, same scores', !!podium && S(B).players.map((p) => p.slot + ':' + p.score).join() === ref, [ref, S(B).players.map((p) => p.slot + ':' + p.score).join()]);
    }

    // ---- presence / platform bookkeeping so far
    metric('platform.presence_bytes_max', PF.maxBytes);
    metric('platform.rates', PF.pages.filter((p) => !p.gone).map((p) => ({ who: p.who, callsPerSecMax: PF.rate(p, 'calls'), sendsPerSecMax: PF.rate(p, 'sends') })));
    metric('platform.budget_waits', PF.starved);

    // ---- the guest's grant is revoked mid-game
    A.mp.toRoom();
    await until(() => N(B).screen === 'room', 6000);
    A.mp.setOpts({ mode: 'coop' });
    await until(() => N(B).mode === 'coop', 4000);
    const c2 = await startRoom([A, B]);
    ok('revoke: co-op again', c2);
    PF.terminate(B.page, 'revoked');
    const bOut = await until(() => N(B).screen === 'friends', 6000);
    metric('revoke.guest', { screen: N(B).screen, err: txt(B, 'pg-friends-err'), note: txt(B, 'pg-net-note'), hostBtnDisabled: B.w.document.getElementById('pg-host').disabled, online: S(B).online });
    ok('revoke: the guest leaves the game with a Korean message', !!bOut && !!txt(B, 'pg-friends-err'), txt(B, 'pg-friends-err'));
    const aAlone = await until(() => N(A).roster.length === 1 && S(A).players.length === 1, 25000);
    ok('revoke: the host drops the revoked guest (its animal goes away, game goes on)', !!aAlone && S(A).phase !== 'gameover', [N(A).roster.length, S(A).players.length, S(A).phase]);
    B.w.document.getElementById('pg-friends-back').click();
    await sleep(300);
    B.w.document.getElementById('pg-start').click();
    const bSolo = await until(() => S(B).phase === 'playing' && S(B).mode === 'solo', 6000);
    ok('revoke: the revoked viewer can still play solo', !!bSolo, [S(B).phase, S(B).mode]);
    drop(B);

    // ---- the host leaves: a fresh guest D drops back with 방장이 나갔어요
    A.mp.toRoom();
    await sleep(500);
    const D = await frame('D', { name: 'Dan' });
    const r = await D.mp.join(code, { nick: 'Dan' });
    ok('hostleave: D joins the same code', r.ok, r);
    if (r.ok) {
      await sleep(800);
      A.mp.leave();
      const back = await until(() => N(D).screen === 'friends', 25000);
      ok('hostleave: D is back in the lobby with 방장이 나갔어요', !!back && txt(D, 'pg-friends-err') === '방장이 나갔어요', [N(D).screen, txt(D, 'pg-friends-err')]);
    }
    // ---- and the host's page simply closes (iframe removed): a new host E, guest D2
    const E = await frame('E', { name: 'Eve' });
    const code2 = await E.mp.host({ mode: 'coop' });
    const r2 = code2 ? await D.mp.join(code2, { nick: 'Dan' }) : { ok: false };
    ok('hostclose: D joins Eve\'s room', r2.ok, r2);
    if (r2.ok) {
      drop(E);
      const t0 = clock();
      const back = await until(() => N(D).screen === 'friends', 30000);
      metric('hostclose.ms', Math.round(clock() - t0));
      ok('hostclose: host tab closed -> D back in the lobby with a Korean message', !!back && !!txt(D, 'pg-friends-err'), [N(D).screen, txt(D, 'pg-friends-err')]);
    }
    for (const f of frames.slice()) { ok('room: no page errors (' + f.who + ')', !f.errors.length, f.errors); }
    for (const f of frames.slice()) { if (f.warns.length) metric('warns.' + f.who, f.warns.slice(0, 6)); }
    drop(A);
    for (const f of frames.slice()) drop(f);
  }

  // 5. four players over the room with a crowded world: the host presence near the 4 KiB ceiling
  async function stress() {
    const A = await frame('A', { name: 'Alice' });
    const code = await A.mp.host({ mode: 'coop', nick: '방장', char: 'duck' });
    ok('stress: host', !!code);
    if (!code) return;
    const G = [];
    for (const [w, c] of [['B', 'cat'], ['C', 'frog'], ['D', 'otter']]) {
      const f = await frame(w, { name: w });
      const r = await f.mp.join(code, { nick: w + w + w + '친구', char: c });
      ok('stress: ' + w + ' joins', r.ok, r);
      G.push(f);
    }
    await until(() => N(A).roster.length === 4 && G.every((f) => N(f).roster.length === 4), 10000);
    const started = await startRoom([A].concat(G));
    ok('stress: 4 players playing over presence', started, [A].concat(G).map((f) => S(f).phase));
    if (!started) return;
    A.D.setInvincible(true);
    // crowd the world: many bubbles, items, a boss round
    await sleep(1500);
    for (let i = 0; i < 40; i++) A.D.spawnBubble(i % 5 === 0 ? 'stamp' : 'empty', 120 + (i * 37) % 110, 20 + (i * 23) % 100);
    for (let i = 0; i < 12; i++) A.G.items.push({ id: ++A.G.seq, type: 'watermelon', value: 2000, x: 130 + i * 8, y: 40, vx: 0, vy: 0, onGround: false, floating: true, age: 0 });
    await sleep(1000);
    const counts = new Map(G.map((f) => [f.who, 0]));
    const uns = G.map((f) => { const hid = f.mp.session().peers().find((p) => p.host).id; return f.mp.session().onState((id) => { if (id === hid) counts.set(f.who, counts.get(f.who) + 1); }); });
    const sizes = [];
    const hostH = () => A.page.handles.get('g-' + code);
    const t0 = clock();
    while (clock() - t0 < 4000) { const h = hostH(); if (h) sizes.push(new TextEncoder().encode(JSON.stringify(h.mine)).length); await sleep(50); }
    for (const u of uns) u();
    const rates = G.map((f) => r1(counts.get(f.who) / 4));
    metric('stress.state_rates_per_s_at_guests', rates);
    metric('stress.host_snapshot', N(A).snap);
    metric('stress.host_presence_bytes', { max: Math.max(...sizes), mean: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) });
    ok('stress: every guest still gets >= 12 states/s with a crowded snapshot', rates.every((r) => r >= 12), rates);
    // a guest shot (reliable) while the host presence is full
    const g = G[0];
    parkAll(A);
    g.D.setPlayer(40, 24 * 8, slotOf(g));
    await until(() => me(g).onGround, 2000);
    await sleep(300);
    const gm = me(g);
    const target = stillEnemy(A, A.G.enemies.find((e) => e.state !== 'dead') || A.G.enemies[0], gm.x + 44, gm.y, -1);
    await sleep(400);
    await tap(g, 'right', 40); await sleep(300);
    const ts = clock();
    await tap(g, 'shoot', 60);
    const seenSt = [target.state + '@pre:' + Math.round(target.x) + ',' + Math.round(target.y) + ' me:' + Math.round(me(g).x) + ',' + Math.round(me(g).y)]; let trAt = 0;
    const tr = await until(() => { if (seenSt[seenSt.length - 1].split('@')[0] !== target.state) seenSt.push(target.state + '@' + Math.round(clock() - ts)); if ((target.state === 'trapped' || target.state === 'dead') && !trAt) trAt = clock(); return !!trAt;   /* (dead: trapped and at once popped by a player standing there) */ }, 4000, 10);
    metric('stress.target_states', seenSt);
    metric('stress.shot_to_trap_ms', Math.round((trAt || clock()) - ts));
    ok('stress: a guest shot still lands within 1 s with a crowded snapshot', !!trAt && trAt - ts < 1000, seenSt);
    metric('platform.presence_bytes_max', PF.maxBytes);
    metric('platform.rates', PF.pages.filter((p) => !p.gone).map((p) => ({ who: p.who, callsPerSecMax: PF.rate(p, 'calls'), sendsPerSecMax: PF.rate(p, 'sends') })));
    metric('platform.budget_waits', PF.starved);
    for (const f of frames.slice()) { ok('stress: no page errors (' + f.who + ')', !f.errors.length, f.errors); if (f.warns.length) metric('warns.' + f.who, f.warns.slice(0, 6)); }
    for (const f of frames.slice()) drop(f);
  }

  // 6. the server drops a player for ~1 s (connection refresh seen by the others as left + joined)
  async function flap() {
    const A = await frame('A', { name: 'Alice' });
    const code = await A.mp.host({ mode: 'coop', nick: '방장' });
    const B = await frame('B', { name: 'Bob' });
    const r = await B.mp.join(code, { nick: 'Bob' });
    ok('flap: joined', r.ok, r);
    const st = await startRoom([A, B]);
    ok('flap: playing', st);
    if (!st) return;
    await sleep(1500);
    if (Q.get('flapguest')) { PF.flap(B.page, 1000); await sleep(4000); metric('flap.guest_first_1s', { guestScreen: N(B).screen, guestErr: txt(B, 'pg-friends-err'), hostRoster: N(A).roster.length, hostPlayers: S(A).players.length }); ok('flap: a 1 s server-side drop of a GUEST does not kick it', N(B).screen === 'game' && N(A).roster.length === 2, { screen: N(B).screen, err: txt(B, 'pg-friends-err') }); for (let i = 0; i < 6; i++) { await sleep(5000); metric('flap.guest_after_' + (i + 1) * 5 + 's', { guestScreen: N(B).screen, guestErr: txt(B, 'pg-friends-err'), chip: N(B).chip, guestOnline: S(B).online, guestPlayersInView: V(B).players.map((p) => p.slot), guestMySlot: slotOf(B), hostPlayers: S(A).players.map((p) => p.slot), guestRoster: N(B).roster.length, guestCtl: N(B).ctl }); } for (const f of frames.slice()) drop(f); return; }
    PF.flap(A.page, 1000);
    await sleep(4000);
    metric('flap.host_1s', { guestScreen: N(B).screen, guestErr: txt(B, 'pg-friends-err'), guestOnline: S(B).online, hostRoster: N(A).roster.length });
    ok('flap: a 1 s server-side drop of the HOST does not end the game of the guest', N(B).screen === 'game' && S(B).online, { screen: N(B).screen, err: txt(B, 'pg-friends-err') });
    if (N(B).screen !== 'game') { await B.mp.join(code, { nick: 'Bob' }); }
    const B2 = N(B).screen === 'game' ? B : null;
    if (B2) {
      PF.flap(B.page, 1000);
      await sleep(4000);
      metric('flap.guest_1s', { guestScreen: N(B).screen, guestErr: txt(B, 'pg-friends-err'), hostRoster: N(A).roster.length, hostPlayers: S(A).players.length });
      ok('flap: a 1 s server-side drop of a GUEST does not kick it', N(B).screen === 'game' && N(A).roster.length === 2, { screen: N(B).screen, err: txt(B, 'pg-friends-err'), roster: N(A).roster.length });
    }
    for (const f of frames.slice()) drop(f);
  }

  (async () => {
    const SHOT = Q.get('shot') || '';
    if (SHOT) { try { await offShot(SHOT === 'off-tap'); } catch (e) { log('SHOT error ' + (e && e.stack)); log('SHOT READY ' + SHOT); } return; }
    const run = (n) => !ONLY.length || ONLY.includes(n);
    const phases = [['null', nullRoom], ['never', neverRoom], ['not_granted', notGranted], ['dies', diesMidJoin], ['room', twoPlayers], ['stress', stress], ['flap', flap]];
    for (const [n, fn] of phases) {
      if (!run(n)) continue;
      try { await fn(); } catch (e) { ok('phase ' + n + ' threw', false, e && (e.stack || e.message)); }
      for (const f of frames.slice()) drop(f);
    }
    metric('platform.claude_members_read', PF.props);
    ok('platform: no page read a window.claude member other than use (hot-reload hook excepted)', Object.keys(PF.props).every((k) => k === 'hot'), PF.props);
    ok('platform: emit / on never used (topics are editor-only)', PF.emits === 0 && PF.ons === 0, { emits: PF.emits, ons: PF.ons });
    ok('platform: no presence call rejected (size / depth / keys / plain JSON)', !PF.viol.length, PF.viol.slice(0, 6));
    metric('platform.forwarding_rule_notes', PF.soft.slice(0, 8));
    ok('platform: no listener threw inside the runtime', !PF.throws.length, PF.throws.slice(0, 4));
    log('RRP DONE pass=' + pass + ' fail=' + fail);
  })();
})();
