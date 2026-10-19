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
// and bogeul/firebase/.firebaserc gets the projectId while it still says YOUR-PROJECT-ID.
// Usage: node bogeul/build.js   (tools only: PG_FIREBASE_CONFIG=<file> reads another config file and leaves .firebaserc
// alone; PG_BUILD_TEMP=<dir> writes the C:/Temp/bogeul outputs there - tools/check-cloud.js builds a copy that way)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const TMP = process.env.PG_BUILD_TEMP || 'C:/Temp/bogeul';
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
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'ppogeul-bath.html'), out);

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
// (iOS has no fullscreen mode, desktop shows a window). No orientation: the game lays out portrait and landscape,
// and the player's rotation lock stays theirs. launch_handler: reopening the app focuses the open game (desktop)
const manifest = {
  id: './', name: titleText, short_name: SHORT_NAME, description: DESCRIPTION, lang: 'ko', dir: 'ltr',
  start_url: './', scope: './', display: 'standalone', display_override: ['fullscreen', 'standalone'],
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
const fbConf = readFirebaseConfig(process.env.PG_FIREBASE_CONFIG || path.join(root, 'firebase.config.json'));
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

// fb: the cloud config (null: none - the page has no PG_CLOUD at all); extra: more head markup (the test fixture's hook)
const deployOf = (build, fb, extra) => `<!doctype html>
<html lang="ko" class="pg-sa">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
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
<script defer src="${PEERJS}" integrity="${PEERJS_SRI}" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
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
const deployFilesOf = (build) => [['index.html', deployOf(build, fbConf)], ['manifest.webmanifest', manifestText], ['sw.js', swOf(build)], ...icons.map((i) => [i.src, i.buf])];
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
// written into deploy/ and copied for the http tests (tools/pwa-check.js serves C:/Temp/bogeul/deploy/ - workers
// need http, not file://)
for (const dir of [path.join(root, 'deploy'), path.join(TMP, 'deploy')]) {
  for (const [f, data] of deployFiles) { const p = path.join(dir, ...f.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); }
}

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
for (const [dir, html] of [['deploy-cloud', deployOf('cloud-test', FAKE_FB, FAKE_HOOK)], ['deploy-nocfg', deployOf('nocfg-test', null)]]) {
  for (const [f, data] of [['index.html', html], ['manifest.webmanifest', manifestText], ...icons.map((i) => [i.src, i.buf])]) {
    const p = path.join(T, dir, ...f.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data);
  }
}
// Firebase Hosting (bogeul/firebase/): the project id goes into .firebaserc while it still has the placeholder
if (fbConf && !process.env.PG_FIREBASE_CONFIG) {
  const rc = path.join(root, 'firebase', '.firebaserc');
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
  for (const f of fs.readdirSync(testsDir).filter((n) => n.endsWith('.js'))) {
    const drv = fs.readFileSync(path.join(testsDir, f), 'utf8');
    if (/<\/script/i.test(drv)) console.warn(`WARNING tests/${f} contains a literal "</script" - its test page will break`);
    fs.writeFileSync(path.join(T, `test-${f.replace(/\.js$/, '')}.html`), wrap(`${out}\n<script>\n${drv}\n</script>`, HOOK));
  }
}
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(1);
console.log(`built dist/ppogeul-bath.html (${kb(path.join(root, 'dist', 'ppogeul-bath.html'))} KB), deploy/index.html (${kb(path.join(root, 'deploy', 'index.html'))} KB, build ${BUILD}, ${fbConf ? 'Firebase: ' + fbConf.cfg.projectId : 'no Firebase'}; + manifest, sw.js, ${icons.length} icons) and ${T}/preview.html`);
// the itch.io upload, always in step with deploy/ (tools/pack-itch.js: index.html at the zip root, the rest beside it)
const itch = require('./tools/pack-itch').pack(path.join(root, 'deploy', 'ppodeuk-bath-itch.zip'));
console.log(`packed deploy/ppodeuk-bath-itch.zip (${(itch.size / 1024).toFixed(1)} KB, ${itch.entries.length} files) for itch.io`);
