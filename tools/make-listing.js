// The 앱인토스 console's listing images, from the game itself -> docs/listing/toss/ (committed; never in a build):
//   icon-600.png                 앱 로고 600 x 600 PNG: square corners, opaque (tools/make-icons.js --toss)
//   thumbnail-1932x828.png       썸네일 (게임 앱) 1932 x 828 PNG: a battle | a 거품 축구, close-ups at x7 (src/tests/listing.js)
//   screenshot-1504x741.png      가로 스크린샷 1504 x 741 PNG: a 4-animal battle in the Toss layout on a landscape phone
//                                (test-toss.html #shot=listing - its fit checks run too)
// Usage: node tools/make-listing.js [--no-build]   (PG_BUILD_TEMP / PG_HTTP_PORT as for run-all; headless Chrome muted)
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { T } = require('./env');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'listing', 'toss');
const PORT = +process.env.PG_HTTP_PORT || 8765;
const HTTP = `http://localhost:${PORT}/`;
const node = (args, env) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, env || {}) });
const up = () => new Promise((r) => { const q = http.get(HTTP + 'preview.html', (res) => { res.resume(); r(res.statusCode === 200); }); q.on('error', () => r(false)); q.setTimeout(1500, () => { q.destroy(); r(false); }); });

(async () => {
  if (!process.argv.includes('--no-build')) {
    const b = node([path.join(ROOT, 'build.js')], process.env.PG_RELAY_URL === undefined ? { PG_RELAY_URL: 'none' } : {});
    if (b.status !== 0) { process.stdout.write(b.stdout + b.stderr); console.log('BUILD FAILED'); process.exit(1); }
  }
  fs.mkdirSync(OUT, { recursive: true });
  let srv = null;
  if (!(await up())) srv = require('./serve').start(PORT, T, { quiet: true });
  let bad = 0;
  const ic = node([path.join(__dirname, 'make-icons.js'), '--toss']);
  process.stdout.write(ic.stdout); if (ic.status !== 0) { bad++; process.stdout.write(ic.stderr); }
  const shots = [
    ['thumbnail-1932x828.png', HTTP + 'test-listing.html#out=thumb', 1932, 828, 'LISTING (READY|FAIL)', '0', /LISTING READY/],
    ['screenshot-1504x741.png', HTTP + 'test-toss.html?net=bc#shot=listing&ins=0,0,0,0', 1504, 741, 'TOSS DONE', '1', /TOSS DONE pass=\d+ fail=0/],
  ];
  for (const [name, url, w, h, done, mobile, okRe] of shots) {
    const tmp = `listing-${name}`;
    const r = node([path.join(__dirname, 'cdp-run.js'), url, tmp, String(w), String(h), '40000', done, mobile]);
    const out = r.stdout + r.stderr;
    if (!okRe.test(out) || /PAGE-ERROR|CONSOLE error/.test(out)) { bad++; console.log(`FAIL ${name}\n` + out.split('\n').filter((l) => /FAIL|ERROR|error/.test(l)).slice(0, 8).join('\n')); continue; }
    fs.copyFileSync(path.join(T, tmp), path.join(OUT, name));
    console.log(`wrote docs/listing/toss/${name} (${w}x${h})`);
  }
  if (srv) srv.close();
  console.log(bad ? `MAKE-LISTING FAIL (${bad})` : 'MAKE-LISTING OK');
  process.exit(bad ? 1 : 0);
})();
