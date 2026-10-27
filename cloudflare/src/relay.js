// The relay Worker's logic (cloudflare/src/index.js is the entry Cloudflare runs; tools/relay-worker-test.js runs this
// file in node with a fake Cloudflare API). Nothing here reads a global but Request / Response / URL / AbortSignal.
// Routes (ROUTES below; one table so the WebSocket relay of PR 2 - /room/<code> on a Durable Object - slots in):
//   GET /       {ok, service} - a health check to open in a browser after `npx wrangler deploy`
//   GET /turn   fresh TURN credentials for the game's online rooms: POSTs {"ttl": 7200} to Cloudflare Realtime TURN
//               (rtc.live.cloudflare.com/v1/turn/keys/<TURN_KEY_ID>/credentials/generate-ice-servers, Bearer
//               <TURN_KEY_API_TOKEN> - both Worker secrets, never in code or a response) and answers 200
//               {iceServers, ttl}: every entry checked (stun: / turn: / turns: URLs only, none on port 53 - browsers
//               block it and the gathering would wait for its timeout - a TURN entry with its username + credential),
//               nothing else of the upstream answer passed on.
// Every answer: JSON, Cache-Control: no-store, Vary: Origin. CORS only for an allowed Origin (ALLOWED_ORIGINS: exact
// origins and '*' patterns; localhost only with ALLOW_LOCALHOST=1); OPTIONS answers the preflight.
// Errors: 403 origin (a missing / other Origin - also a browser opening /turn directly), 404, 405, 429 rate_limited
// (TURN_RATE binding per location, else per isolate: 10 a minute per client IP), 503 not_configured (secrets
// missing), 502 upstream / upstream_unreachable / upstream_empty (the upstream's own body is never echoed).

export const TTL = 7200;                 // seconds the minted credentials live (Cloudflare allows up to 48 h)
export const UPSTREAM_MS = 5000;         // the Cloudflare API gets this long
export const RATE_LIMIT = 10, RATE_WINDOW_MS = 60000;
const API = 'https://rtc.live.cloudflare.com/v1/turn/keys/';
const KEY_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

// ------------------------------------------------------------------ origins
const LOCAL_RE = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/;
const ORIGIN_RE = /^https?:\/\/[a-z0-9*.-]+(?::\d{1,5})?$/;
// ALLOWED_ORIGINS -> [{exact} | {re}]: '*' matches one or more of [a-z0-9-] (never a dot, so never another domain)
export function parseOrigins(s) {
  const out = [];
  for (const raw of String(s || '').split(/[\s,]+/)) {
    const o = raw.trim().toLowerCase().replace(/\/+$/, '');
    if (!o || !ORIGIN_RE.test(o)) continue;
    if (!o.includes('*')) { out.push({ exact: o }); continue; }
    out.push({ re: new RegExp('^' + o.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')).join('[a-z0-9-]+') + '$') });
  }
  return out;
}
const originCache = new Map();
export function originAllowed(origin, env) {
  if (typeof origin !== 'string' || !origin || origin.length > 200 || origin === 'null') return false;
  const o = origin.toLowerCase();
  if (LOCAL_RE.test(o)) return /^(1|true|yes)$/i.test(String((env && env.ALLOW_LOCALHOST) || ''));
  const key = String((env && env.ALLOWED_ORIGINS) || '');
  let list = originCache.get(key);
  if (!list) { list = parseOrigins(key); if (originCache.size > 8) originCache.clear(); originCache.set(key, list); }
  return list.some((r) => (r.exact ? r.exact === o : r.re.test(o)));
}

// ------------------------------------------------------------------ ICE servers
const ICE_URL = /^(stun|turns?):(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?(?:\?transport=(?:udp|tcp))?$/i;
// a URL a browser can use: stun: / turn: / turns:, a plain host or [IPv6], an optional port (never 53) and transport
export function iceUrlOk(u) {
  const m = typeof u === 'string' && u.length <= 200 ? ICE_URL.exec(u) : null;
  return !!m && m[3] !== '53';
}
const isTurn = (e) => e.urls.some((u) => /^turns?:/i.test(u));
// the upstream's list -> only {urls: [...], username?, credential?} entries that pass (12 at most, 8 URLs each)
export function cleanIceServers(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const x of list.slice(0, 12)) {
    if (!x || typeof x !== 'object') continue;
    const urls = (typeof x.urls === 'string' ? [x.urls] : Array.isArray(x.urls) ? x.urls : []).slice(0, 8).filter(iceUrlOk);
    if (!urls.length) continue;
    const e = { urls };
    let bad = false;
    for (const k of ['username', 'credential']) {
      if (x[k] === undefined) continue;
      if (typeof x[k] !== 'string' || !x[k] || x[k].length > 512) bad = true; else e[k] = x[k];
    }
    if (bad || (isTurn(e) && !(e.username && e.credential))) continue;
    out.push(e);
  }
  return out;
}

// ------------------------------------------------------------------ abuse guard
// a fixed-window counter per key, in this isolate's memory (best effort: isolates come and go; the TURN_RATE binding,
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
async function allowed(req, env, io) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (env && env.TURN_RATE && typeof env.TURN_RATE.limit === 'function') {
    try { const r = await env.TURN_RATE.limit({ key: 'turn:' + ip }); if (r && r.success === false) return false; } catch (e) { /* binding trouble: the isolate's count below */ }
  }
  return io.limiter ? io.limiter(ip, io.now ? io.now() : Date.now()) : true;
}

// ------------------------------------------------------------------ responses
function corsHeaders(origin) {
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
}
function json(status, body, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' }, extra || {}),
  });
}
const MESSAGES = {
  origin: 'this origin may not ask for credentials', not_found: 'no such route', method: 'method not allowed', rate_limited: 'too many requests, try again in a minute',
  not_configured: 'the TURN key secrets are not set (npx wrangler secret put TURN_KEY_ID / TURN_KEY_API_TOKEN)',
  upstream: 'Cloudflare TURN refused the request', upstream_unreachable: 'Cloudflare TURN did not answer', upstream_empty: 'Cloudflare TURN sent no usable TURN server',
};
const fail = (status, code, extra, more) => json(status, Object.assign({ error: code, message: MESSAGES[code] || code }, more || {}), extra);

