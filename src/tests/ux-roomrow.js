// UX check (phone width): the room screen's sticky ready / start / leave row is opaque - nothing scrolled under it
// shows through - and the header keeps its sound / menu buttons on screen while the connection chip shows.
// Hosts a battle room on the 'bc' transport (served over http), shows the settings (time, 능력 끄기 ...) so the
// panel scrolls, and samples the row: every point of the status line must hit the row itself (elementFromPoint),
// and the row's background must be fully opaque.
//   node tools/run-chrome.js http://localhost:8765/test-ux-roomrow.html?net=bc C:/Temp/bogeul/ux-roomrow.png 360 640 rt30000 "ROOMROW DONE"
// Prints "ROOMROW PASS|FAIL <name>" and "ROOMROW DONE pass=N fail=M".
(function () {
  'use strict';
  let pass = 0, fail = 0;
  const log = (s) => console.log(s);
  const ok = (name, cond, info) => { if (cond) { pass++; log('ROOMROW PASS ' + name); } else { fail++; log('ROOMROW FAIL ' + name + (info !== undefined ? ' :: ' + JSON.stringify(info) : '')); } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function main() {
    const D = PG.debug;
    const code = await D.mp.host({ mode: 'battle', nick: '방장', char: 'duck' });
    ok('a battle room is open', !!code, code);
    await sleep(400);
    const panel = document.getElementById('pg-room'), row = document.querySelector('.pg-room-actions');
    const scrolls = panel.scrollHeight > panel.clientHeight + 4;
    log('ROOMROW INFO panel ' + panel.clientHeight + '/' + panel.scrollHeight + ' scrolls ' + scrolls);
    const bg = getComputedStyle(row).backgroundColor;
    const alpha = (() => { const m = bg.match(/rgba?\(([^)]+)\)/); if (!m) return 0; const p = m[1].split(',').map((x) => parseFloat(x)); return p.length > 3 ? p[3] : 1; })();
    ok('the row background is opaque', alpha >= 0.999, bg);
    // sample the whole row (status text and the button strip): every point belongs to the row
    const r = row.getBoundingClientRect();
    const bad = [];
    for (let y = r.top + 2; y < Math.min(r.bottom - 16, innerHeight - 2); y += 6) {
      for (let x = r.left + 6; x < r.right - 6; x += 12) {
        const el = document.elementFromPoint(x, y);
        if (el && !row.contains(el)) bad.push([Math.round(x), Math.round(y), el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : '')]);
      }
    }
    ok('nothing from the settings sits on top of the row', bad.length === 0, bad.slice(0, 6));
    // what lies right under the status line must be hidden by it: the row is above the settings in paint order
    const msg = document.getElementById('pg-room-msg').getBoundingClientRect();
    const under = [...panel.querySelectorAll('.pg-seg button, .pg-opts span, .pg-opts select, .pg-rules li')].filter((e) => {
      const b = e.getBoundingClientRect(); return b.bottom > msg.top && b.top < msg.bottom && b.right > msg.left && b.left < msg.right;
    });
    log('ROOMROW INFO elements under the status line ' + under.length);
    // the header with the longest connection chip (as setChip('bad') shows it): the sound / menu buttons stay fully on screen
    const chip = document.getElementById('pg-net-chip'), head = document.getElementById('pg-head');
    chip.hidden = false; chip.textContent = '연결이 불안정해요'; chip.className = 'pg-chip is-bad'; head.classList.add('pg-has-chip');
    await sleep(50);
    const icons = [...document.querySelectorAll('#pg-head .pg-icon')].map((e) => { const b = e.getBoundingClientRect(); return { id: e.id, l: Math.round(b.left), r: Math.round(b.right) }; });
    const vw = document.documentElement.clientWidth;
    ok('with the chip showing, the header buttons stay on screen (inside a 16 px gutter)', icons.length === 2 && icons.every((b) => b.l >= 0 && b.r <= vw - 15), { vw, icons });
    const cb = chip.getBoundingClientRect();
    ok('the chip is readable (not squeezed under 60 px)', cb.width >= 60, Math.round(cb.width));
    chip.hidden = true; chip.textContent = ''; head.classList.remove('pg-has-chip');
    // 파티 (design/party.md 9.7): the mode segment's 3 buttons and the 판 수 row on one line each, no sideways scroll
    D.mp.setOpts({ mode: 'party' }); await sleep(250);
    const btns = [...panel.querySelectorAll('[data-modes] [data-mode]')].filter((b) => b.offsetParent), tops = new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top)));
    ok('party: the mode segment holds its 3 buttons (같이 하기 · 배틀 · 파티) on one row', btns.length === 3 && tops.size === 1, [btns.length, [...tops]]);
    const rb = [...panel.querySelectorAll('#pg-room-opts [data-rounds]')], rt = new Set(rb.map((b) => Math.round(b.getBoundingClientRect().top)));
    ok('party: the 판 수 row (3판 / 5판) on one line; the battle-only rows hidden', rb.length === 2 && rt.size === 1 && rb.every((b) => !!b.offsetParent) && [...panel.querySelectorAll('#pg-room-opts [data-for="b"]')].every((e) => e.hidden), [rb.length, [...rt]]);
    ok('party: no sideways scroll at this width (' + innerWidth + ' px)', panel.scrollWidth <= panel.clientWidth + 1 && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, [panel.scrollWidth, panel.clientWidth]);
    D.mp.setOpts({ mode: 'battle' }); await sleep(100);
    // (the room stays open for the screenshot)
    log('ROOMROW DONE pass=' + pass + ' fail=' + fail);
  }
  function go() { if (window.PG && PG.debug && PG.debug.mp) setTimeout(() => main().catch((e) => { fail++; log('ROOMROW FAIL threw ' + e.message); log('ROOMROW DONE pass=' + pass + ' fail=' + fail); }), 200); else setTimeout(go, 30); }
  go();
})();
