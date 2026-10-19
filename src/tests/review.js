// Visual review driver (reviewer). Scenario selected by location.hash; logs layout metrics then "DONE".
// #title (live attract)  #play  #trapped  #items  #hud  #banner-round  #banner-ready  #banner-hurry  #banner-extend
// #pause  #over  #ending  #transition  #focus-title  #focus-pause  #touch-title  #touch-play
(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
  const fmt = (b) => (b ? b.l + ',' + b.t + '-' + b.r + ',' + b.b + ' (' + b.w + 'x' + b.h + ')' : 'none');
  function metrics(tag) {
    const de = document.documentElement, $ = (id) => document.getElementById(id);
    const scr = box($('pg-screen')), fr = box($('pg-frame'));
    const tl = box($('pg-t-left')), tr = box($('pg-t-right')), tj = box($('pg-t-jump')), ts = box($('pg-t-shoot'));
    const touchOn = $('pg-app').classList.contains('pg-touch-on');
    const ov = (a, b) => a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    let overlap = [];
    if (touchOn) for (const [n, b] of [['left', tl], ['right', tr], ['jump', tj], ['shoot', ts]]) { if (ov(b, fr)) overlap.push(n + '/frame'); if (ov(b, scr)) overlap.push(n + '/screen'); if (b && (b.b > innerHeight || b.r > innerWidth || b.l < 0)) overlap.push(n + '/offscreen'); }
    const card = document.querySelector('.pg-ov:not([hidden]) .pg-card');
    const cb = box(card);
    let fonts = '';
    try { fonts = 'sign=' + document.fonts.check('20px "Black Han Sans"') + ' body=' + document.fonts.check('14px "Gowun Dodum"'); } catch (e) { fonts = 'n/a'; }
    console.log('METRIC ' + tag + ' vw=' + innerWidth + 'x' + innerHeight + ' scrollW=' + de.scrollWidth + ' bodyScrollW=' + document.body.scrollWidth + ' scrollH=' + de.scrollHeight +
      ' touch=' + touchOn + ' head=' + fmt(box($('pg-head'))) + ' frame=' + fmt(fr) + ' screen=' + fmt(scr) + ' scale=' + (scr ? (scr.w / 256).toFixed(3) : '?') +
      ' hints=' + fmt(box($('pg-hints'))) + ' L=' + fmt(tl) + ' R=' + fmt(tr) + ' J=' + fmt(tj) + ' S=' + fmt(ts) +
      ' card=' + fmt(cb) + (card ? ' cardScrollH=' + card.scrollHeight + ' cardClientH=' + card.clientHeight : '') + ' overlap=[' + overlap.join(',') + '] fonts:' + fonts +
      ' active=' + (document.activeElement ? document.activeElement.id || document.activeElement.tagName : 'none'));
  }
  async function go() {
    if (!window.PG || !PG.debug) return setTimeout(go, 30);
    const D = PG.debug, G = D.G, sc = (location.hash || '#title').slice(1);
    const touch = sc.indexOf('touch') === 0;
    if (touch) { document.getElementById('pg-app').classList.add('pg-touch-on'); window.dispatchEvent(new Event('resize')); }
    await sleep(500);
    D.seed(11);
    const shootBurst = (n) => { for (let i = 0; i < n; i++) { D.press('shoot', true); D.step(1); D.press('shoot', false); D.step(15); } };
    if (sc === 'title' || sc === 'touch-title') {
      await sleep(1500);
    } else if (sc === 'play' || sc === 'touch-play') {
      D.start(1); D.setInvincible(true); D.step(150);
      D.press('right', true); D.step(30); shootBurst(3); D.press('right', false);
      D.press('jump', true); D.step(8); D.press('jump', false); D.step(10);
      D.press('left', true); D.step(10); D.press('left', false); D.step(6);
      G.score = 24650; G.stamps = 2; D.step(4);
    } else if (sc === 'trapped') {
      D.start(3); D.setInvincible(true); D.step(150); D.trapAll(); D.step(70);
    } else if (sc === 'trapped-late') {
      D.start(3); D.setInvincible(true); D.step(150); D.trapAll(); D.step(Math.max(1, G.trapTime - 60));
    } else if (sc === 'items') {
      D.start(6); D.setInvincible(true); D.step(150); D.trapAll(); D.step(30); D.popAll(); D.step(26);
    } else if (sc === 'items2') {
      D.start(6); D.setInvincible(true); D.step(150); D.trapAll(); D.step(30); D.popAll(); D.step(110);
    } else if (sc === 'hud') {
      D.start(14); D.setInvincible(true); D.step(150); G.score = 1234560; G.hiscore = 2345670; G.lives = 7; G.stamps = 9; D.givePower('slippers'); G.loop = 1; D.step(2);
    } else if (sc === 'banner-round') {
      D.start(8); D.step(40);
    } else if (sc === 'banner-ready') {
      D.start(8); D.step(100);
    } else if (sc === 'banner-hurry') {
      D.start(9); D.setInvincible(true); D.step(1815);
    } else if (sc === 'banner-towel' || sc === 'banner-scald') {
      D.start(9); D.setInvincible(true); D.step(2760);
    } else if (sc === 'banner-extend') {
      D.start(2); D.setInvincible(true); D.step(150); G.stamps = 9;
      D.spawnBubble('stamp', G.p.x, G.p.y); D.step(20);
    } else if (sc === 'pause' || sc === 'focus-pause' || sc === 'touch-pause') {
      D.start(7); D.step(200); G.stamps = 6; D.pause();
      if (sc === 'focus-pause') { document.getElementById('pg-resume').focus(); }
    } else if (sc === 'over' || sc === 'touch-over') {
      G.hiscore = 150000;
      D.start(4); D.step(120); G.score = 123450; G.lives = 1; G.stamps = 7; D.setInvincible(false);
      const e = G.enemies.find((q) => q.state === 'active'); G.p.invuln = 0; e.x = G.p.x; e.y = G.p.y; D.step(1); D.step(100);
    } else if (sc === 'ending') {
      D.start(D.levels().length - 1); D.step(120); G.score = 987650; D.killAll(); D.step(600);
    } else if (sc === 'transition') {
      D.start(0); D.setInvincible(true); D.step(120); D.killAll();
      let k = 0; while (G.mode !== 'transition' && k++ < 900) D.step(1);
      D.step(85);
    } else if (sc === 'steam') {
      const i = D.levels().findIndex((l) => l.special === 'steam'); D.start(i); D.setInvincible(true); D.step(150);
      G.steamT = 1; D.step(1); const b = G.bubbles.find((q) => q.kind === 'steam'); if (b) { b.x = 60; b.y = G.p.y - 20; } G.p.facing = 1; D.step(30); D.popAll(); D.step(16);
    } else if (sc === 'dying') {
      D.start(1); D.step(120); D.setInvincible(false); const e = G.enemies.find((q) => q.state === 'active'); G.p.invuln = 0; e.x = G.p.x; e.y = G.p.y; D.step(30);
    } else if (sc === 'sheet') {
      D.start(0); D.step(1);
      const S = PG.SPRITES, P = PG.PALETTE, names = Object.keys(S);
      const cv = document.createElement('canvas'); const sc4 = 3, cols = 14; cv.width = cols * 20 * sc4; cv.height = Math.ceil(names.reduce((n, k) => n + S[k].length, 0) / cols) * 20 * sc4;
      const x = cv.getContext('2d'); x.fillStyle = '#163238'; x.fillRect(0, 0, cv.width, cv.height); let i = 0;
      for (const k of names) for (const f of S[k]) { const ox = (i % cols) * 20 * sc4, oy = Math.floor(i / cols) * 20 * sc4; f.forEach((row, r) => { for (let c = 0; c < row.length; c++) { const ch = row[c]; if (ch === '.' || !P[ch]) continue; x.fillStyle = P[ch]; x.fillRect(ox + c * sc4, oy + r * sc4, sc4, sc4); } }); i++; }
      cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99;image-rendering:pixelated'; document.body.appendChild(cv);
      console.log('SHEET ' + names.join(','));
    } else if (sc === 'focus-title') {
      document.getElementById('pg-start').focus();
    } else if (sc.indexOf('round') === 0) {
      D.start(+sc.slice(5)); D.setInvincible(true); D.step(170);
    }
    await sleep(700);
    metrics(sc);
    const st = D.getState();
    console.log('STATE ' + sc + ' mode=' + st.phase + ' round=' + st.round + ' lives=' + st.lives + ' items=' + st.items + ' enemies=' + st.enemies.map((e) => e.type + ':' + e.state).join(',') + ' banner=' + (document.getElementById('pg-banner').hidden ? 'hidden' : JSON.stringify(document.getElementById('pg-banner').textContent)));
    console.log('DONE');
  }
  go();
})();
