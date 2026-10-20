// The standalone deploy as an installable app (build.js, src/pwa/sw.js, game.js "v4 app install"), checked in headless
// Chrome over the DevTools protocol. Run `node bogeul/build.js` first (it copies deploy/ to C:/Temp/bogeul/deploy/).
// Usage: node bogeul/tools/pwa-check.js [--only=install,offline,slow,ui,phones,updates] [--keep]
//   (--keep: leave the Chrome profile for a look afterwards). run-all's job 'pwa' runs all of it.
// It serves C:/Temp/bogeul itself on http://127.0.0.1:8766 (its own port and its own Chrome, beside run-all's :8765)
// through a switch that can take /deploy/ down (connection reset), stall its page (no answer) or serve a "next deploy",
// and checks, in order:
//   files     deploy/ has the page, manifest, sw.js and icons; the manifest's fields; each icon is a PNG of its size; the
//             page and sw.js carry the same build hash; the head's app metas and the worker registration (http(s) only,
//             never framed); the artifact (dist/ppogeul-bath.html) has no manifest, no worker, no app metas; the itch
//             zip (tools/pack-itch.js) has index.html at its root and unpacks to the deploy files (-> itch-test/)
//   install   Chrome reads the manifest without errors and reports no installability errors; every icon decodes at its
//             size; the worker registers for /deploy/, activates and controls the page; the shell cache (named after
//             scope + build) holds exactly the page / manifest / icons and its page is this build; PeerJS and the
//             Google Fonts files end up in their caches (when this machine reaches the internet); no other cache
//   offline   the server down AND the page + worker offline: a reload still opens the game (the title, the web fonts
//             from the cache, PeerJS from the cache passing its SRI check), a solo round plays, ?join=CODE opens too
//   slow      the page request never answered: the cached page shows after the worker's 3.5 s timeout
//   UI        Chrome's own beforeinstallprompt (engagement checks bypassed) shows the "앱으로 설치" pill; a tap prompts
//             once and an accepted install hides it; an iPhone UA gets the "공유 → 홈 화면에 추가" hint instead,
//             KakaoTalk's in-app browser neither, an installed app (display-mode, else iOS navigator.standalone)
//             neither, the itch upload in a frame neither (and registers no worker); the fullscreen toggle enters /
//             leaves fullscreen; the artifact preview has not one of these elements, no worker, nothing warmed
//   phones    on their side: 844x390 and 932x430 (notch insets), 640x360, 568x320 (mobile UA, touch) and a 1x desktop
//             window, with a 7-digit best score: the title card fits with the pill / hint (beside the trophy badge or on
//             a line of its own), a round plays, nothing scrolls the page (no pull-to-refresh / bounce), no double-tap
//             zoom (a real double tap leaves the zoom at 1, here and on the artifact page), the joystick / 점프 / 거품
//             stay off the screen and inside the viewport, nothing sits under the insets, the header keeps its buttons
//             off the screen, the screen uses the space; the 목욕 끝 card and 내 기록 fit. Upright (390x844): the
//             "가로로 돌려 주세요" screen covers the game and pauses a round (back on its side: the pause menu); an
//             upright tablet (768x1024) keeps its layout
//             -> screenshots C:/Temp/bogeul/pwa-*.png
//   updates   a worker whose page is still the old build (a stale CDN edge) fails its install and leaves the working one
//             in place; a next deploy (new page + worker) installs in the background, replaces the old shell cache and
//             does not reload the open page; the next start shows it
// Prints "PWA PASS/FAIL <what>" lines and "PWA DONE pass=N fail=M"; exit code 1 on any failure. The page's console
// errors / warnings and uncaught exceptions are printed as "CONSOLE error: ..." / "PAGE-ERROR: ..." (run-all counts them;
// the offline / stalled phases print theirs as "CONSOLE log: (expected here) ...").
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const { T } = require('./env');
const TD = `${T}/deploy`;
const PORT = 8766;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const APP = `${ORIGIN}/deploy/`;
const { CH } = require('./env');
const KEEP = process.argv.includes('--keep');
const prof = `${T}/pwa-profile-${process.pid}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const UA_KAKAO = UA_IPHONE.replace('Safari/604.1', 'KAKAOTALK 25.5.1');

let pass = 0, fail = 0;
const ok = (cond, what, info) => { if (cond) pass++; else fail++; console.log(`PWA ${cond ? 'PASS' : 'FAIL'} ${what}${info !== undefined ? ' :: ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); return !!cond; };
const note = (m) => console.log('PWA NOTE ' + m);

// ---------------------------------------------------------------- 1. files (node side)
const read = (f, enc) => fs.readFileSync(f, enc);
const pngSize = (buf) => (buf.readUInt32BE(0) === 0x89504e47 ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null);
function fileChecks() {
  const need = ['index.html', 'manifest.webmanifest', 'sw.js'];
  for (const f of need) ok(fs.existsSync(path.join(ROOT, 'deploy', f)) && fs.existsSync(path.join(TD, f)), `deploy/${f} built and copied to ${TD}`);
  let man = null;
  try { man = JSON.parse(read(path.join(TD, 'manifest.webmanifest'), 'utf8')); } catch (e) { ok(false, 'manifest is JSON', e.message); return null; }
  ok(man.name === '뽀득뽀득 목욕탕' && man.short_name === '뽀득목욕탕' && man.lang === 'ko' && man.start_url === './' && man.scope === './' && man.id === './', 'manifest names / lang / start_url / scope / id', { name: man.name, short: man.short_name, lang: man.lang, start: man.start_url, scope: man.scope, id: man.id });
  ok(man.display === 'standalone' && Array.isArray(man.display_override) && man.display_override[0] === 'fullscreen', 'manifest display standalone, display_override fullscreen first', { display: man.display, over: man.display_override });
  ok(/^#[0-9a-f]{6}$/i.test(man.background_color) && man.theme_color === man.background_color && man.background_color.toLowerCase() === '#0a2327', 'manifest colours = the page --bg #0a2327');
  ok(man.orientation === 'landscape', 'manifest orientation landscape (the installed app opens on its side; iPhone: the rotate screen)', man.orientation);
  const icons = man.icons || [];
  const want = [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']];
  ok(want.every(([s, p]) => icons.some((i) => i.sizes === s && i.purpose === p && i.type === 'image/png')), 'manifest icons: 192 any, 512 any, 512 maskable', icons.map((i) => i.sizes + ' ' + i.purpose));
  for (const i of icons) {
    const f = path.join(TD, i.src), sz = fs.existsSync(f) ? pngSize(read(f)) : null, n = parseInt(i.sizes, 10);
    ok(sz && sz[0] === n && sz[1] === n, `icon ${i.src} is a ${i.sizes} PNG`, sz);
  }
  const html = read(path.join(TD, 'index.html'), 'utf8'), sw = read(path.join(TD, 'sw.js'), 'utf8');
  const build = (html.match(/<meta name="pg-build" content="([0-9a-f]{12})">/) || [])[1];
  const swBuild = (sw.match(/const BUILD = "([0-9a-f]{12})";/) || [])[1];
  ok(build && build === swBuild, 'page and sw.js carry the same build hash', { page: build, sw: swBuild });
  const apple = (html.match(/<link rel="apple-touch-icon" sizes="180x180" href="([^"]+)">/) || [])[1];
  ok(apple && pngSize(read(path.join(TD, apple)))[0] === 180, 'apple-touch-icon 180 linked and present', apple);
  for (const [re, what] of [[/<link rel="manifest" href="manifest\.webmanifest">/, 'manifest link'], [/<meta name="apple-mobile-web-app-capable" content="yes">/, 'apple-mobile-web-app-capable'],
    [/<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">/, 'status-bar-style black-translucent'], [/<meta name="apple-mobile-web-app-title" content="뽀득목욕탕">/, 'apple-mobile-web-app-title'],
    [/<meta name="theme-color" content="#0a2327">/, 'theme-color'], [/<html lang="ko" class="pg-sa">/, 'the pg-sa class (deploy-only CSS)'],
    [/sw\.register\('sw\.js',\{scope:'\.\/'\}\)/, 'worker registration'], [/location\.protocol\)\|\|window\.top!==window\.self\)return/, 'registration only on http(s), never framed']]) ok(re.test(html), 'deploy head: ' + what);
  const art = read(path.join(ROOT, 'dist', 'ppogeul-bath.html'), 'utf8');
  ok(!/<link\b[^>]*rel=["']?manifest|serviceWorker\s*\.\s*register|<meta\s+name=["']?(?:pg-build|apple-mobile-web-app|mobile-web-app)|class=["']?pg-sa|<script\b[^>]*\bsrc\s*=/i.test(art), 'the artifact has no manifest, no worker, no app metas, no external script');
  const SHELL = JSON.parse((sw.match(/const SHELL = (\[[^\]]*\]);/) || [])[1] || '[]');
  ok(SHELL.length === 2 + icons.length + 1 && SHELL[0] === './' && SHELL.includes('manifest.webmanifest'), 'sw.js app shell: the page, the manifest, every icon', SHELL);
  // the itch.io upload (tools/pack-itch.js): index.html at the root and every file the page links; unpacked into
  // C:/Temp/bogeul/itch-test/ for the framed run below
  const itch = require('./pack-itch'), zp = `${T}/pwa-itch.zip`;
  const packed = itch.pack(zp), ents = itch.unzip(fs.readFileSync(zp)), names = ents.map((e) => e.name);
  ok(names[0] === 'index.html' && ['manifest.webmanifest', 'sw.js', ...icons.map((i) => i.src), apple].every((n) => names.includes(n)) && !names.some((n) => /\.zip$|\\/.test(n)),
    'the itch zip: index.html at the root, the manifest, sw.js and every icon beside it', { size: packed.size, names });
  // (index.html as itch.pack makes it: a cloud config is marked away there or dropped - no config: the very same bytes)
  const itchForm = (e) => { const b = read(path.join(ROOT, 'deploy', ...e.name.split('/'))); return e.name === 'index.html' ? Buffer.from(itch.itchPage(b.toString('utf8')), 'utf8') : b; };
  ok(ents.every((e) => e.data.equals(itchForm(e))), 'the itch zip unpacks to the deploy files byte for byte (index.html: its itch form)');
  const IT = `${T}/itch-test`;
  fs.rmSync(IT, { recursive: true, force: true });
  for (const e of ents) { const p = path.join(IT, ...e.name.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, e.data); }
  return { man, build, SHELL, html, sw };
}

// ---------------------------------------------------------------- the switchable server
let mode = 'up';
const held = [], sockets = new Set();
const NEXT = 'aaaaaaaaaaaa', BAD = 'bbbbbbbbbbbb';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };
let INFO = null;
const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, ORIGIN).pathname); } catch (e) { res.writeHead(400); res.end(); return; }
  const inApp = rel.startsWith('/deploy/');
  if (inApp && mode === 'down') { req.socket.destroy(); return; }
  if (inApp && mode === 'stall' && (rel === '/deploy/' || rel === '/deploy/index.html')) { held.push(res); return; }
  if (rel === '/pwa-frame.html') { res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' }); res.end('<!doctype html><meta charset="utf-8"><title>frame</title><body style="margin:0"><iframe id="f" src="/itch-test/index.html" style="border:0;width:100vw;height:100vh"></iframe>'); return; }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(T, '.' + rel);
  if (!file.startsWith(path.resolve(T) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end('not found'); return; }
  let body = fs.readFileSync(file);
  // "the next deploy": a new page (its build meta) and a new worker; 'bad': only the worker is new (a stale CDN page)
  if (inApp && (mode === 'next' || mode === 'bad') && INFO) {
    const id = mode === 'next' ? NEXT : BAD;
    if (rel === '/deploy/sw.js') body = Buffer.from(body.toString('utf8').replace(`const BUILD = "${INFO.build}";`, `const BUILD = "${id}";`));
    if (rel === '/deploy/index.html' && mode === 'next') body = Buffer.from(body.toString('utf8').replace(`content="${INFO.build}"`, `content="${id}"`));
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : body);
});
server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
function setMode(m) {
  mode = m;
  for (const r of held.splice(0)) { try { r.destroy(); } catch (e) { /* ignore */ } }
  if (m === 'down') for (const s of sockets) s.destroy();
}

