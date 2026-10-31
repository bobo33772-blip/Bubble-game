// Contract checks for the two shipped pages (run after node bogeul/build.js):
//   dist/ppogeul-bath.html  the ARTIFACT page: <title> first, no doctype/html/head/body, nothing external but Google
//                           Fonts (no PeerJS, no other script/style/image hosts, no fetch/XHR/WebSocket), no
//                           alert/confirm/prompt/print, storage only inside try/catch, reduced motion, hot-reload hooks,
//                           no literal "</script" inside a script
//   deploy/index.html       the STANDALONE page: a valid document (doctype, <html lang="ko">, one head/body, charset in
//                           the first 1024 bytes, viewport, title, description, og tags, an inline SVG favicon) whose only
//                           external script is PeerJS pinned to an exact version, with the same body as the artifact; and
//                           in headless Chrome it must still play SOLO when PeerJS cannot load (all network blocked:
//                           transports {room:false, peer:false, bc:true}), and pick 'peer' when window.Peer exists.
//   the relay (design/relay.md 10): the artifact carries nothing of it (no PG_RELAY assignment, no pg-relay tag, no
//   Worker host); the deploy page at most build.js's one line; the deploy-relay/ fixture exactly that line.
// Usage: node bogeul/tools/check-pages.js [--static]
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { T, CH } = require('./env');
let fails = 0, passes = 0;
const ok = (name, cond, info) => { if (cond) passes++; else fails++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${!cond && info ? ' :: ' + info : ''}`); return !!cond; };

const art = fs.readFileSync(path.join(ROOT, 'dist', 'ppogeul-bath.html'), 'utf8');
const dep = fs.readFileSync(path.join(ROOT, 'deploy', 'index.html'), 'utf8');

// ---- helpers
const scripts = (html) => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].map((m) => ({ attrs: m[1], body: m[2] }));
const inlineJs = (html) => scripts(html).filter((s) => !/\bsrc\s*=/.test(s.attrs)).map((s) => s.body).join('\n');
const stripComments = (js) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const urlsIn = (html) => [...html.matchAll(/\b(?:src|href)\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi)].map((m) => m[1]);
const FONT_HOST = /^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/;

// ================================================================== artifact page
{
  ok('artifact: starts with <title>', /^<title>[^<]+<\/title>/.test(art), art.slice(0, 60));
  const skel = art.match(/<(!doctype|html|head|body)\b/gi);
  ok('artifact: no doctype/html/head/body tags', !skel, skel && skel.join(','));
  const ext = urlsIn(art).filter((u) => !FONT_HOST.test(u));
  ok('artifact: only Google Fonts are loaded from outside', ext.length === 0, ext.join(' '));
  ok('artifact: no external <script src>', !scripts(art).some((s) => /\bsrc\s*=/.test(s.attrs)));
  const css = [...art.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  ok('artifact: no external CSS url() / @import', !/url\(\s*["']?https?:|@import\s+(url\()?["']?https?:/i.test(css));
  ok('artifact: no PeerJS / CDN reference', !/peerjs(\.min)?\.js|cdnjs\.cloudflare|unpkg\.com|jsdelivr/i.test(art));
  const js = stripComments(inlineJs(art));
  const dialogs = js.match(/(?:^|[^.\w$])(alert|confirm|prompt|print)\s*\(|\bwindow\.(alert|confirm|prompt|print)\b/g);
  ok('artifact: no alert/confirm/prompt/print', !dialogs, dialogs && dialogs.slice(0, 3).join(' | '));
  const net = js.match(/\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\b|\bEventSource\b|\bimport\s*\(|navigator\.sendBeacon/g);
  ok('artifact: no fetch/XHR/WebSocket/beacon (PeerJS lives only in the deploy page)', !net, net && net.join(','));
  // every storage access sits on a line with its own try { } (the engine's sget/sset, audio's mute flag)
  const stor = js.split('\n').filter((l) => /\b(localStorage|sessionStorage|indexedDB)\b/.test(l));
  ok('artifact: storage access only inside try/catch', stor.length > 0 && stor.every((l) => /\btry\s*\{/.test(l) && /catch\s*\(/.test(l)), stor.filter((l) => !/\btry\s*\{/.test(l)).map((l) => l.trim().slice(0, 100)).join(' | '));
  ok('artifact: honours prefers-reduced-motion (CSS and engine)', /prefers-reduced-motion/.test(css) && /prefers-reduced-motion/.test(js));
  ok('artifact: hot-reload hooks (claude.hot ready / snapshot)', /claude\?\.hot\?\.ready/.test(js) && /claude\?\.hot\?\.snapshot/.test(js));
  ok('artifact: reaches capabilities only through claude.use(...)', !/window\.claude\.(room|user|db|artifact)\b|claude\??\.(room|user)\??\./.test(js));
  ok('artifact: scripts in order sprites, levels, audio, net, game', /\/\* ---- sprites\.js ---- \*\/[\s\S]*\/\* ---- levels\.js ---- \*\/[\s\S]*\/\* ---- audio\.js ---- \*\/[\s\S]*\/\* ---- net\.js ---- \*\/[\s\S]*\/\* ---- game\.js ---- \*\//.test(art));
  ok('artifact: size under 16 MB', Buffer.byteLength(art) < 16 * 1024 * 1024, Buffer.byteLength(art));
  // (net.js's 'ws' link is inlined too, but nothing here reaches it: it needs window.PG_RELAY or a loopback ?relay=, and
  // builds its socket from window.WebSocket only then - the no-WebSocket check above reads the literal constructor)
  ok('artifact: nothing of the relay (no PG_RELAY assignment, no pg-relay tag, no Worker address)', !/PG_RELAY\s*=|pg-relay|workers\.dev/.test(art));
  // (파티, design/party.md 9.2 / 7.5 / 7.6: the card overlay, hidden at boot; 파티 in both mode segments; the podium title's own span)
  ok('artifact: the 파티 card (#pg-party, hidden), 파티 in both mode segments, the podium title span', /<section id="pg-party" class="pg-ov pg-party"[^>]*hidden>/.test(art) && (art.match(/data-mode="party"/g) || []).length === 2 && art.includes('<span id="pg-podium-h">결과 발표!</span>'));
}

// ================================================================== standalone deploy page
const PEER_RE = /^https:\/\/(?:cdnjs\.cloudflare\.com\/ajax\/libs\/peerjs\/\d+\.\d+\.\d+\/peerjs\.min\.js|unpkg\.com\/peerjs@\d+\.\d+\.\d+\/dist\/peerjs\.min\.js)$/;
{
  ok('deploy: starts with <!doctype html>', /^<!doctype html>\s*<html lang="ko"(?: class="pg-sa")?>\s*<head>/i.test(dep), dep.slice(0, 60));
  const count = (re) => (dep.match(re) || []).length;
  ok('deploy: exactly one html/head/body', count(/<html\b/gi) === 1 && count(/<head\b/gi) === 1 && count(/<\/head>/gi) === 1 && count(/<body\b/gi) === 1 && count(/<\/body>/gi) === 1 && count(/<\/html>/gi) === 1);
  ok('deploy: ends with </body></html>', /<\/body>\s*<\/html>\s*$/i.test(dep));
  const head = (dep.match(/<head>([\s\S]*?)<\/head>/i) || [])[1] || '';
  ok('deploy: <meta charset> within the first 1024 bytes', /<meta charset="utf-8">/i.test(Buffer.from(dep).subarray(0, 1024).toString('latin1')));
  for (const [n, re] of [['viewport', /<meta name="viewport" content="[^"]*width=device-width/], ['title', /<title>[^<]+<\/title>/], ['description', /<meta name="description" content="[^"]{20,}">/],
    ['og:title', /<meta property="og:title" content="[^"]+">/], ['og:description', /<meta property="og:description" content="[^"]+">/], ['og:type', /<meta property="og:type" content="website">/],
    ['svg favicon data URI', /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,[^"]+">/]]) ok(`deploy: head has ${n}`, re.test(head));
  const headTags = [...head.matchAll(/<([a-z]+)\b/gi)].map((m) => m[1].toLowerCase());
  ok('deploy: head holds only head elements', headTags.every((t) => ['meta', 'title', 'link', 'style', 'script'].includes(t)), [...new Set(headTags)].join(','));
  const ext = scripts(dep).filter((s) => /\bsrc\s*=/.test(s.attrs)).map((s) => (s.attrs.match(/src="([^"]+)"/) || [])[1]);
  ok('deploy: the only external script is PeerJS pinned to an exact version', ext.length === 1 && PEER_RE.test(ext[0]), ext.join(' '));
  ok('deploy: PeerJS does not block parsing (defer/async)', scripts(dep).some((s) => /\bsrc\s*=/.test(s.attrs) && /\b(defer|async)\b/.test(s.attrs)));
  ok('deploy: PeerJS carries a Subresource Integrity hash (sha384/sha512) with crossorigin', scripts(dep).some((s) => /\bsrc\s*=/.test(s.attrs) && /\bintegrity="sha(384|512)-[A-Za-z0-9+/=]{40,}"/.test(s.attrs) && /\bcrossorigin=/.test(s.attrs)));
  const others = urlsIn(dep).filter((u) => !FONT_HOST.test(u) && !PEER_RE.test(u));
  ok('deploy: nothing else external', others.length === 0, others.join(' '));
  const body = (dep.match(/<body>\s*([\s\S]*?)\s*<\/body>/i) || [])[1] || '';
  const artBody = art.slice(art.indexOf('<div'));
  ok('deploy: same body as the artifact page', body.length > 1000 && body.trim() === artBody.trim(), `${body.length} vs ${artBody.length}`);
  const RELAY_LINE = /<script id="pg-relay">window\.PG_RELAY=\{url:"https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~-]+)*"\};<\/script>\n<script defer src="https:\/\/[^"]*peerjs/;
  const rl = count(/pg-relay/g);
  ok('deploy: the relay at most as build.js\'s one line, right before PeerJS (none without a relay URL)', rl === 0 ? !/PG_RELAY\s*=/.test(dep) : rl === 1 && RELAY_LINE.test(dep), String(rl));
  let fx = '';
  try { fx = fs.readFileSync(`${T}/deploy-relay/index.html`, 'utf8'); } catch (e) { fx = ''; }
  ok('deploy-relay fixture: exactly one PG_RELAY line with the placeholder address, before PeerJS, the same body',
    (fx.match(/pg-relay/g) || []).length === 1 && fx.includes('<script id="pg-relay">window.PG_RELAY={url:"http://127.0.0.1:9"};</script>\n<script defer src="') &&
    ((fx.match(/<body>\s*([\s\S]*?)\s*<\/body>/i) || [])[1] || '').trim() === artBody.trim(), String(fx.length));
}

// ================================================================== nothing of the 앱인토스 build (design/toss.md 2.1)
// (page.html's own .pg-ait CSS and game.js's window.PG_AIT reads are in every build: the checks are structural)
for (const [n, html] of [['artifact', art], ['deploy', dep]]) {
  ok(`${n}: no pg-ait class on <html>`, !/<html\b[^>]*\bpg-ait\b/i.test(html));
  ok(`${n}: no PG_AIT assignment (game.js / net.js only read it)`, !/PG_AIT\s*=(?!=)/.test(html));
  ok(`${n}: no ait.js script tag, no SDK name (@apps-in-toss)`, !/<script\b[^>]*\bsrc\s*=\s*["']?[^"'\s>]*ait\.js\b/i.test(html) && !/@apps-in-toss/.test(html));
}

// ================================================================== deploy page in Chrome
function chrome(file, flags, budget) {
  const prof = `${T}/chrome-profile-pages-${process.pid}`;
  const r = spawnSync(CH, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--hide-scrollbars', '--mute-audio', `--user-data-dir=${prof}`,
    '--window-size=900,760', `--virtual-time-budget=${budget}`, '--enable-logging=stderr', '--v=0', ...flags, '--dump-dom', require('./env').fileUrl(file)],
  { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  return (r.stderr || '').split(/\r?\n/).filter((l) => l.includes(':CONSOLE')).map((l) => { const m = l.match(/CONSOLE[^\]]*\]\s*"(.*)", source:/); return m ? m[1] : l; });
}
// a probe appended to a copy of deploy/index.html: solo play through the real title button, then 친구와 하기
const PROBE = `<script>
(function () {
  var c = window.console; ['error', 'warn'].forEach(function (k) { var f = c[k]; c[k] = function () { c.log('CONSOLE-' + k.toUpperCase() + ' ' + [].join.call(arguments, ' ')); return f.apply(c, arguments); }; });
  window.addEventListener('error', function (e) { c.log('PAGE-ERROR ' + e.message); });
  function go() { if (!window.PG || !PG.debug || !PG.debug.G || !PG.Net) return setTimeout(go, 30); setTimeout(run, 100); }
  async function run() {
    var r = {};
    try {
      r.compat = document.compatMode; r.lang = document.documentElement.lang; r.title = document.title; r.peer = typeof window.Peer;
      r.transports = await PG.Net.transports();
      document.getElementById('pg-start').click();
      var D = PG.debug; D.step(240);
      var s = D.getState(); r.phase = s.phase; r.mode = s.mode; r.players = s.players.length; r.enemies = s.enemies.length;
      D.press('right', true); D.step(30); D.press('right', false); D.press('jump', true); D.step(10); D.press('jump', false); D.step(60);
      var s2 = D.getState(); r.moved = Math.abs(s2.players[0].x - s.players[0].x) > 4; r.nan = !s2.players.every(function (p) { return isFinite(p.x) && isFinite(p.y); });
      D.toTitle(); document.getElementById('pg-friends-btn').click();
      setTimeout(function () {
        var fr = document.getElementById('pg-friends'), note = document.getElementById('pg-net-note');
        r.friends = !!fr && !fr.hidden; r.note = note && !note.hidden ? note.textContent : '';
        r.hostEnabled = !document.getElementById('pg-host').disabled;
        c.log('DEPLOY RESULT ' + JSON.stringify(r));
      }, 400);
    } catch (e) { c.log('DEPLOY RESULT ' + JSON.stringify({ error: String(e && e.stack || e) })); }
  }
  go();
})();
</script>`;
function deployRun(name, transform, flags) {
  const file = `deploy-${name}.html`;
  fs.writeFileSync(`${T}/${file}`, transform(dep).replace(/<\/body>\s*<\/html>\s*$/i, PROBE + '\n</body>\n</html>\n'));
  const lines = chrome(file, flags, 15000);
  const res = lines.map((l) => l.match(/^DEPLOY RESULT (.*)$/)).filter(Boolean).map((m) => JSON.parse(m[1]))[0] || null;
  const errs = lines.filter((l) => /^CONSOLE-(ERROR|WARN)|^PAGE-ERROR|^Uncaught/.test(l));
  return { res, errs, lines };
}
if (!process.argv.includes('--static')) {
  // 1) offline: every http(s) request fails (dead proxy), so PeerJS and the web fonts never arrive
  const off = deployRun('offline', (h) => h, ['--proxy-server=127.0.0.1:9', '--proxy-bypass-list=<-loopback>']);
  const r = off.res || {};
  ok('deploy offline: page ran the probe', !!off.res && !r.error, r.error || off.lines.slice(-3).join(' | '));
  ok('deploy offline: standards mode, lang ko, title', r.compat === 'CSS1Compat' && r.lang === 'ko' && /목욕탕/.test(r.title || ''), JSON.stringify([r.compat, r.lang, r.title]));
  ok('deploy offline: PeerJS missing -> transports {room:false, peer:false, bc:true}', r.peer === 'undefined' && r.transports && r.transports.room === false && r.transports.peer === false && r.transports.bc === true, JSON.stringify([r.peer, r.transports]));
  ok('deploy offline: solo starts from 혼자 하기 and plays', r.mode === 'solo' && r.phase === 'playing' && r.players === 1 && r.enemies > 0 && r.moved && !r.nan, JSON.stringify(r));
  ok('deploy offline: 친구와 하기 opens and says the online part did not load (not the Claude-only text)', r.friends && /불러오지 못했어요/.test(r.note || '') && !/Claude/.test(r.note || ''), JSON.stringify([r.friends, r.note]));
  ok('deploy offline: no page errors or console errors from the game', off.errs.length === 0, off.errs.slice(0, 3).join(' | '));
  console.log('  offline note: ' + (r.note || '').replace(/\n/g, ' / '));
  // 2) PeerJS present (a local stand-in for window.Peer, so no third-party code runs): the 'peer' transport is chosen
  const peerTag = /<script\b[^>]*\bsrc="https:\/\/[^"]*peerjs[^"]*"[^>]*><\/script>/i;
  ok('deploy: the PeerJS tag can be located (for the stand-in run)', peerTag.test(dep));
  const stub = deployRun('peerstub', (h) => h.replace(peerTag, '<script>window.Peer = function Peer() { throw new Error("stub"); };</script>'), ['--proxy-server=127.0.0.1:9', '--proxy-bypass-list=<-loopback>']);
  const s = stub.res || {};
  ok('deploy with Peer: transports().peer true and the panel explains codes', s.transports && s.transports.peer === true && s.transports.room === false && /코드/.test(s.note || '') && s.hostEnabled, JSON.stringify([s.transports, s.note, s.hostEnabled]));
  ok('deploy with Peer: solo still plays, no errors', s.mode === 'solo' && s.phase === 'playing' && stub.errs.length === 0, JSON.stringify([s.mode, s.phase, stub.errs.slice(0, 2)]));
}

console.log(`PAGES ${fails ? 'FAIL' : 'OK'}: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
