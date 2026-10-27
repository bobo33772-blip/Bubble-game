// Node unit tests for src/net.js (PG.Net) against FAKES of its three transports, on a virtual clock
// (deterministic and fast: a minute of network time runs in a few seconds).
// Usage: node bogeul/tools/net-node-test.js [seed=7] [-v]
//   - fake 'room' capability, faithful to the runtime contract: presence merge (per top-level field, latest
//     wins, top-level null removes), identifier keys, nesting <= 8, merged object <= 4 KiB (rejects
//     invalid_argument and applies nothing), local apply at once + coalesced sends (~30/s) under a shared
//     40/s (burst 80) budget, frozen peers() snapshots with stable identity, onPeers once per frame with the
//     net change (first delivery = everyone as joined), join(name) grammar / same object / leave, connected()
//     + onConnection, reconnect reconciliation, terminal errors on every listener, emit = not_permitted.
//     Network: latency + jitter per delivery, in order per sender->receiver pair, presence updates dropped
//     with probability `drop` (joins / leaves never dropped).
//   - fake PeerJS (Peer / DataConnection, 'unavailable-id', 'peer-unavailable', json serialization, ordered).
//   - fake BroadcastChannel (structured clones, async, in order).
//   - v4 kits on the wire (testV4Wire): the engine's body bits / qk / a:1 / NET_V / SNAP_LIMIT in game.js and those
//     shapes carried intact by PG.Net (the measured snapshot sizes are kits-net.js's).
// Prints "PASS/FAIL <name>" and "NET NODE OK" / "NET NODE FAIL (n)"; exit code 1 on failure.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(process.env.NET_SRC || path.join(__dirname, '..', 'src', 'net.js'), 'utf8');   // NET_SRC: test a modified copy
const args = process.argv.slice(2);
const VERBOSE = args.includes('-v');
const SEED = parseInt(args.find((a) => /^\d+$/.test(a)) || '7', 10);

// ------------------------------------------------------------------ results
let pass = 0, fails = 0;
const timerErrors = [], unhandled = [], warnings = [];
function ok(name, cond, info) {
  if (cond) { pass++; if (VERBOSE) console.log('PASS ' + name); }
  else { fails++; console.log('FAIL ' + name + (info !== undefined ? ' :: ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }
  return !!cond;
}
process.on('unhandledRejection', (e) => { unhandled.push(e); });

// ------------------------------------------------------------------ seeded rng
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry32(SEED);
const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
const randLabel = (n = 16) => { let s = ''; for (let i = 0; i < n; i++) s += ALNUM[Math.floor(rng() * ALNUM.length)]; return s; };

// ------------------------------------------------------------------ virtual clock (binary heap)
class Clock {
  constructor() { this.t = 0; this.seq = 0; this.heap = []; this.live = new Map(); this.fired = 0; }
  now() { return this.t; }
  less(a, b) { return a.at < b.at || (a.at === b.at && a.seq < b.seq); }
  push(tm) { const h = this.heap; h.push(tm); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!this.less(h[i], h[p])) break; [h[i], h[p]] = [h[p], h[i]]; i = p; } }
  pop() {
    const h = this.heap, top = h[0], last = h.pop();
    if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && this.less(h[l], h[m])) m = l; if (r < h.length && this.less(h[r], h[m])) m = r; if (m === i) break; [h[i], h[m]] = [h[m], h[i]]; i = m; } }
    return top;
  }
  // Like browsers: a timeout's delay is truncated to whole milliseconds and the callback runs a little late, at a
  // fractional time - so timers with nearly equal targets can fire in either order (code must not rely on
  // setTimeout to keep messages ordered).
  add(fn, ms, every) { const id = ++this.seq; const tm = { id, seq: id, at: this.t + Math.max(0, Math.trunc(+ms || 0)) + rng() * 0.9, fn, every }; this.live.set(id, tm); this.push(tm); return id; }
  async run(ms) {
    const end = this.t + ms;
    while (this.heap.length) {
      const top = this.heap[0];
      if (this.live.get(top.id) !== top) { this.pop(); continue; }
      if (top.at > end) break;
      this.pop();
      this.t = Math.max(this.t, top.at);
      if (top.every) { top.at += top.every; top.seq = ++this.seq; this.push(top); } else this.live.delete(top.id);
      this.fired++;
      try { top.fn(); } catch (e) { timerErrors.push(e); console.log('TIMER ERROR ' + (e && e.stack ? e.stack : e)); }
      await new Promise((r) => setImmediate(r));
    }
    this.t = end;
    await new Promise((r) => setImmediate(r));
  }
}
const clock = new Clock();
const timerApi = {
  setTimeout: (fn, ms) => clock.add(fn, ms, 0),
  clearTimeout: (id) => { clock.live.delete(id); },
  setInterval: (fn, ms) => clock.add(fn, ms, Math.max(1, +ms || 1)),
  clearInterval: (id) => { clock.live.delete(id); },
};
async function until(pred, maxMs, step = 10) { const t0 = clock.now(); while (!pred()) { if (clock.now() - t0 >= maxMs) return false; await clock.run(step); } return true; }
// In-order delivery with delays, like a stream / BroadcastChannel / the platform's per-pair channel:
// a FIFO drained by one pump timer (per-message timers could swap close neighbours, see Clock.add).
function orderedLink() {
  const q = [];
  let armed = false;
  const arm = () => { if (!armed && q.length) { armed = true; clock.add(pump, Math.ceil(q[0].at - clock.now())); } };
  function pump() { armed = false; while (q.length && q[0].at <= clock.now() + 0.5) q.shift().fn(); arm(); }
  return { push(at, fn) { q.push({ at: q.length ? Math.max(at, q[q.length - 1].at) : at, fn }); arm(); } };
}
function settle(p) { const r = { done: false, value: undefined, error: undefined }; p.then((v) => { r.done = true; r.value = v; }, (e) => { r.done = true; r.error = e; }); return r; }
async function resolveP(p, ms = 20000) { const r = settle(p); await until(() => r.done, ms); return r; }

// ------------------------------------------------------------------ page loader: one vm context per page
function loadPage(name, extras) {
  const win = Object.assign({
    console: { log: (...a) => { if (VERBOSE) console.log('[' + name + ']', ...a); }, warn: (...a) => { warnings.push(name + ': ' + a.join(' ')); if (VERBOSE) console.log('[' + name + '] warn', ...a); }, error: (...a) => console.log('[' + name + '] error', ...a) },
    performance: { now: () => clock.now() },
    addEventListener() {}, removeEventListener() {},
    location: { search: '' },
    __rand: rng,
  }, timerApi, extras || {});
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext('Math.random = function () { return __rand(); };', ctx);
  vm.runInContext(SRC, ctx, { filename: 'net.js' });
  return { name, win, Net: win.PG.Net };
}

