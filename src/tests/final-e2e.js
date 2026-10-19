// Final independent end-to-end check (built to C:/Temp/bogeul/test-final-e2e.html).
//   no hash  : full run - rounds 1->3 via PG.debug (trap, pop, items, clear, door transitions), stamps,
//              lose every life -> game over -> restart, back to title, then a 5000-frame random-input soak.
//              Logs "E2E PASS/FAIL ..." and finally "E2E DONE pass=N fail=M".
//   #play    : leaves a lively round-2 scene on screen for a screenshot (logs "E2E SHOT READY").
//   #over    : leaves the game-over overlay on screen for a screenshot (logs "E2E SHOT READY").
(function () {
  let pass = 0, fail = 0, pageErrors = 0;
  window.addEventListener('error', (e) => { pageErrors++; console.log('E2E page error: ' + e.message); });
  const log = (s) => console.log(s);
  function t(name, fn) {
    let r;
    try { r = fn(); } catch (e) { r = 'exception ' + (e && e.message) + ' @ ' + String((e && e.stack) || '').split('\n')[1]; }
    if (r === undefined || r === true) { pass++; log('E2E PASS ' + name); } else { fail++; log('E2E FAIL ' + name + ': ' + r); }
  }
  const $ = (id) => document.getElementById(id);
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const MODES = ['title', 'playing', 'transition', 'dying', 'gameover', 'paused', 'ending'];

  function waitFor() {
    if (!window.PG || !window.PG.debug) return setTimeout(waitFor, 30);
    setTimeout(() => {
      const h = location.hash;
      if (h === '#play') shotPlay(); else if (h === '#over') shotOver();
      else if (h === '#ending') shotEnding(); else if (h === '#hurry') shotHurry();
      else if (h === '#fonts') fontProbe(); else run();
    }, /^#(play|over|ending|hurry)/.test(location.hash) ? 3000 : 50); // shot scenes: let the web fonts load first
  }

  // step until cond() or max frames; returns frames used or -1
  function stepUntil(cond, max) {
    const D = PG.debug;
    for (let i = 1; i <= max; i++) { D.step(1); if (cond()) return i; }
    return -1;
  }

  function killDuck() {
    // put an active enemy right on the duck (invulnerability cleared) so the next update kills it
    const G = PG.debug.G, p = G.p;
    p.invuln = 0;
    let e = G.enemies.find((q) => q.state === 'active');
    if (!e) {
      // no active enemy (e.g. an empty boss placeholder round): a falling scald drop right on the duck
      if (G.mode !== 'playing' || G.clearT >= 0) return false;
      const d = PG.debug.spawnDrop(Math.floor((p.x + 8) / 8));
      Object.assign(d, { x: p.x + 4, y: p.y + 4, state: 'fall', vy: 0.5, t: 99 });
      return true;
    }
    e.x = p.x; e.y = p.y; e.vx = 0;
    return true;
  }

  function run() {
    const D = PG.debug, G = D.G, S = () => D.getState();
    const LV = D.levels();

    t('boots into title with live attract scene', () => {
      const s = S();
      if (s.phase !== 'title') return 'mode ' + s.phase;
      if ($('pg-title').hidden) return 'title overlay hidden';
      if (!$('pg-start') || !/혼자 하기/.test($('pg-start').textContent)) return 'no 혼자 하기 button';
      if (s.enemies.length < 1) return 'attract round has no enemies';
      const f = s.frame; D.step(60);
      if (S().frame !== f + 60 || S().phase !== 'title' || S().score !== 0) return 'attract did not advance cleanly';
    });

    t('getState shape matches spec', () => {
      const s = S();
      const keys = ['mode', 'round', 'loop', 'score', 'hiscore', 'lives', 'stamps', 'frame', 'player', 'enemies', 'bubbles', 'items', 'hurry', 'drops', 'water', 'ice', 'power', 'boss'];
      for (const k of keys) if (!(k in s)) return 'missing ' + k;
      for (const k of ['x', 'y', 'vx', 'vy', 'onGround', 'dead', 'facing']) if (!(k in s.player)) return 'player missing ' + k;
      for (const fn of ['getState', 'start', 'step', 'press', 'trapAll', 'popAll', 'killAll', 'setInvincible', 'gotoRound', 'seed']) if (typeof D[fn] !== 'function') return 'debug missing ' + fn;
      if (typeof s.items !== 'number' || typeof s.hurry !== 'boolean' || typeof s.drops !== 'number' || typeof s.stamps !== 'number') return 'types';
      if ('letters' in s || 'towel' in s) return 'v1 letters/towel fields still present';
    });

    D.seed(4242);
    let st = D.start(0);
    t('start(0) begins round 1 fresh', () => {
      if (st.phase !== 'playing' || st.round !== 0 || st.lives !== 3 || st.score !== 0 || st.loop !== 0) return JSON.stringify(st).slice(0, 200);
      if (!$('pg-title').hidden) return 'title overlay still visible';
      if (st.enemies.some((e) => e.state !== 'descend')) return 'enemies should start descending';
      if ($('pg-banner').hidden || $('pg-banner-main').textContent !== LV[0].name) return 'banner "' + $('pg-banner-main').textContent + '"';
    });
    D.setInvincible(true);

    // stamp early in round 1 (persists across rounds, resets on game over)
    let stampsAfterR1 = null;
    const scoreLog = [];
    for (let r = 0; r < 3; r++) {
      const L = LV[r], n = L.enemies.length;
      t('R' + (r + 1) + ' enemies descend harmlessly, then activate', () => {
        const s0 = S();
        if (s0.round !== r) return 'round ' + s0.round;
        const used = stepUntil(() => S().enemies.every((e) => e.state === 'active'), 200);
        if (used < 0) return 'not all active: ' + S().enemies.map((e) => e.state).join(',');
        if (used < 50) return 'descent too quick (' + used + 'f)';
        if (S().enemies.length !== n) return 'enemy count ' + S().enemies.length + ' vs ' + n;
      });
      if (r === 0) {
        t('R1 stamp bubble is collected by touch (+1 stamp)', () => {
          const p = G.p;
          D.spawnBubble('stamp', p.x, p.y - 2);
          D.step(3);
          if (S().stamps !== 1) return 'stamps ' + S().stamps;
          if (S().bubbles.some((b) => b.kind === 'stamp' && b.state !== 'pop')) return 'stamp bubble still alive';
          D.step(12);
          if (S().bubbles.some((b) => b.kind === 'stamp')) return 'stamp pop animation never finished';
        });
        stampsAfterR1 = S().stamps;
      }
      let killScore = 0;
      t('R' + (r + 1) + ' trapAll traps every enemy in a bubble', () => {
        D.trapAll(); D.step(2);
        const s = S();
        if (s.enemies.some((e) => e.state !== 'trapped')) return s.enemies.map((e) => e.state).join(',');
        const tb = s.bubbles.filter((b) => b.kind === 'trapped').length;
        if (tb !== n) return 'trapped bubbles ' + tb + ' vs ' + n;
        if (s.phase !== 'playing') return 'mode ' + s.phase;
      });
      t('R' + (r + 1) + ' trapped bubbles float upward', () => {
        const y0 = S().bubbles.filter((b) => b.kind === 'trapped').reduce((a, b) => a + b.y, 0);
        D.step(40);
        const y1 = S().bubbles.filter((b) => b.kind === 'trapped').reduce((a, b) => a + b.y, 0);
        if (!(y1 < y0)) return 'sum y ' + y0.toFixed(1) + ' -> ' + y1.toFixed(1);
        if (S().enemies.some((e) => e.state !== 'trapped')) return 'someone escaped too early';
      });
      t('R' + (r + 1) + ' popAll chain-kills all with 뽀득 combo scoring (500k, soaked x2) + 세신 bonus', () => {
        const sc0 = S().score;
        const extra = S().bubbles.filter((b) => b.kind === 'empty').length * 10;
        let k = 0, want = extra;
        for (const b of G.bubbles) if (b.kind === 'trapped' && !b.dead && b.state !== 'pop') { k++; want += Math.min(5000, 500 * k) * (b.soaked ? 2 : 1); }
        D.popAll(); D.step(1);
        const bonus = G.lastBonus ? G.lastBonus.bonus : 0;
        killScore = S().score - sc0 - bonus;
        if (killScore !== want) return 'score +' + killScore + ' want ' + want;
        if (!(G.clearT >= 0) || !(bonus >= 0 && bonus <= 6000)) return 'no clear / bonus ' + bonus;
        if (S().enemies.some((e) => e.state !== 'dead')) return S().enemies.map((e) => e.state).join(',');
        scoreLog.push(killScore);
      });
      let itemsSeen = 0;
      t('R' + (r + 1) + ' knocked-out enemies land and become snacks', () => {
        const scB = S().score;
        const used = stepUntil(() => G.enemies.length === 0, 480);
        if (used < 0) return 'enemies still flying: ' + G.enemies.map((e) => e.state + '@' + e.y.toFixed(0)).join(',');
        const collectedByLuck = S().score - scB;
        itemsSeen = G.items.length;
        if (itemsSeen < 1 && collectedByLuck === 0) return 'no items';
        if (itemsSeen > n) return 'too many items ' + itemsSeen;
        for (const it of G.items) {
          if (!/^(tangerine|yogurt|egg|banana_milk|sikhye|icecream|watermelon|towel_hat)$/.test(it.type)) return 'bad type ' + it.type;
          if (![100, 200, 300, 500, 700, 1000, 2000, 3000].includes(it.value)) return 'bad value ' + it.value;
          if (!fin(it.x) || !fin(it.y) || it.y < 16 || it.y > 224) return 'bad pos ' + it.x + ',' + it.y;
        }
        if (S().phase !== 'playing') return 'mode ' + S().phase + ' (clear wait should still be running)';
      });
      t('R' + (r + 1) + ' walking onto each snack collects it for its value', () => {
        let want = 0;
        const sc0 = S().score;
        for (const it of G.items.slice()) {
          want += it.value;
          D.setPlayer(it.x, it.y - 1);
          D.step(1);
        }
        if (G.items.length) return G.items.length + ' items left';
        if (S().score - sc0 !== want) return 'score +' + (S().score - sc0) + ' want ' + want;
        if (S().phase !== 'playing') return 'mode ' + S().phase;
      });
      t('R' + (r + 1) + ' round clear -> sliding-door transition -> R' + (r + 2), () => {
        const used = stepUntil(() => S().phase === 'transition', 400);
        if (used < 0) return 'no transition, mode ' + S().phase;
        const s = S();
        if (s.enemies.length || s.bubbles.length || s.items || s.drops || s.ice) return 'leftovers during transition';
        let sawSlide = false, sawShut = false;
        const used2 = stepUntil(() => { if (G.trans) { sawSlide = sawSlide || (G.trans.door > 0.05 && G.trans.door < 0.95); sawShut = sawShut || G.trans.door >= 0.999; } return S().phase === 'playing'; }, 300);
        if (used2 < 0) return 'transition never ended';
        if (used2 < 60) return 'transition too short ' + used2;
        if (!sawSlide || !sawShut) return 'doors never slid shut (slide=' + sawSlide + ' shut=' + sawShut + ')';
        const s2 = S(), Ln = LV[r + 1];
        if (s2.round !== r + 1) return 'round ' + s2.round;
        const px = Ln.player.col * 8 - 4, py = (Ln.player.row + 1) * 8;
        if (Math.abs(s2.player.x - px) > 1 || Math.abs(s2.player.y - py) > 1) return 'duck at ' + s2.player.x + ',' + s2.player.y + ' want ' + px + ',' + py;
        if ($('pg-banner').hidden || $('pg-banner-main').textContent !== Ln.name) return 'banner "' + $('pg-banner-main').textContent + '" want ' + Ln.name;
        if (s2.enemies.length !== Ln.enemies.length || s2.enemies.some((e) => e.state !== 'descend')) return 'new enemies not descending';
        if (s2.lives !== 3) return 'lives ' + s2.lives;
        if (s2.stamps < stampsAfterR1 && s2.lives === 3) return 'stamps lost across rounds: ' + s2.stamps;
      });
    }

    t('score after three rounds is consistent and hi-score tracks it', () => {
      const s = S();
      if (!(s.score >= scoreLog.reduce((a, b) => a + b, 0))) return 'score ' + s.score + ' < ' + scoreLog.join('+');
      if (s.hiscore < s.score) return 'hi ' + s.hiscore + ' < ' + s.score;
      if (!Number.isInteger(s.score)) return 'non-integer score';
    });

    // ---- lose every life -> game over
    D.setInvincible(false);
    stepUntil(() => S().enemies.every((e) => e.state === 'active'), 200);
    const scoreBeforeDeaths = S().score;
    for (let k = 1; k <= 3; k++) {
      t('death ' + k + ': enemy contact -> dying animation -> ' + (k < 3 ? 'respawn with invulnerability' : 'game over'), () => {
        const lives0 = S().lives;
        if (!killDuck()) return 'no active enemy';
        D.step(1);
        if (S().phase !== 'dying' || !S().player.dead) return 'mode ' + S().phase;
        D.step(60);
        if (S().lives !== lives0) return 'lives dropped too early';
        const used = stepUntil(() => S().phase !== 'dying', 60);
        if (used < 0) return 'stuck dying';
        const s = S();
        if (s.lives !== lives0 - 1) return 'lives ' + s.lives;
        if (k < 3) {
          if (s.phase !== 'playing' || s.player.dead) return 'mode ' + s.phase;
          if (!(G.p.invuln > 60)) return 'invuln ' + G.p.invuln;
          const L = LV[s.round];
          if (Math.abs(s.player.x - (L.player.col * 8 - 4)) > 1) return 'not at spawn';
          if (s.hurry || s.scald || s.drops) return 'hurry not reset';
          // invulnerable: contact right after respawn is harmless
          const e = G.enemies.find((q) => q.state === 'active');
          if (e) { e.x = G.p.x; e.y = G.p.y; D.step(2); if (S().phase !== 'playing') return 'killed while blinking'; }
        } else {
          if (s.phase !== 'gameover') return 'mode ' + s.phase;
        }
      });
    }
    t('game over overlay shows score, hi-score, round reached; hi-score saved', () => {
      const s = S();
      if ($('pg-over').hidden) return 'overlay hidden';
      const num = (id) => +$(id).textContent.replace(/[^0-9]/g, '');
      if (num('pg-over-score') !== s.score) return 'score text ' + $('pg-over-score').textContent + ' vs ' + s.score;
      if (num('pg-over-hi') < s.score) return 'hi text';
      if (!/4번째 탕/.test($('pg-over-round').textContent)) return 'round text ' + $('pg-over-round').textContent;
      if (s.score !== scoreBeforeDeaths) return 'score changed on death';
      let stored = null; try { stored = localStorage.getItem('ppogeul-hiscore'); } catch (e) { stored = 'blocked'; }
      if (stored !== 'blocked' && +stored !== s.hiscore) return 'stored ' + stored + ' vs ' + s.hiscore;
      D.step(30);
      if (S().phase !== 'gameover') return 'game over did not hold';
    });
    t('restart from game over (다시 하기) gives a fresh game', () => {
      const hi = S().hiscore;
      D.step(70);
      $('pg-retry').click();
      const s = S();
      if (s.phase !== 'playing' || s.round !== 0 || s.lives !== 3 || s.score !== 0 || s.loop !== 0) return JSON.stringify(s).slice(0, 160);
      if (s.stamps) return 'stamps not reset: ' + s.stamps;
      if (!$('pg-over').hidden) return 'overlay still visible';
      if (s.hiscore !== hi) return 'hi-score lost';
      D.step(150);
      if (S().phase !== 'playing') return 'mode ' + S().phase;
    });
    t('처음으로 returns to the title with the hi-score shown', () => {
      D.pause();
      if (S().phase !== 'paused' || $('pg-pause').hidden) return 'pause failed';
      $('pg-pause-home').click();
      const s = S();
      if (s.phase !== 'title' || $('pg-title').hidden) return 'mode ' + s.phase;
      if (+$('pg-title-hi').textContent.replace(/[^0-9]/g, '') !== s.hiscore) return 'title hi ' + $('pg-title-hi').textContent;
    });

    // ---- 5000-frame random-input soak across several rounds
    t('5000-frame random-input soak: no exceptions, no NaN, sane state', () => {
      let a = 13579;
      const R = () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
      D.seed(777);
      D.start(3);
      D.setInvincible(false);
      const rounds = new Set(), modes = {};
      let endings = 0, deaths = 0, gameovers = 0, transitions = 0, prevMode = 'playing', maxB = 0, maxParts = 0, maxItems = 0, kills = 0;
      const held = { left: false, right: false, jump: false, shoot: false };
      for (let f = 0; f < 5000; f++) {
        if (f % 6 === 0) {
          const mv = R();
          held.left = mv < 0.4; held.right = mv > 0.6;
          held.jump = R() < 0.25; held.shoot = R() < 0.45;
          for (const k in held) D.press(k, held[k]);
        }
        if (f > 0 && f % 900 === 0) {
          const s = S();
          if (s.phase === 'playing' || s.phase === 'dying') D.gotoRound(Math.floor(R() * LV.length));
        }
        const s0 = S();
        if (s0.phase === 'gameover') { gameovers++; D.step(70); D.start(Math.floor(R() * LV.length)); }
        else if (s0.phase === 'ending') { endings++; D.step(70); $('pg-end-next').click(); }
        if (f >= 2500 && f < 2600 && !gameovers && S().phase === 'playing' && !G.p.invuln) { G.lives = 1; killDuck(); } // next death ends the game: exercises game over + restart inside the soak
        if (f === 3600 && (S().phase === 'playing')) { D.gotoRound(LV.length - 1); D.step(130); D.killAll(); } // last round -> ending -> 2회차
        if (R() < 1 / 260 && S().phase === 'playing') D.trapAll();
        if (R() < 1 / 200 && S().phase === 'playing') D.popAll();
        if (R() < 1 / 900 && S().phase === 'playing') { D.killAll(); kills++; }
        if (R() < 1 / 1200 && S().phase === 'playing') { D.pause(); D.step(5); D.resume(); }
        try { D.step(1); } catch (e) { return 'exception at soak frame ' + f + ': ' + e.message + ' ' + String(e.stack).split('\n')[1]; }
        const s = S();
        if (MODES.indexOf(s.phase) < 0) return 'bad mode ' + s.phase;
        modes[s.phase] = (modes[s.phase] || 0) + 1;
        if (s.phase === 'dying' && prevMode !== 'dying') deaths++;
        if (s.phase === 'transition' && prevMode !== 'transition') transitions++;
        prevMode = s.phase;
        rounds.add(s.round);
        if (!Number.isInteger(s.score) || s.score < 0) return 'score ' + s.score + ' @' + f;
        if (!(s.lives >= 0 && s.lives <= 9)) return 'lives ' + s.lives + ' @' + f;
        const p = s.player;
        if (!fin(p.x) || !fin(p.y) || !fin(p.vx) || !fin(p.vy)) return 'player NaN @' + f + ' ' + JSON.stringify(p);
        if (p.x < 13 || p.x > 227) return 'player x out of walls ' + p.x + ' @' + f;
        if (p.y < -24 || p.y > 240) return 'player y ' + p.y + ' @' + f;
        for (const e of s.enemies) if (!fin(e.x) || !fin(e.y)) return 'enemy NaN ' + JSON.stringify(e) + ' @' + f;
        for (const b of s.bubbles) if (!fin(b.x) || !fin(b.y)) return 'bubble NaN @' + f;
        for (const b of s.bubbles) if (b.x < 15 || b.x > 225 || b.y < 0 || b.y > 230) return 'bubble out of field ' + b.x + ',' + b.y + ' @' + f;
        for (const it of G.items) if (!fin(it.x) || !fin(it.y)) return 'item NaN @' + f;
        for (const d of G.drops) if (!fin(d.x) || !fin(d.y)) return 'drop NaN';
        for (const i of G.ice) if (!fin(i.x) || !fin(i.y)) return 'ice NaN';
        if (G.pickup && (!fin(G.pickup.x) || !fin(G.pickup.y))) return 'pickup NaN';
        for (const q of G.parts) if (!fin(q.x) || !fin(q.y)) return 'particle NaN @' + f;
        maxB = Math.max(maxB, s.bubbles.length); maxParts = Math.max(maxParts, G.parts.length); maxItems = Math.max(maxItems, s.items);
        if (s.bubbles.length > 48) return 'bubble leak ' + s.bubbles.length;
        if (G.parts.length > 500) return 'particle leak ' + G.parts.length;
      }
      for (const k in held) D.press(k, false);
      log('E2E soak stats ' + JSON.stringify({ rounds: [...rounds].sort((x, y) => x - y), modes, deaths, gameovers, endings, transitions, kills, maxB, maxParts, maxItems, final: S().phase + '@R' + (S().round + 1) }));
      if (rounds.size < 4) return 'only ' + rounds.size + ' rounds visited';
      if (deaths < 1) return 'soak never died - not exercising death path';
      if (gameovers < 1) return 'soak never reached game over';
      if (endings < 1) return 'soak never reached the ending';
    });

    t('no uncaught page errors', () => (pageErrors === 0 ? undefined : pageErrors + ' errors'));
    log('E2E DONE pass=' + pass + ' fail=' + fail);
  }

  // ---------------------------------------------------------------- screenshot scenes
  function shotPlay() {
    const D = PG.debug, G = D.G;
    D.seed(31); D.start(1); D.setInvincible(true);
    D.step(150);
    // trap all but one enemy, so the scene shows an active enemy, trapped ones and empties
    const keep = G.enemies[0]; const ks = keep.state; keep.state = 'hold';
    D.trapAll(); keep.state = ks;
    D.press('right', true); D.step(30); D.press('right', false);
    for (let i = 0; i < 3; i++) { D.press('shoot', true); D.step(1); D.press('shoot', false); D.step(15); }
    D.step(80);
    D.spawnBubble('stamp', 120, 120);
    G.stamps = 1;
    D.press('jump', true); D.step(1); D.press('jump', false); D.step(12);
    log('E2E SHOT READY ' + JSON.stringify(D.getState()).slice(0, 220));
  }
  function shotOver() {
    const D = PG.debug;
    D.seed(5); D.start(2); D.setInvincible(true);
    D.step(140); D.trapAll(); D.step(5); D.popAll(); D.step(60);
    D.setInvincible(false);
    // re-enter the round so there are active enemies again, then lose all lives
    D.gotoRound(2); D.step(140);
    for (let k = 0; k < 3; k++) { killDuck(); D.step(100); }
    D.step(70);
    log('E2E SHOT READY mode=' + D.getState().phase + ' score=' + D.getState().score);
  }
  function shotEnding() {
    const D = PG.debug;
    D.seed(9); D.start(D.levels().length - 1); D.setInvincible(true);
    D.step(140); D.killAll();
    for (let i = 0; i < 900 && D.getState().phase !== 'ending'; i++) D.step(1);
    D.step(30);
    log('E2E SHOT READY mode=' + D.getState().phase);
  }
  function shotHurry() {
    // steam round, hurry + scalding drops on screen, a steam bubble and a blast in flight
    const D = PG.debug;
    D.seed(12); D.start(8); D.setInvincible(true); // 증기 사우나 (steam)
    D.step(2760);
    log('E2E SHOT READY ' + JSON.stringify({ mode: D.getState().phase, hurry: D.getState().hurry, drops: D.getState().drops, bubbles: D.getState().bubbles.map((b) => b.kind).join() }));
  }
  // Real-time only (tools/cdp-run.js): after the web fonts settle at the title, are the glyphs needed by
  // later banners / result screens already loaded, or would they first flash in the fallback font?
  function fontProbe() {
    const names = PG.debug.levels().map((l) => l.name).join(' ');
    const sign = ['준비!', '서둘러!', '샤워기 고장!', '무료 입장권!', '청소 완료!', '샴푸!', '고무 슬리퍼!', '입욕제!', '목욕 끝!', '최고 기록 달성!', '다시 하기', '잠깐 쉬는 중', '목욕 도장 카드', '모든 탕을 반짝반짝 청소했어요!', names];
    const body = ['때가 화났어요', '뜨거운 물방울 조심!', '세신 보너스', '도장 10개 · 한 판 더', '거품이 크고 멀리', '때가 모두 불었어요', '도달한 탕', '따끈한 물에 몸 좀 녹이고 가요', '꽥꽥이 덕분에 목욕탕이 뽀득뽀득해졌어요'];
    setTimeout(() => {
      const miss = [];
      for (const s of sign) if (!document.fonts.check('20px "Black Han Sans"', s)) miss.push('sign:' + s.slice(0, 12));
      for (const s of body) if (!document.fonts.check('16px "Gowun Dodum"', s)) miss.push('body:' + s.slice(0, 12));
      const titleOk = document.fonts.check('20px "Black Han Sans"', PG.GAME_NAME);
      log('E2E FONTS titleLoaded=' + titleOk + ' notYetLoaded=' + miss.length + ' ' + JSON.stringify(miss));
    }, 5000);
  }
  waitFor();
})();
