// Character sheet: every animal's frames (idle, walk, jump, fall, shoot, die, trapped, ghost, life, portrait) drawn
// big over the page, for a screenshot that compares the six side by side; under them (v4) each animal's move pose
// next to its jump frame, and the six bubble glyphs, bare and inside their hued bubbles (6x, then 1x).
// Usage: node bogeul/build.js && node bogeul/tools/run-chrome.js test-char-sheet.html sheet-v4.png 1500 1000 3000
(function () {
  'use strict';
  function draw() {
    const PG = window.PG || {}, S = PG.SPRITES || {}, P = PG.PALETTE || {};
    const CH = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'];
    const ANIMS = [['idle', 2], ['walk', 4], ['jump', 1], ['fall', 1], ['shoot', 1], ['die', 2], ['trapped', 1], ['ghost', 1]];
    // v4 (char-kits §11): the move pose per animal (the frog keeps frog_jump) and the bubble hue under each glyph
    const MOVE = { duck: 'glide', capy: 'slam', otter: 'dash', penguin: 'slide', cat: 'flip' };
    const HUE = { duck: '#ffe36b', capy: '#ffa98a', otter: '#5fe0c8', penguin: '#9fdcff', cat: '#c9a8ff', frog: '#9be86a' };
    const SC = 5, CELL = 16 * SC + 6, ROWH = 16 * SC + 26, V4 = 6, V4CELL = 16 * V4 + 8;
    const cols = ANIMS.reduce((n, a) => n + a[1], 0) + 2;
    const top4 = 20 + CH.length * ROWH;
    const cv = document.createElement('canvas');
    cv.width = 150 + cols * CELL + 40; cv.height = top4 + 310;
    cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#20343a';
    document.body.appendChild(cv);
    const x = cv.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.fillStyle = '#20343a'; x.fillRect(0, 0, cv.width, cv.height);
    const px = (frame, ox, oy, sc) => {
      if (!frame) return;
      frame.forEach((row, r) => { for (let c = 0; c < row.length; c++) { const k = row[c]; if (k === '.' || !P[k]) continue; x.fillStyle = P[k]; x.fillRect(ox + c * sc, oy + r * sc, sc, sc); } });
    };
    const label = (t, ox, oy, col) => { x.fillStyle = col || '#9fc'; x.font = '11px sans-serif'; x.fillText(t, ox, oy); };
    CH.forEach((c, i) => {
      const y = 14 + i * ROWH;
      x.fillStyle = '#ffffff'; x.font = 'bold 18px sans-serif'; x.fillText(c, 10, y + 40);
      let col = 0;
      for (const [a, n] of ANIMS) {
        const fr = S[c + '_' + a] || [];
        for (let k = 0; k < n; k++) {
          const ox = 150 + col * CELL;
          x.fillStyle = '#2c474e'; x.fillRect(ox - 2, y - 2, 16 * SC + 4, 16 * SC + 4);
          px(fr[k], ox, y, SC);
          label(a + (n > 1 ? k : ''), ox, y + 16 * SC + 14);
          col++;
        }
      }
      const ox = 150 + col * CELL;
      px((S['portrait_' + c] || [])[0], ox, y, 2.5);
      px((S['life_' + c] || [])[0], ox + 90, y, 5);
    });
    // ---- v4 row 1: the move poses at 6x, each after its animal's jump frame (a missing frame reads MISSING)
    let ox = 10, y = top4 + 4;
    x.fillStyle = '#ffd23c'; x.font = 'bold 13px sans-serif'; x.fillText('v4 move poses (6x): jump | move', ox, y + 8);
    y += 16;
    for (const c of CH) {
      const m = MOVE[c], frames = [[c + '_jump', (S[c + '_jump'] || [])[0]]];
      if (m) (S[c + '_' + m] || [null]).forEach((f, k, all) => frames.push([m + (all.length > 1 ? k : ''), f, true]));
      for (const [n, f, isNew] of frames) {
        x.fillStyle = isNew ? '#35606a' : '#2c474e'; x.fillRect(ox - 2, y - 2, 16 * V4 + 4, 16 * V4 + 4);
        if (f) px(f, ox, y, V4); else label('MISSING', ox + 20, y + 50, '#ff8c70');
        label((isNew ? c + '_' : '') + n, ox, y + 16 * V4 + 13, isNew ? '#ffd23c' : '#9fc');
        ox += V4CELL;
      }
      if (!m) { label('(no new frame)', ox, y + 50); ox += 80; }
      ox += 10;
    }
    // ---- v4 row 2: the 5x5 bubble glyphs at 6x, bare, then inside their shot bubble (hue film 0.30, slot ring, glyph
    // at the centre 1 px low) the way drawBubble shows them
    ox = 10; y = top4 + 16 * V4 + 48;
    x.fillStyle = '#ffd23c'; x.font = 'bold 13px sans-serif'; x.fillText('v4 bubble glyphs (6x): bare | in the bubble', ox, y + 8);
    y += 16;
    const cells = []; for (const c of CH) (S['icon_' + c] || [null]).forEach((f, k, all) => cells.push([c + (all.length > 1 ? k : ''), c, f]));
    for (const [n, , f] of cells) {
      x.fillStyle = '#2c474e'; x.fillRect(ox - 2, y + 31, 5 * V4 + 4, 5 * V4 + 4);
      if (f) px(f, ox, y + 33, V4); else label('MISSING', ox, y + 50, '#ff8c70');
      label(n, ox, y + 16 * V4 + 13);
      ox += 5 * V4 + 30;
    }
    ox += 10;
    const SLOT = ['#ffd447', '#f6a6bd', '#7fdcc8', '#8dc9ff'];
    cells.forEach(([n, c, f], i) => {
      const o = document.createElement('canvas'); o.width = 18; o.height = 18; const b = o.getContext('2d');
      b.fillStyle = '#0b2427'; b.fillRect(0, 0, 18, 18);
      b.globalAlpha = 0.3; b.fillStyle = HUE[c]; b.beginPath(); b.arc(9, 9, 7, 0, Math.PI * 2); b.fill();
      b.globalAlpha = 0.9; b.strokeStyle = SLOT[i % 4]; b.lineWidth = 1; b.beginPath(); b.arc(9, 9, 8.5, 0, Math.PI * 2); b.stroke(); b.globalAlpha = 1;
      const bub = (S.bubble || [])[i % 3];
      if (bub) bub.forEach((row, r) => { for (let k = 0; k < row.length; k++) { const ch = row[k]; if (ch === '.' || !P[ch]) continue; b.fillStyle = P[ch]; b.fillRect(1 + k, 1 + r, 1, 1); } });
      if (f) f.forEach((row, r) => { for (let k = 0; k < row.length; k++) { const ch = row[k]; if (ch === '.' || !P[ch]) continue; b.fillStyle = P[ch]; b.fillRect(7 + k, 8 + r, 1, 1); } });
      x.drawImage(o, ox, y, 18 * V4, 18 * V4);
      x.drawImage(o, ox, y + 18 * V4 + 18); // and at 1x
      label(n, ox, y + 18 * V4 + 13);
      ox += 18 * V4 + 8;
    });
    console.log('SHEET DONE');
  }
  let n = 0;
  (function wait() { if ((window.PG && window.PG.debug) || ++n > 60) draw(); else setTimeout(wait, 50); })();
})();
