// v3 review fixes, local and deterministic (virtual time, several players in one engine via PG.debug.local):
// battle - a fresh prison cannot be popped at once (no same-frame KO; its trapper waits a second), two players shooting
// each other on the same frame are both caught (no slot-order win), blowing a bubble ends your own blink, the
// capybara's onsen shield takes a capture, everyone blinks after 시작!, the start spots swap every 한 판 더, a KO
// respawn avoids enemies, power-ups float down the middle, the intruder enters on the mirror axis, a stun at 0 points
// shows no phantom -100, outside animal ids never become an animal; co-op - the ghost stays within jumping reach and
// drifts to a partner, the revive reach, popping a partner's catch / a boss kill share the points, the hurry and
// the boss minions come sooner with more players, no "준비!" after the 3-2-1; UI - stacked name tags, my tag, hint chips.
// Prints "FIXES PASS|FAIL <name>" and "FIXES DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const t = (name, fn) => {
    let r;
    try { r = fn(); } catch (e) { r = 'threw ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e); }
    if (r === undefined || r === true) { pass++; log('FIXES PASS ' + name); } else { fail++; log('FIXES FAIL ' + name + ' :: ' + r); }
  };
  const TS = 8;
  function run() {
    const D = PG.debug, G = D.G, L = D.local;
    const release = () => { for (const k of ['left', 'right', 'jump', 'shoot']) for (let s = 0; s < 4; s++) D.press(k, false, s); };
    const P = (slot) => G.players.find((p) => p.slot === slot);
    const quiet = () => { for (const e of G.enemies) { e.state = 'descend'; e.delay = 1e9; e.t = 0; e.y = -300; e.startY = -300; } G.battle.enemyT = 1e9; G.battle.powerT = 1e9; };
    const put = (p, x, y, facing) => { Object.assign(p, { x, y, vx: 0, vy: 0, onGround: true, facing: facing || 1, invuln: 0, shootCd: 0, autoCd: 0, shootBuf: 0 }); };
    // a battle on 대중탕 한판 with the floor cleared of enemies; players on the bottom floor
    function battle(chars, opts) {
      D.seed(4242);
      L.battle(chars.map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), Object.assign({ arena: 0, intrusion: false }, opts || {}));
      D.setInvincible(true); release(); quiet();
      for (const p of G.players) p.invuln = 0;
    }
    const FLOOR = 24 * TS; // feet of a player standing on the bottom floor (row 24)

    t('battle: everyone blinks for 2.5 s after 시작!', () => {
      D.seed(1);
      L.battle(['duck', 'cat', 'frog', 'otter'].map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), { arena: 1, intrusion: false });
      const inv = G.players.map((p) => p.invuln);
      if (!inv.every((v) => v === 150)) return 'invuln ' + inv.join(',');
    });
    t('battle: the opening enemy wave lands a moment after 시작! (nobody is hit in the first 2 s)', () => {
      D.seed(2);
      L.battle(['duck', 'cat', 'frog', 'otter'].map((c, k) => ({ char: c, nick: 'P' + (k + 1) })), { arena: 1, intrusion: false });
      D.setInvincible(false); release();
      for (let f = 0; f < 120; f++) { D.step(1); if (G.players.some((p) => p.stunT > 0)) return 'stunned at frame ' + f; }
      if (!G.enemies.every((e) => e.state === 'descend')) return 'enemies active within 2 s: ' + G.enemies.map((e) => e.state).join(',');
    });
    t('battle: a point-blank capture is never a same-frame KO, and the trapper cannot pop its own prisoner for a second', () => {
      battle(['duck', 'cat']);
      const a = P(0), b = P(1);
      put(a, 100, FLOOR, 1); put(b, 114, FLOOR, -1);
      D.press('shoot', true, 0); D.step(1); D.press('shoot', false, 0);
      if (!b.trap) return 'not trapped';
      const bub = b.trap.b;
      // the trapper walks right into the prison for 50 frames: no KO
      D.press('right', true, 0);
      for (let f = 0; f < 50; f++) { a.x = bub.x; a.y = bub.y + 2; D.step(1); if (b.koT > 0) { release(); return 'KO by its own trapper after ' + f + ' frames'; } }
      release();
      if (!b.trap) return 'released early';
    });
    t('battle: anyone else can pop a prison only after its 15-frame grace', () => {
      battle(['duck', 'cat', 'frog']);
      const a = P(0), b = P(1), c = P(2);
      put(a, 60, FLOOR, 1); put(b, 74, FLOOR, -1); put(c, 160, FLOOR, -1);
      D.press('shoot', true, 0); D.step(1); D.press('shoot', false, 0);
      if (!b.trap) return 'not trapped';
      const bub = b.trap.b;
      for (let f = 0; f < 12; f++) { c.x = bub.x; c.y = bub.y + 2; c.vx = 0; c.vy = 0; D.step(1); if (b.koT > 0) return 'KO inside the grace at frame ' + f; }
      for (let f = 0; f < 30 && !(b.koT > 0); f++) { c.x = bub.x; c.y = bub.y + 2; c.vx = 0; c.vy = 0; D.step(1); }
      if (!(b.koT > 0)) return 'no KO after the grace';
      if (c.kos !== 1) return 'KO not credited to the popper';
    });
    t('battle: two players shooting each other on the same frame are both caught (no slot-order win)', () => {
      battle(['duck', 'cat']);
      const a = P(0), b = P(1);
      put(a, 100, FLOOR, 1); put(b, 114, FLOOR, -1);
      D.press('shoot', true, 0); D.press('shoot', true, 1); D.step(1); D.press('shoot', false, 0); D.press('shoot', false, 1);
      for (let f = 0; f < 12 && !(a.trap && b.trap); f++) D.step(1);
      if (!(a.trap && b.trap)) return 'trapped: P1 ' + !!a.trap + ' P2 ' + !!b.trap;
    });
    t('battle: blowing a bubble ends your own blink', () => {
      battle(['duck', 'cat']);
      const a = P(0);
      put(a, 60, FLOOR, 1); a.invuln = 150;
      D.press('shoot', true, 0); D.step(1); D.press('shoot', false, 0);
      if (a.invuln !== 0) return 'invuln ' + a.invuln;
    });
    t('battle: a blinking rival is not caught', () => {
      battle(['duck', 'cat']);
      const a = P(0), b = P(1);
      put(a, 100, FLOOR, 1); put(b, 114, FLOOR, -1); b.invuln = 100;
      D.press('shoot', true, 0); D.step(1); D.press('shoot', false, 0);
      for (let f = 0; f < 10; f++) D.step(1);
      if (b.trap) return 'caught while blinking';
    });
    t('battle: the capybara\'s onsen shield takes a capture (the bubble bursts, the shield is used up)', () => {
      battle(['duck', 'capy']);
      const a = P(0), b = P(1);
      put(a, 100, FLOOR, 1); put(b, 114, FLOOR, -1); b.shield = 120;
      D.press('shoot', true, 0); D.step(1); D.press('shoot', false, 0);
      for (let f = 0; f < 6; f++) D.step(1);
      if (b.trap) return 'trapped despite the shield';
      if (b.shield !== 0) return 'shield ' + b.shield;
      if (!(b.invuln > 0)) return 'no blink after the shield';
    });
    t('battle: a stun at 0 points shows no phantom -100', () => {
      battle(['duck', 'cat']);
      const a = P(0); a.score = 0; G.pops = [];
      D.hitPlayer(0);
      if (G.pops.some((q) => /-100/.test(q.txt))) return 'pop-ups ' + G.pops.map((q) => q.txt).join(',');
      if (!G.words.some((w) => w.txt === '어질!')) return 'no dizzy word';
      a.score = 250; G.pops = []; a.stunT = 0; a.invuln = 0;
      D.hitPlayer(0);
      if (!G.pops.some((q) => q.txt === '-100')) return 'no -100 when there were points: ' + G.pops.map((q) => q.txt).join(',');
    });
    t('battle: 한 판 더 swaps the floor and top start spots (mirror pairs stay together)', () => {
      battle(['duck', 'cat']);
      const A = D.arenas()[0];
      const at = (p, sp) => Math.abs(p.x - (sp.col * TS - 4)) < 1 && Math.abs(p.y - (sp.row + 1) * TS) < 1;
      if (!(at(P(0), A.players[0]) && at(P(1), A.players[1]))) return 'match 0 not on spawns 1/2';
      D.rematch();
      const A2 = D.arenas()[G.arena];
      if (!(at(P(0), A2.players[2]) && at(P(1), A2.players[3]))) return 'match 1 not on spawns 3/4: ' + [P(0).x, P(0).y, P(1).x, P(1).y].join(',');
    });
    t('battle: a KO respawn avoids a spawn with an enemy on it', () => {
      battle(['duck', 'cat']);
      const A = D.arenas()[0], b = P(1), a = P(0);
      put(a, 120, 13 * TS, 1);
      // the spawn farthest from P1 gets an enemy parked on it: the respawn must pick another one
      let far = null, fd = -1;
      for (const sp of A.players) { const d = Math.abs(a.x - (sp.col * TS - 4)) + Math.abs(a.y - (sp.row + 1) * TS); if (d > fd) { fd = d; far = sp; } }
      const e = G.enemies[0];
      Object.assign(e, { state: 'active', x: far.col * TS - 4, y: (far.row + 1) * TS, delay: 0, vx: 0, vy: 0, onGround: true });
      b.koT = 1; D.step(1);
      const onFar = Math.abs(b.x - (far.col * TS - 4)) < 1 && Math.abs(b.y - (far.row + 1) * TS) < 1;
      if (onFar) return 'respawned next to the enemy';
      if (b.invuln !== 150) return 'respawn blink ' + b.invuln;
    });
    t('battle: power-ups float down the middle of the arena', () => {
      const xs = [];
      for (let k = 0; k < 12; k++) {
        battle(['duck', 'cat']);
        G.pickup = null; G.battle.powerT = 1; D.step(1);
        if (!G.pickup) return 'no power-up spawned';
        xs.push(G.pickup.x + 8);
      }
      if (xs.some((x) => x < 13 * TS - 1 || x > 19 * TS + 1)) return 'x ' + xs.join(',');
    });
    t('battle: the 보스 난입 intruder enters centred on the mirror axis', () => {
      battle(['duck', 'cat']);
      const b = D.intrude('kingGrime');
      if (!b) return 'no intruder';
      if (Math.abs(b.x + 16 - 128) > 0.5) return 'body centre x ' + (b.x + 16);
    });
    t('outside animal ids never become an animal (constructor / __proto__ / toString)', () => {
      D.seed(3);
      L.battle([{ char: 'constructor', nick: 'a' }, { char: '__proto__', nick: 'b' }, { char: 'toString', nick: 'c' }], { arena: 0, intrusion: false });
      const cs = G.players.map((p) => p.char);
      if (!cs.every((c) => c === 'duck')) return 'chars ' + cs.join(',');
      if (D.setChar('constructor') || D.setChar('hasOwnProperty')) return 'setChar accepted a prototype key';
      if (D.mp.pickChar('valueOf')) return 'mp.pickChar accepted a prototype key';
    });
    t('co-op: a ghost rises only a little (stays in jumping reach) and drifts toward the standing partner', () => {
      D.seed(5);
      L.coop(['duck', 'cat'], 0);
      D.setInvincible(true); release();
      for (const e of G.enemies) { e.state = 'descend'; e.delay = 1e9; e.y = -300; }
      const a = P(0), b = P(1);
      put(a, 40, FLOOR, 1); put(b, 200, FLOOR, -1);
      D.hitPlayer(0);
      for (let f = 0; f < 45; f++) D.step(1);
      if (!a.ghost) return 'no ghost';
      const y0 = a.y, x0 = a.x;
      // the partner keeps away from it (so it cannot touch it) for nearly the whole 8 s
      for (let f = 0; f < 420; f++) { b.x = 200; b.y = FLOOR; b.vx = 0; D.step(1); }
      if (!a.ghost) return 'ghost ended early';
      if (y0 - a.y > 36.5) return 'rose ' + (y0 - a.y).toFixed(1) + ' px (more than 36)';
      if (y0 - a.y < 20) return 'barely rose: ' + (y0 - a.y).toFixed(1);
      if (!(a.x > x0 + 40)) return 'did not drift toward the partner: ' + x0.toFixed(0) + ' -> ' + a.x.toFixed(0);
      // a touch 11 px from its centre revives
      b.x = a.x + 8 - 2 - 12 - 10; b.y = a.y; D.step(1);
      if (a.ghost) { b.x = a.x - 21; b.y = a.y; D.step(1); }
      if (a.ghost || a.dead) return 'not revived within the 12 px reach';
    });
    t('co-op: popping a partner\'s catch shares it (60 % popper / 40 % trapper; the team score gets it all once)', () => {
      D.seed(11);
      L.coop(['duck', 'cat'], 0);
      D.setInvincible(true); release();
      for (const e of G.enemies) { e.state = 'descend'; e.delay = 1e9; e.y = -300; e.startY = -300; e.t = 0; }
      const a = P(0), b = P(1), e = G.enemies[0];
      put(a, 200, FLOOR, -1); put(b, 60, FLOOR, 1);
      D.step(2);
      Object.assign(e, { state: 'active', x: b.x + 34, y: b.y, vx: 0, vy: 0, onGround: true, angry: false, escaped: false, hopT: 999, delay: 0, spawnY: b.y, jumpCd: 999, chargeCd: 999, windT: 0, chargeT: 0, committed: false, soakT: 0, dir: 1, water: 0, grace: 0 });
      G.bubbles = [];
      D.press('shoot', true, 1); D.step(1); D.press('shoot', false, 1);
      for (let f = 0; f < 20 && e.state !== 'trapped'; f++) D.step(1);
      const bub = G.bubbles.find((q) => q.kind === 'trapped');
      if (!bub || bub.owner !== 1) return 'not trapped by P2: ' + e.state + ' owner ' + (bub && bub.owner);
      const sa = a.score, sb = b.score, team = G.score;
      put(b, 60, FLOOR, 1);
      a.x = bub.x; a.y = bub.y; a.vx = 0; a.vy = 0; D.step(2);
      if (e.state !== 'dead') return 'not popped: ' + e.state;
      const ga = a.score - sa, gb = b.score - sb;
      if (ga !== 300 || gb !== 200) return 'gains popper ' + ga + ' trapper ' + gb;
      if (G.score - team !== 500) return 'team +' + (G.score - team);
      if (a.kills !== 1 || b.kills !== 0) return 'kills ' + a.kills + '/' + b.kills;
    });
    t('co-op: a boss kill pays the burster 40 % plus an even share of the rest (team score unchanged)', () => {
      D.seed(12);
      L.coop(['duck', 'cat', 'frog'], 5);
      D.setInvincible(true); release();
      if (!G.boss) return 'no boss';
      const s0 = G.players.map((p) => p.score), team = G.score;
      G.boss.lastBy = P(1);
      D.killBoss();
      for (let f = 0; f < 80 && G.score === team; f++) D.step(1);
      const n = G.score - team, gain = G.players.map((p, i) => p.score - s0[i]);
      if (!(n > 0)) return 'no boss points';
      const each = Math.floor((n * 0.6) / 3 / 10) * 10;
      if (gain[0] !== each || gain[2] !== each || gain[1] !== n - 2 * each) return 'n ' + n + ' gains ' + gain.join(',');
      if (!(gain[1] > gain[0])) return 'burster not ahead';
    });
    t('co-op: the hurry comes 4 s sooner per extra player (solo keeps 30 s)', () => {
      D.seed(13);
      L.coop(['duck', 'cat', 'frog', 'otter'], 0);
      D.setInvincible(true); release();
      G.roundT = 1800 - 3 * 240 - 2; D.step(1);
      if (G.hurry) return 'hurry before 18 s';
      D.step(3);
      if (!G.hurry) return 'no hurry at 18 s with 4 players';
      D.seed(14);
      L.coop(['duck'], 0);
      D.setInvincible(true); release();
      G.roundT = 1800 - 10; D.step(5);
      if (G.hurry) return 'solo hurry before 30 s';
    });
    t('co-op: a boss sends its minions 12 % sooner per extra player (solo unchanged)', () => {
      const next = (chars) => {
        D.seed(15);
        L.coop(chars, 5);
        D.setInvincible(true); release();
        for (let f = 0; f < 900 && !(G.boss && G.boss.state === 'fight'); f++) D.step(1);
        const b = G.boss; if (!b || b.state !== 'fight') return 'no fight: ' + (b && b.state);
        b.minionT = 1; b.calm = 0; D.step(1);
        return { t: b.minionT, phase: b.phase };
      };
      const four = next(['duck', 'cat', 'frog', 'otter']), one = next(['duck']);
      if (typeof four === 'string') return four;
      if (typeof one === 'string') return one;
      const base = [0, 660, 570, 480][one.phase];
      if (one.t !== base) return 'solo interval ' + one.t + ' (want ' + base + ')';
      if (four.t !== Math.round([0, 660, 570, 480][four.phase] * 0.64)) return '4-player interval ' + four.t;
    });
    t('co-op: no "준비!" banner after the 3-2-1 (the round name shows at GO)', () => {
      D.seed(6);
      L.coop(['duck', 'cat'], 0, { countdown: true });
      D.setInvincible(true);
      const seen = new Set();
      for (let f = 0; f < 180 + 200; f++) { D.step(1); const bm = document.getElementById('pg-banner-main'); if (bm && !document.getElementById('pg-banner').hidden) seen.add(bm.textContent); }
      if (seen.has('준비!')) return 'banners ' + [...seen].join('|');
      if (![...seen].some((s) => s === D.levels()[0].name)) return 'round name never shown: ' + [...seen].join('|');
    });
    t('UI: name tags of animals standing together are stacked, not overlapping', () => {
      D.seed(7);
      L.coop(['duck', 'cat', 'frog', 'otter'], 0);
      D.setInvincible(true); release();
      for (const e of G.enemies) { e.state = 'descend'; e.delay = 1e9; e.y = -300; }
      for (let k = 0; k < 4; k++) put(P(k), 100 + k * 9, FLOOR, 1);
      D.step(1);
      const tags = [...document.querySelectorAll('#pg-tags .pg-tag')].filter((e) => !e.hidden).map((e) => e.getBoundingClientRect());
      if (tags.length !== 4) return tags.length + ' tags';
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        const a = tags[i], b = tags[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) return 'tags ' + i + ' and ' + j + ' overlap';
      }
    });
    t('UI: a ghost partner gets a "구해 줘!" chip, my own ghost tells me how to come back', () => {
      D.seed(8);
      L.coop(['duck', 'cat'], 0);
      D.setInvincible(true); release();
      for (const e of G.enemies) { e.state = 'descend'; e.delay = 1e9; e.y = -300; }
      put(P(0), 40, FLOOR, 1); put(P(1), 200, FLOOR, -1);
      P(1).local = false; // (as if P2 were another screen's player: P1 is "me")
      D.hitPlayer(1);
      for (let f = 0; f < 45; f++) D.step(1);
      const tips = () => [...document.querySelectorAll('#pg-tags .pg-tip')].filter((e) => !e.hidden).map((e) => e.textContent);
      if (!tips().includes('구해 줘!')) return 'partner ghost tips ' + tips().join('|');
      P(1).local = true;
      D.step(60);
      for (let f = 0; f < 480 && (P(1).ghost || P(1).dead); f++) D.step(1);
      D.hitPlayer(0);
      // (the partner keeps away, or its touch would bring me straight back)
      for (let f = 0; f < 45; f++) { put(P(1), 220, FLOOR, -1); D.step(1); }
      if (!tips().includes('친구가 닿으면 살아나요')) return 'my ghost tips ' + tips().join('|');
    });
    t('UI: my own trapped animal says "연타!"', () => {
      battle(['duck', 'cat']);
      put(P(0), 60, FLOOR, 1); put(P(1), 160, FLOOR, -1);
      D.trapPlayer(0, 1); D.step(1);
      const tips = [...document.querySelectorAll('#pg-tags .pg-tip')].filter((e) => !e.hidden).map((e) => e.textContent);
      if (!tips.includes('연타!')) return 'tips ' + tips.join('|');
    });
    D.setInvincible(false);
    release();
    log('FIXES DONE pass=' + pass + ' fail=' + fail);
  }
  function wait() { if (window.PG && PG.debug && PG.debug.local) setTimeout(run, 50); else setTimeout(wait, 30); }
  wait();
})();
