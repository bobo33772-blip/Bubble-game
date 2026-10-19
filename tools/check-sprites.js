// Validates src/sprites.js against the shared spec (v1 + v2 + v3 + v4 names, exact sizes and frame counts, palette
// chars, the twin keys PG.TWIN_KEYS), then writes a contact sheet to C:/Temp/bogeul/<name> (default sheet.html) and the
// v3 character contact sheet C:/Temp/bogeul/chars.html: every animal, every frame (v4: its move pose and bubble glyph
// too) at 4x and at 1x on dark and on each theme background, the twin colours (natural / 2P / 3P / 4P), an in-game scene
// per theme with name tags / crown / ready marks, the portraits, the life icons and (v4) the six bubble glyphs inside
// their hued bubbles. v4 shop (design/shop.md §10, 6.1-6.3): the UI icons, the 34 worn items and 6 effect icons, their
// PG.ITEM_SIZE / PG.ITEM_PIVOT, PG.ANCHORS, and every item placed on every animal x anchored frame and portrait (the
// 6.3 limits); then tools/anchors.js writes the shop contact sheet C:/Temp/bogeul/shop-art.html (see its header).
// Usage: node bogeul/tools/check-sprites.js [scale=4] [nameFilterRegex=''] [out=sheet.html]
//   With no filter the sheet also shows the 5 themes and (v2) an in-game style scene at 3x and 1x.
//   Look at the characters: node bogeul/tools/run-chrome.js chars.html chars.png 1500 2600
//   (chars.html?c=capy,cat limits the per-animal part to those animals; chars.html?tw=1&ns=1 starts at the twin colours).
//   Sheets are written even when checks fail.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const file = path.join(__dirname, '..', 'src', 'sprites.js');
const code = fs.readFileSync(file, 'utf8');
assert(!/<\/script/i.test(code), 'sprites.js must not contain "</script"');
assert(!code.includes(String.fromCharCode(0xbf40, 0xae00).repeat(2)), 'sprites.js must not mention the old v1 title');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'sprites.js' });
const PG = ctx.window.PG;
assert(PG && PG.PALETTE && PG.SPRITES && PG.THEMES, 'PG.PALETTE / PG.SPRITES / PG.THEMES missing');

