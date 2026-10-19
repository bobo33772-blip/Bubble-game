// v4 kit LOOKS online (char-kits §2.4, §2.6, §9.1): what the OTHER screens draw. 3 same-origin iframes on PG.Net 'bc'
// in a battle (arena 1): host = duck (slot 0), guest A = capy (slot 1), guest B = penguin (slot 2). Bubble looks on a
// guest come from owner slot -> animal (+ the droplet / yarn bits), its own predictions carry k; move effects come
// from the streamed body bits and their edges at the drawn spot. ?off=1 runs it with 능력 끄기 (every look plain).
//   node tools/serve.js   (background)
//   node tools/run-chrome.js http://localhost:8765/test-kits-online.html kits-online.png 1200 800 rt90000 "KO DONE"
// The screenshot: each screen's canvas (1.5x) at two moments - bubbles of all three in flight + the duck gliding,
// then the capy's slam landing as each screen saw it. Prints "KO PASS|FAIL <name>", "KO INFO ..." and "KO DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => { if (cond) { pass++; log('KO PASS ' + name); } else { fail++; log('KO FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); } return !!cond; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(pred, ms, stepMs) {
    const t0 = performance.now();
    for (;;) { let v = false; try { v = pred(); } catch (e) { v = false; } if (v) return v; if (performance.now() - t0 > ms) return false; await sleep(stepMs || 10); }
  }
  const OFF = /[?&]off=1/.test(location.search);
  try { PG.debug.G.manual = true; } catch (e) { /* ignore */ }
  function frame(i) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'preview.html?net=bc&lat=8&jit=4&drop=0&frame=' + i;
      f.style.cssText = 'position:fixed;left:' + i * 400 + 'px;top:0;width:400px;height:360px;border:0';
      const t = setTimeout(() => reject(new Error('frame ' + i)), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        if (!(await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.Net, 15000))) { reject(new Error('no PG ' + i)); return; }
        clearTimeout(t);
        w.addEventListener('error', (e) => { fail++; log('KO frame ' + i + ' error: ' + e.message + ' @' + e.lineno); });
        resolve({ i, w, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, cv: w.document.getElementById('pg-canvas') });
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
  // ---- the sheet: canvases copied at a moment, labelled
  const shots = [];
  function grab(label, F) {
    const row = { label, cs: [] };
    for (const fr of F) {
      const c = document.createElement('canvas'); c.width = 384; c.height = 336;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(fr.cv, 0, 0, 256, 224, 0, 0, 384, 336);
      row.cs.push([['host duck', 'guest A capy', 'guest B penguin'][fr.i] + ' screen', c]);
    }
    shots.push(row);
  }
  function grabOne(label, fr) { const row = { label, cs: [] }; const c = document.createElement('canvas'); c.width = 384; c.height = 336; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(fr.cv, 0, 0, 256, 224, 0, 0, 384, 336); row.cs.push(['', c]); return row; }
  function showSheet() {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b1c1f;color:#e8f4f0;font:12px system-ui,sans-serif;padding:6px;overflow:hidden;display:flex;flex-wrap:wrap;gap:4px 8px;align-content:flex-start';
    for (const r of shots) for (const [lab, c] of r.cs) {
      const f = document.createElement('figure'); f.style.cssText = 'margin:0';
      const cap = document.createElement('figcaption'); cap.textContent = r.label + (lab ? ' - ' + lab : ''); cap.style.cssText = 'font-size:11px;line-height:13px;white-space:nowrap';
      c.style.cssText = 'display:block;image-rendering:pixelated;border:1px solid #2f5f5a';
      f.append(cap, c); box.appendChild(f);
    }
    document.body.appendChild(box);
  }

  async function run() {
    const F = [await frame(0), await frame(1), await frame(2)];
    const [host, ga, gb] = F;
    const code = await host.mp.host({ mode: 'battle', nick: '방장', char: 'duck', arena: 0, perks: !OFF, intrusion: false });
    await ga.mp.join(code, { nick: '까삐', char: 'capy' });
    await gb.mp.join(code, { nick: '펭펭', char: 'penguin' });
    await until(() => N(host).roster.length === 3, 8000);
    ga.mp.ready(true); gb.mp.ready(true);
    await until(() => N(host).canStart, 8000);
    host.mp.start();
    const playing = await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online) && N(ga).ctl === 'local' && N(gb).ctl === 'local', 15000);
    if (!ok('battle up: host duck, guest capy, guest penguin (perks ' + (OFF ? 'off' : 'on') + ')', playing, F.map((f) => S(f).phase))) return done();
    for (const f of F) f.D.setInvincible(true);
    host.G.enemies.length = 0;
    host.G.battle.enemyT = 1e9; host.G.battle.powerT = 1e9;
    // into open air (the spawns sit under ledges): the duck walks right to x ~60, the capy left to x ~180
    press(host, 'right', true); press(ga, 'left', true);
    await until(() => me(host).x >= 58, 3000, 4); press(host, 'right', false);
    await until(() => me(ga).x <= 182, 3000, 4); press(ga, 'left', false);
    await tap(ga, 'right', 20); await tap(ga, 'left', 20);
    await sleep(300);

    // ---- 1. all three blow (the duck while gliding): every screen draws each animal's look
    press(host, 'jump', true);            // (held: the duck glides once it falls)
    await sleep(420); await tap(host, 'shoot');
    await sleep(110); await tap(ga, 'shoot');
    await sleep(40); const tB = performance.now(); await tap(gb, 'shoot');
    await sleep(60); grab('1 blown', F);
    await sleep(160);
    // (the glide is read at this moment - held longer, the duck lands)
    const gl = host.G.players.find((p) => p.slot === 0);
    const viewGlide = [ga, gb].map((fr) => { const v = fr.G.players.find((p) => p.slot === 0); return !!(v && v.mvA); });
    if (!OFF) ok('the host duck glides and both guests see bit A', gl.mv === 'glide' && viewGlide.every(Boolean), [gl.mv, viewGlide]);
    press(host, 'jump', false);
    const looks = (fr) => fr.G.bubbles.filter((b) => b.kind === 'empty' && !b.dead).map((b) => b.owner + ':' + (fr.D.bubbleLook(b) || '-') + (b.pred ? 'p' : '') + (b.drop ? 'd' : ''));
    const want = { 0: 'duck', 1: 'capy', 2: 'penguin' };
    const right = (fr) => fr.G.bubbles.filter((b) => b.kind === 'empty' && !b.dead && b.owner >= 0).every((b) => fr.D.bubbleLook(b) === (OFF ? null : want[b.owner]));
    const count = (fr) => new Set(fr.G.bubbles.filter((b) => b.kind === 'empty' && !b.dead && b.owner >= 0).map((b) => b.owner)).size;
    // a guest's bubble reaches the OTHER guest's screen 220-275 ms after the press (measured at this link: the shot
    // message to the host, the next snapshot (3 f), the link, the 133 ms view delay) - waited for, not raced (a fixed
    // 260 ms here failed when a frame ran late); 700 ms is still inside the icicle's 433 ms flight + its float
    const all3 = await until(() => F.every((fr) => count(fr) === 3), Math.max(0, 700 - (performance.now() - tB)), 4);
    log('KO INFO all three blowers on every screen ' + (all3 ? (performance.now() - tB).toFixed(0) + ' ms after guest B pressed' : 'never (700 ms)'));
    const L = F.map(looks);
    log('KO INFO looks (owner:animal, p = my prediction) host [' + L[0].join(' ') + '] A [' + L[1].join(' ') + '] B [' + L[2].join(' ') + ']');
    ok('every screen sees all three blowers\' bubbles', F.every((fr) => count(fr) === 3), F.map(count));
    ok(OFF ? 'perks off: every bubble keeps the plain look on every screen' : 'every screen draws each bubble with its blower\'s animal (owner -> animal / k)', F.every(right), L);

    // ---- 2. guest A's capy slams: the landing splash on its own screen and as the others saw it (B's rising edge)
    await sleep(900);
    const A = me(ga);
    const viewers = [host, gb].map((fr) => ({ fr, p: () => fr.G.players.find((q) => q.slot === slotOf(ga)), bAt: null }));
    for (const v of viewers) { const p = v.p(); v.bAt = p && p.fx ? p.fx.bAt : 0; }
    await tap(ga, 'jump');
    await until(() => A.vy >= 0 && !A.onGround, 2000, 4);
    await tap(ga, 'jump');
    const landed = await until(() => A.mv === 'rec', 2000, 4);
    if (!OFF) ok('guest capy slams and lands (its own screen)', !!landed, A.mv);
    await sleep(40); const own = grabOne('2 slam: guest A capy (own)', ga);
    const seen = [];
    for (const v of viewers) {
      const s = await until(() => { const p = v.p(); return p && p.fx && p.fx.bAt !== v.bAt; }, 1500, 4);
      seen.push(!!s);
      if (s) { await sleep(50); shots.push(grabOne('2 slam as ' + (v.fr === host ? 'the host' : 'guest B') + ' saw it', v.fr)); }
    }
    shots.splice(1, 0, own);
    if (OFF) ok('perks off: no screen ever saw a move edge', !A.mv && viewers.every((v) => { const p = v.p(); return !p || !p.fx || (!p.fx.a && !p.fx.b); }));
    else ok('the host and guest B both see the slam landing (B rises in their view)', seen.every(Boolean), seen);
    return done();
  }
  function done() {
    try { showSheet(); } catch (e) { log('KO FAIL sheet ' + e.message); fail++; }
    log('KO DONE pass=' + pass + ' fail=' + fail);
  }
  run().catch((e) => { fail++; log('KO FAIL driver error :: ' + (e && e.stack)); done(); });
})();