// ==================================================================================== FAKE 'room' capability
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const PROTO = new Set(Object.getOwnPropertyNames(Object.prototype).concat(['prototype']));
function checkJson(v) {
  if (v === null) return { d: 0 };
  switch (typeof v) {
    case 'string': case 'boolean': return { d: 0 };
    case 'number': return Number.isFinite(v) ? { d: 0 } : { err: 'non-finite number' };
    case 'object': {
      const arr = Array.isArray(v);
      if (!arr && Object.prototype.toString.call(v) !== '[object Object]') return { err: 'exotic object' };
      let max = 0;
      for (const k of Object.keys(v)) {
        if (!arr && (!KEY_RE.test(k) || PROTO.has(k))) return { err: 'bad key ' + JSON.stringify(k) };
        const r = checkJson(v[k]);
        if (r.err) return r;
        if (r.d > max) max = r.d;
      }
      return { d: max + 1 };
    }
    default: return { err: 'non-JSON ' + typeof v };
  }
}
function deepFreeze(o) { if (o && typeof o === 'object') { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; }
const rerr = (code, message) => Object.assign(new Error(message || code), { code, message: message || code });
const EMPTY = Object.freeze([]);

class RoomPlatform {
  constructor(o) { Object.assign(this, { latency: 40, jitter: 20, drop: 0 }, o || {}); this.rooms = new Map(); this.pages = []; this.violations = []; this.stats = { sends: 0, dropped: 0, emits: 0 }; }
  members(name) { let s = this.rooms.get(name); if (!s) { s = new Set(); this.rooms.set(name, s); } return s; }
  newPage(o) { const p = new RoomPage(this, o || {}); this.pages.push(p); return p; }
}
class RoomPage {
  constructor(pf, o) {
    this.pf = pf; this.label = randLabel(); this.userId = 'u_' + randLabel(10); this.nick = o.name || '';
    this.connected = true; this.revoked = null; this.handles = new Map();
    this.calls = []; this.maxPerSec = 0; this.tokens = 80; this.tokenAt = clock.now();
    this.lobby = new Handle(this, '');
    this.lobbyNs = this.lobby.ns(true);
    this.userNs = Object.freeze({
      me: async () => ({ id: this.userId, name: this.nick, avatarUrl: 'data:,', color: '#888888', email: null, isOwner: false, canEdit: false }),
      id: async () => this.userId, name: async () => this.nick, isOwner: async () => false, canEdit: async () => false, can: async () => null,
      profiles: async (ids) => Object.fromEntries([].concat(ids).map((id) => [id, { id, name: '', avatarUrl: 'data:,', color: '#888888', email: null, isMe: false, guest: false }])),
      search: async () => [],
    });
    const noRoom = !!o.noRoom;
    this.claude = Object.freeze({ use: (n) => new Promise((res) => clock.add(() => res(n === 'room' ? (noRoom ? null : this.lobbyNs) : n === 'user' ? this.userNs : null), 5)) });
  }
  recordCall() {
    const t = clock.now();
    this.calls.push(t);
    while (this.calls.length && this.calls[0] <= t - 1000) this.calls.shift();
    if (this.calls.length > this.maxPerSec) this.maxPerSec = this.calls.length;
  }
  takeToken() {
    const t = clock.now();
    this.tokens = Math.min(80, this.tokens + (t - this.tokenAt) * 0.04);
    this.tokenAt = t;
    if (this.tokens >= 1) { this.tokens -= 1; return 0; }
    return (1 - this.tokens) / 0.04;
  }
  all() { return [this.lobby, ...this.handles.values()]; }
  join(name) {
    if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) return Promise.reject(rerr('invalid_argument', 'room name grammar'));
    if (this.revoked) return Promise.reject(rerr(this.revoked));
    const ex = this.handles.get(name);
    if (ex && ex.active) return Promise.resolve(ex.nsObj);
    if (this.handles.size >= 16) return Promise.reject(rerr('limit_reached'));
    const h = new Handle(this, name);
    h.nsObj = h.ns(false);
    this.handles.set(name, h);
    return new Promise((res) => clock.add(() => res(h.nsObj), this.pf.latency));
  }
  setConnected(b) {
    if (this.connected === b) return;
    this.connected = b;
    for (const h of this.all()) {
      h.fireConn();
      if (!b) continue;
      // reconnect: re-assert me, reconcile the room both ways
      for (const o of this.pf.members(h.name)) if (o !== h && o.active) { h.deliverTo(o, false); o.deliverTo(h, false); }
      for (const label of Array.from(h.view.keys())) if (![...this.pf.members(h.name)].some((o) => o.active && o.page.label === label)) h.removePeer(label, true);
    }
  }
  // a server-side drop for `ms` (connection refresh / network switch): the others see this page leave its game rooms,
  // then, on reconnect, the runtime re-asserts its presence (same label) and reconciles the room both ways
  flap(ms) {
    const hs = Array.from(this.handles.values()).filter((h) => h.active);
    this.setConnected(false);
    for (const h of hs) {
      this.pf.members(h.name).delete(h);
      for (const o of this.pf.members(h.name)) if (o.active) h.pair(o).push(clock.now() + this.pf.latency, () => o.removePeer(this.label));
    }
    clock.add(() => { for (const h of hs) if (h.active) this.pf.members(h.name).add(h); this.setConnected(true); }, ms);
  }
  revoke(code) {
    this.revoked = code;
    for (const h of this.all()) {
      for (const l of h.peerListeners.concat(h.connListeners)) if (l.live) { l.live = false; if (l.onError) clock.add(() => l.onError({ code, message: code }), 0); }
    }
  }
}
class Handle {
  constructor(page, name) {
    this.page = page; this.pf = page.pf; this.name = name; this.active = true;
    this.mine = {}; this.mineFrozen = deepFreeze({}); this.myAt = clock.now(); this.selfObj = null;
    this.view = new Map(); this.snap = null;
    this.peerListeners = []; this.connListeners = [];
    this.pend = new Map(); this.batchT = null;
    this.sendT = null; this.lastSend = -1e9; this.pairs = new Map(); this.ver = 0;
    this.readyAt = clock.now() + this.pf.latency;
    clock.add(() => this.fireConn(), this.pf.latency);
    this.pf.members(name).add(this);
    for (const o of this.pf.members(name)) if (o !== this && o.active) { this.deliverTo(o, false); o.deliverTo(this, false); }
  }
  connected() { return this.active && this.page.connected && !this.page.revoked && clock.now() >= this.readyAt; }
  fireConn() { const c = this.connected(); for (const l of this.connListeners) if (l.live && l.last !== c) { l.last = c; l.fn(c); } }
  self() { if (!this.selfObj) this.selfObj = Object.freeze({ peer: this.page.label, by: this.page.userId, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: this.mineFrozen, updatedAt: this.myAt }); return this.selfObj; }
  peers() {
    if (!this.active || clock.now() < this.readyAt) return EMPTY;
    if (this.page.revoked) return Object.freeze([this.self()]);
    if (!this.snap) { const a = [this.self()]; for (const v of this.view.values()) a.push(v.obj); this.snap = Object.freeze(a); }
    return this.snap;
  }
  presence(patch) {
    this.page.recordCall();
    if (this.page.revoked) return Promise.reject(rerr(this.page.revoked));
    if (!this.active) return Promise.reject(rerr('invalid_argument', 'room was left'));
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return this.violate('patch not an object');
    const merged = Object.assign({}, this.mine);
    for (const k of Object.keys(patch)) { if (patch[k] === null) delete merged[k]; else merged[k] = patch[k]; }
    const c = checkJson(merged);
    if (c.err) return this.violate(c.err);
    if (c.d > 8) return this.violate('too deep (' + c.d + ')');
    const size = Buffer.byteLength(JSON.stringify(merged), 'utf8');
    if (size > 4096) return this.violate('merged presence ' + size + ' bytes');
    this.mine = JSON.parse(JSON.stringify(merged));
    this.mineFrozen = deepFreeze(JSON.parse(JSON.stringify(merged)));
    this.myAt = clock.now(); this.selfObj = null; this.snap = null;
    this.queue('updated', this.page.label, this.self());
    if (this.sendT === null) this.sendT = clock.add(() => this.sendNow(), Math.max(0, this.lastSend + 33 - clock.now()));
    return Promise.resolve();
  }
  violate(reason) { this.pf.violations.push(this.page.nick + '@' + (this.name || 'lobby') + ': ' + reason); return Promise.reject(rerr('invalid_argument', reason)); }
  sendNow() {
    this.sendT = null;
    if (!this.active || this.page.revoked || !this.page.connected) return;   // reconnect re-asserts
    const w = this.page.takeToken();
    if (w > 0) { this.sendT = clock.add(() => this.sendNow(), w); return; }
    this.lastSend = clock.now();
    this.pf.stats.sends++;
    for (const o of this.pf.members(this.name)) if (o !== this && o.active) this.deliverTo(o, true);
  }
  deliverTo(o, droppable) {
    const snap = this.mineFrozen, ver = ++this.ver;
    if (droppable && rng() < this.pf.drop) { this.pf.stats.dropped++; return; }
    this.pair(o).push(clock.now() + this.pf.latency + (this.pf.slow || 0) + rng() * this.pf.jitter, () => o.receive(this, snap, ver));   // (slow: extra presence delay, ms)
  }
  pair(o) { let l = this.pairs.get(o); if (!l) { l = orderedLink(); this.pairs.set(o, l); } return l; }
  receive(from, snap, ver) {
    if (!this.active || !this.page.connected || this.page.revoked) return;
    const label = from.page.label, old = this.view.get(label);
    if (old && old.ver >= ver) return;
    if (old && old.presence === snap) { old.ver = ver; return; }
    const obj = Object.freeze({ peer: label, by: from.page.userId, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: snap, updatedAt: clock.now() });
    this.view.set(label, { presence: snap, ver, obj });
    this.snap = null;
    this.queue(old ? 'updated' : 'joined', label, obj);
  }
  removePeer(label, force) {
    if (!this.active || (!force && (!this.page.connected || this.page.revoked))) return;
    const old = this.view.get(label);
    if (!old) return;
    this.view.delete(label);
    this.snap = null;
    this.queue('left', label, old.obj);
  }
  queue(kind, label, obj) {
    const cur = this.pend.get(label);
    if (cur && cur.kind === 'joined' && kind === 'left') this.pend.delete(label);
    else this.pend.set(label, { kind: cur && cur.kind === 'joined' ? 'joined' : cur && cur.kind === 'left' && kind === 'joined' ? 'updated' : kind, obj });
    if (this.batchT === null) this.batchT = clock.add(() => this.flushBatch(), 16);
  }
  flushBatch() {
    this.batchT = null;
    if (!this.active || !this.pend.size || clock.now() < this.readyAt) { if (this.active && this.pend.size) this.batchT = clock.add(() => this.flushBatch(), 16); return; }
    const joined = [], left = [], updated = [];
    for (const { kind, obj } of this.pend.values()) (kind === 'joined' ? joined : kind === 'left' ? left : updated).push(obj);
    this.pend.clear();
    const change = Object.freeze({ peers: this.peers(), joined: Object.freeze(joined), left: Object.freeze(left), updated: Object.freeze(updated) });
    for (const l of this.peerListeners.slice()) if (l.live && l.started) l.fn(change);
  }
  onPeers(fn, onError) {
    if (typeof fn !== 'function') throw new TypeError('handler must be a function');
    const l = { fn, onError, live: true, started: false };
    this.peerListeners.push(l);
    clock.add(() => {
      if (!l.live || !this.active) return;
      l.started = true;
      const ps = this.peers();
      fn(Object.freeze({ peers: ps, joined: ps, left: EMPTY, updated: EMPTY }));
    }, Math.max(0, this.readyAt - clock.now()));
    return () => { l.live = false; };
  }
  onConnection(fn, onError) {
    if (typeof fn !== 'function') throw new TypeError('handler must be a function');
    const l = { fn, onError, live: true, last: undefined };
    this.connListeners.push(l);
    clock.add(() => { if (l.live) { l.last = this.connected(); fn(l.last); } }, 0);
    return () => { l.live = false; };
  }
  leave() {
    if (!this.active) return Promise.resolve();
    this.active = false;
    this.pf.members(this.name).delete(this);
    for (const l of this.peerListeners.concat(this.connListeners)) l.live = false;
    for (const o of this.pf.members(this.name)) {
      if (!o.active) continue;
      this.pair(o).push(clock.now() + this.pf.latency, () => o.removePeer(this.page.label));
    }
    this.page.handles.delete(this.name);
    return Promise.resolve();
  }
  ns(isLobby) {
    const h = this;
    const base = {
      presence: (p) => h.presence(p),
      peers: () => h.peers(),
      onPeers: (fn, e) => h.onPeers(fn, e),
      connected: () => h.connected(),
      onConnection: (fn, e) => h.onConnection(fn, e),
      emit: () => { h.pf.stats.emits++; return Promise.reject(rerr('not_permitted')); },
      on: () => () => {},
    };
    if (isLobby) Object.assign(base, { join: (n) => h.page.join(n), canSendToClaudeSession: async () => 'off', sendToClaudeSession: () => Promise.reject(rerr('claude_unavailable')) });
    else Object.assign(base, { name: h.name, leave: () => h.leave() });
    return Object.freeze(base);
  }
}

