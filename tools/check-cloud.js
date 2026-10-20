// Static checks of the cloud trophies' build side (design/cloud-trophies.md 3, 13.3). Run `node bogeul/build.js` first.
// Usage: node bogeul/tools/check-cloud.js [--net]
//   files     dist/ppogeul-bath.html (the Claude artifact) has nothing of Firebase - not even the word; deploy/index.html
//             and deploy/sw.js carry the cloud config / the SDK files exactly when bogeul/firebase.config.json exists;
//             the test fixtures (C:/Temp/bogeul/deploy-cloud/, deploy-nocfg/) are what src/tests/cloud.js expects: one
//             window.PG_CLOUD (frozen, before the worker registration and every game script), the three SDK files on
//             both CDNs with these integrity hashes, the web.app hop, still exactly one static <script src> (PeerJS), the
//             shared-host list; the itch zip's page (tools/pack-itch.js itchPage): PG_CLOUD marked away with home, gone
//             without it, the rest byte for byte
//   config    tools/fb-config.js: the lenient reading (a BOM, UTF-16, the console's `const firebaseConfig = {...}`
//             pasted as it is, numbers, unknown fields dropped) and every refusal with its Korean / English message
//   build     build.js on a COPY of the sources (C:/Temp/bogeul/cloud-build; PG_BUILD_TEMP keeps every output there)
//             with a made-up firebase.config.json: the copy's deploy page / sw.js / itch zip carry it, .firebaserc gets
//             the project id, the console line names it, and its dist/ppogeul-bath.html is byte-for-byte the real one
//             (the artifact does not depend on the config); a bad config stops that build with its message
//   --net     (manual, not in run-all) download the three files from cdnjs and jsDelivr and check the integrity hashes
// Prints "CHECK-CLOUD PASS|FAIL ..." and "CHECK-CLOUD OK|FAIL: N passed, M failed"; exit code 1 on any failure.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { T } = require('./env');
let passes = 0, fails = 0;
const ok = (name, cond, info) => { if (cond) passes++; else fails++; console.log(`CHECK-CLOUD ${cond ? 'PASS' : 'FAIL'} ${name}${!cond && info !== undefined ? ' :: ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 400) : ''}`); return !!cond; };
const read = (f) => fs.readFileSync(f, 'utf8');

