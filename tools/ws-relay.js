// A dependency-free local WebSocket relay for the tests (design/relay.md 11.3): RFC 6455 on Node's http 'upgrade'
// event (the handshake: Sec-WebSocket-Key + the GUID, SHA-1, base64, no extensions; masked client frames with 7/16/64-
// bit lengths, continuation frames, close / ping / pong; unmasked text and close frames out; 64 KB at most a frame).
// It mounts the REAL room logic (cloudflare/src/room.js) behind the REAL gate (cloudflare/src/relay.js, loopback
// origins allowed in every space) at <base>/r/<space>/<code>: tools/serve.js attaches it at /ws, so a test page uses
// ?net=ws&relay=ws://localhost:<port>/ws. It answers the keepalive {"k":"p"} itself, as the Durable Object's
// auto-response does (the room never sees it), and remembers when (the room's dead-seat sweep reads that).
// Admin (GET, the loopback test server only):
//   /ws-admin/kill?code=c     destroy that room's sockets abruptly (no close frame: the pages see 1006)
//   /ws-admin/restart         close every socket with 1012 and forget every room (what a redeploy does)
//   /ws-admin/cap?on=1|0      refuse new connects with 4503 'cap' (the free tier used up)
//   /ws-admin/info            rooms and seats as JSON
// As a module: const r = require('./ws-relay').create({base: '/ws'}); server.on('upgrade', r.upgrade); in the request
// handler `if (r.admin(req, res)) return;`; r.close().
'use strict';
const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const CF = path.join(__dirname, '..', 'cloudflare', 'src');
let modsP = null;
// (cloudflare/package.json says "type": "module": the CommonJS tools load the ES modules with import())
function mods() {
  if (!modsP) modsP = Promise.all([import(pathToFileURL(path.join(CF, 'room.js')).href), import(pathToFileURL(path.join(CF, 'relay.js')).href)]).then(([room, relay]) => ({ room, relay }));
  return modsP;
}

// ---------------------------------------------------------------- one server-side WebSocket
class Conn {
  constructor(socket, head, maxFrame) {
    this.socket = socket; this.max = maxFrame; this.buf = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
    this.parts = null; this.partOp = 0; this.partLen = 0;
    this.closeSent = false; this.ended = false; this.dead = false; this.heardAt = 0; this.att = null;
    this.onText = null; this.onBinary = null; this.onClose = null;
    socket.setNoDelay(true);
    socket.on('data', (d) => { if (this.dead) return; this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d; this.parse(); });
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
    socket.on('end', () => { try { socket.end(); } catch (e) { /* ignore */ } });
    if (this.buf.length) setImmediate(() => this.parse());
  }
  get open() { return !this.ended && !this.closeSent; }
  finish() { if (this.ended) return; this.ended = true; const f = this.onClose; this.onClose = null; if (f) { try { f(); } catch (e) { /* ignore */ } } }
  frame(op, payload) {
    const n = payload.length;
    const h = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
    try { this.socket.write(Buffer.concat([h, payload])); } catch (e) { /* ignore */ }
  }
  send(text) { if (this.open) this.frame(0x1, Buffer.from(String(text), 'utf8')); }
  close(code, reason) {
    if (this.ended || this.closeSent) return;
    this.closeSent = true;
    const r = Buffer.from(String(reason || '').slice(0, 100), 'utf8');
    const p = Buffer.alloc(2 + r.length); p.writeUInt16BE(code || 1000, 0); r.copy(p, 2);
    this.frame(0x8, p);
    // (the client answers with its own close frame, then the socket ends; a client that never does is cut after 2 s)
    setTimeout(() => { if (!this.ended) this.socket.destroy(); }, 2000).unref();
  }
  destroy() { try { this.socket.destroy(); } catch (e) { /* ignore */ } }
  // a protocol error / an oversize frame: close with the code and read nothing more from this socket
  fail(code) { this.close(code, ''); this.dead = true; this.buf = Buffer.alloc(0); try { this.socket.end(); } catch (e) { /* ignore */ } }
  parse() {
    for (;;) {
      const b = this.buf;
      if (this.ended || this.dead || b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; const big = b.readBigUInt64BE(2); len = big > BigInt(this.max + 1) ? this.max + 1 : Number(big); off = 10; }
      if (!masked) { this.fail(1002); return; }                       // client frames must be masked (RFC 6455 5.1)
      if (len > this.max || (op === 0 && this.partLen + len > this.max)) { this.fail(1009); return; }
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4), data = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (op === 0x8) {                                                  // close: answer it, then the socket ends
        const code = data.length >= 2 ? data.readUInt16BE(0) : 1000;
        if (!this.closeSent) { this.closeSent = true; const p = Buffer.alloc(2); p.writeUInt16BE(code >= 1000 && code < 5000 ? code : 1000, 0); this.frame(0x8, p); }
        try { this.socket.end(); } catch (e) { /* ignore */ }
        this.finish();
        return;
      }
      if (op === 0x9) { if (!this.closeSent) this.frame(0xa, data); continue; }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x2) {
        if (this.parts) { this.fail(1002); return; }
        if (!fin) { this.parts = [data]; this.partOp = op; this.partLen = data.length; continue; }
        this.deliver(op, data);
      } else if (op === 0x0) {
        if (!this.parts) { this.fail(1002); return; }
        this.parts.push(data); this.partLen += data.length;
        if (fin) { const all = Buffer.concat(this.parts); const o = this.partOp; this.parts = null; this.partLen = 0; this.deliver(o, all); }
      } else { this.fail(1002); return; }
    }
  }
  deliver(op, data) {
    if (this.closeSent) return;
    try {
      if (op === 0x1) { if (this.onText) this.onText(data.toString('utf8')); } else if (this.onBinary) this.onBinary(data);
    } catch (e) { /* a handler error never breaks the socket */ }
  }
}

