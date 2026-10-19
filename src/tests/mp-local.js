// v3 engine stage 1: several players in ONE engine instance (no networking yet), driven through PG.debug.
// Built to C:/Temp/bogeul/test-mp-local.html:
//   node tools/run-chrome.js test-mp-local.html - 900 760 120000
// Covers: the six animals (sprites present, title picker, v4 kit cards), every perk measured with the v4 kit numbers
// (the moves and bubbles themselves: kits.js), per-slot input, co-op (2-4 players,
// team lives 3 + (n - 1), ghost bubble -> partner revive, ghost timeout -> respawn for a team life, game over with
// the per-player result table + MVP, personal scores, power-up for the toucher, boss soap / minion scaling), battle
// (arena spawns, trap an opponent with a shot, escape alone ~4 s vs mashing ~1.5 s, 뽀득 KO by a third player
// (+500, respawn after 1.5 s with 2 s blink), 100 x combo enemy points, enemy hit = stun 1 s and -100, 보스 난입 at
// 1:30 left (half soap, 1 HP, +1500 to the burster), timer end -> podium -> 한 판 더 / 로비로, options), solo still solo.
// Prints "MP PASS/FAIL <name>", "MP INFO ..." and "MP DONE pass=N fail=M".
// Screenshot scenes (log "MP SHOT READY"): #title  #coop  #battle  #podium  #over
(function () {
  'use strict';
  let pass = 0, fail = 0, errors = 0;
  const fails = [];
  window.addEventListener('error', (e) => { errors++; console.log('MP page error: ' + e.message + ' @' + e.lineno); });
  const log = (s) => console.log(s);
  function t(name, fn) {
    let r;
    try { r = fn(); } catch (e) { r = 'exception ' + (e && e.message) + ' @ ' + String((e && e.stack) || '').split('\n')[1]; }
    if (r === undefined || r === true) { pass++; log('MP PASS ' + name); } else { fail++; fails.push(name); log('MP FAIL ' + name + ': ' + r); }
  }
  const $ = (id) => document.getElementById(id);
  const near = (a, b, eps) => Math.abs(a - b) <= eps;
  const PF_TOP = 16;

  function run() {
    const D = PG.debug, G = D.G, S = () => D.getState(), LV = D.levels();
    const P = (slot) => G.players.find((p) => p.slot === slot);
    const releaseAll = () => { for (let s = 0; s < 4; s++) for (const a of ['left', 'right', 'jump', 'shoot']) D.press(a, false, s); };
    const park = (e) => { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; };
    const activate = (e, x, y) => Object.assign(e, { state: 'active', x, y, vx: 0, vy: 0, onGround: true, angry: false, escaped: false, hopT: 999, delay: 0, spawnY: y, jumpCd: 999, chargeCd: 999, windT: 0, chargeT: 0, committed: false, soakT: 0, dir: 1, water: 0, grace: 0 });
    const step = (n) => D.step(n === undefined ? 1 : n);
    const until = (cond, max) => { for (let i = 1; i <= max; i++) { step(1); if (cond()) return i; } return -1; };
    const sfx = [];
    const A = PG.Audio || {};
    if (typeof A.sfx === 'function') { const o = A.sfx; A.sfx = function (n) { sfx.push(n); return o.apply(A, arguments); }; }
    const music = [];
    if (typeof A.music === 'function') { const o = A.music; A.music = function (n) { music.push(n); return o.apply(A, arguments); }; }
    const visibleTags = () => [...document.querySelectorAll('#pg-tags .pg-tag')].filter((el) => !el.hidden);

    // ---- a plain test room over round 1 (restored at the end): hot pool cols 6-13, cold pool cols 20-27 (2 deep),
    // a ledge at row 15, the wrap gap at cols 14-17
    const L0 = LV[0], saved = { map: L0.map, player: L0.player, players: L0.players, gather: L0.gather, gapX: L0.gapX, enemies: L0.enemies, special: L0.special, boss: L0.boss };
    const ROOM = [];
    for (let r = 0; r < 26; r++) {
      if (r === 0 || r === 25) ROOM.push('##############....##############');
      else if (r === 15) ROOM.push('##......#######...............##');
      else if (r === 23 || r === 24) ROOM.push('##....~~~~~~~~......========..##');
      else ROOM.push('##' + '.'.repeat(28) + '##');
    }
    const HOT = { x0: 48, x1: 112, surfY: PF_TOP + 23 * 8 }, COLD = { x0: 160, x1: 224, surfY: PF_TOP + 23 * 8 };
    function installRoom() {
      Object.assign(L0, { map: ROOM, player: { col: 3, row: 24 }, players: [{ col: 3, row: 24 }, { col: 29, row: 24 }, { col: 10, row: 14 }, { col: 5, row: 14 }],
        gather: { col: 8, row: 2 }, gapX: 16 * 8, special: undefined, boss: null,
        enemies: [{ type: 'grime', col: 9, row: 14, dir: 1 }, { type: 'grime', col: 26, row: 14, dir: -1 }, { type: 'mold', col: 22, row: 14, dir: 1 }] });
    }
    function restoreRoom() { Object.assign(L0, saved); }
    // a quiet solo round in the room with one animal: enemies parked, no spawners
    function soloRoom(char, seed) {
      installRoom();
      D.seed(seed || 5); D.start(0, char); D.setInvincible(true); step(100);
      G.enemies.forEach(park); G.bubbles = []; G.items = []; G.pickup = null; G.stampT = 1e9; G.steamT = -1;
      releaseAll();
      return G.p;
    }
    // walking speed (px / frame) after 12 frames of holding right, starting at x, y (feet settled first)
    function speedAt(x, y, settle) {
      D.setPlayer(x, y); step(settle || 30);
      D.press('right', true); step(12); const v = G.p.vx, w = G.p.water; D.press('right', false); step(20);
      return { v, w };
    }

    // ================================================================== 1. animals, sprites, picker
    // (v4 kits: the one-line perk text became the kit card - char-kits §12.1)
    t('six animals with names and kit cards (role, tag, 4 stat bars, move, bubble, hue); slot colours', () => {
      const cs = D.chars();
      if (cs.map((c) => c.id).join() !== 'duck,capy,otter,penguin,cat,frog') return cs.map((c) => c.id).join();
      if (cs.map((c) => c.name).join() !== '꽥꽥이,까삐,해롱이,펭펭,냥냥,개굴이') return cs.map((c) => c.name).join();
      if (cs.map((c) => c.role).join() !== '만능,든든,돌격,저격,곡예,함정') return 'roles ' + cs.map((c) => c.role).join();
      if (cs.some((c) => !c.tag || c.tag.length > 26 || 'perk' in c)) return 'tag text ' + cs.map((c) => c.tag).join(' | ');
      if (cs.map((c) => c.stats.join('')).join() !== '3333,2323,4322,5351,3533,3414') return 'stats ' + cs.map((c) => c.stats.join('')).join();
      if (cs.some((c) => !c.move || !c.move.name || !c.move.how || c.move.how.length > 26 || !c.move.word || !c.move.touch || !c.bub || !c.bub.name || !c.bub.desc || c.bub.desc.length > 26)) return 'move / bubble text';
      if (cs.map((c) => c.move.name).join() !== '둥실 활공,털썩 엉덩방아,휙 대시,쭉 배미끄럼,냥냥 2단 점프,개굴 3단 뛰기') return 'moves ' + cs.map((c) => c.move.name).join();
      if (cs.map((c) => c.hue).join() !== '#ffe36b,#ffa98a,#5fe0c8,#9fdcff,#c9a8ff,#9be86a') return 'hues ' + cs.map((c) => c.hue).join();
      if (D.slotColors().join() !== '#ffd447,#f6a6bd,#7fdcc8,#8dc9ff') return D.slotColors().join();
    });
    t('every animal has all its frames (art or stand-in): anims 16x16, life 8x8, portrait 32x32; UI crown / tag / ready', () => {
      const want = { idle: 2, walk: 4, jump: 1, fall: 1, shoot: 1, die: 4, trapped: 2, ghost: 2 };
      for (const c of ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog']) {
        for (const a in want) { const fr = D.frames(c + '_' + a); if (fr.length !== want[a] || fr.some((s) => s[0] !== 16 || s[1] !== 16)) return c + '_' + a + ' ' + JSON.stringify(fr); }
        const l = D.frames('life_' + c), pt = D.frames('portrait_' + c);
        if (l.length !== 1 || l[0][0] !== 8 || l[0][1] !== 8) return 'life_' + c + ' ' + JSON.stringify(l);
        if (pt.length !== 1 || pt[0][0] !== 32 || pt[0][1] !== 32) return 'portrait_' + c + ' ' + JSON.stringify(pt);
      }
      const cr = D.frames('crown'), tg = D.frames('tag_arrow'), rd = D.frames('ready');
      if (cr.length !== 1 || cr[0].join() !== '8,8') return 'crown ' + JSON.stringify(cr);
      if (tg.length !== 1 || tg[0].join() !== '5,3') return 'tag_arrow ' + JSON.stringify(tg);
      if (rd.length !== 1 || rd[0].join() !== '8,8') return 'ready ' + JSON.stringify(rd);
    });
    t('title: 6 portraits; a tap or ←/→ picks the animal (stored), the attract demo shows it; 혼자 하기 starts with it', () => {
      D.toTitle(); step(2);
      if ($('pg-title').hidden) return 'title hidden';
      const btns = [...document.querySelectorAll('#pg-pick [data-char]')];
      if (btns.length !== 6 || btns.some((b) => !b.querySelector('canvas'))) return 'picker buttons ' + btns.length;
      btns[2].click();
      if (G.sel !== 'otter' || btns[2].getAttribute('aria-checked') !== 'true' || $('pg-pick-name').textContent !== '해롱이') return 'click pick ' + G.sel;
      if (G.p.char !== 'otter') return 'attract animal ' + G.p.char;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true }));
      if (G.sel !== 'penguin') return 'arrow pick ' + G.sel;
      let stored = null; try { stored = localStorage.getItem('ppogeul-char'); } catch (e) { stored = 'penguin'; }
      if (stored !== 'penguin') return 'stored ' + stored;
      if (!/혼자 하기/.test($('pg-start').textContent) || !/친구와 하기/.test($('pg-friends-btn').textContent)) return 'buttons';
      $('pg-start').click(); step(2);
      const s = S();
      if (s.mode !== 'solo' || s.phase !== 'playing' || s.players.length !== 1 || s.players[0].char !== 'penguin') return JSON.stringify({ m: s.mode, ph: s.phase, n: s.players.length, c: s.players[0] && s.players[0].char });
      D.toTitle(); btns[0].click(); step(1);
      if (G.sel !== 'duck') return 'back to duck';
    });
    t('친구와 하기 opens its screen (a note until the online lobby plugs in) and 뒤로 returns', () => {
      D.toTitle(); step(1);
      $('pg-friends-btn').click(); step(1);
      if (typeof PG.openFriends !== 'function' && $('pg-friends').hidden) return 'friends screen hidden';
      if (typeof PG.openFriends !== 'function') { $('pg-friends-back').click(); step(1); if ($('pg-title').hidden) return 'title not back'; }
    });
    t('the friends panel opens at its top again (scrolled down before - e.g. 로비로 after a match), a re-render keeps the scroll', () => {
      D.toTitle(); step(1);
      const P = $('pg-friends'), css = P.style.cssText;
      $('pg-friends-btn').click(); step(1);
      if (P.hidden) return 'no panel';
      P.style.bottom = 'auto'; P.style.height = '120px';         // (short enough to scroll at any test size)
      P.scrollTop = 90; const was = P.scrollTop;
      D.mp.openFriends(); step(1);
      const kept = P.scrollTop;
      D.toTitle(); step(1);
      $('pg-friends-btn').click(); step(1);
      const top = P.scrollTop;
      P.style.cssText = css; $('pg-friends-back').click(); step(1);
      if (was < 40) return 'the panel did not scroll (' + was + ')';
      if (kept !== was) return 'a re-render while open moved it: ' + was + ' -> ' + kept;
      if (top !== 0) return 'reopened at ' + top;
    });
    t('solo is still solo: one player, G.p is player 1, no name tags, getState mode/phase/role', () => {
      D.seed(3); D.start(0); step(30);
      const s = S();
      if (s.mode !== 'solo' || s.phase !== 'playing' || s.role !== 'host' || s.timeLeft !== null || s.teamLives !== null) return JSON.stringify({ m: s.mode, p: s.phase, r: s.role, t: s.timeLeft });
      if (s.players.length !== 1 || G.p !== G.players[0] || s.player.x !== s.players[0].x || s.lives !== 3) return 'player mismatch';
      if (visibleTags().length) return 'name tags shown in solo';
    });

    // ================================================================== 2. perks, measured
    const info = {};
    t('perk duck: no slowdown afloat (1.25 px/f vs 1.0 with perks off)', () => {
      soloRoom('duck');
      const a = speedAt(HOT.x0 + 4, HOT.surfY + 5 - 16), b = speedAt(COLD.x0 + 4, COLD.surfY + 5 - 16);
      D.setPerks(false); const c = speedAt(COLD.x0 + 4, COLD.surfY + 5 - 16); D.setPerks(true);
      info.duck = [a.v, b.v, c.v].map((v) => v.toFixed(2)).join('/');
      if (!a.w || !b.w || !c.w) return 'not afloat';
      if (!near(a.v, 1.25, 0.01) || !near(b.v, 1.25, 0.01) || !near(c.v, 1.0, 0.01)) return info.duck;
    });
    // (v4: the otter walks x1.12 = 1.40 on land; its swim x1.4 is kept on top of that and of the 0.8 water slowdown)
    t('perk otter: swims 1.4x (1.57 px/f afloat = walk 1.40 x 0.8 x 1.4, vs 1.00 for others); walks 1.40 on land', () => {
      soloRoom('otter');
      const a = speedAt(HOT.x0 + 4, HOT.surfY + 5 - 16), g = speedAt(24, PF_TOP + 24 * 8 - 16 + 8);
      soloRoom('frog'); const f = speedAt(HOT.x0 + 4, HOT.surfY + 5 - 16);
      info.otter = a.v.toFixed(2) + ' ground ' + g.v.toFixed(2) + ' frog afloat ' + f.v.toFixed(2);
      if (!a.w || !f.w) return 'not afloat';
      if (!near(a.v, 1.25 * 1.12 * 0.8 * 1.4, 0.01) || !near(g.v, 1.4, 0.01) || !near(f.v, 1.0, 0.01)) return info.otter;
    });
    t('perk penguin: no slowdown in cold water (hot still 0.8x); skates on ice (1.3x top speed, slow to start / stop)', () => {
      soloRoom('penguin');
      const c = speedAt(COLD.x0 + 4, COLD.surfY + 5 - 16), h = speedAt(HOT.x0 + 4, HOT.surfY + 5 - 16);
      if (!c.w || !h.w || !near(c.v, 1.25, 0.01) || !near(h.v, 1.0, 0.01)) return 'cold ' + c.v + ' hot ' + h.v;
      // freeze four bubbles on the cold pool: a 64 px ice floor
      G.bubbles = [];
      for (const x of [160, 176, 192, 208]) D.spawnBubble('empty', x, COLD.surfY - 10);
      step(2);
      if (G.ice.length < 4) return 'ice blocks ' + G.ice.length;
      const iceTop = G.ice[0].y;
      D.setPlayer(162, iceTop - 20); step(8);
      if (!G.p.onGround || Math.abs(G.p.y + 16 - iceTop) > 0.5) return 'not standing on the ice y=' + G.p.y;
      D.press('right', true); step(4); const v4 = G.p.vx;
      G.p.vx = 1.6; step(1); const top = G.p.vx;
      D.press('right', false); step(1); const slide = G.p.vx; G.p.vx = 0; step(4);
      // the duck on the same ice: full grip, normal top speed
      soloRoom('duck'); G.bubbles = [];
      for (const x of [160, 176, 192, 208]) D.spawnBubble('empty', x, COLD.surfY - 10);
      step(2); D.setPlayer(162, G.ice[0].y - 20); step(8);
      D.press('right', true); step(4); const d4 = G.p.vx; G.p.vx = 1.6; step(1); const dtop = G.p.vx; D.press('right', false); step(1); const dslide = G.p.vx;
      info.penguin = 'cold ' + c.v.toFixed(2) + ' hot ' + h.v.toFixed(2) + ' ice: 4f ' + v4.toFixed(2) + ' top ' + top.toFixed(3) + ' slide ' + slide.toFixed(2) + ' | duck 4f ' + d4.toFixed(2) + ' top ' + dtop.toFixed(2) + ' slide ' + dslide.toFixed(2);
      if (!(v4 < 0.45 && d4 > 1.2)) return 'start ' + info.penguin;
      if (!near(top, 1.625, 0.01) || !near(dtop, 1.25, 0.01)) return 'top ' + info.penguin;
      if (!(slide > 1.4 && dslide < 1.0)) return 'slide ' + info.penguin;
    });
    // (v4: CAT_JUMP 1.08 is retired - the cat jumps like everyone and has the double jump instead, char-kits §7)
    t('perk cat: jumps like everyone (38.2), a 2nd press at the top reaches ~64 px; touching water flings it up ("냥!"), it never floats', () => {
      const apex = (char, dj) => {
        soloRoom(char); D.setPlayer(20, PF_TOP + 24 * 8 - 16); step(20);
        const y0 = G.p.y; let minY = y0; D.press('jump', true); step(1); D.press('jump', false);
        for (let f = 0; f < 70; f++) { if (dj && f === 18) { D.press('jump', true); step(1); D.press('jump', false); } step(1); minY = Math.min(minY, G.p.y); }
        return y0 - minY;
      };
      const dj = apex('duck'), cj = apex('cat'), c2 = apex('cat', true);
      soloRoom('cat'); G.words = [];
      D.setPlayer(HOT.x0 + 20, HOT.surfY - 40);
      let floated = 0, deepest = -1e9, popped = 0;
      for (let f = 0; f < 150; f++) { const vy0 = G.p.vy; step(1); if (G.p.water) floated++; deepest = Math.max(deepest, G.p.y + 16 - HOT.surfY); if (vy0 > 0 && G.p.vy < -3) popped++; }
      const nyang = G.words.some((w) => w.txt === '냥!') || [...document.querySelectorAll('#pg-words .pg-word')].some((el) => el.textContent === '냥!');
      info.cat = 'apex duck ' + dj.toFixed(1) + ' cat ' + cj.toFixed(1) + ' cat double jump ' + c2.toFixed(1) + ' | pool: floated ' + floated + ' deepest ' + deepest.toFixed(1) + ' pops ' + popped;
      if (!near(cj, dj, 0.05) || !near(dj, 38.2, 0.6) || !(c2 >= 63 && c2 <= 66)) return 'apex ' + info.cat;
      if (floated || deepest > 6 || popped < 1) return info.cat;
      if (!nyang) return 'no 냥! puff';
    });
    // (v4: FROG_CD 0.7 is retired - the frog's kit cooldown is 12 / 20, char-kits §8)
    t('perk frog: bubble cooldown 12 / 20 (shot cd 12 vs 14, auto-fire 20 vs 24: one more bubble in 2 s)', () => {
      const shots = (char) => {
        soloRoom(char); D.setPlayer(20, PF_TOP + 24 * 8 - 16); step(10); G.bubbles = [];
        const ids = new Set();
        D.press('shoot', true); step(1); const cd = G.p.shootCd;
        for (let f = 0; f < 119; f++) { step(1); for (const b of G.bubbles) ids.add(b.id); }
        D.press('shoot', false);
        return { cd, n: ids.size + 0 };
      };
      const d = shots('duck'), f = shots('frog');
      info.frog = 'duck cd ' + d.cd + ' shots/2s ' + d.n + ' | frog cd ' + f.cd + ' shots/2s ' + f.n;
      if (d.cd !== 13 && d.cd !== 14) return info.frog;
      if (f.cd !== 11 && f.cd !== 12) return info.frog;
      if (!(f.n >= d.n + 1)) return info.frog;
    });
    t('perk capybara: walks 0.92x; entering hot water gives a 3 s shield that blocks one hit', () => {
      soloRoom('capy');
      const g = speedAt(24, PF_TOP + 24 * 8 - 16 + 8);
      if (!near(g.v, 1.25 * 0.92, 0.01)) return 'walk ' + g.v;
      D.setPlayer(HOT.x0 + 10, HOT.surfY - 30); step(30);
      const sh = G.p.shield;
      if (!G.p.water || !(sh > 120 && sh <= 180)) return 'shield ' + sh + ' water ' + G.p.water;
      D.setInvincible(false); G.p.invuln = 0;
      const e = G.enemies[0]; activate(e, G.p.x, G.p.y); step(1);
      if (G.mode !== 'playing' || G.p.dead || G.p.shield !== 0 || !(G.p.invuln > 0)) return 'shield did not block: mode ' + G.mode + ' shield ' + G.p.shield;
      park(e); step(70); activate(e, G.p.x, G.p.y); step(1);
      info.capy = 'walk ' + g.v.toFixed(3) + ' shield ' + sh;
      if (G.mode !== 'dying') return 'second hit did not count: ' + G.mode;
      D.setInvincible(true);
    });
    log('MP INFO perks ' + JSON.stringify(info));
    restoreRoom();

    // ================================================================== 3. co-op (같이 하기)
    t('co-op start: 4 players at 4 spawns, team lives 3+3, per-player name tags in slot colours', () => {
      D.seed(21); D.local.coop(['duck', 'cat', 'frog', 'otter'], 0); D.setInvincible(true);
      G.enemies.forEach(park);
      step(40);
      const s = S();
      if (s.mode !== 'coop' || s.phase !== 'playing' || s.players.length !== 4 || s.teamLives !== 6 || s.lives !== 6) return JSON.stringify({ m: s.mode, ph: s.phase, n: s.players.length, tl: s.teamLives });
      const xs = s.players.map((p) => p.x);
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (Math.abs(xs[i] - xs[j]) < 15 && Math.abs(s.players[i].y - s.players[j].y) < 8) return 'spawns overlap ' + xs.join(',');
      if (s.players.some((p) => !p.onGround || p.water || p.dead)) return 'not standing ' + JSON.stringify(s.players.map((p) => [p.onGround, p.water]));
      const tags = visibleTags();
      if (tags.length !== 4) return 'tags ' + tags.length;
      // (name tags v2, distinction 2.6: the seat chip + the nick - the nick is the .pg-tag-t part)
      const nick2 = tags[1].querySelector('.pg-tag-t'), num2 = tags[1].querySelector('.pg-tag-n');
      if (!nick2 || nick2.textContent !== 'P2' || !num2 || num2.textContent !== '2' || !/f6a6bd/i.test(tags[1].style.getPropertyValue('--slot'))) return 'tag 2 ' + tags[1].textContent + ' ' + tags[1].style.getPropertyValue('--slot');
    });
    t('per-slot input: press(right, true, 2) moves only player 3', () => {
      const x0 = G.players.map((p) => p.x);
      D.press('right', true, 2); step(20); D.press('right', false, 2); step(10);
      const dx = G.players.map((p, i) => p.x - x0[i]);
      if (!(dx[2] > 10) || dx.some((d, i) => i !== 2 && Math.abs(d) > 0.5)) return dx.map((d) => d.toFixed(1)).join(',');
    });
    t('personal scores: player 2 traps a grime with its own bubble and pops it (+500 to P2 only, team score = sum)', () => {
      const p2 = P(1), e = G.enemies[0];
      for (const [s, x] of [[0, 150], [2, 170], [3, 190]]) D.setPlayer(x, 60, s); // partners out of the way
      step(40);
      activate(e, p2.x + 34, p2.y); p2.facing = 1; G.bubbles = [];
      const sc = G.players.map((p) => p.score), team0 = G.score;
      D.press('shoot', true, 1); step(1); D.press('shoot', false, 1);
      if (until(() => e.state === 'trapped', 20) < 0) return 'not captured: ' + e.state;
      const b = G.bubbles.find((q) => q.kind === 'trapped');
      if (!b || b.owner !== 1) return 'bubble owner ' + (b && b.owner);
      D.setPlayer(b.x, b.y, 1); step(2);
      if (e.state !== 'dead') return 'not popped';
      const gain = G.players.map((p, i) => p.score - sc[i]);
      if (gain[1] !== 500 || gain[0] || gain[2] || gain[3] || P(1).kills !== 1) return 'gains ' + gain.join(',');
      if (G.score - team0 !== 500) return 'team score ' + (G.score - team0);
      park(e); e.state = 'descend';
    });
    t('ghost: a hit makes a ghost bubble (the game goes on); a partner\'s touch revives it there with 2 s blink', () => {
      D.setInvincible(false); for (const p of G.players) p.invuln = 0;
      const p2 = P(1), e = G.enemies[1];
      activate(e, p2.x, p2.y); step(1); park(e);
      if (!p2.dead || p2.ghost || S().phase !== 'playing' || P(0).dead) return 'not fallen ' + JSON.stringify(S().players[1]).slice(0, 120);
      if (until(() => !!p2.ghost, 60) < 0) return 'no ghost';
      if (sfx.indexOf('ghost') < 0) return 'no ghost sfx';
      const y0 = p2.y; step(60);
      if (!(p2.y < y0 - 4)) return 'ghost not floating up';
      if (y0 - p2.y > 6) return 'ghost rising too fast (' + (y0 - p2.y).toFixed(1) + ' px in 1 s)';
      D.setInvincible(true);
      const lives = G.lives, p1 = P(0);
      D.setPlayer(p2.x, p2.y, 0); step(1);
      if (p2.dead || p2.ghost || !(p2.invuln > 100) || p1.revives !== 1 || G.lives !== lives) return 'revive ' + JSON.stringify({ d: p2.dead, g: !!p2.ghost, inv: p2.invuln, rv: p1.revives, l: G.lives });
      if (Math.abs(p2.x - p1.x) > 20) return 'not revived on the spot';
      if (sfx.indexOf('revive') < 0) return 'no revive sfx';
    });
    t('ghost timeout: after 8 s alone it respawns at its spawn and the team loses a life', () => {
      step(130);
      for (const [i, x] of [[0, 30], [1, 46], [3, 62]]) D.setPlayer(x, 150, i); // partners out of the way (left side)
      const p3 = P(2); D.setPlayer(200, 150, 2); step(40);
      const lives = G.lives;
      D.hitPlayer(2);
      const n = until(() => !p3.dead, 600);
      const sp = LV[0].players[2];
      if (n < 0) return 'never came back';
      if (!(n > 500 && n < 540)) return 'came back after ' + n + ' frames';
      if (G.lives !== lives - 1) return 'lives ' + lives + ' -> ' + G.lives;
      if (Math.abs(p3.x - (sp.col * 8 - 4)) > 1 || !(p3.invuln > 60)) return 'not at its spawn / blinking x=' + p3.x;
    });
    t('power-up: whoever touches it gets it (others do not)', () => {
      const p4 = P(3); G.pickup = null;
      D.spawnPickup('slippers', p4.x + 8, p4.y + 8);
      if (until(() => !G.pickup, 10) < 0) return 'not collected';
      if (!p4.power || p4.power.type !== 'slippers' || G.players.some((p) => p !== p4 && p.power)) return G.players.map((p) => p.power && p.power.type).join(',');
    });
    t('co-op HUD + name tags show ghost / per-player panels (no exceptions while drawing)', () => {
      for (const [i, x] of [[0, 30], [2, 62], [3, 94]]) D.setPlayer(x, 150, i);
      D.setPlayer(200, 150, 1); step(20);
      D.hitPlayer(1); step(45);
      const tags = visibleTags();
      if (!tags.some((el) => el.classList.contains('is-ghost'))) return 'no ghost tag';
      step(5);
    });
    t('game over only when nobody is up and the team has no lives; result table: 4 rows + one MVP crown', () => {
      for (const p of G.players) if (p.ghost) { D.setPlayer(p.x, p.y, (p.slot + 1) % 4); }
      step(2);
      G.lives = 0;
      for (let s = 0; s < 4; s++) if (!P(s).dead) D.hitPlayer(s);
      const n = until(() => G.mode === 'gameover', 200);
      if (n < 0) return 'no game over: ' + G.mode + ' ' + JSON.stringify(S().players.map((p) => [p.dead, p.ghost]));
      if ($('pg-over').hidden) return 'over card hidden';
      const rows = document.querySelectorAll('#pg-over-team .pg-team-row');
      const mvp = document.querySelectorAll('#pg-over-team .pg-mvp');
      if (rows.length !== 4 || mvp.length !== 1) return 'rows ' + rows.length + ' mvp ' + mvp.length;
      const top = G.players.slice().sort((a, b) => b.score - a.score)[0];
      const mvpRow = [...rows].find((r) => r.querySelector('.pg-mvp'));
      // (the nick cell starts with the seat number chip, distinction 2.10)
      const nickCell = mvpRow && mvpRow.querySelector('.pg-team-nick'), chip = nickCell && nickCell.querySelector('.pg-tag-n');
      if (!nickCell || !chip || chip.textContent !== String(top.slot + 1) || nickCell.textContent.slice(chip.textContent.length) !== (top.nick || 'P' + (top.slot + 1))) return 'mvp row ' + (mvpRow && mvpRow.textContent);
      if (!/때 \d+ · 구조 \d+/.test(rows[0].textContent)) return 'stats text ' + rows[0].textContent;
    });
    t('one partner still up keeps the game going even with 0 team lives', () => {
      D.seed(22); D.local.coop(['duck', 'cat'], 0); D.setInvincible(true); G.enemies.forEach(park); step(20);
      G.lives = 0; D.hitPlayer(1);
      for (let f = 0; f < 700; f++) { D.setPlayer(220, 196, 0); step(1); } // (the ghost drifts toward its partner: keep away)
      if (G.mode !== 'playing' || !P(1).out) return 'mode ' + G.mode + ' out ' + P(1).out;
      D.hitPlayer(0);
      if (until(() => G.mode === 'gameover', 200) < 0) return 'no game over when the last one fell';
    });
    t('round clear brings every fallen partner back at the next round', () => {
      D.seed(23); D.local.coop(['duck', 'cat', 'frog'], 0); D.setInvincible(true); step(20);
      D.hitPlayer(1); step(50);
      D.killAll();
      if (until(() => G.round === 1 && G.mode === 'playing', 900) < 0) return 'no next round: ' + G.mode + ' r' + G.round;
      if (G.players.some((p) => p.dead || p.ghost)) return 'still fallen';
    });
    t('boss scaling: soap x(1 + 0.4(n-1)) with HP unchanged, minion cap +1 per extra player', () => {
      const soap = {}, minions = {};
      for (const n of [1, 3]) {
        const chars = ['duck', 'cat', 'frog'].slice(0, n);
        D.seed(30);
        if (n === 1) D.start(5); else D.local.coop(chars, 5);
        D.setInvincible(true);
        const b = G.boss;
        soap[n] = b.soapMax + '/' + b.hp;
        D.soapBoss(0);
        for (let k = 0; k < 8; k++) { b.minionT = 1; b.calm = 0; step(1); }
        minions[n] = G.enemies.filter((e) => e.state !== 'dead').length;
      }
      log('MP INFO boss soap/hp ' + JSON.stringify(soap) + ' minions ' + JSON.stringify(minions));
      if (soap[1] !== '8/3' || soap[3] !== '14/3') return JSON.stringify(soap);
      if (minions[1] !== 4 || minions[3] !== 6) return JSON.stringify(minions);
    });
    t('a second player joining a solo game turns it into co-op (+1 team life)', () => {
      D.seed(31); D.start(0); step(5);
      const slot = D.local.addPlayer('frog', '개구리친구');
      const s = S();
      if (slot !== 1 || s.mode !== 'coop' || s.players.length !== 2 || s.lives !== 4 || s.players[1].nick !== '개구리친구') return JSON.stringify({ slot, m: s.mode, n: s.players.length, l: s.lives });
      D.local.removePlayer(1);
      if (S().players.length !== 1 || S().lives !== 4) return 'remove keeps lives';
    });

    // ================================================================== 4. battle (배틀)
    const B4 = ['duck', 'cat', 'frog', 'penguin'];
    function battle(opts) {
      D.seed(40); D.local.battle(B4, Object.assign({ arena: 0, time: 3 }, opts || {})); D.setInvincible(true);
      G.enemies.forEach(park); G.battle.enemyT = 1e9; G.battle.powerT = 1e9;
      for (const p of G.players) p.invuln = 0; // (the 2.5 s start blink: these tests are about the trap rules)
      step(30);
    }
    t('battle start: 4 players at the arena spawns, 3:00 timer, grime family spawned, battle music', () => {
      music.length = 0;
      D.seed(40); D.local.battle(B4, { arena: 0, time: 3 });
      const s = S(), A0 = D.arenas()[0];
      if (s.mode !== 'battle' || s.phase !== 'playing' || s.timeLeft !== 180 || s.players.length !== 4 || s.arena !== 0) return JSON.stringify({ m: s.mode, p: s.phase, t: s.timeLeft });
      for (let i = 0; i < 4; i++) if (Math.abs(s.players[i].x - (A0.players[i].col * 8 - 4)) > 0.5) return 'player ' + i + ' not at its spawn';
      if (!(G.enemies.length >= 1 && G.enemies.length <= 6)) return 'enemies ' + G.enemies.length;
      if (music.indexOf('battle') < 0 && G.music !== 'battle') return 'music ' + G.music;
      step(60);
      if (!(S().timeLeft < 179.1)) return 'timer not running ' + S().timeLeft;
    });
    t('a shot bubble traps an opponent (not its owner): trapped bubble in the trapper\'s slot', () => {
      battle();
      const p1 = P(0), p2 = P(1);
      D.setPlayer(40, 196, 0); D.setPlayer(70, 196, 1); D.setPlayer(200, 100, 2); D.setPlayer(220, 100, 3); step(20);
      if (!p1.onGround || !p2.onGround || Math.abs(p1.y - p2.y) > 0.5) return 'not on one floor ' + p1.y + ' ' + p2.y;
      G.bubbles = []; p1.facing = 1;
      D.press('shoot', true, 0); step(1); D.press('shoot', false, 0);
      if (until(() => !!p2.trap, 12) < 0) return 'not trapped';
      const b = G.bubbles.find((q) => q.kind === 'player');
      if (!b || b.owner !== 0 || b.victim !== p2 || p1.trap) return 'bubble ' + (b && b.owner);
      if (sfx.indexOf('trap_player') < 0) return 'no trap sfx';
      if (!S().players[1].trapped) return 'getState trapped';
    });
    let soloFrames = 0, mashFrames = 0, presses = 0;
    t('trapped alone: breaks free after ~4 s (and floats up meanwhile)', () => {
      const p2 = P(1), y0 = p2.y;
      soloFrames = until(() => !p2.trap, 400);
      if (!(soloFrames >= 230 && soloFrames <= 250)) return 'frames ' + soloFrames;
      if (!(y0 - Math.min(y0, p2.y) >= 0)) return 'did not rise';
    });
    t('mashing jump / shoot breaks out much faster (12 presses ~ 1.5 s)', () => {
      step(70);
      const p2 = P(1); D.trapPlayer(1, 0);
      if (!p2.trap) return 'not trapped';
      let f = 0; presses = 0;
      // about 8 presses a second (one every 7 frames), alternating jump and shoot
      while (p2.trap && f < 400) { if (f % 7 === 0) { D.press(presses % 2 ? 'shoot' : 'jump', true, 1); presses++; } step(1); D.press('jump', false, 1); D.press('shoot', false, 1); f++; }
      mashFrames = f;
      log('MP INFO escape: alone ' + soloFrames + ' frames, mashing ' + mashFrames + ' frames / ' + presses + ' presses');
      if (p2.trap) return 'never escaped';
      if (!(mashFrames >= 75 && mashFrames <= 100 && presses >= 11 && presses <= 14)) return mashFrames + ' frames ' + presses + ' presses';
    });
    t('뽀득 KO: a third player touches the trapped bubble: +500 to it, the victim respawns after 1.5 s blinking 2 s', () => {
      step(70);
      const p2 = P(1), p3 = P(2); D.trapPlayer(1, 0);
      const b = p2.trap.b, s3 = p3.score;
      G.words = [];
      // a fresh prison is safe for 15 frames (no same-frame KO), then anyone else's touch pops it
      let n0 = 0;
      while (!S().players[1].ko && n0 < 30) { D.setPlayer(b.x, b.y, 2); step(1); n0++; }
      if (n0 < 15) return 'KO inside the grace, after ' + n0 + ' frames';
      if (!S().players[1].ko || p3.score - s3 !== 500 || p3.kos !== 1 || p2.koed !== 1) return JSON.stringify({ ko: S().players[1].ko, gain: p3.score - s3, kos: p3.kos });
      if (!G.words.some((w) => w.txt === '뽀득 KO!')) return 'no 뽀득 KO! word';
      if (sfx.indexOf('ko') < 0) return 'no ko sfx';
      const n = until(() => !p2.koT, 120);
      if (!(n >= 85 && n <= 92)) return 'respawn after ' + n;
      const A0 = D.arenas()[0];
      if (!A0.players.some((sp) => Math.abs(p2.x - (sp.col * 8 - 4)) < 1) || !(p2.invuln > 110)) return 'respawn spot / blink ' + p2.x + ' inv ' + p2.invuln;
    });
    t('enemy points in battle: 100 x combo position (a 3-chain = 600)', () => {
      // everyone else well away from the bubbles (bottom corners of the arena)
      D.setPlayer(20, 196, 0); D.setPlayer(36, 196, 1); D.setPlayer(210, 196, 2); D.setPlayer(226, 150, 3); step(30);
      const keep = G.enemies.slice(0, 3);
      const spare = G.enemies[3]; // (kept aside, parked: the stun test below needs one live enemy)
      G.enemies = keep;
      keep.forEach((e, k) => { activate(e, 112 + k * 2, 80); e.soakT = 0; });
      G.bubbles = []; D.trapAll(); step(3);
      const p4 = P(3), s4 = p4.score;
      const b = G.bubbles.find((q) => q.kind === 'trapped');
      D.setPlayer(b.x, b.y, 3);
      step(20);
      if (spare && G.enemies.indexOf(spare) < 0) { park(spare); G.enemies.push(spare); }
      if (p4.score - s4 !== 600 || p4.kills !== 3) return 'gain ' + (p4.score - s4) + ' kills ' + p4.kills + ' ' + JSON.stringify({ p4: S().players[3], b: b && [b.kind, b.state, b.x, b.y, b.dead], enemies: keep.map((e) => e.state), bubbles: G.bubbles.map((q) => [q.kind, q.state, Math.round(q.x), Math.round(q.y)]) });
    });
    t('hit by an enemy in battle: stunned 1 s, -100, no lives lost, then a short blink', () => {
      const p1 = P(0); p1.score = 500; p1.invuln = 0; D.setPlayer(150, 120, 0); step(20);
      D.setInvincible(false);
      const e = G.enemies.find((q) => q.state !== 'dead') || G.enemies[0];
      activate(e, p1.x, p1.y); step(1); park(e);
      D.setInvincible(true);
      if (!S().players[0].stunned || p1.score !== 400 || p1.dead || p1.koT) return JSON.stringify({ st: S().players[0].stunned, sc: p1.score });
      const n = until(() => !p1.stunT, 80);
      // (then a short blink: 0.5 s - an enemy hit is not a 2 s shield against rivals' bubbles)
      if (!(n >= 55 && n <= 62) || !(p1.invuln > 20 && p1.invuln <= 30)) return 'stun frames ' + n + ' inv ' + p1.invuln;
    });
    t('보스 난입 at 1:30 left: a weaker boss (half soap, 1 HP); its giant-bubble burst pays +1500 to the burster', () => {
      battle();
      const SOAP = { kingGrime: 8, moldQueen: 10, megaSponge: 12, towelKing: 14 };
      D.setTimeLeft(90.05); const seen = [];
      for (let i = 0; i < 6; i++) { step(1); if (G.banner) seen.push(G.banner.main); }
      const b = G.boss;
      if (!b || !b.intruder || b.hp !== 1 || b.soapMax !== Math.round(SOAP[b.type] / 2)) return JSON.stringify(b && { t: b.type, hp: b.hp, s: b.soapMax });
      if (seen.indexOf('보스 난입!') < 0) return 'banner ' + seen.join(',');
      const nEnemies = G.enemies.length;
      D.stunBoss();
      const g = G.boss.giant; if (!g) return 'no giant bubble';
      const p2 = P(1), s2 = p2.score;
      D.setPlayer(g.x + 12, g.y + 12, 1); step(1);
      if (p2.score - s2 !== 1500 || G.boss.state !== 'defeat') return 'burst gain ' + (p2.score - s2) + ' state ' + (G.boss && G.boss.state);
      if (until(() => !G.boss, 200) < 0) return 'intruder never left';
      if (G.mode !== 'playing' || G.clearT >= 0 || G.enemies.length !== nEnemies) return 'the match did not go on';
      log('MP INFO intruder ' + b.type + ' soap ' + b.soapMax);
    });
    t('time up -> podium: ranked by score, crowns, podium music, 한 판 더 restarts the same match', () => {
      battle();
      [300, 1200, 700, 0].forEach((sc, i) => { P(i).score = sc; });
      music.length = 0; D.setTimeLeft(0.05); step(5);
      const s = S();
      if (s.phase !== 'podium' || s.podium.join() !== '1,2,0,3') return 'podium ' + s.phase + ' ' + JSON.stringify(s.podium);
      if ($('pg-podium').hidden || music.indexOf('podium') < 0) return 'overlay / music ' + music.join(',');
      if (S().players[1].rank !== 1 || S().players[3].rank !== 4) return 'ranks';
      if (visibleTags().length !== 4) return 'tags on the podium ' + visibleTags().length;
      step(30);
      $('pg-podium-again').click();
      const s2 = S();
      if (s2.phase !== 'countdown' || s2.mode !== 'battle' || s2.players.some((p) => p.score) || s2.players.length !== 4 || s2.timeLeft !== 180) return 'rematch ' + JSON.stringify({ p: s2.phase, sc: s2.players.map((p) => p.score) });
      const seen = [];
      for (let i = 0; i < 185; i++) { step(1); if (G.banner) seen.push(G.banner.main); }
      if (S().phase !== 'playing') return 'countdown did not end: ' + S().phase;
      if (['3', '2', '1', '시작!'].some((x) => seen.indexOf(x) < 0)) return 'countdown banners ' + [...new Set(seen)].join(',');
      if (sfx.filter((n) => n === 'countdown').length < 3 || sfx.indexOf('go') < 0) return 'countdown sfx';
    });
    t('로비로 from the podium leaves the match', () => {
      D.endBattle(); step(2);
      $('pg-podium-lobby').click(); step(2);
      if (typeof PG.toLobby !== 'function' && (S().phase !== 'title' || S().mode !== 'solo')) return S().phase + ' ' + S().mode;
    });
    t('battle options: 2 minutes, 능력 끄기 (perks off), 보스 난입 off', () => {
      D.seed(41); D.local.battle(B4, { arena: 1, time: 2, perks: false, intrusion: false }); D.setInvincible(true);
      if (S().timeLeft !== 120 || !G.perksOff || S().arena !== 1) return JSON.stringify({ t: S().timeLeft, perks: G.perksOff });
      D.setTimeLeft(89); step(10);
      if (G.boss) return 'boss came in with 보스 난입 off';
      D.seed(42); D.local.battle(B4, { arena: 2 });
      if (G.perksOff) return 'perks stay off';
    });
    t('every arena loads with 4 spawns and the grime family; 2000 frames of random play per arena stay sane', () => {
      const n = D.arenas().length;
      if (n < 1) return 'no arenas';
      let rs = 99;
      const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
      for (let a = 0; a < n; a++) {
        D.seed(50 + a); D.local.battle(B4, { arena: a, time: 3 });
        G.battle.left = INTRUDE_AT() + 600;
        for (let f = 0; f < 2000; f++) {
          if (f % 6 === 0) for (let s = 0; s < 4; s++) { const r = rnd(); D.press('left', r < 0.3, s); D.press('right', r > 0.6, s); D.press('jump', rnd() < 0.2, s); D.press('shoot', rnd() < 0.3, s); }
          step(1);
          for (const p of G.players) if (!isFinite(p.x) || !isFinite(p.y) || p.x < -8 || p.x > 256 || p.y < -8 || p.y > 240) return 'arena ' + a + ' player ' + p.slot + ' at ' + p.x + ',' + p.y;
          if (G.enemies.filter((e) => e.state !== 'dead').length > 6 + 4) return 'too many enemies';
        }
        releaseAll();
        if (!G.battle.intruded) return 'arena ' + a + ' no intrusion';
      }
    });

    // ================================================================== 5. leftovers
    t('back to the title restores solo with the picked animal', () => {
      D.toTitle(); step(2);
      if (S().mode !== 'solo' || S().phase !== 'title' || S().players.length !== 1 || visibleTags().length) return JSON.stringify({ m: S().mode, p: S().phase });
    });
    t('no uncaught page errors', () => (errors ? errors + ' errors' : true));
    log('MP DONE pass=' + pass + ' fail=' + fail + (fails.length ? ' failed: ' + fails.join(' | ') : ''));
  }
  const INTRUDE_AT = () => 90 * 60;

  // ------------------------------------------------------------------ screenshot scenes
  function shot(scene) {
    const D = PG.debug, G = D.G;
    const park = (e) => { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; };
    if (scene === 'title') {
      D.toTitle(); D.step(1);
      const b = document.querySelector('#pg-pick [data-char="cat"]'); if (b) b.click();
      D.step(90);
    } else if (scene === 'coop') {
      D.seed(9); D.local.coop([{ char: 'duck', nick: '뽀송' }, { char: 'capy', nick: '까삐랑' }, { char: 'cat', nick: '냥이' }, { char: 'frog', nick: '개굴' }], 1);
      D.setInvincible(true); D.step(120);
      D.setPlayer(150, 60, 1); D.setPlayer(200, 150, 2); D.setPlayer(60, 120, 3); D.step(40);
      D.hitPlayer(2); D.step(90);
      G.players[3].facing = 1; D.press('shoot', true, 3); D.press('right', true, 0); D.step(30); D.press('shoot', false, 3); D.press('right', false, 0); D.step(4);
      G.players[0].score = 3500; G.players[1].score = 1200; G.players[3].score = 800; G.score = 5500; G.stamps = 3;
    } else if (scene === 'battle') {
      D.seed(12); D.local.battle([{ char: 'duck', nick: '뽀송' }, { char: 'otter', nick: '해달' }, { char: 'penguin', nick: '펭' }, { char: 'frog', nick: '개굴' }], { arena: 1 });
      D.setInvincible(true); D.step(150);
      D.trapPlayer(1, 0); D.step(40); D.hitPlayer(3); D.step(10);
      G.players[0].score = 1300; G.players[1].score = 400; G.players[2].score = 900; G.players[3].score = 200; G.players[0].kos = 2;
    } else if (scene === 'podium') {
      D.seed(12); D.local.battle([{ char: 'duck', nick: '뽀송' }, { char: 'otter', nick: '해달' }, { char: 'penguin', nick: '펭' }, { char: 'cat', nick: '냥냥이' }], { arena: 3 });
      D.step(30); [2400, 900, 3100, 500].forEach((s, i) => { G.players[i].score = s; });
      D.endBattle(); D.step(80);
    } else if (scene === 'over') {
      D.seed(9); D.local.coop([{ char: 'duck', nick: '뽀송' }, { char: 'capy', nick: '까삐랑' }, { char: 'cat', nick: '냥이' }], 2);
      G.enemies.forEach(park); D.step(10);
      [4200, 7300, 1500].forEach((s, i) => { G.players[i].score = s; G.players[i].kills = i * 3 + 2; G.players[i].revives = i; });
      G.score = 13000; G.lives = 0; for (let s = 0; s < 3; s++) D.hitPlayer(s);
      D.step(200);
    }
    console.log('MP SHOT READY ' + scene + ' ' + JSON.stringify({ mode: D.getState().mode, phase: D.getState().phase }));
  }
  function go() {
    if (!window.PG || !PG.debug || !PG.debug.G || !PG.debug.local) return setTimeout(go, 30);
    setTimeout(() => {
      const scene = location.hash.slice(1);
      try { if (scene) shot(scene); else run(); } catch (e) { console.log('MP FAIL exception ' + e.message + ' ' + String(e.stack || '').split('\n')[1]); console.log('MP DONE pass=' + pass + ' fail=' + (fail + 1)); }
    }, 60);
  }
  go();
})();
