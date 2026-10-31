// Node tests for the WebSocket relay (design/relay.md 11.1): cloudflare/src/ (room.js = RoomCore, relay.js = the Worker's
// gate / route, room-do.js = the Durable Object), the shipped wrangler.toml, the local test relay (tools/ws-relay.js)
// over real sockets, and build.js's relay URL on a copy of the sources. Nothing leaves this machine: no login, no
// account, no Cloudflare runtime (that is the optional ws-workerd job, 11.6).
//   room     RoomCore with fake sockets: open (taken / no host / the 7th socket), hi, stamping, every row of the routing
//            table (2.3), order and bye, a host leaving, junk (oversize, binary, bad JSON per minute; an 'r' to nobody is
//            NOT junk), the message bucket (states dropped, reliable frames pass, only sustained excess closes), strangers
//            (8 frames / 20 s), the dead-seat sweep (150 s, the keepalive timestamp counts), the forgotten-room close
//            (30 min below 10 frames/s), the host re-seat (empty room / own half-open seat), a core rebuilt from the
//            sockets' attachments (a woken Durable Object), a socket the woken core never saw
//   worker   route() / gate() with a fake WebSocketPair, Response (101 allowed) and ROOMS namespace: the health route, the
//            path grammar, origins per space, the version, the role, the connect limiter (binding, its failure, the
//            isolate count, IPv6 keyed per /64), a Durable Object that throws or answers no 101 -> 4503 cap / busy
//   do       class Room with a fake ctx: the 101, the auto-response pair, attachments, a dropped core rebuilt, the close
//            completed, a closing socket told from its attachment; no timer / alarm / await in room.js or room-do.js
//   toml     the shipped wrangler.toml and cloudflare/package.json
//   local    tools/ws-relay.js on a random port with node's own WebSocket client: the handshake, masked frames in, frames
//            out, a 70 KB frame refused, close codes passed through, the keepalive, admin kill / restart / cap / info
//   build    build.js on a COPY of the sources: no URL / none -> the deploy page byte for byte as before; a URL -> one
//            window.PG_RELAY={url} line before PeerJS; a PR preview -> space "p"; the itch zip without it; dist/ never;
//            relay.config.json, the env winning, none winning; a bad URL / a broken file stop the build
// Prints "RELAY-NODE PASS/FAIL <name>" and "RELAY-NODE OK|FAIL: N passed, M failed"; exit code 1 on failure.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const CF = path.join(ROOT, 'cloudflare');
const { T } = require('./env');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-'));
let passes = 0, fails = 0;
const ok = (name, cond, info) => {
  if (cond) passes++; else fails++;
  console.log(`RELAY-NODE ${cond ? 'PASS' : 'FAIL'} ${name}${!cond && info !== undefined ? ' :: ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 400) : ''}`);
  return !!cond;
};
const want = (g) => !ONLY.length || ONLY.includes(g);
const imp = (f) => import(pathToFileURL(path.join(CF, 'src', f)).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ==================================================================================== RoomCore harness
function harness(R, seats) {
  const H = { t: 1e9, socks: [], seq: 0 };
  H.io = {
    send: (s, str) => { if (!s.closed) s.out.push(str); },
    close: (s, code, reason) => { if (!s.closed) s.closed = { code, reason }; },
    save: (s, a) => { s.att = a === null ? null : JSON.parse(JSON.stringify(a)); },
    heard: (s) => s.heard || 0,
    // (deterministic [a-z0-9] ids)
    rand: (n) => (++H.seq).toString(36).padStart(n, '0').slice(-n),
    now: () => H.t,
  };
  H.core = new R.RoomCore(Object.assign({}, H.io, seats ? { seats } : {}));
  H.sock = (name) => { const s = { name, out: [], closed: null, att: undefined, heard: 0 }; H.socks.push(s); return s; };
  H.open = (name, p) => { const s = H.sock(name); s.no = H.core.open(s, p || { role: 'g' }); s.hi = s.no ? null : JSON.parse(s.out[0]); s.id = s.hi ? s.hi.id : null; return s; };
  H.send = (s, obj) => H.core.message(s, typeof obj === 'string' || typeof obj !== 'object' || ArrayBuffer.isView(obj) || obj instanceof ArrayBuffer ? obj : JSON.stringify(obj));
  H.take = (s) => { const a = s.out.map((x) => JSON.parse(x)); s.out = []; return a; };
  H.adv = (ms) => { H.t += ms; };
  return H;
}
// a host and n guests, all admitted (each said hello; the host's m names them)
function room(R, n) {
  const H = harness(R);
  const h = H.open('h', { role: 'h' });
  const g = [];
  for (let i = 1; i <= n; i++) g.push(H.open('g' + i));
  for (const x of g) H.send(x, { k: 'r', t: h.id, d: { c: 'hello', v: 3 } });
  H.send(h, { k: 'm', l: g.map((x) => x.id) });
  for (const s of [h].concat(g)) H.take(s);
  H.adv(2000);                              // (the buckets full again)
  return { H, h, g };
}
const ks = (a) => a.map((m) => m.k + (m.k === 'gone' ? ':' + m.why : '')).join(',');

async function testRoom() {
  const R = await imp('room.js');
  // ---- open
  {
    const H = harness(R);
    const g0 = H.open('g0');
    ok('room: a guest before any host -> 4404 not_found', g0.no && g0.no.code === 4404 && g0.no.reason === 'not_found', g0.no);
    const h = H.open('h', { role: 'h' });
    ok('room: the host gets hi {k, v:1, id, h = id, tok} first', h.hi && h.hi.k === 'hi' && h.hi.v === 1 && R.SEAT_RE.test(h.id) && h.hi.h === h.id && R.TOK_RE.test(h.hi.tok) && h.out.length === 1, h.hi);
    ok('room: the host attachment {i, r:h, t, k: tok, m: []}', h.att && h.att.i === h.id && h.att.r === 'h' && typeof h.att.t === 'number' && h.att.k === h.hi.tok && Array.isArray(h.att.m) && !h.att.m.length, h.att);
    const h2 = H.open('h2', { role: 'h' });
    ok('room: a second host -> 4409 taken', h2.no && h2.no.code === 4409, h2.no);
    const gs = [1, 2, 3, 4, 5].map((i) => H.open('g' + i));
    ok('room: guests get hi with the host id and no tok, ids distinct', gs.every((x) => x.hi && x.hi.h === h.id && !('tok' in x.hi) && R.SEAT_RE.test(x.id)) && new Set(gs.map((x) => x.id).concat(h.id)).size === 6);
    const g6 = H.open('g6');
    ok('room: the 7th socket -> 4430 full', g6.no && g6.no.code === 4430 && g6.no.reason === 'full', g6.no);
    ok('room: info()', H.core.info().host === h.id && H.core.info().seats === 6 && H.core.info().members.length === 0);
  }
  // ---- stamping and routing (2.3)
  {
    const { H, h, g } = room(R, 3);
    const x = H.open('stranger');
    H.take(x);
    H.send(g[0], { k: 's', q: 1, d: { a: 1 }, f: 'sEVIL0000000' });
    const at = (s) => H.take(s);
    const hs = at(h), g2 = at(g[1]), g3 = at(g[2]), xs = at(x), g1 = at(g[0]);
    ok('room: a member state -> the host and the other members, stamped with the sender (a spoofed f overwritten)',
      hs.length === 1 && hs[0].f === g[0].id && hs[0].q === 1 && hs[0].d.a === 1 && g2.length === 1 && g3.length === 1 && g2[0].f === g[0].id && !xs.length && !g1.length, { hs, xs, g1 });
    H.send(h, { k: 's', q: 1, d: { w: 1 } });
    ok('room: a host state -> every member, never a stranger or the host', g.every((s) => { const a = at(s); return a.length === 1 && a[0].f === h.id; }) && !at(x).length && !at(h).length);
    H.send(x, { k: 's', q: 1, d: { no: 1 } });
    ok('room: a stranger\'s state -> nobody', [h].concat(g).every((s) => !at(s).length));
    H.send(h, { k: 'r', t: '*', d: { u: 1 } });
    ok('room: host r * -> every member, not the stranger', g.every((s) => { const a = at(s); return a.length === 1 && a[0].k === 'r' && a[0].t === '*' && a[0].f === h.id; }) && !at(x).length);
    H.send(h, { k: 'r', t: x.id, d: { c: 'welcome' } });
    ok('room: host r to a stranger -> that stranger (welcome / full / roster)', (() => { const a = at(x); return a.length === 1 && a[0].t === x.id && a[0].d.c === 'welcome'; })() && g.every((s) => !at(s).length));
    H.send(g[0], { k: 'r', t: '*', d: { u: 2 } });
    ok('room: member r * -> the host and the other members, not the stranger', at(h).length === 1 && at(g[1]).length === 1 && at(g[2]).length === 1 && !at(x).length && !at(g[0]).length);
    H.send(g[0], { k: 'r', t: h.id, d: { u: 3 } });
    ok('room: member r to the host -> the host only', at(h).length === 1 && g.every((s) => !at(s).length) && !at(x).length);
    H.send(g[0], { k: 'r', t: g[2].id, d: { u: 4 } });
    ok('room: member r to a member -> that member only', at(g[2]).length === 1 && !at(h).length && !at(g[1]).length);
    H.send(g[0], { k: 'r', t: x.id, d: { u: 5 } });
    ok('room: member r to a stranger -> nobody (as peerLink)', !at(x).length && !at(h).length);
    H.send(x, { k: 'r', t: h.id, d: { c: 'hello' } });
    H.send(x, { k: 'r', t: '*', d: { c: 'hello' } });
    ok('room: a stranger r to the host or * -> the host only', at(h).length === 2 && g.every((s) => !at(s).length));
    H.send(x, { k: 'r', t: g[1].id, d: { u: 6 } });
    ok('room: a stranger r to a member -> nobody', !at(g[1]).length && !at(h).length);
    H.send(g[1], { k: 'm', l: [] });
    ok('room: a guest\'s m is ignored (the members stay)', H.core.info().members.length === 3 && !x.closed);
    H.send(h, { k: 'm', l: [h.id, 'sunknown0000', g[2].id, g[2].id, x.id, g[0].id, g[1].id, 5] });
    ok('room: m keeps seated guest ids only, no duplicates, at most 3', JSON.stringify(H.core.info().members) === JSON.stringify([g[2].id, x.id, g[0].id]), H.core.info().members);
    ok('room: ... and the host attachment carries them', JSON.stringify(h.att.m) === JSON.stringify([g[2].id, x.id, g[0].id]));
  }
  // ---- order, bye, a lost socket, the host leaving
  {
    const { H, h, g } = room(R, 2);
    for (let i = 0; i < 5; i++) H.send(g[0], { k: 'r', t: h.id, d: { i } });
    H.send(g[0], { k: 'bye' });
    const a = H.take(h);
    ok('room: frames reach the host in order, the gone(left) after them', a.length === 6 && a.slice(0, 5).every((m, i) => m.d.i === i) && a[5].k === 'gone' && a[5].f === g[0].id && a[5].why === 'left', ks(a));
    ok('room: after bye the socket closes 1000 and its attachment is cleared', g[0].closed && g[0].closed.code === 1000 && g[0].att === null && H.take(g[1]).some((m) => m.k === 'gone'));
    ok('room: the leaver is no member any more (host attachment too)', !H.core.info().members.includes(g[0].id) && !h.att.m.includes(g[0].id));
    H.core.closed(g[1]);
    const b = H.take(h);
    ok('room: a socket that dies -> gone(lost) to the others', b.length === 1 && b[0].k === 'gone' && b[0].why === 'lost' && b[0].f === g[1].id, b);
    H.core.closed(g[1]);
    ok('room: closed() twice does nothing more', !H.take(h).length);
  }
  {
    const { H, h, g } = room(R, 2);
    H.send(h, { k: 'r', t: '*', d: { last: 1 } });
    H.send(h, { k: 'bye' });
    ok('room: the host leaving: each guest gets the last word, gone(left), then 4001', g.every((s) => { const a = H.take(s); return ks(a) === 'r,gone:left' && a[1].f === h.id && s.closed && s.closed.code === 4001 && s.att === null; }));
    ok('room: ... the room is empty and its code free (a new host gets in)', H.core.info().host === null && H.core.info().seats === 0 && !H.open('h2', { role: 'h' }).no);
  }
  {
    const { H, h, g } = room(R, 1);
    H.core.closed(h);
    const a = H.take(g[0]);
    ok('room: a host socket that dies -> gone(lost) then 4001', ks(a) === 'gone:lost' && g[0].closed && g[0].closed.code === 4001, a);
  }
  // ---- junk (2.6)
  {
    const { H, h, g } = room(R, 1);
    const big = JSON.stringify({ k: 'r', t: h.id, d: 'x'.repeat(4100) });
    H.send(g[0], big); H.send(g[0], big);
    ok('room: 2 oversize frames: dropped, still open', !g[0].closed && !H.take(h).length);
    H.send(g[0], big);
    ok('room: the 3rd oversize frame -> 4413', g[0].closed && g[0].closed.code === 4413, g[0].closed);
  }
  {
    const { H, g } = room(R, 1);
    H.send(g[0], Buffer.from('{"k":"bye"}')); H.send(g[0], new Uint8Array(4)); H.send(g[0], new ArrayBuffer(2));
    ok('room: binary frames count as oversize (3 -> 4413)', g[0].closed && g[0].closed.code === 4413, g[0].closed);
  }
  {
    const { H, h, g } = room(R, 1);
    for (let i = 0; i < 7; i++) H.send(g[0], '{bad');
    ok('room: 7 bad JSON frames: still open', !g[0].closed);
    H.send(g[0], '[1,2]');
    ok('room: the 8th junk frame within 60 s -> 4400', g[0].closed && g[0].closed.code === 4400, g[0].closed);
    ok('room: ... the host hears gone(lost)', ks(H.take(h)) === 'gone:lost');
  }
  {
    const H = harness(R);
    const h = H.open('h', { role: 'h' });
    for (let i = 0; i < 8; i++) { H.adv(80000); H.send(h, 'nonsense'); }
    ok('room: 8 junk frames spread over 10 minutes -> still open', !h.closed);
    for (let i = 0; i < 20; i++) H.send(h, { k: 'r', t: 's' + String(i).padStart(11, '9'), d: { c: 'roster' } });
    ok('room: 20 r frames to well-formed ids nobody holds: dropped, never junk (still open)', !h.closed && h.out.length === 1);
    for (const bad of [{ k: 'zz' }, { k: 'r', t: 'a b', d: 1 }, { k: 'r', t: h.id }, { k: 's', q: 1.5, d: 1 }, { k: 's', d: 1 }, { k: 's', q: 3, d: 1 }, { k: 's', q: 3, d: 1 }]) H.send(h, bad);
    ok('room: unknown k, a bad t, no d, a non-integer / missing / repeated q are junk (7 in a minute: open, the 8th closes)', !h.closed && (H.send(h, 'x'), h.closed && h.closed.code === 4400), h.closed);
  }
  {
    const H = harness(R);
    const h = H.open('h', { role: 'h' });
    for (let i = 0; i < 12; i++) H.send(h, R.PING);
    ok('room: the keepalive reaching the core is answered {"k":"P"} and is no junk', !h.closed && h.out.slice(1).every((s) => s === R.PONG) && h.out.length === 13);
  }
  // ---- the message bucket (2.6)
  {
    const { H, h, g } = room(R, 2);
    for (let q = 1; q <= 100; q++) H.send(g[0], { k: 's', q, d: { q } });
    ok('room: a burst of 100 states in one instant: all forwarded', H.take(h).length === 100 && H.take(g[1]).length === 100 && !g[0].closed);
  }
  {
    const { H, h, g } = room(R, 2);
    for (let q = 1; q <= 300; q++) { H.send(g[0], { k: 's', q, d: { q } }); if (q === 200) H.send(g[0], { k: 'r', t: '*', d: { u: 'keep' } }); }
    const a = H.take(h);
    ok('room: 300 states at once: 100 forwarded, the rest dropped (latest wins), the socket open', a.filter((m) => m.k === 's').length === 100 && !g[0].closed, a.length);
    ok('room: ... a reliable frame among them still forwarded', a.some((m) => m.k === 'r' && m.d.u === 'keep') && H.take(g[1]).some((m) => m.k === 'r'));
  }
  const rateRun = (R2, perSec, ms) => {
    const { H, h, g } = room(R2, 1);
    let q = 0, closedAt = null;
    const step = 1000 / perSec, t0 = H.t;
    while (H.t - t0 < ms && !g[0].closed) { H.adv(step); H.send(g[0], { k: 's', q: ++q, d: 1 }); if (g[0].closed) closedAt = H.t - t0; if (q % 50 === 0) H.send(h, { k: 'r', t: g[0].id, d: 1 }); }
    return { closed: g[0].closed, closedAt, sent: q };
  };
  {
    const a = rateRun(R, 49, 60000);
    ok('room: 49 frames/s for a minute: never closed', !a.closed, a);
    const b = rateRun(R, 150, 5500);
    ok('room: 150 frames/s: still open after 5.5 s (the bucket empty since ~1 s, < OVER_MS)', !b.closed, b);
    const c = rateRun(R, 150, 7000);
    ok('room: 150 frames/s: closed 4429 at ~6 s (empty for OVER_MS 5 s in a row)', c.closed && c.closed.code === 4429 && c.closedAt > 5800 && c.closedAt < 6400, c);
    const e = (() => {
      // 150 frames/s arriving in TCP-like bursts (15 at once every 100-112 ms): the run is not broken by a lucky refill
      const { H, h, g } = room(R, 1);
      let q = 0, at = null;
      const t0 = H.t;
      while (H.t - t0 < 9000 && !g[0].closed) { H.adv(100 + (q % 7) * 2); for (let i = 0; i < 15 && !g[0].closed; i++) { H.send(g[0], { k: 's', q: ++q, d: 1 }); if (g[0].closed) at = H.t - t0; } }
      void h;
      return { closed: g[0].closed, at };
    })();
    ok('room: 150 frames/s in bursts: closed 4429 at ~6 s', e.closed && e.closed.code === 4429 && e.at > 5800 && e.at < 6600, e);
    const f = (() => {
      // a legit page: an LTE stall burst (150), 6 s of 46/s, another burst - two runs of over frames 6 s apart: open
      const { H, g } = room(R, 1);
      let q = 0;
      for (let k = 0; k < 2; k++) { for (let i = 0; i < 150; i++) H.send(g[0], { k: 's', q: ++q, d: 1 }); for (let i = 0; i < 46 * 6; i++) { H.adv(1000 / 46); H.send(g[0], { k: 's', q: ++q, d: 1 }); } }
      return g[0].closed;
    })();
    ok('room: two stall bursts 6 s apart with 46 frames/s between: never closed (each burst is its own short run)', !f, f);
    const d = rateRun(R, 70, 12000);
    ok('room: 70 frames/s: closed 4429 at ~10 s (5 s to empty the bucket, 5 s empty)', d.closed && d.closed.code === 4429 && d.closedAt > 9500 && d.closedAt < 10600, d);
  }
  {
    // an LTE stall: 5 s of bodies (30/s) arrive at once, then the steady 46/s -> never closed
    const { H, h, g } = room(R, 1);
    let q = 0;
    for (let i = 0; i < 150; i++) H.send(g[0], { k: 's', q: ++q, d: 1 });
    for (let i = 0; i < 46 * 20; i++) { H.adv(1000 / 46); H.send(g[0], { k: 's', q: ++q, d: 1 }); if (i % 23 === 0) H.send(h, { k: 'r', t: g[0].id, d: 1 }); }
    ok('room: an LTE stall (150 queued bodies at once) then 46 frames/s for 20 s: never closed', !g[0].closed);
  }
  // ---- strangers (2.6)
  {
    const H = harness(R);
    const h = H.open('h', { role: 'h' });
    const x = H.open('x');
    for (let i = 0; i < 8; i++) H.send(x, { k: 'r', t: h.id, d: { c: 'hello' } });
    ok('room: a stranger may send 8 frames', !x.closed && H.take(h).length === 9);
    H.send(x, { k: 'r', t: h.id, d: { c: 'hello' } });
    ok('room: its 9th frame -> 4408', x.closed && x.closed.code === 4408, x.closed);
    const y = H.open('y');
    H.adv(19000); H.send(y, { k: 'r', t: h.id, d: { c: 'hello' } });
    ok('room: a stranger 19 s after hi: still open', !y.closed);
    H.adv(2000); H.send(h, { k: 'r', t: y.id, d: { c: 'full' } });
    ok('room: not admitted 21 s after hi -> 4408 on the next frame (the host\'s)', y.closed && y.closed.code === 4408, y.closed);
    const z = H.open('z');
    H.send(h, { k: 'm', l: [z.id] });
    H.adv(25000); H.send(z, { k: 's', q: 1, d: 1 });
    ok('room: an admitted member is no stranger (25 s later still open)', !z.closed);
    H.send(h, { k: 'm', l: [] });
    for (let i = 0; i < 8; i++) H.send(z, { k: 'r', t: h.id, d: 1 });
    ok('room: a member the host dropped is a stranger again (8 frames ok)', !z.closed);
    H.send(z, { k: 'r', t: h.id, d: 1 });
    ok('room: ... its 9th -> 4408', z.closed && z.closed.code === 4408);
  }
  // ---- the dead-seat sweep (2.4)
  {
    const { H, h, g } = room(R, 1);
    H.adv(147000); H.send(h, { k: 'r', t: '*', d: 1 });            // (room() ended 2 s after the guest's hello)
    ok('room: a guest silent 149 s: kept', !g[0].closed);
    H.adv(2000); H.send(h, { k: 'r', t: '*', d: 2 });
    ok('room: silent 151 s -> 4408 and gone(lost) to the host, on the next frame', g[0].closed && g[0].closed.code === 4408 && H.take(h).some((m) => m.k === 'gone' && m.why === 'lost' && m.f === g[0].id));
  }
  {
    const H = harness(R);
    const h = H.open('h', { role: 'h' });
    H.adv(600000); h.heard = H.t - 30000;
    const g = H.open('g');
    ok('room: a host alone whose only sign is the keepalive timestamp (heard) is not swept', !h.closed && !g.no && g.hi.h === h.id);
  }
  {
    const H = harness(R);
    const h = H.open('h', { role: 'h' });
    H.adv(200000); h.heard = H.t - 160000;
    const g = H.open('g');
    ok('room: a half-open host (silent 160 s) is swept on a guest\'s connect -> that guest gets 4404', h.closed && h.closed.code === 4408 && g.no && g.no.code === 4404, { h: h.closed, g: g.no });
    ok('room: ... and the code is free for a new host', !H.open('h2', { role: 'h' }).no);
  }
  // ---- the forgotten-room close (2.4, 9.6)
  const idleRun = (R2, minutes, busyAtMin) => {
    const { H, h, g } = room(R2, 1);
    let q = 0, closedAt = null;
    const t0 = H.t;
    for (let i = 0; i < minutes * 60 * 4 && !h.closed; i++) {
      const min = (H.t - t0) / 60000;
      const busy = busyAtMin !== undefined && min >= busyAtMin && min < busyAtMin + 1;
      const n = busy ? 3 : 1;
      for (let k = 0; k < n; k++) H.send(i % 2 ? h : g[0], { k: 'r', t: '*', d: ++q });
      H.adv(250);
      if (h.closed && closedAt === null) closedAt = (H.t - t0) / 60000;
    }
    return { h: h.closed, g: g[0].closed, at: closedAt };
  };
  {
    const a = idleRun(R, 29);
    ok('room: a lobby at 4 frames/s for 29 min: open', !a.h, a);
    const b = idleRun(R, 32);
    ok('room: ... past 30 min -> 4408 (idle) to every seat', b.h && b.h.code === 4408 && b.g && b.g.code === 4408 && b.at > 29.9 && b.at < 31, b);
    const c = idleRun(R, 40, 20);
    ok('room: one busy minute (12 frames/s) at minute 20 restarts the clock: open at 40 min', !c.h, c);
  }
  {
    // the same object (still in memory) right after its idle close: the host re-seats into the empty room at once (a
    // host left alone does) and sends its m - a fresh room's clock, so it is not closed again (no close / re-seat loop)
    const { H, h, g } = room(R, 1);
    let q = 0;
    for (let i = 0; i < 31 * 60 * 4 && !h.closed; i++) { H.send(i % 2 ? h : g[0], { k: 'r', t: '*', d: ++q }); H.adv(250); }
    const n = H.open('h-again', { role: 'h', id: h.id, tok: h.hi.tok });
    H.send(n, { k: 'm', l: [] });
    H.adv(30000);
    H.send(n, { k: 'm', l: [] });
    ok('room: right after the idle close, a host opening into the empty room starts a fresh clock (its frames do not close it again)', h.closed && h.closed.code === 4408 && !n.no && !n.closed && H.core.info().host === h.id, { h: h.closed, n: n.no || n.closed });
  }
  {
    const H = harness(R);
    const h = H.open('h', { role: 'h' });
    H.adv(40 * 60000); h.heard = H.t - 20000;
    const g = H.open('g');
    H.send(g, { k: 'r', t: h.id, d: { c: 'hello' } });
    ok('room: a host alone 40 min (quiet: nothing arrived), then a friend joins -> not closed as forgotten', !h.closed && !g.closed && H.take(h).some((m) => m.k === 'r'));
  }
  // ---- the host re-seat (2.1, 8.1)
  {
    const H = harness(R);
    const id = 's' + 'k'.repeat(11), tok = 'q'.repeat(16);
    const h = H.open('h', { role: 'h', id, tok });
    ok('room: re-seat into an empty room -> granted with the same id and tok', !h.no && h.id === id && h.hi.tok === tok && h.hi.h === id);
    const g = H.open('g');
    ok('room: ... a guest then finds it', g.hi && g.hi.h === id);
    const bad = H.open('h2', { role: 'h', id, tok: 'w'.repeat(16) });
    ok('room: a wrong tok -> 4409', bad.no && bad.no.code === 4409);
    const other = H.open('h3', { role: 'h', id: 's' + 'z'.repeat(11), tok });
    ok('room: another id while the room is held -> 4409', other.no && other.no.code === 4409);
    const ill = harness(R).open('h', { role: 'h', id: 'evil', tok });
    ok('room: an id off the seat grammar -> 4409', ill.no && ill.no.code === 4409);
    const gid = H.open('g2', { role: 'g', id, tok });
    ok('room: a guest asking for an id gets its own (ignored)', gid.hi && gid.id !== id && gid.hi.h === id);
    const h2 = H.open('h4', { role: 'h', id, tok });
    ok('room: id + the right tok over my own half-open seat -> the old socket 4408, the seat moved', !h2.no && h2.id === id && h.closed && h.closed.code === 4408 && h.att === null && h2.att && h2.att.i === id);
    H.take(g);
    H.send(h2, { k: 'r', t: g.id, d: { c: 'welcome' } });
    ok('room: ... the moved seat routes from its new socket', H.take(g).some((m) => m.f === id));
  }
  // ---- rebuilt from attachments (a woken Durable Object)
  {
    const { H, h, g } = room(R, 2);
    H.send(h, { k: 'r', t: g[0].id, d: 1 });
    const seats = [h, g[0], g[1]].map((s) => [s, s.att]);
    const W = harness(R, seats);
    for (const s of [h, g[0], g[1]]) s.out = [];
    W.core.message(h, JSON.stringify({ k: 's', q: 1, d: { w: 1 } }));
    ok('room: a woken core routes as before (members kept from the host attachment)', g.every((s) => s.out.length === 1) && JSON.stringify(W.core.info().members) === JSON.stringify(g.map((x) => x.id)));
    W.core.message(g[0], JSON.stringify({ k: 'r', t: h.id, d: 2 }));
    ok('room: ... a member to the host', h.out.some((x) => JSON.parse(x).f === g[0].id));
    const again = W.open('h5', { role: 'h', id: h.id, tok: h.att.k });
    ok('room: ... and keeps the host\'s tok (its re-seat works)', !again.no && again.id === h.id && h.closed && h.closed.code === 4408);
  }
  {
    const { H, h, g } = room(R, 2);
    const W = harness(R, [[g[0], g[0].att], [g[1], g[1].att]]);
    ok('room: a woken core with guests but no host seat closes them (4408)', g.every((s) => s.closed && s.closed.code === 4408) && W.core.info().seats === 0);
    void h; void H;
  }
  {
    const { H, h, g } = room(R, 2);
    const W = harness(R, [[h, h.att], [g[1], g[1].att]]);
    W.core.closed({ name: 'gone-sock' }, g[0].att);
    ok('room: a closing socket the woken core never saw: its seat is told gone(lost) from its attachment', h.out.slice(-1).map((x) => JSON.parse(x)).some((m) => m.k === 'gone' && m.f === g[0].id) && !W.core.info().members.includes(g[0].id));
    W.core.closed({ name: 'gone-host' }, Object.assign({}, h.att, { i: 's' + 'x'.repeat(11) }));
    ok('room: ... a host attachment while another host holds the room: nothing', !g[1].closed);
    const W2 = harness(R, [[g[1], g[1].att]]);
    void W2; void H;
  }
}

// ==================================================================================== the Worker (relay.js)
class FakeSide { constructor(side) { this.side = side; this.accepted = false; this.closedWith = null; } accept() { this.accepted = true; } close(code, reason) { this.closedWith = { code, reason }; } }
class FakePair { constructor() { const c = new FakeSide('client'), s = new FakeSide('server'); c.server = s; this[0] = c; this[1] = s; } }
class FakeResponse {
  constructor(body, init) { init = init || {}; this.body = body; this.status = init.status === undefined ? 200 : init.status; this.headers = Object.assign({}, init.headers || {}); this.webSocket = init.webSocket || null; }
  async text() { return this.body === null || this.body === undefined ? '' : String(this.body); }
}
function req(p, o) {
  o = o || {};
  const h = Object.assign({ Upgrade: 'websocket', Origin: 'https://bubble-c3ad4.web.app', 'CF-Connecting-IP': '203.0.113.7' }, o.headers || {});
  const H = new Map(Object.keys(h).filter((k) => h[k] !== null).map((k) => [k.toLowerCase(), String(h[k])]));
  return { url: 'https://ppodeuk-relay.test-acct.workers.dev' + p, method: o.method || 'GET', headers: { get: (n) => (H.has(String(n).toLowerCase()) ? H.get(String(n).toLowerCase()) : null) } };
}
function rooms(behave) {
  const ns = { names: [], fetched: 0, idFromName(n) { ns.names.push(n); return { name: n }; }, get(id) { return { fetch: async (r) => { ns.fetched++; return behave ? behave(id, r) : new FakeResponse(null, { status: 101, webSocket: { stub: id.name } }); } }; } };
  return ns;
}
function tomlText() { return fs.readFileSync(path.join(CF, 'wrangler.toml'), 'utf8'); }
function tomlVar(name) { const m = tomlText().match(new RegExp('^' + name + '\\s*=\\s*"([^"]*)"', 'm')); return m ? m[1] : null; }
const LIVE_W = ['https://bubble-c3ad4.web.app', 'https://bubble-c3ad4.firebaseapp.com', 'https://bobo33772-blip.github.io'];
const LIVE_T = ['https://ppodeuk-bath.apps.tossmini.com', 'https://ppodeuk-bath.private-apps.tossmini.com'];
const PREVIEWS = ['https://bubble-c3ad4--pr23-ab12cd34.web.app', 'https://bubble-c3ad4--preview-1.web.app'];

async function testWorker() {
  const R = await imp('relay.js');
  const ENV = { ORIGINS: tomlVar('ORIGINS'), ALLOW_LOCALHOST: tomlVar('ALLOW_LOCALHOST') };
  let now = 5e9;
  const io = (o) => Object.assign({ Response: FakeResponse, WebSocketPair: FakePair, limiter: R.makeLimiter(), now: () => now }, o || {});
  const env = (o) => Object.assign({}, ENV, { ROOMS: rooms() }, o || {});
  const closeOf = (res) => (res && res.status === 101 && res.webSocket && res.webSocket.server ? res.webSocket.server.closedWith : null);
  const reached = (res) => !!(res && res.status === 101 && res.webSocket && res.webSocket.stub);
  // ---- health
  let res = await R.route(req('/', { headers: { Upgrade: null, Origin: null } }), env(), io());
  const body = JSON.parse(res.body);
  ok('worker: GET / -> 200 {ok, service: ppodeuk-relay, v: 1}, no-store, no Origin needed', res.status === 200 && body.ok === true && body.service === 'ppodeuk-relay' && body.v === 1 && /no-store/.test(res.headers['Cache-Control']), res.body);
  res = await R.route(req('/', { method: 'POST' }), env(), io());
  ok('worker: POST / -> 405', res.status === 405);
  // ---- the path
  res = await R.route(req('/r/w/abcd', { headers: { Upgrade: null } }), env(), io());
  ok('worker: a room path without an upgrade -> 426', res.status === 426);
  res = await R.route(req('/nope', { headers: { Upgrade: null } }), env(), io());
  ok('worker: another path without an upgrade -> 404', res.status === 404);
  for (const p of ['/nope', '/r/x/abcd', '/r/w/ABCD', '/r/w/abcde', '/r/w/ab-d', '/r/w/abcd/x', '/r//abcd']) {
    const e = env();
    res = await R.route(req(p + '?v=1&role=h'), e, io());
    ok(`worker: upgrade on ${p} -> our own socket closed 4400, no Durable Object touched`, (closeOf(res) || {}).code === 4400 && res.webSocket.server.accepted && !e.ROOMS.names.length, closeOf(res));
  }
  // ---- origins per space
  const tryOrigin = async (origin, space, e2) => { const e = env(e2); const r = await R.route(req(`/r/${space}/abcd?v=1&role=h`, { headers: { Origin: origin } }), e, io()); return { r, e }; };
  for (const o of LIVE_W) { const { r, e } = await tryOrigin(o, 'w'); ok(`worker: ${o} enters w (the Durable Object w:abcd)`, reached(r) && e.ROOMS.names[0] === 'w:abcd'); }
  for (const o of PREVIEWS) { ok(`worker: a preview ${o} enters p only`, reached((await tryOrigin(o, 'p')).r) && (closeOf((await tryOrigin(o, 'w')).r) || {}).code === 4403); }
  for (const o of LIVE_T) { ok(`worker: Toss ${o} enters t only`, reached((await tryOrigin(o, 't')).r) && (closeOf((await tryOrigin(o, 'w')).r) || {}).code === 4403); }
  ok('worker: the live game cannot enter p or t', (closeOf((await tryOrigin(LIVE_W[0], 'p')).r) || {}).code === 4403 && (closeOf((await tryOrigin(LIVE_W[0], 't')).r) || {}).code === 4403);
  ok('worker: case does not matter (HTTPS://BUBBLE-C3AD4.WEB.APP)', reached((await tryOrigin('HTTPS://BUBBLE-C3AD4.WEB.APP', 'w')).r));
  for (const o of ['https://evil.example', 'https://bubble-c3ad4.web.app.evil.com', 'https://evilbubble-c3ad4.web.app', 'https://bubble-c3ad4--x.evil.web.app', 'https://bubble-c3ad4--.web.app',
    'http://bubble-c3ad4.web.app', 'https://bubble-c3ad4.web.app:8443', 'https://other-blip.github.io', 'https://ppodeuk-bath.apps.tossmini.com.evil.io', 'null', null, 'https://' + 'a'.repeat(200) + '.web.app',
    'http://localhost:8765', 'http://127.0.0.1:5000', 'https://html-classic.itch.zone']) {
    const { r, e } = await tryOrigin(o, 'w');
    ok(`worker: origin refused 4403: ${JSON.stringify(o && o.slice(0, 60))}`, (closeOf(r) || {}).code === 4403 && closeOf(r).reason === 'origin' && !e.ROOMS.names.length, closeOf(r));
  }
  for (const [o, sp] of [['http://localhost:8765', 'w'], ['http://127.0.0.1:5000', 'p'], ['http://[::1]:8080', 't'], ['http://localhost', 'w']]) ok(`worker: ALLOW_LOCALHOST=1 lets ${o} into ${sp}`, reached((await tryOrigin(o, sp, { ALLOW_LOCALHOST: '1' })).r));
  ok('worker: ALLOW_LOCALHOST=1 still refuses http://localhost.evil.com', (closeOf((await tryOrigin('http://localhost.evil.com', 'w', { ALLOW_LOCALHOST: '1' })).r) || {}).code === 4403);
  ok('parseOrigins: <space>= entries only, junk ignored, comma or space separated, a trailing slash dropped', R.parseOrigins('w=https://a.example, javascript:alert(1)  p=https://b.example/ x=https://c.example https://d.example w=* t=https://e.example').length === 3);
  // ---- version, role
  for (const [q, code] of [['?role=h', 4426], ['?v=2&role=h', 4426], ['?v=1', 4400], ['?v=1&role=x', 4400]]) {
    res = await R.route(req('/r/w/abcd' + q), env(), io());
    ok(`worker: ${q} -> ${code}`, (closeOf(res) || {}).code === code, closeOf(res));
  }
  // ---- the connect limiter
  {
    const lim = R.makeLimiter();
    let last = null, n = 0;
    for (let i = 0; i < 31; i++) { const e = env(); last = await R.route(req('/r/w/abcd?v=1&role=g'), e, io({ limiter: lim })); if (reached(last)) n++; }
    ok('worker: the isolate count lets 30 connects a minute per IP in, the 31st -> 4429', n === 30 && (closeOf(last) || {}).code === 4429, n);
    now += 61000;
    ok('worker: ... a minute later it lets in again', reached(await R.route(req('/r/w/abcd?v=1&role=g'), env(), io({ limiter: lim }))));
    const other = await R.route(req('/r/w/abcd?v=1&role=g', { headers: { 'CF-Connecting-IP': '198.51.100.1' } }), env(), io({ limiter: lim }));
    ok('worker: ... another IP has its own count', reached(other));
    const calls = [];
    const bind = (success) => ({ limit: async (o) => { calls.push(o.key); return { success }; } });
    ok('worker: the CONNECT_RATE binding decides when bound (success false -> 4429)', (closeOf(await R.route(req('/r/w/abcd?v=1&role=g'), env({ CONNECT_RATE: bind(false) }), io())) || {}).code === 4429 && calls[0] === '203.0.113.7');
    const lim2 = R.makeLimiter(); let m = 0;
    for (let i = 0; i < 31; i++) if (reached(await R.route(req('/r/w/abcd?v=1&role=g'), env({ CONNECT_RATE: { limit: async () => { throw new Error('binding down'); } } }), io({ limiter: lim2 })))) m++;
    ok('worker: a failing binding falls back to the isolate count', m === 30, m);
    const v6 = R.makeLimiter(); let a6 = 0;
    for (let i = 0; i < 31; i++) if (reached(await R.route(req('/r/w/abcd?v=1&role=g', { headers: { 'CF-Connecting-IP': '2001:db8:1:2:' + (i + 1).toString(16) + '::7' } }), env(), io({ limiter: v6 })))) a6++;
    ok('worker: IPv6: addresses of one /64 share one count', a6 === 30, a6);
    ok('worker: ... another /64 does not', reached(await R.route(req('/r/w/abcd?v=1&role=g', { headers: { 'CF-Connecting-IP': '2001:db8:1:3::7' } }), env(), io({ limiter: v6 }))));
    ok('ipKey: v4 as is, v6 cut to its /64 (zeros, ::), mapped v4, missing',
      R.ipKey('203.0.113.7') === '203.0.113.7' && R.ipKey('2001:DB8:0001:0002:3:4:5:6') === '2001:db8:1:2::/64' && R.ipKey('2001:db8::1') === '2001:db8:0:0::/64' && R.ipKey('::ffff:192.0.2.1') === '192.0.2.1' && R.ipKey('') === 'unknown' && R.ipKey(null) === 'unknown');
  }
  // ---- the Durable Object hand-off
  {
    const e = env();
    res = await R.route(req('/r/p/k7k7?v=1&role=g', { headers: { Origin: PREVIEWS[0] } }), e, io());
    ok('worker: the Durable Object is named "<space>:<code>" and its 101 is passed on', reached(res) && e.ROOMS.names[0] === 'p:k7k7' && res.webSocket.stub === 'p:k7k7');
    for (const [name, behave, why] of [
      ['throws "Exceeded allowed volume of requests"', () => { throw new Error('Exceeded allowed volume of requests in this account'); }, 'cap'],
      ['throws something else', () => { throw new Error('boom'); }, 'busy'],
      ['answers 500 "... daily request limit ..."', () => new FakeResponse('Durable Objects daily request limit reached', { status: 500 }), 'cap'],
      ['answers 500 "oops"', () => new FakeResponse('oops', { status: 500 }), 'busy'],
      ['answers 200 without a webSocket', () => new FakeResponse('x', { status: 200 }), 'busy'],
      ['answers a quota error text', () => new FakeResponse('quota', { status: 429 }), 'cap'],
    ]) {
      const r = await R.route(req('/r/w/abcd?v=1&role=h'), env({ ROOMS: rooms(behave) }), io());
      ok(`worker: a Durable Object that ${name} -> 4503 ${why}`, (closeOf(r) || {}).code === 4503 && closeOf(r).reason === why, closeOf(r));
    }
  }
  // ---- index.js (the entry): the health route through the platform's own Response
  {
    const I = await imp('index.js');
    const r = await I.default.fetch(req('/', { headers: { Upgrade: null, Origin: null } }), {});
    ok('index.js: fetch -> route (GET / answers 200 JSON) and exports Room', r.status === 200 && JSON.parse(await r.text()).service === 'ppodeuk-relay' && typeof I.Room === 'function');
  }
}

// ==================================================================================== the Durable Object (room-do.js)
async function testDO() {
  const D = await imp('room-do.js');
  const R = await imp('room.js');
  const saved = { WebSocketPair: globalThis.WebSocketPair, Response: globalThis.Response, WebSocketRequestResponsePair: globalThis.WebSocketRequestResponsePair };
  class DOSock {
    constructor(side) { this.side = side; this.out = []; this.closedWith = null; this.att = null; this.autoAt = 0; }
    send(s) { if (this.closedWith) throw new Error('closed'); this.out.push(s); }
    close(code, reason) { if (!this.closedWith) this.closedWith = { code, reason }; }
    serializeAttachment(a) { this.att = JSON.parse(JSON.stringify(a)); }
    deserializeAttachment() { return this.att; }
  }
  globalThis.WebSocketPair = class { constructor() { this[0] = new DOSock('client'); this[1] = new DOSock('server'); this[0].server = this[1]; } };
  globalThis.Response = FakeResponse;
  globalThis.WebSocketRequestResponsePair = class { constructor(rq, rs) { this.request = rq; this.response = rs; } };
  try {
    const ctx = {
      socks: [], auto: null,
      acceptWebSocket(ws) { this.socks.push(ws); },
      getWebSockets() { return this.socks.filter((w) => !w.closedWith && !w.gone); },
      setWebSocketAutoResponse(p) { this.auto = p; },
      getWebSocketAutoResponseTimestamp(ws) { return ws.autoAt ? new Date(ws.autoAt) : null; },
    };
    let room = new D.Room(ctx, {});
    ok('do: the constructor registers the keepalive auto-response {"k":"p"} -> {"k":"P"}', ctx.auto && ctx.auto.request === R.PING && ctx.auto.response === R.PONG);
    const connect = async (role, extra) => { const r = await room.fetch({ url: 'https://x.workers.dev/r/w/abcd?v=1&role=' + role + (extra || '') }); const s = r.webSocket && r.webSocket.server; return { r, s, hi: s && s.out.length ? JSON.parse(s.out[0]) : null }; };
    const h = await connect('h');
    ok('do: fetch -> 101 with the client end, the server end accepted (hibernatable) and given hi', h.r.status === 101 && h.r.webSocket.side === 'client' && ctx.socks.includes(h.s) && h.hi && h.hi.k === 'hi' && h.hi.h === h.hi.id);
    ok('do: the seat lives in the socket attachment', h.s.att && h.s.att.i === h.hi.id && h.s.att.r === 'h' && h.s.att.k === h.hi.tok);
    const h2 = await connect('h');
    ok('do: a refused connect still answers 101, its socket closed 4409', h2.r.status === 101 && h2.s.closedWith && h2.s.closedWith.code === 4409);
    const g = await connect('g');
    room.webSocketMessage(g.s, JSON.stringify({ k: 'r', t: h.hi.id, d: { c: 'hello' } }));
    room.webSocketMessage(h.s, JSON.stringify({ k: 'm', l: [g.hi.id] }));
    ok('do: webSocketMessage routes (a guest\'s hello reaches the host)', h.s.out.some((x) => JSON.parse(x).f === g.hi.id));
    h.s.autoAt = 1234567;
    ok('do: heard() reads getWebSocketAutoResponseTimestamp as ms', room.wake().io.heard(h.s) === 1234567 && room.wake().io.heard(g.s) === 0);
    // hibernation: the object leaves memory, the sockets stay; the next event rebuilds the core from the attachments
    room = new D.Room(ctx, {});
    g.s.out = [];
    room.webSocketMessage(h.s, JSON.stringify({ k: 's', q: 1, d: { w: 1 } }));
    ok('do: a new instance (a wake) rebuilds the room from the attachments: members kept, states routed', g.s.out.length === 1 && JSON.parse(g.s.out[0]).f === h.hi.id);
    room.core = null;
    room.webSocketMessage(h.s, JSON.stringify({ k: 's', q: 2, d: { w: 2 } }));
    ok('do: ... and again after the core was dropped', g.s.out.length === 2);
    const g2 = await connect('g');
    h.s.out = [];
    room.webSocketClose(g2.s, 1001, '', true);
    ok('do: webSocketClose ends the seat (the host hears gone) and completes the close', h.s.out.some((x) => { const m = JSON.parse(x); return m.k === 'gone' && m.f === g2.hi.id; }) && g2.s.closedWith && g2.s.closedWith.code === 1000);
    // a socket that closes while the object slept: the runtime no longer lists it - its attachment tells the seat
    room = new D.Room(ctx, {});
    g.s.gone = true;
    h.s.out = [];
    room.webSocketClose(g.s, 1006, '', false);
    ok('do: a socket closing into a woken object (not listed any more): its seat is told gone from the attachment', h.s.out.some((x) => { const m = JSON.parse(x); return m.k === 'gone' && m.f === g.hi.id && m.why === 'lost'; }));
    room.webSocketError(h.s);
    ok('do: webSocketError ends the seat too (the host: the room is empty)', room.wake().info().host === null);
  } finally {
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; }
  }
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
  for (const f of ['room.js', 'room-do.js']) {
    const code = strip(fs.readFileSync(path.join(CF, 'src', f), 'utf8'));
    const bad = code.match(/\b(setTimeout|setInterval|setAlarm|await|storage)\b/g);
    ok(`do: ${f} has no timer, alarm, storage or await (they block hibernation / let events interleave)`, !bad, bad);
  }
}

