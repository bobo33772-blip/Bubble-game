// 파티 online (design/party.md §13.2, design/party-polish.md §10.3): 4 same-origin iframes on PG.Net 'bc', in REAL time.
//   node tools/serve.js   (background)
//   node tools/run-chrome.js http://localhost:8765/test-party-net.html - 1200 900 rt420000 "PARTYNET DONE"
//   the new games on a slow link (design/party-games.md §13.2, frame 3 at lat 100 / jit 40 - lagRun below):
//   node tools/run-chrome.js http://localhost:8765/test-party-net.html#lag - 1200 900 rt300000 "PARTYNET DONE"
// Every frame: tro.ns('f' + i), tro.allowBc(true) (bc is practice otherwise), party.fast(true) (every game 12 s, the card
// and the result beats PARTY_FF). host = slot 0 (꽥꽥이), A = slot 1 (까삐), B = slot 2 (펭펭), C = slot 3 (냥냥).
//   1  the room: hi carries pa: PARTY_V (5: the new games); a party room's R says m 'p' and o[7] = the 판 수, its o[0..6]
//      as a battle room's; a new page joining never shows 새로고침 필요 (sampled from the join on); a crafted older guest
//      (a page before the new games, pa PARTY_V - 1) is never ready - its seat says 새로고침 필요 on the host and on the other guests (R.u), its R.p ready flag is
//      0, 시작 is off, the room line says why; switched to 배틀 it is ready again with no new 준비; mp.guestRoom reads o[7]
//      5 / missing / junk as 5 / 3 / 3
//   2  a 3판 party (물 · 왕관 · 물, forced): the first card shows on the host and every guest, the same round lines, names
//      and ready rows everywhere (my chip outlined on each page); each guest's 준비 (a jump press) reaches the host as pr
//      and the ready rows agree everywhere; all ready -> the 3-2-1 on every page well before the auto start; the phases a /
//      c / p / r reach every page; the snapshots stay under 3400 bytes; a guest that opens its menu during a card keeps it
//   3  물 v2: each guest draws the water at its estimate of the host's NOW (within 1 px at the real 8 px/s); an out the
//      host decides is a 오리 튜브 on every screen within 0.5 s (flag 512), its guest keeps control (its raft moves on the
//      host), its own line (탈락! 4등 / 오리 튜브로 친구를 맞혀요!) shows on its screen only, every guest plays 'splash';
//      that raft's prison drowning the host's animal is 역전 on every page (the rafter's own page moves it on the shelf);
//      a guest's 비누 pickup and its save (the hop through takeOver, not out during the grace)
//   4  the beats: f w t (s) reach every page in order, 끝! and the winner line on every page; a guest's press skips
//      nothing, the host's skip moves every page; the tally's final rows agree everywhere
//   5  왕관: a guest's claim (tp) on the holder drops the crown on every screen; a flight frees the holder everywhere, the
//      gold crown on every page; the held seconds agree at the result
//   6  the final podium (order, places, points - the 보너스상 in them) and the awards agree everywhere; each page's
//      coins are coinParty of its own counters (through coinGive: + the day bonus); trophies unchanged everywhere
//   7  거품 축구 (forced, 2v2, real lengths): the card on every page with the same teams and each page's own side line;
//      each page's kickoff call over its own animal only; a guest's body and a guest's bubble move the ball on the host;
//      a goal counted once and shown on every page (골! / 오른쪽 팀 0 : 1, the clock stopped); the ball drawn on each guest
//      in step with the host's path; the second ball on every page, its goal counted once with no freeze; a tie at
//      time-up -> 골든 골 on every page, the next goal ends it; the team places agree (x2: the last 판)
//   8  파티 한 번 더: a new game id, a new plan, nothing paid twice;  9  a guest leaving during the 2nd card, a 거품 축구
//      (4 -> 3): that 판 is drawn again on every page (no 축구 for 3), the party finishes with 3, the leaver gets nothing;
//      no allowBc (q 1): a finished party pays nobody; 바나나우유 잡기 (party-games 4.4, a smoke: each page's own measured
//      ms reaches the host, the reveal agrees, the 판 ends by its rounds; a guest's body state carries mi only while a
//      new game plays - none in 물, none at the podium); the host's 방으로 mid-party: everyone in the room, nobody paid; the
//      host leaving mid-party: the guests in the lobby with 방장이 나갔어요, nobody paid
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
  // (#lag: the new games' fairness run - frame 3 on a slow link; party-games 13.2)
  const LAG = /lag/.test(location.hash);
  document.body.style.background = '#061518';

  // ---------------------------------------------------------------- frames
  const frames = [];
  function frame(i) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'preview.html?net=bc&' + (LAG && i === 3 ? 'lat=100&jit=40' : 'lat=8&jit=4') + '&drop=0&frame=' + i;
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
  const slotP = (fr, s) => fr.G.players.find((p) => p.slot === s);
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
  async function press(fr, act) { const s = N(fr).mySlot; fr.D.press(act, true, s); await sleep(50); fr.D.press(act, false, s); }
  async function blows(fr, n) { for (let k = 0; k < n; k++) { await press(fr, 'shoot'); await sleep(260); } }
  // every page presses 준비 on the card (its own view of the card's clock past 12 frames)
  async function readyCard(F) {
    await until(() => F.every((f) => PS(f).ph === 'card' && PS(f).t >= 14), 4000, 5);
    await Promise.all(F.map((f) => press(f, 'jump')));
  }
  const bnr = (f) => (doc(f, 'pg-banner') && !doc(f, 'pg-banner').hidden ? doc(f, 'pg-banner-main').textContent + ' / ' + doc(f, 'pg-banner-sub').textContent : '');
  // the watcher: each page's phases (a result beat as r:<b>) and the banners it showed in a result
  const phases = new Map(), seenBn = new Map();
  let watch = null;
  const notePhases = (F) => {
    for (const f of F) {
      const a = phases.get(f.i), m = f.G.mode === 'result' && f.G.party ? 'r:' + (f.G.party.b || '') : f.G.mode;
      if (a[a.length - 1] !== m) a.push(m);
      if (f.G.mode === 'result') { const b = bnr(f); if (b) seenBn.get(f.i).add(b.split(' / ')[0]); }
    }
  };
  function watchPhases(F) { for (const f of F) { phases.set(f.i, []); seenBn.set(f.i, new Set()); } watch = setInterval(() => notePhases(F), 8); }
  const coinsOf = (f) => f.SH.state().ce;
  const TOP = (row) => 16 + row * 8;
  const inOrder = (list, want) => { let k = 0; for (const x of list) if (x === want[k]) k++; return k === want.length; };

  async function main() {
    const F = [await frame(0), await frame(1), await frame(2)];
    const [H, A, B] = F;
    // ---- 1. the room and the old-page gate
    code = await H.mp.host({ mode: 'party', nick: NICKS[0], char: CHARS[0], rounds: 3, rapid: true, perks: true });
    ok('room: a party room is hosted (mode party, 3판)', !!code && N(H).mode === 'party' && N(H).party.rounds === 3, N(H).party);
    for (const g of [A, B]) await join(g);
    await until(() => N(H).roster.length === 3 && N(H).party.seats.every((s) => s.slot === 0 || s.hi), 4000);
    const PV = H.P.consts().PARTY_V;
    ok('hi: every new page says pa: ' + PV + ' (5: the new games - world: false, the body state\'s mi; the host records hi and pa)', PV >= 5 && N(H).party.seats.filter((s) => s.slot).every((s) => s.hi && s.pa === PV), N(H).party.seats);
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
    // a crafted older guest: C says hi again with pa PARTY_V - 1 (a page before the new games: it would read their plan
    // codes as 물 and mi as noise); a page older still sends a smaller pa or none: the same gate
    C.mp.ready(true); await until(() => N(H).party.seats.find((s) => s.slot === 3).ready, 3000);
    C.mp.session().send(hostIdOf(C), { t: 'hi', n: NICKS[3], c: CHARS[3], cu: 100, d: N(H).roster[3].d || 'abcdef', z: 1, pa: PV - 1 });
    await until(() => N(H).party.seats.find((s) => s.slot === 3).old, 3000);
    A.mp.ready(true); B.mp.ready(true);
    await until(() => N(B).party.u.includes(3) && N(H).tro.R.p.find((e) => e[0] === 1)[3] === 1, 3000);
    const tagOf = (f, k) => { const li = doc(f, 'pg-room-players').children[k]; const t = li && li.querySelector('.pg-pc-tag'); return t ? t.textContent : ''; };
    const R1 = N(H).tro.R;
    ok('old page (pa ' + (PV - 1) + '): its seat says 새로고침 필요 on the host, R.u = [3], its R.p ready flag 0, 시작 off', tagOf(H, 3) === '새로고침 필요' && JSON.stringify(R1.u) === '[3]' && R1.p.find((e) => e[0] === 3)[3] === 0 && !N(H).canStart && doc(H, 'pg-go').disabled,
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

    // ---- 2. a 3판 party: the first card everywhere, the same cards, 준비, phases, the snapshot budget
    H.P.force(['water', 'crown', 'water']);
    watchPhases(F);
    const ce0 = F.map(coinsOf);
    let cardEnd = -1; H.mp.tap(() => { if (H.G.mode === 'card') cardEnd = PS(H).t; });
    H.mp.start();
    const card1 = await until(() => F.every((f) => PS(f).ph === 'card' && f.P.card().shown), 4000);
    ok('first card: shown on the host and on every guest (netAgain / guestBegin)', card1, F.map((f) => [PS(f).ph, f.P.card().shown]));
    const cardsOf = () => F.map((f) => { const c = f.P.card(); return [c.round, c.name, c.ready.map((r) => r.label.split(' ')[0]).join(',')]; });
    ok('first card: the same round line, game and ready row everywhere (1판 / 3판, 물 차오르기, four chips)', cardsOf().every((c) => JSON.stringify(c) === JSON.stringify(cardsOf()[0])) && cardsOf()[0][0] === '1판 / 3판' && cardsOf()[0][1] === '물 차오르기' && cardsOf()[0][2] === NICKS.join(','), cardsOf());
    ok('first card: my chip is outlined (나) on each page', F.every((f) => { const r = f.P.card().ready; return r.filter((q) => q.me).length === 1 && r.findIndex((q) => q.me) === N(f).mySlot; }), F.map((f) => f.P.card().ready));
    // a guest opens its menu during the card: it stays open over the card (and its presses are not 준비)
    B.D.pause();
    await sleep(80);
    ok('menu: a guest that opens its menu during a card keeps it (not replaced by the card)', N(B).overlay === 'pause' && PS(B).ph === 'card', [N(B).overlay, PS(B).ph]);
    B.D.resume();
    ok('menu: ... closed during the card, the card is back', N(B).overlay === 'party' || PS(B).ph !== 'card', N(B).overlay);
    // 준비: each guest's jump press reaches the host (pr in its body state); the ready rows agree; all ready -> 3-2-1
    await until(() => F.every((f) => PS(f).t >= 14), 3000, 5);
    await Promise.all([A, B, C].map((g) => press(g, 'jump')));
    const gotPr = await until(() => [1, 2, 3].every((s) => PS(H).rdy[s]), 500, 5);
    ok('준비: each guest\'s press reaches the host as pr within 0.5 s (its own button says 준비됐어요! at once)', gotPr && [A, B, C].every((g) => PS(g).partyReady === 0), [PS(H).rdy, [A, B, C].map((g) => PS(g).partyReady)]);
    const rows = () => F.map((f) => f.P.card().ready.map((r) => (r.ok ? 1 : 0)).join(''));
    const agree = await until(() => rows().every((r) => r === '0111'), 500, 5);
    ok('준비: the ready rows agree on every page within 0.5 s (the host not yet ready)', agree, rows());
    await press(H, 'jump');
    const counted = await until(() => F.every((f) => PS(f).ph === 'countdown' || PS(f).ph === 'playing'), 3000, 5);
    ok('준비: all ready -> the 3-2-1 on every page, well before the auto start (the card ended at ' + cardEnd + ' of 90 f)', counted && cardEnd > 0 && cardEnd < 85, [cardEnd, F.map((f) => PS(f).ph)]);
    H.mp.tap(null);
    await until(() => F.every((f) => PS(f).ph === 'playing'), 6000);
    // ---- 3. 물 v2: places for everyone (A on row 13: dry until the 4th step), 3 blows each (into the walls), the water
    // clock, an out the host calls -> a raft
    await Promise.all([place(H, 60, TOP(5) - 16, 'left'), place(A, 60, TOP(13) - 16, 'left'), place(B, 172, TOP(5) - 16, 'right'), place(C, 204, TOP(9) - 16, 'right')]);
    await sleep(150);
    await Promise.all(F.map((f) => blows(f, 3)));
    // the drawn water against the host's clock: sampled in one turn (the host's frame vs each guest's estimate of it)
    const diffs = [];
    for (let k = 0; k < 10; k++) {
      const ht = PS(H).mini.t;
      for (const g of [A, B, C]) { const m = PS(g).mini; if (m && m.tt !== null) diffs.push(m.tt - ht); }
      await sleep(60);
    }
    const worst = Math.max(...diffs.map((d) => Math.abs(d)));
    info('water clock: guest estimate - host frame (ticks): ' + diffs.join(' ') + ' -> at the real 8 px/s that is ' + (worst * 8 / 60).toFixed(2) + ' px');
    ok('water: every guest draws the water at the host\'s clock (within 1 px at the real 8 px/s: <= 7 ticks)', diffs.length >= 24 && worst <= 7, diffs);
    ok('mi: no guest\'s body state carries mi in a game without local (물): the host\'s last state of each has none', [1, 2, 3].every((s) => H.P.remMi(s) === null), [1, 2, 3].map((s) => H.P.remMi(s)));
    ok('water: ... and its drawn level is the schedule at that frame', [A, B, C].every((g) => { const m = PS(g).mini; return m && Math.abs(m.wl - g.P.waterAt(m.tt, 0.2)) < 0.01; }));
    const sp0 = F.map((f) => f.sfx.filter((n) => n === 'splash').length);
    const t0 = performance.now();
    ok('water: (setup) A is still dry on row 13', !me(A).raft && !slotP(H, 1).raft);
    H.P.level(110);
    const outAll = await until(() => F.every((f) => slotP(f, 1).raft), 500, 10);
    const dt = performance.now() - t0;
    H.P.level(null);
    ok('water: the host calls A out (row 13 under a surface at 110) -> a 오리 튜브 on every screen within 0.5 s (flag 512)', outAll && dt <= 500 && (H.P.prow(1)[7] & 512), [dt, F.map((f) => slotP(f, 1).raft)]);
    await sleep(150);
    ok('water: A keeps control of its raft (its own page moves it), drawn, not out', N(A).ctl === 'local' && me(A).raft && !me(A).out, [N(A).ctl, me(A).raft, me(A).out]);
    ok('water: A\'s own line says its place on its screen only (탈락! 4등 / 오리 튜브로 친구를 맞혀요!)', /^탈락! 4등 \/ 오리 튜브로 친구를 맞혀요!$/.test(bnr(A)) && [H, B, C].every((f) => bnr(f).indexOf('탈락! 4등') < 0), F.map(bnr));
    ok('water: every guest played \'splash\' for it (NO_ECHO: their own)', [A, B, C].every((g, k) => g.sfx.filter((n) => n === 'splash').length > sp0[k + 1]), F.map((f, k) => f.sfx.filter((n) => n === 'splash').length - sp0[k]));
    const ax0 = slotP(H, 1).x;
    A.D.press('right', true, 1); await sleep(300); A.D.press('right', false, 1);
    const moved = await until(() => slotP(H, 1).x > ax0 + 8, 800, 10);
    ok('water: A\'s raft walks on its own page and moves on the host (its body state)', moved && Math.abs(me(A).y - (PS(A).mini.wl - 12)) < 1.5, [ax0, slotP(H, 1).x, me(A).y, PS(A).mini.wl]);
    // 역전: the host's animal held by a prison of A's (the raft's bubble) under the surface drowns -> A is back on a shelf
    const wl0 = PS(H).mini.wl;
    slotP(H, 0).invuln = 0; H.D.setPlayer(120, wl0 - 10, 0); H.D.trapPlayer(0, 1);
    const back = await until(() => F.every((f) => !slotP(f, 1).raft && slotP(f, 0).raft && PS(f).mini.rv[1] === 1), 800, 10);
    ok('역전: the host\'s animal drowning in A\'s prison brings A back on a top shelf on every page (rv), the host\'s animal a raft', back && Math.abs(slotP(H, 1).y - 40) < 1 && (slotP(H, 1).x === 60 || slotP(H, 1).x === 180), F.map((f) => [slotP(f, 1).raft, slotP(f, 0).raft, PS(f).mini.rv]));
    await sleep(150);
    ok('역전: ... A\'s own page moves it there (control local, its line 역전! / 다시 올라왔어요!)', N(A).ctl === 'local' && !me(A).raft && Math.abs(me(A).y - 40) < 3 && /^역전! \/ 다시 올라왔어요!$/.test(bnr(A)), [N(A).ctl, me(A).y, bnr(A)]);
    // a guest's 비누: B held over a soap the host made -> got / a save on every page; then B drops into the water -> the
    // save (a hop through takeOver), not out during the grace
    H.P.soap(176); const sy = H.P.soapY(0);
    B.mp.tap(() => B.D.setPlayer(172, sy - 8, 2));
    const picked = await until(() => F.every((f) => (PS(f).mini.got[2] | 0) === 1 && PS(f).mini.sh[2] === 1), 1000, 10);
    ok('비누: B touches one the host made -> 비누 (got 1, a save held) on every page', picked, F.map((f) => [PS(f).mini.got, PS(f).mini.sh]));
    const ep0 = me(B).ep;
    B.mp.tap(null);
    const saved = await until(() => me(B).ep > ep0 && N(B).ctl === 'local' && me(B).vy < 0, 1500, 4);
    ok('비누: B falling into the water is saved, not out: its page takes its animal back at the hop (a new epoch, upward)', saved && !me(B).raft && !slotP(H, 2).raft, [saved, me(B).ep, ep0, me(B).vy]);
    await sleep(300);
    ok('비누: ... not judged during the grace', !slotP(H, 2).raft);
    await until(() => F.every((f) => PS(f).ph === 'result'), 15000);
    await sleep(60);
    ok('beats: 끝! on every page', F.every((f) => seenBn.get(f.i).has('끝!')), F.map((f) => [...seenBn.get(f.i)]));
    // a guest's press during the winner stage skips nothing; the host's skip moves every page
    await until(() => PS(H).b === 'w', 2000, 5);
    await press(A, 'jump'); await sleep(60);
    ok('skip: a guest\'s press during the winner stage does nothing (still w on the host)', PS(H).b === 'w', PS(H).b);
    await until(() => PS(H).b === 't' && PS(H).bt >= 32, 3000, 5);
    const sk = H.P.skipBeat();
    const allCard = await until(() => F.every((f) => PS(f).ph === 'card' && PS(f).i === 1), 600, 5);
    ok('skip: the host\'s skip (the tally past 30 f) moves every page to the next card within 0.5 s', sk && allCard, [sk, F.map((f) => [PS(f).ph, PS(f).i])]);
    const res1 = F.map((f) => JSON.stringify([PS(f).pts, PS(f).last]));
    ok('result: 물 points and places agree on every page; A (back by 역전) is not last', res1.every((r) => r === res1[0]) && PS(H).last[1] < 4 && PS(H).last[0] === 4, res1);
    // ---- 5. 왕관: a guest's claim on the holder drops the crown everywhere; a flight frees it, the gold crown
    ok('2nd card: 2판 / 3판 · 왕관 뺏기 on every page', F.every((f) => f.P.card().round === '2판 / 3판' && f.P.card().name === '왕관 뺏기'), F.map((f) => f.P.card()));
    await readyCard(F);
    await until(() => F.every((f) => PS(f).ph === 'playing'), 6000);
    await Promise.all([place(A, 40, 200, 'right'), place(B, 80, 200, 'right')]);
    await sleep(150);
    H.P.crown(2);
    await until(() => F.every((f) => PS(f).mini && PS(f).mini.cr && PS(f).mini.cr.holder === 2), 2000);
    H.P.flight();
    const flew = await until(() => F.every((f) => PS(f).mini.cr.holder === -1) && PS(H).mini.fl >= 1, 600, 5);
    ok('왕관: a flight frees the holder on every page (the crown at the gather again)', flew, F.map((f) => [PS(f).mini.cr.holder, PS(f).mini.fl]));
    H.P.crown(2);
    await until(() => F.every((f) => PS(f).mini.cr.holder === 2), 1500);
    await blows(B, 1);                           // (B's blow ends its own blink, away from A)
    await sleep(200);
    await place(A, 40, 200, 'right'); await place(B, 80, 200);
    await sleep(120);
    const sent0 = N(A).claims.sent;
    A.D.press('shoot', true, 1); await sleep(60); A.D.press('shoot', false, 1);
    const dropped = await until(() => F.every((f) => PS(f).mini.cr.holder === -1), 2500);
    ok('왕관: A\'s claim (tp) on the holder B drops the crown on every screen', dropped && N(A).claims.sent > sent0, [F.map((f) => PS(f).mini.cr.holder), N(A).claims]);
    while ((PS(H).mini.fl | 0) < 3) H.P.flight();
    const gold = await until(() => F.every((f) => PS(f).mini.gold === 1), 600, 5);
    ok('왕관: the 황금 왕관 (the 3rd flight) on every page', gold, F.map((f) => PS(f).mini.gold));
    await until(() => F.every((f) => PS(f).ph === 'result'), 15000);
    await sleep(100);
    const held = F.map((f) => JSON.stringify([PS(f).mini.held, PS(f).mini.gold]));
    ok('왕관: the held times (and the gold) agree on every page at the result', held.every((h) => h === held[0]), held);
    // the tally's final rows agree everywhere (each page past the re-sort)
    const tallies = await Promise.all(F.map(async (f) => { await until(() => PS(f).b === 't' && PS(f).bt >= 42, 3000, 5); return JSON.stringify(f.P.card().board.map((r) => [r.place, r.nick, r.pts, r.gain])); }));
    ok('tally: the final rows (places, order, points, +N) agree on every page', tallies.every((t) => t === tallies[0]) && JSON.parse(tallies[0]).length === 4, tallies);
    const stand = await until(() => F.every((f) => PS(f).b === 's' && f.P.card().view === 'stand' && f.P.card().name === '마지막 판!'), 3000, 5);
    ok('마지막 판!: on every page after the second-to-last 판', stand, F.map((f) => [PS(f).b, f.P.card().view]));
    // ---- the last 판 and the podium
    await until(() => F.every((f) => PS(f).ph === 'card'), 4000);
    ok('last card: 마지막 판! 3판 / 3판 with its 점수 2배! chip on every page', F.every((f) => f.P.card().round === '마지막 판! 3판 / 3판' && f.P.card().x2), F.map((f) => f.P.card()));
    await until(() => F.every((f) => PS(f).ph === 'playing'), 8000);      // (nobody presses: the auto start)
    await Promise.all([place(H, 60, TOP(5) - 16, 'left'), place(A, 28, 200, 'left'), place(B, 172, TOP(5) - 16, 'right'), place(C, 204, TOP(9) - 16, 'right')]);
    await sleep(150);
    await Promise.all(F.map((f) => blows(f, 3)));
    const pod = await until(() => F.every((f) => PS(f).ph === 'podium'), 25000);
    notePhases(F); clearInterval(watch); // (one last look: the podium may have come between two samples)
    ok('phases: card, countdown, playing and result reached every page, then the podium', pod && F.every((f) => ['card', 'countdown', 'playing', 'podium'].every((m) => phases.get(f.i).includes(m))), F.map((f) => phases.get(f.i).join('>')));
    ok('beats: f w t, then (after the 2nd 판) f w t s, then f w t ... z reached every page in order', F.every((f) => inOrder(phases.get(f.i), ['r:f', 'r:w', 'r:t', 'card', 'r:f', 'r:w', 'r:t', 'r:s', 'card', 'r:f', 'r:w', 'r:t', 'r:z', 'podium'])), F.map((f) => phases.get(f.i).join('>')));
    ok('beats: the winner line showed on every page (1등 ... ! / 공동 1등!)', F.every((f) => [...seenBn.get(f.i)].some((t) => /^1등 .+!$|^공동 1등!$/.test(t))), F.map((f) => [...seenBn.get(f.i)]));
    ok('snapshots: under 3400 bytes all party long', N(H).snap.max > 0 && N(H).snap.max <= 3400, N(H).snap);
    await sleep(300);
    const pds = F.map((f) => JSON.stringify([PS(f).podium, PS(f).pts, PS(f).A, PS(f).bonus]));
    ok('podium: order, places and points - and the 보너스상 and their bonuses - agree on every page', pds.every((p) => p === pds[0]), pds);
    ok('awards: 최다 가두기상 to A (its claim on B) among them, its +2점 in its points', (PS(H).A || []).some((a) => a[0] === 'c' && a[2].includes(1)) && PS(H).bonus[1] >= 2, [PS(H).A, PS(H).bonus]);
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

    // ---- 7. 거품 축구, 2v2 (forced, real lengths): the teams, the kickoff calls, a guest's body / bubble on the host's
    // ball, a goal, the ball in step on the guests, the second ball, 골든 골, the team places
    for (const f of F) f.P.fast(false);
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
    await readyCard(F);
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
    const hs2 = [], gs = { 1: [], 2: [], 3: [] };
    info('clock before the ball-in-step check: ' + PS(H).left + ' frames left');
    H.P.ball(50, 205, 3, 0);    // (rolling across the floor, under the keepers on the crossbars)
    const smp = setInterval(() => {
      const t = performance.now(), hm = H.G.mini;
      if (hm && hm.ball && hm.ball.kick === 0 && hm.goalT === 0) hs2.push([t, hm.ball.x, hm.ball.y]);
      for (const g of [A, B, C]) { const m = g.G.mini; if (m && m.ball && m.ball.kick === 0 && !(m.goalT > 0)) gs[g.i].push([t, m.ball.x, m.ball.y]); }
    }, 6);
    await sleep(1600);
    clearInterval(smp);
    const fit = (q) => { let best = 1e9, lag = 0; for (const h of hs2) { if (h[0] > q[0] || h[0] < q[0] - 900) continue; const d = Math.hypot(h[1] - q[1], h[2] - q[2]); if (d < best) { best = d; lag = q[0] - h[0]; } } return [best, lag]; };
    const stat = [A, B, C].map((g) => {
      const fs1 = gs[g.i].filter((q) => q[0] > hs2[0][0] + 900).map(fit), ds = fs1.map((v) => v[0]).sort((a, b) => a - b), lags = fs1.map((v) => v[1]).sort((a, b) => a - b);
      return { n: ds.length, med: ds[ds.length >> 1], p90: ds[Math.floor(ds.length * 0.9)], lag: Math.round(lags[lags.length >> 1]) };
    });
    info('ball in step (guest drawn ball vs the host\'s path, px; lag ms): ' + JSON.stringify(stat));
    ok('축구: the ball on each guest follows the host\'s path (median <= 1 px, 90% <= 3 px, a view delay behind)', hs2.length > 100 && stat.every((q) => q.n > 50 && q.med <= 1 && q.p90 <= 3 && q.lag >= 0 && q.lag < 700), stat);
    H.P.ball(128, 205, 0, 0);
    // a goal: shown on every page, counted once, the clock stopped
    H.P.ball(40, 205, -2.5, 0);
    const gl = await until(() => F.every((f) => PS(f).mini && PS(f).mini.goals && PS(f).mini.goals[1] === 1), 2500);
    const gb = await until(() => F.every((f) => bnr(f) === '골! / 오른쪽 팀 0 : 1'), 1500);
    ok('축구 goal: into the left goal -> 0 : 1 on every page, 골! / 오른쪽 팀 0 : 1 everywhere', gl && gb, F.map((f) => [PS(f).mini.goals, bnr(f)]));
    const tl0 = PS(H).left;
    await sleep(800);
    ok('축구 goal: the clock stands still while 골! shows (the host\'s, and each guest\'s view of it)', PS(H).left === tl0 && PS(H).mini.goalT > 0 && [A, B, C].every((g) => Math.abs(PS(g).left - tl0) <= 3), [tl0, F.map((f) => PS(f).left)]);
    await until(() => PS(H).mini.goalT === 0 && PS(H).mini.ball.kick === 0, 4000);
    await sleep(300);
    ok('축구 goal: counted once on every page', F.every((f) => JSON.stringify(PS(f).mini.goals) === '[0,1]'), F.map((f) => PS(f).mini.goals));
    // 공이 2개 (the host's two(): the clock's 45 s would be a long wait): on every page; its goal counted once, no freeze
    H.P.two();
    const two = await until(() => F.every((f) => PS(f).mini.ball2), 800, 5);
    ok('공이 2개: the second ball on every page', two, F.map((f) => !!PS(f).mini.ball2));
    await until(() => PS(H).mini.ball2.kick === 0, 2000, 5);
    H.P.ball(150, 120, 0, 0); H.P.ball2(40, 205, -2.5, 0);
    const g2 = await until(() => F.every((f) => JSON.stringify(PS(f).mini.goals) === '[0,2]'), 1500, 5);
    const lt = PS(H).left; await sleep(300);
    ok('공이 2개: a goal with the second ball - 0 : 2 on every page, no freeze (the clock runs on, goalT 0)', g2 && PS(H).left < lt - 10 && PS(H).mini.goalT === 0, [F.map((f) => PS(f).mini.goals), lt, PS(H).left]);
    await sleep(500);
    ok('공이 2개: counted once on every page', F.every((f) => JSON.stringify(PS(f).mini.goals) === '[0,2]'), F.map((f) => PS(f).mini.goals));
    // 골든 골: two quick goals for the left (2 : 2), time-up now -> overtime on every page; the next goal ends it
    H.P.goal(0); H.P.goal(0);
    await until(() => F.every((f) => JSON.stringify(PS(f).mini.goals) === '[2,2]'), 1500, 5);
    H.P.golden();
    const gg = await until(() => F.every((f) => PS(f).ph === 'playing' && PS(f).mini.gg >= 0), 1000, 5);
    ok('골든 골: tied at time-up -> still playing, the overtime on every page (골든 골! on the host)', gg && H.G.banner && H.G.banner.main === '골든 골!', F.map((f) => [PS(f).ph, PS(f).mini.gg]));
    await until(() => PS(H).mini.ball.kick === 0, 2000, 5);
    H.P.ball(40, 205, -2.5, 0);
    const bres = await until(() => F.every((f) => PS(f).ph === 'result'), 4000);
    await sleep(150);
    const rp = F.map((f) => JSON.stringify([PS(f).pts, PS(f).last])), right = [0, 1, 2, 3].filter((q) => tm[q] === 1), left = [0, 1, 2, 3].filter((q) => tm[q] === 0);
    const pr = PS(H);
    ok('골든 골: the next goal (2 : 3) ends it on every page; the team places and points agree - the right team shares 1st, the left the next place (the last 판: +8 + 8 / +2 + 2)', bres && rp.every((r) => r === rp[0]) && right.every((q) => pr.gain[q] === 8 && pr.last[q] === 1) && left.every((q) => pr.gain[q] === 2 && pr.last[q] === 3), [rp, pr.gain, PS(H).mini.goals]);
    const winR = await until(() => F.every((f) => /^오른쪽 팀 승리!/.test(bnr(f))), 3000, 5);
    ok('축구 result: 오른쪽 팀 승리! on every page (the winner stage)', winR, F.map(bnr));
    for (const f of F) f.P.fast(true);
    await until(() => F.every((f) => PS(f).ph === 'podium'), 20000);
    await sleep(300);

    // ---- 8. 파티 한 번 더 + 9. a guest leaving during the 축구 card (4 -> 3)
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
    // (party-games 3.6: the replan draws from the games that fit 3 and were not played - 왕관 or a new game)
    const redrawn = await until(() => D3.every((f) => PS(f).ph === 'card' && f.P.card().shown && PS(H).plan[1] !== 'ball' && f.P.card().name === H.P.mini()[PS(H).plan[1]].name && !f.P.card().team && f.P.card().round === '2판 / 3판'), 4000);
    ok('leaver: a guest leaving during the 축구 card (4 -> 3) - that 판 is drawn again on every page (a game for 3 not played yet, no team line), the party goes on with 3',
      redrawn && PS(H).on && PS(H).i === 1 && PS(H).plan[1] !== 'water' && !PS(H).plan.includes('ball') && H.G.players.length === 3 && !PS(H).walk, [PS(H).plan, D3.map((f) => f.P.card())]);
    // (the leaver's page keeps no party: its lobby's demo world runs its rounds, no water / crown drawn behind the panel)
    ok('leaver: its own page has no party left (G.party / G.mini cleared, the arena list back to the battle one)', !PS(C).on && PS(C).mini === null && PS(C).kind === 'b', [PS(C).on, PS(C).mini, PS(C).kind]);
    const pod2 = await until(() => D3.every((f) => PS(f).ph === 'podium'), 70000);   // (a redrawn 바나나우유 plays its 4 fast rounds)
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

    // ---- 바나나우유 잡기 online, a smoke at 8 / 4 ms (design/party-games.md 4.4; the slow-link checks are the #lag run's):
    // a forced 1-판 party (fast: 4 rounds). Round 1: each page presses 250 ms after its OWN first draw of the milk - the
    // host takes each seat's own measured ms (its mi, the host's through the same local -> input), the reveal rows agree
    // on every page; the 판 ends by its rounds, the podium follows
    H.mp.toRoom(); await until(() => D3.every((f) => N(f).screen === 'room'), 6000);
    H.P.force(['milk']);
    await readyAll(D3);
    H.mp.start();
    const mk = await until(() => D3.every((f) => PS(f).ph === 'playing' && PS(f).mini && PS(f).mini.id === 'milk'), 15000);
    ok('바나나우유: the 판 plays on every page (무대 목욕탕, the animals on their stage spots)', mk && D3.every((f) => PS(f).kind === 'p' && f.P.arenas()[PS(f).arena].key === 'stage'), D3.map((f) => [PS(f).ph, PS(f).mini && PS(f).mini.id]));
    const mkWant = {};
    await Promise.all(D3.map(async (f) => {
      if (!(await until(() => { const s = f.P.seen(); return s && s.r === 1 && s.milk !== undefined; }, 8000, 2))) return;
      const t = f.P.seen().milk; await sleep(250); const tp = f.P.now();
      f.P.press(N(f).mySlot, 'shoot', tp); mkWant[N(f).mySlot] = Math.round(tp - t);
    }));
    const mkRv = await until(() => H.P.milk() && H.P.milk().r === 1 && H.P.milk().ph === 2, 4000, 5);
    ok('mi: during 바나나우유 each guest\'s body state carries its mi ([판 i, round, ms, flag])', [1, 2].every((s) => { const m = H.P.remMi(s); return m && m.length === 4 && m[0] === PS(H).i && m[1] === 1; }), [1, 2].map((s) => H.P.remMi(s)));
    const res = mkRv ? H.P.milk().res : null;
    ok('바나나우유: each seat\'s grab reaches the host with the ms its own page measured (250+ after its own draw)', res && res.length === 3 && res.every((q) => q[2] === 1 && q[1] === mkWant[q[0]] && q[1] >= 250 && q[1] < 1000), [res, mkWant]);
    const mkAgree = await until(() => D3.every((f) => PS(f).mini && PS(f).mini.r === 1 && PS(f).mini.ph === 2 && JSON.stringify(PS(f).mini.res) === JSON.stringify(res)), 3000, 5);
    ok('바나나우유: the reveal rows (and points) agree on every page', mkAgree, D3.map((f) => PS(f).mini && [PS(f).mini.r, PS(f).mini.ph, PS(f).mini.res]));
    const mpod = await until(() => D3.every((f) => PS(f).ph === 'podium'), 45000);
    ok('바나나우유: the 판 ends by its 4 fast rounds and the podium shows on every page', mpod, D3.map((f) => [PS(f).ph, PS(f).mini && PS(f).mini.r]));
    const noMi = await until(() => [1, 2].every((s) => H.P.remMi(s) === null), 1500, 10);
    ok('mi: ... and none once the 판 is over (the podium: the guests\' states leave it out)', noMi, [1, 2].map((s) => H.P.remMi(s)));

    // ---- the host's 방으로 mid-party: everyone in the room, nobody paid
    H.mp.toRoom(); await until(() => D3.every((f) => N(f).screen === 'room'), 6000);
    H.P.force(['water', 'crown', 'water']);
    await readyAll(D3);
    const ce4 = D3.map(coinsOf);
    H.mp.start();
    await until(() => PS(H).ph === 'playing', 8000);
    await Promise.all(D3.map((f) => blows(f, 3)));
    H.mp.toRoom();
    const back2 = await until(() => D3.every((f) => N(f).screen === 'room' && f.G.mode === 'title'), 6000);
    await sleep(300);
    ok('방으로 mid-party: everyone back in the room, nobody paid', back2 && D3.every((f, k) => coinsOf(f) === ce4[k]), D3.map((f) => [N(f).screen, coinsOf(f)]));
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
  // ---------------------------------------------------------------- #lag (party-games 13.2): the new games on a slow link
  // frame 3 (C, 냥냥) at lat 100 / jit 40, the others at 8 / 4; fast party (바나나우유 4 rounds, 펑 a 12 s window)
  //   2  바나나우유: the host's own player, A and C press 250 ms after their OWN first draw of the milk - a real keydown
  //      dispatched by a timer the page set at that draw (pressAfterDraw): each page's RT is exactly round(the event's
  //      timeStamp - its recorded draw time), on its page and at the host, and lies in 250..300 (a timer runs late, never
  //      early); round 2 C at 200, A at 320 - C places above A despite its lag; round 3 B presses on the decoy - the
  //      물벼락 on every page; the events and the reveal rows agree everywhere; the 판 ends by its rounds
  //   3  펑: A and C run the same press pattern from their own 시작! (puffs >= 80 ms apart as real X presses, ↓ at the
  //      tremble, then at the flash, then puff until it pops) well before their window ends: the same score, bubbles and
  //      pops; the host places by the done reports (A and C share the 1st); every page hears both pops once
  //   5  the snapshots stay under 3400 bytes
  async function lagRun() {
    const F = [await frame(0), await frame(1), await frame(2), await frame(3)];
    const [H, A, B, C] = F;
    code = await H.mp.host({ mode: 'party', nick: NICKS[0], char: CHARS[0], rounds: 3, rapid: true, perks: true });
    for (const g of [A, B, C]) await join(g);
    const in4 = await until(() => N(H).roster.length === 4 && N(H).party.seats.every((s) => s.slot === 0 || s.hi), 8000);
    ok('lag: four pages in one party room (frame 3 on a 100 ms +-40 link)', in4, N(H).party.seats);
    const rtt = C.mp.state().stats || {};
    info('lag: frame 3 link stats ' + JSON.stringify(rtt).slice(0, 200));

    // ---- 2. 바나나우유
    H.P.force(['milk']);
    for (const f of [H, A, C]) f.P.pressAfterDraw(250, 'milk');
    B.P.pressAfterDraw(100, 'decoy');
    await readyAll(F);
    H.mp.start();
    const on = await until(() => F.every((f) => PS(f).ph === 'playing' && PS(f).mini && PS(f).mini.id === 'milk'), 15000);
    ok('lag 바나나우유: the 판 plays on every page', on, F.map((f) => [PS(f).ph, PS(f).mini && PS(f).mini.id]));
    const evAgree = (r) => F.every((f) => JSON.stringify(f.P.milkEv()) === JSON.stringify(H.P.milkEv())) && H.P.milk().r === r;
    const rowsAt = async (r) => {
      const rv = await until(() => H.P.milk() && H.P.milk().r === r && H.P.milk().ph === 2, 8000, 5);
      const res = rv ? H.P.milk().res : null;
      const agree = rv && await until(() => F.every((f) => PS(f).mini && PS(f).mini.r === r && PS(f).mini.ph === 2 && JSON.stringify(PS(f).mini.res) === JSON.stringify(res)), 3000, 5);
      return { res, ev: agree && evAgree(r), agree };
    };
    // round 1 (a warm-up: each page's first key press unlocks its audio - heavy, and the four frames share one main
    // thread, so the next page's timer runs ~0.5 s late: 699 / 1186 ms seen) and round 2: H, A and C at 250 ms after
    // their own draws (B: no press - 느려요); the plumbing exact in both, the range in round 2
    const recsOf = (r) => [H, A, C].map((f) => ({ s: N(f).mySlot, rec: f.P.padRec(), rep: (f.P.mloc(N(f).mySlot) || {}).rep, r }));
    const exact = (q, res) => q.rec && q.rep && q.rec.r === q.r && q.rep[0] === Math.round(q.rec.ts - q.rec.draw) && res.some((x) => x[0] === q.s && x[2] === 1 && x[1] === q.rep[0]);
    const r1 = await rowsAt(1), recs1 = recsOf(1);
    for (const f of [H, A, C]) f.P.pressAfterDraw(250, 'milk');
    const r2 = await rowsAt(2), recs2 = recsOf(2);
    info('lag 바나나우유 rounds 1 / 2: ' + recs1.concat(recs2).map((q) => 'r' + q.r + ' slot ' + q.s + ' rt ' + (q.rec ? (q.rec.ts - q.rec.draw).toFixed(1) : '-') + ' -> ' + JSON.stringify(q.rep)).join(' | '));
    ok('lag 바나나우유: each page\'s RT is exactly round(its key event\'s timeStamp - its own recorded draw of the milk), on its page and at the host - rounds 1 and 2 (the plumbing: evT and the rAF time)',
      r1.res && r2.res && recs1.every((q) => exact(q, r1.res)) && recs2.every((q) => exact(q, r2.res)), [recs1, r1.res, recs2, r2.res]);
    ok('lag 바나나우유: ... and lies in 250..300 ms on every page, frame 3 on its slow link too (a timer runs late, never early; round 2)', recs2.every((q) => q.rep && q.rep[0] >= 250 && q.rep[0] <= 300), recs2.map((q) => q.rep));
    ok('lag 바나나우유: rounds 1 and 2 - the events and the reveal rows agree on every page (B, no press: 느려요)', r1.ev && r1.agree && r2.ev && r2.agree && [r1, r2].every((q) => q.res.find((x) => x[0] === 2)[2] === 4), [r1, r2, F.map((f) => f.P.milkEv())]);
    // round 3: C (the slow link) at 200, A at 320 - C places above A; B's press on the decoy - its 물벼락 on every page
    C.P.pressAfterDraw(200, 'milk'); A.P.pressAfterDraw(320, 'milk');
    const r3 = await rowsAt(3), q3 = (s) => (r3.res || []).find((x) => x[0] === s) || [s, 0, 0, 0], recB = B.P.padRec();
    info('lag 바나나우유 round 3: ' + JSON.stringify(r3.res));
    ok('lag 바나나우유: round 3 - C (100 ms link) pressing 200 ms after its own draw places above A at 320 ms (3 vs 2 points)', q3(3)[2] === 1 && q3(1)[2] === 1 && q3(3)[1] < q3(1)[1] && q3(3)[3] === 3 && q3(1)[3] === 2 && r3.ev && r3.agree, [r3.res, r3.ev, r3.agree]);
    const wet = F.every((f) => { const fx = (f.P.mloc() || {}).fx; return fx && fx[2] && fx[2].r === 3; });
    ok('lag 바나나우유: round 3 - B\'s press 100 ms after its own draw of the decoy is a 반칙 (-1), the 물벼락 on every page', recB && recB.r === 3 && q3(2)[2] === 2 && q3(2)[3] === -1 && wet && r3.agree,
      [recB, r3.res, F.map((f) => (f.P.mloc() || {}).fx)]);
    const pod = await until(() => F.every((f) => PS(f).ph === 'podium'), 45000);
    ok('lag 바나나우유: the 판 ends by its 4 fast rounds and the podium shows on every page', pod, F.map((f) => [PS(f).ph, PS(f).mini && PS(f).mini.r]));

    // ---- 3. 펑
    H.mp.toRoom(); await until(() => F.every((f) => N(f).screen === 'room'), 6000);
    H.P.force(['puff']);
    await readyAll(F);
    const pop0 = F.map((f) => f.sfx.filter((n) => n === 'pop').length);
    // (a list whose first three pop sizes are small - 40..55 % - so the pattern fits well inside the 12 s window, and
    // bubble 2 surely pops before 만점)
    let seedP = 1; while (![0, 1, 2].every((k) => { const L = H.P.puffL(seedP, k); return L >= 40 && L <= 55; })) seedP++;
    H.mp.start();
    await until(() => PS(H).ph === 'card' && H.P.puff(), 6000, 5); H.P.puffSeed(seedP);
    const pf = await until(() => F.every((f) => PS(f).ph === 'playing' && PS(f).mini && PS(f).mini.id === 'puff'), 15000);
    ok('lag 펑: the 판 plays on every page (a 12 s window: the host\'s, in g.mg)', pf && F.every((f) => f.P.puff() && f.P.puff().win === 12000), F.map((f) => [PS(f).ph, f.P.puff() && f.P.puff().win]));
    const script = async (f) => {
      const s = N(f).mySlot, seat = () => f.P.puffSeat(s), w = f.w;
      if (!(await until(() => f.P.puffT0() !== null, 8000, 2))) return { err: 'no window' };
      const t0 = f.P.puffT0(), seed = f.P.puff().seed;
      const key = (code, k) => { w.dispatchEvent(new w.KeyboardEvent('keydown', { code, key: k, bubbles: true })); w.dispatchEvent(new w.KeyboardEvent('keyup', { code, key: k, bubbles: true })); };
      for (const want of [1, 3, 9]) {   // (↓ at the tremble, then at the flash; 9: never - puff until it pops)
        for (let k = 0; k < 40; k++) {
          const S = seat(); if (want < 9 && f.P.puffWarn(S.s10, f.P.puffL(seed, S.n)) >= want) break;
          key('KeyX', 'x');
          await until(() => seat().s10 !== S.s10 || seat().n !== S.n, 1000, 2); await sleep(80);
          if (seat().n !== S.n) break;
        }
        if (want < 9) { const n0 = seat().n; key('ArrowDown', 'ArrowDown'); await until(() => seat().n !== n0, 1000, 2); }
        await until(() => seat().st === 0, 2500, 5);
      }
      return { t: f.P.now() - t0, seat: seat() };
    };
    const [sa, sc] = await Promise.all([script(A), script(C)]);
    info('lag 펑: A ' + JSON.stringify(sa) + ' | C ' + JSON.stringify(sc));
    ok('lag 펑: A and C each finished the pattern inside their own window, 2 s before its end', sa.t > 0 && sc.t > 0 && sa.t < 10000 && sc.t < 10000, [sa, sc]);
    ok('lag 펑: the same press pattern from each one\'s own 시작! gives the same score, bubbles and pops at 8 ms and at 100 ms (two kept, one popped)', sa.seat && sc.seat && sa.seat.score === sc.seat.score && sa.seat.n === 3 && sc.seat.n === 3 && sa.seat.pops === 1 && sc.seat.pops === 1 && sa.seat.score > 0, [sa, sc]);
    const done = await until(() => F.every((f) => PS(f).ph === 'result'), 20000);
    await sleep(200);
    const rows = PS(H).mini && PS(H).mini.rows;
    ok('lag 펑: the host\'s rows of A and C are their own pages\' (score, bubbles, pops), done', done && rows && rows[1] && rows[3] && rows[1][0] === sa.seat.score && rows[3][0] === sc.seat.score && rows[1][2] === 3 && rows[3][3] === 1 && rows[1][4] === 3 && rows[3][4] === 3, rows);
    ok('lag 펑: the host places by the done reports - A and C share the 1st, the host and B below', PS(H).last[1] === 1 && PS(H).last[3] === 1 && PS(H).last[0] > 1 && PS(H).last[2] > 1, PS(H).last);
    const pops = F.map((f, k) => f.sfx.filter((n) => n === 'pop').length - pop0[k]);
    ok('lag 펑: every page heard both pops once (its own at once, a friend\'s when its row\'s pops rose)', pops.every((n) => n === 2), pops);
    await until(() => F.every((f) => PS(f).ph === 'podium'), 20000);

    // ---- 5. the snapshot budget
    ok('lag: snapshots under 3400 bytes throughout', N(H).snap.max > 0 && N(H).snap.max <= 3400, N(H).snap);
    ok('lag: no page error in any frame', F.every((f) => !f.errors.length), F.map((f) => f.errors));
  }
  // (A's own animal on its page)
  const G1 = (f) => me(f);
  (LAG ? lagRun() : main()).catch((e) => { fail++; log('PARTYNET FAIL ' + (LAG ? 'lagRun' : 'main') + ' threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); }).then(() => log('PARTYNET DONE pass=' + pass + ' fail=' + fail));
})();
