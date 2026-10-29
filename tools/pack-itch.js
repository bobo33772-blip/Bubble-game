// Packs the standalone deploy for itch.io: deploy/ppodeuk-bath-itch.zip with index.html at the zip root and everything
// else deploy/ needs beside it (manifest.webmanifest, sw.js, icons/ - and whatever a later build adds there), so the
// upload runs as is ("This file will be played in the browser"). Run `node bogeul/build.js` first.
// Usage: node bogeul/tools/pack-itch.js [out.zip]     (as a module: require('./pack-itch').pack(out) -> its entries)
// On itch the game runs in an iframe: the page registers no service worker there and shows no install pill (the
// browser would install itch, not the game); the manifest and icons only keep the page's links from failing.
// Cloud trophies (a deploy built with firebase.config.json): itch.io serves EVERY game from one origin, so a Google
// session stored there would be readable by any other itch game - the zip's page never signs in (itchPage): with
// `home` its PG_CLOUD is marked away (내 기록 offers 새 창에서 열기 to the game's own address, nothing loads), without
// `home` it has no PG_CLOUD at all (no login UI on itch; trophies stay in that browser as on a deploy without a config).
// The online relay (a deploy built with PG_RELAY_URL, design/relay.md 10.1): the zip's page has no window.PG_RELAY - the
// relay lets no itch.io page in (one origin serves every itch game), so the itch build plays online over PeerJS only.
// Every other file is deploy/'s, byte for byte.
// A tiny dependency-free zip writer: one local header + data per file, the central directory, the end record; each
// entry deflated (raw, zlib) when that is smaller, else stored; CRC-32; UTF-8 names; times from the files. The
// result is read back and checked (every entry inflates to its file with the right CRC) before it is kept.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DEP = path.join(__dirname, '..', 'deploy');
const OUT = path.resolve(process.argv[2] || path.join(DEP, 'ppodeuk-bath-itch.zip'));

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
// MS-DOS date / time (local time, 2 s steps, 1980..2107)
function dos(d) {
  const y = Math.min(2107, Math.max(1980, d.getFullYear()));
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

// every file under deploy/ but zips and dotfiles; index.html first, then by path
function list(dir, base = '') {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) out = out.concat(list(path.join(dir, e.name), rel));
    else if (e.isFile() && !/\.zip$/i.test(e.name)) out.push(rel);
  }
  return out;
}

function zip(entries) {
  const parts = [], central = [];
  let off = 0;
  for (const { name, data, mtime } of entries) {
    const nm = Buffer.from(name, 'utf8'), crc = crc32(data), def = zlib.deflateRawSync(data, { level: 9 });
    const method = def.length < data.length ? 8 : 0, body = method ? def : data, t = dos(mtime);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6); loc.writeUInt16LE(method, 8);
    loc.writeUInt16LE(t.time, 10); loc.writeUInt16LE(t.date, 12); loc.writeUInt32LE(crc, 14);
    loc.writeUInt32LE(body.length, 18); loc.writeUInt32LE(data.length, 22); loc.writeUInt16LE(nm.length, 26); loc.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(t.time, 12); cen.writeUInt16LE(t.date, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nm.length, 28); cen.writeUInt16LE(0, 30); cen.writeUInt16LE(0, 32); cen.writeUInt16LE(0, 34); cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38); cen.writeUInt32LE(off, 42);
    parts.push(loc, nm, body); central.push(cen, nm);
    off += loc.length + nm.length + body.length;
    if (off > 0xffffffff) throw new Error('too big for a zip without zip64');
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, cd, end]);
}