// ---------------------------------------------------------------- DevTools protocol (flat sessions)
let ws, msgId = 0;
const pending = new Map(), waiters = [];
let pageSid = null, consoleQuiet = false;
function send(method, params = {}, sessionId) {
  return new Promise((resolve) => {
    const i = ++msgId; pending.set(i, resolve);
    ws.send(JSON.stringify(sessionId ? { id: i, method, params, sessionId } : { id: i, method, params }));
  });
}
const sendT = (method, params, sid, ms = 20000) => Promise.race([send(method, params, sid), sleep(ms).then(() => ({ timeout: true }))]);
function onMessage(m) {
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  for (const w of waiters.slice()) if (w.method === m.method && (!w.sid || w.sid === m.sessionId)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m.params || {}); }
  if (m.sessionId !== pageSid) return;
  if (m.method === 'Runtime.consoleAPICalled') {
    const txt = m.params.args.map((a) => (a.value !== undefined ? a.value : a.description || '')).join(' ');
    if (m.params.type === 'error' || m.params.type === 'warning') console.log(`CONSOLE ${consoleQuiet ? 'log' : m.params.type === 'error' ? 'error' : 'warn'}: ${consoleQuiet ? '(expected here) ' : ''}${txt}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    console.log(`PAGE-ERROR: ${(d.exception && d.exception.description) || d.text} @${d.url || ''}:${d.lineNumber}`);
  }
}
const waitEvent = (method, sid, ms) => new Promise((resolve) => { const w = { method, sid, resolve }; waiters.push(w); setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); resolve(null); } }, ms); });
async function ev(expr, ms = 20000) {
  const r = await sendT('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, pageSid, ms);
  if (r.timeout) throw new Error('evaluate timed out: ' + expr.slice(0, 90));
  if (r.error) throw new Error('evaluate: ' + r.error.message);
  if (r.result.exceptionDetails) { const d = r.result.exceptionDetails; throw new Error('evaluate threw: ' + ((d.exception && d.exception.description) || d.text)); }
  return r.result.result.value;
}
async function until(expr, ms = 10000, step = 100) {
  const t0 = Date.now();
  for (;;) { let v; try { v = await ev(expr, 5000); } catch (e) { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); }
}
// navigate / reload and wait for the load event; returns the ms it took (null: no load event in time)
async function go(url, ms = 30000) {
  const t0 = Date.now(), loaded = waitEvent('Page.loadEventFired', pageSid, ms);
  if (url) await send('Page.navigate', { url }, pageSid); else await send('Page.reload', { ignoreCache: false }, pageSid);
  const r = await loaded;
  return r ? Date.now() - t0 : null;
}
async function shot(name) {
  const r = await sendT('Page.captureScreenshot', { format: 'png' }, pageSid, 20000);
  if (r && r.result && r.result.data) { const p = `${T}/${name}`; fs.writeFileSync(p, Buffer.from(r.result.data, 'base64')); console.log(`screenshot: ${p}`); return p; }
  console.log('screenshot FAILED ' + name); return null;
}
let swSid = null;
async function swSession() {
  const t = await send('Target.getTargets', {});
  const sw = ((t.result && t.result.targetInfos) || []).find((x) => x.type === 'service_worker' && x.url.startsWith(APP));
  if (!sw) return null;
  const a = await send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
  return a.result ? a.result.sessionId : null;
}
async function offline(on) {
  const cond = { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
  await send('Network.enable', {}, pageSid); await send('Network.emulateNetworkConditions', cond, pageSid);
  if (on) swSid = await swSession();
  if (swSid) { await send('Network.enable', {}, swSid); await send('Network.emulateNetworkConditions', cond, swSid); }
  if (!on) swSid = null;
}
async function emulate(w, h, mobile, ua, insets) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile }, pageSid);
  await send('Emulation.setTouchEmulationEnabled', { enabled: !!mobile, maxTouchPoints: mobile ? 5 : 1 }, pageSid);
  await send('Emulation.setUserAgentOverride', { userAgent: ua || DEFAULT_UA }, pageSid);
  const r = await send('Emulation.setSafeAreaInsetsOverride', { insets: insets || {} }, pageSid);
  return !r.error;
}
let DEFAULT_UA = '';

// ---------------------------------------------------------------- in-page probes
const STATE = 'PG.debug.pwa()';
// layout: page scroll, the screen, the pads (overlap / inside), the header buttons, the title card (fits? the pill on
// the 최고 점수 line, inside the card)
const LAYOUT = `(() => {
  const de = document.documentElement, $ = (id) => document.getElementById(id);
  const box = (el) => { if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); return r.width ? { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } : null; };
  const ov = (a, c) => !!(a && c && a.l < c.r && a.r > c.l && a.t < c.b && a.b > c.t);
  const scr = box($('pg-screen')), pads = ['pg-stick', 'pg-t-jump', 'pg-t-shoot'].map((id) => box($(id)));
  const touch = $('pg-app').classList.contains('pg-touch-on');
  const card = document.querySelector('#pg-title:not([hidden]) .pg-card'), cb = box(card);
  const pill = box($('pg-install')) || box($('pg-ioshint')), tro = box($('pg-tro'));
  const head = ['pg-fs', 'pg-sound', 'pg-pausebtn'].map((id) => box($(id))).filter(Boolean);
  return { vw: innerWidth, vh: innerHeight, scrollW: Math.max(de.scrollWidth, document.body.scrollWidth), scrollH: Math.max(de.scrollHeight, document.body.scrollHeight),
    scrollY: scrollY, touch, land: $('pg-app').classList.contains('pg-land'), rotate: !!($('pg-rotate') && !$('pg-rotate').hidden), scr, scale: scr ? +(scr.w / 256).toFixed(3) : 0, fs: getComputedStyle($('pg-screen')).getPropertyValue('--fs'),
    padsOverScreen: touch && pads.some((p) => ov(p, scr)), padsInside: !touch || pads.every((p) => p && p.l >= 0 && p.t >= 0 && p.r <= innerWidth && p.b <= innerHeight),
    padsOverlapEachOther: touch && pads.some((p, i) => pads.some((q, j) => j > i && ov(p, q))),
    headInside: head.every((h) => h.l >= 0 && h.r <= innerWidth && h.t >= 0), headButtons: head.length,
    headOverScreen: head.concat([box(document.querySelector('.pg-brand'))]).some((h) => ov(h, scr)),
    card: cb, cardSH: card ? card.scrollHeight : 0, cardCH: card ? card.clientHeight : 0, cardFits: !card || card.scrollHeight <= card.clientHeight + 1, cardInScreen: !cb || !scr || (cb.t >= scr.t - 1 && cb.b <= scr.b + 1),
    pill, pillInCard: !pill || (cb && pill.t >= cb.t && pill.b <= cb.b && pill.l >= cb.l && pill.r <= cb.r), pillOnTroLine: !pill || !tro || Math.abs((pill.t + pill.b) / 2 - (tro.t + tro.b) / 2) < 4,
    start: box($('pg-start')), friends: box($('pg-friends-btn')), shop: box($('pg-shop-btn')),
    // (v4 shop 9.1: 혼자 하기 · 친구와 하기 · 상점 on one row inside the card - layout boxes, the NEW dot's hop is a transform)
    row: (() => { const ids = ['pg-start', 'pg-friends-btn', 'pg-shop-btn'], els = ids.map($); if (!card || els.some((e) => !e)) return null;
      const r = els[0].parentNode, top = (e) => e.offsetTop, need = els.reduce((s, e) => s + e.offsetWidth, 0) + (parseFloat(getComputedStyle(r).columnGap) || 0) * 2;
      return { one: els.every((e) => top(e) === top(els[0]) && e.offsetHeight === els[0].offsetHeight), fits: need <= r.clientWidth + 1.5, need: Math.round(need), w: r.clientWidth,
        label: !!(els[2].querySelector('.pg-shopbtn-tx') && els[2].querySelector('.pg-shopbtn-tx').getClientRects().length) }; })() };
})()`;
// (v4 shop 9.2-9.4) the hub on this viewport, opened on `tab` over the title with a staged store (coins, a few items,
// a 12-item 머리 slot): nothing sideways, its vertical scroll, the action button beside the preview
const HUB = (tab) => `(() => { const S = PG.debug.shop, $ = (id) => document.getElementById(id);
  S.set({ ce: 1234, sh: 1, own: ['h5', 'n3', 'e6'], eq: '50306' }); PG.debug.toTitle(); S.open('${tab}');
  const pn = $('pg-hub'), cd = pn.querySelector('.pg-hub-card'), r = cd.getBoundingClientRect();
  const out = [...cd.querySelectorAll('*')].filter((e) => { if (!e.getClientRects().length || e.closest('[hidden]')) return false; const b = e.getBoundingClientRect(); return b.width && (b.left < r.left - 0.5 || b.right > r.right + 0.5); }).length;
  const v = $('pg-shop-view').getBoundingClientRect(), b = $('pg-shop-buy').getBoundingClientRect(), h = S.hub();
  return { tab: h.tab, sel: h.sel, sw: pn.scrollWidth, cw: pn.clientWidth, sh: pn.scrollHeight, ch: pn.clientHeight, out, cells: $('pg-${tab === 'shop' ? 'shop' : 'my'}-grid').children.length,
    beside: h.tab !== 'shop' || (b.left >= v.right && b.top < v.bottom && b.bottom > v.top), open: $('pg-app').classList.contains('pg-panel-open') }; })()`;
const HUB_OFF = `(() => { PG.debug.shop.close(); PG.debug.shop.set({ eq: '00000', own: [], ce: 0, sp: 0 }); return 1; })()`;
const PLAY = `(() => { const D = PG.debug; D.seed(3); D.start(1); D.setInvincible(true); D.step(150);
  D.press('right', true); D.step(30); for (let i = 0; i < 3; i++) { D.press('shoot', true); D.step(1); D.press('shoot', false); D.step(14); } D.press('right', false);
  D.press('jump', true); D.step(8); D.press('jump', false); D.step(20); const s = D.getState(); return { phase: s.phase, round: s.round, score: s.score }; })()`;
// do the game's Korean glyphs load in both web fonts? (a real load, not document.fonts.check: false offline without a cache)
const FONTS_OK = `Promise.race([Promise.all([document.fonts.load('20px "Black Han Sans"', '뽀득뽀득 목욕탕'), document.fonts.load('14px "Gowun Dodum"', '따끈한 물에 몸 좀 녹이고 가요')])
  .then((a) => a.every((x) => x.length > 0 && x.every((ff) => ff.status === 'loaded')), () => false), new Promise((r) => setTimeout(() => r(false), 4000))])`;
// keeps Chrome's real beforeinstallprompt from the game (staged iPhones; our own staged events still pass)
const NO_BIP = "addEventListener('beforeinstallprompt', (e) => { if (e.isTrusted) e.stopImmediatePropagation(); }, true);";
// a beforeinstallprompt of our own (the pill's rendering / its tap, independent of Chrome's heuristics)
const FAKE_BIP = (outcome) => `(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); window.__bip = { asked: 0 };
  e.prompt = () => { window.__bip.asked++; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: '${outcome}', platform: 'web' });
  window.dispatchEvent(e); return PG.debug.pwa(); })()`;

// ---------------------------------------------------------------- the run
(async () => {
  INFO = fileChecks();
  if (!INFO) throw new Error('no deploy build (node bogeul/build.js)');
  await new Promise((r, j) => { server.once('error', j); server.listen(PORT, '127.0.0.1', r); });
  // (a stale DevToolsActivePort: a killed run's profile under the same - reused - pid would hand over a dead port and the
  // run fails with 'fetch failed' at once; the profile is this pid's own, removed at the end anyway)
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* locked */ }
  try { fs.unlinkSync(prof + '/DevToolsActivePort'); } catch (e) { /* none */ }
  const chrome = spawn(CH, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--hide-scrollbars', '--mute-audio', '--no-default-browser-check',
    '--bypass-app-banner-engagement-checks', '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${prof}`, '--remote-debugging-port=0', '--window-size=900,760', 'about:blank'], { stdio: 'ignore' });
  let port = null;
  for (let i = 0; i < 150 && !port; i++) { await sleep(100); try { port = fs.readFileSync(`${prof}/DevToolsActivePort`, 'utf8').split('\n')[0]; } catch (e) { /* not yet */ } }
  if (!port) { console.log('pwa-check: chrome did not start'); chrome.kill(); process.exit(2); }
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  DEFAULT_UA = ver['User-Agent'].replace('HeadlessChrome', 'Chrome');
  ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => onMessage(JSON.parse(e.data)));
  const targets = (await send('Target.getTargets', {})).result.targetInfos;
  const pg = targets.find((t) => t.type === 'page');
  pageSid = (await send('Target.attachToTarget', { targetId: pg.targetId, flatten: true })).result.sessionId;
  for (const d of ['Runtime.enable', 'Page.enable', 'Log.enable']) await send(d, {}, pageSid);
  // (the deploy with the cloud shows a login screen before the title to a browser that never chose: this one has played
  // as a guest - the app checks below are about the title; src/tests/cloud.js checks the login screen)
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('ppogeul-login', '1'); } catch (e) { /* ignore */ }" }, pageSid);
  await emulate(900, 760, false);
  const finish = async (code) => {
    try { await sendT('Browser.close', {}, null, 5000); } catch (e) { /* ignore */ }
    try { ws.close(); } catch (e) { /* ignore */ }
    chrome.kill(); setMode('up'); server.close(); for (const s of sockets) s.destroy();
    for (let i = 0; i < 10 && !KEEP; i++) { await sleep(300); try { fs.rmSync(prof, { recursive: true, force: true }); break; } catch (e) { /* locked */ } }
    process.exit(code);
  };
  try {
    await run();
  } catch (e) {
    ok(false, 'the run itself', e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
  }
  console.log(`PWA DONE pass=${pass} fail=${fail}`);
  await finish(fail ? 1 : 0);
})().catch((e) => { console.log('pwa-check error ' + (e && e.stack || e)); process.exit(3); });

