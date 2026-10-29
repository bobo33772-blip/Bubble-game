// Real headless-Chrome test of PG.Net's 'bc' transport (built to C:/Temp/bogeul/test-net-bc.html). This page embeds
// same-origin iframes of preview.html and drives the PG.Net of each one. It needs a real http origin:
//   node bogeul/build.js
//   node bogeul/tools/serve.js                     (keep it running: http://localhost:8765, root C:/Temp/bogeul)
//   node bogeul/tools/run-chrome.js http://localhost:8765/test-net-bc.html - 900 760 rt60000 "NETBC DONE"
// (rt = REAL time: under --virtual-time-budget, BroadcastChannel messages between frames are not tied to the
// virtual clock, so latency / rtt numbers come out wrong there; ordering and delivery checks still hold.)
// Phase A: 2 frames on a clean link (?net=bc). Phase B: 4 frames on ?net=bc&lat=60&jit=40&drop=0.2 (the query-string
// network simulation, applied on both ends of every link) + a 5th frame that must get 'full' and a wrong code that must
// get 'not_found'. Measures state delivery ratio / ordering / latency (host -> guests and guest -> guest), reliable
// messages exactly once and in order (broadcast, direct), rtt, then a guest leaving and the host leaving.
// All times come from THIS page's clock (the callbacks run here), so cross-frame numbers are comparable.
// Prints "NETBC PASS|FAIL <name>", "NETBC METRIC <name> <value>" and "NETBC DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const ok = (name, cond, info) => {
    if (cond) { pass++; console.log('NETBC PASS ' + name); } else { fail++; console.log('NETBC FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); }
    return !!cond;
  };
  const metric = (name, v) => console.log('NETBC METRIC ' + name + ' ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clock = () => performance.now();
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const pct = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const r1 = (v) => Math.round(v * 10) / 10;
  window.addEventListener('error', (e) => { fail++; console.log('NETBC page error: ' + e.message); });
  async function attempt(p) { try { return { value: await p }; } catch (e) { return { error: e }; } }
  async function until(pred, ms) { const t0 = clock(); while (!pred()) { if (clock() - t0 > ms) return false; await sleep(20); } return true; }

  const frames = [];
  function frame(i, query) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'preview.html?' + query + '&frame=' + i;
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
  // record everything a session hears, timestamped on this page's clock
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
    const [A, B] = await Promise.all([frame(0, 'net=bc'), frame(1, 'net=bc')]);
    const tr = await A.Net.transports();
    ok('A: iframes on http expose PG.Net with BroadcastChannel', tr.bc === true && tr.room === false && tr.peer === false, tr);
    ok('A: ?net=bc -> fromQuery transport bc, no simulation', same(A.Net.fromQuery(), { transport: 'bc', net: null, relay: null }), A.Net.fromQuery());
    const h = await A.Net.host({ transport: 'bc' });
    ok('A: host gets a 4-char code', /^[a-z0-9]{4}$/.test(h.code), h.code);
    const t0 = clock();
    const g = (await attempt(B.Net.join({ transport: 'bc', code: h.code }))).value;
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
    ok('A: clean link: every state delivered, in order', same(distinct(sa, 't'), range(40)) && sa.every((x, i) => i === 0 || x.o.t >= sa[i - 1].o.t), sa.length);
    ok('A: clean link: guest states reach the host', same(distinct(hr.states, 'g'), range(40)), hr.states.length);
    ok('A: clean link: reliable both ways, in order, once', same(seq(gr, h.selfId, 'a'), range(100)) && same(seq(hr, g.selfId, 'b'), range(100)));
    metric('A.state_latency_ms', { mean: r1(mean(sa.map((x) => x.at - x.o.at))), p95: r1(pct(sa.map((x) => x.at - x.o.at), 0.95)) });
    h.leave();
    await until(() => gr.status.includes('closed:host_left'), 3000);
    ok('A: host leaving -> guest closed:host_left', gr.status.includes('closed:host_left'), gr.status);
  }

  async function phaseB() {
    const Q = 'net=bc&lat=60&jit=40&drop=0.2';
    const F = await Promise.all([frame(2, Q), frame(3, Q), frame(4, Q), frame(5, Q), frame(6, Q)]);
    const [FH, F1, F2, F3, F5] = F;
    ok('B: ?net=bc&lat=60&jit=40&drop=0.2 parsed in every frame', F.every((f) => same(f.Net.fromQuery(), { transport: 'bc', net: { latency: 60, jitter: 40, drop: 0.2 }, relay: null })), FH.Net.fromQuery());
    const h = await FH.Net.host({ transport: 'bc' });
    const hr = rec(h);
    const gs = [], rs = [];
    for (const f of [F1, F2, F3]) {
      const t0 = clock();
      const a = await attempt(f.Net.join({ transport: 'bc', code: h.code }));
      ok('B: frame ' + f.i + ' joins over the lossy link', !!a.value, a.error && a.error.code);
      if (!a.value) return;
      metric('B.join_ms.f' + f.i, r1(clock() - t0));
      gs.push(a.value);
      rs.push(rec(a.value));
    }
    const [g1, g2, g3] = gs;
    await sleep(600);
    ok('B: 4 rosters agree (ids, slots)', gs.every((g) => same(g.peers().map((p) => [p.id, p.slot]), h.peers().map((p) => [p.id, p.slot]))) && h.peers().length === 4, h.peers());
    const full = await attempt(F5.Net.join({ transport: 'bc', code: h.code }));
    ok('B: a 5th player gets full', full.error && full.error.code === 'full', full.error && full.error.code);
    const nf = await attempt(F5.Net.join({ transport: 'bc', code: 'zz99' }));
    ok('B: a wrong code gets not_found', nf.error && nf.error.code === 'not_found', nf.error && nf.error.code);

    // states at 25 Hz (slower than the 30 Hz coalescing, so every call is one send) for 3 s
    const N = 75;
    for (let t = 0; t < N; t++) { h.setState({ t, at: clock() }); g1.setState({ t, at: clock() }); await sleep(40); }
    await sleep(800);
    const fromH = rs.map((r) => r.states.filter((x) => x.from === h.selfId));
    const ratios = fromH.map((a) => new Set(a.map((x) => x.o.t)).size / N);
    metric('B.state_delivery_host_to_guests', ratios.map((v) => r1(v * 100) + '%').join(' '));
    ok('B: state delivery ratio ~ 0.8 x 0.8 (drop on both ends)', ratios.every((v) => v > 0.45 && v < 0.82), ratios);
    ok('B: states never arrive older-after-newer (a repeat of the latest is fine)', fromH.every((a) => a.every((x, i) => i === 0 || x.o.t >= a[i - 1].o.t)));
    const lat = [].concat(...fromH.map((a) => a.map((x) => x.at - x.o.at)));
    metric('B.state_latency_ms', { mean: r1(mean(lat)), p50: r1(pct(lat, 0.5)), p95: r1(pct(lat, 0.95)), max: r1(Math.max(...lat)) });
    ok('B: one-way state latency ~ 2 x (60 + U(0,40)) ms', mean(lat) > 120 && mean(lat) < 260, r1(mean(lat)));
    const g2g = rs[1].states.filter((x) => x.from === g1.selfId);
    const g2gN = new Set(g2g.map((x) => x.o.t)).size;
    metric('B.state_delivery_guest_to_guest', r1(100 * g2gN / N) + '%');
    ok('B: guest -> guest states flow (bc is a broadcast: no relay)', g2gN / N > 0.45 && g2g.every((x, i) => i === 0 || x.o.t >= g2g[i - 1].o.t), g2gN);
    ok('B: guest states reach the host', hr.states.filter((x) => x.from === g1.selfId).length / N > 0.45);

    // reliable traffic, all at once
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
    ok('B: guest -> host direct, in order, once, nobody else', same(seq(hr, g3.selfId, 'g3h'), range(60)) && rs.every((r) => seq(r, g3.selfId, 'g3h').length === 0));
    ok('B: host -> one guest direct, only that guest', sentDirect.every(Boolean) && same(seq(rs[1], h.selfId, 'h2'), range(30)) && seq(rs[0], h.selfId, 'h2').length === 0 && seq(rs[2], h.selfId, 'h2').length === 0);
    const relLat = [].concat(...rs.map((r) => r.msgs.filter((x) => x.from === h.selfId && x.m.k === 'hb').map((x) => x.at - x.m.at)));
    metric('B.reliable_latency_ms', { mean: r1(mean(relLat)), p95: r1(pct(relLat, 0.95)), max: r1(Math.max(...relLat)) });
    ok('B: reliable latency bounded (no loss means no retransmit delay on bc)', mean(relLat) > 120 && pct(relLat, 0.95) < 400, r1(mean(relLat)));
    await sleep(2500);
    const rtts = gs.map((g) => g.stats().rttMs);
    metric('B.rtt_ms', rtts.concat([h.stats().rttMs]));
    ok('B: rtt measured, ~ 2 x one-way', rtts.every((v) => typeof v === 'number' && v > 220 && v < 700) && typeof h.stats().rttMs === 'number', rtts);
    ok('B: everyone connected, nobody unstable', gs.every((g) => g.stats().connected) && h.stats().connected, gs.map((g) => g.stats()));

    // leaving
    g3.leave();
    await until(() => h.peers().length === 3 && g1.peers().length === 3 && g2.peers().length === 3, 3000);
    ok('B: a guest leaving -> 3 players everywhere', h.peers().length === 3 && g1.peers().length === 3 && g2.peers().length === 3, [h.peers().length, g1.peers().length]);
    ok('B: the leaver saw closed:left', rs[2].status.includes('closed:left'), rs[2].status);
    h.leave();
    await until(() => rs[0].status.includes('closed:host_left') && rs[1].status.includes('closed:host_left'), 4000);
    ok('B: the host leaving -> remaining guests closed:host_left', rs[0].status.includes('closed:host_left') && rs[1].status.includes('closed:host_left'), [rs[0].status, rs[1].status]);
    ok('B: no unexpected unstable/lost status on a 20%-loss link', rs.every((r) => !r.status.includes('closed:lost')), rs.map((r) => r.status));
  }

  async function main() {
    if (location.protocol === 'file:') {
      ok('served over http (run tools/serve.js and open http://localhost:8765/test-net-bc.html)', false, location.href);
      return;
    }
    try { await phaseA(); } catch (e) { ok('phase A crashed', false, String(e && e.stack || e)); }
    try { await phaseB(); } catch (e) { ok('phase B crashed', false, String(e && e.stack || e)); }
  }
  const go = () => main().then(() => console.log('NETBC DONE pass=' + pass + ' fail=' + fail));
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
})();