// ==================================================================================== FAKE PeerJS
function makePeerNet(o) {
  const net = Object.assign({ latency: 30, jitter: 10, peers: new Map(), sent: 0 }, o || {});
  class FakeConn {
    constructor(owner, remoteId, opts) {
      this.owner = owner; this.peer = remoteId; this.open = false; this.closed = false; this.h = {}; this.other = null; this.link = orderedLink();
      this.reliable = !!(opts && opts.reliable); this.serialization = (opts && opts.serialization) || 'binary';
      owner.conns.add(this);
    }
    on(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); return this; }
    emit(ev, a) { for (const fn of (this.h[ev] || []).slice()) fn(a); }
    sched(fn, base) { this.link.push(clock.now() + (base === undefined ? net.latency + rng() * net.jitter : base), fn); }
    send(d) {
      if (!this.open) return;
      if (this.serialization !== 'json') throw new Error('fake expects json serialization');
      const s = JSON.stringify(d);
      net.sent++;
      const other = this.other;
      this.sched(() => { if (other && other.open) other.emit('data', JSON.parse(s)); });
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      const was = this.open;
      this.open = false;
      if (was) this.emit('close');
      const other = this.other;
      if (other && !other.closed) this.sched(() => { if (other.closed) return; other.closed = true; const w = other.open; other.open = false; if (w) other.emit('close'); }, net.latency);
    }
  }
  class Peer {
    constructor(id, opts) {
      if (id && typeof id === 'object') { opts = id; id = undefined; }
      this.h = {}; this.open = false; this.destroyed = false; this.disconnected = false; this.conns = new Set(); this.options = opts; this.id = null;
      clock.add(() => {
        if (this.destroyed) return;
        if (id !== undefined && net.peers.has(String(id))) { this.emit('error', Object.assign(new Error('ID "' + id + '" is taken'), { type: 'unavailable-id' })); return; }
        this.id = id !== undefined ? String(id) : randLabel(8) + '-' + randLabel(4) + '-' + randLabel(12);
        net.peers.set(this.id, this);
        this.open = true;
        this.emit('open', this.id);
      }, net.latency);
    }
    on(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); return this; }
    emit(ev, a) { for (const fn of (this.h[ev] || []).slice()) fn(a); }
    connect(rid, opts) {
      const c = new FakeConn(this, rid, opts);
      clock.add(() => {
        const t = net.peers.get(rid);
        if (!t || t.destroyed) { this.emit('error', Object.assign(new Error('Could not connect to peer ' + rid), { type: 'peer-unavailable' })); return; }
        const r = new FakeConn(t, this.id, opts);
        c.other = r; r.other = c;
        t.emit('connection', r);
        clock.add(() => { if (c.closed || r.closed) return; c.open = true; r.open = true; r.emit('open'); c.emit('open'); }, net.latency);
      }, net.latency);
      return c;
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      if (this.id && net.peers.get(this.id) === this) net.peers.delete(this.id);
      for (const c of this.conns) c.close();
      this.open = false;
      this.emit('close');
    }
    disconnect() { this.disconnected = true; }
    reconnect() { this.disconnected = false; }
  }
  net.Peer = Peer;
  // the network drops a peer: every data connection closes without a goodbye
  net.cut = (id) => { const p = net.peers.get(id); if (p) for (const c of p.conns) c.close(); };
  return net;
}

// ==================================================================================== FAKE BroadcastChannel
function makeBC() {
  const chans = new Map();
  const bus = { posted: 0, link: orderedLink() };
  class BC {
    constructor(name) { this.name = String(name); this.onmessage = null; this.closed = false; if (!chans.has(this.name)) chans.set(this.name, new Set()); chans.get(this.name).add(this); }
    postMessage(data) {
      if (this.closed) throw new Error('InvalidStateError: channel closed');
      const copy = structuredClone(data);
      bus.posted++;
      for (const o of chans.get(this.name)) if (o !== this) bus.link.push(clock.now(), () => { if (!o.closed && typeof o.onmessage === 'function') o.onmessage({ data: structuredClone(copy) }); });
    }
    close() { this.closed = true; chans.get(this.name).delete(this); }
  }
  bus.BC = BC;
  return bus;
}

// ==================================================================================== helpers for sessions
function record(s) {
  const rec = { msgs: [], states: [], status: [], peerEvents: [], last: new Map() };
  s.onMessage((from, m) => rec.msgs.push([from, m]));
  s.onState((from, o) => { rec.states.push([from, o]); rec.last.set(from, o); });
  s.onStatus((k, d) => rec.status.push(k + ':' + d));
  s.onPeers((l) => rec.peerEvents.push(l));
  return rec;
}
const seqOf = (rec, from, key) => rec.msgs.filter(([f, m]) => f === from && m && m.k === key).map(([, m]) => m.i);
// the order in which `host` sees the leaver's last message ('gg-last') and the leaver gone from its roster
function lastBeforeLeave(host, leaver) {
  const order = [], id = leaver.selfId;
  host.onMessage((from, m) => { if (from === id && m && m.k === 'gg-last') order.push('msg'); });
  host.onPeers((l) => { if (!order.includes('gone') && Array.isArray(l) && !l.some((p) => p.id === id)) order.push('gone'); });
  return order;
}
const range = (n) => Array.from({ length: n }, (_, i) => i);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const idsOf = (s) => s.peers().map((p) => p.id + '/' + p.slot).join(',');
async function sendStream(sender, to, key, n, perTick = 4, tickMs = 30, extra) {
  for (let i = 0; i < n; i++) {
    const okSend = sender.send(to, Object.assign({ k: key, i }, extra || {}));
    if (!okSend) return i;
    if (i % perTick === perTick - 1) await clock.run(tickMs);
  }
  return n;
}

