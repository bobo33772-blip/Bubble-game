// Does online play get a relay? Gathers WebRTC ICE candidates in headless Chrome with the ICE servers a deployed page
// (or the relay Worker) hands out and reports how many of each kind came back - a check for after `npx wrangler deploy`
// (CLOUDFLARE-SETUP.md). Needs the internet. Never prints a username, credential, token or key: only server hosts /
// ports / transports, candidate counts and the servers' error codes.
// Usage:
//   node tools/ice-check.js <page URL>                 the deployed game, e.g. https://bubble-c3ad4.web.app/ - its own
//                                                      window.PG_RELAY asks the Worker as a player's page would (the
//                                                      page's real origin); a page without one uses its static list
//   node tools/ice-check.js --relay <Worker URL> [--origin <page origin>]
//                                                      asks <Worker URL>/turn from node with that Origin (default
//                                                      https://bubble-c3ad4.web.app), then gathers with the answer
//   [--ms=8000]  how long to gather            [--json]  one JSON line instead of the text report
// Candidates: host (this machine), srflx (its public address, via STUN), relay (through TURN - what two phones on
// different networks need). Exit code 0 when at least one relay candidate came back, 1 when none, 2 when the page /
// Worker could not be asked.
'use strict';
const fs = require('fs');
const { spawn } = require('child_process');
const { CH, T } = require('./env');

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.findIndex((a) => a === `--${k}` || a.startsWith(`--${k}=`)); if (i < 0) return d; const a = args[i]; return a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[i + 1]; };
const RELAY = flag('relay', null);
const ORIGIN = flag('origin', 'https://bubble-c3ad4.web.app');
const MS = Math.max(1000, parseInt(flag('ms', '8000'), 10) || 8000);
const JSON_OUT = args.includes('--json');
const PAGE = RELAY ? null : args.find((a, i) => !a.startsWith('--') && !['--ms', '--origin', '--relay'].includes(args[i - 1]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!RELAY && !PAGE) { console.log('usage: node tools/ice-check.js <page URL> | --relay <Worker URL> [--origin <origin>] [--ms=8000] [--json]'); process.exit(2); }

// the ICE servers without their secrets: "turns:turn.cloudflare.com:443?transport=tcp (with credential)"
const describe = (list) => (Array.isArray(list) ? list : []).flatMap((e) => [].concat(e && e.urls || []).map((u) => String(u).slice(0, 120) + (e.username || e.credential ? ' (with credential)' : '')));

// gathering, run inside the page (a string: it goes over the DevTools protocol)
const GATHER = `async function __gather(iceServers, ms) {
  const c = { host: 0, srflx: 0, prflx: 0, relay: 0, relayBy: {}, errors: {} };
  let pc;
  try { pc = new RTCPeerConnection({ iceServers }); } catch (e) { return { bad: String(e && e.message || e) }; }
  pc.createDataChannel('ice-check');
  const done = new Promise((res) => {
    pc.onicecandidate = (e) => {
      if (!e.candidate) return res();
      const cd = e.candidate, t = cd.type || (/ typ (\\w+)/.exec(cd.candidate) || [])[1] || '?';
      c[t] = (c[t] || 0) + 1;
      if (t === 'relay') { const k = (cd.relayProtocol || '?') + ' via ' + String(e.url || '?').replace(/\\?.*$/, ''); c.relayBy[k] = (c.relayBy[k] || 0) + 1; }
    };
    pc.onicecandidateerror = (e) => { const k = String(e.url || '?') + ' -> ' + e.errorCode + ' ' + String(e.errorText || '').slice(0, 60); c.errors[k] = (c.errors[k] || 0) + 1; };
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') res(); };
    setTimeout(res, ms);
  });
  await pc.setLocalDescription(await pc.createOffer());
  await done;
  c.state = pc.iceGatheringState;
  pc.close();
  return c;
}`;

(async () => {
  const report = { mode: RELAY ? 'relay' : 'page', target: RELAY || PAGE };
  let servers = null;
  // ---- --relay: ask the Worker from node (the list never leaves this process but for Chrome's DevTools socket)
  if (RELAY) {
    const url = RELAY.replace(/\/+$/, '') + '/turn';
    let res = null, body = null;
    try { res = await fetch(url, { headers: { Origin: ORIGIN }, signal: AbortSignal.timeout(10000) }); body = await res.json().catch(() => null); } catch (e) { report.error = 'the Worker did not answer: ' + (e && e.message || e); }
    report.origin = ORIGIN; report.status = res ? res.status : 0;
    report.allowOrigin = res ? res.headers.get('access-control-allow-origin') : null;
    if (res && res.status !== 200) report.error = `the Worker answered ${res.status} ${body && body.error ? body.error + ' (' + (body.message || '') + ')' : ''}`.trim();
    else if (body) { servers = body.iceServers; report.ttl = body.ttl; report.source = 'relay'; }
    if (!servers) { print(report); process.exit(2); }
  }
  // ---- headless Chrome over the DevTools protocol
  const prof = `${T}/ice-check-${process.pid}`;
  fs.rmSync(prof, { recursive: true, force: true });
  const chrome = spawn(CH, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-sandbox', '--mute-audio', `--user-data-dir=${prof}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
  let port = null;
  for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = fs.readFileSync(`${prof}/DevToolsActivePort`, 'utf8').split('\n')[0]; } catch (e) { /* not yet */ } }
  if (!port) { report.error = 'chrome did not start (PG_CHROME=<chrome binary>)'; print(report); chrome.kill(); process.exit(2); }
  let code = 2;
  let ws = null;
  try {
    const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    let id = 0; const pending = new Map();
    ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
    const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
    const evalp = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: `(async () => { ${GATHER}\n${expr} })()`, awaitPromise: true, returnByValue: true });
      if (r.error) throw new Error(r.error.message || 'DevTools error');
      if (r.result && r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text);
      return r.result && r.result.result ? r.result.result.value : null;
    };
    await send('Runtime.enable'); await send('Page.enable');
    let out;
    if (RELAY) {
      out = await evalp(`return { c: await __gather(${JSON.stringify(servers)}, ${MS}) };`);
    } else {
      await send('Page.navigate', { url: PAGE });
      // (the page's own relay client, as a player's page asks: its origin, its fallback; asked again when the page went
      // on to another address under the question - the first visit's web.app -> firebaseapp.com hop)
      const ask = (expr) => evalp(expr).catch(async (e) => { if (!/context|navigat|destroyed/i.test(e.message)) throw e; await sleep(2000); return evalp(expr); });
      out = await ask(`for (let i = 0; i < 300 && !(window.PG && window.PG.Net); i++) await new Promise((r) => setTimeout(r, 50));
        if (!(window.PG && window.PG.Net)) return { bad: 'the game did not load at this address' };
        const po = window.PG_PEER_OPTIONS && window.PG_PEER_OPTIONS.config && Array.isArray(window.PG_PEER_OPTIONS.config.iceServers) ? window.PG_PEER_OPTIONS.config.iceServers : null;
        const r = window.PG_RELAY ? await window.PG_RELAY.ice() : { iceServers: po || [{ urls: 'stun:stun.l.google.com:19302' }], source: po ? 'static (this page has no relay)' : 'PeerJS defaults (no relay, no static list)' };
        return { origin: location.origin, relayUrl: window.PG_RELAY ? window.PG_RELAY.url : null, source: r.source, servers: r.iceServers, c: await __gather(r.iceServers, ${MS}) };`);
      if (out && !out.bad) { report.origin = out.origin; report.relayUrl = out.relayUrl; report.source = out.source; servers = out.servers; }
    }
    if (!out || out.bad || (out.c && out.c.bad)) report.error = (out && (out.bad || out.c.bad)) || 'no answer from the page';
    else {
      report.servers = describe(servers);
      report.candidates = { host: out.c.host, srflx: out.c.srflx, prflx: out.c.prflx, relay: out.c.relay };
      report.relayBy = out.c.relayBy; report.serverErrors = out.c.errors; report.gathering = out.c.state;
      code = out.c.relay > 0 ? 0 : 1;
    }
  } catch (e) { report.error = String(e && e.message || e); }
  finally {
    try { if (ws) ws.close(); } catch (e) { /* ignore */ }
    chrome.kill();
    await sleep(300);
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
  print(report, code);
  process.exit(code);
})().catch((e) => { console.log('ice-check error ' + (e && e.message || e)); process.exit(2); });

