// 앱인토스 콘솔 등록 이미지: the game's own frames, staged as scenes and scaled by whole numbers (nearest neighbour,
// every art pixel an exact block), drawn into one canvas that fills the viewport, for cdp-run's screenshot.
// Not a test (no pass / fail): tools/make-listing.js runs it and writes docs/listing/toss/.
//   #out=thumb  1932 x 828 썸네일 (게임 앱): two close-ups side by side, a 4-animal battle | a 4-player 거품 축구 - the core
//               play, no padding, no text (the console's rules: show the play screen, don't fill with colour / blur)
// Prints "LISTING READY <out>" (or "LISTING FAIL <why>").
(function () {
  'use strict';
  const Q = new URLSearchParams(location.hash.slice(1));
  const OUT = Q.get('out') || 'thumb';
  const log = (s) => console.log(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const CHARS = ['duck', 'cat', 'frog', 'penguin'];

  function clean(G) { G.banner = null; G.bannerQ = []; G.words = []; for (const p of G.players) { p.invuln = 0; } }
  // a copy of the game canvas as it is drawn now (256 x 224)
  function grab(D) {
    D.step(0);
    const src = document.getElementById('pg-canvas'), c = document.createElement('canvas');
    c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }
  // a 4-animal battle on the bathhouse arena: the cat caught in the penguin's bubble, the duck blowing at the frog mid-hop
  function battle(D, G) {
    D.seed(3); D.local.battle(CHARS, { perks: true, arena: 0, countdown: false }); G.manual = true;
    G.enemies = []; G.items = []; clean(G);
    const at = [[28, 196], [98, 196], [62, 196], [128, 196]];
    at.forEach(([x, y], s) => D.setPlayer(x, y, s));
    D.step(30); clean(G);
    const tap = (a, s, n) => { D.press(a, true, s); D.step(n || 1); D.press(a, false, s); };
    tap('right', 0); tap('left', 1); tap('left', 3); tap('right', 2);
    D.step(4); clean(G);
    D.party.catch(1, 3);
    tap('jump', 2, 8);
    tap('shoot', 0);
    D.step(7); tap('shoot', 3); D.step(5); clean(G);
    return grab(D);
  }
  // 거품 축구 (4 players, 2v2): everyone around the ball, a bubble flying at it
  async function soccer(D, G) {
    D.seed(4); D.local.party(CHARS, { plan: ['ball'] }); G.manual = true;
    const P = D.party;
    for (let i = 0; i < 400 && G.mode !== 'card'; i++) D.step(1);
    for (let i = 0; i < 40 && P.state().t < 12; i++) D.step(1);
    for (const p of G.players) P.ready(p.slot);
    for (let i = 0; i < 900 && G.mode !== 'playing'; i++) D.step(1);
    if (G.mode !== 'playing') return null;
    D.step(200); clean(G);
    // the ball up in the air between the teams, the duck jumping at it, the cat blowing a bubble at it
    const B = G.mini && G.mini.ball;
    if (B) { B.x = 128; B.y = 158; B.vx = 0.4; B.vy = -1.2; B.kick = 0; }
    [[92, 196], [150, 196], [176, 196], [72, 196]].forEach(([x, y], s) => D.setPlayer(x, y, s));
    D.step(20); clean(G);
    const tap = (a, s, n) => { D.press(a, true, s); D.step(n || 1); D.press(a, false, s); };
    tap('right', 0); tap('left', 1); tap('left', 2); tap('right', 3);
    if (B) { B.x = 128; B.y = 150; B.vx = 0.3; B.vy = -0.6; }
    tap('jump', 0, 7); tap('shoot', 1); D.step(6); clean(G);
    return grab(D);
  }
  // crop (x, y, w, h) of a frame at a whole-number scale k into ctx at (dx, dy)
  function blit(ctx, frame, x, y, w, h, k, dx, dy) { ctx.imageSmoothingEnabled = false; ctx.drawImage(frame, x, y, w, h, dx, dy, w * k, h * k); }

  async function main() {
    for (let i = 0; i < 300 && !(window.PG && PG.debug && PG.debug.local); i++) await sleep(20);
    const D = PG.debug, G = D.G;
    if (!D) { log('LISTING FAIL no PG.debug'); return; }
    D.audio && D.audio.mute && D.audio.mute(true);
    const W = innerWidth, H = innerHeight, cv = document.createElement('canvas');
    cv.width = W; cv.height = H; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;width:' + W + 'px;height:' + H + 'px;background:#0a2327';
    const ctx = cv.getContext('2d');
    if (OUT === 'thumb') {
      // two 966 x 828 halves: a 138 x 119 crop each at x7 (833 tall: 2 px above and 3 below fall off the edge)
      const a = battle(D, G), b = await soccer(D, G);
      if (!b) { log('LISTING FAIL soccer never played'); return; }
      const ax = +(Q.get('ax') || 20), ay = +(Q.get('ay') || 102), bx = +(Q.get('bx') || 59), by = +(Q.get('by') || 102);
      blit(ctx, a, ax, ay, 138, 119, 7, 0, -2);
      blit(ctx, b, bx, by, 138, 119, 7, 966, -2);
      ctx.fillStyle = '#0a2327'; ctx.fillRect(964, 0, 4, H); // (a 4 px seam: two scenes, not one wide floor)
    }
    document.body.appendChild(cv);
    await sleep(100);
    log('LISTING READY ' + OUT + ' ' + W + 'x' + H);
  }
  main().catch((e) => log('LISTING FAIL ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)));
})();
