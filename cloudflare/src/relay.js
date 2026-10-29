// The relay Worker's front door (design/relay.md 3.3 / 3.4). cloudflare/src/index.js is the entry Cloudflare runs; the
// node tests run this file with fakes, and the local test relay (tools/ws-relay.js) puts gate() in front of its rooms
// too. Nothing here reads a global but URL / Response / WebSocketPair (the last two can come in io for the tests).
// Routes:
//   GET /                      {ok, service, v} - a health check to open in a browser after `npx wrangler deploy`
//   GET /r/<space>/<code>      a WebSocket upgrade into that room's Durable Object (space w = the web game, p = PR
//                              previews, t = Toss; code = the 4-character room code, [a-z0-9]{4})
// Refusals happen HERE, before any Durable Object is touched (they cost a Worker request, never a Durable Object
// request). A page only sees a close code on a socket that was accepted, so the Worker accepts its OWN WebSocketPair
// and closes it at once (a plain HTTP error would reach the page as an anonymous 1006):
//   4400 a bad path / role, 4403 an Origin not allowed for that space, 4426 a relay version other than 1, 4429 more than
//   30 connects a minute from one IP (the CONNECT_RATE binding, else this isolate's count), 4503 the Durable Object
//   threw or answered something other than a 101 (reason 'cap' when it reads like the free-tier limit, else 'busy').
//   Not an upgrade: 404 for any other path, 426 for a room path.

export const RELAY_V = 1;
export const SPACES = ['w', 'p', 't'];
export const RATE_LIMIT = 30, RATE_WINDOW_MS = 60000;
const PATH_RE = /^\/r\/(w|p|t)\/([a-z0-9]{4})$/;
const LOCAL_RE = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;
const ORIGIN_RE = /^https?:\/\/[a-z0-9*.-]+(?::\d{1,5})?$/;
// (the exact words of Cloudflare's free-tier error are not documented: a guess; a miss only shows hintDown, not hintCap)
const CAP_RE = /exceed|limit|quota/i;

