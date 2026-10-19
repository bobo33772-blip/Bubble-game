// v3 online multiplayer, end to end: 2-5 same-origin iframes of preview.html, each a full game on PG.Net's 'bc' transport
// with a simulated network, driven through PG.debug.mp / PG.debug like players would (built to test-mp-net.html):
//   node bogeul/build.js
//   node bogeul/tools/serve.js                         (keep running: http://localhost:8765, root C:/Temp/bogeul)
//   node bogeul/tools/run-chrome.js http://localhost:8765/test-mp-net.html - 1200 900 rt900000 "MPNET DONE"
// The link: one-way latency 80 +- 30 ms and ~5 % of state updates lost, end to end. PG.Net simulates on BOTH ends
// of every link, so each page gets half: ?lat=25&jit=30&drop=0.025 (50 + U(0,30) + U(0,30) ms = 50-110 ms, mean 80;
// 1 - 0.975^2 = 4.9 % loss). Override with ?link=lat=..%26jit=..%26drop=.. (e.g. the harsher per-page lat=80).
// Phases (?only=a,b,... to run some): coop2 (2-player co-op through round 1 and the first boss: guest bubbles trap
// enemies, pops / items / boss soap + giant-bubble burst resolved for the guest, ghost revive both ways, team game
// over), coop4 (4 players: round 1, boss soap scaling, each guest traps, guest leaves mid-round), battle (trap /
// mash-escape / KO across clients, stun, scores agree everywhere at the end, podium everywhere, 한 판 더), hostleave,
// full (a 5th player, and a late joiner while playing), soak (?soak=180 s: 4 clients, random input, co-op then battle:
// no exceptions / NaN, snapshot size logged, always < 3.6 KB).
// Screenshot scenes (?shot=friends|friendsnote|room4|room4g|coop|boss|battle|podium; the scene's frame fills the window, then "SHOT READY").
// Prints "MPNET PASS|FAIL <name>", "MPNET METRIC <name> <value>", "MPNET DONE pass=N fail=M".
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const LINK = Q.get('link') || 'lat=25&jit=30&drop=0.025';
  const ONLY = (Q.get('only') || '').split(',').filter(Boolean);
  const SHOT = Q.get('shot') || '';
  const SOAK = +(Q.get('soak') || 180);
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => {
    if (cond) { pass++; log('MPNET PASS ' + name); } else { fail++; log('MPNET FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); }
    return !!cond;
  };
  const metric = (name, v) => log('MPNET METRIC ' + name + ' ' + (typeof v === 'string' ? v : JSON.stringify(v)));
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
  window.addEventListener('error', (e) => { fail++; log('MPNET page error (driver): ' + e.message); });
  // keep this page's own game quiet behind the frames
  try { PG.debug.G.manual = true; } catch (e) { /* ignore */ }
  document.body.style.background = '#061518';

  // ---------------------------------------------------------------- frames
  const frames = [];
  const LAYOUT = [[0, 0], [600, 0], [0, 450], [600, 450], [300, 225]];
  function frame(i, opts) {
    opts = opts || {};
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'preview.html?' + (opts.query !== undefined ? opts.query : 'net=bc&' + LINK) + '&frame=' + i;
      f.title = 'player ' + i;
      const pos = LAYOUT[i % LAYOUT.length];
      f.style.cssText = 'position:fixed;left:' + pos[0] + 'px;top:' + pos[1] + 'px;width:600px;height:450px;border:0;z-index:' + (10 + i) + ';background:#0a2327';
      const t = setTimeout(() => reject(new Error('frame ' + i + ' did not load')), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        const okp = await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.Net, 15000);
        clearTimeout(t);
        if (!okp) { reject(new Error('frame ' + i + ' has no PG.debug.mp')); return; }
        const fr = { i, el: f, w, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, errors: [] };
        w.addEventListener('error', (e) => { fr.errors.push(e.message + ' @' + e.lineno); log('MPNET frame ' + i + ' page error: ' + e.message + ' @' + e.lineno); });
        w.addEventListener('unhandledrejection', (e) => { fr.errors.push('rejection ' + (e.reason && e.reason.message)); log('MPNET frame ' + i + ' unhandled rejection: ' + (e.reason && e.reason.message)); });
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

  // a room: host + guests, everyone ready, started, everyone playing
  async function room(n, mode, hostOpts, chars, nicks) {
    chars = chars || ['duck', 'cat', 'frog', 'otter', 'capy'];
    nicks = nicks || ['방장', '친구', '셋째', '넷째', '다섯'];
    const F = [];
    for (let i = 0; i < n; i++) F.push(await frame(frames.length));
    const host = F[0];
    const code = await host.mp.host(Object.assign({ mode, nick: nicks[0], char: chars[0] }, hostOpts || {}));
    if (!code) return { F, host, code: null };
    for (let i = 1; i < n; i++) {
      const r = await F[i].mp.join(code, { nick: nicks[i], char: chars[i] });
      if (!r.ok) log('MPNET INFO join failed ' + JSON.stringify(r));
    }
    await until(() => N(host).roster.length === n && F.slice(1).every((f) => N(f).roster.length === n), 6000);
    return { F, host, code };
  }
  async function startRoom(F) {
    for (const f of F.slice(1)) f.mp.ready(true);
    await until(() => N(F[0]).canStart, 6000);
    const started = F[0].mp.start();
    const playing = await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online), 12000);
    return started && !!playing;
  }
  function parkAll(host) { for (const e of host.G.enemies) { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; } }
  function stillEnemy(host, e, x, y, dir) {
    Object.assign(e, { type: 'mold', state: 'active', x, y, vx: 0, vy: 0, onGround: true, angry: false, escaped: false, hopT: 99999, delay: 0, spawnY: y,
      jumpCd: 999, chargeCd: 999, windT: 0, chargeT: 0, committed: false, soakT: 0, dir: dir || -1, water: 0, grace: 0, bubble: null, ice: null });
    return e;
  }
  // a guest's interpolated view vs the host's actual world at the same tick
  function syncSample(host, guest) {
    const v = V(guest), tr = host.mp.traceAt(Math.round(v.renderTick));
    if (!tr) return null;
    const hostE = new Map(tr.E.filter((e) => e[3] !== 'dead').map((e) => [e[0], e]));
    const gE = v.enemies.filter((e) => e.state !== 'dead');
    const ids = (a) => a.slice().sort((x, y) => x - y).join(',');
    const sameE = ids(Array.from(hostE.keys())) === ids(gE.map((e) => e.id));
    const d = [];
    let worstState = '';
    for (const e of gE) {
      const h = hostE.get(e.id);
      if (!h || Math.abs(h[2] - e.y) >= 60) continue;
      const dd = Math.hypot(h[1] - e.x, h[2] - e.y);
      if (!d.length || dd > Math.max(...d)) worstState = e.state + '/' + h[3];
      d.push(dd);
    }
    // bubbles: the host's ids at that tick vs the guest's (its own still-flying shots are drawn as predictions)
    const hostU = new Map(tr.U.map((b) => [b[0], b])), gB = v.bubbles.filter((b) => !b.pred), gU = gB.map((b) => b.id);
    const missingU = gU.filter((id) => !hostU.has(id)).length;
    const predN = v.bubbles.filter((b) => b.pred).length;
    const sameU = ids(Array.from(hostU.keys())) === ids(gU);
    const dU = [];
    for (const b of gB) { const hb = hostU.get(b.id); if (hb) dU.push(Math.hypot(hb[1] - b.x, hb[2] - b.y)); }
    return { dk: Math.abs(tr.k - v.renderTick), sameE, worstState, nE: gE.length, maxD: d.length ? Math.max(...d) : 0, meanD: d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0,
      nU: gU.length, missingU, sameU, predN, maxDU: dU.length ? Math.max(...dU) : 0 };
  }
  function nanScan(o, path, out) {
    if (out.length > 4) return out;
    if (typeof o === 'number') { if (!Number.isFinite(o)) out.push(path); return out; }
    if (!o || typeof o !== 'object') return out;
    for (const k of Object.keys(o)) nanScan(o[k], path + '.' + k, out);
    return out;
  }

  // ================================================================ phase: 2-player co-op
  async function coop2() {
    const { F, host, code } = await room(2, 'coop');
    const [, g] = F;
    ok('coop2: host made a room (4-char code)', /^[a-z0-9]{4}$/.test(code || ''), code);
    ok('coop2: guest sees the room: 2 players, host + ready state', N(g).roster.length === 2 && N(g).roster[0].host && N(g).screen === 'room' && N(g).code === code, N(g).roster);
    ok('coop2: 시작 is off until the guest is ready', !N(host).canStart);
    g.mp.pickChar('frog');
    await until(() => N(host).roster[1] && N(host).roster[1].char === 'frog', 3000);
    ok('coop2: a re-pick in the room reaches the host', N(host).roster[1].char === 'frog', N(host).roster);
    const started = await startRoom(F);
    ok('coop2: 3-2-1 countdown, then both playing', started, [S(host).phase, S(g).phase]);
    if (!started) return dropAll();
    host.mp.trace(true);
    const gs = S(g);
    ok('coop2: guest is a guest in a co-op game with both animals', gs.role === 'guest' && gs.mode === 'coop' && gs.players.length === 2 &&
      gs.players[0].char === 'duck' && gs.players[1].char === 'frog' && gs.players[0].nick === '방장' && gs.players[1].nick === '친구', gs.players);
    ok('coop2: team lives 3 + (2 - 1) = 4 on both', S(host).teamLives === 4 && S(g).teamLives === 4, [S(host).teamLives, S(g).teamLives]);
    await sleep(1500);
    // sync: enemies (same ids, positions) in the guest's view vs the host's world at the same tick
    const samples = [];
    for (let i = 0; i < 6; i++) { samples.push(syncSample(host, g)); await sleep(350); }
    const good = samples.filter((s) => s && s.sameE && s.maxD < 4 && s.dk <= 2);
    metric('coop2.sync', samples.map((s) => s && { E: s.nE, same: s.sameE, maxD: r1(s.maxD), dk: r1(s.dk), U: s.nU }));
    ok('coop2: guest view = host world at the same tick (enemy ids, positions within 4 px)', good.length >= 5, samples);
    // (the enemies go now, as in coop4: a co-op guest decides its own falls against its view, and round 1's enemies kept
    // roaming while the guest stood for the checks below - one walking onto it made it a ghost just before the trap step
    // in ~5 % of runs, and the trap / pop / snack checks then failed; run-all 2026-10-18, reproduced 2 in 40)
    parkAll(host);
    // the guest's own animal: what the host has is what the guest sent
    allIdle(g);
    await sleep(900);
    const gp = me(g), hp1 = hp(host, 1);
    ok('coop2: standing still: host has the guest exactly where it is', Math.abs(gp.x - hp1.x) < 0.6 && Math.abs(gp.y - hp1.y) < 0.6, [gp.x, gp.y, hp1.x, hp1.y]);
    const x0 = hp1.x;
    press(g, 'right', true); await sleep(700); press(g, 'right', false);
    await sleep(500);
    ok('coop2: guest walks: the host sees it move and stop where it stopped', hp(host, 1).x > x0 + 20 && Math.abs(hp(host, 1).x - me(g).x) < 0.6, [x0, hp(host, 1).x, me(g).x]);
    // bubbles: a few floating ones (and a stamp bubble) up in the free air of round 1 must agree (ids, < 4 px)
    for (const [x, y] of [[150, 40], [180, 52], [210, 40], [196, 70]]) host.D.spawnBubble('empty', x, y);
    host.D.spawnBubble('stamp', 168, 90);
    await sleep(1200);
    const bs = [];
    for (let i = 0; i < 5; i++) { bs.push(syncSample(host, g)); await sleep(300); }
    metric('coop2.bubble_sync', bs.map((s) => s && { U: s.nU, same: s.sameU, maxD: r1(s.maxDU), pred: s.predN }));
    ok('coop2: bubbles in the guest view = the host\'s (ids, positions within 4 px)', bs.filter((s) => s && s.nU >= 3 && s.sameU && s.maxDU < 4).length >= 4, bs);

    // ---- a guest's bubble traps an enemy (host world), the guest pops it (host resolves), the guest picks up a snack
    parkAll(host);
    const gm = me(g);
    const target = stillEnemy(host, host.G.enemies[0], gm.x + 44, gm.y, -1);
    host.D.setInvincible(true);
    await tap(g, 'right', 40);
    await sleep(400);
    await tap(g, 'shoot', 60);
    const trapped = await until(() => target.state === 'trapped' && target.bubble && target.bubble.owner === 1, 2500);
    ok('coop2: the guest\'s shot traps an enemy in the host world (bubble owner = guest)', !!trapped, { state: target.state, owner: target.bubble && target.bubble.owner });
    const seenTrapped = await until(() => V(g).bubbles.some((b) => b.kind === 'trapped' && b.owner === 1), 2000);
    ok('coop2: ...and the guest sees its trapped bubble', !!seenTrapped);
    const predSeen = V(g).bubbles.filter((b) => b.pred).length;
    metric('coop2.pred_bubbles_left', predSeen);
    const sc0 = hp(host, 1).score;
    if (target.bubble) { const b = target.bubble; b.x = me(g).x; b.y = me(g).y - 2; b.vx = 0; b.vy = 0; b.bounceCd = 0; }
    const popped = await until(() => target.state === 'dead' || hp(host, 1).score > sc0, 2500);
    ok('coop2: the guest touching the trapped bubble pops it (host): score + kill for the guest', !!popped && hp(host, 1).score >= sc0 + 500 && hp(host, 1).kills >= 1, { score: hp(host, 1).score, sc0, kills: hp(host, 1).kills });
    await until(() => V(g).players[1].score === hp(host, 1).score, 2000);
    ok('coop2: the guest\'s own score in its view follows the host', V(g).players[1].score === hp(host, 1).score, [V(g).players[1].score, hp(host, 1).score]);
    const sc1 = hp(host, 1).score;
    host.G.items.push({ id: ++host.G.seq, type: 'watermelon', value: 2000, x: me(g).x, y: me(g).y, vx: 0, vy: 0, onGround: true, floating: false, age: 0 });
    const ate = await until(() => hp(host, 1).score >= sc1 + 2000, 2500);
    ok('coop2: a snack the guest touches is the guest\'s (+2000)', !!ate, [sc1, hp(host, 1).score]);

    // ---- round 1 cleared -> doors -> round 2 on both
    host.D.killAll();
    const phases = new Set(), banners = new Set();
    const r2 = await until(() => { phases.add(S(g).phase); banners.add(V(g).banner); return S(host).round === 1 && S(g).round === 1 && S(g).phase === 'playing'; }, 14000, 20);
    ok('coop2: round 1 cleared: both go through the doors to round 2', !!r2 && phases.has('transition'), { round: [S(host).round, S(g).round], phases: [...phases] });
    ok('coop2: the guest gets the host\'s banners (청소 완료! ...)', banners.has('청소 완료!'), [...banners]);

    // ---- the first boss
    host.D.gotoRound(5);
    const inBoss = await until(() => V(g).boss && V(g).round === 5, 5000);
    ok('coop2: first boss round on both (boss in the guest view)', !!inBoss && V(g).boss.type === 'kingGrime', V(g).boss);
    ok('coop2: boss soap needed x1.4 for 2 players (11) on both', host.G.boss && host.G.boss.soapMax === 11 && V(g).boss && V(g).boss.soapMax === 11, [host.G.boss && host.G.boss.soapMax, V(g).boss && V(g).boss.soapMax]);
    await sleep(800);
    const B = host.G.boss;
    host.D.soapBoss(B.soapMax - 1);
    B.calm = 99999; B.act = 'rest'; B.actT = 99999; B.vx = 0; B.minionT = 99999;
    host.G.enemies.length = 0;
    const gb = me(g);
    B.x = Math.min(gb.x + 40, 240 - 32); B.y = gb.y + 16 - 32; B.vy = 0; B.onGround = true;
    if (B.x < gb.x + 24) { B.x = Math.max(16, gb.x - 60); }
    const face = B.x > gb.x ? 'right' : 'left';
    await sleep(500);
    await tap(g, face, 40);
    await sleep(350);
    const soap0 = B.soap;
    await tap(g, 'shoot', 60);
    const sealed = await until(() => B.state === 'stun', 2500);
    ok('coop2: the guest\'s bubble lathers the boss (host) and seals it', !!sealed, { soap0, soap: B.soap, state: B.state, max: B.soapMax });
    const seenSeal = await until(() => V(g).boss && V(g).boss.state === 'stun' && V(g).boss.giant, 2000);
    ok('coop2: guest sees the giant bubble', !!seenSeal);
    const gsc = hp(host, 1).score;
    if (B.giant) { B.giant.x = me(g).x - 12; B.giant.y = me(g).y - 12; B.giant.vy = 0; }
    const burst = await until(() => B.hp === 2, 2500);
    ok('coop2: the guest bursts the giant bubble: boss HP 3 -> 2, +2000 to the guest', !!burst && hp(host, 1).score >= gsc + 2000, { hp: B.hp, score: hp(host, 1).score, gsc });
    await until(() => V(g).boss && V(g).boss.hp === 2, 2000);
    ok('coop2: guest view: boss HP 2', V(g).boss && V(g).boss.hp === 2);
    host.D.damageBoss(); await sleep(200); host.D.damageBoss();
    const beat = await until(() => S(host).round === 6 && S(g).round === 6 && S(g).phase === 'playing', 15000);
    ok('coop2: boss beaten -> both on round 7', !!beat, [S(host).round, S(g).round]);

    // ---- ghost revive across clients: the guest falls (decided on its own view) -> ghost; the host touches it
    host.D.setInvincible(true);
    parkAll(host);
    await sleep(2300); // (spawn blink over)
    const gd = me(g);
    // (the host stands well away: a ghost drifts toward its partner and a touch within 12 px revives it at once)
    host.D.setPlayer(gd.x > 128 ? gd.x - 150 : gd.x + 150, gd.y, 0);
    stillEnemy(host, host.G.enemies[0], gd.x, gd.y, -1);
    const ghost = await until(() => hp(host, 1).ghost, 4000);
    ok('coop2: an enemy on the guest (its view) -> it falls -> ghost bubble on the host', !!ghost, { dead: hp(host, 1).dead, x: hp(host, 1).x });
    parkAll(host);
    const gview = await until(() => V(g).players[1].ghost && N(g).ctl === 'remote', 2000);
    ok('coop2: the guest sees itself as a ghost (not moving itself)', !!gview);
    const H = hp(host, 0), gh = hp(host, 1);
    host.D.setPlayer(gh.x, gh.y, 0);
    const rev = await until(() => !hp(host, 1).dead && !hp(host, 1).ghost, 2000);
    ok('coop2: the host touches the ghost: revived, +1 revive for the host', !!rev && H.revives === 1, { revives: H.revives });
    const back = await until(() => N(g).ctl === 'local' && !V(g).players[1].dead, 2500);
    ok('coop2: the guest gets its animal back (moves it again)', !!back);
    await sleep(300);
    const gx = hp(host, 1).x;
    press(g, 'left', true); await sleep(500); press(g, 'left', false); await sleep(400);
    ok('coop2: ...and its moves reach the host again', Math.abs(hp(host, 1).x - gx) > 10, [gx, hp(host, 1).x]);
    // the other way round: the host falls, the guest touches the ghost
    host.D.setInvincible(false);
    await sleep(2200);
    { const hh = hp(host, 0); g.D.setPlayer(hh.x > 128 ? hh.x - 150 : hh.x + 150, hh.y, 1); await sleep(300); } // (the guest steps away first)
    host.D.hitPlayer(0);
    const hg = await until(() => hp(host, 0).ghost, 2500);
    ok('coop2: host falls -> ghost', !!hg);
    await until(() => V(g).players[0].ghost, 2000);
    const gh0 = hp(host, 0);
    g.D.setPlayer(gh0.x, gh0.y, 1);
    const rev2 = await until(() => !hp(host, 0).ghost && !hp(host, 0).dead, 2500);
    ok('coop2: the guest touches the host\'s ghost: revived by the guest (+1 revive)', !!rev2 && hp(host, 1).revives === 1, { revives: hp(host, 1).revives, ghost: !!hp(host, 0).ghost });
    host.D.setInvincible(true);

    // ---- team game over: no lives, both fall, ghosts time out
    await sleep(2300);
    host.G.lives = 0;
    host.D.setInvincible(false);
    host.D.hitPlayer(0);
    const gd2 = me(g);
    stillEnemy(host, host.G.enemies[0], gd2.x, gd2.y, -1);
    await until(() => hp(host, 1).ghost && hp(host, 0).ghost, 4000);
    parkAll(host);
    for (const p of host.G.players) if (p.ghost) p.ghost.t = 470;
    const over = await until(() => S(host).phase === 'gameover' && S(g).phase === 'gameover', 6000);
    ok('coop2: team lives 0 and nobody up -> game over on both', !!over, [S(host).phase, S(g).phase]);
    await sleep(400);
    const scoreOf = (f) => S(f).players.map((p) => [p.slot, p.score, p.kills, p.revives].join(':')).join();
    ok('coop2: scores / kills / revives agree on both at the end', scoreOf(host) === scoreOf(g) && S(host).score === S(g).score, [scoreOf(host), scoreOf(g)]);
    const rows = g.w.document.querySelectorAll('#pg-over-team .pg-team-row').length;
    ok('coop2: guest\'s result card: a row per player, guest waits for the host', rows === 2 && !g.w.document.querySelector('[data-net-wait]').hidden && g.w.document.getElementById('pg-retry').hidden, rows);
    ok('coop2: host\'s result card: 다시 하기 + 방으로', !host.w.document.getElementById('pg-retry').hidden && host.w.document.getElementById('pg-over-home').textContent === '방으로');
    // 방으로: everyone back in the room
    host.w.document.getElementById('pg-over-home').click();
    const inRoom = await until(() => N(host).screen === 'room' && N(g).screen === 'room' && !S(g).online, 4000);
    ok('coop2: 방으로 brings everyone back to the room (guest must ready again)', !!inRoom && !N(g).ready && !N(host).canStart, [N(host).screen, N(g).screen]);
    metric('coop2.snapshot_max_bytes', N(host).snap.max);
    ok('coop2: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors));
    dropAll();
  }

  // ================================================================ phase: 4-player co-op (+ a guest leaving mid-round)
  async function coop4() {
    const { F, host, code } = await room(4, 'coop', {}, ['duck', 'capy', 'otter', 'penguin']);
    ok('coop4: 4 players in the room on every page', !!code && F.every((f) => N(f).roster.length === 4), F.map((f) => N(f).roster.length));
    const started = await startRoom(F);
    ok('coop4: all 4 playing', started, F.map((f) => S(f).phase));
    if (!started) return dropAll();
    host.mp.trace(true);
    ok('coop4: team lives 3 + 3 = 6 everywhere', F.every((f) => S(f).teamLives === 6), F.map((f) => S(f).teamLives));
    ok('coop4: every page has the same 4 animals in the same slots', F.every((f) => S(f).players.map((p) => p.slot + p.char).join() === '0duck,1capy,2otter,3penguin'), F.map((f) => S(f).players.map((p) => p.char)));
    await sleep(1200);
    const syncs = [];
    for (let k = 0; k < 3; k++) { for (const f of F.slice(1)) syncs.push(syncSample(host, f)); await sleep(300); }
    ok('coop4: each guest\'s view matches the host world (ids, < 4 px)', syncs.filter((s) => s && s.sameE && s.maxD < 4).length >= syncs.length - 2, syncs);
    // every guest traps an enemy of its own: each on its own shelf of round 1 (rows 16 / 20 / 24), its enemy
    // standing 36 px in front of it
    parkAll(host);
    host.D.setInvincible(true);
    host.D.setPlayer(148, 200, 0);
    const SPOTS = [[60, 136], [20, 168], [20, 200]];
    F.slice(1).forEach((f, k) => f.D.setPlayer(SPOTS[k][0], SPOTS[k][1], slotOf(f)));
    await sleep(900);
    const targets = F.slice(1).map((f, k) => [slotOf(f), stillEnemy(host, host.G.enemies[k], SPOTS[k][0] + 36, SPOTS[k][1], -1)]);
    await sleep(600);
    for (const f of F.slice(1)) await tap(f, 'right', 30);
    await sleep(300);
    for (const f of F.slice(1)) { await tap(f, 'shoot', 50); await sleep(120); }
    const allTrapped = await until(() => targets.every(([s, e]) => e.state === 'trapped' || (e.bubble && e.bubble.owner === s)), 3000);
    ok('coop4: each guest\'s own shot traps the enemy in front of it', !!allTrapped, targets.map(([s, e]) => [s, e.state, e.bubble && e.bubble.owner]));
    ok('coop4: owners are the shooters', targets.filter(([s, e]) => e.bubble && e.bubble.owner === s).length >= targets.length - 1, targets.map(([s, e]) => [s, e.bubble && e.bubble.owner]));
    // the boss: soap scales x(1 + 0.4 x 3) = 2.2 -> 18
    host.D.gotoRound(5);
    const boss = await until(() => F.every((f) => V(f).boss && V(f).round === 5), 5000);
    ok('coop4: boss soap needed 18 for 4 players, on every page', !!boss && F.every((f) => V(f).boss.soapMax === 18), F.map((f) => V(f).boss && V(f).boss.soapMax));
    // a guest leaves mid-round: its animal goes, the team keeps its lives
    const lives = host.G.lives;
    const leaver = F[3];
    leaver.mp.leave();
    const gone = await until(() => S(host).players.length === 3 && S(F[1]).players.length === 3 && S(F[2]).players.length === 3, 15000);
    ok('coop4: a guest leaves mid-round: gone from the host and the other guests', !!gone, F.slice(0, 3).map((f) => S(f).players.length));
    ok('coop4: ...team lives unchanged, the game goes on', host.G.lives === lives && S(host).phase === 'playing' && S(F[1]).phase === 'playing', [lives, host.G.lives]);
    ok('coop4: the leaver is back in the lobby (친구와 하기), offline', N(leaver).screen === 'friends' && !S(leaver).online && N(leaver).overlay === 'friends', N(leaver));
    host.D.damageBoss(); await sleep(150); host.D.damageBoss(); await sleep(150); host.D.damageBoss();
    const r7 = await until(() => [F[0], F[1], F[2]].every((f) => S(f).round === 6 && S(f).phase === 'playing'), 15000);
    ok('coop4: boss beaten, the remaining 3 move on to round 7', !!r7, [F[0], F[1], F[2]].map((f) => [S(f).round, S(f).phase]));
    metric('coop4.snapshot_max_bytes', N(host).snap.max);
    ok('coop4: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors));
    dropAll();
  }

  // ================================================================ phase: battle (4 players)
  async function battle() {
    const { F, host, code } = await room(4, 'battle', { arena: 0, time: 3 }, ['duck', 'cat', 'frog', 'penguin'], ['방장', '냥이', '개굴', '펭']);
    ok('battle: room with 4', !!code && N(host).roster.length === 4);
    ok('battle: guests see the battle options (arena 1, 3 min)', F.slice(1).every((f) => N(f).mode === 'battle' && N(f).opts.arena === 0 && N(f).opts.time === 3), N(F[1]).opts);
    const started = await startRoom(F);
    ok('battle: all 4 playing in the arena', started && F.every((f) => S(f).mode === 'battle'), F.map((f) => [S(f).mode, S(f).phase]));
    if (!started) return dropAll();
    ok('battle: timer runs on every page (~3:00)', F.every((f) => S(f).timeLeft > 160 && S(f).timeLeft <= 180), F.map((f) => S(f).timeLeft));
    const [, A, B, C] = F;
    parkAll(host);
    host.G.battle.enemyT = 1e9; host.G.battle.powerT = 1e9; host.G.opts.intrusion = false;
    host.D.setInvincible(true);
    // A and B on the bottom floor, B 40 px right of A; C nearby
    const floorY = 24 * 8 - 0;
    A.D.setPlayer(40, floorY, slotOf(A)); B.D.setPlayer(84, floorY, slotOf(B)); C.D.setPlayer(150, floorY, slotOf(C));
    host.D.setPlayer(200, floorY, 0);
    await sleep(2400); // spawn blink (2 s) over
    await tap(A, 'right', 30);
    await sleep(300);
    await tap(A, 'shoot', 50);
    const bT = await until(() => hp(host, slotOf(B)).trap, 2500);
    ok('battle: A\'s bubble traps B (host decides)', !!bT && hp(host, slotOf(B)).trap.by === slotOf(A), hp(host, slotOf(B)).trap && hp(host, slotOf(B)).trap.by);
    const bSees = await until(() => V(B).players.find((p) => p.slot === slotOf(B)).trapped && N(B).ctl === 'remote', 2000);
    ok('battle: B sees itself trapped (tinted bubble with B inside)', !!bSees && V(B).bubbles.some((b) => b.kind === 'player' && b.victim === slotOf(B)));
    // (each page draws the host's world ~0.1-0.2 s late, by its own link: give the others a moment too)
    const othersSee = await until(() => V(A).players.find((p) => p.slot === slotOf(B)).trapped && V(C).players.find((p) => p.slot === slotOf(B)).trapped, 1500);
    ok('battle: A and C see B trapped too', !!othersSee);
    // B mashes: out well before the ~4 s it takes alone
    const t0 = clock();
    for (let k = 0; k < 16 && hp(host, slotOf(B)).trap; k++) { await tap(B, k % 2 ? 'jump' : 'shoot', 45); await sleep(55); }
    const freed = await until(() => !hp(host, slotOf(B)).trap, 3000);
    const escMs = clock() - t0;
    metric('battle.mash_escape_ms', Math.round(escMs));
    ok('battle: B mashes free in < 3 s (alone it takes ~4 s)', !!freed && escMs < 3000, Math.round(escMs));
    await until(() => N(B).ctl === 'local', 2500);
    ok('battle: B moves itself again after escaping', N(B).ctl === 'local');
    // KO: A traps B again, C touches the bubble -> 뽀득 KO (+500 for C)
    await sleep(1300); // (escape blink)
    B.D.setPlayer(84, floorY, slotOf(B)); A.D.setPlayer(40, floorY, slotOf(A));
    await sleep(500);
    await tap(A, 'right', 30); await sleep(250); await tap(A, 'shoot', 50);
    const bT2 = await until(() => hp(host, slotOf(B)).trap, 2500);
    ok('battle: B trapped again', !!bT2);
    const cScore = hp(host, slotOf(C)).score;
    // C keeps putting itself on the (slowly rising) bubble until the host sees the touch
    const ko = await until(() => {
      const hb = hp(host, slotOf(B));
      if (hb.koT > 0 || hb.koed > 0) return true;
      const tb = hb.trap && hb.trap.b;
      if (tb) C.D.setPlayer(tb.x, tb.y + 1, slotOf(C));
      return false;
    }, 3000, 90);
    ok('battle: C touches B\'s bubble: 뽀득 KO (+500 for C, B knocked out)', !!ko && hp(host, slotOf(C)).score >= cScore + 500 && hp(host, slotOf(C)).kos === 1, { c: hp(host, slotOf(C)).score, cScore, kos: hp(host, slotOf(C)).kos });
    const bKo = await until(() => V(B).players.find((p) => p.slot === slotOf(B)).ko, 2000);
    ok('battle: B sees its KO', !!bKo);
    const respawned = await until(() => N(B).ctl === 'local' && !hp(host, slotOf(B)).koT, 4000);
    ok('battle: B respawns after ~1.5 s and moves again', !!respawned);
    // an enemy hit = stun (decided by the guest, -100 by the host)
    await sleep(2300);
    hp(host, slotOf(A)).score += 300;
    const aScore = hp(host, slotOf(A)).score;
    const ma = me(A);
    stillEnemy(host, host.G.enemies[0], ma.x, ma.y, -1);
    const stun = await until(() => hp(host, slotOf(A)).stunT > 0, 3000);
    ok('battle: an enemy on A (its view) -> A stunned, -100', !!stun && hp(host, slotOf(A)).score === Math.max(0, aScore - 100), { s: hp(host, slotOf(A)).score, aScore });
    parkAll(host);
    // end: time up -> podium everywhere with the same order and the same scores
    host.D.setTimeLeft(1.2);
    const podium = await until(() => F.every((f) => S(f).phase === 'podium'), 6000);
    ok('battle: time up -> podium on every page', !!podium, F.map((f) => S(f).phase));
    await sleep(800);
    const ref = host.D.getState().players.map((p) => p.slot + ':' + p.score).join();
    ok('battle: final scores agree on all 4 pages', F.every((f) => S(f).players.map((p) => p.slot + ':' + p.score).join() === ref), F.map((f) => S(f).players.map((p) => p.score)));
    ok('battle: same podium order on all 4 pages', F.every((f) => JSON.stringify(S(f).podium) === JSON.stringify(S(host).podium)), F.map((f) => S(f).podium));
    ok('battle: podium card on every page; 한 판 더 only for the host', F.every((f) => !f.w.document.getElementById('pg-podium').hidden) &&
      !host.w.document.getElementById('pg-podium-again').hidden && F.slice(1).every((f) => f.w.document.getElementById('pg-podium-again').hidden));
    metric('battle.final', host.D.getState().players.map((p) => [p.nick, p.score, p.kos]));
    // 한 판 더: same room, a new match for everyone
    const gid = N(F[1]).gid;
    host.w.document.getElementById('pg-podium-again').click();
    const again = await until(() => F.every((f) => S(f).phase === 'playing' && N(f).gid > gid), 8000);
    ok('battle: 한 판 더 -> everyone in a new match', !!again, F.map((f) => [S(f).phase, N(f).gid]));
    ok('battle: scores reset for the rematch', F.every((f) => S(f).players.every((p) => p.score === 0)));
    metric('battle.snapshot_max_bytes', N(host).snap.max);
    ok('battle: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors));
    dropAll();
  }

  // ================================================================ phase: the host leaves
  async function hostleave() {
    const { F, host } = await room(3, 'coop');
    await startRoom(F);
    await sleep(1000);
    host.mp.leave();
    const back = await until(() => F.slice(1).every((f) => N(f).screen === 'friends' && !S(f).online), 15000);
    ok('hostleave: guests drop back to the lobby when the host leaves', !!back, F.slice(1).map((f) => [N(f).screen, S(f).online]));
    const msgs = F.slice(1).map((f) => f.w.document.getElementById('pg-friends-err').textContent);
    ok('hostleave: ...with "방장이 나갔어요"', msgs.every((m) => m === '방장이 나갔어요'), msgs);
    ok('hostleave: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors));
    dropAll();
  }

  // ================================================================ phase: full room, late join
  async function full() {
    const { F, host, code } = await room(4, 'battle');
    const fifth = await frame(frames.length);
    const r = await fifth.mp.join(code, { nick: '다섯째' });
    ok('full: a 5th player is refused: full', !r.ok && r.code === 'full', r);
    ok('full: ...and told "방이 꽉 찼어요"', fifth.w.document.getElementById('pg-friends-err').textContent === '방이 꽉 찼어요', fifth.w.document.getElementById('pg-friends-err').textContent);
    const bad = await fifth.mp.join('zz99');
    ok('full: a wrong code: "방을 찾을 수 없어요"', !bad.ok && bad.code === 'not_found' && fifth.w.document.getElementById('pg-friends-err').textContent === '방을 찾을 수 없어요', bad);
    // a game in progress takes no late joiners
    F[3].mp.leave();
    await until(() => N(host).roster.length === 3, 15000);
    const started = await startRoom(F.slice(0, 3));
    ok('full: 3 start playing', started);
    const late = await fifth.mp.join(code, { nick: '늦은친구' });
    ok('full: joining a game in progress is refused: "이미 게임이 시작됐어요"', !late.ok && late.code === 'full' && late.reason === 'playing' &&
      fifth.w.document.getElementById('pg-friends-err').textContent === '이미 게임이 시작됐어요', late);
    ok('full: no page errors', frames.every((f) => !f.errors.length), frames.map((f) => f.errors));
    dropAll();
  }

  // ================================================================ phase: the artifact's 'room' runtime (faked here)
  // A small stand-in for window.claude.use('room' | 'user'), shared by the frames through this page: the main room
  // (lobby) and named rooms, presence only (per-field merge, top-level null removes, <= 4 KiB merged, nesting <= 8,
  // plain JSON), coalesced sends (~30/s), per-pair ordered delivery with latency + jitter, onPeers batched per frame
  // (first delivery = everyone joined), connected() / onConnection, leave(), emit refused. Violations are recorded.
  function makeRoomPlatform() {
    const pf = { latency: 40, jitter: 25, rooms: new Map(), violations: [], maxRate: 0, sends: 0, labelN: 0 };
    const members = (name) => { let s = pf.rooms.get(name); if (!s) { s = new Set(); pf.rooms.set(name, s); } return s; };
    const rerr = (code, m) => Object.assign(new Error(m || code), { code });
    const EMPTY = Object.freeze([]);
    const freeze = (o) => { if (o && typeof o === 'object') { Object.freeze(o); for (const k of Object.keys(o)) freeze(o[k]); } return o; };
    function depth(v) { if (!v || typeof v !== 'object') return 0; let d = 0; for (const k of Object.keys(v)) d = Math.max(d, depth(v[k])); return d + 1; }
    function plain(v) {
      if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
      if (typeof v === 'number') return Number.isFinite(v);
      if (Array.isArray(v)) return v.every(plain);
      // (objects come from the frames' realms: compare by tag, not by this page's Object.prototype)
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
      // (nothing leaves a page after it left the room)
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
        pf.maxPresence = Math.max(pf.maxPresence || 0, size);
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
  async function roomPhase() {
    try { localStorage.removeItem('ppogeul-nick'); } catch (e) { /* ignore */ }
    const pf = makeRoomPlatform();
    const A = await roomFrame(pf, 'Alice');
    A.mp.openFriends();
    await until(() => N(A).transport === 'room' && A.w.document.getElementById('pg-games-box') && !A.w.document.getElementById('pg-games-box').hidden, 5000);
    ok('room: the artifact runtime is there -> transport room, lobby list shown', N(A).transport === 'room' && !A.w.document.getElementById('pg-games-box').hidden, N(A).transport);
    ok('room: no PeerJS / bc fallback note, the room note instead', A.w.document.getElementById('pg-net-note').textContent.indexOf('열린 방') >= 0, A.w.document.getElementById('pg-net-note').textContent);
    const nickOk = await until(() => N(A).nick === 'Alice', 3000);
    ok('room: default nickname = the signed-in profile name', !!nickOk, N(A).nick);
    const code = await A.mp.host({ mode: 'coop', char: 'duck' });
    ok('room: hosting over room presence works', /^[a-z0-9]{4}$/.test(code || ''), code);
    const B = await roomFrame(pf, 'Bob');
    B.mp.setNick('Bob');
    B.mp.openFriends();
    const listed = await until(() => B.w.document.querySelectorAll('#pg-games .pg-game').length === 1, 5000);
    const btn = B.w.document.querySelector('#pg-games .pg-game');
    ok('room: the other page sees the open game in its lobby list', !!listed && btn && /Alice님의 방/.test(btn.textContent) && /같이 하기 · 1\/4/.test(btn.textContent), btn && btn.textContent);
    if (!btn) return dropAll();
    btn.click();
    const joined = await until(() => N(B).screen === 'room' && N(B).roster.length === 2 && N(A).roster.length === 2, 8000);
    ok('room: tapping it joins (both see 2 players)', !!joined, [N(A).roster.length, N(B).roster.length]);
    const C = await roomFrame(pf, 'Cara');
    C.mp.openFriends();
    await until(() => C.w.document.querySelectorAll('#pg-games .pg-game').length === 1, 5000);
    const btnC = C.w.document.querySelector('#pg-games .pg-game');
    ok('room: the listing counts players (2/4)', btnC && /2\/4/.test(btnC.textContent), btnC && btnC.textContent);
    const started = await startRoom([A, B]);
    ok('room: co-op starts over room presence', started, [S(A).phase, S(B).phase]);
    const unlisted = await until(() => C.w.document.querySelectorAll('#pg-games .pg-game').length === 0, 4000);
    ok('room: a game in progress leaves the lobby list', !!unlisted);
    // play a little over presence: the guest's shot traps an enemy
    parkAll(A);
    A.D.setInvincible(true);
    await sleep(500);
    const m = me(B);
    const target = stillEnemy(A, A.G.enemies[0], m.x + 44, m.y, -1);
    await sleep(600);
    await tap(B, 'right', 40); await sleep(300); await tap(B, 'shoot', 60);
    const trapped = await until(() => target.state === 'trapped' && target.bubble && target.bubble.owner === 1, 3000);
    ok('room: a guest\'s shot traps an enemy over room presence', !!trapped, target.state);
    await sleep(1000);
    metric('room.presence', { maxBytes: pf.maxPresence, maxCallsPerSec: pf.maxRate, sends: pf.sends });
    ok('room: presence stays within the platform rules (<= 4 KiB, plain JSON, depth <= 8)', !pf.violations.length, pf.violations.slice(0, 4));
    ok('room: presence calls <= 40/s per page', pf.maxRate <= 40, pf.maxRate);
    A.mp.leave();
    const back = await until(() => N(B).screen === 'friends', 25000);
    ok('room: host leaves -> guest back in the lobby with "방장이 나갔어요"', !!back && B.w.document.getElementById('pg-friends-err').textContent === '방장이 나갔어요', [N(B).screen, B.w.document.getElementById('pg-friends-err').textContent]);
    ok('room: no page errors', frames.every((f) => !f.errors.length), frames.map((f) => f.errors));
    dropAll();
  }

  // ================================================================ phase: 3-minute soak, 4 clients, random input
  async function soak() {
    const { F, host } = await room(4, 'coop', {}, ['duck', 'cat', 'otter', 'frog']);
    const started = await startRoom(F);
    ok('soak: 4 clients playing', started);
    if (!started) return dropAll();
    host.mp.trace(true);
    const acts = ['left', 'right', 'jump', 'shoot'];
    const t0 = clock(), total = SOAK * 1000, half = total / 2;
    let battleOn = false, nan = [], samples = 0, sameE = 0, worst = 0, worstAt = '', over4 = 0, restarts = 0;
    const sizes = [];
    while (clock() - t0 < total) {
      for (const f of F) for (const a of acts) press(f, a, Math.random() < (a === 'shoot' ? 0.45 : 0.32));
      await sleep(160);
      const ph = S(host).phase;
      // keep it going: a game over / ending restarts, the battle half switches modes through the room
      if (!battleOn && clock() - t0 > half) {
        // second half: everyone back to the room, the host switches it to a 2-minute battle (random arena)
        battleOn = true;
        host.mp.toRoom();
        await until(() => F.every((f) => N(f).screen === 'room'), 5000);
        host.mp.setOpts({ mode: 'battle', time: 2, arena: -1 });
        await until(() => F.every((f) => N(f).mode === 'battle'), 3000);
        const go = await startRoom(F);
        ok('soak: second half switched to battle', go && S(host).mode === 'battle', S(host).mode);
        host.mp.trace(true);
        continue;
      }
      if (ph === 'gameover' || ph === 'ending' || ph === 'podium') { restarts++; host.mp.again(); await sleep(400); continue; }
      if (Math.random() < 0.12) {
        const g = F[1 + Math.floor(Math.random() * 3)];
        const s = syncSample(host, g);
        if (s && S(g).phase === 'playing' && S(host).phase === 'playing') { samples++; if (s.sameE) sameE++; if (s.maxD > worst) { worst = s.maxD; worstAt = s.worstState; } if (s.maxD > 4) over4++; }
      }
      if (Math.random() < 0.1) {
        for (const f of F) { const bad = nanScan(S(f), 'state', []); if (bad.length) nan.push([f.i, bad]); }
        sizes.push(N(host).snap.bytes);
      }
    }
    for (const f of F) allIdle(f);
    for (const f of F) { const bad = nanScan(S(f), 'state', []); if (bad.length) nan.push([f.i, bad]); }
    const sn = N(host).snap;
    metric('soak.seconds', SOAK);
    metric('soak.snapshot_bytes', { max: sn.max, last: sn.bytes, count: sn.count, trims: sn.trims, refused: sn.refused, p50: sizes.sort((a, b) => a - b)[sizes.length >> 1] });
    metric('soak.view_sync', { samples, sameEnemyIds: sameE, worstPx: r1(worst), worstState: worstAt, samplesOver4px: over4 });
    metric('soak.restarts', restarts);
    metric('soak.guest_view_starved_frames', F.slice(1).map((f) => { const n = N(f); return n.viewFrames ? r1(100 * n.starvedFrames / n.viewFrames) + '% of ' + n.viewFrames : 'n/a'; }));
    ok('soak: no exceptions on any page', F.every((f) => !f.errors.length), F.map((f) => f.errors.slice(0, 3)));
    ok('soak: no NaN / Infinity in any page state', !nan.length, nan.slice(0, 4));
    ok('soak: every snapshot < 3.6 KB (none refused)', sn.max < 3600 && sn.refused === 0, sn);
    ok('soak: guest views kept matching the host world (enemy ids)', samples > 10 && sameE / samples > 0.8, { samples, sameE });
    ok('soak: all 4 still connected', F.every((f) => N(f).screen === 'game' || N(f).screen === 'room'), F.map((f) => N(f).screen));
    dropAll();
  }

  // ================================================================ screenshots
  function fill(fr) {
    for (const f of frames) f.el.style.visibility = f === fr ? 'visible' : 'hidden';
    fr.el.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;z-index:99;background:#0a2327';
    // a phone-sized window: the page behaves like a touch phone (touch pads, bigger targets)
    if (innerWidth < 600) { try { fr.w.dispatchEvent(new Event('touchstart')); } catch (e) { /* ignore */ } }
  }
  async function shot(name) {
    if (name === 'friendsnote') {
      // a plain page (no ?net, no artifact runtime, no PeerJS): online falls back to this browser's tabs, explained
      const f = await frame(0, { query: 'plain=1' });
      f.mp.openFriends();
      fill(f);
      await until(() => !f.w.document.getElementById('pg-net-note').hidden, 3000);
      ok('friendsnote: transport bc (fallback), the room explanation shown', N(f).transport === 'bc' && /초대받은 친구끼리만/.test(f.w.document.getElementById('pg-net-note').textContent), f.w.document.getElementById('pg-net-note').textContent);
      await sleep(500);
    } else if (name === 'friends') {
      const f = await frame(0);
      f.mp.setNick('뽀송이');
      f.mp.openFriends();
      f.w.document.querySelector('[data-mode="battle"]').click();
      fill(f);
      await sleep(900);
    } else if (name === 'room4' || name === 'room4g') {
      const { F } = await room(4, 'battle', { arena: 1, time: 3 }, ['duck', 'capy', 'otter', 'cat'], ['뽀송', '까삐랑', '해달이', '냥냥펀치']);
      F[1].mp.ready(true); F[2].mp.ready(true);
      await sleep(800);
      fill(name === 'room4' ? F[0] : F[1]);
      await sleep(700);
    } else if (name === 'coop') {
      const { F, host } = await room(3, 'coop', {}, ['duck', 'otter', 'frog'], ['뽀송', '해달이', '개굴']);
      await startRoom(F);
      fill(F[1]);
      host.D.setInvincible(true);
      for (const f of F) f.D.setInvincible(true);
      const t0 = clock();
      while (clock() - t0 < 5200) { for (const f of F) for (const a of ['left', 'right', 'jump', 'shoot']) press(f, a, Math.random() < (a === 'shoot' ? 0.5 : 0.3)); await sleep(200); }
      for (const f of F) allIdle(f);
      await sleep(250);
    } else if (name === 'boss') {
      // a boss in co-op, seen from a guest: 3 players at the 곰팡이 여왕 arena, half-lathered, everyone moving and shooting
      const { F, host } = await room(3, 'coop', {}, ['penguin', 'capy', 'cat'], ['뽀송', '까삐랑', '냥냥']);
      await startRoom(F);
      host.D.gotoRound(11);
      await until(() => F.every((f) => V(f).boss && V(f).round === 11), 5000);
      fill(F[1]);
      host.D.setInvincible(true);
      for (const f of F) f.D.setInvincible(true);
      const t0 = clock();
      while (clock() - t0 < 6500) { for (const f of F) for (const a of ['left', 'right', 'jump', 'shoot']) press(f, a, Math.random() < (a === 'shoot' ? 0.6 : 0.3)); await sleep(200); }
      for (const f of F) allIdle(f);
      if (host.G.boss && host.G.boss.state === 'fight') host.D.soapBoss(Math.max(0, Math.floor(host.G.boss.soapMax * 0.6) - host.G.boss.soap));
      await sleep(600);
      ok('boss shot: the guest sees the boss with its soap gauge', !!V(F[1]).boss && V(F[1]).boss.soap > 0, V(F[1]).boss);
    } else if (name === 'battle' || name === 'podium') {
      const { F, host } = await room(4, 'battle', { arena: 3, time: 3 }, ['duck', 'cat', 'frog', 'penguin'], ['뽀송', '냥냥', '개굴', '펭펭']);
      await startRoom(F);
      fill(F[2]);
      for (const f of F) f.D.setInvincible(true);
      host.D.setInvincible(true);
      const t0 = clock();
      while (clock() - t0 < 6000) { for (const f of F) for (const a of ['left', 'right', 'jump', 'shoot']) press(f, a, Math.random() < (a === 'shoot' ? 0.5 : 0.3)); await sleep(200); }
      for (const f of F) allIdle(f);
      if (name === 'podium') {
        host.D.setTimeLeft(1);
        await until(() => F.every((f) => S(f).phase === 'podium'), 6000);
        await sleep(2200);
      } else await sleep(200);
    }
    log('SHOT READY ' + name);
  }

  async function main() {
    log('MPNET link: ' + LINK);
    if (SHOT) { try { await shot(SHOT); } catch (e) { log('SHOT error ' + (e && e.stack)); log('SHOT READY ' + SHOT); } return; }
    const phases = { coop2, coop4, battle, hostleave, full, room: roomPhase, soak };
    for (const name of Object.keys(phases)) {
      if (ONLY.length && !ONLY.includes(name)) continue;
      const t0 = clock();
      try { await phases[name](); } catch (e) { fail++; log('MPNET FAIL ' + name + ' threw: ' + (e && e.stack)); dropAll(); }
      log('MPNET INFO phase ' + name + ' took ' + Math.round((clock() - t0) / 1000) + ' s');
      await sleep(400);
    }
    log('MPNET DONE pass=' + pass + ' fail=' + fail);
  }
  setTimeout(main, 300);
})();
