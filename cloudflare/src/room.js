// 뽀득뽀득 목욕탕 relay: the logic of ONE room (design/relay.md 2 and 3.6). The Durable Object in room-do.js runs one of
// these per room code; the local test relay (tools/ws-relay.js) and the node tests run the very same file. It forwards
// JSON text frames between a room's host page and its guests and knows nothing of the game: no game logic, no storage.
//   - seats: the relay issues every seat id ('s' + 11 of [a-z0-9]) and stamps every forwarded frame with its sender (f)
//   - routing (2.3): "members" are the guests in the host's last {k:'m'} frame; a stranger (a guest not admitted yet)
//     talks to the host only, the host may unicast to anyone seated
//   - caps (2.6): 6 sockets, frames up to 4,096 characters, a token bucket per socket (100, +50/s: over it states are
//     dropped, reliable frames pass, 5 s of sustained excess closes), junk counted per minute, strangers 8 frames / 20 s
//   - lazy time rules (2.4): no timer anywhere (timers keep a Durable Object from hibernating): the dead-seat sweep
//     (150 s of silence), the stranger limit and the forgotten-room close (30 min below 10 frames/s) are checked when
//     the next connect or frame arrives
//   - the host re-seat (8.1): role=h&id=<old id>&tok=<its tok> into an empty room, or over its own half-open seat
// io: {send(sock, str), close(sock, code, reason), save(sock, attachment|null), heard(sock) -> ms|0 (the last keepalive
// the runtime answered by itself), rand(n) -> n of [a-z0-9], now() -> ms, seats?: [[sock, attachment]] (a woken object)}

export const RELAY_V = 1;
export const MAX_SOCKS = 6, MAX_MEMBERS = 3, FRAME_MAX = 4096;
// the bucket: BUCKET tokens, REFILL a second, one per frame. A frame that finds none is "over"; over frames for OVER_MS in
// a row - no gap of more than OVER_GAP between two of them (TCP delivers in bursts: a gap test, not a refill test) - close
export const BUCKET = 100, REFILL = 50, OVER_MS = 5000, OVER_GAP = 1000;
export const JUNK_BIG = 3, JUNK_ANY = 8, JUNK_MS = 60000;
export const STRANGER_MAX = 8, STRANGER_MS = 20000;
// IDLE_GAP: nothing at all arrived for this long - the object could have hibernated (a Durable Object is rebuilt with
// fresh clocks then): the forgotten-room clock restarts too, so a host alone that waited is never "forgotten"
export const DEAD_MS = 150000, IDLE_RATE = 10, IDLE_MS = 1800000, IDLE_GAP = 60000;
export const C_HOST_GONE = 4001, C_BAD = 4400, C_ORIGIN = 4403, C_NO_HOST = 4404, C_GONE = 4408, C_TAKEN = 4409,
  C_BIG = 4413, C_VERSION = 4426, C_RATE = 4429, C_FULL = 4430, C_DOWN = 4503;
export const SEAT_RE = /^s[a-z0-9]{11}$/;
export const TOK_RE = /^[a-z0-9]{16}$/;
// the keepalive and its answer (the Durable Object registers them as its auto-response, 3.5)
export const PING = '{"k":"p"}', PONG = '{"k":"P"}';
const T_RE = /^[A-Za-z0-9_.:-]{1,128}$/;      // net.js's ID_RE: a well-formed 't' (a seat that may not be there)
const MINUTE = 60000;

export class RoomCore {
  constructor(io) {
    this.io = io;
    this.bySock = new Map();
    this.byId = new Map();
    this.host = null;
    this.members = [];                          // guest ids, in the host's order
    const t = io.now();
    this.minAt = t; this.minN = 0; this.busyAt = t; this.lastAt = t;
    if (Array.isArray(io.seats)) this.rebuild(io.seats, t);
  }

