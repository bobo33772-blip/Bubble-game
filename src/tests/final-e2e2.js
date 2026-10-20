// Final independent v2 verification (built to C:/Temp/bogeul/test-final-e2e2.html). Runs through PG.debug.step,
// so it works under virtual time:
//   node tools/run-chrome.js test-final-e2e2.html - 900 760 120000
//   no hash : start from the title button -> rounds 1-5 cleared through PG.debug (trap / chain pop, 뽀득 combo
//             sums, 세신 bonus, snacks collected, stamp rewards, a 도장 거품 popped by the duck, power-up pickup)
//             with every door transition timed -> boss 1 fought through all 3 HP segments (a real bubble shot,
//             soapBoss, a 거품 폭탄, stunBoss, and every giant bubble burst by steering the duck into it with
//             PG.debug.press only) -> doors -> round 6 -> gotoRound(23) final boss beaten the same way -> ending ->
//             2회차; then deaths (boss keeps its HP, scald drop, enemy) -> game over -> restart; then a 6000-frame
//             random-input soak over water and boss rounds (no exceptions, no NaN, everything inside the
//             playfield). Logs "E2E2 PASS/FAIL ..." and "E2E2 DONE pass=N fail=M".
//   #water  #cold  #boss  #stun  #final  #ending : screenshot scenes (log "E2E2 SHOT READY").
//   #soak<seed> : only the 6000-frame soak, with another seed (e.g. #soak77).
(function () {
  'use strict';
  const TAG = 'E2E2';
  let pass = 0, fail = 0, pageErrors = 0;
  const fails = [];
  window.addEventListener('error', (e) => { pageErrors++; console.log(TAG + ' page error: ' + e.message + ' @' + e.lineno); });
  const ok = (name, cond, info) => {
    if (cond) { pass++; console.log(TAG + ' PASS ' + name); } else { fail++; fails.push(name); console.log(TAG + ' FAIL ' + name + (info !== undefined ? ': ' + info : '')); }
    return !!cond;
  };
  const note = (s) => console.log(TAG + ' INFO ' + s);
  const $ = (id) => document.getElementById(id);
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const OLD_NAME = String.fromCharCode(0xbf40, 0xae00); // the retired v1 title syllables (kept out of this file)
  const PF_TOP = 16, PF_BOT = 224, WALL_L = 16, WALL_R = 240, TS = 8;
  const BOSS_NUM = { kingGrime: 1, moldQueen: 2, megaSponge: 3, towelKing: 4 };
  const BOSS_NAME = { kingGrime: '왕때꼬마', moldQueen: '곰팡이 여왕', megaSponge: '대왕 수세미', towelKing: '이태리 타올 대마왕' };
  const BOSS_SOAP = { kingGrime: 8, moldQueen: 10, megaSponge: 12, towelKing: 14 };

  let D, G, LV, S;
  const sfxLog = [], musicLog = [];
  const seenBanners = [];
  function hookAudio() {
    const A = PG.Audio; if (!A || A.__e2e2) return;
    const s0 = A.sfx, m0 = A.music;
    A.sfx = function (n) { sfxLog.push(n); return s0.apply(this, arguments); };
    A.music = function (t) { musicLog.push(t); return m0.apply(this, arguments); };
    A.__e2e2 = true;
  }
  const sfxSince = (mark, name) => sfxLog.slice(mark).indexOf(name) >= 0;
  let lastBannerId = -1;
  function noteBanner() { const b = G.banner; if (b && b.id !== lastBannerId) { lastBannerId = b.id; seenBanners.push(b.main + '|' + b.sub); } }
  const step = (n) => { for (let i = 0; i < (n === undefined ? 1 : n); i++) { D.step(1); noteBanner(); } };
  const until = (cond, max) => { for (let i = 1; i <= max; i++) { D.step(1); noteBanner(); if (cond()) return i; } return -1; };
  const release = () => { for (const k of ['left', 'right', 'jump', 'shoot']) D.press(k, false); };
  const bannerSince = (mark, re) => seenBanners.slice(mark).some((x) => re.test(x));
  const waterCount = (L) => L.map.join('').replace(/[^~=]/g, '').length;
  const solid = (L, c, r) => (c < 0 || c > 31 ? true : L.map[((r % 26) + 26) % 26][c] === '#');
  const comboBase = (k) => Math.min(5000, 500 * k);
  const earnedStamps = () => G.stamps + 10 * sfxLog.filter((n) => n === 'ticket').length;

  // ------------------------------------------------------------------ helpers
  // 뽀득 combo: what D.popAll() should score (bubbles popped in list order, one chain)
  function expectedPopAll() {
    let k = 0, s = 0, stamp = 0, soaked = 0, last = 0;
    for (const b of G.bubbles) {
      if (b.dead || b.state === 'pop') continue;
      if (b.kind === 'trapped' && b.enemy) { k++; last = comboBase(k) * (b.soaked ? 2 : 1); s += last; if (b.soaked) soaked++; }
      else if (b.kind === 'empty') s += 10;
      else if (b.kind === 'stamp') stamp++;
    }
    return { k, s, stamp, soaked, last };
  }
  // a column with nothing between the ceiling and the floor (and floor under it, not the drain)
  function clearColumn(L) {
    for (let c = 2; c <= 29; c++) {
      let clear = L.map[25][c] === '#';
      for (let r = 1; r <= 24 && clear; r++) if (L.map[r][c] !== '.') clear = false;
      if (clear) return c;
    }
    return -1;
  }
  // the duck's top y when standing on the first platform top at or below row r0 in column c (or null)
  function standRow(L, c, r0, rows) {
    for (let r = Math.max(2, r0); r < Math.min(26, r0 + rows); r++) {
      if (solid(L, c, r) && !solid(L, c, r - 1) && !solid(L, c, r - 2)) return r;
    }
    return -1;
  }
  // put the duck on a platform near the giant bubble but NOT touching it, so it has to walk / jump into it
  function placeNearGiant(L) {
    const g = G.boss.giant, gx = g.x + 20, gy = g.y + 20;
    const r0 = Math.max(2, Math.ceil((gy - PF_TOP) / TS));
    for (const off of [34, -34, 28, -28, 40, -40, 22, -22]) {
      const cx = gx + off; if (cx < WALL_L + 8 || cx > WALL_R - 8) continue;
      const c = Math.floor(cx / TS), r = standRow(L, c, r0, 8);
      if (r < 0) continue;
      // the shelf must run on under the bubble (no falling off on the way)
      const cg = Math.floor(gx / TS); let flat = true;
      for (let k = Math.min(c, cg); k <= Math.max(c, cg); k++) if (!(solid(L, k, r) && !solid(L, k, r - 1))) flat = false;
      if (!flat) continue;
      const x = cx - 8, y = PF_TOP + r * TS - 16;
      const dx = Math.max(x + 2, Math.min(gx, x + 14)) - gx, dy = Math.max(y + 2, Math.min(gy, y + 16)) - gy;
      if (dx * dx + dy * dy < 21 * 21) continue; // would already touch it
      D.setPlayer(x, y); G.p.onGround = true;
      return 'shelf row ' + r + ' offset ' + off;
    }
    // any shelf within jumping reach below it, beside it (the duck jumps across to it)
    for (const off of [24, -24, 32, -32, 16, -16, 40, -40]) {
      const cx = gx + off; if (cx < WALL_L + 8 || cx > WALL_R - 8) continue;
      const c = Math.floor(cx / TS), r = standRow(L, c, r0, 5);
      if (r < 0) continue;
      const x = cx - 8, y = PF_TOP + r * TS - 16;
      const dx = Math.max(x + 2, Math.min(gx, x + 14)) - gx, dy = Math.max(y + 2, Math.min(gy, y + 16)) - gy;
      if (dx * dx + dy * dy < 21 * 21) continue;
      D.setPlayer(x, y); G.p.onGround = true;
      return 'short shelf row ' + r + ' offset ' + off;
    }
    // fallback: right under it on whatever floor is below
    const c = Math.floor(gx / TS), r = standRow(L, c, r0, 24);
    if (r >= 0) { D.setPlayer(gx - 8, PF_TOP + r * TS - 16); return 'fallback under it (row ' + r + ')'; }
    return 'no placement';
  }
  // steer the duck into the giant bubble with inputs only; frames used, or -1 if it got away
  function chaseGiant(max) {
    let held = false;
    for (let f = 1; f <= max; f++) {
      const b = G.boss;
      if (!b || b.state !== 'stun' || !b.giant) { release(); return f - 1; }
      const g = b.giant, p = G.p, gx = g.x + 20, gy = g.y + 20, dx = gx - (p.x + 8);
      D.press('right', dx > 3); D.press('left', dx < -3);
      const above = gy + 17 < p.y + 4;
      const want = above && Math.abs(dx) < 34;
      if (want && p.onGround && !held) { D.press('jump', true); held = true; }
      else if (held && (p.onGround || !want)) { D.press('jump', false); held = false; }
      step(1);
    }
    release();
    return G.boss && G.boss.state === 'stun' ? -1 : max;
  }
  function realBurst(tag, L) {
    const b = G.boss, num = BOSS_NUM[b.type];
    ok(tag + ' sealed in the giant bubble (soap full)', b.state === 'stun' && !!b.giant && b.soap === b.soapMax && S().boss.state === 'stun', JSON.stringify(S().boss));
    const how = placeNearGiant(L);
    const hp0 = b.hp, sc0 = G.score, m = sfxLog.length;
    const f = chaseGiant(235);
    const s = S().boss;
    ok(tag + ' duck steered into the giant bubble bursts it (' + how + ', ' + f + ' f)', f > 0 && s.hp === hp0 - 1 && s.soap === 0, 'f=' + f + ' ' + JSON.stringify(s));
    ok(tag + ' burst: boss_damage sfx + ' + 2000 * num + ' pts', sfxSince(m, 'boss_damage') && G.score - sc0 >= 2000 * num, 'gain ' + (G.score - sc0));
    if (hp0 > 1) ok(tag + ' knocked down (harmless) after the burst', s.state === 'down', s.state);
    else ok(tag + ' last segment -> defeat', s.state === 'defeat', s.state);
    return f;
  }
  // stand the duck on the boss's own shelf, ~40 px away and facing it, then blow one real bubble at it
  function realShotAtBoss(tag, L) {
    const b = G.boss;
    const feetRow = Math.round((b.y + 32 - PF_TOP) / TS);
    let placed = false;
    for (const side of [-1, 1]) {
      const x = side < 0 ? b.x - 40 : b.x + 32 + 24;
      if (x < WALL_L || x > WALL_R - 16) continue;
      const c = Math.floor((x + 8) / TS);
      if (!(solid(L, c, feetRow) && !solid(L, c, feetRow - 1))) continue;
      D.setPlayer(x, PF_TOP + feetRow * TS - 16); G.p.onGround = true; G.p.facing = -side;
      placed = true; break;
    }
    if (!ok(tag + ' duck placed on the boss shelf for a real shot', placed, 'boss ' + b.x + ',' + b.y)) return;
    // minions out of the line of fire (a bubble would trap a minion first)
    for (const e of G.enemies) if (e.state === 'active') { e.x = b.x + 16 < 128 ? WALL_R - 20 : WALL_L + 4; e.y = PF_TOP + 16; e.vy = 0; }
    const soap0 = b.soap, nb = G.bubbles.length;
    D.press('shoot', true); step(1); D.press('shoot', false);
    const f = until(() => G.boss.soap > soap0 || G.boss.state !== 'fight', 30);
    ok(tag + ' a real bubble shot pops on the boss: +1 soap, never traps it', f > 0 && G.boss.soap === soap0 + 1 && G.boss.state === 'fight' && G.bubbles.length <= nb + 1 && !G.bubbles.some((q) => q.kind === 'trapped' && q.enemy === G.boss), 'f=' + f + ' soap ' + soap0 + '->' + G.boss.soap + ' state ' + G.boss.state);
  }
  function bombCheck(tag) {
    // 거품 폭탄: a trapped minion popped while touching the boss adds +3 soap
    const b = G.boss;
    const e = G.enemies.find((q) => q.state === 'active');
    if (!ok(tag + ' minions spawned by the boss', !!e, 'enemies ' + G.enemies.length)) return;
    // trap the minions, put one trapped bubble against the boss and the others far away
    D.trapAll();
    const tbs = G.bubbles.filter((q) => q.kind === 'trapped' && q.enemy);
    const tb = tbs.find((q) => q.enemy === e) || tbs[0];
    if (!ok(tag + ' minion trapped in a bubble', !!tb, 'state ' + e.state)) return;
    for (const q of tbs) if (q !== tb) { q.x = b.x + 16 < 128 ? WALL_R - 20 : WALL_L + 4; q.y = PF_TOP + 12; }
    tb.x = b.x + 8; tb.y = b.y + 8;
    const soap0 = G.boss.soap, m = seenBanners.length;
    // the duck touches just that bubble (it pops on the boss)
    D.setPlayer(tb.x, tb.y); step(1);
    ok(tag + ' 거품 폭탄: trapped minion popped on the boss = +3 soap', G.boss.soap === Math.min(G.boss.soapMax, soap0 + 3) && bannerSince(m, /^거품 폭탄!/), 'soap ' + soap0 + '->' + G.boss.soap + ' banners ' + seenBanners.slice(m).join(','));
  }
  // wait (invincible) for the boss to be in its fight, on the ground for a ground boss
  // (the final boss: right after a swoop, while it recovers down at the duck's level)
  function waitSettled(max) {
    return until(() => G.boss && G.boss.state === 'fight' && (G.boss.type === 'towelKing' ? G.boss.act === 'recover' : G.boss.def.fly || (G.boss.onGround && G.boss.act === 'rest')), max);
  }

  // ------------------------------------------------------------------ the full run
  function run() {
    D = PG.debug; G = D.G; LV = D.levels(); S = () => D.getState();
    hookAudio();
    // ---- title, rename, artifact contract (the page as built)
    ok('boots into the title (attract) screen', G.mode === 'title' && G.attract && !$('pg-title').hidden && $('pg-pause').hidden && $('pg-over').hidden && $('pg-ending').hidden);
    ok('GAME_NAME constant + <title> + brand + logo', PG.GAME_NAME === '뽀득뽀득 목욕탕' && document.title === '뽀득뽀득 목욕탕' &&
      $('pg-head').textContent.indexOf('뽀득뽀득 목욕탕') >= 0 && document.querySelector('.pg-logo').textContent.indexOf('뽀득뽀득 목욕탕') >= 0, document.title);
    const html = document.documentElement.innerHTML;
    ok('the retired v1 title appears nowhere in the page', html.indexOf(OLD_NAME) < 0);
    ok('no external scripts / only Google Fonts links', !document.querySelector('script[src]') &&
      [...document.querySelectorAll('link[href]')].every((l) => /^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(l.href)));
    ok('24 entries, bosses at 5/11/17/23 with soap 8/10/12/14', LV.length === 24 && LV.filter((L) => L.boss).length === 4 &&
      [5, 11, 17, 23].every((i, k) => LV[i].boss === ['kingGrime', 'moldQueen', 'megaSponge', 'towelKing'][k] && LV[i].bossSpawn));
    ok('at least 6 normal rounds have pools', LV.filter((L) => !L.boss && waterCount(L) > 0).length >= 6, LV.filter((L) => !L.boss && waterCount(L) > 0).length);
    const tA = sfxLog.length; step(90);
    ok('attract mode plays silently and leaves score at 0', G.mode === 'title' && sfxLog.length === tA && G.score === 0);

    // ---- start through the real title button
    D.seed(4242);
    $('pg-start').click(); step(1);
    ok('시작하기 starts 1번째 탕', G.mode === 'playing' && G.round === 0 && G.lives === 4 && G.score === 0 && G.stamps === 0 && $('pg-title').hidden && G.loop === 0);
    D.setInvincible(true);

    let stampBubblePopped = 0, powerPicked = null;
    for (let i = 0; i < 5; i++) {
      const L = LV[i], tag = 'R' + (i + 1);
      ok(tag + ' arrives: ' + L.name, G.round === i && (G.mode === 'playing' || G.mode === 'transition') && !!G.banner && G.banner.main === L.name && G.banner.sub.indexOf((i + 1) + '번째 탕') >= 0, G.banner && G.banner.main + '/' + G.banner.sub);
      if (G.mode === 'transition') until(() => G.mode === 'playing', 120);
      const s = S();
      ok(tag + ' getState: water ' + waterCount(L) + ', no boss/ice/drops', s.water === waterCount(L) && s.boss === null && s.ice === 0 && s.drops === 0 && fin(s.stamps), JSON.stringify({ w: s.water, ice: s.ice, d: s.drops }));
      const m0 = seenBanners.length;
      until(() => G.introT > 82 && G.enemies.length && G.enemies.every((e) => e.state === 'active'), 400);
      ok(tag + ' 준비! banner after the round name', bannerSince(m0, /^준비!\|/), seenBanners.slice(-3).join(','));
      ok(tag + ' music main', G.music === 'main', G.music);
      // a 도장 거품 that rose out of the drain this round: the duck touches it
      const sb = G.bubbles.find((b) => b.kind === 'stamp' && b.state === 'float');
      if (sb) {
        const e0 = earnedStamps(); D.setPlayer(sb.x, sb.y); step(1);
        if (ok(tag + ' duck pops a 도장 거품 = +1 stamp', earnedStamps() === e0 + 1, e0 + '->' + earnedStamps())) stampBubblePopped++;
      }
      if (i === 2) {
        // play on (invincible) until the next 도장 거품 rises from the drain: ~20 s of play since the last one
        const t0 = G.stampT;
        const live = (q) => q.kind === 'stamp' && q.state === 'float' && !q.dead;
        const f = until(() => G.bubbles.some(live), t0 + 5);
        const b = G.bubbles.find(live);
        ok(tag + ' 도장 거품 rises from the drain on its ~20 s timer', f > 0 && b && Math.abs(b.x + 8 - (LV[i].gapX || 128)) < 24 && b.y > PF_BOT - 40, 'f=' + f + ' t0=' + t0 + (b ? ' at ' + b.x.toFixed(0) + ',' + b.y.toFixed(0) : ''));
        ok(tag + ' next 도장 거품 timer is ~20 s (1100-1300 f)', G.stampT >= 1090 && G.stampT <= 1300, G.stampT);
        if (b) { const e0 = earnedStamps(); D.setPlayer(b.x, b.y); step(1); if (ok(tag + ' duck pops it = +1 stamp', earnedStamps() === e0 + 1)) stampBubblePopped++; }
      }
      if (i === 0) coldChecks(tag);
      if (i === 4) hotChecks(tag);
      // trap everyone and pop the lot as ONE chain
      D.trapAll(); step(2);
      if (i === 4) {
        // soak one trapped enemy (as if it waded in the hot tub) to check the x2 score
        const tb = G.bubbles.find((b) => b.kind === 'trapped' && b.enemy);
        if (tb) tb.soaked = true;
      }
      const exp = expectedPopAll();
      const sc0 = G.score, e0 = earnedStamps(), mP = G.pops.length;
      D.popAll();
      const gain = G.score - sc0;
      ok(tag + ' 뽀득 combo: ' + exp.k + ' kills score ' + exp.s + ' (500k each, cap 5000' + (exp.soaked ? ', soaked x2' : '') + ')', exp.k > 0 && gain === exp.s, 'gain ' + gain);
      if (exp.k >= 2) {
        const pp = G.pops.slice(mP).find((q) => q.combo === 'x' + exp.k);
        ok(tag + ' popup shows "x' + exp.k + '" over ' + exp.last + ' points', !!pp && pp.txt === String(exp.last), pp ? pp.combo + ' ' + pp.txt : 'none');
      }
      ok(tag + ' chain of ' + exp.k + (exp.k >= 3 ? ' (3+) = +1 stamp' : ' (<3) = no stamp') + (exp.stamp ? ' (+1 stamp bubble)' : ''), earnedStamps() - e0 === (exp.k >= 3 ? 1 : 0) + exp.stamp, (earnedStamps() - e0));
      const dropped = G.pickup ? G.pickup.type : null;
      if (dropped) ok(tag + ' power-up drop only from a 2+ chain', exp.k >= 2);
      // clear: 세신 bonus, +1 stamp for no deaths
      const e1 = earnedStamps(), sc1 = G.score;
      const fc = until(() => G.clearT >= 0, 400);
      const lb = G.lastBonus || {};
      ok(tag + ' cleared with 세신 보너스 = max(0, 60 - ' + lb.secs + ' s) x 100 = ' + lb.bonus, fc > 0 && lb.bonus === Math.max(0, 60 - lb.secs) * 100 && lb.secs === Math.floor(G.roundClock / 60) && G.score - sc1 >= lb.bonus, JSON.stringify(lb));
      ok(tag + ' clear banner shows the bonus', !!G.banner && G.banner.main === '청소 완료!' && G.banner.sub.indexOf('세신 보너스 +' + lb.bonus.toLocaleString('ko-KR')) === 0, G.banner && G.banner.sub);
      ok(tag + ' no-death clear = +1 stamp', earnedStamps() - e1 === 1, earnedStamps() - e1);
      if (G.pickup && dropped) {
        // the power-up the chain dropped drifts down; the duck touches it
        step(20);
        if (G.pickup) {
          const k = G.pickup, m = sfxLog.length;
          D.setPlayer(k.x, k.y); step(1);
          const pw = S().power;
          ok(tag + ' dropped power-up (' + k.type + ') used on touch', !G.pickup && sfxSince(m, 'powerup') && (k.type === 'bathbomb' ? true : pw && pw.type === k.type && pw.framesLeft > 700), JSON.stringify(pw));
          powerPicked = k.type;
        }
      }
      // snacks: the knocked-out enemies land as items; the duck grabs two of them
      let grabbed = 0;
      for (let f = 0; f < 200 && grabbed < 2 && G.mode === 'playing'; f++) {
        const it = G.items.find((q) => q.onGround && q.age > 12);
        if (!it) { step(1); continue; }
        const v = it.value, s0 = G.score;
        D.setPlayer(it.x, it.y); step(1);
        if (G.items.indexOf(it) < 0 && G.score - s0 >= v) grabbed++;
        else { ok(tag + ' snack pickup scores', false, 'value ' + v + ' gain ' + (G.score - s0)); break; }
      }
      ok(tag + ' snacks dropped and collected (' + grabbed + ')', grabbed >= 1);
      // door transition to the next entry
      const stampT0 = G.stampT, m1 = sfxLog.length, mB = seenBanners.length;
      const ft = until(() => G.mode === 'transition', 400);
      ok(tag + ' doors start closing (door sfx)', ft > 0 && sfxSince(m1, 'door') && G.trans && G.trans.door < 0.2, 'f=' + ft);
      const doors = [];
      const fs = until(() => { doors.push(G.trans ? G.trans.door : -1); return !!(G.trans && G.trans.swapped); }, 60);
      const mono = doors.slice(0, 29).every((d, k) => k === 0 || d >= doors[k - 1]);
      ok(tag + ' doors slide shut in 0.5 s, next round built behind them', fs === 31 && mono && doors[29] === 1 && G.round === i + 1 && G.p.x === Math.max(14, Math.min(226, LV[i + 1].player.col * 8 - 4)), 'fs=' + fs + ' round ' + G.round);
      ok(tag + ' banner names the next round while shut', !!G.banner && G.banner.main === LV[i + 1].name && G.banner.sub.indexOf((i + 2) + '번째 탕') >= 0 && !$('pg-banner').hidden && $('pg-banner-main').textContent === LV[i + 1].name, G.banner && G.banner.main);
      ok(tag + ' 도장 거품 timer carries across rounds', G.stampT === stampT0, stampT0 + ' -> ' + G.stampT);
      const fh = until(() => G.trans && G.trans.door < 1, 60);
      ok(tag + ' doors stay shut ~0.6 s', fh === 36, fh);
      const fo = until(() => G.mode === 'playing' && !G.trans, 60);
      ok(tag + ' doors slide open in 0.5 s on the new round', fo === 29 && !G.p.dead, fo);
      void mB;
    }
    note('power-up picked in rounds 1-5: ' + (powerPicked || 'none') + ', stamp bubbles popped: ' + stampBubblePopped + ', stamps ' + G.stamps + ', lives ' + G.lives + ', score ' + G.score);
    ok('at least one 도장 거품 popped in rounds 1-5', stampBubblePopped >= 1);
    ok('free-entry tickets: lives 4 + tickets', G.lives === 4 + sfxLog.filter((n) => n === 'ticket').length, 'lives ' + G.lives);

    // ---- boss 1 (index 5)
    bossFull(5, true);
    // ---- doors -> round 6 (index 6)
    {
      const L = LV[6];
      ok('after boss 1: doors open on round 6 (' + L.name + ')', G.round === 6 && (G.mode === 'transition' || G.mode === 'playing') && G.boss === null && !!G.banner && G.banner.main === L.name, G.round + ' ' + G.mode);
      until(() => G.mode === 'playing', 120);
      const m = seenBanners.length;
      until(() => G.introT > 82, 200);
      ok('round 6: 준비! and main music after the victory jingle', bannerSince(m, /^준비!\|/) && G.music === 'main', G.music + ' ' + seenBanners.slice(m).join(','));
      ok('round 6: HUD state normal (no boss, hurry, scald)', S().boss === null && !G.hurry && !G.scald && G.enemies.length === L.enemies.length);
    }
    // ---- the other bosses: soap gauges, music
    for (const i of [11, 17]) {
      D.gotoRound(i); until(() => G.boss.state === 'fight', 300);
      const b = S().boss;
      ok('boss ' + LV[i].boss + ' soapMax ' + BOSS_SOAP[LV[i].boss] + ', music boss', b.soapMax === BOSS_SOAP[LV[i].boss] && b.hp === 3 && G.music === 'boss' && b.state === 'fight', JSON.stringify(b) + ' ' + G.music);
      D.killAll(); step(1);
      ok('killAll defeats ' + LV[i].boss, G.boss.state === 'defeat');
    }
    // ---- final boss via gotoRound(23)
    D.gotoRound(23);
    bossFull(23, false);
    // ---- ending -> 2회차
    ok('ending overlay after the final boss', G.mode === 'ending' && !$('pg-ending').hidden && G.music === 'ending' && $('pg-ending').textContent.indexOf('청소했어요') >= 0, G.mode + ' ' + G.music);
    ok('ending shows the score', +$('pg-end-score').textContent.replace(/[^0-9]/g, '') === G.score, $('pg-end-score').textContent + ' vs ' + G.score);
    ok('ending offers 2회차', $('pg-end-next').textContent.indexOf('2회차') >= 0);
    const scoreEnd = G.score;
    $('pg-end-next').click(); step(2);
    ok('2회차 starts at 1번째 탕 keeping the score', G.mode === 'playing' && G.loop === 1 && G.round === 0 && G.score >= scoreEnd && !!G.banner && G.banner.sub.indexOf('2회차 · 1번째 탕') === 0 && $('pg-ending').hidden, G.mode + ' loop ' + G.loop + ' ' + (G.banner && G.banner.sub));
    until(() => G.enemies.length && G.enemies.every((e) => e.state === 'active'), 400);
    ok('2회차 enemies faster (loopMul 1.25)', Math.abs(G.loopMul - 1.25) < 1e-9, G.loopMul);

    deathsAndGameOver();
    pauseAndTicket();
    soak(6000);

    // audio names used are all defined
    const known = new Set(PG.Audio._sfxNames || []), songs = new Set(Object.keys(PG.Audio._songs || {}));
    const badSfx = [...new Set(sfxLog)].filter((n) => !known.has(n));
    const badMus = [...new Set(musicLog)].filter((t) => t !== null && t !== undefined && !songs.has(t));
    ok('every sfx / music the run asked for exists in audio.js', !badSfx.length && !badMus.length, 'sfx ' + badSfx.join(',') + ' music ' + badMus.join(','));
    for (const n of ['door', 'stamp', 'boss_hit', 'boss_stun', 'boss_damage', 'boss_roar', 'shockwave', 'splash', 'scald_warn', 'powerup'])
      ok('sfx "' + n + '" heard during the run', sfxLog.indexOf(n) >= 0);
    for (const t of ['main', 'boss', 'final', 'victory', 'ending', 'hurry', 'gameover', 'clear'])
      ok('music "' + t + '" played during the run', musicLog.indexOf(t) >= 0);
    ok('no uncaught page errors', pageErrors === 0, pageErrors);
    console.log(TAG + ' DONE pass=' + pass + ' fail=' + fail + (fails.length ? ' failed: ' + fails.join(' ; ') : ''));
  }

  // full boss fight. withExtras: real bubble shot, partial soap, 거품 폭탄 on boss 1
  function bossFull(idx, withExtras) {
    const L = LV[idx], type = L.boss, tag = 'BOSS' + BOSS_NUM[type] + ' ' + type, num = BOSS_NUM[type];
    if (G.mode === 'transition') {
      ok(tag + ' doors open on the boss arena', G.round === idx && G.banner && G.banner.main === L.name && G.banner.sub.indexOf((idx + 1) + '번째 탕') >= 0, G.banner && G.banner.main);
      until(() => G.mode === 'playing', 120);
    }
    ok(tag + ' arena loaded: boss in its intro, no placed enemies, water ' + waterCount(L), G.round === idx && G.boss && G.boss.type === type && G.boss.state === 'intro' && S().water === waterCount(L) && G.enemies.length === 0, G.boss && G.boss.state);
    const mB = seenBanners.length, deaths0 = G.roundDeaths;
    ok(tag + ' boss enters the fight', until(() => G.boss.state === 'fight', 300) > 0);
    const music = type === 'towelKing' ? 'final' : 'boss';
    ok(tag + ' "' + BOSS_NAME[type] + ' 등장!" banner + ' + music + ' music', bannerSince(mB, new RegExp('^' + BOSS_NAME[type] + ' 등장!\\|')) && G.music === music, seenBanners.slice(mB).join(',') + ' / ' + G.music);
    let s = S().boss;
    ok(tag + ' getState().boss shape', s && s.type === type && s.hp === 3 && s.soap === 0 && s.soapMax === BOSS_SOAP[type] && s.state === 'fight' && fin(s.x) && fin(s.y), JSON.stringify(s));
    // no hurry / scald in a boss arena
    G.roundT = 2790; step(20);
    ok(tag + ' no hurry / 샤워기 고장 in a boss round', !G.hurry && !G.scald && G.drops.length === 0, 'hurry ' + G.hurry + ' scald ' + G.scald);
    G.roundT = 0;
    const sc0 = G.score, e0 = earnedStamps();
    let maxMinions = 0, sawWave = false, sawDouble = false, sawMitt = false, sawSweep = false, sawDrop = false;
    const watch = () => {
      maxMinions = Math.max(maxMinions, G.enemies.filter((e) => e.state !== 'dead').length);
      if (G.hazards.some((h) => h.kind === 'wave')) sawWave = true;
      if (G.boss && G.boss.second) sawDouble = true;
      if (G.hazards.some((h) => h.kind === 'mitt')) sawMitt = true;
      if (G.hazards.some((h) => h.kind === 'sweep')) sawSweep = true;
      if (G.drops.length) sawDrop = true;
    };
    const fight = (n, stop) => { for (let i = 0; i < n; i++) { step(1); watch(); if (stop && stop()) return i + 1; } return -1; };
    for (let hp = 3; hp >= 1; hp--) {
      const ph = 4 - hp;
      if (G.boss.state === 'down') {
        const m = seenBanners.length;
        ok(tag + ' gets up angrier: phase ' + ph, until(() => G.boss.state === 'fight', 140) > 0 && G.boss.phase === ph && bannerSince(m, new RegExp(BOSS_NAME[type] + ' 분노!')), 'phase ' + G.boss.phase);
      }
      // let the phase play out a while (invincible duck) to see its attacks
      if (type === 'kingGrime') {
        if (ph === 1) ok(tag + ' landing sends shockwaves', fight(400, () => sawWave) > 0);
        if (ph === 3) ok(tag + ' phase 3 double hops', fight(500, () => sawDouble) > 0);
        if (ph === 1) ok(tag + ' spawns minions (cap 4)', fight(400, () => maxMinions >= 2) > 0 && maxMinions <= 4, maxMinions);
      } else if (type === 'towelKing') {
        if (ph === 1) ok(tag + ' rains mini scrub-mitts', fight(700, () => sawMitt) > 0);
        if (ph === 2) ok(tag + ' phase 2 row sweeps', fight(900, () => sawSweep) > 0);
        if (ph === 3) ok(tag + ' phase 3 breaks the shower (scald drops)', fight(500, () => sawDrop) > 0);
        if (ph === 1) ok(tag + ' spawns mixed minions (cap 4)', fight(500, () => maxMinions >= 2) > 0 && maxMinions <= 4, maxMinions);
      }
      ok(tag + " settles for the next hit (" + G.boss.act + ")", waitSettled(900) > 0 || G.boss.state === "fight", G.boss.act);
      if (withExtras && hp === 3) {
        realShotAtBoss(tag, L);
        const s1 = D.soapBoss(2);
        ok(tag + ' soapBoss(2) adds 2 soap hits', s1 && s1.soap === 3 && s1.state === 'fight', JSON.stringify(s1));
        bombCheck(tag);
        const s2 = D.stunBoss();
        ok(tag + ' stunBoss() seals it at once', s2 && s2.state === 'stun' && s2.soap === s2.soapMax, JSON.stringify(s2));
      } else {
        const need = G.boss.soapMax - G.boss.soap;
        const s1 = D.soapBoss(need - 1);
        ok(tag + ' soap ' + (need - 1) + '/' + G.boss.soapMax + ' is not yet a stun', s1 && s1.state === 'fight' && s1.soap === G.boss.soapMax - 1, JSON.stringify(s1));
        const m = sfxLog.length;
        const s2 = D.soapBoss(1);
        ok(tag + ' the last soap hit seals it (boss_stun sfx)', s2 && s2.state === 'stun' && sfxSince(m, 'boss_stun'), JSON.stringify(s2));
      }
      ok(tag + ' giant bubble shown (sprite 40x40 around the boss)', !!G.boss.giant && Math.abs(G.boss.giant.x + 20 - (G.boss.x + 16)) <= 2);
      realBurst(tag + ' hp' + hp, L);
      watch();
    }
    // defeat: foam explosion, points, stamps, banner, victory
    const mB2 = seenBanners.length;
    until(() => G.boss && G.boss.state === 'defeat' && G.boss.t >= 49, 120);
    const eB = earnedStamps(), scB = G.score;
    ok(tag + ' defeat explosion (giant foam)', until(() => G.boss && G.boss.state === 'defeat' && G.boss.t > 50, 10) > 0 && G.foam.length > 20, 'foam ' + G.foam.length);
    ok(tag + ' defeat points 10000 x ' + num + ' (+ 세신 bonus)', G.score - scB === 10000 * num + (G.boss.bonus || 0) && G.score - sc0 >= 10000 * num + 3 * 2000 * num, 'boom gain ' + (G.score - scB) + ' total ' + (G.score - sc0));
    const want = 3 + (G.roundDeaths > deaths0 || G.roundDeaths ? 0 : 1);
    ok(tag + ' +3 stamps for the boss (+1 no-death clear)', earnedStamps() - eB === want, (earnedStamps() - eB) + ' want ' + want);
    void e0;
    ok(tag + ' "뽀득!" + ' + BOSS_NAME[type] + ' 퇴치 banner and victory jingle', bannerSince(mB2, new RegExp('^뽀득!\\|' + BOSS_NAME[type] + ' 퇴치! \\+' + (10000 * num).toLocaleString('ko-KR'))) && G.music === 'victory', seenBanners.slice(mB2).join(',') + ' ' + G.music);
    ok(tag + ' minions scattered, hazards gone', G.hazards.length === 0 && G.enemies.every((e) => e.state === 'dead'));
    if (idx < 23) {
      ok(tag + ' doors after the boss', until(() => G.mode === 'transition', 400) > 0 && G.music === 'victory');
      until(() => G.trans && G.trans.swapped, 60);
    } else {
      ok(tag + ' ending after the final boss (no doors)', until(() => G.mode === 'ending' || G.mode === 'transition', 400) > 0 && G.mode === 'ending', G.mode);
    }
  }

  // ------------------------------------------------------------------ water in the shipped rounds
  // 1번째 탕 민트 냉탕: cold dip on the floor, row 24, cols 21-29 (surface y 208)
  function coldChecks(tag) {
    const surf = PF_TOP + 24 * TS, m = sfxLog.length;
    D.setPlayer(212, PF_TOP + 21 * TS);
    step(70);
    const p = G.p;
    ok(tag + ' duck floats in the 냉탕 with ~5 px under the surface', p.water === 2 && p.onGround && Math.abs(p.y + 16 - surf - 5) <= 1.5 && sfxSince(m, 'splash'), 'water ' + p.water + ' sub ' + (p.y + 16 - surf).toFixed(2));
    D.press('left', true); step(20);
    ok(tag + ' floating walk speed x1 (the duck is never slowed by water; v2 was x0.8)', Math.abs(Math.abs(G.p.vx) - 1.25) < 0.06 && G.p.water === 2, G.p.vx.toFixed(3));
    D.press('left', false); step(10);
    // a bubble blown at the cold surface freezes into a 16x16 ice block
    G.p.facing = -1; const mI = sfxLog.length;
    D.press('shoot', true); step(1); D.press('shoot', false);
    const fI = until(() => G.ice.length > 0, 20);
    const ice = G.ice[0];
    ok(tag + ' bubble on the 냉탕 surface -> ice block snapped to the surface (freeze sfx)', fI > 0 && ice && ice.y + 16 > surf && ice.y < surf && sfxSince(mI, 'freeze') && S().ice === 1, ice ? 'ice y ' + ice.y : 'no ice');
    if (!ice) return;
    // one-way platform: the duck lands on top of it
    D.press('right', false); step(1);
    D.setPlayer(ice.x, ice.y - 30); G.p.vy = 0;
    until(() => G.p.onGround, 40);
    ok(tag + ' ice block is a platform the duck stands on', G.p.onGround && Math.abs(G.p.y + 16 - ice.y) < 0.5 && !G.p.water, 'duck feet ' + (G.p.y + 16) + ' ice top ' + ice.y);
    D.setPlayer(60, PF_TOP + 24 * TS - 16);
    // a trapped enemy pushed onto the cold surface freezes inside a block and dies when it melts (500 pts)
    D.trapAll(); step(1);
    const tb = G.bubbles.find((q) => q.kind === 'trapped' && q.enemy);
    let frozen = null;
    if (tb) {
      frozen = tb.enemy;
      tb.x = ice.x + 24 > 220 ? ice.x - 24 : ice.x + 24; tb.y = surf - 8; tb.vy = 0;
      step(2);
    }
    ok(tag + ' trapped enemy touching the 냉탕 freezes inside an ice block', frozen && frozen.state === 'frozen' && G.ice.length === 2, frozen && frozen.state);
    const mM = sfxLog.length, t0 = ice.t;
    const fm = until(() => ice.dead, 400);
    ok(tag + ' ice melts after 6 s (melt sfx)', fm > 0 && t0 + fm === 360 && sfxSince(mM, 'melt'), 'melted at t=' + (t0 + fm));
    const sc0 = G.score;
    const fk = frozen ? until(() => frozen.state !== 'frozen', 400) : -1;
    ok(tag + ' the frozen enemy is killed when its ice melts (+500, counts as a kill)', fk > 0 && frozen.state === 'dead' && G.score - sc0 === 500, frozen && frozen.state + ' gain ' + (G.score - sc0));
    until(() => G.enemies.every((e) => e.state !== 'dead'), 120);
  }
  // 5번째 탕 대리석 욕조: hot tub, row 17, cols 9-22 (surface y 152)
  function hotChecks(tag) {
    const surf = PF_TOP + 17 * TS;
    D.setPlayer(120, PF_TOP + 13 * TS);
    step(80);
    ok(tag + ' duck floats in the 온탕 (never drowns)', G.p.water === 1 && Math.abs(G.p.y + 16 - surf - 5) <= 1.5 && !G.p.dead, 'water ' + G.p.water + ' feet ' + (G.p.y + 16));
    // jump out of the water: a normal jump
    const y0 = G.p.y;
    D.press('jump', true); step(1); D.press('jump', false);
    let top = y0; for (let k = 0; k < 30; k++) { step(1); top = Math.min(top, G.p.y); }
    ok(tag + ' jumps out of the water normally (~38 px)', y0 - top > 30 && y0 - top < 46, (y0 - top).toFixed(1));
    step(60);
    // a bubble over the hot water rises 1.6x faster than one over a shelf
    const a = D.spawnBubble('empty', 120, PF_TOP + 13 * TS), b = D.spawnBubble('empty', 212, PF_TOP + 13 * TS);
    step(70);
    ok(tag + ' bubble over the 온탕 rises 1.6x faster', a.vy < -0.6 && b.vy > -0.42 && b.vy < -0.35, a.vy.toFixed(3) + ' vs ' + b.vy.toFixed(3));
    a.dead = b.dead = true;
    // a grime that wades in the hot tub is slowed and comes out soaked (불은 때)
    const e = G.enemies.find((q) => q.type === 'grime' && q.state === 'active');
    if (e) {
      e.x = 100; e.y = PF_TOP + 14 * TS; e.vy = 0; e.onGround = false;
      const f = until(() => e.water === 1, 60);
      step(10);
      ok(tag + ' grime wades along the 온탕 floor and soaks', f > 0 && e.soakT === 360 && S().enemies.some((q) => q.soaked) && Math.abs(e.y + 16 - (PF_TOP + 18 * TS)) < 1, 'soak ' + e.soakT + ' feet ' + (e.y + 16));
    }
  }

  // ------------------------------------------------------------------ deaths -> game over -> restart
  function killByEnemy() {
    const p = G.p; p.invuln = 0;
    const e = G.enemies.find((q) => q.state === 'active');
    if (!e) return false;
    e.x = p.x; e.y = p.y; e.vx = 0; e.grace = 0;
    return true;
  }
  function deathsAndGameOver() {
    D.seed(99);
    D.start(5); D.setInvincible(false);
    const tag = 'DEATH';
    G.lives = 3; // (the three deaths below: boss, scald drop, last life -> game over; a solo game now starts with SOLO_LIVES 4)
    until(() => G.boss.state === 'fight', 300);
    G.p.invuln = 9999; // no accidental death while hurting the boss
    D.damageBoss();
    until(() => G.boss.state === 'fight', 160);
    ok(tag + ' boss at 2 HP (phase 2) before the duck dies', G.boss.hp === 2 && G.boss.phase === 2);
    // walk into the boss body
    G.p.invuln = 0; const b = G.boss;
    D.setPlayer(b.x + 8, b.y + 12);
    const fd = until(() => G.mode === 'dying', 5);
    ok(tag + ' touching the boss body kills the duck', fd > 0, 'mode ' + G.mode);
    until(() => G.mode === 'playing', 120);
    ok(tag + ' respawn at the spawn with a life lost; boss keeps its HP', G.lives === 2 && G.boss.hp === 2 && G.boss.phase === 2 && G.p.invuln > 0 && G.p.x === LV[5].player.col * 8 - 4, 'lives ' + G.lives + ' hp ' + G.boss.hp);
    ok(tag + ' boss music resumes', G.music === 'boss', G.music);
    // round with the broken shower: a scald drop
    D.gotoRound(2);
    until(() => G.enemies.every((e) => e.state === 'active'), 300);
    D.trapAll(); // nothing else can hurt the duck for a while
    const m = seenBanners.length, mS = sfxLog.length;
    G.roundT = 1795; step(10);
    ok(tag + ' 서둘러! at 30 s: hurry music, enemies angry', G.hurry && G.music === 'hurry' && bannerSince(m, /^서둘러!/) && G.enemies.every((e) => e.angry), G.music);
    G.roundT = 2695; step(10);
    ok(tag + ' 샤워기 고장! at 45 s: scald drops start', G.scald && bannerSince(m, /^샤워기 고장!/) && sfxSince(mS, 'scald_warn'));
    // drop right over the duck, in a column with nothing in between
    G.p.invuln = 0;
    const col = clearColumn(LV[2]);
    D.setPlayer(Math.max(14, Math.min(226, col * TS + 4 - 8)), PF_TOP + 24 * TS - 16); G.p.onGround = true;
    G.drops.length = 0;
    const d = D.spawnDrop(col);
    ok(tag + ' a drop first forms under the ceiling (warning)', d.state === 'form' && d.y < 40, d.state + ' y ' + d.y);
    const ff = until(() => d.state === 'fall', 60);
    ok(tag + ' ... for 40 frames, then falls', ff >= 38 && ff <= 41, ff);
    const fk = until(() => G.mode === 'dying', 120);
    ok(tag + ' a falling scald drop kills the duck', fk > 0 && G.drops.length === 0 && !G.scald, 'mode ' + G.mode + ' drops ' + G.drops.length);
    until(() => G.mode === 'playing', 120);
    ok(tag + ' death resets the hurry timer', G.lives === 1 && G.roundT < 5 && !G.hurry && !G.scald, 'roundT ' + G.roundT);
    // last life: an enemy
    until(() => G.p.invuln <= 0, 130);
    if (!G.enemies.some((e) => e.state === 'active')) { // everyone is still trapped: let one out
      const tb = G.bubbles.find((q) => q.kind === 'trapped');
      if (tb) { tb.trapT = tb.trapMax; G.p.invuln = 5; step(1); }
    }
    ok(tag + ' an enemy is loose', killByEnemy());
    ok(tag + ' an enemy touch kills the duck', until(() => G.mode === 'dying', 5) > 0);
    G.stamps = 6; // show some stamps on the card
    const fo = until(() => G.mode === 'gameover', 120);
    ok(tag + ' last life -> game over card', fo > 0 && G.lives === 0 && !$('pg-over').hidden && G.music === 'gameover', 'mode ' + G.mode);
    const slots = $('pg-over').querySelectorAll('[data-slot]'), on = $('pg-over').querySelectorAll('[data-slot].on');
    ok(tag + ' game-over card shows the 10-slot stamp card (6 on)', slots.length === 10 && on.length === 6 && $('pg-over').querySelector('[data-stampcount]').textContent === '6/10');
    ok(tag + ' game-over card: score + round', +$('pg-over-score').textContent.replace(/[^0-9]/g, '') === G.score && $('pg-over-round').textContent.indexOf('3번째 탕') >= 0, $('pg-over-round').textContent);
    step(70);
    $('pg-retry').click(); step(1);
    ok(tag + ' 다시 하기 restarts a fresh game', G.mode === 'playing' && G.round === 0 && G.lives === 4 && G.score === 0 && G.stamps === 0 && $('pg-over').hidden && !G.p.dead, G.mode);
  }

  function pauseAndTicket() {
    D.start(0); D.setInvincible(true); step(100);
    G.stamps = 7;
    D.pause();
    const card = $('pg-pause').querySelector('[data-stampcard]');
    ok('pause card shows the 10-slot stamp card (7/10)', G.mode === 'paused' && !$('pg-pause').hidden && card && card.querySelectorAll('[data-slot]').length === 10 && card.querySelectorAll('[data-slot].on').length === 7 && card.querySelector('[data-stampcount]').textContent === '7/10');
    const f0 = G.frame; step(30);
    ok('paused: the world does not advance', G.frame === f0);
    D.resume(); step(1);
    ok('resume', G.mode === 'playing' && $('pg-pause').hidden);
    const lives0 = G.lives, m = sfxLog.length, mB = seenBanners.length;
    D.giveStamps(3); step(150);
    ok('10 stamps -> 무료 입장권! banner, +1 life, card resets', G.stamps === 0 && G.lives === lives0 + 1 && sfxSince(m, 'ticket') && bannerSince(mB, /^무료 입장권!/), 'stamps ' + G.stamps + ' lives ' + G.lives);
  }

  // ------------------------------------------------------------------ random-input soak
  function soak(total, seed0) {
    const rounds = [0, 4, 5, 9, 11, 17, 21, 23]; // cold, hot tub, boss 1, pond, boss 2 (hot), boss 3 (cold), ice, final boss
    const per = Math.floor(total / rounds.length);
    let seed = seed0 || 1234567;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    D.seed(seed0 ? seed0 ^ 0x5151 : 31337);
    D.start(rounds[0]); D.setInvincible(false);
    let frames = 0, exceptions = 0, nan = 0, oob = 0, gameOvers = 0, deaths = 0, stuns = 0, bursts = 0, floatF = 0, iceMax = 0, dropMax = 0, powers = 0, visited = new Set();
    const probs = [];
    const bad = (s) => { if (probs.length < 12) probs.push('f' + frames + ' r' + G.round + ' ' + s); };
    const chk = (what, x, y, x0, x1, y0, y1) => {
      if (!fin(x) || !fin(y)) { nan++; bad('NaN ' + what); return; }
      if (x < x0 - 0.01 || x > x1 + 0.01 || y < y0 - 0.01 || y > y1 + 0.01) { oob++; bad(what + ' at ' + x.toFixed(1) + ',' + y.toFixed(1)); }
    };
    const audit = () => {
      if (!fin(G.score) || !fin(G.lives) || !fin(G.stamps) || !fin(G.roundT)) { nan++; bad('NaN counters'); }
      if (G.lives < 0 || G.lives > 9 || G.stamps < 0 || G.stamps > 9) { oob++; bad('lives ' + G.lives + ' stamps ' + G.stamps); }
      if (G.mode === 'ending' || G.mode === 'title' || G.mode === 'gameover') return;
      const p = G.p;
      if (![p.vx, p.vy].every(fin)) { nan++; bad('duck velocity NaN'); }
      chk('duck', p.x, p.y, WALL_L - 2, WALL_R - 14, PF_TOP - 8, PF_BOT - 8);
      for (const e of G.enemies) {
        if (![e.vx, e.vy].every(fin)) { nan++; bad('enemy velocity NaN'); }
        chk('enemy ' + e.type + '/' + e.state, e.x, e.y, WALL_L - 2, WALL_R - 14, e.state === 'descend' ? 0 : PF_TOP - 8, PF_BOT - 8);
      }
      for (const b of G.bubbles) chk('bubble ' + b.kind + '/' + b.state, b.x, b.y, WALL_L, WALL_R - 16, PF_TOP + 8, PF_BOT - 14);
      for (const it of G.items) chk('item', it.x, it.y, WALL_L - 2, WALL_R - 14, PF_TOP - 8, PF_BOT - 8);
      if (G.pickup) chk('pickup', G.pickup.x, G.pickup.y, WALL_L, WALL_R - 16, PF_TOP - 8, PF_BOT - 8);
      const b = G.boss;
      if (b) {
        if (![b.vx, b.vy, b.soap, b.hp].every(fin)) { nan++; bad('boss NaN'); }
        if (b.state !== 'intro') chk('boss/' + b.state, b.x, b.y, WALL_L, WALL_R - 32, PF_TOP - 8, PF_BOT - 32);
        if (b.giant) chk('giant bubble', b.giant.x, b.giant.y, WALL_L - 4, WALL_R - 36, PF_TOP + 6, PF_BOT - 44);
      }
      for (const h of G.hazards) chk('hazard ' + h.kind, h.x, h.kind === 'sweep' ? h.sy : h.y, WALL_L - 32, WALL_R + 16, 0, PF_BOT + 8);
      for (const d of G.drops) chk('drop', d.x, d.y, WALL_L, WALL_R - 8, PF_TOP, PF_BOT);
      for (const ice of G.ice) chk('ice', ice.x, ice.y, WALL_L, WALL_R - 16, PF_TOP, PF_BOT - 16);
      for (const q of G.parts) if (!fin(q.x) || !fin(q.y)) { nan++; bad('particle NaN'); break; }
      if (G.bubbles.length > 60 || G.parts.length > 520 || G.hazards.length > 70 || G.enemies.length > 16) { oob++; bad('entity counts ' + [G.bubbles.length, G.parts.length, G.hazards.length, G.enemies.length].join('/')); }
    };
    let inp = { left: false, right: false, jump: false, shoot: false }, hold = 0;
    let pools = [];
    const findPools = () => {
      const L = LV[G.round]; pools = [];
      for (let r = 3; r < 25; r++) for (let c = 2; c < 30; c++) if (/[~=]/.test(L.map[r][c]) && !/[~=]/.test(L.map[r - 1][c]) && L.map[r - 1][c] === '.' && L.map[r - 2][c] === '.' && L.map[r - 3][c] === '.') pools.push({ c, r });
    };
    for (let ri = 0; ri < rounds.length; ri++) {
      if (ri > 0) D.gotoRound(rounds[ri]);
      for (let f = 0; f < per; f++) {
        if (f === 0 || G.round !== (pools.round)) { findPools(); pools.round = G.round; }
        frames++;
        if (--hold <= 0) {
          hold = 6 + Math.floor(rnd() * 26);
          const h = rnd();
          inp = { left: h < 0.4, right: h >= 0.4 && h < 0.8, jump: rnd() < 0.35, shoot: rnd() < 0.55 };
        }
        for (const k in inp) D.press(k, inp[k] && (k !== 'shoot' || rnd() < 0.8));
        // a sealed boss: half the time the inputs steer toward the giant bubble instead
        if (G.mode === 'playing' && G.boss && G.boss.state === 'stun' && G.boss.giant && (frames >> 5) & 1) {
          const dx = G.boss.giant.x + 20 - (G.p.x + 8);
          D.press('left', dx < -3); D.press('right', dx > 3); D.press('jump', G.boss.giant.y + 36 < G.p.y && (frames & 8) === 0);
        }
        if (G.mode === 'playing') {
          const r = rnd();
          if (G.boss && G.boss.state === 'fight' && r < 0.012) { D.soapBoss(3); if (G.boss.state === 'stun') stuns++; }
          else if (r < 0.014) { D.givePower(['shampoo', 'slippers', 'bathbomb'][Math.floor(rnd() * 3)]); powers++; }
          else if (r < 0.017 && !G.boss) D.trapAll();
          else if (r < 0.019) D.popAll();
          else if (r < 0.023 && pools.length && !G.p.dead) {
            // drop the duck into a random pool (exercise floating / splashing / jumping out)
            const w = pools[Math.floor(rnd() * pools.length)];
            D.setPlayer(Math.max(14, Math.min(226, w.c * TS - 4)), PF_TOP + (w.r - 3) * TS);
          } else if (r < 0.0235 && !G.boss && !G.scald) G.roundT = Math.max(G.roundT, 2640); // break the shower soon
        }
        const hp0 = G.boss ? G.boss.hp : 0, dying0 = G.mode === 'dying';
        try { D.step(1); } catch (e) { exceptions++; bad('exception ' + e.message + ' ' + String(e.stack).split('\n')[1]); }
        if (G.boss && G.boss.hp < hp0) bursts++;
        if (!dying0 && G.mode === 'dying') deaths++;
        if (G.p && G.p.water) floatF++;
        iceMax = Math.max(iceMax, G.ice.length); dropMax = Math.max(dropMax, G.drops.length);
        visited.add(G.round);
        audit();
        if (G.mode === 'gameover') { gameOvers++; D.start(rounds[ri]); }
        else if (G.mode === 'ending') { D.start(rounds[ri]); }
      }
    }
    release();
    note('soak: ' + frames + ' frames, rounds visited ' + [...visited].sort((a, b) => a - b).map((r) => r + 1).join(',') + ', deaths ' + deaths + ', game overs ' + gameOvers + ', boss stuns ' + stuns + ', HP bursts ' + bursts + ', floating frames ' + floatF + ', max ice ' + iceMax + ', max drops ' + dropMax + ', powers ' + powers + ', score ' + G.score);
    if (probs.length) note('soak problems: ' + probs.join(' | '));
    ok('soak: ' + frames + ' frames of random input', frames >= total - rounds.length);
    ok('soak: no exceptions', exceptions === 0, exceptions);
    ok('soak: no NaN anywhere', nan === 0, nan);
    ok('soak: every entity stayed inside the playfield', oob === 0, oob);
    ok('soak: covered water rounds (duck floated) and boss rounds', floatF > 0 && [5, 11, 17, 23].every((r) => visited.has(r)), 'float ' + floatF);
  }

  // ------------------------------------------------------------------ screenshot scenes
  function ready() { console.log(TAG + ' SHOT READY mode=' + G.mode + ' round=' + G.round + ' ' + JSON.stringify({ boss: S().boss, power: S().power, stamps: G.stamps, water: S().water, ice: S().ice, drops: S().drops })); }
  function shotWater() {
    D.seed(5); D.start(4); D.setInvincible(true);
    until(() => G.enemies.every((e) => e.state === 'active'), 300);
    G.stamps = 4; D.givePower('shampoo');
    // the duck hops into the hot tub (rows 17, cols 9-22) and floats
    D.setPlayer(120, PF_TOP + 15 * TS - 16);
    step(80);
    // a grime wading in the tub turns soaked
    const e = G.enemies.find((q) => q.type === 'grime');
    if (e) { e.x = 90; e.y = PF_TOP + 16 * TS - 16; e.vy = 0; e.onGround = false; }
    D.press('shoot', true); step(1); D.press('shoot', false); step(20);
    D.spawnFromGap('stamp');
    step(70);
    ready();
  }
  function shotCold() {
    D.seed(8); D.start(0); D.setInvincible(true);
    until(() => G.enemies.every((e) => e.state === 'active'), 300);
    // the duck floats in the cold dip (row 24, cols 21-29); bubbles it blows there freeze into ice blocks,
    // and a trapped enemy pushed onto the surface freezes inside one
    D.setPlayer(212, PF_TOP + 22 * TS); G.p.facing = -1;
    step(40);
    D.trapAll();
    const tb = G.bubbles.find((q) => q.kind === 'trapped');
    if (tb) { tb.x = 180; tb.y = PF_TOP + 24 * TS - 6; }
    step(2);
    D.press('shoot', true); step(1); D.press('shoot', false); step(30);
    step(30);
    ready();
  }
  function shotBoss() {
    D.seed(12); D.start(5); D.setInvincible(true);
    until(() => G.boss.state === 'fight', 300);
    D.soapBoss(5);
    D.setPlayer(60, PF_TOP + 24 * TS - 16); G.p.facing = 1;
    until(() => G.enemies.length >= 2, 400);
    const f = until(() => G.hazards.some((h) => h.kind === 'wave' && h.t > 10 && h.t < 30), 600);
    D.press('shoot', true); step(1); D.press('shoot', false); step(4);
    note('boss scene after ' + f + ' f');
    ready();
  }
  function shotStun() {
    D.seed(12); D.start(5); D.setInvincible(true);
    until(() => G.boss.state === 'fight', 300);
    D.damageBoss(); until(() => G.boss.state === 'fight', 160);
    waitSettled(300);
    D.stunBoss(); step(40);
    ready();
  }
  function shotFinal() {
    D.seed(3); D.start(23); D.setInvincible(true);
    until(() => G.boss.state === 'fight', 300);
    D.damageBoss(); until(() => G.boss.state === 'fight', 160);
    D.damageBoss(); until(() => G.boss.state === 'fight', 160);
    until(() => G.drops.length >= 2 && G.hazards.length >= 1, 900);
    ready();
  }
  function shotEnding() {
    D.seed(1); D.start(23); D.setInvincible(true);
    until(() => G.boss.state === 'fight', 300);
    G.score = 1234560;
    D.killBoss();
    until(() => G.mode === 'ending', 600);
    ready();
  }

  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30);
    D = PG.debug; G = D.G; LV = D.levels(); S = () => D.getState();
    const h = location.hash.slice(1);
    const scenes = { water: shotWater, cold: shotCold, boss: shotBoss, stun: shotStun, final: shotFinal, ending: shotEnding };
    setTimeout(() => {
      const sm = /^soak(\d+)$/.exec(h); // #soak<seed>: just the random-input soak with another seed
      try {
        if (sm) { hookAudio(); soak(6000, +sm[1]); console.log(TAG + ' DONE pass=' + pass + ' fail=' + fail + (fails.length ? ' failed: ' + fails.join(' ; ') : '')); return; }
        (scenes[h] || run)();
      } catch (e) {
        console.log(TAG + ' FAIL exception ' + e.message + ' ' + String(e.stack).split('\n').slice(0, 4).join(' | '));
        console.log(TAG + ' DONE pass=' + pass + ' fail=' + (fail + 1));
      }
    }, scenes[h] ? 2500 : 50);
  }
  go();
})();
