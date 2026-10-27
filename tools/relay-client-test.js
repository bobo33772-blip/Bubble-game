// Tests for the client side of the relay (src/relay/ice.js = window.PG_RELAY, build.js's relay URL, game.js peerOpts).
// Run `node bogeul/build.js` first (it writes the C:/Temp/bogeul/deploy-relay/ fixture).
// Usage: node bogeul/tools/relay-client-test.js [--no-chrome]
//   unit     src/relay/ice.js in a node vm on a virtual clock with a fake fetch: GET <url>/turn (cors, no credentials,
//            no-store), the checked list (no port 53, junk refused, the public STUN added once), the cache until 10 min
//            before the ttl ends (then asked again), one request at a time (warm + two callers), the 3 s timeout
//            (aborted), a refusal / bad JSON / no TURN server / a throwing fetch -> the static list or STUN only, never a
//            rejection, 30 s before asking again after a failure, peerOptions keeping the base's other fields, copies
//            handed out, info() without credentials, nothing stored
//   build    build.js on a COPY of the sources (C:/Temp/bogeul/relay-build): no URL / PG_RELAY_URL=none -> the deploy
//            page exactly as before (byte for byte); PG_RELAY_URL -> one inlined PG_RELAY with that URL (the trailing
//            slash dropped), the same page otherwise (only the tag and the build hash differ), the itch zip and a PR
//            preview carry it, dist/ byte-for-byte the real one; relay.config.json read, the env winning, none winning;
//            a bad URL / a broken file stop the build with their message
//   chrome   the deploy-relay fixture (http, its own origin) with a recording stand-in for PeerJS, against the REAL Worker
//            code (cloudflare/src/relay.js behind a local http server, another origin, ALLOW_LOCALHOST=1) and a fake
//            Cloudflare API: 친구와 하기 + 방 만들기 -> new Peer(...) gets the minted TURN servers (no port 53, the public
//            STUN); a second room reuses them (one upstream call); 참여 too; solo play never asks; a 500 -> STUN only, or
//            the build's static list when it has one; a stalled Worker -> the fallback after ~3 s, the next try at once;
//            an origin the Worker refuses -> the fallback; nothing stored; the deploy without a relay hands PeerJS the
//            same options as before
// Prints "RELAY-CLIENT PASS/FAIL <name>" and "RELAY-CLIENT OK|FAIL: N passed, M failed"; exit code 1 on failure.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const { T, CH } = require('./env');
const NO_CHROME = process.argv.includes('--no-chrome');
let passes = 0, fails = 0;
const ok = (name, cond, info) => { if (cond) passes++; else fails++; console.log(`RELAY-CLIENT ${cond ? 'PASS' : 'FAIL'} ${name}${!cond && info !== undefined ? ' :: ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 500) : ''}`); return !!cond; };
const read = (f) => fs.readFileSync(f, 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keepAlive = setInterval(() => {}, 1000);

const CRED = 'cred-' + 'q7'.repeat(16);
const SAMPLE = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turn:turn.cloudflare.com:3478?transport=tcp', 'turns:turn.cloudflare.com:5349?transport=tcp', 'turns:turn.cloudflare.com:443?transport=tcp'],
      username: 'user-' + 'k3'.repeat(12), credential: CRED },
  ],
  ttl: 7200,
};
const no53 = (list) => !/:53(\?|")/.test(JSON.stringify(list));
const turnOf = (list) => (list || []).filter((e) => [].concat(e.urls).some((u) => /^turns?:/.test(u)));
const hasUrl = (list, u) => (list || []).some((e) => [].concat(e.urls).includes(u));

// ================================================================== unit: src/relay/ice.js in a vm
const SRC = read(path.join(ROOT, 'src', 'relay', 'ice.js'));
function client(opts) {
  opts = opts || {};
  const clock = { t: 1.7e12 };
  const timers = new Map(); let tid = 0;
  const calls = [];
  const sb = {
    console, JSON, Promise, AbortController,
    setTimeout: (f, ms) => { const id = ++tid; timers.set(id, { at: clock.t + (+ms || 0), f }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    __now: () => clock.t,
  };
  sb.window = sb;
  if (opts.static) sb.PG_PEER_OPTIONS = { config: { iceServers: opts.static } };
  sb.fetch = (url, init) => { calls.push({ url, init }); return opts.fetch(url, init, calls.length); };
  const ctx = vm.createContext(sb);
  vm.runInContext('Date.now = function () { return __now(); };', ctx);
  vm.runInContext(SRC.replace("'__PG_RELAY_URL__'", () => JSON.stringify(opts.base || 'https://relay.example.workers.dev')), ctx, { filename: 'ice.js' });
  const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
  // advance the virtual clock, firing due timers in order
  async function advance(ms) {
    const end = clock.t + ms;
    for (;;) {
      await flush();
      let next = null;
      for (const [id, tm] of timers) if (tm.at <= end && (!next || tm.at < next[1].at)) next = [id, tm];
      if (!next) break;
      timers.delete(next[0]); clock.t = Math.max(clock.t, next[1].at); next[1].f();
    }
    clock.t = end; await flush();
  }
  return { R: sb.PG_RELAY, sb, calls, clock, advance, flush };
}
const okRes = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(body))) });

