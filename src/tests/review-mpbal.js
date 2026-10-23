// Review (multiplayer gameplay & character balance): bot-driven battle / co-op statistics in ONE engine
// (PG.debug.local, every player local, canvas drawing + audio stubbed for speed). Not part of run-all.
// Built to C:/Temp/bogeul/test-review-mpbal.html. Real-time run (one page per job):
//   node tools/run-chrome.js "test-review-mpbal.html?exp=duel&pairs=duck-cat&arenas=0,1,2,3&seeds=1-5" - 900 760 rt900000 "BAL DONE"
// exp=duel  : 1v1 battles, every listed pair in both slot orders x arenas x seeds (pairs=a-b,c-d | all | mirror)
// exp=ffa   : 2-4 player battles (n=4), characters drawn per seed (chars=random | a,b,c,d), arenas x seeds
// exp=coop  : the campaign with n bots (n=1 solo, 2, 4) from round=0 until game over or round `to`, seeds
// exp=clutter: floating empty bubbles on screen (game.js EMPTY_RULE): mode=coop|battle, n (1 = solo), secs, seeds,
//             arenas (battle) / rounds (co-op, from round 0); spam=30 adds a human trigger finger (an extra tap 1 in 30
//             frames: ~1.7 blows a second); co-op runs invincible. Per second while playing: floating mean / p90 / max
//             (all, per player), blows/s, how long a floating one lasted, % used (popped by a touch / chain) and the
//             self-pops (life or cap), kills / chain combos. shot=<s>: stop there, draw it for real, "BAL SHOT READY":
//   node tools/run-chrome.js "test-review-mpbal.html?exp=clutter&mode=coop&n=4&secs=150&seeds=1-4&spam=30" - 900 760 rt600000 "BAL DONE"
//   node tools/run-chrome.js "test-review-mpbal.html?exp=clutter&mode=battle&n=4&seeds=1&arenas=1&spam=30&shot=45" C:/Temp/bogeul/clutter-battle-after.png 900 760 rt60000 "BAL SHOT READY"
// common: perks=0 (능력 끄기), time=3, react=10 (frames before a bot sees a new opponent shot), mash=8 (presses/s)
//         ammo=0 (no battle magazine: game.js AMMO off), mag=duck:3:120,capy:2:84 (try other magazines: blows, frames)
// Prints "BAL MATCH {json}" per battle, "BAL COOP {json}" per campaign run, "BAL DONE".
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const log = (s) => console.log(s);
  const TS = 8, TOP = 16, H = 40, WALL_L = 16, WALL_R = 240, PF_BOT = 224, CEIL_Y = 24;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const CHARS = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'];
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // =================================================================== the bot (one per player slot)
  // Platform routing over the shelf graph + a short look-ahead dodge (adapted from tests/v2-boss.js makeBot),
  // with battle / co-op goals. Identical logic for every animal; its own physics (perks) feed the look-ahead.
  function makeBot(D, G, slot, cfg) {
    cfg = Object.assign({ react: 10, mash: 8, seed: 1, jit: 0, ownlock: 0 }, cfg || {});
    const rnd = mulberry((cfg.seed * 7919 + slot * 104729) | 0);
    const me = () => G.players.find((q) => q.slot === slot);
    const lvl = () => (G.gameMode === 'battle' ? D.arenas()[G.arena] : D.levels()[G.round]);
    let M = null, segs = null, gapC = [];
    function refresh() {
      const L = lvl(); if (!L) return false;
      if (L.map !== M) { M = L.map; segs = null; gapC = []; for (let c = 2; c < 30; c++) if (M[25][c] !== '#') gapC.push(c); }
      return true;
    }
    const solid = (c, r) => { if (c < 0 || c > 31) return true; r = ((r % 26) + 26) % 26; return M[r][c] === '#'; };
    const wet = (c, r) => { const row = M[r]; const ch = row && row[c]; return ch === '~' || ch === '='; };
    const topAt = (c, r) => c >= 2 && c <= 29 && r >= 1 && r <= 25 && solid(c, r) && !solid(c, r - 1);
    const surf = (c, r) => c >= 2 && c <= 29 && r >= 1 && r <= 25 && !solid(c, r - 1) && !wet(c, r - 1) && (solid(c, r) || wet(c, r));
    function landRow(x0, x1, f0, f1, skip) {
      const r0 = Math.max(0, Math.ceil((f0 - TOP) / TS - 1e-6)), r1 = Math.min(25, Math.floor((f1 - TOP) / TS));
      const c0 = Math.max(2, Math.floor(x0 / TS)), c1 = Math.min(29, Math.floor((x1 - 0.001) / TS));
      for (let r = r0; r <= r1; r++) { if (r === skip) continue; for (let c = c0; c <= c1; c++) if (topAt(c, r)) return TOP + r * TS; }
      return null;
    }
    function segments() {
      if (segs) return segs;
      segs = [];
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
    function phys(p) {
      const on = !G.perksOff, slip = !!(p.power && p.power.type === 'slippers');
      return { walk: 1.25 * (slip ? 1.4 : 1) * (on && p.char === 'capy' ? 0.92 : 1), jv: -4.1 * (slip ? 1.08 : 1) * (on && p.char === 'cat' ? 1.08 : 1) };
    }
    // ---- what is coming: boxes per future frame (enemies, boss, hazards, drops, opponents' capture shots)
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
        }
        out.push([x + 5, y + 6, x + 27, y + 30]);
      }
      return out;
    }
    function threats(p) {
      const T = [], b = G.boss;
      if (b && b.state === 'fight') T.push(bossBoxes(b));
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
        if (e.type === 'fly') { vx = e.fvx || vx; vy = e.fvy || vy; }
        for (let t = 1; t <= H; t++) {
          if (e.type === 'fly') { x += vx * 0.6; y += vy * 0.6; }
          else {
            x = clamp(x + vx, WALL_L - 2, WALL_R - 14);
            if (!g) { const vy0 = vy; vy = Math.min(3.5, vy + 0.22); const f0 = y + 16; y += (vy0 + vy) / 2; if (vy >= 0) { const l = landRow(x + 3, x + 13, f0, y + 16); if (l !== null) { y = l - 16; vy = 0; g = true; } } if (y + 16 > PF_BOT) y -= 208; }
          }
          const m = Math.min(4, t * 0.15);
          L.push((e.grace || 0) > t ? null : [x + 3 - m, y + 4 - m, x + 13 + m, y + 15]);
        }
        T.push(L);
      }
      if (G.gameMode === 'battle') {
        for (const q of G.bubbles) {
          // an opponent's capture shot is only "seen" after `react` frames (human reaction time)
          if (q.dead || q.kind !== 'empty' || q.state !== 'shot' || q.owner === slot || q.owner < 0 || q.age < cfg.react) continue;
          const r = q.big ? 12 : 8, L = [];
          let x = q.x, k = q.shotT;
          for (let t = 1; t <= H; t++) {
            if (k > 0) { x += q.vx; k--; if (x < WALL_L || x + 16 > WALL_R) k = 0; L.push([x + 8 - r + 1, q.y + 8 - r + 1, x + 8 + r - 1, q.y + 8 + r - 1]); } else L.push(null);
          }
          T.push(L);
        }
      }
      return T;
    }
    function simulate(p, dir, jt, T) {
      const ph = phys(p);
      let x = p.x, y = p.y, vy = p.vy, vx = p.vx, g = !!(p.onGround || p.water), coyote = g ? 4 : 0;
      const inv = p.invuln | 0;
      for (let t = 1; t <= H; t++) {
        vx += clamp(dir * ph.walk - vx, -0.5, 0.5);
        if (t - 1 === jt && (g || coyote > 0)) { vy = ph.jv; g = false; coyote = 0; }
        x = clamp(x + vx, WALL_L - 2, WALL_R - 14);
        const vy0 = vy; vy = Math.min(3.5, vy + 0.22); const f0 = y + 16; y += (vy0 + vy) / 2;
        const was = g; g = false;
        if (vy >= 0) { const l = landRow(x + 3, x + 13, f0, y + 16); if (l !== null) { y = l - 16; vy = 0; g = true; } }
        if (g) coyote = 4; else if (was) coyote = 3; else if (coyote > 0) coyote--;
        if (y + 16 > PF_BOT) return t + 24;
        if (t <= inv) continue;
        const bx0 = x + 3, by0 = y + 3, bx1 = x + 13, by1 = y + 16;
        for (const L of T) { const q = L[t - 1]; if (q && q[0] < bx1 && q[2] > bx0 && q[1] < by1 && q[3] > by0) return t; }
      }
      return H + 1;
    }
    let shootWait = -1;
    let prev = { jump: false, shoot: false }, airMove = 0, mashAcc = rnd(), stuck = 0, lastX = -1, wander = null, wanderT = 0;
    function press(w) {
      const jp = w.jump && !prev.jump, sp = w.shoot && !prev.shoot;
      D.press('left', !!w.left, slot); D.press('right', !!w.right, slot);
      D.press('jump', jp, slot); D.press('shoot', sp, slot);
      prev = { jump: jp, shoot: sp };
    }
    function decide() {
      const p = me(), out = { left: false, right: false, jump: false, shoot: false };
      if (!p || G.mode !== 'playing' || !refresh()) { airMove = 0; return out; }
      if (p.trap) {
        // mash jump at cfg.mash presses per second (0 = wait it out)
        mashAcc += cfg.mash / 60;
        if (mashAcc >= 1) { mashAcc -= 1; out.jump = true; }
        return out;
      }
      if (p.dead || p.koT > 0 || p.out || p.stunT > 0) { airMove = 0; return out; }
      const battle = G.gameMode === 'battle';
      const px = p.x + 8, pcy = p.y + 8, pf = p.y + 16, onG = !!(p.onGround || p.water);
      let move = 0, jump = false, shoot = false;
      const S = segments();
      let seg = null;
      if (onG) {
        let r = Math.round((pf - TOP) / TS);
        if (p.water) { const c = Math.floor(px / TS); r = Math.floor((p.y + 15 - TOP) / TS); while (r > 1 && wet(c, r - 1)) r--; }
        const c0 = Math.floor((p.x + 3) / TS), c1 = Math.floor((p.x + 12.99) / TS);
        seg = S.find((s) => s.r === r && s.c1 >= c0 && s.c0 <= c1) || null;
        if (!seg) { let bd = 1e9; for (const s of S) { const d = Math.abs(s.y - pf) * 4 + Math.max(0, s.x0 - px, px - s.x1); if (Math.abs(s.y - pf) <= 8 && d < bd) { bd = d; seg = s; } } }
      }
      const facing = (tx) => Math.sign(tx - px) === p.facing;
      const go = (goal) => {
        if (!seg) return false;
        const r = route(seg, goal);
        if (!r) return null;
        if (r.here) return true;
        const e = r.edge;
        if (e.kind === 'up') { if (Math.abs(e.x - px) > 3) move = Math.sign(e.x - px); else { jump = true; airMove = Math.abs(e.lx - px) > 4 ? Math.sign(e.lx - px) : 0; move = airMove; } }
        else if (e.kind === 'hop') { move = e.d; if (Math.abs(e.x - px) < 5) { jump = true; airMove = e.d; } }
        else move = e.d;
        return false;
      };
      const touchAt = (gx, gy, rr) => {
        const reach = (s) => gy > s.y - 48 - rr && gy < s.y + 4 && gx > s.x0 - 14 && gx < s.x1 + 14;
        const g = go(reach);
        if (g === true || !seg) {
          move = Math.abs(gx - px) > 3 ? Math.sign(gx - px) : 0;
          if (onG && gy < pcy - 6 && Math.abs(gx - px) < 16 + rr) { jump = true; airMove = Math.sign(gx - px); }
        }
        if (!onG) airMove = Math.abs(gx - px) > 3 ? Math.sign(gx - px) : 0;
        return g !== null;
      };
      // ---- shoot target on my level
      let st = null, sd = 1e9;
      const consider = (x, kind) => { const d = Math.abs(x - px); if (d < 76 && d < sd) { sd = d; st = { x, kind }; } };
      for (const e of G.enemies) if (e.state === 'active' && Math.abs(e.y + 8 - pcy) < 9) consider(e.x + 8, 'enemy');
      if (battle) for (const q of G.players) if (q !== p && !q.dead && !q.koT && !q.trap && !q.out && !(q.invuln > 0) && Math.abs(q.y + 8 - pcy) < 9) consider(q.x + 8, 'player');
      const B = G.boss;
      if (B && B.state === 'fight' && p.y + 7 > B.y - 6 && p.y + 7 < B.y + 38) { const d = Math.max(0, Math.abs(B.x + 16 - px) - 14); if (d < 70 && d < sd) { sd = d; st = { x: B.x + 16, kind: 'boss' }; } }
      // ---- touch targets by value / distance
      let tt = null, tv = 0;
      const want = (x, y, v, rr, kind) => { const c = Math.abs(x - px) + 2 * Math.abs(y - pcy) + 40, s = v / c; if (s > tv) { tv = s; tt = { x, y, rr, kind }; } };
      for (const q of G.bubbles) {
        if (q.dead || q.state !== 'float') continue;
        if (q.kind === 'player' && q.victim && q.victim !== p) { if (!(cfg.ownlock && q.owner === slot && q.age < cfg.ownlock)) want(q.x + 8, q.y + 8, 600, 8, 'ko'); }
        else if (q.kind === 'trapped') want(q.x + 8, q.y + 8, battle ? 150 : 500, 8, 'pop');
      }
      if (!battle) for (const g of G.players) if (g !== p && g.ghost) want(g.x + 8, g.y + 8, 1600, 8, 'ghost');
      if (B && B.state === 'stun' && B.giant) want(B.giant.x + 20, B.giant.y + 20, 3000, 18, 'giant');
      for (const it of G.items) want(it.x + 8, it.y + 8, it.value * 0.6, 6, 'item');
      if (G.pickup) want(G.pickup.x + 8, G.pickup.y + 8, 300, 6, 'power');
      const urgent = tt && (tt.kind === 'ko' || tt.kind === 'ghost' || tt.kind === 'giant');
      let busy = false;
      if (urgent) {
        busy = touchAt(tt.x, tt.y, tt.rr);
        if (st && facing(st.x) && sd < 60) shoot = true;
      }
      if (!busy && st) {
        if (!facing(st.x)) move = Math.sign(st.x - px); else shoot = true;
        if (st.kind === 'enemy' && sd < 22) move = -Math.sign(st.x - px) || 1;
        busy = st.kind === 'player' ? sd < 40 : sd < 44;
      }
      if (!busy && tt && !shoot) busy = touchAt(tt.x, tt.y, tt.rr);
      if (!busy && !shoot && !move && !jump) {
        if (B && B.state === 'fight' && !battle) bossPlan(p, B, seg, onG, px, pf, go, (m, j, s2) => { move = m; jump = j; shoot = s2; });
        else {
          // hunt: the nearest opponent (battle) or enemy, from a shelf at its height
          let tgt = null, td = 1e9;
          const cand = [];
          for (const e of G.enemies) if (e.state === 'active') cand.push([e.x + 8, e.y + 16]);
          if (battle) for (const q of G.players) if (q !== p && !q.dead && !q.koT && !q.trap && !q.out) cand.push([q.x + 8, q.y + 16]);
          if (B && B.state === 'fight') cand.push([B.x + 16, B.y + 32]);
          for (const c of cand) { const d = Math.abs(c[0] - px) + 2 * Math.abs(c[1] - pf); if (d < td) { td = d; tgt = c; } }
          let ok = false;
          if (tgt && seg) {
            const tx = tgt[0], tfeet = tgt[1];
            const goal = (s) => s.y >= tfeet - 6 && s.y <= tfeet + 30 && tx > s.x0 - 40 && tx < s.x1 + 40;
            const g = go(goal);
            if (g === true) { ok = true; const dx = tx - px; if (Math.abs(dx) > 56) move = Math.sign(dx); else if (Math.abs(dx) < 26) move = -Math.sign(dx) || 1; else if (!facing(tx)) move = Math.sign(dx); }
            else if (g === false) ok = true;
          }
          if (!ok && seg) {
            if (!wander || wanderT-- <= 0 || wander === seg.id) { wander = S[Math.floor(rnd() * S.length)].id; wanderT = 240; }
            const g = go((s) => s.id === wander);
            if (g === true || g === null) wander = null;
          }
        }
      }
      if (!onG && !move) move = airMove;
      if (onG && !jump) airMove = 0;
      // stuck against something: hop
      if (onG && move && Math.abs(p.x - lastX) < 0.05) { if (++stuck > 20) { jump = true; stuck = 0; } } else stuck = 0;
      lastX = p.x;
      // ---- safety: if the plan runs into something, take the safest plan instead
      const T = threats(p);
      const wantS = simulate(p, move, jump ? 0 : -1, T);
      if (wantS <= H) {
        let best = null;
        for (const dir of [move, -move || 1, move ? 0 : -1]) {
          for (const jt of [-1, 0, 3, 7, 12, 18]) {
            const s = simulate(p, dir, jt, T);
            const score = s * 10 - (dir === move ? 0 : 2) - (jt < 0 ? 0 : 1) - (jt > 0 ? jt * 0.05 : 0);
            if (!best || score > best.score) best = { dir, jt, s, score };
          }
        }
        if (best && best.s > wantS) { move = best.dir; jump = best.jt === 0; if (jump) airMove = move; }
      }
      // never walk into the floor drain on purpose
      if (onG && pf >= PF_BOT - 8 && move && !jump && gapC.length) {
        const nx = p.x + move * 5, g0 = gapC[0] * TS, g1 = (gapC[gapC.length - 1] + 1) * TS;
        if (nx + 13 >= g0 && nx + 3 <= g1 && simulate(p, move, 0, T) > H) { jump = true; airMove = move; }
      }
      // reaction jitter: a new urge to shoot waits 0..jit frames (breaks same-frame ties between identical bots)
      if (cfg.jit > 0) {
        if (shoot) { if (shootWait < 0) shootWait = Math.floor(rnd() * (cfg.jit + 1)); if (shootWait > 0) { shootWait--; shoot = false; } }
        else shootWait = -1;
      }
      // (exp=clutter: a human trigger finger - an extra tap now and then, 1 in `spam` frames on average)
      if (cfg.spam > 0 && !shoot && rnd() < 1 / cfg.spam) shoot = true;
      out.left = move < 0; out.right = move > 0; out.jump = jump; out.shoot = shoot;
      if (shoot) shootWait = -1;
      return out;
    }
    // co-op boss positioning (from tests/v2-boss.js): level with the boss on a roomy shelf, or a perch to jump-shoot from
    function bossPlan(p, b, seg, onG, px, pf, go, set) {
      let move = 0, jump = false, shoot = false;
      const S = segments(), facing = (tx) => Math.sign(tx - px) === p.facing;
      const bc = b.x + 16, bcy = b.y + 16, dx = bc - px, adx = Math.abs(dx);
      const sameLvl = !b.def.fly && b.onGround && Math.abs(b.y + 32 - pf) < 6;
      const cramped = !b.def.fly && seg && seg.x1 - seg.x0 < 56 && adx < 110;
      const save = { m: 0, j: false };
      const go2 = (goal) => { const r = go(goal); return r; };
      if (cramped) go2((s) => s.x1 - s.x0 >= 72);
      else if (sameLvl) {
        if (adx < 40) move = -Math.sign(dx) || 1;
        else if (adx > 76) move = Math.sign(dx);
        else if (!facing(bc)) move = Math.sign(dx);
        else shoot = true;
        set(move, jump, shoot); return;
      } else {
        const lo = b.y - 4, hi = b.y + 34;
        const perch = (s) => s.y - 9 >= lo && s.y - 47 <= hi && s.x1 - s.x0 >= 16;
        const level = Math.abs(bcy - (p.y + 7)) < 15;
        if (!onG) { if (level && facing(bc) && adx < 80) shoot = true; set(move, jump, shoot); return; }
        if (seg && perch(seg)) {
          const lead = bc + b.vx * 14;
          let tx = clamp(lead + (px < lead ? -52 : 52), seg.x0 + 6, seg.x1 - 6);
          if (Math.abs(tx - px) > 5 && Math.abs(lead - px) > 30) move = Math.sign(tx - px);
          else if (!facing(bc)) move = Math.sign(dx);
          const rise = p.y + 7 - bcy;
          if (level && facing(bc) && adx < 80) shoot = true;
          else if (rise > 4 && rise < 46 && adx < 90 && adx > 26 && p.shootCd < 3) jump = true;
          set(move, jump, shoot); return;
        }
        go2((s) => perch(s) && Math.abs((s.x0 + s.x1) / 2 - bc) < 120);
      }
      void save; void S;
    }
    return {
      step() { press(decide()); },
      release() { for (const a of ['left', 'right', 'jump', 'shoot']) D.press(a, false, slot); prev = { jump: false, shoot: false }; },
    };
  }

  // =================================================================== battle runner + metrics
  const HOOK = { trap: null };
  function runBattle(D, G, chars, opts, seed, cfg) {
    D.seed(seed);
    D.local.battle(chars.map((c, i) => ({ char: c, nick: 'B' + (i + 1) })), Object.assign({ countdown: false }, opts));
    G.invincible = false;
    const W = cfg.whatif || {};
    // what-if: a fresh prison bubble cannot be popped by anyone for W.pgrace frames (set from the trap sfx, which the
    // engine plays inside trapPlayer, before the same frame's touch checks)
    HOOK.trap = W.pgrace ? () => { for (const p of G.players) if (p.trap && p.trap.t === 0 && p.trap.b) p.trap.b.grace = Math.max(p.trap.b.grace, W.pgrace); } : null;
    // swap: P1 and P2 start at each other's spawn (update order vs spawn geometry)
    if (W.swap && G.players.length >= 2) { const a = G.players[0], b = G.players[1]; const t = [a.x, a.y]; a.x = b.x; a.y = b.y; b.x = t[0]; b.y = t[1]; a.facing = -1; b.facing = 1; }
    let enemySum = 0;
    const n = chars.length, bots = chars.map((c, i) => makeBot(D, G, i, Object.assign({ seed: seed * 31 + i }, cfg)));
    const total = G.battle.total;
    const prev = G.players.map((p) => ({ trap: false, koT: 0, stunT: 0, kos: 0, kills: 0, score: 0, power: null }));
    const open = new Array(n).fill(null), respawnAt = new Array(n).fill(-1e9);
    const ev = { traps: 0, ko: 0, koSelf: 0, koThird: 0, esc: 0, other: 0, mutual: 0, koDt: [], escDt: [], instantKO: 0, stuns: 0, camp: 0, campKO: 0, reTrapDt: [], powers: 0, respawnDist: [], koSame: 0, koUnk: 0, trapByBlink: 0, trapByPower: {}, powerFrames: {} };
    const per = G.players.map((p) => ({ slot: p.slot, char: p.char, trapsMade: 0, trapped: 0, esc: 0, stuns: 0, boss: 0, powers: 0, src: { ko: 0, boss: 0, stun: 0, enemy: 0, snack: 0 } }));
    const T0 = G.frame;
    let itemsPrev = new Map();
    const snaps = {};
    let bossBy = null, bossSeen = false, f = 0, firstKO = -1, bossAt = -1;
    const trappedNow = () => G.players.filter((p) => p.trap).length;
    for (; f < total + 600; f++) {
      for (const b of bots) b.step();
      D.step(1);
      const t = G.frame;
      if (G.mode === 'podium') break;
      if (W.erespawn && G.battle && G.battle.enemyT === 150) G.battle.enemyT = W.erespawn;
      enemySum += G.enemies.filter((e) => e.state === 'active').length;
      for (const p of G.players) if (p.power) ev.powerFrames[p.power.type] = (ev.powerFrames[p.power.type] || 0) + 1;
      const left = G.battle ? G.battle.left : 0;
      const kosBefore = prev.map((q) => q.kos);
      const B0 = G.boss;
      const bossNow = B0 && B0.state === 'defeat' && bossBy === null && B0.lastBy ? B0.lastBy.slot : -1;
      // score sources: KO 500, intruder burst 1500, stun -100, snacks (an item that vanished this frame), the rest = enemies
      const itemsNow = new Map(G.items.map((it) => [it.id, it.value]));
      const vanished = []; for (const [id, v] of itemsPrev) if (!itemsNow.has(id)) vanished.push(v);
      itemsPrev = itemsNow;
      G.players.forEach((p, i) => {
        const q = prev[i];
        let d = p.score - q.score;
        if (!d) return;
        const ko = (p.kos - q.kos) * 500; per[i].src.ko += ko; d -= ko;
        if (bossNow === p.slot) { per[i].src.boss += 1500; d -= 1500; }
        if (!(q.stunT > 0) && p.stunT > 0) { per[i].src.stun -= 100; d += 100; }
        const k = vanished.indexOf(d);
        if (k >= 0 && d > 0) { per[i].src.snack += d; vanished.splice(k, 1); } else per[i].src.enemy += d;
      });
      if (left === 5400 || left === 3600 || left === 1800 || left === 600) snaps[left / 60] = G.players.map((p) => p.score);
      G.players.forEach((p, i) => {
        const q = prev[i];
        if (!q.trap && p.trap) {
          ev.traps++; per[i].trapped++;
          const by = p.trap.by; if (by >= 0 && per[by]) { per[by].trapsMade++; const tp = G.players[by]; if (tp.invuln > 0) ev.trapByBlink++; if (tp.power) ev.trapByPower[tp.power.type] = (ev.trapByPower[tp.power.type] || 0) + 1; }
          open[i] = { t, by };
          if (t - respawnAt[i] < 300 + 120) { ev.camp++; ev.reTrapDt.push(t - respawnAt[i]); }
          if (trappedNow() >= 2) ev.mutual++;
        }
        if (q.trap && !p.trap) {
          const o = open[i] || { t, by: -1 };
          const dt = t - o.t;
          if (p.koT > 0) {
            ev.ko++; if (firstKO < 0) firstKO = t - T0;
            const popper = G.players.findIndex((x, j) => x.kos > kosBefore[j]);
            if (popper === o.by) ev.koSelf++; else ev.koThird++;
            ev.koDt.push(dt); if (dt <= 20) ev.instantKO++;
            if (t - respawnAt[i] < 300 + 120 + 600) ev.campKO++;
          } else if (G.mode === 'playing') { ev.esc++; per[i].esc++; ev.escDt.push(dt); }
          else ev.other++;
          open[i] = null;
        }
        if (!q.trap && !(q.koT > 0) && p.koT > 0) {
          // trapped and popped in the SAME frame (a point-blank shot): never seen as trapped
          ev.ko++; ev.koSame++; ev.traps++; per[i].trapped++; if (firstKO < 0) firstKO = t - T0;
          const popper = G.players.findIndex((x, j) => x.kos > kosBefore[j]);
          const pb = G.bubbles.filter((b) => b.kind === 'player' && b.state === 'pop' && b.popT <= 1);
          const owner = pb.length === 1 ? pb[0].owner : -1;
          if (owner >= 0 && per[owner]) { per[owner].trapsMade++; const tp = G.players[owner]; if (tp.invuln > 0) ev.trapByBlink++; if (tp.power) ev.trapByPower[tp.power.type] = (ev.trapByPower[tp.power.type] || 0) + 1; }
          if (owner >= 0 && popper === owner) ev.koSelf++; else if (owner >= 0) ev.koThird++; else ev.koUnk++;
          ev.koDt.push(0); ev.instantKO++;
          if (t - respawnAt[i] < 300 + 120) { ev.camp++; ev.reTrapDt.push(t - respawnAt[i]); }
          if (t - respawnAt[i] < 300 + 120 + 600) ev.campKO++;
        }
        if (q.koT > 0 && !(p.koT > 0)) {
          respawnAt[i] = t;
          if (W.koinv) p.invuln = W.koinv;
          let dmin = 1e9; for (const o of G.players) if (o !== p && !o.koT && !o.dead) dmin = Math.min(dmin, Math.hypot(o.x - p.x, o.y - p.y));
          ev.respawnDist.push(Math.round(dmin));
        }
        if (!(q.stunT > 0) && p.stunT > 0) { ev.stuns++; per[i].stuns++; }
        if (!q.power && p.power) { ev.powers++; per[i].powers++; }
        q.trap = !!p.trap; q.koT = p.koT; q.stunT = p.stunT; q.kos = p.kos; q.kills = p.kills; q.score = p.score; q.power = p.power;
      });
      const B = G.boss;
      if (B) { bossSeen = true; if (bossNow >= 0) { bossBy = bossNow; per[bossBy].boss++; bossAt = left; } }
    }
    for (const b of bots) b.release();
    const ps = G.players.map((p, i) => ({ slot: p.slot, char: p.char, score: p.score, rank: p.rank, kos: p.kos, koed: p.koed, kills: p.kills, trapsMade: per[i].trapsMade, trapped: per[i].trapped, esc: per[i].esc, stuns: per[i].stuns, boss: per[i].boss, powers: per[i].powers, src: per[i].src }));
    const top = Math.max(...ps.map((p) => p.score));
    return { arena: G.battle ? G.battle.arena : opts.arena, seed, n, perks: !G.perksOff, frames: f, ended: G.mode === 'podium', tie: ps.filter((p) => p.score === top).length > 1, ps, snaps, bossSeen, bossBy, bossAt, firstKO, enemiesAvg: Math.round(enemySum / Math.max(1, f) * 100) / 100, whatif: W,
      ev: Object.assign({}, ev, { koDt: ev.koDt, escDt: ev.escDt, reTrapDt: ev.reTrapDt }) };
  }

  // =================================================================== co-op runner + metrics
  function runCoop(D, G, chars, seed, cfg, toRound, maxFrames) {
    D.seed(seed);
    if (chars.length === 1) D.start(0, chars[0]); else D.local.coop(chars.map((c, i) => ({ char: c, nick: 'C' + (i + 1) })), 0);
    G.invincible = false;
    const n = chars.length, bots = chars.map((c, i) => makeBot(D, G, i, Object.assign({ seed: seed * 17 + i }, cfg)));
    const rounds = [];
    let cur = null;
    const prev = G.players.map(() => ({ dead: false, ghost: null, kills: 0, revives: 0, power: null, score: 0 }));
    let prevLives = G.lives, prevMode = G.mode, f = 0;
    const ghosts = [], kills = { same: 0, other: 0, unk: 0 }, powers = new Array(n).fill(0);
    const gopen = new Array(n).fill(null);
    let floatIds = new Map();
    function startCur() { cur = { round: G.round, boss: !!G.boss, t0: G.frame, clear: -1, deaths: 0, revives: 0, timeouts: 0, lives0: G.lives, minionSum: 0, minionMax: 0, bossFrames: 0, bossFight0: -1, bossDef: -1, soapMax: G.boss ? G.boss.soapMax : 0, wipe: 0, scoreBy: [] }; }
    startCur();
    for (; f < maxFrames; f++) {
      for (const b of bots) b.step();
      D.step(1);
      if (G.round !== cur.round) { cur.scoreBy = G.players.map((p) => p.score); rounds.push(cur); startCur(); }
      if (Q.get('prog') && f % 5000 === 0) log('BAL PROG ' + f + ' round ' + G.round + ' mode ' + G.mode + ' lives ' + G.lives + ' boss ' + (G.boss ? G.boss.type + '/' + G.boss.state + ' soap ' + G.boss.soap + '/' + G.boss.soapMax + ' hp ' + G.boss.hp : '-') + ' players ' + G.players.map((p) => Math.round(p.x) + ',' + Math.round(p.y) + (p.dead ? 'D' : '') + (p.ghost ? 'G' : '') + (p.out ? 'O' : '')).join(' '));
      if (G.round >= toRound || G.mode === 'gameover' || G.mode === 'ending') break;
      const t = G.frame;
      if (G.clearT >= 0 && cur.clear < 0) cur.clear = t - cur.t0;
      if (G.boss) {
        const B = G.boss;
        if (B.state !== 'intro' && cur.bossFight0 < 0) cur.bossFight0 = t;
        if (B.state === 'defeat' && cur.bossDef < 0) { cur.bossDef = t; cur.bossBy = B.lastBy ? B.lastBy.slot : -1; }
        if (B.state === 'defeat' && B.pts && !cur.bossPts) cur.bossPts = B.pts + (B.bonus || 0);
        if (cur.bossFight0 >= 0 && cur.bossDef < 0) {
          cur.bossFrames++;
          const m = G.enemies.filter((e) => e.minion && e.state !== 'dead').length;
          cur.minionSum += m; cur.minionMax = Math.max(cur.minionMax, m);
        }
      }
      // kill attribution: a trapped bubble that popped this frame vs whose kills went up
      const up = G.players.map((p, i) => p.kills - prev[i].kills);
      for (const b of G.bubbles) {
        if (b.kind === 'trapped' && b.state === 'pop' && floatIds.has(b.id)) {
          const owner = floatIds.get(b.id), who = up.findIndex((d) => d > 0);
          if (who < 0 || owner < 0) kills.unk++; else if (who === owner) kills.same++; else kills.other++;
        }
      }
      floatIds = new Map(); for (const b of G.bubbles) if (b.kind === 'trapped' && b.state !== 'pop') floatIds.set(b.id, b.owner);
      G.players.forEach((p, i) => {
        const q = prev[i];
        if (!q.power && p.power) powers[i]++;
        if (!q.dead && p.dead) cur.deaths++;
        if (!q.ghost && p.ghost) gopen[i] = { t, y0: p.y, minY: p.y, ceilT: 0, round: G.round };
        if (p.ghost && gopen[i]) { const g = gopen[i]; g.minY = Math.min(g.minY, p.y); if (p.y <= CEIL_Y + 0.5) g.ceilT++; }
        if (q.ghost && !p.ghost && gopen[i]) {
          const g = gopen[i], how = !p.dead ? (G.lives < prevLives ? 'timeout' : 'revived') : (p.out ? 'out' : 'other');
          ghosts.push({ dt: t - g.t, how, y0: Math.round(g.y0), minY: Math.round(g.minY), ceilT: g.ceilT, round: g.round, mode: G.mode });
          if (how === 'revived') cur.revives++; else if (how === 'timeout') cur.timeouts++;
          gopen[i] = null;
        }
        q.dead = p.dead; q.ghost = p.ghost; q.kills = p.kills; q.revives = p.revives; q.power = p.power; q.score = p.score;
      });
      if (n === 1 && prevMode !== 'dying' && G.mode === 'dying') cur.deaths++;
      prevLives = G.lives; prevMode = G.mode;
    }
    if (cur && !rounds.includes(cur)) { cur.scoreBy = G.players.map((p) => p.score); cur.end = true; rounds.push(cur); }
    for (const b of bots) b.release();
    const ps = G.players.map((p, i) => ({ slot: p.slot, char: p.char, score: p.score, kills: p.kills, revives: p.revives | 0, powers: powers[i] }));
    return { n, seed, chars, frames: f, reached: G.round, over: G.mode === 'gameover', lives: G.lives, ps, rounds, ghosts, kills };
  }

  // =================================================================== clutter runner (exp=clutter)
  // How many FLOATING EMPTY bubbles are on screen: sampled once a second while playing (mean / p90 / max), per player
  // too, plus the blow rate. shotAt (seconds): stop there, draw the frame for real and log "BAL SHOT READY".
  function runClutter(D, G, mode, chars, opts, seed, cfg, secs, shotAt) {
    D.seed(seed);
    const list = chars.map((c, i) => ({ char: c, nick: (mode === 'battle' ? 'B' : 'C') + (i + 1) }));
    if (mode === 'battle') D.local.battle(list, Object.assign({ countdown: false }, opts));
    else if (chars.length === 1) D.start(opts.round | 0, chars[0]);
    else D.local.coop(list, opts.round | 0);
    // (co-op / solo: nobody falls - four players keep blowing all the way; a battle runs as it is)
    G.invincible = mode !== 'battle';
    const n = chars.length, bots = chars.map((c, i) => makeBot(D, G, i, Object.assign({ seed: seed * 23 + i }, cfg)));
    const all = [], per = chars.map(() => []), seen = new Set();
    let blows = 0, play = 0, selfPops = 0, capPops = 0, used = 0, ended = 0, floatF = 0, reached = 0;
    // (the life this build gives a floating empty: D.emptyRule() where the build has it, else the old 720 + 120)
    const rule = D.emptyRule ? D.emptyRule() : { life: 720, flash: 120 }, lifeEnd = rule.life + rule.flash;
    const chains = new Set();
    const live = new Map();
    const stopF = shotAt > 0 ? shotAt * 60 : secs * 60;
    for (let f = 0; f < stopF + 1; f++) {
      for (const b of bots) b.step();
      D.step(1);
      if (G.mode === 'podium' || G.mode === 'gameover' || G.mode === 'ending') break;
      if (G.mode !== 'playing') continue;
      play++;
      for (const b of G.bubbles) {
        if (b.owner >= 0 && b.kind === 'empty' && !seen.has(b.id) && !b.drop) { seen.add(b.id); blows++; }
      }
      // (a floating empty that left without a touch: its own pop - life or cap; one popped by a player or a chain: used)
      for (const [id, r] of live) {
        const b = r.b;
        if (!b.dead && b.kind === 'empty' && b.state === 'float') continue;
        if (b.state === 'pop' && !b.chain && b.kind === 'empty') { selfPops++; if (b.age <= lifeEnd) capPops++; } else if (b.state === 'pop' && b.chain) used++;
        ended++; floatF += r.f; if (r.near) reached++;
        live.delete(id);
      }
      for (const b of G.bubbles) if (b.kind === 'trapped' && b.state === 'pop' && b.chain) chains.add(b.chain);
      for (const b of G.bubbles) {
        if (b.kind !== 'empty' || b.state !== 'float' || b.dead) continue;
        let r = live.get(b.id); if (!r) { r = { b, f: 0, near: false }; live.set(b.id, r); }
        r.f++; if (G.gather && Math.hypot(b.x + 8 - G.gather.x, b.y + 8 - G.gather.y) < 24) r.near = true;
      }
      if (play % 60 === 0) {
        const fl = G.bubbles.filter((b) => b.kind === 'empty' && b.state === 'float' && !b.dead);
        all.push(fl.length);
        for (let i = 0; i < n; i++) per[i].push(fl.filter((b) => b.owner === i).length);
      }
    }
    for (const b of bots) b.release();
    const st = (a) => { if (!a.length) return { mean: 0, p90: 0, max: 0 }; const s = a.slice().sort((x, y) => x - y); return { mean: Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10, p90: s[Math.min(s.length - 1, Math.floor(s.length * 0.9))], max: s[s.length - 1] }; };
    const perMax = per.map((a) => (a.length ? Math.max(...a) : 0));
    return { mode, chars, seed, arena: G.gameMode === 'battle' ? G.arena : null, round: G.round, secs: Math.round(play / 60), floating: st(all), perPlayer: st([].concat(...per)), perMax,
      blowsPerPlayerSec: Math.round(blows / Math.max(1, n) / Math.max(1, play / 60) * 100) / 100, selfPops, capPops, used, ended,
      kills: G.players.reduce((a, p) => a + p.kills, 0), combos: Array.from(chains).filter((c) => c.kills >= 2).length,
      floatSecs: Math.round(floatF / Math.max(1, ended) / 6) / 10, reachPct: Math.round(reached / Math.max(1, ended) * 100), usedPct: Math.round(used / Math.max(1, ended) * 100) };
  }

  // =================================================================== experiments
  let unstub = null;
  function stub() {
    const cv = document.getElementById('pg-canvas');
    const cx = cv && cv.getContext('2d');
    const keep = {};
    if (cx) for (const k of ['drawImage', 'fillRect', 'strokeRect', 'fillText', 'beginPath', 'arc', 'fill', 'stroke', 'moveTo', 'lineTo', 'ellipse', 'save', 'restore', 'translate', 'scale', 'setTransform', 'clearRect', 'rect', 'clip', 'closePath', 'putImageData']) { keep[k] = cx[k]; cx[k] = function () {}; }
    unstub = () => { if (cx) for (const k in keep) cx[k] = keep[k]; };
    const A = PG.Audio || {};
    if (typeof A.sfx === 'function') A.sfx = function (n) { if (n === 'trap_player' && HOOK.trap) HOOK.trap(); };
    if (typeof A.music === 'function') A.music = function () {};
  }
  const range = (s, d) => { if (!s) return d; const out = []; for (const part of s.split(',')) { const m = part.split('-').map(Number); if (m.length === 2) for (let i = m[0]; i <= m[1]; i++) out.push(i); else out.push(m[0]); } return out; };
  // yield without timers (a page Chrome treats as hidden throttles setTimeout chains hard; message ports are not)
  const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  async function main() {
    const D = PG.debug, G = D.G;
    stub();
    if (D.ammo) {
      if (Q.get('ammo') === '0') D.ammo.off(true);
      for (const part of (Q.get('mag') || '').split(',').filter(Boolean)) { const [c, n, rl] = part.split(':'); D.ammo.set(c, +n, +rl); }
      log('BAL MAGS ' + JSON.stringify(Object.fromEntries(CHARS.map((c) => [c, D.ammo.kit(c)]))) + (Q.get('ammo') === '0' ? ' (off)' : ''));
    }
    const exp = Q.get('exp') || 'duel';
    const perks = Q.get('perks') !== '0', time = +(Q.get('time') || 3), intrusion = Q.get('intr') !== '0';
    const cfg = { react: +(Q.get('react') || 10), mash: +(Q.get('mash') === null ? 8 : Q.get('mash')), jit: +(Q.get('jit') || 0), ownlock: +(Q.get('ownlock') || 0),
      whatif: { pgrace: +(Q.get('pgrace') || 0), koinv: +(Q.get('koinv') || 0), erespawn: +(Q.get('erespawn') || 0), swap: Q.get('swap') === '1', ownlock: +(Q.get('ownlock') || 0) } };
    const arenas = range(Q.get('arenas'), [0, 1, 2, 3]), seeds = range(Q.get('seeds'), [1, 2, 3]);
    const t0 = performance.now();
    if (exp === 'duel') {
      let pairs = [];
      const pq = Q.get('pairs') || 'all';
      if (pq === 'all') { for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) pairs.push([CHARS[a], CHARS[b]]); }
      else if (pq === 'mirror') pairs = CHARS.map((c) => [c, c]);
      else pairs = pq.split(',').map((x) => x.split('-'));
      for (const [a, b] of pairs) for (const ar of arenas) for (const s of seeds) for (const order of (a === b ? [0] : [0, 1])) {
        const chars = order ? [b, a] : [a, b];
        const r = runBattle(D, G, chars, { arena: ar, time, perks, intrusion }, 1000 + s * 97 + ar * 13 + order, cfg);
        log('BAL MATCH ' + JSON.stringify(r));
        await tick();
      }
    } else if (exp === 'ffa') {
      const n = +(Q.get('n') || 4);
      for (const ar of arenas) for (const s of seeds) {
        const r0 = mulberry(s * 1337 + ar);
        let chars;
        if (Q.get('chars') && Q.get('chars') !== 'random') chars = Q.get('chars').split(',').slice(0, n);
        else { const pool = CHARS.slice(); chars = []; for (let i = 0; i < n; i++) chars.push(pool.splice(Math.floor(r0() * pool.length), 1)[0]); }
        const r = runBattle(D, G, chars, { arena: ar, time, perks, intrusion }, 5000 + s * 101 + ar * 7, cfg);
        log('BAL MATCH ' + JSON.stringify(r));
        await tick();
      }
    } else if (exp === 'clutter') {
      // mode=coop|battle n=4 chars=a,b,c,d secs=120 spam=0 (extra taps: 1 in spam frames) shot=<s> (one run: draw it)
      const mode = Q.get('mode') || 'coop', n = +(Q.get('n') || 4), secs = +(Q.get('secs') || 120), shotAt = +(Q.get('shot') || 0);
      const chars = (Q.get('chars') || 'duck,capy,otter,frog').split(',').slice(0, n);
      const ccfg = Object.assign({}, cfg, { spam: +(Q.get('spam') || 0) });
      const runs = mode === 'battle' ? arenas.flatMap((ar) => seeds.map((s) => [ar, s])) : range(Q.get('rounds'), [0]).flatMap((r) => seeds.map((s) => [r, s]));
      const sum = [];
      for (const [k, s] of runs) {
        const opts = mode === 'battle' ? { arena: k, time, perks, intrusion } : { round: k };
        const r = runClutter(D, G, mode, chars, opts, 7000 + s * 113 + k * 17, ccfg, secs, shotAt);
        log('BAL CLUTTER ' + JSON.stringify(r));
        sum.push(r);
        if (shotAt > 0) {
          unstub(); D.step(0);
          const st = D.getState();
          log('BAL SHOT READY ' + JSON.stringify({ mode: st.mode, phase: st.phase, floating: G.bubbles.filter((b) => b.kind === 'empty' && b.state === 'float' && !b.dead).length, bubbles: G.bubbles.length }));
          return;
        }
        await tick();
      }
      const m = (key) => Math.round(sum.reduce((a, r) => a + r.floating[key], 0) / Math.max(1, sum.length) * 10) / 10;
      log('BAL CLUTTER SUMMARY ' + JSON.stringify({ mode, n, spam: ccfg.spam, runs: sum.length, floatingMean: m('mean'), floatingP90: m('p90'), floatingMax: Math.max(...sum.map((r) => r.floating.max)),
        perPlayerP90: Math.round(sum.reduce((a, r) => a + r.perPlayer.p90, 0) / Math.max(1, sum.length) * 10) / 10, perPlayerMax: Math.max(...sum.map((r) => r.perPlayer.max)),
        blowsPerPlayerSec: Math.round(sum.reduce((a, r) => a + r.blowsPerPlayerSec, 0) / Math.max(1, sum.length) * 100) / 100,
        floatSecs: Math.round(sum.reduce((a, r) => a + r.floatSecs * r.ended, 0) / Math.max(1, sum.reduce((a, r) => a + r.ended, 0)) * 10) / 10,
        reachPct: Math.round(sum.reduce((a, r) => a + r.reachPct * r.ended, 0) / Math.max(1, sum.reduce((a, r) => a + r.ended, 0))),
        usedPct: Math.round(sum.reduce((a, r) => a + r.usedPct * r.ended, 0) / Math.max(1, sum.reduce((a, r) => a + r.ended, 0))),
        selfPops: sum.reduce((a, r) => a + r.selfPops, 0), capPops: sum.reduce((a, r) => a + r.capPops, 0), ended: sum.reduce((a, r) => a + r.ended, 0),
        kills: sum.reduce((a, r) => a + r.kills, 0), combos: sum.reduce((a, r) => a + r.combos, 0), rounds: sum.reduce((a, r) => a + r.round, 0) }));
    } else if (exp === 'coop') {
      const n = +(Q.get('n') || 2), to = +(Q.get('to') || 12), maxF = +(Q.get('max') || 90000);
      const base = (Q.get('chars') || 'duck,capy,otter,penguin').split(',');
      for (const s of seeds) {
        const chars = base.slice(0, n);
        const r = runCoop(D, G, chars, 9000 + s * 71, cfg, to, maxF);
        log('BAL COOP ' + JSON.stringify(r));
        await tick();
      }
    }
    log('BAL TIME ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s');
    log('BAL DONE');
  }
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G || !PG.debug.local) return setTimeout(go, 30);
    main().catch((e) => { console.log('BAL ERROR ' + e.message + ' ' + String(e.stack || '').split('\n').slice(0, 3).join(' | ')); console.log('BAL DONE'); });
  }
  go();
})();
