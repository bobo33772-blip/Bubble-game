// Node unit tests for src/net.js (PG.Net) against FAKES of its four transports, on a virtual clock
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
//   - fake WebSocket (one TCP stream per page: in order, never dropped, a modelled uplink, cuts) in front of the REAL relay
//     room logic (cloudflare/src/room.js behind relay.js's gate) for the 'ws' transport and its fallback to 'peer' (testWs).
//   - v4 kits on the wire (testV4Wire): the engine's body bits / qk / a:1 / NET_V / SNAP_LIMIT in game.js and those
//     shapes carried intact by PG.Net (the measured snapshot sizes are kits-net.js's).
// Prints "PASS/FAIL <name>" and "NET NODE OK" / "NET NODE FAIL (n)"; exit code 1 on failure.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

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
  ok('bc: fromQuery parses ?net=bc&lat=80&jit=30&drop=0.1', same(Q.Net.fromQuery(), { transport: 'bc', net: { latency: 80, jitter: 30, drop: 0.1 }, relay: null }), Q.Net.fromQuery());
  ok('bc: fromQuery clamps and ignores junk', same(Q.Net.fromQuery('?net=evil&lat=-5&drop=7'), { transport: null, net: { latency: 0, jitter: 0, drop: 0.95 }, relay: null }), Q.Net.fromQuery('?net=evil&lat=-5&drop=7'));
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