// read it back through the central directory: names, sizes, CRCs, contents
// a zip of this writer's kind, read through its central directory -> [{ name, data }] (sizes and CRCs checked)
function unzip(buf) {
  const e = buf.length - 22;
  if (e < 0 || buf.readUInt32LE(e) !== 0x06054b50) throw new Error('no end record');
  const n = buf.readUInt16LE(e + 10), out = [];
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central header ' + i);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csz = buf.readUInt32LE(p + 20), usz = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    if (buf.readUInt32LE(lo) !== 0x04034b50) throw new Error('bad local header ' + name);
    const ds = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), raw = buf.subarray(ds, ds + csz);
    const data = method === 8 ? zlib.inflateRawSync(raw) : method === 0 ? Buffer.from(raw) : null;
    if (!data || data.length !== usz || crc32(data) !== crc) throw new Error('bad entry ' + name);
    out.push({ name, data });
    p += 46 + nl + xl + cl;
  }
  return out;
}
// the written zip holds exactly these entries, in order, byte for byte
function verify(buf, entries) {
  const got = unzip(buf);
  if (got.length !== entries.length) throw new Error(`${got.length} entries, expected ${entries.length}`);
  got.forEach((g, i) => { if (g.name !== entries[i].name || !g.data.equals(entries[i].data)) throw new Error('entry mismatch: ' + g.name); });
}

// the deploy page as the itch zip carries it (see the header): build.js writes PG_CLOUD as
// <script>window.PG_CLOUD=Object.freeze({...});(function(c){...})(window.PG_CLOUD);</script>
const CLOUD_TAG = /<script>window\.PG_CLOUD=Object\.freeze\((\{[\s\S]*?\})\);(\(function\(c\)\{[^<]*)<\/script>\n?/;
// build.js's relay line (relayTag): <script id="pg-relay">window.PG_RELAY={url:"..."};</script>
const RELAY_TAG = /<script id="pg-relay">[^<]*<\/script>\n?/g;
function itchPage(html) {
  html = String(html);
  const relays = (html.match(/<script id="pg-relay">/g) || []).length;
  html = html.replace(RELAY_TAG, '');
  if (relays > 1 || /pg-relay|PG_RELAY\s*=/.test(html)) throw new Error('the itch page: the relay tag could not be stripped');
  const m = html.match(CLOUD_TAG);
  if (!m) return html;
  const c = JSON.parse(m[1]);
  if (!c || typeof c !== 'object' || typeof c.home !== 'string' || !/^https:\/\//.test(c.home)) return html.replace(m[0], () => '');
  c.away = 1;
  return html.replace(m[0], () => `<script>window.PG_CLOUD=Object.freeze(${JSON.stringify(c).replace(/</g, '\\u003c')});${m[2]}</script>\n`);
}

function pack(out) {
  const files = list(DEP).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a < b ? -1 : a > b ? 1 : 0));
  if (files[0] !== 'index.html') throw new Error('deploy/index.html is missing - run node bogeul/build.js first');
  const entries = files.map((name) => {
    const f = path.join(DEP, ...name.split('/'));
    const data = name === 'index.html' ? Buffer.from(itchPage(fs.readFileSync(f, 'utf8')), 'utf8') : fs.readFileSync(f);
    return { name, data, mtime: fs.statSync(f).mtime };
  });
  if (/window\.PG_CLOUD=/.test(entries[0].data.toString('utf8')) && !/"away":1/.test(entries[0].data.toString('utf8'))) throw new Error('the itch page must never sign in (PG_CLOUD without away)');
  if (/pg-relay|PG_RELAY\s*=/.test(entries[0].data.toString('utf8'))) throw new Error('the itch page must not carry the relay');
  const buf = zip(entries);
  verify(buf, entries);
  fs.writeFileSync(out, buf);
  return { size: buf.length, entries: entries.map((x) => ({ name: x.name, size: x.data.length })) };
}
module.exports = { pack, zip, unzip, verify, itchPage };

if (require.main === module) {
  const r = pack(OUT), kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log(`wrote ${path.relative(path.join(__dirname, '..'), OUT).replace(/\\/g, '/')} (${kb(r.size)}): ` + r.entries.map((x) => `${x.name} ${kb(x.size)}`).join(', '));
}
