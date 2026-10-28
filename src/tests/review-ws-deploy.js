// Deploy-page review WITH the relay (design/relay.md 11.3, run-all job ws-deploy): the STANDALONE page built with a relay
// URL (build.js's deploy-relay/ fixture) whose window.PG_RELAY line tools/run-all.js points at serve.js's local relay
// (tools/ws-relay.js: the real cloudflare/src/room.js behind the real gate), and whose PeerJS tag is swapped for
// review-peer-deploy.js's FAKE window.Peer (its signalling / data channels run through this page). The real game drives
// it through PG.debug.mp:
//   ws       the relay comes first WITHOUT waiting for PeerJS (?late=manual: PeerJS never arrives), 2 players over ws,
//            the share line + the ?join= kind of room, a co-op round on both pages, no PeerJS used at all
//   reseat   a host alone whose socket the relay drops (admin kill) re-seats with the same code: a friend then gets in
//   cap      the relay capped (admin cap): 방 만들기 falls back to a (fake) PeerJS room, the room hint says hintCap, the
//            hook says str 'peer' / fb 'cap'; a joiner (ws refused cap, then peer) finds it; back on its friends panel
//            the note says relayCap
//   space    a PR preview's copy (space p, rrp-ws-pv-frame.html) hosts a ws room a live page cannot find
//   netinfo  ?netinfo=1: the room hint ends with the transport and the round trip ("ws 12ms")
// rrp-ws-main.html; run: node tools/run-chrome.js http://localhost:8765/rrp-ws-main.html - 1200 900 rt240000 "RWD DONE"
(function () {
  'use strict';
  if (window.__RWD_DRIVER) return;
  window.__RWD_DRIVER = 1;
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => {
    if (cond) { pass++; log('RWD PASS ' + name); } else { fail++; log('RWD FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); }
    return !!cond;
  };
  const metric = (name, v) => log('RWD METRIC ' + name + ' ' + JSON.stringify(v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clock = () => performance.now();
  async function until(pred, ms, step) {
    const t0 = clock();
    for (;;) { let v = false; try { v = pred(); } catch (e) { v = false; } if (v) return v; if (clock() - t0 > ms) return false; await sleep(step || 30); }
  }
  const admin = (p) => fetch('/ws-admin/' + p, { cache: 'no-store' }).then((r) => r.json());

  // ---------------------------------------------------------------- fake PeerJS network (as review-peer-deploy.js)
  const FP = (function () {
    const net = { lat: 40, jit: 20, peers: new Map(), made: 0, conns: 0, errors: [] };
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
      net.made++;
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
  function frame(who, query, page) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = (page || 'rrp-ws-frame.html') + '?who=' + who + (query ? '&' + query : '');
      const pos = LAYOUT[frames.length % LAYOUT.length];
      f.style.cssText = 'position:fixed;left:' + pos[0] + 'px;top:' + pos[1] + 'px;width:600px;height:450px;border:0';
      const t = setTimeout(() => reject(new Error('frame ' + who + ' did not load')), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        const okp = await until(() => w.PG && w.PG.debug && w.PG.debug.mp, 15000);
        clearTimeout(t);
        if (!okp) { reject(new Error('no PG.debug')); return; }
        const fr = { who, el: f, w, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, errors: [] };
        w.addEventListener('error', (e) => { fr.errors.push(e.message); log('RWD frame ' + who + ' error: ' + e.message); });
        w.addEventListener('unhandledrejection', (e) => { fr.errors.push('rejection ' + (e.reason && (e.reason.code || e.reason.message))); });
        frames.push(fr);
        resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  function drop(fr) { try { fr.mp.leave(); } catch (e) { /* ignore */ } fr.el.remove(); const i = frames.indexOf(fr); if (i >= 0) frames.splice(i, 1); }
  const S = (fr) => fr.D.getState();
  const N = (fr) => fr.mp.state();
  const txt = (fr, id) => { const e = fr.w.document.getElementById(id); return e ? e.textContent : null; };
  const SHARE = /친구에게 이 게임 링크와 방 코드 [A-Z0-9]{4}를 보내 주세요/;
  const HINT_CAP = '오늘 무료 중계를 다 써서 직접 연결로 열었어요 · 오전 9시에 다시 채워져요';
  const RELAY_CAP = '오늘 무료 중계를 다 써서 오전 9시까지는 직접 연결만 돼요';
  async function startRoom(F) {
    for (const f of F.slice(1)) f.mp.ready(true);
    await until(() => N(F[0]).canStart, 8000);
    const started = F[0].mp.start();
    return started && !!(await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online), 15000));
  }

  (async () => {
    try {
      const info0 = await admin('info');
      if (!ok('the local relay answers (serve.js with tools/ws-relay.js)', !!(info0 && info0.rooms))) throw new Error('no relay');
      // ---- ws first, without waiting for PeerJS (it never arrives here)
      const A = await frame('A', 'late=manual');
      A.mp.openFriends();
      const picked = await until(() => N(A).transport, 3000);
      const d = A.w.document;
      ok('ws: the deploy page with a relay picks ws at once, without the PeerJS wait (PeerJS still loading)', picked === 'ws' && typeof A.w.Peer !== 'function', [N(A).transport, typeof A.w.Peer]);
      ok('ws: the panel says to share the code, 방 만들기 on (no 연결 도구를 불러오는 중)', /방 코드를 친구에게/.test(txt(A, 'pg-net-note') || '') && !d.getElementById('pg-host').disabled, [txt(A, 'pg-net-note'), d.getElementById('pg-host').disabled]);
      const code = await A.mp.host({ mode: 'coop', nick: '방장', char: 'duck' });
      const info1 = await admin('info');
      ok('ws: 방 만들기 -> a relay room (the hook: str ws, fb null)', !!code && N(A).str === 'ws' && N(A).fb === null && info1.rooms['w:' + code] && info1.rooms['w:' + code].seats === 1, [code, N(A).str, N(A).fb]);
      ok('ws: the room hint is the share line (code rooms: codeTr)', SHARE.test(txt(A, 'pg-room-hint') || ''), txt(A, 'pg-room-hint'));
      const B = await frame('B', 'late=manual');
      const bad = await B.mp.join('zzzz', { nick: 'Bob' });
      ok('ws: an unknown code -> 방을 찾을 수 없어요 (the relay 4404, then PeerJS... still loading: no answer from it)', !bad.ok && bad.code === 'not_found' && txt(B, 'pg-friends-err') === '방을 찾을 수 없어요', [bad, txt(B, 'pg-friends-err')]);
      const r = await B.mp.join(code, { nick: 'Bob', char: 'penguin' });
      ok('ws: B joins by code over the relay', r.ok && N(B).str === 'ws', [r, N(B).str]);
      await until(() => N(A).roster.length === 2 && N(B).roster.length === 2, 6000);
      ok('ws: both rosters 2', N(A).roster.length === 2 && N(B).roster.length === 2);
      const started = await startRoom([A, B]);
      ok('ws: co-op starts on both', started, [S(A).phase, S(B).phase]);
      if (started) {
        await sleep(1500);
        const v = B.mp.view();
        ok('ws: the guest sees the host\'s world (enemies, a render clock)', v && v.enemies && v.enemies.length > 0 && v.renderTick > 0, v && [v.enemies && v.enemies.length, v.renderTick]);
        metric('ws.rtt', N(B).stats);
      }
      ok('ws: no PeerJS was used at all', FP.made === 0, FP.made);
      drop(B); drop(A);
      await sleep(500);

      // ---- a host alone re-seats (the KakaoTalk moment)
      const H = await frame('H');
      const hc = await H.mp.host({ mode: 'battle', nick: '혼자', char: 'cat' });
      const before = (await admin('info')).rooms['w:' + hc];
      const k = await admin('kill?code=' + hc);
      await sleep(1500);
      const after = (await admin('info')).rooms['w:' + hc];
      ok('reseat: the relay drops a host alone (kill) -> it re-seats with the same seat, its room screen stays', k.killed === 1 && N(H).screen === 'room' && N(H).code === hc && after && before && after.host === before.host, [k, N(H).screen, before, after]);
      const C = await frame('C');
      const rc = await C.mp.join(hc, { nick: '친구', char: 'frog' });
      ok('reseat: ... a friend then gets in with the code', rc.ok && (await until(() => N(H).roster.length === 2, 5000)), [rc, N(H).roster.length]);
      drop(C); drop(H);
      await sleep(500);

      // ---- the relay capped: the fallback to PeerJS, the hints
      await admin('cap?on=1');
      const P1 = await frame('P1');
      const pc = await P1.mp.host({ mode: 'coop', nick: '방장2', char: 'duck' });
      ok('cap: 방 만들기 falls back to a PeerJS room (the hook: str peer, fb cap)', !!pc && N(P1).str === 'peer' && N(P1).fb === 'cap' && FP.peers.has('ppodeuk-' + pc), [pc, N(P1).str, N(P1).fb]);
      ok('cap: the room hint says so (hintCap)', txt(P1, 'pg-room-hint') === HINT_CAP, txt(P1, 'pg-room-hint'));
      const P2 = await frame('P2');
      const rp = await P2.mp.join(pc, { nick: '친구2', char: 'otter' });
      ok('cap: a joiner (the relay says cap, then PeerJS) finds the room', rp.ok && N(P2).str === 'peer' && (await until(() => N(P1).roster.length === 2, 5000)), [rp, N(P2).str]);
      ok('cap: ... the guest sees the usual share line (the fallback line is the host\'s news)', SHARE.test(txt(P2, 'pg-room-hint') || ''), txt(P2, 'pg-room-hint'));
      P2.mp.leave();
      await until(() => N(P2).screen === 'friends', 4000);
      ok('cap: back on its friends panel, the note says the free relay is used up (relayCap)', txt(P2, 'pg-net-note') === RELAY_CAP, txt(P2, 'pg-net-note'));
      const miss = await P2.mp.join('qq77', { nick: '친구2' });
      ok('cap: a failed join while capped gets the capTail', !miss.ok && txt(P2, 'pg-friends-err') === '방을 찾을 수 없어요 · 오늘 무료 중계는 오전 9시에 다시 채워져요', txt(P2, 'pg-friends-err'));
      await admin('cap?on=0');
      drop(P2); drop(P1);
      await sleep(500);

      // ---- spaces: a PR preview's rooms are not the live game's
      const PV = await frame('PV', '', 'rrp-ws-pv-frame.html');
      const vc = await PV.mp.host({ mode: 'coop', nick: '미리', char: 'duck' });
      const iv = await admin('info');
      ok('space: a preview page hosts in the relay space p', !!vc && N(PV).str === 'ws' && !!iv.rooms['p:' + vc] && !iv.rooms['w:' + vc], [vc, Object.keys(iv.rooms)]);
      const LW = await frame('LW');
      const lw = await LW.mp.join(vc, { nick: '라이브' });
      ok('space: ... a live page cannot find that room (방을 찾을 수 없어요)', !lw.ok && lw.code === 'not_found', lw);
      drop(LW); drop(PV);
      await sleep(500);

      // ---- ?netinfo=1
      const NI = await frame('NI', 'netinfo=1');
      const nc = await NI.mp.host({ mode: 'coop', nick: '측정', char: 'duck' });
      const NJ = await frame('NJ', 'netinfo=1');
      await NJ.mp.join(nc, { nick: '손님' });
      const got = await until(() => / · ws \d+ms$/.test(txt(NJ, 'pg-room-hint') || ''), 8000);
      ok('netinfo: ?netinfo=1 ends the room hint with "ws <rtt>ms" (refreshed every second)', !!got && / · ws (\d+ms|-)$/.test(txt(NI, 'pg-room-hint') || ''), [txt(NJ, 'pg-room-hint'), txt(NI, 'pg-room-hint')]);
      metric('netinfo.hint', txt(NJ, 'pg-room-hint'));
      for (const f of frames.slice()) ok('no page errors (' + f.who + ')', !f.errors.length, f.errors);
      ok('no fake-PeerJS misuse', !FP.errors.length, FP.errors.slice(0, 5));
      for (const f of frames.slice()) drop(f);
    } catch (e) { ok('driver threw', false, e && (e.stack || e.message)); }
    try { await admin('cap?on=0'); } catch (e) { /* ignore */ }
    log('RWD DONE pass=' + pass + ' fail=' + fail);
  })();
})();