async function unit() {
  {
    const c = client({ fetch: () => okRes(SAMPLE) });
    ok('unit: window.PG_RELAY is frozen with url / peerOptions / warm / ice / info', !!c.R && Object.isFrozen(c.R) && c.R.url === 'https://relay.example.workers.dev' && ['peerOptions', 'warm', 'ice', 'info'].every((k) => typeof c.R[k] === 'function'));
    const p = c.R.ice(); await c.advance(10); const r = await p;
    const req = c.calls[0] || {};
    ok('unit: asks GET <url>/turn - cors, no credentials, no-store, an abort signal', c.calls.length === 1 && req.url === 'https://relay.example.workers.dev/turn' && req.init.method === 'GET' && req.init.mode === 'cors' && req.init.credentials === 'omit' && req.init.cache === 'no-store' && !!req.init.signal, req.init);
    ok('unit: source relay, the TURN entry with its username / credential, no port 53', r.source === 'relay' && turnOf(r.iceServers).length === 1 && turnOf(r.iceServers)[0].credential === CRED && no53(r.iceServers), r);
    ok('unit: the public STUN added once each (Google added, Cloudflare\'s not doubled)', hasUrl(r.iceServers, 'stun:stun.l.google.com:19302') && r.iceServers.filter((e) => [].concat(e.urls).includes('stun:stun.cloudflare.com:3478')).length === 1, r.iceServers);
    r.iceServers.length = 0;
    const r2 = await c.R.ice();
    ok('unit: the second ask is the cache (no request) and a fresh copy (the caller\'s changes do not stick)', r2.source === 'cache' && c.calls.length === 1 && r2.iceServers.length >= 3);
    ok('unit: info() says where it came from and until when - no credential in it', c.R.info().source === 'cache' && c.R.info().cachedUntil === c.clock.t - 10 + 6600000 && !JSON.stringify(c.R.info()).includes(CRED), c.R.info());
    await c.advance(6600000 - 10 - 1000);
    ok('unit: still the cache 10 min + 1 s before the ttl ends', (await c.R.ice()).source === 'cache' && c.calls.length === 1);
    await c.advance(2000);
    const p3 = c.R.ice(); await c.advance(5); const r3 = await p3;
    ok('unit: past that, asked again', r3.source === 'relay' && c.calls.length === 2);
    ok('unit: nothing of it in storage (the module names no storage at all)', !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(SRC));
  }
  {
    let resolveIt = null;
    const c = client({ fetch: () => new Promise((res) => { resolveIt = () => res({ ok: true, json: () => Promise.resolve(SAMPLE) }); }) });
    c.R.warm(); c.R.warm();
    const a = c.R.ice(), b = c.R.peerOptions(null);
    await c.flush(); resolveIt(); await c.advance(5);
    const [ra, rb] = await Promise.all([a, b]);
    ok('unit: warm + warm + two callers -> one request, both get the list', c.calls.length === 1 && ra.source === 'relay' && turnOf(rb.config.iceServers).length === 1, c.calls.length);
    c.R.warm(); await c.flush();
    ok('unit: warm() with a fresh cache asks nothing', c.calls.length === 1);
  }
  {
    let signal = null;
    const c = client({ fetch: (u, init) => { signal = init.signal; return new Promise(() => {}); } });
    let done = null; c.R.ice().then((r) => { done = r; });
    await c.advance(2900);
    ok('unit: a Worker that does not answer: still waiting at 2.9 s', done === null);
    await c.advance(200);
    ok('unit: ... at 3 s the fallback (STUN only: no static list in this build), the request aborted', !!done && done.source === 'stun' && turnOf(done.iceServers).length === 0 && hasUrl(done.iceServers, 'stun:stun.l.google.com:19302') && signal && signal.aborted, done);
    const t0 = c.calls.length;
    const quick = await c.R.ice();
    ok('unit: within 30 s of a failure the fallback at once (no new request)', quick.source === 'stun' && c.calls.length === t0);
    c.R.warm(); await c.flush();
    ok('unit: warm() within 30 s of a failure asks nothing either', c.calls.length === t0);
    await c.advance(30000);
    c.R.ice(); await c.flush();
    ok('unit: 30 s on, asked again', c.calls.length === t0 + 1);
  }
  const STATIC = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: ['turn:static.example.com:3478', 'turn:static.example.com:53'], username: 'su', credential: 'sc' }];
  for (const [name, f] of [
    ['a refusal (403, ok false)', () => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ error: 'origin' }) })],
    ['JSON that does not parse', () => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('x')) })],
    ['an answer without a TURN server', () => okRes({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], ttl: 7200 })],
    ['only junk entries', () => okRes({ iceServers: [{ urls: 'javascript:alert(1)' }, { urls: 'turn:a.example:3478' }, { urls: 'turn:b.example:53', username: 'u', credential: 'c' }, 7, null], ttl: 7200 })],
    ['a fetch that rejects', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a fetch that throws at once', () => { throw new TypeError('blocked'); }],
  ]) {
    const c = client({ fetch: f, static: STATIC });
    let r = null, err = null;
    try { const p = c.R.ice(); await c.advance(5); r = await p; } catch (e) { err = e; }
    ok(`unit: ${name} -> the build's static list (its port 53 dropped), no rejection`, !err && r && r.source === 'static' && r.iceServers.length === 2 && turnOf(r.iceServers)[0].urls.length === 1 && no53(r.iceServers), err ? String(err) : r);
    const c2 = client({ fetch: f });
    const p2 = c2.R.peerOptions({ debug: 1 }); await c2.advance(5); const r2 = await p2;
    ok(`unit: ${name}, no static list -> STUN only`, r2 && r2.debug === 1 && r2.config.iceServers.length === 2 && turnOf(r2.config.iceServers).length === 0);
  }
  {
    const c = client({ fetch: () => okRes(SAMPLE) });
    const base = { host: 'peer.example.com', port: 443, debug: 0, config: { sdpSemantics: 'unified-plan', iceServers: [{ urls: 'stun:old.example.com:3478' }] } };
    const snap = JSON.stringify(base);
    const p = c.R.peerOptions(base); await c.advance(5); const po = await p;
    ok('unit: peerOptions keeps the base\'s other fields (host, port, config.sdpSemantics), replaces iceServers, leaves the base alone',
      po.host === 'peer.example.com' && po.port === 443 && po.config.sdpSemantics === 'unified-plan' && turnOf(po.config.iceServers).length === 1 && !hasUrl(po.config.iceServers, 'stun:old.example.com:3478') && JSON.stringify(base) === snap, po);
    ok('unit: peerOptions answers a plain object (game.js only takes those)', Object.getPrototypeOf(Object.getPrototypeOf(po)) === null);
  }
  {
    const c = client({ fetch: () => okRes(Object.assign({}, SAMPLE, { ttl: 120 })) });
    const p = c.R.ice(); await c.advance(5); await p;
    ok('unit: a short ttl (120 s) is kept for half of it', c.R.info().cachedUntil - (c.clock.t - 5) === 60000, c.R.info().cachedUntil - c.clock.t);
    const c2 = client({ fetch: () => okRes(Object.assign({}, SAMPLE, { ttl: 'x' })) });
    const p2 = c2.R.ice(); await c2.advance(5); const r2 = await p2;
    ok('unit: a ttl that is not a number -> 1 h, half of which ... (an hour minus 10 min) is kept', r2.source === 'relay' && c2.R.info().cachedUntil - (c2.clock.t - 5) === 3000000);
  }
  {
    const sb = { window: null }; sb.window = sb;
    vm.runInContext(SRC.replace("'__PG_RELAY_URL__'", '""'), vm.createContext(sb));
    const sb2 = { window: null }; sb2.window = sb2;
    vm.runInContext(SRC, vm.createContext(sb2));
    ok('unit: no URL (or the placeholder left unfilled) -> no PG_RELAY at all', !('PG_RELAY' in sb) && !('PG_RELAY' in sb2));
  }
}