// --only=install,offline,slow,ui,phones,updates runs just those sections (offline needs install: it runs it too)
const ONLY = ((process.argv.find((a) => a.startsWith('--only=')) || '').slice(7)).split(',').filter(Boolean);
const want = (sec) => !ONLY.length || ONLY.includes(sec);
let ONLINE = false;
async function run() {
  if (want('install') || want('offline')) await secInstall();
  if (want('offline')) await secOffline();
  if (want('slow')) await secSlow();
  if (want('ui')) await secUI();
  if (want('phones')) await secPhones();
  if (want('updates')) await secUpdates();
}

async function secInstall() {
  // ---------------------------------------------------------------- 2. install (online)
  ok(await go(APP) !== null, 'the deploy page loads over http');
  ok(await until('!!(window.PG && PG.debug && PG.debug.pwa)'), 'the game boots');
  const man = await send('Page.getAppManifest', {}, pageSid);
  const mr = man.result || {};
  ok(mr.url === APP + 'manifest.webmanifest' && (mr.errors || []).length === 0 && /뽀득목욕탕/.test(mr.data || ''), 'Chrome reads the manifest without errors', { url: mr.url, errors: mr.errors });
  const inst = await send('Page.getInstallabilityErrors', {}, pageSid);
  const ie = (inst.result && inst.result.installabilityErrors) || [];
  ok(!inst.error && ie.length === 0, 'Chrome reports no installability errors', inst.error ? inst.error.message : ie.map((x) => x.errorId));
  const ic = await ev(`Promise.all(${JSON.stringify(INFO.man.icons.map((i) => [i.src, parseInt(i.sizes, 10)]).concat([['icons/apple-touch-icon-180.png', 180]]))}.map(([src, n]) => new Promise((res) => {
    const im = new Image(); im.onload = () => res([src, im.naturalWidth === n && im.naturalHeight === n]); im.onerror = () => res([src, false]); im.src = src; })))`);
  ok(ic.every((x) => x[1]), 'every icon loads and decodes at its size', ic);
  const reg = await until(`navigator.serviceWorker.getRegistration('./').then((r) => r && r.active && r.active.state === 'activated' ? { scope: r.scope, script: r.active.scriptURL } : null)`, 15000);
  ok(reg && reg.scope === APP && reg.script === APP + 'sw.js', 'the worker registers for the app scope and activates', reg);
  ok(await until('!!navigator.serviceWorker.controller', 8000), 'the worker controls the open page (clients.claim, no reload needed)');
  const SHELL_CACHE = `ppodeuk-shell@${APP}@${INFO.build}`;
  const cache = await ev(`(async () => { const keys = await caches.keys(); const c = await caches.open(${JSON.stringify(SHELL_CACHE)});
    const reqs = await c.keys(); const pg = await c.match(${JSON.stringify(APP)}); return { keys, urls: reqs.map((r) => r.url), page: pg ? (await pg.text()).includes('<meta name="pg-build" content="${INFO.build}">') : false }; })()`);
  const wantUrls = INFO.SHELL.map((p) => new URL(p, APP).href).sort();
  ok(cache.keys.includes(SHELL_CACHE) && JSON.stringify(cache.urls.slice().sort()) === JSON.stringify(wantUrls), 'the shell cache (named after scope + build) holds exactly the app shell', { keys: cache.keys, urls: cache.urls });
  ok(cache.page, 'the precached page is this build (its pg-build meta)');
  // PeerJS (cdnjs, SRI) and the Google Fonts files: cached once they loaded (only when this machine is online)
  const net = await until(`(async () => { const peer = typeof window.Peer === 'function'; const fonts = await ${FONTS_OK};
    const cdn = await (await caches.open('ppodeuk-cdn-v1')).keys(); const f = await (await caches.open('ppodeuk-fonts-v1')).keys();
    const o = { peer, fonts, cdn: cdn.map((r) => r.url), fontEntries: f.length, css: f.filter((r) => /fonts\\.googleapis/.test(r.url)).length };
    window.__netLast = o; return (peer ? cdn.length > 0 : true) && (fonts ? f.length > 1 : true) ? o : null; })()`, 15000, 300) || await ev('window.__netLast || null');
  const online = ONLINE = !!(net && net.peer && net.fonts);
  if (net && net.peer) ok(net.cdn.length === 1 && /peerjs\/1\.5\.4\/peerjs\.min\.js$/.test(net.cdn[0]), 'PeerJS (SRI-pinned) is kept in the cdn cache', net.cdn);
  if (net && net.fonts) ok(net.css >= 1 && net.fontEntries > net.css, 'the Google Fonts stylesheet and font files are kept in the fonts cache', { entries: net.fontEntries, css: net.css });
  if (!online) note('this machine did not load PeerJS / the fonts from the internet (or they were not kept): ' + JSON.stringify(net));
  const other = await ev(`caches.keys()`);
  ok(other.every((k) => k === SHELL_CACHE || k === 'ppodeuk-fonts-v1' || k === 'ppodeuk-cdn-v1'), 'no other cache exists (nothing else is ever stored)', other);
}

