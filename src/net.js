/* ==========================================================================
   뽀득뽀득 목욕탕 — net.js
   PG.Net: ONE small session interface for online play (같이 하기 co-op / 배틀, 2-4 players) over three
   transports. The engine never touches a transport directly.

   ---- interface -------------------------------------------------------------------------------------------
   PG.Net.transports()                      -> Promise<{room:boolean, peer:boolean, bc:boolean}>
   PG.Net.lobby(transport)                  -> Promise<Lobby|null>   ('room' only; 'peer' / 'bc' resolve null)
     Lobby { games() -> [{code, mode, n, max, hostNick}]   open games of OTHER pages, newest first
             onChange(fn(games)) -> unsub                   also called once soon after subscribing
             advertise(info|null)                           info = {nick?, char?, code?, mode?, n?, max?, open?}
                                                            (nick/char describe me; code..open describe my game;
                                                            null = take my game off the list, keep nick/char)
             online() -> number                             pages in the lobby (me included)
             onDead(fn(code)) -> unsub                      the room capability turned out unusable here (a
                                                            terminal not_granted / revoked ...): transports().room
                                                            is false from then on (also PG.Net.roomDead() -> code|null)
             close() }
   PG.Net.host({transport, code?, net?})    -> Promise<Session>  code = 4 x [a-z0-9]; generated when absent
   PG.Net.join({transport, code, net?})     -> Promise<Session>  rejects an Error whose .code is
                                                                 'not_found' | 'full' | 'unavailable' | 'timeout'
                                                                 ('full' carries .reason 'full' | 'playing')
   Session {
     role: 'host'|'guest', code, selfId, transport
     peers() -> [{id, isMe, host, slot}]   the players, host first then join order; slot 0..3 is fixed per
                                           player for the whole session (P1 = host = slot 0)
     onPeers(fn(list)) -> unsub            the player list changed (join / leave)
     setState(obj) -> boolean              my latest continuous state: latest wins, coalesced (~30 Hz bc/peer,
                                           ~25 Hz room); false (and nothing sent) when its JSON > 3600 bytes
     onState(fn(peerId, obj)) -> unsub     every other player's latest state; stale ones never overwrite newer.
                                           Converges: room presence keeps the latest state, bc / peer re-send it
                                           about once a second while unchanged (so the same latest state may
                                           arrive again), and a new player gets everyone's latest state
     send(to, msg) -> boolean              RELIABLE, ORDERED (per sender), exactly once; to = a player id or '*'
                                           (every other player); false when JSON > 900 bytes or `to` unknown
     onMessage(fn(peerId, msg)) -> unsub   messages that arrive before the first listener are queued for it
     stats() -> {connected, rttMs|null, unstable, transport}
     onStatus(fn(kind, detail)) -> unsub   kind 'open'  : detail 'connected' | 'recovered'
                                           kind 'error' : detail 'unstable'  (show TEXT.unstable, keep going)
                                           kind 'closed': detail 'host_left' | 'lost' | 'left' (I called leave())
     leave()                               idempotent; a host leaving ends the game for everyone
     lock(bool)                            host only: while locked a new join is refused ('full', reason
                                           'playing') - lock when a round starts, unlock back in the room screen
   }
   Everything received is untrusted: payloads arrive as plain-JSON deep copies (functions, prototypes,
   non-finite numbers and oversize lists stripped), only from admitted players; the engine still clamps
   every field it reads. Max 4 players: the host answers a 5th hello with a reliable 'full'.
   Helpers: PG.Net.fromQuery() -> {transport|null, net|null} from ?net=bc&lat=80&jit=30&drop=0.1 (test
   pages only; the artifact never sets these), PG.Net.profileName() -> Promise<string> (the signed-in
   viewer's display name from the 'user' capability, '' when unavailable), PG.Net.TEXT (Korean strings).

   ---- 'room' : the Claude artifact runtime (the published artifact page) ---------------------------------
   The artifact is published with capabilities {room: {}, user: {scopes: ["profile"]}}. The namespace is
   `await window.claude?.use?.("room")` (null = cannot connect: signed out, not invited, public link, a
   standalone copy). On null show TEXT.roomOff and keep solo working; transports().room is false.
   Lobby: the main room. Each page's lobby presence is {v:3, nick, char, host?: {code, mode, n, max, open}};
     a host calls lobby.advertise({nick, char, code, mode:'coop'|'battle'|'party', n, max, open}) whenever the
     count / openness changes and advertise(null) when the game closes (a host session's leave() also
     clears its own ad). games() lists open, not-full ads of other pages.
   Game: room.join('g-' + code). Event topics are NOT used (editor-only); everything rides on presence,
     plain JSON, identifier keys, nesting <= 8, merged object <= 4 KiB (we keep under 3968 bytes):
       {v:3, r:'h'|'g', c:code, i:instance, k:keepalive, x?:1 (I am leaving on purpose: peers end me at once),
        q:stateSeq, s:state (or z:'<json>' when the state has non-identifier keys / is too deep),
        o:[base, [n, to, payload], [n, to, '<json>', 1], ...]   reliable outbox, contiguous from base
        w:[[peer, n0], ...]   players that receive my '*' entries from n0 on
        a:[[peer, n], ...]}   cumulative acks: highest outbox seq of that peer I have processed
     An entry leaves the outbox once every target acked it (retransmission = it simply stays in my
     presence; while anything is unacked `k` is bumped every 300 ms so the platform re-sends the object,
     and a receiver that sees entries it already acked bumps its own `k` to re-send its acks). Receivers
     deliver entries strictly in seq order, once (dedupe by the cumulative ack). When state + outbox would
     pass the budget, outbox entries go first and the state skips a beat (latest-wins anyway); the next
     flush after a skipped state always carries it. Presence writes are coalesced to <= 25/s per page
     (the platform budget is ~40/s shared with the lobby). A host is the peer whose presence says r:'h'.
     Leaving / absence: leave() first publishes x:1 (bye) and leaves the room ~150 ms later, so the others end that
     player at once (a host's bye -> 'host_left'). A flush still pending goes out first, so the bye merges onto the
     last outbox entries: a reliable message sent right before leave() is delivered before the 'left'. A presence that merely VANISHES (connection refresh, a phone
     switching networks: the runtime re-asserts it on reconnect) is only provisionally gone: its acks / outbox
     state are kept and nothing happens if it is back within graceMs (8 s); while the host is missing a guest's
     link reports unhealthy (the unstable chip). Past the grace, and only while I am connected and settled
     (settleMs after my own reconnect), it is gone: a host drops that guest and also tells it directly (a roster
     without it, so a guest that comes back later closes 'lost' instead of playing on alone); a guest whose host
     is gone closes 'host_left'. A dropped guest that still pings is told again (rate-limited).

   ---- 'peer' : PeerJS WebRTC, the STANDALONE deploy build only ---------------------------------------------
   build.js adds PeerJS 1.5.4 (cdnjs, exact version) to deploy/index.html only, so window.Peer exists there
   and transports().peer is true; the artifact page never loads it. The host registers the peer id
   'ppodeuk-' + code ('ppodeuk-t-' + code in the 앱인토스 build, which bundles PeerJS: its rooms never meet the web's)
   ('unavailable-id' = code taken: a generated code is re-rolled); guests take a random id
   and connect to it with ONE reliable, ordered DataConnection carrying JSON. Star topology: the host relays
   guests' states and messages to the other guests. Optional host/join option {peerOptions} is passed to
   new Peer(...) (custom signalling server / ICE config); the PeerJS defaults are used otherwise.

   ---- 'bc' : BroadcastChannel, local multi-tab play and AUTOMATED TESTS ----------------------------------
   Same-origin tabs / iframes on one machine (needs a real http origin - run `node tools/serve.js`, then
   open http://localhost:8765/...). Channel 'ppodeuk-v3-' + code. Optional simulated network on host/join:
   net {latency ms, jitter ms, drop 0..1}, applied on BOTH ends (each page models its own link): state
   messages are delayed by latency + random jitter, may be dropped and may arrive out of order (stale ones
   are discarded); reliable messages and joins are delayed the same way but never dropped and never
   reordered. Without an explicit `net`, host/join on 'bc' use PG.Net.fromQuery().net.
   ========================================================================== */
