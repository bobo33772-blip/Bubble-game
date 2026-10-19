// Telling players apart ONLINE (design/distinction.md §2.14 test 8, passes D3 / D4): 3 same-origin iframes of
// preview.html over PG.Net's forced 'bc' transport (a host and two guests: 꽥꽥이, 꽥꽥이, 개굴이), driven through
// PG.debug.mp. Built to test-distinction-net.html; needs a real http origin:
//   node bogeul/build.js
//   node bogeul/tools/serve.js                       (keep running: http://localhost:8765, root C:/Temp/bogeul)
//   node bogeul/tools/run-chrome.js http://localhost:8765/test-distinction-net.html - 1200 900 rt240000 "DISTNET DONE"
// 1. the room (§2.10): seat chips 1P-3P, the second duck's portrait in its twin colour (a different picture from the
//    first duck's, the frog natural), my kit card's twin line on the second duck's page only;
// 2. in game, on every page: looks() twins [no, yes, no] and the same marker kinds as the host's (everyone standing);
//    my tag holds the "나" chip with the white ring, full, and no other tag is white; my HUD panel has the white
//    number box and underline (and only mine); the spotlight starts with the countdown on every page;
// 3. a trapped player's tag ring is the TRAPPER's colour on the host and on the third page (the guest reads the trap's
//    bubble id), white on the victim's own page (is-me wins);
// 4. that guest's animal KO'd (popped by the host) and respawned: on its page the spotlight is on again, the tag is
//    big (is-hi, x1.3 font) for ~2 s and then normal; the other pages show no spotlight.
// Prints "DISTNET PASS|FAIL <name>", "DISTNET INFO ...", "DISTNET DONE pass=N fail=M".
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const LINK = Q.get('link') || 'lat=20&jit=10&drop=0';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const J = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
  const ok = (name, cond, info) => {
    if (cond) { pass++; log('DISTNET PASS ' + name); } else { fail++; log('DISTNET FAIL ' + name + (info !== undefined ? ' :: ' + J(info).slice(0, 900) : '')); }
    return !!cond;
  };
  const info = (s) => log('DISTNET INFO ' + s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clock = () => performance.now();
  async function until(pred, ms, step) {
    const t0 = clock();
    for (;;) {
      let v = false;
      try { v = pred(); } catch (e) { v = false; }
      if (v) return v;
      if (clock() - t0 > ms) return false;
      await sleep(step || 30);
    }
  }
  window.addEventListener('error', (e) => { fail++; log('DISTNET FAIL driver page error: ' + e.message + ' @' + e.lineno); });
  try { PG.debug.G.manual = true; PG.Audio.setMuted(true); } catch (e) { /* ignore */ }
  document.body.style.background = '#061518';
  const SLOT_COLS = ['#ffd447', '#f6a6bd', '#7fdcc8', '#8dc9ff'];

  // ---------------------------------------------------------------- frames
  const frames = [];
  const LAYOUT = [[0, 0], [600, 0], [0, 450]];
  function frame(i) {
    return new Promise((resolve, reject) => {
      const f = document.createElement('iframe');
      f.src = 'preview.html?net=bc&' + LINK + '&frame=' + i;
      f.title = 'player ' + i;
      const pos = LAYOUT[i % LAYOUT.length];
      f.style.cssText = 'position:fixed;left:' + pos[0] + 'px;top:' + pos[1] + 'px;width:600px;height:450px;border:0;z-index:' + (10 + i) + ';background:#0a2327';
      const t = setTimeout(() => reject(new Error('frame ' + i + ' did not load')), 30000);
      f.onload = async () => {
        const w = f.contentWindow;
        const okp = await until(() => w.PG && w.PG.debug && w.PG.debug.mp && w.PG.Net && w.document.getElementById('pg-pick').children.length === 6, 15000);
        clearTimeout(t);
        if (!okp) { reject(new Error('frame ' + i + ' has no PG.debug.mp')); return; }
        const fr = { i, el: f, w, D: w.PG.debug, mp: w.PG.debug.mp, G: w.PG.debug.G, errors: [] };
        w.addEventListener('error', (e) => { fr.errors.push(e.message + ' @' + e.lineno); log('DISTNET frame ' + i + ' page error: ' + e.message + ' @' + e.lineno); });
        w.addEventListener('unhandledrejection', (e) => { fr.errors.push('rejection ' + (e.reason && e.reason.message)); log('DISTNET frame ' + i + ' unhandled rejection: ' + (e.reason && e.reason.message)); });
        for (const k of ['error', 'warn']) {
          const f0 = w.console[k];
          w.console[k] = function () { const s = Array.prototype.map.call(arguments, (a) => (a && a.stack) || String(a)).join(' '); fr.errors.push(k + ': ' + s); log('DISTNET frame ' + i + ' console.' + k + ': ' + s); return f0.apply(w.console, arguments); };
        }
        try { w.PG.Audio.setMuted(true); } catch (e) { /* ignore */ }
        frames.push(fr);
        resolve(fr);
      };
      document.body.appendChild(f);
    });
  }
  const S = (fr) => fr.D.getState();
  const N = (fr) => fr.mp.state();
  const L = (fr) => fr.D.looks();
  const me = (fr) => fr.G.localSlot;
  const tagEls = (fr) => Array.from(fr.w.document.querySelectorAll('#pg-tags .pg-tag')).filter((e) => !e.hidden);
  const px = (fr, x, y) => { const d = fr.w.document.getElementById('pg-canvas').getContext('2d').getImageData(x, y, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); };
  const cards = (fr) => Array.from(fr.w.document.querySelectorAll('#pg-room-players > li'));
  const canvasHash = (cv) => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let s = 0; for (let i = 0; i < d.length; i++) s = (Math.imul(s, 31) + d[i]) | 0; return s; };

  async function main() {
    const H = await frame(0), G1 = await frame(1), G2 = await frame(2);
    const F = [H, G1, G2];
    const code = await H.mp.host({ mode: 'battle', arena: 1, monsters: false, intrusion: false, nick: '방장', char: 'duck' });
    if (!ok('a battle room hosted (forced bc)', !!code, code)) return;
    const j1 = await G1.mp.join(code, { nick: '오리둘', char: 'duck' });
    const j2 = await G2.mp.join(code, { nick: '개굴', char: 'frog' });
    const room = await until(() => F.every((f) => N(f).screen === 'room' && N(f).roster.length === 3), 10000);
    if (!ok('two guests in the room', !!room && j1 && j1.ok && j2 && j2.ok, [j1, j2, F.map((f) => N(f).roster.length)])) return;
    await sleep(400);
    // ---- 1. the room
    const chips = (f) => cards(f).map((li) => { const c = li.querySelector('.pg-pc-n'); return c ? c.textContent : ''; });
    ok('room: every filled seat card carries its number chip 1P-3P (every page)', F.every((f) => J(chips(f)) === J(['1P', '2P', '3P', ''])), F.map(chips));
    // (review 2026-10-18: my card's 나 is a white chip like the in-game one, and only my card has the white ring)
    const meCard = (f) => cards(f).map((li, k) => { const m = li.querySelector('.pg-pc-me'); return m ? k + ':' + f.w.getComputedStyle(m).backgroundColor + ':' + li.classList.contains('is-me') + ':' + /255, 255, 255/.test(f.w.getComputedStyle(li).boxShadow) : ''; }).filter(Boolean);
    ok('room: my card alone has the white 나 chip and the white ring (every page, its own seat)', F.every((f, k) => J(meCard(f)) === J([k + ':rgb(255, 255, 255):true:true']) && cards(f).filter((li) => /255, 255, 255/.test(f.w.getComputedStyle(li).boxShadow)).length === 1), F.map(meCard));
    const port = (f, k) => cards(f)[k] && cards(f)[k].querySelector('canvas');
    const h0 = canvasHash(port(H, 0)), h1 = canvasHash(port(H, 1)), g1h = canvasHash(port(G1, 1));
    ok('room: the second duck\'s portrait is drawn in its twin colour (not the first duck\'s picture), the same on its own page', h0 !== h1 && g1h === h1, [h0, h1, g1h]);
    const tw = (f) => { const e = f.w.document.getElementById('pg-room-twin'); return e && !e.hidden ? e.textContent : ''; };
    ok('room: the kit card says 같은 동물이 있어서 분홍색으로 나와요 on the second duck\'s page only', tw(G1) === '같은 동물이 있어서 분홍색으로 나와요' && !tw(H) && !tw(G2), F.map(tw));
    G2.mp.pickChar('duck');
    const tw3 = await until(() => tw(G2) === '같은 동물이 있어서 민트색으로 나와요', 3000);
    ok('room: a third duck picked -> 민트색 on its page (live)', !!tw3, tw(G2));
    G2.mp.pickChar('frog');
    await until(() => !tw(G2) && N(H).roster.every((r) => r.slot !== 2 || r.char === 'frog'), 3000);
    // ---- 2. in game
    G1.mp.ready(true); G2.mp.ready(true);
    await until(() => N(H).canStart, 8000);
    H.mp.start();
    const cd = await until(() => F.every((f) => S(f).online && (S(f).phase === 'countdown' || S(f).phase === 'playing')), 10000, 20);
    if (!ok('시작 -> every page in the countdown / playing', !!cd, F.map((f) => S(f).phase))) return;
    // (a guest's countdown starts with its first snapshot; its first tick after that starts the spotlight)
    const spotOn = await until(() => F.every((f) => f.D.spot().on), 1500, 16);
    ok('the countdown starts my spotlight on every page', !!spotOn, F.map((f) => f.D.spot()));
    const playing = await until(() => F.every((f) => S(f).phase === 'playing'), 8000);
    if (!ok('every page playing', !!playing, F.map((f) => S(f).phase))) return;
    await sleep(800);
    const tw0 = F.map((f) => L(f).map((o) => o.twin));
    ok('looks() twins [false, true, false] on every page (the same roster, no network field)', tw0.every((t) => J(t) === J([false, true, false])), tw0);
    const mk = await until(() => F.every((f) => J(L(f).map((o) => o.marker)) === J(L(H).map((o) => o.marker))) && L(H).every((o) => o.marker), 3000);
    ok('the guests\' markers equal the host\'s (everyone standing)', !!mk, F.map((f) => L(f).map((o) => o.marker)));
    // my tag, the others' tags
    const tagCheck = (f) => {
      const els = tagEls(f), out = [];
      for (const el of els) {
        const sh = f.w.getComputedStyle(el).boxShadow, mine = el.classList.contains('is-me'), chip = el.querySelector('.pg-tag-n');
        out.push({ t: el.textContent, mine, white: /rgb\(255, 255, 255\)/.test(sh), cmp: el.classList.contains('is-cmp'), chip: chip && chip.textContent });
      }
      return out;
    };
    const T = F.map(tagCheck);
    ok('my tag: the 나 chip, the white ring, full; every other tag not white (every page)', T.every((list, k) => list.length === 3 && list.filter((o) => o.mine).length === 1 &&
      list.every((o) => o.mine === o.white) && list.some((o) => o.mine && o.chip === '나' && !o.cmp && o.t === '나' + ['방장', '오리둘', '개굴'][k])), T);
    // my HUD panel
    const X = [1, 53, 153];
    const hud = F.map((f) => X.map((x) => [px(f, x, 0), px(f, x + 2, 15)]));
    ok('my HUD panel has the white number box and underline, the others their slot colour (every page)', F.every((f, k) => X.every((x, s) =>
      s === me(f) ? hud[k][s][0] === '#ffffff' && hud[k][s][1] === '#ffffff' : hud[k][s][0] === SLOT_COLS[s] && hud[k][s][1] !== '#ffffff')), hud);
    // ---- 3. a trapped player's ring
    H.D.trapPlayer(1, 0);
    const tr = await until(() => F.every((f) => { const o = L(f)[1]; return o && o.tag && /is-trap/.test(tagEls(f).find((e) => e.textContent.indexOf('오리둘') >= 0).className); }), 3000);
    const ringOf = (f) => { const el = tagEls(f).find((e) => e.textContent.indexOf('오리둘') >= 0); return { ring: L(f)[1].tag.ring, sh: f.w.getComputedStyle(el).boxShadow }; };
    const R = F.map(ringOf);
    ok('trapped: the ring is the trapper\'s colour on the host and the third page (from the trap\'s bubble id), white on its own page', !!tr &&
      R[0].ring === SLOT_COLS[0] && R[2].ring === SLOT_COLS[0] && /rgb\(255, 212, 71\)/.test(R[2].sh) && !/255, 255, 255/.test(R[2].sh) && /255, 255, 255/.test(R[1].sh), R);
    // ---- 4. KO'd by the host's touch, respawned: the spotlight and the big 나 on its page
    await sleep(1100); // (the trapper waits a second before it may pop its own catch)
    const ko = await until(() => {
      const b = H.G.bubbles.find((q) => q.kind === 'player' && q.victim && q.victim.slot === 1);
      if (b) H.D.setPlayer(b.x, b.y, 0);
      return H.G.players[1].koT > 0;
    }, 4000, 16);
    if (!ok('the second duck is KO\'d (the host popped it)', !!ko, { trap: !!H.G.players[1].trap })) return;
    const seenKo = await until(() => S(G1).players[1].ko, 3000, 16);
    const back = await until(() => !S(G1).players[1].ko && !S(G1).players[1].trapped, 6000, 16);
    const s1 = G1.D.spot(), hi1 = L(G1)[1].tag && L(G1)[1].tag.hi, others = [H, G2].map((f) => f.D.spot());
    ok('respawned: its page has the spotlight on again and the big 나 (is-hi); not the other pages', !!seenKo && !!back && s1.on && s1.age < 30 && hi1 && others.every((s) => !s.on), { s1, hi1, others });
    const elHi = () => tagEls(G1).find((e) => e.classList.contains('is-me'));
    const fsHi = parseFloat(G1.w.getComputedStyle(elHi()).fontSize);
    const done = await until(() => !L(G1)[1].tag.hi, 3500, 50);
    const fsLo = parseFloat(G1.w.getComputedStyle(elHi()).fontSize);
    ok('the big 나 is x1.3 and ends after ~2 s (120 f)', !!done && Math.abs(fsHi / fsLo - 1.3) < 0.08 && !G1.D.spot().on, { fsHi, fsLo, spot: G1.D.spot() });
    info('font ' + fsHi + ' -> ' + fsLo + ' px');
    ok('no page error / console error in any frame', frames.every((f) => !f.errors.length), frames.map((f) => f.errors.slice(0, 3)));
    for (const f of F) { try { f.mp.leave(); } catch (e) { /* ignore */ } }
  }

  setTimeout(async () => {
    try { await main(); } catch (e) { fail++; log('DISTNET FAIL main threw ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); }
    log('DISTNET DONE pass=' + pass + ' fail=' + fail);
  }, 300);
})();