async function secOffline() {
  // ---------------------------------------------------------------- 3. offline: the server gone, the page and the worker offline
  setMode('down'); consoleQuiet = true; await offline(true);
  const tOff = await go(null, 20000);
  ok(tOff !== null, 'offline: a reload still loads the page', tOff + ' ms');
  ok(await until('!!(window.PG && PG.debug && PG.debug.getState)', 8000), 'offline: the game boots');
  const off = await ev(`(async () => { const t = document.getElementById('pg-title'); const fonts = await ${FONTS_OK};
    return { title: !!t && !t.hidden, build: (document.querySelector('meta[name="pg-build"]') || {}).content, ctl: !!navigator.serviceWorker.controller, fonts, peer: typeof window.Peer === 'function', online: navigator.onLine }; })()`);
  ok(off.title && off.build === INFO.build && off.ctl, 'offline: the title shows, the page is this build, served by the worker', off);
  if (ONLINE) {
    ok(off.fonts, 'offline: the game\'s web fonts come from the cache');
    ok(off.peer, 'offline: PeerJS comes from the cache and passes its SRI check');
  }
  const solo = await ev(PLAY);
  ok(solo.phase === 'playing' && solo.round === 1, 'offline: a solo round plays', solo);
  ok(await go(APP + '?join=AB12', 20000) !== null && await until(`!!(window.PG && PG.debug) && !document.getElementById('pg-friends').hidden && document.getElementById('pg-code').value === 'AB12'`, 8000), 'offline: an invite link (?join=CODE) opens the cached page too');
  await offline(false); setMode('up'); consoleQuiet = false;
}