const P = PG.PALETTE, SP = PG.SPRITES;
assert(!('.' in P), "'.' must not be in PALETTE");
for (const [k, v] of Object.entries(P)) {
  assert(k.length === 1, `palette key ${k} must be one char`);
  assert(/^#[0-9a-f]{6}$/i.test(v), `palette ${k} = ${v} is not #rrggbb`);
}
const nPal = Object.keys(P).length;
assert(nPal <= 64, `palette has ${nPal} colours (max 64)`);
const dupes = Object.entries(P).filter(([k, v], i, all) => all.findIndex(([, w]) => w.toLowerCase() === v.toLowerCase()) !== i);
// pairwise distinct values: the twin recolour (PG.TWIN_KEYS below) finds a key by its colour on the baked frame
assert(!dupes.length, 'duplicate palette colours (the twin recolour matches pixels by value): ' +
  dupes.map(([k, v]) => k + '=' + Object.keys(P).find((j) => P[j].toLowerCase() === v.toLowerCase())).join(', '));

// name: [frames, width, height = width]
const REQ = {
  duck_idle: [2, 16], duck_walk: [4, 16], duck_jump: [1, 16], duck_fall: [1, 16], duck_shoot: [1, 16], duck_die: [4, 16],
  bubble_new: [2, 16], bubble: [3, 16], bubble_pop: [2, 16],
  steam_bubble: [2, 16], steam_bolt: [2, 16], life: [1, 8],
  // ---- v2
  boss_grime_idle: [2, 32], boss_grime_jump: [1, 32], boss_grime_hurt: [1, 32],
  boss_mold_idle: [2, 32], boss_mold_shoot: [1, 32], boss_mold_hurt: [1, 32],
  boss_sponge_idle: [2, 32], boss_sponge_charge: [2, 32], boss_sponge_hurt: [1, 32],
  boss_towel_idle: [2, 32], boss_towel_swoop: [1, 32], boss_towel_hurt: [1, 32],
  giant_bubble: [2, 40],
  spore: [2, 8], shockwave: [2, 16, 8], scald_drop: [2, 8], mini_mitt: [2, 16],
  stamp_bubble: [2, 16], stamp: [1, 8], stamp_empty: [1, 8],
  pw_shampoo: [1, 16], pw_slippers: [1, 16], pw_bathbomb: [1, 16],
  grime_soaked: [2, 16], mold_soaked: [2, 16], sponge_soaked: [2, 16],
  water_hot_top: [2, 8], water_hot: [1, 8], water_cold_top: [2, 8], water_cold: [1, 8], ice_block: [1, 16],
  drain: [1, 8], shower: [1, 16, 8],
};
for (const T of ['grime', 'mold', 'fly', 'sponge']) {
  REQ[T + '_walk'] = [2, 16]; REQ[T + '_angry'] = [2, 16]; REQ[T + '_trapped'] = [2, 16]; REQ[T + '_dead'] = [1, 16];
}
for (const it of ['tangerine', 'yogurt', 'egg', 'banana_milk', 'sikhye', 'icecream', 'watermelon', 'towel_hat']) REQ['item_' + it] = [1, 16];
for (let i = 0; i < 5; i++) REQ['tile_' + i] = [1, 8];
// ---- v3: six playable bathhouse animals (the duck keeps its v1 frames and gains the new ones) + multiplayer UI marks
const CHARS = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'];
for (const c of CHARS) {
  Object.assign(REQ, {
    [c + '_idle']: [2, 16], [c + '_walk']: [4, 16], [c + '_jump']: [1, 16], [c + '_fall']: [1, 16], [c + '_shoot']: [1, 16],
    [c + '_die']: [4, 16], [c + '_trapped']: [2, 16], [c + '_ghost']: [2, 16], ['life_' + c]: [1, 8], ['portrait_' + c]: [1, 32],
  });
}
Object.assign(REQ, { crown: [1, 8], tag_arrow: [1, 5, 3], ready: [1, 8] });
// ---- v4 trophies (design/trophies.md §9): the cup (front, turned) and the 7 league icons, 8x8 each
const LEAGUE_N = 7;
REQ.trophy = [2, 8];
for (let i = 0; i < LEAGUE_N; i++) REQ['lg_' + i] = [1, 8];
// ---- v4 (char-kits v4 §11): one move pose per animal (the frog needs none) + the 5x5 bubble glyphs (11 names)
const MOVES = { duck: ['glide', 2], capy: ['slam', 1], otter: ['dash', 1], penguin: ['slide', 1], cat: ['flip', 1] };
for (const [c, [m, n]] of Object.entries(MOVES)) REQ[c + '_' + m] = [n, 16];
for (const c of CHARS) REQ['icon_' + c] = [c === 'cat' ? 2 : 1, 5];
// letter_mok / letter_yok / letter_tang are optional in v2 (may be deleted); checked only if present
const OPTIONAL = { letter_mok: [1, 16], letter_yok: [1, 16], letter_tang: [1, 16] };
// removed in v2: the invincible towel chaser (hurry now breaks the shower instead)
const REMOVED = ['towel'];

const errs = [];
function checkSprite(name, n, w, h) {
  const s = SP[name];
  if (!Array.isArray(s)) { errs.push(`missing sprite ${name}`); return; }
  if (s.length !== n) errs.push(`${name}: ${s.length} frames, want ${n}`);
  s.forEach((f, i) => {
    if (!Array.isArray(f) || f.length !== h) { errs.push(`${name}[${i}]: ${f && f.length} rows, want ${h}`); return; }
    f.forEach((row, y) => {
      if (typeof row !== 'string' || row.length !== w) errs.push(`${name}[${i}] row ${y}: length ${row && row.length}, want ${w}: "${row}"`);
      for (const ch of row) if (ch !== '.' && !(ch in P)) errs.push(`${name}[${i}] row ${y}: char '${ch}' not in palette`);
    });
    if (f.every((r) => /^\.*$/.test(r))) errs.push(`${name}[${i}] is empty`);
  });
  // animated sprites should not have identical frames
  if (s.length > 1) for (let i = 1; i < s.length; i++) if (s[i].join('\n') === s[0].join('\n')) errs.push(`${name}[${i}] identical to frame 0`);
}
for (const [name, [n, w, h]] of Object.entries(REQ)) checkSprite(name, n, w, h || w);
for (const [name, [n, w, h]] of Object.entries(OPTIONAL)) if (SP[name]) checkSprite(name, n, w, h || w);
for (const name of REMOVED) if (SP[name]) errs.push(`${name}: v1 sprite should be removed in v2`);

// v2 content rules
const opaque = (f) => f.reduce((a, r) => a + r.replace(/\./g, '').length, 0);
for (const b of ['grime', 'mold', 'sponge', 'towel']) {
  for (const k of Object.keys(SP).filter((n) => n.startsWith('boss_' + b + '_'))) {
    for (const f of SP[k]) {
      const cover = opaque(f) / (32 * 32);
      if (cover < 0.35) errs.push(`${k}: only ${(cover * 100) | 0}% filled — bosses should be big`);
      if (!f.some((r) => r.includes('k'))) errs.push(`${k}: no ink outline`);
    }
  }
}
// ground bosses must stand on the bottom row (no floating gap above the platform)
for (const k of ['boss_grime_idle', 'boss_grime_hurt', 'boss_sponge_idle', 'boss_sponge_charge', 'boss_sponge_hurt']) {
  (SP[k] || []).forEach((f, i) => { if (/^\.*$/.test(f[31])) errs.push(`${k}[${i}]: bottom row empty — would float above the floor`); });
}
// giant bubble: hollow (centre transparent), rim present
for (const f of SP.giant_bubble || []) {
  for (let y = 12; y < 28; y++) if (f[y].slice(12, 28) !== '.'.repeat(16)) { errs.push('giant_bubble: centre must be transparent'); break; }
  if (!f.slice(0, 3).join('').replace(/\./g, '').length) errs.push('giant_bubble: rim should reach the top rows (fill the 40x40 box)');
}
// water bodies must tile: fully opaque
for (const n of ['water_hot', 'water_cold']) for (const f of SP[n] || []) if (opaque(f) !== 64) errs.push(`${n} must be fully opaque`);
for (const n of ['water_hot_top', 'water_cold_top']) for (const f of SP[n] || []) if (f.slice(2).some((r) => r.includes('.'))) errs.push(`${n}: rows 2..7 must be opaque`);
// water surfaces: the engine shows frame (t + col) per cell, so the two frames alternate side by side and must join
// into one continuous surface line (row 2) in both orders: A|B and B|A
for (const n of ['water_hot_top', 'water_cold_top']) {
  const [a, b] = SP[n] || [];
  if (!a || !b) continue;
  for (const [l, r, tag] of [[a, b, 'A|B'], [b, a, 'B|A']]) {
    const seam = l[2][7] + r[2][0];
    if (seam.includes('.')) errs.push(`${n}: surface line broken at the ${tag} seam`);
  }
}
// power-ups float down and rest on a surface: their lowest opaque row must be the bottom one or the one above it
for (const n of ['pw_shampoo', 'pw_slippers', 'pw_bathbomb']) {
  for (const f of SP[n] || []) {
    let last = -1; f.forEach((r, y) => { if (/[^.]/.test(r)) last = y; });
    if (last < 14) errs.push(`${n}: lowest pixel on row ${last} — would hover above the floor`);
  }
}
// the stamp icon and the stamp bubble carry the same red seal
for (const n of ['stamp', 'stamp_bubble']) for (const f of SP[n] || []) if (!f.some((r) => r.includes('R'))) errs.push(`${n}: missing the red seal`);
// soaked frames must keep the walk silhouette's eyes (white) and differ in colour from walk
for (const T of ['grime', 'mold', 'sponge']) {
  (SP[T + '_soaked'] || []).forEach((f, i) => { if (f.join('') === (SP[T + '_walk'][i] || []).join('')) errs.push(`${T}_soaked[${i}] equals walk frame`); });
}

// ---- v3 character rules
const mask = (f) => f.map((r) => r.replace(/[^.]/g, '#'));
const lum = (hex) => { const v = parseInt(hex.slice(1), 16); return (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255; };
const lowestRow = (f) => { let last = -1; f.forEach((r, y) => { if (/[^.]/.test(r)) last = y; }); return last; };
const inkCount = (f) => f.reduce((a, r) => a + (r.match(/k/g) || []).length, 0);
for (const c of CHARS) {
  // standing / shooting frames and the first walk frame rest on the duck's ground line (outline under the feet on
  // row 15); the other walk frames may leave the floor by at most 2 px (a hop)
  for (const n of ['_idle', '_walk', '_shoot']) (SP[c + n] || []).forEach((f, i) => {
    const lo = lowestRow(f), hop = n === '_walk' && i > 0;
    if (hop ? lo < 13 : lo !== 15) errs.push(`${c}${n}[${i}]: lowest pixel on row ${lo}, want ${hop ? '13..15' : 15} (stand on the floor)`);
  });
  for (const n of ['_idle', '_walk', '_jump', '_fall', '_shoot', '_die', '_trapped']) (SP[c + n] || []).forEach((f, i) => {
    if (inkCount(f) < 12) errs.push(`${c}${n}[${i}]: needs the 1-px dark outline`);
  });
  // a real 4-step walk: every pair of frames differs
  const wk = SP[c + '_walk'] || [];
  for (let i = 0; i < wk.length; i++) for (let j = i + 1; j < wk.length; j++) if (wk[i].join('') === wk[j].join('')) errs.push(`${c}_walk[${i}] equals [${j}]`);
  // trapped: the curled animal (ink face, >< eyes) inside a bubble rim that spans the 16x16 box
  (SP[c + '_trapped'] || []).forEach((f, i) => {
    if (f[0].replace(/\./g, '').length < 4 || f[15].replace(/\./g, '').length < 4) errs.push(`${c}_trapped[${i}]: bubble rim should span the box`);
    if (!f.slice(3, 13).some((r) => r.slice(3, 13).includes('k'))) errs.push(`${c}_trapped[${i}]: no ink face inside the bubble`);
  });
  // ghost: pale and see-through looking (no ink, bright on average) inside a bubble rim
  (SP[c + '_ghost'] || []).forEach((f, i) => {
    if (f.some((r) => r.includes('k'))) errs.push(`${c}_ghost[${i}]: ghosts use pale outlines (no ink)`);
    let sum = 0, n = 0; for (const r of f) for (const ch of r) if (ch !== '.' && P[ch]) { sum += lum(P[ch]); n++; }
    if (n && sum / n < 0.68) errs.push(`${c}_ghost[${i}]: too dark (average luminance ${(sum / n).toFixed(2)})`);
    if (f[0].replace(/\./g, '').length < 4) errs.push(`${c}_ghost[${i}]: bubble rim should span the box`);
  });
  const pt = (SP['portrait_' + c] || [])[0];
  if (pt && opaque(pt) / (32 * 32) < 0.4) errs.push(`portrait_${c}: only ${(opaque(pt) / 10.24) | 0}% filled — a bust should fill the frame`);
  if (pt && lowestRow(pt) !== 31) errs.push(`portrait_${c}: the bust should sit on the bottom edge`);
  if (pt && inkCount(pt) < 40) errs.push(`portrait_${c}: needs the dark outline`);
}
// distinct silhouettes: the idle masks of every pair of animals differ clearly
for (let a = 0; a < CHARS.length; a++) for (let b = a + 1; b < CHARS.length; b++) {
  const fa = (SP[CHARS[a] + '_idle'] || [])[0], fb = (SP[CHARS[b] + '_idle'] || [])[0];
  if (!fa || !fb) continue;
  const ma = mask(fa).join(''), mb = mask(fb).join('');
  let d = 0; for (let i = 0; i < ma.length; i++) if (ma[i] !== mb[i]) d++;
  if (d < 28) errs.push(`silhouettes of ${CHARS[a]} and ${CHARS[b]} differ by only ${d} px`);
}
// the small UI marks: name-tag pointer is a plain white shape (the engine tints it with the slot colour)
for (const f of SP.tag_arrow || []) if (f.join('').replace(/[.w]/g, '').length) errs.push('tag_arrow: use only white (w) so it can be tinted');

// ---- v4 move poses: the same animal in a new pose (its own colours, the ink outline, a clearly new silhouette)
const bbox = (f) => {
  let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
  f.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== '.') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
};
const keysOf = (frames) => { const s = new Set(); for (const f of frames) for (const r of f) for (const ch of r) if (ch !== '.') s.add(ch); return s; };
// pixels that differ in colour (a raised wing over the body counts, not only the silhouette)
const pixDiff = (a, b) => { const pa = a.join(''), pb = b.join(''); let d = 0; for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) d++; return d; };
for (const [c, [m]] of Object.entries(MOVES)) {
  const name = c + '_' + m, pose = SP[name] || [];
  const own = [].concat(...['_idle', '_walk', '_jump', '_fall', '_shoot'].map((n) => SP[c + n] || []));
  const ownKeys = keysOf(own);
  pose.forEach((f, i) => {
    if (inkCount(f) < 12) errs.push(`${name}[${i}]: needs the 1-px dark outline`);
    const foreign = [...keysOf([f])].filter((k) => !ownKeys.has(k));
    if (foreign.length) errs.push(`${name}[${i}]: colours ${foreign.join('')} are not ${c}'s own (match the idle / jump frames)`);
    for (const o of own) { const d = pixDiff(f, o); if (d < 40) { errs.push(`${name}[${i}]: only ${d} px differ from an existing ${c} frame (draw a new pose)`); break; } }
    const lo = lowestRow(f), b = bbox(f);
    // standing-line rule: the airborne poses keep the jump / fall frames' ground line (feet or tips on rows 14-15);
    // the slide is drawn 3 px lower by the engine (spec §6), so its belly outline sits on row 12 and lands on row 15;
    // the flip is a round ball about the frame centre
    if (m === 'slide') { if (lo !== 12) errs.push(`${name}: lowest pixel on row ${lo}, want 12 (the engine draws it 3 px lower)`); }
    else if (m === 'flip') {
      if (Math.abs(b.w - b.h) > 3) errs.push(`${name}: ${b.w}x${b.h}, a curled ball should be about round`);
      if (Math.abs(b.cx - 7.5) > 1.5 || Math.abs(b.cy - 7.5) > 1.5) errs.push(`${name}: ball centred at ${b.cx},${b.cy}, want about 7.5,7.5`);
    } else if (lo < 14) errs.push(`${name}[${i}]: lowest pixel on row ${lo}, want 14..15 (the jump / fall ground line)`);
    if ((m === 'dash' || m === 'slide') && b.w < b.h * 1.5) errs.push(`${name}: ${b.w}x${b.h}, should lie stretched out (width >= 1.5 x height)`);
  });
}
// glide: wings up (a raised wing above the back, left of the head) / wings down (feather tips below the belly)
(function () {
  const [up, down] = SP.duck_glide || [];
  if (up && !up.slice(0, 4).some((r) => /[^.k]/.test(r.slice(0, 5)))) errs.push('duck_glide[0]: wings up should rise above the back (rows 0-3, left of the head)');
  if (down && !down.slice(13).some((r) => /[LYy]/.test(r))) errs.push('duck_glide[1]: wings down should hang below the belly (rows 13-15)');
})();
// ---- v4 bubble glyphs: 5x5, no outline, drawn at the bubble centre over the animal's hue film
const ICON_KEY = {
  duck: [['Y', 'O', 'k'], 'a yellow head with an ink eye and an orange beak'],
  capy: [['Y', 't'], 'a yellow yuzu with a green leaf'],
  otter: [['a', 'w'], 'a grey pebble with a white glint'],
  penguin: [['w'], 'a white snowflake'],
  cat: [['p'], 'a pink yarn swirl'],
  frog: [['n'], 'a jelly egg with a dark dot'],
};
for (const c of CHARS) {
  (SP['icon_' + c] || []).forEach((f, i) => {
    const n = `icon_${c}[${i}]`, b = bbox(f), keys = keysOf([f]);
    if (opaque(f) < 9) errs.push(`${n}: only ${opaque(f)} px, too faint for a glyph`);
    if (Math.abs(b.cx - 2) > 0.5 || Math.abs(b.cy - 2) > 0.5) errs.push(`${n}: glyph centred at ${b.cx},${b.cy}, want 2,2`);
    const miss = ICON_KEY[c][0].filter((k) => !keys.has(k));
    if (miss.length) errs.push(`${n}: missing ${miss.join('')} (${ICON_KEY[c][1]})`);
  });
}
for (const f of SP.icon_penguin || []) for (const r of f) for (const ch of r) if (ch !== '.' && lum(P[ch]) < 0.8) { errs.push('icon_penguin: the snowflake should be white / pale only'); break; }
for (const f of SP.icon_capy || []) if (f.join('').split('t').length - 1 !== 1) errs.push('icon_capy: exactly one leaf pixel (t)');
for (const f of SP.icon_frog || []) if (lum(P[f[2][2]] || '#ffffff') > 0.3) errs.push('icon_frog: the egg dot (centre pixel) should be dark');

