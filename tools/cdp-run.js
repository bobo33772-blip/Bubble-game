// Real-time headless Chrome runner over the DevTools protocol (no virtual time, so requestAnimationFrame
// runs at a normal 60 fps and real input events can be dispatched). Also emulates true phone viewports.
// Usage: node bogeul/tools/cdp-run.js <file in C:/Temp/bogeul[#hash] | http(s) url> [out.png|-] [w=900] [h=760] [maxMs=20000] [doneRegex=DONE] [mobile=0]
// Prints "CONSOLE <level>: <text>" and "PAGE-ERROR: <text>" lines; stops when a console line matches doneRegex.
const { spawn } = require('child_process');
const fs = require('fs');
const [file = 'preview.html', out = '-', w = '900', h = '760', maxMs = '20000', doneRe = 'DONE', mobile = '0'] = process.argv.slice(2);
const { CH, T } = require('./env');
const prof = `${T}/cdp-profile-${process.pid}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // (a stale DevToolsActivePort: a killed run's profile under the same - reused - pid would hand over a dead port and the
  // run fails with 'fetch failed' at once; the profile is this pid's own, removed at the end anyway)
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* locked */ }
  try { fs.unlinkSync(prof + '/DevToolsActivePort'); } catch (e) { /* none */ }
  const chrome = spawn(CH, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--hide-scrollbars', '--mute-audio',
    '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${prof}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
  let port = null;
  for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = fs.readFileSync(`${prof}/DevToolsActivePort`, 'utf8').split('\n')[0]; } catch (e) { /* not yet */ } }
  if (!port) { console.log('cdp: chrome did not start'); chrome.kill(); process.exit(2); }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  let done = false; const re = new RegExp(doneRe);
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = m.params.args.map((a) => (a.value !== undefined ? a.value : a.description || '')).join(' ');
      console.log(`CONSOLE ${m.params.type}: ${txt}`);
      if (re.test(txt)) done = true;
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails; console.log(`PAGE-ERROR: ${(d.exception && d.exception.description) || d.text} @${d.url || ''}:${d.lineNumber}`);
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/\/favicon\.ico$/.test(m.params.entry.url || '')) { // (an http page's missing favicon is no page error)
      console.log(`CONSOLE log-error: ${m.params.entry.text} ${m.params.entry.url || ''}`);
    }
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: mobile === '1' });
  if (mobile === '1') await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // (PG_CDP_INSETS='{"left":47,"right":47,"bottom":21}': a phone's notch / home-indicator safe-area insets)
  if (process.env.PG_CDP_INSETS) await send('Emulation.setSafeAreaInsetsOverride', { insets: JSON.parse(process.env.PG_CDP_INSETS) });
  // (a full http(s) URL too: the multi-iframe pages served by tools/serve.js, on a phone viewport)
  await send('Page.navigate', { url: /^https?:\/\//i.test(file) ? file : require('./env').fileUrl(file) });
  const t0 = Date.now();
  while (!done && Date.now() - t0 < +maxMs) await sleep(100);
  if (!done) console.log(`cdp: timeout after ${maxMs} ms`);
  await sleep(150);
  if (out !== '-') {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const p = require('./env').inT(out);
    fs.writeFileSync(p, Buffer.from(r.result.data, 'base64'));
    console.log(`screenshot: ${p}`);
  }
  try { await send('Browser.close'); } catch (e) { /* ignore */ }
  ws.close(); chrome.kill();
  await sleep(300);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(0);
})().catch((e) => { console.log('cdp error ' + e.message); process.exit(3); });