async function secSlow() {
  // ---------------------------------------------------------------- 4. slow: the page request is never answered
  await go(APP, 20000);
  setMode('stall'); consoleQuiet = true;
  const tSlow = await go(null, 20000);
  const slowOk = await until(`!!(window.PG && PG.debug) && document.querySelector('meta[name="pg-build"]').content === '${INFO.build}'`, 5000);
  ok(tSlow !== null && tSlow >= 3300 && tSlow < 9000 && slowOk, 'a stalled network: the cached page shows after the worker\'s 3.5 s timeout', tSlow + ' ms');
  setMode('up'); consoleQuiet = false;
}

async function secUI() {
  // ---------------------------------------------------------------- 5. install UI
  await go(APP);
  await until('!!(window.PG && PG.debug && PG.debug.pwa)');
  const real = await until(`PG.debug.pwa().prompt ? PG.debug.pwa() : null`, 8000);
  if (real) ok(real.install && !real.iosHint, 'Chrome\'s own beforeinstallprompt shows the "앱으로 설치" pill', real);
  else note('Chrome fired no beforeinstallprompt in this headless run (its own heuristics); the pill is checked with a staged event');
  let st = await ev(FAKE_BIP('accepted'));
  ok(st.on && st.prompt && st.install && !st.iosHint && !st.app, 'a beforeinstallprompt: the pill shows (no iOS hint)', st);
  const lay = await ev(LAYOUT);
  ok(lay.pillOnTroLine && lay.pillInCard && lay.cardFits, 'desktop: the pill sits on the 최고 점수 line inside the card', { pill: lay.pill, card: lay.card, fits: lay.cardFits });
  ok(await ev(`document.querySelector('#pg-fontwarm .pg-fw-body').textContent.includes('앱으로 설치')`), 'the install texts are in the font warm-up');
  await ev(`document.getElementById('pg-install').click()`);
  st = await until(`window.__bip && window.__bip.asked === 1 && PG.debug.pwa().installed ? PG.debug.pwa() : null`, 3000);
  ok(st && !st.install && !st.prompt, 'a tap opens the prompt once; an accepted install hides the pill', st);
  // iPhone Safari: the hint; KakaoTalk's in-app browser: nothing (this desktop Chrome's own beforeinstallprompt is kept from
  // the game meanwhile - a real iPhone never fires one)
  const noBip = (await send('Page.addScriptToEvaluateOnNewDocument', { source: NO_BIP }, pageSid)).result.identifier;
  await emulate(844, 390, true, UA_IPHONE);
  await go(APP); await until('!!(window.PG && PG.debug && PG.debug.pwa)');
  st = await ev(STATE);
  ok(st.ios && st.iosHint && !st.install, 'an iPhone: the "공유 → 홈 화면에 추가" hint instead', st);
  const ios = await ev(LAYOUT);
  ok(ios.pillInCard && ios.cardFits && !ios.padsOverScreen, 'the iOS hint fits in the title card at 844x390', { pill: ios.pill, card: ios.card, inline: ios.pillOnTroLine });
  await shot('pwa-ios-844.png');
  await emulate(667, 375, true, UA_IPHONE);
  await go(APP); await until('!!(window.PG && PG.debug && PG.debug.pwa)');
  const ios375 = await ev(LAYOUT);
  ok(ios375.pillInCard && ios375.cardFits && !ios375.padsOverScreen, 'the iOS hint fits in the title card at 667x375 (iPhone SE on its side)', ios375);
  await shot('pwa-ios-667.png');
  await emulate(390, 844, true, UA_KAKAO);
  await go(APP); await until('!!(window.PG && PG.debug && PG.debug.pwa)');
  st = await ev(STATE);
  ok(st.inApp && !st.iosHint && !st.install, 'KakaoTalk\'s in-app browser: no hint (it cannot add to the home screen)', st);
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: noBip }, pageSid);
  await emulate(900, 760, false);
  // an installed app (display-mode standalone, where this Chrome can emulate it): no pill, no hint
  const dm = await send('Emulation.setEmulatedMedia', { features: [{ name: 'display-mode', value: 'standalone' }] }, pageSid);
  if (!dm.error && await ev(`matchMedia('(display-mode: standalone)').matches`)) {
    st = await ev(FAKE_BIP('dismissed'));
    ok(st.app && !st.install && !st.iosHint, 'running as an installed app: no pill', st);
    await send('Emulation.setEmulatedMedia', { features: [] }, pageSid);
    st = await until(`!PG.debug.pwa().app && PG.debug.pwa().install ? PG.debug.pwa() : null`, 3000);
    ok(st, 'back in a tab (display-mode browser): the pill returns (the media query change is followed)', st);
  } else {
    // (this Chrome cannot emulate display-mode: an iPhone home-screen app instead - navigator.standalone)
    const sa = (await send('Page.addScriptToEvaluateOnNewDocument', { source: NO_BIP + "Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });" }, pageSid)).result.identifier;
    await emulate(390, 844, true, UA_IPHONE);
    await go(APP); await until('!!(window.PG && PG.debug && PG.debug.pwa)');
    st = await ev(FAKE_BIP('dismissed'));
    ok(st.app && !st.install && !st.iosHint, 'running as an installed app (iOS home screen: navigator.standalone): no pill, no hint', st);
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: sa }, pageSid);
    await emulate(900, 760, false);
  }
  // in a frame (itch.io: the unpacked itch zip in an iframe): nothing, and no worker registered for it
  await go(ORIGIN + '/pwa-frame.html');
  const fr = await until(`(() => { const w = document.getElementById('f').contentWindow; if (!(w.PG && w.PG.debug && w.PG.debug.pwa)) return null;
    const e = new w.Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => Promise.resolve(); e.userChoice = Promise.resolve({ outcome: 'dismissed' }); w.dispatchEvent(e); return w.PG.debug.pwa(); })()`, 15000);
  ok(fr && fr.framed && fr.prompt && !fr.install && !fr.iosHint, 'inside a frame (itch.io): no pill even with a beforeinstallprompt, no hint', fr);
  await sleep(1500);
  const frw = await ev(`(async () => { const w = document.getElementById('f').contentWindow; const r = await w.navigator.serviceWorker.getRegistration(w.location.href);
    const m = await w.fetch(w.document.querySelector('link[rel="manifest"]').href); return { reg: !!r, ctl: !!w.navigator.serviceWorker.controller, manifest: m.ok, game: w.PG.debug.getState().phase }; })()`);
  ok(frw && !frw.reg && !frw.ctl && frw.manifest && frw.game === 'title', 'the itch upload in a frame: the game runs, no worker is registered, its manifest link resolves', frw);
  // the fullscreen toggle
  await go(APP); await until('!!(window.PG && PG.debug && PG.debug.pwa)');
  st = await ev(STATE);
  ok(st.fsBtn && !st.fullscreen, 'the header has the fullscreen toggle (the Fullscreen API works here)', st);
  await send('Runtime.evaluate', { expression: `document.getElementById('pg-fs').click()`, userGesture: true }, pageSid);
  // (fullscreenElement is set before the fullscreenchange event that redraws the toggle: wait for both)
  st = await until(`PG.debug.pwa().fullscreen && document.getElementById('pg-fs').getAttribute('aria-pressed') === 'true' ? PG.debug.pwa() : null`, 4000);
  ok(st && st.fsBtn && (await ev(`document.getElementById('pg-fs').getAttribute('aria-pressed') === 'true' && document.getElementById('pg-fs').classList.contains('is-on')`)), 'the toggle enters fullscreen (pressed, corners in)', st);
  await send('Runtime.evaluate', { expression: `document.getElementById('pg-fs').click()`, userGesture: true }, pageSid);
  st = await until(`!PG.debug.pwa().fullscreen ? PG.debug.pwa() : null`, 4000);
  ok(st && st.fsBtn, 'and leaves it again', st);
  // the artifact flavour (preview.html: the artifact page in its skeleton): none of it, no worker
  await go(ORIGIN + '/preview.html'); await until('!!(window.PG && PG.debug && PG.debug.pwa)');
  st = await ev(FAKE_BIP('accepted'));
  const art = await ev(`(async () => ({ ctl: !!navigator.serviceWorker.controller, regs: (await navigator.serviceWorker.getRegistrations()).filter((r) => !r.scope.endsWith('/deploy/')).length,
    els: ['pg-fs', 'pg-install', 'pg-ioshint'].filter((id) => document.getElementById(id)), cls: document.querySelector('.pg-has-inst, .pg-sa') ? 1 : 0,
    warm: document.querySelector('#pg-fontwarm .pg-fw-body').textContent.includes('앱으로 설치'), manifest: !!document.querySelector('link[rel="manifest"]') }))()`);
  ok(!st.on && !st.install && !st.iosHint && !st.fsBtn && art.els.length === 0 && !art.cls && !art.ctl && art.regs === 0 && !art.warm && !art.manifest, 'the artifact: not one install / fullscreen element even after a beforeinstallprompt, no worker, nothing warmed', { st, art });
}

