// Deploy-page review: the STANDALONE page (deploy/index.html) with its pinned PeerJS <script> swapped for a FAKE
// window.Peer (same API surface as PeerJS 1.5: new Peer(id?, opts) -> 'open' | 'error' {type:'unavailable-id'};
// peer.connect(id, {reliable, serialization:'json'}) -> DataConnection ('open' / 'data' / 'close'), a missing id ->
// peer 'error' {type:'peer-unavailable'}; send() = ordered reliable JSON with latency; destroy(); reconnect()) whose
// signalling / data channels run through this page. Plays 2 players over the 'peer' transport. First the deferred
// script arriving late (?late=manual): until it does, this is the page with PeerJS blocked - the 'peer' block card with
// 새로고침, 방 만들기 off, 참여 answered at once with joinOffPeer (design/distinction.md 4.2) - then peerWatch switches
// the open panel to 'peer' and the card goes.
// Generated pages (tools/run-all.js writes them after node build.js - jobs room-platform / peer-deploy; or serve
// C:/Temp/bogeul with node tools/serve.js and run the line below):
// rrp-peer-main.html; run: node tools/run-chrome.js http://localhost:8765/rrp-peer-main.html - 1200 900 rt300000 "RPD DONE"
(function () {
  'use strict';
  if (window.__RPD_DRIVER) return;
  window.__RPD_DRIVER = 1;
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => {
    if (cond) { pass++; log('RPD PASS ' + name); } else { fail++; log('RPD FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); }
    return !!cond;
  };
  const metric = (name, v) => log('RPD METRIC ' + name + ' ' + JSON.stringify(v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clock = () => performance.now();
  async function until(pred, ms, step) {
    const t0 = clock();
    for (;;) { let v = false; try { v = pred(); } catch (e) { v = false; } if (v) return v; if (clock() - t0 > ms) return false; await sleep(step || 30); }
  }

  // ---------------------------------------------------------------- fake PeerJS network
  const FP = (function () {
    const net = { lat: 40, jit: 20, peers: new Map(), made: 0, conns: 0, sends: 0, maxMsg: 0, errors: [], opts: [] };
    const rid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    const delay = () => net.lat + Math.random() * net.jit;
    function emitter(o) {
      const ls = new Map();
      o.on = (ev, fn) => { if (!ls.has(ev)) ls.set(ev, []); ls.get(ev).push(fn); return o; };
      o.off = (ev, fn) => { const a = ls.get(ev); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } return o; };
      o.once = (ev, fn) => { const w = (...x) => { o.off(ev, w); fn(...x); }; return o.on(ev, w); };
      o.emit = (ev, ...args) => { for (const fn of (ls.get(ev) || []).slice()) { try { fn(...args); } catch (e) { net.errors.push(ev + ': ' + (e && e.message)); } } };
      return o;
    }
    function makeConn(win, owner, remoteId, opts) {
      const c = emitter({ peer: remoteId, open: false, reliable: !!(opts && opts.reliable), serialization: (opts && opts.serialization) || 'binary', label: 'dc_' + rid(), other: null, closed: false, outAt: 0 });
      c.send = (data) => {
        if (!c.open || c.closed) { net.errors.push('send on a closed/not-open connection'); return; }
        const s = JSON.stringify(data);
        net.sends++; net.maxMsg = Math.max(net.maxMsg, s.length);
        const o = c.other;
        const at = Math.max(clock() + delay(), c.outAt); c.outAt = at;
        setTimeout(() => { if (o && !o.closed && o.open) o.emit('data', o.win.JSON.parse(s)); }, at - clock());
      };
      c.close = () => {
        if (c.closed) return;
        c.closed = true; c.open = false;
        c.emit('close');
        const o = c.other;
        if (o && !o.closed) setTimeout(() => { if (!o.closed) { o.closed = true; o.open = false; o.emit('close'); } }, delay());
        owner.conns.delete(c);
      };
      c.win = win;
      owner.conns.add(c);
      return c;
    }
    net.Peer = (win) => function Peer(id, opts) {
      if (typeof id === 'object' && id !== null) { opts = id; id = undefined; }
      const p = emitter(this);
      net.made++; net.opts.push(opts || null);
      p.conns = new Set(); p.destroyed = false; p.disconnected = false; p.open = false; p.id = null;
      setTimeout(() => {
        if (p.destroyed) return;
        const want = id || rid();
        if (net.peers.has(want)) { p.emit('error', Object.assign(new win.Error('ID "' + want + '" is taken'), { type: 'unavailable-id' })); p.destroy(); return; }
        p.id = want; p.open = true; net.peers.set(want, p);
        p.emit('open', want);
      }, 60 + Math.random() * 80);
      p.connect = (to, copts) => {
        const c = makeConn(win, p, to, copts);
        setTimeout(() => {
          const r = net.peers.get(to);
          if (!r || r.destroyed || p.destroyed) { p.emit('error', Object.assign(new win.Error('Could not connect to peer ' + to), { type: 'peer-unavailable' })); return; }
          const rc = makeConn(r.win, r, p.id, copts);
          rc.other = c; c.other = rc;
          net.conns++;
          r.emit('connection', rc);
          setTimeout(() => {
            if (c.closed || rc.closed) return;
            rc.open = true; c.open = true;
            rc.emit('open'); c.emit('open');
          }, delay() * 2);
        }, delay());
        return c;
      };
      p.destroy = () => {
        if (p.destroyed) return;
        p.destroyed = true; p.open = false;
        for (const c of Array.from(p.conns)) c.close();
        if (p.id && net.peers.get(p.id) === p) net.peers.delete(p.id);
        p.emit('close');
      };
      p.disconnect = () => { p.disconnected = true; p.emit('disconnected', p.id); };
      p.reconnect = () => { p.disconnected = false; };
      p.win = win;
    };
    return net;
  })();
  window.__FP = FP;

  // ---------------------------------------------------------------- frames
  const frames = [];
  const LAYOUT = [[0, 0], [600, 0], [0, 450], [600, 450]];
  function frame(who, query) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'rrp-peer-frame.html?who=' + who + (query ? '&' + query : '');
      const pos = LAYOUT[frames.length % LAYOUT.length];
      f.style.cssText = 'position:fixed;left:' + pos[0] + 'px;top:' + pos[1] + 'px;width:600px;height:450px;border:0';
      const t = setTimeout(() => reject(new Error('frame ' + who + ' did not load')), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        const okp = await until(() => w.PG && w.PG.debug && w.PG.debug.mp, 15000);
        clearTimeout(t);
        if (!okp) { reject(new Error('no PG.debug')); return; }
        const fr = { who, el: f, w, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, errors: [] };
        w.addEventListener('error', (e) => { fr.errors.push(e.message); log('RPD frame ' + who + ' error: ' + e.message); });
        w.addEventListener('unhandledrejection', (e) => { fr.errors.push('rejection ' + (e.reason && (e.reason.code || e.reason.message))); });
        frames.push(fr);
        resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  function drop(fr) { fr.el.remove(); const i = frames.indexOf(fr); if (i >= 0) frames.splice(i, 1); }
  const S = (fr) => fr.D.getState();
  const V = (fr) => fr.mp.view();
  const N = (fr) => fr.mp.state();
  const slotOf = (fr) => N(fr).mySlot;
  const me = (fr) => fr.G.players.find((p) => p.slot === slotOf(fr));
  const hp = (host, slot) => host.G.players.find((p) => p.slot === slot);
  const press = (fr, a, down) => fr.D.press(a, down, slotOf(fr));
  async function tap(fr, a, ms) { press(fr, a, true); await sleep(ms || 70); press(fr, a, false); }
  const txt = (fr, id) => { const e = fr.w.document.getElementById(id); return e ? e.textContent : null; };
  function parkAll(host) { for (const e of host.G.enemies) { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; } }
  function stillEnemy(host, e, x, y, dir) {
    Object.assign(e, { type: 'mold', state: 'active', x, y, vx: 0, vy: 0, onGround: true, angry: false, escaped: false, hopT: 99999, delay: 0, spawnY: y,
      jumpCd: 999, chargeCd: 999, windT: 0, chargeT: 0, committed: false, soakT: 0, dir: dir || -1, water: 0, grace: 0, bubble: null, ice: null });
    return e;
  }
  async function startRoom(F) {
    for (const f of F.slice(1)) f.mp.ready(true);
    await until(() => N(F[0]).canStart, 8000);
    const started = F[0].mp.start();
    return started && !!(await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online), 15000));
  }

  (async () => {
    try {
      // ---- PeerJS arriving late (deferred script on a slow link): 친구와 하기 opened before it is there
      const L = await frame('L', 'late=manual');
      L.mp.openFriends();
      await sleep(700);
      const d = L.w.document, note = d.getElementById('pg-net-note');
      const before = { tr: N(L).transport, note: txt(L, 'pg-net-note'), hostDisabled: d.getElementById('pg-host').disabled };
      // ---- until it arrives this is the page with PeerJS blocked (design/distinction.md 4.2, the 'peer' card): a block
      // card with a 새로고침 button, 방 만들기 off, 참여 answering at once with joinOffPeer, mp.host() refused
      const JOIN_OFF = '온라인 연결 도구가 없어요 · 새로고침해 주세요';
      const rb = note.querySelector('button');
      ok('blocked: the peer card (온라인 연결 도구를 불러오지 못했어요 + a 새로고침 button), no Claude text', before.tr === 'bc' && note.tagName === 'DIV' && note.classList.contains('is-block') && /온라인 연결 도구를 불러오지 못했어요/.test(note.textContent) &&
        /인터넷을 확인하고 새로고침해 주세요/.test(note.textContent) && !/Claude/.test(note.textContent) && !!rb && rb.textContent === '새로고침' && rb.type === 'button', { before, cls: note.className, btn: rb && rb.textContent });
      ok('blocked: 방 만들기 disabled (described by the card), 참여 enabled', before.hostDisabled && d.getElementById('pg-host').getAttribute('aria-describedby') === 'pg-net-note' && !d.getElementById('pg-join').disabled);
      const t0 = clock(), jr = await L.mp.join('ab12'), jms = clock() - t0;
      metric('blocked.join', { jr, ms: Math.round(jms) });
      ok('blocked: 참여 answers at once (< 300 ms) with joinOffPeer', !jr.ok && jr.code === 'room_off' && jms < 300 && txt(L, 'pg-friends-err') === JOIN_OFF, { jr, ms: jms, err: txt(L, 'pg-friends-err') });
      const hc = await L.mp.host({ mode: 'coop' });
      ok('blocked: mp.host() is refused with hostOffPeer', hc === null && txt(L, 'pg-friends-err') === JOIN_OFF && !N(L).role, { hc, err: txt(L, 'pg-friends-err') });
      L.w.__rpdDefinePeer();
      await sleep(1500);
      const afterArrive = { tr: N(L).transport, note: txt(L, 'pg-net-note') };
      metric('late.before_peer', before);
      metric('late.after_peer_arrived_same_panel', afterArrive);
      ok('late: once PeerJS has arrived the open panel switches to the peer transport (no stale "could not load" note)', afterArrive.tr === 'peer', { before, afterArrive });
      ok('late: ... the card is gone (plain note), both buttons enabled, the stale joinOffPeer line cleared', !note.classList.contains('is-block') && !note.querySelector('button') && /방 코드를 친구에게/.test(note.textContent) &&
        !d.getElementById('pg-host').disabled && !d.getElementById('pg-host').hasAttribute('aria-describedby') && !d.getElementById('pg-join').disabled && txt(L, 'pg-friends-err') === '', { cls: note.className, note: note.textContent, err: txt(L, 'pg-friends-err') });
      L.w.document.getElementById('pg-friends-back').click(); await sleep(200);
      L.mp.openFriends(); await sleep(600);
      metric('late.after_reopen', { tr: N(L).transport, note: txt(L, 'pg-net-note') });
      drop(L);

      // ---- two players over 'peer'
      const A = await frame('A');
      A.mp.openFriends();
      await until(() => N(A).transport, 4000);
      ok('peer: deploy page picks the peer transport', N(A).transport === 'peer', N(A).transport);
      ok('peer: the panel explains sharing the code', /방 코드를 친구에게/.test(txt(A, 'pg-net-note') || ''), txt(A, 'pg-net-note'));
      const code = await A.mp.host({ mode: 'coop', nick: '방장', char: 'duck' });
      ok('peer: host registers ppodeuk-<code> with PeerJS', !!code && FP.peers.has('ppodeuk-' + code), { code, ids: Array.from(FP.peers.keys()) });
      const B = await frame('B');
      const bad = await B.mp.join('zzzz', { nick: 'Bob' });
      metric('peer.join_unknown', bad);
      ok('peer: joining an unknown code -> 방을 찾을 수 없어요', !bad.ok && bad.code === 'not_found' && txt(B, 'pg-friends-err') === '방을 찾을 수 없어요', bad);
      const r = await B.mp.join(code, { nick: 'Bob', char: 'penguin' });
      ok('peer: B joins by code', r.ok, r);
      await until(() => N(A).roster.length === 2 && N(B).roster.length === 2, 6000);
      ok('peer: both rosters 2', N(A).roster.length === 2 && N(B).roster.length === 2);
      ok('peer: guest data connection is reliable + json', FP.opts.length > 0 && Array.from(FP.peers.values()).some((p) => Array.from(p.conns).some((c) => c.reliable && c.serialization === 'json')));
      const started = await startRoom([A, B]);
      ok('peer: co-op starts on both', started, [S(A).phase, S(B).phase]);
      if (started) {
        A.mp.trace(true);
        await sleep(1200);
        let same = 0;
        for (let i = 0; i < 6; i++) {
          const v = V(B), tr = A.mp.traceAt(Math.round(v.renderTick));
          if (tr) {
            const ids = (a) => a.slice().sort((x, y) => x - y).join(',');
            if (ids(tr.E.filter((e) => e[3] !== 'dead').map((e) => e[0])) === ids(v.enemies.filter((e) => e.state !== 'dead').map((e) => e.id))) same++;
          }
          await sleep(300);
        }
        ok('peer: guest view has the host\'s enemy ids (>= 5/6 samples)', same >= 5, same);
        parkAll(A); A.D.setInvincible(true);
        await sleep(500);
        const gm = me(B);
        const target = stillEnemy(A, A.G.enemies[0], gm.x + 44, gm.y, -1);
        await sleep(500);
        await tap(B, 'right', 40); await sleep(300); await tap(B, 'shoot', 60);
        const trapped = await until(() => target.state === 'trapped' || target.state === 'dead', 3000);
        ok('peer: guest shot traps an enemy in the host world', !!trapped, target.state);
        // battle round trip
        A.mp.toRoom();
        await until(() => N(B).screen === 'room', 5000);
        A.mp.setOpts({ mode: 'battle', arena: 1, time: 2 });
        await until(() => N(B).mode === 'battle', 3000);
        const bs = await startRoom([A, B]);
        ok('peer: battle starts on both', bs && S(B).mode === 'battle');
        if (bs) {
          A.D.setTimeLeft(1.0);
          const pod = await until(() => S(A).phase === 'podium' && S(B).phase === 'podium', 8000);
          ok('peer: podium on both', !!pod);
        }
        metric('peer.traffic', { sends: FP.sends, maxMsgChars: FP.maxMsg, conns: FP.conns });
        ok('peer: every message fits a PeerJS json channel (< 16 KB)', FP.maxMsg < 16000, FP.maxMsg);
      }
      // ---- the host closes its tab
      drop(A);
      const back = await until(() => N(B).screen === 'friends', 20000);
      ok('peer: host tab closed -> guest back with a Korean message', !!back && !!txt(B, 'pg-friends-err'), [N(B).screen, txt(B, 'pg-friends-err')]);
      metric('peer.host_closed_msg', txt(B, 'pg-friends-err'));
      for (const f of frames.slice()) ok('peer: no page errors (' + f.who + ')', !f.errors.length, f.errors);
      ok('peer: no fake-PeerJS misuse (send before open / listener throws)', !FP.errors.length, FP.errors.slice(0, 5));
      for (const f of frames.slice()) drop(f);
    } catch (e) { ok('driver threw', false, e && (e.stack || e.message)); }
    log('RPD DONE pass=' + pass + ' fail=' + fail);
  })();
})();
