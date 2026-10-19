// Runs headless Chrome on a page under C:/Temp/bogeul and prints its console output.
// Usage: node bogeul/tools/run-chrome.js <page> [out.png|-] [width=900] [height=760] [budgetMs=4000] [doneRegex=DONE]
//   <page> is a name inside C:/Temp/bogeul (e.g. preview.html or test-smoke.html), opened as file://,
//   or a full http(s) URL (e.g. http://localhost:8765/test-net-bc.html served by tools/serve.js), needed by
//   multi-iframe tests (BroadcastChannel / same-origin iframes do not work between file:// documents).
//   budgetMs = a number: virtual time (--virtual-time-budget; timers fast-forward, the run is deterministic-ish).
//   budgetMs = rt<ms> (e.g. rt40000): REAL time over the DevTools protocol, stopping as soon as a console line
//     matches doneRegex or after <ms>. Use it for anything timing-sensitive across documents: under virtual time,
//     BroadcastChannel messages between frames are not tied to the virtual clock (virtual time can run ahead while
//     a message is in flight), so latencies / rtt / sync tolerances measured there are distorted.
//   Prints every console line as "CONSOLE <level>: <message>". Exit code 0 even if the page logs errors.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const [file = 'preview.html', out = '-', w = '900', h = '760', budget = '4000', doneRe = 'DONE'] = process.argv.slice(2);
const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const T = 'C:/Temp/bogeul';
const prof = `${T}/chrome-profile-${process.pid}`;
const url = /^https?:\/\//i.test(file) ? file : `file:///${T}/${file}`;
const shotPath = out.includes(':') ? out : `${T}/${out}`;

if (/^rt\d+$/i.test(budget)) {
  realtime(parseInt(budget.slice(2), 10)).catch((e) => { console.log('run-chrome realtime error: ' + (e && e.message)); process.exit(3); });
} else {
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--hide-scrollbars', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${prof}`, `--window-size=${w},${h}`,
    `--virtual-time-budget=${budget}`, '--enable-logging=stderr', '--v=0'];
  if (out !== '-') args.push(`--screenshot=${shotPath}`);
  else args.push('--dump-dom');
  args.push(url);
  const r = spawnSync(CH, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  const lines = (r.stderr || '').split(/\r?\n/).filter((l) => l.includes(':CONSOLE'));
  for (const l of lines) {
    const m = l.match(/:INFO:CONSOLE[^\]]*\]\s*"(.*)", source:/) || l.match(/CONSOLE[^\]]*\]\s*(.*)$/);
    const lvl = /:ERROR:/.test(l) ? 'error' : /:WARNING:/.test(l) ? 'warn' : 'log';
    console.log(`CONSOLE ${lvl}: ${m ? m[1] : l}`);
  }
  const errs = (r.stderr || '').split(/\r?\n/).filter((l) => /Uncaught|SyntaxError|TypeError|ReferenceError/.test(l));
  for (const e of errs) console.log(`PAGE-ERROR: ${e}`);
  if (out !== '-') console.log(fs.existsSync(shotPath) ? `screenshot: ${shotPath}` : 'screenshot FAILED');
  else console.log('--- DOM length', (r.stdout || '').length);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

// Real-time run over the DevTools protocol (same output format as above).
async function realtime(maxMs) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // (a stale DevToolsActivePort: a killed run's profile under the same - reused - pid would hand over a dead port and the
  // run fails with 'fetch failed' at once; the profile is this pid's own, removed at the end anyway)
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* locked */ }
  try { fs.unlinkSync(prof + '/DevToolsActivePort'); } catch (e) { /* none */ }
  const chrome = spawn(CH, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--hide-scrollbars', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${prof}`, `--window-size=${w},${h}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
  let port = null;
  for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = fs.readFileSync(`${prof}/DevToolsActivePort`, 'utf8').split('\n')[0]; } catch (e) { /* not yet */ } }
  if (!port) { console.log('run-chrome: chrome did not start'); chrome.kill(); process.exit(2); }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0, done = false;
  const pending = new Map(), re = new RegExp(doneRe);
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = m.params.args.map((a) => (a.value !== undefined ? a.value : a.description || '')).join(' ');
      const lvl = m.params.type === 'error' ? 'error' : m.params.type === 'warning' ? 'warn' : 'log';
      console.log(`CONSOLE ${lvl}: ${txt}`);
      if (re.test(txt)) done = true;
    } else if (m.method === 'Inspector.targetCrashed' || m.method === 'Inspector.detached') {
      console.log(`run-chrome: ${m.method} ${JSON.stringify(m.params || {})}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      console.log(`PAGE-ERROR: ${(d.exception && d.exception.description) || d.text} @${d.url || ''}:${d.lineNumber}`);
    }
  });
  // (a lost DevTools connection - the machine slept / went into Modern Standby, Chrome died - is said, and no request
  // after it waits forever: the old run hung on Browser.close until run-all killed it, with no clue why)
  let wsGone = false, closing = false;
  ws.addEventListener('close', (ev) => { const was = wsGone; wsGone = true; if (!was && !closing) { console.log('run-chrome: the DevTools connection closed (' + (ev && ev.code) + ' ' + (ev && ev.reason || '') + ')'); } for (const r of pending.values()) r({}); pending.clear(); });
  const send = (method, params = {}) => new Promise((r) => { if (wsGone) { r({}); return; } const i = ++id; pending.set(i, r); try { ws.send(JSON.stringify({ id: i, method, params })); } catch (e) { pending.delete(i); r({}); } });
  const sendT = (method, params, ms) => Promise.race([send(method, params), sleep(ms).then(() => ({ timeout: true }))]);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Inspector.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  const t0 = Date.now();
  let last = t0;
  while (!done && !wsGone && Date.now() - t0 < maxMs) {
    await sleep(50);
    // (a 50 ms sleep that took > 20 s: this process was frozen - the machine slept or went into standby)
    const now = Date.now(); if (now - last > 20000) console.log(`run-chrome: this process was frozen for ${Math.round((now - last) / 1000)} s (sleep / standby?)`); last = now;
  }
  if (!done) console.log(`run-chrome: no /${doneRe}/ within ${maxMs} ms`);
  await sleep(150);
  if (out !== '-') {
    const r = await sendT('Page.captureScreenshot', { format: 'png' }, 20000);
    if (r && r.result && r.result.data) { fs.writeFileSync(shotPath, Buffer.from(r.result.data, 'base64')); console.log(`screenshot: ${shotPath}`); }
    else console.log('screenshot FAILED');
  }
  closing = true;
  try { await sendT('Browser.close', {}, 5000); } catch (e) { /* ignore */ }
  ws.close();
  chrome.kill();
  for (let i = 0; i < 8; i++) {             // Windows keeps the profile locked for a moment after the kill
    await sleep(300);
    try { fs.rmSync(prof, { recursive: true, force: true }); break; } catch (e) { /* retry */ }
  }
  process.exit(0);
}
