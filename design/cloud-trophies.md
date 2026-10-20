# 뽀득뽀득 목욕탕: cloud trophies (구글 로그인으로 트로피 저장) — implementation spec

Status: IMPLEMENTED (2026-10-16). Section 16 lists where the code differs from the text below and why; read it first.
It builds on the v4 trophies (`design/trophies.md`) and on the STANDALONE deploy build with its app install pass
(`build.js`, `src/pwa/sw.js`, the game.js section "v4 app install + fullscreen"). Code is referenced by function name.

The user asked: "트로피가 저장되려면 로그인이 있어야 하나?" and decided: Google login, on the standalone deploy build only,
with Firebase (Auth + Firestore, free Spark plan). Without a Firebase config the deploy build behaves exactly as today
(local storage, no login UI). The Claude artifact (`dist/ppogeul-bath.html`) never gets any of it.

The sync model in section 6 was checked with a simulation of its pure functions against a JS port of the rules
(concurrent devices, a device offline for several matches, the rate cap splitting a big gain, two tabs racing on one
slot, debts, a day change, a fold): no update was lost or counted twice in any case.

---

## 0. Decisions in one table

| Question | Decision |
|---|---|
| Where | The deploy build only, and only when `bogeul/firebase.config.json` exists at build time. The artifact build gets no config, no SDK URL, no login UI (hidden markup, inert code). |
| SDK | Firebase JS SDK **12.19.0** (released 2026-09-09; 13.0.0 is 9 days old and a major), the **compat** builds `firebase-app-compat.js`, `firebase-auth-compat.js`, `firebase-firestore-compat.js` from **cdnjs**, each with an **SRI sha512** computed here (jsDelivr as a fallback, same bytes, same hash). Loaded lazily by injected `<script>` elements. |
| When it loads | Never at boot for a player who never signed in. App + Auth (≈ 50 KB gz) when 내 기록 opens (that is where the button is: Safari only opens a popup straight from the tap, so the SDK must be in memory by then). Firestore (≈ 160 KB gz) only once signed in. At boot only when this browser is linked to an account or returns from a sign-in redirect. |
| Sign-in | "구글로 로그인" (GoogleAuthProvider, `prompt: select_account`, Korean UI). Popup in a browser tab; redirect in an installed app (and as the fallback for a blocked popup) when the page is on its authDomain; popup only inside a frame (itch.io), with "새 창에서 열기" when it fails; in-app browsers (KakaoTalk…) get "다른 브라우저로 열기" (Google refuses sign-in inside them). |
| Firebase Hosting domains | The game is played at `https://<projectId>.firebaseapp.com` (its own authDomain: redirect sign-in works in every browser, no extra Google Cloud setup). A first visit to `<projectId>.web.app` hops there once (an inline script in the deploy head). |
| Data | One doc per account: `players/{uid}`. Per **browser slot** absolute contributions (`s.<slot>` = what that browser added: t, w, g, ko, plus its bests and today's bonus), the account's `dev`, the in-game `nick`. The count is the sum of the slots. |
| Sync | Local store stays the source of truth for play (offline works as today); the store gains a link record `cs`. Pushes write **one slot with absolute values** (idempotent: no transaction, safe to repeat, safe in Firestore's offline queue, safe with two tabs). Adoption via `onSnapshot`: view = others' slots + mine. Debounced 4 s, never during an open hold. |
| What syncs | t, w, g, ko, best, bl, seen, day/de (shared daily cap), the best solo score (`hi`), `dev`, `nick`. Not: holds (`esc`, per tab, already taken out of t), the tab id, the animal, sound settings. |
| First sign-in | Cloud empty: this browser's store is uploaded (moves into the account). Cloud exists: **cloud wins**; this browser's own store is put aside (`ppogeul-guest`) and comes back on sign-out; a one-time message says so when it had more. |
| Sign-out | Last push first; the account's copy is dropped from this browser; the put-aside store (or a fresh one with the gift) becomes active. |
| Same account, two devices | Same `dev` → their trophy battle against each other is 연습 경기 (q 2), which is right. |
| Rules | Owner-only `players/{uid}`; exact shapes and ranges; per write: one slot, n increases, ≥ 2 s per slot and per doc, t rises ≤ 250 and ≤ 20 + 2/s since that slot's last write, ≤ 20 games / 400 KOs; folding an idle (7 d) slot must add up exactly; no queries; owner may delete. |
| Leaderboard | **No** (v1). It does not fit 내 기록 at phone size, it would publish strangers' free-text nicks with no moderation, and it would turn a harmless self-inflated count into a visible one. Section 8 keeps a follow-up design. |
| Privacy | Only the uid (doc id), trophy numbers, the in-game nick, random ids and timestamps. Never the Google name, mail or photo (the code reads `user.uid` only). UI line: **"게임 기록에는 구글 계정 이름·메일을 넣지 않아요"** (see 10 for why not "저장하지 않아요"). |
| Hosting | Recommended: Firebase Hosting (`bogeul/firebase/firebase.json`, deploy from that folder). Also: GitHub Pages (popup only; an installed iPhone app there may not sign in), itch.io (iframe: popup, else 새 창에서 열기). |

---

## 1. Ground truth from the code (what this builds on)

| Thing | Code | Consequence |
|---|---|---|
| Two builds | `build.js` writes `dist/ppogeul-bath.html` (`out`, checked: no external `<script src>`, no manifest / service worker / app metas) and `deploy/index.html` (`deployOf(build)`: head with PeerJS + SRI, `SW_REG`, manifest, the build hash `pg-build`). | The Firebase config, the SDK URLs and their hashes live in **build.js** and go into `deployOf()` only. game.js never contains a CDN URL; it reads `window.PG_CLOUD`, which only the deploy page defines. |
| Trophy store | `troRead` / `troWrite` / `troMut` (read-modify-write of `localStorage[TRO.key]`), `troParse` (clamps every field, drops unknown ones), `troSync()` after every change (and on the `storage` event of another tab). | The cloud link record `cs` must live **inside** the same key (one atomic write holds the view and what it was built from), so `troParse` learns to keep a valid `cs`. Every cloud reaction hangs off `troSync()`. |
| Holds | `S.esc` (≤ 8 holds of this browser's tabs, already subtracted from `S.t`), `troOpenHere()`. | Holds stay local. No push while this tab holds open trophies (the result comes within minutes; a hold pushed and then refunded is a wasted write). Sign-in / sign-out wait until `S.esc` is empty. |
| Device id | `S.dev`, hashed per room by `troDevHash(code)`; `troPractice()` → q 2 when two players share one. | The account carries one `dev`; every linked browser adopts it (not while `NET.sess` is set). |
| Test namespaces | `PG.debug.tro.ns(name)` → `TRO.key = 'ppogeul-trophy-' + name`. | Cloud keys follow the same suffix: `'ppogeul-cloud' + sfx`, `'ppogeul-guest' + sfx` (`sfx = TRO.key.slice(TRO_KEY.length)`); they can never collide with a `ppogeul-trophy-*` name. |
| App section | `PWA` (`on` only when the page has a manifest link), `pwaIsApp()`, `PWA.framed`, `PWA.inApp` (KakaoTalk, NAVER, Instagram, FB, LINE, `; wv)`). | The cloud computes its own environment (`clEnv`, 4.1) with the same tests, because `PWA.*` is only filled when `PWA.on`. Factor the in-app UA regex into one top-level const shared by both. |
| Service worker | `src/pwa/sw.js` answers only same-origin app-shell navigations, the precached files, Google Fonts and the exact SRI-pinned `CDN` list; it never touches `/__/` paths or any other host. | Firebase Hosting's `/__/auth/handler` keeps working inside the installed app. build.js adds the six Firebase SDK URLs to `CDN` when a config exists, so a linked player's next start loads them from the worker's cache. |
| Title / 내 기록 | `#pg-tro` (badge on the `.pg-best` line), `#pg-rec` (card that scrolls; ladder and note step aside at `@container (max-height: 23em / 19.5em)`), `openRec`, `closeRec`, `fillRec`, `onKeyDown` (Enter / Escape / jump / shoot close the card). | The login button joins the existing button row (no height); one status line is added and the ladder makes way for it on short screens. `onKeyDown` must let Enter / Space reach a focused cloud button. |
| Console | Test pages count `console.error` / `console.warn` as failures. | The cloud never logs in normal or expected-failure paths; errors go to `PG.debug.cloud.state()`. |

---

## 2. The SDK

### 2.1 Choice

- **Compat builds** (namespaced `window.firebase`), not the modular ESM build: game.js is a classic script; compat files are
  classic scripts, so each one gets an `integrity` attribute (SRI works for classic scripts everywhere; a dynamic
  `import()` cannot carry one). The compat API is still shipped in 12.x and in 13.0.0 (checked: the three files exist
  in both). Moving to modular is a follow-up for when the game itself becomes a module.
- **12.19.0**: the newest 12.x, 5 weeks old today (2026-10-16). 13.0.0 (2026-10-07) is too new and a major version.
- **cdnjs** first (the project's CDN, like PeerJS), **jsDelivr** as the fallback for a file that fails to load. The
  three cdnjs `.js` files are byte-identical to the npm package files (sha256 equal to jsDelivr's npm listing); the
  sha512 below were computed here from the downloaded files and match the values cdnjs publishes.

| File | Bytes | gzip | URL (primary) |
|---|---|---|---|
| app | 32 037 | 10.3 KB | `https://cdnjs.cloudflare.com/ajax/libs/firebase/12.19.0/firebase-app-compat.js` |
| auth | 140 618 | 40.4 KB | `https://cdnjs.cloudflare.com/ajax/libs/firebase/12.19.0/firebase-auth-compat.js` |
| firestore | 548 084 | 162.6 KB | `https://cdnjs.cloudflare.com/ajax/libs/firebase/12.19.0/firebase-firestore-compat.js` |

Fallbacks: `https://cdn.jsdelivr.net/npm/firebase@12.19.0/<same file name>` (same bytes, same integrity).

```js
// build.js (deploy only)
const FIREBASE_V = '12.19.0';
// [file, sha512] - computed from the downloaded files (cdnjs and jsDelivr serve the npm package's bytes); a changed CDN
// file is refused by the browser instead of running with the player's sign-in
const FIREBASE_SDK = [
  ['firebase-app-compat.js', 'sha512-4vhrvql0JRsm7uZqS5fzHvGi7gVUiqTRe0y/kyhsCYkyB7mEWZZBIkBlzW0+LA6wGFRCsxZhGl1IZNP0b852WA=='],
  ['firebase-auth-compat.js', 'sha512-ahLV4v/pGu9QcmfbZjdmF00a3HVnWcH9tj/werwQldaqKqyya8QPYONrLoRfPT3BwB1YKEQf+B/1EYGeglNZvA=='],
  ['firebase-firestore-compat.js', 'sha512-2rayVeU5Z9oK9tn52ES1cAy5D+fxeLoij13emADsCngw0JDl49VOiyG3JLJqUrRWwMoEHOtMpWJqTfjLLNOePw=='],
];
const fbUrl = (f) => `https://cdnjs.cloudflare.com/ajax/libs/firebase/${FIREBASE_V}/${f}`;
const fbAlt = (f) => `https://cdn.jsdelivr.net/npm/firebase@${FIREBASE_V}/${f}`;
```

(sha384, should one ever be preferred: app `sha384-aUtWR1iCiOCHS8pn1nKNXMZm3I/eDrV63IXWXgE+mHHqJfYTWYV+jGk0sCXz57+U`,
auth `sha384-ZRqyA8Xkw0A6FmVya9A0Werzt9yjKKAp2TCzqVJjHK1O3oyb0z9jMxpkWPVoFtUm`, firestore
`sha384-jxdN9nS+cvQavyzo/bNcMoHfxvk0kWtPAfPDRq3EQ/wvbCVLNheaVIphKWMD4/g0`.)

What the SDK loads by itself (not ours to pin): popup / redirect sign-in loads `https://apis.google.com/js/api.js` and
an iframe from `https://<authDomain>/__/auth/iframe`; the Google account pages; Firestore talks to
`firestore.googleapis.com`. reCAPTCHA (also referenced in auth-compat) is only for phone / MFA sign-in, never used here.

### 2.2 Loader (game.js)

```js
  // one SDK file: an SRI-checked classic script (async = false keeps insertion order); the primary CDN, then the fallback
  function clScript(src, sri) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.integrity = sri; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer'; s.async = false;
      const t = setTimeout(() => { s.onload = s.onerror = null; s.remove(); rej(new Error('timeout')); }, CL_SDK_MS);
      s.onload = () => { clearTimeout(t); res(); };
      s.onerror = () => { clearTimeout(t); s.remove(); rej(new Error('load')); };
      (document.head || document.documentElement).appendChild(s);
    });
  }
  // part 0 app, 1 auth, 2 firestore - each loaded once (a failure is forgotten, so a later try loads again);
  // the mock (tests) stands in for all three
  function clLoad(part) {
    if (CLOUD.mock) { CLOUD.fb = CLOUD.mock; return Promise.resolve(CLOUD.fb); }
    const P = CLOUD.parts;
    for (let i = 0; i <= part; i++) {
      if (P[i]) continue;
      const [src, sri, alt] = CLOUD.sdk[i], prev = i ? P[i - 1] : Promise.resolve();
      P[i] = prev.then(() => clScript(src, sri).catch(() => clScript(alt, sri))).then(() => {
        const fb = window.firebase;                                   // (taken once, right after the app file ran)
        if (!fb || fb.SDK_VERSION !== CLOUD.v) throw new Error('sdk');
        CLOUD.fb = fb;
      });
      P[i].catch(() => { P[i] = null; });
    }
    return P[part];
  }
```

- `clLoad(1)` on `openRec()` when `CLOUD.on` and the state is `'out'` (warm-up), on the sign-in click if still needed,
  and at boot when linked / returning from a redirect. `clLoad(2)` once a user is signed in.
- The artifact can never load anything: `CLOUD.sdk` is empty there (no `PG_CLOUD`), `clLoad` is only reachable
  when `CLOUD.on`, and `CLOUD.on` needs either a valid `PG_CLOUD` (deploy) or `PG.debug.cloud.start(cfg, mock)` with
  a mock (tests).

---

## 3. Config and build

### 3.1 `bogeul/firebase.config.json` (optional, not committed anywhere public by us; the apiKey is not a secret)

```json
{
  "apiKey": "AIzaSy...39 chars...",
  "authDomain": "ppodeuk-bath.firebaseapp.com",
  "projectId": "ppodeuk-bath",
  "storageBucket": "ppodeuk-bath.firebasestorage.app",
  "messagingSenderId": "123456789012",
  "appId": "1:123456789012:web:0123456789abcdef012345",
  "home": "https://ppodeuk-bath.firebaseapp.com/"
}
```

- The six Firebase fields come from the console (프로젝트 설정 → 내 앱 → SDK 설정 및 구성 → 구성). `home` is ours and
  optional: the game's canonical address, opened by "새 창에서 열기" from a frame. Default: the page's own URL.
- **Lenient read** (the user is not a developer): strip a BOM; `JSON.parse`; if that fails, pick `name: "value"` /
  `name: 'value'` pairs with a regex, so pasting the console's `const firebaseConfig = { … };` as it is also works.
  Unknown fields (`measurementId`) are dropped.
- **Validation** (throw with a clear Korean + English message, the build stops):
  `apiKey` `/^AIza[0-9A-Za-z_-]{35}$/`; `projectId` `/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/`; `authDomain`
  `/^[a-z0-9.-]+\.[a-z]{2,}$/`; `appId` `/^1:\d+:web:[0-9a-f]+$/`; `messagingSenderId` `/^\d+$/` (optional);
  `storageBucket` `/^[a-z0-9._-]+$/` (optional); `home` empty or `/^https:\/\/[^\s"'<>\\]+$/`.
  Example: `firebase.config.json: apiKey가 이상해요 (AIza로 시작하는 39글자예요) / apiKey looks wrong`.
- Env override for tools only: `PG_FIREBASE_CONFIG=<path>` reads another file (never needed by the user).

### 3.2 Injection (deploy only)

```js
const fbConf = readFirebaseConfig(process.env.PG_FIREBASE_CONFIG || path.join(root, 'firebase.config.json')); // null = none
const fbData = (c) => c && { v: FIREBASE_V, ns: 'firebase', cfg: c.cfg, home: c.home, sdk: FIREBASE_SDK.map(([f, sri]) => [fbUrl(f), sri, fbAlt(f)]) };
// first visit to <id>.web.app -> <id>.firebaseapp.com (the authDomain: redirect sign-in works in every browser there);
// not in a frame, not for a browser that already keeps trophies on web.app
const FB_HOP = "(function(c){try{var p=c.cfg.projectId,a=c.cfg.authDomain;if(location.hostname===p+'.web.app'&&a===p+'.firebaseapp.com'" +
  "&&window.top===window.self&&localStorage.getItem('ppogeul-trophy')===null)location.replace('https://'+a+location.pathname+location.search+location.hash);}catch(e){}})(window.PG_CLOUD);";
const fbTag = (d) => (d ? `<script>window.PG_CLOUD=Object.freeze(${JSON.stringify(d).replace(/</g, '\\u003c')});${FB_HOP}</script>\n` : '');
```

- `deployOf(build)` puts `fbTag(fbData(fbConf))` right after `<meta name="pg-build">` and **before** `SW_REG` (a hop
  leaves before a worker registers on web.app) and before any game script.
- `CDN` (the worker's list) gains the six SDK URLs (primary + fallback) when `fbConf` exists.
- Checks (throw): the artifact `out` contains none of `PG_CLOUD=`, `firebase-app-compat`, `ajax/libs/firebase`,
  `npm/firebase@`, `/__/auth`; with a config the deploy page has exactly one `window.PG_CLOUD=` and all three
  integrity strings; still exactly one static `<script src>` (PeerJS); without a config no `PG_CLOUD=` at all.
- **Fixture page for tests**: build.js always also writes `C:/Temp/bogeul/deploy-cloud/index.html` = `deployOf()` with a
  built-in fake config (`projectId: 'pg-cloud-test'`, `authDomain: 'pg-cloud-test.firebaseapp.com'`,
  `apiKey: 'AIza' + 'Test0'.repeat(7)`, `appId: '1:1234567890:web:0123456789abcdef'`), whatever the real config is. It
  never touches `deploy/`. (Its `sw.js` is missing there: the registration fails silently, as designed.)
- **Firebase Hosting files**: when `fbConf` exists and `bogeul/firebase/.firebaserc` still says `YOUR-PROJECT-ID`, build.js
  writes the projectId into it (the guide also tells the user how to do it by hand).
- The console line names the Firebase project: `deploy/index.html (… KB, Firebase: ppodeuk-bath)` or `(… KB, no Firebase)`.

### 3.3 game.js reads it

```js
  // (everything per page load; the link itself lives in the trophy store, 6.1)
  const CLOUD = { on: false, v: '', cfg: null, sdk: [], home: '', mock: null, env: null, fb: null, app: null, auth: null, authUn: null,
    db: null, ref: null, unsub: null, user: null, parts: [null, null, null], st: 'off', msg: null, msgT: 0, mine: false, push: null,
    pushT: 0, firstDirty: 0, holdUntil: 0, fails: 0, newer: false, doc: null, watchT: 0, loads: 0 };
  const FV = () => CLOUD.fb.firestore.FieldValue;               // (serverTimestamp(), delete())
  // window.PG_CLOUD (the deploy page's head, from build.js): plain values only, else the cloud stays off
  (function clInit() {
    let c = null; try { c = window.PG_CLOUD; } catch (e) { c = null; }
    if (!c || typeof c !== 'object' || !c.cfg || typeof c.cfg !== 'object' || typeof c.v !== 'string') return;
    const cfg = {};
    for (const k of ['apiKey', 'authDomain', 'projectId', 'appId', 'messagingSenderId', 'storageBucket']) if (typeof c.cfg[k] === 'string' && c.cfg[k].length < 200) cfg[k] = c.cfg[k];
    const sdk = (Array.isArray(c.sdk) ? c.sdk : []).filter((x) => Array.isArray(x) && x.length === 3 && x.every((y) => typeof y === 'string')
      && /^https:\/\/(cdnjs\.cloudflare\.com\/ajax\/libs\/firebase\/|cdn\.jsdelivr\.net\/npm\/firebase@)/.test(x[0]) && /^sha(384|512)-/.test(x[1]));
    if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId || sdk.length !== 3) return;
    Object.assign(CLOUD, { on: true, v: c.v, cfg, sdk, home: typeof c.home === 'string' && /^https:\/\//.test(c.home) ? c.home : '' });
  })();
```

---

## 4. Auth

### 4.1 Environment and method

```js
  // where this page runs (PG.debug.cloud.env() overrides it in tests)
  function clEnv() {
    if (CLOUD.env) return CLOUD.env;
    let framed = true; try { framed = window.top !== window.self; } catch (e) { framed = true; }
    return { framed, app: pwaIsApp(), inApp: IN_APP_RE.test(navigator.userAgent || ''), same: location.hostname === CLOUD.cfg.authDomain,
      android: /Android/i.test(navigator.userAgent || ''), kakao: /KAKAOTALK/i.test(navigator.userAgent || '') };
  }
  // 'inapp' (Google refuses embedded browsers) | 'nostore' (no localStorage: nothing could stay linked) | 'popup' | 'redirect'
  function clMethod() {
    const e = clEnv();
    if (e.inApp) return 'inapp';
    if (TRO.mem || TRO.ro) return 'nostore';
    if (e.framed) return 'popup';                        // (a frame cannot redirect to Google's pages)
    return e.app && e.same ? 'redirect' : 'popup';       // (an installed app: popups open outside it - unless that cannot work)
  }
```

| Where | Method | On failure |
|---|---|---|
| Browser tab (desktop, phone) | popup | blocked + `same` → redirect; blocked otherwise → "팝업이 막혔어요 · 한 번 더 눌러 주세요" (the second tap has the SDK in memory, so the popup opens straight from it) |
| Installed app on its authDomain (Firebase Hosting) | redirect | the page comes back signed out → "로그인하지 못했어요 · 잠시 뒤에 다시 해 주세요" |
| Installed app elsewhere (GitHub Pages) | popup (best effort) | "이 화면에서는 로그인이 안 돼요 · 새 창에서 열어 주세요" + button 새 창에서 열기 (the browser, not the app: the guide says the app there cannot be linked; recommend Firebase Hosting) |
| Inside a frame (itch.io, any portal), on a shared host (`PG_CLOUD.shared`: itch.zone, itch.io, hwcdn.net, ungrounded.net) or in the itch zip's page (`away`) | **none** (17) | `'frame'` at boot, nothing loaded: 새 창에서 열기 → `home` only (never the frame's / shared host's own URL); no `home` → "이 화면에서는 구글 로그인을 쓸 수 없어요", no button |
| In-app browser (KakaoTalk, NAVER, Instagram, FB, LINE, Android WebView) | none | "앱 안 브라우저에서는 구글 로그인이 안 돼요 · 크롬이나 사파리에서 열어 주세요" + button 다른 브라우저로 열기: KakaoTalk `kakaotalk://web/openExternal?url=<enc>`, LINE `<url>?openExternalBrowser=1`, other Android `intent://<host+path>#Intent;scheme=https;package=com.android.chrome;end`, iOS others: the message only (button hidden) |
| Storage blocked / read-only store | none | "이 브라우저에서는 로그인을 쓸 수 없어요"; in a frame: 'frame' with "새 창에서 열면 기록이 저장되고 로그인도 돼요" (17) |

### 4.2 Flows

```js
  const clProvider = () => { const p = new CLOUD.fb.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return p; };
  function clApp() {                                      // once the app + auth files ran
    const fb = CLOUD.fb;
    if (!CLOUD.app) CLOUD.app = fb.apps && fb.apps.length ? fb.app() : fb.initializeApp(CLOUD.cfg);
    if (!CLOUD.auth) { CLOUD.auth = CLOUD.app.auth(); CLOUD.auth.languageCode = 'ko'; CLOUD.authUn = CLOUD.auth.onAuthStateChanged(clAuthIn, () => {}); }
  }
```

- **Click** (`#pg-cloud-btn`, label by state, 9.3): `firstGesture()`; `'in'` → sign-out (4.4); `'frame'`/`'inapp'` →
  open outside; otherwise sign-in:
  1. `if (S.esc.length) → message 'held'` ("경기가 끝난 뒤에 해 주세요"); method `'nostore'` / `'inapp'` → their state.
  2. `CLOUD.mine = true` (this tab asked; only such a tab ever links, 6.3).
  3. SDK not in memory → state `'load'`, `clLoad(1).then(clApp)`, then continue (a popup may now be blocked: see table).
  4. `CLOUD.auth.currentUser` already set (another tab signed in, or a relog with the same session) → link directly.
  5. `'redirect'` → `sset(clMetaKey(), JSON.stringify({ rd: Date.now() }))`, `auth.signInWithRedirect(clProvider())`.
  6. else state `'auth'`, `auth.signInWithPopup(clProvider())` **synchronously in the click handler**; success needs no
     code (onAuthStateChanged links); failure → `clAuthFail(e)`. A 120 s watchdog returns `'auth'` to `'out'`.
- **onAuthStateChanged(user)** → `clAuthIn`: keep `{ uid }` only (`/^[A-Za-z0-9]{1,128}$/`), never read `email`,
  `displayName`, `photoURL`, `providerData`.
  - user, `S.cs.u === uid` → resume (state `'in'`, `clLoad(2)`, listen, kick).
  - user, no `S.cs` (or another uid's) → `CLOUD.mine ? clLink() : state 'out'` (another tab is linking; its store write
    arrives by the `storage` event and flips this tab to `'in'`).
  - no user, `S.cs` set → `'relog'`: the account's copy stays the active store (play goes on, mine keeps adding up),
    button "다시 로그인", line "다시 로그인해 주세요". Same uid later → resume and push; another uid → 6.3 starts by
    putting this account's copy away.
  - no user, no `S.cs` → `'out'`.
- **Redirect return**: boot sees `meta.rd` younger than 10 min → `CLOUD.mine = true`, `clLoad(1)`, `clApp()`,
  `auth.getRedirectResult()`; clear `meta`; a user → the link runs (onAuthStateChanged) and `openRec()` shows its message
  once the title is up; no user and an error → `clAuthFail(e)` + `openRec()`; no user, no error (cancelled) → nothing.

### 4.3 Errors → messages (`clAuthFail(e)`, by `e.code`)

| code | state / message |
|---|---|
| `auth/popup-closed-by-user`, `auth/cancelled-popup-request`, `auth/user-cancelled` | `'out'`, 'cancel' "로그인을 취소했어요" (in a frame after > 10 s open: 'frame' instead - a lost result looks like a close) |
| `auth/popup-blocked` | `same && !framed` → redirect; else 'popup' |
| `auth/operation-not-supported-in-this-environment`, `auth/web-storage-unsupported` | framed → `'frame'`; else `'nostore'` |
| `auth/unauthorized-domain` | 'domain' "승인되지 않은 주소예요: <hostname>" (+ 새 창에서 열기 in a frame) - tells the owner which domain to add |
| `auth/operation-not-allowed`, `auth/configuration-not-found`, `auth/invalid-api-key`, `auth/api-key-not-valid` and anything starting `auth/api-key` | 'setup' "로그인이 아직 준비되지 않았어요 · 설정을 확인해 주세요" |
| `auth/user-disabled` | 'disabled' "이 계정은 쓸 수 없어요" |
| `auth/network-request-failed` | `navigator.onLine === false` ? 'offline' : 'fail' |
| SDK load failure | 'sdk' "로그인 도구를 불러오지 못했어요 · 인터넷이나 광고 차단을 확인해 주세요" (retried on the next click / `online`) |
| anything else | 'fail' "로그인하지 못했어요 · 잠시 뒤에 다시 해 주세요" |

### 4.4 Sign-out

1. `S.esc.length` → 'held'.
2. Dirty (`clDirty() === 'hard'`): push now and wait up to 4 s. Still dirty → `confirmTwice('pg-cloud-btn',
   '저장 안 된 트로피가 있어요 · 한 번 더 누르면 로그아웃', …)`.
3. `clUnlink()` (6.6), then `auth.signOut()` (errors ignored: the local part already happened), state `'out'`,
   message 'out' "로그아웃했어요 · 다시 로그인하면 계정 트로피가 돌아와요".

### 4.5 Persistence

Firebase Auth's default LOCAL persistence (IndexedDB, then localStorage): the session survives reloads and app
restarts. `S.cs` (in `ppogeul-trophy`) is "this browser is linked", which is what makes boot load the SDK. Both live per
origin, so a browser tab, the installed app (iOS: its own storage) and the itch.io frame each link separately; the
cloud is what joins them.

---

## 5. Data model

### 5.1 `players/{uid}`

```
{
  v: 1,                                   schema
  dev: 'abcd1234',                        the account's device id (from the first browser that uploaded)
  nick: '뽀숑',                           optional, cleanNick'ed in-game nickname (last change wins)
  s: {                                    ≤ 16 browser slots + the archive '_'
    'k7f3a9q2': { t: 80, w: 2, g: 3, ko: 5, best: 90, bl: 1, seen: 1, hi: 12000, day: 20261016, de: 15, n: 4, at: <ts> },
    'm2x0c8b1': { t: -56, w: 0, g: 1, ko: 0, best: 95, bl: 1, seen: 0, hi: 50000, day: 20261016, de: 0, n: 1, at: <ts> }
  },
  last: 'k7f3a9q2',                       the slot this write changed
  updatedAt: <server timestamp>
}
```

- A **slot** belongs to one browser (one localStorage: a browser profile, the installed app, the itch frame). Its key is
  random, `/^[a-z][0-9a-z]{7}$/`, made when that browser links. Its `t, w, g, ko` are what that browser **added**
  (t may be negative); `best, bl, seen, hi` the best it has seen; `day, de` the 목욕 보너스 it gave on that local day; `n`
  its write counter; `at` the server time of its last write.
- **The account**: `t = clamp(Σ s.t, 0, 99999)`, `w, g, ko = Σ`, `best/bl/seen/hi = max`, today's bonus `= Σ de of the
  slots whose day is today`.
- `'_'` (the archive): folded slots (6.7); never written except by a fold.
- Size: ≤ 17 × ~130 bytes. One read per snapshot, one write per push.

### 5.2 What syncs, what does not

| Field | Synced as | Why |
|---|---|---|
| `t, w, g, ko` | per-slot contribution | counts that move on every device |
| `best, bl, seen` | per-slot best seen, max | cosmetic, monotone; 승급 shows once per account |
| `day, de` | per-slot bonus of a day | the daily 목욕 보너스 cap is shared (two devices offline at once may each give up to 20: accepted) |
| `hi` (`G.hiscore`, `ppogeul-hiscore`) | per-slot best score, max | shown in 내 기록; not part of the trophy store (read at push, written on adoption) |
| `dev` | account field, set at creation | same account = same device (practice when it meets itself) |
| `nick` (`ppogeul-nick`) | account field, last write wins | a new device starts with the player's name: adopted when the local one is the default (`/^손님\d{2}$/`) |
| `esc` (holds) | **not synced** | per tab, already subtracted from t; a refund / forfeit later is an ordinary change of t |
| tab id, `TRO.*`, `ppogeul-char`, sound | not synced | per page load / per device |
| `v` | doc schema | a doc with `v > 1` (a newer page) is never written by this page: state `'newer'` |

---

## 6. Sync model

### 6.1 The link record `S.cs` (inside `ppogeul-trophy`)

```
cs = {
  u: uid,                                  the account this view belongs to
  k: 'k7f3a9q2',                           my slot
  c: { t, w, g, ko, de, day },             my contribution at the last sync
  v: { t, w, g, ko, de, day },             the view (S's counters) written at that same moment
  m: { t, w, g, ko, best, bl, seen, hi, day, de, n },   my slot as the server last acknowledged it (n 0 = none yet)
  n: 7,                                    the last write counter this browser handed out (≥ m.n)
  mt: ms                                   Date.now() when that acknowledgement arrived (a conservative clock for the rate cap)
}
```

- **mine now** = `c + (S − v)` for t, w, g, ko (and de on the same day). The game keeps changing `S` exactly as today
  (`troMut` everywhere); nothing in the trophy code needs to know about the cloud.
- View and record are one JSON value under one key: every adoption is one `troMut`, so two tabs adopting the same
  snapshot both end with the same result (idempotent), and a reader never sees a view without the record it came from.
- `troParse` keeps `cs` only when `clParseCs(o.cs)` validates it (every number through `nInt`, keys and uid by regex);
  otherwise the property is left out (never `cs: null`: the artifact's stored JSON keeps its exact shape):
  ```js
  // (troParse: `const cs = clParseCs(o.cs); ... if (cs) out.cs = cs;`)
  function clParseCs(x) {
    if (!x || typeof x !== 'object' || typeof x.u !== 'string' || !CL_UID_RE.test(x.u) || typeof x.k !== 'string' || !CL_KEY_RE.test(x.k)) return null;
    const I = (v, lo, hi) => nInt(v, lo, hi, 0);
    const cnt = (o) => (o && typeof o === 'object' ? { t: I(o.t, -999999, 999999), w: I(o.w, 0, 1e7), g: I(o.g, 0, 1e7), ko: I(o.ko, 0, 1e7),
      de: I(o.de, 0, DAY_CAP), day: I(o.day, 0, 99991231) } : null);
    const c = cnt(x.c), v = cnt(x.v), m0 = x.m && typeof x.m === 'object' ? x.m : {};
    if (!c || !v) return null;
    const m = Object.assign(clSlot(Object.assign({}, m0, { n: 1 })), { n: nInt(m0.n, 0, 1e9, 0) }); delete m.at;
    return { u: x.u, k: x.k, c, v, m, n: Math.max(nInt(x.n, 0, 1e9, 0), m.n), mt: nNum(x.mt, 0, 9e15, 0) };
  }
  ```
  `troFresh()` has no `cs`. Losing `cs` (an unreadable store, `tro.reset()`) is safe: the next sign-in event links again
  (cloud wins).

### 6.2 Pure functions (unit-tested through `PG.debug.cloud`)

```js
  const CL_FIELDS = ['t', 'w', 'g', 'ko', 'best', 'bl', 'seen', 'hi', 'day', 'de'];
  const clZero = () => ({ t: 0, w: 0, g: 0, ko: 0, best: 0, bl: 0, seen: 0, hi: 0, day: 0, de: 0, n: 0 });
  const clMs = (ts) => { try { return ts && typeof ts.toMillis === 'function' ? nNum(ts.toMillis(), 0, 9e15, 0) : 0; } catch (e) { return 0; } };
  // one slot from the network (untrusted): clamped like the rules
  function clSlot(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    const I = (v, lo, hi) => nInt(v, lo, hi, 0), g = I(x.g, 0, 1e7);
    return { t: I(x.t, -999999, 999999), w: Math.min(I(x.w, 0, 1e7), g), g, ko: I(x.ko, 0, 1e7), best: I(x.best, 0, TRO_MAX),
      bl: I(x.bl, 0, LEAGUES.length - 1), seen: x.seen ? 1 : 0, hi: I(x.hi, 0, 999999999), day: I(x.day, 0, 99991231),
      de: I(x.de, 0, DAY_CAP), n: nInt(x.n, 1, 1e9, 1), at: clMs(x.at) };
  }
  // a document (untrusted): { dev, nick, s: Map }; null = unusable, 'newer' = a newer page's schema
  function clDoc(d) {
    if (!d || typeof d !== 'object') return null;
    if (typeof d.v === 'number' && d.v > CL_V) return 'newer';
    if (d.v !== CL_V) return null;
    const s = new Map();
    if (d.s && typeof d.s === 'object') for (const k of Object.keys(d.s)) {
      if (s.size > CL_MAXS) break;
      if (k === '_' || CL_KEY_RE.test(k)) { const x = clSlot(d.s[k]); if (x) s.set(k, x); }
    }
    return { dev: typeof d.dev === 'string' && /^[0-9a-z]{8}$/.test(d.dev) ? d.dev : '', nick: cleanNick(d.nick), s };
  }
  // every slot but mine: counters add up (de: only the slots of that day), the rest is the best seen
  function clAgg(s, mine, day) {
    const a = { t: 0, w: 0, g: 0, ko: 0, de: 0, best: 0, bl: 0, seen: 0, hi: 0 };
    for (const [k, x] of s) {
      if (k === mine) continue;
      a.t += x.t; a.w += x.w; a.g += x.g; a.ko += x.ko; if (x.day === day) a.de += x.de;
      a.best = Math.max(a.best, x.best); a.bl = Math.max(a.bl, x.bl); a.seen = Math.max(a.seen, x.seen); a.hi = Math.max(a.hi, x.hi);
    }
    return a;
  }
  // what this browser has added: my part at the last sync + what the game changed in the view since
  function clMine(S, cs, hi) {
    const c = cs.c, v = cs.v;
    return { t: c.t + S.t - v.t, w: Math.max(0, c.w + S.w - v.w), g: Math.max(0, c.g + S.g - v.g), ko: Math.max(0, c.ko + S.ko - v.ko),
      best: S.best, bl: S.bl, seen: S.seen, hi, day: S.day, de: S.day === v.day ? clamp(c.de + S.de - v.de, 0, DAY_CAP) : S.de };
  }
  // adopt a document into the view (S changed in place, inside troMut; returns the new cs). join: this browser starts
  // from nothing (cloud wins); a slot of mine that vanished (folded, or the doc was reset) starts over the same way.
  // pending: a snapshot carrying this tab's own unacknowledged write (never taken as acknowledged)
  function clAdopt(S, cs, D, hi, join, pending) {
    const day = Math.max(S.day, troToday());
    const fresh = join || (cs.m.n > 0 && !D.s.has(cs.k));
    const mine = fresh ? { t: 0, w: 0, g: 0, ko: 0, de: 0, day } : clMine(S, cs, hi);
    const mde = mine.day === day ? mine.de : 0, o = clAgg(D.s, cs.k, day);
    S.t = clamp(o.t + mine.t, 0, TRO_MAX); S.w = clamp(o.w + mine.w, 0, 1e6); S.g = clamp(o.g + mine.g, 0, 1e6); S.ko = clamp(o.ko + mine.ko, 0, 1e6);
    S.best = Math.max(join ? 0 : S.best, o.best, S.t); S.bl = Math.max(join ? 0 : S.bl, o.bl); S.seen = Math.max(join ? 0 : S.seen, o.seen);
    S.day = day; S.de = clamp(o.de + mde, 0, DAY_CAP);
    if (D.dev && !NET.sess) S.dev = D.dev;                        // (in a room: the next adoption after it ends)
    const srv = D.s.get(cs.k), took = !fresh && !pending && !!srv && srv.n > cs.m.n;   // (another tab of mine wrote it)
    const m = fresh ? clZero() : took ? Object.assign({}, srv) : cs.m;
    return { u: cs.u, k: cs.k, c: { t: mine.t, w: mine.w, g: mine.g, ko: mine.ko, de: mde, day }, v: { t: S.t, w: S.w, g: S.g, ko: S.ko, de: S.de, day },
      m, n: fresh ? 0 : Math.max(cs.n, m.n), mt: fresh ? 0 : took ? Date.now() : cs.mt };
  }
  // the next write of my slot, capped to what the rules take now; null = nothing to write; {wait: ms} = too soon
  function clStep(mine, m, n, now, mt) {
    const dt = m.n ? now - mt : 1e12;
    if (dt < CL_GAP_MS) return { wait: CL_GAP_MS - dt };
    const rise = mine.t - m.t, cap = m.n ? Math.min(CL_RISE, Math.floor((10000 + dt) / 500)) : CL_RISE;
    const g = Math.max(m.g, Math.min(mine.g, m.g + 20)), ko = Math.max(m.ko, Math.min(mine.ko, m.ko + 400));
    const x = { t: rise > cap ? m.t + cap : mine.t, w: Math.max(m.w, Math.min(mine.w, m.w + (g - m.g), g)), g, ko,
      best: Math.max(m.best, mine.best), bl: Math.max(m.bl, mine.bl), seen: Math.max(m.seen, mine.seen), hi: Math.max(m.hi, Math.min(mine.hi, 999999999)),
      day: mine.day, de: clamp(mine.de, 0, DAY_CAP) };
    if (CL_FIELDS.every((f) => x[f] === m[f])) return null;
    return { slot: Object.assign(x, { n: m.n ? Math.max(n, m.n) + 1 : 1 }), partial: x.t !== mine.t || x.g !== mine.g || x.w !== mine.w || x.ko !== mine.ko };
  }
  // what a write would carry, time aside: 'hard' (a count or today's bonus differs from what the server has), 'soft'
  // (only a best / seen / score), '' (in sync - also when only an unwritable difference is left, e.g. a hand-edited w > g)
  function clDirty(S) {
    const cs = S && S.cs; if (!cs) return '';
    const st = clStep(clMine(S, cs, G.hiscore), cs.m, cs.n, Infinity, 0);
    if (!st) return '';
    return ['t', 'w', 'g', 'ko', 'day', 'de'].some((f) => st.slot[f] !== cs.m[f]) ? 'hard' : 'soft';
  }
```

Notes on the formulas:
- The clamp of the **view** never changes `c`, so a debt (two devices of one account losing at once more than it had)
  stays in the sum: the view shows 0 and later gains pay the debt first. Forgiving it by clamping `c` would let both
  devices forgive the same debt: double trophies. (Simulated both ways.)
- `n` for a new slot is always 1 (the rules require it); for an existing slot `max(n, m.n) + 1` (gaps are fine). `n` is
  reserved in the record **before** the write is sent (one `troMut`), so a second tab takes a higher one; if two tabs
  still send the same `n`, the rules refuse the second: never a stale overwrite.
- `mt` is when the acknowledgement arrived (later than the server's `at`), so `now - mt` underestimates the server's
  dt and the client's cap is never above what the rules allow.

### 6.3 First sign-in (`clLink`, only in the tab that asked: `CLOUD.mine`)

1. State `'link'`; `clLoad(2)`; `db = app.firestore()`; `ref = db.collection('players').doc(uid)`.
2. `S.cs` of another uid → `clUnlink()` first (that account's copy goes; this browser's own store comes back).
3. `S.esc.length` → 'held', stop (signed in, not linked: the next click links).
4. A transaction (15 s timeout):
   ```js
   db.runTransaction(async (tx) => {
     const snap = await tx.get(ref);
     if (snap.exists) return { data: snap.data() };
     const S = troRead(), k = clNewKey(), slot = clUpload(S);          // t, min(w, g), g, ko, max(best, t), bl, seen, G.hiscore, day, de, n 1
     tx.set(ref, Object.assign({ v: CL_V, dev: S.dev, s: { [k]: Object.assign({}, slot, { at: FV().serverTimestamp() }) }, last: k,
       updatedAt: FV().serverTimestamp() }, clNickOut() ? { nick: clNickOut() } : {}));
     return { k, slot, at: { t: S.t, w: S.w, g: S.g, ko: S.ko, de: S.de, day: S.day } };
   })
   ```
5. **Created** (cloud was empty): `troMut(S => { S.cs = { u, k, c: counters(slot), v: res.at, m: slot, n: 1,
   mt: Date.now() } })` — `c` is what was uploaded, `v` the store it came from (they differ only where the upload
   clamped, e.g. a hand-edited w > g), and anything the store gained since is picked up by mine = c + (S − v);
   `sset(clGuestKey(), '')`; message 'up' "구글 계정에 트로피 N개를 저장했어요".
6. **Exists**: `D = clDoc(data)`; `'newer'` → state `'newer'`, stop. Else in one `troMut`: put this browser's store
   (without `cs`) into `clGuestKey()`; `const mineT = S.t`; `S.cs = clAdopt(S, { u, k: clNewKey(), c: null, v: null,
   m: clZero(), n: 0, mt: 0 }, D, G.hiscore, true, false)`. Nick: adopt `D.nick` when the local one is the default.
   Message: `mineT > S.t` → 'swap' "구글 계정의 트로피 {S.t}개로 바꿨어요 · 이 기기의 {mineT}개는 로그아웃하면 돌아와요",
   else 'got' "구글 계정의 트로피 {S.t}개를 불러왔어요". This browser writes nothing until its first change.
7. Listen (6.5), state `'in'`, `clKick()`.
- Failure (offline, timeout, `unavailable`): stay signed in, state `'out'` with 'offline' / 'fail'; `CLOUD.mine` stays
  set, so `online` or the next click retries the link. `permission-denied` here means the rules are not deployed
  (or are wrong) → 'setup'.

### 6.4 Pushing (`clKick` → `clPush`)

- `clKick()` runs from `troSync()` (every change, here or in another tab), `saveHi()`, the `online` event and after
  every push. It (re)schedules one timer:
  `due = max(CLOUD.holdUntil, min(now + (soft ? 60 s : 4 s), firstDirty + (soft ? 60 s : 20 s)))`.
- `clCanPush()`: signed in, `S.cs.u === user.uid`, `ref` ready, no push in flight, not `'newer'`, not `troOpenHere()`.
- `clPush()`:
  1. `S = troRead()`; nothing dirty → done.
  2. My slot is new (`cs.m.n === 0`), the doc has ≥ 16 browser slots → fold first (6.7).
  3. `st = clStep(clMine(S, cs, G.hiscore), cs.m, cs.n, Date.now(), cs.mt)`; `null` → done; `wait` →
     `holdUntil = now + wait`, kick.
  4. `CLOUD.push = true`; `troMut(S => S.cs.n = max(S.cs.n, st.slot.n))`; then
     `ref.update({ ['s.' + cs.k]: Object.assign({}, st.slot, { at: FV().serverTimestamp() }), last: cs.k, updatedAt: FV().serverTimestamp() })`.
  5. Resolved → `troMut(S => { if (S.cs && S.cs.k === cs.k && st.slot.n > S.cs.m.n) { S.cs.m = st.slot; S.cs.mt = Date.now(); } })`,
     `fails = 0`. Partial (rate cap) → the rest goes in the next push (dirty stays 'hard').
  6. Rejected → by `e.code`: `permission-denied` (a refused step, a racing tab, the doc-level 2 s rate) → back off
     `CL_BACKOFF[fails++]` (5 s, 15 s, 1 min, 5 min, then 15 min); `not-found` → recreate (6.6); `resource-exhausted` →
     1 h, line 'quota'; `unauthenticated` → `'relog'`; `unavailable` / `deadline-exceeded` / `aborted` → 5 s. Never a
     console message.
  7. `CLOUD.push = null`; kick.
- One write in flight at a time per tab. While offline the SDK keeps that write queued and its promise pending; no
  second write is stacked behind it (stacked writes would reach the server inside each other's 2 s).
- `visibilitychange` → hidden and `pagehide`: push now if hard-dirty and allowed (best effort: a write cut off by the
  page closing is simply re-sent by the next load, the values being absolute).

### 6.5 Adoption (`onSnapshot`)

```js
  CLOUD.unsub = ref.onSnapshot({ includeMetadataChanges: true }, clSnap, clSnapErr);
  function clSnap(snap) {
    const S0 = TRO.s; if (!S0 || !S0.cs || !CLOUD.user || S0.cs.u !== CLOUD.user.uid) return;
    if (!snap.exists) { if (!snap.metadata.fromCache && S0.cs.m.n > 0) clRecreate(); return; }
    const D = clDoc(snap.data({ serverTimestamps: 'estimate' }));
    if (D === 'newer') { CLOUD.newer = true; clSet('in'); return; }
    if (!D) return;
    CLOUD.doc = D;
    troMut((S) => { if (S.cs && S.cs.u === CLOUD.user.uid) S.cs = clAdopt(S, S.cs, D, G.hiscore, false, snap.metadata.hasPendingWrites); });
    clHiIn(D); clNickIn(D);                     // G.hiscore = max(…, slots' hi) + sset + #pg-title-hi; default nick -> D.nick
  }
```

- Every snapshot of every device (this one's echoes too) is adopted; adoption is idempotent, so echoes change nothing.
- `clSnapErr`: `permission-denied` (signed out elsewhere, rules changed) → unsubscribe, `'relog'`; other codes → the
  SDK retries by itself; nothing is shown unless it lasts (the badge mark turns 'wait' after 10 s dirty).

### 6.6 Sign-out, relink, reset

```js
  // this browser's own store comes back (the put-aside one, else a fresh store with the gift); the account's copy goes
  function clUnlink() {
    if (CLOUD.unsub) { CLOUD.unsub(); CLOUD.unsub = null; }
    clearTimeout(CLOUD.pushT);
    troMut((S) => {
      const g = troParse(sget(clGuestKey()) || ''), back = g && g !== 'newer' ? g : troFresh();
      for (const k of Object.keys(S)) delete S[k];
      Object.assign(S, back); delete S.cs;
    });
    sset(clGuestKey(), '');
  }
```
- `clRecreate()` (the doc is gone but this browser had written: the owner reset it, or it was deleted): create it again
  from the current view as one fresh slot (the 6.3 transaction, "created" branch, with `cs` rebuilt). The view is the
  best copy left; an owner who wants a player gone disables the user in Authentication instead.

### 6.7 Folding (keeps the doc at ≤ 16 browser slots)

Private windows and new phones each make a slot once they change something. Before a NEW slot's first write when 16
browser slots exist: a transaction reads the doc, picks the oldest slot other than mine with `at` older than 8 days
(the rules say 7; the extra day absorbs clock differences), and writes
`{ ['s.' + k]: FV().delete(), 's._': sum(archive, slot k), last: k, updatedAt }` (sum: t, w, g, ko added; best, bl, seen,
hi max; day 0, de 0; n + 1). No such slot → line 'full' "이 기기는 저장할 수 없어요 (기기 16대까지)"; the browser plays
on locally. A folded browser that comes back finds its slot gone: `clAdopt` starts it over (its unpushed changes from
before the 7 idle days are dropped; its pushed ones are in the archive).

### 6.8 Boot, tabs, offline

- `boot`: after `troLoad()`, `clBoot()`: off unless `CLOUD.on`; `TRO.mem || TRO.ro` → state `'nostore'`; else
  `S.cs` → state `'in'` with the badge mark 'wait', and (after the first frame, `requestIdleCallback` or 500 ms)
  `clLoad(1).then(clApp)`; `meta.rd` → the redirect return (4.2); else `'out'`, nothing loaded.
- `storage` event on `TRO.key`: besides today's `troRead()` + `troSync()`: `S.cs` appeared and the SDK is not loaded →
  load it (this tab's own changes then push from here too); `S.cs` vanished → unsubscribe, `'out'`.
- Every tab with the SDK listens and may push; adoption is idempotent and the `n` reservation keeps two tabs from
  overwriting each other. (A Web Lock to elect one pusher would only save writes; not needed.)
- Offline: play changes `S` as always; pushes wait in the SDK's queue (one at a time) or, after a reload, in the dirty
  record; the badge mark says 'wait'; `online` → kick (and a pending link / SDK load retries).
- `stopEngine`: unsubscribe the listener and the auth observer, clear timers (the Firebase app object stays in
  `window.firebase`; `clApp` reuses `fb.app()`).

### 6.9 Why not last-write-wins or transactions

- **Last-write-wins on the whole store**: two devices gaining at the same time lose one gain; a device back from offline
  overwrites what others did meanwhile.
- **A transaction adding a delta to one total**: needs the network for every write (no offline queue), and when the tab
  closes between the commit and the local bookkeeping, the next start cannot know whether the delta landed: counted
  twice or lost. The same holds for `FieldValue.increment`.
- **Per-browser absolute slots**: each write states "this browser has added X in total", so repeating it is harmless,
  Firestore's own offline queue is safe, tabs need no coordination, and the rules can still bound every single write.
  The cost is a sum on the client and a doc that grows by one small map per browser (bounded by folding).

---

## 7. Security rules (`bogeul/firebase/firestore.rules`)

The file is ready to paste or deploy; this is its contract.

| Operation | Allowed when |
|---|---|
| get | signed in as `uid` |
| list (queries) | never |
| create | signed in as `uid`; keys ⊆ {v, dev, nick, s, last, updatedAt} with all but nick present; `v == 1`; dev `/^[0-9a-z]{8}$/`; nick 1..24; `updatedAt == request.time`; exactly one slot, `last` names it, full shape, `n == 1`, `0 ≤ t ≤ 99999` |
| update (all) | only s / last / nick / updatedAt change; `updatedAt == request.time`; more than 2 s after the doc's previous write; ≤ 16 browser slots (+ `'_'`); nick 1..24 |
| update: slot write | exactly the slot `last` changes; full shape with `at == request.time`; new slot: `n == 1`, `t ≤ 250`, `g ≤ 20`, `ko ≤ 400`; existing slot: `n` greater, ≥ 2 s since its `at`, a rise of t ≤ 250 and `rise × 500 ≤ 10000 + dt_ms` (20 + 2 per second), g +0..20, w +0..(g's rise), ko +0..400, best / bl / seen / hi never lower |
| update: fold | `last` names a slot that is removed, only it and `'_'` change, its `at` is older than 7 days, and `'_'` becomes exactly the sum (t, w, g, ko), the max (best, bl, seen, hi), `n + 1`, day 0, de 0 |
| update: nick only | only nick / updatedAt change |
| delete | never (the owner deletes in the console; 17) |
| anything else | never |

Shape of every slot: exactly {t, w, g, ko, best, bl, seen, hi, day, de, n, at}; ints; t ±999999; g 0..1e7; w 0..g;
ko 0..1e7; best 0..99999; bl 0..6; seen 0/1; hi 0..999999999; day 0..99991231; de 0..20; n 1..1e9.

Why these numbers: the largest real change between two pushes is +220 (4 players, stake 50: the hold of 56 comes back
with +164) and a battle takes ≥ 2 min, so 20 + 2/s allows it 100 s after the previous write; 목욕 보너스 adds ≤ 15 per run.
The client caps its own writes to the same limits (6.2), so an honest player never meets a refusal except the
doc-level 2 s race between two devices, which retries.

**Limits (stated in the file too; corrected in 17)**: the game is client-side; a modified page can raise its own count -
the 20 of `20 + 2/s` comes back with every write, so writes 2 s apart give about 12 per second per slot; a new slot may
start at +250; the first upload of an account carries the browser's store as it is (any count up to 99999) - and a player
can make slots with fresh browsers (up to 16). Counts shown to friends in rooms were
self-reported before this and still are. What the rules do guarantee: only the owner reads or writes a player's doc,
the data is well-formed, an existing document is never deleted and made again by its player, the archive cannot be
inflated, and nothing in the database is public. (Not: "a count never jumps" - see above.)
Spark quotas (50 000 reads, 20 000 writes, 20 000 deletes a day, 1 GiB) are per project; an abuser could use up a day's
writes for everyone (nothing is billed on Spark; writes fail until the daily reset). App Check would harden this and is
a follow-up (it needs reCAPTCHA setup).

Not verified against the Firestore emulator here (no Java on this machine). Before the first public deploy, the
console's Rules Playground (or `firebase emulators:exec` with `@firebase/rules-unit-testing`) should run the cases of
13.5; in particular a 12-syllable Korean nick (`nickValue` assumes `size()` counts characters, not bytes).

---

## 8. Leaderboard: not in v1

Reasons: (1) 내 기록 has no room at phone size (a TOP 20 needs its own overlay); (2) a public list shows strangers'
free-text nicks with no moderation tool for a non-developer owner; (3) the count is client-side and the rules can only
slow a cheater down, so the top of a public list would be the least trustworthy part of the game; (4) the slot model
has no total the rules can check.

Follow-up design, if wanted later: a `tot` field the rules keep exact incrementally (create: `tot == slot.t`; slot
write: `tot == old.tot + (new.t − old.t)`; fold: unchanged; a write with a stale `tot` is refused and retried), and
`board/{uid} = { nick, tot, updatedAt }` written in the same batch as the player doc, with
`getAfter(/databases/$(database)/documents/players/$(uid)).data.tot == request.resource.data.tot`, readable by signed-in
users, `orderBy('tot', 'desc').limit(20)`, shown in an overlay `'rank'` opened from 내 기록; nick filtered by the same
`cleanNick` plus a short word list, and the owner told how to delete a board entry in the console.

---

## 9. UI contract

### 9.1 Markup (`src/page.html`; hidden by default, so the artifact shows nothing)

Title badge, inside `#pg-tro`, right after `#pg-tro-n`:
```html
<i id="pg-tro-cloud" class="pg-tro-cloud" hidden><svg class="pg-ic pg-cloud-ic" viewBox="0 0 8 8" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 2h2v1H4zM1 3h2v1H1zM4 3h3v1H4zM0 4h8v2H0zM1 6h6v1H1z"/></svg></i>
```
(an 8x8 pixel cloud, two bumps and a flat base, drawn with crisp rects in `currentColor`: a DOM icon, no sprite)

내 기록, after `#pg-rec-note` (before the button row), and the button joins the row before 닫기:
```html
<p id="pg-cloud" class="pg-cloud" hidden aria-live="polite"><svg class="pg-ic pg-cloud-ic" viewBox="0 0 8 8" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 2h2v1H4zM1 3h2v1H1zM4 3h3v1H4zM0 4h8v2H0zM1 6h6v1H1z"/></svg><span id="pg-cloud-tx"></span></p>
<div class="pg-row"><button id="pg-cloud-btn" class="pg-btn pg-ghost pg-cloud-btn" type="button" hidden>구글로 로그인</button><button id="pg-rec-close" class="pg-btn" type="button" data-primary>닫기</button></div>
```

### 9.2 CSS

```css
/* cloud trophies (deploy + firebase.config.json only): the pixel cloud on the badge, the status line and the button in 내 기록 */
.pg-cloud-ic { width: 0.95em; height: 0.95em; flex: none; shape-rendering: crispEdges; vertical-align: -0.12em; }
.pg-tro-cloud { display: inline-flex; color: var(--mint); }
.pg-tro-cloud.is-wait { color: var(--cream-dim); opacity: 0.7; }
.pg-tro-cloud.is-err { color: var(--pink); }
.pg-cloud { display: flex; align-items: center; justify-content: center; gap: 0.35em; margin: 0.5em 0 0; font-size: 0.78em; line-height: 1.3; color: var(--cream-dim); text-wrap: balance; }
.pg-cloud.is-in { color: var(--mint); }
.pg-cloud.is-msg { color: var(--cream); }
.pg-cloud.is-err { color: var(--pink); }
.pg-cloud-btn { white-space: nowrap; }
.pg-cloud-btn[aria-busy="true"] { opacity: 0.7; cursor: progress; }
/* short screens: the status line takes the ladder's place (the card keeps its height) */
@container (max-height: 23em) { .pg-rec-card.has-cloud .pg-rec-ladder { display: none; } .pg-cloud { margin-top: 0.4em; } }
```

- `#pg-cloud` and `#pg-tro-cloud` carry `hidden` and a `display` of their own: like `.pg-tro-row`, they rely on the
  skeleton's `[hidden]{display:none!important}` (the artifact runtime and build.js's `RESET` both have it).
- Fit: the line is one row of 0.78em (≈ 1.45em with its margin); the ladder it replaces on short screens is ≈ 2.35em,
  so a phone's card gets shorter. The button row already exists: "구글로 로그인" (ghost, 1em) + 닫기 ≈ 16em, inside the
  ≈ 20.7em the card has on a 320 px phone. One-time messages may take 2 lines; the card scrolls already.
- The badge grows by ≈ 1.2em; at `max-width: 30em` the league name is already hidden. The `.pg-best` line must still
  hold the badge at ≥ 23em wide with the install pill shown (test 13.6).

### 9.3 States

`CLOUD.st` → `#pg-cloud-btn` label, `#pg-cloud` text and class, `#pg-tro-cloud` class. `.pg-rec-card` gets `has-cloud`
whenever `CLOUD.on`.

| st | button | line (class) | badge mark |
|---|---|---|---|
| `'off'` (no config) | hidden | hidden | hidden |
| `'out'` | 구글로 로그인 | privacy (plain) | hidden |
| `'load'` | 불러오는 중… (disabled, `aria-busy`) | privacy | hidden |
| `'auth'` (popup) | 다시 열기 (tappable after 1.5 s: the popup again; 17) | "구글 창에서 로그인을 마쳐 주세요" (`is-msg`) | hidden |
| `'auth'` (redirect) | 로그인 중… (disabled, `aria-busy`) | 'linking' | hidden |
| `'link'` | 로그인 중… (disabled) | privacy | `is-wait` |
| `'in'`, in sync | 로그아웃 | "구글 계정에 저장돼요" (`is-in`) | plain (mint) |
| `'in'`, pushing | 로그아웃 | "저장하는 중…" (`is-in`) | plain |
| `'in'`, dirty ≥ 10 s or offline | 로그아웃 | offline ? "오프라인이에요 · 연결되면 저장돼요" : "저장 대기 중" | `is-wait` |
| `'in'` + quota / full / newer | 로그아웃 | 'quota' / 'full' / 'newer' (`is-err`) | `is-err` |
| `'relog'` | 다시 로그인 | "다시 로그인해 주세요" (`is-err`) | `is-err` (17), aria " · 다시 로그인해 주세요" |
| `'frame'` | 새 창에서 열기 | 'frame' (`is-err`) | hidden |
| `'inapp'` | 다른 브라우저로 열기 (hidden on iOS non-Kakao) | 'inapp' (`is-err`) | hidden |
| `'nostore'` | hidden | 'nostore' (`is-err`) | hidden |

- A message (`clMsg(key, …)`) replaces the line for 8 s (`is-msg`, or `is-err` for failures), then the state's line
  returns. Messages that arrive while 내 기록 is closed wait for the next `fillRec()` (one pending message).
- `aria-label` of `#pg-tro` gains " · 구글 계정에 저장 중" (in sync) or " · 저장 대기 중"; `#pg-cloud-btn` gets
  `aria-label="구글로 로그인 · 트로피를 구글 계정에 저장해요"` in `'out'`.
- Keyboard: in `onKeyDown`'s `'rec'` branch, when `onButton && e.target !== dom.recClose` and the code is Enter,
  NumpadEnter or Space, return without `preventDefault` (the browser clicks the focused button); Escape still closes.
  After a sign-in or sign-out the focus stays on `#pg-cloud-btn`.
- `fillRec()` calls `clUI()`; `syncTroBadge()` calls `clBadge()`; `clSet()` / `clMsg()` call both.
- `openRec()`: when `CLOUD.on && st === 'out'` → `clLoad(1).then(clApp)` (warm-up, errors ignored here).

### 9.4 Texts (`CLOUD_TEXT`, top constants next to `TRO_TEXT`; appended to both `#pg-fontwarm` spans in `setupDOM` only when `CLOUD.on`)

```js
  const CLOUD_TEXT = '구글로 로그인 로그아웃 다시 로그인 새 창에서 열기 다른 브라우저로 열기 불러오는 중… 로그인 중…' +
    ' 게임 기록에는 구글 계정 이름·메일을 넣지 않아요 구글 계정에 저장돼요 저장하는 중… 저장 대기 중 오프라인이에요 연결되면 저장돼요' +
    ' 구글 계정에 트로피 개를 저장했어요 구글 계정의 트로피 개로 바꿨어요 이 기기의 개는 로그아웃하면 돌아와요 개를 불러왔어요' +
    ' 로그아웃했어요 다시 로그인하면 계정 트로피가 돌아와요 로그인을 취소했어요 팝업이 막혔어요 한 번 더 눌러 주세요' +
    ' 이 화면에서는 로그인이 안 돼요 새 창에서 열어 주세요 앱 안 브라우저에서는 구글 로그인이 안 돼요 크롬이나 사파리에서 열어 주세요' +
    ' 이 브라우저에서는 로그인을 쓸 수 없어요 로그인하지 못했어요 잠시 뒤에 다시 해 주세요 로그인 도구를 불러오지 못했어요 인터넷이나 광고 차단을 확인해 주세요' +
    ' 승인되지 않은 주소예요 로그인이 아직 준비되지 않았어요 설정을 확인해 주세요 이 계정은 쓸 수 없어요' +
    ' 저장 안 된 트로피가 있어요 한 번 더 누르면 로그아웃 경기가 끝난 뒤에 해 주세요 다시 로그인해 주세요' +
    ' 지금은 저장할 수 없어요 나중에 다시 저장돼요 새 버전에서 저장한 기록이에요 새로고침해 주세요 이 기기는 저장할 수 없어요 기기 16대까지 · : ( ) 0123456789';
```

| key | text |
|---|---|
| pitch (17; was privacy) | 로그인하면 다른 기기에서도 트로피가 이어져요 · 구글 계정 이름·메일은 저장하지 않아요 |
| authing / linking / late (17) | 구글 창에서 로그인을 마쳐 주세요 / 구글 계정에 연결하는 중… / 로그인을 마치지 못했어요 · 다시 눌러 주세요 |
| framens / frame0 (17) | 새 창에서 열면 기록이 저장되고 로그인도 돼요 / 이 화면에서는 구글 로그인을 쓸 수 없어요 |
| ok / pushing / wait / offline | 구글 계정에 저장돼요 / 저장하는 중… / 저장 대기 중 / 오프라인이에요 · 연결되면 저장돼요 |
| up(n) / got(n) / swap(c, g) | 구글 계정에 트로피 {n}개를 저장했어요 / 구글 계정의 트로피 {n}개를 불러왔어요 / 구글 계정의 트로피 {c}개예요 · 이 기기의 {g}개는 로그아웃하면 다시 보여요 (17: kept until 내 기록 closes) |
| out / cancel / popup | 로그아웃했어요 · 다시 로그인하면 계정 트로피가 돌아와요 / 로그인을 취소했어요 / 팝업이 막혔어요 · 한 번 더 눌러 주세요 |
| frame / inapp / nostore | 이 화면에서는 로그인이 안 돼요 · 새 창에서 열어 주세요 / 앱 안 브라우저에서는 구글 로그인이 안 돼요 · 크롬이나 사파리에서 열어 주세요 / 이 브라우저에서는 로그인을 쓸 수 없어요 |
| fail / sdk / domain(h) | 로그인하지 못했어요 · 잠시 뒤에 다시 해 주세요 / 로그인 도구를 불러오지 못했어요 · 인터넷이나 광고 차단을 확인해 주세요 / 승인되지 않은 주소예요: {h} |
| setup / disabled | 로그인이 아직 준비되지 않았어요 · 설정을 확인해 주세요 / 이 계정은 쓸 수 없어요 |
| held / relog / dirty | 경기가 끝난 뒤에 해 주세요 / 다시 로그인해 주세요 / 저장 안 된 트로피가 있어요 · 한 번 더 누르면 로그아웃 |
| quota / newer / full | 지금은 저장할 수 없어요 · 나중에 다시 저장돼요 / 새 버전에서 저장한 기록이에요 · 새로고침해 주세요 / 이 기기는 저장할 수 없어요 (기기 16대까지) |

---

## 10. Privacy

- Stored by the game in Firestore: the uid (document id), the trophy numbers of 5.1, the in-game nick, random ids
  (`dev`, slot keys), server timestamps. The code keeps `{ uid }` from the user object and never reads its name, mail,
  photo or provider data (test 13.4 checks it with getters on the mock user).
- Firebase Authentication itself keeps the Google account's mail (and name / photo) in the project's user list, visible
  to the project owner in the console. That is why the UI line says "게임 기록에는 … 넣지 않아요" (true) rather than
  "저장하지 않아요" (not true of the sign-in service). The setup guide tells the owner this and how to delete a user.
- Nothing is public (no leaderboard); one player's doc is readable only by that player.

---

## 11. Debug / test API (`PG.debug.cloud`)

```js
  PG.debug.cloud = {
    state(),        // {on, st, msg, user: uid|null, cs (copy), dirty, mine, push: bool, fails, holdUntil, parts: [app, auth, fs loaded],
                    //  method, env, newer, doc: {slots, sum} | null, loads: n script elements made}
    start(cfg, mock),   // (artifact-skeleton test pages) CLOUD.on with this config and this mock; never loads a file
    use(mock),      // (the deploy fixture page) the mock instead of the SDK files; before anything loaded
    env(o),         // {framed, app, inApp, same, android, kakao} override; null = real
    reboot(),       // clBoot() again (after tro.ns / a test store with cs)
    fast(on),       // timers / 50 (debounce, gaps, back-off, watchdog) - the mock server's clock must move the same way
    clock(fn),      // Date.now replacement for clStep / mt (the mock server's clock), null = real
    click(), signOut(force), push(), open: () => clOpenOutside(),   // what the button / a flush would do
    slot: clSlot, doc: clDoc, agg: clAgg, mine: clMine, adopt: clAdopt, step: clStep, dirty: clDirty,  // the pure parts
  };
```

---

## 12. Edge cases

| Case | Behaviour |
|---|---|
| No `firebase.config.json` | deploy page without `PG_CLOUD`; `CLOUD.on` false; nothing visible; today's behaviour |
| Signed in, opened offline | the linked view works at once (local store); SDK load fails → mark 'wait'; `online` → load, listen, push |
| Two devices play at once | each pushes its own slot; both views converge on the sum; a 2 s doc-level collision retries |
| Same account in one battle from two devices | same `dev` → q 2 (연습 경기) for everyone, nothing changes |
| A device offline for days | its changes push on return in rate-capped parts; other devices' changes meanwhile are kept |
| Tab closed during a push | the record still says dirty; the next load re-sends the same absolute values |
| Two tabs push the same slot | `n` reserved in the shared record; a duplicate `n` is refused by the rules |
| Debt (two devices of one account lose more than it had) | the view shows 0; later gains pay it first |
| Day changes | `clAdopt` takes `max(S.day, today)`; other devices' bonus of today counts against the cap |
| Sign-in while another tab holds trophies | 'held' until the holds end |
| Sign-in in a room (another tab) | the view changes under the room; `dev` waits until `NET.sess` ends |
| Another tab signs out | the store event brings back this browser's own store here too (`'out'`) |
| Auth session lost, store still linked | `'relog'`: play keeps adding to mine; same account later → pushed; another account → put away first |
| The owner deletes a player doc | the next snapshot (from the server) sees it missing → recreated from the view |
| A newer page wrote `v: 2` | `'newer'`: no writes, message to reload |
| 17th browser | fold the oldest slot idle > 8 days; none → 'full', local only |
| Private window | links like any browser; its slot folds away a week after it was last used |
| itch.io frame, storage partitioned | sign-in may work (partitioned under itch.io) or fail → 새 창에서 열기 → the game's own site (`home`) |
| KakaoTalk link | 'inapp' → opens the external browser via `kakaotalk://web/openExternal` |
| `<id>.web.app` | first visit hops to `<id>.firebaseapp.com`; a browser with web.app trophies stays and signs in with the popup |
| The same Google account signed in on the artifact | impossible: the artifact has no cloud; its trophies stay in its own storage |

---

## 13. Test plan

### 13.1 The mock (`FakeFirebase`, in `src/tests/cloud.js`; shared by frames through `window.top.__pgFake`)

The subset of compat the code uses, nothing more:

- `fb.SDK_VERSION` (= `'12.19.0'`), `fb.apps`, `fb.app()`, `fb.initializeApp(cfg)` → `app.auth()`, `app.firestore()`;
  `fb.auth.GoogleAuthProvider` (`setCustomParameters`); `fb.firestore.FieldValue.serverTimestamp()` / `.delete()`
  (sentinels).
- auth: `languageCode`, `currentUser`, `onAuthStateChanged(next, err) → unsub`, `signInWithPopup(p)`,
  `signInWithRedirect(p)`, `getRedirectResult()`, `signOut()`. Sessions persist per profile (the frame's ns), so a
  frame reload stays signed in. The user object has `uid`, and **getters** for `email`, `displayName`, `photoURL`,
  `providerData` that count reads (must stay 0).
- firestore: `collection('players').doc(uid)` → `get()`, `set()`, `update()` (dotted field paths, `delete()` sentinel),
  `onSnapshot(opts, next, err)` with `{exists, data(opts), metadata: {hasPendingWrites, fromCache}}`;
  `runTransaction(fn)` with `tx.get/set/update`; timestamps with `toMillis()`.
- Backend: one doc store, a server clock (`tick(ms)`), `setOnline(profile, bool)` (offline: writes queue and resolve on
  return, each validated at its own flush time; listeners pause), `failNext(op, code)` for `popup`, `redirect`, `load`,
  `get`, `set`, `update`, `tx`, `snapshot`, a write log `{uid, data, ok, code}`, and **`rules(old, new, now)`: a JS port of
  firestore.rules, function by function** (keep it next to a comment naming the rules file; any rules change updates it).
  Latency compensation: a write fires local listeners at once with `hasPendingWrites: true`, then the server version.

### 13.2 `src/tests/cloud.js` (rt, http via `tools/serve.js`; prints "CLOUD PASS|FAIL …", "CLOUD DONE pass=N fail=M")

1. **Inert** (this artifact-skeleton page before `start()`): `CLOUD.on` false; `#pg-cloud`, `#pg-cloud-btn`,
   `#pg-tro-cloud` hidden; no `<script>` with "firebase" in its src; no `ppogeul-cloud*` / `ppogeul-guest*` keys; the
   trophy JSON has no `cs` key; `#pg-fontwarm` lacks "구글로 로그인"; `openRec()` loads nothing.
2. **Pure**: the simulation's cases through `PG.debug.cloud.{agg, mine, adopt, step}`: concurrent ±, a device offline
   for 3 battles, +164 right after a write goes in parts and all arrives, adopting twice is a no-op, a stale `n`
   refused, debt kept (view 0, later gain pays), day change and the shared cap, fold → start over without double count;
   `clDoc` on hostile docs (wrong types, 40 slots, bad keys, `v: 2`, huge numbers) never throws and clamps.
3. **Deploy fixture** (`http://localhost:8765/deploy-cloud/` in an iframe): boots with `CLOUD.on`, `'out'`; no script
   element / resource entry for firebase at boot; `use(mock)` then `openRec()` → parts app+auth loaded, firestore not;
   the hop did not run (localhost).
4. **Sign-in, upload**: fresh store `t: 77` → `click()` → doc created: one slot t 77, n 1, dev = the store's, nick
   only when not default; `cs` set; message 'up'; badge mark plain; user getters read 0 times; the doc passes `rules`.
5. **Cloud wins**: backend doc for `u2` with sum 120, local 150 → sign in → view 120, `ppogeul-guest` holds 150,
   message 'swap' with 120 and 150, `S.dev` = the doc's; then sign out → view 150, guest key empty, message 'out'.
6. **Push**: `tro.set({t: S.t + 15})` → after the debounce one `update` with absolute values; nothing more without
   changes; `tro.hold(…)` → no push while open; `tro.close(…)` → pushed; `saveHi()` with a higher score → soft push
   (60 s, `fast`).
7. **Two devices** (frames `a`, `b`, own ns, same uid): `a` +10 → `b` adopts; both change within 2 s → one refused,
   retried, sum exact; `tro.devHash('ab12')` equal on both.
8. **Offline**: `setOnline('b', false)`; `b` +30, `a` +10; back online → views equal the sum (40 + base).
9. **Tab death**: a push in flight, the frame reloads before the ack (the backend drops it) → after reload still dirty
   → one write → no double count.
10. **Two tabs, one browser** (frames sharing one ns): a change in one → at most two writes, the second refused or a
    no-op; the other tab's badge follows via `storage`.
11. **Fold**: 16 slots, one 9 days idle → a new browser's first write folds it (exact sums) then writes its slot.
12. **Failures**: popup-blocked with `same: false` → 'popup', `'out'`; with `same: true` → redirect recorded, `meta.rd`
    set; `reboot()` with a redirect result → linked and 내 기록 open with its message; popup-closed → 'cancel'; framed +
    `web-storage-unsupported` → `'frame'`, button "새 창에서 열기", `open()` targets `home`; `env({inApp: true, kakao:
    true})` → `'inapp'`, the kakaotalk URL; `unauthorized-domain` → 'domain' with the hostname; `load` failure → 'sdk'
    then a retry works; `permission-denied` on push → `fails` 1, `holdUntil` ≥ +5 s; `resource-exhausted` → 'quota'; a
    `v: 2` doc → `'newer'`, no writes; `TRO.mem` → `'nostore'`. No console error or warning anywhere.
13. **Relog**: backend drops the session, reload → `'relog'`, view kept; `tro.set` → mine grows; sign in again (same
    uid) → pushed; another uid → guest back, then the new account's link.
14. **UI**: at 256x224 1x, 2x and 320x568, in `'out'`, `'in'` and `'relog'`: `.pg-rec-card` has
    `scrollHeight ≤ clientHeight`, the button row is one line, `#pg-cloud` is one line; with the cloud mark (and the
    install pill shown) the title card still fits and the badge shares the `.pg-best` line at ≥ 23em; Enter on a focused
    `#pg-cloud-btn` signs in and does not close the card; Escape closes.
15. **Fonts**: every visible cloud string's syllables are in `#pg-fontwarm` when `CLOUD.on`.

### 13.3 `tools/check-cloud.js` (node, static; in run-all)

The build checks of 3.2 again on the files: dist has none of the Firebase strings; `deploy/index.html` matches the
presence of `firebase.config.json`; the fixture page has one `window.PG_CLOUD=`, the three exact URLs and integrity
strings, the hop, exactly one static `<script src>`; `deploy/sw.js`'s CDN list has the SDK URLs only with a config.
`--net` (manual, not in run-all): download the three URLs and both CDNs and verify the integrity strings.

### 13.4 run-all

Add `cloud` (rt, http, `doneZero('CLOUD')`) and `check-cloud` (node). Re-run everything: the trophy, page-fit and
phone tests must pass unchanged (the artifact pages have the hidden markup only).

### 13.5 Rules (before the first real deploy; manual, Rules Playground or emulator)

Owner get ok / other uid refused / list refused; create with 1 slot ok, with 2 slots or `n: 2` or `t: -1` refused;
slot step +164 after 120 s ok, +251 refused, +100 after 5 s refused (20 + 10 = 30), n not increased refused, 1 s after
the previous doc write refused; new slot `t: 250` ok, `t: 251` refused; fold of a 7-day-old slot with exact sums ok, off
by one refused, a 6-day-old slot refused; nick of 12 Korean syllables ok, 25 characters refused; a changed `dev`
refused; delete by owner ok.

### 13.6 Screenshots (look with Read)

내 기록 signed out (privacy line), signed in, a 2-line message, `'frame'`; the title badge with the cloud mark (plain
and wait) at 1x, 2x and on a 320 px phone.

### 13.7 With a real project (after FIREBASE-SETUP.md)

PC Chrome popup; phone Chrome and iPhone Safari popup; the installed app on iPhone and Android (redirect on
firebaseapp.com); a second device sees the count within seconds; airplane mode → solo bonus → back online → it arrives;
itch.io page: sign in or 새 창에서 열기; KakaoTalk link → 다른 브라우저로 열기.

---

## 14. Integrity: what each party can do

| Who | Can | Cannot |
|---|---|---|
| Another signed-in player | nothing with my doc | read or write it (owner-only rules) |
| Me with devtools | raise my own count (~12/s per slot writing every 2 s, +250 per new slot, up to 16 slots); upload an edited local store at first sign-in (≤ 99999) | change anyone else's count; delete my doc to start it again; inflate the archive; write outside my doc |
| A hostile host in a battle | what trophies.md 13 says (my hold at most) | anything in the cloud: results reach the cloud only through my own client's store |
| Anyone | exhaust the project's free daily writes by many accounts | get the project billed (Spark has no billing) |

---

## 15. Files touched (implementation checklist)

- **build.js**: `FIREBASE_V`, `FIREBASE_SDK`, `fbUrl`, `fbAlt`, `readFirebaseConfig` (lenient, validated), `fbData`,
  `FB_HOP`, `fbTag` in `deployOf()` (after `pg-build`, before `SW_REG`), the SDK URLs in `CDN` with a config, the checks
  of 3.2, the fixture page `C:/Temp/bogeul/deploy-cloud/index.html`, `.firebaserc` fill-in, the console line; header
  comment lines for the new outputs.
- **src/game.js**:
  - Top constants: `CLOUD_TEXT`; one shared in-app UA regex `IN_APP_RE` (used by `pwaInit` too).
  - `troParse` keeps a valid `cs` (`clParseCs`); `troSync` → `clKick()`; `saveHi` → `clKick()`; the `storage` listener →
    `clStore()`; `syncTroBadge` → `clBadge()`; `fillRec` → `clUI()`; `openRec` → warm-up; `onKeyDown` 'rec' branch
    (9.3); `netSetNick` → a nick write when linked; `boot` → `clBoot()` after `troLoad()`; `stopEngine` → `clStop()`;
    `visibilitychange` / `pagehide` → `clFlush()`; `online` → `clKick()` and retries; `PG.debug.tro.ns` → `clBoot()`.
  - A new section `// ---- cloud trophies (STANDALONE deploy + firebase.config.json only)` after the trophy section:
    `CLOUD`, constants (`CL_V 1, CL_MAXS 16, CL_RISE 250, CL_GAP_MS 2500, CL_PUSH_MS 4000, CL_PUSH_MAX_MS 20000,
    CL_SOFT_MS 60000, CL_SDK_MS 20000, CL_LINK_MS 15000, CL_FOLD_MS 8 d, CL_MSG_MS 8000, CL_RD_MS 10 min, CL_WATCH_MS
    120000, CL_BACKOFF, CL_QUOTA_MS 1 h, CL_KEY_RE, CL_UID_RE`), `clInit`, keys, `clParseCs`, the pure functions (6.2),
    loader (2.2), env / method / auth (4), link / push / adopt / unlink / recreate / fold (6), UI (9), `PG.debug.cloud`.
  - Small helpers named above: `clSfx()`, `clMetaKey()` (`'ppogeul-cloud' + sfx`: `{rd}` only), `clGuestKey()`
    (`'ppogeul-guest' + sfx`: a trophy store JSON or ''); `clNewKey()` = a random letter + `troRand(7)`; `clUpload(S)` (the
    created slot: t, min(w, g), g, ko, max(best, t), bl, seen, `G.hiscore`, day, de, n 1); `clNickOut()` (the local nick
    unless it is the default `/^손님\d{2}$/`, else ''); `clNickIn(D)` (default local nick → `D.nick` via `sset('ppogeul-nick')`
    and `NET.nick`); `clHiIn(D)` (max slot `hi` above `G.hiscore` → `G.hiscore`, `sset('ppogeul-hiscore')`, `#pg-title-hi`);
    a nick write on `netSetNick` when linked: `ref.update({ nick, updatedAt })` after the 2 s doc gap, errors ignored;
    `clStore()` (6.8), `clFlush()` (6.4), `clStop()` (6.8), `clSet(st)` / `clMsg(key, …)` / `clUI()` / `clBadge()` (9.3),
    `clOpenOutside()` (4.1), `clAuthFail(e)` (4.3), `clSnapErr(e)` (6.5), `clRecreate()` (6.6).
- **src/page.html**: the markup of 9.1, the CSS of 9.2.
- **src/tests/cloud.js** (13.1, 13.2), **tools/check-cloud.js** (13.3), **tools/run-all.js** (13.4).
- Done here: `firebase/firestore.rules`, `firebase/firebase.json`, `firebase/.firebaserc`, `FIREBASE-SETUP.md`.

---

## 16. As built (2026-10-16): differences from the text above

Everything above is implemented (game.js section "v4 cloud trophies", page.html, build.js, tools/fb-config.js) and
tested (13). Where the code differs, it is on purpose:

| Topic | The text said | As built, and why |
|---|---|---|
| The page global | `window.PG_FIREBASE` | `window.PG_CLOUD = { v, ns: 'firebase', cfg, home, sdk }`. game.js reads the SDK's global as `window[ns]` and names no SDK, host or URL at all, so the artifact (`dist/ppogeul-bath.html`) contains **not even the word "firebase"**: build.js throws on `/firebase\|PG_CLOUD\s*=\|\/__\/auth/i` in it, and tools/check-cloud.js checks it again. (The section-1 regexes on host names would also have tripped check-pages' "no CDN reference in the artifact".) clInit accepts any `https://….js` URL with a `sha384/512-` hash; build.js and check-cloud pin the exact URLs and hashes. |
| 'setup' text | "… · Firebase 설정을 확인해 주세요" | "로그인이 아직 준비되지 않았어요 · 설정을 확인해 주세요" (the same reason; FIREBASE-SETUP.md 10 maps it). |
| clDirty | hard when t/w/g/ko/de or (de > 0 and the day) differ; soft otherwise | hard when t/w/g/ko differ, or today's bonus does (same day: de differs; a new day: de > 0). A day change alone (yesterday's bonus on the server counts for nobody) is clean, and **a slot never written is clean until a count changes** - the formula as written made every join write a zero slot at once (its day and bests differ from `clZero()`), against 6.3's "writes nothing until its first change" and 6.7's "make a slot once they change something". Bests of such a browser ride along with its first count. |
| Sign-out with unsaved trophies | `confirmTwice` with the long text as the button label | push now, wait up to 4 s; still unsaved -> the status line says "저장 안 된 트로피가 있어요 · 한 번 더 누르면 로그아웃" (a message) and a second tap within 8 s signs out. The label stays 로그아웃 (the long text does not fit a button in the row). |
| Busy button | `disabled` | `aria-disabled="true"` + `aria-busy` (a disabled button drops the focus; 9.3 wants it kept). Taps on it are ignored. |
| 'newer' at the first sign-in | a message | the line keeps saying it while signed out of a newer page's record (CLOUD.newer), not just for 8 s. |
| A new sign-in tap | - | clears the previous attempt's message (a stale "로그인을 취소했어요" no longer covers the new state's line). |
| The nick | its own write after the 2 s gap | rides along with a slot write when there is one; alone, it waits 2.5 s after this browser's last acknowledged write (one write per 2 s per document), with the count timing (4 s). |
| clBoot | right after `troLoad()` | right after `setupDOM()` / `toTitle()` (its state needs the DOM; nothing runs in between). |
| The status line | flex row, icon apart | a block with the icon inline at the start: a 2-line message keeps the mark beside its first words. |
| Narrow title badge | - | with the mark shown, `.pg-tro.has-cloud` gets slimmer gaps / padding / mark under 30em: a 7-digit best score at exactly 1x (23.3em) otherwise pushed the badge off the 최고 점수 line and made the title card scroll (measured: 17.52em needed of 17.01em; now 16.84em). |
| SDK logging | - | `firebase.setLogLevel('error')` once (an offline phone is not worth a warning on every start). |
| Worker warm-up | PeerJS refetched at the first `controllerchange` | every `script[src][integrity]` the page has by then (the SDK files of a linked page too). |
| Config reader | in build.js | `tools/fb-config.js` (`readFirebaseConfig`, `fbCheck`, `parseConfigText`), required by build.js, so check-cloud can test it; also reads UTF-16 (Notepad "Unicode") files. `PG_FIREBASE_CONFIG` leaves `.firebaserc` alone; `PG_BUILD_TEMP=<dir>` sends every C:/Temp output elsewhere (check-cloud builds a copy that way). |
| Fixtures | `deploy-cloud/` | also `deploy-nocfg/` (the deploy without a config, for 13.2's "no login UI, no SDK request"). The fixture's head has a test hook: inside a frame of the test page it hands the SDK `<script>` tags game.js makes to `window.parent.__pgFake` - game.js's real loader, SRI attributes and fallback run, nothing is downloaded. (`use(mock)` exists as well.) |
| `tro.reset()` | - | also drops `cs` (the next sign-in event links again: cloud wins). |
| Debug API | 11 | also `load(part)`, `kick()`, `outside()` (the URL 새 창에서 열기 / 다른 브라우저로 열기 would open), `nick(n)`, `texts()`, `buttons()`, `parseCs`, `zero`; `state()` adds `line`, `btn`, `mark`, `guest`, `meta`, `live`, `listening`, `err`, `now`. |
| Leaderboard | no (section 8) | not built. |

Tests (all in run-all): `cloud` (src/tests/cloud.js, real time over http, 17 groups, 179 checks: the fake SDK with
a JS port of firestore.rules, the deploy-cloud fixture in frames), `check-cloud` (tools/check-cloud.js, 53 checks;
`--net` downloads the six SDK files and checks their hashes - all match), 13 screenshot jobs `cloud-*` (C:/Temp/bogeul/
cloud-*.png). Manual, needs the internet: `tools/cloud-sdk-probe.js` runs the fixture top-level against the REAL
12.19.0 compat files from cdnjs - they pass SRI, every call game.js makes exists with the expected shape, `languageCode`
is 'ko', and a headless popup comes back as 'auth/popup-blocked' -> "팝업이 막혔어요 · 한 번 더 눌러 주세요", with no
console error. Still to do with a real project: 13.5 (rules in the console's Rules Playground) and 13.7.


## 17. Review fixes (2026-10-16, second pass)

A review found 16 issues; all were confirmed (the reviewers' scenarios reproduce on the first build) and fixed. Each
fix has a regression test in `src/tests/cloud.js` (groups 12-14 and the new 13b-13d) or `src/tests/mp-local.js`.

| # | Issue | Fix |
|---|---|---|
| 1 (high) | itch.io serves every HTML game from one origin (html-classic.itch.zone); the guide authorized it and the game signed in from inside the itch frame, so Firebase's stored session (uid, mail, name, refresh token) was readable by every itch game, and any itch game could open this project's sign-in | **No sign-in in a frame, on a shared host or in a page built for one.** `clHere()` = not framed, host not in `PG_CLOUD.shared` (build.js `SHARED_HOSTS`: itch.zone, itch.io, hwcdn.net, ungrounded.net), not `PG_CLOUD.away`. `clMethod()` → `'frame'` there; `clBoot` enters it at once (nothing loads); 새 창에서 열기 goes to `home` only (`clOutsideUrl` never offers a frame's / shared host's own URL; no `home` → button hidden, "이 화면에서는 구글 로그인을 쓸 수 없어요"). `tools/pack-itch.js itchPage()`: the itch zip's page gets `away: 1` (with `home`) or no `PG_CLOUD` at all (without). FIREBASE-SETUP.md: itch.zone removed from the authorized domains, a warning never to authorize shared hosts, 8-C rewritten. |
| 2 | a first upload whose answer came after the 15 s deadline (or was lost with the tab) made the retry join over it: the trophies ended up in the account AND back on the device after sign-out | The slot key is taken before the transaction and kept in the meta record (`ppogeul-cloud` {pk, pu}, `clPending`) until a link is done; a document that already holds that key is this browser's own upload → finished as uploaded (`clLinkDone`: cs with k = pk, c = v = the slot's counts, so mine = the whole store; guest key cleared; message 'up'). The transaction is not abandoned at the deadline either: its late answer still links. |
| 3 | signing in with another account while in 'relog' dropped the first account's unsaved trophies | The other account's copy is **parked** (`ppogeul-park` {uid: {at, s}}, newest 4, `clPark`) instead of dropped; that account's next sign-in here restores it (`clRestore`, before any upload / join) and the push sends the rest into its own slot (no new slot). |
| 4 | a hold opened in another tab during a join / unlink was copied, dropped or refunded wrongly | Every store swap re-checks `S.esc` inside its own `troMut` (`clLinkDone`'s join, `clUnlink`, `clRestore`): a hold → nothing changes, message 'held' (the next tap goes on). `clUnlink` returns false then; sign-out stays signed in. |
| 5 | `allow delete` let a player delete and recreate the document at any count; the docs claimed "a count never jumps" and ~2/s | `allow delete: if false` (the owner deletes in the console; `clRecreate` still handles a deleted doc). The rate formula is unchanged (20 + 2/s per write, the client mirrors it); the rules header, section 7, section 14 and FIREBASE-SETUP 11 now state the real bounds: ~12/s per slot writing every 2 s, +250 per new slot, the first upload as the store is. |
| 6 | a sign-in finished after the 2-minute watch was not linked; a second tap's new popup was undone by the old popup's `auth/cancelled-popup-request` | The watch no longer forgets the ask: `CLOUD.askAt` - a user arriving within 10 min of this tab's tap links (`clAuthIn`). `auth/cancelled-popup-request` = a newer popup of this tab replaced it: ignored entirely. |
| 7 | 'auth' showed a dead "로그인 중…" for 2 min with the privacy line | 'auth' by popup: line "구글 창에서 로그인을 마쳐 주세요", button **다시 열기** (tappable 1.5 s after the popup opened: the popup again). The watch (`clWatch`) is 2 min from the tap but only 20 s once the page is visible / focused again (`clBack`), and says so: 'late' "로그인을 마치지 못했어요 · 다시 눌러 주세요". |
| 8 | a frame with refused storage dead-ended on 'nostore' | Covered by 1 ('frame' comes before 'nostore'); its line there: "새 창에서 열면 기록이 저장되고 로그인도 돼요"; 내 기록's note says "이 화면에서는 기록이 저장되지 않아요" (not the browser's fault). |
| 9 | a sandboxed frame repeated "팝업이 막혔어요" | Covered by 1 (a frame never opens a popup). |
| 10 | 내 기록 scrolled 6 px at 390x844 with a new player's 2-line note and a 2-line line | `.pg-sa .pg-rec-card.has-cloud .pg-rec-ladder` hides from 25.5em (the rest of the compaction stays at 24.5em). Checked at 390x763 / 360x756 / 412x891 frames for every 2-part line and message with both button labels. |
| 11 | 2-line lines broke mid-phrase | `clLineTxt`: each ' · ' part is an inline-block `.pg-cloud-c` (the pixel cloud inside the first): breaks fall after '·'. |
| 12 | 'relog' looked like "waiting" | badge mark `is-err` (pink) and aria " · 다시 로그인해 주세요" (an `is-err` 'in' says " · 지금은 저장할 수 없어요"). |
| 13 | signed-out 내 기록 never said what login is for; in-app browsers first offered 구글로 로그인 | the 'out' line is 'pitch' "로그인하면 다른 기기에서도 트로피가 이어져요 · 구글 계정 이름·메일은 저장하지 않아요" (the privacy line merged in); `clBoot` enters 'inapp' at once (unless the store is linked). |
| 14 | the first sign-in into an existing account read as if the device's trophies were replaced, for 8 s only | 'swap' reworded: "구글 계정의 트로피 {0}개예요 · 이 기기의 {1}개는 로그아웃하면 다시 보여요", kept until 내 기록 closes (`CL_KEEP`, `clRecShut`). FIREBASE-SETUP 11: sign in first on the device with the most trophies. (Cloud wins stays the rule.) |
| 15 | 320 px Android: the fullscreen button cut the name | `@media (max-width: 340px)`: the deploy's header gaps 6 / 5 / 5 px (the 44 px buttons keep their size). |
| 16 | 로비로 reopened the friends panel at its old scroll | `showOverlay`: an online panel ('friends' / 'room') opened from another overlay starts at scrollTop 0; a re-render while open keeps its scroll. |

New states / texts: `CL_TX` gains pitch, authing, linking, late, framens, frame0 (privacy is gone: merged into pitch);
`CL_BTN.again` 다시 열기; `CL_NOTE`. Debug API: `state()` adds `pop`, `here`, `park`; `site({home, away})`, `say(key, a, b)`;
`env()` takes `shared`. The test frames of `src/tests/cloud.js` play top-level tabs (`env({})` at boot), since a real
frame no longer signs in.

### 17.1 Third pass (2026-10-16): re-checked against the code, suite fixes

Each of the 16 fixes above was re-read in the current code and its regression test re-run (all present; nothing was
left half-done in game.js / page.html / firestore.rules / FIREBASE-SETUP.md / pack-itch.js). Fixed around them:
`tools/pwa-check.js` declared `want` twice in `fileChecks` (the itch-zip byte check added in the second pass): the whole
pwa job died at load - renamed `itchForm`. `tools/run-chrome.js`, `cdp-run.js`, `pwa-check.js`: a real-time run could
fail at once with "fetch failed" when its pid-named Chrome profile was left over from a killed run (Windows reuses pids)
and still held an old `DevToolsActivePort` - the runner now clears its own profile before starting Chrome. The cloud
shots wait for the frame's `document.fonts.ready` (a fresh profile per shot sometimes caught the fallback face).
Outside the cloud: `src/net.js` TUNE.room.findMs is 12000 (a named room's host presence can take seconds to arrive on
claude.ai); the room's find wait now also ends 1 s before the join's own 15 s deadline, so a wrong code on a slowly
connecting room says 방을 찾을 수 없어요 rather than the timeout's 연결이 끊겼어요 (tools/net-node-test.js testRoomSlowHost).

## 17. As built (login screen, 2026-10-20)

- A login screen before the title on the deploy with the cloud on (and on a PR preview, its Google button off). game.js
  makes it (`lgSetupDOM`: `#pg-login`, an overlay like the others - the artifact's markup and behaviour are unchanged,
  `lgOn()` is false there). Shown at load (`lgBoot`, after `clBoot`) when the store is not linked, `ppogeul-login` (+ test
  namespace; a preview's Storage adds `@pr<n>`) is not `'1'`, there is no invite link (`?join=CODE`: straight to 친구와 하기),
  storage works and the page is not read-only, and the cloud's state offers something: `out`, `auth` (a redirect coming
  back), `inapp`, or `frame` with an outside address (`frame0` / `nostore`: no screen).
- The title's logo (cloned), "트로피·코인·아이템을 구글 계정에 저장해서 폰과 PC에서 이어서 해요", 구글로 시작하기
  (`clClick`: popup / redirect / 다시 열기 / busy labels / 새 창에서 열기 / 다른 브라우저로 열기 - hidden when there is no
  way out), 로그인 없이 하기, and one line that follows `clUI` (the cloud's messages and state lines; else
  "구글 계정 이름·메일은 저장하지 않아요 · 로그인은 내 기록에서도 할 수 있어요"). It warms the SDK as 내 기록 does.
- Linked (`'in'` with `cs`, also by another tab) -> the title; the link's message waits for 내 기록 as before; a redirect
  coming back still opens 내 기록 (`clRecOpen` defers it). 로그인 없이 하기 stores `'1'` and clears an unseen failure.
- **Decision:** signing out (내 기록) returns to the title as before and does not set the guest choice, so a browser that
  signed in from the screen and later signed out sees the screen again at its next load (one tap past it); a guest who
  chose 로그인 없이 하기 never sees it again in that browser (sign-in stays in 내 기록).
- Input: no game key acts behind it (`primaryAction` returns; Enter / Space press the focused button, arrows move between
  the two, M mutes); focus starts on 구글로 시작하기 (the preview: 로그인 없이 하기). Region labelled by its heading, the
  Google button described by the why line and the live status line.
- Preview: build.js's preview head sets `window.PG_PREVIEW`; the fixture `deploy-preview/` (PR 999) is built for tests.
  pwa-check and the peer-deploy frame page seed `ppogeul-login = '1'` (they test the title).
- Tests: cloud.js `loginTests` (at load, keys, popup sign-in -> title + message, sign-out stays on the title, a blocked
  popup said there, guest remembered over a reload, the popup left open, redirect and its return, KakaoTalk / iOS
  in-app, a real frame, no config, the preview). Shots `cloud-login-320|390|844|1x`, `cloud-login-pv-390` (each checks the
  card fits without scrolling, no clipped label, 44 px targets on phones, a status line of <= 2 lines).
