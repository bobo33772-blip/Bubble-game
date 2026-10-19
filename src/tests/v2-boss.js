// v2 boss-round checks (built to C:/Temp/bogeul/test-v2-boss.html):
//   node tools/run-chrome.js test-v2-boss.html - 900 760 200000
// Extra modes (hash):
//   #bot1 .. #bot4   bot statistics for one boss: 24 seeds, real lives -> wins, frames, deaths, death causes
//                    (run one boss per call: run-chrome.js stops after 2 minutes of wall time)
//   #trace1-7000     one bot run (boss 1, seed 7000), printing the 90 frames before every death
//   #watch2-5        one bot run (boss 2, seed 5), a progress line every 60 frames (#watch2-5-inv: invincible)
// For each boss round (indices 5/11/17/23): spawn -> intro (drop-in, "… 등장!" banner, boss music) -> soap hits from
// real shots -> stun inside the giant bubble -> burst by touch -> HP down -> phases 2/3 -> defeat (+3 stamps, 뽀득!,
// victory jingle) -> door transition to the next round (final boss -> ending -> 2회차). Boss contact kills the duck,
// every boss's projectiles are created, telegraphed, deadly and cleaned up, minions spawn (cap 4) and can be bombed
// against the boss, the HP/soap bars are drawn, and each boss survives a 4000-frame random-input soak.
// Finally a scripted bot beats boss 1 using only PG.debug.press() (proof of winnability).
// Prints "BOSS PASS/FAIL <name>" lines, "BOSS INFO ..." lines and "BOSS DONE pass=N fail=M".
(function () {
  let pass = 0, fail = 0, errors = 0;
  window.addEventListener('error', (e) => { errors++; console.log('BOSS page error: ' + e.message + ' @' + e.lineno); });
  const log = (s) => console.log(s);
  function t(name, fn) {
    let r;
    try { r = fn(); } catch (e) { r = 'exception ' + (e && e.message) + ' @ ' + String((e && e.stack) || '').split('\n')[1]; }
    if (r === undefined || r === true) { pass++; log('BOSS PASS ' + name); } else { fail++; log('BOSS FAIL ' + name + ': ' + r); }
  }
  const $ = (id) => document.getElementById(id);

  const IDX = [5, 11, 17, 23];
  const TYPE = ['kingGrime', 'moldQueen', 'megaSponge', 'towelKing'];
  const NAME = ['왕때꼬마', '곰팡이 여왕', '대왕 수세미', '이태리 타올 대마왕'];
  const SOAP = [8, 10, 12, 14];
  const MUSIC = ['boss', 'boss', 'boss', 'final'];
  const MINIONS = [['grime'], ['mold'], ['sponge', 'grime'], ['grime', 'mold', 'fly', 'sponge']];
  const PF_TOP = 16, PF_BOT = 224, WALL_L = 16, WALL_R = 240, W = 256;

  // ------------------------------------------------------------------ scripted bot (press() only)
  // Reads what a player sees (duck, boss, telegraphs, projectiles, minions, bubbles) and drives the duck with
  // PG.debug.press only. Two layers:
  //  - goals: lather the boss (keep 40-76 px from a grounded boss on its level and shoot; jump-shoot a flying
  //    boss from a perch), burst the giant bubble, trap minions close by, pop trapped bubbles, shoot landed
  //    spores; routes over the shelves (jump up 1-4 rows, walk off an edge, hop a gap);
  //  - safety: every frame it simulates the duck (real walk / jump / gravity / landing numbers) for 12 candidate
  //    plans over ~40 frames against what it can see coming - the boss's path (hop arcs, a winding-up charge or
  //    swoop along its telegraphed line), shockwaves, sweeps, mitts, spores, scald drops and minions - and
  //    overrides the goal's move / jump when that plan would be hit.
  function makeBot(D, G) {
    const TS = 8, TOP = 16, H = 40;
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const M = () => D.levels()[G.round].map;
    const solid = (c, r) => { if (c < 0 || c > 31) return true; r = ((r % 26) + 26) % 26; return M()[r][c] === '#'; };
    const wet = (c, r) => { const row = M()[r]; const ch = row && row[c]; return ch === '~' || ch === '='; };
    const topAt = (c, r) => c >= 2 && c <= 29 && r >= 1 && r <= 25 && solid(c, r) && !solid(c, r - 1);
    // a surface the duck can stand or float on: a block top or a pool's surface
    const surf = (c, r) => c >= 2 && c <= 29 && r >= 1 && r <= 25 && !solid(c, r - 1) && !wet(c, r - 1) && (solid(c, r) || wet(c, r));
    function landRow(x0, x1, f0, f1, skip) {
      const r0 = Math.max(0, Math.ceil((f0 - TOP) / TS - 1e-6)), r1 = Math.min(25, Math.floor((f1 - TOP) / TS));
      const c0 = Math.max(2, Math.floor(x0 / TS)), c1 = Math.min(29, Math.floor((x1 - 0.001) / TS));
      for (let r = r0; r <= r1; r++) { if (r === skip) continue; for (let c = c0; c <= c1; c++) if (topAt(c, r)) return TOP + r * TS; }
      return null;
    }
    // ---- shelves as a graph
    let segs = null, segRound = -1;
    function segments() {
      if (segs && segRound === G.round) return segs;
      segRound = G.round; segs = [];
      for (let r = 1; r <= 25; r++) {
        for (let c = 2; c <= 29;) {
          if (!surf(c, r)) { c++; continue; }
          const c0 = c; while (c <= 29 && surf(c, r)) c++;
          segs.push({ id: segs.length, r, c0, c1: c - 1, x0: c0 * TS, x1: c * TS, y: TOP + r * TS, edges: [] });
        }
      }
      const at = (c, r) => segs.find((s) => s.r === r && c >= s.c0 && c <= s.c1);
      for (const a of segs) {
        for (const b of segs) {
          if (b === a) continue;
          const dr = a.r - b.r;
          // a jump climbing dr rows also covers a horizontal gap (jump arc + coyote frames off the edge)
          const lim = dr >= 4 ? 26 : dr === 3 ? 32 : 38;
          if (dr >= 1 && dr <= 4 && b.x1 > a.x0 - lim && b.x0 < a.x1 + lim) {
            let tx, lx;
            if (b.x1 > a.x0 + 4 && b.x0 < a.x1 - 4) { tx = clamp((Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2, a.x0 + 5, a.x1 - 5); lx = clamp(tx, b.x0 + 6, b.x1 - 6); }
            else if (b.x0 >= a.x1 - 4) { tx = a.x1 + 1; lx = b.x0 + 10; }
            else { tx = a.x0 - 1; lx = b.x1 - 10; }
            a.edges.push({ to: b.id, kind: 'up', x: tx, lx });
          } else if (dr === 0 && b.c0 - a.c1 - 1 >= 1 && b.c0 - a.c1 - 1 <= 4) a.edges.push({ to: b.id, kind: 'hop', x: a.x1 - 6, d: 1 });
          else if (dr === 0 && a.c0 - b.c1 - 1 >= 1 && a.c0 - b.c1 - 1 <= 4) a.edges.push({ to: b.id, kind: 'hop', x: a.x0 + 6, d: -1 });
        }
        for (const d of [-1, 1]) {
          const c = d < 0 ? a.c0 - 1 : a.c1 + 1;
          if (c < 2 || c > 29 || solid(c, a.r - 1)) continue;
          for (let r = a.r + 1; r <= 25; r++) { const s = at(c, r) || at(c + d, r); if (s) { a.edges.push({ to: s.id, kind: 'drop', x: d < 0 ? a.x0 - 7 : a.x1 + 7, d }); break; } }
        }
      }
      return segs;
    }
    function route(from, goal) {
      const S = segments(), prev = new Map([[from.id, null]]), q = [from.id];
      while (q.length) {
        const id = q.shift();
        if (goal(S[id])) {
          if (id === from.id) return { here: true };
          let e = prev.get(id);
          while (prev.get(e.from) !== null) e = prev.get(e.from);
          return { edge: e };
        }
        for (const e of S[id].edges) if (!prev.has(e.to)) { prev.set(e.to, Object.assign({ from: id }, e)); q.push(e.to); }
      }
      return null;
    }
    // ---- what the bot sees coming: boxes [x0, y0, x1, y1] per future frame t (1..H)
    const RUN = [0, 2.4, 2.85, 3.3], DIVE = [0, 3.0, 3.3, 3.6];
    function bossBoxes(b) {
      const out = [];
      let x = b.x, y = b.y, vx = b.vx, vy = b.vy, ground = b.onGround, act = b.act, actT = b.actT;
      for (let t = 1; t <= H; t++) {
        if (act === 'wind' && b.type === 'megaSponge') { if (--actT <= 0) { act = 'charge'; vx = b.dir * RUN[b.phase]; } }
        else if (act === 'swoopWind') {
          if (--actT <= 0) { act = 'swoop'; const dx = b.tx - (x + 16), dy = b.ty - (y + 16), d = Math.hypot(dx, dy) || 1; vx = dx / d * DIVE[b.phase]; vy = dy / d * DIVE[b.phase]; }
          else { vx = 0; vy = 0; }
        }
        if (b.def.fly) { x += vx; y += vy; if (act === 'swoop' && y >= PF_BOT - 41) { vx = 0; vy = 0; } }
        else if (!ground) {
          x += vx; if (x < WALL_L) { x = WALL_L; vx = 0; } else if (x > WALL_R - 32) { x = WALL_R - 32; vx = 0; }
          const vy0 = vy; vy = Math.min(5, vy + 0.24); const f0 = y + 32; y += (vy0 + vy) / 2;
          if (vy >= 0) { const l = landRow(x + 3, x + 29, f0, y + 32, b.dropRow); if (l !== null) { y = l - 32; ground = true; vx = 0; } }
          if (y + 32 > PF_BOT) y -= 208;
        } else {
          x += vx;
          if (x < WALL_L || x > WALL_R - 32) { x = clamp(x, WALL_L, WALL_R - 32); vx = 0; }
          // a charge skids to a stop at the open end of its shelf
          if (vx) { const d = Math.sign(vx), lead = d > 0 ? x + 29 : x + 3, r = Math.round((y + 32 - TOP) / TS), c = Math.floor(lead / TS); let ok = c < 2 || c > 29; for (let k = 0; k <= 3 && !ok; k++) { const cc = c + d * k; ok = cc < 2 || cc > 29 || solid(cc, r); } if (!ok) vx = 0; }
        }
        out.push([x + 5, y + 6, x + 27, y + 30]);
      }
      return out;
    }
    const GVX = [0, 1.35, 1.55, 1.75];
    function grimeLeapModel(b) {
      let x = b.x, y = b.y, vx = 0, vy = 0, ground = true, left = b.actT, leapt = false;
      return (dcx, dfeet) => {
        if (!leapt) {
          if (--left <= 0) {
            leapt = true; ground = false;
            const bf = y + 32, rise = bf - dfeet, up = dfeet < bf - 20, down = dfeet > bf + 12;
            let air;
            if (up) { const v = clamp(Math.sqrt(2 * 0.24 * (rise + 14)), 4.2, 6.2); vy = -v; air = (v + Math.sqrt(Math.max(0, v * v - 2 * 0.24 * rise))) / 0.24; }
            else { vy = down ? -2.6 : -3.7; air = 2 * -vy / 0.24 + (down ? 14 : 0); }
            vx = clamp((dcx - (x + 16)) / air, -GVX[b.phase], GVX[b.phase]);
          }
        } else if (!ground) {
          x += vx; if (x < WALL_L) { x = WALL_L; vx = 0; } else if (x > WALL_R - 32) { x = WALL_R - 32; vx = 0; }
          const vy0 = vy; vy = Math.min(5, vy + 0.24); const f0 = y + 32; y += (vy0 + vy) / 2;
          if (vy >= 0) { const l = landRow(x + 3, x + 29, f0, y + 32, -1); if (l !== null) { y = l - 32; ground = true; } }
          if (y + 32 > PF_BOT) y -= 208;
        }
        return [x + 5, y + 6, x + 27, y + 30];
      };
    }
    function spongeHopModel(b) {
      let x = b.x, y = b.y, vx = 0, vy = 0, ground = true, left = b.actT, hopped = false, skip = -1;
      return (dcx) => {
        if (!hopped) {
          if (--left <= 0) {
            hopped = true; ground = false; const bc = x + 16;
            if (b.hopUp) { vy = -5.3; vx = clamp((dcx - bc) / 40, -1.1, 1.1); if (Math.abs(vx) < 0.45) vx = 0.45 * (Math.sign(dcx - bc) || b.dir); }
            else { skip = Math.round((y + 32 - TOP) / TS); vy = -1.6; vx = clamp((dcx - bc) / 60, -0.9, 0.9); }
          }
        } else if (!ground) {
          x += vx; if (x < WALL_L) x = WALL_L; else if (x > WALL_R - 32) x = WALL_R - 32;
          const vy0 = vy; vy = Math.min(5, vy + 0.24); const f0 = y + 32; y += (vy0 + vy) / 2;
          if (vy >= 0) { const l = landRow(x + 3, x + 29, f0, y + 32, skip); if (l !== null) { y = l - 32; ground = true; } }
          if (y + 32 > PF_BOT) y -= 208;
        }
        return [x + 5, y + 6, x + 27, y + 30];
      };
    }
    let dynBoss = null;
    function threats() {
      const T = [], b = G.boss;
      dynBoss = null;
      if (b && b.state === 'fight' && b.type === 'kingGrime' && b.act === 'crouch') dynBoss = () => grimeLeapModel(b);
      else if (b && b.state === 'fight' && b.type === 'megaSponge' && b.act === 'squat') dynBoss = () => spongeHopModel(b);
      else if (b && b.state === 'fight') T.push(bossBoxes(b));
      for (const h of G.hazards) {
        if (h.dead) continue;
        const L = [];
        for (let t = 1; t <= H; t++) {
          if (h.kind === 'wave') { const x = h.x + h.vx * t, hh = clamp(h.t + t - 4, 0, 7); L.push(hh > 0 ? [x + 2, h.y - hh, x + 14, h.y] : null); }
          else if (h.kind === 'sweep') {
            const go = h.state === 'go' ? t : t - (h.warn - h.t);
            const x = h.state === 'go' ? h.x + h.dir * h.v * t : (h.dir > 0 ? WALL_L - 24 : WALL_R) + h.dir * h.v * go;
            L.push(go > 0 ? [x, h.sy - 12, x + 24, h.sy - 1] : null);
          } else if (h.kind === 'mitt') { const vy = Math.min(2.4, h.vy + 0.08 * t), y = h.y + (h.vy + vy) / 2 * t; L.push([h.x + 3, y + 3, h.x + 13, y + 14]); }
          else if (h.kind === 'spore' && h.state === 'fly') { const vy = Math.min(1.9, h.vy + 0.055 * t), y = h.y + (h.vy + vy) / 2 * t, x = h.x + h.vx * t; L.push([x + 1, y + 1, x + 7, y + 7]); }
          else L.push(null);
        }
        T.push(L);
      }
      for (const d of G.drops) {
        const L = [];
        let y = d.y, vy = d.vy, st = d.state, k = d.t;
        for (let t = 1; t <= H; t++) {
          if (st === 'form') { if (++k >= 40) { st = 'fall'; vy = 0.4; } L.push(null); continue; }
          vy = Math.min(4.2, vy + 0.22); y += vy;
          L.push([d.x + 2, y + 1, d.x + 6, y + 8]);
        }
        T.push(L);
      }
      for (const e of G.enemies) {
        if (e.state !== 'active') continue;
        const L = [];
        let x = e.x, y = e.y, vx = e.vx || 0, vy = e.vy || 0, g = e.onGround && e.type !== 'fly';
        for (let t = 1; t <= H; t++) {
          if (e.type === 'fly') { x += vx; y += vy; }
          else {
            x = clamp(x + vx, WALL_L - 2, WALL_R - 14);
            if (!g) { const vy0 = vy; vy = Math.min(3.5, vy + 0.22); const f0 = y + 16; y += (vy0 + vy) / 2; if (vy >= 0) { const l = landRow(x + 3, x + 13, f0, y + 16); if (l !== null) { y = l - 16; vy = 0; g = true; } } if (y + 16 > PF_BOT) y -= 208; }
          }
          const m = Math.min(4, t * 0.15); // they may turn or hop: a growing margin
          L.push((e.grace || 0) > t ? null : [x + 3 - m, y + 4 - m, x + 13 + m, y + 15]);
        }
        T.push(L);
      }
      return T;
    }
    // simulate the duck for one plan: walk dir (-1/0/1), jump on frame jt (-1 = no jump); returns frames until hit
    function simulate(dir, jt, T) {
      const p = G.p;
      let x = p.x, y = p.y, vy = p.vy, vx = p.vx, g = !!(p.onGround || p.water), coyote = g ? 4 : 0;
      const dyn = dynBoss ? dynBoss() : null;
      let lastFeet = y + 16;
      for (let t = 1; t <= H; t++) {
        vx += clamp(dir * 1.25 - vx, -0.5, 0.5);
        if (t - 1 === jt && (g || coyote > 0)) { vy = -4.1; g = false; coyote = 0; }
        x = clamp(x + vx, WALL_L - 2, WALL_R - 14);
        const vy0 = vy; vy = Math.min(3.5, vy + 0.22); const f0 = y + 16; y += (vy0 + vy) / 2;
        const was = g; g = false;
        if (vy >= 0) { const l = landRow(x + 3, x + 13, f0, y + 16); if (l !== null) { y = l - 16; vy = 0; g = true; } }
        if (g) coyote = 4; else if (was) coyote = 3; else if (coyote > 0) coyote--;
        if (y + 16 > PF_BOT) return t + 24; // down the drain: not deadly, but not where we want to be
        const bx0 = x + 4 - 1, by0 = y + 4 - 1, bx1 = x + 12 + 1, by1 = y + 15 + 1;
        for (const L of T) { const q = L[t - 1]; if (q && q[0] < bx1 && q[2] > bx0 && q[1] < by1 && q[3] > by0) return t; }
        if (g) lastFeet = y + 16;
        if (dyn) { const q = dyn(x + 8, lastFeet); if (q[0] - 2 < bx1 && q[2] + 2 > bx0 && q[1] < by1 && q[3] > by0) return t; }
      }
      return H + 1;
    }
    let prev = { jump: false, shoot: false }, airMove = 0;
    function press(w) {
      const jp = w.jump && !prev.jump, sp = w.shoot && !prev.shoot;
      D.press('left', !!w.left); D.press('right', !!w.right);
      D.press('jump', jp); D.press('shoot', sp);
      prev = { jump: jp, shoot: sp };
    }
    function decide() {
      const p = G.p, b = G.boss, out = { left: false, right: false, jump: false, shoot: false };
      if (G.mode !== 'playing' || !p || p.dead) { airMove = 0; return out; }
      const px = p.x + 8, pcy = p.y + 8, pf = p.y + 16, onG = !!(p.onGround || p.water);
      let move = 0, jump = false, shoot = false;
      const S = segments();
      let seg = null;
      if (onG) {
        let r = Math.round((pf - TOP) / TS);
        if (p.water) { const c = Math.floor(px / TS); r = Math.floor((p.y + 15 - TOP) / TS); while (r > 1 && wet(c, r - 1)) r--; }
        const c0 = Math.floor((p.x + 3) / TS), c1 = Math.floor((p.x + 12.99) / TS);
        seg = S.find((s) => s.r === r && s.c1 >= c0 && s.c0 <= c1) || null;
        // odd footing (a pool rim corner): treat it as the nearest shelf at about this height
        if (!seg) { let bd = 1e9; for (const s of S) { const d = Math.abs(s.y - pf) * 4 + Math.max(0, s.x0 - px, px - s.x1); if (Math.abs(s.y - pf) <= 8 && d < bd) { bd = d; seg = s; } } }
      }
      const facing = (tx) => Math.sign(tx - px) === p.facing;
      const go = (goal) => {
        if (!seg) return false;
        const r = route(seg, goal);
        if (!r || r.here) return !!r;
        const e = r.edge;
        if (e.kind === 'up') { if (Math.abs(e.x - px) > 3) move = Math.sign(e.x - px); else { jump = true; airMove = Math.abs(e.lx - px) > 4 ? Math.sign(e.lx - px) : 0; move = airMove; } }
        else if (e.kind === 'hop') { move = e.d; if (Math.abs(e.x - px) < 5) { jump = true; airMove = e.d; } }
        else move = e.d;
        return false;
      };
      // ---- goals
      let busy = false;
      // a minion on the duck's level and close: trap it
      let target = null, td = 1e9;
      for (const e of G.enemies) {
        if (e.state !== 'active') continue;
        const ex = e.x + 8, ey = e.y + 8, d = Math.abs(ex - px);
        if (Math.abs(ey - pcy) < 9 && d < 64 && d < td) { td = d; target = e; }
      }
      if (target) { const ex = target.x + 8; if (!facing(ex)) move = Math.sign(ex - px); else shoot = true; busy = td < 44; }
      if (b && !busy) {
        if (b.state === 'stun' && b.giant) {
          const gx = b.giant.x + 20, gy = b.giant.y + 20;
          const reach = (s) => gy > s.y - 58 && gy < s.y + 6 && gx > s.x0 - 18 && gx < s.x1 + 18;
          if (go(reach) || !seg) {
            move = Math.abs(gx - px) > 3 ? Math.sign(gx - px) : 0;
            if (onG && gy < pcy - 6 && Math.abs(gx - px) < 22) { jump = true; airMove = Math.sign(gx - px); }
          }
          if (!onG) airMove = Math.abs(gx - px) > 3 ? Math.sign(gx - px) : 0;
        } else if (b.state === 'fight') {
          const bc = b.x + 16, bcy = b.y + 16, dx = bc - px, adx = Math.abs(dx);
          const sameLvl = !b.def.fly && b.onGround && Math.abs(b.y + 32 - pf) < 6;
          // a narrow shelf (a corner ledge) is a trap with a hopping boss around: get onto a wide one
          const cramped = !b.def.fly && seg && seg.x1 - seg.x0 < 56 && adx < 110;
          if (cramped) go((s) => s.x1 - s.x0 >= 72);
          else if (sameLvl) {
            // keep to the roomier side of it
            if (adx < 40) move = -Math.sign(dx) || 1;
            else if (adx > 76) move = Math.sign(dx);
            else if (!facing(bc)) move = Math.sign(dx);
            else shoot = true;
          } else {
            // a perch from which a jump lines the duck up with the boss (bubble centre p.y + 7)
            const lo = b.y - 4, hi = b.y + 34;
            const perch = (s) => s.y - 9 >= lo && s.y - 47 <= hi && s.x1 - s.x0 >= 16;
            const level = Math.abs(bcy - (p.y + 7)) < 15;
            if (!onG) { if (level && facing(bc) && adx < 80) shoot = true; }
            else if (seg && perch(seg)) {
              const lead = bc + b.vx * 14;
              let tx = lead + (px < lead ? -52 : 52);
              tx = clamp(tx, seg.x0 + 6, seg.x1 - 6);
              if (Math.abs(tx - px) > 5 && Math.abs(lead - px) > 30) move = Math.sign(tx - px);
              else if (!facing(bc)) move = Math.sign(dx);
              const rise = p.y + 7 - bcy;
              if (level && facing(bc) && adx < 80) shoot = true;
              else if (rise > 4 && rise < 46 && adx < 90 && adx > 26 && p.shootCd < 3) jump = true;
            } else {
              const near = (s) => perch(s) && Math.abs((s.x0 + s.x1) / 2 - bc) < 120;
              go(near);
            }
          }
        }
      }
      if (!busy && !shoot && !jump) {
        // pop a trapped bubble drifting close by
        for (const q of G.bubbles) {
          if (q.kind !== 'trapped' || q.state !== 'float') continue;
          const dx = q.x + 8 - px, dy = q.y + 8 - pcy;
          if (Math.abs(dx) < 30 && dy < 6 && dy > -32) { move = Math.abs(dx) > 3 ? Math.sign(dx) : 0; if (onG && dy < -8 && Math.abs(dx) < 16) { jump = true; airMove = Math.sign(dx); } break; }
        }
        // shoot a landed spore on the duck's level
        for (const h of G.hazards) if (h.kind === 'spore' && h.state === 'land' && Math.abs(h.y + 4 - (p.y + 7)) < 9 && Math.abs(h.x + 4 - px) < 70) { if (!facing(h.x + 4)) move = Math.sign(h.x + 4 - px); else shoot = true; break; }
      }
      if (!onG && !move) move = airMove;
      if (onG && !jump) airMove = 0;
      // ---- safety: is the goal's plan going to be hit? then take the safest plan instead
      const T = threats();
      const want = simulate(move, jump ? 0 : -1, T);
      if (want <= H) {
        let best = null;
        for (const dir of [move, -move || 1, move ? 0 : -1]) {
          for (const jt of [-1, 0, 3, 7, 12, 18]) {
            const s = simulate(dir, jt, T);
            const score = s * 10 - (dir === move ? 0 : 2) - (jt < 0 ? 0 : 1) - (jt > 0 ? jt * 0.05 : 0);
            if (!best || score > best.score) best = { dir, jt, s, score };
          }
        }
        if (best && best.s > want) { move = best.dir; jump = best.jt === 0; if (jump) airMove = move; }
      }
      // never walk into the floor drain on purpose (it would drop the duck in from the showerhead)
      if (onG && pf >= PF_BOT - 8 && move && !jump) {
        const nx = p.x + move * 5, gap = D.levels()[G.round].gapX;
        if (nx + 3 >= gap - 12 && nx + 13 <= gap + 12 && simulate(move, 0, T) > H) { jump = true; airMove = move; }
      }
      out.left = move < 0; out.right = move > 0; out.jump = jump; out.shoot = shoot;
      return out;
    }
    return {
      step() { press(decide()); },
      release() { for (const a of ['left', 'right', 'jump', 'shoot']) D.press(a, false); prev = { jump: false, shoot: false }; },
    };
  }
  // play boss n (0-based) with real lives (3), the bot only pressing buttons. Returns the outcome.
  // trace (optional): log the last 90 frames before every death
  function botRun(D, G, n, seed, maxFrames, trace) {
    D.seed(seed); D.start(IDX[n]); D.setInvincible(false); G.stampT = 1e9;
    const bot = makeBot(D, G);
    let f = 0, deaths = 0, wasDead = false, beatAt = -1, hp = [];
    const causes = [], ring = [];
    for (; f < maxFrames; f++) {
      bot.step();
      if (trace) {
        const p = G.p, b = G.boss;
        ring.push(f + ' duck ' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + (p.onGround ? 'g' : 'a') + ' inv' + p.invuln + ' f' + p.facing + (b ? ' | boss ' + b.state + '/' + b.act + ' ' + b.x.toFixed(1) + ',' + b.y.toFixed(1) + ' v' + b.vx.toFixed(2) + ',' + b.vy.toFixed(2) + ' t' + b.actT + ' calm' + b.calm : '') + ' | en ' + G.enemies.filter((e) => e.state === 'active').map((e) => e.type[0] + e.x.toFixed(0) + ',' + e.y.toFixed(0)).join(' ') + ' | hz ' + G.hazards.map((h) => h.kind[0] + h.x.toFixed(0)).join(' '));
        if (ring.length > 90) ring.shift();
      }
      // what is next to the duck right before the step (for the death report)
      const p = G.p, b = G.boss, near = [];
      if (p && !p.dead) {
        const ov = (x, y, w, h) => x < p.x + 14 && x + w > p.x + 2 && y < p.y + 17 && y + h > p.y + 2;
        if (b && b.state === 'fight' && ov(b.x + 3, b.y + 4, 26, 28)) near.push('boss:' + b.act + '/p' + b.phase);
        for (const h of G.hazards) if (ov(h.x - 2, (h.kind === 'sweep' ? h.sy - 14 : h.kind === 'wave' ? h.y - 10 : h.y) - 2, h.kind === 'sweep' ? 28 : 20, 14)) near.push(h.kind);
        for (const e of G.enemies) if (e.state === 'active' && ov(e.x + 1, e.y + 2, 14, 14)) near.push(e.type + (e.minion ? '(minion)' : ''));
        for (const d of G.drops) if (ov(d.x, d.y, 8, 8)) near.push('drop');
      }
      D.step(1);
      const dead = G.mode === 'dying';
      if (dead && !wasDead) { deaths++; causes.push((near.join('+') || '?') + '@' + f); }
      if (dead && !wasDead && trace) { console.log('BOSS TRACE death ' + deaths + ' (' + causes[causes.length - 1] + ')'); for (const l of ring) console.log('BOSS TRACE ' + l); }
      wasDead = dead;
      if (G.boss && G.boss.state === 'defeat' && beatAt < 0) beatAt = f;
      if (G.boss && hp[hp.length - 1] !== G.boss.hp) hp.push(G.boss.hp);
      if (G.mode === 'gameover' || (beatAt >= 0 && f > beatAt + 60)) break;
    }
    bot.release();
    return { won: beatAt >= 0, frames: beatAt, deaths, causes, over: G.mode === 'gameover', hp: hp.join('>'), soap: G.boss ? G.boss.soap : null, state: G.boss ? G.boss.state : null };
  }

  function run() {
    const D = PG.debug, G = D.G, S = () => D.getState();
    const releaseAll = () => { for (const a of ['left', 'right', 'jump', 'shoot']) D.press(a, false); };
    const until = (cond, max) => { for (let k = 0; k < max; k++) { if (cond()) return k; D.step(1); } return cond() ? max : -1; };
    // sfx / music trace
    const A = PG.Audio || {}, trace = [];
    const oSfx = A.sfx, oMusic = A.music;
    if (typeof oSfx === 'function') A.sfx = function (nm, o) { trace.push('sfx:' + nm); return oSfx.apply(A, arguments); };
    if (typeof oMusic === 'function') A.music = function (tr) { trace.push('music:' + tr); return oMusic.apply(A, arguments); };

    const wm = /watch(\d)-(\d+)/.exec(location.hash);
    if (wm) {
      // bot progress log (invincible duck), one line every 30 frames
      const n = +wm[1] - 1; D.seed(+wm[2]); D.start(IDX[n]); D.setInvincible(/inv/.test(location.hash)); G.stampT = 1e9;
      const bot = makeBot(D, G);
      for (let f = 0; f < 14000 && G.mode !== 'gameover'; f++) {
        bot.step(); D.step(1);
        if (f % 60 === 0) { const p = G.p, b = G.boss; if (!b) break; log('BOSS WATCH ' + f + ' duck ' + p.x.toFixed(0) + ',' + p.y.toFixed(0) + (p.onGround ? 'g' : 'a') + ' f' + p.facing + ' | boss ' + b.state + '/' + b.act + ' ' + b.x.toFixed(0) + ',' + b.y.toFixed(0) + ' soap ' + b.soap + ' hp ' + b.hp + ' | bubbles ' + G.bubbles.filter((q) => q.state === 'shot').length + ' shot/' + G.bubbles.length + ' | en ' + G.enemies.filter((e) => e.state === 'active').length); }
      }
      bot.release(); log('BOSS DONE pass=0 fail=0'); return;
    }
    const tm = /trace(\d)-(\d+)/.exec(location.hash);
    if (tm) { const r = botRun(D, G, +tm[1] - 1, +tm[2], 14000, true); log('BOSS TRACE result ' + JSON.stringify(r)); log('BOSS DONE pass=0 fail=0'); return; }
    if (/bot/.test(location.hash)) {
      // ---- bot statistics: many seeds per boss, real lives
      const want = /bot(\d)/.exec(location.hash);
      for (let n = 0; n < 4; n++) {
        if (want && +want[1] !== n + 1) continue;
        const res = [];
        for (let s = 0; s < 24; s++) { const sd = 7000 + s * 31 + n; const r = botRun(D, G, n, sd, 14000); r.seed = sd; res.push(r); }
        const won = res.filter((r) => r.won), fr = won.map((r) => r.frames).sort((a, b) => a - b);
        const dw = won.map((r) => r.deaths);
        const hist = [0, 1, 2, 3].map((k) => won.filter((r) => r.deaths === k).length);
        log(`BOSS BOT boss ${n + 1} ${NAME[n]}: won ${won.length}/${res.length} · frames median ${fr.length ? fr[fr.length >> 1] : '-'} (min ${fr[0] || '-'}, max ${fr[fr.length - 1] || '-'}) · deaths in wins ${dw.length ? (dw.reduce((a, b) => a + b, 0) / dw.length).toFixed(2) : '-'} avg, 0/1/2 deaths: ${hist.slice(0, 3).join('/')} · losses: ${res.filter((r) => !r.won).map((r) => 'seed ' + r.seed + ' hp ' + r.hp + ' ' + r.state + (r.over ? '' : ' (time)')).join('; ')}`);
        const cs = {}; for (const r of res) for (const c of r.causes) { const k = c.split('@')[0]; cs[k] = (cs[k] || 0) + 1; }
        log(`BOSS BOT boss ${n + 1} death causes: ${Object.keys(cs).sort((a, b) => cs[b] - cs[a]).map((k) => k + ' x' + cs[k]).join(', ')}`);
      }
      releaseAll(); A.sfx = oSfx; A.music = oMusic;
      log('BOSS DONE pass=' + pass + ' fail=' + fail);
      return;
    }

    function enter(n, seed) { releaseAll(); D.seed(seed || 100 + n); D.start(IDX[n]); D.setInvincible(true); G.stampT = 1e9; return G.boss; }
    function fight(n, seed) { enter(n, seed); D.soapBoss(0); return G.boss; }
    // no new attacks and no minion waves (an attack already under way finishes)
    function noAttacks(b) { b.atkCd = 1e9; b.actT = Math.max(b.actT, 1e9); b.dropT = 1e9; b.minionT = 1e9; }
    function waitFight(max) { return until(() => G.boss && G.boss.state === 'fight', max || 200); }
    // put the duck level with the boss, 48 px to one side, facing it
    function aim(b) {
      const left = b.x - 48 >= WALL_L + 2, x = left ? b.x - 48 : b.x + 32 + 32;
      D.setPlayer(x, b.def.fly ? b.y + 8 : b.y + 16);
      G.p.facing = left ? 1 : -1; G.p.shootCd = 0; G.p.autoCd = 0;
    }
    function realShot() { D.press('shoot', true); D.step(1); D.press('shoot', false); }
    function burstByTouch() { const g = G.boss.giant; D.setPlayer(g.x + 12, g.y + 12); D.step(1); }
    const px = (x, y) => { const d = $('pg-canvas').getContext('2d').getImageData(x, y, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); };
    const banner = () => $('pg-banner-main').textContent + ' / ' + $('pg-banner-sub').textContent;
    const bannerOn = () => !$('pg-banner').hidden;
    const finite = (...v) => v.every((q) => typeof q === 'number' && isFinite(q));

    // ------------------------------------------------------------------ 0. layout + sprites
    t('layout: 24 entries, boss rounds at indices 5/11/17/23 with bossSpawn and empty enemy lists', () => {
      const L = PG.LEVELS;
      if (L.length !== 24) return 'entries ' + L.length;
      for (let i = 0; i < 24; i++) {
        const k = IDX.indexOf(i);
        if (k >= 0) {
          if (L[i].boss !== TYPE[k]) return 'entry ' + i + ' boss ' + L[i].boss;
          if (!L[i].bossSpawn || !isFinite(L[i].bossSpawn.col)) return 'entry ' + i + ' bossSpawn';
          if ((L[i].enemies || []).length) return 'entry ' + i + ' places enemies';
        } else if (L[i].boss) return 'entry ' + i + ' unexpected boss';
      }
    });
    t('boss sprites from sprites.js: 32x32 boss frames, 40x40 giant bubble, projectile frames', () => {
      const SP = PG.SPRITES || {};
      const want = { boss_grime_idle: 2, boss_grime_jump: 1, boss_grime_hurt: 1, boss_mold_idle: 2, boss_mold_shoot: 1, boss_mold_hurt: 1, boss_sponge_idle: 2, boss_sponge_charge: 2, boss_sponge_hurt: 1, boss_towel_idle: 2, boss_towel_swoop: 1, boss_towel_hurt: 1, giant_bubble: 2, spore: 2, shockwave: 2, scald_drop: 2, mini_mitt: 2 };
      const size = (fr) => [Math.max(...fr.map((r) => r.length)), fr.length];
      const bad = [];
      for (const k in want) {
        const s = SP[k];
        if (!Array.isArray(s) || s.length < want[k]) { bad.push(k + ' missing (engine falls back)'); continue; }
        const [w, h] = size(s[0]);
        const ex = /^boss_/.test(k) ? [32, 32] : k === 'giant_bubble' ? [40, 40] : k === 'shockwave' ? [16, 8] : k === 'mini_mitt' ? [16, 16] : [8, 8];
        if (w !== ex[0] || h !== ex[1]) bad.push(k + ' ' + w + 'x' + h);
      }
      if (bad.length) return bad.join(', ');
    });

    // ------------------------------------------------------------------ 1. per boss: the full loop
    for (let n = 0; n < 4; n++) {
      const B = (n + 1) + ' ' + NAME[n];
      t(`boss ${B}: spawns at bossSpawn in its intro (harmless, hidden then drops in), "${NAME[n]} 등장!" banner + '${MUSIC[n]}' music, fight by ~2.5 s`, () => {
        trace.length = 0;
        const b = enter(n, 10 + n), L = D.levels()[IDX[n]], fr0 = G.frame;
        const s = S().boss;
        if (!s || s.type !== TYPE[n] || s.state !== 'intro' || s.hp !== 3 || s.soap !== 0 || s.soapMax !== SOAP[n]) return 'state ' + JSON.stringify(s);
        if (G.enemies.length) return 'placed enemies ' + G.enemies.length;
        if (Math.abs(b.sx - L.bossSpawn.col * 8) > 0.5 || Math.abs(b.sy - (PF_TOP + L.bossSpawn.row * 8)) > 0.5) return 'spawn ' + b.sx + ',' + b.sy;
        if (trace.indexOf('music:' + MUSIC[n]) >= 0) return 'boss music before the boss appears';
        D.step(1);
        if (bannerOn() && $('pg-banner-main').textContent !== L.name) return 'round banner ' + banner();
        // harmless during the intro even when the duck stands where it lands
        D.setInvincible(false);
        for (let k = 0; k < 120; k++) { G.p.invuln = 0; D.setPlayer(b.sx + 8, b.sy + 10); D.step(1); if (G.mode !== 'playing') return 'killed during the intro (t=' + b.t + ')'; }
        D.setPlayer(24, 200); G.p.invuln = 0;
        D.setInvincible(true);
        if (!b.entered) return 'not entered after 120 frames';
        if ($('pg-banner-main').textContent !== NAME[n] + ' 등장!') return 'entrance banner ' + banner();
        if (trace.indexOf('music:' + MUSIC[n]) < 0) return 'music ' + trace.filter((q) => q.startsWith('music')).join(',');
        if (trace.indexOf('sfx:boss_roar') < 0) return 'no roar';
        if (Math.abs(b.y - b.sy) > 4) return 'not at spawn after landing (' + b.y + ' vs ' + b.sy + ')';
        const f = waitFight(200);
        if (f < 0) return 'no fight';
        if (G.frame - fr0 > 170) return 'fight started late (' + (G.frame - fr0) + ' frames in)';
      });

      t(`boss ${B}: a real shot (press shoot) lathers it +1 soap and pops on it (a boss is never trapped)`, () => {
        trace.length = 0;
        const b = fight(n, 20 + n); noAttacks(b); D.step(2);
        aim(b); realShot();
        const f = until(() => G.boss.soap > 0, 30);
        if (f < 0) return 'no soap (boss ' + b.x.toFixed(0) + ',' + b.y.toFixed(0) + ' duck ' + G.p.x.toFixed(0) + ',' + G.p.y.toFixed(0) + ')';
        if (G.boss.soap !== 1) return 'soap ' + G.boss.soap;
        if (G.bubbles.some((q) => q.kind === 'trapped')) return 'a bubble got trapped';
        if (G.bubbles.some((q) => q.state === 'shot')) return 'the shot did not pop';
        if (trace.indexOf('sfx:boss_hit') < 0) return 'no boss_hit sfx';
        // a second shot after the cooldown
        D.step(16); aim(G.boss); realShot();
        if (until(() => G.boss.soap > 1, 30) < 0) return 'second shot missed';
        // floating (already blown) bubbles drifting into the boss do nothing
        const q = D.spawnBubble('empty', G.boss.x + 8, G.boss.y + 8); q.age = 40;
        D.step(3);
        if (G.boss.soap !== 2) return 'a floating bubble lathered it';
      });

      t(`boss ${B}: soap ${SOAP[n]} -> sealed in the giant bubble (거품 감옥!); left alone ~4 s it breaks out unharmed`, () => {
        trace.length = 0;
        const b = fight(n, 30 + n); noAttacks(b);
        D.soapBoss(SOAP[n] - 1);
        if (b.state !== 'fight' || b.soap !== SOAP[n] - 1) return 'early ' + b.state + ' soap ' + b.soap;
        D.soapBoss(1);
        if (b.state !== 'stun' || !b.giant) return 'not stunned: ' + b.state;
        if (trace.indexOf('sfx:boss_stun') < 0) return 'no boss_stun sfx';
        D.step(1);
        if ($('pg-banner-main').textContent !== '거품 감옥!') return 'banner ' + banner();
        // park the duck far from the bubble (it drifts toward the duck slowly)
        D.setPlayer(b.giant.x + 20 < W / 2 ? 216 : 24, 40);
        const g0 = b.giant.y;
        let maxY = g0, lastY = g0;
        const f = until(() => { if (b.giant) { maxY = Math.max(maxY, b.giant.y); lastY = b.giant.y; } return b.state !== 'stun'; }, 400);
        if (f < 200 || f > 290) return 'stun lasted ' + f + ' frames';
        if (!(lastY < maxY - 8)) return 'giant bubble did not float up (start ' + g0.toFixed(0) + ', lowest ' + maxY.toFixed(0) + ', last ' + lastY.toFixed(0) + ')';
        if (b.state !== 'fight' || b.hp !== 3 || b.soap !== 0) return 'after break-out ' + b.state + ' hp ' + b.hp + ' soap ' + b.soap;
        D.step(1);
        if ($('pg-banner-main').textContent !== '탈출했다!') return 'banner ' + banner();
        log(`BOSS INFO boss ${n + 1}: stun window ${f} frames, giant bubble ${g0.toFixed(0)} -> lowest ${maxY.toFixed(0)} -> ${lastY.toFixed(0)}`);
      });

      t(`boss ${B}: touching the giant bubble bursts it: HP -1, +${2000 * (n + 1)} points, shake, boss_damage, projectiles cleared, knocked down then phase 2 (분노!)`, () => {
        trace.length = 0;
        const b = fight(n, 40 + n); noAttacks(b);
        D.stunBoss(); D.step(10);
        G.hazards.push({ kind: 'wave', x: 40, y: PF_BOT - 8, vx: 1, t: 0, dead: false }); // a projectile in flight
        const sc = G.score;
        burstByTouch();
        if (b.state !== 'down' || b.hp !== 2 || b.giant || b.soap !== 0) return 'after burst ' + b.state + ' hp ' + b.hp + ' soap ' + b.soap;
        if (G.score - sc !== 2000 * (n + 1)) return 'points ' + (G.score - sc);
        if (!(G.shake > 0)) return 'no screen shake';
        if (trace.indexOf('sfx:boss_damage') < 0) return 'no boss_damage sfx';
        if (G.hazards.length) return 'projectiles left ' + G.hazards.length;
        if (!G.pops.some((q) => +q.txt === 2000 * (n + 1))) return 'no points popup';
        // knocked down: harmless
        D.setInvincible(false);
        for (let k = 0; k < 40; k++) { G.p.invuln = 0; D.setPlayer(b.x + 8, b.y + 10); D.step(1); if (G.mode !== 'playing') return 'killed by a knocked-down boss'; }
        D.setPlayer(b.x + 16 < W / 2 ? 216 : 24, 200); D.setInvincible(true);
        const f = waitFight(120);
        if (f < 0) return 'never got up';
        if (b.phase !== 2) return 'phase ' + b.phase;
        D.step(1);
        if ($('pg-banner-main').textContent !== NAME[n] + ' 분노!') return 'banner ' + banner();
        D.damageBoss(); waitFight(140); D.step(1);
        if (b.phase !== 3 || b.hp !== 1) return 'phase3 ' + b.phase + ' hp ' + b.hp;
        if ($('pg-banner-sub').textContent.indexOf('마지막') < 0) return 'phase-3 banner ' + banner();
      });

      t(`boss ${B}: three bursts -> defeat: foam explosion, +${10000 * (n + 1)} + bonus, +3 stamps (${n % 2 ? 'a life lost' : '+1 no-death'}), "뽀득!" banner, victory jingle, then ${n < 3 ? 'the door transition to the next round' : 'the ending and 2회차'}`, () => {
        const b = fight(n, 50 + n); noAttacks(b);
        G.stamps = 0; trace.length = 0;
        if (n % 2) G.roundDeaths = 1;
        const sc = G.score, lives = G.lives;
        for (let k = 0; k < 3; k++) {
          D.setPlayer(b.x + 16 < W / 2 ? 216 : 24, 200); D.step(1); D.stunBoss(); D.step(4); if (!b.giant) return 'giant bubble burst early'; burstByTouch();
          if (b.hp !== 2 - k) return 'hp after burst ' + (k + 1) + ': ' + b.hp;
          if (k < 2) { if (waitFight(140) < 0) return 'no get-up'; noAttacks(b); }
        }
        if (b.state !== 'defeat') return 'state ' + b.state;
        if (G.hazards.length || G.drops.length) return 'projectiles left';
        const bf = until(() => b.t >= 51, 80);
        if (bf < 0) return 'defeat stalled';
        if (G.foam.length < 20) return 'foam explosion ' + G.foam.length;
        if (b.pts !== 10000 * (n + 1)) return 'boss points ' + b.pts;
        const gain = G.score - sc, want = 3 * 2000 * (n + 1) + 10000 * (n + 1) + b.bonus;
        if (gain !== want) return 'score gain ' + gain + ' want ' + want;
        const wantSt = n % 2 ? 3 : 4;
        if (G.stamps !== wantSt) return 'stamps ' + G.stamps + ' want ' + wantSt;
        D.step(0);
        if ($('pg-banner-main').textContent !== '뽀득!' || $('pg-banner-sub').textContent.indexOf(NAME[n] + ' 퇴치') < 0) return 'banner ' + banner();
        if (trace.indexOf('music:victory') < 0) return 'no victory jingle: ' + trace.filter((q) => q.startsWith('music')).join(',');
        if (G.lives !== lives) return 'lives changed';
        if (n < 3) {
          const tf = until(() => G.mode === 'transition', 300);
          if (tf < 0) return 'no transition (mode ' + G.mode + ')';
          if (trace.indexOf('sfx:door') < 0) return 'no door sfx';
          const of = until(() => G.mode === 'playing', 140);
          if (of < 0) return 'transition stuck';
          if (G.round !== IDX[n] + 1 || G.boss) return 'next round ' + G.round + ' boss ' + !!G.boss;
          log(`BOSS INFO boss ${n + 1}: defeat -> doors in ${bf + tf} frames, next round ${G.round + 1} ${D.levels()[G.round].name}`);
        } else {
          const ef = until(() => G.mode === 'ending', 300);
          if (ef < 0) return 'no ending (mode ' + G.mode + ')';
          if ($('pg-ending').hidden) return 'ending overlay hidden';
          if (trace.indexOf('music:ending') < 0) return 'no ending music';
          if (G.boss || G.hazards.length) return 'boss left over on the ending screen';
          $('pg-end-next').click();
          if (G.mode !== 'playing' || G.loop !== 1 || G.round !== 0) return '2회차 ' + G.mode + ' loop ' + G.loop + ' round ' + G.round;
          D.step(10);
        }
      });

      t(`boss ${B}: touching its body kills the duck; it keeps its HP and soap through the respawn; projectiles fizzle`, () => {
        const b = fight(n, 60 + n); noAttacks(b);
        D.damageBoss(); waitFight(140); noAttacks(b);
        D.soapBoss(2);
        G.hazards.push({ kind: 'wave', x: 40, y: PF_BOT - 8, vx: 1, t: 0, dead: false });
        const hp = b.hp, soap = b.soap, lives = G.lives;
        D.setInvincible(false); G.p.invuln = 0;
        D.setPlayer(b.x + 8, b.y + 10); D.step(1);
        if (G.mode !== 'dying') return 'no death on contact (mode ' + G.mode + ')';
        if (G.hazards.length) return 'projectiles kept through the death';
        const f = until(() => G.mode === 'playing', 120);
        D.setInvincible(true);
        if (f < 0) return 'no respawn';
        if (G.lives !== lives - 1) return 'lives ' + G.lives;
        if (b.hp !== hp || b.soap !== soap) return 'boss hp/soap ' + b.hp + '/' + b.soap + ' (was ' + hp + '/' + soap + ')';
        if (!(b.calm > 0)) return 'boss does not hold back while the duck respawns';
      });

      t(`boss ${B}: spawns 2-3 minions (${MINIONS[n].join('/')}) about every 10 s, never more than 4 alive; they trap and pop normally`, () => {
        const b = fight(n, 70 + n); noAttacks(b); b.minionT = 150;
        D.setPlayer(24, 200);
        const f = until(() => G.enemies.some((e) => e.minion), 300);
        if (f < 0) return 'no minions';
        const first = G.enemies.filter((e) => e.minion && e.state !== 'dead');
        if (first.length < 2 || first.length > 3) return 'first wave ' + first.length;
        if (first.some((e) => MINIONS[n].indexOf(e.type) < 0)) return 'types ' + first.map((e) => e.type).join(',');
        if (!first.every((e) => e.grace > 0)) return 'no spawn grace';
        // next wave comes on its own
        const f2 = until(() => G.enemies.filter((e) => e.minion).length > first.length || G.enemies.some((e) => e.state !== 'dead' && first.indexOf(e) < 0), 900);
        if (f2 < 0) return 'no second wave';
        log(`BOSS INFO boss ${n + 1}: minion waves ${f} then +${f2} frames apart`);
        let maxAlive = 0;
        for (let k = 0; k < 8; k++) { b.minionT = 1; D.step(1); maxAlive = Math.max(maxAlive, G.enemies.filter((e) => e.state !== 'dead').length); }
        if (maxAlive > 4) return 'cap exceeded: ' + maxAlive;
        if (maxAlive < 4) return 'cap never reached: ' + maxAlive;
        b.minionT = 1e9;
        D.step(50);
        D.trapAll();
        const tb = G.bubbles.filter((q) => q.kind === 'trapped');
        if (tb.length < 1) return 'nothing trapped';
        tb.forEach((q, i) => { q.x = 24 + i * 18; q.y = 180; });
        const sc = G.score;
        D.popAll();
        if (G.score - sc < 500 * tb.length) return 'pop score ' + (G.score - sc);
        if (G.boss.soap !== 0) return 'far pops lathered the boss';
      });

      t(`boss ${B}: a trapped minion popped against the boss adds +3 soap (거품 폭탄!)`, () => {
        const b = fight(n, 80 + n); noAttacks(b); b.minionT = 1; D.step(2); b.minionT = 1e9;
        D.trapAll();
        const tb = G.bubbles.filter((q) => q.kind === 'trapped');
        if (!tb.length) return 'nothing trapped';
        tb.forEach((q, i) => { q.x = i ? 24 : b.x + 8; q.y = i ? 30 + i * 18 : b.y + 8; });
        const s0 = b.soap;
        D.popAll(); D.step(0);
        if (b.soap !== s0 + 3) return 'soap ' + s0 + ' -> ' + b.soap;
        if ($('pg-banner-main').textContent !== '거품 폭탄!') return 'banner ' + banner();
      });

      t(`boss ${B}: 4000-frame random-input soak (deaths allowed, lives topped up, phases 1-3): no exceptions, no NaN, everything stays in the bath`, () => {
        D.seed(900 + n); D.start(IDX[n]); D.setInvincible(false); G.stampT = 1e9;
        const e0 = errors;
        let deaths = 0, wasDead = false, maxHz = 0, maxMin = 0, maxDrops = 0, round = G.round;
        const kinds = new Set();
        let rs = 12345 + n;
        const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
        for (let f = 0; f < 4000; f++) {
          if (f % 6 === 0) { D.press('left', rnd() < 0.4); D.press('right', rnd() < 0.4); D.press('jump', rnd() < 0.3); D.press('shoot', rnd() < 0.5); }
          if ((f === 1300 || f === 2600) && G.boss) D.damageBoss();
          G.lives = 3;
          D.step(1);
          if (G.round !== round || G.mode === 'transition' || G.mode === 'ending') { log(`BOSS INFO boss ${n + 1} soak: boss beaten by random play at ${f}`); break; }
          const p = G.p, b = G.boss;
          if (!finite(p.x, p.y, p.vx, p.vy)) return 'duck NaN at ' + f;
          if (G.mode === 'dying' && !wasDead) deaths++;
          wasDead = G.mode === 'dying';
          if (b) {
            if (!finite(b.x, b.y, b.vx, b.vy, b.soap, b.hp)) return 'boss NaN at ' + f + ' ' + JSON.stringify(S().boss);
            if (b.x < WALL_L - 6 || b.x > WALL_R - 26 || b.y < 0 || b.y > PF_BOT - 24) return `boss out of the bath at ${f}: ${b.x.toFixed(1)},${b.y.toFixed(1)} (${b.state}/${b.act})`;
            if (b.soap > b.soapMax || b.hp < 0 || b.hp > 3) return 'boss gauges ' + b.soap + '/' + b.hp;
            if (b.giant && !finite(b.giant.x, b.giant.y)) return 'giant bubble NaN';
          }
          for (const h of G.hazards) {
            kinds.add(h.kind);
            const hy = h.kind === 'sweep' ? h.sy : h.y;
            if (!finite(h.x, hy)) return 'hazard NaN ' + h.kind + ' at ' + f;
            if (hy < -40 || hy > PF_BOT + 40 || h.x < -60 || h.x > W + 60) return 'hazard escaped ' + h.kind + ' ' + h.x + ',' + hy;
          }
          for (const e of G.enemies) if (!finite(e.x, e.y)) return 'enemy NaN at ' + f;
          for (const q of G.bubbles) if (!finite(q.x, q.y)) return 'bubble NaN at ' + f;
          maxHz = Math.max(maxHz, G.hazards.length);
          maxMin = Math.max(maxMin, G.enemies.filter((e) => e.state !== 'dead').length);
          maxDrops = Math.max(maxDrops, G.drops.length);
          if (G.mode !== 'playing' && G.mode !== 'dying') return 'mode ' + G.mode + ' at ' + f;
        }
        releaseAll(); D.setInvincible(true);
        if (errors !== e0) return (errors - e0) + ' page errors';
        if (maxMin > 4) return 'minions alive ' + maxMin;
        if (maxHz > 40) return 'hazards piled up ' + maxHz;
        log(`BOSS INFO boss ${n + 1} soak: ${deaths} deaths, max ${maxHz} projectiles (${[...kinds].join('/') || 'none'}), max ${maxMin} minions, max ${maxDrops} scald drops, ended in phase ${G.boss ? G.boss.phase : '-'}`);
      });
    }

    // ------------------------------------------------------------------ 2. each boss's own attacks
    t('boss 1 왕때꼬마: crouches ("!") >= 20 frames, hops toward the duck, each landing rolls a shockwave both ways along its surface; waves end at the edge', () => {
      const b = fight(0, 501); b.minionT = 1e9;
      D.setPlayer(56, 136); // the duck on the boss's shelf (row 17), well to its left
      if (until(() => b.act === 'crouch', 300) < 0) return 'never crouched';
      const d0 = Math.abs(b.x + 16 - (G.p.x + 8));
      const cf = until(() => b.act === 'air', 60);
      if (cf < 20) return 'crouch telegraph only ' + cf + ' frames';
      if (until(() => b.act !== 'air', 200) < 0) return 'never landed';
      const waves = G.hazards.filter((h) => h.kind === 'wave');
      if (waves.length !== 2) return 'waves ' + waves.length;
      if (!(waves[0].vx * waves[1].vx < 0)) return 'waves do not roll both ways';
      if (waves.some((h) => Math.abs(h.y - (b.y + 32)) > 0.5)) return 'wave not on the landing surface';
      if (!(Math.abs(b.x + 16 - (G.p.x + 8)) < d0 - 20)) return 'hop not toward the duck (' + d0.toFixed(0) + ' -> ' + Math.abs(b.x + 16 - (G.p.x + 8)).toFixed(0) + ')';
      b.minionT = 1e9; b.calm = 1e9;
      const gone = until(() => !G.hazards.some((h) => h.kind === 'wave'), 400);
      if (gone < 0) return 'waves never cleaned up';
      // phase 3: double hops
      D.damageBoss(); waitFight(140); D.damageBoss(); waitFight(140);
      b.calm = 0; b.minionT = 1e9;
      let lands = 0, firstLand = -1;
      for (let k = 0; k < 160 && lands < 2; k++) { const air = b.act === 'air'; D.step(1); if (air && b.act !== 'air') { lands++; if (firstLand < 0) firstLand = k; else if (k - firstLand > 60) break; } }
      if (lands < 2) return 'phase 3 no double hop (' + lands + ' landings)';
    });
    t('boss 1: a shockwave kills a duck standing in its path; jumping over it is safe', () => {
      const run1 = (jumpIt) => {
        const b = fight(0, 502); b.minionT = 1e9;
        D.setPlayer(64, 136); D.step(30);
        D.setInvincible(false); G.p.invuln = 0;
        // "passed": the wave's hit box went right under the duck (it breaks up at the shelf edge just after)
        let dead = false, passed = false, saw = false, w = null;
        for (let k = 0; k < 400 && !dead && !(saw && w && w.dead); k++) {
          const p = G.p;
          if (!w || w.dead) w = G.hazards.find((h) => h.kind === 'wave' && h.vx < 0) || w;
          if (w && !w.dead) {
            saw = true;
            const gap = (w.x + 2) - (p.x + 12);
            D.press('jump', jumpIt && p.onGround && gap <= 6 && gap > -4);
            if (w.x + 2 < p.x + 6 && w.t > 9) passed = true;
          }
          D.step(1);
          if (G.mode === 'dying') dead = true;
          if (!dead && b.act === 'crouch') b.calm = 1e9;
        }
        D.press('jump', false); D.setInvincible(true);
        return { dead, passed, saw };
      };
      const a = run1(false);
      if (!a.saw) return 'no wave came';
      if (!a.dead) return 'standing duck survived the wave';
      const c = run1(true);
      if (c.dead) return 'jumping duck died';
      if (!c.passed) return 'wave never passed the jumping duck';
    });

    t('boss 2 곰팡이 여왕: floats near the ceiling; glows ("!") >= 30 frames then lobs a 3-spread of spores in arcs; a landed spore grows into a mold after 3 s; a capture bubble destroys a spore (+100); phase 3 flies lower with 5-spreads', () => {
      const b = fight(1, 601); b.minionT = 1e9;
      D.setPlayer(40, 200);
      let maxY = 0;
      if (until(() => { maxY = Math.max(maxY, b.y); return b.act === 'charge'; }, 400) < 0) return 'never charged';
      if (maxY > 64) return 'not in the top third (y up to ' + maxY.toFixed(0) + ')';
      const cf = until(() => G.hazards.some((h) => h.kind === 'spore'), 80);
      if (cf < 30) return 'telegraph only ' + cf + ' frames';
      const sp = G.hazards.filter((h) => h.kind === 'spore');
      if (sp.length !== 3) return 'spread of ' + sp.length;
      if (!sp.every((h) => h.vy < 0)) return 'spores not lobbed upward first';
      if (new Set(sp.map((h) => h.vx.toFixed(2))).size !== 3) return 'spores not spread';
      b.atkCd = 1e9;
      if (until(() => G.hazards.some((h) => h.kind === 'spore' && h.state === 'land'), 300) < 0) return 'no spore landed';
      const s = G.hazards.find((h) => h.kind === 'spore' && h.state === 'land');
      const m0 = G.enemies.filter((e) => e.type === 'mold' && e.state !== 'dead').length;
      const hf = until(() => s.dead, 400);
      if (hf < 165 || hf > 185) return 'hatched after ' + hf + ' frames';
      if (G.enemies.filter((e) => e.type === 'mold' && e.state !== 'dead').length !== m0 + 1) return 'no mold grew';
      // the next volley: shoot a landed spore
      b.atkCd = 1;
      if (until(() => G.hazards.some((h) => h.kind === 'spore' && h.state === 'land' && h.hatch < 60), 400) < 0) return 'no second landing';
      b.atkCd = 1e9;
      const s2 = G.hazards.find((h) => h.kind === 'spore' && h.state === 'land' && h.hatch < 60);
      const q = D.spawnBubble('empty', s2.x - 20, s2.y - 4); q.state = 'shot'; q.vx = 3.5; q.shotT = 22;
      const sc = G.score, mn = G.enemies.length;
      if (until(() => s2.dead, 12) < 0) return 'capture bubble did not destroy the spore';
      if (G.score - sc !== 100) return 'spore points ' + (G.score - sc);
      D.step(200);
      if (G.enemies.length > mn + G.hazards.filter((h) => h.kind === 'spore').length + 1) return 'destroyed spore still grew';
      // phase 3
      D.damageBoss(); waitFight(140); D.damageBoss(); waitFight(140);
      b.minionT = 1e9; b.atkCd = 90; G.hazards = [];
      let sumY = 0, cnt = 0;
      if (until(() => { sumY += b.y; cnt++; return G.hazards.some((h) => h.kind === 'spore'); }, 300) < 0) return 'phase 3 no volley';
      const n5 = G.hazards.filter((h) => h.kind === 'spore').length;
      if (n5 !== 5) return 'phase 3 spread of ' + n5;
      if (b.y < 66) return 'phase 3 not lower (y ' + b.y.toFixed(0) + ')';
    });

    t('boss 3 대왕 수세미: 0.6 s wind-up (shaking + "!") then a charge along its row; slams a wall -> dizzy 1 s with soap hits x2; hops between shelves to follow the duck', () => {
      const b = fight(2, 701); b.minionT = 1e9;
      D.setPlayer(100, 168); // same shelf (row 21), left of the boss
      if (until(() => b.act === 'wind', 300) < 0) return 'no wind-up';
      const wf = until(() => b.act === 'charge', 80);
      if (wf < 34 || wf > 40) return 'wind-up ' + wf + ' frames';
      if (until(() => b.act === 'dizzy', 240) < 0) return 'never slammed a wall (act ' + b.act + ')';
      D.setPlayer(b.x + 16 < W / 2 ? 200 : 40, 200);
      const s0 = b.soap;
      const q = D.spawnBubble('empty', b.x + 16 < W / 2 ? b.x + 40 : b.x - 24, b.y + 8); q.state = 'shot'; q.vx = b.x + 16 < W / 2 ? -3.5 : 3.5; q.shotT = 22;
      if (until(() => b.soap > s0, 12) < 0) return 'dizzy shot missed';
      if (b.soap !== s0 + 2) return 'dizzy soap ' + s0 + ' -> ' + b.soap;
      const df = until(() => b.act !== 'dizzy', 100);
      if (df < 40 || df > 64) return 'dizzy left ' + df + ' frames';
      // shelves: the duck on the top shelf (row 9), the boss has to climb three
      b.calm = 0;
      D.setPlayer(40, 72);
      const up = until(() => b.onGround && b.y + 32 <= 89, 1800);
      if (up < 0) return 'never reached the duck\'s shelf (feet ' + (b.y + 32).toFixed(0) + ')';
      log('BOSS INFO boss 3 climbed to the top shelf in ' + up + ' frames');
    });

    t('boss 4 이태리 타올 대마왕: swoop marks the duck ("!" + target) >= 40 frames then dives there; mitt rain falls straight down; phase 2 adds a row sweep with >= 44 frames of warning; phase 3 breaks the shower (scald drops)', () => {
      const b = fight(3, 801); b.minionT = 1e9;
      D.setPlayer(60, 200);
      if (until(() => b.act === 'swoopWind', 300) < 0) return 'no swoop';
      if (Math.abs(b.tx - (G.p.x + 8)) > 4) return 'target not on the duck';
      const sf = until(() => b.act === 'swoop', 80);
      if (sf < 40) return 'swoop telegraph ' + sf;
      const tx = b.tx, ty = b.ty;
      if (until(() => b.act !== 'swoop', 120) < 0) return 'endless swoop';
      if (Math.hypot(b.x + 16 - tx, b.y + 16 - ty) > 26) return 'dive ended far from the mark';
      if (until(() => b.act === 'rain', 400) < 0) return 'no mitt rain';
      if (until(() => G.hazards.some((h) => h.kind === 'mitt'), 60) < 0) return 'no mitts';
      const m = G.hazards.find((h) => h.kind === 'mitt'), mx = m.x;
      while (!m.dead) { D.step(1); if (m.x !== mx) return 'mitt drifted sideways'; }
      b.atkCd = 1e9;
      if (until(() => !G.hazards.length, 300) < 0) return 'mitts never cleaned up';
      if (G.drops.length) return 'scald drops before phase 3';
      // phase 2: row sweep
      D.damageBoss(); waitFight(140);
      b.minionT = 1e9; D.setPlayer(60, 200); D.step(2);
      b.cycle = 2; b.atkCd = 1; b.act = 'hover'; b.calm = 0;
      if (until(() => G.hazards.some((h) => h.kind === 'sweep'), 30) < 0) return 'no sweep';
      const sw = G.hazards.find((h) => h.kind === 'sweep');
      if (Math.abs(sw.sy - (G.p.y + 16)) > 1) return 'sweep not on the duck\'s row';
      const warn = until(() => sw.state === 'go', 90);
      if (warn < 44) return 'sweep warning ' + warn + ' frames';
      if (until(() => sw.dead, 120) < 0) return 'sweep never left';
      if (G.drops.length) return 'scald drops in phase 2';
      // phase 3: scald drops
      D.damageBoss(); waitFight(140); b.minionT = 1e9;
      if (until(() => G.drops.length > 0, 300) < 0) return 'no scald drops in phase 3';
      const d = G.drops[0];
      if (d.state !== 'form') return 'drop without warning';
    });
    t('final boss: the sweep kills a duck on its row; a jump clears it', () => {
      const go = (jumpIt) => {
        const b = fight(3, 802); D.damageBoss(); waitFight(140);
        b.minionT = 1e9; D.setPlayer(60, 200); D.step(3);
        b.cycle = 2; b.atkCd = 1; b.act = 'hover'; b.calm = 0;
        until(() => G.hazards.some((h) => h.kind === 'sweep'), 30);
        const sw = G.hazards.find((h) => h.kind === 'sweep');
        b.atkCd = 1e9; b.calm = 1e9;
        D.setInvincible(false); G.p.invuln = 0;
        let dead = false;
        for (let k = 0; k < 200 && sw && !sw.dead && !dead; k++) {
          const p = G.p, gap = sw.dir > 0 ? (p.x + 4) - (sw.x + 24) : sw.x - (p.x + 12);
          D.press('jump', jumpIt && sw.state === 'go' && p.onGround && gap < 14 && gap > -2);
          D.step(1);
          if (G.mode === 'dying') dead = true;
        }
        D.press('jump', false); D.setInvincible(true);
        return dead;
      };
      if (!go(false)) return 'standing duck survived the sweep';
      if (go(true)) return 'jumping duck was hit';
    });

    // ------------------------------------------------------------------ 3. HUD bars, debug API, hurry
    t('HP (3 segments) and soap gauge are drawn at the top of the playfield and follow the fight', () => {
      const b = fight(0, 901); noAttacks(b); D.step(1);
      const seg = (i) => px(34 + i * 25 + 10, PF_TOP + 3);
      if (seg(0) !== '#ff5a7a' || seg(2) !== '#ff5a7a') return 'full HP not drawn: ' + seg(0) + ' ' + seg(2);
      if (px(170, PF_TOP + 4) !== '#12303a') return 'empty soap gauge colour ' + px(170, PF_TOP + 4);
      D.soapBoss(4); D.step(1);
      if (px(164, PF_TOP + 4) !== '#9fe6ff') return 'soap fill ' + px(164, PF_TOP + 4);
      if (px(230, PF_TOP + 4) !== '#12303a') return 'soap overfilled';
      D.damageBoss(); waitFight(140); D.step(1);
      if (seg(2) !== '#3a1420' || seg(1) !== '#ff5a7a') return 'HP after damage ' + seg(1) + ' ' + seg(2);
      D.stunBoss(); D.step(1);
      if (px(164, PF_TOP + 4) !== '#ffe36b') return 'stun timer bar ' + px(164, PF_TOP + 4);
      // no bar in a normal round
      D.gotoRound(0); D.step(1);
      if (px(34 + 10, PF_TOP + 3) === '#ff5a7a') return 'boss bar drawn in a normal round';
    });
    t('PG.debug boss API: getState().boss shape; soapBoss/stunBoss/damageBoss/killBoss; popAll bursts the giant bubble; killAll defeats the boss; helpers return null outside boss rounds', () => {
      D.seed(3); D.start(0); D.setInvincible(true);
      if (S().boss !== null) return 'boss in round 1';
      for (const fn of ['soapBoss', 'stunBoss', 'damageBoss', 'killBoss']) if (D[fn]() !== null) return fn + ' outside a boss round';
      const b = enter(1, 902);
      const s = S().boss;
      for (const k of ['type', 'hp', 'soap', 'soapMax', 'state', 'x', 'y']) if (!(k in s)) return 'getState().boss missing ' + k;
      const r1 = D.soapBoss(3);
      if (!r1 || r1.soap !== 3 || r1.state !== 'fight') return 'soapBoss ' + JSON.stringify(r1);
      const r2 = D.stunBoss();
      if (r2.state !== 'stun') return 'stunBoss ' + r2.state;
      D.popAll();
      if (b.state !== 'down' || b.hp !== 2) return 'popAll did not burst the giant bubble: ' + b.state;
      const r3 = D.damageBoss();
      if (r3.hp !== 1 || r3.state !== 'down') return 'damageBoss ' + JSON.stringify(r3);
      b.minionT = 1; waitFight(140); D.step(2);
      D.trapAll();
      if (b.state !== 'fight') return 'trapAll touched the boss';
      D.killAll();
      if (b.state !== 'defeat' || G.enemies.some((e) => e.state !== 'dead')) return 'killAll ' + b.state;
      const r4 = D.killBoss();
      if (r4.state !== 'defeat') return 'killBoss ' + r4.state;
    });
    t('no hurry / no broken shower in boss rounds (the final boss\'s own phase-3 drops aside)', () => {
      const bad = [];
      for (let n = 0; n < 4; n++) {
        const b = fight(n, 950 + n);
        b.minionT = 1e9;
        for (let f = 0; f < 3000; f++) { if (f % 300 === 0) D.setPlayer(f % 600 ? 40 : 200, 200); D.step(1); if (G.hurry || G.scald) { bad.push('boss ' + (n + 1) + ' hurry at ' + f); break; } if (G.drops.length) { bad.push('boss ' + (n + 1) + ' drops at ' + f); break; } }
        if ($('pg-banner-main').textContent === '서둘러!') bad.push('hurry banner');
      }
      if (bad.length) return bad.join(', ');
    });

    // ------------------------------------------------------------------ 4. winnability: a press()-only bot beats boss 1
    t('scripted bot (PG.debug.press only, real lives) beats boss 1 왕때꼬마', () => {
      const seeds = [11, 22, 33, 44, 55, 66];
      const res = seeds.map((s) => botRun(D, G, 0, s, 14000));
      const won = res.filter((r) => r.won);
      log('BOSS INFO bot vs boss 1: ' + res.map((r, i) => `seed ${seeds[i]}: ${r.won ? 'won in ' + r.frames + ' frames (' + (r.frames / 60).toFixed(1) + ' s), ' + r.deaths + ' death(s)' : 'lost (hp ' + r.hp + ', ' + r.deaths + ' deaths)'}${r.causes.length ? ' [' + r.causes.join(', ') + ']' : ''}`).join(' | '));
      if (won.length < 5) return 'won ' + won.length + '/' + seeds.length;
    });

    releaseAll();
    D.setInvincible(false);
    if (oSfx) A.sfx = oSfx;
    if (oMusic) A.music = oMusic;
    t('no uncaught page errors', () => (errors === 0 ? undefined : errors + ' errors'));
    log('BOSS DONE pass=' + pass + ' fail=' + fail);
  }
  function go() { if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30); setTimeout(() => { try { run(); } catch (e) { console.log('BOSS FAIL exception ' + e.message + ' ' + (e.stack || '').split('\n')[1]); console.log('BOSS DONE pass=' + pass + ' fail=' + (fail + 1)); } }, 60); }
  go();
})();