// ------------------------------------------------------------------ the Cloudflare API
async function mint(env, io) {
  const url = API + encodeURIComponent(env.TURN_KEY_ID) + '/credentials/generate-ice-servers';
  const ms = io.upstreamMs || UPSTREAM_MS;
  const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
  let res;
  try {
    res = await io.fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + env.TURN_KEY_API_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: TTL }), signal });
  } catch (e) { return { code: 'upstream_unreachable' }; }
  if (!res || (res.status !== 201 && res.status !== 200)) return { code: 'upstream', status: res ? res.status : 0 };
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  const iceServers = cleanIceServers(body && body.iceServers);
  if (!iceServers.some(isTurn)) return { code: 'upstream_empty' };
  return { iceServers };
}

// ------------------------------------------------------------------ routes
async function turn(req, env, io, cors) {
  if (!(await allowed(req, env, io))) return fail(429, 'rate_limited', Object.assign({ 'Retry-After': '60' }, cors));
  if (!env || typeof env.TURN_KEY_API_TOKEN !== 'string' || !env.TURN_KEY_API_TOKEN || typeof env.TURN_KEY_ID !== 'string' || !KEY_ID_RE.test(env.TURN_KEY_ID)) return fail(503, 'not_configured', cors);
  const r = await mint(env, io);
  if (r.code) return fail(502, r.code, cors, r.status ? { status: r.status } : null);
  return json(200, { iceServers: r.iceServers, ttl: TTL }, cors);
}
const health = () => json(200, { ok: true, service: 'ppodeuk-relay', routes: Object.keys(ROUTES).filter((p) => p !== '/') });
// path -> {methods: handler(req, env, io, corsHeaders)}; origin: the route serves allowed origins only
const ROUTES = {
  '/': { origin: false, GET: health },
  '/turn': { origin: true, GET: turn },
};

// req: a Request; env: the Worker's vars / secrets / bindings; io: {fetch, limiter?, now?, upstreamMs?}
export async function route(req, env, io) {
  env = env || {};
  let path = '/';
  try { path = new URL(req.url).pathname.replace(/\/+$/, '') || '/'; } catch (e) { return fail(404, 'not_found'); }
  const r = Object.prototype.hasOwnProperty.call(ROUTES, path) ? ROUTES[path] : null;
  if (!r) return fail(404, 'not_found');
  const origin = req.headers.get('Origin') || '';
  const ok = originAllowed(origin, env);
  if (r.origin && !ok) return fail(403, 'origin');
  const cors = ok ? corsHeaders(origin) : {};
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: Object.assign({ 'Cache-Control': 'no-store', Vary: 'Origin' }, cors) });
  const h = req.method === 'GET' ? r.GET : null;
  if (!h) return fail(405, 'method', Object.assign({ Allow: 'GET, OPTIONS' }, cors));
  try { return await h(req, env, io || {}, cors); } catch (e) { return fail(502, 'upstream_unreachable', cors); }
}