// v4 trophies: the cup is gold (Y) with an ink outline; the 7 league icons all differ from each other and from the
// winner's crown (they sit beside it on the same screens)
for (const f of SP.trophy || []) { if (!f.some((r) => r.includes('Y'))) errs.push('trophy: the cup should be gold (Y)'); if (!f.some((r) => r.includes('k'))) errs.push('trophy: needs the ink outline'); }
for (let a = 0; a < LEAGUE_N; a++) {
  const fa = (SP['lg_' + a] || [])[0]; if (!fa) continue;
  if (SP.crown && fa.join('') === SP.crown[0].join('')) errs.push(`lg_${a}: the same as the crown`);
  if (pixDiff(fa, SP.crown ? SP.crown[0] : fa) < 8 && SP.crown) errs.push(`lg_${a}: too close to the crown`);
  for (let b = a + 1; b < LEAGUE_N; b++) { const fb = (SP['lg_' + b] || [])[0]; if (fb && pixDiff(fa, fb) < 12) errs.push(`lg_${a} and lg_${b} differ by only ${pixDiff(fa, fb)} px`); }
}

// ---- twin colours (design/distinction.md §2.5, pass A0): PG.TWIN_KEYS[char] = { key: role } names each animal's body
// keys, swapped by exact pixel match for SLOT_RAMP[slot][role] (0..3 = L M D DD) on a later copy of the same animal. A
// pixel match is a key match only because no two palette values are equal (the duplicate check above). Every animal is
// listed; every key is drawn in its body poses (a key renamed in the art fails here instead of silently dropping the
// colour), never the ink k (the slot ring is traced around it); roles are 0..3 and run light to dark; the HUD icon and
// the portrait carry at least one key (the HUD shows no names, so its twin icons must differ).
const TW = PG.TWIN_KEYS;
if (!TW || typeof TW !== 'object') errs.push('PG.TWIN_KEYS missing (distinction.md §2.5)');
else {
  for (const c of Object.keys(TW)) if (!CHARS.includes(c)) errs.push(`TWIN_KEYS.${c}: not one of the six animals`);
  for (const c of CHARS) {
    const t = TW[c], ks = t && typeof t === 'object' ? Object.keys(t) : [];
    if (!ks.length) { errs.push(`TWIN_KEYS.${c} missing: a second ${c} would look exactly like the first`); continue; }
    const body = keysOf([].concat(...['_idle', '_walk', '_jump', '_fall', '_shoot', '_die'].concat(MOVES[c] ? ['_' + MOVES[c][0]] : []).map((n) => SP[c + n] || [])));
    for (const k of ks) {
      const r = t[k];
      if (!Number.isInteger(r) || r < 0 || r > 3) errs.push(`TWIN_KEYS.${c}.${k} = ${r}: the role must be 0..3 (L M D DD)`);
      if (k === 'k') errs.push(`TWIN_KEYS.${c}: the ink k is never a body key`);
      else if (!(k in P)) errs.push(`TWIN_KEYS.${c}.${k}: not a palette key`);
      else if (!body.has(k)) errs.push(`TWIN_KEYS.${c}.${k}: not drawn in any ${c} body pose (renamed in the art?)`);
    }
    for (const a of ks) for (const b of ks) if (P[a] && P[b] && t[a] < t[b] && lum(P[a]) < lum(P[b])) errs.push(`TWIN_KEYS.${c}: ${a} (role ${t[a]}) is darker than ${b} (role ${t[b]})`);
    for (const n of ['life_' + c, 'portrait_' + c]) if (SP[n] && !ks.some((k) => keysOf(SP[n]).has(k))) errs.push(`${n}: shows none of the twin keys ${ks.join('')}`);
  }
}