// ==================================================================================== TESTS: room
async function testRoom() {
  // ---- availability
  const pfOff = new RoomPlatform();
  const off = loadPage('noroom', { claude: pfOff.newPage({ noRoom: true }).claude });
  const bare = loadPage('bare', {});
  let r = await resolveP(off.Net.transports());
  ok('room: use("room") null -> transports().room false', r.done && r.value.room === false && r.value.peer === false && r.value.bc === false, r.value);
  r = await resolveP(bare.Net.transports());
  ok('room: no window.claude -> transports().room false', r.done && r.value.room === false, r.value);
  r = await resolveP(off.Net.lobby('room'));
  ok('room: lobby() null without the capability', r.done && r.value === null);
  r = await resolveP(off.Net.host({ transport: 'room' }));
  ok('room: host() rejects unavailable without the capability', r.error && r.error.code === 'unavailable', r.error && r.error.code);
  r = await resolveP(off.Net.join({ transport: 'room', code: 'abcd' }));
  ok('room: join() rejects unavailable without the capability', r.error && r.error.code === 'unavailable', r.error && r.error.code);
  ok('room: TEXT.roomOff is the friendly Korean explanation', off.Net.TEXT.roomOff === '온라인은 Claude에 로그인하고 이 게임에 초대받은 친구끼리만 할 수 있어요');

  // ---- host + 3 guests on a jittery network
  const pf = new RoomPlatform({ latency: 40, jitter: 30, drop: 0 });
  const mk = (n) => { const rp = pf.newPage({ name: n }); const p = loadPage(n, { claude: rp.claude }); p.rp = rp; return p; };
  const H = mk('host'), G1 = mk('g1'), G2 = mk('g2'), G3 = mk('g3'), G4 = mk('g4'), M = mk('mallory');
  r = await resolveP(H.Net.transports());
  ok('room: transports().room true with the capability', r.value && r.value.room === true, r.value);
  r = await resolveP(H.Net.profileName());
  ok('room: profileName() from the user capability', r.value === 'host', r.value);
  r = await resolveP(H.Net.host({ transport: 'room' }));
  const hs = r.value;
  ok('room: host() resolves a host session', hs && hs.role === 'host' && /^[a-z0-9]{4}$/.test(hs.code) && typeof hs.selfId === 'string' && hs.transport === 'room', r.error && r.error.code);
  if (!hs) return;
  const code = hs.code;
  ok('room: host peers() = just me, slot 0', same(hs.peers(), [{ id: hs.selfId, isMe: true, host: true, slot: 0 }]), hs.peers());
  const hr = record(hs);
  const gs = [];
  for (const G of [G1, G2, G3]) {
    r = await resolveP(G.Net.join({ transport: 'room', code: code.toUpperCase() + ' ' }));
    ok('room: ' + G.name + ' joins (code case/space tolerant)', r.value && r.value.role === 'guest' && r.value.code === code, r.error && r.error.code);
    gs.push(r.value);
  }
  if (gs.some((s) => !s)) return;
  const [s1, s2, s3] = gs;
  const recs = gs.map(record);
  await clock.run(500);
  const all = [hs, s1, s2, s3];
  ok('room: all four agree on the roster (ids, order, slots)', all.every((s) => idsOf(s) === idsOf(hs)) && hs.peers().length === 4, all.map(idsOf));
  ok('room: slots 0..3 unique, host first', same(hs.peers().map((p) => p.slot), [0, 1, 2, 3]) && hs.peers()[0].host === true);
  ok('room: isMe marks exactly my own entry', all.every((s) => s.peers().filter((p) => p.isMe).length === 1 && s.peers().find((p) => p.isMe).id === s.selfId));
  ok('room: host onPeers fired for each join', hr.peerEvents.length === 3, hr.peerEvents.length);
  r = await resolveP(G4.Net.join({ transport: 'room', code }));
  ok('room: a 5th player is refused with full', r.error && r.error.code === 'full' && r.error.reason === 'full' && r.error.message === '방이 꽉 찼어요', r.error && r.error.code);
  ok('room: the refused 5th left the game room', !G4.rp.handles.has('g-' + code));
  const t0 = clock.now();
  r = await resolveP(G4.Net.join({ transport: 'room', code: 'q9q9' }));
  ok('room: unknown code -> not_found', r.error && r.error.code === 'not_found', r.error && r.error.code);
  // (net.js TUNE.room: findMs 12000 - a named room's host presence can take seconds to arrive on claude.ai - inside joinMs 15000)
  ok('room: not_found decided after the find wait, within the join timeout', clock.now() - t0 >= 12000 && clock.now() - t0 < 15000, clock.now() - t0);
  r = await resolveP(G4.Net.join({ transport: 'room', code: 'ab' }));
  ok('room: malformed code -> not_found at once', r.error && r.error.code === 'not_found');
  r = await resolveP(G4.Net.host({ transport: 'room', code }));
  ok('room: hosting an existing code explicitly -> unavailable (taken)', r.error && r.error.code === 'unavailable' && r.error.reason === 'taken', r.error && [r.error.code, r.error.reason]);

  // ---- latest-wins state
  for (let i = 0; i < 200; i++) hs.setState({ t: i, pad: 'x'.repeat(50) });
  await clock.run(600);
  ok('room: 200 setState calls in one tick -> guests end on the last one', recs.every((rc) => rc.last.get(hs.selfId) && rc.last.get(hs.selfId).t === 199), recs.map((rc) => rc.last.get(hs.selfId)));
  ok('room: ... coalesced into very few deliveries', recs.every((rc) => rc.states.filter(([f]) => f === hs.selfId).length <= 3), recs.map((rc) => rc.states.length));
  recs.forEach((rc) => { rc.states.length = 0; });
  for (let f = 0; f < 120; f++) { hs.setState({ t: 1000 + f }); s1.setState({ me: 1, f }); s2.setState({ me: 2, f }); await clock.run(1000 / 60); }
  await clock.run(500);
  const ts = recs[1].states.filter(([f]) => f === hs.selfId).map(([, o]) => o.t);
  ok('room: 60 Hz host state -> monotonic, ends on the last value', ts.length > 20 && ts.every((v, i) => i === 0 || v > ts[i - 1]) && ts[ts.length - 1] === 1119, [ts.length, ts.slice(-3)]);
  ok('room: ... sent at <= ~25 Hz (coalesced)', ts.length <= 2 * 26 + 2, ts.length);
  ok('room: guest states reach the host', hr.last.get(s1.selfId) && hr.last.get(s1.selfId).f === 119 && hr.last.get(s2.selfId).f === 119, [hr.last.get(s1.selfId), hr.last.get(s2.selfId)]);
  ok('room: guest states reach the other guests', recs[2].last.get(s1.selfId) && recs[2].last.get(s1.selfId).f === 119 && recs[0].last.get(s2.selfId).f === 119);
  const big = { pad: 'x'.repeat(3600 - '{"pad":""}'.length) };
  ok('room: a 3600-byte state is accepted', hs.setState(big) === true);
  ok('room: a 3601-byte state is rejected', hs.setState({ pad: big.pad + 'y' }) === false);
  ok('room: UTF-8 bytes counted (1200 Hangul = 3600 bytes + braces -> rejected)', hs.setState({ pad: '뽀'.repeat(1200) }) === false);
  ok('room: non-JSON state rejected', hs.setState({ f() {} , x: 1n }) === false);
  await clock.run(500);
  ok('room: the 3600-byte state arrives intact (and the rejected ones never replace it)', recs.every((rc) => rc.last.get(hs.selfId).pad === big.pad));
  const odd = { 'a b': 1, 0: [1, 2], nest: { a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } }, constructor: 5 };
  hs.setState(odd);
  await clock.run(500);
  const got = recs[0].last.get(hs.selfId);
  ok('room: states with non-identifier keys / deep nesting travel (string fallback)', got && got['a b'] === 1 && same(got[0], [1, 2]) && got.nest.a.b.c.d.e.f.g.h === 1, got);
  ok('room: prototype-ish keys are stripped from received data', got && !Object.prototype.hasOwnProperty.call(got, 'constructor'));

  // ---- reliable messages on a lossy network
  pf.drop = 0.3; pf.jitter = 80;
  const dir = [];
  await Promise.all([
    sendStream(hs, '*', 'hb', 150, 5, 40),
    sendStream(s1, '*', 'g1b', 60, 3, 40),
    sendStream(s2, hs.selfId, 'g2h', 80, 4, 40),
    sendStream(s3, s1.selfId, 'g3to1', 40, 2, 40),
    (async () => { for (let i = 0; i < 40; i++) { dir.push(hs.send(s2.selfId, { k: 'h2', i })); if (i % 4 === 3) await clock.run(35); } })(),
  ]);
  const doneAll = await until(() => recs.every((rc) => seqOf(rc, hs.selfId, 'hb').length >= 150) && seqOf(hr, s2.selfId, 'g2h').length >= 80 &&
    seqOf(recs[1], hs.selfId, 'h2').length >= 40 && seqOf(hr, s1.selfId, 'g1b').length >= 60 && seqOf(recs[0], s3.selfId, 'g3to1').length >= 40, 60000);
  await clock.run(2000);
  ok('room/lossy: all reliable streams completed', doneAll, { hb: recs.map((rc) => seqOf(rc, hs.selfId, 'hb').length), g2h: seqOf(hr, s2.selfId, 'g2h').length });
  ok('room/lossy: host broadcast -> every guest, in order, exactly once', recs.every((rc) => same(seqOf(rc, hs.selfId, 'hb'), range(150))));
  ok('room/lossy: guest broadcast -> host and both other guests, in order, once', same(seqOf(hr, s1.selfId, 'g1b'), range(60)) && same(seqOf(recs[1], s1.selfId, 'g1b'), range(60)) && same(seqOf(recs[2], s1.selfId, 'g1b'), range(60)) && seqOf(recs[0], s1.selfId, 'g1b').length === 0);
  ok('room/lossy: guest -> host direct, in order, once', same(seqOf(hr, s2.selfId, 'g2h'), range(80)) && seqOf(recs[0], s2.selfId, 'g2h').length === 0 && seqOf(recs[2], s2.selfId, 'g2h').length === 0);
  ok('room/lossy: host -> one guest only reaches that guest', dir.every(Boolean) && same(seqOf(recs[1], hs.selfId, 'h2'), range(40)) && seqOf(recs[0], hs.selfId, 'h2').length === 0 && seqOf(recs[2], hs.selfId, 'h2').length === 0);
  ok('room/lossy: guest -> guest direct (no relay needed)', same(seqOf(recs[0], s3.selfId, 'g3to1'), range(40)) && seqOf(hr, s3.selfId, 'g3to1').length === 0);
  ok('room/lossy: the fake really dropped presence updates', pf.stats.dropped > 50, pf.stats);
  // outboxes keep only the periodic ping/pong in flight once every user message is acked
  ok('room/lossy: outboxes drain once everything is acked', [H, G1, G2, G3].every((P) => { const o = P.rp.handles.get('g-' + code).mine.o; return Array.isArray(o) && o.slice(1).every((e) => e[2] && e[2].c); }), [H, G1, G2, G3].map((P) => P.rp.handles.get('g-' + code).mine.o));
  // lone messages on a quiet link with 50% loss: only the keepalive re-send can get a dropped one through
  pf.drop = 0.5;
  const k0 = H.rp.handles.get('g-' + code).mine.k;
  for (let i = 0; i < 20; i++) { hs.send(s1.selfId, { k: 'lone', i }); await clock.run(1500); }
  await until(() => seqOf(recs[0], hs.selfId, 'lone').length >= 20, 10000);
  ok('room/lossy: lone messages on a quiet 50%-loss link all arrive, in order', same(seqOf(recs[0], hs.selfId, 'lone'), range(20)), seqOf(recs[0], hs.selfId, 'lone'));
  const kBumps = H.rp.handles.get('g-' + code).mine.k - k0;
  ok('room/lossy: ... thanks to retransmission (keepalive re-sends happened)', kBumps >= 3, kBumps);
  // message size limits
  const m900 = { k: 'big', i: 0, pad: 'z'.repeat(900 - JSON.stringify({ k: 'big', i: 0, pad: '' }).length) };
  ok('room: a 900-byte message is accepted', hs.send(s1.selfId, m900) === true);
  ok('room: a 901-byte message is rejected', hs.send(s1.selfId, Object.assign({}, m900, { pad: m900.pad + 'q' })) === false);
  ok('room: send to an unknown id is rejected', hs.send('nobody', { k: 'x' }) === false && hs.send(hs.selfId, { k: 'x' }) === false);
  // contention: a ~3.5 KB state streaming at 20 Hz while 300-byte messages flow
  pf.drop = 0.1;
  const cont = [];
  for (let i = 0; i < 40; i++) {
    hs.setState({ t: 5000 + i, pad: 'p'.repeat(3400) });
    cont.push(hs.send('*', { k: 'cx', i, pad: 'c'.repeat(280) }));
    await clock.run(50);
  }
  const contDone = await until(() => recs.every((rc) => seqOf(rc, hs.selfId, 'cx').length >= 40), 30000);
  await clock.run(1500);
  ok('room/contention: big state + messages: all messages arrive in order', contDone && cont.every(Boolean) && recs.every((rc) => same(seqOf(rc, hs.selfId, 'cx'), range(40))));
  ok('room/contention: ... and the state still flows and ends on the latest', recs.every((rc) => rc.last.get(hs.selfId).t === 5039), recs.map((rc) => rc.last.get(hs.selfId).t));
  ok('room/contention: big message (900 B) + big state (3.6 KB) both get through', recs[0].msgs.some(([, m]) => m.k === 'big' && m.pad === m900.pad));
  pf.drop = 0; pf.jitter = 30;

  // ---- untrusted traffic in the game room
  const mr = await resolveP(M.rp.lobbyNs.join('g-' + code));
  const evil = mr.value;
  await clock.run(200);
  await evil.presence({ v: 3, r: 'g', c: code, i: 'zz', k: 1, q: 1, s: { hack: 1 }, o: [1, [1, hs.selfId, { u: { evil: 1 } }], [2, '*', { u: { evil: 2 } }], [3, s1.selfId, { c: 'roster', l: [[M.rp.label, 0]] }]], a: [[hs.selfId, 1e9]], w: 'x' });
  await clock.run(300);
  await evil.presence({ o: 'nope', a: { x: 1 }, q: 'x', s: null, w: [[1, 2]], r: 'h' });
  await clock.run(300);
  await evil.presence({ o: [-5, null, [2, 3]], a: [null, [1]], k: 2 });
  await clock.run(500);
  ok('room/untrusted: messages from a non-player are never delivered', !hr.msgs.some(([, m]) => m.evil) && !recs.some((rc) => rc.msgs.some(([, m]) => m.evil)));
  ok('room/untrusted: states from a non-player are ignored', !hr.states.some(([f]) => f === M.rp.label));
  ok('room/untrusted: a forged roster from a non-host changes nothing', idsOf(s1) === idsOf(hs) && hs.peers().length === 4);
  ok('room/untrusted: a forged huge ack does not stall the host outbox', hs.send('*', { k: 'after', i: 0 }) && true);
  await until(() => recs.every((rc) => seqOf(rc, hs.selfId, 'after').length === 1), 3000);
  ok('room/untrusted: ... messages still flow afterwards', recs.every((rc) => seqOf(rc, hs.selfId, 'after').length === 1));
  await evil.leave();

  // ---- a guest's connection drops for a while
  const before = recs[0].status.length;
  G1.rp.setConnected(false);
  await clock.run(800);
  for (let i = 0; i < 10; i++) hs.send(s1.selfId, { k: 'while', i });
  await clock.run(5200);
  ok('room/disconnect: the guest sees "unstable"', recs[0].status.slice(before).includes('error:unstable'), recs[0].status);
  ok('room/disconnect: stats().connected false while unstable', s1.stats().connected === false);
  G1.rp.setConnected(true);
  await until(() => seqOf(recs[0], hs.selfId, 'while').length >= 10, 8000);
  await clock.run(3000);
  ok('room/disconnect: messages sent meanwhile arrive after reconnecting, in order', same(seqOf(recs[0], hs.selfId, 'while'), range(10)), seqOf(recs[0], hs.selfId, 'while'));
  ok('room/disconnect: recovered status + connected again', recs[0].status.includes('open:recovered') && s1.stats().connected === true, [recs[0].status, s1.stats()]);
  ok('room: rtt measured on both ends', typeof s1.stats().rttMs === 'number' && s1.stats().rttMs > 0 && typeof hs.stats().rttMs === 'number', [s1.stats(), hs.stats()]);

  // ---- lobby
  const LH = mk('lobbyhost'), LV = mk('viewer');
  const lb1 = (await resolveP(LH.Net.lobby('room'))).value;
  const lb2 = (await resolveP(LV.Net.lobby('room'))).value;
  ok('lobby: lobby("room") resolves on both pages', !!lb1 && !!lb2 && typeof lb1.games === 'function');
  ok('lobby: lobby("bc") / lobby("peer") resolve null', (await resolveP(LV.Net.lobby('bc'))).value === null && (await resolveP(LV.Net.lobby('peer'))).value === null);
  ok('lobby: the same lobby object is reused on a page', (await resolveP(LV.Net.lobby('room'))).value === lb2);
  const lhs = (await resolveP(LH.Net.host({ transport: 'room' }))).value;
  const changes = [];
  lb2.onChange((g) => changes.push(g));
  lb1.advertise({ nick: '오리\u200b대장', char: 'duck', code: lhs.code, mode: 'battle', n: 1, max: 4, open: true });
  await clock.run(400);
  let g = lb2.games();
  ok('lobby: an advertised game is listed for other pages', g.length >= 1 && same(g.find((x) => x.code === lhs.code), { code: lhs.code, mode: 'battle', n: 1, max: 4, hostNick: '오리대장' }), g);
  ok('lobby: my own ad is not in my list', !lb1.games().some((x) => x.code === lhs.code));
  ok('lobby: onChange delivered the new list', changes.some((l) => l.some((x) => x.code === lhs.code)));
  ok('lobby: lobby presence shape {v:3, nick, char, host:{code, mode, n, max, open}}', same(LH.rp.lobby.mine, { v: 3, nick: '오리대장', char: 'duck', host: { code: lhs.code, mode: 'battle', n: 1, max: 4, open: true } }), LH.rp.lobby.mine);
  ok('lobby: online() counts lobby pages', lb2.online() >= 2, lb2.online());
  // malformed ads from a page that writes presence by hand
  await M.rp.lobbyNs.presence({ v: 3, nick: 'x'.repeat(40), host: { code: 'ZZ!!', mode: 'coop', n: 1, max: 4, open: true } });
  await clock.run(200);
  await M.rp.lobbyNs.presence({ host: { code: 'mmmm', mode: 'coop', n: 2.5, max: 9, open: true } });
  await clock.run(300);
  g = lb2.games();
  const mm = g.find((x) => x.code === 'mmmm');
  ok('lobby/untrusted: bad codes are dropped, numbers clamped, nick cut to 12', !g.some((x) => x.code === 'ZZ!!') && mm && mm.n === 1 && mm.max === 4 && mm.hostNick === 'x'.repeat(12), g);
  await M.rp.lobbyNs.presence({ host: { code: 'mmmm', mode: 'chess', n: 1, max: 4, open: true } });
  await clock.run(300);
  ok('lobby/untrusted: unknown modes are dropped', !lb2.games().some((x) => x.code === 'mmmm'));
  lb1.advertise({ code: lhs.code, mode: 'battle', n: 4, max: 4, open: true });
  await clock.run(300);
  ok('lobby: a full game is not listed', !lb2.games().some((x) => x.code === lhs.code));
  lb1.advertise({ code: lhs.code, mode: 'battle', n: 2, max: 4, open: false });
  await clock.run(300);
  ok('lobby: a closed (playing) game is not listed', !lb2.games().some((x) => x.code === lhs.code));
  lb1.advertise({ code: lhs.code, mode: 'coop', n: 2, max: 4, open: true });
  await clock.run(300);
  ok('lobby: re-opened game is listed again', lb2.games().some((x) => x.code === lhs.code && x.mode === 'coop'));
  // (파티, design/party.md 6.2: a party room is listed as such; an advertise of an unknown mode still becomes co-op)
  lb1.advertise({ code: lhs.code, mode: 'party', n: 3, max: 4, open: true });
  await clock.run(300);
  ok('lobby: a party room is listed with mode party', lb2.games().some((x) => x.code === lhs.code && x.mode === 'party' && x.n === 3) && LH.rp.lobby.mine.host.mode === 'party', LH.rp.lobby.mine);
  lb1.advertise({ code: lhs.code, mode: 'chess', n: 3, max: 4, open: true });
  await clock.run(300);
  ok('lobby: an advertise with an unknown mode becomes coop', LH.rp.lobby.mine.host.mode === 'coop', LH.rp.lobby.mine);
  lb1.advertise({ code: lhs.code, mode: 'coop', n: 2, max: 4, open: true });
  await clock.run(300);
  r = await resolveP(LV.Net.host({ transport: 'room', code: lhs.code }));
  ok('lobby: hosting a code another page advertises -> unavailable (taken)', r.error && r.error.code === 'unavailable');
  lhs.leave();
  await clock.run(300);
  ok('lobby: a host leaving its session takes its ad down', !lb2.games().some((x) => x.code === lhs.code) && !('host' in LH.rp.lobby.mine), LH.rp.lobby.mine);
  lb1.advertise({ code: 'wxyz', mode: 'coop', n: 1, max: 2, open: true });
  await clock.run(300);
  ok('lobby: max 2 game listed', lb2.games().some((x) => x.code === 'wxyz' && x.max === 2));
  lb1.advertise(null);
  await clock.run(300);
  ok('lobby: advertise(null) removes the game, keeps nick/char', !lb2.games().some((x) => x.code === 'wxyz') && LH.rp.lobby.mine.nick === '오리대장');
  lb1.close();
  await clock.run(300);
  ok('lobby: close() clears my lobby presence', same(LH.rp.lobby.mine, {}), LH.rp.lobby.mine);

  // ---- leaving
  const n1 = recs[0].peerEvents.length;
  // (v4 trophies: a reliable message sent right before leave() - the engine's 'gg' on 나가기 - still arrives, before the
  // host sees that player gone)
  const lastWord = lastBeforeLeave(hs, s3);
  s3.send(hs.selfId, { k: 'gg-last' });
  s3.leave();
  await clock.run(800);
  ok('room/leave: a reliable message sent right before leave() arrives before the player is gone', lastWord.join() === 'msg,gone', lastWord);
  ok('room/leave: a guest leaving -> host and other guests drop it', hs.peers().length === 3 && s1.peers().length === 3 && s2.peers().length === 3 && !s1.peers().some((p) => p.id === s3.selfId), [idsOf(hs), idsOf(s1)]);
  ok('room/leave: guests got an onPeers event', recs[0].peerEvents.length > n1);
  ok('room/leave: the leaver sees closed:left', recs[2].status.includes('closed:left') && s3.send('*', { k: 'x' }) === false && s3.setState({}) === false);
  hs.setState({ idle: 'room' });
  await clock.run(1000);
  const R3 = await resolveP(G3.Net.join({ transport: 'room', code }));
  const r3rec = R3.value ? record(R3.value) : null;
  await clock.run(600);
  ok('room: a late joiner gets the idle host latest state (presence, replayed after the welcome)', r3rec && r3rec.last.get(hs.selfId) && r3rec.last.get(hs.selfId).idle === 'room', r3rec && r3rec.last.get(hs.selfId));
  ok('room/leave: a player can come back (gets a free slot)', R3.value && R3.value.peers().length === 4 && R3.value.peers().find((p) => p.isMe).slot === 3, R3.error && R3.error.code);
  hs.lock(true);
  r = await resolveP(G4.Net.join({ transport: 'room', code }));
  ok('room/lock: joins refused while the host locked the room', r.error && r.error.code === 'full', r.error && [r.error.code, r.error.reason]);
  hs.lock(false);
  hs.leave();
  await clock.run(1500);
  ok('room/leave: the host leaving -> every guest closed:host_left', [recs[0], recs[1]].every((rc) => rc.status.includes('closed:host_left')), [recs[0].status, recs[1].status]);
  ok('room/leave: stats().connected false after closing', s1.stats().connected === false && s2.stats().connected === false);

  // ---- terminal error
  const T1 = mk('t1'), T2 = mk('t2');
  const th = (await resolveP(T1.Net.host({ transport: 'room' }))).value;
  const tg = (await resolveP(T2.Net.join({ transport: 'room', code: th.code }))).value;
  const tst = [];
  tg.onStatus((k, d) => tst.push(k + ':' + d));
  T2.rp.revoke('revoked');
  await clock.run(500);
  ok('room/terminal: a revoked grant closes the session as lost', tst.includes('closed:lost'), tst);
  await clock.run(25000);
  ok('room/terminal: the host drops the silent guest', th.peers().length === 1, th.peers());
  th.leave();

  // ---- platform contract checks over everything above
  const netPages = pf.pages.filter((p) => p.nick !== 'mallory');
  ok('room/contract: no presence call was ever rejected', pf.violations.length === 0, pf.violations.slice(0, 5));
  ok('room/contract: <= 40 presence calls in any 1 s per page', netPages.every((p) => p.maxPerSec <= 40), netPages.map((p) => p.nick + ':' + p.maxPerSec));
  ok('room/contract: emit never used', pf.stats.emits === 0);
  if (VERBOSE) console.log('room stats', pf.stats, netPages.map((p) => p.nick + ':' + p.maxPerSec + '/s'));
}

