// v3 sprite driver: checks the six animals' sprites and the multiplayer marks from sprites.js inside the real page
// (names, frame counts, sizes, palette, ground line, distinct silhouettes; v4: the move poses and bubble glyphs) and
// then stages an in-engine scene that shows them through the engine's own renderer, for a screenshot.
// Usage: node bogeul/build.js && node bogeul/tools/run-chrome.js "test-v3-sprites.html?scene=battle" v3s.png 900 760 9000
//   scene = solo (each animal in round 1, default) | battle (4 animals, one trapped) | coop (one ghost) | podium
//   Prints "V3-SPRITES PASS ..." or "V3-SPRITES FAIL <reasons>".
(function () {
  'use strict';
  const PG = window.PG || {};
  const fails = [];
  const bad = (m) => fails.push(m);
  const CHARS = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'];
  const scene = (/[?&]scene=([a-z]+)/.exec(location.search) || [0, 'solo'])[1];

  // ---- 1. the sprite table
  const S = PG.SPRITES || {}, P = PG.PALETTE || {};
  const want = { crown: [1, 8, 8], tag_arrow: [1, 5, 3], ready: [1, 8, 8] };
  for (const c of CHARS) {
    Object.assign(want, {
      [c + '_idle']: [2, 16, 16], [c + '_walk']: [4, 16, 16], [c + '_jump']: [1, 16, 16], [c + '_fall']: [1, 16, 16],
      [c + '_shoot']: [1, 16, 16], [c + '_die']: [4, 16, 16], [c + '_trapped']: [2, 16, 16], [c + '_ghost']: [2, 16, 16],
      ['life_' + c]: [1, 8, 8], ['portrait_' + c]: [1, 32, 32],
    });
  }
  // v4 (char-kits §11): one move pose per animal (none for the frog) and the 5x5 bubble glyphs
  Object.assign(want, { duck_glide: [2, 16, 16], capy_slam: [1, 16, 16], otter_dash: [1, 16, 16], penguin_slide: [1, 16, 16], cat_flip: [1, 16, 16] });
  for (const c of CHARS) want['icon_' + c] = [c === 'cat' ? 2 : 1, 5, 5];
  for (const n in want) {
    const [k, w, h] = want[n], fr = S[n];
    if (!Array.isArray(fr)) { bad(n + ' missing'); continue; }
    if (fr.length !== k) bad(n + ' has ' + fr.length + ' frames, want ' + k);
    fr.forEach((f, i) => {
      if (!Array.isArray(f) || f.length !== h || f.some((r) => typeof r !== 'string' || r.length !== w)) { bad(n + '[' + i + '] not ' + w + 'x' + h); return; }
      for (const r of f) for (const ch of r) if (ch !== '.' && !(ch in P)) { bad(n + '[' + i + '] unknown colour ' + ch); return; }
    });
  }
  const nPal = Object.keys(P).length;
  if (nPal > 64) bad('palette has ' + nPal + ' colours');
  const lowest = (f) => { let l = -1; f.forEach((r, y) => { if (/[^.]/.test(r)) l = y; }); return l; };
  for (const c of CHARS) for (const n of ['_idle', '_shoot']) (S[c + n] || []).forEach((f, i) => { if (lowest(f) !== 15) bad(c + n + '[' + i + '] floats'); });
  const masks = CHARS.map((c) => ((S[c + '_idle'] || [])[0] || []).join('').replace(/[^.]/g, '#'));
  for (let a = 0; a < CHARS.length; a++) for (let b = a + 1; b < CHARS.length; b++) {
    let d = 0; for (let i = 0; i < masks[a].length; i++) if (masks[a][i] !== masks[b][i]) d++;
    if (d < 28) bad('silhouettes ' + CHARS[a] + '/' + CHARS[b] + ' differ by ' + d + ' px');
  }

  // ---- 2. an in-engine scene drawn with these sprites
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  function stage() {
    const D = PG.debug;
    if (!D || typeof D.start !== 'function') { bad('PG.debug missing'); return 'none'; }
    const st = () => D.getState();
    if (scene === 'solo') {
      for (const c of CHARS) {
        D.start(0, c); D.step(150);
        const p = (st().players || [])[0];
        if (p && p.char && p.char !== c) bad('solo start as ' + c + ' gave ' + p.char);
      }
      return 'solo x' + CHARS.length;
    }
    const L = D.local || {};
    if (scene === 'battle' || scene === 'podium') {
      if (typeof L.battle !== 'function') return 'battle (not available yet)';
      L.battle(['capy', 'otter', 'penguin', 'cat']); D.step(150);
      if (typeof D.trapPlayer === 'function') D.trapPlayer(1, 0);
      D.step(24);
      if (scene === 'podium' && typeof D.endBattle === 'function') { D.endBattle(); D.step(90); }
      return scene + ' ' + (st().players || []).map((p) => p.char + (p.trapped ? '(trapped)' : '')).join(',');
    }
    if (scene === 'coop') {
      if (typeof L.coop !== 'function') return 'coop (not available yet)';
      L.coop(['frog', 'duck', 'penguin'], 0); D.step(200);
      if (typeof D.setInvincible === 'function') D.setInvincible(false);
      if (typeof D.hitPlayer === 'function') D.hitPlayer(1);
      D.step(40);
      return 'coop ' + (st().players || []).map((p) => p.char + (p.ghost ? '(ghost)' : '')).join(',');
    }
    return 'unknown scene ' + scene;
  }
  function finish() {
    let what = '';
    try { what = stage(); } catch (e) { bad('stage threw ' + e.message); }
    if (errors.length) bad('page errors: ' + errors.slice(0, 3).join(' / '));
    console.log(fails.length ? 'V3-SPRITES FAIL ' + fails.join(' | ') : 'V3-SPRITES PASS ' + Object.keys(want).length + ' sprites, ' + nPal + ' colours; scene ' + what);
  }
  let tries = 0;
  (function wait() { if ((PG.debug && typeof PG.debug.start === 'function') || ++tries > 60) finish(); else setTimeout(wait, 50); })();
})();
