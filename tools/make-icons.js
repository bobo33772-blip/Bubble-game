// Draws the standalone deploy's app icons from the game's own pixel art (PG.SPRITES / PG.PALETTE in src/sprites.js):
// the rubber duck (portrait_duck) floating in a soap bubble (giant_bubble) over bath water, on the bathhouse's dark
// teal tiles. Every art pixel becomes an exact integer block (nearest neighbour, no smoothing), so the PNGs stay crisp.
// Writes src/pwa/icons/ (committed; build.js only copies them into deploy/icons/):
//   icon-192.png, icon-512.png    purpose "any": a rounded tile with the bubble filling ~85% (desktop / old launchers)
//   icon-maskable-512.png         purpose "maskable": full bleed, the bubble inside the 80% safe circle (Android masks it)
//   apple-touch-icon-180.png      iOS home screen: full bleed square (iOS rounds the corners itself; no transparency)
// Usage: node bogeul/tools/make-icons.js [previewPng]   (no browser needed: sprites.js runs in a node vm, a tiny PNG
//   encoder writes the files - same bytes on every run, so the deploy's build hash only changes when the art does)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'pwa', 'icons');
const win = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src', 'sprites.js'), 'utf8'), { window: win, console });
const SPR = win.PG.SPRITES, PAL = win.PG.PALETTE;
for (const n of ['giant_bubble', 'portrait_duck']) if (!SPR[n] || !SPR[n][0]) throw new Error('sprites.js has no ' + n);

const hex = (h) => { const v = parseInt(h.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255, 255]; };
const C = {
  wall: hex('#0f3238'), grout: hex('#0a2327'), tileHi: hex('#174248'),   // the page's --bg tiles, a shade lighter
  water: hex(PAL.D), waterDeep: hex(PAL.J), crest: hex(PAL.c), foam: hex(PAL.w),
  film: hex('#2c6f78'), filmHi: hex('#3d8791'),                           // the bubble's inside: a pale film over the wall
};

// ---- the 40x40 art: bubble film, the duck clipped to the bubble's inside, the rim / sheen / glints on top
function art() {
  const N = 40, g = Array.from({ length: N }, () => new Array(N).fill(null));
  const bub = SPR.giant_bubble[0], duck = SPR.portrait_duck[0];
  const inside = (x, y) => Math.hypot(x - 19.5, y - 19.5) < 17.4;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inside(x, y)) g[y][x] = (x + y) % 9 === 0 && x < 20 && y < 20 ? C.filmHi : C.film;
  const ox = 4, oy = 6;
  duck.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const ch = row[x], X = x + ox, Y = y + oy; if (ch !== '.' && X < N && Y < N && inside(X, Y)) g[Y][X] = hex(PAL[ch]); } });
  bub.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') g[y][x] = hex(PAL[row[x]]); });
  return g;
}

// ---- background in art pixels (ax, ay relative to the bubble's top-left; any range): tiles above, bath water below
function bg(ax, ay) {
  const wl = 30;                                                          // the water line, art y
  if (ay >= wl) {
    const crest = ay === wl && ((ax % 6) + 6) % 6 < 4;
    if (crest) return C.crest;
    if (ay === wl + 1 && ((ax % 6) + 6) % 6 === 4) return C.foam;
    return ay > wl + 5 && ((ax + ay) & 1) ? C.waterDeep : C.water;
  }
  const tx = ((ax + 2) % 7 + 7) % 7, ty = ((ay + 3) % 7 + 7) % 7;
  if (tx === 0 || ty === 0) return C.grout;
  if (tx === 1 && ty < 4) return C.tileHi;
  return C.wall;
}

// ---- one icon: size px, scale px per art px, rounded = corner radius in px (0: full bleed)
function render(size, scale, rounded) {
  const a = art(), px = Buffer.alloc(size * size * 4);
  const off = Math.floor((size - 40 * scale) / 2);
  const r = rounded || 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const ax = Math.floor((x - off) / scale), ay = Math.floor((y - off) / scale);
    let c = ax >= 0 && ay >= 0 && ax < 40 && ay < 40 && a[ay][ax] ? a[ay][ax] : bg(ax, ay);
    if (r) {
      // pixel-stepped rounded corners (measured on the art grid, so the edge stays blocky like the art)
      const step = (v) => Math.floor(v / scale) * scale + scale / 2;
      const cx = x < r ? r : x >= size - r ? size - r : null, cy = y < r ? r : y >= size - r ? size - r : null;
      if (cx !== null && cy !== null && Math.hypot(step(x) - cx, step(y) - cy) > r) c = [0, 0, 0, 0];
    }
    px.set(c, (y * size + x) * 4);
  }
  return png(size, size, px);
}

// ---- minimal PNG writer (RGBA 8-bit, filter 0, zlib) with CRC32
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii'), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// size, art scale, corner radius: the bubble is 40 art px (any: 160 of 192 / 440 of 512; maskable: 360 of 512, inside
// the 409.6 px safe circle; apple: 160 of 180)
const ICONS = [
  ['icon-192.png', 192, 4, 34],
  ['icon-512.png', 512, 11, 90],
  ['icon-maskable-512.png', 512, 9, 0],
  ['apple-touch-icon-180.png', 180, 4, 0],
];
fs.mkdirSync(OUT, { recursive: true });
const made = ICONS.map(([name, size, scale, r]) => { const buf = render(size, scale, r); fs.writeFileSync(path.join(OUT, name), buf); return [name, size, buf]; });
for (const [name, size, buf] of made) console.log(`wrote src/pwa/icons/${name} (${size}x${size}, ${buf.length} bytes)`);

// optional preview sheet: every icon side by side on a light and a dark strip (+ the maskable's safe circle)
const prev = process.argv[2];
if (prev) {
  const W = 192 + 512 + 512 + 180 + 5 * 16, H = 512 * 2 + 3 * 16, sheet = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) sheet.set(y < H / 2 ? [240, 240, 236, 255] : [30, 30, 34, 255], (y * W + x) * 4);
  let x0 = 16;
  for (const [name, size] of made) {
    const one = renderRaw(name, size);
    for (const top of [16, 512 + 32]) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4, a = one[i + 3] / 255, o = ((top + y) * W + x0 + x) * 4;
      for (let k = 0; k < 3; k++) sheet[o + k] = Math.round(one[i + k] * a + sheet[o + k] * (1 - a));
      if (name.includes('maskable') && Math.abs(Math.hypot(x - 256, y - 256) - 204.8) < 1) sheet.set([255, 0, 80, 255], o);
    }
    x0 += size + 16;
  }
  fs.writeFileSync(prev, png(W, H, sheet));
  console.log('preview: ' + prev);
}
function renderRaw(name, size) {
  const [, , scale, r] = ICONS.find((i) => i[0] === name);
  const raw = zlib.inflateSync(Buffer.concat(chunksOf(render(size, scale, r), 'IDAT')));
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) raw.copy(out, y * size * 4, y * (size * 4 + 1) + 1, (y + 1) * (size * 4 + 1));
  return out;
}
function chunksOf(buf, type) {
  const out = []; let p = 8;
  while (p < buf.length) { const len = buf.readUInt32BE(p), t = buf.toString('ascii', p + 4, p + 8); if (t === type) out.push(buf.subarray(p + 8, p + 8 + len)); p += 12 + len; }
  return out;
}
