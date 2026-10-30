// Tiny static HTTP server for the test pages in C:/Temp/bogeul. Multi-instance tests need a real http origin:
// file:// documents cannot share a BroadcastChannel or reach into each other's iframes.
// Usage: node bogeul/tools/serve.js [port=8765] [root=C:/Temp/bogeul]
//   then e.g.  node bogeul/tools/run-chrome.js http://localhost:8765/test-net-bc.html - 900 760 30000
// Loopback only (127.0.0.1 and ::1), GET/HEAD, no directory listing, no caching. Ctrl+C to stop.
// It also runs the LOCAL RELAY for the 'ws' tests (tools/ws-relay.js, design/relay.md 11.3): WebSocket upgrades under
// /ws (ws://localhost:<port>/ws/r/<space>/<code> - the real room logic of cloudflare/src/) and its /ws-admin/ routes.
// As a module: const srv = require('./serve').start(8765, 'C:/Temp/bogeul'); ... srv.close();   ({relay: false}: no relay)
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.zip': 'application/zip',
};

function start(port = 8765, root = require('./env').T, opts = {}) {
  const base = path.resolve(root);
  const log = opts.quiet ? () => {} : (m) => console.log(m);
  const relay = opts.relay === false ? null : require('./ws-relay').create({ base: '/ws' });
  const handler = (req, res) => {
    if (relay && relay.admin(req, res)) return;
    const plain = (code, text) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(text); };
    if (req.method !== 'GET' && req.method !== 'HEAD') return plain(405, 'method not allowed');
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch (e) { return plain(400, 'bad request'); }
    if (rel.includes('\0')) return plain(400, 'bad request');
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(base, '.' + rel);
    if (file !== base && !file.startsWith(base + path.sep)) return plain(403, 'forbidden');
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { log(`404 ${rel}`); return plain(404, 'not found'); }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': st.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    });
  };
  const servers = [];
  for (const host of ['127.0.0.1', '::1']) {
    const s = http.createServer(handler);
    if (relay) s.on('upgrade', relay.upgrade);
    s.on('error', (e) => {
      if (host === '::1' && (e.code === 'EADDRNOTAVAIL' || e.code === 'EAFNOSUPPORT')) return;   // no IPv6 loopback: fine
      console.error(`serve: cannot listen on ${host}:${port} (${e.code || e.message})`);
      process.exitCode = 1;
    });
    s.listen(port, host);
    servers.push(s);
  }
  return { url: `http://localhost:${port}/`, root: base, relay, close() { if (relay) relay.close(); for (const s of servers) { try { s.close(); } catch (e) { /* ignore */ } } } };
}

if (require.main === module) {
  const [port = '8765', root = require('./env').T] = process.argv.slice(2);
  const srv = start(parseInt(port, 10) || 8765, root);
  console.log(`serving ${srv.root} at ${srv.url} (Ctrl+C to stop)`);
}
module.exports = { start };
