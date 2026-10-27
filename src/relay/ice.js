// window.PG_RELAY: fresh TURN servers for the deploy page's online rooms, from the relay Worker (cloudflare/,
// CLOUDFLARE-SETUP.md). build.js inlines this file into deploy/index.html (PR previews and the itch zip too) ONLY when
// the build has a relay URL (PG_RELAY_URL or relay.config.json), with the URL put in at the very end; the artifact page
// never has it, and a deploy without a relay URL is what it was before. game.js (peerOpts) asks it right before a
// 'peer' room is hosted or joined, and warms it when 친구와 하기 opens on the 'peer' transport - never for solo play:
//   peerOptions(base) -> Promise<{...base, config: {...base.config, iceServers}}>  never rejects, 3 s at most
//   warm()            -> starts the request early, nothing else
//   ice()             -> Promise<{iceServers, source: 'relay' | 'cache' | 'static' | 'stun'}>
//   info()            -> {url, source, cachedUntil} (no credentials: tools/ice-check.js, tests)
// The list: GET <url>/turn -> {iceServers, ttl} (Cloudflare Realtime TURN, minted per request), checked entry by entry
// as the Worker does (stun: / turn: / turns: URLs only, none on port 53, a TURN entry with its username + credential),
// the public STUN servers added; kept in memory only (never stored) until 10 minutes before its ttl ends. No answer
// in 3 s, a failed answer or one without a TURN server: the build's static list (window.PG_PEER_OPTIONS from
// turn.config.json) when it has one, else STUN only - nothing extra is shown to the player (a room that then fails
// says so as before); the relay is asked again on an attempt 30 s or more later.
(function (W, BASE) {
  'use strict';
  if (!W || typeof BASE !== 'string' || !/^https?:\/\//.test(BASE) || W.PG_RELAY) return;
  const STUN = ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'];
  const WAIT_MS = 3000, EARLY_MS = 10 * 60 * 1000, AGAIN_MS = 30 * 1000;
  const ICE_URL = /^(stun|turns?):(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]+)(?::(\d{1,5}))?(?:\?transport=(?:udp|tcp))?$/;
  const urlOk = (u) => { const m = typeof u === 'string' && u.length <= 200 ? ICE_URL.exec(u) : null; return !!m && m[3] !== '53'; };
  const isTurn = (e) => e.urls.some((u) => /^turns?:/.test(u));
  function clean(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const x of list.slice(0, 12)) {
      if (!x || typeof x !== 'object') continue;
      const urls = (typeof x.urls === 'string' ? [x.urls] : Array.isArray(x.urls) ? x.urls : []).slice(0, 8).filter(urlOk);
      if (!urls.length) continue;
      const e = { urls };
      let bad = false;
      for (const k of ['username', 'credential']) {
        if (x[k] === undefined) continue;
        if (typeof x[k] !== 'string' || !x[k] || x[k].length > 512) bad = true; else e[k] = x[k];
      }
      if (!bad && !(isTurn(e) && !(e.username && e.credential))) out.push(e);
    }
    return out;
  }
  const copy = (list) => JSON.parse(JSON.stringify(list));
  const withStun = (list) => list.concat(STUN.filter((u) => !list.some((e) => e.urls.includes(u))).map((u) => ({ urls: u })));
  const now = () => Date.now();
  let cache = null, inflight = null, failedAt = -Infinity, last = '';
  const fresh = () => !!cache && now() < cache.until;

  // one request at a time; resolves with the checked list or null - never rejects
  function ask() {
    if (inflight) return inflight;
    const t0 = now();
    const p = new Promise((resolve) => {
      let ctl = null, over = false, timer = 0;
      try { ctl = typeof AbortController === 'function' ? new AbortController() : null; } catch (e) { ctl = null; }
      const end = (list, ttl) => {
        if (over) return;
        over = true; clearTimeout(timer);
        if (list) { const ms = ttl * 1000; cache = { list, until: t0 + Math.max(ms - EARLY_MS, ms / 2) }; } else failedAt = now();
        resolve(list);
      };
      timer = setTimeout(() => { try { if (ctl) ctl.abort(); } catch (e) { /* ignore */ } end(null); }, WAIT_MS);
      let req;
      try { req = W.fetch(BASE + '/turn', { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: ctl ? ctl.signal : undefined }); } catch (e) { end(null); return; }
      Promise.resolve(req).then((r) => (r && r.ok ? r.json() : null)).then((b) => {
        let list = [];
        try { list = clean(b && b.iceServers); } catch (e) { list = []; }
        const ttl = b && typeof b.ttl === 'number' && isFinite(b.ttl) ? Math.min(Math.max(b.ttl, 60), 172800) : 3600;
        end(list.some(isTurn) ? list : null, ttl);
      }, () => end(null));
    });
    inflight = p;
    p.then(() => { if (inflight === p) inflight = null; });
    return p;
  }
  function fallback() {
    let po = null; try { po = W.PG_PEER_OPTIONS; } catch (e) { po = null; }
    let st = [];
    try { st = po && po.config && Array.isArray(po.config.iceServers) ? clean(po.config.iceServers) : []; } catch (e) { st = []; }
    return st.length ? { iceServers: st, source: 'static' } : { iceServers: STUN.map((u) => ({ urls: u })), source: 'stun' };
  }
  async function ice() {
    let list = fresh() ? cache.list : null, source = 'cache';
    if (!list && (inflight || now() - failedAt >= AGAIN_MS)) { list = await ask(); source = 'relay'; }
    const r = list ? { iceServers: withStun(list), source } : fallback();
    last = r.source;
    return { iceServers: copy(r.iceServers), source: r.source };
  }
  async function peerOptions(base) {
    const r = await ice();
    const po = Object.assign({}, base && typeof base === 'object' ? base : null);
    po.config = Object.assign({}, po.config && typeof po.config === 'object' ? po.config : null, { iceServers: r.iceServers });
    return po;
  }
  function warm() { if (!fresh() && !inflight && now() - failedAt >= AGAIN_MS) ask(); }
  function info() { return { url: BASE, source: last, cachedUntil: cache ? cache.until : 0 }; }
  W.PG_RELAY = Object.freeze({ url: BASE, peerOptions, warm, ice, info });
})(window, '__PG_RELAY_URL__');
