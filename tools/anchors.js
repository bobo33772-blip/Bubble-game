// Shop anchors + item art tool (design/shop.md 6.1-6.3, 6.8, 10, 16.5; art passes A1 / A2).
// Usage: node bogeul/tools/anchors.js
//   1. prints the DRAFT anchor table measured from the art by 6.1's rules (H = the centre of the top fill row inside the
//      head window, that row + 1; E = the centroid of the interior pupil (k) pixels, front: the midpoint of the two; N = (E.x +
//      1, the head window's bottom row + 1); B / W fixed per animal), per anchored frame, next to PG.ANCHORS (the hand-
//      edited truth in src/sprites.js) and lists where they differ - a redrawn frame shows up here first;
//   2. writes the contact sheet C:/Temp/bogeul/shop-art.html (look at it with run-chrome.js + Read):
//        ?s=anchors       16.5: the magenta test set (10x6 hat, 5x3 / 9x3 glasses, 8x3 scarf, 6x8 cape; then the 14x5 tube)
//                         on every animal x anchored frame and its mirror at 4x, the bare anchor points, the 6 portraits
//                         with the set at 2x, the penguin slide 3 px low on a floor, the capy slam, the cat flip, a squash
//                         of +-0.32, and 1x strips on dark and each theme
//        ?s=items         every item alone at 4x on dark, then 1x / 2x / 3x on dark and on each of the 5 themes
//        ?s=on&it=h1,f2   those items on all six animals (idle 0-1, walk 0-3, jump, fall, shoot, the move pose, then
//                         idle 0 / walk 1 / jump mirrored) at 3x, and the 6 portraits at 2x (shown at 3x)
//        ?s=idle          every item on every animal's idle 0 (3x, then the whole grid at 1x on a theme)
//        ?s=port          every 머리 / 얼굴 / 목 item on the six portraits (lookPortrait, items at 2x), then at 1x
//        ?s=play          four players wearing items with the slot ring and the tag pointer, on every theme (1x and 3x;
//                         &sets=h1f2n3b1,... picks the looks)
//        ?s=ui            coin / shop / lock / slot_* / ic_e* (&n=coin,lock picks), then 1x-3x on dark, the themes, a light
//                         card and the duck-coloured button
//        ?s=gacha         the 뽑기 (gacha.md §8): the machine + each crank frame in the 32x32 view, the crank, the capsules
//                         whole / halved and the icons at 4x, 1x / 2x on the themes and cards, fx_duck behind every animal
//                         with P1's yellow ground marker on dark and the 5 themes
//      (&c=duck,cat limits the animals; &it=h1,b2 the items; &z=N sets the big scale; &ov={"duck":{"base":[...]}} tries
//      other anchors; &x=1 first loads C:/Temp/bogeul/shop-scratch.js, where art try-outs can redefine PG.SPRITES.it_*)
// tools/check-sprites.js requires this file: the same composite runs there for the 6.3 limit checks.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------------------------------------------------------- the composite (exactly what game.js S2 builds)
// Pure functions over pixel rows: node runs them for the checks, the sheet page runs the same source (toString).
// anchors of sprite `name` frame fi: {face, H, E, N, B, W (each [x, y] or null), hide (box or null)} or null (no anchors
// for that sprite: the frame wears nothing). PG.ANCHORS[animal].off[name][fi % n] is [dx, dy] added to every base point
// (and to the hide box), or a full 10-number array (a -1, -1 pair = no such point in that frame) that may carry its own
// hide box as numbers 11-14 (without them the animal's base hide box applies, unmoved)
function anchorsOf(AN, name, fi) {
  const c = String(name).split('_')[0], A = AN && AN[c]; if (!A || !A.off || !A.base) return null;
  const list = A.off[name]; if (!list || !list.length) return null;
  const o = list[(((fi | 0) % list.length) + list.length) % list.length];
  let pts, hide = A.hide || null;
  if (o.length === 2) { pts = A.base.map((v, i) => v + o[i & 1]); if (hide) hide = [hide[0] + o[0], hide[1] + o[1], hide[2] + o[0], hide[3] + o[1]]; }
  else { pts = o.slice(0, 10); if (o.length >= 14) hide = o.slice(10, 14); }
  const pt = (i) => (pts[i] === -1 && pts[i + 1] === -1 ? null : [pts[i], pts[i + 1]]);
  return { face: A.face, H: pt(0), E: pt(2), N: pt(4), B: pt(6), W: pt(8), hide };
}
// item `id` ('h1' .. 'b7'), frame `part` (face: 0 profile / 1 front; tube: 0 back half / 1 front half) ->
// {rows, px, py} (the pivot in item pixels, PG.ITEM_PIVOT: [px, py], or [[px, py], ...] per frame) or null
function itemPart(PG, id, part) {
  const fr = PG.SPRITES['it_' + id], pv = (PG.ITEM_PIVOT || {})[id];
  if (!fr || !fr.length || !pv) return null;
  const k = Math.min(part | 0, fr.length - 1), p = Array.isArray(pv[0]) ? pv[Math.min(part | 0, pv.length - 1)] : pv;
  return { rows: fr[k], px: p[0], py: p[1] };
}
// the 24x24 composite of a 16x16 body frame (rows) wearing k = the worn digits of 머리 얼굴 목 등 (lk.slice(0, 4)):
// the body sits at (4, 8); order (6.2): a 등 item behind (B, or a tube's back half at W), the body, the hat's hide box
// cleared, a tube's front half, 목 at N, 얼굴 at E (front faces: frame 1), 머리 at H. get(id, part) -> itemPart;
// atW(id) -> true for the tubes (ITEM[id].at === 'W'). Returns {rows, lay} (lay: 'b' body / 'i' item / '.' per pixel)
function composeLook(body, A, k, get, atW) {
  const W = 24, H = 24, X0 = 4, Y0 = 8, SL = ['h', 'f', 'n', 'b'];
  const g = [], l = [];
  for (let y = 0; y < H; y++) { g.push(Array(W).fill('.')); l.push(Array(W).fill('.')); }
  const put = (id, part, P) => {
    if (!P) return; const it = get(id, part); if (!it) return;
    it.rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const ch = r[x]; if (ch === '.') continue;
      const gx = X0 + P[0] - it.px + x, gy = Y0 + P[1] - it.py + y; if (gy >= 0 && gy < H && gx >= 0 && gx < W) { g[gy][gx] = ch; l[gy][gx] = 'i'; } } });
  };
  const id = (i) => (k[i] && k[i] !== '0' ? SL[i] + k[i] : '');
  const b = id(3), bw = !!b && atW(b);
  if (b) put(b, 0, bw ? A.W : A.B);
  body.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== '.') { g[Y0 + y][X0 + x] = r[x]; l[Y0 + y][X0 + x] = 'b'; } });
  if (id(0) && A.hide) for (let y = A.hide[1]; y <= A.hide[3]; y++) for (let x = A.hide[0]; x <= A.hide[2]; x++) {
    const gx = X0 + x, gy = Y0 + y; if (gy >= 0 && gy < H && gx >= 0 && gx < W) { g[gy][gx] = '.'; l[gy][gx] = '.'; }
  }
  if (bw) put(b, 1, A.W);
  if (id(2)) put(id(2), 0, A.N);
  if (id(1)) put(id(1), A.face === 'f' ? 1 : 0, A.E);
  if (id(0)) put(id(0), 0, A.H);
  return { rows: g.map((r) => r.join('')), lay: l.map((r) => r.join('')) };
}
// lookLift (6.6): px the composite reaches above the frame top in idle 0, minus 1, floored at 0
function liftOf(comp) { let top = 24; comp.rows.forEach((r, y) => { if (top === 24 && /[^.]/.test(r)) top = y; }); return Math.max(0, 8 - top - 1); }
// lookPortrait (6.8): the 32x32 bust, then the 머리 / 얼굴 / 목 items at 2x at port = [Hx, Hy, Ex, Ey, Nx, Ny]: an
// item's pivot pixel becomes a 2x2 block whose top-left corner is the anchor pixel; a hat clears porthide first; a hat
// rising above row 0 pushes the bust dy = min(8, needed) px down (its bottom rows cropped). -> {rows, lay, dy}
function composePortrait(bust, A, k, get) {
  const S = 32, SL = ['h', 'f', 'n'], P = A.port || [];
  const id = (i) => (k[i] && k[i] !== '0' ? SL[i] + k[i] : '');
  const at = (i) => (P.length > i * 2 + 1 ? [P[i * 2], P[i * 2 + 1]] : null);
  const parts = [];
  if (id(2)) parts.push([id(2), 0, at(2)]);
  if (id(1)) parts.push([id(1), A.face === 'f' ? 1 : 0, at(1)]);
  if (id(0)) parts.push([id(0), 0, at(0)]);
  let need = 0;
  for (const [i0, part, Q] of parts) {
    const it = Q && get(i0, part); if (!it) continue;
    let t = -1; it.rows.forEach((r, y) => { if (t < 0 && /[^.]/.test(r)) t = y; });
    need = Math.max(need, -(Q[1] - 2 * it.py + 2 * t));
  }
  const dy = Math.min(8, need), g = [], l = [];
  for (let y = 0; y < S; y++) { g.push(Array(S).fill('.')); l.push(Array(S).fill('.')); }
  bust.forEach((r, y) => { const gy = y + dy; if (gy >= S) return; for (let x = 0; x < r.length; x++) if (r[x] !== '.') { g[gy][x] = r[x]; l[gy][x] = 'b'; } });
  if (id(0) && A.porthide) { const h = A.porthide; for (let y = h[1]; y <= h[3]; y++) for (let x = h[0]; x <= h[2]; x++) if (g[y + dy]) { g[y + dy][x] = '.'; l[y + dy][x] = '.'; } }
  for (const [i0, part, Q] of parts) {
    const it = Q && get(i0, part); if (!it) continue;
    it.rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const ch = r[x]; if (ch === '.') continue;
      for (let j = 0; j < 4; j++) { const gx = Q[0] + 2 * (x - it.px) + (j & 1), gy = Q[1] + dy + 2 * (y - it.py) + (j >> 1);
        if (gy >= 0 && gy < S && gx >= 0 && gx < S) { g[gy][gx] = ch; l[gy][gx] = 'i'; } } } });
  }
  return { rows: g.map((r) => r.join('')), lay: l.map((r) => r.join('')), dy };
}
const SHARED = [anchorsOf, itemPart, composeLook, liftOf, composePortrait];

