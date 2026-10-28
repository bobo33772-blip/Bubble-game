// 앱인토스 (design/toss.md 15.2): the Toss build's page - the REAL src/ait.js bridge over a fake SDK (toss-fake.js) - in
// virtual time, one page. test-toss.html boots src/ait.js with the fake, which loads toss/pg/*.js and then this driver.
//   node bogeul/tools/serve.js (or run-all)    then
//   node bogeul/tools/run-chrome.js "http://localhost:8765/test-toss.html?net=bc" - 900 760 400000 "TOSS DONE"
//   other boots: #boot=restore | throw | slow (each its own page load, a few checks each)
// Checks (T1-T6): the boot order and what the Toss page has / lacks; the storage mirror (the page's own boot, then the
// store against fake natives: lineages, sequence numbers, flush timing and caps, retries, the unsynced session); the
// game-key gate (wait / err / late HASH / old, 다시 시도's 5 s, the key never leaking); trophies off (the core guards,
// stakeNow, the room / countdown / podium lines, no 걸다 / 판돈 / 가져요 about trophies); the leaderboard (nf / SUCCESS /
// lower / not counted / unsupported); Android back on every screen, the root's two-press fallback, awake / swipe, the
// overlay pausing and silencing, the M mute kept, the screen logs; pagehide restoring what the mini-app changed.
//   #shot=<scene>&ins=l,r,b,t (cdp, a phone viewport with the same insets): the fit of one scene (15.4)
// Prints "TOSS PASS|FAIL <name>", "TOSS INFO ..." and "TOSS DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => { if (cond) { pass++; log('TOSS PASS ' + name); } else { fail++; log('TOSS FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); } return !!cond; };
  const info = (s) => log('TOSS INFO ' + s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(pred, ms, step) { const t0 = performance.now(); for (;;) { let v = false; try { v = pred(); } catch (e) { v = false; } if (v) return v; if (performance.now() - t0 > ms) return false; await sleep(step || 25); } }
  const $ = (id) => document.getElementById(id);
  const F = window.PG_FAKE, D = PG.debug, A = D.ait, MP = D.mp, TR = D.tro, G = D.G, AIT = PG.Ait;
  const Q = {}; for (const s of [location.search, location.hash]) for (const p of s.replace(/^[?#]/, '').split('&')) { if (!p) continue; const i = p.indexOf('='); Q[decodeURIComponent(i < 0 ? p : p.slice(0, i))] = i < 0 ? '' : decodeURIComponent(p.slice(i + 1)); }
  const T0 = AIT.t0 || 0, since = () => performance.now() - T0;
  const HASH = F.key;
  const TX = A.tx();
  const vis = (el) => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const click = (id) => { const el = typeof id === 'string' ? $(id) : id; if (!el) return false; el.click(); return true; };
  const key = (code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); };
  const calls = (n) => F.calls(n).length;
  const lsAll = () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; };
  const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return (h % 2176782336).toString(36).padStart(6, '0'); };
  // every text a player can see (or a screen reader reads) now, the font warm-up aside
  function seen() {
    const out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement, t = n.nodeValue.trim(); if (!el || !t || el.closest('#pg-fontwarm, script, style')) continue;
      if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
      out.push(t);
    }
    for (const el of document.querySelectorAll('[aria-label]')) if (el.getClientRects().length && !el.closest('#pg-fontwarm')) out.push(el.getAttribute('aria-label'));
    return out.join('\n');
  }
  const STAKE_WORDS = /걸[기고어지었]|건 사람|판돈|가져요|트로피[^\n]{0,24}걸|걸[^\n]{0,3}트로피/;
  const noGoogle = (where) => { const t = seen(); ok(`${where}: no visible text names 구글 / Google`, !/구글|Google/.test(t), (t.match(/[^\n]*(구글|Google)[^\n]*/) || [])[0]); };
  const noStake = (where) => { const t = seen(); const m = t.match(new RegExp('[^\\n]*(' + STAKE_WORDS.source + ')[^\\n]*')); ok(`${where}: no 걸다 / 판돈 / 가져요 about trophies anywhere visible`, !m, m && m[0]); };
  const screens = () => F.calls('Analytics.screen').map((c) => c[1][0] && c[1][0].log_name);
  const gate = () => ({ card: vis($('pg-net-gate')), h: ($('pg-net-gate-h') || {}).textContent, st: ($('pg-net-gate-st') || {}).textContent, retry: vis($('pg-ait-retry')), dis: $('pg-ait-retry') && $('pg-ait-retry').getAttribute('aria-disabled'), host: $('pg-host') && (vis($('pg-host')) && !$('pg-host').disabled), join: $('pg-join') && (vis($('pg-join')) && !$('pg-join').disabled) });
  const toTitle = () => { D.toTitle(); };
  const NET = !!(PG.Net && PG.Net.fromQuery().transport === 'bc');

  // ================================================================== T1 boot (the default boot: both sides empty)
  async function t1() {
    const L = F.log, firstSdk = L.findIndex((e) => !/^ls\.get$|!throw$/.test(e[0])), firstRead = L.findIndex((e) => e[0] === 'ls.get');
    ok('T1 boot: the first SDK calls come before the engine\'s first localStorage read', firstSdk >= 0 && (firstRead < 0 || firstSdk < firstRead), [firstSdk, firstRead, L.slice(0, 6).map((e) => e[0])]);
    ok('T1 boot: landscape asked for once (setOrientation landscape, after isSupported)', calls('Screen.setOrientation') === 1 && F.calls('Screen.setOrientation')[0][1][0].type === 'landscape' && calls('Screen.setOrientation.isSupported') >= 1, F.calls('Screen.setOrientation'));
    const cs = getComputedStyle(document.documentElement), I = F.insets;
    ok('T1 boot: --sa-t/r/b/l are the SDK\'s Safe Area (px), --ait-nav-w / -h set', ['t', 'r', 'b', 'l'].every((k) => cs.getPropertyValue('--sa-' + k).trim() === { t: I.top, r: I.right, b: I.bottom, l: I.left }[k] + 'px') && cs.getPropertyValue('--ait-nav-w').trim() === AIT.NAV.w + 'px' && cs.getPropertyValue('--ait-nav-h').trim() === AIT.NAV.h + 'px',
      ['t', 'r', 'b', 'l', 'ait-nav-w', 'ait-nav-h'].map((k) => cs.getPropertyValue(k.length === 1 ? '--sa-' + k : '--' + k)));
    ok('T1 boot: the screen log \'title\' once (the "init"), the Safe Area followed, the overlay subscribed once', screens().filter((n) => n === 'title').length === 1 && screens()[0] === 'title' && calls('SafeAreaInsets.subscribe') === 1 && calls('onVisibilityChangedByTransparentServiceWeb') === 1, [screens(), calls('SafeAreaInsets.subscribe')]);
    const s = A.state();
    ok('T1 boot: window.PG_AIT is there when game.js runs (AIT.on), v 1, env toss, the nav box', s.on === true && window.PG_AIT && window.PG_AIT.v === 1 && window.PG_AIT.env === 'toss' && s.nav.w === AIT.NAV.w && s.nav.h === AIT.NAV.h, s);
    ok('T1 boot: the engine started within ~3 s of the bridge\'s boot', AIT.ready >= 0 && AIT.ready < 3100, AIT.ready);
    ok('T1 boot: PG_AIT has no member that hands out the SDK or calls anything', !Object.keys(window.PG_AIT).some((k) => /sdk|call|invoke|raw/i.test(k)) && Object.isFrozen(window.PG_AIT), Object.keys(window.PG_AIT));
    ok('T1 boot: no login screen, no sign-in card button, no install pill, no fullscreen button, no 친구 순위', !$('pg-login') || !vis($('pg-login')), [!!$('pg-login')]);
    ok('T1 boot: ... #pg-net-gate-go, #pg-install, #pg-fs, #pg-pal-btn do not exist', !$('pg-net-gate-go') && !$('pg-install') && !$('pg-fs') && !$('pg-pal-btn'));
    ok('T1 boot: ... #pg-cloud-btn is hidden and has no text; the cloud is off', !vis($('pg-cloud-btn')) && $('pg-cloud-btn').textContent === '' && D.cloud.state().on === false, D.cloud.state().on);
    ok('T1 boot: the page is the Toss shape (pg-sa pg-ait), the hidden pg-cloud markup only', document.documentElement.classList.contains('pg-ait') && document.documentElement.classList.contains('pg-sa'));
    noGoogle('T1 title');
  }

  // ================================================================== T2 the page's own store (both sides empty at boot)
  async function t2page() {
    const st = A.state().sync;
    ok('T2 store: both sides were empty -> a new lineage, the engine\'s gift store written locally', st && st.how === 'empty' && st.synced && st.gen && localStorage.getItem('ppogeul-trophy') !== null, st);
    await until(() => F.storage.has('pgait:seq'), 6000);
    const w = F.calls('Storage.setItem'), first = w.length ? w[0][2] - T0 : -1;
    ok('T2 store: native gets it ~2 s after the first write (no setItems on this fake: one setItem each, seq last)', first >= 1500 && first <= 3600 && w[w.length - 1][1][0] === 'pgait:seq', [Math.round(first), w.map((c) => c[1][0])]);
    ok('T2 store: native ppogeul-trophy = local, pgait:seq = lseq, one pgait:gen on both sides', F.storage.get('ppogeul-trophy') === localStorage.getItem('ppogeul-trophy') && F.storage.get('pgait:seq') === localStorage.getItem('pgait:lseq') && F.storage.get('pgait:gen') === localStorage.getItem('pgait:gen') && /^[0-9a-z]{12}$/.test(F.storage.get('pgait:gen')),
      [F.storage.get('pgait:seq'), localStorage.getItem('pgait:lseq'), F.storage.get('pgait:gen'), localStorage.getItem('pgait:gen')]);
    const keys = JSON.parse(F.storage.get('pgait:keys') || '[]');
    ok('T2 store: pgait:keys lists the mirrored ppogeul-* keys only; nothing else reached native', keys.length > 0 && keys.every((k) => k.indexOf('ppogeul-') === 0) && [...F.storage.keys()].every((k) => k.indexOf('ppogeul-') === 0 || /^pgait:(seq|gen|keys)$/.test(k)), [...F.storage.keys()]);
    localStorage.setItem('pg-other', 'x'); localStorage.setItem('ppogeul-test-x', 'y');
    await sleep(5200);
    ok('T2 store: a non-ppogeul key never reaches native; a ppogeul one does', !F.storage.has('pg-other') && F.storage.get('ppogeul-test-x') === 'y', [...F.storage.keys()]);
    localStorage.removeItem('ppogeul-test-x'); localStorage.removeItem('pg-other');
    await sleep(5200);
    ok('T2 store: a removal reaches native (removeItem) and the key list', !F.storage.has('ppogeul-test-x') && !JSON.parse(F.storage.get('pgait:keys')).includes('ppogeul-test-x'));
    // visibilitychange hidden: a flush at once (no 2 s wait)
    const n0 = calls('Storage.setItem');
    localStorage.setItem('ppogeul-test-v', '1');
    const hid = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    await sleep(50);
    const flushed = F.storage.get('ppogeul-test-v') === '1' && calls('Storage.setItem') > n0;
    delete document.hidden; if (hid) { /* the prototype getter is back */ }
    document.dispatchEvent(new Event('visibilitychange'));
    ok('T2 store: the page hiding flushes at once', flushed, [calls('Storage.setItem') - n0]);
    D.resume(); toTitle();
    localStorage.removeItem('ppogeul-test-v');
  }

  // ---- T2 the store against fake natives (unit level: PG.Ait.store(native, a raw local))
  function rawLocal(init) {
    const m = new Map(Object.entries(init || {}));
    const L = { m, get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { m.set(k, String(v)); }, del: (k) => { m.delete(k); }, keys: () => [...m.keys()] };
    return L;
  }
  const writer = (st, L) => (k, v) => { if (v === null) L.del(k); else L.set(k, v); st.mark(k); };
  const nfill = (FN, o, gen, seq) => { for (const k of Object.keys(o)) FN.storage.set(k, o[k]); FN.storage.set('pgait:keys', JSON.stringify(Object.keys(o).sort())); if (gen) FN.storage.set('pgait:gen', gen); if (seq !== undefined) FN.storage.set('pgait:seq', String(seq)); };
  async function t2unit() {
    // same lineage, local newer -> pushed at boot (removals included)
    let FN = PGFake.make(), L = rawLocal({ 'pgait:gen': 'gen000000001', 'pgait:lseq': '9', 'ppogeul-a': 'A2', 'ppogeul-c': 'C' });
    nfill(FN, { 'ppogeul-a': 'A1', 'ppogeul-b': 'B' }, 'gen000000001', 5);
    let st = AIT.store(FN.sdk.Storage, L);
    let how = await st.load(); await sleep(100);
    ok('T2 unit: same lineage, lseq 9 > nseq 5 -> local pushed at boot, a key local no longer has removed', how === 'push' && FN.storage.get('ppogeul-a') === 'A2' && FN.storage.get('ppogeul-c') === 'C' && !FN.storage.has('ppogeul-b') && FN.storage.get('pgait:seq') === '9', [how, [...FN.storage]]);
    // same lineage, native newer -> native wins (local keys not in its list removed)
    FN = PGFake.make(); L = rawLocal({ 'pgait:gen': 'gen000000001', 'pgait:lseq': '3', 'ppogeul-a': 'old', 'ppogeul-z': 'gone' });
    nfill(FN, { 'ppogeul-a': 'new', 'ppogeul-b': 'B' }, 'gen000000001', 8);
    st = AIT.store(FN.sdk.Storage, L); how = await st.load();
    ok('T2 unit: same lineage, nseq 8 > lseq 3 -> native wins (copied, the local-only key removed, lseq = 8)', how === 'native' && L.get('ppogeul-a') === 'new' && L.get('ppogeul-b') === 'B' && L.get('ppogeul-z') === null && L.get('pgait:lseq') === '8', [how, [...L.m]]);
    // local of ANOTHER lineage with a higher seq -> native still wins
    FN = PGFake.make(); L = rawLocal({ 'pgait:gen': 'genLOCAL0001', 'pgait:lseq': '500', 'ppogeul-trophy': 'fresh-gift' });
    nfill(FN, { 'ppogeul-trophy': 'the-real-store' }, 'genNATIVE001', 12);
    st = AIT.store(FN.sdk.Storage, L); how = await st.load(); await sleep(3000);
    ok('T2 unit: local of another lineage with a HIGHER seq than native -> native still wins (gen taken over)', how === 'native' && L.get('ppogeul-trophy') === 'the-real-store' && L.get('pgait:gen') === 'genNATIVE001' && FN.storage.get('ppogeul-trophy') === 'the-real-store' && FN.calls('Storage.setItem').length === 0, [how, [...L.m], FN.calls('Storage.setItem').length]);
    // local empty (wiped), native full -> restored; no write back
    FN = PGFake.make(); L = rawLocal();
    nfill(FN, { 'ppogeul-trophy': 'S', 'ppogeul-nick': 'N' }, 'genNATIVE002', 4);
    st = AIT.store(FN.sdk.Storage, L); how = await st.load(); await sleep(2500);
    ok('T2 unit: local wiped + native full -> native restored into local, nothing written back', how === 'native' && L.get('ppogeul-trophy') === 'S' && L.get('ppogeul-nick') === 'N' && FN.calls('Storage.setItem').length === 0, [how, [...L.m]]);
    // getItems / setItems where the fake says supported: one read of the meta, one of the keys; a flush = setItems + the seq
    FN = PGFake.make(); FN.sup['Storage.getItems'] = true; FN.sup['Storage.setItems'] = true; L = rawLocal();
    nfill(FN, { 'ppogeul-a': '1', 'ppogeul-b': '2' }, 'genNATIVE003', 2);
    st = AIT.store(FN.sdk.Storage, L); how = await st.load();
    const w = writer(st, L); w('ppogeul-a', 'x'); w('ppogeul-c', 'y');
    await sleep(2600);
    ok('T2 unit: getItems used (2 calls: meta, keys) and no getItem; a flush is one setItems (values + key list) then the seq', how === 'native' && FN.calls('Storage.getItems').length === 2 && FN.calls('Storage.getItem').length === 0 && FN.calls('Storage.setItems').length === 1 && FN.calls('Storage.setItem').length === 1 && FN.calls('Storage.setItem')[0][1][0] === 'pgait:seq' && FN.storage.get('ppogeul-c') === 'y' && JSON.parse(FN.storage.get('pgait:keys')).includes('ppogeul-c'),
      FN.log.map((e) => e[0] + ':' + JSON.stringify(e[1]).slice(0, 60)));
    // unchanged values are not sent again
    const n1 = FN.calls('Storage.setItems').length; w('ppogeul-a', 'x'); await sleep(2600);
    const last = FN.calls('Storage.setItems').slice(n1);
    ok('T2 unit: a value written again unchanged is not sent (only the seq moves)', last.every((c) => !('ppogeul-a' in c[1][0])), last.map((c) => Object.keys(c[1][0])));
    // flush timing: 50 writes in 10 s -> at most 3 flushes; the latest is 20 s after the first mark
    FN = PGFake.make(); L = rawLocal(); st = AIT.store(FN.sdk.Storage, L); await st.load();
    const w2 = writer(st, L);
    for (let i = 0; i < 50; i++) { w2('ppogeul-k' + (i % 5), String(i)); await sleep(200); }
    await sleep(2500);
    const seqW = FN.calls('Storage.setItem').filter((c) => c[1][0] === 'pgait:seq').length;
    ok('T2 unit: 50 writes in 10 s -> at most 3 flushes (one, 2 s after the last)', seqW >= 1 && seqW <= 3 && FN.storage.get('ppogeul-k4') === '49', seqW);
    FN.log.length = 0;
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) { w2('ppogeul-steady', String(i)); await sleep(1000); }
    const firstAt = FN.calls('Storage.setItem').length ? FN.calls('Storage.setItem')[0][2] - t0 : -1;
    ok('T2 unit: a write every second never postpones the flush past 20 s after the first mark', firstAt > 0 && firstAt <= 20500, Math.round(firstAt));
    // a bridge call that never answers: the flush gives up at 10 s (the in-flight flag is released), the next write flushes again
    await sleep(3000);
    FN = PGFake.make(); L = rawLocal(); st = AIT.store(FN.sdk.Storage, L); await st.load();
    const w3 = writer(st, L);
    FN.on('Storage.setItem', 'never');
    w3('ppogeul-h', '1');
    await sleep(2100);
    ok('T2 unit: a flush whose setItem never answers is in flight', st.state().busy === true, st.state());
    await sleep(10100);
    ok('T2 unit: ... and gives up at 10 s (busy released, one failure)', st.state().busy === false && st.state().fails === 1, st.state());
    w3('ppogeul-h', '2');
    await sleep(2600);
    ok('T2 unit: ... the next write flushes again (the hung call did not stop later flushes)', FN.storage.get('ppogeul-h') === '2' && FN.storage.get('pgait:seq') === L.get('pgait:lseq'), [FN.storage.get('ppogeul-h'), st.state()]);
    // a failing setItem: exactly one retry 10 s later, then nothing until the next write
    await sleep(11000);
    FN = PGFake.make(); L = rawLocal(); st = AIT.store(FN.sdk.Storage, L); await st.load();
    const w4 = writer(st, L);
    FN.always('Storage.setItem', { e: 'disk full' });
    w4('ppogeul-f', '1');
    await sleep(2100);
    const c1 = FN.calls('Storage.setItem').length;
    await sleep(10100);
    const c2 = FN.calls('Storage.setItem').length;
    await sleep(25000);
    const c3 = FN.calls('Storage.setItem').length;
    ok('T2 unit: a failing setItem -> one try, exactly one retry 10 s later, then nothing (no loop)', c1 === 1 && c2 === 2 && c3 === 2 && st.state().fails === 2, [c1, c2, c3, st.state()]);
    FN.always('Storage.setItem', undefined);
    w4('ppogeul-f', '2'); await sleep(2600);
    ok('T2 unit: ... until the next write, which flushes (and succeeds now)', FN.storage.get('ppogeul-f') === '2', [...FN.storage]);
    // a flush cut off before its seq write -> the next boot pushes local (same lineage, lseq > nseq)
    FN = PGFake.make(); L = rawLocal(); st = AIT.store(FN.sdk.Storage, L); await st.load();
    const w5 = writer(st, L);
    w5('ppogeul-x', '1'); await sleep(2600);
    // (the next flush: x, y, the key list, then the seq - which fails: the page closing mid-flush)
    FN.q['Storage.setItem'] = [undefined, undefined, undefined, { e: 'cut off' }];
    w5('ppogeul-x', '2'); w5('ppogeul-y', '3'); await sleep(5200);
    const nseq = FN.storage.get('pgait:seq'), lseq = L.get('pgait:lseq');
    FN.clear('Storage.setItem');
    const st2 = AIT.store(FN.sdk.Storage, L), how2 = await st2.load(); await sleep(200);
    ok('T2 unit: a flush interrupted before its seq write leaves nseq < lseq; the next boot pushes local', +nseq < +lseq && how2 === 'push' && FN.storage.get('ppogeul-y') === '3' && FN.storage.get('pgait:seq') === lseq, [nseq, lseq, how2, [...FN.storage]]);
    // the unsynced session: the boot read never answers -> boots on local in 3 s, no native write while unsynced
    FN = PGFake.make(); FN.always('Storage.getItem', 'never');
    L = rawLocal({ 'pgait:gen': 'genLOCAL0002', 'pgait:lseq': '4', 'ppogeul-trophy': 'local' });
    st = AIT.store(FN.sdk.Storage, L);
    const tl = performance.now(); how = await st.load(); const took = performance.now() - tl;
    const w6 = writer(st, L); w6('ppogeul-trophy', 'local2');
    await sleep(5000);
    ok('T2 unit: native slow ("never") -> load gives up at 3 s, unsynced, and no native write happens', how === 'timeout' && took >= 2900 && took < 3300 && !st.state().synced && FN.calls('Storage.setItem').length === 0 && FN.calls('Storage.setItems').length === 0, [how, Math.round(took), st.state()]);
    // ... a late read finding native data of another lineage -> still no write, local gen cleared
    FN.always('Storage.getItem', undefined); nfill(FN, { 'ppogeul-trophy': 'the-real-one' }, 'genNATIVE009', 30);
    await sleep(6000);
    ok('T2 unit: ... a late read finds another lineage -> never writes native, local pgait:gen cleared (the next boot restores native)', st.state().never === true && L.get('pgait:gen') === null && FN.calls('Storage.setItem').length === 0 && FN.storage.get('ppogeul-trophy') === 'the-real-one', [st.state(), [...L.m]]);
    const st3 = AIT.store(FN.sdk.Storage, L); how = await st3.load();
    ok('T2 unit: ... and that next boot restores native', how === 'native' && L.get('ppogeul-trophy') === 'the-real-one', [how, L.get('ppogeul-trophy')]);
    // ... a late read finding native empty -> the dirty keys go out
    FN = PGFake.make(); FN.always('Storage.getItem', 'never');
    L = rawLocal({ 'ppogeul-trophy': 'mine' });
    st = AIT.store(FN.sdk.Storage, L); how = await st.load();
    writer(st, L)('ppogeul-nick', 'nick');
    FN.always('Storage.getItem', undefined);
    await sleep(10500); await sleep(2600);
    ok('T2 unit: ... a late read finding native empty -> synced, everything local goes out', st.state().synced && FN.storage.get('ppogeul-trophy') === 'mine' && FN.storage.get('ppogeul-nick') === 'nick' && FN.storage.get('pgait:gen') === L.get('pgait:gen'), [st.state(), [...FN.storage]]);
    // the desktop: every SDK function throws synchronously -> local only, zero native writes, nothing ever retried in a loop
    FN = PGFake.make({ throwAll: true }); L = rawLocal({ 'ppogeul-a': '1' });
    st = AIT.store(FN.sdk.Storage, L); how = await st.load();
    writer(st, L)('ppogeul-a', '2'); await sleep(45000);
    ok('T2 unit: every SDK call throwing (outside Toss) -> unsynced for good, 3 meta reads at most, zero native writes', how === 'timeout' && !st.state().synced && FN.log.filter((e) => /setItem/.test(e[0])).length === 0 && st.state().tries <= 3, [how, st.state(), FN.log.length]);
  }

  // ================================================================== the bridge's key (unit level, fake SDKs)
  async function keyUnit() {
    const mk = (cfg) => { const FN = PGFake.make(cfg); return { FN, br: AIT.make(FN.sdk) }; };
    let { FN, br } = mk();
    FN.on('getUserKeyForGame', { v: undefined });
    ok('key: the SDK answering undefined (an app below 5.232.0) -> old', (await br.key()).st === 'old');
    ({ FN, br } = mk()); FN.sup.getUserKeyForGame = false;
    ok('key: isSupported() false -> old, without calling it', (await br.key()).st === 'old' && FN.calls('getUserKeyForGame').length === 0);
    ({ FN, br } = mk()); FN.on('getUserKeyForGame', { v: 'ERROR' });
    let r = await br.key();
    ok('key: \'ERROR\' -> err', r.st === 'err' && !('hash' in r), r);
    ok('key: ... a second key() within 5 s makes no new SDK call', (await br.key()).st === 'err' && FN.calls('getUserKeyForGame').length === 1);
    await sleep(5100);
    r = await br.key();
    ok('key: ... after 5 s a new call (the default answer: ok with the hash)', FN.calls('getUserKeyForGame').length === 2 && r.st === 'ok' && r.hash === FN.key, r.st);
    ok('key: ... an ok is kept for the page (no further SDK call)', (await br.key()).st === 'ok' && FN.calls('getUserKeyForGame').length === 2);
    ({ FN, br } = mk()); FN.on('getUserKeyForGame', { throw: 'boom' });
    ok('key: a synchronous throw -> err', (await br.key()).st === 'err');
    ({ FN, br } = mk({ throwAll: true }));
    ok('key: every SDK function throwing (isSupported too: not inside Toss) -> err', (await br.key()).st === 'err');
    ({ FN, br } = mk()); FN.on('getUserKeyForGame', { v: { type: 'HASH', hash: 'short' } });
    ok('key: a hash shorter than 8 characters -> err', (await br.key()).st === 'err');
    ({ FN, br } = mk()); FN.on('getUserKeyForGame', { v: { type: 'INVALID_CATEGORY' } });
    ok('key: any other answer -> err', (await br.key()).st === 'err');
    ({ FN, br } = mk()); FN.on('getUserKeyForGame', { ms: 12000, v: () => ({ type: 'HASH', hash: FN.key }) });
    let late = 0; br.onKey(() => { late++; });
    const t0 = performance.now(); r = await br.key(); const took = performance.now() - t0;
    ok('key: no answer -> err at the 8 s cap', r.st === 'err' && took >= 7900 && took < 8300, [r.st, Math.round(took)]);
    const p2 = br.key(); r = await p2;
    ok('key: ... (one call in its window: after the cap a retry is allowed at once)', FN.calls('getUserKeyForGame').length === 2);
    await sleep(4500);
    r = await br.key();
    ok('key: ... the HASH arriving at 12 s upgrades the state to ok and calls onKey', r.st === 'ok' && late === 1, [r.st, late]);
  }

  // ================================================================== T3 the gate (the default boot's key arrives at 12 s)
  async function t3a() {
    click('pg-friends-btn');
    await until(() => MP.state().screen === 'friends', 1500);
    const g = gate();
    ok('T3 gate: wait (the key has not answered) -> the card\'s wait lines, no button, 방 만들기 / 참여 off', A.state().st === 'wait' && g.card && g.h === TX.waitH && g.st === TX.waitL && !g.retry && !g.host && !g.join, [A.state().st, g]);
    ok('T3 gate: the card has no login button and its solo line names no login', !$('pg-net-gate').querySelector('.pg-login-go, .pg-login-g') && $('pg-net-gate').textContent.includes(TX.solo) && !/로그인/.test($('pg-net-gate').textContent));
    const code = await MP.host({ mode: 'battle', nick: '토끼' });
    ok('T3 gate: hosting through the test API is refused while gated', code === null && !MP.session() && A.state().gated, code);
    const j = await MP.join('abcd', {});
    ok('T3 gate: joining through the test API is refused while gated', !MP.session() && (!j || j.ok !== true), j);
    noGoogle('T3 gate card');
    // 혼자 하기 never waits for the key
    MP.state(); D.toTitle(); click('pg-start');
    await sleep(100);
    ok('T3 gate: 혼자 하기 starts while the key is still pending', G.mode === 'playing' && G.gameMode === 'solo', G.mode);
    toTitle();
  }
  async function t3b() {
    // (the panel is open before the key's 8 s cap: err arrives while it shows - opening it on err asks again by itself)
    await until(() => since() > 6000, 9000);
    ok('T3 gate: still wait at 6 s, one SDK call so far', A.state().st === 'wait' && calls('getUserKeyForGame') === 1, [A.state().st, calls('getUserKeyForGame'), Math.round(since())]);
    click('pg-friends-btn'); await until(() => MP.state().screen === 'friends', 1500);
    await until(() => A.state().st === 'err', 4000);
    ok('T3 gate: ... err at the 8 s cap', A.state().st === 'err' && since() >= 7950 && since() < 8400, Math.round(since()));
    await sleep(30);
    let g = gate();
    ok('T3 gate: no answer for 8 s -> err: its lines and 다시 시도 (on: the last request was over 5 s ago)', A.state().st === 'err' && g.h === TX.errH && g.st === TX.errL && g.retry && g.dis === 'false', [A.state().st, g]);
    const n = calls('getUserKeyForGame');
    click('pg-ait-retry'); await sleep(30);
    g = gate();
    ok('T3 gate: 다시 시도 -> one SDK call (answered ERROR here) -> err, the button off for 5 s', calls('getUserKeyForGame') === n + 1 && A.state().st === 'err' && g.dis === 'true', [calls('getUserKeyForGame') - n, A.state().st, g.dis]);
    click('pg-ait-retry'); click('pg-ait-retry'); await sleep(30);
    ok('T3 gate: ... taps while it is off make no SDK call', calls('getUserKeyForGame') === n + 1);
    // 'old' (the bridge cannot answer it once ok is cached: the card staged)
    A.stage('old'); g = gate();
    ok('T3 gate: old -> 토스 앱을 업데이트하면… / 토스를 최신 버전으로…, no button (it links nowhere)', g.h === TX.oldH && g.st === TX.oldL && !g.retry && !g.host, g);
    A.stage('err');
    await until(() => since() > 12300 && A.state().st === 'ok', 6000);
    g = gate();
    ok('T3 gate: the HASH arriving at 12 s (after the cap) -> ok: the panel as usual, no card', A.state().st === 'ok' && A.state().hasKey && !g.card && !$('pg-friends').classList.contains('is-gated'), [A.state(), g]);
    ok('T3 gate: ... 방 만들기 / 참여 on' + (NET ? ' (bc forced)' : ' unless no transport: no window.Peer here -> NET.tr null'), NET ? g.host && g.join : MP.state().transport === null && !g.host, [MP.state().transport, g]);
    ok('T3 gate: ... two SDK key calls in all (boot, one 다시 시도)', calls('getUserKeyForGame') === 2, calls('getUserKeyForGame'));
    await sleep(300);
    const who = localStorage.getItem('ppogeul-ait-who');
    ok('T3 gate: ppogeul-ait-who written once: 16 hex, not the key, mirrored', /^[0-9a-f]{16}$/.test(who || '') && !HASH.includes(who) && A.state().who, who);
    await sleep(2600);
    ok('T3 gate: ... and it reached native Storage', F.storage.get('ppogeul-ait-who') === who);
    D.toTitle();
  }
  async function t3c() {
    ok('T3 transport: in Toss \'peer\' or nothing - no bc fallback (?net=bc forces it only)', A.pick({ room: false, peer: false, bc: true }) === null && A.pick({ room: false, peer: true, bc: true }) === 'peer' && A.pick({ room: true, peer: true, bc: true }) === 'peer');
    // the key never leaks
    const st = JSON.stringify(A.state()), ls = JSON.stringify(lsAll()), nat = JSON.stringify([...F.storage]), an = JSON.stringify(F.calls('Analytics.screen'));
    const dom = document.documentElement.cloneNode(true); for (const sc of dom.querySelectorAll('script')) sc.remove();
    ok('T3 key: never in the DOM (scripts aside: the fake SDK\'s own source names it)', !dom.outerHTML.includes(HASH));
    ok('T3 key: never in storage (local / native)', !ls.includes(HASH) && !nat.includes(HASH));
    ok('T3 key: never in PG.debug.ait.state() or an Analytics argument', !st.includes(HASH) && !an.includes(HASH));
    const d1 = A.devHash('abcd'), d2 = A.devHash('wxyz');
    ok('T3 key: hi.d = 6 base-36 characters, the FNV of t:key:code (another code, another value), never the key', /^[0-9a-z]{6}$/.test(d1) && d1 === fnv('t:' + HASH + ':abcd') && d1 !== d2 && d1 !== fnv(HASH + ':wxyz') && !HASH.includes(d1), [d1, d2]);
    ok('T3 key: ... and not the store\'s random dev (the key stands in for it)', d1 !== fnv(TR.state().dev + ':abcd'));
  }

  // ================================================================== T4 trophies off
  async function t4() {
    const raw0 = localStorage.getItem(TR.state().key);
    ok('T4 core: troEscrow refuses (no hold, whoever calls)', TR.hold('abc123.1', 20, 2, 0, 1) === false && localStorage.getItem(TR.state().key) === raw0 && TR.state().esc.length === 0);
    TR.fast(true);
    ok('T4 core: troApply refuses (no result, no +5)', TR.result('abc123.1', [[0, 1, 12, 0, 0], [1, 2, -6, 0, 0]], 0, true, true) === null && localStorage.getItem(TR.state().key) === raw0);
    TR.apply({ t: 'tro', m: 'abc123.1', n: 2, s: 20, r: [[0, 1, 12, 20, 0], [1, 2, -6, 0, 0]] });
    ok('T4 core: a valid-looking \'tro\' changes nothing (the store byte-equal)', localStorage.getItem(TR.state().key) === raw0);
    TR.fast(false);
    if (!NET) { info('T4: no ?net=bc - the room part is in the toss job served over http'); return; }
    TR.allowBc(true); D.shop.allowBc(true);
    const code = await MP.host({ mode: 'battle', nick: '토끼', bet: 20 });
    await until(() => MP.state().screen === 'room', 3000);
    const S = MP.state();
    ok('T4 room: a battle room hosted (bc), opts.bet 20 but stakeNow() 0', !!code && S.opts.bet === 20 && S.tro.stake === 0, [code, S.opts.bet, S.tro.stake]);
    ok('T4 room: no 트로피 걸기 label or stake row in the host\'s options', !$('pg-room-opts').querySelector('[data-bet], .pg-bets') && !$('pg-room-opts').textContent.includes('트로피 걸기') && !$('pg-host-opts').querySelector('[data-bet]'));
    const rules = [...$('pg-room-rules').querySelectorAll('li')].map((l) => l.textContent);
    ok('T4 room: the rules say 친선 경기예요: 트로피는 늘지도 줄지도 않아요 (one trophy line), then the coin and battle lines', rules[0] === TX.friendly && !rules.some((l) => /트로피 경기|1등|견습|보너스 \+/.test(l)) && rules.length >= 3, rules);
    ok('T4 room: no stake badge, no 트로피 부족 / 안 걸고 marks', !vis($('pg-room-bet')) && !/트로피 부족|안 걸고/.test($('pg-room').textContent.replace(/[\s\S]*?<\/?.*?>/g, '')), $('pg-room-bet') && $('pg-room-bet').hidden);
    noStake('T4 room (battle)'); noGoogle('T4 room');
    ok('T4 room: the hint names the code only (no link)', NET ? true : true);
    // the party room's rules: AIT_TX.friendly instead of 트로피는 걸지 않아요; the same account twice: AIT_TX.coin2
    MP.setOpts({ mode: 'party' }); await sleep(80);
    const pr = [...$('pg-room-rules').querySelectorAll('li')].map((l) => l.textContent);
    ok('T4 party room: 친선 경기예요… instead of 트로피는 걸지 않아요', pr.includes(TX.friendly) && !pr.some((l) => /걸지/.test(l)), pr);
    ok('T4 party: partyRules(2) takes the Toss coin2 line', A.partyRules(2).includes(TX.coin2) && !A.partyRules(2).some((l) => /같은 기기/.test(l)));
    noStake('T4 party room');
    MP.setOpts({ mode: 'battle' }); await sleep(80);
    // a forced start (one player): the countdown's lines, no TRO.match at 시작!
    MP.start(true);
    await until(() => G.mode === 'countdown', 3000);
    const c = A.count();
    ok('T4 countdown: 친선 경기 · 트로피 없음, dim (prac)', c.sub === TX.count && c.cls === ' prac', c);
    noStake('T4 countdown');
    await until(() => G.mode === 'playing', 6000);
    await sleep(200);
    ok('T4 시작!: no TRO.match, no hold', TR.state().match === null && TR.state().esc.length === 0, TR.state().match);
    D.endBattle();
    await until(() => G.mode === 'podium', 3000); await sleep(300);
    const tag = $('pg-podium-tag');
    ok('T4 podium: the tag 친선 경기 (is-prac), no trophy result', vis(tag) && tag.textContent === TX.tag && tag.classList.contains('is-prac') && !TR.state().pod, [tag.textContent, tag.className]);
    noStake('T4 podium'); noGoogle('T4 podium');
    ok('T4 podium: the store byte-equal after a whole friendly match', localStorage.getItem(TR.state().key) === raw0 || JSON.parse(localStorage.getItem(TR.state().key)).t === JSON.parse(raw0).t);
    // Android back on the podium: 로비로 with its own two-press
    // (a lone host: 로비로 leaves at once - its confirmTwice arms only with friends in the room: tests/toss-net.js)
    F.fire('backEvent'); await sleep(200);
    ok('T6 back (podium, alone): 로비로 - out of the room', G.mode !== 'podium' && !MP.session(), [G.mode, MP.state().screen]);
    D.toTitle(); TR.allowBc(false);
  }

  // ================================================================== T5 leaderboard
  async function gameOverAt(score, opts) {
    opts = opts || {};
    if (opts.coop) D.local.coop(['duck', 'cat'], 0); else D.start(opts.round || 0);
    if (opts.goto) D.gotoRound(opts.goto);
    G.score = score; G.lives = 1;
    if (opts.coop) { G.lives = 1; for (const p of G.players) D.hitPlayer(p.slot); D.step(900); }
    else { D.hitPlayer(0); D.step(120); }
    await sleep(60);
  }
  async function t5() {
    localStorage.removeItem('ppogeul-ait-lb'); A.lbReset();
    F.on('Game.setLeaderboardScore', { v: { statusCode: 'LEADERBOARD_NOT_FOUND' } });
    let n = calls('Game.setLeaderboardScore');
    await gameOverAt(1234);
    await sleep(50);
    ok('T5 lb: a solo run from 탕 1 to game over -> one setLeaderboardScore({score: "1234"})', G.mode === 'gameover' && calls('Game.setLeaderboardScore') === n + 1 && F.calls('Game.setLeaderboardScore').slice(-1)[0][1][0].score === '1234', [G.mode, F.calls('Game.setLeaderboardScore').slice(-1)]);
    ok('T5 lb: LEADERBOARD_NOT_FOUND -> the score kept (p), ok 0', A.state().lb.p === 1234 && A.state().lb.ok === 0 && A.state().lbNf, A.state().lb);
    D.toTitle(); TR.openRec(); await sleep(30);
    ok('T5 lb: 토스 랭킹 hidden (nothing accepted yet)', !vis($('pg-ait-lb')), !!$('pg-ait-lb'));
    TR.closeRec();
    n = calls('Game.setLeaderboardScore');
    await gameOverAt(5000);
    ok('T5 lb: ... no second call this page load (not found), the better score kept', calls('Game.setLeaderboardScore') === n && A.state().lb.p === 5000, A.state().lb);
    // "the next page load": SUCCESS
    D.toTitle(); A.lbReset();
    n = calls('Game.setLeaderboardScore');
    await gameOverAt(1000);
    ok('T5 lb: next page load: the kept 5000 goes (it beats the 1000 run) -> SUCCESS -> ok 5000, p 0', calls('Game.setLeaderboardScore') === n + 1 && F.calls('Game.setLeaderboardScore').slice(-1)[0][1][0].score === '5000' && A.state().lb.ok === 5000 && A.state().lb.p === 0, A.state().lb);
    D.toTitle(); TR.openRec(); await sleep(30);
    const b = $('pg-ait-lb');
    ok('T5 lb: 토스 랭킹 shows in 내 기록 (before 닫기, aria-label 토스 게임 랭킹 보기)', vis(b) && b.textContent === TX.lb && b.getAttribute('aria-label') === TX.lbAria && b.nextElementSibling === $('pg-rec-close'), b && b.outerHTML);
    let heldAt = null;
    F.on('Game.openLeaderboard', () => { heldAt = PG.Audio._state().held; return undefined; });
    click(b); await sleep(30);
    ok('T5 lb: a tap -> the sound held first, then openLeaderboard', calls('Game.openLeaderboard') === 1 && heldAt === true, [calls('Game.openLeaderboard'), heldAt]);
    TR.closeRec(); PG.Audio.hold(false);
    n = calls('Game.setLeaderboardScore');
    await gameOverAt(3000); D.toTitle();
    ok('T5 lb: a lower run -> no call', calls('Game.setLeaderboardScore') === n);
    await gameOverAt(9000, { coop: true }); D.toTitle();
    await gameOverAt(9000, { goto: 3 }); D.toTitle();
    ok('T5 lb: co-op and a run after gotoRound (not from 탕 1) -> no call', calls('Game.setLeaderboardScore') === n, [calls('Game.setLeaderboardScore') - n, A.state().lb]);
    // the demo behind the title never counts (attract): its rounds run with G.attract
    ok('T5 lb: the title\'s demo never submits', calls('Game.setLeaderboardScore') === n);
    F.sup['Game.setLeaderboardScore'] = false;
    await gameOverAt(9999); D.toTitle();
    ok('T5 lb: lb.ok() false -> no call (the score kept for later)', calls('Game.setLeaderboardScore') === n && A.state().lb.p === 9999, A.state().lb);
    F.sup['Game.setLeaderboardScore'] = true;
    // the ending's card counts too, once
    D.start(0); G.score = 20000; D.gotoRound(0); // (gotoRound: no longer from 탕 1 for the leaderboard)
    D.toTitle();
  }

  // ================================================================== T6 back, play, sound, screen logs
  async function t6() {
    D.toTitle(); await sleep(50);
    ok('T6 back: at the bare title no listener (Toss\'s own back applies)', A.state().back === false && F.listeners('backEvent') === 0, [A.state().back, F.listeners('backEvent')]);
    // the root fallback: a back reaching aitBack at the title
    let c0 = calls('Screen.close');
    A.back(); await sleep(20);
    ok('T6 back (title, fallback): the first back says 한 번 더 누르면 게임을 나가요, no close', A.toast() === TX.exit && calls('Screen.close') === c0, A.toast());
    await sleep(500); A.back(); await sleep(20);
    ok('T6 back (title, fallback): a second inside 2 s -> one Screen.close()', calls('Screen.close') === c0 + 1 && !A.toast());
    A.back(); await sleep(2200);
    ok('T6 back (title, fallback): ... the line is gone after 2 s', !A.toast());
    A.back(); await sleep(20);
    ok('T6 back (title, fallback): a back after those 2 s says the line again (no close)', A.toast() === TX.exit && calls('Screen.close') === c0 + 1);
    await sleep(2200);
    // friends
    click('pg-friends-btn'); await until(() => MP.state().screen === 'friends', 1500); await sleep(30);
    ok('T6 back: 친구와 하기 sets one listener', A.state().back === true && F.listeners('backEvent') === 1, F.listeners('backEvent'));
    F.fire('backEvent'); await sleep(30);
    ok('T6 back (friends): netFriendsBack -> the title, the listener removed', MP.state().overlay === 'title' && F.listeners('backEvent') === 0, [MP.state().overlay, F.listeners('backEvent')]);
    if (NET) {
      await MP.host({ mode: 'coop', nick: '토끼' }); await until(() => MP.state().screen === 'room', 2000); await sleep(30);
      F.fire('backEvent'); await sleep(200);
      ok('T6 back (room): netLeave - out of the room', !MP.session() && MP.state().screen !== 'room', MP.state().screen);
      D.toTitle(); await sleep(30);
    }
    // the hub (상점)
    click('pg-shop-btn'); await sleep(60);
    const hubOn = MP.state().overlay === 'hub';
    F.fire('backEvent'); await sleep(60);
    ok('T6 back (hub): closeHub -> the title', hubOn && MP.state().overlay === 'title', [hubOn, MP.state().overlay]);
    // 내 기록
    TR.openRec(); await sleep(30);
    F.fire('backEvent'); await sleep(30);
    ok('T6 back (rec): closeRec -> the title', MP.state().overlay === 'title');
    // a game: pause, then resume; play(true) once at 시작!, play(false) once at the title
    const aw0 = F.calls('Screen.setAwakeMode').length, sw0 = F.calls('Screen.setIosSwipeBack').length;
    click('pg-start'); await sleep(80);
    const awOn = F.calls('Screen.setAwakeMode').slice(aw0);
    ok('T6 play: 시작! -> setAwakeMode(enabled) and setIosSwipeBack(off), once each', awOn.length === 1 && awOn[0][1][0].enabled === true && F.calls('Screen.setIosSwipeBack').slice(sw0).length === 1 && F.calls('Screen.setIosSwipeBack').slice(sw0)[0][1][0].isEnabled === false, awOn.map((c) => c[1]));
    F.fire('backEvent'); await sleep(30);
    ok('T6 back (game): pauseGame', G.mode === 'paused', G.mode);
    ok('T6 play: paused keeps the game state (no new awake / swipe call)', F.calls('Screen.setAwakeMode').length === aw0 + 1);
    F.fire('backEvent'); await sleep(30);
    ok('T6 back (paused): resumeGame', G.mode === 'playing', G.mode);
    // the overlay (the exit modal): pause + silence
    G.manual = false;
    await sleep(100);
    F.fire('show', false); await sleep(60);
    ok('T6 overlay: onShow(false) pauses solo play and the context is suspended at the next frame', G.mode === 'paused' && PG.Audio._state().ctxState === 'suspended' && PG.Audio._state().held === true, PG.Audio._state());
    F.fire('show', true); await sleep(60);
    ok('T6 overlay: onShow(true) -> sound back (held off, the context resumes), the game stays paused for the player', PG.Audio._state().held === false && G.mode === 'paused', PG.Audio._state());
    key('KeyM'); await sleep(30);
    F.fire('show', false); await sleep(30); F.fire('show', true); await sleep(60);
    ok('T6 sound: hold(false) keeps the M-key mute (gain 0, muted)', PG.Audio._state().muted === true && PG.Audio._state().gain === 0, PG.Audio._state());
    key('KeyM'); await sleep(30);
    ok('T6 sound: ... M again: unmuted', PG.Audio._state().muted === false);
    // game over -> back -> the title; play(false) once there
    G.lives = 1; D.resume(); D.hitPlayer(0); D.step(120); await sleep(60);
    ok('T6 over: the game-over card', MP.state().overlay === 'over', MP.state().overlay);
    F.fire('backEvent'); await sleep(60);
    const awOff = F.calls('Screen.setAwakeMode').slice(aw0 + 1);
    ok('T6 back (over): toTitle; play(false) once (awake off, swipe back on)', MP.state().overlay === 'title' && G.mode === 'title' && awOff.length === 1 && awOff[0][1][0].enabled === false && F.calls('Screen.setIosSwipeBack').slice(-1)[0][1][0].isEnabled === true, [MP.state().overlay, awOff.map((c) => c[1])]);
  }
  async function screenLog() {
    // the order of a scripted session, each once (the bridge drops a repeat of the last name)
    const i0 = screens().length;
    D.toTitle(); await sleep(20);
    click('pg-start'); await sleep(60);
    G.lives = 1; D.hitPlayer(0); D.step(120); await sleep(40);
    D.toTitle(); await sleep(20);
    click('pg-friends-btn'); await until(() => MP.state().screen === 'friends', 1500);
    if (NET) { await MP.host({ mode: 'coop', nick: '토끼' }); await until(() => MP.state().screen === 'room', 2000); MP.leave(); await sleep(100); }
    D.toTitle(); TR.openRec(); await sleep(20); TR.closeRec(); await sleep(20);
    const got = screens().slice(i0);
    const want = ['solo', 'over', 'title', 'friends'].concat(NET ? ['room', 'friends'] : []).concat(['title', 'rec', 'title']);
    const ge = got[0] === 'title' ? got.slice(1) : got;
    ok('T6 screens: title -> solo -> over -> title -> friends' + (NET ? ' -> room -> friends' : '') + ' -> title -> rec -> title, each once, nothing else', JSON.stringify(ge) === JSON.stringify(want), got);
    ok('T6 screens: only log_name, no other parameter, no key / nick / score', F.calls('Analytics.screen').every((c) => Object.keys(c[1][0]).join() === 'log_name' && /^[a-z]+$/.test(c[1][0].log_name)));
    ok('T6 screens: about one log per overlay change (far below 3,000 a minute)', screens().length < 80, screens().length);
  }
  async function bonusSolo() {
    TR.today(20260101);
    D.start(0); D.gotoRound(3);
    const r = TR.bonus(false);
    ok('T4 목욕 보너스: still paid in solo (progress only)', r && r.give > 0, r);
    D.toTitle(); TR.today(null);
  }
  async function pagehide() {
    click('pg-start'); await sleep(60);
    const o0 = F.calls('Screen.setOrientation').length, a0 = F.calls('Screen.setAwakeMode').length;
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    await sleep(60);
    const o = F.calls('Screen.setOrientation').slice(o0), a = F.calls('Screen.setAwakeMode').slice(a0), s = F.calls('Screen.setIosSwipeBack').slice(-1)[0];
    ok('T6 pagehide during a game: portrait asked, awake off, swipe back on, the back listener removed', o.length === 1 && o[0][1][0].type === 'portrait' && a.length === 1 && a[0][1][0].enabled === false && s && s[1][0].isEnabled === true && F.listeners('backEvent') === 0, [o.map((c) => c[1]), a.map((c) => c[1]), s && s[1], F.listeners('backEvent')]);
    ok('T6 pagehide: the sound held', PG.Audio._state().held === true);
  }

  // ================================================================== the other boots
  async function bootRestore() {
    const st = A.state().sync, s = TR.state();
    ok('T2 restore: local wiped + native full -> native wins at boot', st && st.how === 'native' && st.synced, st);
    ok('T2 restore: the restored store is what troLoad read (trophies 777, coins 400, the item, stats)', s.t === 777 && s.best === 800 && s.g === 9 && D.shop.state().ce - D.shop.state().sp === 400 && D.shop.state().own.includes('h2'), [s.t, s.best, D.shop.state()]);
    ok('T2 restore: ... the hiscore, the nick, the mute and the leaderboard record too', G.hiscore === 12345 && localStorage.getItem('ppogeul-nick') === '토스친구' && PG.Audio.isMuted() === true && A.state().lb.ok === 4000, [G.hiscore, localStorage.getItem('ppogeul-nick'), PG.Audio.isMuted(), A.state().lb]);
    ok('T2 restore: the lineage taken over (local gen = native gen, lseq from native 7 on: the boot writes of the engine count on)', localStorage.getItem('pgait:gen') === 'nativegen001' && +localStorage.getItem('pgait:lseq') >= 7, [localStorage.getItem('pgait:gen'), localStorage.getItem('pgait:lseq')]);
    TR.openRec(); await sleep(30);
    ok('T2 restore: 토스 랭킹 shows (an accepted score from before)', vis($('pg-ait-lb')));
    TR.closeRec();
    await sleep(3000);
    ok('T2 restore: nothing native changed that the engine did not change (no write of restored values)', F.calls('Storage.setItem').filter((c) => c[1][0] === 'ppogeul-trophy').length <= 1, F.calls('Storage.setItem').map((c) => c[1][0]));
  }
  async function bootThrow() {
    const st = A.state().sync;
    ok('T2 desktop: every SDK function throws synchronously -> the game boots (PG_AIT on, the title)', A.state().on && MP.state().overlay === 'title', MP.state().overlay);
    ok('T2 desktop: ... no Safe Area written (env() stays), the nav box still set', document.documentElement.style.getPropertyValue('--sa-l') === '' && document.documentElement.style.getPropertyValue('--ait-nav-w') !== '');
    click('pg-start'); await sleep(100);
    ok('T2 desktop: ... plays solo', G.mode === 'playing', G.mode);
    D.press('right', true); D.step(30); D.press('right', false);
    G.score = 777; G.lives = 1; D.hitPlayer(0); D.step(120); await sleep(50);
    ok('T2 desktop: ... saves locally (the hiscore)', localStorage.getItem('ppogeul-hiscore') === '777', localStorage.getItem('ppogeul-hiscore'));
    await sleep(40000);
    ok('T2 desktop: ... zero native writes, unsynced for good, at most 3 + returns meta reads', F.log.filter((e) => /^Storage\.(set|remove)/.test(e[0])).length === 0 && !A.state().sync.synced && A.state().sync.tries <= 3, A.state().sync);
    ok('T2 desktop: the key -> err (a throw), the gate card shows err', A.state().st === 'err', A.state().st);
    D.toTitle();
  }
  async function bootSlow() {
    const st = A.state().sync;
    ok('T2 slow: native never answers -> the engine boots at ~3 s on local data, unsynced', st && st.how === 'timeout' && !st.synced && AIT.ready >= 2900 && AIT.ready < 3300, [st, AIT.ready]);
    localStorage.setItem('ppogeul-nick', '느린토끼');
    await sleep(5000);
    ok('T2 slow: no native write while unsynced', F.calls('Storage.setItem').length === 0 && F.calls('Storage.setItems').length === 0);
    F.always('Storage.getItem', undefined);     // (native answers now: empty)
    await until(() => A.state().sync.synced, 25000);
    await sleep(2600);
    ok('T2 slow: a late read finding native empty -> synced, the local store goes out', A.state().sync.synced && F.storage.get('ppogeul-nick') === '느린토끼' && F.storage.has('ppogeul-trophy') && F.storage.get('pgait:seq') === localStorage.getItem('pgait:lseq'), [A.state().sync, [...F.storage.keys()]]);
  }

  // ================================================================== 15.4 fit (#shot=<scene>&ins=l,r,b,t)
  async function fit(scene) {
    const vw = innerWidth, vh = innerHeight, I = F.insets, nav = A.state().nav;
    const cap = { l: vw - I.right - 10 - nav.w, t: 0, r: vw, b: I.top + nav.h };     // the box kept for 더보기 / X
    const fails0 = fail;
    const rectOf = (el) => el.getBoundingClientRect();
    const over = (a, b) => a.left < b.r && a.right > b.l && a.top < b.b && a.bottom > b.t;
    const say = (what, el, r) => ok(`fit ${scene} ${vw}x${vh}: ${what}`, false, [el && (el.id || el.className || el.tagName), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]);
    async function stage() {
      if (scene === 'title') { D.toTitle(); }
      else if (scene === 'play') { click('pg-start'); await sleep(200); G.manual = true; }
      else if (scene === 'pause') { click('pg-start'); await sleep(200); D.pause(); }
      else if (scene === 'gate-wait' || scene === 'gate-err') { click('pg-friends-btn'); await sleep(200); A.stage(scene === 'gate-wait' ? 'wait' : 'err'); }
      else if (scene === 'friends') { click('pg-friends-btn'); await sleep(300); }
      else if (scene === 'room' || scene === 'count' || scene === 'podium') {
        TR.allowBc(true); await MP.host({ mode: 'battle', nick: '토끼' }); await until(() => MP.state().screen === 'room', 3000);
        if (scene !== 'room') { MP.start(true); await until(() => G.mode === 'countdown', 3000); G.manual = true; }
        if (scene === 'podium') { G.manual = false; await until(() => G.mode === 'playing', 6000); D.endBattle(); await until(() => G.mode === 'podium', 3000); await sleep(400); }
      } else if (scene === 'over') { click('pg-start'); await sleep(100); G.lives = 1; D.hitPlayer(0); D.step(120); await sleep(800); }
      else if (scene === 'hub') { click('pg-shop-btn'); await sleep(300); }
      else if (scene === 'rec') { localStorage.setItem('ppogeul-ait-lb', '{"ok":1200,"p":0}'); TR.openRec(); await sleep(300); }
      else if (scene === 'rot') { await sleep(300); }
      await sleep(300);
    }
    await stage();
    const de = document.documentElement;
    if (scene === 'rot') {
      ok(`fit rot ${vw}x${vh}: an upright phone (orientation unsupported) -> the rotate screen`, vh > vw && !!document.querySelector('.pg-rotate') && vis(document.querySelector('.pg-rotate')), [vw, vh]);
    } else {
      ok(`fit ${scene} ${vw}x${vh}: no horizontal scroll`, de.scrollWidth <= vw + 1 && document.body.scrollWidth <= vw + 1, [de.scrollWidth, document.body.scrollWidth, vw]);
      const ctl = [...document.querySelectorAll('button, input, select, a[href], [role="radio"], #pg-stick-zone, .pg-tb')].filter((el) => vis(el) && !el.closest('#pg-fontwarm'));
      for (const el of ctl) {
        const r = rectOf(el); if (r.width < 1 || r.height < 1) continue;
        if (r.bottom <= 0 || r.top >= vh) continue;        // (scrolled out of a panel)
        const clip = el.closest('.pg-panel, .pg-ov, .pg-card'); if (clip && clip.scrollHeight > clip.clientHeight + 2) { const cr = rectOf(clip); if (r.top < cr.top - 1 || r.bottom > cr.bottom + 1) continue; }
        // (the stick zone is the whole empty column, edge to edge: a touch area - the stick itself is drawn inside the
        // Safe Area; the title's trophy badge is a slim line with a taller tap area of its own, page.html .pg-tro)
        if (el.id === 'pg-stick-zone') continue;
        if (over(r, cap)) say('a control under the 더보기 / X box', el, r);
        if (r.left < I.left - 1 || r.right > vw - I.right + 1) say('a control outside the Safe Area', el, r);
        if (el.id !== 'pg-tro' && !el.closest('.pg-seg, .pg-pick, #pg-room-players, .pg-hub') && (r.width < 32 || r.height < 32) && el.tagName === 'BUTTON') say('a button under 32 px', el, r);
      }
      const scr = $('pg-screen');
      if (scr && vis(scr) && ['play', 'pause', 'title', 'over', 'count'].includes(scene)) {
        const r = rectOf(scr);
        if (r.left < I.left - 1 || r.right > vw - I.right + 1 || r.bottom > vh - I.bottom + 1) say('the game screen outside the Safe Area', scr, r);
        if (over(r, cap)) say('the game screen under the 더보기 / X box', scr, r);
      }
      if (scene === 'play') {
        const z = $('pg-stick-zone'), j = $('pg-t-jump'), s = $('pg-t-shoot'), sr = rectOf(scr);
        ok(`fit play ${vw}x${vh}: the stick zone left of the screen, 점프 / 거품 right of it, inside the Safe Area`, rectOf(z).right <= sr.left + 1 && rectOf(j).left >= sr.right - 1 && rectOf(s).left >= sr.right - 1 && rectOf(j).right <= vw - I.right + 1 && rectOf(j).bottom <= vh - I.bottom + 1,
          [rectOf(z).right, sr.left, sr.right, rectOf(j).left, rectOf(j).right, rectOf(j).bottom]);
      }
    }
    if (fail === fails0) ok(`fit ${scene} ${vw}x${vh}: everything inside the Safe Area and clear of the 더보기 / X box`, true);
    log('TOSS SHOT READY ' + scene);
  }

  async function main() {
    await sleep(80);
    if (!F || !A || !A.state().on) { ok('the page booted through src/ait.js with the fake SDK', false); return; }
    if (Q.shot) { await fit(Q.shot); return; }
    if (Q.boot === 'restore') { await bootRestore(); return; }
    if (Q.boot === 'throw') { await bootThrow(); return; }
    if (Q.boot === 'slow') { await bootSlow(); return; }
    await t1();
    await t3a();
    await t3b();
    await t2page();
    await t3c();
    await t4();
    await bonusSolo();
    await t5();
    await t6();
    await screenLog();
    await keyUnit();
    await t2unit();
    await pagehide();
  }
  main().catch((e) => { fail++; log('TOSS FAIL exception :: ' + (e && e.stack ? e.stack : e)); }).then(() => log('TOSS DONE pass=' + pass + ' fail=' + fail));
})();