// (v4 shop) the hub on this viewport, both tabs: nothing sideways, the action button beside the preview, and (whole) no
// vertical scroll; a screenshot of each (pwa-<tag>-shop.png / -my.png); then closed with the store bare again
async function hubCheck(tag, whole) {
  for (const tab of ['shop', 'my']) {
    const h = await ev(HUB(tab));
    ok(h.open && h.tab === tab && h.sw <= h.cw + 1 && h.out === 0 && h.beside, `${tag}: the hub's ${tab === 'shop' ? '상점' : '마이페이지'} tab - nothing sideways${tab === 'shop' ? ', 사기 beside the preview' : ''}`, h);
    if (whole) ok(h.sh <= h.ch + 1, `${tag}: ... the ${tab === 'shop' ? '상점' : '마이페이지'} tab shows whole (no vertical scroll)`, { sh: h.sh, ch: h.ch });
    await sleep(250);
    await shot(`pwa-${tag}-${tab}.png`);
  }
  await ev(HUB_OFF);
}
async function secPhones() {
  // ---------------------------------------------------------------- 6. phones (mobile UA + touch; notch insets where possible)
  const PH = [
    ['844', 844, 390, { left: 47, right: 47, bottom: 21 }],
    ['932', 932, 430, { left: 59, right: 59, bottom: 21 }],
    ['640', 640, 360, { left: 24 }],
  ];
  const hi = (await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('ppogeul-hiscore', '1234560'); } catch (e) { /* ignore */ }" }, pageSid)).result.identifier;
  for (const [tag, w, h, insets] of PH) {
    const insetOk = await emulate(w, h, true, UA_ANDROID, insets);
    await go(APP); await until('!!(window.PG && PG.debug && PG.debug.pwa)');
    await ev(`document.fonts.ready.then(() => 1)`, 8000).catch(() => 0);
    await ev(FAKE_BIP('dismissed'));
    await sleep(300);
    const t = await ev(LAYOUT);
    ok(t.touch && t.scrollW <= t.vw && t.scrollH <= t.vh && t.scrollY === 0, `${tag}: touch layout, the page does not scroll`, { vw: t.vw, vh: t.vh, scrollW: t.scrollW, scrollH: t.scrollH });
    ok(t.land && !t.rotate, `${tag}: the landscape layout, no rotate screen`, { land: t.land, rotate: t.rotate });
    if (tag === '844') {
      // no pull-to-refresh / bounce (overscroll-behavior on the root), no double-tap zoom on what is tapped, the pads
      // take every gesture themselves (headless Chrome has no pull-to-refresh to try: the styles that stop it are checked)
      const ta = await ev(`(() => { const cs = (el) => getComputedStyle(el), $ = (id) => document.getElementById(id);
        return { root: cs(document.documentElement).overscrollBehaviorY, body: cs(document.body).overscrollBehaviorY, app: cs($('pg-app')).touchAction,
          btns: ['pg-start', 'pg-friends-btn', 'pg-install', 'pg-sound', 'pg-fs'].map((id) => cs($(id)).touchAction), pick: cs(document.querySelector('.pg-pick-btn')).touchAction,
          pads: ['pg-stick-zone', 'pg-t-jump', 'pg-t-shoot'].map((id) => cs($(id)).touchAction) }; })()`);
      ok(ta.root === 'none' && ta.body === 'none' && ta.app === 'manipulation' && ta.btns.every((x) => x === 'manipulation') && ta.pick === 'manipulation' && ta.pads.every((x) => x === 'none'),
        '844: no pull-to-refresh / bounce, no double-tap zoom on the buttons, the pads keep every gesture', ta);
      // a real double tap (Chrome's own gesture) on the game screen, on the title card's text and on the joystick zone:
      // the zoom stays 1 - here (the viewport also says user-scalable=no) and on the artifact page (no such meta there:
      // touch-action alone); and the viewport meta itself
      const meta = await ev(`document.querySelector('meta[name="viewport"]').content`);
      ok(/maximum-scale=1/.test(meta) && /user-scalable=no/.test(meta), '844: the viewport says maximum-scale=1, user-scalable=no', meta);
      for (const page of [null, ORIGIN + '/preview.html']) {
        if (page) { await go(page); await until('!!(window.PG && PG.debug && PG.debug.stick)'); await sleep(300); }
        const pts = await ev(`(() => { const c = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height * 0.3)]; };
          return [c('pg-screen'), c('pg-stick-zone'), c('pg-frame')]; })()`);
        const sc = [];
        for (const [x, y] of pts) {
          await send('Input.synthesizeTapGesture', { x, y, tapCount: 2, gestureSourceType: 'touch' }, pageSid);
          await sleep(450);
          sc.push(await ev('window.visualViewport ? visualViewport.scale : 1'));
        }
        ok(sc.every((v) => Math.abs(v - 1) < 0.001), `844: a double tap on the screen / the joystick zone / the frame does not zoom (${page ? 'the artifact page' : 'the deploy'})`, sc);
      }
      await go(APP); await until('!!(window.PG && PG.debug && PG.debug.pwa)');
      await ev(`document.fonts.ready.then(() => 1)`, 8000).catch(() => 0);
      await ev(FAKE_BIP('dismissed'));
      await sleep(300);
    }
    ok(t.cardFits && t.cardInScreen && t.pill && t.pillInCard, `${tag}: the title card fits the screen with the install pill (a 7-digit best score)`, t);
    ok(!t.padsOverScreen && t.padsInside && !t.padsOverlapEachOther, `${tag}: the pads stay off the game screen and inside the viewport`, { scr: t.scr, scale: t.scale });
    ok(t.headInside && t.headButtons === 3 && !t.headOverScreen, `${tag}: the header keeps its 3 buttons inside the viewport, off the game screen`, { head: t.headButtons, over: t.headOverScreen });
    // on its side the screen takes the whole height (before: 844x390 -> 1.52x with the header in the pad columns)
    const minScale = { 844: 1.55, 932: 1.72, 640: 1.45 }[tag];
    ok(t.scale >= minScale, `${tag}: the game screen uses the phone's space (${t.scale}x >= ${minScale}x)`, t.scr);
    ok(t.row && t.row.one && t.row.fits, `${tag}: the title's 혼자 하기 · 친구와 하기 · 상점 share one row inside the card`, t.row);
    await shot(`pwa-${tag}-title.png`);
    await hubCheck(tag, false);
    const p = await ev(PLAY);
    await sleep(200);
    const tp = await ev(LAYOUT);
    ok(p.phase === 'playing' && !tp.padsOverScreen && tp.scrollY === 0 && tp.scrollH <= tp.vh, `${tag}: a round plays with the pads clear of the screen`, { scale: tp.scale, scr: tp.scr });
    await shot(`pwa-${tag}-play.png`);
    if (!insetOk) note(`${tag}: this Chrome cannot emulate safe-area insets`);
    else {
      // the notch: nothing interactive under the insets
      const sa = await ev(`(() => { const r = (id) => { const e = document.getElementById(id); return e && !e.hidden ? e.getBoundingClientRect() : null; };
        const ins = ${JSON.stringify(Object.assign({ top: 0, bottom: 0, left: 0, right: 0 }, insets))};
        const els = ['pg-fs', 'pg-sound', 'pg-pausebtn', 'pg-stick', 'pg-t-jump', 'pg-t-shoot', 'pg-screen'].map((id) => [id, r(id)]).filter((x) => x[1]);
        return els.filter(([, b]) => b.top < ins.top || b.bottom > innerHeight - ins.bottom || b.left < ins.left || b.right > innerWidth - ins.right).map(([id]) => id); })()`);
      ok(sa.length === 0, `${tag}: nothing sits under the notch / home-indicator insets`, sa);
    }
    // a game-over card on the phone (the 목욕 끝 card with its stamp card and the 트로피 row) fits
    await ev(`(() => { const D = PG.debug, G = D.G; D.toTitle(); D.start(4); D.step(120); G.score = 123450; G.lives = 1; D.setInvincible(false);
      const e = G.enemies.find((q) => q.state === 'active'); G.p.invuln = 0; e.x = G.p.x; e.y = G.p.y; D.step(1); D.step(160); return D.getState().phase; })()`);
    const over = await ev(`(() => { const c = document.querySelector('#pg-over:not([hidden]) .pg-card'); return c ? { fits: c.scrollHeight <= c.clientHeight + 1, h: c.clientHeight, sh: c.scrollHeight } : null; })()`);
    ok(over && over.fits, `${tag}: the 목욕 끝 card fits`, over);
    await shot(`pwa-${tag}-over.png`);
    await ev(`(() => { PG.debug.toTitle(); PG.debug.tro.openRec(); return 1; })()`);
    await sleep(200);
    const rec = await ev(`(() => { const c = document.querySelector('#pg-rec:not([hidden]) .pg-card'); const s = document.getElementById('pg-screen').getBoundingClientRect(); const b = c && c.getBoundingClientRect();
      return c ? { fits: c.scrollHeight <= c.clientHeight + 1, inScreen: b.top >= s.top - 1 && b.bottom <= s.bottom + 1 } : null; })()`);
    ok(rec && rec.fits && rec.inScreen, `${tag}: 내 기록 fits`, rec);
    await shot(`pwa-${tag}-rec.png`);
  }
  // (v4 shop) a 568x320 phone (the smallest on its side): the title (with the pill) and its start row, the hub
  await emulate(568, 320, true, UA_ANDROID);
  await go(APP); await until('!!(window.PG && PG.debug && PG.debug.pwa)');
  await ev(`document.fonts.ready.then(() => 1)`, 8000).catch(() => 0);
  await ev(FAKE_BIP('dismissed'));
  await sleep(300);
  const t3 = await ev(LAYOUT);
  ok(t3.cardFits && t3.cardInScreen && t3.row && t3.row.one && t3.row.fits && !t3.padsOverScreen && t3.padsInside, '568x320: the title card fits (with the install pill), 혼자 하기 · 친구와 하기 · 상점 on one row, the pads beside the screen', { fits: t3.cardFits, sh: t3.cardSH, ch: t3.cardCH, row: t3.row, scale: t3.scale });
  await shot('pwa-568-title.png');
  await hubCheck('568', false);
  // upright: a round on its side, then the phone turns upright -> "가로로 돌려 주세요" over everything, the round paused;
  // back on its side -> the screen goes, the pause menu waits for 계속하기. An upright tablet: none of it
  const ROT = `(() => { const r = document.getElementById('pg-rotate'), b = r && !r.hidden ? r.getBoundingClientRect() : null, s = PG.debug.getState();
    return { shown: !!b, covers: !!b && b.left <= 0 && b.top <= 0 && b.right >= innerWidth && b.bottom >= innerHeight, text: r ? r.textContent : '', phase: s.phase,
      top: b ? document.elementFromPoint(innerWidth / 2, innerHeight / 2) === r || r.contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2)) : false,
      pause: !document.getElementById('pg-pause').hidden, land: document.getElementById('pg-app').classList.contains('pg-land'), stick: PG.debug.stick().on }; })()`;
  await emulate(844, 390, true, UA_IPHONE, { left: 47, right: 47, bottom: 21 });
  await go(APP); await until('!!(window.PG && PG.debug && PG.debug.pwa)');
  await ev(`document.fonts.ready.then(() => 1)`, 8000).catch(() => 0);
  const r0 = await ev(`(() => { const D = PG.debug; D.seed(3); D.start(1); D.setInvincible(true); D.step(150); return 1; })()`).then(() => ev(ROT));
  ok(!r0.shown && r0.phase === 'playing', 'on its side: no rotate screen, the round plays', r0);
  await emulate(390, 844, true, UA_IPHONE, { top: 47, bottom: 34 });
  await sleep(500);
  const r1 = await ev(ROT);
  ok(r1.shown && r1.covers && r1.top && /가로로\s*돌려 주세요/.test(r1.text), 'upright (390x844): "가로로 돌려 주세요" covers the whole game', r1);
  ok(r1.phase === 'paused' && !r1.stick.left && !r1.stick.right, '... and the round is paused, the controls let go', r1);
  await shot('pwa-390-rotate.png');
  await emulate(844, 390, true, UA_IPHONE, { left: 47, right: 47, bottom: 21 });
  await sleep(500);
  const r2 = await ev(ROT);
  ok(!r2.shown && r2.land && r2.phase === 'paused' && r2.pause, 'back on its side: the rotate screen goes, the pause menu waits (계속하기)', r2);
  await emulate(768, 1024, true, UA_IPHONE.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS'));
  await go(APP); await until('!!(window.PG && PG.debug && PG.debug.pwa)');
  await sleep(300);
  const tab = await ev(LAYOUT), r3 = await ev(ROT);
  ok(!r3.shown && !tab.land && tab.touch && !tab.padsOverScreen && tab.scale === 2, 'an upright tablet (768x1024): no rotate screen, its upright layout (2x, the pads under the screen)', { rot: r3.shown, land: tab.land, scale: tab.scale });
  await shot('pwa-768-tablet.png');
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hi }, pageSid);
  // a 1x desktop window (the screen at 256x224): the card fits with the pill, and with the longer iOS hint
  for (const [tag, ua] of [['1x', null], ['1x-ios', UA_IPHONE.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS')]]) {
    await emulate(300, 336, false, ua);
    const nb = ua ? (await send('Page.addScriptToEvaluateOnNewDocument', { source: NO_BIP }, pageSid)).result.identifier : null;
    await go(APP); await until('!!(window.PG && PG.debug && PG.debug.pwa)');
    await ev(`document.fonts.ready.then(() => 1)`, 8000).catch(() => 0);
    if (!ua) await ev(FAKE_BIP('dismissed'));
    await sleep(300);
    const t = await ev(LAYOUT);
    ok(t.scale <= 1.01 && t.cardFits && t.pill && t.pillInCard, `${tag}: at a 1x screen (${t.scr && t.scr.w}x${t.scr && t.scr.h}) the title card fits with the ${ua ? 'iOS hint' : 'pill'}`, t);
    // (review 2026-10-18: the 상점 label wherever the row has room - measured by game.js, not a width rule; here it fits)
    ok(t.row && t.row.one && t.row.fits, `${tag}: the title's 3 buttons share one row (the 상점 button ${t.row && t.row.label ? 'labelled: it fits' : 'icon-only'})`, t.row);
    await shot(`pwa-${tag}-title.png`);
    if (!ua) await hubCheck(tag, false);
    if (nb) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: nb }, pageSid);
  }
  await emulate(900, 760, false);
}