// ---- v4 shop (design/shop.md §10, 6.1-6.3, 6.8; passes A1 / A2). The composite is tools/anchors.js's copy of the
// engine's lookFrame / lookPortrait, so these checks place every item exactly as play will.
const AX = require('./anchors.js');
// A1: the UI icons, 8x8 (the coin: front + glint)
const SHOP_UI = { coin: 2, shop: 1, lock: 1, slot_h: 1, slot_f: 1, slot_n: 1, slot_b: 1, slot_e: 1 };
for (const [n, k] of Object.entries(SHOP_UI)) { REQ[n] = [k, 8]; checkSprite(n, k, 8, 8); }
for (const f of SP.coin || []) if (f.some((r) => /[Yy]/.test(r))) errs.push('coin: no Y / y - the coin is a pink soap disc, the trophy cup is the yellow one');
if (SP.coin && !SP.coin.every((f) => f.some((r) => /[Pp]/.test(r)) && f.some((r) => r.includes('k')))) errs.push('coin: a pink (P p) disc with an ink outline');
// A2: the 효과 icons and the worn items. Slots and limits (6.3): art = the opaque box of a frame
const ITEM_IDS = AX.ITEM_IDS, TUBE = AX.TUBES;
for (let i = 1; i <= 6; i++) { REQ['ic_e' + i] = [1, 8]; checkSprite('ic_e' + i, 1, 8, 8); }
const LIMIT = { h: [12, 8], f: [[5, 3], [9, 3]], n: [10, 4], b: [8, 10], W: [14, 5] };
// face decals drawn without ink: the key that plays the outline (shop.md §4 art notes: f1 "p q", f6 "n m M"; gacha.md
// 4.2: f9's foam W)
const RIM = { f1: 'q', f6: 'M', f9: 'W' };
const ISZ = PG.ITEM_SIZE || {}, IPV = PG.ITEM_PIVOT || {};
if (!PG.ITEM_SIZE || !PG.ITEM_PIVOT) errs.push('PG.ITEM_SIZE / PG.ITEM_PIVOT missing (shop.md §10)');
for (const n of Object.keys(SP)) if (/^(it_|ic_|slot_|fx_)|^(coin|shop|lock|gacha|gacha_h|cap|cap_t|cap_b)$/.test(n)) {
  const z = ISZ[n], f = SP[n][0];
  if (!z || z[0] !== f[0].length || z[1] !== f.length) errs.push(`PG.ITEM_SIZE.${n} = ${z} but the art is ${f[0].length}x${f.length}`);
}
for (const n of Object.keys(ISZ)) if (!SP[n]) errs.push(`PG.ITEM_SIZE.${n}: no such sprite`);
const frameOfItem = (id, part) => AX.itemPart(PG, id, part);
for (const id of ITEM_IDS) {
  const n = 'it_' + id, s = id[0], fr = SP[n], two = s === 'f' || TUBE[id];
  if (!fr) { errs.push(`${n} missing (shop.md §4)`); continue; }
  const z = ISZ[n] || [fr[0][0].length, fr[0].length];
  REQ[n] = [two ? 2 : 1, z[0], z[1]]; checkSprite(n, two ? 2 : 1, z[0], z[1]);
  const pv = IPV[id];
  if (!pv) { errs.push(`PG.ITEM_PIVOT.${id} missing`); continue; }
  const pvs = Array.isArray(pv[0]) ? pv : [pv];
  if (Array.isArray(pv[0]) && pv.length !== fr.length) errs.push(`PG.ITEM_PIVOT.${id}: ${pv.length} pivots for ${fr.length} frames`);
  for (const p of pvs) if (!(Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[0] >= 0 && p[1] >= 0 && p[0] < z[0] && p[1] < z[1])) errs.push(`PG.ITEM_PIVOT.${id} [${p}] is outside its ${z[0]}x${z[1]} box`);
  fr.forEach((f, i) => {
    const b = bbox(f), ink = RIM[id] ? ['k', RIM[id]] : ['k'];
    if (b.w <= 0) return;
    const has = (pts) => pts.some(([x, y]) => ink.includes(f[y][x]));
    const col = (x) => Array.from({ length: b.h }, (_, j) => [x, b.y0 + j]), row = (y) => Array.from({ length: b.w }, (_, j) => [b.x0 + j, y]);
    const miss = [['top', row(b.y0)], ['bottom', row(b.y1)], ['left', col(b.x0)], ['right', col(b.x1)]].filter(([, pts]) => !has(pts)).map(([k]) => k);
    if (miss.length) errs.push(`${n}[${i}]: no ${ink.join('/')} edge pixel on its ${miss.join(', ')} side (items carry their own outline)`);
    const lim = s === 'f' ? LIMIT.f[i] : s === 'b' ? (TUBE[id] ? LIMIT.W : LIMIT.b) : LIMIT[s];
    if (b.w > lim[0] || b.h > lim[1]) errs.push(`${n}[${i}]: art ${b.w}x${b.h}, the ${s === 'b' && TUBE[id] ? 'tube' : s} limit is ${lim[0]}x${lim[1]} (6.3)`);
  });
  // hats: the top edge of the silhouette is ink in every column (no white / light pixel touches the tag's place)
  if (s === 'h') { const f = fr[0]; for (let x = 0; x < f[0].length; x++) { let y = 0; while (y < f.length && f[y][x] === '.') y++; if (y < f.length && f[y][x] !== 'k') { errs.push(`${n}: column ${x} starts with '${f[y][x]}' - a hat's top edge is ink`); break; } } }
}
for (const id of Object.keys(IPV)) if (!ITEM_IDS.includes(id)) errs.push(`PG.ITEM_PIVOT.${id}: not a catalog item with art`);
// the clash rules (6.6): the 황금 대야 has no red; the bubble wings carry no 2x2 white shine dot
if (SP.it_hc && SP.it_hc.some((f) => f.some((r) => /[Rr]/.test(r)))) errs.push('it_hc: no red (gold + red is the podium crown\'s scheme)');
for (const f of SP.it_b6 || []) for (let y = 0; y + 1 < f.length; y++) for (let x = 0; x + 1 < f[0].length; x++) if (f[y][x] === 'w' && f[y][x + 1] === 'w' && f[y + 1][x] === 'w' && f[y + 1][x + 1] === 'w') errs.push(`it_b6: a 2x2 white shine at ${x},${y} (reads as a free bubble)`);
// GA1 / GA2 (design/gacha.md 4.2, 4.4, §8): the 뽑기's art. The 8 draw-only worn items run the checks above (anchors.js
// ITEM_IDS); here their spec sizes, the icons, the duckling, the machine, the crank and the capsules
const GA_IT = { hd: [10, 6], he: [8, 7], f8: [9, 4], f9: [9, 4], n9: [8, 4], na: [10, 3], b8: [8, 9], b9: [8, 10] };
for (const [id, [w, h]] of Object.entries(GA_IT)) { const f = (SP['it_' + id] || [])[0]; if (f && (f[0].length !== w || f.length !== h)) errs.push(`it_${id}: ${f[0].length}x${f.length}, gacha.md 4.2 says ${w}x${h}`); }
const GA_UI = { ic_e7: [1, 8, 8], ic_e8: [1, 8, 8], ic_cap: [1, 8, 8], fx_duck: [2, 5, 4], gacha: [1, 20, 28], gacha_h: [4, 7, 7], cap: [4, 6, 6], cap_t: [4, 6, 3], cap_b: [1, 6, 3] };
for (const [n, [k, w, h]] of Object.entries(GA_UI)) { REQ[n] = [k, w, h]; checkSprite(n, k, w, h); }
const gaKeys = (fr) => new Set((fr || []).flatMap((f) => f.join('').split('')));
// hd is no gold and no red (hc's gold and the podium crown stay unique); f8 has no Y (it vanishes beside the duck's eye);
// n9 has no c next to a w (the bubble's cyan with its white glint) and is square; the machine has no R
for (const [n, bad] of [['it_hd', 'YyLRr'], ['it_f8', 'Y'], ['gacha', 'R']]) { const k = gaKeys(SP[n]); for (const ch of bad) if (k.has(ch)) errs.push(`${n}: no '${ch}' (gacha.md 4.4 / §8)`); }
for (const f of SP.it_n9 || []) for (let y = 0; y < f.length; y++) for (let x = 0; x < f[0].length; x++) if (f[y][x] === 'c' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (f[y + dy] || '')[x + dx] === 'w')) errs.push(`it_n9: c beside w at ${x},${y} (reads as a bubble)`);
// b9 is an OPEN S: every empty pixel of its box reaches the box edge through empty pixels (a closed loop = a kit's ring)
for (const f of SP.it_b9 || []) {
  const w = f[0].length, h = f.length, seen = new Set(), st = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && f[y][x] === '.') { seen.add(x + ',' + y); st.push([x, y]); }
  while (st.length) { const [x, y] = st.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h || f[Y][X] !== '.' || seen.has(X + ',' + Y)) continue; seen.add(X + ',' + Y); st.push([X, Y]); } }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (f[y][x] === '.' && !seen.has(x + ',' + y)) { errs.push(`it_b9: an enclosed hole at ${x},${y} (a closed loop reads as a ring)`); y = h; break; }
}
// cap / cap_t frame i: the top half in rarity i's two keys (보통 E h, 고급 t T, 희귀 v V, 전설 Y y), no other rarity's;
// the bottom halves (cap rows 3-5, cap_b) are w / W in ink
const RAR = [['E', 'h'], ['t', 'T'], ['v', 'V'], ['Y', 'y']], RKEYS = RAR.flat();
for (const n of ['cap', 'cap_t']) (SP[n] || []).forEach((f, i) => {
  const top = new Set(f.slice(0, 3).join('').split('')), want = RAR[i] || [];
  if (!want.every((c) => top.has(c))) errs.push(`${n}[${i}]: the top half wants both rarity keys ${want.join(' ')}`);
  const other = RKEYS.filter((c) => !want.includes(c) && top.has(c)); if (other.length) errs.push(`${n}[${i}]: another rarity's key ${other.join(' ')} in the top half`);
});
for (const f of (SP.cap || []).map((g) => g.slice(3)).concat(SP.cap_b || [])) if (f.some((r) => /[^.kwW]/.test(r))) errs.push('cap / cap_b: the bottom half is w / W with ink only');
// gacha: its feet on its last row (drawn at 4, 3 its bottom row is the view's row 30); the crank has its knob (p) in
// each of its four frames, in a different place each time
if (SP.gacha && !/[^.]/.test(SP.gacha[0][27] || '')) errs.push('gacha: row 27 (the feet) is empty');
if (SP.gacha_h) { const at = SP.gacha_h.map((f) => f.join('').indexOf('p')); if (at.some((i) => i < 0) || new Set(at).size !== at.length) errs.push('gacha_h: a pink knob (p) in every frame, at 12 / 3 / 6 / 9 o\'clock'); }
// the duckling: Y body, k outline, a w eye, an O bill, in both frames
for (const f of SP.fx_duck || []) { const k = new Set(f.join('')); if (!['Y', 'k', 'w', 'O'].every((c) => k.has(c))) errs.push('fx_duck: Y body, k outline, w eye and O bill in every frame'); }
for (const id of ['b2', 'b3']) if (!TUBE[id]) errs.push(`tools/anchors.js TUBES must list ${id}`);

