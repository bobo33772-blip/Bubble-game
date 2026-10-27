// 몬스터 출현 (design/distinction.md §3, pass D1) in ONE engine, virtual time, local players through PG.debug.
// Built to C:/Temp/bogeul/test-monsters.html:
//   node tools/run-chrome.js test-monsters.html - 900 760 120000
// Covers (§3.5): 1. off: no arena enemies at the start or later (600 f), the 1200 f power-up still drops, a trap + pop is
// still a 뽀득 KO (+500), the timer reaches the podium, the start banner says 몬스터 없음 (and 시작! does, after a 3-2-1
// that covers it), 한 판 더 keeps the setting;
// 2. off + 보스 난입: the 1:30 intruder arrives and summons nothing for 1500 f (each of the 4 bosses, plus a control with
// monsters ON and the arena emptied by hand that DOES summon - the trap of §3.3), the queen's landed spores wither,
// bursting the intruder after direct bubble hits pays +1500; 3. default (no key): the opening wave drops in after
// BATTLE_OPEN_DELAY and refills, as before; 5. backward: PG.debug.mp.guestRoom(R) reads o[5] (missing / 'x' / 1 = on,
// 0 = off); and the friends panel's option row (between 능력 끄기 and 보스 난입, checked by default, the change handler).
// Prints "MON PASS|FAIL <name>", "MON INFO ..." and "MON DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  window.addEventListener('error', (e) => { fail++; log('MON FAIL page error: ' + e.message + ' @' + e.lineno); });
  function t(name, fn) {
    let r;
    try { r = fn(); } catch (e) { r = 'exception ' + (e && e.message) + ' @ ' + String((e && e.stack) || '').split('\n')[1]; }
    if (r === undefined || r === true) { pass++; log('MON PASS ' + name); } else { fail++; log('MON FAIL ' + name + ': ' + r); }
  }
  const J = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };

  function run() {
    const D = PG.debug, G = D.G, S = () => D.getState();
    const P = (slot) => G.players.find((p) => p.slot === slot);
    const step = (n) => D.step(n === undefined ? 1 : n);
    const until = (cond, max) => { for (let i = 1; i <= max; i++) { step(1); if (cond()) return i; } return -1; };
    const releaseAll = () => { for (let s = 0; s < 4; s++) for (const a of ['left', 'right', 'jump', 'shoot']) D.press(a, false, s); };
    const live = () => G.enemies.filter((e) => e.state !== 'dead').length;
    const C4 = ['duck', 'cat', 'frog', 'penguin'];
    function battle(opts, seed) {
      D.seed(seed || 41); D.local.battle(C4, Object.assign({ arena: 0 }, opts || {})); D.setInvincible(true); releaseAll();
    }
    // a capture-phase bubble of `slot` right on the boss (a direct hit: it lathers on the next update)
    function hitBoss(slot) {
      const b = G.boss, bb = D.spawnBubble('empty', b.x + 8, b.y + 8);
      Object.assign(bb, { state: 'shot', shotT: 20, vx: 0, vy: 0, owner: slot, ty: 'line', k: 0 });
    }

    // ================================================================== 1. off
    t('off: no enemies at 시작!, none after 600 f; the banner says 몬스터 없음', () => {
      battle({ monsters: false, intrusion: false });
      if (G.opts.monsters !== false) return 'G.opts ' + J(G.opts);
      if (G.enemies.length) return 'at the start ' + G.enemies.length;
      const sub = G.banner && G.banner.sub;
      if (sub !== '배틀 · 3분 · 몬스터 없음') return 'banner sub ' + J(sub);
      let most = 0;
      for (let f = 0; f < 600; f++) { step(1); most = Math.max(most, G.enemies.length); }
      if (most || G.enemies.length) return 'enemies seen ' + most;
    });
    t('with the 3-2-1 (every online start): the arena banner is covered by "3", so 시작! says 몬스터 없음; on: no sub', () => {
      const go = (opts) => {
        battle(Object.assign({ intrusion: false, countdown: true }, opts));
        if (until(() => S().phase === 'playing', 400) < 0) return null;
        return G.banner ? G.banner.main + '|' + G.banner.sub : '';
      };
      const off = go({ monsters: false }), on = go({});
      if (off !== '시작!|몬스터 없음' || on !== '시작!|') return J({ off, on });
    });
    t('off: the arena power-up still drops (by 1300 f)', () => {
      battle({ monsters: false, intrusion: false });
      let seen = null;
      for (let f = 0; f < 1300 && !seen; f++) { step(1); if (G.pickup) seen = { f, type: G.pickup.type }; }
      if (!seen) return 'no pickup by 1300 f';
      if (seen.f < 1190) return 'too early ' + seen.f;
      log('MON INFO pickup ' + seen.type + ' at ' + seen.f + ' f');
    });
    t('off: a rival trapped and popped by a third player: kos 1, +500 (player vs player as before)', () => {
      battle({ monsters: false, intrusion: false }, 43);
      for (const p of G.players) p.invuln = 0;
      step(30);
      const p2 = P(1), p3 = P(2);
      if (!D.trapPlayer(1, 0)) return 'could not trap';
      const b = p2.trap.b, s3 = p3.score;
      let n = 0;
      while (!S().players[1].ko && n < 40) { D.setPlayer(b.x, b.y, 2); step(1); n++; }
      if (!S().players[1].ko || p3.kos !== 1 || p3.score - s3 !== 500) return J({ ko: S().players[1].ko, kos: p3.kos, gain: p3.score - s3 });
      if (G.enemies.length) return 'enemies ' + G.enemies.length;
    });
    t('off: setTimeLeft(0) reaches the podium; 한 판 더 keeps 몬스터 출현 off', () => {
      battle({ monsters: false, intrusion: false });
      step(10); D.setTimeLeft(0); step(3);
      if (S().phase !== 'podium') return 'phase ' + S().phase;
      D.rematch();
      if (G.opts.monsters !== false || G.enemies.length) return 'rematch ' + J({ opts: G.opts, n: G.enemies.length });
      // (한 판 더 runs the 3-2-1 first: well past it, still nobody)
      step(400);
      if (S().phase !== 'playing' || G.enemies.length) return 'rematch ' + J({ ph: S().phase, n: G.enemies.length });
    });

    // ================================================================== 2. off + 보스 난입
    t('off + 보스 난입: the 1:30 intruder arrives and summons nothing for 1500 f', () => {
      battle({ monsters: false, intrusion: true }, 47);
      step(20); D.setTimeLeft(91);
      const n = until(() => !!G.boss, 120);
      if (n < 0 || !G.boss.intruder) return 'no intruder ' + n;
      let most = 0, fought = false;
      for (let f = 0; f < 1500; f++) { step(1); most = Math.max(most, G.enemies.length); if (G.boss && G.boss.state === 'fight') fought = true; }
      log('MON INFO intruder ' + (G.boss ? G.boss.type : '(gone)') + ' fought ' + fought);
      if (!fought) return 'the intruder never fought';
      if (most) return 'enemies ' + most;
    });
    for (const type of ['kingGrime', 'moldQueen', 'megaSponge', 'towelKing']) {
      t('off: ' + type + ' as the intruder: no minion in 1500 f (minionCap 0)', () => {
        battle({ monsters: false, intrusion: false }, 50 + type.length);
        step(20);
        if (!D.intrude(type)) return 'no intruder';
        let most = 0, fights = 0;
        for (let f = 0; f < 1500; f++) { step(1); most = Math.max(most, G.enemies.length); if (G.boss && G.boss.state === 'fight') fights++; }
        if (fights < 600) return 'fought only ' + fights + ' f';
        if (most) return 'minions ' + most;
      });
    }
    t('control: monsters ON with the arena emptied by hand -> the intruder DOES summon (why minionCap matters, §3.3)', () => {
      battle({ intrusion: false }, 61);
      G.enemies = []; G.battle.enemyT = 1e9;
      step(5);
      if (!D.intrude('kingGrime')) return 'no intruder';
      let most = 0;
      for (let f = 0; f < 1500; f++) { step(1); G.battle.enemyT = 1e9; most = Math.max(most, live()); }
      if (!(most >= 2)) return 'minions ' + most;
      log('MON INFO control: up to ' + most + ' minions');
    });
    t('off: the 곰팡이 여왕\'s landed spores wither (no mold hatches)', () => {
      battle({ monsters: false, intrusion: false }, 67);
      step(20);
      if (!D.intrude('moldQueen')) return 'no intruder';
      let landed = new Set(), ripe = 0, most = 0;
      for (let f = 0; f < 1500; f++) {
        for (const h of G.hazards) if (h.kind === 'spore' && h.state === 'land' && !h.dead) { landed.add(h.id); if (h.hatch === 179) ripe++; }
        step(1); most = Math.max(most, G.enemies.length);
      }
      log('MON INFO spores landed ' + landed.size + ', ripe ' + ripe);
      if (!ripe) return 'no spore reached its hatch (landed ' + landed.size + ')';
      if (most) return 'molds ' + most;
    });
    t('off: bursting the intruder after direct bubble hits pays +1500 to the burster', () => {
      battle({ monsters: false, intrusion: false }, 71);
      step(20);
      if (!D.intrude('kingGrime')) return 'no intruder';
      if (until(() => G.boss && G.boss.state === 'fight', 400) < 0) return 'never fought';
      const b = G.boss, need = b.soapMax;
      let shots = 0;
      while (G.boss && G.boss.state === 'fight' && shots < 30) { hitBoss(0); shots++; step(1); }
      if (!G.boss || G.boss.state !== 'stun' || !G.boss.giant) return 'not sealed ' + J({ st: G.boss && G.boss.state, soap: G.boss && G.boss.soap, need, shots });
      if (shots !== need) return 'lathered by ' + shots + ' hits, soapMax ' + need;
      const g = G.boss.giant, p2 = P(1), s2 = p2.score;
      D.setPlayer(g.x + 12, g.y + 12, 1); step(1);
      if (p2.score - s2 !== 1500 || G.boss.state !== 'defeat') return 'burst gain ' + (p2.score - s2) + ' state ' + (G.boss && G.boss.state);
      if (G.enemies.length) return 'enemies ' + G.enemies.length;
    });

    // ================================================================== 3. default
    t('default (no monsters key): the opening wave drops in after BATTLE_OPEN_DELAY and refills', () => {
      battle({ intrusion: false });
      if (G.opts.monsters !== true) return 'G.opts ' + J(G.opts);
      if (!(G.enemies.length >= 1 && G.enemies.length <= 6)) return 'opening wave ' + G.enemies.length;
      if (G.banner && G.banner.sub !== '배틀 · 3분') return 'banner sub ' + J(G.banner.sub);
      if (G.enemies.some((e) => e.delay < 75)) return 'delays ' + G.enemies.map((e) => e.delay).join();
      step(70);
      if (G.enemies.some((e) => e.state === 'active')) return 'active before the delay';
      if (until(() => G.enemies.some((e) => e.state === 'active'), 200) < 0) return 'nobody came';
      const n0 = live();
      G.enemies.forEach((e) => { e.state = 'dead'; });
      G.enemies = [];
      if (until(() => live() > 0, 200) < 0) return 'no respawn after ' + n0;
    });
    t('the four arenas: off = 0 enemies after 300 f, on = some', () => {
      const out = [];
      for (let a = 0; a < D.arenas().length; a++) {
        battle({ arena: a, monsters: false, intrusion: false }, 80 + a); step(300); const off = G.enemies.length;
        battle({ arena: a, intrusion: false }, 80 + a); step(300); const on = live();
        out.push(a + ':' + off + '/' + on);
        if (off || !on) return out.join(' ');
      }
      log('MON INFO arenas off/on ' + out.join(' '));
    });
    t('co-op is untouched by a monsters-off battle before it (minionCap is battle-only)', () => {
      battle({ monsters: false, intrusion: false });
      step(10);
      D.local.coop(['duck', 'cat'], 0); D.setInvincible(true);
      step(200);
      if (!(G.enemies.length > 0)) return 'co-op round has no enemies';
    });

    // ================================================================== 5. backward (o[5] from older / hostile hosts)
    t('guestRoom: o of length 5 (an older host) -> monsters on; o[5] = 0 -> off; junk / 1 -> on; other options intact', () => {
      const mp = D.mp;
      const R = (o) => ({ gid: 1, ph: 'room', m: 'b', o, p: [[0, '방장', 'duck', 1, 10], [1, '친구', 'cat', 0, 10]] });
      const r5 = mp.guestRoom(R([1, 5, 0, 0, 0]));
      const r0 = mp.guestRoom(R([1, 5, 1, 1, 0, 0]));
      const rx = mp.guestRoom(R([1, 5, 1, 1, 0, 'x']));
      const r1 = mp.guestRoom(R([1, 5, 1, 1, 0, 1]));
      const rn = mp.guestRoom(R([1, 5, 1, 1, 0, null]));
      const rf = mp.guestRoom(R([1, 5, 1, 1, 0, false]));
      const got = [r5, r0, rx, r1, rn, rf].map((o) => o && o.monsters);
      if (got.join() !== 'true,false,true,true,true,true') return 'monsters ' + J(got);
      if (!(r5.time === 5 && r5.perks === false && r5.intrusion === false && r0.perks === true && r0.intrusion === true)) return 'others ' + J([r5, r0]);
      // (and it leaves this page's own state alone: no session, nothing kept)
      const st = mp.state();
      if (st.roster.length || st.opts.monsters !== true || st.opts.time !== 3) return 'state ' + J({ r: st.roster, o: st.opts });
    });
    t('netSetOpts: monsters false -> off, anything else -> on (the wire itself, R.o[5], is monsters-net)', () => {
      const mp = D.mp;
      mp.setOpts({ monsters: false });
      const off = mp.state().opts.monsters;
      mp.setOpts({ monsters: 'yes' });
      const junk = mp.state().opts.monsters;
      mp.setOpts({ monsters: true });
      if (off !== false || junk !== true || mp.state().opts.monsters !== true) return J([off, junk, mp.state().opts.monsters]);
    });

    // ================================================================== the option row (friends panel)
    t('friends panel: 몬스터 출현 sits between 능력 끄기 / 연사 and 보스 난입, checked by default; unticking sets NET.opts', () => {
      D.mp.openFriends();
      const box = document.getElementById('pg-host-opts');
      if (!box) return 'no #pg-host-opts';
      // (the shown labels: the party's 판 수 row is hidden outside a party room - design/party.md 7.6)
      const labels = Array.from(box.children).filter((e) => e.tagName === 'SPAN' && !e.hidden).map((e) => e.textContent);
      if (labels.join('|') !== '경기장|시간|능력 끄기|연사|몬스터 출현|보스 난입|트로피 걸기') return 'labels ' + labels.join('|');
      const c = box.querySelector('[data-opt="monsters"]'), room = document.querySelector('#pg-room-opts [data-opt="monsters"]');
      if (!c || !room) return 'checkbox missing ' + J([!!c, !!room]);
      if (room.id !== 'pg-room-opts-monsters') return 'room id ' + room.id;
      if (!c.checked) return 'not checked by default';
      if (c.parentElement.textContent !== '경기 내내 때 몬스터가 나와요') return 'sub ' + c.parentElement.textContent;
      if (c.id !== 'pg-host-opts-monsters') return 'id ' + c.id;
      c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true }));
      if (D.mp.state().opts.monsters !== false) return 'untick -> ' + D.mp.state().opts.monsters;
      // (and the other switches still map the same way: 능력 끄기 checked = perks off, 보스 난입 checked = on)
      const pk = box.querySelector('[data-opt="perks"]'), it = box.querySelector('[data-opt="intrusion"]');
      pk.checked = true; pk.dispatchEvent(new Event('change', { bubbles: true }));
      it.checked = false; it.dispatchEvent(new Event('change', { bubbles: true }));
      const o1 = D.mp.state().opts;
      pk.checked = false; pk.dispatchEvent(new Event('change', { bubbles: true }));
      it.checked = true; it.dispatchEvent(new Event('change', { bubbles: true }));
      c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
      const o2 = D.mp.state().opts;
      if (!(o1.perks === false && o1.intrusion === false && o1.monsters === false && o2.perks === true && o2.intrusion === true && o2.monsters === true)) return J([o1, o2]);
      // (syncOpts mirrors NET.opts back into both boxes)
      D.mp.setOpts({ monsters: false });
      if (c.checked) return 'syncOpts left it checked';
      D.mp.setOpts({ monsters: true });
      if (!c.checked) return 'syncOpts back';
    });
    // ================================================================== 연사 (game.js RAPID: R.o[6], the room option)
    t('연사 guestRoom: o of length 6 (an older host) -> off; o[6] = 1 -> on; 0 / junk / true / "1" -> off; the others intact', () => {
      const mp = D.mp;
      const R = (o) => ({ gid: 1, ph: 'room', m: 'b', o, p: [[0, '방장', 'duck', 1, 10], [1, '친구', 'cat', 0, 10]] });
      const rs = [[1, 5, 0, 0, 0], [1, 5, 1, 1, 0, 0], [1, 5, 1, 1, 0, 1, 1], [1, 5, 1, 1, 0, 1, 0], [1, 5, 1, 1, 0, 1, 'x'], [1, 5, 1, 1, 0, 1, true], [1, 5, 1, 1, 0, 1, '1'], [1, 5, 1, 1, 0, 1, 2], [1, 5, 1, 1, 0, 0, 1, 9]].map((o) => mp.guestRoom(R(o)));
      const got = rs.map((o) => o && o.rapid);
      if (got.join() !== 'false,false,true,false,false,false,false,false,true') return 'rapid ' + J(got);
      if (!(rs[2].monsters === true && rs[2].time === 5 && rs[2].perks === true && rs[8].monsters === false && rs[1].monsters === false)) return 'others ' + J([rs[2], rs[8], rs[1]]);
      if (mp.state().opts.rapid !== false) return 'state ' + J(mp.state().opts);
    });
    t('연사 netSetOpts: only true -> on (default off); the battle reads G.opts.rapid only from true', () => {
      const mp = D.mp;
      if (mp.state().opts.rapid !== false) return 'default ' + mp.state().opts.rapid;
      mp.setOpts({ rapid: true }); const on = mp.state().opts.rapid;
      mp.setOpts({ rapid: 'yes' }); const junk = mp.state().opts.rapid;
      mp.setOpts({ rapid: true }); mp.setOpts({ rapid: false });
      if (on !== true || junk !== false || mp.state().opts.rapid !== false) return J([on, junk, mp.state().opts.rapid]);
      battle({ rapid: true, intrusion: false }); const a = G.opts.rapid;
      battle({ intrusion: false }); const b = G.opts.rapid;
      if (a !== true || b !== false) return 'G.opts ' + J([a, b]);
    });
    t('연사 friends panel: the row (unticked by default, sub 장전 없이 계속 쏴요), ticking sets NET.opts.rapid, syncOpts mirrors it back (the room box: monsters-net)', () => {
      D.mp.openFriends();
      const c = document.querySelector('#pg-host-opts [data-opt="rapid"]'), room = document.querySelector('#pg-room-opts [data-opt="rapid"]');
      if (!c || !room) return 'checkbox missing ' + J([!!c, !!room]);
      if (c.id !== 'pg-host-opts-rapid' || room.id !== 'pg-room-opts-rapid') return 'ids ' + J([c.id, room.id]);
      if (c.checked) return 'checked by default';
      if (c.parentElement.textContent !== '장전 없이 계속 쏴요') return 'sub ' + c.parentElement.textContent;
      c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
      if (D.mp.state().opts.rapid !== true) return 'tick -> ' + D.mp.state().opts.rapid;
      c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true }));
      if (D.mp.state().opts.rapid !== false) return 'untick -> ' + D.mp.state().opts.rapid;
      D.mp.setOpts({ rapid: true }); if (!c.checked) return 'syncOpts left it unticked';
      D.mp.setOpts({ rapid: false }); if (c.checked) return 'syncOpts back';
    });
    t('the new strings are in the font warm-up', () => {
      const fw = document.querySelector('#pg-fontwarm .pg-fw-body');
      const txt = fw ? fw.textContent : '';
      const miss = ['몬스터 출현', '경기 내내 때 몬스터가 나와요', '몬스터 없음', '몬스터 없이 친구끼리만 겨뤄요', '연사', '장전 없이 계속 쏴요', '연사: 장전 없이 계속 쏴요 · 내 거품은 3개까지, 더 쏘면 먼저 쏜 거품이 터져요'].filter((s) => txt.indexOf(s) < 0);
      if (miss.length) return 'missing ' + miss.join(', ');
    });

    log('MON DONE pass=' + pass + ' fail=' + fail);
  }
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G || !PG.debug.local || !PG.debug.mp) return setTimeout(go, 30);
    setTimeout(() => {
      try { run(); } catch (e) { log('MON FAIL exception ' + e.message + ' ' + String(e.stack || '').split('\n')[1]); log('MON DONE pass=' + pass + ' fail=' + (fail + 1)); }
    }, 60);
  }
  go();
})();