  // ---------------------------------------------------------------- a woken object: the seats from their attachments
  rebuild(list, t) {
    let hostM = null;
    for (const e of list) {
      const sock = e && e[0], a = e && e[1];
      if (!a || typeof a !== 'object' || typeof a.i !== 'string' || !SEAT_RE.test(a.i) || (a.r !== 'h' && a.r !== 'g') || this.byId.has(a.i)) continue;
      if (a.r === 'h' && this.host) continue;
      const s = this.seat(sock, a.i, a.r, t, a.r === 'h' && typeof a.k === 'string' && TOK_RE.test(a.k) ? a.k : '');
      if (typeof a.t === 'number' && Number.isFinite(a.t)) s.t = a.t;
      if (a.r === 'h') { this.host = s; hostM = a.m; }
    }
    if (this.host && Array.isArray(hostM)) this.members = this.memberList(hostM);
    // (guests without a host: the host's socket closed while the object slept and the runtime no longer lists it - the
    // room is over, as its guests' cores would find out 12 s later anyway)
    if (!this.host && this.bySock.size) this.closeAll(C_GONE, 'no host');
  }
  seat(sock, id, role, t, tok) {
    const s = { id, role, sock, tok, t, last: t, tokens: BUCKET, tokAt: t, overAt: 0, overLast: 0, junk: 0, junkAt: t, big: 0, sn: 0, sAt: t, q: 0, done: false };
    this.bySock.set(sock, s);
    this.byId.set(id, s);
    return s;
  }
  attachment(s) {
    const a = { i: s.id, r: s.role, t: s.t };
    if (s.role === 'h') { a.k = s.tok; a.m = this.members.slice(); }
    return a;
  }
  newId() {
    for (;;) { const id = 's' + this.io.rand(11); if (!this.byId.has(id)) return id; }
  }
  memberList(l) {
    const out = [];
    for (const id of l) {
      if (out.length >= MAX_MEMBERS) break;
      if (typeof id !== 'string' || out.includes(id)) continue;
      const o = this.byId.get(id);
      if (o && o.role === 'g') out.push(id);
    }
    return out;
  }
  isMember(s) { return s !== this.host && this.members.includes(s.id); }

  // ---------------------------------------------------------------- connect: null = seated ('hi' sent), else {code, reason}
  open(sock, p) {
    const t = this.io.now();
    this.sweep(t, null);
    // (an empty room starts afresh: the idle clock belongs to one room's life, and an object still in memory may serve
    // the code again at once - a host left alone re-seating right after the idle close would otherwise meet the old
    // clock on its first frame, be closed again, re-seat again ...)
    if (!this.bySock.size) { this.busyAt = t; this.minAt = t; this.minN = 0; this.lastAt = t; }
    const role = p && p.role === 'h' ? 'h' : 'g';
    let s = null;
    if (role === 'h') {
      const id = p && typeof p.id === 'string' ? p.id : '', tok = p && typeof p.tok === 'string' ? p.tok : '';
      if (id) {
        // the host re-seat (8.1): an empty room (nobody to impersonate), or my own half-open seat (same id AND tok)
        if (!SEAT_RE.test(id) || !TOK_RE.test(tok)) return { code: C_TAKEN, reason: 'taken' };
        if (!this.bySock.size) s = this.seat(sock, id, 'h', t, tok);
        else if (this.host && this.host.id === id && this.host.tok === tok) {
          s = this.host;
          const old = s.sock;
          this.bySock.delete(old);
          this.io.save(old, null);
          this.io.close(old, C_GONE, 'reseat');
          s.sock = sock; s.last = t; s.tokens = BUCKET; s.tokAt = t; s.overAt = 0; s.overLast = 0;
          this.bySock.set(sock, s);
        } else return { code: C_TAKEN, reason: 'taken' };
      } else if (this.host) return { code: C_TAKEN, reason: 'taken' };
      else s = this.seat(sock, this.newId(), 'h', t, this.io.rand(16));
      this.host = s;
    } else {
      if (!this.host) return { code: C_NO_HOST, reason: 'not_found' };
      if (this.bySock.size >= MAX_SOCKS) return { code: C_FULL, reason: 'full' };
      s = this.seat(sock, this.newId(), 'g', t, '');
    }
    this.io.save(sock, this.attachment(s));
    const hi = { k: 'hi', v: RELAY_V, id: s.id, h: this.host.id };
    if (s === this.host) hi.tok = s.tok;
    this.io.send(sock, JSON.stringify(hi));
    return null;
  }

