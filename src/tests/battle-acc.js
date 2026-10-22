// Battle hit accuracy online, in real time: 3 same-origin iframes of preview.html on PG.Net's 'bc' transport with a
// simulated link, bots blowing bubbles at each other (built to test-battle-acc.html; serve the build dir with
// tools/serve.js):  node tools/run-chrome.js http://localhost:8765/test-battle-acc.html - 1200 900 rt300000 "BACC DONE"
// ?link=lat=60&jit=0 (per page, applied on both ends: ~120 ms one way), ?secs=40, ?chars=duck,penguin,capy, ?perks=0
// Every screen records, per world frame (PG.debug.mp.tap: the players where that screen draws them), each of its own
// capture-phase bubbles (the host's real ones, a guest's predicted copies) against each free rival it shows:
//   hit = the engine's rival test (rP against the 12x14 body box)   vis = the drawn ring (9 s + 1) on the drawn 16x16 body
// The host records every battle trap. Then, per case (host shooter -> guest, guest -> host, guest -> guest):
//   (a) shooter saw a hit (hit or vis overlap) but the host never trapped that victim by that shooter (within 1.5 s)
//   (b) the host trapped a victim with no vis overlap on that shooter's screen (within 1.5 s before)
//   (c) vis overlaps with no hit overlap on the same screen (a visible touch the local test does not count)
// and the clutter: the most / mean capture-phase shots in flight per player on the host.
// Prints "BACC METRIC <name> <json>" and "BACC DONE pass=N fail=M" (pass = the run produced engagements; the numbers
// are the output: not a run-all job - battle-net.js and kits.js hold the deterministic checks).
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const LINK = Q.get('link') || 'lat=60&jit=0';
  const SECS = +(Q.get('secs') || 40);
  const CHARS = (Q.get('chars') || 'duck,penguin,capy').split(',');
  const PERKS = Q.get('perks') !== '0';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => { if (cond) { pass++; log('BACC PASS ' + name); } else { fail++; log('BACC FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); } };
  const metric = (name, v) => log('BACC METRIC ' + name + ' ' + JSON.stringify(v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const now = () => performance.now();
  async function until(pred, ms) { const t0 = now(); for (;;) { let v = false; try { v = pred(); } catch (e) { v = false; } if (v) return v; if (now() - t0 > ms) return false; await sleep(20); } }
  try { PG.debug.G.manual = true; } catch (e) { /* ignore */ }
  const frames = [];
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
        const fr = { i, w, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G };
        w.addEventListener('error', (e) => { fail++; log('BACC frame ' + i + ' page error: ' + e.message); });
        frames.push(fr); resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  const N = (fr) => fr.mp.state();
  const S = (fr) => fr.D.getState();
  // the drawn ring of a capture-phase bubble (drawKitBubble / drawBubble + ownerRing: 2 px at r 9 x scale)
  const KC = ['', 'duck', 'capy', 'otter', 'penguin', 'cat', 'frog'];
  function ring(b) {
    const ch = PERKS ? KC[b.k | 0] || '' : '';
    let s = b.big ? 1.25 : 1;
    if (ch === 'capy') s = b.big ? 1.5 : 1.25; else if (ch === 'frog') s *= 0.9;
    if (b.drop) s = b.big ? 0.9 : 0.65;
    let sx = s, sy = s;
    if (ch === 'penguin' && b.state === 'shot') { sx = s * 1.15; sy = s * 0.87; }
    return [9 * sx + 1, 9 * sy + 1];
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function ellBox(cx, cy, rx, ry, bx, by, bw, bh) { const k = rx / ry, nx = clamp(cx, bx, bx + bw), ny = clamp(cy * k, by * k, (by + bh) * k), dx = cx - nx, dy = cy * k - ny; return dx * dx + dy * dy < rx * rx; }
  const freeShown = (p) => !p.dead && !p.trap && !(p.koT > 0) && !p.out && !p.ghost && !(p.invuln > 0);

  async function run() {
    const F = [];
    for (let i = 0; i < 3; i++) F.push(await frame(i));
    const [H] = F;
    const code = await H.mp.host({ mode: 'battle', nick: '방장', char: CHARS[0], arena: 0, time: 2, perks: PERKS, intrusion: false });
    for (let i = 1; i < 3; i++) await F[i].mp.join(code, { nick: '친구' + i, char: CHARS[i % CHARS.length] });
    await until(() => N(H).roster.length === 3, 8000);
    for (const f of F.slice(1)) f.mp.ready(true);
    await until(() => N(H).canStart, 8000);
    H.mp.start();
    const playing = await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online), 20000);
    ok('battle playing', playing);
    if (!playing) return;
    const role = (slot) => (slot === N(H).mySlot ? 'host' : 'guest');
    const eng = new Map(), traps = [], seenTrap = new Set(), fly = { max: 0, sum: 0, n: 0, byChar: {} };
    let rec = false;
    for (const fr of F) {
      const me = () => fr.G.players.find((p) => p.slot === N(fr).mySlot);
      const bot = { mode: 'chase', until: 0, shootUp: false, mash: 0 };
      fr.mp.tap(() => {
        const G = fr.G, mySlot = N(fr).mySlot, p = me(), t = now();
        if (!p || G.mode !== 'playing') return;
        // ---- the bot
        const press = (a, d) => fr.D.press(a, d, mySlot);
        if (bot.shootUp) { press('shoot', false); bot.shootUp = false; }
        if (p.trap) { bot.mash ^= 1; press('jump', !!bot.mash); press('left', false); press('right', false); }
        else {
          const riv = G.players.filter((q) => q.slot !== mySlot && freeShown(q));
          let tg = null, best = 1e9;
          for (const q of riv) { const d = Math.abs(q.x - p.x) + 2 * Math.abs(q.y - p.y); if (d < best) { best = d; tg = q; } }
          if (G.frame > bot.until) { const r = Math.random(); bot.mode = r < 0.55 ? 'chase' : r < 0.85 ? 'flee' : 'idle'; bot.until = G.frame + 20 + Math.floor(Math.random() * 50); }
          const dx = tg ? tg.x - p.x : 0, dir = bot.mode === 'chase' ? Math.sign(dx) : bot.mode === 'flee' ? -Math.sign(dx) : 0;
          press('left', dir < 0); press('right', dir > 0);
          press('jump', Math.random() < 0.03 || (tg && tg.y < p.y - 20 && Math.random() < 0.08));
          if (tg && Math.abs(tg.y - p.y) < 14 && Math.abs(dx) < 110) {
            if (Math.sign(dx) !== p.facing) { press('left', dx < 0); press('right', dx > 0); } // (turn to it)
            else if (Math.random() < 0.35) { press('shoot', true); bot.shootUp = true; }
          }
        }
        if (!rec) return;
        // ---- my capture-phase bubbles against the rivals this screen draws
        const host = fr === H;
        for (const b of G.bubbles) {
          if (b.owner !== mySlot || (b.state !== 'shot' && !b.claim) || b.kind !== 'empty' || b.dead || (host ? b.pred : !b.pred)) continue;
          const [rx, ry] = ring(b);
          for (const v of G.players) {
            if (v.slot === mySlot || !freeShown(v)) continue;
            // (hit: the engine's own test - mp.touches when it has one, else the old rP-on-12x14 one)
            const hit = !(b.drop && b.age > 8) && (fr.mp.touches ? fr.mp.touches(b, v.x, v.y) : ellBox(b.x + 8, b.y + 8, b.rP, b.rP, v.x + 2, v.y + 2, 12, 14));
            const vis = ellBox(b.x + 8, b.y + 8, rx, ry, v.x, v.y, 16, 16);
            // (near: one frame of travel short of a touch - a catch made in the world update before this frame is drawn)
            const near = ellBox(b.x + 8, b.y + 8, rx + 6, ry + 6, v.x, v.y, 16, 16);
            if (!hit && !vis && !near) continue;
            const key = fr.i + ':' + b.id + ':' + v.slot;
            let e = eng.get(key);
            if (!e) { e = { s: mySlot, v: v.slot, hit: 0, vis: 0 }; eng.set(key, e); }
            if (hit && !e.hit) e.hit = t;
            if (vis && !e.vis) e.vis = t;
            if (near) e.near = t;
          }
        }
        if (host) {
          for (const v of G.players) if (v.trap && v.trap.b && !seenTrap.has(v.slot + ':' + v.trap.b.id)) { seenTrap.add(v.slot + ':' + v.trap.b.id); traps.push({ s: v.trap.by, v: v.slot, t, age: G.frame - (v.trap.b.born | 0), st: v.trap.b.vi, ep: [] }); }
          for (const q of G.players) { const k = 'ep' + q.slot; if (fly[k] !== undefined && fly[k] !== q.ep) (fly.epT || (fly.epT = [])).push({ s: q.slot, t }); fly[k] = q.ep; }
          const per = {};
          for (const b of G.bubbles) if (b.state === 'shot' && b.kind === 'empty' && !b.dead && !b.drop && b.owner >= 0) per[b.owner] = (per[b.owner] || 0) + 1;
          for (const q of G.players) {
            const c = per[q.slot] || 0; fly.max = Math.max(fly.max, c); fly.sum += c; fly.n++;
            const bc = fly.byChar[q.char] || (fly.byChar[q.char] = { max: 0, sum: 0, n: 0 }); bc.max = Math.max(bc.max, c); bc.sum += c; bc.n++;
          }
        }
      });
    }
    // every 6 s everyone back on the floor near each other (the engagements; recording pauses 0.6 s around it)
    const t0 = now();
    while (now() - t0 < SECS * 1000) {
      rec = false;
      const xs = [40, 110, 180].sort(() => Math.random() - 0.5);
      F.forEach((fr, i) => { const p = fr.G.players.find((q) => q.slot === N(fr).mySlot); if (p && !p.trap && !p.dead) fr.D.setPlayer(xs[i], 200, N(fr).mySlot); });
      await sleep(600);
      rec = true;
      await sleep(5400);
    }
    rec = false;
    await sleep(1600);
    for (const fr of F) fr.mp.tap(null);
    // ---- the numbers
    const cases = {};
    const C = (s, v) => role(s) + '>' + role(v);
    const box = (k) => cases[k] || (cases[k] = { seen: 0, missed: 0, traps: 0, unseen: 0, vis: 0, visNoHit: 0 });
    const W = 1500;
    for (const e of eng.values()) {
      if (!e.hit && !e.vis) continue;
      const c = box(C(e.s, e.v)), t = e.hit || e.vis;
      if (e.vis) { c.vis++; if (!e.hit) c.visNoHit++; }
      c.seen++;
      if (!traps.some((tr) => tr.s === e.s && tr.v === e.v && tr.t >= t - 300 && tr.t <= t + W)) {
        c.missed++;
        if ((fly.epT || []).some((x) => (x.s === e.s || x.s === e.v) && Math.abs(x.t - t) < 700)) c.race = (c.race | 0) + 1;
      }
    }
    for (const tr of traps) {
      const c = box(C(tr.s, tr.v)); c.traps++;
      // (caught in the bubble's first frame - blown point-blank / into a wall onto the rival: no screen ever draws it free)
      if (tr.age === 0) { c.pointBlank = (c.pointBlank | 0) + 1; continue; }
      let seen = false;
      for (const e of eng.values()) if (e.s === tr.s && e.v === tr.v && ((e.vis && e.vis >= tr.t - W && e.vis <= tr.t + 300) || (e.near && e.near >= tr.t - 60 && e.near <= tr.t + 20))) { seen = true; break; }
      if (!seen) { c.unseen++; if ((c.ex || (c.ex = [])).length < 4) c.ex.push(tr.age); }
    }
    const pc = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);
    let all = { seen: 0, missed: 0, race: 0, traps: 0, pointBlank: 0, unseen: 0, vis: 0, visNoHit: 0 };
    for (const [k, c] of Object.entries(cases)) {
      for (const f of Object.keys(all)) all[f] += c[f] | 0;
      metric('case ' + k, { shooterSawHit: c.seen, a_notTrappedPct: pc(c.missed, c.seen), a_noRacePct: pc(c.missed - (c.race | 0), c.seen), hostTraps: c.traps, b_shooterNeverSawPct: pc(c.unseen, c.traps - (c.pointBlank | 0)), pointBlank: c.pointBlank | 0, c_visNoHitPct: pc(c.visNoHit, c.vis) });
    }
    metric('all ' + LINK, { shooterSawHit: all.seen, a_notTrappedPct: pc(all.missed, all.seen), a_noRacePct: pc(all.missed - all.race, all.seen), hostTraps: all.traps, b_shooterNeverSawPct: pc(all.unseen, all.traps - all.pointBlank), pointBlank: all.pointBlank, c_visNoHitPct: pc(all.visNoHit, all.vis) });
    const bc = {}; for (const [k, v] of Object.entries(fly.byChar)) bc[k] = { max: v.max, mean: Math.round((100 * v.sum) / Math.max(1, v.n)) / 100 };
    metric('in-flight shots per player', { max: fly.max, mean: Math.round((100 * fly.sum) / Math.max(1, fly.n)) / 100, byChar: bc });
    metric('claims', F.map((f) => N(f).claims));
    ok('engagements recorded', all.seen > 5 && all.traps > 2, all);
  }
  run().catch((e) => { fail++; log('BACC error ' + (e && e.stack || e)); }).then(() => log('BACC DONE pass=' + pass + ' fail=' + fail));
})();
