// UX review driver (v3): stages every screen / state of the online game in same-origin iframes of preview.html and
// fills the window with the frame to look at. Driven from outside over the DevTools protocol (a Node script calls
// UX.build(name), resizes the window, UX.touch(), UX.refresh(), screenshots, UX.measure()).
//   node bogeul/build.js ; node bogeul/tools/serve.js
//   page: http://localhost:8765/test-ux-review.html   (logs "UXDRV LOADED")
// Read-only with respect to the game: it only uses PG.debug / PG.debug.mp and clicks the page's own buttons.
(function () {
  'use strict';
  const log = (s) => console.log(s);
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
  try { PG.debug.G.manual = true; } catch (e) { /* ignore */ }
  try { PG.debug.G.attract = false; } catch (e) { /* ignore */ }
  document.body.style.background = '#061518';
  const LINK = 'lat=25&jit=30&drop=0.025';

  // ---------------------------------------------------------------- frames
  const frames = [];
  const errors = [];
  const LAYOUT = [[0, 0], [600, 0], [0, 450], [600, 450], [300, 225]];
  function frame(i, opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'preview.html?' + (opts.query !== undefined ? opts.query : 'net=bc&' + LINK) + '&frame=' + i;
      const pos = LAYOUT[i % LAYOUT.length];
      f.style.cssText = 'position:fixed;left:' + pos[0] + 'px;top:' + pos[1] + 'px;width:600px;height:450px;border:0;z-index:' + (10 + i) + ';background:#0a2327';
      const t = setTimeout(() => reject(new Error('frame ' + i + ' did not load')), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        const okp = await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.Net, 15000);
        clearTimeout(t);
        if (!okp) { reject(new Error('frame ' + i + ' has no PG.debug.mp')); return; }
        const fr = { i, el: f, w, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G };
        w.addEventListener('error', (e) => { errors.push('frame ' + i + ': ' + e.message); log('UX frame ' + i + ' page error: ' + e.message + ' @' + e.lineno); });
        w.addEventListener('unhandledrejection', (e) => { errors.push('frame ' + i + ' rejection ' + (e.reason && e.reason.message)); });
        frames.push(fr);
        resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  const S = (fr) => fr.D.getState();
  const N = (fr) => fr.mp.state();
  const slotOf = (fr) => N(fr).mySlot;
  const press = (fr, a, down) => fr.D.press(a, down, slotOf(fr));
  const allIdle = (fr) => { for (const a of ['left', 'right', 'jump', 'shoot']) press(fr, a, false); };
  async function room(n, mode, hostOpts, chars, nicks) {
    chars = chars || ['duck', 'cat', 'frog', 'otter', 'capy'];
    nicks = nicks || ['뽀송', '냥냥펀치', '개굴개굴', '해달이', '다섯째'];
    const F = [];
    for (let i = 0; i < n; i++) F.push(await frame(frames.length));
    const host = F[0];
    const code = await host.mp.host(Object.assign({ mode, nick: nicks[0], char: chars[0] }, hostOpts || {}));
    for (let i = 1; i < n; i++) {
      const r = await F[i].mp.join(code, { nick: nicks[i], char: chars[i] });
      if (!r.ok) log('UX INFO join failed ' + JSON.stringify(r));
    }
    await until(() => N(host).roster.length === n && F.slice(1).every((f) => N(f).roster.length === n), 6000);
    return { F, host, code };
  }
  async function startRoom(F, noWait) {
    for (const f of F.slice(1)) f.mp.ready(true);
    await until(() => N(F[0]).canStart, 6000);
    const started = F[0].mp.start();
    if (noWait) return started;
    return started && !!(await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online), 12000));
  }
  // jiggle everyone a bit so the scene looks like play
  async function play(F, ms, pShoot) {
    const t0 = clock();
    while (clock() - t0 < ms) { for (const f of F) for (const a of ['left', 'right', 'jump', 'shoot']) press(f, a, Math.random() < (a === 'shoot' ? (pShoot || 0.4) : 0.3)); await sleep(200); }
    for (const f of F) allIdle(f);
  }

  // ---------------------------------------------------------------- the fake artifact 'room' runtime (from mp-net.js)
  function makeRoomPlatform() {
    const pf = { latency: 40, jitter: 25, rooms: new Map(), violations: [], maxRate: 0, sends: 0, labelN: 0 };
    const members = (name) => { let s = pf.rooms.get(name); if (!s) { s = new Set(); pf.rooms.set(name, s); } return s; };
    const rerr = (code, m) => Object.assign(new Error(m || code), { code });
    const EMPTY = Object.freeze([]);
    const freeze = (o) => { if (o && typeof o === 'object') { Object.freeze(o); for (const k of Object.keys(o)) freeze(o[k]); } return o; };
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
      const h = { page, name, active: true, mine: {}, mineF: freeze({}), myAt: Date.now(), selfObj: null, view: new Map(), snap: null,
        peerL: [], connL: [], pend: new Map(), batchT: null, sendT: null, lastSend: -1e9, pairs: new Map(), ver: 0, readyAt: performance.now() + pf.latency };
      h.connected = () => h.active && performance.now() >= h.readyAt;
      h.fireConn = () => { const c = h.connected(); for (const l of h.connL) if (l.live && l.last !== c) { l.last = c; l.fn(c); } };
      h.self = () => { if (!h.selfObj) h.selfObj = Object.freeze({ peer: page.label, by: page.userId, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: h.mineF, updatedAt: h.myAt }); return h.selfObj; };
      h.peers = () => {
        if (!h.active || performance.now() < h.readyAt) return EMPTY;
        if (!h.snap) { const a = [h.self()]; for (const v of h.view.values()) a.push(v.obj); h.snap = Object.freeze(a); }
        return h.snap;
      };
      h.pair = (o) => { let l = h.pairs.get(o); if (!l) { l = fifo(); h.pairs.set(o, l); } return l; };
      h.deliverTo = (o) => { if (!h.active) return; const snap = h.mineF, ver = ++h.ver; h.pair(o).push(performance.now() + pf.latency + Math.random() * pf.jitter, () => o.receive(h, snap, ver)); };
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
        if (!h.active) return Promise.reject(rerr('invalid_argument', 'room was left'));
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return Promise.reject(rerr('invalid_argument'));
        const merged = Object.assign({}, h.mine);
        for (const k of Object.keys(patch)) { if (patch[k] === null) delete merged[k]; else merged[k] = patch[k]; }
        if (!plain(merged)) return Promise.reject(rerr('invalid_argument'));
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
      const page = { label: 'pg' + (++pf.labelN) + Math.random().toString(36).slice(2, 8), userId: 'u' + pf.labelN, nick, handles: new Map(), calls: [] };
      page.lobby = handle(page, '');
      const user = Object.freeze({ me: async () => ({ id: page.userId, name: nick, avatarUrl: 'data:,', color: '#888888', email: null, isOwner: false, canEdit: false }) });
      page.claude = Object.freeze({ use: (n) => new Promise((res) => setTimeout(() => res(n === 'room' ? page.lobby.ns : n === 'user' ? user : null), 5)) });
      return page;
    };
    return pf;
  }
  async function roomFrame(pf, nick) {
    const fr = await frame(frames.length, { query: 'room=1' });
    fr.page = pf.newPage(nick);
    fr.w.claude = fr.page.claude;
    return fr;
  }

  // ---------------------------------------------------------------- view helpers
  let shown = null, refreshFn = null;
  function fill(fr) {
    shown = fr;
    for (const f of frames) if (f !== fr) f.el.style.zIndex = String(1 + f.i);
    fr.el.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;z-index:99;background:#0a2327';
  }
  const $ = (fr, id) => fr.w.document.getElementById(id);
  const click = (fr, sel) => { const el = typeof sel === 'string' ? fr.w.document.querySelector(sel) : sel; if (!el) throw new Error('no ' + sel); el.click(); return el; };
  const hostPl = (host, slot) => host.G.players.find((p) => p.slot === slot);

  // ---------------------------------------------------------------- scenes
  const SCENES = {
    async title() { const f = await frame(0, { query: 'plain=1' }); fill(f); await sleep(800); },
    async 'title-cat'() { const f = await frame(0, { query: 'plain=1' }); click(f, '#pg-pick [data-char="cat"]'); fill(f); await sleep(600); },
    async 'solo-otter'() {
      const f = await frame(0, { query: 'plain=1' });
      click(f, '#pg-pick [data-char="otter"]'); click(f, '#pg-start'); fill(f);
      await sleep(3500);
    },
    async friends() { const f = await frame(0); f.mp.setNick('뽀송이'); f.mp.openFriends(); fill(f); await sleep(800); },
    async 'friends-battle'() { const f = await frame(0); f.mp.setNick('뽀송이'); f.mp.openFriends(); click(f, '#pg-friends [data-mode="battle"]'); fill(f); await sleep(800); },
    async friendsnote() { const f = await frame(0, { query: 'plain=1' }); f.mp.openFriends(); fill(f); await sleep(900); },
    async 'lobby-empty'() {
      const pf = makeRoomPlatform();
      const A = await roomFrame(pf, '민지');
      A.mp.openFriends(); fill(A);
      await until(() => !$(A, 'pg-games-box').hidden, 5000); await sleep(600);
    },
    async 'lobby-list'() {
      const pf = makeRoomPlatform();
      const H1 = await roomFrame(pf, '하늘이');
      await H1.mp.host({ mode: 'coop', char: 'capy', nick: '하늘이' });
      const H2 = await roomFrame(pf, '배틀왕');
      await H2.mp.host({ mode: 'battle', char: 'cat', nick: '배틀왕' });
      const H3 = await roomFrame(pf, 'Jonathan_Kim');
      await H3.mp.host({ mode: 'coop', char: 'frog', nick: 'Jonathan_Kim' });
      const A = await roomFrame(pf, '민지');
      A.mp.openFriends(); fill(A);
      await until(() => A.w.document.querySelectorAll('#pg-games .pg-game').length >= 3, 6000); await sleep(600);
    },
    async 'copy-code'() {
      const f = await frame(0); await f.mp.host({ mode: 'coop', nick: '뽀송', char: 'duck' }); fill(f); await sleep(500);
      // block the async clipboard (as a sandboxed frame without clipboard-write would) and see what the button says
      try { Object.defineProperty(f.w.navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('NotAllowedError')) }, configurable: true }); } catch (e) { log('UX cannot stub clipboard ' + e.message); }
      click(f, '#pg-copy'); await sleep(120);
      log('UX copy button after click: "' + $(f, 'pg-copy').textContent + '"');
      refreshFn = async () => { click(f, '#pg-copy'); await sleep(120); };
    },
    async 'room-host1'() { const f = await frame(0); await f.mp.host({ mode: 'coop', nick: '뽀송', char: 'duck' }); fill(f); await sleep(800); },
    async 'room-host-battle2'() {
      const { F } = await room(2, 'battle', { arena: 1, time: 3 }, ['duck', 'capy'], ['뽀송', '까삐랑']);
      fill(F[0]); await sleep(800);
    },
    async 'room-guest-battle2'() {
      const { F } = await room(2, 'battle', { arena: 1, time: 3 }, ['duck', 'capy'], ['뽀송', '까삐랑']);
      fill(F[1]); await sleep(800);
    },
    async 'room-host4-ready'() {
      const { F } = await room(4, 'coop', {}, ['duck', 'capy', 'otter', 'penguin'], ['뽀송', '까삐랑', '해달이', '펭귄대장']);
      for (const f of F.slice(1)) f.mp.ready(true);
      await until(() => N(F[0]).canStart, 4000); fill(F[0]); await sleep(700);
    },
    async 'room-guest4-ready'() {
      const { F } = await room(4, 'coop', {}, ['duck', 'capy', 'otter', 'penguin'], ['뽀송', '까삐랑', '해달이', '펭귄대장']);
      for (const f of F.slice(1)) f.mp.ready(true);
      await until(() => N(F[0]).canStart, 4000); fill(F[2]); await sleep(700);
    },
    async 'room-longnick'() {
      const { F } = await room(4, 'battle', { arena: -1, time: 5 }, ['cat', 'frog', 'penguin', 'otter'],
        ['뽀송뽀송뽀송뽀송뽀송뽀송', 'WWWWWWWWWWWW', '가나다라마바사아자차카타', 'mmmmmmmmmmmm']);
      F[1].mp.ready(true);
      await sleep(600); fill(F[1]); await sleep(700);
      window.__long = F;
    },
    async 'start-timeline'() {
      const { F } = await room(2, 'coop', {}, ['duck', 'capy'], ['뽀송', '까삐랑']);
      F[0].mp.ready && F[1].mp.ready(true);
      await until(() => N(F[0]).canStart, 4000);
      F[0].mp.start();
      const seen = []; const t0 = clock();
      while (clock() - t0 < 8000) {
        const d = F[1].w.document, bn = d.getElementById('pg-banner');
        const txt = bn && !bn.hidden ? bn.textContent.replace(/s+/g, ' ').trim() : '';
        const row = S(F[1]).phase + ' | ' + txt;
        if (!seen.length || seen[seen.length - 1][1] !== row) seen.push([Math.round(clock() - t0), row]);
        await sleep(100);
      }
      log('UX start timeline (guest): ' + JSON.stringify(seen));
      fill(F[1]);
    },
    async countdown() {
      const { F } = await room(4, 'coop', {}, ['duck', 'capy', 'otter', 'frog'], ['뽀송', '까삐랑', '해달이', '개굴']);
      await startRoom(F, true);
      await until(() => S(F[2]).phase === 'countdown', 4000);
      fill(F[2]); await sleep(150);
    },
    async 'coop4-hud'() {
      const { F, host } = await room(4, 'coop', {}, ['duck', 'capy', 'otter', 'frog'], ['뽀송', '까삐랑', '해달이', '개굴']);
      await startRoom(F);
      host.D.setInvincible(true); for (const f of F) f.D.setInvincible(true);
      fill(F[2]);
      await play(F, 4000);
      await sleep(250);
    },
    async 'coop-ghost-self'() { await ghostScene(1, 'guest'); },
    async 'coop-ghost-other'() { await ghostScene(2, 'guest'); },
    async 'coop-ghost-hostview'() { await ghostScene(1, 'host'); },
    async 'coop-revive'() { await ghostScene(2, 'host', true); },
    async 'battle4-hud'() {
      const { F, host } = await room(4, 'battle', { arena: 0, time: 3 }, ['duck', 'cat', 'frog', 'penguin'], ['뽀송', '냥냥', '개굴', '펭귄대장']);
      await startRoom(F);
      host.D.setInvincible(true); for (const f of F) f.D.setInvincible(true);
      fill(F[1]);
      await play(F, 5000, 0.5);
      await sleep(250);
    },
    async 'battle-trapped'() {
      const { F, host } = await room(4, 'battle', { arena: 2, time: 3 }, ['duck', 'cat', 'frog', 'penguin'], ['뽀송', '냥냥', '개굴', '펭귄대장']);
      await startRoom(F);
      await sleep(2500);
      fill(F[1]);
      refreshFn = async () => { const v = hostPl(host, 1); if (v && !v.trap) host.D.trapPlayer(1, 2); await sleep(500); };
      await refreshFn();
    },
    async 'battle-trapped-other'() {
      const { F, host } = await room(4, 'battle', { arena: 2, time: 3 }, ['duck', 'cat', 'frog', 'penguin'], ['뽀송', '냥냥', '개굴', '펭귄대장']);
      await startRoom(F);
      await sleep(2500);
      fill(F[3]);
      refreshFn = async () => { const v = hostPl(host, 1); if (v && !v.trap) host.D.trapPlayer(1, 2); await sleep(500); };
      await refreshFn();
    },
    async 'battle-stun'() {
      const { F, host } = await room(4, 'battle', { arena: 0, time: 3 }, ['duck', 'cat', 'frog', 'penguin'], ['뽀송', '냥냥', '개굴', '펭귄대장']);
      await startRoom(F);
      await sleep(2500);
      fill(F[2]);
      // a guest's own stun is decided by the host in battle: hit slot 2 on the host
      refreshFn = async () => { host.D.hitPlayer(2); await sleep(300); };
      await refreshFn();
    },
    async 'battle-ko'() {
      const { F, host } = await room(4, 'battle', { arena: 0, time: 3 }, ['duck', 'cat', 'frog', 'penguin'], ['뽀송', '냥냥', '개굴', '펭귄대장']);
      await startRoom(F);
      await sleep(2500);
      fill(F[0]);
      let k = 0;
      refreshFn = async () => {
        const vs = [1, 2, 3]; let v = null;
        for (let j = 0; j < 3 && !v; j++) { const c = hostPl(host, vs[(k + j) % 3]); if (c && !c.trap && !c.koT) v = c; }
        k++;
        if (!v) return;
        v.invuln = 0;
        host.D.trapPlayer(v.slot, v.slot === 3 ? 2 : 3);
        await sleep(350);
        const me = hostPl(host, 0), b = v.trap && v.trap.b;
        if (b) { me.x = b.x; me.y = b.y + 2; me.vx = 0; me.vy = 0; }
        await sleep(220);
      };
      await refreshFn();
    },
    async 'battle-intrude'() {
      const { F, host } = await room(4, 'battle', { arena: 1, time: 2 }, ['duck', 'cat', 'frog', 'penguin'], ['뽀송', '냥냥', '개굴', '펭귄대장']);
      await startRoom(F);
      fill(F[1]);
      host.D.setTimeLeft(91.5);
      await sleep(2200);
      refreshFn = async () => { host.G.boss = null; host.G.battle.intruded = false; host.D.intrude(); await sleep(700); };
    },
    async 'battle-intrude-late'() {
      const { F, host } = await room(4, 'battle', { arena: 1, time: 2 }, ['duck', 'cat', 'frog', 'penguin'], ['뽀송', '냥냥', '개굴', '펭귄대장']);
      await startRoom(F);
      host.D.setInvincible(true); for (const f of F) f.D.setInvincible(true);
      fill(F[1]);
      host.D.setTimeLeft(91.5);
      await play(F, 6000, 0.6);
      log('UX boss host ' + JSON.stringify(host.D.getState().boss) + ' guest ' + JSON.stringify(F[1].mp.view().boss));
    },
    async 'battle-10s'() {
      const { F, host } = await room(2, 'battle', { arena: 3, time: 2, intrusion: false }, ['duck', 'cat'], ['뽀송', '냥냥']);
      await startRoom(F);
      fill(F[1]);
      refreshFn = async () => { host.D.setTimeLeft(10.3); await sleep(600); };
      await refreshFn();
    },
    async 'pause-guest'() {
      const { F } = await room(3, 'coop', {}, ['duck', 'otter', 'frog'], ['뽀송', '해달이', '개굴']);
      await startRoom(F);
      await sleep(1500);
      click(F[1], '#pg-pausebtn'); fill(F[1]); await sleep(600);
    },
    async 'pause-host'() {
      const { F } = await room(3, 'battle', { arena: 0 }, ['duck', 'otter', 'frog'], ['뽀송', '해달이', '개굴']);
      await startRoom(F);
      await sleep(1500);
      click(F[0], '#pg-pausebtn'); fill(F[0]); await sleep(600);
    },
    async 'coop-over'() { await coopOver(1); },
    async 'coop-over-score'() { await coopOver(1, 23450); log('UX guest over card: score=' + $(shown, 'pg-over-score').textContent + ' hi=' + $(shown, 'pg-over-hi').textContent + ' newHi=' + !$(shown, 'pg-over-new').hidden + ' | host card: score=' + $(frames[0], 'pg-over-score').textContent + ' hi=' + $(frames[0], 'pg-over-hi').textContent + ' newHi=' + !$(frames[0], 'pg-over-new').hidden); },
    async 'coop-over-host'() { await coopOver(0); },
    async 'podium-host'() { await podium(0); },
    async 'podium-guest'() { await podium(2); },
    async 'podium-2p'() {
      const { F, host } = await room(2, 'battle', { arena: 3, time: 2 }, ['frog', 'capy'], ['개굴', '까삐랑']);
      await startRoom(F);
      hostPl(host, 0).score = 3200; hostPl(host, 1).score = 2100;
      host.D.setTimeLeft(0.5);
      await until(() => F.every((f) => S(f).phase === 'podium'), 6000);
      fill(F[1]); await sleep(2000);
    },
    async 'coop-ending'() {
      const { F, host } = await room(2, 'coop', {}, ['duck', 'capy'], ['뽀송', '까삐랑']);
      await startRoom(F);
      host.D.setInvincible(true); for (const f of F) f.D.setInvincible(true);
      host.D.gotoRound(23);
      await sleep(4000);
      host.D.killAll();
      const ok = await until(() => F.every((f) => S(f).phase === 'ending'), 30000);
      log('UX ending reached ' + ok);
      fill(F[1]); await sleep(1500);
    },
    async 'err-badcode'() {
      const f = await frame(0); f.mp.openFriends(); fill(f); await sleep(300);
      $(f, 'pg-code').value = 'ab1'; click(f, '#pg-join'); await sleep(500);
    },
    async 'chip-connecting'() {
      const f = await frame(0); f.mp.openFriends(); fill(f); await sleep(300);
      $(f, 'pg-code').value = 'zzzz'; click(f, '#pg-join'); await sleep(350);
    },
    async 'err-notfound'() {
      const f = await frame(0); f.mp.openFriends(); fill(f); await sleep(300);
      $(f, 'pg-code').value = 'zzzz'; click(f, '#pg-join');
      await until(() => $(f, 'pg-friends-err').textContent, 15000); await sleep(300);
    },
    async 'err-full'() {
      const { F, code } = await room(4, 'coop', {}, ['duck', 'capy', 'otter', 'frog'], ['뽀송', '까삐랑', '해달이', '개굴']);
      const g = await frame(4); g.mp.setNick('다섯째'); g.mp.openFriends(); fill(g); await sleep(200);
      $(g, 'pg-code').value = code.toUpperCase(); click(g, '#pg-join');
      await until(() => $(g, 'pg-friends-err').textContent, 15000); await sleep(300);
    },
    async 'err-playing'() {
      const { F, code } = await room(2, 'coop', {}, ['duck', 'capy'], ['뽀송', '까삐랑']);
      await startRoom(F);
      const g = await frame(2); g.mp.setNick('늦은친구'); g.mp.openFriends(); fill(g); await sleep(200);
      $(g, 'pg-code').value = code.toUpperCase(); click(g, '#pg-join');
      await until(() => $(g, 'pg-friends-err').textContent, 15000); await sleep(300);
    },
    async 'err-hostleft'() {
      const { F } = await room(2, 'coop', {}, ['duck', 'capy'], ['뽀송', '까삐랑']);
      await startRoom(F);
      await sleep(1000);
      fill(F[1]);
      F[0].mp.leave();
      await until(() => N(F[1]).screen === 'friends', 25000); await sleep(400);
    },
    async 'chip-unstable'() {
      const { F } = await room(2, 'coop', {}, ['duck', 'capy'], ['뽀송', '까삐랑']);
      await startRoom(F);
      await sleep(1000);
      fill(F[1]);
      F[0].w.BroadcastChannel.prototype.postMessage = function () {};
      await until(() => N(F[1]).chip, 8000); await sleep(200);
      window.__unstable = F;
    },
    async 'err-lost'() {
      const { F } = await room(2, 'coop', {}, ['duck', 'capy'], ['뽀송', '까삐랑']);
      await startRoom(F);
      await sleep(1000);
      fill(F[1]);
      F[0].w.BroadcastChannel.prototype.postMessage = function () {};
      await until(() => N(F[1]).screen === 'friends', 20000); await sleep(400);
    },
    async sheet() {
      // the six animals' sprites from the page's own sprite table, at 1x (true size) and 4x, on dark and light ground
      const P = window.PG.PALETTE, SP = window.PG.SPRITES;
      const C = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'];
      const kinds = ['_idle', '_walk', '_jump', '_fall', '_shoot', '_die', '_trapped', '_ghost'];
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:200;background:#0a2327;overflow:auto;color:#fbf0d9;font:12px system-ui;padding:8px';
      const draw = (name, i, scale, bg) => {
        const f = (SP[name] || [])[i]; const cv = document.createElement('canvas');
        if (!f) { cv.width = 16 * scale; cv.height = 16 * scale; return cv; }
        cv.width = f[0].length * scale; cv.height = f.length * scale;
        const x = cv.getContext('2d'); if (bg) { x.fillStyle = bg; x.fillRect(0, 0, cv.width, cv.height); }
        f.forEach((r, y) => { for (let k = 0; k < r.length; k++) { const ch = r[k]; if (ch === '.') continue; x.fillStyle = P[ch]; x.fillRect(k * scale, y * scale, scale, scale); } });
        cv.style.marginRight = '3px'; cv.style.imageRendering = 'pixelated';
        return cv;
      };
      for (const scale of [1, 3]) {
        for (const bg of ['#0a2327', '#cfe9ef']) {
          const row = document.createElement('div'); row.style.cssText = 'margin:4px 0;padding:4px;background:' + bg;
          for (const c of C) {
            const g = document.createElement('span'); g.style.cssText = 'display:inline-block;margin-right:10px;vertical-align:top';
            for (const k of kinds) { const n = (SP[c + k] || []).length; for (let i = 0; i < n; i++) g.appendChild(draw(c + k, i, scale)); }
            g.appendChild(draw('life_' + c, 0, scale)); g.appendChild(draw('portrait_' + c, 0, scale));
            row.appendChild(g); row.appendChild(document.createElement('br'));
          }
          wrap.appendChild(row);
        }
      }
      const ui = document.createElement('div'); ui.style.cssText = 'background:#0a2327;padding:4px';
      for (const n of ['crown', 'tag_arrow', 'ready', 'life']) ui.appendChild(draw(n, 0, 4));
      wrap.appendChild(ui);
      document.body.appendChild(wrap);
      shown = { w: window, el: wrap };
      await sleep(200);
    },
  };
  function parkAll(host) { for (const e of host.G.enemies) { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; } }
  function stillEnemy(host, e, x, y, dir) {
    Object.assign(e, { type: 'mold', state: 'active', x, y, vx: 0, vy: 0, onGround: true, angry: false, escaped: false, hopT: 99999, delay: 0, spawnY: y,
      jumpCd: 999, chargeCd: 999, windT: 0, chargeT: 0, committed: false, soakT: 0, dir: dir || -1, water: 0, grace: 0, bubble: null, ice: null });
    return e;
  }
  // co-op ghost: 'host' = the host's duck falls on the upper shelf (seen by view frame); 'guest' = a guest (penguin) falls
  async function ghostScene(view, who, revive) {
    const { F, host } = await room(3, 'coop', {}, ['duck', 'penguin', 'cat'], ['뽀송', '펭귄대장', '냥냥']);
    await startRoom(F);
    await sleep(2400);
    if (who === 'host') {
      host.D.setPlayer(150, 64, 0);
      await sleep(400);
      host.D.hitPlayer(0);
      await until(() => hostPl(host, 0).ghost, 3000);
    } else {
      host.D.setInvincible(true);
      const g = F[1], me = g.G.players.find((p) => p.local);
      g.D.setPlayer(150, 64, slotOf(g));
      await sleep(600);
      host.D.setInvincible(false);
      stillEnemy(host, host.G.enemies[0], me.x, me.y, -1);
      await until(() => hostPl(host, 1).ghost, 4000);
      parkAll(host);
    }
    await sleep(900);
    fill(F[view]);
    if (revive) {
      const gs = who === 'host' ? 0 : 1;
      refreshFn = async () => {
        const hp = hostPl(host, gs);
        if (hp && hp.ghost) { const f = F[2]; f.D.setPlayer(hp.x, hp.y, slotOf(f)); }
        await sleep(240);
      };
    }
  }
  async function coopOver(view, teamScore) {
    const { F, host } = await room(3, 'coop', {}, ['duck', 'otter', 'frog'], ['뽀송', '해달이', '개굴']);
    await startRoom(F);
    await sleep(800);
    const pls = [0, 1, 2].map((s) => hostPl(host, s));
    [[4250, 12, 1], [6100, 18, 0], [1800, 4, 3]].forEach(([sc, k, r], i) => { pls[i].score = sc; pls[i].kills = k; pls[i].revives = r; });
    if (teamScore) { for (const f of frames) { try { f.w.localStorage.removeItem('ppogeul-hiscore'); } catch (e) { /* */ } } host.G.score = teamScore; host.G.hiscore = Math.max(host.G.hiscore, teamScore); host.G.newHi = true; }
    host.G.lives = 0;
    host.D.hitPlayer(0);
    for (const f of F.slice(1)) { const me = f.G.players.find((p) => p.local); const e = host.G.enemies.find((q) => q.state !== 'dead' && q !== host.G.enemies[0]) || host.G.enemies[0]; stillEnemy(host, e, me.x, me.y, -1); await until(() => hostPl(host, slotOf(f)).dead || hostPl(host, slotOf(f)).ghost, 3000); }
    await until(() => host.G.players.every((p) => p.ghost), 4000);
    parkAll(host);
    for (const p of host.G.players) if (p.ghost) p.ghost.t = 470;
    await until(() => F.every((f) => S(f).phase === 'gameover'), 15000);
    fill(F[view]); await sleep(900);
  }
  async function podium(view) {
    const { F, host } = await room(4, 'battle', { arena: 3, time: 3 }, ['duck', 'cat', 'frog', 'penguin'], ['뽀송', '냥냥펀치', '개굴', '펭귄대장']);
    await startRoom(F);
    await sleep(1200);
    [[4200, 3], [5600, 5], [900, 0], [2600, 1]].forEach(([sc, ko], i) => { const p = hostPl(host, i); p.score = sc; p.kos = ko; });
    host.D.setTimeLeft(0.5);
    await until(() => F.every((f) => S(f).phase === 'podium'), 6000);
    fill(F[view]); await sleep(2200);
  }

  // ---------------------------------------------------------------- measurement of the shown frame
  function measure() {
    const w = shown && shown.w; if (!w) return null;
    const d = w.document;
    const vis = (el) => {
      if (el.closest('[hidden]')) return false;
      const r = el.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return false;
      const cs = w.getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
    };
    const label = (el) => (el.id ? '#' + el.id : (el.getAttribute('data-char') ? '[char=' + el.getAttribute('data-char') + ']' : el.getAttribute('data-mode') ? '[mode=' + el.getAttribute('data-mode') + ']' : el.getAttribute('data-time') ? '[time=' + el.getAttribute('data-time') + ']' : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''))) +
      ' "' + (el.textContent || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 18) + '"';
    const out = { vw: w.innerWidth, vh: w.innerHeight, docW: d.documentElement.scrollWidth, docH: d.documentElement.scrollHeight, touch: !!(d.getElementById('pg-app') && d.getElementById('pg-app').classList.contains('pg-touch-on')),
      targets: [], small: [], offscreen: [], clipped: [], scrollers: [], texts: [] };
    for (const el of d.querySelectorAll('button, input, select, a[href], label.pg-check, .pg-tb')) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      const row = [label(el), Math.round(r.width), Math.round(r.height), Math.round(r.left), Math.round(r.top)];
      out.targets.push(row);
      if (r.width < 44 || r.height < 44) out.small.push(row);
      if (r.right > w.innerWidth + 1 || r.bottom > w.innerHeight + 1 || r.left < -1 || r.top < -1) out.offscreen.push(row);
      // cut by an ancestor that clips (overflow hidden/auto) or by the viewport
      let L = Math.max(0, r.left), T = Math.max(0, r.top), R = Math.min(w.innerWidth, r.right), B = Math.min(w.innerHeight, r.bottom);
      let scrollable = false;
      for (let a = el.parentElement; a && a !== d.documentElement; a = a.parentElement) {
        const cs = w.getComputedStyle(a);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
          const ar = a.getBoundingClientRect();
          L = Math.max(L, ar.left); T = Math.max(T, ar.top); R = Math.min(R, ar.right); B = Math.min(B, ar.bottom);
          if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && a.scrollHeight > a.clientHeight + 2) scrollable = true;
        }
      }
      const visA = Math.max(0, R - L) * Math.max(0, B - T), area = r.width * r.height;
      if (area > 0 && visA / area < 0.9) out.cut = (out.cut || []).concat([[row[0], Math.round(100 * visA / area) + '% visible', scrollable ? 'in a scroller' : 'NOT scrollable']]);
      // covered by another element at its centre (e.g. under the touch pads)
      const cx = (L + R) / 2, cy = (T + B) / 2;
      if (visA > 0) { const top = d.elementFromPoint(cx, cy); if (top && top !== el && !el.contains(top) && !top.contains(el)) out.covered = (out.covered || []).concat([[row[0], label(top)]]); }
    }
    for (const el of d.querySelectorAll('#pg-app *')) {
      if (!vis(el) || el.closest('#pg-fontwarm')) continue;
      const cs = w.getComputedStyle(el);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) out.scrollers.push([label(el).slice(0, 30), el.clientHeight, el.scrollHeight]);
      const hasText = Array.prototype.some.call(el.childNodes, (n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText) continue;
      if (el.scrollWidth > el.clientWidth + 1 && (cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis')) out.clipped.push([label(el), el.clientWidth, el.scrollWidth]);
      const r = el.getBoundingClientRect();
      if (r.right > w.innerWidth + 1 || r.left < -1) out.offscreen.push(['text ' + label(el), Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]);
      const fs = parseFloat(cs.fontSize);
      out.texts.push([el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), Math.round(fs * 10) / 10]);
    }
    // canvas size (game pixels -> css pixels)
    const cv = d.getElementById('pg-canvas');
    if (cv && vis(cv)) { const r = cv.getBoundingClientRect(); out.canvas = [Math.round(r.width), Math.round(r.height), Math.round(r.left), Math.round(r.top), Math.round(r.width / 256 * 100) / 100]; }
    const tags = Array.from(d.querySelectorAll('#pg-tags .pg-tag')).filter(vis).map((el) => { const r = el.getBoundingClientRect(); return [el.textContent, Math.round(parseFloat(w.getComputedStyle(el).fontSize) * 10) / 10, Math.round(r.width), Math.round(r.height), el.className]; });
    out.tags = tags;
    const words = Array.from(d.querySelectorAll('#pg-words .pg-word')).filter(vis).map((el) => [el.textContent, Math.round(parseFloat(w.getComputedStyle(el).fontSize) * 10) / 10]);
    out.words = words;
    const chip = d.getElementById('pg-net-chip'); out.chip = chip && vis(chip) ? chip.textContent : '';
    const err = d.getElementById('pg-friends-err'); out.err = err && vis(err) ? err.textContent : '';
    out.texts = out.texts.filter((t) => t[1] < 12);   // only report small text
    return out;
  }

  window.UX = {
    async build(name) {
      const fn = SCENES[name]; if (!fn) throw new Error('no scene ' + name);
      try { await fn(); } catch (e) { log('UX build error ' + name + ': ' + (e && e.stack)); return { ok: false, err: String(e && e.message) }; }
      const st = shown && shown.D ? shown.D.getState() : null;
      return { ok: true, phase: st && st.phase, mode: st && st.mode, net: shown && shown.mp ? (() => { const n = shown.mp.state(); return { screen: n.screen, role: n.role, chip: n.chip, error: n.error, roster: n.roster.length }; })() : null, errors };
    },
    touch() { if (shown && shown.w && shown.w !== window) { try { shown.w.dispatchEvent(new shown.w.Event('touchstart')); } catch (e) { /* ignore */ } } return true; },
    async refresh() { if (refreshFn) { try { await refreshFn(); } catch (e) { log('UX refresh error ' + e.message); } } return true; },
    measure,
    errors: () => errors,
    scenes: () => Object.keys(SCENES),
    frames: () => frames,
  };
  log('UXDRV LOADED');
})();
