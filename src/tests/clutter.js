// Floating EMPTY bubbles by mode (the user, 2026-10-19: "혼자할때는 괜찮은데 비눗방울이 너무 쏘고 나서 오래남아있어서 좀
// 복잡해"): game.js EMPTY_RULE / emptyRule() / capEmpties(). One engine, virtual time, stepped through PG.debug in a
// lab room laid over round 1 / arena 1 (restored at the end):
//  - solo: life 720 + blink 120 exactly as before and no cap (ten of one player's bubbles all float);
//  - co-op (2-4 players): life 330 + blink 90, at most 7 floating empties per player and 14 in all; battle: 210 + 90,
//    3 each (a backstop: a battle player has 3 out in all - the 4th blow pops the oldest at once), 12 in all - one more that starts to float ends that player's oldest (all: the oldest of whoever has the
//    most): it blinks CAP_BLINK (30) frames, then goes by the plain self-pop at the life's end (421 / 301) - no score,
//    no chain (a bubble / a steam bubble right beside it stays), the other players' bubbles untouched;
//  - a bubble someone bounced on in the last 90 frames (RIDE_HOLD) is never the one a cap ends (the next-oldest goes);
//  - kit bubbles (the duck's echo, the frog's eggs) follow the same rule; a steam bubble keeps its own timer;
//  - the blink (drawing, plain and kit look) starts right after the rule's life;
//  - a co-op game down to one player runs the solo rule, a solo game joined by a second the co-op rule, the title demo solo.
// Online (a guest sees the same pops and the same blink): clutter-net.js. Measurements: review-mpbal.js exp=clutter.
//   node tools/run-chrome.js test-clutter.html - 900 760 60000
// Prints "CLUTTER PASS|FAIL <name>", "CLUTTER INFO ..." and "CLUTTER DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const J = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
  const t = (name, fn) => {
    let r;
    try { r = fn(); } catch (e) { r = 'threw ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e); }
    if (r === undefined || r === true) { pass++; log('CLUTTER PASS ' + name); } else { fail++; log('CLUTTER FAIL ' + name + ' :: ' + r); }
  };
  const info = (s) => log('CLUTTER INFO ' + s);
  window.addEventListener('error', (e) => { fail++; log('CLUTTER FAIL page error: ' + e.message + ' @' + e.lineno); });

  function run() {
    const D = PG.debug, G = D.G, LV = D.levels(), AR = D.arenas();
    const TS = 8, FLOOR = 16 + 25 * TS;
    try { PG.Audio.setMuted(true); } catch (e) { /* ignore */ }
    const release = () => { for (const k of ['left', 'right', 'jump', 'shoot']) for (let s = 0; s < 4; s++) D.press(k, false, s); };
    const step = (n) => { for (let i = 0; i < (n === undefined ? 1 : n); i++) D.step(1); };
    const P = (s) => G.players.find((q) => q.slot === (s | 0));
    // ---- the lab room over round 1 and arena 1: a flat floor (feet 216), restored at the end
    const L0 = LV[0], saved = { map: L0.map, player: L0.player, players: L0.players, gather: L0.gather, gapX: L0.gapX, enemies: L0.enemies, special: L0.special, boss: L0.boss };
    const A0 = AR[0], savedA = { map: A0.map, players: A0.players, enemySpawns: A0.enemySpawns, gather: A0.gather };
    const ROOM = []; for (let r = 0; r < 26; r++) ROOM.push(r === 0 || r === 25 ? '#'.repeat(32) : '##' + '.'.repeat(28) + '##');
    const SPAWNS = [{ col: 3, row: 24 }, { col: 27, row: 24 }, { col: 10, row: 24 }, { col: 20, row: 24 }];
    Object.assign(L0, { map: ROOM, player: SPAWNS[0], players: SPAWNS, gather: { col: 16, row: 3 }, gapX: 16 * 8, special: undefined, boss: null,
      enemies: [{ type: 'grime', col: 9, row: 24, dir: 1 }, { type: 'grime', col: 12, row: 24, dir: 1 }] });
    Object.assign(A0, { map: ROOM, players: SPAWNS, enemySpawns: [], gather: { col: 16, row: 3 } });
    // (the round's enemies wait off screen for ever: no capture, no round clear)
    const park = () => { for (const e of G.enemies) { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; } };
    const clean = () => { G.bubbles = []; G.items = []; G.pickup = null; G.stampT = 1e9; G.steamT = -1; G.words = []; G.ice = []; };
    const settle = () => { D.setInvincible(true); park(); step(2); park(); clean(); release(); };
    function solo(char) { D.seed(7); D.start(0, char); settle(); return P(0); }
    function coop(chars) { D.seed(7); D.local.coop(chars, 0); settle(); return G.players; }
    function battle(chars, perksOff) {
      D.seed(7); D.local.battle(chars, { arena: 0, countdown: false, perks: !perksOff, intrusion: false, monsters: false });
      if (G.battle) { G.battle.powerT = 1e9; G.battle.enemyT = 1e9; }
      settle(); for (const p of G.players) p.invuln = 0;
      return G.players;
    }
    // a body standing at x on the floor, facing that way, every move field cleared
    function put(p, x, facing) {
      Object.assign(p, { x, y: FLOOR - 16, vx: 0, vy: 0, onGround: true, facing: facing || 1, coyote: 0, jumpBuf: 0, airT: 0, mv: '', mvT: 0, mvUsed: false, mvCd: 0,
        glideT: 0, carry: false, hop: 0, hopAir: false, landT: 30, invuln: 0, stunT: 0, shootCd: 0, autoCd: 0, shootBuf: 0, water: 0, waterSkip: 0 });
    }
    // one press of BUBBLE for slot s -> the bubbles it blew
    function blow(s) {
      const n0 = G.seq;
      D.press('shoot', true, s | 0); step(1); D.press('shoot', false, s | 0);
      return G.bubbles.filter((b) => typeof b.id === 'number' && b.id > n0 && b.owner === (s | 0) && b.kind === 'empty');
    }
    const floating = (owner) => G.bubbles.filter((b) => !b.dead && b.kind === 'empty' && b.state === 'float' && (owner === undefined || b.owner === owner));
    const rule = () => D.emptyRule();
    const same = (a, b) => J(a) === J(b);
    const scores = () => [G.score].concat(G.players.map((p) => p.score)).join(',');
    // follow a bubble until it starts popping (or n frames): the age it popped at, its chain, and the scores before / after
    function popAge(b, n) {
      const s0 = scores();
      for (let i = 0; i < n && b.state !== 'pop' && !b.dead; i++) step(1);
      return { age: b.state === 'pop' ? b.age : -1, chain: b.chain, scoreSame: scores() === s0 };
    }
    // watch bubbles frame by frame (call w() after each step): when each started blinking (its age past the life) and how
    // old it really was then (frames since it was first watched + its age then), when it started popping and at what age
    function watcher(life) {
      const m = new Map();
      const w = (bs) => {
        for (const b of bs) {
          let r = m.get(b); if (!r) { r = { f0: G.frame - b.age, blinkF: -1, blinkReal: -1, popF: -1, popAge: -1, chain: null }; m.set(b, r); }
          if (r.blinkF < 0 && b.state === 'float' && b.age > life) { r.blinkF = G.frame; r.blinkReal = G.frame - r.f0; }
          if (r.popF < 0 && (b.state === 'pop' || b.dead)) { r.popF = G.frame; r.popAge = b.age; r.chain = b.chain; }
        }
      };
      w.of = (b) => m.get(b);
      return w;
    }
    const counted = (owner) => floating(owner).filter((b) => b.age <= rule().life);
    // is a bubble drawn blinking at this age: its box drawn on a frame without the blink phase vs one with it
    // ((G.frame >> 2) & 1 picks the faded frames); nothing else in the box depends on the frame number
    const cv = document.getElementById('pg-canvas'), rb = document.createElement('canvas');
    rb.width = 24; rb.height = 24;
    const cx = rb.getContext('2d', { willReadFrequently: true });
    function blinking(b, age) {
      const keep = G.frame, x = Math.max(0, Math.round(b.x) - 4), y = Math.max(0, Math.round(b.y) - 4);
      const box = () => { cx.clearRect(0, 0, 24, 24); cx.drawImage(cv, x, y, 24, 24, 0, 0, 24, 24); return Array.from(cx.getImageData(0, 0, 24, 24).data).join(','); };
      b.age = age; G.frame = 8; D.step(0); const a = box();
      b.age = age; G.frame = 12; D.step(0); const c = box();
      G.frame = keep;
      return a !== c;
    }

    // ================================================================ the rule by mode
    t('the rule: solo 720 + 120 no cap; co-op 330 + 90, 7 each, 14 in all; battle 210 + 90, 3 each, 12 in all; a capped bubble blinks 30', () => {
      solo('duck'); const s = rule();
      coop(['duck', 'capy']); const c2 = rule();
      coop(['duck', 'capy', 'otter', 'frog']); const c4 = rule();
      battle(['duck', 'capy']); const b2 = rule();
      battle(['duck', 'capy', 'otter', 'frog'], true); const b4 = rule();
      info('rules solo ' + J(s) + ' co-op ' + J(c2) + ' battle ' + J(b2));
      if (!same(s, { life: 720, flash: 120, cap: 0, all: 0, capBlink: 30 })) return 'solo ' + J(s);
      if (!same(c2, { life: 330, flash: 90, cap: 7, all: 14, capBlink: 30 }) || !same(c4, c2)) return 'co-op ' + J([c2, c4]);
      if (!same(b2, { life: 210, flash: 90, cap: 3, all: 12, capBlink: 30 }) || !same(b4, b2)) return 'battle ' + J([b2, b4]);
    });
    t('the rule follows the player count: solo + a joiner = co-op rule, co-op down to one = solo rule, the title demo = solo', () => {
      solo('duck'); const a = rule();
      D.local.addPlayer('capy', 'P2'); const b = rule();
      D.local.removePlayer(1); const c = rule();
      D.toTitle(); const d = rule(), mode = D.getState().mode;
      if (a.life !== 720 || b.life !== 330 || b.cap !== 7 || c.life !== 720 || c.cap !== 0 || d.life !== 720 || d.cap !== 0) return J({ a, b, c, d, mode });
    });

    // ================================================================ solo: exactly as before
    t('solo: a floating bubble lives 720 + 120 - pops by itself at age 841 (not before), no score', () => {
      const p = solo('penguin'); put(p, 24, 1);
      const b = blow(0)[0]; if (!b) return 'no bubble';
      step(40); if (b.state !== 'float') return 'not floating ' + b.state;
      put(p, 24, 1); b.age = 820;
      const r = popAge(b, 60);
      if (r.age !== 841 || r.chain || !r.scoreSame) return J(r);
    });
    t('solo: no cap - ten of one player\'s bubbles all float', () => {
      const p = solo('penguin'); put(p, 24, 1);
      let n = 0, pops = 0;
      for (let i = 0; i < 10; i++) { n += blow(0).length; step(21); put(p, 24, 1); }
      step(30);
      for (const b of G.bubbles) if (b.state === 'pop') pops++;
      const fl = floating(0).length;
      info('solo: blew ' + n + ', floating ' + fl + ', popping ' + pops);
      if (n !== 10 || fl !== 10 || pops) return J({ n, fl, pops });
    });
    t('solo: the blink starts after age 720 (plain look and the duck\'s kit look)', () => {
      const p = solo('duck'); put(p, 24, 1);
      const b = D.spawnBubble('empty', 120, 100); b.owner = 0; b.k = 0;
      const plain = [blinking(b, 720), blinking(b, 721)];
      b.k = 1; const kit = [blinking(b, 720), blinking(b, 721), blinking(b, 331)];
      if (plain[0] || !plain[1] || kit[0] || !kit[1] || kit[2]) return J({ plain, kit });
    });

    // ================================================================ co-op
    t('co-op: a floating bubble lives 330 + 90 - pops by itself at age 421 (not before), no score, no chain', () => {
      const [p0, p1] = coop(['penguin', 'capy']); put(p0, 24, 1); put(p1, 216, -1);
      const b = blow(0)[0]; if (!b) return 'no bubble';
      step(40); if (b.state !== 'float') return 'not floating ' + b.state;
      // a neighbour inside the chain distance and a steam bubble beside it: neither goes with it
      const nb = D.spawnBubble('empty', b.x + 10, b.y); nb.age = -2000;
      const st = D.spawnBubble('steam', b.x - 10, b.y);
      b.age = 400;
      const r = popAge(b, 60); step(14);
      if (r.age !== 421 || r.chain || !r.scoreSame) return J(r);
      if (nb.state !== 'float' || nb.dead || st.state !== 'float' || st.dead) return 'chained: ' + J([nb.state, st.state]);
    });
    t('co-op: the blink starts after age 330 (plain and kit look)', () => {
      coop(['duck', 'capy']);
      const b = D.spawnBubble('empty', 120, 100); b.owner = 1; b.k = 0;
      const plain = [blinking(b, 330), blinking(b, 331)];
      b.k = 2; const kit = [blinking(b, 330), blinking(b, 331)];
      if (plain[0] || !plain[1] || kit[0] || !kit[1]) return J({ plain, kit });
    });
    t('co-op: each player keeps at most 7 floating - the 8th and 9th end that player\'s two oldest: they blink 30 frames, then the plain self-pop at 421 (no score, no chain), the partner\'s stay', () => {
      const [p0, p1] = coop(['penguin', 'capy']); put(p0, 24, 1); put(p1, 216, -1);
      const theirs = [];
      for (let i = 0; i < 3; i++) { theirs.push(...blow(1)); step(16); put(p1, 216, -1); }
      const mine = [], w = watcher(330);
      let most = 0, mostAll = 0;
      const s0 = scores();
      const look = () => { w(mine); most = Math.max(most, counted(0).length); mostAll = Math.max(mostAll, floating(0).length); };
      for (let i = 0; i < 9; i++) {
        mine.push(...blow(0)); look();
        for (let k = 0; k < 21; k++) { step(1); look(); }
        put(p0, 24, 1);
      }
      for (let k = 0; k < 60; k++) { step(1); look(); }
      const gone = mine.filter((b) => b.dead || b.state === 'pop').map((b) => mine.indexOf(b));
      const ends = gone.map((i) => w.of(mine[i]));
      const left = floating(0).length, theirsOk = theirs.every((b) => !b.dead && b.state === 'float');
      info('co-op cap: mine ' + mine.length + ' blown, most floating ' + most + ' (+ blinking: ' + mostAll + '), ended #' + gone.join(',') + ' at real ages ' + ends.map((r) => r.blinkReal).join(',') +
        ', blinked ' + ends.map((r) => r.popF - r.blinkF).join(',') + ' f, popped at age ' + ends.map((r) => r.popAge).join(',') + ', partner\'s 3 ' + (theirsOk ? 'all floating' : 'NOT'));
      if (mine.length !== 9 || most !== 7 || mostAll > 9 || left !== 7 || J(gone) !== '[0,1]' || !theirsOk || scores() !== s0) return J({ most, mostAll, left, gone, theirsOk, s0, s1: scores() });
      // (ended long before the life: blink 30-31 frames, then the life's own self-pop)
      if (!ends.every((r) => r.blinkReal > 0 && r.blinkReal < 300 && r.popF - r.blinkF >= 30 && r.popF - r.blinkF <= 31 && r.popAge === 421 && !r.chain)) return J(ends);
    });
    t('co-op: a capped bubble is drawn blinking from the frame the cap ends it', () => {
      coop(['duck', 'capy']);
      const bs = [];
      for (let k = 0; k < 8; k++) { const b = D.spawnBubble('empty', 24 + k * 22, 60); b.owner = 0; b.k = 0; b.age = 100 - k; bs.push(b); }
      step(1);
      const b = bs[0], age = b.age;
      if (!(age > 330) || bs.slice(1).some((o) => o.age > 330)) return 'ages ' + J(bs.map((o) => o.age));
      const r = blinking(b, age); b.age = age;
      if (!r) return 'not blinking at age ' + age;
    });
    t('co-op: 4 players with 5 floating each (20) - all together keep 14: 6 end (the oldest of whoever has the most), blink, pop at 421 - no chain, no score', () => {
      coop(['duck', 'capy', 'otter', 'penguin']);
      // (the players stand far below; 20 owned floating empties near the top, ages 100..119 - the oldest first)
      const bs = [];
      for (let k = 0; k < 20; k++) { const b = D.spawnBubble('empty', 24 + (k % 10) * 20, 40 + Math.floor(k / 10) * 20); b.owner = k % 4; b.age = 119 - k; bs.push(b); }
      const st = D.spawnBubble('steam', 120, 60);
      const s0 = scores(), w = watcher(330);
      step(1); w(bs);
      const ended = bs.filter((b) => b.age > 330).map((b) => bs.indexOf(b)), early = bs.filter((b) => b.state === 'pop' || b.dead).length;
      for (let i = 0; i < 31; i++) { step(1); w(bs); }
      const popped = bs.filter((b) => b.state === 'pop' || b.dead).map((b) => bs.indexOf(b));
      step(14);
      const still = floating().length, chained = bs.filter((b, i) => i >= 6 && (b.dead || b.state !== 'float')).length;
      const ages = popped.map((i) => w.of(bs[i]).popAge);
      if (J(ended) !== '[0,1,2,3,4,5]' || early || J(popped) !== '[0,1,2,3,4,5]' || ages.some((a) => a !== 421) || still !== 14 || chained || st.dead || st.state !== 'float' || scores() !== s0)
        return J({ ended, early, popped, ages, still, chained, steam: st.state, s0, s1: scores() });
    });
    t('co-op: 4 players - three with 6 each and a quiet one with the 2 oldest of all: the 14 in all ends 2 of each busy one, never the quiet one\'s', () => {
      coop(['duck', 'capy', 'otter', 'penguin']);
      const bs = [];
      for (let k = 0; k < 18; k++) { const b = D.spawnBubble('empty', 24 + (k % 9) * 22, 40 + Math.floor(k / 9) * 22); b.owner = k % 3; b.age = 150 - k; bs.push(b); }
      const quiet = [0, 1].map((k) => { const b = D.spawnBubble('empty', 60 + k * 40, 100); b.owner = 3; b.age = 200 - k; return b; });
      step(1);
      const ended = bs.filter((b) => b.age > 330).map((b) => bs.indexOf(b));
      if (J(ended) !== '[0,1,2,3,4,5]' || quiet.some((b) => b.age > 330 || b.dead || b.state !== 'float')) return J({ ended, quiet: quiet.map((b) => [b.age, b.state]) });
    });
    t('co-op: 2 players never reach the 14 in all (7 + 7)', () => {
      coop(['duck', 'capy']);
      const bs = [];
      for (let k = 0; k < 14; k++) { const b = D.spawnBubble('empty', 24 + (k % 10) * 20, 40 + Math.floor(k / 10) * 22); b.owner = k % 2; b.age = 100 - k; bs.push(b); }
      step(1);
      if (floating().length !== 14 || bs.some((b) => b.age > 330)) return 'floating ' + floating().length + ' ages ' + J(bs.map((b) => b.age));
    });
    t('co-op: a bubble a partner bounces on is never the one the cap ends - the next-oldest goes; 90 frames after the bounce it can go', () => {
      const [p0, p1] = coop(['penguin', 'capy']); put(p0, 24, 1);
      // 7 of P1's floating: the oldest (age 200) alone in the middle, the others up at the top
      const ride = D.spawnBubble('empty', 120, 100); ride.owner = 0; ride.age = 200;
      const bs = [ride];
      for (let k = 1; k < 7; k++) { const b = D.spawnBubble('empty', 24 + k * 26, 30); b.owner = 0; b.age = 200 - k; bs.push(b); }
      // P2 falls onto it holding JUMP: a bounce
      Object.assign(p1, { x: ride.x, y: ride.y - 12, vx: 0, vy: 1, onGround: false, coyote: 0, jumpBuf: 0, airT: 10, mv: '', invuln: 0, stunT: 0 });
      D.press('jump', true, 1); step(1); D.press('jump', false, 1);
      const f0 = G.frame;
      if (!(p1.vy < 0) || ride.state !== 'float' || ride.dead || ride.rideF === undefined) return 'no bounce ' + J({ vy: p1.vy, st: ride.state, rideF: ride.rideF, f: G.frame });
      put(p1, 216, -1);
      // an 8th floats: the ridden oldest stays, the 2nd-oldest ends
      const b8 = D.spawnBubble('empty', 200, 30); b8.owner = 0; b8.age = 50; bs.push(b8);
      step(1);
      const a = bs.filter((b) => b.age > 330).map((b) => bs.indexOf(b));
      // (still within 90 frames of the bounce: a 9th ends the next-oldest again)
      while (G.frame - ride.rideF < 88) step(1);
      const b9 = D.spawnBubble('empty', 180, 30); b9.owner = 0; b9.age = 40; bs.push(b9);
      step(1);
      const b2 = bs.filter((b) => b.age > 330 || b.dead || b.state === 'pop').map((b) => bs.indexOf(b));
      // (past 90 frames: the oldest goes - the ridden one)
      while (G.frame - ride.rideF < 91) step(1);
      const b10 = D.spawnBubble('empty', 160, 30); b10.owner = 0; b10.age = 30; bs.push(b10);
      step(1);
      const c = ride.age > 330;
      info('co-op ride: bounce at frame ' + ride.rideF + ' (' + f0 + '); ended with the ride fresh ' + J(a) + ', then ' + J(b2) + ', past 90 frames the ridden one ' + (c ? 'ends' : 'stays'));
      if (J(a) !== '[1]' || J(b2) !== '[1,2]' || !c) return J({ a, b2, c, rideF: ride.rideF, f: G.frame });
    });
    t('co-op: the duck\'s echo (kit bubble) floats then pops by itself at age 421', () => {
      const [p0, p1] = coop(['duck', 'capy']); put(p0, 24, 1); put(p1, 216, -1);
      const b = blow(0)[0]; if (!b || b.ty !== 'echo') return 'no echo ' + (b && b.ty);
      put(p0, 216 - 40, -1); // (out of its way: it comes back to rest where the duck was)
      for (let i = 0; i < 120 && b.state === 'shot'; i++) step(1);
      if (b.state !== 'float') return 'echo ' + b.state + ' at ' + b.age;
      const r = popAge(b, 400);
      if (r.age !== 421 || r.chain || !r.scoreSame) return J(r);
    });
    t('co-op: the frog\'s eggs (kit bubble) - hanging eggs are not counted, floating ones keep to 7', () => {
      const [p0, p1] = coop(['frog', 'capy']); put(p0, 24, 1); put(p1, 216, -1);
      let most = 0, mostAll = 0, n = 0;
      const look = () => { most = Math.max(most, counted(0).length); mostAll = Math.max(mostAll, floating(0).length); };
      for (let i = 0; i < 10; i++) {
        n += blow(0).length;
        for (let k = 0; k < 13; k++) { step(1); look(); }
        put(p0, 24, 1);
      }
      for (let k = 0; k < 120; k++) { step(1); look(); }
      const hang = G.bubbles.filter((b) => !b.dead && b.owner === 0 && b.state === 'shot').length;
      info('co-op frog: ' + n + ' eggs blown, most floating ' + most + ' (+ blinking ' + mostAll + '), floating now ' + floating(0).length + ', hanging ' + hang);
      if (n !== 10 || most !== 7 || mostAll > 10) return J({ n, most, mostAll });
    });
    t('co-op: a steam bubble keeps its own timer (900 + 120)', () => {
      coop(['duck', 'capy']);
      const st = D.spawnBubble('steam', 120, 80); st.age = 1010;
      for (let i = 0; i < 20 && st.state !== 'pop'; i++) step(1);
      if (st.state !== 'pop' || st.age !== 1021) return st.state + ' ' + st.age;
    });

    // ================================================================ battle
    t('battle: a floating bubble lives 210 + 90 - pops by itself at age 301, no score; the blink starts after 210', () => {
      const [p0, p1] = battle(['penguin', 'capy']); put(p0, 24, 1); put(p1, 216, -1);
      const b = blow(0)[0]; if (!b) return 'no bubble';
      step(40); if (b.state !== 'float') return 'not floating ' + b.state;
      const blink = [blinking(b, 210), blinking(b, 211)];
      b.age = 280;
      const r = popAge(b, 60);
      if (r.age !== 301 || r.chain || !r.scoreSame || blink[0] || !blink[1]) return J({ r, blink });
    });
    // (the backstop alone, every blow allowed: the battle magazine off - game.js AMMO; with it on, just below)
    t('battle: a player has at most 3 out in all - the 4th..8th blow each pop the oldest at once (plain self-pop, no blink, no chain); 4 players keep 3 each / 12 in all (magazine off)', () => { D.ammo.off(true); try { return capAlone(); } finally { D.ammo.off(false); } });
    // the magazine on (AMMO): the cap is at least the magazine - a cat (4) keeps 4 out, the 5th blow (after its reload,
    // the first four still floating) pops its oldest at once; a penguin (2) is under the 3 anyway: its 3rd blow, after
    // a reload, pops nothing
    t('battle with the magazine: a cat keeps 4 out (cap = its magazine of 4), its 5th blow after the reload pops the oldest; a penguin (2) never reaches the cap', () => {
      const out = {};
      for (const c of ['cat', 'penguin']) {
        const [p0, p1] = battle([c, 'capy']); put(p0, 24, 1); put(p1, 216, -1);
        const k = D.ammo.kit(c), mine = [];
        let most = 0;
        const look = () => { most = Math.max(most, G.bubbles.filter((b) => !b.dead && b.owner === 0 && b.kind === 'empty' && !b.drop && (b.state === 'shot' || b.state === 'float')).length); };
        for (let i = 0; i < k[0] + 1; i++) {
          if (i === k[0]) for (let f = 0; f < k[1]; f++) { step(1); look(); put(p1, 216, -1); }
          mine.push(...blow(0)); look();
          for (let f = 0; f < 15; f++) { step(1); look(); }
          put(p0, 24, 1); put(p1, 216, -1);
        }
        const gone = mine.filter((b) => b.dead || b.state === 'pop').map((b) => mine.indexOf(b));
        out[c] = { blows: mine.length, most, gone, cap: D.ammo.of(0).cap };
      }
      info('magazine + cap: ' + J(out));
      if (out.cat.blows !== 5 || out.cat.cap !== 4 || out.cat.most !== 4 || J(out.cat.gone) !== '[0]') return J(out);
      if (out.penguin.blows !== 3 || out.penguin.cap !== 3 || out.penguin.most !== 3 || out.penguin.gone.length) return J(out);
    });
    function capAlone() {
      const [p0, p1] = battle(['penguin', 'capy']); put(p0, 24, 1); put(p1, 216, -1);
      const mine = [], w = watcher(210), s0 = scores(); let most = 0, out = 0;
      const look = () => { w(mine); most = Math.max(most, counted(0).length); out = Math.max(out, G.bubbles.filter((b) => !b.dead && b.owner === 0 && b.kind === 'empty' && (b.state === 'shot' || b.state === 'float')).length); };
      for (let i = 0; i < 8; i++) {
        mine.push(...blow(0)); look();
        for (let k = 0; k < 21; k++) { step(1); look(); }
        put(p0, 24, 1); put(p1, 216, -1);
      }
      for (let k = 0; k < 40; k++) { step(1); look(); }
      const gone = mine.filter((b) => b.dead || b.state === 'pop').map((b) => mine.indexOf(b)), ends = gone.map((i) => w.of(mine[i]));
      info('battle cap: ended #' + gone.join(',') + ' at ages ' + ends.map((r) => r.popAge).join(',') + ', blinked first ' + ends.map((r) => r.blinkF >= 0).join(',') + ', most out ' + out);
      if (mine.length !== 8 || most !== 3 || out !== 3 || J(gone) !== '[0,1,2,3,4]' || scores() !== s0) return J({ n: mine.length, most, out, gone, s0, s1: scores() });
      if (!ends.every((r) => r.blinkF < 0 && r.popAge >= 60 && r.popAge <= 70 && !r.chain)) return J(ends);
      battle(['duck', 'capy', 'otter', 'penguin']);
      const bs = [];
      for (let k = 0; k < 16; k++) { const b = D.spawnBubble('empty', 24 + (k % 8) * 26, 40 + Math.floor(k / 8) * 22); b.owner = k % 4; b.age = 115 - k; bs.push(b); }
      step(1);
      const ended = bs.filter((b) => b.age > 210).map((b) => bs.indexOf(b));
      for (let i = 0; i < 31; i++) step(1);
      const popped = bs.filter((b) => b.state === 'pop' || b.dead).map((b) => bs.indexOf(b));
      if (J(ended) !== '[0,1,2,3]' || J(popped) !== '[0,1,2,3]' || floating().length !== 12) return J({ ended, popped, floating: floating().length });
    }

    Object.assign(L0, saved); Object.assign(A0, savedA);
    log('CLUTTER DONE pass=' + pass + ' fail=' + fail);
  }
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G || !PG.debug.local) { setTimeout(go, 30); return; }
    try { run(); } catch (e) { fail++; log('CLUTTER FAIL driver error :: ' + (e && e.stack)); log('CLUTTER DONE pass=' + pass + ' fail=' + fail); }
  }
  go();
})();