// ==================================================================================== wrangler.toml, package.json
function testToml() {
  const t = tomlText();
  ok('toml: name ppodeuk-relay, main src/index.js, workers_dev', /^name = "ppodeuk-relay"$/m.test(t) && /^main = "src\/index\.js"$/m.test(t) && /^workers_dev = true$/m.test(t));
  const cd = (t.match(/^compatibility_date = "(\d{4}-\d{2}-\d{2})"$/m) || [])[1];
  ok('toml: a compatibility_date on or after 2026-04-07 (the runtime answers close frames)', !!cd && cd >= '2026-04-07', cd);
  ok('toml: the ROOMS binding to class Room', /\[\[durable_objects\.bindings\]\]\s*\nname = "ROOMS"\s*\nclass_name = "Room"/.test(t));
  ok('toml: the v1 migration with new_sqlite_classes ["Room"] (the class kind Workers Free allows)', /\[\[migrations\]\]\s*\ntag = "v1"\s*\nnew_sqlite_classes = \["Room"\]/.test(t));
  const want = 'w=https://bubble-c3ad4.web.app w=https://bubble-c3ad4.firebaseapp.com w=https://bobo33772-blip.github.io p=https://bubble-c3ad4--*.web.app t=https://ppodeuk-bath.apps.tossmini.com t=https://ppodeuk-bath.private-apps.tossmini.com';
  ok('toml: ORIGINS is exactly the live sites (w), the preview pattern (p), the Toss origins (t)', tomlVar('ORIGINS') === want, tomlVar('ORIGINS'));
  ok('toml: ALLOW_LOCALHOST = "0"', tomlVar('ALLOW_LOCALHOST') === '0');
  ok('toml: the CONNECT_RATE limiter: 30 a minute', /\[\[ratelimits\]\]\s*\nname = "CONNECT_RATE"\s*\nnamespace_id = "\d+"\s*\n\s*\[ratelimits\.simple\]\s*\n\s*limit = 30\s*\n\s*period = 60/.test(t));
  ok('toml: observability off', /\[observability\]\s*\nenabled = false/.test(t));
  ok('toml: no secret, no TURN', !/secret|token|TURN_|api[_-]?key/i.test(t.replace(/^#.*$/gm, '')));
  const pk = JSON.parse(fs.readFileSync(path.join(CF, 'package.json'), 'utf8'));
  const wv = (pk.devDependencies || {}).wrangler || '';
  const [ma, mi] = wv.split('.').map(Number);
  ok('package.json: type module, private, wrangler pinned to an exact 4.x >= 4.36.0', pk.type === 'module' && pk.private === true && /^\d+\.\d+\.\d+$/.test(wv) && ma === 4 && mi >= 36, wv);
}

// ==================================================================================== the local relay (tools/ws-relay.js)
// (node's own WebSocket client sends an Origin only through its non-standard {headers} option: probed first - an older
// node 22 without it skips this group, it does not fail it)
function originProbe() {
  return new Promise((resolve) => {
    if (typeof WebSocket !== 'function') { resolve(false); return; }
    const s = http.createServer();
    s.on('upgrade', (q, sock) => { resolve(q.headers.origin === 'http://localhost:1'); sock.destroy(); s.close(); });
    s.listen(0, '127.0.0.1', () => {
      try { const w = new WebSocket(`ws://127.0.0.1:${s.address().port}/`, { headers: { Origin: 'http://localhost:1' } }); w.onerror = () => {}; } catch (e) { resolve(false); s.close(); }
    });
    setTimeout(() => { resolve(false); s.close(); }, 3000).unref();
  });
}
async function testLocal() {
  if (!(await originProbe())) { console.log('RELAY-NODE SKIP local: this node\'s WebSocket client cannot send an Origin header'); return; }
  const relay = require('./ws-relay').create({ base: '/ws' });
  await relay.ready();
  const srv = http.createServer((q, s) => { if (!relay.admin(q, s)) { s.writeHead(404); s.end(); } });
  srv.on('upgrade', relay.upgrade);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port, base = `ws://127.0.0.1:${port}/ws`, ORIGIN = `http://localhost:${port}`;
  const admin = (p) => new Promise((r) => http.get(`http://127.0.0.1:${port}/ws-admin/${p}`, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => r(JSON.parse(b))); }));
  const open = (pth, o) => new Promise((resolve) => {
    const w = new WebSocket(base + pth, o && o.noOrigin ? undefined : { headers: { Origin: (o && o.origin) || ORIGIN } });
    const c = { w, msgs: [], close: null };
    w.onmessage = (e) => c.msgs.push(String(e.data));
    w.onclose = (e) => { c.close = { code: e.code, reason: e.reason }; resolve(c); };
    w.onerror = () => {};
    w.onopen = () => resolve(c);
    c.wait = async (pred, ms) => { const t0 = Date.now(); while (!pred(c)) { if (Date.now() - t0 > (ms || 3000)) return false; await sleep(10); } return true; };
  });
  const hiOf = (c) => (c.msgs.length ? JSON.parse(c.msgs[0]) : null);
  try {
    const h = await open('/r/w/abcd?v=1&role=h');
    await h.wait((c) => c.msgs.length >= 1);
    const hh = hiOf(h);
    ok('local: the handshake (101), then hi from the real RoomCore', hh && hh.k === 'hi' && hh.h === hh.id && !h.close, h.msgs);
    const g = await open('/r/w/abcd?v=1&role=g');
    await g.wait((c) => c.msgs.length >= 1);
    const gh = hiOf(g);
    g.w.send(JSON.stringify({ k: 'r', t: hh.id, d: { c: 'hello', pad: 'p'.repeat(300) } }));
    await h.wait((c) => c.msgs.length >= 2);
    const got = h.msgs[1] ? JSON.parse(h.msgs[1]) : null;
    ok('local: a masked client frame (16-bit length) in, stamped out to the host', got && got.f === gh.id && got.d.c === 'hello' && got.d.pad.length === 300, h.msgs[1] && h.msgs[1].slice(0, 80));
    h.w.send(JSON.stringify({ k: 'm', l: [gh.id] }));
    h.w.send(JSON.stringify({ k: 's', q: 1, d: { big: 'b'.repeat(3000) } }));
    await g.wait((c) => c.msgs.length >= 2);
    ok('local: a host state out to the member', g.msgs[1] && JSON.parse(g.msgs[1]).d.big.length === 3000);
    g.w.send(R_PING);
    await g.wait((c) => c.msgs.includes('{"k":"P"}'));
    ok('local: the keepalive is answered by the relay itself (as the auto-response)', g.msgs.includes('{"k":"P"}'));
    const info = await admin('info');
    ok('local: /ws-admin/info lists the room and its seats', info.rooms['w:abcd'] && info.rooms['w:abcd'].seats === 2 && info.rooms['w:abcd'].host === hh.id, info);
    const h2 = await open('/r/w/abcd?v=1&role=h');
    await h2.wait((c) => c.close);
    ok('local: a second host -> close 4409 passed through', h2.close && h2.close.code === 4409, h2.close);
    const nf = await open('/r/w/zzzz?v=1&role=g');
    await nf.wait((c) => c.close);
    ok('local: a guest to an empty room -> 4404', nf.close && nf.close.code === 4404, nf.close);
    const no = await open('/r/w/abcd?v=1&role=g', { noOrigin: true });
    await no.wait((c) => c.close);
    ok('local: no Origin -> 4403 (the real gate)', no.close && no.close.code === 4403, no.close);
    const vv = await open('/r/w/abcd?v=9&role=g');
    await vv.wait((c) => c.close);
    ok('local: a wrong relay version -> 4426', vv.close && vv.close.code === 4426, vv.close);
    const big = await open('/r/w/abcd?v=1&role=g');
    await big.wait((c) => c.msgs.length >= 1);
    big.w.send(JSON.stringify({ k: 'r', t: hh.id, d: 'x'.repeat(70 * 1024) }));
    await big.wait((c) => c.close, 4000);
    ok('local: a 70 KB frame (64-bit length) is refused: the socket closes 1009', big.close && big.close.code === 1009, big.close);
    const kill = await admin('kill?code=abcd');
    await h.wait((c) => c.close); await g.wait((c) => c.close);
    ok('local: /ws-admin/kill destroys that room\'s sockets (the pages see 1006)', kill.killed >= 2 && h.close && h.close.code === 1006 && g.close && g.close.code === 1006, { kill, h: h.close, g: g.close });
    const a = await open('/r/w/qqqq?v=1&role=h'), b = await open('/r/p/qqqq?v=1&role=h');
    await a.wait((c) => c.msgs.length >= 1); await b.wait((c) => c.msgs.length >= 1);
    ok('local: spaces are apart (the same code hosted in w and p)', !a.close && !b.close && a.msgs.length === 1 && b.msgs.length === 1);
    await admin('restart');
    await a.wait((c) => c.close); await b.wait((c) => c.close);
    ok('local: /ws-admin/restart closes everything 1012', a.close && a.close.code === 1012 && b.close && b.close.code === 1012, [a.close, b.close]);
    await admin('cap?on=1');
    const cp = await open('/r/w/abcd?v=1&role=h');
    await cp.wait((c) => c.close);
    ok('local: /ws-admin/cap?on=1 -> new connects 4503 "cap"', cp.close && cp.close.code === 4503 && cp.close.reason === 'cap', cp.close);
    await admin('cap?on=0');
    const back = await open('/r/w/abcd?v=1&role=h');
    await back.wait((c) => c.msgs.length >= 1);
    ok('local: cap?on=0 -> rooms again', back.msgs.length === 1 && !back.close);
    back.w.close(1000);
    await back.wait((c) => c.close);
    await sleep(50);
    ok('local: a closed room is forgotten', !(await admin('info')).rooms['w:abcd']);
  } finally {
    relay.close();
    srv.close();
  }
}
const R_PING = '{"k":"p"}';

// ==================================================================================== build.js on a copy of the sources
function testBuild() {
  const read = (f) => fs.readFileSync(f, 'utf8');
  const B = path.join(T, 'relay-build'), SRCD = path.join(B, 'bogeul'), TMP = path.join(B, 'tmp');
  fs.rmSync(B, { recursive: true, force: true });
  fs.mkdirSync(path.join(SRCD, 'tools'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'build.js'), path.join(SRCD, 'build.js'));
  for (const f of ['pack-itch.js', 'fb-config.js', 'toss-rules.js']) fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(SRCD, 'tools', f));
  fs.cpSync(path.join(ROOT, 'src'), path.join(SRCD, 'src'), { recursive: true, filter: (p) => path.basename(p) !== 'tests' });
  const build = (env) => {
    const e = Object.assign({}, process.env, { PG_BUILD_TEMP: TMP }, env || {});
    for (const k of ['PG_FIREBASE_CONFIG', 'PG_PREVIEW', 'PG_TURN_CONFIG', 'PG_RELAY_URL']) if (!(env && k in env)) delete e[k];
    const r = spawnSync(process.execPath, [path.join(SRCD, 'build.js')], { encoding: 'utf8', env: e, cwd: SRCD });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), dep: r.status === 0 ? read(path.join(SRCD, 'deploy', 'index.html')) : null, art: r.status === 0 ? read(path.join(SRCD, 'dist', 'ppogeul-bath.html')) : null };
  };
  const tags = (h) => (h.match(/<script id="pg-relay">/g) || []).length;
  const bare = (h) => h.replace(/<script id="pg-relay">[^<]*<\/script>\n/, '').replace(/<meta name="pg-build" content="[0-9a-f]+">/, '');
  const itchPage = () => { const z = require('./pack-itch').unzip(fs.readFileSync(path.join(SRCD, 'deploy', 'ppodeuk-bath-itch.zip'))); const e = z.find((x) => x.name === 'index.html'); return e ? e.data.toString('utf8') : ''; };
  const plain = build();
  if (!ok('build copy: builds without a relay URL ("no relay" in its line)', plain.status === 0 && /no relay/.test(plain.out), plain.out.slice(-400))) return;
  ok('build copy: ... the deploy page has not a trace of the relay', tags(plain.dep) === 0 && !/PG_RELAY\s*=|pg-relay/.test(plain.dep));
  const none = build({ PG_RELAY_URL: 'none' });
  ok('build copy: PG_RELAY_URL=none -> the same deploy page byte for byte', none.status === 0 && none.dep === plain.dep);
  const U = 'https://ppodeuk-relay.test-acct.workers.dev';
  const withR = build({ PG_RELAY_URL: U + '/' });
  if (ok('build copy: PG_RELAY_URL builds ("relay: <url>" in its line, the trailing slash dropped)', withR.status === 0 && withR.out.includes('relay: ' + U + ';'), withR.out.slice(-400))) {
    ok('build copy: exactly one line <script id="pg-relay">window.PG_RELAY={url:"..."};</script>', tags(withR.dep) === 1 && withR.dep.includes(`<script id="pg-relay">window.PG_RELAY={url:${JSON.stringify(U)}};</script>\n`));
    ok('build copy: it sits right before the PeerJS tag; still one static <script src>', /<script id="pg-relay">[^<]*<\/script>\n<script defer src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/peerjs\//.test(withR.dep) && (withR.dep.match(/<script\b[^>]*\bsrc\s*=/gi) || []).length === 1);
    ok('build copy: otherwise the same page (only the tag and the build hash differ)', bare(withR.dep) === bare(plain.dep));
    ok('build copy: a relay makes another build hash (installed apps update)', (withR.dep.match(/pg-build" content="([0-9a-f]+)"/) || [])[1] !== (plain.dep.match(/pg-build" content="([0-9a-f]+)"/) || [])[1]);
    ok('build copy: dist/ is byte for byte the build without (the artifact never gets the relay) and names no Worker', withR.art === plain.art && !/PG_RELAY\s*=|pg-relay|workers\.dev/.test(withR.art));
    const ip = itchPage();
    ok('build copy: the itch zip\'s page has no relay (otherwise the same page)', ip.length > 1000 && !/pg-relay|PG_RELAY\s*=|workers\.dev/.test(ip));
  }
  const pv = build({ PG_RELAY_URL: U, PG_PREVIEW: '7' });
  ok('build copy: a PR preview names the space p (its rooms never meet the live game\'s)', pv.status === 0 && tags(pv.dep) === 1 && pv.dep.includes(`window.PG_RELAY={url:${JSON.stringify(U)},space:"p"};`) && /미리보기 #7/.test(pv.dep), pv.out.slice(-300));
  const pv0 = build({ PG_PREVIEW: '7' });
  ok('build copy: a PR preview without a relay has none', pv0.status === 0 && tags(pv0.dep) === 0);
  fs.writeFileSync(path.join(SRCD, 'relay.config.json'), '\uFEFF{"url": "https://file-relay.test-acct.workers.dev"}\n');
  const file = build();
  ok('build copy: relay.config.json (a BOM too) is read', file.status === 0 && tags(file.dep) === 1 && file.dep.includes('"https://file-relay.test-acct.workers.dev"'), file.out.slice(-300));
  const envWins = build({ PG_RELAY_URL: U });
  ok('build copy: PG_RELAY_URL wins over the file', envWins.status === 0 && envWins.dep.includes(JSON.stringify(U)) && !envWins.dep.includes('file-relay'));
  const noneWins = build({ PG_RELAY_URL: 'none' });
  ok('build copy: PG_RELAY_URL=none wins over the file (byte for byte the page without)', noneWins.status === 0 && noneWins.dep === plain.dep);
  ok('build copy: an empty PG_RELAY_URL (an unset CI variable) falls to the file', (() => { const r = build({ PG_RELAY_URL: '' }); return r.status === 0 && r.dep.includes('file-relay'); })());
  fs.writeFileSync(path.join(SRCD, 'relay.config.json'), '{"url": ""}');
  ok('build copy: {"url": ""} = no relay', (() => { const r = build(); return r.status === 0 && r.dep === plain.dep; })());
  fs.writeFileSync(path.join(SRCD, 'relay.config.json'), '{url: oops');
  const before = fs.statSync(path.join(SRCD, 'deploy', 'index.html')).mtimeMs;
  const broken = build();
  ok('build copy: a broken relay.config.json stops the build with its message, before anything is written', broken.status !== 0 && /relay\.config\.json: 읽을 수 없어요 \/ cannot be parsed/.test(broken.out) && fs.statSync(path.join(SRCD, 'deploy', 'index.html')).mtimeMs === before, broken.out.split('\n').slice(0, 4).join(' | '));
  fs.rmSync(path.join(SRCD, 'relay.config.json'));
  for (const bad of ['http://relay.example.com', 'javascript:alert(1)', 'https://relay.example.com/r?x=1', 'https://relay.example.com/"><script>', 'https://localhost', 'relay.example.com', 'https://a b.example.com', 'wss://relay.example.com']) {
    const r = build({ PG_RELAY_URL: bad });
    ok(`build copy: a bad relay URL stops the build: ${bad}`, r.status !== 0 && /중계 서버 주소가 이상해요 \/ bad relay URL/.test(r.out), r.out.split('\n').slice(0, 3).join(' | '));
  }
  ok('build copy: http://127.0.0.1:<port> is accepted (local tests)', build({ PG_RELAY_URL: 'http://127.0.0.1:8787' }).status === 0);
  fs.rmSync(B, { recursive: true, force: true });
}

(async () => {
  const groups = [['room', testRoom], ['worker', testWorker], ['do', testDO], ['toml', testToml], ['local', testLocal], ['build', testBuild]];
  for (const [g, fn] of groups) {
    if (!want(g)) continue;
    try { await fn(); } catch (e) { ok(`${g}: crashed`, false, String(e && e.stack || e)); }
  }
  console.log(`RELAY-NODE ${fails ? 'FAIL' : 'OK'}: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
