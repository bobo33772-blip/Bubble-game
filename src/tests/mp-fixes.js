// v3 review fixes, ONLINE, in real time: same-origin iframes of preview.html on PG.Net's 'bc' transport with a simulated
// network, driven through PG.debug.mp / PG.debug (built to test-mp-fixes.html; serve C:/Temp/bogeul with tools/serve.js):
//   node bogeul/tools/run-chrome.js http://localhost:8765/test-mp-fixes.html - 1200 900 rt600000 "MPFIX DONE"
// Phases (?only=a,b):
//   trapfair  battle 1v1: a guest standing still is caught by the host's shot; a guest that jumps as soon as the shot
//             comes within ~44 px ON ITS OWN SCREEN is not (the host judges the catch against what the guest saw)
//   stall     co-op: the host's loop stalls ~0.4 s (it loses those ticks); the guest's view is interpolating again
//             within a second, not stepping snapshot to snapshot for half a minute
//   harsh     co-op on a 250 +- 120 ms link with ~20 % state loss: the guest's view still interpolates most of the time
//             (the playout delay adapts to the jitter)
//   dropped   co-op, 3 players: a guest whose link goes silent is dropped by the host and is TOLD (연결이 끊겼어요),
//             never left playing alone; the others play on
// Prints "MPFIX PASS|FAIL <name>", "MPFIX METRIC <name> <value>", "MPFIX DONE pass=N fail=M".
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const LINK = Q.get('link') || 'lat=25&jit=30&drop=0.025';
  const ONLY = (Q.get('only') || '').split(',').filter(Boolean);
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => {
    if (cond) { pass++; log('MPFIX PASS ' + name); } else { fail++; log('MPFIX FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); }
    return !!cond;
  };
  const metric = (name, v) => log('MPFIX METRIC ' + name + ' ' + JSON.stringify(v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clock = () => performance.now();
  async function until(pred, ms, step) {
    const t0 = clock();
    for (;;) {
      let v = false;
      try { v = pred(); } catch (e) { v = false; }
      if (v) return v;
      if (clock() - t0 > ms) return false;
      await sleep(step || 20);
    }
  }
  window.addEventListener('error', (e) => { fail++; log('MPFIX page error (driver): ' + e.message); });
  try { PG.debug.G.manual = true; } catch (e) { /* ignore */ }
  document.body.style.background = '#061518';

  const frames = [];
  const LAYOUT = [[0, 0], [600, 0], [0, 450], [600, 450]];
  function frame(i, link) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'preview.html?net=bc&' + (link || LINK) + '&frame=' + i;
      const pos = LAYOUT[i % LAYOUT.length];
      f.style.cssText = 'position:fixed;left:' + pos[0] + 'px;top:' + pos[1] + 'px;width:600px;height:450px;border:0;background:#0a2327';
      const t = setTimeout(() => reject(new Error('frame ' + i + ' did not load')), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        const okp = await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.Net, 15000);
        clearTimeout(t);
        if (!okp) { reject(new Error('frame ' + i + ' has no PG.debug.mp')); return; }
        const fr = { i, el: f, w, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, errors: [] };
        w.addEventListener('error', (e) => { fr.errors.push(e.message); log('MPFIX frame ' + i + ' page error: ' + e.message + ' @' + e.lineno); });
        w.addEventListener('unhandledrejection', (e) => { fr.errors.push('rejection ' + (e.reason && e.reason.message)); });
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
  const press = (fr, a, down) => fr.D.press(a, down, slotOf(fr));
  const allIdle = (fr) => { for (const a of ['left', 'right', 'jump', 'shoot']) press(fr, a, false); };
  async function room(n, mode, hostOpts, link) {
    const chars = ['duck', 'cat', 'frog', 'otter'], nicks = ['방장', '친구', '셋째', '넷째'];
    const F = [];
    for (let i = 0; i < n; i++) F.push(await frame(frames.length, link));
    const host = F[0];
    const code = await host.mp.host(Object.assign({ mode, nick: nicks[0], char: chars[0] }, hostOpts || {}));
    if (!code) return { F, host, code: null };
    for (let i = 1; i < n; i++) await F[i].mp.join(code, { nick: nicks[i], char: chars[i] });
    await until(() => N(host).roster.length === n && F.slice(1).every((f) => N(f).roster.length === n), 8000);
    for (const f of F.slice(1)) f.mp.ready(true);
    await until(() => N(host).canStart, 8000);
    host.mp.start();
    const playing = await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online), 15000);
    return { F, host, code, playing: !!playing };
  }
  function parkAll(host) { for (const e of host.G.enemies) { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; } }
  const starveOf = (fr) => { const s = N(fr); return { v: s.viewFrames, s: s.starvedFrames }; };
  const frac = (a, b) => (b.v - a.v > 0 ? (b.s - a.s) / (b.v - a.v) : 1);

  // ------------------------------------------------------------------ trapfair
  async function trapfair() {
    const R = await room(2, 'battle', { arena: 0, time: 5, perks: false, intrusion: false });
    if (!ok('trapfair: 1v1 battle playing', R.playing)) { dropAll(); return; }
    const [H, B] = R.F;
    const FLOOR = 200;
    const hold = () => { parkAll(H); H.G.battle.enemyT = 1e9; H.G.battle.powerT = 1e9; H.G.bubbles = H.G.bubbles.filter((b) => b.kind !== 'empty'); };
    async function setup() {
      hold();
      allIdle(H); allIdle(B);
      for (let k = 0; k < 40; k++) {
        H.D.setPlayer(24, FLOOR, 0); const hp = H.G.players.find((p) => p.slot === 0); hp.facing = 1; hp.invuln = 0;
        B.D.setPlayer(100, FLOOR, 1); const bp = me(B); if (bp) { bp.invuln = 0; bp.facing = -1; }
        const hb = H.G.players.find((p) => p.slot === 1); if (hb) hb.invuln = 0;
        await sleep(16);
      }
      await sleep(400);
      hold();
      const hb = H.G.players.find((p) => p.slot === 1);
      const bp0 = me(B), hp0 = H.G.players.find((p) => p.slot === 0);
      log('MPFIX INFO setup host P1 ' + Math.round(hp0.x) + ',' + Math.round(hp0.y) + ' host sees P2 ' + (hb && Math.round(hb.x) + ',' + Math.round(hb.y) + ' inv ' + hb.invuln + ' ep ' + hb.ep) + ' guest self ' + (bp0 && Math.round(bp0.x) + ',' + Math.round(bp0.y)) + ' ctl ' + N(B).ctl + ' rt ' + Math.round(N(B).renderTick || 0) + ' hostFrame ' + H.G.frame);
      return hb && !hb.trap && !hb.koT && Math.abs(hb.x - 100) < 6 && Math.abs(hb.y - FLOOR) < 2;
    }
    // stand still: caught
    let caughtStill = 0;
    for (let k = 0; k < 2; k++) {
      if (!(await setup())) { log('MPFIX INFO setup failed (still ' + k + ')'); continue; }
      press(H, 'shoot', true); await sleep(60); press(H, 'shoot', false);
      if (await until(() => { const hb = H.G.players.find((p) => p.slot === 1); return hb && hb.trap; }, 1500)) caughtStill++;
      await until(() => { const hb = H.G.players.find((p) => p.slot === 1); return hb && !hb.trap && !hb.koT; }, 6000);
    }
    ok('trapfair: a guest that stays put is caught by the shot (2/2)', caughtStill === 2, caughtStill);
    // dodge as soon as the shot comes within 56 px on the guest's own screen; record whether, on that screen, the
    // capture-phase bubble ever touched the guest's body (circle vs box, the engine's own test)
    const touches = (b, p) => { const cx = b.x + 8, cy = b.y + 8, nx = Math.max(p.x + 2, Math.min(cx, p.x + 14)), ny = Math.max(p.y + 2, Math.min(cy, p.y + 16)); return Math.hypot(cx - nx, cy - ny) < 8; };
    const res = [];
    for (let k = 0; k < 5; k++) {
      if (!(await setup())) { log('MPFIX INFO setup failed (dodge ' + k + ')'); continue; }
      let jumped = false, touched = false, info = null, jumpAt = null;
      const watch = setInterval(() => {
        const bp = me(B); if (!bp) return;
        for (const b of V(B).bubbles) {
          if (b.owner !== 0 || b.kind !== 'empty' || b.pred) continue;
          if (b.state === 'shot' && touches(b, bp) && !touched) { touched = true; info = { f: B.G.frame, bx: Math.round(b.x), by: Math.round(b.y), px: Math.round(bp.x), py: Math.round(bp.y), vy: +bp.vy.toFixed(2), og: bp.onGround, jumpAt }; }
          if (!jumped && Math.abs(b.x + 8 - (bp.x + 8)) < 56) { jumpAt = { f: B.G.frame, bx: Math.round(b.x), px: Math.round(bp.x), py: Math.round(bp.y), og: bp.onGround }; jumped = true; press(B, 'jump', true); setTimeout(() => press(B, 'jump', false), 300); }
        }
      }, 5);
      press(H, 'shoot', true); await sleep(60); press(H, 'shoot', false);
      await sleep(1600);
      clearInterval(watch);
      const hb = H.G.players.find((p) => p.slot === 1);
      res.push({ jumped, touched, caught: !!(hb && (hb.trap || hb.koT)), info });
      await until(() => { const q = H.G.players.find((p) => p.slot === 1); return q && !q.trap && !q.koT; }, 6000);
    }
    metric('trapfair.dodge', res);
    const clean = res.filter((r) => r.jumped && !r.touched);
    ok('trapfair: a dodge that worked on the guest\'s own screen counts (clean dodges never caught, 3+ of 5 clean)', clean.length >= 3 && clean.every((r) => !r.caught), res);
    ok('trapfair: nobody is caught by a bubble that never touched it on its own screen', res.every((r) => !r.caught || r.touched), res);
    ok('trapfair: no page errors', R.F.every((f) => !f.errors.length), R.F.map((f) => f.errors));
    dropAll();
  }

  // ------------------------------------------------------------------ stall
  async function stall() {
    const R = await room(2, 'coop');
    if (!ok('stall: co-op playing', R.playing)) { dropAll(); return; }
    const [H, B] = R.F;
    H.D.setInvincible(true); B.D.setInvincible(true);
    await sleep(2500);
    const a0 = starveOf(B); await sleep(2000); const a1 = starveOf(B);
    const base = frac(a0, a1);
    // the host's loop stalls for ~0.4 s and loses those ticks (as a long GC pause / a busy phone would)
    const k0 = H.G.frame;
    H.G.manual = true; await sleep(420); H.G.manual = false;
    await sleep(1000);
    const b0 = starveOf(B); await sleep(4000); const b1 = starveOf(B);
    const after = frac(b0, b1);
    metric('stall', { lostTicksAbout: 25, hostFrameBefore: k0, starvedBefore: +base.toFixed(3), starved1to5s: +after.toFixed(3) });
    ok('stall: the guest view interpolates again within a second of a 0.4 s host stall (starved < 15 % over the next 4 s)', after < 0.15, after);
    ok('stall: no page errors', R.F.every((f) => !f.errors.length), R.F.map((f) => f.errors));
    dropAll();
  }

  // ------------------------------------------------------------------ harsh
  async function harsh() {
    // per page lat 65 + U(0,120) twice -> ~250 +- 120 ms one way, drop 0.106 per page -> ~20 % of states lost
    const R = await room(2, 'coop', null, 'lat=65&jit=120&drop=0.106');
    if (!ok('harsh: co-op playing on a 250 +- 120 ms, 20 % loss link', R.playing)) { dropAll(); return; }
    const [H, B] = R.F;
    H.D.setInvincible(true); B.D.setInvincible(true);
    await sleep(3000);
    const a0 = starveOf(B);
    for (let k = 0; k < 24; k++) {
      allIdle(B);
      press(B, k % 2 ? 'left' : 'right', true);
      if (k % 3 === 0) press(B, 'jump', true);
      await sleep(500);
    }
    allIdle(B);
    const a1 = starveOf(B);
    const f = frac(a0, a1);
    let rtt = null; try { rtt = N(B).stats.rttMs; } catch (e) { rtt = null; }
    metric('harsh', { starved: +f.toFixed(3), rttMs: rtt, frames: a1.v - a0.v });
    ok('harsh: the guest view interpolates most of the time (starved < 20 %)', f < 0.2, f);
    ok('harsh: no page errors', R.F.every((fr) => !fr.errors.length), R.F.map((fr) => fr.errors));
    dropAll();
  }

  // ------------------------------------------------------------------ dropped
  async function dropped() {
    const R = await room(3, 'coop');
    if (!ok('dropped: 3-player co-op playing', R.playing)) { dropAll(); return; }
    const [H, B, C] = R.F;
    // B's link goes silent (it still hears everyone): the host gives up on it and must tell it so
    const BC = B.w.BroadcastChannel.prototype, post = BC.postMessage;
    BC.postMessage = function () {};
    const told = await until(() => N(B).screen === 'friends' && /연결이 끊겼어요/.test(N(B).error || ''), 16000);
    BC.postMessage = post;
    ok('dropped: the host drops the silent guest', N(H).roster.length === 2, N(H).roster.length);
    ok('dropped: the dropped guest is told (연결이 끊겼어요) and is back on 친구와 하기, not playing alone', !!told, { screen: N(B).screen, err: N(B).error, online: S(B).online });
    const onward = await until(() => S(H).phase === 'playing' && S(C).online && N(C).roster.length === 2 && N(H).roster.length === 2, 4000);
    ok('dropped: the others play on (rosters of 2)', !!onward, { h: S(H).phase, c: N(C).roster.length });
    ok('dropped: no page errors', R.F.every((f) => !f.errors.length), R.F.map((f) => f.errors));
    dropAll();
  }

  (async () => {
    const phases = [['trapfair', trapfair], ['stall', stall], ['harsh', harsh], ['dropped', dropped]];
    for (const [name, fn] of phases) {
      if (ONLY.length && !ONLY.includes(name)) continue;
      log('MPFIX PHASE ' + name);
      try { await fn(); } catch (e) { fail++; log('MPFIX FAIL ' + name + ' threw ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); dropAll(); }
      await sleep(300);
    }
    log('MPFIX DONE pass=' + pass + ' fail=' + fail);
  })();
})();
