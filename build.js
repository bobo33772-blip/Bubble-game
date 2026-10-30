// Assembles bogeul/src/* into:
//   dist/ppogeul-bath.html        the artifact page (publish with capabilities {room: {}, user: {scopes: ["profile"]}});
//                                 no external scripts at all (PeerJS never goes in here)
//   deploy/index.html             a STANDALONE page for static hosting: doctype, <html lang="ko" class="pg-sa">, head
//                                 with charset, viewport, title, description, og tags, an inline SVG favicon and PeerJS
//                                 pinned to an exact version (window.Peer for PG.Net's 'peer' transport) + the same body;
//                                 installable as an app: the manifest / apple-touch-icon / iOS metas, the build hash
//                                 (<meta name="pg-build">) and the service worker's registration (http(s), unframed)
//   deploy/manifest.webmanifest   the web app manifest (name, icons, colours, display) - made here from the constants
//   deploy/sw.js                  src/pwa/sw.js with this build's hash, app shell and CDN list filled in
//   deploy/icons/*.png            copied from src/pwa/icons (drawn from the game's pixel art by tools/make-icons.js)
//   C:/Temp/bogeul/deploy/        a copy of those files for tools/pwa-check.js (served over http: no workers on file://)
//   C:/Temp/bogeul/preview.html   a local preview mimicking the artifact skeleton (headless Chrome)
//   C:/Temp/bogeul/test-<name>.html for every src/tests/<name>.js driver (page + driver)
//   deploy/ppodeuk-bath-itch.zip  the itch.io upload: every deploy file, index.html at the root (tools/pack-itch.js)
// Cloud trophies (design/cloud-trophies.md, FIREBASE-SETUP.md): with bogeul/firebase.config.json (optional) the deploy
// page also gets window.PG_CLOUD - the Firebase config, the pinned SDK files with their integrity hashes - and its
// service worker may keep those files; without it the deploy is exactly as before. The artifact never gets any of it
// (checked: not even the word). Always written for the tests (C:/Temp only, never deploy/):
//   C:/Temp/bogeul/deploy-cloud/  the deploy page with a made-up config (src/tests/cloud.js fakes the SDK in its frames)
//   C:/Temp/bogeul/deploy-nocfg/  the deploy page without one
//   C:/Temp/bogeul/deploy-relay/  the deploy page with a made-up relay URL (tools/run-all.js rewrites it for ws-deploy)
// and bogeul/.firebaserc gets the projectId while it still says YOUR-PROJECT-ID.
// The online relay (CLOUDFLARE-SETUP.md, design/relay.md): PG_RELAY_URL=<the relay Worker's URL> or bogeul/relay.config.json
// gives the deploy page window.PG_RELAY = {url} (net.js's 'ws' transport); PG_RELAY_URL=none leaves it out.
// Usage: node bogeul/build.js   (tools only: PG_FIREBASE_CONFIG=<file> reads another config file and leaves .firebaserc
// alone; PG_BUILD_TEMP=<dir> writes the C:/Temp/bogeul outputs there - tools/check-cloud.js builds a copy that way)
// PG_PREVIEW=<PR number> (CI: .github/workflows/pr.yml, a Firebase Hosting preview channel): deploy/ becomes a PREVIEW of
// the standalone page - a "미리보기 #n" badge, its own save slot (every localStorage key + "@pr<n>": it never reads,
// migrates or overwrites the real records), no manifest link and no service worker (nothing installs), no Firebase
// config, noindex; only index.html + the icons, no itch zip. dist/ and the C:/Temp outputs are the same as without it
// 앱인토스 (design/toss.md 2): node build.js --toss (or PG_TOSS=1; toss/'s `npm run pg`) writes the Toss variant of the
// deploy page into the Vite project toss/ - toss/index.html (no service worker, manifest, CDNs, Firebase or Google
// sign-in; one module entry, /src/main.js, which bundles the SDK, PeerJS and the fonts and boots src/ait.js) and the
// five engine files as toss/public/pg/*.js (game.js without its <ait-cut> regions) - and NOTHING outside toss/ and the
// C:/Temp outputs: no dist/, no deploy/ (nor its C:/Temp copy), no itch zip, no .firebaserc (it never reads
// firebase.config.json, so a deploy written by it would lack the cloud). Every build, with or without the flag, also
// writes for the tests: C:/Temp/bogeul/toss/ (the same index.html + pg/*.js), toss-fx/ (that page booting src/ait.js
// over the fake SDK: tests/toss-net.js's frames), ait.js, toss-fake.js, test-toss.html (+ toss-test-driver.js)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const TMP = process.env.PG_BUILD_TEMP || 'C:/Temp/bogeul';
const PREVIEW = process.env.PG_PREVIEW || '';
if (PREVIEW && !/^[1-9]\d{0,6}$/.test(PREVIEW)) throw new Error('PG_PREVIEW must be a PR number, not ' + JSON.stringify(PREVIEW));
// (a flag as well as the variable: PowerShell has no `VAR=x cmd`)
const TOSS = process.argv.includes('--toss') || process.env.PG_TOSS === '1';
if (TOSS && PREVIEW) throw new Error('--toss and PG_PREVIEW do not mix');
const tossRules = require('./tools/toss-rules');
const src = path.join(root, 'src');
const ORDER = ['sprites.js', 'levels.js', 'audio.js', 'net.js', 'game.js'];
const PEERJS = 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js';
// Subresource Integrity for exactly that file (the sha512 cdnjs publishes for peerjs 1.5.4 / peerjs.min.js): a changed
// CDN file is refused by the browser instead of running with access to the game and its data connections
const PEERJS_SRI = 'sha512-iFU+yF1keEaLDC9HEwPfLMSRaS0unBHE14GEgx6pQKJXjp5v0tvX8xpfp2lgJ62XEjbYp/M5C3CAmej/PWXMyA==';
const DESCRIPTION = '비누 거품으로 때 몬스터를 쏙 가두는 목욕탕 아케이드! 귀여운 동물 친구들과 온라인으로 같이 하거나 배틀해요.';
// the installed app: its home-screen name (short: fits under an icon), the page's --bg as splash / status bar colour
const SHORT_NAME = '뽀득목욕탕';
const BG = '#0a2327';
// the app icons (tools/make-icons.js draws them; here they are only copied): [file, size, manifest purpose | null]
const ICONS = [['icon-192.png', 192, 'any'], ['icon-512.png', 512, 'any'], ['icon-maskable-512.png', 512, 'maskable'], ['apple-touch-icon-180.png', 180, null]];
// the artifact runtime's own skeleton reset (preview.html and the standalone page carry the same one)
const RESET = ':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}';
// favicon: the rubber duck in a soap bubble
const FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<circle cx="32" cy="32" r="29" fill="#aef3ff" fill-opacity=".3" stroke="#aef3ff" stroke-width="3"/>' +
  '<ellipse cx="29" cy="42" rx="17" ry="10" fill="#ffd23c" stroke="#1c1530" stroke-width="2.5"/>' +
  '<circle cx="37" cy="26" r="10" fill="#ffd23c" stroke="#1c1530" stroke-width="2.5"/>' +
  '<path d="M46 26l9 2.5-9 3.5z" fill="#ff8c1e" stroke="#1c1530" stroke-width="2" stroke-linejoin="round"/>' +
  '<circle cx="40" cy="24" r="2" fill="#1c1530"/><circle cx="20" cy="17" r="4" fill="#ffffff" fill-opacity=".85"/></svg>';

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const page = fs.readFileSync(path.join(src, 'page.html'), 'utf8');
if (!page.includes('<!--SCRIPTS-->')) throw new Error('src/page.html must contain <!--SCRIPTS-->');