// ---------------------------------------------------------------- loading
const SRC = path.join(__dirname, '..', 'src', 'sprites.js');
function load() {
  const code = fs.readFileSync(SRC, 'utf8');
  const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(code, ctx, { filename: 'sprites.js' });
  return { code, PG: ctx.window.PG };
}
const CHARS = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'];
const MOVE = { duck: 'duck_glide', capy: 'capy_slam', otter: 'otter_dash', penguin: 'penguin_slide', cat: 'cat_flip' };
// the anchored sprite names of an animal (6.1: idle, walk, jump, fall, shoot and the move pose)
const anchoredNames = (c) => ['_idle', '_walk', '_jump', '_fall', '_shoot'].map((s) => c + s).concat(MOVE[c] ? [MOVE[c]] : []);
const TUBES = { b2: 1, b3: 1 };           // the 등 items worn at the waist (ITEM[id].at === 'W' in game.js, shop.md 4)
const atW = (id) => !!TUBES[id];
// the item ids with art, in catalog order, then the 뽑기's 8 draw-only worn items (gacha.md 4.4; the 효과 slot has only
// ic_e* icons, no worn art)
const ITEM_IDS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'ha', 'hb', 'hc', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7',
  'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7',
  'hd', 'he', 'f8', 'f9', 'n9', 'na', 'b8', 'b9'];