// the SDK as the design pinned it (independent of build.js: a changed hash there must be a decision, not a typo)
const V = '12.19.0';
const SDK = [
  ['firebase-app-compat.js', 'sha512-4vhrvql0JRsm7uZqS5fzHvGi7gVUiqTRe0y/kyhsCYkyB7mEWZZBIkBlzW0+LA6wGFRCsxZhGl1IZNP0b852WA=='],
  ['firebase-auth-compat.js', 'sha512-ahLV4v/pGu9QcmfbZjdmF00a3HVnWcH9tj/werwQldaqKqyya8QPYONrLoRfPT3BwB1YKEQf+B/1EYGeglNZvA=='],
  ['firebase-firestore-compat.js', 'sha512-2rayVeU5Z9oK9tn52ES1cAy5D+fxeLoij13emADsCngw0JDl49VOiyG3JLJqUrRWwMoEHOtMpWJqTfjLLNOePw=='],
];
const CDNJS = (f) => `https://cdnjs.cloudflare.com/ajax/libs/firebase/${V}/${f}`;
const JSD = (f) => `https://cdn.jsdelivr.net/npm/firebase@${V}/${f}`;
const NONE = /firebase|PG_CLOUD\s*=|\/__\/auth|-compat\.js/i;
// the PG_CLOUD object of a deploy page (null: none); throws on a malformed one
function cloudOf(html) {
  const m = html.match(/<script>window\.PG_CLOUD=Object\.freeze\((\{[\s\S]*?\})\);\(function\(c\)\{/);
  return m ? JSON.parse(m[1]) : null;
}
const staticScripts = (html) => (html.match(/<script\b[^>]*\bsrc\s*=/gi) || []).length;
// a deploy page with a config: everything the cloud needs, in the right place
function deployWithCloud(html, name, projectId) {
  let c = null; try { c = cloudOf(html); } catch (e) { c = null; }
  ok(`${name}: exactly one window.PG_CLOUD=, frozen, valid JSON`, (html.match(/window\.PG_CLOUD=/g) || []).length === 1 && !!c && /PG_CLOUD=Object\.freeze\(/.test(html));
  if (!c) return null;
  ok(`${name}: the config (v ${V}, ns firebase, projectId ${projectId}, authDomain, apiKey, appId)`, c.v === V && c.ns === 'firebase' && c.cfg && c.cfg.projectId === projectId && /^AIza[0-9A-Za-z_-]{35}$/.test(c.cfg.apiKey) && /^1:\d+:web:[0-9a-f]+$/.test(c.cfg.appId) && /\./.test(c.cfg.authDomain), c.cfg);
  ok(`${name}: the three SDK files: cdnjs first, jsDelivr as the fallback, the pinned sha512 for both`, Array.isArray(c.sdk) && c.sdk.length === 3 && SDK.every(([f, sri], i) => c.sdk[i][0] === CDNJS(f) && c.sdk[i][1] === sri && c.sdk[i][2] === JSD(f)), c.sdk);
  ok(`${name}: still exactly one static <script src> (PeerJS); the SDK is loaded by game.js only when needed`, staticScripts(html) === 1 && /<script defer src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/peerjs\//.test(html));
  const at = html.indexOf('window.PG_CLOUD='), sw = html.indexOf("sw.register('sw.js'"), game = html.indexOf('/* ---- sprites.js ---- */'), build = html.indexOf('<meta name="pg-build"');
  ok(`${name}: PG_CLOUD comes right after the build meta, before the worker registration and every game script`, build >= 0 && at > build && at < sw && at < game && html.slice(build, at).split('\n').length === 2, [build, at, sw, game]);
  ok(`${name}: the web.app -> firebaseapp.com hop (first visits only, never framed)`, /location\.hostname===p\+'\.web\.app'&&a===p\+'\.firebaseapp\.com'&&window\.top===window\.self&&localStorage\.getItem\('ppogeul-trophy'\)===null\)location\.replace\('https:\/\/'\+a\+location\.pathname\+location\.search\+location\.hash\)/.test(html));
  ok(`${name}: no "</script" or "<" inside the config (it is escaped)`, !/<\/script/i.test(JSON.stringify(c)));
  ok(`${name}: the shared hosts where nothing signs in (itch.io's game origin among them), no away flag`, Array.isArray(c.shared) && ['itch.zone', 'itch.io', 'hwcdn.net'].every((x) => c.shared.includes(x)) && !('away' in c), c.shared);
  return c;
}
// the itch zip's index.html (tools/pack-itch.js itchPage) of a deploy page with a cloud config: away with home, none without
const itchOf = (zipFile) => { const e = require('./pack-itch').unzip(fs.readFileSync(zipFile)); return e[0] && e[0].name === 'index.html' ? e[0].data.toString('utf8') : ''; };

// ================================================================ files
const art = read(path.join(ROOT, 'dist', 'ppogeul-bath.html'));
const dep = read(path.join(ROOT, 'deploy', 'index.html'));
const depSw = read(path.join(ROOT, 'deploy', 'sw.js'));
const hasCfg = fs.existsSync(path.join(ROOT, 'firebase.config.json'));
{
  const m = art.match(NONE);
  ok('artifact: nothing of Firebase in dist/ppogeul-bath.html - not the word, no PG_CLOUD=, no /__/auth, no SDK file', !m, m && art.slice(Math.max(0, m.index - 60), m.index + 40));
  ok('artifact: the cloud\'s markup is there but hidden (#pg-cloud, #pg-cloud-btn, #pg-tro-cloud carry hidden)', /<p id="pg-cloud" class="pg-cloud" hidden/.test(art) && /<button id="pg-cloud-btn"[^>]* hidden>/.test(art) && /<i id="pg-tro-cloud" class="pg-tro-cloud" hidden>/.test(art));
  ok('artifact: still no external script', staticScripts(art) === 0);
  if (hasCfg) {
    let p = null; try { p = require('./fb-config').readFirebaseConfig(path.join(ROOT, 'firebase.config.json')); } catch (e) { p = null; }
    ok('deploy: firebase.config.json exists and reads', !!p);
    if (p) deployWithCloud(dep, 'deploy/index.html', p.cfg.projectId);
    ok('deploy: sw.js may keep the six SDK files (cdnjs + jsDelivr)', SDK.every(([f]) => depSw.includes(JSON.stringify(CDNJS(f))) && depSw.includes(JSON.stringify(JSD(f)))));
  } else {
    ok('deploy (no firebase.config.json): the page has no PG_CLOUD and nothing of Firebase - exactly as before', !/PG_CLOUD\s*=|firebase/i.test(dep));
    ok('deploy (no firebase.config.json): sw.js lists no SDK file', !/-compat\.js/.test(depSw));
  }
  const fx = path.join(T, 'deploy-cloud', 'index.html'), nx = path.join(T, 'deploy-nocfg', 'index.html');
  if (ok('fixtures: deploy-cloud/ and deploy-nocfg/ were written (node build.js)', fs.existsSync(fx) && fs.existsSync(nx))) {
    const f = read(fx), n = read(nx);
    const c = deployWithCloud(f, 'fixture deploy-cloud', 'pg-cloud-test');
    ok('fixture deploy-cloud: the made-up config, never the real one (home for 새 창에서 열기)', c && c.cfg.apiKey === 'AIza' + 'Test0'.repeat(7) && c.home === 'https://pg-cloud-test.firebaseapp.com/');
    ok('fixture deploy-cloud: the test hook (hands SDK script tags to the parent test page only)', /window\.parent\.__pgFake/.test(f) && f.indexOf('__pgFake') < f.indexOf('/* ---- sprites.js ---- */'));
    ok('fixture deploy-cloud: no sw.js beside it (no worker in the tests)', !fs.existsSync(path.join(T, 'deploy-cloud', 'sw.js')));
    ok('fixture deploy-nocfg: no PG_CLOUD, nothing of Firebase', !/PG_CLOUD\s*=|firebase/i.test(n) && staticScripts(n) === 1);
    const body = (h) => h.slice(h.indexOf('<body>'));
    ok('fixtures: the same body as the deploy page (the head is the only difference)', body(f) === body(dep) && body(n) === body(dep));
    // the itch zip's page: never signs in (itch.io serves every game from one origin)
    const { itchPage } = require('./pack-itch');
    const fi = itchPage(f); let ci = null; try { ci = cloudOf(fi); } catch (e) { ci = null; }
    ok('itch page: a config with home -> PG_CLOUD marked away (1), the rest of the page byte for byte', ci && ci.away === 1 && ci.home === c.home && JSON.stringify(Object.assign({}, ci, { away: undefined })) === JSON.stringify(c) && fi.replace(/,"away":1\}\);/, '});') === f, ci);
    const noHome = f.replace(/,"home":"[^"]*"/, '');
    const fh = itchPage(noHome);
    ok('itch page: a config without home -> no PG_CLOUD at all (no login UI on itch), nothing else changed', !/window\.PG_CLOUD=/.test(fh) && !/\(window\.PG_CLOUD\)/.test(fh) && fh.length < noHome.length && body(fh) === body(f), fh.length);
    ok('itch page: a deploy page without a config is left as it is', itchPage(n) === n && itchPage(dep) === (hasCfg ? itchPage(dep) : dep));
    ok('itch page: deploy/ppodeuk-bath-itch.zip carries the itch form of deploy/index.html', itchOf(path.join(ROOT, 'deploy', 'ppodeuk-bath-itch.zip')) === itchPage(dep));
  }
  ok('deploy: the real deploy/ never carries the test fixture\'s config or hook', !/pg-cloud-test|__pgFake/.test(dep));
}

// ================================================================ config (tools/fb-config.js)
{
  const { readFirebaseConfig, fbCheck, parseConfigText } = require('./fb-config');
  const good = { apiKey: 'AIza' + 'abcDE_-123'.repeat(3) + 'abcde', authDomain: 'ppodeuk-bath.firebaseapp.com', projectId: 'ppodeuk-bath', storageBucket: 'ppodeuk-bath.firebasestorage.app', messagingSenderId: '123456789012', appId: '1:123456789012:web:0123456789abcdef012345' };
  const dir = path.join(T, 'cloud-config');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const put = (name, data) => { const f = path.join(dir, name); fs.writeFileSync(f, data); return f; };
  const res = (f) => { try { return { v: readFirebaseConfig(f) }; } catch (e) { return { e: e.message }; } };
  let r = res(put('plain.json', JSON.stringify(Object.assign({ home: 'https://ppodeuk-bath.firebaseapp.com/', measurementId: 'G-ABC' }, good), null, 2)));
  ok('config: plain JSON reads; measurementId dropped; home kept', r.v && r.v.cfg.apiKey === good.apiKey && !('measurementId' in r.v.cfg) && r.v.home === 'https://ppodeuk-bath.firebaseapp.com/' && Object.keys(r.v.cfg).length === 6, r);
  r = res(put('bom.json', '\uFEFF' + JSON.stringify(good)));
  ok('config: a UTF-8 BOM is fine', r.v && r.v.cfg.projectId === 'ppodeuk-bath', r);
  r = res(put('utf16.json', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(JSON.stringify(good), 'utf16le')])));
  ok('config: a UTF-16 (Notepad "Unicode") file is fine', r.v && r.v.cfg.appId === good.appId, r);
  const snippet = `// Import the functions you need from the SDKs you need\nimport { initializeApp } from "firebase/app";\n\nconst firebaseConfig = {\n  apiKey: "${good.apiKey}",\n  authDomain: "${good.authDomain}",\n  projectId: '${good.projectId}',\n  storageBucket: "${good.storageBucket}",\n  messagingSenderId: "${good.messagingSenderId}",\n  appId: "${good.appId}",\n  measurementId: "G-XYZ"\n};\n\n// Initialize Firebase\nconst app = initializeApp(firebaseConfig);\n`;
  r = res(put('snippet.json', snippet));
  ok('config: the console\'s `const firebaseConfig = {...}` snippet pasted as it is reads', r.v && r.v.cfg.apiKey === good.apiKey && r.v.cfg.projectId === good.projectId && r.v.home === '' && !('measurementId' in r.v.cfg), r);
  r = res(put('num.json', JSON.stringify(Object.assign({}, good, { messagingSenderId: 123456789012 }))));
  ok('config: a number where a string belongs is fine', r.v && r.v.cfg.messagingSenderId === '123456789012', r);
  r = res(put('min.json', JSON.stringify({ apiKey: good.apiKey, authDomain: good.authDomain, projectId: good.projectId, appId: good.appId })));
  ok('config: the four required fields alone are enough', r.v && Object.keys(r.v.cfg).length === 4, r);
  const bad = [
    ['badkey.json', Object.assign({}, good, { apiKey: 'AIzaShort' }), /apiKey가 이상해요 \(AIza로 시작하는 39글자예요\) \/ apiKey looks wrong/],
    ['noproj.json', Object.assign({}, good, { projectId: undefined }), /projectId 값이 없어요 \/ projectId is missing/],
    ['badproj.json', Object.assign({}, good, { projectId: 'Bad_Project' }), /projectId가 이상해요/],
    ['badapp.json', Object.assign({}, good, { appId: '1:2:ios:abc' }), /appId가 이상해요/],
    ['badhome.json', Object.assign({}, good, { home: 'http://x.com/' }), /home이 이상해요 \(https:\/\/로 시작하는 게임 주소예요\)/],
    ['baddom.json', Object.assign({}, good, { authDomain: 'not a domain' }), /authDomain이 이상해요/],
  ];
  for (const [f, o, re] of bad) { r = res(put(f, JSON.stringify(o))); ok(`config: refused with its message - ${f.replace('.json', '')}`, !!r.e && re.test(r.e) && r.e.startsWith(f + ': '), r); }
  r = res(put('junk.json', 'hello, this is not a config'));
  ok('config: unreadable -> "읽을 수 없어요 ... / cannot be read"', !!r.e && /읽을 수 없어요/.test(r.e) && /cannot be read/.test(r.e), r);
  r = res(put('array.json', '[1,2]'));
  ok('config: a JSON array -> cannot be read', !!r.e && /읽을 수 없어요/.test(r.e), r);
  ok('config: no file -> null (the deploy as before)', readFirebaseConfig(path.join(dir, 'missing.json')) === null);
  ok('config: parseConfigText and fbCheck exported for build.js', typeof parseConfigText === 'function' && typeof fbCheck === 'function');
}

