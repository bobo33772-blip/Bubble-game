// Real headless-Chrome test of PG.Net's 'ws' transport over REAL WebSockets (built to C:/Temp/bogeul/test-net-ws.html):
// same-origin iframes of preview.html?net=ws&relay=ws://<this host>/ws talk through tools/serve.js's local relay
// (tools/ws-relay.js: an RFC 6455 server mounting the real cloudflare/src/room.js behind the real gate - design/relay.md
// 11.3). Run it with the suite (job net-ws), or by hand:
//   node bogeul/build.js && node bogeul/tools/serve.js
//   node bogeul/tools/run-chrome.js http://localhost:8765/test-net-ws.html - 900 760 rt120000 "NETWS DONE"
// ?relay=ws://127.0.0.1:8799 (the ws-workerd job: `wrangler dev`, Cloudflare's own runtime on this PC): the same page
// against that relay; the phases that need the local relay's admin routes (kill, restart) are skipped there.
// Phase A: 2 frames, a clean link: host / taken / join / rosters, every state in order, reliable both ways, rtt, the host
// leaving. Phase B: 4 frames on lat=40&jit=20 (each page delays its own socket, in order, never dropping) + a 5th that
// gets full and a wrong code: states (all of them, in order), reliable broadcast / direct streams, guest -> guest, rtt,
// a guest leaving, admin kill -> everyone lost. Phase C: the 7th socket -> full (the relay's cap), admin restart ->
// every room lost.
// Prints "NETWS PASS|FAIL <name>", "NETWS METRIC <name> <value>" and "NETWS DONE pass=N fail=M".
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const LOCAL = !Q.get('relay');
  const RELAY = Q.get('relay') || 'ws://' + location.host + '/ws';
  const NETQ = 'net=ws&relay=' + encodeURIComponent(RELAY);
  let pass = 0, fail = 0;
  const ok = (name, cond, info) => {
    if (cond) { pass++; console.log('NETWS PASS ' + name); } else { fail++; console.log('NETWS FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); }
    return !!cond;
  };
  const metric = (name, v) => console.log('NETWS METRIC ' + name + ' ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clock = () => performance.now();
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const pct = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const r1 = (v) => Math.round(v * 10) / 10;
  window.addEventListener('error', (e) => { fail++; console.log('NETWS page error: ' + e.message); });
  async function attempt(p) { try { return { value: await p }; } catch (e) { return { error: e }; } }
  async function until(pred, ms) { const t0 = clock(); while (!pred()) { if (clock() - t0 > ms) return false; await sleep(20); } return true; }
  const admin = (p) => fetch('/ws-admin/' + p, { cache: 'no-store' }).then((r) => r.json());

  const frames = [];
  function frame(i, query) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'preview.html?' + NETQ + (query ? '&' + query : '') + '&frame=' + i;
      f.title = 'net test ' + i;
      f.style.cssText = 'position:fixed;top:' + (i * 6) + 'px;left:' + (i * 6) + 'px;width:256px;height:224px;border:0;opacity:0.05;pointer-events:none;z-index:9';
      const t = setTimeout(() => reject(new Error('frame ' + i + ' did not load')), 20000);
      f.onload = () => {
        clearTimeout(t);
        const w = f.contentWindow;
        if (!w || !w.PG || !w.PG.Net) { reject(new Error('frame ' + i + ' has no PG.Net')); return; }
        const fr = { i, el: f, w, Net: w.PG.Net };
        frames.push(fr);
        resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  function rec(s) {
    const r = { msgs: [], states: [], status: [], peers: 0 };
    s.onMessage((from, m) => r.msgs.push({ from, m, at: clock() }));
    s.onState((from, o) => r.states.push({ from, o, at: clock() }));
    s.onStatus((k, d) => r.status.push(k + ':' + d));
    s.onPeers(() => { r.peers++; });
    return r;
  }
  const seq = (r, from, key) => r.msgs.filter((x) => x.from === from && x.m && x.m.k === key).map((x) => x.m.i);
  async function stream(s, to, key, n, burst, gapMs) {
    let sent = 0;
    for (let i = 0; i < n; i++) {
      if (s.send(to, { k: key, i, at: clock() })) sent++;
      if (i % burst === burst - 1) await sleep(gapMs);
    }
    return sent;
  }

  async function phaseA() {
    const [A, B] = await Promise.all([frame(0), frame(1)]);
    const tr = await A.Net.transports();
    ok('A: preview.html with ?relay= (no PG_RELAY): transports().ws true', tr.ws === true && tr.room === false && tr.peer === false, tr);
    ok('A: fromQuery -> {ws, no simulation, the relay}', same(A.Net.fromQuery(), { transport: 'ws', net: null, relay: RELAY.toLowerCase() }), A.Net.fromQuery());
    const h = await A.Net.host({ transport: 'ws' });
    ok('A: host gets a 4-char code and a relay seat id', /^[a-z0-9]{4}$/.test(h.code) && /^s[a-z0-9]{11}$/.test(h.selfId) && h.transport === 'ws', [h.code, h.selfId]);
    const tk = await attempt(B.Net.host({ transport: 'ws', code: h.code }));
    ok('A: hosting the same code explicitly -> unavailable (taken: 4409)', tk.error && tk.error.code === 'unavailable' && tk.error.reason === 'taken', tk.error && [tk.error.code, tk.error.reason]);
    const t0 = clock();
    const g = (await attempt(B.Net.join({ transport: 'ws', code: h.code }))).value;
    ok('A: guest joins', !!g);
    if (!g) return;
    metric('A.join_ms', r1(clock() - t0));
    const hr = rec(h), gr = rec(g);
    ok('A: rosters agree', same(h.peers().map((p) => p.id), g.peers().map((p) => p.id)) && h.peers().length === 2);
    for (let t = 0; t < 40; t++) { h.setState({ t, at: clock() }); g.setState({ g: t }); await sleep(40); }
    await Promise.all([stream(h, '*', 'a', 100, 10, 30), stream(g, h.selfId, 'b', 100, 10, 30)]);
    await until(() => seq(gr, h.selfId, 'a').length >= 100 && seq(hr, g.selfId, 'b').length >= 100, 5000);
    const sa = gr.states.filter((x) => x.from === h.selfId);
    const distinct = (a, k) => Array.from(new Set(a.map((x) => x.o[k])));
    ok('A: every state delivered, in order (a TCP stream drops nothing)', same(distinct(sa, 't'), range(40)) && sa.every((x, i) => i === 0 || x.o.t >= sa[i - 1].o.t), sa.length);
    ok('A: guest states reach the host', same(distinct(hr.states, 'g'), range(40)), hr.states.length);
    ok('A: reliable both ways, in order, once', same(seq(gr, h.selfId, 'a'), range(100)) && same(seq(hr, g.selfId, 'b'), range(100)));
    metric('A.state_latency_ms', { mean: r1(mean(sa.map((x) => x.at - x.o.at))), p95: r1(pct(sa.map((x) => x.at - x.o.at), 0.95)) });
    await sleep(2500);
    ok('A: rtt measured', typeof g.stats().rttMs === 'number' && g.stats().transport === 'ws', g.stats());
    metric('A.rtt_ms', g.stats().rttMs);
    h.leave();
    await until(() => gr.status.includes('closed:host_left'), 3000);
    ok('A: host leaving -> guest closed:host_left', gr.status.includes('closed:host_left'), gr.status);
  }

  async function phaseB() {
    const L = 'lat=40&jit=20';
    const F = await Promise.all([frame(2, L), frame(3, L), frame(4, L), frame(5, L), frame(6, L)]);
    const [FH, F1, F2, F3, F5] = F;
    ok('B: ?net=ws&relay=..&lat=40&jit=20 parsed in every frame', F.every((f) => same(f.Net.fromQuery().net, { latency: 40, jitter: 20, drop: 0 })), FH.Net.fromQuery());
    const h = await FH.Net.host({ transport: 'ws' });
    const hr = rec(h);
    const gs = [], rs = [];
    for (const f of [F1, F2, F3]) {
      const t0 = clock();
      const a = await attempt(f.Net.join({ transport: 'ws', code: h.code }));
      ok('B: frame ' + f.i + ' joins', !!a.value, a.error && a.error.code);
      if (!a.value) return;
      metric('B.join_ms.f' + f.i, r1(clock() - t0));
      gs.push(a.value);
      rs.push(rec(a.value));
    }
    const [g1, g2, g3] = gs;
    await sleep(600);
    ok('B: 4 rosters agree (ids, slots)', gs.every((g) => same(g.peers().map((p) => [p.id, p.slot]), h.peers().map((p) => [p.id, p.slot]))) && h.peers().length === 4, h.peers());
    const full = await attempt(F5.Net.join({ transport: 'ws', code: h.code }));
    ok('B: a 5th player gets full', full.error && full.error.code === 'full', full.error && full.error.code);
    const nf = await attempt(F5.Net.join({ transport: 'ws', code: 'zz99' }));
    ok('B: a wrong code gets not_found (4404)', nf.error && nf.error.code === 'not_found', nf.error && nf.error.code);

    const N = 75;
    for (let t = 0; t < N; t++) { h.setState({ t, at: clock() }); g1.setState({ t, at: clock() }); await sleep(40); }
    await sleep(800);
    const fromH = rs.map((r) => r.states.filter((x) => x.from === h.selfId));
    const ratios = fromH.map((a) => new Set(a.map((x) => x.o.t)).size / N);
    metric('B.state_delivery_host_to_guests', ratios.map((v) => r1(v * 100) + '%').join(' '));
    ok('B: every state reaches every guest (delays only, no loss), in order', ratios.every((v) => v === 1) && fromH.every((a) => a.every((x, i) => i === 0 || x.o.t >= a[i - 1].o.t)), ratios);
    const lat = [].concat(...fromH.map((a) => a.map((x) => x.at - x.o.at)));
    metric('B.state_latency_ms', { mean: r1(mean(lat)), p50: r1(pct(lat, 0.5)), p95: r1(pct(lat, 0.95)), max: r1(Math.max(...lat)) });
    ok('B: one-way state latency ~ 2 x (40 + U(0,20)) ms (+ the local relay)', mean(lat) > 80 && mean(lat) < 200, r1(mean(lat)));
    const g2g = rs[1].states.filter((x) => x.from === g1.selfId);
    ok('B: guest -> guest states through the relay (stamped with the sender)', new Set(g2g.map((x) => x.o.t)).size === N, g2g.length);
    ok('B: guest states reach the host', new Set(hr.states.filter((x) => x.from === g1.selfId).map((x) => x.o.t)).size === N);

    const sentDirect = [];
    await Promise.all([
      stream(h, '*', 'hb', 150, 5, 50),
      stream(g1, '*', 'g1b', 60, 3, 50),
      stream(g3, h.selfId, 'g3h', 60, 3, 50),
      (async () => { for (let i = 0; i < 30; i++) { sentDirect.push(h.send(g2.selfId, { k: 'h2', i, at: clock() })); if (i % 3 === 2) await sleep(50); } })(),
    ]);
    const done = await until(() => rs.every((r) => seq(r, h.selfId, 'hb').length >= 150) && seq(hr, g3.selfId, 'g3h').length >= 60 &&
      seq(rs[1], h.selfId, 'h2').length >= 30 && seq(rs[2], g1.selfId, 'g1b').length >= 60 && seq(hr, g1.selfId, 'g1b').length >= 60, 10000);
    await sleep(500);
    ok('B: reliable streams complete', done, rs.map((r) => seq(r, h.selfId, 'hb').length));
    ok('B: host broadcast: every guest, all 150, in order, once', rs.every((r) => same(seq(r, h.selfId, 'hb'), range(150))));
    ok('B: guest broadcast: host + other guests, in order, once', same(seq(hr, g1.selfId, 'g1b'), range(60)) && same(seq(rs[1], g1.selfId, 'g1b'), range(60)) && same(seq(rs[2], g1.selfId, 'g1b'), range(60)) && seq(rs[0], g1.selfId, 'g1b').length === 0);
    ok('B: guest -> host direct, nobody else', same(seq(hr, g3.selfId, 'g3h'), range(60)) && rs.every((r) => seq(r, g3.selfId, 'g3h').length === 0));
    ok('B: host -> one guest direct, only that guest', sentDirect.every(Boolean) && same(seq(rs[1], h.selfId, 'h2'), range(30)) && seq(rs[0], h.selfId, 'h2').length === 0 && seq(rs[2], h.selfId, 'h2').length === 0);
    await sleep(2500);
    const rtts = gs.map((g) => g.stats().rttMs);
    metric('B.rtt_ms', rtts.concat([h.stats().rttMs]));
    ok('B: rtt measured, ~ 2 x one-way', rtts.every((v) => typeof v === 'number' && v > 140 && v < 600), rtts);
    ok('B: everyone connected, nobody unstable', gs.every((g) => g.stats().connected) && h.stats().connected, gs.map((g) => g.stats()));
    g3.leave();
    await until(() => h.peers().length === 3 && g1.peers().length === 3 && g2.peers().length === 3, 3000);
    ok('B: a guest leaving -> 3 players everywhere, it saw closed:left', h.peers().length === 3 && g1.peers().length === 3 && rs[2].status.includes('closed:left'), [h.peers().length, rs[2].status]);
    if (!LOCAL) { h.leave(); return; }
    const k = await admin('kill?code=' + h.code);
    await until(() => hr.status.includes('closed:lost') && rs[0].status.includes('closed:lost') && rs[1].status.includes('closed:lost'), 15000);
    ok('B: admin kill (the network gone under the room, 1006) -> host and guests closed:lost', k.killed >= 3 && hr.status.includes('closed:lost') && rs[0].status.includes('closed:lost') && rs[1].status.includes('closed:lost'), [k, hr.status, rs[0].status]);
  }

  async function phaseC() {
    const F = await Promise.all([frame(7), frame(8), frame(9), frame(10), frame(11)]);
    const h = await F[0].Net.host({ transport: 'ws' });
    const gs = [];
    for (const f of F.slice(1, 4)) gs.push((await attempt(f.Net.join({ transport: 'ws', code: h.code }))).value);
    ok('C: a room of 4', gs.every(Boolean) && h.peers().length === 4);
    // two sockets that just sit there (strangers): 6 in the room
    const raw = [0, 1].map(() => new WebSocket(RELAY + '/r/w/' + h.code + '?v=1&role=g'));
    await until(() => raw.every((w) => w.readyState === 1), 4000);
    const seven = await attempt(F[4].Net.join({ transport: 'ws', code: h.code }));
    ok('C: the 7th socket -> full (the relay holds 6: 4 players + 2 spare)', seven.error && seven.error.code === 'full', seven.error && seven.error.code);
    for (const w of raw) w.close();
    if (!LOCAL) { h.leave(); return; }
    const rs = [rec(h)].concat(gs.map(rec));
    const other = await F[4].Net.host({ transport: 'ws' });
    const ro = rec(other), oid = other.selfId;
    const rr = await admin('restart');
    await until(() => rs.every((r) => r.status.includes('closed:lost')), 15000);
    ok('C: admin restart (every socket 1012: a redeploy) -> a room with players closed:lost everywhere', rr.closed >= 5 && rs.every((r) => r.status.includes('closed:lost')), rs.map((r) => r.status));
    await sleep(1500);
    const info = await admin('info');
    ok('C: ... a host still alone re-seats into the fresh relay with its old id (its room and code live on)', !ro.status.some((x) => /closed/.test(x)) && info.rooms['w:' + other.code] && info.rooms['w:' + other.code].host === oid, [ro.status, info.rooms]);
    other.leave();
  }

  async function main() {
    if (location.protocol === 'file:') { ok('served over http (tools/serve.js)', false, location.href); return; }
    if (LOCAL) { let info = null; try { info = await admin('info'); } catch (e) { info = null; } if (!ok('the local relay answers /ws-admin/info (tools/serve.js with tools/ws-relay.js)', !!(info && info.rooms))) return; }
    try { await phaseA(); } catch (e) { ok('phase A crashed', false, String(e && e.stack || e)); }
    try { await phaseB(); } catch (e) { ok('phase B crashed', false, String(e && e.stack || e)); }
    try { await phaseC(); } catch (e) { ok('phase C crashed', false, String(e && e.stack || e)); }
  }
  const go = () => main().then(() => console.log('NETWS DONE pass=' + pass + ' fail=' + fail));
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
})();
