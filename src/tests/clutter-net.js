// Floating EMPTY bubbles online (game.js EMPTY_RULE / emptyRule() / capEmpties(), see clutter.js): a guest runs the
// same rule as its host and sees the host's pops. 2 same-origin iframes of preview.html on PG.Net 'bc' (lat 20 / jit
// 10), real time, a flat lab floor over round 1 / arena 1 on both engines:
//   co-op  host duck + guest penguin: the guest's rule = the host's (330 + 90, 7 each, 14 in all); the guest blows 9 -
//          on the host at most 7 of them ever count at once, the cap ends the 2 oldest (they blink 30 frames, then the
//          plain self-pop at 421), and the guest's view shows those very bubbles blinking ~30 frames and popping, then 7
//          of its own floating; one bubble pops by itself on the host at age 421 and the guest drew it blinking (its view
//          age past 330) for ~90 frames before it popped; the guest blinks at the life its host sends (g.el): an older
//          host's snapshots (no g.el) -> 720, what such a host runs; a bubble the guest bounces on is marked ridden on the
//          host (the cap skips it)
//   battle host capy + guest penguin (no monsters): the rule 210 + 90, 3 each, 12 in all on both screens; 8 blows -
//          at most 3 of the guest's float at once (3 out in all), the 4th..8th each pop the oldest at once (no blink, no
//          chain) on the host, and the guest's view sees those very pops, then its 3 floating (the battle magazine off:
//          the backstop alone)
//   node tools/serve.js   (background)
//   node tools/run-chrome.js http://localhost:8765/test-clutter-net.html - 1200 500 rt240000 "CLUTTERNET DONE"
// Prints "CLUTTERNET PASS|FAIL <name>", "CLUTTERNET INFO ..." and "CLUTTERNET DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const J = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
  const ok = (name, cond, inf) => {
    if (cond) { pass++; log('CLUTTERNET PASS ' + name); } else { fail++; log('CLUTTERNET FAIL ' + name + (inf !== undefined ? ' :: ' + J(inf).slice(0, 900) : '')); }
    return !!cond;
  };
  const info = (s) => log('CLUTTERNET INFO ' + s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(pred, ms, stepMs) {
    const t0 = performance.now();
    for (;;) { let v = false; try { v = pred(); } catch (e) { v = false; } if (v) return v; if (performance.now() - t0 > ms) return false; await sleep(stepMs || 15); }
  }
  try { PG.debug.G.manual = true; PG.Audio.setMuted(true); } catch (e) { /* ignore */ }
  window.addEventListener('error', (e) => { fail++; log('CLUTTERNET FAIL driver page error: ' + e.message + ' @' + e.lineno); });
  const TS = 8, FLOOR = 16 + 25 * TS;

  function frame(i) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'preview.html?net=bc&lat=20&jit=10&drop=0&frame=' + i;
      f.style.cssText = 'position:fixed;left:' + i * 600 + 'px;top:0;width:600px;height:450px;border:0';
      const t = setTimeout(() => reject(new Error('frame ' + i)), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        if (!(await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.Net, 15000))) { reject(new Error('no PG ' + i)); return; }
        clearTimeout(t);
        const fr = { i, el: f, w, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, errors: [] };
        try { w.PG.Audio.setMuted(true); } catch (e) { /* ignore */ }
        w.addEventListener('error', (e) => { fail++; fr.errors.push(e.message); log('CLUTTERNET FAIL frame ' + i + ' page error: ' + e.message + ' @' + e.lineno); });
        // the lab floor on every engine (the host's world and the guest's physics / view agree on it)
        const map = []; for (let r = 0; r < 26; r++) map.push(r === 0 || r === 25 ? '#'.repeat(32) : '##' + '.'.repeat(28) + '##');
        const spawns = [{ col: 26, row: 24 }, { col: 3, row: 24 }, { col: 10, row: 24 }, { col: 20, row: 24 }];
        Object.assign(fr.D.levels()[0], { map, player: spawns[0], players: spawns, gather: { col: 16, row: 3 }, gapX: 128, special: undefined, boss: null,
          enemies: [{ type: 'mold', col: 3, row: 10, dir: 1 }, { type: 'mold', col: 12, row: 10, dir: 1 }] });
        Object.assign(fr.D.arenas()[0], { map, players: spawns, gather: { col: 16, row: 3 }, enemySpawns: [{ col: 6, row: 24 }, { col: 24, row: 24 }] });
        resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  const S = (fr) => fr.D.getState();
  const N = (fr) => fr.mp.state();
  const slotOf = (fr) => N(fr).mySlot;
  const me = (fr) => fr.G.players.find((p) => p.slot === slotOf(fr));
  const press = (fr, a, down) => fr.D.press(a, down, slotOf(fr));
  async function tap(fr, a, ms) { press(fr, a, true); await sleep(ms || 40); press(fr, a, false); }
  const parkAll = (host) => { for (const e of host.G.enemies) { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; } };
  // a callback after each engine frame inside that iframe (a rAF registered after the engine's own)
  function sampler(fr, fn) { let on = true; const tick = () => { if (!on) return; try { fn(); } catch (e) { /* ignore */ } fr.w.requestAnimationFrame(tick); }; fr.w.requestAnimationFrame(tick); return () => { on = false; }; }
  const stand = (fr, x, facing) => Object.assign(me(fr), { x, y: FLOOR - 16, vx: 0, vy: 0, onGround: true, facing: facing || 1, water: 0, waterSkip: 0, coyote: 0, jumpBuf: 0, shootCd: 0, autoCd: 0, shootBuf: 0,
    airT: 0, mv: '', mvT: 0, mvUsed: false, mvCd: 0, glideT: 0, carry: false, hop: 0, hopAir: false, landT: 30, sq: 0 });
  async function room(chars, opts) {
    const F = [await frame(0), await frame(1)];
    const [host, g] = F;
    const code = await host.mp.host(Object.assign({ nick: '방장', char: chars[0] }, opts));
    await g.mp.join(code, { nick: '손님', char: chars[1] });
    await until(() => N(host).roster.length === 2, 8000);
    g.mp.ready(true);
    await until(() => N(host).canStart, 8000);
    host.mp.start();
    const up = await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online) && N(g).ctl === 'local', 20000);
    for (const f of F) f.D.setInvincible(true);
    return { F, host, g, up: !!up };
  }
  async function drop(F) {
    for (const f of F) { try { f.mp.leave(); } catch (e) { /* ignore */ } }
    await sleep(400);
    for (const f of F) f.el.remove();
    await sleep(300);
  }
  // the guest blows n bubbles (gap ms apart, standing at the left facing right); returns what the host and the guest's
  // view saw of the guest's bubbles: the most that floated at once on the host and not blinking yet (age <= life) / in
  // all, the host's pops of them while floating (id -> {age, chain, real: frames since the blow}), the ids the guest's
  // view saw popping (+ when it first drew each blinking / popping), its view of its own floating bubbles at the end
  async function blowSeries(host, g, n, gap, settleMs) {
    const gs = slotOf(g), life = host.D.emptyRule().life;
    const hostSeen = new Map(), hostPops = new Map(), viewPops = new Set(), viewAge = new Map(), viewBlink = new Map(), viewPopAt = new Map();
    let most = 0, mostAll = 0;
    const s1 = sampler(host, () => {
      let k = 0, a = 0;
      for (const b of host.G.bubbles) {
        if (b.owner !== gs || b.kind !== 'empty') continue;
        if (b.state === 'float' && !b.dead) { a++; if (b.age <= life) k++; hostSeen.set(b.id, b); }
        else if (b.state === 'pop' && hostSeen.has(b.id) && !hostPops.has(b.id)) hostPops.set(b.id, { age: b.age, chain: !!b.chain, real: host.G.frame - b.born });
      }
      most = Math.max(most, k); mostAll = Math.max(mostAll, a);
    });
    const s2 = sampler(g, () => {
      const gl = g.D.emptyRule().life, now = performance.now();
      for (const b of g.G.bubbles) {
        if (b.pred || b.owner !== gs || b.kind !== 'empty') continue;
        if (b.state === 'pop') { viewPops.add(b.id); if (!viewPopAt.has(b.id)) viewPopAt.set(b.id, now); }
        else if (b.state === 'float') { viewAge.set(b.id, Math.max(viewAge.get(b.id) || 0, b.age)); if (b.age > gl && !viewBlink.has(b.id)) viewBlink.set(b.id, now); }
      }
    });
    for (let i = 0; i < n; i++) { stand(g, 24, 1); await tap(g, 'shoot'); await sleep(gap); }
    await sleep(settleMs);
    s1(); s2();
    const viewFloat = g.G.bubbles.filter((b) => !b.pred && b.owner === gs && b.kind === 'empty' && b.state === 'float' && !b.dead).length;
    const blown = Array.from(hostSeen.keys()).sort((a, b) => a - b);
    return { gs, most, mostAll, hostPops, viewPops, viewAge, viewBlink, viewPopAt, viewFloat, blown, hostSeen };
  }
  // the cap's pops: no chain, long before the life's own end (the frames since the blow); the guest's view drew each one
  // blinking for ~30 frames (300-900 ms) before it saw it pop
  const capPopsOf = (r, before) => Array.from(r.hostPops.entries()).filter(([, v]) => !v.chain && v.real < before).map(([id]) => id).sort((a, b) => a - b);
  const viewBlinkMs = (r, ids) => ids.map((id) => (r.viewBlink.has(id) && r.viewPopAt.has(id) ? Math.round(r.viewPopAt.get(id) - r.viewBlink.get(id)) : -1));

  async function coopPhase() {
    const R = await room(['duck', 'penguin'], { mode: 'coop' });
    const { F, host, g } = R;
    if (!ok('co-op: up (host duck, guest penguin)', R.up, F.map((f) => S(f).phase))) return drop(F);
    parkAll(host); host.G.stampT = 1e9;
    stand(host, 216, -1);
    const hr = host.D.emptyRule(), gr = g.D.emptyRule();
    ok('co-op: the guest runs the host\'s rule (330 + 90, 7 each, 14 in all)', J(hr) === J(gr) && hr.life === 330 && hr.flash === 90 && hr.cap === 7 && hr.all === 14, { host: hr, guest: gr });
    await sleep(300);
    // ---- the cap: 9 blows -> 7 counted, the 2 oldest blink then pop by themselves; the guest's view sees those very pops
    const r = await blowSeries(host, g, 9, 380, 1300);
    const capPops = capPopsOf(r, 410), oldest2 = r.blown.slice(0, 2), bms = viewBlinkMs(r, capPops);
    info('co-op cap: host saw ' + r.blown.length + ' of the guest\'s bubbles float, most at once ' + r.most + ' (+ blinking ' + r.mostAll + '), cap pops ' + J(capPops) + ' (oldest ' + J(oldest2) + ') at ages ' +
      J(capPops.map((id) => r.hostPops.get(id).age)) + ' / real ' + J(capPops.map((id) => r.hostPops.get(id).real)) + ', guest view blinked them ' + J(bms) + ' ms, popping ' + J(Array.from(r.viewPops)) + ', floating now ' + r.viewFloat);
    ok('co-op: at most 7 of the guest\'s bubbles ever count at once on the host; its 2 oldest blinked out by themselves (no chain, at 421)', r.blown.length === 9 && r.most === 7 && r.mostAll <= 9 && J(capPops) === J(oldest2) && capPops.every((id) => r.hostPops.get(id).age === 421),
      { blown: r.blown, most: r.most, mostAll: r.mostAll, capPops, pops: Array.from(r.hostPops.entries()) });
    ok('co-op: the guest\'s view drew those 2 blinking ~30 frames (300-900 ms), saw them pop, then its 7 floating', capPops.length === 2 && capPops.every((id) => r.viewPops.has(id)) && bms.every((ms) => ms >= 300 && ms <= 900) && r.viewFloat === 7,
      { viewPops: Array.from(r.viewPops), bms, viewFloat: r.viewFloat });
    // ---- the life + the blink on the guest: one of the remaining 5 pops by itself on the host at 421
    const gs = r.gs, left = Array.from(r.hostSeen.values()).filter((b) => !b.dead && b.state === 'float');
    const b = left.length ? left[left.length - 1] : null;
    if (!ok('co-op: a bubble of the guest\'s still floating', !!b)) return drop(F);
    // (bring it near its end at once: the host world is the truth, the guest's view follows the snapshots' age)
    for (const o of left) if (o !== b) o.age = -2000;
    b.age = 300;
    let popAt = -1, firstBlink = -1, popSeen = -1, maxViewAge = 0;
    const s1 = sampler(host, () => { if (popAt < 0 && b.state === 'pop') popAt = b.age; });
    const s2 = sampler(g, () => {
      const v = g.G.bubbles.find((o) => o.id === b.id && !o.pred);
      if (!v) return;
      if (v.state === 'float') { maxViewAge = Math.max(maxViewAge, v.age); if (v.age > g.D.emptyRule().life && firstBlink < 0) firstBlink = performance.now(); }
      if (v.state === 'pop' && popSeen < 0) popSeen = performance.now();
    });
    await until(() => popSeen > 0, 6000, 10);
    s1(); s2();
    const blinkMs = firstBlink > 0 && popSeen > 0 ? Math.round(popSeen - firstBlink) : -1;
    info('co-op life: host pop age ' + popAt + ', guest view: blink from age > 330 for ' + blinkMs + ' ms before it saw the pop (90 f = 1500 ms), its last floating age ' + maxViewAge);
    ok('co-op: the bubble pops by itself on the host at age 421', popAt === 421, popAt);
    ok('co-op: the guest drew it blinking (view age past 330) ~90 frames before it saw it pop (1.2-1.8 s)', blinkMs >= 1200 && blinkMs <= 1800 && maxViewAge > 330 && maxViewAge <= 426, { blinkMs, maxViewAge });
    // ---- the blink follows the life the host sends (g.el), not the guest's own table: an older host's snapshots carry
    // none (it runs EMPTY_LIFE = 720) - shown here by dropping the field from this host's snapshots for a moment
    const sess = host.w.PG.Net._sessions().find((x) => x.role === 'host');
    const send0 = sess && sess.setState;
    let sentEl = null, oldHost = false;
    if (sess) sess.setState = (st) => { if (st && st.g) { if (sentEl === null) sentEl = st.g.el; if (oldHost) { st = Object.assign({}, st, { g: Object.assign({}, st.g) }); delete st.g.el; } } return send0.call(sess, st); };
    await sleep(400);
    const lifeNew = g.D.emptyRule().life;
    oldHost = true; await sleep(500);
    const lifeOld = g.D.emptyRule().life;
    oldHost = false; await sleep(500);
    const lifeBack = g.D.emptyRule().life;
    if (sess) sess.setState = send0;
    info('co-op g.el: the host sends ' + sentEl + '; the guest blinks at ' + lifeNew + ', with an older host\'s snapshot ' + lifeOld + ', then again ' + lifeBack);
    ok('co-op: the host sends its life (g.el 330); the guest blinks at it, at 720 for an older host\'s snapshot (no g.el), at 330 again after', !!sess && sentEl === 330 && lifeNew === 330 && lifeOld === 720 && lifeBack === 330, { sess: !!sess, sentEl, lifeNew, lifeOld, lifeBack });
    // ---- riding online: the guest bounces on a bubble in its view -> the host marks its bubble ridden (the cap skips it)
    const hs = slotOf(host), rb = host.D.spawnBubble('empty', 120, 120);
    rb.owner = hs; rb.age = -2000;
    let viewRb = null;
    await until(() => (viewRb = g.G.bubbles.find((o) => o.id === rb.id && !o.pred && o.state === 'float')), 3000);
    let tries = 0;
    const stopRide = sampler(g, () => {
      const v = g.G.bubbles.find((o) => o.id === rb.id && !o.pred && o.state === 'float');
      if (!v || rb.rideF !== undefined) return;
      tries++;
      Object.assign(me(g), { x: v.x, y: v.y - 12, vx: 0, vy: 0.6, onGround: false, coyote: 0, jumpBuf: 0, mv: '', invuln: 0, stunT: 0, water: 0 });
    });
    press(g, 'jump', true);
    await until(() => rb.rideF !== undefined || rb.dead || rb.state === 'pop', 4000, 10);
    press(g, 'jump', false); stopRide();
    const rodeOk = rb.rideF !== undefined && !rb.dead && rb.state === 'float';
    info('co-op ride online: the guest\'s view had it ' + !!viewRb + ', placed over it ' + tries + ' frames, host bubble ' + rb.state + (rb.dead ? ' (dead)' : '') + ', rideF ' + rb.rideF + ' (host frame ' + host.G.frame + ')');
    ok('co-op: a bubble the guest bounces on stays on the host and is marked ridden there (the cap skips it)', rodeOk, { st: rb.state, dead: rb.dead, rideF: rb.rideF, tries });
    rb.age = 2000; // (gone)
    void gs;
    ok('co-op: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors));
    return drop(F);
  }

  async function battlePhase() {
    const R = await room(['capy', 'penguin'], { mode: 'battle', arena: 0, monsters: false, intrusion: false });
    const { F, host, g } = R;
    if (!ok('battle: up (host capy, guest penguin, no monsters)', R.up, F.map((f) => S(f).phase))) return drop(F);
    host.G.enemies.length = 0;
    if (host.G.battle) { host.G.battle.enemyT = 1e9; host.G.battle.powerT = 1e9; }
    stand(host, 216, -1);
    host.D.ammo.off(true); g.D.ammo.off(true); // (the backstop alone: the battle magazine off on both pages - battle-net's ammo room has it)
    const hr = host.D.emptyRule(), gr = g.D.emptyRule();
    ok('battle: the guest runs the host\'s rule (210 + 90, 3 each, 12 in all)', J(hr) === J(gr) && hr.life === 210 && hr.flash === 90 && hr.cap === 3 && hr.all === 12, { host: hr, guest: gr });
    await sleep(300);
    const r = await blowSeries(host, g, 8, 380, 1100);
    const capPops = capPopsOf(r, 200), oldest5 = r.blown.slice(0, 5);
    info('battle cap: host saw ' + r.blown.length + ' float, most at once ' + r.most + ' (+ blinking ' + r.mostAll + '), cap pops ' + J(capPops) + ' at ages ' + J(capPops.map((id) => r.hostPops.get(id).age)) +
      ', guest view blinked ' + J(capPops.map((id) => r.viewBlink.has(id))) + ', popping ' + J(Array.from(r.viewPops)) + ', floating now ' + r.viewFloat);
    ok('battle: at most 3 of the guest\'s bubbles float at once on the host; each blow past 3 popped its oldest at once (no blink, no chain)', r.blown.length === 8 && r.most === 3 && r.mostAll === 3 && J(capPops) === J(oldest5) && capPops.every((id) => r.hostPops.get(id).age < 150),
      { blown: r.blown, most: r.most, mostAll: r.mostAll, capPops, pops: Array.from(r.hostPops.entries()) });
    ok('battle: the guest\'s view saw those very pops (never drawn blinking), then its 3 floating', capPops.length === 5 && capPops.every((id) => r.viewPops.has(id) && !r.viewBlink.has(id)) && r.viewFloat === 3,
      { viewPops: Array.from(r.viewPops), viewFloat: r.viewFloat });
    ok('battle: no page errors', F.every((f) => !f.errors.length), F.map((f) => f.errors));
    return drop(F);
  }

  async function run() {
    await coopPhase();
    await battlePhase();
    log('CLUTTERNET DONE pass=' + pass + ' fail=' + fail);
  }
  run().catch((e) => { fail++; log('CLUTTERNET FAIL driver error :: ' + (e && e.stack)); log('CLUTTERNET DONE pass=' + pass + ' fail=' + fail); });
})();