window.PG = window.PG || {};
(function (PG) {
  'use strict';
  const W = window;

  // Hot reload: a re-run of this file first leaves every session / lobby the previous copy opened.
  try { if (PG.Net && typeof PG.Net._dispose === 'function') PG.Net._dispose(); } catch (e) { /* ignore */ }

  // ------------------------------------------------------------------ constants
  const V = 3;
  const MAX_PLAYERS = 4;
  const STATE_MAX = 3600;          // bytes of JSON per setState()
  const MSG_MAX = 900;             // bytes of JSON per send()
  const PRESENCE_BUDGET = 3968;    // room: our ceiling for the merged presence object (platform: 4096)
  const PRESENCE_DEPTH = 8;        // room: nesting limit, the presence object itself is level 1
  const CODE_RE = /^[a-z0-9]{4}$/;
  const CODE_ABC = 'abcdefghjkmnpqrstuvwxyz23456789';   // generated codes skip 0/o and 1/i/l
  const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;
  const KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
  const PROTO_KEYS = new Set(Object.getOwnPropertyNames(Object.prototype).concat(['prototype']));
  const CTRL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
  // control, soft-hyphen, zero-width, bidi and other invisible format characters (built from code points so this file stays ASCII-clean)
  const NICK_STRIP = new RegExp('[' + [[0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb]]
    .map((r) => String.fromCharCode(r[0]) + '-' + String.fromCharCode(r[1])).join('') + ']', 'g');
  const CHAR_RE = /^[a-z]{2,10}$/;
  // (a lobby entry of another mode is skipped, an advertised one becomes 'coop'; 'party': design/party.md 6.2 - an older
  // page's lobby skips a party room, it could not join it anyway)
  const MODES = ['coop', 'battle', 'party'];
  const TRANSPORTS = ['room', 'peer', 'bc'];
  // (the 앱인토스 build - its page sets window.PG_AIT before this file - has its own id space, design/toss.md 3: its
  // rooms are friendly matches between game keys, the web's have trophy stakes and Google accounts; they never meet)
  const PEER_PREFIX = W.PG_AIT ? 'ppodeuk-t-' : 'ppodeuk-';
  const BC_PREFIX = 'ppodeuk-v3-';
  const ROOM_PREFIX = 'g-';
  const TERMINAL = ['revoked', 'not_granted', 'capability_disabled', 'capability_removed', 'transform_error'];
  // stateMs: the next send waits until the last one + stateMs. 30, not 33: the game's body stream comes every 2nd frame
  // (33.3 ms) and each send's timer runs 1-2 ms late, which a 33 carried into the next deadline until one body sample in
  // ~20-50 was overwritten before it went out (a move bit's edge then showed 2 frames late)
  const TUNE = {
    bc: { stateMs: 30, pingMs: 1000, unstableMs: 2500, lostMs: 9000, joinMs: 10000 },
    peer: { stateMs: 30, pingMs: 1000, unstableMs: 3000, lostMs: 12000, joinMs: 15000 },
    // graceMs: a player whose presence vanishes from the game room is only provisionally gone (the platform refreshes
    // connections, a phone switching networks re-asserts its presence on reconnect) unless it said bye (presence x:1);
    // settleMs: after my own reconnect the room is re-presented over a second or two, so absences wait that long
    room: { stateMs: 0, flushMs: 40, pingMs: 2000, unstableMs: 5000, lostMs: 20000, joinMs: 15000, findMs: 12000, resendMs: 300, giveUpMs: 30000, graceMs: 8000, settleMs: 3000, byeMs: 150 },
  };
  const TEXT = {
    connecting: '연결 중…',
    unstable: '연결이 불안정해요',
    not_found: '방을 찾을 수 없어요',
    full: '방이 꽉 찼어요',
    playing: '이미 게임이 시작됐어요',
    lost: '연결이 끊겼어요',
    timeout: '연결이 끊겼어요',
    host_left: '방장이 나갔어요',
    unavailable: '온라인에 연결할 수 없어요',
    roomOff: '온라인은 Claude에 로그인하고 이 게임에 초대받은 친구끼리만 할 수 있어요',
  };

  // ------------------------------------------------------------------ small utils
  const now = () => { const p = W.performance; return p && typeof p.now === 'function' ? p.now() : Date.now(); };
  const later = (fn, ms) => W.setTimeout(fn, ms > 0 ? ms : 0);
  const cancel = (id) => { if (id !== null && id !== undefined) W.clearTimeout(id); };
  const clampInt = (v, lo, hi, def) => (Number.isInteger(v) ? (v < lo ? lo : v > hi ? hi : v) : def);
  const clampNum = (v, lo, hi, def) => { v = +v; return Number.isFinite(v) ? (v < lo ? lo : v > hi ? hi : v) : def; };
  const warned = new Set();
  function warnOnce(key, msg) { if (warned.has(key)) return; warned.add(key); try { console.warn('[PG.Net] ' + msg); } catch (e) { /* ignore */ } }
  function report(e) { try { console.warn('[PG.Net] listener error: ' + (e && e.message ? e.message : e)); } catch (x) { /* ignore */ } }

  function randChars(n, abc) {
    const buf = new Uint32Array(n);
    try { W.crypto.getRandomValues(buf); } catch (e) { for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 4294967296); }
    let out = '';
    for (let i = 0; i < n; i++) out += abc[buf[i] % abc.length];
    return out;
  }
  const genCode = () => randChars(4, CODE_ABC);

  // UTF-8 byte length of a string (what the platform counts)
  function bytes(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }
  function toJson(v) { try { const s = JSON.stringify(v); return typeof s === 'string' ? s : null; } catch (e) { return null; } }

  // Can this (JSON-clean) value ride in room presence as-is? Identifier keys, no control characters,
  // at most `levels` levels of objects/arrays (a primitive uses none).
  function shapeOk(v, levels) {
    if (v === null || typeof v !== 'object') return typeof v !== 'string' || !CTRL_RE.test(v);
    if (levels <= 0) return false;
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) if (!shapeOk(v[i], levels - 1)) return false; return true; }
    for (const k of Object.keys(v)) {
      if (!KEY_RE.test(k) || PROTO_KEYS.has(k)) return false;
      if (!shapeOk(v[k], levels - 1)) return false;
    }
    return true;
  }

  // Deep copy of UNTRUSTED data into plain JSON values: objects, arrays, strings, finite numbers, booleans,
  // null. Bounded depth / lengths; prototype keys dropped; anything else (functions, Dates, Maps, ...) gone.
  function clean(v, depth) {
    if (depth === undefined) depth = 16;
    if (v === null) return null;
    const t = typeof v;
    if (t === 'number') return Number.isFinite(v) ? v : 0;
    if (t === 'string') return v.length > 4096 ? v.slice(0, 4096) : v;
    if (t === 'boolean') return v;
    if (t !== 'object' || depth <= 0) return undefined;
    if (Array.isArray(v)) {
      const n = Math.min(v.length, 1024), out = new Array(n);
      for (let i = 0; i < n; i++) { const c = clean(v[i], depth - 1); out[i] = c === undefined ? null : c; }
      return out;
    }
    if (Object.prototype.toString.call(v) !== '[object Object]') return undefined;
    const out = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (++n > 256) break;
      const c = clean(v[k], depth - 1);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }

  function fail(code, extra) {
    const e = new Error(TEXT[code] || code);
    e.code = code;
    if (extra) for (const k of Object.keys(extra)) e[k] = extra[k];
    return e;
  }
  function cleanNick(s) {
    if (typeof s !== 'string') return '';
    const t = Array.from(s.replace(NICK_STRIP, '').trim());
    return t.slice(0, 12).join('');
  }
  const cleanChar = (s) => (typeof s === 'string' && CHAR_RE.test(s) ? s : '');

  function simOf(net) {
    if (!net || typeof net !== 'object') return null;
    const s = { latency: clampNum(net.latency, 0, 5000, 0), jitter: clampNum(net.jitter, 0, 5000, 0), drop: clampNum(net.drop, 0, 0.95, 0) };
    return s.latency || s.jitter || s.drop ? s : null;
  }

  // ?net=bc&lat=80&jit=30&drop=0.1  (test pages only)
  function fromQuery(search) {
    let q = search;
    if (typeof q !== 'string') { try { q = (W.location && W.location.search) || ''; } catch (e) { q = ''; } }
    const get = {};
    for (const part of q.replace(/^\?/, '').split('&')) {
      if (!part) continue;
      const i = part.indexOf('=');
      let k = i < 0 ? part : part.slice(0, i), v = i < 0 ? '' : part.slice(i + 1);
      try { k = decodeURIComponent(k); v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { continue; }
      get[k] = v;
    }
    const transport = TRANSPORTS.includes(get.net) ? get.net : null;
    const net = simOf({ latency: get.lat, jitter: get.jit, drop: get.drop });
    return { transport, net };
  }

  function waitUntil(pred, ms, step) {
    return new Promise((resolve) => {
      const t0 = now();
      const tick = () => {
        let v = null;
        try { v = pred(); } catch (e) { v = null; }
        if (v) return resolve(v);
        if (now() - t0 >= ms) return resolve(null);
        later(tick, step || 50);
      };
      tick();
    });
  }

  // ------------------------------------------------------------------ the artifact runtime
  let roomP = null;
  // a terminal room error (not_granted, revoked, ...) seen by the lobby or a game room: this viewer cannot play online
  // here after all; transports().room turns false and lobby listeners hear onDead
  let roomDead = null;
  const deadFns = [];
  function markRoomDead(code) {
    if (roomDead) return;
    roomDead = code || 'not_granted';
    for (const fn of deadFns.slice()) { try { fn(roomDead); } catch (e) { report(e); } }
  }
  function roomNs() {
    if (!roomP) {
      roomP = (async () => {
        try {
          const c = W.claude;
          if (!c || typeof c.use !== 'function') return null;
          const ns = await c.use('room');
          return ns && typeof ns.join === 'function' && typeof ns.presence === 'function' && typeof ns.peers === 'function' ? ns : null;
        } catch (e) { return null; }
      })();
    }
    return roomP;
  }
  async function profileName() {
    try {
      const c = W.claude;
      if (!c || typeof c.use !== 'function') return '';
      const u = await c.use('user');
      if (!u || typeof u.me !== 'function') return '';
      const me = await u.me();
      return cleanNick(me && me.name);
    } catch (e) { return ''; }
  }
  async function transports() {
    const room = await roomNs();
    return { room: !!room && !roomDead, peer: typeof W.Peer === 'function', bc: typeof W.BroadcastChannel === 'function' };
  }

  // ==================================================================================== LOBBY (room only)
  let lobbyRef = null;
  function lobbyCodes(room) {
    const out = new Set();
    try {
      for (const p of room.peers()) {
        const h = p && p.presence && p.presence.host;
        if (!p.sameTab && h && typeof h.code === 'string') out.add(h.code);
      }
    } catch (e) { /* ignore */ }
    return out;
  }
  async function lobby(transport) {
    if (transport !== 'room') return null;
    const room = await roomNs();
    if (!room || roomDead) return null;
    if (lobbyRef && !lobbyRef.closed) return lobbyRef.api;
    const Lb = { closed: false, nick: '', char: '', ad: null, fns: [], lastKey: null, unsub: null, connUnsub: null };
    function games() {
      if (Lb.closed || roomDead) return [];
      const byCode = new Map();
      let peers = [];
      try { peers = room.peers(); } catch (e) { peers = []; }
      for (const p of peers) {
        if (!p || p.sameTab || p.kind === 'agent') continue;
        const pr = p.presence;
        if (!pr || pr.v !== V) continue;
        const h = pr.host;
        if (!h || typeof h !== 'object' || h.open !== true) continue;
        if (typeof h.code !== 'string' || !CODE_RE.test(h.code) || !MODES.includes(h.mode)) continue;
        const max = clampInt(h.max, 2, MAX_PLAYERS, MAX_PLAYERS);
        const n = clampInt(h.n, 1, MAX_PLAYERS, 1);
        if (n >= max) continue;
        const at = typeof p.updatedAt === 'number' ? p.updatedAt : 0;
        const g = { code: h.code, mode: h.mode, n, max, hostNick: cleanNick(pr.nick) || '손님', at };
        const old = byCode.get(g.code);
        if (!old || old.at < at) byCode.set(g.code, g);
      }
      return Array.from(byCode.values()).sort((a, b) => b.at - a.at || (a.code < b.code ? -1 : 1))
        .map((g) => ({ code: g.code, mode: g.mode, n: g.n, max: g.max, hostNick: g.hostNick }));
    }
    function push() {
      if (Lb.closed) return;
      const p = { v: V, nick: Lb.nick || null, char: Lb.char || null, host: Lb.ad ? Object.assign({}, Lb.ad) : null };
      try { const r = room.presence(p); if (r && typeof r.then === 'function') r.then(null, () => {}); } catch (e) { /* ignore */ }
    }
    function changed() {
      if (Lb.closed || !Lb.fns.length) return;
      const list = games();
      const key = JSON.stringify(list);
      if (key === Lb.lastKey) return;
      Lb.lastKey = key;
      for (const fn of Lb.fns.slice()) { try { fn(list); } catch (e) { report(e); } }
    }
    // a terminal code (not_granted for a viewer the platform cannot connect, revoked, ...): no online here
    const onErr = (err) => { const c = err && err.code; if (TERMINAL.includes(c)) markRoomDead(c); };
    try { Lb.unsub = room.onPeers(changed, onErr); } catch (e) { Lb.unsub = null; }
    try { if (typeof room.onConnection === 'function') Lb.connUnsub = room.onConnection(() => {}, onErr); } catch (e) { Lb.connUnsub = null; }
    const api = {
      games,
      // fn(code): the room turned out to be unusable for this viewer (transports().room is false from then on)
      onDead(fn) {
        if (typeof fn !== 'function') return () => {};
        if (roomDead) { later(() => { try { fn(roomDead); } catch (e) { report(e); } }, 0); return () => {}; }
        deadFns.push(fn);
        return () => { const i = deadFns.indexOf(fn); if (i >= 0) deadFns.splice(i, 1); };
      },
      onChange(fn) {
        if (typeof fn !== 'function' || Lb.closed) return () => {};
        Lb.fns.push(fn);
        later(() => { if (!Lb.closed && Lb.fns.includes(fn)) { try { fn(games()); } catch (e) { report(e); } } }, 0);
        return () => { const i = Lb.fns.indexOf(fn); if (i >= 0) Lb.fns.splice(i, 1); };
      },
      advertise(info) {
        if (Lb.closed) return false;
        if (info === null || info === undefined) { Lb.ad = null; push(); return true; }
        if (typeof info !== 'object') return false;
        if ('nick' in info) Lb.nick = cleanNick(info.nick);
        if ('char' in info) Lb.char = cleanChar(info.char);
        if (typeof info.code === 'string') {
          const code = info.code.trim().toLowerCase();
          if (!CODE_RE.test(code)) return false;
          const max = clampInt(info.max, 2, MAX_PLAYERS, MAX_PLAYERS);
          Lb.ad = { code, mode: MODES.includes(info.mode) ? info.mode : 'coop', n: clampInt(info.n, 1, MAX_PLAYERS, 1), max, open: info.open !== false };
        } else if ('code' in info && info.code === null) Lb.ad = null;
        push();
        return true;
      },
      online() {
        let n = 0;
        try { for (const p of room.peers()) if (p && p.kind !== 'agent' && (p.sameTab || (p.presence && p.presence.v === V))) n++; } catch (e) { /* ignore */ }
        return n;
      },
      close() {
        if (Lb.closed) return;
        try { const r = room.presence({ v: null, nick: null, char: null, host: null }); if (r && r.then) r.then(null, () => {}); } catch (e) { /* ignore */ }
        Lb.closed = true; Lb.ad = null; Lb.fns = [];
        try { if (Lb.unsub) Lb.unsub(); } catch (e) { /* ignore */ }
        try { if (Lb.connUnsub) Lb.connUnsub(); } catch (e) { /* ignore */ }
        if (lobbyRef === Lb) lobbyRef = null;
      },
    };
    Lb.api = api;
    lobbyRef = Lb;
    return api;
  }

  // ==================================================================================== SESSION CORE
  // Transport-independent: roster / admission, control messages, pings, health, listener plumbing.
  // A link (bcLink / peerLink / roomLink) moves two kinds of traffic: states (latest wins, may drop) and
  // reliable envelopes ({u: msg} user messages, {c: ...} control) in order, once.
  const live = new Set();

  function makeCore(transport, role, code, opts) {
    const tune = TUNE[transport];
    const ls = { peers: [], state: [], msg: [], status: [] };
    const st = {
      selfId: null, hostId: null, link: null,
      members: [],            // [{id, slot}] roster order, host first
      locked: false, closed: false, why: null,
      welcomed: role === 'host',
      heard: new Map(),       // id -> now() of the last traffic from them
      rtt: new Map(),         // guest: host -> ms ; host: guest -> ms the guest reported
      pings: new Map(), pingN: 0, lastPing: 0,
      unstable: false, openedAt: now(),
      outState: undefined, stateTimer: null, stateAt: -1e9,
      lastSent: undefined,    // bc / peer: re-sent about once a second while unchanged (drops, late joiners)
      early: new Map(),       // latest state of senders not (yet) on my roster, replayed once they are
      msgQ: [], drainT: null,
      lastState: new Map(),
      strangers: [],          // user messages from players we do not know yet (join races)
      nudged: new Map(),      // host: dropped id -> when it was last told it is out
      tick: null, joinWait: null, joinTimer: null,
    };

    const fire = (list, a, b) => { for (const fn of list.slice()) { try { fn(a, b); } catch (e) { report(e); } } };
    const sub = (list, fn) => {
      if (typeof fn !== 'function') return () => {};
      list.push(fn);
      return () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
    };
    const isMember = (id) => st.members.some((m) => m.id === id);
    const peersList = () => st.members.map((m) => ({ id: m.id, isMe: m.id === st.selfId, host: m.id === st.hostId, slot: m.slot }));
    const rosterArr = () => st.members.map((m) => [m.id, m.slot]);

    function setMembers(list) {
      const grew = list.some((m) => !isMember(m.id));
      st.members = list;
      if (st.link) st.link.setMembers(list.map((m) => m.id).filter((id) => id !== st.selfId));
      fire(ls.peers, peersList());
      // a newcomer gets my latest state right away (room presence already carries it)
      if (grew && tune.stateMs && st.lastSent !== undefined && st.outState === undefined && !st.closed) {
        st.outState = st.lastSent;
        if (st.stateTimer === null) st.stateTimer = later(flushState, 60);
      }
      for (const [id, obj] of Array.from(st.early)) if (isMember(id)) { st.early.delete(id); onStateIn(id, obj); }
      if (st.strangers.length) {
        const keep = [];
        const t = now();
        for (const s of st.strangers) {
          if (isMember(s.from)) deliverUser(s.from, s.msg);
          else if (t - s.at < 5000) keep.push(s);
        }
        st.strangers = keep;
      }
    }
    function parseRoster(l) {
      if (!Array.isArray(l)) return null;
      const out = [], ids = new Set(), slots = new Set();
      for (const e of l.slice(0, MAX_PLAYERS)) {
        if (!Array.isArray(e)) continue;
        const id = e[0], slot = e[1];
        if (typeof id !== 'string' || !ID_RE.test(id) || ids.has(id)) continue;
        if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PLAYERS || slots.has(slot)) continue;
        ids.add(id); slots.add(slot);
        out.push({ id, slot });
      }
      return out;
    }

    // ---- incoming
    function deliverUser(from, msg) {
      const m = clean(msg);
      if (m === undefined) return;
      if (ls.msg.length && !st.msgQ.length) { fire(ls.msg, from, m); return; }
      st.msgQ.push([from, m]);
      if (st.msgQ.length > 512) st.msgQ.shift();
      if (ls.msg.length) drainSoon();
    }
    function drainSoon() { if (st.drainT === null) st.drainT = later(drain, 0); }
    function drain() {
      st.drainT = null;
      if (!ls.msg.length || st.closed) return;
      const q = st.msgQ;
      st.msgQ = [];
      for (const [f, m] of q) fire(ls.msg, f, m);
    }
    function onRel(from, env) {
      if (st.closed || typeof from !== 'string' || !env || typeof env !== 'object') return;
      st.heard.set(from, now());
      if (typeof env.c === 'string') { onCtrl(from, env); return; }
      if (!('u' in env)) return;
      if (!st.welcomed || !isMember(from)) {
        if (from !== st.hostId && st.strangers.length < 64) st.strangers.push({ from, msg: env.u, at: now() });
        return;
      }
      deliverUser(from, env.u);
    }
    function onStateIn(from, obj) {
      if (st.closed || typeof from !== 'string') return;
      st.heard.set(from, now());
      if (from === st.selfId) return;
      if (!st.welcomed || !isMember(from)) {
        if (st.early.has(from) || st.early.size < 8) st.early.set(from, obj);
        return;
      }
      const s = clean(obj);
      if (s === undefined) return;
      st.lastState.set(from, s);
      fire(ls.state, from, s);
    }
    function onCtrl(from, env) {
      const c = env.c;
      if (role === 'host') {
        if (c === 'hello') { admit(from); return; }
        if (from === st.selfId) return;
        if (!isMember(from)) {
          // a player I already dropped (its link was gone too long) still thinks it is in: tell it it is out
          if (c === 'ping') nudge(from);
          return;
        }
        if (c === 'ping') {
          if (Number.isFinite(env.r) && env.r >= 0) st.rtt.set(from, Math.min(env.r, 60000));
          sendCtrl(from, { c: 'pong', i: clampInt(env.i, 0, 1e9, 0) });
        } else if (c === 'bye') dropMember(from, true);
        return;
      }
      if (from !== st.hostId) return;               // guests take control messages from the host only
      if (c === 'welcome') {
        const l = parseRoster(env.l);
        if (!l || !l.some((m) => m.id === st.selfId) || !l.some((m) => m.id === st.hostId)) return;
        st.welcomed = true;
        setMembers(l);
        if (st.joinWait) { const jw = st.joinWait; st.joinWait = null; jw(null); }
      } else if (c === 'full') {
        if (st.joinWait) { const jw = st.joinWait; st.joinWait = null; jw(fail('full', { reason: env.why === 'playing' ? 'playing' : 'full' })); }
      } else if (c === 'roster') {
        if (!st.welcomed) return;
        const l = parseRoster(env.l);
        if (!l) return;
        if (!l.some((m) => m.id === st.selfId)) { close('lost'); return; }
        setMembers(l);
      } else if (c === 'pong') {
        const sent = st.pings.get(env.i);
        if (sent !== undefined) { st.rtt.set(st.hostId, now() - sent); st.pings.delete(env.i); }
      } else if (c === 'bye') close('host_left');
    }
    // why: 'left' (it said bye), 'gone' (room: its presence stayed away past the grace while I am connected),
    // 'lost' (its link broke)
    function onGone(id, why) {
      if (st.closed) return;
      if (role === 'host') { dropMember(id, why === 'left'); return; }
      if (id === st.hostId) { close(why === 'left' || why === 'gone' ? 'host_left' : 'lost'); return; }
      if (isMember(id)) setMembers(st.members.filter((m) => m.id !== id));
    }

    // ---- host: admission
    function admit(id) {
      if (typeof id !== 'string' || !ID_RE.test(id) || id === st.selfId) return;
      if (isMember(id)) { sendCtrl(id, { c: 'welcome', l: rosterArr(), h: st.selfId }); return; }
      if (st.locked || st.members.length >= MAX_PLAYERS) { sendCtrl(id, { c: 'full', why: st.locked ? 'playing' : 'full' }); return; }
      const used = new Set(st.members.map((m) => m.slot));
      let slot = 0;
      while (used.has(slot)) slot++;
      st.heard.set(id, now());
      setMembers(st.members.concat([{ id, slot }]));
      sendCtrl(id, { c: 'welcome', l: rosterArr(), h: st.selfId });
      sendCtrl('*', { c: 'roster', l: rosterArr() });
    }
    // quiet: it said bye itself. Otherwise the dropped player may still be listening (a link that came back after
    // the host gave up on it): it gets the new roster directly too, sees itself missing and closes ('lost')
    function dropMember(id, quiet) {
      if (!isMember(id) || id === st.selfId) return;
      setMembers(st.members.filter((m) => m.id !== id));
      st.rtt.delete(id); st.heard.delete(id); st.lastState.delete(id);
      const l = rosterArr();
      sendCtrl('*', { c: 'roster', l });
      if (!quiet) { st.nudged.set(id, now()); sendCtrl(id, { c: 'roster', l }); }
    }
    function nudge(id) {
      if (typeof id !== 'string' || !ID_RE.test(id)) return;
      const t = now(), last = st.nudged.get(id);
      if (last !== undefined && t - last < 3000) return;
      if (st.nudged.size > 32) st.nudged.clear();
      st.nudged.set(id, t);
      sendCtrl(id, { c: 'roster', l: rosterArr() });
    }
    function sendCtrl(to, env) { if (st.link && !st.closed) st.link.sendRel(to, env); }

    // ---- outgoing
    function setState(obj) {
      if (st.closed || !st.link) return false;
      const json = toJson(obj);
      if (json === null || bytes(json) > STATE_MAX) return false;
      st.outState = JSON.parse(json);
      if (!tune.stateMs) { flushState(); return true; }
      if (st.stateTimer === null) st.stateTimer = later(flushState, Math.max(0, st.stateAt + tune.stateMs - now()));
      return true;
    }
    function flushState() {
      st.stateTimer = null;
      if (st.closed || st.outState === undefined) return;
      const s = st.outState;
      st.outState = undefined;
      st.stateAt = now();
      st.lastSent = s;
      st.link.sendState(s);
    }
    function send(to, msg) {
      if (st.closed || !st.link || !st.welcomed) return false;
      if (to !== '*' && (typeof to !== 'string' || to === st.selfId || !isMember(to))) return false;
      const json = toJson(msg);
      if (json === null || bytes(json) > MSG_MAX) return false;
      st.link.sendRel(to, { u: JSON.parse(json) });
      return true;
    }

    // ---- health: pings, silence, link state
    function tick() {
      if (st.closed || !st.link) return;
      const t = now();
      const linkOk = st.link.health();
      let bad = !linkOk;
      // bc / peer: an unchanged state is re-sent about once a second, so a dropped last update or a late
      // joiner still converges on it (room presence keeps the latest state by itself)
      if (tune.stateMs && st.lastSent !== undefined && st.outState === undefined && st.stateTimer === null && t - st.stateAt >= 1000) {
        st.outState = st.lastSent;
        flushState();
      }
      if (role === 'guest' && st.welcomed) {
        if (t - st.lastPing >= tune.pingMs) {
          st.lastPing = t;
          const i = ++st.pingN;
          st.pings.set(i, t);
          if (st.pings.size > 8) st.pings.delete(st.pings.keys().next().value);
          const r = st.rtt.get(st.hostId);
          sendCtrl(st.hostId, { c: 'ping', i, r: r === undefined ? -1 : Math.round(r) });
        }
        const quiet = t - (st.heard.get(st.hostId) || st.openedAt);
        if (quiet > tune.lostMs) { close('lost'); return; }
        if (quiet > tune.unstableMs) bad = true;
      }
      if (role === 'host') {
        for (const m of st.members.slice()) {
          if (m.id === st.selfId) continue;
          if (t - (st.heard.get(m.id) || t) > tune.lostMs) dropMember(m.id);
        }
      }
      if (bad && !st.unstable) { st.unstable = true; fire(ls.status, 'error', 'unstable'); }
      else if (!bad && st.unstable) { st.unstable = false; fire(ls.status, 'open', 'recovered'); }
    }

    function close(why, fast) {
      if (st.closed) return;
      st.closed = true;
      st.why = why;
      cancel(st.stateTimer); cancel(st.drainT); cancel(st.joinTimer);
      if (st.tick !== null) W.clearInterval(st.tick);
      if (st.link) { try { st.link.close(!!fast); } catch (e) { /* ignore */ } }
      live.delete(core);
      if (role === 'host' && transport === 'room' && lobbyRef && lobbyRef.ad && lobbyRef.ad.code === code) {
        try { lobbyRef.api.advertise(null); } catch (e) { /* ignore */ }
      }
      if (st.joinWait) { const jw = st.joinWait; st.joinWait = null; jw(fail(why === 'host_left' ? 'not_found' : 'timeout')); }
      fire(ls.status, 'closed', why);
    }

    const handlers = { state: onStateIn, rel: onRel, gone: onGone, fatal: (why) => close(why || 'lost') };
    function attach(link) {
      st.link = link;
      st.selfId = link.selfId;
      st.openedAt = now();
      st.tick = W.setInterval(tick, 250);
      live.add(core);
    }

    async function openHost() {
      const link = await openLink(transport, code, 'host', handlers, opts);
      attach(link);
      st.hostId = st.selfId;
      st.members = [{ id: st.selfId, slot: 0 }];
      link.setMembers([]);
      return api;
    }
    function openGuest() {
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (err) => {
          if (settled) return;
          settled = true;
          cancel(st.joinTimer);
          st.joinWait = null;
          if (err) { if (!st.closed) close('failed', true); reject(err); } else { resolve(api); fire(ls.status, 'open', 'connected'); }
        };
        st.joinWait = finish;
        st.joinTimer = later(() => finish(fail('timeout')), tune.joinMs);
        openLink(transport, code, 'guest', handlers, opts).then((link) => {
          if (settled) { try { link.close(true); } catch (e) { /* ignore */ } return; }
          attach(link);
          st.hostId = link.hostId;
          st.heard.set(st.hostId, now());
          link.sendRel(st.hostId, { c: 'hello', v: V });
        }, (err) => finish(err && err.code ? err : fail('unavailable')));
      });
    }

    const api = {
      role, code, transport,
      get selfId() { return st.selfId; },
      peers: peersList,
      onPeers: (fn) => sub(ls.peers, fn),
      setState,
      onState(fn) {
        const un = sub(ls.state, fn);
        if (typeof fn === 'function' && st.lastState.size) {
          later(() => {
            if (!ls.state.includes(fn)) return;
            for (const [id, s] of st.lastState) if (isMember(id)) { try { fn(id, s); } catch (e) { report(e); } }
          }, 0);
        }
        return un;
      },
      send,
      onMessage(fn) { const un = sub(ls.msg, fn); if (st.msgQ.length) drainSoon(); return un; },
      stats() {
        let r;
        if (role === 'guest') r = st.rtt.get(st.hostId);
        else for (const v of st.rtt.values()) if (r === undefined || v > r) r = v;
        const linkOk = !!(st.link && st.link.health());
        return { connected: !st.closed && linkOk && !st.unstable, rttMs: r === undefined ? null : Math.round(r), unstable: st.unstable, transport };
      },
      onStatus: (fn) => sub(ls.status, fn),
      leave() { close('left'); return Promise.resolve(); },
      lock(b) { if (role === 'host') st.locked = !!b; return st.locked; },
    };
    const core = { api, close, openHost, openGuest };
    return core;
  }

  function openLink(transport, code, role, h, opts) {
    if (transport === 'bc') return bcLink(code, role, simOf(opts && opts.net !== undefined ? opts.net : fromQuery().net), h);
    if (transport === 'peer') return peerLink(code, role, h, opts);
    if (transport === 'room') return roomLink(code, role, h);
    return Promise.reject(fail('unavailable'));
  }

  // ==================================================================================== 'bc' link
  function bcLink(code, role, sim, h) {
    return new Promise((resolve, reject) => {
      if (typeof W.BroadcastChannel !== 'function') { reject(fail('unavailable')); return; }
      let ch;
      try { ch = new W.BroadcastChannel(BC_PREFIX + code); } catch (e) { reject(fail('unavailable')); return; }
      const selfId = 'b' + randChars(11, ALNUM);
      const timers = new Set();
      const inQ = new Map(), lastQ = new Map();
      let closed = false, leaving = false, stateQ = 0, found = null;
      const T = (fn, ms) => { const id = later(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
      // Simulated delays for reliable traffic go through FIFO queues (one out, one per sender in): one setTimeout
      // per message would NOT keep them ordered, because browsers truncate delays to whole milliseconds and run
      // callbacks a little late, so two messages due at nearly the same time can swap.
      function fifo() {
        const q = [];
        let armed = false;
        const arm = () => { if (!armed && q.length && !closed) { armed = true; T(pump, Math.ceil(q[0].at - now())); } };
        function pump() {
          armed = false;
          const t = now();
          while (q.length && !closed && q[0].at <= t + 0.5) q.shift().fn();
          arm();
        }
        return { push(at, fn) { q.push({ at: q.length ? Math.max(at, q[q.length - 1].at) : at, fn }); arm(); }, size: () => q.length };
      }
      const outQ = fifo();
      const RELIABLE = { r: 1, who: 1, here: 1, bye: 1 };
      const rawPost = (m) => { if (!closed) { try { ch.postMessage(m); } catch (e) { /* ignore */ } } };
      function post(k, t, extra) {
        const m = { v: V, k, f: selfId, t };
        if (extra) for (const key of Object.keys(extra)) m[key] = extra[key];
        if (!sim) { rawPost(m); return; }
        const rel = RELIABLE[k] === 1;
        if (!rel && Math.random() < sim.drop) return;
        const at = now() + sim.latency + Math.random() * sim.jitter;
        if (rel) outQ.push(at, () => rawPost(m)); else T(() => rawPost(m), at - now());
      }
      function shut() {
        if (closed) return;
        closed = true;
        for (const id of timers) cancel(id);
        timers.clear();
        try { ch.close(); } catch (e) { /* ignore */ }
      }
      function handle(m) {
        if (closed || leaving) return;
        switch (m.k) {
          case 'who': if (role === 'host') post('here', m.f); break;
          case 'here': if (found) found(m.f); break;
          case 's':
            if (!Number.isInteger(m.q) || m.q <= (lastQ.get(m.f) || 0)) return;   // stale (jitter) or replayed
            lastQ.set(m.f, m.q);
            h.state(m.f, m.d);
            break;
          case 'r': h.rel(m.f, m.d); break;
          case 'bye': h.gone(m.f, 'left'); break;
          default: break;
        }
      }
      ch.onmessage = (ev) => {
        if (closed || leaving) return;
        const m = ev && ev.data;
        if (!m || typeof m !== 'object' || m.v !== V || typeof m.k !== 'string' || typeof m.f !== 'string' || !ID_RE.test(m.f) || m.f === selfId) return;
        if (m.t !== '*' && m.t !== selfId) return;
        if (!sim) { handle(m); return; }
        const rel = RELIABLE[m.k] === 1;
        if (!rel && Math.random() < sim.drop) return;
        const at = now() + sim.latency + Math.random() * sim.jitter;
        if (!rel) { T(() => handle(m), at - now()); return; }       // states may arrive out of order (stale ones dropped)
        let q = inQ.get(m.f);
        if (!q) { if (inQ.size >= 64) return; q = fifo(); inQ.set(m.f, q); }
        q.push(at, () => handle(m));
      };
      const link = {
        selfId, hostId: role === 'host' ? selfId : null,
        setMembers() { /* everyone on the channel hears '*'; the core filters by roster */ },
        sendState(obj) { post('s', '*', { q: ++stateQ, d: obj }); },
        sendRel(to, env) { post('r', to, { d: env }); },
        health() { return !closed; },
        close(fast) {
          if (closed || leaving) return;
          leaving = true;
          if (fast || !sim) { rawPost({ v: V, k: 'bye', f: selfId, t: '*' }); shut(); return; }
          post('bye', '*');                                   // queued after every pending reliable message
          const waitOut = () => { if (outQ.size() && !closed) later(waitOut, 25); else shut(); };
          later(waitOut, 25);
        },
      };
      const rtt = sim ? 2 * (sim.latency + sim.jitter) : 0;
      if (role === 'host') {
        // is this code already hosted on this channel?
        let taken = false;
        found = () => { taken = true; };
        post('who', '*');
        T(() => {
          found = null;
          if (closed) return;
          if (taken) { shut(); reject(fail('taken')); } else resolve(link);
        }, 250 + 2 * rtt);
      } else {
        const t0 = now(), findMs = 1500 + 2 * rtt;
        found = (hid) => {
          if (link.hostId || typeof hid !== 'string') return;
          link.hostId = hid;
          found = null;
          resolve(link);
        };
        const probe = () => {
          if (link.hostId || closed) return;
          if (now() - t0 > findMs) { found = null; shut(); reject(fail('not_found')); return; }
          post('who', '*');
          T(probe, 300);
        };
        probe();
      }
    });
  }

  // ==================================================================================== 'peer' link (PeerJS)
  function peerLink(code, role, h, opts) {
    return new Promise((resolve, reject) => {
      const P = W.Peer;
      if (typeof P !== 'function') { reject(fail('unavailable')); return; }
      const popts = Object.assign({ debug: 0 }, (opts && opts.peerOptions) || {});
      const hostPid = PEER_PREFIX + code;
      const conns = new Map();          // host: guestId -> conn ; guest: hostPid -> conn
      const byeFrom = new Set();
      const lastQ = new Map();
      let members = new Set();
      let peer = null, settled = false, closed = false, closing = false, stateQ = 0, lastReconnect = 0;
      const sendTo = (c, m) => { try { if (c && c.open) c.send(m); } catch (e) { /* ignore */ } };
      // latest-wins states skip a beat while a data channel is backed up (a slow uplink): queueing them would only
      // add latency; the next state supersedes this one anyway (reliable messages are never skipped)
      const backedUp = (c) => {
        try {
          const dc = c && c.dataChannel;
          return !!(dc && typeof dc.bufferedAmount === 'number' && dc.bufferedAmount > 65536) || !!(c && typeof c.bufferSize === 'number' && c.bufferSize > 32);
        } catch (e) { return false; }
      };
      const sendState = (c, m) => { if (!backedUp(c)) sendTo(c, m); };
      function shut() {
        if (closed) return;
        closed = true;
        for (const c of conns.values()) { try { c.close(); } catch (e) { /* ignore */ } }
        conns.clear();
        try { if (peer) peer.destroy(); } catch (e) { /* ignore */ }
      }
      const timer = later(() => done(fail('timeout')), 12000);
      function done(err) {
        if (settled) return;
        settled = true;
        cancel(timer);
        if (err) { shut(); reject(err); } else resolve(link);
      }
      const link = {
        selfId: role === 'host' ? hostPid : null, hostId: role === 'host' ? hostPid : null,
        setMembers(ids) { members = new Set(ids); },
        sendState(obj) {
          const m = { v: V, k: 's', f: link.selfId, q: ++stateQ, d: obj };
          if (role === 'host') { for (const [gid, c] of conns) if (members.has(gid)) sendState(c, m); } else sendState(conns.get(hostPid), m);
        },
        sendRel(to, env) {
          const m = { v: V, k: 'r', f: link.selfId, t: to, d: env };
          if (role !== 'host') { sendTo(conns.get(hostPid), m); return; }
          if (to === '*') { for (const [gid, c] of conns) if (members.has(gid)) sendTo(c, m); } else sendTo(conns.get(to), m);
        },
        health() { return !closed && !closing && (role === 'host' || conns.has(hostPid)); },
        close(fast) {
          if (closed || closing) return;
          for (const c of conns.values()) sendTo(c, { v: V, k: 'bye', f: link.selfId });
          if (fast) { shut(); return; }
          closing = true;                     // let the byes leave the data channels first
          later(shut, 120);
        },
      };
      function onData(from, d) {
        if (closed || closing || !d || typeof d !== 'object' || d.v !== V) return;
        if (role === 'host') {
          if (d.k === 's') {
            if (!members.has(from) || !Number.isInteger(d.q) || d.q <= (lastQ.get(from) || 0)) return;
            lastQ.set(from, d.q);
            h.state(from, d.d);
            for (const [gid, c] of conns) if (gid !== from && members.has(gid)) sendState(c, { v: V, k: 's', f: from, q: d.q, d: d.d });
          } else if (d.k === 'r') {
            const t = d.t;
            if (t === link.selfId) h.rel(from, d.d);
            else if (t === '*') {
              h.rel(from, d.d);
              if (members.has(from)) for (const [gid, c] of conns) if (gid !== from && members.has(gid)) sendTo(c, { v: V, k: 'r', f: from, t: '*', d: d.d });
            } else if (typeof t === 'string' && members.has(from) && members.has(t)) sendTo(conns.get(t), { v: V, k: 'r', f: from, t, d: d.d });
          } else if (d.k === 'bye') { byeFrom.add(from); h.gone(from, 'left'); }
          return;
        }
        const f = typeof d.f === 'string' && ID_RE.test(d.f) ? d.f : hostPid;    // the host stamps relayed traffic
        if (d.k === 's') {
          if (!Number.isInteger(d.q) || d.q <= (lastQ.get(f) || 0)) return;
          lastQ.set(f, d.q);
          h.state(f, d.d);
        } else if (d.k === 'r') { if (d.t === '*' || d.t === link.selfId) h.rel(f, d.d); }
        else if (d.k === 'bye') { if (f === hostPid) byeFrom.add(hostPid); h.gone(f, 'left'); }
      }
      try { peer = role === 'host' ? new P(hostPid, popts) : new P(popts); } catch (e) { done(fail('unavailable')); return; }
      peer.on('error', (err) => {
        const type = err && err.type;
        if (!settled) {
          if (type === 'unavailable-id') done(fail('taken'));
          else if (type === 'peer-unavailable') done(fail('not_found'));
          else done(fail('unavailable', { reason: type || 'error' }));
        }
        // after the start: signalling hiccups do not break open data connections; 'disconnected' re-registers
      });
      peer.on('disconnected', () => {
        if (closed || !settled) return;
        const t = now();
        if (t - lastReconnect < 3000) return;
        lastReconnect = t;
        try { peer.reconnect(); } catch (e) { /* ignore */ }
      });
      if (role === 'host') {
        peer.on('open', () => done(null));
        peer.on('connection', (conn) => {
          const gid = conn && conn.peer;
          if (closed || closing || typeof gid !== 'string' || !ID_RE.test(gid) || conns.size >= 16) { try { conn.close(); } catch (e) { /* ignore */ } return; }
          conn.on('open', () => {
            const old = conns.get(gid);
            if (old && old !== conn) { try { old.close(); } catch (e) { /* ignore */ } }
            conns.set(gid, conn);
          });
          conn.on('data', (d) => { if (conns.get(gid) === conn) onData(gid, d); });
          conn.on('close', () => { if (conns.get(gid) === conn) { conns.delete(gid); if (!closed && !closing) h.gone(gid, byeFrom.has(gid) ? 'left' : 'lost'); } });
          conn.on('error', () => {});
        });
      } else {
        peer.on('open', (id) => {
          if (closed) return;
          link.selfId = typeof id === 'string' ? id : peer.id;
          let conn;
          try { conn = peer.connect(hostPid, { reliable: true, serialization: 'json' }); } catch (e) { done(fail('unavailable')); return; }
          conn.on('open', () => { conns.set(hostPid, conn); link.hostId = hostPid; done(null); });
          conn.on('data', (d) => onData(hostPid, d));
          conn.on('close', () => {
            if (conns.get(hostPid) === conn) { conns.delete(hostPid); if (!closed && !closing) h.gone(hostPid, byeFrom.has(hostPid) ? 'left' : 'lost'); }
            if (!settled) done(fail('not_found'));
          });
          conn.on('error', () => {});
        });
      }
    });
  }

  // ==================================================================================== 'room' link
  function roomLink(code, role, h) {
    const tune = TUNE.room, t0 = now();      // (t0: about when the session's own join timer started)
    return (async () => {
      const room = await roomNs();
      if (!room) throw fail('unavailable', { reason: 'room' });
      if (role === 'host' && lobbyCodes(room).has(code)) throw fail('taken');
      let nr;
      try { nr = await room.join(ROOM_PREFIX + code); } catch (e) {
        if (e && TERMINAL.includes(e.code)) markRoomDead(e.code);
        throw fail('unavailable', { reason: (e && e.code) || 'join' });
      }
      const R = {
        closed: false, selfId: null, hostId: null, inst: randChars(6, ALNUM),
        others: new Set(),         // the players my '*' entries go to (from the core's roster)
        out: [], nextN: 1, w: new Map(),
        acks: new Map(),           // sender -> highest of THEIR seqs I processed
        ackedBy: new Map(),        // receiver -> highest of MY seqs they acked
        seen: new Map(),           // peer -> {pr, role, inst, q, missing (since when absent, 0 = present), bye}
        state: undefined, stateStr: null, stateQ: 0, heldState: false,
        k: 0, sentKeys: [], lastFlush: -1e9, flushT: null, needEcho: false,
        // maybeGone: absent players -> when to decide (grace; extended while I am offline or settling after a reconnect)
        lastPeers: null, maybeGone: new Map(), discAt: now(), connSince: 0, upAt: 0, leaving: false,
        unsubs: [], maint: null, budget: PRESENCE_BUDGET,
      };
      const entryWire = (e) => (e.json !== null ? [e.n, e.to, e.json, 1] : [e.n, e.to, e.env]);

      function markDirty() {
        if (R.closed || R.flushT !== null) return;
        R.flushT = later(flush, Math.max(0, R.lastFlush + tune.flushMs - now()));
      }
      function flush() {
        R.flushT = null;
        if (R.closed || R.leaving) return;
        R.lastFlush = now();
        R.needEcho = false;
        const head = { v: V, r: role === 'host' ? 'h' : 'g', c: code, i: R.inst, k: R.k };
        if (R.w.size) head.w = Array.from(R.w, (e) => [e[0], e[1]]);
        if (R.acks.size) {
          // players first; anyone else (a guest still saying hello) only while the list stays short
          const a = [];
          const player = (id) => R.others.has(id) || id === R.hostId;
          for (const [id, n] of R.acks) if (player(id)) a.push([id, n]);
          for (const [id, n] of R.acks) if (a.length < 8 && !player(id)) a.push([id, n]);
          if (a.length) head.a = a;
        }
        const base = R.out.length ? R.out[0].n : R.nextN;
        const ents = R.out.map(entryWire);
        const build = (take, withState) => {
          const p = Object.assign({}, head);
          p.o = [base].concat(ents.slice(0, take));
          if (withState) { p.q = R.stateQ; if (R.stateStr === null) p.s = R.state; else p.z = R.stateStr; }
          return p;
        };
        const fits = (p) => bytes(JSON.stringify(p)) <= R.budget;
        const hasState = R.state !== undefined;
        let p = null;
        // reliable entries first, unless the previous flush already skipped the state
        const order = R.heldState ? [true, false] : [false, true];
        if (hasState && fits(build(ents.length, true))) p = build(ents.length, true);
        for (const preferState of order) {
          if (p || !hasState) break;
          if (preferState) { for (let take = ents.length; take >= 0 && !p; take--) { const c = build(take, true); if (fits(c)) p = c; } }
          else if (ents.length) { for (let take = ents.length; take >= 1 && !p; take--) { const c = build(take, false); if (fits(c)) p = c; } }
        }
        if (!p) { for (let take = ents.length; take >= 0 && !p; take--) { const c = build(take, false); if (fits(c) || take === 0) p = c; } }
        if (hasState && !('q' in p)) { R.heldState = true; if (!ents.length) warnOnce('state', 'state too large for room presence'); } else R.heldState = false;
        const keys = Object.keys(p);
        for (const key of R.sentKeys) if (!(key in p)) p[key] = null;
        R.sentKeys = keys;
        let pr = null;
        try { pr = nr.presence(p); } catch (e) { pr = null; }
        if (pr && typeof pr.then === 'function') pr.then(null, onPresenceError);
      }
      function onPresenceError(e) {
        const c = e && e.code;
        if (R.closed || R.leaving) return;   // (leaving: the last flush and the bye may land on a room already gone)
        if (TERMINAL.includes(c)) { markRoomDead(c); h.fatal('lost'); return; }
        if (c === 'invalid_argument') { R.budget = Math.max(2048, R.budget - 512); warnOnce('presence', 'presence rejected: ' + (e.message || c)); }
        R.k++;
        markDirty();
      }
      function prune() {
        let changed = false;
        const t = now();
        while (R.out.length) {
          const e = R.out[0];
          for (const id of Array.from(e.targets)) if ((R.ackedBy.get(id) || 0) >= e.n) e.targets.delete(id);
          if (e.targets.size && t - e.t0 < tune.giveUpMs) break;
          R.out.shift();
          changed = true;
        }
        if (changed) markDirty();
      }
      function readPeer(id, pr, prev) {
        const ok = pr && typeof pr === 'object' && pr.v === V && pr.c === code && (pr.r === 'h' || pr.r === 'g');
        if (!ok) { R.seen.set(id, { pr, role: null, inst: null, q: 0 }); return; }
        const inst = typeof pr.i === 'string' ? pr.i.slice(0, 16) : '';
        let s = prev;
        if (!s || !s.role || s.inst !== inst) {
          if (s && s.role && s.inst !== inst) { R.acks.delete(id); R.ackedBy.delete(id); }   // they rejoined
          s = { pr, role: pr.r, inst, q: 0, missing: 0, bye: false };
        }
        s.pr = pr;
        s.role = pr.r;
        s.missing = 0;
        R.seen.set(id, s);
        if (s.bye) return;                          // (said bye: nothing more from this instance)
        if (pr.r === 'h' && role === 'guest' && !R.hostId) R.hostId = id;
        // their acks of my outbox
        if (Array.isArray(pr.a)) {
          for (let i = 0; i < pr.a.length && i < 16; i++) {
            const e = pr.a[i];
            if (Array.isArray(e) && e[0] === R.selfId && Number.isInteger(e[1])) {
              const n = Math.min(e[1], R.nextN - 1);
              if (n > (R.ackedBy.get(id) || 0)) { R.ackedBy.set(id, n); prune(); }
              break;
            }
          }
        }
        // their outbox: deliver strictly in order, once
        const o = pr.o;
        if (Array.isArray(o) && Number.isInteger(o[0]) && o[0] >= 1) {
          const base = o[0];
          let wStart = Infinity;
          if (Array.isArray(pr.w)) {
            for (let i = 0; i < pr.w.length && i < 16; i++) {
              const e = pr.w[i];
              if (Array.isArray(e) && e[0] === R.selfId && Number.isInteger(e[1])) { wStart = e[1]; break; }
            }
          }
          let done = R.acks.get(id);
          if (done === undefined || done < base - 1) done = base - 1;    // first sight, or entries not for me
          let echo = false;
          for (let i = 1; i < o.length && i <= 512; i++) {
            const e = o[i];
            if (!Array.isArray(e) || !Number.isInteger(e[0])) break;
            const n = e[0];
            if (n <= done) { echo = true; continue; }
            if (n !== done + 1) break;
            done = n;
            const to = e[1];
            if (to !== R.selfId && !(to === '*' && n >= wStart)) continue;
            let env = e[2];
            if (e[3] === 1) { try { env = typeof env === 'string' ? JSON.parse(env) : undefined; } catch (err) { env = undefined; } }
            if (env !== undefined) h.rel(id, env);
            if (R.closed) return;
          }
          if (R.acks.get(id) !== done) { R.acks.set(id, done); markDirty(); } else if (echo) R.needEcho = true;
        }
        // their latest state
        if (Number.isInteger(pr.q) && pr.q > s.q) {
          let v;
          if (pr.s !== undefined) v = pr.s;
          else if (typeof pr.z === 'string') { try { v = JSON.parse(pr.z); } catch (e) { v = undefined; } }
          if (v !== undefined) { s.q = pr.q; h.state(id, v); }
          if (R.closed) return;
        }
        // a deliberate leave (its last outbox entries are read above): end that player now, no absence grace
        if (pr.x === 1) { s.bye = true; R.maybeGone.delete(id); gone(id, 'left'); }
      }
      function gone(id, why) {
        R.acks.delete(id); R.ackedBy.delete(id);
        for (const e of R.out) e.targets.delete(id);
        prune();
        h.gone(id, why);
      }
      // still settling after my own (re)connect? The runtime re-presents the room over a second or two then
      const settling = () => !nr.connected() || (R.upAt > 0 && now() - R.upAt < tune.settleMs);
      function scan(peers) {
        if (R.closed || !Array.isArray(peers)) return;
        if (!R.selfId) { for (const p of peers) if (p && p.sameTab && typeof p.peer === 'string') R.selfId = p.peer; }
        if (!R.selfId) return;                      // nothing can be read before I know my own label
        R.lastPeers = peers;
        const present = new Set();
        for (const p of peers) {
          if (!p || typeof p.peer !== 'string' || p.peer === R.selfId || p.sameTab || p.kind === 'agent') continue;
          present.add(p.peer);
          R.maybeGone.delete(p.peer);               // (back within the grace: nothing happened)
          const prev = R.seen.get(p.peer);
          if (prev && prev.pr === p.presence && !prev.missing) continue;
          readPeer(p.peer, p.presence, prev);
          if (R.closed) return;
        }
        // Absent players are only provisionally gone: a connection refresh / network switch (theirs or mine) makes a
        // presence vanish and come back with the same label. Decided in maint() once the grace runs out.
        for (const [id, s] of Array.from(R.seen)) {
          if (present.has(id) || s.missing) continue;
          if (!s.role || s.bye) { R.seen.delete(id); continue; }
          s.missing = now();
          R.maybeGone.set(id, now() + tune.graceMs);
        }
      }
      function maint() {
        if (R.closed) return;
        const t = now();
        let ps = null;
        try { ps = nr.peers(); } catch (e) { ps = null; }
        if (ps && ps !== R.lastPeers) scan(ps);
        if (R.closed) return;
        for (const [id, at] of Array.from(R.maybeGone)) {
          if (t < at) continue;
          if (settling()) { R.maybeGone.set(id, t + 1000); continue; }   // decide once I am back and the room settled
          R.maybeGone.delete(id); R.seen.delete(id);
          gone(id, 'gone');
          if (R.closed) return;
        }
        if (R.out.length) prune();
        if ((R.out.length || R.needEcho) && t - R.lastFlush >= tune.resendMs) { R.k++; markDirty(); }
      }
      function onConn(c) {
        if (c) { if (!R.connSince) R.connSince = now(); if (R.discAt || !R.upAt) R.upAt = now(); R.discAt = 0; R.k++; markDirty(); } else if (!R.discAt) R.discAt = now();
      }
      // a guest whose host has been absent for a moment reports an unhealthy link (the '연결이 불안정해요' chip)
      function hostMissing() {
        if (role !== 'guest' || !R.hostId) return false;
        const s = R.seen.get(R.hostId);
        return !!(s && s.missing && now() - s.missing > 1000);
      }
      function onRoomError(err) {
        if (R.closed) return;
        const c = err && err.code;
        if (TERMINAL.includes(c)) markRoomDead(c);
        else warnOnce('roomerr', 'room error: ' + (c || 'unknown'));
        h.fatal('lost');
      }
      function close() {
        if (R.closed) return;
        R.closed = true;
        cancel(R.flushT);
        if (R.maint !== null) W.clearInterval(R.maint);
        for (const u of R.unsubs) { try { u(); } catch (e) { /* ignore */ } }
        try { const p = nr.leave(); if (p && typeof p.then === 'function') p.then(null, () => {}); } catch (e) { /* ignore */ }
      }
      // a deliberate leave says bye first (presence x:1), so the others end me at once instead of after the grace;
      // the room is left a moment later, once that presence went out (`fast`, e.g. pagehide: right away). A pending
      // flush goes out first: the bye merges onto a presence that carries the last outbox entries (a message sent just
      // before leave() - the engine's trophy 'gg' - is read before the x:1)
      function leave(fast) {
        if (R.closed || R.leaving) return;
        if (R.flushT !== null) flush();
        R.leaving = true;
        cancel(R.flushT); R.flushT = null;
        try { const p = nr.presence({ x: 1 }); if (p && typeof p.then === 'function') p.then(null, () => {}); } catch (e) { /* ignore */ }
        if (fast) close(); else later(close, tune.byeMs);
      }
      const link = {
        selfId: null, hostId: null,
        setMembers(ids) {
          const next = new Set(ids.filter((id) => id !== R.selfId));
          for (const id of next) if (!R.w.has(id)) R.w.set(id, R.nextN);
          for (const id of Array.from(R.w.keys())) if (!next.has(id)) R.w.delete(id);
          for (const e of R.out) if (e.to === '*') for (const id of Array.from(e.targets)) if (!next.has(id)) e.targets.delete(id);
          R.others = next;
          prune();
          markDirty();
        },
        sendState(obj) {
          R.state = obj;
          R.stateStr = shapeOk(obj, PRESENCE_DEPTH - 1) ? null : JSON.stringify(obj);
          R.stateQ++;
          markDirty();
        },
        sendRel(to, env) {
          if (R.closed) return;
          const n = R.nextN++;
          const targets = new Set(to === '*' ? R.others : [to]);
          R.out.push({ n, to, env, json: shapeOk(env, PRESENCE_DEPTH - 3) ? null : JSON.stringify(env), targets, t0: now() });
          if (R.out.length > 512) { R.out.shift(); warnOnce('outbox', 'outbox overflow, oldest entry dropped'); }
          prune();
          markDirty();
        },
        health() {
          if (R.closed || R.leaving) return false;
          if (hostMissing()) return false;
          if (nr.connected()) return true;
          if (!R.discAt) R.discAt = now();
          return now() - R.discAt < 2000;
        },
        close(fast) { leave(!!fast); },
      };
      try {
        R.unsubs.push(nr.onPeers((ch) => scan(ch && ch.peers ? ch.peers : nr.peers()), onRoomError));
        R.unsubs.push(nr.onConnection(onConn, onRoomError));
      } catch (e) { close(); throw fail('unavailable'); }
      R.maint = W.setInterval(maint, 100);
      markDirty();
      const me = await waitUntil(() => R.selfId || R.closed, 8000);
      if (!me || R.closed) { close(); throw fail('timeout'); }
      link.selfId = R.selfId;
      if (role === 'host') {
        for (const s of R.seen.values()) if (s.role === 'h') { close(); throw fail('taken'); }
        link.hostId = R.selfId;
        return link;
      }
      // no host seen: not_found findMs after the room connected (a named room's presence can take seconds to arrive),
      // and at the latest 1 s before the join's own deadline - a slow connect still says 방을 찾을 수 없어요, not a timeout
      const found = await waitUntil(() => R.hostId || R.closed || (R.connSince && (now() - R.connSince > tune.findMs || now() - t0 > tune.joinMs - 1000) ? '-' : null), tune.joinMs);
      if (!found || found === '-' || R.closed) { close(); throw fail(found === '-' ? 'not_found' : 'timeout'); }
      link.hostId = R.hostId;
      return link;
    })();
  }

  // ==================================================================================== public entry points
  async function host(opts) {
    opts = opts || {};
    const transport = opts.transport;
    if (!TRANSPORTS.includes(transport)) throw fail('unavailable', { reason: 'transport' });
    let code = null;
    if (opts.code !== undefined && opts.code !== null) {
      code = String(opts.code).trim().toLowerCase();
      if (!CODE_RE.test(code)) throw fail('unavailable', { reason: 'bad_code' });
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const c = code || genCode();
      const core = makeCore(transport, 'host', c, opts);
      try {
        return await core.openHost();
      } catch (e) {
        if (e && e.code === 'taken') { if (code) throw fail('unavailable', { reason: 'taken' }); continue; }
        throw e && e.code ? e : fail('unavailable');
      }
    }
    throw fail('unavailable', { reason: 'taken' });
  }
  async function join(opts) {
    opts = opts || {};
    const transport = opts.transport;
    if (!TRANSPORTS.includes(transport)) throw fail('unavailable', { reason: 'transport' });
    const code = String(opts.code === undefined || opts.code === null ? '' : opts.code).trim().toLowerCase();
    if (!CODE_RE.test(code)) throw fail('not_found');
    return makeCore(transport, 'guest', code, opts).openGuest();
  }

  function onPageHide() { for (const c of Array.from(live)) c.close('left', true); }
  try { W.addEventListener('pagehide', onPageHide); } catch (e) { /* ignore */ }
  function dispose() {
    try { W.removeEventListener('pagehide', onPageHide); } catch (e) { /* ignore */ }
    for (const c of Array.from(live)) c.close('left', true);
    if (lobbyRef) { try { lobbyRef.api.close(); } catch (e) { /* ignore */ } }
  }

  PG.Net = {
    transports, lobby, host, join,
    fromQuery, profileName, TEXT,
    roomDead: () => roomDead,
    peerId: (code) => PEER_PREFIX + String(code || ''),   // (the 'peer' host id of a room code: tests)
    MAX_PLAYERS, STATE_MAX, MSG_MAX,
    _sessions: () => Array.from(live, (c) => c.api),
    _dispose: dispose,
  };
})(window.PG);