const scripts = ORDER.map((f) => {
  const code = fs.readFileSync(path.join(src, f), 'utf8');
  if (/<\/script/i.test(code)) throw new Error(`${f} contains a literal "</script" - split the string`);
  return `<script>\n/* ---- ${f} ---- */\n${code}\n</script>`;
}).join('\n');

const out = page.replace('<!--SCRIPTS-->', () => scripts);
// the artifact page loads nothing from outside but Google Fonts stylesheets (and so never PeerJS)
if (/<script\b[^>]*\bsrc\s*=/i.test(out)) throw new Error('the artifact page must not load external scripts');
// ... and is no installable app: no manifest, no service worker, none of the deploy's app metas (those are added to the
// deploy page below; game.js only looks for a manifest link, so its install UI stays off in the artifact)
if (/<link\b[^>]*\brel=["']?manifest|serviceWorker\s*\.\s*register|<meta\s+name=["']?(?:pg-build|apple-mobile-web-app|mobile-web-app)|class=["']?pg-sa/i.test(out)) throw new Error('the artifact page must have no manifest / service worker / app metas');
// ... and has nothing of the cloud trophies but their hidden markup and inert code: no SDK, no config, no sign-in path -
// not even the word (game.js only reads the deploy page's window.PG_CLOUD and names no SDK, host or URL itself)
if (/firebase|PG_CLOUD\s*=|\/__\/auth/i.test(out)) throw new Error('the artifact page must not contain anything of Firebase (game.js / page.html must not name it; the SDK lives in build.js)');
// ... and nothing of the 앱인토스 build: page.html's .pg-ait CSS and game.js's window.PG_AIT reads are in every build,
// so the check is structural - no pg-ait class on <html>, no PG_AIT assignment, no SDK name, no ait.js script
const NO_TOSS = [/<html\b[^>]*\bpg-ait\b/i, /PG_AIT\s*=(?!=)/, /@apps-in-toss/, /<script\b[^>]*\bsrc\s*=\s*["']?[^"'\s>]*ait\.js\b/i];
const tossIn = (html) => NO_TOSS.find((re) => re.test(html));
if (tossIn(out)) throw new Error('the artifact page must have nothing of the 앱인토스 build: ' + tossIn(out));
if (!TOSS) {
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'ppogeul-bath.html'), out);
}

