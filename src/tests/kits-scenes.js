// v4 kit LOOKS (design/char-kits.md §2.6, the "Look" parts of §3-§8, §11): stages every animal's move and bubble
// through PG.debug and shows them for a screenshot. The sheets are zoomed crops of the game canvas laid over the page
// (each cell: one moment, labelled); the battle scenes are the real page.
//   node bogeul/build.js
//   node bogeul/tools/run-chrome.js "test-kits-scenes.html?scene=moves" kits-moves.png 900 760 9000
//   scene = moves (each animal mid-move, 3x crops) | bubbles (each animal's bubble in flight, 3x crops) |
//           battle (4 players, mixed bubbles in flight, slot rings, a move) | battle2 (the other animals) |
//           off (the same battle with 능력 끄기) | fallback (moves + bubbles with the optional v4 sprites removed:
//           the spec's fallback poses, no glyphs - never a stand-in box) | hint (the first round's 특기 banner, ?c=) |
//           count (the countdown's 내 특기 line; &off=1: 능력 끄기) | solo (one animal in round 1, ?c=<animal>)
//   &calm=1 emulates prefers-reduced-motion (trails, afterimages and rings culled)
// Checks (printed "KS PASS|FAIL <name>", then "KS DONE pass=N fail=M"): the scene staged without page errors; each
// staged moment shows the body bit / bubble state it is meant to; with 능력 끄기 the six animals' bubbles draw
// pixel-identical (canvas hash) and no move bit is ever set.
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => { if (cond) { pass++; log('KS PASS ' + name); } else { fail++; log('KS FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); } };
  const Q = new URLSearchParams(location.search);
  const scene = Q.get('scene') || 'moves';
  const CH = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'];
  window.addEventListener('error', (e) => { fail++; log('KS FAIL page error: ' + e.message + ' @' + e.lineno); });
  if (Q.get('calm') === '1') {
    // (the engine already holds its MediaQueryList: answer through the prototype's getter)
    const d = Object.getOwnPropertyDescriptor(MediaQueryList.prototype, 'matches');
    Object.defineProperty(MediaQueryList.prototype, 'matches', { configurable: true, get() { return /reduced-motion: reduce/.test(this.media) || d.get.call(this); } });
  }

  function run() {
    const D = PG.debug, G = D.G, LV = D.levels(), AR = D.arenas();
    const step = (n) => { for (let i = 0; i < (n === undefined ? 1 : n); i++) D.step(1); };
    const release = () => { for (const k of ['left', 'right', 'jump', 'shoot']) for (let s = 0; s < 4; s++) D.press(k, false, s); };
    const tap = (k, s) => { D.press(k, true, s | 0); step(1); D.press(k, false, s | 0); };
    const P = (s) => G.players.find((q) => q.slot === (s | 0));
    const cv = document.getElementById('pg-canvas');
    // ---- a lab room over round 1 (a flat floor, feet 216)
    const L0 = LV[0];
    const mk = (fn) => { const m = []; for (let r = 0; r < 26; r++) m.push(fn(r)); return m; };
    const WALLS = '##' + '.'.repeat(28) + '##', SOLID = '#'.repeat(32);
    const ROOM_F = mk((r) => (r === 0 || r === 25 ? SOLID : WALLS));
    const SPAWNS = [{ col: 4, row: 24 }, { col: 27, row: 24 }, { col: 10, row: 24 }, { col: 20, row: 24 }];
    const park = () => { for (const e of G.enemies) { e.state = 'descend'; e.delay = 1e9; e.startY = -300; e.t = 0; e.y = -300; } };
    const clean = () => { G.bubbles = []; G.items = []; G.pickup = null; G.stampT = 1e9; G.steamT = -1; G.words = []; G.ice = []; G.parts = []; G.kfx = []; G.banner = null; G.bannerQ = []; };
    function solo(char, perksOff) {
      Object.assign(L0, { map: ROOM_F, player: SPAWNS[0], players: SPAWNS, gather: { col: 16, row: 3 }, gapX: 16 * 8, special: undefined, boss: null,
        enemies: [{ type: 'grime', col: 20, row: 24, dir: 1 }] });
      D.seed(7); D.start(0, char); D.setInvincible(true); D.setPerks(!perksOff);
      park(); step(90); park(); clean(); release();
      const p = P(0);
      Object.assign(p, { x: 40, y: 200, vx: 0, vy: 0, onGround: true, facing: 1, airT: 0, mv: '', mvT: 0, mvUsed: false, mvCd: 0, glideT: 0, hop: 0, hopAir: false, landT: 30, invuln: 0, shootCd: 0, autoCd: 0 });
      step(2);
      return p;
    }
    // ---- the contact sheet: zoomed crops of the game canvas, one labelled cell per moment
    const Z = +(Q.get('z') || 3), cells = [];
    function snap(label, gx, gy, w, h) {
      const c = document.createElement('canvas'); c.width = w * Z; c.height = h * Z;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      x.drawImage(cv, Math.round(gx), Math.round(gy), w, h, 0, 0, w * Z, h * Z);
      cells.push({ label, c });
    }
    function showSheet(title, maxW) {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b1c1f;color:#e8f4f0;font:12px system-ui,sans-serif;padding:6px;overflow:hidden;display:flex;flex-wrap:wrap;gap:4px 8px;align-content:flex-start;max-width:' + maxW + 'px;box-sizing:border-box';
      const t = document.createElement('div'); t.textContent = title; t.style.cssText = 'flex:0 0 100%;font-weight:700'; box.appendChild(t);
      for (const { label, c } of cells) {
        const f = document.createElement('figure'); f.style.cssText = 'margin:0';
        c.style.cssText = 'display:block;image-rendering:pixelated;border:1px solid #2f5f5a';
        const cap = document.createElement('figcaption'); cap.textContent = label; cap.style.cssText = 'font-size:11px;line-height:13px;white-space:nowrap';
        f.append(cap, c); box.appendChild(f);
      }
      document.body.appendChild(box);
    }
    const around = (p, w, h, dx, dy) => [p.x + 8 - w / 2 + (dx || 0), p.y + 8 - h / 2 + (dy || 0), w, h];
    const W0 = 80, H0 = 44; // (every moves cell the same size: 3 to a row at 3x)
    const until = (fn, max) => { for (let i = 0; i < (max || 200) && !fn(); i++) step(1); return fn(); };

    // ---- each animal mid-move
    function moves() {
      let p;
      // duck: jump and hold - it glides after the apex (wings up / down)
      p = solo('duck'); D.press('jump', true, 0); step(30);
      ok('duck glides (A)', p.mv === 'glide' && p.mvA, [p.mv, p.vy]); snap('duck 둥실 활공 (up)', ...around(p, W0, H0));
      const f0 = (p.glideT / 6) | 0; until(() => ((p.glideT / 6) | 0) !== f0, 12); snap('duck 둥실 활공 (down)', ...around(p, W0, H0));
      until(() => p.glideT >= 50, 60); snap('duck meter ending (flaps faster)', ...around(p, W0, H0)); release();
      // capy: jump, press again at the top: wind-up, slam, landing splash
      p = solo('capy'); tap('jump'); step(16); tap('jump'); step(3);
      ok('capy winds up (A)', p.mv === 'wind' && p.mvA, p.mv); snap('capy wind-up', ...around(p, W0, H0));
      until(() => p.mv === 'slam' && p.mvT >= 0 && p.vy >= 5, 12); step(3); snap('capy 털썩 (slam)', ...around(p, W0, H0, 0, -6));
      until(() => p.mv === 'rec', 30); step(3); ok('capy recovers (B)', p.mvB, p.mv); snap('capy landing splash', ...around(p, W0, H0, 0, 4));
      // otter: jump right, press again: dash with afterimages and drops
      p = solo('otter'); D.press('right', true, 0); tap('jump'); step(13); tap('jump'); step(5);
      ok('otter dashes (A)', p.mv === 'dash' && p.mvA, p.mv); snap('otter 휙 대시', ...around(p, W0, H0, -16)); release();
      // penguin: jump right, press again: dive, belly slide with sparkles
      p = solo('penguin'); D.press('right', true, 0); tap('jump'); step(12); tap('jump'); step(4);
      ok('penguin dives (A)', p.mv === 'dive' && p.mvA, p.mv); snap('penguin dive', ...around(p, W0, H0));
      until(() => p.mv === 'slide', 40); step(1); snap('penguin slide start (dust)', ...around(p, W0, H0, -12, 4));
      step(14); ok('penguin slides (B)', p.mv === 'slide' && p.mvB, p.mv); snap('penguin 쭉 배미끄럼', ...around(p, W0, H0, -12, 4)); release();
      // cat: jump, press again at the top: double jump curl + lilac ring
      p = solo('cat'); tap('jump'); step(17); tap('jump'); step(1);
      ok('cat curls (A)', p.mv === 'curl' && p.mvA, p.mv); snap('cat 냥냥 (ring)', ...around(p, W0, H0, 0, 6)); step(4); snap('cat curl', ...around(p, W0, H0, 0, 6));
      // frog: hop, press right on landing: level 1 (lily pad), again: level 2 (bigger pad + drops)
      p = solo('frog'); tap('jump'); until(() => p.onGround, 60); tap('jump'); step(2);
      ok('frog chained hop 1 (A)', p.hop === 1 && p.mvA, [p.hop, p.mvA]); snap('frog 깨굴 hop 1', ...around(p, W0, H0, 0, 8));
      until(() => p.onGround, 60); tap('jump'); step(2);
      ok('frog chained hop 2 (A + B)', p.hop === 2 && p.mvA && p.mvB, [p.hop, p.mvB]); snap('frog 깨굴 hop 2', ...around(p, W0, H0, 0, 10));
    }
    // ---- each animal's bubble in flight
    function bubbles() {
      const BW = 136, BH = 36;
      const shot = (char, ages, label) => {
        const p = solo(char); tap('shoot');
        const b = G.bubbles.find((q) => q.owner === 0 && q.kind === 'empty' && !q.drop);
        ok(char + ' blew its bubble', !!b && (b.state === 'shot' || char === 'none'), b && b.state);
        if (!b) return;
        for (const [age, lab] of ages) { until(() => b.age >= age, 140); snap(char + ' ' + lab + ' (age ' + b.age + ')', p.x - 6, p.y + 8 - BH / 2 - 2, BW, BH); }
      };
      shot('duck', [[16, '메아리 out'], [36, 'turns']]);
      shot('capy', [[14, '왕방울 (steam)']]);
      shot('otter', [[7, '물장구 fan'], [15, 'droplets burst']]);
      shot('penguin', [[12, '고드름']]);
      shot('cat', [[9, '털실 rolls']]);
      shot('frog', [[10, '개구리알 flies'], [45, 'waits (halo)']]);
      // the cat's air shot: the base bubble with its glyph, no thread
      const p = solo('cat'); tap('jump'); step(8); tap('shoot'); step(10);
      snap('cat air shot (no thread)', p.x - 6, p.y - 10, BW, BH);
    }
    // ---- battles: 4 players on a timeline [frame, slot, action] - tap 'shoot' / 'jump', 'hold' (JUMP stays down),
    // 'right' / 'left' (held) - staged so that at the end every bubble is mid-flight and a move is on
    function battle(chars, perksOff, script, end, pre) {
      Object.assign(AR[0], { enemySpawns: [] });
      D.seed(11); D.local.battle(chars, { arena: 0, countdown: false, perks: !perksOff, intrusion: false });
      D.setInvincible(true); D.setPerks(!perksOff);
      step(60); G.bubbles = []; G.parts = []; G.kfx = []; G.banner = null; release();
      for (const p of G.players) { p.invuln = 0; p.facing = p.x < 120 ? 1 : -1; }
      if (pre) pre(G.players);
      for (let f = 0; f <= end; f++) {
        for (const [at, s, a] of script) if (at === f) D.press(a === 'hold' ? 'jump' : a, true, s);
        step(1);
        for (const [at, s, a] of script) if (at === f && (a === 'shoot' || a === 'jump')) D.press(a, false, s);
      }
      log('KS INFO bubbles ' + G.bubbles.map((b) => b.owner + ':' + b.state + ':' + b.age + (b.drop ? 'd' : '')).join(','));
      log('KS INFO players ' + G.players.map((p) => p.char + ' ' + Math.round(p.x) + ',' + Math.round(p.y) + ' ' + (p.mv || '-')).join(' | '));
      return G.players;
    }
    // battle: the duck glides off the top shelf (its echo flies), the capy's big one, the otter dashes and fans, the icicle
    const B1 = [['capy', 'otter', 'duck', 'penguin'], [[0, 2, 'hold'], [0, 2, 'right'], [22, 2, 'shoot'], [26, 0, 'shoot'], [20, 1, 'jump'], [31, 1, 'jump'], [33, 1, 'shoot'], [28, 3, 'shoot']], 38,
      (ps) => { Object.assign(ps[2], { x: 80, facing: 1 }); }];
    // battle2: the cat's yarn then its double jump, the frog's egg waiting, the penguin's dive + slide, the duck's echo
    const B2 = [['cat', 'frog', 'penguin', 'duck'], [[24, 0, 'shoot'], [26, 0, 'jump'], [35, 0, 'jump'], [0, 1, 'shoot'], [14, 2, 'jump'], [26, 2, 'jump'], [32, 2, 'shoot'], [22, 3, 'shoot']], 38];
    function offCheck() {
      // 능력 끄기: the six animals blow the same bubble, drawn pixel-identical
      const hashes = [];
      for (const c of CH) {
        solo(c, true); const p = P(0); tap('shoot'); step(11);
        const b = G.bubbles.find((q) => q.owner === 0 && q.kind === 'empty');
        // (the room's shimmer runs on G.frame and the steam wisps drift on from earlier games - neither is reset by a new
        // game: redraw at one fixed frame number without them)
        G.frame = 4321; G.banner = null; G.bannerQ = []; G.words = []; G.wisps = []; D.step(0);
        const x = cv.getContext('2d').getImageData(Math.round(b.x) - 6, Math.round(b.y) - 6, 28, 28).data;
        let h = 0; for (let i = 0; i < x.length; i++) h = (Math.imul(h, 31) + x[i]) | 0;
        hashes.push(h); ok('perks off: ' + c + ' sets no move bit', !p.mvA && !p.mvB);
      }
      ok('perks off: the six animals\' bubbles draw pixel-identical', hashes.every((h) => h === hashes[0]), hashes);
    }

    let what = scene;
    try {
      if (scene === 'moves' || scene === 'fallback') {
        if (scene === 'fallback') for (const n of ['duck_glide', 'capy_slam', 'otter_dash', 'penguin_slide', 'cat_flip', 'icon_duck', 'icon_capy', 'icon_otter', 'icon_penguin', 'icon_cat', 'icon_frog']) D.hideSprite(n);
        moves();
        if (scene === 'fallback') { cells.splice(0, cells.length, ...cells.filter((c, i) => i % 2 === 0)); const n = cells.length; bubbles(); cells.splice(n + 6, 99); }
        showSheet(scene === 'fallback' ? 'v4 fallbacks: no move poses, no glyphs' : 'v4 moves (3x)', 900);
      } else if (scene === 'bubbles') {
        bubbles(); showSheet('v4 bubbles (3x)', 900);
      } else if (scene === 'battle' || scene === 'battle2' || scene === 'off') {
        const [chars, script, end, pre] = scene === 'battle2' ? B2 : B1;
        if (scene === 'off') offCheck();
        battle(chars, scene === 'off', script, end, pre);
        if (scene === 'off') ok('perks off: no move bits in the battle', G.players.every((q) => !q.mvA && !q.mvB));
        else ok(scene + ': a move is on and the bubbles fly', G.players.some((q) => q.mvA || q.mvB) && G.bubbles.filter((b) => b.state === 'shot').length >= 4);
        what += ' ' + G.players.map((q) => q.char + (q.mvA ? '(A)' : q.mvB ? '(B)' : '')).join(',');
      } else if (scene === 'hint') {
        // the first round with an animal: after "준비!" the hint banner names its move (the 2nd round: its bubble)
        const c = CH.indexOf(Q.get('c')) >= 0 ? Q.get('c') : 'capy';
        try { localStorage.removeItem('ppogeul-kit-' + c); } catch (e) { /* ignore */ }
        D.start(0, c); D.setInvincible(true);
        let seen = '';
        for (let i = 0; i < 260 && !/^특기/.test(seen); i++) { step(1); seen = (G.banner && G.frame < G.banner.end && G.banner.main) || ''; }
        ok('hint: 특기 banner after 준비!', seen === '특기: ' + D.chars().find((q) => q.id === c).move.name, seen);
        step(6); what += ' ' + c + ' "' + seen + '"';
      } else if (scene === 'count') {
        // the countdown's "3": my move under it (능력 끄기: says so)
        Object.assign(AR[0], { enemySpawns: [] });
        D.local.battle(['otter', 'duck'], { arena: 0, countdown: true, perks: Q.get('off') !== '1' }); step(12);
        const bn = G.banner || {};
        ok('countdown sub line', bn.main === '3' && (Q.get('off') === '1' ? bn.sub === '능력 꺼짐 · 모두 같은 기본 능력' : /^내 특기: 휙 대시 · /.test(bn.sub)), [bn.main, bn.sub]);
        what += ' "' + bn.sub + '"';
      } else if (scene === 'solo') {
        const c = CH.indexOf(Q.get('c')) >= 0 ? Q.get('c') : 'duck';
        D.start(0, c); step(200); what += ' ' + c;
      }
    } catch (e) { fail++; log('KS FAIL threw ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); }
    log('KS INFO scene ' + what);
    log('KS DONE pass=' + pass + ' fail=' + fail);
  }
  let tries = 0;
  (function wait() { if ((window.PG && PG.debug && document.getElementById('pg-canvas')) || ++tries > 200) run(); else setTimeout(wait, 30); })();
})();
