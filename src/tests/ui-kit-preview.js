// UI preview + fit check (v4 character kits, page.html): the title picker's kit card (#pg-kit), the room's compact
// card (#pg-room-kit) and the touch JUMP sub-label. When game.js has not filled them yet (the stats container is
// still empty), this driver fills them from the spec table (design/char-kits.md §12.1) so the final look can be
// screenshotted; once game.js fills them, it only picks the animal and measures game.js's own output.
// Hash: a comma list of: touch (phone mode, as a first touch does), duck|capy|otter|penguin|cat|frog, off (능력 끄기),
//   room (hosts a battle room; needs ?net=bc), long (every text at the spec's longest), sub (show the touch JUMP sub-label).
//   node bogeul/build.js
//   node bogeul/tools/run-chrome.js "test-ui-kit-preview.html#capy" C:/Temp/bogeul/kit-desk.png 900 760 3000
//   real phone viewports (headless windows never go below ~500 px wide): cdp-run with mobile=1
//   node bogeul/tools/cdp-run.js "test-ui-kit-preview.html#touch,capy" C:/Temp/bogeul/kit-phone.png 390 844 15000 "KIT DONE" 1
//   node bogeul/tools/cdp-run.js "test-ui-kit-preview.html?net=bc#room,off" C:/Temp/bogeul/kit-room.png 900 760 15000 "KIT DONE"
// Checks: the title card needs no scrolling whenever the game screen is at least 0.9x (below that the card's own
// scrolling is the fallback) and sits inside the game screen; no kit line overflows its box; the card's blocks and the
// kit's rows never overlap; phones hide the tag / how / bubble lines; the JUMP button keeps its size with the sub-label.
// Prints "KIT INFO ..." and "KIT DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => { if (cond) { pass++; log('KIT PASS ' + name); } else { fail++; log('KIT FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const flags = (location.hash || '').slice(1).split(',').filter(Boolean);
  const has = (f) => flags.indexOf(f) >= 0;
  const IDS = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'];
  const animal = IDS.find(has) || 'duck';
  // design/char-kits.md §12.1 (+ §3-§8 names / animals)
  const KITS = {
    duck: ['꽥꽥이', '고무 오리', '만능', '처음이라면 추천', '처음이라면 꽥꽥이! 둥실 날고 메아리 쏘기', '둥실 활공', '떨어질 때 점프를 꾹! 둥실둥실 천천히', '메아리 거품', '멀리 갔다가 다시 돌아와요', '꾹: 활공', [3, 3, 3, 3], '#ffe36b'],
    capy: ['까삐', '카피바라', '든든', '왕방울 · 온탕 보호막', '느긋한 왕방울, 엉덩방아로 때를 불려요', '털썩 엉덩방아', '공중에서 점프 한 번 더! 쿵, 때가 불어요', '왕방울 거품', '크고 느릿느릿, 잘 맞아요', '두 번: 쿵', [2, 3, 2, 3], '#ffa98a'],
    otter: ['해롱이', '해달', '돌격', '', '휙 날아들어 세 갈래 물장구!', '휙 대시', '공중에서 점프 한 번 더! 옆으로 휙', '물장구 거품', '세 갈래로 촤악 퍼져요', '두 번: 대시', [4, 3, 2, 2], '#5fe0c8'],
    penguin: ['펭펭', '펭귄', '저격', '', '배로 쭉 미끄러져 멀리 쏘는 저격수', '쭉 배미끄럼', '공중에서 점프 한 번 더! 배로 쭉~', '고드름 거품', '빠르게 아주 멀리 날아가요', '두 번: 쭉', [5, 3, 5, 1], '#9fdcff'],
    cat: ['냥냥', '고양이', '곡예', '', '2단 점프로 폴짝, 털실은 데굴데굴', '냥냥 2단 점프', '공중에서 점프 한 번 더! 더 높이', '털실 거품', '땅에서 쏘면 통통 굴러가요', '두 번: 2단', [3, 5, 3, 3], '#c9a8ff'],
    frog: ['개굴이', '개구리', '함정', '', '폴짝폴짝 뛰며 개구리알 함정 깔기', '개굴 3단 뛰기', '착지하자마자 또 점프! 점점 높이', '개구리알 거품', '앞에 멈춰 기다리는 함정', '착지 때 또', [3, 4, 1, 4], '#9be86a'],
  };
  // the longest text of each field across the six (the worst case for the fit checks)
  const LONG = ['개굴이', '고무 오리', '만능', '왕방울 · 온탕 보호막', '처음이라면 꽥꽥이! 둥실 날고 메아리 쏘기', '개굴 3단 뛰기', '공중에서 점프 한 번 더! 쿵, 때가 불어요', '개구리알 거품', '땅에서 쏘면 통통 굴러가요', '두 번: 대시', [5, 5, 5, 5], '#ffe36b'];
  const STAT_NAMES = ['속도', '점프', '사거리', '연사'];
  const OFF_LINE = '능력 꺼짐 · 모두 같은 기본 능력이에요';
  const setText = (id, s) => { const e = $(id); if (e) e.textContent = s; };
  function statRows(box, vals) {
    box.textContent = '';
    STAT_NAMES.forEach((nm, i) => {
      const s = document.createElement('span'); s.className = 'pg-stat'; s.setAttribute('role', 'img');
      s.setAttribute('aria-label', nm + ' 5점 중 ' + vals[i] + '점');
      const b = document.createElement('b'); b.textContent = nm; s.appendChild(b);
      for (let j = 0; j < 5; j++) { const p = document.createElement('i'); if (j < vals[i]) p.className = 'on'; s.appendChild(p); }
      box.appendChild(s);
    });
  }
  // the static fill (only while game.js leaves the kit empty)
  function fill(k, off) {
    const vals = off ? [3, 3, 3, 3] : k[10];
    const kit = $('pg-kit');
    if (kit) {
      kit.style.setProperty('--hue', k[11]); kit.classList.toggle('off', off);
      setText('pg-pick-name', k[0]); setText('pg-pick-animal', k[1]); setText('pg-pick-role', k[2]); setText('pg-pick-badge', k[3]);
      setText('pg-pick-perk', k[4]); setText('pg-pick-move', k[5]); setText('pg-pick-movehow', k[6]); setText('pg-pick-bub', k[7]); setText('pg-pick-bubdesc', k[8]);
      kit.setAttribute('aria-label', k[0] + ' (' + k[1] + '): ' + k[4] + '. 특기 ' + k[5] + ': ' + k[6] + '. 거품 ' + k[7] + ': ' + k[8]);
      if ($('pg-pick-stats')) statRows($('pg-pick-stats'), vals);
    }
    const rk = $('pg-room-kit');
    if (rk) {
      rk.style.setProperty('--hue', k[11]); rk.classList.toggle('off', off);
      setText('pg-room-pname', k[0]); setText('pg-room-role', k[2]); setText('pg-room-pperk', off ? OFF_LINE : k[5]);
      if ($('pg-room-stats')) statRows($('pg-room-stats'), vals);
    }
    const sub = $('pg-t-jump-sub');
    if (sub) { sub.textContent = k[9]; sub.hidden = off; }
  }
  const rect = (e) => e.getBoundingClientRect();
  const shown = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const r1 = (n) => Math.round(n * 10) / 10;
  // a pair of boxes overlapping by more than a pixel either way
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  function noOverlap(name, els) {
    const v = els.filter(shown), bad = [];
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (overlap(rect(v[i]), rect(v[j]))) { const p = rect(v[i]), q = rect(v[j]); bad.push((v[i].id || v[i].className) + ' x ' + (v[j].id || v[j].className) + ' [' + [p.left, p.right, p.top, p.bottom].map(r1).join(',') + ' / ' + [q.left, q.right, q.top, q.bottom].map(r1).join(',') + ']'); }
    ok(name, bad.length === 0, bad);
  }
  // every line of a kit: nothing wider than its box (a cut "how" with an ellipsis is allowed: it is cut on purpose)
  function noSpill(name, kit) {
    const bad = [];
    const kr = rect(kit);
    for (const e of kit.querySelectorAll('p, .pg-kit-stats, .pg-stat, p > *')) {
      if (!shown(e)) continue;
      const r = rect(e);
      if (r.right > kr.right + 0.5 || r.left < kr.left - 0.5) bad.push((e.id || e.className || e.tagName) + ' ' + r1(r.left) + '..' + r1(r.right) + ' kit ' + r1(kr.left) + '..' + r1(kr.right));
      if (e.matches('p') && e.scrollWidth > e.clientWidth + 1) bad.push((e.id || e.className) + ' scrollW ' + e.scrollWidth + '>' + e.clientWidth);
    }
    ok(name, bad.length === 0, bad);
  }
  async function main() {
    for (let i = 0; i < 300 && !(window.PG && PG.debug); i++) await sleep(20);
    const D = PG.debug;
    let roomByGame = false;
    if (has('touch')) window.dispatchEvent(new Event('touchstart')); // what a first touch does (setTouchMode + fit)
    const k = has('long') ? LONG : KITS[animal];
    // pick the animal the way a player does (game.js renders its own kit if it has one)
    try { const b = document.querySelector('#pg-pick [data-char="' + animal + '"]'); if (b) b.click(); } catch (e) { /* ignore */ }
    try { if (has('off')) D.setPerks(false); } catch (e) { /* ignore */ }
    await sleep(60);
    const byGame = !!($('pg-pick-stats') && $('pg-pick-stats').children.length);
    log('KIT INFO filled by ' + (byGame ? 'game.js' : 'this driver (game.js left the kit empty)') + ' animal=' + animal + ' flags=' + flags.join(','));
    if (!byGame || has('long')) fill(k, has('off'));
    if (has('sub') && $('pg-t-jump-sub')) { $('pg-t-jump-sub').hidden = false; if (!$('pg-t-jump-sub').textContent) $('pg-t-jump-sub').textContent = k[9]; }
    if (has('room')) {
      let code = null;
      try { code = await D.mp.host({ mode: 'battle', nick: '방장', char: animal, perks: !has('off') }); } catch (e) { log('KIT INFO host failed ' + (e && e.message)); }
      ok('a battle room is open', !!code, code);
      await sleep(500);
      roomByGame = !!($('pg-room-stats') && $('pg-room-stats').children.length);
      if (!roomByGame || has('long')) fill(k, has('off'));
    }
    await sleep(700); // web fonts
    try { await Promise.race([document.fonts.ready, sleep(4000)]); } catch (e) { /* ignore */ }
    let sign = false; try { sign = document.fonts.check('12px "Black Han Sans"', '뽀득'); } catch (e) { /* ignore */ }
    log('KIT INFO web font Black Han Sans ' + (sign ? 'loaded' : 'NOT loaded (fallback font)'));
    // ---- the title card
    const screen = $('pg-screen'), fs = parseFloat(getComputedStyle(screen).fontSize);
    const sr = rect(screen);
    log('KIT INFO viewport ' + innerWidth + 'x' + innerHeight + ' screen ' + r1(sr.width) + 'x' + r1(sr.height) + ' fs ' + fs + ' = ' + r1(sr.width / fs) + 'x' + r1(sr.height / fs) + 'em touch=' + $('pg-app').classList.contains('pg-touch-on'));
    if (!has('room')) {
      const card = document.querySelector('.pg-title-card'), kit = $('pg-kit');
      const cr = rect(card);
      log('KIT INFO title card ' + r1(cr.width) + 'x' + r1(cr.height) + ' = ' + r1(cr.width / fs) + 'x' + r1(cr.height / fs) + 'em, free height ' + r1((sr.height - cr.height) / fs) + 'em, scrollH ' + card.scrollHeight + ' clientH ' + card.clientHeight);
      if (kit) { const kr = rect(kit); log('KIT INFO kit ' + r1(kr.width) + 'x' + r1(kr.height) + ' = ' + r1(kr.width / fs) + 'x' + r1(kr.height / fs) + 'em'); }
      for (const e of card.children) log('KIT INFO   ' + (e.id || e.className) + ' h=' + r1(rect(e).height / fs) + 'em' + (shown(e) ? '' : ' (hidden)'));
      // the card fits whenever the game screen is at least 0.9x (230x202 px); below that its own scrolling is the fallback
      const big = sr.width >= 0.9 * 256;
      if (big) ok('the title card needs no scrolling (nothing cut off)', card.scrollHeight <= card.clientHeight + 1, [card.scrollHeight, card.clientHeight]);
      else log('KIT INFO screen under 0.9x: the card ' + (card.scrollHeight > card.clientHeight + 1 ? 'scrolls (the fallback)' : 'fits'));
      ok('the title card sits inside the game screen', cr.top >= sr.top - 0.5 && cr.bottom <= sr.bottom + 0.5 && cr.left >= sr.left - 0.5 && cr.right <= sr.right + 0.5, [cr.top, cr.bottom, sr.top, sr.bottom]);
      noOverlap('the title card blocks never overlap', [...card.children]);
      if (kit) {
        noSpill('no kit line spills out of the card', kit);
        noOverlap('the kit rows never overlap', [...kit.children].filter((e) => !e.matches('.pg-kit-stats')).concat([...kit.querySelectorAll('.pg-stat')]));
        noOverlap('the head items never overlap', [...kit.querySelectorAll('.pg-kit-head > *')]);
        const rows = [...kit.querySelectorAll('.pg-stat')];
        ok('4 stat rows, each with 5 pips', rows.length === 4 && rows.every((s) => s.querySelectorAll('i').length === 5), rows.length);
        const tops = rows.map((s) => r1(rect(s).top));
        const twoByTwo = rows.length === 4 && tops[0] === tops[1] && tops[2] === tops[3] && tops[2] > tops[0];
        log('KIT INFO stat rows at ' + tops.join(',') + (twoByTwo ? ' (2x2)' : ''));
        if (!has('touch') && sr.width / fs > 15.5) ok('desktop: the stats sit 2x2', twoByTwo, tops);
        const head = kit.querySelector('.pg-kit-head'), hb = rect(head);
        log('KIT INFO head height ' + r1(hb.height / fs) + 'em (' + ([...head.children].filter(shown).map((e) => r1(rect(e).top - hb.top)).join(',')) + ')');
        const onPhone = has('touch') && (innerWidth <= 600 || innerHeight <= 560);
        const extra = ['.pg-kit-tag', '.pg-kit-how', '.pg-kit-bubline'].map((q) => kit.querySelector(q));
        if (onPhone) ok('phone: the tag, how and bubble lines are hidden', extra.every((e) => !shown(e)), extra.map(shown));
        if (!has('touch') && sr.height / fs > 35) ok('roomy screen: the tag, how and bubble lines show', extra.every(shown), extra.map(shown));
        const how = kit.querySelector('.pg-kit-how');
        if (shown(how)) log('KIT INFO how cut: ' + (how.scrollWidth > how.clientWidth + 1) + ' (' + how.scrollWidth + '/' + how.clientWidth + ')');
        for (const q of ['.pg-kit-badge', '.pg-kit-tag', '.pg-kit-line b + span']) { const e = kit.querySelector(q); if (shown(e)) log('KIT INFO ' + q + ' cut: ' + (e.scrollWidth > e.clientWidth + 1) + ' (' + e.scrollWidth + '/' + e.clientWidth + ')'); }
        const pip = kit.querySelector('.pg-stat i.on');
        if (pip) log('KIT INFO filled pip ' + getComputedStyle(pip).backgroundColor + ' size ' + r1(rect(pip).width) + 'px');
      }
    } else {
      if (!roomByGame || has('long')) fill(k, has('off')); // (today's renderRoom rewrites the line with the v3 perk)
      const rk = $('pg-room-kit'), panel = $('pg-room');
      if (rk) {
        const kr = rect(rk);
        log('KIT INFO room kit ' + r1(kr.width) + 'x' + r1(kr.height) + ' panel scrollW ' + panel.scrollWidth + ' clientW ' + panel.clientWidth);
        noSpill('room: no kit line spills out of the card', rk);
        noOverlap('room: the kit rows never overlap', [...rk.children].filter((e) => !e.matches('.pg-kit-stats')).concat([...rk.querySelectorAll('.pg-stat')]));
        ok('room: the panel never scrolls sideways', panel.scrollWidth <= panel.clientWidth + 1, [panel.scrollWidth, panel.clientWidth]);
        const box = rk.parentElement, br = rect(box);
        ok('room: the kit stays inside its box', kr.left >= br.left && kr.right <= br.right + 0.5, [kr.left, kr.right, br.left, br.right]);
        rk.scrollIntoView({ block: 'center' });
      }
    }
    // ---- the touch JUMP button keeps its size (and hit area) with the sub-label
    const tj = $('pg-t-jump'), sub = $('pg-t-jump-sub');
    if (tj && shown(tj) && sub) {
      const was = sub.hidden, a = rect(tj);
      sub.hidden = false; if (!sub.textContent) sub.textContent = k[9];
      const b = rect(tj), sb = rect(sub);
      log('KIT INFO jump ' + r1(b.width) + 'x' + r1(b.height) + ' sub ' + r1(sb.width) + 'x' + r1(sb.height) + ' font ' + getComputedStyle(sub).fontSize);
      ok('JUMP keeps its size with the sub-label', Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5, [a.width, a.height, b.width, b.height]);
      ok('the sub-label sits inside the round button', sb.left >= b.left + 2 && sb.right <= b.right - 2 && sb.bottom <= b.bottom - 4, [sb.left, sb.right, sb.bottom, b.left, b.right, b.bottom]);
      sub.hidden = was;
    }
    log('KIT DONE pass=' + pass + ' fail=' + fail);
  }
  main().catch((e) => { log('KIT FAIL driver error :: ' + (e && e.stack)); log('KIT DONE pass=' + pass + ' fail=' + (fail + 1)); });
})();