async function secUpdates() {
  // ---------------------------------------------------------------- 7. updates
  await go(APP); await until('!!navigator.serviceWorker.controller', 8000);
  const cur = `ppodeuk-shell@${APP}@`;
  // a worker whose page is still the old build (a stale CDN edge): its install fails, the working worker stays
  setMode('bad');
  await ev(`window.__mark = 'kept'; navigator.serviceWorker.getRegistration('./').then((r) => r.update()).then(() => 1, () => 1)`);
  await until(`navigator.serviceWorker.getRegistration('./').then((r) => !r.installing && !r.waiting)`, 10000);
  const bad = await ev(`(async () => ({ keys: await caches.keys(), active: (await navigator.serviceWorker.getRegistration('./')).active.scriptURL, mark: window.__mark }))()`);
  ok(bad.keys.includes(cur + INFO.build) && !bad.keys.some((k) => k.endsWith(BAD)) && bad.mark === 'kept', 'a new worker with a stale page fails its install; the old shell cache and worker stay', bad.keys);
  // the next deploy: installs in the background, replaces the shell cache, the open page is not reloaded
  setMode('next');
  await ev(`navigator.serviceWorker.getRegistration('./').then((r) => r.update()).then(() => 1, () => 1)`);
  const nx = await until(`(async () => { const k = await caches.keys(); return k.includes(${JSON.stringify(cur + NEXT)}) && !k.includes(${JSON.stringify(cur + INFO.build)}) ? k : null; })()`, 15000);
  const after = await ev(`(async () => { const c = await caches.open(${JSON.stringify(cur + NEXT)}); const p = await c.match(${JSON.stringify(APP)});
    return { mark: window.__mark, page: p ? (await p.text()).includes('content="${NEXT}"') : false, shown: document.querySelector('meta[name="pg-build"]').content }; })()`);
  ok(nx && after.page, 'the next deploy installs in the background and replaces the old shell cache', nx);
  ok(after.mark === 'kept' && after.shown === INFO.build, 'the open page is not reloaded (a game in progress keeps going)', after);
  ok(await go(APP) !== null && await until(`document.querySelector('meta[name="pg-build"]').content === '${NEXT}'`, 5000), 'the next start shows the new page');
  setMode('up');
}