// ------------------------------------------------------------------ origins and spaces
// ORIGINS -> [{space, exact} | {space, re}]: "<space>=<origin>" entries, space- or comma-separated; '*' matches one or
// more of [a-z0-9-] (one host label part, never a dot, so never another domain). Anything else is ignored
export function parseOrigins(s) {
  const out = [];
  for (const raw of String(s || '').split(/[\s,]+/)) {
    const m = /^([a-z])=(.+)$/i.exec(raw.trim());
    if (!m || !SPACES.includes(m[1].toLowerCase())) continue;
    const space = m[1].toLowerCase(), o = m[2].toLowerCase().replace(/\/+$/, '');
    if (!ORIGIN_RE.test(o)) continue;
    if (!o.includes('*')) { out.push({ space, exact: o }); continue; }
    out.push({ space, re: new RegExp('^' + o.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')).join('[a-z0-9-]+') + '$') });
  }
  return out;
}
const originCache = new Map();
// may a page of `origin` enter `space`? Loopback pages may enter any space, only with ALLOW_LOCALHOST=1
export function originAllowed(origin, space, env) {
  if (typeof origin !== 'string' || !origin || origin.length > 200 || origin === 'null' || !SPACES.includes(space)) return false;
  const o = origin.toLowerCase();
  if (LOCAL_RE.test(o)) return /^(1|true|yes)$/i.test(String((env && env.ALLOW_LOCALHOST) || ''));
  const key = String((env && env.ORIGINS) || '');
  let list = originCache.get(key);
  if (!list) { list = parseOrigins(key); if (originCache.size > 8) originCache.clear(); originCache.set(key, list); }
  return list.some((r) => r.space === space && (r.exact ? r.exact === o : r.re.test(o)));
}

// ------------------------------------------------------------------ abuse guard
// a fixed-window counter per key in this isolate's memory (best effort: isolates come and go; the CONNECT_RATE binding,
// when bound, is the one that counts per Cloudflare location)
export function makeLimiter(limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS, max = 5000) {
  const hits = new Map();
  return (key, t) => {
    let h = hits.get(key);
    if (!h || t - h.t0 >= windowMs) {
      if (!h && hits.size >= max) hits.clear();
      h = { t0: t, n: 0 };
      hits.set(key, h);
    }
    h.n++;
    return h.n <= limit;
  };
}
// the limiter's key: an IPv4 address as it is, an IPv6 address cut to its /64 (one phone or home gets a whole /64)
export function ipKey(ip) {
  const s = String(ip || '').trim().toLowerCase();
  if (!s.includes(':')) return s || 'unknown';
  const v4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (v4) return v4[1];
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [], t = tail !== undefined ? (tail ? tail.split(':') : []) : null;
  const groups = t === null ? h : h.concat(Array(Math.max(0, 8 - h.length - t.length)).fill('0'), t);
  return groups.slice(0, 4).map((g) => (g.replace(/^0+(?=.)/, '') || '0')).join(':') + '::/64';
}
async function allowed(req, env, io) {
  const key = ipKey(req.headers.get('CF-Connecting-IP'));
  if (env && env.CONNECT_RATE && typeof env.CONNECT_RATE.limit === 'function') {
    try { const r = await env.CONNECT_RATE.limit({ key }); if (r && typeof r.success === 'boolean') return r.success; } catch (e) { /* binding trouble: the isolate's count below */ }
  }
  return io && io.limiter ? io.limiter(key, io.now ? io.now() : Date.now()) : true;
}

// ------------------------------------------------------------------ the gate: may this request enter a room?
// -> {ok: true, space, code, role} | {http: status} (not a WebSocket upgrade) | {close: code, reason} (refuse the socket)
export async function gate(req, env, io) {
  env = env || {};
  let u;
  try { u = new URL(req.url); } catch (e) { return { http: 404 }; }
  const up = /^websocket$/i.test(req.headers.get('Upgrade') || '');
  const m = PATH_RE.exec(u.pathname);
  if (!m) return up ? { close: 4400, reason: 'bad' } : { http: 404 };
  if (!up) return { http: 426 };
  const space = m[1], code = m[2];
  if (!originAllowed(req.headers.get('Origin'), space, env)) return { close: 4403, reason: 'origin' };
  const q = u.searchParams;
  if (q.get('v') !== String(RELAY_V)) return { close: 4426, reason: 'version' };
  const role = q.get('role');
  if (role !== 'h' && role !== 'g') return { close: 4400, reason: 'bad' };
  if (!(await allowed(req, env, io))) return { close: 4429, reason: 'rate' };
  return { ok: true, space, code, role };
}

// ------------------------------------------------------------------ responses
const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
function json(io, status, body) {
  const R = (io && io.Response) || Response;
  return new R(JSON.stringify(body), { status, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, HEADERS) });
}
function plain(io, status, text) {
  const R = (io && io.Response) || Response;
  return new R(text, { status, headers: Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, HEADERS) });
}
// accept a socket of our own and close it with `code`: the page reads the code (2.5)
export function refusal(code, reason, io) {
  const Pair = (io && io.WebSocketPair) || globalThis.WebSocketPair;
  const R = (io && io.Response) || Response;
  const pair = new Pair();
  const client = pair[0], server = pair[1];
  server.accept();
  server.close(code, reason);
  return new R(null, { status: 101, webSocket: client });
}
const TEXTS = { 404: 'not found', 405: 'method not allowed', 426: 'a WebSocket upgrade is required' };

// req: a Request; env: the Worker's vars and bindings (ORIGINS, ALLOW_LOCALHOST, ROOMS, CONNECT_RATE); io: {limiter?,
// now?, Response?, WebSocketPair?}
export async function route(req, env, io) {
  env = env || {};
  io = io || {};
  let path = '/';
  try { path = new URL(req.url).pathname; } catch (e) { return plain(io, 404, TEXTS[404]); }
  if (path === '/') {
    if (req.method !== 'GET' && req.method !== 'HEAD') return plain(io, 405, TEXTS[405]);
    return json(io, 200, { ok: true, service: 'ppodeuk-relay', v: RELAY_V });
  }
  const g = await gate(req, env, io);
  if (g.http) return plain(io, g.http, TEXTS[g.http] || 'error');
  if (!g.ok) return refusal(g.close, g.reason, io);
  let res = null, err = null;
  try {
    const ns = env.ROOMS;
    res = await ns.get(ns.idFromName(g.space + ':' + g.code)).fetch(req);
  } catch (e) { err = e; }
  if (!err && res && res.status === 101 && res.webSocket) return res;
  // (how an exhausted free tier answers is not documented: a throw, or a plain error answer - both read for 'cap')
  let why = err ? String((err && err.message) || err) : '';
  if (!err && res) { try { why = String(await res.text()).slice(0, 200); } catch (e) { why = ''; } }
  return refusal(4503, CAP_RE.test(why) ? 'cap' : 'busy', io);
}