// ==================================================================================== TESTS: room absences (flaps)
// A presence that vanishes and comes back (connection refresh, network switch) must not end anything; one that stays
// away past the grace is gone, and a guest that comes back after the host dropped it is told (closed:lost), never
// left playing alone. A deliberate leave still ends at once.
async function testRoomFlap() {
  const pf = new RoomPlatform({ latency: 40, jitter: 30, drop: 0 });
  const mk = (n) => { const rp = pf.newPage({ name: n }); const p = loadPage(n, { claude: rp.claude }); p.rp = rp; return p; };
  const H = mk('fhost'), A = mk('fa'), B = mk('fb');
  const hs = (await resolveP(H.Net.host({ transport: 'room' }))).value;
  if (!hs) { ok('room/flap: host', false); return; }
  const sa = (await resolveP(A.Net.join({ transport: 'room', code: hs.code }))).value;
  const sb = (await resolveP(B.Net.join({ transport: 'room', code: hs.code }))).value;
  if (!sa || !sb) { ok('room/flap: joins', false); return; }
  const hr = record(hs), ra = record(sa), rb = record(sb);
  await clock.run(600);
  ok('room/flap: three players', hs.peers().length === 3 && sa.peers().length === 3, idsOf(hs));
  // 1) a guest drops for 1 s (others see it leave and come back)
  B.rp.flap(1000);
  await clock.run(5000);
  ok('room/flap: a 1 s drop of a guest keeps it in the game (host roster)', hs.peers().length === 3 && hs.peers().some((p) => p.id === sb.selfId), idsOf(hs));
  ok('room/flap: ... and the guest session stays open', !rb.status.some((s) => s.startsWith('closed')), rb.status);
  for (let i = 0; i < 5; i++) hs.send(sb.selfId, { k: 'after1', i });
  sb.send(hs.selfId, { k: 'back1', i: 0 });
  await until(() => seqOf(rb, hs.selfId, 'after1').length >= 5 && seqOf(hr, sb.selfId, 'back1').length >= 1, 5000);
  ok('room/flap: ... messages flow both ways afterwards, once each', same(seqOf(rb, hs.selfId, 'after1'), range(5)) && same(seqOf(hr, sb.selfId, 'back1'), [0]), [seqOf(rb, hs.selfId, 'after1'), seqOf(hr, sb.selfId, 'back1')]);
  // 2) the HOST drops for 1 s: no guest ends with host_left
  H.rp.flap(1000);
  await clock.run(6000);
  ok('room/flap: a 1 s drop of the host does not end the guests\' game', !ra.status.some((s) => s.startsWith('closed')) && !rb.status.some((s) => s.startsWith('closed')), [ra.status, rb.status]);
  ok('room/flap: ... the host still has both guests', hs.peers().length === 3, idsOf(hs));
  hs.setState({ t: 'after-host-flap' });
  await clock.run(500);
  ok('room/flap: ... states flow again', ra.last.get(hs.selfId) && ra.last.get(hs.selfId).t === 'after-host-flap');
  // 3) a guest stays away past the grace: the host drops it; when it comes back it is told and closes 'lost'
  const st0 = rb.status.length;
  B.rp.flap(14000);
  await clock.run(10000);
  ok('room/flap: a guest away past the grace is dropped by the host', hs.peers().length === 2 && !hs.peers().some((p) => p.id === sb.selfId), idsOf(hs));
  ok('room/flap: ... the other guest learns it too', sa.peers().length === 2, idsOf(sa));
  await clock.run(9000);
  ok('room/flap: ... the dropped guest, back again, is told it is out (closed:lost), not left playing alone', rb.status.slice(st0).includes('closed:lost'), rb.status.slice(st0));
  // 4) a deliberate host leave still ends the game at once
  const ta = clock.now();
  hs.leave();
  await until(() => ra.status.includes('closed:host_left'), 3000);
  ok('room/flap: a deliberate host leave -> closed:host_left within a second', ra.status.includes('closed:host_left') && clock.now() - ta < 1200, [ra.status, clock.now() - ta]);
  ok('room/flap: no presence call was rejected', pf.violations.length === 0, pf.violations.slice(0, 3));
}

