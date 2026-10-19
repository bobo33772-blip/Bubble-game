// 몬스터 출현 online (design/distinction.md 3.5 test 4, pass D1): 2 same-origin iframes of preview.html over PG.Net's
// forced 'bc' transport, driven through the DOM like final-v3 (title, 친구와 하기, 코드로 참여, the room's switches and
// buttons). Built to test-monsters-net.html; needs a real http origin:
//   node bogeul/build.js
//   node bogeul/tools/serve.js                       (keep running: http://localhost:8765, root C:/Temp/bogeul)
//   node bogeul/tools/run-chrome.js http://localhost:8765/test-monsters-net.html - 1200 900 rt240000 "MONNET DONE"
// 1. default room: R.o has 6 entries with o[5] = 1, the guest reads on, its summary line has no 몬스터 word;
// 2. the host unticks #pg-room-opts [data-opt="monsters"]: the host's R.o[5] === 0, the guest has NET.opts.monsters
//    false, #pg-room-sum says 몬스터 없음, the rules lead with 몬스터 없이 친구끼리만 겨뤄요, the guest's checkbox is
//    disabled; in game neither world has an enemy (past the opening-wave delay), 시작! says 몬스터 없음 on the guest too
//    (the arena banner itself is covered by the 3-2-1), snapMax <= 3400;
// 3. back in the room the host ticks it again: o[5] = 1, the guest's line is the default one, the next match has enemies.
// Screenshot scenes (?shot=friends|room|roomg; the scene's frame fills the window, then "SHOT READY"): the friends
// panel's battle options, the host's room and the guest's room with 몬스터 출현 off (look at them at 390 and 900 px).
// Prints "MONNET PASS|FAIL <name>", "MONNET INFO ...", "MONNET DONE pass=N fail=M".
(function () {
  'use strict';
  const Q = new URLSearchParams(location.search);
  const LINK = Q.get('link') || 'lat=20&jit=10&drop=0';
  const SHOT = Q.get('shot') || '';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const J = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
  const ok = (name, cond, info) => {
    if (cond) { pass++; log('MONNET PASS ' + name); } else { fail++; log('MONNET FAIL ' + name + (info !== undefined ? ' :: ' + J(info).slice(0, 900) : '')); }
    return !!cond;
  };
  const info = (s) => log('MONNET INFO ' + s);
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
  window.addEventListener('error', (e) => { fail++; log('MONNET FAIL driver page error: ' + e.message + ' @' + e.lineno); });
  try { PG.debug.G.manual = true; PG.Audio.setMuted(true); } catch (e) { /* ignore */ }
  document.body.style.background = '#061518';

  // ---------------------------------------------------------------- frames
  const frames = [];
  const LAYOUT = [[0, 0], [600, 0]];
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
        w.addEventListener('error', (e) => { fr.errors.push(e.message + ' @' + e.lineno); log('MONNET frame ' + i + ' page error: ' + e.message + ' @' + e.lineno); });
        w.addEventListener('unhandledrejection', (e) => { fr.errors.push('rejection ' + (e.reason && e.reason.message)); log('MONNET frame ' + i + ' unhandled rejection: ' + (e.reason && e.reason.message)); });
        for (const k of ['error', 'warn']) {
          const f0 = w.console[k];
          w.console[k] = function () { const s = Array.prototype.map.call(arguments, (a) => (a && a.stack) || String(a)).join(' '); fr.errors.push(k + ': ' + s); log('MONNET frame ' + i + ' console.' + k + ': ' + s); return f0.apply(w.console, arguments); };
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
  const V = (fr) => fr.mp.view();
  const $ = (fr, id) => fr.w.document.getElementById(id);
  const q = (fr, sel) => fr.w.document.querySelector(sel);
  const text = (fr, id) => { const e = $(fr, id); return e ? e.textContent : ''; };
  function shown(el) {
    if (!el) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (e.hidden) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function click(fr, sel) {
    const el = typeof sel === 'string' ? (sel[0] === '#' || sel[0] === '[' || sel.includes(' ') ? q(fr, sel) : $(fr, sel)) : sel;
    if (!el) { info('click: no element ' + sel + ' on frame ' + fr.i); return false; }
    if (!shown(el) || el.disabled) { info('click: ' + sel + ' on frame ' + fr.i + ' is ' + (el.disabled ? 'disabled' : 'hidden')); return false; }
    el.click();
    return true;
  }
  // a checkbox the way a player flips it (the click toggles it and fires change)
  function flip(fr, sel, want) { const c = q(fr, sel); if (!c || c.checked === want) return !!c; return click(fr, c); }
  function typeIn(fr, id, s) { const el = $(fr, id); el.focus(); el.value = s; el.dispatchEvent(new fr.w.Event('input', { bubbles: true })); el.dispatchEvent(new fr.w.Event('change', { bubbles: true })); el.blur(); }
  async function openFriendsUI(fr, ch) {
    click(fr, '#pg-pick [data-char="' + ch + '"]');
    await until(() => fr.G.sel === ch, 1500);
    click(fr, 'pg-friends-btn');
    return until(() => N(fr).overlay === 'friends' && N(fr).transport && !$(fr, 'pg-host').disabled, 6000);
  }
  // host + guest through the UI: a battle room
  async function uiRoom(arena) {
    const H = await frame(0), G1 = await frame(1);
    if (!(await openFriendsUI(H, 'duck'))) return { H, G1, code: null };
    typeIn(H, 'pg-nick', '방장');
    click(H, '#pg-friends [data-modes] [data-mode="battle"]');
    const sel = q(H, '#pg-host-opts select'); sel.value = String(arena); sel.dispatchEvent(new H.w.Event('change', { bubbles: true }));
    click(H, 'pg-host');
    const inRoom = await until(() => N(H).screen === 'room' && /^[a-z0-9]{4}$/.test(N(H).code), 8000);
    if (!inRoom) return { H, G1, code: null };
    const code = N(H).code;
    if (!(await openFriendsUI(G1, 'frog'))) return { H, G1, code: null };
    typeIn(G1, 'pg-nick', '친구');
    typeIn(G1, 'pg-code', code.toUpperCase());
    click(G1, 'pg-join');
    await until(() => N(G1).screen === 'room' && N(G1).roster.length === 2 && N(H).roster.length === 2, 10000);
    return { H, G1, code };
  }
  const hostR = (H) => N(H).tro.R;
  async function startUI(H, G1) {
    click(G1, 'pg-ready');
    await until(() => N(H).canStart && !$(H, 'pg-go').disabled, 8000);
    click(H, 'pg-go');
    // (every banner the guest shows on the way in, as 'main|sub': the 3-2-1, then 시작! - watched 1.5 s past the start,
    // since 시작! may ride the snapshot after the one that says playing)
    const subs = new Set();
    const seen = () => { const b = G1.G.banner; if (b) subs.add(b.main + '|' + b.sub); };
    const playing = await until(() => { seen(); return [H, G1].every((f) => S(f).phase === 'playing' && S(f).online); }, 15000, 20);
    if (playing) await until(() => { seen(); return subs.has('시작!|') || subs.has('시작!|몬스터 없음'); }, 1500, 20);
    return { playing: !!playing, subs };
  }
  function fill(fr) {
    for (const f of frames) f.el.style.visibility = f === fr ? 'visible' : 'hidden';
    fr.el.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;z-index:99;background:#0a2327';
    if (innerWidth < 600) { try { fr.w.dispatchEvent(new Event('touchstart')); } catch (e) { /* ignore */ } }
  }

  // ---------------------------------------------------------------- the checks
  async function main() {
    const { H, G1, code } = await uiRoom(1);
    if (!ok('a battle room of 2 through the UI (forced bc)', !!code && N(H).roster.length === 2 && N(G1).roster.length === 2 && N(H).mode === 'battle', { code, h: N(H).roster.length, g: N(G1).roster.length })) return;
    // ---- 1. the default
    await until(() => hostR(H) && Array.isArray(hostR(H).o), 3000);
    const R0 = hostR(H);
    ok('default: the host\'s R.o has 6 entries, o[5] = 1 (the stake keeps index 4)', R0 && R0.o.length === 6 && R0.o[5] === 1 && R0.o[4] === 0, R0 && R0.o);
    const box = '#pg-room-opts [data-opt="monsters"]';
    ok('default: the host\'s room switch is ticked and editable', q(H, box).checked && !q(H, box).disabled && shown(q(H, box)));
    await until(() => /배틀/.test(text(G1, 'pg-room-sum')), 3000);
    const sum0 = text(G1, 'pg-room-sum');
    ok('default: the guest reads on; its summary line has no 몬스터 word', N(G1).opts.monsters === true && sum0.indexOf('몬스터') < 0 && /능력 있음 · 보스 난입/.test(sum0), { o: N(G1).opts, sum0 });
    // ---- 2. off
    ok('the host unticks 몬스터 출현 in the room (a click)', flip(H, box, false) && N(H).opts.monsters === false);
    const r5 = await until(() => hostR(H) && hostR(H).o[5] === 0, 3000);
    ok('off: the host\'s R.o.length === 6 && R.o[5] === 0', r5 && hostR(H).o.length === 6 && hostR(H).o[5] === 0, hostR(H) && hostR(H).o);
    const got = await until(() => N(G1).opts.monsters === false && /몬스터 없음/.test(text(G1, 'pg-room-sum')), 4000);
    const sum1 = text(G1, 'pg-room-sum');
    ok('off: the guest has NET.opts.monsters false and #pg-room-sum says 몬스터 없음 after 능력', !!got && /능력 있음 · 몬스터 없음 · 보스 난입/.test(sum1), { o: N(G1).opts, sum1 });
    ok('off: the guest\'s checkbox is disabled (and hidden: guests read the line)', q(G1, box).disabled === true && !shown(q(G1, box)), { d: q(G1, box).disabled });
    const rules = (fr) => Array.from(fr.w.document.querySelectorAll('#pg-room-rules li')).map((e) => e.textContent);
    const ruleAt = (fr) => rules(fr).indexOf('몬스터 없이 친구끼리만 겨뤄요');
    ok('off: the rules lead the battle lines with 몬스터 없이 친구끼리만 겨뤄요 (host and guest)', [H, G1].every((f) => ruleAt(f) >= 0 && rules(f)[ruleAt(f) + 1] === '갇히면 점프·거품 연타로 빨리 빠져나와요'), [rules(H), rules(G1)]);
    // ---- in game
    const st = await startUI(H, G1);
    if (!ok('off: 시작 -> both playing', st.playing, [S(H).phase, S(G1).phase])) return;
    ok('off: the host\'s G.opts and the guest\'s G.opts both have monsters false', H.G.opts.monsters === false && G1.G.opts.monsters === false, [H.G.opts, G1.G.opts]);
    // (the arena's own '배틀 · 3분 · 몬스터 없음' is replaced by the countdown's 3 on its first frame - monsters.js checks it
    // without a countdown; online the word rides on 시작!)
    ok('off: the guest saw 시작! say 몬스터 없음', st.subs.has('시작!|몬스터 없음') && !st.subs.has('시작!|'), Array.from(st.subs));
    let most = 0, mostG = 0;
    const t0 = clock();
    while (clock() - t0 < 6000) { most = Math.max(most, H.G.enemies.length); mostG = Math.max(mostG, V(G1).enemies.length); await sleep(50); }
    ok('off: in game (6 s, past the opening-wave delay) neither world has an enemy', most === 0 && mostG === 0, { host: most, guest: mostG });
    ok('off: snapMax <= 3400', N(H).snap.max > 0 && N(H).snap.max <= 3400, N(H).snap);
    info('snapMax ' + N(H).snap.max);
    // ---- 3. back to the room, ticked again: the default line and enemies again
    H.mp.toRoom();
    await until(() => [H, G1].every((f) => N(f).screen === 'room'), 8000);
    await sleep(300);
    ok('on again: the host ticks it (a click), R.o[5] === 1', flip(H, box, true) && !!(await until(() => hostR(H) && hostR(H).o[5] === 1, 3000)), hostR(H) && hostR(H).o);
    const back = await until(() => N(G1).opts.monsters === true && text(G1, 'pg-room-sum').indexOf('몬스터') < 0, 4000);
    ok('on again: the guest reads on and its summary is the default line', !!back && ruleAt(G1) < 0, { sum: text(G1, 'pg-room-sum'), rules: rules(G1) });
    const st2 = await startUI(H, G1);
    if (!ok('on again: 시작 -> both playing', st2.playing, [S(H).phase, S(G1).phase])) return;
    ok('on again: 시작! has no sub (as before)', st2.subs.has('시작!|') && !st2.subs.has('시작!|몬스터 없음'), Array.from(st2.subs));
    const seen = await until(() => V(G1).enemies.length > 0 && H.G.enemies.length > 0, 8000);
    ok('on again: the enemies come back (host and guest)', !!seen, { host: H.G.enemies.length, guest: V(G1).enemies.length });
    ok('no page error / console error in either frame', frames.every((f) => !f.errors.length), frames.map((f) => f.errors.slice(0, 3)));
  }

  async function shot(name) {
    if (name === 'friends') {
      const f = await frame(0);
      await openFriendsUI(f, 'duck');
      typeIn(f, 'pg-nick', '뽀송이');
      click(f, '#pg-friends [data-modes] [data-mode="battle"]');
      fill(f);
      await sleep(900);
    } else if (name === 'room' || name === 'roomg') {
      const { H, G1, code } = await uiRoom(2);
      if (!code) throw new Error('no room');
      flip(H, '#pg-room-opts [data-opt="monsters"]', false);
      await until(() => N(G1).opts.monsters === false, 4000);
      click(G1, 'pg-ready');
      await sleep(600);
      const fr = name === 'room' ? H : G1;
      fill(fr);
      await sleep(400);
      // (the settings: the host's switches / the guest's summary line and rules, scrolled into view)
      const el = name === 'room' ? q(fr, '#pg-room-opts [data-opt="monsters"]') : $(fr, 'pg-room-sum');
      if (el) el.scrollIntoView({ block: 'center' });
      await sleep(400);
    }
    log('SHOT READY ' + name);
  }

  setTimeout(async () => {
    if (SHOT) { try { await shot(SHOT); } catch (e) { log('SHOT error ' + (e && e.stack)); log('SHOT READY ' + SHOT); } return; }
    try { await main(); } catch (e) { fail++; log('MONNET FAIL main threw ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); }
    log('MONNET DONE pass=' + pass + ' fail=' + fail);
  }, 300);
})();