// ---------------------------------------------------------------- the relay
function create(opts) {
  opts = opts || {};
  const base = (opts.base || '/ws').replace(/\/+$/, '');
  const env = Object.assign({ ALLOW_LOCALHOST: '1', ORIGINS: '' }, opts.env || {});
  const maxFrame = opts.maxFrame || 65536;
  const rooms = new Map();                          // "<space>:<code>" -> RoomCore
  const conns = new Set();
  const state = { cap: false, connects: 0, refused: 0 };
  let limiter = null;
  const ABC = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const rand = (n) => { const b = crypto.randomBytes(n); let s = ''; for (let i = 0; i < n; i++) s += ABC[b[i] % 36]; return s; };
  const io = () => ({
    send: (c, s) => c.send(s),
    close: (c, code, reason) => c.close(code, reason),
    save: (c, a) => { c.att = a; },
    heard: (c) => c.heardAt,
    rand,
    now: () => Date.now(),
  });
  function httpRefuse(socket, status, text) {
    try { socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`); } catch (e) { /* ignore */ }
  }
  async function upgrade(req, socket, head) {
    socket.on('error', () => {});
    let u;
    try { u = new URL(req.url, 'http://localhost'); } catch (e) { httpRefuse(socket, 400, 'bad request'); return; }
    if (u.pathname !== base && !u.pathname.startsWith(base + '/')) { httpRefuse(socket, 404, 'not found'); return; }
    const key = req.headers['sec-websocket-key'];
    if (!key || req.headers['sec-websocket-version'] !== '13') { httpRefuse(socket, 400, 'not a websocket handshake'); return; }
    const { room: R, relay: M } = await mods();
    if (!limiter) limiter = M.makeLimiter();
    // the Worker's own gate, on the path below the base, with the request's headers
    const fake = { url: 'http://relay.local' + (u.pathname.slice(base.length) || '/') + u.search, method: req.method, headers: { get: (n) => { const v = req.headers[String(n).toLowerCase()]; return v === undefined ? null : String(v); } } };
    const g = await M.gate(fake, env, { limiter, now: () => Date.now() });
    if (g.http) { httpRefuse(socket, g.http, 'refused'); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    try { socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`); } catch (e) { return; }
    const c = new Conn(socket, head, maxFrame);
    conns.add(c);
    state.connects++;
    if (!g.ok || state.cap) { state.refused++; c.onClose = () => conns.delete(c); c.close(g.ok ? 4503 : g.close, g.ok ? 'cap' : g.reason); return; }
    const rk = g.space + ':' + g.code;
    let core = rooms.get(rk);
    if (!core) { core = new R.RoomCore(io()); rooms.set(rk, core); }
    c.room = rk; c.core = core;
    c.onClose = () => { conns.delete(c); core.closed(c); if (rooms.get(rk) === core && !core.info().seats) rooms.delete(rk); };
    c.onText = (s) => { if (s === R.PING) { c.heardAt = Date.now(); c.send(R.PONG); return; } core.message(c, s); };
    c.onBinary = (b) => core.message(c, b);
    const no = core.open(c, { role: g.role, id: u.searchParams.get('id') || '', tok: u.searchParams.get('tok') || '' });
    if (no) { state.refused++; c.close(no.code, no.reason); }
  }
  function info() {
    const out = {};
    for (const [k, core] of rooms) out[k] = core.info();
    return { rooms: out, sockets: conns.size, cap: state.cap, connects: state.connects, refused: state.refused };
  }
  // the admin routes (GET, loopback test servers only) -> true when handled
  function admin(req, res) {
    let u;
    try { u = new URL(req.url, 'http://localhost'); } catch (e) { return false; }
    if (!u.pathname.startsWith('/ws-admin/')) return false;
    const reply = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    const what = u.pathname.slice('/ws-admin/'.length);
    if (what === 'info') { reply(200, info()); return true; }
    if (what === 'kill') {
      const code = u.searchParams.get('code') || '';
      let n = 0;
      for (const c of Array.from(conns)) if (c.room && c.room.endsWith(':' + code)) { c.destroy(); n++; }
      reply(200, { killed: n }); return true;
    }
    if (what === 'restart') {
      const n = conns.size;
      for (const c of Array.from(conns)) { c.onClose = null; c.close(1012, 'restart'); conns.delete(c); }
      rooms.clear();
      reply(200, { closed: n }); return true;
    }
    if (what === 'cap') { state.cap = u.searchParams.get('on') === '1'; reply(200, { cap: state.cap }); return true; }
    reply(404, { error: 'no such admin route' });
    return true;
  }
  function close() { for (const c of Array.from(conns)) c.destroy(); conns.clear(); rooms.clear(); }
  return { upgrade: (req, socket, head) => { upgrade(req, socket, head).catch(() => { try { socket.destroy(); } catch (e) { /* ignore */ } }); }, admin, info, close, ready: mods };
}

module.exports = { create };