// ---- standalone deploy page: page.html opens with head-type elements (title, links, metas, styles); they move
// into <head>, the rest is the body.
function splitHead(html) {
  const re = /^\s*(?:<title>[\s\S]*?<\/title>|<link\b[^>]*>|<meta\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->)/i;
  let rest = html, head = '';
  for (let m = rest.match(re); m; m = rest.match(re)) { head += m[0]; rest = rest.slice(m[0].length); }
  return { head, body: rest };
}
const titleText = ((out.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
if (!titleText) throw new Error('src/page.html must start with a <title>');
const parts = splitHead(out);
const headRest = parts.head.replace(/\s*<title>[\s\S]*?<\/title>\s*/i, '\n').trim();
// ---- the app: manifest, icons, the service worker. Everything below is the deploy build's alone - the artifact page
// above was written already and is checked for none of it after.
const pwaDir = path.join(src, 'pwa');
const icons = ICONS.map(([file, size, purpose]) => {
  const buf = fs.readFileSync(path.join(pwaDir, 'icons', file));
  // (a PNG: the signature, then IHDR's width / height - they must be what the manifest says)
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(16) !== size || buf.readUInt32BE(20) !== size) throw new Error(`src/pwa/icons/${file} is not a ${size}x${size} PNG (node tools/make-icons.js)`);
  return { file, size, purpose, buf, src: 'icons/' + file };
});
const appleIcon = icons.find((i) => i.file.startsWith('apple-touch-icon'));
// display: fullscreen where the platform has it (Android: no status / navigation bar - landscape gains ~24px of
// canvas height, and an edge swipe first reveals the bars instead of leaving the game mid-run), else standalone
// (iOS has no fullscreen mode, desktop shows a window). orientation landscape: the installed app opens on its side like a
// game (Android honours it; iPhone ignores it - the page asks with its "가로로 돌려 주세요" screen). launch_handler: reopening the app focuses the open game (desktop)
const manifest = {
  id: './', name: titleText, short_name: SHORT_NAME, description: DESCRIPTION, lang: 'ko', dir: 'ltr',
  start_url: './', scope: './', display: 'standalone', display_override: ['fullscreen', 'standalone'], orientation: 'landscape',
  background_color: BG, theme_color: BG, categories: ['games'], launch_handler: { client_mode: ['focus-existing', 'auto'] },
  icons: icons.filter((i) => i.purpose).map((i) => ({ src: i.src, sizes: `${i.size}x${i.size}`, type: 'image/png', purpose: i.purpose })),
};
const manifestText = JSON.stringify(manifest, null, 2) + '\n';

// ---- cloud trophies (design/cloud-trophies.md 2-3): Google sign-in + Firestore keep the trophies in the player's own
// cloud document. The deploy only, and only with bogeul/firebase.config.json: its page then defines window.PG_CLOUD
// (frozen, before the worker registration and any game script) = { v: the SDK version, ns: the SDK's global name, cfg,
// home, shared: SHARED_HOSTS, sdk: [[url, integrity, fallback url] x app / auth / firestore] } (+ away: 1 in the itch zip). game.js loads those files itself (lazily, as
// SRI-checked classic scripts) and names none of this, so the artifact page above holds nothing of it
const FIREBASE_V = '12.19.0';
// [file, sha512] - computed from the downloaded files (cdnjs and jsDelivr serve the npm package's bytes); a changed CDN
// file is refused by the browser instead of running with the player's sign-in
const FIREBASE_SDK = [
  ['firebase-app-compat.js', 'sha512-4vhrvql0JRsm7uZqS5fzHvGi7gVUiqTRe0y/kyhsCYkyB7mEWZZBIkBlzW0+LA6wGFRCsxZhGl1IZNP0b852WA=='],
  ['firebase-auth-compat.js', 'sha512-ahLV4v/pGu9QcmfbZjdmF00a3HVnWcH9tj/werwQldaqKqyya8QPYONrLoRfPT3BwB1YKEQf+B/1EYGeglNZvA=='],
  ['firebase-firestore-compat.js', 'sha512-2rayVeU5Z9oK9tn52ES1cAy5D+fxeLoij13emADsCngw0JDl49VOiyG3JLJqUrRWwMoEHOtMpWJqTfjLLNOePw=='],
];
const fbUrl = (f) => `https://cdnjs.cloudflare.com/ajax/libs/firebase/${FIREBASE_V}/${f}`;
const fbAlt = (f) => `https://cdn.jsdelivr.net/npm/firebase@${FIREBASE_V}/${f}`;
// the config (tools/fb-config.js: lenient - the console's snippet pasted as it is works too - and checked: a bad file
// stops the build with a message in Korean and English). PG_FIREBASE_CONFIG=<file> reads another file (tools only)
const { fbCheck, readFirebaseConfig } = require('./tools/fb-config');
const fbConf = PREVIEW || TOSS ? null : readFirebaseConfig(process.env.PG_FIREBASE_CONFIG || path.join(root, 'firebase.config.json'));
// relay servers for online play (optional bogeul/turn.config.json, never committed: CI writes it from the repo secret
// TURN_CONFIG). Two devices that cannot reach each other directly (phone data, different home networks) connect through a
// TURN server; PeerJS's own free relays did not answer (2026-10-21). The file is the provider's ICE server list as given
// ([{urls, username, credential}, ...] or {iceServers: [...]}); every entry is checked. The deploy page (previews and the
// itch zip too) then sets window.PG_PEER_OPTIONS, which game.js hands to PeerJS; the artifact never has it
const ICE_RE = /^(stun|turn|turns):[^\s"'<>\\]{1,200}$/;
// the provider's snippet as pasted (Metered's "Show ICE Servers Array" is JavaScript, not JSON: `iceServers: [ { urls:
// "stun:...", }, ... ]` - bare keys, trailing commas, maybe single quotes): from its first '[' (or '{') to the matching
// last bracket, rewritten token by token into JSON - strings copied (single quotes turned double), bare identifiers before
// ':' quoted, commas before '}' / ']' dropped - then JSON.parse. Nothing is ever evaluated
function iceParse(txt) {
  txt = String(txt).replace(/^\uFEFF/, '');
  const a = txt.indexOf('['), b = txt.indexOf('{'), st = a >= 0 && (b < 0 || a < b) ? a : b;
  const en = Math.max(txt.lastIndexOf(']'), txt.lastIndexOf('}'));
  if (st < 0 || en <= st) throw new Error('no list');
  const src = txt.slice(st, en + 1);
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {                                  // a string: copied, as a JSON string
      let j = i + 1, v = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') { v += src[j] + src[j + 1]; j += 2; continue; } v += src[j++]; }
      if (j >= src.length) throw new Error('open string');
      out += JSON.stringify(c === '"' ? JSON.parse('"' + v + '"') : v.replace(/\\'/g, "'"));
      i = j + 1;
    } else if (/[A-Za-z_$]/.test(c)) {                               // a bare word: a key (quoted) or true / false / null
      let j = i; while (j < src.length && /[\w$]/.test(src[j])) j++;
      const w = src.slice(i, j); let k = j; while (k < src.length && /\s/.test(src[k])) k++;
      out += src[k] === ':' ? JSON.stringify(w) : w;
      i = j;
    } else if (c === ',') {                                          // a comma before a closing bracket: dropped
      let k = i + 1; while (k < src.length && /\s/.test(src[k])) k++;
      if (src[k] !== '}' && src[k] !== ']') out += c;
      i++;
    } else if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; }   // a // comment
    else { out += c; i++; }
  }
  return JSON.parse(out);
}
function readTurnConfig(file) {
  if (!fs.existsSync(file)) return null;
  let o; try { o = iceParse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error('turn.config.json: 목록을 읽을 수 없어요 / cannot be parsed'); }
  const list = Array.isArray(o) ? o : o && Array.isArray(o.iceServers) ? o.iceServers : null;
  if (!list || !list.length || list.length > 12) throw new Error('turn.config.json: ICE 서버 목록(1~12개)이 필요해요 / needs 1-12 ICE servers');
  const out = list.map((x, i) => {
    const urls = x && typeof x.urls === 'string' ? [x.urls] : x && Array.isArray(x.urls) ? x.urls : null;
    if (!urls || !urls.length || urls.length > 8 || !urls.every((u) => typeof u === 'string' && ICE_RE.test(u))) throw new Error('turn.config.json: ' + (i + 1) + '번째 urls가 이상해요 / entry ' + (i + 1) + ': bad urls');
    const e = { urls: urls.length === 1 ? urls[0] : urls };
    for (const k of ['username', 'credential']) if (x[k] !== undefined) { if (typeof x[k] !== 'string' || x[k].length > 256) throw new Error('turn.config.json: ' + (i + 1) + '번째 ' + k + '가 이상해요 / entry ' + (i + 1) + ': bad ' + k); e[k] = x[k]; }
    return e;
  });
  if (!out.some((e) => [].concat(e.urls).some((u) => /^turns?:/.test(u)))) throw new Error('turn.config.json: turn: 주소가 하나도 없어요 / no turn: server in it');
  if (!out.some((e) => [].concat(e.urls).some((u) => /^stun:/.test(u)))) out.unshift({ urls: 'stun:stun.l.google.com:19302' });
  return out;
}
const turnConf = readTurnConfig(process.env.PG_TURN_CONFIG || path.join(root, 'turn.config.json'));
const peerTag = turnConf ? `<script>window.PG_PEER_OPTIONS={config:{iceServers:${JSON.stringify(turnConf).replace(/</g, '\\u003c')}}};</script>\n` : '';
// the relay Worker (cloudflare/, CLOUDFLARE-SETUP.md, design/relay.md): a WebSocket relay, one Durable Object per room
// code, net.js's 'ws' transport. Its base URL - not a secret - from PG_RELAY_URL (CI: the repository variable RELAY_URL)
// or the optional bogeul/relay.config.json ({"url": "https://ppodeuk-relay.<account>.workers.dev"}); PG_RELAY_URL=none:
// no relay whatever the file says (run-all's own build, the CI test job). With one, the deploy page gets ONE line,
// <script id="pg-relay">window.PG_RELAY={url:"..."};</script> (a PR preview adds space:"p", see previewOf; the itch zip
// strips it, tools/pack-itch.js), and game.js's netOrder() tries 'ws' before 'peer'. Without one the deploy page is
// exactly what it was; the artifact never has it
const RELAY_RE = /^(?:https:\/\/[a-z0-9.-]+\.[a-z]{2,}|http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]))(?::\d{1,5})?(?:\/[A-Za-z0-9._~-]+)*$/i;
function readRelayUrl() {
  let u = process.env.PG_RELAY_URL;
  if (u === 'none') return null;
  if (!u) {
    const f = path.join(root, 'relay.config.json');
    if (!fs.existsSync(f)) return null;
    try { u = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')).url; } catch (e) { throw new Error('relay.config.json: 읽을 수 없어요 / cannot be parsed (it should be {"url": "https://..."})'); }
    if (u === '' || u === null || u === undefined) return null;
  }
  u = String(u).trim().replace(/\/+$/, '');
  if (!RELAY_RE.test(u)) throw new Error('중계 서버 주소가 이상해요 / bad relay URL (https://<name>.<account>.workers.dev): ' + JSON.stringify(u.slice(0, 80)));
  return u;
}
const RELAY = readRelayUrl();
const relayTag = (u) => (u ? `<script id="pg-relay">window.PG_RELAY={url:${JSON.stringify(u).replace(/</g, '\\u003c')}};</script>\n` : '');
// (the tag as previewOf / pack-itch / the checks find it)
const RELAY_TAG_RE = /<script id="pg-relay">window\.PG_RELAY=\{url:"[^"<]*"(?:,space:"[wpt]")?\};<\/script>\n/g;
// hosts that serve many people's pages from one origin (itch.io's games, its old CDN, Newgrounds' uploads): a page there
// - or in any frame - never signs in, since every page of that origin could read the stored session (game.js clHere;
// the itch zip is also marked `away` by tools/pack-itch.js). Never add these to Firebase's authorized domains
const SHARED_HOSTS = ['itch.zone', 'itch.io', 'hwcdn.net', 'ungrounded.net'];
const fbData = (c) => c && { v: FIREBASE_V, ns: 'firebase', cfg: c.cfg, home: c.home, shared: SHARED_HOSTS, sdk: FIREBASE_SDK.map(([f, sri]) => [fbUrl(f), sri, fbAlt(f)]) };
// a first visit to <id>.web.app goes on to <id>.firebaseapp.com (the authDomain: redirect sign-in works in every browser
// there, the installed app included); not in a frame, not for a browser that already keeps trophies on web.app
const FB_HOP = "(function(c){try{var p=c.cfg.projectId,a=c.cfg.authDomain;if(location.hostname===p+'.web.app'&&a===p+'.firebaseapp.com'" +
  "&&window.top===window.self&&localStorage.getItem('ppogeul-trophy')===null)location.replace('https://'+a+location.pathname+location.search+location.hash);}catch(e){}})(window.PG_CLOUD);";
const fbTag = (d) => (d ? `<script>window.PG_CLOUD=Object.freeze(${JSON.stringify(d).replace(/</g, '\\u003c')});${FB_HOP}</script>\n` : '');

// the app shell the worker precaches ('./' = this page) and the CDN scripts it may keep (exact, SRI-pinned URLs; the
// Firebase SDK files - both CDNs - only with a config: then a linked player's next start loads them from the cache)
const SHELL = ['./', 'manifest.webmanifest', ...icons.map((i) => i.src)];
const CDN = [PEERJS, ...(fbConf ? FIREBASE_SDK.flatMap(([f]) => [fbUrl(f), fbAlt(f)]) : [])];
// registration: after load (the first visit's own downloads go first), http(s) only (file:// has no workers), never
// in a frame (itch.io's iframe: no install there, nothing worth keeping offline); failures stay silent - the game
// works the same without it. A first visit fetched the web fonts and PeerJS before any worker existed: once the new
// worker controls the page they are asked for once more (the HTTP cache answers) through it, so it keeps them and the
// very next start works offline with the game's lettering. PeerJS (and the Firebase SDK files a linked page has loaded
// by then): each with its integrity hash, as the page loads it. The fonts: the stylesheet, then each font slice this
// page has loaded - the k-th face of a family in document.fonts is the k-th @font-face of that family in the stylesheet
// (Chrome lists no Resource Timing entries for these font loads)
const SW_REG = String.raw`(function(){try{var sw=navigator.serviceWorker;if(!sw||!/^https?:$/.test(location.protocol)||window.top!==window.self)return;
var no=function(){};
if(!sw.controller)sw.addEventListener('controllerchange',function(){try{
document.querySelectorAll('script[src][integrity]').forEach(function(s){fetch(s.src,{integrity:s.integrity,mode:'cors',credentials:'omit',referrerPolicy:'no-referrer'}).catch(no);});
var l=document.getElementById('pg-fontcss');if(l&&document.fonts)fetch(l.href,{mode:'cors'}).then(function(r){return r.text();}).then(function(css){
var by={},re=/@font-face\s*{([^}]*)}/g,m,k={};while((m=re.exec(css))){var f=/font-family:\s*['"]?([^;'"]+)/.exec(m[1]),u=/url\(\s*['"]?([^)'"]+)/.exec(m[1]);if(f&&u)(by[f[1]]=by[f[1]]||[]).push(u[1]);}
document.fonts.forEach(function(ff){var n=ff.family.replace(/['"]/g,''),i=k[n]=(k[n]||0)+1,u=by[n]&&by[n][i-1];if(ff.status==='loaded'&&/^https:\/\/fonts\.gstatic\.com\//.test(u||''))fetch(u,{mode:'cors'}).catch(no);});}).catch(no);
}catch(e){}},{once:true});
addEventListener('load',function(){sw.register('sw.js',{scope:'./'}).catch(no);});}catch(e){}})();`;

// fb: the cloud config (null: none - the page has no PG_CLOUD at all); extra: more head markup (the test fixture's hook);
// relay: the relay Worker's URL (null: none; the test fixtures name theirs)
const deployOf = (build, fb, extra, relay) => `<!doctype html>
<html lang="ko" class="pg-sa">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>${titleText}</title>
<meta name="description" content="${attr(DESCRIPTION)}">
<meta name="theme-color" content="${BG}">
<meta name="pg-build" content="${build}">
${fbTag(fbData(fb))}${extra || ''}<link rel="manifest" href="manifest.webmanifest">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${attr(SHORT_NAME)}">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta property="og:type" content="website">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${attr(titleText)}">
<meta property="og:description" content="${attr(DESCRIPTION)}">
<meta name="twitter:card" content="summary">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}">
<link rel="apple-touch-icon" sizes="${appleIcon.size}x${appleIcon.size}" href="${appleIcon.src}">
${peerTag}${relayTag(relay)}<script defer src="${PEERJS}" integrity="${PEERJS_SRI}" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script>${SW_REG}</script>
<style>${RESET}</style>
${headRest}
</head>
<body>
${parts.body.trim()}
</body>
</html>
`;
const swSrc = fs.readFileSync(path.join(pwaDir, 'sw.js'), 'utf8');
const swOf = (build) => swSrc.replace("'__PG_BUILD__'", () => JSON.stringify(build)).replace('__PG_SHELL__', () => JSON.stringify(SHELL)).replace('__PG_CDN__', () => JSON.stringify(CDN));
// every file of the deploy, made for a build id. Anything new the deploy needs goes in this list (and into SHELL when
// it must work offline): then it is part of the build hash, written, copied for the tests and zipped for itch.io
const deployFilesOf = (build) => [['index.html', deployOf(build, fbConf, '', RELAY)], ['manifest.webmanifest', manifestText], ['sw.js', swOf(build)], ...icons.map((i) => [i.src, i.buf])];
// the build hash: every byte of every file (made with a placeholder id) - any change makes a new worker, so installed
// apps take the new deploy on their next online start
const hash = crypto.createHash('sha256');
for (const [f, data] of deployFilesOf('-')) hash.update(f + '\0').update(data).update('\0');
const BUILD = hash.digest('hex').slice(0, 12);
const deployFiles = deployFilesOf(BUILD);
const deploy = deployFiles[0][1], sw = deployFiles[2][1];
if (/__PG_[A-Z]+__/.test(sw)) throw new Error('src/pwa/sw.js: a placeholder was not filled in');
for (const p of SHELL) if (p !== './' && !deployFiles.some(([f]) => f === p)) throw new Error(`the app shell lists ${p}, which the deploy does not have`);
if ((deploy.match(/<script\b[^>]*\bsrc\s*=/gi) || []).length !== 1 || !deploy.includes(PEERJS)) throw new Error('deploy page must load exactly the pinned PeerJS');
if (!deploy.includes(`integrity="${PEERJS_SRI}"`)) throw new Error('the PeerJS tag must carry its integrity hash');
if (!deploy.includes(`<meta name="pg-build" content="${BUILD}">`)) throw new Error('the deploy page must carry its build hash (sw.js checks it)');
// the cloud config: with firebase.config.json exactly one PG_CLOUD, every SDK URL and integrity hash (still one static
// script: game.js loads the SDK itself, only when needed) and the worker lists the files; without it not a trace
const cloudTags = (deploy.match(/window\.PG_CLOUD=/g) || []).length;
if (fbConf ? cloudTags !== 1 || !FIREBASE_SDK.every(([f, sri]) => deploy.includes(sri) && deploy.includes(fbUrl(f)) && deploy.includes(fbAlt(f)))
  : cloudTags !== 0 || /firebase/i.test(deploy)) throw new Error('the deploy page must carry the cloud config exactly when firebase.config.json exists');
if (fbConf ? !FIREBASE_SDK.every(([f]) => sw.includes(JSON.stringify(fbUrl(f))) && sw.includes(JSON.stringify(fbAlt(f)))) : /firebase-[a-z]+-compat\.js/.test(sw)) throw new Error('sw.js must list the SDK files exactly when firebase.config.json exists');
if (tossIn(deploy)) throw new Error('the deploy page must have nothing of the 앱인토스 build: ' + tossIn(deploy));
// the relay: one window.PG_RELAY line exactly when the build has a relay URL (none: not a trace); never in the artifact
// (net.js / game.js are inlined there with their comments: they only READ window.PG_RELAY and name no Worker host)
if ((deploy.match(/<script id="pg-relay">/g) || []).length !== (RELAY ? 1 : 0) || (deploy.match(RELAY_TAG_RE) || []).length !== (RELAY ? 1 : 0) ||
  (!RELAY && /PG_RELAY\s*=/.test(deploy))) throw new Error('the deploy page must carry window.PG_RELAY exactly when a relay URL is set');
if (/PG_RELAY\s*=|pg-relay|workers\.dev/.test(out) || (RELAY && out.includes(RELAY))) throw new Error('the artifact page must not contain the relay (net.js only reads window.PG_RELAY)');
// ---- the PR preview (PG_PREVIEW, see the top): the deploy page above, changed only here
// (n: the PR number; the test fixture deploy-preview/ below is built with a made-up one)
const PV_KEY = (n) => '@pr' + n;
// (in the head before every other script: Storage's getItem / setItem / removeItem add the suffix; a 'storage' event
// from another tab reaches the game with the suffix taken off - and one for a real record not at all. PG_PREVIEW: the
// game shows its login screen with the Google button off - design/cloud-trophies.md "As built (login screen)")
const PV_STORE = (n) => `<script>window.PG_PREVIEW=${JSON.stringify(String(n))};(function(){try{var S=Storage.prototype,X=${JSON.stringify(PV_KEY(n))},g=S.getItem,s=S.setItem,r=S.removeItem,mine=new WeakSet();` +
  'S.getItem=function(k){return g.call(this,k+X);};S.setItem=function(k,v){return s.call(this,k+X,v);};S.removeItem=function(k){return r.call(this,k+X);};' +
  "addEventListener('storage',function(e){if(mine.has(e))return;e.stopImmediatePropagation();var k=e.key;if(typeof k!=='string'||k.slice(-X.length)!==X)return;" +
  "var n=new StorageEvent('storage',{key:k.slice(0,-X.length),oldValue:e.oldValue,newValue:e.newValue,url:e.url,storageArea:e.storageArea});mine.add(n);dispatchEvent(n);},true);}catch(e){}})();</script>\n";
const PV_BADGE = (n) => `<div id="pg-preview-badge" style="position:fixed;left:6px;bottom:calc(6px + env(safe-area-inset-bottom,0px));z-index:2147483647;pointer-events:none;padding:2px 8px;border-radius:9px;background:rgba(214,40,90,.9);color:#fff;font:700 12px/1.5 system-ui,sans-serif">미리보기 #${n}</div>\n`;
function previewOf(html, n) {
  n = n || PREVIEW;
  const swap = (h, from, to) => { if (!h.includes(from)) throw new Error('preview build: the deploy page lacks ' + from.slice(0, 50)); return h.replace(from, () => to); };
  let p = swap(html, `<title>${titleText}</title>\n`, `${PV_STORE(n)}<title>미리보기 #${n} · ${titleText}</title>\n<meta name="robots" content="noindex">\n`);
  p = swap(p, '<link rel="manifest" href="manifest.webmanifest">\n', '');
  p = swap(p, `<script>${SW_REG}</script>\n`, '');
  p = swap(p, '\n</body>\n</html>\n', `\n${PV_BADGE(n)}</body>\n</html>\n`);
  // (a relay: the preview's rooms live in the relay's space 'p' - never the live game's rooms; the Worker lets only the
  // preview origins in there. No relay: nothing to change)
  const rl = (p.match(RELAY_TAG_RE) || []).length;
  if (rl) p = p.replace(/(<script id="pg-relay">window\.PG_RELAY=\{url:"[^"<]*")\};/, '$1,space:"p"};');
  if (rl > 1 || (p.match(/<script id="pg-relay">window\.PG_RELAY=\{url:"[^"<]*",space:"p"\};<\/script>/g) || []).length !== rl) throw new Error('preview build: the relay tag must name the space p');
  if (/<link\b[^>]*\brel=["']?manifest|serviceWorker\s*\.\s*register|PG_CLOUD\s*=|firebase/i.test(p)) throw new Error('preview build: manifest / service worker / Firebase left in the page');
  return p;
}
const outFiles = PREVIEW ? [['index.html', previewOf(deploy)], ...icons.map((i) => [i.src, i.buf])] : deployFiles;
if (PREVIEW) fs.rmSync(path.join(root, 'deploy'), { recursive: true, force: true });   // (no manifest, sw.js or zip left from before)
// written into deploy/ and copied for the http tests (tools/pwa-check.js serves C:/Temp/bogeul/deploy/ - workers
// need http, not file://; a preview is not copied). (--toss: neither - its deploy page in memory has no cloud config)
for (const dir of TOSS ? [] : PREVIEW ? [path.join(root, 'deploy')] : [path.join(root, 'deploy'), path.join(TMP, 'deploy')]) {
  for (const [f, data] of outFiles) { const p = path.join(dir, ...f.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); }
}

// ---- 앱인토스 (design/toss.md 2.1): the deploy page's parts again, without everything a Toss mini-app may not have
// (the head's preconnects and Google Fonts link - the fonts come from npm -, the CSS comments: two of them describe the
// Google button). The page skeleton's top / bottom insets read the Toss Safe Area (page.html's --sa-* variables)
const RESET_SA = RESET.replace('env(safe-area-inset-top,0px)', 'var(--sa-t)').replace('env(safe-area-inset-bottom,0px)', 'var(--sa-b)');
if (RESET_SA === RESET || /env\(/.test(RESET_SA)) throw new Error('toss build: RESET lost its env() insets - update RESET_SA');
const tswap = (h, from, to, what) => { if (!h.includes(from)) throw new Error('toss build: ' + what + ' lacks ' + from.slice(0, 60)); return h.replace(from, () => to); };
let tossHead = headRest;
for (const l of ['<link rel="preconnect" href="https://fonts.googleapis.com">', '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>']) tossHead = tswap(tossHead, l, '', 'the head');
tossHead = tossHead.replace(/<link id="pg-fontcss"[^>]*>/, '');
if (!/<link id="pg-fontcss"/.test(headRest) || /pg-fontcss/.test(tossHead)) throw new Error('toss build: the head\'s #pg-fontcss link was not removed');
tossHead = tossHead.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (m, a, css) => {
  if (/(["'])[^"'\n]*\/\*[^"'\n]*\1/.test(css)) throw new Error('toss build: a "/*" inside a CSS string - the comment strip would break it');
  return `<style${a}>${css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n[ \t]*(?=\n)/g, '')}</style>`;
}).replace(/^\s+/, '').replace(/\n{2,}/g, '\n');
// the body without the inline engine (the module entry loads the pg/ files) and with the hidden cloud button's label
// empty (game.js writes it only with the cloud on): the Toss DOM names no Google sign-in, not even hidden
const tossBody = tswap(splitHead(page.replace('<!--SCRIPTS-->', '')).body.trim(), '<button id="pg-cloud-btn" class="pg-btn pg-ghost pg-cloud-btn" type="button" hidden>구글로 로그인</button>',
  '<button id="pg-cloud-btn" class="pg-btn pg-ghost pg-cloud-btn" type="button" hidden></button>', 'the body');
const TOSS_ENTRY = '<script type="module" src="/src/main.js"></script>';
const tossOf = (build, entry) => `<!doctype html>
<html lang="ko" class="pg-sa pg-ait">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>${titleText}</title>
<meta name="description" content="${attr(DESCRIPTION)}">
<meta name="pg-build" content="${build}">
${peerTag}<style>${RESET_SA}</style>
${tossHead}
${entry === undefined ? TOSS_ENTRY : entry}
</head>
<body>
${tossBody}
</body>
</html>
`;
// the engine files the Toss page loads (public/pg/: Vite copies them as they are): the text the deploy inlines, game.js
// without its cut regions (design/toss.md 2.2)
const tossPg = ORDER.map((f) => {
  const code = fs.readFileSync(path.join(src, f), 'utf8');
  if (f !== 'game.js') { if (/<\/?ait-cut>/.test(code)) throw new Error(`toss build: ${f} has ait-cut markers (only game.js may)`); return [f, code]; }
  const c = tossRules.aitCut(code, 'src/game.js');
  if (c.n !== tossRules.CUTS) throw new Error(`toss build: src/game.js has ${c.n} ait-cut regions, design/toss.md 2.2 lists ${tossRules.CUTS} - update both`);
  return [f, c.code];
});
const tossHash = crypto.createHash('sha256').update(tossOf('-')).update('\0');
for (const [f, code] of tossPg) tossHash.update(f + '\0').update(code).update('\0');
const TOSS_BUILD = tossHash.digest('hex').slice(0, 12);
const tossPage = tossOf(TOSS_BUILD);
{
  const srcs = tossPage.match(/<script\b[^>]*\bsrc\s*=/gi) || [], mods = tossPage.match(/<script\b[^>]*type="module"[^>]*>/gi) || [];
  if (srcs.length !== 1 || mods.length !== 1 || !tossPage.includes(TOSS_ENTRY)) throw new Error('toss build: the page must load exactly one module script, /src/main.js');
  const bad = [/serviceWorker/, /rel=["']?manifest/i, /PG_CLOUD/, /firebase/i, /fonts\.googleapis/, /fonts\.gstatic/, /cdnjs/, /peerjs\.min\.js/, /location\.replace/, /구글/, /Google/].find((re) => re.test(tossPage));
  if (bad) throw new Error('toss build: the page must not contain ' + bad);
  for (const [f, code] of tossPg) { const h = tossRules.scan(code, false); if (h.length) throw new Error(`toss build: pg/${f} contains ${h[0].name}: ...${h[0].around}...`); }
  if (!peerTag && TOSS) console.warn('WARNING toss: turn.config.json 없음 - 다른 네트워크의 친구와는 연결이 안 될 수 있어요 / no TURN relay in the Toss build');
}
// written: toss/ (--toss only) and the C:/Temp copy (always, byte-equal) the tests read
const putAll = (dir, files) => { for (const [f, data] of files) { const p = path.join(dir, ...f.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); } };
if (TOSS) { putAll(path.join(root, 'toss'), [['index.html', tossPage]]); putAll(path.join(root, 'toss', 'public', 'pg'), tossPg); }
putAll(path.join(TMP, 'toss'), [['index.html', tossPage], ...tossPg.map(([f, c]) => ['pg/' + f, c])]);

// Mimic the artifact skeleton so the local preview behaves like the published page.
const wrap = (body, head) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>${RESET}</style>${head || ''}
</head><body>
${body}
</body></html>`;

const T = TMP;
fs.mkdirSync(T, { recursive: true });
fs.writeFileSync(path.join(T, 'preview.html'), wrap(out));

// cloud trophy fixtures for src/tests/cloud.js (served over http from C:/Temp/bogeul; never in deploy/): the deploy page
// with a made-up config whatever firebase.config.json says (deploy-cloud/), and with none (deploy-nocfg/); the manifest
// and icons beside them, no sw.js (a registration fails silently, as designed; in a test frame none is tried). In a
// frame of the test page, the fixture's hook hands every script tag the test's fake claims (the SDK URLs) to
// window.parent.__pgFake instead of the network: game.js's own loader runs, nothing is downloaded
const FAKE_FB = fbCheck({ apiKey: 'AIza' + 'Test0'.repeat(7), authDomain: 'pg-cloud-test.firebaseapp.com', projectId: 'pg-cloud-test',
  appId: '1:1234567890:web:0123456789abcdef', home: 'https://pg-cloud-test.firebaseapp.com/' }, 'the test fixture');
const FAKE_HOOK = '<script>(function(){var F=null;try{F=window.parent!==window?window.parent.__pgFake:null;}catch(e){F=null;}if(!F)return;' +
  'var ap=Node.prototype.appendChild;Node.prototype.appendChild=function(n){if(n&&n.tagName==="SCRIPT"&&n.src&&F.claims(n.src))return F.script(window,n);return ap.call(this,n);};})();</script>\n';
// (deploy-preview/: a PR preview's page - PG_PREVIEW 999, its own save keys - for the login screen's preview look;
// deploy-relay/: the page with a relay whatever the build says, at a placeholder address tools/run-all.js swaps for its
// local relay's (rrp-ws-frame.html, the ws-deploy job) - every other fixture has none)
const RELAY_TEST = 'http://127.0.0.1:9';
for (const [dir, html] of [['deploy-cloud', deployOf('cloud-test', FAKE_FB, FAKE_HOOK, null)], ['deploy-nocfg', deployOf('nocfg-test', null, '', null)],
  ['deploy-preview', previewOf(deployOf('preview-test', null, '', null), '999')], ['deploy-relay', deployOf('relay-test', null, '', RELAY_TEST)]]) {
  for (const [f, data] of [['index.html', html], ['manifest.webmanifest', manifestText], ...icons.map((i) => [i.src, i.buf])]) {
    const p = path.join(T, dir, ...f.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data);
  }
}
// Firebase Hosting (bogeul/firebase.json): the project id goes into .firebaserc while it still has the placeholder
if (fbConf && !TOSS && !process.env.PG_FIREBASE_CONFIG) {
  const rc = path.join(root, '.firebaserc');
  try { const t = fs.readFileSync(rc, 'utf8'); if (t.includes('YOUR-PROJECT-ID')) fs.writeFileSync(rc, t.replace('YOUR-PROJECT-ID', fbConf.cfg.projectId)); } catch (e) { /* no firebase folder: nothing to fill in */ }
}

// Optional test drivers: every src/tests/*.js becomes C:/Temp/bogeul/test-<name>.html (page + driver).
// Test pages first install a console hook: headless Chrome's virtual-time mode logs every console level as INFO,
// so console.error / console.warn are echoed as "CONSOLE-ERROR ..." / "CONSOLE-WARN ..." log lines that
// tools/run-all.js counts as failures (the page must run with zero console errors).
const HOOK = '<script>(function(){var c=window.console;if(!c||c.__pgHook)return;c.__pgHook=1;' +
  '["error","warn"].forEach(function(k){var f=c[k];c[k]=function(){try{c.log("CONSOLE-"+k.toUpperCase()+" "+Array.prototype.map.call(arguments,function(a){return a&&a.stack?a.stack:String(a);}).join(" "));}catch(e){}return f.apply(c,arguments);};});})();</script>';
const testsDir = path.join(src, 'tests');
if (fs.existsSync(testsDir)) {
  // (toss.js / toss-fake.js: test-toss.html below is their page - the Toss shape over a fake SDK, not the artifact)
  for (const f of fs.readdirSync(testsDir).filter((n) => n.endsWith('.js') && n !== 'toss.js' && n !== 'toss-fake.js')) {
    const drv = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (/<\/script/i.test(drv)) console.warn(`WARNING tests/${f} contains a literal "</script" - its test page will break`);
    fs.writeFileSync(path.join(T, `test-${f.replace(/\.js$/, '')}.html`), wrap(`${out}\n<script>\n${drv}\n</script>`, HOOK));
  }
}
// ---- the 앱인토스 test pages (design/toss.md 15): src/ait.js and the fake SDK beside the C:/Temp copy of the Toss page;
//   test-toss.html  the Toss page shape with the console hook, the fake SDK and src/ait.js inline in its head and a
//                   boot line that loads toss/pg/*.js and then src/tests/toss.js (toss-test-driver.js) - file://, virtual time
//   toss-fx/        the Toss page with its module entry replaced by ../ait.js, ../toss-fake.js and the boot line (the
//                   frames of src/tests/toss-net.js, over http: ?net=bc&k=<the frame's game key>)
const SC = '<' + 'script', SE = '</' + 'script>';
const aitSrc = fs.readFileSync(path.join(src, 'ait.js'), 'utf8');
if (/<\/script/i.test(aitSrc)) throw new Error('src/ait.js contains a literal "</script"');
if (/@apps-in-toss|\bimport\s*[\s{*'"]|\bexport\s/.test(aitSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''))) throw new Error('src/ait.js must stay a plain script (no import / export, no SDK name)');
const fakeFile = path.join(src, 'tests', 'toss-fake.js'), tossDrv = path.join(src, 'tests', 'toss.js');
const pgList = (pre) => JSON.stringify(ORDER.map((f) => pre + f));
fs.writeFileSync(path.join(T, 'ait.js'), aitSrc);
if (fs.existsSync(fakeFile)) {
  const fake = fs.readFileSync(fakeFile, 'utf8');
  fs.writeFileSync(path.join(T, 'toss-fake.js'), fake);
  putAll(path.join(T, 'toss-fx'), [['index.html', tossOf('toss-fx', `${SC} src="../ait.js">${SE}\n${SC} src="../toss-fake.js">${SE}\n${SC}>PGFake.start(${pgList('../toss/pg/')});${SE}`)]]);
  if (fs.existsSync(tossDrv)) {
    fs.writeFileSync(path.join(T, 'toss-test-driver.js'), fs.readFileSync(tossDrv, 'utf8'));
    fs.writeFileSync(path.join(T, 'test-toss.html'), tossOf('toss-test', `${HOOK}\n${SC}>\n${fake}\n${SE}\n${SC}>\n${aitSrc}\n${SE}\n${SC}>PGFake.start(${pgList('toss/pg/').replace(/\]$/, ',"toss-test-driver.js"]')});${SE}`));
  }
}
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(1);
const tossLine = `${TOSS ? 'toss/' : T + '/toss/'}: index.html + pg/*.js (build ${TOSS_BUILD}, TURN: ${peerTag ? 'yes' : 'no'})`;
if (TOSS) { console.log(`built ${tossLine} - nothing else (no dist/, deploy/, itch zip or .firebaserc)`); process.exit(0); }
console.log(`built dist/ppogeul-bath.html (${kb(path.join(root, 'dist', 'ppogeul-bath.html'))} KB), deploy/index.html (${kb(path.join(root, 'deploy', 'index.html'))} KB, build ${BUILD}, ${fbConf ? 'Firebase: ' + fbConf.cfg.projectId : 'no Firebase'}, ${RELAY ? 'relay: ' + RELAY : 'no relay'}; + manifest, sw.js, ${icons.length} icons) and ${T}/preview.html; ${tossLine}`);
// the itch.io upload, always in step with deploy/ (tools/pack-itch.js: index.html at the zip root, the rest beside it)
if (PREVIEW) { console.log(`PREVIEW #${PREVIEW}: deploy/ holds the preview page (save keys +${PV_KEY(PREVIEW)}, no manifest / service worker / Firebase, no itch zip)`); process.exit(0); }
const itch = require('./tools/pack-itch').pack(path.join(root, 'deploy', 'ppodeuk-bath-itch.zip'));
console.log(`packed deploy/ppodeuk-bath-itch.zip (${(itch.size / 1024).toFixed(1)} KB, ${itch.entries.length} files) for itch.io`);
