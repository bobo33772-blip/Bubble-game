// Checks of the 앱인토스 (Apps in Toss) build (design/toss.md 13, 15.1). No npm needed but for --dist / --ait (they read
// what toss/'s `npm run build` made). Rules and the host allowlist: tools/toss-rules.js.
// Usage: node bogeul/tools/check-toss.js [--static]      (run-all's 'check-toss'; after node build.js)
//          C:/Temp/bogeul/toss/ is the Toss page + its five engine files exactly as `node build.js --toss` writes them
//          into toss/: the page's shape (one module entry, the Toss head - no CDN, service worker, manifest, Firebase,
//          Google), pg/*.js = the deploy page's inline scripts (game.js without its <ait-cut> regions), every banned
//          pattern absent; the artifact and the deploy have nothing of Toss; the test pages are there. Then build.js on a
//          COPY of the sources (PG_BUILD_TEMP): a bad marker layout stops it with its message; with a made-up
//          firebase.config.json a plain build then --toss leaves dist/, deploy/, the itch zip and .firebaserc byte for
//          byte as they were; the Toss page's relay line (space t): the owner's Worker by default, PG_RELAY_URL's when
//          set, none (and a warning) with PG_RELAY_URL=none; never a TURN list, not even with turn.config.json
//        node bogeul/tools/check-toss.js --dist <dir>   (inside `npm run build`, after vite build: toss/dist)
//          every .html / .js / .css read as text, comments included: no banned pattern, every host allowlisted (+ the
//          host of the page's own relay line), index.html at the top with one module script from ./assets, the five pg/
//          files byte-equal to C:/Temp/bogeul/toss/pg/, the fonts (.woff2 + both families), no .map / sw.js / manifest,
//          < 100 MB (a warning above 20 MB)
//        node bogeul/tools/check-toss.js --ait <file>   (the last step of `npm run build`): the .ait exists, is newer
//          than dist/index.html and < 100 MB -> "CHECK-TOSS OK: ppodeuk-bath.ait <size> KB, build <BUILD>"
// Prints "CHECK-TOSS PASS|FAIL <name>" and "CHECK-TOSS OK|FAIL: N passed, M failed"; exit code 1 on any failure.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { T } = require('./env');
const R = require('./toss-rules');
let passes = 0, fails = 0;
const ok = (name, cond, info) => { if (cond) passes++; else fails++; console.log(`CHECK-TOSS ${cond ? 'PASS' : 'FAIL'} ${name}${!cond && info !== undefined ? ' :: ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 600) : ''}`); return !!cond; };
const read = (f) => fs.readFileSync(f, 'utf8');
const args = process.argv.slice(2);
const argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ORDER = ['sprites.js', 'levels.js', 'audio.js', 'net.js', 'game.js'];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const MB = 1024 * 1024;
// a page's relay line (build.js tossRelayTag): {url, space, host}; null: none; undefined: more than one, or malformed
const RELAY_LINE = /<script id="pg-relay">window\.PG_RELAY=\{url:"(https:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d{1,5})?(?:\/[A-Za-z0-9._~-]+)*)",space:"([wpt])"\};<\/script>/g;
function relayOf(html) {
  const n = (html.match(/pg-relay|PG_RELAY/g) || []).length, m = [...html.matchAll(RELAY_LINE)];
  if (!n) return null;
  if (m.length !== 1 || n !== 2) return undefined;                    // (one tag: its id and the global it sets)
  return { url: m[0][1], host: m[0][2].toLowerCase(), space: m[0][3] };
}
const NO_TOSS = [/<html\b[^>]*\bpg-ait\b/i, /PG_AIT\s*=(?!=)/, /@apps-in-toss/, /<script\b[^>]*\bsrc\s*=\s*["']?[^"'\s>]*ait\.js\b/i];
// the Toss page's own shape (toss/index.html, its C:/Temp copy, a build copy's)
function tossPage(html, name) {
  ok(`${name}: <!doctype html>, <html lang="ko" class="pg-sa pg-ait">, charset first`, /^<!doctype html>\n<html lang="ko" class="pg-sa pg-ait">\n<head>\n<meta charset="utf-8">/.test(html), html.slice(0, 120));
  ok(`${name}: the viewport (viewport-fit=cover, user-scalable=no), title, description, pg-build`, /<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*">/.test(html) && /user-scalable=no/.test(html) && /<title>뽀득뽀득 목욕탕<\/title>/.test(html) && /<meta name="description" content="[^"]{20,}">/.test(html) && /<meta name="pg-build" content="[0-9a-f]{12}">/.test(html));
  const srcs = html.match(/<script\b[^>]*\bsrc\s*=[^>]*>/gi) || [];
  ok(`${name}: exactly one <script src>: the module entry /src/main.js`, srcs.length === 1 && srcs[0] === '<script type="module" src="/src/main.js">', srcs);
  for (const re of [/serviceWorker/, /rel=["']?manifest/i, /PG_CLOUD/, /firebase/i, /fonts\.googleapis/, /fonts\.gstatic/, /cdnjs/, /peerjs\.min\.js/, /location\.replace/, /구글/, /Google/, /apple-mobile-web-app|apple-touch-icon|og:title|rel="icon"/, /PG_PREVIEW|pg-preview-badge/]) {
    const m = html.match(re); ok(`${name}: no ${re}`, !m, m && html.slice(Math.max(0, m.index - 50), m.index + 50));
  }
  ok(`${name}: the skeleton's insets read --sa-t / --sa-b (the Toss Safe Area), no env() in it`, /<style>:root\{color-scheme:light;padding-top:var\(--sa-t\);padding-bottom:var\(--sa-b\)\}/.test(html));
  ok(`${name}: no CSS comments left in the head (two of them described the Google button)`, !/\/\*/.test(html.slice(0, html.indexOf('</head>'))));
  ok(`${name}: the hidden cloud button has no label (구글로 로그인 removed)`, /<button id="pg-cloud-btn" class="pg-btn pg-ghost pg-cloud-btn" type="button" hidden><\/button>/.test(html));
  ok(`${name}: the body has no inline engine (pg/*.js are loaded by src/ait.js)`, !/\/\* ---- (sprites|game)\.js ---- \*\//.test(html) && !/<script>[\s\S]*PG\.debug/.test(html));
  // online (design/toss.md 2.5): the relay in its Toss space, or none; never a TURN list (turn.config.json is the deploy's)
  const rl = relayOf(html);
  ok(`${name}: no relay line, or one in the head naming the space t`, rl === null || (!!rl && rl.space === 't' && html.indexOf('pg-relay') < html.indexOf('</head>')), rl);
  ok(`${name}: no PG_PEER_OPTIONS (no TURN list in Toss)`, !/PG_PEER_OPTIONS/.test(html));
  const head = html.slice(0, html.indexOf('</head>'));
  const hits = R.scan(html, true).filter((h) => h.name !== 'firebase');   // (the word was checked above)
  ok(`${name}: no banned pattern`, hits.length === 0, hits.slice(0, 3));
  return head;
}

// ================================================================== --ait <file>
if (args.includes('--ait')) {
  const f = path.resolve(argOf('--ait') || 'ppodeuk-bath.ait');
  const dist = path.join(path.dirname(f), 'dist', 'index.html');
  const st = fs.existsSync(f) ? fs.statSync(f) : null, di = fs.existsSync(dist) ? fs.statSync(dist) : null;
  ok('.ait: the file exists', !!st, f);
  if (st) {
    ok('.ait: newer than dist/index.html (made from this build)', !!di && st.mtimeMs >= di.mtimeMs, [st.mtimeMs, di && di.mtimeMs]);
    ok('.ait: under 100 MB', st.size < 100 * MB, st.size);
  }
  const build = di ? (read(dist).match(/<meta name="pg-build" content="([0-9a-f]{12})">/) || [])[1] : '';
  ok('.ait: dist/index.html carries its build id', !!build);
  if (fails) { console.log(`CHECK-TOSS FAIL: ${passes} passed, ${fails} failed`); process.exit(1); }
  console.log(`CHECK-TOSS OK: ${path.basename(f)} ${(st.size / 1024).toFixed(1)} KB, build ${build}`);
  process.exit(0);
}

// ================================================================== --dist <dir>
if (args.includes('--dist')) {
  const D = path.resolve(argOf('--dist') || 'dist');
  const files = fs.existsSync(D) ? walk(D) : [];
  const rel = (f) => path.relative(D, f).split(path.sep).join('/');
  ok('dist: index.html at the top', fs.existsSync(path.join(D, 'index.html')), D);
  const html = fs.existsSync(path.join(D, 'index.html')) ? read(path.join(D, 'index.html')) : '';
  // (the page's own relay host - build.js wrote it from PG_RELAY_URL / relay.config.json / TOSS_RELAY, so it is not
  // known in advance (design/relay.md 15) - is allowed as well; a Toss page never has a TURN list)
  const rl = relayOf(html);
  ok('dist/index.html: no relay line, or exactly one naming the space t', rl === null || (!!rl && rl.space === 't'), rl);
  if (!rl) console.log('CHECK-TOSS WARNING dist/index.html has no relay line: online only through PeerJS (PG_RELAY_URL=none?)');
  ok('dist/index.html: no PG_PEER_OPTIONS (no TURN list in Toss)', !/PG_PEER_OPTIONS/.test(html));
  const allowed = new Set(Object.keys(R.HOSTS).concat(rl ? [rl.host] : []));
  let texts = 0;
  for (const f of files.filter((x) => /\.(html|js|css|mjs)$/i.test(x))) {
    const t = read(f); texts++;
    const hits = R.scan(t, /\.html$/i.test(f));
    ok(`dist: ${rel(f)}: no banned pattern`, hits.length === 0, hits.slice(0, 4).map((h) => `${h.name} @${h.at}: ...${h.around}...`));
    const bad = [...R.hostsIn(t)].filter((h) => !allowed.has(h));
    ok(`dist: ${rel(f)}: every host it names is allowlisted (tools/toss-rules.js)`, bad.length === 0, bad);
  }
  ok('dist: text files scanned', texts >= 7, texts);
  // the page: one module script from ./assets, nothing else loaded but ./assets stylesheets
  const scripts = html.match(/<script\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)[^>]*>/gi) || [];
  ok('dist/index.html: exactly one <script src>, a module from ./assets/', scripts.length === 1 && /type="module"/.test(scripts[0]) && /src="\.\/assets\/[^"]+\.js"/.test(scripts[0]), scripts);
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  ok('dist/index.html: its <link>s are ./assets stylesheets only (no preconnect, manifest, icon)', links.every((l) => /rel="stylesheet"/.test(l) && /href="\.\/assets\/[^"]+\.css"/.test(l)), links);
  ok('dist/index.html: no inline script but the relay line', [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].every((m) => /\bsrc=/.test(m[1]) || (m[1] === ' id="pg-relay"' && /^window\.PG_RELAY=\{url:"[^"<]*",space:"t"\};$/.test(m[2]))));
  ok('dist/index.html: the Toss page (pg-ait), the hidden cloud button without a label', /<html lang="ko" class="pg-sa pg-ait">/.test(html) && /id="pg-cloud-btn"[^>]*hidden><\/button>/.test(html) && !/구글|Google/.test(html));
  // the engine files: as build.js wrote them (C:/Temp copy)
  for (const f of ORDER) {
    const a = path.join(D, 'pg', f), b = path.join(T, 'toss', 'pg', f);
    ok(`dist/pg/${f}: byte-equal to ${T}/toss/pg/${f}`, fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b)));
  }
  ok('dist/pg/: the five engine files and nothing else', fs.existsSync(path.join(D, 'pg')) && fs.readdirSync(path.join(D, 'pg')).sort().join() === ORDER.slice().sort().join(), fs.existsSync(path.join(D, 'pg')) ? fs.readdirSync(path.join(D, 'pg')) : null);
  // the fonts: woff2 slices and both families in the CSS
  const css = files.filter((f) => /\.css$/i.test(f)).map(read).join('\n');
  ok('dist/assets: .woff2 font slices', files.some((f) => /assets[\\/][^\\/]+\.woff2$/i.test(f)), files.filter((f) => /woff/.test(f)).length);
  ok('dist/assets: CSS naming Black Han Sans and Gowun Dodum', /font-family:\s*["']?Black Han Sans/.test(css) && /font-family:\s*["']?Gowun Dodum/.test(css));
  ok('dist: no source map, sw.js or manifest', !files.some((f) => /\.map$|[\\/]sw\.js$|manifest\.webmanifest$/i.test(f)), files.filter((f) => /\.map$|sw\.js$|manifest/.test(f)).map(rel));
  const size = files.reduce((a, f) => a + fs.statSync(f).size, 0);
  ok('dist: under 100 MB in all (uncompressed)', size < 100 * MB, size);
  if (size > 20 * MB) console.log(`CHECK-TOSS WARNING dist is ${(size / MB).toFixed(1)} MB (over 20 MB)`);
  console.log(`CHECK-TOSS INFO dist: ${files.length} files, ${(size / MB).toFixed(2)} MB`);
  console.log(`CHECK-TOSS ${fails ? 'FAIL' : 'OK'}: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
}

// ================================================================== --static
{
  const art = read(path.join(ROOT, 'dist', 'ppogeul-bath.html')), dep = read(path.join(ROOT, 'deploy', 'index.html'));
  for (const [n, h] of [['artifact', art], ['deploy', dep]]) {
    const re = NO_TOSS.find((x) => x.test(h));
    ok(`${n}: nothing of the Toss build (no pg-ait class on <html>, no PG_AIT assignment, no SDK name, no ait.js script)`, !re, re && String(re));
  }
  const page = path.join(T, 'toss', 'index.html');
  if (ok(`${T}/toss/index.html was written (node build.js)`, fs.existsSync(page))) {
    const html = read(page);
    tossPage(html, 'toss page');
    ok('toss page: the C:/Temp copy is exactly index.html + pg/ (5 files)', fs.readdirSync(path.join(T, 'toss')).sort().join() === 'index.html,pg' && fs.readdirSync(path.join(T, 'toss', 'pg')).sort().join() === ORDER.slice().sort().join());
    ok('toss page: the same body as the deploy page apart from the inline engine and the cloud button label', (() => {
      const b = (x) => x.slice(x.indexOf('<body>') + 6, x.indexOf('</body>')).replace(/<script>\n\/\* ---- [\s\S]*<\/script>/, '').replace('type="button" hidden>구글로 로그인</button>', 'type="button" hidden></button>').trim();
      return b(html) === b(dep);
    })());
    // pg/*.js: what the deploy inlines, game.js without its cut regions
    const inl = (f) => { const m = dep.match(new RegExp('<script>\\n/\\* ---- ' + f.replace('.', '\\.') + ' ---- \\*/\\n([\\s\\S]*?)\\n</script>')); return m ? m[1] : null; };
    for (const f of ORDER) {
      const pg = read(path.join(T, 'toss', 'pg', f)), d = inl(f);
      if (f === 'game.js') {
        let c = null; try { c = R.aitCut(d || '', 'deploy game.js'); } catch (e) { c = null; }
        ok('pg/game.js = the deploy\'s game.js without its ' + R.CUTS + ' <ait-cut> regions', !!c && c.n === R.CUTS && pg === c.code, c && c.n);
        ok('pg/game.js: no marker, no Google sign-in API, no outside link, no install prompt listener left', !/<\/?ait-cut>/.test(pg) && !/GoogleAuthProvider|signInWith(Popup|Redirect)|intent:\/\/|kakaotalk:\/\/|beforeinstallprompt|window\.open\(|location\.href\s*=(?!=)/.test(pg));
      } else ok(`pg/${f} = the deploy's inline ${f}`, d !== null && pg === d);
      const hits = R.scan(pg, false);
      ok(`pg/${f}: no banned pattern`, hits.length === 0, hits.slice(0, 3));
      ok(`pg/${f}: does not name the SDK`, !/@apps-in-toss/.test(pg));
    }
    const src = read(path.join(ROOT, 'src', 'game.js'));
    let cut = null, err = ''; try { cut = R.aitCut(src, 'src/game.js'); } catch (e) { err = e.message; }
    ok(`src/game.js: the cut markers are balanced, not nested, ${R.CUTS} regions`, !!cut && cut.n === R.CUTS, err || (cut && cut.n));
    ok('src/game.js: every Google sign-in API / outside link / install listener sits inside a cut region', !!cut && !/GoogleAuthProvider|signInWith(Popup|Redirect)\(|'intent:\/\/'|kakaotalk:\/\/|listen\(window, 'beforeinstallprompt'/.test(cut.code));
    ok('src/game.js: the two comments name the browser\'s install prompt event, not its literal name', (src.match(/beforeinstallprompt/g) || []).length === 1);
    const pgBuild = (html.match(/<meta name="pg-build" content="([0-9a-f]{12})">/) || [])[1];
    ok('toss page: a 12-hex build id', !!pgBuild);
  }
  // the test pages
  for (const f of ['ait.js', 'toss-fake.js', 'test-toss.html', 'toss-test-driver.js', 'toss-fx/index.html']) ok(`${T}/${f} was written`, fs.existsSync(path.join(T, f)));
  if (fs.existsSync(path.join(T, 'ait.js'))) ok('ait.js in C:/Temp = src/ait.js', read(path.join(T, 'ait.js')) === read(path.join(ROOT, 'src', 'ait.js')));
  ok('no test-toss-fake.html (the generic test-page loop skips toss.js / toss-fake.js)', !fs.existsSync(path.join(T, 'test-toss-fake.html')));
  if (fs.existsSync(path.join(T, 'test-toss.html'))) {
    const t = read(path.join(T, 'test-toss.html'));
    ok('test-toss.html: the Toss page shape (pg-sa pg-ait) with the fake SDK, src/ait.js and the boot line inline, no CDN, no module entry', /<html lang="ko" class="pg-sa pg-ait">/.test(t) && /PGFake/.test(t) && /PG\.Ait = \{/.test(t) && /PGFake\.start\(\["toss\/pg\/sprites\.js"/.test(t) && /"toss-test-driver\.js"\]/.test(t) && !/src="\/src\/main\.js"/.test(t) && !/cdnjs|fonts\.g/.test(t));
  }
  if (fs.existsSync(path.join(T, 'toss-fx', 'index.html'))) {
    const t = read(path.join(T, 'toss-fx', 'index.html'));
    ok('toss-fx: ../ait.js, ../toss-fake.js and the boot line in place of the module entry', /<script src="\.\.\/ait\.js"><\/script>\n<script src="\.\.\/toss-fake\.js"><\/script>\n<script>PGFake\.start\(\["\.\.\/toss\/pg\/sprites\.js"/.test(t) && !/src="\/src\/main\.js"/.test(t));
  }
  // the toss/ project as committed: pinned versions, the scripts, the ignore list
  {
    const pj = JSON.parse(read(path.join(ROOT, 'toss', 'package.json')));
    const deps = Object.assign({}, pj.dependencies, pj.devDependencies);
    ok('toss/package.json: every version exact (no ^ / ~ / ranges)', Object.values(deps).every((v) => /^\d+\.\d+\.\d+$/.test(v)), deps);
    ok('toss/package.json: the SDK 3.9.0, peerjs 1.5.4 (the deploy\'s), fontsource 5.3.0, vite 6.3.5, devtools 3.9.0', deps['@apps-in-toss/web-framework'] === '3.9.0' && deps.peerjs === '1.5.4' && deps['@fontsource/black-han-sans'] === '5.3.0' && deps['@fontsource/gowun-dodum'] === '5.3.0' && deps.vite === '6.3.5' && deps['@apps-in-toss/devtools'] === '3.9.0' && pj.private === true);
    ok('toss/package.json: build = pg, vite build, check --dist, ait build, check --ait', pj.scripts.build === 'npm run pg && vite build && node ../tools/check-toss.js --dist dist && ait build && node ../tools/check-toss.js --ait ppodeuk-bath.ait' && pj.scripts.pg === 'node ../build.js --toss');
    ok('toss/package-lock.json is there', fs.existsSync(path.join(ROOT, 'toss', 'package-lock.json')));
    const gi = read(path.join(ROOT, 'toss', '.gitignore')).split(/\r?\n/);
    ok('toss/.gitignore: node_modules/, dist/, *.ait, index.html, public/pg/', ['node_modules/', 'dist/', '*.ait', 'index.html', 'public/pg/'].every((x) => gi.includes(x)));
    const cfg = read(path.join(ROOT, 'toss', 'apps-in-toss.config.ts'));
    ok('toss/apps-in-toss.config.ts: appName ppodeuk-bath, webBundleDir dist, no permissions, the dark transparent nav bar', /appName: 'ppodeuk-bath'/.test(cfg) && /webBundleDir: 'dist'/.test(cfg) && /permissions: \[\]/.test(cfg) && /navigationBar: \{ transparentBackground: true, theme: 'dark', withTitle: false \}/.test(cfg));
    const vc = read(path.join(ROOT, 'toss', 'vite.config.js'));
    ok('toss/vite.config.js: base ./, devtools only for serve, no source maps, nothing inlined', /base: '\.\/'/.test(vc) && /command === 'serve' \? \[devtools\.vite\(\)\] : \[\]/.test(vc) && /sourcemap: false/.test(vc) && /assetsInlineLimit: 0/.test(vc));
    const mj = read(path.join(ROOT, 'toss', 'src', 'main.js'));
    ok('toss/src/main.js: the SDK, PeerJS, the two fonts, src/ait.js; window.Peer; boot with the five pg/ files', /from '@apps-in-toss\/web-framework'/.test(mj) && /from 'peerjs'/.test(mj) && /@fontsource\/black-han-sans\/400\.css/.test(mj) && /@fontsource\/gowun-dodum\/400\.css/.test(mj) && /import '\.\.\/\.\.\/src\/ait\.js'/.test(mj) && /window\.Peer = Peer/.test(mj) && /PG\.Ait\.boot\(SDK, \{ scripts: \['pg\/sprites\.js', 'pg\/levels\.js', 'pg\/audio\.js', 'pg\/net\.js', 'pg\/game\.js'\] \}\)/.test(mj));
  }
}

// ================================================================== build a copy (PG_BUILD_TEMP)
{
  const B = path.join(T, 'toss-build'), SRC = path.join(B, 'bogeul'), TMP = path.join(B, 'tmp');
  fs.rmSync(B, { recursive: true, force: true });
  fs.mkdirSync(path.join(SRC, 'tools'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'build.js'), path.join(SRC, 'build.js'));
  for (const f of ['pack-itch.js', 'fb-config.js', 'toss-rules.js']) fs.copyFileSync(path.join(ROOT, 'tools', f), path.join(SRC, 'tools', f));
  fs.cpSync(path.join(ROOT, 'src'), path.join(SRC, 'src'), { recursive: true, filter: (p) => !/[\\/]tests([\\/]|$)/.test(path.relative(path.join(ROOT, 'src'), p)) && path.basename(p) !== 'tests' });
  fs.writeFileSync(path.join(SRC, '.firebaserc'), '{\n  "projects": {\n    "default": "YOUR-PROJECT-ID"\n  }\n}\n');
  fs.writeFileSync(path.join(SRC, 'firebase.config.json'), JSON.stringify({ apiKey: 'AIza' + 'Toss1'.repeat(7), authDomain: 'pg-toss-test.firebaseapp.com', projectId: 'pg-toss-test', appId: '1:123456789:web:abcdef0123456789' }));
  const env = Object.assign({}, process.env, { PG_BUILD_TEMP: TMP }); for (const k of ['PG_FIREBASE_CONFIG', 'PG_PREVIEW', 'PG_TOSS', 'PG_TURN_CONFIG', 'PG_RELAY_URL']) delete env[k];
  // (the owner's Worker: build.js's TOSS_RELAY, the Toss page's relay when nothing else names one)
  const TOSS_RELAY = (read(path.join(ROOT, 'build.js')).match(/const TOSS_RELAY = '([^']+)';/) || [])[1];
  const run = (a, e) => { const r = spawnSync(process.execPath, [path.join(SRC, 'build.js')].concat(a || []), { encoding: 'utf8', env: Object.assign({}, env, e || {}), cwd: SRC }); return { status: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
  const snap = () => {
    const m = new Map();
    for (const d of ['dist', 'deploy']) if (fs.existsSync(path.join(SRC, d))) for (const f of walk(path.join(SRC, d))) m.set(path.relative(SRC, f), fs.readFileSync(f));
    for (const f of walk(path.join(TMP, 'deploy'))) m.set('TMP:' + path.relative(TMP, f), fs.readFileSync(f));
    m.set('.firebaserc', fs.readFileSync(path.join(SRC, '.firebaserc')));
    return m;
  };
  const r1 = run();
  if (ok('build copy: a plain build with a made-up firebase.config.json', r1.status === 0 && /Firebase: pg-toss-test/.test(r1.out), r1.out.slice(-400))) {
    const before = snap();
    ok('build copy: ... its deploy page carries the cloud (PG_CLOUD), the zip is there', /window\.PG_CLOUD=/.test(before.get(path.join('deploy', 'index.html')).toString()) && before.has(path.join('deploy', 'ppodeuk-bath-itch.zip')));
    const r2 = run(['--toss']);
    ok('build copy: --toss runs (and says it wrote nothing else)', r2.status === 0 && /nothing else/.test(r2.out), r2.out.slice(-400));
    ok('build copy: --toss with no relay URL set: the owner\'s Worker in the space t (its line says so), no warning', !!TOSS_RELAY && r2.out.includes('relay: ' + TOSS_RELAY + ' space t') && !/WARNING toss/.test(r2.out), r2.out.slice(-300));
    const after = snap();
    const diff = [...new Set([...before.keys(), ...after.keys()])].filter((k) => !before.has(k) || !after.has(k) || !before.get(k).equals(after.get(k)));
    ok('build copy: dist/, deploy/, its C:/Temp copy, the itch zip and .firebaserc byte for byte the same after --toss (the deploy keeps its PG_CLOUD)', diff.length === 0 && before.size > 5, diff);
    const tp = path.join(SRC, 'toss', 'index.html');
    if (ok('build copy: --toss wrote toss/index.html and toss/public/pg/*.js', fs.existsSync(tp) && ORDER.every((f) => fs.existsSync(path.join(SRC, 'toss', 'public', 'pg', f))))) {
      const t = read(tp);
      tossPage(t, 'build copy toss/index.html');
      const rl = relayOf(t);
      ok('build copy: toss/index.html has no firebase; its one relay line names the owner\'s Worker and the space t', !/firebase/i.test(t) && !!rl && rl.url === TOSS_RELAY && rl.space === 't', rl);
      ok('build copy: toss/ is byte-equal to its C:/Temp copy', t === read(path.join(TMP, 'toss', 'index.html')) && ORDER.every((f) => read(path.join(SRC, 'toss', 'public', 'pg', f)) === read(path.join(TMP, 'toss', 'pg', f))));
    }
    // a TURN list (the deploy's) never reaches the Toss page; PG_RELAY_URL names its relay (space t); none: no relay line
    const turn = path.join(B, 'turn.json');
    fs.writeFileSync(turn, 'iceServers: [ { urls: "stun:stun.relay.example.net:80", }, { urls: "turns:global.relay.example.net:443?transport=tcp", username: "u", credential: "c", }, ]');
    const U = 'https://relay-x.test-acct.workers.dev';
    const r3 = run(['--toss'], { PG_TURN_CONFIG: turn, PG_RELAY_URL: U });
    const t3 = fs.existsSync(tp) ? read(tp) : '', rl3 = relayOf(t3);
    ok('build copy: with a TURN list and PG_RELAY_URL: no PG_PEER_OPTIONS, one relay line (that URL, space t) in the head before the module entry', r3.status === 0 && !/PG_PEER_OPTIONS|relay\.example\.net/.test(t3) && !!rl3 && rl3.url === U && rl3.space === 't' && t3.indexOf('pg-relay') < t3.indexOf('/src/main.js') && !/WARNING toss/.test(r3.out), [r3.out.slice(-300), rl3]);
    const r4 = run(['--toss'], { PG_RELAY_URL: 'none' });
    const t4 = fs.existsSync(tp) ? read(tp) : '';
    ok('build copy: PG_RELAY_URL=none -> no relay line, and a warning (online only through PeerJS)', r4.status === 0 && relayOf(t4) === null && /WARNING toss: 중계 서버 없음/.test(r4.out) && /relay: none/.test(r4.out), r4.out.slice(-300));
    tossPage(t4, 'build copy toss/index.html without a relay');
    // a bad marker layout stops the build with its message, before anything is written
    const g = path.join(SRC, 'src', 'game.js'), g0 = read(g);
    const bad = [
      ['an opener without its closer', g0.replace('    // </ait-cut>\n    return \'\';\n  }\n  function clOpenOutside', '    return \'\';\n  }\n  function clOpenOutside'), /<ait-cut> inside another one|<ait-cut> without its <\/ait-cut>/],
      ['a nested opener', g0.replace('    // <ait-cut>\n    if (e.kakao)', '    // <ait-cut>\n    // <ait-cut>\n    if (e.kakao)'), /inside another one/],
      ['a closer without its opener', g0.replace('    return \'\';\n  }\n  function clOpenOutside', '    // </ait-cut>\n    return \'\';\n  }\n  function clOpenOutside'), /without its <ait-cut>/],
      ['a marker not on its own line', g0.replace('  // <ait-cut>\n  const clProvider', '  const x = 1; // <ait-cut>\n  // <ait-cut>\n  const clProvider'), /a line of its own/],
      ['a region removed (5 instead of 6)', g0.replace('    // <ait-cut>\n    listen(window, \'beforeinstallprompt\'', '    listen(window, \'beforeinstallprompt\'').replace(/(listen\(window, 'beforeinstallprompt'[^\n]*\n) {4}\/\/ <\/ait-cut>\n/, '$1'), /6 ait-cut regions|has 5 ait-cut regions/],
    ];
    for (const [what, code, re] of bad) {
      if (code === g0) { ok(`build copy: bad markers (${what}) - the test could place it`, false); continue; }
      fs.writeFileSync(g, code);
      const m0 = fs.statSync(tp).mtimeMs;
      const r = run(['--toss']);
      ok(`build copy: bad markers (${what}) stop build.js with its message, toss/ untouched`, r.status !== 0 && re.test(r.out) && fs.statSync(tp).mtimeMs === m0, r.out.split('\n').filter((l) => /ait-cut/.test(l)).slice(0, 2).join(' | ') || r.out.slice(-300));
    }
    fs.writeFileSync(g, g0);
    const rp = run(['--toss'], { PG_PREVIEW: '7' });
    ok('build copy: --toss with PG_PREVIEW is refused', rp.status !== 0 && /--toss and PG_PREVIEW do not mix/.test(rp.out));
  }
  fs.rmSync(B, { recursive: true, force: true });
}
console.log(`CHECK-TOSS ${fails ? 'FAIL' : 'OK'}: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