// ================================================================== build: a copy of the sources
function buildChecks() {
  const B = path.join(T, 'relay-build'), SRCD = path.join(B, 'bogeul'), TMP = path.join(B, 'tmp');
  fs.rmSync(B, { recursive: true, force: true });
  fs.mkdirSync(path.join(SRCD, 'tools'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'build.js'), path.join(SRCD, 'build.js'));
  for (const f of ['pack-itch.js', 'fb-config.js']) fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(SRCD, 'tools', f));
  fs.cpSync(path.join(ROOT, 'src'), path.join(SRCD, 'src'), { recursive: true, filter: (p) => path.basename(p) !== 'tests' });
  const art = read(path.join(ROOT, 'dist', 'ppogeul-bath.html'));
  const build = (env) => {
    const e = Object.assign({}, process.env, { PG_BUILD_TEMP: TMP }, env || {});
    for (const k of ['PG_FIREBASE_CONFIG', 'PG_PREVIEW', 'PG_TURN_CONFIG', 'PG_RELAY_URL']) if (!(env && k in env)) delete e[k];
    const r = spawnSync(process.execPath, [path.join(SRCD, 'build.js')], { encoding: 'utf8', env: e, cwd: SRCD });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), dep: r.status === 0 ? read(path.join(SRCD, 'deploy', 'index.html')) : null };
  };
  const tags = (h) => (h.match(/<script id="pg-relay">/g) || []).length;
  const bare = (h) => h.replace(/<script id="pg-relay">[\s\S]*?<\/script>\n/, '').replace(/<meta name="pg-build" content="[0-9a-f]+">/, '');
  const plain = build();
  if (!ok('build copy: builds without a relay URL ("no relay" in its line)', plain.status === 0 && /no relay/.test(plain.out), plain.out.slice(-400))) return;
  ok('build copy: ... the deploy page has not a trace of the relay', tags(plain.dep) === 0 && !/PG_RELAY\s*=|__PG_RELAY_URL__|\/turn'/.test(plain.dep));
  ok('build copy: ... and its dist/ is byte for byte the real one', read(path.join(SRCD, 'dist', 'ppogeul-bath.html')) === art);
  const none = build({ PG_RELAY_URL: 'none' });
  ok('build copy: PG_RELAY_URL=none -> the same deploy page byte for byte', none.status === 0 && none.dep === plain.dep);
  const U = 'https://ppodeuk-relay.test-acct.workers.dev';
  const withR = build({ PG_RELAY_URL: U + '/' });
  if (ok('build copy: PG_RELAY_URL builds ("relay: <url>" in its line, the trailing slash dropped)', withR.status === 0 && withR.out.includes('relay: ' + U + ';'), withR.out.slice(-400))) {
    ok('build copy: exactly one inlined PG_RELAY with that URL (and no placeholder left)', tags(withR.dep) === 1 && withR.dep.includes(`})(window, ${JSON.stringify(U)});</script>`) && !withR.dep.includes('__PG_RELAY_URL__'));
    ok('build copy: it sits after PG_PEER_OPTIONS\'s place, right before the PeerJS tag; still one static <script src>', /<script id="pg-relay">[\s\S]*?<\/script>\n<script defer src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/peerjs\//.test(withR.dep) && (withR.dep.match(/<script\b[^>]*\bsrc\s*=/gi) || []).length === 1);
    ok('build copy: otherwise the same page (only the tag and the build hash differ) - with no URL it is exactly as before', bare(withR.dep) === bare(plain.dep));
    ok('build copy: a relay makes another build hash (installed apps update)', (withR.dep.match(/pg-build" content="([0-9a-f]+)"/) || [])[1] !== (plain.dep.match(/pg-build" content="([0-9a-f]+)"/) || [])[1]);
    ok('build copy: dist/ is still byte for byte the real one (the artifact never gets the relay)', read(path.join(SRCD, 'dist', 'ppogeul-bath.html')) === art);
    const zip = fs.readFileSync(path.join(SRCD, 'deploy', 'ppodeuk-bath-itch.zip'));
    ok('build copy: the itch zip was made with it (its page carries the URL)', zip.length > 1000 && zipHas(zip, U));
  }
  const pv = build({ PG_RELAY_URL: U, PG_PREVIEW: '7' });
  ok('build copy: a PR preview (PG_PREVIEW) carries it too (bubble-c3ad4--*.web.app is allowed by the Worker)', pv.status === 0 && tags(pv.dep) === 1 && /미리보기 #7/.test(pv.dep));
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
  for (const bad of ['http://relay.example.com', 'javascript:alert(1)', 'https://relay.example.com/turn?x=1', 'https://relay.example.com/"><script>', 'https://localhost', 'relay.example.com', 'https://a b.example.com']) {
    const r = build({ PG_RELAY_URL: bad });
    ok(`build copy: a bad relay URL stops the build: ${bad}`, r.status !== 0 && /중계 서버 주소가 이상해요 \/ bad relay URL/.test(r.out), r.out.split('\n').slice(0, 3).join(' | '));
  }
  ok('build copy: http://127.0.0.1:<port> is accepted (local tests)', build({ PG_RELAY_URL: 'http://127.0.0.1:8787' }).status === 0);
  fs.rmSync(B, { recursive: true, force: true });
}
// (the itch zip's entries may be deflated: look for the URL in the inflated index.html)
function zipHas(zip, needle) {
  const zlib = require('zlib');
  for (let i = 0; i + 30 < zip.length; i++) {
    if (zip.readUInt32LE(i) !== 0x04034b50) continue;
    const method = zip.readUInt16LE(i + 8), csize = zip.readUInt32LE(i + 18), nlen = zip.readUInt16LE(i + 26), xlen = zip.readUInt16LE(i + 28);
    const name = zip.subarray(i + 30, i + 30 + nlen).toString('utf8'), data = zip.subarray(i + 30 + nlen + xlen, i + 30 + nlen + xlen + csize);
    if (name !== 'index.html') continue;
    const txt = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    return txt.includes(needle) && txt.includes('<script id="pg-relay">');
  }
  return false;
}

// ================================================================== chrome: the fixture against the real Worker code
function listen(handler) {
  return new Promise((res) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)); });
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
async function chromeChecks() {
  const W = await import(pathToFileURL(path.join(ROOT, 'cloudflare', 'src', 'relay.js')).href);
  // ---- the fake Cloudflare API behind the real Worker code
  const up = { mode: 'ok', calls: 0 };
  const env = { ALLOWED_ORIGINS: 'https://bubble-c3ad4.web.app', ALLOW_LOCALHOST: '1', TURN_KEY_ID: 'f00dfeed0123456789abcdef01234567', TURN_KEY_API_TOKEN: 'tok_' + 'Qp4'.repeat(20) };
  const io = {
    limiter: W.makeLimiter(1000), upstreamMs: 8000,
    fetch: async (url, init) => {
      up.calls++;
      if (up.mode === '500') return new Response('{}', { status: 500 });
      if (up.mode === 'stall') return new Promise((res, rej) => { if (init.signal) init.signal.addEventListener('abort', () => rej(new Error('aborted'))); });
      return new Response(JSON.stringify({ iceServers: SAMPLE.iceServers }), { status: 201 });
    },
  };
  const wsrv = await listen(async (req, res) => {
    res.on('error', () => {});
    try {
      const r = await W.route(new Request(`http://127.0.0.1:${wsrv.address().port}${req.url}`, { method: req.method, headers: Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')) }), env, io);
      const body = r.status === 204 ? '' : await r.text();
      if (!res.destroyed) { res.writeHead(r.status, Object.fromEntries(r.headers.entries())); res.end(body); }
    } catch (e) { try { res.writeHead(500); res.end(); } catch (e2) { /* closed */ } }
  });
  const WURL = `http://127.0.0.1:${wsrv.address().port}`;
  // ---- the pages (deploy-relay / deploy-nocfg fixtures) on another origin
  const fx = read(path.join(T, 'deploy-relay', 'index.html'));
  const nocfg = read(path.join(T, 'deploy-nocfg', 'index.html'));
  const PEER_TAG = /<script defer src="https:\/\/[^"]*peerjs[^"]*"[^>]*><\/script>/;
  const SW_TAG = /<script>\(function\(\)\{try\{var sw=navigator\.serviceWorker[\s\S]*?<\/script>\n/;
  // (a recording stand-in for PeerJS: new Peer(id?, opts) keeps a copy of opts.config, then fails like a dead signalling
  // server - the game answers as it would; nothing third-party runs)
  const FAKE = "<script>try{localStorage.setItem('ppogeul-login','1');}catch(e){}window.__peers=[];window.Peer=function Peer(a,b){var o=typeof a==='object'?a:b;" +
    "window.__peers.push({t:performance.now(),id:typeof a==='string'?a:null,keys:o?Object.keys(o).sort():[],config:o&&o.config?JSON.parse(JSON.stringify(o.config)):null});" +
    "var ls={};this.on=function(e,f){(ls[e]=ls[e]||[]).push(f);return this;};this.destroy=function(){};this.disconnect=function(){};this.reconnect=function(){};" +
    "setTimeout(function(){(ls.error||[]).forEach(function(f){f({type:'network'});});},20);};</script>";
  const STATIC = "<script>window.PG_PEER_OPTIONS={config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'turn:static.example.com:3478',username:'su',credential:'sc'}]}};</script>\n";
  if (!PEER_TAG.test(fx) || !fx.includes('"http://127.0.0.1:9/relay-test"')) { ok('chrome: the deploy-relay fixture is there (node build.js first)', false); return; }
  const page = (html, relay, extra) => {
    let h = html.replace(PEER_TAG, () => FAKE).replace(SW_TAG, '');
    if (relay !== undefined) h = h.replace('"http://127.0.0.1:9/relay-test"', () => JSON.stringify(relay));
    if (extra) h = h.replace('<script id="pg-relay">', () => extra + '<script id="pg-relay">');
    return h;
  };
  const PAGES = { '/relay.html': page(fx, WURL), '/relay-static.html': page(fx, WURL, STATIC), '/nocfg.html': page(nocfg) };
  const psrv = await listen((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (PAGES[p]) { res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' }); return res.end(PAGES[p]); }
    const f = path.join(T, 'deploy-relay', ...p.split('/').filter((s) => s && s !== '..'));
    fs.readFile(f, (err, buf) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(buf); });
  });
  const PURL = `http://127.0.0.1:${psrv.address().port}`;
  // ---- Chrome over the DevTools protocol (every other host unreachable: a dead proxy; loopback bypasses it)
  const prof = `${T}/relay-chrome-${process.pid}`;
  fs.rmSync(prof, { recursive: true, force: true });
  const chrome = spawn(CH, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--mute-audio', '--proxy-server=127.0.0.1:9', `--user-data-dir=${prof}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
  let port = null;
  for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = read(`${prof}/DevToolsActivePort`).split('\n')[0]; } catch (e) { /* not yet */ } }
  if (!ok('chrome: started', !!port)) { chrome.kill(); wsrv.close(); psrv.close(); return; }
  const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) errors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
  });
  const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalp = async (expr, ms) => {
    const r = await Promise.race([send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }), sleep(ms || 20000).then(() => ({ timeout: true }))]);
    if (r.timeout) return { __error: 'timeout' };
    if (r.result && r.result.exceptionDetails) return { __error: (r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : null;
  };
  await send('Runtime.enable'); await send('Page.enable');
  const open = async (p) => {
    errors.length = 0;
    await send('Page.navigate', { url: PURL + p });
    return evalp('for (let i = 0; i < 300; i++) { if (window.PG && PG.debug && PG.debug.mp && PG.Net) return true; await new Promise((r) => setTimeout(r, 50)); } return false;');
  };
  // host / join through the game's own flow; -> {t: ms until new Peer, peers, err, info}
  const HOST = `const t0 = performance.now(); const n = __peers.length; const code = await PG.debug.mp.host({}); const p = __peers[n] || null;
    return { code, ms: p ? Math.round(p.t - t0) : -1, peer: p, count: __peers.length, info: window.PG_RELAY ? PG_RELAY.info() : null, po: window.PG_PEER_OPTIONS ? JSON.parse(JSON.stringify(PG_PEER_OPTIONS.config)) : null };`;
  const JOIN = `const t0 = performance.now(); const n = __peers.length; const r = await PG.debug.mp.join('ab23', {}); const p = __peers[n] || null;
    return { r, ms: p ? Math.round(p.t - t0) : -1, peer: p, info: window.PG_RELAY ? PG_RELAY.info() : null };`;
  const cfgOf = (x) => (x && x.peer && x.peer.config) || null;
  try {
    // 1) the relay answers
    up.mode = 'ok'; up.calls = 0;
    ok('chrome: the relay page boots (PG_RELAY + the stand-in Peer)', await open('/relay.html') === true && await evalp('return !!window.PG_RELAY && typeof window.Peer === "function" && PG_RELAY.url;') === WURL);
    await evalp('document.getElementById("pg-start").click(); await new Promise((r) => setTimeout(r, 800)); PG.debug.toTitle(); return 1;');
    ok('chrome: solo play asks the relay nothing', up.calls === 0, up.calls);
    const h1 = await evalp(HOST);
    const c1 = cfgOf(h1);
    ok('chrome: 방 만들기 -> new Peer(id, opts) with the minted TURN servers (its credential, no port 53) + the public STUN', !!c1 && turnOf(c1.iceServers).length === 1 && turnOf(c1.iceServers)[0].credential === CRED && no53(c1.iceServers) && hasUrl(c1.iceServers, 'stun:stun.l.google.com:19302') && /^ppodeuk-/.test(h1.peer.id || ''), h1);
    ok('chrome: ... asked once (warmed by 친구와 하기 or by the tap - one request), source relay', up.calls === 1 && h1.info && h1.info.source === 'relay', [up.calls, h1.info]);
    const h2 = await evalp(HOST);
    ok('chrome: a second room reuses the list (no new request, source cache)', up.calls === 1 && h2.info.source === 'cache' && turnOf(cfgOf(h2).iceServers).length === 1, [up.calls, h2.info]);
    const j1 = await evalp(JOIN);
    ok('chrome: 참여 gets them too (a guest Peer, no id)', !!cfgOf(j1) && turnOf(cfgOf(j1).iceServers).length === 1 && j1.peer.id === null && up.calls === 1, j1);
    const stored = await evalp(`let s = ''; for (const st of [localStorage, sessionStorage]) for (let i = 0; i < st.length; i++) s += st.key(i) + '=' + st.getItem(st.key(i)); return s;`);
    ok('chrome: no credential stored anywhere (local / session storage)', typeof stored === 'string' && !stored.includes(CRED));
    ok('chrome: no page errors / console errors (relay answering)', errors.length === 0, errors.slice(0, 3));
    // 2) the upstream fails: STUN only - or the build's static list
    up.mode = '500'; up.calls = 0;
    await open('/relay.html');
    const h3 = await evalp(HOST);
    ok('chrome: the Worker answers 502 (upstream 500) -> STUN only, at once', !!cfgOf(h3) && turnOf(cfgOf(h3).iceServers).length === 0 && hasUrl(cfgOf(h3).iceServers, 'stun:stun.l.google.com:19302') && h3.info.source === 'stun' && h3.ms < 2000 && up.calls === 1, h3);
    await open('/relay-static.html');
    const h4 = await evalp(HOST);
    ok('chrome: ... with a static list in the build (TURN_CONFIG) -> that list', !!cfgOf(h4) && hasUrl(cfgOf(h4).iceServers, 'turn:static.example.com:3478') && h4.info.source === 'static', h4);
    // 3) a stalled Worker: the fallback after ~3 s, then at once for the next try
    up.mode = 'stall';
    await open('/relay-static.html');
    const h5 = await evalp(HOST, 30000);
    ok('chrome: a Worker that does not answer -> new Peer ~3 s after the tap, with the static list', !!cfgOf(h5) && h5.ms >= 2500 && h5.ms < 4800 && h5.info.source === 'static', h5 && [h5.ms, h5.info]);
    const h6 = await evalp(HOST);
    ok('chrome: ... the next room right after: the fallback at once (no 3 s wait again)', !!cfgOf(h6) && h6.ms < 1500 && h6.info.source === 'static', h6 && [h6.ms, h6.info]);
    const ui = await evalp('return { err: (document.getElementById("pg-friends-err") || {}).textContent || "", friends: !document.getElementById("pg-friends").hidden };');
    ok('chrome: ... the player sees the same room failure as without a relay (nothing about the relay)', ui && ui.friends && !/중계|relay|TURN/i.test(ui.err), ui);
    // 4) an origin the Worker refuses (CORS): the fallback
    up.mode = 'ok'; up.calls = 0; env.ALLOW_LOCALHOST = '0';
    await open('/relay.html');
    const h7 = await evalp(HOST);
    ok('chrome: the Worker refuses this origin (403, no CORS) -> STUN only, quickly, the upstream never asked', !!cfgOf(h7) && h7.info.source === 'stun' && h7.ms < 2000 && up.calls === 0, h7 && [h7.ms, h7.info, up.calls]);
    env.ALLOW_LOCALHOST = '1';
    // 5) the deploy without a relay: PeerJS gets what it got before (no PG_PEER_OPTIONS here: no config at all)
    up.calls = 0;
    await open('/nocfg.html');
    const h8 = await evalp(HOST);
    ok('chrome: the deploy without a relay: no PG_RELAY, new Peer at once with the options as before (its PG_PEER_OPTIONS, else none: PeerJS defaults), nothing asked', h8 && !h8.info && h8.peer && JSON.stringify(h8.peer.config) === JSON.stringify(h8.po) && h8.peer.keys.join() === (h8.po ? 'config,debug' : 'debug') && h8.ms < 1500 && up.calls === 0, h8);
    ok('chrome: no page errors (the other runs)', errors.length === 0, errors.slice(0, 3));
  } finally {
    try { await send('Browser.close'); } catch (e) { /* ignore */ }
    ws.close(); chrome.kill(); wsrv.close(); psrv.close();
    await sleep(300);
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
}

(async () => {
  await unit();
  buildChecks();
  if (!NO_CHROME) await chromeChecks();
  clearInterval(keepAlive);
  console.log(`RELAY-CLIENT ${fails ? 'FAIL' : 'OK'}: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('RELAY-CLIENT FAIL crashed :: ' + (e && e.stack || e)); process.exit(1); });
