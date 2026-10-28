// The relay once in Cloudflare's OWN runtime on this PC (design/relay.md 11.6, run-all job ws-workerd): `wrangler dev`
// runs cloudflare/ in local workerd (a local SQLite Durable Object, a local rate limiter) - no login, no account, nothing
// leaves this machine (never --remote, never login / deploy). Then the net-ws driver (src/tests/net-ws.js) plays its
// phases through it from headless Chrome (--mute-audio, via tools/run-chrome.js), and wrangler is stopped.
// Needs wrangler in cloudflare/node_modules (cd cloudflare; npm install - about 100 MB, the owner's call: open question
// 7). Without it this prints "WS-WORKERD SKIP (cd cloudflare; npm install)" and run-all counts the job as skipped.
// Needs serve.js on PG_HTTP_PORT (run-all starts it) for the test page; wrangler listens on PG_WORKERD_PORT (8799).
// Prints "WS-WORKERD OK" / "WS-WORKERD FAIL <why>".
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const CFD = path.join(__dirname, '..', 'cloudflare');
const BIN = path.join(CFD, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const PORT = +process.env.PG_HTTP_PORT || 8765;
const WPORT = +process.env.PG_WORKERD_PORT || 8799;
if (!fs.existsSync(BIN)) { console.log('WS-WORKERD SKIP (cd cloudflare; npm install)'); process.exit(0); }

const get = (url) => new Promise((r) => { const q = http.get(url, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => r({ status: res.statusCode, body: b })); }); q.on('error', () => r(null)); q.setTimeout(2000, () => { q.destroy(); r(null); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const env = Object.assign({}, process.env, { WRANGLER_SEND_METRICS: 'false', CI: '1' });
  const w = spawn(process.execPath, [BIN, 'dev', '--port', String(WPORT), '--ip', '127.0.0.1', '--var', 'ALLOW_LOCALHOST:1', '--log-level', 'warn'], { cwd: CFD, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let wout = '';
  w.stdout.on('data', (d) => { wout += d; });
  w.stderr.on('data', (d) => { wout += d; });
  const stop = () => { try { w.kill(); } catch (e) { /* ignore */ } };
  let up = null;
  for (let i = 0; i < 120 && !up; i++) { const r = await get(`http://127.0.0.1:${WPORT}/`); if (r && r.status === 200 && /ppodeuk-relay/.test(r.body)) up = r; else await sleep(500); }
  if (!up) { stop(); console.log('WS-WORKERD FAIL wrangler dev did not answer GET / :: ' + wout.slice(-400).replace(/\s+/g, ' ')); process.exit(1); }
  console.log('WS-WORKERD wrangler dev up: ' + up.body);
  const page = `http://localhost:${PORT}/test-net-ws.html?relay=` + encodeURIComponent(`ws://127.0.0.1:${WPORT}`);
  const c = spawn(process.execPath, [path.join(__dirname, 'run-chrome.js'), page, '-', '900', '760', 'rt120000', 'NETWS DONE'], { cwd: path.join(__dirname, '..') });
  let out = '';
  c.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
  c.stderr.on('data', (d) => { out += d; });
  c.on('close', () => {
    stop();
    const m = out.match(/NETWS DONE pass=(\d+) fail=(\d+)/);
    if (m && +m[2] === 0 && +m[1] > 0) console.log('WS-WORKERD OK');
    else console.log('WS-WORKERD FAIL ' + (m ? m[0] : 'no NETWS DONE line'));
    process.exit(m && +m[2] === 0 ? 0 : 1);
  });
})().catch((e) => { console.log('WS-WORKERD FAIL ' + (e && e.message)); process.exit(1); });
