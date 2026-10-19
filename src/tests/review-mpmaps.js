// Reviewer driver (v3 level/arena design for multiplayer). Scenes by location.hash:
//   #coop0..#coop3  contact sheet of 6 campaign entries each, 4 co-op players on their spawns (2x)
//   #arenas         contact sheet of the 4 battle arenas with spawns / enemySpawns / gather / respawn-guard boxes
//   #tagsN          full page: battle arena N (or #tagsc = co-op round 1) with 4 nicks, for name-tag readability
//   #sim            battle exposure sim: 4 idle players on their spawns, stuns per slot, enemy landings near players,
//                   KO respawn safety (real trap -> pop -> respawnBattle path)
//   #coopsim        co-op exposure sim: 4 idle players, time to each slot's first hit per round (vs solo P1)
// Lines start with MPMAPS; the run ends with "MPMAPS DONE".
(function () {
  const TS = 8, PF_TOP = 16;
  const log = (s) => console.log('MPMAPS ' + s);
  const CH4 = ['duck', 'capy', 'otter', 'penguin'];
  const NICKS = ['뽀숑', '손님42', '말랑두부왕자', 'Player4'];
  const SLOT = ['#ffd447', '#f6a6bd', '#7fdcc8', '#8dc9ff'];
  function waitFor() {
    if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(waitFor, 30);
    setTimeout(run, 1200);
  }
  const later = (fn) => new Promise((r) => setTimeout(() => { fn(); r(); }, 0));

  function release(D) { for (const k of ['left', 'right', 'jump', 'shoot']) for (let s = 0; s < 4; s++) D.press(k, false, s); }
  function gameCanvas() { return document.getElementById('pg-canvas'); }
  function sheetCanvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 99999, background: '#111', imageRendering: 'pixelated' });
    document.body.appendChild(c);
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = '#111'; x.fillRect(0, 0, w, h);
    return { c, x };
  }
  function label(x, txt, lx, ly, col) {
    x.font = 'bold 13px sans-serif'; x.textBaseline = 'top';
    const w = x.measureText(txt).width;
    x.fillStyle = 'rgba(0,0,0,0.75)'; x.fillRect(lx - 2, ly - 1, w + 4, 16);
    x.fillStyle = col || '#fff'; x.fillText(txt, lx, ly);
  }

  function coopSheet(part) {
    const D = PG.debug, G = D.G, S = 2, cw = 256 * S, ch = 224 * S + 4;
    const { x } = sheetCanvas(cw * 3 + 8, ch * 2 + 4);
    for (let n = 0; n < 6; n++) {
      const i = part * 6 + n; if (i >= PG.LEVELS.length) break;
      const L = PG.LEVELS[i];
      D.seed(900 + i);
      D.local.coop(CH4.map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), i);
      D.setInvincible(true); release(D);
      D.step(110);
      const ox = (n % 3) * (cw + 4), oy = ((n / 3) | 0) * (ch + 4);
      x.drawImage(gameCanvas(), 0, 0, 256, 224, ox, oy, cw, 224 * S);
      // spawn cells (outline of the 16x16 body at the spawn) + slot number
      L.players.forEach((s, k) => {
        const bx = (s.col * TS - 4) * S, by = ((s.row + 1) * TS) * S;
        x.strokeStyle = SLOT[k]; x.lineWidth = 2; x.strokeRect(ox + bx, oy + by, 16 * S, 16 * S);
        label(x, 'P' + (k + 1), ox + bx + 4, oy + by - 34, SLOT[k]);
      });
      // enemy start cells
      (L.enemies || []).forEach((e) => {
        x.strokeStyle = '#ff4040'; x.lineWidth = 2;
        x.strokeRect(ox + (e.col * TS - 4) * S, oy + ((e.type === 'fly' ? PF_TOP + e.row * TS - 4 : (e.row + 1) * TS)) * S, 16 * S, 16 * S);
      });
      label(x, '#' + (i + 1) + ' ' + L.name + (L.boss ? ' [' + L.boss + ']' : ''), ox + 4, oy + 4, '#fff');
      const st = D.getState();
      log(`coop sheet #${i + 1} ${L.name} players ${st.players.map((p) => `${p.slot}:${p.x.toFixed(0)},${p.y.toFixed(0)}${p.dead ? 'D' : ''}`).join(' ')}`);
    }
  }

  function arenaSheet() {
    const D = PG.debug, G = D.G, S = 2, cw = 256 * S, ch = 224 * S;
    const { x } = sheetCanvas(cw * 2 + 4, ch * 2 + 4);
    D.arenas().forEach((A, i) => {
      D.seed(1700 + i);
      D.local.battle(CH4.map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), { arena: i, intrusion: false });
      D.setInvincible(true); release(D);
      D.step(110);
      const ox = (i % 2) * (cw + 4), oy = ((i / 2) | 0) * (ch + 4);
      x.drawImage(gameCanvas(), 0, 0, 256, 224, ox, oy, cw, ch);
      // the respawn guard of spawnArenaEnemy: |player.x - col*8| < 40 && |player.y - row*8| < 32
      A.enemySpawns.forEach((s) => {
        x.strokeStyle = 'rgba(255,64,64,0.9)'; x.lineWidth = 2;
        x.strokeRect(ox + (s.col * TS - 4) * S, oy + ((s.row + 1) * TS) * S, 16 * S, 16 * S);
        x.strokeStyle = 'rgba(255,140,64,0.45)'; x.lineWidth = 1; x.setLineDash([4, 4]);
        x.strokeRect(ox + (s.col * TS - 40) * S, oy + (s.row * TS - 32) * S, 80 * S, 64 * S);
        x.setLineDash([]);
      });
      A.players.forEach((s, k) => {
        const bx = (s.col * TS - 4) * S, by = ((s.row + 1) * TS) * S;
        x.strokeStyle = SLOT[k]; x.lineWidth = 2; x.strokeRect(ox + bx, oy + by, 16 * S, 16 * S);
        label(x, 'P' + (k + 1), ox + bx + 2, oy + by - 34, SLOT[k]);
      });
      const g = A.gather;
      x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath();
      const gx = ox + (g.col * TS + 4 + 4) * S, gy = oy + (PF_TOP + g.row * TS + 4 + 4) * S;
      x.moveTo(gx - 8, gy); x.lineTo(gx + 8, gy); x.moveTo(gx, gy - 8); x.lineTo(gx, gy + 8); x.stroke();
      label(x, 'A' + (i + 1) + ' ' + A.name, ox + 4, oy + 4, '#fff');
    });
  }

  function tagScene(which) {
    const D = PG.debug;
    const list = CH4.map((c, k) => ({ char: c, nick: NICKS[k] }));
    if (which === 'c') { D.seed(5); D.local.coop(list, 0); }
    else if (which === 'c13') { D.seed(5); D.local.coop(list, 14); }
    else { D.seed(5); D.local.battle(list, { arena: +which, intrusion: false }); }
    D.setInvincible(true); release(D); D.step(110);
    log('tags scene ' + which);
  }

  // ---------------------------------------------------------------- battle exposure sim
  async function battleSim() {
    const D = PG.debug, G = D.G;
    const FR = 60 * 180; // 3:00
    const out = [];
    for (let a = 0; a < PG.ARENAS.length; a++) {
      const A = PG.ARENAS[a];
      for (const intr of [false, true]) {
        const stuns = [0, 0, 0, 0], firstStun = [null, null, null, null], landings = [], koRes = [];
        let bossStuns = [0, 0, 0, 0];
        for (let seed = 0; seed < 4; seed++) {
          await later(() => {
            D.seed(5000 + a * 100 + seed + (intr ? 50 : 0));
            D.local.battle(CH4.map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), { arena: a, intrusion: intr, time: 3 });
            D.setInvincible(false); release(D);
          });
          const prevSt = [0, 0, 0, 0], prevState = new Map();
          for (let f = 0; f < FR; f += 600) {
            await later(() => {
              for (let s = 0; s < 600 && f + s < FR; s++) {
                D.step(1);
                for (const p of G.players) {
                  if (p.stunT > 0 && !prevSt[p.slot]) {
                    stuns[p.slot]++;
                    if (firstStun[p.slot] === null || (seed === 0 && false)) firstStun[p.slot] = firstStun[p.slot] === null ? (f + s) / 60 : firstStun[p.slot];
                    if (G.boss && Math.hypot(G.boss.x + 16 - p.x - 8, G.boss.y + 16 - p.y - 8) < 40) bossStuns[p.slot]++;
                  }
                  prevSt[p.slot] = p.stunT > 0 ? 1 : 0;
                }
                for (const e of G.enemies) {
                  const was = prevState.get(e.id);
                  if (was === 'descend' && e.state === 'active' && f + s > 200) {
                    let d = 1e9, who = -1;
                    for (const p of G.players) { const dd = Math.hypot(p.x - e.x, p.y - e.y); if (dd < d) { d = dd; who = p.slot; } }
                    landings.push({ d, who, sameRow: G.players.some((p) => Math.abs(p.y - e.y) < 4 && Math.abs(p.x - e.x) < 64) });
                  }
                  prevState.set(e.id, e.state);
                }
              }
            });
          }
        }
        const lt = landings.filter((l) => l.d < 48).length, lrow = landings.filter((l) => l.sameRow).length;
        out.push(`A${a + 1} ${A.name} intrusion=${intr ? 'on' : 'off'} · idle stuns/3min (4 seeds) P1..P4 = ${stuns.join(' / ')}` +
          (intr ? ` (near boss ${bossStuns.join('/')})` : '') +
          ` · enemy re-landings ${landings.length}: <48px of a player ${lt}, same row within 64px ${lrow}, min ${landings.length ? Math.min(...landings.map((l) => l.d)).toFixed(0) : '-'}px`);
        log(out[out.length - 1]);
      }
    }
    // KO respawn: P1 trapped by P2 and popped by P3 at a series of moments; where does P1 come back and is an enemy on it?
    for (let a = 0; a < PG.ARENAS.length; a++) {
      const A = PG.ARENAS[a];
      const res = []; let hitSoon = 0, near = 0, tries = 0;
      const spawnCount = [0, 0, 0, 0];
      await later(() => {
        D.seed(7000 + a);
        D.local.battle(CH4.map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), { arena: a, intrusion: false, time: 5 });
        D.setInvincible(false); release(D);
        D.step(240);
      });
      for (let t = 0; t < 30; t++) {
        await later(() => {
          // wander the others a bit so "farthest from everyone" varies: put P2..P4 at random standing spots (their spawns)
          D.step(200);
          const v = G.players[0];
          if (!v || v.trap || v.koT || v.stunT) return;
          v.invuln = 0;
          if (!D.trapPlayer(0, 1)) return;
          tries++;
          const b = v.trap.b, popper = G.players[2];
          popper.invuln = 0; popper.stunT = 0;
          const px = popper.x, py = popper.y;
          popper.x = b.x; popper.y = b.y; popper.vx = 0; popper.vy = 0;
          D.step(1);
          popper.x = px; popper.y = py; // back where it was (keeps the others spread on their spawns)
          if (!v.koT) return;
          for (let k = 0; k < 95 && v.koT; k++) D.step(1);
          const si = A.players.findIndex((s) => Math.abs(s.col * TS - 4 - v.x) < 2 && Math.abs((s.row + 1) * TS - v.y) < 2);
          if (si >= 0) spawnCount[si]++;
          let dmin = 1e9;
          for (const e of G.enemies) if (e.state === 'active' || e.state === 'descend') dmin = Math.min(dmin, Math.hypot(e.x - v.x, e.y - v.y));
          if (dmin < 48) near++;
          let stunned = false;
          for (let k = 0; k < 240; k++) { D.step(1); if (v.stunT > 0) { stunned = true; break; } }
          if (stunned) hitSoon++;
          res.push(si);
        });
      }
      log(`A${a + 1} ${A.name} KO respawn: ${tries} KOs · came back at spawn P1..P4 = ${spawnCount.join('/')} · enemy within 48px on arrival ${near} · idle respawner stunned within 4 s ${hitSoon}`);
    }
  }

  // ---------------------------------------------------------------- co-op exposure sim
  async function coopSim() {
    const D = PG.debug, G = D.G;
    const LIM = 60 * 20;
    for (let i = 0; i < PG.LEVELS.length; i++) {
      const L = PG.LEVELS[i];
      const first = [[], [], [], []], solo = [];
      for (let seed = 0; seed < 4; seed++) {
        await later(() => {
          D.seed(8000 + i * 10 + seed);
          D.local.coop(CH4.map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), i);
          D.setInvincible(false); release(D);
          const got = [null, null, null, null];
          for (let f = 0; f < LIM; f++) {
            D.step(1);
            for (const p of G.players) if (got[p.slot] === null && (p.dead || p.ghost)) got[p.slot] = f / 60;
            if (got.every((g) => g !== null)) break;
          }
          got.forEach((g, k) => first[k].push(g === null ? 99 : g));
          D.seed(8000 + i * 10 + seed);
          D.start(i, 'duck'); D.setInvincible(false); release(D);
          let s0 = null;
          for (let f = 0; f < LIM && s0 === null; f++) { D.step(1); if (G.p.dead) s0 = f / 60; }
          solo.push(s0 === null ? 99 : s0);
        });
      }
      const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[(b.length / 2) | 0]; };
      const fmt = (a) => { const m = Math.min(...a); return (m >= 99 ? '>20' : m.toFixed(1)) + 's'; };
      log(`coop #${i + 1} ${L.name}: earliest idle hit (min of 4 seeds) P1 ${fmt(first[0])} P2 ${fmt(first[1])} P3 ${fmt(first[2])} P4 ${fmt(first[3])} · solo P1 ${fmt(solo)} · median P1..P4 ${first.map((a) => (med(a) >= 99 ? '>20' : med(a).toFixed(1))).join('/')}`);
    }
  }

  // which enemy reaches which idle co-op spawn first (round index from the hash)
  function coopTrace(i) {
    const D = PG.debug, G = D.G, L = PG.LEVELS[i];
    for (let seed = 0; seed < 4; seed++) {
      D.seed(8000 + i * 10 + seed);
      D.local.coop(CH4.map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), i);
      D.setInvincible(false); release(D);
      const start = new Map(G.enemies.map((e) => [e.id, `${e.type}@(${Math.round((e.x + 4) / TS)},${Math.round(e.spawnY / TS) - 1})`]));
      const got = [null, null, null, null];
      for (let f = 0; f < 1200; f++) {
        D.step(1);
        for (const p of G.players) {
          if (got[p.slot] !== null || !(p.dead || p.ghost)) continue;
          let best = null, bd = 1e9;
          for (const e of G.enemies) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } }
          got[p.slot] = `${(f / 60).toFixed(1)}s by ${best ? start.get(best.id) || best.type : '?'} (${bd.toFixed(0)}px)`;
        }
      }
      log(`trace #${i + 1} ${L.name} seed ${seed}: ` + got.map((g, k) => `P${k + 1} ${g || '>20s'}`).join(' · '));
    }
  }
  // battle: does a drop through the floor drain land on the gather cluster? (bubbles parked at the gather, then a
  // player walks into the drain from the floor)
  function drainTest() {
    const D = PG.debug, G = D.G;
    PG.ARENAS.forEach((A, a) => {
      D.seed(40 + a);
      D.local.battle(CH4.slice(0, 2).map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), { arena: a, intrusion: false });
      D.setInvincible(true); release(D);
      G.enemies.length = 0;
      D.step(30);
      // 5 empty bubbles owned by P2, settled at the gather point
      for (let k = 0; k < 5; k++) { const b = D.spawnBubble('empty', G.gather.x - 8 + (k - 2) * 6, G.gather.y - 8); b.owner = 1; }
      D.step(240);
      const before = G.bubbles.filter((b) => !b.dead && b.state === 'float').length;
      const gx = G.gather.x, gy = G.gather.y;
      const near = G.bubbles.filter((b) => Math.hypot(b.x + 8 - gx, b.y + 8 - gy) < 24).length;
      // P1 on the floor just left of the drain, walking right into it
      const gapX = A.map[25].indexOf('...') * TS;
      D.setPlayer(gapX - 20, (24 + 1) * TS, 0);
      const p = G.players[0];
      p.x = gapX - 20; p.y = 25 * TS; p.vx = 0; p.vy = 0; p.onGround = false;
      D.press('right', true, 0); D.step(18); D.press('right', false, 0);
      let wrapped = false, minD = 1e9, f = 0;
      for (; f < 120; f++) { const y0 = p.y; D.step(1); if (p.y < y0 - 100) wrapped = true; if (wrapped) minD = Math.min(minD, Math.hypot(p.x + 8 - gx, p.y + 8 - gy)); }
      const after = G.bubbles.filter((b) => !b.dead && b.state === 'float').length;
      log(`drain A${a + 1} ${A.name}: gather (${A.gather.col},${A.gather.row}) · ${near}/${before} bubbles clustered there · walked into the drain: wrapped ${wrapped}, passed ${minD.toFixed(0)}px from the gather, bubbles left ${after}/${before} · P1 score ${p.score}`);
      // the same with a trapped rival at the gather
      D.local.battle(CH4.slice(0, 2).map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), { arena: a, intrusion: false });
      D.setInvincible(true); release(D); G.enemies.length = 0; D.step(30);
      const v = G.players[1]; v.invuln = 0; v.x = G.gather.x - 8; v.y = G.gather.y - 8;
      D.trapPlayer(1, 0);
      const pb = G.players[0]; pb.x = gapX - 20; pb.y = 25 * TS; pb.vx = 0; pb.vy = 0;
      D.press('right', true, 0); D.step(18); D.press('right', false, 0);
      let ko = false; for (let k = 0; k < 120 && !ko; k++) { D.step(1); if (v.koT > 0) ko = true; }
      log(`drain A${a + 1}: rival trapped at the gather, P1 walks into the floor drain -> KO ${ko} after ${(18 + 0) / 60 + 0}s walk (+fall), P1 kos ${pb.kos}`);
    });
  }
  // where do the battle power-ups land? spawnPickup(type, random x in [WALL_L+24, WALL_R-24], CEIL_Y+16) like updateBattle
  function pickupTest() {
    const D = PG.debug, G = D.G;
    PG.ARENAS.forEach((A, a) => {
      D.seed(60 + a);
      D.local.battle(CH4.map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), { arena: a, intrusion: false });
      D.setInvincible(true); release(D); G.enemies.length = 0;
      for (const p of G.players) { p.x = -100; p.y = -100; } // (keep them off the pickups)
      const near = [0, 0, 0, 0]; let water = 0; const rows = {};
      const N = 112;
      for (let k = 0; k < N; k++) {
        const x = 40 + (176 * (k + 0.5)) / N;
        G.pickup = null; D.spawnPickup('slippers', x, 24 + 16);
        for (let f = 0; f < 420 && G.pickup && !G.pickup.onGround; f++) { D.step(1); for (const p of G.players) { p.x = -100; p.y = -100; } }
        const pk = G.pickup; if (!pk) continue;
        if (pk.floating) water++;
        const row = Math.round((pk.y + 16 - 16) / TS);
        rows[row] = (rows[row] || 0) + 1;
        let bi = -1, bd = 1e9;
        A.players.forEach((s, i) => { const d = Math.hypot(s.col * TS - 4 - pk.x, (s.row + 1) * TS - pk.y); if (d < bd) { bd = d; bi = i; } });
        if (bd < 48) near[bi]++;
      }
      log(`pickups A${a + 1} ${A.name}: ${N} evenly spread drops -> within 48px of spawn P1..P4 ${near.join('/')} · floating in water ${water} · landing rows ${Object.keys(rows).sort((p, q) => p - q).map((r) => r + ':' + rows[r]).join(' ')}`);
    });
  }

  // battle hazard map with a living arena: the 4 players (invincible) hop between random standing cells every 3 s,
  // one enemy is removed every 6 s (so the respawn system cycles); every 10 frames, for each spawn, is an active
  // enemy within 40 px of a body standing on it? Also: newly landed enemies vs the nearest player.
  async function battleSim2() {
    const D = PG.debug, G = D.G;
    const FR = 60 * 180;
    for (let a = 0; a < PG.ARENAS.length; a++) {
      const A = PG.ARENAS[a], M = A.map;
      const cells = [];
      for (let r = 2; r <= 24; r++) for (let c = 2; c <= 29; c++) if (M[r][c] === '.' && M[r - 1][c] === '.' && M[r + 1][c] === '#') cells.push({ col: c, row: r });
      const haz = [0, 0, 0, 0], hazBoss = [0, 0, 0, 0]; let samples = 0;
      const land = { n: 0, close: 0, min: 1e9 };
      for (const intr of [false, true]) {
        for (let seed = 0; seed < 3; seed++) {
          let rr = 12345 + seed * 77 + a * 1000 + (intr ? 5 : 0);
          const rnd = () => { rr = (rr * 1103515245 + 12345) & 0x7fffffff; return rr / 0x7fffffff; };
          await later(() => {
            D.seed(9100 + a * 10 + seed + (intr ? 50 : 0));
            D.local.battle(CH4.map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), { arena: a, intrusion: intr, time: 3 });
            D.setInvincible(true); release(D);
          });
          const prev = new Map();
          for (let f = 0; f < FR; f += 900) {
            await later(() => {
              for (let s = 0; s < 900 && f + s < FR; s++) {
                const t = f + s;
                if (t % 180 === 0) for (const p of G.players) { const c = cells[(rnd() * cells.length) | 0]; p.x = c.col * TS - 4; p.y = (c.row + 1) * TS; p.vx = 0; p.vy = 0; }
                if (t % 360 === 359) { const live = G.enemies.filter((e) => e.state === 'active'); if (live.length) { const e = live[(rnd() * live.length) | 0]; G.enemies.splice(G.enemies.indexOf(e), 1); } }
                D.step(1);
                for (const e of G.enemies) {
                  if (prev.get(e.id) === 'descend' && e.state === 'active' && t > 200) {
                    let d = 1e9; for (const p of G.players) d = Math.min(d, Math.hypot(p.x - e.x, p.y - e.y));
                    land.n++; if (d < 40) land.close++; land.min = Math.min(land.min, d);
                  }
                  prev.set(e.id, e.state);
                }
                if (t % 10 === 0 && t > 120) {
                  if (!intr) samples++;
                  A.players.forEach((sp, k) => {
                    const x = sp.col * TS - 4, y = (sp.row + 1) * TS;
                    const hit = G.enemies.some((e) => e.state === 'active' && Math.abs(e.x - x) < 40 && Math.abs(e.y - y) < 24);
                    const b = G.boss;
                    const bh = b && b.state !== 'defeat' && b.state !== 'intro' && Math.abs(b.x + 16 - x - 8) < 48 && Math.abs(b.y + 16 - y - 8) < 40;
                    if (!intr && hit) haz[k]++;
                    if (intr && t > FR - 90 * 60 && bh) hazBoss[k]++;
                  });
                }
              }
            });
          }
        }
      }
      log(`A${a + 1} ${A.name} living-arena hazard (enemy within 40px of the spawn), share of samples P1..P4 = ${haz.map((h) => (100 * h / samples).toFixed(1) + '%').join(' / ')} · intruder boss near the spawn (samples, last 1:30, 3 seeds) P1..P4 = ${hazBoss.join(' / ')} · enemy re-landings ${land.n}, within 40px of a player ${land.close}, closest ${land.min.toFixed(0)}px`);
    }
  }

  // battle start: when is each idle player first stunned, and by an enemy from which enemySpawn?
  function battleFirst() {
    const D = PG.debug, G = D.G;
    PG.ARENAS.forEach((A, a) => {
      const firsts = [[], [], [], []], who = [{}, {}, {}, {}];
      for (let seed = 0; seed < 8; seed++) {
        D.seed(9900 + a * 20 + seed);
        D.local.battle(CH4.map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), { arena: a, intrusion: false, time: 3 });
        D.setInvincible(false); release(D);
        const origin = new Map(G.enemies.map((e, k) => [e.id, `${e.type}@(${A.enemySpawns[k].col},${A.enemySpawns[k].row})`]));
        const got = [null, null, null, null];
        for (let f = 0; f < 60 * 30 && got.some((g) => g === null); f++) {
          D.step(1);
          for (const p of G.players) {
            if (got[p.slot] !== null || !(p.stunT > 0)) continue;
            got[p.slot] = f / 60;
            let best = null, bd = 1e9;
            for (const e of G.enemies) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } }
            const o = best ? origin.get(best.id) || best.type : '?';
            who[p.slot][o] = (who[p.slot][o] || 0) + 1;
          }
        }
        got.forEach((g, k) => firsts[k].push(g === null ? 30 : g));
      }
      const med = (v) => { const b = v.slice().sort((x, y) => x - y); return (b[3] + b[4]) / 2; };
      log(`first A${a + 1} ${A.name}: idle first stun, min / median of 8 seeds: ` + firsts.map((v, k) => `P${k + 1} ${Math.min(...v).toFixed(1)}/${med(v).toFixed(1)}s [${Object.entries(who[k]).map(([o, n]) => o + 'x' + n).join(' ')}]`).join(' · '));
    });
  }

  // candidate fixes, applied to the engine's normalized arena objects (no source change): name -> arena patches
  const VARIANTS = {
    // the current data (baseline)
    base: {},
    // enemies start high: every enemySpawn on the upper half, floor spawns unchanged
    high: {
      0: { enemySpawns: [[10, 9], [21, 9], [12, 9], [19, 9], [13, 13], [18, 13]] },
      1: { enemySpawns: [[12, 8], [19, 8], [12, 16], [19, 16], [14, 16], [17, 16]] },
      2: { enemySpawns: [[12, 8], [19, 8], [14, 8], [17, 8], [9, 12], [22, 12]] },
      3: {},
    },
    lift: {
      0: { players: [[3, 20], [28, 20], [3, 5], [28, 5]], enemySpawns: [[10, 9], [21, 9], [12, 9], [19, 9], [13, 13], [18, 13]] },
      1: { players: [[4, 20], [27, 20], [5, 4], [26, 4]], enemySpawns: [[12, 8], [19, 8], [12, 16], [19, 16], [14, 16], [17, 16]] },
      2: { players: [[5, 20], [26, 20], [3, 4], [28, 4]], enemySpawns: [[12, 8], [19, 8], [14, 8], [17, 8], [9, 12], [22, 12]] },
      3: {},
    },
    mid: {
      0: { players: [[3, 24], [28, 24], [3, 13], [28, 13]], enemySpawns: [[11, 9], [20, 9], [13, 13], [18, 13], [6, 5], [25, 5]] },
      2: { players: [[3, 24], [28, 24], [3, 12], [28, 12]], enemySpawns: [[13, 8], [18, 8], [12, 16], [19, 16], [3, 4], [28, 4]] },
    },
    gfix: {
      0: { gather: [15, 16] },
      1: { gather: [15, 19] },
      2: { gather: [15, 12] },
      3: { rows: { 7: '##.........##########.........##' } },
    },
    // the validated proposal (C:/Temp/bogeul/rv-levels-proposed-patch.js): a lid over the drain column, gather under it
    lid: {
      0: { rows: { 10: '##........############........##' }, gather: [15, 12] },
      1: { rows: { 9: '##.........##########.........##' }, gather: [15, 11] },
      2: { gather: [15, 12] },
      3: { rows: { 7: '##.........##########.........##' } },
    },
    // candidate (C:/Temp/bogeul/rv-p-top.js): an enemy-spawn pair in the top band beside the top spawns (the 때밀이 링 pattern)
    top: {
      0: { rows: { 6: '############........############' }, enemySpawns: [[11, 9], [20, 9], [13, 13], [18, 13], [10, 5], [21, 5]] },
      1: { rows: { 5: '############........############' }, players: [[3, 24], [28, 24], [3, 4], [28, 4]], enemySpawns: [[12, 8], [19, 8], [12, 16], [19, 16], [10, 4], [21, 4]] },
      2: { rows: { 5: '#####....###........###....#####' }, enemySpawns: [[13, 8], [18, 8], [12, 16], [19, 16], [10, 4], [21, 4]] },
    },
  };
  function applyVariant(name) {
    const D = PG.debug, AR = D.arenas(), V = VARIANTS[name] || {};
    const orig = applyVariant.orig || (applyVariant.orig = AR.map((A) => ({ map: A.map.slice(), players: A.players.map((s) => Object.assign({}, s)), enemySpawns: A.enemySpawns.map((s) => Object.assign({}, s)), gather: Object.assign({}, A.gather) })));
    AR.forEach((A, i) => {
      const o = orig[i], p = V[i] || {};
      A.map = o.map.slice();
      if (p.rows) for (const r in p.rows) A.map[+r] = p.rows[r];
      A.players = (p.players ? p.players.map(([col, row]) => ({ col, row })) : o.players.map((s) => Object.assign({}, s)));
      A.player = A.players[0];
      A.enemySpawns = p.enemySpawns ? p.enemySpawns.map(([col, row]) => ({ col, row })) : o.enemySpawns.map((s) => Object.assign({}, s));
      A.gather = p.gather ? { col: p.gather[0], row: p.gather[1] } : Object.assign({}, o.gather);
      // sanity: every spawn stands on a block, every enemy spawn too
      const bad = [];
      A.players.concat(A.enemySpawns).forEach((s) => { if (A.map[s.row + 1][s.col] !== '#' || A.map[s.row][s.col] !== '.' || A.map[s.row - 1][s.col] !== '.') bad.push(`(${s.col},${s.row})`); });
      if (bad.length) log(`variant ${name} A${i + 1}: NOT STANDING ${bad.join(' ')}`);
    });
  }
  // candidate engine fix 'recycle': a ground enemy that has stood on the bottom floor for 4 s walks to the drain
  function recycle(G, LVgapX) {
    for (const e of G.enemies) {
      if (e.state !== 'active' || e.type === 'fly' || !e.onGround) { e._fl = 0; continue; }
      if (e.y >= 199) { e._fl = (e._fl | 0) + 1; if (e._fl > 240) { e.dir = (LVgapX - (e.x + 8)) >= 0 ? 1 : -1; e.windT = 0; e.chargeT = 0; e.committed = true; } }
      else e._fl = 0;
    }
  }
  async function variantRun(name) {
    const RC = name.endsWith("-rc"); name = name.replace(/-rc$/, "");
    applyVariant(name);
    const D = PG.debug, G = D.G, AR = D.arenas();
    for (let a = 0; a < AR.length; a++) {
      const A = AR[a], M = A.map;
      if (name !== 'base' && !(VARIANTS[name] || {})[a]) continue;
      if (name !== 'base' && !Object.keys(VARIANTS[name][a]).length) continue;
      const cells = [];
      for (let r = 2; r <= 24; r++) for (let c = 2; c <= 29; c++) if (M[r][c] === '.' && M[r - 1][c] === '.' && M[r + 1][c] === '#') cells.push({ col: c, row: r });
      const haz = [0, 0, 0, 0]; let samples = 0;
      for (let seed = 0; seed < 3; seed++) {
        let rr = 777 + seed * 77 + a * 1000;
        const rnd = () => { rr = (rr * 1103515245 + 12345) & 0x7fffffff; return rr / 0x7fffffff; };
        await later(() => {
          D.seed(9300 + a * 10 + seed);
          D.local.battle(CH4.map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), { arena: a, intrusion: false, time: 3 });
          D.setInvincible(true); release(D);
          for (let t = 0; t < 60 * 120; t++) {
            if (t % 180 === 0) for (const p of G.players) { const c = cells[(rnd() * cells.length) | 0]; p.x = c.col * TS - 4; p.y = (c.row + 1) * TS; p.vx = 0; p.vy = 0; }
            if (t % 360 === 359) { const live = G.enemies.filter((e) => e.state === 'active'); if (live.length) { const e = live[(rnd() * live.length) | 0]; G.enemies.splice(G.enemies.indexOf(e), 1); } }
            if (RC) recycle(G, A.gapX);
            D.step(1);
            if (t % 10 === 0 && t > 120) {
              samples++;
              A.players.forEach((sp, k) => {
                const x = sp.col * TS - 4, y = (sp.row + 1) * TS;
                if (G.enemies.some((e) => e.state === 'active' && Math.abs(e.x - x) < 40 && Math.abs(e.y - y) < 24)) haz[k]++;
              });
            }
          }
        });
      }
      const firsts = [[], [], [], []], stuns = [0, 0, 0, 0];
      await later(() => {
        for (let seed = 0; seed < 8; seed++) {
          D.seed(9900 + a * 20 + seed);
          D.local.battle(CH4.map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), { arena: a, intrusion: false, time: 3 });
          D.setInvincible(false); release(D);
          const got = [null, null, null, null], prev = [0, 0, 0, 0];
          for (let f = 0; f < 60 * 60; f++) {
            if (RC) recycle(G, A.gapX);
            D.step(1);
            for (const p of G.players) {
              if (p.stunT > 0 && !prev[p.slot]) { stuns[p.slot]++; if (got[p.slot] === null) got[p.slot] = f / 60; }
              prev[p.slot] = p.stunT > 0 ? 1 : 0;
            }
          }
          got.forEach((g, k) => firsts[k].push(g === null ? 60 : g));
        }
      });
      const med = (v) => { const b = v.slice().sort((x, y) => x - y); return (b[3] + b[4]) / 2; };
      log(`variant ${name}${RC ? "+recycle" : ""} A${a + 1} ${A.name} · spawns ${A.players.map((s) => `(${s.col},${s.row})`).join(' ')} · living hazard P1..P4 ${haz.map((h) => (100 * h / samples).toFixed(1) + '%').join(' / ')} · idle 60 s x 8 seeds: stuns ${stuns.join('/')}, first-stun median ${firsts.map((v) => med(v).toFixed(1)).join('/')}s`);
    }
  }

  // battle: 4 enemies trapped (by P2) and parked at the gather; P1 walks from its own spawn into the floor drain
  function drainCombo() {
    const D = PG.debug, G = D.G;
    D.arenas().forEach((A, a) => {
      D.seed(70 + a);
      D.local.battle(CH4.slice(0, 2).map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), { arena: a, intrusion: false });
      D.setInvincible(true); release(D);
      D.step(100);
      while (G.enemies.length > 4) G.enemies.pop();
      for (const e of G.enemies) { e.x = G.gather.x - 8; e.y = G.gather.y + 10; e.vx = 0; e.vy = 0; }
      D.trapAll();
      for (const b of G.bubbles) b.owner = 1;
      for (const b of G.bubbles) { b.trapMax = 99999; }
      D.step(200);
      const near = G.bubbles.filter((b) => b.kind === 'trapped' && Math.hypot(b.x + 8 - G.gather.x, b.y + 8 - G.gather.y) < 28).length;
      const p = G.players[0];
      const sp = A.players[0]; p.x = sp.col * TS - 4; p.y = (sp.row + 1) * TS; p.vx = 0; p.vy = 0;
      const s0 = p.score, k0 = p.kills;
      let f = 0, popped = -1;
      D.press('right', true, 0);
      for (; f < 400; f++) {
        if (p.y < 60 && p.vy > 0) D.press('right', false, 0);
        D.step(1);
        if (popped < 0 && p.kills > k0) popped = f;
      }
      D.press('right', false, 0);
      log(`dropcombo A${a + 1} ${A.name}: ${near}/4 trapped enemies parked at the gather · P1 walked right from its spawn into the drain: first pop after ${(popped / 60).toFixed(2)} s, kills ${p.kills - k0}, +${p.score - s0} points`);
    });
  }
  async function run() {
    const h = (location.hash || '#arenas').slice(1);
    try {
      if (/^var-/.test(h)) await variantRun(h.slice(4)); else
      if (h === 'first') battleFirst(); else if (/^dropcombo/.test(h)) { if (h.includes('-')) applyVariant(h.split('-')[1]); drainCombo(); } else
      if (h === 'sim2') await battleSim2(); else
      if (/^trace\d+$/.test(h)) coopTrace(+h.slice(5));
      else if (h === 'tracefix') {
        // proposed R18 co-op spawns: P3/P4 on the left wall shelf (row 22 blocks) instead of across the drain
        const L = PG.debug.levels()[20];
        L.players = [{ col: 3, row: 24 }, { col: 5, row: 24 }, { col: 2, row: 21 }, { col: 4, row: 21 }];
        L.player = L.players[0];
        PG.LEVELS[20] = Object.assign({}, PG.LEVELS[20], { players: L.players });
        coopTrace(20);
      }
      else if (h === 'drain') drainTest();
      else if (h === 'pickups') pickupTest();
      else if (/^coop\d$/.test(h)) coopSheet(+h.slice(4));
      else if (/^arenas/.test(h)) { if (h.includes('-')) applyVariant(h.split('-')[1]); arenaSheet(); }
      else if (/^tags/.test(h)) tagScene(h.slice(4));
      else if (h === 'sim') await battleSim();
      else if (h === 'coopsim') await coopSim();
    } catch (e) { log('ERROR ' + (e && e.stack)); }
    setTimeout(() => log('DONE'), 300);
  }
  waitFor();
})();