// the worn-digits string (머리 얼굴 목 등) of one item
const lkOf = (id) => { const k = ['0', '0', '0', '0']; k['hfnb'.indexOf(id[0])] = id[1]; return k.join(''); };

// ---------------------------------------------------------------- the draft table (6.1's measuring rules)
// per animal, in idle-0 pixels: head = [x0, y0, x1, y1] the head window (its top fill row gives H, its bottom row + 1
// gives N.y); eyes = one window per visible eye (interior k / w pixels); B, W fixed. The windows follow the head with
// the frame's offset, found by matching the idle-0 head window against the frame (dx -3..3, dy -3..3). Move poses get
// their own windows (full arrays in PG.ANCHORS)
const WIN = {
  duck: { head: [5, 1, 13, 6], eyes: [[9, 2, 12, 6]], B: [2, 6], W: [8, 11] },
  capy: { head: [7, 4, 15, 9], eyes: [[11, 6, 14, 8]], B: [3, 7], W: [8, 11] },
  otter: { head: [4, 1, 14, 7], eyes: [[9, 3, 11, 6]], B: [5, 6], W: [9, 11] },
  penguin: { head: [4, 2, 12, 6], eyes: [[8, 4, 10, 6]], B: [3, 7], W: [8, 11] },
  cat: { head: [4, 4, 15, 8], eyes: [[6, 5, 9, 8], [11, 5, 14, 8]], B: [3, 8], W: [8, 12] },
  frog: { head: [3, 3, 14, 8], eyes: [[5, 4, 8, 6], [9, 4, 13, 6]], B: [2, 9], W: [8, 11] },
};
const MOVE_WIN = {
  duck_glide: null,                                                    // same head as idle (matched)
  capy_slam: { head: [7, 4, 15, 9], eyes: [[10, 5, 14, 8]] },
  otter_dash: { head: [7, 6, 15, 11], eyes: [[9, 7, 11, 10]] },
  penguin_slide: { head: [9, 6, 14, 9], eyes: [[11, 7, 13, 9]] },
  cat_flip: { head: [3, 4, 14, 8], eyes: [[4, 4, 8, 7], [9, 4, 13, 7]] },
};
const isFill = (ch) => ch !== '.' && ch !== 'k';
function matchHead(f0, f, w) {
  let best = [0, 0], bs = 1e9;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    let s = 0;
    for (let y = w[1]; y <= w[3]; y++) for (let x = w[0]; x <= w[2]; x++) {
      const a = f0[y][x], b = (f[y + dy] || '')[x + dx] || '.';
      if (isFill(a) !== isFill(b)) s += 2; else if (a !== b) s++;
    }
    if (s < bs || (s === bs && Math.abs(dx) + Math.abs(dy) < Math.abs(best[0]) + Math.abs(best[1]))) { bs = s; best = [dx, dy]; }
  }
  return { d: best, miss: bs };
}
function measure(f, head, eyes, hide) {
  const inHide = (x, y) => hide && x >= hide[0] && x <= hide[2] && y >= hide[1] && y <= hide[3];
  let H = null;
  for (let y = head[1]; y <= head[3] && !H; y++) {
    const xs = []; for (let x = head[0]; x <= head[2]; x++) if (isFill(f[y][x]) && !inHide(x, y)) xs.push(x);
    if (xs.length) H = [Math.ceil((xs[0] + xs[xs.length - 1]) / 2), y + 1];
  }
  const cen = eyes.map((e) => {
    let sx = 0, sy = 0, n = 0;
    for (let y = e[1]; y <= e[3]; y++) for (let x = e[0]; x <= e[2]; x++) {
      const ch = f[y][x]; if (ch !== 'k') continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => ((f[y + b] || '')[x + a] || '.') === '.')) continue;
      sx += x; sy += y; n++;
    }
    return n ? [sx / n, sy / n] : null;
  }).filter(Boolean);
  const E = cen.length ? [Math.floor(cen.reduce((a, p) => a + p[0], 0) / cen.length), Math.floor(cen.reduce((a, p) => a + p[1], 0) / cen.length)] : null;
  const N = E ? [E[0] + 1, head[3] + 1] : null;
  return { H, E, N };
}
function draft(PG) {
  const out = {};
  for (const c of CHARS) {
    const w = WIN[c], f0 = PG.SPRITES[c + '_idle'][0], A = (PG.ANCHORS || {})[c] || {};
    const base = measure(f0, w.head, w.eyes, A.hide);
    const rows = {};
    for (const name of anchoredNames(c)) {
      const frames = PG.SPRITES[name] || [];
      rows[name] = frames.map((f, i) => {
        const mw = MOVE_WIN[name];
        if (mw) { const m = measure(f, mw.head, mw.eyes, null); return { full: true, m }; }
        const { d, miss } = matchHead(f0, f, w.head);
        return { d, miss };
      });
    }
    out[c] = { base, B: w.B, W: w.W, rows };
  }
  return out;
}
const pt = (p) => (p ? p.join(',') : '-');
function printDraft(PG) {
  const D = draft(PG), AN = PG.ANCHORS || {};
  let diffs = 0;
  console.log('draft anchors (H E N B W; frame offsets by head match) vs PG.ANCHORS');
  for (const c of CHARS) {
    const d = D[c], b = d.base, A = AN[c];
    console.log(`${c}: draft base [${pt(b.H)}, ${pt(b.E)}, ${pt(b.N)}, ${pt(d.B)}, ${pt(d.W)}]` + (A ? `  PG.ANCHORS base [${A.base.join(', ')}] face ${A.face}` : '  (not in PG.ANCHORS)'));
    for (const name of anchoredNames(c)) {
      const rs = d.rows[name] || [];
      const line = rs.map((r, i) => {
        const got = A && anchorsOf(AN, name, i);
        if (r.full) {
          const m = r.m, s = `[${pt(m.H)} ${pt(m.E)} ${pt(m.N)}]`;
          if (got) { const dd = ['H', 'E', 'N'].filter((k) => pt(got[k]) !== pt(m[k])); if (dd.length) diffs++; return s + (dd.length ? ` hand ${dd.map((k) => k + '=' + pt(got[k])).join(' ')}` : ' =hand'); }
          return s;
        }
        const s = `[${r.d.join(',')}]` + (r.miss > 6 ? `(miss ${r.miss})` : '');
        if (got) {
          const want = { H: b.H && [b.H[0] + r.d[0], b.H[1] + r.d[1]], E: b.E && [b.E[0] + r.d[0], b.E[1] + r.d[1]] };
          const dd = ['H', 'E'].filter((k) => pt(got[k]) !== pt(want[k])); if (dd.length) diffs++;
          return s + (dd.length ? ` hand ${dd.map((k) => k + '=' + pt(got[k])).join(' ')}` : '');
        }
        return s;
      }).join('  ');
      console.log(`  ${name}: ${line}${A && !(A.off || {})[name] ? '  MISSING in PG.ANCHORS' : ''}`);
    }
  }
  console.log(`${diffs} frame(s) where the hand anchors differ from the draft (expected where the art pass moved a point)`);
}