// a named room whose members' presence takes seconds to arrive (seen on the real claude.ai room: the host's presence
// came later than the old 3.5 s find wait, and the guest got 방을 찾을 수 없어요): net.js TUNE.room.findMs 12000 still
// finds that host, and a wrong code still ends in not_found (not a timeout) within joinMs 15000
async function testRoomSlowHost() {
  const pf = new RoomPlatform({ latency: 40, jitter: 30, drop: 0 });
  const mk = (n) => { const rp = pf.newPage({ name: n }); const p = loadPage(n, { claude: rp.claude }); p.rp = rp; return p; };
  const H = mk('shost'), A = mk('sa'), B = mk('sb');
  const hs = (await resolveP(H.Net.host({ transport: 'room' }))).value;
  if (!hs) { ok('room/slow: host', false); return; }
  pf.slow = 7000;                                  // (the presence already there when the guest joins: 7 s late)
  let t0 = clock.now();
  const j = settle(A.Net.join({ transport: 'room', code: hs.code }));
  await clock.run(300); pf.slow = 0;
  await until(() => j.done, 20000);
  ok('room/slow: a host whose presence arrives 7 s late is still found (joined, not not_found)', j.value && j.value.role === 'guest' && j.value.code === hs.code, j.error && j.error.code);
  ok('room/slow: ... once it arrived (7-12 s)', clock.now() - t0 >= 7000 && clock.now() - t0 < 12000, clock.now() - t0);
  await clock.run(600);
  ok('room/slow: ... and both see each other', j.value && hs.peers().length === 2 && j.value.peers().length === 2, idsOf(hs));
  pf.slow = 2000; t0 = clock.now();
  const w = await resolveP(B.Net.join({ transport: 'room', code: 'z8z8' }), 30000);
  pf.slow = 0;
  ok('room/slow: a wrong code on a slow room -> not_found (not timeout)', w.error && w.error.code === 'not_found', w.error && w.error.code);
  ok('room/slow: ... after the find wait, within the join timeout', clock.now() - t0 >= 12000 && clock.now() - t0 < 15000, clock.now() - t0);
  // the named room itself connects slowly (4 s): connected + 12 s would pass the join's 15 s - it still ends in
  // not_found (1 s before that deadline), never the misleading timeout ('연결이 끊겼어요')
  pf.latency = 4000; t0 = clock.now();
  const w2 = settle(B.Net.join({ transport: 'room', code: 'y7y7' }));
  await clock.run(300); pf.latency = 40;
  await until(() => w2.done, 30000);
  ok('room/slow: a wrong code on a room that connects 4 s late -> not_found (not timeout)', w2.error && w2.error.code === 'not_found', w2.error && w2.error.code);
  ok('room/slow: ... before the join timeout', clock.now() - t0 >= 12000 && clock.now() - t0 < 15000, clock.now() - t0);
  if (j.value) j.value.leave();
  hs.leave();
  await clock.run(500);
  ok('room/slow: no presence call was rejected', pf.violations.length === 0, pf.violations.slice(0, 3));
}

