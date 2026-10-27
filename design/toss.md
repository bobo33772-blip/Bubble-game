# 뽀득뽀득 목욕탕: 앱인토스 (Apps in Toss) v1 — design spec

Status: **spec only** (2026-10-27, `feat/toss`); nothing is built yet. The goal of v1 is one thing: a working
`ppodeuk-bath.ait` that the owner uploads in the Apps in Toss console and opens with **토스앱 테스트** (the QR code) on
real phones. Review (검토 요청), the GRAC rating (게임물 등급분류) and the store listing come later and are researched
separately. Code is referenced by function name and section, never by line number (`src/game.js` changes all the
time). Every function named here exists today unless it is marked **new**.

The owner's decisions (2026-10-27), which this spec builds on:
1. The first Toss version has **online play by the game key**. `getUserKeyForGame()`'s hash is the Toss player's
   identity, and the online rooms (같이 하기, 배틀, 파티, by room code over PeerJS + TURN) are open to any Toss player
   who has a key. **No trophy stakes in the Toss build**: battles and parties there are friendly matches (친선 경기).
   **No Google login anywhere** in the Toss build. **No server and no 사업자**, so there is no Toss login, no IAP and
   no ads.
2. The first goal is a working .ait for the console's 토스앱 테스트 QR.

Sources: the colleagues' research notes of 2026-10-27 (three agents: packaging, policy, WebView), summarised where
they are used in 1.2, and the SDK's own type file `@apps-in-toss/web-framework@3.9.0/dist/index.d.ts` (its exports
were checked on 2026-10-27). **UNCONFIRMED** marks anything no document or type file settles. Those items are listed
again in 15.6 as things the QR test must answer.

---

## 0. Decisions in one table

| Question | Decision |
|---|---|
| Build target | `node build.js --toss` (also `PG_TOSS=1`) writes a **Toss variant of the deploy page** into the new Vite project `toss/`: `toss/index.html` plus the five engine files as `toss/public/pg/*.js`. In `toss/`, `npm run build` runs the page build, then `vite build`, the bundle check, `ait build` and the check again, and ends with `toss/ppodeuk-bath.ait` (2). |
| SDK hand-off | `toss/src/main.js` imports the SDK, PeerJS and the fonts, then calls `PG.Ait.boot(SDK)` from the **new** plain file `src/ait.js`. That function reads native Storage into localStorage (at most 3 s), locks landscape, sets the Safe Area CSS variables, sets `window.PG_AIT` (a small bridge, 2.4) and only **then** loads the five engine files in order. The engine never imports anything. |
| CDNs | None at run time. PeerJS comes from npm (`peerjs@1.5.4`, the same version as the deploy). The two Google Fonts come from npm `@fontsource/*` and are emitted into `dist/assets`. TURN uses the same `turn.config.json` the deploy uses, inlined as `window.PG_PEER_OPTIONS`. Firebase is not in the Toss build at all. |
| Removed | Service worker and its registration, manifest and app metas, the 앱으로 설치 pill and the fullscreen button (both already disappear without a manifest link), the `FB_HOP` `location.replace`, `PG_CLOUD`, the Google Fonts links, the PeerJS CDN tag, the "open outside" links (`intent://`, `kakaotalk://`), and the Google sign-in calls (cut from the Toss copy of game.js, 2.2). |
| Online gate | **손님은 온라인 불가** (Google sign-in) is replaced by a **game-key gate**: `netGated()` is true in Toss while `AIT.hash` is empty. The friends panel then shows a card without any login button (4.2). |
| Identity uses | (1) the online gate; (2) the room's same-player check: `troDevHash` hashes the game key instead of the store's random `dev`, so the same Toss account in one room twice is a practice match (`NET.q === 2`, no coins); (3) through (2), the coin rules of friendly matches. The key is never shown, sent, logged or stored as it is (4.5). |
| Trophies | **Off for online battles and parties**: no 트로피 걸기, no place points, no +5, no holds and no results. Every switch is `AIT.on` at one of nine named sites (5). The 목욕 보너스 (solo and co-op progress, nobody loses anything) stays, so leagues and the shop's league locks still work. |
| Cloud, friends, invites | **Dropped for v1. The Toss build is Firestore-free.** No `PG_CLOUD`, so `CLOUD.on` is false and 친구 순위, 친구 초대 and cloud saves are inert as on a deploy without config. Firebase anonymous auth was considered and rejected (6). |
| Leaderboard | Best **solo run score** (from 탕 1, offline solo, not the demo). It is submitted when the 목욕 끝 / ending card shows, only when it beats the last accepted score. Before the console approves the app info the call answers `LEADERBOARD_NOT_FOUND`, and the score is kept for the next run end. **토스 랭킹** in 내 기록 appears after the first success (7). |
| Storage | localStorage stays the engine's synchronous working copy. A wrapper on `Storage.prototype` (the PR preview's technique) mirrors every `ppogeul-*` write to the native `Storage`. A write sequence number decides which side is newer at boot. Flushes happen 2 s after the last write and at once when the page hides (8). |
| Screen | `Screen.setOrientation({type:'landscape'})` at boot. The rotate screen stays as the fallback for old Toss apps. Portrait is restored on `pagehide`. The Safe Area comes from `SafeAreaInsets` into `--sa-t/r/b/l` (all of page.html's `env(safe-area-inset-*)` uses become these variables; elsewhere they still equal `env()`). The game's header buttons stay out of a box reserved for the nav bar's 더보기 / X (9). |
| Sound | The existing sound button and M key. **New** `PG.Audio.hold(on)` silences at once (gain 0, then `suspend`) on `visibilitychange` hidden, `pagehide`, the SDK's overlay-visibility event and before the leaderboard opens. The iOS silent switch is respected (no `audioSession` change) (10). |
| Exit | The game nav bar's X with its automatic exit modal (SDK >= 2.9.2; we ship 3.9.0). Android back goes back on every screen. At the bare title the listener is removed, so Toss's own back exits. iOS swipe back is off only while a game runs (11). |
| Analytics | No `init` export exists in 3.9.0. "Analytics init" is the bridge's first `Analytics.screen({log_name:'title'})`, and then one screen log per overlay change, with no personal data (12). |
| Eval scanner | Today the five engine files contain 0 `eval(`, 0 `new Function` and 0 string timers (13). `tools/check-toss.js` (**new**) scans the built `dist/` for a list of banned patterns and for every external host; any match fails the build. |
| Rooms | The Toss build uses its **own PeerJS id prefix** (`ppodeuk-t-`), so Toss rooms and web rooms never meet: the web deploy has stakes and Google accounts, Toss has friendly matches and game keys. Joining is by code only (PeerJS has no 열린 방 lobby today either). 코드 복사 copies the code and a how-to line, never a URL (3). |
| Out of scope | Toss login (`appLogin`, needs 사업자 + a server + mTLS), IAP, ads, Toss share links (`getTossShareLink` only works after launch), haptics, cloud saves, 친구 순위 and invites, the GRAC rating, the console listing and review (17). |

---

## 1. Ground truth

### 1.1 From the code (what this builds on)

| Thing | Code | Consequence for Toss |
|---|---|---|
| Boot | `game.js` ends with `boot()`, called at once (no `window.claude` outside the artifact): `troLoad()` (reads `ppogeul-trophy`), `setupDOM()`, `toTitle()`, `clBoot()`, `lgBoot()`. Nothing waits. | Whatever must exist at boot (the bridge, the restored storage, `window.Peer`) has to be in place **before the script runs**. So `src/ait.js` loads the engine files itself, after its own async steps. |
| Build | `build.js` concatenates `ORDER = [sprites, levels, audio, net, game]` into inline `<script>`s. `deployOf()` adds the head (PeerJS CDN with SRI, `SW_REG`, manifest, app metas, `PG_PEER_OPTIONS`, `PG_CLOUD` + `FB_HOP` when `firebase.config.json` exists). `previewOf()` is the precedent for a variant: checked `swap()`s that throw when their anchor is missing. | `tossOf()` (**new**) is built the same way, from the same parts, with checked swaps. |
| Storage | `sget` / `sset` (try/catch around `localStorage`). `audio.js` reads and writes `ppogeul-muted` directly. Keys: `ppogeul-trophy` (the whole progress: trophies, coins, items, looks, gacha: `troParse`, v 5), `-hiscore`, `-nick`, `-char`, `-stage`, `-muted`, `-kit-*`, `-login`, `-cloud`, `-guest`, `-park`, `-pal-mute`. `troMut` does read, change, write on every change. | The mirror sits **under** localStorage (a `Storage.prototype` wrapper, like `PV_STORE` in `build.js`). No engine call site changes. |
| Cloud | `clInit` turns `CLOUD.on` on only for a valid `window.PG_CLOUD`. Every cloud, 친구 순위 (`PAL`) and 친구 초대 (`IV`) hook returns at once without it. `lgOn() = CLOUD.on \|\| !!PREVIEW`, so the login screen is off too. | Without `PG_CLOUD` the Google sign-in UI, the login screen, the friends panel and invites are never built. The sign-in **code** still sits in game.js; 2.2 cuts it from the Toss copy. |
| Online gate | `netGated() = CLOUD.on && CLOUD.st !== 'in'`. `netHost` / `netJoin` refuse when it is true. `renderFriends` builds the card (`ngBuild` / `ngPaint`, `NG_TX`) under `if (CLOUD.on)`. | Toss adds its own condition and its own card (4.2). |
| Same device | `troDevHash(code)` = FNV-1a of `TRO.s.dev + ':' + code`, sent as `hi.d`. `troPractice()` returns 2 when two seats share one; that becomes `NET.q`. `coinPrac()` is `NET.q !== 0`, so coins are 0. The room shows `연습 경기예요: 같은 기기에서 들어온 친구가 있어요`. | In Toss the key replaces `dev`, so "the same device" becomes "the same Toss account" (4.3). |
| Trophies | `troHostGo` (시작!), `troHostResult` (podium) and the `'tro'` message → `troResultIn` on guests, `troGuestGo`, `troWait`, `stakeNow()`, `troCountSub/Cls`, `troRulesLine`, `troFreeLine`, `troPodiumTag`, `troPodiumUI`, the 트로피 걸기 row in `buildOpts`, the room summary in `renderRoom`, 내 기록's note in `fillRec`. A party already holds no trophies (`troHostGo`'s `G.party` guard, `PARTY_TX.noTro`). | Section 5 switches each of these off at one named site. |
| PWA | `pwaInit` sets `PWA.on` only when a `link[rel="manifest"]` exists. Without it there are no listeners, no 앱으로 설치 pill and no fullscreen button (`pwaSetupDOM`). `orientLock` needs fullscreen or an installed app. | No manifest link in the Toss page, so the whole PWA layer is off by itself. Only the literal `beforeinstallprompt` is cut (2.2). |
| PeerJS | `peerTag()` = "the page has a `<script src*=peerjs>`". `domReady` = `document.readyState === 'complete'`, else set on `DOMContentLoaded`. `peerOpts` hands `window.PG_PEER_OPTIONS` to `PG.Net`. `net.js`: `PEER_PREFIX = 'ppodeuk-'`, no lobby on 'peer'. | Bundled PeerJS has no script tag, and the engine loads after `DOMContentLoaded`. Both checks need a Toss branch (2.5, 14). |
| Layout | `.pg-sa` (deploy) enables the rotate screen (`rotSetup` / `rotSync`) and deploy-only CSS. `fit()` puts `.pg-land` on touch landscape: the header leaves the top, `.pg-tools` (sound, pause) sit **at the top of the right column**, and each thumb column is `>= edge + clamp(0.22 vh, 104, 180)` (`safeInsets()` reads `env()` through a probe). | The top of the right column is exactly where Toss draws 더보기 / X (9.3). |
| Sound | `audio.js` already suspends the context on `visibilitychange` hidden and resumes on return or the next gesture. Mute: `#pg-sound`, the M key, `toggleMute`, persisted in `ppogeul-muted`. | Only the immediacy (a synchronous gain drop), `pagehide` and the SDK events are new (10). |
| Escape / back | `onKeyDown`: Escape is `netFriendsBack` (friends), `closeHub` / `drawSkip` (hub), `closeRec` (rec), `togglePause` (in a game). `#pg-room-leave` → `netLeave('')`. | Android back reuses exactly these (11.2). |
| Room text | `inviteText()` adds `location.href + ?join=` on 'peer'. `renderRoom`'s hint for 'peer': `친구에게 이 게임 링크와 방 코드 … 를 보내 주세요 (코드 복사에 링크도 담겨요)`. | In Toss there is no link to send: code-only texts (3). |
| Solo run | `newGame(i)` sets `PAL.run = (i \| 0) === 0`; `PG.debug.gotoRound` clears it. `gameOver()` → `showOverlay('over')`; the ending → `showOverlay('ending')`. | The leaderboard uses the same "a real run from 탕 1" rule as 친구 순위's best stage (7). |

