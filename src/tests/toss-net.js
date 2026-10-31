// 앱인토스 online (design/toss.md 15.3): frames of the Toss page (C:/Temp/bogeul/toss-fx/: src/ait.js over the fake SDK)
// on PG.Net 'bc', in REAL time. Each frame has its own fake SDK with its own game key (?k=A / ?k=B).
//   node tools/serve.js   (background)
//   node tools/run-chrome.js http://localhost:8765/test-toss-net.html - 1200 900 rt300000 "TOSSNET DONE"
// Every frame: tro.ns('n' + i), tro.allowBc(true) and shop.allowBc(true) (bc tabs count as real players here).
//   1  boot: the bridge on in every frame, the key ok (A, B), the 'peer' host id 'ppodeuk-t-' + code there and
//      'ppodeuk-' + code on the artifact page (this one)
//   2  a battle A / B (the host asked for a stake of 20): no stake anywhere, the guest's summary says 친선 경기, the rules
//      친선 경기예요…, the countdown 친선 경기 · 트로피 없음 on both, no 'tro' message sent or received, both trophy stores
//      unchanged (t / w / g / ko / de / esc), every page's coins = the host-side coinBattle, the podium tag 친선 경기,
//      Android back on the podium arms 로비로 first (a friend is in the room)
//   3  the same with keys A / A (one Toss account on two phones): the rules 연습 경기예요: 같은 토스 계정으로…, the countdown
//      연습 경기 · 비누 코인 없음, coins 0, the tag 연습, trophies unchanged
//   4  a 3판 party A / B (the host's stake of 20 still asked for): coins paid by places, trophies unchanged
//   5  the relay (frames with ?relay= to serve.js's local relay, no ?net=, no PeerJS: 'ws' or nothing): the Toss room in
//      the relay's space t (t:<code>); a web page (space w) cannot join it, a Toss page cannot join a web room; then a
//      friendly battle A / B over ws as in 2
// Prints "TOSSNET PASS|FAIL <name>", "TOSSNET INFO ..." and "TOSSNET DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, inf) => { if (cond) { pass++; log('TOSSNET PASS ' + name); } else { fail++; log('TOSSNET FAIL ' + name + (inf !== undefined ? ' :: ' + JSON.stringify(inf) : '')); } return !!cond; };
  const info = (s) => log('TOSSNET INFO ' + s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(pred, ms, stepMs) { const t0 = performance.now(); for (;;) { let v = false; try { v = pred(); } catch (e) { v = false; } if (v) return v; if (performance.now() - t0 > ms) return false; await sleep(stepMs || 20); } }
  try { PG.debug.G.manual = true; } catch (e) { /* ignore */ }
  document.body.style.background = '#061518';
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ---------------------------------------------------------------- frames
  // (q: how the frame goes online - this browser's tabs by default, or ?relay= to serve.js's local relay)
  function frame(i, k, q) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'toss-fx/index.html?' + (q || 'net=bc&lat=8&jit=4&drop=0') + '&k=' + k + '&frame=' + i;
      f.style.cssText = 'position:fixed;left:' + (i % 2) * 600 + 'px;top:' + (i >> 1) * 450 + 'px;width:600px;height:450px;border:0;background:#0a2327';
      const t = setTimeout(() => reject(new Error('frame ' + i)), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        if (!(await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.debug.ait && w.PG.Net && w.PG_FAKE, 15000))) { reject(new Error('no PG ' + i)); return; }
        clearTimeout(t);
        const fr = { i, k, w, el: f, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, T: w.PG.debug.tro, P: w.PG.debug.party, SH: w.PG.debug.shop, A: w.PG.debug.ait, F: w.PG_FAKE, got: [], sent: [] };
        w.addEventListener('error', (e) => { fail++; log('TOSSNET frame ' + i + ' error: ' + e.message + ' @' + e.lineno); });
        fr.T.ns('n' + i); fr.T.allowBc(true); fr.SH.allowBc(true); fr.T.set({ t: 100 }); fr.T.away(false);
        if (fr.P && fr.P.fast) fr.P.fast(true);
        await until(() => fr.A.state().st === 'ok', 5000);
        resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  const N = (fr) => fr.mp.state();
  const S = (fr) => fr.D.getState();
  const SS = (fr) => fr.SH.state();
  const doc = (fr, id) => fr.w.document.getElementById(id);
  const slotOf = (fr) => N(fr).mySlot;
  const TRO_KEYS = ['t', 'w', 'g', 'ko', 'de', 'esc'];
  const tro = (fr) => { const s = fr.T.state(); const o = {}; for (const k of TRO_KEYS) o[k] = s[k]; return o; };
  // spies: every message a guest receives, every message a host sends (types only)
  function spy(fr) {
    const s = fr.mp.session(); if (!s || s._spied) return;
    s._spied = true;
    try { s.onMessage((from, m) => { fr.got.push(m && m.t); }); } catch (e) { /* ignore */ }
    const o = s.send; s.send = function (to, m) { fr.sent.push(m && m.t); return o.apply(this, arguments); };
  }
  let code = null;
  const NICKS = ['방장', '까삐', '펭펭'], CHARS = ['duck', 'capy', 'penguin'];
  async function host(H, mode, extra) {
    code = await H.mp.host(Object.assign({ mode, nick: NICKS[0], char: CHARS[0], arena: 0, time: 2, perks: true, monsters: false, intrusion: false, rapid: true }, extra || {}));
    await until(() => N(H).screen === 'room', 4000);
    spy(H);
    return code;
  }
  async function join(g) { await g.mp.join(code, { nick: NICKS[g.i] || 'G', char: CHARS[g.i] || 'cat' }); await until(() => N(g).screen === 'room' && N(g).roster.length > 0, 4000); spy(g); }
  const press = (fr, a, down) => fr.D.press(a, down, slotOf(fr));
  async function blows(fr, n) { for (let k = 0; k < n; k++) { press(fr, 'shoot', true); await sleep(50); press(fr, 'shoot', false); await sleep(460); } }
  async function start(F) {
    F[0].mp.start();
    await until(() => F.every((f) => S(f).phase === 'countdown' || S(f).phase === 'playing'), 6000);
    const subs = F.map((f) => f.A.count());
    const ok1 = await until(() => F.every((f) => S(f).phase === 'playing' && S(f).online), 8000);
    for (const f of F) f.D.setInvincible(true);
    const hg = F[0].G; hg.enemies.length = 0; if (hg.battle) { hg.battle.enemyT = 1e9; hg.battle.powerT = 1e9; }
    return { ok: ok1, subs };
  }
  const rulesOf = (fr) => [...doc(fr, 'pg-room-rules').querySelectorAll('li')].map((l) => l.textContent);
  // every text a player of frame fr can see now (the font warm-up aside), and the aria-labels
  function seen(fr) {
    const d = fr.w.document, out = [], w = d.createTreeWalker(d.body, 4);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement, t = n.nodeValue.trim(); if (!el || !t || el.closest('#pg-fontwarm, script, style')) continue;
      if (!el.getClientRects().length || fr.w.getComputedStyle(el).visibility === 'hidden') continue;
      out.push(t);
    }
    for (const el of d.querySelectorAll('[aria-label]')) if (el.getClientRects().length && !el.closest('#pg-fontwarm')) out.push(el.getAttribute('aria-label'));
    return out.join('\n');
  }

  async function battle(F, label, practice) {
    const [H, B] = F;
    const tx = H.A.tx();
    for (const f of F) f.got.length = 0, f.sent.length = 0;
    const t0 = F.map(tro), c0 = F.map((f) => SS(f).co);
    ok(`${label}: the room's practice kind (q) is ${practice ? 2 : 0} on the host`, N(H).tro.q === (practice ? 2 : 0), N(H).tro.q);
    ok(`${label}: the host asked for a stake of 20, the room has none (stakeNow 0 everywhere)`, N(H).opts.bet === 20 && F.every((f) => N(f).tro.stake === 0), F.map((f) => [N(f).opts.bet, N(f).tro.stake]));
    const want0 = practice ? tx.same : tx.friendly;
    await until(() => F.every((f) => rulesOf(f)[0] === want0), 3000);
    ok(`${label}: the rules' first line on every page: ${want0}`, F.every((f) => rulesOf(f)[0] === want0), F.map(rulesOf));
    const sum = doc(B, 'pg-room-sum').textContent;
    ok(`${label}: the guest's summary says 친선 경기 (no 트로피 …개씩 / 안 걸기)`, /친선 경기/.test(sum) && !/트로피|걸기/.test(sum), sum);
    ok(`${label}: no stake row, no 트로피 부족 / 안 걸고 mark on any page`, F.every((f) => !doc(f, 'pg-room-opts').querySelector('[data-bet]') && !/트로피 부족|안 걸고/.test(doc(f, 'pg-room').innerText)));
    B.mp.ready(true); await until(() => N(H).canStart, 4000);
    const st = await start(F);
    const wantC = practice ? tx.countQ : tx.count;
    ok(`${label}: the countdown's 2 / 1 line on every page: ${wantC} (dim)`, st.subs.every((c) => c.sub === wantC && c.cls === ' prac'), st.subs);
    if (!ok(`${label}: playing on both pages`, st.ok, F.map(S).map((s) => s.phase))) return;
    ok(`${label}: no TRO.match / hold at 시작!`, F.every((f) => f.T.state().match === null && f.T.state().esc.length === 0));
    await Promise.all(F.map((f) => blows(f, 5)));
    await sleep(300);
    const shots = F.map((f) => SS(f).shots);
    for (const [slot, sc] of [[0, 900], [1, 2400]]) { const p = H.G.players.find((q) => q.slot === slot); p.score = sc; p.kos = 0; p.koed = 0; }
    H.D.setTimeLeft(1);
    const pod = await until(() => F.every((f) => S(f).phase === 'podium'), 8000);
    if (!ok(`${label}: the clock runs down: both pages on the podium`, !!pod, F.map((f) => S(f).phase))) return;
    await sleep(600);
    ok(`${label}: no 'tro' message was sent or received`, F.every((f) => !f.got.includes('tro') && !f.sent.includes('tro')), F.map((f) => [f.sent.filter((t) => t === 'tro').length, f.got.filter((t) => t === 'tro').length]));
    ok(`${label}: both trophy stores unchanged in t / w / g / ko / de / esc`, F.every((f, k) => same(tro(f), t0[k])), F.map(tro));
    const tagW = practice ? '연습' : tx.tag;
    ok(`${label}: the podium tag on both: ${tagW} (is-prac)`, F.every((f) => doc(f, 'pg-podium-tag').textContent === tagW && doc(f, 'pg-podium-tag').classList.contains('is-prac') && !doc(f, 'pg-podium-tag').hidden), F.map((f) => doc(f, 'pg-podium-tag').textContent));
    await until(() => F.every((f) => SS(f).pod || practice), 3000);
    if (practice) {
      ok(`${label}: practice pays no coins on either page`, F.every((f, k) => SS(f).co === c0[k]), F.map((f, k) => SS(f).co - c0[k]));
    } else {
      const order = H.G.podium.order.slice(), fin = order.map((s) => { const p = H.G.players.find((q) => q.slot === s); return { slot: s, sc: p.score, k: p.kos, ko: p.koed }; });
      const want = F.map((f, k) => H.SH.battle(2, fin, slotOf(f), 0, 2 * 3600, shots[k], 0));
      const paid = F.map((f) => (SS(f).pod ? SS(f).pod.give - (SS(f).pod.bonus | 0) : -1)), give = F.map((f) => (SS(f).pod ? SS(f).pod.give : -1));
      ok(`${label}: every page paid itself the host-side coinBattle (+ the day bonus: coins as on the web, no trophies)`, same(paid, want) && want.every((x) => x > 0) && F.every((f, k) => SS(f).co === c0[k] + give[k]), { paid, want, give, shots });
    }
    const tt = F.map(seen).join('\n');
    ok(`${label}: no 걸다 / 판돈 / 가져요 about trophies visible on either page`, !/걸[기고어지었]|판돈|가져요/.test(tt), (tt.match(/[^\n]*(걸[기고어지었]|판돈|가져요)[^\n]*/) || [])[0]);
    // Android back on the host's podium with a friend in the room: 로비로's two-press arms first
    const lb = doc(H, 'pg-podium-lobby'), lt = lb.textContent;
    H.F.fire('backEvent'); await sleep(50);
    ok(`${label}: Android back on the host's podium arms 로비로 first (a friend is in the room)`, S(H).phase === 'podium' && lb.textContent !== lt && !!H.mp.session(), [lb.textContent, S(H).phase]);
    await sleep(2700);
    ok(`${label}: ... unconfirmed, it disarms and the room stays`, lb.textContent === lt && !!H.mp.session());
    H.mp.toRoom();
    await until(() => F.every((f) => N(f).screen === 'room'), 6000);
  }

  async function party(F) {
    const [H, B] = F;
    const t0 = F.map(tro), c0 = F.map((f) => SS(f).co);
    H.mp.setOpts({ mode: 'party', rounds: 3 });
    await until(() => F.every((f) => N(f).mode === 'party'), 3000);
    const tx = H.A.tx();
    ok('party: the rules say 친선 경기예요… (no 트로피는 걸지 않아요) on both pages', F.every((f) => rulesOf(f).includes(tx.friendly) && !rulesOf(f).some((l) => /걸지/.test(l))), F.map(rulesOf));
    // (파티 트로피 off, design/party-trophies.md 14: the host's stake of 20 from the battle is still asked for)
    ok('party: the host asks for a stake of 20, yet stakeNow() 0 and no party trophy match on either page', N(H).opts.bet === 20 && F.every((f) => N(f).tro.stake === 0 && f.A.partyOn() === false), F.map((f) => [N(f).opts.bet, N(f).tro.stake, f.A.partyOn()]));
    if (H.P.force) H.P.force(['water', 'crown', 'water']);
    B.mp.ready(true); await until(() => N(H).canStart, 4000);
    H.mp.start();
    // (both players blow bubbles all party long: a 판 pays only the active)
    let on = true;
    const act = (f) => (async () => { while (on) { if (f.P.state().ph === 'playing') await blows(f, 1); else await sleep(100); } })();
    const loops = F.map(act);
    const fin = await until(() => F.every((f) => f.P.state().ph === 'podium'), 150000, 100);
    on = false; await Promise.all(loops);
    if (!ok('party: a 3판 party A / B runs to its final podium on both pages', !!fin, F.map((f) => [S(f).phase, f.P.state().ph]))) return;
    await sleep(800);
    ok('party: coins paid on both pages (by places)', F.every((f, k) => SS(f).co > c0[k]), F.map((f, k) => SS(f).co - c0[k]));
    ok('party: trophies unchanged on both pages', F.every((f, k) => same(tro(f), t0[k])), F.map(tro));
    ok('party: no \'tro\' message', F.every((f) => !f.got.includes('tro') && !f.sent.includes('tro')));
  }

  async function main() {
    const H = await frame(0, 'A'), B = await frame(1, 'B');
    ok('boot: the bridge on in both frames, the key ok (A / B), the gate open', [H, B].every((f) => f.A.state().on && f.A.state().st === 'ok' && f.A.state().hasKey && !f.A.state().gated), [H.A.state(), B.A.state()]);
    ok('boot: the \'peer\' host id is ppodeuk-t- + code in Toss, ppodeuk- + code on the artifact page', H.w.PG.Net.peerId('abcd') === 'ppodeuk-t-abcd' && PG.Net.peerId('abcd') === 'ppodeuk-abcd', [H.w.PG.Net.peerId('abcd'), PG.Net.peerId('abcd')]);
    ok('boot: the two frames\' game keys make different hi.d for one room code; the same key the same', H.A.devHash('qrst') !== B.A.devHash('qrst') && /^[0-9a-z]{6}$/.test(H.A.devHash('qrst')));
    await host(H, 'battle', { bet: 20 });
    await join(B);
    await until(() => N(H).roster.length === 2, 4000);
    await until(() => N(B).roster.length === 2 && N(H).roster.every((r) => r.slot === 0 || r.d), 3000);
    ok('room: two players (A host, B guest)', N(H).roster.length === 2 && N(B).roster.length === 2, [N(H).roster.length, N(B).roster.length]);
    const gd = (N(H).roster.find((r) => r.slot === 1) || {}).d;
    ok('room: the guest\'s hi.d is the FNV of its own key for this code, not the host\'s', gd === B.A.devHash(code) && gd !== H.A.devHash(code), [gd, B.A.devHash(code), H.A.devHash(code), code]);
    await battle([H, B], 'battle A/B', false);
    // ---- the same Toss account on a second page: B leaves, a page with key A joins
    B.mp.leave(); await until(() => N(H).roster.length === 1, 4000);
    const A2 = await frame(2, 'A');
    await join(A2);
    await until(() => N(H).roster.length === 2, 4000);
    ok('room A/A: the second page\'s hi.d equals the host\'s own for this code (the same key)', N(H).roster.find((r) => r.slot !== 0).d === H.A.devHash(code) && A2.A.devHash(code) === H.A.devHash(code));
    await until(() => N(H).tro.q === 2, 3000);
    await battle([H, A2], 'battle A/A', true);
    // ---- a party A / B
    A2.mp.leave(); await until(() => N(H).roster.length === 1, 4000);
    await join(B); spy(B); await until(() => N(H).roster.length === 2, 4000);
    await party([H, B]);
    for (const f of [H, B, A2]) { try { f.mp.leave(); } catch (e) { /* ignore */ } }
    await relay();
  }

  // ---------------------------------------------------------------- the relay (design/toss.md 2.5)
  // The same Toss page with ?relay= to serve.js's local relay (tools/ws-relay.js: the real room code behind the real gate)
  // and no ?net=: these frames have no window.Peer at all, so the room can only run on 'ws' - no WebRTC. Its rooms live
  // in the relay's space t; a web page (space w) never finds a Toss code, nor a Toss page a web one
  async function relay() {
    const RL = encodeURIComponent('ws://' + location.host + '/ws');
    const admin = () => fetch('/ws-admin/info', { cache: 'no-store' }).then((r) => r.json());
    const W1 = await frame(3, 'A', 'relay=' + RL), W2 = await frame(4, 'B', 'relay=' + RL);
    await host(W1, 'battle', { bet: 20 });
    ok('relay: a Toss host with a relay and no PeerJS opens its room on ws (aitOrder: the relay first)', !!code && N(W1).str === 'ws' && W1.A.state().tr === 'ws', [code, N(W1).str, W1.A.state().tr]);
    ok('relay: the Toss page asks for the relay space t', W1.w.PG.Net.relaySpace() === 't' && PG.Net.relaySpace() === null, [W1.w.PG.Net.relaySpace(), PG.Net.relaySpace()]);
    let inf = await admin();
    ok('relay: the room lives in the relay as t:<code>, not w:<code>', !!inf.rooms['t:' + code] && !inf.rooms['w:' + code], Object.keys(inf.rooms));
    // a web page (preview.html: no PG_AIT, the space w) with the Toss code: no such room; its own room: no Toss page finds it
    const wf = document.createElement('iframe');
    wf.src = 'preview.html?net=ws&relay=' + RL + '&frame=web';
    wf.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:150px;border:0;opacity:0.05;pointer-events:none';
    document.body.appendChild(wf);
    await until(() => wf.contentWindow && wf.contentWindow.PG && wf.contentWindow.PG.Net, 15000);
    const WN = wf.contentWindow.PG.Net;
    let jr = null; try { jr = { ok: await WN.join({ transport: 'ws', code }) }; } catch (e) { jr = { error: e && e.code }; }
    ok('relay: a web page (space w) cannot join the Toss room by its code (not_found)', jr.error === 'not_found', jr.error || 'joined');
    if (jr.ok) { try { jr.ok.leave(); } catch (e) { /* ignore */ } }
    let wh = null; try { wh = await WN.host({ transport: 'ws' }); } catch (e) { wh = null; }
    inf = await admin();
    ok('relay: a web room lives in w:<code>', !!wh && !!inf.rooms['w:' + wh.code], [wh && wh.code, Object.keys(inf.rooms)]);
    if (wh) {
      const r = await W2.mp.join(wh.code, { nick: '까삐', char: 'capy' });
      await sleep(300);
      ok('relay: a Toss page cannot join the web room by its code (no session, still on 친구와 하기)', !W2.mp.session() && N(W2).screen !== 'room', [r, N(W2).screen]);
      try { wh.leave(); } catch (e) { /* ignore */ }
    }
    wf.remove();
    // the Toss guest joins the Toss room over the relay: a friendly battle as on bc (coins as the web pays, no trophies)
    await join(W2);
    await until(() => N(W1).roster.length === 2 && N(W2).roster.length === 2, 4000);
    ok('relay: two Toss players in one room over ws', N(W1).roster.length === 2 && N(W2).str === 'ws', [N(W1).roster.length, N(W2).str]);
    await battle([W1, W2], 'relay battle A/B', false);
    for (const f of [W1, W2]) { try { f.mp.leave(); } catch (e) { /* ignore */ } }
  }
  main().catch((e) => { fail++; log('TOSSNET FAIL exception :: ' + (e && e.stack ? e.stack : e)); }).then(() => log('TOSSNET DONE pass=' + pass + ' fail=' + fail));
})();