// ==================================================================================== TESTS: peer (PeerJS fake)
async function testPeer() {
  const pn = makePeerNet({ latency: 30, jitter: 25 });
  const mk = (n) => loadPage(n, { Peer: pn.Peer });
  const H = mk('phost'), G1 = mk('pg1'), G2 = mk('pg2'), G3 = mk('pg3'), G4 = mk('pg4'), X = mk('px');
  let r = await resolveP(H.Net.transports());
  ok('peer: transports().peer true when window.Peer exists', r.value && r.value.peer === true && r.value.room === false, r.value);
  r = await resolveP(H.Net.lobby('peer'));
  ok('peer: no lobby on peer', r.value === null);
  r = await resolveP(H.Net.host({ transport: 'peer', code: 'k7k7' }));
  const hs = r.value;
  ok('peer: host registers ppodeuk-<code>', hs && hs.selfId === 'ppodeuk-k7k7' && hs.code === 'k7k7', r.error && r.error.code);
  if (!hs) return;
  r = await resolveP(X.Net.host({ transport: 'peer', code: 'k7k7' }));
  ok('peer: hosting a taken code explicitly -> unavailable (taken)', r.error && r.error.code === 'unavailable' && r.error.reason === 'taken', r.error && r.error.code);
  r = await resolveP(X.Net.host({ transport: 'peer' }));
  ok('peer: hosting with a generated code works', r.value && /^[a-z0-9]{4}$/.test(r.value.code) && r.value.selfId === 'ppodeuk-' + r.value.code);
  if (r.value) r.value.leave();
  const hr = record(hs);
  const gs = [];
  for (const G of [G1, G2, G3]) { r = await resolveP(G.Net.join({ transport: 'peer', code: 'K7K7' })); ok('peer: ' + G.name + ' joins', !!r.value, r.error && r.error.code); gs.push(r.value); }
  if (gs.some((s) => !s)) return;
  const [s1, s2, s3] = gs;
  const recs = gs.map(record);
  await clock.run(400);
  ok('peer: roster agrees everywhere', [s1, s2, s3].every((s) => idsOf(s) === idsOf(hs)) && hs.peers().length === 4, [hs, s1, s2, s3].map(idsOf));
  r = await resolveP(G4.Net.join({ transport: 'peer', code: 'k7k7' }));
  ok('peer: 5th -> full', r.error && r.error.code === 'full', r.error && r.error.code);
  r = await resolveP(G4.Net.join({ transport: 'peer', code: 'nnnn' }));
  ok('peer: unknown code -> not_found', r.error && r.error.code === 'not_found', r.error && r.error.code);
  for (let f = 0; f < 60; f++) { hs.setState({ t: f }); s1.setState({ g: 1, f }); await clock.run(1000 / 60); }
  await clock.run(400);
  ok('peer: host state -> guests (latest)', recs.every((rc) => rc.last.get(hs.selfId) && rc.last.get(hs.selfId).t === 59));
  ok('peer: guest state -> host and, relayed, the other guests (stamped with the guest id)', hr.last.get(s1.selfId).f === 59 && recs[1].last.get(s1.selfId).f === 59 && recs[2].last.get(s1.selfId).f === 59 && !recs[0].last.has(s1.selfId));
  await Promise.all([sendStream(hs, '*', 'hb', 100, 5, 20), sendStream(s1, '*', 'g1b', 60, 4, 20), sendStream(s2, s3.selfId, 'g2to3', 30, 3, 20), sendStream(s3, hs.selfId, 'g3h', 30, 3, 20)]);
  await until(() => recs.every((rc) => seqOf(rc, hs.selfId, 'hb').length >= 100) && seqOf(recs[2], s2.selfId, 'g2to3').length >= 30 && seqOf(recs[2], s1.selfId, 'g1b').length >= 60, 10000);
  await clock.run(500);
  ok('peer: host broadcast in order, once', recs.every((rc) => same(seqOf(rc, hs.selfId, 'hb'), range(100))));
  ok('peer: guest broadcast relayed in order, once', same(seqOf(hr, s1.selfId, 'g1b'), range(60)) && same(seqOf(recs[1], s1.selfId, 'g1b'), range(60)) && same(seqOf(recs[2], s1.selfId, 'g1b'), range(60)));
  ok('peer: guest -> guest direct relayed only to the target', same(seqOf(recs[2], s2.selfId, 'g2to3'), range(30)) && seqOf(recs[0], s2.selfId, 'g2to3').length === 0 && seqOf(hr, s2.selfId, 'g2to3').length === 0);
  ok('peer: guest -> host direct', same(seqOf(hr, s3.selfId, 'g3h'), range(30)) && seqOf(recs[0], s3.selfId, 'g3h').length === 0);
  ok('peer: rtt measured', typeof s1.stats().rttMs === 'number' && s1.stats().rttMs >= 60, s1.stats());
  const lastWord = lastBeforeLeave(hs, s3);
  s3.send(hs.selfId, { k: 'gg-last' });
  s3.leave();
  await clock.run(600);
  ok('peer: a guest leaving updates every roster', hs.peers().length === 3 && s1.peers().length === 3 && s2.peers().length === 3);
  ok('peer: a reliable message sent right before leave() arrives before the player is gone', lastWord.join() === 'msg,gone', lastWord);
  pn.cut(s2.selfId);
  await clock.run(600);
  ok('peer: a guest whose link dies is dropped and sees closed:lost', hs.peers().length === 2 && recs[1].status.includes('closed:lost'), [hs.peers().length, recs[1].status]);
  hs.leave();
  await clock.run(600);
  ok('peer: host leaving -> guests closed:host_left', recs[0].status.includes('closed:host_left'), recs[0].status);
}

// ==================================================================================== TESTS: bc (fake channel, simulated network)
async function testBc() {
  const bus = makeBC();
  const NET = { latency: 50, jitter: 50, drop: 0.3 };
  const mk = (n, search) => loadPage(n, { BroadcastChannel: bus.BC, location: { search: search || '' } });
  const H = mk('bhost'), G1 = mk('bg1', '?net=bc&lat=50&jit=50&drop=0.3'), G2 = mk('bg2'), G3 = mk('bg3'), G4 = mk('bg4'), Q = mk('q', '?net=bc&lat=80&jit=30&drop=0.1');
  ok('bc: fromQuery parses ?net=bc&lat=80&jit=30&drop=0.1', same(Q.Net.fromQuery(), { transport: 'bc', net: { latency: 80, jitter: 30, drop: 0.1 } }), Q.Net.fromQuery());
  ok('bc: fromQuery clamps and ignores junk', same(Q.Net.fromQuery('?net=evil&lat=-5&drop=7'), { transport: null, net: { latency: 0, jitter: 0, drop: 0.95 } }), Q.Net.fromQuery('?net=evil&lat=-5&drop=7'));
  let r = await resolveP(H.Net.transports());
  ok('bc: transports().bc true when BroadcastChannel exists', r.value && r.value.bc === true);
  r = await resolveP(H.Net.host({ transport: 'bc', code: 'b0b0', net: NET }));
  const hs = r.value;
  ok('bc: host', hs && hs.code === 'b0b0', r.error && r.error.code);
  if (!hs) return;
  r = await resolveP(Q.Net.host({ transport: 'bc', code: 'b0b0' }));
  ok('bc: hosting a code already hosted on the channel -> unavailable (taken)', r.error && r.error.code === 'unavailable', r.error && r.error.code);
  const hr = record(hs);
  const gs = [];
  for (const [G, o] of [[G1, {}], [G2, { net: NET }], [G3, { net: NET }]]) { r = await resolveP(G.Net.join(Object.assign({ transport: 'bc', code: 'b0b0' }, o))); ok('bc: ' + G.name + ' joins over a lossy, jittery link', !!r.value, r.error && r.error.code); gs.push(r.value); }
  if (gs.some((s) => !s)) return;
  const [s1, s2, s3] = gs;
  const recs = gs.map(record);
  r = await resolveP(G4.Net.join({ transport: 'bc', code: 'b0b0', net: NET }));
  ok('bc: 5th -> full', r.error && r.error.code === 'full', r.error && r.error.code);
  r = await resolveP(G4.Net.join({ transport: 'bc', code: 'zzzz' }));
  ok('bc: unknown code -> not_found', r.error && r.error.code === 'not_found', r.error && r.error.code);
  // states: dropped / reordered on the wire, never delivered stale
  const arrivals = [];
  s2.onState((from, o) => { if (from === hs.selfId) arrivals.push(clock.now() - o.at); });
  for (let f = 0; f < 180; f++) { hs.setState({ t: f, at: clock.now() }); s1.setState({ f }); await clock.run(1000 / 60); }
  await clock.run(1000);
  const st = recs[1].states.filter(([f]) => f === hs.selfId).map(([, o]) => o);
  ok('bc: states never arrive older-after-newer', st.every((o, i) => i === 0 || o.t >= st[i - 1].t), st.map((o) => o.t).slice(0, 20));
  const ratio = new Set(st.map((o) => o.t)).size / 90;            // ~30 Hz coalesced over 3 s -> ~90 sent
  ok('bc: state delivery ratio matches drop 0.3 on both ends (~0.49)', ratio > 0.3 && ratio < 0.7, ratio.toFixed(2));
  const mean = arrivals.reduce((a, b) => a + b, 0) / Math.max(1, arrivals.length);
  ok('bc: one-way state latency ~ 2 x (50 + U(0,50)) ms', mean >= 100 && mean <= 230, mean.toFixed(1));
  // reliable under the same conditions
  await Promise.all([sendStream(hs, '*', 'hb', 200, 6, 30), sendStream(s2, '*', 'g2b', 100, 4, 30), sendStream(s1, hs.selfId, 'g1h', 100, 5, 30)]);
  await until(() => recs.every((rc) => seqOf(rc, hs.selfId, 'hb').length >= 200) && seqOf(hr, s1.selfId, 'g1h').length >= 100 && seqOf(recs[2], s2.selfId, 'g2b').length >= 100, 20000);
  await clock.run(800);
  ok('bc: reliable host broadcast: none lost, in order, once', recs.every((rc) => same(seqOf(rc, hs.selfId, 'hb'), range(200))));
  ok('bc: reliable guest broadcast reaches host + guests in order', same(seqOf(hr, s2.selfId, 'g2b'), range(100)) && same(seqOf(recs[0], s2.selfId, 'g2b'), range(100)) && same(seqOf(recs[2], s2.selfId, 'g2b'), range(100)));
  ok('bc: reliable guest -> host in order', same(seqOf(hr, s1.selfId, 'g1h'), range(100)) && seqOf(recs[1], s1.selfId, 'g1h').length === 0);
  const rtt = s2.stats().rttMs;
  ok('bc: rtt reflects the simulated latency on both ends (>= 4 x 50 ms)', rtt >= 200 && rtt <= 800, rtt);
  // latest-wins converges: a final update that gets dropped is re-sent (about once a second while unchanged)
  hs.setState({ final: 1 });
  await clock.run(12000);
  ok('bc: the last state reaches everyone despite 30% loss (periodic re-send)', recs.every((rc) => rc.last.get(hs.selfId) && rc.last.get(hs.selfId).final === 1), recs.map((rc) => rc.last.get(hs.selfId)));
  // a late joiner gets everyone's latest state although nobody calls setState again
  // (and a reliable message sent right before leave() arrives first, over a lossy link)
  const lastWord = lastBeforeLeave(hs, s3);
  s3.send(hs.selfId, { k: 'gg-last' });
  s3.leave();
  await clock.run(1500);
  ok('bc: a reliable message sent right before leave() arrives before the player is gone', lastWord.join() === 'msg,gone', lastWord);
  const late = (await resolveP(G4.Net.join({ transport: 'bc', code: 'b0b0', net: { latency: 30, jitter: 10 } }))).value;
  const lateRec = late ? record(late) : null;
  // (an unchanged state is re-sent about once a second; at 30% loss 3 s gave each sender only ~3 tries - a 5% miss per
  // seed: up to 8 s here, still without any new setState)
  await until(() => lateRec && lateRec.last.get(hs.selfId) && lateRec.last.get(hs.selfId).final === 1 && lateRec.last.get(s1.selfId) && lateRec.last.get(s1.selfId).f === 179, 8000);
  ok('bc: a late joiner receives the host and guests latest states without new setState calls', !!late && lateRec.last.get(hs.selfId) && lateRec.last.get(hs.selfId).final === 1 && lateRec.last.get(s1.selfId) && lateRec.last.get(s1.selfId).f === 179, lateRec && [lateRec.last.get(hs.selfId), lateRec.last.get(s1.selfId)]);
  if (late) late.leave();
  await clock.run(1500);
  s3.leave();
  await clock.run(1500);
  ok('bc: a guest leaving updates the rosters', hs.peers().length === 3 && s1.peers().length === 3, [idsOf(hs), idsOf(s1)]);
  hs.leave();
  await clock.run(1500);
  ok('bc: host leaving -> guests closed:host_left', recs[0].status.includes('closed:host_left') && recs[1].status.includes('closed:host_left'), [recs[0].status, recs[1].status]);
  // a host that vanishes without a goodbye (tab killed): guests notice
  const MuteableBC = class extends bus.BC {};
  const H2 = loadPage('bhost2', { BroadcastChannel: MuteableBC }), G5 = mk('bg5');
  const h2 = (await resolveP(H2.Net.host({ transport: 'bc', code: 'c1c1' }))).value;
  const g5 = (await resolveP(G5.Net.join({ transport: 'bc', code: 'c1c1' }))).value;
  ok('bc: second game on another code', !!h2 && !!g5);
  if (!g5) return;
  const g5s = [];
  g5.onStatus((k, d) => g5s.push(k + ':' + d));
  MuteableBC.prototype.postMessage = function () {};   // the host page goes silent (no goodbye), its timers keep running
  await clock.run(4000);
  ok('bc: a silent host -> guest status error:unstable', g5s.includes('error:unstable'), g5s);
  await clock.run(8000);
  ok('bc: ... then closed:lost', g5s.includes('closed:lost'), g5s);
}