function print(r, code) {
  if (JSON_OUT) { console.log(JSON.stringify(r)); return; }
  console.log(`ICE CHECK ${r.mode === 'relay' ? 'Worker ' + r.target + ' (Origin ' + r.origin + ')' : 'page ' + r.target}`);
  if (r.status !== undefined) console.log(`  Worker answer   ${r.status}${r.allowOrigin ? ' (CORS ok for ' + r.allowOrigin + ')' : ''}${r.ttl ? ', ttl ' + r.ttl + ' s' : ''}`);
  if (r.origin && r.mode === 'page') console.log(`  page origin     ${r.origin}${r.relayUrl ? ', relay ' + r.relayUrl : ', no relay in this build'}`);
  if (r.source) console.log(`  ICE list from   ${r.source}`);
  if (r.servers) for (const s of r.servers) console.log(`  server          ${s}`);
  if (r.candidates) console.log(`  candidates      host ${r.candidates.host}, srflx ${r.candidates.srflx}, prflx ${r.candidates.prflx}, relay ${r.candidates.relay} (gathering ${r.gathering})`);
  for (const [k, n] of Object.entries(r.relayBy || {})) console.log(`  relay           ${n} x ${k}`);
  for (const [k, n] of Object.entries(r.serverErrors || {})) console.log(`  server error    ${n} x ${k}`);
  if (r.error) console.log(`  ERROR           ${r.error}`);
  console.log(code === 0 ? 'ICE OK: relay candidates came back - phones on different networks can connect through TURN' : code === 1 ? 'ICE NO RELAY: no relay candidate (only direct / STUN) - see the server errors above' : 'ICE CHECK FAILED');
}
