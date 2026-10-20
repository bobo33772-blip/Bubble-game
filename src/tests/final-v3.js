// FINAL independent verification of v3 (online multiplayer + animal characters). 1-4 same-origin iframes of
// preview.html, each a full game, driven like players would: through the DOM (title picker, 친구와 하기, the room's
// buttons, the result cards) plus PG.debug / PG.debug.mp for inputs and for posing the world. Built to
// C:/Temp/bogeul/test-final-v3.html; needs a real http origin:
//   node bogeul/build.js
//   node bogeul/tools/serve.js                    (keep running: http://localhost:8765, root C:/Temp/bogeul)
//   node bogeul/tools/run-chrome.js http://localhost:8765/test-final-v3.html - 1200 900 rt1800000 "FV3 DONE"
// The bc link: end to end 100 +- 40 ms latency and 5 % state loss. PG.Net simulates on BOTH ends of a link, so each
// page gets half: ?net=bc&lat=30&jit=40&drop=0.0253 (2 x 30 + U(0,40) + U(0,40) = 60..140 ms, mean 100;
// 1 - 0.9747^2 = 5.0 % loss). Override with ?link=lat=..%26jit=..%26drop=..
// Phases (?only=a,b,...): solo, perks, coop, battle (every arena; ?arenas=0,2 for some), leaves, room (the artifact path
// through a FAKE window.claude room runtime written here from the documented facts), soak (?soak=60 s per mode).
// Screenshot scenes (?shot=room|coop|battle|podium[&who=N]): that scene's chosen frame fills the window, then
// "FV3 SHOT READY".
// Prints "FV3 PASS|FAIL <name>", "FV3 METRIC <name> <value>", "FV3 INFO ...", "FV3 DONE pass=N fail=M".
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const LINK = Q.get('link') || 'lat=30&jit=40&drop=0.0253';
  const ONLY = (Q.get('only') || '').split(',').filter(Boolean);
  const ARENAS = (Q.get('arenas') || '0,1,2,3').split(',').map((s) => +s);
  const SHOT = Q.get('shot') || '';
  const WHO = Q.get('who') === null ? -1 : +Q.get('who');
  const SOAK = +(Q.get('soak') || 60);
  const SC = '<' + 'script>', SE = '<' + '/script>';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const J = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
  function ok(name, cond, info) {
    if (cond) { pass++; log('FV3 PASS ' + name); } else { fail++; log('FV3 FAIL ' + name + (info !== undefined ? ' :: ' + J(info).slice(0, 900) : '')); }
    return !!cond;
  }
  const metric = (name, v) => log('FV3 METRIC ' + name + ' ' + (typeof v === 'string' ? v : J(v)));
  const info = (s) => log('FV3 INFO ' + s);
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
  window.addEventListener('error', (e) => { fail++; log('FV3 FAIL driver page error: ' + e.message + ' @' + e.lineno); });
  window.addEventListener('unhandledrejection', (e) => { fail++; log('FV3 FAIL driver unhandled rejection: ' + (e.reason && (e.reason.stack || e.reason.message || e.reason))); });
  try { PG.debug.G.manual = true; PG.Audio.setMuted(true); } catch (e) { /* ignore */ }
  document.body.style.background = '#061518';

  // ================================================================ frames (players)
  const frames = [];
  let frameN = 0;
  const LAYOUT = [[0, 0], [600, 0], [0, 450], [600, 450], [300, 225]];
  function hookFrame(fr) {
    const w = fr.w;
    w.addEventListener('error', (e) => { fr.errors.push(e.message + ' @' + e.lineno); log('FV3 frame ' + fr.i + ' page error: ' + e.message + ' @' + e.lineno); });
    w.addEventListener('unhandledrejection', (e) => { fr.errors.push('rejection ' + (e.reason && e.reason.message)); log('FV3 frame ' + fr.i + ' unhandled rejection: ' + (e.reason && e.reason.message)); });
    for (const k of ['error', 'warn']) {
      const f0 = w.console[k];
      w.console[k] = function () { const s = Array.prototype.map.call(arguments, (a) => (a && a.stack) || String(a)).join(' '); fr.errors.push(k + ': ' + s); log('FV3 frame ' + fr.i + ' console.' + k + ': ' + s); return f0.apply(w.console, arguments); };
    }
    // every sfx / music this page asks for (names checked against the audio module's own lists)
    try {
      const A = w.PG.Audio, sfx0 = A.sfx, mus0 = A.music;
      A.sfx = function (n, o) { fr.sfx.push(n); if (fr.sfx.length > 4000) fr.sfx.splice(0, 2000); return sfx0.call(A, n, o); };
      A.music = function (t) { fr.music.push(t); return mus0.call(A, t); };
      A.setMuted(true);
    } catch (e) { log('FV3 INFO no audio hook: ' + e.message); }
  }
  function frameEl(i, set) {
    const f = document.createElement('iframe');
    const pos = LAYOUT[i % LAYOUT.length];
    f.title = 'player ' + i;
    f.style.cssText = 'position:fixed;left:' + pos[0] + 'px;top:' + pos[1] + 'px;width:600px;height:450px;border:0;z-index:' + (10 + i) + ';background:#0a2327';
    set(f);
    return f;
  }
  function loadFrame(f, i, extra) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('frame ' + i + ' did not load')), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        const okp = await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.Net && w.document.getElementById('pg-pick').children.length === 6, 15000);
        clearTimeout(t);
        if (!okp) { reject(new Error('frame ' + i + ' has no PG.debug.mp')); return; }
        const fr = Object.assign({ i, el: f, w, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, errors: [], sfx: [], music: [] }, extra || {});
        hookFrame(fr);
        frames.push(fr);
        resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  function frame(opts) {
    opts = opts || {};
    const i = frameN++;
    const f = frameEl(i, (el) => { el.src = 'preview.html?' + (opts.query !== undefined ? opts.query : 'net=bc&' + LINK) + '&frame=' + i; });
    return loadFrame(f, i);
  }
  // drop a frame: leave() first (a deliberate leave) unless `abrupt` (the tab just goes away)
  function drop(fr, abrupt) {
    if (!abrupt) { try { fr.mp.leave(); } catch (e) { /* ignore */ } }
    if (fr.page) fr.page.gone();
    try { fr.el.remove(); } catch (e) { /* ignore */ }
    const k = frames.indexOf(fr); if (k >= 0) frames.splice(k, 1);
  }
  async function dropAll() { for (const fr of frames.slice()) drop(fr); await sleep(400); }
  const S = (fr) => fr.D.getState();
  const V = (fr) => fr.mp.view();
  const N = (fr) => fr.mp.state();
  const slotOf = (fr) => N(fr).mySlot;
  const me = (fr) => fr.G.players.find((p) => p.slot === slotOf(fr));
  const hp = (host, slot) => host.G.players.find((p) => p.slot === slot);
  const vp = (fr, slot) => V(fr).players.find((p) => p.slot === slot);
  const press = (fr, a, down) => fr.D.press(a, down, slotOf(fr) || 0);
  async function tap(fr, a, ms) { press(fr, a, true); await sleep(ms || 70); press(fr, a, false); }
  const idle = (fr) => { for (const a of ['left', 'right', 'jump', 'shoot']) press(fr, a, false); };
  const noErrors = (F) => F.every((f) => !f.errors.length);
  const errorsOf = (F) => F.map((f) => f.errors.slice(0, 3));

  // ---- DOM, the way a player uses it
  const $ = (fr, id) => fr.w.document.getElementById(id);
  function shown(el) {
    if (!el) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (e.hidden) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function click(fr, sel) {
    const el = typeof sel === 'string' ? (sel[0] === '#' || sel[0] === '[' || sel.includes(' ') ? fr.w.document.querySelector(sel) : $(fr, sel)) : sel;
    if (!el) { info('click: no element ' + sel + ' on frame ' + fr.i); return false; }
    if (!shown(el) || el.disabled) { info('click: ' + sel + ' on frame ' + fr.i + ' is ' + (el.disabled ? 'disabled' : 'hidden')); return false; }
    el.click();
    return true;
  }
  function typeIn(fr, el, text) {
    if (typeof el === 'string') el = $(fr, el);
    el.focus();
    el.value = text;
    el.dispatchEvent(new fr.w.Event('input', { bubbles: true }));
    el.dispatchEvent(new fr.w.Event('change', { bubbles: true }));
    el.blur();
  }
  function setSelect(fr, el, value) { el.value = String(value); el.dispatchEvent(new fr.w.Event('change', { bubbles: true })); }
  const text = (fr, id) => { const e = $(fr, id); return e ? e.textContent : ''; };

  // the title: pick an animal on the picker, then 친구와 하기 (or 혼자 하기)
  async function titlePick(fr, ch) {
    if (!click(fr, '#pg-pick [data-char="' + ch + '"]')) return false;
    return until(() => fr.G.sel === ch && $(fr, 'pg-pick-name').textContent === fr.D.chars().find((c) => c.id === ch).name, 1500);
  }
  async function openFriendsUI(fr) {
    click(fr, 'pg-friends-btn');
    return until(() => N(fr).overlay === 'friends' && N(fr).transport && !$(fr, 'pg-host').disabled, 6000);
  }
  // 방 만들기 through the 친구와 하기 panel; returns the code shown in the room screen
  async function uiHost(fr, o) {
    await titlePick(fr, o.char || 'duck');
    if (!(await openFriendsUI(fr))) { info('uiHost: friends panel not ready ' + J(N(fr))); return null; }
    if (o.nick) typeIn(fr, 'pg-nick', o.nick);
    click(fr, '#pg-friends [data-modes] [data-mode="' + (o.mode || 'coop') + '"]');
    if (o.mode === 'battle') {
      const box = $(fr, 'pg-host-opts');
      if (o.arena !== undefined) setSelect(fr, box.querySelector('select'), o.arena);
      if (o.time) click(fr, box.querySelector('[data-time="' + o.time + '"]'));
      const pk = box.querySelector('[data-opt="perks"]'), it = box.querySelector('[data-opt="intrusion"]');
      if (o.perks !== undefined && pk.checked !== !o.perks) { pk.checked = !o.perks; pk.dispatchEvent(new fr.w.Event('change', { bubbles: true })); }
      if (o.intrusion !== undefined && it.checked !== !!o.intrusion) { it.checked = !!o.intrusion; it.dispatchEvent(new fr.w.Event('change', { bubbles: true })); }
    }
    click(fr, 'pg-host');
    const inRoom = await until(() => N(fr).screen === 'room' && /^[a-z0-9]{4}$/.test(N(fr).code) && N(fr).overlay === 'room', 8000);
    if (!inRoom) { info('uiHost: no room ' + J({ err: N(fr).error, scr: N(fr).screen })); return null; }
    return N(fr).code;
  }
  // 코드로 참여: types the code shown on the host's screen (upper case, like a person reading it)
  async function uiJoin(fr, code, o) {
    await titlePick(fr, o.char || 'duck');
    if (!(await openFriendsUI(fr))) return { ok: false, why: 'panel' };
    if (o.nick) typeIn(fr, 'pg-nick', o.nick);
    typeIn(fr, 'pg-code', String(code).toUpperCase());
    click(fr, 'pg-join');
    const r = await until(() => (N(fr).screen === 'room' && N(fr).roster.length >= 2 ? 'room' : null) || (N(fr).error ? 'err' : null), 15000);
    return { ok: r === 'room', why: r === 'err' ? N(fr).error : r || 'timeout' };
  }
  // a room of n through the UI: returns {F, host, code}
  async function uiRoom(n, o, chars, nicks) {
    const F = [];
    for (let i = 0; i < n; i++) F.push(await frame());
    const host = F[0];
    const code = await uiHost(host, Object.assign({ char: chars[0], nick: nicks[0] }, o));
    if (!code) return { F, host, code: null };
    for (let i = 1; i < n; i++) {
      const r = await uiJoin(F[i], code, { char: chars[i], nick: nicks[i] });
      if (!r.ok) info('join ' + i + ' failed: ' + r.why);
    }
    await until(() => F.every((f) => N(f).roster.length === n && N(f).roster.every((r) => r.nick !== '손님' || nicks.includes('손님'))), 8000);
    return { F, host, code };
  }
  // 준비 on every guest, 시작 on the host; watches the 3-2-1 on every page
  async function uiStart(F) {
    for (const f of F.slice(1)) click(f, 'pg-ready');
    const can = await until(() => N(F[0]).canStart && !$(F[0], 'pg-go').disabled, 8000);
    if (!can) { info('uiStart: 시작 never enabled ' + J(N(F[0]).roster)); return { started: false }; }
    const sfx0 = F.map((f) => f.sfx.length);
    click(F[0], 'pg-go');
    const seen = F.map(() => ({ phases: new Set(), banners: new Set() }));
    const playing = await until(() => {
      F.forEach((f, k) => { seen[k].phases.add(S(f).phase); const b = V(f).banner; if (b) seen[k].banners.add(b); });
      return F.every((f) => S(f).phase === 'playing' && S(f).online);
    }, 15000, 20);
    const cd = F.map((f, k) => ({ phases: Array.from(seen[k].phases), banners: Array.from(seen[k].banners), countdownSfx: f.sfx.slice(sfx0[k]).filter((n) => n === 'countdown').length, go: f.sfx.slice(sfx0[k]).includes('go') }));
    return { started: !!playing, cd };
  }

  // ---- the world, posed for a scripted moment (host side)
  // every enemy waits off screen, and the round's hurry-up clock restarts (a scripted moment takes a while)
  function parkAll(host) {
    for (const e of host.G.enemies) { if (e.state === 'dead') continue; e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; e.bubble = null; }
    const G = host.G;
    if (G.gameMode !== 'battle') { G.roundT = 0; G.hurry = false; G.scald = false; G.drops.length = 0; }
  }
  // any enemy of the host's world that is still in it (to pose)
  function foe(host) {
    const e = host.G.enemies.find((q) => q.state !== 'dead' && !q.minion) || host.G.enemies.find((q) => q.state !== 'dead');
    if (!e) throw new Error('no enemy left to pose');
    return e;
  }
  // an enemy standing at (x, y): a mold that never hops (it cannot walk into anybody)
  function pose(e, x, y, dir) {
    Object.assign(e, { type: 'mold', state: 'active', x, y, vx: 0, vy: 0, onGround: true, angry: false, escaped: false, hopT: 1e9, delay: 0, spawnY: y,
      jumpCd: 999, chargeCd: 999, windT: 0, chargeT: 0, committed: false, soakT: 0, dir: dir || -1, water: 0, grace: 0, bubble: null, ice: null });
    return e;
  }
  // a guest's interpolated view vs the host's actual world at the tick it shows
  function syncSample(host, g) {
    const v = V(g), tr = host.mp.traceAt(Math.round(v.renderTick));
    if (!tr) return null;
    const hostE = new Map(tr.E.filter((e) => e[3] !== 'dead').map((e) => [e[0], e]));
    const gE = v.enemies.filter((e) => e.state !== 'dead');
    const ids = (a) => a.slice().sort((x, y) => x - y).join(',');
    let maxD = 0;
    for (const e of gE) { const h = hostE.get(e.id); if (h && Math.abs(h[2] - e.y) < 60) maxD = Math.max(maxD, Math.hypot(h[1] - e.x, h[2] - e.y)); }
    const gB = v.bubbles.filter((b) => !b.pred && b.state !== 'pop'), hostU = new Map(tr.U.map((b) => [b[0], b]));
    let maxDU = 0;
    for (const b of gB) { const h = hostU.get(b.id); if (h) maxDU = Math.max(maxDU, Math.hypot(h[1] - b.x, h[2] - b.y)); }
    return { dk: Math.abs(tr.k - v.renderTick), sameE: ids(Array.from(hostE.keys())) === ids(gE.map((e) => e.id)), nE: gE.length, maxD: r1(maxD),
      nU: gB.length, missingU: gB.filter((b) => !hostU.has(b.id)).length, maxDU: r1(maxDU) };
  }
  function nanScan(o, path, out, depth) {
    if (out.length > 4 || depth > 8) return out;
    if (typeof o === 'number') { if (!Number.isFinite(o)) out.push(path); return out; }
    if (!o || typeof o !== 'object') return out;
    for (const k of Object.keys(o)) nanScan(o[k], path + '.' + k, out, (depth || 0) + 1);
    return out;
  }
  const scoreLine = (f) => S(f).players.map((p) => p.slot + ':' + p.score).join(',');
  // the host's word for every player's score: guests' views must agree (after their render clock caught up)
  async function scoresAgree(host, F, ms) {
    const ref = () => scoreLine(host);
    return until(() => F.every((f) => scoreLine(f) === ref()), ms || 3000);
  }
  // the animal walks onto something it sees in ITS OWN view (a bubble, a ghost, a giant bubble): a player jumping
  // into it. Repeats while the thing drifts, until done() (decided by the host) or the time is up.
  async function touch(fr, where, done, ms) {
    return until(() => {
      if (done()) return true;
      const p = where(); if (!p) return false;
      fr.D.setPlayer(p.x, p.y, slotOf(fr) || 0);
      return false;
    }, ms || 3000, 60);
  }
  // fill one frame to the whole window (screenshot scenes)
  function fullscreen(fr) {
    for (const f of frames) f.el.style.visibility = f === fr ? 'visible' : 'hidden';
    fr.el.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;z-index:999;background:#0a2327';
  }

  // ---- trap + pop an enemy with a player's own bubble (fr shoots, the world is `host`'s; `popper` touches the
  // trapped bubble in its own view). The enemy stands 44 px in front on the shooter's floor; everything else is
  // parked. Returns true when the kill is the popper's.
  async function shootAndPop(host, fr, e, popper) {
    popper = popper || fr;
    const p = me(fr) || fr.G.p, slot = slotOf(fr) || 0, ps = slotOf(popper) || 0;
    const ex = p.x < 150 ? p.x + 44 : p.x - 44;
    pose(e, ex, p.y, ex > p.x ? 1 : -1);
    await sleep(450);                                 // (the shooter's view shows it by now)
    await tap(fr, ex > p.x ? 'right' : 'left', 40);
    await sleep(250);
    const k0 = hp(host, ps).kills;
    await tap(fr, 'shoot', 60);
    const trapped = await until(() => e.state === 'trapped' && e.bubble && e.bubble.owner === slot, 2500);
    if (!trapped) { info('shootAndPop: not trapped ' + J({ st: e.state, ex, px: p.x, py: p.y, dead: p.dead, ghost: !!p.ghost, ctl: N(fr).ctl, host: hp(host, slot) && [hp(host, slot).x, hp(host, slot).y, !!hp(host, slot).ghost], hurry: host.G.hurry, rt: host.G.roundT })); return false; }
    const id = e.bubble.id;
    const seen = await until(() => V(popper).bubbles.some((b) => b.id === id && b.kind === 'trapped'), 2500);
    if (!seen) info('shootAndPop: popper does not see trapped bubble ' + id);
    const popped = await touch(popper, () => { const b = V(popper).bubbles.find((q) => q.id === id); return b && { x: b.x, y: b.y + 1 }; }, () => e.state === 'dead', 3500);
    return !!popped && hp(host, ps).kills === k0 + 1;
  }

  // seal the boss with a real bubble of `sh` (the soap gauge one short of full), then `bu` bursts the giant bubble
  // by touching it in its own view
  async function bossHit(host, sh, bu) {
    const B = host.G.boss;
    if (!(await until(() => B.state === 'fight', 8000))) { info('bossHit: boss not fighting ' + B.state); return { sealed: false, state: B.state }; }
    const p = me(sh) || sh.G.p;
    const freeze = () => {
      Object.assign(B, { calm: 99999, act: 'rest', actT: 99999, vx: 0, vy: 0, minionT: 99999, atkCd: 99999 });
      host.G.hazards.length = 0;
      for (const e of host.G.enemies) if (e.state !== 'dead') { e.state = 'dead'; e.deadT = 400; }
    };
    freeze();
    host.D.soapBoss(Math.max(0, B.soapMax - 1 - B.soap));
    B.x = Math.max(16, Math.min(240 - 32, p.x + 40)); B.y = p.y + 16 - 32; B.onGround = true;
    if (B.x < p.x + 24) B.x = Math.max(16, p.x - 64);
    await sleep(600); freeze();
    await tap(sh, B.x > p.x ? 'right' : 'left', 40);
    await sleep(300);
    const soap0 = B.soap;
    await tap(sh, 'shoot', 60);
    const sealed = await until(() => B.state === 'stun' && B.giant, 3000);
    if (!sealed) return { sealed: false, soap0, soap: B.soap, state: B.state };
    const bs = slotOf(bu) || 0, sc0 = hp(host, bs).score, hp0 = B.hp;
    const seenGiant = await until(() => V(bu).boss && V(bu).boss.giant, 2500);
    const burst = await touch(bu, () => { const g = V(bu).boss && V(bu).boss.giant; return g && { x: g.x + 12, y: g.y + 12 }; }, () => B.hp < hp0 || B.state === 'defeat', 4000);
    return { sealed: true, seenGiant: !!seenGiant, burst: !!burst, gain: hp(host, bs).score - sc0, hp: B.hp };
  }

  // ================================================================ phase: solo (the v2 path + the animal picker)
  async function solo() {
    const fr = await frame({ query: 'solo=1' });
    const pick = fr.w.document.querySelectorAll('#pg-pick [data-char]');
    ok('solo: title shows the picker with the 6 animals', N(fr).overlay === 'title' && pick.length === 6 &&
      Array.from(pick).map((b) => b.dataset.char).join() === 'duck,capy,otter,penguin,cat,frog', Array.from(pick).map((b) => b.dataset.char));
    ok('solo: each portrait has the animal name', Array.from(pick).every((b) => b.textContent.trim() === fr.D.chars().find((c) => c.id === b.dataset.char).name), Array.from(pick).map((b) => b.textContent));
    const picked = await titlePick(fr, 'otter');
    // (v4: the one-line perk became the kit card - name, the tag line, the move line, the bubble line; char-kits §12)
    const kitTxt = () => ['pg-pick-name', 'pg-pick-animal', 'pg-pick-role', 'pg-pick-perk', 'pg-pick-move', 'pg-pick-movehow', 'pg-pick-bub', 'pg-pick-bubdesc'].map((id) => text(fr, id));
    ok('solo: picking 해롱이 shows its kit card (name, role, tag, 특기 and 거품 lines)', !!picked && kitTxt().join('|') === '해롱이|해달|돌격|휙 날아들어 세 갈래 물장구!|휙 대시|공중에서 점프 한 번 더! 옆으로 휙|물장구 거품|세 갈래로 촤악 퍼져요', kitTxt());
    click(fr, 'pg-start');
    const playing = await until(() => S(fr).phase === 'playing' && S(fr).mode === 'solo', 6000);
    const s0 = S(fr);
    ok('solo: 혼자 하기 starts round 1 as the picked animal (solo, host, offline)', !!playing && s0.round === 0 && s0.role === 'host' && !s0.online &&
      s0.players.length === 1 && s0.players[0].char === 'otter' && s0.lives === 4, { phase: s0.phase, mode: s0.mode, round: s0.round, p: s0.players.map((p) => p.char) });
    await sleep(2400);
    // round 1: every enemy trapped in the otter's own bubble and popped by touching it
    const G = fr.G, E = G.enemies.slice();
    let kills = 0;
    for (const e of E) {
      parkAll(fr);
      fr.D.setPlayer(28, 200);
      await sleep(500);
      if (await shootAndPop(fr, fr, e)) kills++;
      await sleep(300);
    }
    ok('solo: round 1 - all 3 enemies trapped in bubbles and popped by the player', E.length === 3 && kills === 3 && E.every((e) => e.state === 'dead'), { kills, st: E.map((e) => e.state) });
    ok('solo: kills score points (500 each at least)', S(fr).score >= 1500, S(fr).score);
    const phases = new Set();
    const r2 = await until(() => { phases.add(S(fr).phase); return S(fr).round === 1 && S(fr).phase === 'playing'; }, 20000, 25);
    ok('solo: round 1 cleared -> sliding doors -> round 2', !!r2 && phases.has('transition'), [...phases]);
    // rounds 2-5 (cleared by the debug helper) -> the first boss
    for (let r = 1; r <= 4; r++) {
      await until(() => S(fr).round === r && S(fr).phase === 'playing', 20000);
      await sleep(300);
      fr.D.killAll();
      await until(() => S(fr).round === r + 1, 20000);
    }
    const boss = await until(() => S(fr).round === 5 && fr.G.boss && fr.G.boss.type === 'kingGrime', 20000);
    ok('solo: rounds 2-5 -> boss 1 (왕때꼬마), soap 8 for one player', !!boss && fr.G.boss.soapMax === 8, fr.G.boss && fr.G.boss.soapMax);
    fr.D.setInvincible(true);
    await sleep(500);
    const h1 = await bossHit(fr, fr, fr);
    ok('solo: the player\'s bubble seals the boss, a touch bursts it (HP 3 -> 2, +2000)', h1.sealed && h1.burst && h1.hp === 2 && h1.gain >= 2000, h1);
    for (let i = 0; i < 2; i++) { await until(() => fr.G.boss && fr.G.boss.state === 'fight', 8000); fr.D.damageBoss(); }
    const r7 = await until(() => S(fr).round === 6 && S(fr).phase === 'playing', 30000);
    ok('solo: boss 1 defeated -> round 7 (index 6), still solo', !!r7 && S(fr).mode === 'solo' && S(fr).players.length === 1, [S(fr).round, S(fr).phase, S(fr).mode]);
    ok('solo: no page errors, no NaN', noErrors([fr]) && !nanScan(S(fr), 's', []).length, errorsOf([fr]));
    await dropAll();
  }

  // ================================================================ phase: the six perks, measured (one engine, stepped)
  async function perks() {
    const fr = await frame({ query: 'perks=1' });
    const D = fr.D, G = fr.G;
    const setup = (round, ch) => {
      D.start(round, ch); D.setInvincible(true);
      for (const e of G.enemies) { e.state = 'descend'; e.delay = 1e9; e.y = -300; e.startY = -300; }
      D.step(1);
      return G.p;
    };
    const run = (p, act, n) => { D.press(act, true, 0); D.step(n); const v = p.vx; D.press(act, false, 0); return v; };
    const out = {};
    for (const ch of ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog']) {
      const o = out[ch] = {};
      let p = setup(0, ch);
      D.setPlayer(40, 200); D.step(10);
      o.walk = r1(Math.abs(run(p, 'right', 30)) * 100) / 100;
      // round 1's cold pool (bottom right, cols 21-29): walk inside it
      D.setPlayer(222, 196); D.step(40);
      o.coldWater = p.water;
      o.cold = r1(Math.abs(run(p, 'left', 20)) * 100) / 100;
      // round 2's hot pool (row 15, cols 12-19)
      p = setup(1, ch);
      D.setPlayer(140, 104); D.step(40);
      o.hotWater = p.water;
      o.shield = p.shield;
      o.hot = r1(Math.abs(run(p, 'left', 16)) * 100) / 100;
      // jump: take-off speed
      p = setup(0, ch); D.setPlayer(40, 200); D.step(10);
      D.press('jump', true, 0); D.step(1); o.jumpV = r1(p.vy * 100) / 100; D.press('jump', false, 0); D.step(60);
      // auto-fire: bubbles blown while holding the button for 2 s
      const n0 = G.bubbles.length; D.press('shoot', true, 0); D.step(120); D.press('shoot', false, 0);
      o.shots = G.bubbles.filter((b) => b.owner === 0).length - n0;
    }
    metric('perks', out);
    // (v4 kits, char-kits §15.1: the capy keeps x0.92 (1.15), the otter walks x1.12 (1.40) and keeps its swim x1.4 on top)
    ok('perks: everyone walks 1.25 px/f on land, the capybara 0.92x (1.15), the otter 1.12x (1.40)', ['duck', 'penguin', 'cat', 'frog'].every((c) => Math.abs(out[c].walk - 1.25) < 0.02) && Math.abs(out.capy.walk - 1.15) < 0.02 && Math.abs(out.otter.walk - 1.4) < 0.02, Object.keys(out).map((c) => c + ' ' + out[c].walk));
    ok('perks: in cold water: duck 1.0x (1.25), penguin 1.0x, otter 1.4x of its 0.8x (1.40 x 0.8 x 1.4 = 1.57), frog 0.8x (1.0), capy 0.8 x 0.92', out.duck.coldWater === 2 && Math.abs(out.duck.cold - 1.25) < 0.02 && Math.abs(out.penguin.cold - 1.25) < 0.02 &&
      Math.abs(out.otter.cold - 1.568) < 0.02 && Math.abs(out.frog.cold - 1.0) < 0.02 && Math.abs(out.capy.cold - 0.92) < 0.02, out);
    ok('perks: in hot water the penguin is slowed like everyone (1.0), the duck is not', out.penguin.hotWater === 1 && Math.abs(out.penguin.hot - 1.0) < 0.02 && Math.abs(out.duck.hot - 1.25) < 0.02, [out.penguin, out.duck]);
    ok('perks: the capybara in hot water gets the 3 s one-hit shield; nobody else does', out.capy.hotWater === 1 && out.capy.shield > 130 && out.capy.shield <= 180 && ['duck', 'otter', 'penguin', 'frog'].every((c) => !out[c].shield), Object.keys(out).map((c) => c + ' ' + out[c].shield));
    ok('perks: the cat never floats (water touched -> flung up)', out.cat.coldWater === 0 && out.cat.hotWater === 0, out.cat);
    // (measured after the take-off frame, which already has one frame of gravity, 0.22, in it. v4: CAT_JUMP 1.08 is retired
    // - the cat takes off like everyone and has its double jump instead; FROG_CD 0.7 became the frog's kit cooldown 12 / 20)
    ok('perks: every animal takes off at -4.1 (the cat\'s 1.08x is retired)', Object.keys(out).every((c) => Math.abs(out[c].jumpV - 0.22 + 4.1) < 0.02), Object.keys(out).map((c) => c + ' ' + out[c].jumpV));
    ok('perks: the frog\'s autofire is every 20 f vs 24: one more bubble in 2 s (cooldown 12 / 20)', out.frog.shots === out.duck.shots + 1 && out.duck.shots >= 4, [out.frog.shots, out.duck.shots]);
    // ---- v4: each animal's move (on JUMP) and bubble in the real round 1 (char-kits §3-§8; measured in depth by kits.js).
    // (x 84 on the floor: the row-21 shelf ends at x 80, so the top of a jump there is clear of anything to land on - over
    // a shelf the air move is refused by its landing probe and the press is the buffered jump; the otter / penguin go
    // left from the top)
    const kit = {};
    for (const ch of ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog']) {
      const p = setup(0, ch); D.setPlayer(84, 200); D.step(10); G.bubbles = [];
      const mvs = new Set(), hops = new Set();
      const tapJ = () => { D.press('jump', true, 0); D.step(1); D.press('jump', false, 0); };
      if (ch === 'duck') { D.press('jump', true, 0); for (let i = 0; i < 40; i++) { D.step(1); if (p.mv) mvs.add(p.mv); } D.press('jump', false, 0); }
      else if (ch === 'frog') { tapJ(); for (let k = 0; k < 2; k++) { for (let i = 0; i < 80 && !(i > 2 && p.onGround); i++) D.step(1); tapJ(); hops.add(p.hop); } }
      else {
        tapJ();
        for (let i = 0; i < 40 && p.vy < 0; i++) D.step(1);
        D.press('left', ch === 'otter' || ch === 'penguin', 0); // (the dash / dive goes the held way: from the top only)
        tapJ(); for (let i = 0; i < 70; i++) { D.step(1); if (p.mv) mvs.add(p.mv); }
        D.press('left', false, 0);
      }
      D.step(60); G.bubbles = []; D.setPlayer(40, 200); D.step(10); p.facing = 1; p.shootCd = 0;
      const n0 = G.seq; D.press('shoot', true, 0); D.step(1); D.press('shoot', false, 0);
      const bs = G.bubbles.filter((b) => b.id > n0 && b.owner === 0);
      kit[ch] = { mv: [...mvs].join('/'), hop: [...hops].join('/'), bub: bs.map((b) => b.ty + ' r' + b.r + '/' + b.rP + (b.drop ? ' drop' : '')).join(', ') };
    }
    metric('kits', kit);
    ok('kits: each move on JUMP in round 1 - duck glide, capy wind-up / slam / recovery, otter dash, penguin dive + slide (into the wall: 콩), cat curl, frog hop chain', kit.duck.mv === 'glide' &&
      kit.capy.mv === 'wind/slam/rec' && kit.otter.mv === 'dash' && /^dive\/slide(\/bonk)?$/.test(kit.penguin.mv) && kit.cat.mv === 'curl' && kit.frog.hop === '1/2', kit);
    ok('kits: each bubble - duck echo, capy big (r 11 / 10), otter 3-way fan (2 droplets), penguin icicle (rP 6), cat yarn, frog egg', kit.duck.bub === 'echo r8/8' && kit.capy.bub === 'line r11/10' &&
      kit.otter.bub === 'line r8/8, line r6/6 drop, line r6/6 drop' && kit.penguin.bub === 'line r8/6' && kit.cat.bub === 'yarn r8/8' && kit.frog.bub === 'egg r8/8', kit);
    // 능력 끄기: the duck is slowed in water like everyone
    let p = setup(0, 'duck'); D.setPerks(false);
    D.setPlayer(222, 196); D.step(40);
    const off = Math.abs(run(p, 'left', 20));
    D.setPerks(true);
    ok('perks: 능력 끄기 turns them off (the duck afloat 1.0 px/f)', Math.abs(off - 1.0) < 0.02, off);
    // the cat touching water: "냥!" word pop
    p = setup(0, 'cat'); D.setPlayer(200, 180);
    let nyang = false;
    for (let i = 0; i < 40 && !nyang; i++) { D.step(1); nyang = Array.from(fr.w.document.querySelectorAll('#pg-words > *')).some((e) => e.textContent.indexOf('냥!') >= 0); }
    ok('perks: the cat\'s splash says "냥!"', nyang);
    ok('perks: no page errors', noErrors([fr]), errorsOf([fr]));
    await dropAll();
  }

  // ================================================================ phase: 3-player co-op from the lobby
  async function coop() {
    const { F, host, code } = await uiRoom(3, { mode: 'coop' }, ['duck', 'frog', 'cat'], ['방장', '개굴', '냥이']);
    const [, g1, g2] = F;
    ok('coop: 방 만들기 from 친구와 하기 makes a room with a 4-char code, shown big', /^[a-z0-9]{4}$/.test(code || '') && text(host, 'pg-room-code') === (code || '').toUpperCase(), [code, text(host, 'pg-room-code')]);
    if (!code) return dropAll();
    ok('coop: both guests joined by typing the code: 3 players on every page', F.every((f) => N(f).roster.length === 3 && N(f).screen === 'room'), F.map((f) => N(f).roster));
    const cards = (f) => Array.from(f.w.document.querySelectorAll('#pg-room-players li'));
    ok('coop: room cards: 4 seats, 3 taken (nick, animal, slot colour), 1 빈 자리', F.every((f) => cards(f).length === 4 && cards(f).filter((li) => li.classList.contains('is-empty')).length === 1),
      cards(g1).map((li) => li.textContent));
    const hostCard = cards(g1)[0];
    ok('coop: the host card says 방장 (text, no emoji), guests say 기다리는 중; slot colours yellow / mint', /방장/.test(hostCard.textContent) && /기다리는 중/.test(cards(host)[1].textContent) &&
      hostCard.style.getPropertyValue('--slot').trim().toLowerCase() === '#ffd447' && cards(host)[2].style.getPropertyValue('--slot').trim().toLowerCase() === '#7fdcc8', [hostCard.textContent, cards(host)[1].textContent]);
    ok('coop: 시작 shown only to the host and off until everyone is ready; 준비 only for guests', shown($(host, 'pg-go')) && $(host, 'pg-go').disabled && !shown($(host, 'pg-ready')) &&
      shown($(g1, 'pg-ready')) && !shown($(g1, 'pg-go')));
    // the room's re-pick: 냥이 changes to 까삐
    click(g2, '#pg-room-pick [data-char="capy"]');
    const rep = await until(() => N(host).roster[2] && N(host).roster[2].char === 'capy' && N(g1).roster[2].char === 'capy', 4000);
    ok('coop: a re-pick in the room reaches the host and the other guest', !!rep, N(host).roster);
    // 코드 복사 (clipboard or the fallback; either way a visible answer)
    click(host, 'pg-copy');
    await sleep(300);
    ok('coop: 코드 복사 answers (복사했어요! or the copy-by-hand hint)', /복사했어요|직접 알려/.test(text(host, 'pg-copy') + text(host, 'pg-room-msg')), [text(host, 'pg-copy'), text(host, 'pg-room-msg')]);
    const st = await uiStart(F);
    ok('coop: 준비 x2 -> 시작 -> everyone playing', st.started, F.map((f) => S(f).phase));
    if (!st.started) return dropAll();
    metric('coop.countdown', st.cd);
    ok('coop: a 3-2-1 countdown on every page (countdown phase, 2 and 1 banners, countdown beeps, go)', st.cd.every((c) => c.phases.includes('countdown') && c.banners.includes('2') && c.banners.includes('1') && c.countdownSfx >= 2 && c.go) &&
      st.cd[0].countdownSfx === 3 && st.cd[0].banners.includes('3'), st.cd);
    host.mp.trace(true);
    const gs = S(g1);
    ok('coop: guests are guests in a co-op game with the 3 animals and nicks', gs.role === 'guest' && gs.mode === 'coop' && gs.players.map((p) => p.char).join() === 'duck,frog,capy' &&
      gs.players.map((p) => p.nick).join() === '방장,개굴,냥이', gs.players.map((p) => [p.char, p.nick]));
    ok('coop: team lives 3 + (3 - 1) = 5 everywhere', F.every((f) => S(f).teamLives === 5), F.map((f) => S(f).teamLives));
    const tags = (f) => Array.from(f.w.document.querySelectorAll('#pg-tags > *')).map((t) => t.textContent).filter(Boolean);
    await sleep(1500);
    ok('coop: a name tag over every animal on every page', F.every((f) => ['방장', '개굴', '냥이'].every((n) => tags(f).some((t) => t.indexOf(n) >= 0))), F.map(tags));
    // sync: each guest's interpolated view = the host's world at the tick it shows
    const samples = [];
    for (let i = 0; i < 6; i++) { for (const g of [g1, g2]) samples.push(syncSample(host, g)); await sleep(300); }
    metric('coop.sync', samples.map((s) => s && [s.nE, s.sameE ? 1 : 0, s.maxD, s.dk]));
    ok('coop: guest views = host world at the same tick (same enemy ids, positions within 4 px)', samples.filter((s) => s && s.sameE && s.maxD < 4 && s.dk <= 2).length >= samples.length - 2, samples);
    // other players: what g1 shows of g2 (interpolated body stream) vs where g2 is
    parkAll(host);
    await until(() => F.every((f) => !vp(host, slotOf(f)).dead && !vp(host, slotOf(f)).ghost), 10000);
    g2.D.setPlayer(20, 200, 2);
    idle(g2); await sleep(800);
    const still = Math.hypot(vp(g1, 2).x - me(g2).x, vp(g1, 2).y - me(g2).y);
    press(g2, 'right', true); await sleep(600);
    const moving = Math.abs(vp(g1, 2).x - me(g2).x);
    press(g2, 'right', false); await sleep(800);
    const stopped = Math.hypot(vp(g1, 2).x - me(g2).x, vp(g1, 2).y - me(g2).y);
    metric('coop.peer_view_px', { still: r1(still), moving: r1(moving), stopped: r1(stopped) });
    ok('coop: another guest is drawn where it is (still < 1 px, walking < 24 px behind, stopped < 1 px)', still < 1 && moving < 24 && stopped < 1, { still, moving, stopped });

    // ---- round 1 cleared by the GUESTS' bubbles: 개굴 takes two, 냥이 (까삐) one
    host.D.setInvincible(true);
    parkAll(host);
    host.D.setPlayer(200, 72, 0);
    g1.D.setPlayer(36, 200, 1); g2.D.setPlayer(56, 136, 2);
    await sleep(2000);
    const E = host.G.enemies.slice();
    const plan = [g1, g2, g1];
    const res = [];
    for (let k = 0; k < E.length; k++) {
      parkAll(host);
      const f = plan[k % plan.length];
      f.D.setPlayer(f === g1 ? 36 : 56, f === g1 ? 200 : 136, slotOf(f));
      await sleep(500);
      res.push(await shootAndPop(host, f, E[k]));
      await sleep(400);
    }
    ok('coop: each guest\'s own shot traps an enemy in the host world and its touch pops it (kill credited to that guest)', res.length === 3 && res.every(Boolean), res);
    const kl = host.G.players.map((p) => p.kills);
    ok('coop: kills: host 0, 개굴 2, 냥이 1', kl.join() === '0,2,1', kl);
    const phases = new Set(), banners = new Set();
    const r2 = await until(() => { for (const f of F) { phases.add(S(f).phase); banners.add(V(f).banner); } return F.every((f) => S(f).round === 1 && S(f).phase === 'playing'); }, 20000, 25);
    ok('coop: round 1 cleared by guest kills -> doors -> round 2 on every page', !!r2 && phases.has('transition') && banners.has('청소 완료!'), { r: F.map((f) => S(f).round), banners: [...banners] });
    ok('coop: personal scores agree on every page', !!(await scoresAgree(host, F, 3000)), F.map(scoreLine));
    ok('coop: guests scored their kills (> 0)', hp(host, 1).score > 0 && hp(host, 2).score > 0, F.map(scoreLine));

    // ---- a ghost revive: 냥이 falls (decided on its own screen), 개굴 touches the ghost
    await sleep(2600);
    parkAll(host);
    host.D.setPlayer(200, 72, 0);
    g1.D.setPlayer(150, 136, 1); g2.D.setPlayer(48, 200, 2);
    await sleep(900);
    const lives0 = host.G.lives;
    pose(foe(host), me(g2).x, me(g2).y, 1);
    const ghost = await until(() => hp(host, 2).ghost, 4000);
    ok('coop: an enemy touches 냥이 on its own screen -> it falls -> ghost bubble (host)', !!ghost, { dead: hp(host, 2).dead });
    parkAll(host);
    const gy0 = hp(host, 2).y;
    const selfGhost = await until(() => vp(g2, 2).ghost && N(g2).ctl === 'remote', 2500);
    ok('coop: 냥이 sees itself as a ghost (and stops moving itself)', !!selfGhost);
    ok('coop: ...the other guest and the host see the ghost too', !!(await until(() => vp(g1, 2).ghost && S(host).players[2].ghost, 2000)));
    ok('coop: the ghost sprite exists for the animal (capy_ghost, 2 frames 16x16)', J(g1.D.frames('capy_ghost')) === '[[16,16],[16,16]]', g1.D.frames('capy_ghost'));
    await sleep(1000);
    ok('coop: the ghost floats up slowly', hp(host, 2).y < gy0 - 2 && hp(host, 2).y > gy0 - 20, [gy0, hp(host, 2).y]);
    ok('coop: falling costs no team life yet', host.G.lives === lives0, [lives0, host.G.lives]);
    const sfxR = g2.sfx.length;
    const rev = await touch(g1, () => { const q = vp(g1, 2); return q && q.ghost && { x: q.x, y: q.y + 2 }; }, () => !hp(host, 2).ghost && !hp(host, 2).dead, 4000);
    const at = { x: hp(host, 2).x, y: hp(host, 2).y };
    ok('coop: 개굴 touches the ghost on its screen -> 냥이 revived there (host), +1 revive for 개굴', !!rev && hp(host, 1).revives === 1 && Math.abs(at.x - 48) < 40, { rev, revives: hp(host, 1).revives, at });
    ok('coop: revived with 2 s of blink, team lives unchanged', hp(host, 2).invuln > 60 && hp(host, 2).invuln <= 120 && host.G.lives === lives0, [hp(host, 2).invuln, host.G.lives]);
    const back = await until(() => N(g2).ctl === 'local' && !vp(g2, 2).dead && !vp(g2, 2).ghost, 3000);
    ok('coop: 냥이 gets its animal back; the revive sound plays on its page', !!back && g2.sfx.slice(sfxR).includes('revive'), g2.sfx.slice(sfxR));
    // ---- a ghost nobody saves: after 8 s it respawns at its spawn and the team loses a life
    await sleep(2300);
    host.D.setPlayer(200, 40, 0); g2.D.setPlayer(200, 72, 2);
    g1.D.setPlayer(40, 200, 1);
    await sleep(900);
    const lives1 = host.G.lives;
    pose(foe(host), me(g1).x, me(g1).y, 1);
    const gh2 = await until(() => hp(host, 1).ghost, 4000);
    parkAll(host);
    const t0 = clock();
    const resp = await until(() => !hp(host, 1).ghost && !hp(host, 1).dead, 12000, 50);
    const secs = (clock() - t0) / 1000;
    const sp = host.D.levels()[1].players[1];
    ok('coop: an unsaved ghost respawns at its spawn after ~8 s; team lives 5 -> 4', !!gh2 && !!resp && secs > 6.5 && secs < 9.5 && host.G.lives === lives1 - 1 &&
      Math.abs(hp(host, 1).x - (sp.col * 8 - 4)) < 6, { secs: r1(secs), lives: [lives1, host.G.lives], x: hp(host, 1).x, sp });
    ok('coop: team lives agree on every page', !!(await until(() => F.every((f) => S(f).teamLives === host.G.lives), 2000)), F.map((f) => S(f).teamLives));

    // ---- boss 1: soap x(1 + 0.4 x 2) = 14 for 3 players; HP 3 (unchanged)
    host.D.gotoRound(5);
    const inBoss = await until(() => F.every((f) => V(f).boss && V(f).round === 5), 6000);
    ok('coop: boss 1 on every page, soap needed 14 (8 x 1.8), HP 3', !!inBoss && F.every((f) => V(f).boss.soapMax === 14 && V(f).boss.hp === 3), F.map((f) => V(f).boss));
    g1.D.setPlayer(40, 200, 1); g2.D.setPlayer(150, 200, 2); host.D.setPlayer(200, 40, 0);
    await sleep(800);
    const h1 = await bossHit(host, g1, g2);
    ok('coop: 개굴\'s bubble seals the boss, 냥이 bursts the giant bubble: HP 3 -> 2, +2000 to 냥이', h1.sealed && h1.burst && h1.hp === 2 && h1.gain >= 2000, h1);
    ok('coop: guests see the boss HP 2', !!(await until(() => [g1, g2].every((f) => V(f).boss && V(f).boss.hp === 2), 2500)));
    g1.D.setPlayer(150, 200, 1); g2.D.setPlayer(40, 200, 2);
    await sleep(400);
    const h2 = await bossHit(host, g2, g1);
    ok('coop: 냥이 seals, 개굴 bursts: HP 2 -> 1, +2000 to 개굴', h2.sealed && h2.burst && h2.hp === 1 && h2.gain >= 2000, h2);
    await until(() => host.G.boss.state === 'fight', 8000);
    host.D.damageBoss();
    const r7 = await until(() => F.every((f) => S(f).round === 6 && S(f).phase === 'playing'), 30000);
    ok('coop: boss 1 defeated -> everyone on to round 7 (index 6)', !!r7, F.map((f) => [S(f).round, S(f).phase]));

    // ---- team game over -> the result card: each player's score, kills, revives and the MVP crown
    await sleep(2200);
    host.G.lives = 0;
    host.D.setInvincible(false);
    for (const s of [0, 1, 2]) host.D.hitPlayer(s);
    await until(() => host.G.players.every((p) => p.ghost), 4000);
    for (const p of host.G.players) if (p.ghost) p.ghost.t = 470;
    const over = await until(() => F.every((f) => S(f).phase === 'gameover'), 8000);
    ok('coop: team lives 0 and nobody up -> game over on every page', !!over, F.map((f) => S(f).phase));
    await sleep(600);
    const pk = (f) => J(S(f).players.map((p) => [p.score, p.kills, p.revives]));
    ok('coop: final scores / kills / revives agree on every page', F.every((f) => pk(f) === pk(host)), F.map(pk));
    const rows = (f) => Array.from(f.w.document.querySelectorAll('#pg-over-team .pg-team-row'));
    const best = S(host).players.slice().sort((a, b) => b.score - a.score)[0];
    ok('coop: result card on every page: a row per player with 때 / 구조, one MVP crown on the top scorer', F.every((f) => rows(f).length === 3 && rows(f).filter((r) => r.querySelector('.pg-mvp')).length === 1 &&
      rows(f).find((r) => r.querySelector('.pg-mvp')).textContent.indexOf(best.nick) >= 0 && rows(f).every((r) => /때 \d+ · 구조 \d+/.test(r.textContent))), rows(g1).map((r) => r.textContent));
    ok('coop: guests wait for the host (다시 하기 hidden), the host has 다시 하기 + 방으로', F.slice(1).every((f) => !shown($(f, 'pg-retry')) && shown(f.w.document.querySelector('#pg-over [data-net-wait]'))) &&
      shown($(host, 'pg-retry')) && text(host, 'pg-over-home') === '방으로');
    click(host, 'pg-over-home');
    const inRoom = await until(() => F.every((f) => N(f).screen === 'room' && N(f).overlay === 'room' && !S(f).online), 6000);
    ok('coop: 방으로 brings everyone back to the room; guests must get ready again', !!inRoom && !N(g1).ready && $(host, 'pg-go').disabled, F.map((f) => [N(f).screen, N(f).overlay]));
    metric('coop.snapshot', N(host).snap);
    ok('coop: snapshots stayed < 3.6 KB and none was refused', N(host).snap.max > 0 && N(host).snap.max < 3600 && N(host).snap.refused === 0, N(host).snap);
    ok('coop: sounds on a guest from the host\'s events (ghost, revive, kill) and its own (join)', ['ghost', 'revive', 'kill', 'join'].every((n) => g1.sfx.includes(n)), Array.from(new Set(g1.sfx)));
    ok('coop: no page errors', noErrors(F), errorsOf(F));
    await dropAll();
  }

  // ================================================================ phase: 4-player battle, once per arena
  // roles: A (F[1]) traps B (F[2]); B mashes out; A traps B again and C (F[3]) pops it: 뽀득 KO; an enemy stuns A;
  // a power-up drops; at 1:30 the boss drops in and C bursts it (+1500); time up -> the podium everywhere.
  const BATTLE_CAST = [
    { chars: ['duck', 'cat', 'frog', 'penguin'], nicks: ['방장', '냥이', '개굴', '펭이'] },
    { chars: ['capy', 'otter', 'duck', 'frog'], nicks: ['까삐짱', '해롱', '꽥꽥', '개굴'] },
    { chars: ['penguin', 'frog', 'frog', 'otter'], nicks: ['펭귄', '개구리1', '개구리2', '수달'] },
    { chars: ['otter', 'duck', 'cat', 'capy'], nicks: ['해달', '오리', '고양이', '카피'] },
  ];
  async function battle(ai, opts) {
    opts = opts || {};
    const cast = BATTLE_CAST[ai % BATTLE_CAST.length];
    const tag = 'battle[' + ai + ']: ';
    const { F, host, code } = await uiRoom(4, { mode: 'battle', arena: ai, time: 2, perks: true, intrusion: true }, cast.chars, cast.nicks);
    if (!ok(tag + 'a room of 4 through the UI', !!code && F.every((f) => N(f).roster.length === 4), F.map((f) => N(f).roster.length))) return dropAll();
    const arenaName = host.D.arenas()[ai].name;
    ok(tag + 'guests read the host\'s settings (' + arenaName + ' · 2분 · 능력 있음 · 보스 난입)', F.slice(1).every((f) => N(f).mode === 'battle' && N(f).opts.arena === ai && N(f).opts.time === 2 &&
      text(f, 'pg-room-sum').indexOf(arenaName) >= 0 && text(f, 'pg-room-sum').indexOf('2분') >= 0 && !shown(f.w.document.querySelector('#pg-room-opts select'))), F.slice(1).map((f) => text(f, 'pg-room-sum')));
    const st = await uiStart(F);
    if (!ok(tag + 'countdown -> all 4 playing in the arena', st.started && F.every((f) => S(f).mode === 'battle' && S(f).arena === ai), F.map((f) => [S(f).mode, S(f).arena, S(f).phase]))) return dropAll();
    ok(tag + 'the 3-2-1 on every page', st.cd.every((c) => c.phases.includes('countdown') && c.banners.includes('1') && c.go), st.cd);
    ok(tag + 'the match clock runs on every page (~2:00)', F.every((f) => S(f).timeLeft > 105 && S(f).timeLeft <= 120), F.map((f) => S(f).timeLeft));
    ok(tag + 'every page has the same 4 animals in the same slots', F.every((f) => S(f).players.map((p) => p.slot + p.char).join() === cast.chars.map((c, k) => k + c).join()), F.map((f) => S(f).players.map((p) => p.char)));
    host.mp.trace(true);
    // a shortened match: 1:40 left
    host.D.setTimeLeft(100);
    const [, A, B, C] = F;
    const sa = slotOf(A), sb = slotOf(B), sc = slotOf(C);
    const bt = host.G.battle;
    parkAll(host);
    bt.enemyT = 1e9; bt.powerT = 1e9;
    host.G.opts.intrusion = false;   // (held back until the scripted part reaches it, then 1:30 is set below)
    host.D.setPlayer(212, 200, 0); A.D.setPlayer(40, 200, sa); B.D.setPlayer(84, 200, sb); C.D.setPlayer(160, 200, sc);
    await sleep(2700); // (the start blink is over)
    for (const f of [A, B, C]) idle(f);
    // ---- A's bubble traps B (the host decides)
    await tap(A, 'right', 40); await sleep(250);
    const sfxB = B.sfx.length;
    await tap(A, 'shoot', 60);
    const t1 = await until(() => hp(host, sb).trap, 2500);
    ok(tag + 'A\'s capture bubble traps B (host decides, trapper = A)', !!t1 && hp(host, sb).trap.by === sa, hp(host, sb).trap && hp(host, sb).trap.by);
    const allSee = await until(() => F.every((f) => vp(f, sb).trapped) && F.every((f) => V(f).bubbles.some((b) => b.kind === 'player' && b.victim === sb && b.owner === sa)), 2500);
    ok(tag + 'every page shows B trapped in a bubble tinted with A\'s colour', !!allSee, F.map((f) => vp(f, sb).trapped));
    ok(tag + 'B stops moving itself while trapped; the trap sound plays on B', N(B).ctl === 'remote' && B.sfx.slice(sfxB).includes('trap_player'), [N(B).ctl, B.sfx.slice(sfxB)]);
    const y0 = hp(host, sb).y;
    await sleep(500);
    ok(tag + 'the trapped player floats up', hp(host, sb).trap && hp(host, sb).y < y0, [y0, hp(host, sb).y]);
    // ---- B mashes free
    const tm = clock();
    for (let k = 0; k < 18 && hp(host, sb).trap; k++) { await tap(B, k % 2 ? 'jump' : 'shoot', 40); await sleep(50); }
    const freed = await until(() => !hp(host, sb).trap, 3000);
    const escMs = clock() - tm;
    metric(tag + 'mash_escape_ms', Math.round(escMs));
    ok(tag + 'B mashes jump / shoot and escapes in < 2.6 s (about 4 s alone)', !!freed && escMs < 2600 && hp(host, sb).koT === 0, Math.round(escMs));
    ok(tag + 'B moves itself again after escaping', !!(await until(() => N(B).ctl === 'local', 2500)));
    // ---- KO: A traps B again, C touches the bubble
    await sleep(1300);
    A.D.setPlayer(40, 200, sa); B.D.setPlayer(84, 200, sb);
    await sleep(500);
    await tap(A, 'right', 40); await sleep(250); await tap(A, 'shoot', 60);
    const t2 = await until(() => hp(host, sb).trap, 2500);
    ok(tag + 'B trapped again', !!t2);
    const cs0 = hp(host, sc).score, sfxC = C.sfx.length;
    const ko = await touch(C, () => { const b = V(C).bubbles.find((q) => q.kind === 'player' && q.victim === sb); return b && { x: b.x, y: b.y + 1 }; }, () => hp(host, sb).koT > 0 || hp(host, sb).koed > 0, 4000);
    ok(tag + 'C touches B\'s bubble on its screen: 뽀득 KO, +500 for C', !!ko && hp(host, sc).score === cs0 + 500 && hp(host, sc).kos === 1 && hp(host, sb).koed === 1, { c: [cs0, hp(host, sc).score], kos: hp(host, sc).kos });
    const word = await until(() => F.every((f) => Array.from(f.w.document.querySelectorAll('#pg-words > *')).some((e) => e.textContent.indexOf('뽀득 KO!') >= 0)), 1500, 20);
    ok(tag + '"뽀득 KO!" pops up on every page, the KO sound on C', !!word && C.sfx.slice(sfxC).includes('ko'), C.sfx.slice(sfxC));
    ok(tag + 'B sees its own KO', !!(await until(() => vp(B, sb).ko, 2000)));
    const tk = clock();
    const respawned = await until(() => hp(host, sb).koT === 0 && !hp(host, sb).trap, 4000);
    const koSecs = (clock() - tk) / 1000;
    const sps = host.D.arenas()[ai].players.map((s) => [s.col * 8 - 4, (s.row + 1) * 8]);
    const bp = hp(host, sb);
    ok(tag + 'B respawns at an arena spawn after ~1.5 s, blinking (invulnerable)', !!respawned && koSecs < 2 && bp.invuln > 60 && sps.some((s) => Math.abs(s[0] - bp.x) < 2 && Math.abs(s[1] - bp.y) < 2),
      { koSecs: r1(koSecs), at: [bp.x, bp.y], invuln: bp.invuln, sps });
    ok(tag + 'B controls its animal again after the KO', !!(await until(() => N(B).ctl === 'local' && !vp(B, sb).ko, 3000)));
    // ---- A pops an enemy (100 x combo), then an enemy hit stuns A: -100
    await sleep(800);
    A.D.setPlayer(40, 200, sa); B.D.setPlayer(190, 200, sb); C.D.setPlayer(160, 200, sc);
    await sleep(400);
    const as0 = hp(host, sa).score;
    const killed = await shootAndPop(host, A, foe(host));
    ok(tag + 'A traps and pops an enemy: +100 (battle: 100 x combo)', killed && hp(host, sa).score === as0 + 100, [as0, hp(host, sa).score]);
    parkAll(host);
    await sleep(1300);
    const as1 = hp(host, sa).score;
    pose(foe(host), me(A).x, me(A).y, 1);
    const stun = await until(() => hp(host, sa).stunT > 0, 3000);
    ok(tag + 'an enemy touching A (its own screen) stuns A for 1 s and costs 100 (no lives in battle)', !!stun && hp(host, sa).score === Math.max(0, as1 - 100) && !hp(host, sa).dead, [as1, hp(host, sa).score]);
    parkAll(host);
    await sleep(1300);
    // ---- a power-up floats down (every ~20 s; forced now), one guest picks it up
    bt.powerT = 1;
    const pu = await until(() => host.G.pickup, 1500);
    ok(tag + 'a power-up spawns (and the next one is ~20 s away)', !!pu && bt.powerT > 1100 && bt.powerT <= 1200, bt.powerT);
    const puSeen = await until(() => F.every((f) => S(f).pickup === host.G.pickup.type), 2000);
    ok(tag + 'every page shows the same power-up', !!puSeen, F.map((f) => S(f).pickup));
    if (host.G.pickup) {
      const type = host.G.pickup.type, sfxP = B.sfx.length;
      const NAMES = { shampoo: '샴푸!', slippers: '고무 슬리퍼!', bathbomb: '입욕제!' };
      let bn = false;
      const got = await touch(B, () => { if (V(B).banner === NAMES[type]) bn = true; const k = B.G.pickup; return k && { x: k.x, y: k.y }; }, () => !host.G.pickup, 6000);
      await until(() => (bn = bn || V(B).banner === NAMES[type]), 1500, 20);
      // (shampoo / slippers stay on the one who touched them; the bath bomb is instant: every enemy soaks)
      const mine = type === 'bathbomb' ? true : !!(hp(host, sb).power && hp(host, sb).power.type === type) && F.every((f, k) => k === 2 || !hp(host, slotOf(f) || 0).power);
      ok(tag + 'B picks up the power-up (' + type + '): it is B\'s, its banner and sound on B\'s page', !!got && mine && bn && B.sfx.slice(sfxP).includes('powerup'), { power: hp(host, sb).power, bn, sfx: B.sfx.slice(sfxP) });
    }
    // ---- 1:30 left: 보스 난입! A weaker boss (half soap, 1 HP); C bursts its giant bubble (+1500)
    host.G.opts.intrusion = true;
    host.D.setTimeLeft(91);
    const boss = await until(() => host.G.boss, 3000);
    const def = host.G.boss;
    const seenB = new Set();
    const banner = await until(() => { F.forEach((f, k) => { if (V(f).banner === '보스 난입!') seenB.add(k); }); return seenB.size === F.length; }, 4000, 20);
    ok(tag + '보스 난입! at 1:30 left on every page', !!boss && !!banner, F.map((f) => V(f).banner));
    ok(tag + 'the intruder: 1 HP, half the soap of that boss, the same boss on every page', !!def && def.intruder && def.hp === 1 && def.soapMax === Math.max(2, Math.round(def.def.soap * 0.5)) &&
      !!(await until(() => F.every((f) => V(f).boss && V(f).boss.type === def.type), 2500)), def && { type: def.type, hp: def.hp, soapMax: def.soapMax });
    await until(() => def.state === 'fight', 6000);
    host.D.setPlayer(212, 200, 0); A.D.setPlayer(30, 200, sa); B.D.setPlayer(60, 200, sb);   // (only C goes for the giant bubble)
    await sleep(400);
    host.D.stunBoss();
    const cs1 = hp(host, sc).score;
    const giant = await until(() => V(C).boss && V(C).boss.giant, 2500);
    const burst = await touch(C, () => { const g = V(C).boss && V(C).boss.giant; return g && { x: Math.max(16, Math.min(224, g.x + 12)), y: g.y + 12 }; }, () => !host.G.boss || host.G.boss.state === 'defeat' || host.G.boss.hp < 1, 5000);
    ok(tag + 'C bursts the intruder\'s giant bubble: +1500 for C, the boss is gone', !!giant && !!burst && hp(host, sc).score === cs1 + 1500, { giant: !!giant, burst: !!burst, c: [cs1, hp(host, sc).score] });
    // ---- the grime family comes back (up to 6), the match runs on for a bit with everyone idle
    bt.enemyT = 1;
    for (const f of F) idle(f);
    await sleep(4000);
    const up = host.G.enemies.filter((e) => e.state !== 'dead' && !e.minion).length;
    ok(tag + 'enemies respawn from the arena spawns (at most 6 up)', up >= 1 && up <= 6, up);
    const samples = [];
    for (let i = 0; i < 4; i++) { for (const g of [A, B, C]) samples.push(syncSample(host, g)); await sleep(250); }
    ok(tag + 'guest views = host world (same enemy ids, < 4 px)', samples.filter((s) => s && s.sameE && s.maxD < 4).length >= samples.length - 2, samples);
    // ---- time up -> the podium, the same on every page
    host.D.setTimeLeft(3);
    const sfx0 = F.map((f) => f.sfx.length);
    const pod = await until(() => F.every((f) => S(f).phase === 'podium'), 8000);
    ok(tag + 'time up -> podium on every page', !!pod, F.map((f) => S(f).phase));
    await sleep(900);
    const ref = S(host);
    const order = ref.players.slice().sort((a, b) => b.score - a.score || b.kos - a.kos || a.koed - b.koed || a.slot - b.slot).map((p) => p.slot);
    ok(tag + 'the podium order = the score order, and the same on all 4 pages', J(ref.podium) === J(order) && F.every((f) => J(S(f).podium) === J(ref.podium)), { order, pods: F.map((f) => S(f).podium) });
    ok(tag + 'final scores / KOs agree on all 4 pages', F.every((f) => J(S(f).players.map((p) => [p.slot, p.score, p.kos])) === J(ref.players.map((p) => [p.slot, p.score, p.kos]))), F.map((f) => S(f).players.map((p) => p.score)));
    ok(tag + 'podium card + results text on every page; podium music + win sound', F.every((f, k) => shown($(f, 'pg-podium')) && /^1위 /.test(text(f, 'pg-podium-sum')) && f.G.music === 'podium' && f.sfx.slice(sfx0[k]).includes('win')),
      F.map((f) => [text(f, 'pg-podium-sum').slice(0, 40), f.G.music]));
    ok(tag + 'host: 한 판 더 / 방으로 / 로비로; guests: 로비로 and "방장이 다음 판을 고르고 있어요"', shown($(host, 'pg-podium-again')) && shown($(host, 'pg-podium-room')) && shown($(host, 'pg-podium-lobby')) &&
      F.slice(1).every((f) => !shown($(f, 'pg-podium-again')) && shown($(f, 'pg-podium-lobby')) && shown(f.w.document.querySelector('#pg-podium [data-net-wait]'))));
    metric(tag + 'final', ref.players.map((p) => [p.nick, p.char, p.score, p.kos]));
    if (opts.rematch) {
      // 한 판 더: same room, a fresh match for everyone; then a guest goes 로비로
      const gid = N(A).gid;
      click(host, 'pg-podium-again');
      const again = await until(() => F.every((f) => (S(f).phase === 'playing' || S(f).phase === 'countdown') && N(f).gid > gid), 8000);
      ok(tag + '한 판 더 -> everyone in a new match, scores back to 0', !!again && F.every((f) => S(f).players.every((p) => p.score === 0)), F.map((f) => [S(f).phase, N(f).gid]));
      await until(() => F.every((f) => S(f).phase === 'playing'), 6000);
      host.D.setTimeLeft(2);
      await until(() => F.every((f) => S(f).phase === 'podium'), 8000);
      click(C, 'pg-podium-lobby');
      const lob = await until(() => N(C).screen === 'friends' && !S(C).online && N(host).roster.length === 3, 8000);
      ok(tag + '로비로 on a guest: back to 친구와 하기, the room keeps the other 3', !!lob, [N(C).screen, N(host).roster.length]);
    }
    metric(tag + 'snapshot', N(host).snap);
    ok(tag + 'snapshots < 3.6 KB, none refused', N(host).snap.max < 3600 && N(host).snap.refused === 0, N(host).snap);
    ok(tag + 'no page errors', noErrors(F), errorsOf(F));
    await dropAll();
  }

  // ================================================================ phase: leaving (guests, hosts, full, late)
  async function leaves() {
    // ---- co-op: a guest leaves from the in-game menu, another guest's tab just closes; the team keeps its lives
    {
      const { F, host, code } = await uiRoom(3, { mode: 'coop' }, ['duck', 'penguin', 'otter'], ['방장', '펭', '달']);
      const st = await uiStart(F);
      if (!ok('leave: co-op of 3 playing', st.started)) return dropAll();
      const [, g1, g2] = F;
      await sleep(2500);
      // a guest's pause: only a local menu, the game keeps running (its own animal too)
      click(g2, 'pg-pausebtn');
      const menu = await until(() => shown($(g2, 'pg-pause')), 1500);
      const f0 = g2.G.frame, h0 = host.G.frame, rt0 = N(g2).renderTick;
      await sleep(700);
      ok('leave: a guest\'s pause opens a local menu (메뉴, "게임은 계속 진행돼요!") while the game keeps running', !!menu && text(g2, 'pg-pause-h') === '메뉴' && /계속 진행돼요/.test(text(g2, 'pg-pause-sub')) &&
        g2.G.frame > f0 + 20 && host.G.frame > h0 + 20 && N(g2).renderTick > rt0 + 20, [text(g2, 'pg-pause-h'), g2.G.frame - f0, host.G.frame - h0]);
      ok('leave: the guest\'s menu offers 나가기 (not 방으로)', text(g2, 'pg-pause-home') === '나가기', text(g2, 'pg-pause-home'));
      const lives = host.G.lives;
      click(g2, 'pg-pause-home');
      const gone = await until(() => S(host).players.length === 2 && S(g1).players.length === 2, 12000);
      ok('leave: the guest who left is gone from the host and the other guest', !!gone, [S(host).players.length, S(g1).players.length]);
      ok('leave: ...the team keeps its lives and the round goes on', host.G.lives === lives && S(host).phase === 'playing' && S(g1).phase === 'playing', [lives, host.G.lives]);
      ok('leave: the leaver is on 친구와 하기, offline', N(g2).screen === 'friends' && N(g2).overlay === 'friends' && !S(g2).online, N(g2).screen);
      // a late joiner (the game is under way): refused from the room screen only
      const late = await uiJoin(g2, code, { char: 'otter', nick: '달' });
      ok('leave: rejoining mid-game is refused: "이미 게임이 시작됐어요"', !late.ok && text(g2, 'pg-friends-err') === '이미 게임이 시작됐어요', [late, text(g2, 'pg-friends-err')]);
      // the other guest's tab closes (no 나가기)
      drop(g1, true);
      const gone2 = await until(() => S(host).players.length === 1 && N(host).roster.length === 1, 12000);
      ok('leave: a guest whose tab closes is removed by the host', !!gone2, S(host).players.length);
      ok('leave: the host plays on', S(host).phase === 'playing' && S(host).online, S(host).phase);
      ok('leave: no page errors', noErrors(F), errorsOf(F));
      await dropAll();
    }
    // ---- the host's tab closes mid-game: every guest -> "방장이 나갔어요", back to 친구와 하기
    {
      const { F, host } = await uiRoom(3, { mode: 'coop' }, ['frog', 'cat', 'duck'], ['방장', '하나', '둘']);
      const st = await uiStart(F);
      ok('leave: co-op of 3 playing (host leaves next)', st.started);
      await sleep(1500);
      drop(host, true);
      const back = await until(() => F.slice(1).every((f) => N(f).screen === 'friends' && !S(f).online), 15000);
      ok('leave: host gone mid-game -> guests back on 친구와 하기 with "방장이 나갔어요"', !!back && F.slice(1).every((f) => text(f, 'pg-friends-err') === '방장이 나갔어요'), F.slice(1).map((f) => [N(f).screen, text(f, 'pg-friends-err')]));
      ok('leave: no page errors', noErrors(F), errorsOf(F));
      await dropAll();
    }
    // ---- the host's 나가기 in the room; a full room; a wrong code
    {
      const { F, host, code } = await uiRoom(4, { mode: 'battle' }, ['duck', 'cat', 'frog', 'otter'], ['방장', '가', '나', '다']);
      const fifth = await frame();
      const r = await uiJoin(fifth, code, { char: 'capy', nick: '다섯' });
      ok('leave: a 5th player is refused: "방이 꽉 찼어요"', !r.ok && text(fifth, 'pg-friends-err') === '방이 꽉 찼어요', [r, text(fifth, 'pg-friends-err')]);
      typeIn(fifth, 'pg-code', 'ZZ99'); click(fifth, 'pg-join');
      const nf = await until(() => text(fifth, 'pg-friends-err') === '방을 찾을 수 없어요', 8000);
      ok('leave: a wrong code: "방을 찾을 수 없어요"', !!nf, text(fifth, 'pg-friends-err'));
      typeIn(fifth, 'pg-code', 'ab'); click(fifth, 'pg-join');
      ok('leave: a short code: "방 코드 4자리를 확인해 주세요"', !!(await until(() => /4자리/.test(text(fifth, 'pg-friends-err')), 2000)), text(fifth, 'pg-friends-err'));
      // a guest leaves the room screen: the seat frees up on every page
      click(F[3], 'pg-room-leave');
      ok('leave: a guest\'s 나가기 in the room frees its seat on every page', !!(await until(() => [F[0], F[1], F[2]].every((f) => N(f).roster.length === 3), 10000)), [F[0], F[1], F[2]].map((f) => N(f).roster.length));
      click(host, 'pg-room-leave');
      const back = await until(() => [F[1], F[2]].every((f) => N(f).screen === 'friends' && text(f, 'pg-friends-err') === '방장이 나갔어요'), 12000);
      ok('leave: the host\'s 나가기 in the room -> guests told "방장이 나갔어요"', !!back, [F[1], F[2]].map((f) => [N(f).screen, text(f, 'pg-friends-err')]));
      ok('leave: no page errors', noErrors(F.concat([fifth])), errorsOf(F.concat([fifth])));
      await dropAll();
    }
    // ---- battle: guests leave until one player is left -> that match ends on the podium
    {
      const { F, host } = await uiRoom(3, { mode: 'battle', arena: 1, time: 2 }, ['otter', 'penguin', 'frog'], ['방장', '펭', '개']);
      const st = await uiStart(F);
      ok('leave: a battle of 3 playing', st.started);
      await sleep(1500);
      F[2].mp.leave();
      const two = await until(() => S(host).players.length === 2 && S(F[1]).players.length === 2, 12000);
      ok('leave: battle: a guest leaves -> 2 left, the match goes on', !!two && S(host).phase === 'playing', [S(host).players.length, S(host).phase]);
      drop(F[1], true);
      const pod = await until(() => S(host).phase === 'podium', 12000);
      ok('leave: battle: only one player left -> the match ends (podium)', !!pod, S(host).phase);
      ok('leave: no page errors', noErrors(F), errorsOf(F));
      await dropAll();
    }
  }

  // ================================================================ a FAKE artifact runtime: window.claude.use('room'|'user')
  // Written from the documented facts only: room.presence(patch) merges MY presence (latest wins per field, top-level
  // null removes a field, merged object <= 4 KiB JSON, plain JSON) and is sent coalesced (~30/s); room.peers() ->
  // [{peer, by, isMe, sameTab, kind, guest, presence, updatedAt}] (me included); room.onPeers(fn({peers, joined, left,
  // updated})) -> unsub; room.join(name ~ /^[a-z0-9][a-z0-9_.-]{0,47}$/) -> a NamedRoom with the same presence / peers /
  // onPeers / connected / onConnection plus leave(); connected(); onConnection(fn). emit is not for viewers (rejected,
  // and counted: the game must not use it). Each page gets its peers' presence objects as frozen copies made in its
  // own realm, per sender in order, after 50 + U(0,40) ms. Budget: presence calls per page per second are measured.
  function fakeRuntime() {
    const RT = { lat: 50, jit: 40, rooms: new Map(), viol: [], emits: 0, maxBytes: 0, maxDepth: 0, maxRate: 0, sends: 0, n: 0, pages: new Map() };
    const now = () => performance.now();
    const rerr = (code, m) => Object.assign(new Error(m || code), { code });
    function depthOf(v, d) {
      if (v === null || typeof v === 'string' || typeof v === 'boolean') return d;
      if (typeof v === 'number') return Number.isFinite(v) ? d : -1;
      if (Array.isArray(v)) { let m = d; for (const x of v) { const r = depthOf(x, d + 1); if (r < 0) return -1; m = Math.max(m, r); } return m; }
      if (typeof v === 'object' && Object.prototype.toString.call(v) === '[object Object]') {
        const pr = Object.getPrototypeOf(v);
        if (pr !== null && Object.getPrototypeOf(pr) !== null) return -1;
        let m = d; for (const k of Object.keys(v)) { const r = depthOf(v[k], d + 1); if (r < 0) return -1; m = Math.max(m, r); } return m;
      }
      return -1;
    }
    const members = (name) => { let s = RT.rooms.get(name); if (!s) { s = new Set(); RT.rooms.set(name, s); } return s; };
    function deepFreeze(w, o) { if (o && typeof o === 'object') { for (const k of Object.keys(o)) deepFreeze(w, o[k]); w.Object.freeze(o); } return o; }
    function handle(page, name) {
      const h = { page, name, live: true, mine: {}, mineObj: null, at: Date.now(), others: new Map(), pL: [], cL: [], pend: new Map(), pendT: null,
        sendT: null, lastSend: -1e9, ver: 0, upAt: now() + RT.lat, pair: new Map(), arr: null };
      const W = () => page.w;
      const copy = (json) => deepFreeze(W(), W().JSON.parse(json));
      h.myPresence = () => { if (!h.mineObj) h.mineObj = copy(JSON.stringify(h.mine)); return h.mineObj; };
      h.selfRow = () => ({ peer: page.label, by: page.user, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: h.myPresence(), updatedAt: h.at });
      h.peers = () => {
        if (!h.live || now() < h.upAt) return W().Object.freeze(W().Array.of());
        if (!h.arr) h.arr = W().Object.freeze(W().Array.of(W().Object.freeze(h.selfRow()), ...Array.from(h.others.values()).map((o) => o.row)));
        return h.arr;
      };
      h.connected = () => h.live && now() >= h.upAt;
      h.queue = (kind, row) => {
        const cur = h.pend.get(row.peer);
        if (cur && cur.kind === 'joined' && kind === 'left') h.pend.delete(row.peer);
        else h.pend.set(row.peer, { kind: cur && cur.kind === 'joined' ? 'joined' : kind, row });
        if (h.pendT === null) h.pendT = setTimeout(h.flush, 16);
      };
      h.flush = () => {
        h.pendT = null;
        if (!h.live || !h.pend.size) return;
        const j = [], l = [], u = [];
        for (const { kind, row } of h.pend.values()) (kind === 'joined' ? j : kind === 'left' ? l : u).push(row);
        h.pend.clear();
        const ev = W().Object.freeze({ peers: h.peers(), joined: W().Object.freeze(W().Array.of(...j)), left: W().Object.freeze(W().Array.of(...l)), updated: W().Object.freeze(W().Array.of(...u)) });
        for (const x of h.pL.slice()) if (x.live && x.started) { try { x.fn(ev); } catch (e) { log('FV3 INFO onPeers listener threw: ' + e.message); } }
      };
      // receive a sender's presence (in order per sender; never older than what I have)
      h.recv = (from, json, ver, at) => {
        if (!h.live) return;
        const old = h.others.get(from.page.label);
        if (old && old.ver >= ver) return;
        const row = W().Object.freeze({ peer: from.page.label, by: from.page.user, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: copy(json), updatedAt: at });
        h.others.set(from.page.label, { ver, row }); h.arr = null;
        h.queue(old ? 'updated' : 'joined', row);
      };
      h.drop = (label) => { const old = h.others.get(label); if (!old || !h.live) return; h.others.delete(label); h.arr = null; h.queue('left', old.row); };
      h.to = (o, fn) => {
        let q = h.pair.get(o);
        if (!q) { q = { last: 0, list: [], t: null }; h.pair.set(o, q); }
        const at = Math.max(now() + RT.lat + Math.random() * RT.jit, q.last);
        q.last = at; q.list.push({ at, fn });
        const pump = () => { q.t = null; const t = now(); while (q.list.length && q.list[0].at <= t + 0.5) q.list.shift().fn(); if (q.list.length) q.t = setTimeout(pump, Math.max(0, q.list[0].at - now())); };
        if (q.t === null) q.t = setTimeout(pump, Math.max(0, at - now()));
      };
      h.send = () => {
        h.sendT = null;
        if (!h.live) return;
        h.lastSend = now(); RT.sends++;
        const json = JSON.stringify(h.mine), ver = ++h.ver, at = h.at;
        for (const o of members(name)) if (o !== h && o.live) h.to(o, () => o.recv(h, json, ver, at));
      };
      h.presence = (patch) => {
        const t = now();
        page.calls.push(t); while (page.calls.length && page.calls[0] <= t - 1000) page.calls.shift();
        RT.maxRate = Math.max(RT.maxRate, page.calls.length);
        if (!h.live) return W().Promise.reject(rerr('invalid_argument', 'left'));
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) { RT.viol.push(page.label + ': patch is not an object'); return W().Promise.reject(rerr('invalid_argument')); }
        const merged = Object.assign({}, h.mine);
        for (const k of Object.keys(patch)) { if (patch[k] === null) delete merged[k]; else merged[k] = patch[k]; }
        const d = depthOf(merged, 1);
        if (d < 0) { RT.viol.push(page.label + ': presence is not plain JSON'); return W().Promise.reject(rerr('invalid_argument', 'not plain JSON')); }
        const bytes = new TextEncoder().encode(JSON.stringify(merged)).length;
        RT.maxBytes = Math.max(RT.maxBytes, bytes); RT.maxDepth = Math.max(RT.maxDepth, d);
        if (bytes > 4096) { RT.viol.push(page.label + ': presence ' + bytes + ' bytes'); return W().Promise.reject(rerr('invalid_argument', 'presence too large')); }
        h.mine = JSON.parse(JSON.stringify(merged)); h.mineObj = null; h.arr = null; h.at = Date.now();
        if (h.sendT === null) h.sendT = setTimeout(h.send, Math.max(0, h.lastSend + 33 - now()));
        return W().Promise.resolve();
      };
      h.onPeers = (fn) => {
        const x = { fn, live: true, started: false }; h.pL.push(x);
        setTimeout(() => {
          if (!x.live || !h.live) return;
          x.started = true;
          const ps = h.peers();
          fn(W().Object.freeze({ peers: ps, joined: ps, left: W().Object.freeze(W().Array.of()), updated: W().Object.freeze(W().Array.of()) }));
        }, Math.max(0, h.upAt - now()) + 2);
        return () => { x.live = false; };
      };
      h.onConnection = (fn) => {
        const x = { fn, live: true }; h.cL.push(x);
        setTimeout(() => { if (x.live && h.live) fn(true); }, Math.max(0, h.upAt - now()) + 1);
        return () => { x.live = false; };
      };
      h.leave = () => {
        if (!h.live) return W().Promise.resolve();
        h.live = false; members(name).delete(h); page.handles.delete(name);
        for (const o of members(name)) if (o.live) h.to(o, () => o.drop(page.label));
        return W().Promise.resolve();
      };
      members(name).add(h);
      for (const o of members(name)) if (o !== h && o.live) { o.to(h, () => h.recv(o, JSON.stringify(o.mine), o.ver, o.at)); }
      const ns = { presence: h.presence, peers: h.peers, onPeers: h.onPeers, connected: h.connected, onConnection: h.onConnection,
        emit: () => { RT.emits++; return W().Promise.reject(rerr('not_permitted', 'event topics are for editors')); }, on: () => () => {} };
      if (name === '') {
        ns.join = (n) => {
          if (typeof n !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(n)) { RT.viol.push(page.label + ': bad room name ' + n); return W().Promise.reject(rerr('invalid_argument', 'room name')); }
          const ex = page.handles.get(n);
          if (ex && ex.live) return W().Promise.resolve(ex.ns);
          const nh = handle(page, n); page.handles.set(n, nh);
          return new (W().Promise)((res) => setTimeout(() => res(nh.ns), RT.lat));
        };
      } else { ns.name = name; ns.leave = h.leave; }
      h.ns = W().Object.freeze(ns);
      return h;
    }
    RT.claudeFor = (w, cfg) => {
      const page = { label: 'p' + (++RT.n) + Math.random().toString(36).slice(2, 7), user: 'u' + RT.n, name: cfg.name, w, handles: new Map(), calls: [], nullRoom: !!cfg.nullRoom };
      RT.pages.set(cfg.id, page);
      page.gone = () => { for (const h of Array.from(page.handles.values())) h.leave(); if (page.lobby) page.lobby.leave(); };
      const user = w.Object.freeze({ me: () => w.Promise.resolve(w.Object.freeze({ id: page.user, name: cfg.name, avatarUrl: null })) });
      return w.Object.freeze({
        use: (n) => new w.Promise((res) => setTimeout(() => {
          if (n === 'room') { if (page.nullRoom) return res(null); if (!page.lobby) page.lobby = handle(page, ''); return res(page.lobby.ns); }
          res(n === 'user' ? user : null);
        }, 5)),
      });
    };
    return RT;
  }
  let previewHtml = null;
  async function roomFrame(RT, cfg) {
    if (!previewHtml) previewHtml = await (await fetch('preview.html', { cache: 'no-store' })).text();
    const i = frameN++;
    cfg = Object.assign({ id: 'f' + i }, cfg);
    const boot = SC + 'window.claude=parent.__FV3.claudeFor(window,' + JSON.stringify(cfg) + ');' + SE;
    const html = previewHtml.replace('<head>', () => '<head>' + boot);
    const f = frameEl(i, (el) => { el.srcdoc = html; });
    const fr = await loadFrame(f, i);
    fr.page = RT.pages.get(cfg.id);
    return fr;
  }

  // ================================================================ phase: the artifact path (room transport, lobby list)
  async function roomPhase() {
    const RT = fakeRuntime();
    window.__FV3 = { claudeFor: RT.claudeFor };
    const clearNick = () => { try { localStorage.removeItem('ppogeul-nick'); } catch (e) { /* ignore */ } };
    clearNick();
    const A = await roomFrame(RT, { name: 'Alice' });
    ok('room: the page sees window.claude before it boots (no ?net: transports via the runtime)', typeof A.w.claude.use === 'function' && !A.w.location.search);
    await titlePick(A, 'penguin');
    click(A, 'pg-friends-btn');
    const tr = await until(() => N(A).transport === 'room' && shown($(A, 'pg-games-box')), 6000);
    ok('room: transport = room, the open-games list is shown ("아직 열린 방이 없어요")', !!tr && shown($(A, 'pg-games-empty')), N(A).transport);
    ok('room: the panel note explains the room ("열린 방")', /열린 방/.test(text(A, 'pg-net-note')), text(A, 'pg-net-note'));
    ok('room: the nickname defaults to the signed-in profile name', !!(await until(() => $(A, 'pg-nick').value === 'Alice', 3000)), $(A, 'pg-nick').value);
    click(A, '#pg-friends [data-modes] [data-mode="coop"]');
    click(A, 'pg-host');
    const code = await until(() => N(A).screen === 'room' && N(A).code, 10000);
    ok('room: 방 만들기 over room presence -> a room code', /^[a-z0-9]{4}$/.test(code || ''), code);
    ok('room: the room hint says friends find it under 열린 방', /열린 방/.test(text(A, 'pg-room-hint')), text(A, 'pg-room-hint'));
    const joinFromList = async (name, n) => {
      clearNick();
      const fr = await roomFrame(RT, { name });
      click(fr, 'pg-friends-btn');
      const listed = await until(() => fr.w.document.querySelectorAll('#pg-games .pg-game').length === 1, 8000);
      const btn = fr.w.document.querySelector('#pg-games .pg-game');
      ok('room: ' + name + ' sees "Alice님의 방 · 같이 하기 · ' + n + '/4" in its lobby list', !!listed && /Alice님의 방/.test(btn.textContent) && btn.textContent.indexOf('같이 하기 · ' + n + '/4') >= 0, btn && btn.textContent);
      ok('room: ' + name + '\'s nickname comes from its profile', $(fr, 'pg-nick').value === name, $(fr, 'pg-nick').value);
      if (btn) click(fr, btn);
      await until(() => N(fr).screen === 'room' && N(fr).roster.length === n + 1, 10000);
      return fr;
    };
    const B = await joinFromList('Bob', 1);
    const C = await joinFromList('Cleo', 2);
    const F = [A, B, C];
    ok('room: tapping the listed game joins it: 3 in the room on every page', F.every((f) => N(f).roster.length === 3 && N(f).transport === 'room'), F.map((f) => N(f).roster.map((r) => r.nick)));
    clearNick();
    const D = await roomFrame(RT, { name: 'Dan' });
    click(D, 'pg-friends-btn');
    const dl = await until(() => { const b = D.w.document.querySelector('#pg-games .pg-game'); return b && b.textContent.indexOf('3/4') >= 0; }, 8000);
    ok('room: an onlooker\'s list follows the count (3/4)', !!dl, D.w.document.querySelector('#pg-games') && D.w.document.querySelector('#pg-games').textContent);
    const st = await uiStart(F);
    ok('room: 준비 / 시작 / 3-2-1 -> playing over room presence', st.started && F.every((f) => S(f).online && N(f).transport === 'room'), F.map((f) => [S(f).phase, N(f).transport]));
    if (!st.started) { await dropAll(); return; }
    A.mp.trace(true);
    const gone = await until(() => D.w.document.querySelectorAll('#pg-games .pg-game').length === 0 && shown($(D, 'pg-games-empty')), 8000);
    ok('room: a game under way is no longer listed as open', !!gone);
    // gameplay over the room: Bob traps and pops an enemy, the views agree
    await sleep(2500);
    A.D.setInvincible(true);
    A.D.setPlayer(200, 72, 0);
    parkAll(A);
    B.D.setPlayer(36, 200, slotOf(B)); C.D.setPlayer(56, 136, slotOf(C));
    await sleep(900);
    const k = await shootAndPop(A, B, A.G.enemies[0]);
    ok('room: a guest\'s shot traps an enemy on the host and its touch pops it (over presence)', k, A.G.players.map((p) => p.kills));
    const samples = [];
    for (let i = 0; i < 5; i++) { for (const g of [B, C]) samples.push(syncSample(A, g)); await sleep(300); }
    ok('room: guest views = host world at the same tick (< 4 px)', samples.filter((s) => s && s.sameE && s.maxD < 4).length >= samples.length - 2, samples);
    ok('room: scores agree on every page', !!(await scoresAgree(A, F, 3000)), F.map(scoreLine));
    // a ghost revive over the room
    pose(foe(A), me(C).x, me(C).y, 1);
    const gh = await until(() => hp(A, slotOf(C)).ghost, 4000);
    parkAll(A);
    const rv = gh && await touch(B, () => { const q = vp(B, slotOf(C)); return q && q.ghost && { x: q.x, y: q.y + 2 }; }, () => !hp(A, slotOf(C)).ghost && !hp(A, slotOf(C)).dead, 5000);
    ok('room: a ghost revive across pages over the room', !!gh && !!rv && hp(A, slotOf(B)).revives === 1, { gh: !!gh, rv: !!rv });
    // a crowded bath: the host's snapshot grows (it trims itself), presence still fits its 4 KiB
    for (let i = 0; i < 34; i++) A.D.spawnBubble(i % 6 ? 'empty' : 'stamp', 20 + (i * 37) % 200, 30 + (i * 23) % 150);
    await sleep(1500);
    const crowd = await until(() => [B, C].every((f) => V(f).bubbles.filter((b) => !b.pred).length >= 15), 4000);
    metric('room.crowded', { hostBubbles: A.G.bubbles.length, guest: V(B).bubbles.length, snap: N(A).snap, presenceMax: RT.maxBytes });
    ok('room: a crowded bath (34+ bubbles) still reaches the guests over presence, presence <= 4 KiB', !!crowd && RT.maxBytes <= 4096 && !RT.viol.length && N(A).snap.refused === 0, { bytes: RT.maxBytes, viol: RT.viol.slice(0, 3), snap: N(A).snap });
    const stats = B.mp.session().stats();
    metric('room.stats', stats);
    ok('room: session stats: connected, rtt measured', stats.connected && (stats.rttMs === null || (stats.rttMs > 0 && stats.rttMs < 2000)), stats);
    // the host's menu: 방으로 needs a second tap while friends are in, then everyone is in the room
    click(A, 'pg-pausebtn');
    await until(() => shown($(A, 'pg-pause')), 1500);
    const hf0 = A.G.frame, rt0 = N(B).renderTick;
    await sleep(600);
    ok('room: the host\'s menu says 방으로 and the world keeps running behind it (host frames + guest views advance)', text(A, 'pg-pause-home') === '방으로' && S(A).online &&
      A.G.frame > hf0 + 20 && N(B).renderTick > rt0 + 20 && S(B).phase === 'playing', [text(A, 'pg-pause-home'), A.G.frame - hf0, N(B).renderTick - rt0, S(B).phase]);
    click(A, 'pg-pause-home');
    await sleep(200);
    const armed = text(A, 'pg-pause-home');
    click(A, 'pg-pause-home');
    const inRoom = await until(() => F.every((f) => N(f).screen === 'room'), 8000);
    ok('room: first tap arms ("한 번 더 누르면 모두 방으로"), second tap brings everyone to the room', /한 번 더/.test(armed) && !!inRoom, [armed, F.map((f) => N(f).screen)]);
    ok('room: back in the room, the game is listed as open again (3/4)', !!(await until(() => { const b = D.w.document.querySelector('#pg-games .pg-game'); return b && b.textContent.indexOf('3/4') >= 0; }, 8000)));
    // the host leaves: guests are told, the ad disappears
    click(A, 'pg-room-leave');
    const told = await until(() => [B, C].every((f) => N(f).screen === 'friends' && text(f, 'pg-friends-err') === '방장이 나갔어요'), 15000);
    ok('room: the host\'s 나가기 -> guests back on 친구와 하기 with "방장이 나갔어요"', !!told, [B, C].map((f) => [N(f).screen, text(f, 'pg-friends-err')]));
    ok('room: ...and the game leaves the lobby list', !!(await until(() => D.w.document.querySelectorAll('#pg-games .pg-game').length === 0, 8000)));
    // no room capability (signed out / not invited): the friendly Korean explanation, solo still works
    clearNick();
    const E = await roomFrame(RT, { name: 'Eve', nullRoom: true });
    click(E, 'pg-friends-btn');
    const note = await until(() => /온라인은 Claude에 로그인하고 이 게임에 초대받은 친구끼리만 할 수 있어요/.test(text(E, 'pg-net-note')), 6000);
    ok('room: no room runtime -> "온라인은 Claude에 로그인하고 이 게임에 초대받은 친구끼리만 할 수 있어요"', !!note && !shown($(E, 'pg-games-box')), text(E, 'pg-net-note'));
    click(E, 'pg-friends-back');
    await until(() => N(E).overlay === 'title', 2000);
    click(E, 'pg-start');
    ok('room: ...and 혼자 하기 still plays', !!(await until(() => S(E).phase === 'playing' && S(E).mode === 'solo', 5000)), S(E).phase);
    metric('room.platform', { maxPresenceBytes: RT.maxBytes, maxDepth: RT.maxDepth, maxCallsPerSec: RT.maxRate, sends: RT.sends, emits: RT.emits, violations: RT.viol.slice(0, 5) });
    ok('room: presence always plain JSON <= 4 KiB, valid room names, no event topics (emit) used', !RT.viol.length && RT.emits === 0 && RT.maxBytes <= 4096, { viol: RT.viol.slice(0, 5), emits: RT.emits, bytes: RT.maxBytes });
    ok('room: presence writes stay inside the ~40 msgs/s per page budget', RT.maxRate <= 40, RT.maxRate);
    ok('room: no page errors', noErrors([A, B, C, D, E]), errorsOf([A, B, C, D, E]));
    await dropAll();
  }

  // ================================================================ phase: 4-client random-input soak
  async function soak() {
    const { F, host } = await uiRoom(4, { mode: 'coop' }, ['duck', 'capy', 'otter', 'penguin'], ['소크1', '소크2', '소크3', '소크4']);
    let st = await uiStart(F);
    if (!ok('soak: 4 playing co-op', st.started)) return dropAll();
    host.mp.trace(true);
    let stop = false, nanHits = [], frozen = 0, sampleN = 0, bad = [];
    const acts = ['left', 'right', 'jump', 'shoot'];
    const drive = async (f) => {
      while (!stop) {
        const a = acts[(Math.random() * 4) | 0];
        press(f, a, Math.random() < 0.55);
        if (Math.random() < 0.1) idle(f);
        await sleep(60 + Math.random() * 220);
      }
      idle(f);
    };
    const watch = async () => {
      const last = F.map((f) => f.G.frame);
      while (!stop) {
        await sleep(1000);
        F.forEach((f, k) => {
          const s = S(f), v = V(f);
          const n = nanScan(s, 'state', [], 0).concat(nanScan(v, 'view', [], 0));
          if (n.length && nanHits.length < 8) nanHits.push([k, n.slice(0, 3)]);
          if (f.G.frame <= last[k]) frozen++;
          last[k] = f.G.frame;
        });
        for (const g of F.slice(1)) { const s = syncSample(host, g); if (s) { sampleN++; if (!(s.sameE && s.maxD < 6) && S(g).phase === 'playing' && S(host).phase === 'playing') bad.push(s); } }
        // a lost co-op: the host starts again (다시 하기)
        if (S(host).phase === 'gameover') click(host, 'pg-retry');
      }
    };
    const runFor = async (secs, extra) => {
      stop = false;
      const ps = F.map(drive).concat([watch()]);
      const t0 = clock();
      let step = 0;
      while (clock() - t0 < secs * 1000) { await sleep(1000); step++; if (extra) await extra(step); }
      stop = true;
      await Promise.all(ps);
    };
    await runFor(SOAK, async (s) => {
      if (s % 12 === 0 && S(host).phase === 'playing') host.D.killAll();
      if (s === Math.round(SOAK / 2)) { host.D.gotoRound(10); }
      if (s === Math.round(SOAK / 2) + 3) for (let i = 0; i < 34; i++) host.D.spawnBubble(i % 5 ? 'empty' : 'stamp', 20 + (i * 37) % 200, 30 + (i * 23) % 150);
    });
    metric('soak.coop', { snap: N(host).snap, samples: sampleN, bad: bad.length, round: S(host).round });
    ok('soak: co-op - no NaN anywhere, every page kept running', !nanHits.length && !frozen, { nanHits, frozen });
    ok('soak: co-op - snapshots always < 3.6 KB (trimmed when crowded), none refused', N(host).snap.max < 3600 && N(host).snap.refused === 0, N(host).snap);
    ok('soak: co-op - guest views matched the host world (>= 90 % of samples)', sampleN > 0 && bad.length <= sampleN * 0.1, { sampleN, bad: bad.slice(0, 4) });
    // the most crowded world we can make: the final boss, every bubble, a pile of snacks, scalding drops, 4 players
    host.D.gotoRound(23);
    await until(() => host.G.boss && host.G.boss.state === 'fight', 10000);
    const trims0 = N(host).snap.trims;
    for (let i = 0; i < 40; i++) host.D.spawnBubble(i % 7 ? 'empty' : 'stamp', 20 + (i * 37) % 200, 30 + (i * 23) % 150);
    for (let i = 0; i < 30; i++) host.G.items.push({ id: ++host.G.seq, type: 'watermelon', value: 2000, x: 20 + (i * 29) % 200, y: 40 + (i * 17) % 150, vx: 0, vy: 0, onGround: false, floating: true, age: 0 });
    for (let i = 0; i < 12; i++) host.D.spawnDrop(2 + (i * 5) % 28);
    let maxB = 0;
    await until(() => { maxB = Math.max(maxB, N(host).snap.bytes); return false; }, 2500, 30);
    const crowdedView = V(F[1]);
    metric('soak.crowded', { snap: N(host).snap, trimsNow: N(host).snap.trims - trims0, maxBytesSeen: maxB, guestBubbles: crowdedView.bubbles.length, guestItems: crowdedView.items.length, hostBubbles: host.G.bubbles.length, hostItems: host.G.items.length });
    ok('soak: crowded final-boss world: snapshots still < 3.6 KB (trimmed), none refused, the guests keep up', N(host).snap.max < 3600 && N(host).snap.refused === 0 && crowdedView.bubbles.length > 0 && noErrors(F), N(host).snap);
    // back to the room (host menu, two taps) and on to a battle
    click(host, 'pg-pausebtn'); await sleep(200);
    click(host, 'pg-pause-home'); await sleep(200); click(host, 'pg-pause-home');
    await until(() => F.every((f) => N(f).screen === 'room'), 8000);
    click(host, '#pg-room [data-modes] [data-mode="battle"]');
    await until(() => F.every((f) => N(f).mode === 'battle'), 4000);
    st = await uiStart(F);
    if (!ok('soak: same room switched to 배틀, 4 playing', st.started && F.every((f) => S(f).mode === 'battle'), F.map((f) => S(f).mode))) return dropAll();
    nanHits = []; frozen = 0; bad = []; sampleN = 0;
    await runFor(SOAK, async (s) => { if (s === Math.round(SOAK / 2)) host.D.setTimeLeft(92); });
    metric('soak.battle', { snap: N(host).snap, samples: sampleN, bad: bad.length, scores: S(host).players.map((p) => p.score) });
    ok('soak: battle - no NaN anywhere, every page kept running', !nanHits.length && !frozen, { nanHits, frozen });
    ok('soak: battle - snapshots < 3.6 KB, none refused', N(host).snap.max < 3600 && N(host).snap.refused === 0, N(host).snap);
    ok('soak: battle - guest views matched the host world (>= 90 %)', sampleN > 0 && bad.length <= sampleN * 0.1, { sampleN, bad: bad.slice(0, 4) });
    host.D.setTimeLeft(2);
    const pod = await until(() => F.every((f) => S(f).phase === 'podium'), 8000);
    await sleep(800);
    ok('soak: battle ends on the same podium everywhere', !!pod && F.every((f) => J(S(f).podium) === J(S(host).podium) && scoreLine(f) === scoreLine(host)), F.map((f) => [S(f).podium, scoreLine(f)]));
    ok('soak: no page errors', noErrors(F), errorsOf(F));
    await dropAll();
  }

  // ================================================================ screenshot scenes
  async function shotScene(name) {
    if (name === 'room') {
      const { F } = await uiRoom(4, { mode: 'battle', arena: 2, time: 3 }, ['duck', 'capy', 'otter', 'cat'], ['방장', '까삐', '해롱', '냥냥']);
      click(F[1], 'pg-ready'); click(F[2], 'pg-ready');
      await sleep(1200);
      fullscreen(F[WHO >= 0 ? WHO : 0]);
    } else if (name === 'coop') {
      const { F, host } = await uiRoom(3, { mode: 'coop' }, ['duck', 'frog', 'penguin'], ['방장', '개굴', '펭펭']);
      await uiStart(F);
      await sleep(2600);
      parkAll(host);
      host.D.setInvincible(true);
      F[1].D.setPlayer(60, 136, 1); F[2].D.setPlayer(150, 200, 2);
      for (const e of host.G.enemies.slice(1)) e.delay = 0;
      for (const [x, y] of [[120, 60], [150, 80], [96, 90]]) host.D.spawnBubble('empty', x, y);
      await sleep(600);
      pose(foe(host), me(F[2]).x, me(F[2]).y, 1);
      await until(() => hp(host, 2).ghost, 4000);
      for (const e of host.G.enemies) if (e.state === 'descend') { e.delay = 0; e.t = 0; e.startY = -20; }
      press(F[1], 'right', true);
      await sleep(900);
      press(F[1], 'right', false);
      fullscreen(F[WHO >= 0 ? WHO : 1]);
    } else if (name === 'battle' || name === 'podium') {
      const { F, host } = await uiRoom(4, { mode: 'battle', arena: 0, time: 3 }, ['duck', 'cat', 'frog', 'penguin'], ['방장', '냥이', '개굴', '펭이']);
      await uiStart(F);
      host.D.setTimeLeft(100);
      parkAll(host); host.G.battle.enemyT = 1e9;
      host.D.setPlayer(212, 200, 0); F[1].D.setPlayer(40, 200, 1); F[2].D.setPlayer(84, 200, 2); F[3].D.setPlayer(160, 136, 3);
      await sleep(2700);
      if (name === 'battle') {
        for (const e of host.G.enemies.slice(0, 4)) { e.delay = 0; e.t = 0; e.startY = -20; }
        await tap(F[1], 'right', 40); await sleep(250); await tap(F[1], 'shoot', 60);
        await until(() => hp(host, 2).trap, 2500);
        await sleep(500);
        fullscreen(F[WHO >= 0 ? WHO : 2]);
      } else {
        hp(host, 1).score = 2300; hp(host, 3).score = 1800; hp(host, 0).score = 900; hp(host, 2).score = 400; hp(host, 1).kos = 3;
        host.D.setTimeLeft(2);
        await until(() => F.every((f) => S(f).phase === 'podium'), 8000);
        await sleep(1600);
        fullscreen(F[WHO >= 0 ? WHO : 1]);
      }
    }
    await sleep(900);
    log('FV3 SHOT READY ' + name + ' errors=' + J(errorsOf(frames)));
  }

  // ================================================================ run
  (async () => {
    const t0 = clock();
    const step = async (name, fn) => {
      const t = clock();
      try { await fn(); } catch (e) { fail++; log('FV3 FAIL ' + name + ' threw: ' + ((e && e.stack) || e)); try { await dropAll(); } catch (x) { /* ignore */ } }
      metric('phase_secs.' + name, Math.round((clock() - t) / 1000));
    };
    if (SHOT) { await step('shot', () => shotScene(SHOT)); return; }
    const want = (n) => !ONLY.length || ONLY.includes(n);
    if (want('solo')) await step('solo', solo);
    if (want('perks')) await step('perks', perks);
    if (want('coop')) await step('coop', coop);
    if (want('battle')) for (const a of ARENAS) await step('battle' + a, () => battle(a, { rematch: a === ARENAS[0] }));
    if (want('leaves')) await step('leaves', leaves);
    if (want('room')) await step('room', roomPhase);
    if (want('soak')) await step('soak', soak);
    log('FV3 DONE pass=' + pass + ' fail=' + fail + ' secs=' + Math.round((clock() - t0) / 1000));
  })();
})();