// ==================================================================================== TESTS: v4 kits on the wire
// (design/char-kits.md §9.2, §14.5). net.js itself is unchanged by the kits - its messages are generic. What the kits
// rely on is checked here: the engine's wire items and their clamps in game.js (static), and the same shapes carried
// intact by PG.Net (live, on the fake BroadcastChannel): body bits A / B in the guest's body state, the
// reliable {t:'qk'} and the cat's a:1 on {t:'shot'}, a host snapshot at SNAP_LIMIT, and that the version check is the
// engine's (the transport hands a v3 state over as it is; game.js netStateIn drops it).
async function testV4Wire() {
  const game = fs.readFileSync(path.join(__dirname, '..', 'src', 'game.js'), 'utf8');
  const has = (re) => re.test(game);
  ok('v4 wire: game.js NET_V is 4 and netStateIn drops any other version', has(/const NET_V = 4;/) && has(/function netStateIn\(from, st\) \{\s*if \(!NET\.sess \|\| !st \|\| typeof st !== 'object' \|\| st\.v !== NET_V\) return;/));
  ok('v4 wire: guestSend sets body bits A 256 / B 512; parseBody keeps fl 0..1023', has(/if \(me\.mvA\) fl \|= 256;/) && has(/if \(me\.mvB\) fl \|= 512;/) && has(/fl: nInt\(st\.fl, 0, 1023, 0\)/));
  ok('v4 wire: snapPlayers sets P-row bits A 128 / B 256 (guestPlayers reads them, never with 능력 끄기)', has(/if \(p\.mvA\) fl \|= 128;/) && has(/if \(p\.mvB\) fl \|= 256;/) &&
    has(/p\.mvA = !G\.perksOff && !!\(fl & 128\); p\.mvB = !G\.perksOff && !!\(fl & 256\);/) && has(/p\.mvA = !G\.perksOff && !!\(a\.fl & 256\); p\.mvB = !G\.perksOff && !!\(a\.fl & 512\);/));
  ok('v4 wire: snapBubbles bits 16 droplet / 32 yarn; viewLists keeps bubble flags 0..255', has(/if \(b\.drop\) fl \|= 16;/) && has(/if \(b\.ty === 'yarn'\) fl \|= 32;/) && has(/f = nInt\(r\[7\], 0, 255, 0\)/),
    [has(/if \(b\.drop\) fl \|= 16;/), has(/if \(b\.ty === 'yarn'\) fl \|= 32;/), has(/f = nInt\(r\[7\], 0, 255, 0\)/)]);
  ok('v4 wire: the host takes {t:\'qk\'} only through hostQuake, and a:1 only as fire(pl, m.a === 1)', has(/case 'qk': if \(pl\) hostQuake\(pl, m\); return;/) && has(/const b = fire\(pl, m\.a === 1\);/) && has(/t: 'qk', x: r1\(p\.x\), y: r1\(p\.y\), ep: p\.ep/));
  const SNAP = +((game.match(/SNAP_LIMIT = (\d+)/) || [])[1] || 0);
  ok('v4 wire: SNAP_LIMIT 3400 (unchanged by the kits), under the transports\' 3600-byte state limit', SNAP === 3400, SNAP);

  // live: one host and two guests on the fake BroadcastChannel (a little latency; the transports share the session code)
  const bus = makeBC();
  const mk = (n) => loadPage(n, { BroadcastChannel: bus.BC });
  const H = mk('v4h'), A = mk('v4a'), B = mk('v4b');
  const hs = (await resolveP(H.Net.host({ transport: 'bc', code: 'k4k4', net: { latency: 20, jitter: 10 } }))).value;
  const ga = hs && (await resolveP(A.Net.join({ transport: 'bc', code: 'k4k4', net: { latency: 20, jitter: 10 } }))).value;
  const gb = ga && (await resolveP(B.Net.join({ transport: 'bc', code: 'k4k4' }))).value;
  ok('v4 wire: bc host + 2 guests', !!(hs && ga && gb));
  if (!gb) return;
  const hr = record(hs), br = record(gb);
  // the guest body state exactly as guestSend builds it: a capy mid-slam (A) and recovering (B), JUMP held (16)
  const body = (k, fl) => ({ v: 4, k, gid: 3, ep: 2, x: 101.3, y: 150.2, vx: 0, vy: 5, f: 1, fl, sh: 0, bb: [], ny: 0, rt: 812 });
  for (let k = 0; k < 6; k++) { ga.setState(body(1000 + k * 2, k < 3 ? 256 | 16 : 512 | 1)); await clock.run(34); }
  await clock.run(400);
  const lastH = hr.last.get(ga.selfId), lastB = br.last.get(ga.selfId);
  ok('v4 wire: a body state with bits A / B (fl up to 1023) reaches the host and the other guest unchanged', same(lastH, body(1010, 512 | 1)) && same(lastB, body(1010, 512 | 1)) &&
    hr.states.some(([f, o]) => f === ga.selfId && o.fl === (256 | 16)), [lastH, lastB]);
  ga.setState(Object.assign(body(1012, 1023), { v: 3 }));
  await clock.run(300);
  ok('v4 wire: the transport hands a v3 state over as it is (the engine\'s netStateIn is what refuses it)', hr.last.get(ga.selfId).v === 3 && hr.last.get(ga.selfId).fl === 1023);
  // reliable: qk at the landing between shots (one with the cat's a:1), in order, exactly once, to the host only
  const qk = { t: 'qk', x: 101.3, y: 200, ep: 2 };
  const msgs = [{ t: 'shot', n: 7, x: 101.3, y: 150.2, f: 1, ep: 2 }, qk, { t: 'shot', n: 8, x: 101.3, y: 160, f: -1, ep: 2, a: 1 }];
  ok('v4 wire: qk is a small message (' + JSON.stringify(qk).length + ' B, far under the 900-byte limit)', JSON.stringify(qk).length <= 48);
  for (const m of msgs) ok('v4 wire: guest -> host send ' + m.t + ' accepted', ga.send(hs.selfId, m) === true);
  await clock.run(800);
  const got = hr.msgs.filter(([f]) => f === ga.selfId).map(([, m]) => m);
  ok('v4 wire: shot, qk, shot (a:1) reach the host intact, in order, once', same(got, msgs), got);
  ok('v4 wire: ... and only the host (direct messages)', !br.msgs.some(([f, m]) => f === ga.selfId && m && (m.t === 'qk' || m.t === 'shot')));
  // a host snapshot at SNAP_LIMIT (3400 B) is accepted and arrives whole on both guests
  const snap = { v: 4, R: { n: 4 }, g: { id: 3, pad: 'x'.repeat(3400 - 42) } };
  const n = JSON.stringify(snap).length;
  ok('v4 wire: a ' + n + '-byte host snapshot (SNAP_LIMIT) is accepted by setState', n >= 3395 && n <= 3405 && hs.setState(snap) === true, n);
  await clock.run(600);
  const ar = record(ga); hs.setState(Object.assign({}, snap, { g: Object.assign({}, snap.g, { id: 4 }) })); await clock.run(600);
  ok('v4 wire: ... and arrives whole on both guests', br.last.get(hs.selfId) && br.last.get(hs.selfId).g.pad.length === snap.g.pad.length && ar.last.get(hs.selfId) && ar.last.get(hs.selfId).g.id === 4);
  gb.leave(); ga.leave(); hs.leave();
  await clock.run(1500);
}

// ==================================================================================== main
(async () => {
  const t0 = Date.now();
  await testRoom();
  await testRoomFlap();
  await testRoomSlowHost();
  await testPeer();
  await testBc();
  await testV4Wire();
  ok('no timer callback threw', timerErrors.length === 0, timerErrors.map((e) => String(e && e.message)).slice(0, 3));
  ok('no unhandled promise rejection', unhandled.length === 0, unhandled.map((e) => String(e && (e.code || e.message))).slice(0, 3));
  if (VERBOSE && warnings.length) console.log('warnings:', [...new Set(warnings)].join(' | '));
  console.log(`net-node-test: ${pass} passed, ${fails} failed, ${(clock.now() / 1000).toFixed(1)} s virtual (${clock.fired} timers) in ${((Date.now() - t0) / 1000).toFixed(1)} s real (seed ${SEED})`);
  console.log(fails ? `NET NODE FAIL (${fails})` : 'NET NODE OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('NET NODE CRASH ' + (e && e.stack ? e.stack : e)); process.exit(2); });