### 1.2 From Apps in Toss (what this relies on)

Confirmed (docs or the 3.9.0 type file):
- SDK 3.x is required (`@apps-in-toss/web-framework`; latest 3.9.0, 2026-10-22; >= 3.1.0 for the stable origin). It
  brings in `@apps-in-toss/cli` (`ait`). `ait build` does **not** build anything. It packs every file under
  `webBundleDir` (default `dist`, which must contain `index.html`) with `bundle.json` into `<appName>.ait` next to
  `package.json`. The SDK is an ES module with bare imports, so it needs a bundler.
- `apps-in-toss.config.ts`: `defineConfig({ appName, brand: { primaryColor }, permissions, webBundleDir, webView,
  navigationBar })`. `appName` must equal the console's (`ppodeuk-bath`).
- Exports used here: `getUserKeyForGame` (`.isSupported()`; resolves `{type:'HASH', hash}` | `'ERROR'` | `undefined`;
  the docs add `'INVALID_CATEGORY'` outside the game category; Toss app 5.232.0+), `Storage` (`getItem` / `setItem` /
  `removeItem` / `clearItems`, all async), `Screen` (`setOrientation`, `setAwakeMode`, `setIosSwipeBack`, `close`),
  `SafeAreaInsets` (`get()`, `subscribe({onEvent})` → `{top,left,right,bottom}`), `graniteEvent.addEventListener`
  (events `backEvent`, `homeEvent`), `Game` (`setLeaderboardScore({score: string})` → `statusCode` `SUCCESS` |
  `LEADERBOARD_NOT_FOUND` | `PROFILE_NOT_FOUND` | `UNPARSABLE_SCORE`, `openLeaderboard`, `getUserProfile`,
  `subscribeInfoOverlayHidden`), `Analytics` (`screen` / `impression` / `click` / `log`, with **no** `init`),
  `onVisibilityChangedByTransparentServiceWeb` (`onEvent(isVisible)`), `closeView`, `getOperationalEnvironment()`
  (`'toss'` \| `'sandbox'`), `isMinVersionSupported({android, ios})`, `env.getDeploymentId()`.
- Live origin `https://ppodeuk-bath.apps.tossmini.com`, QR test origin `https://ppodeuk-bath.private-apps.tossmini.com`.
  Web storage is per origin, so test data never carries over to live. HTTPS-only and `wss://`-only. No iframes. No
  links that leave the Toss domain (`location.replace`, nested WebViews). No `eval` (the scanner also catches it inside
  third-party libraries). No install prompts. Only Toss login may be used, and Google login is explicitly refused.
- The game checklist: the first screen within 10 s; a sound on/off toggle; sound stops at once in the background and
  comes back on return; the X works; nothing intrudes into the Safe Area (Dynamic Island on the side in landscape);
  no bottom sheet opens by itself on entry; every screen has a way out; Android back goes back or exits; fullscreen;
  the chosen orientation works; responses within 2 s; an exit confirmation; records survive closing and reopening.
- The leaderboard works only after 미니앱 정보 승인 (else `LEADERBOARD_NOT_FOUND`), one per mini-app, game category
  only, Toss app 5.221.0+. It must not be called right at entry.
- QR testing: upload the .ait in 앱 번들, press 토스앱 테스트, scan. Testers must be logged into Toss, **workspace
  members** and **19 or older**. Every upload gets a new `deploymentId` (a new QR). On the phone, 더보기 → 웹 디버그
  툴즈 shows Log / Network / Element.

UNCONFIRMED (each one is a QR-test item in 15.6): whether WebRTC data channels, the PeerJS cloud signalling server and
Metered TURN work inside the Toss WebView (staff only said "WebRTC is not blocked"); whether `env()` Safe Area values
are right inside the WebView; the nav bar's exact size; whether the exit modal fires
`onVisibilityChangedByTransparentServiceWeb`; whether Toss's default Android back at our title exits; the native
`Storage` value size limit; whether the scanner treats
an unused Google-named string as a problem (2.2 removes the API names, not every word).

---

## 2. Build target

```
src/page.html + src/{sprites,levels,audio,net,game}.js ──node build.js──> dist/ (artifact), deploy/ (web)      (unchanged)
                                                       └─node build.js --toss──> toss/index.html
                                                                                 toss/public/pg/{sprites,levels,audio,net,game}.js
toss/  npm run build:  node ../build.js --toss → vite build → node ../tools/check-toss.js --dist dist
                       → ait build → node ../tools/check-toss.js --ait ppodeuk-bath.ait      ⇒  toss/ppodeuk-bath.ait
```

### 2.1 `build.js --toss`: `tossOf()` (**new**)
- The flag: `process.argv.includes('--toss') || process.env.PG_TOSS === '1'`. A flag is needed because PowerShell has
  no `VAR=x cmd`. With it, `PG_PREVIEW` is refused ("--toss and PG_PREVIEW do not mix") and `firebase.config.json` is
  **never read** (`fbConf` null). `dist/`, `deploy/` and the itch zip are written exactly as without it; the flag only
  adds the Toss outputs.
- `tossOf(build)` builds the page from the same pieces as `deployOf`, in this order:
  `<!doctype html>`, `<html lang="ko" class="pg-sa pg-ait">`, charset, the same viewport (`viewport-fit=cover`,
  `user-scalable=no`), `<title>`, description, `<meta name="pg-build" content="BUILD">` (so 웹 디버그 툴즈 shows which
  build runs), `peerTag` (`PG_PEER_OPTIONS`, when `turn.config.json` exists), `<style>${RESET_SA}</style>`, `headRest`
  **without** the two `preconnect` links and `#pg-fontcss` (checked swaps), then
  `<script type="module" src="/src/main.js"></script>`, `</head><body>`, the body of `page.html` with `<!--SCRIPTS-->`
  replaced by nothing, and `</body></html>`.
  Not in it: `SW_REG`, the manifest link, the mobile / apple app metas, apple-touch-icon, og / twitter tags, the
  favicon, the PeerJS CDN tag, `PG_CLOUD`, `FB_HOP`, `PV_STORE`, and the badge.
- `RESET_SA` is `RESET` with `env(safe-area-inset-top,0px)` / `-bottom` replaced by `var(--sa-t)` / `var(--sa-b)`
  (9.2 defines them).
- One fixed text swap in the body, checked: the hidden `#pg-cloud-btn`'s label `구글로 로그인` becomes empty
  (game.js only writes it under `CLOUD.on`), so the Toss DOM names no Google login even hidden. CSS comments
  (`/* … */`) are dropped from the head's `<style>` blocks too: two of page.html's comments describe the Google
  button's styling. (page.html has no `/*` inside a CSS string; `tossOf` checks that before it strips.)