// ================================================================ build a copy with a config (PG_BUILD_TEMP)
{
  const B = path.join(T, 'cloud-build'), SRC = path.join(B, 'bogeul'), TMP = path.join(B, 'tmp');
  fs.rmSync(B, { recursive: true, force: true });
  fs.mkdirSync(path.join(SRC, 'tools'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'build.js'), path.join(SRC, 'build.js'));
  for (const f of ['pack-itch.js', 'fb-config.js']) fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(SRC, 'tools', f));
  fs.cpSync(path.join(ROOT, 'src'), path.join(SRC, 'src'), { recursive: true, filter: (p) => !/[\\/]tests([\\/]|$)/.test(path.relative(path.join(ROOT, 'src'), p)) && path.basename(p) !== 'tests' });
  fs.mkdirSync(path.join(SRC, 'firebase'), { recursive: true });
  fs.writeFileSync(path.join(SRC, '.firebaserc'), '{\n  "projects": {\n    "default": "YOUR-PROJECT-ID"\n  }\n}\n');
  const cfg = `const firebaseConfig = {\n  apiKey: "AIza${'Copy1'.repeat(7)}",\n  authDomain: "pg-copy-test.firebaseapp.com",\n  projectId: "pg-copy-test",\n  storageBucket: "pg-copy-test.firebasestorage.app",\n  messagingSenderId: "987654321",\n  appId: "1:987654321:web:abcdef0123456789"\n};\n`;
  fs.writeFileSync(path.join(SRC, 'firebase.config.json'), cfg);
  const env = Object.assign({}, process.env, { PG_BUILD_TEMP: TMP }); delete env.PG_FIREBASE_CONFIG; delete env.PG_PREVIEW;
  const run = spawnSync(process.execPath, [path.join(SRC, 'build.js')], { encoding: 'utf8', env, cwd: SRC });
  const out = (run.stdout || '') + (run.stderr || '');
  if (ok('build copy: build.js runs with the console snippet as firebase.config.json', run.status === 0, out.slice(-600))) {
    ok('build copy: the console line names the project ("Firebase: pg-copy-test")', /Firebase: pg-copy-test/.test(out), out.split('\n')[0]);
    const cd = read(path.join(SRC, 'deploy', 'index.html')), csw = read(path.join(SRC, 'deploy', 'sw.js'));
    deployWithCloud(cd, 'build copy deploy/index.html', 'pg-copy-test');
    ok('build copy: its sw.js may keep the six SDK files', SDK.every(([f]) => csw.includes(JSON.stringify(CDNJS(f))) && csw.includes(JSON.stringify(JSD(f)))));
    ok('build copy: its dist/ppogeul-bath.html is byte-for-byte the real one (the artifact never depends on the config)', read(path.join(SRC, 'dist', 'ppogeul-bath.html')) === art);
    ok('build copy: .firebaserc got the project id', /"default": "pg-copy-test"/.test(read(path.join(SRC, '.firebaserc'))));
    const bh = (h) => (h.match(/<meta name="pg-build" content="([0-9a-f]{12})">/) || [])[1];
    ok('build copy: a config makes another build hash (installed apps update)', bh(cd) && bh(dep) && bh(cd) !== bh(dep) && csw.includes(JSON.stringify(bh(cd))));
    const zip = fs.readFileSync(path.join(SRC, 'deploy', 'ppodeuk-bath-itch.zip'));
    ok('build copy: the itch zip was made from it', zip.length > 1000 && zip.readUInt32LE(0) === 0x04034b50);
    const zi = itchOf(path.join(SRC, 'deploy', 'ppodeuk-bath-itch.zip'));
    ok('build copy: its config has no home -> the itch zip\'s page has no PG_CLOUD (never a sign-in on itch.io), the same body', !!zi && !/window\.PG_CLOUD=/.test(zi) && zi.slice(zi.indexOf('<body>')) === cd.slice(cd.indexOf('<body>')));
    ok('build copy: every output stayed in the copy (PG_BUILD_TEMP): its own C:/Temp-side deploy copy and fixtures', fs.existsSync(path.join(TMP, 'deploy', 'index.html')) && fs.existsSync(path.join(TMP, 'deploy-cloud', 'index.html')) && /pg-copy-test/.test(read(path.join(TMP, 'deploy', 'index.html'))));
    ok('build copy: (and the real C:/Temp/bogeul/deploy copy was not touched)', !/pg-copy-test/.test(read(path.join(T, 'deploy', 'index.html'))));
  }
  // a bad config stops the build with its message (nothing written over)
  fs.writeFileSync(path.join(SRC, 'firebase.config.json'), JSON.stringify({ apiKey: 'nope', authDomain: 'a.b', projectId: 'pg-copy-test', appId: '1:2:web:3' }));
  const before = fs.statSync(path.join(SRC, 'deploy', 'index.html')).mtimeMs;
  const bad = spawnSync(process.execPath, [path.join(SRC, 'build.js')], { encoding: 'utf8', env, cwd: SRC });
  ok('build copy: a bad firebase.config.json stops the build with "apiKey가 이상해요 ... / apiKey looks wrong"', bad.status !== 0 && /firebase\.config\.json: apiKey가 이상해요 \(AIza로 시작하는 39글자예요\) \/ apiKey looks wrong/.test(bad.stderr || ''), (bad.stderr || '').split('\n').slice(0, 6).join(' | '));
  ok('build copy: ... before anything was written', fs.statSync(path.join(SRC, 'deploy', 'index.html')).mtimeMs === before);
  fs.rmSync(B, { recursive: true, force: true });
}

// ================================================================ --net: the CDN files against their hashes
async function net() {
  for (const [f, sri] of SDK) {
    for (const url of [CDNJS(f), JSD(f)]) {
      try {
        const res = await fetch(url), buf = Buffer.from(await res.arrayBuffer());
        const got = 'sha512-' + crypto.createHash('sha512').update(buf).digest('base64');
        ok(`net: ${url} (${buf.length} bytes) matches its integrity hash`, res.ok && got === sri, got);
      } catch (e) { ok(`net: ${url} downloads`, false, String(e && e.message)); }
    }
  }
}
(async () => {
  if (process.argv.includes('--net')) await net();
  console.log(`CHECK-CLOUD ${fails ? 'FAIL' : 'OK'}: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
