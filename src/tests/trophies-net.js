// v4 trophies online (design/trophies.md §15.2): 3 same-origin iframes on PG.Net 'bc', in REAL time.
//   node tools/serve.js   (background)
//   node tools/run-chrome.js http://localhost:8765/test-trophies-net.html - 1200 900 rt420000 "TROPHYNET DONE"
// Every frame: tro.ns('f' + i), tro.allowBc(true) (bc is practice otherwise), tro.fast(true) (battles end early here),
// tro.set({t: 100}). host = slot 0, guest A = slot 1, guest B = slot 2.
//   1  hi carries the count and the device hash; the room's R carries o[4], ms and the seats' counts; in-game R stays
//      small and the snapshots under 3400 bytes
//   2  stake + consent: a guest who cannot cover the stake cannot ready (button off, a forced rd refused); a stake change
//      un-readies (both sides, the guest told); an rd for the old stake is refused; a forged stake at 시작! holds nothing
//   4  nothing held during 3-2-1; at "시작!" everyone holds s + 6 once; the countdown says "트로피 10개씩 걸어요!"
//   5  the result: one 'tro' per guest, counts as troTable says, every guest answers 'cup' + m, a replay changes nothing,
//      the podium rows agree everywhere, cups fly from the losers, the lines flip
//   6  한 판 더: blocked (button, Enter) while a guest is short, the host's note says so; then a new match id, a new hold
//      +  a hostile result (base -999) costs exactly s + 6; an early result without fast is not applied -> wait -> refund
//   7  leavers: 나가기 mid-match = gg + forfeit, its stake in the winner's pot; a cut link = refund, its stake not in the pot
//   8  the host leaves mid-match: guests refunded.  9  the host's 방으로 mid-match: the host forfeits, guests refunded
//   10 1v1: leaving during 3-2-1 is free; 승급 on the podium; a walkover after 나가기 pays; after a cut link it is void
//   11 no allowBc -> 연습 경기 (q 1): nothing changes.  3  two frames sharing one store -> q 2: nothing changes
//   12 co-op: a game over in the 4th 탕 gives every frame +1; practice co-op gives nothing
// Screenshot scenes (?shot=room|roomg|count|podfly|podend|prac|friends: the scene's frame fills the window, then "SHOT READY").
// Prints "TROPHYNET PASS|FAIL <name>", "TROPHYNET INFO ..." and "TROPHYNET DONE pass=N fail=M".
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const SHOT = Q.get('shot') || '';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => { if (cond) { pass++; log('TROPHYNET PASS ' + name); } else { fail++; log('TROPHYNET FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); } return !!cond; };
  const info = (s) => log('TROPHYNET INFO ' + s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(pred, ms, stepMs) {
    const t0 = performance.now();
    for (;;) { let v = false; try { v = pred(); } catch (e) { v = false; } if (v) return v; if (performance.now() - t0 > ms) return false; await sleep(stepMs || 25); }
  }
  try { PG.debug.G.manual = true; } catch (e) { /* ignore */ }
  document.body.style.background = '#061518';
  const bytes = (o) => new TextEncoder().encode(JSON.stringify(o)).length;

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
        if (!(await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.debug.tro && w.PG.Net, 15000))) { reject(new Error('no PG ' + i)); return; }
        clearTimeout(t);
        const fr = { i, w, el: f, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, T: w.PG.debug.tro, tros: [], errors: [] };
        w.addEventListener('error', (e) => { fr.errors.push(e.message); fail++; log('TROPHYNET frame ' + i + ' error: ' + e.message + ' @' + e.lineno); });
        fr.T.ns('f' + i); fr.T.allowBc(true); fr.T.fast(true); fr.T.set({ t: 100 }); fr.T.away(false);
        frames.push(fr); resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  const S = (fr) => fr.D.getState();
  const N = (fr) => fr.mp.state();
  const TS = (fr) => fr.T.state();
  const doc = (fr, id) => fr.w.document.getElementById(id);
  const slotOf = (fr) => N(fr).mySlot;
  const idOfSlot = (fr, slot) => { const p = fr.mp.session().peers().find((q) => q.slot === slot); return p ? p.id : null; };
  const hostIdOf = (fr) => fr.mp.session().peers().find((p) => p.host).id;
  const counts = (F) => F.map((f) => TS(f).t);
  // every 'tro' a guest's session receives (for "one per guest")
  function watchTro(fr) { const s = fr.mp.session(); if (s && s !== fr.watched) { fr.watched = s; s.onMessage((from, m) => { if (m && m.t === 'tro') fr.tros.push(m); }); } }
  const NICKS = ['방장', '까삐', '펭펭'], CHARS = ['duck', 'capy', 'penguin'];
  let code = null;
  async function host(H, opts) {
    code = await H.mp.host(Object.assign({ mode: 'battle', nick: NICKS[0], char: CHARS[0], arena: 0, time: 2, perks: true, intrusion: false, bet: 10 }, opts || {}));
    return code;
  }
  // (joined = the host's room info arrived: only then does the guest know the stake it readies for - a ready sent
  // before it is for the stake the guest still had, and the host refuses it when that is not the room's)
  async function join(g) { const r = await g.mp.join(code, { nick: NICKS[g.i], char: CHARS[g.i] }); watchTro(g); await until(() => N(g).screen === 'room' && N(g).roster.length > 0, 4000); return r; }
  async function room(F, opts) {
    await host(F[0], opts);
    for (const g of F.slice(1)) await join(g);
    return until(() => N(F[0]).roster.length === F.length && F.every((f) => N(f).screen === 'room' && N(f).roster.length === F.length), 8000);
  }
  async function readyAll(F) { for (const g of F.slice(1)) g.mp.ready(true); return until(() => N(F[0]).canStart, 6000); }
  // start and wait for "시작!": playing everywhere and (ranked) everyone holding
  async function start(F, holds) {
    F[0].mp.start();
    await until(() => F.every((f) => S(f).phase === 'countdown' || S(f).phase === 'playing'), 6000);
    const ok1 = await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online), 8000);
    if (holds !== false) await until(() => F.every((f) => TS(f).esc.some((e) => e.st === 'open')), 4000);
    for (const f of F) f.D.setInvincible(true);
    const hg = F[0].G; hg.enemies.length = 0; if (hg.battle) { hg.battle.enemyT = 1e9; hg.battle.powerT = 1e9; }
    return ok1;
  }
  function setScores(H, list) { for (const [slot, sc] of list) { const p = H.G.players.find((q) => q.slot === slot); if (p) { p.score = sc; p.kos = 0; p.koed = 0; } } }
  async function finish(F, list) {
    setScores(F[0], list); F[0].D.setTimeLeft(0.02);
    return until(() => F.every((f) => S(f).phase === 'podium'), 8000);
  }
  const midOf = (H) => TS(H).ms + '.' + N(H).gid;
  async function toRoom(F) { F[0].mp.toRoom(); return until(() => F.every((f) => N(f).screen === 'room'), 6000); }
  function mute(fr, on) {
    const P = fr.w.BroadcastChannel.prototype;
    if (on) { if (!fr.post) fr.post = P.postMessage; P.postMessage = function () {}; } else if (fr.post) { P.postMessage = fr.post; fr.post = null; }
  }
  function key(fr, code) { fr.w.dispatchEvent(new fr.w.KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true })); fr.w.dispatchEvent(new fr.w.KeyboardEvent('keyup', { code, key: code, bubbles: true })); }

  // ---------------------------------------------------------------- the main run
  async function main() {
    const F = [await frame(0), await frame(1), await frame(2)];
    const [H, A, B] = F;
    // ---- 1. the room
    if (!ok('room: a battle room with 3 players (stake 10)', await room(F, { bet: 10 }))) return;
    await until(() => N(H).roster.every((r) => r.cup === 100) && N(A).roster.every((r) => r.cup === 100), 4000);
    const hr = N(H).roster;
    ok('hi: every guest reported its count (100) and its device hash for this room', hr.length === 3 && hr.every((r) => r.cup === 100) && hr.filter((r) => !r.host).every((r) => /^[0-9a-z]{6}$/.test(r.d)) && hr[1].d !== hr[2].d, hr);
    const R0 = N(H).tro.R;
    ok('R (room): o[4] = the stake, ms = the series id, every seat\'s count', R0 && R0.o[4] === 10 && /^[0-9a-z]{6}$/.test(R0.ms) && !('q' in R0) && R0.p.every((e) => e.length === 5 && e[4] === 100), R0);
    info('R in the room phase: ' + bytes(R0) + ' bytes');
    ok('guests see every seat\'s count and the ranked series', N(B).roster.every((r) => r.cup === 100) && N(B).tro.q === 0 && N(B).tro.ms === R0.ms && N(B).tro.stake === 10, N(B).tro);

    // ---- 2. stake and consent
    H.mp.setOpts({ bet: 20 }); B.T.set({ t: 10 });
    await until(() => N(B).tro.stake === 20, 3000); await sleep(100);
    const rb = doc(B, 'pg-ready');
    ok('consent: a guest who cannot cover 20 cannot ready (button off, "트로피 부족")', rb.disabled && rb.textContent === '트로피 부족' && B.mp.ready(true) === false && /트로피가 모자라요/.test(doc(B, 'pg-room-msg').textContent), [rb.disabled, rb.textContent, doc(B, 'pg-room-msg').textContent]);
    B.mp.session().send(hostIdOf(B), { t: 'rd', on: 1, b: 20, cu: 10 });
    await until(() => N(H).roster[2].cup === 10, 3000); await sleep(100);
    ok('consent: a forced rd from a guest short of the stake is refused (host: 트로피 부족, cannot start)', !N(H).roster[2].ready && !N(H).canStart && /트로피 부족/.test(doc(H, 'pg-room-players').textContent) && /트로피가 모자란 친구가 있어요/.test(doc(H, 'pg-room-msg').textContent), [N(H).roster[2], doc(H, 'pg-room-msg').textContent]);
    B.T.set({ t: 100 });
    H.mp.setOpts({ bet: 5 }); await until(() => N(A).tro.stake === 5, 3000);
    A.mp.ready(true); await until(() => N(H).roster[1].ready, 3000);
    ok('consent: a guest readies for 5', N(H).roster[1].ready && TS(A).agreed === 5);
    H.mp.setOpts({ bet: 10 });
    ok('consent: the host changes the stake to 10 -> that guest is un-readied at once on the host', !N(H).roster[1].ready);
    await until(() => !N(A).ready, 3000);
    ok('consent: ... and on the guest, who is told (걸기가 바뀌었어요: 10개씩 · 다시 준비해 주세요)', !N(A).ready && TS(A).agreed === -1 && doc(A, 'pg-room-msg').textContent === '걸기가 바뀌었어요: 10개씩 · 다시 준비해 주세요', [N(A).ready, doc(A, 'pg-room-msg').textContent]);
    A.mp.session().send(hostIdOf(A), { t: 'rd', on: 1, b: 5, cu: 100 });
    await sleep(300);
    ok('consent: an rd for the old stake (b 5) arriving after the switch is refused', !N(H).roster[1].ready);
    ok('stake: the room shows the stake badge and the rules line for 3 players at 10', !doc(H, 'pg-room-bet').hidden && doc(H, 'pg-room-bet').textContent === '10개씩' &&
      /모두 10개씩 걸고 1등이 다 가져요: 1등 \+32 · 2등 -7 · 3등 -16/.test(doc(H, 'pg-room-rules').textContent), doc(H, 'pg-room-rules').textContent);
    // ---- 4. 시작: nothing during 3-2-1, s + 6 at "시작!"
    if (!ok('ready at 10', await readyAll(F))) return;
    H.mp.start();
    await until(() => S(B).phase === 'countdown', 5000);
    const subs = new Set(); let held = false;
    while (S(B).phase === 'countdown' || S(H).phase === 'countdown') {
      const m = doc(B, 'pg-banner-main').textContent; if ((m === '2' || m === '1') && !doc(B, 'pg-banner').hidden) subs.add(doc(B, 'pg-banner-sub').textContent);
      if (S(H).phase === 'countdown' && F.some((f) => TS(f).esc.length || TS(f).t !== 100)) held = true;   // (while the host still counts)
      if (S(H).phase === 'playing') break;
      await sleep(20);
    }
    ok('시작: nothing is held during 3-2-1', !held);
    ok('시작: the countdown says "트로피 10개씩 걸어요!"', subs.has('트로피 10개씩 걸어요!'), [...subs]);
    await until(() => F.every((f) => TS(f).esc.length === 1), 4000);
    const mid1 = midOf(H);
    ok('시작: at "시작!" every frame holds 16 (s + 6) once, for this match id', F.every((f) => TS(f).esc.length === 1 && TS(f).esc[0].h === 16 && TS(f).esc[0].m === mid1 && TS(f).t === 84) && TS(H).match && TS(H).match.mid === mid1, F.map((f) => [TS(f).t, TS(f).esc]));
    for (const f of F) f.D.setInvincible(true);
    H.G.enemies.length = 0; H.G.battle.enemyT = 1e9; H.G.battle.powerT = 1e9;
    await sleep(400);
    const Rg = N(H).tro.R;
    ok('R (game): no seat counts, ms kept, small (' + bytes(Rg) + ' <= 292 bytes)', Rg && Rg.p.every((e) => e.length === 4) && Rg.ms === R0.ms && bytes(Rg) <= 292, Rg);
    // ---- 5. the result
    if (!ok('finish: the battle ends (host 1st, A 2nd, B 3rd)', await finish(F, [[0, 300], [1, 200], [2, 100]]))) return;
    await until(() => F.every((f) => TS(f).esc.length === 0) && A.tros.length && B.tros.length, 4000);
    ok('result: one tro per guest', A.tros.length === 1 && B.tros.length === 1 && A.tros[0].m === mid1, [A.tros.length, B.tros.length]);
    ok('result: counts as troTable says: +32 / -7 / -16 -> 132 / 93 / 84', same(counts(F), [132, 93, 84]), counts(F));
    ok('result: games / wins counted (host 1 win)', TS(H).w === 1 && TS(H).g === 1 && TS(A).w === 0 && TS(A).g === 1 && TS(B).g === 1);
    await until(() => N(H).roster.filter((r) => !r.host).every((r) => r.cupM === mid1), 3000);
    ok('result: every guest answered with its count for this match (cup + m)', N(H).roster[1].cup === 93 && N(H).roster[2].cup === 84 && N(H).roster.filter((r) => !r.host).every((r) => r.cupM === mid1), N(H).roster);
    A.T.apply(A.tros[0]);
    ok('result: a replayed tro changes nothing', TS(A).t === 93 && TS(A).g === 1);
    const pods = F.map((f) => TS(f).pod);
    const netOf = (p, slot) => { const r = p && p.rows.find((x) => x.slot === slot); return r ? r.net : null; };
    ok('podium: the rows agree on every screen (slot -> change)', pods.every((p) => p && p.kind === 'win' && [0, 1, 2].every((sl) => netOf(p, sl) === [32, -7, -16][sl])), pods);
    ok('podium: cups fly from the losers (1 for -7, 2 for -16)', await until(() => TS(H).pod.cups === 3 && TS(B).pod.cups === 3, 3000), [TS(H).pod, TS(B).pod]);
    await until(() => F.every((f) => f.G.podium && f.G.podium.t > TS(f).pod.flipAt + 25 && TS(f).pod.flipAt > 0), 6000);
    ok('podium: every cup landed, then the lines flipped (and counted up)', F.every((f) => TS(f).pod.landed === 3 && TS(f).pod.flipAt >= TS(f).pod.t0 + 40), F.map((f) => TS(f).pod));
    ok('podium: the sr summary says my change', /내 트로피 \+32개, 지금 132개/.test(doc(H, 'pg-podium-sum').textContent) && /내 트로피 -16개, 지금 84개/.test(doc(B, 'pg-podium-sum').textContent), [doc(H, 'pg-podium-sum').textContent]);
    ok('podium: the guest\'s wait line keeps the stake ("다음 판도 10개씩")', /다음 판도 10개씩/.test(doc(A, 'pg-podium').querySelector('[data-net-wait]').textContent));
    // ---- 6. 한 판 더 gate
    ok('rematch: open once every guest reported', N(H).canStart !== undefined && !doc(H, 'pg-podium-again').disabled && H.T.canRematch());
    B.mp.session().send(hostIdOf(B), { t: 'cup', cu: 5, m: mid1 });
    await until(() => doc(H, 'pg-podium-again').disabled, 3000);
    const gid1 = N(H).gid;
    key(H, 'Enter'); await sleep(200);
    doc(H, 'pg-podium-again').click(); await sleep(200);
    ok('rematch: blocked while a guest is short (button off; Enter / the button do nothing)', doc(H, 'pg-podium-again').disabled && N(H).gid === gid1 && S(H).phase === 'podium');
    ok('rematch: the host\'s note says so', !doc(H, 'pg-podium-note').hidden && doc(H, 'pg-podium-note').textContent === '트로피가 모자란 친구가 있어요 · 방으로 가서 걸기를 바꿔요', doc(H, 'pg-podium-note').textContent);
    B.mp.session().send(hostIdOf(B), { t: 'cup', cu: 84, m: mid1 });
    await until(() => !doc(H, 'pg-podium-again').disabled, 3000);
    A.tros.length = 0; B.tros.length = 0;
    doc(H, 'pg-podium-again').click();
    await until(() => N(H).gid === gid1 + 1, 3000);
    await until(() => F.every((f) => S(f).phase === 'playing') && F.every((f) => TS(f).esc.length === 1), 9000);
    const mid2 = midOf(H);
    ok('rematch: a new match id and a new hold everywhere', mid2 !== mid1 && F.every((f) => TS(f).esc[0] && TS(f).esc[0].m === mid2 && TS(f).esc[0].h === 16), F.map((f) => TS(f).esc));
    for (const f of F) f.D.setInvincible(true);
    H.G.enemies.length = 0; H.G.battle.enemyT = 1e9; H.G.battle.powerT = 1e9;
    // a hostile host (base -999 for slot 1) / an early result for a guest without fast
    H.mp.session().send(idOfSlot(H, 1), { t: 'tro', m: mid2, n: 3, s: 10, r: [[1, 1, -999, 0, 0]] });
    B.T.fast(false);
    H.mp.session().send(idOfSlot(H, 2), { t: 'tro', m: mid2, n: 3, s: 10, r: [[2, 1, 14, 30, 0]] });
    await until(() => TS(A).esc.length === 0, 3000); await sleep(200);
    ok('hostile: a result with base -999 costs exactly s + 6 (93 -> 77)', TS(A).t === 77, TS(A).t);
    ok('early: a result before the battle clock could run is not applied (the hold stays open)', TS(B).esc.length === 1 && TS(B).esc[0].st === 'open' && TS(B).t === 68, TS(B));
    await finish(F, [[0, 300], [1, 200], [2, 100]]);
    await until(() => TS(H).esc.length === 0 && TS(B).esc.length === 1 && TS(B).esc[0].st === 'wait', 4000);
    ok('early: the real (still early) result is not applied either -> the hold waits at the podium', TS(B).esc[0] && TS(B).esc[0].st === 'wait' && TS(H).t === 164, [TS(B).esc, TS(H).t]);
    B.T.expire();
    ok('early: ... and is refunded when the wait runs out (68 -> 84)', TS(B).t === 84 && TS(B).esc.length === 0 && TS(B).g === 1, TS(B));
    B.T.fast(true);
    // ---- 7. leavers: 나가기 (gg) vs a cut link
    if (!ok('room again (방으로)', await toRoom(F))) return;
    ok('room: the guests must ready again', !N(H).roster[1].ready && !N(H).roster[2].ready && !N(A).ready);
    await readyAll(F);
    await start(F);
    const mid3 = midOf(H), before3 = counts(F);
    B.mp.leave();                                                    // 나가기 mid-match
    await until(() => N(H).roster.length === 2 && TS(H).match && TS(H).match.gg.includes(2), 4000);
    ok('leave: 나가기 mid-match = gg to the host + forfeit (84 -> 68, a game)', TS(B).t === before3[2] && TS(B).esc.length === 0 && TS(B).g === 2 && TS(H).match.gg.includes(2), [TS(B).t, TS(B).g, TS(H).match]);
    ok('leave: the leaver\'s friends panel says it counted as a loss', /이번 판은 진 걸로 쳤어요/.test(doc(B, 'pg-friends-err').textContent), doc(B, 'pg-friends-err').textContent);
    await finish([H, A], [[0, 300], [1, 200]]);
    await until(() => TS(A).esc.length === 0, 4000);
    ok('leave: its stake is in the winner\'s pot: host +32 (12 + 30 - 10), A -7', TS(H).t === before3[0] + 16 + 32 && TS(A).t === before3[1] + 16 - 7, [before3, counts([H, A])]);
    await toRoom([H, A]);
    await join(B); await until(() => N(H).roster.length === 3, 4000);
    await readyAll(F);
    await start(F);
    const before4 = counts(F).map((t) => t + 16);
    mute(A, true);                                                   // A's link goes silent (no gg)
    const dropped = await until(() => N(A).screen === 'friends', 20000, 100);
    mute(A, false);
    ok('cut: the guest whose link is cut is dropped and told', !!dropped && /연결이 끊겼어요/.test(N(A).error || ''), [N(A).screen, N(A).error]);
    ok('cut: ... and gets its trophies back (present: refund)', TS(A).t === before4[1] && TS(A).esc.length === 0, [TS(A).t, before4[1]]);
    ok('cut: its friends panel says so', /걸었던 트로피를 돌려받았어요/.test(doc(A, 'pg-friends-err').textContent), doc(A, 'pg-friends-err').textContent);
    await finish([H, B], [[0, 300], [2, 100]]);
    await until(() => TS(B).esc.length === 0, 4000);
    ok('cut: its stake is not in the pot: host +22 (12 + 20 - 10), B -7', TS(H).t === before4[0] + 22 && TS(B).t === before4[2] - 7, [before4, counts(F)]);
    // ---- 8. the host leaves mid-match
    await toRoom([H, B]); await join(A); await until(() => N(H).roster.length === 3, 4000);
    await readyAll(F); await start(F);
    const before5 = counts(F).map((t) => t + 16);
    H.mp.leave();                                                    // 로비로 / 처음으로
    await until(() => N(A).screen === 'friends' && N(B).screen === 'friends', 6000);
    ok('host left: the guests are refunded (host_left)', TS(A).t === before5[1] && TS(B).t === before5[2] && TS(A).esc.length === 0 && TS(B).esc.length === 0, [before5, counts(F)]);
    ok('host left: the host itself left on purpose: forfeit', TS(H).t === before5[0] - 16, [TS(H).t, before5[0]]);
    // ---- 9. the host's 방으로 mid-match
    await room(F, { bet: 10 }); await readyAll(F); await start(F);
    const before6 = counts(F).map((t) => t + 16);
    H.mp.toRoom();
    await until(() => F.every((f) => N(f).screen === 'room'), 5000); await sleep(150);
    ok('abort: the host forfeits (its confirm said so) and is told in the room', TS(H).t === before6[0] - 16 && doc(H, 'pg-room-msg').textContent === '이번 판은 진 걸로 쳤어요', [TS(H).t, doc(H, 'pg-room-msg').textContent]);
    ok('abort: the guests wait for a result...', TS(A).esc.length === 1 && TS(A).esc[0].st === 'wait' && TS(B).esc[0] && TS(B).esc[0].st === 'wait');
    A.T.expire(); B.T.expire(); await sleep(100);
    ok('abort: ... then are refunded, and told in the room', TS(A).t === before6[1] && TS(B).t === before6[2] && doc(A, 'pg-room-msg').textContent === '걸었던 트로피를 돌려받았어요', [counts(F), doc(A, 'pg-room-msg').textContent]);
    // ---- 2b. a forged stake at 시작! (a patched host's R says 50 behind the guests' ready for 10): they hold nothing
    await readyAll(F);
    const sess = H.mp.session(), ss = sess.setState;
    // (the forged R keeps o[0..3] and puts 50 at o[4]: o[5], 몬스터 출현, is dropped - a missing o[5] reads as on, the
    // default this match leaves it at; design/distinction.md 3.1)
    sess.setState = function (st) { if (st && st.R && Array.isArray(st.R.o)) st = Object.assign({}, st, { R: Object.assign({}, st.R, { o: st.R.o.slice(0, 4).concat([50]) }) }); return ss.call(this, st); };
    const bf = counts(F);
    H.mp.start();
    await until(() => F.every((f) => S(f).phase === 'playing'), 8000); await sleep(700);
    ok('forged: a stake of 50 the guests never readied for: they hold nothing (practice for them)', TS(A).esc.length === 0 && TS(B).esc.length === 0 && TS(A).t === bf[1] && TS(B).t === bf[2] && TS(H).esc.length === 1, [bf, counts(F)]);
    sess.setState = ss;
    for (const f of F) f.D.setInvincible(true);
    H.G.enemies.length = 0; H.G.battle.enemyT = 1e9; H.G.battle.powerT = 1e9;
    await finish(F, [[0, 100], [1, 300], [2, 200]]); await sleep(500);
    ok('forged: ... and the result does not touch them (host last: -16)', TS(A).t === bf[1] && TS(B).t === bf[2] && TS(H).t === bf[0] - 16, [bf, counts(F)]);
    await toRoom(F);
    // ---- 10. 1v1
    B.mp.leave(); await until(() => N(H).roster.length === 2, 4000);
    const D2 = [H, A];
    await readyAll(D2);
    let b10 = counts(D2);
    H.mp.start();
    await until(() => S(A).phase === 'countdown', 5000);
    A.mp.leave();                                                    // during 3-2-1
    await until(() => N(H).roster.length === 1 && S(H).phase === 'podium', 5000);
    ok('1v1: leaving during 3-2-1 costs nothing (no hold, no result)', same(counts(D2), b10) && !TS(H).esc.length && !TS(A).esc.length && !TS(H).lastRes, [b10, counts(D2)]);
    await toRoom([H]); await join(A); await until(() => N(H).roster.length === 2, 4000);
    H.mp.setOpts({ bet: 0 }); A.T.set({ t: 50, bl: 0 }); await sleep(150);       // (a 견습 who never reached 뽀득 새내기)
    await readyAll(D2); await start(D2);
    await finish(D2, [[0, 100], [1, 300]]);
    await until(() => TS(A).esc.length === 0 && TS(A).pod && TS(A).pod.promo === 1, 4000);
    ok('승급: a 견습 guest (50) wins at stake 0 -> 60, 뽀득 새내기, first time', TS(A).t === 60 && TS(A).bl === 1 && TS(A).pod.promo === 1, TS(A));
    await until(() => doc(A, 'pg-podium-tag').textContent.indexOf('승급!') === 0, 6000);
    ok('승급: the podium title tag turns into "승급! 뽀득 새내기"', doc(A, 'pg-podium-tag').textContent === '승급! 뽀득 새내기' && !doc(A, 'pg-podium-tag').hidden, doc(A, 'pg-podium-tag').textContent);
    await toRoom(D2); H.mp.setOpts({ bet: 10 }); A.T.set({ t: 100 }); await sleep(150);
    await readyAll(D2); await start(D2);
    b10 = counts(D2).map((t) => t + 16);
    A.mp.leave();
    await until(() => S(H).phase === 'podium' && TS(H).esc.length === 0, 5000);
    ok('1v1: the other left on purpose -> 기권승: host +20 (10 + 10)', TS(H).t === b10[0] + 20 && TS(H).pod && TS(H).pod.kind === 'walk' && doc(H, 'pg-podium-tag').textContent === '기권승', [TS(H).t, b10, TS(H).pod]);
    ok('1v1: the leaver lost its hold', TS(A).t === b10[1] - 16);
    await toRoom([H]); await join(A); await until(() => N(H).roster.length === 2, 4000);
    await readyAll(D2); await start(D2);
    b10 = counts(D2).map((t) => t + 16);
    mute(A, true);
    await until(() => S(H).phase === 'podium', 20000, 100);
    await until(() => N(A).screen === 'friends', 6000, 100);
    mute(A, false);
    ok('1v1: the other\'s link cut (no gg) -> void: the host is refunded, its note says so', TS(H).t === b10[0] && TS(H).pod && TS(H).pod.kind === 'void' && doc(H, 'pg-podium-note').textContent === '친구가 나가서 이번 판은 무효예요' && !TS(H).esc.length, [TS(H).t, b10[0], TS(H).pod]);
    ok('1v1: ... and the cut guest is refunded too', TS(A).t === b10[1] && !TS(A).esc.length, [TS(A).t, b10[1]]);
    // ---- 11. without allowBc: 연습 경기 (q 1)
    await toRoom([H]); await join(A); await join(B); await until(() => N(H).roster.length === 3, 4000);
    H.T.allowBc(false); await sleep(200);
    await until(() => N(B).tro.q === 1, 3000);
    ok('q1: bc without allowBc -> 연습 경기 everywhere (badge, rules)', N(B).tro.q === 1 && !doc(B, 'pg-room-prac').hidden && /이 브라우저의 탭끼리는 트로피가 바뀌지 않아요/.test(doc(H, 'pg-room-rules').textContent), N(B).tro);
    let bq = counts(F);
    await readyAll(F);
    H.mp.start();
    await until(() => S(A).phase === 'countdown', 5000);
    const subs2 = new Set();
    while (S(A).phase === 'countdown') { const m = doc(A, 'pg-banner-main').textContent; if (m === '2' || m === '1') subs2.add(doc(A, 'pg-banner-sub').textContent); await sleep(20); }
    ok('q1: the countdown says "연습 경기 · 트로피 없음"', subs2.has('연습 경기 · 트로피 없음'), [...subs2]);
    await until(() => F.every((f) => S(f).phase === 'playing'), 5000); await sleep(300);
    await finish(F, [[0, 300], [1, 200], [2, 100]]); await sleep(500);
    ok('q1: nobody\'s count changed, nobody held; the podium says 연습', same(counts(F), bq) && F.every((f) => !TS(f).esc.length) && doc(A, 'pg-podium-tag').textContent === '연습', [bq, counts(F), doc(A, 'pg-podium-tag').textContent]);
    // ---- 3. two frames sharing one store: q 2
    H.T.allowBc(true);
    await toRoom(F);
    B.mp.leave(); await until(() => N(H).roster.length === 2, 4000);
    B.T.ns('f1'); B.T.allowBc(true); B.T.fast(true); B.T.away(false);   // (A's store)
    await join(B); await until(() => N(H).roster.length === 3, 4000); await sleep(200);
    await until(() => N(B).tro.q === 2, 3000);
    ok('q2: two players from one device\'s store -> 연습 경기 (q 2), said in the rules and the badge', N(H).tro.q === 2 && N(B).tro.q === 2 && !doc(A, 'pg-room-prac').hidden && /같은 기기에서 들어온 친구가 있어요/.test(doc(H, 'pg-room-rules').textContent), [N(H).tro, N(B).tro, doc(H, 'pg-room-rules').textContent]);
    bq = counts(F);
    await readyAll(F); await start(F, false);
    await finish(F, [[0, 300], [1, 200], [2, 100]]); await sleep(500);
    ok('q2: nobody\'s count changed', same(counts(F), bq), [bq, counts(F)]);
    await toRoom(F);
    B.mp.leave(); await until(() => N(H).roster.length === 2, 4000);
    B.T.ns('f2'); B.T.allowBc(true); B.T.fast(true); B.T.away(false);
    await join(B); await until(() => N(H).roster.length === 3, 4000);
    // ---- 12. co-op: 목욕 보너스 for everyone (ranked), nothing in practice
    async function coopOver() {
      await readyAll(F); await start(F, false);
      await sleep(400);
      H.D.gotoRound(3); await sleep(600);
      H.G.lives = 0;
      for (const p of H.G.players) H.D.hitPlayer(p.slot);
      return until(() => F.every((f) => S(f).phase === 'gameover'), 20000, 100);
    }
    H.mp.setOpts({ mode: 'coop' }); await sleep(200);
    const bc = counts(F);
    ok('coop: everyone reaches 목욕 끝 (game over in the 4th 탕)', await coopOver());
    await sleep(300);
    ok('coop: every frame gets the same +1 and loses nothing', same(counts(F), bc.map((t) => t + 1)) && F.every((f) => !doc(f, 'pg-over-trow').hidden && doc(f, 'pg-over-tro').querySelector('span').textContent === '+1'), [bc, counts(F)]);
    await toRoom(F);
    H.T.allowBc(false); await until(() => N(B).tro.q === 1, 3000);
    const bc2 = counts(F);
    await coopOver(); await sleep(300);
    ok('coop: practice co-op gives nothing', same(counts(F), bc2) && F.every((f) => doc(f, 'pg-over-trow').hidden), [bc2, counts(F)]);
    H.T.allowBc(true);
    const sn = N(H).snap;
    ok('snapshots stayed under 3400 bytes (max ' + sn.max + ')', sn.max > 0 && sn.max <= 3400 && sn.refused === 0, sn);
    ok('no page errors in any frame', F.every((f) => !f.errors.length), F.map((f) => f.errors));
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ---------------------------------------------------------------- screenshots (?shot=...)
  function fill(fr) {
    for (const f of frames) f.el.style.visibility = f === fr ? 'visible' : 'hidden';
    fr.el.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;z-index:99;background:#0a2327';
    if (innerWidth < 600) { try { fr.w.dispatchEvent(new Event('touchstart')); } catch (e) { /* ignore */ } }
  }
  async function shot(name) {
    const F = [await frame(0), await frame(1), await frame(2)];
    const [H, A, B] = F;
    if (name === 'friends') {
      A.T.set({ t: 268 }); A.mp.setNick('까삐'); A.mp.openFriends();
      fill(A); await sleep(900);
      log('SHOT READY ' + name); return;
    }
    if (name === 'prac') H.T.allowBc(false);
    await room(F, { bet: name === 'prac' ? 0 : 10 });
    H.T.set({ t: 612 }); A.T.set({ t: 155 });
    if (name === 'room' || name === 'roomg') {
      B.T.set({ t: 7 }); A.mp.ready(true);
      B.mp.session().send(hostIdOf(B), { t: 'rd', on: 0, b: 10, cu: 7 });
      await sleep(600);
      fill(name === 'room' ? H : B); await sleep(800);
      log('SHOT READY ' + name); return;
    }
    if (name === 'prac') { A.mp.ready(true); await sleep(500); fill(A); await sleep(800); log('SHOT READY ' + name); return; }
    if (name === 'podend') { A.T.set({ t: 52 }); H.mp.setOpts({ bet: 5 }); await sleep(200); }
    await readyAll(F);
    if (name === 'count') {
      fill(B); H.mp.start();
      await until(() => doc(B, 'pg-banner-main').textContent === '2' && !doc(B, 'pg-banner').hidden, 6000, 10);
      await sleep(250); log('SHOT READY ' + name); return;
    }
    await start(F);
    if (name === 'podfly' || name === 'podend') {
      const who = name === 'podfly' ? H : A;
      fill(who);
      await finish(F, name === 'podfly' ? [[0, 2400], [1, 1500], [2, 600]] : [[0, 900], [1, 2800], [2, 400]]);
      // (mid-flight: a few frames after T0 - the capture lands ~15 f after this line; after the count-up: flipAt planned
      // first, then its 20 f count-up and the 승급 tag 20 f later)
      await until(() => TS(who).pod && who.G.podium && TS(who).pod.t0 > 0 && (name === 'podfly' ? who.G.podium.t >= TS(who).pod.t0 + 4 : TS(who).pod.flipAt > 0 && who.G.podium.t >= TS(who).pod.flipAt + 60), 12000, 5);
      log('SHOT READY ' + name); return;
    }
    log('SHOT READY ' + name);
  }

  (async () => {
    if (SHOT) { try { await shot(SHOT); } catch (e) { log('SHOT error ' + (e && e.stack)); log('SHOT READY ' + SHOT); } return; }
    try { await main(); } catch (e) { fail++; log('TROPHYNET FAIL main threw ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); }
    log('TROPHYNET DONE pass=' + pass + ' fail=' + fail);
  })();
})();
