// Telling players apart (design/distinction.md §2, passes D3 + D4) in ONE engine, virtual time, local players.
// Built to C:/Temp/bogeul/test-distinction.html:
//   node tools/run-chrome.js test-distinction.html - 900 760 120000
// Covers §2.14: 1. solo is pixel-identical to the build before D3 (three canvas hashes) and looks() is empty; 2. four
// ducks: twins [no, yes, yes, yes], each body drawn in its seat's ramp (slot 1 natural #ffd23c), the ring (slot colour
// 1 px out, ink 2 px out), the HUD icons recoloured; 3. the twin colour frozen when a player leaves, recomputed by
// 한 판 더; 4. ground markers: L under every grounded player on all four arenas, M / S / none by height (and through a
// real jump), the R ripples beside a floating animal (none over it), a frog's lily pad over its marker, the marker
// through the respawn blink; 5. name tags v2 (local): compact chips that never overlap, near their animals, never in
// the HUD strip or past a wall, the 20-frame hysteresis, the trapper-colour ring (never white; ink once the trapper
// left), the nick still in every tag's text, the seat chips in the co-op results; 6. HUD panels by seat (a player
// leaving moves nobody's panel; 2-player co-op panels 63 wide); 7. bubble rings (2 px battle shot, 1 px floating /
// co-op, plain bubbles with perks off, the trapper's 2 px ring); 10. frame cost of a 4-player battle (INFO; the 5 %
// comparison is the real-time ?perf=1 run, by hand).
//   ?base=1   prints the solo canvas hashes only ("DIST BASE ..."; how BASE below was taken, on the build before D3)
//   ?perf=1   frame cost, ms per update + render of a 4-player battle (run it in real time:
//             node tools/run-chrome.js http://localhost:8765/test-distinction.html?perf=1 - 900 760 rt60000 "DIST DONE")
//   ?shot=battle&arena=N[&chars=a,b,c,d] | coop&round=N[&chars=..] (a ghost included) | float | podium | tags
//             a scene to look at (screenshots dist-*.png; logs "DIST SHOT READY")
//   ?phone=1  group 5 only, on a touch page (run-all distinction-phone: the cdp runner's 390 x 844 phone emulation): the
//             review fixes of 2026-10-18 - my tag on top of every chip and never covered on the top row, no tag lying on
//             another animal (two ledges, a random soak), the podium's 1P-4P chips and full pills
// Prints "DIST PASS|FAIL <name>", "DIST INFO ..." and "DIST DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  window.addEventListener('error', (e) => { fail++; log('DIST FAIL page error: ' + e.message + ' @' + e.lineno); });
  const Q = new URLSearchParams(location.search);
  // ?phone=1 (run-all distinction-phone: 390 x 844, touch emulation): only group 5, on a phone's scale and 11 px floor
  const PHONE = !!Q.get('phone');
  function t(name, fn) {
    if (PHONE && !/^5 /.test(name)) return;
    let r;
    try { r = fn(); } catch (e) { r = 'exception ' + (e && e.message) + ' @ ' + String((e && e.stack) || '').split('\n')[1]; }
    if (r === undefined || r === true) { pass++; log('DIST PASS ' + name); } else { fail++; log('DIST FAIL ' + name + ': ' + r); }
  }
  const info = (s) => log('DIST INFO ' + s);
  const J = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
  // prefers-reduced-motion on demand (CALM = true): the engine holds its MediaQueryList, so answer through the
  // prototype's getter (as kits-scenes.js does)
  let CALM = false;
  try {
    const md = Object.getOwnPropertyDescriptor(MediaQueryList.prototype, 'matches');
    Object.defineProperty(MediaQueryList.prototype, 'matches', { configurable: true, get() { return (CALM && /reduced-motion: reduce/.test(this.media)) || md.get.call(this); } });
  } catch (e) { /* ignore */ }

  // the solo baseline (§2.14 test 1): three canvas hashes taken with ?base=1 on the build BEFORE pass D3 changed any
  // drawing (2026-10-17): the start, mid-round after walking / jumping, a duck bubble in flight. Re-taken 2026-10-20 when
  // 혼자 하기 went to 4 lives (SOLO_LIVES): the HUD shows a 4th life icon, nothing else moved
  const BASE = [1098794199, 1667819248, 319467662];
  const SLOT_COLS = ['#ffd447', '#f6a6bd', '#7fdcc8', '#8dc9ff'];
  const SLOT_RAMP = [
    ['#fff1a6', '#ffd447', '#e39a1e', '#a8661a'],
    ['#ffd6e4', '#f6a6bd', '#d0658c', '#8e3a5e'],
    ['#c6f6e6', '#7fdcc8', '#3fa587', '#22705a'],
    ['#d4ebff', '#8dc9ff', '#4f8fd6', '#2d5b9a'],
  ];
  const INK = '#1c1530', PF_TOP = 16, W = 256, H = 224, WALL_L = 16;
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const hex = (a) => '#' + [a[0], a[1], a[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

  function run() {
    const D = PG.debug, G = D.G, L = D.local, S = () => D.getState();
    const cv = document.getElementById('pg-canvas'), cx = cv.getContext('2d');
    if (PHONE) window.dispatchEvent(new Event('touchstart')); // (the page's touch mode: the 11 px tag floor)
    const P = (slot) => G.players.find((p) => p.slot === slot);
    const step = (n) => D.step(n === undefined ? 1 : n);
    const render = () => D.step(0);
    const hashRect = (x, y, w, h) => { const d = cx.getImageData(x, y, w, h).data; let s = 0; for (let i = 0; i < d.length; i++) s = (Math.imul(s, 31) + d[i]) | 0; return s; };
    const px = (x, y) => Array.from(cx.getImageData(x | 0, y | 0, 1, 1).data);
    const is = (x, y, h) => dist(px(x, y), rgb(h)) === 0;
    const release = () => { for (let s = 0; s < 4; s++) for (const a of ['left', 'right', 'jump', 'shoot']) D.press(a, false, s); };
    const quiet = () => { G.parts = []; G.kfx = []; G.pops = []; G.words = []; G.wisps = []; G.banner = null; G.bannerQ = []; G.shake = 0; G.foam = []; };
    const looks = () => D.looks();
    const lk = (slot) => looks().find((o) => o.slot === slot);
    // a battle of `chars` on arena a: no monsters, no intruder, no countdown; everyone standing still, no blink
    function battle(chars, a, opts) {
      release(); D.seed(31 + (a | 0));
      L.battle(chars, Object.assign({ arena: a | 0, countdown: false, monsters: false, intrusion: false }, opts || {}));
      D.setInvincible(true); step(20); calm();
    }
    function coop(chars, round) {
      release(); D.seed(51 + (round | 0));
      L.coop(chars, round | 0); D.setInvincible(true);
      for (const e of G.enemies) { e.state = 'descend'; e.delay = 1e9; e.y = -300; e.startY = -300; }
      step(20); calm();
    }
    // a plain test room swapped in for arena 0 while fn runs (a full floor at row 25, nothing above it): the height and
    // tag tests need open floor with nothing overhead
    const ROOM = [];
    for (let r = 0; r < 26; r++) ROOM.push(r === 0 ? '##############....##############' : r === 25 ? '#'.repeat(32) : '##' + '.'.repeat(28) + '##');
    function inRoom(fn) {
      const A0 = D.arenas()[0], keep = { map: A0.map, players: A0.players, enemySpawns: A0.enemySpawns, gather: A0.gather, water: A0.water };
      Object.assign(A0, { map: ROOM, players: [{ col: 3, row: 24 }, { col: 28, row: 24 }, { col: 10, row: 24 }, { col: 20, row: 24 }], enemySpawns: [], gather: { col: 15, row: 10 }, water: false });
      try { return fn(); } finally { Object.assign(A0, keep); }
    }
    const calm = () => { for (const p of G.players) { p.invuln = 0; p.sq = 0; if (p.fx) p.fx.sq = 0; } quiet(); };
    // the drawn frame of a standing player: [name, fi] (idle; frame by G.frame as drawPlayer picks it)
    const idleOf = (p) => [p.char + '_idle', (G.frame / 30) | 0];
    // canvas pixels under p's 16x16 box against its (twin) idle frame where that frame is opaque: the share that match
    function bodyMatch(p) {
      const [name, fi] = idleOf(p), fr = D.twinPixels(name, fi, p.twin ? p.slot : 0);
      const X = Math.round(p.x), Y = Math.round(p.y), img = cx.getImageData(X, Y, 16, 16).data, flip = p.facing < 0;
      let n = 0, ok = 0;
      for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
        const o = (r * 16 + c) * 4; if (!fr.data[o + 3]) continue;
        const q = (r * 16 + (flip ? 15 - c : c)) * 4; n++;
        if (img[q] === fr.data[o] && img[q + 1] === fr.data[o + 1] && img[q + 2] === fr.data[o + 2]) ok++;
      }
      return n ? ok / n : 0;
    }
    // the canvas pixel where p's NATURAL idle frame has palette colour `h` (the first such pixel), or null
    function pixelWhere(p, h) {
      const [name, fi] = idleOf(p), fr = D.twinPixels(name, fi, 0), want = rgb(h), flip = p.facing < 0;
      for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
        const o = (r * 16 + c) * 4;
        if (fr.data[o + 3] && dist([fr.data[o], fr.data[o + 1], fr.data[o + 2]], want) === 0) return px(Math.round(p.x) + (flip ? 15 - c : c), Math.round(p.y) + r);
      }
      return null;
    }
    // the ring at p's widest row: [1 px out, 2 px out] canvas pixels
    function ringAt(p) {
      const [name, fi] = idleOf(p), fr = D.twinPixels(name, fi, 0), flip = p.facing < 0;
      let best = -1, row = -1;
      for (let r = 0; r < 16; r++) for (let c = 15; c >= 0; c--) if (fr.data[(r * 16 + c) * 4 + 3]) { if (c > best) { best = c; row = r; } break; }
      const X = Math.round(p.x), Y = Math.round(p.y) + row;
      return flip ? [px(X + 15 - best - 1, Y), px(X + 15 - best - 2, Y)] : [px(X + best + 1, Y), px(X + best + 2, Y)];
    }
    // the invulnerability blink's "off" phase ((G.frame >> 2) & 1 === 0): bodies and rings hidden, markers drawn
    const blinkOff = () => { for (const p of G.players) p.invuln = 60; G.frame = 8000; quiet(); render(); };

    // ---------------------------------------------------------------- test-only modes
    function soloHashes() {
      release();
      D.seed(20261017); G.hiscore = 0; G.frame = 0; G.wisps = []; G.parts = []; G.kfx = []; G.pops = []; G.words = []; G.shake = 0;
      D.start(0, 'duck'); D.setInvincible(true);
      const out = [hashRect(0, 0, 256, 224)];
      D.press('right', true, 0); D.step(50); D.press('right', false, 0);
      D.press('jump', true, 0); D.step(2); D.press('jump', false, 0); D.step(60);
      D.press('left', true, 0); D.step(30); D.press('left', false, 0); D.step(200);
      out.push(hashRect(0, 0, 256, 224));
      D.press('shoot', true, 0); D.step(2); D.press('shoot', false, 0); D.step(6);
      out.push(hashRect(0, 0, 256, 224));
      D.setInvincible(false);
      return out;
    }
    if (Q.get('base')) { log('DIST BASE ' + JSON.stringify(soloHashes())); log('DIST DONE pass=1 fail=0'); return; }
    // frame cost of a 4-player battle (§2.14 test 10): update + render of 600 frames, best of 5, ms per frame
    function perf(chars) {
      let best = 1e9;
      for (let k = 0; k < 5; k++) {
        D.seed(77 + k); G.frame = 0; L.battle(chars, { arena: k % 4, intrusion: false }); D.setInvincible(true);
        for (let s = 0; s < 4; s++) D.press(k & 1 ? 'right' : 'left', true, s);
        const t0 = performance.now();
        for (let f = 0; f < 600; f++) { D.step(1); if (f % 40 === 0) for (let s = 0; s < 4; s++) { D.press('jump', true, s); D.press('shoot', f % 80 === 0, s); } else if (f % 40 === 2) for (let s = 0; s < 4; s++) D.press('jump', false, s); }
        best = Math.min(best, (performance.now() - t0) / 600);
        release();
      }
      D.setInvincible(false);
      return Math.round(best * 1000) / 1000;
    }
    if (Q.get('perf')) {
      log('DIST PERF mixed ' + perf(['duck', 'capy', 'frog', 'penguin']) + ' ms/frame, ducks ' + perf(['duck', 'duck', 'duck', 'duck']) + ' ms/frame');
      log('DIST DONE pass=1 fail=0'); return;
    }
    if (Q.get('shot')) { scene(Q.get('shot')); return; }

    // ================================================================== 1. solo unchanged
    t('1 solo: the canvas is pixel-identical to the build before D3 at the start, mid-round and with a shot in flight', () => {
      const h = soloHashes();
      if (J(h) !== J(BASE)) return 'hashes ' + J(h) + ' baseline ' + J(BASE);
    });
    t('1 solo: looks() is empty, no name tag shown', () => {
      if (looks().length) return J(looks());
      if ([...document.querySelectorAll('#pg-tags .pg-tag')].some((e) => !e.hidden)) return 'a tag is shown';
    });

    // ================================================================== 2. four ducks
    const D4 = ['duck', 'duck', 'duck', 'duck'];
    t('2 four ducks: twins [false, true, true, true], seat numbers 1-4', () => {
      battle(D4, 0);
      const l = looks();
      if (J(l.map((o) => o.twin)) !== J([false, true, true, true])) return J(l.map((o) => o.twin));
      if (J(l.map((o) => o.num)) !== J(['1', '2', '3', '4'])) return J(l.map((o) => o.num));
    });
    t('2 four ducks: every body drawn in its seat\'s ramp (slot 1 #ffd23c natural, slot 2 ' + SLOT_RAMP[1][1] + ', ...)', () => {
      battle(D4, 0); render();
      for (const p of G.players) {
        const m = bodyMatch(p); if (m < 0.98) return 'slot ' + p.slot + ' body match ' + m.toFixed(3);
        const c = pixelWhere(p, '#ffd23c'), want = p.slot === 0 ? '#ffd23c' : SLOT_RAMP[p.slot][1];
        if (!c || dist(c, rgb(want)) !== 0) return 'slot ' + p.slot + ' body ' + (c && hex(c)) + ' want ' + want;
      }
      info('four ducks: body pixel (natural Y) ' + G.players.map((p) => hex(pixelWhere(p, '#ffd23c'))).join(' '));
    });
    t('2 four ducks: the ring - the slot colour 1 px outside the silhouette, the ink 2 px outside', () => {
      battle(D4, 0); render();
      for (const p of G.players) {
        const [a, b] = ringAt(p);
        if (dist(a, rgb(SLOT_COLS[p.slot])) || dist(b, rgb(INK))) return 'slot ' + p.slot + ' ring ' + hex(a) + ' / ' + hex(b);
      }
    });
    const hashOf = (img) => { let s = 0; for (let i = 0; i < img.data.length; i++) s = (Math.imul(s, 31) + img.data[i]) | 0; return s; };
    t('2 four ducks: the HUD icons of slots 2-4 are recoloured too (slot 1 natural)', () => {
      battle(D4, 0); render();
      const X = [1, 53, 153, 205];
      for (const p of G.players) {
        const fr = D.twinPixels('life_duck', 0, p.slot), img = cx.getImageData(X[p.slot] + 8, 0, fr.width, fr.height).data;
        let n = 0, ok = 0;
        for (let o = 0; o < fr.data.length; o += 4) if (fr.data[o + 3]) { n++; if (img[o] === fr.data[o] && img[o + 1] === fr.data[o + 1] && img[o + 2] === fr.data[o + 2]) ok++; }
        if (!n || ok / n < 0.99) return 'slot ' + p.slot + ' icon ' + ok + '/' + n;
      }
      const nat = D.twinPixels('life_duck', 0, 0), tw = D.twinPixels('life_duck', 0, 2);
      if (hashOf(nat) === hashOf(tw)) return 'the twin icon is not recoloured';
    });
    t('2 the twin keys swap only the body ramp: beak / eye / ink pixels keep their colours', () => {
      for (const c of ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog']) {
        const a = D.twinPixels(c + '_idle', 0, 0), b = D.twinPixels(c + '_idle', 0, 3);
        let changed = 0, inkKept = true;
        for (let o = 0; o < a.data.length; o += 4) {
          if (!a.data[o + 3]) continue;
          const same = a.data[o] === b.data[o] && a.data[o + 1] === b.data[o + 1] && a.data[o + 2] === b.data[o + 2];
          if (!same) changed++;
          if (hex([a.data[o], a.data[o + 1], a.data[o + 2]]) === INK && !same) inkKept = false;
        }
        if (!changed) return c + ': nothing recoloured';
        if (!inkKept) return c + ': the ink changed';
      }
    });

    // ================================================================== 3. twin freeze
    t('3 twin freeze: slot 1 leaves mid-match -> slot 2 stays a (pink) twin; 한 판 더 recomputes (now the first duck)', () => {
      battle(D4, 0);
      L.removePlayer(0); calm(); render();
      const p = P(1);
      if (!p.twin || !lk(1).twin) return 'slot 2 twin after the leave ' + p.twin;
      const c = pixelWhere(p, '#ffd23c'); if (!c || dist(c, rgb(SLOT_RAMP[1][1]))) return 'slot 2 colour ' + (c && hex(c));
      D.rematch(); calm(); render();
      if (P(1).twin || P(2).twin !== true || P(3).twin !== true) return 'after 한 판 더 ' + J(looks().map((o) => [o.slot, o.twin]));
      const c2 = pixelWhere(P(1), '#ffd23c'); if (!c2 || dist(c2, rgb('#ffd23c'))) return 'slot 2 after 한 판 더 ' + (c2 && hex(c2));
    });
    t('3 mixed animals: only repeats are twins (duck, frog, duck, frog -> no, no, yes, yes)', () => {
      battle(['duck', 'frog', 'duck', 'frog'], 0);
      if (J(looks().map((o) => o.twin)) !== J([false, false, true, true])) return J(looks());
      battle(['duck', 'capy', 'otter', 'cat'], 0);
      if (looks().some((o) => o.twin)) return J(looks());
    });

    // ================================================================== 4. ground markers
    const ARENAS = D.arenas();
    for (let a = 0; a < ARENAS.length; a++) {
      t('4 markers: arena ' + a + ' (' + ARENAS[a].name + '): an L marker under every grounded player (centre at surf - 1 = slot colour, rims ink)', () => {
        battle(['duck', 'capy', 'frog', 'penguin'], a);
        blinkOff();
        for (const p of G.players) {
          const o = lk(p.slot); if (!p.onGround || p.water) continue;
          if (o.marker !== 'L') return 'slot ' + p.slot + ' marker ' + o.marker;
          const c = Math.round(p.x + 8), s = Math.round(p.y) + 16;
          if (!is(c, s - 1, SLOT_COLS[p.slot])) return 'slot ' + p.slot + ' centre ' + hex(px(c, s - 1));
          if (!is(c, s - 3, INK) || !is(c - 7, s - 1, INK) || !is(c + 6, s - 1, INK)) return 'slot ' + p.slot + ' rims ' + [px(c, s - 3), px(c - 7, s - 1), px(c + 6, s - 1)].map(hex);
        }
      });
    }
    t('4 markers: by height - L (d <= 1), M (2..16), S (17..40), none above 40', () => inRoom(() => {
      battle(['duck', 'cat'], 0);
      const p = P(0), y0 = p.y, out = [];
      for (const d of [0, 1, 2, 16, 17, 40, 41, 60]) { D.setPlayer(p.x, y0 - d, 0); out.push(lk(0).marker || '-'); }
      if (out.join('') !== 'LLMMSS--') return out.join('');
    }));
    t('4 markers: a real jump goes L -> M -> S -> M -> L', () => inRoom(() => {
      battle(['duck', 'cat'], 0);
      const seen = [];
      D.press('jump', true, 0); step(1); D.press('jump', false, 0);
      for (let f = 0; f < 90; f++) { const m = lk(0).marker; if (seen[seen.length - 1] !== m) seen.push(m); step(1); }
      const s = seen.join('');
      if (!/^L?MSML$/.test(s)) return s;
    }));
    t('4 markers: a duck afloat in 냉온탕 대결 gets the R ripples at x - 3 and x + 18 over the water, none over its body', () => {
      const a = ARENAS.findIndex((A) => A.name === '냉온탕 대결');
      if (a < 0) return 'no arena';
      battle(['cat', 'duck'], a);
      // a water cell wide enough for the ripples: x + 8 in water and x - 4 / x + 19 over water too, same surface
      let spot = null;
      for (let x = 20; x < 220 && !spot; x++) for (let y = PF_TOP; y < 224 && !spot; y += 8) {
        const w = D.waterAt(x + 8, y), w1 = D.waterAt(x - 4, y), w2 = D.waterAt(x + 19, y);
        if (w && w1 && w2 && w.surfaceY === w1.surfaceY && w.surfaceY === w2.surfaceY) spot = { x, surf: w.surfaceY };
      }
      if (!spot) return 'no pool';
      const p = P(1); D.setPlayer(spot.x, spot.surf - 18, 1);
      step(90);
      if (!p.water) return 'not afloat ' + J([p.x, p.y]);
      const o = lk(1); if (o.marker !== 'R') return 'marker ' + o.marker;
      blinkOff();
      const X = Math.round(p.x), s = spot.surf;
      if (!is(X - 3, s, SLOT_COLS[1]) || !is(X + 18, s, SLOT_COLS[1])) return 'ripples ' + hex(px(X - 3, s)) + ' ' + hex(px(X + 18, s));
      if (!is(X - 4, s, INK) || !is(X + 19, s, INK)) return 'rims ' + hex(px(X - 4, s)) + ' ' + hex(px(X + 19, s));
      for (let x = X; x <= X + 15; x++) for (let y = s - 1; y <= s + 1; y++) if (is(x, y, SLOT_COLS[1]) || is(x, y, INK)) return 'a marker pixel over the body at ' + (x - X) + ',' + (y - s);
      info('afloat: ripples at x-3 / x+18 on surface y ' + s + ' (marker drawn from ' + o.mark.x + ')');
    });
    t('4 markers: a frog\'s lily pad over its own marker stays visible (the pad\'s fill at its centre)', () => {
      battle(['frog', 'duck'], 0);
      const p = P(0), X = Math.round(p.x) + 8, s = Math.round(p.y) + 16;
      blinkOff();
      const bare = px(X, s);
      G.kfx.push({ k: 'ring', low: true, x: X, y: s, r0: 4.5, r1: 6, flat: 0.35, dur: 10, col: '#6cc644', fill: '#c8f08a', f0: G.frame });
      render();
      const pad = px(X, s), want = [0.8 * 200 + 0.2 * bare[0], 0.8 * 240 + 0.2 * bare[1], 0.8 * 138 + 0.2 * bare[2]];
      if (dist(bare, rgb(SLOT_COLS[0]))) return 'no marker under it ' + hex(bare);
      if (dist(pad, want) > 12) return 'pad ' + hex(pad) + ' want ~' + hex(want.map(Math.round));
    });
    t('4 markers: drawn on every frame of the respawn blink (body on and off)', () => {
      battle(['duck', 'cat'], 0);
      const p = P(0), c = Math.round(p.x + 8), s = Math.round(p.y) + 16;
      p.invuln = 60;
      const kinds = [];
      for (let f = 8000; f < 8016; f++) {
        G.frame = f; quiet(); render(); kinds.push(lk(0).marker);
        if (((f >> 2) & 1) === 0 && !is(c, s - 1, SLOT_COLS[0])) return 'frame ' + f + ' centre ' + hex(px(c, s - 1));
      }
      if (kinds.some((k) => k !== 'L')) return kinds.join('');
    });
    t('4 markers: hidden for a trapped / KO\'d player, in a door transition and on the podium', () => {
      battle(['duck', 'cat', 'frog'], 0);
      D.trapPlayer(1, 0); step(1);
      if (lk(1).marker !== '') return 'trapped ' + lk(1).marker;
      D.endBattle(); step(5);
      if (S().phase !== 'podium' || looks().some((o) => o.marker)) return S().phase + ' ' + J(looks().map((o) => o.marker));
      coop(['duck', 'cat'], 0);
      if (looks().some((o) => !o.marker)) return 'co-op ' + J(looks().map((o) => o.marker));
      const m0 = G.mode; G.mode = 'transition'; const tr = looks().map((o) => o.marker); G.mode = m0;
      if (tr.some(Boolean)) return 'transition ' + J(tr);
    });

    // ================================================================== 6. HUD panels by seat
    const box = (x, y) => hex(px(x, y));
    t('6 HUD battle: slots 0, 1 and 3 -> slot 4\'s number box at x = 205; still there after slot 2 leaves', () => {
      battle(D4, 0); L.removePlayer(2); calm(); render();
      if (box(205, 0) !== SLOT_COLS[3] || box(211, 8) !== SLOT_COLS[3]) return 'box ' + box(205, 0) + ' ' + box(211, 8);
      if (box(153, 0) === SLOT_COLS[2]) return 'slot 3 panel still drawn';
      L.removePlayer(1); calm(); render();
      if (box(205, 0) !== SLOT_COLS[3] || box(1, 0) !== SLOT_COLS[0] || box(53, 0) === SLOT_COLS[1]) return 'after the leave ' + [box(1, 0), box(53, 0), box(205, 0)];
    });
    t('6 HUD battle: number box solid, the number in the HUD ink, the icon at x0 + 8, the score at x0 + 17', () => {
      battle(['duck', 'cat', 'frog', 'otter'], 0); render();
      const X = [1, 53, 153, 205];
      for (let s = 0; s < 4; s++) {
        let ink = 0; for (let x = X[s]; x < X[s] + 7; x++) for (let y = 0; y < 9; y++) if (box(x, y) === '#0a1a1d') ink++;
        if (ink < 4) return 'slot ' + (s + 1) + ' number pixels ' + ink;
        const ic = D.twinPixels('life_' + P(s).char, 0, 0), img = cx.getImageData(X[s] + 8, 0, 8, 8).data;
        let ok = 0, n = 0; for (let o = 0; o < ic.data.length; o += 4) if (ic.data[o + 3]) { n++; if (img[o] === ic.data[o] && img[o + 1] === ic.data[o + 1] && img[o + 2] === ic.data[o + 2]) ok++; }
        if (ok / n < 0.99) return 'slot ' + (s + 1) + ' icon';
        let sc = 0; for (let x = X[s] + 17; x < X[s] + 23; x++) for (let y = 1; y < 8; y++) if (box(x, y) === SLOT_COLS[s]) sc++;
        if (!sc) return 'slot ' + (s + 1) + ' score not at x0 + 17';
      }
    });
    t('6 HUD co-op: 2 players -> panels at x0 = 2 and 65 (63 wide each, not stretched), nothing at 128', () => {
      coop(['duck', 'cat'], 0); render();
      if (box(2, 8) !== SLOT_COLS[0] || box(65, 8) !== SLOT_COLS[1]) return [box(2, 8), box(65, 8)];
      if (box(128, 8) === SLOT_COLS[2] || box(128, 8) === SLOT_COLS[1]) return 'a third panel ' + box(128, 8);
      coop(['duck', 'cat', 'frog', 'otter'], 0); render();
      for (let s = 0; s < 4; s++) if (box(2 + s * 63, 8) !== SLOT_COLS[s]) return 'slot ' + (s + 1) + ' ' + box(2 + s * 63, 8);
    });
    t('6 HUD: no white number box or underline offline (local players have no "me")', () => {
      battle(D4, 0); render();
      for (const x of [1, 53, 153, 205]) if (box(x, 0) === '#ffffff' || box(x + 20, 15) === '#ffffff') return 'white at ' + x;
    });

    // ================================================================== 7. bubbles
    // an owned bubble of `slot` standing at (x, y) in state st, then a render (no update: it stays put)
    function bubbleAt(slot, x, y, st, k) {
      G.bubbles = [];
      const b = D.spawnBubble('empty', x, y);
      Object.assign(b, { owner: slot, state: st, age: st === 'shot' ? 3 : 60, vx: 0, vy: 0, dir: 1, shotT: 20, ty: 'line', k: k === undefined ? 1 : k });
      b._md = 1; b._lf = undefined;
      quiet(); render();
      return b;
    }
    const ringTest = (slot, wide) => {
      const cxp = 120 + 8, cyp = 100 + 8, near = dist(px(cxp + 8, cyp), rgb(SLOT_COLS[slot])), far = dist(px(cxp + 9, cyp), rgb(SLOT_COLS[slot]));
      // (a 2 px ring at r 9 covers both pixels right of the centre at 8 and 9 px; a 1 px ring at r 8.5 only the first)
      return wide ? near <= 30 && far <= 60 : near <= 60 && far > 120;
    };
    t('7 bubbles: battle - a duck shot in flight has an opaque 2 px ring at r 9; the same bubble floating 1 px', () => {
      battle(D4, 0); G.players.forEach((p) => { p.x = 30; });
      bubbleAt(2, 120, 100, 'shot');
      if (!ringTest(2, true)) return 'shot ' + hex(px(136, 108)) + ' ' + hex(px(137, 108));
      bubbleAt(2, 120, 100, 'float');
      if (!ringTest(2, false)) return 'float ' + hex(px(136, 108)) + ' ' + hex(px(137, 108));
    });
    t('7 bubbles: co-op - a shot keeps the 1 px ring', () => {
      coop(['duck', 'duck'], 0);
      bubbleAt(1, 120, 100, 'shot');
      if (!ringTest(1, false)) return hex(px(136, 108)) + ' ' + hex(px(137, 108));
    });
    t('7 bubbles: 능력 끄기 (plain bubbles) - owned bubbles get the same rings', () => {
      battle(D4, 0, { perks: false });
      bubbleAt(3, 120, 100, 'shot', 0);
      if (D.bubbleLook(G.bubbles[0])) return 'not plain';
      if (!ringTest(3, true)) return 'shot ' + hex(px(136, 108)) + ' ' + hex(px(137, 108));
      bubbleAt(3, 120, 100, 'float', 0);
      if (!ringTest(3, false)) return 'float ' + hex(px(136, 108)) + ' ' + hex(px(137, 108));
    });
    t('7 bubbles: a trapped rival\'s prison has a 2 px ring in the trapper\'s colour', () => {
      battle(['duck', 'cat', 'frog'], 0);
      D.trapPlayer(1, 2); const b = P(1).trap.b; b.x = 120; b.y = 100; quiet(); render();
      if (!ringTest(2, true)) return hex(px(136, 108)) + ' ' + hex(px(137, 108));
    });

    // ================================================================== 5. name tags (local)
    const tagsOf = () => looks().map((o) => Object.assign({ slot: o.slot }, o.tag));
    const NICKS = ['뽀숑', '까삐', '개굴', '말랑두부'];
    const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    t('5 tags: four animals 16 px apart on one floor - compact on the first frame, no overlap, each near its head', () => inRoom(() => {
      // (no frame in between: the tags first appear with the animals already side by side)
      release(); D.seed(9);
      L.battle(NICKS.map((nick, k) => ({ char: ['duck', 'cat', 'frog', 'otter'][k], nick })), { arena: 0, countdown: false, monsters: false, intrusion: false });
      const y = P(0).y;
      G.players.forEach((p, k) => { p.x = 24 + 16 * k; p.y = y; p.vx = 0; p.vy = 0; p.onGround = true; p.invuln = 0; });
      render();
      const T = tagsOf();
      if (T.length !== 4 || T.some((o) => !o.text)) return J(T);
      if (T.some((o) => !o.cmp)) return 'not compact ' + J(T.map((o) => o.cmp));
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (overlap(T[i], T[j])) return 'tags ' + i + ' / ' + j + ' overlap';
      for (const o of T) { const p = P(o.slot); if (o.b > p.y || p.y - o.b > 20) return 'slot ' + o.slot + ' bottom ' + o.b + ' head ' + p.y; }
      // ... and the DOM agrees (the boxes on screen)
      const R = [...document.querySelectorAll('#pg-tags .pg-tag')].filter((e) => !e.hidden).map((e) => e.getBoundingClientRect());
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], b = R[j]; if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) return 'DOM tags ' + i + ' / ' + j + ' overlap'; }
      info('compact tags ' + T.map((o) => (o.r - o.l).toFixed(1) + 'x' + (o.b - o.t).toFixed(1)).join(' '));
    }));
    t('5 tags: apart for 20 frames -> the full pill (number + nick); the nick in every tag\'s text', () => {
      battle(['duck', 'cat', 'frog', 'otter'], 0); step(25);
      const T = tagsOf();
      if (T.some((o) => o.cmp)) return 'still compact ' + J(T.map((o) => o.cmp));
      for (const o of T) if (o.text.indexOf(P(o.slot).nick) < 0 || o.text.indexOf(String(o.slot + 1)) !== 0) return 'text ' + J(o.text);
    });
    t('5 tags: a player on the top row - the tag stays below the HUD strip (top >= PF_TOP + 1)', () => {
      battle(['duck', 'cat'], 0); step(25);
      D.setPlayer(120, 22, 0); render();
      const o = lk(0).tag; if (!o || o.t < PF_TOP + 1 - 0.01) return J(o);
      const el = [...document.querySelectorAll('#pg-tags .pg-tag')].find((e) => !e.hidden), r = el.getBoundingClientRect(), c = cv.getBoundingClientRect();
      if (r.top < c.top + (PF_TOP + 1) * c.height / H - 1) return 'DOM top ' + r.top + ' canvas ' + c.top;
    });
    t('5 tags: a player at x = WALL_L - 2 - the tag stays inside the canvas (and its pointer over the animal)', () => {
      battle(['duck', 'cat'], 0); step(25);
      for (const x of [WALL_L - 2, W - 18]) {
        D.setPlayer(x, P(0).y, 0); render();
        const o = lk(0).tag; if (!o || o.l < 0 || o.r > W) return 'x ' + x + ' ' + J(o);
      }
    });
    t('5 tags: two animals crossing toggle is-cmp at most twice in 60 frames (the 20-frame hysteresis)', () => inRoom(() => {
      battle(['duck', 'cat'], 0);
      const y = P(0).y; P(0).x = 24; P(1).x = 96; step(30);
      if (lk(0).tag.cmp || lk(1).tag.cmp) return 'not full before';
      D.press('right', true, 0); D.press('left', true, 1);
      const tog = [0, 0], last = [false, false];
      for (let f = 0; f < 60; f++) { step(1); for (const s of [0, 1]) { const c = lk(s).tag.cmp; if (c !== last[s]) { tog[s]++; last[s] = c; } } }
      release();
      if (tog[0] > 2 || tog[1] > 2) return 'toggles ' + tog;
      if (!tog[0] && !tog[1]) return 'never compacted (no crossing?) ' + J([P(0).x, P(1).x, y]);
      info('crossing: is-cmp toggles ' + tog.join(' / '));
    }));
    const shadow = (slot) => { const el = [...document.querySelectorAll('#pg-tags .pg-tag')].filter((e) => !e.hidden).find((e) => e.textContent.indexOf(P(slot).nick) >= 0); return el ? getComputedStyle(el).boxShadow : ''; };
    t('5 tags: a trapped rival\'s tag ring is the trapper\'s colour, never white; ink once the trapper has left', () => {
      battle(['duck', 'cat', 'frog'], 0); step(5);
      D.trapPlayer(1, 2); step(1);
      const o = lk(1).tag, sh = shadow(1);
      if (!o || o.ring !== SLOT_COLS[2]) return 'ring ' + J(o && o.ring);
      if (!/rgb\(127, 220, 200\)/.test(sh) || /255, 255, 255/.test(sh)) return 'shadow ' + sh;
      L.removePlayer(2); step(1);
      const o2 = lk(1).tag, sh2 = shadow(1);
      if (!o2 || o2.ring !== '' || /255, 255, 255/.test(sh2) || !/7, 22, 25/.test(sh2)) return 'after the leave ' + J(o2 && o2.ring) + ' ' + sh2;
    });
    t('5 tags: offline nobody is "나" (no is-me, no white chip)', () => {
      battle(D4, 0); step(2);
      if (looks().some((o) => o.tag && (o.tag.me || o.tag.hi))) return J(looks());
      if ([...document.querySelectorAll('#pg-tags .pg-tag-n')].some((e) => e.textContent === '나')) return '나 chip';
    });
    t('5 co-op results: the seat number chip inside the nick cell (5 grid columns kept)', () => {
      coop(['duck', 'cat', 'duck'], 0);
      G.lives = 0; for (const p of G.players) D.hitPlayer(p.slot);
      let n = 0; while (S().phase !== 'gameover' && n++ < 1200) step(1);
      if (S().phase !== 'gameover') return 'phase ' + S().phase;
      const box = document.getElementById('pg-over-team'), rows = box ? [...box.querySelectorAll('.pg-team-row')] : [];
      if (rows.length !== 3) return 'rows ' + rows.length;
      for (let i = 0; i < 3; i++) {
        const chip = rows[i].querySelector('.pg-team-nick .pg-tag-n');
        if (!chip || chip.textContent !== String(i + 1)) return 'row ' + i + ' chip ' + (chip && chip.textContent);
        if (rows[i].children.length !== 5) return 'row ' + i + ' cells ' + rows[i].children.length;
      }
      if (getComputedStyle(box).gridTemplateColumns.split(' ').length !== 5) return 'grid ' + getComputedStyle(box).gridTemplateColumns;
    });

    // ================================================================== 8 (staged). "me" drawn as an online page draws it
    // (G.online on a local battle with G.localSlot set: every pixel under control here; distinction-net.js runs the same
    // over a real bc session)
    const stage = (slot) => { G.online = true; G.localSlot = slot; };
    const unstage = () => { G.online = false; G.localSlot = 0; CALM = false; };

    // ================================================================== 5+ (review 2026-10-18) tags and the animals under them
    // (also run on a phone: ?phone=1, 390 x 844 touch, the 11 px floor - where the chips used to cover "나" and the pills
    // lay on the animals of the ledge above)
    const bodyOf = (p) => ({ l: p.x - 1, r: p.x + 17, t: p.y, b: p.y + 16 });
    const area = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
    const overBy = (a, b, e) => a.l < b.r - e && b.l < a.r - e && a.t < b.b - e && b.t < a.b - e;
    // everyone held where put while n frames pass for the tags (G.frame on, no update: nobody falls)
    const hold = (n) => { for (let i = 0; i < n; i++) { G.frame++; render(); } };
    // the largest share of another animal's 18 x 16 body box under any tag; of MY animal's (staged online) apart
    function covers() {
      let other = 0, mine = 0;
      for (const o of tagsOf()) for (const p of G.players) {
        if (p.slot === o.slot) continue;
        const s = area(o, bodyOf(p)) / 288;
        if (G.online && p.slot === G.localSlot) mine = Math.max(mine, s); else other = Math.max(other, s);
      }
      return { other, mine };
    }
    const scale = () => { const c = cv.getBoundingClientRect(); return c.width / W; };
    t('5 tags+: the page this runs on (info: css px per canvas px, touch floor, a tag\'s font size)', () => {
      battle(['duck', 'cat'], 0); step(2);
      const el = [...document.querySelectorAll('#pg-tags .pg-tag')].find((e) => !e.hidden);
      const fs = el ? parseFloat(getComputedStyle(el).fontSize) : 0, touch = !!document.querySelector('.pg-touch-on');
      info('scale ' + scale().toFixed(2) + ' touch ' + touch + ' tag font ' + fs + ' px');
      if (PHONE && (!touch || fs < 11 || scale() > 1.8)) return 'not a phone page: touch ' + touch + ' font ' + fs + ' scale ' + scale();
    });
    t('5 tags+: three animals side by side on the top row, mine in each place - no tag box on mine, my 나 chip is what shows at its centre', () => inRoom(() => {
      for (const ms of [0, 1, 2]) {
        release(); D.seed(9);
        L.battle(NICKS.slice(0, 3).map((nick) => ({ char: 'duck', nick })), { arena: 0, countdown: false, monsters: false, intrusion: false });
        stage(ms);
        G.players.forEach((p, k) => { p.x = 96 + 16 * k; p.y = 22; p.vx = 0; p.vy = 0; p.invuln = 0; });
        hold(25);
        const T = tagsOf(), mine = T.find((o) => o.slot === ms);
        if (!mine || !mine.me) return 'me ' + ms + ' ' + J(mine);
        const hit = T.find((o) => o.slot !== ms && overBy(o, mine, 0.5));
        if (hit) return 'me ' + ms + ': tag ' + hit.slot + ' on mine ' + J(T.map((o) => [o.slot, +o.l.toFixed(1), +o.r.toFixed(1), +o.t.toFixed(1), +o.b.toFixed(1), o.cmp]));
        // what is painted at my 나 chip's centre (pointer events on for the probe: the tag layer ignores the mouse)
        const lay = document.getElementById('pg-tags'), el = [...lay.querySelectorAll('.pg-tag.is-me')].find((e) => !e.hidden);
        const n = el.querySelector('.pg-tag-n').getBoundingClientRect();
        lay.style.pointerEvents = 'auto';
        const top = document.elementFromPoint(n.left + n.width / 2, n.top + n.height / 2);
        lay.style.pointerEvents = '';
        if (!top || top.closest('.pg-tag') !== el) return 'me ' + ms + ': at the 나 chip ' + (top ? top.className + ' ' + top.textContent : 'nothing');
        if (getComputedStyle(el).zIndex !== '2') return 'my tag z-index ' + getComputedStyle(el).zIndex;
        unstage();
      }
    }));
    t('5 tags+: two animals on ledges 16-24 px apart - no tag on more than 25 % of the other\'s body, none on mine at all', () => inRoom(() => {
      let worst = 0;
      for (const [dx, dy] of [[0, 24], [12, 16], [-12, 16], [6, 20], [-4, 24], [16, 18], [-16, 18]]) for (const low of [0, 1]) for (const st of [-1, 0, 1]) {
        release(); D.seed(9);
        L.battle([{ char: 'frog', nick: '개굴이' }, { char: 'penguin', nick: '말랑두부' }], { arena: 0, countdown: false, monsters: false, intrusion: false });
        if (st >= 0) stage(st);
        const a = P(low), b = P(1 - low);
        for (const p of G.players) { p.vx = 0; p.vy = 0; p.invuln = 0; }
        a.x = 110; a.y = 150; b.x = 110 + dx; b.y = 150 - dy;
        hold(25);
        const c = covers(); worst = Math.max(worst, c.other);
        if (c.other > 0.25 || c.mine > 0) return J({ dx, dy, low, me: st, c, tags: tagsOf().map((o) => [o.slot, o.cmp, +o.l.toFixed(1), +o.t.toFixed(1), +o.r.toFixed(1), +o.b.toFixed(1)]) });
        unstage();
      }
      info('two ledges: the worst share of a body under a tag ' + (worst * 100).toFixed(1) + ' %');
    }));
    t('5 tags+: a soak of 120 random 4-animal layouts (bodies apart, mine staged in half) - a tag on > 25 % of another animal in <= 3 %, on mine in none', () => inRoom(() => {
      release(); D.seed(9);
      L.battle(NICKS.map((nick, k) => ({ char: ['duck', 'capy', 'frog', 'penguin'][k], nick })), { arena: 0, countdown: false, monsters: false, intrusion: false });
      let r = 12345; const rnd = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
      let n = 0, bad = 0, onMine = 0, full = 0, worst = 0;
      while (n < 120) {
        const pos = []; let tries = 0;
        while (pos.length < 4 && tries++ < 400) {
          const q = { x: 18 + Math.floor(rnd() * 204), y: 24 + 8 * Math.floor(rnd() * 21) };
          if (pos.every((o) => Math.abs(o.x - q.x) >= 18 || Math.abs(o.y - q.y) >= 16)) pos.push(q);
        }
        if (pos.length < 4) continue;
        n++;
        if (n % 2) stage(n % 4); else unstage();
        G.players.forEach((p, k) => { p.x = pos[k].x; p.y = pos[k].y; p.vx = 0; p.vy = 0; p.invuln = 0; });
        hold(21);
        const c = covers(); worst = Math.max(worst, c.other);
        if (c.other > 0.25) bad++;
        if (c.mine > 0) onMine++;
        full += tagsOf().filter((o) => !o.cmp).length;
      }
      unstage();
      info('soak: ' + bad + ' / ' + n + ' layouts with a tag on > 25 % of another animal (worst ' + (worst * 100).toFixed(0) + ' %), ' + onMine + ' on mine; ' + (full / n).toFixed(2) + ' full pills a layout');
      if (bad > n * 0.03 || onMine) return 'bad ' + bad + ' on mine ' + onMine;
    }));
    t('5 tags+: the podium - full pills, none overlapping, the seat chip reads 1P-4P (never a bare digit over a place block); mine 나', () => {
      for (const st of [-1, 1]) {
        release(); D.seed(5);
        L.battle(NICKS.map((nick) => ({ char: 'duck', nick })), { arena: 0, countdown: false, monsters: false, intrusion: false });
        D.setInvincible(true); step(10);
        if (st >= 0) stage(st);
        G.players.forEach((p, k) => { p.score = [1200, 3400, 800, 2100][k]; });
        D.endBattle(); step(150);
        const T = tagsOf();
        if (T.length !== 4) return J(T);
        for (const o of T) { const want = o.slot === st ? '나' : (o.slot + 1) + 'P'; if (o.text !== want + NICKS[o.slot]) return 'me ' + st + ' text ' + J(o.text) + ' want ' + want; }
        if (T.some((o) => o.cmp)) return 'me ' + st + ' compact ' + J(T.map((o) => [o.slot, o.cmp]));
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (overBy(T[i], T[j], 0)) return 'me ' + st + ' tags ' + T[i].slot + ' / ' + T[j].slot + ' overlap';
        unstage(); D.setInvincible(false);
      }
    });
    // the canvas pixels changed by the spotlight round my animal: render with it, and with it pushed into the past
    function spotDiff(p) {
      const X = Math.round(p.x + 8) - 20, Y = Math.round(p.y + 8) - 20, at = G.spotAt;
      render(); const a = cx.getImageData(X, Y, 40, 40).data;
      G.spotAt = -1e9; render(); const b = cx.getImageData(X, Y, 40, 40).data; G.spotAt = at; render();
      let n = 0, r = 0, white = 0;
      for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) {
        const k = i / 4, dx = (k % 40) + 0.5 - 20, dy = ((k / 40) | 0) + 0.5 - 20; n++; r += Math.hypot(dx, dy);
        if (a[i] > 200 && a[i + 1] > 200 && a[i + 2] > 200) white++;
      }
      return { n, r: n ? r / n : 0, white, hash: hashOf({ data: a }) };
    }
    t('8 me (staged): my HUD panel - white number box and white underline; the others in their slot colour', () => {
      battle(D4, 0); stage(1); calm(); render();
      if (box(53, 0) !== '#ffffff' || box(55, 15) !== '#ffffff' || box(100, 15) !== '#ffffff') return 'mine ' + [box(53, 0), box(55, 15), box(100, 15)];
      if (box(1, 0) !== SLOT_COLS[0] || box(3, 15) === '#ffffff' || box(205, 0) !== SLOT_COLS[3]) return 'others ' + [box(1, 0), box(3, 15), box(205, 0)];
      unstage();
    });
    t('8 me (staged): my tag - the 나 chip and a white ring, full even 16 px from the others; nobody else white', () => inRoom(() => {
      release(); D.seed(9);
      L.battle(NICKS.map((nick, k) => ({ char: 'duck', nick })), { arena: 0, countdown: false, monsters: false, intrusion: false });
      stage(2);
      const y = P(0).y; G.players.forEach((p, k) => { p.x = 24 + 16 * k; p.y = y; p.invuln = 0; });
      render();
      const T = tagsOf(), mine = T.find((o) => o.slot === 2);
      if (!mine || !mine.me || mine.cmp || mine.text !== '나' + NICKS[2]) return 'mine ' + J(mine);
      if (T.some((o) => o.slot !== 2 && o.me)) return 'another is-me';
      const els = [...document.querySelectorAll('#pg-tags .pg-tag')].filter((e) => !e.hidden);
      for (const el of els) {
        const sh = getComputedStyle(el).boxShadow, me = el.classList.contains('is-me');
        if (me !== /rgb\(255, 255, 255\)/.test(sh)) return (me ? 'mine not white: ' : 'a white ring on ' + el.textContent + ': ') + sh;
        if (me && getComputedStyle(el.querySelector('.pg-tag-n')).backgroundColor !== 'rgb(255, 255, 255)') return 'the 나 chip is not white';
      }
      if (T.some((o, i) => T.some((q, j) => j > i && overlap(o, q)))) return 'tags overlap ' + J(T.map((o) => [o.l, o.r, o.t, o.b]));
      unstage();
    }));
    t('8 me (staged): my ground marker has a white rim, my tag pointer is white; the others ink / slot colour', () => {
      battle(['duck', 'cat', 'frog'], 0); stage(1); blinkOff();
      for (const p of G.players) {
        const c = Math.round(p.x + 8), s = Math.round(p.y) + 16, mine = p.slot === 1;
        if (box(c, s - 3) !== (mine ? '#ffffff' : INK)) return 'slot ' + p.slot + ' rim ' + box(c, s - 3);
        if (box(c, s - 1) !== SLOT_COLS[p.slot]) return 'slot ' + p.slot + ' fill ' + box(c, s - 1);
        const ax = Math.round(p.x + 5.5) + 2, ay = Math.round(p.y) - 5;
        if (box(ax, ay) !== (mine ? '#ffffff' : SLOT_COLS[p.slot])) return 'slot ' + p.slot + ' pointer ' + box(ax, ay);
      }
      unstage();
    });
    t('8 me (staged): the countdown starts the spotlight - rings round my animal growing r 9 -> 16 every 30 f for 90 f; the big 나 for 120 f', () => {
      release(); D.seed(12);
      L.battle(D4, { arena: 1, countdown: true, monsters: false, intrusion: false }); stage(3); D.setInvincible(true);
      step(1); calm();
      const s0 = D.spot(); if (!s0.on || s0.age > 1) return 'spot ' + J(s0);
      if (!lk(3).tag || !lk(3).tag.hi) return 'not hi at the countdown';
      const me = P(3), rs = [];
      for (const age of [2, 15, 28, 32, 60, 88]) {
        G.spotAt = G.frame - age; quiet(); const d = spotDiff(me);
        const want = 9 + 7 * ((age % 30) / 30) - 0.5;
        if (d.n < 12 || Math.abs(d.r - want) > 1.6) return 'age ' + age + ' ' + J(d) + ' want r ~' + want.toFixed(1);
        rs.push(d.r.toFixed(1));
      }
      G.spotAt = G.frame - 90; quiet(); if (spotDiff(me).n || D.spot().on) return 'still on at 90 f';
      G.spotAt = G.frame - 119; render(); if (!lk(3).tag.hi) return 'not hi at 119 f';
      G.spotAt = G.frame - 120; render(); if (lk(3).tag.hi) return 'still hi at 120 f';
      info('spotlight ring radius by age 2/15/28/32/60/88: ' + rs.join(' '));
      unstage(); D.setInvincible(false);
    });
    t('8 me (staged): a KO of my animal, then its respawn, starts it again (and nobody else\'s respawn does)', () => {
      battle(['duck', 'cat', 'frog'], 0); stage(1); step(130);
      if (D.spot().on) return 'on before';
      D.trapPlayer(2, 1); const b2 = P(2).trap.b; // (trapped by 2P, popped by 1P: a trapper waits a second)
      for (let i = 0; i < 40 && !P(2).koT; i++) { D.setPlayer(b2.x, b2.y, 0); step(1); }
      if (!P(2).koT) return 'no KO of 3P';
      for (let i = 0; i < 120 && P(2).koT; i++) step(1);
      if (D.spot().on) return 'on after someone else\'s respawn';
      D.trapPlayer(1, 0); const b1 = P(1).trap.b;
      for (let i = 0; i < 40 && !P(1).koT; i++) { D.setPlayer(b1.x, b1.y, 2); step(1); }
      if (!P(1).koT) return 'no KO of 2P';
      let n = 0; while (P(1).koT && n++ < 120) step(1);
      const s = D.spot();
      if (!s.on || s.age > 1 || !lk(1).tag.hi) return 'after my respawn ' + J(s) + ' ' + J(lk(1).tag);
      unstage();
    });
    t('8 me (staged): reduced motion - one still ring (white r 12 + slot r 11) for 60 f', () => {
      release(); D.seed(12);
      L.battle(D4, { arena: 1, countdown: true, monsters: false, intrusion: false }); stage(0); D.setInvincible(true);
      CALM = true; step(1); calm();
      const me = P(0), a = (G.spotAt = G.frame - 3, spotDiff(me)), b = (G.spotAt = G.frame - 40, spotDiff(me));
      if (a.n < 12 || a.hash !== b.hash || Math.abs(a.r - 11.5) > 1.2) return 'static ' + J([a, b]);
      G.spotAt = G.frame - 60; quiet();
      if (spotDiff(me).n || D.spot().on) return 'still on at 60 f';
      unstage(); D.setInvincible(false);
    });

    // ================================================================== 10. frame cost (info only here)
    t('10 frame cost: a 4-player battle, update + render (INFO; the 5 % check is ?perf=1 in real time)', () => {
      info('frame cost (virtual time) mixed ' + perf(['duck', 'capy', 'frog', 'penguin']) + ' ms, ducks ' + perf(D4) + ' ms');
    });

    release(); D.setInvincible(false);
    D.toTitle();
    log('DIST DONE pass=' + pass + ' fail=' + fail);
  }

  // ---------------------------------------------------------------- screenshot scenes (to look at, not checks)
  // ?shot=sheet&kind=coop|battle: every tile theme (co-op rounds 1-5) / every arena, with four ducks and with four
  // different animals, copied 2x into one contact sheet over the page (the canvas only: the DOM tags are not on it)
  function scene(which) {
    if (which === 'sheet') {
      const kind = Q.get('kind') === 'battle' ? 'battle' : 'coop', idx = kind === 'battle' ? [0, 1, 2, 3] : [0, 1, 2, 3, 4];
      const sets = [['ducks', 'duck,duck,duck,duck'], ['mixed', 'duck,capy,frog,penguin']], K = 2;
      const sh = document.createElement('canvas'); sh.width = idx.length * (256 * K + 8); sh.height = sets.length * (224 * K + 22);
      sh.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#000;image-rendering:pixelated';
      const sx = sh.getContext('2d'); sx.imageSmoothingEnabled = false; sx.fillStyle = '#000'; sx.fillRect(0, 0, sh.width, sh.height);
      const src = document.getElementById('pg-canvas');
      sets.forEach(([lab, chars], r) => idx.forEach((i, c) => {
        setup(kind, (k) => (k === 'chars' ? chars : k === 'arena' || k === 'round' ? String(i) : null));
        const x = c * (256 * K + 8), y = r * (224 * K + 22);
        sx.drawImage(src, 0, 0, 256, 224, x, y + 20, 256 * K, 224 * K);
        sx.fillStyle = '#fff'; sx.font = '16px sans-serif'; sx.fillText(kind + ' ' + i + ' ' + lab, x + 4, y + 15);
      }));
      document.body.appendChild(sh);
      console.log('DIST SHOT READY');
      return;
    }
    setup(which, (k) => Q.get(k));
    finish(which);
  }
  function setup(which, q) {
    const D = PG.debug, G = D.G, L = D.local;
    const step = (n) => D.step(n === undefined ? 1 : n);
    const P = (slot) => G.players.find((p) => p.slot === slot);
    const chars = (q('chars') || 'duck,duck,duck,duck').split(',');
    const quiet = () => { G.parts = []; G.pops = []; G.words = []; G.banner = null; G.bannerQ = []; G.shake = 0; };
    const nick = ['뽀숑', '까삐', '개굴', '말랑두부'];
    const list = chars.map((c, k) => ({ char: c, nick: nick[k], local: true }));
    D.seed(5);
    if (which === 'battle' || which === 'tags') {
      const a = +(q('arena') || 0);
      L.battle(list, { arena: a, countdown: false, monsters: false, intrusion: false });
      D.setInvincible(true); step(30);
      for (const p of G.players) p.invuln = 0;
      if (which === 'tags') {
        // four animals in a row on one floor (16 px apart), then walking apart: compact chips, then full pills
        const y = P(0).y; G.players.forEach((p, k) => { p.x = 40 + 16 * k; p.y = y; });
        step(+(q('f') || 1));
      } else {
        // 1P and 2P side by side on 1P's floor (16 px apart: compact tags), 3P jumping just beside them, 4P shooting
        // from its own spot, then 1P walks a little
        const p0 = P(0), y = p0.y, x = Math.min(p0.x, 150);
        if (P(1)) { P(1).x = x + 16; P(1).y = y; }
        if (P(2)) { P(2).x = x + 34; P(2).y = y; }
        step(2);
        D.press('jump', true, 2); step(1); D.press('jump', false, 2);
        D.press('shoot', true, 3); step(1); D.press('shoot', false, 3);
        step(12);
      }
    } else if (which === 'coop') {
      L.coop(list, +(q('round') || 0));
      for (const e of G.enemies) { e.state = 'descend'; e.delay = 1e9; e.y = -300; e.startY = -300; }
      D.setInvincible(true); step(60);
      for (const p of G.players) p.invuln = 0;
      // the last player a ghost well away from the others (a touch would revive it), 2P shooting
      const g = G.players[G.players.length - 1];
      if (G.players.length > 1) { D.setPlayer(150, 120, g.slot); step(1); D.hitPlayer(g.slot); step(70); }
      D.press('shoot', true, 1); step(1); D.press('shoot', false, 1); step(5);
    } else if (which === 'float') {
      const a = Math.max(0, D.arenas().findIndex((A) => A.name === '냉온탕 대결'));
      L.battle(list, { arena: a, countdown: false, monsters: false, intrusion: false });
      D.setInvincible(true); step(10);
      // 2P afloat in the cold tub (ripples beside it), 3P (the cat) about to drop into the hot one
      let put = 0;
      for (let y = 24; y < 224 && put < 2; y += 8) for (let x = 20; x < 220 && put < 2; x++) {
        const w = D.waterAt(x + 8, y), w1 = D.waterAt(x - 4, y), w2 = D.waterAt(x + 19, y);
        if (w && w1 && w2 && w.surfaceY === w1.surfaceY && w.surfaceY === w2.surfaceY && (put === 0 ? w.kind === 'cold' : w.kind === 'hot')) {
          D.setPlayer(x, w.surfaceY - 18, put === 0 ? 1 : 2); put++; x += 40;
        }
      }
      step(100); for (const p of G.players) p.invuln = 0; step(1);
    } else if (which === 'podium') {
      L.battle(list, { arena: 0, countdown: false, monsters: false, intrusion: false });
      D.setInvincible(true); step(10);
      G.players.forEach((p, k) => { p.score = [1200, 3400, 800, 2100][k] || 0; });
      D.endBattle(); step(150);
    }
    quiet(); D.step(0);
  }
  function finish(which) {
    const D = PG.debug;
    // &zoom=x,y,w,h: that canvas region blown up (pixelated) over the page, to look at single pixels
    const z = (Q.get('zoom') || '').split(',').map(Number);
    if (z.length === 4 && z.every((v) => v >= 0)) {
      const src = document.getElementById('pg-canvas'), k = Math.max(1, Math.floor(Math.min(innerWidth / z[2], innerHeight / z[3])));
      const o = document.createElement('canvas'); o.width = z[2] * k; o.height = z[3] * k;
      o.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#000;image-rendering:pixelated';
      const ox = o.getContext('2d'); ox.imageSmoothingEnabled = false;
      const paint = () => { ox.clearRect(0, 0, o.width, o.height); ox.drawImage(src, z[0], z[1], z[2], z[3], 0, 0, o.width, o.height); requestAnimationFrame(paint); };
      document.body.appendChild(o); paint();
    }
    console.log('DIST SHOT ' + which + ' ' + JSON.stringify(D.looks()));
    console.log('DIST SHOT READY');
  }
  function wait() { if (window.PG && PG.debug && PG.debug.local) setTimeout(run, 50); else setTimeout(wait, 30); }
  wait();
})();