// ---------------------------------------------------------------- the contact sheet page
function sheetHtml(code) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>shop art</title><style>
body{margin:0;background:#10202a;color:#e8f0e0;font:11px monospace;padding:8px}
h2{margin:10px 0 2px;font-size:14px;color:#ffd23c} h3{margin:6px 0 2px;font-size:12px;color:#8dc9ff}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:4px}
.g{display:inline-block;text-align:center;vertical-align:bottom}
.f{display:flex;gap:3px;align-items:flex-end;justify-content:center}
canvas{image-rendering:pixelated}
</style></head><body><div id="out"></div><script>
${code}
<` + `/script><script>
// &x=1 loads C:/Temp/bogeul/shop-scratch.js first: the art pass's try-outs (it may set PG.SPRITES.it_hx etc.)
if (/[?&]x=1/.test(location.search)) document.write('<script src="shop-scratch.js"><' + '/script>');
<` + `/script><script>
${SHARED.map(String).join('\n')}
(function () {
  const P = PG.PALETTE, S = PG.SPRITES, TH = PG.THEMES, AN = PG.ANCHORS || {}, out = document.getElementById('out');
  const qs = (k, d) => { const m = new RegExp('[?&]' + k + '=([^&]*)').exec(location.search); return m ? decodeURIComponent(m[1]) : d; };
  // &ov={"duck":{"base":[...]}} overrides PG.ANCHORS fields for a try-out (the art pass's scratch knob)
  try { const ov = JSON.parse(qs('ov', '{}')); for (const c in ov) AN[c] = Object.assign({}, AN[c], ov[c]); } catch (e) { console.log('bad ov'); }
  const SEC = qs('s', 'anchors'), Z = +qs('z', 4), ALL = ${JSON.stringify(CHARS)};
  const ONLY = qs('c', ALL.join(',')).split(',').filter((c) => ALL.includes(c));
  const MOVE = ${JSON.stringify(MOVE)}, TUBES = ${JSON.stringify(TUBES)}, ITEM_IDS = ${JSON.stringify(ITEM_IDS)};
  const atW = (id) => !!TUBES[id];
  const names = (c) => ['_idle', '_walk', '_jump', '_fall', '_shoot'].map((s) => c + s).concat(MOVE[c] ? [MOVE[c]] : []);
  const lkOf = (id) => { const k = ['0', '0', '0', '0']; k['hfnb'.indexOf(id[0])] = id[1]; return k.join(''); };
  const SLOT = ['#ffd447', '#f6a6bd', '#7fdcc8', '#8dc9ff'], INK = '#1c1530';
  const RAMP = [null, ['#ffd6e4', '#f6a6bd', '#d0658c', '#8e3a5e'], ['#c6f6e6', '#7fdcc8', '#3fa587', '#22705a'], ['#d4ebff', '#8dc9ff', '#4f8fd6', '#2d5b9a']];
  // the magenta test set of 16.5 ('#' fill, '+' its outline): 10x6 hat, 5x3 / 9x3 glasses, 8x3 scarf, 6x8 cape, 14x5 tube
  const TC = { '#': '#ff3df0', '+': '#7a0a6e' };
  const TEST = {
    hz: [{ rows: ['..++++++..', '.+######+.', '+########+', '+########+', '+########+', '++++++++++'], px: 5, py: 5 }],
    fz: [{ rows: ['..+++', '+++#+', '..+++'], px: 3, py: 1 }, { rows: ['++++.++++', '+##+++##+', '++++.++++'], px: 4, py: 1 }],
    nz: [{ rows: ['++++++++', '+######+', '++++++++'], px: 4, py: 0 }],
    bz: [{ rows: ['.+++++', '+####+', '+####+', '+####+', '+####+', '+####+', '+####+', '++++++'], px: 5, py: 3 }],
    by: [{ rows: ['..++++++++++..', '.+##########+.', '+############+', '.+##########+.', '..++++++++++..'], px: 7, py: 2 },
      { rows: ['..............', '..............', '+############+', '.+##########+.', '..++++++++++..'], px: 7, py: 2 }],
  };
  const get = (id, part) => (TEST[id] ? TEST[id][Math.min(part, TEST[id].length - 1)] : itemPart(PG, id, part));
  const atW2 = (id) => id === 'by' || atW(id);
  const colOf = (ch) => P[ch] || TC[ch] || null;
  const el = (t, txt, cls) => { const e = document.createElement(t); if (txt) e.textContent = txt; if (cls) e.className = cls; return e; };
  // rows -> canvas (sc px per pixel); tw: [char, slot] recolours the body layer only (lay 'b'), as drawEnt does
  function paint(x, rows, X, Y, sc, flip, lay, tw) {
    const w = rows[0].length, m = tw && tw[1] && (PG.TWIN_KEYS || {})[tw[0]];
    rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) { const ch = r[i]; if (ch === '.') continue;
      let col = colOf(ch); if (m && lay && lay[y][i] === 'b' && m[ch] !== undefined) col = RAMP[tw[1]][m[ch]];
      if (!col) continue; x.fillStyle = col; x.fillRect(X + (flip ? w - 1 - i : i) * sc, Y + y * sc, sc, sc); } });
  }
  function cv(w, h, bg) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); } return c; }
  function rowsCanvas(rows, sc, bg, flip, lay, tw) { const c = cv(rows[0].length * sc, rows.length * sc, bg); paint(c.getContext('2d'), rows, 0, 0, sc, flip, lay, tw); return c; }
  function scaled(src, sc) { const c = cv(src.width * sc, src.height * sc); const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, c.width, c.height); return c; }
  function look(name, fi, k) { const f = S[name][fi], A = anchorsOf(AN, name, fi); if (!A) return { rows: [].concat(Array(8).fill('.'.repeat(24)), f.map((r) => '....' + r + '....')), lay: null, A: null }; const r = composeLook(f, A, k, get, atW2); r.A = A; return r; }
  // the anchor points over a bare composite (H magenta, E cyan, N yellow, B orange, W green; the hide box outlined)
  function marks(c2, A, sc, flip) {
    const x = c2.getContext('2d'), col = { H: '#ff3df0', E: '#30f0ff', N: '#ffe600', B: '#ff8a00', W: '#3dff6a' };
    for (const k of ['H', 'E', 'N', 'B', 'W']) { const p = A[k]; if (!p) continue; const px = flip ? 15 - p[0] : p[0];
      x.strokeStyle = col[k]; x.lineWidth = Math.max(1, sc / 4); x.strokeRect((4 + px) * sc + 0.5, (8 + p[1]) * sc + 0.5, sc - 1, sc - 1); }
    if (A.hide) { const h = A.hide; x.strokeStyle = '#ffffff'; x.setLineDash([2, 2]); const x0 = flip ? 15 - h[2] : h[0]; x.strokeRect((4 + x0) * sc, (8 + h[1]) * sc, (h[2] - h[0] + 1) * sc, (h[3] - h[1] + 1) * sc); x.setLineDash([]); }
  }
  // a 1x scene cell: the composite as drawEnt would draw it (body at x, y; the 24x24 at x - 4, y - 8), with an optional
  // slot ring (distinction 2.3: 2 px ink dilation, 1 px slot band) traced from the final composite
  function blitLook(x, comp, X, Y, flip, slot, tw, dy) {
    const c = rowsCanvas(comp.rows, 1, null, flip, comp.lay, tw);
    if (slot !== undefined && slot !== null) {
      const sil = (col) => { const s = cv(24, 24), sx = s.getContext('2d'); sx.drawImage(c, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = col; sx.fillRect(0, 0, 24, 24); return s; };
      const ink = sil(INK), band = sil(SLOT[slot]);
      for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]) x.drawImage(ink, X - 4 + ox, Y - 8 + oy + (dy || 0));
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) x.drawImage(band, X - 4 + ox, Y - 8 + oy + (dy || 0));
    }
    x.drawImage(c, X - 4, Y - 8 + (dy || 0));
  }
  function floorScene(t, W, H) { const o = cv(W, H, t.bg), y = o.getContext('2d'); for (let i = 0; i < W; i += 16) for (let j = 0; j < H; j += 16) { y.fillStyle = t.bgTile; y.fillRect(i + 1, j + 1, 15, 15); } for (let i = 0; i < W; i += 8) paint(y, S[t.tile][0], i, H - 8, 1); return o; }
  function block(label, kids) { const g = el('div', '', 'g'), f = el('div', '', 'f'); kids.forEach((k) => f.appendChild(k)); g.appendChild(f); g.appendChild(el('div', label)); return g; }

  // ---------------------------------------------------------------- ?s=anchors (16.5)
  if (SEC === 'anchors') {
    const SETS = [['hat + glasses + scarf + cape', 'zzzz'], ['tube', '000y']];
    out.appendChild(el('h2', 'anchors: magenta test set on every anchored frame (4x; each pair = as drawn / mirrored), bare points (H mag E cyan N yel B org W grn)'));
    for (const c of ONLY) {
      out.appendChild(el('h3', c + ' (face ' + (AN[c] ? AN[c].face : '?') + ')'));
      for (const [lab, k] of (qs('only', '') ? SETS.filter((q) => q[1] === qs('only')) : SETS.concat([['points', 'pts']]))) {
        const row = el('div', '', 'row');
        for (const n of names(c)) (S[n] || []).forEach((f, i) => {
          const kk = k === 'pts' ? '0000' : k, a = look(n, i, kk), kids = [];
          for (const fl of [false, true]) { const c2 = rowsCanvas(a.rows, Z, '#0b2427', fl, a.lay); if (k === 'pts' && a.A) marks(c2, a.A, Z, fl); kids.push(c2); if (k === 'pts') break; }
          row.appendChild(block(n.replace(c + '_', '') + '[' + i + ']' + (a.A ? '' : ' NONE'), kids));
        });
        row.appendChild(el('div', lab)); out.appendChild(row);
      }
    }
    // the 6 portraits with the set at 2x (hat + glasses + scarf), shown at 3x and 1x
    out.appendChild(el('h3', 'portraits: test set at 2x (shown at 3x, then 1x)'));
    const pr = el('div', '', 'row');
    for (const c of ONLY) { const A = AN[c]; if (!A) continue; const p = composePortrait(S['portrait_' + c][0], A, 'zzz', get);
      pr.appendChild(block(c + ' dy ' + p.dy, [rowsCanvas(p.rows, 3, '#0b2427'), rowsCanvas(p.rows, 1, '#fff3d6')])); }
    out.appendChild(pr);
    // the special poses on a floor: penguin slide drawn 3 px low, capy slam, cat flip, otter dash; squash +-0.32
    out.appendChild(el('h3', 'on the floor (3x): slide 3 px low, slam, flip, dash; idle 0 squashed +0.32 / -0.32 (scaled about the feet)'));
    const fl = el('div', '', 'row');
    for (const [n, dy] of [['penguin_slide', 3], ['capy_slam', 0], ['cat_flip', 0], ['otter_dash', 0], ['duck_glide', 0]]) {
      if (!S[n]) continue; const o = floorScene(TH[0], 40, 40), y = o.getContext('2d');
      blitLook(y, look(n, 0, 'zzzz'), 12, 16 + dy, false, null, null); fl.appendChild(block(n, [scaled(o, 3)]));
    }
    for (const c of ONLY) for (const sq of [0.32, -0.32]) {
      const o = floorScene(TH[1], 48, 48), y = o.getContext('2d'), a = look(c + '_idle', 0, 'zzzz'), src = rowsCanvas(a.rows, 1, null, false, a.lay);
      const w = Math.round(24 * (1 + sq)), h = Math.round(24 * (1 - sq)); y.imageSmoothingEnabled = false; y.drawImage(src, Math.round(16 + 8 - w / 2), Math.round(24 + 16 - h), w, h);
      fl.appendChild(block(c + ' sq ' + sq, [scaled(o, 3)]));
    }
    out.appendChild(fl);
    // 1x / 2x strips: every animal's idle 0 / walk 1 / jump with the set and the tube on dark and every theme
    out.appendChild(el('h3', '1x and 2x strips (set, then tube) on dark and each theme'));
    const st = el('div', '', 'row');
    for (const t of [{ name: 'dark', bg: '#10202a', bgTile: '#10202a', tile: 'tile_0' }].concat(TH)) {
      const o = cv(ALL.length * 3 * 26 + 8, 60, t.bg), y = o.getContext('2d');
      ALL.forEach((c, ci) => [[c + '_idle', 0], [c + '_walk', 1], [c + '_jump', 0]].forEach(([n, i], j) => {
        const X = 6 + (ci * 3 + j) * 26; blitLook(y, look(n, i, 'zzzz'), X, 10, j === 2, null); blitLook(y, look(n, i, '000y'), X, 38, false, null);
      }));
      st.appendChild(block(t.name, [o, scaled(o, 2)]));
    }
    out.appendChild(st);
  }
  const BGS = [{ name: 'dark', bg: '#10202a', bgTile: '#10202a', tile: 'tile_0' }].concat(TH);
  const IDS = qs('it', '') ? qs('it').split(',') : ITEM_IDS.filter((id) => S['it_' + id]);
  // ---------------------------------------------------------------- ?s=items: each item alone
  if (SEC === 'items') {
    out.appendChild(el('h2', 'items alone: 4x on dark (each frame), then 1x / 2x / 3x on dark and each theme'));
    const row = el('div', '', 'row');
    for (const id of IDS) { const fr = S['it_' + id]; if (!fr) { row.appendChild(el('span', id + ' MISSING')); continue; }
      row.appendChild(block('it_' + id + ' ' + fr[0][0].length + 'x' + fr[0].length, fr.map((f) => rowsCanvas(f, Z, '#0b2427')))); }
    out.appendChild(row);
    for (const sc of [1, 2, 3]) {
      const st = el('div', '', 'row');
      for (const t of BGS) {
        const o = cv(IDS.length * 17 + 4, 14, t.bg), y = o.getContext('2d');
        IDS.forEach((id, i) => { const fr = S['it_' + id]; if (!fr) return; y.fillStyle = t.bgTile; y.fillRect(2 + i * 17, 0, 16, 14); paint(y, fr[fr.length - 1], 3 + i * 17, 2, 1); });
        st.appendChild(block(t.name + ' ' + sc + 'x', [sc === 1 ? o : scaled(o, sc)]));
      }
      out.appendChild(st);
    }
  }
  // ---------------------------------------------------------------- ?s=on: items on every animal and frame, portraits
  if (SEC === 'on') {
    for (const id of IDS) {
      out.appendChild(el('h2', 'it_' + id + ' on every animal (' + Z + 'x; then idle 0 / walk 1 / jump mirrored; portrait at 2x shown at 3x)'));
      for (const c of ONLY) {
        const row = el('div', '', 'row'), kids = [];
        for (const n of names(c)) (S[n] || []).forEach((f, i) => { const a = look(n, i, lkOf(id)); kids.push(rowsCanvas(a.rows, Z, '#0b2427', false, a.lay)); });
        for (const [n, i] of [[c + '_idle', 0], [c + '_walk', 1], [c + '_jump', 0]]) { const a = look(n, i, lkOf(id)); kids.push(rowsCanvas(a.rows, Z, '#163238', true, a.lay)); }
        if (id[0] !== 'b' && AN[c]) { const p = composePortrait(S['portrait_' + c][0], AN[c], lkOf(id).slice(0, 3), get); kids.push(rowsCanvas(p.rows, 3, '#0b2427')); }
        row.appendChild(block(c, kids)); out.appendChild(row);
      }
    }
  }
  // ---------------------------------------------------------------- ?s=idle: every item on every animal's idle 0
  if (SEC === 'idle') {
    out.appendChild(el('h2', 'every item on every idle 0 (' + Z + 'x), then the grid at 1x and 2x on themes'));
    for (const id of IDS) {
      const row = el('div', '', 'row');
      row.appendChild(block('it_' + id, ONLY.map((c) => { const a = look(c + '_idle', 0, lkOf(id)); return rowsCanvas(a.rows, Z, '#0b2427', false, a.lay); })));
      out.appendChild(row);
    }
    const st = el('div', '', 'row');
    for (const t of BGS.slice(0, 3)) {
      const o = floorScene(t, ONLY.length * 22 + 8, IDS.length * 26 + 8), y = o.getContext('2d');
      IDS.forEach((id, r) => ONLY.forEach((c, i) => blitLook(y, look(c + '_idle', 0, lkOf(id)), 6 + i * 22, 10 + r * 26, false, null)));
      st.appendChild(block(t.name, [o, scaled(o, 2)]));
    }
    out.appendChild(st);
  }
  // ---------------------------------------------------------------- ?s=port: every 머리 / 얼굴 / 목 item on the portraits
  if (SEC === 'port') {
    out.appendChild(el('h2', 'portraits (lookPortrait: items at 2x; shown at ' + Z + 'x and 1x on the light card)'));
    for (const id of IDS.filter((q) => q[0] !== 'b')) {
      const row = el('div', '', 'row');
      row.appendChild(block('it_' + id, ONLY.map((c) => { const A = AN[c]; if (!A) return el('span', 'no anchors');
        const p = composePortrait(S['portrait_' + c][0], A, lkOf(id).slice(0, 3), get); return rowsCanvas(p.rows, Z, '#0b2427'); })));
      row.appendChild(block('1x', ONLY.map((c) => { const p = composePortrait(S['portrait_' + c][0], AN[c] || {}, lkOf(id).slice(0, 3), get); return rowsCanvas(p.rows, 1, '#fff3d6'); })));
      out.appendChild(row);
    }
  }
  // ---------------------------------------------------------------- ?s=play: four players with items and slot rings
  if (SEC === 'play') {
    out.appendChild(el('h2', 'four players: slot ring traced around body + items, tag pointer 2 px over the hat (1x, 3x); last row bare'));
    const sets = qs('sets', 'h1f2n3b1,h7f5n6b6,hcf4n8b7,h9f7n5b4,h3f6n2b3,hbf1n7b5,h5f3n4b2,haf2n1b1,h6f4n8b6,h2f5n3b7,h4f7n6b4,h8f1n5b2').split(',');
    const sc = TH.map((t, ti) => {
      const W = 256, Hh = 44 * Math.ceil((sets.length + 4) / 4) + 8, o = floorScene(t, W, Hh), y = o.getContext('2d');
      sets.concat(['', '', '', '']).forEach((s, i) => {
        const c = ALL[(i + ti) % 6], slot = i % 4, X = 20 + slot * 60 + (ti % 2) * 6, Y = 22 + Math.floor(i / 4) * 44;
        const k = ['0', '0', '0', '0']; for (let j = 0; j + 1 < s.length; j += 2) k['hfnb'.indexOf(s[j])] = s[j + 1];
        const n = (i + ti) % 3 === 0 ? c + '_walk' : c + '_idle', fi = (i + ti) % 2, a = look(n, fi, k.join(''));
        blitLook(y, a, X, Y, (i + ti) % 5 === 0, slot, slot && i % 3 === 1 ? [c, slot] : null);
        const lift = liftOf(look(c + '_idle', 0, k.join(''))), tip = Y - lift - 5;
        const arr = cv(5, 3), ax = arr.getContext('2d'); paint(ax, S.tag_arrow[0], 0, 0, 1); ax.globalCompositeOperation = 'source-in'; ax.fillStyle = slot === 1 ? '#ffffff' : SLOT[slot]; ax.fillRect(0, 0, 5, 3);
        y.drawImage(arr, X + 6, tip); y.fillStyle = slot === 1 ? '#ffffff' : SLOT[slot]; y.fillRect(X - 2, tip - 6, 20, 6); y.fillStyle = INK; y.fillRect(X + 1, tip - 4, 14, 2);
      });
      return block(t.name, [o, scaled(o, 3)]);
    });
    sc.forEach((b) => out.appendChild(b));
  }
  // ---------------------------------------------------------------- ?s=ui: the shop's UI icons
  if (SEC === 'ui') {
    const UI = qs('n', 'coin,shop,lock,slot_h,slot_f,slot_n,slot_b,slot_e,ic_e1,ic_e2,ic_e3,ic_e4,ic_e5,ic_e6,trophy,crown').split(',');
    out.appendChild(el('h2', 'ui icons at 6x (coin frames 0 / 1), then 1x-3x on dark, themes and the light card; trophy / crown for contrast'));
    const row = el('div', '', 'row');
    for (const n of UI) row.appendChild(block(n, (S[n] || []).map((f) => rowsCanvas(f, Z, '#10202a'))));
    out.appendChild(row);
    for (const sc of [1, 2, 3]) {
      const st = el('div', '', 'row');
      for (const t of BGS.concat([{ name: 'card', bg: '#fff3d6', bgTile: '#fff3d6' }, { name: 'duck btn', bg: '#ffd447', bgTile: '#ffd447' }])) {
        const list = []; for (const n of UI) (S[n] || []).forEach((f) => list.push(f));
        const o = cv(list.length * 10 + 2, 12, t.bg), y = o.getContext('2d');
        list.forEach((f, i) => paint(y, f, 2 + i * 10, 2, 1));
        st.appendChild(block(t.name + ' ' + sc + 'x', [sc === 1 ? o : scaled(o, sc)]));
      }
      out.appendChild(st);
    }
  }
  // ---------------------------------------------------------------- ?s=gacha: the 뽑기's art (gacha.md §8, GA1 / GA2)
  if (SEC === 'gacha') {
    // the 32x32 view as hubDraw paints it (tub tiles, the floor line on row 31), the machine at (4, 3), the crank at (24, 14)
    const hub = (fi) => { const o = cv(32, 32, '#123236'), y = o.getContext('2d'); y.fillStyle = '#0d2a2d';
      for (let i = 0; i < 32; i += 8) { y.fillRect(i, 0, 1, 31); y.fillRect(0, i, 32, 1); } y.fillStyle = '#3fae9c'; y.fillRect(0, 31, 32, 1);
      if (S.gacha) paint(y, S.gacha[0], 4, 3, 1); if (S.gacha_h) paint(y, S.gacha_h[fi % S.gacha_h.length], 24, 14, 1); return o; };
    out.appendChild(el('h2', 'the machine in the 32x32 view (crank frames 0-3) at ' + Z + 'x and 1x; the crank, capsules whole / top / bottom at ' + Z + 'x'));
    const r1 = el('div', '', 'row');
    [0, 1, 2, 3].forEach((i) => r1.appendChild(block('crank ' + i, [scaled(hub(i), Z), hub(i)])));
    out.appendChild(r1);
    const r2 = el('div', '', 'row');
    for (const n of ['gacha_h', 'cap', 'cap_t', 'cap_b']) r2.appendChild(block(n, (S[n] || []).map((f) => rowsCanvas(f, Z, '#123236'))));
    for (const n of ['ic_e7', 'ic_e8', 'ic_cap', 'fx_duck', 'ic_e6', 'coin']) r2.appendChild(block(n, (S[n] || []).map((f) => rowsCanvas(f, Z, '#10202a'))));
    out.appendChild(r2);
    // the capsules and icons at 1x / 2x on dark, the themes, the light card and the duck button
    const r3 = el('div', '', 'row');
    for (const t of BGS.concat([{ name: 'card', bg: '#fff3d6', bgTile: '#fff3d6' }, { name: 'duck btn', bg: '#ffd447', bgTile: '#ffd447' }])) {
      const list = []; for (const n of ['cap', 'cap_t', 'cap_b', 'ic_e7', 'ic_e8', 'ic_cap']) (S[n] || []).forEach((f) => list.push(f));
      const o = cv(list.length * 10 + 2, 12, t.bg), y = o.getContext('2d'); list.forEach((f, i) => paint(y, f, 2 + i * 10, 2, 1));
      r3.appendChild(block(t.name, [o, scaled(o, 2)]));
    }
    out.appendChild(r3);
    // e7's ducklings behind every animal's heel (facing right: the heel is x + 2; 7 px apart), on the floor of each theme,
    // with P1's yellow ground marker (L: 14 columns from cx - 7) under the animal - the duckling stays outside it; frame
    // 0 / 1 alternate; the last row faces left
    out.appendChild(el('h3', 'fx_duck behind each animal with P1 yellow ground marker, on dark and the 5 themes (3x)'));
    const MK = ['...########...', '.##cccccccc##.', '#cccccccccccc#', '.##cccccccc##.', '...########...'];
    const r4 = el('div', '', 'row');
    for (const t of BGS) {
      const W = ALL.length * 40 + 8, o = floorScene(t, W, 64), y = o.getContext('2d');
      for (const [row, left] of [[0, false], [1, true]]) ALL.forEach((c, i) => {
        const X = 20 + i * 40, Y = 4 + row * 26, surf = Y + 16;
        if (row === 0) { MK.forEach((r, j) => { for (let q = 0; q < r.length; q++) if (r[q] !== '.') { y.fillStyle = r[q] === '#' ? '#1c1530' : '#ffd447'; y.fillRect(X + 1 + q, surf - 3 + j, 1, 1); } }); }
        paint(y, S[c + '_idle'][0], X, Y, 1, left);
        const d = S.fx_duck || []; if (!d.length) return;
        [1, 2].forEach((k) => paint(y, d[(k + i) % d.length], left ? X + 16 + (k - 1) * 7 : X - 5 - (k - 1) * 7, surf - 4, 1, left));
      });
      r4.appendChild(block(t.name, [scaled(o, 3)]));
    }
    out.appendChild(r4);
  }
  console.log('SHEET READY ' + SEC);
})();
<` + `/script></body></html>`;
}
function writeSheet(code) {
  const T = 'C:/Temp/bogeul'; fs.mkdirSync(T, { recursive: true });
  fs.writeFileSync(path.join(T, 'shop-art.html'), sheetHtml(code));
  return T + '/shop-art.html';
}

module.exports = { anchorsOf, itemPart, composeLook, liftOf, composePortrait, load, CHARS, MOVE, anchoredNames, TUBES, atW, ITEM_IDS, lkOf, draft, writeSheet };

if (require.main === module) {
  const { code, PG } = load();
  printDraft(PG);
  console.log('wrote ' + writeSheet(code));
}
