// Phones on their side (the artifact page on a real phone viewport: node tools/cdp-run.js ... <w> <h> ... 1 - mobile
// emulation with touch). Hash:
//   #input          the joystick through pointer events (the dead zone and its hysteresis, drag right -> the duck walks
//                   right, release -> it stops, left, the knob held to the ring, the ring following the thumb, up never
//                   jumps, pulled down = 내려가기 (never while walking, hysteresis), 점프 / 거품 with the stick held, one finger owns the stick, cancel / blur / lost capture let go),
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
    // 내려가기: pulled clearly down (past 0.6 of the radius, within ~27° of straight down) - a walking thumb never drops
    {
      const G = D.G, hx = G.p.x, hy = G.p.y, rb2 = box($('pg-stick')), rx = (rb2.l + rb2.r) / 2, ry = (rb2.t + rb2.b) / 2;
      mv(rx + 0.8 * R, ry + 0.5 * R); const w1 = st();
      mv(rx + 0.5 * R, ry + 0.8 * R); const w2 = st();
      mv(rx, ry + 0.5 * R); const w3 = st();
      ok('walking with the thumb sagging low never drops (0.8 right / 0.5 down, 0.5 / 0.8, a short 0.5 pull)', w1.on.right && w2.on.right && !w1.dn && !w2.dn && !w3.dn && !w1.on.down && !w2.on.down && !w3.on.down, { w1, w2, w3 });
      // (a 2-wide platform with room above, open below, and only open air / platforms under it down to a solid floor)
      const map = D.levels()[1].map; let plat = null;
      const under = (r, c) => { for (let k = r + 1; k < 26; k++) { const s = map[k].slice(c, c + 2); if (s !== '..' && s !== '##') return false; } return map[25].slice(c, c + 2) === '##'; };
      for (let r = 4; r < 22 && !plat; r++) for (let c = 4; c < 26 && !plat; c++) if (map[r].slice(c, c + 2) === '##' && map[r - 1].slice(c, c + 2) === '..' && map[r - 2].slice(c, c + 2) === '..' && map[r + 1].slice(c, c + 2) === '..' && under(r, c)) plat = { r, c };
      const top = 16 + (plat ? plat.r : 0) * 8;
      if (plat) { D.setPlayer(plat.c * 8 - 2, top - 16); D.step(3); }
      const stood = !!plat && G.p.onGround && Math.abs(G.p.y + 16 - top) < 0.01;
      mv(rx + 0.1 * R, ry + 0.75 * R); const dn = st();
      D.step(30);
      ok('pulled down on a platform: 내려가기 is on (the ▼ notch lit), no direction, and the duck drops below the platform', stood && dn.dn && dn.on.down && dn.dir === 0 && $('pg-stick').classList.contains('is-d') && G.p.y + 16 > top + 8, { plat, stood, dn, feet: G.p.y + 16, top });
      mv(rx, ry + 0.5 * R); const h1 = st();
      mv(rx, ry + 0.4 * R); const h2 = st();
      mv(rx + 0.1 * R, ry + 0.75 * R); mv(rx + 0.6 * R, ry + 0.55 * R); const h3 = st();
      ok('hysteresis: eased back to 0.5 down it stays on, under 0.45 it lets go; more sideways than down lets go too (and walks)', h1.dn && h1.on.down && !h2.dn && !h2.on.down && !h3.dn && !h3.on.down && h3.on.right && !$('pg-stick').classList.contains('is-d'), { h1, h2, h3 });
      mv(rx, ry); D.setPlayer(hx, hy); D.step(20);
    }
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
    // ---- the press queue (design/party-games.md 3.3 / 13.3): each fresh touch press with its event's time; the stick's
    // down edge is a 'down' entry with the pointermove's time (held down: no more; released by the hysteresis and pulled
    // again: the next)
    {
      const Pq = D.party, pe = (el, type, x, y, id) => { const e = new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: false, width: 20, height: 20 }); el.dispatchEvent(e); return e; };
      D.step(2); Pq.pq(0);
      const e1 = pe(ts, 'pointerdown', 0, 0, 21); pe(ts, 'pointerup', 0, 0, 21); D.step(1);
      const q1 = Pq.pq(0);
      ok('pq: a pointerdown on 거품 queues one shoot press with its event time', q1 && q1.length === 1 && q1[0][0] === 'shoot' && Math.abs(q1[0][1] - e1.timeStamp) < 0.001, { q1, t: e1.timeStamp });
      const e2 = pe(tj, 'pointerdown', 0, 0, 22), e3 = pe(ts, 'pointerdown', 0, 0, 23); D.step(1);
      const q2 = Pq.pq(0); pe(tj, 'pointerup', 0, 0, 22);
      ok('pq: both buttons in one frame give two entries, in time order', q2 && q2.length === 2 && q2[0][0] === 'jump' && q2[1][0] === 'shoot' && q2[0][1] === e2.timeStamp && q2[1][1] === e3.timeStamp, q2);
      // (거품 still held: the left thumb pulls the stick down)
      pe(zone, 'pointerdown', cx, cy, 24); const e4 = pe(zone, 'pointermove', cx, cy + 0.8 * R, 24); D.step(1);
      const q3 = Pq.pq(0), s3 = st(), q3d = q3 ? q3.filter((q) => q[0] === 'down') : null, q3D = q3 ? q3.filter((q) => q[0] === 'D') : null;
      ok('pq: the stick pulled down while 거품 is held - one down entry with the pointermove\'s time (and one D - party-games-2 3.3), 거품 still held (two thumbs)', q3d && q3d.length === 1 && q3d[0][1] === e4.timeStamp && q3D.length === 1 && q3D[0][1] === e4.timeStamp && q3.length === 2 && s3.on.down && s3.on.shoot, { q3, on: s3.on });
      pe(zone, 'pointermove', cx + 2, cy + 0.95 * R, 24); D.step(1);
      const q4 = Pq.pq(0);
      pe(zone, 'pointermove', cx, cy + 0.3 * R, 24); pe(zone, 'pointermove', cx, cy + 0.85 * R, 24); D.step(1);
      const q5 = Pq.pq(0);
      ok('pq: a stick held down pushes no more; released by the hysteresis and pulled again - the next down entry', q4 === null && q5 && q5.length === 1 && q5[0][0] === 'down', { q4, q5 });
      pe(ts, 'pointerup', 0, 0, 23); pd(window, 'pointerup', cx, cy, 24); D.step(4); Pq.pq(0);
      // ---- party-games-2 3.3: the stick's dominant direction as 'L' / 'R' / 'D' entries (수도꼭지's faucets) - one per
      // pull with the pointermove's time; a 45° pull one; held, no more; back under STICK_OFF and pulled again, the next
      const dirs = () => (Pq.pq(0) || []).filter((q) => q[0] === 'L' || q[0] === 'R' || q[0] === 'D'), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      pe(zone, 'pointerdown', cx, cy, 31); const eL = pe(zone, 'pointermove', cx - 0.8 * R, cy, 31); D.step(1); const qL = dirs();
      pe(zone, 'pointermove', cx - 0.95 * R, cy + 0.1 * R, 31); D.step(1); const qL2 = dirs();
      pe(zone, 'pointermove', cx - 0.1 * R, cy, 31); const eL3 = pe(zone, 'pointermove', cx - 0.7 * R, cy, 31); D.step(1); const qL3 = dirs();
      ok('stick L: one \'L\' with the pointermove\'s time; held, none more; back under STICK_OFF and pulled again, the next', qL.length === 1 && qL[0][0] === 'L' && qL[0][1] === eL.timeStamp && !qL2.length && qL3.length === 1 && qL3[0][1] === eL3.timeStamp, { qL, qL2, qL3 });
      pe(zone, 'pointermove', cx, cy, 31); const eR = pe(zone, 'pointermove', cx + 0.8 * R, cy, 31); pe(zone, 'pointermove', cx, cy, 31); const eD = pe(zone, 'pointermove', cx, cy + 0.8 * R, 31); D.step(1); const qRD = dirs();
      ok('stick R then D (each pull released in between): R, D in time order', qRD.length === 2 && qRD[0][0] === 'R' && qRD[1][0] === 'D' && qRD[0][1] === eR.timeStamp && qRD[1][1] === eD.timeStamp, qRD);
      pe(zone, 'pointermove', cx, cy, 31); pe(zone, 'pointermove', cx + 0.6 * R, cy + 0.6 * R, 31); D.step(1); const q45 = dirs();
      ok('stick: a 45° pull gives ONE entry (it reads as ←/→: the zones exclude each other)', q45.length === 1 && q45[0][0] === 'R', q45);
      pe(zone, 'pointermove', cx, cy, 31); pe(zone, 'pointermove', cx - 0.8 * R, cy, 31); pe(zone, 'pointermove', cx, cy + 0.8 * R, 31); D.step(1); const qLD = dirs();
      ok('stick: sliding from ← to ↓ without coming back gives L, D (two pulls)', qLD.length === 2 && qLD[0][0] === 'L' && qLD[1][0] === 'D', qLD);
      pd(window, 'pointerup', cx, cy, 31); D.step(2); Pq.pq(0);
      ok('stickTap: the zones - down needs ny >= 0.6 and >= 2|nx|, sideways |nx| >= 0.3 and >= |ny|; the dead band keeps the last', Pq.stickTap(0, 0.6) === 'D' && Pq.stickTap(0.3, 0.6) === 'D' && Pq.stickTap(0.31, 0.6, 'L') === 'L' && Pq.stickTap(-0.3, 0) === 'L' && Pq.stickTap(0.5, -0.5) === 'R' && Pq.stickTap(0.1, 0.1, 'R') === '' && Pq.stickTap(0.25, 0.1, 'R') === 'R', [Pq.stickTap(0, 0.6), Pq.stickTap(0.31, 0.6, 'L'), Pq.stickTap(0.25, 0.1, 'R')]);
      // (while 수도꼭지 plays the stick's origin holds still: an over-pull, then the thumb back on its first touch point,
      // gives no opposite entry; outside it the origin follows the thumb as before - a fake G.mini only for these moves)
      const G0 = D.G.mini, ring = () => [$('pg-stick').style.left, $('pg-stick').style.top].join();
      D.G.mini = { id: 'tap' };
      pe(zone, 'pointerdown', cx, cy, 32); const r0 = ring(); pe(zone, 'pointermove', cx + 2 * R, cy, 32); const r1 = ring(); pe(zone, 'pointermove', cx, cy, 32);
      D.G.mini = G0; D.step(1); const qT = dirs(); pd(window, 'pointerup', cx, cy, 32); D.step(1); Pq.pq(0);
      pe(zone, 'pointerdown', cx, cy, 33); const o0 = ring(); pe(zone, 'pointermove', cx + 2 * R, cy, 33); const o1 = ring(); pe(zone, 'pointermove', cx, cy, 33); D.step(1); const qO = dirs();
      pd(window, 'pointerup', cx, cy, 33); D.step(2); Pq.pq(0);
      ok('stick in 수도꼭지: an over-pull then the thumb back on its first point gives R only (the origin held still); outside it the ring follows and the way back reads as L', same(qT.map((q) => q[0]), ['R']) && r0 === r1 && same(qO.map((q) => q[0]), ['R', 'L']) && o0 !== o1, { qT, qO, r0, r1, o0, o1 });
      // (keyboard: a fresh ←, →, ↓ is an L / R / D - an auto-repeat is not)
      const kd = (code, rep) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, repeat: !!rep })), ku = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
      kd('ArrowLeft'); kd('ArrowLeft', true); ku('ArrowLeft'); kd('ArrowRight'); ku('ArrowRight'); kd('KeyS'); kd('KeyS', true); ku('KeyS'); D.step(1); const qK = dirs();
      ok('keys: fresh ←, →, S give L, R, D (no repeat; KeyS is a down - the D key is →)', same(qK.map((q) => q[0]), ['L', 'R', 'D']), qK);
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