// ==================================================================================== FAKE WebSocket + the REAL relay core
// (design/relay.md 11.2) The relay is cloudflare/src/room.js itself (RoomCore) behind cloudflare/src/relay.js's gate(), on
// the virtual clock: each page's FakeWebSocket is one TCP stream - frames in FIFO order each way with latency + jitter,
// never dropped, never reordered; bufferedAmount models the uplink (rate in bytes/s, stall(ms): nothing leaves for a
// while, then everything queued goes at once); cut() is an abrupt network death (1006 here; the relay hears of it after a
// latency, or never: {half: true}); the keepalive {"k":"p"} is answered by the "runtime" (as the auto-response) and
// remembered for the dead-seat sweep. Relay switches: refuse (every connect ends 1006 before the handshake), silent (a
// connect never answers), cap (4503 'cap'), takenNext (the next host connect gets 4409), restart().
const WALL = { base: Date.UTC(2026, 9, 28, 23, 0, 0), skew: 0 };
class VDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(WALL.base + WALL.skew + clock.now()); }
  static now() { return WALL.base + WALL.skew + clock.now(); }
}
async function makeWsRelay(o) {
  const CFS = path.join(__dirname, '..', 'cloudflare', 'src');
  const Rm = await import(pathToFileURL(path.join(CFS, 'room.js')).href);
  const Rl = await import(pathToFileURL(path.join(CFS, 'relay.js')).href);
  const net = Object.assign({ latency: 25, jitter: 10, refuse: 0, silent: false, cap: false, takenNext: 0, connects: 0, pings: 0, rooms: new Map(), clients: [] }, o || {});
  const env = { ORIGINS: 'w=https://bubble-c3ad4.web.app p=https://bubble-c3ad4--*.web.app', ALLOW_LOCALHOST: '0' };
  const delay = () => net.latency + rng() * net.jitter;
  const coreFor = (key) => {
    let c = net.rooms.get(key);
    if (!c) {
      c = new Rm.RoomCore({ send: (s, str) => s.deliver(str), close: (s, code, reason) => s.shut(code, reason), save: (s, a) => { s.att = a; }, heard: (s) => s.heardAt, rand: (n) => randLabel(n), now: () => clock.now() });
      net.rooms.set(key, c);
    }
    return c;
  };
  class FakeWebSocket {
    constructor(url, origin) {
      this.url = String(url); this.origin = origin === undefined ? 'https://bubble-c3ad4.web.app' : origin;
      this.readyState = 0; this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
      this.up = orderedLink(); this.down = orderedLink(); this.q = []; this.lastLeave = 0; this.stallUntil = 0; this.uplink = net.uplink || Infinity;
      this.dead = false; this.srv = null; this.core = null; this.got = []; this.sent = [];
      net.clients.push(this); net.connects++;
      clock.add(() => { this.handshake().catch((e) => timerErrors.push(e)); }, delay());
    }
    get bufferedAmount() { const t = clock.now(); this.q = this.q.filter((e) => e.leave > t); return this.q.reduce((a, e) => a + e.bytes, 0); }
    finish(code, reason) { if (this.readyState === 3) return; this.readyState = 3; if (typeof this.onclose === 'function') this.onclose({ code, reason: reason || '' }); }
    opened() { this.readyState = 1; if (typeof this.onopen === 'function') this.onopen({}); }
    async handshake() {
      if (this.dead || this.readyState !== 0 || net.silent) return;
      if (net.refuse) { this.dead = true; this.finish(net.refuse, ''); return; }
      const u = new URL(this.url.replace(/^ws/, 'http'));
      const H = { upgrade: 'websocket', origin: this.origin, 'cf-connecting-ip': '192.0.2.1' };
      const g = await Rl.gate({ url: 'https://relay.test' + u.pathname + u.search, method: 'GET', headers: { get: (n) => (H[String(n).toLowerCase()] === undefined || H[String(n).toLowerCase()] === null ? null : H[String(n).toLowerCase()]) } }, env, { limiter: () => true });
      // (a refusal: the Worker accepts its own socket and closes it - the page sees open, then the code)
      const refuse = (code, reason) => { this.opened(); this.down.push(clock.now() + delay(), () => this.finish(code, reason)); };
      if (!g.ok) { refuse(g.close || 1006, g.reason); return; }
      if (net.cap) { refuse(4503, 'cap'); return; }
      if (net.takenNext && g.role === 'h') { net.takenNext--; refuse(4409, 'taken'); return; }
      const core = coreFor(g.space + ':' + g.code);
      const ws = this;
      const srv = {
        client: ws, att: null, heardAt: 0, closed: false, inS: 0, inAll: 0,
        deliver(str) { if (srv.closed) return; ws.down.push(clock.now() + delay(), () => { if (ws.dead || ws.readyState !== 1) return; ws.got.push(str); if (typeof ws.onmessage === 'function') ws.onmessage({ data: str }); }); },
        shut(code, reason) { if (srv.closed) return; srv.closed = true; ws.down.push(clock.now() + delay(), () => { if (!ws.dead) ws.finish(code, reason); }); },
      };
      this.srv = srv; this.core = core;
      this.opened();
      const no = core.open(srv, { role: g.role, id: u.searchParams.get('id') || '', tok: u.searchParams.get('tok') || '' });
      if (no) srv.shut(no.code, no.reason);
    }
    send(str) {
      if (this.readyState === 0) throw new Error('InvalidStateError: still connecting');
      if (this.readyState !== 1 || this.dead) return;
      str = String(str);
      this.sent.push(str);
      const bytes = Buffer.byteLength(str), t = clock.now();
      const leave = Math.max(t, this.lastLeave, this.stallUntil) + (this.uplink === Infinity ? 0 : bytes * 1000 / this.uplink);
      this.lastLeave = leave; this.q.push({ bytes, leave });
      this.up.push(leave + delay(), () => this.arrive(str));
    }
    arrive(str) {
      const srv = this.srv;
      if (this.dead || !srv || srv.closed) return;
      srv.inAll++;
      if (str === Rm.PING) { srv.heardAt = clock.now(); net.pings++; srv.deliver(Rm.PONG); return; }   // (the auto-response)
      if (/^\{"k":"s"/.test(str)) srv.inS++;
      this.core.message(srv, str);
    }
    close(code) {
      if (this.readyState >= 2) return;
      if (this.readyState === 0 || !this.srv) { this.dead = true; this.readyState = 2; clock.add(() => this.finish(1006, ''), 1); return; }
      this.readyState = 2;
      const leave = Math.max(clock.now(), this.lastLeave, this.stallUntil);
      this.up.push(leave + delay(), () => {
        const srv = this.srv;
        if (srv && !srv.closed) { srv.closed = true; this.core.closed(srv); }
        this.down.push(clock.now() + delay(), () => this.finish(code || 1000, ''));
      });
    }
    // the network dies under this page: 1006 here; the relay hears of it after a latency, or never ({half: true})
    cut(opt) {
      if (this.dead) return;
      this.dead = true;
      clock.add(() => this.finish(1006, ''), 1);
      const srv = this.srv;
      if (srv && !(opt && opt.half)) clock.add(() => { if (!srv.closed) { srv.closed = true; this.core.closed(srv); } }, net.latency);
    }
    stall(ms) { this.stallUntil = clock.now() + ms; }
  }
  net.WS = (origin) => class extends FakeWebSocket { constructor(u) { super(u, origin); } };
  net.Raw = FakeWebSocket;
  net.restart = () => { for (const c of net.clients) if (c.srv && !c.srv.closed) { c.srv.closed = true; const w = c; c.down.push(clock.now() + delay(), () => { if (!w.dead) w.finish(1012, 'restart'); }); } net.rooms.clear(); };
  net.of = (sess) => net.clients.filter((c) => c.srv && !c.srv.closed && c.got.length && JSON.parse(c.got[0]).id === sess.selfId).pop() || null;
  net.Rm = Rm;
  return net;
}

// ==================================================================================== TESTS: ws (the relay)
async function testWs() {
  const SRCWS = SRC.match(/ws: \{ stateMs: (\d+), pingMs: (\d+), unstableMs: (\d+), lostMs: (\d+), joinMs: (\d+), connectMs: (\d+), quietMs: (\d+), byeMs: (\d+) \}/);
  ok('ws: TUNE.ws joinMs (12 s) above connectMs (6 s): a ws join timeout always means the relay found the room', SRCWS && +SRCWS[5] > +SRCWS[6] && +SRCWS[2] === 2000, SRCWS && SRCWS.slice(1));
  const rl = await makeWsRelay();
  const URL0 = 'https://relay.test';
  const mk = (n, o) => {
    o = o || {};
    const ex = { WebSocket: o.noWs ? undefined : rl.WS(o.origin), Date: VDate, location: { search: o.search || '' } };
    if (!o.noRelay) ex.PG_RELAY = o.relay || { url: URL0 };
    if (o.Peer) ex.Peer = o.Peer;
    return loadPage(n, ex);
  };
  // ---- finding the relay (4.2)
  let r = await resolveP(mk('w0').Net.transports());
  ok('ws: transports().ws true with window.PG_RELAY and a WebSocket', r.value && r.value.ws === true && r.value.room === false && r.value.peer === false, r.value);
  r = await resolveP(mk('w0b', { noWs: true }).Net.transports());
  ok('ws: ... false without a WebSocket', r.value && r.value.ws === false);
  r = await resolveP(mk('w0c', { noRelay: true }).Net.transports());
  ok('ws: ... false without PG_RELAY', r.value && r.value.ws === false);
  for (const bad of [{ url: 'http://evil.example' }, { url: 'javascript:alert(1)' }, { url: 'https://relay.test/r?x=1' }, { url: 'wss://relay.test' }, { url: URL0, space: 'q' }, 'https://relay.test', [URL0], { url: 5 }]) {
    r = await resolveP(mk('w0d', { relay: bad }).Net.transports());
    ok('ws: a bad PG_RELAY gives no ws: ' + JSON.stringify(bad), r.value && r.value.ws === false);
  }
  const Lq = mk('w0e', { noRelay: true, search: '?relay=ws://localhost:1/ws' });
  r = await resolveP(Lq.Net.transports());
  ok('ws: a test page\'s ?relay=ws://localhost:1/ws is accepted (fromQuery().relay)', r.value && r.value.ws === true && Lq.Net.fromQuery().relay === 'ws://localhost:1/ws', Lq.Net.fromQuery());
  for (const q of ['?relay=wss://evil.example', '?relay=ws://localhost.evil.example/ws', '?relay=http://localhost:1', '?relay=ws://127.0.0.1:1/a?b']) {
    const P = mk('w0f', { noRelay: true, search: q });
    r = await resolveP(P.Net.transports());
    ok('ws: ' + q + ' is ignored', r.value && r.value.ws === false && P.Net.fromQuery().relay === null);
  }
  r = await resolveP(mk('w0g').Net.lobby('ws'));
  ok('ws: no lobby on ws', r.value === null);
  ok('ws: PG.Net.relay() -> {on, state ok, until 0}', same(mk('w0h').Net.relay(), { on: true, state: 'ok', until: 0 }) && mk('w0i', { noRelay: true }).Net.relay().on === false);

  // ---- host, join, roster
  const H = mk('whost'), G1 = mk('wg1'), G2 = mk('wg2'), G3 = mk('wg3'), G4 = mk('wg4'), X = mk('wx');
  r = await resolveP(H.Net.host({ transport: 'ws', code: 'w7w7' }));
  const hs = r.value;
  ok('ws: host on a code (the relay issues the seat id)', hs && hs.code === 'w7w7' && /^s[a-z0-9]{11}$/.test(hs.selfId) && hs.transport === 'ws' && hs.fallback === null, r.error && r.error.code);
  if (!hs) return;
  r = await resolveP(X.Net.host({ transport: 'ws', code: 'w7w7' }));
  ok('ws: an explicit taken code -> unavailable (taken)', r.error && r.error.code === 'unavailable' && r.error.reason === 'taken', r.error && [r.error.code, r.error.reason]);
  rl.takenNext = 1;
  r = await resolveP(X.Net.host({ transport: 'ws' }));
  ok('ws: a generated code re-rolls past a taken one', r.value && /^[a-z0-9]{4}$/.test(r.value.code) && rl.takenNext === 0, r.error && r.error.code);
  if (r.value) r.value.leave();
  const hr = record(hs);
  const gs = [];
  for (const G of [G1, G2, G3]) { r = await resolveP(G.Net.join({ transport: 'ws', code: 'W7W7' })); ok('ws: ' + G.name + ' joins', !!r.value, r.error && r.error.code); gs.push(r.value); }
  if (gs.some((s) => !s)) return;
  const [s1, s2, s3] = gs;
  const recs = gs.map(record);
  await clock.run(400);
  ok('ws: rosters agree everywhere (relay-issued ids)', [s1, s2, s3].every((s) => idsOf(s) === idsOf(hs)) && hs.peers().length === 4, [hs, s1, s2, s3].map(idsOf));
  r = await resolveP(G4.Net.join({ transport: 'ws', code: 'w7w7' }));
  ok('ws: the 5th -> full (the host core\'s answer)', r.error && r.error.code === 'full' && r.error.reason === 'full', r.error && r.error.code);
  await clock.run(300);
  // two silent extra sockets: 6 in the room; a 7th page -> 4430 from the relay
  const raws = [new rl.Raw(URL0.replace('https', 'wss') + '/r/w/w7w7?v=1&role=g'), new rl.Raw(URL0.replace('https', 'wss') + '/r/w/w7w7?v=1&role=g')];
  await clock.run(200);
  r = await resolveP(G4.Net.join({ transport: 'ws', code: 'w7w7' }));
  ok('ws: a 7th socket -> full (the relay\'s 6-socket cap)', r.error && r.error.code === 'full' && rl.rooms.get('w:w7w7').info().seats === 6, r.error && r.error.code);
  r = await resolveP(G4.Net.join({ transport: 'ws', code: 'nnnn' }));
  ok('ws: an unknown code -> not_found', r.error && r.error.code === 'not_found', r.error && r.error.code);
  // ---- states
  for (let f = 0; f < 60; f++) { hs.setState({ t: f }); s1.setState({ g: 1, f }); await clock.run(1000 / 60); }
  await clock.run(400);
  ok('ws: host state -> guests (latest)', recs.every((rc) => rc.last.get(hs.selfId) && rc.last.get(hs.selfId).t === 59));
  ok('ws: guest state -> host and the other guests, stamped with the guest id', hr.last.get(s1.selfId).f === 59 && recs[1].last.get(s1.selfId).f === 59 && recs[2].last.get(s1.selfId).f === 59 && !recs[0].last.has(s1.selfId));
  const rawGot = (w) => w.got.map((x) => JSON.parse(x));
  ok('ws: a stranger socket receives no states', raws.every((w) => !rawGot(w).some((m) => m.k === 's')));
  const rh = raws[0];
  rh.send(JSON.stringify({ k: 's', q: 1, d: { evil: 1 } }));
  rh.send(JSON.stringify({ k: 'r', t: '*', d: { u: { k: 'evil' } } }));
  await clock.run(300);
  ok('ws: a stranger\'s states are dropped and its * reaches the host only (no guest hears it)', !hr.states.some(([, o]) => o && o.evil) && recs.every((rc) => !rc.msgs.some(([, m]) => m && m.k === 'evil')));
  // ---- reliable
  await Promise.all([sendStream(hs, '*', 'hb', 100, 5, 20), sendStream(s1, '*', 'g1b', 60, 4, 20), sendStream(s2, s3.selfId, 'g2to3', 30, 3, 20), sendStream(s3, hs.selfId, 'g3h', 30, 3, 20)]);
  await until(() => recs.every((rc) => seqOf(rc, hs.selfId, 'hb').length >= 100) && seqOf(recs[2], s2.selfId, 'g2to3').length >= 30 && seqOf(recs[2], s1.selfId, 'g1b').length >= 60, 10000);
  await clock.run(500);
  ok('ws: host broadcast in order, once', recs.every((rc) => same(seqOf(rc, hs.selfId, 'hb'), range(100))));
  ok('ws: guest broadcast in order, once, to the host and the other guests', same(seqOf(hr, s1.selfId, 'g1b'), range(60)) && same(seqOf(recs[1], s1.selfId, 'g1b'), range(60)) && same(seqOf(recs[2], s1.selfId, 'g1b'), range(60)) && !seqOf(recs[0], s1.selfId, 'g1b').length);
  ok('ws: guest -> guest direct only to the target', same(seqOf(recs[2], s2.selfId, 'g2to3'), range(30)) && seqOf(recs[0], s2.selfId, 'g2to3').length === 0 && seqOf(hr, s2.selfId, 'g2to3').length === 0);
  ok('ws: guest -> host direct', same(seqOf(hr, s3.selfId, 'g3h'), range(30)) && seqOf(recs[0], s3.selfId, 'g3h').length === 0);
  await clock.run(2500);
  ok('ws: rtt measured (>= 4 one-way hops of 25 ms)', typeof s1.stats().rttMs === 'number' && s1.stats().rttMs >= 100 && s1.stats().transport === 'ws', s1.stats());
  for (const w of raws) w.close(1000);
  const lastWord = lastBeforeLeave(hs, s3);
  s3.send(hs.selfId, { k: 'gg-last' });
  s3.leave();
  await clock.run(600);
  ok('ws: a guest leaving updates every roster', hs.peers().length === 3 && s1.peers().length === 3 && s2.peers().length === 3);
  ok('ws: a reliable message sent right before leave() arrives before the player is gone', lastWord.join() === 'msg,gone', lastWord);
  ok('ws: the leaver said bye: its socket closed 1000', rl.clients.some((c) => c.sent.includes('{"k":"bye"}') && c.readyState === 3));
  const c2 = rl.of(s2);
  c2.cut();
  await clock.run(800);
  ok('ws: a guest whose socket dies is dropped and sees closed:lost', hs.peers().length === 2 && recs[1].status.includes('closed:lost'), [hs.peers().length, recs[1].status]);
  hs.leave();
  await clock.run(600);
  ok('ws: host leaving -> guests closed:host_left', recs[0].status.includes('closed:host_left'), recs[0].status);
  ok('ws: ... the room and its code are free', !rl.rooms.get('w:w7w7') || rl.rooms.get('w:w7w7').info().seats === 0);

  // ---- a host whose socket dies with guests in the room; a relay restart
  const pair = async (code) => {
    const A = mk('wa-' + code), B = mk('wb-' + code);
    const a = (await resolveP(A.Net.host({ transport: 'ws', code }))).value;
    const b = a ? (await resolveP(B.Net.join({ transport: 'ws', code }))).value : null;
    return { A, B, a, b, ra: a && record(a), rb: b && record(b) };
  };
  {
    const p = await pair('k1k1');
    if (ok('ws: a second room', p.a && p.b)) {
      rl.of(p.a).cut();
      await clock.run(800);
      ok('ws: the host\'s socket dies with a guest in the room -> the guest closed:lost (no re-seat with guests)', p.rb.status.includes('closed:lost') && p.ra.status.includes('closed:lost'), [p.ra.status, p.rb.status]);
    }
  }
  {
    const p = await pair('k2k2'), q = await pair('k3k3');
    rl.restart();
    await clock.run(800);
    ok('ws: a relay restart (every socket 1012) -> everyone closed:lost', [p.ra, p.rb, q.ra, q.rb].every((x) => x && x.status.includes('closed:lost')), [p.ra, p.rb].map((x) => x && x.status));
  }
  // ---- junk / oversize / rate from one page close only that page
  for (const [what, act] of [
    ['junk', (w) => { for (let i = 0; i < 8; i++) w.send('{nope'); }],
    ['oversize', (w) => { for (let i = 0; i < 3; i++) w.send(JSON.stringify({ k: 'r', t: '*', d: 'x'.repeat(5000) })); }],
    ['rate', async (w, n) => { for (let i = 0; i < 1100; i++) { w.send(JSON.stringify({ k: 's', q: n + i, d: 1 })); if (i % 15 === 14) await clock.run(100); } }],
  ]) {
    const A = mk('wj-a-' + what), B = mk('wj-b-' + what), C = mk('wj-c-' + what), code = { junk: 'j1j1', oversize: 'j2j2', rate: 'j3j3' }[what];
    const a = (await resolveP(A.Net.host({ transport: 'ws', code }))).value;
    const b = a && (await resolveP(B.Net.join({ transport: 'ws', code }))).value;
    const c = b && (await resolveP(C.Net.join({ transport: 'ws', code }))).value;
    if (!c) { ok('ws: ' + what + ': a room of 3', false); continue; }
    const ra = record(a), rb = record(b), rc = record(c);
    const cbx = rl.of(b);
    await act(cbx, 1e6);
    if (VERBOSE) console.log(what, 'relay saw', cbx.srv && cbx.srv.inAll, 'closed', cbx.srv && cbx.srv.closed, cbx.readyState);
    await clock.run(1500);
    ok('ws: ' + what + ' from one page closes only that page (closed:lost), the others play on', rb.status.includes('closed:lost') && !ra.status.some((x) => /closed/.test(x)) && !rc.status.some((x) => /closed/.test(x)) && a.peers().length === 2, [ra.status, rb.status, rc.status]);
    a.leave(); await clock.run(500);
  }
  // ---- backpressure, a host alone, the keepalive
  {
    const A = mk('wp-a'), B = mk('wp-b');
    const a = (await resolveP(A.Net.host({ transport: 'ws', code: 'p1p1' }))).value;
    const ca = rl.of(a);
    for (let i = 0; i < 40; i++) { a.setState({ alone: i }); await clock.run(50); }
    ok('ws: a host alone sends no states (design/relay.md 9.3)', ca.srv.inS === 0, ca.srv.inS);
    const b = (await resolveP(B.Net.join({ transport: 'ws', code: 'p1p1' }))).value;
    const rb = b && record(b);
    await clock.run(300);
    ok('ws: ... the first admitted guest still gets the host\'s latest state at once', !!rb && rb.last.get(a.selfId) && rb.last.get(a.selfId).alone === 39, rb && rb.last.get(a.selfId));
    const cb = rl.of(b);
    cb.uplink = 2000;                                          // 2 KB/s: a body of ~600 bytes 30 times a second backs up
    const ra = record(a);
    let sent = 0;
    for (let i = 0; i < 120; i++) { b.setState({ body: i, pad: 'p'.repeat(560) }); if (i % 10 === 0 && b.send(a.selfId, { k: 'bp', i: sent })) sent++; await clock.run(33); }
    ok('ws: backpressure: states skip a beat while more than 8 KB wait (latest wins, the queue stays near 8 KB)', cb.sent.filter((x) => /^\{"k":"s"/.test(x)).length < 60 && cb.bufferedAmount < 12000, [cb.sent.filter((x) => /^\{"k":"s"/.test(x)).length, cb.bufferedAmount]);
    ok('ws: ... a slow uplink that still sends some states stays healthy', !rb.status.includes('error:unstable'), rb.status);
    await clock.run(8000);
    cb.uplink = Infinity;
    cb.stall(4000);                                             // (the uplink stops: nothing leaves for 4 s)
    for (let i = 0; i < 100; i++) { b.setState({ body: 200 + i, pad: 'p'.repeat(560) }); if (i % 10 === 0 && b.send(a.selfId, { k: 'bp', i: sent })) sent++; await clock.run(33); }
    ok('ws: ... health() false once every state was held back for 2 s: the guest shows error:unstable', rb.status.includes('error:unstable'), rb.status);
    await clock.run(6000);
    ok('ws: ... reliable messages never skipped (all arrive, in order) and the link recovers', same(seqOf(ra, b.selfId, 'bp'), range(sent)) && rb.status.includes('open:recovered'), [seqOf(ra, b.selfId, 'bp').length, sent, rb.status]);
    b.leave(); await clock.run(500);
    const before = rl.pings;
    await clock.run(50000);
    ok('ws: a quiet socket sends the keepalive {"k":"p"} after 45 s (answered by the runtime)', rl.pings > before && ca.got.includes('{"k":"P"}'), rl.pings - before);
    a.leave(); await clock.run(500);
  }
  // ---- the host re-seat (8.1)
  {
    const A = mk('wr-a'), B = mk('wr-b');
    const a = (await resolveP(A.Net.host({ transport: 'ws', code: 'r1r1' }))).value;
    const ra = record(a), id = a.selfId;
    rl.of(a).cut();                                            // (KakaoTalk: the OS killed the socket; the relay heard it)
    await clock.run(1500);
    ok('ws: a host alone whose socket dies re-seats with the same id: its session never closes', !ra.status.some((x) => /closed/.test(x)) && a.selfId === id && rl.rooms.get('w:r1r1').info().host === id, ra.status);
    const b = (await resolveP(B.Net.join({ transport: 'ws', code: 'r1r1' }))).value;
    ok('ws: ... a friend then gets in with the code', !!b && a.peers().length === 2);
    if (b) b.leave();
    await clock.run(500);
    rl.of(a).cut({ half: true });                              // (the relay never heard: a half-open seat)
    await clock.run(1500);
    ok('ws: ... and over its own half-open seat (id + tok)', !ra.status.some((x) => /closed/.test(x)) && rl.rooms.get('w:r1r1').info().host === id, ra.status);
    a.leave(); await clock.run(500);
  }
  {
    const A = mk('wr2-a'), Z = mk('wr2-z');
    const a = (await resolveP(A.Net.host({ transport: 'ws', code: 'r2r2' }))).value;
    const ra = record(a);
    rl.refuse = 1006;
    rl.of(a).cut();
    await clock.run(500);
    rl.refuse = 0;
    const z = (await resolveP(Z.Net.host({ transport: 'ws', code: 'r2r2' }))).value;
    await clock.run(4000);
    ok('ws: a re-seat refused (4409: someone else took the code meanwhile) -> closed:lost', !!z && ra.status.includes('closed:lost'), ra.status);
    if (z) z.leave();
    const A3 = mk('wr3-a');
    const a3 = (await resolveP(A3.Net.host({ transport: 'ws', code: 'r3r3' }))).value;
    const r3 = record(a3);
    rl.refuse = 1006;
    rl.of(a3).cut();
    await clock.run(14000);
    ok('ws: ... still re-seating after 14 s (at once, then 1 / 2 / 4 / 8 s)', !r3.status.some((x) => /closed/.test(x)), r3.status);
    await clock.run(4000);
    ok('ws: ... 5 failed tries -> closed:lost', r3.status.includes('closed:lost'), r3.status);
    rl.refuse = 0;
  }
  // ---- an LTE stall on a guest
  {
    const A = mk('ws-a'), B = mk('ws-b');
    const a = (await resolveP(A.Net.host({ transport: 'ws', code: 's1s1' }))).value;
    const b = a && (await resolveP(B.Net.join({ transport: 'ws', code: 's1s1' }))).value;
    if (ok('ws: an LTE room', !!b)) {
      const ra = record(a), rb = record(b);
      rl.of(b).stall(5000);
      let n = 0;
      for (let i = 0; i < 180; i++) { b.setState({ f: i }); if (i % 6 === 0 && b.send(a.selfId, { k: 'lte', i: n })) n++; a.setState({ t: i }); await clock.run(33); }
      await clock.run(3000);
      ok('ws: an LTE stall (the uplink stops 5 s, then delivers): the guest is still in the room', a.peers().length === 2 && !rb.status.some((x) => /closed/.test(x)), rb.status);
      ok('ws: ... no reliable message lost, in order', same(seqOf(ra, b.selfId, 'lte'), range(n)), [seqOf(ra, b.selfId, 'lte').length, n]);
      a.leave(); await clock.run(500);
    }
  }
  // ---- ?net=ws&lat=80&jit=40: in order, never dropped
  {
    const Q = '?net=ws&lat=80&jit=40';
    const A = mk('wl-a', { search: Q }), B = mk('wl-b', { search: Q });
    ok('ws: fromQuery ?net=ws&lat=80&jit=40', same(A.Net.fromQuery(), { transport: 'ws', net: { latency: 80, jitter: 40, drop: 0 }, relay: null }), A.Net.fromQuery());
    const a = (await resolveP(A.Net.host({ transport: 'ws', code: 'l1l1' }))).value;
    const b = a && (await resolveP(B.Net.join({ transport: 'ws', code: 'l1l1' }))).value;
    if (ok('ws: a room over the simulated link', !!b)) {
      const rb = record(b);
      const at = [];
      b.onState((f, o) => { if (o && o.at !== undefined) at.push(clock.now() - o.at); });
      for (let i = 0; i < 90; i++) { a.setState({ t: i, at: clock.now() }); if (i % 3 === 0) a.send('*', { k: 'lat', i: i / 3 }); await clock.run(40); }
      await clock.run(1500);
      const ts = rb.states.filter(([f]) => f === a.selfId).map(([, o]) => o.t);
      ok('ws: simulated delays keep the order and never drop (states every one, reliable all 30)', same(Array.from(new Set(ts)), range(90)) && same(seqOf(rb, a.selfId, 'lat'), range(30)), [new Set(ts).size, seqOf(rb, a.selfId, 'lat').length]);
      const m = at.reduce((x, y) => x + y, 0) / Math.max(1, at.length);
      ok('ws: ... one-way ~ 2 x (80 + U(0,40)) + 2 relay hops', m > 200 && m < 380, m.toFixed(0));
      a.leave(); await clock.run(500);
    }
  }

  // ---- falling back to 'peer' (4.5, 4.6)
  const pn = makePeerNet({ latency: 20, jitter: 10 });
  const mkF = (n, o) => mk(n, Object.assign({ Peer: pn.Peer }, o || {}));
  {
    const A = mkF('wf-a'), B = mkF('wf-b');
    rl.refuse = 1006;
    const c0 = rl.connects;
    r = await resolveP(A.Net.host({ transport: ['ws', 'peer'], code: 'f1f1' }));
    ok('ws: [ws, peer] with the relay refusing (1006) -> a peer room, fallback down', r.value && r.value.transport === 'peer' && r.value.fallback === 'down' && A.Net.relay().state === 'down', r.value ? [r.value.transport, r.value.fallback] : r.error && r.error.code);
    const a = r.value;
    rl.refuse = 0;
    const c1 = rl.connects;
    r = await resolveP(A.Net.host({ transport: ['ws', 'peer'], code: 'f2f2' }));
    ok('ws: ... the next host within 60 s skips ws (no socket at all)', r.value && r.value.transport === 'peer' && r.value.fallback === 'down' && rl.connects === c1 && c1 === c0 + 1, [rl.connects - c1]);
    if (r.value) r.value.leave();
    r = await resolveP(B.Net.join({ transport: ['ws', 'peer'], code: 'f1f1' }));
    ok('ws: a joiner: ws not_found -> peer finds the room', r.value && r.value.transport === 'peer' && r.value.fallback === null, r.value ? r.value.transport : r.error && r.error.code);
    if (r.value) r.value.leave();
    // a joiner whose relay memory says down (its own host attempt failed 10 s earlier) still tries ws and finds a ws room
    const W1 = mk('wf-w1');
    const ws1 = (await resolveP(W1.Net.host({ transport: 'ws', code: 'f3f3' }))).value;
    await clock.run(10000);
    const c2 = rl.connects;
    r = await resolveP(A.Net.join({ transport: ['ws', 'peer'], code: 'f3f3' }));
    ok('ws: a joiner whose memory says down still opens a socket and finds a ws room', r.value && r.value.transport === 'ws' && rl.connects === c2 + 1 && A.Net.relay().state === 'ok', r.value ? r.value.transport : r.error && r.error.code);
    if (r.value) r.value.leave();
    if (ws1) ws1.leave();
    if (a) a.leave();
    await clock.run(500);
  }
  {
    const A = mkF('wf2-a'), B = mkF('wf2-b'), C = mkF('wf2-c');
    rl.cap = true;
    r = await resolveP(A.Net.host({ transport: ['ws', 'peer'], code: 'f4f4' }));
    const nextUtc = (Math.floor(VDate.now() / 86400000) + 1) * 86400000;
    ok('ws: a 4503 cap -> a peer room, fallback cap, the relay capped until the next 00:00 UTC (09:00 KST)', r.value && r.value.transport === 'peer' && r.value.fallback === 'cap' && A.Net.relay().state === 'cap' && A.Net.relay().until === nextUtc, [r.value && r.value.fallback, A.Net.relay()]);
    const a = r.value;
    r = await resolveP(B.Net.join({ transport: ['ws', 'peer'], code: 'zzz9' }));
    ok('ws: a join while capped that finds nothing -> not_found with .relay cap (game.js adds capTail)', r.error && r.error.code === 'not_found' && r.error.relay === 'cap', r.error && [r.error.code, r.error.reason, r.error.relay]);
    rl.cap = false;
    WALL.skew += 3600000;
    ok('ws: ... at 00:00 UTC the cap is forgotten by itself', A.Net.relay().state === 'ok' && A.Net.relay().until === 0, A.Net.relay());
    rl.silent = true;
    const t0 = clock.now();
    r = await resolveP(C.Net.host({ transport: ['ws', 'peer'], code: 'f5f5' }));
    ok('ws: a connect that never answers -> peer after ~6 s (connectMs)', r.value && r.value.transport === 'peer' && r.value.fallback === 'down' && clock.now() - t0 >= 6000 && clock.now() - t0 < 8000, [r.value && r.value.transport, clock.now() - t0]);
    rl.silent = false;
    if (r.value) r.value.leave();
    if (a) a.leave();
    await clock.run(500);
  }
  {
    // ws full -> no peer try; both not found -> not_found with .transport
    const p = await pair('f6f6');
    const Ps = [], ps = [];
    for (let i = 0; i < 2; i++) { const P = mkF('wf6-' + i); Ps.push(P); const s = (await resolveP(P.Net.join({ transport: 'ws', code: 'f6f6' }))).value; ps.push(s); }
    const F = mkF('wf6-f'), made = pn.peers.size;
    r = await resolveP(F.Net.join({ transport: ['ws', 'peer'], code: 'f6f6' }));
    ok('ws: a joiner: ws says full -> the search stops (no peer try)', r.error && r.error.code === 'full' && r.error.transport === 'ws' && pn.peers.size === made, r.error && [r.error.code, r.error.transport]);
    r = await resolveP(F.Net.join({ transport: ['ws', 'peer'], code: 'qqq7' }));
    ok('ws: a joiner: both not_found -> not_found from peer', r.error && r.error.code === 'not_found' && r.error.transport === 'peer' && r.error.relay === null, r.error && [r.error.code, r.error.transport]);
    rl.refuse = 1006;
    r = await resolveP(F.Net.join({ transport: ['ws', 'peer'], code: 'qqq7' }));
    ok('ws: a joiner: the relay unreachable and peer not_found -> unavailable, reason relay (joinDown)', r.error && r.error.code === 'unavailable' && r.error.reason === 'relay' && r.error.relay === 'down', r.error && [r.error.code, r.error.reason, r.error.relay]);
    rl.refuse = 0;
    for (const s of ps) if (s) s.leave();
    if (p.b) p.b.leave();
    if (p.a) p.a.leave();
    await clock.run(500);
  }
  {
    // the relay found the room but its host never answers -> timeout, the search stops (joinQuiet)
    const A = mk('wq-a');
    const a = (await resolveP(A.Net.host({ transport: 'ws', code: 'q1q1' }))).value;
    const ca = rl.of(a);
    ca.srv.deliver = () => {};                                   // (the host page hears nothing: a frozen phone)
    const F = mkF('wq-f'), made = pn.peers.size;
    r = await resolveP(F.Net.join({ transport: ['ws', 'peer'], code: 'q1q1' }));
    ok('ws: a ws join timeout (hi came, no welcome) stops the search: timeout from ws, no peer try', r.error && r.error.code === 'timeout' && r.error.transport === 'ws' && pn.peers.size === made, r.error && [r.error.code, r.error.transport]);
    a.leave(); await clock.run(500);
  }
  {
    // window.Peer arriving 2 s after the tap; a 4403 refusal (a preview page asking for the live space)
    const late = makePeerNet({ latency: 20, jitter: 10 });
    const L = mk('wlate', { noRelay: false });
    rl.refuse = 1006;
    clock.add(() => { L.win.Peer = late.Peer; }, 2000);
    r = await resolveP(L.Net.host({ transport: ['ws', 'peer'], code: 'f7f7' }));
    ok('ws: [ws, peer] with window.Peer arriving 2 s after the tap -> the peer entry waits and works', r.value && r.value.transport === 'peer', r.value ? r.value.transport : r.error && [r.error.code, r.error.reason]);
    if (r.value) r.value.leave();
    rl.refuse = 0;
    const O = mkF('worigin', { origin: 'https://bubble-c3ad4--pr9-x.web.app' });
    r = await resolveP(O.Net.host({ transport: ['ws', 'peer'], code: 'f8f8' }));
    ok('ws: a 4403 refusal (a preview origin in the live space) -> peer, fallback down', r.value && r.value.transport === 'peer' && r.value.fallback === 'down', r.value ? [r.value.transport, r.value.fallback] : r.error && r.error.code);
    if (r.value) r.value.leave();
    const P2 = mkF('wspace', { origin: 'https://bubble-c3ad4--pr9-x.web.app', relay: { url: URL0, space: 'p' } });
    r = await resolveP(P2.Net.host({ transport: ['ws', 'peer'], code: 'f9f9' }));
    ok('ws: ... the same preview page in its own space p -> a ws room', r.value && r.value.transport === 'ws' && rl.rooms.has('p:f9f9'), r.value ? r.value.transport : r.error && r.error.code);
    const W2 = mkF('wspace-w');
    r = await resolveP(W2.Net.join({ transport: ['ws', 'peer'], code: 'f9f9' }));
    ok('ws: ... a live page cannot find that preview room (the spaces never meet)', r.error && r.error.code === 'not_found', r.error && r.error.code);
    for (const s of live(P2)) s.leave();
    await clock.run(500);
  }
}
const live = (P) => P.Net._sessions();

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
  // (NET_ONLY=ws,bc,...: only those groups - a quicker loop while working on one transport)
  const only = (process.env.NET_ONLY || '').split(',').filter(Boolean), on = (g) => !only.length || only.includes(g);
  if (on('room')) { await testRoom(); await testRoomFlap(); await testRoomSlowHost(); }
  if (on('peer')) await testPeer();
  if (on('bc')) await testBc();
  if (on('ws')) await testWs();
  if (on('v4')) await testV4Wire();
  ok('no timer callback threw', timerErrors.length === 0, timerErrors.map((e) => String(e && e.message)).slice(0, 3));
  ok('no unhandled promise rejection', unhandled.length === 0, unhandled.map((e) => String(e && (e.code || e.message))).slice(0, 3));
  if (VERBOSE && warnings.length) console.log('warnings:', [...new Set(warnings)].join(' | '));
  console.log(`net-node-test: ${pass} passed, ${fails} failed, ${(clock.now() / 1000).toFixed(1)} s virtual (${clock.fired} timers) in ${((Date.now() - t0) / 1000).toFixed(1)} s real (seed ${SEED})`);
  console.log(fails ? `NET NODE FAIL (${fails})` : 'NET NODE OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('NET NODE CRASH ' + (e && e.stack ? e.stack : e)); process.exit(2); });