- The engine files: `toss/public/pg/<f>` = the same text the deploy inlines, except `game.js`, which has the cut
  regions of 2.2 removed. A `turn.config.json` is optional, but without it the build prints
  `WARNING toss: turn.config.json 없음 - 다른 네트워크의 친구와는 연결이 안 될 수 있어요 / no TURN relay in the Toss build`.
- Checks, which stop the build: the Toss page has exactly one `<script type="module">` (`/src/main.js`) and no other
  `<script src>`; none of `serviceWorker`, `rel="manifest"`, `PG_CLOUD`, `firebase`, `fonts.googleapis`,
  `fonts.gstatic`, `cdnjs`, `peerjs.min.js`, `location.replace`, `구글`, `Google` (case-sensitive: the lowercase STUN host
  `stun.l.google.com` in `PG_PEER_OPTIONS` is allowed); every pattern of 13's list absent
  from `toss/public/pg/*.js`; the cut markers balanced (2.2). The **artifact and the deploy are checked for no Toss**:
  no `pg-ait`, no `PG_AIT\s*=`, no `@apps-in-toss`.
- Always written (with or without `--toss`, for the tests, in `TMP` only, like `deploy-cloud/`): `TMP/toss/`
  (`index.html` + `pg/*.js`, byte-equal to what `--toss` writes) and `TMP/toss-fx/` (the same page with the module
  entry replaced by `../ait.js`, the fake SDK hook and a boot line, 15.3). It also copies `src/ait.js` to `TMP/ait.js`
  and writes `test-toss.html` (15.2).
- The build hash `BUILD` for the Toss page: sha256 over `tossOf('-')` and the five `pg/` files, 12 hex chars (as
  `deployFilesOf`).
- The final log line gains: `toss/: index.html + pg/*.js (build X, TURN: yes|no)`.

### 2.2 The cut regions (Toss copy of `game.js` only)
Line markers, each on its own line: `// <ait-cut>` … `// </ait-cut>`. `tossOf` removes from the opening marker through
the closing one (both inclusive). Nesting is an error, and so is an unbalanced count. On the artifact and the deploy
the markers are plain comments and nothing is removed. Every region sits **inside a function body**, and no
declaration another function references is removed. Each region is only reachable when `CLOUD.on`, which is never
true in Toss.