// ANCHORS (6.1): every animal, every anchored sprite name with one entry per frame, every point on the 16x16 frame
const AN = PG.ANCHORS || {};
if (!PG.ANCHORS) errs.push('PG.ANCHORS missing (shop.md 6.1)');
const inF = (p) => p[0] >= 0 && p[0] < 16 && p[1] >= 0 && p[1] < 16;
for (const c of Object.keys(AN)) if (!CHARS.includes(c)) errs.push(`ANCHORS.${c}: not one of the six animals`);
const shopLift = {};
for (const c of CHARS) {
  const A = AN[c];
  if (!A) { errs.push(`ANCHORS.${c} missing (that animal would wear nothing)`); continue; }
  if (A.face !== 'p' && A.face !== 'f') errs.push(`ANCHORS.${c}.face = ${A.face}, want 'p' (profile) or 'f' (front)`);
  if (!Array.isArray(A.base) || A.base.length !== 10 || !A.base.every(Number.isInteger)) { errs.push(`ANCHORS.${c}.base must be 10 integers`); continue; }
  for (const n of Object.keys(A.off || {})) if (!AX.anchoredNames(c).includes(n)) errs.push(`ANCHORS.${c}.off.${n}: not an anchored sprite of ${c}`);
  for (const n of AX.anchoredNames(c)) {
    const list = (A.off || {})[n], frames = SP[n] || [];
    if (!list) { errs.push(`ANCHORS.${c}.off.${n} missing (that pose would wear nothing)`); continue; }
    if (list.length !== frames.length) errs.push(`ANCHORS.${c}.off.${n}: ${list.length} entries for ${frames.length} frames`);
    list.forEach((o, i) => { if (!(Array.isArray(o) && [2, 10, 14].includes(o.length) && o.every(Number.isInteger))) errs.push(`ANCHORS.${c}.off.${n}[${i}]: [dx, dy] or 10 (+4 hide) integers`); });
    frames.forEach((f, i) => {
      const a = AX.anchorsOf(AN, n, i); if (!a) return;
      const curled = n === AX.MOVE[c] && (c === 'capy' || c === 'cat');
      for (const k of ['H', 'E', 'N', 'B', 'W']) {
        const p = a[k];
        if (!p) { if (!(curled && (k === 'B' || k === 'W'))) errs.push(`${n}[${i}]: anchor ${k} hidden (only B / W, and only in the curled poses)`); continue; }
        if (!inF(p)) { errs.push(`${n}[${i}]: anchor ${k} ${p} off the 16x16 frame`); continue; }
        // H E N W sit on the animal; B (behind the shoulder) within 1 px of it
        const on = (x, y) => (f[y] || '')[x] && f[y][x] !== '.';
        if (k === 'B' ? ![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => on(p[0] + dx, p[1] + dy)) : !on(p[0], p[1])) errs.push(`${n}[${i}]: anchor ${k} ${p} is not on ${c}'s body`);
      }
      if (a.hide && !(a.hide[0] <= a.hide[2] && a.hide[1] <= a.hide[3] && a.hide[0] >= -1 && a.hide[2] <= 16 && a.hide[1] >= -2 && a.hide[3] < 16)) errs.push(`${n}[${i}]: hide box ${a.hide} is not a box on the frame`);
    });
  }
  if (!Array.isArray(A.port) || A.port.length !== 6 || !A.port.every((v) => Number.isInteger(v) && v >= 0 && v < 32)) errs.push(`ANCHORS.${c}.port must be 6 integers on the 32x32 portrait`);
  if (A.porthide && !(A.porthide.length === 4 && A.porthide.every((v) => Number.isInteger(v) && v >= 0 && v < 32))) errs.push(`ANCHORS.${c}.porthide must be a box on the portrait`);
}
// 6.3: every item on every animal x anchored frame stays inside its limits (frame coordinates; the composite puts the
// body at 4, 8 of 24x24): hats within the composite (<= 8 above, <= 4 beside) and <= 6 above in idle 0; face items on
// the head's own row span +-1; neck items within the body's columns +-1; back items <= 4 px behind the body's back
// edge, tubes <= 2 px beyond each side; nothing below the feet line. Then the portraits: the whole hat shows (dy <= 8)
const limitErrs = new Map();
const limitErr = (key, msg) => { if (!limitErrs.has(key)) limitErrs.set(key, msg); };
// the frame pixels an item covers when worn on frame anchors a: [[x, y], ...] (every part, as lookFrame places them)
function placed(a, id) {
  const s = id[0], parts = s === 'b' ? (TUBE[id] ? [[0, a.W], [1, a.W]] : [[0, a.B]]) : [[s === 'f' && a.face === 'f' ? 1 : 0, a[{ h: 'H', f: 'E', n: 'N' }[s]]]];
  const o = [];
  for (const [part, Pt] of parts) {
    const it = Pt && frameOfItem(id, part); if (!it) continue;
    it.rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== '.') o.push([Pt[0] - it.px + x, Pt[1] - it.py + y]); });
  }
  return o;
}
for (const c of CHARS) {
  if (!AN[c]) continue;
  for (const n of AX.anchoredNames(c)) (SP[n] || []).forEach((f, fi) => {
    const a = AX.anchorsOf(AN, n, fi); if (!a) return;
    const bb = bbox(f), span = f.map((r) => { const m = r.match(/[^.]/), l = r.search(/[^.][.]*$/); return m ? [r.indexOf(m[0]), l] : null; });
    for (const id of ITEM_IDS) {
      if (!SP['it_' + id] || !IPV[id]) continue;
      const s = id[0], P = placed(a, id), key = `${id}@${c}`, where = `it_${id} on ${n}[${fi}]`;
      for (const [x, y] of P) if (x < -4 || x > 19 || y < -8 || y > 15) { limitErr(key + 'clip', `${where}: a pixel at ${x},${y} falls off the 24x24 composite (or below the feet)`); break; }
      for (const [x, y] of P) {
        if (y > 15) { limitErr(key + 'feet', `${where}: a pixel at row ${y}, below the feet line`); break; }
        if (GA_IT[id] && s === 'h' && n === c + '_idle' && fi === 0 && y < -4) { limitErr(key + 'h4', `${where}: ${-y} px above the frame top in idle 0 (the draw-only hats: max 4, gacha.md 4.4)`); break; }
        if (s === 'h' && n === c + '_idle' && fi === 0 && y < -6) { limitErr(key + 'h6', `${where}: ${-y} px above the frame top in idle 0 (max 6)`); break; }
        if (s === 'f' && (!span[y] || x < span[y][0] - 1 || x > span[y][1] + 1)) { limitErr(key + 'f', `${where}: a face pixel at ${x},${y} off the head's row span +-1`); break; }
        if (s === 'n' && (x < bb.x0 - 1 || x > bb.x1 + 1)) { limitErr(key + 'n', `${where}: a neck pixel at ${x},${y} beyond the body's columns +-1`); break; }
        if (s === 'b' && !TUBE[id] && (x < bb.x0 - 4 || x > bb.x1)) { limitErr(key + 'b', `${where}: a back pixel at ${x},${y}, more than 4 px behind the body (or in front of it)`); break; }
        if (TUBE[id] && (x < bb.x0 - 2 || x > bb.x1 + 2)) { limitErr(key + 'w', `${where}: a tube pixel at ${x},${y}, more than 2 px beyond the body`); break; }
      }
      if (s === 'h' && n === c + '_idle' && fi === 0) shopLift[c + ' ' + id] = AX.liftOf(AX.composeLook(f, a, AX.lkOf(id), frameOfItem, AX.atW));
    }
  });
  for (const id of ITEM_IDS.filter((q) => q[0] !== 'b')) {
    if (!SP['it_' + id] || !IPV[id] || !AN[c].port) continue;
    const it = frameOfItem(id, id[0] === 'f' ? (AN[c].face === 'f' ? 1 : 0) : 0), Q = AN[c].port.slice({ h: 0, f: 2, n: 4 }[id[0]]);
    let t = -1; it.rows.forEach((r, y) => { if (t < 0 && /[^.]/.test(r)) t = y; });
    const need = -(Q[1] - 2 * it.py + 2 * t), xs = [Q[0] - 2 * it.px, Q[0] + 2 * (it.rows[0].length - it.px) - 1];
    if (need > 8) limitErr(`port${id}${c}`, `portrait_${c} + it_${id}: the hat needs the bust ${need} px down (max 8), its top is cropped`);
    if (xs[0] < 0 || xs[1] > 31) limitErr(`portx${id}${c}`, `portrait_${c} + it_${id}: the item spans columns ${xs[0]}..${xs[1]}, off the 32x32 portrait`);
  }
}
// a face item must not vanish on a face (review 2026-10-18: the yellow star and the yellow monocle on the yellow duck):
// on every animal, of the frame it wears there (profile / front), the colour pixels (all but the ink - k, or the
// decal's rim key) may be at most 80% that animal's body keys (PG.TWIN_KEYS), unless the item is drawn mostly in ink
// (glasses: their frame carries them, e.g. the white fogged lenses on the white cat)
for (const id of ITEM_IDS.filter((q) => q[0] === 'f')) for (const c of CHARS) {
  const A = AN[c], keys = (PG.TWIN_KEYS || {})[c]; if (!A || !keys || !SP['it_' + id]) continue;
  const fr = SP['it_' + id][Math.min(A.face === 'f' ? 1 : 0, SP['it_' + id].length - 1)];
  let ink = 0, col = 0, body = 0;
  for (const r of fr) for (const ch of r) { if (ch === '.') continue; if (ch === 'k' || ch === RIM[id]) { ink++; continue; } col++; if (keys[ch] !== undefined) body++; }
  if (col > ink && body > 0.8 * col) errs.push(`it_${id} on ${c}: ${body} of its ${col} colour pixels are ${c}'s body keys (${Object.keys(keys).join(' ')}) - it vanishes on that face (max 80%)`);
}
for (const m of limitErrs.values()) errs.push(m);
const maxLift = Math.max(0, ...Object.values(shopLift));

// unused / unexpected sprite names are fine but reported
const extra = Object.keys(SP).filter((k) => !(k in REQ) && !(k in OPTIONAL));

