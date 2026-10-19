// Review (guest-side feel): 2 same-origin iframes of preview.html on PG.Net's 'bc' transport with a simulated link,
// sampled every display frame INSIDE each iframe (a rAF registered after the engine's). Not part of run-all.
//   node tools/serve.js   (http://localhost:8765, root C:/Temp/bogeul)
//   node tools/run-chrome.js "http://localhost:8765/test-review-mpfeel.html?only=smooth,fair" - 1200 900 rt600000 "FEEL DONE"
// ?link=lat=25%26jit=30%26drop=0.025 (per page; the default = one-way 50-110 ms, ~5 % state loss end to end)
// Phases: smooth (co-op: input -> own movement on the guest, host world sees it after; remote player + enemies on the guest's
//   screen: per-frame step jitter, stalls, error vs the host's real world at the same tick),
//   fair (battle 1v1: the same scripted shooter / dodger on each side; per side: shots, traps, traps the victim never saw
//   touch it on its own screen, dodges that worked on screen but were trapped anyway)
// Prints "FEEL METRIC <name> <json>" and "FEEL DONE".
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const LINK = Q.get('link') || 'lat=25&jit=30&drop=0.025';
  const ONLY = (Q.get('only') || 'smooth,fair').split(',').filter(Boolean);
  const FAIR_S = +(Q.get('fair') || 90);
  const log = (s) => console.log(s);
  const metric = (name, v) => log('FEEL METRIC ' + name + ' ' + JSON.stringify(v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clock = () => performance.now();
  async function until(pred, ms, step) {
    const t0 = clock();
    for (;;) { let v = false; try { v = pred(); } catch (e) { v = false; } if (v) return v; if (clock() - t0 > ms) return false; await sleep(step || 30); }
  }
  try { PG.debug.G.manual = true; } catch (e) { /* ignore */ }
  document.body.style.background = '#061518';
  const frames = [];
  function frame(i) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'preview.html?net=bc&' + LINK + '&frame=' + i;
      f.style.cssText = 'position:fixed;left:' + (i * 600) + 'px;top:0;width:600px;height:450px;border:0;background:#0a2327';
      const t = setTimeout(() => reject(new Error('frame ' + i + ' did not load')), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        const okp = await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.Net, 15000);
        clearTimeout(t);
        if (!okp) { reject(new Error('no PG.debug.mp')); return; }
        const fr = { i, el: f, w, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G };
        w.addEventListener('error', (e) => log('FEEL frame ' + i + ' page error: ' + e.message));
        frames.push(fr); resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  function dropAll() { for (const fr of frames.splice(0)) { try { fr.mp.leave(); } catch (e) { /* ignore */ } fr.el.remove(); } }
  const S = (fr) => fr.D.getState();
  const N = (fr) => fr.mp.state();
  const slotOf = (fr) => N(fr).mySlot;
  const meOf = (fr) => fr.G.players.find((p) => p.slot === slotOf(fr));
  const press = (fr, a, down) => fr.D.press(a, down, slotOf(fr));
  function parkAll(host) { for (const e of host.G.enemies) { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; } }
  async function room(n, mode, opts, chars) {
    const F = [];
    for (let i = 0; i < n; i++) F.push(await frame(frames.length));
    const host = F[0];
    const code = await host.mp.host(Object.assign({ mode, nick: '방장', char: chars[0] }, opts || {}));
    for (let i = 1; i < n; i++) await F[i].mp.join(code, { nick: '손님' + i, char: chars[i] });
    await until(() => N(host).roster.length === n && F.slice(1).every((f) => N(f).roster.length === n), 6000);
    for (const f of F.slice(1)) f.mp.ready(true);
    await until(() => N(host).canStart, 6000);
    host.mp.start();
    const ok = await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online), 12000);
    return { F, host, ok };
  }
  // every display frame, after the engine's own frame
  function sampler(fr, fn) { let on = true; const w = fr.w; const s = () => { if (!on) return; try { fn(); } catch (e) { log('FEEL sampler error ' + e.message); on = false; return; } w.requestAnimationFrame(s); }; w.requestAnimationFrame(s); return () => { on = false; }; }
  const pct = (a, q) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);

  // ================================================================ smooth
  async function smooth() {
    const { F, host, ok } = await room(2, 'coop', {}, ['duck', 'cat']);
    if (!ok) { log('FEEL smooth: room did not start'); return dropAll(); }
    const g = F[1];
    host.D.setInvincible(true); g.D.setInvincible(true);
    parkAll(host);
    host.mp.trace(true);
    await sleep(2600);
    // 1. input -> own movement: guest presses right (standing still before); frames until its own x moves, and
    //    ms until the host's world has it moving
    const resp = [], hostSees = [];
    for (let k = 0; k < 8; k++) {
      press(g, 'right', false); press(g, 'left', false);
      await sleep(400);
      const me = meOf(g), hp = host.G.players.find((p) => p.slot === slotOf(g));
      const x0 = me.x, f0 = g.G.frame, hx0 = hp.x, t0 = clock();
      press(g, k % 2 ? 'left' : 'right', true);
      const fr = await until(() => (Math.abs(meOf(g).x - x0) > 0.01 ? g.G.frame - f0 : 0), 1000, 4);
      const hs = await until(() => (Math.abs(hp.x - hx0) > 0.01 ? clock() - t0 : 0), 2000, 4);
      resp.push(fr); hostSees.push(Math.round(hs));
      await sleep(250);
      press(g, k % 2 ? 'left' : 'right', false);
    }
    metric('smooth.own_input_to_move_frames', resp);
    metric('smooth.host_world_sees_guest_move_ms', { values: hostSees, median: pct(hostSees, 0.5) });
    // 2. the host walks back and forth; enemies walk too (let them in): sample on the guest's screen
    for (const e of host.G.enemies) { e.delay = 0; e.t = 0; e.startY = e.spawnY - 40; }
    const hostP = () => g.G.players.find((p) => p.slot === 0);
    const rec = [];
    const stop = sampler(g, () => {
      const v = g.mp.view(), rt = Math.round(N(g).renderTick || 0), tr = host.mp.traceAt(rt), hp = hostP();
      rec.push({ f: g.G.frame, rt, hx: hp.x, hy: hp.y, tx: tr ? (tr.P.find((q) => q[0] === 0) || [])[1] : null, dk: tr ? Math.abs(tr.k - rt) : 99,
        E: v.enemies.filter((e) => e.state === 'active').map((e) => [e.id, e.x, e.y]), TE: tr ? tr.E.filter((e) => e[3] === 'active').map((e) => [e[0], e[1], e[2]]) : [] });
    });
    for (let k = 0; k < 10; k++) {
      host.D.press('right', k % 2 === 0, 0); host.D.press('left', k % 2 === 1, 0);
      await sleep(900);
    }
    host.D.press('right', false, 0); host.D.press('left', false, 0);
    stop();
    // remote player on the guest's screen: step per display frame while the host walks (|step| expected ~1.25)
    const steps = [], errs = [];
    for (let i = 1; i < rec.length; i++) {
      const a = rec[i - 1], b = rec[i];
      if (b.f === a.f) continue;
      const df = b.f - a.f, dx = (b.hx - a.hx) / df;
      steps.push(Math.abs(dx));
      if (b.tx !== null && b.tx !== undefined && b.dk <= 1) errs.push(Math.abs(b.hx - b.tx));
    }
    const moving = steps.filter((s) => s > 0.05);
    metric('smooth.remote_player_steps', { frames: steps.length, stall_frac: r2(steps.filter((s) => s <= 0.05).length / Math.max(1, steps.length)),
      median: r2(pct(moving, 0.5)), p05: r2(pct(moving, 0.05)), p95: r2(pct(moving, 0.95)), max: r2(pct(moving, 1)), err_vs_host_at_renderTick_px: { median: r2(pct(errs, 0.5)), p95: r2(pct(errs, 0.95)), max: r2(pct(errs, 1)) } });
    // enemies: per id step jitter and error vs the host at the same tick
    const eSteps = [], eErr = [];
    for (let i = 1; i < rec.length; i++) {
      const a = rec[i - 1], b = rec[i]; if (b.f === a.f) continue;
      const am = new Map(a.E.map((e) => [e[0], e])), tm = new Map(b.TE.map((e) => [e[0], e]));
      for (const e of b.E) { const p = am.get(e[0]); if (p && Math.abs(e[2] - p[2]) < 1) eSteps.push(Math.abs(e[1] - p[1]) / (b.f - a.f)); const t = tm.get(e[0]); if (t && b.dk <= 1) eErr.push(Math.hypot(t[1] - e[1], t[2] - e[2])); }
    }
    const eMov = eSteps.filter((s) => s > 0.05);
    metric('smooth.enemy_steps_ground', { samples: eSteps.length, stall_frac: r2(eSteps.filter((s) => s <= 0.05).length / Math.max(1, eSteps.length)), median: r2(pct(eMov, 0.5)), p95: r2(pct(eMov, 0.95)), max: r2(pct(eMov, 1)),
      err_vs_host_px: { median: r2(pct(eErr, 0.5)), p95: r2(pct(eErr, 0.95)), max: r2(pct(eErr, 1)) } });
    const st = N(g);
    metric('smooth.guest_view', { starved_frac: r2(st.starvedFrames / Math.max(1, st.viewFrames)), rtt: st.stats && st.stats.rttMs, renderBehindNewest: st.newestTick - st.renderTick });
    host.mp.trace(false);
    dropAll();
    await sleep(800);
  }

  // ================================================================ fair
  // (arena 0, bottom floor left of the drain: shooter at x 20, target pacing x 48-80)
  // One side shoots (stands at x 20 facing right, fires when its OWN screen shows the target 30-70 px ahead on its
  // floor); the other walks back and forth (x 96-176) and jumps when its OWN screen shows an opponent capture bubble
  // within `react` px ahead and closing (an instant-reflex human). Then the roles swap.
  async function fair() {
    const { F, host, ok } = await room(2, 'battle', { arena: 0, time: 5, intrusion: false, perks: false }, ['duck', 'duck']);
    if (!ok) { log('FEEL fair: room did not start'); return dropAll(); }
    const g = F[1];
    parkAll(host); host.G.battle.enemyT = 1e9; host.G.battle.powerT = 1e9;
    host.D.setInvincible(true); g.D.setInvincible(true);
    const floorY = 200;
    async function side(shooter, target, secs) {
      const ts = slotOf(target), ss = slotOf(shooter);
      const hostT = () => host.G.players.find((p) => p.slot === ts);
      const res = { shots: 0, traps: 0, hostTraps: 0, phantom: 0, dodgedOnScreen: 0, sawTouch: 0, jumps: 0, yank: [] };
      // put both on the floor (each moves its own animal: a guest's own spot is local to the guest)
      shooter.D.setPlayer(20, floorY, ss); target.D.setPlayer(64, floorY, ts);
      host.G.players.forEach((p) => { p.invuln = 0; });
      await sleep(1500);
      let dir = 1, lastShot = -999, jumpT = -999, was = false;
      const tl = [];  // the target's own screen, per display frame: [frame, myX, myY, [[bx,by]...]]
      const seen = new Set();
      const stopT = sampler(target, () => {
        const me = meOf(target); if (!me) return;
        const trapped = !!me.trap;
        if (trapped && !was) {
          // I just learned (on my screen) that I am trapped: did an opponent bubble touch me on MY screen in the last 0.75 s?
          res.traps++;
          const recent = tl.slice(-45);
          let touched = false;
          for (const [, mx, my, bs] of recent) for (const [bx, by] of bs) { const cx = bx + 8, cy = by + 8, nx = Math.max(mx + 2, Math.min(cx, mx + 14)), ny = Math.max(my + 2, Math.min(cy, my + 16)); if ((cx - nx) ** 2 + (cy - ny) ** 2 < 64) touched = true; }
          if (touched) res.sawTouch++; else res.phantom++;
          if (!touched && recent.some((r) => r[2] < floorY - 6)) res.dodgedOnScreen++;
          const last = tl[tl.length - 1];
          if (last) res.yank.push(Math.round(Math.hypot(me.x - last[1], me.y - last[2])));
        }
        was = trapped;
        if (!trapped) {
          if (me.x > 80) dir = -1; else if (me.x < 48) dir = 1;
          press(target, 'right', dir > 0); press(target, 'left', dir < 0);
        } else { press(target, 'right', false); press(target, 'left', false); }
        const bs = [];
        for (const q of target.G.bubbles) {
          if (q.dead || q.kind !== 'empty' || q.owner !== ss) continue;
          bs.push([q.x, q.y]);
          if (!trapped && q.state === 'shot' && me.onGround && target.G.frame - jumpT > 30) {
            const dx = q.x + 8 - (me.x + 8);
            if (Math.abs(q.y + 8 - (me.y + 8)) < 14 && dx < 0 && dx > -40) { press(target, 'jump', true); jumpT = target.G.frame; res.jumps++; }
          }
        }
        if (target.G.frame - jumpT > 2) press(target, 'jump', false);
        if (trapped && target.G.frame % 5 === 0) press(target, 'shoot', true); else press(target, 'shoot', false);
        tl.push([target.G.frame, me.x, me.y, bs]);
        if (tl.length > 400) tl.shift();
      });
      const stopS = sampler(shooter, () => {
        const me = meOf(shooter); if (!me) return;
        me.facing = 1;
        const tp = shooter.G.players.find((p) => p.slot === ts); if (!tp) return;
        const dx = tp.x - me.x;
        const shootNow = !tp.trap && !(tp.koT > 0) && !(tp.invuln > 0) && Math.abs(tp.y - me.y) < 6 && dx > 30 && dx < 70 && shooter.G.frame - lastShot > 50;
        press(shooter, 'shoot', shootNow);
        if (shootNow) { lastShot = shooter.G.frame; res.shots++; }
        press(shooter, 'right', false); press(shooter, 'left', false);
      });
      const stopH = sampler(host, () => { const v = hostT(); if (v && v.trap && !seen.has(v.trap)) { seen.add(v.trap); res.hostTraps++; } });
      await sleep(secs * 1000);
      stopT(); stopS(); stopH();
      for (const a of ['left', 'right', 'jump', 'shoot']) { press(target, a, false); press(shooter, a, false); }
      await sleep(2500);
      return res;
    }
    const half = Math.round(FAIR_S / 2);
    const hostShoots = await side(host, g, half);
    metric('fair.host_shoots_guest_dodges', Object.assign(hostShoots, { trap_rate: r2(hostShoots.hostTraps / Math.max(1, hostShoots.shots)), yank: { median: pct(hostShoots.yank, 0.5), max: pct(hostShoots.yank, 1) } }));
    const guestShoots = await side(g, host, half);
    metric('fair.guest_shoots_host_dodges', Object.assign(guestShoots, { trap_rate: r2(guestShoots.hostTraps / Math.max(1, guestShoots.shots)), yank: { median: pct(guestShoots.yank, 0.5), max: pct(guestShoots.yank, 1) } }));
    metric('fair.link', { link: LINK, rtt: (N(g).stats || {}).rttMs });
    dropAll();
    await sleep(800);
  }

  async function main() {
    try {
      if (ONLY.includes('smooth')) await smooth();
      if (ONLY.includes('fair')) await fair();
    } catch (e) { log('FEEL ERROR ' + e.message + ' ' + String(e.stack || '').split('\n').slice(0, 3).join(' | ')); }
    log('FEEL DONE');
  }
  setTimeout(main, 100);
})();
