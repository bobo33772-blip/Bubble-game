// Integration test across all four modules (runs through PG.debug.step, so it also works under virtual time).
// Traces every PG.Audio call and checks it against the names audio.js actually defines, checks the
// round-clear music hand-off, and plays every round with random input looking for bad state.
(function () {
  let pass = 0, fail = 0;
  const ok = (name, cond, info) => { if (cond) { pass++; console.log('INT PASS ' + name); } else { fail++; console.log('INT FAIL ' + name + (info ? ': ' + info : '')); } };
  function run() {
    const D = PG.debug, G = D.G, A = PG.Audio;
    const sfxNames = new Set(A._sfxNames || []), songs = new Set(Object.keys(A._songs || {}));
    const trace = [], badNames = new Set();
    const o = { sfx: A.sfx, music: A.music };
    A.sfx = function (n, opts) { trace.push('sfx:' + n); if (!sfxNames.has(n)) badNames.add('sfx:' + n); return o.sfx.apply(A, arguments); };
    A.music = function (t) { trace.push('music:' + t); if (t !== null && !songs.has(t)) badNames.add('music:' + t); return o.music.apply(A, arguments); };
    let errors = 0;
    window.addEventListener('error', (e) => { errors++; console.log('INT page error ' + e.message); });

    // 1. round clear -> clear sfx -> clear jingle during the door transition -> main starts with "준비!"
    D.seed(11); D.start(0); D.setInvincible(true); D.step(130);
    trace.length = 0;
    D.trapAll(); D.step(2); D.popAll(); D.step(80);
    ok('last kill plays sfx clear', trace.includes('sfx:clear'), trace.join(','));
    let guard = 0; while (G.mode !== 'transition' && guard++ < 400) D.step(1);
    ok('transition plays clear jingle', G.mode === 'transition' && trace.includes('music:clear'), trace.slice(-4).join(','));
    guard = 0; while (G.mode === 'transition' && guard++ < 400) D.step(1);
    const iMain = trace.lastIndexOf('music:main'), iClear = trace.lastIndexOf('music:clear');
    ok('no main music right at round start (jingle finishes)', iMain < iClear, trace.slice(-4).join(','));
    D.step(85);
    ok('main music starts with 준비!', trace.lastIndexOf('music:main') > iClear && document.getElementById('pg-banner-main').textContent === '준비!', trace.slice(-3).join(',') + ' banner=' + document.getElementById('pg-banner-main').textContent);
    ok('HUD round advanced', G.round === 1);

    // 2. pause during the clear jingle keeps it silent and main still starts later
    D.killAll(); guard = 0; while (G.mode !== 'transition' && guard++ < 600) D.step(1);
    D.step(60); D.pause(); D.resume();
    guard = 0; while (G.mode === 'transition' && guard++ < 400) D.step(1);
    D.step(90);
    ok('main resumes after pause during jingle', trace[trace.length - 1] === 'music:main' || trace.slice(-3).includes('music:main'), trace.slice(-5).join(','));

    // 3. long random play over every round: valid audio names, sane state, no exceptions
    D.seed(2024);
    const N = D.levels().length;
    let insane = '';
    for (let r = 0; r < N; r++) {
      D.gotoRound(r); D.setInvincible(r % 3 !== 0);
      for (let f = 0; f < 900; f++) {
        if (f % 20 === 0) { for (const a of ['left', 'right', 'jump', 'shoot']) D.press(a, Math.random() < 0.4); }
        D.step(1);
        if (G.mode === 'gameover') { D.gotoRound(r); G.lives = 3; }
        const p = G.p;
        if (!isFinite(p.x) || !isFinite(p.y) || p.x < 0 || p.x > 256 || p.y < -16 || p.y > 240) { insane = 'player ' + r + ' ' + p.x + ',' + p.y; break; }
        for (const e of G.enemies) if (!isFinite(e.x) || !isFinite(e.y)) { insane = 'enemy NaN round ' + r; break; }
        for (const b of G.bubbles) if (!isFinite(b.x) || !isFinite(b.y) || b.x < 0 || b.x > 256 || b.y < 0 || b.y > 240) { insane = 'bubble ' + r + ' ' + b.x + ',' + b.y; break; }
        if (insane) break;
      }
      if (insane) break;
      if (r % 4 === 1) { D.trapAll(); D.step(30); D.popAll(); D.step(200); }
      if (D.levels()[r].special === 'steam') { G.steamT = 1; D.step(2); const sb = G.bubbles.find((b) => b.kind === 'steam'); if (sb) { D.popAll(); D.step(60); } }
      if (r % 4 === 2 && G.mode === 'playing') { G.roundT = 2690; D.step(140); } // hurry + broken shower: scald_warn / scald_splash
      if (r % 5 === 3 && G.mode === 'playing') { for (const k of ['shampoo', 'slippers', 'bathbomb']) { D.givePower(k); D.step(5); } G.power = null; }
    }
    for (const a of ['left', 'right', 'jump', 'shoot']) D.press(a, false);
    // v2 features that random play may not reach: stamps -> free entry, water splash, ice freeze + melt, doors
    {
      D.seed(77); D.start(0); D.setInvincible(true); D.step(130);
      D.giveStamps(10); D.step(5);
      const L = D.levels();
      const wr = L.findIndex((l) => !l.boss && l.map.some((row) => row.indexOf('=') >= 0));
      if (wr >= 0) {
        D.gotoRound(wr); D.step(130);
        let spot = null; const m = L[wr].map;
        for (let r2 = 1; r2 < 25 && !spot; r2++) for (let c = 2; c < 29 && !spot; c++) if (m[r2][c] === '=' && m[r2 - 1][c] !== '=' && m[r2][c + 1] === '=') spot = { c, r: r2 };
        if (spot) {
          D.setPlayer(spot.c * 8 - 4, 16 + spot.r * 8 - 40); D.step(60);            // splash into the cold pool
          D.spawnBubble('empty', spot.c * 8, 16 + spot.r * 8 - 12); D.step(2);     // freeze
          D.step(380);                                                              // melt
        }
      }
    }
    ok('random play over all rounds keeps state sane', !insane, insane);
    for (const n of ['stamp', 'ticket', 'powerup', 'scald_warn', 'door']) ok('engine played sfx ' + n, trace.includes('sfx:' + n), '');
    ok('every audio name the engine used exists in audio.js', badNames.size === 0, [...badNames].join(','));
    const used = new Set(trace.filter((t) => t.startsWith('sfx:')).map((t) => t.slice(4)));
    console.log('INT sfx used: ' + [...used].sort().join(','));

    // 4. hurry -> hurry music, death -> main again
    D.gotoRound(3); D.setInvincible(true); D.step(1805);
    ok('hurry music at 30 s', trace[trace.length - 1] === 'music:hurry' || trace.slice(-3).includes('music:hurry'), trace.slice(-3).join(','));

    // 5. game over persists the hi-score
    D.start(2); D.step(120); D.setInvincible(false); G.lives = 1; G.p.invuln = 0;
    G.score = 4321; G.hiscore = 100;
    const e = G.enemies.find((q) => q.state === 'active'); e.x = G.p.x; e.y = G.p.y; D.step(2); D.step(100);
    let stored = null; try { stored = localStorage.getItem('ppogeul-hiscore'); } catch (er) { stored = 'n/a'; }
    ok('game over: hi >= score and saved', G.mode === 'gameover' && G.hiscore >= G.score && (stored === 'n/a' || +stored === G.hiscore), 'mode=' + G.mode + ' hi=' + G.hiscore + ' stored=' + stored);
    ok('game over overlay shows hi >= score', +document.getElementById('pg-over-hi').textContent.replace(/\D/g, '') >= 4321);

    ok('no uncaught errors', errors === 0, errors);
    A.sfx = o.sfx; A.music = o.music;
    console.log('INT DONE pass=' + pass + ' fail=' + fail);
  }
  function go() { if (!window.PG || !PG.debug) return setTimeout(go, 30); setTimeout(() => { try { run(); } catch (e) { console.log('INT FAIL exception ' + e.message + ' ' + (e.stack || '').split('\n')[1]); } }, 50); }
  go();
})();