  // ---------------------------------------------------------------- a frame from a page
  message(sock, data) {
    const s = this.bySock.get(sock);
    if (!s || s.done) return;
    const t = this.io.now();
    s.last = t;
    this.count(t);
    if (t - this.busyAt > IDLE_MS) { this.closeAll(C_GONE, 'idle'); return; }
    this.sweep(t, s);
    if (s.done) return;
    // the bucket: every frame takes a token; none left -> states are dropped, reliable frames still pass
    s.tokens = Math.min(BUCKET, s.tokens + (t - s.tokAt) * REFILL / 1000);
    s.tokAt = t;
    const token = s.tokens >= 1;
    if (token) s.tokens -= 1;
    else {
      if (!s.overAt || t - s.overLast > OVER_GAP) s.overAt = t;     // (a new run of over frames)
      s.overLast = t;
      if (t - s.overAt >= OVER_MS) { this.end(s, 'lost', C_RATE, 'rate'); return; }
    }
    if (typeof data !== 'string' || data.length > FRAME_MAX) { if (++s.big >= JUNK_BIG) this.end(s, 'lost', C_BIG, 'big'); return; }
    if (data === PING) { this.io.send(sock, PONG); return; }        // (the Durable Object's auto-response answers it first)
    let m = null;
    try { m = JSON.parse(data); } catch (e) { m = null; }
    if (!m || typeof m !== 'object' || Array.isArray(m)) { this.junk(s, t); return; }
    const isHost = s === this.host, member = !isHost && this.isMember(s);
    if (!isHost && !member && ++s.sn > STRANGER_MAX) { this.end(s, 'lost', C_GONE, 'stranger'); return; }
    switch (m.k) {
      case 's': {
        if (!Number.isInteger(m.q) || m.q <= s.q || !('d' in m)) { this.junk(s, t); return; }
        s.q = m.q;
        if (!token || (!isHost && !member)) return;                  // over the bucket (latest wins) / a stranger's
        const f = JSON.stringify({ k: 's', f: s.id, q: m.q, d: m.d });
        for (const o of this.audience(s)) this.io.send(o.sock, f);
        return;
      }
      case 'r': {
        const to = m.t;
        if (typeof to !== 'string' || (to !== '*' && !T_RE.test(to)) || !('d' in m)) { this.junk(s, t); return; }
        // (addressed to someone not seated, or not allowed: silently dropped - a normal race, never junk: 2.3)
        const f = JSON.stringify({ k: 'r', f: s.id, t: to, d: m.d });
        for (const o of this.targets(s, to, isHost, member)) this.io.send(o.sock, f);
        return;
      }
      case 'm': {
        if (!isHost || !Array.isArray(m.l)) { this.junk(s, t); return; }
        const before = this.members;
        this.members = this.memberList(m.l);
        // (a guest the host dropped counts as a stranger again from now: 8 frames, 20 s)
        for (const id of before) if (!this.members.includes(id)) { const o = this.byId.get(id); if (o) { o.sn = 0; o.sAt = t; } }
        this.io.save(s.sock, this.attachment(s));
        return;
      }
      case 'bye': this.end(s, 'left', 1000, 'bye'); return;
      case 'p': this.io.send(sock, PONG); return;
      default: this.junk(s, t);
    }
  }

  // the socket closed or failed (no bye): that seat is 'lost' (a host's: the room ends). att: the socket's attachment,
  // for a socket a woken core never saw (the runtime does not list a socket that is already closing): its seat is told
  // gone from that alone
  closed(sock, att) {
    const s = this.bySock.get(sock);
    if (s) { if (!s.done) this.end(s, 'lost', 0, ''); return; }
    if (!att || typeof att !== 'object' || typeof att.i !== 'string' || !SEAT_RE.test(att.i) || this.byId.has(att.i)) return;
    const gone = JSON.stringify({ k: 'gone', f: att.i, why: 'lost' });
    if (att.r === 'h') {
      if (this.host) return;                       // (another host holds the room now: not this one's to end)
      const rest = Array.from(this.bySock.values());
      this.bySock.clear(); this.byId.clear(); this.members = [];
      for (const o of rest) { o.done = true; this.io.send(o.sock, gone); this.io.save(o.sock, null); this.io.close(o.sock, C_HOST_GONE, 'host_left'); }
      return;
    }
    const i = this.members.indexOf(att.i);
    if (i >= 0) { this.members.splice(i, 1); if (this.host) this.io.save(this.host.sock, this.attachment(this.host)); }
    for (const o of this.bySock.values()) this.io.send(o.sock, gone);
  }

