// Phones on their side (the artifact page on a real phone viewport: node tools/cdp-run.js ... <w> <h> ... 1 - mobile
// emulation with touch). Hash:
//   #input          the joystick through pointer events (the dead zone and its hysteresis, drag right -> the duck walks
//                   right, release -> it stops, left, the knob held to the ring, the ring following the thumb, up never
//                   jumps, 점프 / 거품 with the stick held, one finger owns the stick, cancel / blur / lost capture let go),
//                   no double-tap zoom (a quick second touchend on the game's surfaces is cancelled - not on a button,
//                   an input or a panel; Safari's gesturestart is cancelled; the touch-action styles; the zoom stays 1)
//                   and the landscape layout of this viewport                                  -> TOUCH DONE pass= fail=
//   #shot=<scene>   title | play (the stick held right) | hub | over | rec: the landscape layout checks, then
//                   "TOUCH SHOT READY" for the screenshot (a failed check logs "TOUCH FAIL ...")
(function () {
  let pass = 0, fail = 0;
  const ok = (name, cond, info) => { if (cond) { pass++; console.log('TOUCH PASS ' + name); } else { fail++; console.log('TOUCH FAIL ' + name + (info !== undefined ? ': ' + JSON.stringify(info) : '')); } };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const box = (el) => { if (!el || el.hidden || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
  const ov = (a, c) => !!(a && c && a.l < c.r - 0.5 && a.r > c.l + 0.5 && a.t < c.b - 0.5 && a.b > c.t + 0.5);
  const inside = (a) => !!(a && a.l >= 0 && a.t >= 0 && a.r <= innerWidth && a.b <= innerHeight);
  const pd = (el, type, x, y, id) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: false, width: 20, height: 20 }));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // the landscape layout of this viewport: the screen fills the height (or the width the thumb columns leave), the
  // joystick zone / 점프 / 거품 / the header buttons sit beside the mirror frame, inside the viewport, apart
  function layout(tag) {
    const S = PG.debug.stick(), de = document.documentElement;
    const scr = box($('pg-screen')), fr = box($('pg-frame')), zone = box($('pg-stick-zone')), base = box($('pg-stick'));
    const jump = box($('pg-t-jump')), shoot = box($('pg-t-shoot')), btns = ['pg-sound', 'pg-pausebtn', 'pg-fs'].map((id) => box($(id))).filter(Boolean);
    ok(tag + ': the landscape touch layout is on', S.land && $('pg-app').classList.contains('pg-touch-on'), S);
    ok(tag + ': the page does not scroll', de.scrollWidth <= innerWidth && de.scrollHeight <= innerHeight && scrollY === 0, { sw: de.scrollWidth, sh: de.scrollHeight });
    const minSide = clamp(Math.round(innerHeight * 0.22), 104, 180), pr = document.createElement('div');
    pr.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(pr); const ci = getComputedStyle(pr), insV = parseFloat(ci.paddingTop) + parseFloat(ci.paddingBottom), insH = 2 * Math.max(parseFloat(ci.paddingLeft), parseFloat(ci.paddingRight)); pr.remove();
    const fills = scr && (scr.h >= innerHeight - insV - 30 || scr.w >= innerWidth - insH - 2 * minSide - 30);
    ok(tag + ': the game screen fills the height (or all the width the thumb columns leave)', fills, { scr, scale: S.scale, vw: innerWidth, vh: innerHeight });
    ok(tag + ': the screen keeps its 256:224 shape', scr && Math.abs(scr.w / scr.h - 256 / 224) < 0.01, scr);
    ok(tag + ': the joystick zone, 점프 and 거품 stay off the mirror frame and inside the viewport',
      zone && jump && shoot && base && ![zone, jump, shoot, base].some((b) => ov(b, fr)) && [jump, shoot, base].every(inside) && zone.l >= 0 && zone.r <= innerWidth, { zone, base, jump, shoot, fr });
    ok(tag + ': 점프 and 거품 apart, thumb-sized (>= 54 px)', !ov(jump, shoot) && jump.w >= 54 && shoot.w >= 54, { jump, shoot, col: S.col });
    ok(tag + ': the stick at rest sits in its zone', base && zone && base.l >= zone.l - 1 && base.r <= zone.r + 1 && base.w >= 80, { base, zone });
    ok(tag + ': the header buttons inside the viewport, off the frame and off 점프 / 거품', btns.length >= 2 && btns.every((b) => inside(b) && !ov(b, fr) && !ov(b, jump) && !ov(b, shoot)), btns);
    return { scr, fr, zone, base, jump, shoot, S };
  }

  async function input() {
    const D = PG.debug;
    const L = layout('layout');
    D.seed(3); D.start(1); D.setInvincible(true); D.step(150);
    D.setPlayer(128, D.getState().player.y);
    D.step(20);
    const zone = $('pg-stick-zone'), zr = zone.getBoundingClientRect();
    const cx = zr.left + zr.width / 2, cy = zr.top + zr.height * 0.7;
    const st = () => D.stick(), px = () => D.getState().player.x;
    pd(zone, 'pointerdown', cx, cy, 11);
    const R = st().R, b0 = box($('pg-stick'));
    ok('a touch in the zone takes the stick, the ring appears under the thumb', st().id === 11 && zone.classList.contains('is-on') && Math.abs((b0.l + b0.r) / 2 - cx) <= 1.5 && Math.abs((b0.t + b0.b) / 2 - cy) <= 1.5, { s: st(), b0, cx, cy });
    ok('the stick radius is the ring\'s (>= 40 px)', R >= 40 && Math.abs(R * 2 - b0.w) <= 1, { R, w: b0.w });
    const mv = (x, y) => pd(zone, 'pointermove', x, y, 11);
    mv(cx + 0.15 * R, cy); const d1 = st();
    mv(cx + 0.28 * R, cy); const d2 = st();
    ok('the dead zone: a small lean does nothing (0.15 and 0.28 of the radius)', d1.dir === 0 && d2.dir === 0 && !d2.on.right && !d2.on.left, { d1, d2 });
    mv(cx + 0.6 * R, cy);
    let x0 = px(); D.step(30);
    ok('drag right -> right is held and the duck walks right', st().on.right && !st().on.left && px() > x0 + 8, { s: st(), dx: px() - x0 });
    mv(cx + 0.24 * R, cy);
    ok('hysteresis: easing back to 0.24 keeps it (off only under 0.2)', st().dir === 1 && st().on.right, st());
    mv(cx + 0.1 * R, cy);
    D.step(8); x0 = px(); D.step(12);
    ok('back near the middle -> released, the duck stops', st().dir === 0 && !st().on.right && Math.abs(px() - x0) < 1.5, { s: st(), dx: px() - x0 });
    mv(cx - 0.7 * R, cy); x0 = px(); D.step(25);
    ok('drag left -> left, the duck walks left', st().on.left && !st().on.right && px() < x0 - 8, { s: st(), dx: px() - x0 });
    mv(cx + 3 * R, cy);
    const far = st(), kb = box($('pg-stick-knob')), bb = box($('pg-stick'));
    const kd = Math.hypot((kb.l + kb.r) / 2 - (bb.l + bb.r) / 2, (kb.t + kb.b) / 2 - (bb.t + bb.b) / 2);
    ok('the knob stays on the ring (clamped to the radius), the ring slides after the thumb', far.dir === 1 && kd <= R + 1 && Math.abs(far.dx - R) < 1 && (bb.l + bb.r) / 2 > cx + R, { far, kd, R, bb });
    mv(cx + 3 * R - 1.4 * R, cy);
    ok('so a turn-around is quick: 1.4 radii back from far right is already left', st().dir === -1 && st().on.left, st());
    // straight up from the ring's middle: no jump, no direction
    const ob = box($('pg-stick')), ox = (ob.l + ob.r) / 2, oy = (ob.t + ob.b) / 2;
    mv(ox, oy - R * 1.2);
    const y0 = D.getState().player.y; D.step(20);
    ok('pushing up does not jump (and walks nowhere)', st().dir === 0 && !st().on.jump && !st().on.left && !st().on.right && D.getState().player.y >= y0 - 1, { s: st(), dy: D.getState().player.y - y0 });
    // both thumbs: the stick held right, 점프 and 거품 on the right
    const ob2 = box($('pg-stick')); mv((ob2.l + ob2.r) / 2 + 0.7 * R, (ob2.t + ob2.b) / 2);
    D.step(2);
    const jy = D.getState().player.y, tj = $('pg-t-jump'), ts = $('pg-t-shoot');
    pd(tj, 'pointerdown', 0, 0, 12);
    ok('점프 with the stick held: both on', st().on.jump && st().on.right, st().on);
    let top = jy; for (let i = 0; i < 12; i++) { D.step(1); top = Math.min(top, D.getState().player.y); }
    pd(tj, 'pointerup', 0, 0, 12);
    ok('... the duck jumps while walking right', jy - top > 12 && st().on.right && !st().on.jump, { rise: jy - top, on: st().on });
    D.step(40);
    const nb = D.getState().bubbles.length;
    pd(ts, 'pointerdown', 0, 0, 13); D.step(2); pd(ts, 'pointerup', 0, 0, 13); D.step(2);
    ok('거품 with the stick held: a bubble, still walking right', D.getState().bubbles.length > nb && st().on.right, { nb, n: D.getState().bubbles.length });
    // one finger owns the stick
    pd(zone, 'pointerdown', cx - 30, cy, 14);
    ok('a second finger in the zone is ignored', st().id === 11, st());
    pd(zone, 'pointerup', cx - 30, cy, 14);
    ok('... and lifting it leaves the stick alone', st().id === 11 && st().on.right, st());
    pd(window, 'pointerup', cx, cy, 11);
    const rel = st(), rb = $('pg-stick');
    ok('lifting the thumb releases cleanly (no direction, the ring back at rest)', rel.id === null && !rel.on.right && !rel.on.left && !zone.classList.contains('is-on') && !rb.style.left && !$('pg-stick-knob').style.transform, rel);
    D.step(8); x0 = px(); D.step(12);
    ok('... and the duck stops', Math.abs(px() - x0) < 1.5, px() - x0);
    for (const [how, fire] of [['pointercancel', () => pd(window, 'pointercancel', cx, cy, 15)], ['blur', () => window.dispatchEvent(new Event('blur'))],
      ['lostpointercapture', () => pd(zone, 'lostpointercapture', cx, cy, 15)]]) {
      pd(zone, 'pointerdown', cx, cy, 15); pd(zone, 'pointermove', cx + 0.8 * R, cy, 15);
      const held = st().on.right;
      fire();
      ok(how + ' lets the stick go', held && st().id === null && !st().on.right, st());
    }
    // ---- no double-tap zoom
    const tapEnd = (el) => {
      let ev;
      try { ev = new TouchEvent('touchend', { bubbles: true, cancelable: true, changedTouches: [new Touch({ identifier: 7, target: el, clientX: 10, clientY: 10 })] }); } catch (e) { ev = new Event('touchend', { bubbles: true, cancelable: true }); }
      el.dispatchEvent(ev); return ev.defaultPrevented;
    };
    const twice = async (el) => { await wait(400); const a = tapEnd(el); await wait(80); const b = tapEnd(el); return [a, b]; };
    const cv = await twice($('pg-canvas'));
    ok('a quick second tap on the canvas: its default (the zoom) is cancelled, the first tap is not', !cv[0] && cv[1], cv);
    const pad = await twice($('pg-t-jump'));
    ok('... on the touch controls too', !pad[0] && pad[1], pad);
    const card = await twice(document.querySelector('#pg-pause .pg-card') || $('pg-frame'));
    ok('... on a card\'s text / the frame too', card[1], card);
    const btn = await twice($('pg-start'));
    ok('a quick second tap on a button keeps its default (its click)', !btn[0] && !btn[1], btn);
    const inp = await twice($('pg-nick'));
    ok('... and on an input (typing / the caret)', !inp[1], inp);
    const pan = await twice(document.querySelector('#pg-hub .pg-pcard') || $('pg-hub'));
    ok('... and inside a panel (its scrolling and taps)', !pan[1], pan);
    const g = new Event('gesturestart', { bubbles: true, cancelable: true }); document.dispatchEvent(g);
    const g2 = new Event('gesturechange', { bubbles: true, cancelable: true }); $('pg-canvas').dispatchEvent(g2);
    ok('Safari\'s pinch gestures are cancelled', g.defaultPrevented && g2.defaultPrevented);
    const ta = (el) => (el ? getComputedStyle(el).touchAction : 'missing');
    const tas = { html: ta(document.documentElement), body: ta(document.body), app: ta($('pg-app')), canvas: ta($('pg-canvas')), zone: ta($('pg-stick-zone')), jump: ta($('pg-t-jump')),
      start: ta($('pg-start')), nick: ta($('pg-nick')), panel: ta($('pg-hub')) };
    ok('touch-action: manipulation on the page / buttons / inputs / panels, none on the canvas and the controls',
      ['html', 'body', 'app', 'start', 'nick', 'panel'].every((k) => tas[k] === 'manipulation') && ['canvas', 'zone', 'jump'].every((k) => tas[k] === 'none'), tas);
    const zr2 = $('pg-stick').getBoundingClientRect();
    ok('controls select no text and show no callout', getComputedStyle($('pg-stick')).userSelect === 'none' && getComputedStyle($('pg-t-jump')).userSelect === 'none', zr2.width);
    ok('the page zoom is 1', !window.visualViewport || Math.abs(visualViewport.scale - 1) < 0.001, window.visualViewport && visualViewport.scale);
    console.log('TOUCH DONE pass=' + pass + ' fail=' + fail);
    return L;
  }

  async function shot(sc) {
    const D = PG.debug;
    D.seed(3);
    if (sc === 'play') {
      D.start(1); D.setInvincible(true); D.step(150);
      D.press('right', true); D.step(20); D.press('shoot', true); D.step(1); D.press('shoot', false); D.step(16); D.press('right', false); D.step(10);
      const zone = $('pg-stick-zone'), zr = zone.getBoundingClientRect(), cx = zr.left + zr.width / 2, cy = zr.top + zr.height * 0.72;
      pd(zone, 'pointerdown', cx, cy, 21); pd(zone, 'pointermove', cx + 0.7 * D.stick().R, cy - 4, 21);
      pd($('pg-t-jump'), 'pointerdown', 0, 0, 22);
    } else if (sc === 'hub') {
      D.shop.set({ ce: 1234, sh: 1, own: ['h5', 'n3', 'e6'], eq: '50306' }); D.toTitle(); D.shop.open('shop');
    } else if (sc === 'over') {
      D.toTitle(); D.start(4); D.step(120); D.G.score = 123450; D.G.lives = 1; D.setInvincible(false);
      const e = D.G.enemies.find((q) => q.state === 'active'); D.G.p.invuln = 0; e.x = D.G.p.x; e.y = D.G.p.y; D.step(1); D.step(160);
    } else if (sc === 'rec') {
      D.toTitle(); D.tro.openRec();
    } else D.toTitle();
    await wait(400);
    try { await document.fonts.ready; } catch (e) { /* ignore */ }
    await wait(150);
    if (sc === 'hub') {
      const pn = $('pg-hub'), cd = pn.querySelector('.pg-hub-card'), r = cd.getBoundingClientRect();
      const out = [...cd.querySelectorAll('*')].filter((e) => { if (!e.getClientRects().length || e.closest('[hidden]')) return false; const b = e.getBoundingClientRect(); return b.width && (b.left < r.left - 0.5 || b.right > r.right + 0.5); }).length;
      ok('hub: open, nothing sideways', !pn.hidden && pn.scrollWidth <= pn.clientWidth + 1 && out === 0 && inside(box(pn)), { sw: pn.scrollWidth, cw: pn.clientWidth, out });
      ok('hub: the header stays above the panel with its buttons', inside(box($('pg-pausebtn'))) && box($('pg-pausebtn')).b <= box(pn).t + 1, { btn: box($('pg-pausebtn')), pn: box(pn) });
    } else {
      layout(sc);
      const card = document.querySelector('.pg-ov:not([hidden]) .pg-card'), cb = box(card), scr = box($('pg-screen'));
      if (sc !== 'play') ok(sc + ': the card fits the screen (no clipped text)', card && card.scrollHeight <= card.clientHeight + 1 && cb.t >= scr.t - 1 && cb.b <= scr.b + 1, { sh: card && card.scrollHeight, ch: card && card.clientHeight, cb, scr });
      if (sc === 'title') {
        const ids = ['pg-start', 'pg-friends-btn', 'pg-shop-btn'].map($);
        ok('title: 혼자 하기 · 친구와 하기 · 상점 on one row, 44 px tall', ids.every((e) => e.offsetTop === ids[0].offsetTop && e.offsetHeight >= 44), ids.map((e) => e.offsetTop + '/' + e.offsetHeight));
      }
      const fs = parseFloat(getComputedStyle($('pg-screen')).fontSize);
      ok(sc + ': overlay text >= 12.5 px', fs >= 12.4, fs);
    }
    const S = D.stick();
    console.log('TOUCH SHOT READY ' + sc + ' ' + innerWidth + 'x' + innerHeight + ' scale=' + S.scale + ' side=' + S.side + ' tb=' + S.tb + ' sr=' + S.sr + ' col=' + S.col + ' pass=' + pass + ' fail=' + fail);
  }

  function go() {
    if (!window.PG || !PG.debug || !PG.debug.stick) return setTimeout(go, 30);
    const app = $('pg-app');
    if (!app.classList.contains('pg-touch-on')) { app.classList.add('pg-touch-on'); window.dispatchEvent(new Event('resize')); }
    const h = location.hash.slice(1), m = h.match(/shot=(\w+)/);
    setTimeout(() => { (m ? shot(m[1]) : input()).catch((e) => { console.log('TOUCH FAIL exception ' + (e && e.stack || e)); console.log('TOUCH DONE pass=' + pass + ' fail=' + (fail + 1)); console.log('TOUCH SHOT READY error'); }); }, 300);
  }
  go();
})();