assert(Array.isArray(PG.THEMES) && PG.THEMES.length === 5, 'need exactly 5 THEMES');
PG.THEMES.forEach((t, i) => {
  for (const key of ['bg', 'bgTile', 'grout']) if (!/^#[0-9a-f]{6}$/i.test(t[key] || '')) errs.push(`THEMES[${i}].${key} bad`);
  if (!t.name) errs.push(`THEMES[${i}].name missing`);
  if (t.tile !== 'tile_' + i || !SP[t.tile]) errs.push(`THEMES[${i}].tile should be tile_${i}`);
});
// palette usage
const used = new Set();
for (const s of Object.values(SP)) for (const f of s) for (const r of f) for (const ch of r) used.add(ch);
const unused = Object.keys(P).filter((k) => !used.has(k));

function report() {
  if (errs.length) { console.log('FAIL\n' + errs.join('\n')); process.exitCode = 1; return; }
  console.log(`OK: ${Object.keys(REQ).length} required sprites, ${nPal} palette colours (all distinct), twin keys for ${CHARS.length} animals` +
    `, shop: ${ITEM_IDS.length} items + ${Object.keys(SHOP_UI).length + 6} icons, anchors for ${Object.keys(AN).length} animals (hat lift <= ${maxLift})` +
    (unused.length ? `, unused colours: ${unused.join('')}` : '') + (extra.length ? `, extra sprites: ${extra.join(',')}` : ''));
}

// ---------------------------------------------------------------- contact sheet
const T = 'C:/Temp/bogeul';
const [SC = '4', FILT = '', NAME = 'sheet.html'] = process.argv.slice(2);
fs.mkdirSync(T, { recursive: true });
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#10202a;color:#e8f0e0;font:11px monospace;padding:8px}
.s{display:inline-block;margin:4px 6px;vertical-align:top;text-align:center}
.f{display:flex;gap:4px;align-items:flex-end}
canvas{image-rendering:pixelated;background:#0b2427;outline:1px solid #234}
h3{margin:6px 0 0;font-size:12px;color:#ffd23c}
</style></head><body><div id="out"></div><script>
${code}
const SC = ${SC}, FILT = new RegExp(${JSON.stringify(FILT)}); const P = PG.PALETTE, S = PG.SPRITES, out = document.getElementById('out');
function draw(frame, bg) {
  const h = frame.length, w = frame[0].length, c = document.createElement('canvas');
  c.width = w * SC; c.height = h * SC; const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height); }
  frame.forEach((r, y) => { for (let i = 0; i < r.length; i++) { const ch = r[i]; if (ch === '.') continue; x.fillStyle = P[ch]; x.fillRect(i * SC, y * SC, SC, SC); } });
  return c;
}
for (const name of Object.keys(S).filter((n) => FILT.test(n))) {
  const d = document.createElement('div'); d.className = 's';
  const f = document.createElement('div'); f.className = 'f';
  S[name].forEach((fr) => f.appendChild(draw(fr)));
  d.appendChild(f); const l = document.createElement('div'); l.textContent = name + ' (' + S[name].length + ')'; d.appendChild(l);
  out.appendChild(d);
}
// 1x blitter onto a 2d context
function blit(y, name, i, X, Y, flip) {
  const fr = S[name][i % S[name].length], w = fr[0].length;
  fr.forEach((r, yy) => { for (let k = 0; k < r.length; k++) { const ch = r[k]; if (ch === '.') continue; y.fillStyle = P[ch]; y.fillRect(X + (flip ? w - 1 - k : k), Y + yy, 1, 1); } });
}
if (FILT.source === "(?:)") {
const h3 = document.createElement('h3'); h3.textContent = 'themes'; out.appendChild(h3);
PG.THEMES.forEach((t) => {
  const c = document.createElement('canvas'); c.width = 96 * 3; c.height = 48 * 3; const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  const o = document.createElement('canvas'); o.width = 96; o.height = 48; const y = o.getContext('2d');
  y.fillStyle = t.bg; y.fillRect(0, 0, 96, 48);
  for (let i = 0; i < 96; i += 16) for (let j = 0; j < 48; j += 16) { y.fillStyle = t.bgTile; y.fillRect(i + 1, j + 1, 15, 15); }
  for (let i = 0; i < 12; i++) blit(y, t.tile, 0, i * 8, 40);
  for (let i = 2; i < 7; i++) blit(y, t.tile, 0, i * 8, 24);
  blit(y, 'duck_idle', 0, 56, 24); blit(y, 'grime_trapped', 0, 30, 4); blit(y, 'mold_walk', 0, 20, 8);
  x.drawImage(o, 0, 0, 96 * 3, 48 * 3);
  const d = document.createElement('div'); d.className = 's'; d.appendChild(c);
  const l = document.createElement('div'); l.textContent = t.name; d.appendChild(l); out.appendChild(d);
});
// ---- v2 scene: a full 256x208 playfield using the new sprites, shown at 3x and 1x
(function () {
  const W = 256, H = 208, th = PG.THEMES[0];
  const o = document.createElement('canvas'); o.width = W; o.height = H; const y = o.getContext('2d');
  y.fillStyle = th.bg; y.fillRect(0, 0, W, H);
  for (let i = 0; i < W; i += 16) for (let j = 0; j < H; j += 16) { y.fillStyle = th.bgTile; y.fillRect(i + 1, j + 1, 15, 15); }
  const map = [];
  for (let r = 0; r < 26; r++) map.push(Array(32).fill('.'));
  const set = (c0, c1, r, ch) => { for (let c = c0; c <= c1; c++) map[r][c] = ch; };
  for (let r = 0; r < 26; r++) { map[r][0] = map[r][1] = map[r][30] = map[r][31] = '#'; }
  set(2, 13, 0, '#'); set(18, 29, 0, '#'); set(2, 13, 25, '#'); set(18, 29, 25, '#');
  for (let r = 21; r <= 24; r++) { map[r][2] = '#'; map[r][11] = '#'; set(3, 10, r, '~'); }
  for (let r = 22; r <= 24; r++) { map[r][18] = '#'; map[r][28] = '#'; set(19, 27, r, '='); }
  set(4, 12, 16, '#'); set(19, 27, 16, '#'); set(13, 18, 9, '#');
  const top = (r, c) => r === 0 || map[r - 1][c] !== map[r][c];
  // entities that sit "in" the water are drawn before it
  blit(y, 'grime_soaked', 0, 40, 176); blit(y, 'mold_soaked', 1, 64, 176); blit(y, 'sponge_soaked', 0, 160, 184, true);
  blit(y, 'duck_idle', 0, 52, 168 - 15 + 5);
  blit(y, 'ice_block', 0, 184, 176 - 12);
  blit(y, 'grime_trapped', 1, 184, 176 - 12);
  for (let r = 0; r < 26; r++) for (let c = 0; c < 32; c++) {
    const ch = map[r][c];
    if (ch === '#') blit(y, th.tile, 0, c * 8, r * 8);
    if (ch === '~' || ch === '=') {
      const n = ch === '~' ? 'water_hot' : 'water_cold';
      y.globalAlpha = 0.82; blit(y, top(r, c) ? n + '_top' : n, (c + (r & 1)) & 1, c * 8, r * 8); y.globalAlpha = 1;
    }
  }
  for (let c = 14; c <= 17; c++) blit(y, 'drain', 0, c * 8, 200);
  blit(y, 'shower', 0, 120, 0);
  blit(y, 'stamp_bubble', 0, 120, 176);
  blit(y, 'scald_drop', 0, 72, 8); blit(y, 'scald_drop', 1, 88, 40); blit(y, 'scald_drop', 1, 216, 60);
  blit(y, 'boss_grime_idle', 0, 64, 96); blit(y, 'shockwave', 0, 96, 120); blit(y, 'shockwave', 1, 40, 120, true);
  blit(y, 'boss_sponge_charge', 0, 176, 96);
  blit(y, 'boss_mold_shoot', 0, 172, 22); blit(y, 'giant_bubble', 0, 168, 18);
  blit(y, 'spore', 0, 150, 40); blit(y, 'spore', 1, 214, 70); blit(y, 'spore', 0, 160, 56);
  blit(y, 'boss_towel_swoop', 0, 24, 18); blit(y, 'mini_mitt', 0, 112, 32); blit(y, 'mini_mitt', 1, 136, 44);
  blit(y, 'pw_shampoo', 0, 104, 56); blit(y, 'pw_slippers', 0, 120, 56); blit(y, 'pw_bathbomb', 0, 136, 56);
  blit(y, 'mold_walk', 0, 200, 112); blit(y, 'bubble', 0, 150, 150);
  for (let i = 0; i < 10; i++) blit(y, i < 6 ? 'stamp' : 'stamp_empty', 0, 4 + i * 9, 1);
  const wrap = document.createElement('div'); const h = document.createElement('h3'); h.textContent = 'v2 scene (3x, then 1x)'; wrap.appendChild(h);
  const big = document.createElement('canvas'); big.width = W * 3; big.height = H * 3; const bx = big.getContext('2d'); bx.imageSmoothingEnabled = false; bx.drawImage(o, 0, 0, W * 3, H * 3);
  wrap.appendChild(big); const one = document.createElement('canvas'); one.width = W; one.height = H; one.getContext('2d').drawImage(o, 0, 0); one.style.marginLeft = '8px'; wrap.appendChild(one);
  out.appendChild(wrap);
})();
}
console.log('sheet ok', Object.keys(S).length);
<` + `/script></body></html>`;
fs.writeFileSync(path.join(T, NAME), html);
console.log('wrote ' + T + '/' + NAME);

// ---------------------------------------------------------------- v3 character contact sheet (chars.html)
const charsHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#10202a;color:#e8f0e0;font:11px monospace;padding:8px}
h2{margin:10px 0 2px;font-size:14px;color:#ffd23c}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.g{display:inline-block;text-align:center;vertical-align:bottom;margin-right:6px}
.f{display:flex;gap:3px;align-items:flex-end;justify-content:center}
canvas{image-rendering:pixelated}
.b{outline:1px solid #234}
</style></head><body><div id="out"></div><script>
${code}
(function () {
  const P = PG.PALETTE, S = PG.SPRITES, TH = PG.THEMES, out = document.getElementById('out');
  const ALL = ${JSON.stringify(CHARS)};
  const q = /[?&]c=([a-z,]+)/.exec(location.search), ONLY = q ? q[1].split(',') : ALL;
  const Z = +((/[?&]z=([0-9]+)/.exec(location.search) || [0, 4])[1]); // big scale (chars.html?c=cat&z=8)
  const NAMES = { duck: '꽥꽥이', capy: '까삐', otter: '해롱이', penguin: '펭펭', cat: '냥냥', frog: '개굴이' };
  const SLOT = ['#ffd447', '#f6a6bd', '#7fdcc8', '#8dc9ff'];
  const el = (t, txt, cls) => { const e = document.createElement(t); if (txt) e.textContent = txt; if (cls) e.className = cls; return e; };
  function blit(x, fr, X, Y, flip) {
    const w = fr[0].length;
    fr.forEach((r, yy) => { for (let k = 0; k < r.length; k++) { const ch = r[k]; if (ch === '.' || !P[ch]) continue; x.fillStyle = P[ch]; x.fillRect(X + (flip ? w - 1 - k : k), Y + yy, 1, 1); } });
  }
  function canvasOf(fr, sc, bg) {
    const c = document.createElement('canvas'); c.width = fr[0].length * sc; c.height = fr.length * sc; c.className = 'b';
    const x = c.getContext('2d'); if (bg) { x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height); }
    fr.forEach((r, y) => { for (let i = 0; i < r.length; i++) { const ch = r[i]; if (ch === '.' || !P[ch]) continue; x.fillStyle = P[ch]; x.fillRect(i * sc, y * sc, sc, sc); } });
    return c;
  }
  function scaled(src, sc) { const c = document.createElement('canvas'); c.width = src.width * sc; c.height = src.height * sc; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, c.width, c.height); return c; }
  // a white sprite tinted with a slot colour (like the engine does for name-tag pointers)
  function tinted(fr, col) {
    const c = document.createElement('canvas'); c.width = fr[0].length; c.height = fr.length; const x = c.getContext('2d');
    blit(x, fr, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); return c;
  }
  const ANIMS0 = ['idle', 'walk', 'jump', 'fall', 'shoot', 'die', 'trapped', 'ghost'];
  const MOVES = ${JSON.stringify(MOVES)}; // v4: each animal's move pose sits after its fall frame
  const TWONLY = /[?&]tw=1/.test(location.search); // chars.html?tw=1 skips the per-animal frames (straight to the twins)
  for (const c of TWONLY ? [] : ONLY) {
    out.appendChild(el('h2', c + ' ' + (NAMES[c] || '')));
    const row = el('div', '', 'row');
    const ANIMS = MOVES[c] ? ANIMS0.slice(0, 4).concat([MOVES[c][0]], ANIMS0.slice(4)) : ANIMS0;
    for (const a of ANIMS) {
      const fr = S[c + '_' + a]; const g = el('div', '', 'g'); const f = el('div', '', 'f');
      if (fr) fr.forEach((q) => f.appendChild(canvasOf(q, Z, '#0b2427'))); else f.appendChild(el('span', 'MISSING'));
      g.appendChild(f); g.appendChild(el('div', a + (fr ? ' (' + fr.length + ')' : ''))); row.appendChild(g);
    }
    for (const n of ['life_' + c, 'portrait_' + c]) {
      const g = el('div', '', 'g'); if (S[n]) g.appendChild(canvasOf(S[n][0], Z, '#0b2427')); else g.appendChild(el('span', 'MISSING'));
      g.appendChild(el('div', n)); row.appendChild(g);
    }
    // v4 bubble glyph (5x5) at twice the big scale
    const gi = el('div', '', 'g'), fi = el('div', '', 'f'), ic = S['icon_' + c];
    if (ic) ic.forEach((q) => fi.appendChild(canvasOf(q, Z * 2, '#0b2427'))); else fi.appendChild(el('span', 'MISSING'));
    gi.appendChild(fi); gi.appendChild(el('div', 'icon_' + c)); row.appendChild(gi);
    out.appendChild(row);
    // 1x strips: every 16x16 frame on dark and on each theme's bg / bgTile, then the same strip at 2x
    const frames = []; for (const a of ANIMS) for (const q of S[c + '_' + a] || []) frames.push(q);
    const strips = el('div', '', 'row');
    for (const bg of [['dark', '#10202a', '#10202a']].concat(TH.map((t) => [t.name, t.bg, t.bgTile]))) {
      const cv = document.createElement('canvas'); cv.width = frames.length * 18 + 2; cv.height = 20; const x = cv.getContext('2d');
      x.fillStyle = bg[1]; x.fillRect(0, 0, cv.width, cv.height);
      frames.forEach((q, i) => { x.fillStyle = bg[2]; x.fillRect(1 + i * 18, 1, 17, 18); blit(x, q, 2 + i * 18, 2); });
      const g = el('div', '', 'g'); g.appendChild(cv); g.appendChild(document.createElement('br')); g.appendChild(scaled(cv, 2)); g.appendChild(el('div', '1x / 2x on ' + bg[0]));
      strips.appendChild(g);
    }
    out.appendChild(strips);
  }
  const PZ = +((/[?&]pz=([0-9]+)/.exec(location.search) || [0, 4])[1]); // portrait scale (chars.html?c=none&ns=1&pz=9)
  // ---- walk filmstrips: two cycles per animal, each frame stepping forward along a floor line (4x, then 1x)
  if (/[?&]walk=1/.test(location.search) || !q) {
    out.appendChild(el('h2', 'walk cycles (two cycles, frames left to right; 4x and 1x)'));
    for (const c of ALL) {
      const fr = S[c + '_walk']; if (!fr) continue;
      const o = document.createElement('canvas'); o.width = 8 * 14 + 20; o.height = 20; const y = o.getContext('2d');
      y.fillStyle = '#0b2427'; y.fillRect(0, 0, o.width, o.height); y.fillStyle = '#3fa587'; y.fillRect(0, 18, o.width, 2);
      for (let i = 0; i < 8; i++) blit(y, fr[i % 4], 2 + i * 14, 2);
      const g = el('div', '', 'g'); g.appendChild(scaled(o, 4)); g.appendChild(o); g.appendChild(el('div', c)); out.appendChild(g);
    }
  }
  // ---- twin colours (distinction.md §2.5): natural, then the 2P / 3P / 4P copy with its PG.TWIN_KEYS body keys swapped
  // for that slot's ramp (RAMP = a preview copy of game.js SLOT_RAMP, distinction §2.2); the body poses at the big
  // scale, life icon and portrait, then all four side by side at 1x / 2x on dark and on each theme
  const RAMP = [null, ['#ffd6e4', '#f6a6bd', '#d0658c', '#8e3a5e'], ['#c6f6e6', '#7fdcc8', '#3fa587', '#22705a'], ['#d4ebff', '#8dc9ff', '#4f8fd6', '#2d5b9a']];
  const TWK = PG.TWIN_KEYS || {};
  function canvasTw(fr, sc, bg, c, s) {
    const c2 = document.createElement('canvas'); c2.width = fr[0].length * sc; c2.height = fr.length * sc; c2.className = 'b';
    const x = c2.getContext('2d'); if (bg) { x.fillStyle = bg; x.fillRect(0, 0, c2.width, c2.height); }
    blitTw(x, fr, 0, 0, c, s, sc); return c2;
  }
  function blitTw(x, fr, X, Y, c, s, sc) {
    sc = sc || 1; const m = s && TWK[c];
    fr.forEach((r, yy) => { for (let k = 0; k < r.length; k++) { const ch = r[k]; if (ch === '.' || !P[ch]) continue; x.fillStyle = m && m[ch] !== undefined ? RAMP[s][m[ch]] : P[ch]; x.fillRect(X + k * sc, Y + yy * sc, sc, sc); } });
  }
  const twc = ONLY.filter((c) => S[c + '_idle']);
  if (twc.length) out.appendChild(el('h2', 'twin colours: natural, 2P, 3P, 4P (PG.TWIN_KEYS x SLOT_RAMP)'));
  for (const c of twc) {
    const row = el('div', '', 'row'), poses = [['idle', 0], ['walk', 1], ['jump', 0], MOVES[c] ? [MOVES[c][0], 0] : ['fall', 0], ['shoot', 0], ['die', 1]];
    for (const [a, i] of poses) {
      const fr = (S[c + '_' + a] || [])[i]; if (!fr) continue;
      const g = el('div', '', 'g'), f = el('div', '', 'f');
      for (let s = 0; s < 4; s++) f.appendChild(canvasTw(fr, Z, '#0b2427', c, s));
      g.appendChild(f); g.appendChild(el('div', c + '_' + a + '[' + i + ']')); row.appendChild(g);
    }
    for (const [n, sc] of [['life_' + c, Z], ['portrait_' + c, 2]]) {
      if (!S[n]) continue; const g = el('div', '', 'g'), f = el('div', '', 'f');
      for (let s = 0; s < 4; s++) f.appendChild(canvasTw(S[n][0], sc, '#0b2427', c, s));
      g.appendChild(f); g.appendChild(el('div', n)); row.appendChild(g);
    }
    out.appendChild(row);
  }
  if (twc.length) {
    const strips = el('div', '', 'row');
    for (const bg of [['dark', '#10202a', '#10202a']].concat(TH.map((t) => [t.name, t.bg, t.bgTile]))) {
      const cv = document.createElement('canvas'); cv.width = twc.length * 4 * 18 + twc.length * 6; cv.height = 20; const x = cv.getContext('2d');
      x.fillStyle = bg[1]; x.fillRect(0, 0, cv.width, cv.height);
      twc.forEach((c, ci) => { for (let s = 0; s < 4; s++) { const X = ci * (4 * 18 + 6) + s * 18; x.fillStyle = bg[2]; x.fillRect(X + 1, 1, 17, 18); blitTw(x, S[c + '_idle'][0], X + 2, 2, c, s); } });
      const g = el('div', '', 'g'); g.appendChild(cv); g.appendChild(document.createElement('br')); g.appendChild(scaled(cv, 2)); g.appendChild(el('div', '1x / 2x on ' + bg[0]));
      strips.appendChild(g);
    }
    out.appendChild(strips);
  }

  // ---- in-game scene per theme: all six animals on a floor, name tags, crown, ready mark, trapped + ghost bubbles
  const NOSCENE = /[?&]ns=1/.test(location.search); // chars.html?c=none&ns=1 jumps straight to the portraits
  if (!NOSCENE) out.appendChild(el('h2', 'scene per theme (3x, then 1x)'));
  if (!NOSCENE) TH.forEach((t, ti) => {
    const W = 256, H = 64, o = document.createElement('canvas'); o.width = W; o.height = H; const y = o.getContext('2d');
    y.fillStyle = t.bg; y.fillRect(0, 0, W, H);
    for (let i = 0; i < W; i += 16) for (let j = 0; j < H; j += 16) { y.fillStyle = t.bgTile; y.fillRect(i + 1, j + 1, 15, 15); }
    for (let i = 0; i < 32; i++) blit(y, S[t.tile][0], i * 8, 56);
    ALL.forEach((c, i) => {
      const X = 6 + i * 42, Y = 40, anim = (ti + i) % 3 === 0 ? 'walk' : 'idle';
      const fr = (S[c + '_' + anim] || S.duck_idle)[(ti + i) % (anim === 'walk' ? 4 : 2)];
      blit(y, fr, X, Y, i === 5);
      // name tag: slot-coloured plate + pointer
      const col = SLOT[i % 4]; y.fillStyle = col; y.fillRect(X - 1, Y - 11, 18, 6); y.fillStyle = '#1c1530'; y.fillRect(X + 2, Y - 9, 12, 2);
      if (S.tag_arrow) y.drawImage(tinted(S.tag_arrow[0], col), X + 6, Y - 5);
      if (i === 0 && S.crown) blit(y, S.crown[0], X + 4, Y - 20);
      if (i % 2 === 1 && S.ready) blit(y, S.ready[0], X + 17, Y - 12);
      if (S[c + '_trapped']) blit(y, S[c + '_trapped'][ti & 1], X + 18, 6 + (i % 2) * 4);
      if (S[c + '_ghost']) blit(y, S[c + '_ghost'][(ti + i) & 1], X + 18, 24 - (i % 2) * 4);
      if (S['life_' + c]) blit(y, S['life_' + c][0], 2 + i * 9, 1);
    });
    const g = el('div', '', 'g'); g.appendChild(scaled(o, 3)); g.appendChild(o); g.appendChild(el('div', t.name));
    out.appendChild(g);
  });
  // ---- v4 bubble glyphs: each animal's shot bubble as the engine shows it (hue film alpha 0.30, a 1 px slot ring,
  // the 5x5 glyph at the centre 1 px low; the yarn's two frames side by side), per theme at 3x, then 1x
  const HUE = { duck: '#ffe36b', capy: '#ffa98a', otter: '#5fe0c8', penguin: '#9fdcff', cat: '#c9a8ff', frog: '#9be86a' };
  if (!NOSCENE) out.appendChild(el('h2', 'bubble glyphs per theme (3x, then 1x; ring = slot colour)'));
  if (!NOSCENE) TH.forEach((t) => {
    const cells = []; for (const c of ALL) (S['icon_' + c] || [null]).forEach((f) => cells.push([c, f]));
    const W = cells.length * 20 + 4, H = 20, o = document.createElement('canvas'); o.width = W; o.height = H; const y = o.getContext('2d');
    y.fillStyle = t.bg; y.fillRect(0, 0, W, H);
    for (let i = 0; i < W; i += 16) { y.fillStyle = t.bgTile; y.fillRect(i + 1, 1, 15, 15); }
    cells.forEach(([c, f], i) => {
      const X = 2 + i * 20, Y = 2;
      y.globalAlpha = 0.3; y.fillStyle = HUE[c]; y.beginPath(); y.arc(X + 8, Y + 8, 7, 0, Math.PI * 2); y.fill();
      y.globalAlpha = 0.9; y.strokeStyle = SLOT[i % 4]; y.lineWidth = 1; y.beginPath(); y.arc(X + 8, Y + 8, 8.5, 0, Math.PI * 2); y.stroke(); y.globalAlpha = 1;
      blit(y, S.bubble[i % 3], X, Y);
      if (f) blit(y, f, X + 6, Y + 7);
    });
    const g = el('div', '', 'g'); g.appendChild(scaled(o, 3)); g.appendChild(o); g.appendChild(el('div', t.name));
    out.appendChild(g);
  });
  // ---- portraits on dark and on a light card (select screen), life icons in a HUD row
  out.appendChild(el('h2', 'portraits (4x dark, 2x light card, 1x) and life icons'));
  const pr = el('div', '', 'row');
  for (const c of ALL) {
    const g = el('div', '', 'g'); const n = S['portrait_' + c];
    if (n) { g.appendChild(canvasOf(n[0], PZ, '#10202a')); g.appendChild(canvasOf(n[0], 2, '#fff3d6')); g.appendChild(canvasOf(n[0], 1, '#fff3d6')); }
    g.appendChild(el('div', c)); pr.appendChild(g);
  }
  out.appendChild(pr);
  const hud = el('div', '', 'row');
  for (const sc of [1, 3]) {
    const cv = document.createElement('canvas'); cv.width = 6 * 3 * 9 + 4; cv.height = 10; const x = cv.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, cv.width, cv.height);
    ALL.forEach((c, i) => { for (let k = 0; k < 3; k++) if (S['life_' + c]) blit(x, S['life_' + c][0], 2 + (i * 3 + k) * 9, 1); });
    hud.appendChild(sc === 1 ? cv : scaled(cv, 3));
  }
  const ui = el('div', '', 'g'); for (const n of ['crown', 'tag_arrow', 'ready']) if (S[n]) ui.appendChild(canvasOf(S[n][0], 6, '#10202a'));
  ui.appendChild(el('div', 'crown / tag_arrow / ready')); hud.appendChild(ui);
  out.appendChild(hud);
  // ---- v4 trophies: the cup (front, turned) and the 7 league icons at 6x, then 1x / 3x on dark and on each theme
  out.appendChild(el('h2', 'trophies: cup + leagues lg_0..lg_6 (6x, then 1x / 3x on dark and each theme)'));
  const TRO = ['trophy', 'trophy', 'lg_0', 'lg_1', 'lg_2', 'lg_3', 'lg_4', 'lg_5', 'lg_6'].map((n, i) => (S[n] ? S[n][n === 'trophy' ? i : 0] : null)).filter(Boolean);
  const big = el('div', '', 'row');
  TRO.forEach((fr, i) => { const g = el('div', '', 'g'); g.appendChild(canvasOf(fr, 6, '#10202a')); g.appendChild(el('div', i < 2 ? 'trophy[' + i + ']' : 'lg_' + (i - 2))); big.appendChild(g); });
  out.appendChild(big);
  const tstrips = el('div', '', 'row');
  for (const bg of [['dark', '#10202a']].concat(TH.map((t) => [t.name, t.bg]))) {
    const cv = document.createElement('canvas'); cv.width = TRO.length * 10 + 2; cv.height = 12; const x = cv.getContext('2d');
    x.fillStyle = bg[1]; x.fillRect(0, 0, cv.width, cv.height);
    TRO.forEach((fr, i) => blit(x, fr, 2 + i * 10, 2));
    const g = el('div', '', 'g'); g.appendChild(cv); g.appendChild(document.createElement('br')); g.appendChild(scaled(cv, 3)); g.appendChild(el('div', '1x / 3x on ' + bg[0]));
    tstrips.appendChild(g);
  }
  out.appendChild(tstrips);
  console.log('chars sheet ok');
})();
<` + `/script></body></html>`;
fs.writeFileSync(path.join(T, 'chars.html'), charsHtml);
console.log('wrote ' + T + '/chars.html');
// v4 shop: the anchor / item contact sheet (tools/anchors.js; shop-art.html?s=anchors|items|on|idle|port|play|ui)
console.log('wrote ' + AX.writeSheet(code));
report();
