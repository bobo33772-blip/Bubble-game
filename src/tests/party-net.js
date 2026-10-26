// 파티 online (design/party.md §13.2): 4 same-origin iframes on PG.Net 'bc', in REAL time.
//   node tools/serve.js   (background)
//   node tools/run-chrome.js http://localhost:8765/test-party-net.html - 1200 900 rt420000 "PARTYNET DONE"
// Every frame: tro.ns('f' + i), tro.allowBc(true) (bc is practice otherwise), party.fast(true) (every game 12 s, a card
// 1.5 s, a result 40 f). host = slot 0 (꽥꽥이), A = slot 1 (까삐), B = slot 2 (펭펭), C = slot 3 (냥냥).
//   1  the room: hi carries pa: 1; a party room's R says m 'p' and o[7] = the 판 수, its o[0..6] as a battle room's; a new
//      page joining never shows 새로고침 필요 (sampled from the join on); a crafted older guest (a hi without pa) is never
//      ready - its seat says 새로고침 필요 on the host and on the other guests (R.u), its R.p ready flag is 0, 시작 is off,
//      the room line says why; switched to 배틀 it is ready again with no new 준비; mp.guestRoom reads o[7] 5 / missing /
//      junk as 5 / 3 / 3
//   2  a 3판 party (물 · 왕관 · 물, forced): the first card shows on the host and every guest, the same round lines, names
//      and boards everywhere; the phases a / c / p / r reach every page; the snapshots stay under 3400 bytes; a guest that
//      opens its menu during a card keeps it
//   3  물: each guest draws the water at its estimate of the host's NOW (within 1 px at the real 8 px/s); an out the host
//      decides is out on every screen within 0.5 s, its guest's control goes remote, its own line (탈락! 4등) shows on its
//      screen only, every guest plays 'splash' for it
//   4  왕관: a guest's claim (tp) on the holder drops the crown on every screen; the held seconds agree at the result
//   6  the final podium (order, places, points) agrees everywhere; each page's coins are coinParty of its own counters
//      (through coinGive: + the day bonus); trophies unchanged everywhere
//   8  파티 한 번 더: a new game id, a new plan, nothing paid twice;  7  a guest leaving mid-판 2: the party finishes with
//      3, the leaver gets nothing; no allowBc (q 1): a finished party pays nobody; the host's 방으로 mid-party: everyone
//      in the room, nobody paid; the host leaving mid-party: the guests in the lobby with 방장이 나갔어요, nobody paid
// Prints "PARTYNET PASS|FAIL <name>", "PARTYNET INFO ..." and "PARTYNET DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, inf) => { if (cond) { pass++; log('PARTYNET PASS ' + name); } else { fail++; log('PARTYNET FAIL ' + name + (inf !== undefined ? ' :: ' + JSON.stringify(inf) : '')); } return !!cond; };
  const info = (s) => log('PARTYNET INFO ' + s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(pred, ms, stepMs) {
    const t0 = performance.now();
    for (;;) { let v = false; try { v = pred(); } catch (e) { v = false; } if (v) return v; if (performance.now() - t0 > ms) return false; await sleep(stepMs || 20); }
  }
  try { PG.debug.G.manual = true; } catch (e) { /* ignore */ }
  document.body.style.background = '#061518';

  // ---------------------------------------------------------------- frames
  const frames = [];
  function frame(i) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'preview.html?net=bc&lat=8&jit=4&drop=0&frame=' + i;
      f.style.cssText = 'position:fixed;left:' + (i % 2) * 600 + 'px;top:' + (i >> 1) * 450 + 'px;width:600px;height:450px;border:0;background:#0a2327';
      const t = setTimeout(() => reject(new Error('frame ' + i)), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        if (!(await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.debug.party && w.PG.Net, 15000))) { reject(new Error('no PG ' + i)); return; }
        clearTimeout(t);
        const fr = { i, w, el: f, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, T: w.PG.debug.tro, P: w.PG.debug.party, SH: w.PG.debug.shop, sfx: [], errors: [] };
        w.addEventListener('error', (e) => { fr.errors.push(e.message); fail++; log('PARTYNET frame ' + i + ' error: ' + e.message + ' @' + e.lineno); });
        const A = w.PG.Audio;
        if (A && typeof A.sfx === 'function') { const o = A.sfx; A.sfx = function (n) { fr.sfx.push(n); return o.apply(A, arguments); }; }
        fr.T.ns('f' + i); fr.T.allowBc(true); fr.T.set({ t: 100 }); fr.T.away(false); fr.P.fast(true);
        frames.push(fr); resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  const N = (fr) => fr.mp.state();
  const PS = (fr) => fr.P.state();
  const doc = (fr, id) => fr.w.document.getElementById(id);
  const me = (fr) => fr.G.players.find((p) => p.slot === N(fr).mySlot);
  const hostIdOf = (fr) => fr.mp.session().peers().find((p) => p.host).id;
  const NICKS = ['방장', '까삐', '펭펭', '냥냥'], CHARS = ['duck', 'capy', 'penguin', 'cat'];
  let code = null;
  async function join(g) { await g.mp.join(code, { nick: NICKS[g.i], char: CHARS[g.i] }); return until(() => N(g).screen === 'room' && N(g).roster.length > 0, 4000); }
  async function readyAll(F) { for (const g of F.slice(1)) g.mp.ready(true); return until(() => N(F[0]).canStart, 6000); }
  // put my own animal (each page moves its own) somewhere and face it one way
  async function place(fr, x, y, face) {
    const slot = N(fr).mySlot; fr.D.setPlayer(x, y, slot);
    if (face) { fr.D.press(face, true, slot); await sleep(40); fr.D.press(face, false, slot); fr.D.setPlayer(x, y, slot); }
  }
  async function blows(fr, n) { const s = N(fr).mySlot; for (let k = 0; k < n; k++) { fr.D.press('shoot', true, s); await sleep(60); fr.D.press('shoot', false, s); await sleep(260); } }
  const phases = new Map();
  let watch = null;
  function watchPhases(F) { for (const f of F) phases.set(f.i, []); watch = setInterval(() => { for (const f of F) { const a = phases.get(f.i), m = f.G.mode; if (a[a.length - 1] !== m) a.push(m); } }, 8); }
  const coinsOf = (f) => f.SH.state().ce;
  const TOP = (row) => 16 + row * 8;

  async function main() {
    const F = [await frame(0), await frame(1), await frame(2)];
    const [H, A, B] = F;
    // ---- 1. the room and the old-page gate
    code = await H.mp.host({ mode: 'party', nick: NICKS[0], char: CHARS[0], rounds: 3, rapid: true, perks: true });
    ok('room: a party room is hosted (mode party, 3판)', !!code && N(H).mode === 'party' && N(H).party.rounds === 3, N(H).party);
    for (const g of [A, B]) await join(g);
    await until(() => N(H).roster.length === 3 && N(H).party.seats.every((s) => s.slot === 0 || s.hi), 4000);
    ok('hi: every new page says pa: 1 (the host records hi and pa)', N(H).party.seats.filter((s) => s.slot).every((s) => s.hi && s.pa === 1), N(H).party.seats);
    const R0 = N(H).tro.R;
    ok('R: m \'p\', o[7] = 3 (the 판 수), the seats\' ready flags', R0 && R0.m === 'p' && R0.o.length === 8 && R0.o[7] === 3, R0);
    ok('guests read the party room (mode party, 3판)', [A, B].every((g) => N(g).mode === 'party' && N(g).opts.rounds === 3 && N(g).party.u.length === 0), [A, B].map((g) => N(g).party));
    // a 4th page joining: its seat never says 새로고침 필요 on the host, sampled from the join on (before its hi lands too)
    const Cp = frame(3);
    const C = await Cp; F.push(C);
    let flicker = false; const sampler = setInterval(() => { try { if (N(H).party.seats.some((s) => s.slot === 3 && s.old)) flicker = true; } catch (e) { /* ignore */ } }, 2);
    await join(C);
    await until(() => N(H).roster.length === 4 && N(H).party.seats.find((s) => s.slot === 3 && s.hi), 4000);
    await sleep(300); clearInterval(sampler);
    ok('a new page joining never shows 새로고침 필요 (the r.hi gate: not before its hi, not after)', !flicker && N(H).party.seats.find((s) => s.slot === 3).pa === 1, N(H).party.seats);
    // a crafted older guest: C says hi again without pa (an older page's hi)
    C.mp.ready(true); await until(() => N(H).party.seats.find((s) => s.slot === 3).ready, 3000);
    C.mp.session().send(hostIdOf(C), { t: 'hi', n: NICKS[3], c: CHARS[3], cu: 100, d: N(H).roster[3].d || 'abcdef', z: 1 });
    await until(() => N(H).party.seats.find((s) => s.slot === 3).old, 3000);
    A.mp.ready(true); B.mp.ready(true);
    await until(() => N(B).party.u.includes(3) && N(H).tro.R.p.find((e) => e[0] === 1)[3] === 1, 3000);
    const tagOf = (f, k) => { const li = doc(f, 'pg-room-players').children[k]; const t = li && li.querySelector('.pg-pc-tag'); return t ? t.textContent : ''; };
    const R1 = N(H).tro.R;
    ok('old page: its seat says 새로고침 필요 on the host, R.u = [3], its R.p ready flag 0, 시작 off', tagOf(H, 3) === '새로고침 필요' && JSON.stringify(R1.u) === '[3]' && R1.p.find((e) => e[0] === 3)[3] === 0 && !N(H).canStart && doc(H, 'pg-go').disabled,
      [tagOf(H, 3), R1.u, R1.p, N(H).canStart]);
    ok('old page: ... the other guests see the tag and the room line (R.u)', [A, B].every((g) => tagOf(g, 3) === '새로고침 필요' && doc(g, 'pg-room-msg').textContent === '새로고침이 필요한 친구가 있어요 · 파티는 새 버전에서만 해요'), [A, B].map((g) => [tagOf(g, 3), doc(g, 'pg-room-msg').textContent]));
    ok('old page: ... and the host\'s room line says why', doc(H, 'pg-room-msg').textContent === '새로고침이 필요한 친구가 있어요 · 파티는 새 버전에서만 해요', doc(H, 'pg-room-msg').textContent);
    const rdBefore = N(H).roster[3].ready;
    H.mp.setOpts({ mode: 'battle' });
    await until(() => N(H).canStart && N(B).mode === 'battle', 3000);
    ok('old page: switched to 배틀 it is ready again with no new 준비 (its own ready flag was kept)', N(H).canStart && N(H).party.seats.find((s) => s.slot === 3).ready && tagOf(H, 3) === '준비 완료', [N(H).canStart, rdBefore, tagOf(H, 3)]);
    const Rb = N(H).tro.R;
    ok('R: a party room\'s o[0..6] are the battle room\'s exactly (an older page reads them as it always did)', JSON.stringify(Rb.o.slice(0, 7)) === JSON.stringify(R1.o.slice(0, 7)) && Rb.m === 'b' && !Rb.u, [Rb.o, R1.o]);
    const rd = (o7) => A.mp.guestRoom({ gid: 0, ph: 'room', m: 'p', o: [-1, 3, 1, 1, 0, 1, 0].concat(o7 === undefined ? [] : [o7]), p: N(A).roster.map((r) => [r.slot, r.nick, r.char, 0]) });
    const g5 = rd(5), gm = rd(undefined), gj = rd('x');
    ok('mp.guestRoom: R.m \'p\' reads as party; o[7] 5 / missing / junk -> 5 / 3 / 3', g5.mode === 'party' && g5.rounds === 5 && gm.rounds === 3 && gj.rounds === 3, [g5, gm, gj]);
    // C refreshed (a hi with pa again); back to party
    C.mp.session().send(hostIdOf(C), { t: 'hi', n: NICKS[3], c: CHARS[3], cu: 100, d: N(H).roster[3].d || 'abcdef', z: 1, pa: 1 });
    H.mp.setOpts({ mode: 'party' });
    await until(() => N(H).canStart && N(H).mode === 'party' && F.every((f) => N(f).mode === 'party'), 4000);
    ok('room: every seat ready in the party room again', N(H).canStart, N(H).party.seats);

    // ---- 2. a 3판 party: the first card everywhere, the same cards, phases, the snapshot budget
    H.P.force(['water', 'crown', 'water']);
    watchPhases(F);
    const ce0 = F.map(coinsOf);
    H.mp.start();
    const card1 = await until(() => F.every((f) => PS(f).ph === 'card' && f.P.card().shown), 4000);
    ok('first card: shown on the host and on every guest (netAgain / guestBegin)', card1, F.map((f) => [PS(f).ph, f.P.card().shown]));
    const cardsOf = () => F.map((f) => { const c = f.P.card(); return [c.round, c.name, c.board.map((r) => r.place + r.nick + r.pts).join(',')]; });
    ok('first card: the same round line, game and board everywhere (1판 / 3판, 물 차오르기)', cardsOf().every((c) => JSON.stringify(c) === JSON.stringify(cardsOf()[0])) && cardsOf()[0][0] === '1판 / 3판' && cardsOf()[0][1] === '물 차오르기', cardsOf());
    ok('first card: my row has the 나 chip on each page', F.every((f) => { const b = f.P.card().board; return b.filter((r) => r.me).length === 1 && b.find((r) => r.me).nick === NICKS[f.i]; }), F.map((f) => f.P.card().board));
    // a guest opens its menu during the card: it stays open over the card (and through the 3-2-1)
    B.D.pause();
    await sleep(150);
    ok('menu: a guest that opens its menu during a card keeps it (not replaced by the card)', N(B).overlay === 'pause' && PS(B).ph === 'card', [N(B).overlay, PS(B).ph]);
    B.D.resume();
    ok('menu: ... closed during the card, the card is back', N(B).overlay === 'party' || PS(B).ph !== 'card', N(B).overlay);
    await until(() => F.every((f) => PS(f).ph === 'playing'), 6000);
    // ---- 3. 물: places for everyone (A on row 13: dry until the 4th step), 3 blows each (into the walls), the water
    // clock, an out the host calls
    await Promise.all([place(H, 60, TOP(5) - 16, 'left'), place(A, 60, TOP(13) - 16, 'left'), place(B, 172, TOP(5) - 16, 'right'), place(C, 204, TOP(9) - 16, 'right')]);
    await sleep(150);
    await Promise.all(F.map((f) => blows(f, 3)));
    // the drawn water against the host's clock: sampled in one turn (the host's frame vs each guest's estimate of it)
    const diffs = [];
    for (let k = 0; k < 12; k++) {
      const ht = PS(H).mini.t;
      for (const g of [A, B, C]) { const m = PS(g).mini; if (m && m.tt !== null) diffs.push(m.tt - ht); }
      await sleep(70);
    }
    const worst = Math.max(...diffs.map((d) => Math.abs(d)));
    info('water clock: guest estimate - host frame (ticks): ' + diffs.join(' ') + ' -> at the real 8 px/s that is ' + (worst * 8 / 60).toFixed(2) + ' px');
    ok('water: every guest draws the water at the host\'s clock (within 1 px at the real 8 px/s: <= 7 ticks)', diffs.length >= 30 && worst <= 7, diffs);
    ok('water: ... and its drawn level is the schedule at that frame', [A, B, C].every((g) => { const m = PS(g).mini; return m && Math.abs(m.wl - g.P.waterAt(m.tt, 0.16)) < 0.01; }));
    const sp0 = F.map((f) => f.sfx.filter((n) => n === 'splash').length);
    const t0 = performance.now();
    ok('water: (setup) A is still dry on row 13', !me(A).out && !H.G.players.find((p) => p.slot === 1).out);
    H.P.level(110);
    const outAll = await until(() => F.every((f) => f.G.players.find((p) => p.slot === 1).out), 500, 10);
    const dt = performance.now() - t0;
    H.P.level(null);
    ok('water: the host calls A out (row 13 under a surface at 110) -> out on every screen within 0.5 s', outAll && dt <= 500, [dt, F.map((f) => f.G.players.find((p) => p.slot === 1).out)]);
    await sleep(120);
    ok('water: A\'s control went remote (the host has its animal), A is not drawn', N(A).ctl === 'remote' && me(A).out, [N(A).ctl, me(A).out]);
    const bnr = (f) => (doc(f, 'pg-banner') && !doc(f, 'pg-banner').hidden ? doc(f, 'pg-banner-main').textContent + ' / ' + doc(f, 'pg-banner-sub').textContent : '');
    ok('water: A\'s own line says its place on its screen only (탈락! 4등 / 친구들을 구경해요)', /^탈락! 4등 \/ 친구들을 구경해요$/.test(bnr(A)) && [H, B, C].every((f) => bnr(f).indexOf('탈락! 4등') < 0), F.map(bnr));
    ok('water: every guest played \'splash\' for it (NO_ECHO: their own)', [A, B, C].every((g, k) => g.sfx.filter((n) => n === 'splash').length > sp0[k + 1]), F.map((f, k) => f.sfx.filter((n) => n === 'splash').length - sp0[k]));
    await until(() => F.every((f) => PS(f).ph === 'result'), 15000);
    const res1 = F.map((f) => JSON.stringify([PS(f).pts, PS(f).last]));
    ok('result: 물 points and places agree on every page', res1.every((r) => r === res1[0]) && PS(H).last[1] === 4, res1);
    // ---- 4. 왕관: a guest's claim on the holder drops the crown everywhere
    await until(() => F.every((f) => PS(f).ph === 'card'), 4000);
    ok('2nd card: 2판 / 3판 · 왕관 뺏기 on every page, with each board\'s +N', F.every((f) => f.P.card().round === '2판 / 3판' && f.P.card().name === '왕관 뺏기' && f.P.card().board.every((r) => /^\+\d$/.test(r.gain))), F.map((f) => f.P.card()));
    await until(() => F.every((f) => PS(f).ph === 'playing'), 6000);
    await Promise.all([place(A, 40, 200, 'right'), place(B, 80, 200, 'right')]);
    await sleep(200);
    H.P.crown(2);
    await until(() => F.every((f) => PS(f).mini && PS(f).mini.cr && PS(f).mini.cr.holder === 2), 2000);
    await blows(B, 1);                           // (B's blow ends its own blink, away from A)
    await sleep(250);
    await place(A, 40, 200, 'right'); await place(B, 80, 200);
    await sleep(120);
    const sent0 = N(A).claims.sent;
    A.D.press('shoot', true, 1); await sleep(60); A.D.press('shoot', false, 1);
    const dropped = await until(() => F.every((f) => PS(f).mini.cr.holder === -1), 2500);
    ok('왕관: A\'s claim (tp) on the holder B drops the crown on every screen', dropped && N(A).claims.sent > sent0, [F.map((f) => PS(f).mini.cr.holder), N(A).claims]);
    await until(() => F.every((f) => PS(f).ph === 'result'), 15000);
    await sleep(100);
    const held = F.map((f) => JSON.stringify(PS(f).mini.held));
    ok('왕관: the held times agree on every page at the result', held.every((h) => h === held[0]) && (PS(H).mini.held[2] | 0) > 0, held);
    // ---- the last 판 and the podium
    await until(() => F.every((f) => PS(f).ph === 'playing'), 8000);
    await Promise.all([place(H, 60, TOP(5) - 16, 'left'), place(A, 28, 200, 'left'), place(B, 172, TOP(5) - 16, 'right'), place(C, 204, TOP(9) - 16, 'right')]);
    await sleep(150);
    await Promise.all(F.map((f) => blows(f, 3)));
    const pod = await until(() => F.every((f) => PS(f).ph === 'podium'), 20000);
    clearInterval(watch);
    ok('phases: card, countdown, playing and result reached every page, then the podium', pod && F.every((f) => ['card', 'countdown', 'playing', 'result', 'podium'].every((m) => phases.get(f.i).includes(m))), F.map((f) => phases.get(f.i).join('>')));
    ok('snapshots: under 3400 bytes all party long', N(H).snap.max > 0 && N(H).snap.max <= 3400, N(H).snap);
    await sleep(300);
    const pds = F.map((f) => JSON.stringify([PS(f).podium, PS(f).pts]));
    ok('podium: order, places and points agree on every page', pds.every((p) => p === pds[0]), pds);
    ok('podium: 파티 결과! with its 3판 tag on every page; the host\'s button says 파티 한 번 더', F.every((f) => doc(f, 'pg-podium-h').textContent === '파티 결과!' && doc(f, 'pg-podium-tag').textContent === '3판') && doc(H, 'pg-podium-again').textContent === '파티 한 번 더');
    // ---- 6. the coins: each page's own counters through coinParty (+ the day bonus of a fresh store)
    const want = (f) => {
      const s = PS(f), c = s.coins, k = s.podium.order.indexOf(N(f).mySlot), place = s.podium.pl[k], tie = s.podium.pl.filter((q) => q === place).length;
      const done = f === H ? !s.walk : !s.walk && c.act.length === s.n && c.seen === s.n - 1;
      return f.P.coin(s.podium.order.length, done, c.act, c.shots, 1e9, place, tie);
    };
    const pays = F.map((f) => ({ pod: PS(f).pod, want: want(f), got: coinsOf(f) - ce0[f.i], coins: PS(f).coins }));
    info('coins: ' + JSON.stringify(pays));
    ok('coins: every page paid itself coinParty of its own counters (+ the day bonus), through coinGive', pays.every((p) => p.want > 0 && p.pod && p.pod.give - p.pod.bonus === p.want && p.got === p.pod.give && p.coins.shots >= 5), pays);
    ok('trophies: unchanged everywhere (a party holds and pays none)', F.every((f) => f.T.state().t === 100 && f.T.state().g === 0 && f.T.state().esc.length === 0), F.map((f) => f.T.state().t));

    // ---- 8. 파티 한 번 더 + 7. a guest leaving mid-판 2
    H.P.force(null);
    const gid1 = N(H).gid, ce1 = F.map(coinsOf), pod1 = F.map((f) => PS(f).pod);
    H.mp.again();
    await until(() => F.every((f) => PS(f).ph === 'card' && N(f).gid === gid1 + 1), 4000);
    const plan2 = PS(H).plan;
    ok('파티 한 번 더: a new game id and a new party (3판, never the same game twice in a row) on every page', F.every((f) => N(f).gid === gid1 + 1 && PS(f).i === 0) && plan2.length === 3 && plan2[0] !== plan2[1] && plan2[1] !== plan2[2], [F.map((f) => N(f).gid), plan2]);
    await until(() => PS(H).ph === 'playing', 6000);
    await Promise.all(F.map((f) => blows(f, 2)));
    await until(() => PS(H).ph === 'playing' && PS(H).i === 1, 25000);
    const ceC = coinsOf(C);
    C.mp.leave();
    await until(() => N(H).roster.length === 3 && H.G.players.length === 3, 4000);
    ok('leaver: a guest leaving mid-판 2 - the party goes on with 3', PS(H).on && PS(H).i === 1 && H.G.players.length === 3 && !PS(H).walk, PS(H));
    const D3 = [H, A, B];
    const pod2 = await until(() => D3.every((f) => PS(f).ph === 'podium'), 45000);
    await sleep(300);
    ok('leaver: the party finishes (podium of 3 on the 3 pages left)', pod2 && D3.every((f) => PS(f).podium.order.length === 3), D3.map((f) => PS(f).ph));
    ok('leaver: the one who left got nothing', coinsOf(C) === ceC, [ceC, coinsOf(C)]);
    ok('파티 한 번 더: nothing paid twice - each page gained exactly its new podium\'s coins (the first party\'s once)', D3.every((f) => coinsOf(f) - ce1[f.i] === (PS(f).pod ? PS(f).pod.give : 0) && pod1[f.i].give > 0 && PS(f).pod.gid !== pod1[f.i].gid), D3.map((f) => [coinsOf(f) - ce1[f.i], PS(f).pod, pod1[f.i]]));

    // ---- no allowBc (q 1): a finished party pays nobody
    H.mp.toRoom(); await until(() => D3.every((f) => N(f).screen === 'room'), 6000);
    for (const f of D3) f.T.allowBc(false);
    H.P.force(['crown']);
    await readyAll(D3);
    const ce3 = D3.map(coinsOf);
    H.mp.start();
    const pod3 = await until(() => D3.every((f) => PS(f).ph === 'podium'), 30000);
    await sleep(300);
    ok('practice (q 1, this browser\'s tabs): the party reaches the podium and pays nobody (연습 경기)', pod3 && D3.every((f, k) => coinsOf(f) === ce3[k] && PS(f).pod && PS(f).pod.prac && !PS(f).pod.give), D3.map((f) => PS(f).pod));
    for (const f of D3) f.T.allowBc(true);

    // ---- the host's 방으로 mid-party: everyone in the room, nobody paid
    H.mp.toRoom(); await until(() => D3.every((f) => N(f).screen === 'room'), 6000);
    H.P.force(['water', 'crown', 'water']);
    await readyAll(D3);
    const ce4 = D3.map(coinsOf);
    H.mp.start();
    await until(() => PS(H).ph === 'playing', 8000);
    await Promise.all(D3.map((f) => blows(f, 3)));
    H.mp.toRoom();
    const back = await until(() => D3.every((f) => N(f).screen === 'room' && f.G.mode === 'title'), 6000);
    await sleep(300);
    ok('방으로 mid-party: everyone back in the room, nobody paid', back && D3.every((f, k) => coinsOf(f) === ce4[k]), D3.map((f) => [N(f).screen, coinsOf(f)]));

    // ---- the host leaving mid-party: the guests in the lobby with 방장이 나갔어요, nobody paid
    await readyAll(D3);
    const ce5 = D3.map(coinsOf);
    H.mp.start();
    await until(() => PS(H).ph === 'playing', 8000);
    H.mp.leave();
    const lob = await until(() => [A, B].every((g) => N(g).screen === 'friends' && /방장이 나갔어요/.test(N(g).error)), 8000);
    await sleep(200);
    ok('host left mid-party: the guests are in the lobby with 방장이 나갔어요, nobody paid', lob && [A, B].every((g, k) => coinsOf(g) === ce5[k + 1]), [A, B].map((g) => [N(g).screen, N(g).error]));
    ok('no page error in any frame', F.every((f) => !f.errors.length), F.map((f) => f.errors));
  }
  main().catch((e) => { fail++; log('PARTYNET FAIL main threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); }).then(() => log('PARTYNET DONE pass=' + pass + ' fail=' + fail));
})();
