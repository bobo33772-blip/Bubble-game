// Phone layout probe (load inside a phone-sized iframe). Hash: #title (desktop hints), #touch-title, #touch-play.
// Logs viewport, overflow and element boxes so layout can be checked without cross-frame access.
(function () {
  function go() {
    if (!window.PG || !PG.debug) return setTimeout(go, 30);
    const sc = (location.hash || '#title').slice(1);
    if (sc.indexOf('touch') === 0) { document.getElementById('pg-app').classList.add('pg-touch-on'); window.dispatchEvent(new Event('resize')); }
    if (sc === 'touch-play') { PG.debug.seed(3); PG.debug.start(1); PG.debug.setInvincible(true); PG.debug.step(160); }
    setTimeout(() => {
      const de = document.documentElement, box = (id) => { const e = document.getElementById(id); if (!e) return 'none'; const r = e.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); };
      const card = document.querySelector('#pg-title .pg-card');
      const cr = card ? card.getBoundingClientRect() : null;
      console.log('PHONE ' + sc + ' vw=' + innerWidth + 'x' + innerHeight + ' scrollW=' + de.scrollWidth + ' scrollH=' + de.scrollHeight +
        ' head=' + box('pg-head') + ' screen=' + box('pg-screen') + ' touch=' + box('pg-touch') + ' hints=' + box('pg-hints') +
        (cr ? ' card=' + Math.round(cr.width) + 'x' + Math.round(cr.height) + ' cardScrollH=' + card.scrollHeight : ''));
    }, 400);
  }
  go();
})();
