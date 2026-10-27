// Node unit tests for the relay Worker (cloudflare/src/relay.js + its entry index.js) against a FAKE Cloudflare
// Realtime TURN API - nothing leaves this machine, no real key or token exists here.
//   origins   the shipped wrangler.toml's ALLOWED_ORIGINS: the live sites, the PR preview pattern (one host label part,
//             never a dot), the Toss origins; refused: other hosts / look-alikes / http / null / a missing Origin;
//             localhost only with ALLOW_LOCALHOST=1
//   /turn     the upstream call (POST, the key id in the path, Bearer token, {"ttl": 7200}); 200 {iceServers, ttl}
//             with port-53 URLs and every unknown field dropped; CORS for an allowed origin only (OPTIONS too);
//             Cache-Control: no-store; 403 / 404 / 405 / 429 / 503 / 502 (an upstream error, a throw, a stall, a body
//             that is not JSON or has no TURN server) - and the API token / key id in NO response, header or body
//   guard     10 a minute per IP in the isolate's counter, the TURN_RATE binding when bound (and its failure ignored)
//   entry     index.js hands the platform's fetch to route()
// Prints "RELAY-WORKER PASS/FAIL <name>" and "RELAY-WORKER OK|FAIL: N passed, M failed"; exit code 1 on failure.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const CF = path.join(__dirname, '..', 'cloudflare');
let passes = 0, fails = 0;
const ok = (name, cond, info) => { if (cond) passes++; else fails++; console.log(`RELAY-WORKER ${cond ? 'PASS' : 'FAIL'} ${name}${!cond && info !== undefined ? ' :: ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 400) : ''}`); return !!cond; };

// made-up secrets (the shapes Cloudflare uses: a 32-hex key id, a 64-char token) - the test asserts they never come back
const KEY_ID = 'f00dfeed0123456789abcdef01234567';
const TOKEN = 'tok_' + 'Zx9'.repeat(20);
const SAMPLE = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turn:turn.cloudflare.com:3478?transport=tcp',
        'turn:turn.cloudflare.com:80?transport=tcp', 'turns:turn.cloudflare.com:5349?transport=tcp', 'turns:turn.cloudflare.com:443?transport=tcp'],
      username: 'u_' + 'a1'.repeat(30), credential: 'c_' + 'b2'.repeat(20), extra: 'dropped',
    },
  ],
};
const LIVE = ['https://bubble-c3ad4.web.app', 'https://bubble-c3ad4.firebaseapp.com', 'https://bobo33772-blip.github.io', 'https://ppodeuk-bath.apps.tossmini.com', 'https://ppodeuk-bath.private-apps.tossmini.com'];

// the shipped vars, read from wrangler.toml itself (a change there is tested as shipped)
function tomlVar(name) {
  const t = fs.readFileSync(path.join(CF, 'wrangler.toml'), 'utf8');
  const m = t.match(new RegExp('^' + name + '\\s*=\\s*"([^"]*)"', 'm'));
  return m ? m[1] : null;
}

