// v4 shop online (design/shop.md 16.2, pass S4): looks in the room and in play, and 비누 코인 online - 3 same-origin
// iframes of preview.html on PG.Net 'bc', in REAL time.
//   node bogeul/build.js; node bogeul/tools/serve.js   (background: http://localhost:8765, root C:/Temp/bogeul)
//   node bogeul/tools/run-chrome.js http://localhost:8765/test-shop-net.html - 1200 900 rt300000 "SHOPNET DONE"
// Every frame: tro.ns('s' + i) (its own store: no worn set of a test ever reaches the default key), tro.allowBc(true)
// (ranked; bc is practice otherwise), tro.fast(true), shop.allowBc(true) (coins over bc), a fixed day with the day bonus
// already paid (every payout is exactly coinBattle / the 탕's). host H = slot 0 (wears 바가지 모자 '50000'), guest A =
// slot 1 ('10300': 양머리 수건 + 딸랑 방울), guest B = slot 2 (bare).
//   1  hi.lk reaches the host's roster; room-phase R seats carry the worn set at index 5 only for wearing seats; every
//      page's roster and room cards follow
//   2  a guest's 'eq' (the hub opened from the room): the host and the other guest within one R; a run of changes is one
//      'eq' (300 ms); the host's own change rides in R
//   3  forged sets ('zzzzz' -> bare, '9zzz9' -> 오리 머리띠 only, a number -> bare); an old-page guest (a hi without lk) is
//      bare and every page still reads the seats' counts at index 4
//   4  in game: every page's players wear the room's sets (frozen), drawn (a canvas probe: worn vs bare(true) in the same
//      frame); game-phase R seats stay 4 long in EVERY snapshot (looks add no byte); an 'eq' in the game phase is ignored;
//      another tab of a guest buying / wearing mid-match changes nothing until the room (then its 'eq' goes)
//   5  battle coins (the clock run down from 1 s): every page pays itself exactly the host-side coinBattle for its slot
//      with leftF 0 (review 2026-10-18: a guest's last 'p' clock is a few frames above 0 - it must not lose a minute);
//      the podium snapshots carry te; the sr line says it
//   6  a player leaving in the countdown's last frames: the remaining guest scales its place bonus by the host's count
//   7  co-op: an active frame gets the team's 탕, an idle one (no blows) none; the ending pays 15 + 50; revives pay the
//      reviver at the card, and 2회차 (players and counts kept) pays none again without a new revive
//   8  practice (no allowBc): 0 coins everywhere, the rules line and the sr line say so; snapshots under 3400 bytes
//   9  per-animal sets in the room (design/looks-per-animal.md 11.2): a pick carries its animal's set (pk.lk) - never the
//      old animal's set on the new animal; an older host (pk without lk) catches up by 'eq'; an older guest's pk keeps its
//      set, a junk lk is bare; dressing another animal sends nothing; a pick that raced 시작 is re-sent after the match;
//      the next match freezes each seat's animal's set (two cats in their own sets, the host a bare duck)
// Prints "SHOPNET PASS|FAIL <name>", "SHOPNET INFO ..." and "SHOPNET DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const J = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
  const ok = (name, cond, info) => { if (cond) { pass++; log('SHOPNET PASS ' + name); } else { fail++; log('SHOPNET FAIL ' + name + (info !== undefined ? ' :: ' + J(info).slice(0, 900) : '')); } return !!cond; };
  const info = (s) => log('SHOPNET INFO ' + s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(pred, ms, stepMs) {
    const t0 = performance.now();
    for (;;) { let v = false; try { v = pred(); } catch (e) { v = false; } if (v) return v; if (performance.now() - t0 > ms) return false; await sleep(stepMs || 25); }
  }
  window.addEventListener('error', (e) => { fail++; log('SHOPNET FAIL driver page error: ' + e.message + ' @' + e.lineno); });
  try { PG.debug.G.manual = true; PG.Audio.setMuted(true); } catch (e) { /* ignore */ }
  document.body.style.background = '#061518';
  const DAY = 20261020, LK = ['50000', '10300', '00000'], OWN = [['h5'], ['h1', 'n3', 'h9'], []];

  // ---------------------------------------------------------------- frames
  const frames = [];
  function frame(i) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'preview.html?net=bc&lat=8&jit=4&drop=0&frame=' + i;
      f.style.cssText = 'position:fixed;left:' + i * 400 + 'px;top:0;width:400px;height:360px;border:0;background:#0a2327';
      const t = setTimeout(() => reject(new Error('frame ' + i)), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        if (!(await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.debug.shop && w.PG.Net, 15000))) { reject(new Error('no PG ' + i)); return; }
        clearTimeout(t);
        const fr = { i, w, el: f, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, T: w.PG.debug.tro, SH: w.PG.debug.shop, errors: [], sent: [] };
        w.addEventListener('error', (e) => { fr.errors.push(e.message); fail++; log('SHOPNET frame ' + i + ' error: ' + e.message + ' @' + e.lineno); });
        for (const k of ['error', 'warn']) {
          const f0 = w.console[k];
          w.console[k] = function () { const s = Array.prototype.map.call(arguments, (a) => (a && a.stack) || String(a)).join(' '); fr.errors.push(k + ': ' + s); log('SHOPNET frame ' + i + ' console.' + k + ': ' + s); return f0.apply(w.console, arguments); };
        }
        try { w.PG.Audio.setMuted(true); } catch (e) { /* ignore */ }
        fr.T.ns('s' + i); fr.T.allowBc(true); fr.T.fast(true); fr.T.away(false); fr.T.today(DAY); fr.T.set({ t: 100 });
        fr.SH.allowBc(true); fr.SH.set({ ce: 900, sp: 0, own: OWN[i], eq: LK[i], bd: DAY, bs: 1, sh: 1 });
        frames.push(fr); resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  const S = (fr) => fr.D.getState();
  const N = (fr) => fr.mp.state();
  const SS = (fr) => fr.SH.state();
  const doc = (fr, id) => fr.w.document.getElementById(id);
  const slotOf = (fr) => N(fr).mySlot;
  const hostIdOf = (fr) => fr.mp.session().peers().find((p) => p.host).id;
  const lkOfSlot = (fr, s) => { const r = N(fr).roster.find((q) => q.slot === s); return r ? r.lk : null; };
  const looks = (fr) => SS(fr).looks.slice().sort((a, b) => a.slot - b.slot).map((q) => q.look);
  const same = (a, b) => J(a) === J(b);
  // every 'eq' a guest's session sends (the debounce)
  function watchSend(fr) {
    const s = fr.mp.session(); if (!s || s === fr.watched) return;
    fr.watched = s; const send0 = s.send.bind(s);
    s.send = function (to, m) { if (m && m.t === 'eq') fr.sent.push(m.lk); return send0(to, m); };
  }
  // every snapshot the host sets (R seats' lengths per phase, the podium's te, the bytes)
  const snaps = { gameSeatMax: 0, roomSeat6: 0, n: 0, te: [], bytesMax: 0 };
  function watchState(fr) {
    const s = fr.mp.session(); if (!s || s === fr.watchedSt) return;
    fr.watchedSt = s; const set0 = s.setState.bind(s);
    s.setState = function (st) {
      try {
        if (st && st.R && Array.isArray(st.R.p)) {
          if (st.g) { snaps.n++; for (const e of st.R.p) snaps.gameSeatMax = Math.max(snaps.gameSeatMax, e.length); snaps.bytesMax = Math.max(snaps.bytesMax, new TextEncoder().encode(JSON.stringify(st)).length); if (st.g.ph === 'd' && 'te' in st.g) snaps.te.push(st.g.te); }
          else { for (const e of st.R.p) if (e.length > 5) snaps.roomSeat6++; if (snaps.seats) snaps.seats.push(st.R.p.map((e) => [e[0], e[2], e.length > 5 ? e[5] : '00000'])); }
        }
      } catch (e) { /* ignore */ }
      return set0(st);
    };
  }
  const NICKS = ['방장', '까삐', '펭펭'], CHARS = ['duck', 'capy', 'penguin'];
  let code = null;
  async function join(g) { const r = await g.mp.join(code, { nick: NICKS[g.i], char: CHARS[g.i] }); watchSend(g); await until(() => N(g).screen === 'room' && N(g).roster.length > 0, 4000); return r; }
  async function readyAll(F) { for (const g of F.slice(1)) g.mp.ready(true); return until(() => N(F[0]).canStart, 6000); }
  // (keep: the co-op round keeps its enemies - an empty round would clear at once, before anyone blew a bubble)
  async function start(F, keep) {
    F[0].mp.start();
    await until(() => F.every((f) => S(f).phase === 'countdown' || S(f).phase === 'playing'), 6000);
    const ok1 = await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online), 8000);
    for (const f of F) f.D.setInvincible(true);
    const hg = F[0].G; if (!keep) hg.enemies.length = 0; if (hg.battle) { hg.battle.enemyT = 1e9; hg.battle.powerT = 1e9; }
    return ok1;
  }
  const press = (fr, a, down) => fr.D.press(a, down, slotOf(fr));
  async function blows(fr, n) { for (let k = 0; k < n; k++) { press(fr, 'shoot', true); await sleep(50); press(fr, 'shoot', false); await sleep(460); } }
  async function toRoom(F) { F[0].mp.toRoom(); return until(() => F.every((f) => N(f).screen === 'room'), 6000); }
  // the region of player p's 24x24 composite on fr's canvas, rendered now (worn) and again bare in the same tick:
  // how many pixels the items (and a lifted tag pointer) change
  function probe(fr, slot) {
    const p = fr.G.players.find((q) => q.slot === slot); if (!p) return -1;
    const cv = doc(fr, 'pg-canvas'), x = cv.getContext('2d'), X = Math.round(p.x) - 4, Y = Math.round(p.y) - 12;
    const grab = () => { fr.D.step(0); return x.getImageData(X, Y, 24, 28).data; };
    // (the start's invulnerability blinks an animal away every other 4 frames: both renders see it drawn)
    const manual = fr.G.manual, inv = fr.G.players.map((q) => q.invuln); for (const q of fr.G.players) q.invuln = 0;
    const a = grab(); fr.SH.bare(true); const b = grab(); fr.SH.bare(false);
    fr.G.players.forEach((q, k) => { q.invuln = inv[k]; }); fr.D.step(0); fr.G.manual = manual;
    let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
    return n;
  }

  // ---------------------------------------------------------------- the main run
  async function main() {
    const F = [await frame(0), await frame(1), await frame(2)];
    const [H, A, B] = F;
    // ---- 1. the room: hi.lk, R index 5, every page's roster and cards
    code = await H.mp.host({ mode: 'battle', nick: NICKS[0], char: CHARS[0], arena: 0, time: 2, perks: true, monsters: false, intrusion: false, bet: 0 });
    watchState(H);
    for (const g of [A, B]) await join(g);
    const inRoom = await until(() => N(H).roster.length === 3 && F.every((f) => N(f).screen === 'room' && N(f).roster.length === 3), 8000);
    if (!ok('room: a battle room with 3 players', !!inRoom, F.map((f) => N(f).roster.length))) return;
    await until(() => lkOfSlot(H, 1) === LK[1] && lkOfSlot(B, 1) === LK[1] && lkOfSlot(A, 0) === LK[0] && F.every((f) => N(f).roster.every((r) => r.cup === 100)), 4000);
    ok('hi: the guest\'s worn set reached the host\'s roster (A 10300, B bare)', lkOfSlot(H, 1) === LK[1] && lkOfSlot(H, 2) === '00000', N(H).roster);
    const R0 = N(H).tro.R, seat = (s) => R0 && R0.p.find((e) => e[0] === s);
    ok('R (room): a wearing seat carries its set at index 5 (H 50000, A 10300), a bare one stays 5 long', R0 && seat(0).length === 6 && seat(0)[5] === LK[0] && seat(1).length === 6 && seat(1)[5] === LK[1] && seat(2).length === 5 && seat(2)[4] === 100, R0 && R0.p);
    ok('every page\'s roster knows every seat\'s set (and still every count at index 4)', F.every((f) => same([0, 1, 2].map((s) => lkOfSlot(f, s)), LK) && N(f).roster.every((r) => r.cup === 100)), F.map((f) => N(f).roster.map((r) => [r.lk, r.cup])));
    const cardHash = (fr, k) => { const li = fr.w.document.querySelectorAll('#pg-room-players > li')[k], cv = li && li.querySelector('canvas'); if (!cv) return 0; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let s = 0; for (let i = 0; i < d.length; i++) s = (Math.imul(s, 31) + d[i]) | 0; return s; };
    const hc0 = cardHash(B, 0);
    // ---- 2. 'eq': the host's own change rides in R; a guest's from the hub opened from the room
    // (wait for BOTH guests: each page's copy of the host's R comes over its own simulated link - 8 + U(0, 4) ms on the
    // receiving end - so A can take a few ms longer than B; waiting for B alone then reading A raced, run-all 2026-10-18)
    H.SH.wear('h', null);
    const off = await until(() => lkOfSlot(B, 0) === '00000' && cardHash(B, 0) !== hc0 && lkOfSlot(A, 0) === '00000', 3000);
    ok('the host takes its hat off in the room: R carries it, the guests\' rosters and the host\'s card on their pages follow', !!off, [lkOfSlot(B, 0), lkOfSlot(A, 0)]);
    H.SH.wear('h', 'h5');
    const on = await until(() => lkOfSlot(B, 0) === LK[0] && cardHash(B, 0) === hc0 && lkOfSlot(A, 0) === LK[0], 3000);
    ok('... and back on: the same card picture as before', !!on, { B: lkOfSlot(B, 0), A: lkOfSlot(A, 0), card: cardHash(B, 0) === hc0 });
    B.SH.open('my', 'room'); await sleep(60);
    ok('B: the hub opened from the room (the session goes on)', SS(B).hub.shown && SS(B).hub.from === 'room' && N(B).screen === 'room', SS(B).hub);
    const sent0 = B.sent.length;
    B.SH.wear('n', 'n1'); await sleep(60); B.SH.wear('n', null); await sleep(60); B.SH.wear('n', 'n1');
    const got = await until(() => lkOfSlot(H, 2) === '00100' && lkOfSlot(A, 2) === '00100', 3000);
    ok('B wears the starter ribbon in the hub: the host and A see it within one R', !!got, [lkOfSlot(H, 2), lkOfSlot(A, 2)]);
    await sleep(500);
    ok('B: three quick changes went as ONE \'eq\' (300 ms after the last), what B last told = 00100', B.sent.length - sent0 === 1 && B.sent[B.sent.length - 1] === '00100' && SS(B).eqSent === '00100', [B.sent.slice(sent0), SS(B).eqSent]);
    B.SH.close(); await sleep(60);
    ok('B: closing the hub returns to the room', N(B).screen === 'room' && !doc(B, 'pg-room').hidden);
    // (gacha.md 13.2, G3) a drawn draw-only item (b9 선녀 날개옷, as a 1회 뽑기 left it: own + gd) worn in the room - the
    // host's and A's rosters carry it (the room card is a bust: 등 is not drawn there; section 4 draws the sets in play);
    // taken off again for what follows
    B.SH.set({ own: ['b9'], gd: ['b9'], dn: 1 }); B.SH.wear('b', 'b9');
    const b9 = await until(() => lkOfSlot(H, 2) === '00190' && lkOfSlot(A, 2) === '00190', 3000);
    ok('B wears its drawn 선녀 날개옷 (b9) in the room: the host and A have it (00190)', !!b9, [lkOfSlot(H, 2), lkOfSlot(A, 2)]);
    B.SH.wear('b', null);
    await until(() => lkOfSlot(H, 2) === '00100' && lkOfSlot(A, 2) === '00100', 3000);
    // ---- 3. forged sets, an old-page guest
    const raw = (fr, m) => fr.mp.session().send(hostIdOf(fr), m);
    raw(A, { t: 'eq', lk: 'zzzzz' }); const z1 = await until(() => lkOfSlot(H, 1) === '00000', 2000);
    raw(A, { t: 'eq', lk: '9zzz9' }); const z2 = await until(() => lkOfSlot(H, 1) === '90000', 2000);
    raw(A, { t: 'eq', lk: 12345 }); const z3 = await until(() => lkOfSlot(H, 1) === '00000', 2000);
    ok('forged: "zzzzz" -> bare, "9zzz9" -> 오리 머리띠 only (catalog ids only; n9 is one since the 뽑기), a number -> bare', !!(z1 && z2 && z3), lkOfSlot(H, 1));
    raw(A, { t: 'hi', n: NICKS[1], c: CHARS[1], cu: 100, d: N(H).roster[1].d });   // (an older page's hi: no lk)
    await until(() => N(H).tro.R && N(H).tro.R.p.find((e) => e[0] === 1).length === 5, 2000);
    const R1 = N(H).tro.R;
    ok('an old-page guest (hi without lk): bare, its seat 5 long; every page still reads the counts at index 4', R1.p.find((e) => e[0] === 1).length === 5 && lkOfSlot(H, 1) === '00000' && F.every((f) => N(f).roster.every((r) => r.cup === 100)), R1.p);
    raw(A, { t: 'eq', lk: LK[1] });
    await until(() => lkOfSlot(H, 1) === LK[1] && lkOfSlot(B, 1) === LK[1], 2000);
    B.SH.wear('n', null);                                       // (B bare again: the control in the drawing probe)
    await until(() => lkOfSlot(H, 2) === '00000' && lkOfSlot(A, 2) === '00000', 2000);
    ok('(A back to 10300, B bare again)', lkOfSlot(H, 1) === LK[1] && lkOfSlot(H, 2) === '00000');
    ok('the room phase sent seats with sets (R index 5) and nothing else changed shape', snaps.roomSeat6 > 0, snaps);

    // ---- 4. in game: the room's sets, frozen and drawn; R seats 4 long in every snapshot
    if (!ok('ready and start', await readyAll(F) && await start(F), F.map((f) => S(f).phase))) return;
    await sleep(300);
    ok('every page\'s players wear the room\'s sets (H 50000, A 10300, B bare)', F.every((f) => same(looks(f), LK)), F.map(looks));
    const pr = F.map((f) => [0, 1, 2].map((s) => probe(f, s)));
    ok('every page draws them: the wearing players\' pixels change with bare(true), the bare one\'s do not', pr.every((r) => r[0] > 20 && r[1] > 20 && r[2] === 0), [pr, F.map((f) => f.G.players.map((q) => [q.slot, Math.round(q.x), Math.round(q.y), q.look, q.char, !!q.ghost, !!q.trap, !!q.dead, q.koT | 0, f.G.mode]))]);
    raw(A, { t: 'eq', lk: '00000' }); await sleep(400);
    ok('an \'eq\' in the game phase is ignored (the host\'s seat and every page\'s player unchanged)', lkOfSlot(H, 1) === LK[1] && F.every((f) => same(looks(f), LK)), [lkOfSlot(H, 1), F.map(looks)]);
    // another tab of A's browser takes the hat off and wears 오리 머리띠 mid-match: nothing changes until the room
    const ak = A.T.state().key, ao = JSON.parse(A.w.localStorage.getItem(ak)); ao.eq = '90300';
    A.w.localStorage.setItem(ak, JSON.stringify(ao)); A.w.dispatchEvent(new A.w.StorageEvent('storage', { key: ak }));
    await sleep(500);
    ok('another tab of A wears 오리 머리띠 mid-match: A\'s store has it, but no page\'s player changes and no \'eq\' goes', A.SH.look() === '90300' && F.every((f) => same(looks(f), LK)) && SS(A).eqSent === LK[1] && lkOfSlot(H, 1) === LK[1], [A.SH.look(), F.map(looks), SS(A).eqSent]);
    // ---- 5. battle coins: every page pays itself the host-side coinBattle with leftF 0
    await Promise.all(F.map((f, k) => blows(f, 5 + k)));
    await sleep(300);
    const shots = F.map((f) => SS(f).shots);
    ok('each page counted its own blows (5 / 6 / 7)', same(shots, [5, 6, 7]), shots);
    for (const [slot, sc] of [[0, 900], [1, 2400], [2, 600]]) { const p = H.G.players.find((q) => q.slot === slot); p.score = sc; p.kos = 0; p.koed = 0; }
    H.D.setTimeLeft(1);
    const pod = await until(() => F.every((f) => S(f).phase === 'podium' && SS(f).pod), 8000);
    if (!ok('the clock runs down from 1 s: every page on the podium', !!pod, F.map((f) => S(f).phase))) return;
    await sleep(200);
    const order = H.G.podium.order.slice(), fin = order.map((s) => { const p = H.G.players.find((q) => q.slot === s); return { slot: s, sc: p.score, k: p.kos, ko: p.koed }; });
    const want = F.map((f, k) => H.SH.battle(3, fin, slotOf(f), 0, 2 * 3600, shots[k], 0));
    const paid = F.map((f) => SS(f).pod.give);
    ok('battle: every page paid itself exactly the host-side coinBattle with leftF 0 (2분 3 players: 1st 18, 2nd 14, 3rd 10)', same(paid, want) && same(want.slice().sort((a, b) => b - a), [18, 14, 10]), { paid, want, order, n: F.map((f) => SS(f).n) });
    ok('battle: the players at 시작! were 3 on every page; the coins are in each store (900 + its pay)', F.every((f) => SS(f).n === 3) && F.every((f, k) => SS(f).co === 900 + paid[k]), F.map((f) => [SS(f).n, SS(f).co]));
    ok('battle: the podium snapshots carry the host\'s end clock te (0: the clock ran out)', snaps.te.length > 0 && snaps.te.every((t) => t === 0), snaps.te.slice(0, 5));
    const sr = F.map((f) => doc(f, 'pg-podium-sum').textContent);
    ok('battle: every page\'s screen-reader line names its own coins', F.every((f, k) => new RegExp(', 비누 코인 \\+' + paid[k] + '개$').test(sr[k])), sr);
    ok('game-phase R seats stayed 4 long in every snapshot (looks add no byte); snapshots <= 3400 bytes', snaps.n > 50 && snaps.gameSeatMax === 4 && snaps.bytesMax <= 3400 && N(H).snap.max <= 3400, { n: snaps.n, seat: snaps.gameSeatMax, bytes: snaps.bytesMax, max: N(H).snap.max });
    // back in the room: A's mid-match change goes now
    await toRoom(F);
    const back = await until(() => lkOfSlot(H, 1) === '90300' && lkOfSlot(B, 1) === '90300', 3000);
    ok('back in the room: A\'s mid-match set goes to the host (its \'eq\') and on to B', !!back && SS(A).eqSent === '90300', [lkOfSlot(H, 1), SS(A).eqSent]);
    await readyAll(F); await start(F); await sleep(300);
    ok('the next match wears it (every page: A 90300)', F.every((f) => same(looks(f), ['50000', '90300', '00000'])), F.map(looks));
    for (const f of F) f.SH.set({ eq: LK[f.i] });
    await toRoom(F);

    // ---- 6. a leaver in the countdown's last frames: the remaining guest uses the host's count at 시작!
    await readyAll(F);
    H.mp.start();
    await until(() => S(H).phase === 'countdown', 4000, 5);
    await until(() => (H.G.countT | 0) >= 172, 4000, 2);
    const leftAt = H.G.countT | 0; B.mp.leave();
    const go = await until(() => [H, A].every((f) => S(f).phase === 'playing' && SS(f).n > 0) && SS(A).n > 0, 8000);
    await sleep(300);
    info('leaver: H counted ' + SS(H).n + ' at 시작! (players ' + H.G.players.length + '), A ' + SS(A).n + ' (players ' + A.G.players.length + ')');
    ok('a player leaving at the countdown\'s frame ' + leftAt + ' of 180: A takes the host\'s count at 시작! (' + SS(H).n + ')', !!go && SS(A).n === SS(H).n, [SS(H).n, SS(A).n]);
    for (const f of [H, A]) f.D.setInvincible(true);
    await Promise.all([H, A].map((f) => blows(f, 5)));
    for (const [slot, sc] of [[0, 300], [1, 1200]]) { const p = H.G.players.find((q) => q.slot === slot); if (p) { p.score = sc; p.kos = 0; p.koed = 0; } }
    H.D.setTimeLeft(1);
    await until(() => [H, A].every((f) => S(f).phase === 'podium' && SS(f).pod), 8000);
    await sleep(200);
    const fin2 = H.G.podium.order.map((s) => { const p = H.G.players.find((q) => q.slot === s); return { slot: s, sc: p.score, k: p.kos, ko: p.koed }; });
    const want2 = [H, A].map((f) => H.SH.battle(SS(H).n, fin2, slotOf(f), 0, 2 * 3600, SS(f).shots, 0)), paid2 = [H, A].map((f) => SS(f).pod.give);
    ok('... and both pay the host-side coinBattle at that count (A 1st of ' + SS(H).n + ')', same(paid2, want2), { paid2, want2 });
    await toRoom([H, A]);
    // B comes back
    const jb = await join(B);
    await until(() => N(H).roster.length === 3 && N(B).screen === 'room', 6000);
    ok('B joins again', jb && jb.ok && N(H).roster.length === 3, jb);

    // ---- 7. co-op: the team's 탕 for the active frames, revives at the card, 2회차 pays them once
    H.mp.setOpts({ mode: 'coop' }); await sleep(200);
    if (!ok('co-op: ready and start', await readyAll(F) && await start(F, true), F.map((f) => S(f).phase))) return;
    await sleep(400);
    const run0 = F.map((f) => SS(f).run && SS(f).run.got);
    await Promise.all([H, A].map((f) => blows(f, 2)));                 // (B stays idle)
    H.D.killAll();
    const r1 = await until(() => F.every((f) => S(f).round === 1 && S(f).phase === 'playing'), 15000, 50);
    await sleep(400);
    const got1 = F.map((f) => SS(f).run.got);
    ok('co-op: the first 탕 cleared - H and A (2 blows each) +6, B (idle) nothing', !!r1 && same(run0, [0, 0, 0]) && same(got1, [6, 6, 0]), { run0, got1 });
    // revives (the host's counts ride in the rows: r[10]); then the last boss 탕 and the ending
    H.G.players.find((q) => q.slot === 0).revives = 1; H.G.players.find((q) => q.slot === 1).revives = 2;
    await sleep(300);
    H.D.gotoRound(23); await until(() => F.every((f) => S(f).round === 23), 6000);
    await sleep(600);
    await Promise.all([H, A].map((f) => blows(f, 2)));
    H.D.killBoss();
    const end = await until(() => F.every((f) => S(f).phase === 'ending'), 20000, 50);
    await sleep(800);
    const got2 = F.map((f) => SS(f).run.got);
    ok('co-op: the ending - H and A + 15 + 50, and at the card their revives (H 1, A 2: +2 / +4); B nothing', !!end && same(got2, [6 + 65 + 2, 6 + 65 + 4, 0]), got2);
    ok('co-op: the ending card shows each page\'s coins (B: no row)', !doc(H, 'pg-end-crow').hidden && doc(A, 'pg-end-coin').querySelector('span').textContent === '+' + got2[1] && doc(B, 'pg-end-crow').hidden, [doc(H, 'pg-end-coin').textContent, doc(A, 'pg-end-coin').textContent]);
    // 2회차: the players and their counts are kept - a card without a new revive pays none of them again
    doc(H, 'pg-end-next').click();
    const loop2 = await until(() => F.every((f) => S(f).loop === 1 && S(f).phase === 'playing'), 10000, 50);
    await sleep(500);
    ok('2회차: a new run everywhere, its revive baseline the counts so far (H 1, A 2)', !!loop2 && SS(H).run.rv0 === 1 && SS(A).run.rv0 === 2 && SS(B).run.rv0 === 0, F.map((f) => SS(f).run && SS(f).run.rv0));
    H.G.lives = 0; for (const p of H.G.players) H.D.hitPlayer(p.slot);
    const over = await until(() => F.every((f) => S(f).phase === 'gameover'), 20000, 100);
    await sleep(600);
    const got3 = F.map((f) => SS(f).run.got);
    ok('2회차 game over: no revive paid again (review 2026-10-18: it used to pay +2 / +4 at every 회차), no coin row', !!over && same(got3, [0, 0, 0]) && F.every((f) => doc(f, 'pg-over-crow').hidden), got3);
    await toRoom(F);

    // ---- 8. practice: no allowBc -> no coins, said so
    H.T.allowBc(false); for (const f of F) f.SH.allowBc(false);
    await until(() => N(B).tro.q === 1, 3000);
    const rules = [...doc(H, 'pg-room-rules').children].map((li) => li.textContent);
    ok('practice: the room\'s rules line says 연습 경기라 비누 코인도 없어요', rules.includes('연습 경기라 비누 코인도 없어요'), rules);
    H.mp.setOpts({ mode: 'battle' }); await sleep(200);
    const co0 = F.map((f) => SS(f).co);
    await readyAll(F); await start(F);
    await Promise.all(F.map((f) => blows(f, 5)));
    H.D.setTimeLeft(1);
    await until(() => F.every((f) => S(f).phase === 'podium' && SS(f).pod), 8000);
    await sleep(300);
    ok('practice: a full battle pays nobody; every podium says 연습 경기라 비누 코인은 없어요', same(F.map((f) => SS(f).co), co0) && F.every((f) => SS(f).pod.give === 0 && SS(f).pod.prac && /, 연습 경기라 비누 코인은 없어요$/.test(doc(f, 'pg-podium-sum').textContent)), F.map((f) => [SS(f).co, SS(f).pod, doc(f, 'pg-podium-sum').textContent]));
    const sn = N(H).snap;
    ok('snapshots stayed under 3400 bytes (max ' + sn.max + ', trims ' + sn.trims + ')', sn.max > 0 && sn.max <= 3400 && sn.refused === 0, sn);
    await toRoom(F);

    // ---- 9. per-animal sets in the room (looks-per-animal.md 11.2)
    const seatOf = (fr, s) => N(fr).roster.find((q) => q.slot === s) || {};
    const at = (s) => [seatOf(H, s).char, lkOfSlot(H, s)].join();
    const sendOf = (fr) => fr.mp.session().send.bind(fr.mp.session());
    B.SH.set({ own: ['h5', 'n3'], eq: '50000' + '00000'.repeat(3) + '00300' + '00000' }); B.mp.pickChar('duck');
    const p1 = await until(() => at(2) === 'duck,50000', 3000);
    ok('per animal: B dresses its duck 50000 and its cat 00300 and plays the duck - the host has duck + 50000', !!p1, at(2));
    snaps.seats = []; B.mp.pickChar('cat');
    const p2 = await until(() => at(2) === 'cat,00300' && seatOf(A, 2).char === 'cat' && lkOfSlot(A, 2) === '00300', 3000);
    await sleep(1000);
    const seen2 = snaps.seats.map((p) => (p.find((e) => e[0] === 2) || []).slice(1).join()), first = seen2.find((x) => /^cat,/.test(x));
    ok('per animal: B picks the cat - no R ever shows cat + the duck\'s 50000, the first R with the cat has 00300; A\'s card too', !!p2 && !seen2.includes('cat,50000') && first === 'cat,00300', [seen2.slice(0, 8), at(2)]);
    snaps.seats = null;
    // an older host: B's pk without lk -> the host shows the old set until B's 'eq' 300 ms later
    // (and its 'eq' 300 ms later: a pick back within 300 ms sends none - CO.eqSent would still be the cat's set)
    B.mp.pickChar('duck'); await until(() => at(2) === 'duck,50000', 3000); await sleep(500);
    const sB = B.mp.session(), send1 = sB.send; sB.send = function (to, m) { if (m && m.t === 'pk') m = { t: 'pk', c: m.c }; return send1.call(this, to, m); };
    B.mp.pickChar('cat');
    const old1 = await until(() => at(2) === 'cat,50000', 2000, 5), old2 = await until(() => at(2) === 'cat,00300', 1500);
    sB.send = send1;
    ok('per animal: an older host (pk without lk) shows cat + 50000, then 00300 by B\'s \'eq\'', !!old1 && !!old2, at(2));
    // an older guest: a pk without lk keeps its set; a junk lk is bare
    const raw9 = (fr, m) => fr.mp.session().send(hostIdOf(fr), m);
    raw9(A, { t: 'pk', c: 'frog' }); const g1 = await until(() => at(1) === 'frog,' + LK[1], 2000);
    raw9(A, { t: 'pk', c: 'frog', lk: 7 }); const g2 = await until(() => at(1) === 'frog,00000', 2000);
    ok('per animal: an older guest\'s pk (no lk) keeps its set; a junk lk (7) makes it bare, the animal follows m.c', !!g1 && !!g2, at(1));
    raw9(A, { t: 'pk', c: 'capy', lk: LK[1] }); await until(() => at(1) === 'capy,' + LK[1], 2000);
    // dressing another animal than the seat's: nothing sent, R unchanged
    B.SH.open('my', 'room'); await sleep(60);
    const sent9 = B.sent.length; B.SH.wear('h', null, 'duck'); await sleep(600);
    ok('per animal: B undresses its duck (not its seat\'s animal) in the hub from the room: no \'eq\', the host\'s R unchanged', B.sent.length === sent9 && at(2) === 'cat,00300' && B.SH.look('duck') === '00000', [B.sent.slice(sent9), at(2)]);
    B.SH.wear('h', 'h5', 'duck'); B.SH.close(); await sleep(60);
    // the race: B's pick (cat) held back until the host's netStart ran - the match freezes B as the duck in the duck's set;
    // back in the room B says the pick again, with its set
    B.mp.pickChar('duck'); await until(() => at(2) === 'duck,50000' && lkOfSlot(B, 2) === '50000', 3000); await sleep(400);
    const held = [], send2 = sB.send; sB.send = function (to, m) { if (m && (m.t === 'pk' || m.t === 'eq')) { held.push([to, m]); return true; } return send2.call(this, to, m); };
    await readyAll(F);
    B.mp.pickChar('cat');
    H.mp.start();
    await until(() => N(H).screen === 'game', 3000, 5);
    sB.send = send2; for (const [to, m] of held) send2.call(sB, to, m);
    await until(() => F.every((f) => S(f).phase === 'playing'), 8000);
    for (const f of F) f.D.setInvincible(true);
    await sleep(300);
    const race = F.map((f) => { const p = f.G.players.find((q) => q.slot === 2); return p ? p.char + ',' + p.look : ''; });
    ok('per animal: a pick that raced 시작 - the match freezes B as the duck in the duck\'s set on every page (B\'s pick stays the cat)', race.every((x) => x === 'duck,50000') && B.G.sel === 'cat' && held.length > 0, [race, B.G.sel, held.map((x) => x[1].t)]);
    H.D.setTimeLeft(1);
    await until(() => F.every((f) => S(f).phase === 'podium'), 8000);
    await toRoom(F);
    const re = await until(() => F.every((f) => seatOf(f, 2).char === 'cat' && lkOfSlot(f, 2) === '00300'), 3000);
    ok('per animal: back in the room B re-sends its pick with its set - every page has B as the cat in 00300 (seat, animal and set agree)', !!re && B.mp.seat() === 'cat', [F.map((f) => [seatOf(f, 2).char, lkOfSlot(f, 2)]), B.mp.seat()]);
    // the next match: each seat's animal's set - the host dressed only its cat and plays a bare duck; A and B both on
    // cats wear their own sets (the second cat in its twin colour)
    H.SH.set({ eq: '00000'.repeat(4) + '50000' + '00000' }); A.mp.pickChar('cat');
    await until(() => at(0) === 'duck,00000' && at(1) === 'cat,' + LK[1] && F.every((f) => lkOfSlot(f, 1) === LK[1] && seatOf(f, 1).char === 'cat'), 3000);
    await readyAll(F); await start(F); await sleep(300);
    const lk9 = F.map(looks), pr9 = F.map((f) => [0, 1, 2].map((s) => probe(f, s)));
    ok('per animal: the next match - H a bare duck (its cat is dressed, not its duck), A 10300 and B 00300 on two cats, on every page', F.every((f, k) => same(lk9[k], ['00000', LK[1], '00300'])) && F.every((f) => f.G.players.filter((q) => q.char === 'cat').length === 2), lk9);
    ok('per animal: drawn - the bare duck\'s pixels do not change with bare(true), both cats\' do', pr9.every((r) => r[0] === 0 && r[1] > 20 && r[2] > 20), pr9);
    ok('per animal: game-phase R seats still 4 long in every snapshot (a pick adds no byte to the match)', snaps.gameSeatMax === 4, snaps.gameSeatMax);
    H.D.setTimeLeft(1); await until(() => F.every((f) => S(f).phase === 'podium'), 8000);
    await toRoom(F);
    ok('no page errors in any frame', F.every((f) => !f.errors.length), F.map((f) => f.errors));
  }

  (async () => {
    try { await main(); } catch (e) { fail++; log('SHOPNET FAIL main threw ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); }
    for (const f of frames) { try { f.T.today(null); } catch (e) { /* ignore */ } }
    log('SHOPNET DONE pass=' + pass + ' fail=' + fail);
  })();
})();
