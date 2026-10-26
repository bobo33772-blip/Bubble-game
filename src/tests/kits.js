// v4 character kits, one engine (design/char-kits.md §14.1): every row of the test plan that one engine can decide,
// stepped through PG.debug in lab rooms laid over round 1 / arena 1 (restored at the end). Perks on unless stated.
// (Folds in the engine passes' wip-moves.js / wip-bubbles.js. The rows that need a second engine - a guest's stun
// mid-move, the host's bounce gate for a remote slamming capy, qk validation, the shield report, a:1 - are in
// kits-net.js; tools/validate-levels.js runs in node: run-all job 'validate-levels'.)
//   node tools/run-chrome.js test-kits.html - 900 760 120000
// Prints "KITS PASS|FAIL <name>", "KITS INFO ..." and "KITS DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const t = (name, fn) => {
    let r;
    try { r = fn(); } catch (e) { r = 'threw ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e); }
    if (r === undefined || r === true) { pass++; log('KITS PASS ' + name); } else { fail++; log('KITS FAIL ' + name + ' :: ' + r); }
  };
  const info = (s) => log('KITS INFO ' + s);
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
  window.addEventListener('error', (e) => { fail++; log('KITS FAIL page error: ' + e.message + ' @' + e.lineno); });

  function run() {
    const D = PG.debug, G = D.G, LV = D.levels(), AR = D.arenas();
    const TS = 8, PF_TOP = 16, FLOOR = PF_TOP + 25 * TS, LEDGE = PF_TOP + 12 * TS, WALL_L = 16, WALL_R = 240;
    // (the shot-cap backstop alone: the battle magazine off for this test - game.js AMMO)
    const tn = (name, fn) => t(name + ' (magazine off: the cap alone)', () => { D.ammo.off(true); try { return fn(); } finally { D.ammo.off(false); } });
    const CH = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'];
    const sfx = [];
    const A = PG.Audio || {};
    if (typeof A.sfx === 'function') { const o = A.sfx; A.sfx = function (n, op) { sfx.push(n + (op && op.n ? ':' + op.n : '')); return o.apply(A, arguments); }; }
    const release = () => { for (const k of ['left', 'right', 'jump', 'shoot']) for (let s = 0; s < 4; s++) D.press(k, false, s); };
    const seen = [];   // every word pop of the run (G.words is cleared by solo())
    const step = (n) => { n = n === undefined ? 1 : n; for (let i = 0; i < n; i++) { D.step(1); for (const w of G.words) if (!seen.includes(w)) seen.push(w); } };
    const words = () => seen.map((w) => w.txt);
    const P = (s) => G.players.find((q) => q.slot === (s | 0));
    const S = () => D.getState().players[0];
    // ---- lab rooms over round 1 and arena 1 (restored at the end)
    const L0 = LV[0], saved = { map: L0.map, player: L0.player, players: L0.players, gather: L0.gather, gapX: L0.gapX, enemies: L0.enemies, special: L0.special, boss: L0.boss };
    const A0 = AR[0], savedA = { map: A0.map, players: A0.players, enemySpawns: A0.enemySpawns, gather: A0.gather };
    const mk = (fn) => { const m = []; for (let r = 0; r < 26; r++) m.push(fn(r)); return m; };
    const WALLS = '##' + '.'.repeat(28) + '##', SOLID = '#'.repeat(32);
    // A: flat floor (feet 216), a ledge at row 12 cols 2-9 (feet 112), a hot pool cols 22-27 rows 23-24
    const ROOM_A = mk((r) => (r === 0 || r === 25 ? SOLID : r === 12 ? '##########' + '.'.repeat(20) + '##' : r === 23 || r === 24 ? '##' + '.'.repeat(20) + '~~~~~~' + '..##' : WALLS));
    // B: flat floor with one interior block at row 24, col 20
    const ROOM_B = mk((r) => (r === 0 || r === 25 ? SOLID : r === 24 ? '##' + '.'.repeat(18) + '#' + '.'.repeat(9) + '##' : WALLS));
    // F: just a flat floor
    const ROOM_F = mk((r) => (r === 0 || r === 25 ? SOLID : WALLS));
    // C: a cold pool over the whole floor (an ice floor made from frozen bubbles)
    const ROOM_C = mk((r) => (r === 0 || r === 25 ? SOLID : r === 23 || r === 24 ? '##' + '='.repeat(28) + '##' : WALLS));
    // S: the floor + a shelf at row 18 cols 2-12 (feet 160) for the yarn to roll off
    const ROOM_S = mk((r) => (r === 0 || r === 25 ? SOLID : r === 18 ? '#############' + '.'.repeat(17) + '##' : WALLS));
    // H: a raised floor cols 2-13 (feet 200) beside a hot pool cols 14-29 rows 23-24 (surface 200)
    const ROOM_H = mk((r) => (r === 0 || r === 25 ? SOLID : r === 23 || r === 24 ? '##' + '#'.repeat(12) + '~'.repeat(16) + '##' : WALLS));
    const SPAWNS = [{ col: 4, row: 24 }, { col: 27, row: 24 }, { col: 10, row: 24 }, { col: 20, row: 24 }];
    function park() { for (const e of G.enemies) { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; } }
    function clean() { G.bubbles = []; G.items = []; G.pickup = null; G.stampT = 1e9; G.steamT = -1; G.words = []; G.ice = []; seen.length = 0; sfx.length = 0; }
    function solo(char, room, perksOff) {
      Object.assign(L0, { map: room || ROOM_A, player: SPAWNS[0], players: SPAWNS, gather: { col: 16, row: 3 }, gapX: 16 * 8, special: undefined, boss: null,
        enemies: [{ type: 'grime', col: 9, row: 24, dir: 1 }, { type: 'grime', col: 12, row: 24, dir: 1 }, { type: 'fly', col: 14, row: 10, dir: 1 }] });
      D.seed(5); D.start(0, char); D.setInvincible(true); D.setPerks(!perksOff);
      park(); step(90); park(); clean(); release();
      return P(0);
    }
    function battle(chars, room, perksOff, more) {
      Object.assign(A0, { map: room || ROOM_F, players: SPAWNS, enemySpawns: [], gather: { col: 16, row: 3 } });
      D.seed(5); D.local.battle(chars, Object.assign({ arena: 0, countdown: false, perks: !perksOff, intrusion: false }, more || {}));
      D.setInvincible(true); D.setPerks(!perksOff);
      step(5); clean(); release();
      for (const p of G.players) p.invuln = 0;
      return G.players;
    }
    // a body standing at x on a floor (feet), every move field cleared (no step)
    function put(p, x, feet, facing) {
      Object.assign(p, { x, y: feet - 16, vx: 0, vy: 0, onGround: true, facing: facing || 1, coyote: 0, jumpBuf: 0, airT: 0, mv: '', mvT: 0, mvUsed: false, mvCd: 0,
        glideT: 0, carry: false, hop: 0, hopAir: false, landT: 30, invuln: 0, stunT: 0, shootCd: 0, autoCd: 0, shootBuf: 0, water: 0, waterSkip: 0 });
    }
    // ... and settled for 2 frames (the move tests)
    const place = (x, feet, facing) => { put(P(0), x, feet, facing); step(2); };
    // the shooter hangs in the air so its bubble's centre flies at exactly y = cy (one frame: vy -0.22 -> 0, y - 0.11)
    function hang(p, x, cy, facing) {
      put(p, x, cy - 7 + 0.11 + 16, facing);
      Object.assign(p, { onGround: false, vy: -0.22, airT: 30, coyote: 0 });
    }
    const tap = (a) => { D.press(a, true); step(1); D.press(a, false); };
    const toApex = () => { let n = 0; while (P(0).vy < 0 && n < 80) { step(1); n++; } return n; };
    const toLand = (max) => { let n = 0; while (!P(0).onGround && n < (max || 300)) { step(1); n++; } return n; };
    // one press of BUBBLE for slot s; returns the bubbles it blew (in blow order)
    function blow(s) {
      const n0 = G.seq;
      D.press('shoot', true, s | 0); step(1); D.press('shoot', false, s | 0);
      return G.bubbles.filter((b) => typeof b.id === 'number' && b.id > n0 && b.owner === (s | 0) && b.kind === 'empty' && b.born === G.frame);
    }
    // an enemy standing still where told (type: default mold)
    const still = (e, x, feet, type) => Object.assign(e, { type: type || 'mold', state: 'active', x, y: feet - 16, vx: 0, vy: 0, onGround: type !== 'fly', angry: false, escaped: false, hopT: 99999, delay: 0, spawnY: feet - 16,
      jumpCd: 999, chargeCd: 999, windT: 0, chargeT: 0, committed: false, soakT: 0, dir: 1, water: 0, grace: 0, bubble: null, ice: null, fvx: 1, fvy: 1 });
    const activate = (e, x, feet, type) => Object.assign(still(e, x, feet, type), { hopT: 999 });
    const bub = (x, y) => D.spawnBubble('empty', x, y);
    // follow one bubble to the end of its shot phase: per age [age, x, y, state, kind]
    function track(b, max) {
      const out = [[b.age, b.x, b.y, b.state]];
      for (let i = 0; i < (max || 140) && !b.dead && b.state === 'shot'; i++) { step(1); out.push([b.age, b.x, b.y, b.state, b.kind]); }
      return out;
    }
    // a target box top at y 202 (an enemy / rival standing on the floor); the bubble's centre flies dy above it
    function radiusTrial(char, dy, rival) {
      let p, v;
      if (rival) { [p, v] = battle([char, 'duck']); put(v, 80, FLOOR, -1); } else { p = solo(char, ROOM_F); still(G.enemies[0], 80, FLOOR); }
      hang(p, 40, 202 - dy, 1);
      blow(0); let caught = false;
      for (let i = 0; i < 40 && !caught; i++) {
        if (v) v.invuln = 0;
        if (rival ? v.trap : G.enemies[0].state === 'trapped') caught = true; else step(1);
      }
      return caught;
    }

    // ==================================================================== all six: kit table, the shared gate
    t('kit table: PG.debug.kit; walk capy 1.15 / otter 1.40 / others 1.25; tap cooldowns 14/14/16/20/14/12; perks off = base', () => {
      if (!D.kit || D.kit('duck').glide.max !== 75 || D.kit('capy').slam.wind !== 8 || D.kit('nope').walk !== 1) return 'kit()';
      const out = {}, want = { duck: 1.25, capy: 1.15, otter: 1.4, penguin: 1.25, cat: 1.25, frog: 1.25 }, cdw = { duck: 14, capy: 14, otter: 16, penguin: 20, cat: 14, frog: 12 };
      for (const c of CH) {
        solo(c); place(40, FLOOR); D.press('right', true); step(12); const v = P(0).vx; D.press('right', false); step(20);
        D.press('shoot', true); step(1); const cd = P(0).shootCd; D.press('shoot', false);
        out[c] = v.toFixed(3) + ' cd ' + cd;
        if (Math.abs(v - want[c]) > 0.006) return 'walk ' + JSON.stringify(out);
        if (cd !== cdw[c]) return 'cd ' + JSON.stringify(out);
      }
      solo('frog', null, true); place(40, FLOOR); D.press('shoot', true); step(1); const cdOff = P(0).shootCd; D.press('shoot', false);
      D.press('right', true); step(12); const vOff = P(0).vx; release();
      info('walk/cd ' + JSON.stringify(out) + ' | frog perks off cd ' + cdOff + ' walk ' + vOff.toFixed(3));
      if (cdOff !== 14 || Math.abs(vOff - 1.25) > 0.006) return 'perks off frog';
    });
    t('levels: no kit lowers the base jump or the walk floor (every animal: tap jump apex 38.2 in 38 f; walk >= x0.92)', () => {
      const out = [];
      for (const c of CH) {
        if (!(D.kit(c).walk >= 0.92)) return c + ' walk x' + D.kit(c).walk;
        solo(c); place(40, FLOOR); D.press('right', true); step(12);
        const y0 = P(0).y; let apex = 0, n = 1;
        tap('jump'); apex = Math.max(apex, y0 - P(0).y);
        while (!P(0).onGround && n < 200) { step(1); n++; apex = Math.max(apex, y0 - P(0).y); }
        release();
        out.push(c + ' ' + f1(apex) + '/' + (n - 1));
        if (Math.abs(apex - 38.2) > 0.6 || Math.abs(n - 1 - 38) > 1) return out.join(' ');
      }
      info('base jumps ' + out.join(' '));
    });
    t('all six: a jump pressed 1-3 f before landing still jumps on landing (no eaten jump; the frog chains it)', () => {
      const res = {};
      for (const c of CH) {
        solo(c); place(60, FLOOR); tap('jump'); const L = toLand() + 1; // (frames from the press to the landing frame)
        res[c] = [];
        for (let k = 1; k <= 5; k++) {
          solo(c); place(60, FLOOR); tap('jump'); step(L - k - 2); // (the press frame is L - k)
          const gap = FLOOR - (P(0).y + 16);
          tap('jump'); const mv = P(0).mv;
          let jumped = false; for (let i = 0; i < k + 3; i++) { step(1); if (P(0).vy < -3.7) jumped = true; }
          res[c].push(k + ':' + (jumped ? 'J' : mv ? mv : '-') + '@' + f1(gap));
        }
      }
      info('press-before-landing (k f before: J = jumped on landing, else the move it became / -; @ feet gap px) ' + JSON.stringify(res));
      // k <= 3 (the spec row): inside the gate's landing probe (KIT_GATE.clear 10, the capy's slam.clear 16) the press is
      // the buffered jump. At full fall speed 3 f up is 12.2 px - past the 10 px probe, so there the otter / penguin /
      // cat press is its air move by the kit numbers (a move, not a lost press); the duck, capy and frog jump
      const MOVE = { otter: 'dash', penguin: 'dive', cat: 'curl' };
      for (const c in res) for (const e of res[c].slice(0, 3)) {
        const gap = +e.split('@')[1], clear = c === 'capy' ? 16 : 10;
        const want = MOVE[c] && gap > clear ? MOVE[c] : 'J';
        if (e.split('@')[0].split(':')[1] !== want) return c + ' ' + e + ' (want ' + want + ')';
      }
    });
    t('all six: an air press in the first 6 airborne frames does nothing special (the 6th is the first that can)', () => {
      for (const c of ['capy', 'otter', 'penguin', 'cat']) {
        for (let k = 1; k <= 6; k++) {
          solo(c); place(60, FLOOR); tap('jump'); step(k - 1); const airT = P(0).airT; tap('jump');
          if (k <= 5 && (P(0).mv || P(0).mvUsed)) return c + ' airT ' + airT + ' mv ' + P(0).mv;
          if (k === 6 && !P(0).mvUsed) return c + ' airT 6 refused';
        }
      }
      // the duck: holding from take-off never glides on the way up; the frog: no air move at all
      solo('duck'); place(60, FLOOR); D.press('jump', true); let up = 0;
      for (let i = 0; i < 18; i++) { step(1); if (P(0).mv) up++; }
      release();
      solo('frog'); place(60, FLOOR); tap('jump'); step(10); tap('jump'); const fr = P(0).mv + '/' + P(0).mvUsed;
      info('air gate: capy / otter / penguin / cat refuse airT 1-5, take 6; duck rising with JUMP held: ' + up + ' move frames; frog air press: ' + fr);
      if (up || fr !== '/false') return 'duck ' + up + ' frog ' + fr;
    });
    t('all six: holding JUMP over a floating bubble bounces -3.8 instead of the move', () => {
      const out = [];
      for (const c of ['duck', 'capy', 'otter', 'penguin', 'cat']) {
        solo(c); place(60, FLOOR); tap('jump'); while (!(P(0).vy > 0 && FLOOR - (P(0).y + 16) < 32)) step(1);
        const b = bub(P(0).x, P(0).y + 16 + 5.5); b.phase = 0;
        D.press('jump', true); step(1);
        const mv = P(0).mv; let bounced = false, other = '';
        for (let i = 0; i < 14 && !bounced; i++) { step(1); if (Math.abs(P(0).vy + 3.8) < 0.25) bounced = true; else if (P(0).mv && P(0).mv !== 'glide') other = P(0).mv; }
        release();
        out.push(c + ' mv "' + mv + '" bounced ' + bounced + (other ? ' then ' + other : ''));
        if (other) return out.join(' | ');
        if (!bounced || (mv && !(c === 'duck' && mv === 'glide'))) return out.join(' | ');
      }
      info('bubble probe ' + out.join(' | ') + ' (the duck may start its glide the frame before: a bounce works mid-glide)');
    });
    t('all six: a stun mid-move ends it on the host (mv \'\'; the capy just falls, no quake)', () => {
      const out = [];
      const cases = [['otter', 'dash'], ['penguin', 'dive'], ['penguin', 'slide'], ['duck', 'glide'], ['capy', 'wind'], ['capy', 'slam'], ['cat', 'curl']];
      for (const [c, want] of cases) {
        solo(c); place(60, FLOOR); D.press('right', c === 'otter' || c === 'penguin');
        if (c === 'duck') { D.press('jump', true); step(1); toApex(); step(3); } else { tap('jump'); toApex(); tap('jump'); }
        if (want === 'slam') for (let i = 0; i < 12 && P(0).mv !== 'slam'; i++) step(1);
        if (want === 'slide') for (let i = 0; i < 40 && P(0).mv !== 'slide'; i++) step(1);
        if (want === 'slide') step(4);
        if (c === 'capy') activate(G.enemies[0], P(0).x + 20, FLOOR, 'grime');
        const was = P(0).mv; G.gameMode = 'battle'; D.hitPlayer(0); const now = P(0).mv; step(1); const after = P(0).mv, A0b = P(0).mvA || P(0).mvB;
        let quake = false;
        if (c === 'capy') { toLand(); step(2); quake = G.enemies[0].soakT > 0 || P(0).mv === 'rec'; }
        G.gameMode = 'solo'; release();
        out.push(c + ' ' + was + '->"' + now + '"' + (quake ? ' QUAKE' : ''));
        if (was !== want || now !== '' || after !== '' || A0b || quake) return out.join(' | ');
      }
      info('stun ' + out.join(' | '));
    });

    // ==================================================================== duck: 둥실 활공
    t('duck glide: flat jump + hold -> vy <= 0.65 within 6 f of the apex, airtime 76-82, >= 105 px; bit A; flap; word once', () => {
      solo('duck'); place(30, FLOOR); D.press('right', true); step(12); sfx.length = 0;
      const x0 = P(0).x; D.press('jump', true);
      let n = 0, apexAt = -1, slowAt = -1, An = 0;
      for (; n < 300; n++) {
        step(1); const s = S();
        if (apexAt < 0 && s.vy > 0) apexAt = n;
        if (apexAt >= 0 && slowAt < 0 && s.vy <= 0.65 + 1e-9 && s.mv === 'glide') slowAt = n;
        if (s.mvA) An++;
        if (s.onGround) break;
      }
      const dx = P(0).x - x0; release();
      info('duck glide air ' + n + ' dx ' + f1(dx) + ' apex@' + apexAt + ' slowed@' + slowAt + ' A frames ' + An + ' flaps ' + sfx.filter((x) => x === 'flap').length + ' words ' + words().join(','));
      if (slowAt - apexAt > 6) return 'slow ' + (slowAt - apexAt);
      if (n < 76 || n > 82) return 'air ' + n;
      if (dx < 105) return 'dx ' + dx;
      if (An < 50 || !sfx.includes('flap')) return 'bit A / flap';
      if (words().filter((w) => w === '둥실~').length !== 1) return 'word ' + words().join(',');
      D.press('jump', true); toLand(); release(); step(2);   // (a second glide in the same round: no second word)
      if (words().filter((w) => w === '둥실~').length !== 1) return 'word twice';
    });
    t('duck meter: 75 f (battle 60), then vy passes 0.65; a bounce refills it', () => {
      const meter = (bt) => {
        solo('duck'); if (bt) G.gameMode = 'battle';
        Object.assign(P(0), { x: 90, y: LEDGE - 40, vx: 0, vy: 0.5, onGround: false, airT: 20, coyote: 0 });
        D.press('jump', true);
        let max = 0, after = 0;
        for (let i = 0; i < 160 && !P(0).onGround; i++) { step(1); max = Math.max(max, P(0).glideT); if (P(0).glideT >= max && P(0).mv === '' && max > 0) after = Math.max(after, P(0).vy); }
        release(); G.gameMode = 'solo';
        return { max, after };
      };
      const a = meter(false), b = meter(true);
      solo('duck'); Object.assign(P(0), { x: 90, y: 60, vx: 0, vy: 0.5, onGround: false, airT: 20, coyote: 0 }); D.press('jump', true);
      step(30); const g0 = P(0).glideT;
      const bb = bub(P(0).x, P(0).y + 10); bb.phase = 0;
      let bounced = false;
      for (let i = 0; i < 8; i++) { step(1); if (Math.abs(P(0).vy + 3.8) < 0.3) bounced = true; }
      const g1 = P(0).glideT; release();
      info('duck meter solo ' + JSON.stringify(a) + ' battle ' + JSON.stringify(b) + ' | bounce: glideT ' + g0 + ' -> ' + g1 + ' bounced ' + bounced);
      if (a.max !== 75 || !(a.after > 0.65)) return 'solo ' + JSON.stringify(a);
      if (b.max !== 60 || !(b.after > 0.65)) return 'battle ' + JSON.stringify(b);
      if (!bounced || !(g1 < 8)) return 'refill ' + g0 + ' -> ' + g1;
    });
    // ---- duck: 메아리 거품
    t('duck echo: out 62-64 px at age 34-36, past the spawn by 73, shot until 80, ends 19-24 px behind; b_echo n=0 / n=1 at the turn', () => {
      const p = solo('duck', ROOM_F); put(p, 60, FLOOR, 1);
      const b = blow(0)[0], x0 = b.x - 3.5, s0 = sfx.slice();
      const tr = track(b);
      let mx = -1e9, mxAge = 0, pastAge = -1;
      for (const e of tr) { const d = e[1] - x0; if (d > mx) { mx = d; mxAge = e[0]; } if (pastAge < 0 && e[0] > 40 && d < 0) pastAge = e[0]; }
      const end = tr[tr.length - 1], lastShot = tr.filter((e) => e[3] === 'shot').pop();
      const turnAt = sfx.indexOf('b_echo:1');
      info('echo: max ' + f2(mx) + ' at age ' + mxAge + ' past spawn at ' + pastAge + ' last shot age ' + lastShot[0] + ' end age ' + end[0] + ' ' + end[3] + ' at ' + f2(end[1] - x0) +
        ' | sfx ' + s0.join(',') + ' turn sound ' + (turnAt >= 0) + ' ty ' + b.ty);
      if (mx < 62 || mx > 64 || mxAge < 34 || mxAge > 36) return 'max';
      if (pastAge < 0 || pastAge > 73) return 'past ' + pastAge;
      if (lastShot[0] !== 79 || end[0] !== 80 || end[3] !== 'float' || b.grace < 10) return 'end ' + JSON.stringify(end) + ' grace ' + b.grace;
      if (end[1] - x0 > -19 || end[1] - x0 < -24) return 'behind ' + (end[1] - x0);
      if (!s0.includes('b_echo') || s0.includes('shoot') || turnAt < 0) return 'sfx';
    });
    t('duck echo with shampoo: r 12 / rP 12, turns at age 44 about 78 px out, phase still 80 f', () => {
      const p = solo('duck', ROOM_F); put(p, 60, FLOOR, 1); D.givePower('shampoo');
      const b = blow(0)[0], x0 = b.x - 3.5, r = b.r + '/' + b.rP, tr = track(b);
      let mx = -1e9, mxAge = 0; for (const e of tr) if (e[1] - x0 > mx) { mx = e[1] - x0; mxAge = e[0]; }
      const end = tr[tr.length - 1];
      info('echo shampoo: r ' + r + ' max ' + f2(mx) + ' at ' + mxAge + ' end age ' + end[0] + ' at ' + f2(end[1] - x0));
      if (r !== '12/12' || mxAge < 43 || mxAge > 45 || Math.abs(mx - 78.3) > 1 || end[0] !== 80) return 'shampoo';
    });
    t('duck echo walls: a wall within 40 px flips it early; a wall on the way back ends the shot', () => {
      let p = solo('duck', ROOM_F); put(p, WALL_R - 14 - 40, FLOOR, 1); // (the wall 30 px ahead of the bubble's right edge)
      let b = blow(0)[0]; const x0 = b.x - 3.5; let tr = track(b);
      let mx = -1e9, mxAge = 0; for (const e of tr) if (e[1] - x0 > mx) { mx = e[1] - x0; mxAge = e[0]; }
      const endA = tr[tr.length - 1];
      p = solo('duck', ROOM_F); put(p, 18, FLOOR, 1); // (back to the left wall: the return reaches it)
      b = blow(0)[0]; tr = track(b); const endB = tr[tr.length - 1];
      info('echo walls: early turn at age ' + mxAge + ' max ' + f2(mx) + ' (end age ' + endA[0] + ') | back into the wall: ends age ' + endB[0] + ' ' + endB[3] + ' x ' + f1(endB[1]));
      if (mxAge >= 34 || mx > 40 || endA[0] !== 80) return 'early turn';
      if (endB[0] >= 80 || endB[3] !== 'float' || endB[1] !== WALL_L) return 'back wall';
    });
    t('duck echo: a grime 15 px behind the duck is trapped on the return (shot bubbles pass through the duck)', () => {
      const p = solo('duck', ROOM_F); put(p, 100, FLOOR, 1);
      const e = still(G.enemies[0], 85, FLOOR, 'grime');
      const b = blow(0)[0]; let age = -1, last = b.age;
      for (let i = 0; i < 90 && age < 0; i++) {
        if (e.state === 'active') { e.x = 85; e.vx = 0; }   // (pinned: a grime walks)
        step(1); if (b.kind === 'trapped') age = last + 1; else last = b.age;
      }
      info('echo return: grime trapped at age ' + age + ' (enemy now ' + e.state + ': the duck beside it may pop the prison) duck moved ' + (p.x !== 100));
      if (age < 60 || e.state === 'active') return 'not on the return: ' + age;
    });

    // ==================================================================== capy: 털썩 엉덩방아
    t('capy slam: wind-up 8 f |dy| < 0.01, vy 5.0 every frame, lands <= 17 f after the press; rec 14 f (no x change, right held); mvCd 45; bits; sfx; word', () => {
      solo('capy'); place(60, FLOOR); sfx.length = 0;
      tap('jump'); toApex();
      const yA = P(0).y, xA = P(0).x; D.press('jump', true);
      const tr = [];
      let landAt = -1;
      for (let i = 1; i <= 40; i++) {
        // just before the landing frame: enemies around where it lands (grime 30 px, grime 48 px, fly 20 px)
        if (P(0).mv === 'slam' && FLOOR - (P(0).y + 16) <= 5.0 && landAt < 0 && !tr.placed) {
          tr.placed = true;
          activate(G.enemies[0], P(0).x + 30, FLOOR, 'grime'); activate(G.enemies[1], P(0).x + 48, FLOOR, 'grime'); activate(G.enemies[2], P(0).x - 20, FLOOR - 4, 'fly');
        }
        if (i === 2) D.press('jump', false);
        if (P(0).mv === 'rec') D.press('right', true);
        step(1); const s = S();
        tr.push({ i, mv: s.mv, y: s.y, vy: s.vy, x: s.x, A: s.mvA, B: s.mvB, cd: s.mvCd });
        if (landAt < 0 && s.onGround) { landAt = i; tr.soak = G.enemies.slice(0, 3).map((e) => e.soakT); tr.hop = G.enemies[0].vy < 0 && !G.enemies[0].onGround; }
        if (landAt > 0 && s.mv === '') break;
      }
      release();
      const wind = tr.filter((e) => e.mv === 'wind'), slam = tr.filter((e) => e.mv === 'slam'), rec = tr.filter((e) => e.mv === 'rec');
      const dy = Math.max(...wind.map((e) => Math.abs(e.y - yA)));
      const recX = rec.map((e) => e.x), end = tr[tr.length - 1];
      const soak = tr.soak || [];
      info('capy slam: wind ' + wind.length + ' dy ' + dy.toFixed(3) + ' slam ' + slam.length + ' vy ' + slam.map((e) => e.vy).join('/') + ' land@' + landAt +
        ' rec ' + rec.length + ' recDx ' + f1(Math.max(...recX) - Math.min(...recX)) + ' end cd ' + end.cd + ' soak ' + soak.join('/') + ' sfx ' + sfx.join(',') + ' words ' + words().join(','));
      if (wind.length !== 8 || dy > 0.01 || Math.abs(xA - wind[0].x) > 0.01) return 'wind';
      if (slam.some((e) => e.vy !== 5)) return 'slam vy';
      if (landAt > 17) return 'land ' + landAt;
      if (rec.length !== 15 || Math.max(...recX) - Math.min(...recX) > 0.001) return 'rec'; // (the landing frame + 14)
      if (end.cd !== 45) return 'cd ' + end.cd;
      if (!wind.every((e) => e.A) || !slam.every((e) => e.A) || !rec.every((e) => e.B && !e.A)) return 'bits';
      if (!tr.hop) return 'no hop';
      if (!sfx.includes('slam') || !sfx.includes('quake')) return 'sfx';
      if (!words().includes('털썩!')) return 'word';
    });
    t('capy quake: soaks a grime 30 px away on the same floor (soakT 300), not a fly 20 px away, not a grime 48 px away', () => {
      solo('capy'); place(60, FLOOR); tap('jump'); toApex(); tap('jump');
      let placed = false;
      for (let i = 0; i < 40 && !P(0).onGround; i++) {
        if (!placed && P(0).mv === 'slam' && FLOOR - (P(0).y + 16) <= 5.0) {
          placed = true;
          activate(G.enemies[0], P(0).x + 30, FLOOR, 'grime'); activate(G.enemies[1], P(0).x + 48, FLOOR, 'grime'); activate(G.enemies[2], P(0).x - 20, FLOOR - 4, 'fly');
        }
        step(1);
      }
      const soak = G.enemies.slice(0, 3).map((e) => e.soakT); step(1); const soak1 = G.enemies[0].soakT;
      info('quake soak (end of the landing frame / one later): grime 30 px ' + soak[0] + '/' + soak1 + ', grime 48 px ' + soak[1] + ', fly 20 px ' + soak[2]);
      // (the quake sets 300 in the capy's update; the enemy's own update later that same frame already counts one off)
      if (soak[0] !== 299 || soak1 !== 298 || soak[1] !== 0 || soak[2] !== 0) return soak.join('/');
    });
    t('capy: slamming through a floating empty pops it (no bounce while slamming, JUMP held); a stun mid-slam: no quake', () => {
      solo('capy'); place(60, FLOOR); tap('jump'); toApex(); D.press('jump', true);
      while (P(0).mv !== 'slam') step(1);
      const b = bub(P(0).x, P(0).y + 22); b.phase = 0;
      let bounced = false;
      for (let i = 0; i < 12 && !P(0).onGround; i++) { step(1); if (P(0).vy < -1) bounced = true; }
      release();
      const popped = b.dead || b.state === 'pop';
      solo('capy'); place(60, FLOOR); tap('jump'); toApex(); tap('jump'); step(10);
      if (P(0).mv !== 'slam') return 'not slamming ' + P(0).mv;
      G.gameMode = 'battle'; activate(G.enemies[0], P(0).x + 20, FLOOR, 'grime');
      D.hitPlayer(0);
      const mvAfter = P(0).mv; toLand(); step(2);
      const soaked = G.enemies[0].soakT; G.gameMode = 'solo';
      info('capy through bubble: popped ' + popped + ' bounced ' + bounced + ' | stun mid-slam: mv "' + mvAfter + '" at landing "' + P(0).mv + '" soak ' + soaked);
      if (!popped || bounced) return 'popped ' + popped + ' bounced ' + bounced;
      if (mvAfter !== '' || P(0).mv === 'rec' || soaked > 0) return 'stun';
    });
    // ---- capy: 왕방울 거품
    t('capy bubble: 2.8 x 22 = 61.6 px; catches an enemy 10.5 px from its centre (not 11.1: r 11), a rival within its drawn ring 12.25 (14.0 yes, 14.8 no); shampoo 15/14; b_onsen', () => {
      const p = solo('capy', ROOM_F); put(p, 60, FLOOR, 1);
      const b = blow(0)[0], x0 = b.x - 2.8, r = b.r + '/' + b.rP, s0 = sfx.slice(), tr = track(b), end = tr[tr.length - 1];
      const e105 = radiusTrial('capy', 10.5), e111 = radiusTrial('capy', 11.1), r99 = radiusTrial('capy', 14.0, true), r101 = radiusTrial('capy', 14.8, true);
      const p2 = solo('capy', ROOM_F); put(p2, 60, FLOOR, 1); D.givePower('shampoo'); const bs = blow(0)[0], sh = bs.r + '/' + bs.rP + ' ' + bs.shotT;
      info('capy: range ' + f2(end[1] - x0) + ' in ' + end[0] + ' f, r ' + r + ' | enemy 10.5 ' + e105 + ' 11.1 ' + e111 + ' | rival 14.0 ' + r99 + ' 14.8 ' + r101 + ' | shampoo ' + sh + ' | sfx ' + s0.join(','));
      if (Math.abs(end[1] - x0 - 61.6) > 0.05 || end[0] !== 22 || r !== '11/10') return 'range / radii';
      if (!e105 || e111 || !r99 || r101) return 'catch radii';
      if (sh !== '15/14 33' && sh !== '15/14 32') return 'shampoo ' + sh;
      if (!s0.includes('b_onsen') || s0.includes('shoot')) return 'sfx';
    });

    // ==================================================================== otter: 휙 대시
    t('otter dash: 31-33 px in 10 f, |dy| < 0.01, bit A, once per airtime, mvCd 20; stops at WALL_R - 14 and WALL_L - 2', () => {
      solo('otter'); place(60, FLOOR); sfx.length = 0;
      D.press('right', true); step(10); tap('jump'); toApex();
      const x0 = P(0).x, y0 = P(0).y; D.press('jump', true);
      const tr = [];
      for (let i = 0; i < 10; i++) { step(1); if (i === 0) D.press('jump', false); tr.push(S()); }
      const dx = P(0).x - x0, dy = Math.max(...tr.map((s) => Math.abs(s.y - y0)));
      step(1); const after = S();
      tap('jump'); const again = S();
      release();
      info('otter dash dx ' + f1(dx) + ' dy ' + dy.toFixed(3) + ' A ' + tr.filter((s) => s.mvA).length + ' after mv "' + after.mv + '" cd ' + after.mvCd + ' again mv "' + again.mv + '" sfx ' + sfx.join(','));
      if (dx < 31 || dx > 33 || dy > 0.01) return 'dash';
      if (after.mv !== '' || after.mvCd !== 20) return 'end';
      if (again.mv !== '' || again.vy < 0) return 'again';
      if (tr.filter((s) => s.mvA).length !== 10 || !sfx.includes('dash')) return 'bits / sfx';
      const wall = (x, dir) => {
        solo('otter'); place(x, FLOOR, dir); D.press(dir > 0 ? 'right' : 'left', true); tap('jump'); toApex(); D.press('jump', true);
        let lo = 1e9, hi = -1e9, endAt = -1;
        for (let i = 0; i < 12; i++) { step(1); lo = Math.min(lo, P(0).x); hi = Math.max(hi, P(0).x); if (endAt < 0 && P(0).mv === '') endAt = i + 1; }
        release();
        return { lo, hi, endAt };
      };
      const R = wall(205, 1), L = wall(36, -1);
      info('otter walls: right max x ' + f1(R.hi) + ' (ended after ' + R.endAt + ' f) | left min x ' + f1(L.lo) + ' (ended after ' + L.endAt + ' f)');
      if (R.hi > WALL_R - 14 + 0.001 || R.endAt >= 10) return 'right wall ' + JSON.stringify(R);
      if (L.lo < WALL_L - 2 - 0.001 || L.endAt >= 10) return 'left wall ' + JSON.stringify(L);
    });
    // ---- otter: 물장구 거품
    t('otter fan: 3 per press, centre 57.6 px; droplets +-9.75 at age 13, burst by 14 (self, no float, no score), +1 float per volley; b_splash', () => {
      const p = solo('otter', ROOM_F); put(p, 60, FLOOR, 1);
      const sc0 = G.score, bs = blow(0), s0 = sfx.slice();
      const [c, d1, d2] = bs, x0 = c.x - 3.6, y0 = c.y;
      const at = {};
      for (let i = 0; i < 30; i++) { step(1); for (const d of [d1, d2]) if (d.state === 'shot' || d.age <= 14) at[d.id + ':' + d.age] = [d.x, d.y, d.state, d.dead]; }
      const a13 = [at[d1.id + ':13'], at[d2.id + ':13']], a14 = [at[d1.id + ':14'], at[d2.id + ':14']];
      const floats = G.bubbles.filter((b) => b.kind === 'empty' && b.state === 'float' && !b.dead).length;
      info('fan: n ' + bs.length + ' drop ' + bs.map((b) => b.drop).join('/') + ' r ' + bs.map((b) => b.r + '/' + b.rP).join(' ') + ' | droplets @13 dy ' + a13.map((e) => (e ? f2(e[1] - y0) + ' x+' + f1(e[0] - x0) + ' ' + e[2] : '-')).join(' ') +
        ' | @14 ' + a14.map((e) => (e ? e[2] + (e[3] ? ' dead' : '') : 'gone')).join(' ') + ' | centre shot ' + c.state + ' floats ' + floats + ' score +' + (G.score - sc0) + ' sfx ' + s0.join(','));
      if (bs.length !== 3 || c.drop || !d1.drop || !d2.drop || d1.r !== 6 || d1.rP !== 6 || c.r !== 8) return 'volley';
      if (!a13[0] || !a13[1] || Math.abs(Math.abs(a13[0][1] - y0) - 9.75) > 0.01 || Math.abs(Math.abs(a13[1][1] - y0) - 9.75) > 0.01 || a13[0][2] !== 'pop') return 'age 13';
      if (a14.some((e) => e && e[2] === 'shot')) return 'age 14';
      if (floats !== 1 || G.score !== sc0) return 'floats / score';
      if (!s0.includes('b_splash') || s0.includes('shoot')) return 'sfx';
      const p2 = solo('otter', ROOM_F); put(p2, 60, FLOOR, 1); const c2 = blow(0)[0], cx0 = c2.x - 3.6, ct = track(c2), ce = ct[ct.length - 1];
      info('fan centre: ' + f2(ce[1] - cx0) + ' px in ' + ce[0] + ' f');
      if (Math.abs(ce[1] - cx0 - 57.6) > 0.05 || ce[0] !== 16) return 'centre ' + (ce[1] - cx0);
    });
    t('otter droplets catch a rival at age 6 but not at age 10 (rivalAge 8; the drawn droplet ring 6.85); the centre misses both', () => {
      // the rival stands on a ledge whose top is 11 px above the centre's path (its drawn ring reaches 10); the upper
      // droplet climbs 0.75 px / f; dxBox: the rival's drawn left edge past the bubble's starting centre
      const trial = (dxBox) => {
        const room = mk((r) => (r === 0 || r === 25 ? SOLID : r === 20 ? '##' + '.'.repeat(7) + '#####' + '.'.repeat(16) + '##' : WALLS));
        const [p, v] = battle(['otter', 'duck'], room);
        const feetR = PF_TOP + 20 * TS, cy = feetR + 11;
        hang(p, 40, cy, 1);
        const cx0 = 40 + 11 + 8; put(v, cx0 + dxBox, feetR, -1);
        const bs = blow(0), ids = bs.map((b) => b.id);
        let got = null;
        for (let i = 0; i < 20 && !got; i++) { v.invuln = 0; if (v.trap) got = v.trap.b; else step(1); }
        return got ? (ids.indexOf(got.id) > 0 ? 'drop' : 'centre') + '@' + (G.frame - bs[0].born + 1) : 'none';
      };
      const a6 = trial(3.3 * 6 + 1), a10 = trial(3.3 * 10 + 1);
      info('droplet rival window: box at the age-6 reach -> ' + a6 + ' | at the age-10 reach -> ' + a10);
      if (!/^drop@6$/.test(a6)) return 'age 6 ' + a6;
      if (a10 !== 'none') return 'age 10 ' + a10;
    });
    t('otter volley onto the boss: exactly 1 soap per volley (2 volleys = 2); 2 duck shots = 2', () => {
      const bi = LV.findIndex((L) => L.boss);
      const soapRun = (char, n) => {
        D.seed(3); D.start(bi, char); D.setInvincible(true); D.soapBoss(0); clean();
        const B = G.boss, p = P(0), s0 = B.soap;
        for (let k = 0; k < n; k++) {
          Object.assign(p, { x: B.x - 12, y: B.y + 8, vx: 0, vy: 0, facing: 1, shootCd: 0, autoCd: 0, shootBuf: 0 });
          blow(0); step(20);
        }
        return B.soap - s0;
      };
      const o1 = soapRun('otter', 1), o2 = soapRun('otter', 2), d2 = soapRun('duck', 2);
      info('boss soap: otter 1 volley +' + o1 + ', 2 volleys +' + o2 + ', duck 2 shots +' + d2);
      if (o1 !== 1 || o2 !== 2 || d2 !== 2) return [o1, o2, d2].join('/');
    });
    t('otter droplets never freeze over cold water (the centre may)', () => {
      const p = solo('otter', ROOM_C); hang(p, 60, PF_TOP + 23 * TS - 4, 1);
      const bs = blow(0); step(30);
      const ice = G.ice.length, dropsFrozen = bs.slice(1).filter((b) => b.dead && b.state !== 'pop').length;
      info('cold pool fan: ice blocks ' + ice + ' droplet states ' + bs.slice(1).map((b) => b.state + (b.dead ? '/dead' : '')).join(','));
      if (ice > 1 || dropsFrozen) return 'froze';
    });

    // ==================================================================== penguin: 쭉 배미끄럼
    const dive = (x, held, room) => {
      solo('penguin', room || ROOM_F); place(x, FLOOR); D.press('right', true); step(6);
      tap('jump'); toApex(); if (!held) D.press('right', false);
      D.press('jump', true); step(1); D.press('jump', false);
      let n = 0; while (P(0).mv === 'dive' && n < 40) { step(1); n++; }
      return n;
    };
    t('penguin slide: held 82-90 px, none 40-47, brake <= 8 f; bits A dive / B slide', () => {
      const res = {};
      for (const mode of ['held', 'none', 'brake']) {
        let dA = 0;
        solo('penguin', ROOM_F); place(30, FLOOR); D.press('right', true); step(6);
        tap('jump'); toApex(); if (mode !== 'held') D.press('right', false);
        D.press('jump', true); step(1); D.press('jump', false);
        let n = 0; while (P(0).mv === 'dive' && n < 40) { if (P(0).mvA && !P(0).mvB) dA++; step(1); n++; }
        const x0 = P(0).x; let f = 0, B = 0;
        if (mode === 'brake') D.press('left', true);
        while (P(0).mv === 'slide' && f < 120) { step(1); f++; if (P(0).mvB) B++; }
        res[mode] = { diveF: n, dA, dx: +(P(0).x - x0).toFixed(1), f, B };
        release();
      }
      info('penguin slide ' + JSON.stringify(res));
      if (res.held.dx < 82 || res.held.dx > 90) return 'held';
      if (res.none.dx < 40 || res.none.dx > 47) return 'none';
      if (res.brake.f > 8) return 'brake';
      if (res.held.dA < res.held.diveF - 1 || res.held.B < res.held.f - 1) return 'bits';
    });
    t('penguin slide-jump from 2.6: >= 85 px across; a wall bonks 10 f (input ignored); an interior block never bonks', () => {
      dive(20, true);
      D.press('jump', true); step(1); D.press('jump', false);
      const x0 = P(0).x; toLand(); const sj = P(0).x - x0;
      release();
      dive(150, true);
      let f = 0; while (P(0).mv === 'slide' && f < 120) { step(1); f++; }
      const bonk = P(0).mv; let bf = 0, lx = P(0).x, moved = 0, n2 = 0;
      D.press('right', false); D.press('left', true); D.press('jump', true);
      while (P(0).mv === 'bonk' && n2++ < 30) { step(1); if (P(0).mv !== 'bonk') break; if (Math.abs(P(0).x - lx) < 1e-6 && P(0).onGround) bf++; else moved++; lx = P(0).x; }
      const bonkEnd = P(0).mv, bonkWords = words().slice(); // (solo() below clears the word list)
      release();
      dive(70, true, ROOM_B);
      let bonked = false; f = 0; while (P(0).mv === 'slide' && f < 120) { step(1); f++; if (P(0).mv === 'bonk') bonked = true; }
      const passX = P(0).x; release();
      info('penguin slide-jump dx ' + f1(sj) + ' | wall: ' + bonk + ' ' + bf + ' still frames (left + jump held), moved ' + moved + ', then "' + bonkEnd + '"' + ' words ' + bonkWords.join(',') + ' | interior block: bonked ' + bonked + ' x ' + f1(passX));
      if (sj < 85) return 'slide-jump ' + sj;
      if (bonk !== 'bonk' || bf !== 10 || moved) return 'bonk';
      if (!bonkWords.includes('콩!')) return 'no 콩!';
      if (bonked || passX < 165) return 'interior';
    });
    t('penguin on ice: >= 150 px (90 f cap)', () => {
      solo('penguin', ROOM_C); G.bubbles = [];
      for (let x = 16; x <= 208; x += 16) D.spawnBubble('empty', x, PF_TOP + 23 * TS - 10);
      step(3);
      if (G.ice.length < 10) return 'ice ' + G.ice.length;
      const top = G.ice[0].y;
      place(14, top); tap('jump'); toApex();
      D.press('right', true); D.press('jump', true); step(1); D.press('jump', false);
      let n = 0; while (P(0).mv === 'dive' && n < 40) { step(1); n++; }
      const x0 = P(0).x; let f = 0; while (P(0).mv === 'slide' && f < 120) { step(1); f++; }
      const dx = P(0).x - x0; release();
      info('penguin ice slide dx ' + f1(dx) + ' in ' + f + ' f (landing feet ' + f1(P(0).y + 16) + ' vs ice top ' + top + ')');
      if (dx < 150 || f > 90) return 'ice ' + dx + ' ' + f;
    });
    // ---- penguin: 고드름 거품
    t('penguin icicle: 116-118 px in 26 f; enemy at 7.9 caught (8.1 not: r 8); rival at 10.5 caught (11.4 not: its drawn ring, 9 x 0.87 + 1 tall, on the 16 px body); shampoo 12/10 39 f; b_icicle', () => {
      const p = solo('penguin', ROOM_F); put(p, 30, FLOOR, 1);
      const b = blow(0)[0], x0 = b.x - 4.5, s0 = sfx.slice(), tr = track(b), end = tr[tr.length - 1];
      const e79 = radiusTrial('penguin', 7.9), e81 = radiusTrial('penguin', 8.1), r55 = radiusTrial('penguin', 10.5, true), r65 = radiusTrial('penguin', 11.4, true);
      const p2 = solo('penguin', ROOM_F); put(p2, 20, FLOOR, 1); D.givePower('shampoo'); const bs = blow(0)[0], sh = bs.r + '/' + bs.rP + ' ' + bs.shotT;
      info('icicle: range ' + f2(end[1] - x0) + ' in ' + end[0] + ' f r ' + b.r + '/' + b.rP + ' y const ' + tr.every((e) => e[2] === tr[0][2]) + ' | enemy 7.9 ' + e79 + ' 8.1 ' + e81 + ' | rival 10.5 ' + r55 + ' 11.4 ' + r65 + ' | shampoo ' + sh + ' | sfx ' + s0.join(','));
      if (end[1] - x0 < 116 || end[1] - x0 > 118 || end[0] !== 26 || !tr.every((e) => e[2] === tr[0][2])) return 'range';
      if (!e79 || e81 || !r55 || r65) return 'radii';
      if (sh !== '12/10 39' && sh !== '12/10 38') return 'shampoo ' + sh;
      if (!s0.includes('b_icicle')) return 'sfx';
    });

    // ==================================================================== battle: a catch is the touch as drawn; the shot cap
    t('battle catch = the drawn touch: a duck ring (r 10) at 11.7 caught / 12.5 not; the capy ring (12.25) at 14.0 / 14.8', () => {
      const r = [radiusTrial('duck', 11.7, true), radiusTrial('duck', 12.5, true), radiusTrial('capy', 14.0, true), radiusTrial('capy', 14.8, true)];
      info('drawn-touch radii: duck 11.7 ' + r[0] + ' 12.5 ' + r[1] + ' | capy 14.0 ' + r[2] + ' 14.8 ' + r[3]);
      if (!r[0] || r[1] || !r[2] || r[3]) return 'radii ' + r.join(',');
    });
    // tap BUBBLE every other frame for 4 s: the most of my bubbles out (in flight + floating; an otter volley = 1), the
    // most in flight, how many 'dry', how many blows popped my oldest (G.capPops)
    const outOf = (slot) => G.bubbles.filter((b) => !b.dead && b.owner === slot && b.kind === 'empty' && !b.drop && (b.state === 'shot' || b.state === 'float'));
    const capRun = (char, mode) => {
      if (mode === 'battle') { const [p, v] = battle([char, 'duck']); put(p, 30, FLOOR, 1); put(v, 200, FLOOR, -1); }
      else { solo(char, ROOM_F); if (mode === 'coop') { D.local.coop([char, 'duck'], 0); D.setInvincible(true); D.setPerks(true); park(); step(5); park(); clean(); release(); } put(P(0), 30, FLOOR, 1); if (P(1)) put(P(1), 200, FLOOR, -1); }
      sfx.length = 0; let max = 0, out = 0; const cp0 = G.capPops | 0;
      for (let f = 0; f < 240; f++) {
        D.press('shoot', f % 2 === 0, 0); step(1);
        if (P(1)) P(1).invuln = 60; // (nobody gets caught: every bubble flies its whole way)
        const o = outOf(0);
        out = Math.max(out, o.length); max = Math.max(max, o.filter((b) => b.state === 'shot').length);
      }
      release();
      return { out, max, dry: sfx.filter((s) => s === 'dry').length, capPops: (G.capPops | 0) - cp0 };
    };
    tn('battle: 3 of my bubbles out in all (in flight + floating) - every animal tapping 4 s reaches 3, never more; the extra blows pop my oldest, never a dry', () => {
      const r = {}; for (const c of CH) r[c] = capRun(c, 'battle');
      info('battle cap: ' + CH.map((c) => c + ' out ' + r[c].out + ' flying ' + r[c].max + ' pops ' + r[c].capPops + ' dry ' + r[c].dry).join(' | '));
      for (const c of CH) if (r[c].out !== 3 || r[c].dry || r[c].capPops < 3) return c + ' ' + JSON.stringify(r[c]);
    });
    // 3 blown and floating, then the 4th: the oldest pops (plain self-pop: no score, no chain), the new one flies
    tn('battle: the 4th blow pops the oldest (no score, no chain); a just-ridden one is skipped; all in flight: the oldest volley goes whole', () => {
      const scores = () => [G.score].concat(G.players.map((q) => q.score)).join(',');
      let [p, v] = battle(['capy', 'duck']); put(v, 200, FLOOR, -1);
      const bs = [];
      for (let k = 0; k < 3; k++) { put(p, 30 + k * 30, FLOOR, 1); bs.push(blow(0)[0]); step(40); v.invuln = 60; }
      if (!bs.every((b) => b && b.state === 'float')) return 'not floating ' + bs.map((b) => b && b.state);
      const s0 = scores(); put(p, 150, FLOOR, -1); const b4 = blow(0)[0];
      const st = bs.map((b) => b.state).join(',');
      if (st !== 'pop,float,float' || bs[0].chain || !b4 || b4.state !== 'shot' || outOf(0).length !== 3 || scores() !== s0) return 'oldest ' + st + ' chain ' + !!bs[0].chain + ' out ' + outOf(0).length + ' scores ' + s0 + ' -> ' + scores();
      step(40); v.invuln = 60;
      bs[1].rideF = G.frame; // (bounced on just now: the next-oldest goes)
      put(p, 150, FLOOR, -1); blow(0);
      const st2 = [bs[1].state, bs[2].state, b4.state].join(',');
      if (st2 !== 'float,pop,float' || outOf(0).length !== 3) return 'ridden ' + st2;
      // otters blowing 4 volleys 2 frames apart: all in flight - the 4th pops the 1st volley, centre and droplets
      [p, v] = battle(['otter', 'duck']); put(v, 200, FLOOR, -1);
      const vs = [];
      for (let k = 0; k < 4; k++) { put(p, 30, FLOOR, 1); vs.push(blow(0)); step(1); v.invuln = 60; }
      const vst = vs.map((a) => a.map((b) => b.state[0]).join('')).join(' ');
      info('4th blow: ' + st + ' | ridden skipped: ' + st2 + ' | otter volleys (s shot, p pop): ' + vst);
      if (!/^ppp sss sss sss$/.test(vst) || outOf(0).length !== 3) return 'volleys ' + vst;
    });
    t('co-op / solo unchanged: a tapping duck has 5+ echoes out, nothing popped for it, never a dry', () => {
      const s = capRun('duck', 'solo'), c = capRun('duck', 'coop');
      info('solo ' + JSON.stringify(s) + ' coop ' + JSON.stringify(c));
      if (s.max < 5 || c.max < 5 || s.dry || c.dry || s.capPops || c.capPops) return JSON.stringify({ s, c });
    });

    // ==================================================================== cat: 냥냥 2단 점프
    t('cat double jump: peak 63-66 px, once per airtime, refreshed by landing; ground <= 10 px below = a buffered jump; bit A 10 f', () => {
      solo('cat'); place(60, FLOOR); sfx.length = 0;
      const y0 = P(0).y; tap('jump'); toApex(); tap('jump');
      let An = 0, minY = P(0).y; const vyDJ = P(0).vy;
      for (let i = 0; i < 80 && !P(0).onGround; i++) { if (P(0).mvA) An++; step(1); minY = Math.min(minY, P(0).y); if (i === 25) tap('jump'); }
      const peak = y0 - minY, s1 = sfx.slice(); // (solo() below clears sfx)
      // landed: the next airtime has it again
      step(3); tap('jump'); toApex(); tap('jump'); const again = P(0).mv;
      toLand(); release();
      solo('cat'); place(60, FLOOR); tap('jump');
      while (!(P(0).vy > 0 && FLOOR - (P(0).y + 16) < 9)) step(1);
      const gap = FLOOR - (P(0).y + 16); tap('jump'); const mvP = P(0).mv;
      let jumped = false; for (let i = 0; i < 8; i++) { step(1); if (P(0).vy < -3.7) jumped = true; }
      release();
      info('cat DJ peak ' + f1(peak) + ' vy ' + vyDJ.toFixed(2) + ' A ' + An + ' sfx ' + s1.join(',') + ' | after landing: DJ "' + again + '" | near ground gap ' + f1(gap) + ' mv "' + mvP + '" buffered jump ' + jumped);
      if (peak < 63 || peak > 66) return 'peak ' + peak;
      if (An < 9 || An > 11 || !s1.includes('djump')) return 'A/sfx';
      if (s1.filter((n) => n === 'djump').length !== 1) return 'once per airtime: ' + s1.join(',');
      if (again !== 'curl') return 'landing refresh ' + again;
      if (mvP !== '' || !jumped) return 'buffered';
    });
    t('cat refresh: a bounce and "냥!" give the double jump back', () => {
      solo('cat'); place(60, FLOOR); tap('jump'); toApex(); tap('jump'); step(30);
      const used0 = P(0).mvUsed;
      D.press('jump', true);
      while (!(P(0).vy > 0)) step(1);
      const b = bub(P(0).x, P(0).y + 10); b.phase = 0;
      let bounced = false; for (let i = 0; i < 8; i++) { step(1); if (Math.abs(P(0).vy + 3.8) < 0.3) bounced = true; }
      const used1 = P(0).mvUsed; release();
      solo('cat'); Object.assign(P(0), { x: 190, y: PF_TOP + 23 * TS - 60, vx: 0, vy: 0, onGround: false, airT: 20, coyote: 0 });
      tap('jump'); const u0 = P(0).mvUsed;
      let ny = false; for (let i = 0; i < 80; i++) { step(1); if (words().includes('냥!') && !ny) { ny = true; break; } }
      const u1 = P(0).mvUsed; step(8); tap('jump'); const again = P(0).mv;
      release();
      info('cat refresh: bounce used ' + used0 + '->' + used1 + ' bounced ' + bounced + ' | 냥 used ' + u0 + '->' + u1 + ' DJ again "' + again + '"');
      if (!used0 || used1 || !bounced) return 'bounce';
      if (!u0 || u1 || !ny || again !== 'curl') return 'nyang';
    });
    // ---- cat: 털실 거품
    t('cat yarn on the ground: landings at ages 14/37/60 (+-1), x 28/70/109 (+-2), then floats; b_yarn n=0 + n=1 per landing', () => {
      const p = solo('cat', ROOM_F); put(p, 30, FLOOR, 1);
      const b = blow(0)[0], x0 = b.x - 2, s0 = sfx.slice();
      const lands = []; let prevVy = b.vy;
      for (let i = 0; i < 80 && b.state === 'shot'; i++) { step(1); if (b.vy < prevVy - 1) lands.push([b.age, f1(b.x - x0), b.y + 16]); else if (b.state === 'float' && !lands.some((l) => l[0] === b.age)) lands.push([b.age, f1(b.x - x0), b.y + 16]); prevVy = b.vy; }
      const ticks = sfx.filter((n) => n === 'b_yarn:1').length;
      info('yarn: ty ' + b.ty + ' landings ' + JSON.stringify(lands) + ' final ' + b.state + ' at age ' + b.age + ' | sfx ' + s0.join(',') + ' ticks ' + ticks);
      const want = [[14, 28], [37, 70], [60, 109]];
      if (lands.length !== 3) return 'landings ' + lands.length;
      for (let i = 0; i < 3; i++) if (Math.abs(lands[i][0] - want[i][0]) > 1 || Math.abs(+lands[i][1] - want[i][1]) > 2 || lands[i][2] !== FLOOR) return 'landing ' + i;
      if (b.state !== 'float' || ticks !== 3 || !s0.includes('b_yarn')) return 'end / sfx';
    });
    t('cat yarn: rolls off a shelf and keeps hopping on the floor below; lands on a hot-water surface; shampoo 4 landings', () => {
      let p = solo('cat', ROOM_S); put(p, 60, PF_TOP + 18 * TS, 1);
      let b = blow(0)[0]; const feet = [];
      let prevVy = b.vy; for (let i = 0; i < 90 && b.state === 'shot'; i++) { step(1); if (b.vy < prevVy - 1 || (b.state === 'float' && feet.length < 9)) feet.push(Math.round(b.y + 16)); prevVy = b.vy; }
      p = solo('cat', ROOM_H); put(p, 60, PF_TOP + 23 * TS, 1);
      b = blow(0)[0]; const hot = []; prevVy = b.vy;
      for (let i = 0; i < 90 && b.state === 'shot'; i++) { step(1); if (b.vy < prevVy - 1 || b.state === 'float') hot.push(Math.round(b.y + 16) + '@' + Math.round(b.x + 8)); prevVy = b.vy; }
      p = solo('cat', ROOM_F); put(p, 30, FLOOR, 1); D.givePower('shampoo');
      b = blow(0)[0]; const r = b.r + '/' + b.rP; let n = 0; prevVy = b.vy;
      for (let i = 0; i < 100 && b.state === 'shot'; i++) { step(1); if (b.vy < prevVy - 1 || b.state === 'float') n++; prevVy = b.vy; }
      info('yarn shelf landings (feet) ' + feet.join(',') + ' | hot room ' + hot.join(',') + ' | shampoo r ' + r + ' landings ' + n + ' end age ' + b.age);
      if (feet[0] !== PF_TOP + 18 * TS || !feet.includes(FLOOR)) return 'shelf';
      if (!hot.some((h) => h.startsWith('200@') && +h.split('@')[1] > 120)) return 'hot surface';
      if (n !== 4 || r !== '12/12') return 'shampoo';
    });
    t('cat in the air blows the base bubble (77 px, y constant), identical to a perks-off duck\'s', () => {
      const go = (c, off) => { const p = solo(c, ROOM_F, off); hang(p, 60, 150, 1); const b = blow(0)[0], x0 = b.x - 3.5, y0 = b.y; const tr = track(b); return { ty: b.ty, tr: tr.map((e) => e.slice(0, 4).join(',')).join(';'), x0, y0, b, ycon: tr.every((e) => e[2] === y0) }; };
      const cat = go('cat'), duck = go('duck', true);
      const end = cat.b.x - cat.x0;
      info('cat air shot: ty ' + cat.ty + ' travel ' + f2(end) + ' y constant ' + cat.ycon + ' identical to the perks-off duck ' + (cat.tr === duck.tr));
      if (cat.ty !== 'line' || cat.tr !== duck.tr || Math.abs(end - 77) > 0.01 || !cat.ycon) return 'air shot';
    });

    // ==================================================================== frog: 깨굴 3단 뛰기
    const apexOf = (y0) => { y0 = y0 === undefined ? P(0).y : y0; let m = 0; for (let i = 0; i < 90 && !(i > 2 && P(0).onGround); i++) { step(1); m = Math.max(m, y0 - P(0).y); } return m; };
    t('frog hop chain: presses on landing 38 / 48 / 59 (+-1), bits; a press 9 f after landing resets; walk-off resets; water starts at 48', () => {
      solo('frog'); place(60, FLOOR); sfx.length = 0;
      const h = [], lv = [], AB = [];
      let yb = P(0).y; tap('jump'); h.push(apexOf(yb)); lv.push(P(0).hop);
      for (let k = 0; k < 2; k++) {
        const y0 = P(0).y; tap('jump'); let a = 0, b = 0; let m = y0 - P(0).y;
        for (let i = 0; i < 90 && !(i > 2 && P(0).onGround); i++) { step(1); m = Math.max(m, y0 - P(0).y); if (P(0).mvA) a++; if (P(0).mvB) b++; }
        h.push(m); lv.push(P(0).hop); AB.push(a + '/' + b);
      }
      const s1 = sfx.filter((x) => /hop|jump/.test(x)); // (solo() below clears sfx)
      solo('frog'); place(60, FLOOR); tap('jump'); apexOf(); step(7); tap('jump'); const lv8 = P(0).hop; apexOf();
      solo('frog'); place(60, FLOOR); tap('jump'); apexOf(); step(8); yb = P(0).y; tap('jump'); const lv9 = P(0).hop; const h9 = apexOf(yb);
      solo('frog'); place(70, LEDGE); tap('jump'); apexOf(); // (a jump on the ledge first: hopAir true)
      D.press('right', true); let n = 0; while (P(0).onGround && n < 40) { step(1); n++; } D.press('right', false);
      toLand(); yb = P(0).y; tap('jump'); const lvW = P(0).hop; const hW = apexOf(yb);
      solo('frog'); Object.assign(P(0), { x: 196, y: PF_TOP + 23 * TS - 30, vx: 0, vy: 0, onGround: false, coyote: 0 }); step(60);
      const wy = P(0).water; yb = P(0).y; tap('jump'); const lvP = P(0).hop; const hP = apexOf(yb);
      release();
      info('frog chain ' + h.map(f1).join('/') + ' levels ' + lv.join('/') + ' A/B ' + AB.join(' ') + ' | +8f lvl ' + lv8 + ' +9f lvl ' + lv9 + ' h ' + f1(h9) +
        ' | walk-off lvl ' + lvW + ' h ' + f1(hW) + ' | pool (water ' + wy + ') lvl ' + lvP + ' h ' + f1(hP) + ' chain sfx ' + s1.join(',') + ' words ' + words().join(','));
      if (Math.abs(h[0] - 38.2) > 1 || Math.abs(h[1] - 47.9) > 1 || Math.abs(h[2] - 58.7) > 1) return 'heights';
      if (lv8 !== 1 || lv9 !== 0 || Math.abs(h9 - 38.2) > 1) return 'window';
      if (lvW !== 0 || Math.abs(hW - 38.2) > 1) return 'walk-off';
      if (!wy || lvP !== 1 || Math.abs(hP - 47.9) > 1.5) return 'pool';
      if (!/^\d+\/0$/.test(AB[0]) || !/^\d+\/\d+$/.test(AB[1]) || +AB[1].split('/')[1] < 10) return 'bits ' + AB.join(' ');
      if (s1.join(',') !== 'jump,hop:1,hop:2') return 'hop sfx (a chained hop replaces jump) ' + s1.join(',');
    });
    // ---- frog: 개구리알 거품
    t('frog egg: stops at 40-42 px (age 18), |dx| < 1 while hanging, shot until 104 then floats; b_egg n=0 / n=1 at the stop', () => {
      const p = solo('frog', ROOM_F); put(p, 40, FLOOR, 1);
      const b = blow(0)[0], x0 = b.x - 4.2, s0 = sfx.slice(), tr = track(b, 130);
      const stop = tr.find((e) => e[0] === 18), hold = tr.filter((e) => e[0] >= 18 && e[3] === 'shot');
      const dx = Math.max(...hold.map((e) => e[1])) - Math.min(...hold.map((e) => e[1])), dy = Math.max(...hold.map((e) => e[2])) - Math.min(...hold.map((e) => e[2]));
      const end = tr[tr.length - 1], stopSnd = sfx.indexOf('b_egg:1');
      info('egg: stop +' + f2(stop[1] - x0) + ' hold frames ' + hold.length + ' dx ' + f2(dx) + ' dy ' + f2(dy) + ' end age ' + end[0] + ' ' + end[3] + ' | sfx ' + s0.join(',') + ' stop sound ' + (stopSnd >= 0));
      if (stop[1] - x0 < 40 || stop[1] - x0 > 42) return 'stop';
      if (hold.length < 86 || dx >= 1 || dy > 1.01) return 'hold';
      if (end[0] !== 104 || end[3] !== 'float') return 'end';
      if (!s0.includes('b_egg') || stopSnd < 0) return 'sfx';
    });
    t('frog egg: a grime walking into the hanging egg is trapped around age 60', () => {
      const p = solo('frog', ROOM_F); put(p, 40, FLOOR, 1);
      const e = still(G.enemies[1], 142, FLOOR, 'grime'); e.dir = -1; e.hopT = 0;
      const b = blow(0)[0]; let age = -1;
      for (let i = 0; i < 110 && age < 0; i++) { step(1); if (b.kind === 'trapped') age = i + 1; }
      info('egg trap: grime trapped at egg age ' + age);
      if (age < 40 || age > 80) return 'age ' + age;
    });
    tn('frog egg cap: the 4th egg sends the oldest to float (battle: the 3rd; the 4th pops the oldest - 3 out in all); every hold phase <= 110 f; laid at the wall', () => {
      const capRun = (bt) => {
        const p = bt ? battle(['frog', 'duck'])[0] : solo('frog', ROOM_F);
        put(p, 30, FLOOR, 1);
        const eggs = [];
        for (let k = 0; k < 4; k++) { eggs.push(blow(0)[0]); step(13); }
        return eggs.map((b) => b.state).join(',');
      };
      const solo4 = capRun(false), bat = capRun(true);
      let p = solo('frog', ROOM_F); put(p, WALL_R - 14 - 2, FLOOR, 1); const w = blow(0)[0]; step(30); const wall = w.state + ' x ' + f1(w.x) + ' ph ' + w.ph;
      p = solo('frog', ROOM_F); put(p, WALL_R - 14 - 24, FLOOR, 1); const w2 = blow(0)[0]; step(30); const wall2 = w2.state + ' x ' + f1(w2.x) + ' ph ' + w2.ph + ' stop ' + w2.stopAt;
      info('egg cap solo: ' + solo4 + ' | battle: ' + bat + ' | blown into the wall: ' + wall + ' | toward it: ' + wall2);
      if (!/^float,shot,shot,shot/.test(solo4)) return 'solo cap ' + solo4;
      if (!/^pop,float,shot,shot/.test(bat)) return 'battle cap ' + bat; // (the 4th: 3 out in all - the oldest, floating, pops)
      if (!/^shot x 224\.0 ph 1$/.test(wall) || !/^shot x 224\.0 ph 1 stop \d+$/.test(wall2)) return 'wall';
    });

    // ==================================================================== battle: the magazine (장전, game.js AMMO)
    // BUBBLE tapped every other frame (tap) or held (hold) for 330 frames from a full magazine: the frames it blew on
    // (a volley = 1), the 'dry' / 'reload' sounds, the magazine left after each blow
    // (rapid: the 연사 room option - no magazine, left -1; most: the most of mine out at once)
    const magRun = (char, hold, perksOff, rapid) => {
      const [p, v] = battle([char, 'duck'], null, perksOff, rapid ? { rapid: true } : null); put(p, 30, FLOOR, 1); put(v, 200, FLOOR, -1);
      sfx.length = 0; const at = [], left = []; let most = 0;
      for (let f = 0; f < 330; f++) {
        D.press('shoot', hold ? true : f % 2 === 0, 0); step(1);
        v.invuln = 60; if (p.x !== 30) put(p, 30, FLOOR, 1);
        if (G.bubbles.some((b) => b.owner === 0 && b.kind === 'empty' && b.born === G.frame && !b.vi)) { at.push(f); const m = D.ammo.of(0); left.push(m ? m.left : -1); }
        most = Math.max(most, G.bubbles.filter((b) => !b.dead && b.owner === 0 && b.kind === 'empty' && !b.drop && (b.state === 'shot' || b.state === 'float')).length);
      }
      release();
      return { at, left, most, dry: sfx.filter((s) => s === 'dry').length, reload: sfx.filter((s) => s === 'reload').length, m: D.ammo.of(0) };
    };
    t('battle magazine: each animal its own (n, reload); 능력 끄기: the base 3 in 2.0 s for all; co-op / solo: none', () => {
      const own = CH.map((c) => c + ' ' + D.ammo.kit(c).join('/')).join(' | ');
      info('magazines (blows / reload frames): ' + own + ' | base ' + D.ammo.base().join('/'));
      const ks = CH.map((c) => D.ammo.kit(c).join()), base = D.ammo.base();
      if (base.join() !== '3,120') return 'base ' + base;
      if (new Set(ks).size !== CH.length) return 'two animals share a magazine: ' + own;
      if (!CH.every((c) => { const k = D.ammo.kit(c); return k[0] >= 2 && k[0] <= 4 && k[1] >= 60 && k[1] <= 180; })) return 'out of range ' + own;
      for (const c of CH) { battle([c, 'duck']); const m = D.ammo.of(0), k = D.ammo.kit(c); if (!m || m.n !== k[0] || m.rl !== k[1] || m.left !== k[0] || m.cap !== 3) return c + ' ' + JSON.stringify(m); } // (the cap: 3 for all, the cat's 4 too)
      battle(['cat', 'penguin'], null, true);
      if (![0, 1].every((s) => { const m = D.ammo.of(s); return m && m.n === 3 && m.rl === 120; })) return 'perks off ' + JSON.stringify([D.ammo.of(0), D.ammo.of(1)]);
      solo('cat', ROOM_F); if (D.ammo.of(0)) return 'solo has one';
      D.local.coop(['cat', 'duck'], 0); if (D.ammo.of(0)) return 'co-op has one';
    });
    t('battle magazine: tapping - n blows, then each press a quiet 칙 and nothing; the reload frames after the last blow it blows again (full), and a soft reload cue', () => {
      const out = [];
      for (const c of CH) {
        const k = D.ammo.kit(c), r = magRun(c, false), gap = r.at[k[0]] - r.at[k[0] - 1];
        out.push(c + ' at ' + r.at.slice(0, k[0] + 2).join(',') + ' gap ' + gap + ' dry ' + r.dry + ' cue ' + r.reload);
        if (r.at.length < k[0] + 1 || r.left[k[0] - 1] !== 0 || gap < k[1] || gap > k[1] + 2 || !r.dry || r.reload < 1 || r.left[k[0]] !== k[0] - 1) return c + ' ' + JSON.stringify(r);
      }
      info('tapping: ' + out.join(' | '));
    });
    t('battle magazine: a held button - no 칙, it blows on the very frame the magazine refills', () => {
      const out = [];
      for (const c of CH) {
        const k = D.ammo.kit(c), r = magRun(c, true), gap = r.at[k[0]] - r.at[k[0] - 1];
        out.push(c + ' gap ' + gap);
        if (r.at.length < k[0] + 1 || gap !== k[1] || r.dry) return c + ' ' + JSON.stringify(r);
      }
      info('held: ' + out.join(' | '));
    });
    t('battle magazine: a part-spent magazine refills whole after the reload frames with no blow (one timer from the last blow)', () => {
      for (const c of ['duck', 'cat']) {
        const k = D.ammo.kit(c); const [p, v] = battle([c, 'duck']); put(p, 30, FLOOR, 1); put(v, 200, FLOOR, -1);
        if (!blow(0).length) return c + ' no blow';
        const a = D.ammo.of(0).left; step(k[1] - 2); v.invuln = 60; const b = D.ammo.of(0).left; step(3); const d = D.ammo.of(0).left;
        if (a !== k[0] - 1 || b !== k[0] - 1 || d !== k[0]) return c + ' ' + [a, b, d];
      }
    });
    // ---- 연사 (the room option, game.js RAPID): no magazine - each animal at its kit cooldown, never a 칙; the cap 3 holds
    t('battle 연사: no magazine (ammo.of null, G.opts.rapid); off by default, the magazine as before; co-op never reads it', () => {
      battle(['cat', 'duck'], null, false, { rapid: true });
      if (G.opts.rapid !== true || D.ammo.of(0) || D.ammo.of(1)) return 'on ' + JSON.stringify([G.opts, D.ammo.of(0)]);
      battle(['cat', 'duck'], null, true, { rapid: true }); if (D.ammo.of(0)) return 'on + perks off has one';
      for (const more of [null, { rapid: false }, { rapid: 1 }, { rapid: 'yes' }]) { battle(['cat', 'duck'], null, false, more); const m = D.ammo.of(0); if (G.opts.rapid !== false || !m || m.n !== 4) return 'off ' + JSON.stringify([more, G.opts.rapid, m]); }
    });
    t('battle 연사: tapping / held for 330 f - every animal blows at its kit cooldown (cd[0] tapped, cd[1] held) right past its magazine, no 칙, no reload cue; at most 3 of mine out', () => {
      const out = [];
      for (const c of CH) for (const hold of [false, true]) {
        const k = D.ammo.kit(c), cd = D.kit(c).cd[hold ? 1 : 0], r = magRun(c, hold, false, true);
        const gaps = r.at.slice(1).map((f, i) => f - r.at[i]), want = Math.floor(329 / (cd + 1)) + 1;
        out.push(c + (hold ? ' held' : ' tap') + ' ' + r.at.length + ' blows gaps ' + Array.from(new Set(gaps)).join('/') + ' most ' + r.most);
        if (r.at.length < Math.max(want, k[0] + 3) || gaps.some((g) => g < cd || g > cd + 1) || r.dry || r.reload || r.most !== 3 || r.m || r.left.some((n) => n !== -1)) return c + (hold ? ' held ' : ' tap ') + JSON.stringify(r);
      }
      info('연사: ' + out.join(' | '));
    });
    t('battle 연사 off (the default): the cat still stops at its magazine of 4 with a 칙 (the magazine as before)', () => {
      const r = magRun('cat', false), k = D.ammo.kit('cat');
      if (r.left.slice(0, k[0]).join() !== '3,2,1,0' || !r.dry || r.at[k[0]] - r.at[k[0] - 1] < k[1] || r.most !== 3) return JSON.stringify(r);
    });

    // ==================================================================== every bubble
    t('every shot phase <= 110 f (all six, shampoo, battle); the first pop of a player\'s bubble is pop n = animal 1..6', () => {
      const out = {};
      for (const c of CH) for (const k of [0, 1, 2]) {
        const p = k === 2 ? battle([c, 'duck'])[0] : solo(c, ROOM_F);
        if (k === 1) D.givePower('shampoo');
        put(p, 30, FLOOR, 1);
        const bs = blow(0);
        out[c + k] = Math.max(...bs.map((b) => b.shotT + 0));
      }
      const pops = [];
      for (const c of CH) {
        const p = solo(c, ROOM_F); put(p, 30, FLOOR, 1); const b = blow(0)[0]; put(p, 200, FLOOR, 1); step(130); sfx.length = 0;
        if (b.state === 'float' && !b.dead) { D.popAll(); pops.push(sfx.filter((n) => /^pop/.test(n)).join(',')); } else pops.push(b.state);
      }
      info('shot phases (frames left after the blow frame) ' + JSON.stringify(out) + ' | pops ' + pops.join(' '));
      if (Object.values(out).some((v) => v > 110)) return 'phase';
      if (pops.join(' ') !== 'pop:1 pop:2 pop:3 pop:4 pop:5 pop:6') return 'pops ' + pops.join(' ');
    });
    t('PG.debug.shotPath(b, n) = the path the bubble then flies (all six, ground + air)', () => {
      const out = [];
      for (const c of CH) for (const air of [false, true]) {
        const p = solo(c, ROOM_S);
        if (air) hang(p, 30, 150, 1); else put(p, 60, PF_TOP + 18 * TS, 1);
        const bs = blow(0), paths = bs.map((b) => D.shotPath(b, 120)), bad = bs.map(() => 0), n = bs.map(() => 0);
        for (let i = 0; i < 120; i++) {
          step(1);
          bs.forEach((b, j) => { const e = paths[j][i]; if (!e) return; n[j]++; if (Math.abs(b.x - e.x) > 1e-9 || Math.abs(b.y - e.y) > 1e-9 || b.age !== e.age) bad[j]++; });
        }
        out.push(c + (air ? 'A' : 'G') + ':' + paths.map((q, j) => q.length + '/' + n[j] + (bad[j] ? ' BAD ' + bad[j] : '')).join('+'));
        if (bad.some((v) => v) || paths.some((q) => !q.length)) return out.join(' ');
      }
      info('shotPath ' + out.join(' '));
    });

    // ==================================================================== 능력 끄기
    t('perks off: a 600-frame scripted trace (walk, jumps, air presses, holds, shots) is the same for all six as the duck; bits A/B never set', () => {
      const script = (i) => {
        const r = i % 200;
        D.press('right', r < 90); D.press('left', r >= 120 && r < 170);
        D.press('jump', r === 10 || r === 30 || (r >= 60 && r < 100) || r === 130 || r === 140 || r === 150 || r === 168 || r === 172);
        D.press('shoot', r % 37 === 5 || (r >= 100 && r < 115));
      };
      const trace = (c) => {
        solo(c, ROOM_A, true); place(40, FLOOR); release();
        const out = [], bs = []; let bits = 0;
        for (let i = 0; i < 600; i++) {
          script(i); step(1);
          const p = P(0); out.push(p.x.toFixed(3) + ',' + p.y.toFixed(3));
          if (p.mvA || p.mvB || p.mv) bits++;
          bs.push(G.bubbles.map((b) => b.x.toFixed(2) + ',' + b.y.toFixed(2) + ',' + b.state).join(';'));
        }
        release();
        return { out, bs, bits };
      };
      const ref = trace('duck');
      for (const c of CH.slice(1)) {
        const tr = trace(c);
        const diff = tr.out.findIndex((v, i) => v !== ref.out[i]), bdiff = tr.bs.findIndex((v, i) => v !== ref.bs[i]);
        if (diff >= 0 || bdiff >= 0 || tr.bits) return c + ' body diff @' + diff + ' bubble diff @' + bdiff + ' bits ' + tr.bits + (diff >= 0 ? ' ' + tr.out[diff] + ' vs ' + ref.out[diff] : '');
      }
      if (ref.bits) return 'duck bits ' + ref.bits;
      info('perks off: 600 frames identical for six animals (' + ref.bs.filter((s) => s).length + ' frames with bubbles)');
    });
    t('perks off: every animal blows today\'s base bubble (ground, air, wall, shampoo) with today\'s sounds; traits base', () => {
      const trace = (c) => {
        const out = [];
        for (const k of [0, 1, 2, 3]) {
          const p = solo(c, ROOM_F, true);
          if (k === 3) D.givePower('shampoo');
          if (k === 1) hang(p, 60, 150, 1); else if (k === 2) put(p, WALL_R - 14 - 2, FLOOR, 1); else put(p, 60, FLOOR, 1);
          const bs = blow(0);
          for (const b of bs) out.push('n' + bs.length + ' ty ' + b.ty + ' r ' + b.r + '/' + b.rP + ' k ' + b.k + ' drop ' + b.drop + ' st ' + b.state);
          for (let i = 0; i < 40; i++) { step(1); out.push(G.bubbles.map((b) => b.x.toFixed(3) + ',' + b.y.toFixed(3) + ',' + b.state).join(';')); }
          D.popAll(); step(1);
          out.push(sfx.filter((n) => /shoot|^b_|^pop/.test(n)).join(','));
        }
        return out;
      };
      const ref = trace('duck');
      for (const c of CH.slice(1)) {
        const tr = trace(c), i = tr.findIndex((v, j) => v !== ref[j]);
        if (i >= 0) return c + ' differs @' + i + ': ' + tr[i] + ' vs ' + ref[i];
      }
      const heads = ref.filter((s) => /^n\d/.test(s)), snd = ref.filter((s) => /shoot/.test(s));
      info('perks off: ' + heads.join(' | ') + ' | sounds ' + snd.join(' / '));
      if (heads.some((h) => !/^n1 ty line r (8\/8|12\/12) k 0 drop false/.test(h))) return 'traits ' + heads.join(' | ');
      if (snd.some((s) => !/^shoot,pop$/.test(s))) return 'sounds ' + snd.join(' / ');
    });
    t('perks off: the base bubble is 3.5 x 22 = 77 px, y constant, then floats', () => {
      const p = solo('duck', ROOM_F, true); put(p, 60, FLOOR, 1);
      const b = blow(0)[0], x0 = b.x - 3.5, y0 = b.y, tr = track(b);
      const last = tr.filter((e) => e[3] === 'shot').pop(), end = tr[tr.length - 1];
      info('base: shot until age ' + last[0] + ' at +' + f1(last[1] - x0) + ' then ' + end[3] + ' at age ' + end[0] + ' y const ' + tr.every((e) => e[2] === y0));
      if (end[0] !== 22 || Math.abs(end[1] - x0 - 77) > 0.01 || !tr.every((e) => e[2] === y0)) return JSON.stringify(end);
    });
    t('perks off: one frame of bubble drawing is pixel-identical across the six (canvas hash); with perks on they differ', () => {
      const cv = document.getElementById('pg-canvas');
      if (!cv) return 'no canvas';
      const hashOf = (c, off) => {
        const p = solo(c, ROOM_F, off); put(p, 40, FLOOR, 1); step(2); blow(0); step(10);
        const b = G.bubbles.find((q) => q.owner === 0 && q.kind === 'empty' && !q.drop);
        if (!b) return 'none';
        // (the room's own shimmer runs on G.frame and the ambient steam wisps drift on from earlier games - a new game
        // resets neither: redraw this same state at one fixed frame number, without wisps / banners / word pops, so
        // only the bubble and its blower can differ)
        G.frame = 4321; G.banner = null; G.bannerQ = []; G.words = []; G.wisps = []; D.step(0);
        const x = cv.getContext('2d').getImageData(Math.round(b.x) - 6, Math.round(b.y) - 6, 28, 28).data;
        let h = 0; for (let i = 0; i < x.length; i++) h = (Math.imul(h, 31) + x[i]) | 0;
        return h;
      };
      const off = CH.map((c) => hashOf(c, true)), on = CH.map((c) => hashOf(c, false));
      info('bubble frame hashes perks off ' + off.join(',') + ' | perks on ' + on.join(','));
      if (off.some((h) => h !== off[0]) || off[0] === 'none') return 'off differ';
      if (new Set(on).size < 6) return 'on: some animals draw the same (' + new Set(on).size + ' distinct)';
    });

    D.setInvincible(false); D.setPerks(true);
    release();
    Object.assign(L0, saved); Object.assign(A0, savedA);
    log('KITS DONE pass=' + pass + ' fail=' + fail);
  }
  function wait() { if (window.PG && PG.debug && PG.debug.local) setTimeout(run, 50); else setTimeout(wait, 30); }
  wait();
})();
