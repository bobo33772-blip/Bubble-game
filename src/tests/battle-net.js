// Battle catches + the shot cap ONLINE, in real time: same-origin iframes of preview.html on PG.Net's 'bc' transport
// at lat=60&jit=0 per page (applied on both ends: ~120 ms one way, a phone on TURN), built to test-battle-net.html:
//   node tools/run-chrome.js http://localhost:8775/test-battle-net.html - 1200 900 rt300000 "BNET DONE"
// A hit that looks like a hit on the SHOOTER's screen is a hit (design: lag-compensated catches, game.js lagClaims):
//   gh   guest -> host: the host jumps as the guest blows; on the guest's screen the bubble reaches the host still on
//        the ground (its view runs ~0.25 s behind) -> caught, though in the host's own time it was already in the air
//   gm   guest -> host, a clear miss: the guest blows only once its screen shows the host high in the air -> never
//        touches there -> not caught (the old rule judged the victim's own time: it could catch after the landing)
//   gg   guest -> guest (the victim drawn from its own body stream): as gh
//   hg   host -> guest (the guest drawn from its interpolated stream on the host): as gh
//   old  an older guest page (no lc in its states, no 'tp'): its shot still catches a host player standing still
//   cap  (perks on, a duck guest tapping for 3 s, the magazine off on both pages: the backstop alone) at most 3 of its
//        bubbles out in all (in flight + floating) on the host, every press past 3 popped its oldest there (no refusal,
//        never a 'dry' on the guest), the guest's own screen back to <= 3 once the pops have arrived
//   ammo (perks on, a duck guest: 3 blows, reload 2.2 s - game.js AMMO) 3 presses blow 3 on the guest and the host; a
//        4th is a dry 칙 on the guest and never reaches the host; after the reload the next press blows on both (the
//        host refuses nothing); the guest's count matches the host's; the guest's HUD has the host's magazine from the
//        snapshot. An older guest page (no magazine: AMMO off there) fires freely - the host refuses its blows past the
//        magazine, its copies just give up; an older host (AMMO off there: no g.am) - its guest fires freely, no 칙
// Prints "BNET PASS|FAIL <name>", "BNET METRIC <name> <json>", "BNET DONE pass=N fail=M".
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const LINK = Q.get('link') || 'lat=60&jit=0';
  const ONLY = (Q.get('only') || '').split(',').filter(Boolean);
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => { if (cond) { pass++; log('BNET PASS ' + name); } else { fail++; log('BNET FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); } return !!cond; };
  const metric = (name, v) => log('BNET METRIC ' + name + ' ' + JSON.stringify(v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const now = () => performance.now();
  async function until(pred, ms) { const t0 = now(); for (;;) { let v = false; try { v = pred(); } catch (e) { v = false; } if (v) return v; if (now() - t0 > ms) return false; await sleep(15); } }
  try { PG.debug.G.manual = true; } catch (e) { /* ignore */ }
  let frames = [];
  function frame(i) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'preview.html?net=bc&' + LINK + '&frame=' + i;
      f.style.cssText = 'position:fixed;left:' + (i % 2) * 600 + 'px;top:' + (i >> 1) * 450 + 'px;width:600px;height:450px;border:0';
      const t = setTimeout(() => reject(new Error('frame ' + i + ' did not load')), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        if (!(await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.Net, 15000))) { reject(new Error('no PG.debug.mp')); return; }
        clearTimeout(t);
        const fr = { i, el: f, w, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, errors: [], sfx: [] };
        w.addEventListener('error', (e) => { fr.errors.push(e.message); log('BNET frame ' + i + ' page error: ' + e.message); });
        const A = w.PG.Audio;
        if (A && typeof A.sfx === 'function') { const o = A.sfx; A.sfx = function (n) { fr.sfx.push(n); return o.apply(A, arguments); }; }
        frames.push(fr); resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  function dropAll() { for (const fr of frames) { try { fr.mp.leave(); } catch (e) { /* ignore */ } fr.el.remove(); } frames = []; }
  const N = (fr) => fr.mp.state();
  const S = (fr) => fr.D.getState();
  const slotOf = (fr) => N(fr).mySlot;
  const P = (fr, slot) => fr.G.players.find((p) => p.slot === slot);
  const me = (fr) => P(fr, slotOf(fr));
  const press = (fr, a, down) => fr.D.press(a, down, slotOf(fr));
  async function room(n, opts, chars) {
    const F = [];
    for (let i = 0; i < n; i++) F.push(await frame(frames.length));
    const H = F[0];
    const code = await H.mp.host(Object.assign({ mode: 'battle', nick: '방장', char: chars[0], arena: 0, time: 5, intrusion: false }, opts));
    for (let i = 1; i < n; i++) await F[i].mp.join(code, { nick: '친구' + i, char: chars[i] });
    await until(() => N(H).roster.length === n, 8000);
    for (const f of F.slice(1)) f.mp.ready(true);
    await until(() => N(H).canStart, 8000);
    H.mp.start();
    return { F, H, playing: !!(await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online), 20000)) };
  }
  const FLOOR = 200;
  function hold(H) {
    for (const e of H.G.enemies) { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; }
    if (H.G.battle) { H.G.battle.enemyT = 1e9; H.G.battle.powerT = 1e9; }
    H.G.bubbles = H.G.bubbles.filter((b) => b.kind !== 'empty');
  }
  // everyone free, still, at x (by frame), facing f; settled on every screen
  async function place(F, H, xs, fs) {
    for (const fr of F) for (const a of ['left', 'right', 'jump', 'shoot']) press(fr, a, false);
    // (a trapped one mashes out first)
    await until(() => { hold(H); let busy = false; for (const fr of F) { const p = P(H, slotOf(fr)); if (p && (p.trap || p.koT > 0 || p.dead)) { busy = true; press(fr, 'jump', !(fr.G.frame & 4)); } } return !busy; }, 9000);
    for (const fr of F) press(fr, 'jump', false);
    for (let k = 0; k < 45; k++) {
      hold(H);
      F.forEach((fr, i) => { if (xs[i] === null) return; fr.D.setPlayer(xs[i], FLOOR, slotOf(fr)); const p = me(fr); if (p) { p.facing = fs[i]; p.invuln = 0; p.shootCd = 0; } });
      for (const p of H.G.players) p.invuln = 0;
      await sleep(16);
    }
    await sleep(500);
    hold(H);
    for (const p of H.G.players) p.invuln = 0;
    return F.every((fr, i) => xs[i] === null || F.every((o) => { const q = P(o, slotOf(fr)); return q && !q.trap && Math.abs(q.x - xs[i]) < 3 && Math.abs(q.y - FLOOR) < 2; }));
  }
  // what each screen saw: does a capture-phase bubble of `owner` touch `victim` as THAT screen draws it (the engine's
  // own test, mp.touches); and the victim's height there
  function watch(fr, owner, victim, pred) {
    const w = { touched: false, minY: 1e9 };
    // (an older build has no mp.touches: the drawn ring r 10 on the 16x16 body, as touches does for a plain bubble)
    const touches = fr.mp.touches || ((q, px, py) => { const cx = q.x + 8, cy = q.y + 8, dx = cx - Math.max(px, Math.min(cx, px + 16)), dy = cy - Math.max(py, Math.min(cy, py + 16)); return dx * dx + dy * dy < 100; });
    fr.mp.tap(() => {
      const v = P(fr, victim); if (!v) return;
      w.minY = Math.min(w.minY, v.y);
      for (const b of fr.G.bubbles) {
        if (b.owner !== owner || b.state !== 'shot' || b.kind !== 'empty' || b.dead || !!b.pred !== pred) continue;
        if (b.claim) { if (b.claim.s === victim) w.touched = true; continue; } // (a guest's claimed catch: it touched there)
        // (this frame's picture, or the next one's: the world update catches before the touch is ever drawn)
        const nx = Object.assign({}, b, { x: b.x + (b.vx || 0), y: b.y + (b.vy || 0) });
        if (!v.trap && (touches(b, v.x, v.y) || touches(nx, v.x + (v.vx || 0), v.y + (v.vy || 0)))) w.touched = true;
      }
    });
    return w;
  }
  const trappedBy = (H, victim, owner) => { const p = P(H, victim); return !!(p && p.trap && p.trap.by === owner); };
  // one trial: the victim frame V jumps; the shooter frame Sh blows (at once, or once its screen shows V high up)
  async function trial(F, H, Sh, V, late) {
    const so = slotOf(Sh), sv = slotOf(V);
    const shooterSaw = watch(Sh, so, sv, Sh !== H), hostReal = Sh === H ? null : watch(H, so, sv, false);
    press(V, 'jump', true); setTimeout(() => press(V, 'jump', false), 250);
    if (late) await until(() => { const v = P(Sh, sv); return v && v.y < FLOOR - 26; }, 2000);
    press(Sh, 'shoot', true); await sleep(50); press(Sh, 'shoot', false);
    const caught = !!(await until(() => trappedBy(H, sv, so), 1600));
    Sh.mp.tap(null); if (hostReal && Sh !== H) H.mp.tap(null);
    return { caught, shooterSaw: shooterSaw.touched, hostSawRealBody: hostReal ? hostReal.touched : null, minY: Math.round(shooterSaw.minY) };
  }

  async function lagRoom() {
    const R = await room(3, { perks: false }, ['duck', 'cat', 'frog']);
    if (!ok('lag room: 3-player battle playing', R.playing)) return;
    const [H, A, B] = R.F, res = {};
    const run = async (name, Sh, V, xs, fs, late) => {
      if (ONLY.length && !ONLY.includes(name)) return;
      for (let k = 0; k < 3; k++) {
        if (!(await place(R.F, H, xs, fs))) { log('BNET INFO ' + name + ': place failed'); continue; }
        (res[name] = res[name] || []).push(await trial(R.F, H, Sh, V, late));
      }
    };
    // positions [host, A, B]: the shooter at 60 facing right, the victim at 130 (the bubble touches it at about age 12)
    await run('gh', A, H, [130, 60, 205], [-1, 1, -1], false);
    await run('gm', A, H, [130, 60, 205], [-1, 1, -1], true);
    await run('gg', A, B, [205, 60, 130], [-1, 1, -1], false);
    await run('hg', H, B, [60, 205, 130], [1, -1, -1], false);
    metric('trials', res);
    const all = (n, f) => !!res[n] && res[n].length >= 2 && res[n].every(f);
    if (res.gh) ok('gh: guest -> host: touched on the shooter\'s screen (host already airborne in its own time) -> caught', all('gh', (r) => r.shooterSaw && r.caught), res.gh);
    if (res.gh) ok('gh: the case is real - the host\'s own picture never had that bubble touch it', res.gh.some((r) => r.hostSawRealBody === false), res.gh);
    if (res.gm) ok('gm: guest -> host, a clear miss on the shooter\'s screen -> not caught', all('gm', (r) => !r.shooterSaw && !r.caught), res.gm);
    if (res.gg) ok('gg: guest -> guest (peer stream): touched on the shooter\'s screen -> caught', all('gg', (r) => r.shooterSaw && r.caught), res.gg);
    if (res.hg) ok('hg: host -> guest (its interpolated stream): touched on the host\'s screen -> caught', all('hg', (r) => r.shooterSaw && r.caught), res.hg);
    metric('claims', R.F.map((f) => N(f).claims));
    // ---- an older guest page: no lc in its states, no 'tp' messages -> the host judges its shot as before
    if (!ONLY.length || ONLY.includes('old')) {
      const sess = A.mp.session(), ss = sess.setState, sd = sess.send;
      sess.setState = function (st) { if (st && typeof st === 'object') delete st.lc; return ss.apply(this, arguments); };
      sess.send = function (to, m) { if (m && m.t === 'tp') return; return sd.apply(this, arguments); };
      const r = [];
      for (let k = 0; k < 2; k++) {
        if (!(await place(R.F, H, [130, 60, 205], [-1, 1, -1]))) continue;
        await sleep(300);
        press(A, 'shoot', true); await sleep(50); press(A, 'shoot', false);
        r.push(!!(await until(() => trappedBy(H, slotOf(H), slotOf(A)), 1600)));
      }
      sess.setState = ss; sess.send = sd;
      ok('old: an older guest page\'s shot still catches a host player standing still (2/2)', r.length === 2 && r.every(Boolean), r);
    }
    ok('lag room: no page errors', R.F.every((f) => !f.errors.length), R.F.map((f) => f.errors));
  }

  async function capRoom() {
    if (ONLY.length && !ONLY.includes('cap')) return;
    const R = await room(2, { perks: true }, ['capy', 'duck']);
    if (!ok('cap room: 2-player battle (perks on) playing', R.playing)) return;
    const [H, A] = R.F, sa = slotOf(A);
    H.D.ammo.off(true); A.D.ammo.off(true); await sleep(300); // (the backstop alone - ammoRoom has the magazine)
    await place(R.F, H, [205, 40], [-1, 1]);
    const out = (fr, slot) => fr.G.bubbles.filter((b) => !b.dead && b.owner === slot && b.kind === 'empty' && !b.drop && (b.state === 'shot' || b.state === 'float')).length;
    let gMax = 0, hMax = 0;
    A.mp.tap(() => { gMax = Math.max(gMax, out(A, sa)); });
    H.mp.tap(() => { hMax = Math.max(hMax, out(H, sa)); for (const p of H.G.players) p.invuln = 0; });
    const st0 = N(A), dry0 = A.sfx.filter((n) => n === 'dry').length, cp0 = H.G.capPops | 0;
    const t0 = now();
    while (now() - t0 < 3000) { for (const e of H.G.enemies) { e.state = 'descend'; e.delay = 1e9; e.y = -300; } press(A, 'shoot', true); await sleep(40); press(A, 'shoot', false); await sleep(40); }
    await sleep(800);
    A.mp.tap(null); H.mp.tap(null);
    const st1 = N(A), dry = A.sfx.filter((n) => n === 'dry').length - dry0, capPops = (H.G.capPops | 0) - cp0, gEnd = out(A, sa), hEnd = out(H, sa);
    metric('cap', { guestMax: gMax, hostMax: hMax, guestEnd: gEnd, hostEnd: hEnd, dry, capPops, predGiveUp: (st1.predGiveUp | 0) - (st0.predGiveUp | 0) });
    ok('cap: a duck tapping for 3 s has at most 3 of its bubbles out in all on the host (and reaches 3)', hMax === 3 && hEnd <= 3, { hMax, hEnd });
    ok('cap: each press past 3 popped its oldest on the host (no refusal, never a dry); the guest\'s screen is back to <= 3', capPops >= 5 && dry === 0 && gEnd <= 3, { capPops, dry, gEnd });
    ok('cap room: no page errors', R.F.every((f) => !f.errors.length), R.F.map((f) => f.errors));
  }

  async function ammoRoom() {
    if (ONLY.length && !ONLY.includes('ammo')) return;
    const R = await room(2, { perks: true }, ['capy', 'duck']);
    if (!ok('ammo room: 2-player battle (perks on) playing', R.playing)) return;
    const [H, A] = R.F, sa = slotOf(A), sh = slotOf(H), K = A.D.ammo.kit('duck');
    await place(R.F, H, [205, 40], [-1, 1]);
    // the guest's blows (its magazine going down), the host's bubbles of the guest (a volley's first only)
    let gBlows = 0, gPrev = null;
    const hSeen = new Set();
    const calm = (fr) => { for (const e of fr.G.enemies) { e.state = 'descend'; e.delay = 1e9; e.y = -300; } };
    A.mp.tap(() => { const m = A.D.ammo.of(sa); if (m && gPrev !== null && m.left < gPrev) gBlows += gPrev - m.left; gPrev = m ? m.left : null; });
    H.mp.tap(() => { calm(H); for (const b of H.G.bubbles) if (b.owner === sa && b.kind === 'empty' && !b.drop && !b.vi) hSeen.add(b.id); for (const p of H.G.players) p.invuln = 60; });
    const tapA = async () => { press(A, 'shoot', true); await sleep(50); press(A, 'shoot', false); };
    const dryA = () => A.sfx.filter((n) => n === 'dry').length;
    const st0 = N(A), ref0 = H.D.ammo.refused();
    ok('ammo: the duck guest starts full on both screens (' + K.join(' / ') + '), the guest knows the host keeps magazines', !!(await until(() => { const a = A.D.ammo.of(sa), h = H.D.ammo.of(sa); return a && h && a.left === K[0] && h.left === K[0] && a.n === K[0]; }, 3000)), [A.D.ammo.of(sa), H.D.ammo.of(sa)]);
    for (let k = 0; k < K[0]; k++) { await tapA(); await sleep(250); }
    const d0 = dryA(), t3 = now();
    await tapA(); await sleep(400);
    const d1 = dryA() - d0;
    await until(() => hSeen.size >= K[0], 1500);
    metric('ammo-burst', { gBlows, host: hSeen.size, dry: d1, guest: A.D.ammo.of(sa), hostView: H.D.ammo.of(sa) });
    ok('ammo: ' + K[0] + ' presses blow ' + K[0] + ' (guest and host); the next press is a dry 칙 and blows nothing anywhere', gBlows === K[0] && hSeen.size === K[0] && d1 >= 1 && A.D.ammo.of(sa).left === 0, { gBlows, host: hSeen.size, d1 });
    const back = await until(() => A.D.ammo.of(sa).left === K[0], 6000), backMs = Math.round(now() - t3 + 300);
    const full = A.D.ammo.of(sa).left;
    await tapA();
    await until(() => hSeen.size >= K[0] + 1, 2000); await sleep(600);
    const st1 = N(A), a1 = A.D.ammo.of(sa), h1 = H.D.ammo.of(sa);
    metric('ammo-reload', { backMs, full, gBlows, host: hSeen.size, refused: H.D.ammo.refused() - ref0, giveUp: (st1.predGiveUp | 0) - (st0.predGiveUp | 0), guest: a1, hostView: h1 });
    ok('ammo: after the reload (' + (K[1] / 60).toFixed(1) + ' s) the magazine is full again and the next press blows on both screens', !!back && full === K[0] && gBlows === K[0] + 1 && hSeen.size === K[0] + 1, { full, gBlows, host: hSeen.size });
    ok('ammo: the host refused none of the guest blows, none of its copies gave up; its count matches the host count', H.D.ammo.refused() === ref0 && (st1.predGiveUp | 0) === (st0.predGiveUp | 0) && a1.left === h1.left && a1.left === K[0] - 1, { refused: H.D.ammo.refused() - ref0, a1, h1 });
    const hostOnA = A.G.players.find((p) => p.slot === sh), hostOnH = H.G.players.find((p) => p.slot === sh);
    ok('ammo: the guest HUD has the host magazine from the snapshot', !!hostOnA && hostOnA.amN === hostOnH.amN && hostOnA.amN === H.D.ammo.kit('capy')[0], [hostOnA && hostOnA.amN, hostOnH && hostOnH.amN]);
    // ---- an older guest page: no magazine there (AMMO off) - it fires freely, the host refuses past the magazine
    await until(() => H.D.ammo.of(sa).left === K[0] && A.D.ammo.of(sa).left === K[0], 6000);
    A.D.ammo.off(true); hSeen.clear();
    const ref1 = H.D.ammo.refused(), dOld = dryA();
    for (let k = 0; k < K[0] + 2; k++) { await tapA(); await sleep(250); }
    await sleep(900);
    metric('ammo-old-guest', { host: hSeen.size, refused: H.D.ammo.refused() - ref1, dry: dryA() - dOld });
    ok('ammo: an older guest page fires freely (no 칙); the host takes its magazine (' + K[0] + ') and refuses the rest, nothing breaks', hSeen.size === K[0] && H.D.ammo.refused() - ref1 === 2 && dryA() === dOld, { host: hSeen.size, refused: H.D.ammo.refused() - ref1 });
    A.D.ammo.off(false);
    // ---- an older host: no magazine there (AMMO off: no g.am) - its guest fires freely, as before
    H.D.ammo.off(true);
    const noAm = await until(() => !A.D.ammo.of(sa), 2000);
    hSeen.clear(); const dHost = dryA();
    for (let k = 0; k < K[0] + 2; k++) { await tapA(); await sleep(250); }
    await sleep(900);
    metric('ammo-old-host', { noAm: !!noAm, host: hSeen.size, dry: dryA() - dHost });
    ok('ammo: under an older host (no g.am) the guest keeps no magazine: ' + (K[0] + 2) + ' presses blow ' + (K[0] + 2) + ', no 칙', !!noAm && hSeen.size === K[0] + 2 && dryA() === dHost, { noAm: !!noAm, host: hSeen.size, dry: dryA() - dHost });
    H.D.ammo.off(false);
    A.mp.tap(null); H.mp.tap(null);
    ok('ammo room: no page errors', R.F.every((f) => !f.errors.length), R.F.map((f) => f.errors));
  }

  (async () => {
    try { await lagRoom(); } catch (e) { fail++; log('BNET error ' + (e && e.stack || e)); }
    dropAll();
    try { await capRoom(); } catch (e) { fail++; log('BNET error ' + (e && e.stack || e)); }
    dropAll();
    try { await ammoRoom(); } catch (e) { fail++; log('BNET error ' + (e && e.stack || e)); }
    dropAll();
    log('BNET DONE pass=' + pass + ' fail=' + fail);
  })();
})();
