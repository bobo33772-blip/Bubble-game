// 뽀득뽀득 목욕탕 - the service worker of the STANDALONE deploy build (template: build.js fills in the three values
// below and writes deploy/sw.js). It never exists in the Claude artifact: dist/ppogeul-bath.html has no manifest and
// registers nothing; the deploy page registers this only over http(s), only when it is not framed (itch.io).
//   install   precache the app shell (the page, the manifest, the icons) in a cache named after this build and this
//             scope. The fetched page must carry this build's <meta name="pg-build"> - a CDN edge that still serves
//             the previous page fails the install instead of pinning old bytes under the new name (the old worker
//             stays; the browser tries again on a later visit). skipWaiting: the page is one self-contained file, so an
//             open page under a newer worker loses nothing (no lazy chunks), and nothing ever reloads it mid-game
//   activate  delete this scope's older shell caches and the cdn entries no build lists any more; clients.claim
//   fetch     only the requests below get an answer from here; everything else is left alone (the browser fetches it
//             as if there were no worker), so nothing else is ever cached:
//             - navigations to the app (the scope root or index.html, any query such as ?join=AB12): network first
//               (a new deploy shows up on the next online start); no answer within NAV_TIMEOUT_MS, offline, or a 5xx ->
//               the precached page. Offline solo play works; online play needs the network anyway
//             - the precached manifest / icons: cache first (they belong to this build)
//             - Google Fonts: the stylesheet stale-while-revalidate, the font files cache first (their URLs never
//               change content), so an offline start keeps the game's lettering
//             - the exact SRI-pinned CDN scripts build.js lists (PeerJS): cache first. Only a response that passed the
//               integrity check of this worker's own fetch is stored, and the page checks the integrity again on use
//   never     Firebase / Google sign-in / Firestore / any other host, any non-GET, Firebase Hosting's reserved /__/
//             paths: not intercepted, not cached
'use strict';
// filled in by build.js: the build hash (also in index.html's <meta name="pg-build">), the app shell (scope-relative;
// './' is the page itself) and the exact CDN script URLs the page loads with an integrity hash
const BUILD = '__PG_BUILD__';
const SHELL = __PG_SHELL__;
const CDN = __PG_CDN__;
const NAV_TIMEOUT_MS = 3500;
const FONT_MAX = 240;                            // font slices kept (Korean faces come in ~100 slices per family)
const SCOPE = self.registration.scope;
const ROOT = new URL('./', SCOPE).href;
const SHELL_URLS = SHELL.map((p) => new URL(p, SCOPE).href);
const PRE = 'ppodeuk-shell@' + SCOPE + '@';      // (cache names are per origin: two copies on one origin keep apart)
const SHELL_CACHE = PRE + BUILD;
const FONTS = 'ppodeuk-fonts-v1', CDN_CACHE = 'ppodeuk-cdn-v1';

const wait = (ms) => new Promise((r) => setTimeout(() => r(null), ms));
// a redirected response cannot answer a navigation in every browser: keep a plain copy of it
async function plain(res) {
  return res.redirected ? new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers }) : res;
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try {
      for (const url of SHELL_URLS) {
        const res = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }));
        if (!res.ok) throw new Error('precache ' + url + ': ' + res.status);
        if (url === ROOT && (await res.clone().text()).indexOf('<meta name="pg-build" content="' + BUILD + '">') < 0) throw new Error('precache: the page is not build ' + BUILD);
        await cache.put(url, await plain(res));
      }
    } catch (err) {
      await caches.delete(SHELL_CACHE);
      throw err;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PRE) && k !== SHELL_CACHE) await caches.delete(k);
    try {
      const c = await caches.open(CDN_CACHE);
      for (const r of await c.keys()) if (!CDN.includes(r.url)) await c.delete(r);
    } catch (err) { /* ignore */ }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin === self.location.origin) {
    if (url.pathname.indexOf('/__/') >= 0) return;               // Firebase Hosting: /__/auth/handler, /__/firebase/...
    const bare = url.origin + url.pathname;
    if (req.mode === 'navigate') { if (bare === ROOT || bare === ROOT + 'index.html') e.respondWith(page(req)); return; }
    if (!url.search && SHELL_URLS.includes(bare) && bare !== ROOT) e.respondWith(shell(req, bare));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' && url.pathname.startsWith('/css')) { e.respondWith(stale(e, FONTS)); return; }
  if (url.hostname === 'fonts.gstatic.com') { e.respondWith(first(req, FONTS, FONT_MAX)); return; }
  if (req.integrity && CDN.includes(req.url)) e.respondWith(first(req, CDN_CACHE, 0));
});

// the page: network first, the precached copy when the network is slow, gone or broken
async function page(req) {
  const net = fetch(req);
  net.catch(() => { /* (handled below; a late failure after the timeout is not an error) */ });
  let res = null;
  try { res = await Promise.race([net, wait(NAV_TIMEOUT_MS)]); } catch (err) { res = null; }
  if (res && res.status < 500) return res;
  const hit = await caches.match(ROOT, { cacheName: SHELL_CACHE });
  return hit || res || net;
}
async function shell(req, url) {
  const hit = await caches.match(url, { cacheName: SHELL_CACHE });
  return hit || fetch(req);
}
async function first(req, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);                                   // (rejects on an integrity mismatch: nothing stored)
  if (res.ok && res.type === 'cors') {
    await cache.put(req, res.clone());
    if (max) { const keys = await cache.keys(); for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]); }
  }
  return res;
}
// stale-while-revalidate (the fonts stylesheet: a no-cors, opaque response - kept as it is)
async function stale(e, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(e.request);
  const net = fetch(e.request).then(async (res) => {
    if (res.ok || res.type === 'opaque') await cache.put(e.request, res.clone());
    return res;
  });
  if (hit) { e.waitUntil(net.catch(() => null)); return hit; }
  return net;
}
