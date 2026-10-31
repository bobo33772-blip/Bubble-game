// The 앱인토스 (Apps in Toss) build's rules, shared by build.js (the Toss page and its engine files) and
// tools/check-toss.js (the built bundle and the .ait): what must never ship, and the hosts the bundle may name
// (design/toss.md 13). A hit in a third-party file is never patched here: pick another version, drop the dependency or
// ask Toss (13, last bullet) - an allowlist entry is added by hand, with a comment, after someone has looked at it.
// [name, pattern] - checked over every .html / .js / .css of the bundle, comments included (the scanner reportedly
// flags comments too), and over the engine files the Toss page loads
const BANNED = [
  ['eval(', /\beval\s*\(/],
  ['new Function(', /\bnew\s+Function\s*\(/],
  ['Function("...")', /(?<![\w$.])Function\s*\(\s*["'`]/],
  ['a string timer', /\bset(?:Timeout|Interval)\s*\(\s*["'`]/],
  ['document.write(', /document\.write\s*\(/],
  ['location.replace(', /location\.replace\s*\(/],
  ['intent://', /\bintent:\/\//],
  ['kakaotalk://', /kakaotalk:\/\//],
  ['beforeinstallprompt', /beforeinstallprompt/],
  ['serviceWorker.register', /serviceWorker\s*\.\s*register/],
  ['firebase', /firebase/i],
  ['the Google sign-in', /GoogleAuthProvider|signInWith(?:Popup|Redirect)/],
  ['Google Fonts', /fonts\.(?:googleapis|gstatic)\.com/],
  ['a script CDN', /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|esm\.sh/],
  ['PG_CLOUD / PG_PREVIEW', /PG_CLOUD\s*=|PG_PREVIEW\s*=/],
];
// ... and in the .html files
const BANNED_HTML = [
  ['<iframe', /<iframe/i],
  ['a manifest link', /<link\b[^>]*\brel=["']?manifest/i],
];
// every host the bundle may name (https? / wss? URLs and stun: / turn: / turns: entries). Each one was looked at. The
// relay Worker's host is not listed: check-toss allows the one the page's own relay line names (build.js wrote it)
const HOSTS = {
  '0.peerjs.com': 'PeerJS signalling (its cloud PeerServer, wss on 443): the fallback rooms behind the relay',
  'stun.l.google.com': 'PeerJS\'s own default ICE list (the Toss page sets no PG_PEER_OPTIONS)',
  'localhost': 'net.js\'s header comment (how to serve the bc test pages)',
  'peerjs.com': 'PeerJS\'s embedded package.json (homepage) - an inert string',
  'github.com': 'PeerJS\'s embedded package.json (repository / funding) - an inert string',
  'opencollective.com': 'PeerJS\'s embedded package.json (funding) - an inert string',
  'eu-0.turn.peerjs.com': 'PeerJS\'s default ICE list (the Toss page sets no PG_PEER_OPTIONS)',
  'us-0.turn.peerjs.com': 'PeerJS\'s default ICE list (the Toss page sets no PG_PEER_OPTIONS)',
};
// every host named in a text: http(s) / ws(s) URLs and ICE entries
function hostsIn(text) {
  const out = new Set();
  for (const m of text.matchAll(/\b(?:https?|wss?):\/\/([a-z0-9.-]+)/gi)) out.add(m[1].toLowerCase().replace(/\.$/, ''));
  for (const m of text.matchAll(/\b(?:stun|turns?):(?!\/\/)([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) out.add(m[1].toLowerCase());
  return out;
}
// the hits of BANNED (+ BANNED_HTML for html) in a text: [{name, at, around}]
function scan(text, html) {
  const hits = [];
  for (const [name, re] of BANNED.concat(html ? BANNED_HTML : [])) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const m of text.matchAll(g)) hits.push({ name, at: m.index, around: text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, ' ') });
  }
  return hits;
}
// the cut regions of the Toss copy of game.js (design/toss.md 2.2): '// <ait-cut>' ... '// </ait-cut>', each marker a line
// of its own, removed both inclusive; nested or unbalanced markers are an error. -> {code, n}
const CUT_OPEN = '// <ait-cut>', CUT_CLOSE = '// </ait-cut>';
function aitCut(code, name) {
  const lines = code.split('\n'), out = [];
  let inside = false, n = 0;
  lines.forEach((l, i) => {
    const t = l.trim();
    if (t === CUT_OPEN) { if (inside) throw new Error(`${name}:${i + 1}: <ait-cut> inside another one (nesting is not allowed)`); inside = true; n++; return; }
    if (t === CUT_CLOSE) { if (!inside) throw new Error(`${name}:${i + 1}: </ait-cut> without its <ait-cut>`); inside = false; return; }
    if (/<\/?ait-cut>/.test(l)) throw new Error(`${name}:${i + 1}: an ait-cut marker must be a line of its own`);
    if (!inside) out.push(l);
  });
  if (inside) throw new Error(`${name}: <ait-cut> without its </ait-cut>`);
  return { code: out.join('\n'), n };
}
// the regions game.js has today (2.2: clOutsideUrl, clOpenOutside, clProvider, clSignInGo, clRedirect, pwaInit)
const CUTS = 6;
module.exports = { BANNED, BANNED_HTML, HOSTS, hostsIn, scan, aitCut, CUTS, CUT_OPEN, CUT_CLOSE };
