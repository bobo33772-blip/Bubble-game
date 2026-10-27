// 파티 online (design/party.md §13.2): 4 same-origin iframes on PG.Net 'bc', in REAL time.
//   node tools/serve.js   (background)
//   node tools/run-chrome.js http://localhost:8765/test-party-net.html - 1200 900 rt420000 "PARTYNET DONE"
// Every frame: tro.ns('f' + i), tro.allowBc(true) (bc is practice otherwise), party.fast(true) (every game 12 s, a card
// 1.5 s, a result 40 f). host = slot 0 (꽥꽥이), A = slot 1 (까삐), B = slot 2 (펭펭), C = slot 3 (냥냥).
//   1  the room: hi carries pa: 2 (PARTY_V); a party room's R says m 'p' and o[7] = the 판 수, its o[0..6] as a battle
//      room's; a new page joining never shows 새로고침 필요 (sampled from the join on); a crafted older guest (PR A's hi,
//      pa 1) is never
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
//   5  거품 축구 (forced, 2v2): the card on every page with the same teams (by the standing) and each page's own side line;
//      each page's kickoff call over its own animal only; a guest's body and a guest's bubble move the ball on the host
//      (every guest hears 'bounce' off kn - NO_ECHO); a goal counted once and shown on every page (골! / 오른쪽 팀 0 : 1,
//      the clock stopped); the ball drawn on each guest in step with the host's path; the team places agree
//   6  the final podium (order, places, points) agrees everywhere; each page's coins are coinParty of its own counters
//      (through coinGive: + the day bonus); trophies unchanged everywhere
//   8  파티 한 번 더: a new game id, a new plan, nothing paid twice;  7  a guest leaving during the 2nd card, a 거품 축구
//      (4 -> 3): that 판 is drawn again on every page (no 축구 for 3), the party finishes with 3, the leaver gets nothing; no allowBc (q 1): a finished party pays nobody; the host's 방으로 mid-party: everyone
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
  const notePhases = (F) => { for (const f of F) { const a = phases.get(f.i), m = f.G.mode; if (a[a.length - 1] !== m) a.push(m); } };
  function watchPhases(F) { for (const f of F) phases.set(f.i, []); watch = setInterval(() => notePhases(F), 8); }
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
    const PV = H.P.consts().PARTY_V;
    ok('hi: every new page says pa: ' + PV + ' (2: 물, 왕관 and 거품 축구; the host records hi and pa)', PV === 2 && N(H).party.seats.filter((s) => s.slot).every((s) => s.hi && s.pa === PV), N(H).party.seats);
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
    ok('a new page joining never shows 새로고침 필요 (the r.hi gate: not before its hi, not after)', !flicker && N(H).party.seats.find((s) => s.slot === 3).pa === PV, N(H).party.seats);
    // a crafted older guest: C says hi again with pa 1 (PR A's page: 물 and 왕관 only - it would read a 축구 판 as 물; a
    // page older still sends no pa: the same gate)
    C.mp.ready(true); await until(() => N(H).party.seats.find((s) => s.slot === 3).ready, 3000);
    C.mp.session().send(hostIdOf(C), { t: 'hi', n: NICKS[3], c: CHARS[3], cu: 100, d: N(H).roster[3].d || 'abcdef', z: 1, pa: 1 });
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
    C.mp.session().send(hostIdOf(C), { t: 'hi', n: NICKS[3], c: CHARS[3], cu: 100, d: N(H).roster[3].d || 'abcdef', z: 1, pa: PV });
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
    notePhases(F); clearInterval(watch); // (one last look: the podium may have come between two samples)
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

    // ---- 5. 거품 축구, 2v2 (forced): the teams, the kickoff calls, a guest's body / bubble on the host's ball, a goal,
    // the ball in step on the guests, the team places
    H.mp.toRoom(); await until(() => F.every((f) => N(f).screen === 'room'), 6000);
    H.P.force(['ball']);
    await readyAll(F);
    H.mp.start();
    const bcard = await until(() => F.every((f) => PS(f).ph === 'card' && f.P.card().shown && f.P.card().team && PS(f).mini && PS(f).mini.team), 5000);
    const tm = PS(H).mini.team;
    ok('축구 card: on every page with the same teams - the first 판 of a party, before any points: slots 0 + 3 left, 1 + 2 right', bcard && F.every((f) => JSON.stringify(PS(f).mini.team) === JSON.stringify(tm))
      && JSON.stringify(tm) === '{"0":0,"1":1,"2":1,"3":0}', [tm, F.map((f) => PS(f).mini && PS(f).mini.team)]);
    ok('축구 card: each page shows the side its own player scores on (나는 왼쪽 팀 · 오른쪽 골대에 넣어요! / 나는 오른쪽 팀 · ...)', F.every((f) => f.P.card().mine === (tm[N(f).mySlot] ? '나는 오른쪽 팀 · 왼쪽 골대에 넣어요!' : '나는 왼쪽 팀 · 오른쪽 골대에 넣어요!')), F.map((f) => f.P.card().mine));
    const isCall = (w) => w.txt === '오른쪽으로!' || w.txt === '왼쪽으로!';
    await until(() => F.every((f) => PS(f).ph === 'playing'), 6000);
    const called = await until(() => F.every((f) => f.G.words.some(isCall)), 2500);
    ok('축구 kickoff: each page calls its own side over its own animal only (no host call on the guests)', called && F.every((f) => { const ws = f.G.words.filter(isCall), m = me(f); return ws.length === 1 && Math.abs(ws[0].x - Math.max(24, Math.min(232, m.x + 8))) < 4 && ws[0].txt === (tm[m.slot] ? '왼쪽으로!' : '오른쪽으로!'); }),
      F.map((f) => [f.G.words.filter(isCall).map((w) => [w.txt, Math.round(w.x)]), Math.round(me(f).x + 8)]));
    // 5 blows each against a wall, where no bubble touches a rival (the coins' activity gates), then everyone on a crossbar
    // (out of the ball's way: over a ball on the floor)
    const WALLS = [[16, TOP(20) - 16, 'left'], [60, 200, 'left'], [208, TOP(20) - 16, 'right'], [190, 200, 'right']];
    await Promise.all(F.map((f, k) => place(f, WALLS[k][0], WALLS[k][1], WALLS[k][2])));
    await Promise.all(F.map((f) => blows(f, 5)));
    const BAR = [[16, 'left'], [32, 'left'], [208, 'right'], [224, 'right']];
    await Promise.all([place(A, BAR[1][0], TOP(20) - 16, 'left'), place(C, BAR[3][0], TOP(20) - 16, 'right')]);
    ok('축구: (setup) nobody in a prison', await until(() => F.every((f) => f.G.players.every((p) => !p.trap)), 2500), F.map((f) => f.G.players.filter((p) => p.trap).map((p) => p.slot)));
    await until(() => PS(H).mini.ball.kick === 0 && PS(H).mini.goalT === 0, 4000);
    // a guest's body: A walks into the ball (the host pushes it with A's reported body)
    H.P.ball(128, 205, 0, 0);
    const kn0 = PS(H).mini.kn, bo0 = F.map((f) => f.sfx.filter((n) => n === 'bounce').length);
    await place(A, 84, 200);
    await sleep(150);
    A.D.press('right', true, N(A).mySlot);
    const pushed = await until(() => H.G.mini.ball.vx > 0.8, 2500, 5);
    A.D.press('right', false, N(A).mySlot);
    H.P.ball(128, 205, 0, 0);   // (stopped: rolled on it would reach the right goal)
    ok('축구: a guest\'s body (A walking into it) moves the ball on the host', pushed && PS(H).mini.kn > kn0, [PS(H).mini.ball, PS(H).mini.kn, kn0]);
    await sleep(400);
    ok('축구: ... every guest hears \'bounce\' off kn (the host\'s push sound is not echoed)', [A, B, C].every((g) => g.sfx.filter((n) => n === 'bounce').length > bo0[g.i]), F.map((f) => f.sfx.filter((n) => n === 'bounce').length - bo0[f.i]));
    await place(A, BAR[1][0], TOP(20) - 16, 'left');
    // a guest's bubble: B blows at the ball from its left
    await place(B, 70, 200, 'right');
    await sleep(200);
    H.P.ball(128, 205, 0, 0);
    const kn1 = PS(H).mini.kn;
    B.D.press('shoot', true, N(B).mySlot); await sleep(60); B.D.press('shoot', false, N(B).mySlot);
    const shotMoved = await until(() => H.G.mini.ball.vx > 1, 2000, 5);
    H.P.ball(128, 205, 0, 0);
    ok('축구: a guest\'s bubble (B blowing at it) pops on the ball and pushes it along its flight on the host', shotMoved && PS(H).mini.kn > kn1, [PS(H).mini.ball, PS(H).mini.kn, kn1]);
    await place(B, BAR[2][0], TOP(20) - 16, 'right');
    await sleep(200);
    // the ball in step: each guest's drawn ball lies on the host's path (a view delay behind)
    const hs = [], gs = { 1: [], 2: [], 3: [] };
    info('clock before the ball-in-step check: ' + PS(H).left + ' frames left');
    H.P.ball(50, 205, 3, 0);    // (rolling across the floor, under the keepers on the crossbars)
    const smp = setInterval(() => {
      const t = performance.now(), hm = H.G.mini;
      if (hm && hm.ball && hm.ball.kick === 0 && hm.goalT === 0) hs.push([t, hm.ball.x, hm.ball.y]);
      for (const g of [A, B, C]) { const m = g.G.mini; if (m && m.ball && m.ball.kick === 0 && !(m.goalT > 0)) gs[g.i].push([t, m.ball.x, m.ball.y]); }
    }, 6);
    await sleep(1600);
    clearInterval(smp);
    const fit = (q) => { let best = 1e9, lag = 0; for (const h of hs) { if (h[0] > q[0] || h[0] < q[0] - 900) continue; const d = Math.hypot(h[1] - q[1], h[2] - q[2]); if (d < best) { best = d; lag = q[0] - h[0]; } } return [best, lag]; };
    const stat = [A, B, C].map((g) => {
      const fs1 = gs[g.i].filter((q) => q[0] > hs[0][0] + 900).map(fit), ds = fs1.map((v) => v[0]).sort((a, b) => a - b), lags = fs1.map((v) => v[1]).sort((a, b) => a - b);
      return { n: ds.length, med: ds[ds.length >> 1], p90: ds[Math.floor(ds.length * 0.9)], lag: Math.round(lags[lags.length >> 1]) };
    });
    info('ball in step (guest drawn ball vs the host\'s path, px; lag ms): ' + JSON.stringify(stat));
    ok('축구: the ball on each guest follows the host\'s path (median <= 1 px, 90% <= 3 px, a view delay behind)', hs.length > 100 && stat.every((q) => q.n > 50 && q.med <= 1 && q.p90 <= 3 && q.lag >= 0 && q.lag < 700), stat);
    H.P.ball(128, 205, 0, 0);
    // a goal: shown on every page, counted once, the clock stopped
    H.P.ball(40, 205, -2.5, 0);
    const gl = await until(() => F.every((f) => PS(f).mini && PS(f).mini.goals && PS(f).mini.goals[1] === 1), 2500);
    const bnr5 = (f) => (doc(f, 'pg-banner') && !doc(f, 'pg-banner').hidden ? doc(f, 'pg-banner-main').textContent + ' / ' + doc(f, 'pg-banner-sub').textContent : '');
    const gb = await until(() => F.every((f) => bnr5(f) === '골! / 오른쪽 팀 0 : 1'), 1500);
    ok('축구 goal: into the left goal -> 0 : 1 on every page, 골! / 오른쪽 팀 0 : 1 everywhere', gl && gb, F.map((f) => [PS(f).mini.goals, bnr5(f)]));
    const tl0 = PS(H).left;
    await sleep(800);
    ok('축구 goal: the clock stands still while 골! shows (the host\'s, and each guest\'s view of it)', PS(H).left === tl0 && PS(H).mini.goalT > 0 && [A, B, C].every((g) => Math.abs(PS(g).left - tl0) <= 3), [tl0, F.map((f) => PS(f).left)]);
    await until(() => PS(H).mini.goalT === 0 && PS(H).mini.ball.kick === 0, 4000);
    await sleep(300);
    ok('축구 goal: counted once on every page', F.every((f) => JSON.stringify(PS(f).mini.goals) === '[0,1]'), F.map((f) => PS(f).mini.goals));
    const bres = await until(() => F.every((f) => PS(f).ph === 'result'), 15000);
    await sleep(150);
    const rp = F.map((f) => JSON.stringify([PS(f).pts, PS(f).last])), right = [0, 1, 2, 3].filter((q) => tm[q] === 1), left = [0, 1, 2, 3].filter((q) => tm[q] === 0);
    const pr = PS(H);
    ok('축구 result: the team places and points agree on every page - the right team shares 1st, the left team the next place (+4 + 4 / +1 + 1)', bres && rp.every((r) => r === rp[0]) && right.every((q) => pr.gain[q] === 4 && pr.last[q] === 1) && left.every((q) => pr.gain[q] === 1 && pr.last[q] === 3), [rp, pr.gain]);
    ok('축구 result: 오른쪽 팀 승리! on every page', F.every((f) => /^오른쪽 팀 승리!/.test(bnr5(f))), F.map(bnr5));
    await until(() => F.every((f) => PS(f).ph === 'podium'), 8000);
    await sleep(300);

    // ---- 8. 파티 한 번 더 + 7. a guest leaving during the 축구 card (4 -> 3)
    H.P.force(['water', 'ball', 'crown']);
    const gid1 = N(H).gid, ce1 = F.map(coinsOf), pod1 = F.map((f) => PS(f).pod);
    H.mp.again();
    await until(() => F.every((f) => PS(f).ph === 'card' && N(f).gid === gid1 + 1), 4000);
    const plan2 = PS(H).plan;
    ok('파티 한 번 더: a new game id and a new party (3판, never the same game twice in a row) on every page', F.every((f) => N(f).gid === gid1 + 1 && PS(f).i === 0) && plan2.length === 3 && plan2[0] !== plan2[1] && plan2[1] !== plan2[2], [F.map((f) => N(f).gid), plan2]);
    await until(() => PS(H).ph === 'playing', 6000);
    await Promise.all(F.map((f) => blows(f, 2)));
    const card2 = await until(() => F.every((f) => PS(f).ph === 'card' && PS(f).i === 1 && f.P.card().name === '거품 축구'), 25000);
    ok('leaver: (setup) the 2nd card is 거품 축구 on every page', card2, F.map((f) => [PS(f).ph, PS(f).i, f.P.card().name]));
    const ceC = coinsOf(C);
    C.mp.leave();
    await until(() => N(H).roster.length === 3 && H.G.players.length === 3, 4000);
    const D3 = [H, A, B];
    const redrawn = await until(() => D3.every((f) => PS(f).ph === 'card' && f.P.card().shown && f.P.card().name === '왕관 뺏기' && !f.P.card().team && f.P.card().round === '2판 / 3판'), 4000);
    ok('leaver: a guest leaving during the 축구 card (4 -> 3) - that 판 is drawn again on every page (왕관 뺏기, no team line), the party goes on with 3',
      redrawn && PS(H).on && PS(H).i === 1 && PS(H).plan[1] === 'crown' && !PS(H).plan.includes('ball') && H.G.players.length === 3 && !PS(H).walk, [PS(H).plan, D3.map((f) => f.P.card())]);
    // (the leaver's page keeps no party: its lobby's demo world runs its rounds, no water / crown drawn behind the panel)
    ok('leaver: its own page has no party left (G.party / G.mini cleared, the arena list back to the battle one)', !PS(C).on && PS(C).mini === null && PS(C).kind === 'b', [PS(C).on, PS(C).mini, PS(C).kind]);
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
    ok('practice: the podium screen-reader line says no coins, and nothing about trophies (a party has none)', D3.every((f) => /연습 경기라 비누 코인은 없어요/.test(doc(f, 'pg-podium-sum').textContent) && !/트로피/.test(doc(f, 'pg-podium-sum').textContent) && doc(f, 'pg-podium-note').textContent.indexOf('트로피') < 0),
      D3.map((f) => doc(f, 'pg-podium-sum').textContent));
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
    ok('방으로 mid-party: no page keeps the party (G.party / G.mini cleared behind the room panel)', D3.every((f) => !PS(f).on && PS(f).mini === null), D3.map((f) => [PS(f).on, PS(f).mini && PS(f).mini.id]));

    // ---- the host leaving mid-party: the guests in the lobby with 방장이 나갔어요, nobody paid
    await readyAll(D3);
    const ce5 = D3.map(coinsOf);
    H.mp.start();
    await until(() => PS(H).ph === 'playing', 8000);
    H.mp.leave();
    const lob = await until(() => [A, B].every((g) => N(g).screen === 'friends' && /방장이 나갔어요/.test(N(g).error)), 8000);
    await sleep(200);
    ok('host left mid-party: the guests are in the lobby with 방장이 나갔어요, nobody paid', lob && [A, B].every((g, k) => coinsOf(g) === ce5[k + 1]), [A, B].map((g) => [N(g).screen, N(g).error]));
    ok('host left mid-party: no page keeps the party (the host\'s own, the guests\' mirrors)', D3.every((f) => !PS(f).on && PS(f).mini === null), D3.map((f) => [PS(f).on, PS(f).mini && PS(f).mini.id]));
    ok('no page error in any frame', F.every((f) => !f.errors.length), F.map((f) => f.errors));
  }
  main().catch((e) => { fail++; log('PARTYNET FAIL main threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); }).then(() => log('PARTYNET DONE pass=' + pass + ' fail=' + fail));
})();
