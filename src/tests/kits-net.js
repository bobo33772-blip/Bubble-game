// v4 character kits online (design/char-kits.md §14.2 + the §14.1 rows that need a host and a guest): same-origin
// iframes of preview.html on PG.Net 'bc', real time. Each phase builds fresh frames on the lab room (round 1 and arena 1
// replaced by a flat floor with a hot pool, cols 22-27):
//   1 co-op, lat 0       host duck + guests capy / cat / otter: host-local vs guest body traces for all six moves
//                        (both engines stepped in lockstep), NET_V 4, body bits A / B through the peer stream and the
//                        P row and how late they show, the capy slam (bits, quake soak, quake heard once each, the
//                        host's bounce gate, popping on every screen), qk refusals, the hot-water shield validation
//   2 co-op, lat 80/30   the guests' predicted bubbles against the host's rows at every age for all six (+ the cat's a:1
//                        air shot), no phantom bursts, the owner never sees its droplets twice, snapshot size with 4
//                        frogs / otters / ducks on autofire
//   3 battle, lat 80/30  host capy + guests penguin / duck / otter: every screen draws each bubble with its blower's
//                        animal, a guest's stun mid-move ends it on its own engine, a v3 body state is ignored, snapshot
//                        size in a mixed 4P battle with the boss intruding
//   4 battle 능력 끄기   host duck + guests capy (a client that keeps its perks on) / cat: qk refused, shield ignored,
//                        bits never shown, every bubble plain, a:1 ignored
// (folds in the engine passes' wip-net.js; kits-online.js stays as the looks screenshot driver)
// A phase that fails while the harness itself stalls (a state delivery over 150 ms on the BroadcastChannel, see STALL)
// runs once more on fresh frames, and that attempt counts.
//   node tools/serve.js   (background)
//   node tools/run-chrome.js http://localhost:8765/test-kits-net.html - 1200 900 rt700000 "KITSNET DONE"   (~2-3 min)
//   ?only=1,3 runs some phases; ?lat=&jit= replaces the 80 / 30 of phases 2-4
// Prints "KITSNET PASS|FAIL <name>", "KITSNET INFO ..." and "KITSNET DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const J = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
  // (results count through the phase attempt they belong to - see runPhase)
  let att = null;
  const ok = (name, cond, inf) => {
    if (cond) { if (att) att.pass++; else pass++; log('KITSNET PASS ' + name); }
    else { if (att) att.fail.push(name); else fail++; log('KITSNET FAIL ' + name + (inf !== undefined ? ' :: ' + J(inf).slice(0, 700) : '')); }
    return !!cond;
  };
  // ---- the test harness itself: the browser's delivery time of every body / snapshot state on the BroadcastChannel
  // (postMessage in one frame -> its message event in another, one clock across the frames; the simulated link delays
  // sit outside it). Normally < 10 ms (~100 ms once while a frame builds its first round). Over 150 ms is the harness
  // stalling - seen here at ~300 ms with every frame still drawing at 60 fps and the engines using 2-4 % of the main
  // thread: no playout delay or host check can be judged across that, so a phase that fails during one runs again
  const STALL = { sent: new Map(), list: [], t0: performance.timeOrigin + performance.now() };
  function watchBc(w, i) {
    const BC = w.BroadcastChannel; if (typeof BC !== 'function') return;
    const abs = () => w.performance.timeOrigin + w.performance.now();
    w.BroadcastChannel = function (name) {
      const ch = new BC(name), pm = ch.postMessage.bind(ch);
      ch.postMessage = (m) => { if (m && m.k === 's' && STALL.sent.size < 60000) STALL.sent.set(m.f + ':' + m.q, { t: abs(), i }); return pm(m); };
      ch.addEventListener('message', (ev) => {
        const m = ev.data, s = m && m.k === 's' ? STALL.sent.get(m.f + ':' + m.q) : null;
        if (s && abs() - s.t > 150 && STALL.list.length < 200) STALL.list.push([Math.round(s.t - STALL.t0), s.i, i, Math.round(abs() - s.t)]);
      });
      return ch;
    };
  }
  const info = (s) => log('KITSNET INFO ' + s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const r2 = (v) => Math.round(v * 100) / 100;
  async function until(pred, ms, stepMs) {
    const t0 = performance.now();
    for (;;) { let v = false; try { v = pred(); } catch (e) { v = false; } if (v) return v; if (performance.now() - t0 > ms) return false; await sleep(stepMs || 15); }
  }
  try { PG.debug.G.manual = true; PG.Audio.setMuted(true); } catch (e) { /* ignore */ }
  window.addEventListener('error', (e) => { fail++; log('KITSNET FAIL driver page error: ' + e.message + ' @' + e.lineno); });
  const Q = new URLSearchParams(location.search);
  const ONLY = (Q.get('only') || '1,2,3,4').split(',').filter(Boolean);
  const LAT = Q.get('lat') === null ? 80 : Math.max(0, +Q.get('lat') || 0), JIT = Q.get('jit') === null ? 30 : Math.max(0, +Q.get('jit') || 0);
  const TS = 8, FLOOR = 16 + 25 * TS, POOL_Y = 16 + 23 * TS;   // feet on the floor 216; the hot pool's surface (cols 22-27)

  // ================================================================ frames (players)
  function frame(i, lat, jit) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'preview.html?net=bc&lat=' + lat + '&jit=' + jit + '&drop=0&frame=' + i;
      f.style.cssText = 'position:fixed;left:' + (i % 2) * 600 + 'px;top:' + (i >> 1) * 450 + 'px;width:600px;height:450px;border:0';
      const t = setTimeout(() => reject(new Error('frame ' + i)), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        if (!(await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.Net, 15000))) { reject(new Error('no PG ' + i)); return; }
        clearTimeout(t);
        const fr = { i, el: f, w, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, sfx: [], errors: [] };
        watchBc(w, i); // (before the room opens its channel)
        try { w.PG.Audio.setMuted(true); } catch (e) { /* ignore */ }
        const A = w.PG.Audio;
        if (A && typeof A.sfx === 'function') { const o = A.sfx; A.sfx = function (n, op) { fr.sfx.push(n + (op && op.n ? ':' + op.n : '')); return o.apply(A, arguments); }; }
        w.addEventListener('error', (e) => { fail++; fr.errors.push(e.message); log('KITSNET FAIL frame ' + i + ' page error: ' + e.message + ' @' + e.lineno); });
        // the lab room on every engine (host world and guest views / physics agree on it): round 1 and arena 1
        const SOLID = '#'.repeat(32), WALLS = '##' + '.'.repeat(28) + '##', map = [];
        for (let r = 0; r < 26; r++) map.push(r === 0 || r === 25 ? SOLID : r === 23 || r === 24 ? '##' + '.'.repeat(20) + '~~~~~~' + '..##' : WALLS);
        const spawns = [{ col: 4, row: 24 }, { col: 9, row: 24 }, { col: 15, row: 24 }, { col: 18, row: 24 }];
        Object.assign(fr.D.levels()[0], { map, player: spawns[0], players: spawns, gather: { col: 16, row: 3 }, gapX: 128, special: undefined, boss: null,
          enemies: [{ type: 'mold', col: 3, row: 10, dir: 1 }, { type: 'mold', col: 6, row: 10, dir: 1 }, { type: 'mold', col: 12, row: 10, dir: 1 }] });
        Object.assign(fr.D.arenas()[0], { map, players: spawns, gather: { col: 16, row: 3 },
          enemySpawns: [{ col: 6, row: 24 }, { col: 12, row: 24 }, { col: 24, row: 21 }, { col: 27, row: 24 }, { col: 8, row: 10 }, { col: 20, row: 10 }] });
        resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  const S = (fr) => fr.D.getState();
  const N = (fr) => fr.mp.state();
  const slotOf = (fr) => N(fr).mySlot;
  const me = (fr) => fr.G.players.find((p) => p.slot === slotOf(fr));
  const pOf = (fr, slot) => fr.G.players.find((p) => p.slot === slot);
  const press = (fr, a, down) => fr.D.press(a, down, slotOf(fr));
  async function tap(fr, a, ms) { press(fr, a, true); await sleep(ms || 40); press(fr, a, false); }
  const still = (e, x, feet, type) => Object.assign(e, { type: type || 'mold', state: 'active', x, y: feet - 16, vx: 0, vy: 0, onGround: true, angry: false, escaped: false, hopT: 99999, delay: 0, spawnY: feet - 16,
    jumpCd: 999, chargeCd: 999, windT: 0, chargeT: 0, committed: false, soakT: 0, dir: 1, water: 0, grace: 0, bubble: null, ice: null });
  const parkAll = (host) => { for (const e of host.G.enemies) { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; } };
  // a callback after each engine frame inside that iframe (a rAF registered after the engine's own)
  function sampler(fr, fn) { let on = true; const tick = () => { if (!on) return; try { fn(); } catch (e) { /* ignore */ } fr.w.requestAnimationFrame(tick); }; fr.w.requestAnimationFrame(tick); return () => { on = false; }; }
  // a body of its own (a guest moves its animal on its own engine; the host its own) standing on the floor
  const stand = (fr, x, facing) => Object.assign(me(fr), { x, y: FLOOR - 16, vx: 0, vy: 0, onGround: true, facing: facing || 1, water: 0, waterSkip: 0, coyote: 0, jumpBuf: 0, shootCd: 0, autoCd: 0, shootBuf: 0,
    airT: 0, mv: '', mvT: 0, mvUsed: false, mvCd: 0, glideT: 0, carry: false, hop: 0, hopAir: false, landT: 30, sq: 0 });
  const setChar = (F, slot, ch) => { for (const f of F) { const p = pOf(f, slot); if (p) p.char = ch; } };
  async function room(chars, opts, lat, jit) {
    const F = [];
    for (let i = 0; i < chars.length; i++) F.push(await frame(i, lat, jit));
    const host = F[0];
    const code = await host.mp.host(Object.assign({ nick: '방장', char: chars[0] }, opts));
    for (let i = 1; i < F.length; i++) await F[i].mp.join(code, { nick: '손님' + i, char: chars[i] });
    await until(() => N(host).roster.length === F.length, 8000);
    for (const f of F.slice(1)) f.mp.ready(true);
    await until(() => N(host).canStart, 8000);
    host.mp.start();
    const up = await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online) && F.slice(1).every((f) => N(f).ctl === 'local'), 20000);
    for (const f of F) f.D.setInvincible(true);
    return { F, host, up: !!up };
  }
  async function drop(F) {
    for (const f of F) { try { f.mp.leave(); } catch (e) { /* ignore */ } }
    await sleep(400);
    for (const f of F) f.el.remove();
    await sleep(300);
  }

  // ================================================================ phase 1: co-op at lat 0
  async function phase1() {
    const R = await room(['duck', 'capy', 'cat', 'otter'], { mode: 'coop' }, 0, 0);
    const { F, host } = R, [, ga, gb, gc] = F;
    if (!ok('1: co-op up at lat 0 (host duck, guests capy / cat / otter)', R.up, F.map((f) => S(f).phase))) return drop(F);
    parkAll(host); host.G.stampT = 1e9;
    const sA = slotOf(ga), sB = slotOf(gb), sC = slotOf(gc), hostId = ga.mp.session().peers().find((p) => p.host).id;
    // ---- NET_V 4: every state this game sends carries v 4
    const vs = { host: new Set(), guest: new Set() };
    for (const [k, fr] of [['host', host], ['guest', ga]]) { const s = fr.mp.session(), o = s.setState.bind(s); s.setState = (st) => { vs[k].add(st && st.v); return o(st); }; }
    await sleep(700);
    ok('1: NET_V 4 - the host\'s snapshots and a guest\'s body states carry v 4', [...vs.host].join() === '4' && [...vs.guest].join() === '4', { host: [...vs.host], guest: [...vs.guest] });

    // ---- bit A latency (first, while every playout buffer is settled): guest C's otter dash seen by guest B (peer stream); the host duck's glide seen by guest B (P row)
    const edge = async (src, srcP, view, viewSlot, act) => {
      const r = { src: null, view: null, pos: null };
      const s1 = sampler(src, () => { const p = srcP(); if (p && p.mvA && !r.src) r.src = { t: performance.now(), x: p.x }; });
      const s2 = sampler(view, () => {
        const p = pOf(view, viewSlot); if (!p) return;
        // (the first drawn frame at or past that spot: both acts run right, and a dash covers 3.2 px a frame - a window
        // around the spot (it was |dx| < 0.75) is stepped over by the interpolated view about half the time)
        if (r.src && !r.pos && p.x >= r.src.x - 0.75) r.pos = { t: performance.now() };
        if (p.mvA && !r.view) r.view = { t: performance.now(), x: p.x };
      });
      await act();
      await until(() => r.view, 1500, 5); s1(); s2();
      return { ms: r.src && r.view ? Math.round(r.view.t - r.src.t) : null, dx: r.src && r.view ? r2(r.view.x - r.src.x) : null, afterBody: r.pos && r.view ? Math.round(r.view.t - r.pos.t) : null };
    };
    stand(gc, 40, 1); await sleep(300);
    const peerE = await edge(gc, () => me(gc), gb, sC, async () => { press(gc, 'right', true); await tap(gc, 'jump'); await until(() => me(gc).vy >= 0 && !me(gc).onGround, 2000, 4); await tap(gc, 'jump'); await sleep(400); press(gc, 'right', false); });
    stand(host, 40, 1); await sleep(300);
    const rowE = await edge(host, () => pOf(host, 0), gb, 0, async () => { press(host, 'right', true); press(host, 'jump', true); await sleep(1300); press(host, 'jump', false); press(host, 'right', false); });
    info('1: bit A seen by another guest: otter dash via the peer stream ' + J(peerE) + ' | host duck glide via the P row ' + J(rowE) + ' (ms after the source frame; dx = view x - source x at the rising edges; afterBody = ms after the view showed that body spot)');
    // (a viewer draws another player PEER_DELAY 6 ticks (100 ms) behind its body stream, sent every 2nd frame, and the host's
    // own animal SNAP_DELAY 8 ticks behind its snapshots, sent every 3rd: the bits ride in those same samples, so they show
    // when the body spot they were sent with is drawn - within one sample interval (+ a frame or two of sampling) of it. The spec's
    // 'within 100 ms' is that playout delay itself, which adapts to the link: the total is reported, bounded loosely)
    ok('1: bit A reaches another guest through the peer stream with its body sample (otter dash: <= 4 frames after that spot is drawn, ' + peerE.ms + ' ms in all)', peerE.ms !== null && peerE.afterBody !== null && peerE.afterBody <= 4 * 17 && peerE.ms <= 200, peerE);
    ok('1: bit A reaches another guest through the P row with its body sample (host duck glide: <= 4 frames after that spot is drawn, ' + rowE.ms + ' ms in all)', rowE.ms !== null && rowE.afterBody !== null && rowE.afterBody <= 4 * 17 && rowE.ms <= 300, rowE);
    await sleep(500);

    // ---- the same scripted input on the host's own animal (slot 0) and on guest A's: identical body traces per move
    // (both engines stepped in lockstep from here, one frame per ~16 ms: no link latency is involved)
    const H0 = () => pOf(host, 0), GA = () => me(ga);
    const SCRIPTS = {
      // [frames, (i, p, st) -> {right, left, jump}] - p: the host's body (the inputs are computed once, from the host's
      // trace, and given to both)
      duck: [130, (i) => ({ right: true, jump: i < 100 })],
      capy: [80, (i, p, st) => { if (st.apex < 0 && i > 2 && p.vy >= 0) st.apex = i; return { right: i > 40, jump: i === 0 || i === st.apex }; }],
      otter: [70, (i, p, st) => { if (st.apex < 0 && i > 2 && p.vy >= 0) st.apex = i; return { right: true, jump: i === 0 || i === st.apex }; }],
      penguin: [130, (i, p, st) => { if (st.apex < 0 && i > 2 && p.vy >= 0) st.apex = i; if (p.mv === 'slide' && st.sl < 0) st.sl = i; return { right: true, jump: i === 0 || i === st.apex || i === st.sl + 20 }; }],
      cat: [100, (i, p, st) => { if (st.apex < 0 && i > 2 && p.vy >= 0) st.apex = i; return { left: st.apex > 0 && i > st.apex, jump: i === 0 || i === st.apex }; }],
      frog: [150, (i, p, st) => { const land = p.onGround && !st.was; st.was = p.onGround; if (land && i > 2) st.at = i + 1; return { right: i > 100, jump: i === 0 || i === st.at }; }],
    };
    const traceOut = {};
    for (const c of Object.keys(SCRIPTS)) {
      setChar(F, 0, c); setChar(F, sA, c);
      for (const f of [host, ga]) for (const a of ['left', 'right', 'jump', 'shoot']) press(f, a, false);
      await sleep(120);
      host.G.manual = true; ga.G.manual = true;
      stand(host, 40, 1); stand(ga, 40, 1); host.G.bubbles = [];
      const [n, fn] = SCRIPTS[c], st = { apex: -1, sl: -1, was: true, at: -1 };
      const th = [], tg = [];
      for (let i = 0; i < n; i++) {
        const inp = fn(i, H0(), st);
        for (const a of ['left', 'right', 'jump']) { host.D.press(a, !!inp[a], 0); ga.D.press(a, !!inp[a], sA); }
        host.D.step(1); ga.D.step(1);
        const h = H0(), g = GA();
        th.push([h.x, h.y, h.mv, !!h.mvA, !!h.mvB, h.hop | 0]); tg.push([g.x, g.y, g.mv, !!g.mvA, !!g.mvB, g.hop | 0]);
        if (i % 6 === 5) await sleep(16 * 6 - 8);
      }
      for (const f of [host, ga]) for (const a of ['left', 'right', 'jump']) f.D.press(a, false, slotOf(f));
      host.G.manual = false; ga.G.manual = false;
      const diff = th.findIndex((e, i) => e.join() !== tg[i].join());
      const mvs = [...new Set(th.map((e) => e[2]).filter(Boolean))].join('/');
      traceOut[c] = (diff < 0 ? 'same' : 'DIFF@' + diff + ' ' + J(th[diff]) + ' vs ' + J(tg[diff])) + ' (' + n + ' f, moves ' + (mvs || '-') + (c === 'frog' ? ' hop ' + Math.max(...th.map((e) => e[5])) : '') + ')';
      await sleep(250);
    }
    setChar(F, 0, 'duck'); setChar(F, sA, 'capy');
    info('1: host-local vs guest traces ' + J(traceOut));
    ok('1: the same input on a host-local animal and on a guest\'s gives identical body traces (x, y, mv, A, B) for all six moves',
      Object.values(traceOut).every((s) => /^same/.test(s)) && /glide/.test(traceOut.duck) && /wind\/slam\/rec/.test(traceOut.capy) && /dash/.test(traceOut.otter) &&
      /dive\/slide/.test(traceOut.penguin) && /curl/.test(traceOut.cat) && /hop 2/.test(traceOut.frog), traceOut);
    await sleep(600);
    parkAll(host);

    // ---- a real slam by guest A: bits on the host P row and on guest B (peer stream), the quake soaks on the host
    const A = me(ga), H = pOf(host, sA);
    stand(ga, 60, 1); await sleep(400);
    let hostA = 0, hostB = 0, viewA = 0, viewB = 0;
    const watch = setInterval(() => {
      if (H.mvA) hostA++; if (H.mvB) hostB++;
      const v = pOf(gb, sA); if (v && v.mvA) viewA++; if (v && v.mvB) viewB++;
    }, 8);
    ga.sfx.length = 0; gb.sfx.length = 0; host.sfx.length = 0; gc.sfx.length = 0;
    await tap(ga, 'jump');
    await until(() => A.vy >= 0 && !A.onGround, 2000, 4);
    // a still mold on the host 24 px right of where the capy is now (same floor); one 60 px away
    still(host.G.enemies[0], H.x + 24, FLOOR); still(host.G.enemies[1], H.x + 60, FLOOR);
    await tap(ga, 'jump');
    const slammed = await until(() => A.mv === 'wind' || A.mv === 'slam', 500, 4);
    const landed = await until(() => A.mv === 'rec', 2000, 4);
    await sleep(500);
    clearInterval(watch);
    const soak = [host.G.enemies[0].soakT, host.G.enemies[1].soakT];
    const heard = [ga, gb, gc, host].map((f) => f.sfx.filter((n) => n === 'quake').length);
    info('1: slam: guest mv seen ' + !!slammed + ' rec ' + !!landed + ' host A/B samples ' + hostA + '/' + hostB + ' guest B view A/B ' + viewA + '/' + viewB +
      ' soak near/far ' + soak.join('/') + ' quake heard capy/cat/otter/host ' + heard.join('/'));
    ok('1: guest capy slams (wind -> slam -> rec)', slammed && landed);
    ok('1: bits A / B reach the host (P-row source) and another guest (peer stream)', hostA > 0 && hostB > 0 && viewA > 0 && viewB > 0, [hostA, hostB, viewA, viewB]);
    ok('1: qk accepted: the host soaks the mold 24 px away, not the one 60 px away', soak[0] > 200 && soak[1] === 0, soak);
    ok('1: quake heard once by the capy (its own), once by each other guest, once on the host', heard.every((n) => n === 1), heard);
    ok('1: the slam wind-up sound stays local (NO_ECHO)', ga.sfx.includes('slam') && !gb.sfx.includes('slam') && !host.sfx.includes('slam'), [ga.sfx.join(','), gb.sfx.join(',')]);

    // ---- forged qk messages are refused
    const send = (fr, m) => fr.mp.session().send(hostId, m);
    const refused = async (name, fr, m) => {
      still(host.G.enemies[0], H.x + 20, FLOOR); await sleep(50);
      send(fr, m); await sleep(250);
      const s = host.G.enemies[0].soakT;
      return ok('1: qk refused: ' + name, s === 0, s);
    };
    await refused('a second one within 40 f', ga, { t: 'qk', x: H.x, y: H.y, ep: H.ep });
    await sleep(700);
    await refused('no A bit within 30 f (standing capy)', ga, { t: 'qk', x: H.x, y: H.y, ep: H.ep });
    await refused('ep mismatch', ga, { t: 'qk', x: H.x, y: H.y, ep: H.ep + 7 });
    await refused('another animal (the cat)', gb, { t: 'qk', x: pOf(host, sB).x, y: pOf(host, sB).y, ep: pOf(host, sB).ep });
    await refused('junk numbers', ga, { t: 'qk', x: 'x', y: null, ep: H.ep });
    // 30 px away while slamming, then 능력 끄기 on the host during a real slam
    const slamWith = async (during) => {
      stand(ga, 60, 1); await sleep(300);
      await tap(ga, 'jump'); await until(() => A.vy >= 0 && !A.onGround, 2000, 4);
      still(host.G.enemies[0], H.x + 24, FLOOR);
      await tap(ga, 'jump'); await until(() => A.mv === 'slam' || A.mv === 'wind', 600, 4);
      const r = await during();
      await until(() => A.mv === 'rec', 2000, 4); await sleep(300);
      return r;
    };
    const far = await slamWith(async () => { await until(() => H.mvA, 300, 4); send(ga, { t: 'qk', x: H.x + 30, y: H.y, ep: H.ep }); await sleep(60); return host.G.enemies[0].soakT; });
    const real = host.G.enemies[0].soakT;
    ok('1: qk refused 30 px from the host-known body (the real landing after it is accepted)', far === 0 && real > 200, [far, real]);
    await sleep(800);
    host.G.perksOff = true;
    const offSoak = await slamWith(async () => 0);
    const offAfter = host.G.enemies[0].soakT;
    host.G.perksOff = false;
    ok('1: qk refused while the host has 능력 끄기 (a real slam by a capy whose own page has its perks on)', offAfter === 0 && offSoak === 0, offAfter);
    await sleep(600);

    // ---- the hot-water shield: a report out of hot water is ignored; a real dip is taken once per 348 f
    stand(ga, 60, 1); await sleep(300);
    A.shield = 180; await sleep(250);
    const shOut = H.shield; A.shield = 0;
    ok('1: a capy shield report out of hot water is ignored by the host', shOut === 0, [A.shield, shOut]);
    const dip = async () => { Object.assign(A, { x: 196, y: POOL_Y - 30, vy: 0, vx: 0, onGround: false, airT: 20, mvUsed: true }); return until(() => A.water === 1 && A.shield > 0, 3000, 8); };
    await dip(); await sleep(250);
    const sh1 = H.shield, at1 = host.G.frame;
    ok('1: a real hot-water dip: the host takes the shield', sh1 > 100 && A.shield > 0, [A.shield, sh1]);
    stand(ga, 60, 1); await sleep(600);
    // (a modified page: a new full shield reported in hot water again before 348 f have passed)
    Object.assign(A, { x: 196, y: POOL_Y - 30, vy: 0, vx: 0, onGround: false, airT: 20, mvUsed: true });
    await until(() => A.water === 1, 2000, 8); A.shield = 180; await sleep(250);
    const sh2 = H.shield, dt2 = host.G.frame - at1;
    ok('1: a second shield reported in hot water ' + dt2 + ' f after the first (< 348) is refused', dt2 < 348 && sh2 === 0, [sh2, dt2]);
    A.shield = 0; stand(ga, 60, 1); await sleep(400);

    // ---- a remote capy slamming with JUMP held through a floating bubble: popped on the host and on every screen
    // (the host's bounce gate); a remote animal falling onto one with JUMP held (not slamming) bounces and keeps it
    const floatAt = (x, y) => { const b = host.D.spawnBubble('empty', x, y); b.phase = 0; return b; };
    const pin = (b, x, y) => setInterval(() => { if (!b.dead && b.state === 'float') { b.x = x; b.y = y; b.vx = 0; b.vy = 0; } }, 4);
    const goneOn = (fr, id) => !fr.G.bubbles.some((q) => q.id === id && !q.dead && q.state !== 'pop');
    let b = floatAt(100, 150); let pinT = pin(b, 100, 150);
    await sleep(450);
    const seenBefore = [ga, gb].map((f) => !goneOn(f, b.id));
    Object.assign(A, { x: 100, y: 40, vy: 0, vx: 0, onGround: false, airT: 20, coyote: 0, jumpBuf: 0, mvUsed: false, mvCd: 0, mv: '' });
    ga.sfx.length = 0;
    press(ga, 'jump', true);
    await until(() => A.mv === 'slam', 600, 4);
    let bounced = false; const bw = setInterval(() => { if (A.vy < -1) bounced = true; }, 4);
    await until(() => A.mv === 'rec', 2000, 4); clearInterval(bw); press(ga, 'jump', false); clearInterval(pinT);
    const hostPopped = b.dead || b.state === 'pop' || !host.G.bubbles.includes(b);
    await sleep(500);
    const views = [ga, gb, gc].map((f) => goneOn(f, b.id));
    info('1: remote slam through a float (JUMP held): on screens before ' + seenBefore.join('/') + ' capy bounced ' + bounced + ' host popped ' + hostPopped + ' gone on capy/cat/otter screens ' + views.join('/'));
    ok('1: a remote capy holding JUMP while slamming does not bounce (host bounce gate); the bubble pops on the host and every screen', seenBefore.every(Boolean) && !bounced && hostPopped && views.every(Boolean), { seenBefore, bounced, hostPopped, views });
    // control: guest C's otter jumps with JUMP held and falls onto a float: it bounces, the host keeps the bubble
    // (dropped from above it with its air move spent: JUMP held is then just the bounce hold)
    const C = me(gc); stand(gc, 150, 1); await sleep(300);
    b = floatAt(150, FLOOR - 40); pinT = pin(b, 150, FLOOR - 40); await sleep(450);
    Object.assign(C, { x: 150, y: FLOOR - 130, vy: 0, vx: 0, onGround: false, airT: 20, coyote: 0, jumpBuf: 0, mvUsed: true, mv: '' });
    press(gc, 'jump', true);
    let cb = false; const cw = setInterval(() => { if (C.vy < -3.5 && C.y < FLOOR - 40) cb = true; }, 4);
    await sleep(1200); clearInterval(cw); press(gc, 'jump', false); clearInterval(pinT);
    const kept = !b.dead && b.state === 'float';
    ok('1: control - a remote otter (not slamming) holding JUMP bounces on a float and the host keeps the bubble', cb && kept, { bounced: cb, state: b.state, dead: !!b.dead });
    await sleep(400);

    // ---- the cat's double jump: bit A seen by the capy guest (peer stream)
    let catA = 0; const w2 = setInterval(() => { const v = pOf(ga, sB); if (v && v.mvA) catA++; }, 8);
    const Bc = me(gb); stand(gb, 60, 1); await sleep(300);
    await tap(gb, 'jump'); await until(() => Bc.vy >= 0 && !Bc.onGround, 2000, 4); await tap(gb, 'jump');
    await sleep(500); clearInterval(w2);
    ok('1: the cat\'s double jump: bit A seen by the capy guest', catA > 0, catA);
    ok('1: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors));
    await drop(F);
  }

  // ================================================================ phase 2: co-op predictions at lat 80 / jit 30
  async function phase2() {
    const R = await room(['duck', 'capy', 'cat', 'otter'], { mode: 'coop' }, LAT, JIT);
    const { F, host } = R, [, ga, gb, gc] = F;
    if (!ok('2: co-op up at lat ' + LAT + ' / jit ' + JIT, R.up, F.map((f) => S(f).phase))) return drop(F);
    const sA = slotOf(ga), sB = slotOf(gb), sC = slotOf(gc);
    parkAll(host); host.G.stampT = 1e9; host.G.bubbles = []; host.mp.trace(true);
    // (the shooters stand at x 40; everyone else away from where those bubbles end up: a remote player's touch has some
    // slack and would pop them)
    stand(host, 220, -1); stand(gb, 200, -1); stand(gc, 180, -1);
    await sleep(1500);
    // every prediction a guest shows, kept by sid (the objects keep their path after the host's row takes over)
    const preds = (fr) => {
      const m = new Map(); let lifeMax = 0;
      const iv = setInterval(() => { for (const b of fr.G.bubbles) if (b.pred) { if (b.sid) m.set(b.sid, b); lifeMax = Math.max(lifeMax, b.life | 0); } }, 4);
      return { m, life: () => lifeMax, stop: () => clearInterval(iv) };
    };
    // the host's path of the bubble that came back with this guest's (owner slot's) sid: age -> [x, y, state, kind]
    const hostPath = (sid, owner) => {
      const m = new Map(), k1 = host.G.frame;
      for (let k = k1 - 590; k <= k1; k++) { const e = host.mp.traceAt(k); if (!e || e.k !== k) continue; for (const u of e.U) if (u[5] === sid && u[7] === owner && !m.has(u[6])) m.set(u[6], [u[1], u[2], u[4], u[3]]); }
      return m;
    };
    // the largest gap between my prediction and the host's bubble at the same age, over the host's shot phase
    const gap = (pb, hp) => {
      let d = 0, n = 0;
      for (const [a, h] of hp) { if (h[2] !== 'shot' || 2 * a + 1 >= pb.path.length) continue; n++; d = Math.max(d, Math.abs(pb.path[2 * a] - h[0]), Math.abs(pb.path[2 * a + 1] - h[1])); }
      return { d: r2(d), n };
    };
    const shotAges = (hp) => [...hp].filter(([, h]) => h[2] === 'shot').map(([a]) => a);
    const lastSid = (fr) => fr.G.bubbles.filter((b) => b.pred && b.sid).reduce((m, b) => Math.max(m, b.sid), 0);
    const giveUps = () => [ga, gb, gc].map((f) => N(f).predGiveUp | 0);
    // one guest blows once standing (or in the air: air) as animal c; its prediction against the host's row
    const blowOne = async (fr, slot, c, wait, air) => {
      setChar(F, slot, c); stand(fr, 40, 1); await sleep(300);
      const pr = preds(fr); fr.sfx.length = 0;
      if (air) { const p = me(fr); await tap(fr, 'jump'); await until(() => p.vy >= -0.3 && !p.onGround, 2000, 4); }
      await tap(fr, 'shoot', 30); await sleep(80);
      const sid = lastSid(fr);
      await sleep(wait);
      pr.stop();
      const pb = pr.m.get(sid), hp = hostPath(sid, slot), g = pb ? gap(pb, hp) : null;
      return { sid, pb, hp, g, ages: shotAges(hp).length, life: pr.life(), ty: pb && pb.ty };
    };
    const out = {};
    const g0 = giveUps();
    // the six bubbles (and the cat's air shot) predicted by guest A
    const cases = [['echo', 'duck', 2200], ['onsen', 'capy', 900], ['fan', 'otter', 900], ['icicle', 'penguin', 1100], ['yarn', 'cat', 1600], ['air', 'cat', 900, true], ['egg', 'frog', 2400]];
    let echoSfx = null;
    for (const [k, c, wait, air] of cases) {
      for (const f of F) f.sfx.length = 0;
      const r = await blowOne(ga, sA, c, wait, air);
      out[k] = { c, sid: r.sid, ty: r.ty, ages: r.ages, gap: r.g, life: r.life };
      if (k === 'air') { const ys = new Set(shotAges(r.hp).map((a) => Math.round(r.hp.get(a)[1] * 100))); out[k].yValues = ys.size; }
      if (k === 'echo') echoSfx = F.map((f) => f.sfx.filter((n) => /^b_echo/.test(n)).join(','));
    }
    // (the host plays every blower's shoot sound, n=0, as v3 did 'shoot'; the turn, n=1, is the owner's engine's alone)
    ok('2: echo: the turn sound (b_echo n=1) is the owner\'s alone; other guests hear no b_echo', /b_echo:1/.test(echoSfx[1]) && !/b_echo:1/.test(echoSfx[0]) && echoSfx[2] === '' && echoSfx[3] === '', echoSfx);
    info('2: predictions of guest A vs the host rows ' + J(out) + ' | give-ups ' + J(giveUps()) + ' splits ' + N(ga).predSplit);
    const want = { echo: 75, onsen: 20, fan: 14, icicle: 24, yarn: 55, air: 20, egg: 100 };
    for (const k of Object.keys(want)) ok('2: ' + k + ' (' + out[k].c + '): the guest\'s prediction = the host\'s bubble at every age of its shot phase (<= 1.5 px, ' + want[k] + '+ ages)', out[k].gap && out[k].gap.n >= want[k] && out[k].gap.d <= 1.5, out[k]);
    ok('2: a:1 - the airborne cat\'s shot is the base line (y constant) on the host and in its prediction', out.air.ty === 'line' && out.air.yValues === 1, out.air);
    // (a phantom burst is a prediction given up before its host row was seen leaving the shot phase: predGiveUp. At this
    // latency an egg's copy lives past 120 f by design - its row is seen leaving 104 f + the view delay later)
    ok('2: no phantom burst for any of them (no prediction given up; the echo / egg copies live until the host row takes over)',
      giveUps().join() === g0.join() && out.echo.life > 80 && out.egg.life > 104, { giveUps: giveUps(), echoLife: out.echo.life, eggLife: out.egg.life });
    // the egg cap seen on the host (4 eggs of guest A's frog: the oldest floats)
    // (on a clean floor: a chain from an older bubble within 18 px would pop hanging eggs too)
    host.G.bubbles = []; setChar(F, sA, 'frog'); stand(ga, 40, 1); await sleep(LAT * 2 + 400);
    const eggSids = [];
    for (let k = 0; k < 4; k++) { await tap(ga, 'shoot'); await sleep(60); eggSids.push(lastSid(ga)); await sleep(180); }
    await sleep(LAT * 2 + 400);
    const hostEggs = eggSids.map((s) => { const q = host.G.bubbles.find((x) => x.sid === s && x.owner === sA); return q ? q.ty + ':' + q.state : 'gone'; });
    ok('2: guest eggs: the 4th sends the oldest to float on the host (cap 3)', /^egg:float egg:shot egg:shot egg:shot$/.test(hostEggs.join(' ')), { hostEggs, eggSids, host: host.G.bubbles.filter((q) => q.owner === sA).map((q) => [q.sid, q.ty, q.state, q.age]), pl: [pOf(host, sA).char, pOf(host, sA).ep, me(ga).ep, S(host).phase] });
    await sleep(2200);

    // ---- the otter (guest C) on autofire: its own droplet rows never show on its screen; the others see them
    stand(gc, 40, 1); await sleep(300);
    const pc = preds(gc);
    let own = 0, mine = 0, seenB = 0, hostDrops = 0;
    const dw = setInterval(() => {
      for (const q of gc.G.bubbles) { if (q.owner !== sC) continue; if (q.pred && q.drop) mine++; else if (!q.pred && q.drop) own++; }
      if (gb.G.bubbles.some((q) => !q.pred && q.owner === sC && q.drop)) seenB++;
      if (host.G.bubbles.some((q) => q.owner === sC && q.drop && q.state === 'shot')) hostDrops++;
    }, 4);
    press(gc, 'shoot', true); await sleep(1600); press(gc, 'shoot', false); await sleep(600); clearInterval(dw); pc.stop();
    const cg = [...pc.m.values()].map((pb) => gap(pb, hostPath(pb.sid, sC))).filter((g) => g.n > 5);
    info('2: otter autofire: own droplet rows shown to the owner ' + own + ' (own predicted droplet samples ' + mine + ') | guest B saw droplet rows ' + seenB + 'x | host droplets ' + hostDrops + 'x | centre gaps ' + cg.map((g) => g.d).join(','));
    ok('2: otter: the owner never sees its droplets twice (no host droplet row of its own on its screen); the others see them', own === 0 && mine > 0 && seenB > 0 && hostDrops > 0, [own, mine, seenB, hostDrops]);
    ok('2: otter autofire: every fan centre prediction = the host\'s (<= 1.5 px)', cg.length >= 3 && cg.every((g) => g.d <= 1.5), cg);
    // ---- the yarn's hop ticks and the echo's turn are the owner's sounds alone
    stand(ga, 200, -1); setChar(F, sB, 'cat'); stand(gb, 30, 1); await sleep(300); gb.sfx.length = 0; ga.sfx.length = 0; host.sfx.length = 0;
    let yarnRow = 0; const yw = setInterval(() => { if (ga.G.bubbles.some((q) => !q.pred && q.owner === sB && q.yarn && q.state === 'shot')) yarnRow++; }, 8);
    await tap(gb, 'shoot'); await sleep(1600); clearInterval(yw);
    ok('2: yarn: bubble bit 32 reaches another guest; the hop ticks are the owner\'s alone', yarnRow > 0 && gb.sfx.filter((n) => n === 'b_yarn:1').length === 3 && !ga.sfx.some((n) => /^b_yarn:1/.test(n)) && !host.sfx.some((n) => /^b_yarn:1/.test(n)), [yarnRow, gb.sfx.join(','), ga.sfx.join(','), host.sfx.join(',')]);

    // ---- snapshot budget: 4 frogs full of eggs, 4 otters, 4 ducks on autofire (all on the floor, facing right)
    const SN = () => N(host).snap;
    const burst = async (ch) => {
      host.G.bubbles = [];
      for (const s of [0, sA, sB, sC]) setChar(F, s, ch);
      // (in two pairs blowing toward each other: no one stands where another's bubbles end up)
      stand(host, 16, 1); stand(ga, 120, -1); stand(gb, 136, 1); stand(gc, 224, -1); await sleep(400);
      const t0 = SN().trims;
      let rows = 0; const rw = setInterval(() => { rows = Math.max(rows, host.G.bubbles.length); }, 8);
      for (const f of F) press(f, 'shoot', true);
      await sleep(4000);
      for (const f of F) press(f, 'shoot', false);
      clearInterval(rw); await sleep(300);
      return { max: SN().max, trims: SN().trims - t0, rows, eggs: host.G.bubbles.filter((q) => q.ty === 'egg' && q.state === 'shot').length };
    };
    const fr4 = await burst('frog'), ot4 = await burst('otter'), du4 = await burst('duck');
    info('2: snapshots (max bytes, trims, most bubbles at once, eggs hanging at the end): 4 frogs ' + J(fr4) + ' | 4 otters ' + J(ot4) + ' | 4 ducks ' + J(du4));
    ok('2: snapMax <= 3400 with 4 frogs full of eggs, 4 otters and 4 ducks on autofire', fr4.max <= 3400 && ot4.max <= 3400 && du4.max <= 3400 && fr4.rows >= 15 && ot4.rows >= 15 && du4.rows >= 15 && fr4.eggs >= 4, [fr4, ot4, du4]);
    ok('2: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors));
    host.mp.trace(false);
    await drop(F);
  }

  // ================================================================ phase 3: battle at lat 80 / jit 30
  async function phase3() {
    const R = await room(['capy', 'penguin', 'duck', 'otter'], { mode: 'battle', arena: 0, time: 5, perks: true, intrusion: false }, LAT, JIT);
    const { F, host } = R, [, ga, gb, gc] = F;
    if (!ok('3: battle up at lat ' + LAT + ' / jit ' + JIT + ' (host capy, guests penguin / duck / otter)', R.up, F.map((f) => S(f).phase))) return drop(F);
    const sA = slotOf(ga), sB = slotOf(gb), sC = slotOf(gc);
    host.G.battle.enemyT = 1e9; host.G.battle.powerT = 1e9;
    parkAll(host);
    await sleep(2200); // (past the spawn blink)
    // ---- every screen draws each bubble with its blower's animal (owner -> animal on views, k on the host / predictions)
    // (lanes nobody else stands in - blowing ends a player's blink, so a rival in a lane would be caught: host capy at 20
    // (its bubble covers x 31-112), guest B's duck at 216 (the echo 134-226), guest C's otter between them at 124 (a
    // remote player's touch has some slack: clear of the capy's float), blowing at the top of a jump (its fan flies above
    // everyone's head); guest A, not blowing, keeps its blink)
    stand(host, 20, 1); stand(ga, 60, 1); stand(gb, 216, -1); stand(gc, 124, 1);
    await sleep(LAT * 2 + 300);
    for (const p of host.G.players) p.invuln = 600;
    // (each screen sampled through the whole window - the host runs ahead of the views, so they show the three bubbles
    // at different moments: per screen, every look seen per owner, and its own predictions marked)
    const want = { 0: 'capy' }; want[sB] = 'duck'; want[sC] = 'otter';
    const L = F.map(() => ({}));
    const lw = setInterval(() => F.forEach((fr, i) => { for (const q of fr.G.bubbles) if (q.kind === 'empty' && !q.dead && q.owner in want) { const k = q.owner + (q.pred ? 'p' : ''); (L[i][k] = L[i][k] || new Set()).add(String(fr.D.bubbleLook(q))); } }), 15);
    await tap(host, 'shoot'); await tap(gb, 'shoot');
    const O = me(gc); await tap(gc, 'jump'); await until(() => O.vy >= -0.3 && !O.onGround, 2000, 4); await tap(gc, 'shoot', 30);
    await sleep(LAT * 4 + 650); clearInterval(lw);
    const Lo = L.map((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v].join('/')])));
    info('3: bubble looks per screen (owner [p = my prediction]: every look it was drawn with) ' + J(Lo));
    ok('3: every screen draws each blower\'s bubble with its animal, and only that (capy / duck / otter)',
      Lo.every((m) => [0, sB, sC].every((s) => m[s] === want[s] || m[s + 'p'] === want[s]) && Object.entries(m).every(([k, v]) => v === want[parseInt(k, 10)])), Lo);
    for (const p of host.G.players) p.invuln = 0;
    host.G.bubbles = [];
    await sleep(800);

    // ---- a guest's stun mid-move ends the move on its own engine: guest A's penguin slides into a still enemy
    const e = host.G.enemies.find((q) => q.type !== 'fly') || host.G.enemies[0];
    const pinE = setInterval(() => { still(e, 150, FLOOR, 'mold'); }, 4);
    const P = me(ga);
    stand(ga, 30, 1); await sleep(LAT * 2 + 500);
    ga.D.setInvincible(false); P.invuln = 0; P.stunT = 0;
    let atStun = null;
    const ss = sampler(ga, () => { if (atStun && !atStun.next) atStun.next = { mv: P.mv, A: !!P.mvA, B: !!P.mvB }; if (!atStun && P.stunT > 0) atStun = { mv: P.mv, x: Math.round(P.x) }; });
    let sliding = false; const sw = sampler(ga, () => { if (P.mv === 'slide') sliding = true; });
    press(ga, 'right', true); await tap(ga, 'jump'); await until(() => P.vy >= 0 && !P.onGround, 2000, 4); await tap(ga, 'jump');
    const tl = []; const tli = setInterval(() => tl.push([Math.round(P.x), Math.round(P.y), P.mv, P.onGround ? 1 : 0, N(ga).ctl, P.stunT, P.invuln, !!P.trap].join(',')), 100);
    await until(() => atStun && atStun.next, 3000, 5); clearInterval(tli);
    press(ga, 'right', false); ss(); sw(); clearInterval(pinE);
    await sleep(100);
    info('3: guest penguin into an enemy: slid ' + sliding + ' at the stun ' + J(atStun) + ' now mv "' + P.mv + '" stunT ' + P.stunT + ' | enemy ' + J([e.type, e.state, Math.round(e.x), Math.round(e.y)]) + ' view ' + J(ga.G.enemies.filter((q) => q.state === 'active').map((q) => [q.type, Math.round(q.x), Math.round(q.y)])) + ' trace ' + tl.join(' '));
    ok('3: a stun mid-move ends it on the guest (its slide stops at the hit: mv \'\', that frame, bits off the next)', sliding && atStun && atStun.mv === '' && atStun.next.mv === '' && !atStun.next.A && !atStun.next.B, atStun);
    ga.D.setInvincible(true); parkAll(host);
    await sleep(1800);

    // ---- a v3 body state is ignored (version mismatch) by the host and by other guests; the same as v4 is taken
    const G3 = me(gc), H3 = pOf(host, sC);
    stand(gc, 120, 1); await sleep(LAT * 2 + 400);
    gc.G.manual = true; await sleep(300);    // (guest C's engine pauses: no body states of its own meanwhile)
    const k0 = gc.G.frame + 200;
    const body = (v, x, k) => ({ v, k, gid: N(gc).gid, ep: G3.ep, x, y: G3.y, vx: 0, vy: 0, f: 1, fl: 1, sh: 0, bb: [], ny: 0, rt: 0 });
    const hx0 = H3.x, bx0 = pOf(gb, sC).x;
    for (let i = 0; i < 6; i++) { gc.mp.session().setState(body(3, 200, k0 + i * 2)); await sleep(40); }
    await sleep(LAT * 2 + 400);
    const hx3 = H3.x, bx3 = pOf(gb, sC).x;
    for (let i = 0; i < 6; i++) { gc.mp.session().setState(body(4, 200, k0 + 40 + i * 2)); await sleep(40); }
    await sleep(LAT * 2 + 500);
    const hx4 = H3.x, bx4 = pOf(gb, sC).x;
    gc.G.manual = false; await sleep(600);
    info('3: v3 body x 200: host ' + r2(hx0) + ' -> ' + r2(hx3) + ', guest B view ' + r2(bx0) + ' -> ' + r2(bx3) + ' | the same as v4: host ' + r2(hx4) + ', guest B ' + r2(bx4));
    ok('3: NET_V 4 - a v3 body state is ignored by the host and by another guest (the same state as v4 is taken)', Math.abs(hx3 - hx0) < 1 && Math.abs(bx3 - bx0) < 1 && Math.abs(hx4 - 200) < 1 && Math.abs(bx4 - 200) < 3, [hx0, hx3, hx4, bx0, bx3, bx4]);
    stand(gc, 120, 1); await sleep(600);

    // ---- snapshot size: a mixed 4P battle on autofire with the boss intruding
    host.D.intrude();
    const boss = await until(() => host.G.boss && host.G.boss.state === 'fight', 6000, 30);
    stand(host, 30, 1); stand(ga, 80, 1); stand(gb, 140, -1); stand(gc, 200, -1);
    const iv = setInterval(() => { for (const p of host.G.players) p.invuln = 600; }, 30);
    const t0 = N(host).snap.trims, m0 = N(host).snap.max;
    let rows = 0; const rw = setInterval(() => { rows = Math.max(rows, host.G.bubbles.length); }, 8);
    for (const f of F) press(f, 'shoot', true);
    await sleep(5000);
    for (const f of F) press(f, 'shoot', false);
    clearInterval(rw); clearInterval(iv);
    const sn = N(host).snap;
    info('3: mixed 4P battle + boss (' + (host.G.boss && host.G.boss.type) + ', fight ' + !!boss + '): snapMax ' + sn.max + ' (before ' + m0 + ') trims ' + (sn.trims - t0) + ' max rows ' + rows + ' bytes now ' + sn.bytes);
    // (rows >= 10, not 15: since the multiplayer bubble caps - EMPTY_RULE battle: 6 floating a player, 12 in all - a
    // battle never holds 15 at once; 10 still means every seat is blowing and the boss is in)
    ok('3: snapMax <= 3400 in a mixed 4P battle on autofire with the boss intruding', !!boss && sn.max <= 3400 && rows >= 10, { max: sn.max, rows, boss: !!boss });
    ok('3: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors));
    await drop(F);
  }

  // ================================================================ phase 4: battle with 능력 끄기
  async function phase4() {
    const R = await room(['duck', 'capy', 'cat'], { mode: 'battle', arena: 0, time: 5, perks: false, intrusion: false }, LAT, JIT);
    const { F, host } = R, [, ga, gb] = F;
    if (!ok('4: battle with 능력 끄기 up (host duck, guests capy / cat)', R.up && host.G.perksOff && ga.G.perksOff, F.map((f) => [S(f).phase, f.G.perksOff])))
      return drop(F);
    const sA = slotOf(ga), sB = slotOf(gb);
    host.G.battle.enemyT = 1e9; host.G.battle.powerT = 1e9; parkAll(host);
    await sleep(2200);
    // guest A's page keeps its perks on (a modified client): it slams, sends qk and A bits, dips for a shield
    ga.G.perksOff = false;
    const A = me(ga), H = pOf(host, sA);
    let hostBits = 0, viewBits = 0;
    const bw = setInterval(() => { if (H.mvA || H.mvB) hostBits++; const v = pOf(gb, sA); if (v && (v.mvA || v.mvB)) viewBits++; }, 8);
    stand(ga, 60, 1); await sleep(LAT * 2 + 400);
    const e = host.G.enemies.find((q) => q.type !== 'fly') || host.G.enemies[0];
    await tap(ga, 'jump'); await until(() => A.vy >= 0 && !A.onGround, 2000, 4);
    still(e, H.x + 24, FLOOR);
    await tap(ga, 'jump');
    const slam = await until(() => A.mv === 'rec', 2000, 4);
    await sleep(LAT * 2 + 400);
    const soak = e.soakT;
    Object.assign(A, { x: 196, y: POOL_Y - 30, vy: 0, vx: 0, onGround: false, airT: 20, mvUsed: true });
    await until(() => A.water === 1 && A.shield > 0, 3000, 8); await sleep(LAT * 2 + 300);
    const shLocal = A.shield, shHost = H.shield;
    clearInterval(bw); parkAll(host);
    info('4: modified capy client: slammed ' + !!slam + ' host soak ' + soak + ' | shield own page ' + shLocal + ' host ' + shHost + ' | bits seen: host ' + hostBits + ' guest B ' + viewBits);
    ok('4: 능력 끄기 - a qk from a capy page that kept its perks is refused (no soak)', !!slam && soak === 0, soak);
    ok('4: 능력 끄기 - its shield report is ignored by the host', shLocal > 0 && shHost === 0, [shLocal, shHost]);
    ok('4: 능력 끄기 - its body bits A / B never show on the host or another guest', hostBits === 0 && viewBits === 0, [hostBits, viewBits]);
    ga.G.perksOff = true; stand(ga, 60, 1);
    // every bubble plain on every screen; the cat's a:1 changes nothing (the base bubble either way)
    // (near the side walls, blowing toward the middle: host at 20, guest A at 216, guest B's cat jumps at 40 and blows)
    stand(host, 20, 1); stand(ga, 216, -1); stand(gb, 40, 1); await sleep(LAT * 2 + 300);
    for (const p of host.G.players) p.invuln = 600;
    await tap(host, 'shoot'); await tap(ga, 'shoot');
    const Bc = me(gb); await tap(gb, 'jump'); await until(() => Bc.vy >= -0.3 && !Bc.onGround, 2000, 4); await tap(gb, 'shoot', 30);
    await sleep(LAT * 4 + 450);
    const rows = host.G.bubbles.filter((q) => q.kind === 'empty' && q.owner >= 0).map((q) => [q.owner, q.ty, q.r, q.rP, q.k]);
    const L = F.map((fr) => fr.G.bubbles.filter((q) => q.kind === 'empty' && !q.dead && q.owner >= 0).map((q) => fr.D.bubbleLook(q)));
    info('4: host bubbles (owner, ty, r, rP, k) ' + J(rows) + ' | looks per screen ' + J(L));
    ok('4: 능력 끄기 - every bubble (the airborne cat\'s a:1 shot too) is the base line r 8 / rP 8 on the host', rows.length >= 3 && rows.every((q) => q[1] === 'line' && q[2] === 8 && q[3] === 8), rows);
    ok('4: 능력 끄기 - every screen draws every bubble with the plain look', L.every((l) => l.length >= 3 && l.every((v) => v === null)), L);
    for (const p of host.G.players) p.invuln = 0;
    ok('4: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors));
    await drop(F);
  }

  // a phase on fresh frames; once more (fresh frames again) when it failed while the harness stalled (STALL above) -
  // the second attempt counts whatever happens. Page errors and driver exceptions are never taken back
  async function runPhase(n, fn) {
    for (let a = 1; ; a++) {
      att = { pass: 0, fail: [] }; STALL.sent.clear();
      const mark = STALL.list.length;
      let ex = null;
      try { await fn(); } catch (e) { ex = e; }
      const A = att, st = STALL.list.slice(mark);
      att = null;
      if (!ex && A.fail.length && st.length && a < 2) {
        info('phase ' + n + ' attempt ' + a + ' NOT COUNTED: it failed (' + A.fail.join(' | ').slice(0, 400) + ') while the harness stalled - state deliveries over 150 ms [ms, from frame, to frame, delay] ' + J(st.slice(0, 8)) + '; the phase runs again on fresh frames');
        continue;
      }
      pass += A.pass; fail += A.fail.length;
      if (st.length) info('phase ' + n + ': the harness stalled with no failure from it ' + J(st.slice(0, 8)));
      if (ex) throw ex;
      return;
    }
  }
  async function main() {
    try {
      if (ONLY.includes('1')) await runPhase(1, phase1);
      if (ONLY.includes('2')) await runPhase(2, phase2);
      if (ONLY.includes('3')) await runPhase(3, phase3);
      if (ONLY.includes('4')) await runPhase(4, phase4);
    } catch (e) { fail++; log('KITSNET FAIL driver exception ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); }
    log('KITSNET DONE pass=' + pass + ' fail=' + fail);
  }
  setTimeout(main, 100);
})();
