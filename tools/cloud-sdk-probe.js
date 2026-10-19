// Manual (needs the internet; not in run-all): the cloud code against the REAL Firebase compat SDK files from the CDN.
// The test fixture C:/Temp/bogeul/deploy-cloud/ (a made-up project) opened as a top-level page: its script hook stays
// inert there, so game.js's own loader fetches the pinned files from cdnjs with their integrity hashes. Checks that the
// SDK's global, version and every compat call game.js makes exist with the shapes it expects, and how a sign-in that
// cannot work (a headless popup, a project that does not exist) comes back: as one of the messages of design 4.3, with
// no exception and no console error from game.js.
// Usage: node bogeul/build.js; node bogeul/tools/serve.js; node bogeul/tools/cloud-sdk-probe.js
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const T = 'C:/Temp/bogeul';
const src = fs.readFileSync(path.join(T, 'deploy-cloud', 'index.html'), 'utf8');
const PROBE = `<script>
(async function () {
  const log = (s) => console.log('SDKPROBE ' + s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 300 && !(window.PG && PG.debug && PG.debug.cloud); i++) await sleep(20);
  const C = PG.debug.cloud, r = {};
  r.boot = C.state().st; r.bootLoads = C.state().loads;
  PG.debug.tro.ns('sdkprobe');
  PG.debug.tro.openRec();
  for (let i = 0; i < 400 && !C.state().parts[1]; i++) await sleep(50);
  const fb = window.firebase;
  r.parts1 = C.state().parts; r.version = fb && fb.SDK_VERSION; r.apps = fb && fb.apps && fb.apps.length;
  r.shapes = fb ? { initializeApp: typeof fb.initializeApp, app: typeof fb.app, setLogLevel: typeof fb.setLogLevel, provider: typeof (fb.auth && fb.auth.GoogleAuthProvider) } : null;
  try {
    const a = fb.app().auth(), p = new fb.auth.GoogleAuthProvider();
    r.auth = { lang: a.languageCode, onAuth: typeof a.onAuthStateChanged, popup: typeof a.signInWithPopup, redirect: typeof a.signInWithRedirect, result: typeof a.getRedirectResult, signOut: typeof a.signOut, current: a.currentUser === null, custom: typeof p.setCustomParameters };
  } catch (e) { r.authErr = String(e && e.message); }
  const s2 = await C.load(2);
  r.fs = s2.error ? { error: s2.error } : null;
  try {
    const db = fb.app().firestore(), ref = db.collection('players').doc('probe');
    r.fsShapes = { fv: typeof fb.firestore.FieldValue.serverTimestamp, del: typeof fb.firestore.FieldValue.delete, snap: typeof ref.onSnapshot, update: typeof ref.update, tx: typeof db.runTransaction, ts: typeof fb.firestore.Timestamp.prototype.toMillis };
  } catch (e) { r.fsErr = String(e && e.message); }
  r.parts2 = C.state().parts;
  // a sign-in from script in a headless tab: the popup cannot open (no gesture) - it must end as a message, not a throw
  C.click();
  for (let i = 0; i < 300 && (C.state().st === 'auth' || C.state().st === 'load' || C.state().st === 'link'); i++) await sleep(50);
  const s3 = C.state();
  r.signin = { st: s3.st, msg: s3.msg, line: s3.line };
  r.scripts = [...document.scripts].filter((s) => s.src && /compat/.test(s.src)).map((s) => [s.src.replace(/^.*\\//, ''), !!s.integrity, s.crossOrigin]);
  log('RESULT ' + JSON.stringify(r));
  log('DONE');
})();
</script>`;
fs.writeFileSync(path.join(T, 'deploy-cloud', 'sdk-probe.html'), src.replace(/<\/body>\s*<\/html>\s*$/i, PROBE + '\n</body>\n</html>\n'));
const r = spawnSync(process.execPath, [path.join(__dirname, 'run-chrome.js'), 'http://localhost:8765/deploy-cloud/sdk-probe.html', '-', '900', '760', 'rt60000', 'SDKPROBE DONE'], { encoding: 'utf8' });
process.stdout.write(r.stdout + r.stderr);
