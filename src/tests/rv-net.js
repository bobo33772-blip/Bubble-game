// Netcode review driver (independent reviewer): attacks PG.Net + the engine's online layer with 2-4 same-origin iframes of
// preview.html on the 'bc' transport (simulated network) and a fake 'room' runtime. Orchestration only.
//   node bogeul/tools/serve.js           (http://localhost:8765, root C:/Temp/bogeul)
//   node bogeul/tools/run-chrome.js "http://localhost:8765/test-rv-net.html?only=harsh" - 1200 900 rt600000 "RVNET DONE"
// Phases (?only=a,b): harsh, hitch, freeze, burst, join2, hostboss, gleave, snap, hostile, hostilehost, room, roomflap, trapfair
// Link for bc frames: ?link=lat=..%26jit=..%26drop=.. (per page; PG.Net applies it on both ends of every link).
// Prints "RVNET PASS|FAIL <name>", "RVNET METRIC <name> <json>", "RVNET DONE pass=N fail=M".
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const LINK = Q.get('link') || 'lat=25&jit=30&drop=0.025';
  // the game's wire version (game.js NET_V; 4 since the character kits): the hostile bodies / snapshots / presence states
  // below carry it so they reach the parsers - with the old 3 every one was dropped at the version gate, the fuzz tested
  // nothing and the far-future check failed (2026-10-18). The transport envelope's own v (net.js V) stays 3.
  const GV = 4;
  const ONLY = (Q.get('only') || '').split(',').filter(Boolean);
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => {
    if (cond) { pass++; log('RVNET PASS ' + name); } else { fail++; log('RVNET FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); }
    return !!cond;
  };
  const metric = (name, v) => log('RVNET METRIC ' + name + ' ' + (typeof v === 'string' ? v : JSON.stringify(v)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clock = () => performance.now();
  async function until(pred, ms, step) {
    const t0 = clock();
    for (;;) {
      let v = false;
      try { v = pred(); } catch (e) { v = false; }
      if (v) return v;
      if (clock() - t0 > ms) return false;
      await sleep(step || 30);
    }
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  const pct = (a, b) => (b ? r1(100 * a / b) : 0);
  const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const p90 = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))]; };
  window.addEventListener('error', (e) => { fail++; log('RVNET driver page error: ' + e.message); });
  try { if (window.PG && PG.debug) PG.debug.G.manual = true; } catch (e) { /* ignore */ }
  document.body.style.background = '#061518';

  // ---------------------------------------------------------------- frames
  const frames = [];
  const LAYOUT = [[0, 0], [600, 0], [0, 450], [600, 450], [300, 225]];
  function frame(i, opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'preview.html?' + (opts.query !== undefined ? opts.query : 'net=bc&' + (opts.link || LINK)) + '&frame=' + i;
      const pos = LAYOUT[i % LAYOUT.length];
      f.style.cssText = 'position:fixed;left:' + pos[0] + 'px;top:' + pos[1] + 'px;width:600px;height:450px;border:0;z-index:' + (10 + i) + ';background:#0a2327';
      const t = setTimeout(() => reject(new Error('frame ' + i + ' did not load')), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        const okp = await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.Net, 15000);
        clearTimeout(t);
        if (!okp) { reject(new Error('frame ' + i + ' has no PG.debug.mp')); return; }
        const fr = { i, el: f, w, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, errors: [], warns: [] };
        w.addEventListener('error', (e) => { fr.errors.push(e.message + ' @' + e.lineno); log('RVNET frame ' + i + ' page error: ' + e.message + ' @' + e.lineno); });
        w.addEventListener('unhandledrejection', (e) => { fr.errors.push('rejection ' + (e.reason && e.reason.message)); log('RVNET frame ' + i + ' unhandled rejection: ' + (e.reason && e.reason.message)); });
        try {
          const c = w.console, ow = c.warn.bind(c), oe = c.error.bind(c);
          c.warn = (...a) => { fr.warns.push(a.join(' ')); log('RVNET frame ' + i + ' console.warn: ' + a.join(' ')); ow(...a); };
          c.error = (...a) => { fr.errors.push('console.error ' + a.join(' ')); log('RVNET frame ' + i + ' console.error: ' + a.join(' ')); oe(...a); };
        } catch (e) { /* ignore */ }
        frames.push(fr);
        resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  function drop(fr) { try { fr.mp.leave(); } catch (e) { /* ignore */ } fr.el.remove(); const k = frames.indexOf(fr); if (k >= 0) frames.splice(k, 1); }
  function dropAll() { for (const fr of frames.slice()) drop(fr); }
  const S = (fr) => fr.D.getState();
  const V = (fr) => fr.mp.view();
  const N = (fr) => fr.mp.state();
  const slotOf = (fr) => N(fr).mySlot;
  const me = (fr) => fr.G.players.find((p) => p.slot === slotOf(fr));
  const hp = (host, slot) => host.G.players.find((p) => p.slot === slot);
  const press = (fr, a, down) => fr.D.press(a, down, slotOf(fr));
  async function tap(fr, a, ms) { press(fr, a, true); await sleep(ms || 70); press(fr, a, false); }
  const allIdle = (fr) => { for (const a of ['left', 'right', 'jump', 'shoot']) press(fr, a, false); };

  async function room(n, mode, hostOpts, chars, nicks, link) {
    chars = chars || ['duck', 'cat', 'frog', 'otter', 'capy'];
    nicks = nicks || ['방장', '친구', '셋째', '넷째', '다섯'];
    const F = [];
    for (let i = 0; i < n; i++) F.push(await frame(frames.length, { link }));
    const host = F[0];
    const code = await host.mp.host(Object.assign({ mode, nick: nicks[0], char: chars[0] }, hostOpts || {}));
    if (!code) return { F, host, code: null };
    for (let i = 1; i < n; i++) {
      const r = await F[i].mp.join(code, { nick: nicks[i], char: chars[i] });
      if (!r.ok) log('RVNET INFO join failed ' + JSON.stringify(r));
    }
    await until(() => N(host).roster.length === n && F.slice(1).every((f) => N(f).roster.length === n), 8000);
    return { F, host, code };
  }
  async function startRoom(F) {
    for (const f of F.slice(1)) f.mp.ready(true);
    await until(() => N(F[0]).canStart, 8000);
    const started = F[0].mp.start();
    const playing = await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online), 15000);
    return started && !!playing;
  }
  function parkAll(host) { for (const e of host.G.enemies) { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; } }
  function syncSample(host, guest) {
    const v = V(guest), tr = host.mp.traceAt(Math.round(v.renderTick));
    if (!tr) return null;
    const hostE = new Map(tr.E.filter((e) => e[3] !== 'dead').map((e) => [e[0], e]));
    const gE = v.enemies.filter((e) => e.state !== 'dead');
    const ids = (a) => a.slice().sort((x, y) => x - y).join(',');
    const sameE = ids(Array.from(hostE.keys())) === ids(gE.map((e) => e.id));
    const d = [];
    for (const e of gE) { const h = hostE.get(e.id); if (!h || Math.abs(h[2] - e.y) >= 60) continue; d.push(Math.hypot(h[1] - e.x, h[2] - e.y)); }
    return { dk: Math.abs(tr.k - v.renderTick), sameE, nE: gE.length, maxD: d.length ? Math.max(...d) : 0 };
  }
  function nanScan(o, path, out) {
    if (out.length > 4) return out;
    if (typeof o === 'number') { if (!Number.isFinite(o)) out.push(path); return out; }
    if (!o || typeof o !== 'object') return out;
    for (const k of Object.keys(o)) nanScan(o[k], path + '.' + k, out);
    return out;
  }
  // a hidden tab: requestAnimationFrame stops (timers and BroadcastChannel keep running), visibilitychange fires
  function hideFrame(fr, ms, opts) {
    opts = opts || {};
    const w = fr.w, orig = w.requestAnimationFrame;
    const held = [];
    w.requestAnimationFrame = (cb) => { held.push(cb); return 0; };
    if (opts.visibility !== false) {
      try { Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => true }); w.document.dispatchEvent(new w.Event('visibilitychange')); } catch (e) { log('RVNET INFO visibility patch failed ' + e.message); }
    }
    return new Promise((res) => setTimeout(() => {
      w.requestAnimationFrame = orig;
      try { delete w.document.hidden; w.document.dispatchEvent(new w.Event('visibilitychange')); } catch (e) { /* ignore */ }
      for (const cb of held) orig.call(w, cb);
      res();
    }, ms));
  }
  // prediction bubbles on a guest: track each one until it is gone (seen = the host's copy took over)
  function predTracker(fr) {
    const seen = new Map(), out = { made: 0, matched: 0, expiredUnseen: 0, lat: [] };
    const id = setInterval(() => {
      const t = clock();
      const live = new Set();
      for (const b of fr.G.bubbles) {
        if (!b || !b.pred) continue;
        live.add(b);
        let s = seen.get(b);
        if (!s) { s = { born: t, seenAt: null }; seen.set(b, s); out.made++; }
        if (b.seen && s.seenAt === null) { s.seenAt = t; out.lat.push(t - s.born); }
      }
      for (const [b, s] of seen) {
        if (live.has(b)) continue;
        seen.delete(b);
        if (s.seenAt !== null || b.seen) out.matched++; else out.expiredUnseen++;
      }
    }, 8);
    out.stop = () => clearInterval(id);
    return out;
  }
  const starveOf = (fr) => { const n = N(fr); return { v: n.viewFrames, s: n.starvedFrames }; };
  const starveDelta = (a, b) => ({ frames: b.v - a.v, starvedPct: pct(b.s - a.s, b.v - a.v) });

  // ================================================================ harsh network: co-op, 3 players
  async function harsh() {
    const link = Q.get('hlink') || 'lat=125&jit=120&drop=0.106';
    metric('harsh.link_per_page', link);
    const { F, host } = await room(3, 'coop', {}, ['duck', 'frog', 'otter'], null, link);
    const started = await startRoom(F);
    ok('harsh: 3 clients start a co-op game over a 250 ms / 0-240 ms jitter / ~20 % loss link', started, F.map((f) => S(f).phase));
    if (!started) return dropAll();
    for (const f of F) f.D.setInvincible(true);
    host.mp.trace(true);
    const trk = F.slice(1).map(predTracker);
    const st0 = F.slice(1).map(starveOf);
    const samples = [];
    const acts = ['left', 'right', 'jump', 'shoot'];
    const t0 = clock();
    const pings = [];
    while (clock() - t0 < 25000) {
      for (const f of F) for (const a of acts) press(f, a, Math.random() < (a === 'shoot' ? 0.45 : 0.32));
      await sleep(160);
      if (Math.random() < 0.3) { const g = F[1 + Math.floor(Math.random() * 2)]; const s = syncSample(host, g); if (s) samples.push(s); }
      if (Math.random() < 0.1) { const st = F[1].mp.session().stats(); pings.push(st.rttMs); }
      if (S(host).phase === 'gameover') host.mp.again();
    }
    for (const f of F) allIdle(f);
    await sleep(1500);
    for (const t of trk) t.stop();
    const st1 = F.slice(1).map(starveOf);
    metric('harsh.guest_rtt_ms', { median: median(pings.filter((x) => x !== null)), max: Math.max(...pings.filter((x) => x !== null)) });
    metric('harsh.guest_view_starved', st0.map((a, i) => starveDelta(a, st1[i])));
    metric('harsh.view_sync', { samples: samples.length, sameEnemyIds: samples.filter((s) => s.sameE).length, maxPx: r1(Math.max(0, ...samples.map((s) => s.maxD))), over4: samples.filter((s) => s.maxD > 4).length, dkMax: r1(Math.max(0, ...samples.map((s) => s.dk))) });
    metric('harsh.predictions', trk.map((t) => ({ made: t.made, matched: t.matched, expiredUnseen: t.expiredUnseen, seenMsMedian: Math.round(median(t.lat) || 0), seenMsP90: Math.round(p90(t.lat) || 0) })));
    const unseen = trk.reduce((a, t) => a + t.expiredUnseen, 0), made = trk.reduce((a, t) => a + t.made, 0);
    ok('harsh: guests\' own shot predictions are matched by the host bubble before they expire (>= 90 %)', made > 10 && unseen / made < 0.1, { made, unseen });
    const ss = st0.map((a, i) => starveDelta(a, st1[i]));
    ok('harsh: guest views interpolate (starved frames < 25 %)', ss.every((s) => s.starvedPct < 25), ss);
    ok('harsh: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors.slice(0, 3)));
    ok('harsh: still connected', F.every((f) => N(f).screen === 'game'), F.map((f) => N(f).screen));
    dropAll();
  }

  // ================================================================ host main-thread hitch (rAF stall) -> guest interpolation
  async function hitch() {
    const { F, host } = await room(3, 'coop', {}, ['duck', 'frog', 'otter']);
    const started = await startRoom(F);
    ok('hitch: playing', started);
    if (!started) return dropAll();
    for (const f of F) f.D.setInvincible(true);
    const g = F.slice(1);
    async function window_(ms) { const a = g.map(starveOf); await sleep(ms); const b = g.map(starveOf); return a.map((x, i) => starveDelta(x, b[i]).starvedPct); }
    await sleep(2000);
    const base = await window_(4000);
    metric('hitch.baseline_starved_pct', base);
    for (const stall of [400, 600]) {
      const f0 = host.G.frame, t0 = clock();
      await hideFrame(host, stall, { visibility: false });
      await sleep(300);
      const lost = Math.round((clock() - t0) * 0.06 - (host.G.frame - f0));
      const w = [];
      for (let k = 0; k < 6; k++) w.push(await window_(5000));
      metric('hitch.after_' + stall + 'ms_host_stall', { hostTicksLost: lost, starvedPctPer5s: w });
      ok('hitch: ' + stall + ' ms host stall: guests interpolate again within 10 s (starved < 25 %)', w.slice(2).every((x) => x.every((p) => p < 25)), w);
      await sleep(25000);
    }
    ok('hitch: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors.slice(0, 3)));
    dropAll();
  }

  // ================================================================ a guest's tab hidden for 5 s, then back
  async function freeze() {
    for (const mode of ['coop', 'battle']) {
      const { F, host } = await room(3, mode, mode === 'battle' ? { arena: 0, time: 3 } : {}, ['duck', 'cat', 'penguin']);
      const started = await startRoom(F);
      ok('freeze[' + mode + ']: playing', started);
      if (!started) { dropAll(); continue; }
      for (const f of F) f.D.setInvincible(true);
      if (mode === 'battle') { parkAll(host); host.G.battle.enemyT = 1e9; host.G.opts.intrusion = false; }
      host.mp.trace(true);
      await sleep(1500);
      const g = F[1], sg = slotOf(g);
      const hidden = hideFrame(g, 5000);
      await sleep(1200);
      if (mode === 'battle') host.D.trapPlayer(sg, 0);          // trapped while away
      await hidden;
      ok('freeze[' + mode + ']: the host kept the hidden guest (not dropped)', N(host).roster.length === 3 && !!hp(host, sg), N(host).roster.length);
      ok('freeze[' + mode + ']: the guest is still in the game', N(g).screen === 'game' && S(g).online, [N(g).screen, S(g).online]);
      ok('freeze[' + mode + ']: back from hidden, the pause menu is open locally (game keeps running)', g.G.menuOpen === true && S(host).phase === 'playing', [g.G.menuOpen, S(host).phase]);
      g.D.resume();
      if (mode === 'battle') {
        const seesTrap = await until(() => V(g).players.find((p) => p.slot === sg).trapped, 3000);
        ok('freeze[battle]: on return the guest sees it was trapped while away', !!seesTrap);
        for (let k = 0; k < 16 && hp(host, sg).trap; k++) { await tap(g, k % 2 ? 'jump' : 'shoot', 45); await sleep(55); }
        await until(() => !hp(host, sg).trap, 5000);
      }
      const back = await until(() => N(g).ctl === 'local', 6000);
      ok('freeze[' + mode + ']: the guest moves its animal again', !!back, N(g).ctl);
      const x0 = hp(host, sg).x;
      press(g, 'right', true); await sleep(600); press(g, 'right', false); await sleep(800);
      ok('freeze[' + mode + ']: ...and the host sees it move', Math.abs(hp(host, sg).x - x0) > 10 && Math.abs(hp(host, sg).x - me(g).x) < 1, [x0, hp(host, sg).x, me(g).x]);
      const a = starveOf(g); await sleep(3000); const b = starveOf(g);
      const ss = [];
      for (let k = 0; k < 5; k++) { const s = syncSample(host, g); if (s) ss.push(s); await sleep(200); }
      metric('freeze[' + mode + '].after', { starved: starveDelta(a, b), sync: ss });
      ok('freeze[' + mode + ']: the view is in sync again (starved < 10 %, same enemy ids)', starveDelta(a, b).starvedPct < 10 && ss.length && ss.every((s) => s.sameE), { st: starveDelta(a, b), ss });
      ok('freeze[' + mode + ']: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors.slice(0, 3)));
      dropAll();
    }
  }

  // ================================================================ bursts of reliable messages
  async function burst() {
    const link = Q.get('hlink') || 'lat=125&jit=120&drop=0.106';
    const { F, host } = await room(2, 'coop', {}, ['duck', 'frog'], null, link);
    const [, g] = F;
    const hs = host.mp.session(), gs = g.mp.session();
    const got = [];
    const un = hs.onMessage((from, m) => { if (m && m.t === 'zz') got.push(m.i); });
    const t0 = clock();
    const N1 = 300;
    let sent = 0;
    for (let i = 0; i < N1; i++) if (gs.send(hs.selfId, { t: 'zz', i, pad: 'x'.repeat(200) })) sent++;
    const all = await until(() => got.length >= N1, 30000);
    metric('burst.bc', { sent, received: got.length, ms: Math.round(clock() - t0) });
    ok('burst[bc]: 300 reliable messages in one burst arrive, in order, once', !!all && got.length === N1 && got.every((v, i) => v === i), got.slice(0, 10));
    un();
    // reliable host -> guest during play still flows: start and check the guest still sees the world
    const started = await startRoom(F);
    ok('burst[bc]: the game still starts afterwards', started);
    ok('burst: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors.slice(0, 3)));
    dropAll();
  }

  // ================================================================ two / three guests join at the same moment
  async function join2() {
    const F = [];
    for (let i = 0; i < 4; i++) F.push(await frame(frames.length));
    const host = F[0];
    const code = await host.mp.host({ mode: 'battle', nick: '방장', char: 'duck' });
    const rs = await Promise.all(F.slice(1).map((f, k) => f.mp.join(code, { nick: 'g' + k, char: ['cat', 'frog', 'otter'][k] })));
    ok('join2: 3 guests joining at once all get in', rs.every((r) => r.ok), rs);
    await until(() => F.every((f) => N(f).roster.length === 4 && N(f).roster.every((r) => r.nick !== '손님')), 8000);
    const views = F.map((f) => JSON.stringify(N(f).roster.map((r) => [r.slot, r.nick, r.char])));
    ok('join2: every page has the same roster (slots 0-3, nicks, animals)', views.every((v) => v === views[0]) && new Set(N(host).roster.map((r) => r.slot)).size === 4, views);
    const slots = F.slice(1).map(slotOf);
    ok('join2: distinct slots for the guests', new Set(slots).size === 3, slots);
    // a 5th joining at the same moment as a 4th leaves: either refused cleanly or admitted, never stranded
    const fifth = await frame(frames.length);
    const leaving = F[3];
    const p = fifth.mp.join(code, { nick: 'late', char: 'capy' });
    leaving.mp.leave();
    const r5 = await p;
    await sleep(2500);
    metric('join2.fifth_vs_leave', { r5, hostRoster: N(host).roster.map((r) => r.nick), fifthScreen: N(fifth).screen });
    ok('join2: 5th vs leaving 4th: consistent outcome', (r5.ok && N(host).roster.some((r) => r.nick === 'late')) || (!r5.ok && !N(host).roster.some((r) => r.nick === 'late')), { r5, roster: N(host).roster });
    ok('join2: no page errors', frames.every((f) => !f.errors.length), frames.map((f) => f.errors.slice(0, 3)));
    dropAll();
  }

  // ================================================================ the host leaves during a boss; a host that vanishes without a word
  async function hostboss() {
    {
      const { F, host } = await room(3, 'coop');
      await startRoom(F);
      for (const f of F) f.D.setInvincible(true);
      host.D.gotoRound(5);
      const fighting = await until(() => F.slice(1).every((f) => V(f).boss && V(f).boss.state === 'fight'), 12000);
      ok('hostboss: boss fight on every page', !!fighting, F.map((f) => V(f).boss && V(f).boss.state));
      host.mp.leave();
      const back = await until(() => F.slice(1).every((f) => N(f).screen === 'friends' && !S(f).online), 15000);
      ok('hostboss: guests leave the boss fight for the lobby', !!back, F.slice(1).map((f) => [N(f).screen, S(f).online]));
      ok('hostboss: "방장이 나갔어요"', F.slice(1).every((f) => f.w.document.getElementById('pg-friends-err').textContent === '방장이 나갔어요'), F.slice(1).map((f) => f.w.document.getElementById('pg-friends-err').textContent));
      ok('hostboss: no boss / boss music left behind on the guests', F.slice(1).every((f) => !f.G.boss && f.G.music === 'lobby' && f.G.mode === 'title'), F.slice(1).map((f) => [!!f.G.boss, f.G.music, f.G.mode]));
      ok('hostboss: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors.slice(0, 3)));
      dropAll();
    }
    {
      // the host's network goes away (no bye): its channel stops posting
      const { F, host } = await room(2, 'coop');
      await startRoom(F);
      const sess = host.mp.session();
      const BC = host.w.BroadcastChannel.prototype;
      const orig = BC.postMessage;
      BC.postMessage = function () { /* cut */ };
      const t0 = clock();
      const lost = await until(() => N(F[1]).screen === 'friends', 25000);
      const ms = Math.round(clock() - t0);
      BC.postMessage = orig;
      metric('hostboss.silent_host_detected_ms', ms);
      ok('hostboss: a host that goes silent -> guest back in the lobby with "연결이 끊겼어요"', !!lost && F[1].w.document.getElementById('pg-friends-err').textContent === '연결이 끊겼어요', [N(F[1]).screen, F[1].w.document.getElementById('pg-friends-err').textContent, ms]);
      const chip = await until(() => false, 1);
      void chip; void sess;
      dropAll();
    }
  }

  // ================================================================ a guest leaves while trapped / ghosted / owning a trap
  async function gleave() {
    {
      const { F, host } = await room(3, 'battle', { arena: 0, time: 3 }, ['duck', 'cat', 'frog']);
      await startRoom(F);
      parkAll(host); host.G.battle.enemyT = 1e9; host.G.opts.intrusion = false; host.D.setInvincible(true);
      const [, A, B] = F;
      const sa = slotOf(A), sb = slotOf(B);
      await sleep(2300);
      host.D.trapPlayer(sb, sa);                              // B trapped in A's bubble
      await until(() => V(A).players.find((p) => p.slot === sb).trapped, 3000);
      A.mp.leave();                                           // the trapper leaves
      await until(() => !hp(host, sa), 15000);
      await sleep(600);
      const tb = hp(host, sb).trap;
      metric('gleave.trapper_left', { bTrapped: !!tb, owner: tb && tb.b && tb.b.owner, by: tb && tb.by });
      ok('gleave: trapper left: the host world drops it and B\'s bubble has no owner', !hp(host, sa) && (!tb || tb.b.owner === -1));
      // B escapes / is popped normally afterwards
      const free_ = await until(() => !hp(host, sb).trap, 8000);
      ok('gleave: B still gets out of the orphaned bubble', !!free_);
      // now B gets trapped by the host and leaves while trapped
      await sleep(1200);
      host.D.trapPlayer(sb, 0);
      await until(() => V(B).players.find((p) => p.slot === sb).trapped, 3000);
      B.mp.leave();
      await until(() => !hp(host, sb), 15000);
      await sleep(500);
      ok('gleave: trapped player left: removed, its prison popped, battle ends (1 player left)', !hp(host, sb) && !host.G.bubbles.some((b) => b.kind === 'player' && !b.dead && b.state !== 'pop') && S(host).phase === 'podium', { phase: S(host).phase, bubbles: host.G.bubbles.map((b) => [b.kind, b.state]) });
      ok('gleave[battle]: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors.slice(0, 3)));
      dropAll();
    }
    {
      const { F, host } = await room(3, 'coop', {}, ['duck', 'cat', 'frog']);
      await startRoom(F);
      const [, A, B] = F;
      const sa = slotOf(A);
      for (const f of F) f.D.setInvincible(true);
      await sleep(1000);
      const lives0 = S(host).teamLives;
      const ax = me(A).x, ay = me(A).y, far = ax < 128 ? 200 : 40;
      B.D.setPlayer(far, ay, slotOf(B)); host.D.setPlayer(far + (far > 128 ? 10 : -10), ay, 0);
      await sleep(800);
      host.D.hitPlayer(sa);
      const ghost = await until(() => hp(host, sa).ghost && V(B).players.find((p) => p.slot === sa).ghost, 6000);
      ok('gleave[coop]: A is a ghost on host and B', !!ghost);
      A.mp.leave();
      await until(() => !hp(host, sa), 15000);
      await sleep(1500);
      ok('gleave[coop]: ghost left: removed everywhere, team lives unchanged', !hp(host, sa) && !V(B).players.some((p) => p.slot === sa) && S(host).teamLives === lives0 && S(B).teamLives === lives0, { lives0, h: S(host).teamLives, b: S(B).teamLives, bp: V(B).players.map((p) => p.slot) });
      ok('gleave[coop]: game continues', S(host).phase === 'playing' && S(B).phase === 'playing');
      ok('gleave[coop]: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors.slice(0, 3)));
      dropAll();
    }
  }

  // ================================================================ worst-case snapshot size
  function fillWorld(host) {
    const G = host.G, D = host.D;
    // a boss round, many enemies (12 + minions), bubbles of every kind, items, hazards, scald drops
    const types = ['grime', 'mold', 'fly', 'sponge'];
    while (G.enemies.length < 16) {
      const n = G.enemies.length, x = 20 + (n * 13) % 200, y = 40 + (n * 31) % 150;
      G.enemies.push({ id: ++G.seq, type: types[n % 4], x, y, vx: 0, vy: 0, dir: -1, state: 'active', angry: false, escaped: false, onGround: false, spawnY: y, startY: 0, delay: 0, t: 0, hopT: 0, jumpCd: 0, committed: false,
        windT: 0, chargeT: 0, chargeCd: 0, fvx: 0, fvy: 0, bubble: null, deadT: 0, chainK: 1, gone: false, soakT: 0, water: 0, ice: null, grace: 0, minion: false });
    }
    for (let i = 0; i < 36; i++) {
      const b = D.spawnBubble(['empty', 'stamp', 'steam'][i % 3], 20 + (i * 17) % 200, 30 + (i * 23) % 160);
      if (i % 2) { b.state = 'shot'; b.vx = 0.0001; b.shotT = 99999; }
      b.owner = i % 4; b.sid = 100000 + i; b.age = 10;
    }
    for (let i = 0; i < 24; i++) G.items.push({ id: ++G.seq, type: 'watermelon', value: 2000, x: 20 + i * 8, y: 180, vx: 0, vy: 0, onGround: true, floating: false, age: 0 });
    for (let i = 0; i < 12; i++) D.spawnDrop(3 + i * 2);
    for (let i = 0; i < 24; i++) G.hazards.push({ id: ++G.seq, kind: 'sweep', x: 20 + i * 8, y: 100, sy: 100, t: 10, state: 'warn', warn: 1e9, dir: 1, v: 0, dead: false });
  }
  async function snap() {
    const { F, host } = await room(4, 'coop', {}, ['duck', 'cat', 'frog', 'otter'], ['가나다라마바사아자차카타', '하하하하하하하하하하하하', '뽀득뽀득뽀득뽀득뽀득뽀득', '목욕탕목욕탕목욕탕목욕탕']);
    await startRoom(F);
    for (const f of F) f.D.setInvincible(true);
    host.D.gotoRound(23);
    await until(() => host.G.boss && host.G.boss.state === 'fight', 12000);
    const sess = host.mp.session();
    const orig = sess.setState;
    let last = null, maxB = 0;
    // (watch the snapshots as they are handed to the session)
    sess.setState = function (o) { const j = JSON.stringify(o); const b = new TextEncoder().encode(j).length; if (b >= maxB) { maxB = b; last = o; } return orig.call(this, o); };
    const sn0 = N(host).snap;
    fillWorld(host);
    await sleep(1500);
    const sn = N(host).snap;
    const per = {};
    if (last && last.g) for (const k of Object.keys(last.g)) per[k] = new TextEncoder().encode(JSON.stringify(last.g[k])).length;
    metric('snap.worst', { maxBytes: sn.max, lastBytes: sn.bytes, trims: sn.trims - sn0.trims, refused: sn.refused, perKeyBytesLast: per, R: last && JSON.stringify(last.R).length, counts: { E: host.G.enemies.length, U: host.G.bubbles.length, I: host.G.items.length, H: host.G.hazards.length, D: host.G.drops.length, C: host.G.ice.length } });
    ok('snap: worst case snapshot is never refused (<= 3600 B)', sn.refused === 0, sn);
    const guestOk = await until(() => F.slice(1).every((f) => V(f).enemies.length >= 10), 3000);
    ok('snap: guests still get the (trimmed) world', !!guestOk, F.slice(1).map((f) => V(f).enemies.length));
    ok('snap: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors.slice(0, 3)));
    dropAll();
  }

  // ================================================================ hostile guest over the raw channel
  function rawPeer(code, id) {
    const ch = new BroadcastChannel('ppodeuk-v3-' + code);
    const P = { id, ch, host: null, welcomed: false, states: [], msgs: [], q: 0 };
    ch.onmessage = (ev) => {
      const m = ev.data; if (!m || m.v !== 3 || m.f === id) return;
      if (m.t !== '*' && m.t !== id) return;
      if (m.k === 'here' && !P.host) P.host = m.f;
      else if (m.k === 'r' && m.d && m.d.c === 'welcome') P.welcomed = true;
      else if (m.k === 's') P.states.push(m.d);
      else if (m.k === 'r') P.msgs.push(m.d);
    };
    P.post = (k, t, extra) => ch.postMessage(Object.assign({ v: 3, k, f: id, t }, extra || {}));
    P.rel = (to, d) => P.post('r', to, { d });
    P.user = (u) => P.rel(P.host, { u });
    P.state = (d) => P.post('s', '*', { q: ++P.q, d });
    P.close = () => { try { P.post('bye', '*'); } catch (e) { /* ignore */ } ch.close(); };
    return P;
  }
  async function hostile() {
    const F = [await frame(0, { link: '' }), await frame(1, { link: '' })];
    const [host, g] = F;
    const code = await host.mp.host({ mode: 'battle', nick: '방장', char: 'duck', arena: 0, time: 3 });
    await g.mp.join(code, { nick: '친구', char: 'cat' });
    const X = rawPeer(code, 'bEVIL0000001');
    X.post('who', '*');
    await until(() => X.host, 3000);
    X.rel(X.host, { c: 'hello', v: 3 });
    await until(() => X.welcomed, 3000);
    ok('hostile: a raw channel peer gets admitted like a guest', X.welcomed);
    // hostile room messages
    X.user({ t: 'hi', n: 'A\u202eB\u0000' + 'x'.repeat(5000), c: 'constructor' });
    X.user({ t: 'pk', c: '__proto__' });
    X.user({ t: 'pk', c: 'constructor' });
    // (looks-per-animal.md 5.2: a pk with a junk lk - a number, 6 characters, upper case - leaves the seat bare; the animal follows m.c)
    X.user({ t: 'pk', c: 'cat', lk: '10300' }); X.user({ t: 'pk', c: 'frog', lk: 7 }); X.user({ t: 'pk', c: 'frog', lk: '103000' }); X.user({ t: 'pk', c: 'frog', lk: '10H00' });
    X.user({ t: 'nk', n: { toString: 1 } });
    X.user({ t: 'rd', on: 'yes' });
    X.user({ t: 'zz' }); X.user(null); X.user([1, 2]); X.user('str'); X.user({ t: { a: 1 } });
    X.rel(X.host, { c: 'ping', i: 'NaN', r: 1e308 });
    X.rel(X.host, { c: 'ping', i: -5, r: NaN });
    await sleep(800);
    const rx = N(host).roster.find((r) => r.slot === 2);
    metric('hostile.roster_entry', rx);
    ok('hostile: the host keeps a valid animal for the hostile peer (not a prototype key)', !!rx && ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'].includes(rx.char), rx);
    ok('hostile: a pk with a junk lk (a number, 6 characters, upper case) makes the seat bare; the animal follows m.c (frog)', !!rx && rx.char === 'frog' && rx.lk === '00000', rx);
    ok('hostile: nick cleaned and capped (12 chars, no control/bidi)', !!rx && Array.from(rx.nick).length <= 12 && !/[\u0000-\u001f\u202e]/.test(rx.nick), rx && rx.nick);
    g.mp.ready(true);
    await until(() => N(host).canStart, 4000);
    const started = host.mp.start(true);
    await until(() => S(host).phase === 'playing' && S(g).phase === 'playing', 12000);
    ok('hostile: game starts with the hostile peer in it', started && S(host).players.length === 3, S(host).players.map((p) => p.char));
    const gid = N(host).gid;
    const ev = hp(host, 2);
    // body states: wrong types, NaN / Infinity (structured clone carries them), huge numbers, huge arrays, deep / cyclic objects
    const cyc = { a: 1 }; cyc.self = cyc;
    const deep = {}; let d = deep; for (let i = 0; i < 200; i++) { d.n = {}; d = d.n; }
    const bad = [
      { v: GV, k: 40, gid, ep: ev.ep, x: NaN, y: Infinity, vx: -Infinity, vy: 'x', f: 'L', fl: -1, sh: 1e9, bb: new Array(100000).fill(1e15), ny: 1e300 },
      { v: GV, k: 50, gid: String(gid), ep: String(ev.ep), x: '120', y: [1], vx: {}, vy: null, f: null, fl: 'x', sh: 'x', bb: 'x', ny: -1, extra: cyc, deep },
      { v: GV, k: 60, gid, ep: ev.ep, x: 1e9, y: -1e9, vx: 1e9, vy: -1e9, f: -1, fl: 1023, sh: 600, bb: [1, 2, 3], ny: 5 },
      { v: GV, k: 70, gid, ep: ev.ep, x: -1e9, y: 1e9, vx: 0, vy: 0, f: 1, fl: 0, sh: 0, bb: [], ny: 6, big: 'z'.repeat(1 << 20) },
      { v: GV, k: 80, gid, ep: ev.ep, x: 100, y: 100, vx: 0, vy: 0, f: 1, fl: 17, sh: 0, bb: [], ny: 7 },
    ];
    for (const b of bad) { X.state(b); await sleep(80); }
    let kk = 100;
    const t0 = clock();
    while (clock() - t0 < 2500) {
      X.user({ t: 'shot', n: 1e300, x: NaN, y: 'a', f: 'x', ep: ev.ep });
      X.user({ t: 'shot', n: -1, x: 1e9, y: -1e9, f: -1, ep: hp(host, 2).ep });
      X.user({ t: 'mash', ep: 'x' }); X.user({ t: 'rv', s: '1', e: 1e300 }); X.user({ t: 'die', ep: hp(host, 2).ep, x: NaN });
      X.user({ t: 'hit', ep: hp(host, 2).ep });
      X.state({ v: GV, k: kk += 2, gid, ep: hp(host, 2).ep, x: Math.random() * 1e6 - 5e5, y: Math.random() * 1e6, vx: NaN, vy: 1e308, f: 1, fl: Math.floor(Math.random() * 1024), sh: 5, bb: [hp(host, 2).ep], ny: Math.floor(clock()) });
      await sleep(30);
    }
    X.state({ v: GV, k: 1e300, gid, ep: hp(host, 2).ep, x: 50, y: 50, vx: 0, vy: 0, f: 1, fl: 0, sh: 0, bb: [], ny: 0 });
    await sleep(800);
    const hstate = S(host), gstate = S(g);
    const nanH = nanScan(hstate, 'host', []), nanG = nanScan(gstate, 'guest', []);
    const xp = hp(host, 2);
    metric('hostile.after', { hostPlayer: xp && { x: xp.x, y: xp.y, vx: xp.vx, vy: xp.vy, score: xp.score, shield: xp.shield }, bubbles: hstate.bubbles.length, nanH, nanG, hostErr: host.errors.slice(0, 3), gErr: g.errors.slice(0, 3) });
    ok('hostile: host survives hostile bodies / messages (no exceptions)', !host.errors.length, host.errors.slice(0, 3));
    ok('hostile: guest survives the hostile peer\'s body stream (no exceptions)', !g.errors.length, g.errors.slice(0, 3));
    ok('hostile: no NaN / Infinity anywhere in host or guest state', !nanH.length && !nanG.length, { nanH, nanG });
    ok('hostile: hostile position clamped inside the bath', xp && xp.x >= 12 && xp.x <= 228 && xp.y >= -8 && xp.y <= 224, xp && [xp.x, xp.y]);
    ok('hostile: the game still runs on both', S(host).phase === 'playing' && S(g).phase === 'playing' && S(host).frame > hstate.frame - 1);
    // forged control: X pretends to be the host towards the guest (bc has no sender authentication: test only transport)
    X.post('r', g.mp.session().selfId, { f: X.host, d: { c: 'roster', l: [[X.host, 0]] } });
    await sleep(600);
    metric('hostile.forged_host_roster_on_bc', { guestScreen: N(g).screen });
    X.close();
    dropAll();
  }

  // ================================================================ hostile HOST: snapshots full of garbage to a real guest
  async function hostilehost() {
    const code = 'zq' + Math.random().toString(36).slice(2, 4).replace(/[^a-z0-9]/g, 'x');
    const H = rawPeer(code, 'bFAKEHOST0001');
    let guestId = null;
    H.ch.addEventListener('message', (ev) => {
      const m = ev.data; if (!m || m.v !== 3 || m.f === H.id) return;
      if (m.k === 'who') H.post('here', m.f);
      if (m.k === 'r' && m.d && m.d.c === 'hello') { guestId = m.f; H.rel(m.f, { c: 'welcome', l: [[H.id, 0], [m.f, 1]], h: H.id }); }
      if (m.k === 'r' && m.d && m.d.c === 'ping') H.rel(m.f, { c: 'pong', i: m.d.i });
    });
    const g = await frame(0, { link: '' });
    const r = await g.mp.join(code, { nick: '손', char: 'cat' });
    ok('hostilehost: a guest joins the fake host', r.ok, r);
    const R = { gid: 1, ph: 'game', m: 'c', o: [99, 'x', 'y', null], p: [[0, 'H', 'constructor', 1], [1, '손', '__proto__', 1], ['x', 1e9, {}, []], [3, 'Z'.repeat(100), 'toString', 'q']] };
    let k = 100;
    const cyc = [1]; cyc.push(cyc);
    const rows = (n, f) => Array.from({ length: n }, (_, i) => f(i));
    const garbage = [
      () => ({ id: 1, k: k += 3, m: 'c', ph: 'p', r: 0, lp: 0, L: 3, S: 0, st: 0, P: [[0, 1, 100, 100, 0, 0, 1, 64, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, -1, -1, 0, 0, 0, 0], [1, 1, 60, 100, 0, 0, 1, 64, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, -1, -1, 0, 0, 0, 0]], E: [], U: [] }),
      () => ({ id: 1, k: k += 3, m: 'c', ph: 'p', r: 1e9, lp: NaN, L: Infinity, S: 'x', st: -5, hu: {}, sf: 1e9, tf: -1, mu: 999, tl: NaN, tr: [NaN, 'x'], pd: ['a', 9, -1, null, 7], pt: NaN, bn: [1e15, 'x'.repeat(5000), {}, 1e9, '<img src=x onerror=alert(1)>'],
        P: [['0', NaN, 'x', {}, 1e309, -1e309, null, 'fl', 1e20, -5, [], {}, 'x', NaN, 1e9, -1, 99, 1e9, 1e9, 1e9, 'b', 1e9, 1e9, 99], [1, 2, 1e9, -1e9, 1e9, -1e9, 1, 1023, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 5, 5, 5, 5, 5, 4]],
        E: rows(40, (i) => [i, 99, -5, NaN, 'y', 'd', 1e9, -1]).concat([[1e15, 0, 0, 0, 0, 0, 0, 0], ['a'], null, 5, [1, 2]]),
        U: rows(60, (i) => [1000 + i, 99, 99, 1e9, -1e9, 'o', 1e9, 1e9, NaN, 1e15]).concat([[2000, 1, 2, 10, 10, 1, -1e9, 2, 1, 1], [2001, 2, 0, 10, 10, 9, 99, 0, 0]]),
        I: rows(30, (i) => [i + 5000, 1e9, NaN, 'x', 9, -1]), K: [NaN, 'x', 1e9, 'y', null, {}],
        B: [99, 99, NaN, 1e9, 1e9, -1e9, 'x', NaN, 1e9, -1, 99, 1e9, 1e9, NaN, 99, 1e9, 1e9, 1e9, -1e9, 1e9, NaN, NaN, 1e9, NaN, NaN],
        H: rows(30, (i) => [i + 7000, 99, NaN, NaN, NaN, 5, -1e9]), D: rows(20, (i) => [i + 8000, NaN, 1e9, 'x', NaN]),
        C: rows(20, (i) => [i + 9000, 1e9, -1e9, NaN, 99, 'x']).concat([[9500, -1e9, 1e9, 0, -1, 0]]), O: rows(10, (i) => [i + 9900, NaN, NaN, 'x', NaN]),
        V: [[k * 10, k, 0, 's', 'constructor', 'o'], [k * 10 + 1, k, 1, 's', '__proto__', 99], [k * 10 + 2, k, 9, 'p', 1e9, -1e9, { a: 1 }, 99, 'red', 'x'.repeat(999)], [k * 10 + 3, k, -1, 'w', NaN, NaN, 'x'.repeat(999), 'url(javascript:1)'], [k * 10 + 4, k, 0, 'k', 1e9], [k * 10 + 5, k, 0, 'zz'], 'x', null, [1e300, -1e300, 'x', 'y']], deep: cyc }),
      () => ({ id: 1, k: k += 3, m: 'b', ph: 'd', r: -1, pd: [3, 3, 3, 3, 3, 3], pt: 1e9, tl: -50, P: [[0, 1, 100, 100, 0, 0, 1, 0, 5, 0, 0, 0, 0, 0, 0, 0, -1, 0, -1, -1, 0, 0, 0, 1], [1, 1, 60, 100, 0, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 0, -1, 0, -1, -1, 0, 0, 0, 2]] }),
      () => ({ id: 1, k: k += 3, m: 'c', ph: 't', r: 3, tr: [1e9, 1e9], P: [] }),
      () => ({ id: 1, k: k += 3, m: 'c', ph: 'o', r: 3, P: 'x', E: 'x', U: {}, I: 5, B: [], H: null, D: true, C: 'x', V: {} }),
      () => ({ id: 2, k: k += 3, m: 'c', ph: 'p', r: 23, P: [[0, 1, 100, 100, 0, 0, 1, 64, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, -1, -1, 0, 0, 0, 0], [1, 5, 60, 100, 0, 0, 1, 64, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, -1, -1, 0, 0, 0, 0]], B: [3, 1, 100, 50, 0, 0, 1, 3, 5, 10, 1, 0, 0, 100, 1, 0, 0, -999, -999, 0, 0, 0, -1, 0, 0] }),
    ];
    const t0 = clock();
    let n = 0;
    while (clock() - t0 < 8000) {
      const gfn = garbage[Math.min(garbage.length - 1, Math.floor(n / 12))] || garbage[1];
      H.state({ v: GV, R, g: gfn() });
      n++;
      await sleep(50);
    }
    // also a k from the far future: does the guest's view ever recover?
    H.state({ v: GV, R, g: { id: 2, k: 1e12, m: 'c', ph: 'p', r: 0, P: [] } });
    await sleep(200);
    for (let i = 0; i < 20; i++) { H.state({ v: GV, R, g: { id: 2, k: k += 3, m: 'c', ph: 'p', r: 7, P: [] } }); await sleep(50); }
    await sleep(400);
    const st = S(g);
    const nan = nanScan(st, 'guest', []);
    metric('hostilehost.after', { frames: n, errors: g.errors.slice(0, 5), nan, phase: st.phase, players: st.players.map((p) => [p.slot, p.char]), viewRound: V(g).round, newestTick: N(g).newestTick });
    ok('hostilehost: the guest survives a hostile host (no exceptions)', !g.errors.length, g.errors.slice(0, 5));
    ok('hostilehost: no NaN / Infinity in the guest state', !nan.length, nan);
    ok('hostilehost: prototype-key animal names never reach the guest\'s players', st.players.every((p) => ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'].includes(p.char)), st.players.map((p) => p.char));
    ok('hostilehost: a single far-future tick does not freeze the view for good', V(g).round === 7, V(g).round);
    H.close();
    dropAll();
  }

  // ================================================================ battle fairness: dodging a bubble you can see
  async function trapfair() {
    const link = Q.get('tlink') || LINK;
    const { F, host } = await room(3, 'battle', { arena: 0, time: 5 }, ['duck', 'cat', 'frog'], null, link);
    await startRoom(F);
    parkAll(host); host.G.battle.enemyT = 1e9; host.G.battle.powerT = 1e9; host.G.opts.intrusion = false; host.D.setInvincible(true);
    const [, A, B] = F;
    const sa = slotOf(A), sb = slotOf(B);
    const floorY = 24 * 8;
    const res = [];
    await sleep(2400);
    for (let trial = 0; trial < 6; trial++) {
      F[2].D.setPlayer(150, floorY, sb); A.D.setPlayer(80, floorY, sa); host.D.setPlayer(220, floorY, 0);
      allIdle(A); allIdle(B);
      await until(() => N(A).ctl === 'local' && N(B).ctl === 'local' && !hp(host, sb).trap && hp(host, sb).invuln === 0 && hp(host, sa).invuln === 0, 6000);
      await sleep(600);
      A.D.setPlayer(80, floorY, sa); B.D.setPlayer(150, floorY, sb);
      await sleep(500);
      if (me(A).facing < 0) { await tap(A, 'right', 30); await sleep(200); }
      // B watches A's bubble in ITS OWN view and jumps when it is 40 px away (a clean dodge locally)
      let jumped = false, minD = 1e9, jumpAtD = null, firstSeen = null, jumpT = null, hostTrapT = null, viewTrapT = null;
      const tShot = clock();
      const watch = setInterval(() => {
        const mb = me(B); if (!mb) return;
        if (hostTrapT === null && hp(host, sb).trap) hostTrapT = clock() - tShot;
        const vme = B.G.players.find((p) => p.slot === sb);
        if (vme && vme.trap) { if (viewTrapT === null) viewTrapT = clock() - tShot; return; }
        for (const b of B.G.bubbles) {
          if (b.owner !== sa || b.pred || b.kind !== 'empty') continue;
          if (firstSeen === null) firstSeen = clock() - tShot;
          const dx = (b.x + 8) - (mb.x + 8), dy = (b.y + 8) - (mb.y + 8);
          const dd = Math.hypot(dx, dy);
          if (dd < minD) minD = dd;
          if (!jumped && Math.abs(dx) < 40 && b.x < mb.x) { jumped = true; jumpAtD = r1(dd); jumpT = clock() - tShot; tap(B, 'jump', 220); }
        }
      }, 4);
      await tap(A, 'shoot', 50);
      const trapped = await until(() => hp(host, sb).trap, 1800);
      await until(() => viewTrapT !== null, 1500);
      await sleep(400);
      clearInterval(watch);
      const R = (v) => (v === null ? null : Math.round(v));
      res.push({ trapped: !!trapped, bubbleFirstInVictimViewMs: R(firstSeen), victimJumpedAtMs: R(jumpT), jumpAtD, hostTrapMs: R(hostTrapT), victimSeesTrapMs: R(viewTrapT), minViewDistBeforeTrap: minD > 1e8 ? null : r1(minD) });
      if (trapped) { await until(() => !hp(host, sb).trap, 6000); }
      await sleep(1200);
    }
    metric('trapfair.' + link.replace(/&/g, '_'), res);
    const unfair = res.filter((r) => r.trapped && (r.minViewDistBeforeTrap === null || r.minViewDistBeforeTrap > 16 || (r.bubbleFirstInVictimViewMs !== null && r.hostTrapMs !== null && r.bubbleFirstInVictimViewMs >= r.hostTrapMs)));
    ok('trapfair: the victim could see the bubble coming before the host trapped it, and it touched the victim in its own view', unfair.length === 0, res);
    ok('trapfair: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors.slice(0, 3)));
    dropAll();
  }

  // ================================================================ fake 'room' runtime (presence only), with faults
  function makeRoomPlatform() {
    const pf = { latency: 40, jitter: 25, rooms: new Map(), violations: [], maxRate: 0, sends: 0, labelN: 0, maxPresence: 0, firstOnlySelf: false };
    const members = (name) => { let s = pf.rooms.get(name); if (!s) { s = new Set(); pf.rooms.set(name, s); } return s; };
    const rerr = (code, m) => Object.assign(new Error(m || code), { code });
    const EMPTY = Object.freeze([]);
    const freeze = (o) => { if (o && typeof o === 'object') { Object.freeze(o); for (const k of Object.keys(o)) freeze(o[k]); } return o; };
    function depth(v) { if (!v || typeof v !== 'object') return 0; let d = 0; for (const k of Object.keys(v)) d = Math.max(d, depth(v[k])); return d + 1; }
    function plain(v) {
      if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
      if (typeof v === 'number') return Number.isFinite(v);
      if (Array.isArray(v)) return v.every(plain);
      if (typeof v === 'object' && Object.prototype.toString.call(v) === '[object Object]') return Object.keys(v).every((k) => plain(v[k]));
      return false;
    }
    function fifo() {
      const q = []; let armed = false;
      const pump = () => { armed = false; const t = performance.now(); while (q.length && q[0].at <= t + 0.5) q.shift().fn(); arm(); };
      const arm = () => { if (!armed && q.length) { armed = true; setTimeout(pump, Math.max(0, Math.ceil(q[0].at - performance.now()))); } };
      return { push(at, fn) { q.push({ at: q.length ? Math.max(at, q[q.length - 1].at) : at, fn }); arm(); } };
    }
    function handle(page, name) {
      const h = { page, name, active: true, mine: {}, mineF: freeze({}), myAt: Date.now(), selfObj: null, view: new Map(), snap: null, hiddenTill: new Map(),
        peerL: [], connL: [], pend: new Map(), batchT: null, sendT: null, lastSend: -1e9, pairs: new Map(), ver: 0, readyAt: performance.now() + pf.latency, down: false };
      h.connected = () => h.active && !h.down && performance.now() >= h.readyAt;
      h.fireConn = () => { const c = h.connected(); for (const l of h.connL) if (l.live && l.last !== c) { l.last = c; l.fn(c); } };
      h.self = () => { if (!h.selfObj) h.selfObj = Object.freeze({ peer: page.label, by: page.userId, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: h.mineF, updatedAt: h.myAt }); return h.selfObj; };
      h.peers = () => {
        if (!h.active || performance.now() < h.readyAt) return EMPTY;
        if (!h.snap) { const a = [h.self()]; for (const v of h.view.values()) a.push(v.obj); h.snap = Object.freeze(a); }
        return h.snap;
      };
      h.pair = (o) => { let l = h.pairs.get(o); if (!l) { l = fifo(); h.pairs.set(o, l); } return l; };
      h.deliverTo = (o) => { if (!h.active || h.down) return; const snap = h.mineF, ver = ++h.ver; h.pair(o).push(performance.now() + pf.latency + Math.random() * pf.jitter, () => o.receive(h, snap, ver)); };
      h.receive = (from, snap, ver) => {
        if (!h.active) return;
        const label = from.page.label, old = h.view.get(label);
        if (old && old.ver >= ver) return;
        const obj = Object.freeze({ peer: label, by: from.page.userId, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: snap, updatedAt: Date.now() });
        h.view.set(label, { ver, obj }); h.snap = null;
        h.queue(old ? 'updated' : 'joined', label, obj);
      };
      h.removePeer = (label) => { if (!h.active) return; const old = h.view.get(label); if (!old) return; h.view.delete(label); h.snap = null; h.queue('left', label, old.obj); };
      h.queue = (kind, label, obj) => {
        const cur = h.pend.get(label);
        if (cur && cur.kind === 'joined' && kind === 'left') h.pend.delete(label);
        else h.pend.set(label, { kind: cur && cur.kind === 'joined' ? 'joined' : kind, obj });
        if (h.batchT === null) h.batchT = setTimeout(h.flush, 16);
      };
      h.flush = () => {
        h.batchT = null;
        if (!h.active || !h.pend.size) return;
        const joined = [], left = [], updated = [];
        for (const { kind, obj } of h.pend.values()) (kind === 'joined' ? joined : kind === 'left' ? left : updated).push(obj);
        h.pend.clear();
        const ch = Object.freeze({ peers: h.peers(), joined, left, updated });
        for (const l of h.peerL.slice()) if (l.live && l.started) l.fn(ch);
      };
      h.presence = (patch) => {
        const t = performance.now();
        page.calls.push(t); while (page.calls.length && page.calls[0] <= t - 1000) page.calls.shift();
        pf.maxRate = Math.max(pf.maxRate, page.calls.length);
        if (!h.active) return Promise.reject(rerr('invalid_argument', 'room was left'));
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) { pf.violations.push('patch not an object'); return Promise.reject(rerr('invalid_argument')); }
        const merged = Object.assign({}, h.mine);
        for (const k of Object.keys(patch)) { if (patch[k] === null) delete merged[k]; else merged[k] = patch[k]; }
        if (!plain(merged)) { pf.violations.push(page.nick + ': not plain JSON'); return Promise.reject(rerr('invalid_argument')); }
        if (depth(merged) > 8) { pf.violations.push(page.nick + ': too deep ' + depth(merged)); return Promise.reject(rerr('invalid_argument')); }
        const size = new TextEncoder().encode(JSON.stringify(merged)).length;
        pf.maxPresence = Math.max(pf.maxPresence, size);
        if (size > 4096) { pf.violations.push(page.nick + ': presence ' + size + ' bytes'); return Promise.reject(rerr('invalid_argument')); }
        h.mine = JSON.parse(JSON.stringify(merged)); h.mineF = freeze(JSON.parse(JSON.stringify(merged))); h.myAt = Date.now(); h.selfObj = null; h.snap = null;
        if (h.sendT === null) h.sendT = setTimeout(() => { h.sendT = null; if (!h.active) return; h.lastSend = performance.now(); pf.sends++; for (const o of members(h.name)) if (o !== h && o.active) h.deliverTo(o); }, Math.max(0, h.lastSend + 33 - performance.now()));
        return Promise.resolve();
      };
      h.onPeers = (fn) => {
        const l = { fn, live: true, started: false }; h.peerL.push(l);
        setTimeout(() => { if (!l.live || !h.active) return; l.started = true; const ps = h.peers(); fn(Object.freeze({ peers: ps, joined: ps, left: EMPTY, updated: EMPTY })); }, Math.max(0, h.readyAt - performance.now()) + 1);
        return () => { l.live = false; };
      };
      h.onConnection = (fn) => { const l = { fn, live: true, last: undefined }; h.connL.push(l); setTimeout(() => { if (l.live) { l.last = h.connected(); fn(l.last); } }, 0); return () => { l.live = false; }; };
      h.leave = () => {
        if (!h.active) return Promise.resolve();
        h.active = false; members(h.name).delete(h);
        for (const l of h.peerL.concat(h.connL)) l.live = false;
        for (const o of members(h.name)) if (o.active) h.pair(o).push(performance.now() + pf.latency, () => o.removePeer(page.label));
        page.handles.delete(h.name);
        return Promise.resolve();
      };
      // fault: this page's connection refreshes for `ms` (others see it leave, then it re-asserts its presence)
      h.blip = (ms, opts) => {
        opts = opts || {};
        h.down = true; h.fireConn();
        if (opts.othersSee !== false) for (const o of members(h.name)) if (o !== h && o.active) h.pair(o).push(performance.now() + pf.latency, () => o.removePeer(page.label));
        setTimeout(() => {
          h.down = false; h.fireConn();
          if (opts.selfView) {
            // reconciled like a first delivery: the room so far is just me; the others answer over the next moment
            for (const [label, v] of Array.from(h.view)) { h.view.delete(label); h.queue('left', label, v.obj); }
            h.snap = null;
            for (const o of members(h.name)) if (o !== h && o.active) setTimeout(() => o.deliverTo(h), opts.answerMs || 0);
          }
          if (opts.othersSee !== false) for (const o of members(h.name)) if (o !== h && o.active) { h.deliverTo(o); if (!opts.selfView) o.deliverTo(h); }
        }, ms);
      };
      setTimeout(h.fireConn, pf.latency + 1);
      members(name).add(h);
      for (const o of members(name)) if (o !== h && o.active) { h.deliverTo(o); o.deliverTo(h); }
      const base = { presence: h.presence, peers: h.peers, onPeers: h.onPeers, connected: h.connected, onConnection: h.onConnection,
        emit: () => Promise.reject(rerr('not_permitted')), on: () => () => {} };
      if (name === '') base.join = (n) => {
        if (typeof n !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(n)) return Promise.reject(rerr('invalid_argument', 'room name'));
        const ex = page.handles.get(n); if (ex && ex.active) return Promise.resolve(ex.ns);
        const nh = handle(page, n); page.handles.set(n, nh);
        return new Promise((res) => setTimeout(() => res(nh.ns), pf.latency));
      };
      else Object.assign(base, { name, leave: h.leave });
      h.ns = Object.freeze(base);
      return h;
    }
    pf.newPage = (nick) => {
      const page = { label: 'pg' + (++pf.labelN) + Math.random().toString(36).slice(2, 12), userId: 'u' + pf.labelN, nick, handles: new Map(), calls: [] };
      page.lobby = handle(page, '');
      const user = Object.freeze({ me: async () => ({ id: page.userId, name: nick, avatarUrl: 'data:,', color: '#888888', email: null, isOwner: false, canEdit: false }) });
      page.claude = Object.freeze({ use: (n) => new Promise((res) => setTimeout(() => res(n === 'room' ? page.lobby.ns : n === 'user' ? user : null), 5)) });
      return page;
    };
    // a rogue page: joins a named room and sets any (plain-JSON) presence it likes
    pf.rogue = (name, presence) => { const page = pf.newPage('rogue'); const h = handle(page, name); page.handles.set(name, h); if (presence) h.presence(presence); return h; };
    return pf;
  }
  async function roomFrame(pf, nick) {
    const fr = await frame(frames.length, { query: 'room=1' });
    fr.page = pf.newPage(nick);
    fr.w.claude = fr.page.claude;
    return fr;
  }
  async function roomGame(pf, n, mode, opts) {
    const nicks = ['Alice', 'Bob', 'Cara', 'Dan'];
    const F = [];
    for (let i = 0; i < n; i++) { const f = await roomFrame(pf, nicks[i]); f.mp.openFriends(); F.push(f); }
    await until(() => F.every((f) => N(f).transport === 'room'), 5000);
    const code = await F[0].mp.host(Object.assign({ mode, char: 'duck' }, opts || {}));
    for (let i = 1; i < n; i++) { const r = await F[i].mp.join(code, { char: ['cat', 'frog', 'otter'][i - 1] }); if (!r.ok) log('RVNET INFO room join ' + JSON.stringify(r)); }
    await until(() => N(F[0]).roster.length === n && F.every((f) => N(f).roster.length === n), 10000);
    return { F, code };
  }
  async function roomPhase() {
    const pf = makeRoomPlatform();
    const { F, code } = await roomGame(pf, 4, 'coop');
    ok('room: 4 pages in a co-op room over fake presence', N(F[0]).roster.length === 4, N(F[0]).roster.length);
    const started = await startRoom(F);
    ok('room: started', started);
    const host = F[0];
    for (const f of F) f.D.setInvincible(true);
    // rate under random play
    pf.maxRate = 0;
    const acts = ['left', 'right', 'jump', 'shoot'];
    const t0 = clock();
    while (clock() - t0 < 8000) { for (const f of F) for (const a of acts) press(f, a, Math.random() < 0.4); await sleep(150); }
    for (const f of F) allIdle(f);
    metric('room.play', { maxCallsPerSecPerPage: pf.maxRate, maxPresenceBytes: pf.maxPresence, violations: pf.violations.slice(0, 4) });
    ok('room: presence calls <= 40/s per page during 4-player play', pf.maxRate <= 40, pf.maxRate);
    // worst-case snapshot through presence
    host.D.gotoRound(23);
    await until(() => host.G.boss && host.G.boss.state === 'fight', 12000);
    pf.maxPresence = 0; pf.violations.length = 0;
    fillWorld(host);
    const vs = F[1].mp.view();
    await sleep(2500);
    const sn = N(host).snap;
    const guestsSee = F.slice(1).map((f) => V(f).enemies.length);
    metric('room.worst_snapshot', { snapMax: sn.max, maxPresenceBytes: pf.maxPresence, violations: pf.violations.slice(0, 4), warns: host.warns.slice(0, 4), guestEnemies: guestsSee, before: vs.enemies.length });
    ok('room: worst-case snapshot still reaches the guests over presence', guestsSee.every((n) => n >= 10) && !host.warns.some((w) => /too large|rejected/.test(w)), { guestsSee, warns: host.warns });
    // bursts: a guest sends 150 ~200-byte reliable messages at once
    const hs = host.mp.session(), gs = F[1].mp.session();
    const got = [];
    const un = hs.onMessage((from, m) => { if (m && m.t === 'zz') got.push(m.i); });
    const b0 = clock();
    let st0 = null;
    const stSeen = [];
    const un2 = hs.onState((from) => { if (from === gs.selfId) stSeen.push(clock()); });
    for (let i = 0; i < 150; i++) gs.send(hs.selfId, { t: 'zz', i, pad: 'y'.repeat(200) });
    const all = await until(() => got.length >= 150, 30000);
    const bms = Math.round(clock() - b0);
    void st0;
    // longest gap in the guest's body states during the burst
    let gap = 0; for (let i = 1; i < stSeen.length; i++) gap = Math.max(gap, stSeen[i] - stSeen[i - 1]);
    metric('room.burst', { received: got.length, ms: bms, inOrder: got.every((v, i) => v === i), guestStateMaxGapMs: Math.round(gap), violations: pf.violations.slice(0, 3) });
    ok('room: 150-message burst arrives in order, once', !!all && got.every((v, i) => v === i), got.length);
    un(); un2();
    // hostile presence in the named room: a rogue claiming to be a player/host with garbage
    const rg = pf.rogue('g-' + code, { v: 3, r: 'g', c: code, i: 'zz', k: 1, q: 1e15, s: { v: GV, k: 'x', x: 'NaN', gid: [] },
      o: [1, [1, hs.selfId, { c: 'hello', v: 3 }], [2, hs.selfId, '{"u":{"t":"pk","c":"constructor"}}', 1], [3, '*', { c: 'bye' }], ['x'], null, [4, hs.selfId, '{bad json', 1]],
      a: [[hs.selfId, 1e15], ['x', 'y'], null], w: [[F[1].page.label, -5]] });
    await sleep(1500);
    rg.presence({ r: 'h', o: [1, [5, '*', { c: 'roster', l: [] }]], q: 5, s: { v: GV, R: { ph: 'room', p: [] } } });
    await sleep(1500);
    rg.presence({ o: [1e300, [1e300, '*', 1]], a: 'x', w: 7, q: -1, s: null, z: '{"v":3,"g":' + '['.repeat(500) });
    await sleep(1500);
    metric('room.rogue', { hostRoster: N(host).roster.map((r) => [r.slot, r.nick, r.char]), screens: F.map((f) => N(f).screen), errors: F.map((f) => f.errors.slice(0, 2)) });
    ok('room: a rogue page in the game room does not crash anyone or end the game', F.every((f) => !f.errors.length && N(f).screen === 'game'), { screens: F.map((f) => N(f).screen), errors: F.map((f) => f.errors.slice(0, 2)) });
    ok('room: the rogue never gets a prototype-key animal into the roster', N(host).roster.every((r) => ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'].includes(r.char)), N(host).roster);
    rg.leave();
    dropAll();
  }
  // connection refreshes ("brief reconnects are normal"): a guest's / the host's presence disappears for a moment
  async function roomflap() {
    for (const who of ['guest', 'host', 'observer']) {
      const pf = makeRoomPlatform();
      const { F } = await roomGame(pf, 3, 'coop');
      const started = await startRoom(F);
      ok('roomflap[' + who + ']: started', started);
      await sleep(1000);
      const target = who === 'host' ? F[0] : F[1];
      const h = target.page.handles.get('g-' + N(F[0]).code);
      if (who === 'observer') h.blip(1200, { selfView: true, answerMs: 900, othersSee: false });   // only my side reconnects; the others re-answer ~1 s later
      else h.blip(800);                                                                            // others see me leave for 0.8 s
      await sleep(6000);
      const scr = F.map((f) => [N(f).screen, N(f).roster.length, f.w.document.getElementById('pg-friends-err') ? f.w.document.getElementById('pg-friends-err').textContent : '']);
      metric('roomflap.' + who, scr);
      ok('roomflap[' + who + ']: a < 1.2 s connection refresh keeps everyone in the game', F.every((f) => N(f).screen === 'game' && N(f).roster.length === 3), scr);
      if (who === 'guest') {
        // a guest the host dropped must not be left playing a game that ignores it
        const g = F[1], inHost = N(F[0]).roster.some((r) => r.slot === slotOf(g));
        const x0 = me(g) ? me(g).x : null;
        press(g, 'right', true); await sleep(700); press(g, 'right', false);
        const sc0 = S(F[0]).players.map((p) => p.slot);
        await sleep(8000);
        metric('roomflap.guest_after', { inHostRoster: inHost, guestScreen: N(g).screen, guestOnline: S(g).online, guestMoved: me(g) && x0 !== null ? r1(me(g).x - x0) : null, hostPlayers: sc0, guestCtl: N(g).ctl, guestRoster: N(g).roster.map((r) => r.slot), chip: N(g).chip, err: g.w.document.getElementById('pg-friends-err').textContent, after14s: N(g).screen });
        ok('roomflap[guest]: a dropped guest is told (back in the lobby with a message) instead of playing on unseen', inHost || (N(g).screen === 'friends'), { inHost, screen: N(g).screen });
      }
      dropAll();
    }
  }

  async function main() {
    log('RVNET link: ' + LINK);
    const phases = { harsh, hitch, freeze, burst, join2, hostboss, gleave, snap, hostile, hostilehost, trapfair, room: roomPhase, roomflap };
    for (const name of Object.keys(phases)) {
      if (ONLY.length ? !ONLY.includes(name) : name === 'hitch' || name === 'harsh' || name === 'trapfair') continue;
      const t0 = clock();
      log('RVNET INFO phase ' + name);
      try { await phases[name](); } catch (e) { fail++; log('RVNET FAIL ' + name + ' threw: ' + (e && e.stack)); dropAll(); }
      log('RVNET INFO phase ' + name + ' took ' + Math.round((clock() - t0) / 1000) + ' s');
    }
    log('RVNET DONE pass=' + pass + ' fail=' + fail);
  }
  setTimeout(main, 300);
})();