| # | Where | What goes | After the cut |
|---|---|---|---|
| 1 | `clOutsideUrl` | the three in-app branches (`kakaotalk://web/openExternal`, LINE's `openExternalBrowser`, Android `intent://…`) | `if (!e.inApp) return url; return '';` |
| 2 | `clOpenOutside` | the `try { if (e.inApp) location.href = url; else window.open(…) }` line | returns the url, navigates nowhere |
| 3 | `clSignInGo` | the `signInWithPopup(clProvider())` line and the `Promise.resolve(p)…` line after it | sets `'auth'` and watches, does nothing else |
| 4 | `clRedirect` | the `signInWithRedirect(clProvider())` line | sets `'auth'` only |
| 5 | top of the auth part | the `const clProvider = …GoogleAuthProvider…` line (only 3 and 4 call it, and they are cut too) | gone |
| 6 | `pwaInit` | the `listen(window, 'beforeinstallprompt', …)` line | (`PWA.on` is false in Toss anyway) |

And two comment rewordings in all builds (no code change): the PWA section's header and `pwaInstall`'s comment say
"the browser's install prompt event" instead of the event's literal name, so the only `beforeinstallprompt` left is
the code line in region 6.

### 2.3 The `toss/` project (**new**, committed)
```
toss/
  package.json            pinned (below), with "private": true; package-lock.json committed
  apps-in-toss.config.ts
  vite.config.js
  src/main.js
  .gitignore              node_modules/  dist/  *.ait  index.html  public/pg/
```
`package.json`:
```json
{
  "name": "ppodeuk-bath-toss",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "pg": "node ../build.js --toss",
    "dev": "npm run pg && vite",
    "build": "npm run pg && vite build && node ../tools/check-toss.js --dist dist && ait build && node ../tools/check-toss.js --ait ppodeuk-bath.ait",
    "deploy": "ait deploy"
  },
  "dependencies": {
    "@apps-in-toss/web-framework": "3.9.0",
    "peerjs": "1.5.4",
    "@fontsource/black-han-sans": "<exact>",
    "@fontsource/gowun-dodum": "<exact>"
  },
  "devDependencies": {
    "vite": "6.3.5",
    "@apps-in-toss/devtools": "<exact>"
  }
}
```
Every version is exact (no `^` / `~`). `<exact>` = the version `npm view <pkg> version` gives on the day of
implementation, written as is and frozen by the lock file. `ait init` is **not** run (it rewrites the build script,
edits the Vite config and adds devtools with a version range). This spec writes its outputs by hand.

`apps-in-toss.config.ts`:
```ts
import { defineConfig } from '@apps-in-toss/web-framework/config';
export default defineConfig({
  appName: 'ppodeuk-bath',                    // = the console's app name, exactly
  brand: { primaryColor: '#0a2327' },         // the page's --bg (the manifest's theme colour); the owner may change it
  permissions: [],                            // nothing: no camera, mic, clipboard permission, location
  webBundleDir: 'dist',
  webView: { bounces: false, pullToRefreshEnabled: false, overScrollMode: 'never', allowsBackForwardNavigationGestures: false },
  navigationBar: { transparentBackground: true },   // the game draws under it (fullscreen); 더보기 / X float on top
});
```
(`mediaPlaybackRequiresUserAction` stays at its default `true`; the engine already unlocks audio on the first tap.
Whether the game nav bar, which shows only 더보기 and X, comes from the console's 게임 category in 3.x is UNCONFIRMED;
`webViewProps.type` no longer exists.)

`vite.config.js`:
```js
import { defineConfig } from 'vite';
import devtools from '@apps-in-toss/devtools/unplugin';
export default defineConfig(({ command }) => ({
  base: './',                                          // relative URLs inside the bundle
  plugins: command === 'serve' ? [devtools.vite()] : [], // the mock SDK panel for `npm run dev` only, never in the .ait
  server: { fs: { allow: ['..'] } },                   // main.js imports ../../src/ait.js
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, assetsInlineLimit: 0, modulePreload: { polyfill: false } },
}));
```

`src/main.js`, the whole entry:
```js
import * as SDK from '@apps-in-toss/web-framework';
import { Peer } from 'peerjs';
import '@fontsource/black-han-sans/400.css';      // font-family "Black Han Sans" (page.html --font-sign)
import '@fontsource/gowun-dodum/400.css';         // font-family "Gowun Dodum"    (page.html --font-body)
import '../../src/ait.js';                        // defines window.PG.Ait (plain script, no imports)
window.Peer = Peer;                               // what PG.Net's 'peer' transport looks for
window.PG.Ait.boot(SDK, { scripts: ['pg/sprites.js', 'pg/levels.js', 'pg/audio.js', 'pg/net.js', 'pg/game.js'] });
```
The fontsource stylesheets carry Google's `unicode-range` slices, so the browser fetches only the slices a screen
uses, from `dist/assets`. If a package's file name differs from `400.css`, the check (13) still requires the two
family names and at least one `.woff2` in `dist/assets`.

### 2.4 `src/ait.js` (**new**): the boot sequence and the bridge
A plain IIFE like the engine files: no `import`, no build step. It defines `window.PG.Ait = { boot, make, store }`.
The Toss entry uses it, and so do the test fixture and `test-toss.html` (with a fake SDK). It is **not** in `ORDER`:
the artifact and the deploy never have it.

`boot(sdk, opts)`:
1. `T0 = performance.now()`; the storage wrapper is installed (8) before anything else. Every step is wrapped so that
   a throwing or missing SDK function never stops the game.
2. Orientation: if `sdk.Screen.setOrientation.isSupported?.()`, call `setOrientation({type:'landscape'})` and do not
   wait more than 800 ms for it. Not supported → nothing; the rotate screen does the asking, as on the web.
3. Safe Area: `apply(sdk.SafeAreaInsets.get())` sets `--sa-t/r/b/l` (px) on `document.documentElement.style`, plus
   `--ait-nav-w` / `--ait-nav-h` from its own `NAV = { w: 96, h: 44 }` (9.3).
   `SafeAreaInsets.subscribe({ onEvent: apply })` follows rotation and the Dynamic Island side; each change also
   dispatches a `resize` event, so `fit()` runs again.
4. Storage: `await store(sdk.Storage, localStorage).load()` with a 3 s cap (section 8).
5. The game key: start `sdk.getUserKeyForGame()` now, **only if** `.isSupported()` (an old app could otherwise show an
   update screen at entry). Do not wait for it. `PG_AIT.key()` hands out the same promise.
6. `window.PG_AIT = make(sdk, store)`, then `Analytics.screen({ log_name: 'title' })` once (the "init").
7. Load `opts.scripts` in order: `<script src>` with `async = false`, appended to `<body>`. `onerror` on any of them
   puts a plain line in the body: `게임을 불러오지 못했어요. 닫고 다시 열어 주세요`.
8. Page lifecycle: `visibilitychange` hidden and `pagehide` → `store.flush()`. `pagehide` → also
   `setOrientation({type:'portrait'})` (best effort, not awaited).
Steps 2 to 5 run in parallel. The engine starts at most about 3 s after `T0`, well inside the 10 s first-screen rule.

`window.PG_AIT` (v 1), the only thing `game.js` ever sees of the SDK:

| Member | Does |
|---|---|
| `v: 1`, `env` | `getOperationalEnvironment()` (`'toss'` / `'sandbox'`), `''` when it throws |
| `key()` | → `Promise<{st:'ok', hash} \| {st:'old'} \| {st:'cat'} \| {st:'err'}>`. `old`: not supported, or `undefined`. `cat`: `'INVALID_CATEGORY'`. `err`: `'ERROR'`, a throw, or a hash that is not a string of 8..512 characters. An `ok` is cached for the page. After `err` a new SDK call is allowed at most every 5 s. One call in flight at a time. |
| `lb.ok()` | `isMinVersionSupported({ android: '5.221.0', ios: '5.221.0' })` |
| `lb.submit(n)` | `Game.setLeaderboardScore({ score: String(n) })` → `'ok'` \| `'nf'` (not found) \| `'np'` (no profile) \| `'bad'` \| `'err'` |
| `lb.open()` | `Game.openLeaderboard()` → `true` / `false` |
| `screen(name)` | `Analytics.screen({ log_name: name })`. The same name as the last one is not sent again. |
| `back(fn)` | `fn` set: one `graniteEvent.addEventListener('backEvent', { onEvent: fn })`, kept until `back(null)` calls its unsubscribe. The same `fn` again: nothing. |
| `play(on)` | Only on a change: `Screen.setAwakeMode({ enabled: on })` and `Screen.setIosSwipeBack({ isEnabled: !on })` (the option names are UNCONFIRMED; take them from the d.ts) |
| `onShow(fn)` | `onVisibilityChangedByTransparentServiceWeb({ options: { callbackId: 'pg' }, onEvent: fn })`. Before calling `fn(false)` the bridge also flushes the store. |
| `insets()`, `nav` | the last `{t, r, b, l}`; `nav` = `NAV` (`{w, h}`, the box reserved for 더보기 / X) |

`make` never exposes the SDK object, and the bridge has no "call anything" member.

### 2.5 What is bundled instead of CDNs
- **PeerJS**: `peerjs@1.5.4` from npm, set as `window.Peer` before the engine. `peerTag()` becomes
  `!!window.PG_AIT || !!document.querySelector('script[src*="peerjs"]')`, and the friends panel's `why` line uses
  `peerTag()` instead of its own `querySelector`. Signalling stays the PeerJS cloud (`wss://0.peerjs.com`, port 443),
  and the host id is `'ppodeuk-t-' + code` (14, `net.js`).
- **TURN**: the same `turn.config.json` → `window.PG_PEER_OPTIONS` as on the deploy. The owner keeps the file
  locally (never committed; CI has it as `TURN_CONFIG`). It should contain Metered's
  `turns:…:443?transport=tcp` entry: it is the one most likely to pass a strict mobile network. The credential is
  readable by anyone who unpacks the .ait, exactly as on the deploy today.
- **Fonts**: `@fontsource/black-han-sans` and `@fontsource/gowun-dodum` (2.3). `setupDOM`'s `#pg-fontcss` media
  switch finds no element and does nothing. `#pg-fontwarm` warms the slices as before.
- **Firebase**: nothing. `PG_CLOUD` is never written into the Toss page, and the check fails on the word `firebase`.
- **`domReady`** in `game.js`: `document.readyState === 'complete' || !!window.PG_AIT`. Under Toss the engine runs
  after `DOMContentLoaded`, and PeerJS is already there.

---

## 3. What the Toss build removes or changes

| Item | Web deploy | Toss | How |
|---|---|---|---|
| Service worker | `SW_REG` in the head, `sw.js` | none | not in `tossOf` |
| Manifest, app metas, icons | yes | none | not in `tossOf` → `PWA.on` false → no 앱으로 설치 pill, no fullscreen button, no `beforeinstallprompt` listener (and its line is cut) |
| `FB_HOP` (`location.replace` to firebaseapp.com) | with config | none | no `fbTag` in `tossOf` |
| Google Fonts links | yes | none | swaps in `tossOf`; fontsource instead |
| PeerJS from cdnjs | yes (SRI) | npm bundle | `main.js` |
| Outside links (`intent://`, `kakaotalk://`, `window.open` to the home page) | under `CLOUD.on` | gone | cut regions 1, 2 |
| Google sign-in (login screen, 내 기록's button, the gate card's button, the SDK) | with config | gone | no `PG_CLOUD` (nothing is built), cut regions 3-5, the label swap |
| 손님은 온라인 불가 (the Google gate) | with config | **game-key gate** | 4.2 |
| Cloud saves, 친구 순위, 친구 초대 | with config | off | no `PG_CLOUD` (section 6) |
| 트로피 걸기, place points, +5, holds, results | battle rooms | off: 친선 경기 | section 5 |
| Room hint (`NET.tr === 'peer'`) | `친구에게 이 게임 링크와 방 코드 C를 보내 주세요 (코드 복사에 링크도 담겨요)` | `친구가 토스에서 뽀득뽀득 목욕탕을 열고 ‘코드로 참여’에 C를 넣으면 돼요` | `renderRoom`, `AIT_TX.hint` |
| `inviteText()` (코드 복사 / share sheet) | code + `location.href?join=` | `뽀득뽀득 목욕탕 같이 해요! 토스에서 뽀득뽀득 목욕탕 → 친구와 하기 → 코드로 참여: C` (no URL) | `AIT.on` branch first in `inviteText` |
| PeerJS id prefix | `ppodeuk-` | `ppodeuk-t-` | `net.js` (14) |
| 내 기록 note | `처음 선물로 트로피 N개를 받았어요! 친구와 배틀할 때 걸어 봐요` / `오늘 트로피 보너스 d/40개 · 목욕도 배틀도 받아요` | `처음 선물로 트로피 N개를 받았어요! 목욕을 끝까지 할수록 늘어요` / `오늘 트로피 보너스 d/40개 · 혼자 하기·같이 하기에서 받아요` | `fillRec` |
| 내 기록 stats | 최고 트로피 · 배틀 · 뽀득 KO · 혼자 최고 점수 | 최고 트로피 · 혼자 최고 점수 (friendly matches record nothing, so 배틀 / 뽀득 KO would stay 0) | `fillRec` hides the 배틀 and 뽀득 KO `dt` / `dd` and puts `is-ait` on the `dl` (2 columns) |
| 내 기록 buttons | 닫기 (+ 구글로 로그인, 친구 순위 with the cloud) | 닫기 + **토스 랭킹** (after the first accepted score, 7) | **new** `#pg-ait-lb`, made by JS only when `AIT.on` |
| Analytics, back, swipe, awake | none | the bridge | 11, 12 |

---

## 4. Identity: the game key

### 4.1 State (`AIT`, **new**, game.js section "v5 앱인토스")
`const AIT = { on, br, st, hash, at, scr, back, play, lb }`:
- `on = !!window.PG_AIT && typeof window.PG_AIT.key === 'function'` (read once at load, like `clInit`)
- `st`: `'off'` (not Toss) | `'wait'` | `'ok'` | `'old'` | `'cat'` | `'err'`
- `hash`: the key, only while `st === 'ok'`
- `at`: the time of the last request; `scr`: the last screen name sent; `lb`: section 7

`aitKey()` is called at boot (after `setupDOM`), when 친구와 하기 opens while `st` is `'err'`, and from the card's
다시 시도 button. It sets `'wait'`, awaits `AIT.br.key()`, stores the answer and, if the friends panel is open, calls
`renderFriends()`. It never runs on a timer.

### 4.2 The online gate (replaces 손님은 온라인 불가 in Toss)
- `netGated()` = `(CLOUD.on && CLOUD.st !== 'in') || (AIT.on && AIT.st !== 'ok')`. `netHost` / `netJoin` already
  refuse on it, and that includes the test API.
- `renderFriends`: its `if (CLOUD.on)` block becomes `if (CLOUD.on || AIT.on)`, using `AIT.on ? aitGateBuild() :
  ngBuild()` and `AIT.on ? aitGatePaint() : ngPaint()` (**new**, the same `.pg-note.pg-net-gate` classes and the same
  place in the card, so the CSS and the fit already work). The card has **no login button**, ever.
- Card texts (`AIT_TX`, top constants block, warmed in `setupDOM` next to `PARTY_TEXT`):

| `st` | Heading | Line | Button |
|---|---|---|---|
| `wait` | `온라인 친구와 하기를 준비하고 있어요` | `토스 정보를 확인하는 중이에요…` | none |
| `old` | `토스 앱을 업데이트하면 온라인으로 할 수 있어요` | `앱스토어나 플레이 스토어에서 토스를 최신 버전으로 바꿔 주세요` | none |
| `cat` | `지금은 온라인 친구와 하기를 쓸 수 없어요` | `곧 열릴 거예요` | none |
| `err` | `토스 정보를 불러오지 못했어요` | `인터넷을 확인하고 다시 시도해 주세요` | `다시 시도` (aria-disabled while waiting, then for 5 s) |

  All four end with a solo line. `NG_TX.solo` (`혼자 하기는 로그인 없이도 바로 할 수 있어요`) names a login that Toss
  does not have, so Toss uses `AIT_TX.solo` = `혼자 하기는 지금 바로 할 수 있어요`. (`old` names stores but does
  not link to them: no outside links.)
- 혼자 하기, the shop, 뽑기 and 내 기록 never wait for the key. The gate is per client: a modified page could skip it.
  There is no server to say otherwise (honest limit, the same as the cloud gate's).

### 4.3 The same Toss account in one room = practice
- `troDevHash(code)` hashes `(AIT.hash ? 't:' + AIT.hash : TRO.s ? TRO.s.dev : '') + ':' + code`. Everything else is
  unchanged: the guest's `hi.d`, the host's own entry in `troPractice()`, the room code salt (a room never learns
  another room's value).
- Effect: one Toss account on two phones (or a stale second WebView) in one room → `troPractice() === 2` →
  `NET.q === 2` → `coinPrac()` → no coins for anyone in that match, and the room says it in Toss words: the battle
  rules line `연습 경기예요: 같은 토스 계정으로 들어온 친구가 있어요` (`AIT_TX.same`), and the party's `coin2`
  `연습 경기예요: 같은 토스 계정으로 들어온 친구가 있어요 · 비누 코인 없음` (`partyRules` takes `AIT_TX.coin2` when
  `AIT.on`).
- The gate makes sure every Toss seat has a key before `netAttach` sends `hi`.

### 4.4 Coins in friendly matches
- Unchanged rules: `coinBattle` / `coinBattleNow` (battle), `coinParty` (party), `coinGive` (soft cap 400 a day, then
  half; the day bonus), practice pays nothing (`NET.q !== 0`). Through 4.3, "practice" in Toss means the same account
  twice. So coins from a friendly match need at least two **different** Toss accounts. Every Toss account is a
  real-name, 19+ account; that is the anti-farm guarantee the Google gate gave on the web.
- `coinRule(q)` keeps its lines (`이기든 지든 비누 코인을 받아요` / `연습 경기라 비누 코인도 없어요`).

### 4.5 What the key is never used for
It is never shown, never put in the DOM, never sent to a peer (only the 6-character FNV of `t:key:code` leaves),
never logged (no console, no `Analytics` parameter), never written to storage, and never used as a nickname. Players
type their own nick as today. `Game.getUserProfile()` (the Toss game nickname) is not used in v1.

---

## 5. Trophies off: friendly matches only (친선 경기)

One predicate: `AIT.on`. The switch sites, each one line:

| # | Site | Change | Effect |
|---|---|---|---|
| 1 | `stakeNow()` | `NET.mode === 'battle' && !AIT.on ? NET.opts.bet \| 0 : 0` | The stake is 0 everywhere: `troCovers`, `troSeatFree`, `canAfford` and `troLowerStake` say "nothing at stake". No 트로피 부족 or 안 걸고 참여 marks. `'bet'` in `netSetOpts` stays 0. |
| 2 | `troHostGo()` | `AIT.on \|\|` added to the early return (next to `G.party`) | no `TRO.match`, no hold, so `troHostResult` returns at its first line and no `'tro'` is ever sent |
| 3 | `troGuestGo(id)` | `if (AIT.on) return;` first | no hold on guests |
| 4 | `troWait(mid)` | `if (AIT.on) return;` first | a guest never waits for a result |
| 5 | `troResultIn(m)` | `if (AIT.on) return;` first | a `'tro'` from anyone (an older or a hostile page) changes nothing |
| 6 | `buildOpts` | the `트로피 걸기` label and its `.pg-bets` row are not made when `AIT.on` (`syncOpts` skips missing rows already) | the host has no stake to choose |
| 7 | `troCountSub` / `troCountCls` | battle, online, `AIT.on`: `NET.q ? '연습 경기 · 비누 코인 없음' : '친선 경기 · 트로피 없음'`, class `' prac'` for both | the countdown's 2 / 1 line |
| 8 | `renderRoom` | rules: in Toss the battle's trophy lines (`troRulesLine`, `troFreeLine`, the +5 line, the 견습 line) become one line: q 0 `친선 경기예요: 트로피는 걸지도 바뀌지도 않아요`, q 2 `AIT_TX.same` (4.3). The coin line and the battle lines follow unchanged. The guest summary's `'트로피 ' + troStakeTxt(stake)` item becomes `친선 경기`. | the room says what happens |
| 9 | `troPodiumTag` / `troPodiumUI` | battle, online, `AIT.on`, not practice: tag `친선 경기` (class `pg-podium-tag is-prac`). Practice keeps `연습`. The note lines about stakes cannot occur (no `TRO.lastRes`). The guest wait line drops its stake part through `stakeNow() === 0`. | the podium |

Stays as it is: the 목욕 보너스 (`troBonus`: solo, and online co-op while `NET.q === 0`; progress only, `RUN_CAP` 30,
`DAY_CAP` 40), the trophy count and leagues on the title badge and 내 기록, the seat chips in the room (a count, not
a stake), and the shop's league locks. A party already holds no trophies (`PARTY_TX.noTro` `트로피는 걸지 않아요`),
so nothing changes there except 4.3's coin line.
Wording rule (사행성): nothing in the Toss build may say 걸기 / 판돈 / 가져요 about trophies. Sites 6 to 9 remove
every such line from what a Toss player can see. The strings stay in `TRO_TEXT` for the font warm-up only.

---

## 6. Cloud saves, 친구 순위, 친구 초대: dropped for v1 (Firestore-free)

The decision: **no Firestore, no Firebase Auth in the Toss build.** `PG_CLOUD` is never written, so `CLOUD.on` stays
false. `PAL`, `IV`, `clBoot`, `clKick` and the rest return at once, as on a deploy without config (that is already
tested: `cloud.js` group 16, `check-cloud`).

Why, and why not Firebase anonymous auth:
- The Firestore rules key everything on `request.auth.uid`. The game key cannot be that uid: it comes from the client
  (anyone could claim anyone's key), and only a server could turn it into a Firebase custom token. A server is ruled
  out, and the documented server-verified path (`appLogin` → mTLS → custom token) needs 사업자 too.
- Anonymous auth would give a uid **per WebView install**, not per Toss account. It dies with the WebView's storage, so
  it gives neither a cross-device save nor a stable friend code. That is what cloud saves are for, so it delivers
  none of the value. A uid in the friends/invite rules would also let one person make unlimited identities (a new
  install = a new uid), which reopens the farming the gate closes.
- Policy risk: whether a hidden anonymous sign-in counts as "another login" is UNCONFIRMED. v1 avoids the question.
- What the checklist asks (records survive closing and reopening) is met by the native Storage mirror (section 8).
  Nothing in v1 is bought, so "purchases survive a device change" does not apply.
- Fewer moving parts for the first QR test: no Firebase authorized domains, no API-key referrers, no extra origins.
v2 path (17): with 사업자, Toss login → a Cloud Function (mTLS) → `createCustomToken('toss:' + userKey)` →
`signInWithCustomToken`; then cloud saves, 친구 순위 and invites come back with the same rules.

---

## 7. Leaderboard

- Score: the **solo run's own `G.score`**, an integer as a string. A run counts when `G.gameMode === 'solo'`,
  `!G.online`, `!G.attract` and `PAL.run` (started at 탕 1: `newGame(0)`; `PG.debug.gotoRound` clears it). Not
  `G.hiscore`: `saveHi` also folds co-op team scores into it.
- When: in `showOverlay` for `'over'` and `'ending'` (the run's end), through `aitLbRun()` (**new**). Never at entry,
  never on a timer, never more than once per run end.
- Kept in `ppogeul-ait-lb` = `{"ok": <last accepted>, "p": <best not yet accepted>}`. It is mirrored like every
  `ppogeul-*` key. `aitLbRun()`: `c = max(G.score, p)`; if `c > ok` and `PG_AIT.lb.ok()`, `submit(c)`:
  - `'ok'` → `ok = c, p = 0`
  - `'nf'` → `p = c`, and no further submission this page load. This is the expected answer **before 미니앱 정보 승인**.
  - `'np'` (no game profile), `'err'` → `p = c`, tried again at the next run end
  - `'bad'` → `p = 0`, `console.warn` once (it would be our bug; the test page counts warnings as failures)
- 토스 랭킹 (`#pg-ait-lb`, `pg-btn pg-ghost`, in 내 기록's button row before 닫기, `aria-label="토스 게임 랭킹 보기"`):
  made only when `AIT.on`, shown only when `ok > 0` (so it never opens an empty or missing board). A tap →
  `Snd.hold(true)` → `PG_AIT.lb.open()`. Opening sends the mini-app to the background, and the sound comes back
  through 10's normal path.
- No in-game message about the leaderboard in v1. The owner checks it on the QR test after approval.

---

## 8. Native Storage adapter (`PG.Ait.store`, in `src/ait.js`)

Why: localStorage inside the WebView can be cleared (WKWebView applies the 7-day script-storage cap; the WebView's
data can be wiped). The native `Storage` survives app restarts and is wiped only with the Toss app. The engine's
reads are synchronous, so localStorage stays the working copy and the native store is the durable mirror.

- **Which keys**: every localStorage key starting with `ppogeul-` (the engine's, `audio.js`'s `ppogeul-muted`, the
  test namespaces' suffixed keys). Nothing else (PeerJS or the SDK may use storage too). Internal keys, never
  mirrored: localStorage `pgait:lseq`; native `pgait:seq` and `pgait:keys` (a JSON list of the mirrored key names,
  since native Storage cannot list keys).
- **The wrapper** (installed in `boot` before anything else runs, `PV_STORE`'s technique): `Storage.prototype.setItem`
  / `removeItem` / `clear` are wrapped. When `this === window.localStorage` and the key matches, the original call
  runs first, then `lseq + 1` is written (with the original setter, so it is not mirrored) and the key is marked
  dirty. Reads are not wrapped.
- **Flush**: one timer, 2 s after the last dirty mark (later marks restart it). Also at once on `visibilitychange`
  hidden, `pagehide` and `onShow(false)`. One flush: `setItem` / `removeItem` for each dirty key, then
  `pgait:keys` if it changed, then **last** `pgait:seq = lseq`, one call after the other. On a failure: one retry 10 s
  later, then nothing until the next write (the checklist: no bridge calls in loops, retries capped). At most one
  flush in flight; marks that arrive meanwhile go to the next one.
- **Boot** (`load()`, capped at 3 s; on timeout the game boots on local data and the mirror goes on from there):
  - `nseq` = native `pgait:seq` (missing = 0), `lseq` = local `pgait:lseq` (missing = 0).
  - `nseq > 0` and (local has no `ppogeul-trophy` **or** `nseq > lseq`) → native wins: every key in `pgait:keys` is
    copied into localStorage (original setters), the local `ppogeul-*` keys that are not in the list are removed, and
    `lseq = nseq`.
  - `lseq > nseq` → local wins: every local `ppogeul-*` key is marked dirty and flushed at once.
  - equal → nothing.
  The seq is written last in every flush. So `nseq` only counts flushes that completed: a write cut off mid-flush
  leaves `lseq > nseq`, and the next boot pushes local again.
- Honest limits: if the bridge needs more than 3 s at boot and the native side was newer, this session's first write
  makes local "newer" and the native copy is replaced. The progress belongs to this device's mini-app storage, not
  to the Toss account (a second Toss account on the same phone sees it; nothing in v1 is per account). QR origin
  and live origin have separate localStorage, but whether native `Storage` is shared between them is UNCONFIRMED. A
  store written by the QR build could then show up live; it is the same player's own data, valid by `troParse`.
- Size: the trophy store is a few KB (`troParse` caps every list). The value limit of native `Storage` is
  UNCONFIRMED; the QR test fills a store (64 items, a 10-draw log) and reopens.

---

## 9. Screen: landscape, Safe Area, the nav bar, layout

### 9.1 Landscape
- At boot: `Screen.setOrientation({type:'landscape'})` (2.4 step 2). It applies to the whole Toss app, so `pagehide`
  sets `'portrait'` again (best effort). Whether Toss restores it on its own after X is UNCONFIRMED (15.6).
- Old Toss apps (< 5.215.0, `isSupported()` false): nothing is called. `.pg-sa`'s rotate screen
  `가로로 돌려 주세요` shows on an upright phone, as on the web. `orientLock` stays inert (no fullscreen, no
  installed app).

### 9.2 Safe Area → CSS
- `page.html`: `:root { --sa-t: env(safe-area-inset-top, 0px); --sa-r: env(safe-area-inset-right, 0px); --sa-b:
  env(safe-area-inset-bottom, 0px); --sa-l: env(safe-area-inset-left, 0px); }`, and **every**
  `env(safe-area-inset-X, 0px)` in page.html (20 today) becomes `var(--sa-X)`. `safeInsets()`'s probe in game.js uses
  the variables too. On the artifact and the deploy the values are the same `env()` as before.
- Toss: the bridge writes the SDK's insets on `<html style>` (they win over `:root`) and keeps them current
  (`SafeAreaInsets.subscribe`). If `get()` throws, nothing is written and `env()` stays.

### 9.3 The nav bar (더보기 + X) and the game's header
- The game nav bar floats over the top-right corner. Its X sits at `right + 10, top + 5` (iOS) / `top + 10`
  (Android) relative to the insets. Its width and height are UNCONFIRMED. One source for both:
  `NAV = { w: 96, h: 44 }` in `src/ait.js` (a box reserved from the top-right inset corner: `right inset + 10 + w`
  wide, `top inset + h` tall). The bridge writes it as `--ait-nav-w` / `--ait-nav-h` and hands it over as
  `PG_AIT.nav`; game.js reads it into `AIT.nav` (`{w: 0, h: 0}` outside Toss), so the CSS and `fit()` agree. The QR
  test measures the real capsule (웹 디버그 툴즈 → Element, or a screenshot) and the two numbers are corrected in
  `src/ait.js`.
- CSS (`/* v5 앱인토스 */`, page.html, all under `html.pg-ait`):
  - `.pg-ait #pg-head { padding-right: calc(var(--sa-r) + 10px + var(--ait-nav-w)); }`: the header row (panels
    open, upright tablets) keeps its sound / pause buttons left of the capsule.
  - `.pg-ait .pg-land:not(.pg-panel-open) #pg-head { padding-right: max(8px, var(--sa-r)); }` and
    `.pg-ait .pg-land:not(.pg-panel-open) .pg-tools { margin-top: calc(var(--ait-nav-h) + 4px); }`: in the
    landscape game layout the tools stay at the top of the right column, **below** the capsule.
- `fit()`: in the column layout each thumb column is at least
  `max(edge + clamp(round(vh * 0.22), 104, 180), AIT.on ? ins.r + 10 + AIT.nav.w + 4 : 0)`, so the capsule never
  lies over the game screen. (On a 932x430 phone with 59 px insets the old minimum, 163, is 2 px short of 165.)
- Nothing else in the top-right strip: the full-stage panels sit inside `#pg-screen`, below the header row.

### 9.4 Mobile layout targets (checked in 15.4)
Landscape CSS px, insets `l/r/b`: 640x360 (0), 667x375 (iPhone SE, 0), 844x390 (47/47/21), 932x430 (59/59/21),
915x412 (Android, 0; top 24 when the status bar shows), 1180x820 (iPad, bottom 20). On each: no horizontal scroll;
every visible button, input and link outside the capsule box and inside the Safe Area; the game screen inside the
Safe Area; the stick zone and 점프 / 거품 inside their columns; tap targets >= 32 px. Plus the old-app case (upright
390x844 with the orientation unsupported) → the rotate screen.

---

## 10. Sound

- The toggle: the existing `#pg-sound` (header, or the top of the right column in landscape: 9.3) and the M key.
  It is on the title, in play, in the menus and the panels. The state is saved in `ppogeul-muted` (mirrored).
- **New** in `audio.js`: `hold(on)` in `PG.Audio`. With `on` true: `master.gain` set to 0 at `currentTime` at once
  (synchronous, so no sound slips out while `suspend()` is pending), then `ctx.suspend()`. With `on` false: if
  `!document.hidden`, `resume()` and the gain back to `MASTER_VOL` (0 if muted). `Snd.hold(on)` in game.js calls it.
- When: `visibilitychange` hidden → `hold(true)` (beside the existing suspend), visible → `hold(false)`;
  `pagehide` → `hold(true)`; `PG_AIT.onShow(false / true)` (an overlay such as the exit modal or the game profile;
  that it fires there is UNCONFIRMED) → `hold`, and `false` also pauses an offline game (`pauseGame()`, as the hidden
  page does today); before `lb.open()` → `hold(true)`.
- The silent switch: no `navigator.audioSession` change. Web Audio follows the switch in WebKit, which is the
  expected behaviour for a game. The game works the same with sound off. Haptics: none in v1.

---

## 11. Exit: the X, Android back, iOS swipe back

### 11.1 The X and the exit modal
The game nav bar's X shows Toss's exit confirmation by itself (SDK >= 2.9.2). The game adds no modal of its own.
While the modal shows, 10's `onShow(false)` pauses an offline game and silences it. If the player confirms, the
WebView closes: `pagehide` flushes the store (best effort; it was flushed 2 s after the last write anyway and when
the modal opened) and asks for portrait.

### 11.2 Android back (`graniteEvent` `backEvent`)
`aitSync()` (**new**), called at the end of `showOverlay` and `toTitle`: `PG_AIT.back(atRoot ? null : aitBack)`, where
`atRoot` = `shownOverlay === 'title' && G.mode === 'title' && !G.menuOpen`. At the bare title no listener is set, so
Toss's own back handling exits (UNCONFIRMED that it does; if not, `aitBack` at the root calls
`closeView()` and the root listener stays on). `aitBack()` does what Escape does:

| Where | Back does |
|---|---|
| `friends` | `netFriendsBack()` |
| `room` | `netLeave('')` (as `#pg-room-leave`) |
| `hub` | `HUB.draw.anim ? drawSkip() : closeHub()` |
| `rec` | `closeRec()` |
| a game (`playing`, `dying`, `transition`, `countdown`, `card`, `result`) | `pauseGame()` (online: opens the menu) |
| `paused` / the online menu | `resumeGame()` |
| `over` / `ending` | `toTitle()` |
| `podium` | a press of `#pg-podium-lobby` (로비로, with its existing `confirmTwice`: the first back arms it, the second leaves) |

### 11.3 iOS swipe back and the screen staying on
`aitSync()` also calls `PG_AIT.play(inGame)` (`inGame` = `G.mode` is one of the game modes above, or `'paused'`).
The bridge acts only on a change: during a game the screen stays awake and iOS's edge swipe is off (the joystick
lives at the left edge in landscape, and a swipe there would leave the mini-app mid-run). In the menus both are back
to normal. Every screen keeps the X as its way out.

---

## 12. Analytics

- 3.9.0 has no init function. The bridge's first `Analytics.screen({ log_name: 'title' })` at boot is the "init". The
  QR test checks whether the console shows it (UNCONFIRMED for QR builds).
- `aitScreen()` (**new**, in `showOverlay`, deduplicated in the bridge): the log names are `title`, `solo`, `coop`,
  `battle`, `party` (when a game starts: `showOverlay(null)` with `G.gameMode` / `G.party`), `friends`, `room`,
  `hub`, `rec`, `over`, `ending` and `podium`. No parameters other than `log_name`: no key, no nick, no score.
  About 10 to 30 calls in a session, far below 3,000 a minute.

---

## 13. The eval scanner and the bundle check

What the source contains today (grep of the five engine files + page.html, 2026-10-27): `eval(` 0, `new Function`
0, `Function(` 0, string `setTimeout` / `setInterval` 0, `document.write` 0, `javascript:` 0, `location.replace` 0,
`firebase` 0. In game.js: `location.href` 3 (two reads; the one write is in cut region 2), `window.open` 1 (region 2),
`intent:` / `kakaotalk` 1 each (region 1), `beforeinstallprompt` 3 (one listener: region 6; two comments: reworded),
`innerHTML` 5 (static strings, no outside data), `location.reload` 1 (the 새로고침 button, same origin). page.html:
the Google Fonts URLs (removed by `tossOf`). net.js: one `http://localhost` in a comment.
The libraries (`@apps-in-toss/web-framework` and its dependencies, `peerjs` and its dependencies, fontsource CSS) are
**not yet scanned**: the first `npm run build` does it through `check-toss`, before anything is uploaded.

`tools/check-toss.js` (**new**, node, no dependencies):
- `--static` (part of `run-all`, needs no npm): `TMP/toss/` has exactly what 2.1 says. The five `pg/` files equal the
  deploy's inline scripts (game.js after the cuts), and the cut markers are balanced in `src/game.js`.
- `--dist <dir>` (inside `npm run build`, after `vite build`): every `.html`, `.js` and `.css` file under `dist/`,
  read as text (comments included, because the scanner reportedly flags comments too). It fails on:
  `/\beval\s*\(/`, `/\bnew\s+Function\s*\(/`, `/(?<![\w$.])Function\s*\(\s*["'`]/`,
  `/\bset(?:Timeout|Interval)\s*\(\s*["'`]/`, `/document\.write\s*\(/`, `/location\.replace\s*\(/`,
  `/\bintent:\/\//`, `/kakaotalk:\/\//`, `/beforeinstallprompt/`, `/serviceWorker\s*\.\s*register/`, `/firebase/i`,
  `/GoogleAuthProvider|signInWith(?:Popup|Redirect)/`, `/fonts\.(?:googleapis|gstatic)\.com/`,
  `/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|esm\.sh/`, `/PG_CLOUD\s*=|PG_PREVIEW\s*=/`, and in `.html`:
  `/<iframe/i`, `/<link\b[^>]*rel=["']?manifest/i`, any `<script src` that is not `./assets/…`. Each hit prints the
  file, the pattern and 60 characters around it.
  **Hosts**: every `https?://` and `wss?://` host in those files (and every `stun:` / `turn:` / `turns:` host) must be
  in the check's own allowlist: `0.peerjs.com`
  (PeerJS signalling), the hosts of `turn.config.json`, `stun.l.google.com` (the STUN entry `build.js` adds),
  `localhost` (the net.js comment), and the hosts the SDK bundle names, **each added by hand with a comment** after
  someone has looked at it. Any other host fails.
  Also: `dist/index.html` at the top; `dist/pg/` has the five files, byte-equal to `TMP/toss/pg/`; `dist/assets`
  has `.woff2` files and CSS naming `Black Han Sans` and `Gowun Dodum`; no `.map`, no `sw.js`, no
  `manifest.webmanifest`; total size < 100 MB (a warning above 20 MB).
- `--ait <file>`: the .ait exists, is newer than `dist/index.html` and is < 100 MB. It prints
  `CHECK-TOSS OK: ppodeuk-bath.ait <size> KB, build <BUILD>`. (The .ait packs `dist/` as is, so the dist scan is the
  .ait scan. Opening the .ait's format is not needed.)
- A hit inside a **third-party** file is not patched. It is written down here with the package and version. Then:
  pick another version, or drop the dependency (fontsource is optional: the fonts could be self-hosted by hand), or,
  for the SDK itself, ask Toss on 채널톡 (staff have approved scanner false positives by hand).

---

## 14. Code placement checklist

| File | Change |
|---|---|
| `src/ait.js` | **new**: `PG.Ait = { boot, make, store }` (2.4, 8) |
| `src/game.js`, top constants | `AIT_TX` (every Korean line of 3, 4, 5, 7) next to `PARTY_TX`; `AIT_TEXT` = their joined values, warmed in `setupDOM` with the others |
| `src/game.js`, section "v5 앱인토스" (**new**, after "v4 friends", before "attract-mode autopilot") | `AIT`, `aitKey`, `aitGateBuild`, `aitGatePaint`, `aitLbRun`, `aitLbBtn`, `aitBack`, `aitSync`, `aitScreen`, and `PG.debug.ait` = `aitDebugApi()` like `troDebugApi()` (`state()` → `{on, st, hasKey, lb, back, play, scr}`: never the key itself) |
| `src/game.js`, hooks (one line each) | `boot` → `aitKey()` after `setupDOM`; `showOverlay` → `aitSync(); aitScreen();` and for `'over'` / `'ending'` `aitLbRun()`; `toTitle` → `aitSync()`; `fillRec` → the Toss note lines, the hidden stats, `aitLbBtn()`; `renderFriends` → 4.2; `netGated`; `troDevHash`; `peerTag`; `domReady`; `fit` (9.3); `safeInsets` probe (9.2); `inviteText` and the room hint (3); the nine trophy sites (5); `partyRules` coin2; `Snd.hold`; the `visibilitychange` / `pagehide` listeners → `Snd.hold`; `PG_AIT.onShow` subscribed in the AIT section's init |
| `src/game.js`, cut markers | regions 1 to 6 (2.2) and the two reworded comments |
| `src/audio.js` | `hold(on)` in `PG.Audio`, and `pagehide` → hold |
| `src/net.js` | `const PEER_PREFIX = W.PG_AIT ? 'ppodeuk-t-' : 'ppodeuk-';` plus a header line saying why. The code check (`CODE_RE`), the reroll on `unavailable-id` and the rest do not change. |
| `src/page.html` | `--sa-*` on `:root`, the 20 `env()` → `var()`, the `/* v5 앱인토스 */` block (9.3) |
| `build.js` | `--toss` / `PG_TOSS`, `tossOf`, `RESET_SA`, the cuts, the checks, the `TMP/toss/`, `TMP/toss-fx/`, `TMP/ait.js` and `test-toss.html` outputs, the "no Toss in the artifact / deploy" checks; header comment |
| `toss/` | **new** (2.3) |
| `tools/check-toss.js` | **new** (13) |
| `tools/run-all.js` | jobs `check-toss` (node, `--static`), `toss` (virtual time), `toss-net` (rt), `toss-fit-*` (cdp) (15.5) |
| `tools/check-pages.js` | the artifact and deploy have no `pg-ait` / `PG_AIT=` / `ait.js` |
| `src/tests/toss.js`, `src/tests/toss-fake.js`, `src/tests/toss-net.js` | **new** (15) |
| `toss/.gitignore` | `node_modules/`, `dist/`, `*.ait`, `index.html`, `public/pg/` (2.3); the root `.gitignore` is unchanged |
| `README.md` | one paragraph: the Toss build and where this spec is |

---

## 15. Test plan (one suite run at the end; headless Chrome always with `--mute-audio`)

### 15.1 `check-toss --static` (node, every run)
Section 13's static part, plus: `tossOf` without `turn.config.json` has no `PG_PEER_OPTIONS`, and with a test config
it has exactly one. A bad marker layout (an opener without a closer, nesting) stops `build.js` with its message: tried
on a copy of the repo built with `PG_BUILD_TEMP`, the way `check-cloud` builds its copy.

### 15.2 `src/tests/toss.js` (virtual time, offline, one page)
`test-toss.html` = the Toss page shape (`pg-sa pg-ait`, the Toss head, no CDNs) with `src/tests/toss-fake.js` and
`src/ait.js` inline in the head and a boot line `PG.Ait.boot(FAKE, { scripts: [...pg files, the driver] })`. The pg
files are loaded from `TMP/toss/pg/` (a classic `src` works on `file://`). `toss-fake.js` is a fake SDK with exactly
the members of 1.2. Every call is logged as `[name, args]`. The answers can be scripted per call: a value, an error,
"never", or a delay in ms (virtual time). The default answers settle without timers. `FAKE.storage` is a map. The
mocked `PG_AIT` is therefore the **real** bridge over a fake SDK, so the bridge's own logic is tested too.
Prints `TOSS PASS|FAIL <name>` and `TOSS DONE pass=N fail=M`.
- **T1 boot**: the first SDK calls come before the engine's first `localStorage` read (the log order); landscape
  asked once; `--sa-*` equal the fake insets, and `--ait-nav-*` are set; `screen('title')` once; `PG_AIT` exists when
  game.js runs (`PG.debug.ait.state().on`). Not present: `#pg-login`, `#pg-net-gate-go`, a visible `#pg-cloud-btn`
  (its text is empty), `#pg-install`, `#pg-fs`, `#pg-pal-btn`; `CLOUD.on` false. 0 `fetch`, `XMLHttpRequest`,
  `WebSocket` (spies). No visible element contains `구글` or `Google` in any scene of this test.
- **T2 storage**: empty both sides → the gift store, native gets it about 2 s after the first write (virtual time),
  with `pgait:seq === lseq`; local wiped + native full → the restored store is what `troLoad` reads (`TRO.s.t`, coins,
  items, hiscore, nick, mute); `lseq > nseq` → pushed at boot; native slow ("never") → the engine boots at 3 s on
  local data; a failing `setItem` → exactly one retry 10 s later, then nothing until the next write; `visibilitychange`
  hidden flushes at once; non-`ppogeul-` keys never reach native; a flush interrupted before its seq write → the next
  boot pushes local.
- **T3 the gate**: `wait` (the key "never" answers) → the card's `wait` lines, 방 만들기 / 참여 off,
  hosting and joining through `PG.debug.mp` refused; `ok` → the panel as usual; `isSupported` false → `old`, **no**
  `getUserKeyForGame` call at all; `'ERROR'` → `err` + 다시 시도: one SDK call per tap, at most every 5 s;
  `'INVALID_CATEGORY'` → `cat`; 혼자 하기 starts in every state; the key never shows up in the DOM, in
  `PG.debug.ait.state()`, in the `hi` message (`d` is 6 base-36 characters and differs from the key's FNV with
  another code) or in any `Analytics` argument.
- **T4 trophies off** (through `PG.debug.tro` / `PG.debug.mp`, like `trophies.js`): `stakeNow()` 0 with `opts.bet` 20;
  `troHostGo` makes no `TRO.match`; `troResultIn` with a valid-looking `'tro'` changes nothing (the store JSON is
  byte-equal); `troCountSub()` gives both Toss lines; the room's rules and summary lines (5, #8) match verbatim; the
  stake row is absent in the host's options; the podium tag is `친선 경기`; `troDevHash` with two equal keys →
  `troPractice() === 2` and `coinPrac()`; different keys → 0; `partyRules(2)` takes `AIT_TX.coin2`; the 목욕 보너스
  still pays in solo.
- **T5 leaderboard**: a solo run from 탕 1 to game over → one `setLeaderboardScore({score: '<n>'})`; `nf` → `p` kept,
  no second call this page load, 토스 랭킹 hidden; next page load, `SUCCESS` → `ok = n`, the button shows and opens
  (`hold(true)` before `openLeaderboard`); a lower run → no call; co-op, the demo, `PG.debug.gotoRound` and online →
  no call; `lb.ok()` false → no call.
- **T6 back, play, sound, screen logs**: at the bare title `back(null)`; each row of 11.2 calls the named function
  (spied); `play(true)` once at 시작! and `play(false)` once at the title; `onShow(false)` pauses solo play and
  `PG.Audio._state().ctxState` is `'suspended'` at the next frame; `hold` keeps the M-key mute after `hold(false)`;
  screen names in the order of a scripted session (title → solo → over → title → friends → room …), each once.

### 15.3 `src/tests/toss-net.js` (real time, 2 iframes of `TMP/toss-fx/` over `bc`, like `party-net.js`)
The parent hands each frame a fake SDK with its own key (`?k=A` / `?k=B`). `TRO.allowBc` and `CO.allowBc` are on, so
tabs count as real players for this test. A 2-player battle to the podium with keys A / B: no `'tro'` message (a
message spy), both trophy stores unchanged in `t / w / g / ko / de / esc`, coins paid as `coinBattleNow` says, the
countdown line `친선 경기 · 트로피 없음`, the tag `친선 경기`. The same with keys A / A: `연습 경기 · 비누 코인 없음`,
`AIT_TX.same` in the rules, coins 0. A 2-player party with A / B: coins paid, no trophies. The host id starts with
`ppodeuk-t-` (the 'peer' prefix is checked as a pure call, because `bc` does not use it). Prints `TOSSNET DONE`.

### 15.4 Fit (`cdp`, mobile emulation, `PG_CDP_INSETS`)
`test-toss.html#shot=<scene>&ins=l,r,b,t`. The fake insets equal the emulated ones. Scenes: `title`, `play` (the
touch controls), `pause`, `gate-wait`, `gate-err`, `friends`, `room` (host, 4 seats, battle rules), `count` (the
friendly countdown), `podium`, `over`, `hub`, `rec` (with 토스 랭킹), `rot` (upright, orientation unsupported). Each
at the 9.4 sizes. The asserts of 9.4 use `getBoundingClientRect`, with the capsule box from `PG_AIT.nav`. A failure
prints `TOSS FIT FAIL <scene> <w>x<h> <element> <rect>` and takes a screenshot; a pass takes none.

### 15.5 `run-all` and CI
New jobs: `check-toss` (node), `toss` (virtual time, 60 s budget), `toss-net` (rt, serial) and
`toss-fit-<scene>-<w>` (cdp; only `title`, `play`, `room` and `rec` at all six sizes, the rest at 844 and 640). Every
existing job must still pass: the artifact, deploy, preview and cloud fixtures must not change apart from the
`--sa-*` variables (`check-pages`, `pwa`, `cloud`, `touch-*`). CI (`pr.yml`) gets `check-toss --static` through
`run-all`. The npm part (`npm run build` in `toss/`) runs on the owner's PC only in v1.

### 15.6 What only the QR test on real phones can show (one iPhone and one Android at least; the owner + friends)
1. **WebRTC in the Toss WebView**: PeerJS signalling (`wss://0.peerjs.com`), a DataChannel, and Metered TURN
   (`turns:…:443`). Rooms with 2, 3 and 4 phones in 같이 하기, 배틀 and 파티; Wi-Fi ↔ cellular; two different home
   networks. If no direct connection works, the relay must. 웹 디버그 툴즈 → Network shows only peerjs / TURN /
   SDK traffic.
2. Landscape locks at entry, the game is fullscreen, and Toss is upright again after X. An old Toss app (if one is
   at hand) shows the rotate screen.
3. Real Safe Area (iPhone notch and Dynamic Island on either side, Android cutouts) and the **real capsule size**.
   Correct `NAV` in `src/ait.js` afterwards; no game button under 더보기 / X.
4. X → the exit modal appears; the game pauses and is silent under it; confirming closes the game.
5. Android back on every row of 11.2; at the title it exits (or 11.2's fallback is needed).
6. iOS: the edge swipe does not leave mid-game; it does at the title. The screen does not dim during a game.
7. Sound: the toggle; silence **at once** on home / app switcher / lock / an incoming call, and sound back on return;
   the silent switch.
8. Storage: play (coins, a purchase, a hiscore), close with X, reopen → everything is there; the same after
   force-quitting Toss. A full store (64 items, a 10-draw log) survives.
9. The game key: online opens for a workspace member; two phones logged into the **same** Toss account in one room →
   연습 경기 lines, no coins.
10. Leaderboard: before approval no button and no error; after approval (later) a run end submits and 토스 랭킹
    opens with the sound paused.
11. First screen in under 10 s on the slowest phone at hand; the Korean fonts show without a network font request.
12. 코드 복사 and the share sheet work inside the WebView (if `navigator.clipboard` is refused, the code is selected
    for copying by hand, as today).
13. 웹 디버그 툴즈 → Log: no errors from boot to a finished online match.
14. Whether `Analytics` screens appear in the console for a QR build.

---

## 16. What the OWNER does

One time:
1. Console (apps-in-toss.toss.im) → the workspace → the mini-app **ppodeuk-bath**: check that the category is **게임**
   (not 웹보드). The game key and the leaderboard only work in the game category.
2. Workspace → 멤버: invite the friends who will test. Each needs a Toss account, 19 or older, logged into the Toss
   app on their phone. Only workspace members can open the QR build.
3. Put `turn.config.json` into the `bogeul` folder: Metered's "ICE Servers Array", pasted as it is (the same text as
   the GitHub secret `TURN_CONFIG`). Never commit it. Without it the build warns, and phones on different networks
   may not connect.
4. In PowerShell: `cd "C:\Users\뽀숑\OneDrive\바탕 화면\미니게임\bogeul\toss"` then `npm ci` (installs the pinned
   packages from the lock file; Node 24 is fine).

Every build to test:
5. In the same folder: `npm run build`. It must end with `CHECK-TOSS OK: ppodeuk-bath.ait …`. If a check fails, the
   build stops and nothing should be uploaded.
6. Console → ppodeuk-bath → **앱 번들** → upload `toss\ppodeuk-bath.ait`. (Or: once `npx ait token add` with the API
   key from workspace → 키, then `npm run deploy -- -m "메모"`.)
7. Press **토스앱 테스트**. A QR code appears. Scan it with the phone's camera; it opens the build in Toss
   (`intoss-private://…`). Every upload has its own QR.
8. Go through 15.6 with the friends (each scans the same QR, then 친구와 하기 → 방 만들기 / 코드로 참여). For
   problems: in the game, 더보기 → **웹 디버그 툴즈** (Log, Network, Element). Send the Log tab's lines and a
   screenshot back.
9. Not now: 검토 요청. It needs the GRAC rating, the listing (names, icon 600x600, thumbnail 1932x828, screenshots)
   and at least one finished QR test, and it is researched separately.

---

## 17. Out of scope (later)
- Toss login (`appLogin`) + a Cloud Function with the mTLS certificate → Firebase custom tokens: cloud saves,
  친구 순위, 친구 초대 and trophy stakes on server-verified accounts. Needs 사업자 and probably Firebase Blaze.
- `getTossShareLink` + `share` room invites (`intoss://ppodeuk-bath?join=CODE`: only after launch).
- IAP, ads, promotions (all need 사업자). Haptics. `Game.getUserProfile` nicknames.
- Per-account local progress on a shared phone (8's honest limit).
- The GRAC rating, the console listing, 검토 요청, 출시.

## 18. Risks and open questions
1. **WebRTC inside the WebView** is the largest unknown. If DataChannels or TURN fail on one platform, v1 still ships
   solo, and the friends panel would need a Toss line saying online is not available there (a follow-up, after
   15.6.1).
2. The capsule size and the default back behaviour are guesses until the QR test (9.3, 11.2).
3. The eval scan of the SDK and PeerJS has not run yet (13). A hit in the SDK itself needs Toss's help.
4. Dead strings that name Google (`LG_TX`, `CL_BTN`, `NG_TX`, `GOOGLE_G`) stay in the Toss copy of game.js. No code
   path can show them, and no sign-in API is left, but a reviewer reading the bundle sees the words. If review asks,
   cut those constants' values too (each becomes `''`), with the same markers.
5. The 3 s storage cap can lose a newer native copy on a very slow bridge (8).
6. 뽑기 (capsule draws with earned coins, never money) is not a payment, but reviewers or the rating may still look at
   it under 사행성. That is for the rating research; nothing in v1 changes it.
7. The client-side gate and the same-account check can be bypassed by a modified page; without a server, nothing
   stronger exists. The stakes are gone, so the gain from cheating is only coins.