// (node's AbortSignal.timeout timer does not keep the process alive: this does, while the tests run)
const keepAlive = setInterval(() => {}, 1000);
(async () => {
  const R = await import(pathToFileURL(path.join(CF, 'src', 'relay.js')).href);
  const ENV = { ALLOWED_ORIGINS: tomlVar('ALLOWED_ORIGINS'), ALLOW_LOCALHOST: tomlVar('ALLOW_LOCALHOST'), TURN_KEY_ID: KEY_ID, TURN_KEY_API_TOKEN: TOKEN };
  ok('wrangler.toml: name ppodeuk-relay, main src/index.js, a compatibility_date, the vars, localhost off, no secret in it',
    /^name = "ppodeuk-relay"$/m.test(fs.readFileSync(path.join(CF, 'wrangler.toml'), 'utf8')) && /^main = "src\/index\.js"$/m.test(fs.readFileSync(path.join(CF, 'wrangler.toml'), 'utf8')) &&
    /^compatibility_date = "\d{4}-\d{2}-\d{2}"$/m.test(fs.readFileSync(path.join(CF, 'wrangler.toml'), 'utf8')) && !!ENV.ALLOWED_ORIGINS && ENV.ALLOW_LOCALHOST === '0' &&
    !/TURN_KEY_ID\s*=|TURN_KEY_API_TOKEN\s*=/.test(fs.readFileSync(path.join(CF, 'wrangler.toml'), 'utf8')));

  // ---------------------------------------------------------------- origins
  for (const o of LIVE) ok(`origin allowed: ${o}`, R.originAllowed(o, ENV));
  for (const o of ['https://bubble-c3ad4--pr23-ab12cd34.web.app', 'https://bubble-c3ad4--preview-1.web.app', 'HTTPS://BUBBLE-C3AD4.WEB.APP']) ok(`origin allowed (preview pattern / case): ${o}`, R.originAllowed(o, ENV));
  for (const o of ['https://evil.example', 'https://bubble-c3ad4.web.app.evil.com', 'https://evilbubble-c3ad4.web.app', 'https://bubble-c3ad4--x.evil.web.app', 'https://bubble-c3ad4--.web.app',
    'http://bubble-c3ad4.web.app', 'https://bubble-c3ad4.web.app:8443', 'https://other-blip.github.io', 'https://ppodeuk-bath.apps.tossmini.com.evil.io', 'null', '', undefined,
    'http://localhost:8765', 'http://127.0.0.1:5000']) ok(`origin refused: ${JSON.stringify(o)}`, !R.originAllowed(o, ENV));
  const LOCAL = Object.assign({}, ENV, { ALLOW_LOCALHOST: '1' });
  for (const o of ['http://localhost:8765', 'http://127.0.0.1:5000', 'http://[::1]:8080', 'http://localhost']) ok(`origin allowed with ALLOW_LOCALHOST=1: ${o}`, R.originAllowed(o, LOCAL));
  ok('origin: ALLOW_LOCALHOST=1 still refuses https://localhost.evil.com and other hosts', !R.originAllowed('http://localhost.evil.com', LOCAL) && !R.originAllowed('https://evil.example', LOCAL));
  ok('parseOrigins: junk tokens ignored, comma or space separated, trailing slash', R.parseOrigins('https://a.example, javascript:alert(1)  https://b.example/ *').length === 2);

  // ---------------------------------------------------------------- ICE list cleaning
  const cleaned = R.cleanIceServers(SAMPLE.iceServers);
  const allUrls = cleaned.flatMap((e) => e.urls);
  ok('clean: no port-53 URL left (stun or turn), the other 6 kept', !allUrls.some((u) => /:53(\?|$)/.test(u)) && allUrls.length === 6, allUrls);
  ok('clean: only urls / username / credential survive', cleaned.every((e) => Object.keys(e).every((k) => ['urls', 'username', 'credential'].includes(k))) && cleaned[1].username === SAMPLE.iceServers[1].username);
  ok('clean: 5349 / 3478 are not mistaken for 53', allUrls.includes('turns:turn.cloudflare.com:5349?transport=tcp') && allUrls.includes('stun:stun.cloudflare.com:3478'));
  const junk = R.cleanIceServers([
    { urls: 'javascript:alert(1)' }, { urls: 'turn:a.example:3478' }, { urls: 'turn:a.example:3478', username: 'u' }, { urls: ['stun:has space:1'] },
    { urls: 'turn:[::1]:53', username: 'u', credential: 'c' }, { urls: 'turn:[2001:db8::53]:3478', username: 'u', credential: 'c' }, { urls: 'stun:x.example:19302', credential: 5 },
    { urls: 'turn:b.example', username: 'u', credential: 'x'.repeat(600) }, null, 'stun:c.example', { urls: 'stun:ok.example:3478?transport=sctp' }, { urls: 'stun:ok.example:3478' },
  ]);
  ok('clean: bad schemes / spaces / TURN without both credentials / [::1]:53 / non-string or huge credentials / unknown transport refused; [2001:db8::53]:3478 and a plain stun kept',
    junk.length === 2 && junk[0].urls[0] === 'turn:[2001:db8::53]:3478' && junk[1].urls[0] === 'stun:ok.example:3478', junk);
  ok('clean: at most 12 entries, 8 URLs each', R.cleanIceServers(Array.from({ length: 20 }, () => ({ urls: Array.from({ length: 12 }, (_, i) => 'stun:s' + i + '.example:3478') }))).length === 12 &&
    R.cleanIceServers([{ urls: Array.from({ length: 12 }, (_, i) => 'stun:s' + i + '.example:3478') }])[0].urls.length === 8);
  ok('clean: not an array -> []', R.cleanIceServers(null).length === 0 && R.cleanIceServers({ urls: 'stun:a.example' }).length === 0);

  // ---------------------------------------------------------------- /turn through route()
  const seen = [];        // every response's text + headers (the leak check at the end)
  const calls = [];
  const fake = (mode) => async (url, init) => {
    calls.push({ url, init });
    if (mode === 'throw') throw new TypeError('network down');
    if (mode === 'stall') return new Promise((res, rej) => { if (init.signal) init.signal.addEventListener('abort', () => rej(new Error('aborted'))); });
    if (mode === 401) return new Response(JSON.stringify({ success: false, errors: [{ message: 'bad token ' + TOKEN }] }), { status: 401 });
    if (mode === 'html') return new Response('<html>oops ' + KEY_ID + '</html>', { status: 201 });
    if (mode === 'stun') return new Response(JSON.stringify({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] }), { status: 201 });
    if (mode === 'leaky') return new Response(JSON.stringify({ iceServers: SAMPLE.iceServers.concat([{ urls: 'turn:x.example', username: 'u', credential: 'c', token: TOKEN }]), apiToken: TOKEN, keyId: KEY_ID }), { status: 201 });
    return new Response(JSON.stringify(SAMPLE), { status: 201, headers: { 'Content-Type': 'application/json' } });
  };
  let t = 1000000;
  const io = (mode, extra) => Object.assign({ fetch: fake(mode), limiter: R.makeLimiter(), now: () => t, upstreamMs: 80 }, extra || {});
  async function call(method, p, origin, env, ioo, ip) {
    const h = {}; if (origin !== undefined) h.Origin = origin; h['CF-Connecting-IP'] = ip || '203.0.113.7';
    const res = await R.route(new Request('https://ppodeuk-relay.example.workers.dev' + p, { method, headers: h }), env, ioo);
    const text = res.status === 204 ? '' : await res.text();
    const headers = Object.fromEntries(res.headers.entries());
    seen.push(text + JSON.stringify(headers));
    let body = null; try { body = JSON.parse(text); } catch (e) { body = null; }
    return { status: res.status, headers, body, text };
  }
  const O = LIVE[0];
  {
    calls.length = 0;
    const r = await call('GET', '/turn', O, ENV, io('ok'));
    ok('/turn: 200 {iceServers, ttl: 7200}', r.status === 200 && r.body && Array.isArray(r.body.iceServers) && r.body.ttl === 7200 && Object.keys(r.body).sort().join() === 'iceServers,ttl', r);
    ok('/turn: no port-53 URL and the TURN entry keeps its username + credential', r.body && !/:53(\?|")/.test(JSON.stringify(r.body)) && r.body.iceServers.some((e) => e.username && e.credential && e.urls.some((u) => /^turns?:/.test(u))));
    ok('/turn: CORS for that origin (Allow-Origin echoed, Vary: Origin), no-store, JSON', r.headers['access-control-allow-origin'] === O && /origin/i.test(r.headers.vary || '') && r.headers['cache-control'] === 'no-store' && /^application\/json/.test(r.headers['content-type'] || ''), r.headers);
    const c = calls[0] || {};
    let sent = null; try { sent = JSON.parse(c.init.body); } catch (e) { sent = null; }
    ok('/turn: the upstream call - POST to .../keys/<TURN_KEY_ID>/credentials/generate-ice-servers, Bearer token, {"ttl":7200}',
      calls.length === 1 && c.url === `https://rtc.live.cloudflare.com/v1/turn/keys/${KEY_ID}/credentials/generate-ice-servers` && c.init.method === 'POST' &&
      c.init.headers.Authorization === 'Bearer ' + TOKEN && sent && sent.ttl === 7200 && Object.keys(sent).length === 1, { url: c.url, method: c.init && c.init.method });
    const p = await call('GET', '/turn', 'https://bubble-c3ad4--pr42-0a1b2c3d.web.app', ENV, io('ok'));
    ok('/turn: a PR preview channel gets credentials', p.status === 200 && p.headers['access-control-allow-origin'] === 'https://bubble-c3ad4--pr42-0a1b2c3d.web.app');
    const s = await call('GET', '/turn/', O, ENV, io('ok'));
    ok('/turn/: the trailing slash is the same route', s.status === 200);
  }
  {
    calls.length = 0;
    const r = await call('GET', '/turn', 'https://evil.example', ENV, io('ok'));
    ok('/turn from another origin: 403 {error: origin}, no CORS header, the upstream never asked', r.status === 403 && r.body && r.body.error === 'origin' && !r.headers['access-control-allow-origin'] && calls.length === 0, r);
    const n = await call('GET', '/turn', undefined, ENV, io('ok'));
    ok('/turn without Origin (curl, a browser opening it directly): 403', n.status === 403 && calls.length === 0);
    const l = await call('GET', '/turn', 'http://localhost:8765', ENV, io('ok'));
    const l2 = await call('GET', '/turn', 'http://localhost:8765', LOCAL, io('ok'));
    ok('/turn from localhost: 403 by default, 200 with ALLOW_LOCALHOST=1', l.status === 403 && l2.status === 200 && l2.headers['access-control-allow-origin'] === 'http://localhost:8765');
  }
  {
    const r = await call('OPTIONS', '/turn', O, ENV, io('ok'));
    ok('OPTIONS /turn (preflight) from an allowed origin: 204 with Allow-Origin / Methods / Max-Age', r.status === 204 && r.headers['access-control-allow-origin'] === O && /GET/.test(r.headers['access-control-allow-methods'] || '') && !!r.headers['access-control-max-age'], r.headers);
    const d = await call('OPTIONS', '/turn', 'https://evil.example', ENV, io('ok'));
    ok('OPTIONS /turn from another origin: 403', d.status === 403 && !d.headers['access-control-allow-origin']);
    calls.length = 0;
    const m = await call('POST', '/turn', O, ENV, io('ok'));
    ok('POST /turn: 405 with Allow, nothing minted', m.status === 405 && /GET/.test(m.headers.allow || '') && calls.length === 0, m);
    const h = await call('HEAD', '/turn', O, ENV, io('ok'));
    ok('HEAD /turn: 405, nothing minted', h.status === 405 && calls.length === 0);
    const u = await call('GET', '/room/abcd', O, ENV, io('ok'));
    ok('an unknown path (/room/<code> is PR 2): 404', u.status === 404 && u.body && u.body.error === 'not_found');
    const g = await call('GET', '/', undefined, ENV, io('ok'));
    ok('GET / (health, any origin): 200 {ok, service, routes}', g.status === 200 && g.body && g.body.ok === true && g.body.service === 'ppodeuk-relay' && g.body.routes.includes('/turn'), g.body);
  }
  {
    calls.length = 0;
    const a = await call('GET', '/turn', O, { ALLOWED_ORIGINS: ENV.ALLOWED_ORIGINS }, io('ok'));
    const b = await call('GET', '/turn', O, Object.assign({}, ENV, { TURN_KEY_ID: '../../zones' }), io('ok'));
    const c = await call('GET', '/turn', O, Object.assign({}, ENV, { TURN_KEY_API_TOKEN: '' }), io('ok'));
    ok('secrets missing / a key id that is not one / an empty token: 503 not_configured, the upstream never asked', [a, b, c].every((r) => r.status === 503 && r.body.error === 'not_configured' && r.headers['access-control-allow-origin'] === O) && calls.length === 0, [a.status, b.status, c.status]);
  }
  {
    const e401 = await call('GET', '/turn', O, ENV, io(401));
    ok('upstream 401: 502 {error: upstream, status: 401}, its body not passed on', e401.status === 502 && e401.body.error === 'upstream' && e401.body.status === 401 && !/bad token/.test(e401.text), e401.body);
    const thr = await call('GET', '/turn', O, ENV, io('throw'));
    ok('upstream unreachable (fetch throws): 502 upstream_unreachable', thr.status === 502 && thr.body.error === 'upstream_unreachable');
    const t0 = Date.now();
    const st = await call('GET', '/turn', O, ENV, io('stall'));
    ok('upstream stalls: aborted after upstreamMs -> 502 upstream_unreachable', st.status === 502 && st.body.error === 'upstream_unreachable' && Date.now() - t0 < 3000, [st.status, Date.now() - t0]);
    const html = await call('GET', '/turn', O, ENV, io('html'));
    ok('upstream 201 that is not JSON: 502 upstream_empty', html.status === 502 && html.body.error === 'upstream_empty');
    const stun = await call('GET', '/turn', O, ENV, io('stun'));
    ok('upstream 201 with no TURN server: 502 upstream_empty', stun.status === 502 && stun.body.error === 'upstream_empty');
    const lk = await call('GET', '/turn', O, ENV, io('leaky'));
    ok('upstream with extra fields (a token among them): only the checked entries go out', lk.status === 200 && !lk.text.includes(TOKEN) && !/apiToken|keyId|"token"/.test(lk.text) && lk.body.iceServers.length === 3, lk.body);
  }
  {
    const lim = R.makeLimiter();
    const iox = io('ok', { limiter: lim });
    const rs = [];
    for (let i = 0; i < 11; i++) rs.push((await call('GET', '/turn', O, ENV, iox, '198.51.100.9')).status);
    ok('guard: 10 a minute per IP pass, the 11th is 429 (Retry-After)', rs.slice(0, 10).every((s) => s === 200) && rs[10] === 429, rs);
    const other = await call('GET', '/turn', O, ENV, iox, '198.51.100.10');
    ok('guard: another IP is not affected', other.status === 200);
    const last = await call('GET', '/turn', O, ENV, iox, '198.51.100.9');
    ok('guard: the 429 answer has Retry-After and CORS (the page can read why)', last.status === 429 && last.headers['retry-after'] === '60' && last.headers['access-control-allow-origin'] === O);
    t += 60000;
    ok('guard: a minute later it passes again', (await call('GET', '/turn', O, ENV, iox, '198.51.100.9')).status === 200);
    const keys = [];
    const bound = Object.assign({}, ENV, { TURN_RATE: { limit: async (o) => { keys.push(o.key); return { success: false }; } } });
    const b = await call('GET', '/turn', O, bound, io('ok'), '192.0.2.1');
    ok('guard: the TURN_RATE binding says no -> 429; keyed by the client IP', b.status === 429 && keys[0] === 'turn:192.0.2.1', keys);
    const broken = Object.assign({}, ENV, { TURN_RATE: { limit: async () => { throw new Error('binding down'); } } });
    ok('guard: a failing binding is ignored (the isolate count decides)', (await call('GET', '/turn', O, broken, io('ok'), '192.0.2.2')).status === 200);
  }
  ok('no response, header or body ever held the API token or the key id', seen.length > 20 && seen.every((s) => !s.includes(TOKEN) && !s.includes(KEY_ID)), seen.find((s) => s.includes(TOKEN) || s.includes(KEY_ID)));

  // ---------------------------------------------------------------- the entry
  {
    const W = (await import(pathToFileURL(path.join(CF, 'src', 'index.js')).href)).default;
    const real = globalThis.fetch;
    const got = [];
    globalThis.fetch = async (url, init) => { got.push(url); return new Response(JSON.stringify(SAMPLE), { status: 201 }); };
    let r = null;
    try { r = await W.fetch(new Request('https://ppodeuk-relay.example.workers.dev/turn', { headers: { Origin: O, 'CF-Connecting-IP': '203.0.113.50' } }), ENV, {}); } finally { globalThis.fetch = real; }
    const body = r ? await r.json() : null;
    ok('index.js: default export {fetch} routes through relay.js with the platform fetch', !!r && r.status === 200 && body.ttl === 7200 && got.length === 1 && /\/generate-ice-servers$/.test(got[0]), [r && r.status, got]);
  }

  clearInterval(keepAlive);
  console.log(`RELAY-WORKER ${fails ? 'FAIL' : 'OK'}: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('RELAY-WORKER FAIL crashed :: ' + (e && e.stack || e)); process.exit(1); });
