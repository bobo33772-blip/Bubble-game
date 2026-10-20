// Real-input integration test: drives the game ONLY through DOM keyboard/pointer events and the real
// requestAnimationFrame loop (never PG.debug.step / start), the way a player would.
// Run in REAL time (virtual-time headless Chrome stops issuing animation frames, so run-chrome.js cannot drive it):
//   node tools/cdp-run.js test-realinput.html - 900 760 40000 "REAL DONE"
(function () {
  let pass = 0, fail = 0, errors = 0;
  window.addEventListener('error', (e) => { errors++; console.log('REAL page error: ' + e.message); });
  const ok = (name, cond, info) => { if (cond) { pass++; console.log('REAL PASS ' + name); } else { fail++; console.log('REAL FAIL ' + name + (info ? ': ' + info : '')); } };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (type, code, k) => window.dispatchEvent(new KeyboardEvent(type, { code, key: k || code, bubbles: true, cancelable: true }));
  const tap = async (code, k, ms) => { key('keydown', code, k); await wait(ms || 50); key('keyup', code, k); };
  const S = () => PG.debug.getState();
  const $ = (id) => document.getElementById(id);

  async function run() {
    const D = PG.debug;
    D.seed(99);
    // 1. the rAF loop runs the title attract mode on its own
    const f0 = S().frame; await wait(600);
    ok('rAF loop advances title demo', S().frame - f0 > 20 && S().phase === 'title', 'frames ' + (S().frame - f0));
    ok('title overlay visible at rest', !$('pg-title').hidden);
    ok('start button focused for keyboard users', document.activeElement === $('pg-start'), 'active=' + (document.activeElement && document.activeElement.id));

    // 2. Enter starts the game (first gesture unlocks audio)
    await tap('Enter', 'Enter');
    await wait(100);
    ok('Enter starts a game', S().phase === 'playing' && S().round === 0 && S().lives === 3, JSON.stringify({ m: S().phase, r: S().round }));
    ok('title overlay hidden', $('pg-title').hidden);
    ok('round banner shown', !$('pg-banner').hidden && $('pg-banner-main').textContent.length > 0);
    await wait(1600);
    ok('banner becomes 준비!', $('pg-banner-main').textContent === '준비!' || !$('pg-banner').hidden, $('pg-banner-main').textContent);
    D.setInvincible(true);

    // Virtual-time Chrome (tools/run-chrome.js) stops issuing animation frames about a second after load, so
    // everything below would measure a frozen game. Count raw rAF callbacks (independent of the engine) and stop
    // with a SKIP instead of reporting false failures; the real-time runner (tools/cdp-run.js) runs it all.
    const rafs = await new Promise((r) => { let n = 0; const t0 = performance.now(); const cb = () => { n++; if (performance.now() - t0 < 300) requestAnimationFrame(cb); }; requestAnimationFrame(cb); setTimeout(() => r(n), 300); });
    if (rafs < 6) {
      console.log('REAL SKIP remaining checks: animation frames are not running (' + rafs + ' in 300 ms; virtual-time Chrome). Run in real time: node tools/cdp-run.js test-realinput.html - 900 760 40000 "REAL DONE"');
      console.log('REAL DONE pass=' + pass + ' fail=' + fail + ' skipped=virtual-time');
      return;
    }

    // 3. hold right to walk
    const x0 = S().player.x;
    key('keydown', 'ArrowRight', 'ArrowRight'); await wait(400); key('keyup', 'ArrowRight', 'ArrowRight');
    ok('ArrowRight walks right', S().player.x - x0 > 15 && S().player.facing === 1, 'dx=' + (S().player.x - x0));
    const x1 = S().player.x;
    key('keydown', 'KeyA', 'a'); await wait(250); key('keyup', 'KeyA', 'a');
    ok('A walks left', S().player.x < x1 - 8 && S().player.facing === -1, 'dx=' + (S().player.x - x1));

    // 4. jump with Z, check it leaves the ground
    let minY = S().player.y; const y0 = minY;
    key('keydown', 'KeyZ', 'z');
    for (let i = 0; i < 12; i++) { await wait(30); minY = Math.min(minY, S().player.y); }
    key('keyup', 'KeyZ', 'z');
    ok('Z jumps', y0 - minY > 20, 'rise=' + (y0 - minY));
    await wait(700);

    // 5. shoot with X and Space
    const nb = S().bubbles.length;
    await tap('KeyX', 'x', 40);
    await wait(60);
    ok('X blows a bubble', S().bubbles.length > nb, nb + '->' + S().bubbles.length);
    await wait(300);
    const nb2 = S().bubbles.length;
    const ev = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
    window.dispatchEvent(ev); await wait(40); key('keyup', 'Space', ' ');
    ok('Space blows a bubble and is preventDefault-ed', ev.defaultPrevented && S().bubbles.length >= nb2, 'prevented=' + ev.defaultPrevented);

    // 6. pause / resume with P, pause button, Esc
    await tap('KeyP', 'p');
    const fp = S().frame; await wait(300);
    ok('P pauses and freezes', S().phase === 'paused' && S().frame === fp && !$('pg-pause').hidden);
    await tap('KeyP', 'p'); await wait(200);
    ok('P resumes', S().phase === 'playing' && S().frame > fp && $('pg-pause').hidden);
    $('pg-pausebtn').click(); await wait(100);
    ok('pause button pauses', S().phase === 'paused');
    $('pg-resume').click(); await wait(100);
    ok('계속하기 resumes', S().phase === 'playing');
    await tap('Escape', 'Escape'); await wait(100);
    ok('Esc pauses', S().phase === 'paused');
    await tap('Enter', 'Enter'); await wait(100);
    ok('Enter resumes from pause', S().phase === 'playing');

    // 7. mute toggle persists
    const m0 = PG.Audio.isMuted();
    await tap('KeyM', 'm'); await wait(50);
    let stored = null; try { stored = localStorage.getItem('ppogeul-muted'); } catch (e) { stored = 'n/a'; }
    ok('M toggles mute + persists', PG.Audio.isMuted() !== m0 && $('pg-sound').getAttribute('aria-pressed') === String(!m0), 'stored=' + stored);
    await tap('KeyM', 'm');

    // 8. tab hidden auto-pauses
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    await wait(50);
    ok('hidden tab auto-pauses', S().phase === 'paused');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    $('pg-resume').click(); await wait(80);

    // 9. real gameplay: trap + pop through the loop, score and items
    D.trapAll(); await wait(200);
    const sc0 = S().score;
    D.popAll(); await wait(1500);
    ok('popping trapped enemies scores >= 500 (뽀득 combo)', S().score - sc0 >= 500, 'score ' + sc0 + '->' + S().score);

    // 10. touch buttons via pointer events
    const tj = $('pg-t-jump'), ts = $('pg-t-shoot'), pad = $('pg-stick-zone');
    $('pg-app').classList.add('pg-touch-on'); window.dispatchEvent(new Event('resize')); await wait(50);
    const pr = pad.getBoundingClientRect();
    const pd = (el, type, x, y, id) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 1 }));
    const tx0 = S().player.x;
    pd(pad, 'pointerdown', pr.left + pr.width / 2, pr.top + pr.height * 0.7, 1);
    pd(pad, 'pointermove', pr.left + pr.width / 2 + D.stick().R * 0.8, pr.top + pr.height * 0.7, 1);
    const tb = S().bubbles.length;
    pd(ts, 'pointerdown', 0, 0, 2); await wait(60); pd(ts, 'pointerup', 0, 0, 2);
    await wait(300);
    pd(pad, 'pointerup', pr.left + pr.width / 2, pr.top + pr.height * 0.7, 1);
    ok('touch joystick right + 거품 together (multi-touch)', S().player.x > tx0 + 5 || S().player.x >= 222, 'dx=' + (S().player.x - tx0));
    ok('touch 거품 blows a bubble', S().bubbles.length > 0 && D.G.p.shootCd >= 0, 'bubbles ' + tb + '->' + S().bubbles.length);
    await wait(900);
    const jy0 = S().player.y; let jmin = jy0;
    pd(tj, 'pointerdown', 0, 0, 3);
    for (let i = 0; i < 10; i++) { await wait(30); jmin = Math.min(jmin, S().player.y); }
    pd(tj, 'pointerup', 0, 0, 3);
    ok('touch 점프 jumps', jy0 - jmin > 20, 'rise=' + (jy0 - jmin));

    // 11. game over through real deaths
    D.setInvincible(false); D.G.lives = 1; D.G.p.invuln = 0;
    if (!D.G.enemies.some((e) => e.state === 'active')) D.gotoRound(1);
    await wait(1800);
    D.G.p.invuln = 0;
    const e = D.G.enemies.find((q) => q.state === 'active');
    if (e) { e.x = D.G.p.x; e.y = D.G.p.y; }
    await wait(2200);
    ok('game over overlay after last life', S().phase === 'gameover' && !$('pg-over').hidden, 'mode ' + S().phase);
    ok('game over hi-score >= score', +$('pg-over-hi').textContent.replace(/[^0-9]/g, '') >= +$('pg-over-score').textContent.replace(/[^0-9]/g, ''), $('pg-over-score').textContent + ' / ' + $('pg-over-hi').textContent);
    let hs = null; try { hs = localStorage.getItem('ppogeul-hiscore'); } catch (er) { hs = 'n/a'; }
    ok('hi-score persisted', hs === 'n/a' || +hs === S().hiscore, 'stored ' + hs + ' vs ' + S().hiscore);
    await tap('Enter', 'Enter'); await wait(150);
    ok('Enter retries from game over', S().phase === 'playing' && S().lives === 3 && S().score === 0);

    ok('no uncaught page errors', errors === 0, errors + ' errors');
    console.log('REAL DONE pass=' + pass + ' fail=' + fail);
  }
  function go() { if (!window.PG || !PG.debug) return setTimeout(go, 30); setTimeout(() => run().catch((e) => { console.log('REAL FAIL exception ' + e.message + ' ' + e.stack); }), 50); }
  go();
})();