  info() {
    return { host: this.host ? this.host.id : null, seats: this.bySock.size, members: this.members.slice(), ids: Array.from(this.byId.keys()) };
  }

  // ---------------------------------------------------------------- routing (2.3)
  // admitted players but the sender: the host and every member
  audience(s) {
    const out = [];
    if (this.host && s !== this.host) out.push(this.host);
    for (const id of this.members) { const o = this.byId.get(id); if (o && o !== s) out.push(o); }
    return out;
  }
  targets(s, to, isHost, member) {
    if (to === '*') return isHost || member ? this.audience(s) : this.host ? [this.host] : [];
    const o = this.byId.get(to);
    if (!o || o === s) return [];
    if (isHost) return [o];                                            // welcome / full / roster reach a stranger too
    if (member) return o === this.host || this.members.includes(o.id) ? [o] : [];
    return o === this.host ? [o] : [];                                 // a stranger: its hello to the host only
  }

  // ---------------------------------------------------------------- the rules
  junk(s, t) {
    if (t - s.junkAt >= JUNK_MS) { s.junkAt = t; s.junk = 0; }
    if (++s.junk >= JUNK_ANY) this.end(s, 'lost', C_BAD, 'junk');
  }
  // frames per minute: a minute averaging IDLE_RATE frames/s or more is a busy one
  count(t) {
    if (t - this.lastAt > IDLE_GAP) { this.busyAt = t; this.minAt = t; this.minN = 0; }
    this.lastAt = t;
    if (t - this.minAt >= MINUTE) {
      if (this.minN >= IDLE_RATE * MINUTE / 1000) this.busyAt = t;
      this.minAt = t; this.minN = 0;
    }
    this.minN++;
  }
  // silent seats (no frame, no keepalive for DEAD_MS) and strangers past their time end as 'lost'
  sweep(t, cur) {
    for (const s of Array.from(this.bySock.values())) {
      if (s.done) continue;
      if (s !== cur) {
        const last = Math.max(s.last, +this.io.heard(s.sock) || 0);
        if (t - last > DEAD_MS) { this.end(s, 'lost', C_GONE, 'dead'); continue; }
      }
      if (s !== this.host && !this.members.includes(s.id) && t - s.sAt > STRANGER_MS) this.end(s, 'lost', C_GONE, 'stranger');
    }
  }
  // the seat leaves: the others hear {k:'gone'}; the host's end empties the room (its guests get the gone, then 4001)
  end(s, why, code, reason) {
    if (s.done) return;
    s.done = true;
    this.bySock.delete(s.sock);
    this.byId.delete(s.id);
    this.io.save(s.sock, null);                     // (a later wake never rebuilds a seat that is gone)
    if (code) this.io.close(s.sock, code, reason || why);
    const gone = JSON.stringify({ k: 'gone', f: s.id, why });
    if (s === this.host) {
      this.host = null;
      const rest = Array.from(this.bySock.values());
      this.bySock.clear(); this.byId.clear(); this.members = [];
      for (const o of rest) { o.done = true; this.io.send(o.sock, gone); this.io.save(o.sock, null); this.io.close(o.sock, C_HOST_GONE, 'host_left'); }
      return;
    }
    const i = this.members.indexOf(s.id);
    if (i >= 0) { this.members.splice(i, 1); if (this.host) this.io.save(this.host.sock, this.attachment(this.host)); }
    for (const o of this.bySock.values()) this.io.send(o.sock, gone);
  }
  closeAll(code, reason) {
    const all = Array.from(this.bySock.values());
    this.bySock.clear(); this.byId.clear(); this.host = null; this.members = [];
    for (const s of all) { s.done = true; this.io.save(s.sock, null); this.io.close(s.sock, code, reason); }
  }
}
